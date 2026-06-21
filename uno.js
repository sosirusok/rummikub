/* =========================================================================
   uno.js — "우노(UNO)" 정식 룰 (2~4인, 턴제 DOM, 서버-state CAS)
   - 108장: 4색(빨/노/초/파) × {0 한장, 1~9 두장, Skip/Reverse/DrawTwo 두장}(=25/색,100장)
     + Wild 4장 + Wild Draw Four 4장 = 108.
   - 7장씩 분배. 남은 더미=draw. 맨 위 한 장 뒤집어 discard 시작.
     · 시작 카드가 Wild Draw Four 면 더미에 섞어 다시 뒤집음.
     · Wild 면 첫 플레이어가 색 선택. Skip 이면 첫 플레이어 스킵. Reverse 면 방향 반전(2인=스킵).
       Draw Two 면 첫 플레이어가 2장 뽑고 스킵.
   - 턴: 맨 위 카드와 색 OR 숫자 OR 기호가 맞는 카드, 또는 Wild 를 냄.
     · Wild Draw Four 는 "현재 색과 맞는 카드가 손에 하나도 없을 때만" 합법(강제).
     · Wild/Wild4 는 색 선택 필수.
   - 못 내거나 안 내면 1장 뽑음. 뽑은 카드가 낼 수 있으면 즉시 내기 가능, 아니면 턴 넘김.
   - Skip: 다음 사람 스킵. Reverse: 방향반전(2인=스킵). Draw Two: 다음이 2장 뽑고 스킵.
     Wild Draw Four: 다음이 4장 뽑고 스킵 + 색 선택.
   - draw 더미가 비면 discard(맨 위 제외)를 섞어 새 draw 로.
   - "우노" 콜: 1장 남으면 선언해야 함. 선언 안 하고 다음 사람이 행동하기 전에
     상대가 잡으면 2장 패널티. → 본인 "우노" 선언 버튼 + 상대 "잡기" 버튼(다음 사람 행동 전까지).
     자동 안전장치: 다음 사람이 카드를 내는 순간(commit) 미선언 1장 보유자를 자동으로 잡아 +2.
   - 라운드 종료: 손을 다 비우면 끝. 1등=손 비운 사람. 나머지는 남은 손패 점수 오름차순(낮을수록 상위).
     점수: 숫자=face, Skip/Reverse/DrawTwo=20, Wild/Wild4=50. 동률은 공동등수.
     ranks{seat:rank} 생성 → finishGame(roomId, token, 'uno').

   app.js 기대 전역: unoInitialState/unoEnter/unoOnRoom/unoAct/unoStop
   의존: net(pushState/fetchRoom/finishGame/serverNow), ui-core(app/esc/setScreen/toast/openSheet/closeSheet),
         tiers(tierForScore). app.js 전역 MEMBERS/presentIds.
   ========================================================================= */
const UN = { on:false, room:null, roomId:null, state:null, me:null, mySeat:null, amSpectator:false, version:0, busy:false, pendingWild:null };

const UNO_COLORS = ['r','y','g','b'];
const UNO_COLNAME = { r:'빨강', y:'노랑', g:'초록', b:'파랑' };
const UNO_COLHEX  = { r:'#d8443f', y:'#e6b32e', g:'#2faa55', b:'#3b7dd8' };
const UNO_WILDHEX = '#23272f';

/* ---- 결정론 PRNG (splendor 동일) ---- */
function unoRng(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function unoShuffle(arr,rng){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=arr[i];arr[i]=arr[j];arr[j]=t; } return arr; }

/* ---- 108장 덱 생성 ---- */
function unoBuildDeck(){
  const deck=[]; let idc=0;
  const push=(color,kind,val)=>deck.push({ id:'c'+(idc++), color, kind, val:(val==null?null:val) });
  for(const c of UNO_COLORS){
    push(c,'num',0);                                   // 0 한 장
    for(let v=1;v<=9;v++){ push(c,'num',v); push(c,'num',v); }   // 1~9 두 장
    push(c,'skip',null); push(c,'skip',null);
    push(c,'reverse',null); push(c,'reverse',null);
    push(c,'draw2',null); push(c,'draw2',null);
  }
  for(let k=0;k<4;k++) push(null,'wild',null);
  for(let k=0;k<4;k++) push(null,'wild4',null);
  return deck;   // 25*4 + 8 = 108
}
function unoCardPoints(card){
  if(card.kind==='num') return card.val;
  if(card.kind==='skip'||card.kind==='reverse'||card.kind==='draw2') return 20;
  return 50;   // wild / wild4
}
function unoIsWild(card){ return card.kind==='wild'||card.kind==='wild4'; }

/* ----------------------------- 시작 state ---------------------------- */
function unoInitialState(seated, scoresMap){
  const seats = seated.map(m=>m.seat).sort((a,b)=>a-b);
  const n = seats.length;
  const seed = ((serverNow() & 0x7fffffff) ^ (n*2654435761) ^ 0x21) >>> 0;
  const rng = unoRng(seed);
  const deck = unoShuffle(unoBuildDeck(), rng);

  const players={}, names={}, scores={}, hands={}, said={};
  seated.forEach(m=>{
    players[m.seat]=m.user_id; names[m.seat]=m.name; scores[m.seat]=(scoresMap&&scoresMap[m.seat])||0;
    hands[m.seat]=[]; said[m.seat]=false;
  });
  // 7장씩 분배
  for(let k=0;k<7;k++){ for(const seat of seats){ hands[seat].push(deck.shift()); } }

  // 시작 카드: Wild Draw Four 면 다시 섞어 뒤집기
  let top=deck.shift();
  while(top.kind==='wild4'){ deck.push(top); unoShuffle(deck, rng); top=deck.shift(); }

  const discard=[top];
  const draw=deck;
  let dir=1;                          // +1 좌석 오름차순, -1 내림차순
  let turn=seats[0];
  let color = top.color;              // 현재 유효색
  let pendingColor=false;             // Wild 시작 시 첫 플레이어 색 선택 대기
  let pendingDraw=0;                  // 누적 Draw Two(+2 받아치기 스택). 0 이면 없음
  const log=[];

  // 좌석 인덱스 헬퍼(현재 dir 기준 다음 좌석)
  const step=(from)=>{ const i=seats.indexOf(Number(from)); return seats[((i+dir)%n+n)%n]; };

  // 시작 카드 효과 적용(첫 플레이어 = seats[0] 기준)
  if(top.kind==='wild'){
    pendingColor=true; color=null; log.push('🎴 시작 카드 Wild — 첫 플레이어가 색을 정합니다');
  } else if(top.kind==='skip'){
    log.push(`⏭ 시작 Skip — ${names[turn]} 스킵`); turn=step(turn);            // 첫 플레이어 스킵 → 다음 사람부터
  } else if(top.kind==='reverse'){
    dir=-1;
    if(n===2){ log.push('🔁 시작 Reverse(2인=스킵) — 첫 플레이어 스킵'); turn=step(seats[0]); }  // 2인은 스킵처럼: seats[1] 부터
    else { log.push('🔁 시작 Reverse — 방향 반전'); turn=seats[0]; }            // 방향만 반전, 첫 플레이어는 seats[0] 유지
  } else if(top.kind==='draw2'){
    pendingDraw=2;   // 첫 플레이어가 +2 로 받아치거나 2장 받기
    log.push(`➕2 시작 Draw Two — ${names[turn]} 에게 +2 (받아치거나 받기)`);
  }

  return {
    game:'uno', seed, players, names, scores, n,
    hands, draw, discard, color, dir, turn, firstSeat:seats[0],
    pendingColor, pendingDraw, drawnId:null, said,
    lastActorSeat:null,             // 직전에 카드를 낸 좌석(우노 미선언 자동잡기 판단)
    log, ranks:null, results:null, points:{},
  };
}

/* ----------------------------- 진입/렌더 ----------------------------- */
function unoEnter(room, me, mySeat, amSpectator){
  UN.on=true; UN.room=room; UN.roomId=room.id; UN.state=room.state||{}; UN.version=room.version;
  UN.me=me; UN.mySeat=mySeat; UN.amSpectator=amSpectator; UN.pendingWild=null; UN._finishSent=false;
  unoInjectStyles(); setScreen('uno'); unoRender(); unoSkipDeparted(); unoMaybeFinish();
}
function unoOnRoom(room){
  if(!UN.on || room.id!==UN.roomId) return;
  if(room.version!=null && room.version<UN.version){ UN.pendingWild=null; closeSheet(); return; }   // 버전 역행 — 색선택 시트 닫기
  const adv = room.version==null || room.version>UN.version;
  UN.room=room; UN.state=room.state||{}; UN.version=room.version;
  if(adv){ UN.pendingWild=null; unoRender(); }
  unoSkipDeparted(); unoMaybeFinish();
}
function unoStop(){ UN.on=false; UN.pendingWild=null; UN.room=UN.state=null; UN.roomId=null; UN._finishSent=false; }

/* ----------------------------- 헬퍼 ---------------------------------- */
function unoSeats(s){ return Object.keys(s.players||{}).map(Number).sort((a,b)=>a-b); }
function unoIsMyTurn(){ const s=UN.state; return s && UN.mySeat!=null && Number(s.turn)===Number(UN.mySeat) && !s.ranks && !s.pendingColor && !UN.amSpectator; }
function unoNextSeat(s, from){ const seats=unoSeats(s); const n=seats.length; const i=seats.indexOf(Number(from)); const d=(s.dir||1); return seats[((i+d)%n+n)%n]; }
function unoTop(s){ return s.discard[s.discard.length-1]; }
// 카드가 현재 맨 위/색에 비춰 합법인가(wild4 의 "다른 카드 없음" 제약은 별도 unoCanPlayWild4)
function unoMatches(s, card){
  if(card.kind==='wild') return true;
  if(card.kind==='wild4') return true;   // 합법성(다른 카드 없음)은 unoCanPlayWild4 로 추가검증
  const top=unoTop(s); const col=s.color;
  if(col && card.color===col) return true;
  if(card.kind==='num' && top.kind==='num' && card.val===top.val) return true;
  if(card.kind!=='num' && top.kind===card.kind) return true;   // 같은 기호(skip/reverse/draw2)
  return false;
}
// Wild Draw Four 합법: 손에 현재 색과 맞는(색 일치) 카드가 하나도 없어야 함
function unoCanPlayWild4(s, seat){
  const hand=s.hands[seat]||[]; const col=s.color;
  for(const c of hand){ if(c.color && c.color===col) return false; }
  return true;
}
// 손에 낼 수 있는 카드가 하나라도 있나(뽑기 강제 판단용)
function unoHasPlayable(s, seat){
  const hand=s.hands[seat]||[];
  for(const c of hand){
    if(c.kind==='wild4'){ if(unoCanPlayWild4(s, seat)) return true; }
    else if(unoMatches(s, c)) return true;
  }
  return false;
}
function unoLog(s,m){ (s.log=s.log||[]).push(m); if(s.log.length>20) s.log.shift(); }
// draw 더미 보충: 비면 discard(맨 위 제외) 섞어 채움. 시드 RNG + 버전으로 결정론.
function unoEnsureDraw(s, want){
  want=want||1;
  if(s.draw.length>=want) return;
  if(s.discard.length>1){
    const lenBefore=s.discard.length;
    const top=s.discard.pop();
    const rest=s.discard.splice(0, s.discard.length);   // 나머지 전부
    const rng=unoRng((s.seed^ lenBefore^ (top.id?top.id.length:0)^ 0x9e3779b9)>>>0);
    unoShuffle(rest, rng);
    s.draw=s.draw.concat(rest);
    s.discard=[top];
    unoLog(s,'🔄 더미를 다시 섞었어요');
  }
}
function unoDrawOne(s, seat){ unoEnsureDraw(s,1); if(s.draw.length){ const c=s.draw.shift(); s.hands[seat].push(c); return c; } return null; }
// 손패 점수 합
function unoHandPoints(s, seat){ return (s.hands[seat]||[]).reduce((a,c)=>a+unoCardPoints(c),0); }

/* ----------------------------- 렌더 ---------------------------------- */
function unoCardFace(card, big){
  const wild=unoIsWild(card);
  const bg = wild ? UNO_WILDHEX : UNO_COLHEX[card.color];
  let label;
  if(card.kind==='num') label=String(card.val);
  else if(card.kind==='skip') label='Ø';
  else if(card.kind==='reverse') label='⇄';
  else if(card.kind==='draw2') label='+2';
  else if(card.kind==='wild') label='🌈';
  else label='+4';
  return `<span class="uno-cf ${big?'uno-cf--lg':''} ${wild?'is-wild':''}" style="--cc:${bg}">${label}</span>`;
}
function unoCardBtn(s, card, tappable){
  const wild=unoIsWild(card);
  return `<button class="uno-card ${wild?'is-wild':''}" style="--cc:${wild?UNO_WILDHEX:UNO_COLHEX[card.color]}" ${tappable?`data-act="uno_play" data-id="${card.id}"`:'disabled'}>${unoCardFace(card)}</button>`;
}
function unoRender(){
  const s=UN.state; if(!s) return; if(s.ranks) return;
  const myTurn=unoIsMyTurn();
  const seats=unoSeats(s);
  const curName=s.names[Number(s.turn)]||('좌석'+s.turn);
  const top=unoTop(s);
  const dirArrow = (s.dir||1)===1 ? '↻' : '↺';
  const colChip = s.color ? `<span class="uno-colchip" style="--cc:${UNO_COLHEX[s.color]}">${UNO_COLNAME[s.color]}</span>` : '<span class="muted">색 선택중</span>';

  // 상대 패널
  const oppoH=seats.filter(x=>x!==UN.mySeat).map(seat=>{
    const p=s.hands[seat]||[]; const t=tierForScore((s.scores||{})[seat]||0);
    const one=p.length===1;
    const unsaid = one && !s.said[seat];
    const canCatch = unsaid && !UN.amSpectator && UN.mySeat!=null && !s.ranks;
    return `<div class="uno-omini ${Number(s.turn)===seat?'is-turn':''}">
      <div class="uno-omini__hd"><span>${decoEmblemHTML(s.players[seat])}<span class="tier-name" style="--tc:${t.color}">${esc(s.names[seat])}</span></span>
        <b>${p.length}장</b>${one?(s.said[seat]?'<span class="uno-uno said">UNO</span>':'<span class="uno-uno miss">UNO?</span>'):''}</div>
      <div class="uno-omini__b">${Array.from({length:Math.min(p.length,12)}).map(()=>'<span class="uno-back"></span>').join('')}
        ${canCatch?`<button class="btn btn--ghost uno-catch" data-act="uno_catch" data-seat="${seat}">잡기!</button>`:''}</div>
    </div>`;
  }).join('');

  // 내 손패
  let myH='';
  if(!UN.amSpectator && UN.mySeat!=null){
    const hand=s.hands[UN.mySeat]||[];
    const cardsH=hand.map(c=>{
      let playable=false;
      if(myTurn){
        if((s.pendingDraw||0)>0){
          playable = (c.kind==='draw2');   // +2 누적 중엔 Draw Two 로만 받아치기
        } else {
          const legal = c.kind==='wild4' ? unoCanPlayWild4(s, UN.mySeat) : unoMatches(s, c);
          // 공식 룰: 뽑은 뒤에는 '방금 뽑은 카드'만 낼 수 있음. 뽑기 전에는 합법 카드 모두.
          playable = s.drawnId!=null ? (c.id===s.drawnId && legal) : legal;
        }
      }
      return unoCardBtn(s, c, playable);
    }).join('');
    const one=hand.length===1;
    myH=`<div class="uno-me">
      <div class="uno-me__row"><b>내 손패 ${hand.length}장</b> (${unoHandPoints(s,UN.mySeat)}점)
        ${one && !s.said[UN.mySeat] && !s.ranks ? `<button class="btn btn--primary uno-sayuno" data-act="uno_uno">UNO 선언</button>` : (one?'<span class="uno-uno said">UNO 선언함</span>':'')}</div>
      <div class="uno-hand">${cardsH||'<span class="muted">없음</span>'}</div>
    </div>`;
  }

  // 액션바
  let action='';
  if(UN.amSpectator) action=`<div class="uno-note">👁 관전 — ${esc(curName)} 차례</div>`;
  else if(s.pendingColor){
    const chooser = (UN.mySeat!=null && Number(s.turn)===Number(UN.mySeat));
    action = chooser
      ? `<div class="uno-actbar"><div class="uno-step">시작 색을 정하세요</div>${UNO_COLORS.map(c=>`<button class="uno-coltap" style="--cc:${UNO_COLHEX[c]}" data-act="uno_startcolor" data-c="${c}">${UNO_COLNAME[c]}</button>`).join('')}</div>`
      : `<div class="uno-note">${esc(curName)} 님이 시작 색을 정하는 중…</div>`;
  }
  else if(myTurn && (s.pendingDraw||0)>0){
    // +2 누적 받아치기 국면: Draw Two 로 받아치거나 누적분 받기
    const pd=s.pendingDraw;
    const canStack=(s.hands[UN.mySeat]||[]).some(c=>c.kind==='draw2');
    action=`<div class="uno-actbar">
      <div class="uno-step">➕${pd} 누적! ${canStack?'+2 카드를 내서 받아치거나, ':''}${pd}장 받기</div>
      <button class="btn btn--primary" data-act="uno_takedraw">➕${pd}장 받기</button>
    </div>`;
  }
  else if(myTurn){
    const drew = s.drawnId!=null;
    const canPass = drew;   // 뽑은 뒤 안 내면 패스 가능
    const hasPlay = unoHasPlayable(s, UN.mySeat);
    action=`<div class="uno-actbar">
      <div class="uno-step">${drew?'뽑은 카드를 내거나 패스하세요':'낼 카드를 탭하거나, 없으면 뽑으세요'}</div>
      ${!drew?`<button class="btn btn--primary" data-act="uno_draw">🂠 뽑기</button>`:''}
      ${canPass?`<button class="btn btn--ghost" data-act="uno_pass">패스(턴 종료)</button>`:''}
      ${(!drew && !hasPlay)?'<span class="muted">낼 카드 없음 → 뽑기</span>':''}
    </div>`;
  }
  else action=`<div class="uno-note">${esc(curName)} 님의 차례…</div>`;

  const logH=(s.log||[]).slice(-3).reverse().map(l=>`<li>${esc(l)}</li>`).join('');

  app().innerHTML=`
    <section class="screen screen--uno">
      <header class="topbar">
        <div class="turn-pill ${myTurn?'is-mine':''}">${myTurn?'내 차례':esc(curName)+' 차례'}</div>
        <span class="room-tag">방${UN.roomId} 🎴</span>
        <span class="uno-dir">${dirArrow}</span>
        <button class="btn btn--ghost" data-act="leave" style="margin-left:6px">나가기</button>
      </header>
      <div class="uno-center">
        <div class="uno-pile">
          <div class="uno-discard">${unoCardFace(top, true)}</div>
          <div class="uno-cur">현재색 ${colChip} · 🂠${s.draw.length}</div>
        </div>
        <div class="uno-oppos">${oppoH}</div>
        ${logH?`<ul class="dv-log uno-log">${logH}</ul>`:''}
      </div>
      ${myH}
      <footer class="dv-foot">${action}</footer>
    </section>`;
}

/* ----------------------------- 액션 ---------------------------------- */
async function unoAct(act, el){
  if(!UN.on) return;
  switch(act){
    case 'uno_play': return unoPlay(el.dataset.id);
    case 'uno_pickcolor': return unoPickColor(el.dataset.c);
    case 'uno_startcolor': return unoStartColor(el.dataset.c);
    case 'uno_draw': return unoDraw();
    case 'uno_takedraw': return unoTakeDraw();
    case 'uno_pass': return unoPass();
    case 'uno_uno': return unoSayUno();
    case 'uno_catch': return unoCatch(Number(el.dataset.seat));
    case 'uno_cancel': closeSheet(); UN.pendingWild=null; return;
  }
}

// 카드 내기. wild 면 색 선택 시트 → unoPickColor 로 이어짐.
async function unoPlay(cardId){
  if(!unoIsMyTurn()) return;
  const s=UN.state; const hand=s.hands[UN.mySeat]||[];
  const card=hand.find(c=>c.id===cardId); if(!card) return;
  if(card.kind==='wild4'){ if(!unoCanPlayWild4(s, UN.mySeat)){ toast('지금 낼 수 있는 색이 손에 있어 와일드 드로우4는 못 내요'); return; } }
  else if(!unoMatches(s, card)){ toast('낼 수 없는 카드예요'); return; }
  if(unoIsWild(card)){
    UN.pendingWild=cardId;
    openSheet(`<h3 class="sheet__title">색을 고르세요</h3>
      <div class="uno-colgrid">${UNO_COLORS.map(c=>`<button class="uno-coltap" style="--cc:${UNO_COLHEX[c]}" data-act="uno_pickcolor" data-c="${c}">${UNO_COLNAME[c]}</button>`).join('')}</div>
      <button class="btn btn--ghost btn--lg" data-act="uno_cancel">취소</button>`, ()=>{ UN.pendingWild=null; });
    return;
  }
  await unoDoPlay(cardId, null);
}
async function unoPickColor(c){
  const cardId=UN.pendingWild; UN.pendingWild=null;   // closeSheet 의 onClose 가 pendingWild 를 비우므로 먼저 캡처
  closeSheet();
  if(!cardId || !unoIsMyTurn()) return;
  await unoDoPlay(cardId, c);
}
// 실제 카드 적용(+효과). chosenColor: wild 일 때 선택색, 아니면 null.
async function unoDoPlay(cardId, chosenColor){
  const ok=await unoCommit(s=>{
    if(s.ranks || s.pendingColor || Number(s.turn)!==Number(UN.mySeat)) return null;
    const seat=Number(UN.mySeat); const hand=s.hands[seat];
    const idx=hand.findIndex(c=>c.id===cardId); if(idx<0) return null;
    const card=hand[idx];
    if(s.drawnId!=null && cardId!==s.drawnId) return null;   // 뽑은 뒤에는 뽑은 카드만
    // +2 누적 대기 중엔 오직 Draw Two 로만 받아치기 가능(그 외 카드/와일드4 금지)
    if((s.pendingDraw||0)>0 && card.kind!=='draw2') return null;
    // 합법성 재검증
    if(card.kind==='wild4'){ if(!unoCanPlayWild4(s, seat)) return null; }
    else if(!unoMatches(s, card)) return null;
    if(unoIsWild(card) && !chosenColor) return null;

    // 우노 미선언 자동잡기: 직전 1장 보유자가 선언 안 했으면 이 행동 직전에 +2
    unoAutoCatch(s, seat);

    // 손에서 제거 → discard 로
    hand.splice(idx,1);
    s.discard.push(card);
    s.color = unoIsWild(card) ? chosenColor : card.color;
    s.drawnId=null;
    s.lastActorSeat=seat;
    // said 는 손이 1장일 때만 의미 — 카드를 내면 일단 미선언으로 리셋(1장 되면 새로 선언해야).
    s.said[seat]=false;

    const nm=s.names[seat]; const cn=unoIsWild(card)?UNO_COLNAME[chosenColor]:'';

    // 손 비움 → 라운드 종료
    if(hand.length===0){ unoLog(s,`🏁 ${nm} 손패를 모두 냈어요!`); return unoDoFinish(s); }

    // 현재 dir 기준 한 칸 이동(s.dir 변경 후 호출하면 반영됨)
    const adv=(from)=>{ const seats=unoSeats(s); const np=seats.length; const i=seats.indexOf(Number(from)); return seats[((i+(s.dir||1))%np+np)%np]; };

    // 효과 적용 → next(다음 행동 좌석) 결정
    let next;
    if(card.kind==='reverse'){
      s.dir=-(s.dir||1);
      if(s.n===2){ unoLog(s,`🔁 ${nm} Reverse(2인=스킵) — 한 번 더 ${nm}`); next=adv(adv(seat)); }  // 2인=스킵: 한 바퀴 돌아 본인
      else { unoLog(s,`🔁 ${nm} Reverse — 방향 반전`); next=adv(seat); }
    } else {
      next=adv(seat);                                  // 바로 다음 좌석
      if(card.kind==='skip'){ unoLog(s,`⏭ ${nm} Skip — ${s.names[next]} 스킵`); next=adv(next); }
      else if(card.kind==='draw2'){ s.pendingDraw=(s.pendingDraw||0)+2; unoLog(s,`➕2 ${nm} Draw Two — ${s.names[next]} 에게 +${s.pendingDraw} (받아치거나 받기)`); }   // 즉시 안 뽑힘: 다음 사람이 +2 로 받아치거나 받기
      else if(card.kind==='wild4'){ let dn=0; for(let d=0;d<4;d++){ if(unoDrawOne(s, next)) dn++; } unoLog(s,`➕4 ${nm} Wild Draw Four → ${cn} — ${s.names[next]} ${dn}장 뽑고 스킵`); next=adv(next); }
      else if(card.kind==='wild'){ unoLog(s,`🌈 ${nm} Wild → ${cn}`); }
      else { unoLog(s,`🎴 ${nm} ${card.val}(${UNO_COLNAME[card.color]})`); }
    }

    s.turn=next;
    return s;
  });
  if(ok){ unoRender(); unoMaybeFinish(); }
}

// 뽑기(내 차례, 아직 안 뽑았을 때)
async function unoDraw(){
  if(!unoIsMyTurn()) return;
  const ok=await unoCommit(s=>{
    if(s.ranks || s.pendingColor || Number(s.turn)!==Number(UN.mySeat)) return null;
    if(s.drawnId!=null) return null;
    if((s.pendingDraw||0)>0) return null;   // +2 누적 중엔 일반 뽑기 불가 → '받기'로
    const seat=Number(UN.mySeat);
    unoAutoCatch(s, seat);
    const c=unoDrawOne(s, seat);
    if(!c){ // 더 뽑을 카드 없음 → 그냥 패스
      unoLog(s,`🂠 ${s.names[seat]} 뽑을 카드가 없어 패스`);
      s.drawnId=null; s.lastActorSeat=seat; s.turn=unoNextSeat(s, seat); return s;
    }
    s.drawnId=c.id;
    unoLog(s,`🂠 ${s.names[seat]} 카드를 뽑음`);
    // 뽑은 카드가 낼 수 없으면 자동으로 턴 넘김
    const playable = c.kind==='wild4' ? unoCanPlayWild4(s, seat) : unoMatches(s, c);
    if(!playable){ s.drawnId=null; s.lastActorSeat=seat; s.turn=unoNextSeat(s, seat); }
    return s;
  });
  if(ok){ unoRender(); unoMaybeFinish(); }
}
// +2 누적 받기: 누적된 만큼 뽑고 스킵(받아치지 않을 때)
async function unoTakeDraw(){
  if(!unoIsMyTurn()) return;
  const ok=await unoCommit(s=>{
    if(s.ranks || s.pendingColor || Number(s.turn)!==Number(UN.mySeat)) return null;
    if(!((s.pendingDraw||0)>0)) return null;
    const seat=Number(UN.mySeat);
    unoAutoCatch(s, seat);
    const want=s.pendingDraw; let dn=0;
    for(let d=0; d<want; d++){ if(unoDrawOne(s, seat)) dn++; }
    unoLog(s,`➕ ${s.names[seat]} +${dn}장 받고 스킵`);
    s.pendingDraw=0; s.drawnId=null; s.lastActorSeat=seat;
    s.turn=unoNextSeat(s, seat);
    return s;
  });
  if(ok){ unoRender(); unoMaybeFinish(); }
}
// 뽑은 카드 안 내고 패스
async function unoPass(){
  if(!unoIsMyTurn()) return;
  const ok=await unoCommit(s=>{
    if(s.ranks || s.pendingColor || Number(s.turn)!==Number(UN.mySeat)) return null;
    if(s.drawnId==null) return null;   // 패스는 뽑은 뒤에만
    const seat=Number(UN.mySeat);
    unoAutoCatch(s, seat);
    s.drawnId=null;
    unoLog(s,`⏭ ${s.names[seat]} 패스`);
    s.lastActorSeat=seat;
    s.turn=unoNextSeat(s, seat);
    return s;
  });
  if(ok){ unoRender(); unoMaybeFinish(); }
}
// 시작 Wild 색 선택(첫 플레이어)
async function unoStartColor(c){
  const s=UN.state; if(!s || !s.pendingColor) return;
  if(UN.mySeat==null || Number(s.turn)!==Number(UN.mySeat)) return;
  const ok=await unoCommit(base=>{
    if(!base.pendingColor) return null;
    if(Number(base.turn)!==Number(UN.mySeat)) return null;
    base.color=c; base.pendingColor=false;
    unoLog(base, `🎨 ${base.names[base.turn]} 시작 색 ${UNO_COLNAME[c]} 선택`);
    return base;
  });
  if(ok) unoRender();
}
// 우노 선언(손 1장일 때)
async function unoSayUno(){
  const s=UN.state; if(!s || UN.mySeat==null || s.ranks) return;
  if((s.hands[UN.mySeat]||[]).length!==1) return;
  const ok=await unoCommit(base=>{
    if(base.ranks) return null;
    if((base.hands[UN.mySeat]||[]).length!==1) return null;
    if(base.said[UN.mySeat]) return null;
    base.said[UN.mySeat]=true;
    unoLog(base, `🔔 ${base.names[UN.mySeat]} UNO!`);
    return base;
  });
  if(ok) unoRender();
}
// 상대가 미선언 1장 보유자를 잡기 → +2 패널티
async function unoCatch(targetSeat){
  const s=UN.state; if(!s || UN.amSpectator || s.ranks) return;
  const ok=await unoCommit(base=>{
    if(base.ranks) return null;
    const h=base.hands[targetSeat]||[];
    if(h.length!==1 || base.said[targetSeat]) return null;   // 이미 선언했거나 1장 아님
    let dn=0; for(let d=0;d<2;d++){ if(unoDrawOne(base, targetSeat)) dn++; }
    unoLog(base, `👮 ${base.names[targetSeat]} UNO 미선언 적발! +${dn}장`);
    return base;
  });
  if(ok){ unoRender(); }
}
// 자동잡기: 행동(actorSeat) 직전에, 직전 카드를 낸 좌석이 1장인데 미선언이면 +2.
// (다음 사람이 행동하기 전까지만 유효 — 다음 행동 시점에 적발)
function unoAutoCatch(s, actorSeat){
  const prev=s.lastActorSeat;
  if(prev==null || Number(prev)===Number(actorSeat)) return;
  const h=s.hands[prev]||[];
  if(h.length===1 && !s.said[prev]){
    let dn=0; for(let d=0;d<2;d++){ if(unoDrawOne(s, prev)) dn++; }
    unoLog(s, `👮 ${s.names[prev]} UNO 미선언 — 자동 +${dn}장`);
  }
}

/* ----------------------------- 종료 ---------------------------------- */
function unoDoFinish(s){
  const seats=unoSeats(s);
  // 점수: 손 비운 사람(0점) 최상위. 나머지는 손패 점수 오름차순.
  const pts={}; seats.forEach(seat=>{ pts[seat]=unoHandPoints(s, seat); });
  const ranked=seats.slice().sort((a,b)=> (pts[a]-pts[b]) || (a-b));
  const ranks={}; let r=1;
  for(let i=0;i<ranked.length;i++){
    const seat=ranked[i];
    if(i>0){ const pv=ranked[i-1]; if(pts[pv]!==pts[seat]) r=i+1; }
    ranks[seat]=r;
  }
  s.ranks=ranks; s.points=pts; unoLog(s,'🏁 게임 종료');
  return s;
}

/* ----------------------------- CAS / 중퇴 / 종료 ---------------------------- */
async function unoCommit(mutator){
  if(UN.busy) return false; UN.busy=true;
  try{
    for(let a=0;a<6;a++){
      const base=JSON.parse(JSON.stringify(UN.state));
      const ns=mutator(base); if(!ns) return false;
      const r=await pushState(UN.roomId, ns, UN.version);
      if(r.ok){ UN.room=r.room; UN.state=r.room.state; UN.version=r.room.version; return true; }
      const room=await fetchRoom(UN.roomId);
      if(!room || room.status!=='playing'){ UN.room=room; if(room){ UN.state=room.state; UN.version=room.version; } return false; }
      UN.room=room; UN.state=room.state||{}; UN.version=room.version;
    }
    toast('상태가 자주 바뀌었어요. 다시 시도하세요.'); return false;
  } finally { UN.busy=false; }
}
function unoIsLive(s, seat){ const uid=(s.players||{})[seat]; const M=(typeof MEMBERS!=='undefined')?MEMBERS:[]; const pr=(typeof presentIds!=='undefined')?presentIds:null; return uid && M.some(m=>m.user_id===uid) && (!pr || pr.length===0 || pr.includes(uid)); }
async function unoSkipDeparted(){
  const s=UN.state; if(!s || s.ranks || s.pendingColor || UN.amSpectator) return;
  if(unoIsLive(s, Number(s.turn))) return;
  const seats=unoSeats(s); const live=seats.filter(x=>unoIsLive(s,x));
  if(!live.length || Number(live[0])!==Number(UN.mySeat)) return;
  const ok=await unoCommit(base=>{
    if(base.ranks || base.pendingColor) return null;
    if(unoIsLive(base, Number(base.turn))) return null;
    // firstSeat 가 나갔으면 살아있는 좌석으로 경계 옮김
    if(!unoIsLive(base, Number(base.firstSeat))){ const ls=unoSeats(base).filter(x=>unoIsLive(base,x)); if(ls.length) base.firstSeat=ls[0]; }
    let guard=Number(base.n||unoSeats(base).length)+1;
    while(guard-- > 0 && !unoIsLive(base, Number(base.turn))){
      unoLog(base, `🚪 ${base.names[base.turn]} 자리비움 — 턴 넘김`);
      base.drawnId=null; base.pendingDraw=0;   // 떠난 좌석의 누적 +2 스택 소멸(다음 생존자에게 전가 방지)
      base.turn=unoNextSeat(base, base.turn);
    }
    const liveSeats=unoSeats(base).filter(x=>unoIsLive(base,x));
    if(liveSeats.length<=1 && !base.ranks){ return unoDoFinish(base); }   // 생존 ≤1명 → 종료
    return base;
  });
  if(ok){ unoRender(); unoMaybeFinish(); }
}
async function unoMaybeFinish(){
  const s=UN.state; if(!s || UN.amSpectator || !s.ranks) return;
  if(UN._finishSent) return; UN._finishSent=true;
  for(let i=0;i<5;i++){                                     // 마피아식 5회 재시도('집계 중' 영구정지 방지)
    const r=await finishGame(UN.roomId, UN.me.token, 'uno');
    if(r && r.ok){ await refreshRoom(); return; }
    const room=await fetchRoom(UN.roomId);
    if(room && room.status==='finished'){ await refreshRoom(); return; }
    await new Promise(res=>setTimeout(res,600));
  }
  UN._finishSent=false;   // 실패 → 다음 트리거에서 재시도 허용
  await refreshRoom();
}

window.unoInitialState=unoInitialState;
window.unoEnter=unoEnter;
window.unoOnRoom=unoOnRoom;
window.unoAct=unoAct;
window.unoStop=unoStop;

/* ----------------------------- 스타일 ---------------------------- */
function unoInjectStyles(){
  if(document.getElementById('unoCSS')) return;
  const st=document.createElement('style'); st.id='unoCSS';
  st.textContent=`
  .screen--uno{display:flex;flex-direction:column;height:100%;gap:6px;padding:6px}
  .uno-dir{font-size:20px;color:#ffd54a;margin-left:6px}
  .uno-center{display:flex;flex-direction:column;gap:8px;align-items:center}
  .uno-pile{display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:4px}
  .uno-discard{transform:scale(1.05)}
  .uno-cur{font-size:13px;color:#cdd9ec;display:flex;gap:6px;align-items:center}
  .uno-colchip{display:inline-flex;align-items:center;padding:1px 8px;border-radius:10px;background:var(--cc);color:#fff;font-weight:800;font-size:12px}
  .uno-cf{display:inline-flex;align-items:center;justify-content:center;width:40px;height:58px;border-radius:8px;background:var(--cc);color:#fff;font-weight:900;font-size:20px;border:2px solid rgba(255,255,255,.5);box-shadow:0 2px 5px rgba(0,0,0,.35)}
  .uno-cf--lg{width:60px;height:86px;font-size:30px;border-width:3px}
  .uno-cf.is-wild{background:conic-gradient(#d8443f 0 25%,#e6b32e 0 50%,#2faa55 0 75%,#3b7dd8 0);color:#fff;text-shadow:0 1px 3px #000}
  .uno-oppos{display:flex;flex-wrap:wrap;gap:6px;width:100%;justify-content:center}
  .uno-omini{flex:1 1 44%;background:#141a24;border:1px solid #2a3550;border-radius:8px;padding:5px 7px;font-size:12px;min-width:120px}
  .uno-omini.is-turn{border-color:#ffd54a}
  .uno-omini__hd{display:flex;justify-content:space-between;align-items:center;gap:4px}
  .uno-omini__b{margin-top:4px;display:flex;gap:2px;flex-wrap:wrap;align-items:center}
  .uno-back{width:11px;height:16px;border-radius:3px;background:linear-gradient(135deg,#2b3550,#161c2b);border:1px solid #3a4660}
  .uno-uno{font-size:10px;font-weight:800;padding:0 5px;border-radius:8px}
  .uno-uno.said{background:#2faa55;color:#fff}
  .uno-uno.miss{background:#d8443f;color:#fff}
  .uno-catch{font-size:12px;padding:3px 10px;margin-left:4px}   /* 1장 본인이 보는 'UNO 선언'(uno-sayuno)과 동일 크기 — 작아서 탭 빗나가던 문제 해결 */
  .uno-log{margin:4px 0;width:100%}
  .uno-me{background:#10141d;border-top:1px solid #2a3550;padding:6px;font-size:12px}
  .uno-me__row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .uno-sayuno{padding:3px 10px;font-size:12px}
  .uno-hand{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;max-height:30vh;overflow-y:auto}
  .uno-card{padding:0;background:transparent;border:none;cursor:pointer}
  .uno-card[disabled]{opacity:.45;cursor:default}
  .uno-card:not([disabled]) .uno-cf{outline:2px solid #ffd54a;outline-offset:1px}
  .uno-actbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .uno-step{font-size:12px;color:#cdd9ec;flex:1 1 100%}
  .uno-note{color:#9fb0c3;font-size:13px;text-align:center;padding:4px}
  .uno-coltap{padding:8px 14px;border-radius:10px;border:2px solid rgba(255,255,255,.4);background:var(--cc);color:#fff;font-weight:800;cursor:pointer}
  .uno-colgrid{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;justify-content:center}`;
  document.head.appendChild(st);
}
