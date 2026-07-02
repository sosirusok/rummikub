/* =========================================================================
   economy.js — "경제" 탭 게임 로직 V2 (하이픽셀 스카이블럭 x 메이플스토리)
   상태/규칙/패널 렌더링 담당. 3D 월드 표현은 economy3d.js(프레젠테이션 레이어).
   V2 신규: 펫·부적(마력)·인챈트·은행 이자·페어리 소울·일일 특가·도구 티어·미니언 연료.
   ========================================================================= */
(function () {
  const D = () => window.ECON_DATA;
  const SAVE_KEY = 'econ_save_v1';
  let running = false, tickTimer = null, zone = 'hub', hubTab = 'shop', invFilter = 'all';
  let P = null;   // 플레이어 상태(로드 후 채워짐)
  let activeCombat = null;   // { kind:'slayer'|'dungeonBoss', hp,maxHp,dmg,playerHp,maxPlayerHp,_hits, onWin, onLose }
  let dungeonRun = null;     // { floor, roomIdx, rooms:[...], score, secretStep }
  let toastFn = (typeof toast === 'function') ? toast : (m) => console.log(m);

  /* ---------------- 저장/불러오기 ---------------- */
  function freshPlayer() {
    return {
      ver: 6, gold: 0, dungeonClass: 'berserk', reforgeBonus: {}, inv: {}, minions: [], maxMinionSlots: 5, minionCrafts: {},
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
      starForce: { weapon: 0, armor: 0 },   // 스타포스(메이플식 성 강화) 0~15성
      itemRolls: {},                         // 장비 초기 능력치 롤({key: 굴려진 수치}) — 획득 시 ±8% 무작위 고정
      reforgeSlots: { weapon: null, armor: null },   // 명명 리포지({key,name,dmgPct,def,hp,sellBonus})
      homeEdits: {},                         // 프라이빗 섬 블록 편집("x,y,z" -> blockId, 0=제거)
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
    if (typeof p.starForce.weapon !== 'number') p.starForce = { weapon: 0, armor: 0 };
    if (!p.itemRolls || typeof p.itemRolls !== 'object') p.itemRolls = {};
    if (!p.reforgeSlots.weapon && p.reforgeSlots.weapon !== null) p.reforgeSlots = { weapon: null, armor: null };
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
  function addItem(k, n) { if (n <= 0) return; P.inv[k] = (P.inv[k] || 0) + n; rollItemStat(k); }
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
  function removeItem(k, n) { n = n || 1; if (!hasItem(k, n)) return false; P.inv[k] -= n; if (P.inv[k] <= 0) delete P.inv[k]; return true; }
  function addGold(n) { P.gold = Math.max(0, P.gold + n); }

  /* ---------------- 스킬 레벨 ---------------- */
  function skillDef(key) { return D().SKILLS.find(s => s.key === key); }
  function skillLevel(key) {
    const def = skillDef(key); if (!def) return 0;
    const T = D().SKILL_XP_TABLE, MAX = D().SKILL_MAX_LEVEL;
    let xp = P.skillsXp[key] || 0, lvl = 0;
    while (lvl < MAX) { const req = T[lvl]; if (xp < req) break; xp -= req; lvl++; }
    return lvl;
  }
  function skillXpProgress(key) {   // {cur, need} — 현재 레벨 내 진행도(UI 표시용)
    const T = D().SKILL_XP_TABLE, MAX = D().SKILL_MAX_LEVEL;
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
  // 무기: 검/활/지팡이 3계열 중 보유한 최고 위력 자동 장착(실제 스카이블럭처럼 직업 제한 없음)
  function equippedWeapon() {
    let best = null, bestDmg = -1;
    const cl = skillLevel('combat');
    for (const w of D().EQUIPMENT.weapons) {
      if (!hasItem(w.key)) continue;
      if ((w.reqCombat || 0) > cl) continue;   // V7: 요구 전투 레벨 미달 장비는 착용 불가
      if (w.dmg >= bestDmg) { bestDmg = w.dmg; best = w; }
    }
    return best;
  }
  function equippedArmor() {
    const cl = skillLevel('combat');
    const list = D().EQUIPMENT.armor;
    for (let i = list.length - 1; i >= 0; i--) if (hasItem(list[i].key) && (list[i].reqCombat || 0) <= cl) return list[i];
    return null;
  }
  function equippedWeaponDmg() {
    const w = equippedWeapon(); if (!w) return 0;
    return rolledStat(w.key, w.dmg) + (P.reforgeBonus[w.key] || 0);
  }
  function reforgeOf(slot) { return P.reforgeSlots[slot] || {}; }
  // ── 실제 스카이블럭 스탯 시트: 기본 HP100/방어0/힘0/속도100/크리확률30/크리피해50/지능100 ──
  function playerStats() {
    const B = D().BASE_STATS;
    const ts = talismanStats(), ps = petStats(), fb = fairyBonus();
    const a = equippedArmor();
    const st = {
      hp: B.hp + skillLevel('farming') * 2 + skillLevel('fishing') + enchSum('hp') + ts.hp + ps.hp + fb.hp
        + (reforgeOf('weapon').hp || 0) + (reforgeOf('armor').hp || 0) + starHpFlat() + buffBonus('hp'),
      defense: B.defense + skillLevel('mining') + ts.def + ps.def + enchSum('def')
        + (reforgeOf('armor').def || 0) + starDefFlat()
        + (a ? rolledStat(a.key, a.defense) : 0),
      strength: B.strength + skillLevel('foraging') + ts.str + ps.str + fb.str + buffBonus('strength'),
      speed: B.speed + enchSum('speed') + buffBonus('speed'),
      critChance: Math.min(100, B.critChance + skillLevel('combat') * 0.5),
      critDamage: B.critDamage + skillLevel('combat'),
      intelligence: B.intelligence + skillLevel('enchanting') * 2,
    };
    st.defense = Math.round(st.defense * mpStatMul());
    st.hp = Math.round(st.hp);
    return st;
  }
  function playerStr() { return playerStats().strength; }
  // 실제 공식: 피해 = (5 + 무기공격 + 힘/5) × (1 + 힘/100) × (배율들) — 크리티컬은 타격마다 별도 굴림
  function playerAttackPower() {
    const st = playerStats();
    const flat = 5 + equippedWeaponDmg() + st.strength / 5;
    const mul = (1 + st.strength / 100)
      * (1 + skillLevel('combat') * 0.04 + enchSum('dmg') / 100 + bestiaryBonusPct() / 100
        + (reforgeOf('weapon').dmgPct || 0) / 100 + starAtkPct() / 100)
      * mpStatMul();
    return flat * mul;
  }
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
    for (let i = 1; i <= stars; i++) sum += bands[i <= 5 ? 0 : i <= 10 ? 1 : 2];
    return sum;
  }
  function starAtkPct() { return starBandSum(P.starForce.weapon, D().STARFORCE.weaponAtkPctByBand); }
  function starDefFlat() { return starBandSum(P.starForce.armor, D().STARFORCE.armorDefByBand); }
  function starHpFlat() { return starBandSum(P.starForce.armor, D().STARFORCE.armorHpByBand); }
  function enhanceStar(slot) {
    const SF = D().STARFORCE;
    if (!P.starChance) P.starChance = { weapon: 0, armor: 0 };
    const cur = P.starForce[slot];
    if (cur >= SF.maxStars) { toastFn('이미 최대 성 강화예요 (★15)', false); return 'max'; }
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
    // 파괴: 장비는 남고 12성으로 리셋(메이플식)
    P.starForce[slot] = Math.min(cur, SF.boomResetTo);
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
  function canCraft(r) { return recipeUnlocked(r) && Object.keys(r.needs).every(k => (P.inv[k] || 0) >= r.needs[k]); }
  function craft(key) {
    const r = D().RECIPES.find(x => x.key === key); if (!r) return false;
    if (!recipeUnlocked(r)) { toastFn(r.unlock && r.unlock.skill ? `${r.unlock.skill === 'combat' ? '전투' : r.unlock.skill === 'enchanting' ? '마법부여' : '요구'} 스킬 ${r.unlock.lv}레벨 필요` : '컬렉션 티어가 부족해요', false); return false; }
    if (!canCraft(r)) { toastFn('재료가 부족해요', false); return false; }
    for (const k in r.needs) removeItem(k, r.needs[k]);
    addItem(key, r.gives || 1);
    addSkillXp('enchanting', 10);
    toastFn(`제작 완료: ${itemName(key)}`, true);
    saveNow(); renderZone(); return true;
  }

  /* ---------------- 채집(광산/농장/숲/부둣가) ---------------- */
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
    const sdef = shopDef(key);
    if (!sdef || !(sdef.buyPrice > 0)) { toastFn('이 게임의 골드는 강화·합성·리포지 전용! 아이템은 채집·드롭·조합으로 얻어요', false); return; }

    const def = shopDef(key); if (!def || def.buyPrice <= 0) return;
    // 특수: 미니언 슬롯 확장권(즉시 적용, 가격 누진)
    if (key === 'minion_slot_expander') {
      if (P.maxMinionSlots >= D().MINION_SLOT_MAX) { toastFn('미니언 슬롯이 최대예요', false); return; }
      const cost = minionSlotCost();
      if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
      addGold(-cost); P.maxMinionSlots++; P.minionSlotsBought++;
      toastFn(`미니언 슬롯 확장! (${P.maxMinionSlots}칸)`, true);
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
  function recordMinionCraft(key, tier) {
    if (!P.minionCrafts) P.minionCrafts = {};
    P.minionCrafts[`${key}:${tier}`] = 1;
    const uniq = Object.keys(P.minionCrafts).length;
    const slots = Math.min(D().MINION_SLOT_MAX, 5 + Math.floor(uniq / 2) + (P.minionSlotsBought || 0));
    if (slots > P.maxMinionSlots) { P.maxMinionSlots = slots; toastFn(`🎉 고유 미니언 조합 ${uniq}개 — 미니언 슬롯 ${slots}칸으로 확장!`, true); }
  }
  function placeMinion(key) {
    if (P.minions.length >= P.maxMinionSlots) { toastFn('미니언 슬롯이 가득 찼어요 (새 미니언을 조합하면 슬롯이 늘어나요)', false); return; }
    if (!minionUnlocked(key)) { toastFn('먼저 해당 자원 컬렉션 티어 1을 달성하세요', false); return; }
    const cost = minionTierInfo(key, 1).craftCost;
    if (!hasItem(cost.key, cost.n)) { toastFn(`조합 재료 부족: ${itemName(cost.key)} ×${cost.n}`, false); return; }
    removeItem(cost.key, cost.n);
    recordMinionCraft(key, 1);
    P.minions.push({ key, tier: 1, lastCollectAt: Date.now(), storage: 0, storageUpgraded: false });
    toastFn('⚙️ 미니언 조합 완료! 섬에 배치됐어요', true);
    saveNow(); renderZone();
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
  function itemName(key) { const s = shopDef(key); return s ? s.name : key; }
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
        // 보너스 장비 드롭(드롭 전용 풀) — 슬레이어 티어가 높을수록 좋은 티어까지 등장
        if (Math.random() < 0.25) {
          const bonus = randomEquipDrop(Math.min(6, tier + 1));
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
  function canEnterFloor(f) { if (f <= 1) return true; const prev = P.dungeonBest[f - 1]; return !!prev && prev !== 'F'; }   // F0/F1 상시 개방
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
    addItem(resKey, n); addCollection(resKey, n);
    addSkillXp(sk === 'combat' ? 'combat' : sk, RES_XP[resKey] || 2);
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
    let extra = null;
    const roll = Math.random();
    if (roll < 0.05) { const coins = 100 + Math.floor(Math.random() * 400); addGold(coins); extra = { kind: 'treasure', coins }; }
    else if (roll < 0.17) extra = { kind: 'seaCreature' };   // 3D 레이어가 바다 생물을 스폰
    saveLocal();
    return { key: pick.key, name: itemName(pick.key), n: qty, extra };
  }
  // 3D 전투: 한 타격의 피해 계산(크리/조건부 인챈트/흡혈 포함)
  function attackMob3d(ctx) {
    const crit = playerCritRoll();
    let dmg = playerAttackPower() * crit;
    dmg *= enchCondMul({ hitIdx: ctx.hitIdx || 0, targetHp: ctx.hp, targetMaxHp: ctx.maxHp, isBoss: !!ctx.isBoss, slayerKey: ctx.slayerKey || null });
    return { dmg, crit: crit > 1, heal: enchHitHeal(dmg) };
  }
  function mobKilled3d(mob) {
    if (!P) return 0;
    const msgs = [];
    const coins = Math.round((mob.coins || 0) * enchCoinMul());
    if (coins) addGold(coins);
    addSkillXp('combat', Math.round((mob.xp || 5) * enchXpMul()));
    const lootLv = enchantLvl('weapon', 'looting');
    for (const d of mob.drops || []) {
      if (d.chance != null && Math.random() > d.chance * (1 + lootLv * 0.15)) continue;   // 약탈: 희귀 드롭 확률도 +15%/레벨
      // V9: 기본 드롭은 약탈 0 기준 0~n개 랜덤(마인크래프트식), 약탈 레벨당 최대 +1
      let n = d.chance != null ? (d.n || 1) : Math.floor(Math.random() * ((d.n || 1) + 1 + lootLv));
      if (n <= 0) continue;
      addItem(d.key, n); addCollection(d.key, n);
      if ((d.chance == null ? 1 : d.chance) <= 0.25) msgs.push(`✨ ${itemName(d.key)} ×${n}`);
    }
    if (Math.random() < 0.03) {   // 희귀: 드롭 전용 장비
      const bonus = randomEquipDrop(Math.min(6, mob.tierCap == null ? 2 : mob.tierCap));
      if (bonus) msgs.push(`🎁 ${bonus.name}`);
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
    let bonusMsg = '';
    if (Math.random() < (master ? 0.8 : 0.40)) {
      const bonus = randomEquipDrop(Math.min(6, Math.max(1, floor) + (master ? 0 : 0)));
      if (bonus) bonusMsg = ` + 🎁 ${bonus.name}`;
    }
    toastFn(`🏆 ${master ? '☠M' + floor + ' ' : ''}${fd.bossName} 처치! 등급 ${grade} (점수 ${score}) · 정수 +${fd.essenceReward * rewardMul} · ${itemName(itemKey)}${bonusMsg}`, true);
    saveNow(); renderZone();
    return grade;
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
    const eq = slot === 'weapon' ? equippedWeapon() : equippedArmor();
    if (!eq) return null;
    const tierDef = D().ITEM_TIERS.find(t => t.key === eq.tierKey) || D().ITEM_TIERS[0];
    return tierDef.reforgeCost;
  }
  function reforgeSlot(slot) {
    const cost = reforgeSlotCost(slot);
    if (cost == null) { toastFn('장착 중인 장비가 없어요', false); return; }
    if (P.gold < cost) { toastFn('골드가 부족해요', false); return; }
    addGold(-cost);
    const pool = D().REFORGES[slot];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    P.reforgeSlots[slot] = Object.assign({}, pick);
    toastFn(`리포지 결과: [${pick.name}] ${slot === 'weapon' ? '무기' : '방어구'}!`, true);
    saveNow(); renderZone();
  }
  function reforgePremium(slot) {
    if (!hasItem('reforge_stone_rare')) { toastFn('리포지 스톤(희귀)이 필요해요', false); return; }
    const cost = reforgeSlotCost(slot);
    if (cost == null) { toastFn('장착 중인 장비가 없어요', false); return; }
    if (P.gold < cost * 2) { toastFn(`스톤 리포지는 ${fmtGold(cost * 2)}이 필요해요`, false); return; }
    removeItem('reforge_stone_rare', 1); addGold(-cost * 2);
    const pick = D().REFORGES.premium[slot];
    P.reforgeSlots[slot] = Object.assign({}, pick);
    toastFn(`💎 스톤 리포지! [${pick.name}] 확정 부여!`, true);
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
    ['talismans', '📿 장신구'], ['enchant', '✨ 인챈트'], ['star', '⭐ 강화'], ['reforge', '🔨 리포지'],
    ['craft', '⚒️ 제작'], ['deals', '🎪 특가'], ['collections', '📚 컬렉션'], ['stats', '📊 스탯'],
    ['multi', '🌐 멀티'],
  ];
  function iconImg(key) { return (typeof window.econIcon === 'function') ? `<img class="econ-icon" src="${window.econIcon(key)}" alt="">` : ''; }
  // 실제 스카이블럭식 아이템 로어(호버 툴팁): 이름 → 스탯 → 설명 → 등급 라인
  function itemLore(sdef) {
    if (!sdef) return '';
    const lines = [sdef.name];
    if (sdef.dmg) lines.push(`공격력: +${hasItem(sdef.key) ? rolledStat(sdef.key, sdef.dmg) : sdef.dmg}`);
    if (sdef.defense) lines.push(`방어력: +${hasItem(sdef.key) ? rolledStat(sdef.key, sdef.defense) : sdef.defense}`);
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
    return lines.join('\n');
  }
  function ttAttr(keyOrDef) {
    const sdef = typeof keyOrDef === 'string' ? shopDef(keyOrDef) : keyOrDef;
    if (!sdef) return '';
    return ` data-tt="${escHtml(itemLore(sdef))}"`;
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
      case 'bank': return bankHTML();
      case 'minions': return minionsHTML();
      case 'pets': return petsHTML();
      case 'talismans': return talismansHTML();
      case 'enchant': return enchantHTML();
      case 'star': return starForceHTML();
      case 'reforge': return reforgeHTML();
      case 'craft': return craftHTML();
      case 'deals': return dealsHTML();
      case 'collections': return collectionsHTML();
      case 'stats': return statsHTML();
      case 'multi': return multiHTML();
      case 'inv': return invHTML();
      case 'menu': return menuHTML();
      case 'slayer': return slayerZoneHTML();
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
      ['pets', '🐾', '펫', '펫 관리'], ['talismans', '📿', '장신구 가방', '부적/마력'],
      ['craft', '⚒️', '레시피 북', '제작(장인 NPC와 동일)'], ['bestiary', '📕', '도감', '처치 기록·마일스톤 보너스'], ['multi', '🌐', '멀티', '거래·파티·섬 방문'],
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
  function invHTML() {
    const all = Object.keys(P.inv).filter(k => (P.inv[k] || 0) > 0);
    if (!all.length) return `<h4>🎒 인벤토리</h4><p class="econ-note">아직 아이템이 없어요. 섬을 돌아다니며 채굴·벌목·낚시·전투로 모아보세요!</p>`;
    const FILTERS = [['all', '전체'], ['mat', '재료'], ['equip', '장비/도구'], ['book', '인챈트북'], ['use', '소모품'], ['etc', '기타']];
    const keys = invFilter === 'all' ? all : all.filter(k => invCatOf(k, shopDef(k)) === invFilter);
    return `<h4>🎒 인벤토리 (${keys.length}/${all.length}종)</h4>
      <div class="econ-tierbtns">${FILTERS.map(f => `<button class="btn btn--sm ${invFilter === f[0] ? '' : 'btn--ghost'}" data-act="econ_inv_filter" data-key="${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="econ-shopgrid">${keys.map(k => {
        const sdef = shopDef(k);
        const sell = sdef && sdef.sellPrice > 0 ? sdef.sellPrice : 0;
        return `<div class="econ-shopitem econ-tt"${ttAttr(sdef || { key: k, name: itemName(k) })}>
          ${iconImg(k)}<span>${sdef && sdef.tierKey ? `<span style="color:${tierColorByKey(sdef.tierKey)}">${itemName(k)}</span>` : itemName(k)} <b>×${P.inv[k]}</b></span>
          <span class="muted econ-idesc">${shopItemDesc(sdef || { key: k })}</span>
          ${k.indexOf('potion_') === 0 ? `<button class="btn btn--sm" data-act="econ_potion_use" data-key="${k}">🧪 마시기(5분 버프)</button>` : ''}
          ${sell ? `<span><button class="btn btn--sm btn--ghost" data-act="econ_sell" data-key="${k}">1개 판매 ${fmtGold(sell)}</button></span>` : '<span class="muted">판매 불가</span>'}
        </div>`;
      }).join('')}</div>`;
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
    return `<h4>🌐 멀티플레이 — 접속 중인 플레이어 ${list.length}명</h4>
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
    const nextSlotAt = (Math.floor(uniq / 2) + 1) * 2;   // 다음 슬롯이 열리는 고유 조합 수
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
      <p class="muted">실제 스카이블럭처럼 미니언은 <b>자원으로 조합</b>해요. 컬렉션 티어 1 달성 시 해금, 고유 조합 2개마다 슬롯 +1!</p>
      <div class="econ-minionplace">${D().MINIONS.map(m => {
        const c = m.tiers[0].craftCost; const un = minionUnlocked(m.key); const have = (P.inv[c.key] || 0);
        return `<button class="btn btn--sm ${un ? '' : 'btn--ghost'}" data-act="econ_minion_place" data-key="${m.key}" ${un ? '' : 'disabled'}>${m.name}<br><span class="muted">${un ? `${itemName(c.key)} ${have}/${c.n}` : '컬렉션 티어1 필요'}</span></button>`;
      }).join('')}</div>
      <div class="econ-minionlist">${P.minions.map((m, i) => minionRowHTML(m, i)).join('') || '<p class="muted">배치된 미니언이 없어요 (자원을 모아 조합하세요)</p>'}</div>`;
  }
  function petsHTML() {
    const eggs = D().SHOP.filter(s => s.category === '펫' && hasItem(s.key));
    return `<h4>🐾 펫 (활성 1마리의 보너스가 적용돼요)</h4>
      ${eggs.length ? `<h4 class="muted">보유한 알</h4><div class="econ-tierbtns">${eggs.map(e => `<button class="btn btn--sm" data-act="econ_pet_hatch" data-key="${e.key.replace('pet_egg_', '')}">${e.name} 부화 (보유 ${P.inv[e.key]})</button>`).join('')}</div>` : ''}
      <div class="econ-shopgrid">${D().PETS.map(p => {
        const owned = !!P.pets[p.key]; const lvl = owned ? petLevel(p.key) : 0;
        return `<div class="econ-shopitem">
          ${iconImg(`pet_egg_${p.key}`)}<span style="color:${tierColorByKey(p.tierKey)}">${p.name} [${tierNameByKey(p.tierKey)}]</span>
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
          ${iconImg(t.key)}<span style="color:${tierColorByKey(t.tierKey)}">${hasItem(t.key) ? '✔ ' : ''}${t.name}</span>
          <span class="muted">${t.desc}</span>
          ${!hasItem(t.key) && t.buyPrice > 0 ? `<button class="btn btn--sm" data-act="econ_buy" data-key="${t.key}">구매 ${fmtGold(t.buyPrice)}</button>` : ''}
        </div>`).join('')}</div>
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
  function starForceHTML() {
    const SF = D().STARFORCE;
    const rows = ['weapon', 'armor'].map(slot => {
      const eq = slot === 'weapon' ? equippedWeapon() : equippedArmor();
      const cur = P.starForce[slot];
      const row = starRow(slot);
      const chance = starChanceTime(slot);
      const bandNow = cur < 5 ? 0 : cur < 10 ? 1 : 2;
      const gain = slot === 'weapon' ? `공격 +${SF.weaponAtkPctByBand[bandNow]}%` : `방어 +${SF.armorDefByBand[bandNow]} · 체력 +${SF.armorHpByBand[bandNow]}`;
      return `<div class="econ-starcard">
        <h4>${slot === 'weapon' ? '⚔️ 무기' : '🛡 방어구'} ★${cur}${chance ? ' <span style="color:#f6c945">🌟 찬스 타임(100%)</span>' : ''}</h4>
        <p class="muted">${eq ? eq.name : '장착 장비 없음'} · 누적: ${slot === 'weapon' ? `공격 +${starAtkPct()}%` : `방어 +${starDefFlat()} · 체력 +${starHpFlat()}`}</p>
        ${cur >= SF.maxStars ? '<p><b>★15 최대 강화 달성!</b></p>' : `
        <div class="econ-colgrid">
          <div class="econ-colrow"><span>성공 ${Math.round((chance ? 1 : row[0]) * 100)}%</span><span>유지 ${Math.round((chance ? 0 : row[1]) * 100)}%</span><span>하락 ${Math.round((chance ? 0 : row[2]) * 100)}%</span><span>${row[3] > 0 ? `💣 파괴 ${Math.round((chance ? 0 : row[3]) * 100)}% (★${SF.boomResetTo} 리셋)` : '파괴 없음'}</span></div>
          <div class="econ-colrow"><span>성공 시 ${gain}</span><span class="muted">구간: 1~5성 소폭 · 6~10성 중폭 · 11~15성 대폭</span></div>
        </div>
        <button class="btn" data-act="econ_star" data-slot="${slot}" ${eq ? '' : 'disabled'}>강화 (${fmtGold(starCost(slot))})</button>
        <p class="muted">2연속 하락 시 다음 강화는 찬스 타임(100% 성공) — 메이플 방식</p>`}
      </div>`;
    }).join('');
    return `<h4>⭐ 스타포스 강화(메이플식 체계)</h4>${rows}`;
  }
  function reforgeHTML() {
    const row = (slot, label, eq) => {
      const cur = P.reforgeSlots[slot];
      const cost = reforgeSlotCost(slot);
      return `<div class="econ-starcard">
        <h4>${label} — ${eq ? `<span style="color:${tierColorByKey(eq.tierKey)}">${cur ? `[${cur.name}] ` : ''}${eq.name}</span>` : '<span class="muted">장비 없음</span>'}</h4>
        <p class="muted">${cur ? `현재 보너스: ${cur.dmgPct ? `공격 +${cur.dmgPct}% ` : ''}${cur.def ? `방어 +${cur.def} ` : ''}${cur.hp ? `체력 +${cur.hp} ` : ''}${cur.sellBonus ? `판매가 +${cur.sellBonus}%` : ''}` : '리포지 없음 — 무작위 접두어를 부여해보세요'}</p>
        <button class="btn btn--sm" data-act="econ_reforge_slot" data-slot="${slot}" ${eq ? '' : 'disabled'}>🎲 무작위 리포지 ${cost != null ? `(${fmtGold(cost)})` : ''}</button>
        <button class="btn btn--sm btn--ghost" data-act="econ_reforge_premium" data-slot="${slot}" ${eq && hasItem('reforge_stone_rare') ? '' : 'disabled'}>💎 스톤 확정 [${D().REFORGES.premium[slot].name}] (스톤 1 + ${cost != null ? fmtGold(cost * 2) : '-'})</button>
      </div>`;
    };
    return `<h4>🔨 재련소 — 무작위 리포지로 대박을 노리거나, 리포지 스톤으로 확정 최상급을!</h4>
      ${row('weapon', '무기', equippedWeapon())}
      ${row('armor', '방어구', equippedArmor())}
      <p class="muted">보유 리포지 스톤(희귀): ${P.inv.reforge_stone_rare || 0}</p>`;
  }
  function craftHTML() {
    return `<h4>⚒️ 제작대 — 컬렉션 티어를 올리면 레시피가 해금돼요(실제 스카이블럭 방식)</h4>
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
          <button class="btn btn--sm" data-act="econ_craft" data-key="${r.key}" ${canCraft(r) ? '' : 'disabled'}>제작</button>
        </div>`;
      }).join('')}</div>`;
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
        <div class="econ-colrow"><span>⚔ 공격력</span><span>${playerAttackPower().toFixed(1)}</span><span class="muted">무기: ${w ? w.name : '없음'}</span></div>
        <div class="econ-colrow"><span>☠ 크리 확률</span><span>${st.critChance.toFixed(1)}%</span><span class="muted">크리 피해 +${st.critDamage.toFixed(0)}%</span></div>
        <div class="econ-colrow"><span>✦ 이동속도</span><span>${st.speed}</span><span class="muted">100 = 기준(슈가 러시로 증가)</span></div>
        <div class="econ-colrow"><span>✎ 지능(마나)</span><span>${st.intelligence}</span><span class="muted">마법부여 레벨당 +2</span></div>
        <div class="econ-colrow"><span>🛡 방어구</span><span>${a ? a.name : '없음'}</span><span class="muted">마력 ${magicalPower()}</span></div>
      </div>
      <h4>스킬</h4>
      <div class="econ-colgrid">${D().SKILLS.map(s => `<div class="econ-colrow"><span>${s.name}</span><span>Lv.${skillLevel(s.key)}</span><span class="muted">${s.bonusText}</span></div>`).join('')}</div>
      <h4>펫 · 던전 클래스</h4>
      <p class="muted">${P.activePet ? `활성 펫: ${petDef(P.activePet).name} Lv.${petLevel(P.activePet)}` : '활성 펫 없음'} · 던전 클래스: ${dungeonClassDef(P.dungeonClass).emoji} ${dungeonClassDef(P.dungeonClass).name}</p>`;
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
    return `<div class="econ-panel"><h4>🗝️ 카타콤 — 총 15개 난이도(입구 + 층 7 + 마스터 7)</h4>
      <p class="muted">던전 클래스: ${D().DUNGEON_CLASSES.map(c => `<button class="btn btn--sm ${P.dungeonClass === c.key ? '' : 'btn--ghost'}" data-act="econ_dungeon_class" data-key="${c.key}">${c.emoji} ${c.name}</button>`).join(' ')}</p>
      <div class="econ-shopgrid">${D().DUNGEON.floors.map(fd => {
        const ok = canEnterFloor(fd.floor);
        const best = P.dungeonBest[fd.floor];
        return `<div class="econ-floorcard">
          <h4>${fd.floor === 0 ? '🚪 입구(F0)' : `F${fd.floor}`} — ${fd.bossName}</h4>
          <p class="muted">보스 HP ${fd.bossHp.toLocaleString()} · 정수 +${fd.essenceReward} · 최고 등급 ${best || '-'}</p>
          <button class="btn btn--sm" data-act="econ_dungeon_start" data-floor="${fd.floor}" ${ok ? '' : 'disabled'}>${ok ? '입장' : '이전 층 클리어 필요'}</button>
          ${fd.floor >= 1 ? `<button class="btn btn--sm btn--ghost" data-act="econ_dungeon_start" data-floor="${fd.floor}" data-master="1" ${masterUnlocked ? '' : 'disabled'} title="F7 클리어 시 해금">☠ M${fd.floor} (몹 ×${MM.hpMul} · 보상 ×${MM.rewardMul})</button>` : ''}
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
      case 'pet_hatch': hatchPet(el.dataset.key); break;
      case 'pet_activate': activatePet(el.dataset.key); break;
      case 'enchant': applyEnchant(el.dataset.key); break;
      case 'chaos': chaosEnchant(el.dataset.key); break;
      case 'star': enhanceStar(el.dataset.slot); break;
      case 'craft': craft(el.dataset.key); break;
      case 'reforge_slot': reforgeSlot(el.dataset.slot); break;
      case 'reforge_premium': reforgePremium(el.dataset.slot); break;
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
    running = true;
    tickTimer = setInterval(() => { tickMinions(); if (running) renderZone(); }, 3000);
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
      speedMul: bestToolMul(fam) * (1 + enchantLvl('tool', 'efficiency') * 0.12) * (fam === 'pickaxe' && hasItem('stonk') ? 1.6 : 1),
      fortunePct: enchantLvl('tool', 'fortune') * 20,
      area: enchantLvl('tool', 'area_mining'),
      treecap: fam === 'axe' && hasItem('treecapitator'),
    }),
    hasTool: fam => (D().TOOLS[fam] || []).some(t => hasItem(t.key)),
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
    dungeonFloorInfo: f => { const fd = dungeonFloorDef(f); return fd ? { floor: fd.floor, bossName: fd.bossName, bossHp: fd.bossHp, bossDmg: fd.bossDmg, mobList: fd.mobList, essenceReward: fd.essenceReward } : null; },
    dungeonComplete: dungeon3dComplete,
    isFresh: () => !!P && Object.keys(P.collections).length === 0 && P.minions.length === 0 && Object.keys(P.homeEdits).length === 0,
  };

  if (typeof window !== 'undefined' && window.__ECON_TEST) {
    window.__econ = {
      open, stop, act, getP: () => P, setP: v => { P = v; }, renderZone,
      gather, buyItem, sellItem, addItem, hasItem, removeItem, addGold,
      skillLevel, addSkillXp, addCollection, collectionTierIdx,
      placeMinion, upgradeMinion, upgradeMinionStorage, collectMinion, tickMinions, minionStorageCap, minionSpeedMul, useMinionFuel,
      startSlayer, combatAttack, combatFlee, getActiveCombat: () => activeCombat,
      startDungeon, dungeonAdvance, dungeonSecretClick, getDungeonRun: () => dungeonRun, dungeonGrade, canEnterFloor,
      reforge, reforgeSlot, reforgePremium, playerAttackPower, playerDefensePct, playerMaxHp, playerStr, playerStats, playerCritRoll, skillXpProgress, minionUnlocked, recordMinionCraft,
      equippedWeapon, dungeonClassDef,
      hatchPet, activatePet, petLevel, petStats, petDef,
      talismanStats, magicalPower, mpStatMul, fairyBonus, collectFairySoul,
      applyEnchant, chaosEnchant, enchantLvl, enchantHardCap, enchantDef,
      enchSum, enchVsSum, enchCondMul, enchHitHeal, enchCoinMul, enchXpMul, randomEquipDrop,
      tradeCanGive, tradeApply, partyStartDungeon, partyRemoteAttack, partyGuestReward, partySnapshot,
      startSlayerQuest, slayerQuestProgress, slayerLevel, slayerXpOf, usePotion, buffBonus, bestiaryBonusPct, upgradeBank, bankTierInfo, dungeon3dComplete,
      enhanceStar, starCost, starRate,
      craft, canCraft, recipeUnlocked, rolledStat, rollItemStat, equipBase,
      dungeonAttack, dungeonLootTreasure,
      bankDeposit, bankWithdraw, bankInterestTick,
      dealsForToday, buyDeal, bestToolMul, sellBonusPct, minionSlotCost,
      freshPlayer, migrate, saveNow, saveLocal, loadLocal, loadCloud, cloudReady,
      setZone: z => { zone = z; }, getZone: () => zone, setHubTab: t => { hubTab = t; }, getHubTab: () => hubTab,
    };
  }
})();
