/* =========================================================================
   economy-net.js — 경제 탭 멀티플레이어 레이어
     · 허브 프레즌스: 같은 서버 허브 군도에 접속한 플레이어 위치 공유(아바타)
     · 거래: 아이템+골드 교환 — 양측 오퍼 → 잠금 → 최종 확정 2단계(각자 자기 세이브만 변경)
     · 파티 던전: 호스트 권위(호스트가 전투 판정·상태 브로드캐스트, 게스트는 공격 전송)
     · 섬 방문: econ_get_player_by_name RPC로 상대 섬(블록 편집+미니언)을 읽기 전용 렌더
   supabase 실시간 채널이 없으면(오프라인/샌드박스) 조용히 비활성 — 게임은 그대로 동작.
   ========================================================================= */
(() => {
  'use strict';

  let ch = null, active = false;
  let myId = 'me', myName = '플레이어';
  let peers = {};        // id -> {name, x,y,z,yaw, world, at}
  let trade = null;      // 거래 상태 머신
  let party = null;      // 파티 던전 상태
  let listeners = [];
  let _posT = 0;

  function api() { return window.econApi || null; }
  function notify() { for (const f of listeners) { try { f(); } catch (e) {} } }
  function toast(msg, good) { if (typeof window.toast === 'function') window.toast(msg, good); }
  let sendHook = null;   // 테스트: 송신 메시지 가로채기
  function send(m) {
    m.id = myId; m.nm = myName;
    if (sendHook) { sendHook(m); return; }
    if (!ch) return;
    try { ch.send({ type: 'broadcast', event: 'e', payload: m }); } catch (e) {}
  }

  /* ---------------- 접속/해제 ---------------- */
  function start() {
    if (active) return;
    if (typeof sb === 'undefined' || !sb) return;
    if (typeof cfg !== 'undefined' && cfg && cfg.cloud === false) return;
    try {
      if (typeof ME !== 'undefined' && ME) { myId = ME.id || 'me'; myName = ME.display || ME.real_name || '플레이어'; }
      ch = sb.channel('econ-world', { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'e' }, p => onMsg(p.payload));
      ch.subscribe();
      active = true;
    } catch (e) { ch = null; active = false; }
  }
  function stop() {
    if (ch) { try { send({ t: 'leave' }); sb.removeChannel(ch); } catch (e) {} }
    ch = null; active = false; peers = {}; trade = null; party = null; _posT = 0;
  }

  /* ---------------- 프레즌스(economy3d 루프가 매 프레임 호출) ---------------- */
  function tick(dt, pos, world) {
    if (!active) return;
    _posT += dt;
    if (_posT < 0.15) return;
    _posT = 0;
    send({ t: 'p', x: pos.x, y: pos.y, z: pos.z, yaw: pos.yaw, world });
    const now = Date.now();
    for (const id in peers) if (now - peers[id].at > 6000) {
      delete peers[id];
      if (trade && trade.peer === id) endTrade('상대와 연결이 끊겼어요');
      if (party && party.peer === id) endParty('상대와 연결이 끊겼어요');
    }
  }

  /* ---------------- 수신 ---------------- */
  function onMsg(m) {
    if (!m || m.id === myId) return;
    if (m.to && m.to !== myId) return;   // 대상 지정 메시지는 나에게 온 것만
    switch (m.t) {
      case 'p':
        peers[m.id] = { name: m.nm, x: m.x, y: m.y, z: m.z, yaw: m.yaw || 0, world: m.world, at: Date.now() };
        return;   // 위치 패킷은 패널 리렌더 불필요(3D 루프가 소비)
      case 'leave':
        delete peers[m.id];
        if (trade && trade.peer === m.id) endTrade('상대가 떠났어요');
        if (party && party.peer === m.id) endParty('상대가 떠났어요');
        break;
      /* ---- 거래 ---- */
      case 'trade_req':
        if (trade || party) { send({ t: 'trade_dec', to: m.id }); return; }
        trade = mkTrade(m.id, m.nm, 'incoming');
        toast(`🤝 ${m.nm}님이 거래를 요청했어요 (허브 → 멀티 탭)`, true);
        break;
      case 'trade_acc':
        if (trade && trade.peer === m.id && trade.stage === 'request_sent') { trade.stage = 'open'; toast('거래가 시작됐어요!', true); }
        break;
      case 'trade_dec':
        if (trade && trade.peer === m.id) endTrade('상대가 거래를 거절했어요');
        break;
      case 'trade_offer':
        if (trade && trade.peer === m.id && trade.stage === 'open') {
          trade.their = { items: m.items || [], gold: m.gold || 0 };
          trade.myLock = trade.theirLock = trade.myConfirm = trade.theirConfirm = false;   // 오퍼 변경 = 잠금 해제
        }
        break;
      case 'trade_lock':
        if (trade && trade.peer === m.id) trade.theirLock = true;
        break;
      case 'trade_confirm':
        if (trade && trade.peer === m.id) { trade.theirConfirm = true; tryCompleteTrade(); }
        break;
      case 'trade_cancel':
        if (trade && trade.peer === m.id) endTrade('상대가 거래를 취소했어요');
        break;
      /* ---- 파티 던전 ---- */
      case 'pt_inv':
        if (trade || party) { send({ t: 'pt_dec', to: m.id }); return; }
        party = { role: 'guest', peer: m.id, peerName: m.nm, floor: m.floor, stage: 'incoming', run: null };
        toast(`⚔️ ${m.nm}님이 던전 ${m.floor}층 파티에 초대했어요 (허브 → 멀티 탭)`, true);
        break;
      case 'pt_acc':
        if (party && party.role === 'host' && party.peer === m.id && party.stage === 'invited') {
          party.stage = 'active';
          const a = api();
          if (a && a.partyStartDungeon) a.partyStartDungeon(party.floor);
        }
        break;
      case 'pt_dec':
        if (party && party.peer === m.id) endParty('상대가 파티를 거절했어요');
        break;
      case 'pt_state':
        if (party && party.role === 'guest' && party.peer === m.id) { party.stage = 'active'; party.run = m.run; }
        break;
      case 'pt_d3':   // 호스트가 3D 카타콤 시작 → 게스트도 같은 던전 월드로
        if (party && party.role === 'guest' && party.peer === m.id) {
          party.stage = 'active3d'; party.floor = m.floor;
          if (typeof window.economy3dDungeonGuest === 'function') window.economy3dDungeonGuest(m.floor);
        }
        break;
      case 'pt_m':    // 몹 스냅샷(고빈도 — 패널 리렌더 없이 3D가 소비)
        if (party && party.role === 'guest' && party.peer === m.id && typeof window.economy3dApplyPartyMobs === 'function') window.economy3dApplyPartyMobs(m.snap);
        return;
      case 'pt_atk3': // 게스트의 3D 공격(호스트 권위 적용)
        if (party && party.role === 'host' && party.peer === m.id && typeof window.economy3dApplyPartyAttack === 'function') window.economy3dApplyPartyAttack(m.i, m.dmg || 0);
        return;
      case 'pt_atk':
        if (party && party.role === 'host' && party.peer === m.id) {
          const a = api();
          if (a && a.partyRemoteAttack) a.partyRemoteAttack(m.atk || 0);
        }
        break;
      case 'pt_end':
        if (party && party.role === 'guest' && party.peer === m.id) {
          const a = api();
          if (a && a.partyGuestReward) a.partyGuestReward(m.result || {});
          if (typeof window.economy3dPartyDungeonEnded === 'function') window.economy3dPartyDungeonEnded();
          endParty(null);
        }
        break;
      case 'pt_leave':
        if (party && party.peer === m.id) endParty('상대가 파티를 떠났어요');
        break;
    }
    notify();
  }

  /* ---------------- 거래 ---------------- */
  function mkTrade(peer, peerName, stage) {
    return { peer, peerName, stage, my: { items: [], gold: 0 }, their: { items: [], gold: 0 }, myLock: false, theirLock: false, myConfirm: false, theirConfirm: false };
  }
  function tradeRequest(peerId) {
    if (!active || trade || party) return;
    const p = peers[peerId]; if (!p) return;
    trade = mkTrade(peerId, p.name, 'request_sent');
    send({ t: 'trade_req', to: peerId });
    toast(`${p.name}님에게 거래를 요청했어요`, true);
    notify();
  }
  function tradeAccept() {
    if (!trade || trade.stage !== 'incoming') return;
    trade.stage = 'open';
    send({ t: 'trade_acc', to: trade.peer });
    notify();
  }
  function tradeDecline() {
    if (!trade) return;
    send({ t: 'trade_dec', to: trade.peer });
    endTrade(null); notify();
  }
  function syncOffer() {
    trade.myLock = trade.theirLock = trade.myConfirm = trade.theirConfirm = false;
    send({ t: 'trade_offer', to: trade.peer, items: trade.my.items, gold: trade.my.gold });
    notify();
  }
  function tradeAddItem(key) {
    if (!trade || trade.stage !== 'open') return;
    const a = api(); if (!a || !a.tradeCanGive) return;
    const cur = trade.my.items.find(it => it.key === key);
    const want = (cur ? cur.n : 0) + 1;
    if (!a.tradeCanGive([{ key, n: want }], 0)) { toast('보유 수량이 부족해요', false); return; }
    if (cur) cur.n = want; else trade.my.items.push({ key, n: 1 });
    syncOffer();
  }
  function tradeRemoveItem(key) {
    if (!trade || trade.stage !== 'open') return;
    trade.my.items = trade.my.items.filter(it => it.key !== key);
    syncOffer();
  }
  function tradeSetGold(g) {
    if (!trade || trade.stage !== 'open') return;
    const a = api();
    g = Math.max(0, Math.floor(g || 0));
    if (a && a.tradeCanGive && !a.tradeCanGive([], g)) { toast('골드가 부족해요', false); return; }
    trade.my.gold = g;
    syncOffer();
  }
  function tradeLock() {
    if (!trade || trade.stage !== 'open' || trade.myLock) return;
    trade.myLock = true;
    send({ t: 'trade_lock', to: trade.peer });
    notify();
  }
  function tradeConfirm() {
    if (!trade || !trade.myLock || !trade.theirLock || trade.myConfirm) return;
    trade.myConfirm = true;
    send({ t: 'trade_confirm', to: trade.peer });
    tryCompleteTrade(); notify();
  }
  function tradeCancel() {
    if (!trade) return;
    send({ t: 'trade_cancel', to: trade.peer });
    endTrade('거래를 취소했어요'); notify();
  }
  function tryCompleteTrade() {
    if (!trade || !trade.myConfirm || !trade.theirConfirm) return;
    const a = api();
    if (a && a.tradeApply) {
      const ok = a.tradeApply(trade.my, trade.their);
      if (ok) toast(`✅ ${trade.peerName}님과의 거래 완료!`, true);
      else send({ t: 'trade_cancel', to: trade.peer });
    }
    trade = null; notify();
  }
  function endTrade(msg) { trade = null; if (msg) toast(msg, false); notify(); }

  /* ---------------- 파티 던전(호스트 권위) ---------------- */
  function partyInvite(peerId, floor) {
    if (!active || trade || party) return;
    const p = peers[peerId]; if (!p) return;
    party = { role: 'host', peer: peerId, peerName: p.name, floor, stage: 'invited', run: null };
    send({ t: 'pt_inv', to: peerId, floor });
    toast(`${p.name}님을 던전 ${floor}층 파티에 초대했어요`, true);
    notify();
  }
  function partyAccept() {
    if (!party || party.role !== 'guest' || party.stage !== 'incoming') return;
    party.stage = 'waiting';
    send({ t: 'pt_acc', to: party.peer });
    notify();
  }
  function partyDecline() {
    if (!party) return;
    send({ t: 'pt_dec', to: party.peer });
    endParty(null); notify();
  }
  function partyLeave() {
    if (!party) return;
    send({ t: 'pt_leave', to: party.peer });
    endParty('파티를 떠났어요'); notify();
  }
  // 호스트: 던전 상태 스냅샷 브로드캐스트(economy.js가 전투 판정 후 호출)
  function partyBroadcastState(run) {
    if (!party || party.role !== 'host' || !active) return;
    send({ t: 'pt_state', to: party.peer, run });
  }
  // 호스트: 던전 종료 통지(게스트 보상 지급 트리거)
  function partyEnd(result) {
    if (!party || party.role !== 'host') return;
    send({ t: 'pt_end', to: party.peer, result });
    endParty(null);
  }
  // 3D 협동 던전 프로토콜
  function partyD3Start(floor) { if (party && party.role === 'host') send({ t: 'pt_d3', to: party.peer, floor }); }
  function partySendMobs(snap) { if (party && party.role === 'host') send({ t: 'pt_m', to: party.peer, snap }); }
  function partySendAttack3(i, dmg) { if (party && party.role === 'guest') send({ t: 'pt_atk3', to: party.peer, i, dmg: Math.round(dmg) }); }
  // 게스트: 공격(내 공격력 계산값을 호스트로 전송 — 호스트가 판정)
  function partySendAttack(atk) {
    if (!party || party.role !== 'guest' || party.stage !== 'active') return;
    send({ t: 'pt_atk', to: party.peer, atk: Math.max(0, Math.round(atk || 0)) });
  }
  function endParty(msg) { party = null; if (msg) toast(msg, false); notify(); }

  /* ---------------- 섬 방문 ---------------- */
  async function visit(peerName) {
    if (typeof sb === 'undefined' || !sb) { toast('온라인 상태에서만 섬을 방문할 수 있어요', false); return false; }
    try {
      const { data } = await sb.rpc('econ_get_player_by_name', { p_name: peerName });
      if (!data) { toast('그 플레이어의 섬을 찾지 못했어요(멀티 SQL 미적용이거나 세이브 없음)', false); return false; }
      if (typeof window.economy3dVisit === 'function') {
        window.economy3dVisit(data.name || peerName, data);
        return true;
      }
    } catch (e) { toast('섬 방문에 실패했어요', false); }
    return false;
  }

  /* ---------------- 공개 API ---------------- */
  window.econNet = {
    start, stop, tick,
    isActive: () => active,
    myId: () => myId,
    peers: () => peers,
    peerList: () => Object.keys(peers).map(id => ({ id, name: peers[id].name, world: peers[id].world })),
    onUpdate: f => listeners.push(f),
    trade: () => trade,
    tradeRequest, tradeAccept, tradeDecline, tradeAddItem, tradeRemoveItem, tradeSetGold, tradeLock, tradeConfirm, tradeCancel,
    party: () => party,
    partyInvite, partyAccept, partyDecline, partyLeave, partyBroadcastState, partyEnd, partySendAttack,
    partyD3Start, partySendMobs, partySendAttack3,
    visit,
    // 테스트 훅: 채널 없이 수신/송신 경로를 직접 구동
    _test: { onMsg, setActive: v => { active = v; }, setSend: f => { sendHook = f; }, setId: (id, nm) => { myId = id; myName = nm; } },
  };
})();
