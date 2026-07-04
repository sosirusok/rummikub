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
    { key: 'divine', name: '신성', colorHex: '#66E0FF', statMultiplier: 2.8, reforgeCost: 25000, magicalPower: 34 },   // V11
    { key: 'primal', name: '태초', colorHex: '#FF5470', statMultiplier: 3.2, reforgeCost: 40000, magicalPower: 40 },   // V11
  ];

  /* ---------------- 컬렉션(자원 31종, 5개 카테고리) ---------------- */
  // V8: 아이템별 컬렉션 티어 수·임계값이 전부 다름(실제 스카이블럭) — custom 배열이 있으면 그것을 사용
  // V16: 실제 하이픽셀 컬렉션 10티어 곡선(위키 검증). th0=50이면 조약돌 실제값 [50,100,250,1000,2500,5000,10000,25000,40000,70000]와 정확히 일치.
  function res(key, name, sell, th0, custom) { return { key, name, stackSize: 64, sellPrice: sell, tierThresholds: custom || [th0, th0 * 2, th0 * 5, th0 * 20, th0 * 50, th0 * 100, th0 * 200, th0 * 500, th0 * 800, th0 * 1400] }; }
  const COLLECTIONS = [
    { category: '채굴', key: 'mining', resources: [
      res('stone', '조약돌', 2, 50), res('coal', '석탄', 3, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]), res('iron', '철 주괴', 6, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]),
      res('gold', '금 주괴', 12, 40), res('lapis', '청금석', 8, 40), res('redstone', '레드스톤', 7, 40),
      res('diamond', '다이아몬드', 45, 0, [25, 50, 100, 250, 1000, 2500, 5000, 10000, 25000]), res('emerald', '에메랄드', 25, 0, [10, 30, 100, 250, 1000, 2500, 5000, 10000]), res('obsidian', '흑요석', 18, 0, [20, 50, 100, 250, 1000, 2500, 5000]),
    ] },
    { category: '농사', key: 'farming', resources: [
      res('wheat', '밀', 3, 0, [50, 100, 250, 500, 1000, 2500, 10000, 15000, 25000, 50000, 100000]), res('carrot', '당근', 3, 50), res('potato', '감자', 3, 50),
      res('pumpkin', '호박', 6, 0, [40, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]), res('melon', '수박', 5, 40), res('sugarcane', '사탕수수', 4, 40),
    ] },
    { category: '벌목', key: 'foraging', resources: [
      res('oaklog', '참나무 원목', 5, 40), res('birchlog', '자작나무 원목', 5, 40),
      res('sprucelog', '가문비 원목', 6, 35), res('apple', '사과', 8, 20),
    ] },
    { category: '낚시', key: 'fishing', resources: [
      res('rawfish', '생선', 4, 30), res('salmon', '연어', 7, 25), res('clownfish', '광대어', 20, 0, [10, 25, 50, 100, 250, 800]),
      res('pufferfish', '복어', 12, 20), res('prismarine', '프리즈마린 조각', 9, 25),
      res('sponge', '스펀지', 30, 0, [10, 20, 50, 100, 200, 400]), res('clay', '점토', 4, 30),
    ] },
    { category: '전투', key: 'combat', resources: [
      res('rotten_flesh', '썩은 살점', 2, 0, [50, 150, 400, 1000, 2500, 5000, 15000, 50000]), res('bone', '뼈', 3, 40), res('string', '거미줄', 4, 30),
      res('ender_pearl', '엔더 진주', 15, 0, [10, 25, 50, 100, 250, 1000, 2500, 10000]), res('blaze_rod', '블레이즈 막대', 20, 0, [10, 25, 50, 100, 250, 500, 1500, 5000]),
      res('magma_cream', '마그마 크림', 8, 0, [10, 25, 100, 250, 1000, 2500, 10000]), res('ghast_tear', '가스트의 눈물', 40, 0, [5, 10, 25, 100, 250, 1000]),
      res('spider_eye', '거미 눈', 5, 0, [25, 50, 100, 250, 1000, 2500, 10000]), res('slime_ball', '슬라임볼', 4, 0, [20, 50, 150, 400, 1000, 5000]),
      res('gunpowder', '화약', 6, 0, [25, 50, 100, 500, 1500, 5000, 10000]), res('ender_shard', '엔더 조각', 22, 0, [10, 25, 75, 250, 1000]),
    ] },
    { category: '축산', key: 'husbandry', resources: [
      res('feather', '깃털', 3, 0, [50, 100, 250, 1000, 2500, 10000]), res('leather', '가죽', 5, 0, [30, 75, 200, 500, 1500, 5000]),
    ] },
  ];

  // 실제 하이픽셀 스카이블럭 스킬 XP 테이블(위키): 레벨 n→n+1 필요 XP. 최대 50레벨.
  // V16: 실제 하이픽셀 스카이블럭 스킬 XP 표(위키 검증). L1~L50는 실제와 100% 일치, L51~L60 확장.
  // 누적: L50=55,172,425 / L60=111,672,425 (딥리서치 검증).
  const SKILL_XP_TABLE = [
    50, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3500,
    5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 200000,
    300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000,
    1300000, 1400000, 1500000, 1600000, 1700000, 1800000, 1900000, 2000000, 2100000, 2200000,
    2300000, 2400000, 2500000, 2600000, 2750000, 2900000, 3100000, 3400000, 3700000, 4000000,
    4300000, 4600000, 4900000, 5200000, 5500000, 5800000, 6100000, 6400000, 6700000, 7000000,
  ];
  const SKILL_MAX_LEVEL = 60;
  // 실제 스카이블럭 스킬별 상한: 전투/채광/농사/마법부여/조련 60, 낚시/벌목 50, 사교 25
  const SKILL_MAX_BY = { combat: 60, mining: 60, farming: 60, enchanting: 60, taming: 60, foraging: 50, fishing: 50, social: 25 };
  const SKILLS = [
    { key: 'combat', name: '전투', bonusText: '레벨당 최종 피해 +4%, 크리 확률 +0.5%' },
    { key: 'mining', name: '채광', bonusText: '레벨당 방어력 +1' },
    { key: 'farming', name: '농사', bonusText: '레벨당 체력 +2' },
    { key: 'foraging', name: '벌목', bonusText: '레벨당 힘 +1' },
    { key: 'fishing', name: '낚시', bonusText: '레벨당 체력 +1' },
    { key: 'enchanting', name: '마법부여', bonusText: '레벨당 지력(마나) +2' },
    { key: 'taming', name: '조련', bonusText: '레벨당 펫 경험치 +1%' },
    { key: 'social', name: '사교', bonusText: '5레벨마다 상점 판매가 +1%(최대 +10%)' },
  ];

  /* ---------------- 기본 스탯(실제 스카이블럭 기본값 그대로) ---------------- */
  // 피해 = (5+무기공격)×(1+힘/100)×(스킬/인챈트/리포지/스타포스 배율)×크리티컬
  // 피해 감소 = 방어/(방어+100), 이동속도 100 = 기준 속도
  const BASE_STATS = { hp: 100, defense: 0, strength: 0, speed: 100, critChance: 30, critDamage: 50, intelligence: 100 };
  // V20: 신규 스탯 기본치 — 매직파인드(희귀드롭%)·포춘(추가채집)·공격속도
  const BASE_STATS2 = { magicFind: 0, miningFortune: 0, farmingFortune: 0, foragingFortune: 0, attackSpeed: 0 };
  /* ---------------- V20: 젬스톤(장비 소켓) — 실제 스카이블럭 8종 × 5품질 ---------------- */
  const GEM_TYPES = [
    { key: 'ruby', name: '루비', stat: 'hp' }, { key: 'jasper', name: '재스퍼', stat: 'str' },
    { key: 'sapphire', name: '사파이어', stat: 'intelligence' }, { key: 'amethyst_gem', name: '자수정 젬', stat: 'defense' },
    { key: 'jade', name: '제이드', stat: 'miningFortune' }, { key: 'amber', name: '앰버', stat: 'farmingFortune' },
    { key: 'topaz', name: '토파즈', stat: 'critChance' }, { key: 'opal', name: '오팔', stat: 'critDamage' },
  ];
  // 품질별 배율(러프→완벽). 스탯별 기본값 × 배율
  const GEM_QUALITY = [
    { key: 'rough', name: '러프', mul: 1 }, { key: 'flawed', name: '플로드', mul: 2 },
    { key: 'fine', name: '파인', mul: 4 }, { key: 'flawless', name: '플로리스', mul: 8 }, { key: 'perfect', name: '퍼펙트', mul: 15 },
  ];
  const GEM_BASE = { hp: 12, str: 3, intelligence: 6, defense: 4, miningFortune: 5, farmingFortune: 5, critChance: 0.6, critDamage: 4 };
  // 아이템 등급별 젬 소켓 수
  const GEM_SLOTS_BY_TIER = { common: 0, uncommon: 0, rare: 1, epic: 1, legendary: 2, mythic: 2, ancient: 3, divine: 3, primal: 4 };
  // 리컴보뷸레이터 3000: 아이템 등급 1단계 상승(수치 +18%) — 실제 스블 상징 아이템
  const RECOMB = { statBoostPct: 18 };

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
  const TOOL_PRICES = [0, 0, 0, 0, 0];   // V7: 도구는 조합 전용(무화폐 구매 경제)
  const TOOL_FAMILY_NAMES = { pickaxe: '곡괭이', hoe: '괭이', axe: '도끼', rod: '낚싯대' };
  const TOOL_TIER_KEYS = ['wooden', 'stone', 'iron', 'diamond', 'ancient'];
  const TOOL_REQS = [0, 1, 3, 6, 10];   // V7: 티어별 요구 스킬 레벨(곡괭이=채광 등)
  const TOOLS = {};   // family -> [{key,name,mul,price,req}] 낮은 티어부터
  Object.keys(TOOL_FAMILY_NAMES).forEach(fam => {
    TOOLS[fam] = TOOL_TIER_KEYS.map((tk, i) => ({
      key: fam === 'rod' && i === 0 ? 'fishing_rod' : `${tk}_${fam}`,   // 기존 세이브 호환(fishing_rod 키 유지)
      name: fam === 'rod' && i === 0 ? '낚싯대' : `${TOOL_TIER_NAMES[i]} ${TOOL_FAMILY_NAMES[fam]}`,
      mul: TOOL_MULS[i], price: 0, req: TOOL_REQS[i],
    }));
  });

  /* ---------------- 미니언 20종 ---------------- */
  // 실제 스카이블럭처럼 11티어(위키: 미니언은 최대 11~12티어) — 고티어는 기하급수 골드 싱크
  // 실제 스카이블럭식: 미니언은 골드 구매가 아니라 "자원으로 조합"한다.
  //   T1 = 원자재 80개 · T2~T6 = 원자재 160/320/512/1024/2048 · T7~T11 = 인챈티드 자원 8/16/32/64/128
  function mkMinionTiers(baseInterval, resource) {
    const rawCost = [80, 160, 320, 512, 1024, 2048];
    const tiers = [];
    for (let t = 1; t <= 11; t++) {
      const mat = t <= 6 ? { key: resource, n: rawCost[t - 1] } : { key: `enchanted_${resource}`, n: 8 * Math.pow(2, t - 7) };
      tiers.push({ tier: t, intervalSec: +(baseInterval * Math.pow(0.9, t - 1)).toFixed(1), craftCost: mat });
    }
    return tiers;
  }
  function minion(key, name, resource, baseInterval, baseCost) { return { key, name, resource, tiers: mkMinionTiers(baseInterval, resource), maxTier: 11, unlockCollection: resource }; }
  const MINIONS = [
    minion('cobblestone_minion', '조약돌 미니언', 'stone', 27, 80),
    minion('coal_minion', '석탄 미니언', 'coal', 27, 80),
    minion('iron_minion', '철 미니언', 'iron', 28, 80),
    minion('gold_minion', '금 미니언', 'gold', 29, 120),
    minion('lapis_minion', '청금석 미니언', 'lapis', 29, 120),
    minion('redstone_minion', '레드스톤 미니언', 'redstone', 29, 120),
    minion('diamond_minion', '다이아 미니언', 'diamond', 32, 400),
    minion('emerald_minion', '에메랄드 미니언', 'emerald', 33, 400),
    minion('obsidian_minion', '흑요석 미니언', 'obsidian', 36, 500),
    minion('wheat_minion', '밀 미니언', 'wheat', 25, 80),
    minion('carrot_minion', '당근 미니언', 'carrot', 25, 80),
    minion('potato_minion', '감자 미니언', 'potato', 25, 80),
    minion('pumpkin_minion', '호박 미니언', 'pumpkin', 30, 150),
    minion('melon_minion', '수박 미니언', 'melon', 28, 150),
    minion('sugarcane_minion', '사탕수수 미니언', 'sugarcane', 24, 80),
    minion('oak_minion', '참나무 미니언', 'oaklog', 26, 80),
    minion('birch_minion', '자작나무 미니언', 'birchlog', 26, 80),
    minion('spruce_minion', '가문비 미니언', 'sprucelog', 27, 100),
    minion('fishing_minion', '낚시 미니언', 'rawfish', 30, 60),
    minion('clay_minion', '점토 미니언', 'clay', 26, 60),
    // V9: 전투/축산 미니언(실제 스카이블럭 로스터)
    minion('zombie_minion', '좀비 미니언', 'rotten_flesh', 26, 80),
    minion('skeleton_minion', '스켈레톤 미니언', 'bone', 26, 80),
    minion('spider_minion', '거미 미니언', 'string', 26, 80),
    minion('slime_minion', '슬라임 미니언', 'slime_ball', 26, 120),
    minion('blaze_minion', '블레이즈 미니언', 'blaze_rod', 33, 400),
    minion('cow_minion', '소 미니언', 'leather', 26, 80),
    minion('chicken_minion', '닭 미니언', 'feather', 26, 80),
    minion('ghast_minion', '가스트 미니언', 'ghast_tear', 36, 500),
    // V10: 컬렉션 수(39)와 동일하게 — 나머지 11종
    minion('apple_minion', '사과 미니언', 'apple', 30, 80),
    minion('salmon_minion', '연어 미니언', 'salmon', 30, 100),
    minion('clownfish_minion', '광대어 미니언', 'clownfish', 34, 200),
    minion('pufferfish_minion', '복어 미니언', 'pufferfish', 32, 150),
    minion('prismarine_minion', '프리즈마린 미니언', 'prismarine', 31, 150),
    minion('sponge_minion', '스펀지 미니언', 'sponge', 36, 300),
    minion('magma_cube_minion', '마그마 큐브 미니언', 'magma_cream', 31, 200),
    minion('cave_spider_minion', '동굴 거미 미니언', 'spider_eye', 27, 90),
    minion('creeper_minion', '크리퍼 미니언', 'gunpowder', 29, 120),
    minion('endermite_minion', '엔더마이트 미니언', 'ender_shard', 34, 300),
    minion('enderman_minion', '엔더맨 미니언', 'ender_pearl', 33, 300),
  ];
  const MINION_STORAGE_BASE = 15, MINION_STORAGE_UPGRADED = 24, MINION_STORAGE_UPGRADE_COST = 5000;
  const MINION_OFFLINE_CAP_HOURS = 48;
  const MINION_SLOT_MAX = 31, MINION_SLOT_COST_BASE = 6000, MINION_SLOT_COST_MUL = 1.6;
  // V10 ⑱: 필드 미니보스 유니크 전리품(드롭 전용)
  const MINIBOSS_LOOT = [
    { key: 'yeti_fur', name: '예티의 모피', category: '전리품', buyPrice: 0, sellPrice: 2800 },
    { key: 'golem_core', name: '골렘의 코어', category: '전리품', buyPrice: 0, sellPrice: 2200 },
    { key: 'mushroom_crown', name: '무쉬룸 킹의 왕관', category: '전리품', buyPrice: 0, sellPrice: 1500 },
  ];
  const MINION_FUEL = { key: 'minion_fuel_coal', name: '석탄 연료(24시간 +25%)', speedMul: 1.25, durationHours: 24, price: 800 };
  const MINION_FUEL2 = { key: 'minion_fuel_lava', name: '인챈티드 용암 양동이(72시간 +40%)', speedMul: 1.4, durationHours: 72 };   // V10

  /* ---------------- 슬레이어 5종(실제 스카이블럭 라인업) ---------------- */
  // rareDropTable: 실제 아이템 키 배열(승리 시 인벤토리에 실제 지급). [자주(60%), 가끔(30%), 희귀(10%)]
  // V17: 실제 하이픽셀 보스 HP — 리븐넌트(좀비) 500/20k/400k/1.5M/10M 확정 앵커 기준, 계열별 실측 스케일.
  //   HP는 명시 테이블(hpTable), 피해는 계열배율(mulScale)^0.30로 완만화(실제 HP에서도 엔드게임 유효체력으로 생존 가능).
  //   피해 감소·유효체력이 함께 실제 규모로 커지므로(V17-A/C) 만렙이 10M~수억 HP 보스를 실제처럼 잡을 수 있음.
  function mkSlayerTiers(hpTable, baseDmg, baseXp, baseCoin, mulScale, lootByTier) {
    const costMul = [1, 4, 16, 60, 200], dmgMul = [1, 2.6, 6.8, 17.6, 45.7], xpMul = [1, 5, 20, 100, 300], coinMul = [1, 8, 24, 80, 240];
    return lootByTier.map((loot, i) => ({
      tier: i + 1,
      turnInGold: Math.round(500 * costMul[i] * Math.pow(mulScale, 0.5)),
      hp: hpTable[i],
      dmg: Math.round(baseDmg * dmgMul[i] * Math.pow(mulScale, 0.30)),
      xpReward: Math.round(baseXp * xpMul[i]),
      coinReward: Math.round(baseCoin * coinMul[i] * Math.pow(mulScale, 0.6)),
      rareDropTable: loot,
      minCombatLevel: Math.min(30, Math.round(i * 6 + Math.log(mulScale) / Math.log(6.9) * 5)),
    }));
  }
  // V9: 슬레이어 레벨 XP(계열별 누적: 실제 스카이블럭 5/15/200/1000/5000/20000/100000/400000/1000000)
  const SLAYER_XP_LEVELS = [5, 15, 200, 1000, 5000, 20000, 100000, 400000, 1000000];
  const SLAYER_QUEST = { killsNeeded: [5, 10, 15, 20, 25], xpPerTier: [5, 25, 100, 500, 1500] };   // 티어별 처치 수/보스 XP
  const SLAYERS = [
    { key: 'zombie_slayer', uniqueDrop: 'revenant_falchion', name: '좀비 슬레이어', flavor: '리븐넌트 호러', dropResource: 'rotten_flesh', tiers: mkSlayerTiers([500, 20000, 400000, 1500000, 10000000], 25, 5, 300, 1, [
      ['rotten_flesh', 'reforge_stone_common', 'talisman_zombie'],
      ['rotten_flesh', 'enchant_book_sharpness', 'talisman_campfire'],
      ['rotten_flesh', 'weapon_epic', 'enchant_book_growth'],
      ['rotten_flesh', 'talisman_dragon_claw', 'pet_egg_enderman'],
      ['rotten_flesh', 'reforge_stone_rare', 'hot_potato_book'],
    ]) },
    { key: 'spider_slayer', uniqueDrop: 'scorpion_foil', name: '거미 슬레이어', flavor: '타란튤라 브루드파더', dropResource: 'string', tiers: mkSlayerTiers([1000, 40000, 900000, 3200000, 12000000], 25, 5, 300, 6.9, [
      ['string', 'reforge_stone_common', 'talisman_spider_ring'],
      ['string', 'enchant_book_critical', 'talisman_wolf_claw'],
      ['string', 'armor_epic', 'enchant_book_protection'],
      ['string', 'talisman_lava_charm', 'pet_egg_wolf'],
      ['string', 'reforge_stone_rare', 'hot_potato_book'],
    ]) },
    { key: 'wolf_slayer', uniqueDrop: 'pooch_sword', name: '늑대 슬레이어', flavor: '스벤 팩마스터', dropResource: 'bone', tiers: mkSlayerTiers([2500, 60000, 1200000, 5000000, 20000000], 25, 6, 400, 47.6, [
      ['bone', 'reforge_stone_rare', 'talisman_wolf_claw'],
      ['bone', 'enchant_book_first_strike', 'talisman_fisher_anklet'],
      ['bone', 'weapon_legendary', 'enchant_book_growth'],
      ['bone', 'talisman_dragon_heart', 'pet_egg_wolf'],
      ['bone', 'reforge_stone_rare', 'fuming_potato_book'],
    ]) },
    { key: 'enderman_slayer', uniqueDrop: 'voidedge_katana', name: '엔더맨 슬레이어', flavor: '보이드글룸 세라프', dropResource: 'ender_pearl', tiers: mkSlayerTiers([300000, 12000000, 50000000, 210000000, 500000000], 25, 8, 600, 328, [
      ['ender_pearl', 'reforge_stone_rare', 'talisman_deep_pearl'],
      ['ender_pearl', 'aspect_of_the_end', 'talisman_hourglass'],
      ['ender_pearl', 'armor_mythic', 'enchant_book_protection'],
      ['ender_pearl', 'aspect_of_the_dragons', 'pet_egg_enderman'],
      ['ender_pearl', 'reforge_stone_rare', 'fuming_potato_book'],
    ]) },
    { key: 'blaze_slayer', uniqueDrop: 'fire_fury_staff', name: '블레이즈 슬레이어', flavor: '인페르노 데몬로드', dropResource: 'blaze_rod', tiers: mkSlayerTiers([2500000, 10000000, 45000000, 150000000, 350000000], 25, 10, 900, 2266, [
      ['blaze_rod', 'reforge_stone_rare', 'talisman_lava_charm'],
      ['blaze_rod', 'enchant_book_looting', 'talisman_wealth_rune'],
      ['blaze_rod', 'midas_sword', 'enchant_book_sharpness'],
      ['blaze_rod', 'talisman_primal_shard', 'pet_egg_ender_dragon'],
      ['blaze_rod', 'fuming_potato_book', 'pet_egg_ender_dragon'],
    ]) },
  ];

  /* ---------------- 던전 — 카타콤 7층(F1~F7, 실제 보스 라인업) ---------------- */
  // V9: 던전 15개 난이도 = 엔트런스(F0) + 카타콤 F1~F7 + 마스터 모드 M1~M7(F7 클리어 해금)
  const MASTER_MODE = { hpMul: 3.5, dmgMul: 3.0, rewardMul: 3, unlockFloor: 7 };
  const DUNGEON = {
    floors: [
      { floor: 0, mobList: ['크립트 입구 좀비', '허약한 스켈레톤'], bossName: '수문장(입구)', bossHp: 4000, bossDmg: 25, lootTable: ['enchant_book_protection', 'enchant_book_sharpness', 'reforge_stone_common'], essenceReward: 4 },
      { floor: 1, mobList: ['좀비 견습생', '해골 파수병', '거미 새끼'], bossName: '본조 (광대)', bossHp: 12000, bossDmg: 35, lootTable: ['bonzo_staff', 'enchant_book_sharpness', 'reforge_stone_common'], essenceReward: 8 },
      { floor: 2, mobList: ['강화 좀비 기사', '저주받은 사제 부하'], bossName: '스카프 (해골 군주)', bossHp: 30000, bossDmg: 60, lootTable: ['talisman_scarf_studies', 'enchant_book_protection', 'reforge_stone_rare'], essenceReward: 14 },
      { floor: 3, mobList: ['수문장 골렘', '방벽 기사단'], bossName: '교수 (미치광이 연금술사)', bossHp: 70000, bossDmg: 95, lootTable: ['adaptive_armor', 'enchant_book_growth', 'pet_egg_silverfish'], essenceReward: 22 },
      { floor: 4, mobList: ['유령 늑대 무리', '영혼 결계병'], bossName: '쏜 (유령 수호자)', bossHp: 150000, bossDmg: 140, lootTable: ['spirit_bow', 'enchant_book_critical', 'pet_egg_ocelot'], essenceReward: 32 },
      { floor: 5, mobList: ['그림자 암살단', '분신 환영'], bossName: '리비드 (그림자 군주)', bossHp: 300000, bossDmg: 200, lootTable: ['livid_dagger', 'shadow_assassin_armor', 'enchant_book_giant_killer'], essenceReward: 45 },
      { floor: 6, mobList: ['거인 병사', '왕의 근위대'], bossName: '사단 (거인왕)', bossHp: 600000, bossDmg: 280, lootTable: ['giant_sword', 'juju_shortbow', 'enchant_book_looting', 'pet_egg_blue_whale'], essenceReward: 60 },
      { floor: 7, mobList: ['위더 기사', '지배자의 사도'], bossName: '네크론 (마지막 지배자)', bossHp: 1200000, bossDmg: 400, lootTable: ['necron_blade', 'hyperion', 'valkyrie', 'scylla', 'wither_armor', 'pet_egg_ender_dragon'], essenceReward: 85 },
      // V11: 지옥층 M8~M10 — M7 클리어 후 해금되는 극악 3난이도(마스터 토글 불가, 자체가 지옥)
      // V19-D 밸런스: 지옥층 매끄러운 램프(F7 1.2M → ×~4~5씩) — 엔드게임 딜(근접 ~1M·캐스터 ~2.8M)에 맞춘 처치시간
      { floor: 8, hell: true, mobList: ['지옥문 파수병', '타락한 위더 기사'], bossName: '지옥문 수문장 아자젤', bossHp: 5000000, bossDmg: 650, lootTable: ['hot_potato_book', 'fuming_potato_book', 'astraea'], essenceReward: 130 },
      { floor: 9, hell: true, mobList: ['심연 포식자', '공허 사도'], bossName: '심연의 폭군 벨페고르', bossHp: 25000000, bossDmg: 950, lootTable: ['fuming_potato_book', 'terminator_bow', 'necron_blade', 'pet_egg_ender_dragon'], essenceReward: 180 },
      { floor: 10, hell: true, mobList: ['태초의 파편', '시간 포식자'], bossName: '태초의 지배자 아이온', bossHp: 120000000, bossDmg: 1400, lootTable: ['fuming_potato_book', 'hot_potato_book', 'essence_cosmetic_cape'], essenceReward: 300 },
      // V19-B/D: 종말층 F11 — 스블 최강(보이드글룸 T4 2.1억)을 능가하는 최종 아포칼립스 보스(10억 HP, 실제×4.8, 게임 최강)
      { floor: 11, hell: true, apex: true, mobList: ['공허의 사도', '무한의 그림자'], bossName: '무한의 종언 아포클립스', bossHp: 1000000000, bossDmg: 2200, lootTable: ['fuming_potato_book', 'hyperion', 'astraea', 'enchant_book_one_for_all', 'enchant_book_soul_eater', 'recombobulator', 'gem_ruby_perfect'], essenceReward: 600 },
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
    // V20: 젬스톤/리컴 — 정수로 교환(고급은 던전/슬레이어 드롭이 더 저렴)
    { key: 'recombobulator', name: '💠 리컴보뷸레이터 3000(등급↑ +18%)', cost: 300, kind: 'item' },
    { key: 'gem_jasper_perfect', name: '💎 퍼펙트 재스퍼(힘+45)', cost: 120, kind: 'item' },
    { key: 'gem_ruby_perfect', name: '💎 퍼펙트 루비(체력+180)', cost: 120, kind: 'item' },
    { key: 'gem_sapphire_perfect', name: '💎 퍼펙트 사파이어(지력+90)', cost: 120, kind: 'item' },
    { key: 'gem_amethyst_gem_perfect', name: '💎 퍼펙트 자수정(방어+60)', cost: 120, kind: 'item' },
  ];

  /* ---------------- 등급별 장비(무기 3계열: 검/활/지팡이 × 7티어) + 던전 전용 장비 ---------------- */
  // 직업 상성(메이플식): 전사/도적→검, 궁수→활, 마법사→지팡이 — 상성 무기는 위력 +25%
  const WEAPON_NAMES = ['낡은 검', '강철 검', '기사의 장검', '용살자의 대검', '여명의 검', '천공의 인챈트 블레이드', '태초의 검'];
  const BOW_NAMES = ['나무 활', '사냥꾼의 활', '유격병의 장궁', '용린 활', '여명의 시위', '천공의 폭풍 활', '태초의 활'];
  const STAFF_NAMES = ['견습생 지팡이', '마도사의 지팡이', '현자의 스태프', '용언 지팡이', '여명의 마봉', '천공의 룬 스태프', '태초의 지팡이'];
  const ARMOR_NAMES = ['누더기 갑옷', '가죽 갑옷', '기사단 갑옷', '용비늘 갑옷', '여명의 갑옷', '천공의 신성 갑옷', '태초의 갑옷'];
  const EQUIPMENT = { weapons: [], armor: [], accessories: [] };
  // 티어별 상점 무기는 해당 티어 생성 무기 대역(base+0~14)의 상위권 값 — "그 티어의 확실한 선택지"
  const TIER_WEAPON_DMG = [20, 38, 55, 73, 91, 109, 126];
  const TIER_ARMOR_DEF = [12, 26, 38, 50, 60, 70, 76];
  ITEM_TIERS.slice(0, 7).forEach((t, i) => {   // V11: 레거시 생성은 7티어까지(신성/태초는 신규 DB 전용)
    const baseBuy = Math.round(60 * Math.pow(3.1, i));
    const dmg = TIER_WEAPON_DMG[i];
    EQUIPMENT.weapons.push({ key: `weapon_${t.key}`, name: WEAPON_NAMES[i], wclass: 'sword', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `bow_${t.key}`, name: BOW_NAMES[i], wclass: 'bow', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `staff_${t.key}`, name: STAFF_NAMES[i], wclass: 'staff', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.armor.push({ key: `armor_${t.key}`, name: ARMOR_NAMES[i], tierKey: t.key, defense: TIER_ARMOR_DEF[i], buyPrice: 0, sellPrice: Math.round(baseBuy * 1.3 * 0.2) });
  });
  // 던전/보스 전용 무기(상점 판매 X, 드롭 전용).
  // 실제 스카이블럭 방식: 같은 등급이면 외형(스프라이트)은 같고 이름·수치만 다른 무기가 여럿 존재
  // (예: Midas' Sword와 Aspect of the Dragons는 다른 무기지만 각자 등급 외형을 공유).
  // V17: 실제 하이픽셀 무기 데미지 사다리 + 부가 스탯(힘/치명피해/광포/지력, caster=지력 스케일 어빌리티)
  const DUNGEON_WEAPONS = [
    { key: 'bonzo_staff', name: '본조의 지팡이', wclass: 'staff', tierKey: 'rare', dmg: 90, intelligence: 100, caster: true, abilityDmg: 400, abilityScaling: 0.6, buyPrice: 0, sellPrice: 800 },
    { key: 'aspect_of_the_end', name: '종말의 형상(AOTE)', wclass: 'sword', tierKey: 'rare', dmg: 100, buyPrice: 0, sellPrice: 1500 },
    { key: 'spirit_bow', name: '영혼의 활', wclass: 'bow', tierKey: 'epic', dmg: 160, buyPrice: 0, sellPrice: 2500 },
    { key: 'livid_dagger', name: '리비드 대거', wclass: 'sword', tierKey: 'legendary', dmg: 180, critDamage: 40, critChance: 10, buyPrice: 0, sellPrice: 7000 },
    { key: 'midas_sword', name: '미다스의 검', wclass: 'sword', tierKey: 'legendary', dmg: 130, str: 50, buyPrice: 0, sellPrice: 12000 },
    { key: 'aspect_of_the_dragons', name: '용의 형상(AOTD)', wclass: 'sword', tierKey: 'legendary', dmg: 225, str: 100, buyPrice: 0, sellPrice: 14000 },
    { key: 'giant_sword', name: '거인의 대검', wclass: 'sword', tierKey: 'mythic', dmg: 500, abilityDmg: 9000, abilityStat: 'str', abilityScaling: 0.6, buyPrice: 0, sellPrice: 15000 },
    { key: 'necron_blade', name: '네크론의 검', wclass: 'sword', tierKey: 'ancient', dmg: 190, str: 100, abilityDmg: 8500, abilityStat: 'str', abilityScaling: 0.6, buyPrice: 0, sellPrice: 40000 },
    // V17: 위더 블레이드 4종(네크론의 검 + 촉매) — 실제 최종 캐스터 무기
    { key: 'hyperion', name: '히페리온', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, intelligence: 350, ferocity: 30, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'valkyrie', name: '발키리', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, ferocity: 60, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'scylla', name: '스킬라', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, critChance: 15, critDamage: 40, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'astraea', name: '아스트라이아', wclass: 'sword', tierKey: 'mythic', dmg: 270, str: 150, defense: 250, intelligence: 50, ferocity: 30, caster: true, abilityDmg: 9500, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    // V17: 최종 활(원거리 캐리)
    { key: 'juju_shortbow', name: '주주 단궁', wclass: 'bow', tierKey: 'legendary', dmg: 310, str: 40, critChance: 10, critDamage: 110, buyPrice: 0, sellPrice: 30000 },
    { key: 'terminator_bow', name: '터미네이터', wclass: 'bow', tierKey: 'mythic', dmg: 300, str: 130, critChance: 25, critDamage: 40, buyPrice: 0, sellPrice: 45000 },
    // V10: 슬레이어 계열 전용 유니크 무기(보스 티어2+ 희귀 드롭)
    { key: 'revenant_falchion', name: '리븐넌트 팔션', wclass: 'sword', tierKey: 'epic', dmg: 120, str: 40, buyPrice: 0, sellPrice: 3200 },
    { key: 'scorpion_foil', name: '스콜피온 포일', wclass: 'sword', tierKey: 'epic', dmg: 130, critChance: 15, buyPrice: 0, sellPrice: 4200 },
    { key: 'pooch_sword', name: '푸치 소드', wclass: 'sword', tierKey: 'legendary', dmg: 160, str: 60, buyPrice: 0, sellPrice: 9000 },
    { key: 'voidedge_katana', name: '보이드엣지 카타나', wclass: 'sword', tierKey: 'mythic', dmg: 200, str: 80, critDamage: 30, buyPrice: 0, sellPrice: 18000 },
    { key: 'fire_fury_staff', name: '화염 분노 지팡이', wclass: 'staff', tierKey: 'mythic', dmg: 220, intelligence: 200, ferocity: 20, caster: true, abilityDmg: 8000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 22000 },
  ];
  // 아이템 초기 능력치 무작위 롤(실제 스카이블럭 감성): 같은 이름의 장비라도 획득 시
  // 기본 수치가 ±8% 범위에서 굴려져 고정됨(인챈트/리포지/스타포스와 완전 별개의 "생 초기치").
  const ITEM_ROLL = { pct: 0.08 };
  const DUNGEON_ARMORS = [
    { key: 'adaptive_armor', name: '적응형 갑옷', tierKey: 'epic', defense: 13, buyPrice: 0, sellPrice: 2500 },
    { key: 'shadow_assassin_armor', name: '그림자 암살자 갑옷', tierKey: 'legendary', defense: 15, buyPrice: 0, sellPrice: 7000 },
    { key: 'wither_armor', name: '위더 갑주', tierKey: 'ancient', defense: 18, buyPrice: 0, sellPrice: 40000 },
  ];
  EQUIPMENT.weapons = EQUIPMENT.weapons.concat(DUNGEON_WEAPONS).sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  EQUIPMENT.armor = EQUIPMENT.armor.concat(DUNGEON_ARMORS).sort((a, b) => a.defense - b.defense);

  /* ---------------- 스타포스 강화(메이플 시스템) ---------------- */
  // 무기/방어구 슬롯별 0~15성. 성공률은 성수가 오를수록 하락, 5성부터 실패 시 30% 확률로 1성 하락.
  const STARFORCE = {
    maxStars: 25,           // V20-B: 초월 강화 — 15→25성(16~25는 +α 초월 구간, 파괴 위험 급증)
    // 메이플식 체계: 성별 [성공, 유지, 하락, 파괴] — 파괴돼도 장비는 남고 리셋
    table: [
      [0.95, 0.05, 0.00, 0.00], [0.90, 0.10, 0.00, 0.00], [0.85, 0.15, 0.00, 0.00], [0.85, 0.15, 0.00, 0.00], [0.80, 0.20, 0.00, 0.00],   // →1~5성: 하락 없음
      [0.75, 0.25, 0.00, 0.00], [0.70, 0.30, 0.00, 0.00], [0.65, 0.35, 0.00, 0.00], [0.60, 0.40, 0.00, 0.00], [0.55, 0.45, 0.00, 0.00],   // →6~10성
      [0.50, 0.40, 0.10, 0.00], [0.45, 0.40, 0.15, 0.00], [0.40, 0.35, 0.18, 0.07], [0.35, 0.35, 0.21, 0.09], [0.30, 0.33, 0.26, 0.11],   // →11~15성: 하락/파괴 구간
      // →16~25성: 초월(Transcendent) — 성공률 급락·파괴율 급증(수만 시간 그라인드)
      [0.28, 0.30, 0.30, 0.12], [0.25, 0.28, 0.33, 0.14], [0.22, 0.26, 0.36, 0.16], [0.20, 0.24, 0.38, 0.18], [0.18, 0.22, 0.40, 0.20],   // →16~20성
      [0.15, 0.20, 0.43, 0.22], [0.13, 0.18, 0.45, 0.24], [0.11, 0.16, 0.47, 0.26], [0.09, 0.14, 0.49, 0.28], [0.07, 0.13, 0.50, 0.30],   // →21~25성
    ],
    boomResetTo: 12,        // 15성 이하 파괴 시 12성 / 16성+ 파괴 시 boomResetToHigh
    boomResetToHigh: 20,    // V20-B: 초월 구간 파괴 시 20성으로(완전 초기화 방지)
    chanceTime: true,       // 2연속 하락 → 다음 강화 100% 성공(찬스 타임)
    costBase: 400, costMul: 1.55,
    // 구간별 스탯 상승(뒤 구간일수록 큰 폭 — 단순 %/성 아님)
    weaponAtkPctByBand: [2, 3, 5, 9],    // 1~5 +2% · 6~10 +3% · 11~15 +5% · 16~25 +9%/성(초월)
    armorDefByBand: [2, 3, 5, 9],
    armorHpByBand: [6, 10, 16, 28],
  };

  /* ---------------- 리포지(실제 스카이블럭 리포지 명칭) ---------------- */
  // 기본 리포지(무작위): 무기 Sharp/Spicy/Heroic/Legendary 등 / 리포지 스톤: Fabled(무기)·Ancient(방어구)
  const REFORGES = {
    weapon: [
      { key: 'sharp', name: '예리한', dmgPct: 8 }, { key: 'spicy', name: '매콤한', dmgPct: 10 },
      { key: 'heroic', name: '영웅적인', dmgPct: 7, hp: 10 }, { key: 'legendary_r', name: '전설적인', dmgPct: 12 },
      { key: 'fast', name: '재빠른', dmgPct: 5 }, { key: 'rich', name: '부유한', dmgPct: 4, sellBonus: 2 },
      // V17: 엔드게임 무기 리포지(힘/치명피해/광포 — 실제 스카이블럭 최상급). stone=리포지 스톤 전용(무작위 풀 제외)
      { key: 'withered', name: '시든(Withered)', dmgPct: 18, str: 25, critDamage: 20, stone: true },
      { key: 'fabled', name: '전설의(Fabled)', dmgPct: 16, critChance: 4, critDamage: 12, str: 10, stone: true },
      { key: 'gilded', name: '금빛의(Gilded)', dmgPct: 10, str: 20, ferocity: 12, stone: true },
    ],
    armor: [
      { key: 'wise', name: '현명한', def: 4, hp: 15 }, { key: 'pure', name: '순수한', def: 6, hp: 6 },
      { key: 'titanic', name: '타이타닉', def: 8, hp: 8 }, { key: 'heavy', name: '묵직한', def: 12 },
      { key: 'clean', name: '깔끔한', def: 5, hp: 10 },
      // V17: 엔드게임 방어구 리포지(부위당 힘/치명피해/광포 — 4부위 합산으로 대폭 성장). stone=스톤 전용
      { key: 'necrotic', name: '괴사의(Necrotic)', def: 10, hp: 30, str: 42, stone: true },
      { key: 'renowned', name: '명성의(Renowned)', def: 8, hp: 40, str: 28, critDamage: 8, stone: true },
      { key: 'ancient_r', name: '고대의(Ancient)', def: 14, hp: 20, str: 12, ferocity: 4, stone: true },
      { key: 'necron_r', name: '지배자의(Necron)', def: 12, hp: 25, str: 22, critDamage: 6, stone: true },
    ],
    // 리포지 스톤 전용(확정 최상급): reforge_stone_rare 소모
    premium: { weapon: { key: 'withered', name: '시든(Withered)', dmgPct: 18, str: 25, critDamage: 20 }, armor: { key: 'necrotic', name: '괴사의(Necrotic)', def: 10, hp: 30, str: 42 } },
  };


  /* ---------------- 대량 장비 생성 — 계열별 100종 이상(쓰레기~신급) ----------------
     실제 스카이블럭처럼: 같은 등급이면 외형(스프라이트)은 등급 셀을 공유하고,
     이름과 수치만 다른 장비가 티어당 15종씩 존재. 티어 내 하위 2종만 상점 구매 가능(기본템),
     나머지 13종은 몬스터/슬레이어/던전/보물방 드롭 전용 — 드롭템이 이 게임의 메인 획득 경로. */
  const GEN_TIER_PREFIX = ['낡은', '견습', '정예', '용맹한', '찬란한', '초월한', '태초의'];
  const GEN_SWORD_BASES = ['단검', '소검', '직검', '곡검', '대검', '세이버', '레이피어', '클레이모어', '카타나', '팔치온', '글라디우스', '츠바이핸더', '바스타드 소드', '전투검', '처형검'];
  const GEN_BOW_BASES = ['숏보우', '사냥활', '장궁', '곡궁', '합성궁', '연사궁', '강궁', '저격궁', '섬멸궁', '폭풍궁', '유성궁', '섬광궁', '천궁', '용골궁', '심판의 활'];
  const GEN_STAFF_BASES = ['나무 지팡이', '수정 지팡이', '룬 지팡이', '마도 지팡이', '현자 지팡이', '원소 지팡이', '뇌전 지팡이', '빙결 지팡이', '화염 지팡이', '공허 지팡이', '별빛 지팡이', '월광 지팡이', '태양 지팡이', '용언 지팡이', '창세 지팡이'];
  const GEN_ARMOR_BASES = ['튜닉', '가죽조끼', '사슬갑옷', '스케일 아머', '판금갑옷', '기사갑주', '중장갑주', '수호갑주', '용린갑주', '성기사갑주', '룬 갑주', '심연갑주', '천상갑주', '불멸갑주', '창세갑주'];
  const GEN_WEAPON_DMG_BASE = [10, 28, 46, 64, 82, 100, 118];   // 티어별 시작 위력(+0~14)
  const GEN_ARMOR_DEF_BASE = [6, 16, 26, 36, 46, 56, 66];
  function genFamily(prefix, bases, wclass) {
    const out = [];
    ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
      bases.forEach((bn, i) => {
        const dmg = GEN_WEAPON_DMG_BASE[ti] + i;
        const buyable = false;   // V7: 장비는 100% 드롭/조합 — 화폐는 강화·합성 전용
        const price = Math.round(60 * Math.pow(3.1, ti) * (0.5 + i * 0.18));
        out.push({ key: `g_${prefix}_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${bn}`, wclass, tierKey: t.key,
          dmg, buyPrice: buyable ? price : 0, sellPrice: Math.round(price * 0.2) });
      });
    });
    return out;
  }
  // V7: 티어별 요구 전투 레벨(장비 착용 조건 — 실제 스카이블럭식 게이트)
  const REQ_COMBAT_BY_TIER = { common: 0, uncommon: 2, rare: 5, epic: 9, legendary: 14, mythic: 20, ancient: 26, divine: 33, primal: 40 };   // V11 9티어
  EQUIPMENT.weapons = EQUIPMENT.weapons
    .concat(genFamily('sw', GEN_SWORD_BASES, 'sword'), genFamily('bw', GEN_BOW_BASES, 'bow'), genFamily('st', GEN_STAFF_BASES, 'staff'))
    .sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  const GEN_ARMORS = [];
  ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
    GEN_ARMOR_BASES.forEach((bn, i) => {
      const def = GEN_ARMOR_DEF_BASE[ti] + i;
      const buyable = false;   // V7: 전 장비 드롭/조합 전용
      const price = Math.round(78 * Math.pow(3.1, ti) * (0.5 + i * 0.18));
      GEN_ARMORS.push({ key: `g_ar_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${bn}`, tierKey: t.key,
        defense: def, buyPrice: buyable ? price : 0, sellPrice: Math.round(price * 0.2) });
    });
  });
  EQUIPMENT.armor = EQUIPMENT.armor.concat(GEN_ARMORS).sort((a, b) => a.defense - b.defense || (a.key < b.key ? -1 : 1));
  // V12: 바닐라 검(나무/돌) — 최하 등급 무기(조합 전용). 장착 시스템이 인식하도록 EQUIPMENT에 등록.
  EQUIPMENT.weapons.push(
    { key: 'wooden_sword', name: '나무 검', wclass: 'sword', slot: 'weapon', tierKey: 'common', dmg: 15, buyPrice: 0, sellPrice: 2, flavor: '갓 깎은 나무 검. 없는 것보다 낫다.' },
    { key: 'stone_sword', name: '돌 검', wclass: 'sword', slot: 'weapon', tierKey: 'common', dmg: 20, buyPrice: 0, sellPrice: 4, flavor: '조약돌을 깎아 만든 투박한 검.' }
  );
  EQUIPMENT.weapons.sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  EQUIPMENT.weapons.forEach(w => { w.reqCombat = REQ_COMBAT_BY_TIER[w.tierKey] || 0; });
  EQUIPMENT.armor.forEach(a => { a.reqCombat = REQ_COMBAT_BY_TIER[a.tierKey] || 0; });

  /* ================ V11: 장비 초대확장 — 특성 카탈로그 · 세트 · 1400종 DB 머지 ================ */
  // 특성(트레잇): 모든 신규 장비가 1~3개 보유. 전투/채집/경제 전 분야에 실동작(economy.js 특성 엔진).
  const TRAITS = {
    lifesteal: { n: '흡혈', f: '타격 피해의 {v}%만큼 회복' }, execute: { n: '처형', f: '적 HP 30% 이하일 때 피해 +{v}%' },
    first_strike: { n: '선제 공격', f: '첫 2타 피해 +{v}%' }, combo: { n: '연격', f: '연속 타격당 피해 +{v}% (최대 5중첩)' },
    giant_slayer: { n: '거인 학살자', f: '보스·미니보스 피해 +{v}%' }, swift: { n: '신속', f: '이동속도 +{v}' },
    vampiric_kill: { n: '흡혼', f: '처치 시 HP {v} 회복' }, gold_rush: { n: '골드 러시', f: '처치 골드 +{v}%' },
    wisdom: { n: '지혜', f: '처치 경험치 +{v}%' }, crit_eye: { n: '매의 눈', f: '크리티컬 확률 +{v}%' },
    brutality: { n: '잔혹', f: '크리티컬 피해 +{v}%' }, double_strike: { n: '이도류', f: '{v}% 확률로 2회 타격' },
    rage: { n: '분노', f: '내 HP 40% 이하일 때 피해 +{v}%' }, focus: { n: '집중', f: '내 HP 90% 이상일 때 피해 +{v}%' },
    shred: { n: '파쇄', f: '타격당 고정 추가 피해 +{v}' }, midas: { n: '미다스의 손', f: '보유 골드 10만당 피해 +{v}% (최대 5중첩)' },
    vs_undead: { n: '언데드 특효', f: '좀비 계열 피해 +{v}%' }, vs_arachnid: { n: '절지류 특효', f: '거미 계열 피해 +{v}%' },
    vs_beast: { n: '야수 특효', f: '늑대 계열 피해 +{v}%' }, vs_ender: { n: '엔더 특효', f: '엔더 계열 피해 +{v}%' },
    vs_demon: { n: '악마 특효', f: '화염 계열 피해 +{v}%' },
    guard: { n: '수호', f: '받는 피해 -{v}%' }, vitality: { n: '활력', f: '최대 HP +{v}' }, bulwark: { n: '방벽', f: '방어 +{v}' },
    regeneration: { n: '재생', f: '2초마다 HP {v} 회복' }, swiftness: { n: '질주', f: '이동속도 +{v}' },
    gatherer: { n: '채집꾼', f: '모든 채집 속도 +{v}%' }, angler: { n: '강태공', f: '낚시 입질 +{v}% 빨라짐' },
    miner: { n: '광부', f: '채광 속도 +{v}%' }, lumber: { n: '벌목꾼', f: '벌목 속도 +{v}%' },
    lucky: { n: '행운', f: '희귀 드롭 확률 +{v}%' }, thorns: { n: '가시', f: '받은 피해의 {v}% 반사' },
    greed: { n: '탐욕', f: '골드 획득 +{v}%' }, scholar: { n: '학자', f: '경험치 획득 +{v}%' }, mana_well: { n: '마나 샘', f: '지능 +{v}' },
  };
  // 세트 40종 보너스 — 투구+흉갑+레깅스+부츠 4부위 동일 세트 착용 시 발동
  const EQUIP_SETS = {
    squire: { name: '견습 기사단', bonus: { def: 6, hp: 15 }, desc: '기사단의 첫걸음' },
    gravekeeper: { name: '묘지기', bonus: { def: 5, hp: 10, xpPct: 5 }, desc: '망자의 가호' },
    miner_guild: { name: '광부조합', bonus: { def: 6, minerPct: 12 }, desc: '조합원의 곡괭이 축복' },
    wolfhide: { name: '늑대가죽', bonus: { speed: 6, str: 4 }, desc: '설원 무리의 온기' },
    angler_crew: { name: '노련한 어부', bonus: { hp: 20, anglerPct: 15 }, desc: '만선의 기운' },
    harvest: { name: '풍년 농군', bonus: { hp: 30, gathererPct: 8 }, desc: '황금 들녘의 축복' },
    hunter: { name: '숲 사냥꾼', bonus: { str: 8, critChance: 3 }, desc: '숨죽인 추적자' },
    skeletal: { name: '백골', bonus: { def: 10, str: 6 }, desc: '뼈까지 시린 냉기' },
    spider_queen: { name: '거미 여왕', bonus: { str: 10, speed: 5, dmgPct: 4 }, desc: '여왕의 독니' },
    diver: { name: '심연 잠수부', bonus: { hp: 45, def: 8, anglerPct: 20 }, desc: '깊은 곳의 숨결' },
    magma_walker: { name: '용암 행자', bonus: { def: 14, guard: 3 }, desc: '불길 위를 걷는 자' },
    frost: { name: '서리칼바람', bonus: { str: 12, critDamage: 10 }, desc: '살을 에는 한파' },
    golden_pharaoh: { name: '황금 파라오', bonus: { goldPct: 15, hp: 30 }, desc: '사막 왕의 부' },
    dune_wanderer: { name: '사구 방랑자', bonus: { speed: 10, def: 10 }, desc: '모래폭풍의 인도' },
    jungle_stalker: { name: '밀림 추적자', bonus: { str: 14, speed: 6 }, desc: '보이지 않는 사냥' },
    storm: { name: '뇌운', bonus: { dmgPct: 8, critChance: 4 }, desc: '천둥을 두른 자' },
    moonlight: { name: '달빛 무희', bonus: { critChance: 6, critDamage: 14, speed: 4 }, desc: '달 아래의 검무' },
    steel_knight: { name: '강철 기사', bonus: { def: 22, hp: 40 }, desc: '꺾이지 않는 방벽' },
    dragon_scale: { name: '용비늘', bonus: { def: 20, str: 15, dmgPct: 6 }, desc: '용의 비호' },
    shadow_assassin: { name: '그림자 암살자', bonus: { dmgPct: 12, speed: 30, critDamage: 100, str: 60 }, desc: '그림자에서 그림자로 (실제 +치명피해100%)' },
    archmage: { name: '대마법사', bonus: { intelligence: 60, dmgPct: 8 }, desc: '마나의 흐름을 지배' },
    paladin: { name: '성기사', bonus: { def: 25, hp: 60, guard: 4 }, desc: '빛의 서약' },
    blood_fiend: { name: '혈귀', bonus: { dmgPct: 10, lifestealPct: 4 }, desc: '피의 갈증' },
    beast_king: { name: '야수왕', bonus: { str: 22, speed: 8, dmgPct: 5 }, desc: '무리의 왕' },
    thunder_emperor: { name: '뇌제', bonus: { dmgPct: 14, critChance: 10, critDamage: 40, str: 50, ferocity: 15 }, desc: '벼락의 옥좌' },
    glacier: { name: '빙하 거인', bonus: { hp: 120, def: 26, guard: 5 }, desc: '만년설의 육체' },
    necro_lord: { name: '사령군주', bonus: { dmgPct: 12, hp: 60, xpPct: 12 }, desc: '망자 군단의 주인' },
    phoenix: { name: '불사조', bonus: { hp: 90, regenFlat: 5, dmgPct: 8 }, desc: '재에서 다시 태어나다' },
    necron: { name: '네크론', bonus: { dmgPct: 25, str: 130, def: 80, hp: 400, critDamage: 40, ferocity: 20 }, desc: '지배자의 유산 (골도르/네크론 마스터)' },
    void_seraph: { name: '공허 세라프', bonus: { dmgPct: 15, speed: 12, critDamage: 60, str: 80, ferocity: 20 }, desc: '공허를 가르는 날개' },
    world_tree: { name: '세계수', bonus: { hp: 150, regenFlat: 8, gathererPct: 15 }, desc: '뿌리 깊은 생명' },
    stargazer: { name: '별지기', bonus: { intelligence: 90, critChance: 8, xpPct: 15 }, desc: '별의 궤적을 읽는 자' },
    hell_monarch: { name: '지옥 군주', bonus: { dmgPct: 22, str: 110, critDamage: 40, ferocity: 40, guard: 5 }, desc: '불지옥의 옥좌' },
    chrono: { name: '시간 방랑자', bonus: { speed: 18, critChance: 10, dmgPct: 12 }, desc: '시간의 틈을 걷다' },
    deep_emperor: { name: '심해 제왕', bonus: { hp: 180, def: 35, anglerPct: 30 }, desc: '해구의 왕관' },
    celestial: { name: '천상 수호자', bonus: { def: 45, hp: 140, guard: 7 }, desc: '하늘의 방패' },
    primal_titan: { name: '태초 거인', bonus: { str: 150, hp: 500, dmgPct: 20, critDamage: 40, ferocity: 20 }, desc: '세계를 빚은 손' },
    genesis: { name: '창세', bonus: { dmgPct: 30, str: 130, critDamage: 80, hp: 300, ferocity: 30 }, desc: '시작이자 끝' },
    yeti_lord: { name: '예티 군주', bonus: { hp: 80, def: 24, guard: 4 }, desc: '설산의 지배자' },
    arachne_brood: { name: '아라크네 혈족', bonus: { dmgPct: 12, speed: 8, lifestealPct: 3 }, desc: '어미의 축복' },
  };
  // 레거시 장비 슬롯 정규화(구 방어구는 전부 흉갑 취급, 무기는 wclass 기준)
  EQUIPMENT.weapons.forEach(w => { if (!w.slot) w.slot = w.wclass === 'bow' ? 'bow' : 'weapon'; });
  EQUIPMENT.armor.forEach(a => { if (!a.slot) a.slot = 'chest'; });
  // 1400종 신규 장비 DB(economy-equip.js가 window.ECON_EQUIP로 선로드) 머지
  const EQ2 = (typeof window !== 'undefined' && window.ECON_EQUIP && Array.isArray(window.ECON_EQUIP.items)) ? window.ECON_EQUIP : null;
  if (EQ2) {
    for (const it of EQ2.items) {
      const e = {
        key: it.key, name: it.name, tierKey: it.tierKey, buyPrice: 0, sellPrice: it.sellPrice,
        reqCombat: REQ_COMBAT_BY_TIER[it.tierKey] || 0, traits: it.traits || [], set: it.set || null,
        src: it.src || 'field', flavor: it.flavor || '',
      };
      if (it.slot === 'sword' || it.slot === 'bow') {
        e.wclass = it.slot === 'bow' ? 'bow' : 'sword'; e.slot = it.slot === 'bow' ? 'bow' : 'weapon'; e.dmg = it.dmg;
        EQUIPMENT.weapons.push(e);
      } else {
        e.slot = it.slot; e.defense = it.defense || 0; e.hp = it.hp || 0;
        EQUIPMENT.armor.push(e);
      }
    }
    EQUIPMENT.weapons.sort((x, y) => x.dmg - y.dmg || (x.key < y.key ? -1 : 1));
    EQUIPMENT.armor.sort((x, y) => x.defense - y.defense || (x.key < y.key ? -1 : 1));
    // 슬레이어 T5 전리품: 계열 전용 최상위 장비로 교체(플레이스홀더 → 실제 키)
    const bySrc = {};
    EQ2.items.forEach(it => { (bySrc[it.src] = bySrc[it.src] || []).push(it); });
    SLAYERS.forEach(sd => {
      const fam = sd.key.replace('_slayer', '');
      const pool = (bySrc['slayer_' + fam] || []).slice().sort((x, y) => (REQ_COMBAT_BY_TIER[y.tierKey] || 0) - (REQ_COMBAT_BY_TIER[x.tierKey] || 0));
      if (pool.length >= 2 && sd.tiers[4]) sd.tiers[4].rareDropTable = [sd.dropResource, pool[0].key, pool[1].key];
    });
  }
  // 도구도 계열별 105종 추가(전부 드롭 전용) — 배율 0.6~2.6, 기존 5종 사다리는 그대로 유지
  const GEN_TOOL_BASES = ['공구', '연장', '장비', '명품', '걸작', '비장의 도구', '유물 공구', '고대 연장', '전설의 공구', '신화의 연장', '용의 도구', '별의 공구', '태초의 연장', '창세의 공구', '신의 연장'];
  Object.keys(TOOL_FAMILY_NAMES).forEach(fam => {
    const gen = [];
    ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
      GEN_TOOL_BASES.forEach((bn, i) => {
        const mul = +(0.6 + (ti * 15 + i) * 0.019).toFixed(2);   // 0.6 ~ 2.58
        gen.push({ key: `g_t_${fam}_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${TOOL_FAMILY_NAMES[fam]} ${bn}`, tierKey: t.key, mul, price: 0, req: Math.min(25, Math.max(0, Math.round((mul - 1) * 10))) });
      });
    });
    TOOLS[fam] = TOOLS[fam].concat(gen).sort((a, b) => a.mul - b.mul);
  });

  /* ---------------- 장신구(부적) 20종 — 마력(Magical Power) 시스템 ---------------- */
  // 보유한 모든 부적의 마력 합계가 전역 스탯 보너스로 작동(스카이블럭 MP 방식).
  // effect: str/def/hp 직접 스탯, doubleZone: 해당 존 채집 2배 확률(%), minionSpeed/sellBonus: 특수효과(%)
  function tali(key, name, tierKey, price, effect, desc) { return { key, name, tierKey, buyPrice: 0, sellPrice: Math.round(price * 0.2), effect, desc }; }   // V7: 부적은 몹/보스/던전 드롭·조합 전용
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
    tali('talisman_hourglass', '시간의 모래시계', 'epic', 20000, { minionSpeed: 5 }, '모든 미니언 생산속도 +5%'),
    tali('talisman_dragon_heart', '용의 심장', 'legendary', 45000, { hp: 40 }, '체력 +40'),
    tali('talisman_wealth_rune', '재물의 룬', 'legendary', 50000, { sellBonus: 5 }, '판매가 +5%'),
    tali('talisman_void_eye', '공허의 눈', 'mythic', 120000, { str: 18, def: 10 }, '힘 +18, 방어 +10'),
    tali('talisman_primal_shard', '태초의 파편', 'ancient', 300000, { str: 15, def: 15, hp: 50 }, '힘 +15, 방어 +15, 체력 +50'),
      tali('talisman_revenant', '리븐넌트 부적', 'rare', 8000, { str: 3, hp: 10 }, '힘 +3, 체력 +10 (좀비 슬레이어 Lv3 보상)'),
    tali('talisman_tarantula', '타란튤라 부적', 'rare', 9000, { str: 4 }, '힘 +4 (거미 슬레이어 Lv3 보상)'),
    tali('talisman_sven', '스벤 부적', 'epic', 15000, { def: 5, hp: 15 }, '방어 +5, 체력 +15 (늑대 슬레이어 Lv3 보상)'),
    tali('talisman_voidgloom', '보이드글룸 부적', 'epic', 22000, { str: 6 }, '힘 +6 (엔더맨 슬레이어 Lv3 보상)'),
    tali('talisman_inferno', '인페르노 부적', 'legendary', 30000, { str: 7, hp: 20 }, '힘 +7, 체력 +20 (블레이즈 슬레이어 Lv3 보상)'),
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
    pet('wolf', '늑대', 'epic', 'combat', { str: 1.0 }, '레벨당 힘 +1', 8000),
    pet('bee', '꿀벌', 'legendary', 'combat', { str: 0.8, def: 0.3 }, '레벨당 힘 +0.8, 방어 +0.3', 60000),
    pet('blue_whale', '흰수염고래', 'legendary', 'fishing', { hp: 2.0 }, '레벨당 체력 +2', 70000),
    pet('enderman', '엔더맨', 'legendary', 'combat', { str: 1.4 }, '레벨당 힘 +1.4', 0),
    pet('ender_dragon', '엔더 드래곤', 'mythic', 'combat', { str: 1.5, def: 0.5, hp: 1.0 }, '레벨당 힘 +1.5, 방어 +0.5, 체력 +1', 0),
    pet('griffin', '그리핀', 'ancient', 'combat', { str: 2.0, def: 0.7, hp: 1.5 }, '레벨당 힘 +2, 방어 +0.7, 체력 +1.5', 0),
      { key: 'spider', name: '거미 펫', tierKey: 'rare', skill: 'combat', eggPrice: 0, statsPerLv: { str: 0.4, def: 0.1 }, bonusText: '레벨당 힘 +0.4' },
    { key: 'blaze', name: '블레이즈 펫', tierKey: 'epic', skill: 'combat', eggPrice: 0, statsPerLv: { str: 0.5, hp: 0.5 }, bonusText: '레벨당 힘 +0.5, 체력 +0.5' },
    { key: 'enderman', name: '엔더맨 펫', tierKey: 'legendary', skill: 'combat', eggPrice: 0, statsPerLv: { str: 0.7 }, bonusText: '레벨당 힘 +0.7' },
  ];
  const PET_XP_BASE = 60, PET_XP_EXP = 1.7, PET_MAX_LEVEL = 100;   // xpToLevel(n) = base * n^exp

  /* ---------------- 인챈트 12종(위키 실측 상한) + 혼돈의 마법부여(상한 돌파) ---------------- */
  // 전역 슬롯 방식: 무기 인챈트는 현재 장착 무기에, 방어구 인챈트는 방어구에 적용(장비 교체 시 유지).
  // maxLvl = 인챈트북으로 도달 가능한 상한(위키: 예리함 7·치명 7·선제공격 5·거인사냥꾼 7·약탈 5·보호 7·성장 7).
  // 그 위로는 "혼돈의 마법부여"(골드+북 소모, 확률 성공/실패 시 레벨 하락 위험)로 +5레벨까지 돌파 가능 — 노가다·운빨 초월 강화.
  // V7: 인챈트북은 몹 드롭 전용. 부여(합성)에는 골드 + 마법부여 스킬 레벨 필요.
  const ENCHANTS = [
    // ── 무기 20종 ──  fx: dmg(상시%), first(첫타%), dmgBig(체력10만+%), dmgLow(적HP50%↓), dmgHigh(적HP50%↑),
    //                  dmgVs(특정 슬레이어%), dmgBoss(던전보스%), third(3타마다%), coin(골드%), xp(전투XP%),
    //                  lifesteal(가한 피해%회복), healHit(타격당 고정회복)
    { key: 'sharpness', name: '예리함', target: 'weapon', vanilla: true, maxLvl: 7, fx: { dmg: 9 }, desc: '레벨당 최종 피해 +9%(VII=63%, 실제 스블 램프 근사)', bookBasePrice: 500 },
    { key: 'critical', name: '치명', target: 'weapon', maxLvl: 7, fx: { dmg: 13 }, desc: '레벨당 최종 피해 +13%(VII≈100%)', bookBasePrice: 600 },
    { key: 'first_strike', name: '선제공격', target: 'weapon', maxLvl: 5, fx: { first: 25 }, desc: '첫 공격 피해 +25%/레벨', bookBasePrice: 900 },
    { key: 'triple_strike', name: '삼연격', target: 'weapon', maxLvl: 5, fx: { firstThree: 10 }, desc: '처음 3회 공격 +10%/레벨', bookBasePrice: 950 },
    { key: 'giant_killer', name: '거인 사냥꾼', target: 'weapon', maxLvl: 7, fx: { dmgBig: 8 }, desc: '최대체력 10만+ 적에게 +8%/레벨', bookBasePrice: 1500 },
    { key: 'titan_killer', name: '타이탄 킬러', target: 'weapon', maxLvl: 7, fx: { dmgBig: 6 }, desc: '최대체력 10만+ 적에게 +6%/레벨', bookBasePrice: 1300 },
    { key: 'execute', name: '처형', target: 'weapon', maxLvl: 5, fx: { dmgLow: 6 }, desc: '적 체력 50% 이하 +6%/레벨', bookBasePrice: 1400 },
    { key: 'prosecute', name: '기소', target: 'weapon', maxLvl: 7, fx: { dmgHigh: 4 }, desc: '적 체력 50% 이상 +4%/레벨', bookBasePrice: 1200 },
    { key: 'smite', name: '강타', target: 'weapon', maxLvl: 7, fx: { dmgVs: 'zombie_slayer', v: 8 }, desc: '좀비 슬레이어 +8%/레벨', bookBasePrice: 800 },
    { key: 'bane_of_arthropods', name: '살충', target: 'weapon', maxLvl: 7, fx: { dmgVs: 'spider_slayer', v: 8 }, desc: '거미 슬레이어 +8%/레벨', bookBasePrice: 800 },
    { key: 'ender_slayer', name: '엔더 슬레이어', target: 'weapon', maxLvl: 7, fx: { dmgVs: 'enderman_slayer', v: 18 }, desc: '엔더맨 슬레이어 +18%/레벨(VII≈130%)', bookBasePrice: 1600 },
    { key: 'cubism', name: '큐비즘', target: 'weapon', maxLvl: 5, fx: { dmgVs: 'blaze_slayer', v: 10 }, desc: '블레이즈 슬레이어 +10%/레벨', bookBasePrice: 1400 },
    { key: 'dragon_hunter', name: '용 사냥꾼', target: 'weapon', maxLvl: 5, fx: { dmgBoss: 8 }, desc: '던전 보스 +8%/레벨', bookBasePrice: 1800 },
    { key: 'thunderlord', name: '뇌제', target: 'weapon', maxLvl: 7, fx: { third: 15 }, desc: '3번째 공격마다 +15%/레벨', bookBasePrice: 1700 },
    { key: 'fire_aspect', name: '발화', target: 'weapon', maxLvl: 3, fx: { dmg: 3 }, desc: '레벨당 최종 피해 +3%', bookBasePrice: 700 },
    { key: 'venomous', name: '맹독', target: 'weapon', maxLvl: 5, fx: { dmgHigh: 3 }, desc: '적 체력 50% 이상 +3%/레벨', bookBasePrice: 900 },
    { key: 'looting', name: '약탈', target: 'weapon', maxLvl: 5, fx: { coin: 15 }, desc: '전투 보상 골드 +15%/레벨', bookBasePrice: 1200 },
    { key: 'experience', name: '경험', target: 'weapon', maxLvl: 4, fx: { xp: 10 }, desc: '전투 스킬 XP +10%/레벨', bookBasePrice: 1000 },
    { key: 'vampirism', name: '흡혈', target: 'weapon', maxLvl: 5, fx: { lifesteal: 1 }, desc: '가한 피해의 1%/레벨 회복', bookBasePrice: 1600 },
    { key: 'life_steal', name: '생명 강탈', target: 'weapon', maxLvl: 5, fx: { healHit: 3 }, desc: '공격마다 HP +3/레벨', bookBasePrice: 1500 },
    // ── 방어구 12종 ──  fx: def(방어), hp(체력), thorns(반사%), healHit, lastStand(HP30%↓ 방어),
    //                    roomHeal(던전 방이동 회복%p), speed(이동속도%), sell(판매가%), coin
    { key: 'protection', name: '보호', target: 'armor', maxLvl: 7, fx: { def: 4 }, desc: '레벨당 방어 +4', bookBasePrice: 500 },
    { key: 'growth', name: '성장', target: 'armor', maxLvl: 7, fx: { hp: 15 }, desc: '레벨당 체력 +15', bookBasePrice: 700 },
    { key: 'true_protection', name: '진정한 보호', target: 'armor', maxLvl: 1, fx: { def: 15 }, desc: '방어 +15', bookBasePrice: 4000 },
    { key: 'hardened', name: '경화', target: 'armor', maxLvl: 5, fx: { def: 2, hp: 5 }, desc: '레벨당 방어 +2, 체력 +5', bookBasePrice: 900 },
    { key: 'thorns', name: '가시', target: 'armor', maxLvl: 3, fx: { thorns: 10 }, desc: '받는 피해의 10%/레벨 반사', bookBasePrice: 1300 },
    { key: 'cactus', name: '선인장', target: 'armor', maxLvl: 3, fx: { thorns: 5 }, desc: '받는 피해의 5%/레벨 반사', bookBasePrice: 800 },
    { key: 'vitality', name: '활력', target: 'armor', maxLvl: 5, fx: { healHit: 2 }, desc: '공격마다 HP +2/레벨', bookBasePrice: 1100 },
    { key: 'rejuvenate', name: '재생', target: 'armor', maxLvl: 5, fx: { roomHeal: 3 }, desc: '던전 방 이동 회복 +3%p/레벨', bookBasePrice: 1200 },
    { key: 'last_stand', name: '최후의 저항', target: 'armor', maxLvl: 5, fx: { lastStand: 8 }, desc: '내 HP 30% 이하일 때 방어 +8/레벨', bookBasePrice: 1500 },
    { key: 'sugar_rush', name: '슈가 러시', target: 'armor', maxLvl: 3, fx: { speed: 4 }, desc: '이동속도 +4%/레벨(3D 월드)', bookBasePrice: 1000 },
    { key: 'big_brain', name: '빅 브레인', target: 'armor', maxLvl: 5, fx: { xp: 5 }, desc: '전투 XP +5%/레벨', bookBasePrice: 1000 },
    { key: 'magnet', name: '자석', target: 'armor', maxLvl: 5, fx: { coin: 5 }, desc: '전투 보상 골드 +5%/레벨', bookBasePrice: 900 },
    // ── 도구 3종 ──  fx: mineSpeed(채집 속도%), fortune(추가 드롭%), area(주변 블록 동시 파괴 개수)
    { key: 'efficiency', name: '효율', target: 'tool', maxLvl: 7, fx: { mineSpeed: 12 }, desc: '채집 속도 +12%/레벨', bookBasePrice: 800 },
    { key: 'fortune', name: '행운', target: 'tool', maxLvl: 5, fx: { fortune: 20 }, desc: '추가 드롭 확률 +20%/레벨', bookBasePrice: 1400 },
    { key: 'area_mining', name: '광역 채집', target: 'tool', maxLvl: 5, fx: { area: 1 }, desc: '파괴 시 주변 블록 +1개/레벨 동시 파괴(혼돈으로 최대 10)', bookBasePrice: 2200 },
    // ── V19: 얼티밋 인챈트(실제 스카이블럭) — 중복 인챈트북 합성으로 레벨업, 무기당 1종만 장착 가능(강력) ──
    { key: 'one_for_all', name: '원 포 올', target: 'weapon', ultimate: true, maxLvl: 1, fx: { dmg: 100 }, desc: '최종 피해 +100% (단, 다른 무기 인챈트 무효 — 극단 특화)', bookBasePrice: 8000 },
    { key: 'soul_eater', name: '소울 이터', target: 'weapon', ultimate: true, maxLvl: 5, fx: { first: 8 }, desc: '처치 후 다음 타격 강화 +8%/레벨(첫타 보정)', bookBasePrice: 5000 },
    { key: 'combo_ult', name: '콤보', target: 'weapon', ultimate: true, maxLvl: 10, fx: { third: 8 }, desc: '연속 공격 누적 피해 +8%/레벨', bookBasePrice: 5500 },
    { key: 'legion', name: '리전', target: 'weapon', ultimate: true, maxLvl: 7, fx: { dmg: 2 }, desc: '주변 협동 시 스탯 강화 +2%/레벨', bookBasePrice: 5200 },
    { key: 'swarm', name: '스웜', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmgBig: 5 }, desc: '거대 적(체력 10만+)에게 +5%/레벨', bookBasePrice: 5800 },
    { key: 'fatal_tempo', name: '페이탈 템포', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmg: 6 }, desc: '연타 유지 시 +6%/레벨(공속→피해)', bookBasePrice: 7000 },
    { key: 'ultimate_jerry', name: '얼티밋 제리', target: 'weapon', ultimate: true, maxLvl: 5, fx: { first: 5 }, desc: '첫 타격 폭발 +5%/레벨', bookBasePrice: 6000 },
    { key: 'inferno', name: '인페르노', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmg: 4 }, desc: '화염 중첩 최종 피해 +4%/레벨', bookBasePrice: 5400 },
    { key: 'last_stand_ult', name: '라스트 스탠드(얼티밋)', target: 'armor', ultimate: true, maxLvl: 5, fx: { lastStand: 12 }, desc: 'HP 30% 이하 방어 +12/레벨', bookBasePrice: 5000 },
    { key: 'wisdom', name: '위즈덤', target: 'weapon', ultimate: true, maxLvl: 5, fx: { xp: 12 }, desc: '전투 XP +12%/레벨', bookBasePrice: 4800 },
    { key: 'bank', name: '뱅크', target: 'armor', ultimate: true, maxLvl: 5, fx: { coin: 8 }, desc: '전투 골드 +8%/레벨', bookBasePrice: 4600 },
    // ── V19: 바닐라 마인크래프트 인챈트 명시(활 계열) — vanilla:true ──
    { key: 'power', name: '힘(Power)', target: 'weapon', vanilla: true, maxLvl: 5, fx: { dmg: 5 }, desc: '바닐라: 원거리 피해 +5%/레벨(혼돈으로 초과 가능)', bookBasePrice: 600 },
    { key: 'punch', name: '밀치기(Punch)', target: 'weapon', vanilla: true, maxLvl: 2, fx: { first: 6 }, desc: '바닐라: 넉백 + 첫타 +6%/레벨', bookBasePrice: 700 },
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
  // 인챈티드 아이템: 모든 컬렉션 자원 — 원자재 160개(32×5 십자 배열) → 인챈티드 1개
  const ENCHANTED_RES = COLLECTIONS.reduce((a, c) => a.concat(c.resources.map(r => r.key)), []);
  // 광물은 한 단계 더: 인챈티드 160개 → 인챈티드 블록
  const ENCHANTED_BLOCK_RES = ['stone', 'coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond', 'emerald', 'bone', 'slime_ball', 'gunpowder', 'ender_pearl'];   // V10: 12종
  const RECIPES = [
    ...ENCHANTED_RES.map(rk => ({
      key: `enchanted_${rk}`, needs: { [rk]: 160 }, gives: 1, unlock: { resource: rk, tier: 2 },
    })),
    ...ENCHANTED_BLOCK_RES.map(rk => ({
      key: `enchanted_${rk}_block`, needs: { [`enchanted_${rk}`]: 160 }, gives: 1, unlock: { resource: rk, tier: 5 },
    })),
    // ===== V12: 바닐라 마인크래프트 조합 체인(항상 해금 — 원목→판자→막대→도구/작업대/화로/상자) =====
    { key: 'oak_planks', needs: { oaklog: 1 }, gives: 4, unlock: null },
    { key: 'birch_planks', needs: { birchlog: 1 }, gives: 4, unlock: null },
    { key: 'spruce_planks', needs: { sprucelog: 1 }, gives: 4, unlock: null },
    { key: 'stick', needs: { oak_planks: 2 }, gives: 4, unlock: null },
    { key: 'crafting_table', needs: { oak_planks: 4 }, gives: 1, unlock: null },
    { key: 'furnace', needs: { cobblestone: 8 }, gives: 1, unlock: null },
    { key: 'chest', needs: { oak_planks: 8 }, gives: 1, unlock: null },
    { key: 'torch', needs: { coal: 1, stick: 1 }, gives: 4, unlock: null },
    // 바닐라 도구(정확한 재료: 판자/조약돌 + 막대). 여기선 전부 최하 등급 성능.
    { key: 'wooden_pickaxe', needs: { oak_planks: 3, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_axe', needs: { oak_planks: 3, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_hoe', needs: { oak_planks: 2, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_sword', needs: { oak_planks: 2, stick: 1 }, gives: 1, unlock: null },
    { key: 'fishing_rod', needs: { stick: 3, string: 2 }, gives: 1, unlock: null },
    { key: 'stone_pickaxe', needs: { cobblestone: 3, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_axe', needs: { cobblestone: 3, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_hoe', needs: { cobblestone: 2, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_sword', needs: { cobblestone: 2, stick: 1 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    // V17: 계단/반블럭 조합(MC 정확: 판자 3→반블럭 6, 판자 6→계단 4). 재료 있는 흔한 종류만 조합 지원(나머지는 빌더 구매).
    { key: 'oak_planks_slab', needs: { oak_planks: 3 }, gives: 6, unlock: null },
    { key: 'oak_planks_stairs', needs: { oak_planks: 6 }, gives: 4, unlock: null },
    { key: 'birch_planks_slab', needs: { birch_planks: 3 }, gives: 6, unlock: null },
    { key: 'birch_planks_stairs', needs: { birch_planks: 6 }, gives: 4, unlock: null },
    { key: 'spruce_planks_slab', needs: { spruce_planks: 3 }, gives: 6, unlock: null },
    { key: 'spruce_planks_stairs', needs: { spruce_planks: 6 }, gives: 4, unlock: null },
    { key: 'cobblestone_slab', needs: { cobblestone: 3 }, gives: 6, unlock: null },
    { key: 'cobblestone_stairs', needs: { cobblestone: 6 }, gives: 4, unlock: null },
    { key: 'stone_bricks', needs: { cobblestone: 4 }, gives: 4, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_bricks_slab', needs: { stone_bricks: 3 }, gives: 6, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_bricks_stairs', needs: { stone_bricks: 6 }, gives: 4, unlock: { resource: 'stone', tier: 1 } },
    // V17-B: 울타리(판자4+막대2→3) + 트랩도어(판자6→2) — 흔한 나무 조합
    { key: 'oak_fence', needs: { oak_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'oak_trapdoor', needs: { oak_planks: 6 }, gives: 2, unlock: null },
    { key: 'birch_fence', needs: { birch_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'birch_trapdoor', needs: { birch_planks: 6 }, gives: 2, unlock: null },
    { key: 'spruce_fence', needs: { spruce_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'spruce_trapdoor', needs: { spruce_planks: 6 }, gives: 2, unlock: null },
    { key: 'oak_door', needs: { oak_planks: 6 }, gives: 3, unlock: null },
    { key: 'birch_door', needs: { birch_planks: 6 }, gives: 3, unlock: null },
    { key: 'spruce_door', needs: { spruce_planks: 6 }, gives: 3, unlock: null },
    { key: 'iron_pickaxe', needs: { iron: 3, stick: 2 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'iron_axe', needs: { iron: 3, stick: 2 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'minion_fuel_coal', needs: { coal: 32 }, gives: 1, unlock: { resource: 'coal', tier: 2 } },
    { key: 'talisman_potato', needs: { potato: 160 }, gives: 1, unlock: { resource: 'potato', tier: 2 } },
    { key: 'talisman_zombie', needs: { rotten_flesh: 160 }, gives: 1, unlock: { resource: 'rotten_flesh', tier: 2 } },
    { key: 'talisman_farming', needs: { wheat: 256 }, gives: 1, unlock: { resource: 'wheat', tier: 3 } },
    { key: 'talisman_mining', needs: { coal: 256 }, gives: 1, unlock: { resource: 'coal', tier: 3 } },
    { key: 'talisman_lumber', needs: { oaklog: 256 }, gives: 1, unlock: { resource: 'oaklog', tier: 3 } },
    { key: 'talisman_fisher_anklet', needs: { rawfish: 160, prismarine: 16 }, gives: 1, unlock: { resource: 'rawfish', tier: 3 } },
    { key: 'talisman_campfire', needs: { sprucelog: 128, coal: 64 }, gives: 1, unlock: { resource: 'sprucelog', tier: 2 } },
    { key: 'talisman_feather', needs: { string: 64, bone: 64 }, gives: 1, unlock: { resource: 'bone', tier: 2 } },
    { key: 'reforge_stone_common', needs: { gold: 32, diamond: 4 }, gives: 1, unlock: { resource: 'gold', tier: 3 } },
    { key: 'reforge_stone_rare', needs: { diamond: 32, obsidian: 8 }, gives: 1, unlock: { resource: 'diamond', tier: 4 } },
    { key: 'diamond_pickaxe', needs: { diamond: 12, oaklog: 4 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'diamond_axe', needs: { diamond: 12, oaklog: 4 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'diamond_hoe', needs: { diamond: 10, oaklog: 4 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'iron_hoe', needs: { iron: 20, oaklog: 6 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'iron_rod', needs: { iron: 16, string: 8 }, gives: 1, unlock: { resource: 'string', tier: 2 } },
    { key: 'diamond_rod', needs: { diamond: 10, string: 16 }, gives: 1, unlock: { resource: 'clay', tier: 3 } },
    { key: 'ancient_pickaxe', needs: { dungeon_essence: 60, diamond: 32 }, gives: 1, unlock: { resource: 'diamond', tier: 5 } },
    { key: 'ancient_axe', needs: { dungeon_essence: 60, diamond: 32 }, gives: 1, unlock: { resource: 'obsidian', tier: 4 } },
    { key: 'ancient_hoe', needs: { dungeon_essence: 50, diamond: 24 }, gives: 1, unlock: { resource: 'wheat', tier: 6 } },
    { key: 'ancient_rod', needs: { dungeon_essence: 50, prismarine: 64 }, gives: 1, unlock: { resource: 'prismarine', tier: 4 } },
    { key: 'auto_shipping_module', needs: { iron: 64, redstone: 32 }, gives: 1, unlock: { resource: 'redstone', tier: 2 } },
    { key: 'diamond_spreading', needs: { diamond: 64, gold: 32 }, gives: 1, unlock: { resource: 'diamond', tier: 3 } },
    // V8: 스킬 레벨 해금 레시피(전투/마법부여 게이트)
    { key: 'weapon_rare', needs: { iron: 32, oaklog: 8 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'bow_rare', needs: { string: 24, oaklog: 16 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'staff_rare', needs: { lapis: 24, oaklog: 12 }, gives: 1, unlock: { skill: 'enchanting', lv: 4 } },
    { key: 'armor_rare', needs: { iron: 48 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'weapon_epic', needs: { gold: 48, diamond: 8 }, gives: 1, unlock: { skill: 'combat', lv: 9 } },
    { key: 'armor_epic', needs: { gold: 64, diamond: 12 }, gives: 1, unlock: { skill: 'combat', lv: 9 } },
    { key: 'weapon_legendary', needs: { diamond: 48, obsidian: 12, dungeon_essence: 40 }, gives: 1, unlock: { skill: 'combat', lv: 14 } },
    { key: 'armor_legendary', needs: { diamond: 64, obsidian: 16, dungeon_essence: 50 }, gives: 1, unlock: { skill: 'combat', lv: 14 } },
    // 마인크래프트 기본 조합(해금 없음)
    { key: 'minion_fuel_lava', needs: { magma_cream: 32, iron: 16 }, gives: 1, unlock: { resource: 'magma_cream', tier: 2 } },
    { key: 'super_compactor', needs: { enchanted_redstone: 1, iron: 64 }, gives: 1, unlock: { resource: 'redstone', tier: 4 } },
    { key: 'potion_strength', needs: { blaze_rod: 2, spider_eye: 4 }, gives: 1, unlock: { resource: 'spider_eye', tier: 2 } },
    { key: 'potion_speed', needs: { sugarcane: 16, feather: 4 }, gives: 1, unlock: { resource: 'sugarcane', tier: 2 } },
    { key: 'potion_healing', needs: { melon: 12, ghast_tear: 1 }, gives: 1, unlock: { resource: 'melon', tier: 2 } },
    { key: 'hot_potato_book', needs: { potato: 128, sugarcane: 32 }, gives: 1, unlock: { resource: 'potato', tier: 3 } },   // V11
    { key: 'fuming_potato_book', needs: { hot_potato_book: 2, magma_cream: 48 }, gives: 1, unlock: { resource: 'potato', tier: 6 } },   // V11
    { key: 'weapon_common', needs: { oaklog: 10, stone: 4 }, gives: 1, unlock: null },
    { key: 'bow_common', needs: { oaklog: 6, string: 6 }, gives: 1, unlock: null },
    { key: 'armor_common', needs: { rotten_flesh: 24, string: 12 }, gives: 1, unlock: null },
    { key: 'weapon_uncommon', needs: { stone: 24, oaklog: 6 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'armor_uncommon', needs: { iron: 16, string: 8 }, gives: 1, unlock: { resource: 'iron', tier: 1 } },
    { key: 'treecapitator', needs: { oaklog: 128, sprucelog: 64, gold: 32, diamond: 8 }, gives: 1, unlock: { resource: 'oaklog', tier: 5 } },
    { key: 'stonk', needs: { gold: 64, diamond: 16, obsidian: 8 }, gives: 1, unlock: { resource: 'gold', tier: 5 } },
    { key: 'enchant_book_efficiency', needs: { lapis: 48, redstone: 16 }, gives: 1, unlock: { resource: 'redstone', tier: 2 } },
    { key: 'enchant_book_sharpness', needs: { lapis: 48, ender_pearl: 4 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
    { key: 'enchant_book_protection', needs: { lapis: 48, obsidian: 8 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
  ];

  /* ---------------- 페어리 소울(3D 월드 12개 은닉) ---------------- */
  const FAIRY_SOULS = { total: 24, goldPerSoul: 200, mpPerSoul: 2, per5Bonus: { hp: 10, str: 2 } };   // V9: 테마 월드 12개 추가

  /* ---------------- 은행 ---------------- */
  const BANK = { interestPctPerDay: 2, interestCapBalance: 100000,
    // V9: 잔고 상한 업그레이드(골드 싱크): 10만 → 50만 → 250만 → 1000만
    upgrades: [{ cap: 100000, cost: 0, pct: 2 }, { cap: 500000, cost: 50000, pct: 2.5 }, { cap: 2500000, cost: 400000, pct: 3 }, { cap: 10000000, cost: 2500000, pct: 3.5 }] };   // V10: 티어별 이자율

  /* ---------------- 일일 특가(경매인) ---------------- */
  const DAILY_DEALS = { count: 5, jackpotMul: 5, normalMul: 2.5 };   // V9: 수집상 5종 + 잭팟 1종(시세 ×5)

  /* ---------------- 상점 ---------------- */
  const SHOP = [
    ...MINIBOSS_LOOT,
    // V12: 바닐라 제작품(이름 표기용 — 성능/블럭 기능은 코드에서)
    { key: 'oak_planks', name: '참나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'birch_planks', name: '자작나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'spruce_planks', name: '가문비 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'cobblestone', name: '조약돌', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'stick', name: '막대기', category: '재료', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'crafting_table', name: '작업대', category: '제작품', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'furnace', name: '화로', category: '제작품', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'chest', name: '상자', category: '제작품', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'torch', name: '횃불', category: '제작품', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    // 도구 4계열 × 5티어
    ...Object.keys(TOOLS).flatMap(fam => TOOLS[fam].map(t => ({ key: t.key, name: t.name, category: '도구', tierKey: t.tierKey, buyPrice: t.price, sellPrice: Math.round((t.price || 900 * t.mul) * 0.2), stackSize: 1 }))),
    // 강화/미니언/인챈트
    { key: 'hot_potato_book', name: '핫 포테이토 북', category: '강화재료', buyPrice: 0, sellPrice: 800, stackSize: 64 },   // V11: 장비당 10권(무기 공+2 / 방어구 방+2·체+4)
    { key: 'fuming_potato_book', name: '퓨밍 포테이토 북', category: '강화재료', buyPrice: 0, sellPrice: 4000, stackSize: 64 },   // V11: 11~15권째 확장(희귀)
    { key: 'reforge_stone_common', name: '리포지 스톤(일반)', category: '강화재료', buyPrice: 0, sellPrice: 50, stackSize: 64 },
    { key: 'reforge_stone_rare', name: '리포지 스톤(희귀)', category: '강화재료', buyPrice: 0, sellPrice: 200, stackSize: 64 },
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', category: '강화재료', buyPrice: 0, sellPrice: 400, stackSize: 64 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', category: '장식', buyPrice: 0, sellPrice: 5000, stackSize: 1 },
    { key: 'dungeon_essence', name: '던전 정수', category: '재료', buyPrice: 0, sellPrice: 120, stackSize: 64 },
    { key: 'arachne_crystal', name: '아라크네 크리스탈', category: '재료', buyPrice: 0, sellPrice: 900, stackSize: 16 },
    { key: 'potion_strength', name: '힘의 물약(5분 힘 +25)', category: '물약', buyPrice: 0, sellPrice: 150, stackSize: 16 },
    { key: 'potion_speed', name: '신속의 물약(5분 속도 +20)', category: '물약', buyPrice: 0, sellPrice: 120, stackSize: 16 },
    { key: 'potion_healing', name: '재생의 물약(5분 체력 +40)', category: '물약', buyPrice: 0, sellPrice: 150, stackSize: 16 },
    ...['magma_cream', 'ghast_tear', 'spider_eye', 'slime_ball', 'gunpowder', 'ender_shard', 'feather', 'leather'].map(k => {
      const names = { magma_cream: '마그마 크림', ghast_tear: '가스트의 눈물', spider_eye: '거미 눈', slime_ball: '슬라임볼', gunpowder: '화약', ender_shard: '엔더 조각', feather: '깃털', leather: '가죽' };
      const sells = { magma_cream: 8, ghast_tear: 40, spider_eye: 5, slime_ball: 4, gunpowder: 6, ender_shard: 22, feather: 3, leather: 5 };
      return { key: k, name: names[k], category: '재료', buyPrice: 0, sellPrice: sells[k], stackSize: 64 };
    }),
    { key: 'treecapitator', name: '트리캐피테이터(나무 통째 벌목)', category: '특수 도구', buyPrice: 0, sellPrice: 20000, stackSize: 1 },
    { key: 'stonk', name: '스통크(채굴 가속 곡괭이)', category: '특수 도구', buyPrice: 0, sellPrice: 25000, stackSize: 1 },
    { key: 'minion_slot_expander', name: '미니언 슬롯 확장권', category: '미니언', buyPrice: 0, sellPrice: 0, stackSize: 1 },
    { key: 'auto_shipping_module', name: '자동출하 모듈', category: '미니언', buyPrice: 0, sellPrice: 500, stackSize: 1 },
    { key: 'diamond_spreading', name: '다이아 살포기(생산 시 10% 다이아 추가)', category: '미니언', buyPrice: 0, sellPrice: 2000, stackSize: 1 },
    { key: MINION_FUEL.key, name: MINION_FUEL.name, category: '미니언', buyPrice: 0, sellPrice: 100, stackSize: 64 },
    { key: MINION_FUEL2.key, name: MINION_FUEL2.name, category: '미니언', buyPrice: 0, sellPrice: 800, stackSize: 16 },
    { key: 'super_compactor', name: '슈퍼 컴팩터(미니언 산출 압축 — 판매가치 +50%)', category: '미니언', buyPrice: 0, sellPrice: 3000, stackSize: 1 },
    // 인챈티드 자원(제작 전용, 판매가 20% 프리미엄)
    ...ENCHANTED_BLOCK_RES.map(rk => {
      const r = COLLECTIONS.flatMap(c => c.resources).find(x => x.key === rk);
      return { key: `enchanted_${rk}_block`, name: `인챈티드 ${r.name} 블록`, category: '제작품', buyPrice: 0, sellPrice: Math.round(r.sellPrice * 160 * 1.2 * 160 * 1.1), stackSize: 64 };
    }),
    ...ENCHANTED_RES.map(rk => {
      const r = COLLECTIONS.flatMap(c => c.resources).find(x => x.key === rk);
      return { key: `enchanted_${rk}`, name: `인챈티드 ${r.name}`, category: '제작품', buyPrice: 0, sellPrice: Math.round(r.sellPrice * 160 * 1.2), stackSize: 64 };
    }),
    ...ENCHANTS.map(e => ({ key: `enchant_book_${e.key}`, name: `인챈트북: ${e.name}`, category: '인챈트', buyPrice: 0, sellPrice: Math.round(e.bookBasePrice * 0.2), stackSize: 64 })),   // V7: 북은 몹 드롭 전용 — 골드는 합성(부여) 비용에만
    // 부적 20종
    ...TALISMANS.map(t => ({ key: t.key, name: `${t.name} [${ITEM_TIERS.find(x => x.key === t.tierKey).name}]`, category: '장신구', tierKey: t.tierKey, buyPrice: t.buyPrice, sellPrice: t.sellPrice, stackSize: 1 })),
    // 펫 알(eggPrice>0만 상점 판매, 나머지는 드롭 전용)
    ...PETS.map(p => ({ key: `pet_egg_${p.key}`, name: `펫 알: ${p.name}`, category: '펫', tierKey: p.tierKey, buyPrice: 0, sellPrice: Math.max(2000, Math.round((p.eggPrice || 10000) * 0.2)), stackSize: 1 })),   // V7: 펫 알도 몹/낚시/던전 드롭 전용
    // 원자재 31종(sellPrice는 컬렉션 정의에서)
    ...COLLECTIONS.flatMap(cat => cat.resources.map(r => ({ key: r.key, name: r.name, category: '원자재', buyPrice: 0, sellPrice: r.sellPrice, stackSize: 64 }))),
    // 장비(던전 전용은 buyPrice 0 → 구매 불가, 판매만 가능)
    ...EQUIPMENT.weapons.map(w => ({ key: w.key, name: `${w.name} [${ITEM_TIERS.find(t => t.key === w.tierKey).name}]`, category: '무기', tierKey: w.tierKey, buyPrice: w.buyPrice, sellPrice: w.sellPrice, stackSize: 1, dmg: w.dmg, slot: w.slot, traits: w.traits, set: w.set, flavor: w.flavor, reqCombat: w.reqCombat })),
    ...EQUIPMENT.armor.map(a => ({ key: a.key, name: `${a.name} [${ITEM_TIERS.find(t => t.key === a.tierKey).name}]`, category: '방어구', tierKey: a.tierKey, buyPrice: a.buyPrice, sellPrice: a.sellPrice, stackSize: 1, defense: a.defense, hp: a.hp || 0, slot: a.slot, traits: a.traits, set: a.set, flavor: a.flavor, reqCombat: a.reqCombat })),
  ];
  const DAILY_SELL_LIMIT_PER_STACK = 10;   // dailySellLimit = 10 * stackSize

  // 실제 스카이블럭 방식: 상시 직업은 없음. 클래스는 카타콤 던전 전용(입장 시 선택) — 실제 5클래스 라인업.
  const DUNGEON_CLASSES = [
    { key: 'berserk', name: '버서크', emoji: '🗡️', perk: '던전 공격 +25%', dmgMul: 1.25 },
    { key: 'mage', name: '메이지', emoji: '🔮', perk: '퍼즐 자동 성공 + 던전 공격 +10%', dmgMul: 1.10, autoPuzzle: true },
    { key: 'archer', name: '아처', emoji: '🏹', perk: '각 몬스터 첫 타격 +50% + 던전 공격 +10%', dmgMul: 1.10, firstHitMul: 1.5 },
    { key: 'tank', name: '탱크', emoji: '🛡️', perk: '던전에서 받는 피해 -30%', dmgTakenMul: 0.70 },
    { key: 'healer', name: '힐러', emoji: '💚', perk: '방 이동 회복 30% + 공격 시 HP +3', roomHealPct: 0.30, healPerHit: 3 },
  ];

  const ZONES = [
    { key: 'hub', name: '중앙 마을', emoji: '🏘️', desc: '상점·은행·미니언 관리소·펫 상점·인챈트 탑이 모인 허브.' },
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

  /* ================ V11: 난이도 스펙트럼 · 아레나 · 업적 · 일일 퀘스트 · 분해 · 주간 보스 ================ */
  // 필드 난이도 4단계 — 던전·프라이빗 섬 제외 전 필드 몹에 적용(메뉴에서 전환)
  const FIELD_DIFF = {
    easy: { name: '쉬움', emoji: '🌱', lvMul: 0.55, hpMul: 0.5, dmgMul: 0.55, rewardMul: 0.7, req: 0, desc: '입문자용 — 몹이 약해지고 보상도 소폭 감소' },
    normal: { name: '일반', emoji: '⚔️', lvMul: 1, hpMul: 1, dmgMul: 1, rewardMul: 1, req: 0, desc: '표준 밸런스' },
    heroic: { name: '영웅', emoji: '🔥', lvMul: 1.8, hpMul: 2.5, dmgMul: 1.9, rewardMul: 2.1, req: 8, desc: '전투 Lv8+ — 강한 몹, 2배 보상' },
    hell: { name: '지옥', emoji: '☠️', lvMul: 2.8, hpMul: 5.5, dmgMul: 3.2, rewardMul: 3.6, req: 15, desc: '전투 Lv15+ — Lv100 몹과 지옥 보스, 3.6배 보상 + 전용 드롭' },
  };
  // 콜로세움 웨이브 아레나 — 10웨이브 생존전 4난이도
  const ARENA = {
    waves: 10, equipChance: 0.45,
    difficulties: [
      { key: 'easy', name: '입문 투기장', lv: 5, hpMul: 0.8, waveGold: 300, finalGold: 2000, req: 0 },
      { key: 'normal', name: '투사의 시험', lv: 20, hpMul: 1.6, waveGold: 900, finalGold: 7000, req: 6 },
      { key: 'heroic', name: '검투왕 결선', lv: 45, hpMul: 3.2, waveGold: 2500, finalGold: 20000, req: 14 },
      { key: 'hell', name: '지옥 투기장', lv: 80, hpMul: 6.5, waveGold: 6000, finalGold: 60000, req: 20 },
    ],
  };
  // 업적 30종 — statValue(counter/파생값) 기반, 달성 시 보상 자동 지급
  const ACHIEVEMENTS = [
    { key: 'first_blood', name: '첫 사냥', desc: '몬스터 1마리 처치', stat: 'kills', gte: 1, gold: 500 },
    { key: 'hunter_100', name: '사냥꾼', desc: '몬스터 100마리 처치', stat: 'kills', gte: 100, gold: 2000 },
    { key: 'hunter_1000', name: '학살자', desc: '몬스터 1,000마리 처치', stat: 'kills', gte: 1000, gold: 10000 },
    { key: 'hunter_10000', name: '전장의 신', desc: '몬스터 10,000마리 처치', stat: 'kills', gte: 10000, gold: 50000, item: 'fuming_potato_book' },
    { key: 'boss_10', name: '보스 헌터', desc: '보스급 10회 처치', stat: 'bossKills', gte: 10, gold: 5000 },
    { key: 'boss_100', name: '왕조 붕괴자', desc: '보스급 100회 처치', stat: 'bossKills', gte: 100, gold: 30000, item: 'fuming_potato_book' },
    { key: 'hit_1k', name: '천 단위 타격', desc: '한 방 피해 1,000 달성', stat: 'maxHit', gte: 1000, gold: 2000 },
    { key: 'hit_10k', name: '만 단위 타격', desc: '한 방 피해 10,000 달성', stat: 'maxHit', gte: 10000, gold: 8000 },
    { key: 'hit_100k', name: '유성 낙하', desc: '한 방 피해 100,000 달성', stat: 'maxHit', gte: 100000, gold: 40000 },
    { key: 'rich_10k', name: '첫 목돈', desc: '누적 1만 골드 획득', stat: 'goldEarned', gte: 10000, gold: 1000 },
    { key: 'rich_100k', name: '알부자', desc: '누적 10만 골드 획득', stat: 'goldEarned', gte: 100000, gold: 5000 },
    { key: 'rich_1m', name: '백만장자', desc: '누적 100만 골드 획득', stat: 'goldEarned', gte: 1000000, gold: 20000 },
    { key: 'rich_10m', name: '재벌', desc: '누적 1,000만 골드 획득', stat: 'goldEarned', gte: 10000000, gold: 100000 },
    { key: 'fisher_100', name: '어부의 길', desc: '물고기 100마리', stat: 'fishCaught', gte: 100, gold: 3000 },
    { key: 'fisher_1000', name: '바다의 친구', desc: '물고기 1,000마리', stat: 'fishCaught', gte: 1000, gold: 15000 },
    { key: 'miner_1000', name: '광부의 손', desc: '블록 1,000개 채집', stat: 'blocksMined', gte: 1000, gold: 3000 },
    { key: 'miner_20000', name: '대지의 조각가', desc: '블록 20,000개 채집', stat: 'blocksMined', gte: 20000, gold: 20000 },
    { key: 'dungeon_5', name: '카타콤 입문', desc: '던전 5회 완주', stat: 'dungeonClears', gte: 5, gold: 4000 },
    { key: 'dungeon_50', name: '카타콤 정복자', desc: '던전 50회 완주', stat: 'dungeonClears', gte: 50, gold: 25000 },
    { key: 'slayer_10', name: '현상금 사냥꾼', desc: '슬레이어 보스 10회', stat: 'slayerBosses', gte: 10, gold: 5000 },
    { key: 'slayer_100', name: '마덕스의 오른팔', desc: '슬레이어 보스 100회', stat: 'slayerBosses', gte: 100, gold: 40000 },
    { key: 'arena_40', name: '검투 챔피언', desc: '아레나 웨이브 40회 클리어', stat: 'arenaWaves', gte: 40, gold: 15000 },
    { key: 'quest_10', name: '성실한 일꾼', desc: '일일 퀘스트 10회 완료', stat: 'questsDone', gte: 10, gold: 5000 },
    { key: 'quest_50', name: '의뢰 전문가', desc: '일일 퀘스트 50회 완료', stat: 'questsDone', gte: 50, gold: 25000 },
    { key: 'gear_100', name: '수집가', desc: '장비 도감 100종 등록', stat: 'equipLog', gte: 100, gold: 10000 },
    { key: 'gear_400', name: '박물관장', desc: '장비 도감 400종 등록', stat: 'equipLog', gte: 400, gold: 50000, item: 'fuming_potato_book' },
    { key: 'souls_24', name: '요정의 친구', desc: '페어리 소울 24개 수집', stat: 'fairySouls', gte: 24, gold: 20000 },
    { key: 'minion_30', name: '자동화 제국', desc: '미니언 슬롯 30칸 달성', stat: 'minionSlots', gte: 30, gold: 20000 },
    { key: 'star_15', name: '별을 삼킨 자', desc: '스타포스 15성 달성', stat: 'starMax', gte: 15, gold: 30000 },
    { key: 'combat_30', name: '무의 극의', desc: '전투 스킬 30레벨', stat: 'combatLv', gte: 30, gold: 100000, item: 'fuming_potato_book' },
  ];
  // 일일 퀘스트 풀(매일 3종 무작위 배정, 카운터 스냅샷 기반)
  const DAILY_QUESTS = [
    { key: 'dq_kills', name: '오늘의 사냥', counter: 'kills', goal: 60, gold: 1500 },
    { key: 'dq_mine', name: '광맥 청소', counter: 'blocksMined', goal: 150, gold: 1200 },
    { key: 'dq_chop', name: '벌목 할당량', counter: 'treesChopped', goal: 60, gold: 1000 },
    { key: 'dq_crop', name: '풍작 준비', counter: 'cropsHarvested', goal: 80, gold: 1000 },
    { key: 'dq_fish', name: '오늘의 조황', counter: 'fishCaught', goal: 12, gold: 1500 },
    { key: 'dq_dungeon', name: '카타콤 순찰', counter: 'dungeonClears', goal: 1, gold: 2500 },
    { key: 'dq_slayer', name: '현상금 집행', counter: 'slayerBosses', goal: 1, gold: 3000 },
    { key: 'dq_gold', name: '장사 수완', counter: 'goldEarned', goal: 5000, gold: 2000 },
    { key: 'dq_sell', name: '재고 정리', counter: 'itemsSold', goal: 40, gold: 1200 },
    { key: 'dq_ench', name: '마법부여 실습', counter: 'enchantsApplied', goal: 1, gold: 1500 },
    { key: 'dq_arena', name: '투기장 몸풀기', counter: 'arenaWaves', goal: 5, gold: 2000 },
    { key: 'dq_boss', name: '거물 사냥', counter: 'bossKills', goal: 2, gold: 2500 },
  ];
  // 장비 분해 — 티어 인덱스별 던전 정수 회수(+15% 확률 인챈티드 재료)
  const SALVAGE = { essenceByTier: [1, 2, 4, 7, 12, 20, 32, 50, 80], bonusChance: 0.15, bonusItem: 'enchanted_iron' };
  // 주간 순환 보스 — ISO 주차마다 한 계열이 강화(⭐ HP·보상 2배)
  const WEEKLY = { families: ['zombie_slayer', 'spider_slayer', 'wolf_slayer', 'enderman_slayer', 'blaze_slayer'], hpMul: 2, rewardMul: 2 };
  // 핫 포테이토 북 규칙
  const HPB = { maxBooks: 10, fumingMax: 15, weaponDmgPerBook: 2, armorDefPerBook: 2, armorHpPerBook: 4 };

  /* V15: 마인크래프트 16색 염료 팔레트 — 양털/콘크리트/테라코타 생성의 단일 출처 */
  const DYES = [
    { k: 'white', name: '하양', hex: '#e9ecec' }, { k: 'orange', name: '주황', hex: '#f07613' },
    { k: 'magenta', name: '자홍', hex: '#bd44b3' }, { k: 'lightblue', name: '하늘', hex: '#3aafd9' },
    { k: 'yellow', name: '노랑', hex: '#f8c527' }, { k: 'lime', name: '연두', hex: '#70b919' },
    { k: 'pink', name: '분홍', hex: '#ed8dac' }, { k: 'gray', name: '회색', hex: '#3e4447' },
    { k: 'lightgray', name: '연회색', hex: '#8e8e86' }, { k: 'cyan', name: '청록', hex: '#158991' },
    { k: 'purple', name: '보라', hex: '#792aac' }, { k: 'blue', name: '파랑', hex: '#35399d' },
    { k: 'brown', name: '갈색', hex: '#724728' }, { k: 'green', name: '초록', hex: '#546d1b' },
    { k: 'red', name: '빨강', hex: '#a12722' }, { k: 'black', name: '검정', hex: '#1d1d21' },
  ];

  /* V14: 건축가 빌더 상점 — 건축 블럭을 코인으로 대량(스택) 구매(설치는 서바이벌 소모) */
  const BUILDER_SHOP = [
    { key: 'cobblestone', name: '조약돌', amount: 16, price: 40 },
    { key: 'stone', name: '돌', amount: 16, price: 64 },
    { key: 'stone_bricks', name: '석재 벽돌', amount: 16, price: 120 },
    { key: 'oak_planks', name: '참나무 판자', amount: 16, price: 80 },
    { key: 'birch_planks', name: '자작나무 판자', amount: 16, price: 80 },
    { key: 'spruce_planks', name: '가문비 판자', amount: 16, price: 80 },
    { key: 'oak_log', name: '참나무 원목', amount: 16, price: 120 },
    { key: 'bricks', name: '벽돌', amount: 16, price: 160 },
    { key: 'sandstone', name: '사암', amount: 16, price: 90 },
    { key: 'quartz_block', name: '석영 블럭', amount: 16, price: 260 },
    { key: 'glass', name: '유리', amount: 16, price: 120 },
    { key: 'glowstone', name: '발광석', amount: 8, price: 200 },
    { key: 'wool_white', name: '흰 양털', amount: 16, price: 100 },
    { key: 'wool_red', name: '빨강 양털', amount: 16, price: 100 },
    { key: 'obsidian', name: '흑요석', amount: 4, price: 320 },
    { key: 'dirt', name: '흙', amount: 32, price: 30 },
    { key: 'sand', name: '모래', amount: 16, price: 40 },
    { key: 'gravel', name: '자갈', amount: 16, price: 40 },
  ];
  // V15: 16색 양털·콘크리트·테라코타를 빌더 상점에 자동 편성(색상 건축)
  DYES.forEach(d => {
    BUILDER_SHOP.push({ key: 'wool_' + d.k, name: d.name + ' 양털', amount: 16, price: 100 });
    BUILDER_SHOP.push({ key: 'concrete_' + d.k, name: d.name + ' 콘크리트', amount: 16, price: 130 });
    BUILDER_SHOP.push({ key: 'terracotta_' + d.k, name: d.name + ' 테라코타', amount: 16, price: 120 });
  });
  // V15: 장식 석재/목재
  [['smooth_stone', '매끄러운 돌', 90], ['chiseled_stone_bricks', '조각된 석재벽돌', 150], ['mossy_cobblestone', '이끼 낀 조약돌', 90],
   ['polished_andesite', '윤나는 안산암', 90], ['prismarine', '프리즈머린', 200], ['bookshelf', '책장', 260], ['hay_block', '건초 더미', 80]]
    .forEach(([k, n, p]) => BUILDER_SHOP.push({ key: k, name: n, amount: 16, price: p }));
  // V17: 모든 나무 판자(신규 3종) + 계단·반블럭(모든 나무 + 돌 계열) — 건축의 핵심 형태
  const SHAPE_NAMES = [
    ['oak_planks', '참나무'], ['birch_planks', '자작나무'], ['spruce_planks', '가문비'],
    ['dark_oak_planks', '짙은참나무'], ['jungle_planks', '정글'], ['acacia_planks', '아카시아'],
    ['stone', '돌'], ['cobblestone', '조약돌'], ['stone_bricks', '석재벽돌'],
    ['quartz_block', '석영'], ['sandstone', '사암'], ['bricks', '벽돌'],
    ['purpur', '퍼퍼'], ['smooth_stone', '매끄러운 돌'], ['prismarine', '프리즈머린'],
  ];
  [['dark_oak_planks', '짙은참나무 판자'], ['jungle_planks', '정글 판자'], ['acacia_planks', '아카시아 판자']]
    .forEach(([k, n]) => BUILDER_SHOP.push({ key: k, name: n, amount: 16, price: 80 }));
  SHAPE_NAMES.forEach(([k, n]) => {
    BUILDER_SHOP.push({ key: k + '_slab', name: n + ' 반블럭', amount: 16, price: 70 });
    BUILDER_SHOP.push({ key: k + '_stairs', name: n + ' 계단', amount: 16, price: 90 });
  });
  // V17-B: 울타리 + 트랩도어(모든 나무)
  const WOOD_KO = [['oak', '참나무'], ['birch', '자작나무'], ['spruce', '가문비'], ['dark_oak', '짙은참나무'], ['jungle', '정글'], ['acacia', '아카시아']];
  WOOD_KO.forEach(([w, n]) => {
    BUILDER_SHOP.push({ key: w + '_fence', name: n + ' 울타리', amount: 16, price: 80 });
    BUILDER_SHOP.push({ key: w + '_trapdoor', name: n + ' 트랩도어', amount: 8, price: 70 });
    BUILDER_SHOP.push({ key: w + '_door', name: n + ' 문', amount: 4, price: 90 });
  });

  /* ---------------- V13-B: 위치 기반 퀘스트 시스템 ----------------
     퀘스트를 주는 NPC는 특정 월드의 특정 좌표에 서 있다. 플레이어가 그 반경(region) 안에
     들어오면 우측 중앙에 퀘스트가 나타나고, 떠나면 사라진다. NPC에게 E(대화)로 수락.
     objective.type: gather(누적 채집) / kill / killBoss / mine / chop / farm / fish / craft / place / gold / talk(대화만)
     metric은 economy.js questMetric()가 카운터/컬렉션 스냅샷으로 계산(일일퀘스트와 동일 방식). */
  const QUEST_NPCS = [
    // 프라이빗 섬(home) — 온보딩 튜토리얼 담당
    { key: 'jerry',   name: '제리',        world: 'home', x: 99,  z: 78,  color: 0x4fae5a, region: 12, blurb: '이 섬을 물려준 마을의 괴짜 어르신' },
    { key: 'pat',     name: '농부 팻',      world: 'home', x: 92,  z: 106, color: 0x7cb342, region: 12, blurb: '스폰섬 텃밭을 가꾸는 이웃' },
    // 허브(hub) — 각 구역별 퀘스트 안내인
    { key: 'q_village', name: '촌장 엘더',   world: 'hub', x: 218, z: 236, color: 0xcaa24a, region: 22, blurb: '허브 마을의 촌장' },
    { key: 'q_mine',    name: '갱도장 브록',  world: 'hub', x: 118, z: 204, color: 0x8a8a8a, region: 24, blurb: '석탄 광산 갱도장' },
    { key: 'q_forest',  name: '숲지기 로완',  world: 'hub', x: 150, z: 134, color: 0x5d8a3a, region: 24, blurb: '삼림 관리인' },
    { key: 'q_farm',    name: '방앗간 밀리', world: 'hub', x: 322, z: 214, color: 0xd8b23a, region: 24, blurb: '대농장 방앗간지기' },
    { key: 'q_dock',    name: '뱃사공 핀',   world: 'hub', x: 320, z: 322, color: 0x3f9fd0, region: 22, blurb: '선착장 뱃사공' },
    { key: 'q_grave',   name: '묘지기 모르', world: 'hub', x: 158, z: 314, color: 0x584a6a, region: 22, blurb: '묘지 관리인' },
    { key: 'q_arena',   name: '투기 심판',   world: 'hub', x: 224, z: 340, color: 0xb8860b, region: 22, blurb: '콜로세움 심판' },
    { key: 'q_wizard',  name: '마법사 그웬돌린', world: 'hub', x: 322, z: 120, color: 0x9365b8, region: 26, blurb: '마법사 탑 주인' },
    { key: 'q_ruins',   name: '유물학자 델피', world: 'hub', x: 88,  z: 280, color: 0x8a7b5a, region: 24, blurb: '폐허 발굴가' },
    { key: 'q_snow',    name: '설산 안내인 프로스티', world: 'hub', x: 224, z: 78, color: 0x9fd4e8, region: 26, blurb: '설산 등반 가이드' },
  ];
  // region은 QUEST_NPCS의 좌표 반경을 그대로 쓴다(economy.js에서 매핑).
  const QUESTS = [
    // ===== 온보딩 튜토리얼 체인(제리, home) =====
    { key: 'tut_welcome', giver: 'jerry', name: '스카이블럭에 온 걸 환영해!', req: null,
      story: '어이 신참! 이 작은 섬이 이제 자네 거야. 우선 저기 참나무를 두들겨서 원목을 좀 모아보게.',
      objective: { type: 'gather', target: 'oaklog', count: 4, label: '참나무 원목 채집' },
      reward: { gold: 60, xp: { skill: 'foraging', amt: 30 }, items: [] } },
    { key: 'tut_craft_tools', giver: 'jerry', name: '첫 도구 만들기', req: 'tut_welcome',
      story: '원목은 손에 넣었군! 이제 ✦ 메뉴의 3×3 제작대에서 판자 → 막대 → 나무 곡괭이를 만들어봐. 곡괭이가 있어야 돌을 캘 수 있거든.',
      objective: { type: 'craft', target: null, count: 3, label: '아이템 3개 제작' },
      reward: { gold: 100, xp: { skill: 'foraging', amt: 40 }, items: [{ key: 'stick', n: 4 }] } },
    { key: 'tut_mine_cobble', giver: 'jerry', name: '돌을 캐자', req: 'tut_craft_tools',
      story: '나무 곡괭이를 들고 포탈섬의 조약돌 바닥이나 아무 돌이나 캐서 조약돌을 모아봐. 건축의 기본이지.',
      objective: { type: 'gather', target: 'cobblestone', count: 12, label: '조약돌 채집' },
      reward: { gold: 140, xp: { skill: 'mining', amt: 60 }, items: [{ key: 'oak_planks', n: 8 }] } },
    { key: 'tut_portal', giver: 'jerry', name: '허브로 떠나기', req: 'tut_mine_cobble',
      story: '준비 됐군! 포탈섬의 보라색 포탈을 타면 허브 마을로 갈 수 있어. 거기서 진짜 모험이 시작된다네. 촌장 엘더를 찾아가게.',
      objective: { type: 'talk', target: null, count: 1, label: '포탈로 허브 이동' },
      reward: { gold: 200, xp: { skill: 'combat', amt: 40 }, items: [{ key: 'wooden_sword', n: 1 }] } },
    // 팻(home) — 사이드 퀘스트
    { key: 'home_farm', giver: 'pat', name: '텃밭 일손', req: null,
      story: '섬에서 농사도 지을 수 있다네. 밀이든 당근이든 작물을 좀 수확해다 주게.',
      objective: { type: 'farm', target: null, count: 10, label: '작물 수확' },
      reward: { gold: 120, xp: { skill: 'farming', amt: 50 }, items: [{ key: 'wheat', n: 4 }] } },
    { key: 'home_build', giver: 'pat', name: '내 집 짓기', req: 'home_farm',
      story: '이제 집을 지어봐야지. 아무 블럭이나 20개쯤 설치해서 자네만의 공간을 만들어보게.',
      objective: { type: 'place', target: null, count: 20, label: '블럭 설치' },
      reward: { gold: 180, xp: { skill: 'foraging', amt: 60 }, items: [{ key: 'glass', n: 8 }] } },
    // ===== 허브 촌장 엘더(마을) =====
    { key: 'hub_intro', giver: 'q_village', name: '허브에 오신 걸 환영합니다', req: null,
      story: '허브 마을에 잘 오셨소. 상점, 은행, 경매장이 모두 여기 있지요. 우선 근처 몹을 몇 마리 처치해 실력을 보여주시오.',
      objective: { type: 'kill', target: null, count: 8, label: '몬스터 처치' },
      reward: { gold: 400, xp: { skill: 'combat', amt: 120 }, items: [] } },
    { key: 'hub_trade', giver: 'q_village', name: '장사의 기본', req: 'hub_intro',
      story: '모험가는 돈을 벌 줄 알아야 하오. 상점에 잡템을 팔거나 몹을 잡아 코인 2,000G을 모아보시오.',
      objective: { type: 'gold', target: null, count: 2000, label: '코인 획득' },
      reward: { gold: 500, xp: { skill: 'combat', amt: 100 }, items: [] } },
    // ===== 광산 갱도장 브록 =====
    { key: 'mine_coal', giver: 'q_mine', name: '석탄이 필요해', req: null,
      story: '갱도가 춥구먼. 석탄을 캐다 주면 화로를 지필 수 있겠어. 광산에서 돌과 석탄을 캐오게.',
      objective: { type: 'mine', target: null, count: 40, label: '블럭 채굴' },
      reward: { gold: 350, xp: { skill: 'mining', amt: 140 }, items: [{ key: 'iron_ingot', n: 3 }] } },
    { key: 'mine_iron', giver: 'q_mine', name: '철광 확보', req: 'mine_coal',
      story: '실력이 붙었군! 이번엔 더 깊이 들어가 철을 캐와. 철 곡괭이를 만들면 다이아도 캘 수 있지.',
      objective: { type: 'gather', target: 'iron_ingot', count: 8, label: '철 주괴 확보' },
      reward: { gold: 600, xp: { skill: 'mining', amt: 220 }, items: [] } },
    // ===== 삼림 숲지기 로완 =====
    { key: 'forest_wood', giver: 'q_forest', name: '목재 조달', req: null,
      story: '건축가들이 목재를 찾고 있소. 여러 나무를 베어 원목을 모아주시오.',
      objective: { type: 'chop', target: null, count: 30, label: '나무 벌목' },
      reward: { gold: 320, xp: { skill: 'foraging', amt: 160 }, items: [] } },
    // ===== 대농장 방앗간 밀리 =====
    { key: 'farm_crop', giver: 'q_farm', name: '수확의 계절', req: null,
      story: '방앗간이 바쁘답니다. 밀과 작물을 잔뜩 수확해 주세요.',
      objective: { type: 'farm', target: null, count: 50, label: '작물 수확' },
      reward: { gold: 380, xp: { skill: 'farming', amt: 170 }, items: [] } },
    // ===== 선착장 뱃사공 핀 =====
    { key: 'dock_fish', giver: 'q_dock', name: '오늘의 조황', req: null,
      story: '바다가 잔잔할 때 낚시나 해보시게. 물고기를 좀 낚아오면 좋겠구먼.',
      objective: { type: 'fish', target: null, count: 10, label: '물고기 낚시' },
      reward: { gold: 420, xp: { skill: 'fishing', amt: 180 }, items: [] } },
    // ===== 묘지기 모르 =====
    { key: 'grave_undead', giver: 'q_grave', name: '망자를 잠재워라', req: null,
      story: '밤이면 묘지에서 언데드가 기어나온다오. 좀비와 해골을 처치해 주시오.',
      objective: { type: 'kill', target: null, count: 20, label: '언데드 처치' },
      reward: { gold: 550, xp: { skill: 'combat', amt: 200 }, items: [] } },
    { key: 'grave_boss', giver: 'q_grave', name: '무덤의 우두머리', req: 'grave_undead',
      story: '언데드를 이끄는 강한 놈이 있소. 보스급 몬스터를 처치해 무덤의 평화를 찾아주시오.',
      objective: { type: 'killBoss', target: null, count: 1, label: '보스급 처치' },
      reward: { gold: 900, xp: { skill: 'combat', amt: 350 }, items: [] } },
    // ===== 투기장 심판 =====
    { key: 'arena_warm', giver: 'q_arena', name: '투기장 입문', req: null,
      story: '콜로세움에 도전할 텐가? 우선 몹을 25마리 잡아 몸을 풀어보게.',
      objective: { type: 'kill', target: null, count: 25, label: '몬스터 처치' },
      reward: { gold: 700, xp: { skill: 'combat', amt: 260 }, items: [] } },
    { key: 'arena_master', giver: 'q_arena', name: '검투 챔피언', req: 'arena_warm',
      story: '이제 진짜 실력을 보여줄 때다. 60마리를 더 쓰러뜨려 챔피언 자격을 증명해라!',
      objective: { type: 'kill', target: null, count: 60, label: '몬스터 처치' },
      reward: { gold: 1500, xp: { skill: 'combat', amt: 500 }, items: [] } },
    // ===== 마법사 그웬돌린(마법사 탑) =====
    { key: 'wiz_intro', giver: 'q_wizard', name: '마력의 기초', req: null,
      story: '마법을 배우고 싶다고? 우선 마력이 깃든 청금석을 캐 오게. 광산 깊은 곳에 있지.',
      objective: { type: 'gather', target: 'lapis', count: 10, label: '청금석 채집' },
      reward: { gold: 600, xp: { skill: 'enchanting', amt: 200 }, items: [] } },
    { key: 'wiz_hunt', giver: 'q_wizard', name: '마력 정수 수집', req: 'wiz_intro',
      story: '마력 실험에 몬스터의 정수가 필요하네. 30마리쯤 처치해 정수를 모아주게.',
      objective: { type: 'kill', target: null, count: 30, label: '몬스터 처치' },
      reward: { gold: 800, xp: { skill: 'enchanting', amt: 300 }, items: [] } },
    // ===== 유물학자 델피(폐허) =====
    { key: 'ruins_dig', giver: 'q_ruins', name: '유적 발굴', req: null,
      story: '이 폐허 아래엔 고대 유물이 잠들어 있소. 돌과 흙을 파내어 발굴을 도와주시오.',
      objective: { type: 'mine', target: null, count: 70, label: '블럭 채굴' },
      reward: { gold: 500, xp: { skill: 'mining', amt: 220 }, items: [] } },
    { key: 'ruins_soul', giver: 'q_ruins', name: '요정의 영혼', req: 'ruins_dig',
      story: '유적 곳곳에 요정의 영혼이 숨어 있소. 3개만 찾아 모아다 주시오. 세계 곳곳을 살펴보시게.',
      objective: { type: 'souls', target: null, count: 3, label: '요정 영혼 수집' },
      reward: { gold: 1200, xp: { skill: 'combat', amt: 300 }, items: [] } },
    // ===== 설산 안내인 프로스티(설산) =====
    { key: 'snow_climb', giver: 'q_snow', name: '설산 등반', req: null,
      story: '설산 정상은 경치가 끝내주지! 가문비나무를 헤치고 올라와 봐. 우선 나무부터 좀 베어줄래?',
      objective: { type: 'chop', target: null, count: 25, label: '나무 벌목' },
      reward: { gold: 450, xp: { skill: 'foraging', amt: 200 }, items: [] } },
    { key: 'snow_hunt', giver: 'q_snow', name: '설원의 위협', req: 'snow_climb',
      story: '설산에도 몬스터가 출몰해. 20마리를 처치해 등반로를 안전하게 만들어줘.',
      objective: { type: 'kill', target: null, count: 20, label: '몬스터 처치' },
      reward: { gold: 700, xp: { skill: 'combat', amt: 260 }, items: [] } },
    // ===== 기존 NPC 추가 체인 =====
    { key: 'hub_explore', giver: 'q_village', name: '허브 탐험가', req: 'hub_trade',
      story: '허브 곳곳엔 요정의 영혼이 숨어 있소. 5개를 찾아내면 진정한 탐험가로 인정하리다.',
      objective: { type: 'souls', target: null, count: 5, label: '요정 영혼 수집' },
      reward: { gold: 1000, xp: { skill: 'combat', amt: 300 }, items: [] } },
    { key: 'mine_diamond', giver: 'q_mine', name: '다이아몬드의 꿈', req: 'mine_iron',
      story: '철을 넘어 다이아몬드다! 깊은 곳에서 다이아몬드 3개만 캐 오면 내 평생소원이 이뤄지네.',
      objective: { type: 'gather', target: 'diamond', count: 3, label: '다이아몬드 채집' },
      reward: { gold: 1400, xp: { skill: 'mining', amt: 400 }, items: [] } },
    { key: 'forest_apple', giver: 'q_forest', name: '사과 수확', req: 'forest_wood',
      story: '나뭇잎 사이에서 사과가 떨어진다오. 사과 5개를 모아다 주시오.',
      objective: { type: 'gather', target: 'apple', count: 5, label: '사과 수집' },
      reward: { gold: 400, xp: { skill: 'foraging', amt: 150 }, items: [] } },
    { key: 'dock_treasure', giver: 'q_dock', name: '바다의 보물', req: 'dock_fish',
      story: '큰 물고기가 잘 잡히는 날일세. 25마리쯤 더 낚아 보물 상자를 채워주게!',
      objective: { type: 'fish', target: null, count: 25, label: '물고기 낚시' },
      reward: { gold: 900, xp: { skill: 'fishing', amt: 350 }, items: [] } },
    { key: 'jerry_home', giver: 'jerry', name: '보금자리 꾸미기', req: 'home_build',
      story: '이제 자네도 어엿한 섬 주인이군! 마지막으로 블럭 40개를 더 설치해 근사한 집을 완성해보게.',
      objective: { type: 'place', target: null, count: 40, label: '블럭 설치' },
      reward: { gold: 500, xp: { skill: 'foraging', amt: 200 }, items: [{ key: 'glowstone', n: 4 }] } },
  ];

  window.ECON_DATA = {
    ITEM_TIERS, COLLECTIONS, SKILLS, GATHER_TABLE, TOOLS, MINIONS, MINION_STORAGE_BASE, MINION_STORAGE_UPGRADED,
    MINION_STORAGE_UPGRADE_COST, MINION_OFFLINE_CAP_HOURS, MINION_SLOT_MAX, MINION_SLOT_COST_BASE, MINION_SLOT_COST_MUL,
    MINION_FUEL, MINION_FUEL2, SLAYERS, DUNGEON, DUNGEON_ROOM_SCORE, ESSENCE_SHOP, SHOP, DAILY_SELL_LIMIT_PER_STACK,
    EQUIPMENT, STARFORCE, REFORGES, ITEM_ROLL,
    TRAITS, EQUIP_SETS, FIELD_DIFF, ARENA, ACHIEVEMENTS, DAILY_QUESTS, SALVAGE, WEEKLY, HPB, QUESTS, QUEST_NPCS, BUILDER_SHOP, DYES,
    TALISMANS, MAGICAL_POWER, PETS, PET_XP_BASE, PET_XP_EXP, PET_MAX_LEVEL,
    ENCHANTS, CHAOS_ENCHANT, RECIPES, MASTER_MODE,
    FAIRY_SOULS, BANK, DAILY_DEALS, DUNGEON_CLASSES, ZONES, EASTER_EGGS,
    SKILL_XP_TABLE, SKILL_MAX_LEVEL, SKILL_MAX_BY, BASE_STATS, BASE_STATS2, GEM_TYPES, GEM_QUALITY, GEM_BASE, GEM_SLOTS_BY_TIER, RECOMB, ENCHANTED_RES, ENCHANTED_BLOCK_RES, SLAYER_XP_LEVELS, SLAYER_QUEST,
  };
})();
