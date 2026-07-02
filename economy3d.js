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
    { key: 'wool_white', tex: 'wool_white' },
    { key: 'wool_red', tex: 'wool_red' },
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
  ];
  const ID = {};
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });

  /* ---------------- 군도 배치(존 = economy-data.js ZONES 키와 일치) ---------------- */
  const ISLANDS = [
    { key: 'hub', name: '🏘️ 중앙 마을', cx: 96, cz: 96, r: 30, top: 16 },
    { key: 'mine', name: '⛏️ 깊은 동굴', cx: 34, cz: 90, r: 27, top: 16, peak: { cx: 27, cz: 86, r: 17, h: 34 } },
    { key: 'farm', name: '🌾 농장 벌판', cx: 152, cz: 40, r: 28, top: 15 },
    { key: 'forest', name: '🌲 속삭이는 숲', cx: 38, cz: 34, r: 26, top: 16 },
    { key: 'dock', name: '🎣 어부의 부두', cx: 152, cz: 150, r: 27, top: 13 },
    { key: 'slayerden', name: '💀 슬레이어 황무지', cx: 38, cz: 152, r: 26, top: 15 },
    { key: 'dungeonentrance', name: '🗝️ 카타콤 지구라트', cx: 96, cz: 160, r: 23, top: 14 },
    { key: 'shrine', name: '🧚 고요한 사당', cx: 96, cz: 18, r: 12, top: 15 },
  ];
  // 다리(축 정렬 직선 구간 — 물 위에만 데크를 깔고 육지에선 자갈길로 이어짐)
  const BRIDGES = [
    { x0: 54, z0: 92, x1: 74, z1: 92 },     // 허브 ↔ 광산
    { x0: 118, z0: 78, x1: 138, z1: 78 }, { x0: 138, z0: 78, x1: 138, z1: 58 },   // 허브 ↔ 농장(ㄱ자)
    { x0: 78, z0: 74, x1: 78, z1: 54 }, { x0: 78, z0: 54, x1: 58, z1: 54 },       // 허브 ↔ 숲(ㄱ자)
    { x0: 118, z0: 116, x1: 136, z1: 116 }, { x0: 136, z0: 116, x1: 136, z1: 134 }, // 허브 ↔ 부두(ㄱ자)
    { x0: 74, z0: 118, x1: 56, z1: 136 - 18 }, { x0: 56, z0: 118, x1: 56, z1: 136 }, // 허브 ↔ 황무지(ㄱ자)
    { x0: 96, z0: 122, x1: 96, z1: 140 },   // 허브 ↔ 지구라트
    { x0: 96, z0: 70, x1: 96, z1: 28 },     // 허브 ↔ 사당
  ];

  // 미니언 자원 → 배치 존
  const RESOURCE_ZONE = {
    stone: 'mine', coal: 'mine', iron: 'mine', gold: 'mine', lapis: 'mine', redstone: 'mine', diamond: 'mine', emerald: 'mine', obsidian: 'mine',
    wheat: 'farm', carrot: 'farm', potato: 'farm', pumpkin: 'farm', melon: 'farm', sugarcane: 'farm',
    oaklog: 'forest', birchlog: 'forest', sprucelog: 'forest',
    rawfish: 'dock', clay: 'dock',
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
    { key: 'shopkeeper', name: '상점 주인', zone: 'hub', tab: 'shop', x: 83, z: 91, color: 0x3a6ee0 },
    { key: 'bankTeller', name: '은행원', zone: 'hub', tab: 'bank', x: 108, z: 91, color: 0xf2d75c },
    { key: 'minionManager', name: '미니언 관리소장', zone: 'hub', tab: 'minions', x: 83, z: 109, color: 0x6aa84f },
    { key: 'petKeeper', name: '펫 상인', zone: 'hub', tab: 'pets', x: 108, z: 109, color: 0xe048c4 },
    { key: 'enchanter', name: '마법부여사', zone: 'hub', tab: 'enchant', x: 96, z: 82, color: 0x9365b8 },
    { key: 'auctioneer', name: '경매인', zone: 'hub', tab: 'deals', x: 90, z: 96, color: 0xc0392b },
    { key: 'reforgeSmith', name: '재련 대장장이', zone: 'hub', tab: 'reforge', x: 102, z: 96, color: 0x6b5436 },
    { key: 'guide', name: '모험 안내인', zone: 'hub', tab: 'stats', x: 96, z: 116, color: 0x2c82c9 },
    { key: 'mineForeman', name: '광산 감독관', zone: 'mine', x: 50, z: 96, color: 0x787878 },
    { key: 'farmForeman', name: '농장 관리인', zone: 'farm', x: 148, z: 44, color: 0xd8b23a },
    { key: 'lumberjack', name: '벌목꾼', zone: 'forest', x: 43, z: 36, color: 0x8a6a3a },
    { key: 'fisherman', name: '늙은 낚시꾼', zone: 'dock', x: 152, z: 152, color: 0x41a85f },
    { key: 'slayerMaster', name: '슬레이어 대장', zone: 'slayerden', x: 38, z: 148, color: 0x2a2040 },
    { key: 'dungeonGatekeeper', name: '던전 문지기', zone: 'dungeonentrance', x: 96, z: 148, color: 0x5a4327 },
    { key: 'tia', name: '요정 티아', zone: 'hub', tab: 'talismans', x: 96, z: 20, color: 0xffb7dd, island: 'shrine' },
  ];
  // V5: "딸깍" 채집 노드는 폐지 — 광석/작물/나무/물을 직접 캐고 낚는다(인월드 채집).
  const NODES = [];
  // 페어리 소울 12개(탐험 보상 — 등대 꼭대기/동굴 심부/풍차 위/다리 밑/수중 등)
  const FAIRY_SPOTS = [
    { id: 0, x: 170, z: 168, y: null, hint: '등대 꼭대기' },
    { id: 1, x: 20, z: 84, y: null, hint: '동굴 가장 깊은 곳' },
    { id: 2, x: 134, z: 26, y: null, hint: '풍차 꼭대기' },
    { id: 3, x: 64, z: 92, y: 12, hint: '다리 아래' },
    { id: 4, x: 30, z: 44, y: null, hint: '숲 큰 나무 옆' },
    { id: 5, x: 96, z: 170, y: null, hint: '지구라트 뒤편' },
    { id: 6, x: 30, z: 160, y: null, hint: '용암 웅덩이 근처' },
    { id: 7, x: 96, z: 14, y: null, hint: '사당' },
    { id: 8, x: 96, z: 93, y: null, hint: '분수 뒤' },
    { id: 9, x: 166, z: 48, y: null, hint: '헛간 지붕' },
    { id: 10, x: 146, z: 160, y: 8, hint: '부두 아래 물속' },
    { id: 11, x: 26, z: 84, y: 36, hint: '산꼭대기' },
  ];

  /* ---------------- 상태 ---------------- */
  let running = false, contextLost = false, raf = 0, lastT = 0;
  let renderer = null, scene = null, camera = null, canvas = null;
  let world = null;
  let worldMode = 'hub';                  // 'hub'(공용 군도) | 'home'(프라이빗 섬 — 블록 설치/파괴 가능)
  let worldHubCache = null;               // 허브 지형 캐시(포털 왕복 시 재생성 방지)
  const HOME_BOUNDS = { x0: 60, x1: 132, z0: 60, z1: 132 };   // 프라이빗 섬 메싱/편집 영역(빠른 리빌드)
  const HOME_CENTER = { x: 96, z: 96, r: 16, top: 20 };
  // 프라이빗 섬 건축 팔레트(자유 건축 모드)
  const BUILD_BLOCKS = ['dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log', 'stone_bricks', 'bricks', 'sand', 'glass', 'glowstone'];
  let selectedBlock = 1;                  // BUILD_BLOCKS 인덱스
  const PORTALS = {
    hub: { x: 80, z: 96, target: 'home', label: '🏝️ 내 섬으로' },
    home: { x: 96, z: 82, target: 'hub', label: '🏘️ 허브로' },
    visit: { x: 96, z: 82, target: 'hub', label: '🏘️ 허브로' },   // 남의 섬 방문 중 귀환 포털
  };
  // 멀티: 다른 플레이어 아바타 + 섬 방문 상태
  let others = {};                          // peerId -> {mesh, tx,ty,tz,tyaw, walkT, walkAmp, legL, legR}
  let visitData = null;                     // {name, homeEdits, minions} — 방문 중인 섬 데이터
  const HOME_MINION_SLOTS = [];
  for (let r = 0; r < 3; r++) for (let cIdx = 0; cIdx < 5; cIdx++) HOME_MINION_SLOTS.push([100 + cIdx * 3, 90 + r * 5]);
  /* ---------------- 테마 월드 정의(실제 스카이블럭 섬 구성) ----------------
     허브를 중심으로 워프 패드로 이동하는 독립 월드들. 각 월드는 시간대가 고정. */
  const WORLD_DEFS = {
    hub:    { name: '🏘️ 허브 군도', size: [192, 48, 192] },
    home:   { name: '🏝️ 나의 섬', size: [192, 48, 192] },
    visit:  { name: '🏝️ 친구의 섬', size: [192, 48, 192] },
    park:   { name: '🌲 더 파크(7종 삼림)', size: [144, 48, 144], spawn: [72, 128], gen: () => genPark() },
    barn:   { name: '🌾 더 반(대농장)', size: [144, 48, 144], spawn: [72, 128], gen: () => genBarn() },
    gold:   { name: '⛏️ 골드 광산', size: [112, 48, 112], spawn: [56, 100], gen: () => genGoldMine() },
    deep:   { name: '💎 딥 캐번(층별 광물)', size: [96, 48, 96], spawn: [48, 84], gen: () => genDeepCaverns() },
    spider: { name: '🕷️ 스파이더 덴', size: [128, 48, 128], spawn: [64, 100], gen: () => genSpiderDen() },
    nether: { name: '🔥 블레이징 포트리스', size: [128, 48, 128], spawn: [64, 96], gen: () => genNether() },
    end:    { name: '🌌 디 엔드', size: [128, 48, 128], spawn: [64, 100], gen: () => genEnd() },
    dungeon: { name: '🗝️ 카타콤', size: [144, 32, 48], spawn: [8, 24], gen: () => genDungeon() },
  };
  // 워프 패드: 밟거나 클릭하면 슈퍼 점프 후 자동 워프(실제 스카이블럭 런치패드)
  const WARPS = {
    hub: [
      { x: 20, z: 96, dest: 'deep', label: '💎 딥 캐번' },
      { x: 24, z: 74, dest: 'gold', label: '⛏️ 골드 광산' },
      { x: 30, z: 20, dest: 'park', label: '🌲 더 파크' },
      { x: 166, z: 28, dest: 'barn', label: '🌾 더 반' },
      { x: 24, z: 168, dest: 'spider', label: '🕷️ 스파이더 덴' },
      { x: 52, z: 172, dest: 'nether', label: '🔥 블레이징 포트리스' },
      { x: 96, z: 8, dest: 'end', label: '🌌 디 엔드' },
    ],
    park: [{ x: 72, z: 134, dest: 'hub', label: '🏘️ 허브' }],
    barn: [{ x: 72, z: 134, dest: 'hub', label: '🏘️ 허브' }],
    gold: [{ x: 56, z: 106, dest: 'hub', label: '🏘️ 허브' }, { x: 20, z: 20, dest: 'deep', label: '💎 딥 캐번' }],
    deep: [{ x: 48, z: 90, dest: 'hub', label: '🏘️ 허브' }],
    spider: [{ x: 64, z: 106, dest: 'hub', label: '🏘️ 허브' }],
    nether: [{ x: 64, z: 102, dest: 'hub', label: '🏘️ 허브' }],
    end: [{ x: 64, z: 106, dest: 'hub', label: '🏘️ 허브' }],
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

  /* ---------------- 지형 생성 ---------------- */
  function islandField(isl, x, z) {
    let d = Math.hypot(x - isl.cx, z - isl.cz) / isl.r;
    d += (hash3(x, 7, z) - 0.5) * 0.14;   // 해안선 지터(유기적 형태)
    return 1 - d;   // >0 = 육지
  }
  function columnSurface(x, z) {
    let best = 0, bestIsl = null;
    for (const isl of ISLANDS) { const f = islandField(isl, x, z); if (f > best) { best = f; bestIsl = isl; } }
    if (best <= 0 || !bestIsl) return { y: 0, isl: null };
    const t = Math.min(1, best * 2.4); const s = t * t * (3 - 2 * t);   // smoothstep 해변 경사
    let y = SEA + 1 + Math.round((bestIsl.top - SEA - 1) * s);
    if (bestIsl.peak) {   // 광산 섬의 산
      const pf = 1 - Math.hypot(x - bestIsl.peak.cx, z - bestIsl.peak.cz) / bestIsl.peak.r;
      if (pf > 0) { const pt = pf * pf * (3 - 2 * pf); y = Math.max(y, Math.round(bestIsl.top + (bestIsl.peak.h - bestIsl.top) * pt)); }
    }
    return { y, isl: bestIsl };
  }
  function zoneAt(x, z) {
    let best = 0, key = '';
    for (const isl of ISLANDS) { const f = islandField(isl, x, z); if (f > best) { best = f; key = isl.key; } }
    return best > 0 ? key : '';
  }
  function genWorld() {
    world = new Uint8Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const { y: sy } = columnSurface(x, z);
      if (sy <= SEA) {   // 바다: 돌 심층 + 모래 바닥 + 물
        for (let y = 0; y <= 6; y++) setW(x, y, z, y < 2 ? ID.bedrock : ID.stone);
        setW(x, 7, z, ID.sand); setW(x, 8, z, ID.sand);
        setW(x, 9, z, ID.water); setW(x, 10, z, ID.water);
      } else {           // 육지
        for (let y = 0; y <= sy; y++) {
          let id = ID.stone;
          if (y < 2) id = ID.bedrock;
          else if (y === sy) id = sy <= SEA + 2 ? ID.sand : ID.grass;
          else if (y >= sy - 3) id = sy <= SEA + 2 ? ID.sand : ID.dirt;
          setW(x, y, z, id);
        }
        if (sy === SEA) { setW(x, SEA + 1 - 1, z, ID.sand); }
      }
    }
    buildBridges();
    buildHub();
    buildMine();
    buildFarm();
    buildForest();
    buildDock();
    buildSlayerden();
    buildZiggurat();
    buildShrine();
    buildPortalFrame(PORTALS.hub.x, PORTALS.hub.z);
    buildWarpPads();
  }

  /* ---- 프라이빗 섬(스카이블럭의 심장 — 공허에 뜬 나만의 섬, 자유 건축) ---- */
  function buildPortalFrame(cx, cz) {
    const y = surfaceTop(cx, cz);
    for (let dx = -2; dx <= 2; dx++) { setW(cx + dx, y, cz, ID.obsidian); setW(cx + dx, y + 4, cz, ID.obsidian); }
    for (let dy = 0; dy <= 4; dy++) { setW(cx - 2, y + dy, cz, ID.obsidian); setW(cx + 2, y + dy, cz, ID.obsidian); }
    setW(cx - 2, y + 5, cz, ID.glowstone); setW(cx + 2, y + 5, cz, ID.glowstone);
  }
  function genHome(editsOverride) {
    world = new Uint8Array(W * H * Dp);   // 공허(바다 없음) — 진짜 스카이블럭 프라이빗 섬
    const { x: cx, z: cz, r, top } = HOME_CENTER;
    for (let x = HOME_BOUNDS.x0; x <= HOME_BOUNDS.x1; x++) for (let z = HOME_BOUNDS.z0; z <= HOME_BOUNDS.z1; z++) {
      let d = Math.hypot(x - cx, z - cz) / r;
      d += (hash3(x, 77, z) - 0.5) * 0.14;
      if (d >= 1) continue;
      // 아래로 갈수록 좁아지는 부유섬 형태
      for (let y = top; y >= 6; y--) {
        const depth = top - y;
        const shrink = 1 - depth * 0.09;
        if (d > shrink) continue;
        let id = ID.stone;
        if (y === top) id = ID.grass;
        else if (y >= top - 3) id = ID.dirt;
        setW(x, y, z, id);
      }
    }
    // 시작의 나무(큰 참나무)
    const tx = cx - 7, tz = cz - 6, ty = surfaceTop(tx, tz);
    for (let i = 0; i < 5; i++) setW(tx, ty + i, tz, ID.oak_log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 3; dy <= 6; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 5) <= 3 && !(dx === 0 && dz === 0 && dy < 5)) {
        if (!getBlockLocal(tx + dx, ty + dy, tz + dz)) setW(tx + dx, ty + dy, tz + dz, ID.oak_leaves);
      }
    }
    // 미니언 받침대 15자리(동쪽 정렬)
    HOME_MINION_SLOTS.forEach(s => { const y = surfaceTop(s[0], s[1]); setW(s[0], y - 1, s[1], ID.stone_bricks); });
    // 허브 귀환 포털 + 꽃 장식
    buildPortalFrame(PORTALS.home.x, PORTALS.home.z);
    for (let i = 0; i < 10; i++) {
      const x = cx + Math.floor((hash3(i, 81, 3) - 0.5) * r * 1.4), z = cz + Math.floor((hash3(i, 82, 7) - 0.5) * r * 1.4);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, hash3(i, 83, 1) < 0.5 ? ID.flower_yellow : ID.tall_grass);
    }
    // 저장된 블록 편집 적용(설치/파괴 영속) — 방문 모드면 방문 대상의 편집을 적용
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
    if (worldMode === 'dungeon' && mode !== 'dungeon') dungeonState = null;
    if (worldMode !== 'visit' && worldMode !== 'dungeon') worldCache[worldMode] = { world, W, H, Dp };   // 현재 월드 캐시
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
    else if (def.gen) def.gen();
    buildIslandMesh((mode === 'home' || mode === 'visit') ? HOME_BOUNDS : null);
    if (mode === 'hub') { buildNpcMeshes(); buildNodeMeshes(); buildFairyMeshes(); buildAmbientMobs(); refreshFairyVisibility(); }
    else { propGroup = new THREE.Group(); scene.add(propGroup); }
    buildStaticInteractables();
    rebuildMinionVisuals(true);
    buildMinimapBase();
    buildPortalMarker();
    if (mode === 'hub') resetPlayerToSpawn();
    else if (mode === 'home' || mode === 'visit') { P.x = 96.5; P.z = 100.5; P.y = surfaceTop(96, 100) + 0.02; P.yaw = Math.PI; }
    else { const sp = def.spawn || [W >> 1, Dp >> 1]; P.x = sp[0] + 0.5; P.z = sp[1] + 0.5; P.y = surfaceTop(sp[0], sp[1]) + 0.02; P.yaw = Math.PI; }
    P.vx = P.vy = P.vz = 0;
    curBannerKey = '';
    _lastSkyKey = '';   // 월드별 고정 시간대 즉시 반영
    updateBuildHud();
    if (typeof toast === 'function') {
      if (mode === 'home') toast('🏝️ 나의 섬에 도착! (좌클릭 파괴 · 우클릭 설치)', true);
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
  function buildHouse(x0, z0, wdt, dpt, base, wallId, roofId) {
    flattenSite(x0 - 1, z0 - 1, x0 + wdt, z0 + dpt, base - 1);
    for (let x = x0; x < x0 + wdt; x++) for (let z = z0; z < z0 + dpt; z++) setW(x, base - 1, z, ID.oak_planks);   // 바닥
    for (let y = base; y < base + 4; y++) for (let x = x0; x < x0 + wdt; x++) for (let z = z0; z < z0 + dpt; z++) {
      const edge = x === x0 || x === x0 + wdt - 1 || z === z0 || z === z0 + dpt - 1;
      setW(x, y, z, edge ? wallId : 0);
    }
    for (let x = x0; x < x0 + wdt; x++) for (let z = z0; z < z0 + dpt; z++) setW(x, base + 4, z, roofId);   // 지붕
    const dx = x0 + (wdt >> 1);
    setW(dx, base, z0 + dpt - 1, 0); setW(dx, base + 1, z0 + dpt - 1, 0);   // 남쪽 문
    setW(x0, base + 2, z0 + (dpt >> 1), ID.glass); setW(x0 + wdt - 1, base + 2, z0 + (dpt >> 1), ID.glass);   // 창문
    setW(dx, base + 2, z0, ID.glass);
    setW(x0 + (wdt >> 1), base + 3, z0 + (dpt >> 1), ID.glowstone);   // 실내 조명
  }
  function lampPost(x, z) {
    const y = surfaceTop(x, z);
    setW(x, y, z, ID.oak_log); setW(x, y + 1, z, ID.oak_log); setW(x, y + 2, z, ID.glowstone);
  }
  function pathTo(x0, z0, x1, z1) {   // 지표면 자갈길
    let x = x0, z = z0;
    while (x !== x1 || z !== z1) {
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) === ID.grass) setW(x, y, z, ID.cobblestone);
      if (x !== x1) x += x1 > x ? 1 : -1; else if (z !== z1) z += z1 > z ? 1 : -1;
    }
  }

  function buildBridges() {
    for (const b of BRIDGES) {
      const dx = Math.sign(b.x1 - b.x0), dz = Math.sign(b.z1 - b.z0);
      let x = b.x0, z = b.z0, i = 0;
      while (true) {
        const overWater = surfaceTop(x, z) <= SEA + 1;
        if (overWater) {
          for (let o = -1; o <= 1; o++) {
            const px = dx !== 0 ? x : x + o, pz = dx !== 0 ? z + o : z;
            setW(px, 12, pz, ID.oak_planks); clearAbove(px, pz, 13, 4);
          }
          if (i % 6 === 0) {   // 교각 + 난간 램프
            const rx = dx !== 0 ? x : x + 2, rz = dx !== 0 ? z + 2 : z;
            for (let y = 8; y <= 11; y++) setW(x, y, z, ID.oak_log);   // 물속 교각 기둥
            setW(rx, 13, rz, ID.oak_log); setW(rx, 14, rz, ID.glowstone);
          }
        } else {
          const y = surfaceTop(x, z) - 1;
          if (getBlockLocal(x, y, z) === ID.grass || getBlockLocal(x, y, z) === ID.sand) setW(x, y, z, ID.cobblestone);
        }
        if (x === b.x1 && z === b.z1) break;
        x += dx; z += dz; i++;
      }
    }
  }

  function buildHub() {
    // 중앙 광장 + 분수
    flattenSite(88, 88, 104, 104, 15);
    for (let x = 90; x <= 102; x++) for (let z = 90; z <= 102; z++) setW(x, 15, z, ID.stone_bricks);
    for (let x = 94; x <= 98; x++) for (let z = 94; z <= 98; z++) { setW(x, 16, z, ID.stone_bricks); if (x > 94 && x < 98 && z > 94 && z < 98) { setW(x, 16, z, ID.water); } }
    setW(96, 16, 96, ID.stone_bricks); setW(96, 17, 96, ID.stone_bricks); setW(96, 18, 96, ID.glowstone);   // 분수 기둥
    // 건물 6채(북서: 상점, 북동: 은행, 서: 미니언, 동: 펫, 북: 인챈트 탑, 남: 훈련소)
    buildHouse(80, 82, 7, 7, 16, ID.bricks, ID.oak_planks);          // 상점
    buildHouse(105, 82, 7, 7, 16, ID.sandstone, ID.oak_planks);      // 은행
    buildHouse(80, 100, 7, 7, 16, ID.oak_planks, ID.spruce_planks);  // 미니언 관리소
    buildHouse(105, 100, 7, 7, 16, ID.birch_planks, ID.oak_planks);  // 펫 상점
    buildHouse(92, 74, 9, 7, 16, ID.stone_bricks, ID.stone_bricks);  // 인챈트 탑(1층)
    for (let y = 21; y < 26; y++) for (let x = 94; x < 100; x++) for (let z = 76; z < 80; z++) {   // 탑 2층
      const edge = x === 94 || x === 99 || z === 76 || z === 79;
      setW(x, y, z, edge ? ID.stone_bricks : 0);
    }
    for (let x = 94; x < 100; x++) for (let z = 76; z < 80; z++) setW(x, 26, z, ID.stone_bricks);
    setW(96, 27, 77, ID.glowstone); setW(97, 27, 78, ID.glowstone);
    buildHouse(92, 108, 9, 6, 16, ID.spruce_planks, ID.oak_planks);  // 훈련소
    // 가로등 + 길
    [[88, 92], [104, 92], [88, 100], [104, 100], [96, 86], [96, 106]].forEach(p => lampPost(p[0], p[1]));
    pathTo(96, 104, 96, 118); pathTo(96, 88, 96, 74); pathTo(90, 96, 76, 92); pathTo(102, 96, 116, 96);
  }

  function buildMine() {
    // 동굴 입구(동쪽 사면) → 터널 → 대형 챔버
    for (let x = 34; x <= 46; x++) for (let z = 88; z <= 92; z++) for (let y = 16; y <= 20; y++) setW(x, y, z, 0);   // 터널
    for (let x = 18; x <= 34; x++) for (let z = 78; z <= 96; z++) for (let y = 14; y <= 22; y++) {   // 챔버(타원 판정)
      const d = Math.hypot((x - 26) / 9, (z - 87) / 10, (y - 18) / 5);
      if (d < 1) setW(x, y, z, 0);
    }
    // 광맥: 챔버 벽에 9종 광석 클러스터
    const ores = [ID.coal_ore, ID.coal_ore, ID.iron_ore, ID.iron_ore, ID.gold_ore, ID.lapis_ore, ID.redstone_ore, ID.diamond_ore, ID.emerald_ore, ID.obsidian];
    let placed = 0;
    for (let i = 0; i < 400 && placed < 48; i++) {
      const x = 17 + Math.floor(hash3(i, 1, 7) * 20), z = 77 + Math.floor(hash3(i, 2, 9) * 21), y = 13 + Math.floor(hash3(i, 3, 11) * 11);
      if (getBlockLocal(x, y, z) !== ID.stone && getBlockLocal(x, y, z) !== ID.dirt) continue;
      // 노출 면이 있는 벽 블록에만
      if (!(getBlockLocal(x + 1, y, z) === 0 || getBlockLocal(x - 1, y, z) === 0 || getBlockLocal(x, y, z + 1) === 0 || getBlockLocal(x, y, z - 1) === 0 || getBlockLocal(x, y + 1, z) === 0)) continue;
      const ore = ores[Math.floor(hash3(i, 4, 13) * ores.length)];
      setW(x, y, z, ore);
      if (hash3(i, 5, 17) < 0.5) setW(x, y + 1, z, ore);
      placed++;
    }
    // 챔버 조명
    [[22, 21, 82], [30, 21, 90], [20, 16, 92], [26, 15, 80]].forEach(p => setW(p[0], p[1], p[2], ID.glowstone));
    // 입구 프레임 + 감독관 오두막
    for (let z = 87; z <= 93; z++) { setW(47, 16, z, ID.oak_log); setW(47, 17, z, z === 87 || z === 93 ? ID.oak_log : 0); }
    for (let y = 16; y <= 18; y++) { setW(46, y, 87, ID.oak_log); setW(46, y, 93, ID.oak_log); }
    for (let z = 87; z <= 93; z++) setW(46, 19, z, ID.oak_planks);
    lampPost(48, 86); lampPost(48, 94);
  }

  function buildFarm() {
    flattenSite(134, 26, 172, 56, 14);
    // 작물 플롯 6종(밀/당근/감자/사탕수수/호박/수박)
    const crops = [ID.wheat_ripe, ID.carrot_ripe, ID.potato_ripe, ID.sugar_cane, ID.pumpkin, ID.melon];
    for (let ci = 0; ci < 6; ci++) {
      const px = 138 + (ci % 3) * 12, pz = 28 + Math.floor(ci / 3) * 12;
      for (let x = px; x < px + 9; x++) for (let z = pz; z < pz + 7; z++) {
        if (crops[ci] === ID.pumpkin || crops[ci] === ID.melon) {
          setW(x, 13, z, ID.farmland);
          if ((x + z * 3) % 3 === 0) setW(x, 14, z, crops[ci]);   // 호박/수박은 블록이라 듬성듬성
        } else { setW(x, 13, z, ID.farmland); setW(x, 14, z, crops[ci]); }   // 십자 작물은 빽빽하게
      }
      // 플롯 모서리 울타리 기둥
      [[px - 1, pz - 1], [px + 9, pz - 1], [px - 1, pz + 7], [px + 9, pz + 7]].forEach(c => { setW(c[0], 14, c[1], ID.oak_log); });
    }
    // 풍차(남서쪽): 몸통 + 날개
    const wx = 134, wz = 24;
    for (let y = 14; y < 26; y++) for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) {
      const edge = dx === 0 || dx === 3 || dz === 0 || dz === 3;
      setW(wx + dx, y, wz + dz, edge ? ID.spruce_planks : 0);
    }
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) setW(wx + dx, 26, wz + dz, ID.spruce_planks);
    setW(wx + 1, 15, wz + 3, 0); setW(wx + 1, 16, wz + 3, 0);   // 문
    for (let i = 1; i <= 6; i++) {   // X자 날개(남면)
      [[i, i], [-i, i], [i, -i], [-i, -i]].forEach(o => setW(wx + 1 + o[0], 22 + o[1], wz + 4, ID.wool_white));
    }
    setW(wx + 1, 22, wz + 4, ID.oak_log);
    // 헛간(동쪽)
    buildHouse(160, 44, 8, 7, 15, ID.wool_red, ID.spruce_planks);
    // 연못
    for (let x = 154; x <= 159; x++) for (let z = 26; z <= 30; z++) { setW(x, 13, z, ID.water); setW(x, 14, z, 0); }
    lampPost(150, 40); lampPost(138, 40);
  }

  function buildForest() {
    // 나무 3종을 지터드 그리드로 배치
    for (let gx = 0; gx < 9; gx++) for (let gz = 0; gz < 9; gz++) {
      const x = 16 + gx * 5 + Math.floor(hash3(gx, 21, gz) * 3), z = 14 + gz * 5 + Math.floor(hash3(gx, 22, gz) * 3);
      if (zoneAt(x, z) !== 'forest') continue;
      if (Math.hypot(x - 42, z - 32) < 6) continue;   // 오두막 자리
      const r = hash3(x, 23, z);
      if (r < 0.30) plantOak(x, z);
      else if (r < 0.52) plantBirch(x, z);
      else if (r < 0.72) plantSpruce(x, z);
      else if (r < 0.86) { const y = surfaceTop(x, z); setW(x, y, z, r < 0.79 ? ID.tall_grass : (r < 0.83 ? ID.flower_red : ID.flower_yellow)); }
    }
    // 벌목꾼 오두막 + 장작더미
    buildHouse(40, 28, 6, 6, 17, ID.spruce_planks, ID.spruce_planks);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { setW(48 + i, 17, 30 + j, ID.oak_log); if (i < 2) setW(48 + i, 18, 30, ID.oak_log); }
    lampPost(38, 38);
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

  function buildDock() {
    // 항구 마을(오두막 2채) + 부두 + 등대
    buildHouse(146, 146, 6, 6, 14, ID.oak_planks, ID.spruce_planks);
    buildHouse(154, 148, 6, 6, 14, ID.spruce_planks, ID.oak_planks);
    // 부두(남동쪽 바다로 뻗음)
    for (let i = 0; i < 22; i++) {
      const x = 156 + Math.floor(i * 0.7), z = 156 + i;
      if (z >= Dp - 2) break;
      for (let o = -1; o <= 1; o++) { setW(x + o, 12, z, ID.oak_planks); clearAbove(x + o, z, 13, 4); }
      if (i % 5 === 0) { setW(x + 2, 13, z, ID.oak_log); setW(x + 2, 14, z, ID.glowstone); }
      for (let y = 8; y <= 11; y++) setW(x, y, z, ID.oak_log);   // 교각
    }
    // 등대(부두 동쪽 바위섬)
    const lx = 168, lz = 166;
    for (let x = lx - 3; x <= lx + 3; x++) for (let z = lz - 3; z <= lz + 3; z++) { if (Math.hypot(x - lx, z - lz) < 3.5) { for (let y = 7; y <= 12; y++) setW(x, y, z, ID.stone); } }
    for (let y = 13; y <= 28; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
      setW(lx + dx, y, lz + dz, edge ? (Math.floor((y - 13) / 4) % 2 === 0 ? ID.wool_white : ID.wool_red) : 0);
    }
    // 등대 꼭대기: 유리 등실 + 글로우스톤
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setW(lx + dx, 29, lz + dz, ID.stone_bricks);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { setW(lx + dx, 30, lz + dz, (dx === 0 && dz === 0) ? ID.glowstone : ID.glass); setW(lx + dx, 31, lz + dz, ID.stone_bricks); }
    // 외벽 나선 계단(점프로 오를 수 있게 2블록마다 +1)
    const ring = [];
    for (let dx = -2; dx <= 2; dx++) ring.push([dx, -2]);
    for (let dz = -1; dz <= 2; dz++) ring.push([2, dz]);
    for (let dx = 1; dx >= -2; dx--) ring.push([dx, 2]);
    for (let dz = 1; dz >= -1; dz--) ring.push([-2, dz]);
    let sy = 12;
    for (let loop = 0; loop < 3; loop++) for (let i = 0; i < ring.length; i++) {
      if (i % 2 === 0) sy++;
      if (sy > 28) break;
      setW(lx + ring[i][0], sy, lz + ring[i][1], ID.spruce_planks);
      clearAbove(lx + ring[i][0], lz + ring[i][1], sy + 1, 3);
    }
    // 보트(물 위 장식)
    for (let i = 0; i < 4; i++) { setW(146 + i, 10, 170, ID.spruce_planks); }
    setW(146, 11, 170, ID.spruce_planks); setW(149, 11, 170, ID.spruce_planks);
    lampPost(150, 152);
  }

  function buildSlayerden() {
    // 저주받은 땅: 평탄한 내륙만 저주파 얼룩(패치 단위)으로 — 경사면 체커 무늬 방지
    const isl = ISLANDS.find(i => i.key === 'slayerden');
    for (let x = 14; x <= 62; x++) for (let z = 128; z <= 176; z++) {
      if (islandField(isl, x, z) < 0.45) continue;   // 섬 안쪽 평지만
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) !== ID.grass) continue;
      const r = hash3(x >> 2, 31, z >> 2);   // 4×4 패치 단위 얼룩
      setW(x, y, z, r < 0.32 ? ID.obsidian : r < 0.62 ? ID.stone : ID.dirt);
    }
    // 5대 슬레이어 제단(링 배치)
    const altars = [[38, 138], [26, 146], [30, 160], [46, 160], [50, 146]];
    altars.forEach((a, i) => {
      const y = surfaceTop(a[0], a[1]) - 1;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setW(a[0] + dx, y, a[1] + dz, ID.stone_bricks);
      setW(a[0], y + 1, a[1], ID.obsidian); setW(a[0], y + 2, a[1], ID.obsidian); setW(a[0], y + 3, a[1], ID.glowstone);
    });
    // 용암 웅덩이 2곳
    [[28, 166], [48, 134]].forEach(p => {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
        const y = surfaceTop(p[0] + dx, p[1] + dz) - 1;
        setW(p[0] + dx, y, p[1] + dz, ID.lava);
      }
    });
  }

  function buildZiggurat() {
    // 7단(=던전 7층 상징) 테라스 피라미드 — 단 높이 1블록이라 어느 면으로든 점프로 오를 수 있음
    const cx = 96, cz = 160;
    const base = surfaceTop(cx, cz);   // 주변 지형 위에 그대로 얹음(구덩이 없음)
    flattenSite(cx - 15, cz - 15, cx + 15, cz + 15, base - 1);
    for (let tier = 0; tier < 7; tier++) {
      const half = 13 - tier * 2, y = base + tier;
      for (let x = cx - half; x <= cx + half; x++) for (let z = cz - half; z <= cz + half; z++) setW(x, y, z, ID.stone_bricks);
      // 모서리 화로
      [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(c => setW(cx + c[0], y + 1, cz + c[1], ID.glowstone));
    }
    // 정상 포털 프레임(문지기 뒤편)
    const ty = base + 7;
    for (let dx = -2; dx <= 2; dx++) { setW(cx + dx, ty, cz + 3, ID.obsidian); setW(cx + dx, ty + 4, cz + 3, ID.obsidian); }
    for (let dy = 0; dy <= 4; dy++) { setW(cx - 2, ty + dy, cz + 3, ID.obsidian); setW(cx + 2, ty + dy, cz + 3, ID.obsidian); }
  }

  function buildShrine() {
    const cx = 96, cz = 16;
    flattenSite(cx - 8, cz - 8, cx + 8, cz + 8, 14);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { if (Math.hypot(dx, dz) < 5.5) setW(cx + dx, 14, cz + dz, ID.stone_bricks); }
    // 꽃 링 + 작은 분수
    for (let a = 0; a < 12; a++) { const x = cx + Math.round(Math.cos(a / 12 * Math.PI * 2) * 7), z = cz + Math.round(Math.sin(a / 12 * Math.PI * 2) * 7); const y = surfaceTop(x, z); if (getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, a % 2 ? ID.flower_red : ID.flower_yellow); }
    setW(cx, 15, cz - 3, ID.stone_bricks); setW(cx, 16, cz - 3, ID.glowstone);
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
  // 🌲 더 파크: 실제 The Park처럼 수종별 구역(7종: 참나무/자작/가문비/다크오크/정글/아카시아/메가가문비)
  function genPark() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(72, 72, 62, 16);
    const species = [plantOak, plantBirch, plantSpruce, plantDarkOak, plantJungle, plantAcacia, plantMegaSpruce];
    for (let gx = 0; gx < 16; gx++) for (let gz = 0; gz < 16; gz++) {
      const x = 12 + gx * 8 + Math.floor(hash3(gx, 51, gz) * 4), z = 12 + gz * 8 + Math.floor(hash3(gx, 52, gz) * 4);
      if (Math.hypot(x - 72, z - 72) > 56 || Math.hypot(x - 72, z - 128) < 10) continue;
      const wedge = Math.floor(((Math.atan2(z - 72, x - 72) + Math.PI) / (Math.PI * 2)) * 7) % 7;   // 방위별 수종 구역
      if (hash3(x, 53, z) < 0.62) species[wedge](x, z);
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
  // 🕷️ 스파이더 덴
  function genSpiderDen() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(64, 64, 56, 15, { surf: ID.dirt });
    // 죽은 나무 + 거미줄(양털)
    for (let i = 0; i < 26; i++) {
      const x = 16 + Math.floor(hash3(i, 81, 1) * 96), z = 14 + Math.floor(hash3(i, 82, 2) * 88);
      if (Math.hypot(x - 64, z - 64) > 50 || Math.hypot(x - 64, z - 116) < 12) continue;
      const y = surfaceTop(x, z), th = 3 + Math.floor(hash3(i, 83, 3) * 4);
      for (let j = 0; j < th; j++) setW(x, y + j, z, ID.spruce_log);
      if (hash3(i, 84, 4) < 0.5) setW(x, y + th, z, ID.wool_white);
    }
    // 중앙 거미 언덕(브루드마더 둥지)
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
      const hgt = Math.max(0, 9 - Math.hypot(dx, dz) * 0.8);
      const y0 = surfaceTop(64 + dx, 52 + dz);
      for (let y = 0; y < hgt; y++) setW(64 + dx, y0 + y, 52 + dz, hash3(dx, 85, dz) < 0.3 ? ID.wool_white : ID.stone);
    }
    buildWarpPads();
  }
  // 🔥 블레이징 포트리스: 용암 바다 위 네더락 + 요새 통로
  function genNether() {
    world = new Uint8Array(W * H * Dp);
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) for (let y = 2; y <= SEA - 1; y++) setW(x, y, z, ID.lava);   // 용암 바다
    genBlobIsland(64, 64, 54, 16, { surf: ID.netherrack, sub: ID.netherrack, fill: ID.netherrack });
    for (let i = 0; i < 60; i++) {   // 소울샌드 패치
      const x = 20 + Math.floor(hash3(i, 91, 1) * 88), z = 20 + Math.floor(hash3(i, 92, 2) * 88);
      const y = surfaceTop(x, z) - 1;
      if (getBlockLocal(x, y, z) === ID.netherrack && hash3(i, 93, 3) < 0.8) setW(x, y, z, ID.soul_sand);
    }
    // 요새 다리(십자) + 블레이즈 스폰 플랫폼
    for (let x = 24; x <= 104; x++) { for (let o = -1; o <= 1; o++) { setW(x, 20, 64 + o, ID.nether_bricks); clearAbove(x, 64 + o, 21, 4); } if (x % 8 === 0) { setW(x, 21, 62, ID.nether_bricks); setW(x, 21, 66, ID.nether_bricks); } }
    for (let z = 24; z <= 104; z++) { for (let o = -1; o <= 1; o++) { setW(64 + o, 20, z, ID.nether_bricks); clearAbove(64 + o, z, 21, 4); } }
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) setW(64 + dx, 20, 40 + dz, ID.nether_bricks);
    [[60, 40], [68, 40], [64, 36], [64, 44]].forEach(p2 => setW(p2[0], 21, p2[1], ID.glowstone));
    // 용암 웅덩이
    [[40, 80], [88, 52]].forEach(p2 => { for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) { const y = surfaceTop(p2[0] + dx, p2[1] + dz) - 1; setW(p2[0] + dx, y, p2[1] + dz, ID.lava); } });
    buildWarpPads();
  }
  // 🌌 디 엔드: 공허 위 엔드스톤 + 흑요석 기둥
  function genEnd() {
    world = new Uint8Array(W * H * Dp);
    genBlobIsland(64, 64, 56, 16, { surf: ID.end_stone, sub: ID.end_stone, fill: ID.end_stone });
    for (let i = 0; i < 8; i++) {   // 흑요석 기둥
      const a = i / 8 * Math.PI * 2;
      const x = 64 + Math.round(Math.cos(a) * 32), z = 64 + Math.round(Math.sin(a) * 32);
      const hgt = 10 + Math.floor(hash3(i, 95, 1) * 8), y0 = surfaceTop(x, z);
      for (let y = 0; y < hgt; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) < 2) setW(x + dx, y0 + y, z + dz, ID.obsidian);
      }
      setW(x, y0 + hgt, z, ID.glowstone);
    }
    // 젤롯 둥지(북쪽 구덩이)
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      if (Math.hypot(dx, dz) < 8) { const y0 = surfaceTop(64 + dx, 30 + dz) - 1; setW(64 + dx, y0, 30 + dz, hash3(dx, 96, dz) < 0.25 ? ID.obsidian : ID.end_stone); }
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
  function warpTo(dest) {
    if (!WORLD_DEFS[dest]) return;
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
  function startDungeon3d(floor) {
    if (!running || !scene) return false;
    const api = econApi();
    if (api.hasActiveEncounter && api.hasActiveEncounter()) return false;
    if (api.canEnterFloor && !api.canEnterFloor(floor)) { if (typeof toast === 'function') toast('이전 층을 먼저 클리어하세요', false); return true; }
    const fd = api.dungeonFloorInfo ? api.dungeonFloorInfo(floor) : null;
    if (!fd) return false;
    dungeonState = { floor, fd, rooms: [], t0: performance.now(), deaths: 0, kills: 0, bossSpawned: false, done: false };
    hidePanel();
    travelTo('dungeon', true);
    // 방 5개: 몬스터 배치(방마다 4마리, 층 몹 이름/스탯)
    const ROOM_W = 22;
    for (let i = 0; i < 5; i++) {
      const room = { x0: i * ROOM_W + 2, x1: (i + 1) * ROOM_W - 2, gateX: (i + 1) * ROOM_W, kills: 0, need: 4, cleared: false };
      dungeonState.rooms.push(room);
      for (let k = 0; k < room.need; k++) {
        const name = fd.mobList[k % fd.mobList.length];
        const hp = Math.max(40, Math.round(fd.bossHp / 40));
        spawnDungeonMob({
          name, hp, dmg: Math.round(fd.bossDmg / 3), lv: floor * 5 + k,
          x: room.x0 + 4 + Math.random() * (room.x1 - room.x0 - 8), z: 14 + Math.random() * 20,
          color: [0x3a7d3a, 0x8a8a8a, 0x5a4327, 0x7d3a3a][k % 4], roomIdx: i,
        });
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
      if (api.dungeonComplete) api.dungeonComplete(dungeonState.floor, { timeSec: (performance.now() - dungeonState.t0) / 1000, deaths: dungeonState.deaths, kills: dungeonState.kills });
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
        const boss = spawnDungeonMob({ name: fd.bossName, hp: fd.bossHp, dmg: fd.bossDmg, lv: dungeonState.floor * 10, x: 122, z: 24, color: 0x6a1a8a, isBoss: true });
        if (boss) { boss.mesh.scale.multiplyScalar(1.8); drawMobLabel(boss); }
        if (typeof toast === 'function') toast(`👹 ${fd.bossName}이(가) 깨어났다!`, false);
      }
    }
  }
  window.economy3dDungeon = floor => { try { return startDungeon3d(floor); } catch (e) { console.error('econ3d dungeon', e); return false; } };

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
    switch (name) {
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
      case 'wool_white': fillNoise('#e9ecec', '#dadddd', '#f6f9f9'); break;
      case 'wool_red': fillNoise('#c0392b', '#a93226', '#d64536'); break;
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
  // ── 청크 메싱: 32×32 기둥 단위로 나눠 블록 하나 캘 때 그 청크만 다시 만든다(즉시 반영) ──
  const CHUNK = 32;
  let chunkMeshes = {};        // "cx,cz" -> {opaque,water,plant,lava}
  let dirtyChunks = new Set();
  function disposeChunkMeshes(key) {
    const cM = chunkMeshes[key]; if (!cM) return;
    ['opaque', 'water', 'plant', 'lava'].forEach(t => { const m = cM[t]; if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); } });
    delete chunkMeshes[key];
  }
  function disposeIslandMeshes() { for (const k in chunkMeshes) disposeChunkMeshes(k); chunkMeshes = {}; dirtyChunks.clear(); }
  function markBlockDirty(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    dirtyChunks.add(cx + ',' + cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;   // 경계 블록이면 이웃 청크도(면 컬링 갱신)
    if (lx === 0) dirtyChunks.add((cx - 1) + ',' + cz);
    if (lx === CHUNK - 1) dirtyChunks.add((cx + 1) + ',' + cz);
    if (lz === 0) dirtyChunks.add(cx + ',' + (cz - 1));
    if (lz === CHUNK - 1) dirtyChunks.add(cx + ',' + (cz + 1));
  }
  function buildIslandMesh(bounds) {
    const cx0 = bounds ? Math.floor(bounds.x0 / CHUNK) : 0, cx1 = bounds ? Math.floor(bounds.x1 / CHUNK) : Math.floor((W - 1) / CHUNK);
    const cz0 = bounds ? Math.floor(bounds.z0 / CHUNK) : 0, cz1 = bounds ? Math.floor(bounds.z1 / CHUNK) : Math.floor((Dp - 1) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) buildChunk(cx, cz);
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
  function buildHumanoid(baseCol) {
    const g = new THREE.Group();
    const dark = shade(baseCol, 0.75), light = shade(baseCol, 1.15);
    const legH = 0.75, bodyH = 0.75, headS = 0.5, limbW = 0.24;
    const legL = mkBox(limbW, legH, 0.24, dark, -0.12, legH / 2, 0), legR = mkBox(limbW, legH, 0.24, dark, 0.12, legH / 2, 0);
    g.add(legL); g.add(legR);
    g.add(mkBox(0.5, bodyH, 0.26, baseCol, 0, legH + bodyH / 2, 0));
    g.add(mkBox(headS, headS, headS, light, 0, legH + bodyH + headS / 2, 0));
    g.add(mkBox(limbW, bodyH, limbW, baseCol, -(0.25 + limbW / 2), legH + bodyH * 0.7, 0));
    g.add(mkBox(limbW, bodyH, limbW, baseCol, (0.25 + limbW / 2), legH + bodyH * 0.7, 0));
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
  function buildNpcMeshes() {
    npcGroup = new THREE.Group(); scene.add(npcGroup);
    NPCS.forEach(n => {
      const h = buildHumanoid(n.color);
      n._y = surfaceTop(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      h.group.rotation.y = hash3(n.x, 5, n.z) * Math.PI * 2;
      const label = makeLabel(n.name); label.position.set(0, 2.2, 0); h.group.add(label);
      npcGroup.add(h.group);
    });
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
    const h = buildHumanoid(MINION_COLORS[entry.def.resource] || 0x999999);
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
    if (worldMode === 'home') {
      // 프라이빗 섬: 모든 미니언이 받침대에 나란히(실제 스카이블럭처럼 내 섬에서 일함)
      HOME_MINION_SLOTS.forEach((slot, si) => {
        if (si < entries.length) placeMinionMesh(P0, D0, entries[si], slot);
        else if (si < Math.min(P0.maxMinionSlots, HOME_MINION_SLOTS.length)) placeEmptySlotMesh(slot);
      });
      return;
    }
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
  function moveAxis(ax, amt) {
    if (amt === 0) return; P[ax] += amt;
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      if (!solidAt(x, y, z)) continue;
      if (ax === 'y') { if (amt > 0) { P.y = y - P.h - 0.0001; P.vy = 0; } else { P.y = y + 1 + 0.0001; P.vy = 0; P.onGround = true; } return; }
      if (ax === 'x') { if (amt > 0) P.x = x - P.w / 2 - 0.0001; else P.x = x + 1 + P.w / 2 + 0.0001; P.vx = 0; return; }
      if (ax === 'z') { if (amt > 0) P.z = z - P.w / 2 - 0.0001; else P.z = z + 1 + P.w / 2 + 0.0001; P.vz = 0; return; }
    }
  }
  function respawnAtHub(msg) {
    if (worldMode === 'home' || worldMode === 'visit') { P.x = 96.5; P.z = 100.5; P.y = surfaceTop(96, 100) + 0.02; }
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
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let speed = keys.ShiftLeft ? 2.6 : (sprint ? 5.8 : 4.3);
    if (inWater) speed *= 0.55;
    // 슈가 러시 인챈트 이동속도 보너스
    if (window.econApi && window.econApi.moveSpeedPct) speed *= 1 + window.econApi.moveSpeedPct() / 100;
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - sin * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P.vx = dx * speed; P.vz = dz * speed;
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
    spawnX = 96.5; spawnZ = 106.5; spawnY = surfaceTop(96, 106) + 0.02;
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
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onDown(e) {
    if (panelOpen()) return;
    const p = relPos(e); const cw = canvas.clientWidth;
    if (!isTouch) {
      if (!lookS.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 2) {
        if (worldMode === 'home') { homePlaceBlock(); return; }
        if (!fishing) startFishing();   // 우클릭: 물을 조준하면 낚시
        return;
      }
      if (fishing) { reelFishing(); return; }             // 낚시 중 좌클릭 = 낚아채기
      const mb = pickMob();
      if (mb) { P._atkCd = 0.45; attackMobHit(mb); mouseHeld = true; return; }   // 몬스터 공격(꾹 누르면 연속)
      const t = currentAim();
      if (t) { doInteract(t); return; }
      if (worldMode === 'home') { homeBreakBlock(); return; }   // 내 섬: 즉시 파괴(건축 모드)
      mouseHeld = true;                                    // 채집: 꾹 누르는 동안 진행
      return;
    }
    if (p.x < cw * 0.4 && moveT.id === -1) { moveT.active = true; moveT.id = e.pointerId; moveT.ox = moveT.x = p.x; moveT.oy = moveT.y = p.y; }
    else if (lookT.id === -1) {
      lookT.id = e.pointerId; lookT.lx = p.x; lookT.ly = p.y; lookT.moved = 0; lookT.downT = performance.now(); lookT.broke = false;
      const t = currentAim();
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; lookT.acted = true; }
      else if (t) { doInteract(t); lookT.acted = true; }
      else lookT.acted = false;
    }
  }
  function onMove(e) {
    if (panelOpen()) return;
    if (!isTouch) { if (lookS.locked) { P.yaw -= (e.movementX || 0) * 0.0024; P.pitch -= (e.movementY || 0) * 0.0024; clampPitch(); } return; }
    const p = relPos(e);
    if (e.pointerId === moveT.id) { moveT.x = p.x; moveT.y = p.y; }
    else if (e.pointerId === lookT.id) { const dx = p.x - lookT.lx, dy = p.y - lookT.ly; P.yaw -= dx * 0.005; P.pitch -= dy * 0.005; clampPitch(); lookT.lx = p.x; lookT.ly = p.y; lookT.moved = (lookT.moved || 0) + Math.abs(dx) + Math.abs(dy); }
  }
  function onUp(e) {
    if (e.button === 0) { mouseHeld = false; breaking = null; const cr = document.getElementById('econ3dCross'); if (cr && !fishing) cr.textContent = '+'; }
    if (!isTouch) { if (e.button === 0) gathering = false; return; }
    if (e.pointerId === moveT.id) { moveT.active = false; moveT.id = -1; }
    else if (e.pointerId === lookT.id) {
      gathering = false;
      // 내 섬: 짧은 탭(이동 없이 300ms 미만) = 블록 설치 / 길게 누름은 loop에서 파괴 처리
      if (worldMode === 'home' && !lookT.acted && !lookT.broke && (lookT.moved || 0) < 10 && performance.now() - lookT.downT < 300) homePlaceBlock();
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
  function homeBreakBlock() {
    if (worldMode !== 'home') return false;
    const t = raycastBlock(); if (!t) return false;
    if (isPortalBlock(t.x, t.y, t.z)) { if (typeof toast === 'function') toast('포털은 부술 수 없어요', false); return false; }
    const g0 = gatherBlocks()[t.id];
    if (g0 && g0.res && (g0.chance == null || Math.random() < g0.chance) && econApi().gatherBlock) econApi().gatherBlock(g0.res, g0.fam);
    world[widx(t.x, t.y, t.z)] = 0;
    if (econApi().setHomeEdit) econApi().setHomeEdit(t.x, t.y, t.z, 0);
    markBlockDirty(t.x, t.z); _mapDirty = true;
    return true;
  }
  function homePlaceBlock() {
    if (worldMode !== 'home') return false;
    const t = raycastBlock(); if (!t) return false;
    const nx = t.x + t.face[0], ny = t.y + t.face[1], nz = t.z + t.face[2];
    if (!inBounds(nx, ny, nz) || nx < HOME_BOUNDS.x0 || nx > HOME_BOUNDS.x1 || nz < HOME_BOUNDS.z0 || nz > HOME_BOUNDS.z1) return false;
    if (getBlockLocal(nx, ny, nz) !== 0) return false;
    // 플레이어 몸과 겹치면 설치 불가
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    if (nx + 1 > minX && nx < maxX && nz + 1 > minZ && nz < maxZ && ny + 1 > minY && ny < maxY) return false;
    const id = ID[BUILD_BLOCKS[selectedBlock]];
    world[widx(nx, ny, nz)] = id;
    if (econApi().setHomeEdit) econApi().setHomeEdit(nx, ny, nz, id);
    markBlockDirty(nx, nz); _mapDirty = true;
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
  function progressBreaking(dt) {
    if (worldMode === 'home' || worldMode === 'visit') return;   // 내 섬은 건축 모드(즉시 파괴/설치)
    const hit = raycastBlock();
    if (!hit) { breaking = null; return; }
    const g = gatherBlocks()[hit.id];
    if (!g) { breaking = null; return; }
    if (!breaking || breaking.x !== hit.x || breaking.y !== hit.y || breaking.z !== hit.z) {
      const api = econApi();
      const mul = api.toolMul ? api.toolMul(g.fam) : 1;
      breaking = { x: hit.x, y: hit.y, z: hit.z, t: 0, need: g.hard / Math.max(0.4, mul) };
    }
    breaking.t += dt;
    const cross = document.getElementById('econ3dCross');
    if (cross) cross.textContent = Math.min(99, Math.round(breaking.t / breaking.need * 100)) + '%';
    if (breaking.t < breaking.need) return;
    // 파괴 완료 → 자원 지급 + 블록 전환 + 재생 예약
    const api = econApi();
    if (g.res && (g.chance == null || Math.random() < g.chance) && api.gatherBlock) api.gatherBlock(g.res, g.fam);
    setW(hit.x, hit.y, hit.z, g.to);
    if (g.regen) regenQueue.push({ x: hit.x, y: hit.y, z: hit.z, back: g.back, at: performance.now() + g.regen * 1000 });
    markBlockDirty(hit.x, hit.z);
    if (cross) cross.textContent = '+';
    breaking = null;
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
        if (r.extra && r.extra.kind === 'seaCreature') spawnSeaCreature(fishing.x, fishing.z);
      }
    }
    const cross = document.getElementById('econ3dCross'); if (cross) cross.textContent = '+';
    stopFishing();
    return true;
  }

  /* ---------------- 인월드 몬스터(실제 스카이블럭식: 이름 위 [Lv] 이름 ❤HP, 변종/정예) ---------------- */
  const MOB_TYPES = {
    zombie: { name: '좀비', kind: 'humanoid', color: 0x3a7d3a, hp: 100, dmg: 12, xp: 6, coins: 5, speed: 1.7, drops: [{ key: 'rotten_flesh', n: 1 }, { key: 'rotten_flesh', n: 2, chance: 0.3 }], tierCap: 1 },
    crypt_ghoul: { name: '지하 구울', kind: 'humanoid', color: 0x5a8a5a, hp: 500, dmg: 40, xp: 25, coins: 15, speed: 2.2, drops: [{ key: 'rotten_flesh', n: 3 }, { key: 'gold', n: 1, chance: 0.25 }], tierCap: 3 },
    skeleton: { name: '스켈레톤', kind: 'humanoid', color: 0xcccccc, hp: 90, dmg: 15, xp: 7, coins: 6, speed: 1.8, drops: [{ key: 'bone', n: 1 }, { key: 'bone', n: 2, chance: 0.4 }], tierCap: 1 },
    spider: { name: '거미', kind: 'quad', color: 0x3a3040, hp: 80, dmg: 11, xp: 6, coins: 5, speed: 2.4, drops: [{ key: 'string', n: 1 }, { key: 'string', n: 2, chance: 0.35 }], tierCap: 1 },
    slime: { name: '슬라임', kind: 'slime', color: 0x5ac26a, hp: 120, dmg: 14, xp: 8, coins: 7, speed: 1.4, drops: [{ key: 'emerald', n: 1, chance: 0.08 }], tierCap: 2 },
    wolf: { name: '늑대', kind: 'quad', color: 0x9a9a9a, hp: 160, dmg: 20, xp: 10, coins: 9, speed: 2.8, drops: [{ key: 'bone', n: 2 }], tierCap: 2 },
    sea_walker: { name: '바다 보행자', kind: 'humanoid', color: 0x2a6a8a, hp: 300, dmg: 25, xp: 20, coins: 18, speed: 1.6, drops: [{ key: 'prismarine', n: 2 }, { key: 'sponge', n: 1, chance: 0.15 }], tierCap: 3 },
    enderman: { name: '엔더맨', kind: 'tall', color: 0x1a1a22, hp: 800, dmg: 60, xp: 40, coins: 30, speed: 2.6, drops: [{ key: 'ender_pearl', n: 1, chance: 0.5 }], tierCap: 4 },
    blaze: { name: '블레이즈', kind: 'slime', color: 0xe8a020, hp: 600, dmg: 50, xp: 35, coins: 25, speed: 2.0, drops: [{ key: 'blaze_rod', n: 1, chance: 0.6 }], tierCap: 4 },
  };
  // 스폰 구역: 실제 스카이블럭처럼 특정 지역에 특정 몬스터(레벨 범위 내 변종 + 5% 정예 ★)
  let SPAWN_AREAS = [
    { world: 'hub', x: 38, z: 152, r: 18, types: ['zombie', 'skeleton'], lv: [1, 6], cap: 6, respawn: 9 },      // 슬레이어 황무지: 묘지
    { world: 'hub', x: 26, z: 160, r: 10, types: ['crypt_ghoul'], lv: [24, 30], cap: 2, respawn: 20 },          // 황무지 심부
    { world: 'hub', x: 26, z: 87, r: 9, types: ['slime'], lv: [3, 8], cap: 3, respawn: 14 },                    // 광산 챔버
    { world: 'hub', x: 38, z: 34, r: 14, types: ['wolf'], lv: [6, 12], cap: 3, respawn: 16 },                   // 숲
    { world: 'hub', x: 152, z: 40, r: 12, types: ['spider'], lv: [2, 6], cap: 4, respawn: 12 },                 // 농장 외곽
  ];
  SPAWN_AREAS = SPAWN_AREAS.concat([
    { world: 'spider', x: 64, z: 64, r: 44, types: ['spider'], lv: [2, 13], cap: 12, respawn: 7 },
    { world: 'spider', x: 64, z: 52, r: 12, types: ['spider'], lv: [12, 13], cap: 3, respawn: 15 },
    { world: 'deep', x: 48, z: 48, r: 30, types: ['slime'], lv: [5, 10], cap: 6, respawn: 12 },
    { world: 'deep', x: 48, z: 48, r: 26, types: ['zombie'], lv: [10, 20], cap: 4, respawn: 14 },
    { world: 'gold', x: 56, z: 46, r: 26, types: ['zombie', 'skeleton'], lv: [8, 15], cap: 5, respawn: 12 },
    { world: 'nether', x: 64, z: 40, r: 16, types: ['blaze'], lv: [12, 25], cap: 5, respawn: 13 },
    { world: 'nether', x: 64, z: 80, r: 30, types: ['skeleton'], lv: [10, 20], cap: 5, respawn: 12 },
    { world: 'end', x: 64, z: 64, r: 44, types: ['enderman'], lv: [42, 50], cap: 6, respawn: 14 },
    { world: 'end', x: 64, z: 30, r: 9, types: ['enderman'], lv: [55, 55], cap: 2, respawn: 25 },   // 젤롯 둥지
    { world: 'park', x: 72, z: 72, r: 40, types: ['wolf'], lv: [8, 15], cap: 4, respawn: 15 },
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
  function buildMobMesh(def, elite) {
    let h;
    if (def.kind === 'quad') h = buildQuadruped(def.color, 0.9);
    else if (def.kind === 'slime') { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.85 })); m.position.y = 0.45; g.add(m); h = { group: g, legs: [] }; }
    else if (def.kind === 'tall') { h = buildHumanoid(def.color); h.group.scale.set(1, 1.45, 1); }
    else h = buildHumanoid(def.color);
    if (elite) h.group.scale.multiplyScalar(1.25);
    return h;
  }
  function spawnMob(area, typeKey, lv, customDef) {
    const def = customDef || MOB_TYPES[typeKey]; if (!def) return null;
    const a = Math.random() * Math.PI * 2, rr = Math.random() * area.r * 0.8;
    const x = area.x + Math.cos(a) * rr, z = area.z + Math.sin(a) * rr;
    const y = surfaceTop(Math.floor(x), Math.floor(z));
    if (y <= SEA + 1 && worldMode === 'hub') return null;   // 물 위 스폰 방지
    const elite = !customDef && Math.random() < 0.05;
    const mul = 1 + (lv - 1) * 0.35;
    const mob = {
      type: typeKey, def, lv, elite,
      maxHp: Math.round(def.hp * mul * (elite ? 2.5 : 1)),
      dmg: Math.round(def.dmg * mul * (elite ? 1.5 : 1)),
      state: 'wander', tx: x, tz: z, atkCd: 0, hitIdx: 0, area, walkT: Math.random() * 6,
    };
    mob.hp = mob.maxHp;
    const h = buildMobMesh(def, elite);
    mob.mesh = h.group; mob.legs = h.legs || []; mob.legL = h.legL; mob.legR = h.legR;
    mob.mesh.position.set(x, y, z);
    const lbl = mkMobLabel(mob);
    lbl.position.set(0, def.kind === 'tall' ? 3.2 : 2.4, 0);
    mob.mesh.add(lbl);
    scene.add(mob.mesh);
    mobs.push(mob);
    return mob;
  }
  function spawnSeaCreature(x, z) {
    const area = { x, z, r: 3, world: worldMode };
    const mob = spawnMob(area, 'sea_walker', 5 + Math.floor(Math.random() * 20));
    if (mob && typeof toast === 'function') toast('🌊 바다 생물이 낚였다! 전투 준비!', false);
    if (mob) { mob.state = 'chase'; }
  }
  function clearMobs() { for (const m of mobs) { scene.remove(m.mesh); disposeGroup(m.mesh); } mobs = []; }
  function tickMobs(dt) {
    // 스폰 유지(구역별 밀도 관리)
    _spawnT += dt;
    if (_spawnT > 2.5) {
      _spawnT = 0;
      for (const area of SPAWN_AREAS) {
        if (area.world !== worldMode) continue;
        const cur = mobs.filter(m => m.area === area && !m.dead).length;
        if (cur < area.cap) {
          const t = area.types[Math.floor(Math.random() * area.types.length)];
          spawnMob(area, t, area.lv[0] + Math.floor(Math.random() * (area.lv[1] - area.lv[0] + 1)));
        }
      }
    }
    const api = econApi();
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (m.dead) continue;
      const mp = m.mesh.position;
      const dx = P.x - mp.x, dz = P.z - mp.z;
      const distP = Math.hypot(dx, dz);
      const aggro = m.elite ? 14 : 10;
      if (distP < aggro && Math.abs(P.y - mp.y) < 4) m.state = 'chase';
      else if (distP > aggro * 2) m.state = 'wander';
      let mvx = 0, mvz = 0;
      if (m.state === 'chase') {
        if (distP > 1.5) { mvx = dx / distP; mvz = dz / distP; }
        m.atkCd -= dt;
        if (distP < 1.8 && m.atkCd <= 0) {
          m.atkCd = 1.3;
          const defPct = api.defensePct ? api.defensePct(php && php.hp <= php.max * 0.3) : 0;
          damagePlayer(m.dmg * (0.85 + Math.random() * 0.3) * (1 - defPct));
        }
      } else {
        const wdx = m.tx - mp.x, wdz = m.tz - mp.z;
        if (Math.hypot(wdx, wdz) < 0.8) { const a = Math.random() * Math.PI * 2, rr = Math.random() * m.area.r * 0.8; m.tx = m.area.x + Math.cos(a) * rr; m.tz = m.area.z + Math.sin(a) * rr; }
        else { const l = Math.hypot(wdx, wdz); mvx = wdx / l * 0.4; mvz = wdz / l * 0.4; }
      }
      if (mvx || mvz) {
        const sp = m.def.speed * (m.state === 'chase' ? 1 : 0.5);
        const nx = mp.x + mvx * sp * dt, nz = mp.z + mvz * sp * dt;
        const ny = surfaceTop(Math.floor(nx), Math.floor(nz));
        if (ny - mp.y < 1.6 && ny > SEA) { mp.x = nx; mp.z = nz; mp.y += (ny - mp.y) * Math.min(1, dt * 8); }
        m.mesh.rotation.y = Math.atan2(mvx, mvz);
        m.walkT += dt * 7;
        const sw = Math.sin(m.walkT) * 0.5;
        if (m.legL) { m.legL.rotation.x = sw; m.legR.rotation.x = -sw; }
        for (let li = 0; li < m.legs.length; li++) m.legs[li].rotation.x = (li % 2 ? sw : -sw);
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
      if (Math.hypot(px, py, pz) < (m.elite ? 1.2 : 0.95) && along < bestAlong) { best = m; bestAlong = along; }
    }
    return best;
  }
  function attackMobHit(m) {
    const api = econApi(); if (!api.attackMob) return;
    const r = api.attackMob({ hitIdx: m.hitIdx, hp: m.hp, maxHp: m.maxHp, isBoss: false });
    m.hitIdx++;
    m.hp -= r.dmg;
    if (php && r.heal) php.hp = Math.min(php.max, php.hp + r.heal);
    spawnDmgText(m.mesh.position, r.dmg, r.crit);
    // 넉백
    const kb = 0.7; const dx = m.mesh.position.x - P.x, dz = m.mesh.position.z - P.z; const l = Math.hypot(dx, dz) || 1;
    m.mesh.position.x += dx / l * kb; m.mesh.position.z += dz / l * kb;
    m.state = 'chase';
    if (m.hp <= 0) {
      m.dead = true;
      const lvMul = 1 + (m.lv - 1) * 0.12;
      if (api.mobKilled) api.mobKilled({
        name: `[Lv ${m.lv}] ${m.def.name}${m.elite ? '★' : ''}`,
        coins: Math.round(m.def.coins * lvMul * (m.elite ? 3 : 1)),
        xp: Math.round(m.def.xp * lvMul * (m.elite ? 3 : 1)),
        drops: m.def.drops, tierCap: m.def.tierCap + (m.elite ? 1 : 0),
      });
      scene.remove(m.mesh); disposeGroup(m.mesh);
      mobs.splice(mobs.indexOf(m), 1);
      if (worldMode === 'dungeon') onDungeonMobDead(m);
    } else drawMobLabel(m);
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
  function tickPlayerVitals(dt) {
    ensurePhp();
    if (php.hp < php.max && performance.now() - php.lastHitAt > 5000) {
      php.hp = Math.min(php.max, php.hp + php.max * 0.02 * dt);   // 전투 이탈 5초 후 초당 2% 재생
      updateHpHud();
    }
  }
  let _hpHudT = 0;
  function updateHpHud() {
    const bar = document.getElementById('econ3dHpFill'), txt = document.getElementById('econ3dHpTxt');
    if (bar && php) bar.style.width = Math.max(0, php.hp / php.max * 100) + '%';
    if (txt && php) txt.textContent = `❤ ${Math.max(0, Math.ceil(php.hp))}/${php.max}`;
  }

  /* ---------------- 상호작용(콘 조준) ---------------- */
  function buildStaticInteractables() {
    interactables = [];
    if (worldMode === 'hub') {
      NPCS.forEach(n => interactables.push({ type: 'npc', ref: n, x: n.x + 0.5, y: n._y + 1.0, z: n.z + 0.5 }));
      NODES.forEach(n => interactables.push({ type: 'node', ref: n, x: n.x + 0.5, y: n._y + 0.6, z: n.z + 0.5 }));
      FAIRY_SPOTS.forEach(fs => interactables.push({ type: 'fairy', ref: fs, x: fs.x + 0.5, y: fs._y + 0.6, z: fs.z + 0.5 }));
    }
    const portal = PORTALS[worldMode];
    if (portal) {
      const py = surfaceTop(portal.x, portal.z);
      interactables.push({ type: 'portal', ref: portal, x: portal.x + 0.5, y: py + 1.5, z: portal.z + 0.5 });
    }
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
    if (worldMode === 'hub') {
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
  /* ---------------- 멀티: 다른 플레이어 아바타(허브 공유 월드) ---------------- */
  function makeOtherAvatar(name) {
    const h = buildHumanoid(0x2b6cb0);   // 파란 스킨 = 다른 플레이어
    const tag = makeLabel(String(name || 'Player').slice(0, 12));
    tag.position.set(0, 2.35, 0);
    h.group.add(tag);
    scene.add(h.group);
    return { mesh: h.group, legL: h.legL, legR: h.legR, walkT: 0, walkAmp: 0, tx: null, ty: null, tz: null, tyaw: 0 };
  }
  function removeOtherAvatar(id) {
    const o = others[id]; if (!o) return;
    if (scene) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    delete others[id];
  }
  function updateNetAvatars(dt) {
    const n = window.econNet; if (!n || !n.isActive()) { for (const id in others) removeOtherAvatar(id); return; }
    const peers = n.peers();
    // 같은 허브(공유 월드)에 있는 플레이어만 렌더 — 프라이빗 섬은 각자의 공간
    for (const id in peers) {
      const p = peers[id];
      const sameWorld = worldMode === 'hub' && p.world === 'hub';
      if (!sameWorld) { if (others[id]) removeOtherAvatar(id); continue; }
      let o = others[id];
      if (!o) { o = others[id] = makeOtherAvatar(p.name); o.mesh.position.set(p.x, p.y, p.z); }
      o.tx = p.x; o.ty = p.y; o.tz = p.z; o.tyaw = p.yaw || 0;
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
    else if (t.type === 'minion' || t.type === 'emptySlot') openPanelForZone('hub', 'minions');
    else if (t.type === 'fairy') { econApi().collectFairySoul(t.ref.id); refreshFairyVisibility(); }
    else if (t.type === 'player') openPanelForZone('hub', 'multi');
    else if (t.type === 'warp') warpTo(t.ref.dest);
    else if (t.type === 'portal') travelTo(t.ref.target);
  }
  function showPanel() {
    const wrap = document.getElementById('econ3dPanelWrap'); if (wrap) wrap.style.display = 'flex';
    if (lookS.locked && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
    gathering = false;
  }
  function hidePanel() { const wrap = document.getElementById('econ3dPanelWrap'); if (wrap) wrap.style.display = 'none'; }

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
      const isl = ISLANDS.find(i => i.key === key);
      name = isl ? isl.name : '';
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
  // 건축 팔레트 바(내 섬에서만 표시) + 선택 상태 갱신
  function updateBuildHud() {
    const bar = document.getElementById('econ3dBuildBar'); if (!bar) return;
    bar.style.display = worldMode === 'home' ? 'flex' : 'none';
    const btns = bar.querySelectorAll('.econ3d-blockbtn');
    btns.forEach((b, i) => b.classList.toggle('is-sel', i === selectedBlock));
  }
  // 포털 표식(보라 발광판 + 라벨)
  let portalMarker = null;
  // 워프 패드 마커(보라 빔 + 라벨)
  function buildWarpMarkers() {
    if (!scene) return;
    if (!propGroup) { propGroup = new THREE.Group(); scene.add(propGroup); }
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
      <div class="econ3d-hpwrap"><div class="econ3d-hpbar"><div id="econ3dHpFill" class="econ3d-hpfill"></div></div><span id="econ3dHpTxt" class="econ3d-hptxt">❤</span></div>
      <div class="econ3d-buildbar" id="econ3dBuildBar" style="display:none">${BUILD_BLOCKS.map((bk, i) => `<button class="econ3d-blockbtn ${i === selectedBlock ? 'is-sel' : ''}" data-act="econ3d_block" data-i="${i}" title="${bk}"><span class="econ3d-blockchip" data-bk="${bk}"></span></button>`).join('')}</div>
      ${isTouch ? '<div class="econ3d-jump" data-act="econ3d_jump">⤒</div>' : '<div class="econ3d-controlhint">WASD 이동 · W 더블탭 달리기 · 좌클릭 공격/꾹 눌러 채집 · 우클릭 낚시(물) · E/클릭 NPC · 더블점프 · M 지도</div>'}
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
      // 터치 길게 누름 = 블록 파괴(내 섬, 350ms)
      if (isTouch && worldMode === 'home' && lookT.id !== -1 && !lookT.acted && !lookT.broke && (lookT.moved || 0) < 10 && performance.now() - lookT.downT > 350) {
        lookT.broke = true; homeBreakBlock();
      }
      // 인월드 게임플레이 틱: 채집 홀드/재생성/낚시/몬스터/피해 텍스트/체력
      if (!panelOpen()) {
        P._atkCd = Math.max(0, (P._atkCd || 0) - dt);
        if (mouseHeld && lookS.locked) {
          const mb2 = pickMob();
          if (mb2 && P._atkCd <= 0) { P._atkCd = 0.45; attackMobHit(mb2); }
          else if (!mb2) progressBreaking(dt);
        }
        if (isTouch && worldMode !== 'home' && worldMode !== 'visit' && lookT.id !== -1 && (lookT.moved || 0) < 10 && performance.now() - lookT.downT > 250) progressBreaking(dt);
        tickMobs(dt); tickFishing(); tickPlayerVitals(dt); tickWarpPads(dt);
      }
      tickRegen(); tickDmgTexts(dt);
      _hpHudT += dt; if (_hpHudT > 0.5) { _hpHudT = 0; updateHpHud(); }
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
        _hudT = 0; updateHud(); rebuildMinionVisuals(false);
        if (_mapDirty) { _mapDirty = false; buildMinimapBase(); }
        drawMinimap();
      }
      renderer.render(scene, camera);
    } catch (e) { console.error('econ3d loop', e); }
  }

  /* ---------------- 시작/종료 ---------------- */
  function start() {
    if (typeof THREE === 'undefined') { if (typeof app === 'function') app().innerHTML = fallbackErr('3D 라이브러리를 불러오지 못했어요(네트워크 확인).'); return; }
    if (typeof setScreen === 'function') setScreen('econ');
    if (typeof app === 'function') app().innerHTML = screenHTML();
    canvas = document.getElementById('econ3dCanvas');
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { if (typeof app === 'function') app().innerHTML = fallbackErr('이 기기/브라우저가 3D(WebGL)를 지원하지 않아요.'); return; }
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { try { buildAtlas(); buildIslandMesh(); contextLost = false; } catch (err) { console.error('econ3d ctx restore', err); } }, false);
    scene = new THREE.Scene(); scene.background = null; scene.fog = new THREE.Fog(0xbfe0f5, 60, 150);
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
    buildAtlas();
    if (!world) genWorld();
    buildIslandMesh();
    buildNpcMeshes();
    buildNodeMeshes();
    buildFairyMeshes();
    buildClouds();
    buildAmbientMobs();
    buildStaticInteractables();
    refreshFairyVisibility();
    setupOutline();
    resetPlayerToSpawn();
    buildMinimapBase();
    buildPortalMarker();
    updateBuildHud();
    resize(); window.addEventListener('resize', resize);
    bindInput(); running = true; lastT = 0; contextLost = false;
    rebuildMinionVisuals(true);
    updateHud();
    // 진짜 처음 시작(세이브 없음): 실제 스카이블럭처럼 프라이빗 섬에서 시작
    const api0 = econApi();
    if (api0.isFresh && api0.isFresh()) {
      travelTo('home');
      if (typeof toast === 'function') setTimeout(() => toast('🌱 스카이블럭에 온 걸 환영해요! 나무를 캐서 도구를 만들고, 포탈로 허브에 가보세요', true), 600);
    }
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
  function act(a, el) {
    switch (a) {
      case 'econ3d_jump': keys.Space = true; setTimeout(() => { keys.Space = false; }, 120); return true;
      case 'econ3d_panel_close': hidePanel(); return true;
      case 'econ3d_map': toggleMinimapSize(); return true;
      case 'econ3d_block': selectedBlock = Number(el.dataset.i) || 0; updateBuildHud(); return true;
    }
    return false;
  }

  window.economy3dStart = start;
  window.economy3dStop = stop;
  window.economy3dAct = act;
  window.economy3dVisit = travelVisit;   // 멀티: 다른 플레이어 섬 방문(economy-net.js가 호출)

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
      raycastBlock, homeBreakBlock, homePlaceBlock, BUILD_BLOCKS,
      setSelectedBlock: i => { selectedBlock = i; }, getSelectedBlock: () => selectedBlock,
      flushWorldEdits,
      // V4: 멀티(아바타/방문)
      travelVisit, updateNetAvatars, others: () => others, getVisitData: () => visitData,
      // V5: 테마 월드/인월드 게임플레이
      WORLD_DEFS, WARPS, MOB_TYPES, SPAWN_AREAS, gatherBlocks, regenQueue: () => regenQueue,
      loadWorldForTest: (key) => { const def = WORLD_DEFS[key]; W = def.size[0]; H = def.size[1]; Dp = def.size[2]; worldMode = key; if (key === 'hub') genWorld(); else if (key === 'home') genHome(); else def.gen(); return world; },
      getDims: () => ({ W, H, Dp }),
      spawnMobForTest: (area, type, lv) => spawnMob(area, type, lv),
      progressBreaking, tickRegen, pickMob, mobs: () => mobs,
      startDungeon3d, getDungeonState: () => dungeonState, onDungeonMobDead, spawnDungeonMob,
    };
  }
})();
