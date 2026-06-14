/* =========================================================================
   splendor.js — "스플랜더" 기본판 (2~4인, 턴제 DOM, 서버-state CAS)
   - 보석 5색 + 골드(와일드). 개발카드 90장(40/30/20) + 귀족 10장.
   - 턴 1행동: ①서로 다른 3색 1개씩 ②같은색 2개(은행 4개↑) ③카드 예약(+골드1, 최대3장) ④카드 구매.
   - 턴 종료 토큰 10개 한도(초과분 반납). 보너스=구매카드 색 영구할인. 귀족=요구 보너스 충족 시 자동 방문(+3).
   - 15점 도달 시 그 라운드 마무리 후 최다점수 승(동점=구매카드 적은 쪽).
   - 개발카드 90장은 실제 스플랜더 정식 비용표, 귀족 10장도 정식 구성(2색×4 5장 + 3색×3 5장).

   app.js 기대 전역: splendorInitialState/splendorEnter/splendorOnRoom/splendorAct/splendorStop
   의존: net(pushState/fetchRoom/finishGame/serverNow), ui-core(app/esc/setScreen/toast/openSheet/closeSheet), tiers(tierForScore). app.js 전역 MEMBERS/presentIds.
   ========================================================================= */
const SP = { on:false, room:null, roomId:null, state:null, me:null, mySeat:null, amSpectator:false, version:0, busy:false, pick:[], discard:[] };

const SP_GEM   = ['w','u','g','r','k'];            // white,blue,green,red,black
const SP_NAME  = ['다이아','사파이어','에메랄드','루비','오닉스'];
const SP_COL   = ['#e8eef5','#3b7dd8','#2faa55','#d8443f','#2b2f3a'];
const SP_TXT   = ['#1a2030','#fff','#fff','#fff','#fff'];
const SP_GOLD  = '#e6b32e';

/* ---- 개발카드 90장(40/30/20): 실제 스플랜더 정식 비용표.  t=단계, b=보너스색, p=점수, c=비용[흰,파,초,빨,검] ---- */
const SP_CARDS = ([
  // ── 1단계 40장 (색당 8장) ──
  // 오닉스(검) 보너스
  {t:1,b:4,p:0,c:[1,1,1,1,0]},{t:1,b:4,p:0,c:[1,2,1,1,0]},{t:1,b:4,p:0,c:[2,2,0,1,0]},{t:1,b:4,p:0,c:[0,0,1,3,1]},
  {t:1,b:4,p:0,c:[0,0,2,1,0]},{t:1,b:4,p:0,c:[2,0,2,0,0]},{t:1,b:4,p:0,c:[0,0,3,0,0]},{t:1,b:4,p:1,c:[0,4,0,0,0]},
  // 사파이어(파) 보너스
  {t:1,b:1,p:0,c:[1,0,1,1,1]},{t:1,b:1,p:0,c:[1,0,1,2,1]},{t:1,b:1,p:0,c:[1,0,2,2,0]},{t:1,b:1,p:0,c:[0,1,3,1,0]},
  {t:1,b:1,p:0,c:[1,0,0,0,2]},{t:1,b:1,p:0,c:[0,0,2,0,2]},{t:1,b:1,p:0,c:[0,0,0,0,3]},{t:1,b:1,p:1,c:[0,0,0,4,0]},
  // 다이아(흰) 보너스
  {t:1,b:0,p:0,c:[0,1,1,1,1]},{t:1,b:0,p:0,c:[0,1,2,1,1]},{t:1,b:0,p:0,c:[0,2,2,0,1]},{t:1,b:0,p:0,c:[3,1,0,0,1]},
  {t:1,b:0,p:0,c:[0,0,0,2,1]},{t:1,b:0,p:0,c:[0,2,0,0,2]},{t:1,b:0,p:0,c:[0,3,0,0,0]},{t:1,b:0,p:1,c:[0,0,4,0,0]},
  // 에메랄드(초) 보너스
  {t:1,b:2,p:0,c:[1,1,0,1,1]},{t:1,b:2,p:0,c:[1,1,0,1,2]},{t:1,b:2,p:0,c:[0,1,0,2,2]},{t:1,b:2,p:0,c:[1,3,1,0,0]},
  {t:1,b:2,p:0,c:[2,1,0,0,0]},{t:1,b:2,p:0,c:[0,2,0,2,0]},{t:1,b:2,p:0,c:[0,0,0,3,0]},{t:1,b:2,p:1,c:[0,0,0,0,4]},
  // 루비(빨) 보너스
  {t:1,b:3,p:0,c:[1,1,1,0,1]},{t:1,b:3,p:0,c:[2,1,1,0,1]},{t:1,b:3,p:0,c:[2,0,1,0,2]},{t:1,b:3,p:0,c:[1,0,0,1,3]},
  {t:1,b:3,p:0,c:[0,2,1,0,0]},{t:1,b:3,p:0,c:[2,0,0,2,0]},{t:1,b:3,p:0,c:[3,0,0,0,0]},{t:1,b:3,p:1,c:[4,0,0,0,0]},
  // ── 2단계 30장 (색당 6장) ──
  {t:2,b:4,p:1,c:[3,2,2,0,0]},{t:2,b:4,p:1,c:[3,0,3,0,2]},{t:2,b:4,p:2,c:[0,1,4,2,0]},{t:2,b:4,p:2,c:[0,0,5,3,0]},{t:2,b:4,p:2,c:[5,0,0,0,0]},{t:2,b:4,p:3,c:[0,0,0,0,6]},
  {t:2,b:1,p:1,c:[0,2,2,3,0]},{t:2,b:1,p:1,c:[0,2,3,0,3]},{t:2,b:1,p:2,c:[5,3,0,0,0]},{t:2,b:1,p:2,c:[2,0,0,1,4]},{t:2,b:1,p:2,c:[0,5,0,0,0]},{t:2,b:1,p:3,c:[0,6,0,0,0]},
  {t:2,b:0,p:1,c:[0,0,3,2,2]},{t:2,b:0,p:1,c:[2,3,0,3,0]},{t:2,b:0,p:2,c:[0,0,1,4,2]},{t:2,b:0,p:2,c:[0,0,0,5,3]},{t:2,b:0,p:2,c:[0,0,0,5,0]},{t:2,b:0,p:3,c:[6,0,0,0,0]},
  {t:2,b:2,p:1,c:[3,0,2,3,0]},{t:2,b:2,p:1,c:[2,3,0,0,2]},{t:2,b:2,p:2,c:[4,2,0,0,1]},{t:2,b:2,p:2,c:[0,5,3,0,0]},{t:2,b:2,p:2,c:[0,0,5,0,0]},{t:2,b:2,p:3,c:[0,0,6,0,0]},
  {t:2,b:3,p:1,c:[2,0,0,2,3]},{t:2,b:3,p:1,c:[0,3,0,2,3]},{t:2,b:3,p:2,c:[1,4,2,0,0]},{t:2,b:3,p:2,c:[3,0,0,0,5]},{t:2,b:3,p:2,c:[0,0,0,0,5]},{t:2,b:3,p:3,c:[0,0,0,6,0]},
  // ── 3단계 20장 (색당 4장) ──
  {t:3,b:4,p:3,c:[3,3,5,3,0]},{t:3,b:4,p:4,c:[0,0,0,7,0]},{t:3,b:4,p:4,c:[0,0,3,6,3]},{t:3,b:4,p:5,c:[0,0,0,7,3]},
  {t:3,b:1,p:3,c:[3,0,3,3,5]},{t:3,b:1,p:4,c:[7,0,0,0,0]},{t:3,b:1,p:4,c:[6,3,0,0,3]},{t:3,b:1,p:5,c:[7,3,0,0,0]},
  {t:3,b:0,p:3,c:[0,3,3,5,3]},{t:3,b:0,p:4,c:[0,0,0,0,7]},{t:3,b:0,p:4,c:[3,0,0,3,6]},{t:3,b:0,p:5,c:[3,0,0,0,7]},
  {t:3,b:2,p:3,c:[5,3,0,3,3]},{t:3,b:2,p:4,c:[0,7,0,0,0]},{t:3,b:2,p:4,c:[3,6,3,0,0]},{t:3,b:2,p:5,c:[0,7,3,0,0]},
  {t:3,b:3,p:3,c:[3,5,3,0,3]},{t:3,b:3,p:4,c:[0,0,7,0,0]},{t:3,b:3,p:4,c:[0,3,6,3,0]},{t:3,b:3,p:5,c:[0,0,7,3,0]},
]).map((c,i) => ({ id:i, ...c }));
// 귀족 10장(각 3점): 2색×4 또는 3색×3
const SP_NOBLES = [
  [0,0,4,4,0],[4,4,0,0,0],[0,0,0,4,4],[4,0,0,0,4],[0,4,4,0,0],
  [3,3,3,0,0],[0,3,3,3,0],[0,0,3,3,3],[3,0,0,3,3],[3,3,0,0,3],
];

function spRng(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function spShuffle(arr,rng){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=arr[i];arr[i]=arr[j];arr[j]=t; } return arr; }

/* ----------------------------- 시작 state ---------------------------- */
function splendorInitialState(seated, scoresMap){
  const seats = seated.map(m=>m.seat);
  const n = seats.length;
  const seed = ((serverNow() & 0x7fffffff) ^ (n*2654435761) ^ 0x5d) >>> 0;
  const rng = spRng(seed);
  const perN = n <= 2 ? 4 : n === 3 ? 5 : 7;
  const deck = {1:[],2:[],3:[]};
  SP_CARDS.forEach(c => deck[c.t].push(c.id));
  [1,2,3].forEach(t => spShuffle(deck[t], rng));
  const vis = {1:[],2:[],3:[]};
  [1,2,3].forEach(t => { for(let i=0;i<4;i++) vis[t].push(deck[t].length ? deck[t].shift() : null); });
  const allNobles = spShuffle([0,1,2,3,4,5,6,7,8,9], rng);
  const nobles = allNobles.slice(0, n+1);
  const players={}, names={}, scores={}, P={};
  seated.forEach(m => {
    players[m.seat]=m.user_id; names[m.seat]=m.name; scores[m.seat]=(scoresMap&&scoresMap[m.seat])||0;
    P[m.seat]={ tok:[0,0,0,0,0,0], bon:[0,0,0,0,0], pts:0, cards:0, resv:[], nobles:[] };
  });
  return {
    game:'splendor', seed, players, names, scores, n,
    turn: seats[0], firstSeat: seats[0],
    bank:[perN,perN,perN,perN,perN,5],
    deck, vis, nobles, P,
    log:[], lastRound:false, ranks:null, results:null, points:{}, cardCounts:{},
  };
}

/* ----------------------------- 진입/렌더 ----------------------------- */
function splendorEnter(room, me, mySeat, amSpectator){
  SP.on=true; SP.room=room; SP.roomId=room.id; SP.state=room.state||{}; SP.version=room.version;
  SP.me=me; SP.mySeat=mySeat; SP.amSpectator=amSpectator; SP.pick=[]; SP.discard=[];
  spInjectStyles(); setScreen('splendor'); spRender(); spSkipDeparted(); spMaybeFinish();
}
function splendorOnRoom(room){
  if(!SP.on || room.id!==SP.roomId) return;
  if(room.version!=null && room.version<SP.version) return;
  const adv = room.version==null || room.version>SP.version;
  SP.room=room; SP.state=room.state||{}; SP.version=room.version;
  if(adv){ SP.pick=[]; SP.discard=[]; }
  spRender(); spSkipDeparted(); spMaybeFinish();
}
function splendorStop(){ SP.on=false; SP.pick=[]; SP.discard=[]; SP.room=SP.state=null; SP.roomId=null; }

/* ----------------------------- 헬퍼 ---------------------------------- */
function spSeats(s){ return Object.keys(s.players||{}).map(Number).sort((a,b)=>a-b); }
function spIsMyTurn(){ const s=SP.state; return s && SP.mySeat!=null && Number(s.turn)===Number(SP.mySeat) && !s.ranks && !SP.amSpectator; }
function spNextSeat(s, from){ const seats=spSeats(s); const i=seats.indexOf(Number(from)); return seats[(i+1)%seats.length]; }
function spMyTok(s){ const p=s.P[SP.mySeat]; return p?p.tok.reduce((a,b)=>a+b,0):0; }
// 카드 c 를 seat 가 살 수 있나 + 지불내역
function spPay(s, seat, card){
  const p=s.P[seat]; const pay=[0,0,0,0,0]; let gold=0;
  for(let i=0;i<5;i++){ const need=Math.max(0, card.c[i]-p.bon[i]); const useT=Math.min(need, p.tok[i]); pay[i]=useT; gold+=need-useT; }
  if(gold > p.tok[5]) return null;
  return { pay, gold };
}
function spCardById(id){ return SP_CARDS[id]; }
function spRefill(s, t, slot){ s.vis[t][slot] = s.deck[t].length ? s.deck[t].shift() : null; }
// 귀족 자동 방문(요구 보너스 충족 시 첫 번째)
function spVisitNoble(s, seat){
  const p=s.P[seat];
  for(let k=0;k<s.nobles.length;k++){ const nb=SP_NOBLES[s.nobles[k]];
    let ok=true; for(let i=0;i<5;i++) if(p.bon[i]<nb[i]) ok=false;
    if(ok){ p.nobles.push(s.nobles[k]); p.pts+=3; s.nobles.splice(k,1); spLog(s,`👑 ${s.names[seat]} 귀족 방문 (+3)`); return; }
  }
}
function spLog(s,m){ (s.log=s.log||[]).push(m); if(s.log.length>20) s.log.shift(); }

/* ----------------------------- 렌더 ---------------------------------- */
function spChip(i, big){ // 보석 칩
  return `<span class="sp-chip ${big?'sp-chip--lg':''}" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}"></span>`;
}
function spCostHTML(card){
  let h=''; for(let i=0;i<5;i++) if(card.c[i]>0) h+=`<span class="sp-cost" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}">${card.c[i]}</span>`;
  return h;
}
function spCardHTML(id, tappable, tag){
  if(id==null) return `<div class="sp-card sp-card--empty"></div>`;
  const c=spCardById(id);
  return `<div class="sp-card" style="--bc:${SP_COL[c.b]}" ${tappable?`data-act="sp_card" data-id="${id}"`:''}>
    <div class="sp-card__top"><span class="sp-card__pt">${c.p||''}</span><span class="sp-card__gem" style="--cc:${SP_COL[c.b]};--ct:${SP_TXT[c.b]}"></span></div>
    <div class="sp-card__cost">${spCostHTML(c)}</div>${tag?`<div class="sp-card__tag">${tag}</div>`:''}</div>`;
}
function spRender(){
  const s=SP.state; if(!s) return; if(s.ranks) return;
  const myTurn=spIsMyTurn();
  const curName=s.names[Number(s.turn)]||('좌석'+s.turn);
  const seats=spSeats(s);

  // 은행 토큰(내 차례면 탭해서 선택)
  const bankH=[0,1,2,3,4].map(i=>{
    const sel=SP.pick.includes(i)?'is-sel':'';
    const cnt=SP.pick.filter(x=>x===i).length;
    const tappable=myTurn && SP.discard.length===0;
    return `<button class="sp-tok ${sel}" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}" ${tappable?`data-act="sp_pick" data-i="${i}"`:''}>
      <b>${s.bank[i]}</b>${cnt?`<span class="sp-tok__sel">+${cnt}</span>`:''}</button>`;
  }).join('') + `<div class="sp-tok sp-tok--gold" style="--cc:${SP_GOLD};--ct:#3a2c05"><b>${s.bank[5]}</b>🌟</div>`;

  // 귀족
  const nobleH=(s.nobles||[]).map(idx=>{ const nb=SP_NOBLES[idx];
    let req=''; for(let i=0;i<5;i++) if(nb[i]>0) req+=`<span class="sp-nreq" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}">${nb[i]}</span>`;
    return `<div class="sp-noble">👑3<div class="sp-noble__req">${req}</div></div>`;
  }).join('');

  // 카드 보드(3티어 × 4장 + 덱예약 버튼)
  const boardH=[3,2,1].map(t=>{
    const deckBtn = myTurn && (s.deck[t]||[]).length && (s.P[SP.mySeat].resv.length<3) && SP.discard.length===0
      ? `<button class="sp-deck" data-act="sp_rdeck" data-t="${t}">덱<br>${s.deck[t].length}<br>예약</button>`
      : `<div class="sp-deck sp-deck--off">덱 ${s.deck[t]?s.deck[t].length:0}</div>`;
    const cardsH=(s.vis[t]||[]).map(id=>spCardHTML(id, myTurn && SP.discard.length===0)).join('');
    return `<div class="sp-row">${deckBtn}${cardsH}</div>`;
  }).join('');

  // 상대 패널
  const oppoH=seats.filter(x=>x!==SP.mySeat).map(seat=>spPlayerMini(s,seat)).join('');

  // 내 패널
  const myH = (SP.amSpectator||SP.mySeat==null) ? '' : spMyPanel(s);

  // 액션바
  let action='';
  if(SP.amSpectator) action=`<div class="sp-note">👁 관전 — ${esc(curName)} 차례</div>`;
  else if(SP.discard.length>0 || spMyTok(s)>10){
    const over=spMyTok(s)-SP.discard.length-10;
    action=`<div class="sp-actbar"><div class="sp-step">토큰 10개 초과! 반납할 토큰을 아래 내 토큰에서 ${over>0?over:0}개 더 탭</div>
      ${over<=0?`<button class="btn btn--primary" data-act="sp_discardgo">반납 확정·턴 종료</button>`:''}</div>`;
  }
  else if(myTurn){
    const canTake = SP.pick.length>0;
    action=`<div class="sp-actbar">
      <div class="sp-step">내 차례 · 토큰 선택(${SP.pick.length}) 또는 카드 탭(구매/예약)</div>
      ${canTake?`<button class="btn btn--primary" data-act="sp_take">가져가기</button><button class="btn btn--ghost" data-act="sp_clear">취소</button>`:''}
    </div>`;
  } else action=`<div class="sp-note">${esc(curName)} 님의 차례…</div>`;

  const logH=(s.log||[]).slice(-3).reverse().map(l=>`<li>${esc(l)}</li>`).join('');

  app().innerHTML=`
    <section class="screen screen--splendor">
      <header class="topbar">
        <div class="turn-pill ${myTurn?'is-mine':''}">${myTurn?'내 차례':esc(curName)+' 차례'}</div>
        <span class="room-tag">방${SP.roomId} 💎</span>
        ${s.lastRound?'<span class="sp-last">⚑ 마지막 라운드</span>':''}
        <button class="btn btn--ghost" data-act="leave" style="margin-left:6px">나가기</button>
      </header>
      <div class="sp-bank">${bankH}</div>
      ${nobleH?`<div class="sp-nobles">${nobleH}</div>`:''}
      <div class="sp-board grow scrollable">${boardH}
        ${logH?`<ul class="dv-log sp-log">${logH}</ul>`:''}
        <div class="sp-oppos">${oppoH}</div>
      </div>
      ${myH}
      <footer class="dv-foot">${action}</footer>
    </section>`;
}
function spPlayerMini(s, seat){
  const p=s.P[seat]; const t=tierForScore((s.scores||{})[seat]||0);
  const bon=[0,1,2,3,4].map(i=>p.bon[i]?`<span class="sp-b" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}">${p.bon[i]}</span>`:'').join('');
  return `<div class="sp-omini ${Number(s.turn)===seat?'is-turn':''}">
    <div class="sp-omini__hd"><span class="tier-name" style="--tc:${t.color}">${esc(s.names[seat])}</span><b>${p.pts}점</b></div>
    <div class="sp-omini__b">${bon||'<span class="muted">보너스 없음</span>'} <span class="muted">🪙${p.tok.reduce((a,b)=>a+b,0)} ·예약${p.resv.length}</span></div>
  </div>`;
}
function spMyPanel(s){
  const p=s.P[SP.mySeat]; const myTurn=spIsMyTurn();
  const tokH=[0,1,2,3,4,5].map(i=>{
    if(!p.tok[i]) return '';
    const gold=i===5; const disc=SP.discard.filter(x=>x===i).length;
    const tappable=(SP.discard.length>0 || spMyTok(s)>10) && (p.tok[i]-disc)>0;
    return `<button class="sp-mtok ${disc?'is-disc':''}" style="--cc:${gold?SP_GOLD:SP_COL[i]};--ct:${gold?'#3a2c05':SP_TXT[i]}" ${tappable?`data-act="sp_disc" data-i="${i}"`:''}><b>${p.tok[i]-disc}</b>${gold?'🌟':''}</button>`;
  }).join('');
  const bonH=[0,1,2,3,4].map(i=>p.bon[i]?`<span class="sp-b" style="--cc:${SP_COL[i]};--ct:${SP_TXT[i]}">${p.bon[i]}</span>`:'').join('');
  const resvH=p.resv.map(id=>spCardHTML(id, myTurn && SP.discard.length===0, '예약')).join('') || '<span class="muted">예약 없음</span>';
  return `<div class="sp-me">
    <div class="sp-me__row"><b>내 ${p.pts}점</b> · 보너스 ${bonH||'-'} · 토큰</div>
    <div class="sp-mtoks">${tokH||'<span class="muted">없음</span>'}</div>
    <div class="sp-me__resv">예약카드: <div class="sp-resv-row">${resvH}</div></div>
  </div>`;
}

/* ----------------------------- 액션 ---------------------------------- */
async function splendorAct(act, el){
  if(!SP.on) return;
  switch(act){
    case 'sp_pick': return spPickTok(Number(el.dataset.i));
    case 'sp_clear': SP.pick=[]; spRender(); return;
    case 'sp_take': return spTake();
    case 'sp_card': return spOpenCard(Number(el.dataset.id));
    case 'sp_buy': return spBuy(Number(el.dataset.id));
    case 'sp_reserve': return spReserve(Number(el.dataset.id), null);
    case 'sp_rdeck': return spReserve(null, Number(el.dataset.t));
    case 'sp_disc': return spDisc(Number(el.dataset.i));
    case 'sp_discardgo': return spDiscardGo();
    case 'sp_cancel': closeSheet(); return;
  }
}
function spPickTok(i){
  if(!spIsMyTurn() || SP.state.bank[i]<=0) return;
  const cnt=SP.pick.filter(x=>x===i).length;
  // 규칙: 서로다른 3색 1개씩 OR 같은색 2개(은행 4개↑). 토글식.
  if(cnt>0){ SP.pick=SP.pick.filter(x=>x!==i); spRender(); return; }
  if(SP.pick.length>=3) { toast('최대 3개'); return; }
  // 같은색 2개를 원하면 더블탭 → 여기선 한 색을 2번 누르면 2개(은행4↑)
  SP.pick.push(i); spRender();
}
async function spTake(){
  if(!spIsMyTurn() || !SP.pick.length) return;
  const counts={}; SP.pick.forEach(i=>counts[i]=(counts[i]||0)+1);
  const colors=Object.keys(counts).map(Number);
  let mode=null;
  if(colors.length===1 && counts[colors[0]]===2){ if(SP.state.bank[colors[0]]<4){ toast('은행에 4개 이상일 때만 2개'); return; } mode='two'; }
  else if(SP.pick.every((v,i,a)=>a.indexOf(v)===i) && SP.pick.length>=1 && SP.pick.length<=3){ mode='diff'; }
  else { toast('서로 다른 3색 1개씩, 또는 같은색 2개(은행4↑)'); return; }
  const picks=SP.pick.slice();
  const ok=await spCommit(s=>{
    if(Number(s.turn)!==Number(SP.mySeat)) return null;
    for(const i of new Set(picks)) if(s.bank[i] < picks.filter(x=>x===i).length) return null;
    picks.forEach(i=>{ s.bank[i]--; s.P[SP.mySeat].tok[i]++; });
    spLog(s, `🪙 ${s.names[SP.mySeat]} 토큰 ${picks.length}개`);
    return spEndTurn(s, false);
  });
  if(ok){ SP.pick=[]; spRender(); spMaybeFinish(); }
}
function spOpenCard(id){
  if(!spIsMyTurn()) return;
  const c=spCardById(id); const s=SP.state; const p=s.P[SP.mySeat];
  const pay=spPay(s, SP.mySeat, c);
  const canReserve=p.resv.length<3;
  openSheet(`<h3 class="sheet__title">${SP_NAME[c.b]} 보너스 · ${c.p||0}점</h3>
    <div class="sp-sheetcost">비용: ${spCostHTML(c)}</div>
    <div class="sp-sheetbtns">
      ${pay?`<button class="btn btn--primary btn--lg" data-act="sp_buy" data-id="${id}">구매${pay.gold?` (🌟${pay.gold})`:''}</button>`:`<button class="btn btn--lg" disabled>토큰 부족</button>`}
      ${canReserve?`<button class="btn btn--ghost btn--lg" data-act="sp_reserve" data-id="${id}">예약(+🌟)</button>`:''}
      <button class="btn btn--ghost btn--lg" data-act="sp_cancel">취소</button>
    </div>`, ()=>{});
}
async function spBuy(id){
  closeSheet(); if(!spIsMyTurn()) return;
  const ok=await spCommit(s=>{
    if(Number(s.turn)!==Number(SP.mySeat)) return null;
    const c=spCardById(id); const p=s.P[SP.mySeat];
    const pay=spPay(s, SP.mySeat, c); if(!pay) return null;
    // 위치: 보이는 카드 or 예약카드
    let from=null, t=null, slot=null;
    for(const tt of [1,2,3]){ const sl=s.vis[tt].indexOf(id); if(sl>=0){ from='vis'; t=tt; slot=sl; break; } }
    if(from==null){ const ri=p.resv.indexOf(id); if(ri>=0){ from='resv'; slot=ri; } }
    if(from==null) return null;
    for(let i=0;i<5;i++){ p.tok[i]-=pay.pay[i]; s.bank[i]+=pay.pay[i]; }
    p.tok[5]-=pay.gold; s.bank[5]+=pay.gold;
    p.bon[c.b]++; p.pts+=c.p||0; p.cards++;
    if(from==='vis'){ spRefill(s,t,slot); } else { p.resv.splice(slot,1); }
    spLog(s, `💳 ${s.names[SP.mySeat]} ${SP_NAME[c.b]} 카드 구매 (+${c.p||0})`);
    spVisitNoble(s, SP.mySeat);
    return spEndTurn(s, false);
  });
  if(ok){ spRender(); spMaybeFinish(); }
}
async function spReserve(id, t){
  closeSheet(); if(!spIsMyTurn()) return;
  const ok=await spCommit(s=>{
    if(Number(s.turn)!==Number(SP.mySeat)) return null;
    const p=s.P[SP.mySeat]; if(p.resv.length>=3) return null;
    let cid=id;
    if(cid==null){ if(!s.deck[t] || !s.deck[t].length) return null; cid=s.deck[t].shift(); }
    else { let f=false; for(const tt of [1,2,3]){ const sl=s.vis[tt].indexOf(cid); if(sl>=0){ spRefill(s,tt,sl); f=true; break; } } if(!f) return null; }
    p.resv.push(cid);
    if(s.bank[5]>0){ s.bank[5]--; p.tok[5]++; }
    spLog(s, `📌 ${s.names[SP.mySeat]} 카드 예약`);
    return spEndTurn(s, false);
  });
  if(ok){ spRender(); spMaybeFinish(); }
}
// 토큰 10 초과 반납
function spDisc(i){ const p=SP.state.P[SP.mySeat]; const d=SP.discard.filter(x=>x===i).length; if(p.tok[i]-d<=0) return; SP.discard.push(i); spRender(); }
async function spDiscardGo(){
  if(spMyTok(SP.state)-SP.discard.length>10) return;
  const disc=SP.discard.slice();
  const ok=await spCommit(s=>{
    const p=s.P[SP.mySeat];
    const cnt={}; disc.forEach(i=>cnt[i]=(cnt[i]||0)+1);
    for(const i in cnt){ if(p.tok[i]<cnt[i]) return null; p.tok[i]-=cnt[i]; s.bank[i]+=cnt[i]; }
    spLog(s, `↩️ ${s.names[SP.mySeat]} 토큰 ${disc.length}개 반납`);
    return spFinishTurn(s);
  });
  if(ok){ SP.discard=[]; spRender(); spMaybeFinish(); }
}
// 행동 후: 토큰 10 초과면 반납 대기(턴 안 넘김), 아니면 턴 종료
function spEndTurn(s, forced){
  const total=s.P[SP.mySeat].tok.reduce((a,b)=>a+b,0);
  if(total>10 && !forced) return s;     // 반납 단계로(클라가 discard UI 표시) — 턴 유지
  return spFinishTurn(s);
}
function spFinishTurn(s){
  // 15점 도달 → 이 라운드 끝까지(첫 좌석 한 바퀴) 마무리
  const anyWin = spSeats(s).some(seat=>s.P[seat].pts>=15);
  if(anyWin) s.lastRound=true;
  const next=spNextSeat(s, s.turn);
  s.turn=next;
  if(s.lastRound && Number(next)===Number(s.firstSeat)) return spDoFinish(s);
  return s;
}
function spDoFinish(s){
  const seats=spSeats(s);
  const ranked=seats.slice().sort((a,b)=> (s.P[b].pts-s.P[a].pts) || (s.P[a].cards-s.P[b].cards) || (a-b));
  const ranks={}, points={}, cards={};
  let r=1;
  for(let i=0;i<ranked.length;i++){
    const seat=ranked[i];
    if(i>0){ const pv=ranked[i-1]; const tie=(s.P[pv].pts===s.P[seat].pts && s.P[pv].cards===s.P[seat].cards); if(!tie) r=i+1; }
    ranks[seat]=r; points[seat]=s.P[seat].pts; cards[seat]=s.P[seat].cards;
  }
  s.ranks=ranks; s.points=points; s.cardCounts=cards; spLog(s,'🏁 게임 종료');
  return s;
}

/* ----------------------------- CAS / 중퇴 / 종료 ---------------------------- */
async function spCommit(mutator){
  if(SP.busy) return false; SP.busy=true;
  try{
    for(let a=0;a<6;a++){
      const base=JSON.parse(JSON.stringify(SP.state));
      const ns=mutator(base); if(!ns) return false;
      const r=await pushState(SP.roomId, ns, SP.version);
      if(r.ok){ SP.room=r.room; SP.state=r.room.state; SP.version=r.room.version; return true; }
      const room=await fetchRoom(SP.roomId);
      if(!room || room.status!=='playing'){ SP.room=room; if(room){ SP.state=room.state; SP.version=room.version; } return false; }
      SP.room=room; SP.state=room.state||{}; SP.version=room.version;
    }
    toast('상태가 자주 바뀌었어요. 다시 시도하세요.'); return false;
  } finally { SP.busy=false; }
}
function spIsLive(s, seat){ const uid=(s.players||{})[seat]; const M=(typeof MEMBERS!=='undefined')?MEMBERS:[]; const pr=(typeof presentIds!=='undefined')?presentIds:null; return uid && M.some(m=>m.user_id===uid) && (!pr || pr.length===0 || pr.includes(uid)); }
async function spSkipDeparted(){
  const s=SP.state; if(!s || s.ranks || SP.amSpectator) return;
  if(spIsLive(s, Number(s.turn))) return;
  const seats=spSeats(s); const live=seats.filter(x=>spIsLive(s,x));
  if(!live.length || Number(live[0])!==Number(SP.mySeat)) return;
  const ok=await spCommit(base=>{ if(base.ranks) return null; if(spIsLive(base, Number(base.turn))) return null;
    spLog(base, `🚪 ${base.names[base.turn]} 자리비움 — 턴 넘김`); base.turn=spNextSeat(base, base.turn);
    if(base.lastRound && Number(base.turn)===Number(base.firstSeat)) return spDoFinish(base); return base; });
  if(ok){ spRender(); spMaybeFinish(); }
}
async function spMaybeFinish(){
  const s=SP.state; if(!s || SP.amSpectator) return;
  if(s.ranks){ try{ await finishGame(SP.roomId, SP.me.token, 'splendor'); }catch(e){} }
}

window.splendorInitialState=splendorInitialState;
window.splendorEnter=splendorEnter;
window.splendorOnRoom=splendorOnRoom;
window.splendorAct=splendorAct;
window.splendorStop=splendorStop;

/* ----------------------------- 스타일 ---------------------------- */
function spInjectStyles(){
  if(document.getElementById('spCSS')) return;
  const s=document.createElement('style'); s.id='spCSS';
  s.textContent=`
  .screen--splendor{display:flex;flex-direction:column;height:100%;gap:6px;padding:6px}
  .sp-bank{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}
  .sp-tok{position:relative;width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.25);background:var(--cc);color:var(--ct);font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}
  .sp-tok.is-sel{outline:3px solid #ffd54a;outline-offset:1px}
  .sp-tok--gold{cursor:default;font-size:12px}
  .sp-tok__sel{position:absolute;top:-6px;right:-6px;background:#ffd54a;color:#222;border-radius:8px;font-size:11px;padding:0 4px}
  .sp-nobles{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}
  .sp-noble{background:#1b2230;border:1px solid #6a5a2e;border-radius:8px;padding:3px 6px;font-size:11px;color:#e6cf86;display:flex;gap:4px;align-items:center}
  .sp-noble__req{display:flex;gap:2px}
  .sp-nreq,.sp-cost,.sp-b{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;border-radius:4px;background:var(--cc);color:var(--ct);font-size:11px;font-weight:800;padding:0 2px}
  .sp-board{display:flex;flex-direction:column;gap:6px;overflow-y:auto}
  .sp-row{display:flex;gap:5px;align-items:stretch}
  .sp-card{flex:1;min-width:0;background:#141a24;border:1px solid #2a3550;border-top:5px solid var(--bc,#888);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:4px;min-height:70px;cursor:pointer}
  .sp-card--empty{background:#0e1118;border-style:dashed;cursor:default}
  .sp-card__top{display:flex;justify-content:space-between;align-items:center}
  .sp-card__pt{font-size:18px;font-weight:800;color:#fff}
  .sp-card__gem{width:16px;height:16px;border-radius:50%;background:var(--cc);border:1px solid rgba(255,255,255,.3)}
  .sp-card__cost{display:flex;flex-wrap:wrap;gap:2px;margin-top:auto}
  .sp-card__tag{font-size:10px;color:#9fb0c3}
  .sp-deck{flex:0 0 40px;background:#222c3f;border:1px solid #3a4660;border-radius:8px;color:#cdd9ec;font-size:10px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1.2}
  .sp-deck--off{opacity:.5;cursor:default}
  .sp-oppos{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
  .sp-omini{flex:1 1 45%;background:#141a24;border:1px solid #2a3550;border-radius:8px;padding:5px 7px;font-size:12px}
  .sp-omini.is-turn{border-color:#ffd54a}
  .sp-omini__hd{display:flex;justify-content:space-between}
  .sp-omini__b{margin-top:3px;display:flex;gap:3px;flex-wrap:wrap;align-items:center}
  .sp-me{background:#10141d;border-top:1px solid #2a3550;padding:6px;font-size:12px}
  .sp-mtoks{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
  .sp-mtok{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.2);background:var(--cc);color:var(--ct);font-weight:800;cursor:default}
  .sp-mtok.is-disc{outline:3px solid #e0444a}
  .sp-resv-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px}
  .sp-me__resv .sp-card{flex:0 0 64px}
  .sp-sheetcost,.sp-sheetbtns{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;align-items:center}
  .sp-sheetbtns{flex-direction:column}
  .sp-actbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .sp-step{font-size:12px;color:#cdd9ec;flex:1}
  .sp-note{color:#9fb0c3;font-size:13px;text-align:center;padding:4px}
  .sp-last{color:#ffd54a;font-size:11px}
  .sp-log{margin:4px 0}`;
  document.head.appendChild(s);
}
