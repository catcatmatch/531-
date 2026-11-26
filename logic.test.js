/* Run without dependencies: node logic.test.js */
const assert = require('node:assert/strict');
const L = require('./logic.js');
let count = 0;
const test = (label, fn) => { fn(); count++; console.log('✓ ' + label); };
const loads = rows => rows.map(row => row.kg);
const reps = rows => rows.map(row => row.reps);

test('both active programs have exactly four lift sessions, no rest or conditioning slots', () => {
  for (const mode of ['531', '351']) {
    const days = L.daysForMode(mode);
    assert.deepEqual(days.map(day => day.id), ['squat', 'bench', 'dead', 'press']);
    assert.ok(days.every(day => day.kind === 'lift'));
  }
  assert.ok(!JSON.stringify(L.DAYS).match(/요일|awesome|carry|tgu/));
});

test('archived session IDs still have readable labels without entering the active schedule', () => {
  assert.equal(L.dayById('tgu').label, '터키시 겟업 (이전 기록)');
  assert.equal(L.dayById('awesome-wed').label, '데드리프트 + OHP');
  assert.equal(L.modeLabel('awesome'), '1000% Awesome (이전 기록)');
});

test('531 orders fives, threes, 531 with a PR on the third set in each training week', () => {
  assert.deepEqual(L.scheme('531', 1).pcts, [.65, .75, .85]);
  assert.deepEqual(L.scheme('531', 2).pcts, [.7, .8, .9]);
  assert.deepEqual(L.scheme('531', 3).pcts, [.75, .85, .95]);
  assert.deepEqual(reps(L.mainSets('531', 1, 100)), [5, 5, 5]);
  assert.deepEqual(reps(L.mainSets('531', 2, 100)), [3, 3, 3]);
  assert.deepEqual(reps(L.mainSets('531', 3, 100)), [5, 3, 1]);
  for (let week = 1; week <= 3; week++) {
    assert.deepEqual(L.mainSets('531', week, 100).map(row => row.pr), [false, false, true]);
  }
});

test('351 week two is strictly five reps, with no plus set or Joker', () => {
  assert.deepEqual(L.scheme('351', 1).pcts, [.7, .8, .9]);
  assert.deepEqual(reps(L.mainSets('351', 1, 127.5)), [3, 3, 3]);
  const week2 = L.mainSets('351', 2, 127.5);
  assert.deepEqual(loads(week2), [82.5, 95, 107.5]);
  assert.deepEqual(reps(week2), [5, 5, 5]);
  assert.ok(week2.every(row => !row.pr));
  assert.deepEqual(L.jokerSets('351', 2, 127.5, 3), []);
});

test('deload is 40/50/60 percent, five reps and no PR or Joker', () => {
  for (const mode of ['531', '351']) {
    assert.deepEqual(L.scheme(mode, 4).pcts, [.4, .5, .6]);
    assert.deepEqual(reps(L.mainSets(mode, 4, 100)), [5, 5, 5]);
    assert.ok(L.mainSets(mode, 4, 100).every(row => !row.pr));
    assert.deepEqual(L.jokerSets(mode, 4, 100, 3), []);
  }
});

test('confirmed TM percentages produce the expected main-set loads for all four lifts', () => {
  const expected = { squat: [90, 102.5, 115], bench: [57.5, 65, 75], dead: [95, 107.5, 122.5], press: [37.5, 42.5, 47.5] };
  for (const [lift, values] of Object.entries(expected)) {
    assert.deepEqual(loads(L.mainSets('351', 1, L.LIFTS[lift].defaultTM)), values);
  }
  assert.deepEqual(loads(L.mainSets('351', 1, 65)), [45, 52.5, 57.5]);
});

test('Joker adds 7.5 TM percentage points each set: 90 → 97.5 / 105 / 112.5', () => {
  const rows = L.jokerSets('351', 1, 100, 3);
  assert.deepEqual(rows.map(row => row.pct), [.975, 1.05, 1.125]);
  assert.deepEqual(rows.map(row => row.exactKg), [97.5, 105, 112.5]);
  assert.deepEqual(loads(rows), [97.5, 105, 112.5]);
  assert.deepEqual(reps(rows), [1, 1, 1]);
  assert.ok(rows.every(row => row.rest === 180));
});

test('Joker bases each load on original TM, not the rounded PR load or previous Joker', () => {
  const rows = L.jokerSets('351', 1, 127.5, 3);
  assert.deepEqual(rows.map(row => row.exactKg), [124.3125, 133.875, 143.4375]);
  assert.deepEqual(loads(rows), [125, 135, 142.5]);
  assert.deepEqual(loads(L.jokerSets('351', 1, 82.5, 3)), [80, 87.5, 92.5]);
  assert.deepEqual(loads(L.jokerSets('351', 1, 135, 3)), [132.5, 142.5, 152.5]);
  assert.deepEqual(loads(L.jokerSets('351', 1, 52.5, 3)), [50, 55, 60]);
});

test('other PR weeks use their own starting percentage and Joker count is bounded at three', () => {
  assert.deepEqual(L.jokerSets('531', 1, 100, 3).map(row => row.pct), [.925, 1, 1.075]);
  assert.deepEqual(L.jokerSets('531', 3, 100, 3).map(row => row.pct), [1.025, 1.1, 1.175]);
  assert.equal(L.jokerSets('351', 1, 100, 99).length, 3);
  assert.equal(L.jokerSets('351', 1, 100, 0).length, 0);
  assert.equal(L.jokerSets('351', 1, 100, -1).length, 0);
});

test('FSL uses the first main-set load, 5×8 upper / 5×4 lower, all with three-minute rest', () => {
  for (const mode of ['531', '351']) for (let week = 1; week <= 4; week++) {
    for (const [lift, info] of Object.entries(L.LIFTS)) {
      const rows = L.fslSets(mode, week, info.defaultTM, lift);
      assert.equal(rows.length, 5);
      const target = lift === 'bench' || lift === 'press' ? 8 : 4;
      assert.ok(rows.every(row => row.reps === target && row.rest === 180));
      assert.ok(rows.every(row => row.kg === L.mainSets(mode, week, info.defaultTM)[0].kg));
    }
  }
});

test('supplemental selection returns just the chosen option, invalid options yield no sets', () => {
  for (const [choice, expected] of [['skip', 0], ['joker1', 1], ['joker2', 2], ['joker3', 3], ['fsl', 5], ['joker4', 0], ['joker3,fsl', 0]]) {
    const rows = L.supplementalSets('351', 1, 127.5, 'squat', choice);
    assert.equal(rows.length, expected);
    if (choice.startsWith('joker') && expected) assert.ok(rows.every(row => row.id.startsWith('joker')));
    if (choice === 'fsl') assert.ok(rows.every(row => row.id.startsWith('fsl')));
  }
});

test('2.5kg plate rounding is consistent and warmups retain one-minute rests', () => {
  assert.equal(L.roundLoad(56.25), 57.5);
  assert.equal(L.roundLoad(143.4375), 142.5);
  assert.equal(L.roundLoad(0), 0);
  assert.deepEqual(loads(L.warmup('bench', 82.5)), [20, 32.5, 42.5, 50]);
  assert.deepEqual(loads(L.warmup('squat', 127.5)), [20, 50, 65, 77.5]);
  assert.deepEqual(loads(L.warmup('dead', 135)), [55, 67.5, 80]);
  assert.ok(L.warmup('press', 52.5).every(row => row.rest === 60 && row.kg >= 20));
});

test('cycle advancement respects optional deload', () => {
  assert.deepEqual(L.cycleAfter(2, 1, true), { cycle: 2, week: 2, newCycle: false });
  assert.deepEqual(L.cycleAfter(2, 3, true), { cycle: 2, week: 4, newCycle: false });
  assert.deepEqual(L.cycleAfter(2, 4, true), { cycle: 3, week: 1, newCycle: true });
  assert.deepEqual(L.cycleAfter(2, 3, false), { cycle: 3, week: 1, newCycle: true });
});

test('tabata phases retain elapsed-time behavior without an extra final rest', () => {
  const phases = L.buildTabata(20, 10, 8, 1, 60);
  assert.equal(phases.reduce((sum, phase) => sum + phase.seconds, 0), 235);
  assert.equal(L.getPhase(phases, 0).kind, 'prep');
  assert.equal(L.getPhase(phases, 5).kind, 'work');
  assert.equal(L.getPhase(phases, 25).kind, 'rest');
  assert.equal(L.getPhase(phases, 235).kind, 'done');
});
console.log(`PASS: ${count} groups`);
