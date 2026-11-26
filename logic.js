/* 531 TRAIN v6 — user-configured 5/3/1 and 3/5/1.
   Loads are total barbell kg. Joker +7.5 percentage points of TM per set;
   FSL upper 5×8 / lower 5×4 are the user's custom supplemental rules. */
(function (global) {
  'use strict';

  const LOAD_STEP = 2.5;
  const JOKER_STEP = 0.075;
  const roundLoad = value => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.round((number + 1e-9) / LOAD_STEP) * LOAD_STEP)
      : 0;
  };
  const nfmt = value => Number.isInteger(Number(value))
    ? String(Number(value)) : Number(value).toFixed(1);
  const LIFTS = {
    squat: { label: '스쿼트', short: 'SQ', defaultTM: 127.5 },
    bench: { label: '벤치프레스', short: 'BP', defaultTM: 82.5 },
    dead: { label: '데드리프트', short: 'DL', defaultTM: 135 },
    press: { label: '오버헤드 프레스', short: 'OHP', defaultTM: 52.5 }
  };
  const BASIC_DAYS = [
    { id: 'squat', label: '스쿼트', kind: 'lift', lift: 'squat', mobility: 'Agile 8', warmDesc: '고관절·허리 가동성 · 6~8분' },
    { id: 'bench', label: '벤치프레스', kind: 'lift', lift: 'bench', mobility: '덤벨 풀오버', warmDesc: '가벼운 덤벨 2세트 × 10회' },
    { id: 'dead', label: '데드리프트', kind: 'lift', lift: 'dead', mobility: 'Agile 8', warmDesc: '고관절·허리 가동성 · 6~8분' },
    { id: 'press', label: 'OHP', kind: 'lift', lift: 'press', mobility: '오버헤드 슈러그', warmDesc: '빈 봉 2세트 × 10회' }
  ];
  // Labels retained only so archived records remain readable.
  const LEGACY_DAYS = [
    { id: 'awesome-mon', label: '스쿼트 + 벤치', kind: 'legacy' },
    { id: 'awesome-wed', label: '데드리프트 + OHP', kind: 'legacy' },
    { id: 'awesome-fri', label: '스쿼트 + 벤치', kind: 'legacy' },
    { id: 'tgu', label: '터키시 겟업 (이전 기록)', kind: 'legacy' },
    { id: 'carry', label: '파머스 캐리 (이전 기록)', kind: 'legacy' }
  ];
  const DAYS = BASIC_DAYS;
  const daysForMode = () => BASIC_DAYS;
  const dayById = id => [...BASIC_DAYS, ...LEGACY_DAYS].find(day => day.id === id);
  const modeLabel = mode => mode === 'awesome' ? '1000% Awesome (이전 기록)'
    : mode === '531' ? '5/3/1' : '3/5/1';

  function scheme(mode, week) {
    const w = Math.min(4, Math.max(1, Math.trunc(Number(week) || 1)));
    let name, pcts, reps, pr;
    if (w === 4) {
      name = '디로드'; pcts = [.4, .5, .6]; reps = [5, 5, 5]; pr = false;
    } else if (w === 3) {
      name = '1+ 주간'; pcts = [.75, .85, .95]; reps = [5, 3, 1]; pr = true;
    } else if ((mode === '531' && w === 1) || (mode !== '531' && w === 2)) {
      pr = mode === '531';
      name = pr ? '5+ 주간' : '5회 주간';
      pcts = [.65, .75, .85]; reps = [5, 5, 5];
    } else {
      name = '3+ 주간'; pcts = [.7, .8, .9]; reps = [3, 3, 3]; pr = true;
    }
    return { name, labels: pcts.map(pct => nfmt(pct * 100) + '%'), pcts, reps, pr };
  }

  function warmup(lift, tm) {
    const rows = [];
    if (lift !== 'dead') rows.push({ id: 'empty', label: '빈 봉', kg: 20, reps: lift === 'bench' ? 10 : 8, rest: 60 });
    [[.4, 5], [.5, 5], [.6, 3]].forEach(([pct, reps], i) => {
      rows.push({ id: 'warm' + i, label: '워밍업 ' + (i + 1), pct,
        kg: Math.max(20, roundLoad(tm * pct)), reps, rest: 60 });
    });
    return rows;
  }

  function mainSets(mode, week, tm) {
    const plan = scheme(mode, week);
    return plan.pcts.map((pct, i) => ({
      id: 'main' + i, label: `본세트 ${i + 1} · ${plan.labels[i]}`, pct,
      exactKg: Number((Number(tm) * pct).toFixed(6)), kg: roundLoad(tm * pct),
      reps: plan.reps[i], pr: plan.pr && i === 2, rest: 180
    }));
  }

  function jokerSets(mode, week, tm, count) {
    const plan = scheme(mode, week);
    if (!plan.pr) return [];
    const total = Math.min(3, Math.max(0, Math.trunc(Number(count) || 0)));
    return Array.from({ length: total }, (_, i) => {
      const pct = Number((plan.pcts[2] + JOKER_STEP * (i + 1)).toFixed(6));
      const exactKg = Number((Number(tm) * pct).toFixed(6));
      return { id: 'joker' + i, label: `조커 ${i + 1} · ${nfmt(pct * 100)}% TM`,
        pct, exactKg, kg: roundLoad(exactKg), reps: 1, pr: false, rest: 180 };
    });
  }

  function fslSets(mode, week, tm, lift) {
    if (!Object.prototype.hasOwnProperty.call(LIFTS, lift)) return [];
    const pct = scheme(mode, week).pcts[0];
    const reps = lift === 'bench' || lift === 'press' ? 8 : 4;
    return Array.from({ length: 5 }, (_, i) => ({
      id: 'fsl' + i, label: `FSL ${i + 1}/5 · ${nfmt(pct * 100)}% TM`,
      pct, exactKg: Number((Number(tm) * pct).toFixed(6)), kg: roundLoad(tm * pct),
      reps, pr: false, rest: 180
    }));
  }

  function supplementalSets(mode, week, tm, lift, choice) {
    if (choice === 'fsl') return fslSets(mode, week, tm, lift);
    const match = /^joker([123])$/.exec(String(choice));
    return match ? jokerSets(mode, week, tm, Number(match[1])) : [];
  }

  function buildTabata(work, rest, rounds, sets, between) {
    const phases = [{ name: '준비', kind: 'prep', seconds: 5 }];
    for (let s = 1; s <= sets; s++) {
      for (let r = 1; r <= rounds; r++) {
        phases.push({ name: `${s}세트 ${r}/${rounds} · 운동`, kind: 'work', seconds: work });
        if (r < rounds) phases.push({ name: `${s}세트 ${r}/${rounds} · 휴식`, kind: 'rest', seconds: rest });
      }
      if (s < sets) phases.push({ name: `세트 ${s} 완료 · 회복`, kind: 'between', seconds: between });
    }
    return phases;
  }

  function getPhase(phases, elapsedSec) {
    let elapsed = Math.max(0, elapsedSec);
    for (let i = 0; i < phases.length; i++) {
      if (elapsed < phases[i].seconds) return { ...phases[i], index: i, remaining: phases[i].seconds - elapsed };
      elapsed -= phases[i].seconds;
    }
    return { name: '완료', kind: 'done', seconds: 0, index: phases.length, remaining: 0 };
  }

  function cycleAfter(cycle, week, deload) {
    const maxWeek = deload ? 4 : 3;
    return week >= maxWeek
      ? { cycle: cycle + 1, week: 1, newCycle: true }
      : { cycle, week: week + 1, newCycle: false };
  }

  const api = { LOAD_STEP, JOKER_STEP, LIFTS, DAYS, BASIC_DAYS, LEGACY_DAYS,
    daysForMode, dayById, modeLabel, roundLoad, nfmt, scheme, warmup, mainSets,
    jokerSets, fslSets, supplementalSets, buildTabata, getPhase, cycleAfter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FiveThreeOneLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
