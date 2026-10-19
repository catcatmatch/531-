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
  {id:'carry',label:'컨디셔닝 B',kind:'condition',mobility:'걷기 5분',activity:'수트케이스 캐리',timerKind:'carry'},
  {id:'rest',label:'휴식',kind:'rest'}
 ];
 const WEEK_DAYS=['월','화','수','목','금','토','일'];
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
   {start:0,end:240,title:'동작 익히기',detail:'맨손으로 굴러 팔꿈치 → 손 짚기 → 브리지 자세를 좌우 2회씩 천천히 연습'},
   {start:240,end:540,title:'하프 겟업',detail:'누운 자세에서 하프 니링까지 좌우 1회씩 2~3라운드. 팔은 수직으로 유지'},
   {start:540,end:1020,title:'전체 동작 연습',detail:'맨손 또는 아주 가벼운 도구로 좌우 1회씩 2~3라운드. 속도보다 기술'},
   {start:1020,end:1200,title:'점검과 정리',detail:'무릎과 어깨 상태 확인, 가벼운 동작 복습. 지쳤다면 여기서 종료'}
  ],
  carry:[
   {start:0,end:240,title:'가벼운 리허설',detail:'한 손 5~10kg으로 좌우 10~15m씩 걷기, 수평 자세와 걸음 점검'},
   {start:240,end:960,title:'좌우 교대 캐리',detail:'한 손 10~15kg부터: 왼쪽 20m + 오른쪽 20m, 45~75초 쉼. 4~6라운드'},
   {start:960,end:1200,title:'가볍게 마무리',detail:'덤벨을 내려놓고 천천히 걸으면서 호흡 정리. 불균형과 악력 피로 기록'}
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
 const api={LOAD_STEP,LIFTS,DAYS,WEEK_DAYS,roundLoad,nfmt,scheme,warmup,mainSets,jokerLoad,widowLoad,recommendation,zone2,GUIDES,buildTabata,getPhase,cycleAfter};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 global.FiveThreeOneLogic=api;
 })(typeof window!=='undefined'?window:globalThis);
