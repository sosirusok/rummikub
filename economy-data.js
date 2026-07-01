/* =========================================================================
   economy-data.js — 경제 탭(하이픽셀 스카이블럭 x 메이플스토리2 스타일) 데이터 레이어
   순수 데이터만 정의(로직은 economy.js). /deep-research + 설계 워크플로우로 산출한 스펙을 그대로 반영.
   ========================================================================= */
(function () {
  const ITEM_TIERS = [
    { key: 'common', name: '일반', colorHex: '#D1D5D8', statMultiplier: 1, reforgeCost: 250, magicalPower: 3 },
    { key: 'uncommon', name: '고급', colorHex: '#41A85F', statMultiplier: 1.2, reforgeCost: 500, magicalPower: 5 },
    { key: 'rare', name: '희귀', colorHex: '#2C82C9', statMultiplier: 1.4, reforgeCost: 1000, magicalPower: 8 },
    { key: 'epic', name: '영웅', colorHex: '#9365B8', statMultiplier: 1.6, reforgeCost: 2500, magicalPower: 12 },
    { key: 'legendary', name: '전설', colorHex: '#FAC51C', statMultiplier: 1.8, reforgeCost: 5000, magicalPower: 16 },
    { key: 'mythic', name: '신화', colorHex: '#E048C4', statMultiplier: 2.0, reforgeCost: 9000, magicalPower: 20 },
    { key: 'ancient', name: '고대', colorHex: '#5DECD5', statMultiplier: 2.4, reforgeCost: 15000, magicalPower: 26 },
  ];

  const COLLECTIONS = [
    { category: '채굴', key: 'mining', resources: [
      { key: 'stone', name: '조약돌', stackSize: 64, tierThresholds: [50, 250, 1000, 5000, 15000, 40000] },
      { key: 'coal', name: '석탄', stackSize: 64, tierThresholds: [40, 200, 800, 3000, 10000, 25000] },
      { key: 'iron', name: '철 주괴', stackSize: 64, tierThresholds: [60, 300, 1200, 4000, 12000, 30000] },
      { key: 'diamond', name: '다이아몬드', stackSize: 64, tierThresholds: [20, 100, 400, 1600, 6000, 18000] },
    ] },
    { category: '농사', key: 'farming', resources: [
      { key: 'wheat', name: '밀', stackSize: 64, tierThresholds: [50, 250, 1000, 4000, 12000, 30000] },
      { key: 'carrot', name: '당근', stackSize: 64, tierThresholds: [50, 250, 1000, 4000, 12000, 30000] },
      { key: 'sugarcane', name: '사탕수수', stackSize: 64, tierThresholds: [40, 200, 800, 3000, 9000, 24000] },
    ] },
    { category: '낚시', key: 'fishing', resources: [
      { key: 'rawfish', name: '생선', stackSize: 64, tierThresholds: [30, 150, 600, 2500, 8000, 20000] },
      { key: 'pufferfish', name: '복어', stackSize: 64, tierThresholds: [20, 100, 400, 1500, 5000, 15000] },
      { key: 'prismarine', name: '프리즈마린 조각', stackSize: 64, tierThresholds: [25, 120, 500, 2000, 6000, 18000] },
    ] },
  ];

  const SKILLS = [
    { key: 'combat', name: '전투', xpBase: 50, xpExp: 1.9, bonusText: '레벨당 몬스터 피해 +4%' },
    { key: 'mining', name: '채광', xpBase: 40, xpExp: 1.8, bonusText: '레벨당 방어력 +1, 5레벨마다 채광 속도 +3%' },
    { key: 'farming', name: '농사', xpBase: 40, xpExp: 1.8, bonusText: '레벨당 체력 +2~5' },
    { key: 'foraging', name: '채집', xpBase: 45, xpExp: 1.8, bonusText: '레벨당 힘 +1' },
    { key: 'fishing', name: '낚시', xpBase: 50, xpExp: 1.85, bonusText: '레벨당 체력 +1, 5레벨마다 희귀어 확률 +2%' },
    { key: 'enchanting', name: '마법부여', xpBase: 60, xpExp: 1.9, bonusText: '레벨당 지력 +2' },
    { key: 'taming', name: '조련', xpBase: 45, xpExp: 1.85, bonusText: '레벨당 펫 경험치 +1%' },
    { key: 'social', name: '사교', xpBase: 30, xpExp: 1.7, bonusText: '5레벨마다 상점 판매가 +1%(최대 +10%)' },
  ];
  // xpToLevel(n) = xpBase * n^xpExp  (n=현재 레벨, 다음 레벨까지 필요한 증분 XP)

  // 자원별 채집 존/도구/드롭 정의(수집 loop에서 사용)
  const GATHER_TABLE = {
    mine: { skill: 'mining', drops: [
      { key: 'stone', weight: 45, min: 1, max: 3 },
      { key: 'coal', weight: 25, min: 1, max: 2 },
      { key: 'iron', weight: 20, min: 1, max: 2 },
      { key: 'diamond', weight: 5, min: 1, max: 1 },
    ], toolKey: 'wooden_pickaxe' },
    farm: { skill: 'farming', drops: [
      { key: 'wheat', weight: 45, min: 1, max: 4 },
      { key: 'carrot', weight: 35, min: 1, max: 3 },
      { key: 'sugarcane', weight: 20, min: 1, max: 3 },
    ], toolKey: 'wooden_hoe' },
    dock: { skill: 'fishing', drops: [
      { key: 'rawfish', weight: 70, min: 1, max: 1 },
      { key: 'pufferfish', weight: 20, min: 1, max: 1 },
      { key: 'prismarine', weight: 10, min: 1, max: 1 },
    ], toolKey: 'fishing_rod' },
  };

  const MINIONS = [
    { key: 'cobblestone_minion', name: '채석 일꾼', resource: 'stone', tiers: mkMinionTiers(27, 80), maxTier: 6 },
    { key: 'wheat_minion', name: '밀 일꾼', resource: 'wheat', tiers: mkMinionTiers(25, 80), maxTier: 6 },
    { key: 'oak_minion', name: '참나무 일꾼', resource: 'oaklog', tiers: mkMinionTiers(26, 80), maxTier: 6 },
    { key: 'fishing_minion', name: '어부 일꾼', resource: 'rawfish', tiers: mkMinionTiers(30, 60), maxTier: 6 },
    { key: 'iron_minion', name: '철 일꾼', resource: 'iron', tiers: mkMinionTiers(28, 80), maxTier: 6 },
    { key: 'coal_minion', name: '석탄 일꾼', resource: 'coal', tiers: mkMinionTiers(27, 80), maxTier: 6 },
    { key: 'diamond_minion', name: '다이아 일꾼', resource: 'diamond', tiers: mkMinionTiers(32, 40), maxTier: 6 },
    { key: 'carrot_minion', name: '당근 일꾼', resource: 'carrot', tiers: mkMinionTiers(25, 80), maxTier: 6 },
    { key: 'sugarcane_minion', name: '사탕수수 일꾼', resource: 'sugarcane', tiers: mkMinionTiers(24, 80), maxTier: 6 },
  ];
  function mkMinionTiers(baseInterval, baseCost) {
    const tiers = [];
    for (let t = 1; t <= 6; t++) {
      tiers.push({ tier: t, intervalSec: +(baseInterval * Math.pow(0.9, t - 1)).toFixed(1), cost: baseCost * Math.pow(2, t - 1) });
    }
    return tiers;
  }
  const MINION_STORAGE_BASE = 15, MINION_STORAGE_UPGRADED = 24, MINION_STORAGE_UPGRADE_COST = 5000;
  const MINION_OFFLINE_CAP_HOURS = 48;

  const SLAYERS = [
    { key: 'zombie_slayer', name: '좀비 슬레이어', flavor: '리치 호러', tiers: mkSlayerTiers(400, 20, 5, 300, [
      ['좀비 검(희귀)', '부패 방지 부적(고급)'],
      ['리치의 발톱(영웅)', '재생의 반지(희귀)'],
      ['리치 갑주 세트(영웅)', '생명흡수 룬(희귀)'],
      ['리치 호러의 심장(전설)', '불사의 팔찌(전설)', '네크로맨서 지팡이(신화)'],
    ]) },
    { key: 'spider_slayer', name: '거미 슬레이어', flavor: '광기의 여왕거미', tiers: mkSlayerTiers(500, 25, 5, 300, [
      ['독니 단검(희귀)', '거미줄 망토(고급)'],
      ['맹독의 반지(희귀)', '여왕거미 눈알 부적(영웅)'],
      ['광기의 여왕거미 갑주(영웅)', '맹독 화살통(희귀)'],
      ['여왕거미의 독침(전설)', '천 개의 눈 투구(전설)', '타란튤라의 심장(신화)'],
    ]) },
    { key: 'skeleton_slayer', name: '해골 슬레이어', flavor: '심연의 궁술사왕', tiers: mkSlayerTiers(450, 22, 5, 300, [
      ['뼈 활(희귀)', '명중의 반지(고급)'],
      ['관통의 화살촉(희귀)', '궁술사왕의 완장(영웅)'],
      ['심연 궁술사 갑주(영웅)', '무한 화살통(희귀)'],
      ['궁술사왕의 대궁(전설)', '해골왕관(전설)', '죽음의 화살(신화)'],
    ]) },
  ];
  function mkSlayerTiers(baseHp, baseDmg, baseXp, baseCoin, lootByTier) {
    const costMul = [1, 4, 16, 60], hpMul = [1, 7.5, 50, 375], dmgMul = [1, 3, 7.5, 20], xpMul = [1, 5, 40, 100], coinMul = [1, 8.67, 16.7, 60];
    return lootByTier.map((loot, i) => ({
      tier: i + 1,
      turnInGold: Math.round(500 * costMul[i]),
      hp: Math.round(baseHp * hpMul[i]),
      dmg: Math.round(baseDmg * dmgMul[i]),
      xpReward: Math.round(baseXp * xpMul[i]),
      coinReward: Math.round(baseCoin * coinMul[i]),
      rareDropTable: loot,
      minCombatLevel: i * 8,
    }));
  }

  const DUNGEON = {
    floors: [
      { floor: 1, mobList: ['좀비 견습생', '해골 파수병', '거미 새끼'], bossName: '본조 (광대 좀비)', bossHp: 15000, bossDmg: 40, lootTable: ['초보자의 단검(고급)', '광대 가면(희귀)'], essenceReward: 8 },
      { floor: 2, mobList: ['강화 좀비 기사', '저주받은 거미', '뼈 궁수 부대'], bossName: '스카프 (저주받은 사제)', bossHp: 60000, bossDmg: 90, lootTable: ['사제의 지팡이(희귀)', '저주 방지 부적(영웅)'], essenceReward: 20 },
      { floor: 3, mobList: ['망령 기사단', '심연의 거미 여왕 부하', '해골 마법사'], bossName: '네크론 (던전의 지배자)', bossHp: 250000, bossDmg: 180, lootTable: ['지배자의 대검(전설)', '네크론의 망토(전설)', '고대 문양석(신화)'], essenceReward: 50 },
    ],
    scoreThresholds: [ ['F', -Infinity], ['D', 0], ['C', 100], ['B', 160], ['A', 230], ['S', 270], ['S+', 300] ],
    roomTypes: ['전투방', '퍼즐방', '함정방', '미니보스방', '보물방'],
  };
  const DUNGEON_ROOM_SCORE = { combat: 40, puzzleSuccess: 30, puzzleFail: -14, miniboss: 50, treasure: 20, secretDoor: 40 };
  const ESSENCE_SHOP = [
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', cost: 15, kind: 'item' },
    { key: 'essence_gold_sack', name: '던전 정수 골드 주머니(500G)', cost: 10, kind: 'gold', goldAmount: 500 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', cost: 60, kind: 'item' },
  ];

  // 등급별 장비: 실제 마인크래프트 도구 이름이 아니라 스카이블럭/메이플식 고유 명칭 + 아이템 티어(ITEM_TIERS) 연동 스탯 스케일링.
  // 검(무기)·갑옷(방어)·장신구(부가효과) 각각 7개 등급 전부 존재 — "많은 종류의 아이템 레어리티" 요구 반영.
  const WEAPON_NAMES = ['낡은 검', '강철 검', '기사의 장검', '용살자의 대검', '여명의 검', '천공의 인챈트 블레이드', '태초의 검'];
  const ARMOR_NAMES = ['누더기 갑옷', '가죽 갑옷', '기사단 갑옷', '용비늘 갑옷', '여명의 갑옷', '천공의 신성 갑옷', '태초의 갑옷'];
  const ACCESSORY_NAMES = ['낡은 반지', '구리 목걸이', '은빛 부적', '영웅의 인장', '전설의 팔찌', '신화의 왕관', '태초의 유물'];
  const EQUIPMENT = { weapons: [], armor: [], accessories: [] };
  ITEM_TIERS.forEach((t, i) => {
    const baseBuy = Math.round(60 * Math.pow(3.1, i));
    EQUIPMENT.weapons.push({ key: `weapon_${t.key}`, name: WEAPON_NAMES[i], tierKey: t.key, baseDmg: 4, dmg: Math.round(4 * t.statMultiplier * 3), buyPrice: baseBuy, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.armor.push({ key: `armor_${t.key}`, name: ARMOR_NAMES[i], tierKey: t.key, baseDef: 6, defense: Math.round(6 * t.statMultiplier), buyPrice: Math.round(baseBuy * 1.3), sellPrice: Math.round(baseBuy * 1.3 * 0.2) });
    EQUIPMENT.accessories.push({ key: `accessory_${t.key}`, name: ACCESSORY_NAMES[i], tierKey: t.key, baseBonus: 3, allStatBonus: Math.round(3 * t.statMultiplier), buyPrice: Math.round(baseBuy * 0.7), sellPrice: Math.round(baseBuy * 0.7 * 0.2) });
  });

  const SHOP = [
    { key: 'wooden_pickaxe', name: '나무 곡괭이', category: '도구', buyPrice: 50, sellPrice: 10, stackSize: 1 },
    { key: 'stone_pickaxe', name: '돌 곡괭이', category: '도구', buyPrice: 200, sellPrice: 40, stackSize: 1 },
    { key: 'iron_pickaxe', name: '철 곡괭이', category: '도구', buyPrice: 800, sellPrice: 160, stackSize: 1 },
    { key: 'diamond_pickaxe', name: '다이아 곡괭이', category: '도구', buyPrice: 5000, sellPrice: 1000, stackSize: 1 },
    { key: 'wooden_hoe', name: '나무 괭이', category: '도구', buyPrice: 50, sellPrice: 10, stackSize: 1 },
    { key: 'fishing_rod', name: '낚싯대', category: '도구', buyPrice: 300, sellPrice: 60, stackSize: 1 },
    { key: 'enchanted_fishing_rod', name: '인챈트 낚싯대', category: '도구', buyPrice: 3500, sellPrice: 700, stackSize: 1 },
    { key: 'reforge_stone_common', name: '리포지 스톤(일반)', category: '강화재료', buyPrice: 250, sellPrice: 50, stackSize: 64 },
    { key: 'reforge_stone_rare', name: '리포지 스톤(희귀)', category: '강화재료', buyPrice: 1000, sellPrice: 200, stackSize: 64 },
    { key: 'enchant_book_sharpness1', name: '인챈트북: 예리함 I', category: '인챈트', buyPrice: 500, sellPrice: 100, stackSize: 1 },
    { key: 'enchant_book_protection1', name: '인챈트북: 보호 I', category: '인챈트', buyPrice: 500, sellPrice: 100, stackSize: 1 },
    { key: 'minion_slot_expander', name: '일꾼 슬롯 확장권', category: '일꾼', buyPrice: 6000, sellPrice: 0, stackSize: 1 },
    { key: 'auto_shipping_module', name: '자동출하 모듈', category: '일꾼', buyPrice: 3000, sellPrice: 500, stackSize: 1 },
    { key: 'talisman_farming', name: '농경의 부적', category: '장신구', buyPrice: 1500, sellPrice: 300, stackSize: 1 },
    { key: 'talisman_mining', name: '채광의 부적', category: '장신구', buyPrice: 1500, sellPrice: 300, stackSize: 1 },
    { key: 'pet_egg_wolf', name: '펫 알: 늑대', category: '펫', buyPrice: 8000, sellPrice: 1500, stackSize: 1 },
    { key: 'stone', name: '조약돌', category: '원자재', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'coal', name: '석탄', category: '원자재', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'iron', name: '철 주괴', category: '원자재', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'diamond', name: '다이아몬드', category: '원자재', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'wheat', name: '밀', category: '원자재', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'carrot', name: '당근', category: '원자재', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'sugarcane', name: '사탕수수', category: '원자재', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'rawfish', name: '생선', category: '원자재', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'pufferfish', name: '복어', category: '원자재', buyPrice: 0, sellPrice: 12, stackSize: 64 },
    { key: 'prismarine', name: '프리즈마린 조각', category: '원자재', buyPrice: 0, sellPrice: 9, stackSize: 64 },
    { key: 'oaklog', name: '참나무 원목', category: '원자재', buyPrice: 0, sellPrice: 5, stackSize: 64 },
    ...EQUIPMENT.weapons.map(w => ({ key: w.key, name: `${w.name} [${ITEM_TIERS.find(t => t.key === w.tierKey).name}]`, category: '무기', tierKey: w.tierKey, buyPrice: w.buyPrice, sellPrice: w.sellPrice, stackSize: 1, dmg: w.dmg })),
    ...EQUIPMENT.armor.map(a => ({ key: a.key, name: `${a.name} [${ITEM_TIERS.find(t => t.key === a.tierKey).name}]`, category: '방어구', tierKey: a.tierKey, buyPrice: a.buyPrice, sellPrice: a.sellPrice, stackSize: 1, defense: a.defense })),
    ...EQUIPMENT.accessories.map(a => ({ key: a.key, name: `${a.name} [${ITEM_TIERS.find(t => t.key === a.tierKey).name}]`, category: '장신구', tierKey: a.tierKey, buyPrice: a.buyPrice, sellPrice: a.sellPrice, stackSize: 1, allStatBonus: a.allStatBonus })),
  ];
  const DAILY_SELL_LIMIT_PER_STACK = 10;   // dailySellLimit = 10 * stackSize

  const JOB_CLASSES = [
    { key: 'warrior', name: '전사', flavor: '검과 방패를 함께 다루는 근접 수호자.', hp: 30, defense: 15, strength: 10, intelligence: 0, dungeonRole: '탱커 — 피격 시 파티 피해 10% 감소' },
    { key: 'mage', name: '마법사', flavor: '원소의 힘을 다루는 지팡이 술사.', hp: 15, defense: 5, strength: 0, intelligence: 25, dungeonRole: '광역 딜러 — 퍼즐방 성공률 +20%' },
    { key: 'archer', name: '궁수', flavor: '활시위를 당겨 원거리에서 저격하는 유격병.', hp: 18, defense: 6, strength: 12, intelligence: 6, dungeonRole: '원거리 딜러 — 함정방 회피 보너스' },
    { key: 'rogue', name: '도적', flavor: '단검과 은신으로 급소를 노리는 암살자.', hp: 20, defense: 8, strength: 15, intelligence: 2, dungeonRole: '버스트 딜러 — 함정 피해 50% 감소, 보물방 발견 +15%' },
  ];

  const ZONES = [
    { key: 'hub', name: '중앙 마을', emoji: '🏘️', desc: '상점·경매장·일꾼 관리소·은행이 모인 허브.' },
    { key: 'mine', name: '광산 지대', emoji: '⛏️', desc: '돌/석탄/철/다이아몬드를 채굴하는 지역.' },
    { key: 'farm', name: '농장', emoji: '🌾', desc: '밀/당근/사탕수수를 재배·수확하는 지역.' },
    { key: 'dock', name: '부둣가', emoji: '🎣', desc: '생선과 희귀 해산물을 낚는 지역.' },
    { key: 'slayerden', name: '슬레이어 소굴', emoji: '💀', desc: '슬레이어 퀘스트를 시작하고 보스를 처치하는 위험 지역.' },
    { key: 'dungeonentrance', name: '던전 입구', emoji: '🗝️', desc: '3층 구조 던전에 입장하는 관문.' },
  ];

  const EASTER_EGGS = {
    bankSecretName: '소이러석',
    minionSkinDropChance: 1 / 10000,
    minionSkinName: '다이아몬드 스티브',
    dungeonSecretSequence: ['left', 'left', 'right', 'left'],
    insomniaFishHourRange: [23, 1],
    insomniaFishName: '불면증의 물고기',
    insomniaFishLine: '오늘도 늦게까지 게임하시네요',
  };

  window.ECON_DATA = {
    ITEM_TIERS, COLLECTIONS, SKILLS, GATHER_TABLE, MINIONS, MINION_STORAGE_BASE, MINION_STORAGE_UPGRADED,
    MINION_STORAGE_UPGRADE_COST, MINION_OFFLINE_CAP_HOURS, SLAYERS, DUNGEON, DUNGEON_ROOM_SCORE, ESSENCE_SHOP,
    SHOP, DAILY_SELL_LIMIT_PER_STACK, EQUIPMENT, JOB_CLASSES, ZONES, EASTER_EGGS,
  };
})();
