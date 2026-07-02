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

  const W = 192, H = 48, Dp = 192;
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
    { key: 'shopkeeper', name: '상점 주인', zone: 'hub', tab: 'shop', x: 86, z: 88, color: 0x3a6ee0 },
    { key: 'bankTeller', name: '은행원', zone: 'hub', tab: 'bank', x: 106, z: 88, color: 0xf2d75c },
    { key: 'minionManager', name: '일꾼 관리소장', zone: 'hub', tab: 'minions', x: 86, z: 104, color: 0x6aa84f },
    { key: 'petKeeper', name: '펫 상인', zone: 'hub', tab: 'pets', x: 106, z: 104, color: 0xe048c4 },
    { key: 'enchanter', name: '마법부여사', zone: 'hub', tab: 'enchant', x: 96, z: 82, color: 0x9365b8 },
    { key: 'auctioneer', name: '경매인', zone: 'hub', tab: 'deals', x: 90, z: 96, color: 0xc0392b },
    { key: 'reforgeSmith', name: '재련 대장장이', zone: 'hub', tab: 'reforge', x: 102, z: 96, color: 0x6b5436 },
    { key: 'classTrainer', name: '직업 훈련관', zone: 'hub', tab: 'stats', x: 96, z: 110, color: 0x2c82c9 },
    { key: 'mineForeman', name: '광산 감독관', zone: 'mine', x: 46, z: 90, color: 0x787878 },
    { key: 'farmForeman', name: '농장 관리인', zone: 'farm', x: 148, z: 44, color: 0xd8b23a },
    { key: 'lumberjack', name: '벌목꾼', zone: 'forest', x: 42, z: 32, color: 0x8a6a3a },
    { key: 'fisherman', name: '늙은 낚시꾼', zone: 'dock', x: 152, z: 152, color: 0x41a85f },
    { key: 'slayerMaster', name: '슬레이어 대장', zone: 'slayerden', x: 38, z: 148, color: 0x2a2040 },
    { key: 'dungeonGatekeeper', name: '던전 문지기', zone: 'dungeonentrance', x: 96, z: 148, color: 0x5a4327 },
    { key: 'tia', name: '요정 티아', zone: 'hub', tab: 'talismans', x: 96, z: 20, color: 0xffb7dd, island: 'shrine' },
  ];
  // 채집 노드(존별 실제 위치)
  const NODES = [
    { zone: 'mine', x: 26, z: 86 }, { zone: 'mine', x: 22, z: 90 }, { zone: 'mine', x: 30, z: 82 }, { zone: 'mine', x: 38, z: 96 },
    { zone: 'farm', x: 148, z: 34 }, { zone: 'farm', x: 156, z: 40 }, { zone: 'farm', x: 162, z: 34 },
    { zone: 'forest', x: 34, z: 40 }, { zone: 'forest', x: 28, z: 30 }, { zone: 'forest', x: 42, z: 24 },
    { zone: 'dock', x: 158, z: 158 }, { zone: 'dock', x: 164, z: 162 }, { zone: 'dock', x: 150, z: 164 },
  ];
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
  };
  const HOME_MINION_SLOTS = [];
  for (let r = 0; r < 3; r++) for (let cIdx = 0; cIdx < 5; cIdx++) HOME_MINION_SLOTS.push([100 + cIdx * 3, 90 + r * 5]);
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
  }

  /* ---- 프라이빗 섬(스카이블럭의 심장 — 공허에 뜬 나만의 섬, 자유 건축) ---- */
  function buildPortalFrame(cx, cz) {
    const y = surfaceTop(cx, cz);
    for (let dx = -2; dx <= 2; dx++) { setW(cx + dx, y, cz, ID.obsidian); setW(cx + dx, y + 4, cz, ID.obsidian); }
    for (let dy = 0; dy <= 4; dy++) { setW(cx - 2, y + dy, cz, ID.obsidian); setW(cx + 2, y + dy, cz, ID.obsidian); }
    setW(cx - 2, y + 5, cz, ID.glowstone); setW(cx + 2, y + 5, cz, ID.glowstone);
  }
  function genHome() {
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
    // 일꾼 받침대 15자리(동쪽 정렬)
    HOME_MINION_SLOTS.forEach(s => { const y = surfaceTop(s[0], s[1]); setW(s[0], y - 1, s[1], ID.stone_bricks); });
    // 허브 귀환 포털 + 꽃 장식
    buildPortalFrame(PORTALS.home.x, PORTALS.home.z);
    for (let i = 0; i < 10; i++) {
      const x = cx + Math.floor((hash3(i, 81, 3) - 0.5) * r * 1.4), z = cz + Math.floor((hash3(i, 82, 7) - 0.5) * r * 1.4);
      const y = surfaceTop(x, z);
      if (getBlockLocal(x, y - 1, z) === ID.grass) setW(x, y, z, hash3(i, 83, 1) < 0.5 ? ID.flower_yellow : ID.tall_grass);
    }
    // 저장된 블록 편집 적용(설치/파괴 영속)
    const edits = econApi().getHomeEdits ? econApi().getHomeEdits() : {};
    for (const k in edits) {
      const p = k.split(',').map(Number);
      if (inBounds(p[0], p[1], p[2])) world[widx(p[0], p[1], p[2])] = edits[k];
    }
  }
  // 월드 이동(허브 ↔ 프라이빗 섬)
  function travelTo(mode) {
    if (mode === worldMode) return;
    if (worldMode === 'hub') worldHubCache = world;   // 허브 지형 캐시
    worldMode = mode;
    disposeIslandMeshes();
    [npcGroup, nodeGroup, minionGroup, fairyGroup, propGroup].forEach(g => { if (g && scene) { scene.remove(g); disposeGroup(g); } });
    npcGroup = nodeGroup = minionGroup = fairyGroup = propGroup = null;
    ambientMobs = []; fairyMeshes = {}; _minionSig = ''; dynamicInteractables = [];
    if (mode === 'home') { genHome(); }
    else { world = worldHubCache || (genWorld(), world); }
    buildIslandMesh(mode === 'home' ? HOME_BOUNDS : null);
    if (mode === 'hub') { buildNpcMeshes(); buildNodeMeshes(); buildFairyMeshes(); buildAmbientMobs(); refreshFairyVisibility(); }
    else { propGroup = new THREE.Group(); scene.add(propGroup); }
    buildStaticInteractables();
    rebuildMinionVisuals(true);
    buildMinimapBase();
    buildPortalMarker();
    if (mode === 'home') { P.x = 96.5; P.z = 100.5; P.y = surfaceTop(96, 100) + 0.02; P.yaw = Math.PI; }
    else { resetPlayerToSpawn(); }
    P.vx = P.vy = P.vz = 0;
    curBannerKey = '';
    updateBuildHud();
    if (typeof toast === 'function') toast(mode === 'home' ? '🏝️ 나의 섬에 도착! (좌클릭 파괴 · 우클릭 설치)' : '🏘️ 허브로 돌아왔어요', true);
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
    // 건물 6채(북서: 상점, 북동: 은행, 서: 일꾼, 동: 펫, 북: 인챈트 탑, 남: 훈련소)
    buildHouse(80, 82, 7, 7, 16, ID.bricks, ID.oak_planks);          // 상점
    buildHouse(105, 82, 7, 7, 16, ID.sandstone, ID.oak_planks);      // 은행
    buildHouse(80, 100, 7, 7, 16, ID.oak_planks, ID.spruce_planks);  // 일꾼 관리소
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
  function disposeIslandMeshes() { ['opaque', 'water', 'plant', 'lava'].forEach(k => { const m = islandMeshes[k]; if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); islandMeshes[k] = null; } }); }
  function buildIslandMesh(bounds) {
    const bx0 = bounds ? bounds.x0 : 0, bx1 = bounds ? bounds.x1 : W - 1;
    const bz0 = bounds ? bounds.z0 : 0, bz1 = bounds ? bounds.z1 : Dp - 1;
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
    disposeIslandMeshes();
    if (B.pos.length) islandMeshes.opaque = makeMesh(B.pos, B.col, B.uv, B.idx, blockMat);
    if (Wt.pos.length) islandMeshes.water = makeMesh(Wt.pos, Wt.col, Wt.uv, Wt.idx, waterMat);
    if (Pl.pos.length) islandMeshes.plant = makeMesh(Pl.pos, Pl.col, Pl.uv, Pl.idx, plantMat);
    if (Lv.pos.length) islandMeshes.lava = makeMesh(Lv.pos, Lv.col, Lv.uv, Lv.idx, lavaMat);
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
    const label = makeLabel('+ 일꾼 배치'); label.position.set(0, 1.0, 0); g.add(label);
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
    if (worldMode === 'home') { P.x = 96.5; P.z = 100.5; P.y = surfaceTop(96, 100) + 0.02; }
    else { P.x = spawnX; P.y = spawnY; P.z = spawnZ; }
    P.vx = P.vy = P.vz = 0;
    if (msg && typeof toast === 'function') toast(msg, false);
  }
  function collide(dt) {
    let mf = 0, ms = 0;
    if (keys.KeyW) mf += 1; if (keys.KeyS) mf -= 1; if (keys.KeyA) ms -= 1; if (keys.KeyD) ms += 1;
    if (moveT.active) { const dx = moveT.x - moveT.ox, dy = moveT.y - moveT.oy; if (Math.abs(dx) > 8) ms += dx > 0 ? 1 : -1; if (Math.abs(dy) > 8) mf += dy < 0 ? 1 : -1; }
    const inWater = feetInWater();
    const sprint = (keys.ControlLeft || keys.ControlRight) && mf > 0 && !inWater;
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let speed = keys.ShiftLeft ? 2.6 : (sprint ? 5.8 : 4.3);
    if (inWater) speed *= 0.55;
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - sin * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P.vx = dx * speed; P.vz = dz * speed;
    const wantJump = keys.Space || (moveT.active && (moveT.y - moveT.oy) < -34);
    const jumpEdge = wantJump && !P._prevJump;   // 점프 키를 새로 누른 순간(더블점프 판정)
    P._prevJump = wantJump;
    if (inWater) { P.vy -= 9 * dt; if (wantJump) P.vy += 22 * dt; if (P.vy < -4) P.vy = -4; if (P.vy > 5) P.vy = 5; P._djUsed = false; }
    else {
      P.vy -= 32 * dt; if (P.vy < -78) P.vy = -78;
      if (wantJump && P.onGround) { P.vy = 8.5; P.onGround = false; }
      else if (jumpEdge && !P.onGround && !P._djUsed) { P.vy = 8.0; P._djUsed = true; }   // 더블점프(메이플 감성)
    }
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    if (P.onGround) P._djUsed = false;
    if (feetInLava()) respawnAtHub('앗 뜨거워! 마을로 긴급 귀환했어요');
    if (P.y < 1) respawnAtHub(worldMode === 'home' ? '공허에 떨어졌다! 섬으로 귀환' : '마을로 귀환했어요');
  }
  function resetPlayerToSpawn() {
    spawnX = 96.5; spawnZ = 106.5; spawnY = surfaceTop(96, 106) + 0.02;
    P.x = spawnX; P.y = spawnY; P.z = spawnZ; P.vx = P.vy = P.vz = 0; P.yaw = 0; P.pitch = 0; P.onGround = false;
  }

  /* ---------------- 입력 ---------------- */
  function panelOpen() { const wrap = document.getElementById('econ3dPanelWrap'); return !!(wrap && wrap.style.display !== 'none'); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onPLC() { lookS.locked = (document.pointerLockElement === canvas); }
  function onKey(e) { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'Escape') hidePanel(); if (e.code === 'KeyM') toggleMinimapSize(); }
  function onKeyUp(e) { keys[e.code] = false; }
  function onDown(e) {
    if (panelOpen()) return;
    const p = relPos(e); const cw = canvas.clientWidth;
    if (!isTouch) {
      if (!lookS.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 2) { if (worldMode === 'home') homePlaceBlock(); return; }   // 우클릭: 블록 설치(내 섬)
      const t = currentAim();
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; }
      else if (t) doInteract(t);
      else if (worldMode === 'home') homeBreakBlock();   // 좌클릭: 블록 파괴(내 섬)
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
    world[widx(t.x, t.y, t.z)] = 0;
    if (econApi().setHomeEdit) econApi().setHomeEdit(t.x, t.y, t.z, 0);
    _meshDirty = true; _mapDirty = true;
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
    _meshDirty = true; _mapDirty = true;
    return true;
  }
  function flushWorldEdits() {
    if (_meshDirty) { _meshDirty = false; buildIslandMesh(worldMode === 'home' ? HOME_BOUNDS : null); }
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
    const py = surfaceTop(portal.x, portal.z);
    interactables.push({ type: 'portal', ref: portal, x: portal.x + 0.5, y: py + 1.5, z: portal.z + 0.5 });
  }
  function currentAim() {
    const d = lookDir(); let best = null, bestDot = DOT_MIN;
    const api = econApi();
    const all = interactables.concat(dynamicInteractables);
    for (const it of all) {
      if (it.type === 'fairy' && api.fairySoulCollected(it.ref.id)) continue;
      const vx = it.x - P.x, vy = it.y - (P.y + P.eye), vz = it.z - P.z;
      const dist = Math.hypot(vx, vy, vz); if (dist > REACH || dist < 0.01) continue;
      const dot = (vx * d.x + vy * d.y + vz * d.z) / dist;
      if (dot > bestDot) { bestDot = dot; best = it; }
    }
    return best;
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
  function dayFactor() {
    const f = (worldTime % DAY_LEN) / DAY_LEN;
    const sun = Math.cos((f - 0.25) * 2 * Math.PI);
    const t = (sun + 1) / 2; const s = t * t * (3 - 2 * t);
    return 0.30 + s * 0.70;
  }
  let _lastSkyD = -1;
  function updateSky() {
    const d = dayFactor();
    const k = Math.max(0, Math.min(1, (d - 0.30) / 0.70));
    if (scene.fog) scene.fog.color.set(mixHex('#0a0e18', '#9fc6ea', k));
    if (Math.abs(d - _lastSkyD) > 0.02) {
      _lastSkyD = d;
      const el = document.getElementById('econ3dSky');
      if (el) {
        const top = mixHex('#04060c', '#3f7fc8', k), mid = mixHex('#070b14', '#76adde', k);
        let hor = mixHex('#0c1320', '#bfe0f5', k);
        const dusk = 1 - Math.abs(k - 0.5) * 2;
        if (dusk > 0.08) hor = mixHex(hor, '#f4a25a', dusk * 0.55);
        el.style.background = `linear-gradient(${top} 0%, ${mid} 55%, ${hor} 100%)`;
      }
    }
    if (blockMat) blockMat.color.setScalar(d);
    if (waterMat) waterMat.color.setScalar(d);
    if (plantMat) plantMat.color.setScalar(d);
    if (lavaMat) lavaMat.color.setScalar(Math.max(0.7, d));
  }

  /* ---------------- 존 배너 + 미니맵 + HUD ---------------- */
  function updateBanner() {
    let key, name;
    if (worldMode === 'home') { key = 'home'; name = '🏝️ 나의 섬'; }
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
  function buildPortalMarker() {
    if (portalMarker) { scene.remove(portalMarker); disposeGroup(portalMarker); portalMarker = null; }
    const p = PORTALS[worldMode];
    const y = surfaceTop(p.x, p.z);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.6), new THREE.MeshBasicMaterial({ color: 0xb04ae8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    fill.position.set(p.x + 0.5, y + 2.2, p.z + 0.5);
    g.add(fill);
    const label = makeLabel(p.label); label.position.set(p.x + 0.5, y + 4.8, p.z + 0.5); g.add(label);
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
      <div class="econ3d-buildbar" id="econ3dBuildBar" style="display:none">${BUILD_BLOCKS.map((bk, i) => `<button class="econ3d-blockbtn ${i === selectedBlock ? 'is-sel' : ''}" data-act="econ3d_block" data-i="${i}" title="${bk}"><span class="econ3d-blockchip" data-bk="${bk}"></span></button>`).join('')}</div>
      ${isTouch ? '<div class="econ3d-jump" data-act="econ3d_jump">⤒</div>' : '<div class="econ3d-controlhint">WASD 이동 · 마우스 시점 · 클릭 상호작용(채집은 꾹) · 공중 점프 = 더블점프 · Ctrl 달리기 · M 지도</div>'}
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
      flushWorldEdits();   // 블록 편집 → 메시 리빌드(프레임당 1회로 병합)
      camera.position.set(P.x, P.y + P.eye, P.z);
      const d = lookDir(); camera.lookAt(P.x + d.x, P.y + P.eye + d.y, P.z + d.z);
      updateAimHighlight();
      updateSky();
      updateAmbientMobs(dt);
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
    _minionSig = ''; ambientMobs = []; fairyMeshes = {}; curBannerKey = '';
    worldMode = 'hub'; worldHubCache = null; world = null; _meshDirty = false; _mapDirty = false;
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
    };
  }
})();
