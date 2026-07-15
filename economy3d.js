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
  const PORTAL_DESTS = ['park', 'barn', 'gold', 'deep', 'spider', 'nether', 'end', 'mushroom'];

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
    { key: 'oak_leaves', tex: 'leaves', opaque: false },
    { key: 'spruce_leaves', tex: 'spruce_leaves', opaque: false },
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
    { key: 'torch', tex: 'torch', opaque: false, solid: false, cross: true },   /* V24-B: 횃불 설치 가능(십자 렌더) — 아이템만 있고 블럭이 없던 버그 */
    { key: 'dark_oak_log', tex: { top: 'dark_oak_top', side: 'dark_oak_side', bottom: 'dark_oak_top' } },
    { key: 'dark_oak_leaves', tex: 'dark_oak_leaves', opaque: false },
    { key: 'jungle_log', tex: { top: 'jungle_top', side: 'jungle_side', bottom: 'jungle_top' } },
    { key: 'jungle_leaves', tex: 'jungle_leaves', opaque: false },
    { key: 'acacia_log', tex: { top: 'acacia_top', side: 'acacia_side', bottom: 'acacia_top' } },
    { key: 'acacia_leaves', tex: 'acacia_leaves', opaque: false },
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
  [['crafting_table', { top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'planks' }],
   ['furnace', { top: 'furnace_top', side: 'furnace_side', bottom: 'stone' }],
   ['chest', { top: 'chest_top', side: 'chest_side', bottom: 'planks' }]].forEach(([k, tex]) => BLOCKS.push({ key: k, tex, interact: true, shape: k === 'chest' ? 'chest' : null, opaque: k !== 'chest' }));
  PORTAL_DESTS.forEach(k => BLOCKS.push({ key: 'portal_' + k, tex: 'portal_' + k, interact: true, opaque: false }));
  // V17: 모든 나무 판자(다크오크/정글/아카시아 신규) + 계단/반블럭 형태 블럭(모든 나무 + 돌 계열)
  ['dark_oak_planks', 'jungle_planks', 'acacia_planks'].forEach(k => BLOCKS.push({ key: k, tex: k }));
  const SHAPE_MATS = [
    { k: 'oak_planks', tex: 'planks' }, { k: 'birch_planks', tex: 'birch_planks' }, { k: 'spruce_planks', tex: 'spruce_planks' },
    { k: 'dark_oak_planks', tex: 'dark_oak_planks' }, { k: 'jungle_planks', tex: 'jungle_planks' }, { k: 'acacia_planks', tex: 'acacia_planks' },
    { k: 'stone', tex: 'stone' }, { k: 'cobblestone', tex: 'cobble' }, { k: 'stone_bricks', tex: 'stonebrick' },
    // V18-B: 석재/장식 계열 확장(계단·반블럭 더 다양하게)
    { k: 'quartz_block', tex: 'quartz' }, { k: 'sandstone', tex: 'sandstone' }, { k: 'bricks', tex: 'bricks' },
    { k: 'purpur', tex: 'purpur' }, { k: 'smooth_stone', tex: 'smooth_stone' }, { k: 'prismarine', tex: 'prismarine' },
    // V87: 크림슨/뒤틀린/블랙스톤/현무암 계열(네더·엔드 섬 계단·반블럭)
    { k: 'crimson_planks', tex: 'crimson_planks' }, { k: 'warped_planks', tex: 'warped_planks' },
    { k: 'blackstone', tex: 'blackstone' }, { k: 'polished_blackstone', tex: 'polished_blackstone' }, { k: 'polished_blackstone_bricks', tex: 'polished_blackstone_bricks' },
    { k: 'red_nether_bricks', tex: 'red_nether_bricks' }, { k: 'nether_bricks', tex: 'nether_bricks' }, { k: 'end_stone_bricks', tex: 'end_stone_bricks' }, { k: 'polished_basalt', tex: { top: 'polished_basalt_top', side: 'polished_basalt_side', bottom: 'polished_basalt_top' } },
  ];
  SHAPE_MATS.forEach(m => {
    BLOCKS.push({ key: m.k + '_slab', tex: m.tex, shape: 'slab', opaque: false });
    for (let f = 0; f < 4; f++) BLOCKS.push({ key: m.k + '_stairs_' + f, tex: m.tex, shape: 'stairs', facing: f, opaque: false });
  });
  // V17-B: 울타리(자동 연결) + 트랩도어 — 모든 나무
  const WOOD_SHAPES = [['oak', 'planks'], ['birch', 'birch_planks'], ['spruce', 'spruce_planks'], ['dark_oak', 'dark_oak_planks'], ['jungle', 'jungle_planks'], ['acacia', 'acacia_planks'], ['crimson', 'crimson_planks'], ['warped', 'warped_planks']];
  WOOD_SHAPES.forEach(([w, tex]) => {
    BLOCKS.push({ key: w + '_fence', tex, shape: 'fence', opaque: false });
    BLOCKS.push({ key: w + '_trapdoor', tex, shape: 'trapdoor', opaque: false, collTop: 0.1875 });
    // V17-C: 문(2칸 높이, 여닫이) — 닫힘(막힘)/열림(통과), 4방향
    for (let f = 0; f < 4; f++) {
      BLOCKS.push({ key: w + '_door_c_' + f, tex, shape: 'door', facing: f, open: false, opaque: false });
      BLOCKS.push({ key: w + '_door_o_' + f, tex, shape: 'door', facing: f, open: true, opaque: false, solid: false });
    }
  });
  // V22-G2: 석재 변형 계열(화강암/섬록암/안산암/이끼·금간 석재벽돌/붉은 사암/매끄러운 사암) — 자체 디자인 텍스처
  [['granite', 'granite'], ['polished_granite', 'polished_granite'], ['diorite', 'diorite'], ['polished_diorite', 'polished_diorite'],
   ['andesite', 'andesite'], ['mossy_stone_bricks', 'mossy_stone_bricks'], ['cracked_stone_bricks', 'cracked_stone_bricks'],
   ['red_sandstone', 'red_sandstone'], ['smooth_sandstone', 'smooth_sandstone']].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));
  // V21-F1: 바닐라 광물 저장 블록 7종(주괴 9 ↔ 블록 1)
  [['iron_block', 'iron_block'], ['gold_block', 'gold_block'], ['diamond_block', 'diamond_block'], ['emerald_block', 'emerald_block'],
   ['coal_block', 'coal_block'], ['redstone_block', 'redstone_block'], ['lapis_block', 'lapis_block']].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));
  // V23-C: 딥슬레이트 + 구리 계열(공식 MC 텍스처 파일명 그대로 = 리소스팩 자동 매핑, CLAUDE.md 규칙)
  BLOCKS.push({ key: 'deepslate', tex: { top: 'deepslate_top', side: 'deepslate', bottom: 'deepslate_top' } });
  [['cobbled_deepslate', 'cobbled_deepslate'], ['polished_deepslate', 'polished_deepslate'], ['deepslate_bricks', 'deepslate_bricks'],
   ['cracked_deepslate_bricks', 'cracked_deepslate_bricks'], ['deepslate_tiles', 'deepslate_tiles'], ['chiseled_deepslate', 'chiseled_deepslate'],
   ['deepslate_coal_ore', 'deepslate_coal_ore'], ['deepslate_iron_ore', 'deepslate_iron_ore'], ['deepslate_gold_ore', 'deepslate_gold_ore'],
   ['deepslate_diamond_ore', 'deepslate_diamond_ore'], ['deepslate_emerald_ore', 'deepslate_emerald_ore'], ['deepslate_lapis_ore', 'deepslate_lapis_ore'],
   ['deepslate_redstone_ore', 'deepslate_redstone_ore'], ['deepslate_copper_ore', 'deepslate_copper_ore'],
   ['copper_ore', 'copper_ore'], ['raw_copper_block', 'raw_copper_block'], ['copper_block', 'copper_block'], ['cut_copper', 'cut_copper'],
   ['chiseled_copper', 'chiseled_copper'], ['exposed_copper', 'exposed_copper'], ['weathered_copper', 'weathered_copper'],
   ['oxidized_copper', 'oxidized_copper']].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));
  // V87: 실제 스블 맵(크림슨/엔드/네더 섬) 손실 없는 임포트용 바닐라 블럭 — 타일명=공식 MC 파일명(리소스팩 자동)
  [['crimson_planks', 'crimson_planks'], ['warped_planks', 'warped_planks'],
   ['blackstone', 'blackstone'], ['polished_blackstone', 'polished_blackstone'], ['polished_blackstone_bricks', 'polished_blackstone_bricks'],
   ['gilded_blackstone', 'gilded_blackstone'], ['chiseled_polished_blackstone', 'chiseled_polished_blackstone'], ['cracked_polished_blackstone_bricks', 'cracked_polished_blackstone_bricks'],
   ['soul_soil', 'soul_soil'], ['red_nether_bricks', 'red_nether_bricks'], ['chiseled_nether_bricks', 'chiseled_nether_bricks'], ['cracked_nether_bricks', 'cracked_nether_bricks'],
   ['nether_gold_ore', 'nether_gold_ore'], ['nether_quartz_ore', 'nether_quartz_ore'], ['netherite_block', 'netherite_block'], ['crying_obsidian', 'crying_obsidian'],
   ['nether_wart_block', 'nether_wart_block'], ['warped_wart_block', 'warped_wart_block'], ['shroomlight', 'shroomlight'],
   ['end_stone_bricks', 'end_stone_bricks'], ['honeycomb_block', 'honeycomb_block'], ['red_sand', 'red_sand'], ['target', 'target'], ['sea_lantern', 'sea_lantern'], ['dark_prismarine', 'dark_prismarine'], ['prismarine_bricks', 'prismarine_bricks'],
   ['slime_block', 'slime_block']].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));   // V123: 슬라임 블럭 — 섬 간 이동 발사대(런치패드) 재료
  [['crimson_stem', { top: 'crimson_stem_top', side: 'crimson_stem', bottom: 'crimson_stem_top' }], ['warped_stem', { top: 'warped_stem_top', side: 'warped_stem', bottom: 'warped_stem_top' }],
   ['basalt', { top: 'basalt_top', side: 'basalt_side', bottom: 'basalt_top' }], ['polished_basalt', { top: 'polished_basalt_top', side: 'polished_basalt_side', bottom: 'polished_basalt_top' }],
   ['bone_block', { top: 'bone_block_top', side: 'bone_block_side', bottom: 'bone_block_top' }], ['purpur_pillar', { top: 'purpur_pillar_top', side: 'purpur_pillar', bottom: 'purpur_pillar_top' }],
   ['crimson_nylium', { top: 'crimson_nylium', side: 'crimson_nylium_side', bottom: 'netherrack' }], ['warped_nylium', { top: 'warped_nylium', side: 'warped_nylium_side', bottom: 'netherrack' }],
   ['ancient_debris', { top: 'ancient_debris_top', side: 'ancient_debris_side', bottom: 'ancient_debris_top' }], ['carved_pumpkin', { top: 'pumpkin_top', side: 'carved_pumpkin', bottom: 'pumpkin_top' }],
   ['dried_kelp_block', { top: 'dried_kelp_top', side: 'dried_kelp_side', bottom: 'dried_kelp_bottom' }], ['barrel', { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_bottom' }]].forEach(([k, tex]) => BLOCKS.push({ key: k, tex }));
  // V21-E2: 사다리(4방향 벽 부착, 오르기 가능) + 침대(수면) + 보트(물 위 탈것)
  for (let f = 0; f < 4; f++) BLOCKS.push({ key: 'ladder_' + f, tex: 'ladder', shape: 'ladder', facing: f, opaque: false, solid: false, climb: true });
  BLOCKS.push({ key: 'bed', tex: { top: 'bed_top', side: 'bed_side', bottom: 'planks' }, shape: 'bed', opaque: false, interact: true });
  const ID = {};
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });

  /* V12 블럭 경제: 파괴 시 드롭 아이템(null=드롭 없음). 대부분 자기 자신, MC식 예외만 명시. */
  const BLOCK_DROP = {
    grass: 'dirt', farmland: 'dirt', mycelium: 'dirt',
    stone: 'cobblestone', coal_ore: 'coal', iron_ore: 'iron', gold_ore: 'gold', lapis_ore: 'lapis',
    redstone_ore: 'redstone', diamond_ore: 'diamond', emerald_ore: 'emerald',
    // V23-C: 딥슬레이트/구리(바닐라 드롭 규칙 — 딥슬레이트=조각난 딥슬레이트, 광석=자원)
    deepslate: 'cobbled_deepslate', deepslate_coal_ore: 'coal', deepslate_iron_ore: 'iron', deepslate_gold_ore: 'gold',
    deepslate_lapis_ore: 'lapis', deepslate_redstone_ore: 'redstone', deepslate_diamond_ore: 'diamond', deepslate_emerald_ore: 'emerald',
    copper_ore: 'raw_copper', deepslate_copper_ore: 'raw_copper',
    oak_log: 'oaklog', birch_log: 'birchlog', spruce_log: 'sprucelog',
    dark_oak_log: 'dark_oak_log', jungle_log: 'jungle_log', acacia_log: 'acacia_log',
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
  BLOCKS.forEach(b => { if (b.key !== 'air' && b.key !== 'bedrock' && !b.liquid && !/_stairs_\d$/.test(b.key) && !/_door_[co]_\d$/.test(b.key) && !/^ladder_\d$/.test(b.key)) PLACE_BLOCK[b.key] = b.id; });   // 계단/문/사다리 변형은 아이템 아님
  PLACE_BLOCK.ladder = null;   // 아래에서 ID.ladder_0으로 지정
  PLACE_BLOCK.oaklog = ID.oak_log; PLACE_BLOCK.birchlog = ID.birch_log; PLACE_BLOCK.sprucelog = ID.spruce_log;
  PLACE_BLOCK.dark_oak_log = ID.dark_oak_log; PLACE_BLOCK.jungle_log = ID.jungle_log; PLACE_BLOCK.acacia_log = ID.acacia_log;
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
  // V21-E2: 사다리 제네릭 아이템 → 설치 시 벽면 방향 재계산, 변형은 제네릭 드롭
  PLACE_BLOCK.ladder = ID.ladder_0;
  for (let f = 0; f < 4; f++) BLOCK_DROP['ladder_' + f] = 'ladder';
  // V94: 블럭 키 ≠ 바닐라 아이템 키 정규화 — 채굴 시 실제 아이템 드롭 + 그 아이템으로 재설치(팬텀 아이템 제거)
  const BLOCK_ITEM_FIX = { mushroom_red_block: 'red_mushroom_block', mushroom_brown_block: 'brown_mushroom_block', end_bricks: 'end_stone_bricks', purpur: 'purpur_block' };
  for (const bk in BLOCK_ITEM_FIX) {
    const item = BLOCK_ITEM_FIX[bk];
    if (ID[bk] != null) { BLOCK_DROP[bk] = item; if (ID[item] == null && PLACE_BLOCK[item] == null) PLACE_BLOCK[item] = ID[bk]; }   // 별도 동명 블럭이 없을 때만 설치 별칭 등록
  }
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
    dark_oak_log: 'forest', acacia_log: 'forest', jungle_log: 'forest',
    rawfish: 'dock', clay: 'dock',
    rotten_flesh: 'hub', bone: 'hub', string: 'hub', slime_ball: 'hub', blaze_rod: 'hub', ghast_tear: 'hub', leather: 'farm', feather: 'farm',
    raw_porkchop: 'farm', raw_chicken: 'farm', raw_mutton: 'farm',   // V76: 축산 컬렉션 자원(농장 존)
    apple: 'forest', salmon: 'dock', clownfish: 'dock', pufferfish: 'dock', prismarine: 'dock', sponge: 'dock',
    magma_cream: 'hub', spider_eye: 'hub', gunpowder: 'hub', ender_pearl: 'hub', ender_shard: 'hub',
  };
  const MINION_COLORS = {
    stone: 0x9a9a9a, coal: 0x2a2a2e, iron: 0xd8a282, gold: 0xf2d75c, lapis: 0x1f4fc0, redstone: 0xc81f28,
    diamond: 0x5decd5, emerald: 0x1fbf5c, obsidian: 0x2a2040,
    wheat: 0xd8b23a, carrot: 0xe07b1f, potato: 0xc8a25a, pumpkin: 0xd6791f, melon: 0x4c8f46, sugarcane: 0x8fc36a,
    oaklog: 0x8a6a3a, birchlog: 0xd7d3c8, sprucelog: 0x4a3722,
    rawfish: 0x3a6ee0, clay: 0xa4a8b6,
    raw_porkchop: 0xe8a0a0, raw_chicken: 0xe8d8b0, raw_mutton: 0xd8c8b8,   // V76
    // V94: 나머지 미니언 자원 색상(전부 회색으로 렌더되던 21종 보완)
    dark_oak_log: 0x3b2a17, acacia_log: 0xa8532a, jungle_log: 0x9a7a4a,
    rotten_flesh: 0x8a5a48, bone: 0xe8e6d8, string: 0xdddddd, slime_ball: 0x7fd36a, blaze_rod: 0xf6c141,
    leather: 0x9a6a3a, ghast_tear: 0xe8f0ee, apple: 0xd63b34, salmon: 0xd9705a, clownfish: 0xe08a2a,
    pufferfish: 0xe0c040, prismarine: 0x4aa89a, sponge: 0xd8c84a, magma_cream: 0xd8641f,
    spider_eye: 0x8a2a2a, gunpowder: 0x555559, ender_shard: 0x1a5a52, ender_pearl: 0x1f7a6a,
  };
  // V24: 미니언 슬롯 좌표 현행화 — 구 192² 레이아웃 좌표가 공허/엉뚱한 존에 떠 있던 버그.
  //   각 존 실제 중심 인근(광산 96,208 / 농장 330,224 / 숲 140,130 / 연못 322,322)으로 재배치
  const MINION_SLOTS = {
    mine: [[86, 200], [90, 204], [84, 210], [92, 196], [80, 206], [94, 212]],
    farm: [[314, 210], [318, 214], [322, 208], [314, 240], [318, 244], [324, 238]],
    forest: [[128, 118], [134, 114], [124, 126], [150, 120], [146, 142], [122, 138]],
    dock: [[308, 312], [312, 308], [304, 318], [334, 314], [330, 334], [310, 336]],
  };
  // NPC(존 + 허브 서브탭 연결)
  const NPCS = [
    { key: 'shopkeeper', name: '상점 주인', zone: 'hub', tab: 'shop', x: 204, z: 244, color: 0x3a6ee0 },
    { key: 'bankTeller', name: '은행원', zone: 'hub', tab: 'bank', x: 241, z: 209, color: 0xf2d75c },
    { key: 'minionManager', name: '미니언 관리소장', zone: 'hub', tab: 'minions', x: 199, z: 215, color: 0x6aa84f },
    { key: 'petKeeper', name: '펫 상인', zone: 'hub', tab: 'pets', x: 250, z: 243, color: 0xe048c4 },
    { key: 'enchanter', name: '마법부여사', zone: 'hub', tab: 'enchant', x: 224, z: 201, color: 0x9365b8 },
    { key: 'auctioneer', name: '경매인', zone: 'hub', tab: 'deals', x: 206, z: 221, color: 0xc0392b },   // V56: 신전 입구 앞(포탈 통로 밖)
    { key: 'gladiator', name: '검투사 마스터', zone: 'hub', tab: 'arena', x: 224, z: 346, color: 0xb8860b },   // V11: 콜로세움 아레나
    { key: 'reforgeSmith', name: '재련 대장장이', zone: 'hub', tab: 'reforge', x: 238, z: 226, color: 0x6b5436 },
    { key: 'guide', name: '모험 안내인', zone: 'hub', tab: 'stats', x: 224, z: 247, color: 0x2c82c9 },
    { key: 'craftsman', name: '장인(제작대)', zone: 'hub', tab: 'craft', x: 216, z: 210, color: 0x8a6a3a },   // V56: 경매 신전 동벽(x214) 밖으로
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
  // V115: 페어리 소울 기능 완전 제거 — 데이터/스폰/메시/UI 전부 삭제(사용자 요청)
  const FAIRY_SPOTS = [];

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
    hub: { x: 210, z: 224, target: 'home', label: '🏝️ 내 섬으로', fx: 0x3fd977 },   // 내 섬행 = 초록 자연빛
    home: { x: 96, z: 76, target: 'hub', label: '🏘️ 허브로', fx: 0xffcf4d },        // 허브(도시)행 = 황금빛 — 포탈섬(스폰섬과 끊김, 직접 다리 건설)
    visit: { x: 96, z: 76, target: 'hub', label: '🏘️ 허브로', fx: 0xffcf4d },
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
  let _fluidAnim = null, _fluidT = 0, _fluidPhase = 0;   // V21-G1: 물/용암 타일 애니메이션 상태
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
  const lookS = { locked: false, lastAsk: 0 };
  const moveT = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  const lookT = { id: -1, lx: 0, ly: 0 };
  // V22-H1: 정밀 포인터(마우스)가 있으면 PC 모드 — 터치스크린 노트북이 터치 모드로 오인되던 버그 수정
  const isTouch = (navigator.maxTouchPoints > 0) && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches);

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
  // V99b: 개방/밀폐 지형 모두에서 '서 있을 수 있는' 바닥 y 탐색(임포트 맵 실내 스폰용).
  //   위에서 내려오며 첫 솔리드(지표 or 지붕) 덩어리를 지나 그 아래 공동이 있으면 실내 바닥을,
  //   없으면(개방 지형) 그 지표를 반환 → 밀폐 맵에서 지붕 위 스폰 방지.  {y, ceil} 반환.
  function standInfo(x, z) {
    let y = H - 1;
    while (y >= 1 && !solidAt(x, y, z)) y--;                 // 하늘 공기 스킵
    if (y < 1) return { y: SEA + 1, ceil: SEA + 1 };
    const surf = y + 1;                                      // 첫 솔리드 상단(개방이면 지표, 밀폐면 지붕)
    while (y >= 1 && solidAt(x, y, z)) y--;                  // 첫 솔리드 덩어리 통과
    if (y < 1) return { y: surf, ceil: surf };               // 아래가 전부 솔리드 → 개방 지표
    while (y >= 1 && !solidAt(x, y, z)) y--;                 // 공동 공기 스킵
    if (y < 1) return { y: surf, ceil: surf };               // 실내 바닥 없음 → 지표
    return { y: y + 1, ceil: surf };                         // 실내 바닥 상단(y+1), 지붕(surf)
  }
  // V97(A8): 맵파일 월드 중앙 스폰 높이. 네더는 베드락 지붕이 최상단이라 surfaceTop이 지붕을 반환 → 중간 높이에서 아래로 첫 바닥을 찾는다(지붕 위 스폰 방지).
  function mapCenterTop(cx, cz) { return worldMode === 'nether' ? groundBelow(cx, cz, Math.floor(H * 0.55)) : surfaceTop(cx, cz); }

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
    // V20-S: 핵심부를 플라자 높이(y19)와 동일하게 → 마을 가장자리 3칸 절벽/못 나가는 버그 제거
    let top = 19;
    top += Math.round(bump(x, z, 224, 86, 68, 31));     // 북쪽 설산(먼 곳, 정상 y≥48)
    top += Math.round(bump(x, z, 96, 208, 46, 8));      // 서쪽 광산 언덕
    top -= Math.round(bump(x, z, 322, 322, 22, 2));     // 연못 분지
    // V44: 실제 허브식 릴리프 — 구역별 고도차(수작업 좌표)
    top += Math.round(bump(x, z, 146, 140, 42, 5));     // 숲 구릉(완만한 언덕 숲)
    top += Math.round(bump(x, z, 84, 282, 34, 5));      // 폐허 플래토(솟은 대지)
    top += Math.round(bump(x, z, 318, 122, 30, 7));     // 마법사 탑 언덕
    top -= Math.round(bump(x, z, 158, 316, 24, 2));     // 묘지 분지(가라앉은 골짜기)
    top += Math.round(bump(x, z, 296, 168, 20, 4));     // 야생 언덕 A(농장-마법사 사이)
    top += Math.round(bump(x, z, 128, 242, 16, 4));     // 야생 언덕 B(광산-폐허 사이)
    top += Math.round(bump(x, z, 262, 322, 18, 4));     // 야생 언덕 C(연못-아레나 사이)
    top += Math.round(bump(x, z, 352, 268, 16, 5));     // 야생 언덕 D(농장 남동)
    top += Math.round(bump(x, z, 150, 96, 14, 3));      // 캐슬 대지(성 아래 기단 언덕)
    // 완만한 구릉 — 마을(중심 70칸)은 평탄 유지, 외곽만 굴곡. V44: 진폭 2.2→3.6(실제 야생 굴곡)
    const dc = Math.hypot(x - HUB_C, z - HUB_C);
    const amp = 3.6 * Math.max(0, Math.min(1, (dc - 70) / 150));
    top += Math.round((smoothNoise(x, z, 34) - 0.5) * 2 * amp);
    if (f < 0.16) top -= Math.round((0.16 - Math.max(0, f)) * 24);   // V44: 해안 사면 — 대륙 가장자리로 3~4칸 내려가는 벼랑/해변 느낌
    // V54: 마을 둘레 강(현행 허브 0.23+ 탑뷰) — 노이즈 링 채널로 지형을 물높이 아래로 깎음
    const rDist = Math.hypot(x - HUB_C, z - HUB_C);
    const rRing = 62 + (smoothNoise(x + 71, z + 23, 44) - 0.5) * 12;
    const rBand = Math.abs(rDist - rRing);
    if (rBand < 3.2) top = Math.min(top, 16);                          // 강바닥
    else if (rBand < 4.6) top = Math.min(top, 18);                     // 강둑 경사
    return { y: Math.min(H - 6, top), f };
  }
  function zoneAt(x, z) {
    if (hubField(x, z) <= 0) return '';
    let best = null, bestD = 1e9;
    for (const zn of HUB_ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r && d < bestD) { bestD = d; best = zn; } }
    return best ? best.key : 'wild';
  }
  function hubZoneName(key) { const zn = HUB_ZONES.find(z => z.key === key); return zn ? zn.name : '🌿 야생 지대'; }

  /* ───────────── 실제 하이픽셀 스카이블럭 허브 맵 임포트 (economy-maps/hub_map.bin) ─────────────
     실제 The Hub 월드(.mca)를 블럭 하나하나 그대로 반영. 서버 배포용으로 gzip 압축(~0.8MB, 32MB 제한 무관).
     포맷: 'HMAP' + ver u8 + W,H,D u16 + ox,oy,oz i16(=원본 MC 최소 좌표) + palCount u16 +
           palette[(u8 len+utf8)…] + gzLen u32 + gzip(Uint16 LE grid, idx=(y*D+z)*W+x). */
  let HUB_MAP = null, _hubMapPromise = null;
  const HUB_MC_SPAWN = { x: -2.485, y: 70, z: -68.62 };   // level.dat 실제 스폰 좌표
  function loadHubMap() {
    if (HUB_MAP) return Promise.resolve(HUB_MAP);
    if (_hubMapPromise) return _hubMapPromise;
    _hubMapPromise = (async () => {
      try {
        if (typeof fetch !== 'function' || typeof DecompressionStream === 'undefined') return null;
        const resp = await fetch('economy-maps/hub_map.bin', { cache: 'force-cache' });
        if (!resp.ok) return null;
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'HMAP') return null;
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        let p = 5;                       // magic(4)+ver(1)
        const mW = dv.getUint16(p, true); p += 2; const mH = dv.getUint16(p, true); p += 2; const mD = dv.getUint16(p, true); p += 2;
        const ox = dv.getInt16(p, true); p += 2; const oy = dv.getInt16(p, true); p += 2; const oz = dv.getInt16(p, true); p += 2;
        const palCount = dv.getUint16(p, true); p += 2;
        const dec = new TextDecoder(); const palette = [];
        for (let i = 0; i < palCount; i++) { const len = buf[p++]; palette.push(dec.decode(buf.subarray(p, p + len))); p += len; }
        const gzLen = dv.getUint32(p, true); p += 4;
        const gz = buf.subarray(p, p + gzLen);
        const stream = new Response(gz).body.pipeThrough(new DecompressionStream('gzip'));
        const ab = await new Response(stream).arrayBuffer();
        const grid = new Uint16Array(ab);
        if (grid.length !== mW * mH * mD) { console.error('hub map size mismatch', grid.length, mW * mH * mD); return null; }
        HUB_MAP = { W: mW, H: mH, D: mD, ox, oy, oz, palette, grid };
        return HUB_MAP;
      } catch (e) { console.error('hub map load fail', e); return null; }
    })();
    return _hubMapPromise;
  }
  // V94: 실제 스블 맵 팔레트(바닐라 단수형 키) → 내부 블럭 키 별칭 — 임포트 시 무손실 매핑(슬랩/계단/버섯/퍼퍼)
  const MAP_PAL_ALIAS = {
    red_mushroom_block: 'mushroom_red_block', brown_mushroom_block: 'mushroom_brown_block', purpur_block: 'purpur',
    crimson_slab: 'crimson_planks_slab', warped_slab: 'warped_planks_slab',
    crimson_stairs: 'crimson_planks_stairs_0', warped_stairs: 'warped_planks_stairs_0',
    nether_brick_slab: 'nether_bricks_slab', nether_brick_stairs: 'nether_bricks_stairs_0',
    red_nether_brick_slab: 'red_nether_bricks_slab', red_nether_brick_stairs: 'red_nether_bricks_stairs_0',
    end_stone_brick_slab: 'end_stone_bricks_slab', end_stone_brick_stairs: 'end_stone_bricks_stairs_0',
    polished_blackstone_brick_slab: 'polished_blackstone_bricks_slab', polished_blackstone_brick_stairs: 'polished_blackstone_bricks_stairs_0',
  };
  function genWorldFromMap(M) {
    W = M.W; H = M.H; Dp = M.D;
    world = new Uint16Array(W * H * Dp);
    const remap = new Int32Array(M.palette.length);
    for (let i = 0; i < M.palette.length; i++) { let k = M.palette[i]; if (MAP_PAL_ALIAS[k]) k = MAP_PAL_ALIAS[k]; remap[i] = (k === 'air') ? 0 : (ID[k] != null ? ID[k] : ID.stone); }
    const g = M.grid, n = g.length;
    for (let i = 0; i < n; i++) { const pi = g[i]; if (pi) world[i] = remap[pi]; }
    applyHubRealAnchors();   // 게임플레이 레이어(구역/NPC/워프)를 실제 마을에 정렬
    buildWarpPads();         // 실제 맵엔 절차 워프링이 없으므로 패드만 배치
  }
  /* 범용 섬 맵 로더 — economy-maps/map_<key>.bin 이 있으면 그 섬을 실제 맵으로 로드(없으면 절차 생성 폴백).
     맵 파일(.bin)은 리소스팩 텍스처처럼 사용자가 직접 넣는다(에이전트가 커밋하지 않음). 포맷은 HMAP 동일. */
  const ISLAND_MAP_FILES = { gold: 'map_gold.bin', deep: 'map_deep.bin', spider: 'map_spider.bin', end: 'map_end.bin', park: 'map_park.bin', barn: 'map_farming.bin', nether: 'map_crimson.bin', mushroom: 'map_mushroom.bin' };
  const ISLAND_MAPS = {}, _islandMapPromises = {};
  async function _parseMapFile(file) {
    if (typeof fetch !== 'function' || typeof DecompressionStream === 'undefined') return null;
    const resp = await fetch('economy-maps/' + file, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'HMAP') return null;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let p = 5;
    const mW = dv.getUint16(p, true); p += 2; const mH = dv.getUint16(p, true); p += 2; const mD = dv.getUint16(p, true); p += 2;
    const ox = dv.getInt16(p, true); p += 2; const oy = dv.getInt16(p, true); p += 2; const oz = dv.getInt16(p, true); p += 2;
    const palCount = dv.getUint16(p, true); p += 2;
    const dec = new TextDecoder(); const palette = [];
    for (let i = 0; i < palCount; i++) { const len = buf[p++]; palette.push(dec.decode(buf.subarray(p, p + len))); p += len; }
    const gzLen = dv.getUint32(p, true); p += 4;
    const gz = buf.subarray(p, p + gzLen);
    const stream = new Response(gz).body.pipeThrough(new DecompressionStream('gzip'));
    const ab = await new Response(stream).arrayBuffer();
    const grid = new Uint16Array(ab);
    if (grid.length !== mW * mH * mD) return null;
    return { W: mW, H: mH, D: mD, ox, oy, oz, palette, grid };
  }
  function loadIslandMap(key) {
    if (ISLAND_MAPS[key]) return Promise.resolve(ISLAND_MAPS[key]);
    const file = ISLAND_MAP_FILES[key]; if (!file) return Promise.resolve(null);
    if (_islandMapPromises[key]) return _islandMapPromises[key];
    _islandMapPromises[key] = (async () => { try { const m = await _parseMapFile(file); if (m) ISLAND_MAPS[key] = m; return m; } catch (e) { console.error('island map ' + key, e); return null; } })();
    return _islandMapPromises[key];
  }
  let _mapWorldActive = false;   // V94: 현재 월드가 실제 섬 맵 파일로 로드됐는지(리스폰/스폰 좌표 분기용)
  function genIslandFromMap(M) {
    const cells = M.W * M.H * M.D;
    if (!cells || cells > 60e6) { console.warn('경제: 섬 맵이 너무 큽니다(' + cells + ' 셀) — 절차 생성으로 폴백'); return false; }   // V94: OOM 방지(≈120MB Uint16 상한) — 초대형 맵(크림슨)은 절차 생성 유지
    W = M.W; H = M.H; Dp = M.D;
    world = new Uint16Array(W * H * Dp);
    const remap = new Int32Array(M.palette.length);
    for (let i = 0; i < M.palette.length; i++) { let k = M.palette[i]; if (MAP_PAL_ALIAS[k]) k = MAP_PAL_ALIAS[k]; remap[i] = (k === 'air') ? 0 : (ID[k] != null ? ID[k] : ID.stone); }
    const g = M.grid; for (let i = 0; i < g.length; i++) { const pi = g[i]; if (pi) world[i] = remap[pi]; }
    return true;
  }
  // 실제 허브 맵의 마을 광장(스폰) 기준으로 구역 라벨·NPC·워프 패드를 재배치
  let _hubAnchored = false;
  function applyHubRealAnchors() {
    if (!HUB_MAP) return;
    const S = { x: Math.round(HUB_MC_SPAWN.x - HUB_MAP.ox), z: Math.round(HUB_MC_SPAWN.z - HUB_MAP.oz) };
    if (!_hubAnchored) {
      _hubAnchored = true;
      // 실제 허브 = 중앙 마을 광장 + 외곽 야생(산/길). 광장만 명시, 나머지는 자연히 '야생'.
      HUB_ZONES.length = 0;
      HUB_ZONES.push({ key: 'village', name: '🏘️ 마을 광장', x: S.x, z: S.z, r: 82 });
      // 워프 패드: 맵 안쪽 링(대칭 회피용 목적지별 반경 지터), 경계 클램프
      const cx = Math.round(W / 2), cz = Math.round(Dp / 2), wl = WARPS.hub;
      for (let i = 0; i < wl.length; i++) {
        const ang = (i / wl.length) * Math.PI * 2 + 0.3, rr = 150 + (i % 3) * 22;
        wl[i].x = Math.max(6, Math.min(W - 7, Math.round(cx + Math.cos(ang) * rr)));
        wl[i].z = Math.max(6, Math.min(Dp - 7, Math.round(cz + Math.sin(ang) * rr)));
      }
    }
    placeHubNpcs(S.x, S.z);
  }
  function placeHubNpcs(cx, cz) {
    const spots = [], used = [];
    const bad = new Set([ID.water, ID.lava, ID.oak_leaves, ID.spruce_leaves, ID.dark_oak_leaves, ID.jungle_leaves, ID.acacia_leaves].filter(v => v != null));
    for (let r = 3; r <= 46 && spots.length < NPCS.length; r++) {
      for (let a = 0; a < 360 && spots.length < NPCS.length; a += 5) {
        const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r), z = Math.round(cz + Math.sin(a * Math.PI / 180) * r);
        if (x < 2 || z < 2 || x >= W - 2 || z >= Dp - 2) continue;
        const t = surfaceTop(x, z), below = getBlockLocal(x, t - 1, z), bb = BLOCKS[below];
        if (!bb || !bb.solid || !bb.opaque || bad.has(below)) continue;
        if (getBlockLocal(x, t, z) !== 0 || getBlockLocal(x, t + 1, z) !== 0) continue;
        if (used.some(u => Math.abs(u.x - x) < 4 && Math.abs(u.z - z) < 4)) continue;
        spots.push({ x, z }); used.push({ x, z });
      }
    }
    for (let i = 0; i < NPCS.length; i++) { const s = spots[i % (spots.length || 1)]; if (s) { NPCS[i].x = s.x; NPCS[i].z = s.z; } }
  }
  function genWorld() {
    if (HUB_MAP) { genWorldFromMap(HUB_MAP); return; }
    world = new Uint16Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const { y: top, f } = columnSurface(x, z);
      if (!f || f <= 0) continue;
      // 하늘섬: 위는 평탄, 아래는 가장자리로 갈수록 얇아지는 부유 대륙
      const depth = 6 + Math.round(Math.min(1, f * 2.2) * 22);
      const zn = zoneAt(x, z);
      for (let y = top; y >= Math.max(2, top - depth); y--) {
        let id = ID.stone;
        if (y === top) {
          // V65: 실사(Mountain.png) — 회색 크래그 산 + 정상부만 만년설 캡 + 이끼 낀 바위 선반
          if (top >= 46) id = ID.snow_block;                                        // 만년설 캡(정상부)
          else if (top >= 36) { const ch = hash3(x, 36, z); id = ch < 0.10 ? ID.snow_block : ch < 0.42 ? ID.stone : ch < 0.72 ? (ID.polished_andesite != null ? ID.polished_andesite : ID.stone) : ch < 0.86 ? ID.cobblestone : ID.quartz_block; }   // 회색 크래그(흰 줄무늬)
          else if (top >= 30) { const ch = hash3(x, 36, z); id = ch < 0.38 ? ID.stone : ch < 0.62 ? ID.grass : ch < 0.85 ? (ID.polished_andesite != null ? ID.polished_andesite : ID.stone) : ID.mossy_cobblestone; }   // 이끼 선반 기슭
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
      // V54: 강 채널에 물 채우기(수면 y18) + 강둑 모래/자갈
      {
        const rDist = Math.hypot(x - HUB_C, z - HUB_C);
        const rRing = 62 + (smoothNoise(x + 71, z + 23, 44) - 0.5) * 12;
        const rBand = Math.abs(rDist - rRing);
        if (rBand < 3.2 && top <= 16) { setW(x, 17, z, ID.water); setW(x, 18, z, ID.water); setW(x, 16, z, hash3(x, 701, z) < 0.4 ? ID.gravel : ID.sand); }
        else if (rBand < 5.4 && top <= 20) { const g = getBlockLocal(x, top, z); if (g === ID.grass || g === ID.dirt) setW(x, top, z, hash3(x, 702, z) < 0.55 ? ID.sand : ID.gravel); }
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
    colosseumOvergrowth();   // V66: 실사(Colosseum.png, 0.23 폐허화) — 이끼/균열 풍화 + 덩굴 + 둘레 가문비 + 무너진 아치
    buildWizardTower();
    buildRuinsZone();
    buildZigguratV6();
    buildShrineV6();
    // 광장 → 각 구역 대로(자갈길)
    [[224, 92], [110, 208], [156, 314], [326, 224], [146, 136], [318, 318], [224, 348], [318, 124], [294, 372]].forEach(t => pathTo(224, 224, t[0], t[1]));
    buildRiverBridges();   // V54: 대로가 강을 건너는 지점의 목조 다리 9기(난간/교각/등불)
    // V24-C(건축 #4): 반경 150 순환로 — 외곽 존들을 잇는 자갈/조약돌 링(잔디/흙 위만 포장)
    for (let a = 0; a < 900; a++) {
      const ang = a / 900 * Math.PI * 2;
      for (let w = -1; w <= 1; w++) {
        const x = Math.round(224 + Math.cos(ang) * (150 + w)), z = Math.round(224 + Math.sin(ang) * (150 + w));
        const t = surfaceTop(x, z), gb = getBlockLocal(x, t - 1, z);
        if (gb === ID.grass || gb === ID.dirt || gb === ID.coarse_dirt) setW(x, t - 1, z, (x + z) % 5 ? ID.gravel : ID.cobblestone);
      }
    }
    decorateWilds();
    buildWildPOIs();     // V33-B: 야생 벨트 소형 POI 18곳(우물/건초 수레/폐허 아치/사당/벤치/모닥불) — 꽉 찬 밀도
    buildPlazaFinish();  // V33-C: 광장 건물 외관 완성(굴뚝/창가 화단/문앞 등불/궤짝 더미)
    buildPlazaGates();   // V33-D: 4방향 대문 아치
    // V28-C: 순환로 가로등(약 40블럭 간격) + 길가 생울타리 — 존 사이 개활지에 리듬감
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2;
      const x = Math.round(224 + Math.cos(ang) * 154), z = Math.round(224 + Math.sin(ang) * 154);
      const t = surfaceTop(x, z);
      if (getBlockLocal(x, t - 1, z) === ID.grass || getBlockLocal(x, t - 1, z) === ID.dirt) lampPost(x, z);
      if (a % 3 === 0) { const hx = Math.round(224 + Math.cos(ang + 0.06) * 158), hz = Math.round(224 + Math.sin(ang + 0.06) * 158); const ht = surfaceTop(hx, hz); if (getBlockLocal(hx, ht - 1, hz) === ID.grass) for (let i = 0; i < 4; i++) setW(hx + i, surfaceTop(hx + i, hz), hz, ID.oak_leaves); }
    }
    buildWilderness();
    buildHubCastle();    // V44: 허브 캐슬(실제 허브 북서) — 성벽/4탑/알현실/총안
    buildDockPier();     // V44: 연못 → 실제 부두(잔교/계류 보트/어부 오두막)
    buildMineQuarry();   // V45: 광산 남사면 계단식 노천 채석장(테라스/갱목/광석 노출/수레길)
    buildWizardInterior();   // V47: 마법사 탑 내부(나선계단/1층 서재/꼭대기 마법진)
    buildArenaUnderground(); // V47: 콜로세움 지하 검투사 대기실 2실+터널
    buildCryptOssuary();     // V47: 묘지 지하 납골당(계단/벽감/관)
    buildGranary();          // V47: 농장 곡물창고(2층 헛간+건초 로프트)
    buildRuinWalls();    // V45: 폐허 무너진 성벽 라인 + 쓰러진 기둥 + 잔해 더미
    buildSnowTrail();    // V45: 설산 지그재그 등반로 + 정상 전망대
    buildInn();          // V45: 마을 여관(2층 — 객실/간판/발코니)
    buildHubRealign();   // V25-A: 딥서치(위키 좌표) 기반 실제 허브 정합 — 터번/플라워하우스/커뮤니티센터/시리우스 오두막/침몰 크립트   // V24: 허허벌판 채우기 — 풍차/코티지/과수원/정자/캠프/목장(손 배치)
    buildHubPortal();
    buildWarpPads();
    beautifyHub();   // V20-L: 광장 미화(분수·정원·벤치·현수막) — 마지막에 얹어 덮이지 않게
    buildHubInteriors();   // V21-D5: 명명 건물 인테리어(은행 창구/도서관/경매 전시대/게시판) — 대로·미화 이후 최후 배치(덮어쓰기 방지)
    rebuildCommunityCenter();  // V55: 실사(Community_Center.png) 재건축 — 벽돌+크림 프레임+시계탑+3연아치
    rebuildFlowerHouse();      // V55: 실사(Flower_House.png) 재건축 — 조약돌+다크오크 프레임+구리 지붕+꽃밭
    buildShopInteriors();  // V51: 소형 상점 인테리어(잡화점/펫 상점/플라워 하우스/커뮤니티 센터) — 공기 칸만 채움
    leafTrimPass();        // V53: 마을 벽면 잎/덩굴 트림(실제 바자 골목 질감)
    boulderPass();         // V53: 야생 대형 바위 군집 10곳(실제 탑뷰 대조)
    agingPass(70, 260, 110, 300, 0.5);    // V22-G2: 폐허 구역 — 석재 벽돌 절반을 이끼/금 간 변형으로(고대 유적 질감)
    agingPass(126, 296, 176, 336, 0.28);  // V22-G2: 묘지 구역 — 은은한 노후화
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
      // V28-C: 나무는 '숲 군락(grove)'에만 — 아무 데나 심던 균일 산포 폐기(실제 스블 허브처럼 개활지와 숲이 구분)
      const grove = smoothNoise(x + 137, z + 59, 17) > 0.60;   // V44: 숲 군락 확대(밀도 증가)
      // 밭 보호: 주변 3칸에 작물/사탕수수/경작지가 있으면 나무·덤불 금지(사탕수수밭 자작나무 버그)
      const nearCrop = () => {
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
          const b = getBlockLocal(x + dx, surfaceTop(x + dx, z + dz) - 0, z + dz), g2 = getBlockLocal(x + dx, surfaceTop(x + dx, z + dz) - 1, z + dz);
          if (b === ID.sugar_cane || b === ID.wheat_ripe || g2 === ID.farmland) return true;
        }
        return false;
      };
      // V83: 실제 허브 대조 — 파밍 나무는 '숲' 구역과 파크섬에만 존재. 허브 야생 전역 나무/통나무 심기 폐기.
      if (r < 0.38) setW(x, y, z, ID.tall_grass);                                                    // V44: 풍성한 잔디 밀도 상향
      else if (r < 0.52) setW(x, y, z, field < 0.34 ? ID.flower_yellow : field < 0.68 ? ID.flower_red : ID.tall_grass);   // V44: 색 군집 꽃밭 확대
      else if (r < 0.425) { setW(x, y, z, ID.mossy_cobblestone); if (r < 0.4215) { setW(x, y + 1, z, ID.mossy_cobblestone); setW(x + 1, y, z, ID.cobblestone); } }  // 바위 군집
    }
  }




  // V49: 네더 요새 다리 — 섬 가장자리에서 용암 바다 위로 뻗는 네더 벽돌 다리(교각/크레넬/종단 보물 플랫폼) + 성문 탑
  function buildNetherBridges() {
    const bridge = (x0, z0, dx, dz, len) => {
      for (let i = 0; i < len; i++) {
        const x = x0 + dx * i, z = z0 + dz * i;
        for (let o = -1; o <= 1; o++) {
          const px = dx !== 0 ? x : x + o, pz = dx !== 0 ? z + o : z;
          setW(px, 20, pz, ID.nether_bricks);                                 // 상판
          if (Math.abs(o) === 1 && i % 2 === 0) setW(px, 21, pz, ID.nether_bricks);   // 크레넬 난간
        }
        if (i % 6 === 3) for (let y = 3; y < 20; y++) { setW(x, y, z, ID.nether_bricks); }   // 용암까지 내려가는 교각
        if (i % 9 === 4) setW(x, 22, z, ID.glowstone);                        // 다리 등불
      }
      // 종단 보물 플랫폼(5×5) + 금광석 더미 + 발광
      const ex = x0 + dx * len, ez = z0 + dz * len;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        setW(ex + (dx !== 0 ? a : a), 20, ez + (dz !== 0 ? b : b), ID.nether_bricks);
        if (Math.abs(a) === 2 && Math.abs(b) === 2) { setW(ex + a, 21, ez + b, ID.nether_bricks); setW(ex + a, 22, ez + b, ID.glowstone); }
      }
      setW(ex, 21, ez, ID.gold_ore); setW(ex + (dx ? -1 : 1), 21, ez, ID.gold_ore); setW(ex, 22, ez, ID.gold_ore);
      // 성문 탑(다리 시작점): 좌우 기둥 + 아치
      for (let y = 20; y <= 26; y++) {
        setW(x0 + (dx !== 0 ? 0 : -2), y, z0 + (dz !== 0 ? 0 : -2) + (dx !== 0 ? -2 : 0) * 0, ID.nether_bricks);
      }
      const gx1 = dx !== 0 ? x0 : x0 - 2, gz1 = dx !== 0 ? z0 - 2 : z0;
      const gx2 = dx !== 0 ? x0 : x0 + 2, gz2 = dx !== 0 ? z0 + 2 : z0;
      for (let y = 20; y <= 26; y++) { setW(gx1, y, gz1, ID.nether_bricks); setW(gx2, y, gz2, ID.nether_bricks); }
      for (let o = -2; o <= 2; o++) setW(dx !== 0 ? x0 : x0 + o, 26, dz !== 0 ? z0 + 0 : z0, ID.nether_bricks);
      setW(gx1, 27, gz1, ID.glowstone); setW(gx2, 27, gz2, ID.glowstone);
    };
    bridge(104, 64, 1, 0, 18);   // 동쪽 다리(요새 외곽 회랑 동단에서 바다로)
    bridge(64, 104, 0, 1, 18);   // 남쪽 다리
  }

  // V48: 버섯 사막 — 거대 버섯 6기(균사체 서편) + 사막 정착지(사암 오두막 2/우물 — 중급 농부 퀘스트 무대)
  function buildGiantMushrooms() {
    const shroom = (x, z, red, h) => {
      const y0 = surfaceTop(x, z);
      if (y0 < 8) return;
      for (let y = 0; y < h; y++) setW(x, y0 + y, z, ID.quartz_block);   // 하얀 줄기
      const cap = red ? (ID.wool_red != null ? ID.wool_red : ID.mushroom_red) : (ID.coarse_dirt != null ? ID.coarse_dirt : ID.dirt);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;   // 모서리 둥글림
        setW(x + dx, y0 + h, z + dz, cap);
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) setW(x + dx, y0 + h + 1, z + dz, cap);
      }
      if (red) { setW(x, y0 + h + 2, z, ID.wool_white); setW(x + 1, y0 + h + 1, z + 1, ID.wool_white); setW(x - 1, y0 + h + 1, z - 1, ID.wool_white); }   // 빨간 갓 흰 반점
    };
    shroom(48, 52, true, 5); shroom(38, 66, false, 4); shroom(54, 80, true, 6);
    shroom(30, 78, false, 3); shroom(44, 92, true, 4); shroom(58, 40, false, 5);
    // 사막 정착지(등산객 72,100 인근): 사암 오두막 2 + 우물 + 횃불
    const hut = (hx, hz) => {
      const hy = surfaceTop(hx, hz);
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) {
        for (let y = 0; y < 3; y++) { const edge = dx === 0 || dx === 4 || dz === 0 || dz === 3; if (edge && !(dz === 0 && dx === 2 && y < 2)) setW(hx + dx, hy + y, hz + dz, ID.sandstone); }
        setW(hx + dx, hy + 3, hz + dz, ID.smooth_sandstone != null ? ID.smooth_sandstone : ID.sandstone);
      }
      setW(hx + 2, hy + 2, hz + 2, ID.glowstone);
    };
    hut(78, 96); hut(86, 102);
    const wy = surfaceTop(82, 108);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(82 + dx, wy, 108 + dz, (dx || dz) ? ID.sandstone : ID.water);   // 우물
    setW(82, wy + 1, 107, ID.oak_fence); setW(82, wy + 2, 107, ID.glowstone);
  }
  // V48: 딥 캐번 — 자수정 정동 포켓 2곳: 조약돌 껍질 → 퍼퍼 수정층 → 발광 코어(수정 동굴)
  function buildGeodePockets() {
    const geode = (cx, cy, cz, r) => {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.hypot(dx, dy, dz);
        if (d > r) continue;
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (d > r - 1.2) setW(x, y, z, ID.smooth_stone);           // 껍질
        else if (d > r - 2.4) setW(x, y, z, ID.purpur);            // 수정층
        else setW(x, y, z, 0);                                     // 공동
      }
      setW(cx, cy - Math.floor(r) + 2, cz, ID.glowstone);          // 코어 발광
      setW(cx + 1, cy, cz, ID.purpur); setW(cx - 1, cy - 1, cz + 1, ID.purpur);   // 내부 수정 돌기
      setW(cx, cy + Math.floor(r) - 2, cz, ID.glowstone);
      // 입구 틈(동쪽으로 1×2 뚫음)
      for (let i = 0; i <= Math.ceil(r); i++) { setW(cx + i, cy - 1, cz, 0); setW(cx + i, cy, cz, 0); }
    };
    geode(28, 26, 30, 4); geode(66, 14, 70, 5);
  }
  // V48: 골드 광산 — 갱도 앞 광차 2기(판자 몸통+울타리 바퀴+적재 광석) + 선광 작업장(체/자갈 더미)
  function buildMineCarts() {
    const cart = (x, z, ore) => {
      const y = surfaceTop(x, z);
      setW(x, y, z, ID.oak_fence); setW(x + 2, y, z, ID.oak_fence);            // 바퀴
      for (let dx = 0; dx <= 2; dx++) { setW(x + dx, y + 1, z, ID.oak_planks); }
      setW(x + 1, y + 2, z, ore);                                              // 적재 광석
    };
    cart(52, 76, ID.gold_ore); cart(60, 78, ID.coal_ore);
    // 선광 작업장: 자갈 더미 + 체(울타리 프레임 + 판자)
    const sy = surfaceTop(64, 74);
    setW(64, sy, 74, ID.gravel); setW(65, sy, 74, ID.gravel); setW(64, sy + 1, 74, ID.gravel);
    setW(67, sy, 74, ID.oak_fence); setW(69, sy, 74, ID.oak_fence);
    setW(67, sy + 1, 74, ID.oak_planks); setW(68, sy + 1, 74, ID.oak_planks); setW(69, sy + 1, 74, ID.oak_planks);
    setW(68, sy + 2, 74, ID.glowstone);
  }

  // V47: 마법사 탑 내부 — 내벽 나선계단 발판(y+2 간격), 1층 서재(책장 벽감+독서대), 꼭대기 마법진(발광 링)
  function buildWizardInterior() {
    const cx = 322, cz = 120, base = surfaceTop(cx, cz), R = 4, Ht = 22;
    // 나선계단: 내벽(반경 R-1) 따라 상승 발판 — 한 바퀴에 8칸 상승
    for (let step = 0; step < 64; step++) {
      const th = step * (Math.PI / 8), y = base + Math.floor(step / 2);
      if (y >= base + Ht - 6) break;
      const x = cx + Math.round(Math.cos(th) * (R - 1)), z = cz + Math.round(Math.sin(th) * (R - 1));
      setW(x, y, z, ID.chiseled_stone_bricks);
      if (step % 8 === 0) setW(x, y + 2, z, ID.glowstone);   // 층계 조명
    }
    // 1층 서재: 벽감 책장(퍼퍼+참나무 판자 교차) + 중앙 독서대 + 융단
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2]]) {
      setW(cx + ox, base, cz + oz, ID.oak_planks); setW(cx + ox, base + 1, cz + oz, ID.purpur); setW(cx + ox, base + 2, cz + oz, ID.oak_planks);
    }
    setW(cx, base, cz, ID.purpur); setW(cx, base + 1, cz, ID.oak_planks);   // 독서대
    for (let dx = -1; dx <= 1; dx++) setW(cx + dx, base - 1, cz + 1, ID.wool_magenta != null ? ID.wool_magenta : ID.purpur);   // 융단
    // 꼭대기 마법진: 상층 마루 + 발광 링 + 중앙 수정
    const ty = base + Ht - 5;
    for (let dx = -R + 1; dx <= R - 1; dx++) for (let dz = -R + 1; dz <= R - 1; dz++) if (dx * dx + dz * dz <= (R - 1) * (R - 1)) setW(cx + dx, ty, cz + dz, ID.polished_andesite);
    for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]) setW(cx + ox, ty + 1, cz + oz, ID.glowstone);
    setW(cx, ty + 1, cz, ID.purpur); setW(cx, ty + 2, cz, ID.glowstone);
  }
  // V47: 콜로세움 지하 — 경기장 밑 검투사 대기실 2실(동/서) + 경기장으로 오르는 터널 계단
  function buildArenaUnderground() {
    const cx = 224, cz = 352, cy = surfaceTop(cx, cz) - 1;
    const room = (rx) => {
      for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 1; dy <= 3; dy++) setW(rx + dx, cy - 5 + dy, cz + dz, 0);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) { setW(rx + dx, cy - 5, cz + dz, ID.smooth_stone); setW(rx + dx, cy - 1, cz + dz, ID.smooth_stone); }
      for (let dx = -3; dx <= 3; dx += 2) { setW(rx + dx, cy - 4, cz - 2, ID.oak_fence); }   // 무기 거치대(울타리)
      setW(rx, cy - 4, cz + 2, ID.oak_planks); setW(rx - 1, cy - 4, cz + 2, ID.oak_planks);  // 벤치
      setW(rx, cy - 2, cz, ID.glowstone);
    };
    room(cx - 15); room(cx + 15);
    // 대기실 → 경기장 터널(계단 상승, 모래 바닥으로 개구)
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const x = cx + dir * (12 - i), y = cy - 4 + Math.floor(i / 2);
        for (let dy = 0; dy <= 2; dy++) setW(x, y + dy, cz, 0);
        setW(x, y - 1, cz, ID.smooth_stone);
      }
    }
  }
  // V47: 묘지 납골당 — 예배당 폐허 옆 지하: 하강 계단 + 복도 + 벽감 유골(석영/뼈 느낌) + 석관 2기
  function buildCryptOssuary() {
    const ex = 136, ez = 300, ey = surfaceTop(ex, ez);
    for (let i = 0; i < 6; i++) {   // 하강 계단(남향)
      const y = ey - 1 - i;
      for (let dx = -1; dx <= 1; dx++) { for (let dy = 0; dy <= 2; dy++) setW(ex + dx, y + dy, ez + i, 0); setW(ex + dx, y - 1, ez + i, ID.stone_bricks); }
    }
    const fy = ey - 7, fz = ez + 6;   // 복도 바닥 높이/시작
    for (let dz = 0; dz < 12; dz++) for (let dx = -2; dx <= 2; dx++) {
      for (let dy = 1; dy <= 3; dy++) setW(ex + dx, fy + dy, fz + dz, 0);
      setW(ex + dx, fy, fz + dz, dz % 3 === 0 ? ID.mossy_stone_bricks : ID.stone_bricks);
      setW(ex + dx, fy + 4, fz + dz, ID.stone_bricks);
      if (Math.abs(dx) === 2) {   // 벽 + 벽감(유골: 석영 블럭)
        setW(ex + dx, fy + 1, fz + dz, dz % 2 === 0 ? ID.quartz_block : ID.stone_bricks);
        setW(ex + dx, fy + 2, fz + dz, ID.stone_bricks);
        setW(ex + dx, fy + 3, fz + dz, dz % 4 === 1 ? ID.quartz_block : ID.stone_bricks);
      }
      if (dz % 5 === 2) setW(ex, fy + 3, fz + dz, ID.glowstone);   // 천장 등불
    }
    // 석관 2기(복도 끝 방)
    for (let dx = -3; dx <= 3; dx++) for (let dz = 0; dz <= 5; dz++) {
      for (let dy = 1; dy <= 3; dy++) setW(ex + dx, fy + dy, fz + 12 + dz, 0);
      setW(ex + dx, fy, fz + 12 + dz, ID.stone_bricks); setW(ex + dx, fy + 4, fz + 12 + dz, ID.stone_bricks);
      if (Math.abs(dx) === 3 || dz === 5) for (let dy = 1; dy <= 3; dy++) setW(ex + dx, fy + dy, fz + 12 + dz, dz === 5 && dx === 0 && dy < 3 ? 0 : ID.mossy_stone_bricks);
    }
    for (const ox of [-2, 2]) { setW(ex + ox, fy + 1, fz + 14, ID.quartz_block); setW(ex + ox, fy + 1, fz + 15, ID.quartz_block); }   // 석관
    setW(ex, fy + 3, fz + 14, ID.glowstone);
  }
  // V47: 농장 곡물창고 — 붉은 2층 헛간(박공) + 건초 로프트 + 마당 건초 롤
  function buildGranary() {
    const X = 344, Z = 232, Wd = 8, Dd = 6;
    const base = surfaceTop(X + 4, Z + 3);
    for (let dx = -1; dx <= Wd; dx++) for (let dz = -1; dz <= Dd; dz++) for (let y = base; y <= base + 10; y++) setW(X + dx, y, Z + dz, 0);
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X + dx, base - 1, Z + dz, ID.oak_planks);
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) {
      const edge = dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1;
      if (!edge) continue;
      for (let y = base; y <= base + 4; y++) {
        const corner = (dx === 0 || dx === Wd - 1) && (dz === 0 || dz === Dd - 1);
        setW(X + dx, y, Z + dz, corner ? ID.spruce_log : ID.wool_red);
      }
    }
    // 큰 정면 문(2×3) + 로프트 창
    for (let dx = 3; dx <= 4; dx++) for (let y = base; y <= base + 2; y++) setW(X + dx, y, Z, 0);
    setW(X + 3, base + 4, Z, ID.glass); setW(X + 4, base + 4, Z, ID.glass);
    // 박공 지붕(가문비)
    for (let step = 0; step <= 3; step++) for (let dz = -1 + step; dz <= Dd - step; dz++) for (const dx of [-1 + step, Wd - step]) setW(X + dx, base + 5 + step, Z + dz, ID.spruce_planks);
    for (let dx = 2; dx < Wd - 2; dx++) for (let dz = 1; dz < Dd - 1; dz++) setW(X + dx, base + 8, Z + dz, ID.spruce_planks);
    // 로프트 건초 + 내부 건초 더미
    for (let dx = 1; dx < Wd - 1; dx++) for (let dz = 1; dz < Dd - 1; dz++) if ((dx + dz) % 2 === 0) setW(X + dx, base + 3, Z + dz, ID.hay_block);
    setW(X + 1, base, Z + Dd - 2, ID.hay_block); setW(X + 2, base, Z + Dd - 2, ID.hay_block); setW(X + 1, base + 1, Z + Dd - 2, ID.hay_block);
    setW(X + 2, base + 1, Z + 2, ID.glowstone);
    // 마당 건초 롤 2개
    for (const [hx, hz] of [[X - 4, Z + 2], [X + Wd + 3, Z + 4]]) { const t = surfaceTop(hx, hz); setW(hx, t, hz, ID.hay_block); setW(hx + 1, t, hz, ID.hay_block); setW(hx, t + 1, hz, ID.hay_block); }
  }




  // V54: 강 다리 — 각 대로 방향으로 강 링(r≈62)을 건너는 3폭 목조 다리(판자 상판/울타리 난간/교각/등불)
  function buildRiverBridges() {
    const targets = [[224, 92], [110, 208], [156, 314], [326, 224], [146, 136], [318, 318], [224, 348], [318, 124], [294, 372]];
    for (const [tx, tz] of targets) {
      const ang = Math.atan2(tz - HUB_C, tx - HUB_C);
      const ux = Math.cos(ang), uz = Math.sin(ang);
      for (let r = 53; r <= 73; r++) {
        const x = Math.round(HUB_C + ux * r), z = Math.round(HUB_C + uz * r);
        const horiz = Math.abs(ux) >= Math.abs(uz);
        for (let o = -1; o <= 1; o++) {
          const px = horiz ? x : x + o, pz = horiz ? z + o : z;
          // 강/강둑 위만 상판(주변 지면이 이미 y19면 그대로 이어짐)
          if (surfaceTop(px, pz) <= 19) {
            setW(px, 18, pz, ID.oak_planks);
            if (Math.abs(o) === 1 && r % 2 === 0) setW(px, 19, pz, ID.oak_fence);   // 난간
          }
        }
        if (r % 6 === 0 && surfaceTop(x, z) <= 19) { for (let y = 15; y <= 17; y++) setW(x, y, z, ID.oak_log); }   // 교각
        if (r === 63) { const lx = horiz ? x : x + 2, lz = horiz ? z + 2 : z; if (surfaceTop(lx, lz) <= 19) { setW(lx, 19, lz, ID.oak_fence); setW(lx, 20, lz, ID.glowstone); } }   // 다리 등불
      }
    }
  }



  // V56: 경매장 — 실사(Auction_House.png): 굵은 조각 석재 기둥 + 자주(보라) 벽 패널 + 가문비 박공 지붕 + 빨간 배너
  function buildAuctionTemple(cx, cz) {
    const X0 = cx - 6, Z0 = cz - 5, Wd = 13, Dd = 11;
    const base = surfaceTop(cx, cz);
    const CH = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks;
    const PUR = ID.terracotta_purple != null ? ID.terracotta_purple : ID.purpur;
    for (let dx = -1; dx <= Wd; dx++) for (let dz = -1; dz <= Dd; dz++) for (let y = base; y <= base + 14; y++) setW(X0 + dx, y, Z0 + dz, 0);   // 부지 정리(구 로툰다 철거)
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X0 + dx, base - 1, Z0 + dz, ID.polished_andesite != null ? ID.polished_andesite : ID.stone);
    // 벽: 조각 석재 필라스터(3칸 간격) + 사이 보라 패널
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) {
      const edge = dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1;
      if (!edge) continue;
      const pil = (dx % 3 === 0 && (dz === 0 || dz === Dd - 1)) || (dz % 3 === 0 && (dx === 0 || dx === Wd - 1)) || ((dx === 0 || dx === Wd - 1) && (dz === 0 || dz === Dd - 1));
      for (let y = 0; y < 6; y++) setW(X0 + dx, base + y, Z0 + dz, pil ? (y === 5 ? CH : ID.stone_bricks) : y < 5 ? PUR : ID.stone_bricks);
    }
    // 정면(+z, 광장 방향): 대형 입구 + 빨간 배너 2 + 포치 기둥
    for (let dx = 5; dx <= 7; dx++) for (let y = 0; y < 4; y++) setW(X0 + dx, base + y, Z0 + Dd - 1, 0);
    for (let y = 1; y <= 3; y++) { setW(X0 + 3, base + y, Z0 + Dd, ID.wool_red); setW(X0 + 9, base + y, Z0 + Dd, ID.wool_red); }   // 배너
    for (const px of [X0 + 2, X0 + 10]) { for (let y = 0; y < 5; y++) setW(px, base + y, Z0 + Dd + 1, CH); }
    for (let dx = 2; dx <= 10; dx++) setW(X0 + dx, base + 5, Z0 + Dd + 1, ID.stone_bricks);   // 포치 상인방
    for (let dx = 4; dx <= 8; dx++) setW(X0 + dx, base - 1, Z0 + Dd, ID.oak_planks);           // 진입 데크
    // 가문비 박공 지붕
    for (let step = 0; step <= 3; step++) for (let dx = -1 + step; dx <= Wd - step; dx++) for (const dz of [-1 + step, Dd - step]) setW(X0 + dx, base + 6 + step, Z0 + dz, ID.spruce_planks);
    for (let dx = 3; dx < Wd - 3; dx++) for (let dz = 3; dz < Dd - 3; dz++) setW(X0 + dx, base + 9, Z0 + dz, ID.spruce_planks);
    // 내부: 경매 단상(중앙) + 조명
    setW(cx, base, cz, CH); setW(cx, base + 1, cz, ID.oak_planks);
    setW(cx - 2, base + 4, cz, ID.glowstone); setW(cx + 2, base + 4, cz, ID.glowstone);
  }

  // V57: 펫 케어(Fann's Pet Care) — 실사(Pet_Care.png): 남향 박공 정면에 청록 패널+프리즈머린 발자국,
  //   구리색(주황 테라코타) 급경사 지붕, 1층 개방 스토어프런트(석재 기단+통나무 기둥), 입구 옆 건초 더미
  function buildPetCare(x0, z0) {
    const X0 = 243, X1 = 253, Z0 = 234, Z1 = 240, base = 20;   // 정면 +z(광장 방향), 폭 11 × 깊이 7
    const CY = ID.terracotta_cyan != null ? ID.terracotta_cyan : ID.wool_cyan;   // 짙은 청록 필드 — 밝은 프리즈머린 발자국과 대비
    const OR = ID.terracotta_orange != null ? ID.terracotta_orange : ID.wool_orange;
    const SS = ID.sandstone, AND = ID.polished_andesite != null ? ID.polished_andesite : ID.stone_bricks;
    for (let x = X0 - 1; x <= X1 + 1; x++) for (let z = Z0 - 1; z <= Z1 + 2; z++) for (let y = base; y <= base + 16; y++) setW(x, y, z, 0);   // 구 자작집 철거
    // 바닥: 판자 + 석재 테두리, 입구 앞 오크 진입로
    for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) setW(x, base - 1, z, (x === X0 || x === X1 || z === Z0 || z === Z1) ? ID.stone_bricks : ID.oak_planks);
    for (let x = 246; x <= 250; x++) for (let z = Z1 + 1; z <= Z1 + 2; z++) setW(x, base - 1, z, ID.oak_planks);
    // 1층: 측벽/뒷벽(석재 기단 y0 + 사암 y1~2 + 유리창), 정면 개방(모서리·중간 통나무 기둥)
    for (let z = Z0; z <= Z1; z++) for (const x of [X0, X1]) {
      setW(x, base, z, z === Z0 || z === Z1 ? ID.oak_log : AND);
      setW(x, base + 1, z, (z === 236 || z === 238) ? ID.glass : SS);
      setW(x, base + 2, z, SS);
    }
    for (let x = X0 + 1; x < X1; x++) { setW(x, base, Z0, AND); setW(x, base + 1, Z0, (x % 2 === 0) ? ID.glass : SS); setW(x, base + 2, Z0, SS); }
    for (const px of [245, 251]) for (let y = 0; y < 3; y++) setW(px, base + y, Z1, ID.oak_log);   // 정면 기둥(개방 스토어프런트)
    for (let y = 0; y < 3; y++) { setW(X0, base + y, Z1, ID.oak_log); setW(X1, base + y, Z1, ID.oak_log); }
    // 구리색 차양 밴드(정면 돌출) + 지지 기둥
    for (let x = X0 + 1; x < X1; x++) setW(x, base + 3, Z1 + 1, OR);
    // 급경사 박공 지붕(실사처럼 첨두형) — 단차 2칸씩 굵은 계단, 능선 x248, 앞뒤 1칸 처마
    for (let s = 0; s <= 4; s++) for (const rx of [X0 + s, X1 - s]) for (let z = Z0 - 1; z <= Z1 + 1; z++) { setW(rx, base + 3 + s * 2, z, OR); setW(rx, base + 4 + s * 2, z, OR); }
    for (let z = Z0 - 1; z <= Z1 + 1; z++) { setW(248, base + 11, z, OR); setW(248, base + 12, z, OR); }
    // 앞뒤 박공면(사암 프레임): 지붕 안쪽을 꽉 채움 — 정면은 대형 청록 패널 + 프리즈머린 발자국(패드 3×2 + 발가락 4)
    const gTop = (x) => { const d = Math.abs(248 - x); return d >= 5 ? -1 : d === 0 ? 10 : 2 + (5 - d) * 2; };   // 각 열 벽 최고단(지붕 바로 아래)
    for (const gz of [Z0, Z1]) for (let x = X0 + 1; x < X1; x++) for (let y = 3; y <= gTop(x); y++) setW(x, base + y, gz, SS);
    const paw = [];   // [x, y] 프리즈머린 셀 — 큰 패드(3×2) + 발가락 4(호 배열)
    for (let x = 247; x <= 249; x++) { paw.push([x, 5], [x, 6]); }
    paw.push([245, 7], [247, 8], [249, 8], [251, 7]);
    const isPaw = (x, y) => paw.some(c => c[0] === x && c[1] === y);
    for (let x = 245; x <= 251; x++) for (let y = 4; y <= gTop(x) - 1 && y <= 9; y++) setW(x, base + y, Z1, isPaw(x, y) ? ID.prismarine : CY);
    // 입구 옆 건초 더미(참조 우측) + 잔디 침식 패치
    setW(252, base, Z1 + 1, ID.hay_block); setW(252, base + 1, Z1 + 1, ID.hay_block); setW(251, base, Z1 + 2, ID.hay_block);
    setW(244, base - 1, Z1 + 1, ID.grass); setW(245, base - 1, Z1 + 2, ID.grass); setW(244, base, Z1 + 1, ID.tall_grass);
    // 내부 조명
    setW(248, base + 2, 237, ID.glowstone);
  }

  // V55: 커뮤니티 센터 재건축 — 실사(Community_Center.png): 붉은 벽돌 벽 + 크림(사암) 기둥 프레임 +
  //   짙은 맨사드 지붕 + 중앙 시계탑(석영 시계면) + 3연속 아치 포치
  function rebuildCommunityCenter() {
    const X0 = 248, Z0 = 180, Wd = 13, Dd = 10;   // V55b: 은행 돔(240,200)과 겹치던 부지를 북동으로 이전
    const base = surfaceTop(X0 + 6, Z0 + 5);
    const CREAM = ID.sandstone, BRICK = ID.bricks != null ? ID.bricks : ID.terracotta_red, ROOF = ID.terracotta_black != null ? ID.terracotta_black : ID.obsidian;
    for (let dx = -1; dx <= Wd; dx++) for (let dz = -1; dz <= Dd; dz++) for (let y = base; y <= base + 16; y++) setW(X0 + dx, y, Z0 + dz, 0);   // 부지 정리
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X0 + dx, base - 1, Z0 + dz, ID.polished_andesite != null ? ID.polished_andesite : ID.stone);
    // 2층 몸체: 벽돌 벽 + 크림 코너/층간 프레임 + 창
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) {
      const edge = dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1;
      if (!edge) continue;
      for (let y = 0; y < 7; y++) {
        const corner = (dx === 0 || dx === Wd - 1) && (dz === 0 || dz === Dd - 1);
        let id = corner || y === 3 ? CREAM : BRICK;                          // 크림 코너 기둥 + 층간 띠
        if ((y === 1 || y === 5) && ((dx % 4 === 2 && (dz === 0 || dz === Dd - 1)) || (dz % 4 === 2 && (dx === 0 || dx === Wd - 1)))) id = ID.glass;
        setW(X0 + dx, base + y, Z0 + dz, id);
      }
    }
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X0 + dx, base + 3, Z0 + dz, ID.oak_planks);   // 2층 바닥
    // 맨사드 지붕(짙은 테라코타, 2단 안쪽 물림)
    for (let step = 0; step < 2; step++) for (let dx = step; dx < Wd - step; dx++) for (let dz = step; dz < Dd - step; dz++) {
      const rim = dx === step || dx === Wd - 1 - step || dz === step || dz === Dd - 1 - step;
      if (rim) setW(X0 + dx, base + 7 + step, Z0 + dz, ROOF);
    }
    for (let dx = 2; dx < Wd - 2; dx++) for (let dz = 2; dz < Dd - 2; dz++) setW(X0 + dx, base + 8, Z0 + dz, ID.oak_planks);   // 지붕 마감
    // 3연속 아치 포치(남쪽 정면 +z): 크림 기둥 4 + 상인방
    for (const px of [X0 + 2, X0 + 5, X0 + 8, X0 + 11]) { for (let y = 0; y < 4; y++) setW(px, base + y, Z0 + Dd + 1, CREAM); }
    for (let dx = 2; dx <= 11; dx++) setW(X0 + dx, base + 4, Z0 + Dd + 1, CREAM);
    for (let dx = 3; dx <= 10; dx++) if (dx % 3 !== 2) setW(X0 + dx, base + 3, Z0 + Dd + 1, 0);
    for (const px of [X0 + 3, X0 + 6, X0 + 9]) { setW(px, base, Z0 + Dd - 1, 0); setW(px, base + 1, Z0 + Dd - 1, 0); }   // 3연 입구
    for (let dx = 2; dx <= 11; dx++) setW(X0 + dx, base - 1, Z0 + Dd, ID.oak_planks);   // 포치 데크
    // 중앙 시계탑(크림 몸통 h6 + 석영 시계면 + 검은 침 + 붉은 첨두)
    const cx = X0 + 6;
    for (let y = 9; y <= 14; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
      setW(cx + dx, base + y, Z0 + 4 + dz, edge ? CREAM : 0);
    }
    setW(cx, base + 12, Z0 + 5 + 1, ID.quartz_block);   // 시계면(남면)
    setW(cx, base + 11, Z0 + 5 + 1, ID.quartz_block); setW(cx - 1, base + 12, Z0 + 5 + 1, ID.quartz_block); setW(cx + 1, base + 12, Z0 + 5 + 1, ID.quartz_block); setW(cx, base + 13, Z0 + 5 + 1, ID.quartz_block);
    setW(cx, base + 12, Z0 + 5 + 2, ID.concrete_black != null ? ID.concrete_black : ID.obsidian);   // 침(중심점)
    for (let y = 15; y <= 16; y++) setW(cx, base + y, Z0 + 4, ID.terracotta_red != null ? ID.terracotta_red : ROOF);   // 첨두
    setW(cx, base + 17, Z0 + 4, ID.glowstone);
  }
  // V55: 플라워 하우스 재건축 — 실사(Flower_House.png): 조약돌 벽 + 다크오크 프레임 + 구리색(주황 테라코타) 지붕 +
  //   개방형 정면 + 내부 목조 계단 + 주변 꽃밭 + 흰 퍼걸러 별관
  function rebuildFlowerHouse() {
    const X0 = 194, Z0 = 190, Wd = 8, Dd = 8;
    const base = surfaceTop(X0 + 4, Z0 + 4);
    const COPPER = ID.terracotta_orange != null ? ID.terracotta_orange : ID.wool_orange;
    for (let dx = -1; dx <= Wd + 3; dx++) for (let dz = -1; dz <= Dd; dz++) for (let y = base; y <= base + 10; y++) setW(X0 + dx, y, Z0 + dz, 0);
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X0 + dx, base - 1, Z0 + dz, ID.cobblestone);
    // 몸체: 조약돌 벽 + 다크오크 코너/보 프레임, 남면(+z) 전면 개방
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) {
      const edge = dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1;
      if (!edge) continue;
      const front = dz === Dd - 1 && dx >= 2 && dx <= Wd - 3;
      for (let y = 0; y < 4; y++) {
        if (front && y < 3) continue;                                        // 개방 정면
        const corner = (dx === 0 || dx === Wd - 1) && (dz === 0 || dz === Dd - 1);
        setW(X0 + dx, base + y, Z0 + dz, corner ? ID.dark_oak_log : y === 3 ? ID.dark_oak_log : ID.cobblestone);
      }
    }
    // 구리 지붕(박공)
    for (let step = 0; step <= 2; step++) for (let dx = -1 + step; dx <= Wd - step; dx++) for (const dz of [-1 + step, Dd - step]) setW(X0 + dx, base + 4 + step, Z0 + dz, COPPER);
    for (let dx = 1; dx < Wd - 1; dx++) for (let dz = 1; dz < Dd - 1; dz++) setW(X0 + dx, base + 6, Z0 + dz, COPPER);
    // 내부: 2층으로 오르는 목조 계단 + 로프트
    for (let i = 0; i < 3; i++) { setW(X0 + 2 + i, base + i, Z0 + 2, ID.oak_planks); }
    for (let dx = 1; dx < Wd - 1; dx++) setW(X0 + dx, base + 3, Z0 + 1, ID.oak_planks);
    setW(X0 + 4, base + 2, Z0 + 4, ID.glowstone);
    // 흰 퍼걸러 별관(서쪽): 석영 기둥 + 상판
    for (const [px, pz] of [[X0 - 3, Z0 + 2], [X0 - 3, Z0 + 6], [X0 - 1, Z0 + 2], [X0 - 1, Z0 + 6]]) { for (let y = 0; y < 3; y++) setW(px, base + y, pz, ID.quartz_block); }
    for (let dx = -3; dx <= -1; dx++) for (let dz = 2; dz <= 6; dz++) setW(X0 + dx, base + 3, Z0 + dz, ID.quartz_block);
    // 주변 꽃밭(참조: 건물 앞 다색 꽃 무리)
    for (let dx = -4; dx <= Wd + 2; dx++) for (let dz = Dd; dz <= Dd + 4; dz++) {
      const x = X0 + dx, z = Z0 + dz, t = surfaceTop(x, z);
      if (getBlockLocal(x, t - 1, z) !== ID.grass || getBlockLocal(x, t, z) !== 0) continue;
      const h = hash3(x, 711, z);
      if (h < 0.5) setW(x, t, z, h < 0.2 ? ID.flower_red : h < 0.38 ? ID.flower_yellow : ID.tall_grass);
    }
  }

  // V53: 마을 벽면 잎 트림 — 건물 외벽(석재/판자)에 잎을 낮은 확률로 부착해 '덩굴 낀 마을' 질감(Bazaar_Alley.png)
  function leafTrimPass() {
    const wallLike = id => { if (!id) return false; const k = BLOCKS[id].key; return /stone_bricks|planks|cobblestone|sandstone|log/.test(k) && !/slab|stairs|fence/.test(k); };
    for (let x = 196; x <= 252; x++) for (let z = 196; z <= 258; z++) {
      if (NPCS.some(n => Math.abs(n.x - x) <= 1 && Math.abs(n.z - z) <= 1)) continue;   // NPC 자리 융기 방지
      const g = surfaceTop(x, z);
      for (let y = g + 1; y <= g + 5; y++) {
        if (getBlockLocal(x, y, z) !== 0) continue;
        if (hash3(x, y + 611, z) > 0.045) continue;
        // 이웃에 벽이 있고, 위가 트여 있으면(실내 아님) 잎 부착
        const nWall = wallLike(getBlockLocal(x + 1, y, z)) || wallLike(getBlockLocal(x - 1, y, z)) || wallLike(getBlockLocal(x, y, z + 1)) || wallLike(getBlockLocal(x, y, z - 1));
        if (!nWall) continue;
        let open = 0; for (let dy = 1; dy <= 5; dy++) if (getBlockLocal(x, y + dy, z) === 0) open++;
        if (open >= 4) setW(x, y, z, ID.oak_leaves);
      }
    }
  }
  // V53: 야생 대형 바위 군집 — 실제 탑뷰의 회색 바위 무리(반구형, 돌/조약돌/이끼 혼합)
  function boulderPass() {
    const spots = [[168, 178], [282, 176], [176, 262], [268, 282], [136, 200], [306, 250], [204, 300], [252, 156], [300, 300], [160, 236]];
    for (const [bx, bz] of spots) {
      if (zoneAt(bx, bz) !== 'wild') continue;
      const r = 2 + (hash3(bx, 621, bz) * 2 | 0);
      const by = surfaceTop(bx, bz) - 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = 0; dy <= r; dy++) {
        if (Math.hypot(dx, dy, dz) > r + (hash3(bx + dx, 622, bz + dz) - 0.5)) continue;
        const m = hash3(bx + dx, by + dy, bz + dz);
        setW(bx + dx, by + dy, bz + dz, m < 0.25 ? ID.mossy_cobblestone : m < 0.55 ? ID.cobblestone : ID.stone);
      }
    }
  }

  // V51: 소형 상점 인테리어 — 기존 건물 내부의 '공기 칸'만 채우는 안전 배치(벽/기둥 훼손 없음)
  function buildShopInteriors() {
    const put = (x, y, z, id) => { if (getBlockLocal(x, y, z) === 0) setW(x, y, z, id); };
    const fy = (x, z) => surfaceTop(x, z);
    { // ── 잡화점(상점 주인 204,244): L자 카운터 + 벽 선반 진열 + 궤짝 + 등불 ──
      const y = fy(205, 243);
      for (let i = 0; i < 4; i++) put(202 + i, y, 242, ID.oak_planks);      // 카운터
      put(206, y, 243, ID.oak_planks); put(206, y, 244, ID.oak_planks);     // L자 꺾임
      for (let i = 0; i < 3; i++) { put(202 + i, y + 2, 240, ID.oak_planks); put(202 + i, y + 3, 240, i === 1 ? ID.wool_yellow : ID.wool_red); }   // 선반+상품
      put(201, y, 246, ID.oak_log); put(202, y, 246, ID.oak_log); put(201, y + 1, 246, ID.oak_log);   // 궤짝 더미
      put(203, y + 3, 241, ID.glowstone);   // NPC(204,244) 머리 위 회피
    }
    { // ── 펫 상점(펫 상인 250,243): 우리 2칸(울타리) + 건초/물그릇 + 횃대 ──
      const y = fy(251, 242);
      for (let dx = 0; dx <= 2; dx++) { put(249 + dx, y, 240, ID.oak_fence); put(249 + dx, y, 238, ID.oak_fence); }
      put(249, y, 239, ID.oak_fence); put(252, y, 239, ID.oak_fence);       // 우리 A
      put(250, y, 239, ID.hay_block);
      for (let dx = 0; dx <= 2; dx++) { put(253 + dx, y, 240, ID.oak_fence); }
      put(254, y - 1, 239, ID.water);                                        // 물그릇(바닥 파임 대신 수면)
      put(248, y, 244, ID.oak_fence); put(248, y + 1, 244, ID.oak_fence); put(248, y + 2, 244, ID.glowstone);   // 횃대 등불
    }
    { // ── 플라워 하우스(198,194): 화분 진열대 2열 + 융단 통로 ──
      const y = fy(199, 196);
      for (let i = 0; i < 4; i++) {
        put(197 + i, y, 193, ID.oak_planks); put(197 + i, y + 1, 193, i % 2 ? ID.flower_red : ID.flower_yellow);
        put(197 + i, y, 197, ID.oak_planks); put(197 + i, y + 1, 197, i % 2 ? ID.flower_yellow : ID.flower_red);
      }
      for (let i = 0; i < 4; i++) put(197 + i, y - 1, 195, ID.wool_pink != null ? ID.wool_pink : ID.wool_red);   // 융단
      put(199, y + 3, 195, ID.glowstone);
    }
    { // ── 커뮤니티 센터(신축 254,184): 회의 탁자 + 의자 6 + 연단 ──
      const y = fy(254, 184);
      for (let i = 0; i < 4; i++) put(251 + i, y, 184, ID.oak_planks);       // 긴 탁자
      for (let i = 0; i < 3; i++) { put(251 + i * 2, y, 182, ID.oak_fence); put(251 + i * 2, y, 186, ID.oak_fence); }   // 의자
      put(256, y, 184, ID.oak_log); put(256, y + 1, 184, ID.oak_planks);     // 연단
      put(253, y + 3, 184, ID.glowstone);
    }
  }

  // V45: 광산 남사면 계단식 노천 채석장 — 테라스 3단(석재/자갈), 갱목 지지대, 광석 노출면, 수레길
  // V46: 디 엔드 — 흑요석 기둥 8기(높이 차등) + 정상 엔드 크리스탈(유리 케이지+발광) — 실제 엔드 100% 상징
  function buildEndPillars() {
    for (let n = 0; n < 8; n++) {
      const a = n / 8 * Math.PI * 2 + 0.3;
      const x = Math.round(64 + Math.cos(a) * 36), z = Math.round(64 + Math.sin(a) * 36);
      const y0 = surfaceTop(x, z);
      if (y0 < 8) continue;
      const h = 8 + ((n * 37) % 11);   // 8~18 차등(실제 기둥 높이 차등)
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) === 2) continue;   // 십자 단면(둥근 기둥 느낌)
        for (let y = 0; y < h; y++) setW(x + dx, y0 + y, z + dz, ID.obsidian);
      }
      // 정상 크리스탈: 기반암 대용 퍼퍼 + 발광 코어 + 유리 케이지(짝수 기둥만 — 실제도 일부만 케이지)
      setW(x, y0 + h, z, ID.purpur);
      setW(x, y0 + h + 1, z, ID.glowstone);
      if (n % 2 === 0) { for (const [gx, gz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setW(x + gx, y0 + h + 1, z + gz, ID.glass); setW(x, y0 + h + 2, z, ID.glass); }
    }
  }
  // V46: 더 반 — 곡물 사일로(원통+원뿔 캡) + 가축 목장(울타리 패덕/건초 더미/물통)
  function buildBarnExtras() {
    const sx = 90, sz = 82, sy = surfaceTop(sx, sz);
    for (let y = 0; y < 11; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > 2.4 || d < 1.4) continue;
      setW(sx + dx, sy + y, sz + dz, ID.cobblestone);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.hypot(dx, dz) <= 2.4) setW(sx + dx, sy + 11, sz + dz, ID.spruce_planks);
    setW(sx, sy + 12, sz, ID.spruce_planks); setW(sx, sy + 13, sz, ID.glowstone);
    for (let y = 0; y < 4; y++) setW(sx, sy + y, sz - 3, 0);   // 투입구
    setW(sx, sy + 2, sz - 3, ID.hay_block);
    // 목장: 울타리 패덕 14×9 + 건초 더미 + 물통 + 출입구
    const px0 = 34, pz0 = 84, pw = 14, pd = 9;
    for (let i = 0; i <= pw; i++) for (const dz of [0, pd]) { const t = surfaceTop(px0 + i, pz0 + dz); if (t >= 4 && i !== 7) setW(px0 + i, t, pz0 + dz, ID.oak_fence); }
    for (let j = 0; j <= pd; j++) for (const dx of [0, pw]) { const t = surfaceTop(px0 + dx, pz0 + j); if (t >= 4) setW(px0 + dx, t, pz0 + j, ID.oak_fence); }
    const hy = surfaceTop(px0 + 4, pz0 + 4);
    setW(px0 + 4, hy, pz0 + 4, ID.hay_block); setW(px0 + 5, hy, pz0 + 4, ID.hay_block); setW(px0 + 4, hy + 1, pz0 + 4, ID.hay_block);
    setW(px0 + 10, surfaceTop(px0 + 10, pz0 + 6) - 1, pz0 + 6, ID.water);   // 물통(웅덩이)
    lampPost(px0 + 7, pz0 - 2);
  }
  // V46: 더 파크 — 찰리의 캠프(참나무 섬 76,112): A자 텐트 + 모닥불 링 + 통나무 의자
  function buildParkCamp() {
    const cx = 78, cz = 114, cy = surfaceTop(cx, cz);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let y = cy; y <= cy + 4; y++) setW(cx + dx, y, cz + dz, 0);   // 캠프 공터
    // A자 텐트(양털 경사 지붕 + 안쪽 침낭)
    for (let dz2 = -2; dz2 <= 0; dz2++) {
      setW(cx - 2, cy, cz + dz2, ID.wool_white); setW(cx, cy, cz + dz2, ID.wool_white);   // 양쪽 벽
      setW(cx - 1, cy + 1, cz + dz2, ID.wool_white);                                       // 마루
      if (dz2 === -2) setW(cx - 1, cy, cz + dz2, ID.wool_white);                           // 뒷벽 막기
    }
    setW(cx - 1, cy - 1, cz - 1, ID.wool_red);   // 침낭
    // 모닥불 링(조약돌 링 + 중심 마그마 + 발광)
    setW(cx + 2, cy - 1, cz + 1, ID.magma_block != null ? ID.magma_block : ID.glowstone);
    for (const [gx, gz] of [[1, 1], [3, 1], [2, 0], [2, 2]]) setW(cx + gx, cy, cz + gz - 0, ID.cobblestone);
    setW(cx + 2, cy, cz + 1, ID.glowstone);
    // 통나무 의자 2개
    setW(cx + 2, cy, cz + 3, ID.oak_log); setW(cx, cy, cz + 3, ID.oak_log);
  }
  // V46: 스파이더 덴 — 알 둥지 군집(양털 알 + 점액) + 절벽에서 늘어진 거미줄 가닥
  function buildSpiderNests() {
    const nests = [[48, 78], [80, 52], [58, 44]];
    for (const [nx, nz] of nests) {
      const ny = surfaceTop(nx, nz);
      for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) if ((dx + dz) % 2 === 0) setW(nx + dx, ny, nz + dz, ID.wool_white);
      setW(nx + 1, ny + 1, nz + 1, ID.wool_white);
      setW(nx + 2, ny, nz + 1, ID.slime_block != null ? ID.slime_block : ID.mossy_cobblestone);
    }
    // 절벽 거미줄 가닥: 산 중턱에서 아래로 3~6칸 늘어진 흰 줄
    for (let n = 0; n < 8; n++) {
      const a = n / 8 * Math.PI * 2 + 0.7, rr = 16 + (n % 3) * 5;
      const x = Math.round(64 + Math.cos(a) * rr), z = Math.round(64 + Math.sin(a) * rr);
      const t = surfaceTop(x, z);
      if (t < 18) continue;
      const len = 3 + (n % 4);
      for (let j = 1; j <= len; j++) if (getBlockLocal(x, t + 6 - j, z) === 0) setW(x, t + 6 - j, z, ID.wool_white);
    }
  }

  function buildMineQuarry() {
    const cx = 88, cz = 230;   // 광산 언덕 남사면
    for (let ring = 0; ring < 3; ring++) {
      const r0 = 5 + ring * 4, r1 = r0 + 3, dy = -1 - ring;   // 링마다 한 단 내려감
      for (let x = cx - r1; x <= cx + r1; x++) for (let z = cz - r1; z <= cz + r1; z++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < r0 || d > r1 || zoneAt(x, z) === 'village') continue;
        const t = surfaceTop(x, z);
        // 테라스 바닥: 지표를 한 단씩 깎아 계단식 단면
        for (let y = t - 1 + dy + 1; y <= t + 3; y++) setW(x, y, z, 0);
        setW(x, t - 1 + dy, z, hash3(x, 401, z) < 0.3 ? ID.gravel : ID.stone);
        // 벽면 광석 노출(단 사이 수직면)
        if (d > r1 - 1.2 && hash3(x, 402, z) < 0.28) setW(x, t + dy, z, hash3(x, 403, z) < 0.6 ? ID.coal_ore : ID.iron_ore);
      }
    }
    // 중앙 최하단 바닥 + 물웅덩이 + 사다리꼴 갱목 크레인
    for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) {
      const t = surfaceTop(x, z);
      for (let y = t; y <= t + 4; y++) setW(x, y, z, 0);
      setW(x, t - 1, z, Math.hypot(x - cx, z - cz) < 2 ? ID.water : ID.stone);
    }
    const by = surfaceTop(cx + 3, cz + 3);
    for (let y = 0; y < 6; y++) setW(cx + 5, by + y, cz + 5, ID.spruce_log);   // 크레인 기둥
    for (let i = 0; i < 4; i++) setW(cx + 5 - i, by + 5, cz + 5, ID.spruce_planks);   // 크레인 팔
    setW(cx + 2, by + 4, cz + 5, ID.oak_fence);   // 매달린 로프(울타리)
    setW(cx + 2, by + 3, cz + 5, ID.oak_fence);
    // 수레길: 채석장 → 갱도 입구(103,208) 자갈 2폭
    for (let i = 0; i <= 20; i++) {
      const x = Math.round(cx + (103 - cx) * i / 20), z = Math.round(cz + (208 - cz) * i / 20);
      for (let w = 0; w <= 1; w++) { const t = surfaceTop(x + w, z); if (getBlockLocal(x + w, t - 1, z) !== 0) setW(x + w, t - 1, z, i % 4 === 0 ? ID.oak_planks : ID.gravel); }
    }
    [[cx - 7, cz], [cx, cz - 7], [cx + 7, cz + 1]].forEach(p2 => { const t = surfaceTop(p2[0], p2[1]); setW(p2[0], t, p2[1], ID.glowstone); });   // 작업등
  }
  // V45: 폐허 — 무너진 성벽 라인(부분 잔존 높이) + 쓰러진 기둥 + 잔해 더미(플래토 가장자리)
  // V63: 실사(Ruins.png) — 폐허 쌍탑 성채: 흰-회색 풍화 원탑 2기(붉은 원뿔 지붕, 부서진 총안) +
  //   사이 무너진 성문 벽(아치) + 담쟁이 + 흙길. buildRuinWalls보다 먼저 호출됨(같은 훅에서).
  function buildRuinTowers() {
    const RED = ID.terracotta_red != null ? ID.terracotta_red : ID.bricks;
    const tower = (cx, cz, h, seed) => {
      if (zoneAt(cx, cz) !== 'ruins') return;
      const base = surfaceTop(cx, cz), R = 3;
      for (let y = 0; y < h; y++) for (let a = 0; a < 26; a++) {
        const th = a / 26 * Math.PI * 2;
        const x = cx + Math.round(Math.cos(th) * R), z = cz + Math.round(Math.sin(th) * R);
        // 위로 갈수록 붕괴 확률 증가(부서진 실루엣)
        if (y > h - 4 && hash3(x, seed + y, z) < 0.3 + (y - (h - 4)) * 0.15) continue;
        const w = hash3(x, seed, z + y);
        setW(x, base + y, z, w < 0.3 ? ID.quartz_block : w < 0.42 ? ID.mossy_cobblestone : ID.stone_bricks);
      }
      // 창(2개층) + 내부 비움은 원통이라 자동 — 담쟁이
      setW(cx + R, base + Math.floor(h / 2), cz, ID.glass); setW(cx - R, base + Math.floor(h / 2) + 3, cz, ID.glass);
      for (let v = 0; v < 6; v++) {
        const th = hash3(cx, seed + 7, v) * Math.PI * 2;
        const x = cx + Math.round(Math.cos(th) * (R + 1)), z = cz + Math.round(Math.sin(th) * (R + 1));
        const vy = base + 1 + Math.floor(hash3(x, seed + 8, z) * (h - 4));
        for (let i = 0; i < 2 + (v % 2); i++) setW(x, vy + i, z, ID.oak_leaves);
      }
      // 붉은 원뿔 지붕(계단 수렴) — 한쪽 탑은 반쯤 무너진 채(2단만)
      const steps = seed % 2 === 0 ? 4 : 2;
      for (let t2 = 0; t2 < steps; t2++) {
        const rr = R - t2 + 1;
        for (let a = 0; a < 26; a++) {
          const th = a / 26 * Math.PI * 2;
          setW(cx + Math.round(Math.cos(th) * Math.max(0, rr)), base + h + t2, cz + Math.round(Math.sin(th) * Math.max(0, rr)), RED);
        }
        for (let dx = -Math.max(0, rr - 1); dx <= Math.max(0, rr - 1); dx++) for (let dz = -Math.max(0, rr - 1); dz <= Math.max(0, rr - 1); dz++)
          if (Math.hypot(dx, dz) <= rr - 0.5) setW(cx + dx, base + h + t2, cz + dz, RED);
      }
      if (steps === 4) { setW(cx, base + h + 4, cz, RED); setW(cx, base + h + 5, cz, RED); }
    };
    tower(76, 270, 12, 430); tower(76, 292, 14, 431);
    // 성문 벽(두 탑 사이, x76 라인): 붕괴 갭 + 중앙 아치
    for (let z = 274; z <= 288; z++) {
      if (zoneAt(76, z) !== 'ruins') continue;
      const t = surfaceTop(76, z);
      const isGate = z >= 280 && z <= 282;
      const hh = isGate ? 0 : hash3(76, 433, z) < 0.2 ? 0 : 2 + Math.floor(hash3(76, 434, z) * 4);
      for (let y = 0; y < hh; y++) setW(76, t + y, z, hash3(76, 435 + y, z) < 0.35 ? ID.mossy_cobblestone : ID.stone_bricks);
      if (z === 279 || z === 283) for (let y = 0; y < 5; y++) setW(76, t + y, z, ID.stone_bricks);   // 아치 기둥
      if (isGate) setW(76, t + 5, z, ID.stone_bricks);   // 아치 상인방
    }
    // 성문으로 이어지는 흙길
    for (let x = 77; x <= 96; x++) {
      const z = 281 + Math.round(Math.sin(x * 0.4) * 1.5);
      if (zoneAt(x, z) !== 'ruins') continue;
      const g = surfaceTop(x, z);
      if (getBlockLocal(x, g - 1, z) === ID.grass) setW(x, g - 1, z, ID.coarse_dirt);
    }
  }
  function buildRuinWalls() {
    buildRuinTowers();   // V63: 쌍탑 성채(실사 Ruins.png)
    const wall = (x0, z0, x1, z1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
        const h = hash3(x, 411, z);
        if (h < 0.18) continue;                                        // 붕괴 갭
        const t = surfaceTop(x, z);
        const hh = h < 0.45 ? 1 : h < 0.8 ? 2 + (i % 2) : 4;           // 잔존 높이 들쭉날쭉
        for (let y = 0; y < hh; y++) setW(x, t + y, z, hash3(x, y + 412, z) < 0.35 ? ID.mossy_stone_bricks : hash3(x, y + 413, z) < 0.2 ? ID.cracked_stone_bricks : ID.stone_bricks);
        if (h > 0.93) setW(x, t + hh, z, ID.mossy_cobblestone);        // 꼭대기 이끼 캡
        if (h < 0.24 && h >= 0.18) { setW(x + 1, t, z, ID.cobblestone); setW(x, t, z + 1, ID.mossy_cobblestone); }   // 갭 아래 잔해
      }
    };
    wall(66, 262, 108, 262);   // 북쪽 성벽 라인
    wall(66, 262, 66, 300);    // 서쪽 성벽 라인
    // 쓰러진 기둥 2기(가로 눕힌 석재) + 파괴된 주춧돌
    for (let i = 0; i < 6; i++) { const t = surfaceTop(96 + i, 272); setW(96 + i, t, 272, i === 0 ? ID.mossy_stone_bricks : ID.stone_bricks); }
    for (let i = 0; i < 5; i++) { const t = surfaceTop(78, 288 + i); setW(78, t, 288 + i, i % 2 ? ID.stone_bricks : ID.cracked_stone_bricks); }
    for (let y = 0; y < 3; y++) setW(96, surfaceTop(96, 274) + y, 274, ID.stone_bricks);   // 남은 기둥 밑동
    [[70, 268], [102, 266], [68, 294]].forEach(p2 => { const t = surfaceTop(p2[0], p2[1]); setW(p2[0], t, p2[1], ID.mossy_cobblestone); setW(p2[0] + 1, t, p2[1], ID.cobblestone); setW(p2[0], t + 1, p2[1], ID.mossy_cobblestone); });   // 잔해 더미
  }
  // V45: 설산 — 남사면 지그재그 등반로(다진 길/횃불 이정표) + 정상 전망대(가문비 데크/난간/등불)
  function buildSnowTrail() {
    let x = 224, dir = 1;
    for (let z = 132; z >= 92; z--) {
      x += dir; if (x > 236) { dir = -1; x = 236; } if (x < 212) { dir = 1; x = 212; }
      for (let w = -1; w <= 1; w++) {
        const t = surfaceTop(x + w, z);
        const g = getBlockLocal(x + w, t - 1, z);
        if (g === ID.snow_block || g === ID.stone || g === ID.grass || g === ID.dirt) setW(x + w, t - 1, z, (z % 5) ? ID.gravel : ID.spruce_planks);
      }
      if (z % 8 === 0) { const t = surfaceTop(x + 2, z); setW(x + 2, t, z, ID.spruce_fence); setW(x + 2, t + 1, z, ID.glowstone); }   // 이정표 등불
    }
    // 정상 어깨 전망대(가문비 데크 7×7 + 난간 + 등불 기둥) — 정상 만년설은 보존
    const px = 232, pz = 96, py = surfaceTop(px, pz);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      setW(px + dx, py - 1, pz + dz, ID.spruce_planks);
      for (let y = py; y <= py + 3; y++) setW(px + dx, y, pz + dz, 0);
      if (Math.abs(dx) === 3 || Math.abs(dz) === 3) setW(px + dx, py, pz + dz, ID.spruce_fence);
    }
    setW(px, py, pz, ID.spruce_log); setW(px, py + 1, pz, ID.spruce_log); setW(px, py + 2, pz, ID.glowstone);   // 전망대 등불 기둥
  }
  // V58: 여관 → 실사(Tavern.png) — 낮은 물매의 주황(테라코타) 대형 지붕 + 다크오크 보(용마루/처마) +
  //   조약돌 기단 + 흰(석영) 하프팀버 벽 + 높은 개방 포치 현관 + 굴뚝 + 온광 홀
  function buildInn() {
    const X = 256, Z = 239, Wd = 11, Dd = 9;   // V58b: 펫 케어(~x253) 동벽을 침범하지 않게 2칸 동쪽으로
    const base = surfaceTop(X + 5, Z + 4);
    const DK = ID.dark_oak_log, WH = ID.quartz_block, OR = ID.terracotta_orange != null ? ID.terracotta_orange : ID.wool_orange;
    for (let dx = -2; dx <= Wd + 1; dx++) for (let dz = -2; dz <= Dd + 1; dz++) for (let y = base; y <= base + 14; y++) setW(X + dx, y, Z + dz, 0);   // 부지 정리(구 여관 철거)
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) setW(X + dx, base - 1, Z + dz, (dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1) ? ID.cobblestone : ID.oak_planks);
    // 벽: 조약돌 기단(y0~1, 유리창) + 다크오크 수평보(y2) + 흰 패널(y3, 스터드)
    for (let dx = 0; dx < Wd; dx++) for (let dz = 0; dz < Dd; dz++) {
      const edge = dx === 0 || dx === Wd - 1 || dz === 0 || dz === Dd - 1;
      if (!edge) continue;
      const corner = (dx === 0 || dx === Wd - 1) && (dz === 0 || dz === Dd - 1);
      setW(X + dx, base, Z + dz, corner ? DK : ID.cobblestone);
      setW(X + dx, base + 1, Z + dz, corner ? DK : (dx % 3 === 1 || dz % 3 === 1) ? ID.glass : ID.cobblestone);
      setW(X + dx, base + 2, Z + dz, DK);
      setW(X + dx, base + 3, Z + dz, corner || dx % 3 === 0 ? DK : WH);
    }
    // 낮은 물매 대형 지붕(용마루 x방향, 앞뒤로 흘림) — 처마/용마루는 다크오크 보
    for (let t = 0; t <= 4; t++) for (const dz of [t - 1, Dd - t]) for (let dx = -1; dx <= Wd; dx++) {
      setW(X + dx, base + 4 + t, Z + dz, (t === 0 || t === 4) ? DK : OR);
    }
    for (let dx = -1; dx <= Wd; dx++) setW(X + dx, base + 8, Z + 4, DK);   // 용마루 보
    // 동서 박공면(흰 패널 + 다크오크 스터드)
    for (const gx of [0, Wd - 1]) for (let dz = 1; dz < Dd - 1; dz++) for (let y = 4; y <= 7; y++) {
      if (y - 4 < Math.min(dz, Dd - 1 - dz)) setW(X + gx, base + y, Z + dz, (dz === 4 && y >= 6) ? DK : WH);
    }
    // 높은 개방 현관(정면 -z): 3칸 폭 개구 + 다크오크 포치 기둥 + 십자 박공(주황) + 계단 데크
    for (let dx = 4; dx <= 6; dx++) for (let y = 0; y <= 2; y++) setW(X + dx, base + y, Z, 0);
    for (const px of [3, 7]) for (let y = 0; y <= 3; y++) setW(X + px, base + y, Z - 1, DK);
    for (let dx = 3; dx <= 7; dx++) setW(X + dx, base + 4, Z - 1, DK);
    for (let dx = 4; dx <= 6; dx++) setW(X + dx, base + 5, Z - 1, OR);
    setW(X + 5, base + 6, Z - 1, OR);
    for (let dx = 4; dx <= 6; dx++) { setW(X + dx, base - 1, Z - 1, ID.oak_planks); setW(X + dx, base - 1, Z - 2, slabIdFor(ID.oak_planks) != null ? slabIdFor(ID.oak_planks) : ID.oak_planks); }
    setW(X + 3, base + 2, Z, ID.glowstone); setW(X + 7, base + 2, Z, ID.glowstone);   // 현관 등
    // 간판(서쪽 골목, 실사 좌측 간판): 울타리 + 양털 판
    setW(X - 1, base + 2, Z + 2, ID.oak_fence); setW(X - 1, base + 3, Z + 2, ID.wool_white != null ? ID.wool_white : WH);
    // 굴뚝(뒤편 능선)
    for (let y = 5; y <= 9; y++) setW(X + 8, base + y, Z + 6, ID.cobblestone);
    setW(X + 8, base + 10, Z + 6, 0);
    // 내부 홀: 카운터 + 벽난로 + 탁자 2 + 술통(다크오크) + 샹들리에
    for (let dx = 2; dx <= 5; dx++) setW(X + dx, base, Z + Dd - 2, ID.oak_planks);   // 카운터
    setW(X + Wd - 2, base, Z + Dd - 2, ID.cobblestone); setW(X + Wd - 2, base + 1, Z + Dd - 2, ID.glowstone);   // 벽난로
    setW(X + 1, base, Z + 1, DK); setW(X + 1, base + 1, Z + 1, DK);   // 술통 더미
    setW(X + 2, base, Z + 1, DK);
    for (const [tx, tz] of [[4, 3], [7, 2]]) { setW(X + tx, base, Z + tz, ID.oak_log); setW(X + tx, base + 1, Z + tz, slabIdFor(ID.oak_planks) != null ? slabIdFor(ID.oak_planks) : ID.oak_planks); }
    setW(X + 5, base + 3, Z + 4, ID.oak_fence); setW(X + 5, base + 2, Z + 4, ID.glowstone);   // 샹들리에
  }
  function buildHubCastle() {
    const CX = 150, CZ = 96, HW = 13, HD = 11;         // 중심/반폭/반깊이
    const base = surfaceTop(CX, CZ);
    // 부지 정리: 성 볼륨 + 주변 1칸을 공기로(나무/덤불 제거), 바닥은 석재 기단으로 평탄화
    for (let x = CX - HW - 2; x <= CX + HW + 2; x++) for (let z = CZ - HD - 2; z <= CZ + HD + 2; z++) {
      for (let y = base - 3; y <= base + 22; y++) setW(x, y, z, 0);
      for (let y = Math.max(2, base - 6); y <= base - 1; y++) setW(x, y, z, ID.stone);
      setW(x, base - 1, z, Math.abs(x - CX) <= HW && Math.abs(z - CZ) <= HD ? ID.stone_bricks : ID.grass);
    }
    const wallId = (x, y, z) => (hash3(x, y, z) < 0.12 ? ID.mossy_stone_bricks : hash3(x, y + 7, z) < 0.08 ? ID.cracked_stone_bricks : ID.stone_bricks);
    // 성벽(높이 9) + 총안(crenellation) + 창(유리)
    for (let x = CX - HW; x <= CX + HW; x++) for (let z = CZ - HD; z <= CZ + HD; z++) {
      const onEdge = x === CX - HW || x === CX + HW || z === CZ - HD || z === CZ + HD;
      if (!onEdge) continue;
      for (let y = 0; y < 9; y++) {
        let id = wallId(x, base + y, z);
        if (y >= 3 && y <= 4 && ((Math.abs(x - CX) % 5 === 0 && (z === CZ - HD || z === CZ + HD)) || (Math.abs(z - CZ) % 5 === 0 && (x === CX - HW || x === CX + HW)))) id = ID.glass;
        setW(x, base + y, z, id);
      }
      if ((x + z) % 2 === 0) setW(x, base + 9, z, ID.stone_bricks);   // 총안 요철
    }
    // 코너 탑 4기(r2, 높이 15, 꼭대기 발광)
    for (const [tx, tz] of [[CX - HW, CZ - HD], [CX + HW, CZ - HD], [CX - HW, CZ + HD], [CX + HW, CZ + HD]]) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.hypot(dx, dz) > 2.4) continue;
        const ring = Math.hypot(dx, dz) > 1.4;
        for (let y = 0; y < 15; y++) if (ring) setW(tx + dx, base + y, tz + dz, wallId(tx + dx, base + y, tz + dz));
        setW(tx + dx, base + 15, tz + dz, ring && (dx + dz) % 2 === 0 ? ID.stone_bricks : 0);
      }
      setW(tx, base + 15, tz, ID.glowstone);   // 탑 꼭대기 등불
    }
    // 정문(남쪽, 광장 방향): 3폭 아치 + 다크오크 문설주 + 진입로
    for (let dx = -1; dx <= 1; dx++) for (let y = 0; y < 4; y++) setW(CX + dx, base + y, CZ + HD, 0);
    setW(CX - 2, base + 4, CZ + HD, ID.dark_oak_log); setW(CX + 2, base + 4, CZ + HD, ID.dark_oak_log);
    for (let dx = -1; dx <= 1; dx++) setW(CX + dx, base + 4, CZ + HD, ID.mossy_stone_bricks);
    for (let i = 1; i <= 10; i++) { const pz = CZ + HD + i; const pt = surfaceTop(CX, pz); for (let dx = -1; dx <= 1; dx++) setW(CX + dx, pt - 1, pz, i % 4 ? ID.gravel : ID.cobblestone); }
    // 알현실 인테리어: 레드카펫(양털) + 석영 옥좌 + 연회 탁자 + 횃불 벽 + 2층 회랑
    for (let z = CZ - HD + 2; z <= CZ + HD - 2; z++) for (let dx = -1; dx <= 1; dx++) setW(CX + dx, base, z, ID.wool_red);
    const tz0 = CZ - HD + 3;
    setW(CX, base, tz0, ID.quartz_block); setW(CX, base + 1, tz0, ID.quartz_block); setW(CX - 1, base + 1, tz0, ID.purpur); setW(CX + 1, base + 1, tz0, ID.purpur);   // 옥좌
    setW(CX - 1, base, tz0 + 1, ID.quartz_block); setW(CX + 1, base, tz0 + 1, ID.quartz_block);
    for (let i = 0; i < 5; i++) { setW(CX - 5, base, CZ - 2 + i, ID.oak_planks); setW(CX + 5, base, CZ - 2 + i, ID.oak_planks); }   // 연회 탁자 2열
    setW(CX - 5, base + 1, CZ, ID.glowstone); setW(CX + 5, base + 1, CZ, ID.glowstone);
    for (let x = CX - HW + 1; x <= CX + HW - 1; x += 6) { setW(x, base + 5, CZ - HD + 1, ID.torch != null ? ID.torch : ID.glowstone); setW(x, base + 5, CZ + HD - 1, ID.torch != null ? ID.torch : ID.glowstone); }
    for (let x = CX - HW + 1; x <= CX + HW - 1; x++) { setW(x, base + 5, CZ - HD + 2, ID.oak_planks); setW(x, base + 5, CZ + HD - 2, ID.oak_planks); }   // 2층 회랑 바닥
    // 깃발 느낌: 정문 위 퍼퍼 배너 기둥
    setW(CX - 2, base + 6, CZ + HD, ID.purpur); setW(CX + 2, base + 6, CZ + HD, ID.purpur);
  }
  // V44: 부두 확장 — 연못 존을 실제 부두로(잔교 2기 + 계류 보트 + 어부 오두막 + 등대 말뚝)
  function buildDockPier() {
    const px = 322, pz = 322;
    const wy = surfaceTop(px, pz) - 1;   // 수면 근처 기준
    const pier = (x0, z0, dz, len) => {
      for (let i = 0; i < len; i++) {
        const z = z0 + i * dz;
        for (let dx = 0; dx <= 1; dx++) { setW(x0 + dx, wy + 1, z, ID.oak_planks); }
        if (i % 3 === 0) { setW(x0 - 1, wy + 1, z, ID.oak_fence); setW(x0 + 2, wy + 1, z, ID.oak_fence); setW(x0 - 1, wy, z, ID.oak_log); setW(x0 + 2, wy, z, ID.oak_log); }
        if (i === len - 1) { setW(x0, wy + 2, z, ID.oak_fence); setW(x0 + 1, wy + 2, z, ID.oak_fence); setW(x0, wy + 3, z, ID.glowstone); }
      }
    };
    pier(316, 318, 1, 9);    // 남향 잔교
    pier(328, 330, -1, 8);   // 북향 잔교
    // V62: 어부의 오두막 → 실사(Fisherman's_Hut.png) — 사암 등대 탑(청록 버섯갓 지붕 + 목재 발코니 칼라) +
    //   청록 줄무늬 박공 지붕의 본채 + 잔교 난간
    {
      const hx = 306, hz = 307, hy = surfaceTop(hx + 4, hz + 3);
      const PR = ID.prismarine, SS2 = ID.sandstone;
      for (let dx = -1; dx <= 11; dx++) for (let dz = -1; dz <= 7; dz++) for (let y = hy; y <= hy + 15; y++) setW(hx + dx, y, hz + dz, 0);   // 구 오두막 철거
      // 본채(7×6): 사암 벽 + 가문비 프레임 + 청록 줄무늬 박공 지붕(능선 x방향)
      for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 6; dz++) {
        setW(hx + dx, hy - 1, hz + dz, ID.spruce_planks);
        const edge = dx === 0 || dx === 6 || dz === 0 || dz === 5;
        if (!edge) continue;
        const corner = (dx === 0 || dx === 6) && (dz === 0 || dz === 5);
        for (let y = 0; y < 3; y++) setW(hx + dx, hy + y, hz + dz, corner ? ID.spruce_log : y === 1 && (dx % 3 === 1 || dz % 3 === 1) ? ID.glass : SS2);
      }
      setW(hx + 3, hy, hz + 5, 0); setW(hx + 3, hy + 1, hz + 5, 0);   // 남측 입구(연못 방향)
      setW(hx + 2, hy + 2, hz + 5, ID.glowstone);
      for (let t = 0; t <= 2; t++) for (const dz of [t - 1, 6 - t]) for (let dx = -1; dx <= 7; dx++) {
        setW(hx + dx, hy + 3 + t, hz + dz, (t % 2 === 0) ? PR : ID.spruce_planks);   // 청록/가문비 줄무늬 지붕
      }
      for (let dx = -1; dx <= 7; dx++) setW(hx + dx, hy + 6, hz + 2, PR); setW(hx + 3, hy + 6, hz + 3, PR);
      // 등대 탑(본채 동측 3×3, h10): 사암 몸통 + 목재 발코니 칼라 + 청록 버섯갓 + 정상 랜턴
      const tx = hx + 8, tz = hz + 1;
      for (let y = 0; y < 10; y++) for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
        const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
        setW(tx + dx, hy + y, tz + dz, edge ? SS2 : 0);
      }
      setW(tx + 1, hy, tz, 0); setW(tx + 1, hy + 1, tz, 0);   // 탑 입구
      setW(tx + 1, hy + 4, tz, ID.glass); setW(tx, hy + 6, tz + 1, ID.glass); setW(tx + 2, hy + 7, tz + 1, ID.glass);
      for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) {   // 발코니 칼라(오크 데크 + 난간)
        const rim = dx === -1 || dx === 3 || dz === -1 || dz === 3;
        if (rim) { setW(tx + dx, hy + 7, tz + dz, ID.oak_planks); if ((dx + dz) % 2 === 0) setW(tx + dx, hy + 8, tz + dz, ID.oak_fence); }
      }
      for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) {   // 청록 버섯갓(2단 오버행 돔)
        const d = Math.max(Math.abs(dx - 1), Math.abs(dz - 1));
        if (d <= 2) setW(tx + dx, hy + 10, tz + dz, PR);
      }
      for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) setW(tx + dx, hy + 11, tz + dz, PR);
      setW(tx + 1, hy + 12, tz + 1, PR); setW(tx + 1, hy + 13, tz + 1, ID.glowstone);   // 정상 랜턴
      setW(tx + 1, hy + 9, tz + 1, ID.glowstone);   // 등실
    }
    // 계류 보트(참나무 판자 소형 선체)
    for (let i = 0; i < 3; i++) { setW(318, wy, 330 + i, ID.oak_planks); }
    setW(318, wy + 1, 330, ID.oak_fence); setW(318, wy + 1, 332, ID.oak_fence);
  }
  // V33-B: 야생 벨트 소형 POI — 전부 좌표단위 수작업(빈 들판 채우기)
  function buildWildPOIs() {
    const gy = (x, z) => surfaceTop(x, z);
    const well = (x, z) => {   // 우물: 조약돌 링 + 기둥 + 슬래브 지붕 + 물
      const y = gy(x, z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(x + dx, y, z + dz, (dx || dz) ? ID.cobblestone : ID.water);
      setW(x - 1, y + 1, z - 1, ID.oak_fence); setW(x + 1, y + 1, z - 1, ID.oak_fence); setW(x - 1, y + 1, z + 1, ID.oak_fence); setW(x + 1, y + 1, z + 1, ID.oak_fence);
      setW(x - 1, y + 2, z - 1, ID.oak_fence); setW(x + 1, y + 2, z - 1, ID.oak_fence); setW(x - 1, y + 2, z + 1, ID.oak_fence); setW(x + 1, y + 2, z + 1, ID.oak_fence);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(x + dx, y + 3, z + dz, ID.oak_planks);
      setW(x, y + 4, z, ID.glowstone);
    };
    const cart = (x, z) => {   // 건초 수레
      const y = gy(x, z);
      setW(x, y, z, ID.oak_fence); setW(x + 2, y, z, ID.oak_fence);
      for (let dx = 0; dx <= 2; dx++) setW(x + dx, y + 1, z, ID.oak_planks);
      setW(x, y + 2, z, ID.hay_block); setW(x + 1, y + 2, z, ID.hay_block); setW(x + 1, y + 3, z, ID.hay_block);
    };
    const arch = (x, z) => {   // 무너진 아치
      const y = gy(x, z);
      for (let dy = 0; dy < 4; dy++) { setW(x, y + dy, z, dy === 3 ? ID.mossy_cobblestone : ID.stone_bricks); }
      for (let dy = 0; dy < 3; dy++) setW(x + 4, y + dy, z, dy === 2 ? ID.mossy_cobblestone : ID.stone_bricks);
      setW(x + 1, y + 3, z, ID.mossy_cobblestone);
      setW(x + 3, y, z, ID.mossy_cobblestone);   // 붕괴 잔해
      setW(x + 2, y, z + 1, ID.cobblestone);
    };
    const shrine = (x, z) => {   // 소형 사당
      const y = gy(x, z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(x + dx, y, z + dz, ID.stone_bricks);
      setW(x, y + 1, z, ID.quartz_block); setW(x, y + 2, z, ID.glowstone);
      setW(x - 1, y + 1, z - 1, ID.flower_red); setW(x + 1, y + 1, z + 1, ID.flower_yellow);
    };
    const bench = (x, z) => {   // 벤치 + 꽃 링
      const y = gy(x, z);
      setW(x, y, z, ID.oak_planks); setW(x + 1, y, z, ID.oak_planks);
      setW(x - 1, y, z, ID.oak_fence); setW(x + 2, y, z, ID.oak_fence);
      setW(x, y, z + 2, ID.flower_red); setW(x + 1, y, z + 2, ID.flower_yellow); setW(x - 1, y, z + 1, ID.tall_grass);
    };
    const campfire = (x, z) => {   // 모닥불 자리
      const y = gy(x, z);
      setW(x, y - 1, z, ID.magma != null ? ID.magma : ID.glowstone);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setW(x + dx, y - 1, z + dz, ID.cobblestone);
      setW(x + 1, y, z + 1, ID.oak_log); setW(x - 1, y, z - 1, ID.oak_log);
    };
    // 수작업 좌표 18곳(기존 구조물·도로와 겹치지 않는 개활지)
    well(196, 170); well(282, 148); well(150, 244);
    cart(296, 212); cart(308, 248); cart(268, 234);
    arch(116, 258); arch(106, 250); arch(174, 296);
    shrine(256, 140); shrine(312, 270); shrine(178, 306);
    bench(208, 298); bench(240, 298); bench(298, 206); bench(148, 196);
    campfire(202, 334); campfire(252, 322);
  }
  // V33-D: 광장 4방향 대문 — 실제 허브처럼 마을 경계에 큰 게이트 아치(수작업)
  function buildPlazaGates() {
    const gate = (cx, cz, axis) => {   // 7폭 석재 아치 + 등불 + 깃발(양털)
      const y = 20;
      for (let off = -3; off <= 3; off++) {
        const x = axis === 'x' ? cx + off : cx, z = axis === 'x' ? cz : cz + off;
        if (Math.abs(off) === 3) { for (let dy = 0; dy < 5; dy++) setW(x, y + dy, z, dy === 4 ? ID.stone_bricks : (dy === 3 ? ID.mossy_cobblestone : ID.stone_bricks)); setW(x, y + 5, z, ID.oak_fence); setW(x, y + 6, z, ID.wool_red != null ? ID.wool_red : ID.bricks); }
        else { setW(x, y + 4, z, ID.stone_bricks); if (off === 0) setW(x, y + 5, z, ID.glowstone); }
      }
      // 등불 기둥 옆
      const lx = axis === 'x' ? cx - 4 : cx + 1, lz = axis === 'x' ? cz + 1 : cz - 4;
      setW(lx, y, lz, ID.oak_fence); setW(lx, y + 1, lz, ID.glowstone);
    };
    gate(224, 202, 'x');   // 북문(인챈트 탑 방향)
    gate(224, 248, 'x');   // 남문(시장 방향)
    gate(202, 224, 'z');   // 서문
    gate(248, 224, 'z');   // 동문
  }
  // V33-C: 광장 건물 외관 완성 — 굴뚝/창가 화단/문앞 등불/궤짝(좌표단위)
  function buildPlazaFinish() {
    const chimney = (x, z, yTop) => { for (let y = yTop; y < yTop + 3; y++) setW(x, y, z, ID.cobblestone); setW(x, yTop + 3, z, 0); };
    const lantern = (x, z) => { const y = surfaceTop(x, z); setW(x, y, z, ID.oak_fence); setW(x, y + 1, z, ID.glowstone); };
    const crates = (x, z) => { const y = surfaceTop(x, z); setW(x, y, z, ID.oak_planks); setW(x + 1, y, z, ID.oak_planks); setW(x, y + 1, z, ID.oak_planks); setW(x + 1, y, z + 1, ID.hay_block); };
    const windowBox = (x, y, z) => { setW(x, y, z, ID.oak_leaves); };
    chimney(202, 236, 26); chimney(192, 208, 25);   // 상점/미니언 굴뚝 (V57: 펫 상점 굴뚝은 새 지붕과 충돌해 제거)
    lantern(203, 243); lantern(206, 243);      // 상점 문앞
    lantern(246, 242); lantern(249, 242);      // 펫 상점 문앞
    lantern(210, 249); lantern(233, 249);      // 제작소/강화소 문앞
    crates(197, 231); crates(252, 232); crates(228, 214);   // 상점 옆/펫 옆/대장간 옆 궤짝
    windowBox(199, 21, 236); windowBox(199, 21, 239); windowBox(253, 21, 236);   // 창가 화단
    windowBox(212, 21, 244); windowBox(235, 21, 244);
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
    buildDomedHall(240, 200, 5, 20, {   // V52: 실제 은행(Bank.png) 대조 — 다크오크 곡면 + 금 밴드/창(금광석 악센트)
      wall: ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.sandstone, accent: ID.gold_ore, dome: ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.quartz_block, floor: ID.polished_andesite, gdir: 1,
      feature: (cx, cz, base) => {   // 중앙 금고: 금광석 + 울타리 창살 + 발광
        setW(cx, base, cz, ID.gold_ore); setW(cx, base + 1, cz, ID.gold_ore);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { setW(cx + dx, base, cz + dz, ID.oak_fence); setW(cx + dx, base + 1, cz + dz, ID.oak_fence); }
        setW(cx, base + 2, cz, ID.glowstone);
      },
    });
    buildHouse(190, 206, 9, 7, 20, ID.oak_planks, ID.spruce_planks);       // 미니언 관리소
    buildPetCare(244, 234);   // V57: 실사(Pet_Care.png) — 박공 정면 프리즈머린 발자국 패널 + 구리색 급경사 지붕 + 개방 스토어프런트 + 건초 더미
    buildAuctionTemple(208, 212);   // V56: 실사(Auction_House.png) — 신전풍 파사드. 내 섬 포탈(210,224) 앞마당을 침범하지 않게 광장 북서쪽 배치
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
    buildGuildHall();   // V20-V: 손 배치 대형 랜드마크(모험가 길드 대회관)
    buildClocktower();  // V20-AL: 손 배치 수직 랜드마크(대시계탑) — 허브 동측 광장
    buildMarketStalls(); // V20-AM: 손 배치 시장 노점 거리 — 허브 남측
    buildHeroGarden();   // V20-AN: 손 배치 영웅 동상 정원 — 허브 서측
    buildObservatory();  // V20-AP: 손 배치 원형 천문 관측탑 — 허브 북동측
    buildGrandFountain(); // V20-AQ: 손 배치 대형 3단 분수 — 허브 북서측
    buildCathedral();    // V20-AR: 손 배치 대성당(고딕 신전) — 허브 남측
    // V24: buildZiggurat() 제거 — 84칸 옆 buildZigguratV6(던전 입구)와 실루엣 중복(감사 #7). V6 쪽만 유지
    buildMageTower();    // V20-AT: 손 배치 뒤틀린 마법사 탑(부유 룬 고리) — 허브 남서측
    buildShopDetails();  // V20-AV(1차): 도시 중심 상점 인테리어/아웃테리어(업종별 가구·진열·차양)
    buildDowntown();     // V20-AU(1차): 도시 중심 다운타운 — 허허벌판 제거(포장 도로+가로등+화단+시장 소품+우물)
    buildHubWilds();     // V20-AW(2차): 허브 메인섬 야생 — 빈 잔디 허허벌판에 나무숲·바위·꽃 메도우·덤불 손 배치
  }
  // V21-D5: 허브 명명 건물 인테리어 정밀화 — 좌표 한 칸씩 손 배치.
  //   실제 스카이블럭 허브의 은행(창구·금고실)/도서관(서가·열람석)/경매장(매물 전시대)/커뮤니티 게시판 감성.
  function buildHubInteriors() {
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const glow = ID.glowstone, book = ID.bookshelf != null ? ID.bookshelf : ID.oak_planks;
    const slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks, log = ID.oak_log;
    const wr = ID.wool_red != null ? ID.wool_red : ID.bricks, ch = ID.chiseled_stone_bricks;
    // ── ① 은행 돔(240,200 r5, base20) 내부: 창구 카운터 호 + 금고실 벽(금광석 격납) + 레드카펫 + 샹들리에 ──
    for (let x = 238; x <= 242; x++) S(x, 20, 202, slab);                       // 남측 창구 카운터(입구 방향)
    S(237, 20, 202, log); S(243, 20, 202, log);                                  // 카운터 양끝 기둥
    for (let x = 238; x <= 242; x++) if (x !== 240) S(x, 20, 197, ch);           // 북측 금고실 벽(중앙 금고 뒤)
    S(238, 21, 197, ID.gold_ore); S(242, 21, 197, ID.gold_ore); S(240, 21, 197, ch);   // 격납 금궤
    for (let z = 202; z <= 204; z++) S(240, 19, z, wr);                          // 입구→창구 레드카펫
    S(240, 23, 200, glow); S(238, 23, 202, glow); S(242, 23, 198, glow);         // 샹들리에(비대칭 3점)
    // ── ② 인챈트 탑 1층(218,186 11×9) → 왕립 도서관: 서가 벽 + 열람 탁자 2 + 낭독대 + 보라 융단 ──
    for (let x = 220; x <= 226; x++) { S(x, 20, 187, book); S(x, 21, 187, book); }   // 북벽 서가 2단
    for (let z = 188; z <= 192; z++) { S(219, 20, z, book); S(227, 20, z, book); if (z % 2 === 0) { S(219, 21, z, book); S(227, 21, z, book); } }   // 동서 서가(상단 들쭉)
    for (const tx of [221, 225]) { S(tx, 20, 190, log); S(tx, 21, 190, slab); S(tx + 1, 21, 190, slab); }   // 열람 탁자 2개
    S(223, 20, 192, log); S(223, 21, 192, book);                                  // 낭독대(입구 쪽)
    for (let x = 222; x <= 224; x++) for (let z = 189; z <= 191; z++) S(x, 19, z, ID.purpur);   // 보라 융단
    S(223, 22, 190, glow); S(220, 22, 188, glow);                                 // 서고 조명
    // V56: 실사(Library.png) — 서가 뒤 보라 벽 패널 + 중앙 인챈트 테이블(레드 카펫) + 천장 샹들리에
    for (let x = 220; x <= 226; x++) S(x, 22, 187, ID.terracotta_purple != null ? ID.terracotta_purple : ID.purpur);   // 북벽 상단 보라 패널
    for (let x = 222; x <= 224; x++) for (let z = 189; z <= 191; z++) S(x, 19, z, ID.wool_red != null ? ID.wool_red : ID.purpur);   // 레드 카펫(융단 교체)
    S(223, 20, 190, ID.obsidian);                                                  // 인챈트 테이블 몸통
    S(222, 20, 189, ID.prismarine); S(224, 20, 191, ID.prismarine);                // 다이아 코너 장식
    S(223, 23, 190, ID.oak_fence); S(223, 22, 190, glow);                          // 샹들리에(로프+발광)
    // ── ③ 경매장 신전(208,212) 매물 전시대 3기: 석영 대 + 색양털 '매물' ──
    const disp = [[206, 212, ID.wool_yellow != null ? ID.wool_yellow : glow], [210, 212, ID.wool_blue != null ? ID.wool_blue : glow], [208, 210, wr]];
    for (const [px, pz, cap] of disp) { S(px, 20, pz, ID.quartz_block); S(px, 21, pz, cap); }
    // ── ④ 커뮤니티 게시판(광장 남서 모퉁이): 통나무 지주 + 다크오크 판 + 등불 ──
    {
      const bx = 216, bz = 231, gy = surfaceTop(bx, bz);
      const dk = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.oak_planks;
      S(bx, gy, bz, log); S(bx + 3, gy, bz, log); S(bx, gy + 1, bz, log); S(bx + 3, gy + 1, bz, log);
      for (let dx = 0; dx <= 3; dx++) { S(bx + dx, gy + 2, bz, dk); S(bx + dx, gy + 3, bz, dk); }
      S(bx + 1, gy + 3, bz - 1, glow);                                            // 게시판 등
      S(bx + 1, gy + 2, bz, ID.wool_white != null ? ID.wool_white : dk); S(bx + 2, gy + 3, bz, ID.wool_yellow != null ? ID.wool_yellow : dk);   // 공고 쪽지 2장
    }
  }
  // V20-AW 2차: 허브 메인섬 야생 — 좌표 한 칸씩 손 배치(해시 결정). 빈 잔디 허허벌판만 감지해
  //   나무숲·바위 노두·꽃 메도우·덤불을 흩뿌린다. 코어·건물·포장·급경사는 자동 제외.
  function buildHubWilds() {
    const isGrass = (id) => id === ID.grass;
    const clearAbove = (x, z, t, n) => { for (let y = t; y < t + n; y++) if (getBlockLocal(x, y, z) !== 0) return false; return true; };
    const flowers = [ID.wool_red, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white, ID.wool_pink != null ? ID.wool_pink : ID.wool_red, ID.wool_blue != null ? ID.wool_blue : ID.wool_white];
    const tg = ID.tall_grass, moss = ID.mossy_cobblestone, cob = ID.cobblestone, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves;
    for (let x = 96; x <= 352; x += 7) for (let z = 96; z <= 352; z += 7) {
      if (x >= 184 && x <= 262 && z >= 178 && z <= 258) continue;   // V24: 다운타운 실제 포장 범위(186-258/182-256)에 맞춤 — 맨땅 해자 링 제거(감사 #17)
      const t = surfaceTop(x, z), g = t - 1;
      if (!isGrass(getBlockLocal(x, g, z))) continue;               // 빈 잔디만
      if (getBlockLocal(x, t, z) !== 0) continue;
      const h = hash3(x, 17, z);
      // 저사양 배려 + 걷기 보장: 나무/바위/덤불(고체)은 희소하게, 대부분은 비고체·저비용 키큰풀(밟고 통과)
      // V83: 허브 야생 나무 심기 폐기(실제 허브엔 숲 구역 외 파밍 나무 없음)
      if (h < 0.06) {   // 바위 노두(이끼/돌/안산암, 비대칭 — 드묾)
        setW(x, t, z, moss); if (hash3(x, 21, z) < 0.6) { setW(x + 1, t, z, cob); setW(x, t + 1, z, ((x + z) & 1) ? moss : and_); }
      } else if (h < 0.34) {   // 키큰 풀 메도우(비고체 — 밟고 통과, 저비용)
        if (tg != null) { setW(x, t, z, tg); if (hash3(x, 24, z) < 0.45) setW(x + 1, t, z, tg); if (hash3(x, 27, z) < 0.3) setW(x, t, z + 1, tg); }
      } else if (h < 0.38) {   // 덤불(잎 1칸 — 드묾)
        setW(x, t, z, leaf);
      }
    }
  }
  // V20-AV 1차: 도시 중심 상점 인테리어/아웃테리어 — 좌표 한 칸씩 손 배치. buildHouse 상점 5곳
  //   (floor=base-1, 실내 base~base+2, 문=+z 중앙)을 업종별 가구·진열·차양으로 채운다.
  function buildShopDetails() {
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const glow = ID.glowstone, book = ID.bookshelf != null ? ID.bookshelf : ID.oak_planks, plank = ID.oak_planks;
    const slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : plank, log = ID.oak_log, fence = ID.oak_fence, water = ID.water;
    const shelf = (x0, x1, y, z, items) => { let i = 0; for (let x = x0; x <= x1; x++) S(x, y, z, items[i++ % items.length]); };
    const counter = (x0, x1, y, z) => { for (let x = x0; x <= x1; x++) S(x, y, z, slab); };
    const rug = (x0, x1, y, z, col) => { for (let x = x0; x <= x1; x++) S(x, y, z, col); };
    const awning = (x0, x1, y, z, col) => { for (let x = x0; x <= x1; x++) S(x, y, z, col); };
    // 1) 상점(200,234,10,8) — 잡화점: 뒷벽 진열장 + 카운터 + 농산물 코너 + 붉은 융단/차양
    shelf(202, 206, 20, 235, [book, ID.hay_block, ID.pumpkin, ID.melon, book]);
    shelf(202, 206, 21, 235, [book, book, ID.pumpkin, book, book]);
    counter(202, 206, 20, 237); S(201, 20, 237, log); S(207, 20, 237, log);
    S(207, 20, 236, ID.pumpkin); S(207, 20, 235, ID.melon); S(207, 21, 236, ID.hay_block);
    rug(203, 205, 19, 239, ID.wool_red != null ? ID.wool_red : plank); S(204, 22, 238, glow);
    awning(202, 207, 22, 242, ID.wool_red != null ? ID.wool_red : ID.bricks); S(201, 21, 242, plank); S(208, 21, 242, plank);
    // 2) 미니언 관리소(190,206,9,7) — 공방: 부품 진열(철/레드스톤/금) + 작업대 + 미니언 상 + 갈색 차양
    shelf(192, 196, 20, 207, [ID.iron_ore, ID.redstone_ore, ID.iron_ore, ID.gold_ore, ID.redstone_ore]);
    counter(192, 196, 20, 209); S(193, 20, 210, plank); S(196, 20, 210, ID.chest != null ? ID.chest : plank);
    S(195, 20, 208, ID.iron_ore); S(195, 21, 208, ID.pumpkin); S(194, 22, 209, glow);   // 미니언 상(몸+호박 머리)
    awning(191, 197, 22, 213, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.bricks);
    // 3) 펫 상점(244,234,9,7) — 반려: 건초 침대 + 물그릇 + 뼈 진열 + 울타리 우리 + 노란 차양
    S(246, 20, 236, ID.hay_block); S(246, 20, 237, ID.wool_white); S(250, 20, 236, ID.hay_block);
    S(250, 20, 238, log); S(250, 21, 238, slab);   // 물그릇대
    S(249, 20, 235, ID.quartz_block); S(248, 20, 235, ID.quartz_block);   // 뼈 진열(석영)
    S(247, 20, 238, fence); S(246, 20, 238, fence); S(247, 22, 237, glow);
    // 4) 제작소(208,244,8,6) — 작업장: 제작대 + 모루 + 도구걸이 + 카운터 + 차양
    S(210, 20, 245, plank); S(211, 20, 245, plank); S(210, 21, 245, ID.oak_trapdoor != null ? ID.oak_trapdoor : plank);
    S(213, 20, 245, ID.iron_ore); S(213, 21, 245, ID.iron_ore);   // 모루
    S(209, 20, 246, fence); S(209, 21, 246, fence); S(209, 20, 247, ID.cobblestone);   // 도구걸이
    counter(210, 213, 20, 247); S(211, 22, 246, glow);
    awning(209, 214, 22, 250, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.bricks);
    // 5) 스타포스 강화소(230,244,8,6) — 각성소: 흑요석 제단 + 책 + 별빛 발광 + 자수정 융단 + 보라 차양
    S(232, 20, 246, ID.obsidian); S(232, 21, 246, book); S(233, 20, 246, ID.obsidian);
    S(234, 21, 245, glow); S(235, 22, 246, ID.purpur); S(231, 22, 247, glow);   // 별빛
    rug(232, 234, 19, 248, ID.purpur); S(233, 22, 246, glow);
    awning(231, 236, 22, 250, ID.purpur);
  }
  // V20-AU 1차: 도시 중심 다운타운 채우기 — 좌표 한 칸씩 손 배치. 기존 건물/광장은 건드리지 않고
  //   (열린 잔디/흙 지면만 감지) 코어 거리의 허허벌판을 석재 포장 + 가로등·화단·시장 소품·우물로 메운다.
  function buildDowntown() {
    const cob = ID.cobblestone, sb = ID.stone_bricks, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const fence = ID.oak_fence, glow = ID.glowstone, leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves, log = ID.oak_log;
    const slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks, plank = ID.oak_planks, water = ID.water;
    const flowers = [ID.wool_red, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white, ID.wool_pink != null ? ID.wool_pink : ID.wool_red, ID.wool_blue != null ? ID.wool_blue : ID.wool_white];
    const isGround = (id) => id === ID.grass || id === ID.dirt;
    const openStreet = (x, z) => { const t = surfaceTop(x, z); return isGround(getBlockLocal(x, t - 1, z)) && getBlockLocal(x, t, z) === 0 && getBlockLocal(x, t + 1, z) === 0 && getBlockLocal(x, t + 2, z) === 0; };
    const X0 = 186, X1 = 258, Z0 = 182, Z1 = 256;
    // ── 1) 도로 포장: 코어 내 '열린 지면'만 석재 포장(광장/건물/이미 포장은 자동 제외) ──
    for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
      const t = surfaceTop(x, z), g = t - 1;
      if (!isGround(getBlockLocal(x, g, z))) continue;      // 잔디/흙(빈 거리)만
      if (getBlockLocal(x, t, z) !== 0) continue;           // 위 막힘(건물/나무) 스킵
      const r = (x * 3 + z) % 13;
      setW(x, g, z, r === 0 ? and_ : ((x + z) & 1) ? sb : cob);   // 3색 석재 포장 무늬
    }
    // ── 2) 가로등(8칸 그리드, 열린 거리에만) ──
    for (let x = X0 + 6; x <= X1 - 6; x += 8) for (let z = Z0 + 6; z <= Z1 - 6; z += 8) {
      if (!openStreet(x, z)) continue; const t = surfaceTop(x, z);
      setW(x, t, z, fence); setW(x, t + 1, z, fence); setW(x, t + 2, z, glow);
    }
    // ── 3) 화단(12칸 오프셋 그리드): 통나무 테 + 잎 + 꽃 ──
    for (let x = X0 + 10; x <= X1 - 10; x += 12) for (let z = Z0 + 12; z <= Z1 - 12; z += 12) {
      if (!openStreet(x, z)) continue; const t = surfaceTop(x, z);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { if (openStreet(x + ox, z + oz)) { setW(x + ox, t, z + oz, leaf); setW(x + ox, t + 1, z + oz, flowers[(x + z + ox + oz) % 4]); } }
    }
    // ── 4) 시장 소품(통·궤짝)·벤치: 큐레이트 좌표, 열린 곳에만 ──
    const props = [
      { x: 206, z: 250, k: 'crate' }, { x: 244, z: 250, k: 'barrel' }, { x: 196, z: 218, k: 'bench' },
      { x: 252, z: 214, k: 'crate' }, { x: 214, z: 200, k: 'barrel' }, { x: 234, z: 234, k: 'bench' },
      { x: 200, z: 250, k: 'barrel' }, { x: 248, z: 240, k: 'crate' },
    ];
    for (const p of props) { if (!openStreet(p.x, p.z)) continue; const t = surfaceTop(p.x, p.z);
      if (p.k === 'crate') { setW(p.x, t, p.z, plank); setW(p.x + 1, t, p.z, plank); setW(p.x, t + 1, p.z, plank); }
      else if (p.k === 'barrel') { setW(p.x, t, p.z, log); setW(p.x, t + 1, p.z, slab); }
      else { setW(p.x, t, p.z, slab); setW(p.x + 1, t, p.z, slab); }   // 벤치
    }
    // ── 5) 마을 우물(큐레이트, 열린 곳에만): 조약돌 테 + 물 + 도르래 지붕 ──
    for (const [wx, wz] of [[198, 246], [250, 200]]) {
      if (!openStreet(wx, wz)) continue; const t = surfaceTop(wx, wz);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const edge = dx !== 0 || dz !== 0; setW(wx + dx, t, wz + dz, edge ? cob : water); if (edge) setW(wx + dx, t + 1, wz + dz, dx === 0 || dz === 0 ? 0 : cob); }
      setW(wx - 1, t + 1, wz - 1, fence); setW(wx + 1, t + 1, wz - 1, fence); setW(wx - 1, t + 2, wz - 1, fence); setW(wx + 1, t + 2, wz - 1, fence);   // 지붕 기둥
      for (let dx = -1; dx <= 1; dx++) setW(wx + dx, t + 3, wz - 1, slab);   // 도르래 지붕
      setW(wx, t + 2, wz - 1, glow);   // 우물 랜턴
    }
  }
  // V20-AT: 마법사 탑 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 나선으로 뒤틀려 오르는 탑신 +
  //   부유 자수정 룬 고리 + 정상 아케인 왕관. 직선 탑들과 다른 '뒤틀린' 실루엣. 허브 남서(150,264).
  function buildMageTower() {
    const cx = 150, cz = 264, gy = 19;
    flattenSite(141, 255, 159, 273, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, pur = ID.purpur, glow = ID.glowstone, glass = ID.glass, book = ID.bookshelf != null ? ID.bookshelf : sb;
    const st = (f) => (ID['purpur_stairs_' + f] != null ? ID['purpur_stairs_' + f] : pur);
    // ── 팔각 기단(반경 5) + 4방 발광 룬석 ──
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { if (dx * dx + dz * dz > 26) continue; B(dx, 0, dz, ((dx + dz) & 1) ? sb : pur); }
    for (const [ox, oz] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { B(ox, 1, oz, pur); B(ox, 2, oz, glow); }
    // ── 기부 서재방(반경 3, y1~4, 남문 + 유리창 + 책장 + 발광) ──
    for (let dy = 1; dy <= 4; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const r = dx * dx + dz * dz; if (!(r >= 6 && r <= 11)) continue;
      const door = dz >= 2 && Math.abs(dx) <= 1 && dy <= 2;
      const win = dy === 3 && ((Math.abs(dx) === 3 && dz === 0) || (Math.abs(dz) === 3 && dx === 0));
      if (door) continue; B(dx, dy, dz, win ? glass : sb);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= 8) B(dx, 5, dz, pur);   // 서재 천장
    B(-2, 1, -2, book); B(-2, 2, -2, book); B(2, 1, -2, book); B(0, 2, 0, glow);   // 책장 + 조명
    // ── 뒤틀린 탑신(y6~24): 3×3 심이 나선으로 중심 이동, 자수정 띠·룬 발광 ──
    let topY = 6, topOx = 0, topOz = 0;
    for (let y = 6; y <= 24; y++) {
      const a = (y - 6) * 0.5, r = Math.min(1.7, (y - 6) * 0.28);
      const ox = Math.round(Math.cos(a) * r), oz = Math.round(Math.sin(a) * r);
      const band = ((y - 6) % 4 === 0);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        if (edge) B(ox + dx, y, oz + dz, band ? pur : sb);
      }
      if (y % 3 === 0) B(ox + 1, y, oz, glow);   // 외벽 룬 발광
      topY = y; topOx = ox; topOz = oz;
    }
    // ── 정상 아케인 왕관(개방 고리 + 자수정 첨정 + 발광) ──
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(topOx + dx, topY + 1, topOz + dz, ID.oak_fence);
    for (let i = 1; i <= 3; i++) B(topOx, topY + i, topOz, pur); B(topOx, topY + 4, topOz, glow);   // 첨정 + 발광
    // ── 부유 자수정 룬 고리(탑 주위 공중, 비대칭 3고리) — 손 배치 ──
    const rings = [[6, 12], [-7, 15], [5, 18]];
    rings.forEach(([rr, ry], k) => {
      for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; const x = Math.round(Math.cos(ang) * (k === 1 ? 6 : 5)), z = Math.round(Math.sin(ang) * (k === 1 ? 6 : 5)); B(x, ry, z, (a % 2) ? pur : 0); }   // 점선 고리
      B(rr < 0 ? -6 : 6, ry, 0, glow);   // 고리 발광점
    });
  }
  // V20-AS: 지구라트(공중정원) — 좌표 한 칸씩 손 배치(대칭 함수 아님). 5단 계단식 피라미드 +
  //   전면 대계단 + 층마다 매달린 녹지/꽃 + 물못 + 정상 신전. 탑/홀과 다른 '계단식' 실루엣.
  function buildZiggurat() {
    const cx = 300, cz = 300, gy = 19;
    flattenSite(288, 288, 312, 312, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const ss = ID.sandstone, sm = ID.smooth_stone != null ? ID.smooth_stone : ID.stone, sb = ID.stone_bricks;
    const leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves, glow = ID.glowstone, water = ID.water, gold = ID.gold_ore, q = ID.quartz_block;
    const st = (f) => (ID['sandstone_stairs_' + f] != null ? ID['sandstone_stairs_' + f] : ss);
    const flowers = [ID.wool_red, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white, ID.wool_pink != null ? ID.wool_pink : ID.wool_red];
    // ── 5단 솔리드 계단(반경 9→1, 각 2단 높이) ──
    for (let t = 0; t <= 4; t++) {
      const h = 9 - 2 * t, y0 = 1 + 2 * t, y1 = 2 + 2 * t;
      for (let dx = -h; dx <= h; dx++) for (let dz = -h; dz <= h; dz++) {
        const edge = Math.abs(dx) === h || Math.abs(dz) === h;
        for (let y = y0; y <= y1; y++) B(dx, y, dz, edge ? ss : sm);
      }
      // 노출 테라스 링 장식(윗면): 석재벽돌 갓돌 + 매달린 녹지/꽃(전면 계단 트렌치는 비움)
      const inner = h - 2;
      for (let dx = -h; dx <= h; dx++) for (let dz = -h; dz <= h; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= inner) continue;   // 다음 단이 덮는 안쪽은 제외
        if (Math.abs(dx) <= 1 && dz < 0) continue;                     // 전면 대계단 자리 비움
        const rim = Math.abs(dx) === h || Math.abs(dz) === h;
        if (rim) { B(dx, y1 + 1, dz, sb); if ((dx + dz) % 3 === 0) B(dx, y1 + 2, dz, leaf); }   // 갓돌 난간 + 매달린 잎
        else if ((dx * 7 + dz) % 5 === 0) B(dx, y1 + 1, dz, flowers[(dx + dz + 30) % 3]);        // 테라스 꽃
      }
    }
    // ── 전면 대계단(중앙, 지면→정상, 계단 + 머리 위 트렌치 클리어) ──
    for (let s = 0; s <= 10; s++) { const dz = -10 + s, y = s; B(0, y, dz, st(2)); B(-1, y, dz, st(2)); for (let hy = y + 1; hy <= y + 3; hy++) { B(0, hy, dz, 0); B(-1, hy, dz, 0); } B(0, y - 1, dz, ss); B(-1, y - 1, dz, ss); }
    // 계단 양옆 발광 난간(4칸마다)
    for (let s = 1; s <= 9; s += 3) { const dz = -10 + s; B(-2, s, dz, ID.sandstone_slab != null ? ID.sandstone_slab : ss); B(-2, s + 1, dz, glow); B(1, s, dz, ID.sandstone_slab != null ? ID.sandstone_slab : ss); B(1, s + 1, dz, glow); }
    // ── 층별 물못(테라스 2곳, 벽 있는 담수 — 넘침 없음) ──
    for (const [tx, tz, ty] of [[5, 4, 3], [-4, -5, 3], [3, -3, 5]]) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1; B(tx + dx, ty, tz + dz, edge ? sb : water); } B(tx, ty + 1, tz - 1, leaf); }
    // ── 정상 신전(y11~14): 4기둥 + 지붕 + 황금 우상 + 발광 ──
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { for (let dy = 11; dy <= 13; dy++) B(ox, dy, oz, q); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 14, dz, st(dx < 0 ? 1 : dx > 0 ? 3 : dz < 0 ? 0 : 2));   // 지붕
    B(0, 14, 0, q); B(0, 11, 0, gold); B(0, 12, 0, gold); B(0, 13, 0, glow);   // 황금 우상 + 성화
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) B(ox, 11, oz, glow);   // 신전 바닥 조명
  }
  // V20-AR: 대성당 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 고딕 신전: 긴 본당 + 버트레스 +
  //   뾰족 아치창 + 장미창 + 쌍둥이 전면탑 + 실내 기둥열·제단·신도석. 허브 남측(224,300) 개방 구역.
  function buildCathedral() {
    const cx = 224, cz = 300, gy = 19;
    flattenSite(214, 289, 234, 311, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, q = ID.quartz_block, glass = ID.glass, glow = ID.glowstone, pur = ID.purpur;
    const st = (f) => (ID['stone_bricks_stairs_' + f] != null ? ID['stone_bricks_stairs_' + f] : sb);
    const rose = [ID.wool_red, ID.wool_blue != null ? ID.wool_blue : ID.lapis_ore, ID.wool_yellow != null ? ID.wool_yellow : q];
    // ── 바닥 포장(15×19) + 중앙 통로 융단 ──
    for (let dx = -7; dx <= 7; dx++) for (let dz = -9; dz <= 9; dz++) B(dx, 0, dz, ((dx + dz) & 1) ? sb : q);
    for (let dz = -9; dz <= 9; dz++) B(0, 0, dz, pur);
    // ── 본당 벽(dx ±6, dz ±8, 높이 8) — 모서리 석영 ──
    for (let dy = 1; dy <= 8; dy++) for (let dx = -6; dx <= 6; dx++) for (let dz = -8; dz <= 8; dz++) {
      if (!(Math.abs(dx) === 6 || Math.abs(dz) === 8)) continue;
      const corner = Math.abs(dx) === 6 && Math.abs(dz) === 8;
      B(dx, dy, dz, corner ? q : sb);
    }
    // ── 정면 대문(북, dz=-8): 뾰족 아치 포탈 ──
    for (let dy = 1; dy <= 4; dy++) for (let dx = -1; dx <= 1; dx++) B(dx, dy, -8, 0);
    B(-1, 5, -8, q); B(1, 5, -8, q); B(0, 6, -8, q);
    // ── 장미창(정면 상부, 반경2 원, 색유리) ──
    for (let dx = -2; dx <= 2; dx++) for (let dy = 5; dy <= 9; dy++) { const rr = Math.round(Math.hypot(dx, dy - 7)); if (rr === 2) B(dx, dy, -8, rose[(dx + dy + 3) % 3]); else if (rr < 2) B(dx, dy, -8, glass); }
    B(0, 7, -8, glow);
    // ── 측벽 뾰족 아치창(dx ±6, 버트레스 사이) ──
    for (const dz of [-5, -1, 3, 7]) for (const sx of [-6, 6]) { for (let dy = 3; dy <= 5; dy++) B(sx, dy, dz, glass); B(sx, 6, dz, q); B(sx, 2, dz, glass); }
    // ── 버트레스(x ±7 돌출, 경사 어깨) ──
    for (const dz of [-6, -3, 0, 3, 6]) for (const sx of [-7, 7]) { for (let dy = 1; dy <= 6; dy++) B(sx, dy, dz, sb); B(sx, 7, dz, st(sx < 0 ? 3 : 1)); }
    // ── 지붕(박공, 계단식 수렴, 용마루 석영) ──
    for (let dz = -8; dz <= 8; dz++) {
      B(-6, 9, dz, st(3)); B(6, 9, dz, st(1));
      B(-5, 10, dz, st(3)); B(5, 10, dz, st(1)); B(-4, 10, dz, sb); B(4, 10, dz, sb);
      B(-3, 11, dz, st(3)); B(3, 11, dz, st(1)); B(-2, 11, dz, sb); B(2, 11, dz, sb);
      B(-1, 12, dz, st(3)); B(1, 12, dz, st(1)); B(0, 12, dz, q);
    }
    for (let dz = -6; dz <= 6; dz += 4) B(0, 13, dz, glow);
    // ── 후면 앱스(dz=+8): 채광창 ──
    for (let dy = 3; dy <= 6; dy++) B(0, dy, 8, glass); B(0, 7, 8, q); B(0, 8, 8, glow);
    // ── 쌍둥이 전면탑(정면 양 모서리, 4각 탑 → 뾰족 첨탑) ──
    for (const sx of [-6, 6]) {
      const ix = sx < 0 ? 1 : -1;
      for (let dy = 1; dy <= 14; dy++) for (const [ox, oz] of [[0, 0], [ix, 0], [0, 1], [ix, 1]]) B(sx + ox, dy, -8 + oz, ((sx + ox + oz + dy) & 1) ? q : sb);
      for (const [ox, oz] of [[0, 0], [ix, 0], [0, 1], [ix, 1]]) B(sx + ox, 15, -8 + oz, (ox === 0 && oz === 0) ? sb : 0);
      B(sx, 15, -8, st(0)); B(sx, 16, -7, q); B(sx, 17, -7, q); B(sx, 18, -7, glow);
    }
    // ── 실내: 기둥열(dx ±3) + 익랑 보 + 제단 + 신도석 + 샹들리에 ──
    for (const dz of [-4, 0, 4]) for (const sx of [-3, 3]) { for (let dy = 1; dy <= 6; dy++) B(sx, dy, dz, q); B(sx, 7, dz, st(sx < 0 ? 3 : 1)); }
    for (let dx = -3; dx <= 3; dx++) B(dx, 8, 0, dx % 3 === 0 ? q : sb);
    for (let dx = -2; dx <= 2; dx++) for (let dz = 5; dz <= 7; dz++) B(dx, 1, dz, q);
    B(0, 2, 6, pur); B(0, 3, 6, glow); B(-1, 2, 6, q); B(1, 2, 6, q);
    for (const [ox, oz] of [[-2, 5], [2, 5], [-2, 7], [2, 7]]) { B(ox, 2, oz, ID.oak_fence); B(ox, 3, oz, glow); }
    for (let dz = -6; dz <= 2; dz += 2) { B(-2, 1, dz, st(2)); B(-1, 1, dz, st(2)); B(1, 1, dz, st(2)); B(2, 1, dz, st(2)); }
    for (const dz of [-4, 0, 4]) { B(0, 7, dz, ID.oak_fence); B(0, 6, dz, glow); }
    // ── 전면 진입 계단 + 안뜰 가로등 ──
    for (let dx = -2; dx <= 2; dx++) B(dx, 0, -9, st(0));
    for (const [lx, lz] of [[-8, -9], [8, -9]]) { B(lx, 1, lz, ID.oak_fence); B(lx, 2, lz, ID.oak_fence); B(lx, 3, lz, glow); }
  }
  // V20-AQ: 대형 분수 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 물이 담긴 벽 있는 다단 수반(넘침 없음).
  //   하단 수반 → 중앙 대좌 상단 수반 → 석영 분출 기둥 + 프리즈마린 토수구 4기. 허브 북서(168,190).
  function buildGrandFountain() {
    const cx = 168, cz = 190, gy = 19;
    flattenSite(160, 182, 176, 198, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, q = ID.quartz_block, water = ID.water, glow = ID.glowstone;
    const prism = ID.prismarine != null ? ID.prismarine : q, seaL = ID.sea_lantern != null ? ID.sea_lantern : glow, fence = ID.oak_fence;
    // ── 광장 포장(반경 8, 방사 무늬) ──
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) { const r = dx * dx + dz * dz; if (r > 64) continue; B(dx, 0, dz, ((dx + dz) & 1) ? sb : q); }
    // ── 하단 수반(반경 6): 바닥 y0 + 테두리 벽 y1(반경6 링) + 물 y0(벽 아래 = 넘침 없음) ──
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { const rr = Math.round(Math.hypot(dx, dz)); if (rr <= 5) { B(dx, 0, dz, prism); B(dx, 1, dz, water); } if (rr === 6) { B(dx, 1, dz, sb); B(dx, 2, dz, ((dx + dz) & 1) ? q : sb); } }   // 물반+테두리 난간
    // 하단 수반 테두리 4방 발광 기둥
    for (const [ox, oz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) { B(ox, 2, oz, seaL); }
    // ── 중앙 대좌(반경 3, y1~3 솔리드) + 상단 수반(반경 3, 물 y4, 테두리 y4) ──
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const rr = Math.round(Math.hypot(dx, dz)); if (rr <= 3) for (let dy = 1; dy <= 3; dy++) B(dx, dy, dz, ((dx + dz + dy) & 1) ? q : sb); }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const rr = Math.round(Math.hypot(dx, dz)); if (rr <= 2) B(dx, 4, dz, water); else if (rr === 3) B(dx, 4, dz, q); }   // 상단 물반 + 테두리
    // ── 석영 분출 기둥(중앙, y4~7) + 정상 물 + 발광 ──
    for (let dy = 4; dy <= 7; dy++) B(0, dy, 0, q); B(0, 8, 0, water); B(0, 9, 0, seaL);
    // ── 프리즈마린 토수구 4기(하단 수반 가장자리, 물을 뿜는 조형) ──
    for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { B(ox, 1, oz, prism); B(ox, 2, oz, prism); B(ox, 3, oz, water); B(ox + (ox < 0 ? 1 : -1), 2, oz + (oz < 0 ? 1 : -1), water); }   // 토수구 + 뿜는 물(수반 안쪽으로)
    // ── 주변 꽃 화분 + 벤치 + 가로등 ──
    const flowers = [ID.wool_red, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white, ID.wool_pink != null ? ID.wool_pink : ID.wool_red, ID.wool_blue != null ? ID.wool_blue : ID.wool_white];
    [[7, 7], [-7, 7], [7, -7], [-7, -7]].forEach(([bx, bz], k) => { B(bx, 1, bz, flowers[k]); B(bx, 0, bz, ID.grass); });   // 꽃 화분
    for (const [bx, bz, f] of [[0, -7, 0], [0, 7, 2], [-7, 0, 3], [7, 0, 1]]) B(bx, 1, bz, ID['stone_bricks_stairs_' + f] != null ? ID['stone_bricks_stairs_' + f] : sb);   // 벤치
    for (const [lx, lz] of [[-8, -3], [8, -3], [-8, 3], [8, 3]]) { B(lx, 1, lz, fence); B(lx, 2, lz, fence); B(lx, 3, lz, glow); }   // 가로등
  }
  // V20-AP: 천문 관측탑 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 각진 시계탑과 대비되는 '원통+돔'.
  //   원통 탑신 + 석영 띠 + 아치문/창 → 돔 지붕(개폐 슬릿) + 망원경. 허브 북동(264,200) 개방 구역.
  function buildObservatory() {
    const cx = 264, cz = 200, gy = 19;
    flattenSite(256, 192, 272, 208, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, q = ID.quartz_block, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const glow = ID.glowstone, fence = ID.oak_fence, pur = ID.purpur, log = ID.spruce_log;
    const ring = (r) => { const out = []; for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) if (Math.round(Math.hypot(dx, dz)) === r) out.push([dx, dz]); return out; };
    // ── 포디움(반경 6 원형) + 진입 계단 ──
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { if (dx * dx + dz * dz > 40) continue; B(dx, 0, dz, ((dx + dz) & 1) ? sb : and_); }
    for (const [ox, oz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) { B(ox, 0, oz, fence); B(ox, 1, oz, glow); }   // 포디움 가로등
    // ── 원통 탑신(반경 4, y1~14, hollow) + 석영 띠(4·9층) + 아치문(남)/창 ──
    for (let dy = 1; dy <= 14; dy++) {
      const band = (dy === 4 || dy === 9 || dy === 14);
      for (const [dx, dz] of ring(4)) {
        const door = dz >= 3 && Math.abs(dx) <= 1 && dy <= 2;         // 남면 아치문
        const win = (dy === 6 || dy === 11) && (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) && ((dx === 0) !== (dz === 0)) === false && (Math.abs(dx) >= 3 || Math.abs(dz) >= 3) && (dx === 0 || dz === 0);
        if (door) continue;
        B(dx, dy, dz, win ? ID.glass : (band ? q : sb));
      }
    }
    B(0, 3, 4, q); B(-1, 3, 4, q); B(1, 3, 4, q);   // 아치문 상인방
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { if (dx * dx + dz * dz <= 10) { B(dx, 0, dz, and_); B(dx, 7, dz, dx * dx + dz * dz <= 4 ? sb : 0); } }   // 바닥 + 중간 관측 데크(중앙만)
    B(0, 2, 0, glow); B(0, 8, 0, glow);   // 내부 조명
    // 내부 나선 계단(코벨) 1→관측층
    for (let s = 0, dy = 1; dy <= 13; dy++, s++) { const a = s * 0.9; B(Math.round(Math.cos(a) * 3), dy, Math.round(Math.sin(a) * 3), sb); }
    // ── 돔 지붕(수렴, 석영/자수정) + 개폐 슬릿(관측구) ──
    for (const [dx, dz] of ring(4)) B(dx, 15, dz, ID['quartz_block_stairs_' + (dx < 0 ? 1 : dx > 0 ? 3 : dz < 0 ? 0 : 2)] != null ? ID['quartz_block_stairs_' + (dx < 0 ? 1 : dx > 0 ? 3 : dz < 0 ? 0 : 2)] : q);   // 처마
    for (let dy = 15; dy <= 18; dy++) { const r = 18 - dy + 1; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { if (Math.round(Math.hypot(dx, dz)) !== r) continue; const slit = dx === 0 && dz <= 0;   // 북향 개폐 슬릿(열림)
      if (slit) continue; B(dx, dy, dz, ((dx + dz) & 1) ? q : pur); } }
    B(0, 19, 0, pur); B(0, 20, 0, glow);   // 돔 정점 + 발광
    // ── 망원경(관측 데크 위, 경사 배럴 + 렌즈 발광) ──
    B(1, 8, 1, log); B(1, 9, 1, log); B(2, 10, 1, fence); B(2, 11, 2, glow);   // 삼각대 + 경통 + 렌즈
    B(0, 8, 1, ID.oak_planks);   // 관측 의자
  }
  // V20-AN: 영웅 동상 정원 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 잔디 정원 + 산울타리 + 꽃밭 +
  //   중앙 블록 영웅 동상(검을 든). 허브 서측(160~176, 216~232) 개방 구역.
  function buildHeroGarden() {
    const cx = 168, cz = 224, gy = 19;
    flattenSite(159, 215, 177, 233, gy);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves, sb = ID.stone_bricks, q = ID.quartz_block;
    const glow = ID.glowstone, fence = ID.oak_fence, iron = ID.iron_ore, log = ID.oak_log;
    // ── 잔디밭(17×17) + 십자 석영/석재 산책로 ──
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      if (dx === 0 || dz === 0) B(dx, 0, dz, ((dx + dz) & 1) ? q : sb);   // 십자 산책로
      else B(dx, 0, dz, ID.grass);
    }
    // ── 산울타리(잎) 테두리 — 산책로 진입구(dx/dz=0)는 열어둠 ──
    for (let d = -8; d <= 8; d++) {
      if (Math.abs(d) > 1) { B(d, 1, -8, leaf); B(d, 2, -8, leaf); B(d, 1, 8, leaf); B(d, 2, 8, leaf); B(-8, 1, d, leaf); B(-8, 2, d, leaf); B(8, 1, d, leaf); B(8, 2, d, leaf); }
    }
    // ── 4분면 꽃밭(밝은 양털 패치) — 서로 다른 색 ──
    const beds = [[-5, -5, ID.wool_red], [5, -5, ID.wool_yellow != null ? ID.wool_yellow : ID.quartz_block], [-5, 5, ID.wool_blue != null ? ID.wool_blue : ID.lapis_ore], [5, 5, ID.wool_pink != null ? ID.wool_pink : ID.wool_red]];
    for (const [bx, bz, col] of beds) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { B(bx + dx, 0, bz + dz, ID.grass); if (col != null && (dx + dz) % 2 === 0) B(bx + dx, 1, bz + dz, col); } B(bx, 1, bz, col); }   // 꽃 패치(중앙 강조)
    // ── 중앙 동상 대좌(3×3, 2단) ──
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { B(dx, 1, dz, sb); B(dx, 2, dz, ((dx + dz) & 1) ? q : sb); }
    B(0, 1, 2, ID.stone_bricks_stairs_0 != null ? ID.stone_bricks_stairs_0 : sb);   // 대좌 계단
    // ── 블록 영웅 동상(검을 든 기사) — 다리→몸통→팔→머리→검, 손 배치 ──
    B(0, 3, 0, iron); B(0, 4, 0, iron);          // 하체(다리 합쳐 표현)
    B(0, 5, 0, ID.stone_bricks); B(0, 6, 0, ID.stone_bricks);   // 몸통(갑옷)
    B(-1, 6, 0, iron); B(1, 6, 0, iron);         // 어깨/팔
    B(-1, 5, 0, iron);                            // 왼팔 아래(방패쪽)
    B(0, 7, 0, q);                                // 머리(석영)
    B(1, 7, 0, ID.iron_ore); B(1, 8, 0, ID.iron_ore); B(1, 9, 0, glow);   // 치켜든 검(칼날 + 발광 검광)
    B(-1, 6, 1, ID.stone_bricks);                 // 방패(몸 옆)
    // ── 정원 벤치(4방) + 가로등 + 모서리 관목 나무 ──
    for (const [bx, bz, f] of [[0, -6, 0], [0, 6, 2], [-6, 0, 3], [6, 0, 1]]) { B(bx, 1, bz, ID['oak_planks_stairs_' + f] != null ? ID['oak_planks_stairs_' + f] : ID.oak_planks); }
    for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { B(lx, 1, lz, fence); B(lx, 2, lz, fence); B(lx, 3, lz, glow); }   // 가로등
    for (const [tx, tz] of [[-6, -6], [6, 6]]) { for (let y = 1; y <= 3; y++) B(tx, y, tz, log); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(tx + dx, 4, tz + dz, leaf); B(tx, 5, tz, leaf); }   // 관목 나무
  }
  // V20-AM: 시장 노점 거리 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 5개 노점이 각각 다른 업종/차양색/진열.
  //   허브 남측(광장 아래) z249~257 포장 거리 양옆에 배치. 하이픽셀 상점가 활기.
  // V24: 야생 지대 손 배치 구조물 — 마을과 외곽 존 사이 빈 들판을 볼거리로 채움("맵이 쓸데없이 크다" 해소)
  function buildWilderness() {
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    // ── 1) 풍차(172,254): 석재 탑신 + 다크오크 캡 + 양털/판자 십자 날개 ──
    {
      const cx = 172, cz = 254, gy = surfaceTop(cx, cz);
      flattenSite(cx - 3, cz - 3, cx + 3, cz + 3, gy - 1);
      for (let y = 0; y < 9; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        S(cx + dx, gy + y, cz + dz, edge ? (y % 3 === 2 ? ID.stone_bricks : ID.cobblestone) : 0);
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) S(cx + dx, gy + 9, cz + dz, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
      S(cx, gy + 10, cz, ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log);
      const dId = ID.spruce_door_c_2; if (dId != null) { S(cx, gy, cz - 2, dId); S(cx, gy + 1, cz - 2, dId); }
      S(cx - 1, gy + 4, cz - 2, ID.glass); S(cx + 1, gy + 6, cz - 2, ID.glass);
      // 날개: 정면(z-) 허브 중심(gy+7)에서 대각 4방 — 판자 축 + 양털 깃
      const hub = [cx, gy + 7, cz - 3]; S(hub[0], hub[1], hub[2], ID.oak_log);
      for (let i = 1; i <= 4; i++) {
        for (const [sx, sy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          S(hub[0] + sx * i, hub[1] + sy * i, hub[2], i <= 2 ? ID.oak_planks : (ID.wool_white != null ? ID.wool_white : ID.oak_planks));
        }
      }
      [[190, 246], [180, 262]].forEach(([lx, lz]) => lampPost(lx, lz));
    }
    // ── 2) 코티지 3채(서로 다른 수종/크기) ──
    buildHouse(266, 166, 7, 6, surfaceTop(269, 169), ID.spruce_planks, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
    buildHouse(184, 180, 6, 5, surfaceTop(187, 182), ID.birch_planks, ID.spruce_planks);
    buildHouse(260, 262, 7, 6, surfaceTop(263, 265), ID.oak_planks, ID.birch_planks);
    // ── 3) 과수원(274~292, 148~164): 참나무/자작 격자 + 울타리 테 ──
    {
      for (let x = 274; x <= 292; x += 5) for (let z = 148; z <= 164; z += 5) {
        const gy = surfaceTop(x, z); if (getBlockLocal(x, gy - 1, z) !== ID.grass) continue;
        const log = (x + z) % 2 ? ID.oak_log : ID.birch_log, leaf = (x + z) % 2 ? ID.oak_leaves : ID.oak_leaves;
        for (let i = 0; i < 3; i++) S(x, gy + i, z, log);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 2; dy <= 3; dy++)
          if (!(dx === 0 && dz === 0 && dy === 2)) S(x + dx, gy + dy, z + dz, leaf);
      }
      for (let x = 272; x <= 294; x += 2) { const g1 = surfaceTop(x, 146), g2 = surfaceTop(x, 166); S(x, g1, 146, ID.oak_fence); S(x, g2, 166, ID.oak_fence); }
    }
    // ── 4) 정자(276,276): 석재 단 + 울타리 기둥 + 계단 지붕 + 벤치 ──
    {
      const cx = 276, cz = 276, gy = surfaceTop(cx, cz);
      flattenSite(cx - 3, cz - 3, cx + 3, cz + 3, gy - 1);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) S(cx + dx, gy - 1, cz + dz, ID.smooth_stone != null ? ID.smooth_stone : ID.stone_bricks);
      for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { for (let y = 0; y < 3; y++) S(cx + ox, gy + y, cz + oz, ID.oak_fence); }
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        if (r <= 3) S(cx + dx, gy + 3 + (r === 3 ? 0 : 1), cz + dz, r % 2 ? ID.spruce_planks : ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
      }
      S(cx, gy + 5, cz, ID.glowstone);
      const bs = slabIdFor(ID.oak_planks); if (bs != null) { S(cx - 1, gy, cz, bs); S(cx + 1, gy, cz, bs); }
    }
    // ── 5) 캠프장(150,232): 양털 텐트 + 모닥불 + 통나무 의자 ──
    {
      const cx = 150, cz = 232, gy = surfaceTop(cx, cz);
      const wR = ID.wool_red != null ? ID.wool_red : ID.bricks, wW = ID.wool_white != null ? ID.wool_white : ID.quartz_block;
      for (let dz = 0; dz <= 3; dz++) { S(cx - 1, gy, cz + dz, wR); S(cx + 1, gy, cz + dz, wR); S(cx, gy + 1, cz + dz, wW); }
      S(cx, gy, cz + 3, 0);   // 입구
      S(cx + 4, gy - 1, cz + 1, ID.netherrack); S(cx + 4, gy, cz + 1, ID.glowstone);   // 모닥불
      S(cx + 3, gy, cz - 1, ID.oak_log); S(cx + 5, gy, cz + 3, ID.oak_log);           // 통나무 의자
    }
    // ── 6) 건초 목장(304,258): 울타리 링 + 건초 더미 + 물통 ──
    {
      const x0 = 300, z0 = 252, x1 = 312, z1 = 264;
      for (let x = x0; x <= x1; x++) { S(x, surfaceTop(x, z0), z0, ID.oak_fence); S(x, surfaceTop(x, z1), z1, ID.oak_fence); }
      for (let z = z0; z <= z1; z++) { S(x0, surfaceTop(x0, z), z, ID.oak_fence); S(x1, surfaceTop(x1, z), z, ID.oak_fence); }
      const hg = surfaceTop(305, 257); S(305, hg, 257, ID.hay_block); S(306, hg, 257, ID.hay_block); S(305, hg + 1, 257, ID.hay_block);
      S(309, surfaceTop(309, 261), 261, ID.hay_block);
      S(302, surfaceTop(302, 262) - 1, 262, ID.water);   // 물통(움푹)
      S(304, surfaceTop(304, 252), 252, 0);   // 출입구
    }
    // ── 6.5) V24-D(건축 #5): 주거지 골목 — 2층 타운하우스 4채(1층 석재/2층 판자+발코니, 수종 변주) ──
    const townhouse = (x0, z0, wallId) => {
      const base = surfaceTop(x0 + 3, z0 + 3);
      flattenSite(x0 - 1, z0 - 1, x0 + 7, z0 + 6, base - 1);
      for (let x = x0; x < x0 + 7; x++) for (let z = z0; z < z0 + 6; z++) setW(x, base - 1, z, ID.oak_planks);
      for (let y = 0; y < 7; y++) for (let x = x0; x < x0 + 7; x++) for (let z = z0; z < z0 + 6; z++) {
        const edge = x === x0 || x === x0 + 6 || z === z0 || z === z0 + 5;
        const corner = (x === x0 || x === x0 + 6) && (z === z0 || z === z0 + 5);
        if (!edge) { if (y === 3) setW(x, base + y, z, ID.oak_planks); else setW(x, base + y, z, 0); continue; }   // 2층 바닥
        setW(x, base + y, z, corner ? ID.oak_log : y < 3 ? (y === 0 ? ID.stone_bricks : ID.cobblestone) : y === 3 ? ID.oak_log : wallId);
      }
      // 창(1층+2층 남면/북면), 문(남면 중앙), 발코니(남면 2층)
      setW(x0 + 2, base + 1, z0 + 5, ID.glass); setW(x0 + 4, base + 1, z0 + 5, ID.glass);
      setW(x0 + 2, base + 5, z0 + 5, ID.glass); setW(x0 + 4, base + 5, z0 + 5, ID.glass);
      setW(x0 + 3, base + 5, z0, ID.glass);
      const dId = ID.oak_door_c_0; if (dId != null) { setW(x0 + 3, base, z0 + 5, dId); setW(x0 + 3, base + 1, z0 + 5, dId); }
      for (let x = x0 + 2; x <= x0 + 4; x++) { setW(x, base + 3, z0 + 6, ID.oak_planks); setW(x, base + 4, z0 + 6, ID.oak_fence); }   // 발코니
      // 박공 지붕(z축 경사)
      for (let x = x0 - 1; x <= x0 + 7; x++) for (let dz = -1; dz <= 6; dz++) {
        const h = 3 - Math.abs(dz - 2.5 | 0); if (h < 0) continue;
        const ry = base + 7 + Math.min(h, 2), z = z0 + dz;
        const sid = stairIdFor(ID.spruce_planks, dz < 2.5 ? 2 : 0);
        setW(x, ry, z, (dz === 2 || dz === 3) ? ID.spruce_planks : (sid != null ? sid : ID.spruce_planks));
      }
      setW(x0 + 3, base + 2, z0 + 2, ID.glowstone);   // 1층 조명
      setW(x0 + 3, base + 6, z0 + 2, ID.glowstone);   // 2층 조명
      // V26: 인테리어 — 1층 러그+테이블, 2층 침대+책장
      const rugA = ID.wool_red != null ? ID.wool_red : ID.oak_planks, rugB = ID.wool_white != null ? ID.wool_white : ID.oak_planks;
      for (let dx = 2; dx <= 4; dx++) for (let dz = 2; dz <= 3; dz++) setW(x0 + dx, base - 1, z0 + dz, ((dx + dz) & 1) ? rugA : rugB);
      setW(x0 + 3, base, z0 + 2, ID.oak_fence); const ts = slabIdFor(ID.oak_planks); if (ts != null) setW(x0 + 3, base + 1, z0 + 2, ts);
      setW(x0 + 2, base + 4, z0 + 2, ID.bed);
      setW(x0 + 4, base + 4, z0 + 1, ID.bookshelf); setW(x0 + 5, base + 4, z0 + 1, ID.bookshelf);
    };
    // V58: (252,240)/(262,240) 타운하우스는 여관(256~266,239~247)과 겹쳐 제거 — 여관이 이 블록의 앵커
    townhouse(272, 240, ID.spruce_planks); townhouse(282, 240, ID.oak_planks);
    [[250, 248], [270, 248], [290, 248]].forEach(([lx, lz]) => lampPost(lx, lz));
    // ── 6.7) V24-E(건축 #10): 설산 산장촌 — 가문비 산장 3채 + 진입 가로등 ──
    buildHouse(200, 62, 7, 6, surfaceTop(203, 65), ID.spruce_planks, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks, ID.spruce_log);
    buildHouse(214, 58, 6, 5, surfaceTop(217, 60), ID.spruce_planks, ID.spruce_planks, ID.spruce_log);
    buildHouse(228, 64, 7, 6, surfaceTop(231, 67), ID.oak_planks, ID.spruce_planks, ID.spruce_log);
    [[208, 70], [222, 66]].forEach(([lx, lz]) => lampPost(lx, lz));
    // ── 6.8) V24-E(건축 #11): 광산 지상 시설 — 갱구 헤드프레임(도르래 탑) + 광차 레일 + 폐석 더미 + 광부 텐트 ──
    {
      const hx = 100, hz = 203, hy = surfaceTop(hx, hz);
      for (const [ox, oz] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) for (let y = 0; y < 5; y++) S(hx + ox, hy + y, hz + oz, ID.spruce_log);   // 4주 다리
      for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) S(hx + dx, hy + 5, hz + dz, ID.spruce_planks);   // 상판
      S(hx, hy + 6, hz, ID.oak_fence); S(hx + 1, hy + 6, hz, ID.oak_fence); S(hx, hy + 7, hz, ID.glowstone);   // 도르래 + 등
      // 광차 레일(자갈 침목 + 울타리 레일 암시): 갱구에서 폐석장까지
      for (let i = 0; i < 12; i++) { const rx = hx - 4 - i, rz = hz - (i >> 2); const ry = surfaceTop(rx, rz); S(rx, ry - 1, rz, ID.gravel); if (i % 3 === 0) S(rx, ry, rz, slabIdFor(ID.oak_planks) != null ? slabIdFor(ID.oak_planks) : ID.oak_planks); }
      // 폐석 더미 2 + 석탄 더미 1
      const t1 = surfaceTop(84, 198); S(84, t1, 198, ID.gravel); S(85, t1, 198, ID.gravel); S(84, t1 + 1, 198, ID.gravel);
      const t2 = surfaceTop(88, 194); S(88, t2, 194, ID.coal_block != null ? ID.coal_block : ID.gravel); S(88, t2 + 1, 194, ID.gravel);
      // 광부 텐트 2(양털 A형)
      for (const [tx, tz, col] of [[92, 188, ID.wool_white], [96, 186, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white]]) {
        const ty = surfaceTop(tx, tz);
        for (let dz = 0; dz <= 2; dz++) { S(tx - 1, ty, tz + dz, col); S(tx + 1, ty, tz + dz, col); S(tx, ty + 1, tz + dz, col); }
        S(tx, ty, tz + 2, 0);
      }
      lampPost(94, 196);
    }
    // ── 7) 대로변 가로등(광장→각 존 도로를 따라 약 18칸 간격) ──
    [[224, 92], [110, 208], [156, 314], [326, 224], [146, 136], [318, 318], [224, 348], [318, 124]].forEach(([tx, tz]) => {
      const steps = Math.max(Math.abs(tx - 224), Math.abs(tz - 224));
      for (let s = 26; s < steps - 8; s += 18) {
        const x = Math.round(224 + (tx - 224) * s / steps) + 2, z = Math.round(224 + (tz - 224) * s / steps) + 2;
        const gy = surfaceTop(x, z);
        if (getBlockLocal(x, gy - 1, z) === ID.grass || getBlockLocal(x, gy - 1, z) === ID.gravel) lampPost(x, z);
      }
    });
  }
  // V25-A: 딥서치(wiki.hypixel.net 추출 좌표) 기반 허브 정합 1차 — 실제 허브의 명명 건물/탐험 요소를 우리 좌표계로 이식
  //   실측 근거: 터번(스폰 서측), 플라워 하우스/커뮤니티 센터(마을 내), 다크 옥션 오두막(야생), 카타콤 입구(묘지 옆 지하 ~14블럭 침몰)
  function buildHubRealign() {
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    // ── 1) 터번(Tavern, 광장 서측 176,210): 다크오크 + 입구 술통(통나무 더미) + 처마 랜턴 ──
    buildHouse(176, 208, 8, 7, surfaceTop(180, 211), ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks, ID.spruce_planks, ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log);
    { const by = surfaceTop(186, 217); S(186, by, 217, ID.oak_log); S(187, by, 217, ID.oak_log); S(186, by + 1, 217, ID.oak_log); S(185, by, 218, ID.hay_block); }
    { // V26: 터번 인테리어 — 바 카운터(반블럭 상판) + 스툴(울타리) + 뒷선반(책장)
      const ty = surfaceTop(180, 211), bs = slabIdFor(ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
      for (let dx = 0; dx < 4; dx++) { S(178 + dx, ty, 210, ID.spruce_planks); if (bs != null) S(178 + dx, ty + 1, 210, bs); }
      for (let dx = 0; dx < 3; dx++) S(178 + dx, ty, 212, ID.oak_fence);
      S(178, ty, 209, ID.bookshelf); S(179, ty, 209, ID.bookshelf); S(178, ty + 1, 209, ID.bookshelf);
    }
    // ── 2) 플라워 하우스(198,194): 흰 벽(석영) + 잎 트림 + 창가 꽃 화단 + 지붕 꽃밭 ──
    {
      buildHouse(196, 192, 6, 5, surfaceTop(199, 194), ID.quartz_block, ID.birch_planks, ID.birch_log != null ? ID.birch_log : ID.oak_log);
      const fy = surfaceTop(199, 198);
      [[195, 193], [195, 195], [202, 193], [202, 195]].forEach(([fx, fz]) => { S(fx, surfaceTop(fx, fz), fz, hash3(fx, 231, fz) < 0.5 ? ID.flower_red : ID.flower_yellow); });
      [[197, 191], [199, 191], [201, 191]].forEach(([fx, fz]) => { S(fx, fy + 1, fz, ID.oak_leaves); S(fx, fy + 2, fz, hash3(fx, 232, fz) < 0.5 ? ID.flower_red : ID.flower_yellow); });
    }
    // ── 3) 커뮤니티 센터(238,196): 석재 + 초록 배너 기둥 + 게시판 벽 ──
    {
      buildHouse(236, 194, 9, 7, surfaceTop(240, 197), ID.stone_bricks, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks, ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks);
      const cy = surfaceTop(235, 202);
      const wg = ID.wool_green != null ? ID.wool_green : (ID.wool_lime != null ? ID.wool_lime : ID.oak_leaves);
      for (let y = 0; y < 4; y++) S(235, cy + y, 202, y === 3 ? ID.glowstone : wg);   // 배너 기둥
      for (let dx = 0; dx < 3; dx++) { S(246 + 0, cy + 1, 197 + dx, ID.bookshelf); }   // 게시판 벽(동측)
    }
    // ── 4) 다크 옥션 오두막(시리우스 쉑, 야생 336,336): 흑요석 소옥 + 발광 눈 + 다크오크 지붕 ──
    {
      const sx = 334, sz = 334, sy = surfaceTop(sx + 2, sz + 2);
      flattenSite(sx - 1, sz - 1, sx + 5, sz + 5, sy - 1);
      for (let y = 0; y < 3; y++) for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 4; dz++) {
        const edge = dx === 0 || dx === 4 || dz === 0 || dz === 4;
        S(sx + dx, sy + y, sz + dz, edge ? ID.obsidian : 0);
      }
      S(sx + 2, sy, sz, 0); S(sx + 2, sy + 1, sz, 0);   // 입구
      S(sx + 1, sy + 1, sz + 4, ID.glowstone); S(sx + 3, sy + 1, sz + 4, ID.glowstone);   // 발광 '눈'
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 5; dz++) S(sx + dx, sy + 3, sz + dz, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
      S(sx + 2, sy + 4, sz + 2, ID.glowstone);
    }
    // ── 4.5) V26-C: 천문대 내부(264,200) — 망원경/성도 테이블/서가/관측 의자(가구 6개뿐이던 빈 껍데기 해소) ──
    {
      const ox = 264, oz = 200, oy = 20;
      S(ox - 2, oy, oz - 2, ID.bookshelf); S(ox - 2, oy + 1, oz - 2, ID.bookshelf); S(ox - 1, oy, oz - 2, ID.bookshelf);
      S(ox + 1, oy, oz, ID.oak_fence); const os = slabIdFor(ID.birch_planks); if (os != null) S(ox + 1, oy + 1, oz, os);
      S(ox + 2, oy, oz + 1, ID.spruce_log); S(ox + 2, oy + 1, oz + 1, ID.spruce_log); S(ox + 2, oy + 2, oz + 1, ID.quartz_block);
      const oc = stairIdFor(ID.spruce_planks, 1); if (oc != null) S(ox, oy, oz + 2, oc);
      S(ox - 1, oy + 3, oz, ID.glowstone);
    }
    // ── 5) 침몰 크립트 입구(묘지 168,306): 실제 카타콤처럼 지하로 내려가는 계단 갱도 + 아치 ──
    {
      const cx = 168, cz = 306, gy = surfaceTop(cx, cz);
      for (let i = 0; i < 6; i++) {   // 계단 갱도(남→북, 6칸 내려감)
        const z = cz + i, fy = gy - 1 - i;
        for (let dx = -1; dx <= 1; dx++) {
          for (let y = fy + 1; y <= gy + 1; y++) S(cx + dx, y, z, 0);   // 갱도 비우기
          S(cx + dx, fy, z, ID.stone_bricks);                            // 계단 바닥
          S(cx - 2, fy + 1, z, ID.mossy_stone_bricks != null ? ID.mossy_stone_bricks : ID.mossy_cobblestone);   // 측벽
          S(cx + 2, fy + 1, z, ID.mossy_stone_bricks != null ? ID.mossy_stone_bricks : ID.mossy_cobblestone);
        }
        if (i % 2 === 0) S(cx - 2, fy + 2, z, ID.glowstone);
      }
      // 바닥 크립트 방(3×3) + 관(석재) + 아치 입구
      const by = gy - 7, bz = cz + 7;
      for (let dx = -2; dx <= 2; dx++) for (let dz = 0; dz <= 4; dz++) {
        for (let y = by + 1; y <= by + 3; y++) S(cx + dx, y, bz + dz, (Math.abs(dx) === 2 || dz === 0 || dz === 4) ? ID.stone_bricks : 0);
        S(cx + dx, by, bz + dz, ID.cracked_stone_bricks != null ? ID.cracked_stone_bricks : ID.stone_bricks);
        S(cx + dx, by + 4, bz + dz, ID.stone_bricks);
      }
      S(cx, by + 1, bz + 2, ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks);   // 석관
      S(cx, by + 2, bz + 2, ID.glowstone);
      // 지상 아치(입구 표식)
      for (let dy = 0; dy < 3; dy++) { S(cx - 2, gy + dy, cz - 1, ID.stone_bricks); S(cx + 2, gy + dy, cz - 1, ID.stone_bricks); }
      for (let dx = -2; dx <= 2; dx++) S(cx + dx, gy + 3, cz - 1, ID.mossy_stone_bricks != null ? ID.mossy_stone_bricks : ID.stone_bricks);
    }
  }
  function buildMarketStalls() {
    flattenSite(196, 248, 244, 258, 19);
    for (let x = 197; x <= 243; x++) for (let z = 250; z <= 256; z++) setW(x, 19, z, ((x + z) % 5 === 0) ? (ID.polished_andesite != null ? ID.polished_andesite : ID.stone) : hash3(x, 602, z) < 0.25 ? ID.cobblestone : ID.stone_bricks);   // V53: 회색 패치워크(실제 바자 골목)
    // V53: 머리 위 청록 차양 스트립 + 매달린 등불(Bazaar_Alley.png) — 거리 가로질러 4곳
    for (const ax of [204, 216, 228, 240]) {
      for (let z = 249; z <= 257; z++) if ((z + ax) % 2 === 0) setW(ax, 25, z, ID.wool_cyan != null ? ID.wool_cyan : ID.wool_blue);
      setW(ax, 24, 251, ID.oak_fence); setW(ax, 23, 251, ID.glowstone);
      setW(ax, 24, 255, ID.oak_fence); setW(ax, 23, 255, ID.glowstone);
    }
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const log = ID.spruce_log, slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks, glow = ID.glowstone, fence = ID.oak_fence;
    const stair = (f) => (ID['oak_planks_stairs_' + f] != null ? ID['oak_planks_stairs_' + f] : ID.oak_planks);
    // 노점 1개 헬퍼: (기준 x0, 차양색 awn, 카운터 진열 goods[3], 뒤 상자 crate) — 각 호출마다 다른 값
    const stall = (x0, z0, faceS, awn, goods, crate) => {
      const zc = z0, zb = faceS ? z0 - 2 : z0 + 2;   // 카운터/뒤편
      for (let dx = 0; dx <= 2; dx++) { S(x0 + dx, 20, zc, slab); }                 // 카운터 상판(반블럭)
      S(x0, 20, zc, log); S(x0 + 2, 20, zc, log);                                    // 카운터 양끝 기둥 밑동
      for (let dy = 20; dy <= 22; dy++) { S(x0, dy, zb, log); S(x0 + 2, dy, zb, log); }   // 뒤 차양 기둥 2주
      for (let dx = 0; dx <= 2; dx++) { S(x0 + dx, 23, zb, awn); S(x0 + dx, 23, zc, faceS ? stair(2) : stair(0)); }   // 차양(뒤 평지붕색+앞 경사)
      for (let dx = 0; dx <= 2; dx++) S(x0 + dx, 23, (zc + zb) / 2 | 0, awn);         // 차양 중앙 채움
      S(x0, 21, zc, goods[0]); S(x0 + 1, 21, zc, goods[1]); S(x0 + 2, 21, zc, goods[2]);   // 진열품(카운터 위)
      S(x0 + 1, 20, zb, crate); S(x0 + 1, 21, zb, crate);                            // 뒤 재고 상자 더미
      S(x0 + 1, 22, zb, ID.oak_planks);                                              // V23-B: 뒷벽 상단 마감(구멍 제거)
      S(x0, 22, zc, glow);                                                            // 노점 등불
      S(x0 + 2, 21, zc, goods[2] != null ? goods[2] : fence); S(x0 + 2, 22, zc, fence);   // V23-B: 차양 앞단 지지 기둥(공중에 뜬 차양 수정)
    };
    // 5개 노점 — 서로 다른 업종/차양/진열(남측 줄: z252 남향 / 북측 줄: z254 북향 교차)
    stall(198, 252, true, ID.wool_red != null ? ID.wool_red : ID.bricks, [ID.pumpkin, ID.hay_block, ID.melon], ID.hay_block);           // 청과물(붉은 차양)
    stall(210, 254, false, ID.wool_blue != null ? ID.wool_blue : ID.prismarine, [ID.prismarine, ID.sea_lantern != null ? ID.sea_lantern : ID.glowstone, ID.prismarine], ID.oak_planks);   // 생선(파란 차양)
    stall(222, 252, true, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.bricks, [ID.iron_ore, ID.gold_ore, ID.iron_ore], ID.cobblestone);   // 도구·광물(갈색 차양)
    stall(234, 254, false, ID.purpur, [ID.glass, ID.wool_purple != null ? ID.wool_purple : ID.purpur, ID.glass], ID.bookshelf != null ? ID.bookshelf : ID.oak_planks);   // 물약(보라 차양)
    stall(210, 252, true, ID.wool_yellow != null ? ID.wool_yellow : ID.quartz_block, [ID.emerald_ore, ID.gold_ore, ID.emerald_ore], ID.chest != null ? ID.chest : ID.oak_planks);   // 장신구(노란 차양)
    // V28-C: 시장 완성 — 노점 3개 추가(빵집/양털·염색/서적) + 거리 등불 아치 + 현수막 기둥
    stall(202, 254, false, ID.wool_orange != null ? ID.wool_orange : ID.bricks, [ID.hay_block, ID.pumpkin, ID.hay_block], ID.hay_block);            // 빵집(주황 차양)
    stall(226, 254, false, ID.wool_lime != null ? ID.wool_lime : ID.oak_planks, [ID.wool_white, ID.wool_red, ID.wool_blue], ID.wool_white);          // 양털·염색(연두 차양)
    stall(238, 252, true, ID.wool_cyan != null ? ID.wool_cyan : ID.prismarine, [ID.bookshelf, ID.glass, ID.bookshelf], ID.bookshelf);                // 서적(청록 차양)
    for (const ax of [206, 220, 236]) {   // 등불 아치(거리 가로지름)
      for (let z = 250; z <= 256; z++) setW(ax, 24, z, fence);
      setW(ax, 20, 250, fence); setW(ax, 21, 250, fence); setW(ax, 22, 250, fence); setW(ax, 23, 250, fence);
      setW(ax, 20, 256, fence); setW(ax, 21, 256, fence); setW(ax, 22, 256, fence); setW(ax, 23, 256, fence);
      setW(ax, 23, 253, glow);
    }
    // 거리 가로등 + 화분(잎) + 벤치
    for (const x of [200, 216, 232, 242]) { setW(x, 20, 249, fence); setW(x, 21, 249, glow); }
    setW(205, 20, 257, stair(0)); setW(206, 20, 257, slab); setW(207, 20, 257, stair(0));   // 벤치
    setW(228, 20, 249, ID.oak_leaves != null ? ID.oak_leaves : ID.oak_planks); setW(228, 21, 249, ID.oak_leaves != null ? ID.oak_leaves : ID.oak_planks);   // 화분
  }
  // V20-AL: 대시계탑 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 저층 허브 건물과 다른 '수직' 실루엣.
  //   2단 포디움 → 석벽돌 탑신(석영 코너 퀀·아치창) → 4면 시계 다이얼 → 종루(아치+종) → 첨탑 스파이어.
  function buildClocktower() {
    const cx = 300, cz = 232, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, q = ID.quartz_block, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const glow = ID.glowstone, dark = ID.wool_black != null ? ID.wool_black : ID.obsidian, fence = ID.oak_fence;
    const bell = ID.gold_ore, pur = ID.purpur;
    const st = (f) => (ID['stone_bricks_stairs_' + f] != null ? ID['stone_bricks_stairs_' + f] : sb);
    // ── 2단 포디움 ──
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) B(dx, 0, dz, ((dx + dz) & 1) ? sb : and_);   // 하단 11×11
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) B(dx, 1, dz, ((dx + dz) & 1) ? and_ : sb);   // 상단 9×9
    for (let dx = -5; dx <= 5; dx++) B(dx, 1, 5, st(0));   // +z 진입 계단 띠
    for (const [ox, oz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { B(ox, 1, oz, fence); B(ox, 2, oz, glow); }   // 포디움 4모서리 가로등
    // ── 탑신(5×5, y2~16, hollow, 석영 코너 퀀 + 아치창) ──
    for (let dy = 2; dy <= 16; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2; if (!edge) continue;
      const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      // 아치창: 각 면 중앙 세로 슬릿(dy 4~6, 10~12)
      const win = (dx === 0 || dz === 0) && ((dy >= 4 && dy <= 6) || (dy >= 10 && dy <= 12)) && (Math.abs(dx) === 2 || Math.abs(dz) === 2);
      if (win) continue;
      B(dx, dy, dz, corner ? q : sb);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { B(dx, 2, dz, and_); B(dx, 8, dz, sb); B(dx, 13, dz, sb); }   // 바닥/중간층
    B(0, 3, 2, glow); B(0, 9, 2, glow); B(0, 14, -2, glow);   // 내부 조명
    // 아치창 상단 곡선(석영 인방)
    for (const [ax, az] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) { B(ax, 7, az, q); B(ax, 13, az, q); }
    // ── 탑신 상단 코니스(1칸 돌출 처마) ──
    for (let dx = -3; dx <= 3; dx++) { B(dx, 16, -3, st(2)); B(dx, 16, 3, st(0)); } for (let dz = -3; dz <= 3; dz++) { B(-3, 16, dz, st(3)); B(3, 16, dz, st(1)); }
    // ── 4면 시계 다이얼(y17~19, 3×3 석영 링 + 검은 중심/바늘) ──
    for (const [nx, nz] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) {
      for (let a = -1; a <= 1; a++) for (let dy = 17; dy <= 19; dy++) { const gx = nz === 0 ? nx : nx + a, gz = nz === 0 ? nz + a : nz; B(gx, dy, gz, q); }
    }
    // 다이얼 중심 + 바늘(검은색) — 각 면
    for (const [nx, nz] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) { B(nx, 18, nz, dark); if (nz === 0) { B(nx, 19, nz, dark); } else { B(nx === 0 ? 1 : nx, 18, nz, dark); } }
    // ── 종루(y20~22): 4모서리 석영 기둥 + 인방 + 매달린 종 ──
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let dy = 20; dy <= 22; dy++) B(ox, dy, oz, q);
    for (let dx = -2; dx <= 2; dx++) { B(dx, 22, -2, q); B(dx, 22, 2, q); } for (let dz = -2; dz <= 2; dz++) { B(-2, 22, dz, q); B(2, 22, dz, q); }
    for (let dx = -2; dx <= 2; dx++) { B(dx, 20, -2, dx % 2 ? 0 : sb); B(dx, 20, 2, dx % 2 ? 0 : sb); }   // 종루 난간(총안)
    B(0, 22, 0, fence); B(0, 21, 0, bell); B(0, 20, 0, glow);   // 매달린 종 + 아래 발광
    // ── 첨탑 스파이어(y23~26 수렴 계단 + 자수정 첨두 + 발광 피니얼) ──
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 || Math.abs(dz) === 2) B(dx, 23, dz, st(dx === -2 ? 1 : dx === 2 ? 3 : dz === -2 ? 2 : 0)); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (Math.abs(dx) === 1 || Math.abs(dz) === 1) B(dx, 24, dz, st(dx === -1 ? 1 : dx === 1 ? 3 : dz === -1 ? 2 : 0)); }
    B(0, 24, 0, pur); B(0, 25, 0, pur); B(0, 26, 0, glow);   // 첨두 자수정 + 발광 피니얼
  }
  // V20-V: 모험가 길드 대회관 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 하프팀버 2층 + 코너 타워 + 박공/도머 지붕 + 실내.
  //   허브 북동 빈 구역(280~294, 158~169). 정면(+z)이 광장 방향.
  function buildGuildHall() {
    const bx = 280, bz = 158, W = 15, D = 12;
    const gy = surfaceTop(bx + 7, bz + 6);
    const B = (dx, dy, dz, id) => { if (id != null) setW(bx + dx, gy + dy, bz + dz, id); };
    const sb = ID.stone_bricks, cob = ID.cobblestone, moss = ID.mossy_cobblestone, ch = ID.chiseled_stone_bricks;
    const and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, smooth = ID.smooth_stone != null ? ID.smooth_stone : ID.stone;
    const log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log, plank = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
    const sprk = ID.spruce_planks, glass = ID.glass, glow = ID.glowstone, book = ID.bookshelf != null ? ID.bookshelf : plank;
    const woolR = ID.wool_red != null ? ID.wool_red : sb, woolBlue = ID.wool_blue != null ? ID.wool_blue : sb, q = ID.quartz_block;
    const seaL = ID.sea_lantern != null ? ID.sea_lantern : glow;
    const st = (mat, f) => (ID[mat + '_stairs_' + f] != null ? ID[mat + '_stairs_' + f] : mat === 'dark_oak_planks' ? plank : sb);
    const slab = ID.stone_bricks_slab != null ? ID.stone_bricks_slab : sb;
    flattenSite(bx - 1, bz - 1, bx + W, bz + D, gy - 1);
    // ── 기단(2단) + 판자 바닥 ──
    for (let x = -1; x <= W; x++) for (let z = -1; z <= D; z++) { const edge = x === -1 || x === W || z === -1 || z === D; B(x, -1, z, edge ? ch : ((x + z) & 1 ? and_ : smooth)); }
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) B(x, -2, z, sb);
    // ── 1층 벽(dy0..3): 하프팀버 — 모서리·격자 통나무 기둥 + 사이 석재/회벽 ──
    // 통나무 기둥(특정 x=0,4,7,10,14 / z=0,5,11)
    for (const px of [0, 4, 7, 10, 14]) for (const pz of [0, 5, 11]) for (let y = 0; y <= 4; y++) B(px, y, pz, log);
    // 벽면 채움(기둥 사이) — 하단 석재벽돌 2단, 상단 회벽(매끈), 군데군데 이끼
    for (let x = 0; x <= 14; x++) for (const z of [0, 11]) { if ([0, 4, 7, 10, 14].includes(x)) continue; B(x, 0, z, sb); B(x, 1, z, ((x * 3) % 5 === 0) ? moss : sb); B(x, 2, z, smooth); B(x, 3, z, smooth); }
    for (let z = 1; z <= 10; z++) for (const x of [0, 14]) { if ([0, 5, 11].includes(z)) continue; B(x, 0, z, sb); B(x, 1, z, ((z * 3) % 5 === 0) ? moss : sb); B(x, 2, z, smooth); B(x, 3, z, smooth); }
    // 벽 상단 인방(통나무 띠)
    for (let x = 0; x <= 14; x++) { B(x, 4, 0, log); B(x, 4, 11, log); }
    for (let z = 0; z <= 11; z++) { B(0, 4, z, log); B(14, 4, z, log); }
    // ── 아치창(정면·측면, 유리 2단 + 석재 계단 아치머리) ──
    for (const [wx, wz] of [[2, 11], [12, 11], [2, 0], [12, 0]]) { B(wx, 1, wz, glass); B(wx, 2, wz, glass); B(wx, 3, wz, st('stone_bricks', 0)); }
    for (const wz of [2, 3, 8, 9]) { B(0, 1, wz, glass); B(0, 2, wz, glass); B(14, 1, wz, glass); B(14, 2, wz, glass); }
    // ── 정면(+z, dz=11) 대형 현관: 3칸 아치 개구부 + 이중 문 + 계단 + 기둥 + 랜턴 + 배너 ──
    for (let dxo = 6; dxo <= 8; dxo++) for (let y = 0; y <= 3; y++) B(dxo, y, 11, 0);   // 개구부 뚫기
    B(7, 0, 11, ID.dark_oak_door_c_0 != null ? ID.dark_oak_door_c_0 : ID.spruce_door_c_0); B(7, 1, 11, ID.dark_oak_door_c_0 != null ? ID.dark_oak_door_c_0 : ID.spruce_door_c_0);
    B(6, 3, 11, st('stone_bricks', 1)); B(8, 3, 11, st('stone_bricks', 3)); B(7, 4, 11, ch);   // 아치머리
    B(5, 0, 12, q); B(5, 1, 12, q); B(5, 2, 12, ch); B(5, 3, 12, seaL);   // 좌 현관 기둥+등
    B(9, 0, 12, q); B(9, 1, 12, q); B(9, 2, 12, ch); B(9, 3, 12, seaL);   // 우 현관 기둥+등
    B(6, -1, 12, slab); B(7, -1, 12, slab); B(8, -1, 12, slab);           // 진입 계단참
    B(6, -1, 13, woolR); B(7, -1, 13, woolR); B(8, -1, 13, woolR);        // 레드카펫
    B(4, 1, 12, woolBlue); B(4, 2, 12, woolBlue); B(4, 3, 12, woolBlue);  // 좌 배너
    B(10, 1, 12, woolR); B(10, 2, 12, woolR); B(10, 3, 12, woolR);        // 우 배너
    // ── 코너 타워(4모서리 dy0..6) + 석영 캡 + 발광 첨두 ──
    for (const [tx, tz] of [[0, 0], [14, 0], [0, 11], [14, 11]]) { B(tx, 5, tz, ch); B(tx, 6, tz, q); B(tx, 7, tz, q); B(tx, 8, tz, glow); }
    // ── 2층 벽(dy5..7) 살짝 안쪽(도머 느낌) 정면만 ──
    for (let x = 3; x <= 11; x++) { B(x, 5, 11, sb); B(x, 6, 11, ((x) % 3 === 0) ? glass : sb); B(x, 7, 11, log); }
    // ── 박공 지붕(용마루 x축, z로 경사) — 어두운 판자 + 가문비 계단 물매 ──
    const halfD = 6;
    for (let x = -1; x <= W; x++) for (let dz = -halfD; dz <= halfD; dz++) {
      const z = 6 + dz, h = 5 + (halfD - Math.abs(dz)); if (h < 5) continue;
      if (dz === 0) B(x, h, z, plank);                                    // 용마루
      else B(x, h, z, st('spruce_planks', dz > 0 ? 0 : 2));               // 경사
    }
    // 박공 삼각벽(양 끝 x=-1,15) — 통나무 뼈대+판자
    for (const gx of [-1, W]) for (let dz = -halfD; dz <= halfD; dz++) { const z = 6 + dz, top = (halfD - Math.abs(dz)); for (let yy = 0; yy < top; yy++) B(gx, 5 + yy, z, (yy === top - 1 || dz === 0) ? log : plank); }
    // 지붕 도머(정면 튀어나온 창) — 손 배치
    B(5, 8, 12, plank); B(6, 8, 12, glass); B(7, 8, 12, glass); B(8, 8, 12, glass); B(9, 8, 12, plank);
    B(6, 9, 12, st('spruce_planks', 0)); B(7, 9, 12, st('spruce_planks', 0)); B(8, 9, 12, st('spruce_planks', 0));
    // 용마루 장식(랜턴 + 깃대)
    B(2, 12, 6, seaL); B(7, 13, 6, log); B(7, 14, 6, woolR); B(12, 12, 6, seaL);
    // ── 실내: 카펫 러너 + 접수 카운터 + 책장 벽 + 샹들리에 + 테이블 ──
    for (let z = 1; z <= 10; z++) { B(7, -1, z, woolR); }                 // 중앙 레드카펫 러너
    for (let x = 3; x <= 11; x++) B(x, 0, 2, book), B(x, 1, 2, book);     // 뒷벽 책장(2단)
    for (let x = 4; x <= 10; x++) B(x, 0, 4, st('spruce_planks', 0));     // 접수 카운터(계단)
    B(4, 1, 4, log); B(10, 1, 4, log);                                    // 카운터 양끝 기둥
    for (const [cx2, cz2] of [[4, 4], [10, 4], [4, 8], [10, 8]]) B(cx2, 3, cz2, glow);   // 샹들리에(천장 발광)
    B(5, 0, 8, log); B(5, 1, 8, slab); B(4, 0, 8, st('spruce_planks', 3)); B(6, 0, 8, st('spruce_planks', 1));   // 테이블+의자
    B(9, 0, 8, log); B(9, 1, 8, slab); B(8, 0, 8, st('spruce_planks', 3)); B(10, 0, 8, st('spruce_planks', 1));  // 테이블2+의자
    B(2, 1, 6, book); B(2, 2, 6, book); B(12, 1, 6, book); B(12, 2, 6, book);   // 측벽 책장
    // 벽 걸이 등불(측벽)
    B(0, 3, 3, glow); B(0, 3, 8, glow); B(14, 3, 3, glow); B(14, 3, 8, glow);
    // 앞마당 화분·가로등(손 배치)
    B(-2, 0, 12, log); B(-2, 1, 12, ID.flower_yellow); B(16, 0, 12, log); B(16, 1, 12, ID.flower_red);
    lampPost(bx + 3, bz + 14); lampPost(bx + 11, bz + 14);
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
    // V23-B: 클리어가 반경 안에 걸친 건물(포탈/대장간/로툰다) 벽까지 지워 '만들다 만' 잔해를 만들던 버그 —
    //   자연 블럭(식생/흙/원돌)만 치우고 건축 블럭은 보존, 건물 자리 바닥은 재포장도 건너뜀
    const natural = id => { if (!id) return false; const bk = BLOCKS[id].key; return /leaves|_log$|flower|tall_grass|pumpkin|melon|mushroom|snow|sugar/.test(bk) || id === ID.dirt || id === ID.grass || id === ID.coarse_dirt || id === ID.gravel || id === ID.stone || id === ID.sand; };
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz); if (d > R + 0.5) continue;
      const x = cx + dx, z = cz + dz;
      if (x >= 207 && x <= 214 && z >= 221 && z <= 227) continue;   // 내 섬 포탈 footprint는 통째로 보존
      let struct = false;
      for (let yy = fy + 1; yy <= fy + 6; yy++) {
        const bid = getBlockLocal(x, yy, z);
        if (natural(bid)) setW(x, yy, z, 0);   // 걸림돌(나무/풀/지형 돌출)만 제거
        else if (bid) struct = true;
      }
      if (struct) continue;   // 건물 기둥/벽이 있는 칸은 바닥 재포장도 하지 않음
      // V52: 실제 마을 광장 대조 — 흰 대로/동심원 폐기, 회색 톤 패치워크(안산암/조약돌/석재/이끼) + 가장자리 잔디 침식
      const pn = hash3(x, 501, z);
      let mat;
      if (d > R - 2.2 && pn < 0.30) {   // 가장자리 잔디 침식 패치
        setW(x, fy, z, ID.grass);
        if (pn < 0.10) setW(x, fy + 1, z, ID.tall_grass);
        else if (pn < 0.14) setW(x, fy + 1, z, pn < 0.12 ? ID.flower_yellow : ID.flower_red);
        continue;
      }
      if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) mat = AND;                 // 대로 = 안산암(실제는 회색 길)
      else mat = pn < 0.34 ? AND : pn < 0.62 ? ID.cobblestone : pn < 0.82 ? ID.stone_bricks : pn < 0.9 ? ID.mossy_cobblestone : SMOOTH;
      setW(x, fy, z, mat);
    }
    // 2) V52: 실제 마을 중앙(Village.png) — 침몰 포탈 연못 + 퍼퍼 크리스탈 링 + 수풀 침식
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const d = Math.hypot(dx, dz); if (d > 5.3) continue;
      const x = cx + dx, z = cz + dz;
      if (d <= 1.6) { setW(x, fy, z, ID.obsidian); setW(x, fy + 1, z, 0); setW(x, fy - 0, z, ID.obsidian); setW(x, fy, z, ID.water); }   // 어두운 수면(침몰 풀)
      else if (d <= 2.6) setW(x, fy, z, ID.stone_bricks);                                  // 풀 테두리 림
      else if (d <= 4.6) setW(x, fy, z, hash3(x, 502, z) < 0.3 ? ID.mossy_cobblestone : hash3(x, 503, z) < 0.5 ? AND : ID.cobblestone);   // 패치워크 광장 중심부
    }
    // 퍼퍼 크리스탈 6기(참조: 연못 둘레 보라 수정, 높이 1~3 차등) + 낮은 수풀
    for (let k = 0; k < 6; k++) {
      const th = k / 6 * Math.PI * 2 + 0.4;
      const x = cx + Math.round(Math.cos(th) * 3.4), z = cz + Math.round(Math.sin(th) * 3.4);
      const h = 1 + (k % 3);
      for (let y = 1; y <= h; y++) setW(x, fy + y, z, ID.purpur);
      if (h >= 2) setW(x, fy + h + 1, z, ID.glowstone);
      const bx = cx + Math.round(Math.cos(th + 0.5) * 4.6), bz = cz + Math.round(Math.sin(th + 0.5) * 4.6);
      if (k % 2 === 0) setW(bx, fy + 1, bz, ID.oak_leaves);   // 둘레 관목
    }
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
    // V65: 실사(Mountain.png) — 정상 사당(어두운 플레어 지붕 소옥) + 능선 깃발 기둥 + 얼음 첨탑
    {
      const hx = 214, hz = 82, hy = surfaceTop(hx + 2, hz + 1);
      const DKP = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) for (let y = hy; y <= hy + 6; y++) setW(hx + dx, y, hz + dz, 0);
      for (const [ox, oz] of [[0, 0], [4, 0], [0, 3], [4, 3]]) for (let y = 0; y < 3; y++) setW(hx + ox, hy + y, hz + oz, ID.spruce_log);
      for (let dx = 0; dx < 5; dx++) { setW(hx + dx, hy + 1, hz, ID.spruce_planks); setW(hx + dx, hy + 1, hz + 3, ID.spruce_planks); }   // 낮은 난간벽
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 4; dz++) setW(hx + dx, hy + 3, hz + dz, DKP);   // 플레어 처마
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) setW(hx + dx, hy + 4, hz + dz, DKP);
      setW(hx + 2, hy + 5, hz + 1, DKP); setW(hx + 2, hy + 6, hz + 1, ID.glowstone);   // 용마루 + 등
      setW(hx + 2, hy, hz + 1, ID.glowstone);   // 사당 내등
    }
    for (const [fx, fz] of [[236, 74], [208, 92], [230, 102]]) {   // 능선 깃발 기둥(주황 배너)
      if (zoneAt(fx, fz) !== 'snowpeak') continue;
      const fy = surfaceTop(fx, fz);
      setW(fx, fy, fz, ID.spruce_log); setW(fx, fy + 1, fz, ID.spruce_log); setW(fx, fy + 2, fz, ID.spruce_log);
      setW(fx + 1, fy + 2, fz, ID.wool_orange != null ? ID.wool_orange : ID.wool_red); setW(fx + 1, fy + 1, fz, ID.wool_orange != null ? ID.wool_orange : ID.wool_red);
    }
    for (const [ix, iz] of [[218, 74], [232, 84], [224, 70]]) {   // 얼음 첨탑(실사의 청빙 수정)
      if (zoneAt(ix, iz) !== 'snowpeak') continue;
      const iy = surfaceTop(ix, iz);
      if (iy < 44) continue;
      setW(ix, iy, iz, ID.ice); setW(ix, iy + 1, iz, ID.ice); setW(ix, iy + 2, iz, ID.ice);
      if (hash3(ix, 951, iz) < 0.5) setW(ix, iy + 3, iz, ID.ice);
    }
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
    // ── V64: 실사(Coal_Mine.png) 내부 — 목재 갠트리(기둥+대들보+랜턴) + 자갈/거친흙 혼합 바닥 ──
    for (let x = 106; x <= 116; x += 5) {   // 입구 터널 갠트리
      for (let y = 21; y <= 24; y++) { setW(x, y, 205, ID.oak_log); setW(x, y, 211, ID.oak_log); }
      for (let z = 205; z <= 211; z++) setW(x, 25, z, ID.oak_planks);
      setW(x, 24, 208, ID.glowstone);
    }
    {   // 챔버 중앙 대형 갠트리(실사의 십자 대들보)
      for (let y = 19; y <= 25; y++) { setW(84, y, 208, ID.oak_log); setW(92, y, 208, ID.oak_log); }
      for (let x = 83; x <= 93; x++) setW(x, 26, 208, ID.oak_planks);
      for (let z = 203; z <= 213; z++) setW(88, 26, z, ID.oak_planks);
      setW(85, 25, 208, ID.glowstone); setW(91, 25, 208, ID.glowstone);
      setW(84, 21, 207, ID.oak_fence); setW(84, 22, 207, ID.glowstone);   // 기둥 랜턴
    }
    for (let x = 76; x <= 100; x++) for (let z = 196; z <= 220; z++) {   // 바닥 질감: 자갈/거친흙 패치
      const r = hash3(x, 941, z);
      if (r > 0.4) continue;
      for (let y = 17; y <= 20; y++) {
        if (getBlockLocal(x, y, z) !== 0 && getBlockLocal(x, y + 1, z) === 0) { setW(x, y, z, r < 0.22 ? ID.gravel : ID.coarse_dirt); break; }
      }
    }
    buildHouse(108, 214, 7, 6, surfaceTop(111, 217), ID.spruce_planks, ID.stone);   // 감독관 오두막
  }
  function buildGraveyardZone() {
    // V18: 을씨년스러운 공동묘지 — 계단 묘비 + 이끼/자갈 바닥 + 울타리 난간 + 고사목 + 지하 크립트 아치 입구
    const gFence = ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.spruce_fence;
    for (let gx = 0; gx < 12; gx++) for (let gz = 0; gz < 9; gz++) {   // V24-F(건축 #14): 존 전체로 확장(기존 6×5 구석 → 12×9)
      const x = 108 + gx * 7, z = 282 + gz * 8;
      if (zoneAt(x, z) !== 'graveyard') continue;
      if (hash3(gx, 61, gz) < 0.25) continue;   // 불규칙 결원(줄맞춘 격자 탈피)
      const y = surfaceTop(x, z);
      // 묘비: 조약돌 대 + 이끼조약돌 비석 + 계단 지붕돌(반쯤 기울어진 느낌)
      setW(x, y, z, ID.mossy_cobblestone); setW(x, y + 1, z, ID.cobblestone);
      const cap = stairIdFor(ID.cobblestone, (gx + gz) % 4); setW(x, y + 2, z, cap != null ? cap : ID.stone);
      // 무덤 봉분 앞 자갈 + 잡초 + 낮은 울타리 난간
      if (getBlockLocal(x + 1, y - 1, z) === ID.grass) setW(x + 1, y - 1, z, ID.gravel);
      if (hash3(gx, 63, gz) < 0.4) setW(x + 1, y, z, ID.tall_grass);
      if (gz === 0 && gFence != null) setW(x, y, z - 2, gFence);   // 앞줄 난간
    }
    // V24-F(건축 #14): 예배당 폐허(북서) — 반쯤 무너진 석재 예배당(박공 잔해 + 제단 + 장미창 잔해)
    {
      const cx = 122, cz = 292, gy = surfaceTop(cx, cz);
      for (let dx = 0; dx <= 8; dx++) for (let dz = 0; dz <= 12; dz++) {
        if (zoneAt(cx + dx, cz + dz) !== 'graveyard') continue;
        setW(cx + dx, gy - 1, cz + dz, hash3(dx, 190, dz) < 0.4 ? ID.mossy_cobblestone : ID.stone_bricks);   // 바닥
      }
      for (let dz = 0; dz <= 12; dz++) {   // 양 측벽(파도형 붕괴)
        const h = Math.max(0, Math.round(4 + Math.sin(dz * 0.7) * 2 - (dz > 9 ? dz - 9 : 0)));
        for (let y = 0; y < h; y++) { setW(cx, gy + y, cz + dz, hash3(0, 191 + y, dz) < 0.35 ? ID.mossy_cobblestone : ID.stone_bricks); setW(cx + 8, gy + y, cz + dz, hash3(8, 192 + y, dz) < 0.35 ? ID.mossy_cobblestone : ID.stone_bricks); }
      }
      for (let dx = 0; dx <= 8; dx++) for (let y = 0; y < 5 - Math.abs(dx - 4); y++) setW(cx + dx, gy + y, cz, ID.stone_bricks);   // 정면 박공(온전)
      setW(cx + 4, gy + 2, cz, 0); setW(cx + 4, gy + 3, cz, ID.glass);   // 장미창 잔해
      setW(cx + 4, gy, cz + 10, ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks); setW(cx + 4, gy + 1, cz + 10, ID.glowstone);   // 제단
    }
    // V24-F: 묘지 테두리 낮은 철책 느낌(다크오크 울타리 남/서 라인)
    for (let x = 110; x <= 188; x += 2) { const fy = surfaceTop(x, 352); if (zoneAt(x, 351) === 'graveyard' && gFence != null) setW(x, fy, 352, gFence); }
    // 고사목(잎 없는 통나무) 산발
    for (let i = 0; i < 5; i++) {
      const x = 138 + Math.floor(hash3(i, 66, 3) * 30), z = 302 + Math.floor(hash3(i, 67, 4) * 28);
      if (zoneAt(x, z) !== 'graveyard') continue;
      const y = surfaceTop(x, z); const h = 3 + Math.floor(hash3(i, 68, 5) * 2);
      for (let j = 0; j < h; j++) setW(x, y + j, z, ID.dark_oak_log != null ? ID.dark_oak_log : ID.spruce_log);
      setW(x + 1, y + h - 1, z, gFence != null ? gFence : ID.spruce_log);   // 앙상한 가지
    }
    // ── V60: 실사(Graveyard.png) 분위기 — 구불 흙길 + 대형 고목(가지+검회색 수관) + 납골 돌무더기 + 배경 돌담 ──
    {
      const DKL = ID.dark_oak_log != null ? ID.dark_oak_log : ID.spruce_log;
      const DLV = ID.dark_oak_leaves != null ? ID.dark_oak_leaves : ID.spruce_leaves;
      const CH2 = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks;
      // 1) 구불구불한 흙길(실사의 중앙 산책로): 북입구 → 크립트 계단
      for (let z = 284; z <= 336; z++) {
        const px = 152 + Math.round(Math.sin(z * 0.17) * 7 + Math.sin(z * 0.05) * 4);
        for (let o = -1; o <= 1; o++) {
          const x = px + o;
          if (zoneAt(x, z) !== 'graveyard') continue;
          const g = surfaceTop(x, z);
          if (getBlockLocal(x, g - 1, z) === ID.grass) { setW(x, g - 1, z, ID.coarse_dirt); if (getBlockLocal(x, g, z) === ID.tall_grass) setW(x, g, z, 0); }
        }
      }
      // 2) 대형 고목 6그루: 굵은 줄기 + 구부러진 가지 + 납작한 검회색 수관 클럼프
      const trees = [[126, 300], [142, 322], [166, 296], [178, 330], [134, 340], [158, 314]];
      for (let i = 0; i < trees.length; i++) {
        const [tx, tz] = trees[i];
        if (zoneAt(tx, tz) !== 'graveyard') continue;
        const g = surfaceTop(tx, tz), h = 5 + (hash3(tx, 881, tz) * 3 | 0);
        for (let j = 0; j < h; j++) setW(tx, g + j, tz, DKL);
        for (let b = 0; b < 3; b++) {   // 가지 3방(수평 2~3칸) + 끝에 수관 클럼프
          const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][(i + b) % 4];
          const by = g + h - 2 - b, ln = 2 + (hash3(tx + b, 882, tz) * 2 | 0);
          let bx = tx, bz = tz;
          for (let k = 1; k <= ln; k++) { bx = tx + dir[0] * k; bz = tz + dir[1] * k; setW(bx, by, bz, DKL); }
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dx) + Math.abs(dz) < 2 || hash3(bx + dx, 883, bz + dz) < 0.5) setW(bx + dx, by + 1, bz + dz, DLV);
        }
        setW(tx, g + h, tz, DLV); setW(tx, g + h + 1, tz, hash3(tx, 884, tz) < 0.5 ? DLV : 0);
      }
      // 3) 납골 돌무더기 4곳(조각 석재 + 이끼 혼합 봉분)
      for (const [mx, mz] of [[132, 312], [160, 342], [172, 310], [146, 296]]) {
        if (zoneAt(mx, mz) !== 'graveyard') continue;
        const g = surfaceTop(mx, mz);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const hh = (Math.abs(dx) + Math.abs(dz) === 0) ? 2 : hash3(mx + dx, 885, mz + dz) < 0.6 ? 1 : 0;
          for (let y = 0; y < hh; y++) setW(mx + dx, g + y, mz + dz, hash3(dx, 886 + y, dz) < 0.4 ? ID.mossy_cobblestone : CH2);
        }
      }
      // 4) 배경 돌담(북측 경계 — 실사의 뒷벽): 조약돌/이끼 혼합 h2, 군데군데 결손
      for (let x = 112; x <= 186; x++) {
        if (zoneAt(x, 284) !== 'graveyard' || hash3(x, 887, 1) < 0.12) continue;
        const g = surfaceTop(x, 283);
        for (let y = 0; y < 2; y++) setW(x, g + y, 283, hash3(x, 888, y) < 0.35 ? ID.mossy_cobblestone : ID.cobblestone);
        if (hash3(x, 889, 2) < 0.18) setW(x, g + 2, 283, ID.cobblestone);
      }
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
    // ── V20-BF(7차): Emerald Altar(리서치 반영) — 에메랄드 블럭 2 + 연두 유리 첨탑 + 8 조약돌 기둥 ──
    { const ax = 150, az = 316, ay = surfaceTop(ax, az) - 1;
      const emer = ID.emerald_ore, lime = ID.wool_lime != null ? ID.wool_lime : ID.glass, cob = ID.cobblestone;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (dx * dx + dz * dz <= 18) setW(ax + dx, ay, az + dz, ((dx + dz) & 1) ? cob : ID.mossy_cobblestone);   // 원형 기단
      setW(ax, ay + 1, az, emer); setW(ax, ay + 2, az, emer);   // 에메랄드 블럭 2
      setW(ax, ay + 3, az, lime); setW(ax, ay + 4, az, lime); setW(ax, ay + 5, az, ID.glowstone);   // 연두 유리 첨탑 + 발광
      for (let a = 0; a < 8; a++) { const th = a / 8 * Math.PI * 2; const px = Math.round(ax + Math.cos(th) * 3), pz = Math.round(az + Math.sin(th) * 3);
        for (let y = 1; y <= 3; y++) setW(px, ay + y, pz, cob); setW(px, ay + 4, pz, lime); }   // 8 조약돌 기둥 + 연두 갓돌
    }
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
    // V24-G(건축 #15): 서측 빈 스트립(x280~306) 채우기 — 온실 + 축사 + 서측 작물 플롯 2
    for (let ci = 0; ci < 2; ci++) {
      const px = 284, pz = 204 + ci * 30;
      for (let x = px; x < px + 12; x++) for (let z = pz; z < pz + 16; z++) {
        if (zoneAt(x, z) !== 'farm') continue;
        const y = surfaceTop(x, z) - 1;
        if ((x + z) % 9 === 0) { setW(x, y, z, ID.water); continue; }
        setW(x, y, z, ID.farmland); setW(x, y + 1, z, ci ? ID.carrot_ripe : ID.wheat_ripe);
      }
    }
    // 온실(유리 아치 지붕 + 내부 밭): (284, 236)
    {
      const gx = 284, gz = 236, gy = surfaceTop(gx + 4, gz + 3);
      for (let dx = 0; dx <= 8; dx++) for (let dz = 0; dz <= 6; dz++) {
        if (zoneAt(gx + dx, gz + dz) !== 'farm') continue;
        setW(gx + dx, gy - 1, gz + dz, dx === 0 || dx === 8 || dz === 0 || dz === 6 ? ID.stone_bricks : ID.farmland);
        if (dx > 0 && dx < 8 && dz > 0 && dz < 6) setW(gx + dx, gy, gz + dz, (dx + dz) % 2 ? ID.wheat_ripe : ID.carrot_ripe);
        const arch = 3 - Math.abs(dx - 4) * 0.7;
        for (let y = 0; y <= Math.round(arch); y++) if (dx === 0 || dx === 8 || dz === 0 || dz === 6 || y === Math.round(arch)) setW(gx + dx, gy + 1 + y, gz + dz, ID.glass);
      }
      setW(gx + 4, gy, gz, 0); setW(gx + 4, gy + 1, gz, 0);   // 입구
    }
    // 축사(울타리 사육장 + 여물통 + 헛간 지붕 쉼터): (292, 254)
    {
      const ax0 = 290, az0 = 252, ax1 = 302, az1 = 262;
      for (let x = ax0; x <= ax1; x++) { setW(x, surfaceTop(x, az0), az0, ID.oak_fence); setW(x, surfaceTop(x, az1), az1, ID.oak_fence); }
      for (let z = az0; z <= az1; z++) { setW(ax0, surfaceTop(ax0, z), z, ID.oak_fence); setW(ax1, surfaceTop(ax1, z), z, ID.oak_fence); }
      setW(296, surfaceTop(296, az0), az0, 0);   // 출입구
      const hy = surfaceTop(293, 255);
      setW(292, hy, 254, ID.hay_block); setW(293, hy, 254, ID.hay_block); setW(292, hy + 1, 254, ID.hay_block);
      setW(299, surfaceTop(299, 259) - 1, 259, ID.water);   // 물통
      for (let dx = 0; dx <= 3; dx++) for (let dz = 0; dz <= 2; dz++) setW(297 + dx, hy + 2, 253 + dz, ID.spruce_planks);   // 쉼터 지붕
      for (const [px2, pz2] of [[297, 253], [300, 253], [297, 255], [300, 255]]) { const py = surfaceTop(px2, pz2); for (let y = py; y < hy + 2; y++) setW(px2, y, pz2, ID.oak_fence); }
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
    // ── V61: 실사(Farm.png) — 밭 둘레 잡석 돌담 + 건초 더미 + 흙길(등불) + 사과나무 + 건초 지붕 헛간 ──
    {
      const AND2 = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
      const rubble = (x, z) => {
        const g = surfaceTop(x, z);
        if (zoneAt(x, z) !== 'farm') return;
        const b = getBlockLocal(x, g - 1, z);
        if (b !== ID.grass && b !== ID.dirt && b !== ID.coarse_dirt) return;
        const r = hash3(x, 921, z);
        if (r < 0.22) return;   // 결손(실사의 무너진 담)
        setW(x, g, z, r < 0.5 ? ID.cobblestone : r < 0.75 ? AND2 : ID.mossy_cobblestone);
        if (r > 0.9) setW(x, g + 1, z, ID.cobblestone);
      };
      for (let ci = 0; ci < 6; ci++) {   // 6개 플롯 둘레 잡석 돌담
        const px = 306 + (ci % 3) * 18, pz = 200 + Math.floor(ci / 3) * 26;
        for (let x = px - 1; x <= px + 14; x++) { rubble(x, pz - 1); rubble(x, pz + 20); }
        for (let z = pz - 1; z <= pz + 20; z++) { rubble(px - 1, z); rubble(px + 14, z); }
      }
      // 중앙 흙길(z222~224 스트립) + 등불 + 건초 수레
      for (let x = 286; x <= 352; x++) for (let z = 222; z <= 224; z++) {
        if (zoneAt(x, z) !== 'farm') continue;
        const g = surfaceTop(x, z);
        if (getBlockLocal(x, g - 1, z) === ID.grass) { setW(x, g - 1, z, (x + z) % 7 ? ID.coarse_dirt : ID.gravel); if (getBlockLocal(x, g, z)) setW(x, g, z, 0); }
      }
      for (let x = 290; x <= 350; x += 12) {
        if (zoneAt(x, 221) !== 'farm') continue;
        const g = surfaceTop(x, 221);
        setW(x, g, 221, ID.oak_fence); setW(x, g + 1, 221, ID.glowstone);
      }
      for (const [hx, hz] of [[302, 225], [332, 221], [348, 226]]) {   // 건초 더미
        if (zoneAt(hx, hz) !== 'farm') continue;
        const g = surfaceTop(hx, hz);
        setW(hx, g, hz, ID.hay_block); setW(hx + 1, g, hz, ID.hay_block); setW(hx, g + 1, hz, ID.hay_block);
      }
      // 사과나무 2그루(오크 수관 + 빨간 점)
      for (const [ax, az] of [[296, 219], [340, 227]]) {
        if (zoneAt(ax, az) !== 'farm') continue;
        const g = surfaceTop(ax, az);
        for (let j = 0; j < 4; j++) setW(ax, g + j, az, ID.oak_log);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 3) {
          setW(ax + dx, g + 4, az + dz, hash3(ax + dx, 922, az + dz) < 0.12 ? ID.wool_red : ID.oak_leaves);
          if (Math.abs(dx) + Math.abs(dz) <= 1) setW(ax + dx, g + 5, az + dz, ID.oak_leaves);
        }
      }
      // 건초 지붕 헛간(실사의 짚 지붕 오두막): (296, 226) 6×5
      {
        const bx = 294, bz = 246, gy = surfaceTop(bx + 3, bz + 2);
        let ok = true;
        for (let dx = 0; dx < 7 && ok; dx++) for (let dz = 0; dz < 5 && ok; dz++) if (zoneAt(bx + dx, bz + dz) !== 'farm') ok = false;
        if (ok) {
          for (let dx = -1; dx <= 7; dx++) for (let dz = -1; dz <= 5; dz++) for (let y = gy; y <= gy + 9; y++) setW(bx + dx, y, bz + dz, 0);
          for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 5; dz++) setW(bx + dx, gy - 1, bz + dz, ID.coarse_dirt);
          for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 5; dz++) {
            const edge = dx === 0 || dx === 6 || dz === 0 || dz === 4;
            if (!edge) continue;
            const corner = (dx === 0 || dx === 6) && (dz === 0 || dz === 4);
            for (let y = 0; y < 3; y++) setW(bx + dx, gy + y, bz + dz, corner ? ID.oak_log : y === 1 && dx % 2 === 0 ? ID.glass : ID.spruce_planks);
          }
          setW(bx + 3, gy, bz + 4, 0); setW(bx + 3, gy + 1, bz + 4, 0);   // 남측 입구
          for (let t = 0; t <= 2; t++) for (const dz of [t - 1, 5 - t]) for (let dx = -1; dx <= 7; dx++) setW(bx + dx, gy + 3 + t, bz + dz, ID.hay_block);   // 짚(건초) 지붕
          for (let dx = -1; dx <= 7; dx++) setW(bx + dx, gy + 6, bz + 2, ID.hay_block);
          setW(bx + 3, gy + 1, bz + 2, ID.glowstone);
        }
      }
    }
  }
  function buildForestZone() {
    for (let gx = 0; gx < 12; gx++) for (let gz = 0; gz < 12; gz++) {
      const x = 102 + gx * 7 + Math.floor(hash3(gx, 67, gz) * 4), z = 92 + gz * 7 + Math.floor(hash3(gx, 68, gz) * 4);
      if (zoneAt(x, z) !== 'forest') continue;
      if (Math.hypot(x - 140, z - 132) < 8) continue;   // 오두막 자리
      const r = hash3(x, 69, z);
      // V83: 실제 허브 '숲' 구역 — 참나무 위주(+약간 자작), 짙은참나무 없음
      if (r < 0.62) plantOak(x, z);
      else if (r < 0.74) plantBirch(x, z);
      else if (r < 0.9) { const y = surfaceTop(x, z); setW(x, y, z, r < 0.82 ? ID.tall_grass : (r < 0.86 ? ID.flower_red : ID.flower_yellow)); }
    }
    buildHouse(134, 126, 7, 6, surfaceTop(137, 129), ID.spruce_planks, ID.spruce_planks);
  }
  function buildPondZone() {
    // V24-F(건축 #13): 연못 → 진짜 호수(비대칭 2엽) + 어부 오두막 + 보트하우스 + 부두 2 + 수련잎/갈대
    const lakeY = surfaceTop(322, 322) - 1;
    for (let dx = -16; dx <= 16; dx++) for (let dz = -14; dz <= 14; dz++) {
      const x = 322 + dx, z = 322 + dz;
      const d1 = Math.hypot(dx / 1.3, dz) / 12, d2 = Math.hypot((dx - 7) / 1.1, dz - 8) / 7;   // 본체 + 남동 만(灣)
      if (Math.min(d1, d2) + (hash3(x, 93, z) - 0.5) * 0.14 < 1) {
        setW(x, lakeY, z, ID.water); setW(x, lakeY - 1, z, ID.water); setW(x, lakeY - 2, z, ID.sand);
        setW(x, lakeY + 1, z, 0); setW(x, lakeY + 2, z, 0);   // 물 위 걸림돌 제거
      }
    }
    // 수련잎(물 위 잎 블럭) + 물가 갈대
    for (let i = 0; i < 10; i++) {
      const x = 314 + Math.floor(hash3(i, 94, 1) * 18), z = 314 + Math.floor(hash3(i, 95, 2) * 16);
      if (getBlockLocal(x, lakeY, z) === ID.water && hash3(i, 96, 3) < 0.6) setW(x, lakeY + 1, z, ID.oak_leaves);
    }
    for (let i = 0; i < 8; i++) {
      const x = 310 + Math.floor(hash3(i, 97, 4) * 24), z = 310 + Math.floor(hash3(i, 98, 5) * 24);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.grass && (getBlockLocal(x + 1, y - 1, z) === ID.water || getBlockLocal(x - 1, y - 1, z) === ID.water)) { setW(x, y, z, ID.sugar_cane); setW(x, y + 1, z, ID.sugar_cane); }
    }
    buildHouse(304, 310, 6, 6, surfaceTop(307, 313), ID.oak_planks, ID.spruce_planks);   // 어부 오두막
    // 부두 2개(동/남) — 반블럭 데크 + 끝 랜턴
    const deck = slabIdFor(ID.oak_planks) != null ? slabIdFor(ID.oak_planks) : ID.oak_planks;
    for (let i = 0; i < 7; i++) { setW(316 + i, lakeY + 1, 320, deck); if (i % 3 === 0) setW(316 + i, lakeY, 320, ID.oak_fence); }
    setW(323, lakeY + 1, 320, ID.oak_fence); setW(323, lakeY + 2, 320, ID.glowstone);
    for (let i = 0; i < 5; i++) setW(326, lakeY + 1, 326 + i, deck);
    setW(326, lakeY + 1, 331, ID.oak_fence); setW(326, lakeY + 2, 331, ID.glowstone);
    // 보트하우스(호수 남서변): 3면 벽 + 물로 열린 입구 + 박공
    {
      const bx = 310, bz = 330, by = lakeY + 1;
      for (let y = 0; y < 3; y++) for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 5; dz++) {
        const edge = dx === 0 || dx === 4 || dz === 5;   // 북면(물 방향)은 개방
        if (edge) setW(bx + dx, by + y, bz + dz, y === 0 ? ID.stone_bricks : ID.spruce_planks);
        else if (dz > 0) setW(bx + dx, by + y, bz + dz, 0);
      }
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 6; dz++) setW(bx + dx, by + 3, bz + dz, ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks);
      setW(bx + 2, by + 4, bz + 2, ID.glowstone);
    }
    lampPost(306, 318);
  }
  // V66: 현재 위키의 콜로세움은 수풀에 뒤덮인 폐허 — 검투사 게임플레이(관중석/지하/제단)는 유지하고
  //   외관만 폐허화: 사암 일부를 이끼/조약돌로 풍화, 상단 림 덩굴, 둘레 가문비 숲, 무너진 아치 잔해
  function colosseumOvergrowth() {
    const cx = 224, cz = 352, ROUT = 21;
    // 1) 사암 풍화(약 1/4) — 실사의 회색 이끼 낀 잔해 톤
    for (let x = cx - ROUT - 2; x <= cx + ROUT + 2; x++) for (let z = cz - ROUT - 2; z <= cz + ROUT + 2; z++) {
      for (let y = 16; y <= 34; y++) {
        if (getBlockLocal(x, y, z) !== ID.sandstone) continue;
        const r = hash3(x, 961 + y, z);
        if (r < 0.14) setW(x, y, z, ID.mossy_cobblestone);
        else if (r < 0.24) setW(x, y, z, ID.cobblestone);
      }
    }
    // 2) 상단/관중석에 덩굴 잎 + 풀 포기
    for (let a = 0; a < 60; a++) {
      const th = a / 60 * Math.PI * 2, rr = 12 + hash3(a, 962, 1) * 9;
      const x = cx + Math.round(Math.cos(th) * rr), z = cz + Math.round(Math.sin(th) * rr);
      const t = surfaceTop(x, z);
      const below = getBlockLocal(x, t - 1, z);
      if (below !== ID.sandstone && below !== ID.mossy_cobblestone && below !== ID.cobblestone) continue;
      const r = hash3(x, 963, z);
      if (r < 0.4) setW(x, t, z, ID.oak_leaves);
      else if (r < 0.7) setW(x, t, z, ID.tall_grass);
    }
    // 3) 둘레 가문비 숲(실사의 침엽수 군락)
    for (let a = 0; a < 10; a++) {
      const th = a / 10 * Math.PI * 2 + 0.3;
      const rr = ROUT + 5 + (hash3(a, 964, 2) * 5 | 0);
      const x = cx + Math.round(Math.cos(th) * rr), z = cz + Math.round(Math.sin(th) * rr);
      if (zoneAt(x, z) !== 'arena') continue;
      const t = surfaceTop(x, z);
      if (getBlockLocal(x, t - 1, z) === ID.grass && getBlockLocal(x, t, z) === 0) plantSpruce(x, z);
    }
    // 4) 무너진 아치 잔해(북동 바깥 — 실사의 홀로 선 아치)
    {
      const ax = cx + 26, az = cz - 24;
      if (zoneAt(ax, az) === 'arena') {
        const g = surfaceTop(ax, az);
        for (let y = 0; y < 5; y++) { setW(ax, g + y, az, ID.stone_bricks); setW(ax + 4, g + y, az, hash3(ax, 965, y) < 0.3 ? ID.mossy_cobblestone : ID.stone_bricks); }
        setW(ax + 1, g + 5, az, ID.stone_bricks); setW(ax + 2, g + 5, az, ID.mossy_cobblestone);   // 부러진 상인방(끝이 끊김)
        setW(ax, g + 5, az, ID.stone_bricks); setW(ax + 4, g + 5, az, ID.stone_bricks);
        setW(ax + 2, g, az + 1, ID.cobblestone); setW(ax + 3, g, az + 2, ID.mossy_cobblestone);   // 잔해 더미
        setW(ax, g + 3, az + 1, ID.oak_leaves); setW(ax + 4, g + 2, az - 1, ID.oak_leaves);   // 덩굴
      }
    }
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
    // V59: 실사(Wizard_Tower.png) — 흰(석영) 몸통 + 최상단 퍼퍼 코니스 띠
    for (let y = base; y < base + H; y++) {
      const mat = y >= base + H - 2 ? ID.purpur : ID.quartz_block;
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
      for (let y = base; y < base + H - 3; y++) setW(cx + ox, y, cz + oz, ID.quartz_block);
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
        const BL = ID.wool_blue != null ? ID.wool_blue : ID.purpur;
        setW(x, ry, z, ((a + rr * 3) % 6 === 0) ? ID.purpur : BL);   // V59: 파랑 원뿔 + 퍼퍼 나선 줄무늬
      }
      rr--; ry++;
    }
    // 발광 첨탑(수정 막대)
    for (let i = 0; i < 4; i++) setW(cx, ry + i, cz, i < 3 ? (i === 1 ? ID.purpur : (ID.wool_blue != null ? ID.wool_blue : ID.purpur)) : ID.glowstone);
    // 떠다니는 룬 고리(자수정+발광 — 마력 연출)
    for (const [ox, oz] of [[R + 2, 0], [-(R + 2), 0], [0, R + 2], [0, -(R + 2)]]) setW(cx + ox, base + 10, cz + oz, ID.glowstone);
    // V59: 목재 발코니 링(실사 중단 발코니) — 오크 데크 + 울타리 난간 + 다크오크 지지대
    for (let a = 0; a < 44; a++) {
      const th = a / 44 * Math.PI * 2;
      const x = cx + Math.round(Math.cos(th) * (R + 1)), z = cz + Math.round(Math.sin(th) * (R + 1));
      setW(x, base + 9, z, ID.oak_planks);
      if (a % 2 === 0) setW(x, base + 10, z, ID.oak_fence);
    }
    for (const [ox, oz] of [[R + 1, 0], [-(R + 1), 0], [0, R + 1], [0, -(R + 1)]]) setW(cx + ox, base + 8, cz + oz, ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log);
    // V59: 사이드 터릿(실사 우측 작은 탑) — 석영 소탑 + 다크오크 첨두
    {
      const tx = cx + 6, tz = cz + 3;
      for (let y = base + 7; y <= base + 13; y++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) setW(tx + ox, y, tz + oz, ID.quartz_block);
      setW(tx, base + 11, tz - 1, ID.glass); setW(tx + 1, base + 12, tz + 2, ID.glass);
      const DKP = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
      for (const [ox, oz] of [[-1, -1], [2, -1], [-1, 2], [2, 2], [0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) setW(tx + ox, base + 14, tz + oz, DKP);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) setW(tx + ox, base + 15, tz + oz, DKP);
      setW(tx, base + 16, tz, DKP); setW(tx, base + 17, tz, ID.glowstone);
      for (let y = base + 9; y <= base + 9; y++) { setW(cx + 4, y, cz + 2, ID.oak_planks); setW(cx + 5, y, cz + 2, ID.oak_planks); }   // 연결 브리지
    }
    // V59: 흰 바위 크래그(탑 기단 주변 불규칙 석영/안산암 노두) + 덩굴 잎
    for (let a = 0; a < 20; a++) {
      const th = a / 20 * Math.PI * 2;
      const rr2 = 5 + (hash3(a, 771, 3) * 3 | 0);
      const x = cx + Math.round(Math.cos(th) * rr2), z = cz + Math.round(Math.sin(th) * rr2);
      const g = surfaceTop(x, z);
      const h = 1 + (hash3(a, 772, 7) * 4 | 0);
      for (let y = 0; y < h; y++) setW(x, g + y, z, hash3(a, 773, y) < 0.6 ? ID.quartz_block : (ID.polished_andesite != null ? ID.polished_andesite : ID.stone));
      if (hash3(a, 774, 1) < 0.4) setW(x, g + h, z, ID.oak_leaves);
    }
    for (const [ox, oz, vy] of [[R, 1, 4], [-R, -1, 6], [1, R, 3], [-1, -R, 7], [R, -1, 9]]) {
      for (let i = 0; i < 3; i++) setW(cx + ox + (ox === R ? 1 : ox === -R ? -1 : 0), base + vy - i, cz + oz + (oz === R ? 1 : oz === -R ? -1 : 0), ID.oak_leaves);
    }
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
  // V22-G2: 노후화 패스 — 지역의 석재 벽돌 일부를 이끼/금 간 변형으로 치환(실제 MC 폐허·던전 질감)
  function agingPass(x0, z0, x1, z1, frac) {
    const my = ID.mossy_stone_bricks, cr = ID.cracked_stone_bricks;
    if (my == null || cr == null) return;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 4; y < H - 4; y++) {
      if (getBlockLocal(x, y, z) !== ID.stone_bricks) continue;
      const h = hash3(x * 3 + y, 77, z * 5 - y);
      if (h < frac * 0.55) setW(x, y, z, my);
      else if (h < frac) setW(x, y, z, cr);
    }
  }
  function buildRuinsZone() {
    // V24(감사 #16): 흩뿌린 기둥 '색종이' 폐허 폐기 → 실제 무너진 신전 한 채(좌표 한 칸 단위 손 배치)
    //   구성: 침몰 광장 바닥(76~100 × 268~292) + 열주랑 2열(부러진 높이 변주) + 반쯤 선 서벽 + 쓰러진 보 + 중앙 제단
    const mossy = ID.mossy_cobblestone, sb = ID.stone_bricks, csb = ID.cracked_stone_bricks != null ? ID.cracked_stone_bricks : sb, msb = ID.mossy_stone_bricks != null ? ID.mossy_stone_bricks : mossy;
    const gy = surfaceTop(88, 280);
    // 1) 침몰 신전 바닥(가장자리로 갈수록 파손 — 잔디 침식 패치)
    for (let x = 76; x <= 100; x++) for (let z = 268; z <= 292; z++) {
      if (zoneAt(x, z) !== 'ruins') continue;
      const edge = Math.min(x - 76, 100 - x, z - 268, 292 - z);
      if (edge === 0 && hash3(x, 84, z) < 0.5) continue;   // 테두리는 반쯤 침식
      const r = hash3(x, 85, z);
      setW(x, gy - 1, z, r < 0.3 ? mossy : r < 0.55 ? msb : r < 0.8 ? ID.polished_andesite : csb);
      setW(x, gy, z, 0); setW(x, gy + 1, z, 0);   // 바닥 위 걸림돌 제거
    }
    // 2) 열주랑 2열(z272/z288) — 기둥 높이 2~5 변주(부러짐), 일부만 주두 유지
    const colH = [5, 3, 5, 2, 4, 5, 1];
    [272, 288].forEach((cz, row) => {
      for (let i = 0; i < 7; i++) {
        const cx = 78 + i * 4, h = colH[(i + row * 3) % colH.length];
        for (let j = 0; j < h; j++) setW(cx, gy + j, cz, j === 0 ? sb : (hash3(cx, 86 + j, cz) < 0.35 ? msb : sb));
        if (h >= 5) { const s = stairIdFor(sb, row ? 0 : 2); setW(cx, gy + 5, cz, s != null ? s : sb); }   // 온전한 기둥만 주두
      }
    });
    // 3) 온전한 기둥 위 남은 인방(부분) — z272 열 x78~86만 연결(반쯤 남은 지붕선)
    for (let x = 78; x <= 86; x++) setW(x, gy + 6, 272, hash3(x, 88, 1) < 0.3 ? csb : sb);
    // 4) 반쯤 선 서벽(x76, z270~290) — 높이 파도형 붕괴 + 아치 창 하나
    for (let z = 270; z <= 290; z++) {
      const h = Math.max(1, Math.round(4 + Math.sin((z - 270) * 0.55) * 2 - (z > 284 ? (z - 284) : 0)));
      for (let j = 0; j < h; j++) setW(76, gy + j, z, hash3(76, 89 + j, z) < 0.4 ? msb : sb);
    }
    setW(76, gy + 1, 278, 0); setW(76, gy + 2, 278, 0); setW(76, gy + 3, 278, stairIdFor(sb, 2) || sb);   // 아치 창
    // 5) 쓰러진 보(바닥에 누운 기둥 잔해 — 대각 2개)
    for (let i = 0; i < 5; i++) { setW(90 + i, gy, 276 + (i >> 1), i === 4 ? csb : sb); }
    for (let i = 0; i < 4; i++) { setW(82 + i, gy, 284, msb); }
    // 6) 중앙 제단(치즐 석재 단 + 발광 크리스탈) + 모서리 덤불
    const ch = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : sb;
    setW(88, gy, 280, ch); setW(89, gy, 280, ch); setW(88, gy, 281, ch); setW(89, gy, 281, ch);
    setW(88, gy + 1, 280, ID.glowstone);
    [[78, 270], [98, 290], [98, 270]].forEach(([bx, bz]) => { setW(bx, gy, bz, ID.oak_leaves); setW(bx, gy + 1, bz, ID.oak_leaves); });
    // 7) 입구 아치 게이트(동측, 광장 방향)
    const gx = 100, gz = 280;
    for (let dy = 0; dy < 4; dy++) { setW(gx, gy + dy, gz - 2, sb); setW(gx, gy + dy, gz + 2, dy < 3 ? mossy : sb); }
    setW(gx, gy + 4, gz - 1, stairIdFor(sb, 3) || sb); setW(gx, gy + 4, gz, sb); setW(gx, gy + 4, gz + 1, stairIdFor(sb, 1) || sb);
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
  // V20-T: 포탈은 목적지별 고유 생김새 — 함수 대칭 복붙 금지, 한 칸씩 손 지정(비대칭).
  //   개구부는 (dx 0..1)×(dy 1..3), z=cz 로 비워 둠(이펙트 평면이 그 안에 채워짐).
  // 허브의 "내 섬행" 포탈 — 이끼 낀 고대 자연 신전(덩굴/꽃/초록 크리스탈)
  function buildHubPortal() {
    const cx = PORTALS.hub.x, cz = PORTALS.hub.z;
    // V56: 부지에 가로등 링(반경14) 등이 서 있으면 surfaceTop이 그 꼭대기를 가리켜 포탈이 공중 부양하던 버그 —
    //   포탈 자리(기둥 dx-2..3 × dz-1..2)를 먼저 비우고 광장 보행 높이에 세운다
    for (let dx = -2; dx <= 3; dx++) for (let dz = -1; dz <= 2; dz++) for (let y = 20; y <= 34; y++) setW(cx + dx, y, cz + dz, 0);
    const gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const moss = ID.mossy_cobblestone, cob = ID.cobblestone, sb = ID.stone_bricks, ch = ID.chiseled_stone_bricks, glow = ID.glowstone, leaf = ID.oak_leaves;
    const seaL = ID.sea_lantern != null ? ID.sea_lantern : ID.glowstone;
    // 좌 기둥(이끼돌, 정면 덩굴)
    B(-1, 0, 0, moss); B(-1, 1, 0, cob); B(-1, 2, 0, moss); B(-1, 3, 0, sb); B(-1, 4, 0, ch); B(-1, 5, 0, glow);
    B(-1, 3, 1, leaf); B(-1, 2, 1, leaf); B(-1, 0, 1, moss); B(-1, 0, -1, cob);
    // 우 기둥(살짝 높고 재질순 다름 — 비대칭)
    B(2, 0, 0, cob); B(2, 1, 0, moss); B(2, 2, 0, sb); B(2, 3, 0, moss); B(2, 4, 0, ch); B(2, 5, 0, sb); B(2, 6, 0, glow);
    B(2, 4, 1, leaf); B(2, 3, 1, leaf); B(2, 0, 1, moss); B(2, 0, -1, moss);
    // 바닥 문지방 + 상단 인방
    B(0, 0, 0, moss); B(1, 0, 0, cob); B(0, 4, 0, sb); B(1, 4, 0, ch);
    // 아치(계단 물매) + 정상 초록 크리스탈
    B(0, 5, 0, ID.stone_bricks_stairs_3 != null ? ID.stone_bricks_stairs_3 : sb); B(1, 5, 0, ID.stone_bricks_stairs_1 != null ? ID.stone_bricks_stairs_1 : sb);
    B(0, 6, 0, seaL);
    // 인방 덩굴 커튼
    B(0, 4, 1, leaf); B(1, 4, 1, leaf); B(0, 3, 1, leaf);
    // 기단 주변 손 배치 꽃·풀·이끼
    B(-2, 0, 0, moss); B(3, 0, 0, moss); B(-1, 0, 2, ID.flower_yellow); B(2, 0, 2, ID.flower_red);
    B(0, 0, 2, ID.tall_grass); B(1, 0, 2, ID.tall_grass); B(-2, 1, 0, ID.flower_red); B(3, 1, 0, ID.flower_yellow);
  }
  // 프라이빗 섬의 "허브(도시)행" 포탈 — 웅장한 황금·석영 아치(배너/랜턴)
  function buildHomePortal() {
    const hp = PORTALS.home;
    if (!hp) return;
    const cx = hp.x, cz = hp.z, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const q = ID.quartz_block, ch = ID.chiseled_stone_bricks, sb = ID.stone_bricks, gold = ID.gold_ore, glow = ID.glowstone;
    const woolR = ID.wool_red != null ? ID.wool_red : q, woolY = ID.wool_yellow != null ? ID.wool_yellow : q;
    // 좌 기둥(석영+금 장식)
    B(-1, 0, 0, ch); B(-1, 1, 0, q); B(-1, 2, 0, q); B(-1, 3, 0, gold); B(-1, 4, 0, q); B(-1, 5, 0, glow);
    B(-1, 0, 1, ch); B(-1, 0, -1, ch);
    // 우 기둥
    B(2, 0, 0, ch); B(2, 1, 0, q); B(2, 2, 0, q); B(2, 3, 0, gold); B(2, 4, 0, q); B(2, 5, 0, glow);
    B(2, 0, 1, ch); B(2, 0, -1, ch);
    // 문지방(금테) + 인방(석영)
    B(0, 0, 0, gold); B(1, 0, 0, gold); B(0, 4, 0, q); B(1, 4, 0, q);
    // 아치(석영 계단) + 금 첨탑 + 정상 발광
    B(0, 5, 0, ID.quartz_block_stairs_3 != null ? ID.quartz_block_stairs_3 : q); B(1, 5, 0, ID.quartz_block_stairs_1 != null ? ID.quartz_block_stairs_1 : q);
    B(0, 6, 0, gold); B(0, 7, 0, glow);
    // 양옆 배너 + 랜턴 기둥
    B(-2, 0, 0, ch); B(-2, 1, 0, woolR); B(-2, 2, 0, woolR); B(-2, 3, 0, woolR); B(-2, 4, 0, glow);
    B(3, 0, 0, ch); B(3, 1, 0, woolY); B(3, 2, 0, woolY); B(3, 3, 0, woolY); B(3, 4, 0, glow);
    // 레드카펫 진입로
    B(0, -1, 1, woolR); B(1, -1, 1, woolR); B(0, -1, 2, woolR); B(1, -1, 2, woolR);
  }
  // Private island: a single small SkyBlock starter island, with no house and no detached portal island.
  const HOME_SPAWN = { x: 96, z: 104, r: 8 };     // 스폰섬(작음) — 시작 나무
  const HOME_PISLE = { x: 96, z: 78, r: 7 };      // 포탈섬(작음) — 제작한 섬 포탈 설치 자리(스폰섬과 끊겨 시작)
  const HOME_TOP = 20;
  function genHomeBlob(cx, cz, baseR, seed) {
    for (let x = cx - baseR - 3; x <= cx + baseR + 3; x++) for (let z = cz - baseR - 3; z <= cz + baseR + 3; z++) {
      if (x < HOME_BOUNDS.x0 || x > HOME_BOUNDS.x1 || z < HOME_BOUNDS.z0 || z > HOME_BOUNDS.z1) continue;
      const ang = Math.atan2(z - cz, x - cx);
      // 방향별 반경(비대칭) — 여러 사인 성분 + 해시 지터
      const rr = baseR * (0.78 + 0.22 * Math.sin(ang * 2 + seed) + 0.12 * Math.sin(ang * 3 - seed) + (hash3(x, seed, z) - 0.5) * 0.28);
      const d = Math.hypot(x - cx, z - cz);
      if (d > rr) continue;
      const surf = HOME_TOP;   // V22-H3: 실제 프라이빗 섬처럼 완전 평평 — 무작위 요철이 작은 섬을 조각나 보이게 하던 문제 수정
      const depth = 3 + Math.floor((rr - d) * 0.55 + (hash3(x, seed + 3, z)) * 2);   // 밑면 두께 변주(기복)
      for (let y = surf; y >= surf - depth; y--) {
        let id = ID.stone;
        if (y === surf) id = ID.grass; else if (y >= surf - 2) id = ID.dirt;
        setW(x, y, z, id);
      }
    }
  }
  function genHome(editsOverride) {
    world = new Uint16Array(W * H * Dp);   // 공허 하늘 — 진짜 스카이블럭 프라이빗 섬
    genHomeBlob(HOME_SPAWN.x, HOME_SPAWN.z, HOME_SPAWN.r, 31);
    genHomeBlob(HOME_PISLE.x, HOME_PISLE.z, HOME_PISLE.r, 57);
    // V21-C: 실제 스카이블럭처럼 스폰섬↔포탈섬은 '끊겨' 시작 — 직접 블록으로 다리를 놓아야 건너감(자동 다리 제거)
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
    // V21-C: 시작 집 제거 — 실제 스카이블럭 프라이빗 섬은 맨 섬 + 나무 한 그루로 시작
    // 스폰섬 꽃/풀 장식
    for (let i = 0; i < 8; i++) {
      const x = HOME_SPAWN.x + Math.round((hash3(i, 81, 3) - 0.5) * HOME_SPAWN.r * 1.3);
      const z = HOME_SPAWN.z + Math.round((hash3(i, 82, 7) - 0.5) * HOME_SPAWN.r * 1.3);
      const y = surfaceTop(x, z);
      if (y > 2 && getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, hash3(i, 83, 1) < 0.4 ? ID.flower_red : (hash3(i, 84, 1) < 0.5 ? ID.flower_yellow : ID.tall_grass));
    }
    // 포탈섬: 허브행 황금 아치(실제 스블처럼 섬에 상시 존재 — 스폰섬에서 다리를 놓아 건너감)
    buildHomePortal();
    // 저장된 블록 편집 적용(설치/파괴 영속)
    const edits = editsOverride || (econApi().getHomeEdits ? econApi().getHomeEdits() : {});
    let _pruned = 0;
    for (const k in edits) {
      const p = k.split(',').map(Number);
      if (!inBounds(p[0], p[1], p[2])) continue;
      // V24-F(감사 #44): 기반 지형과 동일한 편집(부쉈다 원상복구/의미 없는 0)은 저장에서 제거 — 6,000키 상한 낭비 방지
      if (!editsOverride && world[widx(p[0], p[1], p[2])] === edits[k]) { delete edits[k]; _pruned++; continue; }
      world[widx(p[0], p[1], p[2])] = edits[k];
    }
  }
  // V21-C: 설치형 섬 포탈 프레임 — 포탈 아이템 설치 시 포탈섬에 목적지별 미니 관문을 세우고 영속(setHomeEdit).
  const PORTAL_SLOT_ORDER = ['barn', 'park', 'gold', 'deep', 'spider', 'mushroom', 'nether', 'end'];
  const PORTAL_FRAME_COL = { barn: 'hay_block', park: 'oak_log', gold: 'gold_ore', deep: 'diamond_ore', spider: 'mossy_cobblestone', mushroom: 'mushroom_red_block', nether: 'netherrack', end: 'end_stone' };
  function installPortalFrame(dest) {
    if (worldMode !== 'home') return false;
    const idx = PORTAL_SLOT_ORDER.indexOf(dest); if (idx < 0) return false;
    const api = econApi();
    const px = HOME_PISLE.x - 7 + (idx % 4) * 4, pz = HOME_PISLE.z - 4 + Math.floor(idx / 4) * -3;
    const gy = Math.max(HOME_TOP, surfaceTop(px, pz));
    const put = (x, y, z, id) => { if (!inBounds(x, y, z) || id == null) return; world[widx(x, y, z)] = id; if (api.setHomeEdit) api.setHomeEdit(x, y, z, id); markBlockDirty(x, z); };
    const accent = ID[PORTAL_FRAME_COL[dest]] != null ? ID[PORTAL_FRAME_COL[dest]] : ID.quartz_block;
    for (let dy = 0; dy <= 2; dy++) { put(px - 1, gy + dy, pz, ID.quartz_block); put(px + 1, gy + dy, pz, ID.quartz_block); }   // 기둥
    put(px, gy + 2, pz, accent);                                        // 상인방(목적지 재질)
    put(px, gy - 1, pz, accent);                                        // 발판(목적지 재질)
    put(px, gy + 3, pz, ID.glowstone);                                  // 발광 표식
    put(px, gy, pz, ID['portal_' + dest]);                              // 실제 포탈 블록(우클릭=워프, hasHomePortal 인식)
    _mapDirty = true;
    return true;
  }
  // 월드 이동(허브 ↔ 프라이빗 섬 ↔ 남의 섬 방문)
  function travelTo(mode, force) {
    if (mode === worldMode && !force) return;
    restoreAllRegen(); clearMobs(); stopFishing(); clearParticles(); mouseHeld = false; useHeld = false; warpCharge = null;
    P._boat = false; removeBoatMesh();   // V21-E2: 월드 이동 시 보트 하선
    P._fallPeak = null; P._air = 0; P._lavaT = 0;   // V22-K: 월드 이동 후 낙하/익사 계산 초기화
    P._portalT = 0; setPortalFx(false);   // V23-A: 포탈 울렁임 해제
    if (worldMode === 'dungeon' && mode !== 'dungeon') { dungeonState = null; partyGuestMode = false; }
    if (world && worldMode !== 'visit' && worldMode !== 'dungeon') {   // 현재 월드 캐시(널 월드 금지)
      worldCache[worldMode] = { world, W, H, Dp, _at: (worldCache[worldMode] && worldCache[worldMode]._at || 0) + 1, _map: _mapWorldActive };   // V101: 맵 월드 여부 캐시(재방문 복원용)
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
    _mapWorldActive = false;
    clearMapSpawnAreas();   // V98: 이전 맵 월드의 임포트 스폰 구역 정리(절차 월드 오염 방지)
    if (mode === 'home') genHome();
    else if (mode === 'visit') genHome(visitData && visitData.homeEdits);
    else if (worldCache[mode]) { const c = worldCache[mode]; world = c.world; W = c.W; H = c.H; Dp = c.Dp; if (c._map) { _mapWorldActive = true; buildWarpPads(); genMapSpawnAreas(mode); } }   // V101: 캐시 재방문 시 맵 월드 플래그·워프·지형 맞춤 스폰 복원(공허 낙사/오스폰 회귀 방지)
    else if (mode === 'hub') genWorld();
    else if (ISLAND_MAPS[mode] && genIslandFromMap(ISLAND_MAPS[mode])) { _mapWorldActive = true; buildWarpPads(); genMapSpawnAreas(mode); }   // 실제 섬 맵 파일 로드 성공 시(용량 초과면 false→절차 폴백) + 워프 패드 + 지형 맞춤 몹 스폰 재생성
    else if (def.gen) { def.gen(); scatterWorldDetail(mode); buildThemeStructures(mode); if (mode === 'park') buildParkGates(); }   // V16 데코 + V18-C 테마 건물 + V21-D2 파크 게이트(맨 마지막)
    if (mode === 'hub') resetPlayerToSpawn();
    else if (mode === 'home' || mode === 'visit') { P.x = 96.5; P.z = 104.5; P.y = surfaceTop(96, 104) + 0.02; P.yaw = Math.PI; }   // V13-A: 스폰섬
    else if (_mapWorldActive) { const cx = W >> 1, cz = Dp >> 1; P.x = cx + 0.5; P.z = cz + 0.5; P.y = mapCenterTop(cx, cz) + 0.02; P.yaw = Math.PI; }   // 실제 섬 맵 중앙 지표 (V97(A8): 네더 지붕 회피)
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
      lay(x, z, ID.coarse_dirt);   // V53: 실제 허브 탑뷰 대조 — 방사 도로는 다져진 흙길
      const side = hash3(x, 601, z) < 0.4 ? ID.gravel : ID.dirt;
      if (horiz) { lay(x, z - 1, side); lay(x, z + 1, side); }
      else { lay(x - 1, z, side); lay(x + 1, z, side); }
      if (horiz) x += x1 > x ? 1 : -1; else z += z1 > z ? 1 : -1;
    }
  }

  // V21-D9: 나무 위 나무 방지(전 수종 공통) — 진짜 지면 위에서만 심는다. surfaceTop이 이웃 나무
  //   캐노피 위를 반환하면(밑이 잎/통나무) 심기를 거부해 '나무 위 나무'가 생기지 않는다.
  function plantable(x, z, extraIds) {
    const y0 = surfaceTop(x, z); if (y0 <= 2) return false;
    const u = getBlockLocal(x, y0 - 1, z);
    if (u === ID.grass || u === ID.dirt || u === ID.coarse_dirt) return true;
    return !!(extraIds && extraIds.indexOf(u) >= 0);
  }
  function plantOak(x, z) {
    if (!plantable(x, z)) return;
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 4; i++) setW(x, y0 + i, z, ID.oak_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 3; dy <= 5; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + (dy - 4 > 0 ? dy - 4 : 0) <= 3 && !(dx === 0 && dz === 0 && dy < 4)) {
        if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.oak_leaves);
      }
    }
  }
  function plantBirch(x, z) {
    if (!plantable(x, z)) return;
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 5; i++) setW(x, y0 + i, z, ID.birch_log);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 4; dy <= 6; dy++) {
      if (!(dx === 0 && dz === 0 && dy < 5)) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.oak_leaves); }
    }
  }
  function plantSpruce(x, z) {
    if (!plantable(x, z, [ID.snow_block])) return;
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
  // V20-AH: 포탈 도착 광장 — 섬마다 완전히 다른 고유 컨셉을 좌표 한 칸씩 손 배치.
  //   스폰(플레이어가 떨어지는 지점) 주위에 테마 포장·관문 아치·조명·벤치·중심 조형을 세운다.
  function buildArrivalPlaza(mode) {
    const SP = { park: [72, 128], barn: [72, 128], gold: [56, 100], deep: [48, 84], spider: [64, 100], nether: [64, 96], end: [64, 100], mushroom: [72, 120] };
    if (!SP[mode]) return;
    const [cx, cz] = SP[mode]; const gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const clr = (dx, dy, dz) => { if (inBounds(cx + dx, gy + dy, cz + dz)) setW(cx + dx, gy + dy, cz + dz, 0); };
    // 공통: 원형 포장 바닥(반경 6, 테마별 재질 2종 무늬) + 머리 위 공간 클리어
    const pave = (a, b) => { for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { if (dx * dx + dz * dz > 40) continue; B(dx, 0, dz, ((dx + dz) & 1) ? a : b); for (let y = 1; y <= 4; y++) clr(dx, y, dz); } };
    const glow = ID.glowstone;
    if (mode === 'nether') {
      // 🔥 지옥문 광장: 네더벽돌 포장 + 흑요석 대아치(마그마 키스톤) + 용암 화로 4기
      pave(ID.nether_bricks, ID.obsidian);
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, ID.obsidian); B(3, y, -5, ID.obsidian); }
      B(-2, 5, -5, ID.obsidian); B(2, 5, -5, ID.obsidian); B(-1, 6, -5, ID.obsidian); B(1, 6, -5, ID.obsidian); B(0, 7, -5, ID.magma_block);   // 뾰족 아치머리
      for (const [ox, oz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) { B(ox, 1, oz, ID.nether_bricks); B(ox, 2, oz, ID.magma_block); B(ox + (ox < 0 ? 1 : -1), 1, oz, ID.lava); B(ox, 3, oz, glow); }   // 용암 화로
      B(0, 1, 0, ID.magma_block); B(0, 2, 0, glow);   // 중앙 화심
    } else if (mode === 'end') {
      // 🌌 공허 관문: 자수정 포장(흑요석 상감) + 엔드로드 기둥 4주 + 부유 아치
      pave(ID.purpur, ID.obsidian);
      for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { for (let y = 1; y <= 3; y++) B(ox, y, oz, ID.purpur); B(ox, 4, oz, ID.purpur); B(ox, 5, oz, glow); }   // 엔드로드 기둥(자수정 — 엔드엔 목재 없음)
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, ID.purpur); B(3, y, -5, ID.purpur); } for (let dx = -3; dx <= 3; dx++) B(dx, 5, -5, ID.purpur); B(0, 6, -5, glow);   // 부유 아치
      B(0, 1, 0, ID.obsidian); B(0, 2, 0, ID.purpur); B(0, 3, 0, glow);   // 중앙 엔더 수정
    } else if (mode === 'spider') {
      // 🕷️ 거미굴 초입: 이끼조약돌 포장 + 다크오크 관문 + 거미줄 장막
      pave(ID.mossy_cobblestone, ID.cobblestone);
      const dlog = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, dlog); B(3, y, -5, dlog); } for (let dx = -3; dx <= 3; dx++) B(dx, 5, -5, dlog);
      B(-2, 4, -5, ID.wool_white); B(0, 4, -5, ID.wool_white); B(2, 4, -5, ID.wool_white); B(-1, 3, -5, ID.wool_white); B(1, 3, -5, ID.wool_white);   // 거미줄 장막
      for (const [ox, oz] of [[-5, -2], [5, -2], [-5, 2], [5, 2]]) { B(ox, 1, oz, ID.oak_fence); B(ox, 2, oz, glow); }
      B(0, 1, 0, ID.mossy_cobblestone); B(0, 2, 0, ID.wool_white); B(0, 3, 0, glow);
    } else if (mode === 'gold') {
      // ⛏️ 광산 정문: 석재 포장 + 목재 헤드프레임 아치 + 광차 + 랜턴
      pave(ID.stone_bricks, ID.polished_andesite != null ? ID.polished_andesite : ID.stone);
      const log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, log); B(3, y, -5, log); } for (let dx = -3; dx <= 3; dx++) B(dx, 5, -5, log);
      B(-1, 6, -5, ID.oak_planks); B(1, 6, -5, ID.oak_planks); B(0, 6, -5, log);   // 헤드프레임 꼭대기
      B(3, 1, 2, ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks); B(3, 2, 2, ID.oak_fence); B(4, 1, 2, ID.gold_ore);   // 광차 + 금광
      for (const [ox, oz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) { B(ox, 1, oz, ID.oak_fence); B(ox, 2, oz, glow); }
      B(0, 1, 0, ID.gold_ore); B(0, 2, 0, glow);
    } else if (mode === 'deep') {
      // 💎 지하 승강장: 석벽돌 포장 + 보석 램프 기둥 + 리프트 케이지 아치
      pave(ID.stone_bricks, ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks);
      const seaL = ID.sea_lantern != null ? ID.sea_lantern : glow;
      for (const [ox, oz, gem] of [[-4, -4, ID.diamond_ore], [4, -4, ID.emerald_ore], [-4, 4, ID.lapis_ore], [4, 4, ID.redstone_ore]]) { for (let y = 1; y <= 2; y++) B(ox, y, oz, ID.stone_bricks); B(ox, 3, oz, gem); B(ox, 4, oz, seaL); }   // 보석 램프 기둥
      for (let y = 1; y <= 4; y++) { B(-2, y, -5, ID.oak_fence); B(2, y, -5, ID.oak_fence); } for (let dx = -2; dx <= 2; dx++) B(dx, 5, -5, ID.stone_bricks);   // 리프트 케이지
      B(0, 1, 0, ID.diamond_ore); B(0, 2, 0, seaL);
    } else if (mode === 'mushroom') {
      // 🍄 버섯 관문: 균사 포장 + 거대버섯 아치(버섯대+붉은 갓) + 포자 램프
      pave(ID.mycelium, ID.sand);
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, ID.mushroom_stem); B(3, y, -5, ID.mushroom_stem); }
      for (let dx = -3; dx <= 3; dx++) { B(dx, 5, -5, ID.mushroom_red_block); B(dx, 4, -5, dx % 2 ? ID.mushroom_red_block : ID.quartz_block); }   // 붉은 갓 아치(흰 점박이)
      for (const [ox, oz] of [[-5, -2], [5, -2], [-5, 2], [5, 2]]) { B(ox, 1, oz, ID.mushroom_stem); B(ox, 2, oz, glow); }   // 포자 램프
      B(0, 1, 0, ID.mushroom_stem); B(0, 2, 0, ID.mushroom_red_block); B(0, 3, 0, glow);
    } else if (mode === 'barn') {
      // 🌾 농장 정문: 판자 포장 + 목재 게이트 아치 + 건초 + 울타리
      pave(ID.oak_planks, ID.dirt);
      const log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log, hay = ID.hay_block != null ? ID.hay_block : ID.wool_yellow;
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, log); B(3, y, -5, log); } for (let dx = -3; dx <= 3; dx++) B(dx, 5, -5, log);
      B(-2, 5, -5, ID.wool_red); B(0, 5, -5, ID.wool_red); B(2, 5, -5, ID.wool_red);   // 붉은 간판 띠
      B(-4, 1, 3, hay); B(-3, 1, 3, hay); B(-4, 2, 3, hay); B(4, 1, -3, hay);   // 건초 더미
      for (let d = -5; d <= 5; d += 2) { B(d, 1, 5, ID.oak_fence); }
      for (const [ox, oz] of [[-5, 0], [5, 0]]) { B(ox, 1, oz, ID.oak_fence); B(ox, 2, oz, glow); }
    } else if (mode === 'park') {
      // 🌲 삼림 입구: 스프루스 포장 + 통나무 아치 + 꽃 화분 + 랜턴
      pave(ID.spruce_planks, ID.oak_planks);
      for (let y = 1; y <= 4; y++) { B(-3, y, -5, ID.spruce_log); B(3, y, -5, ID.spruce_log); } for (let dx = -3; dx <= 3; dx++) B(dx, 5, -5, ID.spruce_log);
      B(-2, 6, -5, ID.spruce_planks_slab != null ? ID.spruce_planks_slab : ID.spruce_planks); B(2, 6, -5, ID.spruce_planks_slab != null ? ID.spruce_planks_slab : ID.spruce_planks);
      for (const [ox, oz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) { B(ox, 1, oz, ID.oak_fence); B(ox, 2, oz, glow); }
      B(-4, 1, 3, ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_planks); B(4, 1, -3, ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_planks);   // 화분(잎)
      B(0, 1, 0, ID.spruce_log); B(0, 2, 0, glow);
    }
  }
  // V26-C: 테마 월드 산장/전초기지 표준 인테리어 — 침대/상자/제작대/화로or서가/러그/조명(빈 껍데기 해소)
  function furnishThemeLodge(cx, cz, mode) {
    const gy = surfaceTop(cx, cz);
    const put = (dx, dy, dz, id) => { if (id != null && getBlockLocal(cx + dx, gy + dy, cz + dz) === 0) setW(cx + dx, gy + dy, cz + dz, id); };
    put(-1, 0, -1, ID.bed);
    put(1, 0, -1, ID.chest);
    put(1, 0, 1, ID.crafting_table);
    put(-1, 0, 1, mode === 'gold' ? ID.furnace : ID.bookshelf);
    put(0, 2, 0, ID.glowstone);
    const rug = ID.wool_red != null ? ID.wool_red : null;
    if (rug != null && getBlockLocal(cx, gy - 1, cz) !== 0) setW(cx, gy - 1, cz, rug);
  }
  function buildThemeStructures(mode) {
    const ok = (x, z) => surfaceTop(x, z) > 3;
    const base = (x, z) => surfaceTop(x, z) + 1;
    buildArrivalPlaza(mode);   // V20-AH: 섬마다 고유 컨셉 포탈 도착 광장(손 배치)
    if (mode === 'park' && ok(70, 100)) { buildHouse(67, 97, 7, 6, base(70, 100), ID.spruce_planks, ID.oak_planks, ID.oak_log); furnishThemeLodge(70, 100, 'park'); buildParkCenter(); buildOtherDetail('park'); }   // 삼림 산장 + V24: 중앙 파빌리온(죽은 코드였음, 감사 #20) + 디테일
    else if (mode === 'barn' && ok(58, 100)) { buildBarnEstate(); buildOtherDetail('barn'); }   // V20-AB 대형 농장 + V20-BA(6차) 디테일
    else if (mode === 'gold' && ok(50, 90)) { buildGoldOutpost(); buildGoldDetail(); buildGoldLandmarks(); buildGoldGate(); furnishThemeLodge(50, 90, 'gold'); }   // V67: 실사(Gold_Mine.png) 대문/광장   // V20-W 전초기지 + V20-AX 디테일 + V20-BG(7차) 노란림 플랫폼/딥캐번 포탈/용암류
    else if (mode === 'deep' && ok(48, 80)) buildDeepDepot();   // V20-X: 손 배치 지하 크리스탈 채광 정거장
    else if (mode === 'spider' && ok(74, 88)) { buildSpiderNest(); buildSpiderRegions(); buildMonsterDetail('spider'); buildSpiderDressing(); }   // + V69: 실사(Spider's_Den.png) 독성 연못/거미줄 드레이프/알집/오두막
    else if (mode === 'nether' && ok(62, 78)) { buildNetherKeep(); buildCrimsonRegions(); buildMonsterDetail('nether'); }   // V20-Y 네더 요새 + V21-D4 크림슨 구역 + V20-AZ 디테일
    else if (mode === 'end' && ok(62, 84)) { buildEndSanctum(); buildEndLandmarks(); buildMonsterDetail('end'); }   // V20-Z 성소 + V20-BE(7차) Dragon's Nest/View + V20-AZ 디테일
    else if (mode === 'mushroom' && ok(58, 100)) {
      buildMushroomColony(); buildMushroomZones(); buildOtherDetail('mushroom');   // V20-AC 군락 + V20-BH(7차) 명명 구역 + V20-BA 디테일
      // V22-G2: 사막 건축 사암 변주 — 일부를 붉은/매끄러운 사암으로(실제 사막 구조물 질감)
      if (ID.red_sandstone != null) for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) for (let y = 4; y < H - 4; y++) {
        if (getBlockLocal(x, y, z) !== ID.sandstone) continue;
        const h = hash3(x + y, 81, z - y);
        if (h < 0.22) setW(x, y, z, ID.red_sandstone);
        else if (h < 0.4) setW(x, y, z, ID.smooth_sandstone);
      }
    }
  }
  // V20-W: 골드 광산 대형 전초기지 — 좌표 한 칸씩 손 배치(대칭 함수 아님).
  //   중심(50,90): 갱도 + 목재 헤드프레임 타워 + 도르래 + 광차 데크 + 광석 창고 + 감독관 오두막.
  function buildGoldOutpost() {
    const cx = 50, cz = 90, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log, plank = ID.oak_planks, cob = ID.cobblestone, sb = ID.stone_bricks;
    const and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, gold = ID.gold_ore, glow = ID.glowstone, fence = ID.oak_fence, chest = ID.chest != null ? ID.chest : plank;
    const st = (mat, f) => (ID[mat + '_stairs_' + f] != null ? ID[mat + '_stairs_' + f] : (mat === 'oak_planks' ? plank : sb));
    const slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : plank;
    // ── 석재 기단(넓은 데크) + 갱도 개구부(3×3) ──
    for (let dx = -5; dx <= 6; dx++) for (let dz = -5; dz <= 6; dz++) B(dx, -1, dz, ((dx + dz) & 1) ? cob : and_);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { for (let y = -1; y >= -6; y--) B(dx, y, dz, 0); B(dx, -7, dz, sb); }   // 갱도 수직굴
    B(0, -7, 0, glow);                                                             // 갱도 바닥 발광
    for (let y = -2; y >= -6; y--) { B(-2, y, 0, gold); B(2, y, 0, gold); B(0, y, -2, gold); B(0, y, 2, gold); }   // 갱벽 금맥
    // 갱도 테두리 통나무 틀 + 안전난간(울타리)
    for (const [ex, ez] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { B(ex, 0, ez, log); B(ex, 1, ez, log); }
    for (let d = -2; d <= 2; d++) { B(d, 0, -2, fence); B(d, 0, 2, fence); B(-2, 0, d, fence); B(2, 0, d, fence); }
    B(0, 0, 2, 0); B(1, 0, 2, 0);                                                  // 진입 틈(난간 열기)
    // ── 목재 헤드프레임 타워(갱도 위 A자 골조 + 도르래 바퀴 + 밧줄) ──
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 2; y <= 7; y++) B(lx, y, lz, log);   // 4다리
    for (let d = -2; d <= 2; d++) { B(d, 7, -2, log); B(d, 7, 2, log); B(-2, 7, d, log); B(2, 7, d, log); }        // 상단 사각 보
    B(-1, 8, -1, st('oak_planks', 0)); B(1, 8, -1, st('oak_planks', 2)); B(-1, 8, 1, st('oak_planks', 0)); B(1, 8, 1, st('oak_planks', 2));   // A자 경사
    B(0, 9, 0, log); B(0, 10, 0, and_);                                            // 정상 도르래 축 + 바퀴
    B(0, 8, 0, fence); B(0, 7, 0, fence); B(0, 6, 0, fence);                       // 도르래 밧줄(갱도로 내려감)
    // 대각 브레이스(계단)
    B(-2, 3, -1, st('oak_planks', 3)); B(2, 3, 1, st('oak_planks', 1)); B(-1, 3, 2, st('oak_planks', 0)); B(1, 3, -2, st('oak_planks', 2));
    // ── 광차 데크 + 레일(안산암 띠) + 광차 2대(슬랩+울타리 표현) ──
    for (let dx = 3; dx <= 6; dx++) B(dx, -1, 0, and_);                            // 레일 라인(동→창고)
    B(3, 0, 0, slab); B(3, 1, 0, fence); B(4, 0, 0, gold);                         // 광차1(광석 실림)
    B(5, 0, -1, slab); B(5, 1, -1, fence);                                         // 광차2
    // ── 광석 창고(오픈 셸터: 기둥 4 + 지붕 + 광석 더미 + 상자) ──
    for (const [px, pz] of [[4, -4], [6, -4], [4, -2], [6, -2]]) { B(px, 0, pz, log); B(px, 1, pz, log); B(px, 2, pz, log); }
    for (let dx = 4; dx <= 6; dx++) for (let dz = -4; dz <= -2; dz++) B(dx, 3, dz, st('oak_planks', 0));   // 셸터 지붕(경사)
    B(5, 0, -3, gold); B(4, 0, -3, gold); B(6, 0, -3, chest); B(5, 1, -3, gold);   // 금 더미 + 상자
    B(4, 2, -4, glow); B(6, 2, -2, glow);                                          // 창고 랜턴
    // ── 감독관 오두막(작은 방: 벽+문+창+책상+등불) ──
    for (let dx = -6; dx <= -3; dx++) for (let dz = -4; dz <= -1; dz++) { const edge = dx === -6 || dx === -3 || dz === -4 || dz === -1; if (edge) { B(dx, 0, dz, cob); B(dx, 1, dz, ((dx + dz) & 1) ? plank : cob); B(dx, 2, dz, cob); } }
    B(-4, 0, -1, 0); B(-4, 1, -1, 0);                                              // 문 개구부
    B(-4, 0, -1, ID.oak_door_c_0 != null ? ID.oak_door_c_0 : 0); B(-4, 1, -1, ID.oak_door_c_0 != null ? ID.oak_door_c_0 : 0);
    B(-5, 1, -4, ID.glass); B(-6, 1, -3, ID.glass);                               // 창
    for (let dx = -5; dx <= -4; dx++) for (let dz = -3; dz <= -2; dz++) B(dx, 2, dz, plank);   // 지붕
    B(-5, 0, -3, st('oak_planks', 2)); B(-5, 1, -3, slab);                         // 책상
    B(-4, 2, -2, glow);                                                            // 실내 등불
    // ── 주변 손 배치 디테일: 통나무 더미·양동이(울타리)·가로등·마른덤불 대신 조약돌 바위 ──
    B(3, 0, 3, log); B(4, 0, 3, log); B(3, 1, 3, log);                             // 통나무 더미
    B(-3, 0, 4, cob); B(-2, 0, 4, cob); B(-3, 1, 4, cob);                          // 바위 무더기
    B(6, 0, 4, fence); B(6, 1, 4, glow);                                           // 가로등
    B(-5, 0, 3, fence); B(-5, 1, 3, glow);                                         // 가로등2
  }
  // V20-BH 7차: 버섯 사막 명명 구역(리서치 반영) — Desert Settlement(동측 사막 사암 마을) +
  //   Trapper's/Jake's Shack(서측 균사 오두막) + Oasis 강조. (실제 서브존: Desert Settlement·Oasis·
  //   Mushroom Gorge·Trapper's Shack 등)
  function buildMushroomZones() {
    const sand = ID.sandstone, sst = (f) => (ID['sandstone_stairs_' + f] != null ? ID['sandstone_stairs_' + f] : sand), sslab = ID.sandstone_slab != null ? ID.sandstone_slab : sand;
    const glow = ID.glowstone, water = ID.water, stem = ID.mushroom_stem, rcap = ID.mushroom_red_block, glass = ID.glass, fence = ID.oak_fence;
    const dpl = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks, dlog = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const flat = (x0, z0, x1, z1) => { const gy = surfaceTop((x0 + x1) >> 1, (z0 + z1) >> 1); flattenSite(x0, z0, x1, z1, gy - 1); return gy; };
    // ── Desert Settlement(동측 사막, 100,72): 사암 오두막 2채 + 우물 + 야자 없이 사암 첨탑 ──
    const hut = (bx, bz) => { const gy = flat(bx - 1, bz - 1, bx + 5, bz + 4);
      for (let y = gy; y < gy + 3; y++) for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 3; dz++) { const edge = dx === 0 || dx === 4 || dz === 0 || dz === 3; if (edge) S(bx + dx, y, bz + dz, sand); }
      S(bx + 2, gy, bz + 3, 0); S(bx + 2, gy + 1, bz + 3, 0);                                  // 문
      S(bx, gy + 1, bz + 1, glass); S(bx + 4, gy + 1, bz + 1, glass);                          // 창
      for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 3; dz++) S(bx + dx, gy + 3, bz + dz, sslab);   // 평지붕
      S(bx + 2, gy + 2, bz + 1, glow); return gy; };
    hut(98, 70); hut(104, 74);
    { const wx = 101, wz = 78, gy = surfaceTop(wx, wz);   // 우물
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const edge = dx !== 0 || dz !== 0; S(wx + dx, gy, wz + dz, edge ? sand : water); if (edge) S(wx + dx, gy + 1, wz + dz, dx === 0 || dz === 0 ? 0 : sand); }
      S(wx - 1, gy + 1, wz - 1, fence); S(wx + 1, gy + 1, wz - 1, fence); for (let dx = -1; dx <= 1; dx++) S(wx + dx, gy + 3, wz - 1, sslab); S(wx, gy + 2, wz - 1, glow); }
    // ── Trapper's / Jake's Shack(서측 균사, 40,60): 다크오크 오두막 + 붉은 버섯 지붕 + 랜턴 ──
    { const bx = 38, bz = 58, gy = flat(bx - 1, bz - 1, bx + 5, bz + 5);
      for (let y = gy; y < gy + 3; y++) for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 4; dz++) { const edge = dx === 0 || dx === 4 || dz === 0 || dz === 4; if (edge) S(bx + dx, y, bz + dz, ((dx === 0 || dx === 4) && (dz === 0 || dz === 4)) ? dlog : dpl); }
      S(bx + 2, gy, bz + 4, 0); S(bx + 2, gy + 1, bz + 4, 0);                                  // 문
      S(bx, gy + 1, bz + 2, glass); S(bx + 4, gy + 1, bz + 2, glass);
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 5; dz++) S(bx + dx, gy + 3, bz + dz, rcap);   // 붉은 버섯 갓 지붕
      for (let dx = 0; dx <= 4; dx += 4) for (let dz = 0; dz <= 4; dz += 4) S(bx + dx, gy + 4, bz + dz, glow);   // 모서리 랜턴
      S(bx + 2, gy + 2, bz + 2, glow); }
    // ── Oasis 강조(못가에 야자 대용 버섯 기둥 + 갈대 대용 키큰풀) ──
    { const ox = 82, oz = 96; for (const [dx, dz] of [[-2, 0], [2, 1], [0, -2]]) { const gy = surfaceTop(ox + dx, oz + dz); if (gy > 4) { S(ox + dx, gy, oz + dz, stem); S(ox + dx, gy + 1, oz + dz, stem); S(ox + dx, gy + 2, oz + dz, rcap); } } }
  }
  // V20-BE 7차: 엔드 시그니처 랜드마크(리서치 반영) — Dragon's Nest(소환 제단) + Dragon's View(사암/흑요석 탑).
  function buildEndLandmarks() {
    const obs = ID.obsidian, end = ID.end_stone != null ? ID.end_stone : ID.sandstone, pur = ID.purpur, glow = ID.glowstone, sand = ID.sandstone;
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    // ── Dragon's Nest: 중앙 흑요석 제단 + 8개 소환틀(팔각 흑요석+자수정 '눈') — 8 Summoning Eyes로 드래곤 소환 ──
    { const cx = 64, cz = 50, gy = surfaceTop(cx, cz);
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { const r = dx * dx + dz * dz; if (r <= 28) S(cx + dx, gy, cz + dz, ((dx + dz) & 1) ? obs : end); }   // 원형 제단 바닥
      for (let a = 0; a < 8; a++) { const th = a / 8 * Math.PI * 2; const x = Math.round(cx + Math.cos(th) * 4), z = Math.round(cz + Math.sin(th) * 4);
        S(x, gy + 1, z, obs); S(x, gy + 2, z, pur); S(x, gy + 3, z, glow); }   // 8 소환틀(흑요석 기둥 + 자수정 눈 + 발광)
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) S(cx + dx, gy + 1, cz + dz, obs);   // 중앙 소환대
      S(cx, gy + 2, cz, pur); S(cx, gy + 3, cz, glow); }   // 드래곤 코어
    // ── Dragon's View: 사암+흑요석 고탑 + 정상 텔레포트 패드(발광) + 전망대 ──
    { const cx = 96, cz = 45, gy = surfaceTop(cx, cz);
      for (let y = 0; y <= 15; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const edge = dx !== 0 || dz !== 0; if (edge) S(cx + dx, gy + y, cz + dz, (y % 3 === 0) ? obs : sand); }   // 탑신(사암+흑요석 띠)
      for (let y = 1; y <= 14; y++) { S(cx, gy + y, cz, (y % 3 === 0) ? pur : obs); }   // 중심 기둥(흑요석+자수정 — 엔드엔 목재 없음)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 || Math.abs(dz) === 2) S(cx + dx, gy + 16, cz + dz, sand); }   // 전망대 난간
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) S(cx + dx, gy + 16, cz + dz, obs);   // 전망대 바닥
      S(cx, gy + 17, cz, pur); S(cx, gy + 18, cz, glow); }   // 정상 텔레포트 패드
  }
  // V20-BD 7차: 거미굴 실제 6구역 재건(리서치 반영) — Spider Mound(중앙 산=기존) + 5개 명명 구역.
  //   Grandma's House · Gravel Mines · Arachne's Burrow · Archaeologist's Camp · Arachne's Sanctuary(보스 제단).
  function buildSpiderRegions() {
    const dlog = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log, dpl = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
    const web = ID.wool_white, moss = ID.mossy_cobblestone, cob = ID.cobblestone, gravel = ID.gravel, glow = ID.glowstone;
    const sand = ID.sandstone, end = ID.end_stone != null ? ID.end_stone : ID.sandstone, fence = ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.oak_fence, glass = ID.glass;
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const flat = (x0, z0, x1, z1) => { const gy = surfaceTop((x0 + x1) >> 1, (z0 + z1) >> 1); flattenSite(x0, z0, x1, z1, gy - 1); return gy; };
    // ── ① Grandma's House(남서 기슭) — 다크오크 오두막 + 문 + 유리창 + 굴뚝 + 랜턴 ──
    { const bx = 36, bz = 100, gy = flat(bx - 1, bz - 1, bx + 6, bz + 5);
      for (let y = gy; y < gy + 3; y++) for (let dx = 0; dx <= 5; dx++) for (let dz = 0; dz <= 4; dz++) { const edge = dx === 0 || dx === 5 || dz === 0 || dz === 4; if (edge) S(bx + dx, y, bz + dz, ((dx === 0 || dx === 5) && (dz === 0 || dz === 4)) ? dlog : dpl); }
      S(bx + 2, gy, bz + 4, 0); S(bx + 2, gy + 1, bz + 4, 0); S(bx + 2, gy, bz + 4, ID.spruce_door_c_2 != null ? ID.spruce_door_c_2 : 0);   // 문
      S(bx + 5, gy + 1, bz + 2, glass); S(bx, gy + 1, bz + 2, glass);   // 창
      for (let dx = 0; dx <= 5; dx++) for (let dz = 0; dz <= 4; dz++) S(bx + dx, gy + 3, bz + dz, dpl);   // 지붕
      for (let y = gy; y <= gy + 4; y++) S(bx + 4, y, bz + 1, cob); S(bx + 4, gy + 5, bz + 1, glow);   // 굴뚝
      S(bx + 2, gy + 2, bz + 2, glow); }
    // ── ② Gravel Mines(동측) — 자갈 채굴 구덩이 + 목재 갱목 + 광차 레일 ──
    { const cx = 96, cz = 90, gy = surfaceTop(cx, cz);
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { if (dx * dx + dz * dz > 18) continue; for (let y = gy; y >= gy - 3; y--) setW(cx + dx, y, cz + dz, 0); setW(cx + dx, gy - 4, cz + dz, gravel); }
      for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { for (let y = gy - 3; y <= gy; y++) S(cx + ox, y, cz + oz, dlog); S(cx + ox, gy + 1, cz + oz, glow); }   // 갱목+랜턴
      for (let dx = -3; dx <= 3; dx++) S(cx + dx, gy - 4, cz, ID.polished_andesite != null ? ID.polished_andesite : cob);   // 레일
      S(cx, gy - 3, cz + 2, gravel); S(cx + 1, gy - 3, cz + 2, gravel); }
    // ── ③ Arachne's Burrow(북측) — 거미줄 가득한 굴 입구 + 알 + 발광 눈 ──
    { const cx = 64, cz = 34, gy = surfaceTop(cx, cz);
      for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 3; dy++) setW(cx + dx, gy + dy, cz, 0);   // 굴 입구
      for (let dx = -3; dx <= 3; dx++) { S(cx + dx, gy + 4, cz, moss); S(cx + dx, gy - 1, cz, cob); }
      for (const [dx, dy] of [[-2, 1], [0, 2], [2, 1], [-1, 3], [1, 3]]) S(cx + dx, gy + dy, cz, web);   // 거미줄 장막
      S(cx, gy, cz - 1, web); S(cx, gy + 1, cz - 1, glow);   // 알 + 발광 눈
      S(cx - 3, gy, cz + 1, web); S(cx + 3, gy, cz + 1, web); }
    // ── ④ Archaeologist's Camp(북동) — 텐트(양털 지붕) + 발굴 구덩이 + 유물 + 모닥불 ──
    { const cx = 96, cz = 45, gy = surfaceTop(cx, cz);
      for (const [ox, oz] of [[-1, 0], [1, 0]]) { S(cx + ox, gy, cz, fence); S(cx + ox, gy + 1, cz, fence); }
      for (let dx = -2; dx <= 2; dx++) S(cx + dx, gy + 2, cz, ID.wool_yellow != null ? ID.wool_yellow : web);   // 텐트 지붕(양털)
      S(cx, gy + 1, cz, ID.wool_yellow != null ? ID.wool_yellow : web);
      for (let dx = 2; dx <= 4; dx++) for (let dz = -1; dz <= 1; dz++) setW(cx + dx, gy, cz + dz, 0);   // 발굴 구덩이
      S(cx + 3, gy - 1, cz, sand); S(cx + 4, gy - 1, cz, ID.bone_block != null ? ID.bone_block : ID.quartz_block);   // 유물(뼈/사암)
      S(cx - 3, gy, cz, cob); S(cx - 3, gy + 1, cz, ID.magma_block != null ? ID.magma_block : glow);   // 모닥불
    }
    // ── ⑤ Arachne's Sanctuary(북서) — 보스 제단(엔드석/사암 원형 제단 + 4 소환 페데스탈 + 거미줄 캐노피) ──
    { const cx = 34, cz = 46, gy = surfaceTop(cx, cz);
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const r = dx * dx + dz * dz; if (r <= 20) S(cx + dx, gy, cz + dz, ((dx + dz) & 1) ? end : sand); }   // 원형 제단 바닥
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) S(cx + dx, gy + 1, cz + dz, end);   // 중앙 제대
      S(cx, gy + 2, cz, ID.wool_black != null ? ID.wool_black : cob); S(cx, gy + 3, cz, glow);   // 아라크네 코어
      for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { S(cx + ox, gy + 1, cz + oz, sand); S(cx + ox, gy + 2, cz + oz, web); }   // 4 소환 페데스탈(Callings)
      for (const [ox, oz] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { S(cx + ox, gy + 1, cz + oz, fence); S(cx + ox, gy + 2, cz + oz, fence); S(cx + ox, gy + 3, cz + oz, web); }   // 거미줄 캐노피 기둥
      S(cx, gy + 4, cz, web); S(cx - 1, gy + 4, cz, web); S(cx + 1, gy + 4, cz, web);   // 캐노피 그물
    }
  }
  // V20-BA 6차: 기타 섬(농장/파크/버섯) 디테일 — 좌표 한 칸씩 손 배치(해시). 빈 지면을 섬별 지피로.
  //   저사양·걷기 보장: 대부분 비고체 키큰풀, 고체(건초/버섯/바위)는 희소. 건물·작물·랜드마크 근처 비움.
  function buildOtherDetail(mode) {
    const tg = ID.tall_grass, leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves, log = ID.oak_log;
    const hay = ID.hay_block != null ? ID.hay_block : ID.wool_yellow, fence = ID.oak_fence, stem = ID.mushroom_stem;
    const rcap = ID.mushroom_red_block, bcap = ID.mushroom_brown_block != null ? ID.mushroom_brown_block : ID.mushroom_red_block;
    const myc = ID.mycelium, sand = ID.sand, dead = ID.dead_bush != null ? ID.dead_bush : tg, moss = ID.mossy_cobblestone, cob = ID.cobblestone;
    const clearAbove = (x, z, t, n) => { for (let y = t; y < t + n; y++) if (getBlockLocal(x, y, z) !== 0) return false; return true; };
    const gOk = (id) => {
      if (mode === 'mushroom') return id === myc || id === sand;
      return id === ID.grass || id === ID.dirt;   // 농장/파크
    };
    const skip = (x, z) => {
      if (mode === 'barn') return x >= 40 && x <= 78 && z >= 20 && z <= 118;    // 밭+헛간 구역
      if (mode === 'park') return x >= 60 && x <= 84 && z >= 60 && z <= 84;     // 중앙 정자
      return x >= 50 && x <= 84 && z >= 88 && z <= 116;                          // 버섯 군락+오아시스
    };
    for (let x = 14; x <= 130; x += 5) for (let z = 14; z <= 130; z += 5) {
      if (skip(x, z)) continue;
      const t = surfaceTop(x, z), g = t - 1; if (g < 4) continue;
      if (!gOk(getBlockLocal(x, g, z))) continue;
      if (getBlockLocal(x, t, z) !== 0) continue;
      const h = hash3(x, 70, z);
      if (mode === 'barn') {
        if (h < 0.03) { setW(x, t, z, hay); if (hash3(x, 71, z) < 0.5) setW(x, t + 1, z, hay); }           // 건초 더미(드묾)
        else if (h < 0.06) { setW(x, t, z, fence); setW(x + 1, t, z, fence); }                              // 울타리 조각
        else if (h < 0.40) { if (tg != null) { setW(x, t, z, tg); if (hash3(x, 72, z) < 0.4) setW(x + 1, t, z, tg); } }   // 목초
      } else if (mode === 'park') {
        if (h < 0.04) { if (clearAbove(x, z, t, 4) && Math.abs(surfaceTop(x + 1, z) - t) <= 1) { setW(x, t, z, log); setW(x, t + 1, z, log); setW(x - 1, t + 1, z, leaf); setW(x + 1, t + 1, z, leaf); setW(x, t + 2, z, leaf); } }   // 통나무+잎 그루터기
        else if (h < 0.09) { setW(x, t, z, stem); setW(x, t + 1, z, hash3(x, 73, z) < 0.5 ? rcap : bcap); }  // 작은 버섯
        else if (h < 0.40) { if (tg != null) { setW(x, t, z, tg); if (hash3(x, 74, z) < 0.35) setW(x, t, z + 1, tg); } }   // 하층 풀
      } else {   // mushroom
        const onSand = getBlockLocal(x, g, z) === sand;
        if (onSand) { if (h < 0.10) setW(x, t, z, dead); else if (h < 0.16) { setW(x, t, z, ((x + z) & 1) ? cob : moss); } }   // 사막: 마른덤불·바위
        else { if (h < 0.08) { setW(x, t, z, stem); setW(x, t + 1, z, hash3(x, 75, z) < 0.55 ? rcap : bcap); }   // 균사: 작은 버섯
        else if (h < 0.40) { if (tg != null) setW(x, t, z, tg); } }
      }
    }
  }
  // V20-AZ 5차: 몬스터 섬 디테일 — 좌표 한 칸씩 손 배치(해시). 섬별(거미/네더/엔드) 테마 소품으로
  //   표면 허허벌판을 채운다. 랜드마크·스폰 근처는 비움. 저사양 위해 대부분 작은 고체.
  function buildMonsterDetail(mode) {
    const web = ID.wool_white, q = ID.quartz_block, moss = ID.mossy_cobblestone, cob = ID.cobblestone, glow = ID.glowstone;
    const soul = ID.soul_sand, mag = ID.magma_block, obs = ID.obsidian, pur = ID.purpur, end = ID.end_stone, nr = ID.netherrack;
    const groundOk = (id) => {
      if (mode === 'spider') return id === moss || id === cob || id === ID.stone || id === ID.dirt || id === ID.grass;
      if (mode === 'nether') return id === nr;
      if (mode === 'end') return id === end;
      return false;
    };
    const skip = (x, z) => {
      if (mode === 'spider') return x >= 66 && x <= 84 && z >= 80 && z <= 104;   // 둥지+광장
      if (mode === 'nether') return x >= 54 && x <= 72 && z >= 70 && z <= 100;   // 요새+광장
      return x >= 54 && x <= 72 && z >= 76 && z <= 104;                          // 엔드 성소+광장
    };
    for (let x = 16; x <= 112; x += 5) for (let z = 16; z <= 112; z += 5) {
      if (skip(x, z)) continue;
      const t = surfaceTop(x, z), g = t - 1; if (g < 4) continue;
      if (!groundOk(getBlockLocal(x, g, z))) continue;
      if (getBlockLocal(x, t, z) !== 0) continue;
      const h = hash3(x, 60, z);
      if (mode === 'spider') {
        if (h < 0.06) { setW(x, t, z, web); if (hash3(x, 61, z) < 0.5) setW(x, t + 1, z, web); }         // 거미줄 기둥
        else if (h < 0.10) { setW(x, t, z, web); setW(x + 1, t, z, web); setW(x, t + 1, z, glow); }        // 알집(발광 알)
        else if (h < 0.16) { setW(x, t, z, q); if (hash3(x, 62, z) < 0.4) setW(x + 1, t, z, q); }          // 뼈 무더기
        else if (h < 0.30) { setW(x, t, z, ((x + z) & 1) ? moss : cob); }                                  // 이끼 바위
      } else if (mode === 'nether') {
        if (h < 0.10) { setW(x, g, z, soul); }                                                             // 소울샌드 패치
        else if (h < 0.15) { setW(x, t, z, mag); setW(x, t + 1, z, glow); }                                // 화염 노두
        else if (h < 0.22) { setW(x, t, z, obs); }                                                         // 현무암 조각
        else if (h < 0.30) { setW(x, g, z, ((x + z) & 1) ? mag : nr); }                                    // 마그마 균열
      } else {   // end
        if (h < 0.08) { setW(x, t, z, pur); if (hash3(x, 63, z) < 0.5) setW(x, t + 1, z, pur); }           // 코러스 순
        else if (h < 0.12) { setW(x, t, z, obs); }                                                         // 흑요석 파편
        else if (h < 0.18) { setW(x, t, z, pur); setW(x, t + 1, z, glow); }                                // 엔드로드 조형
      }
    }
  }
  // V20-BG 7차: 골드마인 시그니처(리서치 반영) — 수직 노란림 채굴 플랫폼(높이 차등) + 딥캐번 포탈 + 좌측 산 용암류.
  // V67: 실사(Gold_Mine.png) — 갱도 위 대형 조각 대문(금 트림 + 어두운 플레어 지붕 + 금 초승달 장식) +
  //   헥스 석재 광장 + 보급 궤짝 더미 + 파랑/빨강 텐트 + 수직 갱(피트)
  function buildGoldGate() {
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    const yel = ID.wool_yellow != null ? ID.wool_yellow : ID.gold_ore;
    const DKP = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
    const AND3 = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const CH3 = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks;
    const gy = surfaceTop(56, 73);
    // 1) 대문: 갱도 입구(x54~58, z~72) 좌우 필라스터 탑 + 금 밴드 + 상부 아키트레이브 + 플레어 지붕 + 금 초승달
    for (const gx of [51, 61]) {   // 필라스터 탑 2기(3×3)
      for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) for (let y = 0; y < 9; y++) {
        const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
        S(gx + dx, gy + y, 70 + dz, edge ? (y === 3 || y === 7 ? yel : (dx === 1 && dz === 0 ? CH3 : ID.stone_bricks)) : 0);
      }
      for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) S(gx + dx, gy + 9, 70 + dz, DKP);   // 탑 플레어 처마
      for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) S(gx + dx, gy + 10, 70 + dz, DKP);
      S(gx + 1, gy + 11, 71, yel);   // 지붕 금 정점
    }
    for (let x = 52; x <= 60; x++) { S(x, gy + 6, 71, ID.stone_bricks); S(x, gy + 7, 71, yel); S(x, gy + 8, 71, ID.stone_bricks); }   // 아키트레이브(금 밴드)
    for (let x = 53; x <= 59; x++) S(x, gy + 9, 71, DKP);   // 상부 어두운 지붕 라인
    // 금 초승달 장식(아키트레이브 위 중앙)
    S(55, gy + 9, 70, yel); S(57, gy + 9, 70, yel); S(54, gy + 10, 70, yel); S(58, gy + 10, 70, yel); S(55, gy + 11, 70, yel); S(56, gy + 11, 70, yel); S(57, gy + 11, 70, yel);
    S(54, gy + 2, 70, ID.glowstone); S(58, gy + 2, 70, ID.glowstone);   // 입구 등
    // 2) 헥스 석재 광장(대문 앞): 매끈돌/안산암 패치
    for (let x = 46; x <= 66; x++) for (let z = 75; z <= 88; z++) {
      if (x >= 47 && x <= 54 && z >= 86) continue;   // 로지(50,90) 앞마당 보존
      const g = surfaceTop(x, z);
      const b = getBlockLocal(x, g - 1, z);
      if (b !== ID.stone && b !== ID.gravel && b !== AND3) continue;
      const r = hash3(x, 971, z);
      if (r < 0.30) setW(x, g - 1, z, ID.smooth_stone != null ? ID.smooth_stone : ID.stone_bricks);
      else if (r < 0.5) setW(x, g - 1, z, AND3);
    }
    // 3) 보급 궤짝 더미(서측) — 오크 상자 + 건초 덮개
    for (const [bx, bz, hh] of [[45, 82, 2], [47, 83, 1], [45, 85, 1], [48, 81, 1]]) {
      const g = surfaceTop(bx, bz);
      for (let y = 0; y < hh; y++) S(bx, g + y, bz, ID.oak_planks);
      if (hh === 2) S(bx, g + 2, bz, ID.hay_block);
    }
    // 4) 텐트: 파랑(서) / 빨강(동) — 3×3 박공(양털)
    const tent = (tx, tz, col) => {
      const g = surfaceTop(tx + 1, tz + 1);
      for (let dz = 0; dz < 3; dz++) { S(tx, g, tz + dz, col); S(tx + 2, g, tz + dz, col); S(tx, g + 1, tz + dz, col); S(tx + 2, g + 1, tz + dz, col); }
      for (let dz = 0; dz < 3; dz++) S(tx + 1, g + 2, tz + dz, col);
      S(tx + 1, g, tz + 1, ID.glowstone);   // 내부 등
    };
    tent(49, 77, ID.wool_blue != null ? ID.wool_blue : ID.wool_white);
    tent(62, 79, ID.wool_red);
    // 5) 수직 갱(피트, 남동): 3×3 어두운 구멍 + 울타리 난간
    {
      const px2 = 63, pz2 = 86, g = surfaceTop(px2, pz2);
      for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 2; dz++) for (let y = 1; y <= 5; y++) setW(px2 + dx, g - y, pz2 + dz, 0);
      for (let dx = -1; dx <= 3; dx++) { S(px2 + dx, g, pz2 - 1, ID.oak_fence); S(px2 + dx, g, pz2 + 2, ID.oak_fence); }
      S(px2 - 1, g, pz2, ID.oak_fence); S(px2 - 1, g, pz2 + 1, ID.oak_fence);
      S(px2 + 3, g, pz2, ID.oak_fence); S(px2 + 3, g, pz2 + 1, ID.oak_fence);
    }
    // 6) 대문 뒤 능선 용암 낙류 1줄(참조의 산비탈 용암)
    { const lx = 60, lz = 44, g2 = surfaceTop(lx, lz); for (let j = 0; j <= 8; j++) setW(lx, g2 - j, lz, ID.lava); }
  }
  function buildGoldLandmarks() {
    const gold = ID.gold_ore, iron = ID.iron_ore, coal = ID.coal_ore, yel = ID.wool_yellow != null ? ID.wool_yellow : gold;
    const sb = ID.stone_bricks, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, glow = ID.glowstone, obs = ID.obsidian, lava = ID.lava, fence = ID.oak_fence, mag = ID.magma_block != null ? ID.magma_block : lava;
    const S = (x, y, z, id) => { if (id != null) setW(x, y, z, id); };
    // ── 노란림 채굴 플랫폼 3곳(산 슬로프, 높이 차등) — 발판+노란 테두리+광석 노두+랜턴 ──
    const platform = (cx, cz, rad) => {
      const gy = surfaceTop(cx, cz);
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (dx * dx + dz * dz > rad * rad) continue;
        for (let y = gy; y <= gy + 3; y++) setW(cx + dx, y, cz + dz, 0);              // 머리 위 클리어
        setW(cx + dx, gy - 1, cz + dz, (dx * dx + dz * dz >= (rad - 1) * (rad - 1)) ? yel : and_);   // 발판 + 노란 테두리
      }
      for (const [ox, oz, o] of [[-rad, 0, gold], [rad, 0, iron], [0, -rad, coal], [0, rad, gold]]) S(cx + ox, gy - 1, cz + oz, o);   // 광석 노두
      S(cx, gy, cz, fence); S(cx, gy + 1, cz, glow);                                   // 랜턴
    };
    platform(50, 50, 3); platform(62, 46, 3); platform(46, 58, 2);
    // ── 딥캐번 포탈(기저 남측) — 석재 아치 프레임 + 흑요석 문지방/바닥 + 하강 발광 표식 ──
    { const px = 56, pz = 74, gy = surfaceTop(px, pz);
      for (let dy = 1; dy <= 4; dy++) { S(px - 2, gy + dy, pz, sb); S(px + 2, gy + dy, pz, sb); }
      for (let dx = -2; dx <= 2; dx++) S(px + dx, gy + 5, pz, sb);
      for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 4; dy++) setW(px + dx, gy + dy, pz, dy === 1 ? obs : 0);   // 개구부 + 흑요석 문지방
      for (let dx = -1; dx <= 1; dx++) S(px + dx, gy, pz - 1, obs);                    // 하강 바닥
      S(px, gy + 2, pz, glow); S(px - 2, gy + 5, pz, glow); S(px + 2, gy + 5, pz, glow); }
    // ── 좌측(서) 산 용암 폭포 ──
    { const lx = 44, lz = 50, gy = surfaceTop(lx, lz); for (let j = 0; j <= 6; j++) setW(lx, gy - j, lz, lava); S(lx, gy + 1, lz, mag); S(lx + 1, gy - 3, lz, lava); }
  }
  // V20-AX 3차: 골드 광산 섬 채광 디테일 — 좌표 한 칸씩 손 배치(해시). 노출 바위 슬로프에
  //   광석 노두·목재 갱목·랜턴·광차 조각·자갈 무더기를 흩뿌려 돌산 허허벌판을 채운다.
  function buildGoldDetail() {
    const stoneish = (id) => id === ID.stone || id === ID.polished_andesite || id === ID.gravel || id === ID.cobblestone;
    const clearAbove = (x, z, t, n) => { for (let y = t; y < t + n; y++) if (getBlockLocal(x, y, z) !== 0) return false; return true; };
    const log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log, plank = ID.oak_planks, fence = ID.oak_fence, glow = ID.glowstone;
    const cob = ID.cobblestone, moss = ID.mossy_cobblestone, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : plank;
    const gold = ID.gold_ore, iron = ID.iron_ore, coal = ID.coal_ore;
    for (let x = 14; x <= 100; x += 4) for (let z = 14; z <= 100; z += 4) {
      // 전초기지(48~62, 82~98) 근처는 비움
      if (x >= 44 && x <= 64 && z >= 80 && z <= 100) continue;
      const t = surfaceTop(x, z), g = t - 1; if (g < 4) continue;
      if (!stoneish(getBlockLocal(x, g, z))) continue;
      if (getBlockLocal(x, t, z) !== 0) continue;
      const h = hash3(x, 41, z);
      if (h < 0.04) {   // 목재 갱목(지지대) — 완경사 + 머리 위 열림
        if (!clearAbove(x, z, t, 4) || Math.abs(surfaceTop(x + 1, z) - t) > 1) continue;
        setW(x, t, z, log); setW(x, t + 1, z, log); setW(x, t + 2, z, log); setW(x, t + 3, z, slab); setW(x - 1, t + 3, z, slab); setW(x + 1, t + 3, z, slab);
      } else if (h < 0.07) {   // 광차 조각(레일 띠 + 슬랩 + 울타리)
        setW(x, g, z, and_); setW(x, t, z, slab); setW(x, t + 1, z, fence);
      } else if (h < 0.10) {   // 갱목 랜턴
        setW(x, t, z, fence); setW(x, t + 1, z, glow);
      } else if (h < 0.30) {   // 노출 광맥(표면 광석 노두) — 채광 분위기 + 채집 가능
        const o = hash3(x, 42, z); setW(x, g, z, o < 0.12 ? gold : o < 0.4 ? iron : coal);
        if (hash3(x, 43, z) < 0.4) setW(x, t, z, ((x + z) & 1) ? cob : moss);   // 위에 자갈 부스러기
      } else if (h < 0.40) {   // 자갈/이끼 바위 무더기
        setW(x, t, z, ((x + z) & 1) ? cob : moss); if (hash3(x, 44, z) < 0.35) setW(x + 1, t, z, cob);
      }
    }
  }
  // V20-X: 딥 캐번 지하 크리스탈 채광 정거장 — 좌표 한 칸씩 손 배치. 리프트 갱도 + 발광 크리스탈 + 지지 아치 + 보석 창고.
  function buildDeepDepot() {
    const cx = 48, cz = 80, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const sb = ID.stone_bricks, cob = ID.cobblestone, ch = ID.chiseled_stone_bricks, and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
    const glow = ID.glowstone, fence = ID.oak_fence, chest = ID.chest != null ? ID.chest : sb, log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
    const dia = ID.diamond_ore, eme = ID.emerald_ore, lap = ID.lapis_ore, red = ID.redstone_ore;
    const seaL = ID.sea_lantern != null ? ID.sea_lantern : glow;
    const st = (f) => (ID['stone_bricks_stairs_' + f] != null ? ID['stone_bricks_stairs_' + f] : sb);
    const slab = ID.stone_bricks_slab != null ? ID.stone_bricks_slab : sb;
    // ── 석재 정거장 데크(7×7) + 중앙 리프트 갱도(3×3) ──
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) B(dx, -1, dz, ((dx + dz) & 1) ? sb : and_);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { for (let y = -1; y >= -8; y--) B(dx, y, dz, 0); B(dx, -9, dz, ch); }   // 리프트 수직굴
    B(0, -9, 0, seaL);
    // 리프트 케이지(울타리) + 도르래 밧줄
    for (let y = 0; y <= 4; y++) { B(-1, y, -1, fence); B(1, y, -1, fence); B(-1, y, 1, fence); B(1, y, 1, fence); }
    for (let d = -1; d <= 1; d++) { B(d, 4, -1, log); B(d, 4, 1, log); B(-1, 4, d, log); B(1, 4, d, log); }   // 상단 프레임
    B(0, 5, 0, log); B(0, 6, 0, and_); for (let y = 4; y >= -3; y--) B(0, y, 0, fence);                       // 도르래 축/바퀴 + 밧줄
    // ── 4모서리 지지 아치(기둥 + 계단 아치머리) + 랜턴 ──
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { for (let y = 0; y <= 3; y++) B(px, y, pz, cob); B(px, 4, pz, ch); B(px, 5, pz, glow); }
    B(-2, 4, -3, st(2)); B(2, 4, -3, st(2)); B(-2, 4, 3, st(0)); B(2, 4, 3, st(0));   // 아치머리(정/후면)
    B(-3, 4, -2, st(1)); B(-3, 4, 2, st(1)); B(3, 4, -2, st(3)); B(3, 4, 2, st(3));   // 아치머리(측면)
    for (let x = -3; x <= 3; x++) { B(x, 5, -3, slab); B(x, 5, 3, slab); }             // 상단 처마 슬랩
    // ── 발광 크리스탈 군집(층별 보석: 다이아/에메랄드/청금석/레드스톤) — 손 배치, 비대칭 ──
    B(-3, 0, 0, dia); B(-3, 1, 0, dia); B(-4, 0, 0, glow); B(-3, 2, -1, dia);          // 다이아 정동
    B(3, 0, 1, eme); B(3, 1, 1, eme); B(4, 0, 1, glow); B(3, 0, 2, eme);               // 에메랄드
    B(0, 0, -3, lap); B(-1, 0, -3, lap); B(0, 1, -3, lap); B(0, 0, -4, glow);          // 청금석
    B(1, 0, 3, red); B(2, 0, 3, red); B(1, 1, 3, red);                                 // 레드스톤
    // ── 보석 창고(상자 + 보석 더미) + 감독 좌석 ──
    B(-3, 0, 2, chest); B(-2, 0, 3, chest); B(-2, 0, 2, dia);                          // 창고
    B(2, 0, -3, st(0)); B(2, 1, -3, slab);                                             // 감독 좌석(계단+슬랩)
    // ── 레일(안산암 띠) + 광차 ──
    for (let dz = -3; dz <= 3; dz++) B(2, -1, dz, and_);
    B(2, 0, -2, slab); B(2, 1, -2, fence);                                             // 광차
    // ── 천장 매달린 랜턴(어두운 지하 조명) 다수 ──
    B(-2, 4, -2, seaL); B(2, 4, 2, seaL); B(-2, 4, 2, glow); B(2, 4, -2, glow); B(0, 4, 0, seaL);
    B(-2, 0, -2, fence); B(-2, 3, -2, glow); B(2, 0, 2, fence); B(2, 3, 2, glow);      // 기둥 등불
  }
  // V20-Y: 대형 네더 요새 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 네더는 계단/울타리 벽돌이 없어
  //   모서리 코벨링(전블럭 계단식)으로 뾰족아치를 세우고 마그마/발광석/용암으로 조명한다.
  //   구성: 용암 해자 → 뾰족아치 진입 다리 → 관문 → 안뜰 → 3층 중앙 성채(블레이즈 제단) → 쌍둥이 망루.
  // V21-D4: 크림슨 아일 실제 구역(위키 대조) — Scarleton(마법사 도시)/Dragontail(야만전사 부락)/Dojo(7수련장)/Kuudra's Hollow.
  //   팔레트: 네더벽돌·석영(마법사)·네더랙/마그마(야만)·흑요석·발광석·마이셀리움(크림슨 니릴리움 대용)·적양털(네더와트 대용)
  function buildCrimsonRegions() {
    const nb = ID.nether_bricks, q = ID.quartz_block, obs = ID.obsidian, mag = ID.magma_block, glow = ID.glowstone;
    const lava = ID.lava, soul = ID.soul_sand, myc = ID.mycelium, nr = ID.netherrack, ch = ID.chiseled_stone_bricks;
    const wr = ID.wool_red != null ? ID.wool_red : nr, wp = ID.wool_purple != null ? ID.wool_purple : obs;
    const wo = ID.wool_orange != null ? ID.wool_orange : mag, wb = ID.wool_black != null ? ID.wool_black : obs;
    const tr = ID.terracotta_red != null ? ID.terracotta_red : nr, to = ID.terracotta_orange != null ? ID.terracotta_orange : nr;
    const qs = f => (ID['quartz_block_stairs_' + f] != null ? ID['quartz_block_stairs_' + f] : q);
    const ns = f => (ID['nether_bricks_stairs_' + f] != null ? ID['nether_bricks_stairs_' + f] : nb);
    // ══ ① Scarleton(마법사 도시, NE 86,38) — 석영·보라, 광장 + 경매장/은행/바자/대장간 + 마법 첨탑 ══
    {
      const cx = 86, cz = 38, gy = surfaceTop(cx, cz);
      const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
      // 광장 포장(석영 바닥 + 치즐 테두리 + 마이셀리움 골목 줄) — 비대칭 13×11
      for (let dx = -7; dx <= 6; dx++) for (let dz = -5; dz <= 5; dz++) {
        const edge = dx === -7 || dx === 6 || dz === -5 || dz === 5;
        B(dx, 0, dz, edge ? ch : ((dx * 3 + dz * 7 + 40) % 11 === 0 ? myc : q));
      }
      B(0, 1, 0, ch); B(0, 2, 0, wp); B(0, 3, 0, glow);   // 광장 중앙 보라 첨두 분수 조형
      B(-1, 1, 0, qs(1)); B(1, 1, 0, qs(3)); B(0, 1, -1, qs(0)); B(0, 1, 1, qs(2));
      // 경매장(북서 7×6, 석영 벽 + 보라 지붕띠 + 발광 간판)
      for (let dx = -7; dx <= -1; dx++) for (let dz = -11; dz <= -6; dz++) B(dx, 0, dz, nb);
      for (let y = 1; y <= 3; y++) for (let dx = -7; dx <= -1; dx++) for (let dz = -11; dz <= -6; dz++) {
        const wall = dx === -7 || dx === -1 || dz === -11 || dz === -6;
        if (wall && !(dz === -6 && dx === -4 && y <= 2)) B(dx, y, dz, q);   // 남쪽 중앙 출입구
      }
      for (let dx = -7; dx <= -1; dx++) for (let dz = -11; dz <= -6; dz++) B(dx, 4, dz, (dx === -7 || dx === -1 || dz === -11 || dz === -6) ? wp : nb);   // 보라 처마 + 평지붕
      B(-4, 3, -6, glow); B(-6, 1, -10, glow); B(-2, 1, -10, glow);   // 간판·내부 조명
      B(-6, 1, -7, ch); B(-2, 1, -7, ch);   // 경매 카운터
      // 은행(북동 6×5, 치즐 벽 + 금광석 금고 + 흑요석 문틀)
      for (let dx = 1; dx <= 6; dx++) for (let dz = -11; dz <= -7; dz++) B(dx, 0, dz, ch);
      for (let y = 1; y <= 3; y++) for (let dx = 1; dx <= 6; dx++) for (let dz = -11; dz <= -7; dz++) {
        const wall = dx === 1 || dx === 6 || dz === -11 || dz === -7;
        if (wall && !(dz === -7 && dx === 3 && y <= 2)) B(dx, y, dz, y === 3 ? q : ch);
      }
      for (let dx = 1; dx <= 6; dx++) for (let dz = -11; dz <= -7; dz++) B(dx, 4, dz, q);
      B(3, 3, -7, glow); B(5, 1, -10, ID.gold_ore); B(5, 2, -10, ID.gold_ore); B(4, 1, -10, obs);   // 금고 + 창살
      // 바자(광장 동편 노점 2동 — 적/보라 줄무늬 차양)
      for (const [bx, bz, c1, c2] of [[8, -2, wr, q], [8, 3, wp, q]]) {
        B(bx, 0, bz, nb); B(bx + 1, 0, bz, nb); B(bx, 0, bz + 1, nb); B(bx + 1, 0, bz + 1, nb);
        B(bx - 1, 1, bz, nb); B(bx + 2, 1, bz + 1, nb);   // 지주(네더벽돌 — 네더에 목재 금지)
        B(bx - 1, 2, bz, c1); B(bx, 2, bz, c2); B(bx + 1, 2, bz, c1); B(bx + 2, 2, bz, c2);
        B(bx - 1, 2, bz + 1, c2); B(bx, 2, bz + 1, c1); B(bx + 1, 2, bz + 1, c2); B(bx + 2, 2, bz + 1, c1);
        B(bx, 1, bz, ch);   // 진열대
      }
      // 대장간(남서 — 용암 화덕 + 흑요석 모루 + 굴뚝)
      for (let dx = -6; dx <= -2; dx++) for (let dz = 7; dz <= 10; dz++) B(dx, 0, dz, nb);
      for (let y = 1; y <= 2; y++) { B(-6, y, 7, nb); B(-6, y, 10, nb); B(-2, y, 10, nb); }   // ㄱ자 낮은 벽(개방 작업장)
      B(-5, 0, 8, lava); B(-5, 1, 8, mag); B(-4, 1, 9, obs);   // 화덕 + 모루
      B(-6, 3, 10, nb); B(-6, 4, 10, nb); B(-6, 5, 10, mag);   // 굴뚝
      // 마법 첨탑(광장 남동 — 석영 나선 h12 + 보라 캡 + 발광 나선)
      const tx = 6, tz = 9;
      for (let y = 1; y <= 12; y++) {
        B(tx, y, tz, q);
        const a = y * 1.05; B(tx + Math.round(Math.cos(a) * 1.5), y, tz + Math.round(Math.sin(a) * 1.5), y % 3 === 0 ? glow : q);
      }
      B(tx, 13, tz, wp); B(tx, 14, tz, wp); B(tx, 15, tz, glow);
      for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) B(tx + ox, 12, tz + oz, wp);   // 캡 차양
    }
    // ══ ② Dragontail(야만전사 부락, SW 38,90) — 거친 네더랙 오두막 + 토템 + 모닥불 + 감시탑 ══
    {
      const cx = 38, cz = 90, gy = surfaceTop(cx, cz);
      const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
      for (let dx = -8; dx <= 8; dx++) for (let dz = -7; dz <= 7; dz++) if (Math.hypot(dx, dz) < 8 && (dx * 5 + dz * 3 + 60) % 7 !== 0) B(dx, 0, dz, ((dx + dz) & 1) ? nr : tr);   // 다진 적토 마당(구멍 숭숭 비대칭)
      // 오두막 3동(크기·방향 제각각, 마그마 화로)
      for (const [hx, hz, w, d] of [[-6, -5, 4, 3], [4, -6, 3, 4], [-5, 4, 3, 3]]) {
        for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) { B(hx + x, 1, hz + z, (x === 0 || x === w - 1 || z === 0 || z === d - 1) ? nr : 0); B(hx + x, 2, hz + z, (x === 0 || x === w - 1 || z === 0 || z === d - 1) ? nb : 0); }
        for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) B(hx + x, 3, hz + z, to);   // 주황 테라코타 낮은 지붕
        B(hx + Math.floor(w / 2), 1, hz, 0); B(hx + Math.floor(w / 2), 2, hz, 0);   // 문
        B(hx + 1, 1, hz + 1, mag);   // 내부 화로
      }
      B(0, 1, 0, soul); B(0, 2, 0, mag); B(1, 1, 0, mag); B(-1, 1, 0, mag); B(0, 1, 1, mag); B(0, 1, -1, mag); B(0, 3, 0, lava);   // 중앙 대형 모닥불
      // 뼈 토템 2기(석영 = 뼈 대용) + 적기 깃발
      for (const [ox, oz] of [[7, 5], [-8, -7]]) { B(ox, 1, oz, q); B(ox, 2, oz, q); B(ox, 3, oz, wb); B(ox, 4, oz, wr); B(ox, 5, oz, wr); }
      // 감시탑(네더랙 기둥 4 + 상판 + 발광)
      for (let y = 1; y <= 6; y++) { B(6, y, -6, nr); B(8, y, -6, nr); B(6, y, -4, nr); B(8, y, -4, nr); }
      for (let dx = 5; dx <= 9; dx++) for (let dz = -7; dz <= -3; dz++) B(dx, 7, dz, nb);
      B(7, 8, -5, glow);
      // 네더와트 밭(소울샌드 + 적양털 와트)
      for (let dx = -2; dx <= 2; dx++) for (let dz = 5; dz <= 7; dz++) { B(dx, 0, dz, soul); if ((dx + dz) % 2 === 0) B(dx, 1, dz, wr); }
    }
    // ══ ③ Dojo(서 34,52) — 네더벽돌 담장 + 홍색 토리이 문 + 7개 수련 패드(용암 수로 링) ══
    {
      const cx = 34, cz = 52, gy = surfaceTop(cx, cz);
      const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
      for (let dx = -9; dx <= 9; dx++) for (let dz = -8; dz <= 8; dz++) B(dx, 0, dz, (Math.abs(dx) === 9 || Math.abs(dz) === 8) ? nb : ((dx * 2 + dz * 5 + 50) % 9 === 0 ? myc : ch));   // 마당 + 담 기초
      for (let y = 1; y <= 2; y++) for (let dx = -9; dx <= 9; dx++) { if (Math.abs(dx) > 2) { B(dx, y, -8, nb); B(dx, y, 8, nb); } }
      for (let y = 1; y <= 2; y++) for (let dz = -8; dz <= 8; dz++) { B(-9, y, dz, nb); B(9, y, dz, nb); }
      // 토리이 문(남쪽 개구부): 흑요석 기둥 + 적양털 인방 2단
      for (let y = 1; y <= 4; y++) { B(-2, y, 8, obs); B(2, y, 8, obs); }
      for (let dx = -3; dx <= 3; dx++) { B(dx, 5, 8, wr); if (dx >= -2 && dx <= 2) B(dx, 4, 8, wr); }
      // 수련 패드 7개(석영 3×3 + 용암 홈 모서리) — 비정형 배치
      const pads = [[-6, -5], [0, -6], [6, -5], [-6, 1], [6, 1], [-3, 5], [3, 5]];
      pads.forEach(([px, pz], i) => {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(px + dx, 0, pz + dz, q);
        B(px + (i % 2 === 0 ? -2 : 2), 0, pz, lava);   // 패드 옆 용암 홈(도전 긴장감)
        B(px, 1, pz - 1, i % 3 === 0 ? mag : ch);      // 과녁/기물 소품
      });
      B(0, 1, 0, nb); B(0, 2, 0, glow);   // 중앙 종
    }
    // ══ ④ Kuudra's Hollow(SE 가장자리 98,98) — 용암 바다 위 다리 → 흑요석 가시 링 플랫폼 ══
    {
      const ex = 98, ez = 98, gy = Math.max(SEA + 2, surfaceTop(ex, ez));
      const B = (ax, ay, az, id) => { if (id != null && inBounds(ax, ay, az)) setW(ax, ay, az, id); };
      for (let i = 0; i <= 10; i++) {   // 섬 끝 → 외해 다리(네더벽돌, 난간 마그마 점등)
        const bx = ex + Math.round(i * 0.9), bz = ez + Math.round(i * 0.9);
        B(bx, gy, bz, nb); B(bx + 1, gy, bz, nb); B(bx, gy, bz + 1, nb);
        if (i % 3 === 0) { B(bx - 1, gy + 1, bz, mag); B(bx + 2, gy + 1, bz + 1, mag); }
      }
      const kx = ex + 12, kz = ez + 12;   // 링 플랫폼(반지름 5) + 중앙 용암 못 + 가시 6
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
        const r = Math.hypot(dx, dz);
        if (r <= 5) B(kx + dx, gy, kz + dz, r <= 1.6 ? lava : (r > 4.2 ? obs : nb));
      }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.4, sx = kx + Math.round(Math.cos(a) * 4), sz = kz + Math.round(Math.sin(a) * 4);
        const h = 2 + (i % 3);
        for (let y = 1; y <= h; y++) B(sx, gy + y, sz, obs);
        B(sx, gy + h + 1, sz, i % 2 === 0 ? mag : wr);   // 가시 끝 마그마/핏빛 깃발
      }
      B(kx, gy + 1, kz + 5, glow); B(kx, gy + 1, kz - 5, glow);   // 진입 표식
    }
  }
  function buildNetherKeep() {
    const cx = 62, cz = 78, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const nb = ID.nether_bricks, mag = ID.magma_block, glow = ID.glowstone, soul = ID.soul_sand, lava = ID.lava, obs = ID.obsidian;
    // ── 기단 + 용암 해자(요새 앞 dz 8~13을 두른 용암 못, 다리로 건넌다) ──
    for (let dx = -7; dx <= 7; dx++) for (let dz = -6; dz <= 6; dz++) B(dx, -1, dz, ((dx + dz) & 1) ? nb : obs);   // 안뜰 기단(체크 무늬)
    for (let dx = -7; dx <= 7; dx++) for (let dz = 7; dz <= 13; dz++) { B(dx, -2, dz, nb); B(dx, -1, dz, lava); }   // 용암 해자
    // ── 진입 다리(중앙 3폭) + 좌우 뾰족아치 2쌍(코벨링) + 난간 성첩 ──
    for (let dz = 7; dz <= 14; dz++) { B(-1, -1, dz, nb); B(0, -1, dz, nb); B(1, -1, dz, nb); }                    // 다리 상판
    for (let dz = 7; dz <= 14; dz++) { B(-2, -1, dz, nb); B(2, -1, dz, nb); if (dz % 2 === 0) { B(-2, 0, dz, nb); B(2, 0, dz, nb); } }   // 다리 난간+성첩
    for (const az of [9, 12]) {   // 뾰족아치 2개: 다리를 가로지르는 관문형 아치
      for (let y = 0; y <= 2; y++) { B(-2, y, az, nb); B(2, y, az, nb); }                                          // 아치 기둥
      B(-2, 3, az, nb); B(2, 3, az, nb); B(-1, 4, az, nb); B(1, 4, az, nb); B(0, 5, az, mag);                      // 코벨 뾰족머리 + 마그마 키스톤
      B(-2, 3, az, nb); B(-2, 1, az - (az === 9 ? -1 : 1), glow);                                                  // 아치 벽감 발광
    }
    B(-1, 0, 14, glow); B(1, 0, 14, glow);                                                                        // 다리 입구 화톳불
    // ── 관문(정면 벽 dz 6, 아치형 대문 + 성첩) ──
    for (let dx = -5; dx <= 5; dx++) for (let y = 0; y <= 3; y++) { const gate = Math.abs(dx) <= 1 && y <= 2; if (!gate) B(dx, y, 6, nb); }
    B(-2, 3, 6, nb); B(2, 3, 6, nb); B(-1, 3, 6, nb); B(1, 3, 6, nb); B(0, 4, 6, mag);                            // 대문 뾰족 아치머리
    for (let dx = -5; dx <= 5; dx += 2) B(dx, 4, 6, nb);                                                          // 관문 성첩(총안)
    B(-3, 2, 6, glow); B(3, 2, 6, glow);                                                                          // 관문 발광
    // ── 쌍둥이 망루(관문 양끝, dx ±5, 5층 원형 느낌 사각탑 + 성첩 + 화로) ──
    for (const tx of [-5, 5]) {
      for (let y = 0; y <= 6; y++) for (const [ox, oz] of [[0, 5], [1, 5], [0, 4], [1, 4]]) { const px = tx + (tx < 0 ? ox : -ox); B(px, y, oz, ((px + oz + y) & 1) ? nb : obs); }   // 탑 벽(무늬)
      const ix = tx < 0 ? tx + 0 : tx - 0;
      for (let y = 1; y <= 5; y++) B(tx, y, 5, tx < 0 ? nb : nb);                                                 // 탑 심(안정)
      for (const [ox, oz] of [[0, 5], [1, 5], [0, 4], [1, 4]]) { const px = tx + (tx < 0 ? ox : -ox); if (((px + oz) & 1) === 0) B(px, 7, oz, nb); }   // 탑 성첩
      B(tx < 0 ? tx : tx, 6, 5, glow); B(tx < 0 ? tx + 1 : tx - 1, 3, 4, glow);                                   // 탑 창 발광
    }
    // ── 중앙 성채(3층 keep: dx -3..3, dz -3..3, 벽 hollow, 높이 11, 블레이즈 제단) ──
    for (let y = 0; y <= 10; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const edge = dx === -3 || dx === 3 || dz === -3 || dz === 3;
      if (!edge) continue;
      const door = dz === 3 && Math.abs(dx) <= 1 && y <= 2;                                                       // 남면 출입 아치
      const win = (y === 4 || y === 7) && ((Math.abs(dx) === 3 && dz === 0) || (Math.abs(dz) === 3 && dx === 0)); // 십자 창
      if (door || win) continue;
      B(dx, y, dz, ((dx + dz + y) & 1) ? nb : obs);
    }
    B(-1, 3, 3, nb); B(1, 3, 3, nb); B(0, 4, 3, mag);                                                             // 성채 출입 아치머리
    for (let dx = -3; dx <= 3; dx += 2) { B(dx, 11, 3, nb); B(dx, 11, -3, nb); }                                  // 성채 성첩(전면/후면)
    for (let dz = -3; dz <= 3; dz += 2) { B(-3, 11, dz, nb); B(3, 11, dz, nb); }                                  // 성채 성첩(측면)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { B(dx, 3, dz, nb); B(dx, 7, dz, nb); }     // 2·3층 바닥
    for (let dx = -2; dx <= 2; dx += 2) B(dx, 3, 2, glow);                                                        // 1층 천장 조명
    // 내부 계단(코벨 나선) — 1→2층, 2→3층 (전블럭 층단)
    B(2, 1, -2, nb); B(2, 2, -1, nb); B(2, 3, 0, nb); B(-2, 5, -2, nb); B(-2, 6, -1, nb); B(-2, 7, 0, nb);
    // ── 블레이즈 제단(최상층 옥상, 소울샌드 제단 + 마그마 화심 + 발광 기둥) ──
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 11, dz, soul);                        // 소울샌드 제단대
    B(0, 12, 0, mag); B(0, 13, 0, glow);                                                                          // 화심 + 성화
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { B(ox, 11, oz, nb); B(ox, 12, oz, glow); }      // 제단 4모서리 성화 기둥
    // ── 안뜰 디테일: 소울샌드 화원, 용암 화로, 코블 잔해, 발광 노두 ──
    B(-5, 0, 2, soul); B(-4, 0, 2, soul); B(-5, 0, 3, soul); B(-5, 1, 2, mag);                                    // 소울 화원
    B(5, 0, 2, mag); B(5, 0, 3, lava); B(4, 0, 3, nb);                                                            // 용암 화로(테두리)
    B(-5, 0, -3, obs); B(-4, 0, -3, obs); B(-5, 1, -3, glow);                                                     // 흑요석 잔해 + 등불
    B(4, 0, -4, soul); B(5, 0, -4, mag); B(4, 1, -4, glow);                                                       // 뒤뜰 화로
  }
  // V20-Z: 대형 엔드 성소 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 공허 위에 뜬 엔드시티 실루엣.
  //   구성: 엔드석 부양섬 → 흑요석 첨탑 4주 → 자수정(purpur) 나선 본탑 → 엔드로드 회랑 → 공허 다리 + 엔더 제단.
  function buildEndSanctum() {
    const cx = 62, cz = 84, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const pur = ID.purpur, obs = ID.obsidian, end = ID.end_stone != null ? ID.end_stone : ID.sandstone, glow = ID.glowstone;
    const st = (f) => (ID['purpur_stairs_' + f] != null ? ID['purpur_stairs_' + f] : pur);
    const slab = ID.purpur_slab != null ? ID.purpur_slab : pur;
    // ── 부양 엔드석 섬(원형, 가장자리 물매) ──
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { const r = dx * dx + dz * dz; if (r <= 30) B(dx, -1, dz, end); if (r <= 18) B(dx, -2, dz, end); if (r <= 7) B(dx, -3, dz, end); }
    // ── 흑요석 첨탑 4주(모서리, 높이 차등 — 비대칭) ──
    const spires = [[-5, -5, 9], [5, -5, 7], [-5, 5, 6], [5, 5, 11]];
    for (const [sx, sz, h] of spires) { for (let y = 0; y <= h; y++) B(sx, y, sz, obs); B(sx, h + 1, sz, glow); B(sx, h, sz + (sz < 0 ? 1 : -1), glow); }   // 첨탑 + 정상 엔드로드
    // ── 자수정 나선 본탑(중앙, dx -3..3, 원통 벽, 높이 14, 나선 계단 외벽) ──
    for (let y = 0; y <= 13; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const r = dx * dx + dz * dz; const wall = r >= 6 && r <= 11;
      const door = dz === 3 && Math.abs(dx) <= 1 && y <= 2;                                   // 남면 아치 입구
      const win = (y % 4 === 1) && ((Math.abs(dx) === 3 && dz === 0) || (Math.abs(dz) === 3 && dx === 0));   // 창
      if (wall && !door && !win) B(dx, y, dz, ((dx + dz + y) % 3 === 0) ? obs : pur);          // 자수정 벽(흑요석 띠)
    }
    B(-1, 3, 3, pur); B(1, 3, 3, pur); B(0, 4, 3, glow);                                       // 입구 아치머리 + 엔드로드
    for (let f = 0, a = 0; a < 24; a++) { const ang = a * 0.7854; const rx = Math.round(Math.cos(ang) * 3.4), rz = Math.round(Math.sin(ang) * 3.4); B(rx, a % 14, rz, st(a % 4)); }   // 외벽 나선 계단
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { if (dx * dx + dz * dz <= 8) { B(dx, 5, dz, pur); B(dx, 10, dz, pur); } }   // 중간/상단 바닥
    // 본탑 상단 첨두(수렴 계단 지붕 + 엔더 수정)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 || Math.abs(dz) === 2) B(dx, 14, dz, st(dx === -2 ? 1 : dx === 2 ? 3 : dz === -2 ? 2 : 0)); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 14, dz, pur);
    B(0, 15, 0, obs); B(0, 16, 0, pur); B(0, 17, 0, glow);                                     // 첨두 엔더 수정(발광정)
    // ── 엔드로드 회랑(본탑↔첨탑 연결 다리 + 난간 발광) ──
    for (const [sx, sz] of [[-5, -5], [5, 5]]) {                                               // 대각 2개만(비대칭)
      const stepX = sx < 0 ? 1 : -1, stepZ = sz < 0 ? 1 : -1;
      for (let i = 1; i <= 4; i++) { B(sx + stepX * i, 3, sz + stepZ * i, pur); if (i % 2 === 0) B(sx + stepX * i, 4, sz + stepZ * i, glow); }
    }
    // ── 공허 다리(입구→섬 밖, 부유 판석 + 엔드로드 가로등) ──
    for (let dz = 4; dz <= 9; dz++) { B(0, -1, dz, pur); B(-1, -1, dz, slab); B(1, -1, dz, slab); if (dz % 2 === 0) { B(-1, 0, dz, glow); B(1, 0, dz, glow); } }
    // ── 엔더 제단(섬 중앙 앞뜰, 흑요석 제단 + 엔더 수정 + 발광) ──
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 0, dz + 4, obs);
    B(0, 1, 4, pur); B(0, 2, 4, glow);                                                         // 제단 엔더 수정
    for (const [ox, oz] of [[-2, 3], [2, 3], [-2, 5], [2, 5]]) { B(ox, 0, oz, obs); B(ox, 1, oz, glow); }   // 제단 4모서리 성화
    // ── 부유 자수정 파편(섬 주위 공중, 손 배치 비대칭) ──
    B(-7, 3, 0, pur); B(-8, 4, 1, glow); B(7, 5, -2, pur); B(6, 6, -3, glow); B(0, 6, -8, pur); B(1, 7, -8, glow); B(-6, 8, 6, pur);
  }
  // V20-AA: 대형 거미굴 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 이끼 낀 바위 둥지 위에 뒤틀린
  //   검은 나무탑이 솟고 거미줄(흰 양털) 장막이 드리운다. 알집 군락 + 브루드(여왕) 제단.
  function buildSpiderNest() {
    const cx = 74, cz = 88, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const moss = ID.mossy_cobblestone, cob = ID.cobblestone, log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
    const plank = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks, web = ID.wool_white, glow = ID.glowstone;
    const stone = ID.stone, egg = ID.wool_white, dirt = ID.dirt, fence = ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.spruce_fence;
    const st = (f) => (ID['cobblestone_stairs_' + f] != null ? ID['cobblestone_stairs_' + f] : cob);
    // ── 이끼 낀 바위 둥지(원형 언덕, 비대칭 노두) ──
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) { const r = dx * dx + dz * dz; if (r <= 42) B(dx, -1, dz, ((dx * 3 + dz) % 4 === 0) ? moss : cob); if (r <= 22) B(dx, 0, dz, ((dx + dz * 3) % 5 === 0) ? moss : stone); if (r <= 8) B(dx, 1, dz, moss); }
    B(0, 2, 0, 0); B(0, 1, 0, 0);   // 둥지 중앙 구덩이(브루드 소굴 입구)
    for (let y = -1; y >= -5; y--) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, y, dz, 0);   // 수직 소굴
    B(0, -6, 0, glow);   // 소굴 바닥 발광(눈알처럼)
    for (let y = -2; y >= -5; y--) { B(-2, y, 0, moss); B(2, y, 0, moss); B(0, y, -2, moss); B(0, y, 2, moss); }   // 소굴 벽
    // ── 뒤틀린 검은 나무탑(중앙 옆, 비대칭 기둥 3개가 꼬여 오름) ──
    const twist = [[2, -2], [3, -1], [3, 0], [2, 1], [1, 2], [0, 2]];   // 나선 궤적
    for (let y = 2; y <= 9; y++) { const [tx, tz] = twist[Math.min(y - 2, twist.length - 1)]; B(tx, y, tz, log); B(tx - 1, y, tz, y % 2 ? plank : log); }
    B(2, 10, 1, log); B(1, 11, 1, log); B(1, 12, 0, glow);   // 탑 정상 + 발광 눈
    // 두 번째 뒤틀린 기둥(반대 방향)
    const twist2 = [[-2, 2], [-3, 1], [-3, 0], [-2, -1], [-1, -2]];
    for (let y = 2; y <= 8; y++) { const [tx, tz] = twist2[Math.min(y - 2, twist2.length - 1)]; B(tx, y, tz, log); }
    B(-2, 9, -2, log); B(-2, 10, -2, glow);
    // ── 거미줄 장막(흰 양털) — 탑↔바위 사이 공중에 손 배치(비대칭 그물) ──
    const webs = [[0, 6, 0], [1, 5, -1], [-1, 5, 1], [2, 7, -1], [-2, 6, 2], [1, 8, 1], [-1, 7, -1], [0, 4, 3], [3, 4, 1], [-3, 4, -1], [0, 9, 2], [2, 3, -3], [-2, 3, 3], [3, 6, 2], [-3, 5, -2]];
    for (const [wx, wy, wz] of webs) B(wx, wy, wz, web);
    // 지면 거미줄 카펫(둥지 위 산발)
    for (const [wx, wz] of [[-4, 2], [4, -3], [-3, -4], [5, 2], [2, 5], [-5, -1], [1, -5]]) B(wx, 2, wz, web);
    // ── 알집 군락(흰 양털 덩어리 3~4개 뭉치, 발광 알) ──
    for (const [ex, ez, ey] of [[-4, 4, 1], [5, -4, 1], [-5, -3, 2], [4, 5, 0]]) {
      B(ex, ey, ez, egg); B(ex, ey + 1, ez, egg); B(ex + 1, ey, ez, egg); B(ex, ey, ez + 1, egg); B(ex, ey + 1, ez + 1, glow);   // 알 뭉치 + 발광 알
    }
    // ── 브루드(여왕) 제단(둥지 앞뜰, 뼈대 느낌 이끼 제단 + 거미줄 캐노피) ──
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 1, dz + 5, moss);
    B(0, 2, 5, cob); B(0, 3, 5, glow);   // 제단 심 + 발광
    for (const [ox, oz] of [[-2, 4], [2, 4], [-2, 6], [2, 6]]) { B(ox, 1, oz, fence); B(ox, 2, oz, fence); B(ox, 3, oz, web); }   // 캐노피 기둥 + 거미줄 지붕
    B(0, 4, 5, web); B(-1, 4, 5, web); B(1, 4, 5, web);   // 캐노피 그물
    // ── 진입 계단(둥지 남면 오르막) + 마른 덤불 대신 이끼 바위 잔해 ──
    B(0, 0, 7, st(0)); B(0, 1, 6, st(0)); B(-3, 1, 5, moss); B(3, 1, -4, moss); B(-4, 1, -3, cob); B(4, 1, 4, cob);
  }
  // V20-AB: 대형 농장 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 박공(감브렐) 붉은 헛간 + 원통 사일로
  //   + 풍차 + 건초 야적장 + 가축 우리 + 밀밭. 하이픽셀 The Barn 느낌.
  function buildBarnEstate() {
    const cx = 58, cz = 100, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const red = ID.wool_red != null ? ID.wool_red : ID.bricks, trim = ID.quartz_block, log = ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log;
    const plank = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.oak_planks, hay = ID.hay_block != null ? ID.hay_block : ID.wool_yellow;
    const glow = ID.glowstone, fence = ID.oak_fence, farm = ID.farmland, wheat = ID.wheat != null ? ID.wheat : ID.hay_block, water = ID.water, cob = ID.cobblestone, dirt = ID.dirt;
    const st = (f) => (ID['dark_oak_planks_stairs_' + f] != null ? ID['dark_oak_planks_stairs_' + f] : plank);
    const dslab = ID.dark_oak_planks_slab != null ? ID.dark_oak_planks_slab : plank;
    // ── 헛간 기단(넓은 흙바닥 + 자갈 진입로) ──
    for (let dx = -6; dx <= 6; dx++) for (let dz = -5; dz <= 7; dz++) B(dx, -1, dz, dirt);
    for (let dx = -1; dx <= 1; dx++) for (let dz = 7; dz <= 11; dz++) B(dx, -1, dz, cob);   // 진입로
    // ── 붉은 헛간 본체(dx -5..5, dz -4..6, 벽 높이 5, 모서리 통나무 기둥) ──
    for (let y = 0; y <= 4; y++) for (let dx = -5; dx <= 5; dx++) for (let dz = -4; dz <= 6; dz++) {
      const edge = dx === -5 || dx === 5 || dz === -4 || dz === 6;
      if (!edge) continue;
      const corner = (Math.abs(dx) === 5) && (dz === -4 || dz === 6);
      const bigDoor = dz === 6 && Math.abs(dx) <= 1 && y <= 3;                 // 정면 대형 헛간문
      const win = (y === 2) && ((Math.abs(dx) === 5 && (dz === 0 || dz === 2)) || (dz === -4 && Math.abs(dx) <= 2 && dx % 2 === 0));
      if (bigDoor) continue;
      if (corner) B(dx, y, dz, log);
      else if (win) B(dx, y, dz, trim);                                        // 흰 창틀
      else B(dx, y, dz, ((dx + dz + y) % 5 === 0) ? trim : red);              // 붉은 벽(흰 널판 띠)
    }
    // 헛간문 X자 트림(다크오크) + 상단 아치
    B(-1, 0, 6, log); B(0, 1, 6, plank); B(1, 2, 6, log); B(1, 0, 6, log); B(0, 3, 6, plank); B(-1, 2, 6, log);   // X자
    B(-1, 4, 6, trim); B(0, 4, 6, trim); B(1, 4, 6, trim);                    // 문 상인방
    // ── 감브렐(박공) 지붕: 아래 급경사 + 위 완경사, 다크오크 계단으로 물매 ──
    for (let dz = -4; dz <= 6; dz++) {
      B(-5, 5, dz, st(3)); B(5, 5, dz, st(1));                                // 처마 급경사
      B(-4, 6, dz, st(3)); B(4, 6, dz, st(1));
      B(-3, 6, dz, red); B(3, 6, dz, red);                                    // 어깨
      B(-3, 7, dz, st(3)); B(3, 7, dz, st(1));                                // 완경사
      B(-2, 7, dz, red); B(2, 7, dz, red);
      B(-1, 8, dz, st(3)); B(1, 8, dz, st(1)); B(0, 8, dz, plank);            // 용마루
    }
    for (let dx = -3; dx <= 3; dx += 3) B(dx, 8, 1, glow);                     // 고미다락 조명
    // 박공면 채움(전/후면 삼각)
    for (const dz of [-4, 6]) { for (let dx = -4; dx <= 4; dx++) { const h = 6 - Math.abs(dx); for (let y = 5; y <= h + (Math.abs(dx) <= 2 ? 2 : 0); y++) if (y <= 8) B(dx, y, dz, red); } }
    B(0, 6, -4, trim); B(0, 7, -4, glow);                                     // 후면 박공 환기창
    // 헛간 내부: 마초 시렁 + 건초더미 + 소여물통(트로프)
    for (let dx = -4; dx <= -2; dx++) for (let dz = -3; dz <= -1; dz++) { B(dx, 0, dz, hay); if (dx === -3 && dz === -2) B(dx, 1, dz, hay); }   // 건초 더미
    B(3, 0, -3, dslab); B(4, 0, -3, dslab); B(3, 0, -2, dslab);               // 여물통
    // ── 원통 사일로(헛간 좌측, 반경 2 quartz 원통 + 돔 지붕 + 건초 충전) ──
    const sx = -8, sz = 0;
    for (let y = 0; y <= 8; y++) for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) B(sx + ox, y, sz + oz, ((ox + oz + y) & 1) ? trim : ID.smooth_stone != null ? ID.smooth_stone : trim);
    for (let dy = 0; dy <= 7; dy++) B(sx, dy, sz, hay);                        // 사일로 내부 건초
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) B(sx + ox, 9, sz + oz, st(ox < 0 ? 1 : ox > 0 ? 3 : oz < 0 ? 0 : 2));   // 돔 처마
    B(sx, 9, sz, red); B(sx, 10, sz, glow);                                   // 사일로 정상 캡
    // ── 풍차 탑(헛간 우측, 스프루스 탑 + 4엽 날개) ──
    const wx = 8, wz = 2;
    for (let y = 0; y <= 6; y++) B(wx, y, wz, log);
    for (let y = 1; y <= 5; y++) { B(wx - 1, y, wz, plank); B(wx + 1, y, wz, plank); B(wx, y, wz - 1, plank); B(wx, y, wz + 1, plank); }   // 몸통 4면
    B(wx, 6, wz, plank); B(wx, 7, wz, dslab);                                 // 지붕
    // 4엽 풍차 날개(수직면, fence + 계단으로 표현)
    for (let i = 1; i <= 3; i++) { B(wx, 5 + i, wz - 0, null); }
    B(wx, 5, wz, log);
    for (let i = 1; i <= 3; i++) { B(wx, 5, wz - i, fence); B(wx, 5, wz + i, fence); }   // 좌우 날개
    for (let i = 1; i <= 3; i++) { B(wx, 5 + i, wz, i < 3 ? fence : null); }             // 위 날개(간이)
    B(wx, 2, wz - 3, plank); B(wx, 2, wz + 3, plank); B(wx, 8, wz, plank);               // 날개깃 끝
    // ── 가축 우리(헛간 앞뜰, 울타리 펜스 + 문 + 여물 + 물통) ──
    for (let dx = -5; dx <= 0; dx++) { B(dx, 0, 9, fence); B(dx, 0, 13, fence); }
    for (let dz = 9; dz <= 13; dz++) { B(-5, 0, dz, fence); B(0, 0, dz, fence); }
    B(-2, 0, 9, 0); B(-2, 0, 9, ID.oak_fence);                                // (문 자리 — 열린 틈 유지 위해 하나 비움)
    B(-3, 0, 9, 0);                                                           // 우리 출입 틈
    B(-4, 0, 11, hay); B(-1, 0, 12, hay);                                     // 여물
    B(-2, -1, 11, water); B(-2, 0, 11, 0);                                    // 물통(파인 물)
    // ── 밀밭(헛간 우측 뒤, 4×6 farmland + 물 관개 + 밀) ──
    for (let dx = 3; dx <= 8; dx++) for (let dz = -5; dz <= -2; dz++) { B(dx, 0, dz, farm); B(dx, 1, dz, wheat); }
    for (let dz = -5; dz <= -2; dz++) { B(5, 0, dz, water); B(5, 1, dz, 0); }             // 중앙 관개수로
    // ── 건초 야적장(외부 더미 3개) + 허수아비 + 가로등 ──
    B(6, 0, 4, hay); B(7, 0, 4, hay); B(6, 1, 4, hay); B(6, 0, 5, hay);                   // 건초 더미
    B(2, 0, 8, fence); B(2, 1, 8, plank); B(2, 2, 8, hay); B(1, 1, 8, dslab); B(3, 1, 8, dslab);   // 허수아비(십자)
    B(-6, 0, 8, fence); B(-6, 1, 8, glow); B(9, 0, -1, fence); B(9, 1, -1, glow);         // 가로등
  }
  // V20-AC: 대형 거대버섯 군락 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 균사 언덕 위에 높이 차등
  //   거대버섯 5주(붉은/갈색 갓, 흰 점박이) + 가장 큰 갓 아래 버섯대 로지 + 오아시스 못.
  function buildMushroomColony() {
    const cx = 58, cz = 100, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const stem = ID.mushroom_stem, redcap = ID.mushroom_red_block, browncap = ID.mushroom_brown_block != null ? ID.mushroom_brown_block : redcap;
    const spot = ID.quartz_block, myc = ID.mycelium, glow = ID.glowstone, water = ID.water, sand = ID.sand, dirt = ID.dirt;
    const door = ID.spruce_door_c_2 != null ? ID.spruce_door_c_2 : null, glass = ID.glass;
    // ── 균사 언덕(원형, 비대칭 노두 — 균사/모래/흙 혼합, 사막 경계) ──
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const r = dx * dx + dz * dz; if (r > 90) continue;
      let g = myc; if (r > 60) g = ((dx + dz) & 1) ? sand : myc; if ((dx * 5 + dz * 3) % 11 === 0 && r > 30) g = dirt;
      B(dx, -1, dz, g); if (r <= 30) B(dx, 0, dz, myc);   // 중앙 살짝 융기
    }
    // 거대버섯 한 주 생성기(로컬 헬퍼: 대 높이 h, 갓 반경 rad, 붉은/갈색)
    const bigShroom = (ox, oz, h, rad, cap) => {
      for (let y = 0; y < h; y++) { B(ox, y, oz, stem); if (rad >= 3) { B(ox + 1, y, oz, y < h - 1 ? stem : null); if (y < 2) { B(ox - 1, y, oz, stem); B(ox, y, oz + 1, stem); } } }   // 두꺼운 대
      // 갓: 상단 평평 + 가장자리 한 칸 처짐, 흰 점박이(해시 산발)
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        const rr = dx * dx + dz * dz; if (rr > rad * rad) continue;
        const edge = rr > (rad - 1) * (rad - 1);
        let id = ((dx * 7 + dz * 13 + ox) % 6 === 0) ? spot : cap;   // 흰 점박이
        B(ox + dx, h, oz + dz, id);
        if (edge) B(ox + dx, h - 1, oz + dz, cap);   // 처진 갓 가장자리
      }
      B(ox, h - 1, oz, glow);   // 갓 아래 발광(포자 조명)
    };
    // ── 거대버섯 5주(높이·반경·색 차등, 비대칭 배치) ──
    bigShroom(0, 0, 8, 5, redcap);      // 중앙 대형(로지 갓)
    bigShroom(-6, 4, 5, 3, browncap);   // 갈색 소형
    bigShroom(6, -3, 6, 4, redcap);     // 붉은 중형
    bigShroom(-5, -6, 4, 3, browncap);  // 갈색 소형2
    bigShroom(5, 6, 7, 4, redcap);      // 붉은 대형2
    bigShroom(-8, -1, 3, 2, browncap);  // 미니 버섯
    // ── 중앙 대형 갓 아래 로지(버섯대 벽 오두막, 대 주변을 감싸는 원형 방) ──
    for (let y = 1; y <= 4; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const r = dx * dx + dz * dz; const wall = r >= 6 && r <= 11;
      const d = dz === 3 && Math.abs(dx) <= 1 && y <= 2;                        // 남면 문
      const w = (y === 2) && ((Math.abs(dx) === 3 && dz === 0) || (Math.abs(dz) === 3 && dx === 0));
      if (wall && !d && !w) B(dx, y, dz, ((dx + dz + y) & 1) ? stem : redcap);   // 대/갓 혼합 벽
      if (w) B(dx, y, dz, glass);                                                // 둥근 창
    }
    if (door) { B(0, 1, 3, door); B(0, 2, 3, door); }                           // 로지 여닫이 문
    B(-1, 4, 0, glow); B(1, 4, 0, glow);                                        // 로지 실내 조명
    B(2, 1, -2, browncap); B(2, 2, -2, glow);                                   // 실내 탁자(버섯 의자+등)
    // ── 오아시스 못(군락 남동, 모래 테두리 + 물 + 수련 대신 버섯 부표) ──
    for (let dx = 6; dx <= 10; dx++) for (let dz = 3; dz <= 8; dz++) { const r = (dx - 8) * (dx - 8) + (dz - 5) * (dz - 5); if (r <= 6) { B(dx, -2, dz, sand); B(dx, -1, dz, water); } else if (r <= 10) B(dx, -1, dz, sand); }
    B(8, 0, 5, browncap); B(9, 0, 4, redcap); B(7, 0, 6, browncap);            // 못가 작은 버섯
    B(8, 0, 3, myc); B(8, 1, 3, glow);                                          // 오아시스 등불(버섯 위)
    // ── 지면 디테일: 작은 버섯 산발 + 발광 포자 무더기(손 배치 비대칭) ──
    for (const [mx, mz, c] of [[-3, 7, redcap], [4, -7, browncap], [-9, 3, redcap], [3, 8, browncap], [-7, 6, redcap], [9, -6, browncap], [-4, -8, redcap]]) { B(mx, 0, mz, stem); B(mx, 1, mz, c); }
    B(-2, 0, -8, glow); B(7, 0, 8, glow); B(-9, 0, -4, glow);                   // 포자 발광
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
      // V21-E3: 섬 윗면은 평평(가장자리 저고도 폐지 — 실제 스블처럼 절벽 단면). 언덕 기복은
      //   가장자리 거리와 무관한 저주파 노이즈로만, 내륙(d<0.8)에서만 준다.
      const hill = (!opt.flat && d < 0.8) ? Math.round((smoothNoise(x, z, 23) - 0.5) * 3) : 0;
      const y0 = top + hill;
      for (let y = y0; y >= Math.max(2, y0 - 6 - Math.round(sm * 10)); y--) {
        let id = opt.fill || ID.stone;
        if (y === y0) id = opt.surf || ID.grass;
        else if (y >= y0 - 3) id = opt.sub || ID.dirt;
        setW(x, y, z, id);
      }
    }
  }
  function scatterOre(cx, cz, r, yMin, yMax, oreId, n, seed, baseId) {
    const base = baseId != null ? baseId : ID.stone;   // V23-C: 딥슬레이트 지대에도 광석 배치 가능
    let placed = 0;
    for (let i = 0; i < n * 14 && placed < n; i++) {
      const x = Math.floor(cx - r + hash3(i, seed, 1) * r * 2), z = Math.floor(cz - r + hash3(i, seed, 2) * r * 2);
      const y = yMin + Math.floor(hash3(i, seed, 3) * (yMax - yMin + 1));
      if (getBlockLocal(x, y, z) !== base) continue;
      if (!(getBlockLocal(x + 1, y, z) === 0 || getBlockLocal(x - 1, y, z) === 0 || getBlockLocal(x, y, z + 1) === 0 || getBlockLocal(x, y, z - 1) === 0 || getBlockLocal(x, y + 1, z) === 0 || getBlockLocal(x, y - 1, z) === 0)) continue;
      setW(x, y, z, oreId);
      if (hash3(i, seed, 4) < 0.5) setW(x, y + 1, z, oreId);
      placed++;
    }
  }
  function plantDarkOak(x, z) {
    if (!plantable(x, z)) return;
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 6; i++) { setW(x, y0 + i, z, ID.dark_oak_log); setW(x + 1, y0 + i, z, ID.dark_oak_log); }
    for (let dx = -3; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 5; dy <= 7; dy++) {
      if (Math.abs(dx - 0.5) + Math.abs(dz) <= 4.2 - (dy - 5)) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.dark_oak_leaves); }
    }
  }
  function plantJungle(x, z) {
    if (!plantable(x, z)) return;
    const y0 = surfaceTop(x, z);
    const th = 8 + Math.floor(hash3(x, 41, z) * 4);
    for (let i = 0; i < th; i++) setW(x, y0 + i, z, ID.jungle_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = th - 2; dy <= th + 1; dy++) {
      if (Math.abs(dx) + Math.abs(dz) <= 3) { if (!getBlockLocal(x + dx, y0 + dy, z + dz)) setW(x + dx, y0 + dy, z + dz, ID.jungle_leaves); }
    }
  }
  function plantAcacia(x, z) {
    if (!plantable(x, z)) return;
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
  // The Park follows Hypixel's gated wood-island rhythm: hub forest, oak,
  // birch, spruce, dark oak, jungle, then acacia in one progression chain.
  function genPark() {
    world = new Uint16Array(W * H * Dp);
    const chain = [   // V21-F3: 섬 확대(r15~16→19~21) + 나무 밀도 증가 — "작고 허전한 숲" 지적 해소
      { cx: 72, cz: 126, r: 18, plant: plantOak, count: 7 },
      { cx: 72, cz: 108, r: 20, plant: plantOak, count: 13 },
      { cx: 72, cz: 90, r: 21, plant: plantBirch, count: 13 },
      { cx: 72, cz: 72, r: 21, plant: plantSpruce, count: 12 },
      { cx: 72, cz: 54, r: 21, plant: plantDarkOak, count: 10 },
      { cx: 72, cz: 36, r: 20, plant: plantJungle, count: 11 },
      { cx: 72, cz: 20, r: 17, plant: plantAcacia, count: 9 },
    ];
    // V21-D2: 선형 진행 게이트 — 이전 수종 원목 컬렉션을 모아야 다음 섬 다리 개방(우클릭, 실제 스블 파크식)
    //   섬 체인(남→북): 입구(126) → 참나무(108) → 자작(90) → 가문비(72) → 짙은참나무(54) → 정글(36) → 아카시아(20)
    const PARK_GATES = [
      { z: 99, need: 'oaklog', n: 50, name: '참나무 원목 50' },
      { z: 81, need: 'birchlog', n: 50, name: '자작나무 원목 50' },
      { z: 63, need: 'sprucelog', n: 50, name: '가문비 원목 50' },
      { z: 46, need: 'dark_oak_log', n: 50, name: '짙은 참나무 원목 50' },
      { z: 28, need: 'jungle_log', n: 50, name: '정글 원목 50' },
    ];
    genPark._gates = PARK_GATES;
    chain.forEach((isle, i) => {
      genBlobIsland(isle.cx, isle.cz, isle.r, 16, { flat: i === 0 });
      const path = ID.grass_path != null ? ID.grass_path : (ID.coarse_dirt != null ? ID.coarse_dirt : ID.dirt);
      for (let dx = -2; dx <= 2; dx++) {
        const y = surfaceTop(isle.cx + dx, isle.cz) - 1;
        if (y > SEA + 1) setW(isle.cx + dx, y, isle.cz, path);
      }
      let planted = 0;
      for (let t = 0; t < isle.count * 5 && planted < isle.count; t++) {
        const x = isle.cx + Math.floor((hash3(i, 55 + t, 1) - 0.5) * isle.r * 1.45);
        const z = isle.cz + Math.floor((hash3(i, 56 + t, 2) - 0.5) * isle.r * 1.45);
        if (Math.hypot(x - isle.cx, z - isle.cz) > isle.r - 3) continue;
        if (Math.abs(x - isle.cx) <= 2 && Math.abs(z - isle.cz) <= 3) continue;
        const y0 = surfaceTop(x, z);
        if (y0 <= SEA + 1) continue;
        // V21-D9: 나무 위 나무 방지 — 진짜 지면(잔디/흙)에서만 심는다(캐노피 위를 지면으로 오인 금지)
        const under = getBlockLocal(x, y0 - 1, z);
        if (under !== ID.grass && under !== ID.dirt) continue;
        clearAbove(x, z, y0, 8);
        isle.plant(x, z);
        planted++;
      }
      if (i > 0) {
        const prev = chain[i - 1];
        for (let z = Math.min(prev.cz, isle.cz); z <= Math.max(prev.cz, isle.cz); z++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ty = surfaceTop(72 + dx, z);
            if (ty <= SEA + 1) {
              setW(72 + dx, 16, z, ID.oak_planks);
              clearAbove(72 + dx, z, 17, 4);
            } else {
              setW(72 + dx, ty - 1, z, path);
              clearAbove(72 + dx, z, ty, 4);
            }
          }
          if (z % 5 === 0) {
            setW(70, 16, z, ID.oak_planks);
            setW(74, 16, z, ID.oak_planks);
            clearAbove(70, z, 17, 3);
            clearAbove(74, z, 17, 3);
            setW(70, 17, z, ID.oak_fence);
            setW(74, 17, z, ID.oak_fence);
            if (z % 10 === 0) {
              setW(70, 18, z, ID.glowstone);
              setW(74, 18, z, ID.glowstone);
            }
          }
        }
      }
    });
    // ── V70: 실사(The_Park.png) — 섬별 바이옴 팔레트 재도색 ──
    //   사바나(아카시아)=주황 메사 절벽+모래, 가문비=설원, 짙은참나무=검회색 기둥 절벽+이끼,
    //   정글=절벽 덩굴 드레이프, 자작=황금 가을(낙엽 더미/노란 꽃)
    {
      const themeIsle = (cx, cz, r, fn) => {
        for (let x = cx - r - 2; x <= cx + r + 2; x++) for (let z = cz - r - 2; z <= cz + r + 2; z++) {
          const d = Math.hypot(x - cx, z - cz);
          if (d > r + 2) continue;
          fn(x, z, d / r);
        }
      };
      const OR2 = ID.terracotta_orange != null ? ID.terracotta_orange : ID.wool_orange;
      const RD2 = ID.terracotta_red != null ? ID.terracotta_red : ID.bricks;
      // 사바나(72,20,r20): 지표 모래/주황 패치 + 절벽 측면 메사 밴딩
      themeIsle(72, 20, 20, (x, z, dr) => {
        const t = surfaceTop(x, z);
        if (t <= SEA + 1) return;
        const g = getBlockLocal(x, t - 1, z);
        if (g === ID.grass && hash3(x, 996, z) < 0.45) setW(x, t - 1, z, hash3(x, 997, z) < 0.6 ? ID.sand : OR2);
        for (let y = t - 2; y >= t - 9; y--) {   // 측면 메사 밴딩(흙/돌만 교체)
          const b = getBlockLocal(x, y, z);
          if (b !== ID.dirt && b !== ID.stone) continue;
          if (getBlockLocal(x + 1, y, z) && getBlockLocal(x - 1, y, z) && getBlockLocal(x, y, z + 1) && getBlockLocal(x, y, z - 1)) continue;   // 노출면만
          setW(x, y, z, (y % 3 === 0) ? RD2 : OR2);
        }
      });
      // 가문비(72,72,r21): 설원 지표
      themeIsle(72, 72, 21, (x, z, dr) => {
        const t = surfaceTop(x, z);
        if (t <= SEA + 1) return;
        if (getBlockLocal(x, t - 1, z) === ID.grass && hash3(x, 998, z) < 0.8) setW(x, t - 1, z, ID.snow_block);
      });
      // 짙은참나무(72,54,r21): 측면 검회색 기둥 + 지표 이끼 패치
      themeIsle(72, 54, 21, (x, z, dr) => {
        const t = surfaceTop(x, z);
        if (t <= SEA + 1) return;
        if (getBlockLocal(x, t - 1, z) === ID.grass && hash3(x, 999, z) < 0.22) setW(x, t - 1, z, ID.mossy_cobblestone);
        for (let y = t - 2; y >= t - 8; y--) {
          const b = getBlockLocal(x, y, z);
          if (b !== ID.dirt && b !== ID.stone) continue;
          if (getBlockLocal(x + 1, y, z) && getBlockLocal(x - 1, y, z) && getBlockLocal(x, y, z + 1) && getBlockLocal(x, y, z - 1)) continue;
          setW(x, y, z, hash3(x, 1000 + y, z) < 0.5 ? ID.cobblestone : (ID.polished_andesite != null ? ID.polished_andesite : ID.stone));
        }
      });
      // 정글(72,36,r20): 절벽 가장자리 덩굴 드레이프
      themeIsle(72, 36, 20, (x, z, dr) => {
        if (dr < 0.82) return;
        const t = surfaceTop(x, z);
        if (t <= SEA + 1) return;
        if (hash3(x, 1001, z) > 0.3) return;
        const len = 2 + Math.floor(hash3(x, 1002, z) * 3);
        for (let j = 1; j <= len; j++) { if (getBlockLocal(x, t - 1 - j, z) !== 0) break; setW(x, t - 1 - j, z, ID.oak_leaves); }
      });
      // 자작(72,90,r21): 황금 가을 — 낙엽 더미(노란 양털 낮은 패치) + 노란 꽃
      themeIsle(72, 90, 21, (x, z, dr) => {
        const t = surfaceTop(x, z);
        if (t <= SEA + 1) return;
        if (getBlockLocal(x, t - 1, z) !== ID.grass || getBlockLocal(x, t, z) !== 0) return;
        const r2 = hash3(x, 1003, z);
        if (r2 < 0.05) setW(x, t - 1, z, ID.wool_yellow != null ? ID.wool_yellow : ID.hay_block);   // 낙엽 더미(지표 교체)
        else if (r2 < 0.11) setW(x, t, z, ID.flower_yellow);
      });
    }
    buildParkCamp();     // V46: 찰리의 캠프(텐트/모닥불/통나무 의자)
    buildWarpPads();
  }
  // V21-D2: 진행 게이트 벽 설치 — 모든 구조물 빌더 이후(마지막)에 호출해야 덮어써지지 않는다.
  //   섬들이 겹쳐 육지로 이어지므로 다리 폭만 막으면 우회 가능 — 지형을 따라 지협 전 폭을 3단 봉쇄.
  function buildParkGates() {
    const PARK_GATES = genPark._gates || [];
    const P0g = econApi().getP ? econApi().getP() : null;
    const gatesOpen = (P0g && P0g.parkGates) || {};
    // 게이트 z 자동 보정: 트리하우스/정자 등 구조물이 걸친 줄은 피해 구조물 최소 줄 선택(타고 넘기 방지)
    const structCount = z => {
      let n = 0;
      for (let x = 48; x <= 96; x++) for (let y = 18; y <= 30; y++) {   // y18~: 다리 발판(16)/난간(17)은 구조물로 안 침
        const b0 = BLOCKS[getBlockLocal(x, y, z)];
        if (b0 && /planks|bricks|wool_|stairs|slab|glowstone/.test(b0.key)) n++;
      }
      return n;
    };
    PARK_GATES.forEach(g => {
      let best = g.z, bestN = structCount(g.z);
      for (const dz of [1, -1, 2, -2, 3, -3]) { if (bestN === 0) break; const n = structCount(g.z + dz); if (n < bestN) { best = g.z + dz; bestN = n; } }
      g.z = best;
    });
    PARK_GATES.forEach((g, gi) => {
      if (gatesOpen[gi]) return;
      // 커튼 벽: 게이트 평면에서 가장 낮은 지면 위의 모든 공기 틈을 울타리로 봉인
      //   (부유 데크 밑 통로/나무 타기/구조물 위 우회 전부 차단 — 지형·구조물 블럭은 보존)
      for (let x = 48; x <= 96; x++) {
        let lowTop = 0;   // 가장 낮은 '위가 뚫린 바닥'(=걸을 수 있는 지면/다리 발판)
        for (let y = 4; y <= 30; y++) { if (getBlockLocal(x, y, g.z) && !getBlockLocal(x, y + 1, g.z)) { lowTop = y; break; } }
        if (!lowTop) continue;                                // 공허 기둥(지형·다리 없음)은 통행 불가 — 생략
        for (let y = lowTop + 1; y <= 32; y++) {
          if (!getBlockLocal(x, y, g.z)) setW(x, y, g.z, ID.oak_fence);
        }
      }
      setW(72, Math.max(19, surfaceTop(72, g.z) + 3), g.z, ID.glowstone);   // 게이트 표식(우클릭 개방 지점)
    });
  }
  // V21-D2: 파크 게이트 상호작용 — 요구 컬렉션 충족 시 개방(영속)
  function parkGateAt(x, z) {
    const gates = genPark._gates || [];
    for (let i = 0; i < gates.length; i++) if (Math.abs(z - gates[i].z) <= 1 && Math.abs(x - 72) <= 25) return i;
    return -1;
  }
  function tryOpenParkGate(gi) {
    const gates = genPark._gates || []; const g = gates[gi]; if (!g) return false;
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0) return false;
    P0.parkGates = P0.parkGates || {};
    if (P0.parkGates[gi]) return true;
    const have = (P0.collections && P0.collections[g.need]) || 0;
    if (have < g.n) { if (typeof toast === 'function') toast(`🔒 게이트: ${g.name} 컬렉션 필요 (현재 ${have})`, false); return false; }
    for (let x = 48; x <= 96; x++) for (let y = 14; y <= 34; y++) {
      const id = getBlockLocal(x, y, g.z);
      if (id === ID.oak_fence || id === ID.glowstone) { world[widx(x, y, g.z)] = 0; markBlockDirty(x, g.z); }
    }
    P0.parkGates[gi] = true;
    if (api.save) api.save();
    if (typeof toast === 'function') toast('🌳 게이트 개방! 다음 숲으로 나아가세요', true);
    flushWorldEdits();
    return true;
  }
  // V20-AO: 파크 중앙 정자 — 좌표 한 칸씩 손 배치(대칭 함수 아님). 팔각 파빌리온 + 방사 꽃밭 +
  //   8방 산책로가 부속섬 다리로 이어진다. 평평 광장에 볼거리.
  function buildParkCenter() {
    const cx = 72, cz = 72, gy = surfaceTop(cx, cz);
    const B = (dx, dy, dz, id) => { if (id != null) setW(cx + dx, gy + dy, cz + dz, id); };
    const grass = ID.grass, path = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, log = ID.oak_log;
    const plank = ID.oak_planks, slab = ID.oak_planks_slab != null ? ID.oak_planks_slab : ID.oak_planks, glow = ID.glowstone, leaf = ID.oak_leaves != null ? ID.oak_leaves : ID.spruce_leaves;
    const st = (f) => (ID['oak_planks_stairs_' + f] != null ? ID['oak_planks_stairs_' + f] : plank);
    // ── 잔디 광장 재포장(반경 12) + 방사 8방 산책로(다리 방향과 정렬) ──
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) { if (dx * dx + dz * dz > 144) continue; B(dx, 0, dz, grass); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (let r = 3; r <= 12; r++) { const px = Math.round(Math.cos(a) * r), pz = Math.round(Math.sin(a) * r); B(px, 0, pz, path); } }
    for (let a = 0; a < 32; a++) { const px = Math.round(Math.cos(a / 32 * Math.PI * 2) * 3), pz = Math.round(Math.sin(a / 32 * Math.PI * 2) * 3); B(px, 0, pz, path); }   // 정자 둘레 링 포장
    // ── 팔각 파빌리온: 8기둥(반경 3) + 상단 보 + 수렴 계단 지붕 + 매달린 랜턴 ──
    const cols = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cols.push([Math.round(Math.cos(a) * 3), Math.round(Math.sin(a) * 3)]); }
    for (const [ox, oz] of cols) { for (let y = 1; y <= 4; y++) B(ox, y, oz, log); B(ox, 5, oz, plank); }   // 기둥 + 주두
    for (const [ox, oz] of cols) { B(ox, 5, oz, plank); }   // 상단 보 링(기둥 위)
    // 지붕: 처마(반경3 계단) → 중단(반경2) → 정점
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const r = dx * dx + dz * dz; if (r > 6 && r <= 11) B(dx, 5, dz, st(dx < 0 ? 1 : dx > 0 ? 3 : dz < 0 ? 0 : 2)); }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const r = dx * dx + dz * dz; if (r >= 2 && r <= 5) B(dx, 6, dz, st(dx < 0 ? 1 : dx > 0 ? 3 : dz < 0 ? 0 : 2)); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) B(dx, 7, dz, plank);
    B(0, 8, 0, log); B(0, 9, 0, glow);   // 지붕 정점 + 발광
    for (const [ox, oz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) { B(ox, 4, oz, ID.oak_fence); B(ox, 3, oz, glow); }   // 매달린 랜턴
    // 정자 중앙 조형: 화분 기둥 + 발광
    B(0, 1, 0, plank); B(0, 2, 0, leaf); B(0, 3, 0, glow);
    // ── 방사 꽃밭(기둥 사이 대각선 4곳, 밝은 양털) + 벤치 ──
    const flowers = [ID.wool_red, ID.wool_yellow != null ? ID.wool_yellow : ID.wool_white, ID.wool_pink != null ? ID.wool_pink : ID.wool_red, ID.wool_blue != null ? ID.wool_blue : ID.wool_white];
    const diag = [[6, 6], [-6, 6], [6, -6], [-6, -6]];
    diag.forEach(([bx, bz], k) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { B(bx + dx, 0, bz + dz, grass); if ((dx + dz) % 2 === 0) B(bx + dx, 1, bz + dz, flowers[k]); } B(bx, 1, bz, flowers[k]); });
    for (const [bx, bz, f] of [[0, -8, 0], [0, 8, 2], [-8, 0, 3], [8, 0, 1]]) B(bx, 1, bz, st(f));   // 4방 벤치
    for (const [lx, lz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { B(lx, 1, lz, ID.oak_fence); B(lx, 2, lz, ID.oak_fence); B(lx, 3, lz, glow); }   // 가로등
  }
  // 🌾 더 반: 대형 농장(밀/당근/감자/호박/수박/사탕수수 대구획)
  function genBarn() {
    world = new Uint16Array(W * H * Dp);
    // ── V20-AF: 손 사각 자연 구릉 농지(평평한 허허벌판 폐기). 스무스노이즈로 완만한 밭두렁 굴곡. ──
    for (let x = 8; x < W - 8; x++) for (let z = 8; z < Dp - 8; z++) {
      const d = Math.hypot(x - 72, z - 72) / 62; if (d >= 1) continue;
      const rim = Math.min(1, (1 - d) * 2.6);   // 가장자리 물매
      let h = 13 + (smoothNoise(x, z, 20) - 0.5) * 3 * rim;   // 완만한 단일 굴곡(밭 인접 단차 ≤1 보장)
      h = Math.round(h); if (h < 4) continue;
      for (let y = 2; y <= h; y++) setW(x, y, z, y === h ? ID.grass : (y >= h - 3 ? ID.dirt : ID.stone));
    }
    // ── 대구획 작물밭(6종) — 지면 굴곡을 따라 각 칸 surfaceTop 위에 배치(부양/매몰 없음) ──
    const crops = [ID.wheat_ripe, ID.carrot_ripe, ID.potato_ripe, ID.sugar_cane, ID.pumpkin, ID.melon];
    for (let ci = 0; ci < 6; ci++) {
      const px = 22 + (ci % 3) * 34, pz = 24 + Math.floor(ci / 3) * 40;
      for (let x = px; x < px + 26; x++) for (let z = pz; z < pz + 30; z++) {
        if (Math.hypot(x - 72, z - 72) > 58) continue;
        const fy = surfaceTop(x, z); if (fy < 4) continue;
        if ((x + z) % 9 === 0) { setW(x, fy, z, ID.water); continue; }   // 관개수로(밭 사이 고랑)
        setW(x, fy, z, ID.farmland);
        if (crops[ci] === ID.pumpkin || crops[ci] === ID.melon) { if ((x + z * 3) % 4 === 0) setW(x, fy + 1, z, crops[ci]); }
        else setW(x, fy + 1, z, crops[ci]);
      }
    }
    // ── 밭 사이 흙길(구획 경계 십자로) + 헛간 부지 평탄화 ──
    for (let x = 12; x < W - 12; x++) { const fy = surfaceTop(x, 72); if (fy >= 4) { setW(x, fy, 72, ID.dirt); setW(x, fy, 71, ID.dirt); } }
    for (let z = 12; z < Dp - 12; z++) { const fy = surfaceTop(72, z); if (fy >= 4) { setW(72, fy, z, ID.dirt); setW(71, fy, z, ID.dirt); } }
    const bhy = surfaceTop(70, 62); for (let x = 66; x <= 76; x++) for (let z = 58; z <= 68; z++) { const fy = surfaceTop(x, z); for (let y = Math.min(fy, bhy) + 1; y <= Math.max(fy, bhy); y++) setW(x, y, z, ID.dirt); setW(x, bhy, z, ID.grass); }
    buildHouse(66, 60, 9, 8, bhy + 1, ID.wool_red, ID.spruce_planks);   // 보조 헛간(평탄 부지 위)
    lampPost(64, 90); lampPost(90, 64);
    // ── V68: 실사(The_Barn.png) — 섬을 도는 강 링 + 절벽 폭포 + 설캡 크래그 림 + 남측 모래밭 + 링 다리 ──
    {
      const CX = 72, CZ = 72;
      // 1) 강 링(r≈46, 폭 3): 채널 파고 물 2단 채움
      for (let x = 12; x < W - 12; x++) for (let z = 12; z < Dp - 12; z++) {
        const d = Math.hypot(x - CX, z - CZ);
        if (Math.abs(d - 46) > 1.4) continue;
        const fy = surfaceTop(x, z);
        if (fy < 8) continue;
        for (let y = fy - 2; y <= fy + 5; y++) setW(x, y, z, 0);
        setW(x, fy - 3, z, ID.stone);
        setW(x, fy - 2, z, ID.water); setW(x, fy - 1, z, ID.water);
      }
      // 링 다리 4개(십자로가 강을 건너는 지점) — 판자 3폭
      for (const [bx, bz, ax2, az2] of [[72, 26, 1, 0], [72, 118, 1, 0], [26, 72, 0, 1], [118, 72, 0, 1]]) {
        for (let o = -3; o <= 3; o++) for (let w2 = -1; w2 <= 1; w2++) {
          const x = bx + (ax2 ? w2 : o), z = bz + (ax2 ? o : w2);
          setW(x, 13, z, ID.oak_planks);
          if (Math.abs(o) === 3 && w2 !== 0) setW(x, 14, z, ID.oak_fence);
        }
      }
      // 2) 배수 폭포(북동): 링 → 섬 가장자리로 스필 채널 + 절벽 물기둥
      {
        let px2 = Math.round(CX + Math.cos(-0.5) * 46), pz2 = Math.round(CZ + Math.sin(-0.5) * 46);
        for (let i = 0; i <= 16; i++) {
          const x = Math.round(px2 + Math.cos(-0.5) * i), z = Math.round(pz2 + Math.sin(-0.5) * i);
          const fy = surfaceTop(x, z);
          if (fy < 5) break;
          for (let y = fy - 1; y <= fy + 4; y++) setW(x, y, z, 0);
          setW(x, fy - 2, z, ID.stone); setW(x, fy - 1, z, ID.water);
          if (Math.hypot(x - CX, z - CZ) > 58) { for (let y = fy - 2; y >= 4; y--) setW(x, y, z, ID.water); break; }   // 절벽 낙수
        }
      }
      // 3) 크래그 림(남측 스폰/포탈 섹터 제외): 바위 봉우리 + 설캡
      for (let a = 0; a < 30; a++) {
        const th = a / 30 * Math.PI * 2;
        if (Math.abs(th - Math.PI / 2) < 0.55) continue;   // 남쪽(+z, 스폰 72,128) 열어둠
        if (a % 2) continue;
        const mx = Math.round(CX + Math.cos(th) * 55), mz = Math.round(CZ + Math.sin(th) * 55);
        const g = surfaceTop(mx, mz);
        if (g < 8) continue;
        const ph = 7 + Math.floor(hash3(mx, 981, mz) * 8), pr = 3 + Math.floor(hash3(mx, 982, mz) * 3);
        for (let dx = -pr; dx <= pr; dx++) for (let dz = -pr; dz <= pr; dz++) {
          const dd = Math.hypot(dx, dz) / pr;
          if (dd >= 1) continue;
          const hh = Math.round(ph * (1 - dd * dd));
          for (let y = 0; y < hh; y++) {
            const x = mx + dx, z = mz + dz;
            if (Math.hypot(x - CX, z - CZ) > 61) continue;
            setW(x, g + y, z, (y >= hh - 2 && ph >= 10) ? ID.snow_block : (hash3(x, 983 + y, z) < 0.2 ? (ID.polished_andesite != null ? ID.polished_andesite : ID.stone) : ID.stone));
          }
        }
      }
      // 4) 남측 모래밭(스폰 앞 해변 느낌)
      for (let x = 58; x <= 88; x++) for (let z = 104; z <= 122; z++) {
        if (Math.hypot(x - CX, z - CZ) > 58) continue;
        if (hash3(x, 984, z) > 0.55 - smoothNoise(x, z, 8) * 0.3) continue;
        const fy = surfaceTop(x, z);
        if (getBlockLocal(x, fy - 1, z) === ID.grass) setW(x, fy - 1, z, ID.sand);
      }
    }
    buildBarnExtras();   // V46: 곡물 사일로 + 가축 목장(울타리/건초/물통)
    buildWarpPads();
  }
  // ⛏️ 골드 광산: 노천 금광 산
  function genGoldMine() {
    world = new Uint16Array(W * H * Dp);
    genBlobIsland(56, 56, 48, 14, { surf: ID.stone, sub: ID.stone });
    // ── V20-AD: 손 사각(cell-by-cell) 자연 산괴 — 기하학 링 폐기. 여러 봉우리 중심 + 노이즈로
    //   비대칭 능선을 쌓고, 노출 암벽에 광맥을 박고, 갱도 입구(아딧)·스위치백 등산로를 판다.
    const and_ = ID.polished_andesite != null ? ID.polished_andesite : ID.stone, grav = ID.gravel != null ? ID.gravel : ID.cobblestone;
    const peaks = [   // {x, z, 정점높이, 반경} — 3개의 개별 봉우리가 겹쳐 하나의 비대칭 산괴
      { x: 52, z: 44, h: 40, r: 22 }, { x: 66, z: 52, h: 34, r: 17 }, { x: 46, z: 58, h: 30, r: 15 }, { x: 60, z: 38, h: 27, r: 13 },
    ];
    for (let x = 20; x <= 92; x++) for (let z = 20; z <= 80; z++) {
      let h = 15;   // 기저 지면
      for (const p of peaks) { const d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < 1) { const t = 1 - d; h = Math.max(h, p.h * (t * t * (3 - 2 * t))); } }   // 봉우리 기여(스무스)
      h += (smoothNoise(x, z, 9) - 0.5) * 7 + (smoothNoise(x, z, 3) - 0.5) * 3;   // 대/소 노이즈로 우툴두툴
      h = Math.round(h); if (h <= 15) continue;
      for (let y = 15; y <= h; y++) {
        let id = ID.stone;
        if (y === h) { const s = hash3(x, y, z); id = s < 0.10 ? and_ : s < 0.16 ? grav : ID.stone; }   // 정상면 잡석
        // 노출 암벽 광맥: 가파른 면(주변보다 2칸+ 높은 곳)에 금/철/석탄 줄무늬
        if (y >= h - 2) { const v = hash3(x * 3, y, z * 3); if (v < 0.05) id = ID.gold_ore; else if (v < 0.11) id = ID.iron_ore; else if (v < 0.18) id = ID.coal_ore; }
        setW(x, y, z, id);
      }
    }
    // ── 갱도 입구(아딧): 남면 기슭에서 산 심장부로 3폭×4고 수평 굴 + 목재 지지 프레임 + 레일 + 랜턴 ──
    const ax = 56, az0 = 72, ady = surfaceTop(ax, az0);   // 입구 지면
    for (let z = az0; z >= 40; z--) {
      const fy = Math.min(ady, surfaceTop(ax, z));
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 3; dy++) setW(ax + dx, fy + dy, z, 0);   // 굴 파기
      setW(ax, fy - 1, z, ID.polished_andesite != null ? ID.polished_andesite : ID.stone_bricks);      // 굴 바닥
      if ((az0 - z) % 4 === 0) {   // 4칸마다 목재 지지 프레임(문틀 A자)
        for (let dy = 0; dy <= 3; dy++) { setW(ax - 2, fy + dy, z, ID.dark_oak_log); setW(ax + 2, fy + dy, z, ID.dark_oak_log); }
        for (let dx = -2; dx <= 2; dx++) setW(ax + dx, fy + 4, z, ID.dark_oak_log);
        setW(ax - 1, fy + 3, z, ID.glowstone);   // 프레임마다 랜턴
      }
      setW(ax + 1, fy, z, ID.polished_andesite != null ? ID.polished_andesite : ID.stone);   // 레일 침목(안산암 띠)
    }
    // 갱도 심장부 채굴장(아딧과 같은 높이로 연결, 금광 노출 벽 + 기둥 지지 + 조명)
    const hy = ady;   // 갱도 바닥 높이와 일치 → 굴이 챔버로 이어짐
    for (let x = 49; x <= 63; x++) for (let z = 34; z <= 45; z++) { for (let dy = 0; dy <= 5; dy++) setW(x, hy + dy, z, 0); setW(x, hy - 1, z, ID.polished_andesite != null ? ID.polished_andesite : ID.stone); }
    for (const [px, pz] of [[52, 37], [60, 37], [52, 43], [60, 43]]) { for (let dy = 0; dy <= 5; dy++) setW(px, hy + dy, pz, ID.dark_oak_log); setW(px, hy + 5, pz, ID.glowstone); }   // 지지 기둥 + 조명
    scatterOre(56, 39, 8, hy, hy + 4, ID.gold_ore, 34, 61);
    scatterOre(56, 39, 8, hy, hy + 4, ID.iron_ore, 18, 64);
    // ── 스위치백 등산로(남서 사면을 지그재그로 오르는 자갈길 + 가장자리 조약돌 난간) ──
    const trail = [[40, 74], [44, 70], [48, 66], [52, 62], [50, 56], [46, 52], [50, 48], [54, 46]];
    for (let i = 0; i < trail.length - 1; i++) {
      const [x0, z0] = trail[i], [x1, z1] = trail[i + 1]; const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) { const tx = Math.round(x0 + (x1 - x0) * s / steps), tz = Math.round(z0 + (z1 - z0) * s / steps); const ty = surfaceTop(tx, tz); setW(tx, ty, tz, grav); setW(tx, ty + 1, tz, 0); setW(tx, ty + 2, tz, 0); }
    }
    // 내부 심층 광맥(기존 scatterOre 보강)
    scatterOre(52, 48, 30, 16, 34, ID.gold_ore, 46, 61);
    scatterOre(52, 48, 30, 16, 30, ID.iron_ore, 34, 62);
    scatterOre(52, 48, 30, 16, 26, ID.coal_ore, 28, 63);
    // 봉우리 정상 랜턴 표식(원경 인지)
    for (const p of peaks) { const y = surfaceTop(p.x, p.z); setW(p.x, y + 1, p.z, ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.oak_fence); setW(p.x, y + 2, p.z, ID.glowstone); }
    buildMineCarts();        // V48: 갱도 앞 광차 2기 + 선광 작업장
    buildWarpPads();
  }
  // 💎 딥 캐번: 실제처럼 층별 광물(위→아래: 석탄/철/금·청금/레드스톤/에메랄드·슬라임/다이아/흑요석) + 리프트
  function genDeepCaverns() {
    world = new Uint16Array(W * H * Dp);
    // V23-C: 실제 MC처럼 깊이별 암석 전환 — y24 위 = 돌, 아래 = 딥슬레이트(경계는 노이즈로 자연스럽게)
    for (let x = 6; x < W - 6; x++) for (let z = 6; z < Dp - 6; z++) for (let y = 2; y <= 40; y++) {
      const border = 24 + Math.round((hash3(x, 77, z) - 0.5) * 3);
      setW(x, y, z, y < border ? ID.deepslate : ID.stone);
    }
    // ── V20-BC 정통 재건: 실제 딥 캐번의 6개 명명 층(위→아래) — 리서치(위키) 반영 ──
    //   Gunpowder Mines(석탄) → Lapis Quarry(청금) → Pigmen's Den(금/네더랙) → Slimehill(슬라임/이끼)
    //   → Diamond Reserve(다이아) → Obsidian Sanctuary(조약돌 바닥+흑요석+다이아, 최심).
    const netherrack = ID.netherrack, moss = ID.mossy_cobblestone, cob = ID.cobblestone;
    // V23-C: 딥슬레이트 경계(y≈24) 아래 층은 딥슬레이트 광석 변형 + 상층에 구리 광맥 추가(실제 MC 분포)
    const LAYERS = [
      { name: 'Gunpowder Mines', y: 33, ore: ID.coal_ore, n: 40, acc: ID.gravel },
      { name: 'Lapis Quarry', y: 28, ore: ID.lapis_ore, n: 34, acc: ID.andesite != null ? ID.andesite : ID.stone },   // V22-G2: 층별 실제 암석 변형
      { name: "Pigmen's Den", y: 22, ore: ID.deepslate_gold_ore, n: 26, acc: netherrack, base: ID.deepslate },
      { name: 'Slimehill', y: 17, ore: ID.deepslate_emerald_ore, n: 20, acc: moss, base: ID.deepslate },
      { name: 'Diamond Reserve', y: 11, ore: ID.deepslate_diamond_ore, n: 26, acc: ID.cobbled_deepslate, base: ID.deepslate },
      { name: 'Obsidian Sanctuary', y: 5, ore: ID.obsidian, n: 24, acc: ID.cobbled_deepslate, floor: ID.cobbled_deepslate, gem: ID.deepslate_diamond_ore, base: ID.deepslate },
    ];
    // 각 층 챔버(3칸 높이 대형 공동) + 층 바닥/광석/발광 + 층 재질 악센트
    LAYERS.forEach((L, li) => {
      const ly = L.y;
      for (let x = 14; x < W - 14; x++) for (let z = 14; z < Dp - 14; z++) {
        const d = Math.hypot(x - 48, z - 48) / 34 + (hash3(x, ly, z) - 0.5) * 0.2;
        if (d >= 1) continue;
        for (let y = ly - 2; y <= ly + 1; y++) setW(x, y, z, 0);
        if (L.floor) setW(x, ly - 3, z, L.floor);                                    // 흑요석 성소: 조약돌 바닥
        if (L.acc && hash3(x, 300 + li, z) < 0.10) setW(x, ly - 3, z, L.acc);         // 층 재질 악센트(자갈/네더랙/이끼)
      }
      scatterOre(48, 48, 34, ly - 2, ly + 1, L.ore, L.n, 71 + li, L.base);            // 층 고유 광석(V23-C: 심층=딥슬레이트 기반)
      if (L.gem) scatterOre(48, 48, 30, ly - 2, ly + 1, L.gem, 12, 90 + li, L.base);  // 성소: 다이아 추가
      // 발광(층 조명) + 종유석/석순 + 정동
      [[30, 34], [64, 60], [48, 30], [36, 62]].forEach((p2, i) => setW(p2[0], ly - 2, p2[1] + i, ID.glowstone));
      for (let n = 0; n < 24; n++) {
        const a = hash3(n, 200 + li, 1) * Math.PI * 2, rr = 6 + hash3(n, 201 + li, 2) * 24;
        const x = Math.round(48 + Math.cos(a) * rr), z = Math.round(48 + Math.sin(a) * rr);
        if (Math.hypot(x - 48, z - 48) > 32 || getBlockLocal(x, ly - 2, z) !== 0) continue;
        const stal = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
        if (hash3(n, 202 + li, 3) < 0.5) { setW(x, ly - 2, z, stal); if (hash3(n, 203, 4) < 0.5) setW(x, ly - 1, z, stal); }
        else { setW(x, ly + 1, z, stal); if (hash3(n, 204, 5) < 0.5) setW(x, ly, z, stal); }
      }
      for (let g = 0; g < 3; g++) { const a = hash3(g, 210 + li, 1) * Math.PI * 2; const x = Math.round(48 + Math.cos(a) * 30), z = Math.round(48 + Math.sin(a) * 30);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dx) + Math.abs(dz) <= 1) setW(x + dx, ly - 1, z + dz, L.ore); setW(x, ly - 1, z, ID.glowstone); }
    });
    // V23-C: 구리 광맥 — 챔버 굴착 후 배치(광석은 공기 노출면 필요). 상층=돌, 심층=딥슬레이트 변형
    scatterOre(48, 48, 34, 26, 36, ID.copper_ore, 36, 68);
    scatterOre(48, 48, 34, 9, 23, ID.deepslate_copper_ore, 22, 69, ID.deepslate);
    // ── 중앙 리프트 수직 갱도(3×3, 상단~최심) + 층별 착지 정거장(석재 착지판+발광+케이지) ──
    for (let y = 3; y <= 40; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(48 + dx, y, 48 + dz, 0);
    LAYERS.forEach(L => {
      const ly = L.y;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(48 + dx, ly - 3, 48 + dz, ID.stone_bricks);   // 착지판
      for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { setW(48 + ox, ly - 2, 48 + oz, ID.oak_fence); setW(48 + ox, ly - 1, 48 + oz, ID.glowstone); }   // 정거장 케이지 + 랜턴
      // 리프트 호출 표식(중앙 발광)
      setW(48, ly - 2, 46, ID.oak_fence); setW(48, ly - 1, 46, ID.sea_lantern != null ? ID.sea_lantern : ID.glowstone);
    });
    // 리프트 케이지 밧줄(갱도 중심 축) — 상단 도르래
    for (let y = 4; y <= 40; y++) setW(48, y, 48, ID.oak_fence);
    setW(48, 41, 48, ID.dark_oak_log != null ? ID.dark_oak_log : ID.oak_log);
    // 나선 계단(층 사이 실제 이동 수단)
    const ring = [[-3, -3], [-1, -3], [1, -3], [3, -3], [3, -1], [3, 1], [3, 3], [1, 3], [-1, 3], [-3, 3], [-3, 1], [-3, -1]];
    let sy = 3, ri = 0;
    while (sy <= 38) { const o = ring[ri % ring.length]; setW(48 + o[0], sy, 48 + o[1], ID.stone_bricks); clearAbove(48 + o[0], 48 + o[1], sy + 1, 3); ri++; if (ri % 2 === 0) sy++; }
    // ── 입구 방(스폰, 최상단 Gunpowder Mines 위) + 리프트 정거장 연결 통로 ──
    for (let x = 42; x <= 54; x++) for (let z = 80; z <= 92; z++) for (let y = 36; y <= 41; y++) setW(x, y, z, y === 36 ? ID.stone_bricks : 0);
    for (let z = 52; z <= 80; z++) { for (let dx = -1; dx <= 1; dx++) { setW(48 + dx, 36, z, ID.stone_bricks); clearAbove(48 + dx, z, 37, 4); } }
    [[44, 82], [52, 90], [48, 86]].forEach(p2 => setW(p2[0], 37, p2[1], ID.glowstone));
    buildGeodePockets();     // V48: 자수정 정동 포켓 2곳(수정 동굴)
    buildWarpPads();
  }
  // 🕷️ 스파이더 덴 V6: 거미산 등반 던전 — 나선 등산로를 오르면 점점 강한 거미, 정상에 브루드마더
  // V69: 실사(Spider's_Den.png) — 독성 초록 연못 + 절벽 거미줄 드레이프 + 알집(코쿤) + 회색 오두막 + 고사목
  function buildSpiderDressing() {
    const web = ID.wool_white, brn = ID.wool_brown != null ? ID.wool_brown : ID.dirt, lime = ID.wool_lime != null ? ID.wool_lime : ID.emerald_ore;
    // 1) 독성 초록 연못(남서 기슭): 낮은 보울 + 라임 수면 + 둘레 이끼
    {
      const px = 40, pz = 82;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -3; dz <= 3; dz++) {
        const d = Math.hypot(dx / 1.3, dz);
        if (d > 3.4) continue;
        const g = surfaceTop(px + dx, pz + dz);
        if (g < 6) continue;
        for (let y = g; y <= g + 3; y++) setW(px + dx, y, pz + dz, 0);
        setW(px + dx, g - 1, pz + dz, d > 2.4 ? ID.mossy_cobblestone : lime);   // 라임 수면 + 이끼 테
      }
    }
    // 2) 절벽 거미줄 드레이프: 가파른 사면 12곳에서 흰 줄 수직 낙하(3~6칸)
    for (let i = 0; i < 12; i++) {
      const th = i / 12 * Math.PI * 2 + 0.2;
      const rr = 20 + hash3(i, 991, 1) * 14;
      const x = Math.round(64 + Math.cos(th) * rr), z = Math.round(64 + Math.sin(th) * rr);
      const g = surfaceTop(x, z);
      if (g < 18) continue;   // 산 사면만
      const len = 3 + Math.floor(hash3(x, 992, z) * 4);
      for (let j = 0; j < len; j++) { if (getBlockLocal(x, g - 1 - j, z) !== 0) break; setW(x, g - 1 - j, z, web); }
      setW(x, g, z, web);
    }
    // 3) 알집(코쿤): 산 중턱 감실 3곳 — 파낸 벽감 + 갈색 알집 + 거미줄 덮개
    for (const [ax, az] of [[76, 50], [52, 68], [70, 76]]) {
      const g = surfaceTop(ax, az);
      if (g < 20) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 0; y <= 2; y++) setW(ax + dx, g - 3 + y, az + dz, 0);   // 감실
      setW(ax, g - 3, az, brn); setW(ax + 1, g - 3, az, brn); setW(ax, g - 2, az, brn);   // 알집 덩이
      setW(ax - 1, g - 1, az, web); setW(ax + 1, g - 1, az + 1, web);   // 줄 덮개
    }
    // 4) 회색 오두막 2채(기슭 길가): 조약돌 벽 + 다크오크 지붕
    for (const [hx, hz] of [[42, 52], [88, 84]]) {
      const g = surfaceTop(hx + 2, hz + 1);
      if (g < 8 || g > 20) continue;
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 4; dz++) for (let y = g; y <= g + 6; y++) setW(hx + dx, y, hz + dz, 0);
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) {
        setW(hx + dx, g - 1, hz + dz, ID.cobblestone);
        const edge = dx === 0 || dx === 4 || dz === 0 || dz === 3;
        if (edge) for (let y = 0; y < 3; y++) setW(hx + dx, g + y, hz + dz, (y === 1 && dx === 2 && dz === 3) ? 0 : ID.cobblestone);
      }
      setW(hx + 2, g, hz + 3, 0); setW(hx + 2, g + 1, hz + 3, 0);   // 문
      const DKP2 = ID.dark_oak_planks != null ? ID.dark_oak_planks : ID.spruce_planks;
      for (let dx = -1; dx <= 5; dx++) for (const dz of [-1, 4]) setW(hx + dx, g + 3, hz + dz, DKP2);
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) setW(hx + dx, g + 3 + (dz === 1 || dz === 2 ? 1 : 0), hz + dz, DKP2);
      setW(hx + 2, g + 2, hz + 1, ID.glowstone);
    }
    // 5) 고사목 4그루(가지만 남은 검은 나무)
    for (const [tx, tz] of [[34, 66], [92, 58], [58, 92], [78, 96]]) {
      const g = surfaceTop(tx, tz);
      if (g < 8 || g > 24) continue;
      const h = 4 + Math.floor(hash3(tx, 993, tz) * 2);
      for (let j = 0; j < h; j++) setW(tx, g + j, tz, ID.dark_oak_log != null ? ID.dark_oak_log : ID.spruce_log);
      setW(tx + 1, g + h - 1, tz, ID.dark_oak_log != null ? ID.dark_oak_log : ID.spruce_log);
      setW(tx - 1, g + h - 2, tz, ID.oak_fence);
      if (hash3(tx, 994, tz) < 0.5) setW(tx, g + h, tz, web);   // 나무 꼭대기 거미줄
    }
  }
  function genSpiderDen() {
    world = new Uint16Array(W * H * Dp);
    genBlobIsland(64, 64, 56, 14, { surf: ID.dirt });
    // ── V20-AE: 손 사각 비대칭 거미산(단일 원뿔 폐기). 여러 봉우리 + 노이즈로 울퉁불퉁한
    //   바위산을 쌓고 이끼/거미줄(흰 양털) 줄무늬를 박는다. 정상 y≈45.
    const mossC = ID.mossy_cobblestone, cob = ID.cobblestone, stn = ID.stone, webv = ID.wool_white;
    const speaks = [
      { x: 64, z: 64, h: 30, r: 24 }, { x: 54, z: 72, h: 24, r: 16 }, { x: 76, z: 58, h: 22, r: 15 }, { x: 60, z: 52, h: 20, r: 13 },
    ];
    for (let x = 22; x <= 106; x++) for (let z = 22; z <= 106; z++) {
      let h = 0;
      for (const p of speaks) { const d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < 1) { const t = 1 - d; h = Math.max(h, p.h * (t * t * (3 - 2 * t))); } }
      h += (smoothNoise(x, z, 8) - 0.5) * 6 + (smoothNoise(x, z, 3) - 0.5) * 3;
      h = Math.round(h); if (h <= 0) continue;
      const y0 = surfaceTop(x, z);
      for (let y = 0; y < h; y++) {
        const s = hash3(x, y0 + y, z);
        let id = s < 0.14 ? webv : s < 0.34 ? mossC : s < 0.62 ? stn : cob;   // 거미줄/이끼/돌/조약돌 혼합
        setW(x, y0 + y, z, id);
      }
    }
    // ── 나선 등산로: 완만한 등반 등급(want)으로 감으며, 노면 아래 지지 둑을 채워 절대 공중부양/추락 없게 ──
    let ang = 0;
    for (let rr = 34; rr >= 4; rr -= 0.5) {
      ang += 0.16;
      const x = Math.round(64 + Math.cos(ang) * rr), z = Math.round(64 + Math.sin(ang) * rr);
      const want = 15 + Math.round((34 - rr) / 30 * 30);   // 완만 등급(정상부까지)
      for (let o = -1; o <= 1; o++) for (let o2 = -1; o2 <= 1; o2++) {
        const px2 = x + o, pz2 = z + o2;
        for (let y = want + 1; y <= want + 4; y++) setW(px2, y, pz2, 0);           // 머리 위 클리어
        setW(px2, want, pz2, ID.cobblestone);                                       // 노면
        for (let y = want - 1; y >= want - 3; y--) if (getBlockLocal(px2, y, pz2) === 0) setW(px2, y, pz2, ID.mossy_cobblestone);   // 지지 둑(추락 방지)
      }
      if (Math.round(rr * 2) % 10 === 0) { setW(x, want + 1, z, ID.dark_oak_fence != null ? ID.dark_oak_fence : ID.oak_fence); setW(x, want + 2, z, ID.glowstone); }   // 등산로 랜턴
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
    buildSpiderNests();  // V46: 알 둥지 군집 + 절벽 거미줄 가닥
    buildWarpPads();
  }
  // 🔥 블레이징 포트리스 V6: 던전 컨셉 — 용암 바다 위 붉은 요새(복도망·블레이즈 첨탑·위더 홀·마그마 분지)
  function genNether() {
    world = new Uint16Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) for (let y = 2; y <= SEA - 1; y++) setW(x, y, z, ID.lava);   // 용암 바다
    genBlobIsland(64, 64, 54, 16, { surf: ID.netherrack, sub: ID.netherrack, fill: ID.netherrack });
    for (let i = 0; i < 70; i++) {   // 소울샌드/마그마 패치
      const x = 20 + Math.floor(hash3(i, 91, 1) * 88), z = 20 + Math.floor(hash3(i, 92, 2) * 88);
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) === ID.netherrack) setW(x, y, z, hash3(i, 93, 3) < 0.6 ? ID.soul_sand : ID.magma_block);
    }
    // ── V73: 실사(Blazing_Fortress.png) — 표면 용암 균열 맥 + 검붉은 뿔 첨탑(림) + 마그마 원형 패치 ──
    {
      const NB = ID.nether_bricks != null ? ID.nether_bricks : ID.obsidian;
      // 1) 용암 균열 맥 6줄(랜덤워크): 표면 1칸 파고 용암 + 마그마 가장자리
      for (let v = 0; v < 6; v++) {
        let vx = 64 + (hash3(v, 1031, 1) - 0.5) * 56, vz = 64 + (hash3(v, 1031, 2) - 0.5) * 56;
        let dir = hash3(v, 1032, 1) * Math.PI * 2;
        for (let st2 = 0; st2 < 45; st2++) {
          dir += (hash3(v, 1033, st2) - 0.5) * 0.8;
          vx += Math.cos(dir); vz += Math.sin(dir);
          const ix = Math.round(vx), iz = Math.round(vz);
          if (Math.hypot(ix - 64, iz - 64) > 48) continue;
          const g = surfaceTop(ix, iz);
          if (g < 8 || getBlockLocal(ix, g - 1, iz) !== ID.netherrack) continue;
          setW(ix, g - 1, iz, ID.lava);
          if (hash3(ix, 1034, iz) < 0.5 && getBlockLocal(ix + 1, g - 1, iz) === ID.netherrack) setW(ix + 1, g - 1, iz, ID.magma_block);
        }
      }
      // 2) 검붉은 뿔 첨탑 8기(림, 위로 갈수록 옆으로 휘는 곡선) — 네더벽돌/네더랙 혼합
      for (let n2 = 0; n2 < 8; n2++) {
        const a2 = n2 / 8 * Math.PI * 2 + 0.25;
        const sx = Math.round(64 + Math.cos(a2) * 44), sz = Math.round(64 + Math.sin(a2) * 44);
        const g = surfaceTop(sx, sz);
        if (g < 8) continue;
        const hh = 10 + Math.floor(hash3(sx, 1035, sz) * 8);
        const bendX = Math.cos(a2), bendZ = Math.sin(a2);   // 바깥으로 휨
        for (let y = 0; y < hh; y++) {
          const off = Math.floor((y / hh) * (y / hh) * 4);
          const cx2 = sx + Math.round(bendX * off), cz2 = sz + Math.round(bendZ * off);
          const rr2 = y < 3 ? 2 : y < hh - 3 ? 1 : 0;
          for (let dx = -rr2; dx <= rr2; dx++) for (let dz = -rr2; dz <= rr2; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > rr2 + 1) continue;
            setW(cx2 + dx, g + y, cz2 + dz, hash3(cx2 + dx, 1036 + y, cz2 + dz) < 0.35 ? NB : ID.netherrack);
          }
        }
      }
      // 3) 마그마 원형 패치 5곳(실사의 어두운 원 무늬 광장)
      for (const [mx, mz] of [[52, 76], [78, 52], [70, 84], [46, 56], [84, 72]]) {
        const g = surfaceTop(mx, mz);
        if (g < 8) continue;
        for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
          const d = Math.hypot(dx, dz);
          if (d > 4.3) continue;
          const gy2 = surfaceTop(mx + dx, mz + dz) - 1;
          if (getBlockLocal(mx + dx, gy2, mz + dz) !== ID.netherrack) continue;
          if (d > 3.2 || hash3(mx + dx, 1037, mz + dz) < 0.3) setW(mx + dx, gy2, mz + dz, d > 3.2 ? ID.magma_block : NB);
        }
      }
    }
    // ── V20-AJ: 손 사각 네더 분위기 조형 — 흑요석 현무암 첨탑 + 발광석 천장 군집 + 용암 폭포 ──
    for (let n = 0; n < 18; n++) {   // 현무암(흑요석) 첨탑 — 섬 곳곳 비대칭, 높이 차등
      const a = hash3(n, 300, 1) * Math.PI * 2, rr = 12 + hash3(n, 301, 2) * 34;
      const x = Math.round(64 + Math.cos(a) * rr), z = Math.round(64 + Math.sin(a) * rr);
      if (surfaceTop(x, z) < 6) continue;
      const y0 = surfaceTop(x, z), h = 4 + Math.floor(hash3(n, 302, 3) * 9);
      for (let j = 0; j < h; j++) { setW(x, y0 + j, z, ID.obsidian); if (j < 2) { setW(x + 1, y0 + j, z, ID.obsidian); setW(x, y0 + j, z + 1, ID.obsidian); } }   // 밑동 두껍게
      setW(x, y0 + h, z, ID.magma_block);   // 첨탑 정상 마그마
      if (hash3(n, 303, 4) < 0.4) setW(x, y0 + h + 1, z, ID.glowstone);
    }
    for (let n = 0; n < 10; n++) {   // 발광석 천장 군집(공중 부유 — 네더 특유 조명)
      const a = hash3(n, 310, 1) * Math.PI * 2, rr = hash3(n, 311, 2) * 40;
      const x = Math.round(64 + Math.cos(a) * rr), z = Math.round(64 + Math.sin(a) * rr);
      if (surfaceTop(x, z) < 6) continue;
      const cy = surfaceTop(x, z) + 10 + Math.floor(hash3(n, 312, 3) * 6);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dx) + Math.abs(dz) <= 1) setW(x + dx, cy, z + dz, ID.glowstone);
      setW(x, cy - 1, z, ID.glowstone);   // 군집 아래로 한 칸 늘어뜨림
    }
    for (let n = 0; n < 5; n++) {   // 용암 폭포(섬 가장자리에서 용암 바다로 떨어짐)
      const a = hash3(n, 320, 1) * Math.PI * 2;
      const x = Math.round(64 + Math.cos(a) * 46), z = Math.round(64 + Math.sin(a) * 46);
      if (surfaceTop(x, z) < 6) continue;
      const y0 = surfaceTop(x, z);
      for (let j = 0; j <= 6; j++) setW(x, y0 - j, z, ID.lava);   // 절벽면 용암 줄기
      setW(x, y0 + 1, z, ID.magma_block);
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
    buildNetherBridges();   // V49: 용암 바다 위 요새 다리 2기 + 성문 탑
    buildWarpPads();
  }
  // 🌌 디 엔드 V6: 중앙이 깊게 뚫린 심연 — 나선 미로 발판을 타고 내려가면 거대한 드래곤 둥지(실제 Dragon's Nest)
  function genEnd() {
    world = new Uint16Array(W * H * Dp);
    // 두꺼운 엔드스톤 원반(상판 y30, 바닥 y3)
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      let d = Math.hypot(x - 64, z - 64) / 56;
      d += (hash3(x, 7, z) - 0.5) * 0.12;
      if (d >= 1) continue;
      const bottom = d < 0.75 ? 3 : Math.round(3 + (d - 0.75) * 60);
      for (let y = bottom; y <= 30; y++) setW(x, y, z, ID.end_stone);
    }
    // ── V72: 실사(The_End.png) — 방사형 흑요석 가시 왕관 + 상판 보라 발광 균열 맥 ──
    {
      // 1) 림 가시 왕관: 둘레 24기 원뿔 스파이크(흑요석 + 퍼퍼 반점), 안쪽 몇 기는 낮게
      for (let a = 0; a < 24; a++) {
        const th = a / 24 * Math.PI * 2;
        const rr = a % 3 === 2 ? 40 + hash3(a, 1021, 1) * 6 : 50 + hash3(a, 1021, 2) * 5;
        const sx = Math.round(64 + Math.cos(th) * rr), sz = Math.round(64 + Math.sin(th) * rr);
        if (Math.hypot(sx - 64, sz - 100) < 8) continue;   // 스폰 지대는 비움
        const g = surfaceTop(sx, sz);
        if (g < 10) continue;
        const sh = 8 + Math.floor(hash3(sx, 1022, sz) * 10), sr = 2 + Math.floor(hash3(sx, 1023, sz) * 2);
        for (let y = 0; y < sh; y++) {
          const rr2 = Math.max(0, Math.round(sr * (1 - y / sh)));
          for (let dx = -rr2; dx <= rr2; dx++) for (let dz = -rr2; dz <= rr2; dz++) {
            if (Math.hypot(dx, dz) > rr2 + 0.3) continue;
            setW(sx + dx, g + y, sz + dz, hash3(sx + dx, 1024 + y, sz + dz) < 0.12 ? ID.purpur : ID.obsidian);
          }
        }
        setW(sx, g + sh, sz, ID.obsidian);
      }
      // 2) 보라 발광 균열 맥: 상판(y30)을 가로지르는 랜덤워크 균열 6줄 — 퍼퍼/마젠타 + 발광 코어
      const MAG = ID.wool_magenta != null ? ID.wool_magenta : ID.purpur;
      for (let v = 0; v < 6; v++) {
        let vx = 64 + (hash3(v, 1025, 1) - 0.5) * 60, vz = 64 + (hash3(v, 1025, 2) - 0.5) * 60;
        let dir = hash3(v, 1026, 1) * Math.PI * 2;
        for (let st2 = 0; st2 < 55; st2++) {
          dir += (hash3(v, 1027, st2) - 0.5) * 0.9;
          vx += Math.cos(dir); vz += Math.sin(dir);
          const ix = Math.round(vx), iz = Math.round(vz);
          if (Math.hypot(ix - 64, iz - 64) > 52 || Math.hypot(ix - 64, iz - 100) < 7) continue;
          if (getBlockLocal(ix, 30, iz) !== ID.end_stone) continue;
          const glowCore = st2 % 5 === 0;
          setW(ix, 30, iz, glowCore ? ID.glowstone : (hash3(ix, 1028, iz) < 0.5 ? ID.purpur : MAG));
          if (hash3(ix, 1029, iz) < 0.4 && getBlockLocal(ix + 1, 30, iz) === ID.end_stone) setW(ix + 1, 30, iz, ID.purpur);   // 폭 변주
        }
      }
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
    // ── V20-AK: 손 사각 엔드 분위기 조형 — 부유 엔드석 소섬 + 코러스풍 자수정 군생 + 엔드로드 군집 ──
    for (let n = 0; n < 12; n++) {   // 공중 부유 엔드석 소섬(비대칭, 높이·크기 차등)
      const a = hash3(n, 400, 1) * Math.PI * 2, rr = 20 + hash3(n, 401, 2) * 26;
      const x = Math.round(64 + Math.cos(a) * rr), z = Math.round(64 + Math.sin(a) * rr);
      if (surfaceTop(x, z) < 4) continue;
      const cy = surfaceTop(x, z) + 8 + Math.floor(hash3(n, 402, 3) * 8), rad = 2 + Math.floor(hash3(n, 403, 4) * 2);
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { if (dx * dx + dz * dz > rad * rad) continue; setW(x + dx, cy, z + dz, ID.end_stone); if (dx * dx + dz * dz < rad) setW(x + dx, cy - 1, z + dz, ID.end_stone); }
      // 소섬 위 코러스풍 자수정 줄기(1~3칸) + 정상 발광
      const ch = 1 + Math.floor(hash3(n, 404, 5) * 3); for (let j = 1; j <= ch; j++) setW(x, cy + j, z, ID.purpur); setW(x, cy + ch + 1, z, ID.glowstone);
    }
    for (let n = 0; n < 8; n++) {   // 지면 코러스풍 자수정 군생(가지 뻗음)
      const a = hash3(n, 410, 1) * Math.PI * 2, rr = 8 + hash3(n, 411, 2) * 30;
      const x = Math.round(64 + Math.cos(a) * rr), z = Math.round(64 + Math.sin(a) * rr);
      if (surfaceTop(x, z) < 4) continue; const y0 = surfaceTop(x, z);
      const th = 2 + Math.floor(hash3(n, 412, 3) * 3);
      for (let j = 1; j <= th; j++) setW(x, y0 + j, z, ID.purpur);
      const bx = hash3(n, 413, 4) < 0.5 ? 1 : -1; setW(x + bx, y0 + th, z, ID.purpur); setW(x + bx, y0 + th + 1, z, ID.glowstone);   // 가지 + 발광 열매
    }
    // 보이드 세펄처(남쪽 엔드 벽돌 첨탑)
    const vy = surfaceTop(64, 98);
    for (let y2 = vy; y2 < vy + 12; y2++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (Math.abs(dx) + Math.abs(dz) <= 3) setW(64 + dx, y2, 98 + dz, edge ? ID.end_bricks : 0);
    }
    setW(64, vy + 12, 98, ID.glowstone);
    buildEndPillars();   // V46: 흑요석 기둥 8기 + 엔드 크리스탈(실제 엔드 상징)
    buildWarpPads();
  }
  // 🍄 버섯 사막 V6: 서쪽 균사체 버섯 숲 + 동쪽 사막(실제 Mushroom Desert 반반 구성)
  function genMushroom() {
    world = new Uint16Array(W * H * Dp);
    genBlobIsland(72, 72, 62, 15, {});
    // 반반 표면: 서쪽 균사체 / 동쪽 사막
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const y = surfaceTop(x, z) - 1;
      if (y < 5) continue;
      const cur = getBlockLocal(x, y, z);
      if (cur !== ID.grass && cur !== ID.dirt) continue;   // V20-BB: 노출 흙도 균사/모래로 덮어 이물 블럭 제거
      const desertT = (x - 72) / 20 + (hash3(x, 101, z) - 0.5) * 1.2;
      if (desertT > 0) { setW(x, y, z, ID.sand); if (hash3(x, 102, z) < 0.03) setW(x, y + 1, z, ID.tall_grass); }
      else setW(x, y, z, ID.mycelium);
    }
    // ── V20-AG: 동쪽 사막 모래언덕(칸 단위 완만 둔덕) — 평평 사막 탈피, 걷기 가능한 낮은 사구 ──
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const fy = surfaceTop(x, z); if (fy < 6) continue;
      if (getBlockLocal(x, fy, z) !== ID.sand) continue;
      const east = Math.max(0, Math.min(1, (x - 74) / 24));   // 동쪽일수록 사구 높음
      const dune = Math.round(smoothNoise(x, z, 18) * 3 * east);   // 연속 사구(임계값 없음→인접 단차 ≤1, 뾰족 기둥 없음)
      for (let k = 1; k <= dune; k++) setW(x, fy + k, z, ID.sand);
      if (dune >= 2 && hash3(x, 108, z) < 0.02) setW(x, fy + dune + 1, z, ID.dead_bush != null ? ID.dead_bush : ID.tall_grass);   // 사구 마른 덤불
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
    // ── V71: 실사(Mushroom_Desert.png) — 붉은 메사 후두 첨탑 + 선인장 + 서측 오아시스(야자/계단 연못) ──
    {
      const MOR = ID.terracotta_orange != null ? ID.terracotta_orange : ID.wool_orange;
      const MRD = ID.terracotta_red != null ? ID.terracotta_red : ID.bricks;
      const MBR = ID.terracotta_brown != null ? ID.terracotta_brown : ID.dirt;
      // 1) 후두(hoodoo) 첨탑 5기 — 붉은 밴딩 원기둥, 중앙 능선부
      for (const [hx, hz, hh, hr] of [[70, 48, 16, 3], [80, 56, 12, 2], [62, 60, 14, 3], [88, 44, 10, 2], [74, 66, 11, 2]]) {
        const g = surfaceTop(hx, hz);
        if (g < 8) continue;
        for (let y = 0; y < hh; y++) {
          const rr2 = y > hh - 3 ? hr - 1 : hr;
          for (let dx = -rr2; dx <= rr2; dx++) for (let dz = -rr2; dz <= rr2; dz++) {
            if (Math.hypot(dx, dz) > rr2 + 0.3) continue;
            const band = (g + y) % 5;
            setW(hx + dx, g + y, hz + dz, band === 0 ? MRD : band === 3 ? MBR : MOR);
          }
        }
        setW(hx, g + hh, hz, ID.sand); if (hh >= 14) setW(hx, g + hh + 1, hz, ID.mushroom_red_block != null ? ID.mushroom_red_block : 0);
      }
      // 2) 선인장(라임 콘크리트 기둥) — 동측 모래밭 산포
      const CAC = ID.concrete_lime != null ? ID.concrete_lime : (ID.wool_lime != null ? ID.wool_lime : ID.oak_leaves);
      for (let x = 78; x < W - 10; x += 2) for (let z = 14; z < Dp - 14; z += 2) {
        if (hash3(x, 1011, z) > 0.018) continue;
        const g = surfaceTop(x, z);
        if (g < 8 || getBlockLocal(x, g - 1, z) !== ID.sand || getBlockLocal(x, g, z) !== 0) continue;
        const ch = 2 + Math.floor(hash3(x, 1012, z) * 2);
        for (let y = 0; y < ch; y++) setW(x, g + y, z, CAC);
      }
      // 3) 서측 오아시스: 계단식 연못 3단 + 야자수 4그루 + 잔디 테
      {
        const ox2 = 36, oz2 = 84;
        for (let ti = 0; ti < 3; ti++) {
          const px2 = ox2 + ti * 5, pz2 = oz2 + ti * 3, pr = 4 - ti;
          const g = surfaceTop(px2, pz2);
          if (g < 8) continue;
          for (let dx = -pr; dx <= pr; dx++) for (let dz = -pr; dz <= pr; dz++) {
            const d = Math.hypot(dx, dz);
            if (d > pr + 0.3) continue;
            for (let y = g; y <= g + 3; y++) setW(px2 + dx, y, pz2 + dz, 0);
            setW(px2 + dx, g - 1, pz2 + dz, d > pr - 1 ? ID.grass : ID.water);
          }
        }
        for (const [tx2, tz2] of [[30, 80], [42, 80], [34, 92], [46, 90]]) {
          const g = surfaceTop(tx2, tz2);
          if (g < 8 || getBlockLocal(tx2, g, tz2) !== 0) continue;
          const th2 = 5 + Math.floor(hash3(tx2, 1013, tz2) * 2);
          for (let y = 0; y < th2; y++) setW(tx2, g + y, tz2, ID.jungle_log != null ? ID.jungle_log : ID.oak_log);
          for (const [lx2, lz2] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]])
            setW(tx2 + lx2, g + th2 - 1 + (Math.abs(lx2) + Math.abs(lz2) > 1 ? -1 : 0), tz2 + lz2, ID.oak_leaves);   // 야자 잎(펼침)
          setW(tx2, g + th2, tz2, ID.oak_leaves);
        }
      }
    }
    buildGiantMushrooms();   // V48: 거대 버섯 군락 + 사막 정착지(등산객 NPC 마을)
    buildWarpPads();
  }

  // 워프 패드 지형(흑요석 링 + 글로우스톤 심)
  function buildWarpPads() {
    // V123: 실제 스카이블럭식 슬라임 블럭 런치패드 — 3×3 슬라임 발판 + 에메랄드 테두리(밟으면 발사)
    const list = WARPS[worldMode] || [];
    const slime = ID.slime_block != null ? ID.slime_block : ID.emerald_block;
    const frame = ID.smooth_stone != null ? ID.smooth_stone : (ID.stone_bricks != null ? ID.stone_bricks : ID.stone);   // 슬라임 대비용 중립 회색 테두리
    for (const wp of list) {
      const y = surfaceTop(wp.x, wp.z) - 1;
      // 5×5 에메랄드 테두리 + 3×3 슬라임 코어
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const inner = (Math.abs(dx) <= 1 && Math.abs(dz) <= 1);
        setW(wp.x + dx, y, wp.z + dz, inner ? slime : frame);
      }
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
  function hasHomePortal(dest) {
    if (dest === 'hub' || dest === 'home') return true;
    const api = econApi();
    // V21-C: 인벤토리 '설치' 버튼으로 설치한 경우(P.portals 플래그)
    const P0 = api.getP ? api.getP() : null;
    if (P0 && P0.portals && P0.portals[dest]) return true;
    // 포탈 블록을 프라이빗 섬에 직접 설치한 경우(홈 편집 스캔)
    const id = ID['portal_' + dest];
    if (id == null) return false;
    const edits = api.getHomeEdits ? api.getHomeEdits() : {};
    for (const k in edits) if (Number(edits[k]) === id) return true;
    return false;
  }
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
  function warpTo(dest, menuWarp) {
    if (!WORLD_DEFS[dest]) return;
    if (window.econApi && window.econApi.markZoneVisited) window.econApi.markZoneVisited('world:' + dest);   // V40: 탐험가 퀘스트
    const req = WARP_REQ[dest];
    const api = econApi();
    if (req && api.skillLv && api.skillLv(req.sk) < req.lv) {
      if (typeof toast === 'function') toast(`🔒 ${WORLD_DEFS[dest].name}은(는) ${req.name} 스킬 ${req.lv}레벨부터! (실제 스카이블럭 해금 조건)`, false);
      warpCharge = null;
      return;
    }
    // V116: 허브 워프패드는 실제 스카이블럭 '빠른 이동'처럼 포탈 제작 없이도 작동(스킬 해금만).
    //   포탈 제작 게이트는 프라이빗 섬(home)에서 개인 포탈로 워프할 때만 적용(편의 기능).
    if (worldMode === 'home' && dest !== 'hub' && dest !== 'home' && dest !== 'dungeon' && !hasHomePortal(dest)) {
      if (typeof toast === 'function') toast(`🌀 프라이빗 섬에서 바로 가려면 ${WORLD_DEFS[dest].name} 포탈을 제작·설치하세요 — 아니면 허브의 워프패드로 이동할 수 있어요`, false);
      warpCharge = null;
      return;
    }
    if (typeof toast === 'function') toast(`🚀 ${WORLD_DEFS[dest].name}(으)로 워프!`, true);
    P.vy = 13;   // 슈퍼 점프 연출
    warpCharge = null;
    const go = () => setTimeout(() => { if (running) travelTo(dest); }, 420);
    if (dest === 'hub' && !HUB_MAP) loadHubMap().then(go);   // 첫 허브 진입 전 실제 맵 로드 보장
    else if (ISLAND_MAP_FILES[dest] && !ISLAND_MAPS[dest]) loadIslandMap(dest).then(go);   // 실제 섬 맵 파일 있으면 로드
    else go();
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

  // V23-A: 포탈 개구부에 들어가 1초 서 있으면 자동 워프(실제 지옥문) + 화면 울렁임(외곡) 이펙트
  let _portalFxOn = false;
  function setPortalFx(on) {
    if (on === _portalFxOn) return;
    _portalFxOn = on;
    if (canvas) canvas.classList.toggle('econ3d-portalwob', on);
  }
  function tickPortalStand(dt) {
    const p = PORTALS[worldMode];
    if (!p || panelOpen()) { P._portalT = 0; setPortalFx(false); return; }
    const oy = portalOpenY(p);
    const inside = P.x >= p.x - 0.1 && P.x <= p.x + 2.1 && P.z >= p.z - 0.15 && P.z <= p.z + 1.15 && P.y > oy - 0.6 && P.y < oy + 3;
    if (!inside) { P._portalT = 0; setPortalFx(false); return; }
    setPortalFx(true);
    P._portalT = (P._portalT || 0) + dt;
    const cross = document.getElementById('econ3dCross');
    if (cross) cross.textContent = '🌀';
    if (P._portalT >= 1.0) {
      P._portalT = 0; setPortalFx(false);
      if (cross) cross.textContent = '+';
      travelTo(p.target);
    }
  }

  /* ---------------- 3D 카타콤 던전: 직접 돌아다니며 몬스터를 잡고 보스까지 ---------------- */
  let dungeonState = null;   // {floor, fd, rooms:[{x0,x1,gateX,kills,need,cleared}], t0, deaths, kills, bossSpawned}
  function genDungeon() {
    world = new Uint16Array(W * H * Dp);
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
    buildDungeonDetail(ROOM_W, ROOMS);   // V20-AY(4차): 카타콤 폐허 디테일(바닥 파손·부서진 기둥·석관·화로·사슬·뼈)
    // ── V74: 실사(Dungeon_Hub.png) — 입구 방(x1~21)을 대회랑 홀로: 창백한 타일 바닥 + 기둥 열주 +
    //   대문 계단/장미창 + 해골 벽화 알코브(북) + 정원 누크(남) ──
    {
      const SM = ID.smooth_stone != null ? ID.smooth_stone : ID.stone_bricks;
      const AND4 = ID.polished_andesite != null ? ID.polished_andesite : ID.stone;
      const CH4 = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : ID.stone_bricks;
      // 1) 바닥 패턴: 중앙 창백 타일 대로(z 20~27) + 안산암 보더 + 외곽 석재
      for (let x = 1; x <= 21; x++) for (let z = 9; z <= 38; z++) {
        if (z >= 20 && z <= 27) setW(x, 2, z, (x + z) % 4 === 0 ? AND4 : SM);
        else if (z === 19 || z === 28) setW(x, 2, z, AND4);
        else if (hash3(x, 1041, z) < 0.25) setW(x, 2, z, AND4);
      }
      // 2) 열주 2열(z=17/z=30, x=5/9/13/17): 조각 석재 초석 + 석재 기둥 h6 + 청록 배너
      for (const pz of [17, 30]) for (const px of [5, 9, 13, 17]) {
        setW(px, 3, pz, CH4);
        for (let y = 4; y <= 8; y++) setW(px, y, pz, ID.stone_bricks);
        setW(px, 9, pz, CH4);
        setW(px, 6, pz + (pz === 17 ? 1 : -1), ID.wool_cyan != null ? ID.wool_cyan : ID.glass);   // 청록 배너
        setW(px, 5, pz + (pz === 17 ? 1 : -1), ID.wool_cyan != null ? ID.wool_cyan : ID.glass);
      }
      // 3) 대문(x22 게이트) 앞 계단 + 횃불 + 장미창(게이트 위 기어 로제트)
      for (let z = 21; z <= 26; z++) { setW(20, 3, z, SM); setW(21, 3, z, ID.stone_bricks); }
      setW(21, 5, 20, ID.glowstone); setW(21, 5, 27, ID.glowstone);
      { const rz = 23, ry = 8;   // 로제트: 링 + 중심 발광
        for (const [oy, oz] of [[0, -2], [0, 2], [-2, 0], [2, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) setW(21, ry + oy, rz + oz + 1, CH4);
        setW(21, ry, rz + 1, ID.glowstone);
      }
      // 4) 해골 벽화 알코브(북벽 z38 앞): 어두운 배경 + 사암 해골 + 빨간 눈
      {
        const bx = 8, by = 4;
        for (let dx = 0; dx < 9; dx++) for (let y = 0; y < 6; y++) setW(bx + dx, by + y, 38, ID.wool_black != null ? ID.wool_black : ID.obsidian);   // 배경
        const SKULL = [[2,4],[3,4],[4,4],[5,4],[6,4],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[1,2],[3,2],[5,2],[7,2],[2,1],[3,1],[4,1],[5,1],[6,1],[3,0],[5,0]];
        for (const [ox, oy] of SKULL) setW(bx + ox, by + oy, 38, ID.sandstone);
        setW(bx + 2, by + 2, 38, ID.wool_red); setW(bx + 6, by + 2, 38, ID.wool_red);   // 빨간 눈
        setW(bx - 1, by, 38, ID.lava);   // 용암 낙수 포인트
      }
      // 5) 정원 누크(남벽 z9~11, x3~8): 흙 + 소나무형 미니 나무 + 빨간 버섯 + 등
      {
        for (let x = 3; x <= 8; x++) for (let z = 9; z <= 11; z++) setW(x, 2, z, ID.dirt);
        setW(5, 3, 10, ID.oak_log); setW(5, 4, 10, ID.oak_log);
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) setW(5 + ox, 5, 10 + oz, ID.oak_leaves);
        setW(7, 3, 10, ID.mushroom_red_block != null ? ID.mushroom_red_block : ID.wool_red);
        setW(3, 3, 10, ID.tall_grass); setW(8, 3, 11, ID.glowstone);
      }
    }
    buildWarpPads();
  }
  // V20-AY 4차: 카타콤 던전 디테일 — 좌표 한 칸씩 손 배치. 방마다 바닥 질감 변주 + 부서진 기둥 +
  //   석관 + 화로 + 천장 사슬/거미줄 + 뼈 무더기. 중앙 통로(z20~26)·게이트는 비워 통행 유지.
  function buildDungeonDetail(ROOM_W, ROOMS) {
    const sb = ID.stone_bricks, moss = ID.mossy_cobblestone, cob = ID.cobblestone, ch = ID.chiseled_stone_bricks != null ? ID.chiseled_stone_bricks : sb;
    const web = ID.wool_white, glow = ID.glowstone, mag = ID.magma_block, fence = ID.oak_fence, q = ID.quartz_block;
    const st = (f) => (ID['stone_bricks_stairs_' + f] != null ? ID['stone_bricks_stairs_' + f] : sb);
    const slab = ID.stone_bricks_slab != null ? ID.stone_bricks_slab : sb, banner = ID.wool_red != null ? ID.wool_red : sb;
    const put = (x, y, z, id) => { if (x > 1 && x < W - 1 && z >= 9 && z <= 38) setW(x, y, z, id); };
    for (let ri = 0; ri <= ROOMS; ri++) {
      const cx = ri * ROOM_W + 11; if (cx < 4 || cx > W - 4) continue;
      // 바닥 질감 변주(이끼/자갈/균열) — 방 전역
      for (let x = cx - 9; x <= cx + 9; x++) for (let z = 10; z <= 37; z++) {
        if (getBlockLocal(x, 2, z) !== sb) continue;
        const h = hash3(x, 50 + ri, z);
        if (h < 0.12) put(x, 2, z, moss); else if (h < 0.20) put(x, 2, z, cob); else if (h < 0.26) put(x, 2, z, ch);
      }
      // 부서진 기둥 4곳(높이 차등, 부러진 꼭대기)
      for (const [ox, oz, hh] of [[-7, 12, 3], [7, 12, 4], [-7, 35, 2], [7, 35, 3]]) { for (let y = 3; y <= 2 + hh; y++) put(cx + ox, y, oz, sb); put(cx + ox, 3 + hh, oz, st(0)); }
      // 석관(관 + 슬랩 뚜껑 + 머리돌)
      for (const [ox, oz] of [[-8, 16], [8, 30]]) { put(cx + ox, 3, oz, sb); put(cx + ox, 3, oz + 1, sb); put(cx + ox, 4, oz, slab); put(cx + ox, 4, oz + 1, slab); put(cx + ox, 3, oz + 2, ch); }
      // 화로(코블 + 마그마 화심 + 발광) 4모서리
      for (const [ox, oz] of [[-8, 11], [8, 11], [-8, 36], [8, 36]]) { put(cx + ox, 3, oz, cob); put(cx + ox, 4, oz, mag); put(cx + ox, 5, oz, glow); }
      // 천장 사슬(울타리) + 거미줄 장막(중앙 통로 위쪽, 바닥 통행 무방해)
      for (const [ox, oz] of [[-3, 20], [3, 26], [0, 14], [0, 33]]) { put(cx + ox, 9, oz, fence); put(cx + ox, 8, oz, fence); put(cx + ox, 7, oz, web); }
      // 뼈 무더기(석영)
      for (const [ox, oz] of [[-5, 35], [5, 12], [-6, 28]]) { put(cx + ox, 3, oz, q); if (hash3(cx + ox, 55, oz) < 0.5) put(cx + ox + 1, 3, oz, q); }
      // 벽 배너(붉은) 양측
      put(cx - 9, 5, 13, banner); put(cx - 9, 6, 13, banner); put(cx + 9, 5, 34, banner); put(cx + 9, 6, 34, banner);
    }
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
    const def = { name: opt.name, kind: opt.kind || 'humanoid', color: opt.color || 0x3a7d3a, hp: opt.hp, dmg: opt.dmg, fixedStats: true, xp: 10 + opt.lv, coins: 8 + opt.lv, speed: 2.0, drops: [{ key: 'string', n: 1 }, { key: 'spider_eye', n: 1, chance: 0.5 }], tierCap: Math.min(6, dungeonState ? dungeonState.floor : 2) };   // V96: 던전 보스/미니보스 HP는 fd.bossHp 등 확정값 — 레벨배수 이중적용 금지(F7 네크론 1.2M이 30M로 폭주하던 버그)
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
  // V21-D6: 실제 MC 광석 질감 — 돌 바탕(군집 얼룩) 위에 불규칙 십자·다이아형 광맥(외곽 그림자+하이라이트)
  function oreTex(c, ox, oy, r, ore) {
    // 바탕: MC 스타일 군집 돌(저주파 패치)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const patch = hash3(x >> 2, 7, y >> 2), fine = r();
      const base = patch < 0.3 ? '#747474' : patch < 0.7 ? '#7e7e7e' : '#868686';
      px(c, ox + x, oy + y, fine < 0.12 ? '#6b6b6b' : fine > 0.9 ? '#8f8f8f' : base);
    }
    // 광맥: 고정 배치 4군집(실제 MC처럼 십자+모서리 결손형), 어두운 테두리 + 밝은 심
    const hxc = (hex, fac) => { const n = parseInt(hex.slice(1), 16); const R = Math.min(255, ((n >> 16 & 255) * fac) | 0), G = Math.min(255, ((n >> 8 & 255) * fac) | 0), B = Math.min(255, ((n & 255) * fac) | 0); return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1); };
    const dark = hxc(ore, 0.55), lite = hxc(ore, 1.35);
    const clusters = [[2, 2], [10, 3], [4, 9], [11, 11]];
    for (const [bx, by] of clusters) {
      // 십자형 본체(모서리 1픽셀 결손 → 불규칙)
      const cells = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2], [2, 0], [0, 2]];
      cells.forEach(([dx, dy], i) => { if (i >= 6 && hash3(bx, i, by) < 0.5) return; px(c, ox + bx + dx, oy + by + dy, ore); });
      px(c, ox + bx + 1, oy + by + 1, lite);                       // 심(하이라이트)
      px(c, ox + bx + 3, oy + by + 2, dark); px(c, ox + bx, oy + by, dark);   // 그림자 픽셀
    }
  }
  // V21-D6: 실제 MC 판자 질감 — 가로 널 4장 + 널마다 어긋난 세로 이음매 + 상단 하이라이트
  function plankTex(c, ox, oy, r, light, mid, dark) {
    const seams = [11, 3, 13, 5];   // 널(row)별 세로 이음매 x 오프셋(MC처럼 어긋남)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 2;
      let col = (row % 2) ? mid : light;
      if (r() < 0.08) col = dark;                       // 나뭇결 점
      if (y % 4 === 3) col = dark;                      // 널 사이 가로 홈
      if (y % 4 === 0 && r() < 0.5) col = light;        // 널 상단 하이라이트
      if (x === seams[row]) col = dark;                 // 세로 이음매
      px(c, ox + x, oy + y, col);
    }
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
    if (name.indexOf('portal_') === 0) {
      fillNoise('#25143f', '#160b28', '#3a2064');
      c.fillStyle = '#8f63ff';
      c.fillRect(ox + 5, oy + 2, 6, 12);
      c.fillRect(ox + 2, oy + 5, 12, 6);
      c.fillStyle = '#d8c8ff';
      c.fillRect(ox + 7, oy + 4, 2, 2);
      c.fillRect(ox + 4, oy + 10, 2, 2);
      c.strokeStyle = '#0d0718';
      c.strokeRect(ox + 1.5, oy + 1.5, 13, 13);
      return;
    }
    switch (name) {
      case 'smooth_stone': fillNoise('#9a9a9a', '#8f8f8f', '#a6a6a6'); break;
      case 'polished_andesite': fillNoise('#a2a4a2', '#989a98', '#adafad'); break;
      case 'chiseled_stone_bricks': { fillNoise('#7b7b7b', '#6f6f6f', '#868686'); c.strokeStyle = '#5a5a5a'; c.strokeRect(ox + 3.5, oy + 2.5, 9, 11); c.fillStyle = '#5a5a5a'; c.fillRect(ox + 7, oy + 4, 2, 8); break; }
      case 'mossy_cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.22 ? '#4a5a3a' : t < 0.45 ? '#5a5a5a' : t < 0.72 ? '#7d7d7d' : '#6a7a52'); } break;
      case 'prismarine': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#4f9a8e' : t < 0.6 ? '#5aad9e' : t < 0.85 ? '#66c2b4' : '#7ad0c2'); } break;
      case 'bookshelf': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); for (let bx = 0; bx < 16; bx += 3) { const col = ['#b23b2e', '#2e6ab2', '#2e9a4a', '#c8a02a', '#8a4fb2'][(r() * 5) | 0]; for (let y = 2; y < 14; y++) if ((y >> 2) % 2 === 0) c.fillStyle = col, c.fillRect(ox + bx, oy + y, 2, 1); } break; }
      case 'crafting_table_top': { fillNoise('#9c6b35', '#8a5c2d', '#b47a3c'); c.strokeStyle = '#5a3a1d'; c.strokeRect(ox + 2.5, oy + 2.5, 11, 11); c.fillStyle = '#c69a52'; c.fillRect(ox + 5, oy + 5, 6, 6); break; }
      case 'crafting_table_side': { fillNoise('#8a5c2d', '#74481f', '#a36a34'); c.fillStyle = '#3a2412'; c.fillRect(ox + 2, oy + 3, 12, 2); c.fillRect(ox + 3, oy + 8, 10, 2); c.fillStyle = '#c0a060'; c.fillRect(ox + 5, oy + 11, 6, 2); break; }
      case 'furnace_top': { fillNoise('#777', '#666', '#888'); c.strokeStyle = '#444'; c.strokeRect(ox + 2.5, oy + 2.5, 11, 11); break; }
      case 'furnace_side': { fillNoise('#777', '#666', '#888'); c.fillStyle = '#1f1f1f'; c.fillRect(ox + 4, oy + 5, 8, 5); c.fillStyle = '#d96b28'; c.fillRect(ox + 5, oy + 10, 6, 2); break; }
      case 'chest_top': { fillNoise('#a66a2c', '#8a5524', '#bb7b34'); c.strokeStyle = '#5a3416'; c.strokeRect(ox + 1.5, oy + 1.5, 13, 13); c.fillStyle = '#d9b64a'; c.fillRect(ox + 7, oy + 6, 2, 4); break; }
      case 'chest_side': { fillNoise('#a66a2c', '#8a5524', '#bb7b34'); c.strokeStyle = '#4a2a12'; c.strokeRect(ox + 1.5, oy + 3.5, 13, 10); c.fillStyle = '#d9b64a'; c.fillRect(ox + 7, oy + 7, 2, 3); break; }
      case 'hay_top': { fillNoise('#c8a83a', '#b89830', '#d8b84a'); c.strokeStyle = '#8a6f20'; c.strokeRect(ox + 0.5, oy + 0.5, 15, 15); break; }
      case 'hay_side': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, (y % 5 === 4) ? '#8a6f20' : (r() < 0.5 ? '#c2a234' : '#d0b040')); } break;
      case 'stone': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const patch = hash3(x >> 2, 5, y >> 2), t = r(); let col = patch < 0.3 ? '#747474' : patch < 0.7 ? '#7e7e7e' : '#868686'; if (t < 0.1) col = '#6b6b6b'; else if (t > 0.92) col = '#909090'; f(x, y, col); } break;   // V21-D6: MC식 저주파 얼룩 패치
      case 'dirt': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.25 ? '#6e4c34' : t < 0.55 ? '#7d573c' : t < 0.82 ? '#8a6044' : '#976b4d'); } break;
      case 'grass_top': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5b9142' : t < 0.7 ? '#6aa84f' : '#7bbf5c'); } break;
      case 'grass_side': { fillNoise('#7d573c', '#6e4c34', '#8a6044'); for (let x = 0; x < 16; x++) { const gh = 3 + (r() < 0.33 ? 1 : 0); for (let y = 0; y < gh; y++) f(x, y, r() < 0.5 ? '#5b9142' : '#6aa84f'); } break; }
      case 'sand': fillNoise('#e0d6a0', '#d4c98e', '#ece2b0'); break;
      case 'sandstone': { fillNoise('#d9cda0', '#cabf90', '#e6dab0'); for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) f(x, y, '#bcb080'); break; }
      case 'cobble': {   // V21-D6: 실제 MC 조약돌 — 둥근 돌 셀 + 어두운 몰탈 선(보로노이 근사)
        const seeds = [[3, 2], [10, 2], [14, 5], [6, 6], [1, 8], [11, 9], [4, 12], [13, 13], [8, 15]];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let d1 = 99, d2 = 99, si = 0;
          for (let i = 0; i < seeds.length; i++) { const dx0 = Math.min(Math.abs(x - seeds[i][0]), 16 - Math.abs(x - seeds[i][0])), dy0 = Math.min(Math.abs(y - seeds[i][1]), 16 - Math.abs(y - seeds[i][1])); const d = Math.hypot(dx0, dy0); if (d < d1) { d2 = d1; d1 = d; si = i; } else if (d < d2) d2 = d; }
          const mortar = (d2 - d1) < 0.9;   // 셀 경계 = 몰탈
          const shade = hash3(si, 3, 0);
          f(x, y, mortar ? '#565656' : (shade < 0.33 ? '#7a7a7a' : shade < 0.66 ? '#858585' : '#929292'));
        }
        break;
      }
      case 'stonebrick': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#7b7b7b' : '#888')); } break;
      case 'bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#7a3527' : '#9a4f3f'); } break;
      case 'planks': plankTex(c, ox, oy, r, '#b08a4f', '#9c7a44', '#7a5f34'); break;
      case 'birch_planks': plankTex(c, ox, oy, r, '#d8c99a', '#c8b787', '#b0a074'); break;
      case 'spruce_planks': plankTex(c, ox, oy, r, '#6b4f2e', '#5b4226', '#4a3720'); break;
      case 'dark_oak_planks': plankTex(c, ox, oy, r, '#432f19', '#3a2a16', '#281b0e'); break;
      case 'jungle_planks': plankTex(c, ox, oy, r, '#a9784f', '#9a6a44', '#7a5232'); break;
      case 'acacia_planks': plankTex(c, ox, oy, r, '#b8622f', '#a85526', '#8a4018'); break;
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
      case 'glass': {   // V21-D6: 실제 MC 유리 — 흰 테두리 프레임 + 좌상단 대각 광택 줄 2개 + 옅은 내부
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, '#cdeaf4');
        c.fillStyle = '#ffffff';
        c.fillRect(ox, oy, 16, 1); c.fillRect(ox, oy + 15, 16, 1); c.fillRect(ox, oy, 1, 16); c.fillRect(ox + 15, oy, 1, 16);   // 테두리
        for (let i = 0; i < 6; i++) { f(2 + i, 8 - i, '#f2fbff'); f(2 + i, 9 - i, '#f2fbff'); }   // 대각 광택 줄(굵음)
        for (let i = 0; i < 4; i++) f(8 + i, 12 - i, '#eaf6fc');                                   // 대각 광택 줄(가늘게)
        break;
      }
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
      case 'granite': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = hash3(x >> 2, 9, y >> 2), t = r(); f(x, y, t < 0.12 ? '#7a4a3a' : p < 0.35 ? '#9a6a55' : p < 0.7 ? '#a87560' : '#b5806a'); } break; }
      case 'polished_granite': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x === 0 || y === 0) ? '#c08a72' : (x === 15 || y === 15) ? '#8a5a48' : (r() < 0.15 ? '#9a6a55' : '#a87560'))); break; }
      case 'diorite': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.2 ? '#8a8a8a' : t < 0.55 ? '#c8c8c6' : t < 0.85 ? '#d8d8d4' : '#b8b8b4'); } break; }
      case 'polished_diorite': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x === 0 || y === 0) ? '#e8e8e4' : (x === 15 || y === 15) ? '#a8a8a4' : (r() < 0.12 ? '#b8b8b4' : '#d0d0cc'))); break; }
      case 'andesite': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = hash3(x >> 2, 13, y >> 2), t = r(); f(x, y, t < 0.15 ? '#7a7a76' : p < 0.5 ? '#8a8a86' : '#989892'); } break; }
      case 'mossy_stone_bricks': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); const mossy = hash3(x >> 1, 15, y >> 1) < 0.3; f(x, y, e ? (mossy ? '#3e5a2e' : '#5a5a5a') : (mossy && r() < 0.5 ? '#5a7a44' : (r() < 0.5 ? '#7b7b7b' : '#888'))); } break; }
      case 'cracked_stone_bricks': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#757575' : '#828282')); } for (let i2 = 0; i2 < 10; i2++) { const cx2 = 2 + ((hash3(i2, 3, 1) * 12) | 0), cy2 = 2 + ((hash3(i2, 5, 2) * 12) | 0); f(cx2, cy2, '#4a4a4a'); f(cx2 + 1, cy2 + 1, '#4a4a4a'); } break; }
      case 'red_sandstone': { fillNoise('#c46a35', '#b55f2d', '#d2763d'); for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) f(x, y, '#a35426'); break; }
      case 'smooth_sandstone': { fillNoise('#e2d6a8', '#d8cc9c', '#eaddb2'); break; }
      case 'iron_block': case 'gold_block': case 'diamond_block': case 'emerald_block': case 'coal_block': case 'redstone_block': case 'lapis_block': {
        // V21-F1: 자체 디자인 광물 블록 — 본체 음영 + 밝은 테두리 + 모서리 리벳
        const MB = { iron_block: '#d8d8d4', gold_block: '#f7d84a', diamond_block: '#5decd5', emerald_block: '#17a94f', coal_block: '#31313a', redstone_block: '#a01818', lapis_block: '#1a44a5' }[name];
        const hxm = (fac) => hx(MB, fac);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.12 ? hxm(0.9) : (r() > 0.88 ? hxm(1.08) : MB));
        for (let i2 = 0; i2 < 16; i2++) { f(i2, 0, hxm(1.18)); f(i2, 15, hxm(0.72)); f(0, i2, hxm(1.1)); f(15, i2, hxm(0.78)); }
        for (const [sx, sy] of [[2, 2], [13, 2], [2, 13], [13, 13]]) f(sx, sy, hxm(0.6));
        break;
      }
      case 'ladder': {   // V21-E2: 자체 디자인 — 세로 레일 2 + 가로 발판 4(배경 투명)
        for (let y = 0; y < 16; y++) for (const x of [2, 3, 12, 13]) f(x, y, x === 2 || x === 12 ? '#8a6a3c' : '#a07c46');
        for (const ry of [2, 6, 10, 14]) for (let x = 4; x < 12; x++) { f(x, ry, '#9c7a44'); f(x, ry + 1, '#7a5f34'); }
        break;
      }
      case 'bed_top': {   // 자체 디자인 — 베개(상단 1/3 흰색) + 이불(하단 붉은색, 주름선)
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, y < 5 ? (r() < 0.15 ? '#e2e2dc' : '#f2f2ec') : (r() < 0.2 ? '#9e1f1c' : '#b02724'));
        for (let x = 0; x < 16; x++) { f(x, 5, '#7a1512'); f(x, 10, '#8e1b18'); }
        c.strokeStyle = '#5a3a1d'; c.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
        break;
      }
      case 'bed_side': {   // 자체 디자인 — 나무 받침 + 이불 옆면
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, y >= 12 ? '#7a5f34' : y >= 10 ? '#8a6a3c' : (r() < 0.2 ? '#9e1f1c' : '#b02724'));
        for (let x = 0; x < 16; x++) f(x, 3, '#7a1512');
        break;
      }
      case 'mushroom_stem': fillNoise('#d5cfc2', '#c8c2b4', '#e2dcd0'); break;
      case 'mushroom_red': { fillNoise('#b02724', '#9e1f1c', '#c23330'); for (let i = 0; i < 4; i++) { const bx = 1 + ((r() * 11) | 0), by = 1 + ((r() * 11) | 0); c.fillStyle = '#f2efe4'; c.fillRect(ox + bx, oy + by, 3, 3); } break; }
      case 'mushroom_brown': fillNoise('#8a674a', '#7a5a3e', '#9a7656'); break;
      case 'gravel': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.28 ? '#6a655f' : t < 0.55 ? '#7d7873' : t < 0.82 ? '#8d8883' : '#9a9590'); } break;
      case 'end_bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#b8ba82' : (r() < 0.5 ? '#d5d79a' : '#e0e2a4')); } break;
      case 'purpur': { fillNoise('#a678a6', '#96689a', '#b688b2'); for (let i = 2; i <= 6; i += 4) { c.strokeStyle = '#84588a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'quartz': fillNoise('#ece6e0', '#e0dad2', '#f6f0ea'); break;
      case 'magma': { fillNoise('#3a1e14', '#2e160e', '#48281a'); for (let i = 0; i < 9; i++) { const bx = (r() * 14) | 0, by = (r() * 14) | 0; c.fillStyle = r() < 0.5 ? '#e8632a' : '#f7a02a'; c.fillRect(ox + bx, oy + by, 2, 1); } break; }
      case 'coarse_dirt': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5a4630' : t < 0.6 ? '#6a5238' : t < 0.85 ? '#75593c' : '#4e3c28'); } break;
      case 'slime_block': {   // V123: 슬라임 블럭 — 반투명 연두 외곽 + 내부 슬라임 젤 사각(발사대)
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.5 ? '#6fc04a' : t < 0.8 ? '#63b23f' : '#7ccf57'); }
        for (let i2 = 0; i2 < 16; i2++) { f(i2, 0, '#82d95e'); f(i2, 15, '#4f9a34'); f(0, i2, '#7ccf57'); f(15, i2, '#569a3a'); }
        // 내부 젤리 코어(밝은 반투명 사각)
        for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) { const edge = (x === 4 || x === 11 || y === 4 || y === 11); f(x, y, edge ? '#4c8f30' : (r() < 0.5 ? '#8ee06a' : '#a2ea82')); }
        break;
      }
      default: fillNoise('#888', '#666', '#aaa');
    }
  }
  function buildAtlas() {
    const names = new Set();
    BLOCKS.forEach(b => { if (!b.tex) return; if (typeof b.tex === 'string') names.add(b.tex); else { names.add(b.tex.top); names.add(b.tex.side); names.add(b.tex.bottom); } });
    const list = Array.from(names); const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * 16;
    { let potH = 16; while (potH < rows * 16) potH <<= 1; cv.height = potH; }   // V26: 밉맵용 2의 거듭제곱 패딩
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    list.forEach((nm, i) => { const cx = (i % cols) * 16, cy = ((i / cols) | 0) * 16; paintTile(c, cx, cy, nm); });
    // V20-U: 전역 컬러 그레이드 — 유치원식 과밝음 탈피. 대비·채도↑, 밝기 소폭↓ → 모든 블럭 픽셀 색을 깊고 찬란하게.
    try {
      const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
      const contrast = 1.16, mid = 128, bright = 0.93, sat = 1.22;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        r = (r - mid) * contrast + mid; g = (g - mid) * contrast + mid; b = (b - mid) * contrast + mid;   // 대비
        r *= bright; g *= bright; b *= bright;                                                             // 밝기 소폭↓
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;                   // 채도↑
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      c.putImageData(img, 0, 0);
    } catch (e) {}
    atlasUV = {};
    const vRows = cv.height / 16;   // V26: 패딩 반영 v 좌표
    list.forEach((nm, i) => { const cx = (i % cols), cy = ((i / cols) | 0); const e = 0.01; atlasUV[nm] = { x0: (cx + e) / cols, x1: (cx + 1 - e) / cols, y0: (cy + e) / vRows, y1: (cy + 1 - e) / vRows }; });
    // V21-G1: 유체 애니메이션 준비 — 물/용암 타일 위치를 기억해 매 틱 자체 디자인 프레임으로 다시 그린다
    _fluidAnim = { c, tiles: [] };
    ['water', 'lava'].forEach(nm => { const i = list.indexOf(nm); if (i >= 0) _fluidAnim.tiles.push([nm, (i % cols) * 16, ((i / cols) | 0) * 16]); });
    // V26-B: 밉맵 원상복구 — 근거리까지 뭉개져 보인다는 리포트로 픽셀 선명(Nearest) 복귀
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;
    atlasTex.flipY = false; atlasTex.needsUpdate = true;
    // V21-E4: 사용자 리소스팩 오버레이 — resourcepack/manifest.json에 나열된 타일명을
    //   resourcepack/<타일명>.png(16×16)로 로드해 아틀라스에 덮어쓴다(없으면 절차 텍스처 유지).
    //   ※ 텍스처 파일은 사용자가 직접 로컬에 넣는다 — 저장소에는 포함하지 않는다(저작권).
    try {
      // 매니페스트 불요 — 아틀라스의 '모든' 타일명에 대해 resourcepack/<타일명>.png를 시도한다.
      // 파일이 있는 타일만 교체되고 없는 타일은 절차 텍스처 유지(404는 조용히 무시).
      // V22-J1: 공식 MC 파일명 완전 매핑 — 이름 규칙 차이(별칭) + 회색조 틴트 + 애니메이션 스트립까지
      //   블럭 종류마다 리소스팩 이미지 형태가 다른 것을 전부 고려한다:
      //   ① 이름 그대로(stone 등) ② 어순/명명 차이(wool_red→red_wool 등) ③ 회색조+틴트(잔디 윗면/잎/물)
      //   ④ 세로 스트립 애니메이션(water_still/lava_still/magma — 프레임 순환) ⑤ 엔티티 텍스처(상자/침대)는 내장 유지
      const RP_COLOR = { lightblue: 'light_blue', lightgray: 'light_gray' };
      const RP_ALIAS = {
        cobble: 'cobblestone', planks: 'oak_planks', log_side: 'oak_log', log_top: 'oak_log_top',
        grass_top: 'grass_block_top', grass_side: 'grass_block_side', glow: 'glowstone', stonebrick: 'stone_bricks',
        mossy_cobble: 'mossy_cobblestone', quartz: 'quartz_block_side', birch_side: 'birch_log', spruce_side: 'spruce_log',
        spruce_top: 'spruce_log_top', dark_oak_side: 'dark_oak_log', dark_oak_top: 'dark_oak_log_top',
        jungle_side: 'jungle_log', jungle_top: 'jungle_log_top', acacia_side: 'acacia_log', acacia_top: 'acacia_log_top',
        leaves: 'oak_leaves', water: 'water_still', lava: 'lava_still', magma: 'magma',
        mycelium_top: 'mycelium_top', farmland_top: 'farmland', wheat_mature: 'wheat_stage7',
        carrot_mature: 'carrots_stage3', potato_mature: 'potatoes_stage3',
        flower_red: 'poppy', flower_yellow: 'dandelion', tall_grass: 'short_grass',
        mushroom_red: 'red_mushroom', mushroom_brown: 'brown_mushroom',
        hay_top: 'hay_block_top', hay_side: 'hay_block_side',
        melon: 'melon_side', purpur: 'purpur_block', end_bricks: 'end_stone_bricks', smooth_sandstone: 'sandstone_top',
        crafting_table_top: 'crafting_table_top', furnace_side: 'furnace_side',
      };
      for (const col of ['white', 'orange', 'magenta', 'lightblue', 'yellow', 'lime', 'pink', 'gray', 'lightgray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
        const oc = RP_COLOR[col] || col;
        RP_ALIAS['wool_' + col] = oc + '_wool'; RP_ALIAS['concrete_' + col] = oc + '_concrete'; RP_ALIAS['terracotta_' + col] = oc + '_terracotta';
      }
      // 회색조 원본에 곱할 색(MC 바이옴 틴트) — 기본값은 실제 MC 평원 수치(잔디 #91bd59 / 잎 #77ab2f).
      //   colormap/grass.png·foliage.png가 있으면 실제 컬러맵의 평원 좌표(51,173)를 샘플링해 대체(V27-B).
      const RP_TINT = {
        grass_top: '#91bd59', leaves: '#77ab2f', spruce_leaves: '#619961', dark_oak_leaves: '#77ab2f',
        jungle_leaves: '#77ab2f', acacia_leaves: '#aea42a', tall_grass: '#91bd59', water: '#3f76e4',
      };
      const applyTint = (ctx, tx, ty, hex) => {
        try {
          const im = ctx.getImageData(tx, ty, 16, 16), dd = im.data;
          const R = parseInt(hex.slice(1, 3), 16) / 255, G = parseInt(hex.slice(3, 5), 16) / 255, B = parseInt(hex.slice(5, 7), 16) / 255;
          for (let i = 0; i < dd.length; i += 4) { dd[i] *= R; dd[i + 1] *= G; dd[i + 2] *= B; }
          ctx.putImageData(im, tx, ty);
        } catch (e) {}
      };
      let applied = 0, done = 0;
      const fin = () => { done++; if (done === list.length && applied > 0 && typeof console !== 'undefined') console.log(`[resourcepack] ${applied} tiles applied`); };   // V121: 팝업 토스트 제거(실제 MC엔 없음) — 콘솔 로그만
      // V27-B: colormap 샘플링을 먼저 끝낸 뒤 타일 오버레이 실행(틴트가 페인트 시점에 결정되므로)
      let _cmPend = 2;
      const cmDone = () => { if (--_cmPend <= 0) runOverlay(); };
      const sampleCm = (src, cb) => {
        const im = new Image();
        im.onload = () => {
          try {
            const c2 = document.createElement('canvas'); c2.width = im.width; c2.height = im.height;
            const x2 = c2.getContext('2d'); x2.drawImage(im, 0, 0);
            const px = Math.round(51 / 256 * im.width), py = Math.round(173 / 256 * im.height);
            const d = x2.getImageData(px, py, 1, 1).data;
            cb('#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
          } catch (e) {}
          cmDone();
        };
        im.onerror = cmDone;
        im.src = src;
      };
      sampleCm('colormap/grass.png', h => { RP_TINT.grass_top = h; RP_TINT.tall_grass = h; });
      sampleCm('colormap/foliage.png', h => { RP_TINT.leaves = h; RP_TINT.dark_oak_leaves = h; RP_TINT.jungle_leaves = h; });
      const runOverlay = () => list.forEach((nm, i) => {
        const paint2 = (img2) => {
          const tx = (i % cols) * 16, ty = ((i / cols) | 0) * 16;
          const frames = img2.height > img2.width ? Math.floor(img2.height / img2.width) : 1;
          c.clearRect(tx, ty, 16, 16);
          // 잎처럼 투명 픽셀이 있는 '불투명 큐브' 타일은 어두운 배경 위에 합성(MC 빠른 그래픽 방식) — 투명 얼룩 방지
          // V24-B: 잎 배경칠 제거 — 팬시 그래픽(알파컷 투명)으로 전환되어 불필요
          c.drawImage(img2, 0, 0, img2.width, img2.width, tx, ty, 16, 16);
          if (RP_TINT[nm]) applyTint(c, tx, ty, RP_TINT[nm]);
          if (_fluidAnim) {
            _fluidAnim.tiles = _fluidAnim.tiles.filter(t => t[0] !== nm);   // 내장 절차 애니메이션 해제
            if (frames > 1) _fluidAnim.strips = (_fluidAnim.strips || []).concat([{ img: img2, frames, tx, ty, tint: RP_TINT[nm] || null, f: 0 }]);   // 실제 MC 프레임 순환
          }
          atlasTex.needsUpdate = true; applied++; fin();
        };
        const img2 = new Image();
        img2.onload = () => paint2(img2);
        img2.onerror = () => {
          const alias = RP_ALIAS[nm];
          if (!alias || alias === nm) return fin();
          const img3 = new Image();
          img3.onload = () => paint2(img3);
          img3.onerror = fin;
          img3.src = 'resourcepack/' + alias + '.png';
        };
        img2.src = 'resourcepack/' + nm + '.png';
      });
    } catch (e) {}
    blockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
    waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    plantMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    lavaMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
  }
  function faceTexName(b, faceN) { if (typeof b.tex === 'string') return b.tex; if (faceN === 'top') return b.tex.top; if (faceN === 'bottom') return b.tex.bottom; return b.tex.side; }
  // V21-B: 블럭 아이템 아이콘 — 월드와 '같은 텍스처'로 등축(아이소메트릭) 큐브 렌더 → 인벤토리에서
  //   블럭이 실제 생김새 그대로 구분됨. cross(꽃/풀)·문·반블럭 등 비큐브는 타일 평면으로.
  const _blkIconCache = {};
  function tileCanvasFor(name) {
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    paintTile(c, 0, 0, name); return cv;
  }
  window.econBlockIcon = function (key) {
    if (_blkIconCache[key]) return _blkIconCache[key];
    let id = (typeof PLACE_BLOCK === 'object' && PLACE_BLOCK[key] != null) ? PLACE_BLOCK[key] : ID[key];
    if (id == null) return null;
    const b = BLOCKS[id]; if (!b || !b.tex) return null;
    const S2 = 40, cv = document.createElement('canvas'); cv.width = S2; cv.height = S2;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    const topT = tileCanvasFor(faceTexName(b, 'top')), sideT = tileCanvasFor(faceTexName(b, 'side'));
    const quad = (img, ox, oy, ux, uy, vx, vy, dim) => {   // 단위정사각형→평행사변형 매핑
      c.save(); c.setTransform(ux / 16, uy / 16, vx / 16, vy / 16, ox, oy);
      c.drawImage(img, 0, 0); c.restore();
      if (dim < 1) { c.save(); c.globalAlpha = 1 - dim; c.globalCompositeOperation = 'source-atop'; c.setTransform(ux / 16, uy / 16, vx / 16, vy / 16, ox, oy); c.fillStyle = '#000'; c.fillRect(0, 0, 16, 16); c.restore(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    };
    if (b.cross || b.shape === 'door' || b.shape === 'trapdoor' || b.shape === 'fence') {
      c.drawImage(sideT, 4, 4, 32, 32);                                       // 평면 타일(MC 아이템식)
    } else {
      // 등축 큐브: 윗면(마름모) + 좌/우면(음영) — MC 블럭 아이템과 같은 구도
      quad(topT, 20, 3, 15, 8, -15, 8, 1);        // 윗면: O(20,3), U=(15,8), V=(-15,8)
      quad(sideT, 5, 11, 15, 8, 0, 14, 0.8);      // 좌면: O(5,11), U=(15,8), V=(0,14) — 어둡게
      quad(sideT, 20, 19, 15, -8, 0, 14, 0.62);   // 우면: O(20,19), U=(15,-8), V=(0,14) — 더 어둡게
    }
    const url = cv.toDataURL(); _blkIconCache[key] = url; return url;
  };

  /* ---------------- 메싱(면 컬링 + AO, 전체 1회 빌드) ---------------- */
  const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.6 },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.6 },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, n: 'top' },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, n: 'bottom' },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.8 },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.8 },
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
      // V24-C(감사 #5): 셀 경계에 딱 붙은 면이 불투명 이웃에 가려지면 스킵(반블럭/계단 숨은 면 컬링)
      const flush = (fi === 0 && bx1 === 1) || (fi === 1 && bx0 === 0) || (fi === 2 && by1 === 1) || (fi === 3 && by0 === 0) || (fi === 4 && bz1 === 1) || (fi === 5 && bz0 === 0);
      if (flush && opaqueAt(x + f.dir[0], y + f.dir[1], z + f.dir[2])) continue;
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
    if (b.shape === 'chest') { emitBox(T, b, x, y, z, 0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375); return; }
    if (b.shape === 'ladder') {   // V21-E2: 벽 부착 얇은 판(부착 벽 방향 f: 0=-z 1=+x 2=+z 3=-x)
      const L = [[0, 0, 0, 1, 1, 0.0625], [0.9375, 0, 0, 1, 1, 1], [0, 0, 0.9375, 1, 1, 1], [0, 0, 0, 0.0625, 1, 1]][b.facing || 0];
      emitBox(T, b, x, y, z, L[0], L[1], L[2], L[3], L[4], L[5]);
      return;
    }
    if (b.shape === 'bed') {   // V21-E2: 침대 — 매트리스(9/16) + 받침 다리 4개
      emitBox(T, b, x, y, z, 0, 0.1875, 0, 1, 0.5625, 1);
      for (const [lx, lz] of [[0, 0], [0.8125, 0], [0, 0.8125], [0.8125, 0.8125]]) emitBox(T, b, x, y, z, lx, 0, lz, lx + 0.1875, 0.1875, lz + 0.1875);
      return;
    }
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
  // V21-D7: 적응형 시야 거리 — 저사양(허브 448² 밀집 도시)에서 fps가 떨어지면 자동 축소, 여유 있으면 복원.
  let VIEW_DIST = 96;             // 이 반경 안의 미빌드 청크는 큐잉해 복원(48~96 동적)
  let CULL_DIST = 140;            // 이 밖의 청크 메시는 해제(히스테리시스로 스래싱 방지)
  let _fpsAvg = 60, _adaptT = 0;
  // V21-G1: 물/용암 타일 애니메이션(자체 디자인 프레임) — 0.18초마다 위상 이동, 흐르는 느낌
  function tickFluidAnim(dt) {
    if (!_fluidAnim || !atlasTex) return;
    _fluidT += dt; if (_fluidT < 0.18) return; _fluidT = 0;
    _fluidPhase = (_fluidPhase + 1) & 15;
    const c = _fluidAnim.c, ph = _fluidPhase;
    // V22-J1: 리소스팩 애니메이션 스트립(물/용암/마그마 등) — 실제 MC 프레임 순환
    if (_fluidAnim.strips) {
      for (const st of _fluidAnim.strips) {
        st.f = (st.f + 1) % st.frames;
        c.clearRect(st.tx, st.ty, 16, 16);
        c.drawImage(st.img, 0, st.f * st.img.width, st.img.width, st.img.width, st.tx, st.ty, 16, 16);
        if (st.tint) {
          try {
            const im = c.getImageData(st.tx, st.ty, 16, 16), dd = im.data;
            const R = parseInt(st.tint.slice(1, 3), 16) / 255, G = parseInt(st.tint.slice(3, 5), 16) / 255, B = parseInt(st.tint.slice(5, 7), 16) / 255;
            for (let i = 0; i < dd.length; i += 4) { dd[i] *= R; dd[i + 1] *= G; dd[i + 2] *= B; }
            c.putImageData(im, st.tx, st.ty);
          } catch (e) {}
        }
      }
      atlasTex.needsUpdate = true;
    }
    // 내장 절차 애니메이션(리소스팩 파일이 없는 유체만)
    for (const [nm, tx, ty] of _fluidAnim.tiles) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const w = ((x + ph) & 15);
        let col;
        if (nm === 'water') {
          const band = (y * 2 + w + ((x * 7 + y * 13) % 3)) & 7;
          col = band < 3 ? '#3463cf' : band < 5 ? '#3a6ee0' : band < 7 ? '#2f5ac0' : '#4a7ce8';
        } else {
          const band = (y + ((w * 3) >> 1) + ((x * 5 + y * 11) % 4)) & 7;
          col = band < 3 ? '#d2541f' : band < 5 ? '#e8632a' : band < 7 ? '#b8431a' : '#f7a02a';
        }
        px(c, tx + x, ty + y, col);
      }
    }
    if (_fluidAnim.tiles.length) atlasTex.needsUpdate = true;
  }
  // V22-I1: 블럭 파괴 금 가기 오버레이 — MC destroy_stage 0~9와 동일 개념.
  //   resourcepack/destroy_stage_N.png가 있으면 그대로 사용, 없으면 자체 디자인 크랙 프레임.
  let crackMesh = null, crackMats = null, crackStage = -1;
  function buildCrackAssets() {
    if (crackMats) return;
    crackMats = [];
    for (let s = 0; s < 10; s++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16;
      const c2 = cv.getContext('2d');
      if (c2) {   // 자체 디자인: 단계가 오를수록 갈라짐(선 수·길이) 증가
        c2.clearRect(0, 0, 16, 16);
        c2.strokeStyle = 'rgba(18,18,18,0.88)'; c2.lineWidth = 1;
        const rng = rngFrom(4321 + s * 97);
        for (let i = 0; i < 2 + s; i++) {
          let x = 5 + rng() * 6, y = 5 + rng() * 6;
          c2.beginPath(); c2.moveTo(x, y);
          for (let j = 0; j < 2 + ((s / 2) | 0); j++) {
            x += (rng() - 0.5) * (5 + s); y += (rng() - 0.5) * (5 + s);
            c2.lineTo(Math.max(0.5, Math.min(15.5, x)), Math.max(0.5, Math.min(15.5, y)));
          }
          c2.stroke();
        }
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      const img = new Image();
      img.onload = () => { const c3 = cv.getContext('2d'); if (!c3) return; c3.clearRect(0, 0, 16, 16); c3.drawImage(img, 0, 0, img.width, Math.min(img.height, img.width), 0, 0, 16, 16); tex.needsUpdate = true; };
      img.src = 'resourcepack/destroy_stage_' + s + '.png';
      crackMats.push(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    }
  }
  function tickCrackOverlay() {
    if (!scene) return;
    if (!breaking || !breaking.need) { if (crackMesh) crackMesh.visible = false; crackStage = -1; return; }
    buildCrackAssets();
    if (!crackMesh) { crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMats[0]); scene.add(crackMesh); }
    const s = Math.max(0, Math.min(9, Math.floor(breaking.t / breaking.need * 10)));
    if (s !== crackStage) { crackStage = s; crackMesh.material = crackMats[s]; }
    crackMesh.position.set(breaking.x + 0.5, breaking.y + 0.5, breaking.z + 0.5);
    crackMesh.visible = true;
  }
  function tickAdaptiveView(dt) {
    if (dt > 0) _fpsAvg = _fpsAvg * 0.95 + (1 / dt) * 0.05;
    _adaptT += dt; if (_adaptT < 2.5) return; _adaptT = 0;
    if (_fpsAvg < 26 && VIEW_DIST > 48) { VIEW_DIST -= 16; CULL_DIST = VIEW_DIST + 40; }        // 버벅임 → 시야 축소
    else if (_fpsAvg > 52 && VIEW_DIST < 96) { VIEW_DIST += 16; CULL_DIST = VIEW_DIST + 44; }   // 여유 → 점진 복원
  }
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
        if (!b.opaque && !liq && nid === id) continue;   // V24-B: 동종 투명 블럭(유리/잎) 내부 면 컬링(바닐라)
        if (liq && f.n === 'bottom' && ny < 0) continue;
        const tn = faceTexName(b, f.n); const u = atlasUV[tn] || atlasUV.stone;
        const T = b.lava ? Lv : liq ? Wt : (!b.opaque ? Pl : B);   // V24: 유리 등 비불투명 큐브는 알파컷 재질(진짜 투명)
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
  // V122: 실제 마인크래프트 주민(Villager) 모델 — 큰 코/눈썹 능선/긴 갈색 로브/배 앞에 모은 팔/직업 배지
  //   NPC는 스티브형이 아니라 바닐라 주민 형태(직업색 배지 세로줄로 상점/은행/농부 등 구분)
  function buildVillager(look, opts) {
    const L = toLook(look);
    const g = new THREE.Group();
    const specs = []; const add = (w, h, d, col, x, y, z) => specs.push({ w, h, d, col, x, y, z });
    const skin = 0xbe9c7e;                         // 주민 살색(평원 계열)
    const noseC = shade(skin, 0.9);
    const robe = 0x8a6a3e, robeD = shade(robe, 0.82), robeL = shade(robe, 1.08);   // 갈색 로브
    const badge = (L.apron != null ? L.apron : (L.shirt != null ? L.shirt : 0x6b4f2a));   // 직업 배지색(NPC_LOOK 앞치마/셔츠)
    // 발(로브 밑으로 살짝)
    add(0.17, 0.12, 0.24, 0x2a2018, -0.11, 0.06, 0.02);
    add(0.17, 0.12, 0.24, 0x2a2018, 0.11, 0.06, 0.02);
    // 로브: 아래 넓은 단 + 상체
    const sY = 0.12;
    add(0.64, 0.6, 0.44, robe, 0, sY + 0.3, 0);
    add(0.52, 0.5, 0.32, robeD, 0, sY + 0.6 + 0.25, 0);
    add(0.66, 0.08, 0.46, robeL, 0, sY + 0.6, 0);         // 허리 띠
    // 직업 배지(가슴 세로줄) — 실제 주민 직업 표식
    add(0.16, 0.46, 0.02, badge, 0, sY + 0.6 + 0.25, 0.165);
    // 배 앞에 모은 팔 + 손
    const armY = sY + 0.6 + 0.18;
    add(0.52, 0.17, 0.2, robeD, 0, armY, 0.19);
    add(0.13, 0.17, 0.13, skin, -0.15, armY, 0.28);
    add(0.13, 0.17, 0.13, skin, 0.15, armY, 0.28);
    // 머리
    const hy = sY + 0.6 + 0.5 + 0.29;
    add(0.56, 0.56, 0.56, skin, 0, hy, 0);
    // 유니브로 능선
    add(0.5, 0.09, 0.06, shade(skin, 0.62), 0, hy + 0.12, 0.28);
    // 눈(흰자+동공)
    add(0.11, 0.13, 0.02, 0xf4f4f4, -0.13, hy + 0.0, 0.285);
    add(0.11, 0.13, 0.02, 0xf4f4f4, 0.13, hy + 0.0, 0.285);
    add(0.05, 0.09, 0.03, 0x3a2a6a, -0.14, hy - 0.01, 0.295);
    add(0.05, 0.09, 0.03, 0x3a2a6a, 0.14, hy - 0.01, 0.295);
    // 큰 코(앞으로 크게 돌출) — 주민 상징
    add(0.15, 0.36, 0.24, noseC, 0, hy - 0.05, 0.33);
    if (opts && opts.merged) { g.add(mergeBoxes(specs)); return { group: g, legL: null, legR: null }; }
    specs.forEach(s => g.add(mkBox(s.w, s.h, s.d, s.col, s.x, s.y, s.z)));
    return { group: g, legL: null, legR: null };
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
  function makeLabel(text, color) {
    // V126: 실제 MC 네임태그 — 텍스트 폭에 밀착한 반투명 배경(전체 박스 폐기), 픽셀 폰트 + 그림자. V133: 색 지정(NPC 노랑 등)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const c = cv.getContext('2d');
    const s = String(text || '');
    c.font = '26px "Minecraft", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.min(248, c.measureText(s).width);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(128 - w / 2 - 6, 24, w + 12, 26);
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(s, 129.5, 38.5);
    c.fillStyle = color || '#fff'; c.fillText(s, 128, 37);
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
  // V27-A: NPC 발밑 지면 — 잎/통나무(나무)는 지면으로 치지 않아 캐노피 위에 서던 버그 수정
  function npcGroundY(x, z) {
    for (let y = H - 1; y >= 1; y--) {
      const b = BLOCKS[getBlockLocal(x, y, z)];
      if (!b || !b.solid) continue;
      if (b.key && (b.key.indexOf('leaves') >= 0 || b.key.indexOf('log') >= 0)) continue;
      return y + 1;
    }
    return surfaceTop(x, z);
  }
  // V32: 실제 MC painting 텍스처 벽걸이(수작업 좌표 — 마을 건물 내벽)
  const HUB_PAINTINGS = [
    { src: 'painting/aztec.png', x: 205, y: 22.3, z: 240.97, ry: Math.PI, w: 2, h: 2 },        // 상점 안쪽 벽
    { src: 'painting/courbet.png', x: 194.5, y: 22.2, z: 212.0, ry: Math.PI, w: 2, h: 1 },     // 미니언 관리소
    { src: 'painting/sunset.png', x: 248.5, y: 22.2, z: 234.06, ry: Math.PI, w: 2, h: 1 },      // 펫 상점(내부 뒷벽 — V57 개방 정면화로 이동)
    { src: 'painting/skull_and_roses.png', x: 212, y: 22.4, z: 249.0, ry: Math.PI, w: 2, h: 2 },// 제작소
    { src: 'painting/wanderer.png', x: 234, y: 22.6, z: 249.0, ry: Math.PI, w: 1, h: 2 },      // 스타포스 강화소
    { src: 'painting/sea.png', x: 223.5, y: 23.0, z: 194.0, ry: Math.PI, w: 2, h: 1 },         // 인챈트 탑 1층
    { src: 'painting/creebet.png', x: 205, y: 22.3, z: 235.03, ry: 0, w: 2, h: 1 },            // 상점 맞은편 벽
    { src: 'painting/bouquet.png', x: 191.03, y: 22.3, z: 209.5, ry: Math.PI / 2, w: 2, h: 2 },// 관리소 서벽
  ];
  function buildPaintingMeshes(group) {
    if (worldMode !== 'hub') return;
    for (const pt of HUB_PAINTINGS) {
      const tex = _celTex(pt.src);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pt.w, pt.h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      m.position.set(pt.x, pt.y, pt.z); m.rotation.y = pt.ry;
      group.add(m);
    }
  }
  // V91: 업로드된 주민 직업 스킨(entity/*.png)을 NPC 얼굴에 적용
  const NPC_SKIN = {
    shopkeeper: 'villager', bankTeller: 'villager', minionManager: 'toolsmith', petKeeper: 'shepherd',
    enchanter: 'librarian', auctioneer: 'cartographer', gladiator: 'weaponsmith', reforgeSmith: 'toolsmith',
    guide: 'villager', craftsman: 'toolsmith', builder: 'mason', starSmith: 'weaponsmith',
    mineForeman: 'toolsmith', farmForeman: 'farmer', lumberjack: 'fletcher', fisherman: 'fisherman',
    slayerMaster: 'butcher', dungeonGatekeeper: 'armorer',
  };
  function npcFacePlane(key) {
    const sk = NPC_SKIN[key]; if (!sk) return null;
    return faceSkinPlane({ src: 'entity/' + sk + '.png', c: [8, 8, 8, 8], p: [0, 1.62, 0.26], s: [0.48, 0.48] });
  }
  function buildNpcMeshes() {
    npcGroup = new THREE.Group(); scene.add(npcGroup);
    buildPaintingMeshes(npcGroup);   // V32: painting 벽걸이(허브)
    // 서비스 NPC(상점/은행/…) — 현재 월드 소속만
    NPCS.forEach(n => {
      if ((n.world || 'hub') !== worldMode) return;
      const h = buildVillager(npcLook(n.key, n.color), { merged: true });   // V122: 실제 주민 모델
      n._y = npcGroundY(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      h.group.rotation.y = hash3(n.x, 5, n.z) * Math.PI * 2;
      const label = makeLabel(n.name, '#ffe98a'); label.position.set(0, 2.2, 0); h.group.add(label);   // V133: 실제 스블 NPC 이름 노랑
      npcGroup.add(h.group);
    });
    // V13-B: 위치기반 퀘스트 NPC(느낌표 표식) — 현재 월드 소속만
    questNpcList().forEach(n => {
      if ((n.world || 'hub') !== worldMode) return;
      const h = buildVillager(npcLook(n.key, n.color), { merged: true });   // V122: 실제 주민 모델
      n._y = npcGroundY(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      h.group.rotation.y = hash3(n.x, 9, n.z) * Math.PI * 2;
      const label = makeLabel('❗ ' + n.name); label.position.set(0, 2.35, 0); h.group.add(label);
      // 머리 위 노란 느낌표 발광 마커
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
      mark.position.set(0, 2.85, 0); mark.userData.qbob = 1; h.group.add(mark);
      npcGroup.add(h.group);
    });
    // Private island starts empty except natural starter terrain.
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
  function blockLocalBoxes(b, x, y, z, forRay) {
    if (!b) return [];
    const boxes = [];
    const add = (x0, y0, z0, x1, y1, z1) => boxes.push({ x0: x + x0, y0: y + y0, z0: z + z0, x1: x + x1, y1: y + y1, z1: z + z1 });
    if (b.cross) {
      if (forRay) {
        add(0.45, 0, 0, 0.55, 0.9, 1);
        add(0, 0, 0.45, 1, 0.9, 0.55);
      }
      return boxes;
    }
    if (b.shape === 'slab') { add(0, 0, 0, 1, 0.5, 1); return boxes; }
    if (b.shape === 'stairs') {
      add(0, 0, 0, 1, 0.5, 1);
      const f = b.facing || 0;
      if (f === 0) add(0, 0.5, 0, 1, 1, 0.5);
      else if (f === 1) add(0.5, 0.5, 0, 1, 1, 1);
      else if (f === 2) add(0, 0.5, 0.5, 1, 1, 1);
      else add(0, 0.5, 0, 0.5, 1, 1);
      return boxes;
    }
    if (b.shape === 'fence') {
      add(0.375, 0, 0.375, 0.625, 1, 0.625);
      const conn = (dx, dz) => { const nb = BLOCKS[getBlockLocal(x + dx, y, z + dz)]; return !!(nb && (nb.opaque || nb.shape === 'fence')); };
      if (conn(1, 0)) { add(0.625, 0.3, 0.44, 1, 0.5, 0.56); add(0.625, 0.66, 0.44, 1, 0.86, 0.56); }
      if (conn(-1, 0)) { add(0, 0.3, 0.44, 0.375, 0.5, 0.56); add(0, 0.66, 0.44, 0.375, 0.86, 0.56); }
      if (conn(0, 1)) { add(0.44, 0.3, 0.625, 0.56, 0.5, 1); add(0.44, 0.66, 0.625, 0.56, 0.86, 1); }
      if (conn(0, -1)) { add(0.44, 0.3, 0, 0.56, 0.5, 0.375); add(0.44, 0.66, 0, 0.56, 0.86, 0.375); }
      return boxes;
    }
    if (b.shape === 'trapdoor') { add(0, 0, 0, 1, 0.1875, 1); return boxes; }
    if (b.shape === 'door') {
      const f = b.open ? (b.facing + 1) % 4 : b.facing;
      const D = [[0, 0, 0, 1, 1, 0.1875], [0.8125, 0, 0, 1, 1, 1], [0, 0, 0.8125, 1, 1, 1], [0, 0, 0, 0.1875, 1, 1]][f];
      add(D[0], D[1], D[2], D[3], D[4], D[5]);
      return boxes;
    }
    if (b.shape === 'chest') { add(0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375); return boxes; }
    if (b.shape === 'ladder') {   // V21-E2: 보이는 얇은 판과 정확히 일치하는 히트박스
      const L = [[0, 0, 0, 1, 1, 0.0625], [0.9375, 0, 0, 1, 1, 1], [0, 0, 0.9375, 1, 1, 1], [0, 0, 0, 0.0625, 1, 1]][b.facing || 0];
      add(L[0], L[1], L[2], L[3], L[4], L[5]);
      return boxes;
    }
    if (b.shape === 'bed') { add(0, 0, 0, 1, 0.5625, 1); return boxes; }
    add(0, 0, 0, 1, b.collTop != null ? b.collTop : 1, 1);
    return boxes;
  }
  // V12 Sneak: 슬금 중 지상에서 발밑 지면이 사라지는 이동이면 그 축을 취소(가장자리 낙하 방지, MC식)
  function wouldFallOffEdge() {
    const fy = Math.floor(P.y - 0.05);   // 발밑 한 칸
    for (let x = Math.floor(P.x - P.w / 2); x <= Math.floor(P.x + P.w / 2); x++)
      for (let z = Math.floor(P.z - P.w / 2); z <= Math.floor(P.z + P.w / 2); z++)
        if (solidAt(x, fy, z)) return false;   // 발밑 어딘가 지면 있으면 안전
    return true;
  }
  // V116: 플레이어 AABB가 임의 위치에서 고체 블럭과 겹치는지 검사(자동 스텝업 헤드룸 확인용)
  function playerCollidesAt(px, py, pz) {
    const minX = px - P.w / 2, maxX = px + P.w / 2, minZ = pz - P.w / 2, maxZ = pz + P.w / 2, minY = py, maxY = py + P.h;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      const bb = BLOCKS[getBlockLocal(x, y, z)]; if (!bb || !bb.solid) continue;
      for (const box of blockLocalBoxes(bb, x, y, z, false)) {
        if (minX >= box.x1 || maxX <= box.x0 || minY >= box.y1 || maxY <= box.y0 || minZ >= box.z1 || maxZ <= box.z0) continue;
        return true;
      }
    }
    return false;
  }
  function moveAxis(ax, amt) {
    if (amt === 0) return;
    const before = P[ax];
    P[ax] += amt;
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    let firstHit = null, maxTop = -Infinity;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      const bb = BLOCKS[getBlockLocal(x, y, z)]; if (!bb || !bb.solid) continue;
      const boxes = blockLocalBoxes(bb, x, y, z, false);
      for (const box of boxes) {
        if (minX >= box.x1 || maxX <= box.x0 || minY >= box.y1 || maxY <= box.y0 || minZ >= box.z1 || maxZ <= box.z0) continue;
        if (ax === 'y') { if (amt > 0) { P.y = box.y0 - P.h - 0.0001; P.vy = 0; } else { P.y = box.y1 + 0.0001; P.vy = 0; P.onGround = true; } return; }
        if (!firstHit) firstHit = box; if (box.y1 > maxTop) maxTop = box.y1;   // V116: 수평 충돌 전부 스캔(스텝업 대상 결정)
      }
    }
    if (firstHit) {   // ax === 'x' || 'z'
      // V116: 자동 스텝업(MC 0.6블럭) — 반블럭·계단 등 낮은 장애물은 자동 등반(머리 위 여유가 있을 때만)
      if (P.onGround && maxTop > P.y && (maxTop - P.y) <= 0.6 + 1e-4 && !playerCollidesAt(P.x, maxTop + 0.0001, P.z)) {
        P.y = maxTop + 0.0001; return;   // 올라섰으므로 수평 이동 유지
      }
      if (ax === 'x') { if (amt > 0) P.x = firstHit.x0 - P.w / 2 - 0.0001; else P.x = firstHit.x1 + P.w / 2 + 0.0001; P.vx = 0; P._hColl = true; }
      else { if (amt > 0) P.z = firstHit.z0 - P.w / 2 - 0.0001; else P.z = firstHit.z1 + P.w / 2 + 0.0001; P.vz = 0; P._hColl = true; }
      return;
    }
    if ((ax === 'x' || ax === 'z') && P._sneaking && P.onGround && wouldFallOffEdge()) { P[ax] = before; P['v' + ax] = 0; }
  }
  function respawnAtHub(msg) {
    if (worldMode === 'home' || worldMode === 'visit') {   // V13-A: 스폰섬
      let sy = surfaceTop(96, 104);
      if (sy <= 2) {   // V27-A: 스폰 기둥을 다 캐낸 경우 — 무한 낙사 루프 방지
        let fx = null, fz = null;
        for (let r = 1; r <= 20 && fx == null; r++) for (let a = 0; a < 16 && fx == null; a++) {
          const cx = 96 + Math.round(Math.cos(a / 16 * Math.PI * 2) * r), cz = 104 + Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
          if (surfaceTop(cx, cz) > 2) { fx = cx; fz = cz; }
        }
        if (fx != null) { P.x = fx + 0.5; P.z = fz + 0.5; P.y = surfaceTop(fx, fz) + 0.02; }
        else {   // 밟을 곳이 하나도 없음 — 하이픽셀식 '구조 발판'(3×3 조약돌, 홈 영속)
          const api0 = econApi();
          for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
            world[widx(96 + ox, 18, 104 + oz)] = ID.cobblestone;
            if (worldMode === 'home' && api0.setHomeEdit) api0.setHomeEdit(96 + ox, 18, 104 + oz, ID.cobblestone);
            markBlockDirty(96 + ox, 104 + oz);
          }
          P.x = 96.5; P.z = 104.5; P.y = 19.02;
          if (typeof toast === 'function') toast('🪨 구조 발판이 생성되었어요', true);
        }
      } else { P.x = 96.5; P.z = 104.5; P.y = sy + 0.02; }
    }
    else if (_mapWorldActive) { const cx = W >> 1, cz = Dp >> 1; P.x = cx + 0.5; P.z = cz + 0.5; P.y = mapCenterTop(cx, cz) + 0.02; }   // V94: 실제 섬 맵은 def.spawn(절차 좌표)이 지형 밖 → 맵 중앙 지표로 리스폰(공허 사망 루프 방지) + V97(A8): 네더 지붕 회피
    else if (worldMode !== 'hub') { const sp = (WORLD_DEFS[worldMode] || {}).spawn || [W >> 1, Dp >> 1]; P.x = sp[0] + 0.5; P.z = sp[1] + 0.5; P.y = surfaceTop(sp[0], sp[1]) + 0.02; }
    else { P.x = spawnX; P.y = spawnY; P.z = spawnZ; }
    P.vx = P.vy = P.vz = 0;
    P._fallPeak = null; P._air = 0; P._lavaT = 0;   // V22-K: 텔레포트 후 낙하/익사 계산 초기화
    if (msg && typeof toast === 'function') toast(msg, false);
  }
  function collide(dt) {
    let mf = 0, ms = 0;
    if (keys.KeyW) mf += 1; if (keys.KeyS) mf -= 1; if (keys.KeyA) ms -= 1; if (keys.KeyD) ms += 1;
    // V22-H1: 조이스틱(가상 이동 드래그) 제거
    const inWater = feetInWater();
    const inLava = !inWater && feetInLava();   // V26-B: 용암 수영(느린 침강/승강, MC)
    if (mf <= 0) P._sprintLatch = false;                    // 전진을 멈추면 스프린트 해제
    const sprint = (P._sprintLatch || ((keys.ControlLeft || keys.ControlRight) && _kbLocked)) && mf > 0 && !inWater;   // V26: 더블탭 W + (전체화면 키보드 잠금 시) Ctrl 달리기
    P._sneaking = !!(keys.ShiftLeft || keys.ShiftRight) && P.onGround && !inWater;   // V12 Sneak 상태
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let speed = P._sneaking ? 1.295 : (sprint ? 5.612 : 4.317);   // V26: 실제 MC 실측치(걷기 4.317/달리기 5.612/슬금 1.295 m/s)
    if (inWater) speed *= (P._boat ? 1.8 : 0.55);   // V21-E2: 보트는 물에서 빠르게 활주
    else if (inLava) speed *= 0.25;   // V26-B: 용암은 훨씬 느림(MC)
    // 슈가 러시 인챈트 이동속도 보너스
    if (window.econApi && window.econApi.moveSpeedPct) speed *= 1 + window.econApi.moveSpeedPct() / 100;
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - sin * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P._sprinting = sprint;   // V24-B: 스프린트 FOV용
    // V26: 관성 — 목표 속도로 지수 수렴(지상 가속 빠름/공중 제어 약함, MC 감각). 즉시 세팅의 '미끄럽지 않은' 이질감 제거
    const tvx = dx * speed, tvz = dz * speed;
    const accel = inWater ? 5 : P.onGround ? 11 : 2.6;
    P.vx += (tvx - P.vx) * Math.min(1, dt * accel);
    P.vz += (tvz - P.vz) * Math.min(1, dt * accel);
    // V27-A: 넉백 = 1회성 속도 임펄스(MC) — 기존 '매 프레임 재적용'은 수십 블럭을 날려보내는 버그였다
    if (P._kbx || P._kbz) { P.vx += P._kbx; P.vz += P._kbz; P._kbx = P._kbz = 0; }
    // V23-A: 점프 — Space를 꾹 누르고 있으면 착지할 때마다 자동 재점프(실제 MC 동작)
    const wantJump = !!keys.Space;
    P._prevJump = wantJump;
    if (inWater) {
      if (P._boat) {   // V21-E2: 보트 — 수면에 떠서 활주(가라앉지 않음), 슬금=하선
        let topW = Math.floor(P.y);
        for (let yy = Math.floor(P.y); yy < H - 1; yy++) { if (getBlockLocal(Math.floor(P.x), yy, Math.floor(P.z)) === ID.water) topW = yy; else break; }
        P.vy = 0; P.y += ((topW + 0.95) - P.y) * Math.min(1, dt * 10);
        if (keys.ShiftLeft || keys.ShiftRight) { P._boat = false; removeBoatMesh(); if (typeof toast === 'function') toast('🛶 하선했어요', true); }
      } else {
      P.vy -= 9 * dt; if (wantJump) P.vy += 26 * dt; if (P.vy < -4) P.vy = -4; if (P.vy > 5) P.vy = 5; P._djUsed = false;
      // V27-A: 물 표면 '블럭 밟기' 착취 제거 — 탈출 점프(8.5)는 벽에 밀착했을 때만(MC 동일).
      //   열린 수면에선 상승 속도를 제한해 수면을 지면처럼 밟고 달릴 수 없다.
      const headWater = getBlockLocal(Math.floor(P.x), Math.floor(P.y + 1.1), Math.floor(P.z)) === ID.water;
      if (wantJump && !headWater) { if (P._hColl) P.vy = 8.5; else if (P.vy > 2.2) P.vy = 2.2; }
      }
    }
    else if (inLava) {   // V26-B: 용암 유체 물리 — 천천히 가라앉고 점프키로 허우적 상승
      P.vy -= 6 * dt; if (wantJump) P.vy += 18 * dt;
      if (P.vy < -1.6) P.vy = -1.6; if (P.vy > 1.6) P.vy = 1.6;
      P._djUsed = false;
    }
    else {
      P.vy -= 32 * dt; if (P.vy < -78) P.vy = -78;
      if (wantJump && P.onGround) { P.vy = 8.5; P.onGround = false; }
    }
    // V21-E2: 사다리 오르기(MC 표준) — 몸이 사다리 칸과 겹치면: 전진/점프=상승, 슬금=정지, 그 외 느린 하강
    let onLadderNow = false;
    {
      const bx = Math.floor(P.x), bz = Math.floor(P.z);
      for (const yy of [Math.floor(P.y + 0.1), Math.floor(P.y + 1)]) {
        const lb = BLOCKS[getBlockLocal(bx, yy, bz)];
        if (lb && lb.climb) { onLadderNow = true; break; }
      }
      if (onLadderNow && !inWater) {
        if (mf > 0 || wantJump) P.vy = 3.4;
        else if (keys.ShiftLeft || keys.ShiftRight) P.vy = 0;
        else if (P.vy < -2.4) P.vy = -2.4;
        // V24-D(감사 #21): 꼭대기 립 자동 넘기 — 머리 위에 사다리가 없고 전진 중이면 올라설 부스트
        const headLb = BLOCKS[getBlockLocal(bx, Math.floor(P.y + 1.6), bz)];
        if (mf > 0 && !(headLb && headLb.climb)) P.vy = Math.max(P.vy, 4.4);
      }
    }
    P._hColl = false;
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    if (P.onGround) P._djUsed = false;
    // V22-K: 낙하 데미지(MC 표준: 3블럭 초과 낙하 시 블럭당 최대체력 5%) — 물/사다리/보트는 무효
    if (inWater || onLadderNow || P._boat) P._fallPeak = null;
    else if (!P.onGround) P._fallPeak = P._fallPeak == null ? P.y : Math.max(P._fallPeak, P.y);
    else if (P._fallPeak != null) {
      const fd = P._fallPeak - P.y; P._fallPeak = null;
      if (fd > 3) { damagePlayer((fd - 3) * 5); if (typeof toast === 'function') toast('💥 낙하 데미지!', false); }   // V24-B: 고정 데미지(블럭당 5) — MC 실측(낙하거리 3블럭 초과부터)
    }
    // V22-K: 익사(머리가 물속 15초 후 초당 최대체력 10%)
    const headInWater = getBlockLocal(Math.floor(P.x), Math.floor(P.y + 1.5), Math.floor(P.z)) === ID.water;
    if (headInWater && !P._boat) {
      P._air = (P._air || 0) + dt;
      if (P._air > 15) { P._drownT = (P._drownT || 0) + dt; if (P._drownT >= 1) { P._drownT = 0; damagePlayer(10); if (typeof toast === 'function') toast('🫧 숨이 막혀요! 물 밖으로!', false); } }
    } else { P._air = 0; P._drownT = 0; }
    // V22-K: 용암 = 진짜 데미지(0.5초당 최대체력 15%) — 기존 '무료 순간이동' 폐기
    if (feetInLava()) {
      P._lavaT = (P._lavaT || 0) + dt;
      if (P._lavaT >= 0.5) { P._lavaT = 0; damagePlayer(15); if (typeof toast === 'function') toast('🔥 용암이다!!', false); }
    } else P._lavaT = 0;
    if (P.y < 1) { P._fallPeak = null; respawnAtHub(worldMode === 'hub' ? '마을로 귀환했어요' : '공허에 떨어졌다! 섬으로 귀환'); }
  }
  function resetPlayerToSpawn() {
    if (HUB_MAP) {
      const sx = Math.round(HUB_MC_SPAWN.x - HUB_MAP.ox), sz = Math.round(HUB_MC_SPAWN.z - HUB_MAP.oz);
      spawnX = sx + 0.5; spawnZ = sz + 0.5; spawnY = surfaceTop(sx, sz) + 0.02;
    } else { spawnX = 224.5; spawnZ = 232.5; spawnY = surfaceTop(224, 232) + 0.02; }
    P.x = spawnX; P.y = spawnY; P.z = spawnZ; P.vx = P.vy = P.vz = 0; P.yaw = 0; P.pitch = 0; P.onGround = false;
  }

  /* ---------------- 입력 ---------------- */
  function panelOpen() { const wrap = document.getElementById('econ3dPanelWrap'); return !!(wrap && wrap.style.display !== 'none'); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function requestLookLock(force) {
    if (isTouch || !canvas || !canvas.requestPointerLock || panelOpen() || document.pointerLockElement === canvas) return;
    const now = performance.now();
    if (!force && now - (lookS.lastAsk || 0) < 900) return;
    lookS.lastAsk = now;
    try {
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { lookS.lastAsk = 0; });
    } catch (e) { lookS.lastAsk = 0; }
  }
  function applyMouseLook(dx, dy, sensitivity) {
    if (!dx && !dy) return;
    P.yaw -= dx * sensitivity;
    P.pitch -= dy * sensitivity;
    clampPitch();
  }
  function onPLC() {
    lookS.locked = (document.pointerLockElement === canvas);
    if (canvas) canvas.classList.toggle('is-pointerlocked', lookS.locked);
    // V21-A: 잠금 상태를 조준점에 표시 — 안 잠기면 클릭 유도(브라우저는 제스처 없인 잠금 불가)
    const cr = document.getElementById('econ3dCross');
    if (cr && !fishing && !breaking) cr.textContent = lookS.locked ? '+' : '🖱';
    if (!lookS.locked) clearInputState();
  }
  function clearInputState() {
    mouseHeld = false; useHeld = false; gathering = false; breaking = null;
    moveT.active = false; moveT.id = -1; lookT.id = -1;
    for (const k in keys) keys[k] = false;
  }
  // V26: 전체화면 + 키보드 잠금(Chromium Keyboard Lock) — 전체화면에서 Ctrl+W/W 예약어를 게임이 가로챔
  let _kbLocked = false;
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (navigator.keyboard && navigator.keyboard.lock) { await navigator.keyboard.lock(['ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']); _kbLocked = true; if (typeof toast === 'function') toast('⛶ 전체화면 — 이제 Ctrl+W 달리기도 안전해요 (Esc 길게 = 해제)', true); }
      } else { await document.exitFullscreen(); }
    } catch (e2) {}
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { _kbLocked = false; try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e2) {} } });
  function onKey(e) {
    if (e.ctrlKey && e.code === 'KeyW' && _kbLocked) e.preventDefault();   // V26: 잠금 중 탭 닫기 차단
    if (!panelOpen() && e.code !== 'Escape' && e.code !== 'KeyE') requestLookLock(false);
    // 더블탭 W = 스프린트(마인크래프트 방식 — Ctrl+W는 브라우저와 충돌하므로)
    if (e.code === 'KeyW' && !keys.KeyW) {
      const now = performance.now();
      if (now - (P._lastW || 0) < 280) P._sprintLatch = true;
      P._lastW = now;
    }
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape') hidePanel();
    if (panelOpen()) { if (e.code === 'KeyE') hidePanel(); return; }   // V22-K: 패널 열림 중엔 게임 단축키(핫바/지도) 무시 — E는 닫기 토글 유지
    if (e.code === 'KeyM') toggleMinimapSize();
    if (/^Digit[1-8]$/.test(e.code)) selectHotbarSlot(+e.code.slice(5) - 1);   // 숫자키 1~8 = 핫바 슬롯 선택
    if (e.code === 'Digit9') { openPanelForZone('hub', 'menu'); }   // V22-H2: 9 = 네더의 별 메뉴
    if (e.code === 'KeyE') {   // V13-A: E 토글(열림이면 닫기)
      if (panelOpen()) { hidePanel(); }
      else { const t = currentAim(); if (t) doInteract(t); else openPanelForZone('hub', 'inv'); }
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function performUseAction(repeat) {
    const t = currentAim();
    if (t) {
      if (!repeat) doInteract(t);   // NPC/포탈/워프/요정/미니언/플레이어 = 우클릭 상호작용
      return true;
    }
    // V21-A/D2: 블럭 우클릭 상호작용(전 월드) — 문/작업대/화로/상자/포탈/파크 게이트
    const tb = raycastBlock();
    if (tb) {
      const bb = BLOCKS[getBlockLocal(tb.x, tb.y, tb.z)];
      if (bb && bb.shape === 'door') { if (!repeat && worldMode !== 'visit') toggleDoor(tb.x, tb.y, tb.z); return true; }   // V22-K: 방문 중 남의 문 조작 금지
      if (!repeat && interactHomeBlock(tb)) return true;
    }
    // V29-B: 활을 들었으면 우클릭 = 발사(스블/MC)
    { const api2 = econApi(); if (api2.isBowKey && api2.isBowKey(activeHotbarKey())) { if (!repeat) shootArrow(); return true; } }
    // V21-E2: 보트 — 보트를 들고 물을 향해 우클릭 = 탑승(슬금 키로 하선)
    if (!repeat && !P._boat && activeHotbarKey() === 'boat') {
      const d = lookDir(); const wx = Math.floor(P.x + d.x * 2.2), wz = Math.floor(P.z + d.z * 2.2);
      let wy = -1;
      for (let yy = Math.min(H - 2, Math.floor(P.y + 2)); yy >= 2; yy--) { if (getBlockLocal(wx, yy, wz) === ID.water) { wy = yy; break; } }
      if (wy > 0) {
        P._boat = true; P.x = wx + 0.5; P.z = wz + 0.5; P.y = wy + 0.95; P.vy = 0;
        ensureBoatMesh();
        if (typeof toast === 'function') toast('🛶 보트 탑승! Shift(슬금)로 내려요', true);
        return true;
      }
    }
    if (worldMode === 'home') {
      // V22-K: 내 섬에서도 낚시 가능 — 낚싯대를 들고 물을 우클릭
      const ak = activeHotbarKey();
      if (!repeat && !fishing && ak && /rod/.test(ak) && startFishing()) return true;
      if (fishing) return true;
      return homePlaceBlock(!!repeat);
    }
    if (fishing) return true;
    if (worldMode === 'visit') { if (!repeat) openPanelForZone('hub', 'menu'); return true; }   // V22-K: 방문 = 구경만(남의 섬 낚시 금지)
    if (!repeat) { if (!startFishing()) openPanelForZone('hub', 'menu'); }   // 물 조준=낚시, 빈 우클릭=스카이블럭 메뉴
    return true;
  }
  // V29-B: 활 투사체 — 활을 들고 우클릭 발사. 중력 낙하/블럭 충돌/몹 명중 시 원거리 피해(든 활의 데미지)
  let arrows = [];
  function shootArrow() {
    const now = performance.now();
    if (P._bowCd && now - P._bowCd < 550) return;   // 재장전(MC 감각)
    P._bowCd = now;
    const d = lookDir();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.55), new THREE.MeshBasicMaterial({ color: 0xd8cfc0 }));
    m.position.set(P.x + d.x * 0.6, P.y + P.eye - 0.08 + d.y * 0.6, P.z + d.z * 0.6);
    scene.add(m);
    arrows.push({ m, vx: d.x * 42, vy: d.y * 42, vz: d.z * 42, t: 0 });
    if (arrows.length > 12) { scene.remove(arrows[0].m); arrows.shift(); }
  }
  function tickArrows(dt) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]; a.t += dt;
      a.vy -= 20 * dt;   // MC 화살 중력
      const p = a.m.position;
      p.x += a.vx * dt; p.y += a.vy * dt; p.z += a.vz * dt;
      a.m.lookAt(p.x + a.vx, p.y + a.vy, p.z + a.vz);
      let done = a.t > 4 || p.y < 1 || solidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (!done) for (const mb of mobs) {
        if (mb.dead || mb.ghost) continue;
        const mp = mb.mesh.position, sc = (mb.def && mb.def.scale) || 1;
        if (Math.abs(p.x - mp.x) < 0.75 * sc && Math.abs(p.z - mp.z) < 0.75 * sc && p.y > mp.y - 0.1 && p.y < mp.y + 2.1 * sc) {
          attackMobHit(mb); done = true; break;
        }
      }
      if (done) { scene.remove(a.m); arrows.splice(i, 1); }
    }
  }
  // V21-E2: 보트 메시(자체 디자인 — 선체 + 좌석)
  let boatMesh = null;
  function ensureBoatMesh() {
    if (boatMesh) { boatMesh.visible = true; return; }
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 2.0), new THREE.MeshBasicMaterial({ color: 0x8a5c2d }));
    hull.position.y = 0.18; g.add(hull);
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 2.0), new THREE.MeshBasicMaterial({ color: 0x6b4520 }));
    rimL.position.set(-0.6, 0.4, 0); g.add(rimL);
    const rimR = rimL.clone(); rimR.position.x = 0.6; g.add(rimR);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.14), new THREE.MeshBasicMaterial({ color: 0x6b4520 }));
    bow.position.set(0, 0.4, -0.95); g.add(bow);
    const stern = bow.clone(); stern.position.z = 0.95; g.add(stern);
    boatMesh = g; scene.add(g);
  }
  function removeBoatMesh() { if (boatMesh) boatMesh.visible = false; }
  function onDown(e) {
    if (panelOpen()) return;
    if (!isTouch) e.preventDefault();
    const p = relPos(e); const cw = canvas.clientWidth;
    if (!isTouch) {
      requestLookLock(true);
      if (!lookS.locked) return;   // V21-A: 첫 클릭은 시점 잠금만(잠금 전 오조작 방지, MC 표준)
      // ── V21-A 입력 재정리(MC 표준): 우클릭=상호작용/설치, 좌클릭=공격/파괴만 ──
      if (e.button === 2) {
        useHeld = true; useRepeatT = 0.28;   // V134: 클릭 1회=1개만(연타 초기 지연). 홀드 시 0.28s 후 연속 설치(실제 MC 쿨다운)
        triggerFpSwing();   // V153
        performUseAction(false);
        return;
      }
      if (e.button !== 0) return;
      if (fishing) { reelFishing(); return; }             // 낚시 중 좌클릭 = 낚아채기
      const mb = pickMob();
      if (mb) { if (!(P._atkCd > 0)) { P._atkCd = 0.45; attackMobHit(mb); } mouseHeld = true; return; }   // V22-K: 연타 쿨다운 적용(0.45s) — 광클 DPS 버그 수정
      const t = currentAim();
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; mouseHeld = true; return; }   // 채집 노드는 파괴형 동작이므로 좌클릭 유지
      mouseHeld = true;                                    // 좌클릭 = 파괴/채집만(상호작용은 우클릭·E)
      return;
    }
    // V22-H1: 조이스틱 제거 — 좌측 드래그 이동 폐지(모든 포인터는 시점/탭)
    if (lookT.id === -1) {
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
    if (!isTouch) {
      applyMouseLook(e.movementX || 0, e.movementY || 0, lookS.locked ? 0.0024 : 0.0018);
      return;
    }
    const p = relPos(e);
    if (e.pointerId === lookT.id && (mouseHeld || gathering || breaking)) lookT.moved = -1000000;
    else if (e.pointerId === lookT.id) { const dx = p.x - lookT.lx, dy = p.y - lookT.ly; P.yaw -= dx * 0.005; P.pitch -= dy * 0.005; clampPitch(); lookT.lx = p.x; lookT.ly = p.y; lookT.moved = (lookT.moved || 0) + Math.abs(dx) + Math.abs(dy); if (lookT.moved > 10) { gathering = false; breaking = null; } }   // V12-D: 화면 회전 시작하면 채집/파괴 중단
  }
  function onUp(e) {
    if (e.button === 0) { mouseHeld = false; breaking = null; const cr = document.getElementById('econ3dCross'); if (cr && !fishing) cr.textContent = '+'; }
    if (e.button === 2) useHeld = false;
    if (!isTouch) { if (e.button === 0) gathering = false; return; }
    else if (e.pointerId === lookT.id) {
      gathering = false;
      // V12-D: 깨끗한 탭(회전 거의 없이 300ms 미만)만 행동으로 인정 — 회전 드래그는 무시.
      const cleanTap = !lookT.acted && !lookT.broke && (lookT.moved || 0) < 10 && performance.now() - lookT.downT < 300;
      if (cleanTap) {
        const mb = pickMob();   // V22-K: 터치에서도 몹 공격 가능(깨끗한 탭 = 근접 공격)
        if (mb) { if (!(P._atkCd > 0)) { P._atkCd = 0.45; attackMobHit(mb); } }
        else {
          const t = currentAim();
          if (t && t.type !== 'node') doInteract(t);        // NPC/포탈/미니언 등 탭 상호작용
          else if (worldMode === 'home') homePlaceBlock();   // 내 섬 빈 탭 = 블록 설치
        }
      }
      lookT.id = -1;
    }
  }
  // V22-K: 마우스 휠 = 핫바 슬롯 순환(실제 MC와 동일). 아래로 굴리면 다음 슬롯.
  function onWheel(e) {
    if (panelOpen()) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    selectHotbarSlot(((selectedHotbar + dir) % 9 + 9) % 9);   // V134: 0~8 전 9칸 순환(9번=메뉴 별도 선택 가능, 실제 MC 동일)
  }
  function bindInput() {
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerup', onUp); canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', clearInputState);
    document.addEventListener('pointerlockchange', onPLC);
  }
  function unbindInput() {
    document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
    if (canvas) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('wheel', onWheel); }
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('blur', clearInputState);
    document.removeEventListener('pointerlockchange', onPLC);
  }

  /* ---------------- 복셀 DDA 레이캐스트(프라이빗 섬 블록 설치/파괴용) ---------------- */
  const REACH_EDIT = 5;
  function rayBoxHit(o, d, box, maxDist) {
    let tMin = 0, tMax = maxDist, face = [0, 0, 0];
    const axes = [['x', 'x0', 'x1'], ['y', 'y0', 'y1'], ['z', 'z0', 'z1']];
    for (const [a, lo, hi] of axes) {
      const ov = o[a], dv = d[a];
      if (Math.abs(dv) < 1e-9) {
        if (ov < box[lo] || ov > box[hi]) return null;
        continue;
      }
      let t1 = (box[lo] - ov) / dv, t2 = (box[hi] - ov) / dv;
      let f1 = a === 'x' ? [-Math.sign(dv) || -1, 0, 0] : a === 'y' ? [0, -Math.sign(dv) || -1, 0] : [0, 0, -Math.sign(dv) || -1];
      if (t1 > t2) {
        const t = t1; t1 = t2; t2 = t;
        f1 = a === 'x' ? [-Math.sign(dv) || 1, 0, 0] : a === 'y' ? [0, -Math.sign(dv) || 1, 0] : [0, 0, -Math.sign(dv) || 1];
      }
      if (t1 > tMin) { tMin = t1; face = f1; }
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
    if (tMax < 0 || tMin > maxDist) return null;
    return { t: Math.max(0, tMin), face };
  }
  function rayHitBlockBoxes(o, d, x, y, z, id) {
    const b = BLOCKS[id];
    if (!b || b.liquid) return null;
    const boxes = blockLocalBoxes(b, x, y, z, true);
    let best = null;
    for (const box of boxes) {
      const hit = rayBoxHit(o, d, box, REACH_EDIT);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    return best;
  }
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
      if (id !== 0) {
        const hit = rayHitBlockBoxes(o, d, x, y, z, id);
        if (hit) return { x, y, z, face: hit.face, id };
      }
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
    if (!p) return false;
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
    spawnBreakParticles(t.x, t.y, t.z, t.id); if (drop) spawnPickupFx(t.x, t.y, t.z, drop);   // V24-C
    collapseAbove(t.x, t.y, t.z, econApi());   // V26-B: 지지 붕괴
    scheduleFluidAround(t.x, t.y, t.z);   // V23-A: 빈 자리로 주변 물/용암 확산
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
        world[widx(x, cy, z)] = cid;
        if (worldMode === 'home' && api.setHomeEdit) api.setHomeEdit(x, cy, z, cid);   // V21-A: 홈만 영속(허브 등 공용 월드는 세션 한정)
        markBlockDirty(x, z);
      }
    }
    _mapDirty = true; return true;
  }
  // V12 블럭 경제: 핫바에서 고른 블럭 아이템을 소모해서 설치(보유 필요, 무한 아님).
  function interactHomeBlock(t) {
    if (!t) return false;
    const b = BLOCKS[getBlockLocal(t.x, t.y, t.z)];
    if (!b) return false;
    if (b.shape === 'door') return toggleDoor(t.x, t.y, t.z);
    // V21-E1: 작업대/화로/상자는 '내 프라이빗 섬'에서만 사용(허브·타인 섬·테마 섬 사용 금지, 실제 스블 규칙)
    if (b.key === 'crafting_table' || b.key === 'furnace' || b.key === 'chest') {
      if (worldMode !== 'home') { if (typeof toast === 'function') toast('🔒 내 프라이빗 섬에서만 사용할 수 있어요', false); return true; }
      if (b.key === 'crafting_table') { openPanelForZone('hub', 'craft'); return true; }
      if (b.key === 'furnace') { openPanelForZone('hub', 'craft'); if (typeof toast === 'function') toast('🔥 화로: 제작 탭의 [화로 제련]에서 제련하세요 (석탄 1 = 8회)', true); return true; }
      openChestAt(t.x, t.y, t.z); return true;   // V21-E1: 상자별 독립 보관함
    }
    if (b.shape === 'bed') {   // V21-E2: 침대 — 프라이빗 섬 전용, 수면=완전 회복+아침
      if (worldMode !== 'home') { if (typeof toast === 'function') toast('🔒 내 프라이빗 섬에서만 사용할 수 있어요', false); return true; }
      // V22-K3: 내 섬은 시간대가 '항상 정오' 고정이라 밤 게이트는 침대를 영구 봉인함 → 60초 쿨다운으로 무한 힐 악용만 방지
      if (performance.now() - (P._bedAt || 0) < 60000) { if (typeof toast === 'function') toast(`🛏️ 아직 졸리지 않아요 (${Math.ceil((60000 - (performance.now() - (P._bedAt || 0))) / 1000)}초 후 가능)`, false); return true; }
      P._bedAt = performance.now();
      if (php) php.hp = php.max;
      worldTime = DAY_LEN * 0.25;
      if (typeof toast === 'function') toast('🛏️ 푹 잤다! 체력이 모두 회복되고 아침이 밝았어요', true);
      updateHpHud();
      return true;
    }
    if (b.key && b.key.indexOf('portal_') === 0) { warpTo(b.key.slice(7), false); return true; }
    // V21-D2: 파크 진행 게이트(울타리/발광석 우클릭 = 개방 시도)
    if (worldMode === 'park' && (b.key === 'oak_fence' || b.key === 'glowstone')) {
      const gi = parkGateAt(t.x, t.z);
      if (gi >= 0) { tryOpenParkGate(gi); return true; }
    }
    return false;
  }
  // V21-E1: 상자 열기 — economy.js의 상자별 독립 보관함 + 패널 표시
  function openChestAt(x, y, z) {
    const api = econApi();
    if (api.openChest) { api.openChest(`${x},${y},${z}`); openPanelForZone('hub', 'chest'); }
    else openPanelForZone('hub', 'inv');
  }
  function homePlaceBlock(placeOnly) {
    if (worldMode !== 'home') return false;
    const aimBlockForInteract = raycastBlock();
    if (!placeOnly && interactHomeBlock(aimBlockForInteract)) return true;
    const key = selectedPlaceKey;
    const api = econApi();
    if (!isPlaceable(key)) return false;   // V13-A: 핫바에 블럭 없으면 조용히(토스트 스팸 제거)
    if (!api.hasItem || !api.hasItem(key, 1)) { updateHotbar(); return false; }
    const t = raycastBlock(); if (!t) return false;
    const nx = t.x + t.face[0], ny = t.y + t.face[1], nz = t.z + t.face[2];
    if (!inBounds(nx, ny, nz) || nx < HOME_BOUNDS.x0 || nx > HOME_BOUNDS.x1 || nz < HOME_BOUNDS.z0 || nz > HOME_BOUNDS.z1) return false;
    if (getBlockLocal(nx, ny, nz) !== 0) return false;
    // 플레이어 몸/주변 개체와 겹치면 설치 불가 (V22-K: 몹·NPC 겹침 검사 추가)
    const cellHitsBody = cy => {
      const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
      if (nx + 1 > minX && nx < maxX && nz + 1 > minZ && nz < maxZ && cy + 1 > minY && cy < maxY) return true;
      for (const m of mobs) {
        if (m.dead) continue; const mp = m.mesh.position;
        if (Math.abs(mp.x - (nx + 0.5)) < 0.9 && Math.abs(mp.z - (nz + 0.5)) < 0.9 && mp.y > cy - 1.6 && mp.y < cy + 1.2) return true;
      }
      return false;
    };
    if (cellHitsBody(ny)) return false;
    if (isDoorItem(key)) {   // V17-C: 문은 2칸(아래+위) 설치, 바라보는 방향으로
      if (!inBounds(nx, ny + 1, nz) || getBlockLocal(nx, ny + 1, nz) !== 0 || cellHitsBody(ny + 1)) return false;
      const d = lookDir(); let f; if (Math.abs(d.x) > Math.abs(d.z)) f = d.x > 0 ? 1 : 3; else f = d.z > 0 ? 2 : 0;
      const did = ID[key + '_c_' + f];
      if (!did) return false;   // V22-K: id 확정 후에만 아이템 소모
      if (!api.takeItem || !api.takeItem(key, 1)) return false;
      world[widx(nx, ny, nz)] = did; world[widx(nx, ny + 1, nz)] = did;
      if (api.setHomeEdit) { api.setHomeEdit(nx, ny, nz, did); api.setHomeEdit(nx, ny + 1, nz, did); }
      markBlockDirty(nx, nz); _mapDirty = true; updateBuildHud(); return true;
    }
    let id = PLACE_BLOCK[key];
    if (isStairsItem(key)) {   // V17: 계단은 바라보는 방향으로 높은 면 배치
      const d = lookDir(); let f;
      if (Math.abs(d.x) > Math.abs(d.z)) f = d.x > 0 ? 1 : 3; else f = d.z > 0 ? 2 : 0;
      id = ID[key + '_' + f];
    }
    if (key === 'ladder') {   // V21-E2: 클릭한 옆면 벽에 부착(윗면/밑면 클릭 시 시선 반대 벽)
      let f;
      if (t.face[1] === 0) f = t.face[2] === -1 ? 2 : t.face[2] === 1 ? 0 : (t.face[0] === -1 ? 1 : 3);
      else { const d = lookDir(); f = Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 3 : 1) : (d.z > 0 ? 0 : 2); }
      id = ID['ladder_' + f];
    }
    if (!id) return false;   // V22-K: 블럭 id 확정 후에만 아이템 소모(실패 시 아이템 증발 방지)
    if (!api.takeItem || !api.takeItem(key, 1)) return false;   // 소모
    world[widx(nx, ny, nz)] = id;
    if (api.setHomeEdit) api.setHomeEdit(nx, ny, nz, id);
    markBlockDirty(nx, nz); _mapDirty = true;
    flushWorldEdits();   // V137: 설치 즉시 같은 프레임 메시화(1프레임 공백=투명해 보임 방지)
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
    const ores = { coal_ore: ['coal', 1.7, 30], iron_ore: ['iron', 2.1, 35], gold_ore: ['gold', 2.3, 40], lapis_ore: ['lapis', 2.1, 35], redstone_ore: ['redstone', 2.1, 35], diamond_ore: ['diamond', 3.4, 55], emerald_ore: ['emerald', 3.4, 55],
      // V23-C: 딥슬레이트 광석(더 단단, 자원 동일) + 구리
      deepslate_coal_ore: ['coal', 2.6, 30], deepslate_iron_ore: ['iron', 3.1, 35], deepslate_gold_ore: ['gold', 3.4, 40], deepslate_lapis_ore: ['lapis', 3.1, 35],
      deepslate_redstone_ore: ['redstone', 3.1, 35], deepslate_diamond_ore: ['diamond', 4.6, 55], deepslate_emerald_ore: ['emerald', 4.6, 55],
      copper_ore: ['raw_copper', 2.0, 32], deepslate_copper_ore: ['raw_copper', 3.0, 32] };
    for (const k in ores) GB[ID[k]] = { res: ores[k][0], fam: 'pickaxe', hard: ores[k][1], to: ID.bedrock, regen: ores[k][2], back: ID[k] };
    GB[ID.deepslate] = { res: 'cobbled_deepslate', fam: 'pickaxe', hard: 2.0, to: ID.bedrock, regen: 25, back: ID.deepslate };   // V23-C: 딥슬레이트 채굴 → 조각난 딥슬레이트
    GB[ID.obsidian] = { res: 'obsidian', fam: 'pickaxe', hard: 4.2, to: ID.bedrock, regen: 70, back: ID.obsidian };
    GB[ID.oak_log] = { res: 'oaklog', fam: 'axe', hard: 0.9, to: 0, regen: 40, back: ID.oak_log };
    GB[ID.birch_log] = { res: 'birchlog', fam: 'axe', hard: 0.9, to: 0, regen: 40, back: ID.birch_log };
    GB[ID.spruce_log] = { res: 'sprucelog', fam: 'axe', hard: 1.0, to: 0, regen: 45, back: ID.spruce_log };
    GB[ID.dark_oak_log] = { res: 'dark_oak_log', fam: 'axe', hard: 1.0, to: 0, regen: 45, back: ID.dark_oak_log };
    GB[ID.jungle_log] = { res: 'jungle_log', fam: 'axe', hard: 1.0, to: 0, regen: 45, back: ID.jungle_log };
    GB[ID.acacia_log] = { res: 'acacia_log', fam: 'axe', hard: 1.0, to: 0, regen: 45, back: ID.acacia_log };
    GB[ID.oak_leaves] = { res: 'apple', chance: 0.05, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.oak_leaves };
    GB[ID.spruce_leaves] = { res: null, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.spruce_leaves };
    GB[ID.dark_oak_leaves] = { res: null, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.dark_oak_leaves };
    GB[ID.jungle_leaves] = { res: null, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.jungle_leaves };
    GB[ID.acacia_leaves] = { res: null, fam: 'axe', hard: 0.25, to: 0, regen: 55, back: ID.acacia_leaves };
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
  let useHeld = false, useRepeatT = 0;
  // V13-A: 블럭별 채굴 경도(홈 건축 블럭용) — MC식 상대 경도. 도구 배율로 나눠 시간 산출.
  // V21-D: 블럭별 채굴 경도 — 바닐라 경도값 비례(스케일 ~0.85). 도구 배율로 나눠 시간 산출.
  // V27-D: 진짜 바닐라 경도(minecraft.wiki 값 그대로) — 파괴시간 = 경도 × (수확가능 1.5 / 불가 5) ÷ 도구배속
  function homeBlockHardness(id) {
    const b = BLOCKS[id]; if (!b) return 0.6;
    const k = b.key;
    if (/bedrock/.test(k)) return 999;
    if (/flower|tall_grass|^sugar_cane|wheat|carrot|potato|nether_wart|torch|sapling|mushroom_red$|mushroom_brown$/.test(k)) return 0;   // 즉시 파괴
    if (/leaves/.test(k)) return 0.2;
    if (k === 'obsidian') return 50;
    if (k === 'ancient_debris') return 30;
    if (k === 'netherrack') return 0.4;
    if (k === 'end_stone') return 3;
    if (k === 'glowstone' || /glass/.test(k)) return 0.3;
    if (k === 'slime_block') return 0.1;   // V123: 슬라임 — 거의 즉시 파괴
    if (k === 'ice' || k === 'packed_ice') return 0.5;
    if (k === 'magma' || k === 'soul_sand') return 0.5;
    if (k === 'bed') return 0.2;
    if (/^ladder/.test(k)) return 0.4;
    if (k === 'pumpkin' || k === 'melon' || /mushroom_(red|brown)_block|mushroom_stem/.test(k)) return 1.0;
    if (/wool/.test(k)) return 0.8;
    if (/^snow/.test(k)) return 0.2;
    if (/^sand$|red_sand$|^dirt|farmland|^clay/.test(k)) return 0.5;
    if (/^grass$|gravel|mycelium|podzol/.test(k)) return 0.6;
    if (/hay/.test(k)) return 0.5;
    if (/iron_block|diamond_block|emerald_block|coal_block|redstone_block/.test(k)) return 5;
    if (/gold_block|lapis_block/.test(k)) return 3;
    if (/^deepslate_.*_ore$/.test(k)) return 4.5;
    if (/deepslate/.test(k)) return k === 'deepslate' ? 3 : 3.5;
    if (/copper_block|cut_copper|chiseled_copper|exposed_copper|weathered_copper|oxidized_copper|raw_copper_block/.test(k)) return 3;
    if (/_ore$/.test(k)) return 3;
    if (/sandstone|quartz/.test(k)) return 0.8;
    if (/cobble|brick|prismarine|purpur_pillar/.test(k)) return 2;
    if (/concrete/.test(k)) return 1.8;
    if (/terracotta/.test(k)) return 1.25;
    if (/smooth_stone/.test(k)) return 2;
    if (/^stone|purpur|andesite|diorite|granite/.test(k)) return 1.5;
    if (/door/.test(k)) return 3;
    if (/chest|crafting_table/.test(k)) return 2.5;
    if (/bookshelf/.test(k)) return 1.5;
    if (/log|planks|fence|trapdoor/.test(k)) return 2;
    if (k === 'furnace') return 3.5;
    return 0.7;
  }
  // V27-D: 블럭 → 올바른 도구 클래스(MC) — 이 클래스의 도구를 '손에 들어야' 배속이 적용된다
  function blockToolClass(k) {
    if (/leaves|hay|sponge|nether_wart_block/.test(k)) return 'hoe';
    if (/log|planks|fence|door|trapdoor|chest$|crafting_table|bookshelf|^ladder|bamboo|melon$|pumpkin|mushroom_(red|brown)_block|mushroom_stem|bed$/.test(k)) return 'axe';
    if (/stone|cobble|brick|_ore$|deepslate|granite|diorite|andesite|obsidian|netherrack|quartz|purpur|prismarine|concrete|terracotta|magma|glowstone|ice|copper|iron_block|gold_block|diamond_block|emerald_block|coal_block|lapis_block|furnace|ancient_debris|anvil/.test(k)) return 'pickaxe';
    if (/^sand$|red_sand$|^dirt|^grass$|gravel|mycelium|podzol|farmland|^clay|^snow|soul_sand/.test(k)) return 'shovel';
    return null;   // 유리/양털/침대 등 — 도구 무관 정상 속도
  }
  // V22-K1: 블럭별 요구 도구 티어(MC 표준) — 0=맨손 1=나무 2=돌 3=철 4=금 5=다이아 6=태초
  function requiredTierFor(bk) {
    if (/obsidian/.test(bk)) return 5;
    if (/diamond_ore|emerald_ore|gold_ore|redstone_ore|gold_block|diamond_block|emerald_block/.test(bk)) return 3;   // 레드스톤 블럭은 바닐라상 나무 곡괭이(아래 stone 매칭 → 1)
    if (/iron_ore|lapis_ore|iron_block|lapis_block|copper_ore|copper_block|cut_copper|chiseled_copper|exposed_copper|weathered_copper|oxidized_copper|raw_copper_block/.test(bk)) return 2;   // V23-C: 구리 = 돌 곡괭이(바닐라)
    if (/stone|cobble|brick|_ore$|sandstone|andesite|diorite|granite|quartz|purpur|prismarine|netherrack|end_stone|magma|furnace|concrete|terracotta|coal_block|deepslate/.test(bk)) return 1;
    return 0;
  }
  function progressBreaking(dt) {
    if (worldMode === 'visit') return;   // 방문은 구경만
    const hit = raycastBlock();
    // V22-K1: 조준 대상이 바뀌면 진행률 0%부터 재시작(실제 MC) — 기존 '원래 블럭 계속 캐기'가
    //   조준을 옮겨도 이전 블럭까지 부숴 "한 번에 두 개" 깨지던 문제의 원인이라 폐기.
    if (!hit) { breaking = null; return; }
    if (worldMode === 'home' && isPortalBlock(hit.x, hit.y, hit.z)) { breaking = null; return; }
    let g = worldMode === 'home' ? null : gatherBlocks()[hit.id];   // V21-C: 프라이빗 섬은 순수 바닐라(자원 재생 알고리즘 미적용)
    if (!g && worldMode === 'home') {   // 홈: 모든 블럭 바닐라 채굴 — 부수면 아이템 드롭, 재생 없음
      const b = BLOCKS[hit.id];
      if (!b || b.key === 'bedrock' || b.liquid) { breaking = null; return; }
      const bk = BLOCKS[hit.id].key; const fam = blockToolClass(bk) || 'pickaxe';
      g = { res: null, homeDrop: blockDropKey(hit.id), fam, hard: homeBlockHardness(hit.id), to: 0, door: BLOCKS[hit.id].shape === 'door' };   // V17-C: 문은 짝 칸도 제거
    }
    if (!g) { breaking = null; return; }
    if (!breaking || breaking.x !== hit.x || breaking.y !== hit.y || breaking.z !== hit.z) {
      const api = econApi();
      // V27-D: 실제 MC 파괴 공식 — 손에 든 도구가 블럭의 도구 클래스와 일치할 때만 배속(나무2/돌4/철6/금12/다이아8/태초9).
      //   시간 = 경도 × (수확가능 1.5 / 불가 5) ÷ 배속. 곡괭이류 블럭은 곡괭이(+요구 티어) 없으면 드롭 없음.
      const bk2 = BLOCKS[hit.id].key;
      const tclass = blockToolClass(bk2);
      const heldK = typeof activeHotbarKey === 'function' ? activeHotbarKey() : null;
      const tp = api.toolPowerHeld ? api.toolPowerHeld(heldK, tclass)
        : (api.toolPower ? api.toolPower(g.fam) : { speedMul: 1, match: true, tier: 6 });
      const H = homeBlockHardness(hit.id);
      const reqT = tclass === 'pickaxe' ? requiredTierFor(bk2) : 0;
      const canHarvest = tclass !== 'pickaxe' || (tp.match && tp.tier >= reqT);
      const speed = tp.match ? Math.max(1, tp.speedMul) : 1;
      g.fam = tclass || g.fam;   // 연쇄(광역/트리캡) 판정도 실제 클래스 기준
      breaking = { x: hit.x, y: hit.y, z: hit.z, t: 0, need: H * (canHarvest ? 1.5 : 5) / speed, tp, noDrop: !canHarvest };
      if (H <= 0.01) breaking.need = 0.001;   // 즉시 파괴(꽃/풀/작물/횃불)
    }
    breaking.t += dt;
    const cross = document.getElementById('econ3dCross');
    if (cross) cross.textContent = Math.min(99, Math.round(breaking.t / breaking.need * 100)) + '%';
    if (breaking.t < breaking.need) return;
    // 파괴 완료 → 자원 지급 + 블록 전환 + 재생 예약 (+ 광역 채집/트리캐피테이터)
    const api = econApi();
    const tp = breaking.tp || {};
    const gated = !!(breaking && breaking.noDrop);   // V22-K1: 티어 미달 — 광역/트리캡 연쇄 드롭도 차단
    if (gated) { g = Object.assign({}, g, { res: null, homeDrop: g.homeDrop !== undefined ? null : undefined }); if (typeof toast === 'function') toast('⛏️ 곡괭이(요구 티어)를 손에 들어야 아이템이 나와요', false); }
    doGatherBreak(hit.x, hit.y, hit.z, g, api);
    // V22-K: 광역/트리캡 연쇄도 월드 모드에 맞는 정의 사용 — 홈에서 허브 채집 정의(재생/원자재 드롭)를 쓰던 버그 수정
    const chainG = id2 => worldMode === 'home' ? { res: null, homeDrop: blockDropKey(id2), fam: g.fam, to: 0 } : gatherBlocks()[id2];
    if (!gated && tp.treecap && tp.match && g.fam === 'axe' && g.to === 0) {   // V27-D: 도끼를 들고 있을 때만
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
          const g2 = chainG(id2);
          if (g2) { doGatherBreak(nx, ny, nz, g2, api); q.push([nx, ny, nz]); felled++; }
        }
      }
      if (felled > 0 && typeof toast === 'function') toast(`🪓 트리캐피테이터! 원목 ${felled + 1}블록 통째 벌목`, true);
    } else if (!gated && tp.area > 0) {
      // 광역 채집 인챈트: 주변 같은 종류 블록 +N개 동시 파괴
      let broke = 0;
      outer:
      for (const d2 of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1]]) {
        if (broke >= tp.area) break outer;
        const nx = hit.x + d2[0], ny = hit.y + d2[1], nz = hit.z + d2[2];
        const id2 = getBlockLocal(nx, ny, nz);
        if (id2 !== hit.id) continue;
        const g2 = chainG(id2);
        if (g2) { doGatherBreak(nx, ny, nz, g2, api); broke++; }
      }
    }
    if (cross) cross.textContent = '+';
    breaking = null;
  }
  /* ---------------- V24-C: 파괴 파티클 + 아이템 획득 이펙트(감사 #29,#31) ---------------- */
  let particles = [];   // {spr, vx, vy, vz, t}
  let pickups = [];     // {spr, t}
  const _partMatCache = {}, _pickMatCache = {}, _tileColCache = {};
  function partMat(col) { if (!_partMatCache[col]) _partMatCache[col] = new THREE.SpriteMaterial({ color: col }); return _partMatCache[col]; }
  function tileColor(b) {
    const tn = typeof b.tex === 'string' ? b.tex : (b.tex && (b.tex.side || b.tex.top)) || 'stone';
    if (_tileColCache[tn] != null) return _tileColCache[tn];
    let col = 0x9a9a9a;
    try {
      const u = atlasUV[tn], cvs = atlasTex.image, ctx2 = cvs.getContext('2d');
      const px = ctx2.getImageData(Math.floor((u.x0 + u.x1) / 2 * cvs.width), Math.floor((u.y0 + u.y1) / 2 * cvs.height), 1, 1).data;   // V26-B: flipY=false — v 그대로(거울행 샘플로 돌이 빨간 파편 튀던 버그)
      col = (px[0] << 16) | (px[1] << 8) | px[2];
    } catch (e) {}
    return (_tileColCache[tn] = col);
  }
  // V27-E: 실제 MC 파티클 스프라이트(particle/ 폴더) — 크리티컬 별/스윕/불꽃
  const _pTexCache = {};
  function particleTex(name) {
    if (_pTexCache[name] !== undefined) return _pTexCache[name];
    const t = new THREE.TextureLoader().load('particle/' + name + '.png', undefined, undefined, () => { _pTexCache[name] = null; });
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return (_pTexCache[name] = t);
  }
  function spawnCritParticles(pos) {
    if (!scene || particles.length > 220) return;
    const tex = particleTex('critical_hit');
    for (let i = 0; i < 5; i++) {
      const mat = tex ? new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
        : new THREE.SpriteMaterial({ color: 0xffe08a, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.28);
      sp.position.set(pos.x + (Math.random() - 0.5) * 0.9, pos.y + 1.0 + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 0.9);
      scene.add(sp);
      particles.push({ spr: sp, t: 0.5 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3 });
    }
  }
  function spawnBreakParticles(x, y, z, id) {
    const b = BLOCKS[id]; if (!b || !scene) return;
    const col = tileColor(b);
    for (let i = 0; i < 8; i++) {
      const spr = new THREE.Sprite(partMat(col));
      spr.scale.setScalar(0.11 + Math.random() * 0.08);
      spr.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      scene.add(spr);
      particles.push({ spr, vx: (Math.random() - 0.5) * 2.6, vy: 1.6 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.6, t: 0.5 + Math.random() * 0.25 });
    }
    if (particles.length > 240) { const n = particles.length - 240; for (let i = 0; i < n; i++) scene.remove(particles[i].spr); particles.splice(0, n); }
  }
  function spawnPickupFx(x, y, z, key) {
    if (!scene || typeof window.econIcon !== 'function' || !key) return;
    if (!_pickMatCache[key]) { try { _pickMatCache[key] = new THREE.SpriteMaterial({ map: new THREE.TextureLoader().load(window.econIcon(key)), transparent: true, depthTest: false }); } catch (e) { return; } }
    const spr = new THREE.Sprite(_pickMatCache[key]);
    spr.scale.setScalar(0.45);
    spr.position.set(x + 0.5, y + 0.6, z + 0.5);
    scene.add(spr);
    pickups.push({ spr, t: 0 });
    if (pickups.length > 40) { scene.remove(pickups[0].spr); pickups.shift(); }
  }
  function tickParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i]; q.t -= dt;
      if (q.t <= 0) { scene.remove(q.spr); particles.splice(i, 1); continue; }
      q.vy -= 9 * dt;
      q.spr.position.x += q.vx * dt; q.spr.position.y += q.vy * dt; q.spr.position.z += q.vz * dt;
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const q = pickups[i]; q.t += dt;
      const tp = q.spr.position, k = Math.min(1, dt * (2 + q.t * 10));   // 점점 빨라지며 플레이어에게 흡수
      tp.x += (P.x - tp.x) * k; tp.y += (P.y + 1.0 - tp.y) * k; tp.z += (P.z - tp.z) * k;
      if (q.t > 0.9 || Math.hypot(tp.x - P.x, tp.y - (P.y + 1), tp.z - P.z) < 0.4) { scene.remove(q.spr); pickups.splice(i, 1); }
    }
  }
  function clearParticles() { particles.forEach(q => scene && scene.remove(q.spr)); pickups.forEach(q => scene && scene.remove(q.spr)); particles = []; pickups = []; }
  // V26-B: 지지 붕괴 — 아래 블럭이 사라지면 위의 지지 필요 블럭(꽃/풀/작물/사탕수수/횃불/문/침대)도 파괴(홈=드롭)
  function collapseAbove(x, y, z, api) {
    for (let step = 0; step < 12; step++) {   // 사탕수수 스택 연쇄
      const uy = y + 1 + step;
      const ub = BLOCKS[getBlockLocal(x, uy, z)];
      if (!ub) return;
      const needsSupport = ub.cross || ub.shape === 'door' || ub.shape === 'bed';
      if (!needsSupport) return;
      const uid = getBlockLocal(x, uy, z);
      setW(x, uy, z, 0); markBlockDirty(x, z);
      spawnBreakParticles(x, uy, z, uid);
      if (worldMode === 'home') {
        const drop = blockDropKey(uid);
        if (drop && api && api.giveItem) { api.giveItem(drop, 1); spawnPickupFx(x, uy, z, drop); }
        if (api && api.setHomeEdit) api.setHomeEdit(x, uy, z, 0);
      }
      if (ub.shape === 'door' || ub.shape === 'bed') return;   // 문/침대는 1칸만
    }
  }
  function doGatherBreak(x, y, z, g, api) {
    const _pid = getBlockLocal(x, y, z);   // V24-C: 파괴 파티클용(교체 전 블럭)
    if (g.res && (g.chance == null || Math.random() < g.chance) && api.gatherBlock) api.gatherBlock(g.res, g.fam);
    if (g.homeDrop !== undefined) {   // V13-A: 홈 건축 블럭 파괴 → 아이템 드롭 + 영속 편집
      if (g.homeDrop === 'chest' && api.dumpChest) api.dumpChest(`${x},${y},${z}`);   // V21-E1: 상자 파괴 시 내용물 회수(유실 방지)
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
    if (!g.to) scheduleFluidAround(x, y, z);   // V23-A: 빈 자리로 주변 물/용암 확산
    spawnBreakParticles(x, y, z, _pid);   // V24-C: 블럭 파편 파티클
    const _pk = g.homeDrop !== undefined ? g.homeDrop : g.res;
    if (_pk) spawnPickupFx(x, y, z, _pk);   // V24-C: 아이템 흡수 이펙트
    if (!g.to) collapseAbove(x, y, z, api);   // V26-B: 지지 붕괴
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
    fluidQueue = []; fluidLvl.clear();   // V23-A: 유체 시뮬레이션도 월드 단위로 리셋
  }

  /* ---------------- V23-A: 물/용암 확산 시뮬레이션 (MC 단순화판) ---------------- */
  // 소스 블럭 개념 대신 흐름 거리(level)를 Map으로 추적 — 월드 생성 유체 = 레벨 0(소스 취급).
  // 물: 수평 최대 7칸 / 용암: 3칸(MC 오버월드), 아래로는 무제한(낙하 시 레벨 0 리셋, MC 규칙).
  // 물+용암 접촉 시 용암이 굳음: 수직(위에서 물) = 흑요석, 수평 = 조약돌 (MC 근사).
  let fluidQueue = [];            // {x,y,z,at} — 다음 확산 스텝 예약
  const fluidLvl = new Map();     // "x,y,z" -> 흐름 거리
  const FLUID_MAX = { water: 7, lava: 3 };
  const FLUID_TICK = { water: 260, lava: 750 };   // 확산 스텝 간격(ms) — 용암이 더 느리게 흐름(MC)
  function fkey(x, y, z) { return x + ',' + y + ',' + z; }
  function fluidLevelOf(x, y, z) { const v = fluidLvl.get(fkey(x, y, z)); return v == null ? 0 : v; }
  // 블럭이 부서지거나 유체가 노출됐을 때 주변 유체를 깨워 확산 시작
  function scheduleFluidAround(x, y, z) {
    for (const d of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const b = BLOCKS[getBlockLocal(nx, ny, nz)];
      if (b && b.liquid) fluidQueue.push({ x: nx, y: ny, z: nz, at: performance.now() + FLUID_TICK[b.lava ? 'lava' : 'water'] });
    }
  }
  function fluidFill(x, y, z, fid, lvl) {
    if (!inBounds(x, y, z) || y < 2) return;
    const cb = BLOCKS[getBlockLocal(x, y, z)];
    if (cb && cb.liquid) {
      const eff = fluidLvl.has(fkey(x, y, z)) ? fluidLvl.get(fkey(x, y, z)) : 0;   // 기존 유체(소스=0)는 더 강한 흐름만 대체
      if (eff <= lvl) return;
    }
    setW(x, y, z, fid);
    fluidLvl.set(fkey(x, y, z), lvl);
    markBlockDirty(x, z); _mapDirty = true;
    fluidQueue.push({ x, y, z, at: performance.now() + FLUID_TICK[BLOCKS[fid].lava ? 'lava' : 'water'] });
    if (worldMode === 'home') { const api = econApi(); if (api.setHomeEdit) api.setHomeEdit(x, y, z, fid); }   // 내 섬은 영속 저장
  }
  let _hardenToastAt = 0;
  function hardenLava(x, y, z, vertical) {   // 물과 접촉한 용암 칸이 굳음
    const to = vertical ? ID.obsidian : ID.cobblestone;
    setW(x, y, z, to);
    fluidLvl.delete(fkey(x, y, z));
    markBlockDirty(x, z); _mapDirty = true;
    if (worldMode === 'home') { const api = econApi(); if (api.setHomeEdit) api.setHomeEdit(x, y, z, to); }
    if (typeof toast === 'function' && performance.now() - _hardenToastAt > 4000) { _hardenToastAt = performance.now(); toast(vertical ? '⬛ 물과 용암이 만나 흑요석이 생겼어요!' : '🪨 물과 용암이 만나 조약돌이 생겼어요!', true); }
  }
  function tickFluids() {
    if (!fluidQueue.length) return;
    const now = performance.now();
    let budget = 48;   // 프레임당 처리 상한(대홍수 시 프레임 드랍 방지)
    for (let i = 0; i < fluidQueue.length && budget > 0;) {
      const q = fluidQueue[i];
      if (now < q.at) { i++; continue; }
      fluidQueue.splice(i, 1); budget--;
      const id = getBlockLocal(q.x, q.y, q.z);
      const b = BLOCKS[id];
      if (!b || !b.liquid) { fluidLvl.delete(fkey(q.x, q.y, q.z)); continue; }
      const kind = b.lava ? 'lava' : 'water';
      const lvl = fluidLevelOf(q.x, q.y, q.z);
      const below = getBlockLocal(q.x, q.y - 1, q.z);
      const bb = BLOCKS[below];
      if (bb && bb.liquid && !!bb.lava !== !!b.lava) {   // 위아래로 다른 유체 접촉
        if (bb.lava) hardenLava(q.x, q.y - 1, q.z, true);   // 물이 용암 위로 → 아래 용암이 흑요석
        else if (b.lava) hardenLava(q.x, q.y, q.z, false);  // 용암이 물 위로 떨어짐 → 용암이 조약돌
        continue;
      }
      if (q.y > 2 && (below === 0 || (bb && !bb.solid && !bb.liquid))) {
        fluidFill(q.x, q.y - 1, q.z, id, 0);   // 수직 낙하(레벨 리셋) — 아래로 흐르면 수평 확산 없음(MC)
        continue;
      }
      if (lvl >= FLUID_MAX[kind]) continue;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = q.x + d[0], nz = q.z + d[1];
        const nid = getBlockLocal(nx, q.y, nz);
        const nb = BLOCKS[nid];
        if (nb && nb.liquid) { if (!!nb.lava !== !!b.lava) hardenLava(b.lava ? q.x : nx, q.y, b.lava ? q.z : nz, false); continue; }
        if (nid === 0 || (nb && !nb.solid)) fluidFill(nx, q.y, nz, id, lvl + 1);
      }
    }
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
    zombie: { name: '좀비', kind: 'humanoid', color: 0x3a7d3a, hp: 100, dmg: 20, hpAnchors: [[1, 100], [15, 707]], dmgAnchors: [[1, 20], [15, 111]], xp: 6, coins: 1, speed: 1.7, books: ['sharpness', 'smite'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'poisonous_potato', n: 1, chance: 0.02 }, { key: 'potato', n: 1, chance: 0.01 }, { key: 'carrot', n: 1, chance: 0.01 }], tierCap: 1 },   // V77 드롭 + V81 위키 HP/공격 앵커(L1~15)
    skeleton: { name: '스켈레톤', kind: 'humanoid', color: 0xcccccc, hp: 100, dmg: 15, hpAnchors: [[1, 100], [15, 707]], dmgAnchors: [[1, 15], [15, 83]], xp: 7, coins: 1, speed: 1.8, books: ['critical', 'prosecute'], drops: [{ key: 'bone', n: 1 }, { key: 'bone', n: 1, chance: 0.5 }], tierCap: 1 },   // V77 드롭 + V81 위키 HP/공격 앵커(L1~15)
    crypt_ghoul: { name: '크립트 구울', kind: 'humanoid', color: 0x5a8a5a, hp: 2000, dmg: 350, fixedStats: true,   /* V107: 위키 실측 lv30 — dmg31→350, coins15→13, xp25→36 */ gear: { sword: 0xf7d84a }, xp: 36, coins: 13, speed: 2.2, books: ['giant_killer', 'execute'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'rotten_flesh', n: 1, chance: 0.5 }], tierCap: 3 },   /* V103: 위키 실측 — 썩은 살점 1-2만(골드 미드롭, 골드는 골든 구울) */
    golden_ghoul: { name: '골든 구울', kind: 'humanoid', color: 0xd8b23a, hp: 45000, dmg: 800, fixedStats: true,   /* V107: 위키 실측 lv60 — hp4500→45000, dmg45→800, coins60→100, xp45→50 */ gear: { helmet: 0xf7d84a, sword: 0xf7d84a }, xp: 50, coins: 100, speed: 2.3, books: ['looting'], drops: [{ key: 'rotten_flesh', n: 2 }, { key: 'gold', n: 1 }, { key: 'gold', n: 1, chance: 0.5 }, { key: 'gold', n: 1, chance: 0.5 }, { key: 'talisman_wealth_rune', n: 1, chance: 0.02 }], tierCap: 4 },   /* V104: 위키 실측 — 썩은 살점 1-2 + 골드 잉곳 1-10 */
    wraith: { name: '레이스', kind: 'tall', color: 0x8a94b8, hp: 250, dmg: 38, fixedStats: true,   /* V96: 묘지/크립트 고정몹(골든구울과 동일 구역) */ xp: 30, coins: 10, speed: 2.6, books: ['life_steal'], drops: [{ key: 'gunpowder', n: 1 }, { key: 'bone', n: 2 }, { key: 'lapis', n: 2, chance: 0.3 }], tierCap: 3 },
    rat: { name: '쥐', kind: 'quad', color: 0x6a6258, hp: 40, dmg: 8, xp: 3, coins: 1, speed: 3.0, scale: 0.45, books: [], drops: [{ key: 'rawfish', n: 1, chance: 0.3 }], tierCap: 0 },
    wolf: { name: '늑대', kind: 'quad', color: 0x9a9a9a, hp: 250, dmg: 90, fixedStats: true, xp: 15, coins: 1, speed: 2.8, books: ['first_strike', 'looting'], drops: [{ key: 'bone', n: 1 }], tierCap: 2 },   /* V107: 위키 실측 lv15 — hp160→250, dmg20→90, coins4→1, xp10→15, fixedStats */
    old_wolf: { name: '올드 울프', kind: 'quad', color: 0x5a5a62, hp: 15000, dmg: 720, fixedStats: true, xp: 40, coins: 40, speed: 3.0, scale: 1.4, books: ['first_strike', 'experience'], drops: [{ key: 'bone', n: 1 }], tierCap: 4 },   /* V107: 위키 실측 lv50 — hp900→15000, dmg80→720, coins25→40, xp60→40, fixedStats */
    slime: { name: '슬라임', kind: 'slime', color: 0x5ac26a, hp: 120, dmg: 14, xp: 8, coins: 2, speed: 1.4, books: ['magnet', 'big_brain'], drops: [{ key: 'emerald', n: 1, chance: 0.08 }], tierCap: 2 },
    miner_zombie: { name: '광부 좀비', kind: 'humanoid', color: 0x7a6a4a, hp: 250, dmg: 180, fixedStats: true,   /* V107: 위키 실측 lv15 — hp200→250, dmg28→180, coins5→12, xp15→20 */ gear: { helmet: 0xd8d8d4, tool: 0x9c7a44 }, xp: 20, coins: 12, speed: 1.8, books: ['efficiency'], drops: [{ key: 'rotten_flesh', n: 1 }], tierCap: 2 },
    lapis_zombie: { name: '청금석 좀비', kind: 'humanoid', color: 0x2a4fc0, hp: 200, dmg: 50, fixedStats: true,   /* V107: 위키 실측 lv7 — hp260→200, dmg32→50, coins6→5, xp18→12 */ gear: { helmet: 0x1f4fc0, chest: 0x1f4fc0 }, xp: 12, coins: 5, speed: 1.8, books: ['fortune'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'rotten_flesh', n: 1, chance: 0.5 }], tierCap: 3 },   /* V103: 위키 실측 — 청금석(lapis)은 광석 채굴에서만, 라피스 좀비는 썩은 살점 1-2 + 라피스 갑옷 1%/부위(mobDropTable 오버라이드) */
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
    redstone_pigman: { name: '레드스톤 피그맨', kind: 'humanoid', color: 0xc86a6a, hp: 250, dmg: 75, fixedStats: true,   /* V107: 위키 실측 lv10 — hp400→250, dmg42→75, coins8→12, xp24→20 */ xp: 20, coins: 12, speed: 2.0, books: ['fortune', 'efficiency'], drops: [{ key: 'gold_nugget', n: 2 }], tierCap: 3 },   /* V103: 위키 실측 — 레드스톤 0-5 @50%, 골드 너겟 0-2 @50%(고정 3개 아님) */
    diamond_zombie: { name: '다이아 좀비', kind: 'humanoid', color: 0x5decd5, hp: 700, dmg: 60, fixedStats: true,   /* V96: 딥캐번 다이아 챔버 고정몹 */ gear: { helmet: 0x5decd5, chest: 0x5decd5, sword: 0x5decd5 }, xp: 40, coins: 12, speed: 2.0, books: ['area_mining'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'poisonous_potato', n: 1, chance: 0.02 }, { key: 'potato', n: 1, chance: 0.01 }, { key: 'carrot', n: 1, chance: 0.01 }], tierCap: 4 },
    diamond_skeleton: { name: '다이아 스켈레톤', kind: 'humanoid', color: 0x8aeade, hp: 650, dmg: 65, fixedStats: true,   /* V96: 다이아 챔버 고정몹(다이아 좀비 쌍) */ xp: 40, coins: 12, speed: 2.1, books: ['area_mining', 'critical'], drops: [{ key: 'bone', n: 1 }, { key: 'bone', n: 1, chance: 0.5 }], tierCap: 4 },
    spider: { name: '거미', kind: 'spider', color: 0x3a3040, hp: 120, dmg: 35, hpAnchors: [[1, 120], [15, 849]], dmgAnchors: [[1, 35], [15, 194]], xp: 6, coins: 2, speed: 2.4, books: ['bane_of_arthropods', 'triple_strike'], drops: [{ key: 'string', n: 1 }, { key: 'spider_eye', n: 1, chance: 0.5 }], tierCap: 1 },   // V77 드롭 + V81 위키 HP/공격 앵커(L1~15)
    gravel_skeleton: { name: '자갈 스켈레톤', kind: 'humanoid', color: 0x7d7873, hp: 220, dmg: 30, xp: 16, coins: 5, speed: 1.9, books: ['prosecute'], drops: [{ key: 'bone', n: 2 }, { key: 'bone', n: 1, chance: 0.5 }, { key: 'bone', n: 1, chance: 0.5 }, { key: 'flint', n: 1 }, { key: 'flint', n: 1, chance: 0.5 }, { key: 'enchanted_bone', n: 1, chance: 0.02 }, { key: 'arachne_crystal', n: 1, chance: 1 / 120 }], tierCap: 2 },   /* V104: 위키 실측 — 뼈 2-4 + 부싯돌 1-2 + 인챈티드 뼈 2%(아라크네 크리스탈은 게임 소환 메커니즘 유지) */
    broodmother: { name: '브루드마더', kind: 'spider', color: 0x4a2050, hp: 6000, dmg: 250, fixedStats: true, xp: 18, coins: 10, speed: 2.2, scale: 2.4, books: ['bane_of_arthropods', 'rejuvenate'], drops: [{ key: 'string', n: 1 }, { key: 'spider_eye', n: 1 }], tierCap: 5 },   /* V107: 위키 실측 lv12 — dmg90→250, coins80→10, xp150→18, fixedStats */
    arachne: { name: '아라크네', kind: 'spider', color: 0x8a1a30, hp: 20000, dmg: 300, fixedStats: true, xp: 300, coins: 150, speed: 2.5, scale: 3.0,   /* V110: 위키 실측 — dmg160→300(아라크네 보스) */ books: ['bane_of_arthropods', 'thunderlord'], drops: [{ key: 'string', n: 16 }, { key: 'talisman_spider_ring', n: 1, chance: 0.25 }, { key: 'pet_egg_wolf', n: 1, chance: 0.05 }], tierCap: 6 },
    blaze: { name: '블레이즈', kind: 'blaze', color: 0xe8a020, hp: 250000, dmg: 2000, fixedStats: true, xp: 50, coins: 50, speed: 2.0, books: ['fire_aspect', 'thunderlord'], drops: [{ key: 'blaze_rod', n: 1 }, { key: 'blaze_rod', n: 1, chance: 0.5 }], tierCap: 4 },   /* V107: 위키 실측 크림슨 lv70 — hp600→250k, dmg50→2000, coins8→50, xp35→50, fixedStats(엔드게임 존) */   /* V104: 위키 실측 — 블레이즈 막대 1-2(100%/50%) */   // V79: 위키 — 블레이즈 막대 100%
    wither_skeleton: { name: '위더 스켈레톤', kind: 'tall', color: 0x2a2a2a, hp: 300000, dmg: 2000, fixedStats: true, xp: 120, coins: 20, speed: 2.2, books: ['titan_killer', 'dragon_hunter'], drops: [{ key: 'bone', n: 3 }, { key: 'coal', n: 1, chance: 0.5 }, { key: 'enchanted_coal', n: 1, chance: 0.01 }], tierCap: 4 },   /* V107: 위키 실측 크림슨 lv70 — hp900→300k, dmg65→2000, coins10→20, xp45→120, fixedStats(엔드게임 존) */   /* V104: 위키 실측 — 뼈 100% + 석탄 50% + 인챈티드 석탄 1% */
    magma_cube: { name: '마그마 큐브', kind: 'slime', color: 0xd2541f, hp: 400000, dmg: 2000, fixedStats: true, xp: 200, coins: 6, speed: 1.5, books: ['hardened', 'thorns'], drops: [{ key: 'magma_cream', n: 1 }, { key: 'magma_cream', n: 1, chance: 0.5 }, { key: 'magma_cream', n: 1, chance: 0.5 }], tierCap: 3 },   /* V107: 위키 실측 크림슨 lv75 — hp350→400k, dmg35→2000, xp22→200, fixedStats(엔드게임 존) */   /* V104: 위키 실측 — 마그마 크림 1-3(100%) */   // V79: 위키 — 마그마 크림 100%(컬렉션 공급원)
    pigman: { name: '피그맨', kind: 'humanoid', color: 0xe6a8ad, hp: 240, dmg: 125, fixedStats: true, xp: 15, coins: 4, speed: 2.1, books: ['vitality'], drops: [{ key: 'gold_nugget', n: 2 }], tierCap: 3 },   /* V107: 위키 실측 lv12 — hp450→240, dmg48→125, coins8→4, xp28→15, fixedStats */   /* V104: 위키 실측 — 골드 너겟 2(100%) */
    enderman: { name: '엔더맨', kind: 'tall', color: 0x1a1a22, hp: 4500, dmg: 500, hpAnchors: [[42, 4500], [45, 6000], [50, 9000]], fixedStats: true, xp: 40, coins: 10,   /* V107: 위키 실측 lv42 — dmg60→500, coins8→10 */ speed: 2.6, books: ['ender_slayer', 'sugar_rush'], drops: [{ key: 'ender_pearl', n: 1 }, { key: 'ender_pearl', n: 1, chance: 0.5 }, { key: 'ender_pearl', n: 1, chance: 0.5 }, { key: 'enchanted_ender_pearl', n: 1, chance: 0.01 }], tierCap: 4 },   /* V104: 위키 실측 — 엔더 진주 1-3(100%) + 인챈티드 엔더 진주 1% */   // V81 HP앵커 유지 + V97(C11): 데미지 앵커(500~700, 동일구역 젤롯63·워처72의 8배로 즉사) 제거 → fixedStats로 고정 dmg 60(HP는 hpAnchors가 먼저 평가되어 탱키 유지, dmg만 피어 정렬)
    endermite: { name: '엔더마이트', kind: 'quad', color: 0x5a3a6a, hp: 2000, dmg: 400, fixedStats: true,   /* V107: 위키 실측 lv37 — hp320→2000, dmg66→400, coins5→10, xp20→25 */ xp: 25, coins: 10, speed: 3.2, scale: 0.5, books: [], drops: [{ key: 'end_stone', n: 1 }, { key: 'end_stone', n: 1, chance: 0.5 }, { key: 'ender_shard', n: 1, chance: 0.1 }], tierCap: 3 },   /* V104: 위키 실측 — 엔드스톤 1-2(엔더 파편은 게임 자원 경제상 소량 유지) */
    zealot: { name: '젤롯', kind: 'tall', color: 0x2a1a3a, hp: 13000, dmg: 1250, fixedStats: true,   /* V107: 위키 실측 lv55 — hp655→13000, dmg63→1250, coins2→15, xp6→40 */ xp: 40, coins: 15, speed: 2.6, books: ['ender_slayer', 'last_stand', 'true_protection'], drops: [{ key: 'ender_pearl', n: 1 }, { key: 'ender_pearl', n: 1, chance: 0.8 }, { key: 'ender_pearl', n: 1, chance: 0.4 }, { key: 'enchanted_ender_pearl', n: 1, chance: 0.02 }, { key: 'ender_shard', n: 2 }, { key: 'summoning_eye', n: 1, chance: 1 / 420 }], tierCap: 5 },   // V80: 위키 — 엔더진주100%+인챈티드2%+소환의눈1/420
    obsidian_defender: { name: '흑요석 수호자', kind: 'tall', color: 0x2a2040, hp: 10000, dmg: 200, fixedStats: true,   /* V107: 위키 실측 lv55 — hp500→10000, dmg29→200, coins8→15, xp30→40 */ xp: 40, coins: 15, speed: 1.8, books: ['protection', 'hardened'], drops: [{ key: 'obsidian', n: 1 }, { key: 'obsidian', n: 1, chance: 0.5 }, { key: 'enchanted_obsidian', n: 1, chance: 0.01 }], tierCap: 5 },   /* V104: 위키 실측 — 흑요석 다수 + 인챈티드 흑요석 1% */
    watcher: { name: '워처', kind: 'tall', color: 0x3a2a52, hp: 9500, dmg: 500, fixedStats: true,   /* V107: 위키 실측 lv55 — hp480→9500, dmg72→500, coins8→15, xp32→40 */ xp: 40, coins: 15, speed: 2.4, books: ['venomous'], drops: [{ key: 'ender_pearl', n: 1 }, { key: 'ender_pearl', n: 1, chance: 0.5 }, { key: 'enchanted_bone', n: 1, chance: 0.01 }, { key: 'ender_shard', n: 1 }], tierCap: 5 },
    // V97(C15): standalone ender_dragon 제거 — DRAGON_TYPES(8종)로 스폰되며 이 키는 어디서도 참조되지 않던 죽은 정의였음
    sea_walker: { name: '바다 보행자', kind: 'humanoid', color: 0x2a6a8a, hp: 100, dmg: 10, fixedStats: true, xp: 20, coins: 5, speed: 1.6,   /* V110: 위키 실측 lv4 — hp300→100, dmg25→10, coins6→5 */ books: ['vampirism', 'protection'], drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'rotten_flesh', n: 1, chance: 0.5 }, { key: 'rotten_flesh', n: 1, chance: 0.25 }], tierCap: 3 },
    cow: { name: '소', kind: 'quad', color: 0x4a3a2c, hp: 50, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'raw_beef', n: 1 }, { key: 'leather', n: 1 }], tierCap: 0 },   // V75: 위키 — 생소고기+가죽 100%
    pig: { name: '돼지', kind: 'quad', color: 0xe6a8ad, hp: 45, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'raw_porkchop', n: 1 }], tierCap: 0 },   // V75: 위키 — 생돼지고기 100%
    chicken: { name: '닭', kind: 'quad', color: 0xf2f2f2, hp: 30, dmg: 0, xp: 3, coins: 1, speed: 1.2, scale: 0.5, passive: true, books: [], drops: [{ key: 'feather', n: 1 }, { key: 'raw_chicken', n: 1 }, { key: 'egg', n: 1, chance: 0.3 }], tierCap: 0 },   /* V104: 위키 실측 — 생닭·깃털 100% + 달걀 30% */   // V75: 위키 — 생닭+깃털 100%
    sheep: { name: '양', kind: 'quad', color: 0xe9ecec, hp: 50, dmg: 0, xp: 4, coins: 2, speed: 1.0, passive: true, books: [], drops: [{ key: 'raw_mutton', n: 1 }], tierCap: 0 },   // V75: 위키 — HP50, 생양고기+흰 양털 100%
    mushroom_cow: { name: '무쉬룸', kind: 'quad', color: 0xa83232, hp: 50, dmg: 0, xp: 4, coins: 3, speed: 1.0, passive: true, books: [], drops: [{ key: 'raw_beef', n: 1 }, { key: 'pet_egg_elephant', n: 1, chance: 0.004 }], tierCap: 0 },   // V75: 위키 — 무쉬룸도 생소고기 100%
  };
  /* ── V8 몹 대확장: 지역 변종을 "별도 종"으로 + 개별 드롭률(전부 다름, 위키식 1/N) ── */
  // 스파이더 덴 6종(실제 로스터)
  MOB_TYPES.splitter_spider = { name: '스플리터 거미', kind: 'spider', color: 0x4a3a52, hp: 180, dmg: 30, fixedStats: true, xp: 3, coins: 2, speed: 2.3,   /* V110: 위키 실측 lv2 — hp70→180, dmg10→30 */ drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 1 }, { key: 'enchant_book_bane_of_arthropods', n: 1, chance: 1 / 90 }], tierCap: 1 };
  MOB_TYPES.weaver_spider = { name: '위버 거미', kind: 'spider', color: 0x2a4a3a, hp: 160, dmg: 35, fixedStats: true, xp: 6, coins: 2, speed: 2.5,   /* V110: 위키 실측 lv3 — hp110→160, dmg14→35 */ drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 2 }, { key: 'enchant_book_triple_strike', n: 1, chance: 1 / 140 }], tierCap: 1 };
  MOB_TYPES.dasher_spider = { name: '대셔 거미', kind: 'spider', color: 0x30303a, hp: 160, dmg: 55, fixedStats: true, xp: 10, coins: 2, speed: 3.4,   /* V110: 위키 실측 lv4 — dmg19→55 */ drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 2 }, { key: 'enchant_book_sugar_rush', n: 1, chance: 1 / 220 }], tierCap: 2 };
  MOB_TYPES.voracious_spider = { name: '보라시어스 거미', kind: 'spider', color: 0x5a2030, hp: 1000, dmg: 100, fixedStats: true, xp: 18, coins: 8, speed: 2.8,   /* V107: 위키 실측 lv10 — hp420→1000, dmg33→100, fixedStats */ drops: [{ key: 'spider_eye', n: 1 }, { key: 'string', n: 3 }, { key: 'enchant_book_execute', n: 1, chance: 1 / 350 }], tierCap: 3 };
  MOB_TYPES.spider_jockey = { name: '스파이더 자키', kind: 'jockey', color: 0x3a3040, hp: 220, dmg: 45, fixedStats: true, xp: 9, coins: 2, speed: 2.9,   /* V110: 위키 실측 lv3 — hp260→220, dmg26→45 */ drops: [{ key: 'string', n: 2 }, { key: 'bone', n: 2 }, { key: 'enchant_book_critical', n: 1, chance: 1 / 180 }], tierCap: 2 };
  MOB_TYPES.tarantula_vermin = { name: '타란튤라 버민', kind: 'spider', color: 0x6a1a1a, hp: 54000, dmg: 360, fixedStats: true, xp: 35, coins: 14, speed: 3.0, scale: 1.3,   /* V110: 위키 실측 lv110 — hp900→54000, dmg55→360(타란튤라 슬레이어 구역 엔드게임) */ drops: [{ key: 'string', n: 4 }, { key: 'arachne_crystal', n: 1, chance: 1 / 40 }, { key: 'enchant_book_bane_of_arthropods', n: 1, chance: 1 / 60 }], tierCap: 4 };
  // 네더 7종(가스트/좀비 피글린/화염 거미 추가 — 가스트는 부유)
  MOB_TYPES.ghast = { name: '가스트', kind: 'ghast', color: 0xe8e8e8, hp: 100000, dmg: 5000, fixedStats: true, xp: 400, coins: 30, speed: 1.6, fly: true,   /* V107: 위키 실측 크림슨 lv85 — hp1200→100k, dmg90→5000, coins18→30, xp55→400, fixedStats(엔드게임) */ drops: [{ key: 'ghast_tear', n: 1 }, { key: 'ghast_tear', n: 1, chance: 0.5 }, { key: 'gunpowder', n: 2 }, { key: 'enchant_book_dragon_hunter', n: 1, chance: 1 / 600 }], tierCap: 4 };   // V79: 위키 — 가스트 눈물 100%(+50% 2번째)
  MOB_TYPES.zombie_pigman = { name: '좀비 피글린', kind: 'humanoid', color: 0xd8909a, hp: 240, dmg: 125, fixedStats: true, xp: 15, coins: 4, speed: 2.1,   /* V107: 위키 실측 lv12 — hp550→240, dmg52→125, coins9→4, xp30→15, fixedStats */ drops: [{ key: 'gold', n: 2, chance: 1 / 2 }, { key: 'enchant_book_vitality', n: 1, chance: 1 / 240 }], tierCap: 3 };
  MOB_TYPES.flaming_spider = { name: '화염 거미', kind: 'spider', color: 0xc84a1a, hp: 1000000, dmg: 2000, fixedStats: true, xp: 100, coins: 20, speed: 3.1,   /* V110: 위키 실측 크림슨 lv80 — hp800→1M, dmg70→2000(엔드게임) */ drops: [{ key: 'spider_eye', n: 1 }, { key: 'blaze_rod', n: 1, chance: 1 / 5 }, { key: 'string', n: 3 }, { key: 'enchant_book_fire_aspect', n: 1, chance: 1 / 150 }], tierCap: 4 };
  // 늑대 5종(하울링 케이브 계열)
  MOB_TYPES.pack_spirit = { name: '팩 스피릿', kind: 'quad', color: 0xb8c4d8, hp: 6000, dmg: 300, fixedStats: true, xp: 22, coins: 11, speed: 3.0,   /* V110: 위키 실측 lv30 — hp700→6000, dmg60→300 */ drops: [{ key: 'bone', n: 3 }, { key: 'enchant_book_first_strike', n: 1, chance: 1 / 200 }], tierCap: 3 };
  MOB_TYPES.howling_spirit = { name: '하울링 스피릿', kind: 'quad', color: 0x8a9ab8, hp: 7000, dmg: 450, fixedStats: true, xp: 22, coins: 11, speed: 3.2,   /* V110: 위키 실측 lv35 — hp1100→7000, dmg75→450 */ drops: [{ key: 'bone', n: 4 }, { key: 'enchant_book_experience', n: 1, chance: 1 / 260 }], tierCap: 4 };
  MOB_TYPES.soul_of_the_alpha = { name: '알파의 영혼', kind: 'quad', color: 0xdae8f8, hp: 31150, dmg: 1425, fixedStats: true, xp: 50, coins: 50, speed: 3.4, scale: 1.5,   /* V110: 위키 실측 lv55 — hp3200→31150, dmg120→1425 */ drops: [{ key: 'bone', n: 6 }, { key: 'talisman_wolf_claw', n: 1, chance: 1 / 30 }, { key: 'enchant_book_looting', n: 1, chance: 1 / 45 }], tierCap: 5 };
  // 좀비 라인 보강
  MOB_TYPES.zombie_villager = { name: '좀비 주민', kind: 'humanoid', color: 0x5a7a3a, hp: 120, dmg: 24, xp: 7, coins: 1, speed: 1.7, drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'carrot', n: 1, chance: 1 / 10 }], tierCap: 1 };
  // 엔더 드래곤 8종(실제 유형 + 신성) — 서로 다른 레벨/체력/드롭률
  // 엔더 드래곤(용의 둥지) — 실제 위키(wiki.hypixel.net) HP·데미지 그대로. 레벨 100 고정.
  // [key, 이름, 색, 고정레벨, 실제HP, 실제데미지, 드롭확률1, 드롭확률2]
  const DRAGON_TYPES = [
    ['young_dragon', '영 드래곤', 0xdadde0, 100, 7500000, 1100, 1 / 45, 1 / 90],
    ['protector_dragon', '프로텍터 드래곤', 0x8a94b8, 100, 9000000, 1100, 1 / 60, 1 / 120],
    ['unstable_dragon', '언스테이블 드래곤', 0x1a1a2a, 100, 9000000, 1100, 1 / 45, 1 / 90],
    ['strong_dragon', '스트롱 드래곤', 0xc0392b, 100, 9000000, 1100, 1 / 35, 1 / 70],
    ['wise_dragon', '와이즈 드래곤', 0x54c8e8, 100, 9000000, 1100, 1 / 50, 1 / 100],   // V97(C14): 데미지 티어역전 수정 — old와 값 교환(9M HP는 1100)
    ['superior_dragon', '슈페리어 드래곤', 0xf2d75c, 100, 12000000, 1650, 1 / 20, 1 / 40],
    ['old_dragon', '올드 드래곤', 0x9a8a6a, 100, 15000000, 2200, 1 / 55, 1 / 110],   // V97(C14): 15M HP 최상위권이 1100→2200(HP 오름차순과 데미지 단조 정렬)
    ['holy_dragon', '홀리 드래곤(+α)', 0xfff4d8, 200, 20000000, 2600, 1 / 12, 1 / 25],   // α(실제 미존재 유형)
  ];
  DRAGON_TYPES.forEach(dt => {
    MOB_TYPES[dt[0]] = { name: dt[1], kind: 'dragon', color: dt[2], hp: dt[4], dmg: dt[5], hpAnchors: [[dt[3], dt[4]]], dmgAnchors: [[dt[3], dt[5]]], xp: 40, coins: 30, speed: 2.8,
      drops: [{ key: 'ender_pearl', n: 8 }, { key: 'aspect_of_the_dragon', n: 1, chance: dt[6] }, { key: 'pet_egg_ender_dragon', n: 1, chance: dt[7] / 4 }, { key: 'talisman_dragon_claw', n: 1, chance: dt[7] }, { key: 'talisman_dragon_heart', n: 1, chance: dt[7] / 2 }], tierCap: 6, fixedLv: dt[3] };
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
        name: `${a[0]} F${f}`, kind: a[1], color: a[2], hp: Math.round(base), dmg: Math.round(8 * Math.pow(1.75, f - 1) * a[3]), fixedStats: true,   // V96: 던전몹은 층 공식으로 HP 확정 — 스폰레벨 배수 이중적용 금지(마스터/지옥 배수는 커스텀def에서 별도 적용)
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
    { world: 'hub', x: 152, z: 344, r: 12, types: ['crypt_ghoul'], lv: [30, 30], cap: 2, respawn: 20 },         // V107: 크립트 구울 실측 Lv30 고정
    { world: 'hub', x: 88, z: 208, r: 16, types: ['slime'], lv: [3, 8], cap: 3, respawn: 14 },                  // 석탄 광산 챔버
    { world: 'hub', x: 224, z: 100, r: 34, types: ['wolf'], lv: [15, 15], cap: 4, respawn: 15 },                 // V107: 늑대 실측 Lv15 고정
    { world: 'hub', x: 140, z: 130, r: 26, types: ['wolf'], lv: [15, 15], cap: 3, respawn: 16 },                 // V107: 늑대 실측 Lv15 고정
    { world: 'hub', x: 224, z: 352, r: 12, types: ['zombie'], lv: [10, 20], cap: 3, respawn: 14 },              // 콜로세움(훈련용)
  ];
  SPAWN_AREAS = SPAWN_AREAS.concat([
    // 스파이더 덴: 산을 오를수록 강한 거미(기슭 → 중턱 → 정상), 정상엔 브루드마더
    { world: 'spider', x: 64, z: 64, r: 52, rMin: 34, types: ['spider'], lv: [2, 5], cap: 8, respawn: 8 },
    { world: 'spider', x: 64, z: 64, r: 32, rMin: 16, types: ['spider'], lv: [6, 10], cap: 6, respawn: 10 },
    { world: 'spider', x: 64, z: 64, r: 15, rMin: 5, types: ['spider'], lv: [11, 13], cap: 4, respawn: 12 },
    { world: 'spider', x: 64, z: 64, r: 5, types: ['broodmother'], lv: [12, 12], cap: 1, respawn: 60 },   // V107: 브루드마더 실측 Lv12(고정스탯 6000HP)
    // 딥 캐번/골드 광산
    { world: 'deep', x: 48, z: 48, r: 30, y: 20, types: ['slime'], lv: [5, 10], cap: 6, respawn: 12 },
    { world: 'deep', x: 48, z: 48, r: 26, y: 10, types: ['zombie'], lv: [10, 20], cap: 4, respawn: 14 },
    { world: 'gold', x: 56, z: 46, r: 26, types: ['zombie', 'skeleton'], lv: [8, 15], cap: 5, respawn: 12 },
    // 네더 던전 요새: 첨탑 블레이즈 + 위더 홀 + 마그마
    { world: 'nether', x: 40, z: 40, r: 8, y: 34, types: ['blaze'], lv: [70, 70], cap: 3, respawn: 13 },   // V107: 크림슨 블레이즈 실측 Lv70(엔드게임)
    { world: 'nether', x: 88, z: 88, r: 8, y: 34, types: ['blaze'], lv: [70, 70], cap: 3, respawn: 13 },   // V107
    { world: 'nether', x: 64, z: 43, r: 9, y: 22, types: ['wither_skeleton'], lv: [70, 70], cap: 3, respawn: 15 },   // V107: 위더 스켈레톤 실측 Lv70
    { world: 'nether', x: 64, z: 80, r: 26, types: ['magma_cube'], lv: [75, 75], cap: 5, respawn: 12 },   // V107: 마그마 큐브 실측 Lv75
    { world: 'nether', x: 88, z: 40, r: 20, types: ['zombie_pigman', 'pigman'], lv: [12, 12], cap: 4, respawn: 13 },   // V107: 피그맨 실측 Lv12
    { world: 'nether', x: 64, z: 64, r: 40, rMin: 20, types: ['ghast'], lv: [85, 85], cap: 2, respawn: 25 },   // V107: 가스트 실측 Lv85
    { world: 'nether', x: 40, z: 88, r: 18, types: ['flaming_spider'], lv: [80, 80], cap: 3, respawn: 15 },   // V110: 화염 거미 실측 크림슨 lv80
    // 허브 확장(폐허/크립트 심부/가축) + 딥 캐번 층별 몹 + 자갈 광산
    { world: 'hub', x: 88, z: 280, r: 24, types: ['old_wolf'], lv: [50, 50], cap: 1, respawn: 40 },   // V107: 올드 울프 실측 Lv50
    { world: 'hub', x: 88, z: 280, r: 20, types: ['rat'], lv: [1, 3], cap: 3, respawn: 10 },
    { world: 'hub', x: 152, z: 344, r: 10, types: ['wraith', 'golden_ghoul'], lv: [26, 34], cap: 2, respawn: 30 },
    { world: 'hub', x: 152, z: 314, r: 26, types: ['zombie_villager'], lv: [1, 3], cap: 3, respawn: 12 },
    { world: 'hub', x: 330, z: 224, r: 34, types: ['cow', 'pig', 'chicken', 'sheep'], lv: [1, 1], cap: 8, respawn: 8 },
    { world: 'gold', x: 56, z: 46, r: 26, types: ['miner_zombie'], lv: [15, 15], cap: 4, respawn: 12 },   // V107: 광부 좀비 실측 Lv15
    { world: 'deep', x: 48, z: 48, r: 28, y: 26, types: ['lapis_zombie'], lv: [7, 12], cap: 4, respawn: 13 },
    { world: 'deep', x: 48, z: 48, r: 28, y: 21, types: ['redstone_pigman'], lv: [10, 10], cap: 4, respawn: 13 },   // V107: 레드스톤 피그맨 실측 Lv10
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
    { world: 'park', x: 72, z: 82, r: 34, rMin: 0, types: ['wolf'], lv: [15, 15], cap: 4, respawn: 15 },   // V107: 늑대 실측 Lv15
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
  // V98: 실제 섬 맵(임포트) 전용 스폰 재생성 — 하드코딩 절차 좌표는 임포트 맵과 어긋나 몹이 안 나옴.
  //   해당 섬의 몹 팔레트(types/lv)를 실제 지표 전역에 타일링 + 보스/미니보스는 맵 안쪽으로 재배치.
  function clearMapSpawnAreas() { SPAWN_AREAS = SPAWN_AREAS.filter(a => !a._mapGen); }
  function genMapSpawnAreas(wk) {
    clearMapSpawnAreas();
    const tmpl = SPAWN_AREAS.filter(a => a.world === wk && !a._mapGen);
    if (!tmpl.length) return;
    const field = tmpl.filter(a => a.cap >= 2 && !a.hellOnly);       // 일반 필드 몹(다수 스폰)
    const special = tmpl.filter(a => a.cap === 1 || a.hellOnly);     // 보스/미니보스/드래곤/지옥
    const types = [...new Set(field.flatMap(a => a.types))];
    if (!types.length && !special.length) return;
    let loMin = 99, loMax = 1;
    field.forEach(a => { loMin = Math.min(loMin, a.lv[0]); loMax = Math.max(loMax, a.lv[1]); });
    if (loMin > loMax) { loMin = 1; loMax = 5; }
    const cx = W >> 1, cz = Dp >> 1, pad = 8, step = 44, added = [];
    // 밀폐(실내) 구역이면 spawnMob이 groundBelow로 실내 바닥을 찾도록 스캔 시작 y를 부여.
    //   개방 지표면 y 미부여(surfaceTop). ceil-floor 간격이 크면 실내로 판정.
    const areaYFor = (x, z) => { const si = standInfo(x, z); if (si.y <= SEA + 1) return null; const enclosed = (si.ceil - si.y) > 4; return { valid: true, y: enclosed ? Math.floor((si.y + si.ceil) / 2) : undefined }; };
    // 필드 스폰 구역을 맵 전역에 격자 타일링(유효 바닥만, 최대 44곳)
    if (types.length) {
      for (let x = pad; x < W - pad && added.length < 44; x += step) {
        for (let z = pad; z < Dp - pad && added.length < 44; z += step) {
          const info = areaYFor(x, z); if (!info) continue;          // 물/공허 위는 스킵
          const a = { world: wk, x, z, r: 20, types, lv: [loMin, loMax], cap: 5, respawn: 10, _mapGen: true };
          if (info.y != null) a.y = info.y;                          // 실내면 스캔 시작 y(→ groundBelow 실내 바닥)
          added.push(a);
        }
      }
    }
    // 특수 구역(보스/미니보스/hellOnly)은 맵 안쪽 링의 유효 바닥으로 재배치해 유지
    special.forEach((a, i) => {
      const ang = i / Math.max(1, special.length) * Math.PI * 2;
      const rx = Math.max(pad, Math.min(W - pad, Math.round(cx + Math.cos(ang) * Math.min(cx, cz) * 0.4)));
      const rz = Math.max(pad, Math.min(Dp - pad, Math.round(cz + Math.sin(ang) * Math.min(cx, cz) * 0.4)));
      const info = areaYFor(rx, rz);
      const na = Object.assign({}, a, { x: rx, z: rz, _mapGen: true }); delete na.y;
      if (info && info.y != null) na.y = info.y;                     // 실내면 실내 바닥 스캔, 개방이면 지표
      added.push(na);
    });
    SPAWN_AREAS = SPAWN_AREAS.concat(added);
  }
  let mobs = [];               // {type,def,lv,elite,hp,maxHp,dmg,mesh,label,labelCv,area,state,tx,tz,atkCd,hitIdx,dead}
  const NAMETAG_DIST = 22;     // V113: 실제 MC/스블처럼 근거리 이름표만 표시(먼 몹/NPC/플레이어 태그 숨김)
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
    // V29-A: 실제 스카이블럭 네임태그 규격 — 한 줄 "[Lv N] 이름 HP/최대❤"
    //   [Lv] 회색 · 이름 적색(적대)/초록(소극) · 현재 HP 초록 · ❤ 빨강. 체력바 없음(실제와 동일)
    const c = mob.labelCv.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    // V126: 큰 HP 축약(6M/250k) — 실제 스블 네임태그식, 픽셀 폰트 + 검정 그림자
    const ab = n => { n = Math.max(0, Math.ceil(n)); if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'; if (n >= 1e4) return Math.round(n / 1e3) + 'k'; return n.toLocaleString('en-US'); };
    const segs = [];
    if (mob.elite) segs.push(['★ ', '#ff7ad9']);
    segs.push([`[Lv${mob.lv}] `, '#aaaaaa']);
    segs.push([mob.def.name + ' ', mob.def.passive ? '#55ff55' : '#ff5555']);
    segs.push([`${ab(mob.hp)}/${ab(mob.maxHp)}`, '#55ff55']);
    segs.push(['❤', '#ff5555']);
    c.font = '20px "Minecraft", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    let total = 0; for (const [t] of segs) total += c.measureText(t).width;
    const scale = total > 244 ? 244 / total : 1;
    if (scale < 1) { c.font = `${Math.floor(20 * scale)}px "Minecraft", sans-serif`; total = 0; for (const [t] of segs) total += c.measureText(t).width; }
    let x = 128 - total / 2;
    c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(x - 5, 9, total + 10, 28);   // 텍스트에 밀착한 반투명 배경
    for (const [t, col] of segs) { c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(t, x + 2, 31); c.fillStyle = col; c.fillText(t, x, 29); x += c.measureText(t).width; }
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
  // V29-C: 실제 MC 엔티티 스킨(entity/ 폴더) — 얼굴/정면 크롭을 머리 앞면 평면으로(스킨 파일 있는 몹부터)
  const MOB_FACE_SKIN = {
    cow: { src: 'entity/cow/cow.png', c: [6, 6, 8, 8], p: [0, 0.62, 0.62], s: [0.42, 0.42] },
    mushroom_cow: { src: 'entity/cow/red_mooshroom.png', c: [6, 6, 8, 8], p: [0, 0.62, 0.62], s: [0.42, 0.42] },
    chicken: { src: 'entity/chicken.png', c: [2, 3, 4, 6], p: [0, 0.62, 0.62], s: [0.3, 0.42] },
    enderman: { src: 'entity/enderman/enderman.png', c: [8, 8, 8, 8], p: [0, 1.76, 0.17], s: [0.5, 0.5] },
    ghast: { src: 'entity/ghast/ghast.png', c: [16, 16, 16, 16], p: [0, 1.6, 0.67], s: [1.26, 1.26] },
    blaze: { src: 'entity/blaze.png', c: [8, 8, 8, 8], p: [0, 1.45, 0.34], s: [0.6, 0.6] },
    // V91: 업로드된 실제 MC 스킨(entity/ 플랫 경로) 정합 — 잘못된 서브폴더 경로 → 실제 파일 경로로 수정, 신규 스킨 추가
    _humanFace: 1,   // 마커(아래 헬퍼용)
  };
  // 휴머노이드 얼굴(64×64 표준 스킨, 얼굴=[8,8,8,8]) 일괄 등록
  const _HF = (src) => ({ src, c: [8, 8, 8, 8], p: [0, 1.76, 0.17], s: [0.5, 0.5] });
  delete MOB_FACE_SKIN._humanFace;
  Object.assign(MOB_FACE_SKIN, {
    zombie: _HF('entity/zombie.png'), zombie_villager: _HF('entity/zombie_villager.png'),
    crypt_ghoul: _HF('entity/zombie.png'), golden_ghoul: _HF('entity/zombie.png'),
    miner_zombie: _HF('entity/zombie.png'), lapis_zombie: _HF('entity/zombie.png'), diamond_zombie: _HF('entity/zombie.png'),
    husk: _HF('entity/husk.png'), drowned: _HF('entity/drowned.png'),
    skeleton: _HF('entity/skeleton.png'), gravel_skeleton: _HF('entity/skeleton.png'), diamond_skeleton: _HF('entity/skeleton.png'),
    stray: _HF('entity/stray.png'), wither_skeleton: _HF('entity/wither_skeleton.png'),
    pig: _HF('entity/pig.png'), pigman: _HF('entity/piglin.png'), redstone_pigman: _HF('entity/piglin.png'),
    witch: _HF('entity/witch.png'), guardian: _HF('entity/guardian.png'),
    spider: { src: 'entity/spider.png', c: [40, 12, 8, 8], p: [0, 0.62, 0.66], s: [0.44, 0.4] },
    cave_spider: { src: 'entity/cave_spider.png', c: [40, 12, 8, 8], p: [0, 0.5, 0.55], s: [0.36, 0.32] },
    sheep: { src: 'entity/sheep.png', c: [8, 8, 6, 6], p: [0, 0.62, 0.62], s: [0.38, 0.38] },
    wolf: { src: 'entity/wolf.png', c: [4, 4, 6, 6], p: [0, 0.62, 0.62], s: [0.36, 0.36] },
    old_wolf: { src: 'entity/wolf_ashen.png', c: [4, 4, 6, 6], p: [0, 0.62, 0.62], s: [0.36, 0.36] },
    slime: { src: 'entity/slime.png', c: [26, 18, 6, 6], p: [0, 0.5, 0.5], s: [0.4, 0.4] },
    magma_cube: { src: 'entity/slime.png', c: [26, 18, 6, 6], p: [0, 0.5, 0.5], s: [0.4, 0.4] },
    endermite: { src: 'entity/endermite.png', c: [2, 2, 4, 3], p: [0, 0.28, 0.28], s: [0.28, 0.2] },
    silverfish: { src: 'entity/silverfish.png', c: [0, 4, 4, 3], p: [0, 0.28, 0.3], s: [0.28, 0.2] },
    creeper: { src: 'entity/creeper.png', c: [8, 8, 8, 8], p: [0, 1.2, 0.24], s: [0.5, 0.5] },
    zealot: _HF('entity/enderman.png'), watcher: _HF('entity/enderman.png'), obsidian_defender: _HF('entity/enderman.png'),
  });
  const _faceSkinTex = {};
  function faceSkinPlane(spec) {
    const key = spec.src + spec.c.join(',');
    let tex = _faceSkinTex[key];
    if (!tex) {
      tex = new THREE.TextureLoader().load(spec.src, t => {
        const W2 = t.image.width, H2 = t.image.height;
        t.repeat.set(spec.c[2] / W2, spec.c[3] / H2);
        t.offset.set(spec.c[0] / W2, 1 - (spec.c[1] + spec.c[3]) / H2);
        t.needsUpdate = true;
      });
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      _faceSkinTex[key] = tex;
    }
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(spec.s[0], spec.s[1]), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    pl.position.set(spec.p[0], spec.p[1], spec.p[2]);
    return pl;
  }
  function buildMobMesh(def, elite, typeKey) {
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
    // V29-A: 장비 착용 변형(실제 스블 방식 — 같은 좀비도 투구/흉갑/무기로 구분)
    if (def.gear && h && h.group && (def.kind === 'humanoid' || def.kind === 'tall' || !def.kind)) {
      const g2 = def.gear;
      if (g2.helmet != null) h.group.add(mkBox(0.56, 0.2, 0.56, g2.helmet, 0, 1.92, 0));
      if (g2.chest != null) h.group.add(mkBox(0.58, 0.46, 0.36, g2.chest, 0, 1.14, 0));
      if (g2.sword != null) { const sw = mkBox(0.09, 0.62, 0.13, g2.sword, 0.4, 0.98, 0.28); sw.rotation.x = -0.7; h.group.add(sw); }
      if (g2.tool != null) { const tl = mkBox(0.12, 0.5, 0.12, g2.tool, -0.4, 0.98, 0.26); tl.rotation.x = -0.5; h.group.add(tl); }
    }
    const fs2 = typeKey && MOB_FACE_SKIN[typeKey];
    if (fs2 && h && h.group) h.group.add(faceSkinPlane(fs2));   // V29-C: 실스킨 얼굴
    if (def.scale) h.group.scale.multiplyScalar(def.scale);
    if (elite) h.group.scale.multiplyScalar(1.25);
    return h;
  }
  function spawnMob(area, typeKey, lv, customDef) {
    let def = customDef || MOB_TYPES[typeKey]; if (!def) return null;
    if (def.fixedLv) lv = def.fixedLv;   // 드래곤 등 종 고정 레벨
    const rMin = area.rMin || 0;
    let x = area.x, z = area.z, y = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const rr = rMin + Math.random() * Math.max(1, area.r * 0.9 - rMin);
      const tx = area.x + Math.cos(a) * rr;
      const tz = area.z + Math.sin(a) * rr;
      const ty = area.y != null ? groundBelow(Math.floor(tx), Math.floor(tz), area.y + 2) : surfaceTop(Math.floor(tx), Math.floor(tz));
      if (ty <= SEA + 1) continue;
      const floorId = getBlockLocal(Math.floor(tx), Math.floor(ty - 1), Math.floor(tz));
      if (!floorId || !BLOCKS[floorId] || !BLOCKS[floorId].solid) continue;
      x = tx; z = tz; y = ty;
      break;
    }
    if (y == null) return null;
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
    // V81: 위키 실측 HP/공격력 앵커 보간 — 레벨 범위 몹의 비선형 커브 재현(단일 선형 공식으로 불가)
    const anchorStat = (a, L) => {
      if (L <= a[0][0]) { const [x0, y0] = a[0], [x1, y1] = a[1] || a[0]; return x1 === x0 ? y0 : Math.max(0, y0 + (y1 - y0) * (L - x0) / (x1 - x0)); }   // V96(C9): 첫 앵커 미만 하향 외삽이 음수 되지 않도록 클램프
      for (let i = 1; i < a.length; i++) if (L <= a[i][0]) { const [x0, y0] = a[i - 1], [x1, y1] = a[i]; return y0 + (y1 - y0) * (L - x0) / (x1 - x0); }
      const n = a.length, [x0, y0] = a[n - 2] || a[0], [x1, y1] = a[n - 1]; return x1 === x0 ? y1 : y0 + (y1 - y0) * (L - x0) / (x1 - x0);
    };
    let baseHp = def.hpAnchors ? anchorStat(def.hpAnchors, lv) : (def.fixedStats ? def.hp : def.hp * mul);   // V96: 고정스탯 몹(던전/크립트/명명 좀비/엔드 고정)은 레벨배수 미적용 — 위키 실HP 유지
    let baseDmg = def.dmgAnchors ? anchorStat(def.dmgAnchors, lv) : (def.fixedStats ? def.dmg : def.dmg * mul);   // V96
    // V97(C8): 아레나 등 커스텀 스케일은 앵커/고정 결과 위에 곱한다 — 앵커몹(엔더맨/좀비/스켈레톤/거미)이 아레나 배율을 무시하던 문제 수정
    if (def.arenaHpMul) baseHp *= def.arenaHpMul;
    if (def.arenaDmgMul) baseDmg *= def.arenaDmgMul;
    const mob = {
      type: typeKey, def, lv, elite, rewardMul, weekly,
      maxHp: Math.round(Math.max(1, baseHp) * (elite ? 2.5 : 1) * hpMulD),
      dmg: Math.round(Math.max(0, baseDmg) * (elite ? 1.5 : 1) * dmgMulD),
      state: 'wander', tx: x, tz: z, atkCd: 0, hitIdx: 0, area, walkT: Math.random() * 6,
    };
    mob.hp = mob.maxHp;
    const h = buildMobMesh(def, elite, typeKey);
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
        // V97(C8): hp/dmg 직접 덮어쓰기는 앵커몹(엔더맨/좀비/스켈레톤/거미)에서 무시됐음 → 배율로 전달해 앵커/고정 결과 위에 곱해지게 함. 비앵커몹은 base.hp*mul*배율로 기존과 동치
        arenaHpMul: ad.hpMul * (1 + arenaState.wave * 0.25),
        arenaDmgMul: 0.8 + ad.hpMul * 0.25,
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
    { name: '바다 마녀', kind: 'tall', color: 0x6a3a8a, hp: 400, dmg: 22, xp: 100, coins: 95, speed: 2.6, scale: 1.05, weight: 8, minLv: 12, books: ['looting'], drops: [{ key: 'potion_healing', n: 1, chance: 0.3 }, { key: 'spider_eye', n: 3 }] },
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
      if (m.label) { const _ld = Math.hypot(P.x - m.mesh.position.x, P.z - m.mesh.position.z); m.label.visible = _ld < NAMETAG_DIST; }   // V113: 근거리만 이름표
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
      // V24-E(감사 #25): 원거리 디스폰 — 128칸 밖 일반 몹은 조용히 제거(스포너가 밀도 유지, 보스/아레나/고스트 제외)
      if (distP > 128 && !m.isBoss && !m.arena && !m.ghost && !(m.def && (m.def.miniboss || m.def.hellBoss)) && worldMode !== 'dungeon') {
        m.dead = true; scene.remove(m.mesh); disposeGroup(m.mesh);
        const _mi = mobs.indexOf(m); if (_mi >= 0) mobs.splice(_mi, 1);
        continue;
      }
      if (distP > 70) continue;   // 먼 몹은 AI 정지(대형 허브 성능)
      const aggro = m.def.passive ? -1 : (m.elite ? 14 : 10);
      if (aggro > 0 && distP < aggro && Math.abs(P.y - mp.y) < 4) m.state = 'chase';
      else if (m.state !== 'flee' && distP > aggro * 2) m.state = 'wander';
      // V24-D(감사 #26): 소극적 몹은 맞으면 도망(패닉 질주) — 기존엔 오히려 다가옴
      if (m.state === 'flee') {
        m._fleeT = (m._fleeT || 0) - dt;
        if (m._fleeT <= 0 || distP > 24) m.state = 'wander';
      }
      let mvx = 0, mvz = 0;
      if (m.state === 'flee' && distP > 0.1) { mvx = -dx / distP; mvz = -dz / distP; m.walkT += dt * 5; }
      else if (m.state === 'chase') {
        const reach = 2.0 * Math.max(1, ((m.def && m.def.scale) || 1) * 0.85);   // V27-A: 공격 사거리 = MC ~2블럭, 대형 몹은 몸집만큼
        if (distP > reach * 0.75) { mvx = dx / distP; mvz = dz / distP; }
        m.atkCd -= dt;
        if (distP < reach && Math.abs(P.y - mp.y) < 3 && m.atkCd <= 0) {
          // V24-B: 시야선 검사 — 벽 너머/바닥 관통 공격 방지
          let blocked = false;
          for (let si = 1; si <= 3; si++) {
            const t = si / 4;
            const sx = mp.x + (P.x - mp.x) * t, sy = (mp.y + 1) + ((P.y + 1.2) - (mp.y + 1)) * t, sz = mp.z + (P.z - mp.z) * t;
            const sb = BLOCKS[getBlockLocal(Math.floor(sx), Math.floor(sy), Math.floor(sz))];
            if (sb && sb.solid && sb.opaque) { blocked = true; break; }
          }
          if (blocked) { m.atkCd = 0.4; continue; }
          m.atkCd = 1.3;
          const defPct = api.defensePct ? api.defensePct(php && php.hp <= php.max * 0.3) : 0;
          const dealt = m.dmg * (0.85 + Math.random() * 0.3) * (1 - defPct);
          damagePlayer(dealt);
          // V24: 넉백(실제 MC) — 몹 반대 방향으로 밀려나고 살짝 뜬다
          const kd = Math.max(0.001, distP); P._kbx = (P.x - mp.x) / kd * 5.2; P._kbz = (P.z - mp.z) / kd * 5.2;   // V27-A: 1회성 임펄스 기준 ~1.5블럭(MC)
          if (P.onGround) P.vy = Math.max(P.vy, 4.6);
          const th = (api.traitSum ? api.traitSum('thorns') : 0) + (api.enchThornsPct ? api.enchThornsPct() * 100 : 0);   // V22-K: 가시 — 특성 + 방어구 인챈트 합산 반사
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
      // V24: 몹 넉백 — 플레이어 타격 시 부여된 잔류 속도(지수 감쇠)
      let kbdx = 0, kbdz = 0;
      if (m._kbx || m._kbz) {
        kbdx = m._kbx * dt; kbdz = m._kbz * dt;
        const dec = Math.max(0, 1 - dt * 6);
        m._kbx *= dec; m._kbz *= dec;
        if (Math.abs(m._kbx) < 0.1 && Math.abs(m._kbz) < 0.1) m._kbx = m._kbz = 0;
      }
      if (mvx || mvz || kbdx || kbdz) {
        const sp = m.def.speed * (m.state === 'chase' ? 1 : m.state === 'flee' ? 1.3 : 0.5);   // V24-D: 도망은 패닉 질주
        const nx = mp.x + mvx * sp * dt + kbdx, nz = mp.z + mvz * sp * dt + kbdz;
        if (m.def.fly) {   // 가스트: 부유 비행(지면 +5~7 유지)
          const gy = groundBelow(Math.floor(nx), Math.floor(nz), 44) + 5.5 + Math.sin(m.walkT * 0.7) * 1.2;
          mp.x = nx; mp.z = nz; mp.y += (gy - mp.y) * Math.min(1, dt * 2);
        } else {
        let ny = groundBelow(Math.floor(nx), Math.floor(nz), mp.y + 1.8);
        const floorOk = solidAt(Math.floor(nx), Math.floor(ny - 0.05), Math.floor(nz));
        if (floorOk) {   // V27-A: 지지 블럭의 실제 충돌 높이(울타리/담장 1.5) — 펜스를 1블럭 계단처럼 뛰어넘던 탈출 버그 방지
          const sbb = BLOCKS[getBlockLocal(Math.floor(nx), Math.floor(ny - 0.05), Math.floor(nz))];
          if (sbb) { const bxs = blockLocalBoxes(sbb, Math.floor(nx), Math.floor(ny - 0.05), Math.floor(nz), false); for (const bx of bxs) if (bx.y1 > ny) ny = bx.y1; }
        }
        // V27-A: 몸통 클리어런스(2칸 공기) — 창틀/벽을 통과해 걸어다니던 버그 방지
        const bodyClear = !solidAt(Math.floor(nx), Math.floor(ny + 0.05), Math.floor(nz)) && !solidAt(Math.floor(nx), Math.floor(ny + 1.05), Math.floor(nz));
        if (floorOk && bodyClear && ny - mp.y < 1.05 && ny - mp.y > -6 && ny > 2) { mp.x = nx; mp.z = nz; mp.y += (ny - mp.y) * Math.min(1, dt * 8); }
        else if ((kbdx || kbdz) && ny > 2) { mp.x = nx; mp.z = nz; mp.y += (ny - mp.y) * Math.min(1, dt * 6); }   // V24-E(#10): 넉백은 절벽 아래로도 밀려남
        else if ((kbdx || kbdz) && ny <= 2) {   // 공허로 밀려 떨어짐 — 조용히 제거(보상 없음, MC 공허사)
          m.dead = true; scene.remove(m.mesh); disposeGroup(m.mesh);
          const _mi2 = mobs.indexOf(m); if (_mi2 >= 0) mobs.splice(_mi2, 1);
          continue;
        }
        }
        if (mvx || mvz) m.mesh.rotation.y = Math.atan2(mvx, mvz);   // V24: 넉백만 있을 땐 방향 유지
        m.walkT += dt * 7;
        const sw = Math.sin(m.walkT) * 0.5;
        if (m.legL) { m.legL.rotation.x = sw; m.legR.rotation.x = -sw; }
        for (let li = 0; li < m.legs.length; li++) m.legs[li].rotation.x = (li % 2 ? sw : -sw);
      }
      // 블레이즈 막대 공전 + 드래곤 날개 퍼덕임(항상)
      if (m._hitFx > 0) { m._hitFx -= dt; const pu = 1 + Math.max(0, m._hitFx) * 0.9; m.mesh.scale.setScalar(((m.def && m.def.scale) || 1) * pu); }
      m.walkT += dt * 2;
      if (m.rods) for (let ri = 0; ri < m.rods.length; ri++) { const a = m.walkT * 1.5 + ri / 6 * Math.PI * 2; m.rods[ri].position.x = Math.cos(a) * 0.55; m.rods[ri].position.z = Math.sin(a) * 0.55; }
      if (m.wings) { const fl = Math.sin(m.walkT * 3) * 0.5; m.wings[0].rotation.z = fl; m.wings[1].rotation.z = -fl; }
      if (m.auraRing) { const pu = 1 + Math.sin(m.walkT * 2.2) * 0.12; m.auraRing.scale.setScalar(pu); m.auraRing.rotation.z += dt * 1.2; }
    }
  }
  // 시선 광선으로 몬스터 조준(가까운 순)
  function pickMob() {
    const d = lookDir(); let best = null, bestAlong = 3.8;
    for (const m of mobs) {
      if (m.dead) continue;
      const mp = m.mesh.position;
      const sc = (m.def && m.def.scale) || 1;   // V22-K: 몹 크기에 맞춘 조준 판정(큰 몹=큰 히트박스, 작은 몹=낮은 중심점)
      const vx = mp.x - P.x, vy = (mp.y + 1.0 * sc) - (P.y + P.eye), vz = mp.z - P.z;
      const along = vx * d.x + vy * d.y + vz * d.z;
      if (along < 0.2 || along > 3.8) continue;
      const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
      const rad = (m.def && m.def.miniboss ? 2.0 : m.elite ? 1.2 : 0.95) * Math.max(0.55, Math.min(1.8, sc));
      if (Math.hypot(px, py, pz) < rad && along < bestAlong) { best = m; bestAlong = along; }
    }
    return best;
  }
  function attackMobHit(m) {
    triggerFpSwing();   // V153: 1인칭 팔 스윙
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
    const heldK = (api.getP && api.getP() && api.getP().hotbar) ? api.getP().hotbar[selectedHotbar] : null;   // V27-A: 손에 든 도구의 바닐라 공격력 반영
    const r = api.attackMob({ hitIdx: m.hitIdx, hp: m.hp, maxHp: m.maxHp, isBoss: isBossGrade, mobType: m.type, phpPct: php ? php.hp / php.max : 1, heldKey: heldK });
    m.hitIdx++;
    m.hp -= r.dmg;
    m._hitFx = 0.15;   // V24-B: 피격 반응(스케일 펀치)
    if (m.def && m.def.passive) { m.state = 'flee'; m._fleeT = 4; }   // V24-D: 동물은 도망
    if (php && r.heal) { php.hp = Math.min(php.max, php.hp + r.heal); }
    // V147: 광포 이산 추가타 — 실제 스블처럼 타격 수만큼 개별 데미지 스플래시(각 타=원타 복제)
    if (r.hits > 1 && r.hitDmg != null) { for (let h = 0; h < Math.min(r.hits, 6); h++) spawnDmgText(m.mesh.position, r.hitDmg, r.crit); }
    else spawnDmgText(m.mesh.position, r.dmg, r.crit);
    if (r.crit) spawnCritParticles(m.mesh.position);   // V27-E: MC 크리티컬 별(particle/critical_hit.png)
    // V24: 넉백 — 순간이동식(0.7블럭 즉시) 대신 실제 MC처럼 밀려나는 관성(감쇠 속도)
    const dx = m.mesh.position.x - P.x, dz = m.mesh.position.z - P.z; const l = Math.hypot(dx, dz) || 1;
    const kbPow = m.def && (m.def.miniboss || m.def.hellBoss || m.isBoss) ? 2.5 : 6.5;   // 보스급은 덜 밀림
    m._kbx = (m._kbx || 0) + dx / l * kbPow; m._kbz = (m._kbz || 0) + dz / l * kbPow;
    if (!(m.def && m.def.passive)) m.state = 'chase';
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
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 48;
    const c = cv.getContext('2d'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${crit ? 30 : 22}px "Minecraft", sans-serif`;
    const txt = Math.round(dmg).toLocaleString('en-US');
    // V126: 실제 스블 데미지 스플래시 — 크리는 흰→노랑→금→빨강 그라디언트, 일반은 회색. 검정 외곽
    if (crit) { const w = c.measureText(txt).width; const g = c.createLinearGradient(80 - w / 2, 0, 80 + w / 2, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#ffff55'); g.addColorStop(0.72, '#ffaa00'); g.addColorStop(1, '#ff5555'); c.fillStyle = g; }
    else c.fillStyle = '#c0c0c0';
    c.strokeStyle = '#000'; c.lineWidth = 4; c.lineJoin = 'round';
    c.strokeText(txt, 80, 26); c.fillText(txt, 80, 26);
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
  let _hurtT = 0;   // V24: 피격 붉은 플래시 타이머
  function damagePlayer(dmg) {
    if (!php) return;
    if (performance.now() - (P._lastDmgAt || 0) < 500) return;   // V24-B: 무적 프레임 0.5초(다중 몹 중첩 타격 방지, 바닐라)
    P._lastDmgAt = performance.now();
    const apiG = econApi();
    if (apiG.guardPct) dmg *= (1 - apiG.guardPct());   // V11: 수호 특성(받는 피해 감소)
    php.hp -= dmg; php.lastHitAt = performance.now();
    _hurtT = 0.4;   // V24: 화면 붉은 플래시(맞았다는 확실한 피드백) — V126: 자기 피해 플로팅 숫자 제거(실제 MC엔 없음, 붉은 비네트만)
    if (php.hp <= 0) {
      const api = econApi();
      if (api.playerDied) api.playerDied();
      php.hp = php.max;
      php.lastHitAt = 0;   // V22-K: 사망 후 재생 타이머 초기화(구 타임스탬프 잔존 버그)
      P._fallPeak = null; P._air = 0; P._lavaT = 0;
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
      const rg = (api.traitSum ? api.traitSum('regeneration') : 0) + (api.buffBonus ? api.buffBonus('hpRegen') : 0);   // V42: 재생 물약
      if (rg > 0 && php.hp < php.max) { php.hp = Math.min(php.max, php.hp + rg); updateHpHud(); }
    }
  }
  let _hpHudT = 0;
  // V19-C: 터치 가상 조이스틱 시각 표시 — 손가락 드래그를 따라 노브 이동, 손 떼면 중앙 복귀. 힌트는 8초 후 페이드.
  let _joyHintT = 0;
  // V141: 실제 MC 보스 체력바(상단 중앙, boss_bar 스프라이트) — 보스/드래곤/정예/초고체력 몹 활성 시
  // V143: 스블 브루 키 → 실제 MC mob_effect 텍스처. 바닐라 효과가 없는 커스텀 효과(마나/치명/궁술/경험/기절/넉백/연소 등)는 프레임만.
  const EFFECT_TEX = { speed: 'speed', strength: 'strength', healing: 'instant_health', regeneration: 'regeneration', haste: 'haste', rabbit: 'jump_boost', night_vision: 'night_vision', water_breathing: 'water_breathing', resistance: 'resistance', absorption: 'absorption', magic_find: 'luck', venomous: 'poison', dodge: 'speed' };
  const _ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const roman = n => _ROMAN[n] || String(n);
  function updateBossBar() {
    const el = document.getElementById('econ3dBossBar'); if (!el) return;
    let boss = null, bd = 1e9;
    for (const m of mobs) {
      if (m.dead) continue;
      const isB = m.isBoss || (m.def && m.def.kind === 'dragon') || m.elite || m.maxHp >= 100000;
      if (!isB) continue;
      const d = Math.hypot(P.x - m.mesh.position.x, P.z - m.mesh.position.z);
      if (d < 70 && d < bd) { bd = d; boss = m; }
    }
    if (!boss) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'block';
    const ab = n => { n = Math.max(0, Math.ceil(n)); if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e4) return Math.round(n / 1e3) + 'k'; return n.toLocaleString('en-US'); };
    const nm = document.getElementById('econ3dBossName'), fill = document.getElementById('econ3dBossFill');
    if (nm) nm.textContent = `${boss.def.name}  ${ab(boss.hp)}/${ab(boss.maxHp)}`;
    if (fill) fill.style.width = Math.max(0, Math.min(100, boss.hp / boss.maxHp * 100)) + '%';
  }
  function updateHpHud() {
    const bar = document.getElementById('econ3dHpFill'), txt = document.getElementById('econ3dHpTxt');
    if (bar && php) bar.style.width = Math.max(0, php.hp / php.max * 100) + '%';
    if (txt && php) txt.textContent = `❤ ${Math.max(0, Math.ceil(php.hp))}/${php.max}`;
    updateBossBar();
    // 핫바 위 스탯(실제 스카이블럭 액션바): 체력/방어/마나/속도 — 나머지는 메뉴에서
    const row = document.getElementById('econ3dStats');
    const api = econApi();
    if (row && api.hudStats) {
      const st = api.hudStats();
      const curHp = php ? Math.max(0, Math.ceil(php.hp)) : st.hp;
      // V126: 실제 스카이블럭 액션바 = 체력/방어/마나 3구획만(속도·물약 표기 제거 — 실제엔 없음)
      row.innerHTML = `<span class="ab ab-hp">${curHp}/${st.hp}<b>❤</b></span>`
        + `<span class="ab ab-def">${st.def}<b>❈</b> Defense</span>`
        + `<span class="ab ab-mana">${st.mana}/${st.mana}<b>✎</b> Mana</span>`;
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
      const py = portalOpenY(portal);
      interactables.push({ type: 'portal', ref: portal, x: portal.x + 1.0, y: py + 1.2, z: portal.z + 0.5 });   // V23-A: 개구부 중심(x+1.0, 가슴 높이)으로 정렬
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
    h.group.add(tag); h.tag = tag;   // V113: 근거리 이름표 컬링용 참조
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
      if (o.tag) o.tag.visible = Math.hypot(P.x - o.mesh.position.x, P.z - o.mesh.position.z) < 32;   // V113: 근거리 플레이어 이름표만(MC 32칸)
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
    gathering = false; mouseHeld = false; useHeld = false; breaking = null;   // V12-D: 패널 열면 채집/파괴 중단(화면 전환 시 계속 캐지는 버그 수정)
  }
  function hidePanel() { const wrap = document.getElementById('econ3dPanelWrap'); if (wrap) { wrap.style.display = 'none'; wrap.classList.remove('mc-invmode'); } const scr = document.querySelector('.econ3d-screen'); if (scr) scr.classList.remove('mc-invopen'); updateBuildHud(); updateHotbar(); }   // V121: 닫을 때 인벤토리 모드 클래스 해제(게임 HUD 복원)

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
        // V26-B: 윤곽선을 실제 히트박스(셰이프 박스 합집합)에 맞춤 — 꽃/문/반블럭이 정육면체로 보이던 문제
        const bb = BLOCKS[b.id];
        const boxes = bb && bb.cross
          ? [{ x0: b.x + 0.3, y0: b.y, z0: b.z + 0.3, x1: b.x + 0.7, y1: b.y + 0.7, z1: b.z + 0.7 }]   // V26-B: 꽃/횃불은 MC식 소형 선택 박스
          : blockLocalBoxes(bb, b.x, b.y, b.z, true);
        if (boxes.length) {
          let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
          for (const bx of boxes) { x0 = Math.min(x0, bx.x0); y0 = Math.min(y0, bx.y0); z0 = Math.min(z0, bx.z0); x1 = Math.max(x1, bx.x1); y1 = Math.max(y1, bx.y1); z1 = Math.max(z1, bx.z1); }
          outlineMesh.visible = true;
          outlineMesh.scale.set((x1 - x0) + 0.01, (y1 - y0) + 0.01, (z1 - z0) + 0.01);
          outlineMesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        } else {
          outlineMesh.visible = true; outlineMesh.scale.set(1.01, 1.01, 1.01);
          outlineMesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
        }
        if (cross) cross.classList.add('is-active');
        return;
      }
    }
    if (outlineMesh) outlineMesh.visible = false;
    if (cross) cross.classList.remove('is-active');
  }

  // V28-B: 개별 드롭 시스템용 — 몹 타입 목록(순서 고정)과 이름 노출
  if (typeof window !== 'undefined') {
    window.economy3dMobTypes = () => Object.keys(MOB_TYPES);
    window.economy3dHeal = (n) => { if (php) { php.hp = Math.min(php.max, php.hp + n); updateHpHud(); } };   // V42: 치유 물약
    window.economy3dHpPct = () => (php ? Math.max(0, php.hp / php.max) : 1);   // V43: 지배(풀피) 판정
    window.economy3dMobName = t => (MOB_TYPES[t] || {}).name || t;
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
  // V27-B: 월드별 고정 시간대에 맞는 천체 배치(environment/sun.png·moon_phases.png·clouds.png·end_sky.png)
  // V27-D: 월드별 고정 시간대의 천체 '방향'(정규화 전) — 씬에 실제로 떠 있어 화면을 돌리면 함께 돈다(MC 동일)
  const WORLD_CELESTIAL = {
    hub: { kind: 'sun', dir: [0.35, 0.85, 0.2] }, home: { kind: 'sun', dir: [0.35, 0.85, 0.2] }, visit: { kind: 'sun', dir: [0.35, 0.85, 0.2] },
    barn: { kind: 'sun', dir: [-0.45, 0.75, 0.3] }, park: { kind: 'sun', dir: [0.5, 0.8, -0.25] },
    gold: { kind: 'sun', dir: [-0.75, 0.42, 0.25] }, mushroom: { kind: 'sun', dir: [0.85, 0.28, 0.1] },
    spider: { kind: 'moon', dir: [0.3, 0.8, -0.3] }, dungeonhub: { kind: 'moon', dir: [-0.4, 0.85, 0.2] },
    end: { kind: 'endsky' },
  };
  let _celGroup = null, _celSun = null, _celClouds = null, _celMode = null;
  const _celTexCache = {};
  function _celTex(src) {
    if (_celTexCache[src]) return _celTexCache[src];
    const t = new THREE.TextureLoader().load(src);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return (_celTexCache[src] = t);
  }
  function buildCelestials3d() {
    if (_celMode === worldMode || !scene) return;
    _celMode = worldMode;
    if (_celGroup) { scene.remove(_celGroup); _celGroup = null; _celSun = null; _celClouds = null; }
    const cel = WORLD_CELESTIAL[worldMode];
    if (!cel || cel.kind === 'endsky') return;
    _celGroup = new THREE.Group();
    // 해/달 — MC 크기감(시야각 약 8~9도), 가산 블렌딩으로 검정 배경 제거, 안개 미적용
    const tex = _celTex(cel.kind === 'sun' ? 'environment/sun.png' : 'environment/moon_phases.png');
    if (cel.kind === 'moon') { tex.repeat.set(0.25, 0.5); tex.offset.set(0, 0.5); }   // 4×2 시트의 보름달 셀
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    _celSun = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), mat);
    _celSun.userData.dir = new THREE.Vector3(cel.dir[0], cel.dir[1], cel.dir[2]).normalize();
    _celSun.renderOrder = -2;
    _celGroup.add(_celSun);
    // 구름층 — MC처럼 하늘 높이(y≈108)에 수평 평면으로 떠서 흐른다(화면 고정 밴드 아님)
    if (cel.kind === 'sun') {
      const ct = _celTex('environment/clouds.png');
      // MC 실측: 구름 텍스처 1픽셀 = 12블럭 → 256px 시트가 3072블럭을 덮는다(반복 1). 과밀 픽셀 노이즈 방지.
      ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(1, 1);
      const cmat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide });
      _celClouds = new THREE.Mesh(new THREE.PlaneGeometry(3072, 3072), cmat);
      _celClouds.rotation.x = -Math.PI / 2;
      _celClouds.position.y = 108;
      _celClouds.renderOrder = -1;
      _celGroup.add(_celClouds);
    }
    scene.add(_celGroup);
  }
  function tickCelestials(dt) {
    if (!_celGroup) return;
    if (_celSun) {
      const d = _celSun.userData.dir;
      _celSun.position.set(P.x + d.x * 380, P.y + d.y * 380, P.z + d.z * 380);
      _celSun.lookAt(P.x, P.y, P.z);
    }
    if (_celClouds) {
      _celClouds.position.x = P.x; _celClouds.position.z = P.z;
      const m = _celClouds.material.map; if (m) m.offset.x = (m.offset.x + dt * 0.0004) % 1;   // 천천히 흐름(MC)
    }
    // V31-B: 네더 포탈 텍스처 프레임 순환(세로 스트립)
    if (portalMarker && portalMarker.userData.fill && portalMarker.userData.fill.userData.portalAnim) {
      const m2 = portalMarker.userData.fill.material.map;
      if (m2 && m2.image && m2.image.height > m2.image.width) {
        const frames = Math.floor(m2.image.height / m2.image.width);
        m2.repeat.set(1, 1 / frames);
        m2.offset.y = 1 - ((Math.floor(performance.now() / 90) % frames) + 1) / frames;
      }
    }
  }
  // V33-A: 같은 허브라도 구역마다 시간대가 다르다(실제 스블 감성) — 묘지=보랏빛 황혼, 광산=흐린 회색,
  //   설산=차고 쨍한 정오, 농장=따뜻한 아침 금빛, 숲=녹음 한낮, 폐허=호박색 저녁, 던전 입구=어스름
  const HUB_ZONE_AMBIENCE = {
    village:  { light: 1.00, sky: ['#3f7fc8', '#76adde', '#bfe0f5'], fog: '#9fc6ea' },
    snowpeak: { light: 1.05, sky: ['#2f6fc0', '#8ec2ea', '#e8f4fc'], fog: '#cfe6f5' },
    coalmine: { light: 0.78, sky: ['#5a6470', '#8a929c', '#b8bec6'], fog: '#9aa0a8' },
    graveyard:{ light: 0.60, sky: ['#2a2340', '#4a3a5e', '#7a5a78'], fog: '#584a66' },
    farm:     { light: 0.96, sky: ['#c8903f', '#e0b46a', '#f4dca8'], fog: '#e0c490' },
    forest:   { light: 0.90, sky: ['#2f6a48', '#5f9a6e', '#a8d0a0'], fog: '#8ab890' },
    pond:     { light: 0.92, sky: ['#3a7ab8', '#6aaad0', '#b8dcE8'.toLowerCase()], fog: '#98c8dc' },
    arena:    { light: 1.02, sky: ['#b06a2f', '#d0904f', '#ecc890'], fog: '#d8b080' },
    wizard:   { light: 0.82, sky: ['#3a2a5e', '#6a4a9e', '#a87ad0'], fog: '#7a5aa8' },
    ruins:    { light: 0.72, sky: ['#6a4a2a', '#9a7a4a', '#d0b080'], fog: '#a8906a' },
    dungeonentrance: { light: 0.62, sky: ['#1a2030', '#2c3850', '#4a5878'], fog: '#38445c' },
    wild:     { light: 0.95, sky: ['#3f7fc8', '#76adde', '#bfe0f5'], fog: '#9fc6ea' },
  };
  let _zoneAmbCur = null, _zoneAmbT = 0;
  function tickZoneAmbience(dt) {
    if (worldMode && window.econApi && window.econApi.markZoneVisited) window.econApi.markZoneVisited('world:' + worldMode);   // V40: 탐험가 — 현재 월드도 방문 기록
    if (worldMode !== 'hub' || !scene) return;
    _zoneAmbT -= dt; if (_zoneAmbT > 0) return; _zoneAmbT = 0.25;   // 0.25초마다 갱신
    const zk = zoneAt(Math.floor(P.x), Math.floor(P.z)) || 'wild';
    if (window.econApi && window.econApi.markZoneVisited) window.econApi.markZoneVisited('hub:' + zk);   // V40: 탐험가 퀘스트
    const tgt = HUB_ZONE_AMBIENCE[zk] || HUB_ZONE_AMBIENCE.wild;
    if (!_zoneAmbCur) _zoneAmbCur = { light: tgt.light, sky: tgt.sky.slice(), fog: tgt.fog };
    const k = 0.18;   // 지수 보간(부드러운 전환)
    const mix2 = (a, b) => mixHex(a, b, k);
    _zoneAmbCur.light += (tgt.light - _zoneAmbCur.light) * k;
    for (let i = 0; i < 3; i++) _zoneAmbCur.sky[i] = rgbToHex(mix2(_zoneAmbCur.sky[i], tgt.sky[i]));
    _zoneAmbCur.fog = rgbToHex(mix2(_zoneAmbCur.fog, tgt.fog));
    if (scene.fog) scene.fog.color.set(_zoneAmbCur.fog);
    const el = document.getElementById('econ3dSky');
    if (el) el.style.background = `linear-gradient(${_zoneAmbCur.sky[0]} 0%, ${_zoneAmbCur.sky[1]} 55%, ${_zoneAmbCur.sky[2]} 100%)`;
    const nv = Math.max(0.6, Math.min(1.05, _zoneAmbCur.light));
    if (blockMat) blockMat.color.setScalar(nv);
    if (waterMat) waterMat.color.setScalar(nv);
    if (plantMat) plantMat.color.setScalar(nv);
  }
  function rgbToHex(rgb) {   // 'rgb(r,g,b)' → '#rrggbb'
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb); if (!m) return rgb;
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  }
  function worldAmbience() { return WORLD_AMBIENCE[worldMode] || WORLD_AMBIENCE.hub; }
  function dayFactor() { return worldAmbience().light; }
  let _lastSkyKey = '';
  function updateSky() {
    if (_lastSkyKey === worldMode) return;
    _lastSkyKey = worldMode;
    const A = worldAmbience();
    if (scene.fog) scene.fog.color.set(A.fog);
    const el = document.getElementById('econ3dSky');
    if (el) {
      el.style.background = `linear-gradient(${A.sky[0]} 0%, ${A.sky[1]} 55%, ${A.sky[2]} 100%)`;
      const cel = WORLD_CELESTIAL[worldMode];
      if (cel && cel.kind === 'endsky') { el.style.background = `#0c0714 url('environment/end_sky.png') repeat`; el.style.backgroundSize = '256px'; }
      el.innerHTML = '';
    }
    buildCelestials3d();   // V27-D: 해/달/구름은 씬 안의 천체(화면 고정 아님)
    const nv = Math.max(0.6, A.light);   // V20-U: 밝기 하한 완화 → 어두운 섬(딥/엔드/네더)이 실제로 무겁고 고유한 분위기
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
      if (el && name) { el.innerHTML = `<div class="b-title">${name}</div><div class="b-sub">⏣ ${SB_LOC[worldMode] || 'SkyBlock'}</div>`; el.classList.add('show'); bannerT = 2.6; }   // V129: 실제 MC 타이틀+서브타이틀 2줄
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
    // V24-E(감사 #18): NPC는 허브에서만 + 적대 몹(주황)/동물(흰)/포탈(초록)/워프패드(청록) 마커
    if (worldMode === 'hub') { c.fillStyle = '#ffd700'; NPCS.forEach(n => c.fillRect(n.x / W * s - 1, n.z / Dp * s - 1, 2, 2)); }
    for (const mb of mobs) { if (mb.dead) continue; const q = mb.mesh.position; c.fillStyle = mb.def && mb.def.passive ? '#ffffff' : '#ff8820'; c.fillRect(q.x / W * s - 1, q.z / Dp * s - 1, 2, 2); }
    const pt = PORTALS[worldMode];
    if (pt) { c.fillStyle = '#35e07a'; c.fillRect((pt.x + 1) / W * s - 2, pt.z / Dp * s - 2, 4, 4); }
    c.fillStyle = '#3ad9e0';
    for (const wp of (WARPS[worldMode] || [])) c.fillRect(wp.x / W * s - 2, wp.z / Dp * s - 2, 4, 4);
    const pxx = P.x / W * s, pzz = P.z / Dp * s;
    c.fillStyle = '#ff3333'; c.beginPath(); c.arc(pxx, pzz, 3, 0, Math.PI * 2); c.fill();
    const d = lookDir();
    c.strokeStyle = '#ff3333'; c.beginPath(); c.moveTo(pxx, pzz); c.lineTo(pxx + d.x * 8, pzz + d.z * 8); c.stroke();
  }
  // V26: 조준 대상별 상호작용 안내 멘트(십자선 아래) — 실제 게임처럼 '[E] 대화' 등
  let _promptT = 0, _promptLast = '';
  function updatePrompt(dt) {
    _promptT += dt; if (_promptT < 0.15) return; _promptT = 0;
    const el = document.getElementById('econ3dPrompt'); if (!el) return;
    let msg = '';
    const t = currentAim();
    if (t) {
      if (t.type === 'npc' || t.type === 'questnpc') msg = '💬 [E] 또는 클릭 — 대화';
      else if (t.type === 'portal') msg = '🌀 들어가면 1초 뒤 자동 이동 · [E] 즉시 이동';
      else if (t.type === 'minion') msg = '⚙️ [E] — 미니언 회수/관리';
      else if (t.type === 'fairy') msg = '✨ [E] — 요정의 소울 수집';
      else if (t.type === 'node') msg = '⛏️ 좌클릭 꾹 — 채집';
      else if (t.type === 'arachneAltar') msg = '🕷️ [E] — 아라크네 소환';
      else msg = '[E] — 상호작용';
    } else {
      const tb = raycastBlock();
      if (tb) {
        const bk = BLOCKS[tb.id] ? BLOCKS[tb.id].key : '';
        if (bk === 'crafting_table') msg = '⚒️ [우클릭] — 제작대';
        else if (bk === 'furnace') msg = '🔥 [우클릭] — 화로 제련';
        else if (bk === 'chest') msg = '📦 [우클릭] — 상자 열기';
        else if (BLOCKS[tb.id] && BLOCKS[tb.id].shape === 'door') msg = '🚪 [우클릭] — 문 여닫기';
        else if (BLOCKS[tb.id] && BLOCKS[tb.id].shape === 'bed') msg = '🛏️ [우클릭] — 수면(회복)';
        else if (bk.indexOf('portal_') === 0) msg = '🌀 [우클릭] — 워프';
        else if (worldMode === 'park' && (bk === 'oak_fence' || bk === 'glowstone') && parkGateAt(tb.x, tb.z) >= 0) msg = '🚧 [우클릭] — 게이트 개방 시도';
      }
    }
    if (msg !== _promptLast) { _promptLast = msg; el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  }
  // V117: 실제 스카이블럭식 아이템 획득 채팅 피드(좌측 하단) — "+N 아이템"이 쌓였다 서서히 사라짐
  function chatFeed(html) {
    const el = document.getElementById('econ3dChat'); if (!el) return;
    const line = document.createElement('div'); line.className = 'econ3d-chatline'; line.innerHTML = html;
    el.appendChild(line);
    while (el.children.length > 10) el.removeChild(el.firstChild);
    setTimeout(() => { line.classList.add('fade'); setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 900); }, 7000);
  }
  window.economy3dChat = chatFeed;
  // V124: 실제 하이픽셀 스카이블럭 우측 스코어보드 — 영어 + 바닐라 스코어보드 스타일(폰트 균일)
  const SB_LOC = { hub: 'Hub', home: 'Private Island', visit: "Friend's Island", park: 'The Park', barn: 'The Barn', gold: 'Gold Mine', deep: 'Deep Caverns', spider: "Spider's Den", nether: 'Blazing Fortress', end: 'The End', mushroom: 'Mushroom Desert', dungeon: 'The Catacombs' };
  function sbTimeStr() {
    const frac = (((worldTime % DAY_LEN) + DAY_LEN) % DAY_LEN) / DAY_LEN;
    const totalMin = ((frac * 1440) + 360) % 1440;   // worldTime 0.25=정오 기준
    let h = Math.floor(totalMin / 60); let m = Math.floor((totalMin % 60) / 10) * 10;   // 스블처럼 10분 단위
    const icon = (h >= 6 && h < 18) ? '☀' : '☽';
    const ap = h < 12 ? 'am' : 'pm'; let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${icon} ${h12}:${String(m).padStart(2, '0')}${ap}`;
  }
  // 실제 스블 달력: 1 스블일=20 실분(=DAY_LEN), 1달=31일, 12달(계절)
  const SB_MONTHS = ['Early Spring', 'Spring', 'Late Spring', 'Early Summer', 'Summer', 'Late Summer', 'Early Autumn', 'Autumn', 'Late Autumn', 'Early Winter', 'Winter', 'Late Winter'];
  function sbDateStr() {
    const day = Math.floor((Date.now() / 1000) / 1200);   // 총 스블 일수(20분/일)
    const dom = (day % 31) + 1;
    const mon = SB_MONTHS[Math.floor(day / 31) % 12];
    const suf = (dom % 10 === 1 && dom !== 11) ? 'st' : (dom % 10 === 2 && dom !== 12) ? 'nd' : (dom % 10 === 3 && dom !== 13) ? 'rd' : 'th';
    return `${mon} ${dom}${suf}`;
  }
  function updateScoreboard() {
    const el = document.getElementById('econ3dScoreboard'); if (!el) return;
    const P0 = econApi().getP(); if (!P0) return;
    const loc = SB_LOC[worldMode] || 'SkyBlock';
    // V145: 실제 하이픽셀 스블 스코어보드 순서 — 날짜 → 시간 → 위치 → (공백) → 지갑/은행
    el.innerHTML = `<div class="sb-title">SKYBLOCK</div>`
      + `<div class="sb-gap"></div>`
      + `<div class="sb-line">${sbDateStr()}</div>`
      + `<div class="sb-line">${sbTimeStr()}</div>`
      + `<div class="sb-line sb-loc">⏣ ${loc}</div>`
      + `<div class="sb-gap"></div>`
      + `<div class="sb-line">Purse: <span class="sb-purse">${P0.gold.toLocaleString('en-US')}</span></div>`
      + `<div class="sb-line">Bank: <span class="sb-purse">${(P0.bank || 0).toLocaleString('en-US')}</span></div>`;
  }
  function updateHud() {
    const P0 = econApi().getP(); if (!P0) return;
    updateScoreboard();
    // V133: 우상단 물약 효과 아이콘(실제 MC 버프 표시) — 이름 약어 + 잔여 mm:ss
    const eff = document.getElementById('econ3dEffects');
    if (eff) { const api0 = econApi(); const buffs = api0.activeBuffs ? api0.activeBuffs() : [];
      eff.innerHTML = buffs.slice(0, 7).map(bf => { const t = Math.max(0, bf.left); const mm = Math.floor(t / 60), ss = t % 60; const tex = EFFECT_TEX[bf.key]; const ic = tex ? `<img class="ef-ic" src="mob_effect/${tex}.png" alt="">` : `<span class="ef-ic ef-noic"></span>`; return `<div class="econ3d-eff"><span class="ef-frame">${ic}</span><span class="ef-nm">${(bf.name || '').slice(0, 8)}${bf.lv > 1 ? ' ' + roman(bf.lv) : ''}</span><span class="ef-t">${mm}:${String(ss).padStart(2, '0')}</span></div>`; }).join(''); }
    // V145: 골드/뱅크 표시 = 💰🏦 이모지 → 실제 MC 금괴/금 조각 아이콘(하이픽셀 코인 표현)
    const g = document.getElementById('econ3dGold'); if (g) g.innerHTML = `<img class="econ3d-coin" src="item/gold_nugget.png" alt=""> ${P0.gold.toLocaleString('en-US')}`;
    const pg = document.getElementById('econ3dPanelGold'); if (pg) pg.innerHTML = `<img class="econ3d-coin" src="item/gold_nugget.png" alt=""> ${P0.gold.toLocaleString('en-US')} · <img class="econ3d-coin" src="item/gold_ingot.png" alt=""> ${(P0.bank || 0).toLocaleString('en-US')}`;
    // V24-E(감사 #14): XP 바 — 최근 획득 스킬의 레벨 내 진행도(실제 MC 경험치 바 위치)
    const api2 = econApi();
    if (api2.skillBar) {
      const sb = api2.skillBar();
      const fill = document.getElementById('econ3dXpFill'), txt = document.getElementById('econ3dXpTxt');
      if (fill && sb) { fill.style.width = (sb.need > 0 ? Math.min(100, sb.cur / sb.need * 100) : 100) + '%'; }
      if (txt && sb) { txt.textContent = sb.lv; txt.title = `${sb.name} Lv.${sb.lv}` + (sb.need > 0 ? ` · ${Math.floor(sb.cur)}/${sb.need}` : ' · MAX'); }   // V126: 실제 MC 경험치바 = 초록 레벨 숫자만 중앙
    }
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
      html += '<div class="econ3d-qh-head">진행 중인 퀘스트</div>';
      data.active.slice(0, 4).forEach(a => {
        const pct = Math.max(0, Math.min(100, Math.round(a.cur / a.goal * 100)));
        html += `<div class="econ3d-qh-item"><div class="econ3d-qh-name">${a.name}</div>`
          + `<div class="econ3d-qh-obj">${a.label} <b>${a.cur}/${a.goal}</b></div>`
          + `<div class="econ3d-qh-bar"><i style="width:${pct}%"></i></div></div>`;
      });
    }
    if (data.offer) {
      html += `<div class="econ3d-qh-offer"><div class="econ3d-qh-name"><span class="qh-mark">!</span> ${data.offer.npcName}</div>`
        + `<div class="econ3d-qh-story">${data.offer.story}</div>`
        + `<div class="econ3d-qh-accept">다가가 <b>E</b> (또는 클릭)로 [${data.offer.name}] 수락</div></div>`;
    }
    if (!data.offer && !(data.active && data.active.length) && data.guide) {
      html += `<div class="econ3d-qh-offer"><div class="econ3d-qh-name"><span class="qh-mark">!</span> 새 퀘스트</div>`
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
  // V23-A: 포탈 개구부 바닥(문지방 바로 위 설 수 있는 칸) — 프레임 지붕 때문에 surfaceTop(위→아래 스캔)은
  //   아치 꼭대기를 짚어 이펙트/트리거가 공중에 뜨던 고질 버그의 원인. 아래→위로 '고체 + 위 2칸 공기'를 찾는다.
  function portalOpenY(p) {
    for (let y = 2; y < H - 3; y++) if (solidAt(p.x, y, p.z) && !solidAt(p.x, y + 1, p.z) && !solidAt(p.x, y + 2, p.z)) return y + 1;
    return surfaceTop(p.x, p.z);
  }
  function buildPortalMarker() {
    if (portalMarker) { scene.remove(portalMarker); disposeGroup(portalMarker); portalMarker = null; }
    const p = PORTALS[worldMode];
    if (!p) { buildWarpMarkers(); return; }   // 테마 월드는 포털 대신 워프 패드 마커
    const y = portalOpenY(p);
    const g = new THREE.Group();
    // 포탈 이펙트를 프레임 개구부(가로2×세로3) 안에 정확히 배치. 목적지별 이펙트 색.
    const fillCol = (p.fx != null) ? p.fx : 0xffffff;   // V31-B: 실제 nether_portal.png 위에 목적지 색 틴트
    const ptex = _celTex('resourcepack/nether_portal.png');
    ptex.wrapS = ptex.wrapT = THREE.RepeatWrapping;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 2.86), new THREE.MeshBasicMaterial({ map: ptex, color: fillCol, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    fill.userData.portalAnim = true;
    fill.position.set(p.x + 1.0, y + 1.5, p.z + 0.5);   // V23-A: 개구부 두 칸(x~x+2)의 중심 x+1.0, 바닥 y부터 3칸
    g.add(fill);
    const label = makeLabel(p.label); label.position.set(p.x + 1.0, y + 3.8, p.z + 0.5); g.add(label);
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
      <div id="econ3dTint" style="position:absolute;inset:0;pointer-events:none;display:none;z-index:3"></div>
      <div class="econ3d-cross" id="econ3dCross">+</div>
      <div class="econ3d-prompt" id="econ3dPrompt" style="display:none"></div>
      <div class="econ3d-banner" id="econ3dBanner"></div>
      <div class="econ3d-bossbar" id="econ3dBossBar" style="display:none"><span class="bb-name" id="econ3dBossName"></span><div class="bb-track"><i id="econ3dBossFill"></i></div></div>
      <div class="econ3d-top">
        <div class="econ3d-gold" id="econ3dGold">💰 0G</div>
        <button class="btn btn--ghost" data-act="econ3d_fs" title="전체화면 (Ctrl 달리기 가능)">⛶</button>
        <button class="btn btn--ghost" data-act="backHome">✕</button>
      </div>
      <canvas id="econ3dMap" class="econ3d-map" width="140" height="140" data-act="econ3d_map"></canvas>
      <div class="econ3d-effects" id="econ3dEffects"></div>
      <div class="econ3d-scoreboard" id="econ3dScoreboard"></div>
      <!-- V13-A: 핫바 밑 초록 체력바 제거 — 체력은 핫바 위 스탯 액션바에 표시 -->
      <div class="econ3d-statsrow" id="econ3dStats"></div>
      <div class="econ3d-itemtitle" id="econ3dItemTitle"></div>
      <div class="econ3d-xpbar" id="econ3dXpBar"><i id="econ3dXpFill"></i><span id="econ3dXpTxt"></span></div>
      <div class="econ3d-hotbar" id="econ3dHotbar">${Array.from({ length: 9 }, (_, i) => `<button class="econ3d-slot" data-act="econ3d_hotbar" data-i="${i}" id="econ3dSlot${i}"></button>`).join('')}</div>
      <div class="econ3d-buildbar" id="econ3dBuildBar" style="display:none"></div>
      <div class="econ3d-chat" id="econ3dChat"></div>
      <div class="econ3d-questhud" id="econ3dQuestHud" style="display:none"></div>
      <div class="econ3d-questbanner" id="econ3dQuestBanner" style="display:none"></div>
      ${isTouch ? '<div class="econ3d-jump" data-act="econ3d_jump">⤒</div>' : ''}
      <div class="econ3d-panelwrap" id="econ3dPanelWrap" style="display:none">
        <div id="econBody" class="econ-body econ3d-body"></div>
      </div>
    </section>`;
  }
  function fallbackErr(msg) {
    return `<section class="screen"><header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">💰 경제</b></header>
      <div class="grow center" style="justify-content:center;text-align:center;padding:20px"><p>${msg}</p></div></section>`;
  }
  function resize() { if (!renderer) return; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (viewCam) { viewCam.aspect = w / h; viewCam.updateProjectionMatrix(); } }

  /* ---------------- V153: 1인칭 팔/든 아이템 뷰모델 — 실제 MC처럼 우하단 스티브 팔, 별도 오버레이 패스 ---------------- */
  let viewScene = null, viewCam = null, fpArm = null, fpPivot = null, fpItem = null, _fpKey = undefined, _swingT = 0, _swingActive = false, _vmBobT = 0, _skinTex = null;
  function skinTexture() { if (_skinTex) return _skinTex; _skinTex = new THREE.TextureLoader().load('entity/player/wide/steve.png'); _skinTex.magFilter = THREE.NearestFilter; _skinTex.minFilter = THREE.NearestFilter; return _skinTex; }
  // 스티브 스킨(64×64) 오른팔 UV를 각 면에 매핑
  function skinArmGeo(w, h, d, F) {
    const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const TW = 64, TH = 64;
    ['px', 'nx', 'py', 'ny', 'pz', 'nz'].forEach((k, i) => { const r = F[k]; if (!r) return; const [x0, y0, x1, y1] = r; const u0 = x0 / TW, u1 = x1 / TW, V0 = 1 - y0 / TH, V1 = 1 - y1 / TH; const b = i * 4; uv.setXY(b + 0, u0, V0); uv.setXY(b + 1, u1, V0); uv.setXY(b + 2, u0, V1); uv.setXY(b + 3, u1, V1); });
    uv.needsUpdate = true; return g;
  }
  function initViewmodel() {
    if (viewScene) return;
    viewScene = new THREE.Scene();
    const w = canvas.clientWidth || 1280, h = canvas.clientHeight || 720;
    viewCam = new THREE.PerspectiveCamera(70, w / h, 0.01, 10);
    // 오른팔(클래식 4px) 스킨 UV — 앞44-48/뒤52-56/바깥48-52/안40-44/위44-48 v16-20/아래(손)48-52 v16-20
    const skin = { pz: [44, 20, 48, 32], nz: [52, 20, 56, 32], px: [48, 20, 52, 32], nx: [40, 20, 44, 32], py: [44, 16, 48, 20], ny: [48, 16, 52, 20] };
    fpArm = new THREE.Mesh(skinArmGeo(0.34, 1.05, 0.34, skin), new THREE.MeshBasicMaterial({ map: skinTexture() }));
    fpArm.position.set(0, 0.52, 0); fpArm.rotation.x = Math.PI;   // 피벗(어깨)=우하단, 손끝은 위(중앙)로 — 소매가 코너쪽
    fpPivot = new THREE.Group(); fpPivot.add(fpArm);
    fpPivot.position.set(0.92, -0.95, -1.5);   // 화면 우하단(멀리=작게)
    fpPivot.rotation.set(0.2, -0.1, 0.62);   // 팔이 우하단→중앙 위로 비스듬(실제 MC 1인칭)
    viewScene.add(fpPivot);
  }
  function clearFpItem() { if (fpItem) { fpPivot.remove(fpItem); if (fpItem.geometry) fpItem.geometry.dispose(); if (fpItem.material) { if (fpItem.material.map) fpItem.material.map.dispose(); fpItem.material.dispose(); } fpItem = null; } }
  function buildFpItem(key) {
    clearFpItem();
    if (!key) return;
    const png = (typeof window.econItemPng === 'function') ? window.econItemPng(key) : null;
    const url = png || ((typeof window.econIcon === 'function') ? window.econIcon(key) : null);
    if (!url) return;
    const tex = new THREE.TextureLoader().load(url); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    fpItem = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    fpItem.position.set(-0.12, 0.98, 0.22);   // 손끝(위=중앙쪽)
    fpItem.rotation.set(0.1, -0.3, -0.55);
    fpPivot.add(fpItem);
  }
  function triggerFpSwing() { _swingT = 0; _swingActive = true; }
  function updateViewmodel(dt) {
    if (!viewScene) return;
    const key = activeHotbarKey();
    if (key !== _fpKey) { _fpKey = key; buildFpItem(key); }
    let sx = 0.2, sz = 0.62;
    if (_swingActive) { _swingT += dt; const t = Math.min(1, _swingT / 0.28); const s = Math.sin(t * Math.PI); sx = 0.2 + s * 1.0; sz = 0.62 - s * 0.4; if (_swingT >= 0.28) _swingActive = false; }
    const moving = (Math.abs(P.vx) + Math.abs(P.vz)) > 0.6 && P.onGround;
    _vmBobT += dt * (moving ? 9 : 3);
    const bob = moving ? 0.04 : 0.008;
    if (fpPivot) { fpPivot.rotation.set(sx, -0.1 + Math.sin(_vmBobT) * (moving ? 0.03 : 0.004), sz); fpPivot.position.set(0.92 + Math.cos(_vmBobT) * bob, -0.95 + Math.abs(Math.sin(_vmBobT)) * bob, -1.5); }
  }

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
        if (mouseHeld) {   // V21-A: 포인터 잠금 여부와 무관하게 홀드 중 계속 진행(화면 회전해도 유지, 대상 바뀌면 진행률 리셋)
          const mb2 = pickMob();
          if (mb2 && P._atkCd <= 0) { P._atkCd = 0.45; attackMobHit(mb2); }
          else if (!mb2) { progressBreaking(dt); if (!_swingActive) triggerFpSwing(); }   // V153: 채굴 중 팔 반복 스윙
        }
        if (useHeld && worldMode === 'home' && selectedPlaceKey) {
          useRepeatT -= dt;
          if (useRepeatT <= 0) {
            useRepeatT = 0.22;   // V134: 홀드 연속 설치 ~4.5/초(실제 MC 우클릭 유지 배치 케이던스)
            homePlaceBlock(true);
          }
        }
        if (isTouch && worldMode !== 'visit' && lookT.id !== -1 && !lookT.acted && (lookT.moved || 0) < 10 && performance.now() - lookT.downT > 250) progressBreaking(dt);
        tickMobs(dt); tickFishing(); tickPlayerVitals(dt); tickWarpPads(dt); tickPortalStand(dt); tickPartyDungeonSync(dt);
      }
      tickRegen(); tickFluids(); tickParticles(dt); tickDmgTexts(dt); tickBuildQueue(); tickChunkCulling(dt); tickAdaptiveView(dt); tickFluidAnim(dt); tickCrackOverlay(); tickCelestials(dt); tickArrows(dt); tickZoneAmbience(dt);
      _hpHudT += dt; if (_hpHudT > 0.5) { _hpHudT = 0; updateHpHud(); }
      updatePrompt(dt);   // V26: 상호작용 안내
      flushWorldEdits();   // 블록 편집 → 메시 리빌드(프레임당 1회로 병합, 더티 청크만)
      if (boatMesh && boatMesh.visible) { boatMesh.position.set(P.x, P.y - 0.35, P.z); boatMesh.rotation.y = P.yaw; if (!P._boat) removeBoatMesh(); }
      // V21-F2: 수중/용암 속 화면 틴트 + V24: 피격 붉은 플래시 / 저체력(25%↓) 상시 경고 비네트 — MC식
      {
        const hb = getBlockLocal(Math.floor(P.x), Math.floor(P.y + P.eye), Math.floor(P.z));
        const tintEl = document.getElementById('econ3dTint');
        if (tintEl) {
          if (_hurtT > 0) _hurtT -= dt;
          const lowHp = php && php.hp < php.max * 0.25;
          const want = _hurtT > 0 ? 'radial-gradient(ellipse at center, rgba(255,40,40,0.12) 38%, rgba(190,0,0,0.55) 100%)'
            : lowHp ? 'radial-gradient(ellipse at center, rgba(255,0,0,0) 55%, rgba(170,0,0,0.34) 100%)'
            : hb === ID.water ? 'rgba(18,54,150,0.34)' : (hb === ID.lava ? 'rgba(214,72,10,0.55)' : '');
          if (tintEl._cur !== want) { tintEl._cur = want; tintEl.style.background = want; tintEl.style.display = want ? 'block' : 'none'; }
        }
      }
      // V24-B: 스프린트 FOV(72→79 부드럽게) — 달리기 속도감
      const wantFov = P._sprinting ? 79 : 72;
      if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
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
      // V153: 1인칭 팔/든 아이템 오버레이 — 패널 열림 시만 숨김(모든 1인칭 월드에서 표시)
      if (viewScene && viewCam && !panelOpen()) {
        updateViewmodel(dt);
        renderer.autoClear = false; renderer.clearDepth(); renderer.render(viewScene, viewCam); renderer.autoClear = true;
      }
    } catch (e) { console.error('econ3d loop', e); }
  }

  /* ---------------- 시작/종료 ---------------- */
  function start() {
    if (typeof THREE === 'undefined') { if (typeof app === 'function') app().innerHTML = fallbackErr('3D 라이브러리를 불러오지 못했어요(네트워크 확인).'); return; }
    if (typeof setScreen === 'function') setScreen('econ');
    if (typeof app === 'function') app().innerHTML = screenHTML();
    canvas = document.getElementById('econ3dCanvas');
    if (canvas) {
      canvas.tabIndex = 0;
      try { canvas.focus({ preventScroll: true }); } catch (e) { try { canvas.focus(); } catch (e2) {} }
    }
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
    _celMode = null; _celGroup = null; _celSun = null; _celClouds = null;   // V27-D: 씬 재생성 시 천체 재구축
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
    buildAtlas();
    buildClouds();
    setupOutline();
    initViewmodel();   // V153: 1인칭 팔
    resize(); window.addEventListener('resize', resize);
    bindInput(); requestLookLock(false); running = true; lastT = 0; contextLost = false;
    loadHubMap();   // 실제 허브 맵 선로딩(홈에서 노는 동안 준비) — 포탈 진입 시 즉시 반영
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
    clearMobs(); stopFishing(); restoreAllRegen(); dmgTexts = []; php = null; mouseHeld = false; useHeld = false; breaking = null;
    _minionSig = ''; ambientMobs = []; fairyMeshes = {}; curBannerKey = '';
    worldMode = 'hub'; worldHubCache = null; worldCache = {}; world = null; _meshDirty = false; _mapDirty = false;
  }

  /* ---------------- 액션 위임 ---------------- */
  let selectedHotbar = 0;   // 활성 핫바 슬롯(0~8). 숫자키 1~9로 선택.
  // 핫바가 비었으면 보유한 도구/블럭으로 자동 채움(실제 MC 초반 감성)
  function ensureHotbar() {
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0) return;
    if (!Array.isArray(P0.hotbar)) P0.hotbar = [];
    P0.hotbar = P0.hotbar.slice(0, 9);
    while (P0.hotbar.length < 9) P0.hotbar.push(null);
    P0.hotbar[8] = null;   // V22-H2: 9번 칸은 네더의 별(메뉴) 전용
    // 보유하지 않게 된 아이템은 슬롯에서 비움
    for (let i = 0; i < 9; i++) if (P0.hotbar[i] && (P0.inv[P0.hotbar[i]] || 0) <= 0) P0.hotbar[i] = null;   // V22-K: 도구도 미보유면 비움(유령 도구 수정)
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
  // V22-K: 핫바 선택 변경 시 아이템 이름을 핫바 위에 표시(실제 MC 동작) — 등급색 적용, 1.6초 페이드
  let _titleTimer = null;
  function showHotbarTitle() {
    const el = document.getElementById('econ3dItemTitle'); if (!el) return;
    const k = activeHotbarKey();
    if (!k) { el.style.opacity = '0'; return; }
    const eco = window.__econ || {};
    const sd = (eco.shopDef && eco.shopDef(k)) || null;
    const tiers = (window.ECON_DATA && window.ECON_DATA.ITEM_TIERS) || [];
    const tier = sd && sd.tierKey ? tiers.find(t => t.key === sd.tierKey) : null;
    el.textContent = (sd && sd.name) || (eco.itemName ? eco.itemName(k) : k);
    el.style.color = tier ? tier.colorHex : '#fff';
    el.style.transition = 'none'; el.style.opacity = '1';
    if (_titleTimer) clearTimeout(_titleTimer);
    _titleTimer = setTimeout(() => { el.style.transition = 'opacity .6s'; el.style.opacity = '0'; }, 1600);
  }
  let _placeManual = false;   // V22-K: 건축바에서 직접 고른 블럭은 핫바 동기화가 덮어쓰지 않음
  function syncPlaceFromHotbar() {   // 활성 핫바 아이템이 설치가능 블럭이면 배치 대상으로
    if (_placeManual && isPlaceable(selectedPlaceKey)) return;
    _placeManual = false;
    const k = activeHotbarKey();
    selectedPlaceKey = isPlaceable(k) ? k : null;
  }
  function selectHotbarSlot(i) {
    selectedHotbar = i; _placeManual = false;
    const p0 = econApi().getP ? econApi().getP() : null; if (p0) p0._heldIdx = i;   // V28-A: 손에 든 슬롯 동기화(무기 판정)
    updateHotbar(); showHotbarTitle();
  }
  // V27-B: 실제 MC 아이템 텍스처(item/*.png)가 비동기 로드되면 핫바 아이콘 갱신
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('econIconReady', () => { try { updateHotbar(); updateBuildHud(); } catch (e) {} });
  function updateHotbar() {
    const api = econApi(); const P0 = api.getP ? api.getP() : null; if (!P0) return;
    P0._heldIdx = selectedHotbar;   // V28-A
    ensureHotbar();
    const icon = k => { if (typeof window.econItemPng === 'function') { const p = window.econItemPng(k); if (p) return `<img src="${p}" alt="">`; } return (typeof window.econIcon === 'function' ? `<img src="${window.econIcon(k)}" alt="">` : ''); };   // V134: 실제 MC 텍스처 우선
    const eco = window.__econ || {};
    // V22-H2: 9번 칸 = 네더의 별(스카이블럭 메뉴) 고정 — 실제 하이픽셀과 동일
    const star = document.getElementById('econ3dSlot8');
    if (star) { star.innerHTML = '<img src="item/nether_star.png" alt="" style="width:82%;height:82%;image-rendering:pixelated;image-rendering:crisp-edges">'; star.title = '스카이블럭 메뉴 (9)'; star.classList.toggle('is-active', selectedHotbar === 8); }   // V151: 9번(메뉴)도 휠/선택 시 하이라이트
    for (let i = 0; i < 8; i++) {
      const el = document.getElementById('econ3dSlot' + i); if (!el) continue;
      const k = P0.hotbar[i];
      const cnt = (k && !isToolKey(k)) ? (P0.inv[k] || 0) : 0;
      el.classList.toggle('is-active', i === selectedHotbar);
      el.innerHTML = k ? `${icon(k)}${cnt > 1 ? `<span class="econ3d-slotcount">${cnt}</span>` : ''}` : '';
      // V21-B: 게임 화면 핫바에도 호버 툴팁(이름/등급/능력치 로어)
      if (k && eco.itemLore) { const sd = (eco.shopDef && eco.shopDef(k)) || { key: k, name: (eco.itemName ? eco.itemName(k) : k) }; el.title = eco.itemLore(sd).replace(/&#10;|\n/g, '\n'); }
      else el.title = '핫바 ' + (i + 1);
    }
    syncPlaceFromHotbar();
  }
  function act(a, el) {
    switch (a) {
      case 'econ3d_hotbar': {   // V12-D: 슬롯 클릭 = 선택(빈 슬롯/롱프레스는 인벤토리). 9번=메뉴.
        const i = Number(el.dataset.i);
        if (i === 8) { openPanelForZone('hub', 'menu'); return true; }   // V22-H2: 네더의 별
        const P0 = econApi().getP ? econApi().getP() : null;
        if (P0 && P0.hotbar && P0.hotbar[i]) selectHotbarSlot(i);
        else openPanelForZone('hub', 'inv');   // 빈 슬롯 클릭 = 인벤토리에서 아이템 지정
        return true;
      }
      case 'econ3d_jump': keys.Space = true; setTimeout(() => { keys.Space = false; }, 120); return true;
      case 'econ3d_panel_close': hidePanel(); return true;
      case 'econ3d_map': toggleMinimapSize(); return true;
      case 'econ3d_fs': toggleFullscreen(); return true;   // V26
      case 'econ3d_block': selectedPlaceKey = el.dataset.key; _placeManual = true; updateBuildHud(); return true;   // V22-K: 수동 선택 고정
    }
    return false;
  }

  window.economy3dStart = start;
  window.economy3dClosePanel = () => { hidePanel(); };   // V11: 아레나 시작 시 패널 닫기
  window.economy3dRefreshHotbar = () => { try { updateHotbar(); } catch (e) {} };   // V12-D: 인벤토리에서 핫바 지정 후 3D 갱신
  // V21-D8: 화로 근접 판정(반경 4) — economy.js 제련이 호출. 3D 미가동 시엔 true(2D 전용 환경 배려)
  window.economy3dNearFurnace = () => {
    try {
      if (!running || !P) return true;
      const px = Math.floor(P.x), py = Math.floor(P.y), pz = Math.floor(P.z);
      for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) {
        const b = BLOCKS[getBlockLocal(px + dx, py + dy, pz + dz)];
        if (b && b.key === 'furnace') return true;
      }
      return false;
    } catch (e) { return true; }
  };
  window.economy3dPlayerHomePos = () => (worldMode === 'home' ? { x: Math.round(P.x - 0.5), z: Math.round(P.z - 0.5) } : null);   // V13-A: 미니언을 서있는 위치에 배치
  window.economy3dRebuildMinions = () => { try { rebuildMinionVisuals(true); } catch (e) {} };
  window.__econ3dPlaceable = k => { try { return isPlaceable(k); } catch (e) { return false; } };   // V12-D
  window.economy3dStop = stop;
  window.economy3dAct = act;
  window.economy3dVisit = travelVisit;   // 멀티: 다른 플레이어 섬 방문(economy-net.js가 호출)
  window.economy3dWarp = dest => { if (running && WORLD_DEFS[dest]) { hidePanel(); warpTo(dest, true); return true; } return false; };
  window.economy3dWorlds = () => Object.keys(WORLD_DEFS).filter(k => k !== 'visit' && k !== 'dungeon').map(k => ({ key: k, name: WORLD_DEFS[k].name, req: WARP_REQ[k] || null, portal: hasHomePortal(k) }));

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
      collide, moveAxis, dayFactor, ambientMobs: () => ambientMobs, keys,   // V27-A: 입력 시뮬 검증용
      ID, BLOCKS,
      // V3: 프라이빗 섬/건축/이동
      travelTo, worldMode: () => worldMode, genHome, PORTALS, HOME_MINION_SLOTS, HOME_BOUNDS, HOME_CENTER, installPortalFrame,
      parkGateAt, tryOpenParkGate, parkGates: () => genPark._gates || [], agingPass,
      _testCrack: (b) => { breaking = b; tickCrackOverlay(); return { visible: !!(crackMesh && crackMesh.visible), stage: crackStage }; },
      requiredTierFor, homeBlockHardness, blockToolClass, showHotbarTitle,   // V22-K/V27-D 검증용
      scheduleFluidAround, tickFluids, portalOpenY, tickPortalStand, _setW: setW,   // V23-A 검증용
      spawnBreakParticles, tickParticles, _particleCount: () => particles.length,   // V24-C 검증용
      shootArrow, tickArrows, _arrowCount: () => arrows.length,   // V29-B 검증용
      tileColor, collapseAbove, _outline: () => outlineMesh ? { v: outlineMesh.visible, s: [+outlineMesh.scale.x.toFixed(2), +outlineMesh.scale.y.toFixed(2), +outlineMesh.scale.z.toFixed(2)] } : null,   // V26-B 검증용
      mobList: () => mobs.filter(m => !m.dead).map(m => ({ type: m.type, x: m.mesh.position.x, y: m.mesh.position.y, z: m.mesh.position.z })),   // V21-D9 공허 몹 감사용
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
      loadHubMap, hubMapInfo: () => HUB_MAP && { W: HUB_MAP.W, H: HUB_MAP.H, D: HUB_MAP.D, ox: HUB_MAP.ox, oy: HUB_MAP.oy, oz: HUB_MAP.oz, pal: HUB_MAP.palette.length },
      getDims: () => ({ W, H, Dp }),
      spawnMobForTest: (area, type, lv) => spawnMob(area, type, lv),
      progressBreaking, tickRegen, pickMob, mobs: () => mobs,
      startDungeon3d, getDungeonState: () => dungeonState, onDungeonMobDead, spawnDungeonMob,
    };
  }
})();
