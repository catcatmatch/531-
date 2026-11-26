/* 531 TRAIN v6 — browser-independent records, progress and migration. */
(function (global) {
  'use strict';
  const L = typeof module !== 'undefined' && module.exports
    ? require('./logic.js') : global.FiveThreeOneLogic;
  const VERSION = 6;
  const LIFTS = ['squat', 'bench', 'dead', 'press'];
  const MODES = ['531', '351'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const DEFAULT = {
    version: VERSION, mode: '351', block: 1, cycle: 1, week: 1, activeLift: 'squat',
    tm: { squat: 127.5, bench: 82.5, dead: 135, press: 52.5 },
    settings: {
      autoTM: false, deload: true, sound: true, vibrate: true,
      tabWork: 20, tabRest: 10, tabRounds: 8, tabSets: 1, tabBetween: 60,
      pullupTargets: { 1: null, 2: null, 3: null, 4: null }
    },
    sessions: {}, history: [], timer: null
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const positiveInt = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : Date.now();
  const reps = values => Array.isArray(values) ? values.filter(value =>
    value !== '' && value !== null && value !== undefined &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0).map(Number) : [];

  function keyFor(state, lift) {
    return `v6:${state.block}:${state.mode}:${state.cycle}:${state.week}:${lift}`;
  }

  function getSession(state, lift, create = false) {
    if (!LIFTS.includes(lift)) return null;
    const key = keyFor(state, lift);
    if (!state.sessions[key] && create) {
      state.sessions[key] = {
        key, version: VERSION, block: state.block, day: lift, mode: state.mode,
        cycle: state.cycle, week: state.week, tm: clone(state.tm),
        checked: {}, actual: {}, choice: 'skip', pullupSets: [],
        rir: '', condition: '보통', notes: '',
        elapsedMs: 0, runningSince: null, startedAt: null, completedAt: null
      };
    }
    return state.sessions[key] || null;
  }

  function migrateState(raw) {
    if (!object(raw) || !object(raw.tm) || !object(raw.sessions) || !Array.isArray(raw.history)) return clone(DEFAULT);
    const state = { ...clone(DEFAULT), ...clone(raw) };
    const oldVersion = Number(raw.version) || 1;
    state.version = VERSION;
    state.block = positiveInt(raw.block, 1);
    state.cycle = positiveInt(raw.cycle, 1);
    state.week = [1, 2, 3, 4].includes(Number(raw.week)) ? Number(raw.week) : 1;
    state.activeLift = LIFTS.includes(raw.activeLift) ? raw.activeLift : 'squat';
    state.mode = MODES.includes(raw.mode) ? raw.mode : '351';
    state.tm = { ...clone(DEFAULT.tm), ...clone(raw.tm) };
    for (const lift of LIFTS) {
      if (Number.isFinite(Number(state.tm[lift])) && Number(state.tm[lift]) > 0) state.tm[lift] = Number(state.tm[lift]);
      else state.tm[lift] = DEFAULT.tm[lift];
    }
    state.settings = { ...clone(DEFAULT.settings), ...(object(raw.settings) ? clone(raw.settings) : {}) };
    state.settings.pullupTargets = { ...clone(DEFAULT.settings.pullupTargets), ...(object(raw.settings?.pullupTargets) ? clone(raw.settings.pullupTargets) : {}) };
    for (const week of [1, 2, 3, 4]) {
      state.settings.pullupTargets[week] = positiveInt(state.settings.pullupTargets[week], null);
    }
    state.sessions = clone(raw.sessions);
    state.history = clone(raw.history);

    if (oldVersion < VERSION) {
      if (!MODES.includes(raw.mode)) {
        state.block = positiveInt(raw.block, 0) + 1;
        state.cycle = 1;
        state.week = 1;
        state.activeLift = 'squat';
        state.timer = null;
        state.migrationNotice = '기존 기록과 TM을 유지하고 3/5/1의 새 사이클을 시작합니다. 설정에서 프로그램과 주차를 변경할 수 있습니다.';
      } else {
        for (const lift of LIFTS) {
          const oldKey = `${state.cycle}.${state.week}.${lift}`;
          const previous = raw.sessions[oldKey];
          if (!object(previous) || (previous.mode && previous.mode !== state.mode)) continue;
          const fresh = getSession(state, lift, true);
          const retained = clone(previous);
          const allowed = /^(empty|warm[0-2]|main[0-2])$/;
          state.sessions[fresh.key] = {
            ...fresh, ...retained,
            key: fresh.key, version: VERSION, block: state.block, day: lift,
            mode: state.mode, cycle: state.cycle, week: state.week,
            tm: { ...clone(state.tm), ...(object(previous.tm) ? clone(previous.tm) : {}) },
            actual: Object.fromEntries(Object.entries(previous.actual || {}).filter(([key]) => allowed.test(key))),
            checked: Object.fromEntries(Object.entries(previous.checked || {}).filter(([key]) => allowed.test(key))),
            choice: 'skip', pullupSets: [], legacySourceKey: oldKey
          };
        }
        state.activeLift = nextOpenLift(state);
        state.migrationNotice = '기존 TM·운동 기록과 진행 중인 메인 세트를 유지했습니다. 새 보조운동은 다시 선택하세요.';
      }
    }

    // Only normalize this model's records. Historical objects remain intact.
    for (const [key, session] of Object.entries(state.sessions)) {
      if (!object(session) || Number(session.version) !== VERSION || !key.startsWith('v6:')) continue;
      session.checked = object(session.checked) ? session.checked : {};
      session.actual = object(session.actual) ? session.actual : {};
      session.pullupSets = reps(session.pullupSets);
      session.elapsedMs = Math.max(0, Number(session.elapsedMs) || 0);
      session.runningSince = session.runningSince === null || session.runningSince === undefined ? null : timestamp(session.runningSince);
      if (!['skip', 'fsl', 'joker1', 'joker2', 'joker3'].includes(session.choice)) session.choice = 'skip';
    }
    return state;
  }

  function sessionDuration(session, now = Date.now()) {
    if (!session) return 0;
    const elapsed = Math.max(0, Number(session.elapsedMs) || 0);
    return elapsed + (session.runningSince !== null && session.runningSince !== undefined
      ? Math.max(0, timestamp(now) - Number(session.runningSince)) : 0);
  }

  function pauseSession(session, now = Date.now()) {
    if (!session) return;
    if (session.runningSince !== null && session.runningSince !== undefined) {
      session.elapsedMs = sessionDuration(session, now);
      session.runningSince = null;
    }
  }

  function startSession(state, session, now = Date.now()) {
    if (!session || session.completedAt !== null && session.completedAt !== undefined) return;
    const at = timestamp(now);
    for (const other of Object.values(state.sessions)) {
      if (other !== session && object(other)) pauseSession(other, at);
    }
    if (session.startedAt === null || session.startedAt === undefined) session.startedAt = at;
    if (session.runningSince === null || session.runningSince === undefined) session.runningSince = at;
  }

  function weekCompleted(state) {
    return LIFTS.filter(lift => {
      const session = getSession(state, lift);
      return session && session.completedAt !== null && session.completedAt !== undefined;
    }).length;
  }

  function nextOpenLift(state) {
    return LIFTS.find(lift => {
      const session = getSession(state, lift);
      return !session || session.completedAt === null || session.completedAt === undefined;
    }) || LIFTS[0];
  }

  function weekPullups(state) {
    let total = 0;
    const seen = new Set();
    for (const session of Object.values(state.sessions)) {
      if (!object(session) || Number(session.version) !== VERSION ||
          session.block !== state.block || session.mode !== state.mode ||
          session.cycle !== state.cycle || session.week !== state.week ||
          !LIFTS.includes(session.day) || seen.has(session.key)) continue;
      seen.add(session.key);
      total += reps(session.pullupSets).reduce((sum, value) => sum + value, 0);
    }
    const goal = positiveInt(state.settings.pullupTargets[state.week], null);
    return { total, goal, remaining: goal === null ? null : Math.max(0, goal - total), done: goal !== null && total >= goal };
  }

  function pullupBest(state) {
    const unique = new Map();
    for (const row of [...state.history, ...Object.values(state.sessions)]) {
      if (!object(row) || Number(row.version) !== VERSION || !Array.isArray(row.pullupSets)) continue;
      const at = row.completedAt ?? row.timestamp;
      if (at === undefined || at === null) continue;
      const values = reps(row.pullupSets);
      if (!values.length) continue;
      const key = row.key || row.id;
      if (!key) continue;
      unique.set(key, { sets: values, at: Number(at) || 0 });
    }
    let maxSet = 0, maxSession = 0, lastSets = [], lastAt = -Infinity;
    for (const record of unique.values()) {
      maxSet = Math.max(maxSet, ...record.sets);
      maxSession = Math.max(maxSession, record.sets.reduce((sum, value) => sum + value, 0));
      if (record.at >= lastAt) { lastAt = record.at; lastSets = record.sets.slice(); }
    }
    return { maxSet, maxSession, lastSets };
  }

  function summaryFor(session) {
    const load = Number(session.tm[session.day]);
    const main = L.mainSets(session.mode, session.week, load);
    const render = row => `${row.label}: ${L.nfmt(row.kg)}kg × ${session.actual[row.id] === undefined || session.actual[row.id] === '' ? '미기록' : session.actual[row.id] + '회'}`;
    const details = main.map(render);
    if (L.supplementalSets) details.push(...L.supplementalSets(session.mode, session.week, load, session.day, session.choice).map(render));
    if (session.pullupSets.length) details.push(`풀업: ${session.pullupSets.join(' / ')}회 · 합계 ${session.pullupSets.reduce((sum, value) => sum + value, 0)}회`);
    const last = main[main.length - 1];
    const actual = session.actual[last.id];
    return {
      last: `${L.nfmt(last.kg)}kg × ${actual === undefined || actual === '' ? '미기록' : actual + '회'}`,
      details: details.join('\n')
    };
  }

  function finishSession(state, lift, now = Date.now()) {
    const session = getSession(state, lift, true);
    if (!session) return { session: null, advanced: false };
    if (session.completedAt !== null && session.completedAt !== undefined) return { session, advanced: false };
    const at = timestamp(now);
    pauseSession(session, at);
    session.completedAt = at;
    session.pullupSets = reps(session.pullupSets);
    session.summary = summaryFor(session);
    const record = {
      ...clone(session), id: session.key, timestamp: at,
      date: new Date(at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' }),
      durationMs: session.elapsedMs || 0
    };
    const existing = state.history.findIndex(row => row.id === session.key || row.key === session.key);
    if (existing < 0) state.history.push(record);
    else state.history[existing] = record;
    state.timer = null;
    const advanced = weekCompleted(state) === LIFTS.length;
    if (advanced) advanceWeek(state, at);
    else state.activeLift = nextOpenLift(state);
    return { session, advanced };
  }

  function advanceWeek(state, now = Date.now()) {
    for (const session of Object.values(state.sessions)) if (object(session)) pauseSession(session, now);
    const next = L.cycleAfter(state.cycle, state.week, state.settings.deload, state.mode);
    state.cycle = next.cycle;
    state.week = next.week;
    state.activeLift = 'squat';
    state.timer = null;
    if (next.newCycle && state.settings.autoTM) {
      state.tm.squat += 5;
      state.tm.dead += 5;
      state.tm.bench += 2.5;
      state.tm.press += 2.5;
    }
    return next;
  }

  function setMode(state, mode, now = Date.now()) {
    if (!MODES.includes(mode) || state.mode === mode) return false;
    for (const session of Object.values(state.sessions)) if (object(session)) pauseSession(session, now);
    const blocks = Object.values(state.sessions).filter(object).map(session => positiveInt(session.block, 0));
    state.block = Math.max(positiveInt(state.block, 1), ...blocks) + 1;
    state.mode = mode;
    state.cycle = 1;
    state.week = 1;
    state.activeLift = 'squat';
    state.timer = null;
    return true;
  }

  const api = { VERSION, DEFAULT, clone, migrateState, keyFor, getSession, sessionDuration, startSession, pauseSession,
    weekCompleted, nextOpenLift, weekPullups, pullupBest, finishSession, advanceWeek, setMode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TrainModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
