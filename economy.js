/* =========================================================================
   economy.js — "경제" 탭: 하이픽셀 스카이블럭 x 메이플스토리2 스타일 진행형 경제 게임.
   모험(adventure3d.js) 탭과 완전히 분리된 별도 시스템. 패널/메뉴 중심 UI(3D 월드 아님).
   ========================================================================= */
(function () {
  const D = () => window.ECON_DATA;
  const SAVE_KEY = 'econ_save_v1';
  let running = false, tickTimer = null, zone = 'hub';
  let P = null;   // 플레이어 상태(로드 후 채워짐)
  let activeCombat = null;   // { kind:'slayer'|'dungeonBoss', hp,maxHp,dmg,playerHp,maxPlayerHp, onWin, onLose }
  let dungeonRun = null;     // { floor, roomIdx, rooms:[...], score, secretStep }
  let toastFn = (typeof toast === 'function') ? toast : (m) => console.log(m);

  /* ---------------- 저장/불러오기 ---------------- */
  function freshPlayer() {
    return {
      gold: 500, class: null, reforgeBonus: {}, inv: {}, minions: [], maxMinionSlots: 5,
      skillsXp: { combat: 0, mining: 0, farming: 0, foraging: 0, fishing: 0, enchanting: 0, taming: 0, social: 0 },
      collections: {}, collectionTier: {},
      slayerBest: {}, dungeonBest: {},
      dailySold: {}, dailySoldDate: todayStr(),
      easterEggs: [],
    };
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
  function saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) {} }
  // 클라우드 저장은 로컬 저장의 보조 수단(있으면 동기화, 없어도 로컬로 완전히 동작 — adventure3d.js와 동일한 graceful-degrade 패턴)
  function cloudReady() { return typeof sb !== 'undefined' && sb && typeof ME !== 'undefined' && ME && ME.token; }
  let _cloudSaveAt = 0;
  function saveNow() {
    saveLocal();
    if (!cloudReady()) return;
    const now = Date.now(); if (now - _cloudSaveAt < 4000) return; _cloudSaveAt = now;
    sb.rpc('econ_save_player', { p_token: ME.token, p_state: P }).catch(() => {});
  }
  async function loadCloud() { if (!cloudReady()) return null; try { const { data } = await sb.rpc('econ_load_player', { p_token: ME.token }); return data || null; } catch (e) { return null; } }

  /* ---------------- 인벤토리/골드 유틸 ---------------- */
  function addItem(k, n) { if (n <= 0) return; P.inv[k] = (P.inv[k] || 0) + n; }
  function hasItem(k, n) { return (P.inv[k] || 0) >= (n || 1); }
  function removeItem(k, n) { n = n || 1; if (!hasItem(k, n)) return false; P.inv[k] -= n; if (P.inv[k] <= 0) delete P.inv[k]; return true; }
  function addGold(n) { P.gold = Math.max(0, P.gold + n); }

  /* ---------------- 스킬 레벨(누적 XP → 레벨) ---------------- */
  function skillDef(key) { return D().SKILLS.find(s => s.key === key); }
  function skillLevel(key) {
    const def = skillDef(key); if (!def) return 0;
    let xp = P.skillsXp[key] || 0, lvl = 0;
    while (lvl < 30) { const req = def.xpBase * Math.pow(lvl + 1, def.xpExp); if (xp < req) break; xp -= req; lvl++; }
    return lvl;
  }
  function addSkillXp(key, n) {
    if (!P.skillsXp[key] && P.skillsXp[key] !== 0) P.skillsXp[key] = 0;
    const before = skillLevel(key);
    P.skillsXp[key] += n;
    const after = skillLevel(key);
    if (after > before) toastFn(`${skillDef(key).name} 스킬 레벨 ${after} 달성!`, true);
  }

  /* ---------------- 컬렉션 ---------------- */
  function resourceDef(key) { for (const cat of D().COLLECTIONS) { const r = cat.resources.find(x => x.key === key); if (r) return r; } return null; }
  function collectionTierIdx(key) {
    const def = resourceDef(key); if (!def) return 0;
    const n = P.collections[key] || 0;
    let tier = 0; for (let i = 0; i < def.tierThresholds.length; i++) if (n >= def.tierThresholds[i]) tier = i + 1;
    return tier;
  }
  function addCollection(key, n) {
    P.collections[key] = (P.collections[key] || 0) + n;
    const before = P.collectionTier[key] || 0, after = collectionTierIdx(key);
    if (after > before) { P.collectionTier[key] = after; toastFn(`${resourceDef(key).name} 컬렉션 티어 ${after} 달성!`, true); }
  }

  /* ---------------- 전투력(간이, 등급별 장비 반영) ---------------- */
  function classDef() { return D().JOB_CLASSES.find(c => c.key === P.class) || { strength: 0, defense: 0, hp: 0, intelligence: 0 }; }
  // 등급 순서(common→ancient)로 저장된 배열에서 보유 중인 가장 높은 등급 장비를 찾음
  function bestOwnedEquip(list) { for (let i = list.length - 1; i >= 0; i--) if (hasItem(list[i].key)) return list[i]; return null; }
  function equippedWeapon() { return bestOwnedEquip(D().EQUIPMENT.weapons); }
  function equippedArmor() { return bestOwnedEquip(D().EQUIPMENT.armor); }
  function equippedAccessory() { return bestOwnedEquip(D().EQUIPMENT.accessories); }
  function equippedWeaponDmg() { const w = equippedWeapon(); if (!w) return 0; return w.dmg + (P.reforgeBonus[w.key] || 0); }
  function playerAttackPower() {
    const acc = equippedAccessory();
    return 5 + classDef().strength * 0.5 + equippedWeaponDmg() + (acc ? acc.allStatBonus * 0.5 : 0);
  }
  function playerDefensePct() {
    let def = classDef().defense;
    const a = equippedArmor(); if (a) def += a.defense;
    const acc = equippedAccessory(); if (acc) def += acc.allStatBonus * 0.3;
    return Math.min(0.8, def * 0.02);
  }
  function playerMaxHp() { return 100 + classDef().hp + skillLevel('farming') * 2 + skillLevel('fishing'); }

  /* ---------------- 채집(채굴/농사/낚시) ---------------- */
  let _lastGatherAt = 0;
  function gather(zoneKey) {
    const now = Date.now(); if (now - _lastGatherAt < 450) return; _lastGatherAt = now;
    const table = D().GATHER_TABLE[zoneKey]; if (!table) return;
    const hasTool = hasItem(table.toolKey);
    const totalW = table.drops.reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * totalW, pick = table.drops[0];
    for (const d of table.drops) { if (r < d.weight) { pick = d; break; } r -= d.weight; }
    let qty = pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1));
    if (!hasTool) qty = Math.max(1, Math.floor(qty / 2));
    addItem(pick.key, qty); addCollection(pick.key, qty);
    addSkillXp(table.skill, 3 + Math.floor(Math.random() * 4));
    // 이스터에그: 채굴 시 극저확률 다이아몬드 스티브 미니언 스킨
    if (zoneKey === 'mine' && Math.random() < D().EASTER_EGGS.minionSkinDropChance) {
      addItem('skin_diamond_steve', 1);
      if (P.easterEggs.indexOf('minionSkin') < 0) P.easterEggs.push('minionSkin');
      toastFn(`✨ 초희귀 드롭! "${D().EASTER_EGGS.minionSkinName}" 미니언 스킨 획득!`, true);
    }
    // 이스터에그: 심야 낚시 유머 아이템
    if (zoneKey === 'dock') {
      const h = new Date().getHours(); const [h0, h1] = D().EASTER_EGGS.insomniaFishHourRange;
      const inRange = h0 < h1 ? (h >= h0 && h < h1) : (h >= h0 || h < h1);
      if (inRange && Math.random() < 0.01) {
        addItem('fish_insomnia', 1);
        if (P.easterEggs.indexOf('insomniaFish') < 0) P.easterEggs.push('insomniaFish');
        toastFn(`🐟 "${D().EASTER_EGGS.insomniaFishName}" — "${D().EASTER_EGGS.insomniaFishLine}"`, true);
      }
    }
    saveNow(); renderZone();
  }

  /* ---------------- 상점 ---------------- */
  function shopDef(key) { return D().SHOP.find(s => s.key === key); }
  function dailySoldCheck() { if (P.dailySoldDate !== todayStr()) { P.dailySoldDate = todayStr(); P.dailySold = {}; } }
  function buyItem(key) {
    const def = shopDef(key); if (!def || def.buyPrice <= 0) return;
    if (P.gold < def.buyPrice) { toastFn('골드가 부족해요', false); return; }
    addGold(-def.buyPrice); addItem(key, 1); saveNow(); renderZone();
  }
  function sellItem(key, n) {
    n = n || 1; const def = shopDef(key); if (!def) return;
    dailySoldCheck();
    const limit = (def.stackSize || 1) * D().DAILY_SELL_LIMIT_PER_STACK;
    const already = P.dailySold[key] || 0;
    const room = limit - already; if (room <= 0) { toastFn('오늘 이 아이템의 판매 한도에 도달했어요', false); return; }
    const sellN = Math.min(n, room, P.inv[key] || 0); if (sellN <= 0) { toastFn('보유 수량이 부족해요', false); return; }
    removeItem(key, sellN); addGold(def.sellPrice * sellN); P.dailySold[key] = already + sellN;
    saveNow(); renderZone();
  }

  /* ---------------- 미니언 ---------------- */
  function minionDef(key) { return D().MINIONS.find(m => m.key === key); }
  function minionTierInfo(key, tier) { return minionDef(key).tiers.find(t => t.tier === tier); }
  function nextMinionCost(key, curTier) { const t = minionTierInfo(key, curTier + 1); return t ? t.cost : null; }
  function placeMinion(key) {
    if (P.minions.length >= P.maxMinionSlots) { toastFn('일꾼 슬롯이 가득 찼어요', false); return; }
    const cost = minionTierInfo(key, 1).cost;
    if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
    addGold(-cost);
    P.minions.push({ key, tier: 1, lastCollectAt: Date.now(), storage: 0, storageUpgraded: false });
    saveNow(); renderZone();
  }
  function upgradeMinion(idx) {
    const m = P.minions[idx]; if (!m) return;
    const def = minionDef(m.key); if (m.tier >= def.maxTier) { toastFn('이미 최고 등급이에요', false); return; }
    const cost = nextMinionCost(m.key, m.tier); if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
    addGold(-cost); m.tier++; saveNow(); renderZone();
  }
  function upgradeMinionStorage(idx) {
    const m = P.minions[idx]; if (!m || m.storageUpgraded) return;
    if (P.gold < D().MINION_STORAGE_UPGRADE_COST) { toastFn('골드가 부족해요', false); return; }
    addGold(-D().MINION_STORAGE_UPGRADE_COST); m.storageUpgraded = true; saveNow(); renderZone();
  }
  function minionStorageCap(m) { return m.storageUpgraded ? D().MINION_STORAGE_UPGRADED : D().MINION_STORAGE_BASE; }
  function tickMinions() {
    const now = Date.now(); const autoSell = hasItem('auto_shipping_module');
    let changed = false;
    for (const m of P.minions) {
      const def = minionDef(m.key), tinfo = minionTierInfo(m.key, m.tier);
      const intervalMs = tinfo.intervalSec * 1000;
      const capMs = D().MINION_OFFLINE_CAP_HOURS * 3600 * 1000;
      let elapsed = Math.min(now - m.lastCollectAt, capMs);
      if (elapsed < intervalMs) continue;
      const produced = Math.floor(elapsed / intervalMs);
      if (produced <= 0) continue;
      changed = true;
      if (autoSell) {
        const shopEntry = shopDef(def.resource);
        addGold((shopEntry ? shopEntry.sellPrice : 1) * produced);
      } else {
        const cap = minionStorageCap(m);
        m.storage = Math.min(cap, m.storage + produced);
      }
      m.lastCollectAt += produced * intervalMs;
    }
    if (changed) saveNow();
  }
  function collectMinion(idx) {
    const m = P.minions[idx]; if (!m || m.storage <= 0) return;
    const def = minionDef(m.key);
    addItem(def.resource, m.storage); addCollection(def.resource, m.storage);
    m.storage = 0; saveNow(); renderZone();
  }

  /* ---------------- 슬레이어 ---------------- */
  function slayerDef(key) { return D().SLAYERS.find(s => s.key === key); }
  function startSlayer(key, tier) {
    const def = slayerDef(key); const tinfo = def.tiers.find(t => t.tier === tier); if (!tinfo) return;
    if (skillLevel('combat') < tinfo.minCombatLevel) { toastFn(`전투 스킬 레벨 ${tinfo.minCombatLevel} 필요`, false); return; }
    if (P.gold < tinfo.turnInGold) { toastFn('골드가 부족해요', false); return; }
    addGold(-tinfo.turnInGold); saveNow();
    activeCombat = {
      kind: 'slayer', label: `${def.name} T${tier}`, hp: tinfo.hp, maxHp: tinfo.hp, dmg: tinfo.dmg,
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(),
      onWin: () => {
        addSkillXp('combat', tinfo.xpReward); addGold(tinfo.coinReward);
        const roll = Math.random(); const loot = tinfo.rareDropTable; const item = loot[roll < 0.6 ? 0 : (roll < 0.9 ? Math.min(1, loot.length - 1) : loot.length - 1)];
        toastFn(`${def.name} 처치! +${tinfo.coinReward}G, 전리품: ${item}`, true);
        P.slayerBest[key] = Math.max(P.slayerBest[key] || 0, tier);
        saveNow();
      },
      onLose: () => { toastFn('보스에게 패배했어요...', false); },
    };
    renderZone();
  }

  /* ---------------- 던전 ---------------- */
  function dungeonFloorDef(f) { return D().DUNGEON.floors.find(x => x.floor === f); }
  function dungeonGrade(score) {
    const th = D().DUNGEON.scoreThresholds; let g = 'F';
    for (const [name, min] of th) if (score >= min) g = name;
    return g;
  }
  function canEnterFloor(f) { if (f === 1) return true; const prev = P.dungeonBest[f - 1]; return !!prev && prev !== 'F'; }
  function startDungeon(floor) {
    if (!canEnterFloor(floor)) { toastFn('이전 층을 먼저 클리어하세요', false); return; }
    dungeonRun = { floor, roomIdx: 0, rooms: ['combat', 'puzzle', 'miniboss', 'combat', 'boss'], score: 0, secretStep: 0 };
    renderZone();
  }
  function dungeonRoomType() { return dungeonRun.rooms[dungeonRun.roomIdx]; }
  function dungeonAdvance(outcome) {
    const S = D().DUNGEON_ROOM_SCORE;
    if (dungeonRoomType() === 'combat') dungeonRun.score += S.combat;
    else if (dungeonRoomType() === 'puzzle') dungeonRun.score += outcome === 'correct' ? S.puzzleSuccess : S.puzzleFail;
    else if (dungeonRoomType() === 'miniboss') dungeonRun.score += S.miniboss;
    dungeonRun.roomIdx++;
    if (dungeonRoomType() === 'boss') { startDungeonBoss(); return; }
    renderZone();
  }
  function startDungeonBoss() {
    const fd = dungeonFloorDef(dungeonRun.floor);
    activeCombat = {
      kind: 'dungeonBoss', label: fd.bossName, hp: fd.bossHp, maxHp: fd.bossHp, dmg: fd.bossDmg,
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(),
      onWin: () => {
        const grade = dungeonGrade(dungeonRun.score);
        P.dungeonBest[dungeonRun.floor] = gradeMax(P.dungeonBest[dungeonRun.floor], grade);
        addItem('dungeon_essence', fd.essenceReward);
        const item = fd.lootTable[Math.floor(Math.random() * fd.lootTable.length)];
        toastFn(`${fd.bossName} 처치! 등급 ${grade}, 던전 정수 +${fd.essenceReward}, 전리품: ${item}`, true);
        saveNow(); dungeonRun = null;
      },
      onLose: () => { P.dungeonBest[dungeonRun.floor] = gradeMax(P.dungeonBest[dungeonRun.floor], 'F'); toastFn('던전에서 전멸했어요... (등급 F)', false); saveNow(); dungeonRun = null; },
    };
    renderZone();
  }
  function gradeMax(a, b) {
    const order = ['F', 'D', 'C', 'B', 'A', 'S', 'S+']; if (!a) return b;
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
  function dungeonSecretClick(dir) {
    const seq = D().EASTER_EGGS.dungeonSecretSequence;
    if (dir === seq[dungeonRun.secretStep]) { dungeonRun.secretStep++; if (dungeonRun.secretStep >= seq.length) { dungeonRun.score += 40; dungeonRun.secretStep = 0; toastFn('숨겨진 문을 발견했어요! 점수 +40', true); } }
    else dungeonRun.secretStep = 0;
    renderZone();
  }

  /* ---------------- 전투(공용: 슬레이어/던전 보스) ---------------- */
  function combatAttack() {
    if (!activeCombat) return;
    const c = activeCombat;
    c.hp = Math.max(0, c.hp - playerAttackPower());
    if (c.hp <= 0) { const onWin = c.onWin; activeCombat = null; onWin(); renderZone(); return; }
    const dmgTaken = c.dmg * (0.7 + Math.random() * 0.6) * (1 - playerDefensePct());
    c.playerHp = Math.max(0, c.playerHp - dmgTaken);
    if (c.playerHp <= 0) { const onLose = c.onLose; activeCombat = null; onLose(); renderZone(); return; }
    renderZone();
  }
  function combatFlee() { activeCombat = null; dungeonRun = null; renderZone(); }

  /* ---------------- 리포지 ---------------- */
  function reforge(key) {
    const shopE = shopDef(key); if (!shopE || !hasItem(key)) return;
    const tierDef = D().ITEM_TIERS.find(t => t.key === shopE.tierKey) || D().ITEM_TIERS[0];
    if (P.gold < tierDef.reforgeCost) { toastFn('골드가 부족해요', false); return; }
    addGold(-tierDef.reforgeCost);
    P.reforgeBonus[key] = (P.reforgeBonus[key] || 0) + 1 + Math.floor(Math.random() * 3);
    toastFn(`리포지 성공! ${shopE.name} 공격력 보너스 +${P.reforgeBonus[key]}`, true);
    saveNow(); renderZone();
  }

  /* ---------------- 렌더링 ---------------- */
  function fmtGold(n) { return n.toLocaleString('ko-KR') + 'G'; }
  function tierColor(name) { return (D().ITEM_TIERS.find(t => t.name === name) || {}).colorHex || '#fff'; }

  function screenHTML() {
    return `<section class="screen econ-screen" data-act-root="econ">
      <div class="econ-top">
        <div class="econ-gold">💰 ${P ? fmtGold(P.gold) : ''}</div>
        <div class="econ-class">${P && P.class ? (D().JOB_CLASSES.find(c => c.key === P.class) || {}).name : ''}</div>
        <button class="btn btn--ghost" data-act="backHome">✕</button>
      </div>
      <div id="econBody" class="econ-body"></div>
    </section>`;
  }

  function renderZone() {
    const body = document.getElementById('econBody'); if (!body) return;
    if (!P.class) { body.innerHTML = classPickHTML(); return; }
    if (activeCombat) { body.innerHTML = combatHTML(); return; }
    if (dungeonRun) { body.innerHTML = dungeonRoomHTML(); return; }
    body.innerHTML = zoneNavHTML() + zoneBodyHTML(zone);
  }

  function classPickHTML() {
    return `<div class="econ-panel">
      <h3>직업을 선택하세요</h3>
      <div class="econ-classgrid">
        ${D().JOB_CLASSES.map(c => `<button class="econ-classcard" data-act="econ_class_pick" data-key="${c.key}">
          <div class="econ-classcard__name">${c.name}</div>
          <div class="econ-classcard__flavor">${c.flavor}</div>
          <div class="econ-classcard__stats">체력+${c.hp} 방어+${c.defense} 힘+${c.strength} 지력+${c.intelligence}</div>
        </button>`).join('')}
      </div>
    </div>`;
  }

  function zoneNavHTML() {
    return `<div class="econ-zonenav">${D().ZONES.map(z => `<button class="econ-zonebtn ${z.key === zone ? 'is-active' : ''}" data-act="econ_zone" data-key="${z.key}">${z.emoji} ${z.name}</button>`).join('')}</div>`;
  }

  function zoneBodyHTML(z) {
    if (z === 'hub') return hubHTML();
    if (z === 'mine' || z === 'farm' || z === 'dock') return gatherZoneHTML(z);
    if (z === 'slayerden') return slayerZoneHTML();
    if (z === 'dungeonentrance') return dungeonZoneHTML();
    return '';
  }

  function hubHTML() {
    const zdef = D().ZONES.find(x => x.key === 'hub');
    return `<div class="econ-panel">
      <p class="muted">${zdef.desc}</p>
      <h4>상점</h4>
      <div class="econ-shopgrid">${D().SHOP.map(s => `
        <div class="econ-shopitem">
          <span>${s.name}</span>
          <span class="muted">${hasItem(s.key) ? '보유 ' + P.inv[s.key] : ''}</span>
          ${s.buyPrice > 0 ? `<button class="btn btn--sm" data-act="econ_buy" data-key="${s.key}">구매 ${fmtGold(s.buyPrice)}</button>` : ''}
          ${s.sellPrice > 0 ? `<button class="btn btn--sm btn--ghost" data-act="econ_sell" data-key="${s.key}" ${hasItem(s.key) ? '' : 'disabled'}>판매 ${fmtGold(s.sellPrice)}</button>` : ''}
        </div>`).join('')}</div>
      <h4>일꾼 관리소 (슬롯 ${P.minions.length}/${P.maxMinionSlots})</h4>
      <div class="econ-minionplace">${D().MINIONS.map(m => `<button class="btn btn--sm" data-act="econ_minion_place" data-key="${m.key}">${m.name} 설치(${fmtGold(m.tiers[0].cost)})</button>`).join('')}</div>
      <div class="econ-minionlist">${P.minions.map((m, i) => minionRowHTML(m, i)).join('')}</div>
      <h4>리포지</h4>
      <div class="econ-shopgrid">${D().EQUIPMENT.weapons.filter(w => hasItem(w.key)).map(w => `
        <div class="econ-shopitem"><span>${w.name} <span style="color:${tierColor(D().ITEM_TIERS.find(t => t.key === w.tierKey).name)}">[${D().ITEM_TIERS.find(t => t.key === w.tierKey).name}]</span> (보너스+${P.reforgeBonus[w.key] || 0})</span>
        <button class="btn btn--sm" data-act="econ_reforge" data-key="${w.key}">리포지 ${fmtGold(D().ITEM_TIERS.find(t => t.key === w.tierKey).reforgeCost)}</button></div>`).join('') || '<p class="muted">보유한 무기가 없어요</p>'}</div>
      ${bankSecretHTML()}
    </div>`;
  }
  function bankSecretHTML() {
    const seedDay = new Date().getDate();
    if (seedDay % 3 !== 0) return '';
    return `<p class="muted econ-secret">은행원 ${D().EASTER_EGGS.bankSecretName}: "오늘도 열심히 버시는군요!"</p>`;
  }
  function minionRowHTML(m, i) {
    const def = minionDef(m.key), tinfo = minionTierInfo(m.key, m.tier), cap = minionStorageCap(m);
    return `<div class="econ-minionrow">
      <span>${def.name} T${m.tier} — ${resourceDef(def.resource).name} 저장 ${m.storage}/${cap}</span>
      <button class="btn btn--sm" data-act="econ_minion_collect" data-idx="${i}" ${m.storage > 0 ? '' : 'disabled'}>수거</button>
      ${m.tier < def.maxTier ? `<button class="btn btn--sm" data-act="econ_minion_upgrade" data-idx="${i}">업그레이드(${fmtGold(nextMinionCost(m.key, m.tier))})</button>` : '<span class="muted">최고 등급</span>'}
      ${!m.storageUpgraded ? `<button class="btn btn--sm btn--ghost" data-act="econ_minion_storage" data-idx="${i}">저장고 확장(${fmtGold(D().MINION_STORAGE_UPGRADE_COST)})</button>` : ''}
    </div>`;
  }

  function gatherZoneHTML(z) {
    const zdef = D().ZONES.find(x => x.key === z), table = D().GATHER_TABLE[z];
    const label = z === 'mine' ? '채굴하기' : z === 'farm' ? '수확하기' : '낚시하기';
    return `<div class="econ-panel">
      <p class="muted">${zdef.desc}</p>
      <button class="btn btn--primary btn--lg" data-act="econ_gather" data-key="${z}">${label}</button>
      <p class="muted">${skillDef(table.skill).name} 스킬 Lv.${skillLevel(table.skill)}</p>
      <div class="econ-colgrid">${table.drops.map(d => {
        const rdef = resourceDef(d.key); const tier = collectionTierIdx(d.key);
        return `<div class="econ-colrow"><span>${rdef.name}</span><span>보유 ${P.inv[d.key] || 0}</span><span class="muted">컬렉션 ${P.collections[d.key] || 0} (티어 ${tier}/${rdef.tierThresholds.length})</span></div>`;
      }).join('')}</div>
    </div>`;
  }

  function slayerZoneHTML() {
    return `<div class="econ-panel"><p class="muted">${D().ZONES.find(z => z.key === 'slayerden').desc}</p>
      ${D().SLAYERS.map(s => {
        const best = P.slayerBest[s.key] || 0;
        return `<div class="econ-slayercard"><h4>${s.name} <span class="muted">(${s.flavor})</span></h4>
          <div class="econ-tierbtns">${s.tiers.map(t => `<button class="btn btn--sm" data-act="econ_slayer_start" data-key="${s.key}" data-tier="${t.tier}" ${t.tier > best + 1 ? 'disabled' : ''}>T${t.tier} (${fmtGold(t.turnInGold)}, 전투Lv${t.minCombatLevel}+)</button>`).join('')}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function dungeonZoneHTML() {
    return `<div class="econ-panel"><p class="muted">${D().ZONES.find(z => z.key === 'dungeonentrance').desc}</p>
      <p>던전 정수: ${P.inv.dungeon_essence || 0}</p>
      <div class="econ-essenceshop">${D().ESSENCE_SHOP.map(e => `<button class="btn btn--sm" data-act="econ_essence_buy" data-key="${e.key}" ${(P.inv.dungeon_essence || 0) >= e.cost ? '' : 'disabled'}>${e.name} (정수 ${e.cost})</button>`).join('')}</div>
      ${D().DUNGEON.floors.map(f => `<div class="econ-floorcard"><h4>${f.floor}층 — ${f.bossName}</h4>
        <p class="muted">최고 등급: ${P.dungeonBest[f.floor] || '-'}</p>
        <button class="btn btn--sm" data-act="econ_dungeon_start" data-floor="${f.floor}" ${canEnterFloor(f.floor) ? '' : 'disabled'}>입장</button>
      </div>`).join('')}
    </div>`;
  }

  function combatHTML() {
    const c = activeCombat;
    return `<div class="econ-panel econ-combat">
      <h3>${c.label}</h3>
      <div class="econ-hpbar"><div class="econ-hpbar__fill" style="width:${(c.hp / c.maxHp * 100).toFixed(1)}%"></div><span>보스 HP ${Math.ceil(c.hp)}/${c.maxHp}</span></div>
      <div class="econ-hpbar econ-hpbar--player"><div class="econ-hpbar__fill" style="width:${(c.playerHp / c.maxPlayerHp * 100).toFixed(1)}%"></div><span>내 HP ${Math.ceil(c.playerHp)}/${c.maxPlayerHp}</span></div>
      <button class="btn btn--primary btn--lg" data-act="econ_combat_attack">공격!</button>
      <button class="btn btn--ghost" data-act="econ_combat_flee">도망</button>
    </div>`;
  }

  function dungeonRoomHTML() {
    const rt = dungeonRoomType();
    let inner = '';
    if (rt === 'combat') inner = `<p>몬스터 무리와 전투 중...</p><button class="btn btn--primary" data-act="econ_dungeon_advance">방 클리어</button>`;
    else if (rt === 'puzzle') inner = `<p>퍼즐방: 올바른 레버를 당기세요</p>
      <div class="econ-puzzlebtns">${[0, 1, 2].map(i => `<button class="btn" data-act="econ_dungeon_puzzle" data-i="${i}">레버 ${i + 1}</button>`).join('')}</div>`;
    else if (rt === 'miniboss') inner = `<p>미니보스 등장!</p><button class="btn btn--primary" data-act="econ_dungeon_advance">처치 시도</button>`;
    const secretHint = dungeonRun.floor === 3 ? `<div class="econ-secretdoor"><p class="muted">(수상한 벽...)</p>${['left', 'right'].map(d => `<button class="btn btn--sm btn--ghost" data-act="econ_dungeon_secret" data-dir="${d}">${d === 'left' ? '◀' : '▶'}</button>`).join('')}</div>` : '';
    return `<div class="econ-panel"><h3>${dungeonRun.floor}층 · 방 ${dungeonRun.roomIdx + 1}/${dungeonRun.rooms.length} (${rt})</h3>
      <p>현재 점수: ${dungeonRun.score}</p>${inner}${secretHint}
      <button class="btn btn--ghost" data-act="econ_combat_flee">포기</button>
    </div>`;
  }

  /* ---------------- 액션 디스패치 ---------------- */
  function act(a, el) {
    if (a.indexOf('econ_') !== 0) return false;
    const k = a.slice(5);
    if (k === 'enter') { open(); return true; }
    if (!P) return true;
    switch (k) {
      case 'class_pick': P.class = el.dataset.key; saveNow(); renderZone(); break;
      case 'zone': zone = el.dataset.key; renderZone(); break;
      case 'gather': gather(el.dataset.key); break;
      case 'buy': buyItem(el.dataset.key); break;
      case 'sell': sellItem(el.dataset.key, 1); break;
      case 'minion_place': placeMinion(el.dataset.key); break;
      case 'minion_collect': collectMinion(Number(el.dataset.idx)); break;
      case 'minion_upgrade': upgradeMinion(Number(el.dataset.idx)); break;
      case 'minion_storage': upgradeMinionStorage(Number(el.dataset.idx)); break;
      case 'reforge': reforge(el.dataset.key); break;
      case 'slayer_start': startSlayer(el.dataset.key, Number(el.dataset.tier)); break;
      case 'dungeon_start': startDungeon(Number(el.dataset.floor)); break;
      case 'dungeon_advance': dungeonAdvance(); break;
      case 'dungeon_puzzle': { const correct = dungeonRun._correctIdx == null ? (dungeonRun._correctIdx = Math.floor(Math.random() * 3)) : dungeonRun._correctIdx; dungeonAdvance(Number(el.dataset.i) === correct ? 'correct' : 'wrong'); dungeonRun._correctIdx = null; break; }
      case 'dungeon_secret': dungeonSecretClick(el.dataset.dir); break;
      case 'essence_buy': { const e = D().ESSENCE_SHOP.find(x => x.key === el.dataset.key); if (e && (P.inv.dungeon_essence || 0) >= e.cost) { removeItem('dungeon_essence', e.cost); if (e.kind === 'gold') addGold(e.goldAmount); else addItem(e.key, 1); saveNow(); renderZone(); } break; }
      case 'combat_attack': combatAttack(); break;
      case 'combat_flee': combatFlee(); break;
      default: return false;
    }
    return true;
  }

  /* ---------------- 진입/종료 ---------------- */
  function open() {
    P = loadLocal() || freshPlayer();
    dailySoldCheck();
    tickMinions();
    running = true;
    tickTimer = setInterval(() => { tickMinions(); if (running) renderZone(); }, 3000);
    // 화면 표시는 3D 프레젠테이션 레이어(economy3d.js)에 위임 — 상태/로직은 이 파일이 그대로 담당
    if (typeof window.economy3dStart === 'function') window.economy3dStart();
    else { if (typeof setScreen === 'function') setScreen('econ'); if (typeof app === 'function') app().innerHTML = screenHTML(); renderZone(); }
    // 클라우드 세이브가 로컬보다 최신이면 교체(로컬 미존재 시에도 클라우드 우선 적용) — 실패해도 로컬로 계속 동작
    loadCloud().then(cloudState => {
      if (!running || !cloudState) return;
      P = cloudState; dailySoldCheck(); tickMinions(); renderZone();
    });
  }
  function stop() {
    running = false;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (P) saveNow();
    if (typeof window.economy3dStop === 'function') window.economy3dStop();
  }

  window.economyOpen = open;
  window.economyStop = stop;
  window.econAct = act;
  // 3D 프레젠테이션 레이어(economy3d.js)가 상태를 읽기 위한 최소 공개 API(로직 변경 없음, 읽기 전용 노출)
  window.econApi = { getP: () => P, hasActiveEncounter: () => !!(activeCombat || dungeonRun) };

  if (typeof window !== 'undefined' && window.__ECON_TEST) {
    window.__econ = {
      open, stop, act, getP: () => P, setP: v => { P = v; }, renderZone,
      gather, buyItem, sellItem, addItem, hasItem, removeItem, addGold,
      skillLevel, addSkillXp, addCollection, collectionTierIdx,
      placeMinion, upgradeMinion, upgradeMinionStorage, collectMinion, tickMinions, minionStorageCap,
      startSlayer, combatAttack, combatFlee, getActiveCombat: () => activeCombat,
      startDungeon, dungeonAdvance, dungeonSecretClick, getDungeonRun: () => dungeonRun, dungeonGrade, canEnterFloor,
      reforge, playerAttackPower, playerDefensePct, playerMaxHp,
      freshPlayer, saveNow, saveLocal, loadLocal, loadCloud, cloudReady, setZone: z => { zone = z; }, getZone: () => zone,
    };
  }
})();
