/* =========================================================================
   economy3d.js — "경제" 탭: 3D 스카이블럭 월드(Three.js r128)
   economy.js(상태/로직/패널 렌더)는 그대로 재사용 — 이 파일은 고정된 작은 섬을
   실제로 걸어다니는 1인칭 3D 월드로 그리고, NPC/미니언/자원 노드와의 상호작용만 담당.
   블록 파괴/설치가 없으므로(장식용 정적 지형) adventure3d.js보다 훨씬 단순함:
   청크 스트리밍 없이 섬 전체를 한 번에 메싱, 레이캐스트 대신 콘(원뿔) 조준 판정.
   ========================================================================= */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const W = 48, H = 40, Dp = 48;   // 섬 크기: X 0..47, Y 0..39, Z 0..47(고정, 스트리밍 없음)
  const REACH = 4.5, DOT_MIN = 0.86;   // NPC/미니언/자원노드 조준 판정(콘 체크) 파라미터

  /* ---------------- 블록(경제 섬 전용, adventure3d.js보다 훨씬 적은 종류) ---------------- */
  const BLOCKS = [
    { key: 'air', solid: false, opaque: false },
    { key: 'stone', tex: 'stone' },
    { key: 'cobblestone', tex: 'cobble' },
    { key: 'dirt', tex: 'dirt' },
    { key: 'grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
    { key: 'farmland', tex: { top: 'farmland_top', side: 'dirt', bottom: 'dirt' } },
    { key: 'oak_planks', tex: 'planks' },
    { key: 'oak_log', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } },
    { key: 'oak_leaves', tex: 'leaves' },
    { key: 'stone_bricks', tex: 'stonebrick' },
    { key: 'bricks', tex: 'bricks' },
    { key: 'obsidian', tex: 'obsidian' },
    { key: 'bedrock', tex: 'bedrock' },
    { key: 'glass', tex: 'glass', opaque: false },
    { key: 'glowstone', tex: 'glow' },
    { key: 'coal_ore', tex: 'coal_ore' },
    { key: 'iron_ore', tex: 'iron_ore' },
    { key: 'diamond_ore', tex: 'diamond_ore' },
    { key: 'water', tex: 'water', solid: false, opaque: false, liquid: true },
    { key: 'wheat_ripe', tex: 'wheat_mature', opaque: false, solid: false, cross: true },
    { key: 'carrot_ripe', tex: 'carrot_mature', opaque: false, solid: false, cross: true },
    { key: 'sugar_cane', tex: 'sugar_cane', opaque: false, solid: false, cross: true },
  ];
  const ID = {};
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });

  /* ---------------- 섬 배치 데이터(economy-3d-rebuild 워크플로우 finalSpec 각색) ---------------- */
  const RESOURCE_ZONE = { stone: 'mine', iron: 'mine', coal: 'mine', diamond: 'mine', wheat: 'farm', carrot: 'farm', sugarcane: 'farm', oaklog: 'farm', rawfish: 'dock' };
  const MINION_COLORS = { stone: 0x9a9a9a, wheat: 0xd8b23a, oaklog: 0x8a6a3a, rawfish: 0x3a6ee0, iron: 0xd8a282, coal: 0x2a2a2e, diamond: 0x5decd5, carrot: 0xe07b1f, sugarcane: 0x8fc36a };
  const NPCS = [
    { key: 'shopkeeper', name: '상점 주인', zone: 'hub', x: 20, z: 20, color: 0x3a6ee0 },
    { key: 'bankTeller', name: '은행원', zone: 'hub', x: 28, z: 20, color: 0xf2d75c },
    { key: 'minionManager', name: '일꾼 관리소장', zone: 'hub', x: 24, z: 24, color: 0x6aa84f },
    { key: 'classTrainer', name: '직업 훈련관', zone: 'hub', x: 20, z: 28, color: 0xc0392b },
    { key: 'slayerMaster', name: '슬레이어 대장', zone: 'slayerden', x: 9, z: 28, color: 0x2a2040 },
    { key: 'dungeonGatekeeper', name: '던전 문지기', zone: 'dungeonentrance', x: 24, z: 41, color: 0x5a4327 },
  ];
  const NODES = [
    { zone: 'mine', x: 5, z: 9 }, { zone: 'mine', x: 9, z: 5 }, { zone: 'mine', x: 9, z: 13 },
    { zone: 'farm', x: 37, z: 9 },
    { zone: 'dock', x: 44, z: 37 },
  ];
  const MINION_SLOTS = {
    mine: [{ x: 9, z: 9 }, { x: 7, z: 7 }, { x: 11, z: 11 }, { x: 7, z: 11 }, { x: 11, z: 7 }],
    farm: [{ x: 29, z: 5 }, { x: 29, z: 9 }, { x: 29, z: 13 }, { x: 33, z: 17 }, { x: 37, z: 17 }],
    dock: [{ x: 31, z: 37 }, { x: 34, z: 37 }, { x: 37, z: 37 }, { x: 40, z: 37 }, { x: 43, z: 37 }],
  };

  /* ---------------- 상태 ---------------- */
  let running = false, contextLost = false, raf = 0, lastT = 0;
  let renderer = null, scene = null, camera = null, canvas = null;
  let world = null;   // Uint8Array(W*H*Dp) — 고정 섬 전체(청크 없음, 파괴/설치 없음)
  let atlasTex = null, atlasUV = {};
  let blockMat = null, waterMat = null, plantMat = null;
  let islandMeshes = { opaque: null, water: null, plant: null };
  let npcGroup = null, nodeGroup = null, minionGroup = null, outlineMesh = null;
  let interactables = [], dynamicInteractables = [], _minionSig = '';
  let gathering = false, gatherZoneKey = null;
  let spawnX = 24.5, spawnY = 30, spawnZ = 24.5;

  const P = { x: 24.5, y: 30, z: 24.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, w: 0.6, h: 1.8, eye: 1.62 };
  const keys = {};
  const lookS = { locked: false };
  const moveT = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  const lookT = { id: -1, lx: 0, ly: 0 };
  const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  function econApi() { return window.econApi || { getP: () => null, hasActiveEncounter: () => false }; }

  /* ---------------- 섬 지형 생성(고정, 1회) ---------------- */
  function inBounds(x, y, z) { return x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < Dp; }
  function widx(x, y, z) { return (y * Dp + z) * W + x; }
  function setW(x, y, z, id) { if (inBounds(x, y, z)) world[widx(x, y, z)] = id; }
  function getBlockLocal(x, y, z) { if (!inBounds(x, y, z)) return 0; return world[widx(x, y, z)]; }
  function opaqueAt(x, y, z) { const b = BLOCKS[getBlockLocal(x, y, z)]; return !!(b && b.opaque); }
  function solidAt(x, y, z) { const b = BLOCKS[getBlockLocal(x, y, z)]; return !!(b && b.solid); }
  function surfaceTop(x, z) { for (let y = H - 1; y >= 0; y--) if (getBlockLocal(x, y, z) !== 0) return y + 1; return 1; }

  function genIsland() {
    world = new Uint8Array(W * H * Dp);
    // 기반: 표면(y29 잔디/y28 흙) + 하부는 테두리로 갈수록 얇아지는 부유섬 밑동(y0~13)
    for (let x = 0; x < W; x++) for (let z = 0; z < Dp; z++) {
      const edgeDist = Math.min(x, W - 1 - x, z, Dp - 1 - z);
      for (let y = 0; y < 28; y++) {
        let keep = true;
        if (y < 3) keep = edgeDist >= 9; else if (y < 6) keep = edgeDist >= 6; else if (y < 10) keep = edgeDist >= 3; else if (y < 14) keep = edgeDist >= 1;
        if (keep) setW(x, y, z, y < 2 ? ID.bedrock : ID.stone);
      }
      setW(x, 28, z, ID.dirt);
      setW(x, 29, z, ID.grass);
    }
    carveMine();
    buildFarm();
    buildDock();
    buildSlayerden();
    buildDungeonEntrance();
    buildHubDecor();
    plantTrees();
  }
  // 채석장 형태 크레이터(계단식 경사) 공용 헬퍼 — 광산/슬레이어 소굴 둘 다 사용
  function carveCrater(cx, cz, rIn, rOut, floorMin, surfaceY, wallSolidTex, wallRimTex) {
    for (let x = Math.max(0, cx - rOut - 1); x <= Math.min(W - 1, cx + rOut + 1); x++)
      for (let z = Math.max(0, cz - rOut - 1); z <= Math.min(Dp - 1, cz + rOut + 1); z++) {
        const dist = Math.hypot(x - cx, z - cz); if (dist > rOut) continue;
        let floorY = dist <= rIn ? floorMin : Math.round(floorMin + (dist - rIn) / (rOut - rIn) * (surfaceY - floorMin));
        floorY = Math.min(surfaceY, Math.max(floorMin, floorY));
        for (let y = floorY + 1; y <= surfaceY; y++) setW(x, y, z, 0);
        setW(x, floorY, z, floorY >= surfaceY ? ID.grass : (dist <= rIn ? wallSolidTex : wallRimTex));
      }
  }
  function carveMine() {
    carveCrater(9, 9, 5, 9, 16, 29, ID.stone, ID.stone_bricks);
    const oreSpots = [[5, 9, ID.coal_ore], [13, 9, ID.coal_ore], [9, 5, ID.iron_ore], [9, 13, ID.iron_ore],
      [6, 6, ID.diamond_ore], [12, 12, ID.diamond_ore], [6, 12, ID.coal_ore], [12, 6, ID.iron_ore]];
    oreSpots.forEach(o => setW(o[0], 16, o[1], o[2]));
  }
  function buildSlayerden() { carveCrater(9, 37, 5, 9, 26, 29, ID.obsidian, ID.stone_bricks); }
  function buildFarm() {
    const startX = 30, startZ = 4, plotW = 3, gap = 1, cols = 4, rows = 3;
    const crops = [ID.wheat_ripe, ID.carrot_ripe, ID.sugar_cane];
    let ci = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = startX + c * (plotW + gap), pz = startZ + r * (plotW + gap);
      for (let dx = 0; dx < plotW; dx++) for (let dz = 0; dz < plotW; dz++) { setW(px + dx, 29, pz + dz, ID.farmland); setW(px + dx, 30, pz + dz, crops[ci % crops.length]); }
      ci++;
    }
    for (let x = 41; x < 45; x++) for (let z = 15; z < 19; z++) setW(x, 29, z, ID.water);   // 농장 옆 작은 연못(장식)
  }
  function buildDock() {
    for (let x = 28; x < 47; x++) for (let z = 28; z < 47; z++) { for (let y = 27; y <= 29; y++) setW(x, y, z, 0); setW(x, 26, z, ID.water); }
    for (let x = 29; x < 48; x++) for (let dz = -1; dz <= 1; dz++) setW(x, 27, 37 + dz, ID.oak_planks);   // 부두(허브 방향에서 섬 끝까지)
  }
  function buildDungeonEntrance() {
    for (let x = 21; x < 28; x++) for (let z = 40; z < 48; z++) setW(x, 29, z, ID.stone_bricks);
    for (let x = 22; x < 27; x++) for (let z = 44; z < 48; z++) setW(x, 30, z, ID.stone_bricks);
    const gx0 = 22, gx1 = 26, gz = 47;
    for (let y = 31; y <= 33; y++) { setW(gx0, y, gz, ID.obsidian); setW(gx1, y, gz, ID.obsidian); }
    for (let x = gx0; x <= gx1; x++) setW(x, 34, gz, ID.obsidian);
  }
  function paintPatch(cx, cz, r, id) { for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) setW(x, 29, z, id); }
  function buildHubDecor() {
    paintPatch(20, 20, 2, ID.oak_planks); paintPatch(28, 20, 2, ID.bricks); paintPatch(24, 24, 2, ID.stone_bricks); paintPatch(20, 28, 2, ID.cobblestone);
    [[17, 17], [31, 17], [17, 31], [31, 31]].forEach(function (p) { const x = p[0], z = p[1], y = surfaceTop(x, z); setW(x, y, z, ID.stone_bricks); setW(x, y + 1, z, ID.stone_bricks); setW(x, y + 2, z, ID.glowstone); });
  }
  function plantTree(x, z) {
    const y0 = surfaceTop(x, z);
    for (let i = 0; i < 3; i++) setW(x, y0 + i, z, ID.oak_log);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) { if (dx === 0 && dz === 0 && dy === 0) continue; setW(x + dx, y0 + 3 + dy, z + dz, ID.oak_leaves); }
  }
  function plantTrees() { [[16, 24], [32, 24], [24, 16], [24, 32]].forEach(function (p) { plantTree(p[0], p[1]); }); }

  /* ---------------- 텍스처 아틀라스(adventure3d.js 픽셀아트 기법 축소 이식) ---------------- */
  function px(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
  function rngFrom(n) { let s = (n >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
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
      case 'cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, (hash3(x * 3, 0, y * 3) < 0.18) ? '#5a5a5a' : (r() < 0.5 ? '#7d7d7d' : '#919191')); break;
      case 'stonebrick': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#7b7b7b' : '#888')); } break;
      case 'bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#7a3527' : '#9a4f3f'); } break;
      case 'planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); if (y % 4 === 0) f(x, y, '#7a5f34'); } break;
      case 'log_top': { fillNoise('#b59b6a', '#a78c5b', '#c4aa79'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#8a724a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'log_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#5b472d' : (r() < 0.5 ? '#6b5436' : '#7c6342')); break; }
      case 'leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.35 ? '#3f7a2e' : t < 0.7 ? '#4c8f38' : '#5aa042'); if (t > 0.92) f(x, y, '#16240e'); } break;
      case 'coal_ore': oreTex(c, ox, oy, r, '#26262a'); break;
      case 'iron_ore': oreTex(c, ox, oy, r, '#d8a282'); break;
      case 'diamond_ore': oreTex(c, ox, oy, r, '#5decd5'); break;
      case 'glass': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, '#bfe6f2'); c.fillStyle = '#dff2f9'; c.fillRect(ox, oy, 16, 1); c.fillRect(ox, oy, 1, 16); break; }
      case 'bedrock': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? '#3a3a3a' : t < 0.66 ? '#565656' : '#6b6b6b'); } break;
      case 'water': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#3463cf' : '#3a6ee0'); break;
      case 'obsidian': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#120d1c' : t < 0.8 ? '#1a1326' : '#2a2040'); } break;
      case 'glow': { fillNoise('#c8a23f', '#b38e30', '#f4d35e'); for (let i = 0; i < 8; i++) f((r() * 16) | 0, (r() * 16) | 0, '#fff7cc'); break; }
      case 'farmland_top': { fillNoise('#5a3f28', '#4a3320', '#6a4d34'); c.fillStyle = '#3a2818'; for (let y = 2; y < 16; y += 4) c.fillRect(ox, oy + y, 16, 1); break; }
      case 'wheat_mature': { for (let x = 1; x < 16; x += 2) { const hh = 9 + ((r() * 4) | 0); const topY = 16 - hh; for (let y = topY; y < 16; y++) f(x, y, (y < topY + 4) ? (r() < 0.5 ? '#d8b23a' : '#e8c24a') : (r() < 0.5 ? '#8a7a2a' : '#a08a30')); } break; }
      case 'carrot_mature': { for (let x = 1; x < 16; x += 2) { const hh = 8 + ((r() * 3) | 0); for (let y = 16 - hh; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } for (let i = 0; i < 3; i++) { const x = 4 + i * 4; f(x, 15, '#e07b1f'); f(x, 14, '#d06a15'); } break; }
      case 'sugar_cane': { for (let y = 0; y < 16; y++) { const col = (y % 5 === 0) ? '#7bbf5c' : (r() < 0.5 ? '#8fc36a' : '#a3d178'); f(7, y, col); f(8, y, col); } break; }
      default: fillNoise('#888', '#666', '#aaa');
    }
  }
  function buildAtlas() {
    const names = new Set();
    BLOCKS.forEach(function (b) { if (!b.tex) return; if (typeof b.tex === 'string') names.add(b.tex); else { names.add(b.tex.top); names.add(b.tex.side); names.add(b.tex.bottom); } });
    const list = Array.from(names); const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 16; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    list.forEach(function (nm, i) { const cx = (i % cols) * 16, cy = ((i / cols) | 0) * 16; paintTile(c, cx, cy, nm); });
    atlasUV = {};
    list.forEach(function (nm, i) { const cx = (i % cols), cy = ((i / cols) | 0); const e = 0.01; atlasUV[nm] = { x0: (cx + e) / cols, x1: (cx + 1 - e) / cols, y0: (cy + e) / rows, y1: (cy + 1 - e) / rows }; });
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;
    atlasTex.flipY = false; atlasTex.needsUpdate = true;
    blockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
    waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    plantMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  }
  function faceTexName(b, faceN) { if (typeof b.tex === 'string') return b.tex; if (faceN === 'top') return b.tex.top; if (faceN === 'bottom') return b.tex.bottom; return b.tex.side; }

  /* ---------------- 메싱(면 컬링) — 섬 전체를 1회 통짜 빌드(청크 스트리밍 불필요) ---------------- */
  const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.78 },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.78 },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, n: 'top' },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, n: 'bottom' },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.62 },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.62 },
  ];
  FACES.forEach(function (f) { if (!f.n) f.n = 'side'; const na = f.dir.findIndex(function (v) { return v !== 0; }); f.ax = [0, 1, 2].filter(function (i) { return i !== na; }); });
  const AO_MUL = [0.45, 0.62, 0.82, 1.0];

  function makeMesh(pos, col, uv, idxArr, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idxArr);
    const m = new THREE.Mesh(g, mat); scene.add(m); return m;
  }
  function disposeIslandMeshes() { ['opaque', 'water', 'plant'].forEach(function (k) { const m = islandMeshes[k]; if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); islandMeshes[k] = null; } }); }
  function buildIslandMesh() {
    const pos = [], col = [], uv = [], idxA = []; let vi = 0;
    const wpos = [], wcol = [], wuv = [], widxA = []; let wvi = 0;
    const ppos = [], pcol = [], puv = [], pidxA = []; let pvi = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < Dp; z++) {
      const id = getBlockLocal(x, y, z); if (id === 0) continue;
      const b = BLOCKS[id]; const liq = b.liquid;
      if (b.cross) {
        const tn = faceTexName(b, 'side'); const u = atlasUV[tn] || atlasUV.stone;
        const uvco = [[u.x0, u.y1], [u.x1, u.y1], [u.x1, u.y0], [u.x0, u.y0]];
        const diags = [[[x, z], [x + 1, z + 1]], [[x + 1, z], [x, z + 1]]];
        for (const dg of diags) {
          const a0 = dg[0], a1 = dg[1];
          const vtx = [[a0[0], y, a0[1]], [a1[0], y, a1[1]], [a1[0], y + 1, a1[1]], [a0[0], y + 1, a0[1]]];
          for (let k = 0; k < 4; k++) { ppos.push(vtx[k][0], vtx[k][1], vtx[k][2]); pcol.push(1, 1, 1); puv.push(uvco[k][0], uvco[k][1]); }
          pidxA.push(pvi, pvi + 1, pvi + 2, pvi, pvi + 2, pvi + 3); pvi += 4;
        }
        continue;
      }
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi]; const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
        if (opaqueAt(nx, ny, nz)) continue;
        const nid = getBlockLocal(nx, ny, nz);
        if (liq && nid === id) continue;
        const tn = faceTexName(b, f.n); const u = atlasUV[tn] || atlasUV.stone;
        const target = liq ? { pos: wpos, col: wcol, uv: wuv, idx: widxA } : { pos, col, uv, idx: idxA };
        const base = liq ? wvi : vi;
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
          target.pos.push(x + cc[0], y + cc[1] - (liq && f.n === 'top' ? 0.12 : 0), z + cc[2]);
          target.col.push(v, v, v);
          target.uv.push(uvco[k][0], uvco[k][1]);
        }
        target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        if (liq) wvi += 4; else vi += 4;
      }
    }
    disposeIslandMeshes();
    if (pos.length) islandMeshes.opaque = makeMesh(pos, col, uv, idxA, blockMat);
    if (wpos.length) islandMeshes.water = makeMesh(wpos, wcol, wuv, widxA, waterMat);
    if (ppos.length) islandMeshes.plant = makeMesh(ppos, pcol, puv, pidxA, plantMat);
  }

  /* ---------------- 사람형 메시(NPC/미니언 공용) ---------------- */
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
    return { group: g, legL: legL, legR: legR };
  }
  function makeLabel(lines) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 256, 72);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 26px sans-serif';
    c.fillText(String(lines[0] || ''), 128, 40);
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
    const col = pct > 0.9 ? '#e05a4a' : pct >= 0.5 ? '#e0c24a' : '#5ac26a';
    c.fillStyle = col; c.fillRect(barX, barY, Math.max(2, barW * Math.min(1, pct)), barH);
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
    const label = makeLabel(['+ 일꾼 배치']); label.position.set(0, 1.0, 0); g.add(label);
    return g;
  }
  function buildNodeMarker(zoneKey) {
    const g = new THREE.Group();
    const colorByZone = { mine: 0x5decd5, farm: 0xe8c24a, dock: 0x3a6ee0 };
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: colorByZone[zoneKey] || 0xffffff }));
    glow.position.set(0, 0.5, 0); g.add(glow);
    const icon = zoneKey === 'mine' ? '⛏ 채굴' : zoneKey === 'farm' ? '🌾 수확' : '🎣 낚시';
    const label = makeLabel([icon]); label.position.set(0, 1.1, 0); g.add(label);
    return g;
  }
  function disposeGroup(g) { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.map.dispose) o.material.map.dispose(); }); }

  function buildNpcMeshes() {
    npcGroup = new THREE.Group(); scene.add(npcGroup);
    NPCS.forEach(function (n) {
      const h = buildHumanoid(n.color);
      n._y = surfaceTop(n.x, n.z);
      h.group.position.set(n.x + 0.5, n._y, n.z + 0.5);
      const label = makeLabel([n.name]); label.position.set(0, 2.2, 0); h.group.add(label);
      npcGroup.add(h.group);
    });
  }
  function buildNodeMeshes() {
    nodeGroup = new THREE.Group(); scene.add(nodeGroup);
    NODES.forEach(function (n) {
      n._y = surfaceTop(n.x, n.z);
      const marker = buildNodeMarker(n.zone);
      marker.position.set(n.x + 0.5, n._y, n.z + 0.5);
      nodeGroup.add(marker);
    });
  }
  function buildStaticInteractables() {
    interactables = [];
    NPCS.forEach(function (n) { interactables.push({ type: 'npc', ref: n, x: n.x + 0.5, y: n._y + 1.0, z: n.z + 0.5 }); });
    NODES.forEach(function (n) { interactables.push({ type: 'node', ref: n, x: n.x + 0.5, y: n._y + 0.6, z: n.z + 0.5 }); });
  }
  function rebuildMinionVisuals(force) {
    const P0 = econApi().getP(); if (!P0) return;
    const sig = P0.minions.map(function (m) { return m.key + ':' + m.tier + ':' + m.storage + ':' + (m.storageUpgraded ? 1 : 0); }).join('|');
    if (!force && sig === _minionSig) return;
    _minionSig = sig;
    if (minionGroup) { scene.remove(minionGroup); disposeGroup(minionGroup); }
    minionGroup = new THREE.Group(); scene.add(minionGroup);
    dynamicInteractables = [];
    const D0 = window.ECON_DATA; if (!D0) return;
    const byZone = {};
    P0.minions.forEach(function (m, i) {
      const def = D0.MINIONS.find(function (x) { return x.key === m.key; }); if (!def) return;
      const zk = RESOURCE_ZONE[def.resource] || 'hub';
      (byZone[zk] = byZone[zk] || []).push({ m: m, i: i, def: def });
    });
    Object.keys(MINION_SLOTS).forEach(function (zoneKey) {
      const list = byZone[zoneKey] || [];
      MINION_SLOTS[zoneKey].forEach(function (slot, si) {
        const y = surfaceTop(slot.x, slot.z);
        if (si < list.length) {
          const item = list[si]; const m = item.m, def = item.def;
          const h = buildHumanoid(MINION_COLORS[def.resource] || 0x999999);
          h.group.position.set(slot.x + 0.5, y, slot.z + 0.5);
          const cap = m.storageUpgraded ? D0.MINION_STORAGE_UPGRADED : D0.MINION_STORAGE_BASE;
          const label = makeMinionLabel(def.name, m.tier, m.storage, cap);
          label.position.set(0, 2.3, 0); h.group.add(label);
          minionGroup.add(h.group);
          dynamicInteractables.push({ type: 'minion', ref: { idx: item.i }, x: slot.x + 0.5, y: y + 1.0, z: slot.z + 0.5 });
        } else if (P0.minions.length < P0.maxMinionSlots) {
          const eg = buildEmptySlot(); eg.position.set(slot.x + 0.5, y, slot.z + 0.5); minionGroup.add(eg);
          dynamicInteractables.push({ type: 'emptySlot', ref: {}, x: slot.x + 0.5, y: y + 0.6, z: slot.z + 0.5 });
        }
      });
    });
  }

  /* ---------------- 이동/물리(adventure3d.js와 동일한 손맛, 파괴/설치 없음) ---------------- */
  function lookDir() { return { x: Math.sin(P.yaw) * Math.cos(P.pitch) * -1, y: Math.sin(P.pitch), z: Math.cos(P.yaw) * Math.cos(P.pitch) * -1 }; }
  function clampPitch() { const lim = Math.PI / 2 - 0.02; if (P.pitch > lim) P.pitch = lim; if (P.pitch < -lim) P.pitch = -lim; }
  function feetInWater() { return getBlockLocal(Math.floor(P.x), Math.floor(P.y + 0.2), Math.floor(P.z)) === ID.water; }
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
  function collide(dt) {
    let mf = 0, ms = 0;
    if (keys.KeyW) mf += 1; if (keys.KeyS) mf -= 1; if (keys.KeyA) ms -= 1; if (keys.KeyD) ms += 1;
    if (moveT.active) { const dx = moveT.x - moveT.ox, dy = moveT.y - moveT.oy; if (Math.abs(dx) > 8) ms += dx > 0 ? 1 : -1; if (Math.abs(dy) > 8) mf += dy < 0 ? 1 : -1; }
    const inWater = feetInWater();
    const sprint = (keys.ControlLeft || keys.ControlRight) && mf > 0 && !inWater;
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    let speed = keys.ShiftLeft ? 2.6 : (sprint ? 5.8 : 4.3);
    if (inWater) speed *= 0.5;
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - sin * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P.vx = dx * speed; P.vz = dz * speed;
    const wantJump = keys.Space || (moveT.active && (moveT.y - moveT.oy) < -34);
    if (inWater) { P.vy -= 9 * dt; if (wantJump) P.vy += 22 * dt; if (P.vy < -4) P.vy = -4; if (P.vy > 5) P.vy = 5; }
    else { P.vy -= 32 * dt; if (P.vy < -78) P.vy = -78; if (wantJump && P.onGround) { P.vy = 8.5; P.onGround = false; } }
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    if (P.y < -20) { P.x = spawnX; P.y = spawnY; P.z = spawnZ; P.vx = P.vy = P.vz = 0; if (typeof toast === 'function') toast('안전지대로 귀환했어요', false); }
  }
  function resetPlayerToSpawn() {
    spawnX = 24.5; spawnZ = 24.5; spawnY = surfaceTop(24, 24) + 0.02;
    P.x = spawnX; P.y = spawnY; P.z = spawnZ; P.vx = P.vy = P.vz = 0; P.yaw = 0; P.pitch = 0; P.onGround = false;
  }

  /* ---------------- 입력(데스크톱 마우스룩 / 터치 조이스틱, adventure3d.js와 동일 구조) ---------------- */
  function panelOpen() { const wrap = document.getElementById('econ3dPanelWrap'); return !!(wrap && wrap.style.display !== 'none'); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onPLC() { lookS.locked = (document.pointerLockElement === canvas); }
  function onKey(e) { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'Escape') hidePanel(); }
  function onKeyUp(e) { keys[e.code] = false; }
  function onDown(e) {
    if (panelOpen()) return;
    const p = relPos(e); const cw = canvas.clientWidth;
    if (!isTouch) {
      if (!lookS.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      const t = currentAim();
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; } else if (t) doInteract(t);
      return;
    }
    if (p.x < cw * 0.4 && moveT.id === -1) { moveT.active = true; moveT.id = e.pointerId; moveT.ox = moveT.x = p.x; moveT.oy = moveT.y = p.y; }
    else if (lookT.id === -1) {
      lookT.id = e.pointerId; lookT.lx = p.x; lookT.ly = p.y;
      const t = currentAim();
      if (t && t.type === 'node') { gathering = true; gatherZoneKey = t.ref.zone; } else if (t) doInteract(t);
    }
  }
  function onMove(e) {
    if (panelOpen()) return;
    if (!isTouch) { if (lookS.locked) { P.yaw -= (e.movementX || 0) * 0.0024; P.pitch -= (e.movementY || 0) * 0.0024; clampPitch(); } return; }
    const p = relPos(e);
    if (e.pointerId === moveT.id) { moveT.x = p.x; moveT.y = p.y; }
    else if (e.pointerId === lookT.id) { const dx = p.x - lookT.lx, dy = p.y - lookT.ly; P.yaw -= dx * 0.005; P.pitch -= dy * 0.005; clampPitch(); lookT.lx = p.x; lookT.ly = p.y; }
  }
  function onUp(e) {
    if (!isTouch) { if (e.button === 0) gathering = false; return; }
    if (e.pointerId === moveT.id) { moveT.active = false; moveT.id = -1; }
    else if (e.pointerId === lookT.id) { gathering = false; lookT.id = -1; }
  }
  function bindInput() {
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp); canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('pointerlockchange', onPLC);
  }
  function unbindInput() {
    document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
    if (canvas) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); }
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointerlockchange', onPLC);
  }

  /* ---------------- 상호작용(콘 조준 판정 — 파괴 가능한 블록이 없으므로 DDA 레이캐스트 대신 사용) ---------------- */
  function currentAim() {
    const d = lookDir(); let best = null, bestDot = DOT_MIN;
    const all = interactables.concat(dynamicInteractables);
    for (const it of all) {
      const vx = it.x - P.x, vy = it.y - (P.y + P.eye), vz = it.z - P.z;
      const dist = Math.hypot(vx, vy, vz); if (dist > REACH || dist < 0.01) continue;
      const dot = (vx * d.x + vy * d.y + vz * d.z) / dist;
      if (dot > bestDot) { bestDot = dot; best = it; }
    }
    return best;
  }
  function gatherAt(zoneKey) { if (typeof window.econAct === 'function') window.econAct('econ_gather', { dataset: { key: zoneKey } }); }
  function openPanelForZone(zoneKey) {
    if (typeof window.econAct !== 'function') return;
    window.econAct('econ_zone', { dataset: { key: zoneKey } });
    showPanel();
  }
  function doInteract(t) {
    if (!t) return;
    if (t.type === 'npc') openPanelForZone(t.ref.zone);
    else if (t.type === 'minion' || t.type === 'emptySlot') openPanelForZone('hub');
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
    } else {
      if (outlineMesh) outlineMesh.visible = false;
      if (cross) cross.classList.remove('is-active');
    }
  }

  /* ---------------- HUD/화면 ---------------- */
  function screenHTML() {
    return '<section class="screen econ3d-screen" data-econ3d="1">' +
      '<div class="econ3d-sky" id="econ3dSky"></div>' +
      '<canvas id="econ3dCanvas"></canvas>' +
      '<div class="econ3d-cross" id="econ3dCross">+</div>' +
      '<div class="econ3d-top">' +
      '<div class="econ3d-gold" id="econ3dGold">💰 0G</div>' +
      '<button class="btn btn--ghost" data-act="backHome">✕</button>' +
      '</div>' +
      (isTouch ? '<div class="econ3d-jump" data-act="econ3d_jump">⤒</div>' : '<div class="econ3d-controlhint">WASD 이동 · 마우스 시점 · 클릭 상호작용(채집은 꾹 누르기) · Ctrl 달리기</div>') +
      '<div class="econ3d-panelwrap" id="econ3dPanelWrap" style="display:none">' +
      '<div class="econ3d-panelbar"><span id="econ3dPanelGold"></span><button class="btn btn--ghost btn--sm" data-act="econ3d_panel_close">✕ 닫기</button></div>' +
      '<div id="econBody" class="econ-body econ3d-body"></div>' +
      '</div>' +
      '</section>';
  }
  function fallbackErr(msg) {
    return '<section class="screen"><header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">💰 경제</b></header>' +
      '<div class="grow center" style="justify-content:center;text-align:center;padding:20px"><p>' + msg + '</p></div></section>';
  }
  function updateHud() {
    const P0 = econApi().getP(); if (!P0) return;
    const txt = '💰 ' + P0.gold.toLocaleString('ko-KR') + 'G';
    const g = document.getElementById('econ3dGold'); if (g) g.textContent = txt;
    const pg = document.getElementById('econ3dPanelGold'); if (pg) pg.textContent = txt;
  }
  function resize() { if (!renderer) return; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  /* ---------------- 루프 ---------------- */
  let _hudT = 0;
  function loop(ts) {
    if (!running) return; raf = requestAnimationFrame(loop);
    if (contextLost) { lastT = ts; return; }
    try {
      if (!lastT) lastT = ts; let dt = (ts - lastT) / 1000; lastT = ts; if (dt > 0.1) dt = 0.1;
      if (!panelOpen()) { collide(dt); if (gathering && gatherZoneKey) gatherAt(gatherZoneKey); }
      camera.position.set(P.x, P.y + P.eye, P.z);
      const d = lookDir(); camera.lookAt(P.x + d.x, P.y + P.eye + d.y, P.z + d.z);
      updateAimHighlight();
      _hudT += dt; if (_hudT > 0.5) { _hudT = 0; updateHud(); rebuildMinionVisuals(false); }
      renderer.render(scene, camera);
    } catch (e) { console.error('econ3d loop', e); }
  }

  /* ---------------- 시작/종료 ---------------- */
  function start() {
    if (typeof THREE === 'undefined') { if (typeof app === 'function') app().innerHTML = fallbackErr('3D 라이브러리를 불러오지 못했어요(네트워크 확인).'); return; }
    if (typeof setScreen === 'function') setScreen('econ');
    if (typeof app === 'function') app().innerHTML = screenHTML();
    canvas = document.getElementById('econ3dCanvas');
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { if (typeof app === 'function') app().innerHTML = fallbackErr('이 기기/브라우저가 3D(WebGL)를 지원하지 않아요.'); return; }
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); contextLost = true; }, false);
    canvas.addEventListener('webglcontextrestored', function () { try { buildAtlas(); buildIslandMesh(); contextLost = false; } catch (err) { console.error('econ3d ctx restore', err); } }, false);
    scene = new THREE.Scene(); scene.background = null; scene.fog = new THREE.Fog(0xbfe0f5, 46, 120);
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
    buildAtlas();
    if (!world) genIsland();
    buildIslandMesh();
    buildNpcMeshes();
    buildNodeMeshes();
    buildStaticInteractables();
    setupOutline();
    resetPlayerToSpawn();
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
    if (npcGroup) { scene.remove(npcGroup); disposeGroup(npcGroup); npcGroup = null; }
    if (nodeGroup) { scene.remove(nodeGroup); disposeGroup(nodeGroup); nodeGroup = null; }
    if (minionGroup) { scene.remove(minionGroup); disposeGroup(minionGroup); minionGroup = null; }
    if (outlineMesh) { scene.remove(outlineMesh); outlineMesh = null; }
    if (renderer) { try { renderer.dispose(); } catch (e) {} }
    renderer = null; scene = null; camera = null; canvas = null;
    _minionSig = '';
  }

  /* ---------------- 액션 위임 ---------------- */
  function act(a, el) {
    switch (a) {
      case 'econ3d_jump': keys.Space = true; setTimeout(function () { keys.Space = false; }, 120); return true;
      case 'econ3d_panel_close': hidePanel(); return true;
    }
    return false;
  }

  window.economy3dStart = start;
  window.economy3dStop = stop;
  window.economy3dAct = act;

  if (typeof window !== 'undefined' && window.__ECON3D_TEST) {
    window.__econ3d = {
      start: start, stop: stop, act: act, genIsland: genIsland,
      getBlock: getBlockLocal, surfaceTop: surfaceTop,
      NPCS: NPCS, NODES: NODES, MINION_SLOTS: MINION_SLOTS, RESOURCE_ZONE: RESOURCE_ZONE,
      P: P, currentAim: currentAim, doInteract: doInteract, gatherAt: gatherAt,
      openPanelForZone: openPanelForZone, showPanel: showPanel, hidePanel: hidePanel, panelOpen: panelOpen,
      rebuildMinionVisuals: rebuildMinionVisuals,
      dynamicInteractables: function () { return dynamicInteractables; },
      interactables: function () { return interactables; },
      buildStaticInteractables: function () { NPCS.forEach(function (n) { n._y = surfaceTop(n.x, n.z); }); NODES.forEach(function (n) { n._y = surfaceTop(n.x, n.z); }); buildStaticInteractables(); },
      scene: function () { return scene; }, camera: function () { return camera; },
      world: function () { return world; }, W: W, H: H, D: Dp,
      setGathering: function (v, zoneKey) { gathering = v; gatherZoneKey = zoneKey; },
      collide: collide, moveAxis: moveAxis,
    };
  }
})();
