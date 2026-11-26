'use strict';
// Storage/error-path regression tests. Minimal DOM stubs; not a browser/layout test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('./model.js');

function boot(options = {}) {
  const events = {}, elements = new Map(), writes = [], downloads = [];
  let stored = options.raw ?? null;
  const flags = { readError: !!options.readError, writeError: !!options.writeError };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, textContent: '', innerHTML: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}
    });
    return elements.get(id);
  }
  const document = {
    body: { classList: { toggle() {} }, appendChild() {} }, visibilityState: 'visible',
    querySelector(selector) { return selector.startsWith('#') ? element(selector) : null; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { events[type] = fn; },
    createElement() { return { click() { downloads[downloads.length - 1].name = this.download; }, remove() {} }; }
  };
  const context = vm.createContext({
    document, navigator: {}, location: { protocol: 'file:' }, Blob,
    URL: { createObjectURL(blob) { downloads.push({ blob }); return 'blob:test'; }, revokeObjectURL() {} },
    localStorage: {
      getItem() { if (flags.readError) throw Error('Read denied'); return stored; },
      setItem(key, value) { writes.push({ key, value }); if (flags.writeError) throw Error('Quota exceeded'); stored = value; }
    },
    setInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, confirm() { return true; },
    addEventListener() {}, scrollTo() {}
  });
  context.window = context;
  for (const file of ['logic.js', 'model.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  return {
    flags, writes, downloads, events, elements, stored: () => stored,
    click(action) {
      const button = { dataset: { act: action }, disabled: false, hasAttribute() { return false; } };
      events.click({ target: { closest() { return button; } } });
    },
    async import(raw) {
      await events.change({ target: { id: 'import-json', value: 'test.json', matches() { return false; },
        files: [{ async text() { return raw; } }] } });
    }
  };
}

test('invalid saved JSON and invalid shapes remain untouched', () => {
  for (const raw of [
    '{', 'null',
    JSON.stringify({ version: 5, history: [{ id: 'valuable' }], sessions: {} }),
    JSON.stringify({ tm: [], sessions: [], history: [] }),
    JSON.stringify({ tm: {}, sessions: {}, history: [null] })
  ]) {
    const app = boot({ raw });
    assert.equal(app.writes.length, 0, 'Invalid saved data must not trigger a write');
    assert.equal(app.stored(), raw);
    assert.equal(app.elements.get('#storage-banner').hidden, false);
    assert.match(app.elements.get('#storage-banner').textContent, /덮어쓰지 않았습니다/);
  }
});

test('storage read denial leaves the old value untouched and keeps a visible warning', () => {
  const raw = JSON.stringify(M.DEFAULT), app = boot({ raw, readError: true });
  assert.equal(app.writes.length, 0);
  assert.equal(app.stored(), raw);
  assert.equal(app.elements.get('#storage-banner').hidden, false);
});

test('recovery export retains the exact original invalid JSON bytes', async () => {
  const raw = '{ "history": ["retain original whitespace"] '; // Deliberately incomplete JSON.
  const app = boot({ raw });
  app.click('export-json');
  assert.match(app.downloads[0].name, /^531_train_recovery_/);
  assert.equal(await app.downloads[0].blob.text(), raw);
  assert.equal(app.writes.length, 0);
});

test('quota errors stay visible and completion does not falsely announce a successful save', async () => {
  const raw = JSON.stringify(M.DEFAULT), app = boot({ raw, writeError: true });
  assert.equal(app.stored(), raw);
  assert.equal(app.elements.get('#storage-banner').hidden, false);
  assert.match(app.elements.get('#storage-banner').textContent, /저장 실패/);
  app.click('complete');
  assert.equal(app.stored(), raw);
  assert.match(app.elements.get('#toast').textContent, /저장 실패/);
  app.click('export-json');
  const backup = JSON.parse(await app.downloads[0].blob.text());
  assert.equal(backup.history.length, 1, 'Unsaved working data remains available for export');
});

test('invalid imports are rejected before replacing existing saved data', async () => {
  const state = M.clone(M.DEFAULT);
  state.history.push({ id: 'retain-this-record', day: 'bench', timestamp: 1 });
  const app = boot({ raw: JSON.stringify(state) });
  const saved = app.stored(), count = app.writes.length;
  await app.import(JSON.stringify({ tm: [], sessions: [], history: [] }));
  assert.equal(app.stored(), saved);
  assert.equal(app.writes.length, count);
  assert.match(app.elements.get('#toast').textContent, /파일 형식/);
});

test('a successful later save clears the persistent write warning', () => {
  const app = boot({ writeError: true });
  assert.equal(app.elements.get('#storage-banner').hidden, false);
  app.flags.writeError = false;
  app.click('session-toggle');
  assert.equal(app.elements.get('#storage-banner').hidden, true);
  assert.equal(JSON.parse(app.stored()).version, 6);
});
