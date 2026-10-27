(function(){
'use strict';
const L=window.FiveThreeOneLogic;
if(!L){document.body.textContent='프로그램 파일이 완전하지 않습니다. logic.js를 함께 보관하세요.';return;}
const STORAGE='531_train_kr_v1';
const DEFAULT={version:3,mode:'351',week:1,cycle:1,tm:{squat:127.5,bench:82.5,dead:135,press:52.5},settings:{age:'',bodyweight:101,autoTM:false,deload:true,sound:true,vibrate:true,tabWork:20,tabRest:10,tabRounds:8,tabSets:1,tabBetween:60,backExercise:'inverted',coreExercise:'knee',carryWeight:12.5,carrySets:3,carryDistance:60,carryRest:120},sessions:{},history:[],timer:null};
const clone=x=>JSON.parse(JSON.stringify(x));
const load=()=>{try{
 const s=JSON.parse(localStorage.getItem(STORAGE));if(!s||typeof s!=='object')return clone(DEFAULT);
 const prior=Number(s.version)||1,oldSettings=s.settings||{};
 const settings={...DEFAULT.settings,...oldSettings};
 // V1 had no distance/sets controls; V2 meant one-way distance. V3 stores total round-trip distance.
 if(prior<3){
  if(prior===1&&Number(settings.carryWeight)===10)settings.carryWeight=12.5;
  if(prior===2&&Number(oldSettings.carryDistance)!==60&&Number(oldSettings.carryDistance)>0)settings.carryDistance=Number(oldSettings.carryDistance)*2;
  else settings.carryDistance=60;
  if(prior===1||Number(settings.carrySets)===2)settings.carrySets=3;
 }
 const merged={...clone(DEFAULT),...s,version:3,tm:{...DEFAULT.tm,...s.tm},settings,sessions:s.sessions&&typeof s.sessions==='object'?s.sessions:{},history:Array.isArray(s.history)?s.history:[]};
 if(prior<3){try{localStorage.setItem(STORAGE,JSON.stringify(merged))}catch(_){}}
 return merged;
 }catch(e){return clone(DEFAULT)}};
let state=load();
let currentTab='today';
let activeDay=Math.min(6,(new Date().getDay()+6)%7);
let toastTimeout=0;
let installPrompt=null;
let wakeLock=null;
let lastPhaseMark='';
let audioContext=null;
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch(e){notify('저장공간이 부족합니다. 기록을 내보내고 공간을 확보하세요.')}}
function $(s,r=document){return r.querySelector(s)}
function $all(s,r=document){return [...r.querySelectorAll(s)]}
function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
const today=()=>new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'});
const rtime=sec=>{const s=Math.max(0,Math.ceil(sec));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const restTime=sec=>!sec?'마무리':sec%60===0?`${sec/60}분`:`${Math.floor(sec/60)}분 ${sec%60}초`;
const humanTime=sec=>{sec=Math.max(0,Math.round(sec));const m=Math.floor(sec/60),h=Math.floor(m/60);return h?`${h}시간 ${m%60}분`:`${m}분 ${sec%60}초`};
const keyFor=(id)=>`${state.cycle}.${state.week}.${id}`;
const isFiniteNumber=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
function session(id,create=false){
 const key=keyFor(id);let s=state.sessions[key];
 if(!s&&create){s={key,day:id,mode:state.mode,week:state.week,cycle:state.cycle,tm:clone(state.tm),checked:{},actual:{},choice:'skip',rir:'',condition:'보통',notes:'',activities:{},elapsedMs:0,runningSince:null,startedAt:null,completedAt:null,skipped:false};state.sessions[key]=s;save()}
 return s||null;
}
function sessionDuration(s){return (!s?0:s.elapsedMs||0)+(s?.runningSince?Math.max(0,Date.now()-s.runningSince):0)}
function startSession(s){if(!s.startedAt)s.startedAt=Date.now();if(!s.runningSince)s.runningSince=Date.now();save();}
function pauseSession(s){if(s.runningSince){s.elapsedMs=(s.elapsedMs||0)+Date.now()-s.runningSince;s.runningSince=null;save();}}
function notify(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3300)}
function setTab(tab){if(!['today','week','timers','history','settings'].includes(tab))return;currentTab=tab;
 $all('.view').forEach(el=>el.classList.toggle('hidden',el.id!==`view-${tab}`));
 $all('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
 renderCurrent();window.scrollTo({top:0,behavior:'smooth'});
}
function dayInfo(){return L.DAYS[activeDay]}
function renderCurrent(){if(currentTab==='today')renderToday();else if(currentTab==='week')renderWeek();else if(currentTab==='timers')renderTimers();else if(currentTab==='history')renderHistory();else renderSettings();updateLiveUI()}
function ctag(text,value='',className=''){return `<span class="badge ${className}">${escapeHTML(text)}${value?' · '+escapeHTML(value):''}</span>`}
function currentWeekCompleted(){return L.DAYS.filter(d=>d.kind!=='rest').filter(d=>!!session(d.id)?.completedAt).length}
function weekHeader(){return `<div class="row spread"><div><div class="eyebrow">CYCLE ${String(state.cycle).padStart(2,'0')} / WEEK ${state.week}</div><h1 class="page-title" id="today-title">나의 스트렝스 루틴</h1></div>${ctag(state.mode==='351'?'3/5/1':'5/3/1')}</div>
<div class="mode-switch" role="group" aria-label="훈련 모드"><button type="button" data-mode="531" class="${state.mode==='531'?'active':''}">5/3/1</button><button type="button" data-mode="351" class="${state.mode==='351'?'active':''}">3/5/1</button></div>
<div class="weekstrip">${L.DAYS.map((d,i)=>{const s=session(d.id);return `<button class="day-chip ${i===activeDay?'active':''} ${s?.completedAt?'complete':''}" data-day="${i}" title="${d.label}"><b>${L.WEEK_DAYS[i]}</b><span class="day-status"></span></button>`}).join('')}</div>`}
function daySessionBanner(s,d){const desc=d.kind==='lift'?'기본 메인 3세트 · 추가운동 선택 가능':d.kind==='condition'?'기술운동 20분 한도 · 별도 30분 걷기 없음':'회복하는 날';
 return `<div class="section-head"><h3>${L.WEEK_DAYS[activeDay]}요일 · ${escapeHTML(d.label)}</h3>${s?.completedAt?ctag('완료','',''):ctag('진행 전','','gray')}</div><p class="subtitle" style="margin-top:-3px">${desc}</p>`}
function mainTabButtons(s){if(!s||s.completedAt)return '';return `<div class="row spread" style="margin:8px 0 17px"><div><small class="small">총 운동 시간</small><div class="metric" style="font-size:20px" data-elapsed>${humanTime(sessionDuration(s)/1000)}</div></div><div class="btn-group"><button class="btn tiny ${s.runningSince?'outline':''}" data-act="session-toggle">${s.runningSince?'⏸ 시간 일시정지':'▶ 시간 시작'}</button></div></div>`}
function setRow(r,s,group){const actual=s?.actual?.[r.id]??'';const checked=!!s?.checked?.[r.id];const target=r.kg!==undefined?`${L.nfmt(r.kg)}kg`:'맨몸';const pr=r.pr?' · PR':(r.pct&&group==='warm'?` · ${Math.round(r.pct*100)}%`:'');
 return `<div class="set-row ${checked?'checked':''}">
   <input class="checkbox" type="checkbox" aria-label="${escapeHTML(r.label)} 완료" data-checked="${r.id}" ${checked?'checked':''} ${s?.completedAt?'disabled':''}>
   <div><div class="set-top ${r.pr?'emphasis':''}">${target} × ${r.reps}${r.pr?'+':''}${r.unit||'회'}</div><div class="set-sub">${escapeHTML(r.label)}${pr} · 세트 후 ${r.rest?restTime(r.rest)+' 휴식':'마무리'}</div></div>
   <div class="rep-entry"><input class="input number-input" type="number" min="0" step="1" value="${escapeHTML(actual)}" placeholder="실제" inputmode="numeric" aria-label="${escapeHTML(r.label)} 실제 반복수" data-reps="${r.id}" ${s?.completedAt?'disabled':''}></div>
 </div>`}
function itemRows(rows,s,g){return `<div class="set-list">${rows.map(r=>setRow(r,s,g)).join('')}</div>`}
function assistInfo(d){return L.assistanceForDay(d.id,state.settings)}
function assistRows(d){const a=assistInfo(d);if(!a)return [];return a.reps.map((n,i)=>({id:'assist'+i,label:`${a.label} ${i+1}세트`,reps:n,rest:i<2?90:0}));}
function skillRows(d){
 if(d.timerKind==='tgu')return [{id:'tgu0',label:'겟업 · 좌우 각각 5회',reps:10,rest:120}];
 const cp=L.carryPlan(state.settings);
 return Array.from({length:cp.sets},(_,i)=>({id:'carry'+i,label:`파머스 캐리 ${i+1}세트 · 왕복 ${L.nfmt(cp.roundTrip)}m (편도 ${L.nfmt(cp.oneWay)}m)`,kg:cp.perHand,reps:cp.roundTrip,unit:'m',rest:i<cp.sets-1?cp.rest:0}));
}
function mobilityPanel(s,d){let content='';
 if(d.mobility==='Agile 8')content=`<details><summary class="small">Agile 8 동작 자세히 보기 ▾</summary><p>폼롤러(허벅지 외측·내전근) → 둔근 가동성 → 롤오버 → 파이어 하이드런트 → 마운틴 클라이머 → 그로이너 → 고관절 신전근 스트레칭. 무리 없는 범위로 약 6~8분.</p></details>`;
 else if(d.mobility==='덤벨 풀오버')content='<p>어깨 통증 없는 가벼운 덤벨로 10회 × 2세트. 벤치프레스를 위한 준비이며 무겁게 실시하지 않습니다.</p>';
 else if(d.mobility==='오버헤드 슈러그')content='<p>빈 봉이나 가벼운 중량에서 견갑골을 위로 올렸다 내리는 동작 10회 × 2세트. 어깨 통증이 있으면 생략합니다.</p>';
 return `<div class="card subtle"><div class="row spread"><div><div class="eyebrow">MOVEMENT PREP</div><h3 style="margin-top:5px">${escapeHTML(d.mobility)}</h3></div><label class="row" style="font-size:12px"><input type="checkbox" class="checkbox" data-mobility ${s?.activities?.mobility?'checked':''} ${s?.completedAt?'disabled':''}> 완료</label></div>${content||`<p>${escapeHTML(d.warmDesc)}</p>`}</div>`;
}
function selectedPlan(s,d){let mode=s?.mode||state.mode,tm=(s?.tm||state.tm)[d.lift];return {scheme:L.scheme(mode,state.week),warm:L.warmup(d.lift,tm),main:L.mainSets(mode,state.week,tm),tm,mode};}
function recommendationFor(s,plan){return L.recommendation({mode:plan.mode,week:state.week,prReps:s?.actual?.main2??'',rir:s?.rir??'',condition:s?.condition||'보통'});}
function radioChoice(s,prop,values){return `<div class="option-group">${values.map(v=>`<button type="button" data-radio="${prop}" data-radio-value="${escapeHTML(v.value)}" class="${(s?.[prop]||'')===v.value?'selected':''}" ${s?.completedAt?'disabled':''}>${escapeHTML(v.label)}</button>`).join('')}</div>`}
function addonPanel(s,plan){if(!plan.scheme.pr)return `<div class="card subtle"><h3>이번 주 추가운동: 생략</h3><p>PR 세트가 없으므로 Joker·Widowmaker는 진행하지 않습니다. 마지막 메인 세트의 여유는 기록하세요.</p><div class="grid2"><label><span class="small">마지막 세트 RIR</span><select class="input" data-field="rir"><option value="">선택</option>${[0,1,2,3,4].map(x=>`<option value="${x}" ${String(s?.rir??'')===String(x)?'selected':''}>${x===4?'4회 이상':`${x}회`}</option>`).join('')}</select></label><label><span class="small">컨디션</span><select class="input" data-field="condition">${['좋음','보통','나쁨'].map(x=>`<option ${x===(s?.condition||'보통')?'selected':''}>${x}</option>`).join('')}</select></label></div></div>`;
 const rec=recommendationFor(s,plan);
 const map={pending:'기록 입력 후 추천',skip:'생략 권장',joker:'조커 권장',widow:'위도우메이커 선택 가능'};
 const selected=s?.choice||'skip';
 const extra=selected==='joker'?{id:'joker',label:'조커 · 목표 1~3회',kg:L.jokerLoad(plan.mode,state.week,plan.tm),reps:state.week===3?1:3,rest:180}:selected==='widow'?{id:'widow',label:'위도우메이커 · 15~20회 이내',kg:L.widowLoad(plan.mode,state.week,plan.tm),reps:15,rest:180}:null;
 return `<div class="card"><h3>메인 이후 추가운동</h3><div class="grid2"><label><span class="small">PR 마지막 세트 RIR</span><select class="input" data-field="rir"><option value="">선택</option>${[0,1,2,3,4].map(x=>`<option value="${x}" ${String(s?.rir??'')===String(x)?'selected':''}>${x===4?'4회 이상':`${x}회`}</option>`).join('')}</select></label><label><span class="small">컨디션</span><select class="input" data-field="condition">${['좋음','보통','나쁨'].map(x=>`<option ${x===(s?.condition||'보통')?'selected':''}>${x}</option>`).join('')}</select></label></div>
 <div class="rec-card"><div class="row spread"><b id="rec-title">${map[rec.type]}</b>${rec.type==='joker'?ctag('고반복','',''):ctag('선택','','gray')}</div><p id="rec-description">${escapeHTML(rec.reason)}</p></div>
 <div class="small" style="margin-bottom:8px">코치 추천은 참고용입니다. 마지막 선택은 직접 변경할 수 있습니다.</div>
 ${radioChoice(s,'choice',[{value:'joker',label:'조커'},{value:'widow',label:'위도우'},{value:'skip',label:'생략'}])}
 ${extra?`<div style="margin-top:13px">${itemRows([extra],s,'extra')}<p class="footnote">${selected==='joker'?'기본 중량보다 약 5% TM 상승. 실패 반복 금지, 최대 1세트 권장.':'첫 본세트(FSL) 중량에서 15~20회 이내 1세트. 감량·피로 누적 시 생략.'}</p></div>`:''}
 </div>`;
}
function renderLift(d,s){const p=selectedPlan(s,d);const pr=p.scheme.pr;
 return `<div class="card special"><div class="card-top"><div><div class="eyebrow">${escapeHTML(p.scheme.name)} · ${escapeHTML(p.mode==='351'?'3/5/1':'5/3/1')}</div><div class="metric">${L.nfmt(p.main[2].kg)}<small>kg × ${p.main[2].reps}${pr?'+':''}회</small></div></div><span class="badge">TM ${L.nfmt(p.tm)}kg</span></div><p>메인 운동 3세트. ${pr?'마지막은 좋은 자세로 PR 반복을 기록하세요.':'이번에는 정해진 횟수에서 종료하세요.'} Joker / Widow는 선택 사항입니다.</p></div>
 ${mobilityPanel(s,d)}
 <div class="section-head"><h3>바벨 워밍업</h3>${ctag('세트 후 1분','','gray')}</div>
 ${itemRows(p.warm,s,'warm')}
 <div class="section-head"><h3>메인 운동</h3>${ctag('세트 후 3분','','gray')}</div>
 ${itemRows(p.main,s,'main')}
 ${addonPanel(s,p)}
 ${assistPanel(s,d)}`;
}
function assistPanel(s,d){const a=assistInfo(d);return `<div class="section-head"><h3>${escapeHTML(a.category)} · ${escapeHTML(a.label)} 3세트</h3>${ctag('90초 휴식','','gray')}</div>${itemRows(assistRows(d),s,'assist')}<p class="footnote">등과 복근을 운동일마다 번갈아 수행합니다. ${escapeHTML(a.tip)} 상위 동작으로 바꾸려면 설정에서 변경하세요.</p>`;}
function activityTimerButton(kind,sec){const labels={tgu:'20분 겟업 타이머 시작',carry:'20분 파머스 캐리 타이머 시작',walking:'5분 준비 타이머',tabata:'타바타 시작'};return `<button class="btn primary" data-start-timer="${kind}" data-seconds="${sec}">◴ ${labels[kind]}</button>`}
function conditionWorkout(d,s){const kind=d.timerKind,guide=L.GUIDES[kind],cp=L.carryPlan(state.settings);
 const activityName=d.activity;
 const exercise=kind==='tgu'?'1세트 × 10회 (좌우 각 5회) · 2분 휴식':`왕복 전체 ${L.nfmt(cp.roundTrip)}m (편도 ${L.nfmt(cp.oneWay)}m씩) × ${cp.sets}세트 · 덤벨 한 손당 ${L.nfmt(cp.perHand)}kg`;
 return `<div class="card special"><div class="eyebrow">SKILL / CONDITIONING</div><div class="metric" style="font-size:27px">${escapeHTML(activityName)}</div><p>${exercise}. 총 20분은 상한선이며 계획한 운동을 마치면 일찍 종료해도 됩니다.</p></div>
 <div class="card"><div class="row spread"><h3>준비 걷기 · 선택 5분</h3><label class="row small"><input class="checkbox" data-activity="walk" type="checkbox" ${s?.activities?.walk?'checked':''} ${s?.completedAt?'disabled':''}> 완료</label></div>${activityTimerButton('walking',300)}</div>
 <div class="card"><div class="row spread"><h3>${escapeHTML(activityName)} · 20분 한도</h3>${ctag('기술 중심','','gray')}</div>
 <ul class="activity-plan">${guide.map(g=>`<li><span class="mins">${Math.floor(g.start/60)}–${Math.floor(g.end/60)}분</span><span><b>${escapeHTML(g.title)}</b><small>${escapeHTML(g.detail)}</small></span></li>`).join('')}</ul>
 ${kind==='carry'?`<div class="grid2"><label class="field-label">한 손당 중량 (kg)<input class="input" type="number" min="2.5" max="40" step="2.5" value="${cp.perHand}" data-setting="carryWeight"></label><label class="field-label">세트 수<input class="input" type="number" min="1" max="6" step="1" value="${cp.sets}" data-setting="carrySets"></label><label class="field-label">왕복 총거리 (m)<input class="input" type="number" min="10" max="200" step="10" value="${cp.roundTrip}" data-setting="carryDistance"></label><label class="field-label">세트 간 휴식 (초)<input class="input" type="number" min="30" max="600" step="30" value="${cp.rest}" data-setting="carryRest"></label></div><p class="footnote">왕복 전체 ${L.nfmt(cp.roundTrip)}m = 편도 ${L.nfmt(cp.oneWay)}m + 돌아오기 ${L.nfmt(cp.oneWay)}m. 기본 권장: 한 손당 12.5kg(양손 25kg)으로 왕복 60m × 3세트, 휴식 2분. 자세가 안정적이고 다음 날 피로가 적으면 한 손당 15kg으로 천천히 증가하세요.</p>`:'<p class="footnote">겟업은 좌우 각각 5회씩 총 10회이며, 세트가 끝난 뒤 2분 휴식합니다. 한 세트만 수행할 때는 추가 세트를 강요하지 않습니다.</p>'}
 <div class="section-head"><h3>수행 체크</h3>${ctag(kind==='tgu'?'1×10':'왕복 거리','','gray')}</div>${itemRows(skillRows(d),s,'skill')}
 <div class="info-box amber">${kind==='tgu'?'터키시 겟업이 익숙하지 않다면 맨손부터 시작하세요. 어깨·목 통증이 생기면 중단하고, 자세는 숙련된 코치에게 확인하는 편이 좋습니다.':'두 손에 같은 중량을 들고 몸통을 세운 상태로 걷습니다. 방향 전환은 천천히 하고 악력·허리가 무너지기 전에 멈추세요.'}</div>
 <div class="btn-group" style="margin-top:12px">${activityTimerButton(kind,1200)}<button class="btn outline" data-start-timer="rest" data-seconds="120">◴ 2분 휴식</button></div></div>
 ${assistPanel(s,d)}`;
}
function renderToday(){const d=dayInfo();const s=session(d.id);const modeForDay=s?.mode||state.mode;
 let html=weekHeader()+daySessionBanner(s,d);
 if(d.kind==='rest')html+=`<div class="card special"><div class="eyebrow">SUNDAY · OFF</div><h2>회복하는 날</h2><p>강아지 산책 등 가벼운 활동은 유지하되, 추가 중량훈련은 권장하지 않습니다. 일요일은 주차 전환 조건에서 자동 제외됩니다.</p></div>`;
 else{
   html+=mainTabButtons(s);
   if(s?.completedAt)html+=`<div class="info-box">완료된 훈련입니다. 운동 시간 ${humanTime(sessionDuration(s)/1000)} · 기록 탭에서 확인할 수 있습니다.</div>`;
   html+=d.kind==='lift'?renderLift(d,s):conditionWorkout(d,s);
   html+=`<div class="card"><h3>운동 마무리</h3><label class="field-label">컨디션 및 메모</label><textarea class="input" rows="2" data-notes placeholder="통증, 육체노동, 수면, 자세, 운동 메모" ${s?.completedAt?'disabled':''}>${escapeHTML(s?.notes||'')}</textarea>
   ${!s?.completedAt?`<div class="row" style="justify-content:space-between;margin-top:13px;gap:9px"><button class="btn outline" data-act="session-toggle">${s?.runningSince?'시간 일시정지':'시간 시작'}</button><button class="btn primary flex-1" data-act="complete-day">오늘 운동 완료 ✓</button></div>`:''}
   <p class="footnote">오늘 완료를 누르면 운동 시간과 세트 기록을 저장합니다. 모든 훈련일(월~토)을 완료하면 다음 주차로 자동 전환합니다.</p></div>`;
 }
 $('#view-today').innerHTML=html;
}
function renderWeek(){const count=currentWeekCompleted();let html=`<div class="eyebrow">WEEKLY OVERVIEW</div><h1 class="page-title">주간 진행 현황</h1><p class="subtitle">${state.mode==='351'?'3/5/1':'5/3/1'} 모드 · 사이클 ${state.cycle}, ${state.week}주차. 6개 훈련일이 완료되면 일요일 휴식을 자동으로 건너뛰고 다음 주차로 진행합니다.</p>
 <div class="card special"><div class="row spread"><div><div class="eyebrow">진행률</div><div class="metric">${count}<small> / 6일</small></div></div>${ctag(L.scheme(state.mode,state.week).name)}</div><div class="progress"><div class="progress-fill" style="width:${count/6*100}%"></div></div></div>
 <div class="card">${L.DAYS.map((d,i)=>{const s=session(d.id);const status=d.kind==='rest'?'자유 휴식':s?.completedAt?'완료':s?.startedAt?'진행 중':'대기';const meta=d.kind==='lift'?`${L.LIFTS[d.lift].label} · TM ${L.nfmt((s?.tm||state.tm)[d.lift])}kg · ${assistInfo(d).label}`:d.kind==='condition'?`${d.activity} · ${assistInfo(d).label}`:'별도 완료 버튼 없음';return `<div class="week-card"><div class="week-number">${L.WEEK_DAYS[i]}</div><div class="week-main"><b>${d.label}</b><p>${meta}</p></div><span class="week-stamp" style="color:${s?.completedAt?'var(--lime)':'var(--muted)'}">${status}</span><button class="btn tiny" data-open-day="${i}">열기</button></div>`}).join('')}</div>
 <div class="card"><h3>주차별 메인 세트</h3><div class="stack" style="gap:8px">${[1,2,3,4].filter(w=>state.settings.deload||w!==4).map(w=>{const s=L.scheme(state.mode,w);return `<div class="row spread" style="padding:5px 0"><span class="small">${w}주 · ${s.name}</span><b style="font-size:12px">${s.pcts.map((p,i)=>`${Math.round(p*100)}%×${s.reps[i]}${s.pr&&i===2?'+':''}`).join(' / ')}</b></div>`}).join('')}</div></div>
 <button class="btn outline full" data-act="force-next">휴식·결근 등으로 못 채운 주차 건너뛰기</button>
 <p class="footnote">강제로 주차를 넘기면 현재 진행 중인 기록은 내역에 보존하지만, 미완료 운동을 수행한 것으로 간주하지 않습니다.</p>`;
 $('#view-week').innerHTML=html;
}
function renderTimerCore(){const t=state.timer;let timerName=t?.label||'타이머 선택 대기';return `<div class="timer-card"><div class="row spread"><span class="eyebrow" id="timer-name">${escapeHTML(timerName)}</span>${ctag(t?.kind==='tabata'?'TABATA':'CLOCK')}</div>
 <div class="timer-digits" id="timer-digits">${t?rtime(timerRemaining(t)/1000):'00:00'}</div><div class="timer-description" id="timer-phase">${t?'측정 중':'타이머를 시작하세요'}</div>
 <div class="progress" style="margin:14px 0 16px"><div class="progress-fill" id="timer-bar" style="width:100%"></div></div>
 <div class="timer-controls"><button class="btn outline" data-timer-action="pause" id="timer-pause">일시정지</button><button class="btn outline" data-timer-action="plus">+30초</button><button class="btn outline" data-timer-action="stop">종료</button></div>
 <p class="footnote">백그라운드에서는 종료 예정 시각을 저장합니다. 다시 열면 정확한 남은 시간으로 복원되지만 알림·소리의 백그라운드 실행은 운영체제에 따라 보장되지 않습니다.</p></div>`}
function renderTimers(){const tab=state.settings;
 $('#view-timers').innerHTML=`<div class="eyebrow">TRAINING TOOLS</div><h1 class="page-title">트레이닝 타이머</h1><p class="subtitle">운동 기록과 별도로 사용할 수도 있습니다. 앱을 다시 열면 진행 상태를 복원합니다.</p>
 ${renderTimerCore()}
 <div class="section-head"><h3>빠른 시작</h3></div>
 <div class="stack">${[{kind:'rest',sec:60,name:'워밍업 휴식',desc:'1분'},{kind:'rest',sec:180,name:'메인·조커·위도우 휴식',desc:'3분'},{kind:'rest',sec:90,name:'등·복근 보조운동 휴식',desc:'1분 30초'},{kind:'rest',sec:120,name:'겟업·파머스 캐리 휴식',desc:'2분'},{kind:'tgu',sec:1200,name:'터키시 겟업',desc:'1×10회 · 최대 20분'},{kind:'carry',sec:1200,name:'파머스 캐리',desc:'왕복 총 60m × 기본 3세트'}].map(p=>`<button class="timer-mode-card" data-start-timer="${p.kind}" data-seconds="${p.sec}"><span><b>${p.name}</b><small>${p.desc}</small></span><span class="success">▶</span></button>`).join('')}</div>
 <div class="section-head"><h3>타바타 타이머</h3>${ctag('기본 20:10 × 8','','gray')}</div>
 <div class="card"><div class="grid2"><label><span class="small">운동 (초)</span><input class="input" data-setting="tabWork" type="number" min="5" max="180" value="${tab.tabWork}"></label><label><span class="small">휴식 (초)</span><input class="input" data-setting="tabRest" type="number" min="5" max="120" value="${tab.tabRest}"></label><label><span class="small">라운드</span><input class="input" data-setting="tabRounds" type="number" min="1" max="30" value="${tab.tabRounds}"></label><label><span class="small">세트</span><input class="input" data-setting="tabSets" type="number" min="1" max="10" value="${tab.tabSets}"></label></div>
 <label class="field-label">세트 간 회복 (초)</label><input class="input" type="number" data-setting="tabBetween" min="0" max="300" value="${tab.tabBetween}">
 <button class="btn primary full" style="margin-top:14px" data-start-timer="tabata">▶ 타바타 시작</button><p>준비 5초 후 운동·휴식이 교대로 진행됩니다. 세트 마지막에는 일반 휴식을 생략합니다.</p></div>`;
}
function renderHistory(){const records=state.history||[];
 let html=`<div class="eyebrow">ACTIVITY ARCHIVE</div><h1 class="page-title">훈련 기록</h1><p class="subtitle">기록은 현재 사용하는 기기에 저장됩니다. 기기를 바꾸기 전에 JSON 백업을 권장합니다.</p>
 <div class="card"><div class="row spread"><div><div class="eyebrow">저장된 운동</div><div class="metric">${records.length}<small>건</small></div></div><div><div class="eyebrow">누적 운동 시간</div><div class="metric" style="font-size:23px">${humanTime(records.reduce((n,x)=>n+(x.durationMs||0),0)/1000)}</div></div></div></div>
 <div class="btn-group"><button class="btn outline" data-act="export-json">JSON 백업</button><button class="btn outline" data-act="export-csv">CSV 기록</button></div>
 <div class="section-head"><h3>최근 훈련</h3></div>`;
 if(!records.length)html+='<div class="card"><p>저장된 운동이 없습니다. 오늘 탭에서 훈련을 마치고 ‘오늘 운동 완료’를 눌러주세요.</p></div>';
 else html+=records.slice().reverse().map(r=>{const d=L.DAYS.find(x=>x.id===r.day);const summary=r.day!=='rest'?(d?.kind==='lift'?(r.summary?.last||'본운동 완료'):(r.summary?.activity||'컨디셔닝 완료')):'';return `<div class="card"><div class="row spread"><div><div class="eyebrow">C${r.cycle} · W${r.week} · ${escapeHTML(r.mode==='351'?'3/5/1':'5/3/1')}</div><h3 style="margin:7px 0">${escapeHTML(d?.label||r.day)}</h3></div><span class="badge gray">${escapeHTML(r.date)}</span></div><div class="row spread"><span class="small">${escapeHTML(summary)}</span><b style="font-size:12px">${humanTime((r.durationMs||0)/1000)}</b></div>${r.notes?`<p>${escapeHTML(r.notes)}</p>`:''}<details style="margin-top:10px"><summary class="small">상세 세트 기록 펼치기</summary><pre style="white-space:pre-wrap;word-break:break-word;color:var(--muted);font-size:11px;line-height:1.7">${escapeHTML(r.summary?.details||'미기록')}</pre></details></div>`}).join('');
 $('#view-history').innerHTML=html;
}
function renderSettings(){let html=`<div class="eyebrow">PERSONAL SETTINGS</div><h1 class="page-title">설정</h1><p class="subtitle">현재 TM은 기존 기록을 반영했습니다. OHP 52.5kg은 최근 훈련 평가 후 조정한 값이며 필요하면 직접 변경할 수 있습니다.</p>
 <div class="card"><h3>훈련 기준 중량 (TM)</h3>${Object.entries(L.LIFTS).map(([id,l])=>`<div class="settings-tm"><label for="tm-${id}">${l.label}</label><div><input id="tm-${id}" class="input" type="number" min="20" max="500" step="2.5" value="${state.tm[id]}" data-tm="${id}"></div></div>`).join('')}
 <div class="line"></div><div class="grid2"><label><span class="small">현재 사이클</span><input class="input" type="number" min="1" max="999" step="1" data-position="cycle" value="${state.cycle}"></label><label><span class="small">현재 주차</span><select class="input" data-position="week">${[1,2,3,4].map(w=>`<option value="${w}" ${state.week===w?'selected':''}>${w}주차${w===4?' · 디로드':''}</option>`).join('')}</select></label></div><p class="footnote">지금 진행 중인 주차로 맞출 수 있습니다. 이미 입력한 다른 주차 기록은 보존됩니다.</p>
 <div class="line"></div><label class="field-label">훈련 모드</label><div class="mode-switch"><button data-mode="531" class="${state.mode==='531'?'active':''}">5/3/1 · 일반</button><button data-mode="351" class="${state.mode==='351'?'active':''}">3/5/1 · 바쁜 시기</button></div>
 <div class="toggle-row"><div><b style="font-size:13px">4주차 디로드 포함</b><div class="footnote">기본 3주 훈련 + 4주차 가벼운 회복</div></div><input type="checkbox" class="toggle" data-toggle="deload" ${state.settings.deload?'checked':''}></div>
 <div class="toggle-row"><div><b style="font-size:13px">새 사이클 TM 자동 증량</b><div class="footnote">하체 +5kg, 상체 +2.5kg. 기본 OFF로 설정</div></div><input type="checkbox" class="toggle" data-toggle="autoTM" ${state.settings.autoTM?'checked':''}></div>
 </div>
 <div class="card"><h3>등·복근 교대 운동 설정</h3><p class="footnote">운동일마다 등 → 복근을 교대로 수행합니다. 하체·상체 종목과 관계없이 적용됩니다.</p>
 <div class="grid2"><label><span class="small">등 운동</span><select class="input" data-setting-choice="backExercise"><option value="inverted" ${state.settings.backExercise!=='pullup'?'selected':''}>인버티드 로우 (현재)</option><option value="pullup" ${state.settings.backExercise==='pullup'?'selected':''}>풀업 (향후)</option></select></label>
 <label><span class="small">복근 운동</span><select class="input" data-setting-choice="coreExercise"><option value="knee" ${state.settings.coreExercise!=='leg'?'selected':''}>행잉 니레이즈 (현재)</option><option value="leg" ${state.settings.coreExercise==='leg'?'selected':''}>행잉 레그레이즈 (향후)</option></select></label></div>
 <div class="line"></div><label class="field-label">현재 체중 (kg)</label><input class="input" type="number" min="30" max="250" step=".1" value="${state.settings.bodyweight}" data-setting="bodyweight"></div>
 <div class="card"><h3>알림과 설치</h3><div class="toggle-row"><div><b style="font-size:13px">타이머 완료 소리</b><div class="footnote">앱이 열린 상태에서 가능</div></div><input type="checkbox" class="toggle" data-toggle="sound" ${state.settings.sound?'checked':''}></div>
 <div class="toggle-row"><div><b style="font-size:13px">진동</b><div class="footnote">브라우저·기기 지원 시</div></div><input type="checkbox" class="toggle" data-toggle="vibrate" ${state.settings.vibrate?'checked':''}></div>
 <div class="btn-group"><button class="btn outline" data-act="enable-notify">알림 권한 요청</button><button class="btn outline" id="install-app" data-act="install">홈 화면에 설치</button></div>
 <div class="info-box amber" style="margin-top:12px">PWA에서는 타이머의 종료 시각과 기록을 보존하지만, 화면 잠금 상태에서 정확한 시점의 소리·진동·알림은 보장하지 않습니다. 확실한 백그라운드 알림에는 네이티브 앱이 필요합니다.</div></div>
 <div class="card"><h3>백업 및 데이터</h3><div class="btn-group"><button class="btn outline" data-act="export-json">백업 내보내기</button><button class="btn outline" data-act="export-csv">CSV 기록 내보내기</button></div><label class="field-label">백업 파일 복원 (.json)</label><input class="input" id="import-json" type="file" accept=".json,application/json"><button class="btn danger-outline" style="margin-top:14px" data-act="reset-data">기록 전체 초기화</button></div>
 <p class="footnote">PWA v1.2 · 광고·외부 계정·서버 전송 없음. 데이터는 브라우저 저장 공간에만 남으므로 삭제 전 반드시 백업하세요.</p>`;
 $('#view-settings').innerHTML=html;
}
function updateRecPanel(){if(currentTab!=='today')return;const d=dayInfo();if(d.kind!=='lift')return;const s=session(d.id);const plan=selectedPlan(s,d);const r=recommendationFor(s,plan);
 const title=$('#rec-title'),desc=$('#rec-description');if(title&&desc){title.textContent={pending:'기록 입력 후 추천',skip:'생략 권장',joker:'조커 권장',widow:'위도우메이커 선택 가능'}[r.type];desc.textContent=r.reason;}
}
function onCheck(id,checked){const d=dayInfo(),s=session(d.id,true);if(s.completedAt)return;
 startSession(s);s.checked[id]=checked;
 const rows=d.kind==='lift'?[...selectedPlan(s,d).warm,...selectedPlan(s,d).main,...assistRows(d),{id:'joker',reps:3,rest:180},{id:'widow',reps:15,rest:180}]:[...skillRows(d),...assistRows(d)];
 const found=rows.find(x=>x.id===id);
 if(checked&&s.actual[id]===undefined&&found)s.actual[id]=found.reps;
 save();if(checked){const rest=found?.rest??0;if(rest>0)startTimer('rest',rest,`${id.startsWith('assist')?'보조운동':id.startsWith('main')?'메인세트':id==='joker'?'조커':id==='widow'?'위도우메이커':id.startsWith('carry')?'캐리':id.startsWith('tgu')?'겟업':'워밍업'} 후 휴식`);else stopTimer();}renderToday();}
function completedSummary(d,s){let details=[];let last='';
 if(d.kind==='lift'){
  const plan=selectedPlan(s,d);
  for(const r of [...plan.warm,...plan.main])details.push(`${r.label}: ${L.nfmt(r.kg)}kg × ${s.actual[r.id]??'미기록'}회`);
  const tail=plan.main[2];last=`${L.LIFTS[d.lift].label} ${L.nfmt(tail.kg)}kg × ${s.actual.main2??'미기록'}회`;
  if(s.choice==='joker'||s.choice==='widow')details.push(`${s.choice==='joker'?'조커':'위도우'}: ${s.choice==='joker'?L.jokerLoad(s.mode,s.week,s.tm[d.lift]):L.widowLoad(s.mode,s.week,s.tm[d.lift])}kg × ${s.actual[s.choice]??'미기록'}회`);
  details.push(`추가운동 ${s.choice==='skip'?'생략':s.choice}, RIR ${s.rir||'미기록'}`);
 }else{
  details.push(`준비 걷기(선택): ${s.activities.walk?'완료':'생략'}`);
  for(const r of skillRows(d))details.push(`${r.label}: ${r.kg?L.nfmt(r.kg)+'kg/손, ':''}목표 ${r.reps}${r.unit||'회'}, 실제 ${s.actual[r.id]??'미기록'}${r.unit||'회'}`);
 }
 const a=assistInfo(d);
 for(let i=0;i<3;i++)details.push(`${a.label} ${i+1}세트: ${s.actual['assist'+i]??'미기록'}회`);
 return {last,activity:d.activity,details:details.join('\n')};
}
function completeDay(){const d=dayInfo();if(d.kind==='rest')return;
 const s=session(d.id,true);if(s.completedAt)return;
 const basic=d.kind==='lift'?selectedPlan(s,d).main.map(x=>x.id):skillRows(d).map(x=>x.id);
 const missing=basic.filter(id=>!s.checked[id]);
 if(missing.length&&!window.confirm(`아직 완료되지 않은 핵심 항목 ${missing.length}개가 있습니다. 현재 상태 그대로 훈련을 종료하고 기록할까요?`))return;
 pauseSession(s);s.completedAt=Date.now();s.notes=String(s.notes||'');s.skipped=missing.length>0;
 const rec={id:s.key,day:d.id,cycle:s.cycle,week:s.week,mode:s.mode,tm:clone(s.tm),date:today(),timestamp:s.completedAt,durationMs:s.elapsedMs||0,actual:clone(s.actual),checked:clone(s.checked),activities:clone(s.activities),rir:s.rir,condition:s.condition,choice:s.choice,notes:s.notes,summary:completedSummary(d,s)};
 state.history.push(rec);stopTimer();save();
 const count=currentWeekCompleted();if(count===6){advanceWeek(true);notify('이번 주 완료! 다음 주차로 자동 이동했습니다.')}else{notify(`훈련 저장 완료 · 이번 주 ${count}/6일`);renderToday();}
}
function advanceWeek(auto=false){const from={cycle:state.cycle,week:state.week};const result=L.cycleAfter(from.cycle,from.week,state.settings.deload);
 state.cycle=result.cycle;state.week=result.week;
 if(result.newCycle&&state.settings.autoTM){state.tm.squat+=5;state.tm.dead+=5;state.tm.bench+=2.5;state.tm.press+=2.5;}
 activeDay=0;save();renderCurrent();if(!auto)notify(`사이클 ${state.cycle} · ${state.week}주차로 이동`);
}
function setMode(mode){if(state.mode===mode)return;state.mode=mode;save();notify(`${mode==='351'?'3/5/1':'5/3/1'} 모드 선택 · 시작된 운동은 기존 모드 유지`);renderCurrent();}
function onChoice(choice){const d=dayInfo(),s=session(d.id,true);if(s.completedAt)return;const p=selectedPlan(s,d);if(!p.scheme.pr){notify('이번 주는 PR 세트가 없어서 추가운동을 생략합니다.');return;}
 if(choice==='joker'||choice==='widow'){const rec=recommendationFor(s,p);if(rec.type==='skip'&&s.actual.main2!==undefined&&!window.confirm('회복 상태상 추가운동 생략을 권장합니다. 그래도 선택하시겠습니까?'))return;}
 s.choice=choice;save();renderToday();}
function startTimer(kind,seconds,label){let sec=Number(seconds)||180,phases=null;
 if(kind==='tabata'){const c=state.settings;phases=L.buildTabata(Number(c.tabWork),Number(c.tabRest),Number(c.tabRounds),Number(c.tabSets),Number(c.tabBetween));sec=phases.reduce((a,p)=>a+p.seconds,0);label='타바타';}
 const names={rest:'휴식',tgu:'터키시 겟업',carry:'파머스 캐리',walking:'준비 걷기',tabata:'타바타'};
 state.timer={kind,label:label||names[kind]||'타이머',durationMs:sec*1000,remainingMs:sec*1000,endAt:Date.now()+sec*1000,running:true,finished:false,phases,alerted:false};
 lastPhaseMark='';save();requestWake();updateLiveUI();if(currentTab==='timers'){renderTimers();updateLiveUI();}notify(`${label||names[kind]} 타이머 시작`);
}
function stopTimer(){if(state.timer){state.timer=null;releaseWake();save();updateLiveUI()}}
function timerRemaining(t){if(!t)return 0;return t.running?Math.max(0,t.endAt-Date.now()):t.remainingMs||0;}
function timerControl(cmd){const t=state.timer;if(!t)return;
 if(cmd==='pause'){if(t.running){t.remainingMs=timerRemaining(t);t.running=false;notify('타이머 일시정지');}}
 else if(cmd==='resume'){if(!t.running){t.endAt=Date.now()+(t.remainingMs||t.durationMs);t.running=true;notify('타이머 재개');}}
 else if(cmd==='plus'){t.remainingMs=timerRemaining(t)+30000;t.durationMs+=30000;if(t.running)t.endAt=Date.now()+t.remainingMs;}
 else if(cmd==='stop'){state.timer=null;releaseWake();notify('타이머 종료');}
 save();if(currentTab==='timers')renderTimers();updateLiveUI();
}
async function requestWake(){try{if('wakeLock'in navigator&&document.visibilityState==='visible'){wakeLock=await navigator.wakeLock.request('screen');}}catch(e){}}
async function releaseWake(){try{if(wakeLock){await wakeLock.release();wakeLock=null}}catch(e){}}
function beep(){if(!state.settings.sound)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext=audioContext||new AC();const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=660;gain.gain.setValueAtTime(.1,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.25);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+.26);}catch(e){}}
function alertEnd(t){if(t.alerted)return;t.alerted=true;save();beep();try{if(state.settings.vibrate&&navigator.vibrate)navigator.vibrate([120,90,120]);}catch(e){}
 try{if('Notification'in window&&Notification.permission==='granted'&&navigator.serviceWorker?.controller){navigator.serviceWorker.ready.then(reg=>reg.showNotification('531 TRAIN · 타이머 완료',{body:`${t.label} 시간이 끝났습니다.`,tag:'531-timer',icon:'./icons/icon-192.png'})).catch(()=>{});}else if('Notification'in window&&Notification.permission==='granted'){new Notification('531 TRAIN · 타이머 완료',{body:`${t.label} 시간이 끝났습니다.`})}}catch(e){}
 notify(`${t.label} 타이머가 종료되었습니다.`);
}
function tickTimer(){const t=state.timer;if(!t){$('#floating-timer').hidden=true;return;}
 let left=timerRemaining(t);if(t.running&&left<=0){t.running=false;t.remainingMs=0;t.finished=true;left=0;releaseWake();save();alertEnd(t)}
 const v=$('#timer-digits');if(v)v.textContent=rtime(left/1000);
 const elapsed=(t.durationMs-left)/1000;let detail=t.finished?'완료':t.running?'진행 중':'일시정지';
 if(t.kind==='tabata'&&t.phases){const phase=L.getPhase(t.phases,elapsed);detail=`${phase.name} · 남은 ${rtime(phase.remaining)}`;
   if(t.running&&phase.index!==lastPhaseMark&&lastPhaseMark!==''){beep();if(state.settings.vibrate&&navigator.vibrate)navigator.vibrate(70)}lastPhaseMark=phase.index;
 }else if(t.kind==='tgu'||t.kind==='carry'){const g=L.GUIDES[t.kind].find(x=>elapsed>=x.start&&elapsed<x.end);if(g)detail=g.title+' · '+g.detail;}
 const ph=$('#timer-phase');if(ph)ph.textContent=detail;
 const bar=$('#timer-bar');if(bar)bar.style.width=Math.max(0,Math.min(100,100*left/t.durationMs))+'%';
 const dock=$('#floating-timer');dock.hidden=false;$('#ft-label').textContent=t.label;$('#ft-time').textContent=rtime(left/1000);$('#ft-phase').textContent=detail;
 const pause=$('#timer-pause');if(pause){pause.textContent=t.running?'일시정지':'계속';pause.dataset.timerAction=t.running?'pause':'resume';}
 const dockBtn=$('[data-timer-action="pause"]',dock);if(dockBtn){dockBtn.dataset.timerAction=t.running?'pause':'resume';dockBtn.textContent=t.running?'일시정지':'계속';}
 const elapsedNodes=$all('[data-elapsed]');if(elapsedNodes.length){const s=session(dayInfo().id);elapsedNodes.forEach(e=>e.textContent=humanTime(sessionDuration(s)/1000));}
}
function updateLiveUI(){tickTimer();if(!state.timer){const elapsedNodes=$all('[data-elapsed]');if(elapsedNodes.length){const s=session(dayInfo().id);elapsedNodes.forEach(e=>e.textContent=humanTime(sessionDuration(s)/1000));}}}
function downloadFile(name,type,data){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function exportJSON(){downloadFile('531_train_backup_'+new Date().toISOString().slice(0,10)+'.json','application/json;charset=utf-8',JSON.stringify(state,null,2))}
function exportCSV(){const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';const columns=['날짜','사이클','주차','모드','운동','소요시간(분)','메인 최종','RIR','선택 운동','컨디션','메모'];const lines=[columns.map(q).join(',')];for(const r of state.history){lines.push([r.date,r.cycle,r.week,r.mode,L.DAYS.find(x=>x.id===r.day)?.label||r.day,(r.durationMs/60000).toFixed(1),r.summary?.last||r.summary?.activity||'',r.rir,r.choice,r.condition,r.notes].map(q).join(','))}downloadFile('531_train_history_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8','\uFEFF'+lines.join('\r\n'))}
function requestNotif(){if(!('Notification'in window)){notify('이 기기 브라우저에서는 웹 알림을 사용할 수 없습니다.');return;}if(!window.isSecureContext){notify('웹 알림은 HTTPS 환경에서 설치 후 사용할 수 있습니다.');return;}Notification.requestPermission().then(r=>notify(r==='granted'?'알림 허용됨 · 백그라운드 전달은 보장되지 않음':'알림 권한이 허용되지 않았습니다.')).catch(()=>notify('알림 권한 요청 실패'))}
function handleAction(act){if(act==='session-toggle'){const d=dayInfo(),s=session(d.id,true);s.runningSince?pauseSession(s):startSession(s);renderToday();return;}
 if(act==='complete-day')return completeDay();
 if(act==='force-next'){if(window.confirm('아직 완료하지 않은 운동이 있어도 다음 주차로 이동합니다. 계속할까요?'))advanceWeek();return;}
 if(act==='export-json')return exportJSON();if(act==='export-csv')return exportCSV();if(act==='enable-notify')return requestNotif();
 if(act==='install'){if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(()=>{installPrompt=null});}else notify('Android는 Chrome ⋮ → 앱 설치, iPhone은 Safari 공유 → 홈 화면에 추가를 사용하세요. HTTPS 배포가 필요합니다.');return;}
 if(act==='reset-data'){if(window.confirm('모든 훈련 기록, 타이머, 설정을 초기화합니다. 먼저 JSON 백업을 권장합니다. 초기화할까요?')){state=clone(DEFAULT);save();setTab('today');notify('모든 데이터가 초기화되었습니다.');}return;}
}
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('[data-tab]');if(nav){setTab(nav.dataset.tab);return;}
 const sd=ev.target.closest('[data-day]');if(sd){activeDay=Number(sd.dataset.day);renderCurrent();return;}
 const dayOpen=ev.target.closest('[data-open-day]');if(dayOpen){activeDay=Number(dayOpen.dataset.openDay);setTab('today');return;}
 const mode=ev.target.closest('[data-mode]');if(mode){setMode(mode.dataset.mode);return;}
 const radio=ev.target.closest('[data-radio]');if(radio){onChoice(radio.dataset.radioValue);return;}
 const a=ev.target.closest('[data-act]');if(a){handleAction(a.dataset.act);return;}
 const timerStart=ev.target.closest('[data-start-timer]');if(timerStart){
   const kind=timerStart.dataset.startTimer,sec=Number(timerStart.dataset.seconds||0);
   if(kind==='tabata'){
     const s=state.settings;if([s.tabWork,s.tabRest,s.tabRounds,s.tabSets,s.tabBetween].some(x=>!Number.isFinite(Number(x))||Number(x)<0)||Number(s.tabWork)<5||Number(s.tabRounds)<1||Number(s.tabSets)<1){notify('타바타 설정값을 확인하세요.');return;}
     if(Number(s.tabRounds)>30||Number(s.tabSets)>10){notify('타바타 라운드는 30, 세트는 10 이하로 설정하세요.');return;}
   }
   if(currentTab==='today'&&dayInfo().kind!=='rest')startSession(session(dayInfo().id,true));
   startTimer(kind,sec);return;
 }
 const timerCtrl=ev.target.closest('[data-timer-action]');if(timerCtrl){timerControl(timerCtrl.dataset.timerAction);return;}
});
document.addEventListener('change',ev=>{
 const target=ev.target;
 if(target.matches('[data-checked]')){onCheck(target.dataset.checked,target.checked);return;}
 if(target.matches('[data-mobility]')){const s=session(dayInfo().id,true);startSession(s);s.activities.mobility=target.checked;save();return;}
 if(target.matches('[data-activity]')){const s=session(dayInfo().id,true);startSession(s);s.activities[target.dataset.activity]=target.checked;save();return;}
 if(target.matches('[data-setting-choice]')){const k=target.dataset.settingChoice;const allow=k==='backExercise'?['inverted','pullup']:k==='coreExercise'?['knee','leg']:[];if(allow.includes(target.value)){state.settings[k]=target.value;save();notify('운동 종류가 변경되었습니다.');}renderSettings();return;}
 if(target.matches('[data-field]')){const s=session(dayInfo().id,true);s[target.dataset.field]=target.value;save();updateRecPanel();return;}
 if(target.matches('[data-position]')){const kind=target.dataset.position,value=Number(target.value);if(!Number.isInteger(value)||value<1||(kind==='week'&&value>4)||(kind==='cycle'&&value>999)){notify('사이클/주차 입력값을 확인하세요.');renderSettings();return;}if(value!==state[kind]&&window.confirm(`현재 ${kind==='week'?'주차':'사이클'}을 ${value}(으)로 변경할까요? 기존 기록은 유지됩니다.`)){state[kind]=value;save();notify('진행 위치를 변경했습니다.');}renderSettings();return;}
 if(target.matches('[data-toggle]')){state.settings[target.dataset.toggle]=target.checked;save();if(target.dataset.toggle==='deload'&&state.week===4&&!target.checked)notify('4주차 진행 중에는 디로드가 유지됩니다. 다음 사이클부터 3주형으로 적용하세요.');renderSettings();return;}
 if(target.matches('[data-tm]')){const k=target.dataset.tm,v=Number(target.value);if(v>=20&&v<=500){state.tm[k]=L.roundLoad(v);save();notify('TM 저장 · 이미 시작한 운동의 TM은 유지됩니다.');renderSettings();}else{notify('TM은 20~500kg 사이로 입력하세요.');renderSettings();}return;}
 if(target.matches('[data-setting]')){const k=target.dataset.setting;
   if(k==='age'){const v=Number(target.value);state.settings.age=(target.value===''?'':(v>=16&&v<=90?v:''));}
   else{const v=Number(target.value);
    const rules={carryWeight:[2.5,40],carrySets:[1,6],carryDistance:[10,200],carryRest:[30,600]};
    if(Number.isFinite(v)&&v>=0&&(!rules[k]||(v>=rules[k][0]&&v<=rules[k][1]))){state.settings[k]=k==='carryWeight'?L.roundLoad(v):v;}
    else{notify('입력값의 범위를 확인하세요.');}
   }
   save();if(currentTab==='settings')renderSettings();else if(currentTab==='today'&&dayInfo().kind==='condition')renderToday();else if(currentTab==='timers')renderTimers();return;}
 if(target.id==='import-json'&&target.files&&target.files[0]){
   const f=target.files[0];f.text().then(v=>{const json=JSON.parse(v);if(!json||!json.sessions||!json.tm||!Array.isArray(json.history))throw Error('파일 형식 불일치');if(!window.confirm('현재 앱 데이터를 백업 파일로 덮어씁니다. 계속할까요?'))return;state={...clone(DEFAULT),...json,settings:{...DEFAULT.settings,...json.settings}};save();setTab('today');notify('백업을 복원했습니다.');}).catch(()=>notify('백업 파일을 읽을 수 없습니다.')).finally(()=>{target.value='';});return;}
});
document.addEventListener('input',ev=>{
 const target=ev.target;
 if(target.matches('[data-reps]')){
  const d=dayInfo(),s=session(d.id,true);if(s.completedAt)return;
  s.actual[target.dataset.reps]=target.value;startSession(s);save();updateRecPanel();return;
 }
 if(target.matches('[data-notes]')){const s=session(dayInfo().id,true);s.notes=target.value;save();return;}
});
$('#quick-settings').addEventListener('click',()=>setTab('settings'));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('appinstalled',()=>{installPrompt=null;notify('홈 화면에 설치되었습니다.');});
document.addEventListener('visibilitychange',()=>{updateLiveUI();if(document.visibilityState==='visible'&&state.timer?.running)requestWake()});
window.addEventListener('pageshow',updateLiveUI);
window.addEventListener('beforeunload',save);
setInterval(updateLiveUI,500);
if('serviceWorker'in navigator&&['https:','http:'].includes(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderCurrent();
})();
