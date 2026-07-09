/* =========================================================================
   economy.js — "경제" 탭 게임 로직 V2 (하이픽셀 스카이블럭 x 메이플스토리)
   상태/규칙/패널 렌더링 담당. 3D 월드 표현은 economy3d.js(프레젠테이션 레이어).
   V2 신규: 펫·부적(마력)·인챈트·은행 이자·페어리 소울·일일 특가·도구 티어·미니언 연료.
   ========================================================================= */
(function () {
  const D = () => window.ECON_DATA;
  const SAVE_KEY = 'econ_save_v1';
  let running = false, tickTimer = null, zone = 'hub', hubTab = 'shop', invFilter = 'all', invDetailKey = null, craftSel = null, bazaarCat = 'farming', bazaarQty = 16, ahDur = 6;
  // V21-B: Shift 상태 추적(인벤토리 Shift+클릭 = 즉시 핫바 이동, MC 표준) — 테스트 스텁 환경 가드
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', e => { if (e.key === 'Shift') window.__shiftDown = true; });
    document.addEventListener('keyup', e => { if (e.key === 'Shift') window.__shiftDown = false; });
    if (typeof window.addEventListener === 'function') window.addEventListener('blur', () => { window.__shiftDown = false; });
  }
  let craftGrid = Array(9).fill(null);
  let P = null;   // 플레이어 상태(로드 후 채워짐)
  let activeCombat = null;   // { kind:'slayer'|'dungeonBoss', hp,maxHp,dmg,playerHp,maxPlayerHp,_hits, onWin, onLose }
  let dungeonRun = null;     // { floor, roomIdx, rooms:[...], score, secretStep }
  let toastFn = (typeof toast === 'function') ? toast : (m) => console.log(m);

  /* ---------------- 저장/불러오기 ---------------- */
  function freshPlayer() {
    return {
      ver: 6, gold: 0, dungeonClass: 'berserk', reforgeBonus: {}, inv: { cobblestone: 16, oak_planks: 8, dirt: 8 }, minions: [], maxMinionSlots: 5, minionCrafts: {},   // V12: 스타터 블럭(V13에서 위키 스타터 상자로 정밀화)
      skillsXp: { combat: 0, mining: 0, farming: 0, foraging: 0, fishing: 0, enchanting: 0, taming: 0, social: 0 },
      collections: {}, collectionTier: {},
      slayerBest: {}, dungeonBest: {},
      dailySold: {}, dailySoldDate: todayStr(),
      easterEggs: [],
      // --- V2 필드 ---
      pets: {}, activePet: null, petXp: {},
      enchants: { weapon: {}, armor: {}, tool: {} },
      fairySouls: [],
      bank: 0, lastInterestDay: null,
      minionSlotsBought: 0, minionFuelUntil: 0,
      dealsBought: {}, dealsDate: null,
      // --- V3 필드 ---
      starForce: { weapon: 0, bow: 0, helmet: 0, chest: 0, leggings: 0, boots: 0 },   // V11: 6슬롯 개별 스타포스
      itemRolls: {},                         // 장비 초기 능력치 롤({key: 굴려진 수치}) — 획득 시 ±8% 무작위 고정
      reforgeSlots: { weapon: null, bow: null, helmet: null, chest: null, leggings: null, boots: null },   // V11: 6슬롯 개별 리포지
      homeEdits: {},                         // 프라이빗 섬 블록 편집("x,y,z" -> blockId, 0=제거)
      // --- V11 필드 ---
      hpb: {},                               // 핫 포테이토 북({itemKey: 권수, 최대 10/퓨밍 15})
      equipPin: {},                          // 슬롯별 수동 장착 고정({slot: itemKey}) — 없으면 자동 최적
      locked: {},                            // 장비 잠금(판매/분해 방지)
      equipLog: {},                          // 장비 도감(획득 이력)
      stats: {},                             // 통계 카운터(kills/maxHit/goldEarned/...)
      ach: {},                               // 달성한 업적
      daily: null,                           // 일일 퀘스트({date, list})
      fieldDiff: 'normal',                   // 필드 난이도(easy/normal/heroic/hell)
      arenaBest: {},                         // 아레나 난이도별 최고 웨이브
      // --- V12 필드 ---
      hotbar: [null, null, null, null, null, null, null, null, null],   // 핫바 1~9.
      // --- V13-B 필드 ---
      quests: { active: {}, done: {}, seen: {} },   // 위치기반 퀘스트({active:{key:{base}}, done:{key:1}, seen:{key:1}})
      // --- V20-F 필드 ---
      ahListings: [],                        // 경매장 내 등록 매물([{id,key,qty,kind,price,bid,bidder,endsAt,settled,sold,rolls,ench,hpb,star}])
      ahSeq: 0,                              // 매물 고유 id 시퀀스
      // --- V20-G 필드 ---
      hotm: { tier: 1, mithril: 0, gemstone: 0, nodes: {} },   // 산의 심장(채광 퍼크 트리)
      // --- V20-I 필드 ---
      selectedPower: 'none',                 // 전능의 힘(Accessory Power)
    };
  }
  // 구버전 세이브 마이그레이션: 누락 필드를 기본값으로 채움(중첩 객체 포함)
  function migrate(p) {
    // V6 대개편: 세계·밸런스 전면 리셋 — 구버전 세이브는 새 시작(요청 사항)
    if (!p || p.ver !== 6) return freshPlayer();
    // 구버전 상시 직업 → 던전 클래스 이전(기본값 채우기 전에 선행 — 기본값이 덮어쓰지 않도록)
    if (p.class !== undefined) {
      const clsMap = { warrior: 'berserk', mage: 'mage', archer: 'archer', rogue: 'berserk' };
      if (p.dungeonClass === undefined) p.dungeonClass = clsMap[p.class] || 'berserk';
      delete p.class;
    }
    const fresh = freshPlayer();
    for (const k in fresh) if (p[k] === undefined) p[k] = fresh[k];
    for (const k in fresh.skillsXp) if (p.skillsXp[k] === undefined) p.skillsXp[k] = 0;
    if (!p.enchants.weapon) p.enchants.weapon = {};
    if (!p.enchants.armor) p.enchants.armor = {};
    if (!p.enchants.tool) p.enchants.tool = {};
    if (typeof p.starForce.weapon !== 'number') p.starForce = { weapon: 0, bow: 0, helmet: 0, chest: 0, leggings: 0, boots: 0 };
    if (!p.itemRolls || typeof p.itemRolls !== 'object') p.itemRolls = {};
    if (!p.reforgeSlots || (!p.reforgeSlots.weapon && p.reforgeSlots.weapon !== null)) p.reforgeSlots = { weapon: null, bow: null, helmet: null, chest: null, leggings: null, boots: null };
    // V11: 구 2슬롯(weapon/armor) 세이브 → 6슬롯. 구 armor 값은 흉갑으로 이전
    for (const sl of ['bow', 'helmet', 'chest', 'leggings', 'boots']) {
      if (typeof p.starForce[sl] !== 'number') p.starForce[sl] = sl === 'chest' && typeof p.starForce.armor === 'number' ? p.starForce.armor : 0;
      if (p.reforgeSlots[sl] === undefined) p.reforgeSlots[sl] = sl === 'chest' && p.reforgeSlots.armor !== undefined ? p.reforgeSlots.armor : null;
    }
    delete p.starForce.armor; delete p.reforgeSlots.armor;
    for (const k of ['hpb', 'equipPin', 'locked', 'equipLog', 'stats', 'ach', 'arenaBest']) if (!p[k] || typeof p[k] !== 'object') p[k] = {};
    if (p.daily === undefined) p.daily = null;
    if (!p.fieldDiff) p.fieldDiff = 'normal';
    if (!Array.isArray(p.hotbar)) p.hotbar = [];
    p.hotbar = p.hotbar.slice(0, 9);
    while (p.hotbar.length < 9) p.hotbar.push(null);
    if (!p.quests || typeof p.quests !== 'object') p.quests = { active: {}, done: {}, seen: {} };   // V13-B
    if (!p.quests.active) p.quests.active = {}; if (!p.quests.done) p.quests.done = {}; if (!p.quests.seen) p.quests.seen = {};
    if (!Array.isArray(p.ahListings)) p.ahListings = [];   // V20-F 경매장
    if (typeof p.ahSeq !== 'number') p.ahSeq = 0;
    if (!p.hotm || typeof p.hotm !== 'object') p.hotm = { tier: 1, mithril: 0, gemstone: 0, nodes: {} };   // V20-G 산의 심장
    if (typeof p.hotm.mithril !== 'number') p.hotm.mithril = 0;
    if (typeof p.hotm.gemstone !== 'number') p.hotm.gemstone = 0;
    if (typeof p.hotm.tier !== 'number') p.hotm.tier = 1;
    if (!p.hotm.nodes || typeof p.hotm.nodes !== 'object') p.hotm.nodes = {};
    if (typeof p.selectedPower !== 'string') p.selectedPower = 'none';   // V20-I 전능의 힘
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
  function stat(k, n) { if (!P) return; if (!P.stats) P.stats = {}; P.stats[k] = (P.stats[k] || 0) + (n == null ? 1 : n); }
  function statMax(k, v) { if (!P) return; if (!P.stats) P.stats = {}; if (v > (P.stats[k] || 0)) P.stats[k] = v; }
  function addItem(k, n) {
    if (n <= 0) return;
    P.inv[k] = (P.inv[k] || 0) + n; rollItemStat(k); bumpInv();
    const sd = shopDef(k);
    if (sd && (sd.category === '무기' || sd.category === '방어구') && !(P.equipLog || {})[k]) {
      if (!P.equipLog) P.equipLog = {};
      P.equipLog[k] = 1;
      // V11: 전설+ 신규 장비 획득은 전서버 알림
      const ti = D().ITEM_TIERS.findIndex(t => t.key === sd.tierKey);
      if (ti >= 4 && window.econNet && window.econNet.announce) window.econNet.announce(`✨ ${sd.name} 획득!`);
    }
  }
  // 장비(무기/방어구) 최초 획득 시 기본 수치를 ±8% 범위에서 1회 굴려 고정(인챈트/리포지/강화와 별개의 "생 초기치")
  function equipBase(k) {
    const w = D().EQUIPMENT.weapons.find(x => x.key === k); if (w) return { stat: 'dmg', base: w.dmg };
    const a = D().EQUIPMENT.armor.find(x => x.key === k); if (a) return { stat: 'defense', base: a.defense };
    return null;
  }
  function rollItemStat(k) {
    if (P.itemRolls[k] !== undefined) return;
    const eq = equipBase(k); if (!eq) return;
    const pct = D().ITEM_ROLL.pct;
    P.itemRolls[k] = Math.max(1, Math.round(eq.base * (1 - pct + Math.random() * pct * 2)));
  }
  function rolledStat(k, base) { return P.itemRolls[k] !== undefined ? P.itemRolls[k] : base; }
  function rollRangeText(base) { const pct = D().ITEM_ROLL.pct; return `${Math.max(1, Math.round(base * (1 - pct)))}~${Math.round(base * (1 + pct))}`; }
  function hasItem(k, n) { return (P.inv[k] || 0) >= (n || 1); }
  function removeItem(k, n) { n = n || 1; if (!hasItem(k, n)) return false; P.inv[k] -= n; if (P.inv[k] <= 0) delete P.inv[k]; bumpInv(); return true; }
  function addGold(n) { P.gold = Math.max(0, P.gold + n); if (n > 0) stat('goldEarned', n); }

  /* ---------------- 스킬 레벨 ---------------- */
  function skillDef(key) { return D().SKILLS.find(s => s.key === key); }
  function skillMaxLevel(key) { const m = D().SKILL_MAX_BY; return (m && m[key]) || D().SKILL_MAX_LEVEL; }   // V16: 스킬별 상한(전투60/낚시50 등)
  function skillLevel(key) {
    const def = skillDef(key); if (!def) return 0;
    const T = D().SKILL_XP_TABLE, MAX = skillMaxLevel(key);
    let xp = P.skillsXp[key] || 0, lvl = 0;
    while (lvl < MAX) { const req = T[lvl]; if (xp < req) break; xp -= req; lvl++; }
    return lvl;
  }
  function skillXpProgress(key) {   // {cur, need} — 현재 레벨 내 진행도(UI 표시용)
    const T = D().SKILL_XP_TABLE, MAX = skillMaxLevel(key);
    let xp = P.skillsXp[key] || 0, lvl = 0;
    while (lvl < MAX && xp >= T[lvl]) { xp -= T[lvl]; lvl++; }
    return { cur: Math.floor(xp), need: lvl >= MAX ? 0 : T[lvl] };
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
    const out = { str: 0, def: 0, hp: 0, intelligence: 0, critDamage: 0, magicFind: 0, miningFortune: 0 };
    if (!P.activePet || !P.pets[P.activePet]) return out;
    const pd = petDef(P.activePet); if (!pd) return out;
    const lvl = petLevel(P.activePet);
    let mul = 1;
    // V20-C: 펫 아이템(활성 펫 1개) — mul(기본 능력치 배율) + 고정 스탯
    const itKey = (P.petItems || {})[P.activePet];
    const pit = itKey && (D().PET_ITEMS || []).find(x => x.key === itKey);
    if (pit) { if (pit.mul) mul = pit.mul; if (pit.stat) for (const k in pit.stat) out[k] = (out[k] || 0) + pit.stat[k]; }
    out.str += (pd.perLvl.str || 0) * lvl * mul; out.def += (pd.perLvl.def || 0) * lvl * mul; out.hp += (pd.perLvl.hp || 0) * lvl * mul;
    // V20-C: 펫 시그니처 능력(레벨 마일스톤 해금)
    const abs = (D().PET_ABILITIES || {})[P.activePet];
    if (abs) for (const ab of abs) if (lvl >= ab.lv) for (const k in ab.stat) out[k] = (out[k] || 0) + ab.stat[k];
    for (const k in out) out[k] = Math.round(out[k]);
    return out;
  }
  // V20-C: 활성 펫에 아이템 장착
  function equipPetItem(itemKey) {
    if (!P.activePet) { toastFn('먼저 펫을 활성화하세요', false); return false; }
    if (!hasItem(itemKey)) { toastFn('펫 아이템이 없어요', false); return false; }
    if (!(D().PET_ITEMS || []).some(x => x.key === itemKey)) { toastFn('펫 아이템이 아니에요', false); return false; }
    if (!P.petItems) P.petItems = {};
    const prev = P.petItems[P.activePet];
    if (prev) addItem(prev, 1);   // 기존 아이템 반환
    removeItem(itemKey, 1); P.petItems[P.activePet] = itemKey;
    toastFn('🐾 펫 아이템 장착!', true); saveNow(); renderZone(); return true;
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
  // V20-I: 전능의 힘 — 선택한 힘이 마력에 비례해 스탯 부여(mpScale = MP^scaleExp)
  function selectedPowerDef() { const MP = D().MAGICAL_POWER; return (MP.powers || []).find(p => p.key === (P.selectedPower || 'none')) || MP.powers[0]; }
  function mpScale() { const mp = magicalPower(); return mp > 0 ? Math.pow(mp, D().MAGICAL_POWER.scaleExp) : 0; }
  function powerStats() {
    const out = { str: 0, def: 0, hp: 0, intelligence: 0, critChance: 0, critDamage: 0 };
    const pw = selectedPowerDef(); if (!pw || !pw.per) return out;
    const scale = mpScale();
    for (const k in pw.per) out[k] = (out[k] || 0) + pw.per[k] * scale;
    for (const k in out) out[k] = Math.round(out[k]);
    return out;
  }
  function selectPower(key) {
    const ok = (D().MAGICAL_POWER.powers || []).some(p => p.key === key);
    if (!ok) return;
    P.selectedPower = key;
    const pw = selectedPowerDef();
    toastFn(`✨ 전능의 힘: ${pw.name} 선택!`, true);
    saveNow(); renderZone();
  }
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

  /* ---------------- 인챈트(북 부여 + 혼돈의 마법부여로 상한 돌파) ---------------- */
  function enchantDef(key) { return D().ENCHANTS.find(e => e.key === key); }
  function enchantLvl(slot, key) { return (P.enchants[slot] && P.enchants[slot][key]) || 0; }
  function enchantHardCap(def) { return def.maxLvl + D().CHAOS_ENCHANT.overcapLevels; }
  // 북 등급(가격대)별 기본 요구 마법부여 레벨
  function enchantReqLevel(def) { return def.bookBasePrice >= 2000 ? 9 : def.bookBasePrice >= 1400 ? 6 : def.bookBasePrice >= 900 ? 3 : 0; }
  // ── 범용 인챈트 효과 엔진: 32종 인챈트의 fx 서술자를 종류별로 합산 ──
  function enchSum(fxKey) {
    let s = 0;
    for (const def of D().ENCHANTS) {
      const v = def.fx && def.fx[fxKey]; if (!v) continue;
      const lv = enchantLvl(def.target, def.key); if (lv) s += v * lv;
    }
    return s;
  }
  function enchVsSum(slayerKey) {
    let s = 0;
    for (const def of D().ENCHANTS) {
      if (!def.fx || def.fx.dmgVs !== slayerKey) continue;
      const lv = enchantLvl(def.target, def.key); if (lv) s += (def.fx.v || 0) * lv;
    }
    return s;
  }
  // 조건부 전투 배율 — ctx: { hitIdx, targetHp, targetMaxHp, slayerKey, isBoss }
  function enchCondMul(ctx) {
    let pct = 0;
    if (ctx.hitIdx === 0) pct += enchSum('first');
    if (ctx.hitIdx < 3) pct += enchSum('firstThree');
    if ((ctx.hitIdx + 1) % 3 === 0) pct += enchSum('third');
    if (ctx.targetMaxHp >= 100000) pct += enchSum('dmgBig');
    if (ctx.targetHp < ctx.targetMaxHp * 0.5) pct += enchSum('dmgLow');
    else pct += enchSum('dmgHigh');
    if (ctx.slayerKey) pct += enchVsSum(ctx.slayerKey);
    if (ctx.isBoss) pct += enchSum('dmgBoss');
    return 1 + pct / 100;
  }
  function enchHitHeal(dmg) { return dmg * enchSum('lifesteal') / 100 + enchSum('healHit'); }
  function enchThornsPct() { return enchSum('thorns') / 100; }
  function enchCoinMul() { return 1 + enchSum('coin') / 100; }
  function enchXpMul() { return 1 + enchSum('xp') / 100; }
  function applyEnchant(key) {
    const def = enchantDef(key); if (!def) return false;
    const slot = def.target;
    const cur = enchantLvl(slot, key);
    if (cur >= def.maxLvl) { toastFn('북으로는 여기까지! 혼돈의 마법부여로 돌파하세요', false); return false; }
    const bookKey = `enchant_book_${key}`;
    if (!hasItem(bookKey)) { toastFn('인챈트북이 필요해요 — 북은 몬스터가 떨어뜨려요(몹마다 다른 북!)', false); return false; }
    const reqE = enchantReqLevel(def) + cur;   // 높은 레벨 합성일수록 높은 마법부여 스킬 요구
    if (skillLevel('enchanting') < reqE) { toastFn(`마법부여 스킬 ${reqE}레벨 필요 (현재 ${skillLevel('enchanting')})`, false); return false; }
    const fee = def.bookBasePrice * cur;   // 합성 비용: 레벨이 오를수록 증가(첫 레벨은 무료)
    if (P.gold < fee) { toastFn(`부여 비용 ${fmtGold(fee)}이 부족해요`, false); return false; }
    removeItem(bookKey, 1); addGold(-fee);
    P.enchants[slot][key] = cur + 1;
    stat('enchantsApplied');
    addSkillXp('enchanting', 30 + cur * 20);
    toastFn(`${def.name} ${cur + 1}레벨 부여 완료!`, true);
    saveNow(); renderZone(); return true;
  }
  // 혼돈의 마법부여: 북 상한을 넘어 +5레벨까지. 골드+북 소모, 확률 성공, 실패 시 레벨 하락 위험(노가다·운빨)
  function chaosCost(def, cur) { const C = D().CHAOS_ENCHANT; return def.bookBasePrice * C.costMulPerOver * (cur - def.maxLvl + 1); }
  function chaosRate(def, cur) { const C = D().CHAOS_ENCHANT; return Math.max(C.successMin, C.successBase - (cur - def.maxLvl) * C.successDropPerOver); }
  function chaosEnchant(key) {
    const def = enchantDef(key); if (!def) return false;
    const C = D().CHAOS_ENCHANT;
    const slot = def.target;
    const cur = enchantLvl(slot, key);
    if (cur < def.maxLvl) { toastFn('먼저 북으로 상한까지 부여하세요', false); return false; }
    if (cur >= enchantHardCap(def)) { toastFn('혼돈으로도 더는 올릴 수 없어요', false); return false; }
    const bookKey = `enchant_book_${key}`;
    if (!hasItem(bookKey)) { toastFn('혼돈 부여에도 인챈트북 1권이 필요해요', false); return false; }
    const fee = chaosCost(def, cur);
    if (P.gold < fee) { toastFn(`혼돈 비용 ${fmtGold(fee)}이 부족해요`, false); return false; }
    removeItem(bookKey, 1); addGold(-fee);
    addSkillXp('enchanting', 60);
    if (Math.random() < chaosRate(def, cur)) {
      P.enchants[slot][key] = cur + 1;
      toastFn(`🌀 혼돈의 마법부여 성공!! ${def.name} ${cur + 1}레벨`, true);
    } else if (Math.random() < C.failDowngradeChance && cur > def.maxLvl) {
      P.enchants[slot][key] = cur - 1;
      toastFn(`💀 혼돈이 폭주했다... ${def.name} 레벨 하락 (${cur - 1})`, false);
    } else {
      toastFn('혼돈의 마법부여 실패... 재료만 소모됐어요', false);
    }
    saveNow(); renderZone(); return true;
  }

  /* ---------------- 전투력(장비+펫+부적+인챈트+스타포스+리포지+스킬 통합) ---------------- */
  function dungeonClassDef(key) { return D().DUNGEON_CLASSES.find(c => c.key === key) || D().DUNGEON_CLASSES[0]; }
  function bestOwnedEquip(list) { for (let i = list.length - 1; i >= 0; i--) if (hasItem(list[i].key)) return list[i]; return null; }
  /* ======== V11: 6슬롯 장착(무기/활/투구/흉갑/레깅스/부츠) — 자동 최적 + 수동 고정(핀) ======== */
  const EQUIP_SLOTS = ['weapon', 'bow', 'helmet', 'chest', 'leggings', 'boots'];
  const SLOT_NAMES = { weapon: '무기', bow: '활', helmet: '투구', chest: '흉갑', leggings: '레깅스', boots: '부츠' };
  const SLOT_EMOJI = { weapon: '⚔️', bow: '🏹', helmet: '🪖', chest: '🛡', leggings: '👖', boots: '🥾' };
  let _invRev = 0, _equipCache = null, _equipCacheKey = '';
  function bumpInv() { _invRev++; }
  function equipListFor(slot) {
    const E = D().EQUIPMENT;
    if (slot === 'weapon') return E.weapons;   // wclass sword/staff — 아래 필터에서 bow 제외
    if (slot === 'bow') return E.weapons;
    return E.armor;
  }
  function pieceScore(it) { return it.dmg != null ? it.dmg : (it.defense || 0) * 2 + (it.hp || 0) * 0.5; }
  let _equipCacheAt = 0;
  function equippedPiece(slot) {
    const key = _invRev + ':' + Object.keys(P.inv).length + ':' + skillLevel('combat') + ':' + JSON.stringify(P.equipPin || {});   // 키 수 = 직접 변조 감지
    const now = Date.now();
    // 캐시는 500ms TTL — 클라우드 로드/직접 인벤 변조처럼 bumpInv를 우회하는 경로도 안전
    if (!_equipCache || _equipCacheKey !== key || now - _equipCacheAt > 500) { _equipCache = {}; _equipCacheKey = key; _equipCacheAt = now; }
    if (slot in _equipCache) return _equipCache[slot];
    const cl = skillLevel('combat');
    let best = null, bestScore = -1;
    const pin = (P.equipPin || {})[slot];
    for (const it of equipListFor(slot)) {
      const isBow = it.wclass === 'bow';
      if (slot === 'weapon' && isBow) continue;
      if (slot === 'bow' && !isBow) continue;
      if (slot !== 'weapon' && slot !== 'bow' && (it.slot || 'chest') !== slot) continue;
      if (!hasItem(it.key)) continue;
      if ((it.reqCombat || 0) > cl) continue;
      if (pin && it.key === pin) { best = it; break; }   // 핀 우선(보유+착용 가능 시)
      if (!pin && pieceScore(it) >= bestScore) { bestScore = pieceScore(it); best = it; }
    }
    if (pin && (!best || best.key !== pin)) {   // 핀 아이템 미보유/미달 → 자동 최적으로 폴백
      best = null; bestScore = -1;
      for (const it of equipListFor(slot)) {
        const isBow = it.wclass === 'bow';
        if (slot === 'weapon' && isBow) continue;
        if (slot === 'bow' && !isBow) continue;
        if (slot !== 'weapon' && slot !== 'bow' && (it.slot || 'chest') !== slot) continue;
        if (!hasItem(it.key) || (it.reqCombat || 0) > cl) continue;
        if (pieceScore(it) >= bestScore) { bestScore = pieceScore(it); best = it; }
      }
    }
    return (_equipCache[slot] = best);
  }
  function equippedWeapon() { return equippedPiece('weapon'); }
  function equippedBow() { return equippedPiece('bow'); }
  function equippedArmor() { return equippedPiece('chest'); }   // 레거시 호환(흉갑)
  function armorPieces() { return ['helmet', 'chest', 'leggings', 'boots'].map(equippedPiece).filter(Boolean); }
  function equippedAll() { return EQUIP_SLOTS.map(equippedPiece).filter(Boolean); }
  function hpbOf(key) { return (P.hpb || {})[key] || 0; }
  function equippedWeaponDmg() {
    const w = equippedWeapon(); if (!w) return 0;
    let d = (rolledStat(w.key, w.dmg) + (P.reforgeBonus[w.key] || 0) + hpbOf(w.key) * D().HPB.weaponDmgPerBook) * recombMul(w.key);   // V20: 리컴 +18%
    const b = equippedBow();
    if (b) d += Math.round((rolledStat(b.key, b.dmg) + hpbOf(b.key) * D().HPB.weaponDmgPerBook) * recombMul(b.key) * 0.3);   // 활 보조 기여 30%
    return d;
  }
  // V17: 무기 부가 스탯(힘/치명피해/광포/지력) — 주무기 기준 + 활 보조 30%
  function weaponStat(k) {
    const w = equippedWeapon(); let v = w ? (w[k] || 0) : 0;
    const b = equippedBow(); if (b && b[k]) v += Math.round(b[k] * 0.3);
    return v;
  }
  /* ---- V11 특성(트레잇) 엔진: 정적 합산 + 세트 보너스 ---- */
  const SET_TRAIT_MAP = { minerPct: 'miner', anglerPct: 'angler', gathererPct: 'gatherer', lifestealPct: 'lifesteal', regenFlat: 'regeneration' };
  function activeSetBonuses() {
    const cnt = {};
    for (const sl of ['helmet', 'chest', 'leggings', 'boots']) { const p = equippedPiece(sl); if (p && p.set) cnt[p.set] = (cnt[p.set] || 0) + 1; }
    const out = [];
    for (const k in cnt) if (cnt[k] >= 4 && D().EQUIP_SETS[k]) out.push({ key: k, def: D().EQUIP_SETS[k] });
    return out;
  }
  function traitSum(k) {
    let v = 0;
    for (const it of equippedAll()) if (it.traits) for (const t of it.traits) if (t.k === k) v += t.v;
    for (const sb of activeSetBonuses()) {
      const bo = sb.def.bonus;
      for (const bk in bo) { if (bk === k) v += bo[bk]; else if (SET_TRAIT_MAP[bk] === k) v += bo[bk]; }
    }
    return v;
  }
  function setStat(k) { let v = 0; for (const sb of activeSetBonuses()) v += sb.def.bonus[k] || 0; return v; }
  // 문맥 특성 배율(공격 시): ctx {hitIdx, hp, maxHp, isBoss, mobType, phpPct, golds}
  const VS_MAP = { zombie_slayer: 'vs_undead', spider_slayer: 'vs_arachnid', wolf_slayer: 'vs_beast', enderman_slayer: 'vs_ender', blaze_slayer: 'vs_demon' };
  function traitCtxMul(ctx) {
    let pct = 0;
    if (ctx.maxHp > 0 && ctx.hp / ctx.maxHp <= 0.3) pct += traitSum('execute');
    if ((ctx.hitIdx || 0) < 2) pct += traitSum('first_strike');
    const combo = traitSum('combo'); if (combo) pct += Math.min(5, ctx.hitIdx || 0) * combo;
    if (ctx.isBoss) pct += traitSum('giant_slayer');
    if (ctx.phpPct != null && ctx.phpPct <= 0.4) pct += traitSum('rage');
    if (ctx.phpPct != null && ctx.phpPct >= 0.9) pct += traitSum('focus');
    const fam = ctx.mobType ? SLAYER_MOB_MAP[ctx.mobType] : null;
    if (fam && VS_MAP[fam]) pct += traitSum(VS_MAP[fam]);
    const midas = traitSum('midas'); if (midas) pct += Math.min(5, Math.floor((P.gold || 0) / 100000)) * midas;
    return 1 + pct / 100;
  }
  function guardPct() { return Math.min(60, traitSum('guard')) / 100; }
  function reforgeOf(slot) { return P.reforgeSlots[slot] || {}; }
  // V20: 젬스톤 — 착용 장비 소켓에 박힌 보석 합산
  function gemSlotsOf(item) { return item ? (D().GEM_SLOTS_BY_TIER[item.tierKey] || 0) : 0; }
  function gemStats() {
    const out = {};
    const items = [equippedWeapon(), equippedBow()].concat(ARMOR_SLOTS.map(equippedPiece)).filter(Boolean);
    for (const it of items) {
      const gems = (P.gems || {})[it.key]; if (!gems) continue;
      gems.slice(0, gemSlotsOf(it)).forEach(g => {
        const gt = D().GEM_TYPES.find(x => x.key === g.t), gq = D().GEM_QUALITY.find(x => x.key === g.q);
        if (!gt || !gq) return;
        out[gt.stat] = (out[gt.stat] || 0) + (D().GEM_BASE[gt.stat] || 0) * gq.mul;
      });
    }
    return out;
  }
  // V20: 리컴보뷸레이터 — 적용된 아이템 주스탯 +18%
  function recombMul(itemKey) { return (P.recomb || {})[itemKey] ? (1 + D().RECOMB.statBoostPct / 100) : 1; }
  function equipItemDef(itemKey) { return D().EQUIPMENT.weapons.find(x => x.key === itemKey) || D().EQUIPMENT.armor.find(x => x.key === itemKey); }
  function socketGem(itemKey, gemType, quality) {
    const it = equipItemDef(itemKey); if (!it) { toastFn('장비가 아니에요', false); return false; }
    const slots = D().GEM_SLOTS_BY_TIER[it.tierKey] || 0;
    if (slots <= 0) { toastFn('이 등급은 젬 소켓이 없어요(레어+부터)', false); return false; }
    const gemKey = `gem_${gemType}_${quality}`;
    if (!hasItem(gemKey)) { toastFn('해당 품질의 젬이 없어요', false); return false; }
    if (!P.gems) P.gems = {};
    const cur = P.gems[itemKey] || [];
    if (cur.length >= slots) { toastFn(`소켓이 가득 찼어요 (${slots}개)`, false); return false; }
    removeItem(gemKey, 1); cur.push({ t: gemType, q: quality }); P.gems[itemKey] = cur;
    toastFn('💎 젬 장착 완료!', true); saveNow(); renderZone(); return true;
  }
  function applyRecomb(itemKey) {
    if (!P.recomb) P.recomb = {};
    if (P.recomb[itemKey]) { toastFn('이미 리컴이 적용된 장비예요', false); return false; }
    if (!hasItem('recombobulator')) { toastFn('리컴보뷸레이터 3000이 필요해요(던전/슬레이어 드롭)', false); return false; }
    removeItem('recombobulator', 1); P.recomb[itemKey] = true;
    toastFn('✨ 리컴보뷸레이터 적용! 등급 상승 — 수치 +18%', true); saveNow(); renderZone(); return true;
  }
  // ── 실제 스카이블럭 스탯 시트: 기본 HP100/방어0/힘0/속도100/크리확률30/크리피해50/지능100 ──
  function playerStats() {
    const B = D().BASE_STATS, HB = D().HPB;
    const ts = talismanStats(), ps = petStats(), fb = fairyBonus();
    // V11: 4부위 방어구 합산(초기롤 + 핫포북 + 아이템 HP)
    let armorDef = 0, armorHp = 0, armorRfDef = 0, armorRfHp = 0, armorRfStr = 0, armorRfCd = 0, armorRfFero = 0;
    for (const sl of ARMOR_SLOTS) {
      const p = equippedPiece(sl);
      if (p) { const rm = recombMul(p.key); armorDef += (rolledStat(p.key, p.defense) + hpbOf(p.key) * HB.armorDefPerBook) * rm; armorHp += ((p.hp || 0) + hpbOf(p.key) * HB.armorHpPerBook) * rm; }
      const rf = reforgeOf(sl); armorRfDef += rf.def || 0; armorRfHp += rf.hp || 0; armorRfStr += rf.str || 0; armorRfCd += rf.critDamage || 0; armorRfFero += rf.ferocity || 0;
    }
    const rw = reforgeOf('weapon');
    const B2 = D().BASE_STATS2, gs = gemStats(), pw = powerStats();   // V20-I: 전능의 힘
    const st = {
      hp: B.hp + skillLevel('farming') * 2 + skillLevel('fishing') + enchSum('hp') + ts.hp + ps.hp + fb.hp
        + (rw.hp || 0) + armorRfHp + starHpFlat() + buffBonus('hp')
        + armorHp + traitSum('vitality') + setStat('hp') + weaponStat('hp') + (gs.hp || 0) + pw.hp,
      defense: B.defense + skillLevel('mining') + ts.def + ps.def + enchSum('def')
        + armorRfDef + starDefFlat() + armorDef + traitSum('bulwark') + setStat('def') + weaponStat('defense') + (gs.defense || 0) + pw.def,
      strength: B.strength + skillLevel('foraging') + ts.str + ps.str + fb.str + buffBonus('strength') + setStat('str')
        + weaponStat('str') + (rw.str || 0) + armorRfStr + (gs.str || 0) + pw.str,
      speed: B.speed + enchSum('speed') + buffBonus('speed') + traitSum('swift') + traitSum('swiftness') + setStat('speed'),
      critChance: Math.min(100, B.critChance + skillLevel('combat') * 0.5 + traitSum('crit_eye') + setStat('critChance') + weaponStat('critChance') + (gs.critChance || 0) + pw.critChance),
      critDamage: B.critDamage + skillLevel('combat') + traitSum('brutality') + setStat('critDamage') + weaponStat('critDamage') + (rw.critDamage || 0) + armorRfCd + (gs.critDamage || 0) + (ps.critDamage || 0) + pw.critDamage,
      // V17: 광포(추가타) — 무기/리포지/특성/세트. 실제: floor(광포/100) 확정 추가타 + 나머지% 확률(기댓값 1+광포/100배)
      ferocity: weaponStat('ferocity') + (rw.ferocity || 0) + armorRfFero + traitSum('ferocity') + setStat('ferocity'),
      intelligence: B.intelligence + skillLevel('enchanting') * 4 + traitSum('mana_well') + setStat('intelligence') + weaponStat('intelligence') + Math.round(magicalPower() * 0.6) + (gs.intelligence || 0) + (ps.intelligence || 0) + pw.intelligence,
      // V20: 신규 스탯 — 매직파인드/포춘/공격속도
      magicFind: B2.magicFind + setStat('magicFind') + traitSum('lucky') + Math.floor(skillLevel('combat') / 5) + (ps.magicFind || 0),
      miningFortune: B2.miningFortune + skillLevel('mining') * 4 + (gs.miningFortune || 0) + setStat('miningFortune') + (ps.miningFortune || 0) + hotmMiningFortune(),   // V20-G HotM
      miningSpeed: (B2.miningSpeed || 0) + hotmMiningSpeed(),   // V20-G HotM 채광 속도
      farmingFortune: B2.farmingFortune + skillLevel('farming') * 4 + (gs.farmingFortune || 0) + setStat('farmingFortune'),
      foragingFortune: B2.foragingFortune + skillLevel('foraging') * 4 + setStat('foragingFortune'),
      attackSpeed: B2.attackSpeed + setStat('attackSpeed') + traitSum('swiftness'),
    };
    st.defense = Math.round(st.defense * mpStatMul());
    st.hp = Math.round(st.hp);
    return st;
  }
  function playerStr() { return playerStats().strength; }
  // V17 실제 하이픽셀 공식: 피해 = (5 + 무기공격) × (1 + 힘/100) × 가산배수 × (1 + 광포/100) × 어빌리티 × 마력
  //   (힘은 배수로만 기여 — 0.11.5에서 '힘의 20% 플랫뎀' 삭제됨. 크리티컬은 타격마다 별도 굴림)
  function playerAttackPower() {
    const st = playerStats();
    const flat = 5 + equippedWeaponDmg();
    const additive = 1 + skillLevel('combat') * 0.04 + enchSum('dmg') / 100 + bestiaryBonusPct() / 100
      + (reforgeOf('weapon').dmgPct || 0) / 100 + (reforgeOf('bow').dmgPct || 0) * 0.3 / 100
      + starAtkPct() / 100 + setStat('dmgPct') / 100;
    const w = equippedWeapon();
    const feroMul = 1 + st.ferocity / 100;
    const melee = flat * (1 + st.strength / 100) * additive * feroMul * mpStatMul();
    // V19-D 밸런스: 아키타입별 어빌리티 데미지 — 캐스터=지력, 근접/원거리 버서크=힘 게이트.
    //   ability = 기본어빌리티 × max(0, 주스탯/100 − 1) × 스케일 × 가산 × 광포 × 마력
    //   주스탯 100 이하면 0(초반 무보정) → 오직 엔드게임(고스탯)에서만 수백만 딜. 세 계열 모두 각자 스탯으로 수렴.
    if (w && w.abilityDmg) {
      const primary = (w.abilityStat === 'str') ? st.strength : st.intelligence;
      const factor = Math.max(0, primary / 100 - 1);
      const ability = w.abilityDmg * recombMul(w.key) * factor * (w.abilityScaling || 0.6) * additive * feroMul * mpStatMul();   // V20: 리컴 +18%
      return Math.max(melee, ability);
    }
    return melee;
  }
  // V19-B: 현재 무기가 캐스터 어빌리티로 딜하는지(HUD 표기용)
  function isAbilityWeapon() { const w = equippedWeapon(); return !!(w && w.caster && w.abilityDmg); }
  // 크리티컬 굴림: 확률 critChance%, 성공 시 ×(1 + critDamage/100)
  function playerCritRoll() {
    const st = playerStats();
    return Math.random() * 100 < st.critChance ? 1 + st.critDamage / 100 : 1;
  }
  // 실제 공식: 피해 감소 = 방어 / (방어 + 100)
  function playerDefensePct(lowHp) {
    let def = playerStats().defense;
    if (lowHp) def += enchSum('lastStand');   // 최후의 저항: 내 HP 30% 이하일 때만
    return Math.min(0.9, def / (def + 100));
  }
  function playerMaxHp() { return playerStats().hp; }

  /* ---------------- 스타포스 V2(메이플식 체계): 성공/유지/하락/파괴 + 찬스타임 + 구간별 스탯 ---------------- */
  function starCost(slot) { const SF = D().STARFORCE; return Math.round(SF.costBase * Math.pow(SF.costMul, P.starForce[slot])); }
  function starRow(slot) { const SF = D().STARFORCE; return SF.table[Math.min(P.starForce[slot], SF.table.length - 1)]; }
  function starRate(slot) { return starRow(slot)[0]; }
  function starChanceTime(slot) { return D().STARFORCE.chanceTime && ((P.starChance || {})[slot] || 0) >= 2; }
  // 구간별 누적 스탯(1~5성/6~10성/11~15성 폭이 다름)
  function starBandSum(stars, bands) {
    let sum = 0;
    for (let i = 1; i <= stars; i++) sum += bands[i <= 5 ? 0 : i <= 10 ? 1 : i <= 15 ? 2 : 3];   // V20-B: 16~25 초월 밴드
    return sum;
  }
  function starAtkPct() {   // 무기 100% + 활 30%(보조)
    return starBandSum(P.starForce.weapon, D().STARFORCE.weaponAtkPctByBand)
      + Math.round(starBandSum(P.starForce.bow || 0, D().STARFORCE.weaponAtkPctByBand) * 0.3);
  }
  const ARMOR_SLOTS = ['helmet', 'chest', 'leggings', 'boots'];
  function starDefFlat() { return ARMOR_SLOTS.reduce((n, sl) => n + starBandSum(P.starForce[sl] || 0, D().STARFORCE.armorDefByBand), 0); }
  function starHpFlat() { return ARMOR_SLOTS.reduce((n, sl) => n + starBandSum(P.starForce[sl] || 0, D().STARFORCE.armorHpByBand), 0); }
  function enhanceStar(slot) {
    const SF = D().STARFORCE;
    if (!P.starChance) P.starChance = {};
    if (P.starChance[slot] === undefined) P.starChance[slot] = 0;
    const cur = P.starForce[slot];
    if (cur >= SF.maxStars) { toastFn(`이미 최대 성 강화예요 (★${SF.maxStars})`, false); return 'max'; }
    const cost = starCost(slot);
    if (P.gold < cost) { toastFn('골드가 부족해요', false); return 'poor'; }
    addGold(-cost);
    const chance = starChanceTime(slot);
    const row = starRow(slot);
    const r = Math.random();
    if (chance || r < row[0]) {   // 성공(찬스 타임이면 100%)
      P.starForce[slot] = cur + 1;
      P.starChance[slot] = 0;
      toastFn(`${chance ? '🌟 찬스 타임! ' : '✨ '}강화 성공! ${slot === 'weapon' ? '무기' : '방어구'} ★${cur + 1}`, true);
      saveNow(); renderZone(); return 'success';
    }
    if (r < row[0] + row[1]) {    // 유지
      P.starChance[slot] = 0;
      toastFn('강화 실패! 성은 유지됐어요', false);
      saveNow(); renderZone(); return 'keep';
    }
    if (r < row[0] + row[1] + row[2]) {   // 하락(2연속이면 다음이 찬스 타임)
      P.starForce[slot] = cur - 1;
      P.starChance[slot] = (P.starChance[slot] || 0) + 1;
      toastFn(`💥 강화 실패... 성이 하락했어요 (★${cur - 1})${starChanceTime(slot) ? ' — 🌟 다음 강화는 찬스 타임(100%)!' : ''}`, false);
      saveNow(); renderZone(); return 'drop';
    }
    // 파괴: 장비는 남고 리셋(메이플식). 초월 구간(16성+)은 20성으로, 그 외 12성으로
    P.starForce[slot] = Math.min(cur, cur >= 16 ? (SF.boomResetToHigh || SF.boomResetTo) : SF.boomResetTo);
    P.starChance[slot] = 0;
    toastFn(`💣 강화 파괴!! ★${P.starForce[slot]}(으)로 리셋됐어요...`, false);
    saveNow(); renderZone(); return 'boom';
  }

  /* ---------------- 제작(컬렉션 티어 해금 레시피) ---------------- */
  function recipeUnlocked(r) {
    if (!r.unlock) return true;   // 기본 조합법(해금 조건 없음) — null 크래시 버그 픽스
    if (r.unlock.resource && collectionTierIdx(r.unlock.resource) < r.unlock.tier) return false;
    if (r.unlock.skill && skillLevel(r.unlock.skill) < r.unlock.lv) return false;   // V8: 스킬 레벨 해금
    return true;
  }
  // V21-C: 재료 그룹(any_planks 등) — 그룹이면 구성원 합산 보유량으로 판정/소모(MC 나무 호환)
  function craftHave(k) {
    const g = (D().CRAFT_GROUPS || {})[k];
    if (!g) return P.inv[k] || 0;
    return g.reduce((s, m) => s + (P.inv[m] || 0), 0);
  }
  function craftConsume(k, n) {
    const g = (D().CRAFT_GROUPS || {})[k];
    if (!g) { removeItem(k, n); return; }
    let left = n;
    for (const m of g) { if (left <= 0) break; const take = Math.min(left, P.inv[m] || 0); if (take > 0) { removeItem(m, take); left -= take; } }
  }
  function canCraft(r) { return recipeUnlocked(r) && Object.keys(r.needs).every(k => craftHave(k) >= r.needs[k]); }
  function craft(key) {
    const r = D().RECIPES.find(x => x.key === key); if (!r) return false;
    const gridMatch = craftGridRecipe();
    if (gridMatch && gridMatch.key === key) return craftFromGrid();
    if (manualCraftCapable(r)) {
      craftSel = key;
      toastFn('제작대 3x3 칸에 재료를 실제 마인크래프트 모양대로 올려야 제작돼요.', false);
      renderZone();
      return false;
    }
    if (!recipeUnlocked(r)) { toastFn(r.unlock && r.unlock.skill ? `${r.unlock.skill === 'combat' ? '전투' : r.unlock.skill === 'enchanting' ? '마법부여' : '요구'} 스킬 ${r.unlock.lv}레벨 필요` : '컬렉션 티어가 부족해요', false); return false; }
    if (!canCraft(r)) { toastFn('재료가 부족해요', false); return false; }
    for (const k in r.needs) craftConsume(k, r.needs[k]);
    addItem(key, r.gives || 1);
    addSkillXp('enchanting', 10);
    stat('itemsCrafted');   // V13-B: 퀘스트 카운터
    toastFn(`제작 완료: ${itemName(key)}`, true);
    saveNow(); renderZone(); return true;
  }

  /* ---------------- 채집(광산/농장/숲/부둣가) ---------------- */
  const WOOD_PLANK_KEYS = ['oak_planks', 'birch_planks', 'spruce_planks', 'dark_oak_planks', 'jungle_planks', 'acacia_planks'];
  const WOOD_LOG_KEYS = ['oaklog', 'birchlog', 'sprucelog', 'dark_oak_log', 'jungle_log', 'acacia_log'];
  function isWoodPlank(k) { return WOOD_PLANK_KEYS.indexOf(k) >= 0; }
  function isWoodLog(k) { return WOOD_LOG_KEYS.indexOf(k) >= 0; }
  function recipeSumNeeds(r) { return Object.keys(r.needs || {}).reduce((a, k) => a + r.needs[k], 0); }
  function manualCraftCapable(r) { return !!r && recipeSumNeeds(r) <= 9; }
  function craftPattern(key) {
    const woodShape = key.match(/^(oak|birch|spruce|dark_oak|jungle|acacia)_(fence|trapdoor|door)$/);
    if (woodShape) {
      const p = woodShape[1] + '_planks';
      if (woodShape[2] === 'fence') return { rows: ['PSP', 'PSP'], spec: { P: p, S: 'stick' } };
      if (woodShape[2] === 'trapdoor') return { rows: ['PPP', 'PPP'], spec: { P: p } };
      if (woodShape[2] === 'door') return { rows: ['PP', 'PP', 'PP'], spec: { P: p } };
    }
    const shapedBlock = key.match(/^(.+)_(slab|stairs)$/);
    if (shapedBlock) {
      const mat = shapedBlock[1];
      if (shapedBlock[2] === 'slab') return { rows: ['MMM'], spec: { M: mat } };
      return { rows: ['M  ', 'MM ', 'MMM'], spec: { M: mat }, mirror: true };
    }
    switch (key) {
      case 'stick': return { rows: ['P', 'P'], spec: { P: 'planks' } };
      case 'crafting_table': return { rows: ['PP', 'PP'], spec: { P: 'planks' } };
      case 'chest': return { rows: ['PPP', 'P P', 'PPP'], spec: { P: 'planks' } };
      case 'furnace': return { rows: ['CCC', 'C C', 'CCC'], spec: { C: 'cobblestone' } };
      case 'torch': return { rows: ['C', 'S'], spec: { C: 'coal', S: 'stick' } };
      case 'wooden_pickaxe': return { rows: ['PPP', ' S ', ' S '], spec: { P: 'planks', S: 'stick' } };
      case 'wooden_axe': return { rows: ['PP', 'PS', ' S'], spec: { P: 'planks', S: 'stick' }, mirror: true };
      case 'wooden_hoe': return { rows: ['PP', ' S', ' S'], spec: { P: 'planks', S: 'stick' }, mirror: true };
      case 'wooden_sword': return { rows: ['P', 'P', 'S'], spec: { P: 'planks', S: 'stick' } };
      case 'stone_pickaxe': return { rows: ['CCC', ' S ', ' S '], spec: { C: 'cobblestone', S: 'stick' } };
      case 'stone_axe': return { rows: ['CC', 'CS', ' S'], spec: { C: 'cobblestone', S: 'stick' }, mirror: true };
      case 'stone_hoe': return { rows: ['CC', ' S', ' S'], spec: { C: 'cobblestone', S: 'stick' }, mirror: true };
      case 'stone_sword': return { rows: ['C', 'C', 'S'], spec: { C: 'cobblestone', S: 'stick' } };
      case 'iron_pickaxe': return { rows: ['III', ' S ', ' S '], spec: { I: 'iron', S: 'stick' } };
      case 'iron_axe': return { rows: ['II', 'IS', ' S'], spec: { I: 'iron', S: 'stick' }, mirror: true };
      case 'iron_hoe': return { rows: ['II', ' S', ' S'], spec: { I: 'iron', S: 'stick' }, mirror: true };
      case 'iron_sword': return { rows: ['I', 'I', 'S'], spec: { I: 'iron', S: 'stick' } };
      case 'golden_pickaxe': return { rows: ['GGG', ' S ', ' S '], spec: { G: 'gold', S: 'stick' } };
      case 'golden_axe': return { rows: ['GG', 'GS', ' S'], spec: { G: 'gold', S: 'stick' }, mirror: true };
      case 'golden_hoe': return { rows: ['GG', ' S', ' S'], spec: { G: 'gold', S: 'stick' }, mirror: true };
      case 'golden_sword': return { rows: ['G', 'G', 'S'], spec: { G: 'gold', S: 'stick' } };
      case 'diamond_pickaxe': return { rows: ['DDD', ' S ', ' S '], spec: { D: 'diamond', S: 'stick' } };
      case 'diamond_axe': return { rows: ['DD', 'DS', ' S'], spec: { D: 'diamond', S: 'stick' }, mirror: true };
      case 'diamond_hoe': return { rows: ['DD', ' S', ' S'], spec: { D: 'diamond', S: 'stick' }, mirror: true };
      case 'diamond_sword': return { rows: ['D', 'D', 'S'], spec: { D: 'diamond', S: 'stick' } };
      case 'fishing_rod': return { rows: ['  S', ' SF', 'S F'], spec: { S: 'stick', F: 'string' } };
      default: return null;
    }
  }
  function craftSlotMatches(item, token, spec) {
    if (!token || token === ' ') return !item;
    const want = spec[token];
    if (want === 'planks') return isWoodPlank(item);
    if (want === 'logs') return isWoodLog(item);
    return item === want;
  }
  function normalizedCraftGrid() {
    const rows = [];
    let any = false;
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        const k = craftGrid[r * 3 + c] || null;
        if (k) any = true;
        row.push(k);
      }
      rows.push(row);
    }
    return any ? rows : null;
  }
  function patternRowsMatchGrid(rows, spec, grid) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const token = (r < h && c < w) ? (rows[r][c] || ' ') : ' ';
      if (!craftSlotMatches(grid[r][c], token, spec || {})) return false;
    }
    return true;
  }
  function mirrorRows(rows) {
    const w = Math.max(...rows.map(r => r.length));
    return rows.map(row => row.padEnd(w, ' ').split('').reverse().join(''));
  }
  function patternMatchesGrid(pattern) {
    const grid = normalizedCraftGrid(); if (!grid) return false;
    if (patternRowsMatchGrid(pattern.rows, pattern.spec || {}, grid)) return true;
    return !!pattern.mirror && patternRowsMatchGrid(mirrorRows(pattern.rows), pattern.spec || {}, grid);
  }
  function shapelessMatchesGrid(r) {
    const used = {};
    let total = 0;
    for (const k of craftGrid) if (k) { used[k] = (used[k] || 0) + 1; total++; }
    if (total !== recipeSumNeeds(r)) return false;
    for (const k in r.needs) if ((used[k] || 0) !== r.needs[k]) return false;
    return true;
  }
  function recipeMatchesGrid(r) {
    if (!manualCraftCapable(r)) return false;
    const ptn = craftPattern(r.key);
    return ptn ? patternMatchesGrid(ptn) : shapelessMatchesGrid(r);
  }
  function craftGridRecipe() {
    return (D().RECIPES || []).find(r => recipeUnlocked(r) && recipeMatchesGrid(r)) || null;
  }
  function craftGridCounts() {
    const out = {};
    for (const k of craftGrid) if (k) out[k] = (out[k] || 0) + 1;
    return out;
  }
  function putCraftItem(key) {
    if (!key || !hasItem(key, 1)) return;
    const used = craftGridCounts();
    if ((used[key] || 0) >= (P.inv[key] || 0)) { toastFn('이미 보유 수량만큼 제작대에 올렸어요.', false); return; }
    const i = craftGrid.indexOf(null);
    if (i < 0) { toastFn('제작대 3x3 칸이 가득 찼어요.', false); return; }
    craftGrid[i] = key;
    renderZone();
  }
  function clearCraftSlot(i) {
    if (i >= 0 && i < 9) craftGrid[i] = null;
    renderZone();
  }
  function clearCraftGrid() {
    craftGrid = Array(9).fill(null);
    renderZone();
  }
  // V21-D8: 화로 제련 — 화로 근처에서만(3D가 판정), 석탄 1 = 8회 연료(바닐라 비율)
  function smeltItem(inKey) {
    const r = (D().SMELT_RECIPES || []).find(x => x.in === inKey); if (!r) return false;
    const near = (typeof window.economy3dNearFurnace === 'function') ? window.economy3dNearFurnace() : true;
    if (!near) { toastFn('🔥 화로 근처에서만 제련할 수 있어요 (화로를 제작해 설치하세요)', false); return false; }
    const inN = r.inN || 1;
    if (!hasItem(inKey, inN)) { toastFn(`${itemName(inKey)} ${inN}개가 필요해요`, false); return false; }
    P.furnaceFuel = P.furnaceFuel || 0;
    if (P.furnaceFuel <= 0) {
      if (!hasItem('coal', 1)) { toastFn('연료가 없어요 — 석탄 1개 = 8회 제련', false); return false; }
      removeItem('coal', 1); P.furnaceFuel = 8;
    }
    P.furnaceFuel--;
    removeItem(inKey, inN); addItem(r.out, r.n || 1); addCollection(r.out, r.n || 1);
    addSkillXp('mining', 2);
    toastFn(`🔥 제련 완료: ${itemName(r.out)} (연료 ${P.furnaceFuel}/8)`, true);
    saveNow(); renderZone(); return true;
  }
  function smeltHTML() {
    const near = (typeof window.economy3dNearFurnace === 'function') ? window.economy3dNearFurnace() : true;
    const fuel = P.furnaceFuel || 0;
    return `<div class="econ-panel"><h4>🔥 화로 제련 ${near ? '' : '<span class="muted">— 화로 근처가 아니에요</span>'}</h4>
      <p class="econ-note">화로를 제작해 설치하고 가까이에서 제련하세요. 석탄 1개 = 8회 (남은 연료 ${fuel}/8, 석탄 ${P.inv.coal || 0}개)</p>
      <div class="econ-shopgrid">${(D().SMELT_RECIPES || []).map(r => {
        const inN = r.inN || 1, have = P.inv[r.in] || 0;
        const ok = near && have >= inN && ((P.furnaceFuel || 0) > 0 || (P.inv.coal || 0) > 0);
        return `<div class="econ-shopitem">${iconImg(r.out)}<span>${r.name}</span>
          <span class="muted">${itemName(r.in)} ${have}/${inN}</span>
          <button class="btn btn--sm" data-act="econ_smelt" data-key="${r.in}" ${ok ? '' : 'disabled'}>제련</button></div>`;
      }).join('')}</div></div>`;
  }
  function craftFromGrid() {
    const r = craftGridRecipe();
    if (!r) { toastFn('이 배치로는 만들 수 있는 조합법이 없어요.', false); return false; }
    const counts = craftGridCounts();
    for (const k in counts) if (!hasItem(k, counts[k])) { toastFn(`${itemName(k)} 수량이 부족해요.`, false); return false; }
    for (const k in counts) removeItem(k, counts[k]);
    addItem(r.key, r.gives || 1);
    addSkillXp('enchanting', 10);
    stat('itemsCrafted');
    craftSel = r.key;
    craftGrid = Array(9).fill(null);
    toastFn(`제작 완료: ${itemName(r.key)}`, true);
    saveNow(); renderZone(); return true;
  }

  const TOOL_SKILL = { pickaxe: 'mining', axe: 'foraging', hoe: 'farming', rod: 'fishing' };
  function bestToolMul(family) {
    const ladder = D().TOOLS[family]; if (!ladder) return 1;
    const lv = skillLevel(TOOL_SKILL[family] || 'mining');
    for (let i = ladder.length - 1; i >= 0; i--) {
      if (!hasItem(ladder[i].key)) continue;
      if ((ladder[i].req || 0) > lv) continue;   // V7: 요구 스킬 레벨 미달 도구 사용 불가
      return ladder[i].mul;
    }
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
    // V20-G: 채광 포춘 — 광산에서 추가 드롭(포춘 100 = +1개 확정 + 나머지 % 확률)
    if (zoneKey === 'mine') {
      const mf = playerStats().miningFortune || 0;
      qty += Math.floor(mf / 100); if (Math.random() * 100 < (mf % 100)) qty += 1;
      hotmAwardPowder(qty);
    }
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
  let _shopMap = null;   // V11: SHOP 1700+ 아이템 O(1) 조회 캐시(데이터는 로드 후 불변)
  function shopDef(key) {
    if (!_shopMap) { _shopMap = new Map(); for (const s of D().SHOP) _shopMap.set(s.key, s); }
    return _shopMap.get(key);
  }
  function dailySoldCheck() { if (P.dailySoldDate !== todayStr()) { P.dailySoldDate = todayStr(); P.dailySold = {}; } }
  function sellBonusPct() { return Math.min(10, Math.floor(skillLevel('social') / 5)) + talismanStats().sellBonus; }
  function minionSlotCost() { return Math.round(D().MINION_SLOT_COST_BASE * Math.pow(D().MINION_SLOT_COST_MUL, P.minionSlotsBought)); }
  function buyItem(key) {
    // 특수: 미니언 슬롯 확장권(가격 없는 상점 아이템 — 골드 즉시 소모, 가격 누진, 최대 5칸)
    if (key === 'minion_slot_expander') {
      if (P.maxMinionSlots >= D().MINION_SLOT_MAX) { toastFn('미니언 슬롯이 최대예요', false); return; }
      if ((P.minionSlotsBought || 0) >= 5) { toastFn('상점 슬롯은 최대 5칸까지! 나머지는 미니언 고유 조합으로 확장돼요', false); return; }
      const cost = minionSlotCost();
      if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
      addGold(-cost); P.minionSlotsBought++;
      // 조합 보너스 + 상점 구매 합산으로 슬롯 재계산(감소 없음)
      const uniq = Object.keys(P.minionCrafts || {}).length;
      P.maxMinionSlots = Math.max(P.maxMinionSlots, Math.min(D().MINION_SLOT_MAX, 5 + minionSlotBonus(uniq) + Math.min(5, P.minionSlotsBought)));
      toastFn(`미니언 슬롯 확장! (${P.maxMinionSlots}칸 · 상점 ${P.minionSlotsBought}/5)`, true);
      saveNow(); renderZone(); return;
    }
    const sdef = shopDef(key);
    if (!sdef || !(sdef.buyPrice > 0)) { toastFn('이 게임의 골드는 강화·합성·리포지 전용! 아이템은 채집·드롭·조합으로 얻어요', false); return; }
    const def = sdef;
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
    if ((P.locked || {})[key]) { toastFn('🔒 잠긴 장비예요 — 인벤토리에서 잠금 해제 후 판매하세요', false); return; }
    removeItem(key, sellN);
    addGold(Math.round(def.sellPrice * sellN * (1 + sellBonusPct() / 100)));
    P.dailySold[key] = already + sellN;
    stat('itemsSold', sellN);
    saveNow(); renderZone();
  }
  /* ---------------- 바자회(Bazaar) — 대량 자원 시장(즉시구매/즉시판매 + 실시간 시세) V20-E ---------------- */
  function bzHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  // 상품 시세: 기준가(SHOP sellPrice)에 1시간 시드 변동(±fluxPct) 적용 → 세이브 무관 재현. 즉시판매/즉시구매(스프레드).
  function bazaarPrice(key) {
    const bz = D().BAZAAR; const sd = shopDef(key); if (!sd || !(sd.sellPrice > 0)) return null;
    const period = Math.floor(Date.now() / bz.fluxPeriodMs);
    const r = bzHash(key + '@' + period);               // 0~1 결정적 난수(상품·시간별)
    const flux = 1 + (r * 2 - 1) * (bz.fluxPct / 100);   // 1±fluxPct
    const sell = Math.max(1, Math.round(sd.sellPrice * flux));
    const buy = Math.max(sell + 1, Math.round(sell * (1 + bz.spreadPct / 100)));
    const prev = bzHash(key + '@' + (period - 1)) * 2 - 1;   // 직전 시간 대비 등락 방향
    return { key, name: sd.name, buy, sell, trend: (r * 2 - 1) - prev };
  }
  function bazaarInstantBuy(key, qty) {
    qty = Math.max(1, qty | 0); const p = bazaarPrice(key); if (!p) { toastFn('바자에서 취급하지 않는 상품이에요', false); return; }
    const cost = p.buy * qty;
    if (P.gold < cost) { toastFn(`골드가 부족해요 (${fmtGold(cost)} 필요)`, false); return; }
    addGold(-cost); addItem(key, qty);
    P.bazaarBought = (P.bazaarBought || 0) + qty;
    toastFn(`🏪 즉시구매: ${p.name} ×${qty} (${fmtGold(cost)})`, true);
    saveNow(); renderZone();
  }
  function bazaarInstantSell(key, qty) {
    const p = bazaarPrice(key); if (!p) { toastFn('바자에서 취급하지 않는 상품이에요', false); return; }
    if ((P.locked || {})[key]) { toastFn('🔒 잠긴 아이템이에요', false); return; }
    const have = P.inv[key] || 0; qty = Math.min(Math.max(1, qty | 0), have);
    if (qty <= 0) { toastFn('보유 수량이 부족해요', false); return; }
    removeItem(key, qty); const gain = p.sell * qty; addGold(gain);
    P.bazaarSold = (P.bazaarSold || 0) + qty;
    toastFn(`🏪 즉시판매: ${p.name} ×${qty} (+${fmtGold(gain)})`, true);
    saveNow(); renderZone();
  }

  /* ---------------- 경매장(Auction House) — 경매/즉구(BIN) 판매 창구 V20-F ---------------- */
  const AH_BUYERS = ['수집가 에드먼드', '상인 셀레스트', '남작 볼프강', '길드장 미라', '탐험가 로안', '연금술사 바네사', '기사 갈라드', '음유시인 핀'];
  function ahAH() { return D().AUCTION_HOUSE; }
  function ahListingsArr() { if (!Array.isArray(P.ahListings)) P.ahListings = []; return P.ahListings; }
  function ahItemName(L) { const sd = shopDef(L.key); return sd ? sd.name : L.key; }
  function ahBuyerName(L) { return AH_BUYERS[Math.floor(bzHash('buyer' + L.id + L.key) * AH_BUYERS.length)]; }
  // 물품 공정가치(시세) — 낙찰가 산정 기준. 등록 id로 시드해 세이브 무관 재현.
  function ahFairValue(L) {
    const sd = shopDef(L.key); const base = sd && sd.sellPrice > 0 ? sd.sellPrice : 100;
    const A = ahAH(); const r = bzHash('val' + L.id + L.key);
    return base * (A.auctionValueMin + r * (A.auctionValueMax - A.auctionValueMin));
  }
  // 경매 현재 입찰가(표시용): 시간 경과에 따라 시작가→공정가치로 상승(공정가치 ≥ 시작가일 때)
  function ahCurrentBid(L) {
    if (L.kind !== 'auction') return L.price;
    if (L.settled) return L.finalPrice || L.price;
    const val = ahFairValue(L); if (val < L.price) return L.price;   // 유찰 예정 → 입찰 없음
    const total = Math.max(1, L.endsAt - L.created);
    const prog = Math.min(1, Math.max(0, (Date.now() - L.created) / total));
    // 초반 완만·후반 급등(입찰 경쟁 곡선)
    const eased = prog * prog;
    return Math.round(L.price + (val - L.price) * eased);
  }
  function ahTimeLeft(L) { return Math.max(0, L.endsAt - Date.now()); }
  // 만료/판매 정산: 매 렌더/열람 시 호출. 결정적(시드 기반).
  function ahSettle() {
    const A = ahAH(); const now = Date.now(); let changed = false;
    for (const L of ahListingsArr()) {
      if (L.settled) continue;
      if (L.kind === 'auction') {
        if (now >= L.endsAt) {
          const val = ahFairValue(L);
          if (val >= L.price) { L.sold = true; L.finalPrice = Math.max(L.price, Math.round(val)); L.buyer = ahBuyerName(L); }
          else { L.sold = false; }
          L.settled = true; changed = true;
        }
      } else {   // BIN(즉시구매) — 시세×배수 이하일 때 시드 확률로 조기 판매, 기간 만료 시 유찰
        const val = ahFairValue(L) * A.binSellValueMul;
        const durH = Math.max(0.01, (L.endsAt - L.created) / 3600000);
        const cheapEdge = Math.max(0, Math.min(1, (val - L.price) / Math.max(1, val)));
        const willSell = L.price <= val && bzHash('binw' + L.id) < Math.min(0.97, 0.35 + cheapEdge);
        const soldDelayH = bzHash('bint' + L.id) * durH;
        if (willSell && (now - L.created) / 3600000 >= soldDelayH) {
          L.sold = true; L.finalPrice = L.price; L.buyer = ahBuyerName(L); L.settled = true; changed = true;
        } else if (now >= L.endsAt) { L.sold = false; L.settled = true; changed = true; }
      }
    }
    if (changed) saveNow();
    return changed;
  }
  function ahActiveCount() { return ahListingsArr().filter(L => !L.settled).length; }
  // 경매/BIN 등록: 보유 아이템 1개를 에스크로(인벤에서 제거)하고 매물 생성
  function ahList(itemKey, kind, price, durationH) {
    const A = ahAH();
    if (ahListingsArr().length >= A.maxListings) { toastFn(`경매 슬롯이 가득 찼어요 (최대 ${A.maxListings}) — 낙찰 수령/취소 후 다시`, false); return false; }
    if (!hasItem(itemKey)) { toastFn('보유하지 않은 아이템이에요', false); return false; }
    if ((P.locked || {})[itemKey]) { toastFn('🔒 잠긴 아이템은 등록할 수 없어요', false); return false; }
    price = Math.max(1, Math.round(price || 0));
    kind = kind === 'bin' ? 'bin' : 'auction';
    durationH = A.durations.includes(durationH) ? durationH : A.durations[0];
    if (!removeItem(itemKey, 1)) return false;
    const now = Date.now();
    const L = { id: ++P.ahSeq, key: itemKey, qty: 1, kind, price, created: now, endsAt: now + durationH * 3600000, settled: false, sold: false, buyer: null, finalPrice: 0 };
    ahListingsArr().push(L);
    toastFn(`📜 경매장 등록: ${ahItemName(L)} — ${kind === 'bin' ? '즉시구매' : '경매'} ${fmtGold(price)}`, true);
    saveNow(); renderZone(); return true;
  }
  // 낙찰/유찰 수령: 판매 시 골드(수수료 차감), 유찰 시 아이템 반환
  function ahClaim(id) {
    ahSettle();
    const arr = ahListingsArr(); const i = arr.findIndex(L => L.id === id); if (i < 0) return;
    const L = arr[i]; if (!L.settled) { toastFn('아직 진행 중인 매물이에요', false); return; }
    if (L.sold) {
      const fee = Math.round(L.finalPrice * ahAH().feePct / 100);
      const net = Math.max(0, L.finalPrice - fee); addGold(net);
      stat('ahSold', 1);
      toastFn(`💰 낙찰! ${ahItemName(L)} → ${L.buyer} (+${fmtGold(net)}${fee ? `, 수수료 ${fmtGold(fee)}` : ''})`, true);
    } else {
      addItem(L.key, L.qty);
      toastFn(`↩ 유찰 — ${ahItemName(L)} 반환됨`, false);
    }
    arr.splice(i, 1); saveNow(); renderZone();
  }
  // 진행 중 매물 취소(아이템 반환) — 정산 전만 가능
  function ahCancel(id) {
    const arr = ahListingsArr(); const i = arr.findIndex(L => L.id === id); if (i < 0) return;
    const L = arr[i]; if (L.settled) { ahClaim(id); return; }
    addItem(L.key, L.qty); arr.splice(i, 1);
    toastFn(`취소됨 — ${ahItemName(L)} 반환`, false);
    saveNow(); renderZone();
  }

  /* ---------------- 산의 심장(Heart of the Mountain) — 채광 퍼크 트리 V20-G ---------------- */
  function hotmState() { if (!P.hotm) P.hotm = { tier: 1, mithril: 0, gemstone: 0, nodes: {} }; return P.hotm; }
  function hotmNodeDef(key) { return D().HEART_OF_MOUNTAIN.nodes.find(n => n.key === key); }
  function hotmNodeLevel(key) { return (hotmState().nodes || {})[key] || 0; }
  // 노드 다음 레벨 비용(base × mul^현재레벨)
  function hotmNodeCost(key) {
    const nd = hotmNodeDef(key); if (!nd) return null;
    const lv = hotmNodeLevel(key); if (lv >= nd.max) return null;
    return { powder: nd.powder, amount: Math.round(nd.base * Math.pow(nd.mul || 1, lv)) };
  }
  // 특정 스탯을 부여하는 모든 노드의 합(레벨×per). madness/titanGrip 등 플랫 노드 포함.
  function hotmStat(statKey) {
    let sum = 0;
    for (const nd of D().HEART_OF_MOUNTAIN.nodes) {
      const lv = hotmNodeLevel(nd.key); if (lv <= 0) continue;
      if (nd.stat === statKey) sum += lv * nd.per;
      // 복합 노드: 광란 = 채광속도+포춘 동시, 광맥혼란/타이탄 = 포춘
      if (statKey === 'miningFortune' && nd.stat === 'madness') sum += lv * nd.per;
      if (statKey === 'miningSpeed' && nd.stat === 'madness') sum += lv * nd.per;
      if (statKey === 'miningFortune' && nd.stat === 'gemMadness') sum += lv * nd.per;
      if (statKey === 'miningFortune' && nd.stat === 'titanGrip') sum += lv * nd.per;
      if (statKey === 'miningFortune' && nd.stat === 'gemstoneFortune') sum += lv * nd.per;
    }
    return sum;
  }
  function hotmMiningFortune() { return hotmStat('miningFortune'); }
  function hotmMiningSpeed() { return hotmStat('miningSpeed'); }
  // tier 해금
  function hotmUnlockTier() {
    const H = D().HEART_OF_MOUNTAIN; const st = hotmState();
    if (st.tier >= H.maxTier) { toastFn('이미 최고 티어(산의 심장 MAX)예요', false); return; }
    const cost = H.tierUnlock[st.tier + 1] || Infinity;
    if (st.mithril < cost) { toastFn(`미스릴 가루가 부족해요 (${fmtNum(cost)} 필요)`, false); return; }
    st.mithril -= cost; st.tier += 1;
    toastFn(`⛰️ 산의 심장 티어 ${st.tier} 개방!`, true);
    saveNow(); renderZone();
  }
  // 노드 강화
  function hotmUpgrade(key) {
    const nd = hotmNodeDef(key); if (!nd) return;
    const st = hotmState();
    if (st.tier < nd.tier) { toastFn(`티어 ${nd.tier} 개방이 필요해요`, false); return; }
    const lv = hotmNodeLevel(key); if (lv >= nd.max) { toastFn('이미 최대 레벨이에요', false); return; }
    const cost = hotmNodeCost(key); if (!cost) return;
    const have = cost.powder === 'gemstone' ? st.gemstone : st.mithril;
    if (have < cost.amount) { toastFn(`${cost.powder === 'gemstone' ? '젬스톤' : '미스릴'} 가루가 부족해요 (${fmtNum(cost.amount)} 필요)`, false); return; }
    if (cost.powder === 'gemstone') st.gemstone -= cost.amount; else st.mithril -= cost.amount;
    st.nodes[key] = lv + 1;
    toastFn(`${nd.emoji} ${nd.name} Lv${lv + 1}!`, true);
    saveNow(); renderZone();
  }
  // 채광 시 가루 적립(gather/3d 채광에서 호출)
  function hotmAwardPowder(qty) {
    const H = D().HEART_OF_MOUNTAIN; const st = hotmState();
    const daily = hotmStat('dailyPowder');   // 일일 가루 노드 → 획득량 가산(플랫)
    st.mithril += Math.max(1, Math.round(H.powderPerMine * Math.max(1, qty) * (1 + hotmStat('miningXp') / 100))) + Math.round(daily / 100);
    if (Math.random() < H.gemstoneChance) st.gemstone += Math.max(1, Math.round(H.gemstonePerMine * Math.max(1, qty)));
  }

  // 일일 특가(날짜 시드 고정 3종, 각 1회 구매)
  function seededRand(seedStr) { let h = 2166136261; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function dealsForToday() {
    // 판매 가능 아이템 중 매일 3종(날짜 시드)
    const pool = D().SHOP.filter(sd => sd.sellPrice >= 3 && sd.category !== '인챈트');
    const day = Math.floor(Date.now() / 86400000);
    const out = [];
    for (let i = 0; i < D().DAILY_DEALS.count; i++) {
      const idx = Math.abs((day * 2654435761 + i * 40503) % pool.length);
      out.push({ key: pool[idx].key });
    }
    return out;
  }
  function buyDeal(i) {
    const deals = dealsForToday(); const d = deals[i]; if (!d) return;
    if ((P.dealsBought || []).indexOf(i) >= 0) { toastFn('오늘은 이미 매입 완료!', false); return; }
    const sd = shopDef(d.key); const owned = P.inv[d.key] || 0;
    if (!sd || owned <= 0) { toastFn('팔 물건이 없어요', false); return; }
    const n = Math.min(64, owned);
    removeItem(d.key, n);
    const mul = i === 0 ? D().DAILY_DEALS.jackpotMul : D().DAILY_DEALS.normalMul;   // 0번 = 오늘의 잭팟(×5)
    const gain = Math.round(sd.sellPrice * mul) * n;
    addGold(gain);
    if (!P.dealsBought) P.dealsBought = [];
    P.dealsBought.push(i);
    toastFn(`🎪 수집상에게 ${sd.name} ×${n} 판매! +${fmtGold(gain)} (웃돈 2.5배)`, true);
    saveNow(); renderZone();
  }

  /* ---------------- 은행 ---------------- */
  function bankInterestTick() {
    const day = todayStr();
    if (P.lastInterestDay === day) return;
    if (P.lastInterestDay && P.bank > 0) {
      const interest = Math.round(Math.min(P.bank, bankTierInfo().cap) * (bankTierInfo().pct || D().BANK.interestPctPerDay) / 100);
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
  function nextMinionCost(key, curTier) { const t = minionTierInfo(key, curTier + 1); return t ? t.craftCost : null; }
  function minionSpeedMul() {
    let mul = 1 + talismanStats().minionSpeed / 100;
    if (P.minionFuelUntil > Date.now()) mul *= (P.minionFuelMul || D().MINION_FUEL.speedMul);
    return mul;
  }
  function useMinionFuel(key) {
    const F = key === 'minion_fuel_lava' ? D().MINION_FUEL2 : D().MINION_FUEL;
    if (!hasItem(F.key)) { toastFn('연료가 없어요(조합 제작)', false); return; }
    removeItem(F.key, 1);
    P.minionFuelUntil = Math.max(Date.now(), P.minionFuelUntil || 0) + F.durationHours * 3600 * 1000;
    P.minionFuelMul = F.speedMul;
    toastFn(`연료 주입! 모든 미니언 +${Math.round((F.speedMul - 1) * 100)}% (${F.durationHours}시간)`, true);
    saveNow(); renderZone();
  }
  // 실제 스카이블럭: 미니언은 자원으로 "조합"해서 배치한다(골드 구매 아님).
  //   컬렉션 티어 1 이상이어야 해금, 조합할 때마다 고유 조합 수가 쌓여 슬롯이 늘어난다.
  function minionUnlocked(key) {
    const def = minionDef(key); if (!def) return false;
    return collectionTierIdx(def.unlockCollection || def.resource) >= 1;
  }
  // V16: 실제 하이픽셀 미니언 슬롯 보너스(고유 미니언-티어 조합 수 → 계단식). 650 조합 = +21(최대)
  function minionSlotBonus(uniq) {
    if (uniq >= 650) return 21; if (uniq >= 350) return 15; if (uniq >= 200) return 10;
    if (uniq >= 100) return 6; if (uniq >= 50) return 4; if (uniq >= 15) return 2; if (uniq >= 5) return 1; return 0;
  }
  function recordMinionCraft(key, tier) {
    if (!P.minionCrafts) P.minionCrafts = {};
    P.minionCrafts[`${key}:${tier}`] = 1;
    const uniq = Object.keys(P.minionCrafts).length;
    const slots = Math.min(D().MINION_SLOT_MAX, 5 + minionSlotBonus(uniq) + Math.min(5, P.minionSlotsBought || 0));   // 실제: 기본5 + 조합보너스(최대21) + 상점(최대5) = 31
    if (slots > P.maxMinionSlots) { P.maxMinionSlots = slots; toastFn(`🎉 고유 미니언 조합 ${uniq}개 — 미니언 슬롯 ${slots}칸으로 확장!`, true); }
  }
  function placeMinion(key) {
    if (P.minions.length >= P.maxMinionSlots) { toastFn('미니언 슬롯이 가득 찼어요 (새 미니언을 조합하면 슬롯이 늘어나요)', false); return; }
    if (!minionUnlocked(key)) { toastFn('먼저 해당 자원 컬렉션 티어 1을 달성하세요', false); return; }
    const cost = minionTierInfo(key, 1).craftCost;
    if (!hasItem(cost.key, cost.n)) { toastFn(`조합 재료 부족: ${itemName(cost.key)} ×${cost.n}`, false); return; }
    // V13-A: 미니언 자유 배치 — 내가 서 있는 위치에 설치(반경 5×5에서 작동). 프라이빗 섬에서만.
    const pos = (typeof window.economy3dPlayerHomePos === 'function') ? window.economy3dPlayerHomePos() : null;
    if (!pos) { toastFn('미니언은 프라이빗 섬에서, 설치하고 싶은 자리에 서서 배치하세요', false); return; }
    removeItem(cost.key, cost.n);
    recordMinionCraft(key, 1);
    P.minions.push({ key, tier: 1, lastCollectAt: Date.now(), storage: 0, storageUpgraded: false, px: pos.x, pz: pos.z });
    toastFn('⚙️ 미니언 배치 완료! (서 있던 자리에 설치 · 5×5 범위에서 작동)', true);
    saveNow(); renderZone();
    if (typeof window.economy3dRebuildMinions === 'function') window.economy3dRebuildMinions();
  }
  function upgradeMinion(idx) {
    const m = P.minions[idx]; if (!m) return;
    const def = minionDef(m.key); if (m.tier >= def.maxTier) { toastFn('이미 최고 등급이에요', false); return; }
    const cost = minionTierInfo(m.key, m.tier + 1).craftCost;
    if (!hasItem(cost.key, cost.n)) { toastFn(`업그레이드 재료 부족: ${itemName(cost.key)} ×${cost.n}`, false); return; }
    removeItem(cost.key, cost.n);
    m.tier++;
    recordMinionCraft(m.key, m.tier);
    saveNow(); renderZone();
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
      const colBoost = 1 + collectionTierIdx(def.resource) * 0.02;   // V10: 컬렉션 티어당 +2%
      const intervalMs = tinfo.intervalSec * 1000 / (speedMul * colBoost);
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
      // 다이아 살포기: 생산마다 10% 확률로 다이아몬드 추가(실제 스카이블럭 미니언 업그레이드)
      if (hasItem('diamond_spreading')) {
        let bonus = 0;
        for (let i = 0; i < Math.min(produced, 50); i++) if (Math.random() < 0.10) bonus++;
        if (bonus > 0) addItem('diamond', bonus);
      }
      m.lastCollectAt += produced * intervalMs;
    }
    if (changed) saveNow();
  }
  function collectMinion(idx) {
    const m = P.minions[idx]; if (!m || m.storage <= 0) return;
    const def = minionDef(m.key);
    addItem(def.resource, m.storage); addCollection(def.resource, m.storage);
    if (hasItem('super_compactor')) {   // V10: 컴팩터 — 압축 보너스 골드(판매가치 +50% 상당)
      const sd = shopDef(def.resource);
      if (sd && sd.sellPrice) addGold(Math.round(sd.sellPrice * m.storage * 0.5));
    }
    m.storage = 0; saveNow(); renderZone();
  }
  // ㉕ 일괄 수거
  function collectAllMinions() {
    let total = 0;
    P.minions.forEach((m, i) => { if (m.storage > 0) { total += m.storage; collectMinion(i); } });
    if (total > 0) toastFn(`⚙️ 미니언 전체 수거: ${total}개`, true);
  }

  /* ---------------- 슬레이어(V9 마덕스식: 퀘스트 → 게이지 → 보스 소환 → 슬레이어 레벨) ---------------- */
  const SLAYER_MOB_MAP = {   // 3D 몹 종 → 슬레이어 계열(퀘스트 게이지)
    zombie: 'zombie_slayer', zombie_villager: 'zombie_slayer', crypt_ghoul: 'zombie_slayer', golden_ghoul: 'zombie_slayer', miner_zombie: 'zombie_slayer', lapis_zombie: 'zombie_slayer', diamond_zombie: 'zombie_slayer', zombie_pigman: 'zombie_slayer',
    spider: 'spider_slayer', splitter_spider: 'spider_slayer', weaver_spider: 'spider_slayer', dasher_spider: 'spider_slayer', voracious_spider: 'spider_slayer', spider_jockey: 'spider_slayer', tarantula_vermin: 'spider_slayer', flaming_spider: 'spider_slayer',
    wolf: 'wolf_slayer', old_wolf: 'wolf_slayer', pack_spirit: 'wolf_slayer', howling_spirit: 'wolf_slayer', soul_of_the_alpha: 'wolf_slayer',
    enderman: 'enderman_slayer', zealot: 'enderman_slayer', endermite: 'enderman_slayer', watcher: 'enderman_slayer', obsidian_defender: 'enderman_slayer',
    blaze: 'blaze_slayer', magma_cube: 'blaze_slayer', ghast: 'blaze_slayer', wither_skeleton: 'blaze_slayer',
  };
  function slayerXpOf(key) { return (P.slayerXp || {})[key] || 0; }
  function slayerLevel(key) {
    const T = D().SLAYER_XP_LEVELS; const xp = slayerXpOf(key);
    let lv = 0; for (let i = 0; i < T.length; i++) if (xp >= T[i]) lv = i + 1;
    return lv;
  }
  function startSlayerQuest(key, tier) {
    const def = slayerDef(key); const tinfo = def.tiers.find(t => t.tier === tier); if (!tinfo) return;
    if (skillLevel('combat') < tinfo.minCombatLevel) { toastFn(`전투 스킬 레벨 ${tinfo.minCombatLevel} 필요`, false); return; }
    if (P.gold < tinfo.turnInGold) { toastFn(`퀘스트 의뢰비 ${fmtGold(tinfo.turnInGold)} 부족`, false); return; }
    if (P.slayerQuest) { toastFn('이미 진행 중인 슬레이어 퀘스트가 있어요', false); return; }
    addGold(-tinfo.turnInGold);
    const needed = D().SLAYER_QUEST.killsNeeded[tier - 1] || 10;
    P.slayerQuest = { key, tier, kills: 0, needed };
    toastFn(`💀 ${def.name} T${tier} 퀘스트 시작! ${def.flavor} 계열 몬스터를 ${needed}마리 처치하면 보스가 소환됩니다`, true);
    saveNow(); renderZone();
  }
  function slayerQuestProgress(mobType) {
    if (!P || !P.slayerQuest) return;
    const cat = SLAYER_MOB_MAP[mobType];
    if (cat !== P.slayerQuest.key) return;
    P.slayerQuest.kills++;
    if (P.slayerQuest.kills < P.slayerQuest.needed) {
      if (P.slayerQuest.kills % 5 === 0 || P.slayerQuest.needed - P.slayerQuest.kills <= 3) toastFn(`💀 슬레이어 게이지 ${P.slayerQuest.kills}/${P.slayerQuest.needed}`, true);
      return;
    }
    const q = P.slayerQuest; P.slayerQuest = null;
    toastFn('💀💀 게이지 완충!! 슬레이어 보스가 나타났다!', false);
    startSlayer(q.key, q.tier);
  }
  /* ---------------- 슬레이어 보스전 ---------------- */
  function slayerDef(key) { return D().SLAYERS.find(s => s.key === key); }
  let _buildNameMap = null;
  function itemName(key) {
    const s = shopDef(key); if (s) return s.name;
    const pi = (D().PORTAL_ITEMS || {})[key]; if (pi) return pi.name;   // V21-C: 섬 포탈 아이템
    if (!_buildNameMap) { _buildNameMap = {}; (D().BUILDER_SHOP || []).forEach(b => { _buildNameMap[b.key] = b.name; }); }   // V15: 건축 블럭 이름
    return _buildNameMap[key] || key;
  }
  // 보너스 장비 드롭: 상점에서 못 사는(드롭 전용) 무기/방어구 풀에서 무작위 지급 — 파밍의 재미
  function randomEquipDrop(maxTierIdx) {
    const E = D().EQUIPMENT; const tiers = D().ITEM_TIERS;
    const pool = [];
    for (const list of [E.weapons, E.armor]) for (const it of list) {
      if (it.buyPrice !== 0) continue;
      const ti = tiers.findIndex(t => t.key === it.tierKey);
      if (ti >= 0 && ti <= maxTierIdx) pool.push(it);
    }
    if (!pool.length) return null;
    const it = pool[Math.floor(Math.random() * pool.length)];
    addItem(it.key, 1);
    return it;
  }
  // V11: src(획득처)별 장비 드롭 — 1400종 DB의 field/dungeon_fN/slayer_계열/fishing/chest/arena/miniboss/hell_boss 풀
  function equipDropFromSrc(src, maxTierIdx) {
    const E = D().EQUIPMENT, tiers = D().ITEM_TIERS;
    const pool = [];
    for (const list of [E.weapons, E.armor]) for (const it of list) {
      if (it.src !== src) continue;
      const ti = tiers.findIndex(t => t.key === it.tierKey);
      if (maxTierIdx != null && ti > maxTierIdx) continue;
      pool.push(it);
    }
    if (!pool.length) return null;
    const it = pool[Math.floor(Math.random() * pool.length)];
    addItem(it.key, 1);
    return it;
  }
  function startSlayer(key, tier) {
    const def = slayerDef(key); const tinfo = def.tiers.find(t => t.tier === tier); if (!tinfo) return;
    if (skillLevel('combat') < tinfo.minCombatLevel) { toastFn(`전투 스킬 레벨 ${tinfo.minCombatLevel} 필요`, false); return; }
    if (P.gold < tinfo.turnInGold) { toastFn('골드가 부족해요', false); return; }
    addGold(-tinfo.turnInGold); saveNow();
    activeCombat = {
      kind: 'slayer', label: `${def.flavor} T${tier}`, hp: tinfo.hp, maxHp: tinfo.hp, dmg: tinfo.dmg,
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(), _hits: 0, slayerKey: key,
      onWin: () => {
        addSkillXp('combat', Math.round(tinfo.xpReward * enchXpMul()));
        const coin = Math.round(tinfo.coinReward * enchCoinMul());
        addGold(coin);
        // 기본 전리품(자원) + 희귀 드롭(실제 아이템 지급)
        const resN = 2 + Math.floor(Math.random() * 3);
        addItem(def.dropResource, resN); addCollection(def.dropResource, resN);
        const roll = Math.random(); const loot = tinfo.rareDropTable;
        const itemKey = loot[roll < 0.6 ? 0 : (roll < 0.9 ? Math.min(1, loot.length - 1) : loot.length - 1)];
        addItem(itemKey, 1);
        toastFn(`${def.flavor} 처치! +${fmtGold(coin)}, ${itemName(def.dropResource)} ×${resN}, 전리품: ${itemName(itemKey)}`, true);
        // V10: 계열 전용 유니크 무기(티어2+ 12%) — 리븐넌트 팔션/스콜피온 포일/푸치 소드/보이드엣지/화염 분노
        if (tier >= 2 && def.uniqueDrop && Math.random() < 0.12) {
          addItem(def.uniqueDrop, 1);
          toastFn(`🌟 슬레이어 유니크 드롭! ${itemName(def.uniqueDrop)}`, true);
        }
        stat('slayerBosses'); stat('bossKills');
        // V11: 계열 전용 장비 풀(slayer_계열) 우선, 없으면 범용 드롭
        if (Math.random() < 0.35) {
          const fam = key.replace('_slayer', '');
          const bonus = equipDropFromSrc('slayer_' + fam, Math.min(8, tier + 3)) || randomEquipDrop(Math.min(6, tier + 1));
          if (bonus) toastFn(`🎁 희귀 장비 드롭! ${bonus.name}`, true);
        }
        P.slayerBest[key] = Math.max(P.slayerBest[key] || 0, tier);
        // V9: 슬레이어 XP + 레벨업 보상
        if (!P.slayerXp) P.slayerXp = {};
        const before = slayerLevel(key);
        P.slayerXp[key] = (P.slayerXp[key] || 0) + (D().SLAYER_QUEST.xpPerTier[tier - 1] || 5);
        const after = slayerLevel(key);
        if (after > before) {
          toastFn(`💀 ${def.name} 레벨 ${after} 달성!`, true);
          const rewardTali = { zombie_slayer: 'talisman_revenant', spider_slayer: 'talisman_tarantula', wolf_slayer: 'talisman_sven', enderman_slayer: 'talisman_voidgloom', blaze_slayer: 'talisman_inferno' }[key];
          if (after >= 3 && rewardTali && !hasItem(rewardTali)) { addItem(rewardTali, 1); toastFn(`🎁 슬레이어 Lv3 보상: ${itemName(rewardTali)}!`, true); }
        }
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
  function canEnterFloor(f) {
    if (f <= 1) return true;
    if (f >= 8) {   // V11 지옥층: M7 클리어 + 이전 지옥층 순차 해금
      const m7 = (P.dungeonMasterBest || {})[7];
      if (!m7 || m7 === 'F') return false;
      if (f === 8) return true;
      const prevH = P.dungeonBest[f - 1]; return !!prevH && prevH !== 'F';
    }
    const prev = P.dungeonBest[f - 1]; return !!prev && prev !== 'F';
  }   // F0/F1 상시 개방
  // V3: "지나가며 몬스터 처치" 웨이브 던전 — 방마다 실제 몬스터 무리가 나오고, 한 마리씩 처치하며 전진.
  // 플레이어 HP는 층 전체에서 이어짐(방 클리어 시 15% 회복) — 진짜 던전 공략감.
  function mkRoomMobs(fd, type) {
    if (type === 'wave') {
      const n = 3;
      return Array.from({ length: n }, (_, i) => {
        const name = fd.mobList[i % fd.mobList.length];
        const hp = Math.max(30, Math.round(fd.bossHp / 40));
        return { name, hp, maxHp: hp, dmg: Math.round(fd.bossDmg / 3) };
      });
    }
    if (type === 'miniboss') {
      const hp = Math.round(fd.bossHp / 8);
      return [{ name: `${fd.mobList[0]} 대장`, hp, maxHp: hp, dmg: Math.round(fd.bossDmg / 1.8) }];
    }
    if (type === 'boss') return [{ name: fd.bossName, hp: fd.bossHp, maxHp: fd.bossHp, dmg: fd.bossDmg, isBoss: true }];
    return [];
  }
  function startDungeon(floor) {
    if (!canEnterFloor(floor)) { toastFn('이전 층을 먼저 클리어하세요', false); return; }
    const fd = dungeonFloorDef(floor);
    const rooms = ['wave', 'puzzle', 'wave', 'miniboss', 'treasure', 'wave', 'boss'];
    dungeonRun = {
      floor, roomIdx: 0, rooms, score: 0, secretStep: 0,
      playerHp: playerMaxHp(), maxPlayerHp: playerMaxHp(),
      mobs: mkRoomMobs(fd, rooms[0]), _treasureLooted: false,
      cls: dungeonClassDef(P.dungeonClass),   // 던전 전용 클래스(실제 스카이블럭: Berserk/Mage/Archer/Tank/Healer)
    };
    renderZone();
  }
  function dungeonRoomType() { return dungeonRun.rooms[dungeonRun.roomIdx]; }
  function dungeonEnterRoom() {
    const fd = dungeonFloorDef(dungeonRun.floor);
    dungeonRun.mobs = mkRoomMobs(fd, dungeonRoomType());
    dungeonRun._treasureLooted = false;
    // 방 이동 시 회복(기본 15%, 힐러는 30%, 재생 인챈트로 추가)
    const healPct = ((dungeonRun.cls && dungeonRun.cls.roomHealPct) || 0.15) + enchSum('roomHeal') / 100;
    dungeonRun.playerHp = Math.min(dungeonRun.maxPlayerHp, dungeonRun.playerHp + Math.round(dungeonRun.maxPlayerHp * healPct));
  }
  function dungeonAdvance(outcome) {
    const S = D().DUNGEON_ROOM_SCORE;
    const rt = dungeonRoomType();
    if (rt === 'wave') dungeonRun.score += S.combat;
    else if (rt === 'puzzle') dungeonRun.score += outcome === 'correct' ? S.puzzleSuccess : S.puzzleFail;
    else if (rt === 'miniboss') dungeonRun.score += S.miniboss;
    else if (rt === 'treasure') dungeonRun.score += S.treasure;
    dungeonRun.roomIdx++;
    dungeonEnterRoom();
    partySync();
    renderZone();
  }
  function dungeonLootTreasure() {
    if (dungeonRun._treasureLooted) return;
    dungeonRun._treasureLooted = true;
    const fd = dungeonFloorDef(dungeonRun.floor);
    // 보물방: 층 비례 자원 꾸러미 + 10% 확률 랜덤 인챈트북
    const resPool = ['gold', 'diamond', 'emerald', 'lapis'];
    const rk = resPool[Math.floor(Math.random() * resPool.length)];
    const n = dungeonRun.floor * 4;
    addItem(rk, n); addCollection(rk, n);
    let msg = `💰 보물 상자! ${itemName(rk)} ×${n}`;
    if (Math.random() < 0.10) {
      const e = D().ENCHANTS[Math.floor(Math.random() * D().ENCHANTS.length)];
      addItem(`enchant_book_${e.key}`, 1);
      msg += ` + 인챈트북(${e.name})!`;
    }
    if (Math.random() < 0.30) {
      const bonus = randomEquipDrop(Math.min(6, dungeonRun.floor));
      if (bonus) msg += ` + 🎁 ${bonus.name}!`;
    }
    toastFn(msg, true);
    saveNow(); renderZone();
  }
  // 던전 전투: 살아있는 첫 몬스터를 공격 — 처치 시 다음 몬스터, 전멸 시 방 클리어
  function dungeonAttack() {
    if (!dungeonRun || !dungeonRun.mobs.length) return;
    const target = dungeonRun.mobs.find(m => m.hp > 0); if (!target) return;
    const cls = dungeonRun.cls || {};
    let dmg = playerAttackPower() * (cls.dmgMul || 1) * playerCritRoll();
    if (cls.firstHitMul && target.hp === target.maxHp) dmg *= cls.firstHitMul;   // 아처: 첫 타격 보너스
    const hitIdx = target._hits || 0;
    dmg *= enchCondMul({ hitIdx, targetHp: target.hp, targetMaxHp: target.maxHp, isBoss: !!target.isBoss });
    target._hits = hitIdx + 1;
    target.hp = Math.max(0, target.hp - dmg);
    // 흡혈/활력/힐러 회복
    const heal = enchHitHeal(dmg) + (cls.healPerHit || 0);
    dungeonRun.playerHp = Math.min(dungeonRun.maxPlayerHp, dungeonRun.playerHp + heal);
    if (target.hp <= 0) toastFn(`⚔️ ${target.name} 처치!`, true);
    const alive = dungeonRun.mobs.filter(m => m.hp > 0);
    if (!alive.length) {   // 방 전멸 → 클리어
      if (dungeonRoomType() === 'boss') { dungeonBossKilled(); return; }
      dungeonAdvance();
      return;
    }
    // 살아있는 몬스터(최대 2마리) 반격 + 가시 반사
    const attackers = alive.slice(0, 2);
    let taken = 0;
    for (const a of attackers) taken += a.dmg * (0.5 + Math.random() * 0.4);
    taken *= (1 - playerDefensePct(dungeonRun.playerHp <= dungeonRun.maxPlayerHp * 0.3)) * ((dungeonRun.cls && dungeonRun.cls.dmgTakenMul) || 1);   // 탱크: 받는 피해 감소
    const thorns = enchThornsPct();
    if (thorns > 0) { attackers[0].hp = Math.max(0, attackers[0].hp - taken * thorns); }
    dungeonRun.playerHp = Math.max(0, dungeonRun.playerHp - taken);
    if (dungeonRun.playerHp <= 0) {
      P.dungeonBest[dungeonRun.floor] = gradeMax(P.dungeonBest[dungeonRun.floor], 'F');
      toastFn('던전에서 전멸했어요... (등급 F)', false);
      if (dungeonRun.party && net()) net().partyEnd({ floor: dungeonRun.floor, grade: 'F' });
      saveNow(); dungeonRun = null;
    } else partySync();
    renderZone();
  }
  function dungeonBossKilled() {
    const fd = dungeonFloorDef(dungeonRun.floor);
    dungeonRun.score += D().DUNGEON_ROOM_SCORE.combat;
    const grade = dungeonGrade(dungeonRun.score);
    P.dungeonBest[dungeonRun.floor] = gradeMax(P.dungeonBest[dungeonRun.floor], grade);
    addItem('dungeon_essence', fd.essenceReward);
    const itemKey = fd.lootTable[Math.floor(Math.random() * fd.lootTable.length)];
    addItem(itemKey, 1);
    addSkillXp('combat', Math.round(fd.essenceReward * enchXpMul() * 10));
    let bonusMsg = '';
    if (Math.random() < 0.40) {
      const bonus = randomEquipDrop(Math.min(6, dungeonRun.floor));
      if (bonus) bonusMsg = ` + 🎁 ${bonus.name}`;
    }
    toastFn(`🏆 ${fd.bossName} 처치! 등급 ${grade}, 던전 정수 +${fd.essenceReward}, 전리품: ${itemName(itemKey)}${bonusMsg}`, true);
    if (dungeonRun.party && net()) net().partyEnd({ floor: dungeonRun.floor, grade });
    saveNow(); dungeonRun = null;
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

  /* ---------------- 3D 인월드 채집/낚시/전투 브리지(economy3d.js가 호출) ---------------- */
  // 실제 스카이블럭 감성의 자원별 스킬 XP(블록 1개/1회 기준)
  const RES_XP = { stone: 1, coal: 5, iron: 5, gold: 6, lapis: 7, redstone: 7, diamond: 10, emerald: 11, obsidian: 20,
    wheat: 4, carrot: 4, potato: 4, pumpkin: 5, melon: 5, sugarcane: 4,
    oaklog: 6, birchlog: 6, sprucelog: 7, apple: 4,
    rawfish: 25, salmon: 28, clownfish: 40, pufferfish: 32, prismarine: 30, sponge: 45, clay: 20 };
  function resSkill(key) { for (const cat of D().COLLECTIONS) if (cat.resources.some(r => r.key === key)) return cat.key === 'husbandry' ? 'farming' : cat.key; return 'mining'; }
  let _gatherSaveN = 0;
  function gatherBlock3d(resKey, family) {
    if (!P) return 0;
    const mul = bestToolMul(family || 'pickaxe');
    let n = Math.max(1, Math.floor(mul) + (Math.random() < (mul % 1) ? 1 : 0));
    const sk = resSkill(resKey);
    const zone = { mining: 'mine', farming: 'farm', foraging: 'forest', fishing: 'dock' }[sk];
    const dbl = zone ? (talismanStats().doublePct[zone] || 0) : 0;
    if (dbl > 0 && Math.random() * 100 < dbl) n *= 2;
    const fortune = enchantLvl('tool', 'fortune') * 20;
    if (fortune > 0 && Math.random() * 100 < fortune) n += Math.max(1, Math.floor(n * 0.5));   // 행운: 추가 드롭
    // V20-G: 채광 계열이면 채광 포춘 추가 드롭 + 산의 심장 가루 적립
    if (sk === 'mining') {
      const mf = playerStats().miningFortune || 0;
      n += Math.floor(mf / 100); if (Math.random() * 100 < (mf % 100)) n += 1;
      hotmAwardPowder(n);
    }
    addItem(resKey, n); addCollection(resKey, n);
    addSkillXp(sk === 'combat' ? 'combat' : sk, RES_XP[resKey] || 2);
    stat('blocksMined');   // V11 카운터(전 채집 공통) + 계열별
    if (sk === 'foraging') stat('treesChopped');
    else if (sk === 'farming') stat('cropsHarvested');
    if (++_gatherSaveN % 10 === 0) saveNow(); else saveLocal();
    return n;
  }
  function fishCatch3d() {
    if (!P) return null;
    const table = D().GATHER_TABLE.dock;
    const totalW = table.drops.reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * totalW, pick = table.drops[0];
    for (const d of table.drops) { if (r < d.weight) { pick = d; break; } r -= d.weight; }
    const qty = Math.max(1, Math.round((pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1))) * bestToolMul('rod')));
    addItem(pick.key, qty); addCollection(pick.key, qty);
    addSkillXp('fishing', RES_XP[pick.key] || 20);
    stat('fishCaught');   // V11
    let extra = null;
    const roll = Math.random();
    const fishLv = skillLevel('fishing');
    if (roll < 0.012 * (1 + traitSum('lucky') / 100)) {   // V11: 낚시 전용 장비 풀
      const eq = equipDropFromSrc(fishLv >= 15 && Math.random() < 0.3 ? 'deep_fishing' : 'fishing', Math.min(8, 2 + Math.floor(fishLv / 4)));
      if (eq) extra = { kind: 'equip', name: eq.name };
    }
    else if (roll < 0.05) { const coins = 100 + Math.floor(Math.random() * 400); addGold(coins); extra = { kind: 'treasure', coins }; }
    else if (roll < 0.17) extra = { kind: 'seaCreature', deep: fishLv >= 15 && Math.random() < 0.25 };   // V11: 낚시 Lv15+ 심해 생물
    saveLocal();
    return { key: pick.key, name: itemName(pick.key), n: qty, extra };
  }
  // 3D 전투: 한 타격의 피해 계산(크리/조건부 인챈트/흡혈 포함)
  function attackMob3d(ctx) {
    const crit = playerCritRoll();
    let dmg = playerAttackPower() * crit;
    dmg *= enchCondMul({ hitIdx: ctx.hitIdx || 0, targetHp: ctx.hp, targetMaxHp: ctx.maxHp, isBoss: !!ctx.isBoss, slayerKey: ctx.slayerKey || null });
    dmg *= traitCtxMul(ctx);                              // V11: 특성 문맥 배율(처형/연격/특효/분노...)
    dmg += traitSum('shred');                             // V11: 파쇄(고정 추가 피해)
    let ds = false;
    if (Math.random() * 100 < traitSum('double_strike')) { dmg *= 2; ds = true; }   // V11: 이도류
    statMax('maxHit', Math.round(dmg));
    const heal = enchHitHeal(dmg) + dmg * traitSum('lifesteal') / 100;   // V11: 흡혈
    return { dmg, crit: crit > 1 || ds, heal };
  }
  function mobKilled3d(mob) {
    if (!P) return 0;
    const msgs = [];
    const goldMul = 1 + (traitSum('gold_rush') + traitSum('greed') + setStat('goldPct')) / 100;   // V11 특성
    const xpMul = 1 + (traitSum('wisdom') + traitSum('scholar') + setStat('xpPct')) / 100;
    const rewardMul = mob.rewardMul || 1;                       // V11: 필드 난이도/주간 보스 배율
    const coins = Math.round((mob.coins || 0) * enchCoinMul() * goldMul * rewardMul);
    if (coins) addGold(coins);
    const xpGain = Math.round((mob.xp || 5) * enchXpMul() * xpMul * rewardMul);
    addSkillXp('combat', xpGain);
    stat('kills');
    if (mob.boss) stat('bossKills');
    // V11: 파티 근접 사냥 XP 공유(절반)
    if (window.econNet && window.econNet.party && window.econNet.party() && window.econNet.partySendXp) window.econNet.partySendXp(Math.round(xpGain * 0.5));
    const lucky = traitSum('lucky');                            // V11: 행운(희귀 드롭 확률 증가)
    const lootLv = enchantLvl('weapon', 'looting');
    for (const d of mob.drops || []) {
      if (d.chance != null && Math.random() > d.chance * (1 + lootLv * 0.15) * (1 + lucky / 100)) continue;   // 약탈: 희귀 드롭 확률도 +15%/레벨
      // V9: 기본 드롭은 약탈 0 기준 0~n개 랜덤(마인크래프트식), 약탈 레벨당 최대 +1
      let n = d.chance != null ? (d.n || 1) : Math.floor(Math.random() * ((d.n || 1) + 1 + lootLv));
      if (n <= 0) continue;
      addItem(d.key, n); addCollection(d.key, n);
      if ((d.chance == null ? 1 : d.chance) <= 0.25) msgs.push(`✨ ${itemName(d.key)} ×${n}`);
    }
    if (Math.random() < 0.03 * (1 + traitSum('lucky') / 100)) {   // 희귀: 드롭 전용 장비(V11: field 풀 우선)
      const bonus = equipDropFromSrc('field', Math.min(8, (mob.tierCap == null ? 2 : mob.tierCap) + (mob.rewardMul >= 3 ? 2 : 0))) || randomEquipDrop(Math.min(6, mob.tierCap == null ? 2 : mob.tierCap));
      if (bonus) msgs.push(`🎁 ${bonus.name}`);
    }
    // V11: 미니보스/지옥 보스 전용 풀
    if (mob.equipSrc && Math.random() < (mob.equipSrcChance || 0.25)) {
      const sp = equipDropFromSrc(mob.equipSrc, 8);
      if (sp) msgs.push(`🌟 ${sp.name}`);
    }
    // V7: 몹별 인챈트북 드롭(몹마다 다른 북 — 정예는 3배 확률)
    if (mob.books && mob.books.length && Math.random() < (mob.elite ? 0.06 : 0.02)) {
      const bk = mob.books[Math.floor(Math.random() * mob.books.length)];
      addItem(`enchant_book_${bk}`, 1);
      const bdef = enchantDef(bk);
      msgs.push(`📖 인챈트북: ${bdef ? bdef.name : bk}!`);
    }
    if (msgs.length) toastFn(`${mob.name} 처치! ${msgs.join(' · ')}`, true);
    // V9: 도감(베스티어리) 기록 + 슬레이어 퀘스트 게이지
    if (mob.type) {
      if (!P.bestiary) P.bestiary = {};
      P.bestiary[mob.type] = (P.bestiary[mob.type] || 0) + 1;
      slayerQuestProgress(mob.type);
    }
    saveLocal();
    return coins;
  }
  // 도감 마일스톤: 종별 처치 100마리당 전투 피해 +0.5%(최대 +20%)
  function bestiaryBonusPct() {
    if (!P || !P.bestiary) return 0;
    let m = 0;
    for (const k in P.bestiary) m += Math.floor(P.bestiary[k] / 100);
    return Math.min(20, m * 0.5);
  }
  function playerDied3d() {
    if (!P) return;
    stat('deaths');   // V11
    const loss = P.gold < 10000 ? 0 : Math.floor(P.gold * 0.05);   // V10: 1만G 미만 면제
    if (loss > 0) { addGold(-loss); toastFn(`💀 사망... 골드 ${fmtGold(loss)}을 잃고 스폰으로 돌아갑니다`, false); }
    else toastFn('💀 사망... 스폰으로 돌아갑니다', false);
    saveNow();
  }

  // 3D 카타콤 완주 보상(economy3d.js가 보스 처치 시 호출) — 점수/등급/정수/전리품
  function dungeon3dComplete(floor, stats, master) {
    const fd = dungeonFloorDef(floor); if (!fd || !P) return null;
    let score = 230 + Math.max(0, 120 - Math.floor((stats.timeSec || 0) / 5)) - (stats.deaths || 0) * 60 + (stats.kills || 0) * 2;
    score = Math.max(10, score);
    const grade = dungeonGrade(score);
    P.dungeonBest[floor] = gradeMax(P.dungeonBest[floor], grade);
    const rewardMul = master ? D().MASTER_MODE.rewardMul : 1;
    if (master) P.dungeonMasterBest = Object.assign(P.dungeonMasterBest || {}, { [floor]: gradeMax((P.dungeonMasterBest || {})[floor], grade) });
    addItem('dungeon_essence', fd.essenceReward * rewardMul);
    const itemKey = fd.lootTable[Math.floor(Math.random() * fd.lootTable.length)];
    addItem(itemKey, 1);
    addSkillXp('combat', Math.round(fd.essenceReward * rewardMul * enchXpMul() * 10));
    stat('dungeonClears'); stat('bossKills');   // V11
    let bonusMsg = '';
    if (Math.random() < (master || fd.hell ? 0.8 : 0.40)) {
      const src = fd.hell ? 'dungeon_hell' : 'dungeon_f' + floor;   // V11: 층별 전용 장비 풀
      const bonus = equipDropFromSrc(src, null) || randomEquipDrop(Math.min(6, Math.max(1, floor)));
      if (bonus) bonusMsg = ` + 🎁 ${bonus.name}`;
    }
    toastFn(`🏆 ${master ? '☠M' + floor + ' ' : ''}${fd.bossName} 처치! 등급 ${grade} (점수 ${score}) · 정수 +${fd.essenceReward * rewardMul} · ${itemName(itemKey)}${bonusMsg}`, true);
    saveNow(); renderZone();
    return grade;
  }

  /* ================ V11 시스템: 핫포북/분해/잠금/핀/장비점수/업적/일퀘/난이도/주간/아레나 ================ */
  function applyHpb(itemKey) {
    const HB = D().HPB;
    const sd = shopDef(itemKey);
    if (!sd || (sd.category !== '무기' && sd.category !== '방어구')) { toastFn('핫 포테이토 북은 무기/방어구에만!', false); return false; }
    if (!hasItem(itemKey)) { toastFn('그 장비를 보유하고 있지 않아요', false); return false; }
    const cur = hpbOf(itemKey);
    const useFuming = cur >= HB.maxBooks;
    if (cur >= HB.fumingMax) { toastFn('이미 +15권 최대예요!', false); return false; }
    const book = useFuming ? 'fuming_potato_book' : 'hot_potato_book';
    if (!hasItem(book)) { toastFn(`${itemName(book)}이 필요해요 (${useFuming ? '11권째부터는 퓨밍' : '드롭/제작'})`, false); return false; }
    removeItem(book, 1);
    if (!P.hpb) P.hpb = {};
    P.hpb[itemKey] = cur + 1;
    const isW = sd.category === '무기';
    toastFn(`🥔 ${sd.name} +${cur + 1}권! (${isW ? `공격 +${HB.weaponDmgPerBook}` : `방어 +${HB.armorDefPerBook}·체력 +${HB.armorHpPerBook}`})`, true);
    saveNow(); renderZone(); return true;
  }
  function salvageItem(key) {
    const sd = shopDef(key);
    if (!sd || (sd.category !== '무기' && sd.category !== '방어구')) { toastFn('무기/방어구만 분해할 수 있어요', false); return; }
    if ((P.locked || {})[key]) { toastFn('🔒 잠긴 장비예요', false); return; }
    if (!removeItem(key, 1)) { toastFn('보유하고 있지 않아요', false); return; }
    const SV = D().SALVAGE;
    const ti = Math.max(0, D().ITEM_TIERS.findIndex(t => t.key === sd.tierKey));
    const ess = SV.essenceByTier[ti] || 1;
    addItem('dungeon_essence', ess);
    let msg = `⚒️ ${sd.name} 분해 → 던전 정수 ×${ess}`;
    if (Math.random() < SV.bonusChance) { addItem(SV.bonusItem, 1); msg += ` + ${itemName(SV.bonusItem)}`; }
    toastFn(msg, true);
    saveNow(); renderZone();
  }
  function toggleLock(key) {
    if (!P.locked) P.locked = {};
    if (P.locked[key]) delete P.locked[key]; else P.locked[key] = 1;
    toastFn(P.locked[key] ? `🔒 ${itemName(key)} 잠금 — 판매/분해 방지` : `🔓 ${itemName(key)} 잠금 해제`, true);
    saveNow(); renderZone();
  }
  function togglePin(key) {
    const sd = shopDef(key); if (!sd || !sd.slot) { toastFn('장착 가능한 장비가 아니에요', false); return; }
    if (!P.equipPin) P.equipPin = {};
    if (P.equipPin[sd.slot] === key) { delete P.equipPin[sd.slot]; toastFn(`📌 해제 — ${sd.slot} 슬롯 자동 최적 장착으로 복귀`, true); }
    else { P.equipPin[sd.slot] = key; toastFn(`📌 ${sd.name} 고정 장착!`, true); }
    bumpInv(); saveNow(); renderZone();
  }
  function gearScore() {
    let sc = 0;
    for (const sl of EQUIP_SLOTS) {
      const p = equippedPiece(sl); if (!p) continue;
      sc += (p.dmg != null ? p.dmg * (sl === 'bow' ? 0.5 : 1) : (p.defense || 0) * 2 + (p.hp || 0) * 0.5);
      sc += (p.traits || []).length * 8 + hpbOf(p.key) * 3;
      sc += (P.starForce[sl] || 0) * 5;
      if (P.reforgeSlots[sl]) sc += 12;
    }
    sc += activeSetBonuses().length * 60;
    return Math.round(sc);
  }
  function equipLogCount() { return Object.keys(P.equipLog || {}).length; }
  function equipTotalCount() { const E = D().EQUIPMENT; return E.weapons.length + E.armor.length; }
  // ---- 업적: statValue 기반 자동 달성 ----
  function statValue(k) {
    const st = P.stats || {};
    switch (k) {
      case 'equipLog': return equipLogCount();
      case 'fairySouls': return (P.fairySouls || []).length;
      case 'minionSlots': return P.maxMinionSlots || 0;
      case 'combatLv': return skillLevel('combat');
      case 'starMax': return Math.max.apply(null, EQUIP_SLOTS.map(sl => P.starForce[sl] || 0));
      default: return st[k] || 0;
    }
  }
  let _achT = 0;
  function checkAchievements(force) {
    if (!P) return;
    const now = Date.now();
    if (!force && now - _achT < 3000) return;
    _achT = now;
    if (!P.ach) P.ach = {};
    for (const a of D().ACHIEVEMENTS) {
      if (P.ach[a.key]) continue;
      if (statValue(a.stat) >= a.gte) {
        P.ach[a.key] = 1;
        addGold(a.gold || 0);
        if (a.item) addItem(a.item, 1);
        toastFn(`🏅 업적 달성! [${a.name}] ${a.desc} — +${fmtGold(a.gold || 0)}${a.item ? ` + ${itemName(a.item)}` : ''}`, true);
      }
    }
  }
  // ---- 일일 퀘스트: 매일 3종(날짜 시드), 카운터 스냅샷 기반 ----
  function ensureDaily() {
    const day = todayStr();
    if (P.daily && P.daily.date === day) return;
    const rnd = seededRand('daily' + day);
    const pool = D().DAILY_QUESTS.slice();
    const list = [];
    for (let i = 0; i < 3 && pool.length; i++) list.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    P.daily = { date: day, list: list.map(q => ({ k: q.key, base: statValue(q.counter), claimed: false })) };
    saveNow();
  }
  function dailyQuestDef(k) { return D().DAILY_QUESTS.find(q => q.key === k); }
  function dailyProgress(entry) { const q = dailyQuestDef(entry.k); return Math.min(q.goal, statValue(q.counter) - entry.base); }
  function claimDaily(idx) {
    ensureDaily();
    const e = P.daily.list[idx]; if (!e || e.claimed) return;
    const q = dailyQuestDef(e.k);
    if (dailyProgress(e) < q.goal) { toastFn('아직 목표에 도달하지 못했어요', false); return; }
    e.claimed = true;
    addGold(q.gold); stat('questsDone');
    toastFn(`📜 일일 퀘스트 [${q.name}] 완료! +${fmtGold(q.gold)}`, true);
    checkAchievements(true); saveNow(); renderZone();
  }
  /* ---------------- V13-B: 위치 기반 퀘스트 ----------------
     퀘스트 진행도는 일일퀘스트와 같은 "카운터 스냅샷" 방식.
     수락 시 metric을 base로 저장 → 진행도 = 현재 metric - base (goal 상한). */
  function questDef(key) { return (D().QUESTS || []).find(q => q.key === key); }
  function questNpcDef(npcKey) { return (D().QUEST_NPCS || []).find(n => n.key === npcKey); }
  function questMetric(obj) {
    switch (obj.type) {
      case 'gather': return (P.collections[obj.target] || 0);
      case 'kill': return statValue('kills');
      case 'killBoss': return statValue('bossKills');
      case 'mine': return statValue('blocksMined');
      case 'chop': return statValue('treesChopped');
      case 'farm': return statValue('cropsHarvested');
      case 'fish': return statValue('fishCaught');
      case 'craft': return statValue('itemsCrafted');
      case 'place': return statValue('blocksPlaced');
      case 'gold': return statValue('goldEarned');
      case 'souls': return statValue('fairySouls');
      case 'talk': return 0;   // 대화형: 수락 즉시 목표 도달로 취급
      default: return 0;
    }
  }
  function questAvailable(key) {
    const q = questDef(key); if (!q) return false;
    if (P.quests.done[key] || P.quests.active[key]) return false;
    if (q.req && !P.quests.done[q.req]) return false;   // 선행 퀘스트 미완료
    return true;
  }
  function questProgress(key) {
    const q = questDef(key); const a = P.quests.active[key]; if (!q || !a) return 0;
    if (q.objective.type === 'talk') return q.objective.count;   // 대화형은 항상 완료 상태
    return Math.min(q.objective.count, questMetric(q.objective) - (a.base || 0));
  }
  function acceptQuest(key) {
    if (!questAvailable(key)) return false;
    const q = questDef(key);
    P.quests.active[key] = { base: questMetric(q.objective), at: Date.now() };
    P.quests.seen[key] = 1;
    toastFn(`📜 퀘스트 수락: [${q.name}] — ${q.objective.label} 0/${q.objective.count}`, true);
    saveNow(); if (typeof renderZone === 'function') renderZone();
    tryCompleteQuest(key);   // 대화형은 즉시 완료
    return true;
  }
  function grantQuestReward(q) {
    const rw = q.reward || {};
    if (rw.gold) addGold(rw.gold);
    if (rw.xp && rw.xp.skill) addSkillXp(rw.xp.skill, rw.xp.amt || 0);
    if (Array.isArray(rw.items)) rw.items.forEach(it => addItem(it.key, it.n || 1));
  }
  function tryCompleteQuest(key) {
    const q = questDef(key); const a = P.quests.active[key]; if (!q || !a) return false;
    if (questProgress(key) < q.objective.count) return false;
    delete P.quests.active[key];
    P.quests.done[key] = 1;
    grantQuestReward(q);
    stat('questsDone');
    const rw = q.reward || {};
    const rewardTxt = [rw.gold ? `+${fmtGold(rw.gold)}` : '', rw.xp ? `${skillName(rw.xp.skill)} XP +${rw.xp.amt}` : '',
      (rw.items || []).map(it => itemName(it.key) + (it.n > 1 ? `×${it.n}` : '')).join(', ')].filter(Boolean).join(' · ');
    toastFn(`✅ 퀘스트 완료: [${q.name}] 보상 ${rewardTxt}`, true);
    checkAchievements(true); saveNow(); if (typeof renderZone === 'function') renderZone();
    return true;
  }
  // 진행 중인 모든 퀘스트를 점검(채집/처치 등 카운터가 오른 뒤 호출)
  let _questTickAt = 0;
  function tickQuests(force) {
    if (!P || !P.quests) return;
    const now = Date.now(); if (!force && now - _questTickAt < 700) return; _questTickAt = now;
    for (const key in P.quests.active) tryCompleteQuest(key);
  }
  function skillName(k) { const s = (D().SKILLS || []).find(x => x.key === k); return s ? s.name : k; }
  // NPC 반경 안의 퀘스트 상태를 HUD용으로 반환(3D가 매 프레임 위치를 넘겨줌)
  function questHudData(world, x, z) {
    if (!P || !P.quests) return null;
    tickQuests(false);
    const npcs = (D().QUEST_NPCS || []).filter(n => (n.world || 'hub') === world);
    let bestNpc = null, bestD = Infinity;
    for (const n of npcs) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d <= (n.region || 20) && d < bestD) { bestD = d; bestNpc = n; }
    }
    // 위치와 무관하게 진행 중인 퀘스트는 항상 우측에 표시(플레이어가 목표 지역으로 이동해야 하므로)
    const activeList = Object.keys(P.quests.active).map(key => {
      const q = questDef(key); if (!q) return null;
      return { key, name: q.name, label: q.objective.label, cur: questProgress(key), goal: q.objective.count, giver: (questNpcDef(q.giver) || {}).name || '' };
    }).filter(Boolean);
    let offer = null;
    if (bestNpc) {
      // 이 NPC가 줄 수 있는(선행 완료·미수락·미완료) 첫 퀘스트
      const giveable = (D().QUESTS || []).filter(q => q.giver === bestNpc.key && questAvailable(q.key));
      if (giveable.length) { const q = giveable[0]; offer = { npc: bestNpc.key, npcName: bestNpc.name, key: q.key, name: q.name, story: q.story, label: q.objective.label, goal: q.objective.count }; }
    }
    // 안내(가이드): 근처에 제안이 없고 진행 중 퀘스트도 없을 때, 이 월드에서 받을 수 있는 퀘스트의 NPC로 유도
    let guide = null;
    if (!offer && !activeList.length) {
      for (const n of npcs) {
        const giveable = (D().QUESTS || []).filter(q => q.giver === n.key && questAvailable(q.key));
        if (giveable.length) { guide = { npcName: n.name, x: n.x, z: n.z, dist: Math.round(Math.hypot(n.x - x, n.z - z)) }; break; }
      }
    }
    return { npc: bestNpc ? { key: bestNpc.key, name: bestNpc.name } : null, offer, active: activeList, guide };
  }
  // NPC 대화(E) → 그 NPC의 첫 수락 가능 퀘스트를 받음. 없으면 안내.
  function talkQuestNpc(npcKey) {
    const npc = questNpcDef(npcKey); if (!npc) return false;
    const giveable = (D().QUESTS || []).filter(q => q.giver === npcKey && questAvailable(q.key));
    if (giveable.length) { acceptQuest(giveable[0].key); return true; }
    // 진행 중인 퀘스트가 있으면 진행도 안내
    const mine = (D().QUESTS || []).filter(q => q.giver === npcKey && P.quests.active[q.key]);
    if (mine.length) { const q = mine[0]; toastFn(`${npc.name}: "${q.name} — ${q.objective.label} ${questProgress(q.key)}/${q.objective.count}"`, true); return true; }
    toastFn(`${npc.name}: "지금은 부탁할 일이 없구먼. 나중에 또 오게!"`, true);
    return true;
  }

  // ---- 필드 난이도(쉬움/일반/영웅/지옥) ----
  function setFieldDiff(key) {
    const fd = D().FIELD_DIFF[key]; if (!fd) return;
    if (skillLevel('combat') < fd.req) { toastFn(`${fd.name} 난이도는 전투 스킬 ${fd.req}레벨부터!`, false); return; }
    P.fieldDiff = key;
    toastFn(`${fd.emoji} 필드 난이도: ${fd.name} — 몹 강함 ×${fd.hpMul}, 보상 ×${fd.rewardMul}`, true);
    saveNow(); renderZone();
  }
  function fieldDiffDef() { return D().FIELD_DIFF[P.fieldDiff || 'normal'] || D().FIELD_DIFF.normal; }
  // ---- 주간 순환 강화 보스(ISO 주차 → 계열) ----
  function weeklyFamily() { return D().WEEKLY.families[Math.floor(Date.now() / 604800000) % D().WEEKLY.families.length]; }
  // ---- 아레나(콜로세움 웨이브) ----
  function arenaDiffDef(k) { return D().ARENA.difficulties.find(d => d.key === k); }
  function startArena(diffKey) {
    const ad = arenaDiffDef(diffKey); if (!ad) return;
    if (skillLevel('combat') < ad.req) { toastFn(`${ad.name}은(는) 전투 스킬 ${ad.req}레벨부터!`, false); return; }
    if (typeof window.economy3dArenaStart !== 'function') { toastFn('3D 월드에서만 시작할 수 있어요', false); return; }
    if (!window.economy3dArenaStart(diffKey)) return;
    toastFn(`🏟️ ${ad.name} 개막! 10웨이브를 버텨내세요!`, true);
    if (typeof window.economy3dClosePanel === 'function') window.economy3dClosePanel();
  }
  function arenaWaveCleared(diffKey, wave) {
    const ad = arenaDiffDef(diffKey); if (!ad || !P) return;
    addGold(ad.waveGold); stat('arenaWaves');
    P.arenaBest[diffKey] = Math.max(P.arenaBest[diffKey] || 0, wave);
    toastFn(`🏟️ 웨이브 ${wave}/${D().ARENA.waves} 클리어! +${fmtGold(ad.waveGold)}`, true);
    checkAchievements(); saveNow();
  }
  function arenaComplete(diffKey) {
    const ad = arenaDiffDef(diffKey); if (!ad || !P) return;
    addGold(ad.finalGold); stat('bossKills');
    let msg = `🏆 ${ad.name} 완전 제패!! +${fmtGold(ad.finalGold)}`;
    if (Math.random() < D().ARENA.equipChance) { const eq = equipDropFromSrc('arena', null); if (eq) msg += ` + 🎁 ${eq.name}`; }
    toastFn(msg, true);
    if (window.econNet && window.econNet.announce) window.econNet.announce(`🏟️ ${ad.name} 제패!`);
    saveNow(); renderZone();
  }
  /* ---------------- V9 물약 버프(3분 지속 — 스탯에 합산) ---------------- */
  const POTION_FX = { potion_strength: { stat: 'strength', v: 25 }, potion_speed: { stat: 'speed', v: 20 }, potion_healing: { stat: 'hp', v: 40 } };
  function usePotion(key) {
    const fx = POTION_FX[key]; if (!fx) return false;
    if (!hasItem(key)) { toastFn('물약이 없어요(조합으로 제작)', false); return false; }
    removeItem(key, 1);
    if (!P.buffs) P.buffs = {};
    P.buffs[key] = Date.now() + 300000;   // V10: 5분
    toastFn(`🧪 ${itemName(key)} 사용! (5분)`, true);
    saveNow(); renderZone(); return true;
  }
  function buffBonus(stat) {
    if (!P || !P.buffs) return 0;
    let v = 0;
    for (const k in P.buffs) { if (P.buffs[k] > Date.now() && POTION_FX[k] && POTION_FX[k].stat === stat) v += POTION_FX[k].v; }
    return v;
  }

  /* ---------------- 파티 던전(호스트 권위) — economy-net.js 연결부 ---------------- */
  function partySnapshot() {
    if (!dungeonRun) return null;
    return {
      floor: dungeonRun.floor, roomIdx: dungeonRun.roomIdx, rooms: dungeonRun.rooms, score: dungeonRun.score,
      playerHp: dungeonRun.playerHp, maxPlayerHp: dungeonRun.maxPlayerHp,
      mobs: dungeonRun.mobs.map(m => ({ name: m.name, hp: m.hp, maxHp: m.maxHp, isBoss: !!m.isBoss })),
    };
  }
  function partySync() {
    const n = net(); if (!n) return;
    const pt = n.party(); if (!pt || pt.role !== 'host' || pt.stage !== 'active') return;
    if (dungeonRun) n.partyBroadcastState(partySnapshot());
  }
  function partyStartDungeon(floor) {
    if (dungeonRun || activeCombat) return;
    // 3D 카타콤 협동(같은 던전 월드에서 함께 전투) — 3D 미가동 시 패널 웨이브 폴백
    if (typeof window.economy3dDungeon === 'function' && window.economy3dDungeon(floor)) {
      const n = net(); if (n) n.partyD3Start(floor);
      toastFn('⚔️ 파티 3D 던전 시작! 파티원이 같은 카타콤에 합류해요', true);
      return;
    }
    startDungeon(floor);   // canEnterFloor 검사 포함
    if (!dungeonRun) { const n = net(); if (n) n.partyLeave(); return; }
    dungeonRun.party = true;
    toastFn('⚔️ 파티 던전 시작! 파티원의 공격이 실시간으로 함께 반영돼요', true);
    partySync();
  }
  // 게스트가 보낸 공격을 호스트 던전에 적용(게스트의 공격력 그대로 — 각자 장비/인챈트가 의미 있음)
  function partyRemoteAttack(atk) {
    if (!dungeonRun) return;
    const target = dungeonRun.mobs.find(m => m.hp > 0); if (!target) return;
    target.hp = Math.max(0, target.hp - Math.max(0, atk));
    if (target.hp <= 0) toastFn('⚔️ 파티원이 몬스터를 처치했어요!', true);
    const alive = dungeonRun.mobs.filter(m => m.hp > 0);
    if (!alive.length) {
      if (dungeonRoomType() === 'boss') { dungeonBossKilled(); return; }
      dungeonAdvance(); return;
    }
    partySync(); renderZone();
  }
  function partyGuestReward(result) {
    if (!P) return;
    if (!result || result.grade === 'F') { toastFn('파티 던전에서 전멸했어요...', false); renderZone(); return; }
    const fd = dungeonFloorDef(result.floor || 1); if (!fd) return;
    addItem('dungeon_essence', fd.essenceReward);
    addSkillXp('combat', Math.round(fd.essenceReward * enchXpMul() * 10));
    P.dungeonBest[result.floor] = gradeMax(P.dungeonBest[result.floor], result.grade);
    let bonusMsg = '';
    if (Math.random() < 0.40) {
      const bonus = randomEquipDrop(Math.min(6, result.floor || 1));
      if (bonus) bonusMsg = ` + 🎁 ${bonus.name}`;
    }
    toastFn(`🏆 파티 던전 클리어! 등급 ${result.grade} · 던전 정수 +${fd.essenceReward}${bonusMsg}`, true);
    saveNow(); renderZone();
  }
  /* ---- 거래 적용(각자 자기 세이브만 변경 — 양측 확정 후 economy-net.js가 호출) ---- */
  function tradeCanGive(items, gold) {
    if (!P) return false;
    if ((gold || 0) > P.gold) return false;
    for (const it of items || []) if ((P.inv[it.key] || 0) < it.n) return false;
    return true;
  }
  function tradeApply(give, get) {
    if (!tradeCanGive(give.items, give.gold)) { toastFn('거래 실패: 내 보유가 부족해요', false); return false; }
    for (const it of give.items || []) removeItem(it.key, it.n);
    addGold(-(give.gold || 0));
    for (const it of get.items || []) addItem(it.key, it.n);
    addGold(get.gold || 0);
    saveNow(); renderZone(); return true;
  }

  /* ---------------- 전투(슬레이어 보스전 — 처형/흡혈/가시/활력 인챈트 반영) ---------------- */
  function combatAttack() {
    if (!activeCombat) return;
    const c = activeCombat;
    let dmg = playerAttackPower() * playerCritRoll();
    dmg *= enchCondMul({ hitIdx: c._hits, targetHp: c.hp, targetMaxHp: c.maxHp, slayerKey: c.slayerKey });
    c._hits++;
    c.hp = Math.max(0, c.hp - dmg);
    const heal = enchHitHeal(dmg);   // 흡혈+활력+생명강탈
    c.playerHp = Math.min(c.maxPlayerHp, c.playerHp + heal);
    if (c.hp <= 0) { const onWin = c.onWin; activeCombat = null; onWin(); renderZone(); return; }
    let dmgTaken = c.dmg * (0.7 + Math.random() * 0.6) * (1 - playerDefensePct(c.playerHp <= c.maxPlayerHp * 0.3));
    const thorns = enchThornsPct();   // 가시 반사
    if (thorns > 0) c.hp = Math.max(1, c.hp - dmgTaken * thorns);
    c.playerHp = Math.max(0, c.playerHp - dmgTaken);
    if (c.playerHp <= 0) { const onLose = c.onLose; activeCombat = null; onLose(); renderZone(); return; }
    renderZone();
  }
  function combatFlee() {
    if (dungeonRun && dungeonRun.party && net()) net().partyLeave();   // 호스트 이탈 = 파티 해산
    activeCombat = null; dungeonRun = null; renderZone();
  }

  /* ---------------- 리포지(실제 스카이블럭식: 무작위 명명 리포지 + 스톤 확정 리포지) ---------------- */
  function reforgeSlotCost(slot) {
    const eq = equippedPiece(slot);   // V11: 6슬롯 공통
    if (!eq) return null;
    const tierDef = D().ITEM_TIERS.find(t => t.key === eq.tierKey) || D().ITEM_TIERS[0];
    return tierDef.reforgeCost;
  }
  function reforgePoolType(slot) { return slot === 'weapon' || slot === 'bow' ? 'weapon' : 'armor'; }
  function reforgeSlot(slot) {
    const cost = reforgeSlotCost(slot);
    if (cost == null) { toastFn('장착 중인 장비가 없어요', false); return; }
    if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
    addGold(-cost);
    const pool = D().REFORGES[reforgePoolType(slot)].filter(r => !r.stone);   // V17: 스톤 전용 리포지는 무작위 풀 제외
    const pick = pool[Math.floor(Math.random() * pool.length)];
    P.reforgeSlots[slot] = Object.assign({}, pick);
    toastFn(`리포지 결과: [${pick.name}] ${SLOT_NAMES[slot] || slot}!`, true);
    saveNow(); renderZone();
  }
  function reforgePremium(slot) {
    if (!hasItem('reforge_stone_rare')) { toastFn('리포지 스톤(희귀)이 필요해요', false); return; }
    const cost = reforgeSlotCost(slot);
    if (cost == null) { toastFn('장착 중인 장비가 없어요', false); return; }
    if (P.gold < cost * 2) { toastFn(`스톤 리포지는 ${fmtGold(cost * 2)}이 필요해요`, false); return; }
    removeItem('reforge_stone_rare', 1); addGold(-cost * 2);
    const pick = D().REFORGES.premium[reforgePoolType(slot)];
    P.reforgeSlots[slot] = Object.assign({}, pick);
    toastFn(`💎 스톤 리포지! [${pick.name}] 확정 부여!`, true);
    saveNow(); renderZone();
  }
  // V20-D: +α 최상급 리포지 — 신룡의 룬석(F11 드롭) 소모, 신룡/천상 테마 커스텀
  function reforgeApex(slot) {
    if (!hasItem('reforge_stone_apex')) { toastFn('신룡의 룬석이 필요해요 (최종층 F11 드롭)', false); return; }
    const cost = reforgeSlotCost(slot);
    if (cost == null) { toastFn('장착 중인 장비가 없어요', false); return; }
    if (P.gold < cost * 3) { toastFn(`전설 리포지는 ${fmtGold(cost * 3)}이 필요해요`, false); return; }
    removeItem('reforge_stone_apex', 1); addGold(-cost * 3);
    const pick = D().REFORGES.premiumApex[reforgePoolType(slot)];
    P.reforgeSlots[slot] = Object.assign({}, pick);
    toastFn(`🐉 전설 리포지! [${pick.name}] 확정 부여!`, true);
    saveNow(); renderZone();
  }
  // (구버전 API 호환 — 기존 테스트/세이브의 개별 아이템 리포지 보너스도 계속 동작)
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
  function fmtGold(n) { return fmtNum(n) + 'G'; }
  function fmtNum(n) {   // V10: 컴팩트 표기(1.2M, 3.4k)
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k';
    return n.toLocaleString('ko-KR');
  }
  function tierColorByKey(tierKey) { return (D().ITEM_TIERS.find(t => t.key === tierKey) || {}).colorHex || '#fff'; }
  function tierNameByKey(tierKey) { return (D().ITEM_TIERS.find(t => t.key === tierKey) || {}).name || ''; }

  function screenHTML() {
    return `<section class="screen econ-screen" data-act-root="econ">
      <div class="econ-top">
        <div class="econ-gold">💰 ${P ? fmtGold(P.gold) : ''}</div>
        <button class="btn btn--ghost" data-act="backHome">✕</button>
      </div>
      <div id="econBody" class="econ-body"></div>
    </section>`;
  }

  function renderZone() {
    const body = document.getElementById('econBody'); if (!body) return;
    if (activeCombat) { body.innerHTML = combatHTML(); return; }
    if (dungeonRun) { body.innerHTML = dungeonRoomHTML(); return; }
    body.innerHTML = selfMenuHTML() + zoneBodyHTML(zone);
  }

  // 스카이블럭 메뉴(셀프 서비스): 스탯/컬렉션/인벤토리/펫/장신구/멀티 — 나머지는 해당 NPC를 직접 찾아가야 함
  const SELF_TABS = [['stats', '📊 스탯'], ['collections', '📚 컬렉션'], ['inv', '🎒 인벤토리'], ['pets', '🐾 펫'], ['talismans', '📿 장신구'], ['multi', '🌐 멀티']];
  function selfMenuHTML() {
    return `<div class="econ-zonenav">${SELF_TABS.map(([k, label]) => `<button class="econ-zonebtn ${zone === 'hub' && hubTab === k ? 'is-active' : ''}" data-act="econ_menu" data-key="${k}">${label}</button>`).join('')}
      <span class="muted" style="margin-left:auto">상점·은행·강화·인챈트 등은 마을의 해당 NPC에게!</span></div>`;
  }

  function zoneBodyHTML(z) {
    if (z === 'hub') return hubHTML();
    if (z === 'mine' || z === 'farm' || z === 'forest' || z === 'dock') return gatherZoneHTML(z);
    if (z === 'slayerden') return slayerZoneHTML();
    if (z === 'dungeonentrance') return dungeonZoneHTML();
    return '';
  }

  /* ---- 허브(서브탭: 상점/은행/미니언/펫/장신구/인챈트/리포지/특가/컬렉션/스탯) ---- */
  const HUB_TABS = [
    ['shop', '🛒 상점'], ['bank', '🏦 은행'], ['minions', '⚙️ 미니언'], ['pets', '🐾 펫'],
    ['talismans', '📿 장신구'], ['enchant', '✨ 인챈트'], ['star', '⭐ 강화'], ['reforge', '🔨 리포지'], ['hotm', '⛰️ 산의 심장'],
    ['craft', '⚒️ 제작'], ['bazaar', '🏪 바자회'], ['auction', '🏛️ 경매장'], ['deals', '🎪 특가'], ['collections', '📚 컬렉션'], ['halloffame', '🏆 명예의 전당'], ['stats', '📊 스탯'],
    ['multi', '🌐 멀티'],
  ];
  function iconImg(key) { return (typeof window.econIcon === 'function') ? `<img class="econ-icon" src="${window.econIcon(key)}" alt="">` : ''; }
  // 실제 스카이블럭식 아이템 로어(호버 툴팁): 이름 → 스탯 → 설명 → 등급 라인
  function itemLore(sdef) {
    if (!sdef) return '';
    const lines = [sdef.name];
    if (sdef.slot) lines.push(`[${SLOT_NAMES[sdef.slot] || sdef.slot}]${(P.equipPin || {})[sdef.slot] === sdef.key ? ' 📌 고정 장착' : ''}${(P.locked || {})[sdef.key] ? ' 🔒' : ''}`);
    if (sdef.dmg) lines.push(`공격력: +${hasItem(sdef.key) ? rolledStat(sdef.key, sdef.dmg) : sdef.dmg}${hpbOf(sdef.key) ? ` (🥔+${hpbOf(sdef.key) * D().HPB.weaponDmgPerBook})` : ''}`);
    if (sdef.defense) lines.push(`방어력: +${hasItem(sdef.key) ? rolledStat(sdef.key, sdef.defense) : sdef.defense}${hpbOf(sdef.key) ? ` (🥔+${hpbOf(sdef.key) * D().HPB.armorDefPerBook})` : ''}`);
    if (sdef.hp) lines.push(`체력: +${sdef.hp}`);
    // V11: 특성 라인(실동작 설명)
    if (sdef.traits && sdef.traits.length) {
      const T = D().TRAITS;
      for (const t of sdef.traits) { const td = T[t.k]; if (td) lines.push(`◈ ${td.n}: ${td.f.replace('{v}', t.v)}`); }
    }
    if (sdef.set && D().EQUIP_SETS[sdef.set]) {
      const sb = D().EQUIP_SETS[sdef.set];
      const cnt = ['helmet', 'chest', 'leggings', 'boots'].filter(sl => { const p = equippedPiece(sl); return p && p.set === sdef.set; }).length;
      lines.push(`✦ 세트: ${sb.name} (${cnt}/4) — ${sb.desc}`);
    }
    if (sdef.flavor) lines.push(`"${sdef.flavor}"`);
    // V11: 장착 중 장비와 비교(증감)
    if (sdef.slot) {
      const eq = equippedPiece(sdef.slot);
      if (eq && eq.key !== sdef.key) {
        const d = sdef.dmg != null ? (sdef.dmg - eq.dmg) : ((sdef.defense || 0) - (eq.defense || 0));
        lines.push(`장착 중(${eq.name}) 대비: ${d >= 0 ? '▲ +' : '▼ '}${d} ${sdef.dmg != null ? '공격' : '방어'}`);
      } else if (eq && eq.key === sdef.key) lines.push('✔ 장착 중');
    }
    const canUseHotbar = sdef.key && isPlaceableOrTool(sdef.key);
    if (canUseHotbar) lines.push('핫바 배정/프라이빗 섬 사용 가능');
    const d = shopItemDesc(sdef); if (d) lines.push(d);
    if (sdef.reqCombat) lines.push(`⚔ 요구 전투 레벨: ${sdef.reqCombat}`);
    for (const fam in D().TOOLS) {
      const t = D().TOOLS[fam].find(x => x.key === sdef.key);
      if (t) {
        const skillMap = { pickaxe: '채광', axe: '벌목', hoe: '농사', rod: '낚시' };
        lines.push(`채집 효율: ×${t.mul}`);
        if (t.req > 0) lines.push(`⛏ 요구 ${skillMap[fam] || fam} 레벨: ${t.req}`);
        break;
      }
    }
    if (sdef.sellPrice > 0) lines.push(`판매가: ${fmtGold(sdef.sellPrice)}`);
    if (sdef.tierKey) { const t = D().ITEM_TIERS.find(x => x.key === sdef.tierKey); if (t) lines.push(`◆ ${t.name.toUpperCase()}`); }
    else if (canUseHotbar) lines.push('◆ COMMON');
    return lines.join('\n');
  }
  function ttAttr(keyOrDef) {
    const sdef = typeof keyOrDef === 'string' ? shopDef(keyOrDef) : keyOrDef;
    if (!sdef) return '';
    const lore = escHtml(itemLore(sdef));
    return ` data-tt="${lore}" title="${lore}"`;
  }
  function hubHTML() {
    return `<div class="econ-panel">
      ${hubTabBodyHTML()}
      ${bankSecretHTML()}
    </div>`;
  }
  function hubTabBodyHTML() {
    switch (hubTab) {
      case 'shop': return shopHTML();
      case 'buildshop': return buildShopHTML();
      case 'bank': return bankHTML();
      case 'minions': return minionsHTML();
      case 'pets': return petsHTML();
      case 'talismans': return talismansHTML();
      case 'enchant': return enchantHTML();
      case 'star': return starForceHTML();
      case 'reforge': return reforgeHTML();
      case 'craft': return craftHTML();
      case 'bazaar': return bazaarHTML();
      case 'auction': return auctionHTML();
      case 'halloffame': return hallOfFameHTML();
      case 'hotm': return hotmHTML();
      case 'deals': return dealsHTML();
      case 'collections': return collectionsHTML();
      case 'stats': return statsHTML();
      case 'multi': return multiHTML();
      case 'inv': return invHTML();
      case 'menu': return menuHTML();
      case 'slayer': return slayerZoneHTML();
      case 'ach': return achievementsHTML();
      case 'daily': return dailyHTML();
      case 'difficulty': return difficultyHTML();
      case 'equiplog': return equipLogHTML();
      case 'arena': return arenaZoneHTML();
      case 'bestiary': return bestiaryHTML();
      case 'skills': return skillsHTML();
    }
    return '';
  }
  /* ---- 스카이블럭 메뉴(네더의 별 ✦ 우클릭 / 핫바 9번) — 실제 메뉴 구성 패턴 ---- */
  function menuHTML() {
    const tiles = [
      ['stats', '📊', '내 프로필', '스탯 시트'], ['skills', '🧠', '스킬', '8종 스킬 진행도'],
      ['collections', '📚', '컬렉션', '자원 39종 티어'], ['inv', '🎒', '인벤토리', '보유 아이템'],
      ['slayer', '💀', '슬레이어', '의뢰·보스·레벨'], ['minions', '⚙️', '미니언', '조합·컬렉션·수거'],
      ['ach', '🏅', '업적', `${Object.keys(P.ach || {}).length}/${D().ACHIEVEMENTS.length} 달성`], ['daily', '📜', '일일 퀘스트', '매일 3종·보상'],
      ['difficulty', '🎚️', '난이도', `현재: ${fieldDiffDef().name}`], ['equiplog', '📔', '장비 도감', `${fmtNum(equipLogCount())}/${fmtNum(equipTotalCount())}종`],
      ['pets', '🐾', '펫', '펫 관리'], ['talismans', '📿', '장신구 가방', '부적/마력'],
      ['craft', '⚒️', '레시피 북', '제작(장인 NPC와 동일)'], ['bestiary', '📕', '도감', '처치 기록·마일스톤 보너스'], ['multi', '🌐', '멀티', '거래·파티·섬 방문'],
      ['halloffame', '🏆', '명예의 전당', '전 시스템 기록·마일스톤'],
    ];
    const worlds = (typeof window.economy3dWorlds === 'function') ? window.economy3dWorlds() : [];
    return `<h4>✦ 스카이블럭 메뉴</h4>
      <div class="econ-menugrid">${tiles.map(t => `<button class="econ-menutile" data-act="econ_menu" data-key="${t[0]}"><span class="econ-menuic">${t[1]}</span><b>${t[2]}</b><span class="muted">${t[3]}</span></button>`).join('')}</div>
      <h4>🚀 빠른 이동 (워프)</h4>
      <div class="econ-tierbtns">${worlds.map(w => {
        const locked = w.req && skillLevel(w.req.sk) < w.req.lv;
        return `<button class="btn btn--sm ${locked ? 'btn--ghost' : ''}" data-act="econ_warp" data-key="${w.key}">${locked ? '🔒 ' : ''}${w.name}${w.req ? `<br><span class="muted">${w.req.name} Lv${w.req.lv}${locked ? ` (현재 ${skillLevel(w.req.sk)})` : ' ✓'}</span>` : ''}</button>`;
      }).join('') || '<span class="muted">3D 월드에서 사용 가능</span>'}</div>
      <p class="muted">상점·은행·인챈트·강화·리포지·특가는 마을의 해당 NPC에게 직접 찾아가세요!</p>`;
  }
  function bestiaryHTML() {
    const b = P.bestiary || {};
    const MS = [10, 100, 500, 1000];   // V10: 종별 마일스톤 4단계
    const entries = Object.keys(b).sort((x, y) => b[y] - b[x]);
    return `<h4>📕 도감 — 종별 처치 100마리당 전투 피해 +0.5% (현재 +${bestiaryBonusPct()}%)</h4>
      <p class="muted">종별 마일스톤: ${MS.map(m => fmtNum(m)).join(' → ')}마리 (★4 = 그 종의 정복자!)</p>
      ${entries.length ? `<div class="econ-colgrid">${entries.slice(0, 60).map(k => {
        const n = b[k]; const stars = MS.filter(m => n >= m).length;
        const next = MS.find(m => n < m);
        return `<div class="econ-colrow"><span>${k} <span style="color:#f6c945">${'★'.repeat(stars)}</span><span class="muted">${'☆'.repeat(4 - stars)}</span></span><span><b>${fmtNum(n)}</b>마리</span><span class="muted">${next ? `다음 ★까지 ${fmtNum(next - n)}` : '정복 완료!'}</span></div>`;
      }).join('')}</div>` : '<p class="econ-note">아직 처치 기록이 없어요. 사냥을 시작해보세요!</p>'}`;
  }
  function skillsHTML() {
    return `<h4>🧠 스킬 (실제 스카이블럭 XP 테이블 · 최대 ${D().SKILL_MAX_LEVEL}레벨)</h4>
      <div class="econ-colgrid">${D().SKILLS.map(sk => {
        const lv = skillLevel(sk.key), pr = skillXpProgress(sk.key);
        const pct = pr.need > 0 ? Math.min(100, pr.cur / pr.need * 100) : 100;
        return `<div class="econ-colrow"><span>${sk.name} <b>Lv.${lv}</b></span>
          <span class="econ-hpbar" style="flex:1;height:14px"><span class="econ-hpbar__fill" style="width:${pct}%;background:linear-gradient(90deg,#2c82c9,#54c8e8)"></span></span>
          <span class="muted">${pr.need ? `${pr.cur.toLocaleString()}/${pr.need.toLocaleString()} XP` : 'MAX'} · ${sk.bonusText}</span></div>`;
      }).join('')}</div>`;
  }
  /* ---- 인벤토리(전체 보유 아이템 + 판매) ---- */
  function invCatOf(k, sdef) {
    if (k.indexOf('enchant_book_') === 0) return 'book';
    if (k.indexOf('potion_') === 0 || k.indexOf('pet_egg_') === 0) return 'use';
    if (sdef && (sdef.dmg || sdef.defense)) return 'equip';
    for (const fam in D().TOOLS) if (D().TOOLS[fam].some(t => t.key === k)) return 'equip';
    if (k.indexOf('enchanted_') === 0 || (sdef && sdef.category === '재료')) return 'mat';
    return 'etc';
  }
  // V12-D: 핫바 지정 로직
  function isPlaceableOrTool(k) {
    if (D().TOOLS) for (const fam in D().TOOLS) if (D().TOOLS[fam].some(t => t.key === k)) return true;
    // 설치 가능 여부는 3D가 판정 — 대략 블럭/도구/장비면 지정 허용
    const sd = shopDef(k);
    return !!(sd && (sd.category === '건축' || sd.category === '제작품' || sd.category === '무기' || sd.category === '방어구' || sd.category === '도구')) || (window.__econ3dPlaceable ? window.__econ3dPlaceable(k) : false);
  }
  function assignHotbar(key, slot) {
    if (!Array.isArray(P.hotbar)) P.hotbar = [];
    P.hotbar = P.hotbar.slice(0, 9);
    while (P.hotbar.length < 9) P.hotbar.push(null);
    if (slot != null && slot >= 0 && slot < 9) {
      const old = P.hotbar.indexOf(key);
      if (old >= 0) P.hotbar[old] = null;
      P.hotbar[slot] = key;
      saveNow(); renderZone();
      if (typeof window.economy3dRefreshHotbar === 'function') window.economy3dRefreshHotbar();
      return;
    }
    const at = P.hotbar.indexOf(key);
    if (at >= 0) { P.hotbar[at] = null; }        // 이미 있으면 해제(토글)
    else { let i = P.hotbar.indexOf(null); if (i < 0) i = 0; P.hotbar[i] = key; }
    saveNow(); renderZone();
    if (typeof window.economy3dRefreshHotbar === 'function') window.economy3dRefreshHotbar();
  }
  // V12-D: 실제 마인크래프트 인벤토리 — 방어구 4슬롯 + 9×4 그리드 + 핫바 9칸
  function invHTML() {
    const all = Object.keys(P.inv).filter(k => (P.inv[k] || 0) > 0).sort((a, b) => {
      const ca = invCatOf(a, shopDef(a)), cb = invCatOf(b, shopDef(b));
      return ca < cb ? -1 : ca > cb ? 1 : (a < b ? -1 : 1);
    });
    const cell = (k) => {
      if (!k) return `<div class="mc-slot mc-empty"></div>`;
      const sd = shopDef(k); const n = P.inv[k] || 0;
      const border = sd && sd.tierKey ? tierColorByKey(sd.tierKey) : 'rgba(255,255,255,.14)';
      const inHot = (P.hotbar || []).indexOf(k) >= 0;
      const canHot = isPlaceableOrTool(k);
      return `<div class="mc-slot econ-tt ${inHot ? 'is-hot' : ''}" style="border-color:${border}"${ttAttr(sd || { key: k, name: itemName(k) })} data-act="econ_invcell" data-key="${k}">
        ${iconImg(k)}${n > 1 ? `<span class="mc-cnt">${n > 9999 ? fmtNum(n) : n}</span>` : ''}${inHot ? '<span class="mc-hotmark">▸</span>' : ''}${canHot ? `<button class="mc-hotquick" data-act="econ_assign_hotbar" data-key="${k}" title="${inHot ? '핫바에서 빼기' : '핫바에 넣기'}">${inHot ? '−' : '+'}</button>` : ''}</div>`;
    };
    const GRID = 36;
    const gridCells = []; for (let i = 0; i < GRID; i++) gridCells.push(cell(all[i]));
    const overflow = all.slice(GRID);
    // 방어구 4슬롯(자동 장착 표시)
    const armorSlot = (sl, emoji) => { const p = equippedPiece(sl); return `<div class="mc-slot mc-armor" title="${SLOT_NAMES[sl]}">${p ? iconImg(p.key) : `<span class="mc-armormark">${emoji}</span>`}</div>`; };
    const wpn = equippedPiece('weapon'), bow = equippedPiece('bow');
    // 핫바 9칸(1~8 지정 + 9 메뉴)
    const hot = (P.hotbar || [null, null, null, null, null, null, null, null, null]);
    const hotRow = Array.from({ length: 9 }, (_, i) => {
      const k = hot[i];
      return `<div class="mc-slot mc-hot ${k ? '' : 'mc-empty'}" data-act="${k ? 'econ_assign_hotbar' : (invDetailKey ? 'econ_assign_hotbar_slot' : '')}" data-key="${k || invDetailKey || ''}" data-slot="${i}" title="핫바 ${i + 1}">${k ? `${iconImg(k)}${(P.inv[k] || 0) > 1 ? `<span class="mc-cnt">${P.inv[k]}</span>` : ''}` : `<span class="mc-slotnum">${i + 1}</span>`}</div>`;
    }).join('');
    return `<h4>🎒 인벤토리</h4>
      <div class="mc-invtop">
        <div class="mc-armorcol">${armorSlot('helmet', '🪖')}${armorSlot('chest', '🛡')}${armorSlot('leggings', '👖')}${armorSlot('boots', '🥾')}</div>
        <div class="mc-charhint"><div class="mc-slot mc-armor" title="무기">${wpn ? iconImg(wpn.key) : '⚔️'}</div><div class="mc-slot mc-armor" title="활">${bow ? iconImg(bow.key) : '🏹'}</div><span class="muted">방어구/무기는<br>자동 장착</span></div>
      </div>
      <div class="mc-grid">${gridCells.join('')}</div>
      <div class="mc-hotbar-label">핫바 9칸 (숫자키 1~9 선택 · 아이템 클릭 → 핫바 지정)</div>
      <div class="mc-hotbar">${hotRow}</div>
      ${overflow.length ? `<p class="muted">+ ${overflow.length}칸 초과(정리 필요) — 아이템을 팔거나 써서 공간을 확보하세요</p>` : ''}
      <p class="muted">아이템을 클릭하면 상세(판매/장착/분해/핫바지정)가 열려요.</p>
      ${invDetailKey ? invCellActions(invDetailKey) : ''}`;
  }
  function invCellActions(k) {
    const sdef = shopDef(k);
    const sell = sdef && sdef.sellPrice > 0 ? sdef.sellPrice : 0;
    const canHot = isPlaceableOrTool(k);
    return `<div class="econ-cellact">
      <b>${iconImg(k)} ${itemName(k)} ×${P.inv[k] || 0}</b>
      <div class="econ-tierbtns">
        ${(D().PORTAL_ITEMS || {})[k] ? `<button class="btn btn--sm" data-act="econ_portal_install" data-key="${k}">🌀 프라이빗 섬에 설치(워프 해금)</button>` : ''}
        ${canHot ? `<button class="btn btn--sm" data-act="econ_assign_hotbar" data-key="${k}">${(P.hotbar || []).indexOf(k) >= 0 ? '핫바에서 빼기' : '➕ 핫바에 넣기'}</button>` : ''}
        ${k.indexOf('potion_') === 0 ? `<button class="btn btn--sm" data-act="econ_potion_use" data-key="${k}">🧪 마시기</button>` : ''}
        ${sdef && sdef.slot ? `<button class="btn btn--sm btn--ghost" data-act="econ_pin" data-key="${k}">${(P.equipPin || {})[sdef.slot] === k ? '📌 고정 해제' : '📌 고정 장착'}</button><button class="btn btn--sm btn--ghost" data-act="econ_lock" data-key="${k}">${(P.locked || {})[k] ? '🔓 잠금해제' : '🔒 잠금'}</button><button class="btn btn--sm btn--ghost" data-act="econ_salvage" data-key="${k}">⚒️ 분해</button>` : ''}
        ${sell ? `<button class="btn btn--sm btn--ghost" data-act="econ_sell" data-key="${k}">1개 판매 ${fmtGold(sell)}</button>${(P.inv[k] || 0) > 1 ? `<button class="btn btn--sm btn--ghost" data-act="econ_sell_all" data-key="${k}">전부 판매</button>` : ''}` : ''}
      </div>
    </div>`;
  }
  // 아이템 자동 설명(상점/인벤토리 카드용)
  function shopItemDesc(sdef) {
    if (!sdef) return '';
    const k = sdef.key || '';
    const e = D().ENCHANTS.find(x => `enchant_book_${x.key}` === k);
    if (e) return `${e.desc} · 최대 ${e.maxLvl}레벨(혼돈 +${D().CHAOS_ENCHANT.overcapLevels})`;
    if (k.indexOf('pet_egg_') === 0) { const pd = D().PETS.find(x => `pet_egg_${x.key}` === k); if (pd) return `부화 시 ${pd.name} 획득`; }
    if (k.indexOf('enchanted_') === 0 && k.indexOf('_block') > 0) return '인챈티드 160개 조합 — 최고가 판매품';
    if (k.indexOf('enchanted_') === 0) return '원자재 160개(32×5) 조합 — 고가 판매·상위 조합 재료';
    for (const fam in D().TOOLS) { const t = D().TOOLS[fam].find(x => x.key === k); if (t) return `채집 효율 ×${t.mul}`; }
    if (sdef.dmg) return `공격 +${sdef.dmg} 무기`;
    if (sdef.defense) return `방어 +${sdef.defense} 방어구`;
    if (sdef.category === '재료') return '조합·미니언·판매용 자원';
    if (sdef.category === '제작품') return '제작 전용 아이템';
    return sdef.category || '';
  }
  /* ---- 멀티(온라인 플레이어 목록 · 거래 · 파티 던전 · 섬 방문) ---- */
  function net() { return window.econNet || null; }
  function multiHTML() {
    const n = net();
    if (!n || !n.isActive()) {
      return `<h4>🌐 멀티플레이</h4>
        <p class="econ-note">지금은 오프라인이에요. 로그인 + 클라우드 연결 상태에서 다른 플레이어와<br>
        <b>아이템·골드 거래</b>, <b>파티 던전</b>, <b>섬 방문</b>이 가능해요.<br>
        허브 군도는 서버의 모두와 공유되는 공용 월드예요. (프라이빗 섬만 나만의 공간!)</p>`;
    }
    const t = n.trade(), pt = n.party();
    if (t) return tradeHTML(t);
    if (pt) return partyHTML(pt);
    const list = n.peerList();
    const worldNames = (typeof window.economy3dWorlds === 'function') ? window.economy3dWorlds() : [];
    const byWorld = {};
    list.forEach(p => { byWorld[p.world] = (byWorld[p.world] || 0) + 1; });
    const worldRow = Object.keys(byWorld).map(w => { const wn = worldNames.find(x => x.key === w); return `${wn ? wn.name : w} <b>${byWorld[w]}</b>`; }).join(' · ');
    return `<h4>🌐 멀티플레이 — 접속 중인 플레이어 ${list.length}명</h4>
      ${worldRow ? `<p class="muted">🗺️ 월드별: ${worldRow} — 프라이빗 섬 외 모든 월드가 공유돼요(장비까지 보여요!)</p>` : ''}
      ${list.length === 0 ? '<p class="econ-note">지금 허브에 다른 플레이어가 없어요. 친구를 초대해보세요!</p>' : ''}
      <div class="econ-shopgrid">${list.map(p => `
        <div class="econ-shopitem">
          <span>👤 <b>${escHtml(p.name)}</b> <span class="muted">${p.world === 'hub' ? '허브' : '자기 섬'}</span></span>
          <button class="btn btn--sm" data-act="econ_mp_trade" data-id="${p.id}">🤝 거래</button>
          <button class="btn btn--sm" data-act="econ_mp_party" data-id="${p.id}">⚔️ 파티 던전</button>
          <button class="btn btn--sm btn--ghost" data-act="econ_mp_visit" data-name="${escHtml(p.name)}">🏝️ 섬 방문</button>
        </div>`).join('')}</div>
      <h4 style="margin-top:12px">🏝️ 이름으로 섬 방문</h4>
      <div class="econ-tierbtns">
        <input id="econVisitName" class="econ-input" placeholder="플레이어 이름" maxlength="16">
        <button class="btn btn--sm" data-act="econ_mp_visit_input">방문하기</button>
      </div>
      <p class="muted">허브 군도는 모두와 공유돼요 — 다른 플레이어의 아바타가 월드에 보여요. 파티 던전은 호스트 기준으로 진행돼요.</p>`;
  }
  function offerListHTML(offer, mine) {
    const items = (offer.items || []).map(it => `<button class="btn btn--sm ${mine ? '' : 'btn--ghost'}" ${mine ? `data-act="econ_mp_offer_rm" data-key="${it.key}"` : 'disabled'}>${itemName(it.key)} ×${it.n}${mine ? ' ✕' : ''}</button>`).join(' ');
    return `${items || '<span class="muted">아이템 없음</span>'} ${offer.gold > 0 ? `<b style="color:#facc15">+ ${fmtGold(offer.gold)}</b>` : ''}`;
  }
  function tradeHTML(t) {
    if (t.stage === 'request_sent') return `<h4>🤝 거래</h4><p>${escHtml(t.peerName)}님의 수락을 기다리는 중...</p><button class="btn btn--sm btn--ghost" data-act="econ_mp_trade_cancel">취소</button>`;
    if (t.stage === 'incoming') return `<h4>🤝 거래 요청</h4><p><b>${escHtml(t.peerName)}</b>님이 거래를 요청했어요!</p>
      <button class="btn btn--sm" data-act="econ_mp_trade_acc">수락</button>
      <button class="btn btn--sm btn--ghost" data-act="econ_mp_trade_dec">거절</button>`;
    // stage 'open' — 오퍼 편집 + 잠금 + 확정
    const invKeys = Object.keys(P.inv).filter(k => (P.inv[k] || 0) > 0).slice(0, 40);
    return `<h4>🤝 ${escHtml(t.peerName)}님과 거래 중</h4>
      <div class="econ-shopgrid">
        <div class="econ-shopitem"><span><b>내 오퍼</b> ${t.myLock ? '🔒' : ''}${t.myConfirm ? ' ✅' : ''}</span><span>${offerListHTML(t.my, !t.myLock)}</span>
          ${t.myLock ? '' : `<div class="econ-tierbtns">${[100, 1000, 10000].map(g => `<button class="btn btn--sm btn--ghost" data-act="econ_mp_gold" data-amt="${g}">골드 +${fmtGold(g)}</button>`).join('')}<button class="btn btn--sm btn--ghost" data-act="econ_mp_gold" data-amt="0">골드 초기화</button></div>`}
        </div>
        <div class="econ-shopitem"><span><b>${escHtml(t.peerName)}의 오퍼</b> ${t.theirLock ? '🔒' : ''}${t.theirConfirm ? ' ✅' : ''}</span><span>${offerListHTML(t.their, false)}</span></div>
      </div>
      ${t.myLock ? '' : `<h4>내 인벤토리에서 추가 (클릭 = 1개)</h4><div class="econ-tierbtns">${invKeys.map(k => `<button class="btn btn--sm btn--ghost" data-act="econ_mp_offer_add" data-key="${k}">${itemName(k)} ×${P.inv[k]}</button>`).join('') || '<span class="muted">보유 아이템 없음</span>'}</div>`}
      <div class="econ-tierbtns" style="margin-top:10px">
        ${t.myLock ? '' : '<button class="btn btn--sm" data-act="econ_mp_lock">🔒 오퍼 잠금</button>'}
        ${t.myLock && t.theirLock && !t.myConfirm ? '<button class="btn btn--sm" data-act="econ_mp_confirm">✅ 최종 확정</button>' : ''}
        ${t.myLock && !t.theirLock ? '<span class="muted">상대의 잠금을 기다리는 중...</span>' : ''}
        ${t.myConfirm && !t.theirConfirm ? '<span class="muted">상대의 확정을 기다리는 중...</span>' : ''}
        <button class="btn btn--sm btn--ghost" data-act="econ_mp_trade_cancel">거래 취소</button>
      </div>
      <p class="muted">양쪽 모두 잠금 → 확정하면 교환돼요. 오퍼가 바뀌면 잠금이 풀려요(안전장치).</p>`;
  }
  function partyHTML(pt) {
    if (pt.stage === 'invited') return `<h4>⚔️ 파티 던전</h4><p>${escHtml(pt.peerName)}님의 수락을 기다리는 중... (던전 ${pt.floor}층)</p><button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_leave">취소</button>`;
    if (pt.stage === 'incoming') return `<h4>⚔️ 파티 던전 초대</h4><p><b>${escHtml(pt.peerName)}</b>님이 던전 <b>${pt.floor}층</b> 파티에 초대했어요!</p>
      <button class="btn btn--sm" data-act="econ_mp_pt_acc">수락</button>
      <button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_dec">거절</button>`;
    if (pt.stage === 'waiting') return `<h4>⚔️ 파티 던전</h4><p>호스트(${escHtml(pt.peerName)})가 던전을 시작하길 기다리는 중...</p><button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_leave">파티 떠나기</button>`;
    if (pt.role === 'host') return `<h4>⚔️ 파티 던전 진행 중 (호스트)</h4><p class="econ-note">던전 화면에서 전투를 진행하세요 — 파티원 ${escHtml(pt.peerName)}의 공격이 실시간 반영돼요.</p><button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_leave">파티 해산</button>`;
    // 게스트: 호스트 스냅샷으로 전투 화면 렌더 + 공격 버튼
    const run = pt.run;
    if (!run) return `<h4>⚔️ 파티 던전</h4><p>호스트의 던전 상태를 기다리는 중...</p><button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_leave">파티 떠나기</button>`;
    return `<h4>⚔️ 파티 던전 ${run.floor}층 — ${run.roomIdx + 1}/${run.rooms.length}번 방 (${escHtml(pt.peerName)} 호스트)</h4>
      <p>호스트 HP: <b style="color:#4ade80">${Math.round(run.playerHp)}</b> / ${run.maxPlayerHp} · 점수 ${run.score}</p>
      <div class="econ-moblist">${(run.mobs || []).map(m => `
        <div class="econ-mobrow ${m.hp <= 0 ? 'is-dead' : ''}"><span>${m.isBoss ? '👹' : '🧟'} ${escHtml(m.name)}</span>
          <div class="econ-hpbar"><div class="econ-hpbar__fill" style="width:${Math.max(0, m.hp / m.maxHp * 100)}%"></div><span>${Math.max(0, Math.round(m.hp))}/${m.maxHp}</span></div></div>`).join('')}</div>
      <div class="econ-tierbtns" style="margin-top:10px">
        <button class="btn" data-act="econ_mp_pt_attack">⚔️ 공격! (내 공격력 ${Math.round(playerAttackPower())})</button>
        <button class="btn btn--sm btn--ghost" data-act="econ_mp_pt_leave">파티 떠나기</button>
      </div>
      <p class="muted">호스트가 방을 이동하면 화면이 자동 갱신돼요. 클리어 보상은 던전 종료 시 지급!</p>`;
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function shopHTML() {
    // V7: 무화폐 구매 경제 — 상점 주인은 "매입 전문"(시세표 + 판매). 아이템은 채집·드롭·조합으로만 얻는다.
    const cats = [];
    for (const sd of D().SHOP) if (cats.indexOf(sd.category) < 0) cats.push(sd.category);
    const ownedCats = cats.map(cat => {
      const items = D().SHOP.filter(sd => sd.category === cat && (P.inv[sd.key] || 0) > 0 && sd.sellPrice > 0);
      if (!items.length) return '';
      return `<h4>${cat}</h4><div class="econ-shopgrid">${items.map(sd => `
        <div class="econ-shopitem econ-tt"${ttAttr(sd)}>
          ${iconImg(sd.key)}<span>${sd.tierKey ? `<span style="color:${tierColorByKey(sd.tierKey)}">${sd.name}</span>` : sd.name} <b>×${P.inv[sd.key]}</b></span>
          <span class="muted econ-idesc">개당 ${fmtGold(sd.sellPrice)}</span>
          <span>
            <button class="btn btn--sm btn--ghost" data-act="econ_sell" data-key="${sd.key}">1개 판매</button>
            <button class="btn btn--sm" data-act="econ_sell_all" data-key="${sd.key}">전부 판매</button>
          </span>
        </div>`).join('')}</div>`;
    }).join('');
    return `<h4>🛒 상점 주인 — 매입 전문</h4>
      <p class="econ-note">💰 이 세계의 골드는 <b>강화·인챈트 합성·리포지</b>에만 쓰여요. 장비/도구/북은 전부 <b>채집·몬스터 드롭·조합</b>으로!<br>가진 아이템을 팔아 강화 자금을 모으세요. (희귀 아이템일수록 비싸게 매입)</p>
      ${ownedCats || '<p class="muted">팔 수 있는 아이템이 없어요. 채집하고 사냥해서 가져오세요!</p>'}`;
  }
  // V14: 건축가 빌더 — 건축 블럭 대량(스택) 구매(코인 → 블럭, 서바이벌 설치용 재고)
  function buildShopHTML() {
    return `<h4>🧱 건축가 빌더 — 건축 자재상</h4>
      <p class="econ-note">코인으로 건축 블럭을 <b>대량 구매</b>해요. 산 블럭은 인벤토리에 들어가고, 프라이빗 섬에서 <b>서바이벌 방식으로 설치</b>(설치 시 소모)돼요.</p>
      <p class="muted">소지금: ${fmtGold(P.gold)}</p>
      <div class="econ-shopgrid">${D().BUILDER_SHOP.map(b => {
        const ok = P.gold >= b.price;
        const sd = shopDef(b.key) || { key: b.key, name: b.name, category: '건축', flavor: '프라이빗 섬에 설치 가능한 건축 블럭' };
        return `<div class="econ-shopitem econ-tt"${ttAttr(sd)}>${iconImg(b.key)}<span>${b.name} <b>×${b.amount}</b></span>
          <span class="muted econ-idesc">보유 ${P.inv[b.key] || 0}</span>
          <button class="btn btn--sm" data-act="econ_buildbuy" data-key="${b.key}" ${ok ? '' : 'disabled'}>${fmtGold(b.price)} 구매</button></div>`;
      }).join('')}</div>`;
  }
  function buildBuy(key) {
    const b = D().BUILDER_SHOP.find(x => x.key === key); if (!b) return;
    if (P.gold < b.price) { toastFn('코인이 부족해요', false); return; }
    addGold(-b.price); addItem(b.key, b.amount);
    toastFn(`🧱 ${b.name} ×${b.amount} 구매! (소지금 ${fmtGold(P.gold)})`, true);
    saveNow(); renderZone();
  }
  function bankTierInfo() { const U = D().BANK.upgrades; const t = Math.min(P.bankTier || 0, U.length - 1); return { tier: t, cap: U[t].cap, pct: U[t].pct, next: U[t + 1] || null }; }
  function upgradeBank() {
    const info = bankTierInfo();
    if (!info.next) { toastFn('은행이 최고 등급이에요', false); return; }
    if (P.gold < info.next.cost) { toastFn('업그레이드 비용이 부족해요', false); return; }
    addGold(-info.next.cost);
    P.bankTier = (P.bankTier || 0) + 1;
    toastFn(`🏦 은행 업그레이드! 잔고 상한 ${fmtGold(bankTierInfo().cap)}`, true);
    saveNow(); renderZone();
  }
  function bankHTML() {
    const bi = bankTierInfo();
    return `<h4>🏦 은행 (하루 ${D().BANK.interestPctPerDay}% 이자 · 잔고 상한 ${fmtGold(bi.cap)})</h4>
      ${bi.next ? `<button class="btn btn--sm" data-act="econ_bank_upgrade">금고 업그레이드 → 상한 ${fmtGold(bi.next.cap)} (비용 ${fmtGold(bi.next.cost)})</button>` : '<p class="muted">🏆 최고 등급 금고</p>'}
      <p>예치금: <b style="color:#facc15">${fmtGold(P.bank)}</b> · 소지금: ${fmtGold(P.gold)}</p>
      <div class="econ-tierbtns">
        ${[1000, 10000, 'all'].map(a => `<button class="btn btn--sm" data-act="econ_bank_deposit" data-amt="${a}">예치 ${a === 'all' ? '전부' : fmtGold(a)}</button>`).join('')}
        ${[1000, 10000, 'all'].map(a => `<button class="btn btn--sm btn--ghost" data-act="econ_bank_withdraw" data-amt="${a}">출금 ${a === 'all' ? '전부' : fmtGold(a)}</button>`).join('')}
      </div>
      <p class="muted">매일 첫 접속 시 이자가 자동 지급돼요.</p>`;
  }
  function minionsHTML() {
    const fuelLeft = P.minionFuelUntil > Date.now() ? Math.ceil((P.minionFuelUntil - Date.now()) / 3600000) : 0;
    const F1 = D().MINION_FUEL, F2 = D().MINION_FUEL2;
    const uniq = Object.keys(P.minionCrafts || {}).length;
    const nextSlotAt = [5, 15, 50, 100, 200, 350, 650].find(t => t > uniq) || 650;   // 다음 슬롯이 열리는 고유 조합 수(실제 계단식)
    const storedTotal = P.minions.reduce((n, m) => n + m.storage, 0);
    return `<h4>⚙️ 미니언 (슬롯 ${P.minions.length}/${P.maxMinionSlots})</h4>
      <div class="econ-tierbtns">
        <button class="btn btn--sm" data-act="econ_minion_fuel" data-key="${F1.key}" ${hasItem(F1.key) ? '' : 'disabled'}>🔥 ${F1.name} (보유 ${P.inv[F1.key] || 0})</button>
        <button class="btn btn--sm" data-act="econ_minion_fuel" data-key="${F2.key}" ${hasItem(F2.key) ? '' : 'disabled'}>🌋 ${F2.name} (보유 ${P.inv[F2.key] || 0})</button>
        <button class="btn btn--sm btn--ghost" data-act="econ_minion_collect_all" ${storedTotal > 0 ? '' : 'disabled'}>📦 전체 수거(${storedTotal})</button>
        ${fuelLeft ? `<span class="muted">🔥 연료 가동 중(~${fuelLeft}시간, 속도 ×${P.minionFuelMul || F1.speedMul})</span>` : ''}
      </div>
      <div class="econ-note">📗 <b>미니언 컬렉션</b>: 고유 조합 <b>${uniq}</b>종 — 슬롯 ${P.maxMinionSlots}/${D().MINION_SLOT_MAX}칸
        ${P.maxMinionSlots < D().MINION_SLOT_MAX ? ` · 다음 슬롯까지 고유 조합 ${Math.max(0, nextSlotAt - uniq)}개 (누적 ${nextSlotAt}개 시 +1칸)` : ' · <b>최대 확장 완료!</b>'}<br>
        <span class="muted">새 종류·새 티어의 미니언을 조합할 때마다 컬렉션이 쌓여요. 컬렉션 티어당 해당 미니언 생산 +2%</span></div>
      <div class="econ-tierbtns">
        <button class="btn btn--sm" data-act="econ_buy" data-key="minion_slot_expander" ${(P.minionSlotsBought || 0) >= 5 || P.maxMinionSlots >= D().MINION_SLOT_MAX ? 'disabled' : ''}>🪙 슬롯 확장권 (${(P.minionSlotsBought || 0)}/5 · ${minionSlotCost().toLocaleString()}G)</button>
        <span class="muted">기본 5 + 고유조합 최대 +21 + 상점 최대 +5 = <b>${D().MINION_SLOT_MAX}칸</b>(실제 하이픽셀 상한)</span>
      </div>
      <p class="muted">실제 스카이블럭처럼 미니언은 <b>자원으로 조합</b>해요. 컬렉션 티어 1 달성 시 해금, 고유 조합 마일스톤(5·15·50·100·200·350·650)마다 슬롯 확장!</p>
      <div class="econ-minionplace">${D().MINIONS.map(m => {
        const c = m.tiers[0].craftCost; const un = minionUnlocked(m.key); const have = (P.inv[c.key] || 0);
        return `<button class="btn btn--sm ${un ? '' : 'btn--ghost'}" data-act="econ_minion_place" data-key="${m.key}" ${un ? '' : 'disabled'}>${m.name}<br><span class="muted">${un ? `${itemName(c.key)} ${have}/${c.n}` : '컬렉션 티어1 필요'}</span></button>`;
      }).join('')}</div>
      <div class="econ-minionlist">${P.minions.map((m, i) => minionRowHTML(m, i)).join('') || '<p class="muted">배치된 미니언이 없어요 (자원을 모아 조합하세요)</p>'}</div>`;
  }
  function petsHTML() {
    const eggs = D().SHOP.filter(s => s.category === '펫' && hasItem(s.key));
    const ownedPets = (D().PETS || []).filter(p => !!P.pets[p.key]);
    return `<h4>🐾 펫 (활성 1마리의 보너스가 적용돼요)</h4>
      ${eggs.length ? `<h4 class="muted">보유한 알</h4><div class="econ-tierbtns">${eggs.map(e => `<button class="btn btn--sm" data-act="econ_pet_hatch" data-key="${e.key.replace('pet_egg_', '')}">${e.name} 부화 (보유 ${P.inv[e.key]})</button>`).join('')}</div>` : ''}
      ${ownedPets.length ? `<h4 class="muted">보유한 펫</h4><div class="econ-shopgrid">${ownedPets.map(p => {
        const lvl = petLevel(p.key);
        return `<div class="econ-shopitem econ-tt"${ttAttr({ key: `pet_egg_${p.key}`, name: p.name, tierKey: p.tierKey, flavor: p.perkText })}>
          ${iconImg(`pet_egg_${p.key}`)}<span style="color:${tierColorByKey(p.tierKey)}">${p.name} [${tierNameByKey(p.tierKey)}]</span>
          <span class="muted">Lv.${lvl} — ${p.perkText}</span>
          ${P.activePet === p.key ? '<span style="color:#4ade80">✔ 활성</span>' : `<button class="btn btn--sm" data-act="econ_pet_activate" data-key="${p.key}">활성화</button>`}
        </div>`;
      }).join('')}</div>` : '<p class="muted">보유한 펫이 없어요. 보유한 알을 부화시키면 여기에서 바로 선택할 수 있어요.</p>'}
      <details class="econ-ownedonly"><summary>미보유 펫 획득처 보기</summary>
        <div class="econ-shopgrid">${(D().PETS || []).filter(p => !P.pets[p.key]).map(p => `<div class="econ-shopitem is-locked">${iconImg(`pet_egg_${p.key}`)}<span style="color:${tierColorByKey(p.tierKey)}">${p.name}</span><span class="muted">${p.eggPrice > 0 ? '상점 알 구매' : '보스 드롭 전용'}</span></div>`).join('')}</div>
      </details>`;
  }
  function talismansHTML() {
    const ts = talismanStats();
    const pw = powerStats(), curPw = selectedPowerDef();
    const pwLine = Object.keys(pw).filter(k => pw[k]).map(k => `${({ str: '힘', def: '방어', hp: '체력', intelligence: '지력', critChance: '크리%', critDamage: '크리피해%' })[k]} +${pw[k]}`).join(' · ') || '없음';
    const powerBtns = (D().MAGICAL_POWER.powers || []).map(p => `<button class="btn btn--sm ${p.key === curPw.key ? '' : 'btn--ghost'}" data-act="econ_power" data-key="${p.key}">${p.name}</button>`).join('');
    const owned = D().TALISMANS.filter(t => hasItem(t.key));
    const missing = D().TALISMANS.filter(t => !hasItem(t.key));
    const card = (t, ownedFlag) => `<div class="econ-shopitem econ-tt ${ownedFlag ? '' : 'is-locked'}"${ttAttr(Object.assign({}, t, { flavor: t.desc }))}>
          ${iconImg(t.key)}<span style="color:${tierColorByKey(t.tierKey)}">${ownedFlag ? '✔ ' : ''}${t.name}</span>
          <span class="muted">${t.desc}</span>
          ${!ownedFlag && t.buyPrice > 0 ? `<button class="btn btn--sm" data-act="econ_buy" data-key="${t.key}">구매 ${fmtGold(t.buyPrice)}</button>` : ''}
        </div>`;
    return `<h4>📿 장신구 가방 — 마력 ${magicalPower()} (최종 공격/방어 +${((mpStatMul() - 1) * 100).toFixed(1)}%)</h4>
      <div class="econ-colgrid" style="margin-bottom:8px">
        <div class="econ-colrow"><span>✨ 전능의 힘</span><span><b>${curPw.name}</b></span><span class="muted">마력 스케일 ${Math.round(mpScale())} → ${pwLine}</span></div>
      </div>
      <div class="econ-tierbtns" style="margin-bottom:8px">${powerBtns}</div>
      <p class="muted">페어리 소울 ${P.fairySouls.length}/${D().FAIRY_SOULS.total} (3D 월드 곳곳에 숨어 있어요)</p>
      ${owned.length ? `<h4 class="muted">보유한 장신구</h4><div class="econ-shopgrid">${owned.map(t => card(t, true)).join('')}</div>` : '<p class="muted">보유한 장신구가 없어요. 미보유 목록에서 구매하거나 보스/퀘스트 보상으로 얻으면 여기에 표시돼요.</p>'}
      <details class="econ-ownedonly"><summary>미보유 장신구/획득처 보기</summary><div class="econ-shopgrid">${missing.map(t => card(t, false)).join('')}</div></details>
      <p class="muted">합계 보너스: 힘 +${ts.str} · 방어 +${ts.def} · 체력 +${ts.hp} · 판매가 +${ts.sellBonus}% · 미니언속도 +${ts.minionSpeed}%</p>`;
  }
  function enchantHTML() {
    return `<h4>✨ 인챈트 탑 — 북으로 상한까지, 그 위는 혼돈의 마법부여(운빨 돌파!)</h4>
      <div class="econ-shopgrid">${D().ENCHANTS.map(e => {
        const cur = enchantLvl(e.target, e.key); const book = `enchant_book_${e.key}`;
        const fee = e.bookBasePrice * cur;
        const hardCap = enchantHardCap(e);
        const isOver = cur >= e.maxLvl;
        const overBtn = isOver && cur < hardCap
          ? `<button class="btn btn--sm econ-chaosbtn" data-act="econ_chaos" data-key="${e.key}" ${hasItem(book) ? '' : 'disabled'}>🌀 혼돈 ${Math.round(chaosRate(e, cur) * 100)}% (${fmtGold(chaosCost(e, cur))})</button>`
          : '';
        return `<div class="econ-shopitem">
          ${iconImg(book)}<span>${e.name} <b class="${cur > e.maxLvl ? 'econ-overcap' : ''}">${cur}</b>/${e.maxLvl}${cur > e.maxLvl ? `<span class="econ-overcap">+${cur - e.maxLvl}</span>` : ''} <span class="muted">(${e.target === 'weapon' ? '무기' : '방어구'})</span></span>
          <span class="muted">${e.desc} · 북 보유 ${P.inv[book] || 0}</span>
          ${!isOver ? `<button class="btn btn--sm" data-act="econ_enchant" data-key="${e.key}" ${hasItem(book) ? '' : 'disabled'}>부여${fee > 0 ? `(${fmtGold(fee)})` : '(무료)'}</button>` : ''}
          ${overBtn}
        </div>`;
      }).join('')}</div>`;
  }
  // V20-J: 명예의 전당 — 전 시스템 개인 기록 + 마일스톤 등급(순수 표시, 밸런스 무관)
  function hofTier(v, thresholds) { let t = 0; for (const th of thresholds) { if (v >= th) t++; else break; } return t; }   // 0~5
  function hofBadge(t) { return ['⬜', '🥉', '🥈', '🥇', '💎', '👑'][Math.min(5, t)]; }
  function hallOfFameHTML() {
    const S = P.stats || {};
    const slayers = D().SLAYERS.map(s => slayerLevel(s.key));
    const maxSlayer = slayers.length ? Math.max(...slayers) : 0;
    const skills = ['combat', 'mining', 'farming', 'foraging', 'fishing', 'enchanting', 'taming', 'social'];
    const totalSkill = skills.reduce((a, k) => a + skillLevel(k), 0);
    let colMax = 0, colTotal = 0;
    for (const cat of D().COLLECTIONS) for (const r of cat.resources) { colTotal++; if (collectionTierIdx(r.key) >= r.tierThresholds.length) colMax++; }
    const bestFloor = Object.keys(P.dungeonBest || {}).map(Number).filter(f => P.dungeonBest[f] && P.dungeonBest[f] !== 'F').reduce((a, b) => Math.max(a, b), 0);
    const hotm = P.hotm || {};
    const bazaarTraded = (P.bazaarBought || 0) + (P.bazaarSold || 0);
    const recs = [
      { ic: '💥', label: '최고 단일 타격', val: S.maxHit || 0, th: [1000, 50000, 500000, 2000000, 5000000], fmt: fmtNum },
      { ic: '⚔️', label: '총 처치', val: S.kills || 0, th: [100, 1000, 10000, 50000, 200000], fmt: fmtNum },
      { ic: '👹', label: '보스 처치', val: S.bossKills || 0, th: [10, 100, 500, 2000, 8000], fmt: fmtNum },
      { ic: '💀', label: '최고 슬레이어 레벨', val: maxSlayer, th: [1, 3, 5, 7, 9], fmt: v => v },
      { ic: '🏰', label: '최고 던전 층', val: bestFloor, th: [1, 4, 7, 9, 11], fmt: v => 'F' + v },
      { ic: '📚', label: '컬렉션 MAX', val: colMax, th: [1, 5, 15, 25, colTotal], fmt: v => `${v}/${colTotal}` },
      { ic: '🧠', label: '스킬 레벨 총합', val: totalSkill, th: [50, 150, 300, 420, 480], fmt: fmtNum },
      { ic: '💰', label: '누적 골드 획득', val: S.goldEarned || 0, th: [1e5, 1e6, 1e7, 1e8, 1e9], fmt: fmtGold },
      { ic: '🏛️', label: '경매 낙찰', val: S.ahSold || 0, th: [1, 10, 50, 200, 1000], fmt: fmtNum },
      { ic: '🏪', label: '바자 거래량', val: bazaarTraded, th: [64, 1000, 10000, 100000, 1e6], fmt: fmtNum },
      { ic: '⛰️', label: '산의 심장 티어', val: hotm.tier || 1, th: [2, 3, 4, 6, 7], fmt: v => 'T' + v },
      { ic: '🔹', label: '미스릴 가루 보유', val: hotm.mithril || 0, th: [5000, 50000, 3e5, 1e6, 5e6], fmt: fmtNum },
      { ic: '🧚', label: '페어리 소울', val: (P.fairySouls || []).length, th: [5, 20, 40, 60, D().FAIRY_SOULS.total], fmt: v => `${v}/${D().FAIRY_SOULS.total}` },
      { ic: '📔', label: '장비 도감', val: equipLogCount(), th: [50, 200, 500, 1000, 1400], fmt: fmtNum },
      { ic: '⛏️', label: '채굴 블록', val: S.blocksMined || 0, th: [500, 5000, 50000, 2e5, 1e6], fmt: fmtNum },
      { ic: '🎣', label: '낚시 성공', val: S.fishCaught || 0, th: [100, 1000, 10000, 50000, 2e5], fmt: fmtNum },
    ];
    const totalTier = recs.reduce((a, r) => a + hofTier(r.val, r.th), 0);
    const maxTier = recs.length * 5;
    const rows = recs.map(r => {
      const t = hofTier(r.val, r.th);
      const nextTh = r.th[t];
      return `<div class="econ-colrow">
        <span>${r.ic} ${r.label} ${hofBadge(t)}</span>
        <span><b>${r.fmt(r.val)}</b></span>
        <span class="muted">${t >= 5 ? '👑 완전 정복!' : `다음 ${hofBadge(t + 1)} @ ${r.fmt(nextTh)}`}</span>
      </div>`;
    }).join('');
    return `<h4>🏆 명예의 전당 — 나의 기록</h4>
      <p class="econ-note">전 시스템 개인 기록과 마일스톤 등급(⬜→🥉→🥈→🥇→💎→👑). 명예 점수 <b>${totalTier}/${maxTier}</b>.</p>
      <div class="econ-colgrid">${rows}</div>`;
  }
  function starForceHTML() {
    const SF = D().STARFORCE;
    const rows = EQUIP_SLOTS.map(slot => {
      const eq = equippedPiece(slot);
      const cur = P.starForce[slot];
      const row = starRow(slot);
      const chance = starChanceTime(slot);
      const bandNow = cur < 5 ? 0 : cur < 10 ? 1 : cur < 15 ? 2 : 3;   // V20-B: 초월 밴드
      const isW = slot === 'weapon' || slot === 'bow';
      const gain = isW ? `공격 +${SF.weaponAtkPctByBand[bandNow]}%${slot === 'bow' ? '(활은 30% 반영)' : ''}` : `방어 +${SF.armorDefByBand[bandNow]} · 체력 +${SF.armorHpByBand[bandNow]}`;
      return `<div class="econ-starcard">
        <h4>${SLOT_EMOJI[slot]} ${SLOT_NAMES[slot]} ★${cur}${chance ? ' <span style="color:#f6c945">🌟 찬스 타임(100%)</span>' : ''}</h4>
        <p class="muted">${eq ? eq.name : '장착 장비 없음'} · 전 슬롯 누적: 공격 +${starAtkPct()}% · 방어 +${starDefFlat()} · 체력 +${starHpFlat()}</p>
        ${cur >= SF.maxStars ? `<p><b>★${SF.maxStars} 초월 최대 강화 달성!</b></p>` : `
        <div class="econ-colgrid">
          <div class="econ-colrow"><span>성공 ${Math.round((chance ? 1 : row[0]) * 100)}%</span><span>유지 ${Math.round((chance ? 0 : row[1]) * 100)}%</span><span>하락 ${Math.round((chance ? 0 : row[2]) * 100)}%</span><span>${row[3] > 0 ? `💣 파괴 ${Math.round((chance ? 0 : row[3]) * 100)}% (★${SF.boomResetTo} 리셋)` : '파괴 없음'}</span></div>
          <div class="econ-colrow"><span>성공 시 ${gain}</span><span class="muted">구간: 1~5성 소폭 · 6~10성 중폭 · 11~15성 대폭</span></div>
        </div>
        <button class="btn" data-act="econ_star" data-slot="${slot}" ${eq ? '' : 'disabled'}>강화 (${fmtGold(starCost(slot))})</button>
        <p class="muted">2연속 하락 시 다음 강화는 찬스 타임(100% 성공) — 메이플 방식</p>`}
      </div>`;
    }).join('');
    return `<h4>⭐ 스타포스 강화(메이플식 체계) — V11: 6슬롯 개별 강화</h4>${rows}`;
  }
  function reforgeHTML() {
    const row = (slot, label, eq) => {
      const cur = P.reforgeSlots[slot];
      const cost = reforgeSlotCost(slot);
      return `<div class="econ-starcard">
        <h4>${label} — ${eq ? `<span style="color:${tierColorByKey(eq.tierKey)}">${cur ? `[${cur.name}] ` : ''}${eq.name}</span>` : '<span class="muted">장비 없음</span>'}</h4>
        <p class="muted">${cur ? `현재 보너스: ${cur.dmgPct ? `공격 +${cur.dmgPct}% ` : ''}${cur.def ? `방어 +${cur.def} ` : ''}${cur.hp ? `체력 +${cur.hp} ` : ''}${cur.sellBonus ? `판매가 +${cur.sellBonus}%` : ''}` : '리포지 없음 — 무작위 접두어를 부여해보세요'}</p>
        <button class="btn btn--sm" data-act="econ_reforge_slot" data-slot="${slot}" ${eq ? '' : 'disabled'}>🎲 무작위 리포지 ${cost != null ? `(${fmtGold(cost)})` : ''}</button>
        <button class="btn btn--sm btn--ghost" data-act="econ_reforge_premium" data-slot="${slot}" ${eq && hasItem('reforge_stone_rare') ? '' : 'disabled'}>💎 스톤 확정 [${D().REFORGES.premium[reforgePoolType(slot)].name}] (스톤 1 + ${cost != null ? fmtGold(cost * 2) : '-'})</button>
        <button class="btn btn--sm btn--ghost" data-act="econ_reforge_apex" data-slot="${slot}" ${eq && hasItem('reforge_stone_apex') ? '' : 'disabled'}>🐉 전설 확정 [${D().REFORGES.premiumApex[reforgePoolType(slot)].name}] (신룡의 룬석 1 + ${cost != null ? fmtGold(cost * 3) : '-'})</button>
      </div>`;
    };
    const HB = D().HPB;
    const hpbRows = EQUIP_SLOTS.map(sl => {
      const eq = equippedPiece(sl); if (!eq) return '';
      const cur = hpbOf(eq.key);
      const isW = sl === 'weapon' || sl === 'bow';
      return `<div class="econ-shopitem">
        ${iconImg(eq.key)}<span>${SLOT_EMOJI[sl]} <span style="color:${tierColorByKey(eq.tierKey)}">${eq.name}</span> <b>🥔+${cur}</b>/${HB.fumingMax}</span>
        <span class="muted">${isW ? `권당 공격 +${HB.weaponDmgPerBook}` : `권당 방어 +${HB.armorDefPerBook}·체력 +${HB.armorHpPerBook}`} · 10권까지 핫포북, 11~15권 퓨밍</span>
        <button class="btn btn--sm" data-act="econ_hpb" data-key="${eq.key}" ${cur >= HB.fumingMax ? 'disabled' : ''}>${cur >= HB.maxBooks ? `퓨밍 먹이기(보유 ${P.inv.fuming_potato_book || 0})` : `핫포북 먹이기(보유 ${P.inv.hot_potato_book || 0})`}</button>
      </div>`;
    }).join('');
    return `<h4>🔨 재련소 — 무작위 리포지로 대박을 노리거나, 리포지 스톤으로 확정 최상급을! (V11: 6슬롯)</h4>
      ${EQUIP_SLOTS.map(sl => row(sl, `${SLOT_EMOJI[sl]} ${SLOT_NAMES[sl]}`, equippedPiece(sl))).join('')}
      <p class="muted">보유 리포지 스톤(희귀): ${P.inv.reforge_stone_rare || 0}</p>
      <h4>🥔 핫 포테이토 북 — 장비당 최대 15권(10권부터 퓨밍 필요)</h4>
      <div class="econ-shopgrid">${hpbRows || '<p class="muted">장착 중인 장비가 없어요</p>'}</div>`;
  }
  // V12: 보유 아이템 기반 추천 제작(재료 보유율 높은 순, 지금 제작 가능 우선)
  function craftRecommendations() {
    const scored = D().RECIPES.filter(r => recipeUnlocked(r)).map(r => {
      const total = Object.values(r.needs).reduce((a, b) => a + b, 0);
      const have = Object.keys(r.needs).reduce((a, k) => a + Math.min(P.inv[k] || 0, r.needs[k]), 0);
      return { r, ratio: total ? have / total : 0, canNow: canCraft(r) };
    }).filter(x => x.ratio > 0.15);
    scored.sort((a, b) => (b.canNow ? 1 : 0) - (a.canNow ? 1 : 0) || b.ratio - a.ratio);
    return scored.slice(0, 3);
  }
  // V13-A: 실제 마인크래프트 3×3 제작대 그리드(레시피 재료를 칸에 채우고 결과 표시)
  function craftGridHTML(r) {
    if (!r) return '';
    const needKeys = Object.keys(r.needs);
    // 재료를 3×3에 분배(레시피에 배치 데이터가 없으므로 종류별로 필요한 만큼 칸을 채움)
    const cells = [];
    needKeys.forEach(k => { for (let i = 0; i < Math.min(r.needs[k], 9 - cells.length); i++) cells.push(k); });
    while (cells.length < 9) cells.push(null);
    const cell = k => k ? `<div class="mc-slot econ-tt"${ttAttr(shopDef(k) || { key: k, name: itemName(k) })}>${iconImg(k)}</div>` : '<div class="mc-slot mc-empty"></div>';
    const ok = canCraft(r), un = recipeUnlocked(r);
    return `<div class="econ-crafttable">
      <div class="mc-craftgrid">${cells.map(cell).join('')}</div>
      <div class="mc-craftarrow">➜</div>
      <div class="mc-craftout"><div class="mc-slot" style="width:52px;height:52px">${iconImg(r.key)}${(r.gives || 1) > 1 ? `<span class="mc-cnt">${r.gives}</span>` : ''}</div>
        <div class="muted">${itemName(r.key)}${(r.gives || 1) > 1 ? ` ×${r.gives}` : ''}</div>
        <button class="btn btn--sm" data-act="econ_craft" data-key="${r.key}" ${ok ? '' : 'disabled'}>${un ? (ok ? '제작' : '재료 부족') : '🔒 미해금'}</button>
      </div>
    </div>
    <p class="muted">필요: ${needKeys.map(k => `${itemName(k)} ${P.inv[k] || 0}/${r.needs[k]}`).join(', ')}</p>`;
  }
  function craftHTML() {
    const recs = craftRecommendations();
    const recHTML = recs.length ? `<div class="econ-craftrec"><b>✨ 추천 제작 (보유 재료 기준)</b>${recs.map(x => {
      const needsTxt = Object.keys(x.r.needs).map(k => `${itemName(k)} ${P.inv[k] || 0}/${x.r.needs[k]}`).join(', ');
      return `<div class="econ-recitem">${iconImg(x.r.key)}<span>${itemName(x.r.key)} <span class="muted">(${needsTxt})</span></span><button class="btn btn--sm" data-act="econ_craft" data-key="${x.r.key}" ${x.canNow ? '' : 'disabled'}>${x.canNow ? '제작' : '재료 부족'}</button></div>`;
    }).join('')}</div>` : '';
    const sel = D().RECIPES.find(r => r.key === craftSel) || (recs[0] && recs[0].r) || D().RECIPES.find(r => recipeUnlocked(r));
    return `<h4>⚒️ 제작대 (메뉴에서 바로 3×3 제작 · 바닐라 + 스카이블럭 레시피)</h4>
      ${craftGridHTML(sel)}
      ${recHTML}
      <h4 class="muted">전체 레시피</h4>
      <div class="econ-shopgrid">${D().RECIPES.map(r => {
        const unlocked = recipeUnlocked(r);
        const needsTxt = Object.keys(r.needs).map(k => `${itemName(k)} ×${r.needs[k]} (${P.inv[k] || 0})`).join(', ');
        let lockTxt = '';
        if (!unlocked && r.unlock) {
          if (r.unlock.skill) lockTxt = `🔒 ${skillDef(r.unlock.skill).name} 스킬 Lv.${r.unlock.lv} 필요 (현재 ${skillLevel(r.unlock.skill)})`;
          else { const rn = resourceDef(r.unlock.resource); lockTxt = `🔒 ${rn ? rn.name : r.unlock.resource} 컬렉션 티어 ${r.unlock.tier} 필요 (현재 ${collectionTierIdx(r.unlock.resource)})`; }
        }
        return `<div class="econ-shopitem ${unlocked ? '' : 'is-locked'}">
          ${iconImg(r.key)}<span>${itemName(r.key)}</span>
          <span class="muted">${unlocked ? `재료: ${needsTxt}` : lockTxt}</span>
          <button class="btn btn--sm btn--ghost" data-act="econ_craft_sel" data-key="${r.key}">3×3 보기</button>
          <button class="btn btn--sm" data-act="econ_craft" data-key="${r.key}" ${canCraft(r) ? '' : 'disabled'}>제작</button>
        </div>`;
      }).join('')}</div>`;
  }
  function craftGridHTML(r) {
    if (!r) return '';
    const matched = craftGridRecipe();
    const out = matched || null;
    const cell = (k, i) => k
      ? `<button class="mc-slot econ-tt" data-act="econ_craft_grid_clear" data-i="${i}"${ttAttr(shopDef(k) || { key: k, name: itemName(k) })}>${iconImg(k)}</button>`
      : `<button class="mc-slot mc-empty" data-act="econ_craft_grid_clear" data-i="${i}"></button>`;
    const needKeys = Object.keys(r.needs || {});
    const needTxt = needKeys.map(k => `${itemName(k)} ${P.inv[k] || 0}/${r.needs[k]}`).join(', ');
    return `<div class="econ-crafttable">
      <div class="mc-craftgrid">${craftGrid.map(cell).join('')}</div>
      <div class="mc-craftarrow">→</div>
      <div class="mc-craftout">
        <button class="mc-slot econ-tt ${out ? '' : 'mc-empty'}" style="width:56px;height:56px" data-act="econ_craft_take" ${out ? ttAttr(shopDef(out.key) || { key: out.key, name: itemName(out.key) }) : ''}>${out ? `${iconImg(out.key)}${(out.gives || 1) > 1 ? `<span class="mc-cnt">${out.gives}</span>` : ''}` : ''}</button>
        <div class="muted">${out ? `${itemName(out.key)}${(out.gives || 1) > 1 ? ` x${out.gives}` : ''}` : '배치가 맞으면 결과가 표시됩니다'}</div>
        <button class="btn btn--sm btn--ghost" data-act="econ_craft_grid_clear_all">그리드 비우기</button>
      </div>
    </div>
    <p class="muted">선택 레시피: ${itemName(r.key)} · 필요: ${needTxt || '없음'} · 제작대 위 재료 배치가 레시피 모양과 맞아야 합니다.</p>`;
  }
  function craftInventoryHTML() {
    const keys = Object.keys(P.inv).filter(k => (P.inv[k] || 0) > 0).sort((a, b) => itemName(a).localeCompare(itemName(b), 'ko'));
    const used = craftGridCounts();
    const cells = [];
    for (let i = 0; i < 36; i++) {
      const k = keys[i];
      if (!k) { cells.push('<div class="mc-slot mc-empty"></div>'); continue; }
      const left = (P.inv[k] || 0) - (used[k] || 0);
      cells.push(`<button class="mc-slot econ-tt ${left <= 0 ? 'is-locked' : ''}" data-act="econ_craft_put" data-key="${k}" ${left <= 0 ? 'disabled' : ''}${ttAttr(shopDef(k) || { key: k, name: itemName(k) })}>${iconImg(k)}${left > 1 ? `<span class="mc-cnt">${left}</span>` : ''}</button>`);
    }
    return `<h4 class="muted">보유 인벤토리 36칸</h4><div class="mc-grid mc-grid--craftinv">${cells.join('')}</div>`;
  }
  function craftHTML() {
    const recs = craftRecommendations();
    const recHTML = recs.length ? `<div class="econ-craftrec"><b>추천 레시피</b>${recs.map(x => {
      const needsTxt = Object.keys(x.r.needs).map(k => `${itemName(k)} ${P.inv[k] || 0}/${x.r.needs[k]}`).join(', ');
      return `<div class="econ-recitem">${iconImg(x.r.key)}<span>${itemName(x.r.key)} <span class="muted">(${needsTxt})</span></span><button class="btn btn--sm btn--ghost" data-act="econ_craft_sel" data-key="${x.r.key}">보기</button></div>`;
    }).join('')}</div>` : '';
    const sel = D().RECIPES.find(r => r.key === craftSel) || (recs[0] && recs[0].r) || D().RECIPES.find(r => recipeUnlocked(r));
    return `<h4>제작대</h4>
      ${craftGridHTML(sel)}
      ${craftInventoryHTML()}
      ${smeltHTML()}
      ${recHTML}
      <details class="econ-ownedonly"><summary>전체 레시피 목록</summary>
      <div class="econ-shopgrid">${D().RECIPES.map(r => {
        const unlocked = recipeUnlocked(r);
        const needsTxt = Object.keys(r.needs).map(k => `${itemName(k)} x${r.needs[k]} (${P.inv[k] || 0})`).join(', ');
        let lockTxt = '';
        if (!unlocked && r.unlock) {
          if (r.unlock.skill) lockTxt = `🔒 ${skillDef(r.unlock.skill).name} Lv.${r.unlock.lv} 필요 (현재 ${skillLevel(r.unlock.skill)})`;
          else { const rn = resourceDef(r.unlock.resource); lockTxt = `🔒 ${rn ? rn.name : r.unlock.resource} 컬렉션 티어 ${r.unlock.tier} 필요 (현재 ${collectionTierIdx(r.unlock.resource)})`; }
        }
        return `<div class="econ-shopitem ${unlocked ? '' : 'is-locked'}">
          ${iconImg(r.key)}<span>${itemName(r.key)}</span>
          <span class="muted">${unlocked ? `재료: ${needsTxt}` : lockTxt}</span>
          <button class="btn btn--sm btn--ghost" data-act="econ_craft_sel" data-key="${r.key}">레시피 보기</button>
          ${manualCraftCapable(r) ? '' : `<button class="btn btn--sm" data-act="econ_craft" data-key="${r.key}" ${canCraft(r) ? '' : 'disabled'}>대량 제작</button>`}
        </div>`;
      }).join('')}</div></details>`;
  }

  function dealsHTML() {
    // V7: 경매인 = 수집상. 매일 원하는 아이템 3종을 시세의 2.5배로 매입(무화폐 구매 경제의 골드 수급처)
    const deals = dealsForToday();
    return `<h4>🎪 수집상 — 오늘의 웃돈 매입(시세 ×2.5)</h4>
      <p class="econ-note">수집상이 매일 다른 아이템을 비싸게 사들여요. 보유분을 팔아 강화 자금을 벌어보세요!</p>
      <div class="econ-shopgrid">${deals.map((d, i) => {
        const sd = shopDef(d.key); if (!sd) return '';
        const owned = P.inv[d.key] || 0;
        const bought = (P.dealsBought || []).indexOf(i) >= 0; const mul = i === 0 ? D().DAILY_DEALS.jackpotMul : D().DAILY_DEALS.normalMul;
        return `<div class="econ-shopitem econ-tt"${ttAttr(sd)}>
          ${iconImg(d.key)}<span>${sd.name} <b>×${owned}</b></span>
          <span class="muted econ-idesc">${i === 0 ? '🎰 오늘의 잭팟! ' : ''}매입가 ${fmtGold(Math.round(sd.sellPrice * mul))} (시세 ×${mul})</span>
          <button class="btn btn--sm" data-act="econ_deal_buy" data-i="${i}" ${owned > 0 && !bought ? '' : 'disabled'}>${bought ? '오늘 매입 완료' : '보유분 전부 판매(최대 64개)'}</button>
        </div>`;
      }).join('')}</div>`;
  }
  function bazaarHTML() {
    const bz = D().BAZAAR;
    const cat = bz.cats.find(c => c.key === bazaarCat) || bz.cats[0];
    const qtys = [1, 16, 64, 640];
    const catNav = bz.cats.map(c => `<button class="econ-zonebtn ${c.key === cat.key ? 'is-active' : ''}" data-act="econ_bz_cat" data-key="${c.key}">${c.name}</button>`).join('');
    const qtyNav = qtys.map(q => `<button class="btn btn--sm ${q === bazaarQty ? '' : 'btn--ghost'}" data-act="econ_bz_qty" data-q="${q}">×${q}</button>`).join('');
    const rows = cat.keys.map(k => {
      const p = bazaarPrice(k); if (!p) return '';
      const owned = P.inv[k] || 0;
      const arrow = p.trend > 0.02 ? '<span style="color:#4ade80">▲</span>' : p.trend < -0.02 ? '<span style="color:#f87171">▼</span>' : '<span class="muted">—</span>';
      const canBuy = P.gold >= p.buy * bazaarQty;
      return `<div class="econ-shopitem econ-tt"${ttAttr(shopDef(k))}>
        ${iconImg(k)}<span>${p.name} <b>×${fmtNum(owned)}</b> ${arrow}</span>
        <span class="muted econ-idesc">즉시구매 ${fmtGold(p.buy)} · 즉시판매 ${fmtGold(p.sell)} <span class="muted">(개당)</span></span>
        <span style="display:flex;gap:4px">
          <button class="btn btn--sm" data-act="econ_bz_buy" data-key="${k}" ${canBuy ? '' : 'disabled'}>구매 ×${bazaarQty} (${fmtGold(p.buy * bazaarQty)})</button>
          <button class="btn btn--sm btn--ghost" data-act="econ_bz_sell" data-key="${k}" ${owned > 0 ? '' : 'disabled'}>판매 ×${Math.min(bazaarQty, owned) || bazaarQty}</button>
        </span>
      </div>`;
    }).join('');
    return `<h4>🏪 바자회 — 대량 자원 시장</h4>
      <p class="econ-note">시세는 1시간마다 ±${bz.fluxPct}% 변동해요. 즉시구매가는 즉시판매가보다 ${bz.spreadPct}% 높습니다(스프레드). 장비는 거래하지 않아요 — 원자재/인챈티드 자원 전용.</p>
      <div class="econ-zonenav">${catNav}</div>
      <div class="econ-tierbtns" style="margin:6px 0">거래 수량: ${qtyNav}</div>
      <div class="econ-shopgrid">${rows}</div>`;
  }
  function hotmHTML() {
    const H = D().HEART_OF_MOUNTAIN; const st = hotmState();
    const nextTier = st.tier + 1;
    const tierCost = st.tier < H.maxTier ? H.tierUnlock[nextTier] : null;
    const byTier = {};
    for (const nd of H.nodes) { (byTier[nd.tier] = byTier[nd.tier] || []).push(nd); }
    const tierBlocks = [];
    for (let t = 1; t <= H.maxTier; t++) {
      const nodes = byTier[t] || []; if (!nodes.length) continue;
      const unlocked = st.tier >= t;
      const rows = nodes.map(nd => {
        const lv = hotmNodeLevel(nd.key), cost = hotmNodeCost(nd.key);
        const val = lv * nd.per;
        const affordable = cost && (cost.powder === 'gemstone' ? st.gemstone : st.mithril) >= cost.amount;
        const maxed = lv >= nd.max;
        return `<div class="econ-shopitem">
          <span>${nd.emoji} ${nd.name} <b>Lv${lv}/${nd.max}</b></span>
          <span class="muted econ-idesc">${nd.desc.replace('{v}', lv > 0 ? val : nd.per)} ${maxed ? '· ✅ MAX' : cost ? `· 다음 ${cost.powder === 'gemstone' ? '💎' : '🔹'}${fmtNum(cost.amount)}` : ''}</span>
          <button class="btn btn--sm ${affordable && !maxed ? '' : 'btn--ghost'}" data-act="econ_hotm_up" data-key="${nd.key}" ${unlocked && !maxed && affordable ? '' : 'disabled'}>${maxed ? 'MAX' : '강화'}</button>
        </div>`;
      }).join('');
      tierBlocks.push(`<h4 style="margin-top:10px">${unlocked ? '🔓' : '🔒'} 티어 ${t}${!unlocked ? ' <span class="muted" style="font-weight:400">(잠김)</span>' : ''}</h4><div class="econ-shopgrid">${rows}</div>`);
    }
    return `<h4>⛰️ 산의 심장 (Heart of the Mountain)</h4>
      <p class="econ-note">광산에서 채광하면 <b>🔹미스릴 가루</b>(가끔 <b>💎젬스톤 가루</b>)를 모아요. 노드를 강화해 채광 포춘·속도를 올리세요. 현재 티어 <b>${st.tier}/${H.maxTier}</b>.</p>
      <div class="econ-colgrid">
        <div class="econ-colrow"><span>🔹 미스릴 가루</span><span><b>${fmtNum(st.mithril)}</b></span><span class="muted">채광 포춘 +${hotmMiningFortune()} · 속도 +${hotmMiningSpeed()}</span></div>
        <div class="econ-colrow"><span>💎 젬스톤 가루</span><span><b>${fmtNum(st.gemstone)}</b></span><span class="muted">고티어 노드 전용</span></div>
      </div>
      ${tierCost != null ? `<button class="btn btn--sm ${st.mithril >= tierCost ? '' : 'btn--ghost'}" data-act="econ_hotm_tier" ${st.mithril >= tierCost ? '' : 'disabled'} style="margin-top:8px">⬆️ 티어 ${nextTier} 개방 (🔹${fmtNum(tierCost)})</button>` : '<p class="muted" style="margin-top:8px">✅ 최고 티어 달성!</p>'}
      ${tierBlocks.join('')}`;
  }
  function ahFmtDur(ms) {
    if (ms <= 0) return '종료';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }
  function auctionHTML() {
    ahSettle();
    const A = D().AUCTION_HOUSE;
    const arr = ahListingsArr();
    // 1) 내 매물
    const mine = arr.slice().sort((a, b) => (a.settled === b.settled ? a.endsAt - b.endsAt : (a.settled ? -1 : 1)));
    const listRows = mine.length ? mine.map(L => {
      const nm = ahItemName(L);
      let status, action;
      if (L.settled && L.sold) {
        status = `<span style="color:#4ade80">✅ 낙찰 ${fmtGold(L.finalPrice)}</span> <span class="muted">→ ${L.buyer}</span>`;
        action = `<button class="btn btn--sm" data-act="econ_ah_claim" data-id="${L.id}">💰 수령</button>`;
      } else if (L.settled && !L.sold) {
        status = `<span class="muted">↩ 유찰(구매자 없음)</span>`;
        action = `<button class="btn btn--sm btn--ghost" data-act="econ_ah_claim" data-id="${L.id}">회수</button>`;
      } else if (L.kind === 'auction') {
        status = `⏳ 경매 · 현재 입찰 <b>${fmtGold(ahCurrentBid(L))}</b> · 남은 ${ahFmtDur(ahTimeLeft(L))}`;
        action = `<button class="btn btn--sm btn--ghost" data-act="econ_ah_cancel" data-id="${L.id}">취소</button>`;
      } else {
        status = `🏷️ 즉시구매 · <b>${fmtGold(L.price)}</b> · 남은 ${ahFmtDur(ahTimeLeft(L))}`;
        action = `<button class="btn btn--sm btn--ghost" data-act="econ_ah_cancel" data-id="${L.id}">취소</button>`;
      }
      return `<div class="econ-shopitem econ-tt"${ttAttr(shopDef(L.key))}>
        ${iconImg(L.key)}<span>${nm}</span>
        <span class="muted econ-idesc">${status}</span>
        <span>${action}</span>
      </div>`;
    }).join('') : '<p class="muted">등록한 매물이 없어요. 아래에서 잉여 아이템을 경매에 올려보세요!</p>';
    // 2) 등록 — 판매 가능한 보유 아이템(가치순 상위 40)
    const durNav = A.durations.map(h => `<button class="btn btn--sm ${h === ahDur ? '' : 'btn--ghost'}" data-act="econ_ah_dur" data-h="${h}">${h}시간</button>`).join('');
    const sellable = Object.keys(P.inv || {})
      .map(k => ({ k, sd: shopDef(k), n: P.inv[k] }))
      .filter(x => x.sd && x.sd.sellPrice > 0 && !(P.locked || {})[x.k])
      .sort((a, b) => b.sd.sellPrice - a.sd.sellPrice).slice(0, 40);
    const slotFull = arr.length >= A.maxListings;
    const listForms = sellable.length ? sellable.map(x => {
      const base = x.sd.sellPrice;
      const binPrice = Math.round(base * 2);
      return `<div class="econ-shopitem econ-tt"${ttAttr(x.sd)}>
        ${iconImg(x.k)}<span>${x.sd.name} <b>×${fmtNum(x.n)}</b></span>
        <span class="muted econ-idesc">시세 ${fmtGold(base)} · 경매 예상 낙찰 ${fmtGold(Math.round(base * A.auctionValueMin))}~${fmtGold(Math.round(base * A.auctionValueMax))}</span>
        <span style="display:flex;gap:4px">
          <button class="btn btn--sm" data-act="econ_ah_list" data-key="${x.k}" data-kind="auction" data-price="${base}" ${slotFull ? 'disabled' : ''}>경매(${ahDur}h)</button>
          <button class="btn btn--sm btn--ghost" data-act="econ_ah_list" data-key="${x.k}" data-kind="bin" data-price="${binPrice}" ${slotFull ? 'disabled' : ''}>즉구 ${fmtGold(binPrice)}</button>
        </span>
      </div>`;
    }).join('') : '<p class="muted">등록할 수 있는 아이템이 없어요(채집·드롭·조합으로 획득한 잉여분을 올릴 수 있어요).</p>';
    return `<h4>🏛️ 경매장 — 잉여 아이템 판매(경매/즉시구매)</h4>
      <p class="econ-note">보유 아이템을 경매(시간 경과로 입찰 상승, 인내의 보상)나 즉시구매(BIN)로 등록하세요. NPC 수집가가 사들입니다. 장비는 골드로 살 수 없어요 — 경매장은 <b>판매 창구</b>예요. 슬롯 ${arr.length}/${A.maxListings} · 수수료 ${A.feePct}%.</p>
      <h4 style="margin-top:10px">📜 내 매물</h4>
      <div class="econ-shopgrid">${listRows}</div>
      <h4 style="margin-top:14px">➕ 등록 &nbsp;<span class="muted" style="font-weight:400">경매 기간: ${durNav}</span></h4>
      <div class="econ-shopgrid">${listForms}</div>`;
  }
  function collectionsHTML() {
    return D().COLLECTIONS.map(cat => `<h4>${cat.category}</h4><div class="econ-colgrid">${cat.resources.map(r => {
      const tier = collectionTierIdx(r.key), maxT = r.tierThresholds.length;
      const cur = P.collections[r.key] || 0;
      const next = tier < maxT ? r.tierThresholds[tier] : null;
      const prev = tier > 0 ? r.tierThresholds[tier - 1] : 0;
      const pct = next ? Math.min(100, Math.max(0, (cur - prev) / (next - prev) * 100)) : 100;
      const nextRecipes = next ? D().RECIPES.filter(rc => rc.unlock && rc.unlock.resource === r.key && rc.unlock.tier === tier + 1).map(rc => itemName(rc.key)) : [];
      const rewardTxt = next ? `T${tier + 1} 보상: ${nextRecipes.length ? `레시피 ${nextRecipes.slice(0, 2).join('·')}${nextRecipes.length > 2 ? ` 외 ${nextRecipes.length - 2}` : ''} · ` : ''}미니언 생산 +2%` : 'MAX 달성!';
      return `<div class="econ-colrow"><span>${r.name} <b>T${tier}</b><span class="muted">/${maxT}</span></span>
        <span class="econ-hpbar" style="flex:1;height:12px"><span class="econ-hpbar__fill" style="width:${pct.toFixed(0)}%;background:linear-gradient(90deg,#7a5cff,#b28dff)"></span></span>
        <span class="muted">${fmtNum(cur)}${next ? `/${fmtNum(next)}` : ''} · ${rewardTxt}</span></div>`;
    }).join('')}</div>`).join('');
  }
  function statsHTML() {
    const w = equippedWeapon(), a = equippedArmor();
    const st = playerStats();
    return `<h4>📊 내 스탯 (실제 스카이블럭 공식)</h4>
      <div class="econ-colgrid">
        <div class="econ-colrow"><span>❤ 체력</span><span>${st.hp}</span><span class="muted">기본 100 + 농사/낚시/인챈트/부적/펫</span></div>
        <div class="econ-colrow"><span>🛡 방어</span><span>${st.defense}</span><span class="muted">피해 감소 ${(playerDefensePct() * 100).toFixed(1)}% = 방어/(방어+100)</span></div>
        <div class="econ-colrow"><span>💪 힘</span><span>${st.strength}</span><span class="muted">피해 ×(1+힘/100)</span></div>
        <div class="econ-colrow"><span>⚔ 공격력</span><span>${Math.round(playerAttackPower()).toLocaleString('ko-KR')}</span><span class="muted">무기: ${w ? w.name : '없음'}${w && w.caster ? ' (캐스터)' : ''}</span></div>
        <div class="econ-colrow"><span>☠ 크리 확률</span><span>${st.critChance.toFixed(1)}%</span><span class="muted">크리 피해 +${st.critDamage.toFixed(0)}%</span></div>
        <div class="econ-colrow"><span>⚡ 광포(추가타)</span><span>${st.ferocity}</span><span class="muted">100당 확정 추가타 · 피해 ×(1+광포/100)</span></div>
        <div class="econ-colrow"><span>✦ 이동속도</span><span>${st.speed}</span><span class="muted">100 = 기준(슈가 러시로 증가)</span></div>
        <div class="econ-colrow"><span>✎ 지능(마나)</span><span>${st.intelligence}</span><span class="muted">마법부여 레벨당 +4 · 캐스터 어빌리티 스케일</span></div>
        <div class="econ-colrow"><span>🍀 매직파인드</span><span>${st.magicFind}</span><span class="muted">희귀 드롭 확률 +${st.magicFind}%</span></div>
        <div class="econ-colrow"><span>⛏ 채광 포춘</span><span>${st.miningFortune}</span><span class="muted">광물 추가 드롭 +${st.miningFortune}%</span></div>
        <div class="econ-colrow"><span>🌾 농사 포춘</span><span>${st.farmingFortune}</span><span class="muted">작물 추가 드롭 +${st.farmingFortune}%</span></div>
        <div class="econ-colrow"><span>🛡 방어구</span><span>${a ? a.name : '없음'}</span><span class="muted">마력 ${magicalPower()}</span></div>
      </div>
      <h4>스킬</h4>
      <div class="econ-colgrid">${D().SKILLS.map(s => `<div class="econ-colrow"><span>${s.name}</span><span>Lv.${skillLevel(s.key)}</span><span class="muted">${s.bonusText}</span></div>`).join('')}</div>
      <h4>🗡 전투력(장비 점수): ${fmtNum(gearScore())}</h4>
      <div class="econ-colgrid">
        ${EQUIP_SLOTS.map(sl => { const p = equippedPiece(sl); return `<div class="econ-colrow"><span>${SLOT_EMOJI[sl]} ${SLOT_NAMES[sl]}</span><span>${p ? `<span style="color:${tierColorByKey(p.tierKey)}">${p.name}</span>` : '<span class="muted">없음</span>'}</span><span class="muted">${p ? `★${P.starForce[sl] || 0} 🥔${hpbOf(p.key)}${p.set && D().EQUIP_SETS[p.set] ? ` · ${D().EQUIP_SETS[p.set].name}` : ''}` : ''}</span></div>`; }).join('')}
        ${activeSetBonuses().map(sb => `<div class="econ-colrow"><span>✦ 세트 발동</span><span><b>${sb.def.name}</b></span><span class="muted">${sb.def.desc}</span></div>`).join('')}
      </div>
      <h4>📊 전투 통계</h4>
      <div class="econ-colgrid">
        <div class="econ-colrow"><span>처치</span><span>${fmtNum(statValue('kills'))}</span><span class="muted">보스급 ${fmtNum(statValue('bossKills'))}</span></div>
        <div class="econ-colrow"><span>최대 한 방</span><span>${fmtNum(statValue('maxHit'))}</span><span class="muted">사망 ${fmtNum(statValue('deaths'))}회</span></div>
        <div class="econ-colrow"><span>누적 골드</span><span>${fmtGold(statValue('goldEarned'))}</span><span class="muted">판매 ${fmtNum(statValue('itemsSold'))}개</span></div>
      </div>
      <h4>펫 · 던전 클래스</h4>
      <p class="muted">${P.activePet ? `활성 펫: ${petDef(P.activePet).name} Lv.${petLevel(P.activePet)}` : '활성 펫 없음'} · 던전 클래스: ${dungeonClassDef(P.dungeonClass).emoji} ${dungeonClassDef(P.dungeonClass).name}</p>`;
  }
  /* ---- V11 패널: 업적 · 일일 퀘스트 · 필드 난이도 · 아레나 · 장비 도감 ---- */
  function achievementsHTML() {
    checkAchievements(true);
    const done = Object.keys(P.ach || {}).length;
    return `<h4>🏅 업적 (${done}/${D().ACHIEVEMENTS.length})</h4>
      <div class="econ-colgrid">${D().ACHIEVEMENTS.map(a => {
        const got = !!(P.ach || {})[a.key];
        const cur = statValue(a.stat);
        return `<div class="econ-colrow" style="${got ? '' : 'opacity:.65'}"><span>${got ? '🏅' : '🔒'} <b>${a.name}</b></span><span class="muted">${a.desc}</span><span class="muted">${got ? '달성!' : `${fmtNum(Math.min(cur, a.gte))}/${fmtNum(a.gte)}`} · ${fmtGold(a.gold)}${a.item ? ` + ${itemName(a.item)}` : ''}</span></div>`;
      }).join('')}</div>`;
  }
  function dailyHTML() {
    ensureDaily();
    return `<h4>📜 일일 퀘스트 — 매일 3종, 자정 리셋</h4>
      <div class="econ-shopgrid">${P.daily.list.map((e, i) => {
        const q = dailyQuestDef(e.k); const pr = dailyProgress(e);
        return `<div class="econ-shopitem">
          <span>${e.claimed ? '✅' : pr >= q.goal ? '🎁' : '⏳'} <b>${q.name}</b></span>
          <span class="muted">${fmtNum(pr)}/${fmtNum(q.goal)} · 보상 ${fmtGold(q.gold)}</span>
          <button class="btn btn--sm" data-act="econ_daily_claim" data-i="${i}" ${!e.claimed && pr >= q.goal ? '' : 'disabled'}>${e.claimed ? '수령 완료' : '보상 받기'}</button>
        </div>`;
      }).join('')}</div>
      <p class="muted">완료 횟수 누적: ${fmtNum(statValue('questsDone'))}회 (업적 연동)</p>`;
  }
  function difficultyHTML() {
    const cur = P.fieldDiff || 'normal';
    const wk = weeklyFamily(); const wkDef = slayerDef(wk);
    return `<h4>🎚️ 필드 난이도 — 쉬움부터 극악(지옥)까지</h4>
      <p class="econ-note">던전·프라이빗 섬을 제외한 <b>모든 필드 몬스터</b>에 적용돼요. 어려울수록 몹 레벨·체력이 오르고 보상 배율과 전용 드롭이 붙어요.</p>
      <div class="econ-shopgrid">${Object.keys(D().FIELD_DIFF).map(k => {
        const fd = D().FIELD_DIFF[k]; const ok = skillLevel('combat') >= fd.req;
        return `<div class="econ-shopitem ${cur === k ? '' : 'is-locked'}">
          <span>${fd.emoji} <b>${fd.name}</b>${cur === k ? ' <span style="color:#4ade80">✔ 적용 중</span>' : ''}</span>
          <span class="muted">${fd.desc}</span>
          <span class="muted">몹 Lv ×${fd.lvMul} · HP ×${fd.hpMul} · 공격 ×${fd.dmgMul} · 보상 ×${fd.rewardMul}</span>
          <button class="btn btn--sm" data-act="econ_field_diff" data-key="${k}" ${ok && cur !== k ? '' : 'disabled'}>${ok ? '적용' : `전투 Lv${fd.req} 필요`}</button>
        </div>`;
      }).join('')}</div>
      <p class="muted">⭐ 이번 주 주간 보스 계열: <b>${wkDef ? wkDef.name : wk}</b> — 해당 계열 몹 HP·보상 ×${D().WEEKLY.hpMul} (매주 순환)</p>`;
  }
  function arenaZoneHTML() {
    return `<div class="econ-panel"><h4>🏟️ 콜로세움 — 웨이브 아레나(10웨이브 생존전)</h4>
      <p class="econ-note">검투사 마스터: "몰려오는 적을 전부 쓰러뜨리면 다음 웨이브다. 물러설 곳은 없다!"</p>
      <div class="econ-shopgrid">${D().ARENA.difficulties.map(ad => {
        const ok = skillLevel('combat') >= ad.req; const best = (P.arenaBest || {})[ad.key] || 0;
        return `<div class="econ-shopitem">
          <span><b>${ad.name}</b> <span class="muted">몹 Lv${ad.lv}</span></span>
          <span class="muted">웨이브당 ${fmtGold(ad.waveGold)} · 완주 ${fmtGold(ad.finalGold)} + 아레나 전용 장비 ${Math.round(D().ARENA.equipChance * 100)}%</span>
          <span class="muted">최고 기록: ${best}/${D().ARENA.waves}웨이브</span>
          <button class="btn btn--sm" data-act="econ_arena_start" data-key="${ad.key}" ${ok ? '' : 'disabled'}>${ok ? '개막!' : `전투 Lv${ad.req} 필요`}</button>
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  function equipLogHTML() {
    const E = D().EQUIPMENT;
    const bySlot = {};
    for (const list of [E.weapons, E.armor]) for (const it of list) {
      const sl = it.slot || 'chest';
      (bySlot[sl] = bySlot[sl] || { total: 0, got: 0 }).total++;
      if ((P.equipLog || {})[it.key]) bySlot[sl].got++;
    }
    const tot = equipTotalCount(), got = equipLogCount();
    return `<h4>📔 장비 도감 — ${fmtNum(got)}/${fmtNum(tot)}종 (${(got / tot * 100).toFixed(1)}%)</h4>
      <div class="econ-colgrid">${EQUIP_SLOTS.map(sl => {
        const b = bySlot[sl] || { total: 0, got: 0 };
        const pct = b.total ? b.got / b.total * 100 : 0;
        return `<div class="econ-colrow"><span>${SLOT_EMOJI[sl]} ${SLOT_NAMES[sl]}</span>
          <span class="econ-hpbar" style="flex:1;height:12px"><span class="econ-hpbar__fill" style="width:${pct.toFixed(0)}%;background:linear-gradient(90deg,#f6c945,#f97316)"></span></span>
          <span class="muted">${b.got}/${b.total}종</span></div>`;
      }).join('')}</div>
      <p class="muted">100종/400종 등록 시 업적 보상! 장비는 몹·던전·슬레이어·낚시·상자·아레나·지옥 보스가 떨어뜨려요.</p>`;
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
      ${m.tier < def.maxTier ? (() => { const c = nextMinionCost(m.key, m.tier); return `<button class="btn btn--sm" data-act="econ_minion_upgrade" data-idx="${i}">T${m.tier + 1} 조합(${itemName(c.key)} ${P.inv[c.key] || 0}/${c.n})</button>`; })() : '<span class="muted">최고 등급</span>'}
      ${!m.storageUpgraded ? `<button class="btn btn--sm btn--ghost" data-act="econ_minion_storage" data-idx="${i}">저장고 확장(${fmtGold(D().MINION_STORAGE_UPGRADE_COST)})</button>` : ''}
    </div>`;
  }

  function gatherZoneHTML(z) {
    const zdef = D().ZONES.find(x => x.key === z), table = D().GATHER_TABLE[z];
    const label = z === 'mine' ? '채굴하기' : z === 'farm' ? '수확하기' : z === 'forest' ? '벌목하기' : '낚시하기';
    const mul = bestToolMul(table.toolFamily);
    const guide = z === 'mine' ? '동굴의 돌·광석 블록을 직접 꾹 눌러 캐세요! 돌→조약돌→기반암 순서로 변하고 시간이 지나면 재생돼요. 딥 캐번/골드 광산 워프에서 더 좋은 광물을!'
      : z === 'farm' ? '밭의 작물을 직접 꾹 눌러 수확하세요! 수확한 자리는 잠시 후 다시 자라나요. 더 반(The Barn) 워프에 대형 농장이 있어요.'
        : z === 'forest' ? '나무 원목을 직접 꾹 눌러 베세요! 벤 나무는 잠시 후 다시 자라요. 더 파크 워프에 7종 수종 대삼림이 있어요.'
          : '물을 조준하고 우클릭으로 찌를 던지세요! 입질(❗)이 오면 클릭해서 낚아채면 돼요. 가끔 바다 생물이 낚여요!';
    return `<div class="econ-panel">
      <p class="muted">${zdef.desc}</p>
      <p class="econ-note">🎮 ${guide}</p>
      <p class="muted">${skillDef(table.skill).name} 스킬 Lv.${skillLevel(table.skill)} · 도구 배율 ×${mul}</p>
      <div class="econ-colgrid">${table.drops.map(d => {
        const rdef = resourceDef(d.key); const tier = collectionTierIdx(d.key);
        return `<div class="econ-colrow"><span>${rdef.name}</span><span>보유 ${P.inv[d.key] || 0}</span><span class="muted">컬렉션 ${P.collections[d.key] || 0} (티어 ${tier}/${rdef.tierThresholds.length})</span></div>`;
      }).join('')}</div>
    </div>`;
  }

  function slayerZoneHTML() {
    const q = P.slayerQuest;
    return `<div class="econ-panel"><h4>💀 슬레이어(마덕스식 의뢰)</h4>
      ${q ? `<div class="econ-note">진행 중: <b>${slayerDef(q.key).name} T${q.tier}</b> — 게이지 <b>${q.kills}/${q.needed}</b><br>해당 계열 몬스터를 월드에서 처치하면 게이지가 차고, 완충 시 보스가 소환됩니다!</div>`
        : '<p class="econ-note">의뢰를 시작하고 해당 계열 몬스터를 처치해 게이지를 채우세요. 완충되면 슬레이어 보스가 나타납니다!</p>'}
      ${D().SLAYERS.map(sd => {
        const lv = slayerLevel(sd.key), xp = slayerXpOf(sd.key);
        const T = D().SLAYER_XP_LEVELS; const next = lv < T.length ? T[lv] : null;
        return `<div class="econ-slayercard">
          <h4>${sd.name} <span style="color:#f6c945">Lv.${lv}</span> <span class="muted">${next ? `${xp}/${next} XP` : 'MAX'}</span></h4>
          <p class="muted">${sd.flavor} · 최고 처치 T${P.slayerBest[sd.key] || 0} · Lv3 보상: 전용 부적</p>
          <div class="econ-tierbtns">${sd.tiers.map(t => {
            const recAtk = Math.max(20, Math.round(t.hp / 60));
            const okLv = skillLevel('combat') >= t.minCombatLevel;
            return `<button class="btn btn--sm ${okLv ? '' : 'btn--ghost'}" data-act="econ_slayer_quest" data-key="${sd.key}" data-tier="${t.tier}" ${q ? 'disabled' : ''} title="보스 HP ${fmtNum(t.hp)} · 보스 공격 ${fmtNum(t.dmg)}">T${t.tier} 의뢰(${fmtGold(t.turnInGold)} · ${D().SLAYER_QUEST.killsNeeded[t.tier - 1]}마리)<br><span class="muted">HP ${fmtNum(t.hp)} · 전투Lv${t.minCombatLevel}+ · 권장⚔${fmtNum(recAtk)}</span></button>`;
          }).join('')}</div>
          <p class="muted">현재 내 공격력 ⚔${playerAttackPower().toFixed(0)} — 권장⚔ 이상이면 도전할 만해요${sd.uniqueDrop ? ` · T2+ 유니크: ${itemName(sd.uniqueDrop)} (12%)` : ''}</p>
        </div>`;
      }).join('')}
    </div>`;
  }

  function dungeonZoneHTML() {
    const MM = D().MASTER_MODE;
    const masterUnlocked = !!P.dungeonBest[MM.unlockFloor] && P.dungeonBest[MM.unlockFloor] !== 'F';
    return `<div class="econ-panel"><h4>🗝️ 카타콤 — 총 18개 난이도(입구 + 층 7 + 마스터 7 + ☠☠지옥 3)</h4>
      <p class="muted">던전 클래스: ${D().DUNGEON_CLASSES.map(c => `<button class="btn btn--sm ${P.dungeonClass === c.key ? '' : 'btn--ghost'}" data-act="econ_dungeon_class" data-key="${c.key}">${c.emoji} ${c.name}</button>`).join(' ')}</p>
      <div class="econ-shopgrid">${D().DUNGEON.floors.map(fd => {
        const ok = canEnterFloor(fd.floor);
        const best = P.dungeonBest[fd.floor];
        return `<div class="econ-floorcard">
          <h4>${fd.floor === 0 ? '🚪 입구(F0)' : fd.hell ? `☠☠ 지옥 M${fd.floor}` : `F${fd.floor}`} — ${fd.bossName}</h4>
          <p class="muted">보스 HP ${fmtNum(fd.bossHp)} · 정수 +${fd.essenceReward} · 최고 등급 ${best || '-'}${fd.hell ? ' · <b style="color:#ff5470">극악 난이도</b>' : ''}</p>
          <button class="btn btn--sm" data-act="econ_dungeon_start" data-floor="${fd.floor}" ${ok ? '' : 'disabled'}>${ok ? '입장' : fd.hell ? 'M7 클리어 필요' : '이전 층 클리어 필요'}</button>
          ${fd.floor >= 1 && !fd.hell ? `<button class="btn btn--sm btn--ghost" data-act="econ_dungeon_start" data-floor="${fd.floor}" data-master="1" ${masterUnlocked ? '' : 'disabled'} title="F7 클리어 시 해금">☠ M${fd.floor} (몹 ×${MM.hpMul} · 보상 ×${MM.rewardMul})</button>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="muted">☠ 마스터 모드: F7 클리어 후 해금 — 모든 몹이 강화되고 보상 ${MM.rewardMul}배</p>
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
    const roomName = { wave: '⚔️ 전투방', puzzle: '🧩 퍼즐방', miniboss: '👹 미니보스방', treasure: '💰 보물방', boss: '🔥 보스방' }[rt] || rt;
    let inner = '';
    if (rt === 'wave' || rt === 'miniboss' || rt === 'boss') {
      const alive = dungeonRun.mobs.filter(m => m.hp > 0).length;
      inner = `<div class="econ-moblist">${dungeonRun.mobs.map((m, i) => `
        <div class="econ-mobrow ${m.hp <= 0 ? 'is-dead' : ''}">
          <span>${m.hp <= 0 ? '💀' : m.isBoss ? '🔥' : '👾'} ${m.name}</span>
          <div class="econ-hpbar econ-hpbar--mob"><div class="econ-hpbar__fill" style="width:${(m.hp / m.maxHp * 100).toFixed(1)}%"></div><span>${Math.ceil(m.hp).toLocaleString('ko-KR')}/${m.maxHp.toLocaleString('ko-KR')}</span></div>
        </div>`).join('')}</div>
        <button class="btn btn--primary btn--lg" data-act="econ_dungeon_attack">공격! (${playerAttackPower().toFixed(0)}) — 남은 적 ${alive}</button>`;
    } else if (rt === 'puzzle') {
      inner = `<p>퍼즐방: 올바른 레버를 당기세요</p>
      <div class="econ-puzzlebtns">${[0, 1, 2].map(i => `<button class="btn" data-act="econ_dungeon_puzzle" data-i="${i}">레버 ${i + 1}</button>`).join('')}</div>`;
    } else if (rt === 'treasure') {
      inner = dungeonRun._treasureLooted
        ? `<p class="muted">상자를 이미 열었어요.</p><button class="btn btn--primary" data-act="econ_dungeon_advance">다음 방으로</button>`
        : `<p>반짝이는 보물 상자가 놓여 있다...</p><button class="btn btn--primary" data-act="econ_dungeon_loot">상자 열기</button>`;
    }
    const secretHint = dungeonRun.floor >= 3 ? `<div class="econ-secretdoor"><p class="muted">(수상한 벽...)</p>${['left', 'right'].map(d => `<button class="btn btn--sm btn--ghost" data-act="econ_dungeon_secret" data-dir="${d}">${d === 'left' ? '◀' : '▶'}</button>`).join('')}</div>` : '';
    return `<div class="econ-panel"><h3>카타콤 ${dungeonRun.floor}층 · 방 ${dungeonRun.roomIdx + 1}/${dungeonRun.rooms.length} — ${roomName} <span class="muted">(${dungeonRun.cls.emoji} ${dungeonRun.cls.name})</span></h3>
      <div class="econ-hpbar econ-hpbar--player"><div class="econ-hpbar__fill" style="width:${(dungeonRun.playerHp / dungeonRun.maxPlayerHp * 100).toFixed(1)}%"></div><span>내 HP ${Math.ceil(dungeonRun.playerHp)}/${dungeonRun.maxPlayerHp}</span></div>
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
      case 'zone': zone = el.dataset.key; renderZone(); break;
      case 'hubtab': hubTab = el.dataset.key; renderZone(); break;
      case 'buildbuy': buildBuy(el.dataset.key); break;
      case 'menu': zone = 'hub'; hubTab = el.dataset.key; renderZone(); break;
      case 'warp': if (typeof window.economy3dWarp === 'function') window.economy3dWarp(el.dataset.key); break;
      case 'gather': gather(el.dataset.key); break;
      case 'buy': buyItem(el.dataset.key); break;
      case 'sell': sellItem(el.dataset.key, 1); break;
      case 'sell_all': sellItem(el.dataset.key, P.inv[el.dataset.key] || 0); break;
      case 'minion_place': placeMinion(el.dataset.key); break;
      case 'minion_collect': collectMinion(Number(el.dataset.idx)); break;
      case 'minion_upgrade': upgradeMinion(Number(el.dataset.idx)); break;
      case 'minion_storage': upgradeMinionStorage(Number(el.dataset.idx)); break;
      case 'minion_fuel': useMinionFuel(el.dataset.key); break;
      case 'minion_collect_all': collectAllMinions(); break;
      case 'inv_filter': invFilter = el.dataset.key; renderZone(); break;
      case 'invcell': {   // V21-B: Shift+클릭 = MC식 즉시 핫바 이동/해제, 일반 클릭 = 상세
        if (window.__shiftDown && isPlaceableOrTool(el.dataset.key)) { assignHotbar(el.dataset.key); break; }
        invDetailKey = (invDetailKey === el.dataset.key ? null : el.dataset.key); renderZone(); break;
      }
      case 'assign_hotbar': assignHotbar(el.dataset.key); break;
      case 'assign_hotbar_slot': assignHotbar(el.dataset.key, Number(el.dataset.slot)); break;
      case 'portal_install': {   // V21-C: 포탈 아이템 설치 — 프라이빗 섬에서만, 설치 시 해당 섬 워프 해금
        const k = el.dataset.key, pi = (D().PORTAL_ITEMS || {})[k];
        if (!pi) break;
        const em = window.__econ3d;
        if (!em || typeof em.worldMode !== 'function' || em.worldMode() !== 'home') { toastFn('프라이빗 섬에서만 설치할 수 있어요', false); break; }
        if (!hasItem(k, 1)) { toastFn('포탈 아이템이 없어요', false); break; }
        P.portals = P.portals || {};
        if (P.portals[pi.dest]) { toastFn('이미 설치된 포탈이에요', false); break; }
        removeItem(k, 1);
        P.portals[pi.dest] = true;
        if (typeof em.installPortalFrame === 'function') em.installPortalFrame(pi.dest);
        toastFn(`🌀 ${pi.name} 설치! 이제 메뉴에서 워프할 수 있어요`, true);
        saveNow(); renderZone(); break;
      }
      case 'smelt': smeltItem(el.dataset.key); break;
      case 'craft_sel': craftSel = el.dataset.key; renderZone(); break;
      case 'craft_put': putCraftItem(el.dataset.key); break;
      case 'craft_grid_clear': clearCraftSlot(Number(el.dataset.i)); break;
      case 'craft_grid_clear_all': clearCraftGrid(); break;
      case 'craft_take': craftFromGrid(); break;
      case 'hpb': applyHpb(el.dataset.key); break;
      case 'salvage': salvageItem(el.dataset.key); break;
      case 'lock': toggleLock(el.dataset.key); break;
      case 'pin': togglePin(el.dataset.key); break;
      case 'daily_claim': claimDaily(Number(el.dataset.i)); break;
      case 'field_diff': setFieldDiff(el.dataset.key); break;
      case 'arena_start': startArena(el.dataset.key); break;
      case 'pet_hatch': hatchPet(el.dataset.key); break;
      case 'pet_activate': activatePet(el.dataset.key); break;
      case 'enchant': applyEnchant(el.dataset.key); break;
      case 'chaos': chaosEnchant(el.dataset.key); break;
      case 'star': enhanceStar(el.dataset.slot); break;
      case 'craft': craft(el.dataset.key); break;
      case 'reforge_slot': reforgeSlot(el.dataset.slot); break;
      case 'reforge_premium': reforgePremium(el.dataset.slot); break;
      case 'reforge_apex': reforgeApex(el.dataset.slot); break;
      case 'bz_cat': bazaarCat = el.dataset.key; renderZone(); break;
      case 'bz_qty': bazaarQty = Number(el.dataset.q) || 1; renderZone(); break;
      case 'bz_buy': bazaarInstantBuy(el.dataset.key, bazaarQty); break;
      case 'bz_sell': bazaarInstantSell(el.dataset.key, bazaarQty); break;
      case 'ah_dur': ahDur = Number(el.dataset.h) || 6; renderZone(); break;
      case 'ah_list': ahList(el.dataset.key, el.dataset.kind, Number(el.dataset.price), ahDur); break;
      case 'ah_claim': ahClaim(Number(el.dataset.id)); break;
      case 'ah_cancel': ahCancel(Number(el.dataset.id)); break;
      case 'hotm_tier': hotmUnlockTier(); break;
      case 'hotm_up': hotmUpgrade(el.dataset.key); break;
      case 'power': selectPower(el.dataset.key); break;
      case 'dungeon_attack': dungeonAttack(); break;
      case 'dungeon_loot': dungeonLootTreasure(); break;
      case 'bank_deposit': bankDeposit(el.dataset.amt === 'all' ? 'all' : Number(el.dataset.amt)); break;
      case 'bank_upgrade': upgradeBank(); break;
      case 'potion_use': usePotion(el.dataset.key); break;
      case 'slayer_quest': startSlayerQuest(el.dataset.key, Number(el.dataset.tier)); break;
      case 'bank_withdraw': bankWithdraw(el.dataset.amt === 'all' ? 'all' : Number(el.dataset.amt)); break;
      case 'deal_buy': buyDeal(Number(el.dataset.i)); break;
      case 'reforge': reforge(el.dataset.key); break;
      case 'slayer_start': startSlayer(el.dataset.key, Number(el.dataset.tier)); break;
      case 'dungeon_class': P.dungeonClass = el.dataset.key; saveNow(); renderZone(); break;
      case 'dungeon_start': {
        const f = Number(el.dataset.floor);
        const master = el.dataset.master === '1';
        // 3D 카타콤(직접 돌아다니며 전투) — 파티 호스트면 게스트도 자동 합류, 3D 미가동 시 패널 폴백
        const pt0 = net() && net().party();
        if (typeof window.economy3dDungeon === 'function' && window.economy3dDungeon(f, master)) {
          if (pt0 && pt0.role === 'host' && net()) net().partyD3Start(f);
          break;
        }
        startDungeon(f); break;
      }
      case 'dungeon_advance': dungeonAdvance(); break;
      case 'dungeon_puzzle': { if (dungeonRun.cls && dungeonRun.cls.autoPuzzle) { toastFn('🔮 메이지의 통찰 — 퍼즐 자동 해결!', true); dungeonAdvance('correct'); break; } const correct = dungeonRun._correctIdx == null ? (dungeonRun._correctIdx = Math.floor(Math.random() * 3)) : dungeonRun._correctIdx; dungeonAdvance(Number(el.dataset.i) === correct ? 'correct' : 'wrong'); dungeonRun._correctIdx = null; break; }
      case 'dungeon_secret': dungeonSecretClick(el.dataset.dir); break;
      case 'essence_buy': { const e = D().ESSENCE_SHOP.find(x => x.key === el.dataset.key); if (e && (P.inv.dungeon_essence || 0) >= e.cost) { removeItem('dungeon_essence', e.cost); if (e.kind === 'gold') addGold(e.goldAmount); else addItem(e.key, 1); saveNow(); renderZone(); } break; }
      case 'combat_attack': combatAttack(); break;
      case 'combat_flee': combatFlee(); break;
      /* ---- 멀티 ---- */
      case 'mp_trade': if (net()) net().tradeRequest(el.dataset.id); renderZone(); break;
      case 'mp_trade_acc': if (net()) net().tradeAccept(); renderZone(); break;
      case 'mp_trade_dec': if (net()) net().tradeDecline(); renderZone(); break;
      case 'mp_trade_cancel': if (net()) net().tradeCancel(); renderZone(); break;
      case 'mp_offer_add': if (net()) net().tradeAddItem(el.dataset.key); renderZone(); break;
      case 'mp_offer_rm': if (net()) net().tradeRemoveItem(el.dataset.key); renderZone(); break;
      case 'mp_gold': { const n0 = net(); if (n0 && n0.trade()) { const amt = Number(el.dataset.amt); n0.tradeSetGold(amt === 0 ? 0 : n0.trade().my.gold + amt); } renderZone(); break; }
      case 'mp_lock': if (net()) net().tradeLock(); renderZone(); break;
      case 'mp_confirm': if (net()) net().tradeConfirm(); renderZone(); break;
      case 'mp_party': { const n0 = net(); if (n0) { let f = 1; for (let i = 7; i >= 1; i--) if (canEnterFloor(i)) { f = i; break; } n0.partyInvite(el.dataset.id, f); } renderZone(); break; }
      case 'mp_pt_acc': if (net()) net().partyAccept(); renderZone(); break;
      case 'mp_pt_dec': if (net()) net().partyDecline(); renderZone(); break;
      case 'mp_pt_leave': if (net()) net().partyLeave(); renderZone(); break;
      case 'mp_pt_attack': if (net()) net().partySendAttack(playerAttackPower()); break;
      case 'mp_visit': if (net()) net().visit(el.dataset.name); break;
      case 'mp_visit_input': { const inp = document.getElementById('econVisitName'); if (inp && inp.value.trim() && net()) net().visit(inp.value.trim()); break; }
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
    ensureDaily(); checkAchievements(true);   // V11
    running = true;
    tickTimer = setInterval(() => { tickMinions(); ensureDaily(); checkAchievements(); if (running) renderZone(); }, 3000);
    // 멀티플레이 채널 접속(오프라인이면 조용히 비활성)
    if (window.econNet) {
      window.econNet.start();
      if (!window.__econNetBound) { window.__econNetBound = true; window.econNet.onUpdate(() => { if (running) renderZone(); }); }
    }
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
    if (window.econNet) window.econNet.stop();
    if (typeof window.economy3dStop === 'function') window.economy3dStop();
  }

  window.economyOpen = open;
  window.economyStop = stop;
  window.econAct = act;
  // 3D 프레젠테이션 레이어(economy3d.js) 공개 API
  window.econApi = {
    getP: () => P,
    save: () => saveNow(),   // V21-D2: 3D 측 진행 플래그(파크 게이트 등) 영속화
    hasActiveEncounter: () => !!(activeCombat || dungeonRun),
    collectFairySoul,
    fairySoulCollected: (id) => !!(P && P.fairySouls.indexOf(id) >= 0),
    // 프라이빗 섬 블록 편집 영속화(economy3d.js가 호출)
    getHomeEdits: () => (P ? P.homeEdits : {}),
    setHomeEdit: (x, y, z, id) => {
      if (!P) return false;
      const keys = Object.keys(P.homeEdits);
      if (keys.length > 6000 && P.homeEdits[`${x},${y},${z}`] === undefined) { toastFn('섬 편집 한도에 도달했어요(6,000블록)', false); return false; }
      P.homeEdits[`${x},${y},${z}`] = id;
      if (id) { stat('blocksPlaced'); tickQuests(true); }   // V13-B: 설치 퀘스트 카운터
      saveNow(); return true;
    },
    // 슈가 러시 등 이동속도 인챈트(%): economy3d.js가 매 프레임 참조
    moveSpeedPct: () => (P ? enchSum('speed') : 0),
    // 멀티(economy-net.js가 호출): 거래 검증/적용 + 파티 던전 훅
    tradeCanGive, tradeApply,
    partyStartDungeon, partyRemoteAttack, partyGuestReward,
    // 3D 인월드 게임플레이 브리지
    toolMul: fam => bestToolMul(fam),
    toolPower: fam => ({
      speedMul: bestToolMul(fam) * (1 + enchantLvl('tool', 'efficiency') * 0.12) * (fam === 'pickaxe' && hasItem('stonk') ? 1.6 : 1)
        * (1 + (traitSum('gatherer') + (fam === 'pickaxe' ? traitSum('miner') : fam === 'axe' ? traitSum('lumber') : 0)) / 100),   // V11 특성
      fortunePct: enchantLvl('tool', 'fortune') * 20,
      area: enchantLvl('tool', 'area_mining'),
      treecap: fam === 'axe' && hasItem('treecapitator'),
    }),
    hasTool: fam => (D().TOOLS[fam] || []).some(t => hasItem(t.key)),
    // V12 블럭 경제: 파괴 시 지급 / 설치 시 소모 / 보유 확인
    giveItem: (k, n) => { addItem(k, n || 1); addCollection(k, n || 1); if (running) renderZone(); },
    takeItem: (k, n) => { const ok = removeItem(k, n || 1); if (ok && running) renderZone(); return ok; },
    hasItem: (k, n) => hasItem(k, n || 1),
    invCount: k => (P.inv[k] || 0),
    ownedPlaceable: keys => keys.filter(k => (P.inv[k] || 0) > 0),   // 보유한 설치가능 아이템만
    setHotbar: (i, k) => { if (i >= 0 && i < 9) { P.hotbar[i] = k; saveNow(); } },
    getHotbar: () => P.hotbar.slice(),
    gatherBlock: gatherBlock3d,
    fishCatch: fishCatch3d,
    attackMob: attackMob3d,
    mobKilled: mobKilled3d,
    playerDied: playerDied3d,
    defensePct: lowHp => playerDefensePct(lowHp),
    maxHp: () => playerMaxHp(),
    statSpeed: () => playerStats().speed,
    skillLv: k => skillLevel(k),
    // V8 스탯 HUD(체력/방어/마나/속도) — 3D updateHpHud가 0.5초마다 조회
    hudStats: () => { const st = playerStats(); return { hp: st.hp, def: st.defense, mana: st.intelligence, speed: st.speed }; },
    slayerQuest: () => (P ? P.slayerQuest : null),          // V10 ⑰: 퀘스트 중 계열 스폰 부스트용
    slayerMobMap: SLAYER_MOB_MAP,
    activeBuffs: () => {                                     // V10 ㉖: HUD 버프 잔여시간
      if (!P || !P.buffs) return [];
      const now = Date.now(), out = [];
      for (const k in P.buffs) if (P.buffs[k] > now) out.push({ name: itemName(k).replace(/\(.*\)/, ''), left: Math.ceil((P.buffs[k] - now) / 1000) });
      return out;
    },
    canEnterFloor,
    // ---- V11 브리지 ----
    fieldDiff: () => fieldDiffDef(),
    weeklyFamily,
    slayerFamilyOf: t => SLAYER_MOB_MAP[t] || null,
    arenaDiff: k => arenaDiffDef(k),
    arenaWaveCleared, arenaComplete,
    traitSum, guardPct,
    anglerPct: () => traitSum('angler'),
    checkAch: () => checkAchievements(),
    // V13-B 위치기반 퀘스트 브리지
    questHud: (world, x, z) => questHudData(world, x, z),
    talkQuest: npcKey => talkQuestNpc(npcKey),
    questTick: () => tickQuests(true),
    equipDropFromSrc,
    addSharedXp: v => { if (P && v > 0) { addSkillXp('combat', Math.round(v)); toastFn(`🤝 파티 사냥 XP +${Math.round(v)}`, true); } },
    gearScore,
    peerGear: () => {   // V11: 프레즌스에 싣는 장착 요약(무기 키 + 티어 인덱스 5개)
      if (!P) return null;
      const tIdx = k => { const p = equippedPiece(k); return p ? D().ITEM_TIERS.findIndex(t => t.key === p.tierKey) : -1; };
      const w = equippedPiece('weapon');
      return { w: w ? w.key : null, wt: tIdx('weapon'), t: [tIdx('helmet'), tIdx('chest'), tIdx('leggings'), tIdx('boots')], gs: gearScore() };
    },
    dungeonFloorInfo: f => { const fd = dungeonFloorDef(f); return fd ? { floor: fd.floor, bossName: fd.bossName, bossHp: fd.bossHp, bossDmg: fd.bossDmg, mobList: fd.mobList, essenceReward: fd.essenceReward, hell: !!fd.hell } : null; },   // V11: hell 플래그
    dungeonComplete: dungeon3dComplete,
    isFresh: () => !!P && Object.keys(P.collections).length === 0 && P.minions.length === 0 && Object.keys(P.homeEdits).length === 0,
  };

  if (typeof window !== 'undefined' && window.__ECON_TEST) {
    window.__econ = {
      open, stop, act, getP: () => P, setP: v => { P = v; }, renderZone, itemName, itemLore, shopDef,
      gather, buyItem, sellItem, addItem, hasItem, removeItem, addGold,
      skillLevel, addSkillXp, addCollection, collectionTierIdx,
      placeMinion, upgradeMinion, upgradeMinionStorage, collectMinion, tickMinions, minionStorageCap, minionSpeedMul, useMinionFuel,
      startSlayer, combatAttack, combatFlee, getActiveCombat: () => activeCombat,
      startDungeon, dungeonAdvance, dungeonSecretClick, getDungeonRun: () => dungeonRun, dungeonGrade, canEnterFloor,
      reforge, reforgeSlot, reforgePremium, reforgeApex, bazaarPrice, bazaarInstantBuy, bazaarInstantSell, ahList, ahClaim, ahCancel, ahSettle, ahFairValue, ahCurrentBid, hotmUpgrade, hotmUnlockTier, hotmNodeLevel, hotmNodeCost, hotmStat, hotmAwardPowder, playerAttackPower, playerDefensePct, playerMaxHp, playerStr, playerStats, playerCritRoll, skillXpProgress, minionUnlocked, recordMinionCraft,
      gemStats, socketGem, applyRecomb, gemSlotsOf, recombMul,
      equippedWeapon, dungeonClassDef,
      hatchPet, activatePet, petLevel, petStats, petDef, equipPetItem,
      talismanStats, magicalPower, mpStatMul, powerStats, selectPower, mpScale, fairyBonus, collectFairySoul,
      applyEnchant, chaosEnchant, enchantLvl, enchantHardCap, enchantDef,
      enchSum, enchVsSum, enchCondMul, enchHitHeal, enchCoinMul, enchXpMul, randomEquipDrop,
      tradeCanGive, tradeApply, partyStartDungeon, partyRemoteAttack, partyGuestReward, partySnapshot,
      startSlayerQuest, slayerQuestProgress, slayerLevel, slayerXpOf, usePotion, buffBonus, bestiaryBonusPct, upgradeBank, bankTierInfo, dungeon3dComplete,
      enhanceStar, starCost, starRate,
      craft, canCraft, recipeUnlocked, rolledStat, rollItemStat, equipBase,
      putCraftItem, craftFromGrid, clearCraftGrid, craftGridRecipe, getCraftGrid: () => craftGrid, setCraftGrid: g => { craftGrid = Array.isArray(g) ? g.slice(0, 9) : Array(9).fill(null); while (craftGrid.length < 9) craftGrid.push(null); },
      smeltItem,
      dungeonAttack, dungeonLootTreasure,
      bankDeposit, bankWithdraw, bankInterestTick,
      dealsForToday, buyDeal, bestToolMul, sellBonusPct, minionSlotCost,
      freshPlayer, migrate, saveNow, saveLocal, loadLocal, loadCloud, cloudReady,
      setZone: z => { zone = z; }, getZone: () => zone, setHubTab: t => { hubTab = t; }, getHubTab: () => hubTab,
      // V11 테스트 노출
      equippedPiece, equippedBow, applyHpb, salvageItem, toggleLock, togglePin, gearScore, statValue,
      checkAchievements, ensureDaily, claimDaily, setFieldDiff, weeklyFamily, startArena, arenaWaveCleared, arenaComplete,
      traitSum, traitCtxMul, activeSetBonuses, equipDropFromSrc, hpbOf, equippedWeaponDmg,
    };
  }
})();
