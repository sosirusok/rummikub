/* =========================================================================
   economy-data.js — 경제 탭(하이픽셀 스카이블럭 x 메이플스토리) 데이터 레이어 V2
   순수 데이터만 정의(로직은 economy.js, 3D 월드는 economy3d.js).
   V2: 자원 31종·미니언 20종·슬레이어 5종(실제 스카이블럭 보스 라인업)·던전 7층(카타콤)
   ·장신구(부적) 20종+마력(Magical Power)·펫 12종·인챈트·페어리 소울·은행 이자·일일 특가.
   ========================================================================= */
(function () {
  const ITEM_TIERS = [
    { key: 'common', name: '일반', colorHex: '#D1D5D8', statMultiplier: 1, reforgeCost: 250, magicalPower: 3 },
    { key: 'uncommon', name: '고급', colorHex: '#41A85F', statMultiplier: 1.2, reforgeCost: 500, magicalPower: 5 },
    { key: 'rare', name: '희귀', colorHex: '#2C82C9', statMultiplier: 1.4, reforgeCost: 1000, magicalPower: 8 },
    { key: 'epic', name: '영웅', colorHex: '#9365B8', statMultiplier: 1.6, reforgeCost: 2500, magicalPower: 12 },
    { key: 'legendary', name: '전설', colorHex: '#FAC51C', statMultiplier: 1.8, reforgeCost: 5000, magicalPower: 16 },
    { key: 'mythic', name: '신화', colorHex: '#E048C4', statMultiplier: 2.0, reforgeCost: 9000, magicalPower: 22 },
    { key: 'ancient', name: '고대', colorHex: '#5DECD5', statMultiplier: 2.4, reforgeCost: 15000, magicalPower: 28 },
  ];

  /* ---------------- 컬렉션(자원 31종, 5개 카테고리) ---------------- */
  function res(key, name, sell, th0) { return { key, name, stackSize: 64, sellPrice: sell, tierThresholds: [th0, th0 * 5, th0 * 20, th0 * 80, th0 * 240, th0 * 800] }; }
  const COLLECTIONS = [
    { category: '채굴', key: 'mining', resources: [
      res('stone', '조약돌', 2, 50), res('coal', '석탄', 3, 40), res('iron', '철 주괴', 6, 60),
      res('gold', '금 주괴', 12, 40), res('lapis', '청금석', 8, 40), res('redstone', '레드스톤', 7, 40),
      res('diamond', '다이아몬드', 45, 20), res('emerald', '에메랄드', 25, 20), res('obsidian', '흑요석', 18, 15),
    ] },
    { category: '농사', key: 'farming', resources: [
      res('wheat', '밀', 3, 50), res('carrot', '당근', 3, 50), res('potato', '감자', 3, 50),
      res('pumpkin', '호박', 6, 30), res('melon', '수박', 5, 40), res('sugarcane', '사탕수수', 4, 40),
    ] },
    { category: '벌목', key: 'foraging', resources: [
      res('oaklog', '참나무 원목', 5, 40), res('birchlog', '자작나무 원목', 5, 40),
      res('sprucelog', '가문비 원목', 6, 35), res('apple', '사과', 8, 20),
    ] },
    { category: '낚시', key: 'fishing', resources: [
      res('rawfish', '생선', 4, 30), res('salmon', '연어', 7, 25), res('clownfish', '광대어', 20, 12),
      res('pufferfish', '복어', 12, 20), res('prismarine', '프리즈마린 조각', 9, 25),
      res('sponge', '스펀지', 30, 8), res('clay', '점토', 4, 30),
    ] },
    { category: '전투', key: 'combat', resources: [
      res('rotten_flesh', '썩은 살점', 2, 40), res('bone', '뼈', 3, 40), res('string', '거미줄', 4, 30),
      res('ender_pearl', '엔더 진주', 15, 15), res('blaze_rod', '블레이즈 막대', 20, 12),
    ] },
  ];

  const SKILLS = [
    { key: 'combat', name: '전투', xpBase: 50, xpExp: 1.9, bonusText: '레벨당 최종 피해 +4%' },
    { key: 'mining', name: '채광', xpBase: 40, xpExp: 1.8, bonusText: '레벨당 방어력 +1' },
    { key: 'farming', name: '농사', xpBase: 40, xpExp: 1.8, bonusText: '레벨당 체력 +2' },
    { key: 'foraging', name: '벌목', xpBase: 45, xpExp: 1.8, bonusText: '레벨당 힘 +1' },
    { key: 'fishing', name: '낚시', xpBase: 50, xpExp: 1.85, bonusText: '레벨당 체력 +1' },
    { key: 'enchanting', name: '마법부여', xpBase: 60, xpExp: 1.9, bonusText: '레벨당 지력 +2' },
    { key: 'taming', name: '조련', xpBase: 45, xpExp: 1.85, bonusText: '레벨당 펫 경험치 +1%' },
    { key: 'social', name: '사교', xpBase: 30, xpExp: 1.7, bonusText: '5레벨마다 상점 판매가 +1%(최대 +10%)' },
  ];
  // xpToLevel(n) = xpBase * n^xpExp  (n=현재 레벨, 다음 레벨까지 필요한 증분 XP)

  /* ---------------- 채집(4개 존: 광산/농장/숲/부둣가) ---------------- */
  const GATHER_TABLE = {
    mine: { skill: 'mining', toolFamily: 'pickaxe', drops: [
      { key: 'stone', weight: 38, min: 1, max: 3 }, { key: 'coal', weight: 18, min: 1, max: 2 },
      { key: 'iron', weight: 14, min: 1, max: 2 }, { key: 'gold', weight: 9, min: 1, max: 2 },
      { key: 'lapis', weight: 8, min: 1, max: 3 }, { key: 'redstone', weight: 7, min: 1, max: 3 },
      { key: 'diamond', weight: 3, min: 1, max: 1 }, { key: 'emerald', weight: 2, min: 1, max: 1 },
      { key: 'obsidian', weight: 1, min: 1, max: 1 },
    ] },
    farm: { skill: 'farming', toolFamily: 'hoe', drops: [
      { key: 'wheat', weight: 28, min: 1, max: 4 }, { key: 'carrot', weight: 22, min: 1, max: 3 },
      { key: 'potato', weight: 22, min: 1, max: 3 }, { key: 'sugarcane', weight: 12, min: 1, max: 3 },
      { key: 'pumpkin', weight: 9, min: 1, max: 1 }, { key: 'melon', weight: 7, min: 1, max: 2 },
    ] },
    forest: { skill: 'foraging', toolFamily: 'axe', drops: [
      { key: 'oaklog', weight: 42, min: 1, max: 3 }, { key: 'birchlog', weight: 30, min: 1, max: 2 },
      { key: 'sprucelog', weight: 20, min: 1, max: 2 }, { key: 'apple', weight: 8, min: 1, max: 1 },
    ] },
    dock: { skill: 'fishing', toolFamily: 'rod', drops: [
      { key: 'rawfish', weight: 40, min: 1, max: 1 }, { key: 'salmon', weight: 20, min: 1, max: 1 },
      { key: 'clay', weight: 14, min: 1, max: 2 }, { key: 'pufferfish', weight: 12, min: 1, max: 1 },
      { key: 'prismarine', weight: 8, min: 1, max: 1 }, { key: 'clownfish', weight: 4, min: 1, max: 1 },
      { key: 'sponge', weight: 2, min: 1, max: 1 },
    ] },
  };

  /* ---------------- 도구(존별 4계열 × 5티어, 수확량 배율) ---------------- */
  // 도구 없음 = 0.5배. 상위 도구 보유 시 최고 티어의 배율 적용.
  const TOOL_TIER_NAMES = ['나무', '돌', '철', '다이아', '태초의'];
  const TOOL_MULS = [1.0, 1.2, 1.45, 1.75, 2.2];
  const TOOL_PRICES = [50, 200, 800, 5000, 30000];
  const TOOL_FAMILY_NAMES = { pickaxe: '곡괭이', hoe: '괭이', axe: '도끼', rod: '낚싯대' };
  const TOOL_TIER_KEYS = ['wooden', 'stone', 'iron', 'diamond', 'ancient'];
  const TOOLS = {};   // family -> [{key,name,mul,price}] 낮은 티어부터
  Object.keys(TOOL_FAMILY_NAMES).forEach(fam => {
    TOOLS[fam] = TOOL_TIER_KEYS.map((tk, i) => ({
      key: fam === 'rod' && i === 0 ? 'fishing_rod' : `${tk}_${fam}`,   // 기존 세이브 호환(fishing_rod 키 유지)
      name: fam === 'rod' && i === 0 ? '낚싯대' : `${TOOL_TIER_NAMES[i]} ${TOOL_FAMILY_NAMES[fam]}`,
      mul: TOOL_MULS[i], price: fam === 'rod' ? Math.round(TOOL_PRICES[i] * 1.5) : TOOL_PRICES[i],
    }));
  });

  /* ---------------- 미니언 20종 ---------------- */
  // 실제 스카이블럭처럼 11티어(위키: 미니언은 최대 11~12티어) — 고티어는 기하급수 골드 싱크
  function mkMinionTiers(baseInterval, baseCost) {
    const tiers = [];
    for (let t = 1; t <= 11; t++) tiers.push({ tier: t, intervalSec: +(baseInterval * Math.pow(0.9, t - 1)).toFixed(1), cost: Math.round(baseCost * Math.pow(2, t - 1)) });
    return tiers;
  }
  function minion(key, name, resource, baseInterval, baseCost) { return { key, name, resource, tiers: mkMinionTiers(baseInterval, baseCost), maxTier: 11 }; }
  const MINIONS = [
    minion('cobblestone_minion', '채석 일꾼', 'stone', 27, 80),
    minion('coal_minion', '석탄 일꾼', 'coal', 27, 80),
    minion('iron_minion', '철 일꾼', 'iron', 28, 80),
    minion('gold_minion', '금 일꾼', 'gold', 29, 120),
    minion('lapis_minion', '청금석 일꾼', 'lapis', 29, 120),
    minion('redstone_minion', '레드스톤 일꾼', 'redstone', 29, 120),
    minion('diamond_minion', '다이아 일꾼', 'diamond', 32, 400),
    minion('emerald_minion', '에메랄드 일꾼', 'emerald', 33, 400),
    minion('obsidian_minion', '흑요석 일꾼', 'obsidian', 36, 500),
    minion('wheat_minion', '밀 일꾼', 'wheat', 25, 80),
    minion('carrot_minion', '당근 일꾼', 'carrot', 25, 80),
    minion('potato_minion', '감자 일꾼', 'potato', 25, 80),
    minion('pumpkin_minion', '호박 일꾼', 'pumpkin', 30, 150),
    minion('melon_minion', '수박 일꾼', 'melon', 28, 150),
    minion('sugarcane_minion', '사탕수수 일꾼', 'sugarcane', 24, 80),
    minion('oak_minion', '참나무 일꾼', 'oaklog', 26, 80),
    minion('birch_minion', '자작나무 일꾼', 'birchlog', 26, 80),
    minion('spruce_minion', '가문비 일꾼', 'sprucelog', 27, 100),
    minion('fishing_minion', '어부 일꾼', 'rawfish', 30, 60),
    minion('clay_minion', '점토 일꾼', 'clay', 26, 60),
  ];
  const MINION_STORAGE_BASE = 15, MINION_STORAGE_UPGRADED = 24, MINION_STORAGE_UPGRADE_COST = 5000;
  const MINION_OFFLINE_CAP_HOURS = 48;
  const MINION_SLOT_MAX = 15, MINION_SLOT_COST_BASE = 6000, MINION_SLOT_COST_MUL = 1.6;
  const MINION_FUEL = { key: 'minion_fuel_coal', name: '석탄 연료(24시간 +25%)', speedMul: 1.25, durationHours: 24, price: 800 };

  /* ---------------- 슬레이어 5종(실제 스카이블럭 라인업) ---------------- */
  // rareDropTable: 실제 아이템 키 배열(승리 시 인벤토리에 실제 지급). [자주(60%), 가끔(30%), 희귀(10%)]
  function mkSlayerTiers(baseHp, baseDmg, baseXp, baseCoin, mulScale, lootByTier) {
    const costMul = [1, 4, 16, 60], hpMul = [1, 7.5, 50, 375], dmgMul = [1, 3, 7.5, 20], xpMul = [1, 5, 40, 100], coinMul = [1, 8.67, 16.7, 60];
    return lootByTier.map((loot, i) => ({
      tier: i + 1,
      turnInGold: Math.round(500 * costMul[i] * mulScale),
      hp: Math.round(baseHp * hpMul[i]),
      dmg: Math.round(baseDmg * dmgMul[i]),
      xpReward: Math.round(baseXp * xpMul[i]),
      coinReward: Math.round(baseCoin * coinMul[i] * mulScale),
      rareDropTable: loot,
      minCombatLevel: Math.min(28, Math.round(i * 8 * mulScale)),
    }));
  }
  const SLAYERS = [
    { key: 'zombie_slayer', name: '좀비 슬레이어', flavor: '리븐넌트 호러', dropResource: 'rotten_flesh', tiers: mkSlayerTiers(400, 20, 5, 300, 1, [
      ['rotten_flesh', 'reforge_stone_common', 'talisman_zombie'],
      ['rotten_flesh', 'enchant_book_sharpness', 'talisman_campfire'],
      ['rotten_flesh', 'weapon_epic', 'enchant_book_growth'],
      ['rotten_flesh', 'talisman_dragon_claw', 'pet_egg_enderman'],
    ]) },
    { key: 'spider_slayer', name: '거미 슬레이어', flavor: '타란튤라 브루드파더', dropResource: 'string', tiers: mkSlayerTiers(500, 25, 5, 300, 1.1, [
      ['string', 'reforge_stone_common', 'talisman_spider_ring'],
      ['string', 'enchant_book_critical', 'talisman_wolf_claw'],
      ['string', 'armor_epic', 'enchant_book_protection'],
      ['string', 'talisman_lava_charm', 'pet_egg_wolf'],
    ]) },
    { key: 'wolf_slayer', name: '늑대 슬레이어', flavor: '스벤 팩마스터', dropResource: 'bone', tiers: mkSlayerTiers(700, 32, 6, 400, 1.3, [
      ['bone', 'reforge_stone_rare', 'talisman_wolf_claw'],
      ['bone', 'enchant_book_first_strike', 'talisman_fisher_anklet'],
      ['bone', 'weapon_legendary', 'enchant_book_growth'],
      ['bone', 'talisman_dragon_heart', 'pet_egg_wolf'],
    ]) },
    { key: 'enderman_slayer', name: '엔더맨 슬레이어', flavor: '보이드글룸 세라프', dropResource: 'ender_pearl', tiers: mkSlayerTiers(1200, 45, 8, 600, 1.6, [
      ['ender_pearl', 'reforge_stone_rare', 'talisman_deep_pearl'],
      ['ender_pearl', 'enchant_book_giant_killer', 'talisman_hourglass'],
      ['ender_pearl', 'armor_mythic', 'enchant_book_protection'],
      ['ender_pearl', 'talisman_void_eye', 'pet_egg_enderman'],
    ]) },
    { key: 'blaze_slayer', name: '블레이즈 슬레이어', flavor: '인페르노 데몬로드', dropResource: 'blaze_rod', tiers: mkSlayerTiers(2000, 60, 10, 900, 2.0, [
      ['blaze_rod', 'reforge_stone_rare', 'talisman_lava_charm'],
      ['blaze_rod', 'enchant_book_looting', 'talisman_wealth_rune'],
      ['blaze_rod', 'weapon_mythic', 'enchant_book_sharpness'],
      ['blaze_rod', 'talisman_primal_shard', 'pet_egg_ender_dragon'],
    ]) },
  ];

  /* ---------------- 던전 — 카타콤 7층(F1~F7, 실제 보스 라인업) ---------------- */
  const DUNGEON = {
    floors: [
      { floor: 1, mobList: ['좀비 견습생', '해골 파수병', '거미 새끼'], bossName: '본조 (광대)', bossHp: 12000, bossDmg: 35, lootTable: ['bonzo_staff', 'enchant_book_sharpness', 'reforge_stone_common'], essenceReward: 8 },
      { floor: 2, mobList: ['강화 좀비 기사', '저주받은 사제 부하'], bossName: '스카프 (해골 군주)', bossHp: 30000, bossDmg: 60, lootTable: ['talisman_scarf_studies', 'enchant_book_protection', 'reforge_stone_rare'], essenceReward: 14 },
      { floor: 3, mobList: ['수문장 골렘', '방벽 기사단'], bossName: '교수 (미치광이 연금술사)', bossHp: 70000, bossDmg: 95, lootTable: ['adaptive_armor', 'enchant_book_growth', 'pet_egg_silverfish'], essenceReward: 22 },
      { floor: 4, mobList: ['유령 늑대 무리', '영혼 결계병'], bossName: '쏜 (유령 수호자)', bossHp: 150000, bossDmg: 140, lootTable: ['spirit_bow', 'enchant_book_critical', 'pet_egg_ocelot'], essenceReward: 32 },
      { floor: 5, mobList: ['그림자 암살단', '분신 환영'], bossName: '리비드 (그림자 군주)', bossHp: 300000, bossDmg: 200, lootTable: ['livid_dagger', 'shadow_assassin_armor', 'enchant_book_giant_killer'], essenceReward: 45 },
      { floor: 6, mobList: ['거인 병사', '왕의 근위대'], bossName: '사단 (거인왕)', bossHp: 600000, bossDmg: 280, lootTable: ['giant_sword', 'enchant_book_looting', 'pet_egg_blue_whale'], essenceReward: 60 },
      { floor: 7, mobList: ['위더 기사', '지배자의 사도'], bossName: '네크론 (마지막 지배자)', bossHp: 1200000, bossDmg: 400, lootTable: ['necron_blade', 'wither_armor', 'pet_egg_ender_dragon'], essenceReward: 85 },
    ],
    scoreThresholds: [ ['F', -Infinity], ['D', 0], ['C', 100], ['B', 160], ['A', 230], ['S', 270], ['S+', 300] ],
    roomTypes: ['전투방', '퍼즐방', '함정방', '미니보스방', '보물방'],
  };
  const DUNGEON_ROOM_SCORE = { combat: 40, puzzleSuccess: 30, puzzleFail: -14, miniboss: 50, treasure: 20, secretDoor: 40 };
  const ESSENCE_SHOP = [
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', cost: 15, kind: 'item' },
    { key: 'essence_gold_sack', name: '던전 정수 골드 주머니(500G)', cost: 10, kind: 'gold', goldAmount: 500 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', cost: 60, kind: 'item' },
    { key: 'enchant_book_sharpness', name: '인챈트북: 예리함', cost: 25, kind: 'item' },
    { key: 'pet_egg_griffin', name: '펫 알: 그리핀', cost: 200, kind: 'item' },
  ];

  /* ---------------- 등급별 장비(무기 3계열: 검/활/지팡이 × 7티어) + 던전 전용 장비 ---------------- */
  // 직업 상성(메이플식): 전사/도적→검, 궁수→활, 마법사→지팡이 — 상성 무기는 위력 +25%
  const WEAPON_NAMES = ['낡은 검', '강철 검', '기사의 장검', '용살자의 대검', '여명의 검', '천공의 인챈트 블레이드', '태초의 검'];
  const BOW_NAMES = ['나무 활', '사냥꾼의 활', '유격병의 장궁', '용린 활', '여명의 시위', '천공의 폭풍 활', '태초의 활'];
  const STAFF_NAMES = ['견습생 지팡이', '마도사의 지팡이', '현자의 스태프', '용언 지팡이', '여명의 마봉', '천공의 룬 스태프', '태초의 지팡이'];
  const ARMOR_NAMES = ['누더기 갑옷', '가죽 갑옷', '기사단 갑옷', '용비늘 갑옷', '여명의 갑옷', '천공의 신성 갑옷', '태초의 갑옷'];
  const EQUIPMENT = { weapons: [], armor: [], accessories: [] };
  ITEM_TIERS.forEach((t, i) => {
    const baseBuy = Math.round(60 * Math.pow(3.1, i));
    const dmg = Math.round(4 * t.statMultiplier * 3);
    EQUIPMENT.weapons.push({ key: `weapon_${t.key}`, name: WEAPON_NAMES[i], wclass: 'sword', tierKey: t.key, dmg, buyPrice: baseBuy, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `bow_${t.key}`, name: BOW_NAMES[i], wclass: 'bow', tierKey: t.key, dmg, buyPrice: baseBuy, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `staff_${t.key}`, name: STAFF_NAMES[i], wclass: 'staff', tierKey: t.key, dmg, buyPrice: baseBuy, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.armor.push({ key: `armor_${t.key}`, name: ARMOR_NAMES[i], tierKey: t.key, defense: Math.round(6 * t.statMultiplier), buyPrice: Math.round(baseBuy * 1.3), sellPrice: Math.round(baseBuy * 1.3 * 0.2) });
  });
  // 던전 전용 무기/방어구(상점 판매 X, 던전 보스 드롭 전용)
  const DUNGEON_WEAPONS = [
    { key: 'bonzo_staff', name: '본조의 지팡이', wclass: 'staff', tierKey: 'rare', dmg: 18, buyPrice: 0, sellPrice: 800 },
    { key: 'spirit_bow', name: '영혼의 활', wclass: 'bow', tierKey: 'epic', dmg: 23, buyPrice: 0, sellPrice: 2500 },
    { key: 'livid_dagger', name: '리비드 대거', wclass: 'sword', tierKey: 'legendary', dmg: 26, buyPrice: 0, sellPrice: 7000 },
    { key: 'giant_sword', name: '거인의 대검', wclass: 'sword', tierKey: 'mythic', dmg: 31, buyPrice: 0, sellPrice: 15000 },
    { key: 'necron_blade', name: '네크론의 검', wclass: 'sword', tierKey: 'ancient', dmg: 36, buyPrice: 0, sellPrice: 40000 },
  ];
  const DUNGEON_ARMORS = [
    { key: 'adaptive_armor', name: '적응형 갑옷', tierKey: 'epic', defense: 13, buyPrice: 0, sellPrice: 2500 },
    { key: 'shadow_assassin_armor', name: '그림자 암살자 갑옷', tierKey: 'legendary', defense: 15, buyPrice: 0, sellPrice: 7000 },
    { key: 'wither_armor', name: '위더 갑주', tierKey: 'ancient', defense: 18, buyPrice: 0, sellPrice: 40000 },
  ];
  EQUIPMENT.weapons = EQUIPMENT.weapons.concat(DUNGEON_WEAPONS).sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  EQUIPMENT.armor = EQUIPMENT.armor.concat(DUNGEON_ARMORS).sort((a, b) => a.defense - b.defense);
  const CLASS_WEAPON_AFFINITY = { warrior: 'sword', rogue: 'sword', archer: 'bow', mage: 'staff' };
  const AFFINITY_MUL = 1.25;

  /* ---------------- 스타포스 강화(메이플 시스템) ---------------- */
  // 무기/방어구 슬롯별 0~15성. 성공률은 성수가 오를수록 하락, 5성부터 실패 시 30% 확률로 1성 하락.
  const STARFORCE = {
    maxStars: 15,
    costBase: 400, costMul: 1.55,                       // n성→n+1성 비용 = 400 × 1.55^n
    successRates: [0.95, 0.90, 0.85, 0.80, 0.75, 0.65, 0.60, 0.55, 0.50, 0.45, 0.35, 0.30, 0.25, 0.20, 0.15],
    downgradeChanceOnFail: 0.30, downgradeMinStar: 5,   // 5성 이상에서 실패하면 30% 확률 1성 하락
    atkPctPerStar: 4,                                    // 무기: 성당 최종 공격 +4%
    defPerStar: 3, hpPerStar: 10,                        // 방어구: 성당 방어 +3, 체력 +10
  };

  /* ---------------- 리포지(실제 스카이블럭 리포지 명칭) ---------------- */
  // 기본 리포지(무작위): 무기 Sharp/Spicy/Heroic/Legendary 등 / 리포지 스톤: Fabled(무기)·Ancient(방어구)
  const REFORGES = {
    weapon: [
      { key: 'sharp', name: '예리한', dmgPct: 8 }, { key: 'spicy', name: '매콤한', dmgPct: 10 },
      { key: 'heroic', name: '영웅적인', dmgPct: 7, hp: 10 }, { key: 'legendary_r', name: '전설적인', dmgPct: 12 },
      { key: 'fast', name: '재빠른', dmgPct: 5 }, { key: 'rich', name: '부유한', dmgPct: 4, sellBonus: 2 },
    ],
    armor: [
      { key: 'wise', name: '현명한', def: 4, hp: 15 }, { key: 'pure', name: '순수한', def: 6, hp: 6 },
      { key: 'titanic', name: '타이타닉', def: 8, hp: 8 }, { key: 'heavy', name: '묵직한', def: 12 },
      { key: 'clean', name: '깔끔한', def: 5, hp: 10 },
    ],
    // 리포지 스톤 전용(확정 최상급): reforge_stone_rare 소모
    premium: { weapon: { key: 'fabled', name: '전설의(Fabled)', dmgPct: 16 }, armor: { key: 'ancient_r', name: '고대의(Ancient)', def: 14, hp: 20 } },
  };

  /* ---------------- 장신구(부적) 20종 — 마력(Magical Power) 시스템 ---------------- */
  // 보유한 모든 부적의 마력 합계가 전역 스탯 보너스로 작동(스카이블럭 MP 방식).
  // effect: str/def/hp 직접 스탯, doubleZone: 해당 존 채집 2배 확률(%), minionSpeed/sellBonus: 특수효과(%)
  function tali(key, name, tierKey, price, effect, desc) { return { key, name, tierKey, buyPrice: price, sellPrice: Math.round(price * 0.2), effect, desc }; }
  const TALISMANS = [
    tali('talisman_zombie', '좀비 부적', 'common', 400, { hp: 5 }, '체력 +5'),
    tali('talisman_farming', '농부의 부적', 'common', 1500, { doubleZone: 'farm', doublePct: 5 }, '농장 수확 2배 확률 +5%'),
    tali('talisman_mining', '광부의 부적', 'common', 1500, { doubleZone: 'mine', doublePct: 5 }, '광산 채굴 2배 확률 +5%'),
    tali('talisman_feather', '깃털 부적', 'common', 600, { hp: 3 }, '체력 +3, 사뿐히 착지'),
    tali('talisman_potato', '감자 부적', 'common', 777, { str: 1 }, '힘 +1 (왠지 감자 냄새가 난다)'),
    tali('talisman_lumber', '벌목꾼의 부적', 'uncommon', 2000, { doubleZone: 'forest', doublePct: 6 }, '벌목 2배 확률 +6%'),
    tali('talisman_fisher_anklet', '낚시꾼의 발찌', 'uncommon', 2000, { doubleZone: 'dock', doublePct: 6 }, '낚시 2배 확률 +6%'),
    tali('talisman_campfire', '모닥불 부적', 'uncommon', 1800, { hp: 10 }, '체력 +10'),
    tali('talisman_wolf_claw', '늑대 발톱', 'uncommon', 2200, { str: 3 }, '힘 +3'),
    tali('talisman_lava_charm', '용암 부적', 'rare', 5000, { def: 8 }, '방어 +8'),
    tali('talisman_deep_pearl', '심해의 진주', 'rare', 5500, { hp: 15, def: 3 }, '체력 +15, 방어 +3'),
    tali('talisman_spider_ring', '거미의 반지', 'rare', 5200, { str: 5 }, '힘 +5'),
    tali('talisman_collector_seal', '수집가의 인장', 'rare', 6000, { sellBonus: 3 }, '판매가 +3%'),
    tali('talisman_scarf_studies', '스카프의 연구록', 'rare', 0, { str: 4, def: 4 }, '힘 +4, 방어 +4 (던전 2층 전리품)'),
    tali('talisman_dragon_claw', '드래곤 발톱', 'epic', 15000, { str: 10 }, '힘 +10'),
    tali('talisman_dawn_seal', '여명의 인장', 'epic', 16000, { def: 12 }, '방어 +12'),
    tali('talisman_hourglass', '시간의 모래시계', 'epic', 20000, { minionSpeed: 5 }, '모든 일꾼 생산속도 +5%'),
    tali('talisman_dragon_heart', '용의 심장', 'legendary', 45000, { hp: 40 }, '체력 +40'),
    tali('talisman_wealth_rune', '재물의 룬', 'legendary', 50000, { sellBonus: 5 }, '판매가 +5%'),
    tali('talisman_void_eye', '공허의 눈', 'mythic', 120000, { str: 18, def: 10 }, '힘 +18, 방어 +10'),
    tali('talisman_primal_shard', '태초의 파편', 'ancient', 300000, { str: 15, def: 15, hp: 50 }, '힘 +15, 방어 +15, 체력 +50'),
  ];
  const MAGICAL_POWER = { statPctPer10MP: 1.5 };   // 마력 10당 최종 공격/방어 +1.5%

  /* ---------------- 펫 12종 ---------------- */
  // skill: 해당 스킬 XP 획득 시 펫도 성장(조련 레벨당 +1%). perLvl: 펫 레벨당 스탯.
  function pet(key, name, tierKey, skill, perLvl, perkText, eggPrice) { return { key, name, tierKey, skill, perLvl, perkText, eggPrice }; }
  const PETS = [
    pet('rock', '바위', 'common', 'mining', { def: 0.3 }, '레벨당 방어 +0.3', 2000),
    pet('silverfish', '실버피쉬', 'uncommon', 'mining', { def: 0.5 }, '레벨당 방어 +0.5', 0),
    pet('rabbit', '토끼', 'uncommon', 'farming', { hp: 0.4 }, '레벨당 체력 +0.4', 5000),
    pet('ocelot', '오셀롯', 'rare', 'foraging', { str: 0.5 }, '레벨당 힘 +0.5', 0),
    pet('squid', '오징어', 'rare', 'fishing', { hp: 0.5 }, '레벨당 체력 +0.5', 9000),
    pet('elephant', '코끼리', 'epic', 'farming', { hp: 1.0 }, '레벨당 체력 +1', 25000),
    pet('wolf', '늑대', 'epic', 'combat', { str: 0.6 }, '레벨당 힘 +0.6', 8000),
    pet('bee', '꿀벌', 'legendary', 'combat', { str: 0.5, def: 0.3 }, '레벨당 힘 +0.5, 방어 +0.3', 60000),
    pet('blue_whale', '흰수염고래', 'legendary', 'fishing', { hp: 2.0 }, '레벨당 체력 +2', 70000),
    pet('enderman', '엔더맨', 'legendary', 'combat', { str: 0.8 }, '레벨당 힘 +0.8', 0),
    pet('ender_dragon', '엔더 드래곤', 'mythic', 'combat', { str: 0.7, def: 0.5, hp: 1.0 }, '레벨당 힘 +0.7, 방어 +0.5, 체력 +1', 0),
    pet('griffin', '그리핀', 'ancient', 'combat', { str: 1.0, def: 0.7, hp: 1.5 }, '레벨당 힘 +1, 방어 +0.7, 체력 +1.5', 0),
  ];
  const PET_XP_BASE = 60, PET_XP_EXP = 1.7, PET_MAX_LEVEL = 100;   // xpToLevel(n) = base * n^exp

  /* ---------------- 인챈트 12종(위키 실측 상한) + 혼돈의 마법부여(상한 돌파) ---------------- */
  // 전역 슬롯 방식: 무기 인챈트는 현재 장착 무기에, 방어구 인챈트는 방어구에 적용(장비 교체 시 유지).
  // maxLvl = 인챈트북으로 도달 가능한 상한(위키: 예리함 7·치명 7·선제공격 5·거인사냥꾼 7·약탈 5·보호 7·성장 7).
  // 그 위로는 "혼돈의 마법부여"(골드+북 소모, 확률 성공/실패 시 레벨 하락 위험)로 +5레벨까지 돌파 가능 — 노가다·운빨 초월 강화.
  const ENCHANTS = [
    { key: 'sharpness', name: '예리함', target: 'weapon', maxLvl: 7, desc: '레벨당 최종 피해 +5%', bookBasePrice: 500 },
    { key: 'critical', name: '치명', target: 'weapon', maxLvl: 7, desc: '레벨당 최종 피해 +4%', bookBasePrice: 600 },
    { key: 'first_strike', name: '선제공격', target: 'weapon', maxLvl: 5, desc: '전투 첫 공격 피해 +25%/레벨', bookBasePrice: 900 },
    { key: 'giant_killer', name: '거인 사냥꾼', target: 'weapon', maxLvl: 7, desc: '보스 최대체력 10만 이상일 때 피해 +8%/레벨', bookBasePrice: 1500 },
    { key: 'looting', name: '약탈', target: 'weapon', maxLvl: 5, desc: '전투 보상 골드 +15%/레벨', bookBasePrice: 1200 },
    { key: 'execute', name: '처형', target: 'weapon', maxLvl: 5, desc: '보스 체력 50% 이하일 때 피해 +6%/레벨', bookBasePrice: 1400 },
    { key: 'vampirism', name: '흡혈', target: 'weapon', maxLvl: 5, desc: '공격 시 가한 피해의 1%/레벨 회복', bookBasePrice: 1600 },
    { key: 'experience', name: '경험', target: 'weapon', maxLvl: 4, desc: '전투 스킬 XP +10%/레벨', bookBasePrice: 1000 },
    { key: 'protection', name: '보호', target: 'armor', maxLvl: 7, desc: '레벨당 방어 +4', bookBasePrice: 500 },
    { key: 'growth', name: '성장', target: 'armor', maxLvl: 7, desc: '레벨당 체력 +15', bookBasePrice: 700 },
    { key: 'thorns', name: '가시', target: 'armor', maxLvl: 3, desc: '받는 피해의 10%/레벨 반사', bookBasePrice: 1300 },
    { key: 'vitality', name: '활력', target: 'armor', maxLvl: 5, desc: '전투 중 공격할 때마다 HP +2/레벨 회복', bookBasePrice: 1100 },
  ];
  // 인챈트북 부여 비용 = bookBasePrice × 현재 레벨(첫 부여는 무료)
  const CHAOS_ENCHANT = {
    overcapLevels: 5,                       // 북 상한 + 5레벨까지 혼돈 부여 가능
    costMulPerOver: 3,                      // 비용 = bookBasePrice × 3 × (초과 단계)
    successBase: 0.60, successDropPerOver: 0.10, successMin: 0.15,   // 초과 단계마다 성공률 -10%p
    failDowngradeChance: 0.40,              // 실패 시 40% 확률로 레벨 1 하락(북 상한 밑으로는 안 떨어짐)
  };

  /* ---------------- 제작 레시피(컬렉션 티어로 해금 — 실제 스카이블럭 방식) ---------------- */
  // 인챈티드 자원: 원자재 160개 → 1개(판매가 20% 프리미엄 = 제작 노가다 보상)
  const ENCHANTED_RES = ['stone', 'coal', 'iron', 'gold', 'diamond', 'wheat', 'oaklog', 'rawfish'];
  const RECIPES = [
    ...ENCHANTED_RES.map(rk => ({
      key: `enchanted_${rk}`, needs: { [rk]: 160 }, gives: 1, unlock: { resource: rk, tier: 3 },
    })),
    { key: 'iron_pickaxe', needs: { iron: 24, oaklog: 8 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'iron_axe', needs: { iron: 24, oaklog: 8 }, gives: 1, unlock: { resource: 'oaklog', tier: 2 } },
    { key: 'minion_fuel_coal', needs: { coal: 32 }, gives: 1, unlock: { resource: 'coal', tier: 2 } },
    { key: 'talisman_potato', needs: { potato: 160 }, gives: 1, unlock: { resource: 'potato', tier: 2 } },
    { key: 'auto_shipping_module', needs: { iron: 64, redstone: 32 }, gives: 1, unlock: { resource: 'redstone', tier: 2 } },
    { key: 'diamond_spreading', needs: { diamond: 64, gold: 32 }, gives: 1, unlock: { resource: 'diamond', tier: 3 } },
    { key: 'enchant_book_sharpness', needs: { lapis: 48, ender_pearl: 4 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
    { key: 'enchant_book_protection', needs: { lapis: 48, obsidian: 8 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
  ];

  /* ---------------- 페어리 소울(3D 월드 12개 은닉) ---------------- */
  const FAIRY_SOULS = { total: 12, goldPerSoul: 200, mpPerSoul: 2, per5Bonus: { hp: 10, str: 2 } };

  /* ---------------- 은행 ---------------- */
  const BANK = { interestPctPerDay: 2, interestCapBalance: 100000 };   // 하루 1회, 잔고 10만G까지 2% 이자

  /* ---------------- 일일 특가(경매인) ---------------- */
  const DAILY_DEALS = { count: 3, discountMin: 0.30, discountMax: 0.60 };   // 정가의 30~60% 할인

  /* ---------------- 상점 ---------------- */
  const SHOP = [
    // 도구 4계열 × 5티어
    ...Object.keys(TOOLS).flatMap(fam => TOOLS[fam].map(t => ({ key: t.key, name: t.name, category: '도구', buyPrice: t.price, sellPrice: Math.round(t.price * 0.2), stackSize: 1 }))),
    // 강화/일꾼/인챈트
    { key: 'reforge_stone_common', name: '리포지 스톤(일반)', category: '강화재료', buyPrice: 250, sellPrice: 50, stackSize: 64 },
    { key: 'reforge_stone_rare', name: '리포지 스톤(희귀)', category: '강화재료', buyPrice: 1000, sellPrice: 200, stackSize: 64 },
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', category: '강화재료', buyPrice: 0, sellPrice: 400, stackSize: 64 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', category: '장식', buyPrice: 0, sellPrice: 5000, stackSize: 1 },
    { key: 'minion_slot_expander', name: '일꾼 슬롯 확장권', category: '일꾼', buyPrice: MINION_SLOT_COST_BASE, sellPrice: 0, stackSize: 1 },
    { key: 'auto_shipping_module', name: '자동출하 모듈', category: '일꾼', buyPrice: 3000, sellPrice: 500, stackSize: 1 },
    { key: 'diamond_spreading', name: '다이아 살포기(생산 시 10% 다이아 추가)', category: '일꾼', buyPrice: 0, sellPrice: 2000, stackSize: 1 },
    { key: MINION_FUEL.key, name: MINION_FUEL.name, category: '일꾼', buyPrice: MINION_FUEL.price, sellPrice: 100, stackSize: 64 },
    // 인챈티드 자원(제작 전용, 판매가 20% 프리미엄)
    ...ENCHANTED_RES.map(rk => {
      const r = COLLECTIONS.flatMap(c => c.resources).find(x => x.key === rk);
      return { key: `enchanted_${rk}`, name: `인챈티드 ${r.name}`, category: '제작품', buyPrice: 0, sellPrice: Math.round(r.sellPrice * 160 * 1.2), stackSize: 64 };
    }),
    ...ENCHANTS.map(e => ({ key: `enchant_book_${e.key}`, name: `인챈트북: ${e.name}`, category: '인챈트', buyPrice: e.bookBasePrice, sellPrice: Math.round(e.bookBasePrice * 0.2), stackSize: 64 })),
    // 부적 20종
    ...TALISMANS.map(t => ({ key: t.key, name: `${t.name} [${ITEM_TIERS.find(x => x.key === t.tierKey).name}]`, category: '장신구', tierKey: t.tierKey, buyPrice: t.buyPrice, sellPrice: t.sellPrice, stackSize: 1 })),
    // 펫 알(eggPrice>0만 상점 판매, 나머지는 드롭 전용)
    ...PETS.filter(p => p.eggPrice > 0).map(p => ({ key: `pet_egg_${p.key}`, name: `펫 알: ${p.name}`, category: '펫', tierKey: p.tierKey, buyPrice: p.eggPrice, sellPrice: Math.round(p.eggPrice * 0.2), stackSize: 1 })),
    ...PETS.filter(p => !(p.eggPrice > 0)).map(p => ({ key: `pet_egg_${p.key}`, name: `펫 알: ${p.name}`, category: '펫', tierKey: p.tierKey, buyPrice: 0, sellPrice: 2000, stackSize: 1 })),
    // 원자재 31종(sellPrice는 컬렉션 정의에서)
    ...COLLECTIONS.flatMap(cat => cat.resources.map(r => ({ key: r.key, name: r.name, category: '원자재', buyPrice: 0, sellPrice: r.sellPrice, stackSize: 64 }))),
    // 장비(던전 전용은 buyPrice 0 → 구매 불가, 판매만 가능)
    ...EQUIPMENT.weapons.map(w => ({ key: w.key, name: `${w.name} [${ITEM_TIERS.find(t => t.key === w.tierKey).name}]`, category: '무기', tierKey: w.tierKey, buyPrice: w.buyPrice, sellPrice: w.sellPrice, stackSize: 1, dmg: w.dmg })),
    ...EQUIPMENT.armor.map(a => ({ key: a.key, name: `${a.name} [${ITEM_TIERS.find(t => t.key === a.tierKey).name}]`, category: '방어구', tierKey: a.tierKey, buyPrice: a.buyPrice, sellPrice: a.sellPrice, stackSize: 1, defense: a.defense })),
  ];
  const DAILY_SELL_LIMIT_PER_STACK = 10;   // dailySellLimit = 10 * stackSize

  const JOB_CLASSES = [
    { key: 'warrior', name: '전사', flavor: '검과 방패를 함께 다루는 근접 수호자.', hp: 30, defense: 15, strength: 10, intelligence: 0, dungeonRole: '탱커 — 피격 시 파티 피해 10% 감소' },
    { key: 'mage', name: '마법사', flavor: '원소의 힘을 다루는 지팡이 술사.', hp: 15, defense: 5, strength: 0, intelligence: 25, dungeonRole: '광역 딜러 — 퍼즐방 성공률 +20%' },
    { key: 'archer', name: '궁수', flavor: '활시위를 당겨 원거리에서 저격하는 유격병.', hp: 18, defense: 6, strength: 12, intelligence: 6, dungeonRole: '원거리 딜러 — 함정방 회피 보너스' },
    { key: 'rogue', name: '도적', flavor: '단검과 은신으로 급소를 노리는 암살자.', hp: 20, defense: 8, strength: 15, intelligence: 2, dungeonRole: '버스트 딜러 — 함정 피해 50% 감소, 보물방 발견 +15%' },
  ];

  const ZONES = [
    { key: 'hub', name: '중앙 마을', emoji: '🏘️', desc: '상점·은행·일꾼 관리소·펫 상점·인챈트 탑이 모인 허브.' },
    { key: 'mine', name: '깊은 동굴', emoji: '⛏️', desc: '돌부터 흑요석까지 9종 광물을 캐는 대형 광산.' },
    { key: 'farm', name: '농장 벌판', emoji: '🌾', desc: '6종 작물이 자라는 너른 들판. 풍차가 돈다.' },
    { key: 'forest', name: '속삭이는 숲', emoji: '🌲', desc: '참나무·자작나무·가문비를 벌목하는 울창한 숲.' },
    { key: 'dock', name: '어부의 부두', emoji: '🎣', desc: '등대가 서 있는 항구. 7종 해산물을 낚는다.' },
    { key: 'slayerden', name: '슬레이어 황무지', emoji: '💀', desc: '5대 슬레이어 보스에게 도전하는 저주받은 땅.' },
    { key: 'dungeonentrance', name: '카타콤 지구라트', emoji: '🗝️', desc: '7층 카타콤 던전으로 통하는 고대 피라미드.' },
  ];

  const EASTER_EGGS = {
    bankSecretName: '소이러석',
    minionSkinDropChance: 1 / 10000,
    minionSkinName: '다이아몬드 스티브',
    dungeonSecretSequence: ['left', 'left', 'right', 'left'],
    insomniaFishHourRange: [23, 1],
    insomniaFishName: '불면증의 물고기',
    insomniaFishLine: '오늘도 늦게까지 게임하시네요',
    lighthouseKeeper: '등대 꼭대기에 오르면 좋은 일이 생긴다는 소문이 있다',
  };

  window.ECON_DATA = {
    ITEM_TIERS, COLLECTIONS, SKILLS, GATHER_TABLE, TOOLS, MINIONS, MINION_STORAGE_BASE, MINION_STORAGE_UPGRADED,
    MINION_STORAGE_UPGRADE_COST, MINION_OFFLINE_CAP_HOURS, MINION_SLOT_MAX, MINION_SLOT_COST_BASE, MINION_SLOT_COST_MUL,
    MINION_FUEL, SLAYERS, DUNGEON, DUNGEON_ROOM_SCORE, ESSENCE_SHOP, SHOP, DAILY_SELL_LIMIT_PER_STACK,
    EQUIPMENT, CLASS_WEAPON_AFFINITY, AFFINITY_MUL, STARFORCE, REFORGES,
    TALISMANS, MAGICAL_POWER, PETS, PET_XP_BASE, PET_XP_EXP, PET_MAX_LEVEL,
    ENCHANTS, CHAOS_ENCHANT, RECIPES,
    FAIRY_SOULS, BANK, DAILY_DEALS, JOB_CLASSES, ZONES, EASTER_EGGS,
  };
})();
