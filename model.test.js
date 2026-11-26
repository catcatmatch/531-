'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const fresh = () => M.clone(M.DEFAULT);

test('default records are independent and goals require user input', () => {
  const a = fresh(), b = fresh();
  a.tm.press = 65;
  assert.equal(b.tm.press, 52.5);
  assert.deepEqual(M.weekPullups(b), { total: 0, goal: null, remaining: null, done: false });
  assert.equal(M.getSession(a, 'unknown', true), null);
});

test('v5 Awesome migration preserves exact historical data and every TM', () => {
  const raw = { version: 5, mode: 'awesome', cycle: 7, week: 3, tm: { squat: 127.5, bench: 82.5, dead: 135, press: 65 },
    settings: { sound: false, assistanceStyle: 'full' },
    sessions: { '7.3.awesome-mon': { day: 'awesome-mon', actual: { primary_main2: 8 }, notes: '원본' } },
    history: [{ id: 'old', mode: 'awesome', summary: { last: '보존' }, assistanceEntries: { pull: { exerciseId: 'inverted', actualReps: [8, 7, 6] } } }],
    lastAssistance: { inverted: { reps: [8, 7, 6], kg: 0 } }, timer: { endAt: 123 } };
  const copy = M.clone(raw), state = M.migrateState(raw);
  assert.deepEqual(raw, copy);
  assert.deepEqual(state.tm, raw.tm);
  assert.deepEqual(state.history, raw.history);
  assert.deepEqual(state.sessions, raw.sessions);
  assert.deepEqual(state.lastAssistance, raw.lastAssistance);
  assert.equal(state.settings.sound, false);
  assert.equal(state.mode, '351');
  assert.equal(state.week, 1);
  assert.equal(state.cycle, 1);
  assert.equal(state.timer, null);
});

test('v5 classical migration retains current main sets without reusing old Joker completions', () => {
  const old = { day: 'squat', mode: '351', cycle: 2, week: 2,
    tm: { squat: 125, bench: 82.5, dead: 135, press: 65 },
    actual: { main0: 5, main1: 5, main2: 5, joker: 1, assist0: 2 },
    checked: { main0: true, main1: true, main2: true, joker: true },
    choice: 'joker', elapsedMs: 35000, runningSince: null, completedAt: 12345 };
  const raw = { ...fresh(), version: 5, cycle: 2, week: 2, sessions: { '2.2.squat': old }, history: [{ id: 'old', actual: old.actual }] };
  const state = M.migrateState(raw), session = M.getSession(state, 'squat');
  assert.deepEqual(state.sessions['2.2.squat'], old);
  assert.deepEqual(state.history, raw.history);
  assert.deepEqual(session.actual, { main0: 5, main1: 5, main2: 5 });
  assert.equal(session.choice, 'skip');
  assert.equal(session.tm.squat, 125);
  assert.equal(M.weekCompleted(state), 1);
  assert.equal(state.activeLift, 'bench');
  assert.deepEqual(M.weekPullups(state), { total: 0, goal: null, remaining: null, done: false });
});

test('TM is frozen per session and later edits affect only new sessions', () => {
  const state = fresh(), squat = M.getSession(state, 'squat', true);
  state.tm.squat = 130;
  state.tm.bench = 85;
  assert.equal(squat.tm.squat, 127.5);
  assert.equal(M.getSession(state, 'bench', true).tm.bench, 85);
});

test('elapsed time restores from timestamps and starting another session pauses the first', () => {
  const state = fresh(), squat = M.getSession(state, 'squat', true), bench = M.getSession(state, 'bench', true);
  M.startSession(state, squat, 1000);
  assert.equal(M.sessionDuration(squat, 61000), 60000);
  const restored = M.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(M.sessionDuration(M.getSession(restored, 'squat'), 91000), 90000);
  M.startSession(state, bench, 101000);
  assert.equal(squat.elapsedMs, 100000);
  assert.equal(squat.runningSince, null);
  assert.equal(M.sessionDuration(bench, 131000), 30000);
  M.pauseSession(bench, 131000);
  M.startSession(state, bench, 161000);
  assert.equal(M.sessionDuration(bench, 171000), 40000);
});

test('unlimited pullup sets count once across sessions, regardless of set count or completion', () => {
  const state = fresh();
  state.settings.pullupTargets[1] = 20;
  const a = M.getSession(state, 'squat', true), b = M.getSession(state, 'bench', true);
  a.pullupSets = Array(7).fill(1);
  b.pullupSets = [2, 2, 1];
  assert.deepEqual(M.weekPullups(state), { total: 12, goal: 20, remaining: 8, done: false });
  M.finishSession(state, 'squat', 100000);
  assert.deepEqual(M.weekPullups(state), { total: 12, goal: 20, remaining: 8, done: false });
  b.pullupSets.push(4, 4);
  assert.deepEqual(M.weekPullups(state), { total: 20, goal: 20, remaining: 0, done: true });
  b.pullupSets.push(2);
  assert.deepEqual(M.weekPullups(state), { total: 22, goal: 20, remaining: 0, done: true });
});

test('pullup best reads completed records, ignores draft, and does not duplicate history', () => {
  const state = fresh();
  M.getSession(state, 'squat', true).pullupSets = [1, 1, 2, 1];
  M.finishSession(state, 'squat', 100000);
  M.getSession(state, 'bench', true).pullupSets = [3, 1];
  M.finishSession(state, 'bench', 200000);
  M.getSession(state, 'dead', true).pullupSets = [50];
  assert.deepEqual(M.pullupBest(state), { maxSet: 3, maxSession: 5, lastSets: [3, 1] });
});

test('four lift completions advance automatically without requiring pullups or supplemental sets', () => {
  const state = fresh();
  state.settings.pullupTargets[1] = 200;
  for (const [i, lift] of ['squat', 'bench', 'dead', 'press'].entries()) {
    const session = M.getSession(state, lift, true);
    session.actual = { main0: 3, main1: 3, main2: 4 };
    session.checked = { main0: true, main1: true, main2: true };
    const result = M.finishSession(state, lift, 100000 + i * 1000);
    assert.equal(result.advanced, i === 3);
    if (i === 0) {
      assert.equal(state.activeLift, 'bench');
      M.finishSession(state, lift, 100010);
      assert.equal(state.history.length, 1);
    }
  }
  assert.equal(state.week, 2);
  assert.equal(state.cycle, 1);
  assert.equal(state.history.length, 4);
  assert.equal(M.weekCompleted(state), 0);
  assert.equal(state.activeLift, 'squat');
  assert.equal(state.history[0].summary.last, '115kg × 4회');
  assert.equal(state.history[0].pullupSets.length, 0);
});

test('auto-TM applies only at cycle rollover and remains opt-in', () => {
  const state = fresh();
  state.week = 3;
  M.advanceWeek(state, 1000);
  assert.equal(state.week, 4);
  M.advanceWeek(state, 2000);
  assert.equal(state.cycle, 2);
  assert.deepEqual(state.tm, M.DEFAULT.tm);
  state.settings.autoTM = true;
  state.settings.deload = false;
  state.week = 3;
  M.advanceWeek(state, 3000);
  assert.deepEqual(state.tm, { squat: 132.5, bench: 85, dead: 140, press: 55 });
});

test('changing mode starts an isolated block while preserving history and TM', () => {
  const state = fresh();
  M.getSession(state, 'squat', true).pullupSets = [2, 2];
  M.finishSession(state, 'squat', 1000);
  const bench = M.getSession(state, 'bench', true);
  M.startSession(state, bench, 2000);
  const beforeHistory = M.clone(state.history), beforeTM = M.clone(state.tm);
  assert.equal(M.setMode(state, '531', 3000), true);
  assert.equal(state.block, 2);
  assert.equal(bench.runningSince, null);
  assert.equal(bench.elapsedMs, 1000);
  assert.deepEqual(state.history, beforeHistory);
  assert.deepEqual(state.tm, beforeTM);
  assert.equal(M.weekPullups(state).total, 0);
  assert.equal(M.weekCompleted(state), 0);
  assert.equal(M.setMode(state, 'awesome', 4000), false);
  assert.equal(M.setMode(state, '531', 4000), false);
});

test('v6 JSON export/import round trip preserves data, timer and week goals', () => {
  const state = fresh();
  state.settings.pullupTargets = { 1: 12, 2: 14, 3: 16, 4: 8 };
  const session = M.getSession(state, 'squat', true);
  session.pullupSets = [1, 2, 3];
  session.choice = 'joker3';
  state.timer = { endAt: 1234567, running: true, remainingMs: 60000 };
  assert.deepEqual(M.migrateState(JSON.parse(JSON.stringify(state))), state);
});
