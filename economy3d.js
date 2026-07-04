/* =========================================================================
   economy3d.js — "경제" 탭 3D 월드 V2 (Three.js r128)
   192×192 대형 군도(7개 테마 섬 + 사당)를 실제 바다 위에 배치.
   - 중앙 마을(입장 가능한 건물 6채·분수·가로등) · 깊은 동굴(산+광맥 동굴)
   - 농장 벌판(풍차·헛간·6종 작물) · 속삭이는 숲(3종 나무·오두막)
   - 어부의 부두(등대·부두·보트) · 슬레이어 황무지(제단·용암) · 카타콤 지구라트(7단)
   - 다리·페어리 소울 12개·미니맵·존 배너·앰비언트 몹·구름·낮밤 주기
   게임 로직/패널은 economy.js 그대로 재사용(이 파일은 표현+상호작용만).
   ========================================================================= */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  let W = 192, H = 48, Dp = 192;   // 월드마다 크기가 다르다(loadWorld에서 설정)
  const SEA = 10;                        // 수면 y(9~10 물, 7~8 모래 바닥)
  const REACH = 4.5, DOT_MIN = 0.86;
  const DAY_LEN = 1200;                  // 낮밤 주기(초) — 모험 탭과 동일

  /* ---------------- 블록 정의 ---------------- */
  const BLOCKS = [
    { key: 'air', solid: false, opaque: false },
    { key: 'stone', tex: 'stone' },
    { key: 'cobblestone', tex: 'cobble' },
    { key: 'dirt', tex: 'dirt' },
    { key: 'grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
    { key: 'sand', tex: 'sand' },
    { key: 'sandstone', tex: 'sandstone' },
    { key: 'farmland', tex: { top: 'farmland_top', side: 'dirt', bottom: 'dirt' } },
    { key: 'oak_planks', tex: 'planks' },
    { key: 'birch_planks', tex: 'birch_planks' },
    { key: 'spruce_planks', tex: 'spruce_planks' },
    { key: 'oak_log', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } },
    { key: 'birch_log', tex: { top: 'log_top', side: 'birch_side', bottom: 'log_top' } },
    { key: 'spruce_log', tex: { top: 'spruce_top', side: 'spruce_side', bottom: 'spruce_top' } },
    { key: 'oak_leaves', tex: 'leaves' },
    { key: 'spruce_leaves', tex: 'spruce_leaves' },
    { key: 'stone_bricks', tex: 'stonebrick' },
    { key: 'bricks', tex: 'bricks' },
    { key: 'obsidian', tex: 'obsidian' },
    { key: 'bedrock', tex: 'bedrock' },
    { key: 'glass', tex: 'glass', opaque: false },
    { key: 'glowstone', tex: 'glow' },
    { key: 'coal_ore', tex: 'coal_ore' },
    { key: 'iron_ore', tex: 'iron_ore' },
    { key: 'gold_ore', tex: 'gold_ore' },
    { key: 'lapis_ore', tex: 'lapis_ore' },
    { key: 'redstone_ore', tex: 'redstone_ore' },
    { key: 'diamond_ore', tex: 'diamond_ore' },
    { key: 'emerald_ore', tex: 'emerald_ore' },
    { key: 'water', tex: 'water', solid: false, opaque: false, liquid: true },
    { key: 'lava', tex: 'lava', solid: false, opaque: false, liquid: true, lava: true },
    { key: 'pumpkin', tex: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' } },
    { key: 'melon', tex: 'melon' },
    { key: 'wheat_ripe', tex: 'wheat_mature', opaque: false, solid: false, cross: true },
    { key: 'carrot_ripe', tex: 'carrot_mature', opaque: false, solid: false, cross: true },
    { key: 'potato_ripe', tex: 'potato_mature', opaque: false, solid: false, cross: true },
    { key: 'sugar_cane', tex: 'sugar_cane', opaque: false, solid: false, cross: true },
    { key: 'tall_grass', tex: 'tall_grass', opaque: false, solid: false, cross: true },
    { key: 'flower_red', tex: 'flower_red', opaque: false, solid: false, cross: true },
    { key: 'flower_yellow', tex: 'flower_yellow', opaque: false, solid: false, cross: true },
    { key: 'dark_oak_log', tex: { top: 'dark_oak_top', side: 'dark_oak_side', bottom: 'dark_oak_top' } },
    { key: 'dark_oak_leaves', tex: 'dark_oak_leaves' },
    { key: 'jungle_log', tex: { top: 'jungle_top', side: 'jungle_side', bottom: 'jungle_top' } },
    { key: 'jungle_leaves', tex: 'jungle_leaves' },
    { key: 'acacia_log', tex: { top: 'acacia_top', side: 'acacia_side', bottom: 'acacia_top' } },
    { key: 'acacia_leaves', tex: 'acacia_leaves' },
    { key: 'netherrack', tex: 'netherrack' },
    { key: 'soul_sand', tex: 'soul_sand' },
    { key: 'nether_bricks', tex: 'nether_bricks' },
    { key: 'end_stone', tex: 'end_stone' },
    { key: 'snow_block', tex: 'snow' },
    { key: 'ice', tex: 'ice', opaque: false },
    { key: 'mycelium', tex: { top: 'mycelium_top', side: 'grass_side', bottom: 'dirt' } },
    { key: 'mushroom_stem', tex: 'mushroom_stem' },
    { key: 'mushroom_red_block', tex: 'mushroom_red' },
    { key: 'mushroom_brown_block', tex: 'mushroom_brown' },
    { key: 'gravel', tex: 'gravel' },
    { key: 'end_bricks', tex: 'end_bricks' },
    { key: 'purpur', tex: 'purpur' },
    { key: 'quartz_block', tex: 'quartz' },
    { key: 'magma_block', tex: 'magma' },
    { key: 'coarse_dirt', tex: 'coarse_dirt' },
  ];
  // V15: 16색 양털·콘크리트·테라코타(단일 출처 ECON_DATA.DYES) + 장식 블럭 — 색상 건축
  const DYE_HEX = {};
  ((window.ECON_DATA && window.ECON_DATA.DYES) || []).forEach(d => {
    DYE_HEX['wool_' + d.k] = d.hex; DYE_HEX['concrete_' + d.k] = d.hex; DYE_HEX['terracotta_' + d.k] = d.hex;
    BLOCKS.push({ key: 'wool_' + d.k, tex: 'wool_' + d.k });
    BLOCKS.push({ key: 'concrete_' + d.k, tex: 'concrete_' + d.k });
    BLOCKS.push({ key: 'terracotta_' + d.k, tex: 'terracotta_' + d.k });
  });
  [['smooth_stone', 'smooth_stone'], ['chiseled_stone_bricks', 'chiseled_stone_bricks'], ['mossy_cobblestone', 'mossy_cobble'],
   ['polished_andesite', 'polished_andesite'], ['prismarine', 'prismarine'], ['bookshelf', 'bookshelf'],
   ['hay_block', { top: 'hay_top', side: 'hay_side', bottom: 'hay_top' }]].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));
  // V17: 모든 나무 판자(다크오크/정글/아카시아 신규) + 계단/반블럭 형태 블럭(모든 나무 + 돌 계열)
  ['dark_oak_planks', 'jungle_planks', 'acacia_planks'].forEach(k => BLOCKS.push({ key: k, tex: k }));
  const SHAPE_MATS = [
    { k: 'oak_planks', tex: 'planks' }, { k: 'birch_planks', tex: 'birch_planks' }, { k: 'spruce_planks', tex: 'spruce_planks' },
    { k: 'dark_oak_planks', tex: 'dark_oak_planks' }, { k: 'jungle_planks', tex: 'jungle_planks' }, { k: 'acacia_planks', tex: 'acacia_planks' },
    { k: 'stone', tex: 'stone' }, { k: 'cobblestone', tex: 'cobble' }, { k: 'stone_bricks', tex: 'stonebrick' },
    // V18-B: 석재/장식 계열 확장(계단·반블럭 더 다양하게)
    { k: 'quartz_block', tex: 'quartz' }, { k: 'sandstone', tex: 'sandstone' }, { k: 'bricks', tex: 'bricks' },
    { k: 'purpur', tex: 'purpur' }, { k: 'smooth_stone', tex: 'smooth_stone' }, { k: 'prismarine', tex: 'prismarine' },
  ];
  SHAPE_MATS.forEach(m => {
    BLOCKS.push({ key: m.k + '_slab', tex: m.tex, shape: 'slab', opaque: false });
    for (let f = 0; f < 4; f++) BLOCKS.push({ key: m.k + '_stairs_' + f, tex: m.tex, shape: 'stairs', facing: f, opaque: false });
  });
  // V17-B: 울타리(자동 연결) + 트랩도어 — 모든 나무
  const WOOD_SHAPES = [['oak', 'planks'], ['birch', 'birch_planks'], ['spruce', 'spruce_planks'], ['dark_oak', 'dark_oak_planks'], ['jungle', 'jungle_planks'], ['acacia', 'acacia_planks']];
  WOOD_SHAPES.forEach(([w, tex]) => {
    BLOCKS.push({ key: w + '_fence', tex, shape: 'fence', opaque: false });
    BLOCKS.push({ key: w + '_trapdoor', tex, shape: 'trapdoor', opaque: false, collTop: 0.1875 });
    // V17-C: 문(2칸 높이, 여닫이) — 닫힘(막힘)/열림(통과), 4방향
    for (let f = 0; f < 4; f++) {
      BLOCKS.push({ key: w + '_door_c_' + f, tex, shape: 'door', facing: f, open: false, opaque: false });
      BLOCKS.push({ key: w + '_door_o_' + f, tex, shape: 'door', facing: f, open: true, opaque: false, solid: false });
    }
  });
  const ID = {};
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });

  /* V12 블럭 경제: 파괴 시 드롭 아이템(null=드롭 없음). 대부분 자기 자신, MC식 예외만 명시. */
  const BLOCK_DROP = {
    grass: 'dirt', farmland: 'dirt', mycelium: 'dirt',
    stone: 'cobblestone', coal_ore: 'coal', iron_ore: 'iron', gold_ore: 'gold', lapis_ore: 'lapis',
    redstone_ore: 'redstone', diamond_ore: 'diamond', emerald_ore: 'emerald',
    oak_log: 'oaklog', birch_log: 'birchlog', spruce_log: 'sprucelog',
    oak_leaves: null, spruce_leaves: null, dark_oak_leaves: null, jungle_leaves: null, acacia_leaves: null,
    tall_grass: null, flower_red: null, flower_yellow: null, sugar_cane: 'sugarcane',
    wheat_ripe: 'wheat', carrot_ripe: 'carrot', potato_ripe: 'potato',
    bedrock: null, water: null, lava: null,
  };
  function blockDropKey(id) {
    const b = BLOCKS[id]; if (!b) return null;
    if (b.key in BLOCK_DROP) return BLOCK_DROP[b.key];
    return b.key;   // 건축 블럭은 자기 자신을 드롭(재배치 가능)
  }
  /* V12: 설치 가능한 아이템 키 → 블럭 ID(자원 키 별칭 포함) */
  const PLACE_BLOCK = {};
  BLOCKS.forEach(b => { if (b.key !== 'air' && b.key !== 'bedrock' && !b.liquid && !/_stairs_\d$/.test(b.key) && !/_door_[co]_\d$/.test(b.key)) PLACE_BLOCK[b.key] = b.id; });   // 계단/문 변형은 아이템 아님
  PLACE_BLOCK.oaklog = ID.oak_log; PLACE_BLOCK.birchlog = ID.birch_log; PLACE_BLOCK.sprucelog = ID.spruce_log;
  PLACE_BLOCK.sugarcane = ID.sugar_cane;
  // V17: 계단 제네릭 아이템 → 설치 시 방향 재계산(기본 남향), 방향변형은 파괴 시 제네릭 아이템 드롭
  SHAPE_MATS.forEach(m => {
    PLACE_BLOCK[m.k + '_stairs'] = ID[m.k + '_stairs_0'];
    for (let f = 0; f < 4; f++) BLOCK_DROP[m.k + '_stairs_' + f] = m.k + '_stairs';
  });
  // V17-C: 문 제네릭 아이템 → 2칸 설치, 변형은 제네릭 드롭
  WOOD_SHAPES.forEach(([w]) => {
    PLACE_BLOCK[w + '_door'] = ID[w + '_door_c_0'];
    for (let f = 0; f < 4; f++) { BLOCK_DROP[w + '_door_c_' + f] = w + '_door'; BLOCK_DROP[w + '_door_o_' + f] = w + '_door'; }
  });
  function isPlaceable(key) { return key != null && PLACE_BLOCK[key] != null; }
  function isStairsItem(key) { return typeof key === 'string' && /_stairs$/.test(key); }
  function isDoorItem(key) { return typeof key === 'string' && /_door$/.test(key); }

  /* ---------------- 하늘 위 메가 허브(448×448, 실제 스카이블럭 허브 구역 구성) ----------------
     바다가 아니라 "공허 하늘"에 떠 있는 거대한 섬 하나. 중앙 마을 광장을 중심으로
     북쪽 설산 / 서쪽 석탄 광산 / 남서 묘지(+지하 크립트) / 동쪽 농지 / 북서 숲 /
     남동 낚시터 / 남쪽 콜로세움 / 북동 마법사 탑 / 폐허 / 카타콤 지구라트 / 외곽 워프 링. */
  const HUB_C = 224, HUB_R = 206;
  const HUB_ZONES = [
    { key: 'village', name: '🏘️ 마을 광장', x: 224, z: 224, r: 54 },
    { key: 'snowpeak', name: '🏔️ 설산', x: 224, z: 86, r: 68 },
    { key: 'coalmine', name: '⛏️ 석탄 광산', x: 96, z: 208, r: 48 },
    { key: 'graveyard', name: '💀 묘지', x: 152, z: 318, r: 44 },
    { key: 'farm', name: '🌾 농지', x: 330, z: 224, r: 50 },
    { key: 'forest', name: '🌲 숲', x: 140, z: 130, r: 46 },
    { key: 'pond', name: '🎣 낚시터', x: 322, z: 322, r: 36 },
    { key: 'arena', name: '🏟️ 콜로세움', x: 224, z: 352, r: 40 },
    { key: 'wizard', name: '🧙 마법사 탑', x: 322, z: 120, r: 30 },
    { key: 'ruins', name: '🏚️ 폐허', x: 88, z: 280, r: 30 },
    { key: 'dungeonentrance', name: '🗝️ 카타콤 입구', x: 296, z: 376, r: 32 },
  ];
  // (구 코드 호환: 앰비언트 동물 배치 등이 참조)
  const ISLANDS = [
    { key: 'hub', name: '🏘️ 마을 광장', cx: 224, cz: 224, r: 40, top: 20 },
    { key: 'mine', name: '⛏️ 석탄 광산', cx: 96, cz: 208, r: 40, top: 22 },
    { key: 'farm', name: '🌾 농지', cx: 330, cz: 224, r: 42, top: 20 },
    { key: 'forest', name: '🌲 숲', cx: 140, cz: 130, r: 40, top: 20 },
    { key: 'dock', name: '🎣 낚시터', cx: 322, cz: 322, r: 30, top: 20 },
    { key: 'slayerden', name: '💀 묘지', cx: 152, cz: 318, r: 38, top: 19 },
    { key: 'dungeonentrance', name: '🗝️ 카타콤 입구', cx: 296, cz: 376, r: 28, top: 20 },
    { key: 'shrine', name: '🧚 사당', cx: 224, cz: 158, r: 12, top: 20 },
  ];
  const BRIDGES = [];   // 하늘섬 컨셉: 다리 없음(허브는 하나의 대륙, 테마 월드는 워프)

  // 미니언 자원 → 배치 존
  const RESOURCE_ZONE = {
    stone: 'mine', coal: 'mine', iron: 'mine', gold: 'mine', lapis: 'mine', redstone: 'mine', diamond: 'mine', emerald: 'mine', obsidian: 'mine',
    wheat: 'farm', carrot: 'farm', potato: 'farm', pumpkin: 'farm', melon: 'farm', sugarcane: 'farm',
    oaklog: 'forest', birchlog: 'forest', sprucelog: 'forest',
    rawfish: 'dock', clay: 'dock',
    rotten_flesh: 'hub', bone: 'hub', string: 'hub', slime_ball: 'hub', blaze_rod: 'hub', ghast_tear: 'hub', leather: 'farm', feather: 'farm',
    apple: 'forest', salmon: 'dock', clownfish: 'dock', pufferfish: 'dock', prismarine: 'dock', sponge: 'dock',
    magma_cream: 'hub', spider_eye: 'hub', gunpowder: 'hub', ender_pearl: 'hub', ender_shard: 'hub',
  };
  const MINION_COLORS = {
    stone: 0x9a9a9a, coal: 0x2a2a2e, iron: 0xd8a282, gold: 0xf2d75c, lapis: 0x1f4fc0, redstone: 0xc81f28,
    diamond: 0x5decd5, emerald: 0x1fbf5c, obsidian: 0x2a2040,
    wheat: 0xd8b23a, carrot: 0xe07b1f, potato: 0xc8a25a, pumpkin: 0xd6791f, melon: 0x4c8f46, sugarcane: 0x8fc36a,
    oaklog: 0x8a6a3a, birchlog: 0xd7d3c8, sprucelog: 0x4a3722,
    rawfish: 0x3a6ee0, clay: 0xa4a8b6,
  };
  const MINION_SLOTS = {
    mine: [[48, 96], [50, 100], [46, 100], [52, 96], [44, 92], [50, 92]],
    farm: [[136, 52], [140, 54], [144, 56], [148, 58], [136, 46], [140, 44]],
    forest: [[48, 44], [52, 40], [44, 48], [50, 48], [40, 44], [46, 36]],
    dock: [[140, 142], [144, 140], [148, 138], [140, 148], [136, 146], [144, 152]],
  };
  // NPC(존 + 허브 서브탭 연결)
  const NPCS = [
    { key: 'shopkeeper', name: '상점 주인', zone: 'hub', tab: 'shop', x: 207, z: 243, color: 0x3a6ee0 },
    { key: 'bankTeller', name: '은행원', zone: 'hub', tab: 'bank', x: 241, z: 209, color: 0xf2d75c },
    { key: 'minionManager', name: '미니언 관리소장', zone: 'hub', tab: 'minions', x: 199, z: 215, color: 0x6aa84f },
    { key: 'petKeeper', name: '펫 상인', zone: 'hub', tab: 'pets', x: 250, z: 241, color: 0xe048c4 },
    { key: 'enchanter', name: '마법부여사', zone: 'hub', tab: 'enchant', x: 224, z: 201, color: 0x9365b8 },
    { key: 'auctioneer', name: '경매인', zone: 'hub', tab: 'deals', x: 212, z: 226, color: 0xc0392b },
    { key: 'gladiator', name: '검투사 마스터', zone: 'hub', tab: 'arena', x: 224, z: 346, color: 0xb8860b },   // V11: 콜로세움 아레나
    { key: 'reforgeSmith', name: '재련 대장장이', zone: 'hub', tab: 'reforge', x: 238, z: 226, color: 0x6b5436 },
    { key: 'guide', name: '모험 안내인', zone: 'hub', tab: 'stats', x: 224, z: 247, color: 0x2c82c9 },
    { key: 'craftsman', name: '장인(제작대)', zone: 'hub', tab: 'craft', x: 214, z: 210, color: 0x8a6a3a },
    { key: 'builder', name: '건축가 빌더', zone: 'hub', tab: 'buildshop', x: 246, z: 220, color: 0x9a7b4f },   // V14: 건축 자재상
    { key: 'starSmith', name: '별빛 강화공(스타포스)', zone: 'hub', tab: 'star', x: 234, z: 210, color: 0x54c8e8 },
    { key: 'mineForeman', name: '광산 감독관', zone: 'mine', x: 114, z: 208, color: 0x787878 },
    { key: 'farmForeman', name: '농장 관리인', zone: 'farm', x: 318, z: 218, color: 0xd8b23a },
    { key: 'lumberjack', name: '벌목꾼', zone: 'forest', x: 146, z: 138, color: 0x8a6a3a },
    { key: 'fisherman', name: '늙은 낚시꾼', zone: 'dock', x: 316, z: 326, color: 0x41a85f },
    { key: 'slayerMaster', name: '슬레이어 대장', zone: 'slayerden', x: 163, z: 318, color: 0x2a2040 },
    { key: 'dungeonGatekeeper', name: '던전 문지기', zone: 'dungeonentrance', x: 296, z: 371, color: 0x5a4327 },
    { key: 'tia', name: '요정 티아', zone: 'hub', tab: 'talismans', x: 224, z: 160, color: 0xffb7dd },
  ];
  // V5: "딸깍" 채집 노드는 폐지 — 광석/작물/나무/물을 직접 캐고 낚는다(인월드 채집).
  const NODES = [];
  // 페어리 소울 12개(탐험 보상 — 등대 꼭대기/동굴 심부/풍차 위/다리 밑/수중 등)
  const FAIRY_SPOTS = [
    { id: 0, x: 224, z: 74, y: null, hint: '설산 정상' },
    { id: 1, x: 322, z: 120, y: null, hint: '마법사 탑 꼭대기' },
    { id: 2, x: 152, z: 318, y: null, hint: '묘지 크립트 근처' },
    { id: 3, x: 96, z: 200, y: null, hint: '석탄 광산 동굴' },
    { id: 4, x: 344, z: 210, y: null, hint: '풍차 옆' },
    { id: 5, x: 296, z: 380, y: null, hint: '지구라트 뒤편' },
    { id: 6, x: 88, z: 280, y: null, hint: '폐허 기둥' },
    { id: 7, x: 224, z: 158, y: null, hint: '사당' },
    { id: 8, x: 224, z: 228, y: null, hint: '분수 뒤' },
    { id: 9, x: 322, z: 328, y: null, hint: '낚시터 오두막 지붕' },
    { id: 10, x: 224, z: 356, y: null, hint: '콜로세움 관중석' },
    { id: 11, x: 148, z: 124, y: null, hint: '숲 큰 나무 옆' },
    // V9: 테마 월드 소울 12개
    { id: 12, world: 'park', x: 72, z: 72, y: null, hint: '파크 중앙섬' },
    { id: 13, world: 'park', x: 72, z: 26, y: null, hint: '설원 가문비 부속섬' },
    { id: 14, world: 'barn', x: 70, z: 64, y: null, hint: '헛간 뒤' },
    { id: 15, world: 'mushroom', x: 40, z: 72, y: null, hint: '거대 버섯 아래' },
    { id: 16, world: 'gold', x: 56, z: 30, y: null, hint: '노천광 꼭대기' },
    { id: 17, world: 'deep', x: 48, z: 48, y: 8, hint: '다이아 심층' },
    { id: 18, world: 'spider', x: 64, z: 64, y: null, hint: '거미산 정상' },
    { id: 19, world: 'spider', x: 96, z: 40, y: null, hint: '아라크네 성소' },
    { id: 20, world: 'nether', x: 64, z: 40, y: 22, hint: '위더 홀' },
    { id: 21, world: 'nether', x: 40, z: 40, y: 34, hint: '블레이즈 첨탑' },
    { id: 22, world: 'end', x: 64, z: 64, y: 6, hint: '드래곤 둥지 제단' },
    { id: 23, world: 'end', x: 64, z: 98, y: null, hint: '보이드 세펄처 꼭대기' },
  ];

  /* ---------------- 상태 ---------------- */
  let running = false, contextLost = false, raf = 0, lastT = 0;
  let renderer = null, scene = null, camera = null, canvas = null;
  let world = null;
  let worldMode = 'hub';                  // 'hub'(공용 군도) | 'home'(프라이빗 섬 — 서바이벌: 캐서 모은 블럭만 설치)
  let worldHubCache = null;               // 허브 지형 캐시(포털 왕복 시 재생성 방지)
  const HOME_BOUNDS = { x0: 60, x1: 132, z0: 60, z1: 132 };   // 프라이빗 섬 메싱/편집 영역(빠른 리빌드)
  const HOME_CENTER = { x: 96, z: 96, r: 16, top: 20 };
  let selectedPlaceKey = null;            // V12: 현재 설치용으로 고른 블럭 아이템 키(보유한 것만 — 서바이벌, 무한 아님)
  const PORTALS = {
    hub: { x: 210, z: 224, target: 'home', label: '🏝️ 내 섬으로' },
    home: { x: 96, z: 76, target: 'hub', label: '🏘️ 허브로' },   // V13-A: 포탈섬 위
    visit: { x: 96, z: 76, target: 'hub', label: '🏘️ 허브로' },
  };
  // 멀티: 다른 플레이어 아바타 + 섬 방문 상태
  let others = {};                          // peerId -> {mesh, tx,ty,tz,tyaw, walkT, walkAmp, legL, legR}
  let visitData = null;                     // {name, homeEdits, minions} — 방문 중인 섬 데이터
  const HOME_MINION_SLOTS = [];
  for (let r = 0; r < 6; r++) for (let cIdx = 0; cIdx < 5; cIdx++) HOME_MINION_SLOTS.push([100 + cIdx * 3, 90 + r * 4]);   // V10: 30칸(6×5)
  /* ---------------- 테마 월드 정의(실제 스카이블럭 섬 구성) ----------------
     허브를 중심으로 워프 패드로 이동하는 독립 월드들. 각 월드는 시간대가 고정. */
  const WORLD_DEFS = {
    hub:    { name: '🏘️ 스카이블럭 허브(하늘 대륙)', size: [448, 72, 448] },
    home:   { name: '🏝️ 나의 섬', size: [192, 48, 192] },
    visit:  { name: '🏝️ 친구의 섬', size: [192, 48, 192] },
    park:   { name: '🌲 더 파크(7종 삼림)', size: [144, 48, 144], spawn: [72, 128], gen: () => genPark() },
    barn:   { name: '🌾 더 반(대농장)', size: [144, 48, 144], spawn: [72, 128], gen: () => genBarn() },
    gold:   { name: '⛏️ 골드 광산', size: [112, 48, 112], spawn: [56, 100], gen: () => genGoldMine() },
    deep:   { name: '💎 딥 캐번(층별 광물)', size: [96, 48, 96], spawn: [48, 84], gen: () => genDeepCaverns() },
    spider: { name: '🕷️ 스파이더 덴', size: [128, 48, 128], spawn: [64, 100], gen: () => genSpiderDen() },
    nether: { name: '🔥 블레이징 포트리스', size: [128, 48, 128], spawn: [64, 96], gen: () => genNether() },
    end:    { name: '🌌 디 엔드', size: [128, 48, 128], spawn: [64, 100], gen: () => genEnd() },
    mushroom: { name: '🍄 버섯 사막', size: [144, 48, 144], spawn: [72, 120], gen: () => genMushroom() },
    dungeon: { name: '🗝️ 카타콤', size: [144, 32, 48], spawn: [8, 24], gen: () => genDungeon() },
  };
  // 워프 패드: 밟거나 클릭하면 슈퍼 점프 후 자동 워프(실제 스카이블럭 런치패드)
  const WARPS = {
    hub: [
      { x: 224, z: 34, dest: 'end', label: '🌌 디 엔드' },
      { x: 84, z: 84, dest: 'park', label: '🌲 더 파크' },
      { x: 34, z: 224, dest: 'gold', label: '⛏️ 골드 광산' },
      { x: 84, z: 364, dest: 'deep', label: '💎 딥 캐번' },
      { x: 224, z: 414, dest: 'spider', label: '🕷️ 스파이더 덴' },
      { x: 364, z: 364, dest: 'nether', label: '🔥 블레이징 포트리스' },
      { x: 414, z: 224, dest: 'barn', label: '🌾 더 반' },
      { x: 364, z: 84, dest: 'mushroom', label: '🍄 버섯 사막' },
    ],
    park: [{ x: 72, z: 134, dest: 'hub', label: '🏘️ 허브' }],
    barn: [{ x: 72, z: 134, dest: 'hub', label: '🏘️ 허브' }],
    gold: [{ x: 56, z: 106, dest: 'hub', label: '🏘️ 허브' }, { x: 20, z: 20, dest: 'deep', label: '💎 딥 캐번' }],
    deep: [{ x: 48, z: 90, dest: 'hub', label: '🏘️ 허브' }],
    spider: [{ x: 64, z: 106, dest: 'hub', label: '🏘️ 허브' }],
    nether: [{ x: 64, z: 102, dest: 'hub', label: '🏘️ 허브' }],
    end: [{ x: 64, z: 106, dest: 'hub', label: '🏘️ 허브' }],
    mushroom: [{ x: 72, z: 126, dest: 'hub', label: '🏘️ 허브' }],
    dungeon: [{ x: 4, z: 24, dest: 'hub', label: '🚪 포기하고 나가기' }],
  };
  let worldCache = {};          // 월드 키 → 지형 버퍼(왕복 시 재생성 방지)
  let warpCharge = null;        // {dest, t} — 패드 위 0.6초 차지 후 발사

  let atlasTex = null, atlasUV = {};
  let blockMat = null, waterMat = null, plantMat = null, lavaMat = null;
  let islandMeshes = { opaque: null, water: null, plant: null, lava: null };
  let npcGroup = null, nodeGroup = null, minionGroup = null, fairyGroup = null, cloudGroup = null, propGroup = null, outlineMesh = null;
  let interactables = [], dynamicInteractables = [], fairyMeshes = {}, _minionSig = '';
  let ambientMobs = [];
  let gathering = false, gatherZoneKey = null;
  let spawnX = 96.5, spawnY = 20, spawnZ = 104.5;
  let worldTime = DAY_LEN * 0.25;   // 정오 근처에서 시작
  let curBannerKey = '', bannerT = 0;
  let minimapBase = null;

  const P = { x: 96.5, y: 20, z: 104.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, w: 0.6, h: 1.8, eye: 1.62 };
  const keys = {};
  const lookS = { locked: false };
  const moveT = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  const lookT = { id: -1, lx: 0, ly: 0 };
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function econApi() { return window.econApi || { getP: () => null, hasActiveEncounter: () => false, collectFairySoul: () => false, fairySoulCollected: () => false }; }

  /* ---------------- 유틸 ---------------- */
  function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function inBounds(x, y, z) { return x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < Dp; }
  function widx(x, y, z) { return (y * Dp + z) * W + x; }
  function setW(x, y, z, id) { if (inBounds(x, y, z)) world[widx(x, y, z)] = id; }
  function getBlockLocal(x, y, z) { if (!inBounds(x, y, z)) return 0; return world[widx(x, y, z)]; }
  function opaqueAt(x, y, z) { const b = BLOCKS[getBlockLocal(x, y, z)]; return !!(b && b.opaque); }
  function solidAt(x, y, z) { const b = BLOCKS[getBlockLocal(x, y, z)]; return !!(b && b.solid); }
  function surfaceTop(x, z) { for (let y = H - 1; y >= 0; y--) if (solidAt(x, y, z)) return y + 1; return SEA + 1; }
  // 기준 높이 아래의 가장 가까운 지면(동굴/크립트/드래곤 둥지 내부 몹용)
  function groundBelow(x, z, refY) {
    for (let y = Math.min(H - 1, Math.floor(refY)); y >= 1; y--) if (solidAt(x, y, z)) return y + 1;
    return surfaceTop(x, z);
  }

  /* ---------------- 지형 생성(하늘섬 하이트필드) ---------------- */
  function islandField(isl, x, z) {   // (구 호환) 존 중심 거리 필드
    let d = Math.hypot(x - isl.cx, z - isl.cz) / isl.r;
    d += (hash3(x, 7, z) - 0.5) * 0.14;
    return 1 - d;
  }
  function hubField(x, z) {   // 허브 대륙 내부도(0..1)
    let d = Math.hypot(x - HUB_C, z - HUB_C) / HUB_R;
    d += (hash3(x, 7, z) - 0.5) * 0.10;
    return 1 - d;
  }
  function bump(x, z, cx, cz, r, h) {   // 부드러운 언덕
    const f = 1 - Math.hypot(x - cx, z - cz) / r;
    if (f <= 0) return 0;
    const t = f * f * (3 - 2 * f);
    return t * h;
  }
  // V20-M: 부드러운 값노이즈(구릉·지면 질감용) — 격자 hash3를 smoothstep 보간
  function smoothNoise(x, z, s) {
    const xi = Math.floor(x / s), zi = Math.floor(z / s);
    const xf = x / s - xi, zf = z / s - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const n = (a, b) => hash3(a, 900, b);
    const a = n(xi, zi), b = n(xi + 1, zi), c = n(xi, zi + 1), d = n(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function columnSurface(x, z) {
    const f = hubField(x, z);
    if (f <= 0) return { y: 0, f: 0 };
    let top = 20 + Math.round(Math.min(1, f * 3) * 2);
    top += Math.round(bump(x, z, 224, 86, 68, 34));     // 북쪽 설산
    top += Math.round(bump(x, z, 96, 208, 46, 12));     // 서쪽 광산 언덕
    top += Math.round(bump(x, z, 140, 130, 44, 4));     // 숲 구릉
    top -= Math.round(bump(x, z, 152, 318, 40, 2));     // 묘지 저지대
    top -= Math.round(bump(x, z, 322, 322, 22, 3));     // 연못 분지
    // V20-M: 완만한 구릉 — 마을 광장(중심 44칸)은 평탄 유지, 외곽 야생으로 갈수록 굴곡
    const dc = Math.hypot(x - HUB_C, z - HUB_C);
    const amp = 3 * Math.max(0, Math.min(1, (dc - 44) / 130));
    top += Math.round((smoothNoise(x, z, 22) - 0.5) * 2 * amp) + Math.round((smoothNoise(x, z, 8) - 0.5) * amp * 0.6);
    return { y: Math.min(H - 6, top), f };
  }
  function zoneAt(x, z) {
    if (hubField(x, z) <= 0) return '';
    let best = null, bestD = 1e9;
    for (const zn of HUB_ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r && d < bestD) { bestD = d; best = zn; } }
    return best ? best.key : 'wild';
  }
  function hubZoneName(key) { const zn = HUB_ZONES.find(z => z.key === key); return zn ? zn.name : '🌿 야생 지대'; }
  function genWorld() {
    world = new Uint8Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const { y: top, f } = columnSurface(x, z);
      if (!f || f <= 0) continue;
      // 하늘섬: 위는 평탄, 아래는 가장자리로 갈수록 얇아지는 부유 대륙
      const depth = 6 + Math.round(Math.min(1, f * 2.2) * 22);
      const zn = zoneAt(x, z);
      for (let y = top; y >= Math.max(2, top - depth); y--) {
        let id = ID.stone;
        if (y === top) {
          if (top >= 34) id = ID.snow_block;                                        // 설산 만년설
          else if (top >= 30) id = hash3(x, 36, z) < 0.5 ? ID.stone : ID.snow_block;  // 설산 기슭(눈+바위 얼룩)
          else if (zn === 'graveyard') id = hash3(x >> 1, 31, z >> 1) < 0.4 ? ID.coarse_dirt : (hash3(x, 32, z) < 0.15 ? ID.gravel : ID.grass);
          else if (zn === 'coalmine') id = hash3(x >> 1, 33, z >> 1) < 0.35 ? ID.gravel : ID.grass;
          else {
            // V20-M: 지면 질감 변주 — 균일 초록 탈피(거친흙·자갈·이끼 패치, 노이즈로 자연 군집)
            const gn = smoothNoise(x, z, 11);
            if (gn > 0.85) id = ID.coarse_dirt;
            else if (gn < 0.14) id = ID.gravel;
            else if (hash3(x, 34, z) < 0.018) id = ID.mossy_cobblestone;
            else id = ID.grass;
          }
        } else if (y >= top - 3) id = top >= 34 ? ID.stone : ID.dirt;
        setW(x, y, z, id);
      }
    }
    buildVillage();
    buildVillageDetail();
    buildSnowMountain();
    buildCoalMineZone();
    buildGraveyardZone();
    buildFarmZone();
    buildForestZone();
    buildPondZone();
    buildColosseum();
    buildWizardTower();
    buildRuinsZone();
    buildZigguratV6();
    buildShrineV6();
    // 광장 → 각 구역 대로(자갈길)
    [[224, 92], [110, 208], [156, 314], [326, 224], [146, 136], [318, 318], [224, 348], [318, 124], [294, 372]].forEach(t => pathTo(224, 224, t[0], t[1]));
    decorateWilds();
    buildPortalFrame(PORTALS.hub.x, PORTALS.hub.z);
    buildWarpPads();
    beautifyHub();   // V20-L: 광장 미화(분수·정원·벤치·현수막) — 마지막에 얹어 덮이지 않게
  }
  // V20-M: 섬 전역을 풍성한 힐링 들판으로 — 색밭·풀·덤불·이끼바위(길가 포함). 나무·덤불은 야생만, 광장 코어는 정갈.
  function decorateWilds() {
    for (let x = 12; x < W - 12; x += 2) for (let z = 12; z < Dp - 12; z += 2) {
      const y = surfaceTop(x, z);
      if (y < 6 || getBlockLocal(x, y - 1, z) !== ID.grass || getBlockLocal(x, y, z) !== 0) continue;
      if (Math.hypot(x - HUB_C, z - HUB_C) < 30) continue;              // 광장 코어는 정갈하게
      const wild = zoneAt(x, z) === 'wild';
      const r = hash3(x, 111, z);
      const field = smoothNoise(x, z, 26);                              // 저주파 → 꽃 색이 지역별로 뭉쳐 예쁜 색밭
      if (wild && r < 0.012) plantOak(x, z);
      else if (wild && r < 0.017) plantBirch(x, z);
      else if (wild && r < 0.024 && field > 0.6) setW(x, y, z, ID.oak_leaves);                            // 덤불(야생)
      else if (r < 0.30) setW(x, y, z, ID.tall_grass);                                                    // 풍성한 잔디(전역)
      else if (r < 0.42) setW(x, y, z, field < 0.34 ? ID.flower_yellow : field < 0.68 ? ID.flower_red : ID.tall_grass);   // 색 군집 꽃밭(전역)
      else if (r < 0.423) { setW(x, y, z, ID.mossy_cobblestone); if (r < 0.421) setW(x, y + 1, z, ID.mossy_cobblestone); }  // 이끼 바위
    }
  }

  /* ---- 허브 구역 빌더(V6) ---- */
  function buildVillage() {
    // 중앙 광장(석재 벽돌 + 분수 + 가로등 링)
    flattenSite(206, 206, 242, 242, 19);
    for (let x = 208; x <= 240; x++) for (let z = 208; z <= 240; z++) setW(x, 19, z, ((x + z) % 7 === 0) ? ID.quartz_block : ID.stone_bricks);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { setW(224 + dx, 20, 224 + dz, ID.stone_bricks); if (Math.abs(dx) < 3 && Math.abs(dz) < 3) setW(224 + dx, 20, 224 + dz, ID.water); }
    setW(224, 20, 224, ID.stone_bricks); setW(224, 21, 224, ID.stone_bricks); setW(224, 22, 224, ID.quartz_block); setW(224, 23, 224, ID.glowstone);
    for (let a = 0; a < 8; a++) { const x = 224 + Math.round(Math.cos(a / 8 * Math.PI * 2) * 14), z = 224 + Math.round(Math.sin(a / 8 * Math.PI * 2) * 14); lampPost(x, z); }
    // 역할별 고유 건물(문 앞에 NPC)
    buildHouse(200, 234, 10, 8, 20, ID.bricks, ID.spruce_planks);          // 상점(벽돌)
    // 은행 → V20-O 대형 돔 보물전(사암+석영 돔, 중앙 금고). 정문 +z(광장 방향), NPC 위치 유지
    buildDomedHall(240, 200, 5, 20, {
      wall: ID.sandstone, accent: ID.quartz_block, dome: ID.quartz_block, floor: ID.polished_andesite, gdir: 1,
      feature: (cx, cz, base) => {   // 중앙 금고: 금광석 + 울타리 창살 + 발광
        setW(cx, base, cz, ID.gold_ore); setW(cx, base + 1, cz, ID.gold_ore);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { setW(cx + dx, base, cz + dz, ID.oak_fence); setW(cx + dx, base + 1, cz + dz, ID.oak_fence); }
        setW(cx, base + 2, cz, ID.glowstone);
      },
    });
    buildHouse(190, 206, 9, 7, 20, ID.oak_planks, ID.spruce_planks);       // 미니언 관리소
    buildHouse(244, 234, 9, 7, 20, ID.birch_planks, ID.oak_planks);        // 펫 상점(자작)
    buildRotunda(208, 218, 4, 20, { col: ID.quartz_block, band: ID.purpur, gdir: 1 });   // 경매장 — V20-Q 개방형 원형 로툰다(경매 NPC)
    buildForge(232, 216, 8, 7, 20);                                        // 대장간(재련) — V20-P 하프팀버 박공+굴뚝+용광로 베이
    buildHouse(208, 244, 8, 6, 20, ID.oak_planks, ID.oak_planks);          // 제작소
    buildHouse(230, 244, 8, 6, 20, ID.quartz_block, ID.purpur);            // 스타포스 강화소(메이플 감성)
    // 인챈트 탑(2층 + 보라 지붕)
    buildHouse(218, 186, 11, 9, 20, ID.stone_bricks, ID.stone_bricks);
    for (let y = 25; y < 31; y++) for (let x = 221; x < 227; x++) for (let z = 188; z < 193; z++) {
      const edge = x === 221 || x === 226 || z === 188 || z === 192;
      setW(x, y, z, edge ? ID.purpur : 0);
    }
    for (let x = 221; x < 227; x++) for (let z = 188; z < 193; z++) setW(x, 31, z, ID.purpur);
    setW(223, 32, 190, ID.glowstone); setW(225, 32, 190, ID.glowstone);
  }
  function buildVillageDetail() {
    // 바자 골목(광장 서쪽): 노점 4개(차양 + 판매대)
    for (let i = 0; i < 4; i++) {
      const x = 186 + i * 5, z = 228;
      const y = surfaceTop(x, z);
      setW(x, y - 1, z, ID.oak_planks); setW(x + 1, y - 1, z, ID.oak_planks);
      setW(x, y, z - 1, ID.oak_log); setW(x + 1, y + 1, z - 1, 0);
      setW(x - 1, y + 2, z, ID.oak_log); setW(x + 2, y + 2, z, ID.oak_log);
      for (let dx = -1; dx <= 2; dx++) setW(x + dx, y + 3, z, i % 2 ? ID.wool_red : ID.wool_white);   // 차양
    }
    // 도서관(광장 북서): 책장 느낌 벽
    buildHouse(196, 194, 9, 7, 20, ID.dark_oak_log, ID.spruce_planks);
    // 커뮤니티 센터(광장 남동)
    buildHouse(246, 208, 9, 7, 20, ID.quartz_block, ID.oak_planks);
    // 광장 생울타리 링 + 벤치 + 꽃밭
    for (let a = 0; a < 40; a++) {
      const x = 224 + Math.round(Math.cos(a / 40 * Math.PI * 2) * 42), z = 224 + Math.round(Math.sin(a / 40 * Math.PI * 2) * 42);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.grass && a % 3 !== 0) setW(x, y, z, ID.oak_leaves);   // 생울타리(출입구 틈)
    }
    for (let i = 0; i < 10; i++) {
      const x = 200 + Math.floor(hash3(i, 77, 1) * 48), z = 200 + Math.floor(hash3(i, 78, 2) * 48);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, hash3(i, 79, 3) < 0.5 ? ID.flower_red : ID.flower_yellow);
    }
    // 대로변 가로등(광장→구역 길목)
    [[224, 130], [224, 170], [170, 224], [140, 224], [280, 224], [310, 224], [224, 280], [224, 320], [260, 300], [180, 280]].forEach(p2 => lampPost(p2[0], p2[1]));
  }
  // V20-L: 광장 미화 — 웅장한 중앙 분수 + 코너 정원(벤치·화단·화분) + 현수막. 블럭 단위 세밀 배치.
  function beautifyHub() {
    const cx = 224, cz = 224, fy = 19;   // 광장 바닥 y19 → 걷는 높이 y20
    const CH = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks;
    const AND = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const SMOOTH = ID.smooth_stone != null ? ID.smooth_stone : ID.stone_bricks;
    // 1) 광장 전체 재포장(반경16) — 다중 석재 동심원 패턴 + 십자 대로(석영). 위쪽 완전 클리어로 통행 보장
    const R = 16;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz); if (d > R + 0.5) continue;
      const x = cx + dx, z = cz + dz;
      for (let yy = fy + 1; yy <= fy + 6; yy++) setW(x, yy, z, 0);   // 걸림돌 제거(통행 확보)
      let mat;
      if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) mat = ID.quartz_block;      // 십자 대로(석영)
      else if (d > R - 1.3) mat = SMOOTH;                                     // 외곽 테두리
      else if (Math.round(d) % 4 === 0) mat = CH;                            // 동심원 경계(치즐)
      else mat = ((dx + dz) & 1) ? ID.stone_bricks : AND;                    // 격자 무늬
      setW(x, fy, z, mat);
    }
    // 2) 걸어서 도는 2단 분수(반경2.6, 올려진 물받이 — 발밑엔 물 없음)
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = Math.hypot(dx, dz); if (d > 2.7) continue;
      setW(cx + dx, fy, cz + dz, CH);                          // 받침(포장 위 강조)
      if (d > 1.5) setW(cx + dx, fy + 1, cz + dz, ID.stone_bricks);          // 물받이 벽(1높이, 발밑=이 벽에 막혀 못 들어감 → 돌아서 통행)
      else if (d > 0.6) setW(cx + dx, fy + 1, cz + dz, ID.water);            // 아래 물받이(벽 안, 발밑 아님)
    }
    // 중앙 첨탑 + 상단 물받이 + 흘러내리는 물(다중 재질)
    setW(cx, fy + 1, cz, CH); setW(cx, fy + 2, cz, ID.quartz_block); setW(cx, fy + 3, cz, ID.quartz_block);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { setW(cx + ax, fy + 3, cz + az, ID.prismarine); setW(cx + ax, fy + 4, cz + az, ID.water); }   // 상단 물받이 테두리+물
    setW(cx, fy + 4, cz, ID.water); setW(cx, fy + 5, cz, ID.sea_lantern != null ? ID.sea_lantern : ID.glowstone);   // 정상 발광
    // 3) 대로를 비껴 대각선에 가로등 + 올려진 화분(통행 방해 없음)
    for (const [x, z] of [[214, 214], [234, 214], [214, 234], [234, 234]]) lampPost(x, z);
    for (const [x, z] of [[219, 219], [229, 219], [219, 229], [229, 229]]) {
      setW(x, fy + 1, z, ID.oak_log); setW(x, fy + 2, z, hash3(x, 7, z) < 0.5 ? ID.flower_red : ID.flower_yellow);   // 대각선 화분(대로 밖)
    }
    // 4) 광장 외곽(반경15~16) 대각선에 현수막 기둥(통로 밖)
    for (const [x, z, wool] of [[213, 213, ID.wool_red], [235, 213, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white], [213, 235, ID.wool_blue != null ? ID.wool_blue : ID.wool_white], [235, 235, ID.wool_white]]) {
      for (let i = 1; i <= 4; i++) setW(x, fy + i, z, ID.oak_fence);
      setW(x, fy + 5, z, ID.glowstone);
      for (let i = 2; i <= 4; i++) setW(x + 1, fy + i, z, wool != null ? wool : ID.wool_red);
    }
  }
  function buildSnowMountain() {
    // 설산: 가문비 숲 + 얼음 연못 + 정상 전망대
    for (let i = 0; i < 40; i++) {
      const x = 170 + Math.floor(hash3(i, 61, 1) * 108), z = 46 + Math.floor(hash3(i, 62, 2) * 96);
      if (zoneAt(x, z) !== 'snowpeak') continue;
      const y = surfaceTop(x, z);
      if (y < 26 || y > 44) continue;
      plantSpruce(x, z);
    }
    for (let dx = -5; dx <= 5; dx++) for (let dz = -4; dz <= 4; dz++) {   // 얼음 연못
      if (Math.hypot(dx / 1.3, dz) < 4) { const y = surfaceTop(196 + dx, 108 + dz) - 1; setW(196 + dx, y, 108 + dz, ID.ice); }
    }
    const py = surfaceTop(224, 78);   // 정상 전망대
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(224 + dx, py, 78 + dz, ID.spruce_planks);
    [[222, 76], [226, 76], [222, 80], [226, 80]].forEach(p2 => { setW(p2[0], py + 1, p2[1], ID.spruce_log); setW(p2[0], py + 2, p2[1], ID.glowstone); });
  }
  function buildCoalMineZone() {
    // 언덕에 갱도 입구 → 내부 챔버(석탄/철 광맥) — 실제 Coal Mine 감성
    for (let x = 100; x <= 118; x++) for (let z = 205; z <= 211; z++) for (let y = 21; y <= 25; y++) setW(x, y, z, 0);   // 입구 터널
    for (let x = 74; x <= 102; x++) for (let z = 194; z <= 222; z++) for (let y = 18; y <= 27; y++) {
      const d = Math.hypot((x - 88) / 13, (z - 208) / 13, (y - 22) / 6);
      if (d < 1) setW(x, y, z, 0);
    }
    scatterOre(88, 208, 16, 17, 28, ID.coal_ore, 42, 65);
    scatterOre(88, 208, 16, 17, 26, ID.iron_ore, 20, 66);
    for (let z = 204; z <= 212; z += 2) { setW(103, 25, z, ID.oak_log); }   // 갱목
    [[80, 24, 200], [94, 25, 214], [84, 20, 216], [92, 19, 200]].forEach(p2 => setW(p2[0], p2[1], p2[2], ID.glowstone));
    buildHouse(108, 214, 7, 6, surfaceTop(111, 217), ID.spruce_planks, ID.stone);   // 감독관 오두막
  }
  function buildGraveyardZone() {
    // V18: 을씨년스러운 공동묘지 — 계단 묘비 + 이끼/자갈 바닥 + 울타리 난간 + 고사목 + 지하 크립트 아치 입구
    const gFence = ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.spruce_fence;
    for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 5; gz++) {
      const x = 132 + gx * 7, z = 300 + gz * 8;
      if (zoneAt(x, z) !== 'graveyard') continue;
      const y = surfaceTop(x, z);
      // 묘비: 조약돌 대 + 이끼조약돌 비석 + 계단 지붕돌(반쯤 기울어진 느낌)
      setW(x, y, z, ID.mossy_cobblestone); setW(x, y + 1, z, ID.cobblestone);
      const cap = stairIdFor(ID.cobblestone, (gx + gz) % 4); setW(x, y + 2, z, cap != null ? cap : ID.stone);
      // 무덤 봉분 앞 자갈 + 잡초 + 낮은 울타리 난간
      if (getBlockLocal(x + 1, y - 1, z) === ID.grass) setW(x + 1, y - 1, z, ID.gravel);
      if (hash3(gx, 63, gz) < 0.4) setW(x + 1, y, z, ID.tall_grass);
      if (gz === 0 && gFence != null) setW(x, y, z - 2, gFence);   // 앞줄 난간
    }
    // 고사목(잎 없는 통나무) 산발
    for (let i = 0; i < 5; i++) {
      const x = 138 + Math.floor(hash3(i, 66, 3) * 30), z = 302 + Math.floor(hash3(i, 67, 4) * 28);
      if (zoneAt(x, z) !== 'graveyard') continue;
      const y = surfaceTop(x, z); const h = 3 + Math.floor(hash3(i, 68, 5) * 2);
      for (let j = 0; j < h; j++) setW(x, y + j, z, ID.dark_oak_log != null ? ID.dark_oak_log : ID.spruce_log);
      setW(x + 1, y + h - 1, z, gFence != null ? gFence : ID.spruce_log);   // 앙상한 가지
    }
    // 크립트: 지하 방(계단 입구)
    const cy = surfaceTop(152, 334) - 1;
    for (let i = 0; i < 6; i++) { for (let o = -1; o <= 1; o++) setW(152 + o, cy - i, 334 + i, 0); }   // 내려가는 계단
    for (let x = 144; x <= 160; x++) for (let z = 338; z <= 352; z++) for (let y = cy - 6; y <= cy - 2; y++) setW(x, y, z, (x === 144 || x === 160 || z === 338 || z === 352 || y === cy - 6 || y === cy - 2) ? ID.stone_bricks : 0);
    [[148, cy - 3, 342], [156, cy - 3, 348]].forEach(p2 => setW(p2[0], p2[1], p2[2], ID.glowstone));
    // 슬레이어 제단 5기
    const altars = [[168, 306], [174, 316], [172, 328], [162, 334], [156, 306]];
    altars.forEach(a => {
      const y = surfaceTop(a[0], a[1]) - 1;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(a[0] + dx, y, a[1] + dz, ID.stone_bricks);
      setW(a[0], y + 1, a[1], ID.obsidian); setW(a[0], y + 2, a[1], ID.obsidian); setW(a[0], y + 3, a[1], ID.glowstone);
    });
  }
  function buildFarmZone() {
    // 대형 작물 플롯 6종 + 풍차 + 헛간 + 관개수로
    const crops = [ID.wheat_ripe, ID.carrot_ripe, ID.potato_ripe, ID.sugar_cane, ID.pumpkin, ID.melon];
    for (let ci = 0; ci < 6; ci++) {
      const px = 306 + (ci % 3) * 18, pz = 200 + Math.floor(ci / 3) * 26;
      for (let x = px; x < px + 14; x++) for (let z = pz; z < pz + 20; z++) {
        if (zoneAt(x, z) !== 'farm') continue;
        const y = surfaceTop(x, z) - 1;
        if ((x + z) % 9 === 0) { setW(x, y, z, ID.water); continue; }   // 관개수로
        setW(x, y, z, ID.farmland);
        if (crops[ci] === ID.pumpkin || crops[ci] === ID.melon) { if ((x + z * 3) % 4 === 0) setW(x, y + 1, z, crops[ci]); }
        else setW(x, y + 1, z, crops[ci]);
      }
      [[px - 1, pz - 1], [px + 14, pz - 1], [px - 1, pz + 20], [px + 14, pz + 20]].forEach(c => { const y = surfaceTop(c[0], c[1]); setW(c[0], y, c[1], ID.oak_log); });
    }
    // V18: 네덜란드식 풍차 — 석재 기단 + 통나무 기둥 몸통 + 유리창 + 반블럭 처마 + 원뿔 지붕 + X자 날개(천 돛)
    const wx = 344, wz = 206, wy = surfaceTop(wx, wz);
    const stoneSlab = slabIdFor(ID.stone_bricks);
    // 석재 기단
    for (let dx = -1; dx <= 4; dx++) for (let dz = -1; dz <= 4; dz++) setW(wx + dx, wy - 1, wz + dz, ID.stone_bricks);
    for (let y = wy; y < wy + 13; y++) for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) {
      const edge = dx === 0 || dx === 3 || dz === 0 || dz === 3;
      const corner = (dx === 0 || dx === 3) && (dz === 0 || dz === 3);
      setW(wx + dx, y, wz + dz, corner ? ID.spruce_log : (edge ? ID.spruce_planks : 0));
    }
    // 유리창(2층)
    setW(wx + 1, wy + 3, wz, ID.glass); setW(wx + 2, wy + 7, wz, ID.glass); setW(wx, wy + 5, wz + 2, ID.glass);
    // 반블럭 처마 + 원뿔 계단 지붕(자수정 대신 spruce 계단으로 물매)
    if (stoneSlab != null) for (let dx = -1; dx <= 4; dx++) { setW(wx + dx, wy + 13, wz - 1, stoneSlab); setW(wx + dx, wy + 13, wz + 4, stoneSlab); }
    let rr = 2, ry = wy + 14;
    while (rr >= 0) {
      for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) {
        if (rr >= 2 || (dx >= 1 && dx <= 2 && dz >= 1 && dz <= 2)) setW(wx + dx, ry, wz + dz, ID.spruce_planks);
      }
      rr--; ry++;
    }
    setW(wx + 1, ry, wz + 1, ID.glowstone);
    // X자 날개(천 돛 — 흰 양털 팔 4개 + 나무 축)
    for (let i = 1; i <= 6; i++) [[i, i], [-i, i], [i, -i], [-i, -i]].forEach(o => setW(wx + 1 + o[0], wy + 9 + o[1], wz - 1, (i % 3 === 0) ? ID.spruce_planks : ID.wool_white));
    setW(wx + 1, wy + 9, wz - 1, ID.spruce_log); setW(wx + 2, wy + 9, wz - 1, ID.spruce_log);
    buildHouse(330, 236, 10, 8, surfaceTop(335, 240), ID.wool_red, ID.spruce_planks);   // 헛간
  }
  function buildForestZone() {
    for (let gx = 0; gx < 12; gx++) for (let gz = 0; gz < 12; gz++) {
      const x = 102 + gx * 7 + Math.floor(hash3(gx, 67, gz) * 4), z = 92 + gz * 7 + Math.floor(hash3(gx, 68, gz) * 4);
      if (zoneAt(x, z) !== 'forest') continue;
      if (Math.hypot(x - 140, z - 132) < 8) continue;   // 오두막 자리
      const r = hash3(x, 69, z);
      if (r < 0.34) plantOak(x, z);
      else if (r < 0.55) plantBirch(x, z);
      else if (r < 0.68) plantDarkOak(x, z);
      else if (r < 0.84) { const y = surfaceTop(x, z); setW(x, y, z, r < 0.76 ? ID.tall_grass : (r < 0.8 ? ID.flower_red : ID.flower_yellow)); }
    }
    buildHouse(134, 126, 7, 6, surfaceTop(137, 129), ID.spruce_planks, ID.spruce_planks);
  }
  function buildPondZone() {
    // 낚시 연못 + 오두막 + 부두 데크
    for (let dx = -12; dx <= 12; dx++) for (let dz = -9; dz <= 9; dz++) {
      if (Math.hypot(dx / 1.35, dz) < 8.4) {
        const x = 322 + dx, z = 322 + dz, y = surfaceTop(x, z) - 1;
        setW(x, y, z, ID.water); setW(x, y - 1, z, ID.water); setW(x, y - 2, z, ID.sand);
      }
    }
    buildHouse(310, 314, 6, 6, surfaceTop(313, 317), ID.oak_planks, ID.spruce_planks);
    for (let i = 0; i < 6; i++) { const y = surfaceTop(318 + i, 324); setW(318 + i, y - 1, 324, ID.oak_planks); }   // 데크
    lampPost(312, 322);
  }
  function buildColosseum() {
    // V18: 로마식 원형 투기장 — 계단식 관중석 + 아치 입구 4방 + 크레넬 성벽 + 깃발/랜턴
    const cx = 224, cz = 352, cy = surfaceTop(cx, cz) - 1;
    const RIN = 11, ROUT = 21;               // 경기장 반경 / 외벽 반경
    const sandSlab = slabIdFor(ID.sandstone), smoothSlab = slabIdFor(ID.smooth_stone);
    const banners = [ID.wool_red, ID.wool_yellow, ID.wool_blue, ID.wool_lime, ID.wool_orange, ID.wool_magenta];
    flattenSite(cx - ROUT - 1, cz - ROUT - 1, cx + ROUT + 1, cz + ROUT + 1, cy);
    for (let dx = -ROUT - 1; dx <= ROUT + 1; dx++) for (let dz = -ROUT - 1; dz <= ROUT + 1; dz++) {
      const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz);
      const ang = Math.atan2(dz, dx);
      // 4방 아치 입구 통로(±x, ±z 축 근처 좁은 통로)
      const nearAxis = Math.min(Math.abs(dx), Math.abs(dz)) <= 1;
      if (d < RIN) {                          // 경기장 바닥(1칸 파냄 + 모래)
        for (let y = cy + 1; y < cy + 12; y++) setW(x, y, z, 0);
        setW(x, cy, z, (Math.abs(dx) + Math.abs(dz)) % 5 === 0 ? ID.smooth_stone : ID.sand);
      } else if (d <= ROUT) {                 // 계단식 관중석: 바깥으로 갈수록 한 단씩 상승
        const tier = Math.floor((d - RIN) / 1.6);         // 0..~6 단
        const topY = cy + 1 + tier;
        if (nearAxis && d < ROUT - 1) {       // 입구 통로는 뚫어 아치 터널
          setW(x, cy, z, ID.smooth_stone);
          continue;
        }
        for (let y = cy + 1; y <= topY; y++) setW(x, y, z, ID.sandstone);
        // 단 앞턱에 매끈한돌 반블럭 → 좌석 라인
        if (smoothSlab != null) setW(x, topY + 1, z, smoothSlab);
      }
    }
    // 외벽(크레넬 + 아케이드 창 + 깃발 + 랜턴)
    for (let a = 0; a < 96; a++) {
      const th = a / 96 * Math.PI * 2;
      const x = cx + Math.round(Math.cos(th) * (ROUT + 1)), z = cz + Math.round(Math.sin(th) * (ROUT + 1));
      const wallTop = cy + 8;
      for (let y = cy + 1; y <= wallTop; y++) setW(x, y, z, ID.sandstone);
      setW(x, wallTop + 1, z, a % 2 === 0 ? ID.sandstone : (sandSlab != null ? sandSlab : ID.sandstone));   // 크레넬
      if (a % 8 === 0) { setW(x, cy + 4, z, ID.glowstone); }                                                 // 벽감 랜턴
      if (a % 12 === 0) { const bn = banners[(a / 12) % banners.length]; setW(x, cy + 6, z, bn); setW(x, cy + 5, z, bn); }   // 걸개 깃발
    }
    // 4방 아치 입구(스택 계단으로 아치머리)
    const arch = (ex, ez, f1, f2) => {
      const bx = cx + ex, bz = cz + ez;
      for (let o = -1; o <= 1; o++) for (let y = cy + 1; y <= cy + 3; y++) { setW(bx + (ez ? o : 0), y, bz + (ex ? o : 0), 0); }
      const sL = stairIdFor(ID.sandstone, f1), sR = stairIdFor(ID.sandstone, f2);
      if (sL != null) setW(bx + (ez ? -1 : 0), cy + 4, bz + (ex ? -1 : 0), sL);
      if (sR != null) setW(bx + (ez ? 1 : 0), cy + 4, bz + (ex ? 1 : 0), sR);
      setW(bx, cy + 4, bz, ID.sandstone); setW(bx, cy + 5, bz, ID.glowstone);
    };
    arch(0, -(ROUT + 1), 2, 0); arch(0, ROUT + 1, 2, 0); arch(-(ROUT + 1), 0, 1, 3); arch(ROUT + 1, 0, 1, 3);
    // 중앙 승리 단(작은 사각 대 + 횃불)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(cx + dx, cy + 1, cz + dz, ID.smooth_stone);
    setW(cx, cy + 2, cz, ID.glowstone);
  }
  function buildWizardTower() {
    // V18: 원통형 마법사 탑 — 석재벽돌 몸통 + 아치창 + 버트레스 기둥 + 원뿔 계단 지붕 + 발광 첨탑
    const cx = 322, cz = 120, base = surfaceTop(cx, cz);
    const R = 4, H = 22;
    flattenSite(cx - R - 2, cz - R - 2, cx + R + 2, cz + R + 2, base - 1);
    // 원통 벽(반경 R) — 아래 석재벽돌, 위 4칸 자수정(purpur)
    for (let y = base; y < base + H; y++) {
      const mat = y >= base + H - 5 ? ID.purpur : ID.stone_bricks;
      for (let a = 0; a < 40; a++) {
        const th = a / 40 * Math.PI * 2;
        const x = cx + Math.round(Math.cos(th) * R), z = cz + Math.round(Math.sin(th) * R);
        setW(x, y, z, mat);
      }
    }
    // 바닥/층 마루
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= R * R) { setW(cx + dx, base - 1, cz + dz, ID.polished_andesite); }
    // 4방 버트레스(모서리 지지 기둥 + 상단 자수정 캡)
    for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
      for (let y = base; y < base + H - 3; y++) setW(cx + ox, y, cz + oz, ID.chiseled_stone_bricks);
      setW(cx + ox, base + H - 3, cz + oz, ID.purpur); setW(cx + ox, base + H - 2, cz + oz, ID.glowstone);
    }
    // 아치창(3층, 4방) — 유리 + 위에 계단 아치머리
    for (const [ox, oz, f] of [[0, -R, 2], [0, R, 0], [-R, 0, 1], [R, 0, 3]]) {
      for (const wy of [base + 3, base + 8, base + 13]) {
        setW(cx + ox, wy, cz + oz, ID.glass); setW(cx + ox, wy + 1, cz + oz, ID.glass);
        const sid = stairIdFor(ID.stone_bricks, f); if (sid != null) setW(cx + ox, wy + 2, cz + oz, sid);
      }
    }
    // 정문(남쪽) — 진짜 나무 문 2칸 + 랜턴
    setW(cx, base, cz - R, ID.spruce_door_c_0); setW(cx, base + 1, cz - R, ID.spruce_door_c_0);
    setW(cx - 1, base + 2, cz - R, ID.glowstone); setW(cx + 1, base + 2, cz - R, ID.glowstone);
    // 원뿔 계단 지붕(자수정 계단 4단 수렴)
    let rr = R + 1, ry = base + H;
    while (rr >= 0) {
      for (let a = 0; a < 48; a++) {
        const th = a / 48 * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
        const x = cx + Math.round(dx * rr), z = cz + Math.round(dz * rr);
        const f = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2);   // 바깥 향해 물매
        const sid = stairIdFor(ID.purpur, f);
        setW(x, ry, z, rr > 0 && sid != null ? sid : ID.purpur);
      }
      rr--; ry++;
    }
    // 발광 첨탑(수정 막대)
    for (let i = 0; i < 4; i++) setW(cx, ry + i, cz, i < 3 ? ID.purpur : ID.glowstone);
    // 떠다니는 룬 고리(자수정+발광 — 마력 연출)
    for (const [ox, oz] of [[R + 2, 0], [-(R + 2), 0], [0, R + 2], [0, -(R + 2)]]) setW(cx + ox, base + 10, cz + oz, ID.glowstone);
  }
  // V20-O: 재사용 돔형 대회당(랜드마크) — 원형 벽 + 8기둥 + 아치창 + 반구 돔 + 대아치 정문 + 실내.
  // 판타지 실루엣(직육면체 탈피). 용도 있는 건물(은행/경매장 등)에 사용 — NPC는 정문 앞 고정 위치 유지.
  function buildDomedHall(cx, cz, r, base, o) {
    const wall = o.wall, dome = o.dome, accent = o.accent, floor = o.floor != null ? o.floor : ID.polished_andesite;
    const wallH = 5;
    flattenSite(cx - r - 3, cz - r - 3, cx + r + 3, cz + r + 3, base - 1);
    const ring = (rad, y, id) => { const n = Math.max(8, Math.round(rad * 8)); for (let a = 0; a < n; a++) { const th = a / n * Math.PI * 2; setW(cx + Math.round(Math.cos(th) * rad), y, cz + Math.round(Math.sin(th) * rad), id); } };
    // 2단 원형 기단
    for (let dx = -r - 2; dx <= r + 2; dx++) for (let dz = -r - 2; dz <= r + 2; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= r + 2.3) setW(cx + dx, base - 1, cz + dz, floor);
      if (d > r + 0.6 && d <= r + 2.3) setW(cx + dx, base - 2, cz + dz, ID.stone_bricks);
    }
    // 원형 벽(5단)
    for (let y = base; y < base + wallH; y++) ring(r, y, wall);
    // 8기둥(자수정/석영) + 기둥 캡
    const cols = [];
    for (let k = 0; k < 8; k++) { const th = k / 8 * Math.PI * 2; cols.push([cx + Math.round(Math.cos(th) * r), cz + Math.round(Math.sin(th) * r)]); }
    cols.forEach(([x, z]) => { for (let y = base; y < base + wallH; y++) setW(x, y, z, accent); setW(x, base + wallH, z, ID.chiseled_stone_bricks); });
    // 상인방(벽 위 자수정 띠) + 처마 슬랩
    ring(r, base + wallH, accent);
    // 아치창(4방 중간) — 유리 2단 + 계단 아치머리
    for (const [ox, oz, f] of [[0, -r, 2], [0, r, 0], [-r, 0, 1], [r, 0, 3]]) {
      setW(cx + ox, base + 1, cz + oz, ID.glass); setW(cx + ox, base + 2, cz + oz, ID.glass);
      const sid = stairIdFor(wall, f); if (sid != null) setW(cx + ox, base + 3, cz + oz, sid);
    }
    // 반구 돔(셸) + 정상 첨탑
    const domeBase = base + wallH;
    for (let h = 0; h <= r; h++) {
      const rr = Math.round(Math.sqrt(Math.max(0, r * r - h * h)));
      ring(Math.max(1, rr), domeBase + h, dome);
    }
    setW(cx, domeBase + r, cz, dome); setW(cx, domeBase + r + 1, cz, accent); setW(cx, domeBase + r + 2, cz, ID.glowstone);
    // 대아치 정문(남쪽 -z, 광장 방향): 벽 뚫고 문 + 계단 아치 + 배너 기둥 + 랜턴 + 진입 계단참
    const gd = (o.gdir === 1 ? 1 : -1), gz = cz + r * gd;   // 정문 방향(광장 쪽): -1=−z, 1=+z
    for (let y = base; y < base + 4; y++) { setW(cx, y, gz, 0); setW(cx - 1, y, gz, 0); setW(cx + 1, y, gz, 0); }   // 아치 개구부(폭3)
    const doorId = ID['spruce_door_c_' + (gd === 1 ? 0 : 2)]; if (doorId != null) { setW(cx, base, gz, doorId); setW(cx, base + 1, gz, doorId); }
    setW(cx - 1, base + 3, gz, stairIdFor(accent, 3) || accent); setW(cx + 1, base + 3, gz, stairIdFor(accent, 1) || accent); setW(cx, base + 4, gz, accent);   // 아치머리
    for (const lx of [cx - 2, cx + 2]) { for (let y = base; y < base + 3; y++) setW(lx, y, gz, accent); setW(lx, base + 3, gz, ID.glowstone); }   // 배너 기둥+랜턴
    // 진입 계단참 + 레드카펫
    const slab = slabIdFor(ID.stone_bricks);
    for (let dx = -1; dx <= 1; dx++) { if (slab != null) setW(cx + dx, base - 1, gz + gd, slab); setW(cx + dx, base - 1, gz + 2 * gd, ID.wool_red != null ? ID.wool_red : ID.stone_bricks); }
    // 실내 바닥 무늬(체크) + 벽 샹들리에(발광) + 중앙 feature
    for (let dx = -r + 1; dx <= r - 1; dx++) for (let dz = -r + 1; dz <= r - 1; dz++) if (dx * dx + dz * dz <= (r - 1) * (r - 1)) setW(cx + dx, base - 1, cz + dz, ((dx + dz) & 1) ? floor : accent);
    cols.forEach(([x, z]) => { const ix = cx + Math.round((x - cx) * 0.6), iz = cz + Math.round((z - cz) * 0.6); setW(ix, base + wallH - 1, iz, ID.glowstone); });   // 샹들리에
    if (typeof o.feature === 'function') o.feature(cx, cz, base, r);
  }
  // V20-P: 대장간 — 돔과 완전히 다른 골격. 하프팀버 벽 + A자 박공 지붕 + 높은 굴뚝 + 개방 용광로 베이 + 모루.
  function buildForge(x0, z0, wdt, dpt, base) {
    const x1 = x0 + wdt - 1, z1 = z0 + dpt - 1, cz = (z0 + z1) >> 1;
    const timber = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
    const plaster = ID.smooth_stone != null ? ID.smooth_stone : ID.stone;
    const roof = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
    flattenSite(x0 - 1, z0 - 1, x0 + wdt, z0 + dpt, base - 1);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) setW(x, base - 1, z, ID.stone_bricks);   // 석재 기초/바닥
    const wallH = 4;
    // 하프팀버 벽(모서리·격자 통나무 + 사이 회벽), 정면(z1) 우측 2칸은 개방 용광로 베이
    for (let y = base; y < base + wallH; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;   // 벽만
      if (z === z1 && x >= x1 - 2 && y < base + 3) continue;         // 개방 용광로 베이(정면 우측)
      const post = ((x === x0 || x === x1) && ((z - z0) % 2 === 0)) || ((z === z0 || z === z1) && ((x - x0) % 2 === 0));
      setW(x, y, z, (y === base + wallH - 1 || post) ? timber : plaster);   // 상단 띠·기둥 통나무, 나머지 회벽
    }
    // 유리창(측벽)
    for (let z = z0 + 1; z < z1; z += 2) { setW(x0, base + 1, z, ID.glass); setW(x1, base + 1, z, ID.glass); }
    // 정문(정면 좌측)
    const dxDoor = x0 + 1, dId = ID.spruce_door_c_0;
    if (dId != null) { setW(dxDoor, base, z1, dId); setW(dxDoor, base + 1, z1, dId); }
    setW(dxDoor - 1, base + 2, z1, ID.glowstone);
    // A자 박공 지붕(용마루 x축, z 경사) + 처마 1칸 돌출
    const halfD = Math.floor(dpt / 2);
    for (let x = x0 - 1; x <= x1 + 1; x++) for (let dz = -halfD - 1; dz <= halfD + 1; dz++) {
      const z = cz + dz, h = (halfD + 1) - Math.abs(dz); if (h < 0) continue;
      const ry = base + wallH + h;
      if (dz === 0) setW(x, ry, z, roof);   // 용마루
      else { const sid = stairIdFor(roof, dz > 0 ? 0 : 2); setW(x, ry, z, sid != null ? sid : roof); }
    }
    // 박공 삼각 벽(양 끝) — 통나무 뼈대 + 회벽
    for (const gx of [x0, x1]) for (let dz = -halfD; dz <= halfD; dz++) {
      const z = cz + dz, top = (halfD + 1) - Math.abs(dz);
      for (let yy = 0; yy < top; yy++) setW(gx, base + wallH + yy, z, (yy === top - 1 || dz === 0) ? timber : plaster);
    }
    // 높은 굴뚝(뒤 좌측 모서리) — 벽돌 스택 + 마그마/발광 정상(불티)
    const chx = x0, chz = z0, chTop = base + wallH + halfD + 4;
    for (let y = base; y <= chTop; y++) setW(chx, y, chz, ID.bricks);
    setW(chx, chTop, chz, ID.magma_block != null ? ID.magma_block : ID.glowstone);
    setW(chx, chTop + 1, chz, ID.magma_block != null ? ID.magma_block : ID.glowstone);
    // 개방 용광로 베이(정면 우측): 용암 화로 + 모루 + 담금질 물통 + 도구걸이
    const fx = x1 - 1, fz = z1;
    setW(fx, base - 1, fz, ID.magma_block != null ? ID.magma_block : ID.netherrack);
    setW(fx, base, fz, ID.lava);                                   // 용암 화로
    setW(fx - 1, base, fz - 1, ID.obsidian); setW(fx - 1, base + 1, fz - 1, ID.stone);   // 모루(어둠 받침 + 상단)
    setW(fx, base, fz - 2, ID.water);                             // 담금질 물통
    const fence = ID.oak_fence;
    setW(x1, base, fz - 1, fence); setW(x1, base + 1, fz - 1, fence); setW(x1, base + 2, fz - 1, ID.glowstone);   // 도구걸이 기둥+등
    // 실내 조명
    setW(x0 + (wdt >> 1), base + wallH - 1, cz, ID.glowstone);
  }
  // V20-Q: 경매장 — 돔/박공과 또 다른 틀. 개방형 원형 로툰다(하늘 개방) + 원주 기둥 + 링 지붕 + 계단식 관중석 + 중앙 경매 단상.
  function buildRotunda(cx, cz, r, base, o) {
    const col = o.col != null ? o.col : ID.quartz_block, band = o.band != null ? o.band : ID.purpur;
    const floor = o.floor != null ? o.floor : ID.polished_andesite;
    flattenSite(cx - r - 2, cz - r - 2, cx + r + 2, cz + r + 2, base - 1);
    const ring = (rad, y, id, gapAng) => { const n = Math.max(8, Math.round(rad * 8)); for (let a = 0; a < n; a++) { const th = a / n * Math.PI * 2; if (gapAng != null && Math.abs(((th - gapAng + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.35) continue; setW(cx + Math.round(Math.cos(th) * rad), y, cz + Math.round(Math.sin(th) * rad), id); } };
    // 원형 바닥(체크) + 계단식 관중석(2단, 바깥으로 상승)
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const d = Math.hypot(dx, dz); if (d <= r + 0.4) setW(cx + dx, base - 1, cz + dz, ((dx + dz) & 1) ? floor : ID.stone_bricks); }
    for (let t = 1; t <= 2; t++) { const rad = r - t + 1; const n = Math.max(8, Math.round(rad * 8)); for (let a = 0; a < n; a++) { const th = a / n * Math.PI * 2; const x = cx + Math.round(Math.cos(th) * rad), z = cz + Math.round(Math.sin(th) * rad); const f = Math.abs(Math.cos(th)) > Math.abs(Math.sin(th)) ? (Math.cos(th) > 0 ? 3 : 1) : (Math.sin(th) > 0 ? 2 : 0); const sid = stairIdFor(ID.stone_bricks, f); setW(x, base - 1 + t, z, sid != null ? sid : ID.stone_bricks); } }
    // 낮은 외벽(1단) — 관중석 뒤
    ring(r + 1, base + 1, ID.stone_bricks);
    // 8 원주 기둥(5단) + 상단 밴드(자수정) + 등불
    const gd = (o.gdir === 1 ? 1 : -1), gapTh = gd === 1 ? Math.PI / 2 : -Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const th = k / 8 * Math.PI * 2;
      if (Math.abs(((th - gapTh + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.4) continue;   // 정문 방향은 기둥 생략(개방)
      const x = cx + Math.round(Math.cos(th) * r), z = cz + Math.round(Math.sin(th) * r);
      for (let y = base; y < base + 5; y++) setW(x, y, z, col);
      setW(x, base + 5, z, band); setW(x, base + 6, z, ID.glowstone);
    }
    // 링 지붕(기둥 위, 중앙은 하늘 개방) — 자수정 밴드 + 처마 슬랩
    ring(r, base + 5, band, gapTh);
    const slab = slabIdFor(band); if (slab != null) ring(r + 1, base + 5, slab, gapTh);
    // 중앙 경매 단상: 2단 + 슬랩 상판 + 울타리 강대 + 배너 + 발광
    setW(cx, base, cz, ID.stone_bricks); setW(cx, base + 1, cz, band);
    const topSlab = slabIdFor(band); if (topSlab != null) setW(cx, base + 2, cz, topSlab);
    setW(cx, base + 3, cz, ID.oak_fence); setW(cx, base + 4, cz, ID.wool_red != null ? ID.wool_red : ID.glowstone);
    // 정문 계단참 + 레드카펫(광장 쪽)
    const gz = cz + (r + 1) * gd;
    for (let dx = -1; dx <= 1; dx++) { if (slab != null) setW(cx + dx, base - 1, gz, slab); setW(cx + dx, base - 1, gz + gd, ID.wool_red != null ? ID.wool_red : ID.stone_bricks); }
    for (const lx of [cx - 2, cx + 2]) { for (let y = base; y < base + 3; y++) setW(lx, y, gz - gd, band); setW(lx, base + 3, gz - gd, ID.glowstone); }
  }
  function buildRuinsZone() {
    // V18: 이끼 낀 고대 폐허 — 무너진 아치·기울어진 기둥·부서진 바닥 타일·덩굴
    const mossy = ID.mossy_cobblestone, sb = ID.stone_bricks;
    for (let i = 0; i < 14; i++) {
      const x = 74 + Math.floor(hash3(i, 71, 1) * 30), z = 266 + Math.floor(hash3(i, 72, 2) * 30);
      if (zoneAt(x, z) !== 'ruins') continue;
      const y = surfaceTop(x, z), h = 3 + Math.floor(hash3(i, 73, 3) * 4);
      // 부서진 기둥(위로 갈수록 이끼/파손)
      for (let j = 0; j < h; j++) setW(x, y + j, z, hash3(i, 74, j) < 0.4 ? mossy : sb);
      // 기둥머리(계단 4방으로 부서진 주두)
      if (hash3(i, 76, 5) < 0.5) { const s = stairIdFor(ID.stone_bricks, (i % 4)); if (s != null) setW(x, y + h, z, s); }
      // 무너진 아치 잔해(옆으로 흘러내린 계단/반블럭)
      if (hash3(i, 75, 4) < 0.5) {
        const s = slabIdFor(ID.stone_bricks); const dir = hash3(i, 77, 6) < 0.5 ? 1 : -1;
        if (s != null) { setW(x + dir, y, z, s); setW(x + dir * 2, y, z, mossy); }
      }
    }
    // 깨진 바닥 타일 패치(석재벽돌/이끼조약돌 혼합)
    for (let i = 0; i < 40; i++) {
      const x = 74 + Math.floor(hash3(i, 81, 7) * 30), z = 266 + Math.floor(hash3(i, 82, 8) * 30);
      if (zoneAt(x, z) !== 'ruins') continue;
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) === ID.grass || getBlockLocal(x, y, z) === ID.dirt) setW(x, y, z, hash3(i, 83, 9) < 0.5 ? mossy : ID.polished_andesite);
    }
    // 반쯤 무너진 아치 게이트(입구 랜드마크)
    const gx = 88, gz = 280, gy = surfaceTop(gx, gz);
    for (let dy = 0; dy < 4; dy++) { setW(gx - 2, gy + dy, gz, sb); setW(gx + 2, gy + dy, gz, dy < 3 ? mossy : sb); }
    setW(gx - 1, gy + 4, gz, stairIdFor(ID.stone_bricks, 3) || sb); setW(gx, gy + 4, gz, sb); setW(gx + 1, gy + 4, gz, stairIdFor(ID.stone_bricks, 1) || sb);
  }
  function buildZigguratV6() {
    // V18: 대신전 지구라트 — 층마다 계단 트림 + 정면 대계단 + 모서리 화톳불 + 정상 흑요석 성소
    const cx = 296, cz = 384;
    const base = surfaceTop(cx, cz);
    const ssSlab = slabIdFor(ID.stone_bricks);
    flattenSite(cx - 15, cz - 15, cx + 15, cz + 15, base - 1);
    for (let tier = 0; tier < 7; tier++) {
      const half = 13 - tier * 2, y = base + tier;
      for (let x = cx - half; x <= cx + half; x++) for (let z = cz - half; z <= cz + half; z++) {
        const edge = x === cx - half || x === cx + half || z === cz - half || z === cz + half;
        setW(x, y, z, edge && (x + z) % 3 === 0 ? ID.chiseled_stone_bricks : ID.stone_bricks);
      }
      // 층 앞턱 계단 트림(사방 바깥 물매)
      for (let x = cx - half; x <= cx + half; x++) {
        let s;
        s = stairIdFor(ID.stone_bricks, 2); if (s != null) setW(x, y + 1, cz - half, s);
        s = stairIdFor(ID.stone_bricks, 0); if (s != null) setW(x, y + 1, cz + half, s);
      }
      for (let z = cz - half; z <= cz + half; z++) {
        let s;
        s = stairIdFor(ID.stone_bricks, 1); if (s != null) setW(cx - half, y + 1, z, s);
        s = stairIdFor(ID.stone_bricks, 3); if (s != null) setW(cx + half, y + 1, z, s);
      }
      [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(c => { setW(cx + c[0], y + 1, cz + c[1], ID.netherrack); setW(cx + c[0], y + 2, cz + c[1], ID.glowstone); });   // 모서리 화톳불
    }
    // 정면 대계단(남쪽) — 자수정 카펫 느낌 매끈돌 계단
    for (let tier = 0; tier < 7; tier++) {
      const zf = cz + (13 - tier * 2) + 1;
      for (let dx = -2; dx <= 2; dx++) { const s = stairIdFor(ID.smooth_stone, 0); if (s != null) setW(cx + dx, base + tier, zf, s); }
    }
    // 정상 성소(흑요석 문설주 + 자수정 제단 + 발광 코어)
    const ty = base + 7;
    for (let dx = -2; dx <= 2; dx++) { setW(cx + dx, ty, cz + 3, ID.obsidian); setW(cx + dx, ty + 4, cz + 3, ID.obsidian); }
    for (let dy = 0; dy <= 4; dy++) { setW(cx - 2, ty + dy, cz + 3, ID.obsidian); setW(cx + 2, ty + dy, cz + 3, ID.obsidian); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(cx + dx, ty, cz + dz, ID.purpur);
    setW(cx, ty + 1, cz, ID.glowstone);
  }
  function buildShrineV6() {
    const cx = 224, cz = 158;
    const base = surfaceTop(cx, cz) - 1;
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { if (Math.hypot(dx, dz) < 5.5) setW(cx + dx, base, cz + dz, ID.quartz_block); }
    for (let a = 0; a < 12; a++) { const x = cx + Math.round(Math.cos(a / 12 * Math.PI * 2) * 7), z = cz + Math.round(Math.sin(a / 12 * Math.PI * 2) * 7); const y = surfaceTop(x, z); if (getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, a % 2 ? ID.flower_red : ID.flower_yellow); }
    setW(cx, base + 1, cz - 3, ID.quartz_block); setW(cx, base + 2, cz - 3, ID.glowstone);
  }

    /* ---- 프라이빗 섬(스카이블럭의 심장 — 공허에 뜬 나만의 섬. 허브와 똑같은 서바이벌: 직접 캐서 모은 블럭만 설치) ---- */
  // V13-A: 깔끔한 흑요석 네더 포탈(4폭×5고). 떠 있는 금블럭·보라 슬랩 등 이상 요소 제거.
  function buildPortalFrame(cx, cz) {
    const y = surfaceTop(cx, cz);
    // 바닥/천장 가로 + 양쪽 세로 = 폐곡선 프레임(내부 2×3은 빈 공간, 포탈 마커 평면이 채움)
    for (let dx = -1; dx <= 2; dx++) { setW(cx + dx, y, cz, ID.obsidian); setW(cx + dx, y + 4, cz, ID.obsidian); }
    for (let dy = 1; dy <= 3; dy++) { setW(cx - 1, y + dy, cz, ID.obsidian); setW(cx + 2, y + dy, cz, ID.obsidian); }
    // 발판(주변 조약돌 테두리)로 자연스럽게
    for (let dx = -1; dx <= 2; dx++) if (getBlockLocal(cx + dx, y - 1, cz) && !getBlockLocal(cx + dx, y - 1, cz + 1)) {}
  }
  // V13-A: 실제 하이픽셀처럼 프라이빗 섬 = 작은 스폰섬 + 포탈섬 두 개를 나무 다리로 연결.
  //   수학함수 대칭 원뿔(역원뿔) 폐기 → 방향별 반경 변주 + 기복 있는 밑면의 유기적 비대칭 지형.
  const HOME_SPAWN = { x: 96, z: 104, r: 8 };     // 스폰섬(작음) — 시작 나무
  const HOME_PISLE = { x: 96, z: 78, r: 7 };      // 포탈섬(작음) — 허브 포탈 + Jerry + 상자
  const HOME_TOP = 20;
  function genHomeBlob(cx, cz, baseR, seed) {
    for (let x = cx - baseR - 3; x <= cx + baseR + 3; x++) for (let z = cz - baseR - 3; z <= cz + baseR + 3; z++) {
      if (x < HOME_BOUNDS.x0 || x > HOME_BOUNDS.x1 || z < HOME_BOUNDS.z0 || z > HOME_BOUNDS.z1) continue;
      const ang = Math.atan2(z - cz, x - cx);
      // 방향별 반경(비대칭) — 여러 사인 성분 + 해시 지터
      const rr = baseR * (0.78 + 0.22 * Math.sin(ang * 2 + seed) + 0.12 * Math.sin(ang * 3 - seed) + (hash3(x, seed, z) - 0.5) * 0.28);
      const d = Math.hypot(x - cx, z - cz);
      if (d > rr) continue;
      const surf = HOME_TOP + (hash3(x, seed + 7, z) < 0.18 ? 1 : 0);   // 표면 미세 기복
      const depth = 3 + Math.floor((rr - d) * 0.55 + (hash3(x, seed + 3, z)) * 2);   // 밑면 두께 변주(기복)
      for (let y = surf; y >= surf - depth; y--) {
        let id = ID.stone;
        if (y === surf) id = ID.grass; else if (y >= surf - 2) id = ID.dirt;
        setW(x, y, z, id);
      }
    }
  }
  function genHome(editsOverride) {
    world = new Uint8Array(W * H * Dp);   // 공허 하늘 — 진짜 스카이블럭 프라이빗 섬
    genHomeBlob(HOME_SPAWN.x, HOME_SPAWN.z, HOME_SPAWN.r, 31);
    genHomeBlob(HOME_PISLE.x, HOME_PISLE.z, HOME_PISLE.r, 57);
    // 두 섬을 잇는 나무 다리(길)
    for (let z = HOME_PISLE.z + HOME_PISLE.r - 1; z <= HOME_SPAWN.z - HOME_SPAWN.r + 1; z++) {
      for (let dx = -1; dx <= 1; dx++) { if (!getBlockLocal(96 + dx, HOME_TOP, z)) setW(96 + dx, HOME_TOP, z, ID.oak_planks); }
      if (z % 3 === 0) { setW(95, HOME_TOP, z, ID.oak_planks); setW(97, HOME_TOP, z, ID.oak_planks); setW(94, HOME_TOP + 1, z, ID.oak_fence !== undefined ? ID.oak_fence : ID.oak_log); }
    }
    // 스폰섬: 시작 참나무(자연스러운 캐노피)
    const tx = HOME_SPAWN.x - 3, tz = HOME_SPAWN.z + 2, ty = surfaceTop(tx, tz);
    if (ty > 2) {
      for (let i = 0; i < 5; i++) setW(tx, ty + i, tz, ID.oak_log);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 3; dy <= 6; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 5) <= 3 && !(dx === 0 && dz === 0 && dy < 5)) {
          if (!getBlockLocal(tx + dx, ty + dy, tz + dz)) setW(tx + dx, ty + dy, tz + dz, ID.oak_leaves);
        }
      }
    }
    // V18-B: 스폰섬 스타터 통나무 오두막(문/유리창/계단 지붕/현관 난간 — 아늑한 시작 집)
    buildHouse(HOME_SPAWN.x - 2, HOME_SPAWN.z - 6, 6, 5, HOME_TOP + 1, ID.oak_planks, ID.spruce_planks, ID.oak_log);
    // 스폰섬 꽃/풀 장식
    for (let i = 0; i < 8; i++) {
      const x = HOME_SPAWN.x + Math.round((hash3(i, 81, 3) - 0.5) * HOME_SPAWN.r * 1.3);
      const z = HOME_SPAWN.z + Math.round((hash3(i, 82, 7) - 0.5) * HOME_SPAWN.r * 1.3);
      const y = surfaceTop(x, z);
      if (y > 2 && getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, hash3(i, 83, 1) < 0.4 ? ID.flower_red : (hash3(i, 84, 1) < 0.5 ? ID.flower_yellow : ID.tall_grass));
    }
    // 포탈섬: 조약돌 바닥(코블 생성기 자리) + 허브 포탈
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const y = surfaceTop(HOME_PISLE.x + 3 + dx, HOME_PISLE.z + dz); if (y > 2) setW(HOME_PISLE.x + 3 + dx, y, HOME_PISLE.z + dz, ID.cobblestone); }
    buildPortalFrame(PORTALS.home.x, PORTALS.home.z);
    // 저장된 블록 편집 적용(설치/파괴 영속)
    const edits = editsOverride || (econApi().getHomeEdits ? econApi().getHomeEdits() : {});
    for (const k in edits) {
      const p = k.split(',').map(Number);
      if (inBounds(p[0], p[1], p[2])) world[widx(p[0], p[1], p[2])] = edits[k];
    }
  }
  // 월드 이동(허브 ↔ 프라이빗 섬 ↔ 남의 섬 방문)
  function travelTo(mode, force) {
    if (mode === worldMode && !force) return;
    restoreAllRegen(); clearMobs(); stopFishing(); mouseHeld = false; warpCharge = null;
    if (worldMode === 'dungeon' && mode !== 'dungeon') { dungeonState = null; partyGuestMode = false; }
    if (world && worldMode !== 'visit' && worldMode !== 'dungeon') {   // 현재 월드 캐시(널 월드 금지)
      worldCache[worldMode] = { world, W, H, Dp, _at: (worldCache[worldMode] && worldCache[worldMode]._at || 0) + 1 };
      // V12: 캐시 상한 — home + 최근 2개만 유지(대형 hub Uint8Array 무한 누적 방지)
      const keys = Object.keys(worldCache).filter(k => k !== 'home' && k !== worldMode);
      if (keys.length > 2) { keys.sort((a, b) => worldCache[a]._at - worldCache[b]._at); delete worldCache[keys[0]]; }
    }
    worldMode = mode;
    if (mode !== 'visit') visitData = null;
    disposeIslandMeshes();
    [npcGroup, nodeGroup, minionGroup, fairyGroup, propGroup].forEach(g => { if (g && scene) { scene.remove(g); disposeGroup(g); } });
    npcGroup = nodeGroup = minionGroup = fairyGroup = propGroup = null;
    ambientMobs = []; fairyMeshes = {}; _minionSig = ''; dynamicInteractables = [];
    const def = WORLD_DEFS[mode] || WORLD_DEFS.hub;
    W = def.size[0]; H = def.size[1]; Dp = def.size[2];
    if (mode === 'home') genHome();
    else if (mode === 'visit') genHome(visitData && visitData.homeEdits);
    else if (worldCache[mode]) { const c = worldCache[mode]; world = c.world; W = c.W; H = c.H; Dp = c.Dp; }
    else if (mode === 'hub') genWorld();
    else if (def.gen) { def.gen(); scatterWorldDetail(mode); buildThemeStructures(mode); }   // V16 데코 + V18-C 테마 건물(캐시엔 이미 반영)
    if (mode === 'hub') resetPlayerToSpawn();
    else if (mode === 'home' || mode === 'visit') { P.x = 96.5; P.z = 104.5; P.y = surfaceTop(96, 104) + 0.02; P.yaw = Math.PI; }   // V13-A: 스폰섬
    else { const sp = def.spawn || [W >> 1, Dp >> 1]; P.x = sp[0] + 0.5; P.z = sp[1] + 0.5; P.y = surfaceTop(sp[0], sp[1]) + 0.02; P.yaw = Math.PI; }
    P.vx = P.vy = P.vz = 0;
    buildIslandMesh((mode === 'home' || mode === 'visit') ? HOME_BOUNDS : null);   // 플레이어 주변 청크부터 즉시 빌드
    if (mode === 'hub') { buildNpcMeshes(); buildNodeMeshes(); buildAmbientMobs(); }
    else { propGroup = new THREE.Group(); scene.add(propGroup); if (mode === 'home') buildNpcMeshes(); }   // V13-B: 홈에도 퀘스트 NPC(제리/팻)
    buildFairyMeshes(); refreshFairyVisibility();   // V9: 소울은 모든 월드에
    buildStaticInteractables();
    rebuildMinionVisuals(true);
    buildMinimapBase();
    buildPortalMarker();
    curBannerKey = '';
    _lastSkyKey = '';   // 월드별 고정 시간대 즉시 반영
    updateBuildHud();
    if (typeof toast === 'function') {
      if (mode === 'home') toast('🏝️ 나의 섬 도착! 서바이벌 — 직접 캐서 모은 블럭만 설치돼요 (좌클릭 채굴 · 우클릭 설치)', true);
      else if (mode === 'visit') toast(`🏝️ ${(visitData && visitData.name) || '친구'}님의 섬에 방문했어요 (구경만 가능)`, true);
      else toast(`${def.name}에 도착!`, true);
    }
  }
  // 다른 플레이어 섬 방문(economy-net.js가 RPC 데이터를 받아 호출)
  function travelVisit(name, data) {
    if (!running || !scene) { if (typeof toast === 'function') toast('경제 월드에 접속한 상태에서만 방문할 수 있어요', false); return; }
    visitData = { name, homeEdits: (data && data.homeEdits) || {}, minions: (data && data.minions) || [] };
    travelTo('visit', true);   // 방문 중 다른 섬 재방문도 허용
  }

  /* ---- 구조물 헬퍼 ---- */
  function flattenSite(x0, z0, x1, z1, y) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      for (let yy = y + 1; yy < H; yy++) setW(x, yy, z, 0);
      for (let yy = Math.max(2, y - 4); yy <= y; yy++) if (!getBlockLocal(x, yy, z)) setW(x, yy, z, ID.dirt);
      setW(x, y, z, ID.grass);
    }
  }
  function clearAbove(x, z, y0, n) { for (let y = y0; y < y0 + n; y++) setW(x, y, z, 0); }
  // 입장 가능한 건물: 벽 4높이 + 평지붕 + 남쪽 문(1×2) + 유리창 + 내부 글로우스톤
  // V14: 상자 폐기 — 석재 기초·통나무 모서리 기둥·유리창 열·경사(계단식) 지붕·문 양옆 랜턴
  function buildHouse(x0, z0, wdt, dpt, base, wallId, roofId, trimId) {
    trimId = trimId != null ? trimId : ID.oak_log;
    flattenSite(x0 - 1, z0 - 1, x0 + wdt, z0 + dpt, base - 1);
    // 석재 기초 테두리 + 판자 바닥
    for (let x = x0 - 1; x <= x0 + wdt; x++) for (let z = z0 - 1; z <= z0 + dpt; z++) {
      if (x === x0 - 1 || x === x0 + wdt || z === z0 - 1 || z === z0 + dpt) setW(x, base - 1, z, ID.stone_bricks);
    }
    for (let x = x0; x < x0 + wdt; x++) for (let z = z0; z < z0 + dpt; z++) setW(x, base - 1, z, ID.oak_planks);
    const wallH = 3;
    // 벽 3칸 + 모서리 통나무 기둥
    for (let y = base; y < base + wallH; y++) for (let x = x0; x < x0 + wdt; x++) for (let z = z0; z < z0 + dpt; z++) {
      const edge = x === x0 || x === x0 + wdt - 1 || z === z0 || z === z0 + dpt - 1;
      const corner = (x === x0 || x === x0 + wdt - 1) && (z === z0 || z === z0 + dpt - 1);
      setW(x, y, z, corner ? trimId : (edge ? wallId : 0));
    }
    // 상인방(벽 위 통나무 띠)
    for (let x = x0; x < x0 + wdt; x++) { setW(x, base + wallH, z0, trimId); setW(x, base + wallH, z0 + dpt - 1, trimId); }
    for (let z = z0; z < z0 + dpt; z++) { setW(x0, base + wallH, z, trimId); setW(x0 + wdt - 1, base + wallH, z, trimId); }
    // 유리창(벽 중간, 2칸 간격) — 사방
    const wy = base + 1;
    for (let x = x0 + 1; x < x0 + wdt - 1; x += 2) { setW(x, wy, z0, ID.glass); setW(x, wy, z0 + dpt - 1, ID.glass); }
    for (let z = z0 + 1; z < z0 + dpt - 1; z += 2) { setW(x0, wy, z, ID.glass); setW(x0 + wdt - 1, wy, z, ID.glass); }
    // V17-D: 남쪽에 진짜 나무 문(2칸) + 문 위 트랩도어 차양 + 양옆 울타리 난간 + 랜턴
    const dxc = x0 + (wdt >> 1);
    const doorId = ID[(doorWoodFor(wallId) || 'oak') + '_door_c_0'];
    setW(dxc, base, z0 + dpt - 1, doorId); setW(dxc, base + 1, z0 + dpt - 1, doorId);
    const trapId = ID[(doorWoodFor(wallId) || 'oak') + '_trapdoor'];
    if (trapId != null) setW(dxc, base + 2, z0 + dpt, trapId);   // 문 위 차양
    const stepSlab = slabIdFor(ID.stone_bricks);
    if (stepSlab != null) setW(dxc, base - 1, z0 + dpt, stepSlab);   // 문 앞 석재 반블럭 계단참(기초 테두리 위 덧댐)
    const fenceId = ID[(doorWoodFor(wallId) || 'oak') + '_fence'];
    for (const lx of [dxc - 1, dxc + 1]) {
      if (lx > x0 - 1 && lx < x0 + wdt) {
        if (fenceId != null) setW(lx, base, z0 + dpt, fenceId);   // 현관 난간
        setW(lx, base + 1, z0 + dpt, ID.glowstone);               // 랜턴
      }
    }
    // V17-D: 계단 경사 지붕(밀폐 큐브 위에 계단 오버레이로 진짜 물매) — 처마 1칸 돌출
    let a = x0 - 1, b = z0 - 1, c = x0 + wdt, d = z0 + dpt, ry = base + wallH;
    const maxRy = base + wallH + 4;
    while (a <= c && b <= d && ry <= maxRy) {
      for (let x = a; x <= c; x++) for (let z = b; z <= d; z++) {
        const onEdge = x === a || x === c || z === b || z === d;
        let id = roofId;
        if (onEdge && a < c && b < d) {   // 가장자리는 바깥쪽 향한 계단으로(물매)
          let f = (x === a) ? 1 : (x === c) ? 3 : (z === b) ? 2 : 0;
          const sid = stairIdFor(roofId, f); if (sid != null) id = sid;
        }
        setW(x, ry, z, id);
      }
      a++; b++; c--; d--; ry++;
    }
    if (a <= c && b <= d) for (let x = a; x <= c; x++) for (let z = b; z <= d; z++) setW(x, ry, z, roofId);   // 용마루 마감
    houseDecor(x0, z0, wdt, dpt, base, wallId, roofId);   // V20-N: 인테리어 + 외부 디테일
  }
  // V20-N: 집 내부/외부 장식 — 러그·책장·테이블·화분·벽랜턴 + 굴뚝·현관 화분(블럭 단위)
  function houseDecor(x0, z0, wdt, dpt, base, wallId, roofId) {
    const ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x0 + wdt - 2, iz1 = z0 + dpt - 2;
    const cx = (ix0 + ix1) >> 1, cz = (iz0 + iz1) >> 1;
    // 항상 중앙 천장 조명
    setW(cx, base + 2, cz, ID.glowstone);
    if (ix1 - ix0 >= 2 && iz1 - iz0 >= 2) {   // 방이 충분히 클 때만 가구 배치
      // 1) 따뜻한 러그(양털 바닥 체크무늬, 중앙 3×3)
      const rugA = ID.wool_red != null ? ID.wool_red : ID.oak_planks;
      const rugB = ID.wool_orange != null ? ID.wool_orange : (ID.wool_white != null ? ID.wool_white : ID.oak_planks);
      for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++)
        if (x >= ix0 && x <= ix1 && z >= iz0 && z <= iz1) setW(x, base - 1, z, ((x + z) & 1) ? rugA : rugB);
      // 2) 책장 벽(뒷벽 안쪽 한 줄, 2단)
      for (let x = ix0; x <= ix1; x++) { setW(x, base, iz0, ID.bookshelf); setW(x, base + 1, iz0, ID.bookshelf); }
      // 3) 중앙 테이블(울타리 다리 + 반블럭 상판) + 양옆 의자(계단)
      setW(cx, base, cz, ID.oak_fence);
      const topSlab = ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks; setW(cx, base + 1, cz, topSlab);
      const chair = f => ID['spruce_planks_stairs_' + f];
      if (cx - 1 > iz0 && chair(1) != null) setW(cx - 1, base, cz, chair(1));
      if (cx + 1 <= ix1 && chair(3) != null) setW(cx + 1, base, cz, chair(3));
      // 4) 앞 모서리 화분(원목 + 꽃)
      [[ix0, iz1], [ix1, iz1]].forEach(([px, pz]) => { setW(px, base, pz, ID.oak_log); setW(px, base + 1, pz, hash3(px, 5, pz) < 0.5 ? ID.flower_red : ID.flower_yellow); });
      // 5) 측벽 랜턴
      setW(ix0, base + 1, cz, ID.glowstone); setW(ix1, base + 1, cz, ID.glowstone);
    }
    // 외부: 굴뚝(뒤 모서리, 벽돌 + 발광 상단) + 현관 앞 화분 2개
    const chY = base + 5;
    setW(x0 + 1, chY, z0 + 1, ID.bricks); setW(x0 + 1, chY + 1, z0 + 1, ID.bricks); setW(x0 + 1, chY + 2, z0 + 1, ID.magma_block != null ? ID.magma_block : ID.glowstone);
    const dxc2 = x0 + (wdt >> 1);
    [[dxc2 - 2, z0 + dpt], [dxc2 + 2, z0 + dpt]].forEach(([px, pz]) => {
      if (px > x0 && px < x0 + wdt - 1) { setW(px, base - 1, pz, ID.oak_log); setW(px, base, pz, hash3(px, 9, pz) < 0.5 ? ID.flower_yellow : ID.flower_red); }
    });
  }
  // 블럭 → 계단/반블럭/나무종 매핑(형태 변형이 있으면 그 id, 없으면 null)
  function stairIdFor(blockId, f) { const b = BLOCKS[blockId]; if (!b) return null; const k = b.key.replace(/_stairs_\d$/, ''); const id = ID[k + '_stairs_' + f]; return id != null ? id : null; }
  function slabIdFor(blockId) { const b = BLOCKS[blockId]; if (!b) return null; const id = ID[b.key + '_slab']; return id != null ? id : null; }
  function doorWoodFor(wallId) {   // 벽 재질에 어울리는 문 나무종
    const k = (BLOCKS[wallId] || {}).key || '';
    if (/spruce|dark_oak|nether/.test(k)) return 'spruce';
    if (/birch|sandstone|quartz/.test(k)) return 'birch';
    if (/jungle/.test(k)) return 'jungle';
    if (/acacia|brick/.test(k)) return 'acacia';
    return 'oak';
  }
  // V20-L: 예쁜 가로등 — 석재 받침 + 울타리 기둥 + 랜턴(발광+슬랩 갓)
  function lampPost(x, z) {
    const y = surfaceTop(x, z);
    const slab = ID.stone_bricks_slab != null ? ID.stone_bricks_slab : ID.stone_bricks;
    setW(x, y - 1, z, ID.stone_bricks);                                   // 받침돌
    for (let i = 0; i < 3; i++) setW(x, y + i, z, ID.oak_fence);          // 울타리 기둥
    setW(x, y + 3, z, ID.glowstone);                                     // 랜턴 발광부
    setW(x, y + 4, z, slab);                                             // 갓(슬랩)
  }
  function pathTo(x0, z0, x1, z1) {   // V14: 3칸 폭 석재 대로(중앙 석재벽돌 + 가장자리 조약돌)
    let x = x0, z = z0;
    const lay = (px, pz, mat) => {
      const y = surfaceTop(px, pz) - 1;
      const b = getBlockLocal(px, y, pz);
      if (b === ID.grass || b === ID.dirt || b === ID.coarse_dirt || b === ID.gravel) setW(px, y, pz, mat);
    };
    while (x !== x1 || z !== z1) {
      const horiz = x !== x1;
      lay(x, z, ID.stone_bricks);
      // 진행 방향에 수직으로 양옆 1칸(조약돌 갓길)
      if (horiz) { lay(x, z - 1, ID.cobblestone); lay(x, z + 1, ID.cobblestone); }
      else { lay(x - 1, z, ID.cobblestone); lay(x + 1, z, ID.cobblestone); }
      if (horiz) x += x1 > x ? 1 : -1; else z += z1 > z ? 1 : -1;
    }
  }

  function plantOak(x, z) {
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 4; i++) setW(x, y0 + i, z, ID.oak_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 3; dy <= 5; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + (dy - 4 > 0 ? dy - 4 : 0) <= 3 && !(dx === 0 && dz === 0 && dy < 4)) {
        if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.oak_leaves);
      }
    }
  }
  function plantBirch(x, z) {
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 5; i++) setW(x, y0 + i, z, ID.birch_log);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 4; dy <= 6; dy++) {
      if (!(dx === 0 && dz === 0 && dy < 5)) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.oak_leaves); }
    }
  }
  function plantSpruce(x, z) {
    const y0 = surfaceTop(x, z);
    const th = 6 + Math.floor(hash3(x, 24, z) * 3);
    for (let i = 0; i < th; i++) setW(x, y0 + i, z, ID.spruce_log);
    for (let dy = 2; dy <= th; dy++) {
      const rad = Math.max(0, Math.min(2, ((th - dy) >> 1)));
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= rad && !(dx === 0 && dz === 0)) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.spruce_leaves); }
      }
    }
    setW(x, y0 + th, z, ID.spruce_leaves);
  }

  // V16: 월드별 지표 앰비언트 데코 — 각 섬에 고유한 분위기(꽃밭/버섯/크리스탈/용암/영혼불 등)
  function propOnGround(x, z, groundOk, place) {   // 지면 위 빈칸에 프롭 설치
    if (x < 1 || z < 1 || x >= W - 1 || z >= Dp - 1) return;
    const y = surfaceTop(x, z); if (y < 3 || y >= H - 2) return;
    const g = getBlockLocal(x, y - 1, z);
    if (getBlockLocal(x, y, z) !== 0) return;
    if (groundOk && groundOk.indexOf(g) < 0) return;
    place(x, y, z, g);
  }
  const GRASSY = () => [ID.grass, ID.dirt, ID.coarse_dirt, ID.mycelium];
  function scatterWorldDetail(mode) {
    const R = (x, z, s) => hash3(x, s, z);
    for (let x = 2; x < W - 2; x += 2) for (let z = 2; z < Dp - 2; z += 2) {
      const r = R(x, z, 7);
      if (mode === 'park') {   // 화사한 초원: 꽃밭 군락 + 수풀 + 그늘 버섯
        propOnGround(x, z, GRASSY(), (px, py, pz) => {
          if (r < 0.14) setW(px, py, pz, r < 0.07 ? ID.flower_red : ID.flower_yellow);
          else if (r < 0.30) setW(px, py, pz, ID.tall_grass);
          else if (r < 0.32) setW(px, py, pz, R(px, pz, 3) < 0.5 ? ID.mushroom_red_block : ID.mushroom_brown_block);
        });
      } else if (mode === 'barn') {   // 농가: 건초더미 + 호박 + 밀밭 느낌
        propOnGround(x, z, GRASSY(), (px, py, pz) => {
          if (r < 0.04) { setW(px, py, pz, ID.hay_block); if (R(px, pz, 9) < 0.4) setW(px, py + 1, pz, ID.hay_block); }
          else if (r < 0.08) setW(px, py, pz, ID.pumpkin);
          else if (r < 0.24) setW(px, py, pz, ID.tall_grass);
        });
      } else if (mode === 'gold') {   // 건조 협곡: 마른 덤불 + 자갈 바위 + 금맥 반짝
        propOnGround(x, z, [ID.sand, ID.sandstone, ID.stone, ID.gravel, ID.coarse_dirt, ID.grass, ID.dirt], (px, py, pz) => {
          if (r < 0.10) setW(px, py, pz, ID.tall_grass);
          else if (r < 0.13) { setW(px, py, pz, ID.gravel); if (R(px, pz, 2) < 0.4) setW(px, py + 1, pz, ID.cobblestone); }
          else if (r < 0.135) setW(px, py, pz, ID.gold_ore);
        });
      } else if (mode === 'deep') {   // 심층 동굴: 발광 수정 군집 + 프리즈머린 + 청금석
        propOnGround(x, z, [ID.stone, ID.cobblestone, ID.dirt, ID.gravel], (px, py, pz) => {
          if (r < 0.05) { setW(px, py, pz, ID.glowstone); if (R(px, pz, 4) < 0.5) setW(px, py + 1, pz, ID.glowstone); }
          else if (r < 0.08) setW(px, py, pz, ID.prismarine);
          else if (r < 0.10) setW(px, py, pz, ID.lapis_ore);
        });
      } else if (mode === 'spider') {   // 거미굴: 거미줄(흰 양털) 무더기 + 이끼 바위
        propOnGround(x, z, GRASSY().concat([ID.stone, ID.cobblestone]), (px, py, pz) => {
          if (r < 0.045) setW(px, py, pz, ID.wool_white);
          else if (r < 0.08) setW(px, py, pz, ID.mossy_cobblestone);
          else if (r < 0.14) setW(px, py, pz, ID.tall_grass);
        });
      } else if (mode === 'nether') {   // 지옥: 용암 웅덩이 가장자리 마그마 + 영혼불(발광석) + 영혼모래
        propOnGround(x, z, [ID.netherrack, ID.soul_sand, ID.nether_bricks], (px, py, pz) => {
          if (r < 0.04) setW(px, py, pz, ID.magma_block);
          else if (r < 0.06) setW(px, py, pz, ID.glowstone);
          else if (r < 0.09) setW(px, py, pz, ID.soul_sand);
        });
      } else if (mode === 'end') {   // 엔드: 흑요석 첨탑 + 엔드로드(발광석) + 자수정(purpur)
        propOnGround(x, z, [ID.end_stone, ID.end_bricks, ID.obsidian, ID.purpur], (px, py, pz) => {
          if (r < 0.014) { const h = 2 + ((R(px, pz, 5) * 3) | 0); for (let k = 0; k < h; k++) setW(px, py + k, pz, ID.obsidian); setW(px, py + h, pz, ID.glowstone); }
          else if (r < 0.035) setW(px, py, pz, ID.purpur);
        });
      } else if (mode === 'mushroom') {   // 버섯 사막: 거대 버섯 군락 + 균사 위 작은 버섯
        propOnGround(x, z, [ID.mycelium, ID.sand, ID.grass, ID.dirt], (px, py, pz) => {
          if (r < 0.03) { setW(px, py, pz, ID.mushroom_stem); setW(px, py + 1, pz, ID.mushroom_stem); setW(px, py + 2, pz, R(px, pz, 1) < 0.5 ? ID.mushroom_red_block : ID.mushroom_brown_block); }
          else if (r < 0.10) setW(px, py, pz, R(px, pz, 6) < 0.5 ? ID.mushroom_red_block : ID.mushroom_brown_block);
        });
      }
    }
  }

  // V18-C: 테마 월드별 컨셉 시그니처 건물(새 형태 블럭 활용)
  function buildThemeStructures(mode) {
    const ok = (x, z) => surfaceTop(x, z) > 3;
    const base = (x, z) => surfaceTop(x, z) + 1;
    if (mode === 'park' && ok(70, 100)) buildHouse(67, 97, 7, 6, base(70, 100), ID.spruce_planks, ID.oak_planks, ID.oak_log);   // 삼림 산장
    else if (mode === 'barn' && ok(58, 100)) { buildHouse(54, 96, 10, 8, base(58, 100), ID.bricks, ID.dark_oak_log, ID.dark_oak_log); const by = base(52, 98); for (const [hx, hz] of [[52, 98], [53, 98], [52, 99]]) { setW(hx, by, hz, ID.hay_block); setW(hx, by + 1, hz, ID.hay_block); } }   // 붉은 헛간 + 건초더미
    else if (mode === 'gold' && ok(42, 90)) buildHouse(40, 88, 6, 5, base(42, 90), ID.cobblestone, ID.oak_planks, ID.oak_log);   // 광부 오두막
    else if (mode === 'deep' && ok(46, 74)) { buildHouse(44, 72, 6, 6, base(46, 74), ID.stone_bricks, ID.stone_bricks, ID.stone_bricks); const gy = base(46, 74); setW(43, gy + 1, 71, ID.glowstone); setW(50, gy + 1, 78, ID.glowstone); }   // 지하 전초기지 + 발광석
    else if (mode === 'spider' && ok(74, 88)) { buildHouse(72, 86, 6, 5, base(74, 88), ID.dark_oak_planks, ID.dark_oak_planks, ID.dark_oak_log); const wy = base(74, 88); for (let i = 0; i < 5; i++) setW(71 + (i % 4), wy + 3 + (i % 2), 85 + (i % 3), ID.wool_white); }   // 어두운 오두막 + 거미줄
    else if (mode === 'nether' && ok(62, 78)) { buildHouse(60, 76, 7, 6, base(62, 78), ID.nether_bricks, ID.nether_bricks, ID.nether_bricks); const ny = base(62, 78); setW(59, ny, 75, ID.magma_block); setW(67, ny, 82, ID.glowstone); }   // 네더 요새 + 마그마
    else if (mode === 'end' && ok(62, 84)) { buildHouse(60, 82, 6, 6, base(62, 84), ID.purpur, ID.purpur, ID.obsidian); const ey = base(62, 84); setW(59, ey, 81, ID.glowstone); setW(66, ey + 5, 88, ID.glowstone); }   // 엔드 성소 + 엔드로드
    else if (mode === 'mushroom' && ok(58, 100)) buildMushroomHouse(58, 100, base(58, 100));   // 거대 버섯 집
  }
  function buildMushroomHouse(cx, cz, base) {
    // V18: 동화풍 버섯 오두막 — 버섯대 몸통 + 흰 점박이 붉은 갓 + 둥근 창 + 반블럭 처마 + 현관 랜턴
    flattenSite(cx - 1, cz - 1, cx + 4, cz + 4, base - 1);
    for (let y = base; y < base + 4; y++) for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) {
      const edge = dx === 0 || dx === 3 || dz === 0 || dz === 3;
      setW(cx + dx, y, cz + dz, edge ? ID.mushroom_stem : 0);
    }
    // 둥근 창(유리) + 현관 여닫이 문 + 랜턴
    setW(cx + 2, base + 1, cz, ID.glass); setW(cx, base + 2, cz + 2, ID.glass); setW(cx + 3, base + 2, cz + 1, ID.glass);
    const mdoor = ID.spruce_door_c_2; setW(cx + 1, base, cz + 3, mdoor); setW(cx + 1, base + 1, cz + 3, mdoor);
    setW(cx, base + 2, cz + 3, ID.glowstone); setW(cx + 2, base + 2, cz + 3, ID.glowstone);   // 현관 랜턴
    // 몸통 상단 반블럭 처마 띠(갓 아래)
    const stemSlab = slabIdFor(ID.mushroom_stem);
    if (stemSlab != null) for (let dx = -1; dx <= 4; dx++) { setW(cx + dx, base + 4, cz - 1, stemSlab); setW(cx + dx, base + 4, cz + 4, stemSlab); }
    // 붉은 갓(3층 수렴, 가장자리는 계단으로 물매) + 흰 점박이(mushroom_brown/quartz 점)
    const capLayers = [[base + 4, -1, 4], [base + 5, 0, 3], [base + 6, 1, 2]];
    capLayers.forEach(([cy, lo, hi], li) => {
      for (let dx = lo; dx <= hi; dx++) for (let dz = lo; dz <= hi; dz++) {
        const onEdge = dx === lo || dx === hi || dz === lo || dz === hi;
        let id = ID.mushroom_red_block;
        // 흰 점박이(해시 기반 산발)
        if ((li < 2) && ((dx * 7 + dz * 13 + li * 5) % 6 === 0)) id = ID.quartz_block;
        if (onEdge && li < 2) { const s = stairIdFor(ID.mushroom_red_block, dx === lo ? 1 : dx === hi ? 3 : dz === lo ? 2 : 0); if (s != null) id = s; }
        setW(cx + dx, cy, cz + dz, id);
      }
    });
    // 갓 꼭대기 굴뚝(버섯대) + 발광
    setW(cx + 1, base + 7, cz + 1, ID.mushroom_stem); setW(cx + 1, base + 8, cz + 1, ID.glowstone);
    setW(cx + 1, base + 3, cz + 1, ID.glowstone);   // 실내 조명
  }
  /* ---------------- 테마 월드 생성기 ---------------- */
  function genBlobIsland(cx, cz, r, top, opt) {
    opt = opt || {};
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      let d = Math.hypot(x - cx, z - cz) / r;
      d += (hash3(x, 7, z) - 0.5) * 0.14;
      if (d >= 1) continue;
      const t = Math.min(1, (1 - d) * 2.4); const sm = t * t * (3 - 2 * t);
      const y0 = opt.flat ? top : Math.round(top - 2 + sm * 3);
      for (let y = y0; y >= Math.max(2, y0 - 6 - Math.round(sm * 10)); y--) {
        let id = opt.fill || ID.stone;
        if (y === y0) id = opt.surf || ID.grass;
        else if (y >= y0 - 3) id = opt.sub || ID.dirt;
        setW(x, y, z, id);
      }
    }
  }
  function scatterOre(cx, cz, r, yMin, yMax, oreId, n, seed) {
    let placed = 0;
    for (let i = 0; i < n * 14 && placed < n; i++) {
      const x = Math.floor(cx - r + hash3(i, seed, 1) * r * 2), z = Math.floor(cz - r + hash3(i, seed, 2) * r * 2);
      const y = yMin + Math.floor(hash3(i, seed, 3) * (yMax - yMin + 1));
      if (getBlockLocal(x, y, z) !== ID.stone) continue;
      if (!(getBlockLocal(x + 1, y, z) === 0 || getBlockLocal(x - 1, y, z) === 0 || getBlockLocal(x, y, z + 1) === 0 || getBlockLocal(x, y, z - 1) === 0 || getBlockLocal(x, y + 1, z) === 0 || getBlockLocal(x, y - 1, z) === 0)) continue;
      setW(x, y, z, oreId);
      if (hash3(i, seed, 4) < 0.5) setW(x, y + 1, z, oreId);
      placed++;
    }
  }
  function plantDarkOak(x, z) {
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 6; i++) { setW(x, y0 + i, z, ID.dark_oak_log); setW(x + 1, y0 + i, z, ID.dark_oak_log); }
    for (let dx = -3; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 5; dy <= 7; dy++) {
      if (Math.abs(dx - 0.5) + Math.abs(dz) <= 4.2 - (dy - 5)) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.dark_oak_leaves); }
    }
  }
  function plantJungle(x, z) {
    const y0 = surfaceTop(x, z);
    const th = 8 + Math.floor(hash3(x, 41, z) * 4);
    for (let i = 0; i < th; i++) setW(x, y0 + i, z, ID.jungle_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = th - 2; dy <= th + 1; dy++) {
      if (Math.abs(dx) + Math.abs(dz) <= 3) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.jungle_leaves); }
    }
  }
  function plantAcacia(x, z) {
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 5; i++) setW(x + (i > 2 ? 1 : 0), y0 + i, z, ID.acacia_log);
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx - 0.5) + Math.abs(dz) <= 3.4) { if (!getBlockLocal(x + dx, y0 + 5, z + dz)) setW(x + 1 + dx, y0 + 5, z + dz, ID.acacia_leaves); }
    }
  }
  function plantMegaSpruce(x, z) {
    const y0 = surfaceTop(x, z);
    const th = 11 + Math.floor(hash3(x, 42, z) * 4);
    for (let i = 0; i < th; i++) { setW(x, y0 + i, z, ID.spruce_log); setW(x + 1, y0 + i, z, ID.spruce_log); }
    for (let dy = 3; dy <= th; dy++) {
      const rad = Math.max(1, Math.round((th - dy) * 0.45));
      for (let dx = -rad; dx <= rad + 1; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx - 0.5) + Math.abs(dz) <= rad + 0.5 && !getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.spruce_leaves);
      }
    }
    setW(x, y0 + th, z, ID.spruce_leaves);
  }
  // 🌲 더 파크 V6: 중앙 광장섬 + "수종별 부속섬 8개"(참나무/자작/가문비/다크오크/정글/아카시아/메가가문비/설원가문비) + 다리
  function genPark() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(72, 72, 20, 16, { flat: true });   // 중앙 광장섬
    const species = [
      { plant: plantOak, name: 'oak' }, { plant: plantBirch, name: 'birch' }, { plant: plantSpruce, name: 'spruce' },
      { plant: plantDarkOak, name: 'darkoak' }, { plant: plantJungle, name: 'jungle' }, { plant: plantAcacia, name: 'acacia' },
      { plant: plantMegaSpruce, name: 'mega' }, { plant: plantSpruce, name: 'snowspruce', snow: true },
    ];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const cx = 72 + Math.round(Math.cos(a) * 46), cz = 72 + Math.round(Math.sin(a) * 46);
      genBlobIsland(cx, cz, 17, 16, species[i].snow ? { surf: ID.snow_block, sub: ID.dirt } : {});
      // 수종 심기
      for (let t = 0; t < 9; t++) {
        const x = cx + Math.floor((hash3(i, 55 + t, 1) - 0.5) * 24), z = cz + Math.floor((hash3(i, 56 + t, 2) - 0.5) * 24);
        if (Math.hypot(x - cx, z - cz) > 12) continue;
        species[i].plant(x, z);
      }
      // 중앙섬 → 부속섬 다리
      const steps = 46;
      for (let st = 14; st <= steps - 12; st++) {
        const bx = Math.round(72 + Math.cos(a) * st), bz = Math.round(72 + Math.sin(a) * st);
        for (let o = -1; o <= 1; o++) {
          const px2 = Math.abs(Math.cos(a)) > 0.5 ? bx : bx + o, pz2 = Math.abs(Math.cos(a)) > 0.5 ? bz + o : bz;
          setW(px2, 15, pz2, ID.oak_planks); clearAbove(px2, pz2, 16, 4);
        }
        if (st % 8 === 0) { setW(bx, 16, bz, ID.oak_log); setW(bx, 17, bz, ID.glowstone); }
      }
    }
    buildWarpPads();
  }
  // 🌾 더 반: 대형 농장(밀/당근/감자/호박/수박/사탕수수 대구획)
  function genBarn() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(72, 72, 62, 15, { flat: true });
    const crops = [ID.wheat_ripe, ID.carrot_ripe, ID.potato_ripe, ID.sugar_cane, ID.pumpkin, ID.melon];
    for (let ci = 0; ci < 6; ci++) {
      const px = 22 + (ci % 3) * 34, pz = 24 + Math.floor(ci / 3) * 40;
      for (let x = px; x < px + 26; x++) for (let z = pz; z < pz + 30; z++) {
        if (Math.hypot(x - 72, z - 72) > 58) continue;
        setW(x, 15, z, ID.farmland);
        if (crops[ci] === ID.pumpkin || crops[ci] === ID.melon) { if ((x + z * 3) % 4 === 0) setW(x, 16, z, crops[ci]); }
        else setW(x, 16, z, crops[ci]);
        if ((x + z) % 9 === 0) { setW(x, 15, z, ID.water); }   // 관개수로
      }
    }
    buildHouse(66, 60, 9, 8, 16, ID.wool_red, ID.spruce_planks);   // 대형 헛간
    lampPost(64, 90); lampPost(90, 64);
    buildWarpPads();
  }
  // ⛏️ 골드 광산: 노천 금광 산
  function genGoldMine() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(56, 56, 48, 14, { surf: ID.stone, sub: ID.stone });
    // 산(계단식 노천광)
    for (let ring = 0; ring < 6; ring++) {
      const rr = 34 - ring * 5;
      for (let x = 56 - rr; x <= 56 + rr; x++) for (let z = 46 - rr; z <= 46 + rr; z++) {
        if (Math.hypot(x - 56, z - 46) <= rr) for (let y = 15; y <= 15 + ring * 2; y++) setW(x, y, z, ID.stone);
      }
    }
    scatterOre(56, 46, 34, 14, 26, ID.gold_ore, 40, 61);
    scatterOre(56, 46, 34, 14, 24, ID.iron_ore, 30, 62);
    scatterOre(56, 46, 34, 14, 22, ID.coal_ore, 24, 63);
    [[42, 40], [70, 52], [56, 30]].forEach(p2 => { const y = surfaceTop(p2[0], p2[1]); setW(p2[0], y, p2[1], ID.glowstone); });
    buildWarpPads();
  }
  // 💎 딥 캐번: 실제처럼 층별 광물(위→아래: 석탄/철/금·청금/레드스톤/에메랄드·슬라임/다이아/흑요석) + 리프트
  function genDeepCaverns() {
    world = new Uint8Array(W * H * Dp);
    for (let x = 6; x < W - 6; x++) for (let z = 6; z < Dp - 6; z++) for (let y = 2; y <= 40; y++) setW(x, y, z, ID.stone);
    // 층 챔버(y대역별 대형 공동)
    const layers = [
      { y: 34, ore: ID.coal_ore, n: 40 }, { y: 29, ore: ID.iron_ore, n: 36 }, { y: 24, ore: ID.gold_ore, n: 30 },
      { y: 24, ore: ID.lapis_ore, n: 24 }, { y: 19, ore: ID.redstone_ore, n: 30 }, { y: 14, ore: ID.emerald_ore, n: 20 },
      { y: 9, ore: ID.diamond_ore, n: 22 }, { y: 5, ore: ID.obsidian, n: 16 },
    ];
    const uniq = [34, 29, 24, 19, 14, 9, 5];
    uniq.forEach(ly => {
      for (let x = 14; x < W - 14; x++) for (let z = 14; z < Dp - 14; z++) {
        const d = Math.hypot(x - 48, z - 48) / 34 + (hash3(x, ly, z) - 0.5) * 0.2;
        if (d < 1) for (let y = ly - 2; y <= ly + 1; y++) setW(x, y, z, 0);
      }
      [[30, 34], [64, 60], [48, 30], [36, 62]].forEach((p2, i) => setW(p2[0], ly - 2, p2[1] + i, ID.glowstone));
    });
    layers.forEach((L, i) => { scatterOre(48, 48, 34, L.y - 2, L.y + 1, L.ore, L.n, 71 + i); });
    // 중앙 리프트 수직 통로 + 층별 착지대(계단식)
    for (let y = 3; y <= 40; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(48 + dx, y, 48 + dz, 0);
    let py = 40;
    uniq.forEach(ly => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(48 + dx, ly - 3, 48 + dz, ID.stone_bricks); });
    // 나선 계단(리프트 대용 — 층 사이 이동)
    const ring = [[-3, -3], [-1, -3], [1, -3], [3, -3], [3, -1], [3, 1], [3, 3], [1, 3], [-1, 3], [-3, 3], [-3, 1], [-3, -1]];
    let sy = 3; let ri = 0;
    while (sy <= 38) { const o = ring[ri % ring.length]; setW(48 + o[0], sy, 48 + o[1], ID.stone_bricks); clearAbove(48 + o[0], 48 + o[1], sy + 1, 3); ri++; if (ri % 2 === 0) sy++; }
    // 입구 방(스폰)
    for (let x = 42; x <= 54; x++) for (let z = 80; z <= 92; z++) for (let y = 36; y <= 41; y++) setW(x, y, z, y === 36 ? ID.stone_bricks : 0);
    for (let z = 52; z <= 80; z++) { for (let dx = -1; dx <= 1; dx++) { setW(48 + dx, 36, z, ID.stone_bricks); clearAbove(48 + dx, z, 37, 4); } }
    [[44, 82], [52, 90], [48, 86]].forEach(p2 => setW(p2[0], 37, p2[1], ID.glowstone));
    buildWarpPads();
  }
  // 🕷️ 스파이더 덴 V6: 거미산 등반 던전 — 나선 등산로를 오르면 점점 강한 거미, 정상에 브루드마더
  function genSpiderDen() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(64, 64, 56, 14, { surf: ID.dirt });
    // 거대한 산(중앙, 정상 y≈42) — 4단 테라스 + 나선 등산로
    for (let x = 24; x <= 104; x++) for (let z = 24; z <= 104; z++) {
      const d = Math.hypot(x - 64, z - 64);
      if (d > 36) continue;
      const t = 1 - d / 36;
      const h = Math.round(t * t * (3 - 2 * t) * 28);
      const y0 = surfaceTop(x, z);
      for (let y = 0; y < h; y++) setW(x, y0 + y, z, hash3(x, 86, z) < 0.18 ? ID.wool_white : (hash3(x, 87, z) < 0.5 ? ID.stone : ID.cobblestone));
    }
    // 나선 등산로(2블록 폭, 완만하게 깎기)
    let ang = 0;
    for (let rr = 36; rr >= 4; rr -= 0.5) {
      ang += 0.16;
      const x = Math.round(64 + Math.cos(ang) * rr), z = Math.round(64 + Math.sin(ang) * rr);
      const want = 15 + Math.round((36 - rr) / 32 * 27);
      for (let o = -1; o <= 1; o++) for (let o2 = -1; o2 <= 1; o2++) {
        const px2 = x + o, pz2 = z + o2;
        for (let y = want + 1; y < want + 5; y++) setW(px2, y, pz2, 0);   // 머리 위 클리어
        if (getBlockLocal(px2, want, pz2) !== 0 || true) setW(px2, want, pz2, ID.cobblestone);
      }
      if (Math.round(rr * 2) % 10 === 0) setW(x, want + 1, z, ID.glowstone);
    }
    // V18: 정상 브루드마더 둥지 — 거미줄 플랫폼 + 거미줄 천막(4기둥→돔) + 알집 + 중앙 옥좌
    const ty = surfaceTop(64, 64);
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      if (Math.hypot(dx, dz) < 6.5) setW(64 + dx, ty - 1, 64 + dz, hash3(dx, 88, dz) < 0.55 ? ID.wool_white : ID.cobblestone);
    }
    // 거미줄 천막: 네 모서리 기둥 + 위로 수렴하는 줄(양털)
    const webFence = ID.spruce_fence;
    for (const [ox, oz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
      for (let y = 0; y < 6; y++) setW(64 + ox, ty + y, 64 + oz, webFence != null ? webFence : ID.wool_white);
      // 대각선 거미줄 스트랜드(기둥→중앙 상단)
      for (let s = 1; s <= 4; s++) setW(64 + Math.round(ox * (1 - s / 5)), ty + 5 + Math.round(s * 0.4), 64 + Math.round(oz * (1 - s / 5)), ID.wool_white);
    }
    // 천막 지붕(거미줄 캐노피)
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (Math.hypot(dx, dz) < 4.5) setW(64 + dx, ty + 7, 64 + dz, ID.wool_white);
    // 알집(양털 뭉치 + 발광) 산발
    for (const [ox, oz] of [[3, 0], [-3, 1], [0, 3], [1, -3]]) { setW(64 + ox, ty, 64 + oz, ID.wool_white); setW(64 + ox, ty + 1, 64 + oz, hash3(ox, 90, oz) < 0.4 ? ID.glowstone : ID.wool_white); }
    // 중앙 브루드 옥좌(흑요석 대 + 발광 코어)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(64 + dx, ty, 64 + dz, ID.obsidian);
    setW(64, ty + 1, 64, ID.magma_block); setW(64, ty + 2, 64, ID.glowstone);
    // 죽은 나무 + 거미줄(산기슭)
    for (let i = 0; i < 22; i++) {
      const x = 16 + Math.floor(hash3(i, 81, 1) * 96), z = 14 + Math.floor(hash3(i, 82, 2) * 88);
      if (Math.hypot(x - 64, z - 64) > 52 || Math.hypot(x - 64, z - 64) < 38) continue;
      const y = surfaceTop(x, z), th = 3 + Math.floor(hash3(i, 83, 3) * 4);
      for (let j = 0; j < th; j++) setW(x, y + j, z, ID.spruce_log);
      if (hash3(i, 84, 4) < 0.5) setW(x, y + th, z, ID.wool_white);
    }
    // 할머니의 집(산 중턱)
    buildHouse(88, 78, 7, 6, surfaceTop(91, 81), ID.oak_planks, ID.dark_oak_log);
    // 자갈 광산(남서 저지대)
    for (let dx = -10; dx <= 10; dx++) for (let dz = -8; dz <= 8; dz++) {
      if (Math.hypot(dx, dz) < 9) { const y = surfaceTop(40 + dx, 96 + dz) - 1; if (hash3(dx, 89, dz) < 0.6) setW(40 + dx, y, 96 + dz, ID.gravel); }
    }
    // 아라크네 성소(북동 — 붉은 제단 링)
    for (let a = 0; a < 10; a++) {
      const x = 96 + Math.round(Math.cos(a / 10 * Math.PI * 2) * 6), z = 40 + Math.round(Math.sin(a / 10 * Math.PI * 2) * 6);
      const y = surfaceTop(x, z);
      setW(x, y, z, ID.nether_bricks); if (a % 3 === 0) setW(x, y + 1, z, ID.glowstone);
    }
    buildWarpPads();
  }
  // 🔥 블레이징 포트리스 V6: 던전 컨셉 — 용암 바다 위 붉은 요새(복도망·블레이즈 첨탑·위더 홀·마그마 분지)
  function genNether() {
    world = new Uint8Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) for (let y = 2; y <= SEA - 1; y++) setW(x, y, z, ID.lava);   // 용암 바다
    genBlobIsland(64, 64, 54, 16, { surf: ID.netherrack, sub: ID.netherrack, fill: ID.netherrack });
    for (let i = 0; i < 70; i++) {   // 소울샌드/마그마 패치
      const x = 20 + Math.floor(hash3(i, 91, 1) * 88), z = 20 + Math.floor(hash3(i, 92, 2) * 88);
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) === ID.netherrack) setW(x, y, z, hash3(i, 93, 3) < 0.6 ? ID.soul_sand : ID.magma_block);
    }
    // 요새 복도망(십자 + 외곽 회랑 — 벽 있는 진짜 던전 복도)
    function corridor(x0, z0, x1, z1) {
      const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
      let x = x0, z = z0, _guard = 0;
      while (_guard++ < 4096) {   // V12: 무한루프 방지(비축정렬 인자 대비)
        for (let o = -2; o <= 2; o++) {
          const px2 = dx !== 0 ? x : x + o, pz2 = dx !== 0 ? z + o : z;
          const wall = Math.abs(o) === 2;
          setW(px2, 20, pz2, ID.nether_bricks);
          for (let y = 21; y <= 24; y++) setW(px2, y, pz2, wall && (x + z) % 3 !== 0 ? ID.nether_bricks : 0);
          // V18: 벽 위 크레넬(톱니) + 마그마 발광 띠
          if (wall) { setW(px2, 25, pz2, (x + z) % 2 === 0 ? ID.nether_bricks : 0); if ((x + z) % 6 === 0) setW(px2, 22, pz2, ID.magma_block); }
        }
        if ((x + z) % 9 === 0) { const lx = dx !== 0 ? x : x + 2, lz = dx !== 0 ? z + 2 : z; setW(lx, 24, lz, ID.glowstone); }
        // V18: 소울 등잔 기둥(울타리+발광) — 복도 벽 옆
        if ((x + z) % 11 === 0) { const lx = dx !== 0 ? x : x + 2, lz = dx !== 0 ? z + 2 : z; setW(lx, 21, lz, ID.soul_sand); setW(lx, 22, lz, ID.glowstone); }
        if (x === x1 && z === z1) break;
        x += dx; z += dz;
      }
    }
    corridor(20, 64, 108, 64); corridor(64, 20, 64, 108);
    corridor(30, 30, 98, 30); corridor(30, 98, 98, 98); corridor(30, 30, 30, 98); corridor(98, 30, 98, 98);
    // 블레이즈 첨탑 2기(꼭대기 스폰장)
    [[40, 40], [88, 88]].forEach(t => {
      for (let y = 20; y <= 32; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        if (Math.abs(dx) + Math.abs(dz) <= 5) setW(t[0] + dx, y, t[1] + dz, edge && y < 32 ? ID.nether_bricks : (y === 32 ? ID.nether_bricks : 0));
      }
      setW(t[0], 33, t[1], ID.glowstone);
      for (let y = 21; y <= 31; y += 2) { setW(t[0] + 3, y, t[1], 0); setW(t[0] + 2, y, t[1], ID.nether_bricks); }   // 오르는 계단 홈
    });
    // 위더 홀(중앙 북쪽 대형 방)
    for (let x = 52; x <= 76; x++) for (let z = 34; z <= 52; z++) {
      setW(x, 20, z, ID.nether_bricks);
      for (let y = 21; y <= 26; y++) setW(x, y, z, (x === 52 || x === 76 || z === 34 || z === 52) ? ID.nether_bricks : 0);
      setW(x, 27, z, ID.nether_bricks);
    }
    for (let o = -1; o <= 1; o++) for (let y = 21; y <= 23; y++) setW(64 + o, y, 52, 0);   // 남쪽 문
    [[56, 26, 38], [72, 26, 48], [64, 26, 42]].forEach(p2 => setW(p2[0], p2[1], p2[2], ID.glowstone));
    buildWarpPads();
  }
  // 🌌 디 엔드 V6: 중앙이 깊게 뚫린 심연 — 나선 미로 발판을 타고 내려가면 거대한 드래곤 둥지(실제 Dragon's Nest)
  function genEnd() {
    world = new Uint8Array(W * H * Dp);
    // 두꺼운 엔드스톤 원반(상판 y30, 바닥 y3)
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      let d = Math.hypot(x - 64, z - 64) / 56;
      d += (hash3(x, 7, z) - 0.5) * 0.12;
      if (d >= 1) continue;
      const bottom = d < 0.75 ? 3 : Math.round(3 + (d - 0.75) * 60);
      for (let y = bottom; y <= 30; y++) setW(x, y, z, ID.end_stone);
    }
    // 드래곤 둥지: 최하부 대형 공동(y5~14, 반경 30)
    for (let x = 24; x <= 104; x++) for (let z = 24; z <= 104; z++) {
      const d = Math.hypot(x - 64, z - 64);
      if (d < 30 + (hash3(x, 95, z) - 0.5) * 4) for (let y = 5; y <= 14; y++) setW(x, y, z, 0);
    }
    // 둥지 바닥 장식: 흑요석 + 엔드 벽돌 둥지 링 + 중앙 제단
    for (let x = 34; x <= 94; x++) for (let z = 34; z <= 94; z++) {
      const d = Math.hypot(x - 64, z - 64);
      if (d < 30 && getBlockLocal(x, 4, z) === ID.end_stone) {
        if (hash3(x, 96, z) < 0.15) setW(x, 4, z, ID.obsidian);
        else if (d > 24 && d < 28) setW(x, 4, z, ID.end_bricks);
      }
    }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { if (Math.abs(dx) + Math.abs(dz) <= 4) setW(64 + dx, 5, 64 + dz, ID.end_bricks); }
    setW(64, 6, 64, ID.obsidian); setW(64, 7, 64, ID.glowstone);
    [[44, 6, 44], [84, 6, 84], [44, 6, 84], [84, 6, 44], [64, 6, 38], [64, 6, 90]].forEach(p2 => setW(p2[0], p2[1], p2[2], ID.glowstone));
    // 중앙 심연(수직 구멍 y15~31, 반경 13) + 나선 미로 발판(내려가는 길, 곁가지 포함)
    for (let x = 48; x <= 80; x++) for (let z = 48; z <= 80; z++) {
      const d = Math.hypot(x - 64, z - 64);
      if (d < 13 + (hash3(x, 97, z) - 0.5) * 2) for (let y = 15; y <= 31; y++) setW(x, y, z, 0);
    }
    let ang = 0;
    for (let y = 29; y >= 14; y--) {
      for (let k = 0; k < 5; k++) {   // 나선 발판 띠
        const rr = 11.5;
        const x = Math.round(64 + Math.cos(ang + k * 0.09) * rr), z = Math.round(64 + Math.sin(ang + k * 0.09) * rr);
        setW(x, y, z, ID.end_bricks);
        for (let cy = y + 1; cy <= y + 3; cy++) setW(x, cy, z, 0);
      }
      // 곁가지(미로 감성: 막다른 보물 발판)
      if (y % 4 === 0) {
        const bx = Math.round(64 + Math.cos(ang + 1.2) * 9), bz = Math.round(64 + Math.sin(ang + 1.2) * 9);
        setW(bx, y, bz, ID.purpur); setW(bx, y + 1, bz, 0); setW(bx, y + 2, bz, 0);
      }
      ang += 0.55;
    }
    // 상판: 흑요석 기둥 8기 + 젤롯 구덩이
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const x = 64 + Math.round(Math.cos(a) * 38), z = 64 + Math.round(Math.sin(a) * 38);
      const hgt = 8 + Math.floor(hash3(i, 98, 1) * 8), y0 = surfaceTop(x, z);
      for (let y = 0; y < hgt; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) < 2) setW(x + dx, y0 + y, z + dz, ID.obsidian);
      }
      // V18: 실제 엔드 크리스탈 — 흑요석 대(3×3) 위 자수정 받침 + 발광 코어 + 자수정 뿔
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(x + dx, y0 + hgt, z + dz, ID.obsidian);
      setW(x, y0 + hgt + 1, z, ID.purpur);
      setW(x, y0 + hgt + 2, z, ID.glowstone);                                   // 크리스탈 코어
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setW(x + ox, y0 + hgt + 2, z + oz, ID.purpur);   // 뿔
      setW(x, y0 + hgt + 3, z, ID.purpur);
    }
    // 보이드 세펄처(남쪽 엔드 벽돌 첨탑)
    const vy = surfaceTop(64, 98);
    for (let y2 = vy; y2 < vy + 12; y2++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (Math.abs(dx) + Math.abs(dz) <= 3) setW(64 + dx, y2, 98 + dz, edge ? ID.end_bricks : 0);
    }
    setW(64, vy + 12, 98, ID.glowstone);
    buildWarpPads();
  }
  // 🍄 버섯 사막 V6: 서쪽 균사체 버섯 숲 + 동쪽 사막(실제 Mushroom Desert 반반 구성)
  function genMushroom() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(72, 72, 62, 15, {});
    // 반반 표면: 서쪽 균사체 / 동쪽 사막
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const y = surfaceTop(x, z) - 1;
      if (y < 5) continue;
      if (getBlockLocal(x, y, z) !== ID.grass) continue;
      const desertT = (x - 72) / 20 + (hash3(x, 101, z) - 0.5) * 1.2;
      if (desertT > 0) { setW(x, y, z, ID.sand); if (hash3(x, 102, z) < 0.03) setW(x, y + 1, z, ID.tall_grass); }
      else setW(x, y, z, ID.mycelium);
    }
    // 거대 버섯(빨강/갈색)
    for (let i = 0; i < 16; i++) {
      const x = 20 + Math.floor(hash3(i, 103, 1) * 50), z = 22 + Math.floor(hash3(i, 104, 2) * 96);
      if (Math.hypot(x - 72, z - 72) > 54 || Math.hypot(x - 72, z - 120) < 12) continue;
      const y0 = surfaceTop(x, z), th = 4 + Math.floor(hash3(i, 105, 3) * 3);
      const red = hash3(i, 106, 4) < 0.6;
      for (let j = 0; j < th; j++) setW(x, y0 + j, z, ID.mushroom_stem);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= 3) setW(x + dx, y0 + th, z + dz, red ? ID.mushroom_red_block : ID.mushroom_brown_block);
        if (red && Math.abs(dx) + Math.abs(dz) <= 1) setW(x + dx, y0 + th + 1, z + dz, ID.mushroom_red_block);
      }
    }
    // 사막 사탕수수 오아시스
    for (let dx = -4; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.hypot(dx, dz) < 3.2) { const y = surfaceTop(104 + dx, 72 + dz) - 1; setW(104 + dx, y, 72 + dz, ID.water); }
    }
    for (let a = 0; a < 10; a++) {
      const x = 104 + Math.round(Math.cos(a) * 5), z = 72 + Math.round(Math.sin(a) * 5);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.sand) { setW(x, y, z, ID.sugar_cane); setW(x, y + 1, z, ID.sugar_cane); }
    }
    buildWarpPads();
  }

  // 워프 패드 지형(흑요석 링 + 글로우스톤 심)
  function buildWarpPads() {
    const list = WARPS[worldMode] || [];
    for (const wp of list) {
      const y = surfaceTop(wp.x, wp.z) - 1;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(wp.x + dx, y, wp.z + dz, (dx === 0 && dz === 0) ? ID.glowstone : ID.obsidian);
      clearAbove(wp.x, wp.z, y + 1, 4);
      wp._y = y + 1;
    }
  }
  const WARP_REQ = {
    gold: { sk: 'mining', lv: 1, name: '채광' }, deep: { sk: 'mining', lv: 5, name: '채광' },
    park: { sk: 'foraging', lv: 1, name: '벌목' }, barn: { sk: 'farming', lv: 1, name: '농사' },
    mushroom: { sk: 'farming', lv: 2, name: '농사' }, spider: { sk: 'combat', lv: 1, name: '전투' },
    nether: { sk: 'combat', lv: 5, name: '전투' }, end: { sk: 'combat', lv: 12, name: '전투' },
  };
  // 아라크네 소환: 크리스탈 4개를 성소에 설치(실제 방식)
  function tryArachneSummon(t) {
    const api = econApi();
    if (mobs.some(m => m.type === 'arachne' && !m.dead)) { if (typeof toast === 'function') toast('아라크네가 이미 깨어 있어요!', false); return; }
    if (!api.consumeItems || !api.consumeItems('arachne_crystal', 4)) {
      if (typeof toast === 'function') toast('아라크네 크리스탈 4개가 필요해요 (타란튤라 버민/자갈 스켈레톤 드롭)', false);
      return;
    }
    const mob = spawnMob({ x: 96, z: 40, r: 4, world: 'spider' }, 'arachne', 60);
    if (mob) { mob.state = 'chase'; if (typeof toast === 'function') toast('🕷️ 크리스탈 4개가 공명한다... 아라크네가 깨어났다!!', false); }
  }
  function warpTo(dest) {
    if (!WORLD_DEFS[dest]) return;
    const req = WARP_REQ[dest];
    const api = econApi();
    if (req && api.skillLv && api.skillLv(req.sk) < req.lv) {
      if (typeof toast === 'function') toast(`🔒 ${WORLD_DEFS[dest].name}은(는) ${req.name} 스킬 ${req.lv}레벨부터! (실제 스카이블럭 해금 조건)`, false);
      warpCharge = null;
      return;
    }
    if (typeof toast === 'function') toast(`🚀 ${WORLD_DEFS[dest].name}(으)로 워프!`, true);
    P.vy = 13;   // 슈퍼 점프 연출
    warpCharge = null;
    setTimeout(() => { if (running) travelTo(dest); }, 420);
  }
  function tickWarpPads(dt) {
    const list = WARPS[worldMode] || [];
    for (const wp of list) {
      if (Math.abs(P.x - (wp.x + 0.5)) < 1.2 && Math.abs(P.z - (wp.z + 0.5)) < 1.2 && Math.abs(P.y - wp._y) < 1.5) {
        if (!warpCharge || warpCharge.dest !== wp.dest) warpCharge = { dest: wp.dest, t: 0 };
        warpCharge.t += dt;
        const cross = document.getElementById('econ3dCross');
        if (cross) cross.textContent = '🚀' + Math.ceil(0.9 - warpCharge.t) ;
        if (warpCharge.t >= 0.9) warpTo(wp.dest);
        return;
      }
    }
    if (warpCharge) { warpCharge = null; const cross = document.getElementById('econ3dCross'); if (cross && !fishing && !breaking) cross.textContent = '+'; }
  }

  /* ---------------- 3D 카타콤 던전: 직접 돌아다니며 몬스터를 잡고 보스까지 ---------------- */
  let dungeonState = null;   // {floor, fd, rooms:[{x0,x1,gateX,kills,need,cleared}], t0, deaths, kills, bossSpawned}
  function genDungeon() {
    world = new Uint8Array(W * H * Dp);
    const ROOM_W = 22, ROOMS = 5;
    // 바닥/외벽(개방형 천장 — 카타콤 폐허 분위기, 하늘은 자정 고정)
    for (let x = 0; x < W; x++) for (let z = 8; z < 40; z++) setW(x, 2, z, ID.stone_bricks);
    const wallTo = 9;
    for (let x = 0; x < W; x++) for (let y = 3; y <= wallTo; y++) { setW(x, y, 8, ID.stone_bricks); setW(x, y, 39, ID.stone_bricks); }
    for (let y = 3; y <= wallTo; y++) for (let z = 8; z < 40; z++) { setW(0, y, z, ID.stone_bricks); setW(W - 1, y, z, ID.stone_bricks); }
    // 방 구분 게이트 벽(중앙 2×3 흑요석 게이트 — 방 클리어 시 개방)
    for (let i = 1; i <= ROOMS; i++) {
      const gx = i * ROOM_W;
      for (let y = 3; y <= wallTo; y++) for (let z = 8; z < 40; z++) setW(gx, y, z, ID.stone_bricks);
      for (let y = 3; y <= 5; y++) for (let z = 22; z <= 25; z++) setW(gx, y, z, ID.obsidian);   // 게이트
    }
    // 조명 + 폐허 기둥
    for (let i = 0; i <= ROOMS; i++) {
      const cx = i * ROOM_W + 11;
      [[cx - 6, 14], [cx + 6, 14], [cx - 6, 33], [cx + 6, 33]].forEach(p2 => {
        if (p2[0] > 1 && p2[0] < W - 1) { for (let y = 3; y <= 5; y++) setW(p2[0], y, p2[1], ID.stone_bricks); setW(p2[0], 6, p2[1], ID.glowstone); }
      });
    }
    buildWarpPads();
  }
  function startDungeon3d(floor, master) {
    if (!running || !scene) return false;
    const api = econApi();
    if (api.hasActiveEncounter && api.hasActiveEncounter()) return false;
    if (api.canEnterFloor && !api.canEnterFloor(floor)) { if (typeof toast === 'function') toast('이전 층을 먼저 클리어하세요', false); return true; }
    const fd = api.dungeonFloorInfo ? api.dungeonFloorInfo(floor) : null;
    if (!fd) return false;
    const MM = window.ECON_DATA.MASTER_MODE;
    const isHell = !!fd.hell;   // V11: 지옥층(M8~M10) — 자체 배율, 마스터 토글 무시
    if (isHell) master = false;
    if (master && !(api.canEnterFloor && api.canEnterFloor(MM.unlockFloor + 1))) { if (typeof toast === 'function') toast('☠ 마스터 모드는 F7 클리어 후 해금!', false); return true; }
    const hellMul = isHell ? [3, 6, 12][Math.min(2, floor - 8)] : 1;
    dungeonState = { floor, fd, rooms: [], t0: performance.now(), deaths: 0, kills: 0, bossSpawned: false, done: false, master: !!master, hell: isHell };
    hidePanel();
    travelTo('dungeon', true);
    // 방 5개: 몬스터 배치(방마다 4마리, 층 몹 이름/스탯)
    const ROOM_W = 22;
    for (let i = 0; i < 5; i++) {
      const room = { x0: i * ROOM_W + 2, x1: (i + 1) * ROOM_W - 2, gateX: (i + 1) * ROOM_W, kills: 0, need: 4, cleared: false };
      dungeonState.rooms.push(room);
      // V9: 방마다 숨겨진 시크릿 상자 1개(구석 — 찾으면 점수+정수+북 확률)
      const sx = Math.random() < 0.5 ? room.x0 + 1 : room.x1 - 1, sz = Math.random() < 0.5 ? 10 : 37;
      setW(sx, 3, sz, ID.oak_planks); setW(sx, 4, sz, ID.glowstone);
      markBlockDirty(sx, sz);
      dynamicInteractables.push({ type: 'dgSecret', ref: { room: i, done: false }, x: sx + 0.5, y: 4, z: sz + 0.5 });
      for (let k = 0; k < room.need; k++) {
        // V8: 층별 던전 몹 15종 풀에서 랜덤(총 105종) — 방마다 조합이 다르다
        const typeKey = `dg_f${Math.min(7, Math.max(1, floor))}_${Math.floor(Math.random() * 15)}`;   // V11: 지옥층은 F7 풀 재사용
        const area = { x: room.x0 + 4 + Math.random() * (room.x1 - room.x0 - 8), z: 14 + Math.random() * 20, r: 3, world: 'dungeon' };
        let def0 = MOB_TYPES[typeKey];
        if (floor === 0) def0 = Object.assign({}, def0, { hp: Math.round(def0.hp * 0.4), dmg: Math.round(def0.dmg * 0.5), name: def0.name.replace(/F\d+/, 'F0') });
        if (master) def0 = Object.assign({}, def0, { name: '☠ ' + def0.name.replace('F' + floor, 'M' + floor), hp: Math.round(def0.hp * MM.hpMul), dmg: Math.round(def0.dmg * MM.dmgMul) });
        if (isHell) def0 = Object.assign({}, def0, { name: '☠☠ ' + def0.name.replace('F7', 'M' + floor), hp: Math.round(def0.hp * hellMul), dmg: Math.round(def0.dmg * hellMul * 0.6) });   // V11
        const mobLv = isHell ? [65, 80, 95][Math.min(2, floor - 8)] + Math.floor(Math.random() * 5) : floor * 4 + 1 + Math.floor(Math.random() * 4);
        const mob = spawnMob(area, typeKey, mobLv, (floor === 0 || master || isHell) ? def0 : null);
        if (mob) mob.dungeonRoom = i;
      }
    }
    if (typeof toast === 'function') toast(`🗝️ 카타콤 ${floor}층 입장! 몬스터를 모두 잡아 게이트를 열고 보스까지 전진하세요`, true);
    return true;
  }
  function spawnDungeonMob(opt) {
    const def = { name: opt.name, kind: opt.kind || 'humanoid', color: opt.color || 0x3a7d3a, hp: opt.hp, dmg: opt.dmg, xp: 10 + opt.lv, coins: 8 + opt.lv, speed: 2.0, drops: [{ key: 'dungeon_essence', n: 1, chance: 0.25 }], tierCap: Math.min(6, dungeonState ? dungeonState.floor : 2) };
    const area = { x: opt.x, z: opt.z, r: 6, world: 'dungeon' };
    const mob = spawnMob(area, '_custom', opt.lv, def);
    if (mob) { mob.dungeonRoom = opt.roomIdx; mob.isBoss = !!opt.isBoss; }
    return mob;
  }
  function onDungeonMobDead(m) {
    if (!dungeonState || dungeonState.done) return;
    dungeonState.kills++;
    if (m.isBoss) {
      dungeonState.done = true;
      const api = econApi();
      const grade = api.dungeonComplete ? api.dungeonComplete(dungeonState.floor, { timeSec: (performance.now() - dungeonState.t0) / 1000, deaths: dungeonState.deaths, kills: dungeonState.kills }) : null;
      const n = window.econNet;
      if (n && n.party() && n.party().role === 'host') n.partyEnd({ floor: dungeonState.floor, grade: grade || 'C' });
      setTimeout(() => { if (running) { dungeonState = null; travelTo('hub'); } }, 1500);
      return;
    }
    if (m.dungeonRoom == null) return;
    const room = dungeonState.rooms[m.dungeonRoom];
    if (!room || room.cleared) return;
    room.kills++;
    if (room.kills >= room.need) {
      room.cleared = true;
      for (let y = 3; y <= 5; y++) for (let z = 22; z <= 25; z++) setW(room.gateX, y, z, 0);   // 게이트 개방
      markBlockDirty(room.gateX, 22); markBlockDirty(room.gateX, 25);
      if (typeof toast === 'function') toast(`⚔️ ${m.dungeonRoom + 1}번 방 클리어! 게이트가 열렸다`, true);
      // 마지막 방이면 보스 소환
      if (m.dungeonRoom === dungeonState.rooms.length - 1 && !dungeonState.bossSpawned) {
        dungeonState.bossSpawned = true;
        const fd = dungeonState.fd;
        const mmul = dungeonState.master ? window.ECON_DATA.MASTER_MODE : null;
        const boss = spawnDungeonMob({ name: (mmul ? '☠ ' : '') + fd.bossName, hp: Math.round(fd.bossHp * (mmul ? mmul.hpMul : 1)), dmg: Math.round(fd.bossDmg * (mmul ? mmul.dmgMul : 1)), lv: Math.max(1, dungeonState.floor) * 10, x: 122, z: 24, color: 0x6a1a8a, isBoss: true });
        if (boss) { boss.mesh.scale.multiplyScalar(1.8); drawMobLabel(boss); }
        if (typeof toast === 'function') toast(`👹 ${fd.bossName}이(가) 깨어났다!`, false);
      }
    }
  }
  /* ---- 3D 협동 던전(멀티): 호스트 권위 몹 동기화 ---- */
  let partyGuestMode = false;   // 게스트: 몹은 호스트 스냅샷의 "고스트"
  let _mobSyncT = 0;
  function guestEnterDungeon(floor) {
    if (!running || !scene) return false;
    const api = econApi();
    const fd = api.dungeonFloorInfo ? api.dungeonFloorInfo(floor) : null;
    if (!fd) return false;
    dungeonState = { floor, fd, rooms: [], t0: performance.now(), deaths: 0, kills: 0, bossSpawned: false, done: false, guest: true };
    partyGuestMode = true;
    hidePanel();
    travelTo('dungeon', true);   // 던전 지형은 결정적 생성 — 호스트와 동일한 맵
    if (typeof toast === 'function') toast(`🗝️ 파티 던전 ${floor}층 합류! 호스트와 함께 싸우세요`, true);
    return true;
  }
  function mobSnapshotNet() {
    return {
      mobs: mobs.map((m, i) => ({
        i, x: +m.mesh.position.x.toFixed(1), y: +m.mesh.position.y.toFixed(1), z: +m.mesh.position.z.toFixed(1),
        hp: Math.round(m.hp), mx: m.maxHp, nm: m.def.name, lv: m.lv, b: m.isBoss ? 1 : 0,
      })),
      gates: dungeonState ? dungeonState.rooms.map(r => r.cleared ? 1 : 0) : [],
    };
  }
  function applyPartyMobs(snap) {
    if (!partyGuestMode || worldMode !== 'dungeon' || !snap) return;
    const seen = new Set();
    for (const sm of snap.mobs || []) {
      seen.add(sm.i);
      let m = mobs.find(x => x.netId === sm.i);
      if (!m) {
        m = spawnDungeonMob({ name: sm.nm, hp: sm.mx, dmg: 0, lv: sm.lv, x: sm.x, z: sm.z, isBoss: !!sm.b });
        if (!m) continue;
        m.netId = sm.i; m.ghost = true;
        if (sm.b) { m.mesh.scale.multiplyScalar(1.8); }
      }
      m.tx3 = sm.x; m.ty3 = sm.y; m.tz3 = sm.z;
      if (m.hp !== sm.hp) { m.hp = sm.hp; m.maxHp = sm.mx; drawMobLabel(m); }
      if (sm.hp <= 0) { m.dead = true; scene.remove(m.mesh); disposeGroup(m.mesh); mobs.splice(mobs.indexOf(m), 1); }
    }
    for (let i = mobs.length - 1; i >= 0; i--) {   // 스냅샷에 없는 고스트 제거(처치됨)
      const m = mobs[i];
      if (m.ghost && !seen.has(m.netId)) { scene.remove(m.mesh); disposeGroup(m.mesh); mobs.splice(i, 1); }
    }
    // 게이트 개방 동기화
    if (dungeonState && snap.gates) {
      snap.gates.forEach((cleared, i) => {
        if (!cleared || dungeonState._gatesOpen && dungeonState._gatesOpen[i]) return;
        dungeonState._gatesOpen = dungeonState._gatesOpen || {};
        dungeonState._gatesOpen[i] = true;
        const gx = (i + 1) * 22;
        for (let y = 3; y <= 5; y++) for (let z = 22; z <= 25; z++) setW(gx, y, z, 0);
        markBlockDirty(gx, 22); markBlockDirty(gx, 25);
      });
    }
  }
  function applyPartyAttack(i, dmg) {   // 호스트: 게스트의 공격 적용
    if (worldMode !== 'dungeon') return;
    const m = mobs[i];
    if (!m || m.dead) return;
    m.hp -= Math.max(0, dmg);
    spawnDmgText(m.mesh.position, dmg, false);
    m.state = 'chase';
    if (m.hp <= 0) {
      m.dead = true;
      scene.remove(m.mesh); disposeGroup(m.mesh);
      mobs.splice(mobs.indexOf(m), 1);
      if (typeof toast === 'function') toast('⚔️ 파티원이 몬스터를 처치!', true);
      onDungeonMobDead(m);
    } else drawMobLabel(m);
  }
  function tickPartyDungeonSync(dt) {
    const n = window.econNet; if (!n || !n.isActive()) return;
    const pt = n.party(); if (!pt) return;
    if (worldMode !== 'dungeon') return;
    if (pt.role === 'host' && dungeonState && !dungeonState.guest) {
      _mobSyncT += dt;
      if (_mobSyncT > 0.25) { _mobSyncT = 0; n.partySendMobs(mobSnapshotNet()); }
    }
  }
  window.economy3dDungeonGuest = floor => { try { return guestEnterDungeon(floor); } catch (e) { console.error('econ3d guest dungeon', e); return false; } };
  window.economy3dApplyPartyMobs = applyPartyMobs;
  window.economy3dApplyPartyAttack = applyPartyAttack;
  window.economy3dPartyDungeonEnded = () => { if (running && worldMode === 'dungeon') { dungeonState = null; partyGuestMode = false; setTimeout(() => { if (running) travelTo('hub'); }, 1200); } };

  window.economy3dDungeon = (floor, master) => { try { return startDungeon3d(floor, master); } catch (e) { console.error('econ3d dungeon', e); return false; } };

  /* ---------------- 텍스처 아틀라스 ---------------- */
  function px(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
  function rngFrom(n) { let s = (n >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  function oreTex(c, ox, oy, r, ore) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); px(c, ox + x, oy + y, t < 0.33 ? '#727272' : t < 0.66 ? '#7e7e7e' : '#8a8a8a'); }
    for (let i = 0; i < 6; i++) { const x = 2 + ((hash3(i, 1, 0) * 11) | 0), y = 2 + ((hash3(i, 2, 0) * 11) | 0); c.fillStyle = ore; c.fillRect(ox + x, oy + y, 3, 3); }
  }
  function paintTile(c, ox, oy, name) {
    const r = rngFrom(hashStr(name) >>> 0);
    function f(x, y, col) { px(c, ox + x, oy + y, col); }
    function fillNoise(p0, p1, p2) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? p1 : t < 0.66 ? p0 : p2); } }
    function hx(hex, fac) { const n = parseInt(hex.slice(1), 16); const R = Math.min(255, ((n >> 16 & 255) * fac) | 0), G = Math.min(255, ((n >> 8 & 255) * fac) | 0), Bc = Math.min(255, ((n & 255) * fac) | 0); return '#' + (0x1000000 + (R << 16) + (G << 8) + Bc).toString(16).slice(1); }
    // V15: 16색 양털/콘크리트/테라코타 — DYE_HEX 기반 절차 텍스처
    if (DYE_HEX[name] !== undefined) {
      const base = DYE_HEX[name];
      if (name.indexOf('concrete_') === 0) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.72 ? base : (r() < 0.5 ? hx(base, 0.95) : hx(base, 1.04))); }
      else if (name.indexOf('terracotta_') === 0) { const t0 = hx(base, 0.78), t1 = hx(base, 0.62), t2 = hx(base, 0.9); fillNoise(t0, t1, t2); for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) f(x, y, hx(base, 0.55)); }
      else { fillNoise(base, hx(base, 0.9), hx(base, 1.08)); for (let i = 0; i < 6; i++) f((r() * 16) | 0, (r() * 16) | 0, hx(base, 0.82)); }
      return;
    }
    switch (name) {
      case 'smooth_stone': fillNoise('#9a9a9a', '#8f8f8f', '#a6a6a6'); break;
      case 'polished_andesite': fillNoise('#a2a4a2', '#989a98', '#adafad'); break;
      case 'chiseled_stone_bricks': { fillNoise('#7b7b7b', '#6f6f6f', '#868686'); c.strokeStyle = '#5a5a5a'; c.strokeRect(ox + 3.5, oy + 2.5, 9, 11); c.fillStyle = '#5a5a5a'; c.fillRect(ox + 7, oy + 4, 2, 8); break; }
      case 'mossy_cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.22 ? '#4a5a3a' : t < 0.45 ? '#5a5a5a' : t < 0.72 ? '#7d7d7d' : '#6a7a52'); } break;
      case 'prismarine': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#4f9a8e' : t < 0.6 ? '#5aad9e' : t < 0.85 ? '#66c2b4' : '#7ad0c2'); } break;
      case 'bookshelf': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); for (let bx = 0; bx < 16; bx += 3) { const col = ['#b23b2e', '#2e6ab2', '#2e9a4a', '#c8a02a', '#8a4fb2'][(r() * 5) | 0]; for (let y = 2; y < 14; y++) if ((y >> 2) % 2 === 0) c.fillStyle = col, c.fillRect(ox + bx, oy + y, 2, 1); } break; }
      case 'hay_top': { fillNoise('#c8a83a', '#b89830', '#d8b84a'); c.strokeStyle = '#8a6f20'; c.strokeRect(ox + 0.5, oy + 0.5, 15, 15); break; }
      case 'hay_side': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, (y % 5 === 4) ? '#8a6f20' : (r() < 0.5 ? '#c2a234' : '#d0b040')); } break;
      case 'stone': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.25 ? '#6f6f6f' : t < 0.5 ? '#787878' : t < 0.78 ? '#828282' : '#8c8c8c'); } break;
      case 'dirt': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.25 ? '#6e4c34' : t < 0.55 ? '#7d573c' : t < 0.82 ? '#8a6044' : '#976b4d'); } break;
      case 'grass_top': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5b9142' : t < 0.7 ? '#6aa84f' : '#7bbf5c'); } break;
      case 'grass_side': { fillNoise('#7d573c', '#6e4c34', '#8a6044'); for (let x = 0; x < 16; x++) { const gh = 3 + (r() < 0.33 ? 1 : 0); for (let y = 0; y < gh; y++) f(x, y, r() < 0.5 ? '#5b9142' : '#6aa84f'); } break; }
      case 'sand': fillNoise('#e0d6a0', '#d4c98e', '#ece2b0'); break;
      case 'sandstone': { fillNoise('#d9cda0', '#cabf90', '#e6dab0'); for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) f(x, y, '#bcb080'); break; }
      case 'cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, (hash3(x * 3, 0, y * 3) < 0.18) ? '#5a5a5a' : (r() < 0.5 ? '#7d7d7d' : '#919191')); break;
      case 'stonebrick': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#7b7b7b' : '#888')); } break;
      case 'bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#7a3527' : '#9a4f3f'); } break;
      case 'planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); if (y % 4 === 0) f(x, y, '#7a5f34'); } break;
      case 'birch_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#c8b787' : '#d8c99a'); if (y % 4 === 0) f(x, y, '#b0a074'); } break;
      case 'spruce_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#5b4226' : '#6b4f2e'); if (y % 4 === 0) f(x, y, '#4a3720'); } break;
      case 'dark_oak_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#3a2a16' : '#432f19'); if (y % 4 === 0) f(x, y, '#281b0e'); } break;
      case 'jungle_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#9a6a44' : '#a9784f'); if (y % 4 === 0) f(x, y, '#7a5232'); } break;
      case 'acacia_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#a85526' : '#b8622f'); if (y % 4 === 0) f(x, y, '#8a4018'); } break;
      case 'log_top': { fillNoise('#b59b6a', '#a78c5b', '#c4aa79'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#8a724a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'log_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#5b472d' : (r() < 0.5 ? '#6b5436' : '#7c6342')); break; }
      case 'birch_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.6 ? '#d7d3c8' : t < 0.85 ? '#e7e3d8' : '#c4c0b4'); } for (let i = 0; i < 5; i++) { const bx = (r() * 13) | 0, by = (r() * 14) | 0, bw = 2 + ((r() * 3) | 0); c.fillStyle = '#3a3a32'; c.fillRect(ox + bx, oy + by, bw, 1); } break; }
      case 'spruce_top': { fillNoise('#4a3722', '#3b2a18', '#5a4530'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#2e2012'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'spruce_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#2e2012' : (r() < 0.5 ? '#3b2a18' : '#4a3722')); break; }
      case 'leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.35 ? '#3f7a2e' : t < 0.7 ? '#4c8f38' : '#5aa042'); if (t > 0.92) f(x, y, '#16240e'); } break;
      case 'spruce_leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#233b23' : t < 0.72 ? '#2c4a2c' : '#375a37'); if (t > 0.93) f(x, y, '#101e10'); } break;
      case 'coal_ore': oreTex(c, ox, oy, r, '#26262a'); break;
      case 'iron_ore': oreTex(c, ox, oy, r, '#d8a282'); break;
      case 'gold_ore': oreTex(c, ox, oy, r, '#fbdb4b'); break;
      case 'lapis_ore': oreTex(c, ox, oy, r, '#1a44a5'); break;
      case 'redstone_ore': oreTex(c, ox, oy, r, '#e8323b'); break;
      case 'diamond_ore': oreTex(c, ox, oy, r, '#5decd5'); break;
      case 'emerald_ore': oreTex(c, ox, oy, r, '#17a94f'); break;
      case 'glass': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, '#bfe6f2'); c.fillStyle = '#dff2f9'; c.fillRect(ox, oy, 16, 1); c.fillRect(ox, oy, 1, 16); break; }
      case 'bedrock': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? '#3a3a3a' : t < 0.66 ? '#565656' : '#6b6b6b'); } break;
      case 'water': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#3463cf' : '#3a6ee0'); break;
      case 'lava': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#e8632a' : '#d2541f'); for (let i = 0; i < 5; i++) f((r() * 16) | 0, (r() * 16) | 0, '#f7a02a'); break; }
      case 'obsidian': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#120d1c' : t < 0.8 ? '#1a1326' : '#2a2040'); } break;
      case 'glow': { fillNoise('#c8a23f', '#b38e30', '#f4d35e'); for (let i = 0; i < 8; i++) f((r() * 16) | 0, (r() * 16) | 0, '#fff7cc'); break; }
      case 'farmland_top': { fillNoise('#5a3f28', '#4a3320', '#6a4d34'); c.fillStyle = '#3a2818'; for (let y = 2; y < 16; y += 4) c.fillRect(ox, oy + y, 16, 1); break; }
      case 'pumpkin_top': { fillNoise('#d6791f', '#c46c18', '#e8902f'); c.fillStyle = '#8a5012'; for (let i = 2; i <= 6; i += 2) c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); break; }
      case 'pumpkin_side': { fillNoise('#d6791f', '#c46c18', '#e8902f'); for (let y = 0; y < 16; y++) { f(3, y, '#a85f16'); f(7, y, '#a85f16'); f(12, y, '#a85f16'); } break; }
      case 'melon': { fillNoise('#4c8f46', '#3f7d3a', '#5aa050'); for (let y = 0; y < 16; y++) { f(2, y, '#a8c860'); f(6, y, '#a8c860'); f(10, y, '#a8c860'); f(14, y, '#a8c860'); } break; }
      case 'wheat_mature': { for (let x = 1; x < 16; x += 2) { const hh = 9 + ((r() * 4) | 0); const topY = 16 - hh; for (let y = topY; y < 16; y++) f(x, y, (y < topY + 4) ? (r() < 0.5 ? '#d8b23a' : '#e8c24a') : (r() < 0.5 ? '#8a7a2a' : '#a08a30')); } break; }
      case 'carrot_mature': { for (let x = 1; x < 16; x += 2) { const hh = 8 + ((r() * 3) | 0); for (let y = 16 - hh; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } for (let i = 0; i < 3; i++) { const x = 4 + i * 4; f(x, 15, '#e07b1f'); f(x, 14, '#d06a15'); } break; }
      case 'potato_mature': { for (let x = 1; x < 16; x += 2) { const hh = 8 + ((r() * 3) | 0); for (let y = 16 - hh; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } for (let i = 0; i < 3; i++) { const x = 4 + i * 4; f(x, 15, '#c8a25a'); f(x, 14, '#b8924a'); } break; }
      case 'sugar_cane': { for (let y = 0; y < 16; y++) { const col = (y % 5 === 0) ? '#7bbf5c' : (r() < 0.5 ? '#8fc36a' : '#a3d178'); f(7, y, col); f(8, y, col); } break; }
      case 'tall_grass': { for (let x = 1; x < 16; x += 2) { const h = 6 + ((r() * 7) | 0); const col = r() < 0.5 ? '#5b9142' : '#6aa84f'; for (let y = 16 - h; y < 16; y++) f(x, y, col); } break; }
      case 'flower_red': { for (let y = 7; y < 16; y++) f(8, y, '#3f7d3a'); c.fillStyle = '#d23b32'; c.fillRect(ox + 6, oy + 3, 5, 5); c.fillStyle = '#f0d33a'; c.fillRect(ox + 8, oy + 5, 1, 1); break; }
      case 'flower_yellow': { for (let y = 7; y < 16; y++) f(8, y, '#3f7d3a'); c.fillStyle = '#f0c829'; c.fillRect(ox + 6, oy + 3, 5, 5); c.fillStyle = '#8a5a18'; c.fillRect(ox + 8, oy + 5, 1, 1); break; }
      case 'dark_oak_top': { fillNoise('#3a2a18', '#2e2012', '#4a3620'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#241808'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'dark_oak_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#241808' : (r() < 0.5 ? '#31230f' : '#3d2c16')); break; }
      case 'dark_oak_leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#1d3a14' : t < 0.75 ? '#254a1a' : '#2f5a22'); if (t > 0.94) f(x, y, '#0c1c08'); } break;
      case 'jungle_top': { fillNoise('#9a7048', '#8a6038', '#aa8058'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#6a4828'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'jungle_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 4 === 0) ? '#5a3d20' : (r() < 0.5 ? '#6d4c2a' : '#7d5a34')); break; }
      case 'jungle_leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.35 ? '#2f8a24' : t < 0.7 ? '#3aa02e' : '#48b83a'); if (t > 0.93) f(x, y, '#123a0c'); } break;
      case 'acacia_top': { fillNoise('#a8552f', '#984a26', '#b86238'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#7a3a1c'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'acacia_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#5a5048' : (r() < 0.5 ? '#6a5e54' : '#786a5e')); break; }
      case 'acacia_leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#5a7a28' : t < 0.75 ? '#6a8a30' : '#7a9a3c'); if (t > 0.94) f(x, y, '#2a3a10'); } break;
      case 'netherrack': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5a1e1e' : t < 0.6 ? '#6e2626' : t < 0.85 ? '#7e2e2e' : '#8e3a3a'); } break;
      case 'soul_sand': { fillNoise('#4a3828', '#3e2e20', '#564232'); for (let i = 0; i < 4; i++) { const bx = 2 + ((r() * 11) | 0), by = 2 + ((r() * 11) | 0); c.fillStyle = '#2a1e12'; c.fillRect(ox + bx, oy + by, 3, 2); c.fillRect(ox + bx + 1, oy + by - 1, 1, 1); } break; }
      case 'nether_bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#1e0e10' : (r() < 0.5 ? '#2e1618' : '#3a1c1e')); } break;
      case 'end_stone': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#d5d79a' : t < 0.65 ? '#dddf9f' : '#e8eaac'); } break;
      case 'snow': fillNoise('#eef4f7', '#e2eaef', '#f8fcff'); break;
      case 'ice': { fillNoise('#8fc0e8', '#7ab2e0', '#a8d2f0'); c.fillStyle = '#c8e8f8'; c.fillRect(ox + 2, oy + 2, 4, 1); c.fillRect(ox + 9, oy + 8, 4, 1); break; }
      case 'mycelium_top': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#6a5a70' : t < 0.65 ? '#7a6a80' : '#8a7690'); } break;
      case 'mushroom_stem': fillNoise('#d5cfc2', '#c8c2b4', '#e2dcd0'); break;
      case 'mushroom_red': { fillNoise('#b02724', '#9e1f1c', '#c23330'); for (let i = 0; i < 4; i++) { const bx = 1 + ((r() * 11) | 0), by = 1 + ((r() * 11) | 0); c.fillStyle = '#f2efe4'; c.fillRect(ox + bx, oy + by, 3, 3); } break; }
      case 'mushroom_brown': fillNoise('#8a674a', '#7a5a3e', '#9a7656'); break;
      case 'gravel': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.28 ? '#6a655f' : t < 0.55 ? '#7d7873' : t < 0.82 ? '#8d8883' : '#9a9590'); } break;
      case 'end_bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#b8ba82' : (r() < 0.5 ? '#d5d79a' : '#e0e2a4')); } break;
      case 'purpur': { fillNoise('#a678a6', '#96689a', '#b688b2'); for (let i = 2; i <= 6; i += 4) { c.strokeStyle = '#84588a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'quartz': fillNoise('#ece6e0', '#e0dad2', '#f6f0ea'); break;
      case 'magma': { fillNoise('#3a1e14', '#2e160e', '#48281a'); for (let i = 0; i < 9; i++) { const bx = (r() * 14) | 0, by = (r() * 14) | 0; c.fillStyle = r() < 0.5 ? '#e8632a' : '#f7a02a'; c.fillRect(ox + bx, oy + by, 2, 1); } break; }
      case 'coarse_dirt': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5a4630' : t < 0.6 ? '#6a5238' : t < 0.85 ? '#75593c' : '#4e3c28'); } break;
      default: fillNoise('#888', '#666', '#aaa');
    }
  }
  function buildAtlas() {
    const names = new Set();
    BLOCKS.forEach(b => { if (!b.tex) return; if (typeof b.tex === 'string') names.add(b.tex); else { names.add(b.tex.top); names.add(b.tex.side); names.add(b.tex.bottom); } });
    const list = Array.from(names); const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 16; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    list.forEach((nm, i) => { const cx = (i % cols) * 16, cy = ((i / cols) | 0) * 16; paintTile(c, cx, cy, nm); });
    atlasUV = {};
    list.forEach((nm, i) => { const cx = (i % cols), cy = ((i / cols) | 0); const e = 0.01; atlasUV[nm] = { x0: (cx + e) / cols, x1: (cx + 1 - e) / cols, y0: (cy + e) / rows, y1: (cy + 1 - e) / rows }; });
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;
    atlasTex.flipY = false; atlasTex.needsUpdate = true;
    blockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
    waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    plantMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    lavaMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
  }
  function faceTexName(b, faceN) { if (typeof b.tex === 'string') return b.tex; if (faceN === 'top') return b.tex.top; if (faceN === 'bottom') return b.tex.bottom; return b.tex.side; }

  /* ---------------- 메싱(면 컬링 + AO, 전체 1회 빌드) ---------------- */
  const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.78 },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.78 },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, n: 'top' },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, n: 'bottom' },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.62 },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.62 },
  ];
  FACES.forEach(f => { if (!f.n) f.n = 'side'; const na = f.dir.findIndex(v => v !== 0); f.ax = [0, 1, 2].filter(i => i !== na); });
  const AO_MUL = [0.45, 0.62, 0.82, 1.0];

  function makeMesh(pos, col, uv, idxArr, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idxArr);
    const m = new THREE.Mesh(g, mat); scene.add(m); return m;
  }
  // V17: 비큐브(계단/반블럭 등) 서브박스 렌더 — UV를 박스 크기에 맞춰 잘라 왜곡 없이 그림
  function emitBox(T, b, x, y, z, bx0, by0, bz0, bx1, by1, bz1) {
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
      const tn = faceTexName(b, f.n || 'side'); const u = atlasUV[tn] || atlasUV.stone;
      const sh = f.shade;
      for (let k = 0; k < 4; k++) {
        const c = f.corners[k];   // 단위 큐브 코너(각 0/1)
        const px = x + (c[0] ? bx1 : bx0), py = y + (c[1] ? by1 : by0), pz = z + (c[2] ? bz1 : bz0);
        let fu, fv;
        if (fi === 0 || fi === 1) { fu = c[2] ? bz1 : bz0; fv = c[1] ? by1 : by0; }        // ±x: u=z, v=y
        else if (fi === 4 || fi === 5) { fu = c[0] ? bx1 : bx0; fv = c[1] ? by1 : by0; }    // ±z: u=x, v=y
        else { fu = c[0] ? bx1 : bx0; fv = c[2] ? bz1 : bz0; }                              // ±y: u=x, v=z
        T.pos.push(px, py, pz); T.col.push(sh, sh, sh);
        T.uv.push(u.x0 + fu * (u.x1 - u.x0), u.y1 + fv * (u.y0 - u.y1));
      }
      T.idx.push(T.vi, T.vi + 1, T.vi + 2, T.vi, T.vi + 2, T.vi + 3); T.vi += 4;
    }
  }
  function emitShapedBlock(b, x, y, z, T) {
    if (b.shape === 'slab') { emitBox(T, b, x, y, z, 0, 0, 0, 1, 0.5, 1); return; }
    if (b.shape === 'stairs') {
      emitBox(T, b, x, y, z, 0, 0, 0, 1, 0.5, 1);   // 바닥 반블럭
      const f = b.facing || 0;                       // 위 계단(높은 쪽)이 향하는 면
      if (f === 0) emitBox(T, b, x, y, z, 0, 0.5, 0, 1, 1, 0.5);
      else if (f === 1) emitBox(T, b, x, y, z, 0.5, 0.5, 0, 1, 1, 1);
      else if (f === 2) emitBox(T, b, x, y, z, 0, 0.5, 0.5, 1, 1, 1);
      else emitBox(T, b, x, y, z, 0, 0.5, 0, 0.5, 1, 1);
      return;
    }
    if (b.shape === 'fence') {
      emitBox(T, b, x, y, z, 0.375, 0, 0.375, 0.625, 1, 0.625);   // 중앙 기둥
      const conn = (dx, dz) => { const nb = BLOCKS[getBlockLocal(x + dx, y, z + dz)]; return !!(nb && (nb.opaque || nb.shape === 'fence')); };
      if (conn(1, 0)) { emitBox(T, b, x, y, z, 0.625, 0.3, 0.44, 1, 0.5, 0.56); emitBox(T, b, x, y, z, 0.625, 0.66, 0.44, 1, 0.86, 0.56); }
      if (conn(-1, 0)) { emitBox(T, b, x, y, z, 0, 0.3, 0.44, 0.375, 0.5, 0.56); emitBox(T, b, x, y, z, 0, 0.66, 0.44, 0.375, 0.86, 0.56); }
      if (conn(0, 1)) { emitBox(T, b, x, y, z, 0.44, 0.3, 0.625, 0.56, 0.5, 1); emitBox(T, b, x, y, z, 0.44, 0.66, 0.625, 0.56, 0.86, 1); }
      if (conn(0, -1)) { emitBox(T, b, x, y, z, 0.44, 0.3, 0, 0.56, 0.5, 0.375); emitBox(T, b, x, y, z, 0.44, 0.66, 0, 0.56, 0.86, 0.375); }
      return;
    }
    if (b.shape === 'trapdoor') { emitBox(T, b, x, y, z, 0, 0, 0, 1, 0.1875, 1); return; }   // 닫힘: 바닥 얇은 판
    if (b.shape === 'door') {   // 얇은 세로 판(한 칸 높이) — 열림은 90° 회전
      const f = b.open ? (b.facing + 1) % 4 : b.facing;
      const D = [[0, 0, 0, 1, 1, 0.1875], [0.8125, 0, 0, 1, 1, 1], [0, 0, 0.8125, 1, 1, 1], [0, 0, 0, 0.1875, 1, 1]][f];
      emitBox(T, b, x, y, z, D[0], D[1], D[2], D[3], D[4], D[5]);
      return;
    }
  }
  // ── 청크 메싱: 32×32 기둥 단위로 나눠 블록 하나 캘 때 그 청크만 다시 만든다(즉시 반영) ──
  const CHUNK = 32;
  let chunkMeshes = {};        // "cx,cz" -> {opaque,water,plant,lava}
  let dirtyChunks = new Set();
  let _queuedChunks = new Set();   // V12: buildQueue에 든 청크 키(중복 큐잉 방지)
  function disposeChunkMeshes(key) {
    const cM = chunkMeshes[key]; if (!cM) return;
    ['opaque', 'water', 'plant', 'lava'].forEach(t => { const m = cM[t]; if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); } });
    delete chunkMeshes[key];
  }
  function disposeIslandMeshes() { for (const k in chunkMeshes) disposeChunkMeshes(k); chunkMeshes = {}; dirtyChunks.clear(); _queuedChunks.clear(); buildQueue = []; }
  function markBlockDirty(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    dirtyChunks.add(cx + ',' + cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;   // 경계 블록이면 이웃 청크도(면 컬링 갱신)
    if (lx === 0) dirtyChunks.add((cx - 1) + ',' + cz);
    if (lx === CHUNK - 1) dirtyChunks.add((cx + 1) + ',' + cz);
    if (lz === 0) dirtyChunks.add(cx + ',' + (cz - 1));
    if (lz === CHUNK - 1) dirtyChunks.add(cx + ',' + (cz + 1));
  }
  let buildQueue = [];         // 점진적 청크 빌드(대형 월드 로드 프리즈 방지)
  function buildIslandMesh(bounds) {
    const cx0 = bounds ? Math.floor(bounds.x0 / CHUNK) : 0, cx1 = bounds ? Math.floor(bounds.x1 / CHUNK) : Math.floor((W - 1) / CHUNK);
    const cz0 = bounds ? Math.floor(bounds.z0 / CHUNK) : 0, cz1 = bounds ? Math.floor(bounds.z1 / CHUNK) : Math.floor((Dp - 1) / CHUNK);
    const total = (cx1 - cx0 + 1) * (cz1 - cz0 + 1);
    if (total <= 40) {   // 작은 월드/부분 리빌드는 즉시
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) buildChunk(cx, cz);
      buildQueue = [];
      return;
    }
    // 대형 월드: 플레이어 주변 청크 먼저 즉시, 나머지는 프레임 분산 빌드
    const pcx = Math.floor(P.x / CHUNK), pcz = Math.floor(P.z / CHUNK);
    const list = [];
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) list.push([cx, cz, Math.hypot(cx - pcx, cz - pcz)]);
    list.sort((a, b) => a[2] - b[2]);
    let i = 0;
    for (; i < list.length && list[i][2] <= 3.2; i++) buildChunk(list[i][0], list[i][1]);
    // V18 튕김 수정: 초기엔 뷰 거리 안 청크만 큐잉(전 월드 196청크 메싱 → VRAM 폭발 방지). 나머지는 접근 시 tickChunkCulling이 로드
    const viewCh = VIEW_DIST / CHUNK + 1.5;
    buildQueue = list.slice(i).filter(c => c[2] <= viewCh);
    _queuedChunks.clear();
    for (const c of buildQueue) _queuedChunks.add(c[0] + ',' + c[1]);
  }
  function tickBuildQueue() {
    if (!buildQueue.length) return;
    let budget = 6;   // 프레임당 6청크
    while (budget-- > 0 && buildQueue.length) { const c = buildQueue.shift(); _queuedChunks.delete(c[0] + ',' + c[1]); buildChunk(c[0], c[1]); }
  }
  // V12 크래시 수정: 거리 컬링을 "숨김(.visible=false)"이 아니라 "실제 메시 해제(VRAM 반환)"로 승격.
  //   원거리 청크 지오메트리를 dispose해 GPU 메모리를 비우고, 재접근하면 다시 빌드한다.
  //   지형은 world Uint8Array에 그대로 남아 재구성 안전 — 448² 허브 VRAM 소진→컨텍스트 손실→"튕김" 방지.
  const VIEW_DIST = 96;           // 이 반경 안의 미빌드 청크는 큐잉해 복원
  const CULL_DIST = 140;           // 이 밖의 청크 메시는 해제(히스테리시스로 스래싱 방지)
  let _cullT = 0;
  function chunkDistToPlayer(cx, cz) {
    const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;
    return Math.hypot(wx - P.x, wz - P.z);
  }
  function tickChunkCulling(dt) {
    _cullT += dt; if (_cullT < 0.4) return; _cullT = 0;
    // 1) 원거리 청크 메시 해제 → VRAM 반환
    for (const k in chunkMeshes) {
      const ix = k.indexOf(',');
      if (chunkDistToPlayer(+k.slice(0, ix), +k.slice(ix + 1)) > CULL_DIST) disposeChunkMeshes(k);
    }
    // 2) 근거리 미빌드 청크 재큐잉 → 재접근 시 복원
    const pcx = Math.floor(P.x / CHUNK), pcz = Math.floor(P.z / CHUNK);
    const rad = Math.ceil(VIEW_DIST / CHUNK) + 1;
    const cxMax = Math.floor((W - 1) / CHUNK), czMax = Math.floor((Dp - 1) / CHUNK);
    for (let cx = Math.max(0, pcx - rad); cx <= Math.min(cxMax, pcx + rad); cx++)
      for (let cz = Math.max(0, pcz - rad); cz <= Math.min(czMax, pcz + rad); cz++) {
        const k = cx + ',' + cz;
        if (chunkMeshes[k] || _queuedChunks.has(k)) continue;
        if (chunkDistToPlayer(cx, cz) < VIEW_DIST) { buildQueue.push([cx, cz]); _queuedChunks.add(k); }
      }
  }
  function buildChunk(cx, cz) {
    const key = cx + ',' + cz;
    disposeChunkMeshes(key);
    const bx0 = cx * CHUNK, bx1 = Math.min(W - 1, bx0 + CHUNK - 1);
    const bz0 = cz * CHUNK, bz1 = Math.min(Dp - 1, bz0 + CHUNK - 1);
    if (bx0 >= W || bz0 >= Dp) return;
    const B = { pos: [], col: [], uv: [], idx: [], vi: 0 };
    const Wt = { pos: [], col: [], uv: [], idx: [], vi: 0 };
    const Pl = { pos: [], col: [], uv: [], idx: [], vi: 0 };
    const Lv = { pos: [], col: [], uv: [], idx: [], vi: 0 };
    for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = 0; y < H; y++) {
      const id = getBlockLocal(x, y, z); if (id === 0) continue;
      const b = BLOCKS[id]; const liq = b.liquid;
      if (b.shape) { emitShapedBlock(b, x, y, z, B); continue; }   // V17: 계단/반블럭
      if (b.cross) {
        const tn = faceTexName(b, 'side'); const u = atlasUV[tn] || atlasUV.stone;
        const uvco = [[u.x0, u.y1], [u.x1, u.y1], [u.x1, u.y0], [u.x0, u.y0]];
        const diags = [[[x, z], [x + 1, z + 1]], [[x + 1, z], [x, z + 1]]];
        for (const dg of diags) {
          const a0 = dg[0], a1 = dg[1];
          const vtx = [[a0[0], y, a0[1]], [a1[0], y, a1[1]], [a1[0], y + 1, a1[1]], [a0[0], y + 1, a0[1]]];
          for (let k = 0; k < 4; k++) { Pl.pos.push(vtx[k][0], vtx[k][1], vtx[k][2]); Pl.col.push(1, 1, 1); Pl.uv.push(uvco[k][0], uvco[k][1]); }
          Pl.idx.push(Pl.vi, Pl.vi + 1, Pl.vi + 2, Pl.vi, Pl.vi + 2, Pl.vi + 3); Pl.vi += 4;
        }
        continue;
      }
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi]; const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
        if (opaqueAt(nx, ny, nz)) continue;
        const nid = getBlockLocal(nx, ny, nz);
        if (liq && nid === id) continue;
        if (liq && f.n === 'bottom' && ny < 0) continue;
        const tn = faceTexName(b, f.n); const u = atlasUV[tn] || atlasUV.stone;
        const T = b.lava ? Lv : liq ? Wt : B;
        const sh = f.shade;
        const uvco = [[u.x0, u.y1], [u.x0, u.y0], [u.x1, u.y0], [u.x1, u.y1]];
        const axA = f.ax[0], axB = f.ax[1];
        const bx = x + f.dir[0], by = y + f.dir[1], bz = z + f.dir[2];
        for (let k = 0; k < 4; k++) {
          const cc = f.corners[k];
          const sa = cc[axA] ? 1 : -1, sb = cc[axB] ? 1 : -1;
          const o1 = [0, 0, 0], o2 = [0, 0, 0], od = [0, 0, 0]; o1[axA] = sa; o2[axB] = sb; od[axA] = sa; od[axB] = sb;
          const s1 = opaqueAt(bx + o1[0], by + o1[1], bz + o1[2]) ? 1 : 0;
          const s2 = opaqueAt(bx + o2[0], by + o2[1], bz + o2[2]) ? 1 : 0;
          const sd = opaqueAt(bx + od[0], by + od[1], bz + od[2]) ? 1 : 0;
          const aol = (s1 && s2) ? 0 : (3 - (s1 + s2 + sd));
          const v = sh * AO_MUL[aol];
          T.pos.push(x + cc[0], y + cc[1] - (liq && f.n === 'top' ? 0.12 : 0), z + cc[2]);
          T.col.push(v, v, v);
          T.uv.push(uvco[k][0], uvco[k][1]);
        }
        T.idx.push(T.vi, T.vi + 1, T.vi + 2, T.vi, T.vi + 2, T.vi + 3); T.vi += 4;
      }
    }
    const out = {};
    if (B.pos.length) out.opaque = makeMesh(B.pos, B.col, B.uv, B.idx, blockMat);
    if (Wt.pos.length) out.water = makeMesh(Wt.pos, Wt.col, Wt.uv, Wt.idx, waterMat);
    if (Pl.pos.length) out.plant = makeMesh(Pl.pos, Pl.col, Pl.uv, Pl.idx, plantMat);
    if (Lv.pos.length) out.lava = makeMesh(Lv.pos, Lv.col, Lv.uv, Lv.idx, lavaMat);
    chunkMeshes[key] = out;
  }

  /* ---------------- 사람형/동물/프롭 메시 ---------------- */
  const matCache = {};
  function boxMat(col) { if (!matCache[col]) matCache[col] = new THREE.MeshBasicMaterial({ color: col }); return matCache[col]; }
  function mkBox(w, h, d, col, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(col)); if (x !== undefined) m.position.set(x, y, z); return m; }
  function shade(col, f) { const r = Math.min(255, ((col >> 16) & 255) * f) | 0, g = Math.min(255, ((col >> 8) & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0; return (r << 16) | (g << 8) | b; }
  // V14: 단색 덩어리 폐기 — 스킨/머리카락/얼굴/셔츠/바지 층으로 렌더(직업별 복장 차등)
  function toLook(x) {
    if (x && typeof x === 'object') return x;
    const c = (x == null ? 0x3a6ee0 : x);
    return { skin: 0xe0ac7e, hair: 0x3b2a1a, shirt: c, pants: shade(c, 0.6) };   // 레거시 단일색 → 셔츠색
  }
  // V18: 여러 박스를 하나의 지오메트리로 병합(정점색) → 정적 NPC/미니언 1 드로우콜(원래 17)
  let _humMat = null;
  function humanoidMat() { if (!_humMat) _humMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }); return _humMat; }
  const _CUBE_FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  function mergeBoxes(specs) {
    const pos = [], col = [], idx = []; let vi = 0;
    for (const s of specs) {
      const hx = s.w / 2, hy = s.h / 2, hz = s.d / 2;
      const r = ((s.col >> 16) & 255) / 255, gg = ((s.col >> 8) & 255) / 255, bl = (s.col & 255) / 255;
      const C = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
      for (const c of C) { pos.push(s.x + c[0], s.y + c[1], s.z + c[2]); col.push(r, gg, bl); }
      for (const f of _CUBE_FACES) idx.push(vi + f[0], vi + f[1], vi + f[2], vi + f[0], vi + f[2], vi + f[3]);
      vi += 8;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, humanoidMat());
  }
  function buildHumanoid(colOrLook, opts) {
    const merged = !!(opts && opts.merged);
    const L = toLook(colOrLook);
    const g = new THREE.Group();
    const legH = 0.72, bodyH = 0.7, headS = 0.5, limbW = 0.22;
    const pantsD = shade(L.pants, 0.82), shirtD = shade(L.shirt, 0.9);
    const specs = []; const add = (w, h, d, col, x, y, z) => specs.push({ w, h, d, col, x, y, z });
    add(limbW + 0.03, 0.12, 0.28, L.shoes != null ? L.shoes : 0x2a2018, -0.12, 0.06, 0.02);
    add(limbW + 0.03, 0.12, 0.28, L.shoes != null ? L.shoes : 0x2a2018, 0.12, 0.06, 0.02);
    const legLi = specs.length; add(limbW, legH, 0.24, L.pants, -0.12, legH / 2, 0);
    const legRi = specs.length; add(limbW, legH, 0.24, pantsD, 0.12, legH / 2, 0);
    add(0.5, bodyH, 0.26, L.shirt, 0, legH + bodyH / 2, 0);
    add(0.53, 0.09, 0.29, shade(L.pants, 0.7), 0, legH + 0.04, 0);
    if (L.apron != null) add(0.42, bodyH * 0.78, 0.02, L.apron, 0, legH + bodyH * 0.46, 0.14);
    [-1, 1].forEach(s => { const ax = s * (0.25 + limbW / 2); add(limbW, bodyH * 0.66, limbW, shirtD, ax, legH + bodyH * 0.82, 0); add(limbW, bodyH * 0.3, limbW, L.skin, ax, legH + bodyH * 0.38, 0); });
    const hy = legH + bodyH + headS / 2;
    add(headS, headS, headS, L.skin, 0, hy, 0);
    add(0.09, 0.09, 0.02, 0x241d18, -0.1, hy + 0.02, headS / 2 + 0.005);
    add(0.09, 0.09, 0.02, 0x241d18, 0.1, hy + 0.02, headS / 2 + 0.005);
    if (L.beard) add(headS * 0.8, 0.14, 0.03, L.hair, 0, hy - 0.2, headS / 2);
    if (L.hat != null) { add(headS + 0.06, 0.16, headS + 0.06, L.hat, 0, hy + headS / 2 + 0.02, 0); if (L.brim) add(headS + 0.3, 0.05, headS + 0.3, L.hat, 0, hy + headS / 2 - 0.02, 0); }
    else { add(headS + 0.04, 0.18, headS + 0.04, L.hair, 0, hy + headS / 2 - 0.03, 0); add(headS + 0.04, headS * 0.66, 0.05, L.hair, 0, hy - 0.03, -headS / 2 - 0.01); }
    if (merged) { g.add(mergeBoxes(specs)); return { group: g, legL: null, legR: null }; }
    let legL = null, legR = null;
    specs.forEach((s, i) => { const m = mkBox(s.w, s.h, s.d, s.col, s.x, s.y, s.z); g.add(m); if (i === legLi) legL = m; else if (i === legRi) legR = m; });
    return { group: g, legL, legR };
  }
  function buildQuadruped(baseCol, size) {
    const g = new THREE.Group(); const legs = [];
    const dark = shade(baseCol, 0.75), light = shade(baseCol, 1.15);
    const bl = 0.9 * size, bh = 0.42 * size, bw = 0.7 * size, cy = 0.5 * size, legH = 0.35 * size;
    g.add(mkBox(bw, bh, bl, baseCol, 0, cy, 0));
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(o => { const m = mkBox(0.16 * size, legH, 0.16 * size, dark, o[0] * (bw / 2 - 0.1), legH / 2, o[1] * (bl / 2 - 0.1)); g.add(m); legs.push(m); });
    g.add(mkBox(0.45 * size, 0.45 * size, 0.4 * size, light, 0, cy + 0.1, bl / 2 + 0.15));
    return { group: g, legs };
  }
  function buildChicken() {
    const g = new THREE.Group(); const legs = [];
    g.add(mkBox(0.3, 0.35, 0.4, 0xf2f2f2, 0, 0.3, 0));
    g.add(mkBox(0.24, 0.24, 0.2, 0xffffff, 0, 0.6, 0.18));
    g.add(mkBox(0.1, 0.06, 0.1, 0xf0a030, 0, 0.58, 0.32));
    [-1, 1].forEach(s => { const m = mkBox(0.05, 0.16, 0.05, 0xf0a030, s * 0.07, 0.08, 0); g.add(m); legs.push(m); });
    return { group: g, legs };
  }
  function makeLabel(text) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 256, 72);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 26px sans-serif';
    c.fillText(String(text || ''), 128, 44);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.7, 0.48, 1); return spr;
  }
  function makeMinionLabel(name, tier, storage, cap) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 110; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 256, 110);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 22px sans-serif';
    c.fillText(name + ' T' + tier, 128, 26);
    const pct = cap > 0 ? storage / cap : 0;
    const barX = 28, barY = 42, barW = 200, barH = 18;
    c.fillStyle = '#222'; c.fillRect(barX, barY, barW, barH);
    c.fillStyle = pct > 0.9 ? '#e05a4a' : pct >= 0.5 ? '#e0c24a' : '#5ac26a';
    c.fillRect(barX, barY, Math.max(2, barW * Math.min(1, pct)), barH);
    c.strokeStyle = '#fff'; c.strokeRect(barX, barY, barW, barH);
    c.fillStyle = '#fff'; c.font = '16px sans-serif'; c.fillText(storage + ' / ' + cap, 128, barY + barH + 22);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(2.0, 0.86, 1); return spr;
  }
  function buildEmptySlot() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.6), mat); pedestal.position.set(0, 0.08, 0); g.add(pedestal);
    const label = makeLabel('+ 미니언 배치'); label.position.set(0, 1.0, 0); g.add(label);
    return g;
  }
  function buildNodeMarker(zoneKey) {
    const g = new THREE.Group();
    const colorByZone = { mine: 0x5decd5, farm: 0xe8c24a, forest: 0x41a85f, dock: 0x3a6ee0 };
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: colorByZone[zoneKey] || 0xffffff }));
    glow.position.set(0, 0.5, 0); g.add(glow);
    const icon = zoneKey === 'mine' ? '⛏ 채굴' : zoneKey === 'farm' ? '🌾 수확' : zoneKey === 'forest' ? '🪓 벌목' : '🎣 낚시';
    const label = makeLabel(icon); label.position.set(0, 1.1, 0); g.add(label);
    return g;
  }
  function buildFairyOrb() {
    const g = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: 0xff6ad5 }));
    orb.position.set(0, 0.6, 0); g.add(orb);
    const spr = makeLabel('✨'); spr.scale.set(0.7, 0.5, 1); spr.position.set(0, 1.1, 0); g.add(spr);
    g.userData.orb = orb;
    return g;
  }
  function disposeGroup(g) { if (!g) return; g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.map.dispose) o.material.map.dispose(); }); }

  /* ---------------- NPC/노드/페어리/구름/앰비언트 몹 배치 ---------------- */
  // V14: 직업별 복장(스킨/머리/셔츠/바지/모자/앞치마/수염) — 단색 폐기
  const NPC_LOOK = {
    shopkeeper:   { shirt: 0xffffff, pants: 0x394a5a, apron: 0x2e7d46, hair: 0x5a3b1a },
    bankTeller:   { shirt: 0x1f2d3d, pants: 0x11151d, hat: 0x22242a, apron: 0xf2d75c },
    minionManager:{ shirt: 0x6aa84f, pants: 0x3a3a2a, hat: 0xffcf3a },
    petKeeper:    { shirt: 0xe048c4, pants: 0x6a2b60, hair: 0x2a2a2a },
    enchanter:    { shirt: 0x5a3aa0, pants: 0x39236a, hat: 0x39236a, hair: 0xdddddd, beard: true },
    auctioneer:   { shirt: 0xc0392b, pants: 0x5a1a12, hat: 0x2a2a2a },
    gladiator:    { shirt: 0xb8860b, pants: 0x6a5010, hair: 0x2a2a2a, beard: true },
    reforgeSmith: { shirt: 0x6b5436, pants: 0x3a2a1a, apron: 0x4a3220, hair: 0x2a2a2a, beard: true },
    guide:        { shirt: 0x2c82c9, pants: 0x1a4a6a, hat: 0x6a4a2a, brim: true },
    craftsman:    { shirt: 0x8a6a3a, pants: 0x5a3a1a, apron: 0x6a4a2a },
    builder:      { shirt: 0xd4a017, pants: 0x6a5020, hat: 0xffcf3a, apron: 0x9a7b4f },   // 안전모+작업복
    starSmith:    { shirt: 0x54c8e8, pants: 0x2a6a8a, hair: 0xdddddd },
    mineForeman:  { shirt: 0x787878, pants: 0x3a3a3a, hat: 0xffcf3a, apron: 0x5a5a5a },
    farmForeman:  { shirt: 0xd8b23a, pants: 0x6a5a2a, hat: 0xe6cf7a, brim: true },
    lumberjack:   { shirt: 0x9a3b2a, pants: 0x3a2a1a, hat: 0x2e5a3a, hair: 0x3a2a1a, beard: true },
    fisherman:    { shirt: 0xf2c94c, pants: 0x3a5a6a, hat: 0xf2c94c, brim: true, beard: true, hair: 0xb0b0b0 },
    slayerMaster: { shirt: 0x2a2040, pants: 0x15102a, hat: 0x15102a, hair: 0x2a2a2a },
    dungeonGatekeeper: { shirt: 0x5a4327, pants: 0x3a2a15, hat: 0x6a5030 },
    tia:          { skin: 0xffe0ee, shirt: 0xffb7dd, pants: 0xe088bb, hair: 0xff88cc },
    // 퀘스트 NPC
    jerry:    { shirt: 0x4fae5a, pants: 0x2e6a3a, hair: 0x8a6a2a },
    pat:      { shirt: 0x7cb342, pants: 0x5a4a2a, hat: 0xe6cf7a, brim: true, beard: true },
    q_village:{ shirt: 0xcaa24a, pants: 0x6a5020, hair: 0xdddddd, beard: true, hat: 0x8a6a2a },
    q_mine:   { shirt: 0x8a8a8a, pants: 0x3a3a3a, hat: 0xffcf3a, beard: true },
    q_forest: { shirt: 0x5d8a3a, pants: 0x3a2a1a, hat: 0x2e5a3a, brim: true },
    q_farm:   { shirt: 0xd8b23a, pants: 0x6a5a2a, hat: 0xe6cf7a, brim: true },
    q_dock:   { shirt: 0x3f9fd0, pants: 0x2a4a6a, hat: 0x2a3a5a, beard: true },
    q_grave:  { shirt: 0x584a6a, pants: 0x2a2440, hat: 0x2a2440, hair: 0x9a9a9a },
    q_arena:  { shirt: 0xb8860b, pants: 0x6a5010, hat: 0x2a2a2a },
    q_wizard: { shirt: 0x6a3aa8, pants: 0x452474, hat: 0x452474, hair: 0xdedede, beard: true },
    q_ruins:  { shirt: 0x8a7b5a, pants: 0x5a4a30, hat: 0x6a5a3a, brim: true },
    q_snow:   { shirt: 0x9fd4e8, pants: 0x4a7a9a, hat: 0xe8f4fa, beard: true, hair: 0xdedede },
  };
  function npcLook(key, fallbackColor) {
    const L = NPC_LOOK[key];
    if (!L) return fallbackColor;
    return Object.assign({ skin: 0xe0ac7e, hair: 0x3b2a1a, pants: shade(L.shirt || fallbackColor || 0x808080, 0.6) }, L);
  }
  function questNpcList() { return ((window.ECON_DATA || {}).QUEST_NPCS) || []; }
  function buildNpcMeshes() {
    npcGroup = new THREE.Group(); scene.add(npcGroup);
    // 서비스 NPC(상점/은행/…) — 현재 월드 소속만
    NPCS.forEach(n => {
      if ((n.world || 'hub') !== worldMode) return;
      const h = buildHumanoid(npcLook(n.key, n.color), { merged: true });
      n._y = surfaceTop(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      h.group.rotation.y = hash3(n.x, 5, n.z) * Math.PI * 2;
      const label = makeLabel(n.name); label.position.set(0, 2.2, 0); h.group.add(label);
      npcGroup.add(h.group);
    });
    // V13-B: 위치기반 퀘스트 NPC(느낌표 표식) — 현재 월드 소속만
    questNpcList().forEach(n => {
      if ((n.world || 'hub') !== worldMode) return;
      const h = buildHumanoid(npcLook(n.key, n.color), { merged: true });
      n._y = surfaceTop(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      h.group.rotation.y = hash3(n.x, 9, n.z) * Math.PI * 2;
      const label = makeLabel('❗ ' + n.name); label.position.set(0, 2.35, 0); h.group.add(label);
      // 머리 위 노란 느낌표 발광 마커
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
      mark.position.set(0, 2.85, 0); mark.userData.qbob = 1; h.group.add(mark);
      npcGroup.add(h.group);
    });
    if (worldMode === 'home') buildHomeStarterChest();
  }
  // 포탈섬 스타터 상자(프롭) — 시작 안내 겸 장식
  function buildHomeStarterChest() {
    const cx = HOME_PISLE.x - 3, cz = HOME_PISLE.z + 1, cy = surfaceTop(cx, cz);
    const g = new THREE.Group();
    g.add(mkBox(0.86, 0.56, 0.86, 0x8a5a2b, 0, 0.3, 0));       // 상자 몸통(나무색)
    g.add(mkBox(0.9, 0.12, 0.9, 0x5c3c1c, 0, 0.62, 0));         // 뚜껑 테두리
    g.add(mkBox(0.14, 0.14, 0.06, 0xffd257, 0, 0.36, 0.44));    // 자물쇠(금색)
    g.position.set(cx + 0.5, cy, cz + 0.5);
    const label = makeLabel('📦 스타터 상자'); label.position.set(cx + 0.5, cy + 1.3, cz + 0.5);
    npcGroup.add(g); npcGroup.add(label);
  }
  function buildNodeMeshes() {
    nodeGroup = new THREE.Group(); scene.add(nodeGroup);
    NODES.forEach(n => {
      n._y = surfaceTop(n.x, n.z);
      const marker = buildNodeMarker(n.zone);
      marker.position.set(n.x + 0.5, n._y, n.z + 0.5);
      nodeGroup.add(marker);
    });
  }
  function buildFairyMeshes() {
    fairyGroup = new THREE.Group(); scene.add(fairyGroup);
    fairyMeshes = {};
    FAIRY_SPOTS.forEach(fs => {
      fs._y = fs.y != null ? fs.y : surfaceTop(fs.x, fs.z);
      const orb = buildFairyOrb();
      orb.position.set(fs.x + 0.5, fs._y, fs.z + 0.5);
      fairyGroup.add(orb);
      fairyMeshes[fs.id] = orb;
    });
  }
  function refreshFairyVisibility() {
    const api = econApi();
    FAIRY_SPOTS.forEach(fs => { const m = fairyMeshes[fs.id]; if (m) m.visible = !api.fairySoulCollected(fs.id); });
  }
  function buildClouds() {
    cloudGroup = new THREE.Group(); scene.add(cloudGroup);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const n = 2 + Math.floor(hash3(i, 41, 1) * 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(5 + hash3(i, j, 2) * 6, 1, 3 + hash3(i, j, 3) * 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        m.position.set(j * 4 - n * 2, hash3(i, j, 4), j * 2 - n);
        g.add(m);
      }
      g.position.set(hash3(i, 42, 5) * W, 42 + hash3(i, 43, 6) * 4, hash3(i, 44, 7) * Dp);
      g.userData.speed = 0.4 + hash3(i, 45, 8) * 0.5;
      cloudGroup.add(g);
    }
  }
  function buildAmbientMobs() {
    ambientMobs = [];
    propGroup = new THREE.Group(); scene.add(propGroup);
    const defs = [
      { kind: 'chicken', island: 'farm', n: 3 }, { kind: 'pig', island: 'farm', n: 2 },
      { kind: 'cow', island: 'hub', n: 2 }, { kind: 'zombie', island: 'slayerden', n: 3 },
    ];
    defs.forEach((d, di) => {
      const isl = ISLANDS.find(i => i.key === d.island);
      for (let i = 0; i < d.n; i++) {
        const x = isl.cx + (hash3(di, i, 51) - 0.5) * isl.r, z = isl.cz + (hash3(di, i, 52) - 0.5) * isl.r;
        let built;
        if (d.kind === 'chicken') built = buildChicken();
        else if (d.kind === 'zombie') { built = buildHumanoid(0x3f7a4f); built.legs = [built.legL, built.legR]; }
        else built = buildQuadruped(d.kind === 'pig' ? 0xe6a8ad : 0x4a3a2c, d.kind === 'pig' ? 0.8 : 1.0);
        propGroup.add(built.group);
        ambientMobs.push({ kind: d.kind, isl, x, z, yaw: hash3(di, i, 53) * Math.PI * 2, group: built.group, legs: built.legs || [], wT: 0, moving: false, walkT: 0 });
      }
    });
  }
  function updateAmbientMobs(dt) {
    for (const m of ambientMobs) {
      m.wT -= dt;
      if (m.wT <= 0) { m.wT = 2 + Math.random() * 3; m.moving = Math.random() < 0.6; m.yaw = Math.random() * Math.PI * 2; }
      if (m.moving) {
        const spd = m.kind === 'zombie' ? 1.0 : 1.4;
        let nx = m.x + Math.sin(m.yaw) * spd * dt, nz = m.z + Math.cos(m.yaw) * spd * dt;
        if (Math.hypot(nx - m.isl.cx, nz - m.isl.cz) < m.isl.r * 0.6 && surfaceTop(Math.floor(nx), Math.floor(nz)) > SEA + 1) { m.x = nx; m.z = nz; }
        else m.yaw += Math.PI;
        m.walkT += dt * 7;
        const sw = Math.sin(m.walkT) * 0.5;
        for (let li = 0; li < m.legs.length; li++) m.legs[li].rotation.x = (li % 2 ? -1 : 1) * sw;
      } else for (const l of m.legs) l.rotation.x *= 0.8;
      const y = surfaceTop(Math.floor(m.x), Math.floor(m.z));
      m.group.position.set(m.x, y, m.z);
      m.group.rotation.y = m.yaw;
    }
  }

  /* ---------------- 미니언 3D 표시(허브: 자원 존 배치 / 내 섬: 받침대 전체 정렬) ---------------- */
  function placeMinionMesh(P0, D0, entry, slot) {
    const y = surfaceTop(slot[0], slot[1]);
    const h = buildHumanoid(MINION_COLORS[entry.def.resource] || 0x999999, { merged: true });
    h.group.position.set(slot[0] + 0.5, y, slot[1] + 0.5);
    const cap = entry.m.storageUpgraded ? D0.MINION_STORAGE_UPGRADED : D0.MINION_STORAGE_BASE;
    const label = makeMinionLabel(entry.def.name, entry.m.tier, entry.m.storage, cap);
    label.position.set(0, 2.3, 0); h.group.add(label);
    minionGroup.add(h.group);
    dynamicInteractables.push({ type: 'minion', ref: { idx: entry.i }, x: slot[0] + 0.5, y: y + 1.0, z: slot[1] + 0.5 });
  }
  function placeEmptySlotMesh(slot) {
    const y = surfaceTop(slot[0], slot[1]);
    const eg = buildEmptySlot(); eg.position.set(slot[0] + 0.5, y, slot[1] + 0.5); minionGroup.add(eg);
    dynamicInteractables.push({ type: 'emptySlot', ref: {}, x: slot[0] + 0.5, y: y + 0.6, z: slot[1] + 0.5 });
  }
  function rebuildMinionVisuals(force) {
    const P0 = econApi().getP(); if (!P0) return;
    const sig = worldMode + '|' + P0.minions.map(m => m.key + ':' + m.tier + ':' + m.storage + ':' + (m.storageUpgraded ? 1 : 0)).join('|') + '#' + P0.maxMinionSlots;
    if (!force && sig === _minionSig) return;
    _minionSig = sig;
    if (minionGroup) { scene.remove(minionGroup); disposeGroup(minionGroup); }
    minionGroup = new THREE.Group(); scene.add(minionGroup);
    dynamicInteractables = [];
    const D0 = window.ECON_DATA; if (!D0) return;
    if (worldMode === 'visit') {
      // 방문 모드: 방문 대상의 미니언을 구경용으로 배치(상호작용 불가)
      const ve = ((visitData && visitData.minions) || []).map((m, i) => ({ m, i, def: D0.MINIONS.find(x => x.key === m.key) })).filter(e => e.def);
      HOME_MINION_SLOTS.forEach((slot, si) => { if (si < ve.length) placeMinionMesh(P0, D0, ve[si], slot); });
      dynamicInteractables = [];
      return;
    }
    if (worldMode !== 'home') return;   // 실제 스카이블럭: 미니언은 프라이빗 섬에서만 일한다
    const entries = P0.minions.map((m, i) => ({ m, i, def: D0.MINIONS.find(x => x.key === m.key) })).filter(e => e.def);
    // V13-A: 미니언 자유 배치 — 각 미니언은 저장된 위치(m.px,m.pz)에 렌더. 위치 없으면 스폰섬에 흩어 배치.
    //   고정 받침대(30칸)·"+미니언 배치" 빈 슬롯 라벨 폐기(사용자 요청).
    entries.forEach((e, i) => {
      if (typeof e.m.px !== 'number' || typeof e.m.pz !== 'number') {
        e.m.px = HOME_SPAWN.x + ((i % 4) - 1.5) * 2;   // 기존 미니언 기본 위치(스폰섬 근처)
        e.m.pz = HOME_SPAWN.z - 3 - Math.floor(i / 4) * 2;
      }
      placeMinionMesh(P0, D0, e, [e.m.px, e.m.pz]);
    });
    return;
    const byZone = {};
    entries.forEach(e => { const zk = RESOURCE_ZONE[e.def.resource] || 'hub'; (byZone[zk] = byZone[zk] || []).push(e); });
    let emptyShown = 0;
    const remaining = P0.maxMinionSlots - P0.minions.length;
    Object.keys(MINION_SLOTS).forEach(zoneKey => {
      const list = byZone[zoneKey] || [];
      MINION_SLOTS[zoneKey].forEach((slot, si) => {
        if (si < list.length) placeMinionMesh(P0, D0, list[si], slot);
        else if (si === list.length && emptyShown < remaining) { emptyShown++; placeEmptySlotMesh(slot); }
      });
    });
  }

  /* ---------------- 이동/물리 ---------------- */
  function lookDir() { return { x: Math.sin(P.yaw) * Math.cos(P.pitch) * -1, y: Math.sin(P.pitch), z: Math.cos(P.yaw) * Math.cos(P.pitch) * -1 }; }
  function clampPitch() { const lim = Math.PI / 2 - 0.02; if (P.pitch > lim) P.pitch = lim; if (P.pitch < -lim) P.pitch = -lim; }
  function blockAtFeet() { return getBlockLocal(Math.floor(P.x), Math.floor(P.y + 0.2), Math.floor(P.z)); }
  function feetInWater() { return blockAtFeet() === ID.water; }
  function feetInLava() { return blockAtFeet() === ID.lava; }
  // V12 Sneak: 슬금 중 지상에서 발밑 지면이 사라지는 이동이면 그 축을 취소(가장자리 낙하 방지, MC식)
  function wouldFallOffEdge() {
    const fy = Math.floor(P.y - 0.05);   // 발밑 한 칸
    for (let x = Math.floor(P.x - P.w / 2); x <= Math.floor(P.x + P.w / 2); x++)
      for (let z = Math.floor(P.z - P.w / 2); z <= Math.floor(P.z + P.w / 2); z++)
        if (solidAt(x, fy, z)) return false;   // 발밑 어딘가 지면 있으면 안전
    return true;
  }
  function moveAxis(ax, amt) {
    if (amt === 0) return;
    const before = P[ax];
    P[ax] += amt;
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      const bb = BLOCKS[getBlockLocal(x, y, z)]; if (!bb || !bb.solid) continue;
      const hi = y + (bb.collTop != null ? bb.collTop : (bb.shape === 'slab' ? 0.5 : 1));   // V17: 형태별 충돌 상단(반블럭0.5/트랩도어0.1875)
      if (minY >= hi || maxY <= y) continue;             // 플레이어가 이 블럭 세로 범위 밖 → 통과
      if (ax === 'y') { if (amt > 0) { P.y = y - P.h - 0.0001; P.vy = 0; } else { P.y = hi + 0.0001; P.vy = 0; P.onGround = true; } return; }
      if (ax === 'x') { if (amt > 0) P.x = x - P.w / 2 - 0.0001; else P.x = x + 1 + P.w / 2 + 0.0001; P.vx = 0; return; }
      if (ax === 'z') { if (amt > 0) P.z = z - P.w / 2 - 0.0001; else P.z = z + 1 + P.w / 2 + 0.0001; P.vz = 0; return; }
    }
    if ((ax === 'x' || ax === 'z') && P._sneaking && P.onGround && wouldFallOffEdge()) { P[ax] = before; P['v' + ax] = 0; }
  }
  function respawnAtHub(msg) {
    if (worldMode === 'home' || worldMode === 'visit') { P.x = 96.5; P.z = 104.5; P.y = surfaceTop(96, 104) + 0.02; }   // V13-A: 스폰섬
    else if (worldMode !== 'hub') { const sp = (WORLD_DEFS[worldMode] || {}).spawn || [W >> 1, Dp >> 1]; P.x = sp[0] + 0.5; P.z = sp[1] + 0.5; P.y = surfaceTop(sp[0], sp[1]) + 0.02; }
    else { P.x = spawnX; P.y = spawnY; P.z = spawnZ; }
    P.vx = P.vy = P.vz = 0;
    if (msg && typeof toast === 'function') toast(msg, false);
  }
  function collide(dt) {
    let mf = 0, ms = 0;
    if (keys.KeyW) mf += 1; if (keys.KeyS) mf -= 1; if (keys.KeyA) ms -= 1; if (keys.KeyD) ms += 1;
    if (moveT.active) { const dx = moveT.x - moveT.ox, dy = moveT.y - moveT.oy; if (Math.abs(dx) > 8) ms += dx > 0 ? 1 : -1; if (Math.abs(dy) > 8) mf += dy < 0 ? 1 : -1; }
    const inWater = feetInWater();
    if (mf <= 0) P._sprintLatch = false;                    // 전진을 멈추면 스프린트 해제
    const sprint = (P._sprintLatch || keys.ControlLeft || keys.ControlRight) && mf > 0 && !inWater;
    P._sneaking = !!(keys.ShiftLeft || keys.ShiftRight) && P.onGround && !inWater;   // V12 Sneak 상태
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let speed = P._sneaking ? 1.3 : (sprint ? 5.8 : 4.3);   // V12: 슬금 = 걷기 30%(위키)
    if (inWater) speed *= 0.55;
    // 슈가 러시 인챈트 이동속도 보너스
    if (window.econApi && window.econApi.moveSpeedPct) speed *= 1 + window.econApi.moveSpeedPct() / 100;
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - sin * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P.vx = dx * speed; P.vz = dz * speed;
    // 오토 점프: 진행 방향 1블록 턱은 자동으로 올라간다(조작감)
    if (P.onGround && len > 0) {
      const fx = Math.floor(P.x + dx * 0.8), fz = Math.floor(P.z + dz * 0.8), fy = Math.floor(P.y + 0.1);
      if (solidAt(fx, fy, fz) && !solidAt(fx, fy + 1, fz) && !solidAt(fx, fy + 2, fz)) { P.vy = 8.5; P.onGround = false; }
    }
    const wantJump = keys.Space || (moveT.active && (moveT.y - moveT.oy) < -34);
    const jumpEdge = wantJump && !P._prevJump;   // 점프 키를 새로 누른 순간(더블점프 판정)
    P._prevJump = wantJump;
    if (inWater) {
      P.vy -= 9 * dt; if (wantJump) P.vy += 26 * dt; if (P.vy < -4) P.vy = -4; if (P.vy > 5) P.vy = 5; P._djUsed = false;
      // 수면 근처에서 점프하면 뭍으로 뛰어오를 수 있게(허우적대다 못 나오는 문제 해결)
      const headWater = getBlockLocal(Math.floor(P.x), Math.floor(P.y + 1.1), Math.floor(P.z)) === ID.water;
      if (wantJump && !headWater) P.vy = 8.5;
    }
    else {
      P.vy -= 32 * dt; if (P.vy < -78) P.vy = -78;
      if (wantJump && P.onGround) { P.vy = 8.5; P.onGround = false; }
      else if (jumpEdge && !P.onGround && !P._djUsed) { P.vy = 8.0; P._djUsed = true; }   // 더블점프(메이플 감성)
    }
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    if (P.onGround) P._djUsed = false;
    if (feetInLava()) respawnAtHub('앗 뜨거워! 마을로 긴급 귀환했어요');
    if (P.y < 1) respawnAtHub(worldMode === 'hub' ? '마을로 귀환했어요' : '공허에 떨어졌다! 섬으로 귀환');
  }
  function resetPlayerToSpawn() {
    spawnX = 224.5; spawnZ = 232.5; spawnY = surfaceTop(224, 232) + 0.02;
    P.x = spawnX; P.y = spawnY; P.z = spawnZ; P.vx = P.vy = P.vz = 0; P.yaw = 0; P.pitch = 0; P.onGround = false;
  }

  /* ---------------- 입력 ---------------- */
  function panelOpen() { const wrap = document.getElementById('econ3dPanelWrap'); return !!(wrap && wrap.style.display !== 'none'); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onPLC() { lookS.locked = (document.pointerLockElement === canvas); }
  function onKey(e) {
    // 더블탭 W = 스프린트(마인크래프트 방식 — Ctrl+W는 브라우저와 충돌하므로)
    if (e.code === 'KeyW' && !keys.KeyW) {
      const now = performance.now();
      if (now - (P._lastW || 0) < 280) P._sprintLatch = true;
      P._lastW = now;
    }
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape') hidePanel();
    if (e.code === 'KeyM') toggleMinimapSize();
    if (/^Digit[1-8]$/.test(e.code)) { selectedHotbar = +e.code.slice(5) - 1; updateHotbar(); }   // V12-D: 숫자키로 핫바 슬롯 선택
    if (e.code === 'Digit9') openPanelForZone('hub', 'menu');   // 9 = 스카이블럭 메뉴
    if (e.code === 'KeyE') {   // V13-A: E 토글(열림이면 닫기)
      if (panelOpen()) { hidePanel(); }
      else { const t = currentAim(); if (t) doInteract(t); else openPanelForZone('hub', 'inv'); }
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onDown(e) {
    if (panelOpen()) return;
    const p = relPos(e); const cw = canvas.clientWidth;
    if (!isTouch) {
      if (!lookS.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 2) {
        if (worldMode === 'home') { homePlaceBlock(); return; }
        if (fishing) return;
        if (!startFishing()) openPanelForZone('hub', 'menu');   // 우클릭 = 네더의 별 스카이블럭 메뉴(물 조준 시 낚시)
        return;
      }
      if (fishing) { reelFishing(); return; }             // 낚시 중 좌클릭 = 낚아채기
      const mb = pickMob();
      if (mb) { P._atkCd = 0.45; attackMobHit(mb); mouseHeld = true; return; }   // 몬스터 공격(꾹 누르면 연속)
      const t = currentAim();
      if (t) { doInteract(t); return; }
      // V13-A: 홈도 hold-to-break(금가는 과정) — 아래 mouseHeld=true로 진행
      mouseHeld = true;                                    // 채집: 꾹 누르는 동안 진행
      return;
    }
    if (p.x < cw * 0.4 && moveT.id === -1) { moveT.active = true; moveT.id = e.pointerId; moveT.ox = moveT.x = p.x; moveT.oy = moveT.y = p.y; }
    else if (lookT.id === -1) {
      lookT.id = e.pointerId; lookT.lx = p.x; lookT.ly = p.y; lookT.moved = 0; lookT.downT = performance.now(); lookT.broke = false;
      // V12-D 터치 수정: down 시엔 채집(노드 홀드)만 시작. NPC/포탈 등 즉시 상호작용은
      //   화면 회전과 구분하려고 탭(up)에서 처리 — "회전만 하려는데 강제 상호작용" 버그 해결.
      const t = currentAim();
      lookT.acted = false;
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; lookT.acted = true; }
    }
  }
  function onMove(e) {
    if (panelOpen()) return;
    if (!isTouch) { if (lookS.locked) { P.yaw -= (e.movementX || 0) * 0.0024; P.pitch -= (e.movementY || 0) * 0.0024; clampPitch(); } return; }
    const p = relPos(e);
    if (e.pointerId === moveT.id) { moveT.x = p.x; moveT.y = p.y; }
    else if (e.pointerId === lookT.id) { const dx = p.x - lookT.lx, dy = p.y - lookT.ly; P.yaw -= dx * 0.005; P.pitch -= dy * 0.005; clampPitch(); lookT.lx = p.x; lookT.ly = p.y; lookT.moved = (lookT.moved || 0) + Math.abs(dx) + Math.abs(dy); if (lookT.moved > 10) { gathering = false; breaking = null; } }   // V12-D: 화면 회전 시작하면 채집/파괴 중단
  }
  function onUp(e) {
    if (e.button === 0) { mouseHeld = false; breaking = null; const cr = document.getElementById('econ3dCross'); if (cr && !fishing) cr.textContent = '+'; }
    if (!isTouch) { if (e.button === 0) gathering = false; return; }
    if (e.pointerId === moveT.id) { moveT.active = false; moveT.id = -1; }
    else if (e.pointerId === lookT.id) {
      gathering = false;
      // V12-D: 깨끗한 탭(회전 거의 없이 300ms 미만)만 행동으로 인정 — 회전 드래그는 무시.
      const cleanTap = !lookT.acted && !lookT.broke && (lookT.moved || 0) < 10 && performance.now() - lookT.downT < 300;
      if (cleanTap) {
        const t = currentAim();
        if (t && t.type !== 'node') doInteract(t);        // NPC/포탈/미니언 등 탭 상호작용
        else if (worldMode === 'home') homePlaceBlock();   // 내 섬 빈 탭 = 블록 설치
      }
      lookT.id = -1;
    }
  }
  function bindInput() {
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp); canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', onPLC);
  }
  function unbindInput() {
    document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
    if (canvas) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); }
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointerlockchange', onPLC);
  }

  /* ---------------- 복셀 DDA 레이캐스트(프라이빗 섬 블록 설치/파괴용) ---------------- */
  const REACH_EDIT = 5;
  function raycastBlock() {
    const o = { x: P.x, y: P.y + P.eye, z: P.z }; const d = lookDir();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = d.x > 0 ? 1 : -1, stepY = d.y > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (d.x || 1e-9)), tDY = Math.abs(1 / (d.y || 1e-9)), tDZ = Math.abs(1 / (d.z || 1e-9));
    let tMX = (d.x > 0 ? (x + 1 - o.x) : (o.x - x)) * tDX;
    let tMY = (d.y > 0 ? (y + 1 - o.y) : (o.y - y)) * tDY;
    let tMZ = (d.z > 0 ? (z + 1 - o.z) : (o.z - z)) * tDZ;
    let face = [0, 0, 0];
    for (let i = 0; i < REACH_EDIT * 3; i++) {
      const id = getBlockLocal(x, y, z);
      if (id !== 0) { const b = BLOCKS[id]; if (!b || !b.liquid) return { x, y, z, face, id }; }
      if (tMX < tMY && tMX < tMZ) { x += stepX; tMX += tDX; face = [-stepX, 0, 0]; }
      else if (tMY < tMZ) { y += stepY; tMY += tDY; face = [0, -stepY, 0]; }
      else { z += stepZ; tMZ += tDZ; face = [0, 0, -stepZ]; }
      if (Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y, z + 0.5 - o.z) > REACH_EDIT + 1) break;
    }
    return null;
  }
  let _meshDirty = false, _mapDirty = false;
  function isPortalBlock(x, y, z) {
    const p = PORTALS.home;   // 프라이빗 섬 귀환 포털은 파괴 불가(고립 방지)
    return Math.abs(x - p.x) <= 2 && Math.abs(z - p.z) <= 1 && getBlockLocal(x, y, z) === ID.obsidian;
  }
  // V12 블럭 경제: 파괴하면 블럭이 아이템으로 인벤토리에 들어온다(무한 블럭 폐기).
  function homeBreakBlock() {
    if (worldMode !== 'home') return false;
    const t = raycastBlock(); if (!t) return false;
    if (isPortalBlock(t.x, t.y, t.z)) { if (typeof toast === 'function') toast('포털은 부술 수 없어요', false); return false; }
    if (BLOCKS[t.id] && (BLOCKS[t.id].key === 'bedrock')) { if (typeof toast === 'function') toast('기반암은 부술 수 없어요', false); return false; }
    const tb = BLOCKS[t.id];
    world[widx(t.x, t.y, t.z)] = 0;
    if (econApi().setHomeEdit) econApi().setHomeEdit(t.x, t.y, t.z, 0);
    markBlockDirty(t.x, t.z); _mapDirty = true;
    if (tb && tb.shape === 'door') {   // V17-C: 문은 짝 칸도 함께 제거(아이템은 1개만)
      for (const cy of [t.y + 1, t.y - 1]) {
        const cb = BLOCKS[getBlockLocal(t.x, cy, t.z)];
        if (cb && cb.shape === 'door') { world[widx(t.x, cy, t.z)] = 0; if (econApi().setHomeEdit) econApi().setHomeEdit(t.x, cy, t.z, 0); markBlockDirty(t.x, t.z); break; }
      }
    }
    const drop = blockDropKey(t.id);
    if (drop && econApi().giveItem) econApi().giveItem(drop, 1);   // 파괴 = 아이템 획득
    updateBuildHud();
    return true;
  }
  // V17-C: 문 여닫기(양쪽 칸 동시) — 우클릭이 문을 조준하면 설치 대신 토글
  function toggleDoor(x, y, z) {
    const api = econApi();
    const b0 = BLOCKS[getBlockLocal(x, y, z)]; if (!b0 || b0.shape !== 'door') return false;
    const m = b0.key.match(/^(.*)_door_([co])_(\d)$/); if (!m) return false;
    const wood = m[1], ns = m[2] === 'c' ? 'o' : 'c';
    for (const cy of [y, y + 1, y - 1]) {
      const cb = BLOCKS[getBlockLocal(x, cy, z)];
      if (cb && cb.shape === 'door' && cb.key.indexOf(wood + '_door_') === 0) {
        const cm = cb.key.match(/_door_[co]_(\d)$/);
        const cid = ID[wood + '_door_' + ns + '_' + cm[1]];
        world[widx(x, cy, z)] = cid; if (api.setHomeEdit) api.setHomeEdit(x, cy, z, cid); markBlockDirty(x, z);
      }
    }
    _mapDirty = true; return true;
  }
  // V12 블럭 경제: 핫바에서 고른 블럭 아이템을 소모해서 설치(보유 필요, 무한 아님).
  function homePlaceBlock() {
    if (worldMode !== 'home') return false;
    const t0 = raycastBlock();   // V17-C: 문을 조준하면 여닫기
    if (t0) { const hb = BLOCKS[getBlockLocal(t0.x, t0.y, t0.z)]; if (hb && hb.shape === 'door') return toggleDoor(t0.x, t0.y, t0.z); }
    const key = selectedPlaceKey;
    const api = econApi();
    if (!isPlaceable(key)) return false;   // V13-A: 핫바에 블럭 없으면 조용히(토스트 스팸 제거)
    if (!api.hasItem || !api.hasItem(key, 1)) { updateHotbar(); return false; }
    const t = raycastBlock(); if (!t) return false;
    const nx = t.x + t.face[0], ny = t.y + t.face[1], nz = t.z + t.face[2];
    if (!inBounds(nx, ny, nz) || nx < HOME_BOUNDS.x0 || nx > HOME_BOUNDS.x1 || nz < HOME_BOUNDS.z0 || nz > HOME_BOUNDS.z1) return false;
    if (getBlockLocal(nx, ny, nz) !== 0) return false;
    // 플레이어 몸과 겹치면 설치 불가
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    if (nx + 1 > minX && nx < maxX && nz + 1 > minZ && nz < maxZ && ny + 1 > minY && ny < maxY) return false;
    if (isDoorItem(key)) {   // V17-C: 문은 2칸(아래+위) 설치, 바라보는 방향으로
      if (!inBounds(nx, ny + 1, nz) || getBlockLocal(nx, ny + 1, nz) !== 0) return false;
      if (!api.takeItem || !api.takeItem(key, 1)) return false;
      const d = lookDir(); let f; if (Math.abs(d.x) > Math.abs(d.z)) f = d.x > 0 ? 1 : 3; else f = d.z > 0 ? 2 : 0;
      const did = ID[key + '_c_' + f];
      world[widx(nx, ny, nz)] = did; world[widx(nx, ny + 1, nz)] = did;
      if (api.setHomeEdit) { api.setHomeEdit(nx, ny, nz, did); api.setHomeEdit(nx, ny + 1, nz, did); }
      markBlockDirty(nx, nz); _mapDirty = true; updateBuildHud(); return true;
    }
    if (!api.takeItem || !api.takeItem(key, 1)) return false;   // 소모
    let id = PLACE_BLOCK[key];
    if (isStairsItem(key)) {   // V17: 계단은 바라보는 방향으로 높은 면 배치
      const d = lookDir(); let f;
      if (Math.abs(d.x) > Math.abs(d.z)) f = d.x > 0 ? 1 : 3; else f = d.z > 0 ? 2 : 0;
      id = ID[key + '_' + f];
    }
    world[widx(nx, ny, nz)] = id;
    if (api.setHomeEdit) api.setHomeEdit(nx, ny, nz, id);
    markBlockDirty(nx, nz); _mapDirty = true;
    updateBuildHud();
    return true;
  }
  function flushWorldEdits() {
    if (_meshDirty) { _meshDirty = false; }
    if (dirtyChunks.size) {
      for (const k of dirtyChunks) { const p2 = k.split(','); buildChunk(Number(p2[0]), Number(p2[1])); }
      dirtyChunks.clear();
    }
  }

  /* ---------------- 인월드 채집: 블록을 직접 꾹 눌러 캔다(실제 스카이블럭 방식) ----------------
     돌 → 캐면 조약돌 획득, 블록은 코블스톤으로 → 또 캐면 잠시 기반암 → 시간이 지나면 돌로 재생.
     광석 → 캐면 자원 획득, 잠시 기반암 → 재생. 나무/작물도 캐면 잠시 사라졌다가 다시 자란다. */
  let GB = null;
  function gatherBlocks() {
    if (GB) return GB;
    GB = {};
    GB[ID.stone] = { res: 'stone', fam: 'pickaxe', hard: 1.0, to: ID.cobblestone };
    GB[ID.cobblestone] = { res: 'stone', fam: 'pickaxe', hard: 1.3, to: ID.bedrock, regen: 25, back: ID.stone };
    const ores = { coal_ore: ['coal', 1.7, 30], iron_ore: ['iron', 2.1, 35], gold_ore: ['gold', 2.3, 40], lapis_ore: ['lapis', 2.1, 35], redstone_ore: ['redstone', 2.1, 35], diamond_ore: ['diamond', 3.4, 55], emerald_ore: ['emerald', 3.4, 55] };
    for (const k in ores) GB[ID[k]] = { res: ores[k][0], fam: 'pickaxe', hard: ores[k][1], to: ID.bedrock, regen: ores[k][2], back: ID[k] };
    GB[ID.obsidian] = { res: 'obsidian', fam: 'pickaxe', hard: 4.2, to: ID.bedrock, regen: 70, back: ID.obsidian };
    GB[ID.oak_log] = { res: 'oaklog', fam: 'axe', hard: 0.9, to: 0, regen: 40, back: ID.oak_log };
    GB[ID.birch_log] = { res: 'birchlog', fam: 'axe', hard: 0.9, to: 0, regen: 40, back: ID.birch_log };
    GB[ID.spruce_log] = { res: 'sprucelog', fam: 'axe', hard: 1.0, to: 0, regen: 45, back: ID.spruce_log };
    GB[ID.oak_leaves] = { res: 'apple', chance: 0.05, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.oak_leaves };
    GB[ID.spruce_leaves] = { res: null, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.spruce_leaves };
    GB[ID.wheat_ripe] = { res: 'wheat', fam: 'hoe', hard: 0.25, to: 0, regen: 18, back: ID.wheat_ripe };
    GB[ID.carrot_ripe] = { res: 'carrot', fam: 'hoe', hard: 0.25, to: 0, regen: 18, back: ID.carrot_ripe };
    GB[ID.potato_ripe] = { res: 'potato', fam: 'hoe', hard: 0.25, to: 0, regen: 18, back: ID.potato_ripe };
    GB[ID.sugar_cane] = { res: 'sugarcane', fam: 'hoe', hard: 0.2, to: 0, regen: 20, back: ID.sugar_cane };
    GB[ID.pumpkin] = { res: 'pumpkin', fam: 'hoe', hard: 0.5, to: 0, regen: 30, back: ID.pumpkin };
    GB[ID.melon] = { res: 'melon', fam: 'hoe', hard: 0.5, to: 0, regen: 30, back: ID.melon };
    return GB;
  }
  let breaking = null;          // {x,y,z, t, need}
  let regenQueue = [];          // {x,y,z, back, at}
  let mouseHeld = false;
  // V13-A: 블럭별 채굴 경도(홈 건축 블럭용) — MC식 상대 경도. 도구 배율로 나눠 시간 산출.
  function homeBlockHardness(id) {
    const b = BLOCKS[id]; if (!b) return 0.6;
    const k = b.key;
    if (k === 'obsidian') return 4.2;
    if (/stone|cobble|brick|ore|bedrock|end_stone|quartz|purpur|magma|netherrack/.test(k)) return 1.3;
    if (/log|planks|fence/.test(k)) return 0.9;
    if (/glass|ice|glowstone|leaves|wool|flower|tall_grass|sugar|wheat|carrot|potato/.test(k)) return 0.3;
    if (/dirt|grass|sand|gravel|mycelium|soul_sand|farmland|snow/.test(k)) return 0.5;
    return 0.7;
  }
  function progressBreaking(dt) {
    if (worldMode === 'visit') return;   // 방문은 구경만
    const hit = raycastBlock();
    if (!hit) { breaking = null; return; }
    if (worldMode === 'home' && isPortalBlock(hit.x, hit.y, hit.z)) { breaking = null; return; }
    let g = gatherBlocks()[hit.id];
    if (!g && worldMode === 'home') {   // 홈: 건축 블럭도 hold-to-break(금가는 과정) + 아이템 드롭
      const b = BLOCKS[hit.id];
      if (!b || b.key === 'bedrock' || b.liquid) { breaking = null; return; }
      const bk = BLOCKS[hit.id].key; const fam = /log|planks|leaves|fence|door|trapdoor/.test(bk) ? 'axe' : /dirt|grass|sand|gravel/.test(bk) ? 'pickaxe' : 'pickaxe';
      g = { res: null, homeDrop: blockDropKey(hit.id), fam, hard: homeBlockHardness(hit.id), to: 0, door: BLOCKS[hit.id].shape === 'door' };   // V17-C: 문은 짝 칸도 제거
    }
    if (!g) { breaking = null; return; }
    if (!breaking || breaking.x !== hit.x || breaking.y !== hit.y || breaking.z !== hit.z) {
      const api = econApi();
      const tp = api.toolPower ? api.toolPower(g.fam) : { speedMul: api.toolMul ? api.toolMul(g.fam) : 1 };
      breaking = { x: hit.x, y: hit.y, z: hit.z, t: 0, need: g.hard / Math.max(0.4, tp.speedMul), tp };
    }
    breaking.t += dt;
    const cross = document.getElementById('econ3dCross');
    if (cross) cross.textContent = Math.min(99, Math.round(breaking.t / breaking.need * 100)) + '%';
    if (breaking.t < breaking.need) return;
    // 파괴 완료 → 자원 지급 + 블록 전환 + 재생 예약 (+ 광역 채집/트리캐피테이터)
    const api = econApi();
    const tp = breaking.tp || {};
    doGatherBreak(hit.x, hit.y, hit.z, g, api);
    if (tp.treecap && g.fam === 'axe' && g.to === 0) {
      // 트리캐피테이터: 연결된 원목 전체 벌목(BFS, 최대 48블록)
      const targetIds = [ID.oak_log, ID.birch_log, ID.spruce_log, ID.dark_oak_log, ID.jungle_log, ID.acacia_log];
      const q = [[hit.x, hit.y, hit.z]]; const seen = new Set(); let felled = 0;
      while (q.length && felled < 48) {
        const c = q.shift();
        for (const d2 of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1]]) {
          const nx = c[0] + d2[0], ny = c[1] + d2[1], nz = c[2] + d2[2];
          const k2 = nx + ',' + ny + ',' + nz;
          if (seen.has(k2)) continue; seen.add(k2);
          const id2 = getBlockLocal(nx, ny, nz);
          if (targetIds.indexOf(id2) < 0) continue;
          const g2 = gatherBlocks()[id2];
          if (g2) { doGatherBreak(nx, ny, nz, g2, api); q.push([nx, ny, nz]); felled++; }
        }
      }
      if (felled > 0 && typeof toast === 'function') toast(`🪓 트리캐피테이터! 원목 ${felled + 1}블록 통째 벌목`, true);
    } else if (tp.area > 0) {
      // 광역 채집 인챈트: 주변 같은 종류 블록 +N개 동시 파괴
      let broke = 0;
      outer:
      for (const d2 of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1]]) {
        if (broke >= tp.area) break outer;
        const nx = hit.x + d2[0], ny = hit.y + d2[1], nz = hit.z + d2[2];
        const id2 = getBlockLocal(nx, ny, nz);
        if (id2 !== hit.id) continue;
        const g2 = gatherBlocks()[id2];
        if (g2) { doGatherBreak(nx, ny, nz, g2, api); broke++; }
      }
    }
    if (cross) cross.textContent = '+';
    breaking = null;
  }
  function doGatherBreak(x, y, z, g, api) {
    if (g.res && (g.chance == null || Math.random() < g.chance) && api.gatherBlock) api.gatherBlock(g.res, g.fam);
    if (g.homeDrop !== undefined) {   // V13-A: 홈 건축 블럭 파괴 → 아이템 드롭 + 영속 편집
      if (g.homeDrop && api.giveItem) api.giveItem(g.homeDrop, 1);
      if (api.setHomeEdit) api.setHomeEdit(x, y, z, 0);
    }
    if (g.door) {   // V17-C: 문 짝 칸(위/아래) 함께 제거(아이템은 1개만 지급됨)
      for (const cy of [y + 1, y - 1]) {
        const cb = BLOCKS[getBlockLocal(x, cy, z)];
        if (cb && cb.shape === 'door') { setW(x, cy, z, 0); if (api.setHomeEdit) api.setHomeEdit(x, cy, z, 0); markBlockDirty(x, z); break; }
      }
    }
    setW(x, y, z, g.to);
    if (g.regen) regenQueue.push({ x, y, z, back: g.back, at: performance.now() + g.regen * 1000 });
    markBlockDirty(x, z);
  }
  function tickRegen() {
    if (!regenQueue.length) return;
    const now = performance.now();
    for (let i = regenQueue.length - 1; i >= 0; i--) {
      const q = regenQueue[i];
      if (now < q.at) continue;
      if (getBlockLocal(q.x, q.y, q.z) === ID.bedrock || getBlockLocal(q.x, q.y, q.z) === 0) {
        setW(q.x, q.y, q.z, q.back); markBlockDirty(q.x, q.z);
      }
      regenQueue.splice(i, 1);
    }
  }
  function restoreAllRegen() {   // 월드 이탈 시 즉시 원상복구(캐시된 월드가 영구 고갈되지 않게)
    for (const q of regenQueue) if (getBlockLocal(q.x, q.y, q.z) === ID.bedrock || getBlockLocal(q.x, q.y, q.z) === 0) setW(q.x, q.y, q.z, q.back);
    regenQueue = []; breaking = null;
  }

  /* ---------------- 낚시(실제로 물에 찌 던지고 기다렸다 낚아채기) ---------------- */
  let fishing = null;           // {x,y,z, bobber, state:'wait'|'bite', biteAt, biteUntil}
  function raycastWater(maxD) {
    const d = lookDir(); let x = P.x, y = P.y + P.eye, z = P.z;
    for (let i = 0; i < maxD * 10; i++) {
      x += d.x * 0.1; y += d.y * 0.1; z += d.z * 0.1;
      const id = getBlockLocal(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === ID.water) return { x, y: Math.floor(y) + 0.95, z };
      if (id !== 0 && BLOCKS[id] && BLOCKS[id].solid) return null;
    }
    return null;
  }
  function startFishing() {
    const api = econApi();
    if (!api.hasTool || !api.hasTool('rod')) { if (typeof toast === 'function') toast('낚싯대가 필요해요 (참나무 8 + 거미줄 2 조합)', false); return false; }
    const w = raycastWater(7);
    if (!w) return false;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bob.position.set(w.x, w.y, w.z); scene.add(bob);
    fishing = { x: w.x, y: w.y, z: w.z, bobber: bob, state: 'wait', biteAt: performance.now() + 2000 + Math.random() * 4000 };
    if (typeof toast === 'function') toast('🎣 찌를 던졌어요... 입질이 오면 클릭!', true);
    return true;
  }
  function stopFishing() { if (fishing) { scene.remove(fishing.bobber); fishing.bobber.geometry.dispose(); fishing = null; } }
  function tickFishing() {
    if (!fishing) return;
    const now = performance.now();
    if (Math.hypot(P.vx, P.vz) > 0.5) { stopFishing(); return; }   // 움직이면 취소
    if (fishing.state === 'wait') {
      fishing.bobber.position.y = fishing.y + Math.sin(now / 300) * 0.05;
      if (now >= fishing.biteAt) {
        fishing.state = 'bite'; fishing.biteUntil = now + 1600;
        fishing.bobber.position.y = fishing.y - 0.25;
        const cross = document.getElementById('econ3dCross');
        if (cross) cross.textContent = '❗';
        if (typeof toast === 'function') toast('❗ 입질이다! 지금 클릭!', true);
      }
    } else if (now > fishing.biteUntil) {
      fishing.state = 'wait'; fishing.biteAt = now + 2000 + Math.random() * 4000;
      const cross = document.getElementById('econ3dCross'); if (cross) cross.textContent = '+';
    }
  }
  function reelFishing() {
    if (!fishing) return false;
    const api = econApi();
    if (fishing.state === 'bite' && api.fishCatch) {
      const r = api.fishCatch();
      if (r) {
        if (typeof toast === 'function') toast(`🎣 ${r.name} ×${r.n}${r.extra && r.extra.kind === 'treasure' ? ` + 보물 ${r.extra.coins}G!` : ''}`, true);
        if (r.extra && r.extra.kind === 'seaCreature') spawnSeaCreature(fishing.x, fishing.z, r.extra.deep);
        if (r.extra && r.extra.kind === 'equip' && typeof toast === 'function') toast(`🎣💎 낚시 대어! 장비 [${r.extra.name}] 획득!!`, true);
      }
    }
    const cross = document.getElementById('econ3dCross'); if (cross) cross.textContent = '+';
    stopFishing();
    return true;
  }

  /* ---------------- 인월드 몬스터(실제 스카이블럭식: 이름 위 [Lv] 이름 ❤HP, 변종/정예) ---------------- */
  const MOB_TYPES = {
    // ── 허브 ──  books: 이 몹이 떨어뜨리는 인챈트북(V7: 북은 몹 드롭 전용)
    zombie: { name: '좀비', kind: 'humanoid', color: 0x3a7d3a, hp: 100, dmg: 20, xp: 6, coins: 1, speed: 1.7, books: ['sharpness', 'smite'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'potato', n: 1, chance: 0.08 }, { key: 'carrot', n: 1, chance: 0.08 }], tierCap: 1 },
    skeleton: { name: '스켈레톤', kind: 'humanoid', color: 0xcccccc, hp: 90, dmg: 15, xp: 7, coins: 1, speed: 1.8, books: ['critical', 'prosecute'], drops: [{ key: 'bone', n: 1 }, { key: 'bone', n: 2, chance: 0.4 }], tierCap: 1 },
    crypt_ghoul: { name: '크립트 구울', kind: 'humanoid', color: 0x5a8a5a, hp: 180, dmg: 31, xp: 25, coins: 15, speed: 2.2, books: ['giant_killer', 'execute'], drops: [{ key: 'rotten_flesh', n: 3 }, { key: 'gold', n: 1, chance: 0.25 }], tierCap: 3 },
    golden_ghoul: { name: '골든 구울', kind: 'humanoid', color: 0xd8b23a, hp: 320, dmg: 45, xp: 45, coins: 60, speed: 2.3, books: ['looting'], drops: [{ key: 'gold', n: 3 }, { key: 'talisman_wealth_rune', n: 1, chance: 0.02 }], tierCap: 4 },
    wraith: { name: '레이스', kind: 'tall', color: 0x8a94b8, hp: 250, dmg: 38, xp: 30, coins: 10, speed: 2.6, books: ['life_steal'], drops: [{ key: 'gunpowder', n: 1 }, { key: 'bone', n: 2 }, { key: 'lapis', n: 2, chance: 0.3 }], tierCap: 3 },
    rat: { name: '쥐', kind: 'quad', color: 0x6a6258, hp: 40, dmg: 8, xp: 3, coins: 1, speed: 3.0, scale: 0.45, books: [], drops: [{ key: 'rawfish', n: 1, chance: 0.3 }], tierCap: 0 },
    wolf: { name: '늑대', kind: 'quad', color: 0x9a9a9a, hp: 160, dmg: 20, xp: 10, coins: 4, speed: 2.8, books: ['first_strike', 'looting'], drops: [{ key: 'bone', n: 2 }, { key: 'talisman_wolf_claw', n: 1, chance: 0.015 }], tierCap: 2 },
    old_wolf: { name: '올드 울프', kind: 'quad', color: 0x5a5a62, hp: 900, dmg: 80, xp: 60, coins: 25, speed: 3.0, scale: 1.4, books: ['first_strike', 'experience'], drops: [{ key: 'bone', n: 4 }], tierCap: 4 },
    slime: { name: '슬라임', kind: 'slime', color: 0x5ac26a, hp: 120, dmg: 14, xp: 8, coins: 2, speed: 1.4, books: ['magnet', 'big_brain'], drops: [{ key: 'emerald', n: 1, chance: 0.08 }], tierCap: 2 },
    miner_zombie: { name: '광부 좀비', kind: 'humanoid', color: 0x7a6a4a, hp: 200, dmg: 28, xp: 15, coins: 5, speed: 1.8, books: ['efficiency'], drops: [{ key: 'iron', n: 1, chance: 0.4 }, { key: 'coal', n: 2, chance: 0.5 }], tierCap: 2 },
    lapis_zombie: { name: '청금석 좀비', kind: 'humanoid', color: 0x2a4fc0, hp: 260, dmg: 32, xp: 18, coins: 6, speed: 1.8, books: ['fortune'], drops: [{ key: 'lapis', n: 3 }], tierCap: 3 },
    // V11: 지옥 난이도 전용 필드 보스 5종(hellOnly 구역 — 전용 장비 풀 hell_boss)
    hell_reaper: { name: '지옥 사신 카론', kind: 'tall', color: 0x1a0a0a, hp: 5200, dmg: 60, xp: 400, coins: 500, speed: 2.6, scale: 2.0, fixedLv: 88, hellBoss: true, equipSrc: 'hell_boss', equipSrcChance: 0.6, books: ['giant_killer', 'execute'], drops: [{ key: 'fuming_potato_book', n: 1, chance: 0.3 }, { key: 'ender_shard', n: 4 }], tierCap: 8 },
    hell_broodmatron: { name: '지옥 모충 니드호그', kind: 'spider', color: 0x3a0a14, hp: 4400, dmg: 52, xp: 360, coins: 450, speed: 3.0, scale: 1.9, fixedLv: 82, hellBoss: true, equipSrc: 'hell_boss', equipSrcChance: 0.6, books: ['venomous', 'triple_strike'], drops: [{ key: 'spider_eye', n: 6 }, { key: 'hot_potato_book', n: 1, chance: 0.4 }], tierCap: 8 },
    hell_infernal: { name: '겁화의 군주 수르트', kind: 'blaze', color: 0xff3a00, hp: 6000, dmg: 70, xp: 450, coins: 600, speed: 2.4, scale: 1.8, fixedLv: 92, hellBoss: true, equipSrc: 'hell_boss', equipSrcChance: 0.6, books: ['sharpness', 'last_stand'], drops: [{ key: 'blaze_rod', n: 6 }, { key: 'fuming_potato_book', n: 1, chance: 0.3 }], tierCap: 8 },
    hell_voidtyrant: { name: '공허 폭군 제로스', kind: 'tall', color: 0x14061f, hp: 6800, dmg: 78, xp: 520, coins: 700, speed: 2.7, scale: 2.1, fixedLv: 96, hellBoss: true, equipSrc: 'hell_boss', equipSrcChance: 0.6, books: ['ender_slayer', 'true_protection'], drops: [{ key: 'ender_pearl', n: 6 }, { key: 'fuming_potato_book', n: 1, chance: 0.35 }], tierCap: 8 },
    hell_abysswarden: { name: '심층 감시자 모르드', kind: 'humanoid', color: 0x0a1a2a, hp: 5600, dmg: 64, xp: 420, coins: 550, speed: 2.2, scale: 2.0, fixedLv: 85, hellBoss: true, equipSrc: 'hell_boss', equipSrcChance: 0.6, books: ['fortune', 'efficiency'], drops: [{ key: 'diamond', n: 5 }, { key: 'hot_potato_book', n: 1, chance: 0.4 }], tierCap: 8 },
    // V10 ⑱: 필드 미니보스 3종 — 고정 레벨 + 유니크 전리품(희귀)
    yeti: { name: '❄ 예티', kind: 'tall', color: 0xe8f2f6, hp: 2400, dmg: 31, xp: 150, coins: 200, speed: 2.2, scale: 1.9, fixedLv: 40, miniboss: true, books: ['giant_killer', 'protection'], drops: [{ key: 'yeti_fur', n: 1, chance: 0.34 }, { key: 'diamond', n: 3, chance: 0.5 }, { key: 'emerald', n: 2, chance: 0.3 }], tierCap: 5 },
    gold_golem: { name: '⛏ 골드 골렘', kind: 'tall', color: 0xd8b23a, hp: 2200, dmg: 29, xp: 130, coins: 240, speed: 1.6, scale: 1.7, fixedLv: 35, miniboss: true, books: ['fortune', 'efficiency'], drops: [{ key: 'golem_core', n: 1, chance: 0.34 }, { key: 'gold', n: 6 }, { key: 'emerald', n: 2, chance: 0.4 }], tierCap: 5 },
    mushroom_king: { name: '🍄 무쉬룸 킹', kind: 'quad', color: 0xa83232, hp: 1500, dmg: 21, xp: 90, coins: 120, speed: 2.0, scale: 1.8, fixedLv: 25, miniboss: true, books: ['growth', 'magnet'], drops: [{ key: 'mushroom_crown', n: 1, chance: 0.34 }, { key: 'pumpkin', n: 4 }, { key: 'melon', n: 5 }], tierCap: 4 },
    redstone_pigman: { name: '레드스톤 피그맨', kind: 'humanoid', color: 0xc86a6a, hp: 400, dmg: 42, xp: 24, coins: 8, speed: 2.0, books: ['fortune', 'efficiency'], drops: [{ key: 'redstone', n: 3 }], tierCap: 3 },
    diamond_zombie: { name: '다이아 좀비', kind: 'humanoid', color: 0x5decd5, hp: 700, dmg: 60, xp: 40, coins: 12, speed: 2.0, books: ['area_mining'], drops: [{ key: 'diamond', n: 1, chance: 0.5 }], tierCap: 4 },
    diamond_skeleton: { name: '다이아 스켈레톤', kind: 'humanoid', color: 0x8aeade, hp: 650, dmg: 65, xp: 40, coins: 12, speed: 2.1, books: ['area_mining', 'critical'], drops: [{ key: 'diamond', n: 1, chance: 0.5 }], tierCap: 4 },
    spider: { name: '거미', kind: 'spider', color: 0x3a3040, hp: 80, dmg: 11, xp: 6, coins: 2, speed: 2.4, books: ['bane_of_arthropods', 'triple_strike'], drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 1 }, { key: 'string', n: 2, chance: 0.35 }], tierCap: 1 },
    gravel_skeleton: { name: '자갈 스켈레톤', kind: 'humanoid', color: 0x7d7873, hp: 220, dmg: 30, xp: 16, coins: 5, speed: 1.9, books: ['prosecute'], drops: [{ key: 'gunpowder', n: 1 }, { key: 'bone', n: 2 }, { key: 'string', n: 2, chance: 0.3 }, { key: 'arachne_crystal', n: 1, chance: 1 / 120 }], tierCap: 2 },
    broodmother: { name: '브루드마더', kind: 'spider', color: 0x4a2050, hp: 6000, dmg: 90, xp: 150, coins: 80, speed: 2.2, scale: 2.4, books: ['bane_of_arthropods', 'rejuvenate'], drops: [{ key: 'string', n: 8 }, { key: 'talisman_spider_ring', n: 1, chance: 0.08 }], tierCap: 5 },
    arachne: { name: '아라크네', kind: 'spider', color: 0x8a1a30, hp: 20000, dmg: 160, xp: 300, coins: 150, speed: 2.5, scale: 3.0, books: ['bane_of_arthropods', 'thunderlord'], drops: [{ key: 'string', n: 16 }, { key: 'talisman_spider_ring', n: 1, chance: 0.25 }, { key: 'pet_egg_wolf', n: 1, chance: 0.05 }], tierCap: 6 },
    blaze: { name: '블레이즈', kind: 'blaze', color: 0xe8a020, hp: 600, dmg: 50, xp: 35, coins: 8, speed: 2.0, books: ['fire_aspect', 'thunderlord'], drops: [{ key: 'blaze_rod', n: 1, chance: 0.6 }, { key: 'talisman_lava_charm', n: 1, chance: 0.02 }], tierCap: 4 },
    wither_skeleton: { name: '위더 스켈레톤', kind: 'tall', color: 0x2a2a2a, hp: 900, dmg: 65, xp: 45, coins: 10, speed: 2.2, books: ['titan_killer', 'dragon_hunter'], drops: [{ key: 'bone', n: 2 }, { key: 'coal', n: 3, chance: 0.5 }, { key: 'obsidian', n: 1, chance: 0.1 }], tierCap: 4 },
    magma_cube: { name: '마그마 큐브', kind: 'slime', color: 0xd2541f, hp: 350, dmg: 35, xp: 22, coins: 6, speed: 1.5, books: ['hardened', 'thorns'], drops: [{ key: 'blaze_rod', n: 1, chance: 0.15 }], tierCap: 3 },
    pigman: { name: '피그맨', kind: 'humanoid', color: 0xe6a8ad, hp: 450, dmg: 48, xp: 28, coins: 8, speed: 2.1, books: ['vitality'], drops: [{ key: 'gold', n: 2, chance: 0.6 }], tierCap: 3 },
    enderman: { name: '엔더맨', kind: 'tall', color: 0x1a1a22, hp: 800, dmg: 60, xp: 40, coins: 8, speed: 2.6, books: ['ender_slayer', 'sugar_rush'], drops: [{ key: 'ender_pearl', n: 1, chance: 0.5 }], tierCap: 4 },
    endermite: { name: '엔더마이트', kind: 'quad', color: 0x5a3a6a, hp: 320, dmg: 66, xp: 20, coins: 5, speed: 3.2, scale: 0.5, books: [], drops: [{ key: 'ender_shard', n: 1 }, { key: 'ender_pearl', n: 1, chance: 0.15 }], tierCap: 3 },
    zealot: { name: '젤롯', kind: 'tall', color: 0x2a1a3a, hp: 655, dmg: 63, xp: 6, coins: 2, speed: 2.6, books: ['ender_slayer', 'last_stand', 'true_protection'], drops: [{ key: 'ender_shard', n: 2 }, { key: 'ender_pearl', n: 2 }, { key: 'talisman_void_eye', n: 1, chance: 0.01 }], tierCap: 5 },
    obsidian_defender: { name: '흑요석 수호자', kind: 'tall', color: 0x2a2040, hp: 500, dmg: 29, xp: 30, coins: 8, speed: 1.8, books: ['protection', 'hardened'], drops: [{ key: 'obsidian', n: 2 }], tierCap: 5 },
    watcher: { name: '워처', kind: 'tall', color: 0x3a2a52, hp: 480, dmg: 72, xp: 32, coins: 8, speed: 2.4, books: ['venomous'], drops: [{ key: 'ender_shard', n: 1 }, { key: 'ender_pearl', n: 1, chance: 0.4 }], tierCap: 5 },
    ender_dragon: { name: '엔더 드래곤', kind: 'dragon', color: 0x1a0a2a, hp: 45000, dmg: 220, xp: 500, coins: 300, scale: 1.0, books: ['dragon_hunter', 'growth', 'venomous'], drops: [{ key: 'ender_pearl', n: 8 }, { key: 'aspect_of_the_dragons', n: 1, chance: 0.08 }, { key: 'pet_egg_ender_dragon', n: 1, chance: 0.04 }, { key: 'talisman_dragon_claw', n: 1, chance: 0.06 }, { key: 'talisman_dragon_heart', n: 1, chance: 0.03 }], tierCap: 6 },
    sea_walker: { name: '바다 보행자', kind: 'humanoid', color: 0x2a6a8a, hp: 300, dmg: 25, xp: 20, coins: 6, speed: 1.6, books: ['vampirism', 'protection'], drops: [{ key: 'prismarine', n: 2 }, { key: 'talisman_deep_pearl', n: 1, chance: 0.02 }, { key: 'pet_egg_squid', n: 1, chance: 0.01 }], tierCap: 3 },
    cow: { name: '소', kind: 'quad', color: 0x4a3a2c, hp: 50, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'leather', n: 1 }, { key: 'wheat', n: 1, chance: 0.3 }], tierCap: 0 },
    pig: { name: '돼지', kind: 'quad', color: 0xe6a8ad, hp: 45, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'leather', n: 1 }, { key: 'carrot', n: 1, chance: 0.3 }], tierCap: 0 },
    chicken: { name: '닭', kind: 'quad', color: 0xf2f2f2, hp: 30, dmg: 0, xp: 3, coins: 1, speed: 1.2, scale: 0.5, passive: true, books: [], drops: [{ key: 'feather', n: 2 }, { key: 'talisman_feather', n: 1, chance: 0.005 }], tierCap: 0 },
    sheep: { name: '양', kind: 'quad', color: 0xe9ecec, hp: 45, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'string', n: 1, chance: 0.4 }], tierCap: 0 },
    mushroom_cow: { name: '무쉬룸', kind: 'quad', color: 0xa83232, hp: 50, dmg: 0, xp: 4, coins: 3, speed: 1.0, passive: true, books: [], drops: [{ key: 'wheat', n: 1, chance: 0.4 }, { key: 'pet_egg_elephant', n: 1, chance: 0.004 }], tierCap: 0 },
  };
  /* ── V8 몹 대확장: 지역 변종을 "별도 종"으로 + 개별 드롭률(전부 다름, 위키식 1/N) ── */
  // 스파이더 덴 6종(실제 로스터)
  MOB_TYPES.splitter_spider = { name: '스플리터 거미', kind: 'spider', color: 0x4a3a52, hp: 70, dmg: 10, xp: 5, coins: 2, speed: 2.3, drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 1 }, { key: 'enchant_book_bane_of_arthropods', n: 1, chance: 1 / 90 }], tierCap: 1 };
  MOB_TYPES.weaver_spider = { name: '위버 거미', kind: 'spider', color: 0x2a4a3a, hp: 110, dmg: 14, xp: 7, coins: 3, speed: 2.5, drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 2 }, { key: 'enchant_book_triple_strike', n: 1, chance: 1 / 140 }], tierCap: 1 };
  MOB_TYPES.dasher_spider = { name: '대셔 거미', kind: 'spider', color: 0x30303a, hp: 160, dmg: 19, xp: 9, coins: 4, speed: 3.4, drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 2 }, { key: 'enchant_book_sugar_rush', n: 1, chance: 1 / 220 }], tierCap: 2 };
  MOB_TYPES.voracious_spider = { name: '보라시어스 거미', kind: 'spider', color: 0x5a2030, hp: 420, dmg: 33, xp: 18, coins: 8, speed: 2.8, drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 3 }, { key: 'enchant_book_execute', n: 1, chance: 1 / 350 }], tierCap: 3 };
  MOB_TYPES.spider_jockey = { name: '스파이더 자키', kind: 'jockey', color: 0x3a3040, hp: 260, dmg: 26, xp: 14, coins: 6, speed: 2.9, drops: [{ key: 'string', n: 2 }, { key: 'bone', n: 2 }, { key: 'enchant_book_critical', n: 1, chance: 1 / 180 }], tierCap: 2 };
  MOB_TYPES.tarantula_vermin = { name: '타란튤라 버민', kind: 'spider', color: 0x6a1a1a, hp: 900, dmg: 55, xp: 35, coins: 14, speed: 3.0, scale: 1.3, drops: [{ key: 'string', n: 4 }, { key: 'arachne_crystal', n: 1, chance: 1 / 40 }, { key: 'enchant_book_bane_of_arthropods', n: 1, chance: 1 / 60 }], tierCap: 4 };
  // 네더 7종(가스트/좀비 피글린/화염 거미 추가 — 가스트는 부유)
  MOB_TYPES.ghast = { name: '가스트', kind: 'ghast', color: 0xe8e8e8, hp: 1200, dmg: 90, xp: 55, coins: 18, speed: 1.6, fly: true, drops: [{ key: 'ghast_tear', n: 1, chance: 1 / 6 }, { key: 'gunpowder', n: 2 }, { key: 'blaze_rod', n: 1, chance: 1 / 8 }, { key: 'enchant_book_dragon_hunter', n: 1, chance: 1 / 600 }], tierCap: 4 };
  MOB_TYPES.zombie_pigman = { name: '좀비 피글린', kind: 'humanoid', color: 0xd8909a, hp: 550, dmg: 52, xp: 30, coins: 9, speed: 2.1, drops: [{ key: 'gold', n: 2, chance: 1 / 2 }, { key: 'enchant_book_vitality', n: 1, chance: 1 / 240 }], tierCap: 3 };
  MOB_TYPES.flaming_spider = { name: '화염 거미', kind: 'spider', color: 0xc84a1a, hp: 800, dmg: 70, xp: 42, coins: 12, speed: 3.1, drops: [{ key: 'spider_eye', n: 1 }, { key: 'blaze_rod', n: 1, chance: 1 / 5 }, { key: 'string', n: 3 }, { key: 'enchant_book_fire_aspect', n: 1, chance: 1 / 150 }], tierCap: 4 };
  // 늑대 5종(하울링 케이브 계열)
  MOB_TYPES.pack_spirit = { name: '팩 스피릿', kind: 'quad', color: 0xb8c4d8, hp: 700, dmg: 60, xp: 35, coins: 10, speed: 3.0, drops: [{ key: 'bone', n: 3 }, { key: 'enchant_book_first_strike', n: 1, chance: 1 / 200 }], tierCap: 3 };
  MOB_TYPES.howling_spirit = { name: '하울링 스피릿', kind: 'quad', color: 0x8a9ab8, hp: 1100, dmg: 75, xp: 45, coins: 14, speed: 3.2, drops: [{ key: 'bone', n: 4 }, { key: 'enchant_book_experience', n: 1, chance: 1 / 260 }], tierCap: 4 };
  MOB_TYPES.soul_of_the_alpha = { name: '알파의 영혼', kind: 'quad', color: 0xdae8f8, hp: 3200, dmg: 120, xp: 90, coins: 30, speed: 3.4, scale: 1.5, drops: [{ key: 'bone', n: 6 }, { key: 'talisman_wolf_claw', n: 1, chance: 1 / 30 }, { key: 'enchant_book_looting', n: 1, chance: 1 / 45 }], tierCap: 5 };
  // 좀비 라인 보강
  MOB_TYPES.zombie_villager = { name: '좀비 주민', kind: 'humanoid', color: 0x5a7a3a, hp: 120, dmg: 24, xp: 7, coins: 1, speed: 1.7, drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'carrot', n: 1, chance: 1 / 10 }], tierCap: 1 };
  // 엔더 드래곤 8종(실제 유형 + 신성) — 서로 다른 레벨/체력/드롭률
  const DRAGON_TYPES = [
    ['protector_dragon', '프로텍터 드래곤', 0x8a94b8, 80, 30000, 160, 1 / 60, 1 / 120],
    ['old_dragon', '올드 드래곤', 0x9a8a6a, 90, 42000, 180, 1 / 55, 1 / 110],
    ['wise_dragon', '와이즈 드래곤', 0x54c8e8, 100, 36000, 200, 1 / 50, 1 / 100],
    ['unstable_dragon', '언스테이블 드래곤', 0x1a1a2a, 110, 38000, 240, 1 / 45, 1 / 90],
    ['young_dragon', '영 드래곤', 0xdadde0, 120, 34000, 220, 1 / 45, 1 / 90],
    ['strong_dragon', '스트롱 드래곤', 0xc0392b, 130, 48000, 280, 1 / 35, 1 / 70],
    ['superior_dragon', '슈페리어 드래곤', 0xf2d75c, 150, 60000, 340, 1 / 20, 1 / 40],
    ['holy_dragon', '홀리 드래곤', 0xfff4d8, 200, 90000, 400, 1 / 12, 1 / 25],
  ];
  DRAGON_TYPES.forEach(dt => {
    MOB_TYPES[dt[0]] = { name: dt[1], kind: 'dragon', color: dt[2], hp: Math.round(dt[4] / (1 + (dt[3] - 1) * 0.35)), dmg: Math.round(dt[5] / (1 + (dt[3] - 1) * 0.35) * 3), xp: 40, coins: 30, speed: 2.8,
      drops: [{ key: 'ender_pearl', n: 8 }, { key: 'aspect_of_the_dragons', n: 1, chance: dt[6] }, { key: 'pet_egg_ender_dragon', n: 1, chance: dt[7] / 4 }, { key: 'talisman_dragon_claw', n: 1, chance: dt[7] }, { key: 'talisman_dragon_heart', n: 1, chance: dt[7] / 2 }], tierCap: 6, fixedLv: dt[3] };
  });
  // 던전 몹 105종 생성(층 7 × 원형 15) — 층이 오를수록 강하고 드롭률 상이
  const DG_ARCHETYPES = [
    ['크립트 언데드', 'humanoid', 0x3a6a3a, 1.0], ['크립트 수시어', 'humanoid', 0x4a7a5a, 1.15], ['좀비 솔저', 'humanoid', 0x5a6a3a, 1.3],
    ['좀비 나이트', 'humanoid', 0x3a4a6a, 1.5], ['크립트 드레드로드', 'humanoid', 0x2a2a4a, 1.8], ['로스트 어드벤처러', 'humanoid', 0xc8a25a, 2.2],
    ['스켈레톤 솔저', 'humanoid', 0xbababa, 1.2], ['스켈레톤 마스터', 'humanoid', 0x8a8a9a, 1.7], ['위더맨서', 'tall', 0x2a2a2a, 2.0],
    ['던전 거미', 'spider', 0x3a3050, 1.1], ['던전 슬라임', 'slime', 0x5a4ac2, 1.25], ['테라코타 병사', 'humanoid', 0xb86a3a, 1.6],
    ['펠스', 'tall', 0x1a1a1a, 2.4], ['섀도우 어쌔신', 'humanoid', 0x252530, 2.8], ['미니 위더', 'slime', 0x1a1a22, 3.2],
  ];
  const DG_FLOOR_BOOKS = [
    ['protection', 'sharpness'], ['growth', 'critical'], ['venomous', 'triple_strike'], ['cubism', 'prosecute'],
    ['giant_killer', 'rejuvenate'], ['titan_killer', 'last_stand'], ['dragon_hunter', 'true_protection'],
  ];
  for (let f = 1; f <= 7; f++) {
    DG_ARCHETYPES.forEach((a, i) => {
      const base = 60 * Math.pow(2.1, f - 1) * a[3];
      MOB_TYPES[`dg_f${f}_${i}`] = {
        name: `${a[0]} F${f}`, kind: a[1], color: a[2], hp: Math.round(base), dmg: Math.round(8 * Math.pow(1.75, f - 1) * a[3]),
        xp: Math.round(6 * f * a[3]), coins: Math.round(2 * f * a[3]), speed: 1.8 + (i % 5) * 0.25,
        drops: [
          { key: 'dungeon_essence', n: 1, chance: 1 / (4 + i % 4) },
          { key: `enchant_book_${DG_FLOOR_BOOKS[f - 1][i % 2]}`, n: 1, chance: 1 / (120 + i * 40 + f * 30) },   // 층·몹별 상이(1/150~1/900)
        ], tierCap: Math.min(6, f), equipChance: 1 / (400 + i * 120),   // 장비 1/400~1/2080
      };
    });
  }

  // 스폰 구역: 실제 스카이블럭처럼 특정 지역에 특정 몬스터(레벨 범위 내 변종 + 5% 정예 ★)
  let SPAWN_AREAS = [
    { world: 'hub', x: 152, z: 314, r: 26, types: ['zombie', 'skeleton'], lv: [1, 6], cap: 8, respawn: 9 },     // 묘지(실제: Graveyard Zombie Lv1)
    { world: 'hub', x: 152, z: 344, r: 12, types: ['crypt_ghoul'], lv: [28, 32], cap: 2, respawn: 20 },         // 크립트(Lv30 구울)
    { world: 'hub', x: 88, z: 208, r: 16, types: ['slime'], lv: [3, 8], cap: 3, respawn: 14 },                  // 석탄 광산 챔버
    { world: 'hub', x: 224, z: 100, r: 34, types: ['wolf'], lv: [8, 15], cap: 4, respawn: 15 },                 // 설산 늑대
    { world: 'hub', x: 140, z: 130, r: 26, types: ['wolf'], lv: [6, 10], cap: 3, respawn: 16 },                 // 숲
    { world: 'hub', x: 224, z: 352, r: 12, types: ['zombie'], lv: [10, 20], cap: 3, respawn: 14 },              // 콜로세움(훈련용)
  ];
  SPAWN_AREAS = SPAWN_AREAS.concat([
    // 스파이더 덴: 산을 오를수록 강한 거미(기슭 → 중턱 → 정상), 정상엔 브루드마더
    { world: 'spider', x: 64, z: 64, r: 52, rMin: 34, types: ['spider'], lv: [2, 5], cap: 8, respawn: 8 },
    { world: 'spider', x: 64, z: 64, r: 32, rMin: 16, types: ['spider'], lv: [6, 10], cap: 6, respawn: 10 },
    { world: 'spider', x: 64, z: 64, r: 15, rMin: 5, types: ['spider'], lv: [11, 13], cap: 4, respawn: 12 },
    { world: 'spider', x: 64, z: 64, r: 5, types: ['broodmother'], lv: [50, 50], cap: 1, respawn: 60 },
    // 딥 캐번/골드 광산
    { world: 'deep', x: 48, z: 48, r: 30, y: 20, types: ['slime'], lv: [5, 10], cap: 6, respawn: 12 },
    { world: 'deep', x: 48, z: 48, r: 26, y: 10, types: ['zombie'], lv: [10, 20], cap: 4, respawn: 14 },
    { world: 'gold', x: 56, z: 46, r: 26, types: ['zombie', 'skeleton'], lv: [8, 15], cap: 5, respawn: 12 },
    // 네더 던전 요새: 첨탑 블레이즈 + 위더 홀 + 마그마
    { world: 'nether', x: 40, z: 40, r: 8, y: 34, types: ['blaze'], lv: [12, 25], cap: 3, respawn: 13 },
    { world: 'nether', x: 88, z: 88, r: 8, y: 34, types: ['blaze'], lv: [15, 25], cap: 3, respawn: 13 },
    { world: 'nether', x: 64, z: 43, r: 9, y: 22, types: ['wither_skeleton'], lv: [10, 20], cap: 3, respawn: 15 },
    { world: 'nether', x: 64, z: 80, r: 26, types: ['magma_cube'], lv: [8, 18], cap: 5, respawn: 12 },
    { world: 'nether', x: 88, z: 40, r: 20, types: ['zombie_pigman', 'pigman'], lv: [10, 18], cap: 4, respawn: 13 },
    { world: 'nether', x: 64, z: 64, r: 40, rMin: 20, types: ['ghast'], lv: [17, 25], cap: 2, respawn: 25 },
    { world: 'nether', x: 40, z: 88, r: 18, types: ['flaming_spider'], lv: [14, 22], cap: 3, respawn: 15 },
    // 허브 확장(폐허/크립트 심부/가축) + 딥 캐번 층별 몹 + 자갈 광산
    { world: 'hub', x: 88, z: 280, r: 24, types: ['old_wolf'], lv: [45, 50], cap: 1, respawn: 40 },
    { world: 'hub', x: 88, z: 280, r: 20, types: ['rat'], lv: [1, 3], cap: 3, respawn: 10 },
    { world: 'hub', x: 152, z: 344, r: 10, types: ['wraith', 'golden_ghoul'], lv: [26, 34], cap: 2, respawn: 30 },
    { world: 'hub', x: 152, z: 314, r: 26, types: ['zombie_villager'], lv: [1, 3], cap: 3, respawn: 12 },
    { world: 'hub', x: 330, z: 224, r: 34, types: ['cow', 'pig', 'chicken', 'sheep'], lv: [1, 1], cap: 8, respawn: 8 },
    { world: 'gold', x: 56, z: 46, r: 26, types: ['miner_zombie'], lv: [8, 15], cap: 4, respawn: 12 },
    { world: 'deep', x: 48, z: 48, r: 28, y: 26, types: ['lapis_zombie'], lv: [7, 12], cap: 4, respawn: 13 },
    { world: 'deep', x: 48, z: 48, r: 28, y: 21, types: ['redstone_pigman'], lv: [12, 18], cap: 4, respawn: 13 },
    { world: 'deep', x: 48, z: 48, r: 26, y: 11, types: ['diamond_zombie', 'diamond_skeleton'], lv: [15, 25], cap: 4, respawn: 15 },
    { world: 'spider', x: 40, z: 96, r: 14, types: ['gravel_skeleton'], lv: [5, 10], cap: 3, respawn: 14 },
    { world: 'end', x: 64, z: 64, r: 24, y: 8, types: ['obsidian_defender', 'watcher'], lv: [55, 55], cap: 3, respawn: 22 },
    { world: 'end', x: 64, z: 64, r: 40, rMin: 20, types: ['endermite'], lv: [37, 43], cap: 3, respawn: 16 },
    { world: 'barn', x: 72, z: 72, r: 44, types: ['cow', 'pig', 'chicken', 'sheep'], lv: [1, 2], cap: 12, respawn: 7 },
    // 엔드: 상판 엔더맨, 심연 아래 드래곤 둥지(젤롯 + 드래곤)
    { world: 'end', x: 64, z: 64, r: 50, rMin: 18, types: ['enderman'], lv: [42, 50], cap: 6, respawn: 14 },
    { world: 'end', x: 64, z: 64, r: 26, y: 8, types: ['zealot'], lv: [55, 55], cap: 3, respawn: 25 },
    { world: 'end', x: 64, z: 64, r: 8, y: 8, types: ['protector_dragon', 'old_dragon', 'wise_dragon', 'unstable_dragon', 'young_dragon', 'strong_dragon', 'superior_dragon', 'holy_dragon'], lv: [80, 200], cap: 1, respawn: 120 },   // 8종 드래곤 랜덤 소환
    // 파크/버섯 사막
    { world: 'park', x: 72, z: 72, r: 60, rMin: 24, types: ['wolf'], lv: [8, 15], cap: 4, respawn: 15 },
    { world: 'mushroom', x: 50, z: 72, r: 34, types: ['mushroom_cow'], lv: [1, 3], cap: 6, respawn: 10 },
    // V10 ⑱: 필드 미니보스(고정 레벨 1마리씩)
    { world: 'hub', x: 224, z: 110, r: 14, types: ['yeti'], lv: [40, 40], cap: 1, respawn: 90 },          // 설산 정상
    { world: 'gold', x: 56, z: 46, r: 16, types: ['gold_golem'], lv: [35, 35], cap: 1, respawn: 90 },     // 골드 광산 심부
    { world: 'mushroom', x: 72, z: 72, r: 20, types: ['mushroom_king'], lv: [25, 25], cap: 1, respawn: 90 },   // 버섯 사막 중앙
    // V11: 지옥 난이도 전용 보스 구역(각 월드 1) — hellOnly
    { world: 'hub', x: 152, z: 330, r: 12, types: ['hell_reaper'], lv: [88, 88], cap: 1, respawn: 150, hellOnly: true },       // 묘지 심부
    { world: 'spider', x: 64, z: 64, r: 8, types: ['hell_broodmatron'], lv: [82, 82], cap: 1, respawn: 150, hellOnly: true },  // 거미산 정상
    { world: 'nether', x: 64, z: 64, r: 14, types: ['hell_infernal'], lv: [92, 92], cap: 1, respawn: 150, hellOnly: true },
    { world: 'end', x: 64, z: 64, r: 16, types: ['hell_voidtyrant'], lv: [96, 96], cap: 1, respawn: 150, hellOnly: true },
    { world: 'deep', x: 48, z: 48, r: 14, y: 10, types: ['hell_abysswarden'], lv: [85, 85], cap: 1, respawn: 150, hellOnly: true },
  ]);
  let mobs = [];               // {type,def,lv,elite,hp,maxHp,dmg,mesh,label,labelCv,area,state,tx,tz,atkCd,hitIdx,dead}
  let _spawnT = 0;
  function mkMobLabel(mob) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    spr.scale.set(2.2, 0.55, 1);
    mob.labelCv = cv; mob.label = spr;
    drawMobLabel(mob);
    return spr;
  }
  function drawMobLabel(mob) {
    const c = mob.labelCv.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 256, 40);
    c.textAlign = 'center'; c.font = 'bold 22px sans-serif';
    c.fillStyle = mob.elite ? '#ff7ad9' : '#aefda6';
    c.fillText(`${mob.elite ? '★ ' : ''}[Lv ${mob.lv}] ${mob.def.name}`, 128, 21);
    c.fillStyle = '#222'; c.fillRect(28, 44, 200, 12);
    c.fillStyle = '#e5484d'; c.fillRect(28, 44, Math.max(2, 200 * mob.hp / mob.maxHp), 12);
    c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif';
    c.fillText(`❤ ${Math.max(0, Math.ceil(mob.hp))}/${mob.maxHp}`, 128, 54);
    mob.label.material.map.needsUpdate = true;
  }
  function addEyes(g, y, z, col, gap) {
    const e1 = mkBox(0.08, 0.08, 0.04, col, -(gap || 0.12), y, z), e2 = mkBox(0.08, 0.08, 0.04, col, gap || 0.12, y, z);
    g.add(e1); g.add(e2);
  }
  function buildSpiderMesh(col) {
    const g = new THREE.Group(); const legs = [];
    const dark = shade(col, 0.7);
    g.add(mkBox(0.7, 0.45, 0.9, col, 0, 0.5, -0.25));            // 복부
    g.add(mkBox(0.5, 0.4, 0.45, shade(col, 1.15), 0, 0.5, 0.4)); // 두흉부
    addEyes(g, 0.62, 0.63, 0xe5484d, 0.1);                        // 붉은 눈
    for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) {      // 8다리
      const leg = mkBox(0.9, 0.07, 0.07, dark, sgn * 0.55, 0.42, -0.35 + i * 0.24);
      leg.rotation.z = sgn * 0.5;
      g.add(leg); legs.push(leg);
    }
    return { group: g, legs };
  }
  function buildBlazeMesh(col) {
    const g = new THREE.Group();
    const core = mkBox(0.45, 0.45, 0.45, 0xf7d02a, 0, 1.1, 0); g.add(core);
    addEyes(g, 1.18, 0.24, 0x2a1a00, 0.1);
    const rods = [];
    for (let i = 0; i < 6; i++) {
      const rod = mkBox(0.14, 0.5, 0.14, i % 2 ? col : shade(col, 0.8), Math.cos(i / 6 * Math.PI * 2) * 0.55, 0.7 + (i % 2) * 0.5, Math.sin(i / 6 * Math.PI * 2) * 0.55);
      g.add(rod); rods.push(rod);
    }
    return { group: g, legs: [], rods };
  }
  function buildDragonMesh(col) {
    const g = new THREE.Group();
    const dark = shade(col, 0.7), light = 0x8a4ae8;
    g.add(mkBox(1.3, 0.9, 2.4, col, 0, 1.0, 0));                  // 몸통
    g.add(mkBox(0.5, 0.5, 1.0, col, 0, 1.5, 1.6));                // 목
    g.add(mkBox(0.7, 0.55, 0.9, shade(col, 1.3), 0, 1.7, 2.4));   // 머리
    addEyes(g, 1.8, 2.86, 0xb04ae8, 0.2);
    g.add(mkBox(0.18, 0.3, 0.18, dark, -0.22, 2.1, 2.3)); g.add(mkBox(0.18, 0.3, 0.18, dark, 0.22, 2.1, 2.3));   // 뿔
    g.add(mkBox(0.4, 0.35, 1.6, dark, 0, 0.95, -1.9));            // 꼬리
    const wingL = mkBox(2.6, 0.1, 1.4, light, -1.8, 1.5, -0.2);
    const wingR = mkBox(2.6, 0.1, 1.4, light, 1.8, 1.5, -0.2);
    g.add(wingL); g.add(wingR);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(o => g.add(mkBox(0.25, 0.6, 0.25, dark, o[0] * 0.5, 0.3, o[1] * 0.8)));
    return { group: g, legs: [], wings: [wingL, wingR] };
  }
  function buildMobMesh(def, elite) {
    let h;
    if (def.kind === 'spider') h = buildSpiderMesh(def.color);
    else if (def.kind === 'blaze') h = buildBlazeMesh(def.color);
    else if (def.kind === 'dragon') h = buildDragonMesh(def.color);
    else if (def.kind === 'jockey') {
      h = buildSpiderMesh(def.color);
      const rider = buildHumanoid(0xbababa); rider.group.scale.setScalar(0.55); rider.group.position.set(0, 0.85, 0.1);
      h.group.add(rider.group);
    }
    else if (def.kind === 'ghast') {
      const g = new THREE.Group();
      g.add(mkBox(1.3, 1.3, 1.3, def.color, 0, 1.6, 0));
      addEyes(g, 1.85, 0.68, 0x8a1a1a, 0.24);
      const tent = [];
      for (let i = 0; i < 5; i++) { const t = mkBox(0.16, 0.9, 0.16, shade(def.color, 0.8), -0.4 + i * 0.2, 0.55, (i % 2) * 0.3 - 0.15); g.add(t); tent.push(t); }
      h = { group: g, legs: tent };
    }
    else if (def.kind === 'quad') {
      h = buildQuadruped(def.color, 0.9);
      addEyes(h.group, 0.62, 0.62, 0x1a1a1a, 0.12);
      if (def.color === 0xa83232) { h.group.add(mkBox(0.5, 0.2, 0.5, 0xb02724, 0, 0.85, -0.1)); h.group.add(mkBox(0.3, 0.15, 0.3, 0xf2efe4, 0, 1.0, -0.1)); }   // 무쉬룸 버섯 갓
      if (def.color === 0x9a9a9a || def.color === 0x5a5a62) { h.group.add(mkBox(0.12, 0.18, 0.1, shade(def.color, 0.7), -0.16, 0.85, 0.52)); h.group.add(mkBox(0.12, 0.18, 0.1, shade(def.color, 0.7), 0.16, 0.85, 0.52)); h.group.add(mkBox(0.1, 0.1, 0.45, shade(def.color, 0.8), 0, 0.6, -0.65)); }   // 늑대 귀+꼬리
    }
    else if (def.kind === 'tall') { h = buildHumanoid(def.color); h.group.scale.set(1, 1.45, 1); addEyes(h.group, 1.85, 0.16, def.color === 0x1a1a22 || def.color === 0x2a1a3a ? 0xb04ae8 : 0xe5484d); }
    else { h = buildHumanoid(def.color); addEyes(h.group, 1.85, 0.16, 0x1a1a1a); }
    if (def.scale) h.group.scale.multiplyScalar(def.scale);
    if (elite) h.group.scale.multiplyScalar(1.25);
    return h;
  }
  function spawnMob(area, typeKey, lv, customDef) {
    let def = customDef || MOB_TYPES[typeKey]; if (!def) return null;
    if (def.fixedLv) lv = def.fixedLv;   // 드래곤 등 종 고정 레벨
    const a = Math.random() * Math.PI * 2;
    const rMin = area.rMin || 0;
    const rr = rMin + Math.random() * Math.max(1, area.r * 0.9 - rMin);
    const x = area.x + Math.cos(a) * rr, z = area.z + Math.sin(a) * rr;
    const y = area.y != null ? groundBelow(Math.floor(x), Math.floor(z), area.y + 2) : surfaceTop(Math.floor(x), Math.floor(z));
    if (y <= SEA + 1 && worldMode === 'hub') return null;   // 물 위 스폰 방지
    const elite = !customDef && !def.miniboss && Math.random() < 0.05;   // 미니보스는 정예 중첩 제외(설계 난이도 고정)
    // V11: 필드 난이도(쉬움~지옥) — 던전/프라이빗/방문 제외 전 필드 적용
    const apiF = econApi();
    const isField = worldMode !== 'dungeon' && worldMode !== 'home' && worldMode !== 'visit' && !customDef;
    const fdiff = isField && apiF.fieldDiff ? apiF.fieldDiff() : null;
    let hpMulD = 1, dmgMulD = 1, rewardMul = 1;
    if (fdiff) {
      lv = Math.max(1, Math.min(100, Math.round(lv * fdiff.lvMul)));   // V11: 지옥은 Lv100까지
      hpMulD = fdiff.hpMul; dmgMulD = fdiff.dmgMul; rewardMul = fdiff.rewardMul;
    }
    let weekly = false;   // V11: 주간 순환 강화 보스 계열(⭐ HP·보상 2배)
    if (isField && apiF.weeklyFamily && apiF.slayerFamilyOf && apiF.slayerFamilyOf(typeKey) === apiF.weeklyFamily()) {
      weekly = true;
      const WK = window.ECON_DATA.WEEKLY; hpMulD *= WK.hpMul; rewardMul *= WK.rewardMul;
    }
    const mul = 1 + (lv - 1) * 0.35;
    const mob = {
      type: typeKey, def, lv, elite, rewardMul, weekly,
      maxHp: Math.round(def.hp * mul * (elite ? 2.5 : 1) * hpMulD),
      dmg: Math.round(def.dmg * mul * (elite ? 1.5 : 1) * dmgMulD),
      state: 'wander', tx: x, tz: z, atkCd: 0, hitIdx: 0, area, walkT: Math.random() * 6,
    };
    mob.hp = mob.maxHp;
    const h = buildMobMesh(def, elite);
    mob.mesh = h.group; mob.legs = h.legs || []; mob.legL = h.legL; mob.legR = h.legR; mob.rods = h.rods; mob.wings = h.wings;
    if (elite || def.miniboss) {   // V10 ⑲: 정예·미니보스 발밑 오라 링
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(def.miniboss ? 1.5 : 0.9, 0.07, 6, 20),
        new THREE.MeshBasicMaterial({ color: def.miniboss ? 0xd83a3a : 0xf6c945, transparent: true, opacity: 0.75 })
      );
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
      mob.mesh.add(ring); mob.auraRing = ring;
    }
    mob.mesh.position.set(x, y, z);
    if (weekly) mob.def = Object.assign({}, mob.def, { name: '⭐ ' + mob.def.name });
    const lbl = mkMobLabel(mob);
    lbl.position.set(0, def.kind === 'tall' ? 3.2 : 2.4, 0);
    mob.mesh.add(lbl);
    scene.add(mob.mesh);
    mobs.push(mob);
    return mob;
  }
  /* ---- V11: 콜로세움 웨이브 아레나(10웨이브 × 4난이도) ---- */
  let arenaState = null;   // {diff, ad, wave, pending}
  const ARENA_POS = { x: 224, z: 352, r: 10 };
  const ARENA_WAVE_MOBS = ['zombie', 'skeleton', 'spider', 'wolf', 'blaze', 'wither_skeleton', 'magma_cube', 'enderman'];
  function economy3dArenaStart(diffKey) {
    if (!running || worldMode !== 'hub') { if (typeof toast === 'function') toast('아레나는 허브 콜로세움에서!', false); return false; }
    const api = econApi();
    const ad = api.arenaDiff ? api.arenaDiff(diffKey) : null;
    if (!ad || arenaState) return false;
    arenaState = { diff: diffKey, ad, wave: 0, pending: 0 };
    P.x = ARENA_POS.x + 0.5; P.z = ARENA_POS.z + 6.5; P.y = surfaceTop(ARENA_POS.x, ARENA_POS.z + 6) + 0.02;
    arenaNextWave();
    return true;
  }
  function arenaNextWave() {
    if (!arenaState) return;
    arenaState.wave++;
    const W10 = window.ECON_DATA.ARENA.waves;
    if (arenaState.wave > W10) {
      const api = econApi(); if (api.arenaComplete) api.arenaComplete(arenaState.diff);
      arenaState = null;
      return;
    }
    const ad = arenaState.ad;
    const n = 3 + Math.floor(arenaState.wave / 2);   // 3~8마리
    arenaState.pending = n;
    for (let i = 0; i < n; i++) {
      const tk = ARENA_WAVE_MOBS[Math.floor(Math.random() * ARENA_WAVE_MOBS.length)];
      const base = MOB_TYPES[tk];
      const def = Object.assign({}, base, {
        name: `🏟️ ${base.name}`, passive: false,
        hp: Math.round(base.hp * ad.hpMul * (1 + arenaState.wave * 0.25)),
        dmg: Math.round(base.dmg * (0.8 + ad.hpMul * 0.25)),
      });
      const mob = spawnMob({ x: ARENA_POS.x, z: ARENA_POS.z, r: ARENA_POS.r, world: 'hub' }, tk, ad.lv + arenaState.wave, def);
      if (mob) { mob.arena = true; mob.state = 'chase'; }
    }
    if (typeof toast === 'function') toast(`🏟️ 웨이브 ${arenaState.wave}/${W10} — ${n}마리!`, arenaState.wave === 1);
  }
  function onArenaMobDead(m) {
    if (!arenaState) return;
    arenaState.pending--;
    if (arenaState.pending <= 0) {
      const api = econApi();
      if (api.arenaWaveCleared) api.arenaWaveCleared(arenaState.diff, arenaState.wave);
      setTimeout(() => { if (running && arenaState) arenaNextWave(); }, 1800);
    }
  }
  function cancelArena() {
    if (!arenaState) return;
    for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].arena) { scene.remove(mobs[i].mesh); disposeGroup(mobs[i].mesh); mobs.splice(i, 1); }
    arenaState = null;
  }
  window.economy3dArenaStart = economy3dArenaStart;
  const DEEP_SEA = [   // V11: 낚시 Lv15+ 심해 전설 생물(전용 장비 풀 deep_fishing)
    { name: '심해 아귀 어둠니', kind: 'quad', color: 0x0a2a3a, hp: 2600, dmg: 34, xp: 250, coins: 350, speed: 2.4, scale: 1.6, fixedLv: 40, equipSrc: 'deep_fishing', equipSrcChance: 0.45, books: ['magnet'], drops: [{ key: 'prismarine', n: 4 }, { key: 'sponge', n: 2, chance: 0.5 }], tierCap: 6 },
    { name: '심연 리바이어던', kind: 'dragon', color: 0x123a5a, hp: 4200, dmg: 46, xp: 380, coins: 550, speed: 2.2, scale: 1.4, fixedLv: 60, equipSrc: 'deep_fishing', equipSrcChance: 0.5, books: ['giant_killer'], drops: [{ key: 'enchanted_iron', n: 1, chance: 0.4 }, { key: 'clay', n: 5 }], tierCap: 7 },
    { name: '바다 황제 포세돈', kind: 'tall', color: 0x1a5a7a, hp: 5600, dmg: 56, xp: 480, coins: 750, speed: 2.5, scale: 1.9, fixedLv: 80, equipSrc: 'deep_fishing', equipSrcChance: 0.55, books: ['last_stand'], drops: [{ key: 'pufferfish', n: 6 }, { key: 'hot_potato_book', n: 1, chance: 0.35 }], tierCap: 8 },
  ];
  // V20-H: 얕은 바다 생물 로스터 — 실제 스카이블럭 바다생물(희귀도 가중·낚시레벨 게이팅). 심해(DEEP_SEA)보다 약함.
  const SHALLOW_SEA = [
    { name: '오징어', kind: 'quad', color: 0x5a4a6a, hp: 120, dmg: 8, xp: 30, coins: 25, speed: 2.6, scale: 0.9, weight: 30, minLv: 0, drops: [{ key: 'rawfish', n: 2, chance: 0.6 }] },
    { name: '바다 방랑자', kind: 'tall', color: 0x2a6a8a, hp: 200, dmg: 12, xp: 45, coins: 40, speed: 2.8, scale: 1.0, weight: 24, minLv: 0, drops: [{ key: 'rawfish', n: 2 }] },
    { name: '밤 오징어', kind: 'quad', color: 0x1a1a3a, hp: 260, dmg: 15, xp: 60, coins: 60, speed: 3.0, scale: 0.95, weight: 14, minLv: 5, drops: [{ key: 'salmon', n: 3, chance: 0.7 }, { key: 'clownfish', n: 1, chance: 0.15 }] },
    { name: '바다 가디언', kind: 'quad', color: 0x3a8a7a, hp: 340, dmg: 18, xp: 80, coins: 75, speed: 2.4, scale: 1.1, weight: 12, minLv: 8, drops: [{ key: 'prismarine', n: 3 }] },
    { name: '바다 마녀', kind: 'tall', color: 0x6a3a8a, hp: 400, dmg: 22, xp: 100, coins: 95, speed: 2.6, scale: 1.05, weight: 8, minLv: 12, books: ['luck'], drops: [{ key: 'potion_healing', n: 1, chance: 0.3 }, { key: 'spider_eye', n: 3 }] },
    { name: '심연의 기수', kind: 'tall', color: 0x2a2a4a, hp: 560, dmg: 28, xp: 140, coins: 130, speed: 3.2, scale: 1.2, weight: 6, minLv: 15, drops: [{ key: 'bone', n: 4 }, { key: 'rotten_flesh', n: 4 }] },
    { name: '가디언 수호병', kind: 'quad', color: 0x4aaa8a, hp: 760, dmg: 34, xp: 200, coins: 180, speed: 2.2, scale: 1.35, weight: 4, minLv: 18, equipSrc: 'fishing', equipSrcChance: 0.2, drops: [{ key: 'prismarine', n: 5 }, { key: 'sponge', n: 2, chance: 0.4 }] },
    { name: '물의 히드라', kind: 'dragon', color: 0x1a7a9a, hp: 1500, dmg: 44, xp: 320, coins: 320, speed: 2.4, scale: 1.5, weight: 1.5, minLv: 20, equipSrc: 'fishing', equipSrcChance: 0.35, books: ['giant_killer'], drops: [{ key: 'pufferfish', n: 4 }, { key: 'enchanted_prismarine', n: 1, chance: 0.15 }] },
  ];
  function pickShallowSea(fishLv) {
    const pool = SHALLOW_SEA.filter(c => (c.minLv || 0) <= fishLv);
    const list = pool.length ? pool : [SHALLOW_SEA[0]];
    const tot = list.reduce((a, c) => a + c.weight, 0);
    let r = Math.random() * tot;
    for (const c of list) { if (r < c.weight) return c; r -= c.weight; }
    return list[0];
  }
  function spawnSeaCreature(x, z, deep) {
    const area = { x, z, r: 3, world: worldMode };
    let mob;
    if (deep) {   // V11: 심해 생물 — 커스텀 def 소환
      const def = DEEP_SEA[Math.floor(Math.random() * DEEP_SEA.length)];
      mob = spawnMob(area, 'sea_walker', def.fixedLv, def);
      if (mob && typeof toast === 'function') toast(`🌊🌊 심해가 요동친다... ${def.name}이(가) 낚였다!!`, false);
    } else {   // V20-H: 얕은 바다 생물 — 낚시 레벨 기반 가중 선택
      const api = econApi(); const fishLv = api.skillLv ? api.skillLv('fishing') : 10;
      const def = pickShallowSea(fishLv);
      const lv = Math.max(def.minLv || 5, 5 + Math.floor(Math.random() * (10 + fishLv)));
      mob = spawnMob(area, 'sea_walker', lv, def);
      if (mob && typeof toast === 'function') toast(`🌊 ${def.name}이(가) 낚였다! 전투 준비!`, false);
    }
    if (mob) { mob.state = 'chase'; }
  }
  function clearMobs() { arenaState = null; for (const m of mobs) { if (scene && m.mesh) scene.remove(m.mesh); if (m.mesh) disposeGroup(m.mesh); } mobs = []; }   // V11: 월드 전환 시 아레나 종료 / V12: scene 널 가드(종료 시 몹 있으면 튕기던 버그 수정)
  function tickMobs(dt) {
    // 스폰 유지(구역별 밀도 관리)
    _spawnT += dt;
    if (_spawnT > 2.5) {
      _spawnT = 0;
      const apiS = econApi();
      const quest = apiS.slayerQuest ? apiS.slayerQuest() : null;   // V10 ⑰: 퀘스트 중 계열 스폰 +50%
      const fdiffS = apiS.fieldDiff ? apiS.fieldDiff() : null;
      for (const area of SPAWN_AREAS) {
        if (area.world !== worldMode) continue;
        if (area.hellOnly && (!fdiffS || fdiffS.hpMul < 5)) continue;   // V11: 지옥 난이도 전용 구역
        if (area._cd > 0) { area._cd -= 2.5; continue; }   // V10: 보스 구역 리스폰 쿨다운
        let cap = area.cap;
        if (quest && apiS.slayerMobMap && area.types.some(t => apiS.slayerMobMap[t] === quest.key)) cap = Math.ceil(cap * 1.5);
        const cur = mobs.filter(m => m.area === area && !m.dead).length;
        if (cur < cap) {
          const n = Math.min(cap - cur, cur === 0 ? 2 : 1);   // V10 ⑳: 빈 구역은 2마리씩 빠르게 채움
          for (let si = 0; si < n; si++) {
            const t = area.types[Math.floor(Math.random() * area.types.length)];
            spawnMob(area, t, area.lv[0] + Math.floor(Math.random() * (area.lv[1] - area.lv[0] + 1)));
          }
        }
      }
    }
    const api = econApi();
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (m.dead) continue;
      if (m.ghost) {   // 파티 게스트: 호스트 스냅샷 보간
        if (m.tx3 != null) {
          const k = 1 - Math.exp(-dt * 10);
          m.mesh.position.x += (m.tx3 - m.mesh.position.x) * k;
          m.mesh.position.y += (m.ty3 - m.mesh.position.y) * k;
          m.mesh.position.z += (m.tz3 - m.mesh.position.z) * k;
        }
        continue;
      }
      const mp = m.mesh.position;
      const dx = P.x - mp.x, dz = P.z - mp.z;
      const distP = Math.hypot(dx, dz);
      if (distP > 70) continue;   // 먼 몹은 AI 정지(대형 허브 성능)
      const aggro = m.def.passive ? -1 : (m.elite ? 14 : 10);
      if (aggro > 0 && distP < aggro && Math.abs(P.y - mp.y) < 4) m.state = 'chase';
      else if (distP > aggro * 2) m.state = 'wander';
      let mvx = 0, mvz = 0;
      if (m.state === 'chase') {
        if (distP > 1.5) { mvx = dx / distP; mvz = dz / distP; }
        m.atkCd -= dt;
        if (distP < 1.8 && m.atkCd <= 0) {
          m.atkCd = 1.3;
          const defPct = api.defensePct ? api.defensePct(php && php.hp <= php.max * 0.3) : 0;
          const dealt = m.dmg * (0.85 + Math.random() * 0.3) * (1 - defPct);
          damagePlayer(dealt);
          const th = api.traitSum ? api.traitSum('thorns') : 0;   // V11: 가시 — 받은 피해 반사
          if (th > 0 && !m.ghost && !m.dead && mobs.indexOf(m) >= 0) {   // 사망→리스폰으로 몹이 정리됐으면 스킵
            m.hp -= dealt * th / 100;
            spawnDmgText(m.mesh.position, dealt * th / 100, false);
            if (m.hp <= 0 && !m.dead) { attackMobFinish(m); continue; }   // V11: 가시로 처치 시 이번 반복 종료(스플라이스 후 잔여 처리 방지)
            else drawMobLabel(m);
          }
        }
      } else {
        const wdx = m.tx - mp.x, wdz = m.tz - mp.z;
        if (Math.hypot(wdx, wdz) < 0.8) { const a = Math.random() * Math.PI * 2, rr = Math.random() * m.area.r * 0.8; m.tx = m.area.x + Math.cos(a) * rr; m.tz = m.area.z + Math.sin(a) * rr; }
        else { const l = Math.hypot(wdx, wdz); mvx = wdx / l * 0.4; mvz = wdz / l * 0.4; }
      }
      if (mvx || mvz) {
        const sp = m.def.speed * (m.state === 'chase' ? 1 : 0.5);
        const nx = mp.x + mvx * sp * dt, nz = mp.z + mvz * sp * dt;
        if (m.def.fly) {   // 가스트: 부유 비행(지면 +5~7 유지)
          const gy = groundBelow(Math.floor(nx), Math.floor(nz), 44) + 5.5 + Math.sin(m.walkT * 0.7) * 1.2;
          mp.x = nx; mp.z = nz; mp.y += (gy - mp.y) * Math.min(1, dt * 2);
        } else {
        const ny = groundBelow(Math.floor(nx), Math.floor(nz), mp.y + 1.8);
        if (ny - mp.y < 1.6 && ny - mp.y > -6 && ny > 2) { mp.x = nx; mp.z = nz; mp.y += (ny - mp.y) * Math.min(1, dt * 8); }
        }
        m.mesh.rotation.y = Math.atan2(mvx, mvz);
        m.walkT += dt * 7;
        const sw = Math.sin(m.walkT) * 0.5;
        if (m.legL) { m.legL.rotation.x = sw; m.legR.rotation.x = -sw; }
        for (let li = 0; li < m.legs.length; li++) m.legs[li].rotation.x = (li % 2 ? sw : -sw);
      }
      // 블레이즈 막대 공전 + 드래곤 날개 퍼덕임(항상)
      m.walkT += dt * 2;
      if (m.rods) for (let ri = 0; ri < m.rods.length; ri++) { const a = m.walkT * 1.5 + ri / 6 * Math.PI * 2; m.rods[ri].position.x = Math.cos(a) * 0.55; m.rods[ri].position.z = Math.sin(a) * 0.55; }
      if (m.wings) { const fl = Math.sin(m.walkT * 3) * 0.5; m.wings[0].rotation.z = fl; m.wings[1].rotation.z = -fl; }
      if (m.auraRing) { const pu = 1 + Math.sin(m.walkT * 2.2) * 0.12; m.auraRing.scale.setScalar(pu); m.auraRing.rotation.z += dt * 1.2; }
      if (false) {
      }
    }
  }
  // 시선 광선으로 몬스터 조준(가까운 순)
  function pickMob() {
    const d = lookDir(); let best = null, bestAlong = 3.8;
    for (const m of mobs) {
      if (m.dead) continue;
      const mp = m.mesh.position;
      const vx = mp.x - P.x, vy = (mp.y + 1.0) - (P.y + P.eye), vz = mp.z - P.z;
      const along = vx * d.x + vy * d.y + vz * d.z;
      if (along < 0.2 || along > 3.8) continue;
      const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
      if (Math.hypot(px, py, pz) < (m.def && m.def.miniboss ? 2.0 : m.elite ? 1.2 : 0.95) && along < bestAlong) { best = m; bestAlong = along; }
    }
    return best;
  }
  function attackMobHit(m) {
    const api = econApi(); if (!api.attackMob) return;
    if (m.ghost) {   // 게스트: 피해 계산 후 호스트로 전송(호스트 권위)
      const rg = api.attackMob({ hitIdx: m.hitIdx || 0, hp: m.hp, maxHp: m.maxHp, isBoss: !!m.isBoss });
      m.hitIdx = (m.hitIdx || 0) + 1;
      spawnDmgText(m.mesh.position, rg.dmg, rg.crit);
      if (php && rg.heal) php.hp = Math.min(php.max, php.hp + rg.heal);
      if (window.econNet) window.econNet.partySendAttack3(m.netId, rg.dmg);
      return;
    }
    const isBossGrade = !!(m.isBoss || m.def.miniboss || m.def.hellBoss || m.def.kind === 'dragon' || m.type === 'arachne' || m.type === 'broodmother');
    const r = api.attackMob({ hitIdx: m.hitIdx, hp: m.hp, maxHp: m.maxHp, isBoss: isBossGrade, mobType: m.type, phpPct: php ? php.hp / php.max : 1 });
    m.hitIdx++;
    m.hp -= r.dmg;
    if (php && r.heal) { php.hp = Math.min(php.max, php.hp + r.heal); }
    spawnDmgText(m.mesh.position, r.dmg, r.crit);
    // 넉백
    const kb = 0.7; const dx = m.mesh.position.x - P.x, dz = m.mesh.position.z - P.z; const l = Math.hypot(dx, dz) || 1;
    m.mesh.position.x += dx / l * kb; m.mesh.position.z += dz / l * kb;
    m.state = 'chase';
    if (m.hp <= 0) attackMobFinish(m);
    else drawMobLabel(m);
  }
  // V11: 처치 정산(직접 타격·가시 반사 공용) — 보상/알림/던전/아레나 훅 일원화
  function attackMobFinish(m) {
    if (m.dead) return;
    m.dead = true;
    const api = econApi();
    const isBossGrade = !!(m.isBoss || m.def.miniboss || m.def.hellBoss || m.def.kind === 'dragon' || m.type === 'arachne' || m.type === 'broodmother');
    const lvMul = 1 + (m.lv - 1) * 0.12;
    if (api.mobKilled) api.mobKilled({
      name: `[Lv ${m.lv}] ${m.def.name}${m.elite ? '★' : ''}`,
      coins: Math.round(m.def.coins * lvMul * (m.elite ? 3 : 1)),
      xp: Math.round(m.def.xp * lvMul * (m.elite ? 3 : 1)),
      drops: m.def.drops, tierCap: m.def.tierCap + (m.elite ? 1 : 0),
      books: m.def.books || [], elite: m.elite, lv: m.lv,
      equipChance: m.def.equipChance,   // 몹별 상이(없으면 economy.js가 레벨·티어로 산출)
      boss: isBossGrade,                             // V11: 보스급 카운터
      rewardMul: m.rewardMul || 1,                   // V11: 난이도/주간 보상 배율
      equipSrc: m.def.equipSrc || null,              // V11: 전용 장비 풀(미니보스/지옥 보스)
      equipSrcChance: m.def.equipSrcChance,
    });
    if (php && api.traitSum) { const vk = api.traitSum('vampiric_kill'); if (vk > 0) { php.hp = Math.min(php.max, php.hp + vk); updateHpHud(); } }   // V11: 흡혼
    if (m.area && m.area.cap === 1 && m.area.respawn) m.area._cd = m.area.respawn;   // V10: 단일 보스 리스폰 대기
    // V10 ㉑: 보스급 처치는 전서버 알림(멀티 접속 시)
    if (isBossGrade && window.econNet && window.econNet.announce) {
      window.econNet.announce(`⚔ [Lv ${m.lv}] ${m.def.name} 처치!`);
    }
    scene.remove(m.mesh); disposeGroup(m.mesh);
    mobs.splice(mobs.indexOf(m), 1);
    if (worldMode === 'dungeon') onDungeonMobDead(m);
    if (m.arena && arenaState) onArenaMobDead(m);   // V11: 아레나 웨이브 진행
  }
  // 떠오르는 피해 숫자
  let dmgTexts = [];
  function spawnDmgText(pos, dmg, crit) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
    const c = cv.getContext('2d'); c.textAlign = 'center'; c.font = `bold ${crit ? 30 : 24}px sans-serif`;
    c.fillStyle = crit ? '#ffb020' : '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    const txt = (crit ? '✧' : '') + Math.round(dmg).toLocaleString();
    c.strokeText(txt, 64, 32); c.fillText(txt, 64, 32);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    spr.scale.set(1.4, 0.55, 1);
    spr.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 1.8, pos.z + (Math.random() - 0.5) * 0.6);
    scene.add(spr);
    dmgTexts.push({ spr, t: 0 });
  }
  function tickDmgTexts(dt) {
    for (let i = dmgTexts.length - 1; i >= 0; i--) {
      const d = dmgTexts[i]; d.t += dt;
      d.spr.position.y += dt * 1.2;
      d.spr.material.opacity = Math.max(0, 1 - d.t / 0.7);
      if (d.t > 0.7) { scene.remove(d.spr); d.spr.material.map.dispose(); d.spr.material.dispose(); dmgTexts.splice(i, 1); }
    }
  }

  /* ---------------- 플레이어 HP/피격/사망 ---------------- */
  let php = null;               // {hp, max, lastHitAt}
  function ensurePhp() {
    const api = econApi();
    const max = api.maxHp ? api.maxHp() : 100;
    if (!php) php = { hp: max, max, lastHitAt: 0 };
    else { php.max = max; if (php.hp > max) php.hp = max; }
  }
  function damagePlayer(dmg) {
    if (!php) return;
    const apiG = econApi();
    if (apiG.guardPct) dmg *= (1 - apiG.guardPct());   // V11: 수호 특성(받는 피해 감소)
    php.hp -= dmg; php.lastHitAt = performance.now();
    spawnDmgText({ x: P.x, y: P.y, z: P.z }, dmg, false);
    if (php.hp <= 0) {
      const api = econApi();
      if (api.playerDied) api.playerDied();
      php.hp = php.max;
      if (worldMode === 'dungeon' && dungeonState) dungeonState.deaths++;
      respawnAtHub('');
    }
    updateHpHud();
  }
  let _regenT = 0;
  function tickPlayerVitals(dt) {
    ensurePhp();
    if (php.hp < php.max && performance.now() - php.lastHitAt > 5000) {
      php.hp = Math.min(php.max, php.hp + php.max * 0.02 * dt);   // 전투 이탈 5초 후 초당 2% 재생
      updateHpHud();
    }
    _regenT += dt;   // V11: 재생 특성 — 2초마다 고정 회복(전투 중에도)
    if (_regenT >= 2) {
      _regenT = 0;
      const api = econApi();
      const rg = api.traitSum ? api.traitSum('regeneration') : 0;
      if (rg > 0 && php.hp < php.max) { php.hp = Math.min(php.max, php.hp + rg); updateHpHud(); }
    }
  }
  let _hpHudT = 0;
  // V19-C: 터치 가상 조이스틱 시각 표시 — 손가락 드래그를 따라 노브 이동, 손 떼면 중앙 복귀. 힌트는 8초 후 페이드.
  let _joyHintT = 0;
  function updateJoystick(dt) {
    const knob = document.getElementById('econ3dJoyKnob');
    if (knob) {
      let kx = 0, ky = 0;
      if (moveT.active) { kx = Math.max(-26, Math.min(26, moveT.x - moveT.ox)); ky = Math.max(-26, Math.min(26, moveT.y - moveT.oy)); }
      knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      knob.style.opacity = moveT.active ? '0.95' : '0.55';
    }
    const hint = document.getElementById('econ3dTouchHint');
    if (hint && hint.style.opacity !== '0') { _joyHintT += dt; if (_joyHintT > 8) hint.style.opacity = '0'; }
  }
  function updateHpHud() {
    const bar = document.getElementById('econ3dHpFill'), txt = document.getElementById('econ3dHpTxt');
    if (bar && php) bar.style.width = Math.max(0, php.hp / php.max * 100) + '%';
    if (txt && php) txt.textContent = `❤ ${Math.max(0, Math.ceil(php.hp))}/${php.max}`;
    // 핫바 위 스탯(실제 스카이블럭 액션바): 체력/방어/마나/속도 — 나머지는 메뉴에서
    const row = document.getElementById('econ3dStats');
    const api = econApi();
    if (row && api.hudStats) {
      const st = api.hudStats();
      const buffs = api.activeBuffs ? api.activeBuffs() : [];   // V10 ㉖: 물약 버프 잔여시간
      const curHp = php ? Math.max(0, Math.ceil(php.hp)) : st.hp;
      // V15: 하이픽셀 액션바 정확 재현 — 숫자 뒤 기호, 체력 빨강/방어 초록/마나 하늘, 속도는 보조
      row.innerHTML = `<span class="ab ab-hp">${curHp}/${st.hp}<b>❤</b></span>`
        + `<span class="ab ab-def">${st.def}<b>❈</b> Defense</span>`
        + `<span class="ab ab-mana">${st.mana}/${st.mana}<b>✎</b> Mana</span>`
        + `<span class="ab ab-spd">✦ ${st.speed}</span>`
        + buffs.map(bf => `<span class="ab ab-buff">🧪 ${bf.name} ${Math.floor(bf.left / 60)}:${String(bf.left % 60).padStart(2, '0')}</span>`).join('');
    }
  }

  /* ---------------- 상호작용(콘 조준) ---------------- */
  function buildStaticInteractables() {
    interactables = [];
    if (worldMode === 'hub') {
      NPCS.forEach(n => interactables.push({ type: 'npc', ref: n, x: n.x + 0.5, y: n._y + 1.0, z: n.z + 0.5 }));
      NODES.forEach(n => interactables.push({ type: 'node', ref: n, x: n.x + 0.5, y: n._y + 0.6, z: n.z + 0.5 }));
    }
    // V13-B: 위치기반 퀘스트 NPC(현재 월드) — E/클릭 대화로 퀘스트 수락
    questNpcList().forEach(n => {
      if ((n.world || 'hub') !== worldMode) return;
      const qy = (n._y != null ? n._y : surfaceTop(n.x, n.z));
      interactables.push({ type: 'questnpc', ref: n, x: n.x + 0.5, y: qy + 1.0, z: n.z + 0.5 });
    });
    const portal = PORTALS[worldMode];
    if (portal) {
      const py = surfaceTop(portal.x, portal.z);
      interactables.push({ type: 'portal', ref: portal, x: portal.x + 0.5, y: py + 1.5, z: portal.z + 0.5 });
    }
    if (worldMode === 'spider') {
      const ay = surfaceTop(96, 40);
      interactables.push({ type: 'arachneAltar', ref: {}, x: 96.5, y: ay + 0.8, z: 40.5 });
    }
    FAIRY_SPOTS.forEach(fs => {   // V9: 소울은 각 월드에 분산(24개)
      if ((fs.world || 'hub') !== worldMode) return;
      const fy = fs.y != null ? fs.y : surfaceTop(fs.x, fs.z);
      fs._y = fy;
      interactables.push({ type: 'fairy', ref: fs, x: fs.x + 0.5, y: fy + 0.6, z: fs.z + 0.5 });
    });
    for (const wp of (WARPS[worldMode] || [])) {
      const wy = wp._y || surfaceTop(wp.x, wp.z);
      interactables.push({ type: 'warp', ref: wp, x: wp.x + 0.5, y: wy + 0.8, z: wp.z + 0.5 });
    }
  }
  function currentAim() {
    const d = lookDir(); let best = null, bestPerp = 0.8;   // 시선 광선에서 0.8블록 이내만 선택(정조준 요구)
    const api = econApi();
    let all = interactables.concat(dynamicInteractables);
    // 다른 플레이어 아바타도 조준 대상(E키 → 멀티 패널: 거래/파티/방문)
    if (worldMode !== 'home' && worldMode !== 'visit' && worldMode !== 'dungeon') {   // V11: 공유 월드 전체
      for (const id in others) {
        const o = others[id];
        all = all.concat([{ type: 'player', ref: { id }, x: o.mesh.position.x, y: o.mesh.position.y + 1.0, z: o.mesh.position.z }]);
      }
    }
    for (const it of all) {
      if (it.type === 'fairy' && api.fairySoulCollected(it.ref.id)) continue;
      const vx = it.x - P.x, vy = it.y - (P.y + P.eye), vz = it.z - P.z;
      const along = vx * d.x + vy * d.y + vz * d.z;         // 시선 방향 투영 거리
      if (along < 0.2 || along > REACH) continue;           // 뒤/사거리 밖 제외
      const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
      const perp = Math.hypot(px, py, pz);                  // 광선과의 수직 거리
      if (perp < bestPerp) { bestPerp = perp; best = it; }
    }
    return best;
  }
  /* ---------------- 멀티: 다른 플레이어 아바타 — V11: 프라이빗 제외 전 월드 공유 + 장착 장비 표시 ---------------- */
  function tierColorHexOf(idx) {
    const T = (window.ECON_DATA || {}).ITEM_TIERS || [];
    return idx >= 0 && T[idx] ? parseInt(T[idx].colorHex.slice(1), 16) : 0x8a8a8a;
  }
  function makeOtherAvatar(name) {
    const h = buildHumanoid(0x2b6cb0);   // 파란 스킨 = 다른 플레이어
    const tag = makeLabel(String(name || 'Player').slice(0, 12));
    tag.position.set(0, 2.35, 0);
    h.group.add(tag);
    // V11: 장비 오버레이(투구/흉갑/레깅스/부츠 색 + 손 무기) — 프레즌스 g 패킷으로 갱신
    const gearGrp = new THREE.Group();
    h.group.add(gearGrp);
    scene.add(h.group);
    return { mesh: h.group, legL: h.legL, legR: h.legR, walkT: 0, walkAmp: 0, tx: null, ty: null, tz: null, tyaw: 0, gearGrp, gearSig: '' };
  }
  function applyAvatarGear(o, g) {
    const sig = JSON.stringify(g || null);
    if (sig === o.gearSig) return;
    o.gearSig = sig;
    while (o.gearGrp.children.length) { const c = o.gearGrp.children[0]; o.gearGrp.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    if (!g) return;
    const t = g.t || [-1, -1, -1, -1];
    // 투구(머리 위 오버레이) / 흉갑(몸통) / 레깅스(다리) / 부츠(발) — 티어 색
    if (t[0] >= 0) o.gearGrp.add(mkBox(0.56, 0.3, 0.56, tierColorHexOf(t[0]), 0, 1.8, 0));    // V14: 새 비율에 맞춤
    if (t[1] >= 0) o.gearGrp.add(mkBox(0.62, 0.6, 0.4, tierColorHexOf(t[1]), 0, 1.07, 0));
    if (t[2] >= 0) o.gearGrp.add(mkBox(0.56, 0.4, 0.34, tierColorHexOf(t[2]), 0, 0.5, 0));
    if (t[3] >= 0) { o.gearGrp.add(mkBox(0.24, 0.16, 0.36, tierColorHexOf(t[3]), -0.16, 0.08, 0.02)); o.gearGrp.add(mkBox(0.24, 0.16, 0.36, tierColorHexOf(t[3]), 0.16, 0.08, 0.02)); }
    if (g.w) {   // 들고 있는 무기: 티어색 발광 블레이드 + 손잡이
      const wc = tierColorHexOf(g.wt != null ? g.wt : 0);
      const blade = mkBox(0.09, 0.72, 0.09, wc, 0.42, 1.25, 0.22);
      blade.material = new THREE.MeshBasicMaterial({ color: wc });   // 발광(무조명)
      blade.rotation.x = -0.5;
      o.gearGrp.add(blade);
      o.gearGrp.add(mkBox(0.12, 0.16, 0.12, 0x4a3722, 0.42, 0.92, 0.1));
    }
  }
  function removeOtherAvatar(id) {
    const o = others[id]; if (!o) return;
    if (scene) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    delete others[id];
  }
  function updateNetAvatars(dt) {
    const n = window.econNet; if (!n || !n.isActive()) { for (const id in others) removeOtherAvatar(id); return; }
    const peers = n.peers();
    // V11: 프라이빗 섬(home)·방문(visit)·던전(파티 별도)만 제외 — 나머지 모든 월드는 완전 공유
    const shared = worldMode !== 'home' && worldMode !== 'visit' && worldMode !== 'dungeon';
    for (const id in peers) {
      const p = peers[id];
      const sameWorld = shared && p.world === worldMode;
      if (!sameWorld) { if (others[id]) removeOtherAvatar(id); continue; }
      let o = others[id];
      if (!o) { o = others[id] = makeOtherAvatar(p.name); o.mesh.position.set(p.x, p.y, p.z); }
      o.tx = p.x; o.ty = p.y; o.tz = p.z; o.tyaw = p.yaw || 0;
      applyAvatarGear(o, p.g);   // V11: 장착 장비 표시(변경 시에만 리빌드)
    }
    for (const id in others) if (!peers[id]) removeOtherAvatar(id);
    // 지수 감쇠 보간(프레임레이트 무관) + 걷기 스윙
    for (const id in others) {
      const o = others[id]; if (o.tx == null) continue;
      const k = 1 - Math.exp(-dt * 12);
      const dist = Math.hypot(o.tx - o.mesh.position.x, o.tz - o.mesh.position.z);
      o.mesh.position.x += (o.tx - o.mesh.position.x) * k;
      o.mesh.position.y += (o.ty - o.mesh.position.y) * k;
      o.mesh.position.z += (o.tz - o.mesh.position.z) * k;
      let dyaw = o.tyaw - o.mesh.rotation.y; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      o.mesh.rotation.y += dyaw * k;
      o.walkAmp += (((dist > 0.05) ? 0.6 : 0) - o.walkAmp) * Math.min(1, dt * 6);
      o.walkT += dt * 8;
      const sw = Math.sin(o.walkT) * o.walkAmp;
      if (o.legL) o.legL.rotation.x = sw;
      if (o.legR) o.legR.rotation.x = -sw;
    }
  }
  function netTick(dt) {
    const n = window.econNet; if (!n) return;
    n.tick(dt, P, worldMode);
    updateNetAvatars(dt);
  }

  function gatherAt(zoneKey) { if (typeof window.econAct === 'function') window.econAct('econ_gather', { dataset: { key: zoneKey } }); }
  function openPanelForZone(zoneKey, tab) {
    if (typeof window.econAct !== 'function') return;
    window.econAct('econ_zone', { dataset: { key: zoneKey } });
    if (zoneKey === 'hub' && tab) window.econAct('econ_hubtab', { dataset: { key: tab } });
    showPanel();
  }
  function doInteract(t) {
    if (!t) return;
    if (t.type === 'npc') openPanelForZone(t.ref.zone, t.ref.tab);
    else if (t.type === 'questnpc') { const api = econApi(); if (api.talkQuest) api.talkQuest(t.ref.key); }
    else if (t.type === 'minion' || t.type === 'emptySlot') openPanelForZone('hub', 'minions');
    else if (t.type === 'fairy') { econApi().collectFairySoul(t.ref.id); refreshFairyVisibility(); }
    else if (t.type === 'player') openPanelForZone('hub', 'multi');
    else if (t.type === 'warp') warpTo(t.ref.dest);
    else if (t.type === 'arachneAltar') tryArachneSummon(t);
    else if (t.type === 'dgSecret') {
      if (t.ref.done) return;
      t.ref.done = true;
      if (dungeonState) dungeonState.secrets = (dungeonState.secrets || 0) + 1;
      const api2 = econApi();
      if (api2.gatherBlock) {}
      if (window.__econ && window.__econ.addItem) {}
      if (api2.consumeItems) {}   // no-op guards
      if (typeof window.econAct === 'function') {}
      if (api2 && api2.getP && api2.getP()) {
        const P2 = api2.getP();
        P2.inv.dungeon_essence = (P2.inv.dungeon_essence || 0) + 3;
        let chestMsg = '';
        if (api2.equipDropFromSrc && Math.random() < 0.35) { const eq = api2.equipDropFromSrc('chest', null); if (eq) chestMsg = ` + 🎁 ${eq.name}`; }   // V11: 상자 전용 장비 풀
        if (typeof toast === 'function') toast(`🗝️ 시크릿 발견! 던전 정수 +3 (점수 보너스)${chestMsg}`, true);
      }
    }
    else if (t.type === 'portal') travelTo(t.ref.target);
  }
  function showPanel() {
    const wrap = document.getElementById('econ3dPanelWrap'); if (wrap) wrap.style.display = 'flex';
    if (lookS.locked && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
    gathering = false; mouseHeld = false; breaking = null;   // V12-D: 패널 열면 채집/파괴 중단(화면 전환 시 계속 캐지는 버그 수정)
  }
  function hidePanel() { const wrap = document.getElementById('econ3dPanelWrap'); if (wrap) wrap.style.display = 'none'; updateBuildHud(); updateHotbar(); }

  function setupOutline() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    outlineMesh = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffe066 }));
    outlineMesh.visible = false; scene.add(outlineMesh);
  }
  function updateAimHighlight() {
    const t = currentAim();
    const cross = document.getElementById('econ3dCross');
    if (t && outlineMesh) {
      outlineMesh.visible = true; outlineMesh.scale.set(0.9, 1.6, 0.9); outlineMesh.position.set(t.x, t.y - 0.3, t.z);
      if (cross) cross.classList.add('is-active');
      return;
    }
    // 내 섬: 엔티티 조준이 없으면 블록 조준 윤곽선(설치/파괴 대상 표시)
    if (worldMode === 'home' && outlineMesh) {
      const b = raycastBlock();
      if (b) {
        outlineMesh.visible = true; outlineMesh.scale.set(1.01, 1.01, 1.01);
        outlineMesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
        if (cross) cross.classList.add('is-active');
        return;
      }
    }
    if (outlineMesh) outlineMesh.visible = false;
    if (cross) cross.classList.remove('is-active');
  }

  /* ---------------- 낮밤/하늘 ---------------- */
  function mixHex(a, b, t) { t = Math.max(0, Math.min(1, t)); const ca = hx(a), cb = hx(b); return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`; }
  function hx(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  // 실제 스카이블럭처럼 월드마다 시간대가 "고정"이다(같은 장소는 항상 같은 시간).
  // 야간투시는 기본 패시브: 어두운 월드에서도 블록 밝기 하한 0.85로 항상 잘 보인다.
  const WORLD_AMBIENCE = {
    hub:    { light: 1.00, sky: ['#3f7fc8', '#76adde', '#bfe0f5'], fog: '#9fc6ea' },   // 항상 정오
    home:   { light: 1.00, sky: ['#3f7fc8', '#76adde', '#bfe0f5'], fog: '#9fc6ea' },
    visit:  { light: 1.00, sky: ['#3f7fc8', '#76adde', '#bfe0f5'], fog: '#9fc6ea' },
    barn:   { light: 0.95, sky: ['#4f8fd0', '#86b8e4', '#cfe8f8'], fog: '#a8cfee' },   // 밝은 오전
    mushroom: { light: 0.72, sky: ['#5a3f68', '#9a6a7e', '#e8a06a'], fog: '#b88a8e' }, // 항상 노을
    park:   { light: 0.90, sky: ['#3a72b8', '#6aa0d0', '#b0d8ea'], fog: '#98c0e0' },
    gold:   { light: 0.85, sky: ['#c08a3f', '#d8aa5f', '#f0d09a'], fog: '#d0b080' },   // 항상 늦은 오후
    deep:   { light: 0.35, sky: ['#07070c', '#0c0c14', '#14141f'], fog: '#101018' },   // 지하(항상 어둠)
    spider: { light: 0.55, sky: ['#1a2416', '#2c3a24', '#4a5a38'], fog: '#37452c' },   // 항상 음침한 황혼
    nether: { light: 0.60, sky: ['#280808', '#481010', '#802020'], fog: '#581818' },   // 항상 지옥빛
    end:    { light: 0.45, sky: ['#0c0714', '#1c1028', '#382050'], fog: '#241636' },   // 항상 보랏빛 밤
    dungeonhub: { light: 0.50, sky: ['#0a0e18', '#141c2c', '#243048'], fog: '#1c2436' }, // 항상 자정
    dungeon: { light: 0.45, sky: ['#0c0808', '#181010', '#281c1c'], fog: '#1c1414' },
  };
  function worldAmbience() { return WORLD_AMBIENCE[worldMode] || WORLD_AMBIENCE.hub; }
  function dayFactor() { return worldAmbience().light; }
  let _lastSkyKey = '';
  function updateSky() {
    if (_lastSkyKey === worldMode) return;
    _lastSkyKey = worldMode;
    const A = worldAmbience();
    if (scene.fog) scene.fog.color.set(A.fog);
    const el = document.getElementById('econ3dSky');
    if (el) el.style.background = `linear-gradient(${A.sky[0]} 0%, ${A.sky[1]} 55%, ${A.sky[2]} 100%)`;
    const nv = Math.max(0.85, A.light);   // 야간투시 패시브: 블록은 항상 밝게
    if (blockMat) blockMat.color.setScalar(nv);
    if (waterMat) waterMat.color.setScalar(nv);
    if (plantMat) plantMat.color.setScalar(nv);
    if (lavaMat) lavaMat.color.setScalar(1.0);
  }

  /* ---------------- 존 배너 + 미니맵 + HUD ---------------- */
  function updateBanner() {
    let key, name;
    if (worldMode === 'home') { key = 'home'; name = '🏝️ 나의 섬'; }
    else if (worldMode === 'visit') { key = 'visit'; name = `🏝️ ${(visitData && visitData.name) || '친구'}의 섬`; }
    else if (worldMode !== 'hub') { key = worldMode; name = (WORLD_DEFS[worldMode] || {}).name || ''; }
    else {
      key = zoneAt(Math.floor(P.x), Math.floor(P.z));
      name = key ? hubZoneName(key) : '';
    }
    if (key && key !== curBannerKey) {
      curBannerKey = key;
      const el = document.getElementById('econ3dBanner');
      if (el && name) { el.textContent = name; el.classList.add('show'); bannerT = 2.6; }
    }
  }
  function tickBanner(dt) {
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { const el = document.getElementById('econ3dBanner'); if (el) el.classList.remove('show'); } }
  }
  const MAP_COLORS = {};
  function mapColor(id) {
    if (id === 0) return '#0d1524';   // 공허/하늘(내 섬 미니맵에서 섬 실루엣이 보이도록)
    if (id === ID.netherrack) return '#6e2626';
    if (id === ID.soul_sand) return '#4a3828';
    if (id === ID.nether_bricks) return '#2e1618';
    if (id === ID.end_stone) return '#dddf9f';
    if (id === ID.dark_oak_leaves) return '#254a1a';
    if (id === ID.jungle_leaves) return '#3aa02e';
    if (id === ID.acacia_leaves) return '#6a8a30';
    if (MAP_COLORS[id]) return MAP_COLORS[id];
    const key = BLOCKS[id] ? BLOCKS[id].key : 'air';
    const c = { water: '#2f5fc8', sand: '#e0d6a0', grass: '#5f9e48', stone: '#828282', cobblestone: '#7d7d7d', dirt: '#7d573c',
      oak_planks: '#b08a4f', birch_planks: '#d8c99a', spruce_planks: '#6b4f2e', stone_bricks: '#7b7b7b', bricks: '#9a4f3f',
      sandstone: '#d9cda0', obsidian: '#1a1326', glowstone: '#f4d35e', lava: '#e8632a', farmland: '#5a3f28',
      oak_leaves: '#4c8f38', spruce_leaves: '#2c4a2c', oak_log: '#6b5436', birch_log: '#d7d3c8', spruce_log: '#3b2a18',
      wool_white: '#eceff0', wool_red: '#c0392b', pumpkin: '#d6791f', melon: '#4c8f46', glass: '#bfe6f2',
      coal_ore: '#5a5a5e', iron_ore: '#c89478', gold_ore: '#e8cb4b', diamond_ore: '#5decd5' }[key] || '#6aa84f';
    MAP_COLORS[id] = c; return c;
  }
  function buildMinimapBase() {
    minimapBase = document.createElement('canvas'); minimapBase.width = W; minimapBase.height = Dp;
    const c = minimapBase.getContext('2d');
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      let id = 0;
      for (let y = H - 1; y >= 0; y--) { const b = getBlockLocal(x, y, z); if (b !== 0) { id = b; break; } }
      c.fillStyle = mapColor(id); c.fillRect(x, z, 1, 1);
    }
  }
  let minimapBig = false;
  function toggleMinimapSize() { minimapBig = !minimapBig; const el = document.getElementById('econ3dMap'); if (el) el.classList.toggle('is-big', minimapBig); }
  function drawMinimap() {
    const cv = document.getElementById('econ3dMap'); if (!cv || !minimapBase) return;
    const c = cv.getContext('2d'); const s = cv.width;
    c.imageSmoothingEnabled = false;
    c.drawImage(minimapBase, 0, 0, W, Dp, 0, 0, s, s);
    // NPC 점(금색) + 플레이어(빨강 + 시선 방향)
    c.fillStyle = '#ffd700';
    NPCS.forEach(n => c.fillRect(n.x / W * s - 1, n.z / Dp * s - 1, 2, 2));
    const pxx = P.x / W * s, pzz = P.z / Dp * s;
    c.fillStyle = '#ff3333'; c.beginPath(); c.arc(pxx, pzz, 3, 0, Math.PI * 2); c.fill();
    const d = lookDir();
    c.strokeStyle = '#ff3333'; c.beginPath(); c.moveTo(pxx, pzz); c.lineTo(pxx + d.x * 8, pzz + d.z * 8); c.stroke();
  }
  function updateHud() {
    const P0 = econApi().getP(); if (!P0) return;
    const g = document.getElementById('econ3dGold'); if (g) g.textContent = '💰 ' + P0.gold.toLocaleString('ko-KR') + 'G';
    const pg = document.getElementById('econ3dPanelGold'); if (pg) pg.textContent = '💰 ' + P0.gold.toLocaleString('ko-KR') + 'G · 🏦 ' + (P0.bank || 0).toLocaleString('ko-KR') + 'G';
    const fs = document.getElementById('econ3dSouls'); if (fs) fs.textContent = '✨ ' + (P0.fairySouls ? P0.fairySouls.length : 0) + '/12';
  }
  // V13-B: 우측 중앙 위치기반 퀘스트 HUD(진행 중 퀘스트 + 근처 NPC 수락 제안)
  let _lastQuestOffer = '';
  function updateQuestHud() {
    const hud = document.getElementById('econ3dQuestHud'); if (!hud) return;
    const api = econApi();
    if (!api.questHud || worldMode === 'dungeon') { hud.style.display = 'none'; return; }
    const data = api.questHud(worldMode, P.x, P.z);
    if (!data) { hud.style.display = 'none'; return; }
    let html = '';
    if (data.active && data.active.length) {
      html += '<div class="econ3d-qh-head">📜 진행 중인 퀘스트</div>';
      data.active.slice(0, 4).forEach(a => {
        const pct = Math.max(0, Math.min(100, Math.round(a.cur / a.goal * 100)));
        html += `<div class="econ3d-qh-item"><div class="econ3d-qh-name">${a.name}</div>`
          + `<div class="econ3d-qh-obj">${a.label} <b>${a.cur}/${a.goal}</b></div>`
          + `<div class="econ3d-qh-bar"><i style="width:${pct}%"></i></div></div>`;
      });
    }
    if (data.offer) {
      html += `<div class="econ3d-qh-offer"><div class="econ3d-qh-name">❗ ${data.offer.npcName}</div>`
        + `<div class="econ3d-qh-story">${data.offer.story}</div>`
        + `<div class="econ3d-qh-accept">💬 다가가 <b>E</b> (또는 클릭)로 [${data.offer.name}] 수락</div></div>`;
    }
    if (!data.offer && !(data.active && data.active.length) && data.guide) {
      html += `<div class="econ3d-qh-offer"><div class="econ3d-qh-name">❗ 새 퀘스트</div>`
        + `<div class="econ3d-qh-accept"><b>${data.guide.npcName}</b>(${data.guide.dist}m)에게 가서 대화하세요</div></div>`;
    }
    if (!html) { hud.style.display = 'none'; return; }
    hud.innerHTML = html; hud.style.display = 'block';
  }
  // (구)건축 팔레트 바는 폐지 — 설치는 핫바의 보유 블럭으로만(서바이벌). 하단 스텁만 유지
  function ownedPlaceableList() {
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0 || !P0.inv) return [];
    // 인벤토리에서 설치 가능한 아이템만(개수>0), 안정적인 순서
    return Object.keys(P0.inv).filter(k => (P0.inv[k] || 0) > 0 && isPlaceable(k)).sort();
  }
  function refreshBuildPalette() { updateBuildHud(); }
  // V12-D: 핫바가 블럭 팔레트를 대체 — 별도 팔레트 바는 숨긴다(설치 대상은 활성 핫바 아이템).
  function updateBuildHud() {
    const bar = document.getElementById('econ3dBuildBar'); if (bar) bar.style.display = 'none';
    updateHotbar();
  }
  // 포털 표식(보라 발광판 + 라벨)
  let portalMarker = null;
  // 워프 패드 마커(보라 빔 + 라벨)
  function buildWarpMarkers() {
    if (!scene) return;
    if (!propGroup) { propGroup = new THREE.Group(); scene.add(propGroup); }
    if (worldMode === 'spider') {
      const ay = surfaceTop(96, 40);
      interactables.push({ type: 'arachneAltar', ref: {}, x: 96.5, y: ay + 0.8, z: 40.5 });
    }
    for (const wp of (WARPS[worldMode] || [])) {
      const y = wp._y || surfaceTop(wp.x, wp.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x54e0a8, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
      beam.position.set(wp.x + 0.5, y + 2.5, wp.z + 0.5);
      propGroup.add(beam);
      const label = makeLabel(wp.label); label.position.set(wp.x + 0.5, y + 5.4, wp.z + 0.5);
      propGroup.add(label);
    }
  }
  function buildPortalMarker() {
    if (portalMarker) { scene.remove(portalMarker); disposeGroup(portalMarker); portalMarker = null; }
    const p = PORTALS[worldMode];
    if (!p) { buildWarpMarkers(); return; }   // 테마 월드는 포털 대신 워프 패드 마커
    const y = surfaceTop(p.x, p.z);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.6), new THREE.MeshBasicMaterial({ color: 0xb04ae8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    fill.position.set(p.x + 0.5, y + 2.2, p.z + 0.5);
    g.add(fill);
    const label = makeLabel(p.label); label.position.set(p.x + 0.5, y + 4.8, p.z + 0.5); g.add(label);
    buildWarpMarkers();
    g.userData.fill = fill;
    scene.add(g);
    portalMarker = g;
  }

  /* ---------------- 화면 ---------------- */
  function screenHTML() {
    return `<section class="screen econ3d-screen" data-econ3d="1">
      <div class="econ3d-sky" id="econ3dSky"></div>
      <canvas id="econ3dCanvas"></canvas>
      <div class="econ3d-cross" id="econ3dCross">+</div>
      <div class="econ3d-banner" id="econ3dBanner"></div>
      <div class="econ3d-top">
        <div class="econ3d-gold" id="econ3dGold">💰 0G</div>
        <div class="econ3d-zone" id="econ3dSouls">✨ 0/12</div>
        <button class="btn btn--ghost" data-act="backHome">✕</button>
      </div>
      <canvas id="econ3dMap" class="econ3d-map" width="140" height="140" data-act="econ3d_map"></canvas>
      <!-- V13-A: 핫바 밑 초록 체력바 제거 — 체력은 핫바 위 스탯 액션바에 표시 -->
      <div class="econ3d-statsrow" id="econ3dStats"></div>
      <div class="econ3d-hotbar" id="econ3dHotbar">${Array.from({ length: 9 }, (_, i) => `<button class="econ3d-slot" data-act="econ3d_hotbar" data-i="${i}" id="econ3dSlot${i}">${i === 8 ? '<span class="econ3d-star">✦</span>' : ''}</button>`).join('')}</div>
      <div class="econ3d-buildbar" id="econ3dBuildBar" style="display:none"></div>
      <div class="econ3d-questhud" id="econ3dQuestHud" style="display:none"></div>
      <div class="econ3d-questbanner" id="econ3dQuestBanner" style="display:none"></div>
      ${isTouch ? '<div class="econ3d-joy" id="econ3dJoy"><div class="econ3d-joy__knob" id="econ3dJoyKnob"></div></div><div class="econ3d-jump" data-act="econ3d_jump">⤒</div><div class="econ3d-touchhint" id="econ3dTouchHint">◀ 왼쪽 드래그 이동 · 오른쪽 드래그 시점 · 탭 공격/상호작용 · ⤒ 점프</div>' : '<div class="econ3d-controlhint">WASD 이동 · W 더블탭 달리기 · 좌클릭 공격/꾹 눌러 채집 · 우클릭 낚시(물) · E/클릭 NPC · 더블점프 · M 지도</div>'}
      <div class="econ3d-panelwrap" id="econ3dPanelWrap" style="display:none">
        <div class="econ3d-panelbar"><span id="econ3dPanelGold"></span><button class="btn btn--ghost btn--sm" data-act="econ3d_panel_close">✕ 닫기</button></div>
        <div id="econBody" class="econ-body econ3d-body"></div>
      </div>
    </section>`;
  }
  function fallbackErr(msg) {
    return `<section class="screen"><header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">💰 경제</b></header>
      <div class="grow center" style="justify-content:center;text-align:center;padding:20px"><p>${msg}</p></div></section>`;
  }
  function resize() { if (!renderer) return; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  /* ---------------- 루프 ---------------- */
  let _hudT = 0, _fairyBobT = 0;
  function loop(ts) {
    if (!running) return; raf = requestAnimationFrame(loop);
    if (contextLost) { lastT = ts; return; }
    try {
      if (!lastT) lastT = ts; let dt = (ts - lastT) / 1000; lastT = ts; if (dt > 0.1) dt = 0.1;
      worldTime += dt;
      if (!panelOpen()) { collide(dt); if (gathering && gatherZoneKey) gatherAt(gatherZoneKey); }
      // V13-A: 홈 터치 파괴는 아래 progressBreaking(금가는 과정)로 통합 — 즉시 파괴 제거
      // 인월드 게임플레이 틱: 채집 홀드/재생성/낚시/몬스터/피해 텍스트/체력
      if (!panelOpen()) {
        P._atkCd = Math.max(0, (P._atkCd || 0) - dt);
        if (mouseHeld && lookS.locked) {
          const mb2 = pickMob();
          if (mb2 && P._atkCd <= 0) { P._atkCd = 0.45; attackMobHit(mb2); }
          else if (!mb2) progressBreaking(dt);
        }
        if (isTouch && worldMode !== 'visit' && lookT.id !== -1 && !lookT.acted && (lookT.moved || 0) < 10 && performance.now() - lookT.downT > 250) progressBreaking(dt);
        tickMobs(dt); tickFishing(); tickPlayerVitals(dt); tickWarpPads(dt); tickPartyDungeonSync(dt);
      }
      tickRegen(); tickDmgTexts(dt); tickBuildQueue(); tickChunkCulling(dt);
      _hpHudT += dt; if (_hpHudT > 0.5) { _hpHudT = 0; updateHpHud(); }
      if (isTouch) updateJoystick(dt);
      flushWorldEdits();   // 블록 편집 → 메시 리빌드(프레임당 1회로 병합, 더티 청크만)
      camera.position.set(P.x, P.y + P.eye, P.z);
      const d = lookDir(); camera.lookAt(P.x + d.x, P.y + P.eye + d.y, P.z + d.z);
      updateAimHighlight();
      updateSky();
      updateAmbientMobs(dt);
      netTick(dt);
      updateBanner(); tickBanner(dt);
      // 페어리 오브 흔들림 + 구름 이동
      _fairyBobT += dt;
      for (const id in fairyMeshes) { const m = fairyMeshes[id]; if (m.visible && m.userData.orb) { m.userData.orb.position.y = 0.6 + Math.sin(_fairyBobT * 2 + Number(id)) * 0.15; m.userData.orb.rotation.y += dt * 1.5; } }
      if (cloudGroup) cloudGroup.children.forEach(g => { g.position.x += g.userData.speed * dt; if (g.position.x > W + 10) g.position.x = -10; });
      _hudT += dt;
      if (_hudT > 0.4) {
        _hudT = 0; updateHud(); updateHotbar(); rebuildMinionVisuals(false); updateQuestHud();
        if (_mapDirty) { _mapDirty = false; buildMinimapBase(); }
        drawMinimap();
      }
      // 퀘스트 NPC 느낌표 마커 바운스
      if (npcGroup) npcGroup.children.forEach(ch => { ch.children && ch.children.forEach(c => { if (c.userData && c.userData.qbob) c.position.y = 2.85 + Math.sin(_fairyBobT * 3) * 0.12; }); });
      renderer.render(scene, camera);
    } catch (e) { console.error('econ3d loop', e); }
  }

  /* ---------------- 시작/종료 ---------------- */
  function start() {
    if (typeof THREE === 'undefined') { if (typeof app === 'function') app().innerHTML = fallbackErr('3D 라이브러리를 불러오지 못했어요(네트워크 확인).'); return; }
    if (typeof setScreen === 'function') setScreen('econ');
    if (typeof app === 'function') app().innerHTML = screenHTML();
    canvas = document.getElementById('econ3dCanvas');
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { if (typeof app === 'function') app().innerHTML = fallbackErr('이 기기/브라우저가 3D(WebGL)를 지원하지 않아요.'); return; }
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => {   // V12: 컨텍스트 복구 시 전체 재구성(아틀라스+지형+그룹)
      try {
        contextLost = false;
        buildAtlas();
        disposeIslandMeshes();
        buildIslandMesh((worldMode === 'home' || worldMode === 'visit') ? HOME_BOUNDS : null);
        if (worldMode === 'hub') { buildNpcMeshes(); buildNodeMeshes(); buildAmbientMobs(); }
        buildFairyMeshes(); refreshFairyVisibility(); buildStaticInteractables();
        rebuildMinionVisuals(true); buildMinimapBase(); buildPortalMarker(); setupOutline();
        if (typeof toast === 'function') toast('그래픽을 복구했어요', true);
      } catch (err) { console.error('econ3d ctx restore', err); }
    }, false);
    scene = new THREE.Scene(); scene.background = null; scene.fog = new THREE.Fog(0xbfe0f5, 48, 108);
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
    buildAtlas();
    buildClouds();
    setupOutline();
    resize(); window.addEventListener('resize', resize);
    bindInput(); running = true; lastT = 0; contextLost = false;
    updateHud();
    // V12: 실제 하이픽셀 스카이블럭처럼 — 접속/재접속 시 항상 프라이빗 섬에서 스폰(허브 아님).
    //   기존엔 접속 즉시 448² 허브를 풀생성·풀메싱한 뒤 곧바로 섬으로 이동하며 통째로 폐기(이중 작업·프레임 스파이크)했다.
    //   이제 허브는 첫 진입 시점에만 생성 — 접속 직후 렉/튕김 대폭 완화. travelTo가 지형/그룹/인터랙터블/미니맵/포탈을 모두 설정.
    worldMode = 'hub';   // travelTo가 force로 home으로 전환하되, 널 hub를 캐시하지 않도록 world는 null 상태 유지
    travelTo('home', true);
    const api0 = econApi();
    if (api0.isFresh && api0.isFresh()) {
      if (typeof toast === 'function') setTimeout(() => toast('🌱 스카이블럭에 온 걸 환영해요! 나무를 캐서 도구를 만들고, 포탈로 허브에 가보세요', true), 600);
    } else if (typeof toast === 'function') setTimeout(() => toast('🏝️ 프라이빗 섬으로 돌아왔어요 — 포탈로 허브에 갈 수 있어요', true), 600);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!running && !renderer) return;
    running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', resize); unbindInput();
    if (document.exitPointerLock && document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {}
    disposeIslandMeshes();
    [npcGroup, nodeGroup, minionGroup, fairyGroup, cloudGroup, propGroup, portalMarker].forEach(g => { if (g && scene) { scene.remove(g); disposeGroup(g); } });
    npcGroup = nodeGroup = minionGroup = fairyGroup = cloudGroup = propGroup = portalMarker = null;
    if (outlineMesh && scene) { scene.remove(outlineMesh); outlineMesh = null; }
    if (renderer) { try { renderer.dispose(); } catch (e) {} }
    renderer = null; scene = null; camera = null; canvas = null;
    for (const id in others) { if (others[id].mesh) disposeGroup(others[id].mesh); }
    others = {}; visitData = null;
    clearMobs(); stopFishing(); restoreAllRegen(); dmgTexts = []; php = null; mouseHeld = false; breaking = null;
    _minionSig = ''; ambientMobs = []; fairyMeshes = {}; curBannerKey = '';
    worldMode = 'hub'; worldHubCache = null; worldCache = {}; world = null; _meshDirty = false; _mapDirty = false;
  }

  /* ---------------- 액션 위임 ---------------- */
  let selectedHotbar = 0;   // V12-D: 활성 핫바 슬롯(0~7). 숫자키 1~8로 선택.
  // 핫바가 비었으면 보유한 도구/블럭으로 자동 채움(실제 MC 초반 감성)
  function ensureHotbar() {
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0) return;
    if (!Array.isArray(P0.hotbar) || P0.hotbar.length !== 8) P0.hotbar = [null, null, null, null, null, null, null, null];
    // 보유하지 않게 된 아이템은 슬롯에서 비움
    for (let i = 0; i < 8; i++) if (P0.hotbar[i] && (P0.inv[P0.hotbar[i]] || 0) <= 0 && !isToolKey(P0.hotbar[i])) P0.hotbar[i] = null;
    if (P0.hotbar.every(x => !x)) {   // 완전히 비었으면 자동 채우기
      const fill = [];
      const D0 = window.ECON_DATA;
      ['pickaxe', 'axe', 'hoe', 'rod'].forEach(fam => { let best = null; (D0.TOOLS[fam] || []).forEach(t => { if ((P0.inv[t.key] || 0) > 0) best = t; }); if (best) fill.push(best.key); });
      ownedPlaceableList().slice(0, 8 - fill.length).forEach(k => fill.push(k));
      for (let i = 0; i < 8; i++) P0.hotbar[i] = fill[i] || null;
    }
  }
  function isToolKey(k) { const D0 = window.ECON_DATA; for (const fam in D0.TOOLS) if (D0.TOOLS[fam].some(t => t.key === k)) return true; return false; }
  function activeHotbarKey() { const api = econApi(); const P0 = api.getP ? api.getP() : null; return P0 && P0.hotbar ? P0.hotbar[selectedHotbar] : null; }
  function syncPlaceFromHotbar() {   // 활성 핫바 아이템이 설치가능 블럭이면 배치 대상으로
    const k = activeHotbarKey();
    selectedPlaceKey = isPlaceable(k) ? k : null;
  }
  function updateHotbar() {
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0) return;
    ensureHotbar();
    const icon = k => (typeof window.econIcon === 'function' ? `<img src="${window.econIcon(k)}" alt="">` : '');
    for (let i = 0; i < 8; i++) {
      const el = document.getElementById('econ3dSlot' + i); if (!el) continue;
      const k = P0.hotbar[i];
      const cnt = (k && !isToolKey(k)) ? (P0.inv[k] || 0) : 0;
      el.classList.toggle('is-active', i === selectedHotbar);
      el.innerHTML = k ? `${icon(k)}${cnt > 1 ? `<span class="econ3d-slotcount">${cnt}</span>` : ''}` : '';
    }
    syncPlaceFromHotbar();
  }
  function act(a, el) {
    switch (a) {
      case 'econ3d_hotbar': {   // V12-D: 슬롯 클릭 = 선택(빈 슬롯/롱프레스는 인벤토리). 9번=메뉴.
        const i = Number(el.dataset.i);
        if (i === 8) { openPanelForZone('hub', 'menu'); return true; }
        const P0 = econApi().getP ? econApi().getP() : null;
        if (P0 && P0.hotbar && P0.hotbar[i]) { selectedHotbar = i; updateHotbar(); }
        else openPanelForZone('hub', 'inv');   // 빈 슬롯 클릭 = 인벤토리에서 아이템 지정
        return true;
      }
      case 'econ3d_jump': keys.Space = true; setTimeout(() => { keys.Space = false; }, 120); return true;
      case 'econ3d_panel_close': hidePanel(); return true;
      case 'econ3d_map': toggleMinimapSize(); return true;
      case 'econ3d_block': selectedPlaceKey = el.dataset.key; updateBuildHud(); return true;
    }
    return false;
  }

  window.economy3dStart = start;
  window.economy3dClosePanel = () => { hidePanel(); };   // V11: 아레나 시작 시 패널 닫기
  window.economy3dRefreshHotbar = () => { try { updateHotbar(); } catch (e) {} };   // V12-D: 인벤토리에서 핫바 지정 후 3D 갱신
  window.economy3dPlayerHomePos = () => (worldMode === 'home' ? { x: Math.round(P.x - 0.5), z: Math.round(P.z - 0.5) } : null);   // V13-A: 미니언을 서있는 위치에 배치
  window.economy3dRebuildMinions = () => { try { rebuildMinionVisuals(true); } catch (e) {} };
  window.__econ3dPlaceable = k => { try { return isPlaceable(k); } catch (e) { return false; } };   // V12-D
  window.economy3dStop = stop;
  window.economy3dAct = act;
  window.economy3dVisit = travelVisit;   // 멀티: 다른 플레이어 섬 방문(economy-net.js가 호출)
  window.economy3dWarp = dest => { if (running && WORLD_DEFS[dest]) { hidePanel(); warpTo(dest); return true; } return false; };
  window.economy3dWorlds = () => Object.keys(WORLD_DEFS).filter(k => k !== 'visit' && k !== 'dungeon').map(k => ({ key: k, name: WORLD_DEFS[k].name, req: WARP_REQ[k] || null }));

  if (typeof window !== 'undefined' && window.__ECON3D_TEST) {
    window.__econ3d = {
      start, stop, act, genWorld,
      getBlock: getBlockLocal, surfaceTop, zoneAt, columnSurface,
      NPCS, NODES, MINION_SLOTS, RESOURCE_ZONE, FAIRY_SPOTS, ISLANDS, BRIDGES,
      P, currentAim, doInteract, gatherAt,
      openPanelForZone, showPanel, hidePanel, panelOpen,
      rebuildMinionVisuals, refreshFairyVisibility,
      dynamicInteractables: () => dynamicInteractables,
      interactables: () => interactables,
      buildStaticInteractables: () => { NPCS.forEach(n => { n._y = surfaceTop(n.x, n.z); }); NODES.forEach(n => { n._y = surfaceTop(n.x, n.z); }); FAIRY_SPOTS.forEach(fs => { fs._y = fs.y != null ? fs.y : surfaceTop(fs.x, fs.z); }); buildStaticInteractables(); },
      scene: () => scene, camera: () => camera,
      world: () => world, W, H, D: Dp, SEA,
      setGathering: (v, zk) => { gathering = v; gatherZoneKey = zk; },
      collide, moveAxis, dayFactor, ambientMobs: () => ambientMobs,
      ID, BLOCKS,
      // V3: 프라이빗 섬/건축/이동
      travelTo, worldMode: () => worldMode, genHome, PORTALS, HOME_MINION_SLOTS, HOME_BOUNDS, HOME_CENTER,
      chunkMeshCount: () => Object.keys(chunkMeshes).length,   // V12 크래시 검증용
      buildQueueLen: () => buildQueue.length,
      updateQuestHud, questNpcList,   // V13-B 퀘스트 HUD 검증용
      scatterWorldDetail, buildThemeStructures,   // V16 데코 + V18-C 테마 건물 검증용
      raycastBlock, homeBreakBlock, homePlaceBlock,
      setSelectedBlock: k => { selectedPlaceKey = k; }, getSelectedBlock: () => selectedPlaceKey, ownedPlaceableList,
      getSelectedHotbar: () => selectedHotbar, setSelectedHotbar: i => { selectedHotbar = i; updateHotbar(); }, ensureHotbar, activeHotbarKey, updateHotbar,
      flushWorldEdits,
      // V4: 멀티(아바타/방문)
      travelVisit, updateNetAvatars, others: () => others, getVisitData: () => visitData,
      // V5: 테마 월드/인월드 게임플레이
      WORLD_DEFS, WARPS, MOB_TYPES, SPAWN_AREAS, gatherBlocks, regenQueue: () => regenQueue,
      SHALLOW_SEA, DEEP_SEA, pickShallowSea,   // V20-H: 바다 생물 로스터(테스트용)
      loadWorldForTest: (key) => { const def = WORLD_DEFS[key]; W = def.size[0]; H = def.size[1]; Dp = def.size[2]; worldMode = key; if (key === 'hub') genWorld(); else if (key === 'home') genHome(); else def.gen(); return world; },
      getDims: () => ({ W, H, Dp }),
      spawnMobForTest: (area, type, lv) => spawnMob(area, type, lv),
      progressBreaking, tickRegen, pickMob, mobs: () => mobs,
      startDungeon3d, getDungeonState: () => dungeonState, onDungeonMobDead, spawnDungeonMob,
    };
  }
})();
