/* 5/3/1 training rules. Vanilla JS, shared by browser and Node tests. */
(function(global){
 'use strict';
 const LOAD_STEP=2.5;
 function roundLoad(n){return Math.max(0,Math.round(Number(n)/LOAD_STEP)*LOAD_STEP);}
 function nfmt(x){return Number.isInteger(x)?String(x):Number(x).toFixed(1);}
 const LIFTS={squat:{label:'스쿼트',short:'SQ',defaultTM:127.5},bench:{label:'벤치프레스',short:'BP',defaultTM:82.5},dead:{label:'데드리프트',short:'DL',defaultTM:135},press:{label:'오버헤드 프레스',short:'OHP',defaultTM:52.5}};
 const DAYS=[
  {id:'squat',label:'스쿼트',kind:'lift',lift:'squat',mobility:'Agile 8',warmDesc:'고관절과 허리 주변 가동성 · 약 6~8분'},
  {id:'bench',label:'벤치',kind:'lift',lift:'bench',mobility:'덤벨 풀오버',warmDesc:'가벼운 덤벨 2세트 × 10회 · 어깨 통증 없게'},
  {id:'tgu',label:'컨디셔닝 A',kind:'condition',mobility:'걷기 5분',activity:'터키시 겟업',timerKind:'tgu'},
  {id:'dead',label:'데드리프트',kind:'lift',lift:'dead',mobility:'Agile 8',warmDesc:'고관절과 허리 주변 가동성 · 약 6~8분'},
  {id:'press',label:'OHP',kind:'lift',lift:'press',mobility:'오버헤드 슈러그',warmDesc:'빈 봉 또는 가벼운 부하 2세트 × 10회'},
  {id:'carry',label:'컨디셔닝 B',kind:'condition',mobility:'걷기 5분',activity:'파머스 캐리',timerKind:'carry'},
  {id:'rest',label:'휴식',kind:'rest'}
 ];
 const WEEK_DAYS=['월','화','수','목','금','토','일'];
 // Six training days per week: back → abs → back → abs → back → abs.
 const ASSISTANCE={
  inverted:{key:'inverted',label:'인버티드 로우',category:'등',reps:[8,8,8],tip:'안정적으로 고정된 바를 사용하세요. 힘들면 바를 높이고 무릎을 굽혀 난이도를 낮추세요.'},
  pullup:{key:'pullup',label:'풀업',category:'등',reps:[1,1,2],tip:'총 반복수를 누적하되 실패하지 마세요. 필요하면 밴드나 보조 머신을 활용하세요.'},
  knee:{key:'knee',label:'행잉 니레이즈',category:'복근',reps:[6,6,6],tip:'흔들림을 줄여 무릎을 천천히 올리세요. 매달리기가 어렵다면 보조형 니레이즈를 이용하세요.'},
  leg:{key:'leg',label:'행잉 레그레이즈',category:'복근',reps:[4,4,4],tip:'몸통이 흔들리지 않는 범위에서 다리를 들어 올리세요.'}
 };
 function assistanceForDay(dayId,settings={}){
  const idx=DAYS.findIndex(d=>d.id===dayId);
  if(idx<0||DAYS[idx].kind==='rest')return null;
  const category=idx%2===0?'등':'복근';
  const choice=category==='등'?(settings.backExercise||'inverted'):(settings.coreExercise||'knee');
  const safe=(category==='등'&&['inverted','pullup'].includes(choice))||(category==='복근'&&['knee','leg'].includes(choice))?choice:(category==='등'?'inverted':'knee');
  return {...ASSISTANCE[safe]};
 }
 function carryPlan(settings={}){
  // carryDistance means one complete out-and-back distance, NOT the one-way distance.
  const roundTrip=Number(settings.carryDistance)>0?Number(settings.carryDistance):60;
  const sets=Number.isInteger(Number(settings.carrySets))&&Number(settings.carrySets)>=1?Math.min(6,Number(settings.carrySets)):3;
  const perHand=Number(settings.carryWeight)>0?Number(settings.carryWeight):12.5;
  const rest=Number(settings.carryRest)>=30?Number(settings.carryRest):120;
  return {oneWay:roundTrip/2,roundTrip,sets,perHand,rest,totalDistance:roundTrip*sets};
 }
 function scheme(mode,week){
  if(week===4)return {name:'디로드',labels:['40%','50%','60%'],pcts:[.40,.50,.60],reps:[5,5,5],pr:false};
  if(week===3)return {name:'1+ 주간',labels:['75%','85%','95%'],pcts:[.75,.85,.95],reps:[5,3,1],pr:true};
  if(mode==='351'){
   if(week===1)return {name:'3+ 주간',labels:['70%','80%','90%'],pcts:[.70,.80,.90],reps:[3,3,3],pr:true};
   return {name:'5회 주간',labels:['65%','75%','85%'],pcts:[.65,.75,.85],reps:[5,5,5],pr:false};
  }
  if(week===1)return {name:'5+ 주간',labels:['65%','75%','85%'],pcts:[.65,.75,.85],reps:[5,5,5],pr:true};
  return {name:'3+ 주간',labels:['70%','80%','90%'],pcts:[.70,.80,.90],reps:[3,3,3],pr:true};
 }
 function warmup(lift,tm){
  const rows=[];
  if(lift!=='dead')rows.push({id:'empty',label:'빈 봉',kg:20,reps:lift==='bench'?10:8,rest:60});
  [[.40,5],[.50,5],[.60,3]].forEach(([pct,reps],i)=>rows.push({id:'warm'+i,label:'워밍업 '+(i+1),pct,kg:Math.max(20,roundLoad(tm*pct)),reps,rest:60}));
  return rows;
 }
 function mainSets(mode,week,tm){
  const s=scheme(mode,week);
  return s.pcts.map((pct,i)=>({id:'main'+i,label:`본세트 ${i+1} · ${s.labels[i]}`,kg:roundLoad(tm*pct),reps:s.reps[i],pr:s.pr&&i===2,rest:180}));
 }
 function jokerLoad(mode,week,tm){return roundLoad(tm*(scheme(mode,week).pcts[2]+.05));}
 function widowLoad(mode,week,tm){return roundLoad(tm*scheme(mode,week).pcts[0]);}
 function recommendation({mode,week,prReps,rir,condition,forceSkip}){
  const s=scheme(mode,week);
  if(!s.pr||forceSkip)return {type:'skip',reason:'이번 주에는 PR 세트가 없거나 회복이 우선입니다.'};
  const val=Number(prReps),remain=Number(rir),required=s.reps[2];
  if(prReps===''||prReps===null||!Number.isFinite(val))return {type:'pending',reason:'메인 마지막 PR 세트 반복수와 RIR을 입력하세요.'};
  if(val<required)return {type:'skip',reason:'최소 반복을 달성하지 못했습니다. 보충 세트보다 TM 재검토가 우선입니다.'};
  if(rir===''||rir===null||!Number.isFinite(remain))return {type:'pending',reason:'PR 세트의 RIR(남은 반복 여유)을 입력하면 추천할 수 있습니다.'};
  if(condition==='나쁨'||remain<2)return {type:'skip',reason:'피로 또는 낮은 반복 여유로 추가 중량운동을 권장하지 않습니다.'};
  if(val>=required+3&&condition==='좋음')return {type:'joker',reason:`목표 ${required}회보다 ${val-required}회 많이 수행하고 RIR이 확보되어 조커 1세트를 추천합니다.`};
  return {type:'widow',reason:'목표 반복은 달성했고 RIR도 확보되었습니다. 낮은 중량의 위도우메이커 1세트를 선택할 수 있습니다.'};
 }
 function zone2(age){const a=Number(age);if(!Number.isFinite(a)||a<16||a>90)return null;const max=220-a;return {max,low:Math.round(max*.60),high:Math.round(max*.70)};}
 const GUIDES={
  tgu:[
   {start:0,end:180,title:'기술 준비',detail:'맨손 연습과 어깨 안정성 확인. 처음이라면 숙련자의 동작 지도를 권장'},
   {start:180,end:960,title:'터키시 겟업 1×10회',detail:'좌우 5회씩, 총 10회. 횟수를 서두르지 말고 안전한 자세로 수행'},
   {start:960,end:1080,title:'휴식 2분',detail:'1세트 뒤 2분 회복. 1×10만 할 계획이라면 여기서 마무리해도 됩니다'},
   {start:1080,end:1200,title:'정리·기록',detail:'어깨·허리 상태 확인, 총 10회 완료 여부 기록'}
  ],
  carry:[
   {start:0,end:180,title:'움직임 준비',detail:'가벼운 덤벨로 짧은 거리 걷고 방향 전환을 점검'},
   {start:180,end:990,title:'60m 왕복 파머스 캐리',detail:'편도 30m + 복귀 30m = 왕복 60m를 1세트로 계산. 기본 3세트, 세트 사이 2분'},
   {start:990,end:1200,title:'회복·기록',detail:'그립·허리 피로 확인. 여유가 있을 때만 세트나 중량 증가'}
  ]
 };
 function buildTabata(work,rest,rounds,sets,between){
  const phases=[{name:'준비',kind:'prep',seconds:5}];
  for(let s=1;s<=sets;s++){
   for(let r=1;r<=rounds;r++){
    phases.push({name:`${s}세트 ${r}/${rounds} · 운동`,kind:'work',seconds:work});
    if(r<rounds)phases.push({name:`${s}세트 ${r}/${rounds} · 휴식`,kind:'rest',seconds:rest});
   }
   if(s<sets)phases.push({name:`세트 ${s} 완료 · 회복`,kind:'between',seconds:between});
  }
  return phases;
 }
 function getPhase(phases,elapsedSec){let elapsed=Math.max(0,elapsedSec);for(let i=0;i<phases.length;i++){
   if(elapsed<phases[i].seconds)return {...phases[i],index:i,remaining:phases[i].seconds-elapsed};elapsed-=phases[i].seconds;
  }return {name:'완료',kind:'done',seconds:0,index:phases.length,remaining:0};}
 function cycleAfter(cycle,week,deload){const maxWeek=deload?4:3;return week>=maxWeek?{cycle:cycle+1,week:1,newCycle:true}:{cycle,week:week+1,newCycle:false};}
 const api={LOAD_STEP,LIFTS,DAYS,WEEK_DAYS,ASSISTANCE,assistanceForDay,carryPlan,roundLoad,nfmt,scheme,warmup,mainSets,jokerLoad,widowLoad,recommendation,zone2,GUIDES,buildTabata,getPhase,cycleAfter};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 global.FiveThreeOneLogic=api;
 })(typeof window!=='undefined'?window:globalThis);
