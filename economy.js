/* =========================================================================
   economy.js — "경제" 탭 게임 로직 V2 (하이픽셀 스카이블럭 x 메이플스토리)
   상태/규칙/패널 렌더링 담당. 3D 월드 표현은 economy3d.js(프레젠테이션 레이어).
   V2 신규: 펫·부적(마력)·인챈트·은행 이자·페어리 소울·일일 특가·도구 티어·일꾼 연료.
   ========================================================================= */
(function () {
  const D = () => window.ECON_DATA;
  const SAVE_KEY = 'econ_save_v1';
  let running = false, tickTimer = null, zone = 'hub', hubTab = 'shop';
  let P = null;   // 플레이어 상태(로드 후 채워짐)
  let activeCombat = null;   // { kind:'slayer'|'dungeonBoss', hp,maxHp,dmg,playerHp,maxPlayerHp,_hits, onWin, onLose }
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
      // --- V2 필드 ---
      pets: {}, activePet: null, petXp: {},
      enchants: { weapon: {}, armor: {} },
      fairySouls: [],
      bank: 0, lastInterestDay: null,
      minionSlotsBought: 0, minionFuelUntil: 0,
      dealsBought: {}, dealsDate: null,
    };
  }
  // 구버전 세이브 마이그레이션: 누락 필드를 기본값으로 채움(중첩 객체 포함)
  function migrate(p) {
    const fresh = freshPlayer();
    for (const k in fresh) if (p[k] === undefined) p[k] = fresh[k];
    for (const k in fresh.skillsXp) if (p.skillsXp[k] === undefined) p.skillsXp[k] = 0;
    if (!p.enchants.weapon) p.enchants.weapon = {};
    if (!p.enchants.armor) p.enchants.armor = {};
    return p;
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function loadLocal() { try { const p = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return p ? migrate(p) : null; } catch (e) { return null; } }
  function saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) {} }
  function cloudReady() { return typeof sb !== 'undefined' && sb && typeof ME !== 'undefined' && ME && ME.token; }
  let _cloudSaveAt = 0;
  function saveNow() {
    saveLocal();
    if (!cloudReady()) return;
    const now = Date.now(); if (now - _cloudSaveAt < 4000) return; _cloudSaveAt = now;
    sb.rpc('econ_save_player', { p_token: ME.token, p_state: P }).catch(() => {});
  }
  async function loadCloud() { if (!cloudReady()) return null; try { const { data } = await sb.rpc('econ_load_player', { p_token: ME.token }); return data ? migrate(data) : null; } catch (e) { return null; } }

  /* ---------------- 인벤토리/골드 유틸 ---------------- */
  function addItem(k, n) { if (n <= 0) return; P.inv[k] = (P.inv[k] || 0) + n; }
  function hasItem(k, n) { return (P.inv[k] || 0) >= (n || 1); }
  function removeItem(k, n) { n = n || 1; if (!hasItem(k, n)) return false; P.inv[k] -= n; if (P.inv[k] <= 0) delete P.inv[k]; return true; }
  function addGold(n) { P.gold = Math.max(0, P.gold + n); }

  /* ---------------- 스킬 레벨 ---------------- */
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
    // 활성 펫이 같은 스킬 계열이면 함께 성장(조련 레벨당 +1%)
    if (P.activePet) {
      const pd = petDef(P.activePet);
      if (pd && pd.skill === key) {
        const pb = petLevel(P.activePet);
        P.petXp[P.activePet] = (P.petXp[P.activePet] || 0) + n * (1 + skillLevel('taming') * 0.01);
        const pa = petLevel(P.activePet);
        if (pa > pb) toastFn(`펫 ${pd.name} 레벨 ${pa} 달성!`, true);
      }
    }
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
    if (!resourceDef(key)) return;
    P.collections[key] = (P.collections[key] || 0) + n;
    const before = P.collectionTier[key] || 0, after = collectionTierIdx(key);
    if (after > before) { P.collectionTier[key] = after; toastFn(`${resourceDef(key).name} 컬렉션 티어 ${after} 달성!`, true); }
  }

  /* ---------------- 펫 ---------------- */
  function petDef(key) { return D().PETS.find(p => p.key === key); }
  function petLevel(key) {
    let xp = P.petXp[key] || 0, lvl = 0;
    while (lvl < D().PET_MAX_LEVEL) { const req = D().PET_XP_BASE * Math.pow(lvl + 1, D().PET_XP_EXP); if (xp < req) break; xp -= req; lvl++; }
    return lvl;
  }
  function hatchPet(petKey) {
    const eggKey = `pet_egg_${petKey}`;
    if (!hasItem(eggKey)) { toastFn('펫 알이 없어요', false); return false; }
    if (P.pets[petKey]) { toastFn('이미 보유한 펫이에요', false); return false; }
    removeItem(eggKey, 1);
    P.pets[petKey] = true; P.petXp[petKey] = P.petXp[petKey] || 0;
    if (!P.activePet) P.activePet = petKey;
    toastFn(`펫 ${petDef(petKey).name} 부화!`, true);
    saveNow(); renderZone(); return true;
  }
  function activatePet(petKey) {
    if (!P.pets[petKey]) return;
    P.activePet = petKey; saveNow(); renderZone();
  }
  function petStats() {
    const out = { str: 0, def: 0, hp: 0 };
    if (!P.activePet || !P.pets[P.activePet]) return out;
    const pd = petDef(P.activePet); if (!pd) return out;
    const lvl = petLevel(P.activePet);
    out.str = (pd.perLvl.str || 0) * lvl; out.def = (pd.perLvl.def || 0) * lvl; out.hp = (pd.perLvl.hp || 0) * lvl;
    return out;
  }

  /* ---------------- 부적(마력) ---------------- */
  function talismanStats() {
    const out = { str: 0, def: 0, hp: 0, mp: 0, sellBonus: 0, minionSpeed: 0, doublePct: { mine: 0, farm: 0, forest: 0, dock: 0 } };
    for (const t of D().TALISMANS) {
      if (!hasItem(t.key)) continue;
      const tier = D().ITEM_TIERS.find(x => x.key === t.tierKey);
      out.mp += tier ? tier.magicalPower : 0;
      const e = t.effect || {};
      out.str += e.str || 0; out.def += e.def || 0; out.hp += e.hp || 0;
      out.sellBonus += e.sellBonus || 0; out.minionSpeed += e.minionSpeed || 0;
      if (e.doubleZone) out.doublePct[e.doubleZone] = (out.doublePct[e.doubleZone] || 0) + (e.doublePct || 0);
    }
    out.mp += P.fairySouls.length * D().FAIRY_SOULS.mpPerSoul;
    return out;
  }
  function magicalPower() { return talismanStats().mp; }
  function mpStatMul() { return 1 + (magicalPower() / 10) * (D().MAGICAL_POWER.statPctPer10MP / 100); }
  function fairyBonus() {
    const sets = Math.floor(P.fairySouls.length / 5);
    return { hp: sets * D().FAIRY_SOULS.per5Bonus.hp, str: sets * D().FAIRY_SOULS.per5Bonus.str };
  }
  function collectFairySoul(id) {
    if (P.fairySouls.indexOf(id) >= 0) return false;
    P.fairySouls.push(id);
    addGold(D().FAIRY_SOULS.goldPerSoul);
    addSkillXp('social', 50);
    const n = P.fairySouls.length;
    toastFn(`✨ 페어리 소울 발견! (${n}/${D().FAIRY_SOULS.total}) +${D().FAIRY_SOULS.goldPerSoul}G, 마력 +${D().FAIRY_SOULS.mpPerSoul}`, true);
    if (n % 5 === 0) toastFn(`🧚 5개 달성 보너스! 체력 +${D().FAIRY_SOULS.per5Bonus.hp}, 힘 +${D().FAIRY_SOULS.per5Bonus.str} (영구)`, true);
    saveNow(); return true;
  }

  /* ---------------- 인챈트 ---------------- */
  function enchantDef(key) { return D().ENCHANTS.find(e => e.key === key); }
  function enchantLvl(slot, key) { return (P.enchants[slot] && P.enchants[slot][key]) || 0; }
  function applyEnchant(key) {
    const def = enchantDef(key); if (!def) return false;
    const slot = def.target;
    const cur = enchantLvl(slot, key);
    if (cur >= def.maxLvl) { toastFn('이미 최고 레벨이에요', false); return false; }
    const bookKey = `enchant_book_${key}`;
    if (!hasItem(bookKey)) { toastFn('인챈트북이 필요해요(상점/슬레이어/던전에서 획득)', false); return false; }
    const fee = def.bookBasePrice * cur;   // 레벨이 오를수록 부여 비용 증가(첫 레벨은 무료 부여)
    if (P.gold < fee) { toastFn(`부여 비용 ${fmtGold(fee)}이 부족해요`, false); return false; }
    removeItem(bookKey, 1); addGold(-fee);
    P.enchants[slot][key] = cur + 1;
    addSkillXp('enchanting', 30 + cur * 20);
    toastFn(`${def.name} ${cur + 1}레벨 부여 완료!`, true);
    saveNow(); renderZone(); return true;
  }

  /* ---------------- 전투력(장비+펫+부적+인챈트+스킬 통합) ---------------- */
  function classDef() { return D().JOB_CLASSES.find(c => c.key === P.class) || { strength: 0, defense: 0, hp: 0, intelligence: 0 }; }
  function bestOwnedEquip(list) { for (let i = list.length - 1; i >= 0; i--) if (hasItem(list[i].key)) return list[i]; return null; }
  function equippedWeapon() { return bestOwnedEquip(D().EQUIPMENT.weapons); }
  function equippedArmor() { return bestOwnedEquip(D().EQUIPMENT.armor); }
  function equippedWeaponDmg() { const w = equippedWeapon(); if (!w) return 0; return w.dmg + (P.reforgeBonus[w.key] || 0); }
  function playerStr() { return classDef().strength + skillLevel('foraging') + talismanStats().str + petStats().str + fairyBonus().str; }
  function playerAttackPower() {
    const flat = 5 + playerStr() * 0.5 + equippedWeaponDmg();
    const mul = (1 + skillLevel('combat') * 0.04 + enchantLvl('weapon', 'sharpness') * 0.05 + enchantLvl('weapon', 'critical') * 0.04) * mpStatMul();
    return flat * mul;
  }
  function playerDefensePct() {
    let def = classDef().defense + skillLevel('mining') + talismanStats().def + petStats().def;
    const a = equippedArmor(); if (a) def += a.defense;
    def += enchantLvl('armor', 'protection') * 4;
    def *= mpStatMul();
    return Math.min(0.85, def * 0.02);
  }
  function playerMaxHp() {
    return Math.round(100 + classDef().hp + skillLevel('farming') * 2 + skillLevel('fishing')
      + enchantLvl('armor', 'growth') * 15 + talismanStats().hp + petStats().hp + fairyBonus().hp);
  }

  /* ---------------- 채집(광산/농장/숲/부둣가) ---------------- */
  function bestToolMul(family) {
    const ladder = D().TOOLS[family]; if (!ladder) return 1;
    for (let i = ladder.length - 1; i >= 0; i--) if (hasItem(ladder[i].key)) return ladder[i].mul;
    return 0.5;   // 도구 없음 = 절반
  }
  let _lastGatherAt = 0;
  function gather(zoneKey) {
    const now = Date.now(); if (now - _lastGatherAt < 450) return; _lastGatherAt = now;
    const table = D().GATHER_TABLE[zoneKey]; if (!table) return;
    const totalW = table.drops.reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * totalW, pick = table.drops[0];
    for (const d of table.drops) { if (r < d.weight) { pick = d; break; } r -= d.weight; }
    let qty = pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1));
    qty = Math.max(1, Math.round(qty * bestToolMul(table.toolFamily)));
    const dbl = talismanStats().doublePct[zoneKey] || 0;
    if (dbl > 0 && Math.random() * 100 < dbl) { qty *= 2; }
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

  /* ---------------- 상점/특가 ---------------- */
  function shopDef(key) { return D().SHOP.find(s => s.key === key); }
  function dailySoldCheck() { if (P.dailySoldDate !== todayStr()) { P.dailySoldDate = todayStr(); P.dailySold = {}; } }
  function sellBonusPct() { return Math.min(10, Math.floor(skillLevel('social') / 5)) + talismanStats().sellBonus; }
  function minionSlotCost() { return Math.round(D().MINION_SLOT_COST_BASE * Math.pow(D().MINION_SLOT_COST_MUL, P.minionSlotsBought)); }
  function buyItem(key) {
    const def = shopDef(key); if (!def || def.buyPrice <= 0) return;
    // 특수: 일꾼 슬롯 확장권(즉시 적용, 가격 누진)
    if (key === 'minion_slot_expander') {
      if (P.maxMinionSlots >= D().MINION_SLOT_MAX) { toastFn('일꾼 슬롯이 최대예요', false); return; }
      const cost = minionSlotCost();
      if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
      addGold(-cost); P.maxMinionSlots++; P.minionSlotsBought++;
      toastFn(`일꾼 슬롯 확장! (${P.maxMinionSlots}칸)`, true);
      saveNow(); renderZone(); return;
    }
    if (P.gold < def.buyPrice) { toastFn('골드가 부족해요', false); return; }
    addGold(-def.buyPrice); addItem(key, 1); saveNow(); renderZone();
  }
  function sellItem(key, n) {
    n = n || 1; const def = shopDef(key); if (!def || def.sellPrice <= 0) return;
    dailySoldCheck();
    const limit = (def.stackSize || 1) * D().DAILY_SELL_LIMIT_PER_STACK;
    const already = P.dailySold[key] || 0;
    const room = limit - already; if (room <= 0) { toastFn('오늘 이 아이템의 판매 한도에 도달했어요', false); return; }
    const sellN = Math.min(n, room, P.inv[key] || 0); if (sellN <= 0) { toastFn('보유 수량이 부족해요', false); return; }
    removeItem(key, sellN);
    addGold(Math.round(def.sellPrice * sellN * (1 + sellBonusPct() / 100)));
    P.dailySold[key] = already + sellN;
    saveNow(); renderZone();
  }
  // 일일 특가(날짜 시드 고정 3종, 각 1회 구매)
  function seededRand(seedStr) { let h = 2166136261; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function dealsForToday() {
    const day = todayStr(); const rand = seededRand('deal' + day);
    const pool = D().SHOP.filter(s => s.buyPrice > 300 && s.key !== 'minion_slot_expander');
    const deals = [];
    for (let i = 0; i < D().DAILY_DEALS.count && pool.length; i++) {
      const idx = Math.floor(rand() * pool.length);
      const item = pool.splice(idx, 1)[0];
      const disc = D().DAILY_DEALS.discountMin + rand() * (D().DAILY_DEALS.discountMax - D().DAILY_DEALS.discountMin);
      deals.push({ key: item.key, name: item.name, orig: item.buyPrice, price: Math.round(item.buyPrice * (1 - disc)), discPct: Math.round(disc * 100) });
    }
    return deals;
  }
  function buyDeal(i) {
    if (P.dealsDate !== todayStr()) { P.dealsDate = todayStr(); P.dealsBought = {}; }
    if (P.dealsBought[i]) { toastFn('오늘은 이미 구매했어요', false); return; }
    const deal = dealsForToday()[i]; if (!deal) return;
    if (P.gold < deal.price) { toastFn('골드가 부족해요', false); return; }
    addGold(-deal.price); addItem(deal.key, 1); P.dealsBought[i] = true;
    addSkillXp('social', 10);
    toastFn(`특가 구매! ${deal.name} (-${deal.discPct}%)`, true);
    saveNow(); renderZone();
  }

  /* ---------------- 은행 ---------------- */
  function bankInterestTick() {
    const day = todayStr();
    if (P.lastInterestDay === day) return;
    if (P.lastInterestDay && P.bank > 0) {
      const interest = Math.round(Math.min(P.bank, D().BANK.interestCapBalance) * D().BANK.interestPctPerDay / 100);
      if (interest > 0) { P.bank += interest; toastFn(`🏦 은행 이자 +${fmtGold(interest)} 입금!`, true); }
    }
    P.lastInterestDay = day;
  }
  function bankDeposit(amount) {
    amount = amount === 'all' ? P.gold : Math.min(amount, P.gold);
    if (amount <= 0) { toastFn('예치할 골드가 없어요', false); return; }
    addGold(-amount); P.bank += amount; saveNow(); renderZone();
  }
  function bankWithdraw(amount) {
    amount = amount === 'all' ? P.bank : Math.min(amount, P.bank);
    if (amount <= 0) { toastFn('출금할 골드가 없어요', false); return; }
    P.bank -= amount; addGold(amount); saveNow(); renderZone();
  }

  /* ---------------- 미니언 ---------------- */
  function minionDef(key) { return D().MINIONS.find(m => m.key === key); }
  function minionTierInfo(key, tier) { return minionDef(key).tiers.find(t => t.tier === tier); }
  function nextMinionCost(key, curTier) { const t = minionTierInfo(key, curTier + 1); return t ? t.cost : null; }
  function minionSpeedMul() {
    let mul = 1 + talismanStats().minionSpeed / 100;
    if (P.minionFuelUntil > Date.now()) mul *= D().MINION_FUEL.speedMul;
    return mul;
  }
  function useMinionFuel() {
    if (!hasItem(D().MINION_FUEL.key)) { toastFn('연료가 없어요(상점에서 구매)', false); return; }
    removeItem(D().MINION_FUEL.key, 1);
    const base = Math.max(Date.now(), P.minionFuelUntil || 0);
    P.minionFuelUntil = base + D().MINION_FUEL.durationHours * 3600 * 1000;
    toastFn(`연료 주입! 모든 일꾼 +25% (${D().MINION_FUEL.durationHours}시간)`, true);
    saveNow(); renderZone();
  }
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
    const speedMul = minionSpeedMul();
    let changed = false;
    for (const m of P.minions) {
      const def = minionDef(m.key); if (!def) continue;
      const tinfo = minionTierInfo(m.key, m.tier);
      const intervalMs = tinfo.intervalSec * 1000 / speedMul;
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
  function itemName(key) { const s = shopDef(key); return s ? s.name : key; }
  function startSlayer(key, tier) {
    const def = slayerDef(key); const tinfo = def.tiers.find(t => t.tier === tier); if (!tinfo) return;
    if (skillLevel('combat') < tinfo.minCombatLevel) { toastFn(`전투 스킬 레벨 ${tinfo.minCombatLevel} 필요`, false); return; }
    if (P.gold < tinfo.turnInGold) { toastFn('골드가 부족해요', false); return; }
    addGold(-tinfo.turnInGold); saveNow();
    activeCombat = {
      kind: 'slayer', label: `${def.flavor} T${tier}`, hp: tinfo.hp, maxHp: tinfo.hp, dmg: tinfo.dmg,
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(), _hits: 0,
      onWin: () => {
        addSkillXp('combat', tinfo.xpReward);
        const coin = Math.round(tinfo.coinReward * (1 + enchantLvl('weapon', 'looting') * 0.15));
        addGold(coin);
        // 기본 전리품(자원) + 희귀 드롭(실제 아이템 지급)
        const resN = 2 + Math.floor(Math.random() * 3);
        addItem(def.dropResource, resN); addCollection(def.dropResource, resN);
        const roll = Math.random(); const loot = tinfo.rareDropTable;
        const itemKey = loot[roll < 0.6 ? 0 : (roll < 0.9 ? Math.min(1, loot.length - 1) : loot.length - 1)];
        addItem(itemKey, 1);
        toastFn(`${def.flavor} 처치! +${fmtGold(coin)}, ${itemName(def.dropResource)} ×${resN}, 전리품: ${itemName(itemKey)}`, true);
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
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(), _hits: 0,
      onWin: () => {
        const grade = dungeonGrade(dungeonRun.score);
        P.dungeonBest[dungeonRun.floor] = gradeMax(P.dungeonBest[dungeonRun.floor], grade);
        addItem('dungeon_essence', fd.essenceReward);
        const itemKey = fd.lootTable[Math.floor(Math.random() * fd.lootTable.length)];
        addItem(itemKey, 1);
        toastFn(`${fd.bossName} 처치! 등급 ${grade}, 던전 정수 +${fd.essenceReward}, 전리품: ${itemName(itemKey)}`, true);
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

  /* ---------------- 전투(공용) ---------------- */
  function combatAttack() {
    if (!activeCombat) return;
    const c = activeCombat;
    let dmg = playerAttackPower();
    if (c._hits === 0) dmg *= 1 + enchantLvl('weapon', 'first_strike') * 0.25;   // 선제공격
    if (c.maxHp >= 100000) dmg *= 1 + enchantLvl('weapon', 'giant_killer') * 0.08;   // 거인 사냥꾼
    c._hits++;
    c.hp = Math.max(0, c.hp - dmg);
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
  function tierColorByKey(tierKey) { return (D().ITEM_TIERS.find(t => t.key === tierKey) || {}).colorHex || '#fff'; }
  function tierNameByKey(tierKey) { return (D().ITEM_TIERS.find(t => t.key === tierKey) || {}).name || ''; }

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
    if (z === 'mine' || z === 'farm' || z === 'forest' || z === 'dock') return gatherZoneHTML(z);
    if (z === 'slayerden') return slayerZoneHTML();
    if (z === 'dungeonentrance') return dungeonZoneHTML();
    return '';
  }

  /* ---- 허브(서브탭: 상점/은행/일꾼/펫/장신구/인챈트/리포지/특가/컬렉션/스탯) ---- */
  const HUB_TABS = [
    ['shop', '🛒 상점'], ['bank', '🏦 은행'], ['minions', '⚙️ 일꾼'], ['pets', '🐾 펫'],
    ['talismans', '📿 장신구'], ['enchant', '✨ 인챈트'], ['reforge', '🔨 리포지'],
    ['deals', '🎪 특가'], ['collections', '📚 컬렉션'], ['stats', '📊 스탯'],
  ];
  function hubHTML() {
    return `<div class="econ-panel">
      <div class="econ-hubtabs">${HUB_TABS.map(([k, label]) => `<button class="econ-zonebtn ${hubTab === k ? 'is-active' : ''}" data-act="econ_hubtab" data-key="${k}">${label}</button>`).join('')}</div>
      ${hubTabBodyHTML()}
      ${bankSecretHTML()}
    </div>`;
  }
  function hubTabBodyHTML() {
    switch (hubTab) {
      case 'shop': return shopHTML();
      case 'bank': return bankHTML();
      case 'minions': return minionsHTML();
      case 'pets': return petsHTML();
      case 'talismans': return talismansHTML();
      case 'enchant': return enchantHTML();
      case 'reforge': return reforgeHTML();
      case 'deals': return dealsHTML();
      case 'collections': return collectionsHTML();
      case 'stats': return statsHTML();
    }
    return '';
  }
  function shopHTML() {
    const cats = [];
    for (const s of D().SHOP) if (cats.indexOf(s.category) < 0) cats.push(s.category);
    return cats.map(cat => {
      const items = D().SHOP.filter(s => s.category === cat && (s.buyPrice > 0 || (P.inv[s.key] || 0) > 0));
      if (!items.length) return '';
      return `<h4>${cat}</h4><div class="econ-shopgrid">${items.map(s => `
        <div class="econ-shopitem">
          <span>${s.tierKey ? `<span style="color:${tierColorByKey(s.tierKey)}">${s.name}</span>` : s.name}</span>
          <span class="muted">${hasItem(s.key) ? '보유 ' + P.inv[s.key] : ''}</span>
          ${s.buyPrice > 0 ? `<button class="btn btn--sm" data-act="econ_buy" data-key="${s.key}">구매 ${fmtGold(s.key === 'minion_slot_expander' ? minionSlotCost() : s.buyPrice)}</button>` : ''}
          ${s.sellPrice > 0 ? `<button class="btn btn--sm btn--ghost" data-act="econ_sell" data-key="${s.key}" ${hasItem(s.key) ? '' : 'disabled'}>판매 ${fmtGold(s.sellPrice)}</button>` : ''}
        </div>`).join('')}</div>`;
    }).join('');
  }
  function bankHTML() {
    return `<h4>🏦 은행 (하루 ${D().BANK.interestPctPerDay}% 이자, 잔고 ${fmtGold(D().BANK.interestCapBalance)}까지)</h4>
      <p>예치금: <b style="color:#facc15">${fmtGold(P.bank)}</b> · 소지금: ${fmtGold(P.gold)}</p>
      <div class="econ-tierbtns">
        ${[1000, 10000, 'all'].map(a => `<button class="btn btn--sm" data-act="econ_bank_deposit" data-amt="${a}">예치 ${a === 'all' ? '전부' : fmtGold(a)}</button>`).join('')}
        ${[1000, 10000, 'all'].map(a => `<button class="btn btn--sm btn--ghost" data-act="econ_bank_withdraw" data-amt="${a}">출금 ${a === 'all' ? '전부' : fmtGold(a)}</button>`).join('')}
      </div>
      <p class="muted">매일 첫 접속 시 이자가 자동 지급돼요.</p>`;
  }
  function minionsHTML() {
    const fuelLeft = P.minionFuelUntil > Date.now() ? Math.ceil((P.minionFuelUntil - Date.now()) / 3600000) : 0;
    return `<h4>⚙️ 일꾼 관리소 (슬롯 ${P.minions.length}/${P.maxMinionSlots})</h4>
      <div class="econ-tierbtns">
        <button class="btn btn--sm" data-act="econ_buy" data-key="minion_slot_expander" ${P.maxMinionSlots >= D().MINION_SLOT_MAX ? 'disabled' : ''}>슬롯 확장(${fmtGold(minionSlotCost())})</button>
        <button class="btn btn--sm" data-act="econ_minion_fuel" ${hasItem(D().MINION_FUEL.key) ? '' : 'disabled'}>연료 주입(보유 ${P.inv[D().MINION_FUEL.key] || 0})</button>
        ${fuelLeft ? `<span class="muted">🔥 연료 가동 중(~${fuelLeft}시간)</span>` : ''}
      </div>
      <div class="econ-minionplace">${D().MINIONS.map(m => `<button class="btn btn--sm" data-act="econ_minion_place" data-key="${m.key}">${m.name}(${fmtGold(m.tiers[0].cost)})</button>`).join('')}</div>
      <div class="econ-minionlist">${P.minions.map((m, i) => minionRowHTML(m, i)).join('') || '<p class="muted">설치된 일꾼이 없어요</p>'}</div>`;
  }
  function petsHTML() {
    const eggs = D().SHOP.filter(s => s.category === '펫' && hasItem(s.key));
    return `<h4>🐾 펫 (활성 1마리의 보너스가 적용돼요)</h4>
      ${eggs.length ? `<h4 class="muted">보유한 알</h4><div class="econ-tierbtns">${eggs.map(e => `<button class="btn btn--sm" data-act="econ_pet_hatch" data-key="${e.key.replace('pet_egg_', '')}">${e.name} 부화 (보유 ${P.inv[e.key]})</button>`).join('')}</div>` : ''}
      <div class="econ-shopgrid">${D().PETS.map(p => {
        const owned = !!P.pets[p.key]; const lvl = owned ? petLevel(p.key) : 0;
        return `<div class="econ-shopitem">
          <span style="color:${tierColorByKey(p.tierKey)}">${p.name} [${tierNameByKey(p.tierKey)}]</span>
          <span class="muted">${owned ? `Lv.${lvl} — ${p.perkText}` : (p.eggPrice > 0 ? '상점에서 알 구매' : '보스 드롭 전용')}</span>
          ${owned ? (P.activePet === p.key ? '<span style="color:#4ade80">✔ 활성</span>' : `<button class="btn btn--sm" data-act="econ_pet_activate" data-key="${p.key}">활성화</button>`) : ''}
        </div>`;
      }).join('')}</div>`;
  }
  function talismansHTML() {
    const ts = talismanStats();
    return `<h4>📿 장신구 가방 — 마력 ${magicalPower()} (최종 공격/방어 +${((mpStatMul() - 1) * 100).toFixed(1)}%)</h4>
      <p class="muted">페어리 소울 ${P.fairySouls.length}/${D().FAIRY_SOULS.total} (3D 월드 곳곳에 숨어 있어요)</p>
      <div class="econ-shopgrid">${D().TALISMANS.map(t => `
        <div class="econ-shopitem">
          <span style="color:${tierColorByKey(t.tierKey)}">${hasItem(t.key) ? '✔ ' : ''}${t.name}</span>
          <span class="muted">${t.desc}</span>
          ${!hasItem(t.key) && t.buyPrice > 0 ? `<button class="btn btn--sm" data-act="econ_buy" data-key="${t.key}">구매 ${fmtGold(t.buyPrice)}</button>` : ''}
        </div>`).join('')}</div>
      <p class="muted">합계 보너스: 힘 +${ts.str} · 방어 +${ts.def} · 체력 +${ts.hp} · 판매가 +${ts.sellBonus}% · 일꾼속도 +${ts.minionSpeed}%</p>`;
  }
  function enchantHTML() {
    return `<h4>✨ 인챈트 탑 (인챈트북 1권 + 부여 비용 소모)</h4>
      <div class="econ-shopgrid">${D().ENCHANTS.map(e => {
        const cur = enchantLvl(e.target, e.key); const book = `enchant_book_${e.key}`;
        const fee = e.bookBasePrice * cur;
        return `<div class="econ-shopitem">
          <span>${e.name} ${cur}/${e.maxLvl} <span class="muted">(${e.target === 'weapon' ? '무기' : '방어구'})</span></span>
          <span class="muted">${e.desc} · 북 보유 ${P.inv[book] || 0}</span>
          <button class="btn btn--sm" data-act="econ_enchant" data-key="${e.key}" ${cur >= e.maxLvl || !hasItem(book) ? 'disabled' : ''}>부여${fee > 0 ? `(${fmtGold(fee)})` : '(무료)'}</button>
        </div>`;
      }).join('')}</div>`;
  }
  function reforgeHTML() {
    const owned = D().EQUIPMENT.weapons.filter(w => hasItem(w.key));
    return `<h4>🔨 재련소</h4>
      <div class="econ-shopgrid">${owned.map(w => `
        <div class="econ-shopitem"><span style="color:${tierColorByKey(w.tierKey)}">${w.name} (보너스+${P.reforgeBonus[w.key] || 0})</span>
        <button class="btn btn--sm" data-act="econ_reforge" data-key="${w.key}">리포지 ${fmtGold((D().ITEM_TIERS.find(t => t.key === w.tierKey) || {}).reforgeCost || 250)}</button></div>`).join('') || '<p class="muted">보유한 무기가 없어요</p>'}</div>`;
  }
  function dealsHTML() {
    const bought = P.dealsDate === todayStr() ? P.dealsBought : {};
    return `<h4>🎪 경매인의 일일 특가 (매일 3종, 각 1회)</h4>
      <div class="econ-shopgrid">${dealsForToday().map((d, i) => `
        <div class="econ-shopitem">
          <span>${d.name}</span>
          <span class="muted"><s>${fmtGold(d.orig)}</s> → <b style="color:#facc15">${fmtGold(d.price)}</b> (-${d.discPct}%)</span>
          <button class="btn btn--sm" data-act="econ_deal_buy" data-i="${i}" ${bought[i] ? 'disabled' : ''}>${bought[i] ? '구매 완료' : '구매'}</button>
        </div>`).join('')}</div>`;
  }
  function collectionsHTML() {
    return D().COLLECTIONS.map(cat => `<h4>${cat.category}</h4><div class="econ-colgrid">${cat.resources.map(r => {
      const tier = collectionTierIdx(r.key);
      return `<div class="econ-colrow"><span>${r.name}</span><span>보유 ${P.inv[r.key] || 0}</span><span class="muted">컬렉션 ${P.collections[r.key] || 0} (티어 ${tier}/${r.tierThresholds.length})</span></div>`;
    }).join('')}</div>`).join('');
  }
  function statsHTML() {
    const w = equippedWeapon(), a = equippedArmor();
    return `<h4>📊 내 스탯</h4>
      <div class="econ-colgrid">
        <div class="econ-colrow"><span>공격력</span><span>${playerAttackPower().toFixed(1)}</span><span class="muted">무기: ${w ? w.name : '없음'}</span></div>
        <div class="econ-colrow"><span>피해 감소</span><span>${(playerDefensePct() * 100).toFixed(1)}%</span><span class="muted">방어구: ${a ? a.name : '없음'}</span></div>
        <div class="econ-colrow"><span>최대 체력</span><span>${playerMaxHp()}</span><span class="muted">힘 ${playerStr().toFixed(0)} · 마력 ${magicalPower()}</span></div>
      </div>
      <h4>스킬</h4>
      <div class="econ-colgrid">${D().SKILLS.map(s => `<div class="econ-colrow"><span>${s.name}</span><span>Lv.${skillLevel(s.key)}</span><span class="muted">${s.bonusText}</span></div>`).join('')}</div>
      <h4>펫</h4>
      <p class="muted">${P.activePet ? `활성: ${petDef(P.activePet).name} Lv.${petLevel(P.activePet)}` : '활성 펫 없음'}</p>`;
  }
  function bankSecretHTML() {
    const seedDay = new Date().getDate();
    if (seedDay % 3 !== 0) return '';
    return `<p class="muted econ-secret">은행원 ${D().EASTER_EGGS.bankSecretName}: "오늘도 열심히 버시는군요!"</p>`;
  }
  function minionRowHTML(m, i) {
    const def = minionDef(m.key), cap = minionStorageCap(m);
    return `<div class="econ-minionrow">
      <span>${def.name} T${m.tier} — ${resourceDef(def.resource).name} 저장 ${m.storage}/${cap}</span>
      <button class="btn btn--sm" data-act="econ_minion_collect" data-idx="${i}" ${m.storage > 0 ? '' : 'disabled'}>수거</button>
      ${m.tier < def.maxTier ? `<button class="btn btn--sm" data-act="econ_minion_upgrade" data-idx="${i}">업그레이드(${fmtGold(nextMinionCost(m.key, m.tier))})</button>` : '<span class="muted">최고 등급</span>'}
      ${!m.storageUpgraded ? `<button class="btn btn--sm btn--ghost" data-act="econ_minion_storage" data-idx="${i}">저장고 확장(${fmtGold(D().MINION_STORAGE_UPGRADE_COST)})</button>` : ''}
    </div>`;
  }

  function gatherZoneHTML(z) {
    const zdef = D().ZONES.find(x => x.key === z), table = D().GATHER_TABLE[z];
    const label = z === 'mine' ? '채굴하기' : z === 'farm' ? '수확하기' : z === 'forest' ? '벌목하기' : '낚시하기';
    const mul = bestToolMul(table.toolFamily);
    return `<div class="econ-panel">
      <p class="muted">${zdef.desc}</p>
      <button class="btn btn--primary btn--lg" data-act="econ_gather" data-key="${z}">${label}</button>
      <p class="muted">${skillDef(table.skill).name} 스킬 Lv.${skillLevel(table.skill)} · 도구 배율 ×${mul}</p>
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
        <p class="muted">최고 등급: ${P.dungeonBest[f.floor] || '-'} · 정수 +${f.essenceReward}</p>
        <button class="btn btn--sm" data-act="econ_dungeon_start" data-floor="${f.floor}" ${canEnterFloor(f.floor) ? '' : 'disabled'}>입장</button>
      </div>`).join('')}
    </div>`;
  }

  function combatHTML() {
    const c = activeCombat;
    return `<div class="econ-panel econ-combat">
      <h3>${c.label}</h3>
      <div class="econ-hpbar"><div class="econ-hpbar__fill" style="width:${(c.hp / c.maxHp * 100).toFixed(1)}%"></div><span>보스 HP ${Math.ceil(c.hp).toLocaleString('ko-KR')}/${c.maxHp.toLocaleString('ko-KR')}</span></div>
      <div class="econ-hpbar econ-hpbar--player"><div class="econ-hpbar__fill" style="width:${(c.playerHp / c.maxPlayerHp * 100).toFixed(1)}%"></div><span>내 HP ${Math.ceil(c.playerHp)}/${c.maxPlayerHp}</span></div>
      <button class="btn btn--primary btn--lg" data-act="econ_combat_attack">공격! (${playerAttackPower().toFixed(0)})</button>
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
    const secretHint = dungeonRun.floor >= 3 ? `<div class="econ-secretdoor"><p class="muted">(수상한 벽...)</p>${['left', 'right'].map(d => `<button class="btn btn--sm btn--ghost" data-act="econ_dungeon_secret" data-dir="${d}">${d === 'left' ? '◀' : '▶'}</button>`).join('')}</div>` : '';
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
      case 'hubtab': hubTab = el.dataset.key; renderZone(); break;
      case 'gather': gather(el.dataset.key); break;
      case 'buy': buyItem(el.dataset.key); break;
      case 'sell': sellItem(el.dataset.key, 1); break;
      case 'minion_place': placeMinion(el.dataset.key); break;
      case 'minion_collect': collectMinion(Number(el.dataset.idx)); break;
      case 'minion_upgrade': upgradeMinion(Number(el.dataset.idx)); break;
      case 'minion_storage': upgradeMinionStorage(Number(el.dataset.idx)); break;
      case 'minion_fuel': useMinionFuel(); break;
      case 'pet_hatch': hatchPet(el.dataset.key); break;
      case 'pet_activate': activatePet(el.dataset.key); break;
      case 'enchant': applyEnchant(el.dataset.key); break;
      case 'bank_deposit': bankDeposit(el.dataset.amt === 'all' ? 'all' : Number(el.dataset.amt)); break;
      case 'bank_withdraw': bankWithdraw(el.dataset.amt === 'all' ? 'all' : Number(el.dataset.amt)); break;
      case 'deal_buy': buyDeal(Number(el.dataset.i)); break;
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
    bankInterestTick();
    tickMinions();
    running = true;
    tickTimer = setInterval(() => { tickMinions(); if (running) renderZone(); }, 3000);
    // 화면 표시는 3D 프레젠테이션 레이어(economy3d.js)에 위임 — 상태/로직은 이 파일이 그대로 담당
    if (typeof window.economy3dStart === 'function') window.economy3dStart();
    else { if (typeof setScreen === 'function') setScreen('econ'); if (typeof app === 'function') app().innerHTML = screenHTML(); renderZone(); }
    // 클라우드 세이브가 로컬보다 최신이면 교체 — 실패해도 로컬로 계속 동작
    loadCloud().then(cloudState => {
      if (!running || !cloudState) return;
      P = cloudState; dailySoldCheck(); bankInterestTick(); tickMinions(); renderZone();
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
  // 3D 프레젠테이션 레이어(economy3d.js) 공개 API
  window.econApi = {
    getP: () => P,
    hasActiveEncounter: () => !!(activeCombat || dungeonRun),
    collectFairySoul,
    fairySoulCollected: (id) => !!(P && P.fairySouls.indexOf(id) >= 0),
  };

  if (typeof window !== 'undefined' && window.__ECON_TEST) {
    window.__econ = {
      open, stop, act, getP: () => P, setP: v => { P = v; }, renderZone,
      gather, buyItem, sellItem, addItem, hasItem, removeItem, addGold,
      skillLevel, addSkillXp, addCollection, collectionTierIdx,
      placeMinion, upgradeMinion, upgradeMinionStorage, collectMinion, tickMinions, minionStorageCap, minionSpeedMul, useMinionFuel,
      startSlayer, combatAttack, combatFlee, getActiveCombat: () => activeCombat,
      startDungeon, dungeonAdvance, dungeonSecretClick, getDungeonRun: () => dungeonRun, dungeonGrade, canEnterFloor,
      reforge, playerAttackPower, playerDefensePct, playerMaxHp, playerStr,
      hatchPet, activatePet, petLevel, petStats, petDef,
      talismanStats, magicalPower, mpStatMul, fairyBonus, collectFairySoul,
      applyEnchant, enchantLvl,
      bankDeposit, bankWithdraw, bankInterestTick,
      dealsForToday, buyDeal, bestToolMul, sellBonusPct, minionSlotCost,
      freshPlayer, migrate, saveNow, saveLocal, loadLocal, loadCloud, cloudReady,
      setZone: z => { zone = z; }, getZone: () => zone, setHubTab: t => { hubTab = t; }, getHubTab: () => hubTab,
    };
  }
})();
