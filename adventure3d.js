/* =========================================================================
   adventure3d.js — 모험 탭: 3D 1인칭 복셀 엔진 (Three.js r128)
   - 청크 지형 생성(바이옴·광맥·나무·물) · 면 컬링 메싱 · 텍스처 아틀라스
   - 1인칭 조작(WASD+마우스룩 / 터치 조이스틱) · 중력/점프/충돌
   - 블록 파괴·설치(레이캐스트, 경도/도구/드롭은 ADV_BLOCKS 사용)
   - 낮밤 + 면 음영 · 인벤/핫바 · 직접 배치 3×3 조합(셰이프리스) · 기본템 없음
   - 로컬 세이브 + 선택적 서버 동기(adv_world3) + 멀티 프레즌스
   공용: ui-core.js, net.js(sb/serverNow), 데이터: adventure-data.js
   게이트/개발자설정: adventure.js(비밀번호·cfg)에서 진입(enterAdventure→여기)
   ========================================================================= */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const CHUNK = 16, WORLD_H = 96, SEA = 44, RENDER = 5;   // 렌더 반경(청크)
  const REACH = 6;
  const SAVE_KEY = 'adv3_save_v1';
  const CFG_KEY = 'adv_cfg_v1';                            // 2D와 공유(개발자 모드 수치)
  const WORLD_SEED = 1337;

  /* ---------------- 블록 정의(3D 면 텍스처) ---------------- */
  // gameplay 속성(경도/도구/드롭)은 ADV_BLOCKS 에서 가져옴. 여기선 면 텍스처/렌더 속성.
  const BLOCKS = [
    { key: 'air', solid: false, opaque: false },
    { key: 'stone', tex: 'stone' },
    { key: 'grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
    { key: 'dirt', tex: 'dirt' },
    { key: 'cobblestone', tex: 'cobble' },
    { key: 'sand', tex: 'sand' },
    { key: 'sandstone', tex: 'sandstone' },
    { key: 'gravel', tex: 'gravel' },
    { key: 'oak_log', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } },
    { key: 'oak_planks', tex: 'planks' },
    { key: 'oak_leaves', tex: 'leaves', opaque: false },
    { key: 'coal_ore', tex: 'coal_ore' },
    { key: 'iron_ore', tex: 'iron_ore' },
    { key: 'gold_ore', tex: 'gold_ore' },
    { key: 'diamond_ore', tex: 'diamond_ore' },
    { key: 'redstone_ore', tex: 'redstone_ore' },
    { key: 'glass', tex: 'glass', opaque: false },
    { key: 'bricks', tex: 'bricks' },
    { key: 'stone_bricks', tex: 'stonebrick' },
    { key: 'bedrock', tex: 'bedrock' },
    { key: 'snow_block', tex: 'snow' },
    { key: 'water', tex: 'water', solid: false, opaque: false, liquid: true },
    { key: 'crafting_table', tex: { top: 'craft_top', side: 'craft_side', bottom: 'planks' }, station: 'craft' },
    { key: 'furnace', tex: { top: 'stone', side: 'furnace', bottom: 'stone' }, station: 'furnace' },
    { key: 'chest', tex: { top: 'planks', side: 'chest', bottom: 'planks' }, station: 'chest' },
    { key: 'glowstone', tex: 'glow', light: true },
    { key: 'obsidian', tex: 'obsidian' },
  ];
  const ID = {}, BYID = BLOCKS;
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });
  function bprop(key) { return (window.ADV_BLOCKS && window.ADV_BLOCKS[key]) || null; }   // 경도/도구/드롭

  /* ---------------- 상태 ---------------- */
  let running = false, renderer = null, scene = null, camera = null, raf = 0;
  let canvas = null, atlasTex = null, atlasUV = {};
  const chunks = new Map();             // "cx,cz" -> {blocks:Uint8Array, mesh, waterMesh, dirty}
  const overlay = new Map();            // "x,y,z" -> id (사용자 편집, 영속)
  let pendingServer = new Map();
  const others = {};                    // 멀티 플레이어 아바타
  let netCh = null, netSend = null;

  const P = { x: 0.5, y: 70, z: 0.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false,
    w: 0.6, h: 1.8, eye: 1.62, hp: 20, hunger: 20, name: 'Player', flying: false };
  let inv = new Array(36).fill(null);   // {k,n}
  let hotbar = 0;
  let world = { time: 0 };
  let cfg = loadCfg();

  const keys = {};
  const look = { active: false, id: -1, lx: 0, ly: 0 };
  const move = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  let breakState = { key: '', t: 0 };

  function loadCfg() { try { return Object.assign({ breakMul: 1, dropMul: 1, dayLen: 600, cloud: true, startHp: 20, keepInvOnDeath: false }, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { return { breakMul: 1, dropMul: 1, dayLen: 600, cloud: true }; } }

  /* ---------------- 노이즈/지형 ---------------- */
  let seed = WORLD_SEED;
  function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function h2(x, z) { return hash3(x, 0, z); }
  function vnoise(x, z, f) { const xf = x * f, zf = z * f; const x0 = Math.floor(xf), z0 = Math.floor(zf), tx = xf - x0, tz = zf - z0; const a = h2(x0, z0), b = h2(x0 + 1, z0), c = h2(x0, z0 + 1), d = h2(x0 + 1, z0 + 1); const ux = tx * tx * (3 - 2 * tx), uz = tz * tz * (3 - 2 * tz); return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz; }
  function biome(x, z) { const n = vnoise(x + 1000, z + 1000, 0.004); return n < 0.3 ? 'desert' : n < 0.75 ? 'plains' : 'snow'; }
  const surfCache = new Map();
  function surfaceH(x, z) {
    const ck = x + ',' + z; if (surfCache.has(ck)) return surfCache.get(ck);
    let h = 48 + (vnoise(x, z, 0.01) - 0.5) * 24 + (vnoise(x, z, 0.04) - 0.5) * 8;
    const sy = Math.max(8, Math.min(WORLD_H - 20, Math.round(h)));
    surfCache.set(ck, sy); if (surfCache.size > 40000) surfCache.clear();
    return sy;
  }
  function isTreeAt(x, z) { return h2(x * 7 + 1, z * 13 + 3) < 0.02 && biome(x, z) !== 'desert'; }
  function genBlock(x, y, z) {
    if (y <= 0) return ID.bedrock;
    if (y <= 2 && hash3(x, y, z) < 0.5) return ID.bedrock;
    const sy = surfaceH(x, z), b = biome(x, z);
    if (y > sy) {
      if (y <= SEA) return ID.water;
      // 나무
      const t = treeBlock(x, y, z); if (t) return t;
      return ID.air;
    }
    if (y === sy) { if (sy >= SEA) return ID.sand; if (b === 'desert') return ID.sand; if (b === 'snow') return ID.snow_block; return ID.grass; }
    const depth = sy - y;
    if (depth <= 3) return b === 'desert' ? ID.sandstone : ID.dirt;
    // 동굴
    if (caveCarve(x, y, z)) return ID.air;
    // 광물
    const r = hash3(x * 3 + 1, y * 5 + 2, z * 7 + 3);
    if (r < 0.012) return ID.coal_ore;
    if (r < 0.020 && y < 50) return ID.iron_ore;
    if (r < 0.025 && y < 30) return ID.gold_ore;
    if (r < 0.029 && y < 22) return ID.redstone_ore;
    if (r < 0.032 && y < 16) return ID.diamond_ore;
    return ID.stone;
  }
  function caveCarve(x, y, z) {
    if (y < 5 || y > 55) return false;
    const n = vnoise(x + y * 7, z - y * 5, 0.06);
    return n > 0.78;
  }
  function treeBlock(x, y, z) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ox = x - dx, oz = z - dz; if (!isTreeAt(ox, oz)) continue;
      const sy = surfaceH(ox, oz); if (sy < SEA) continue;
      const th = 4 + Math.floor(h2(ox, oz) * 3);
      const top = sy + th;
      if (dx === 0 && dz === 0 && y > sy && y <= top - 1) return ID.oak_log;        // 줄기
      const ly = y - (top - 1);
      if (Math.abs(dx) + Math.abs(dz) <= 3 && ly >= -1 && ly <= 1) {                 // 잎
        if (!(dx === 0 && dz === 0 && y <= top - 1)) { if (hash3(x, y, z) < 0.85) return ID.oak_leaves; }
      }
    }
    return 0;
  }

  /* ---------------- 청크 ---------------- */
  function ckey(cx, cz) { return cx + ',' + cz; }
  function getChunk(cx, cz, create) {
    const k = ckey(cx, cz); let c = chunks.get(k);
    if (!c && create) { c = { cx, cz, blocks: genChunk(cx, cz), mesh: null, waterMesh: null, dirty: true }; chunks.set(k, c); }
    return c;
  }
  function genChunk(cx, cz) {
    const arr = new Uint8Array(CHUNK * CHUNK * WORLD_H);
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const wx = cx * CHUNK + lx, wz = cz * CHUNK + lz;
      for (let y = 0; y < WORLD_H; y++) arr[idx(lx, y, lz)] = genBlock(wx, y, wz);
    }
    // 오버레이(사용자 편집) 적용
    overlay.forEach((id, key) => {
      const p = key.split(',').map(Number); const ox = p[0], oy = p[1], oz = p[2];
      if (Math.floor(ox / CHUNK) === cx && Math.floor(oz / CHUNK) === cz && oy >= 0 && oy < WORLD_H) {
        arr[idx(mod(ox), oy, mod(oz))] = id;
      }
    });
    return arr;
  }
  function idx(lx, y, lz) { return (y * CHUNK + lz) * CHUNK + lx; }
  function mod(v) { return ((v % CHUNK) + CHUNK) % CHUNK; }
  function getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_H) return 0;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = chunks.get(ckey(cx, cz));
    if (c) return c.blocks[idx(mod(x), y, mod(z))];
    const ov = overlay.get(x + ',' + y + ',' + z); if (ov !== undefined) return ov;
    return genBlock(x, y, z);
  }
  function setBlock(x, y, z, id, fromNet) {
    if (y < 0 || y >= WORLD_H) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = getChunk(cx, cz, true); c.blocks[idx(mod(x), y, mod(z))] = id; c.dirty = true;
    overlay.set(x + ',' + y + ',' + z, id);
    // 이웃 청크 경계 갱신
    if (mod(x) === 0) markDirty(cx - 1, cz); if (mod(x) === CHUNK - 1) markDirty(cx + 1, cz);
    if (mod(z) === 0) markDirty(cx, cz - 1); if (mod(z) === CHUNK - 1) markDirty(cx, cz + 1);
    if (!fromNet) { queueServer(x, y, z, id); if (netSend) netSend({ t: 'b', x, y, z, i: id }); scheduleSave(); }
  }
  function markDirty(cx, cz) { const c = chunks.get(ckey(cx, cz)); if (c) c.dirty = true; }

  function blockOpaque(id) { const b = BYID[id]; return b && b.opaque; }
  function blockSolid(id) { const b = BYID[id]; return b && b.solid; }
  function aoSolid(x, y, z) { return blockOpaque(getBlock(x, y, z)) ? 1 : 0; }

  /* ---------------- 메싱(면 컬링) ---------------- */
  // 면 방향: +x,-x,+y,-y,+z,-z. 면별 음영(상단 밝게).
  const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.78, n: 'side' },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.78, n: 'side' },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, n: 'top' },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, n: 'bottom' },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.62, n: 'side' },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.62, n: 'side' },
  ];
  // 각 면의 면내 두 축(법선 외) 인덱스 — AO(코너 음영) 계산용
  FACES.forEach(f => { const na = f.dir.findIndex(v => v !== 0); f.ax = [0, 1, 2].filter(i => i !== na); });
  const AO_MUL = [0.45, 0.62, 0.82, 1.0];
  function faceTexName(b, faceN) {
    if (typeof b.tex === 'string') return b.tex;
    if (faceN === 'top') return b.tex.top; if (faceN === 'bottom') return b.tex.bottom; return b.tex.side;
  }
  function buildChunkMesh(c) {
    const pos = [], col = [], uv = [], idxArr = [];
    const wpos = [], wcol = [], wuv = [], widx = [];
    let vi = 0, wvi = 0;
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) for (let y = 0; y < WORLD_H; y++) {
      const id = c.blocks[idx(lx, y, lz)]; if (id === 0) continue;
      const b = BYID[id]; const wx = c.cx * CHUNK + lx, wz = c.cz * CHUNK + lz;
      const isWater = b.liquid;
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi]; const nx = wx + f.dir[0], ny = y + f.dir[1], nz = wz + f.dir[2];
        const nid = getBlock(nx, ny, nz); const nb = BYID[nid] || BLOCKS[0];
        // 인접이 불투명이면 면 생략. 투명/물끼리는 같은 종류면 생략.
        if (nb.opaque) continue;
        if (isWater && nid === id) continue;
        if (!isWater && nb.liquid && f.dir[1] !== 1) { /* 물에 접한 고체 면은 그림 */ }
        const tn = faceTexName(b, f.n); const u = atlasUV[tn] || atlasUV.stone;
        const target = isWater ? { pos: wpos, col: wcol, uv: wuv, idx: widx } : { pos, col, uv, idx: idxArr };
        const base = isWater ? wvi : vi;
        const sh = f.shade;
        const uvco = [[u.x0, u.y1], [u.x0, u.y0], [u.x1, u.y0], [u.x1, u.y1]];
        const a = f.ax[0], b = f.ax[1];
        const bx = wx + f.dir[0], by = y + f.dir[1], bz = wz + f.dir[2];   // 면 바깥(공기) 칸
        for (let k = 0; k < 4; k++) {
          const cc = f.corners[k];
          // 코너 음영(AO): 면내 두 인접 + 대각
          const sa = cc[a] ? 1 : -1, sb = cc[b] ? 1 : -1;
          const o1 = [0, 0, 0], o2 = [0, 0, 0], od = [0, 0, 0]; o1[a] = sa; o2[b] = sb; od[a] = sa; od[b] = sb;
          const s1 = aoSolid(bx + o1[0], by + o1[1], bz + o1[2]);
          const s2 = aoSolid(bx + o2[0], by + o2[1], bz + o2[2]);
          const sd = aoSolid(bx + od[0], by + od[1], bz + od[2]);
          const aol = (s1 && s2) ? 0 : (3 - (s1 + s2 + sd));
          const v = sh * AO_MUL[aol];
          target.pos.push(wx + cc[0], y + cc[1] - (isWater && f.n === 'top' ? 0.12 : 0), wz + cc[2]);
          target.col.push(v, v, v);
          target.uv.push(uvco[k][0], uvco[k][1]);
        }
        target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        if (isWater) wvi += 4; else vi += 4;
      }
    }
    disposeMesh(c.mesh); disposeMesh(c.waterMesh); c.mesh = null; c.waterMesh = null;
    if (pos.length) c.mesh = makeMesh(pos, col, uv, idxArr, false);
    if (wpos.length) c.waterMesh = makeMesh(wpos, wcol, wuv, widx, true);
    c.dirty = false;
  }
  function makeMesh(pos, col, uv, idxArr, water) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idxArr);
    const m = new THREE.Mesh(g, water ? waterMat : blockMat);
    m.frustumCulled = true; scene.add(m); return m;
  }
  function disposeMesh(m) { if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); } }
  let blockMat = null, waterMat = null;

  /* ---------------- 오버레이(조준 윤곽선·균열) ---------------- */
  let outlineMesh = null, crackMesh = null, crackMats = [];
  function setupOverlays() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    outlineMesh = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
    outlineMesh.visible = false; scene.add(outlineMesh);
    crackMats = [];
    for (let s = 0; s < 8; s++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16; const c = cv.getContext('2d');
      c.clearRect(0, 0, 16, 16); c.fillStyle = 'rgba(0,0,0,0.55)';
      const r = rngFrom(12345 + s); const lines = (s + 1) * 3;
      for (let i = 0; i < lines; i++) { let x = (r() * 16) | 0, y = (r() * 16) | 0; const len = 2 + ((r() * (s + 2)) | 0); for (let j = 0; j < len; j++) { c.fillRect(x, y, 1, 1); x += (r() < .5 ? 1 : -1); y += (r() < .5 ? 1 : 0); x = (x + 16) % 16; y = (y + 16) % 16; } }
      const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
      crackMats.push(new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    }
    crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), crackMats[0]); crackMesh.visible = false; scene.add(crackMesh);
  }
  function updateOverlays(t) {
    if (!outlineMesh) return;
    if (t) { outlineMesh.visible = true; outlineMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5); }
    else outlineMesh.visible = false;
    if (mining && t && breakTarget && t.x === breakTarget.x && t.y === breakTarget.y && t.z === breakTarget.z && breakProg > 0) {
      crackMesh.visible = true; crackMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      crackMesh.material = crackMats[Math.min(7, Math.floor(breakProg * 8))];
    } else crackMesh.visible = false;
  }

  /* ---------------- 텍스처 아틀라스 ---------------- */
  function px(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
  function rngFrom(n) { let s = (n >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function drawTex(c, ox, oy, name) {
    const A = window.ADV_BLOCKS || {};
    const r = rngFrom(hashStr(name) >>> 0);
    function f(x, y, col) { px(c, ox + x, oy + y, col); }
    function fillNoise(p0, p1, p2) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? p1 : t < 0.66 ? p0 : p2); } }
    const P3 = (k) => (A[k] && A[k].pal) || ['#888', '#666', '#aaa'];
    switch (name) {
      case 'stone': fillNoise('#7e7e7e', '#727272', '#8a8a8a'); break;
      case 'dirt': fillNoise('#866043', '#75543b', '#946a4a'); break;
      case 'grass_top': fillNoise('#6aa84f', '#5b9142', '#7bbf5c'); break;
      case 'grass_side': { fillNoise('#866043', '#75543b', '#946a4a'); for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) { const t = r(); if (y < 3 || t < 0.5) f(x, y, t < 0.5 ? '#5b9142' : '#6aa84f'); } break; }
      case 'sand': fillNoise('#e0d6a0', '#d4c98e', '#ece2b0'); break;
      case 'sandstone': { fillNoise('#d9cda0', '#cabf90', '#e6dab0'); for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) f(x, y, '#bcb080'); break; }
      case 'gravel': fillNoise('#867f7e', '#76706f', '#999190'); break;
      case 'cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, (hash3(x * 3, 0, y * 3) < 0.18) ? '#5a5a5a' : (r() < 0.5 ? '#7d7d7d' : '#919191')); break;
      case 'stonebrick': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#7b7b7b' : '#888')); } break;
      case 'bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#7a3527' : '#9a4f3f'); } break;
      case 'log_top': { fillNoise('#b59b6a', '#a78c5b', '#c4aa79'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#8a724a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'log_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#5b472d' : (r() < 0.5 ? '#6b5436' : '#7c6342')); break; }
      case 'planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); if (y % 4 === 0) f(x, y, '#7a5f34'); } break;
      case 'leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#356a26' : t < 0.75 ? '#3f7a2e' : '#4c8f38'); if (t > 0.93) f(x, y, '#2a541d'); } break;
      case 'coal_ore': oreTex(c, ox, oy, '#1c1c1c'); break;
      case 'iron_ore': oreTex(c, ox, oy, '#d2a282'); break;
      case 'gold_ore': oreTex(c, ox, oy, '#f7d75c'); break;
      case 'diamond_ore': oreTex(c, ox, oy, '#5decd5'); break;
      case 'redstone_ore': oreTex(c, ox, oy, '#e8323b'); break;
      case 'glass': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, '#bfe6f2'); c.fillStyle = '#dff2f9'; c.fillRect(ox, oy, 16, 1); c.fillRect(ox, oy, 1, 16); c.fillStyle = '#9fd0e0'; c.fillRect(ox, oy + 15, 16, 1); c.fillRect(ox + 15, oy, 1, 16); break; }
      case 'bedrock': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? '#3a3a3a' : t < 0.66 ? '#565656' : '#6b6b6b'); } break;
      case 'snow': fillNoise('#f0f4f7', '#e2e8ec', '#ffffff'); break;
      case 'water': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#3463cf' : '#3a6ee0'); break;
      case 'obsidian': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#120d1c' : t < 0.8 ? '#1a1326' : '#2a2040'); } break;
      case 'glow': { fillNoise('#c8a23f', '#b38e30', '#f4d35e'); for (let i = 0; i < 8; i++) f((r() * 16) | 0, (r() * 16) | 0, '#fff7cc'); break; }
      case 'craft_top': { drawTex(c, ox, oy, 'planks'); c.fillStyle = '#5a4327'; c.fillRect(ox + 2, oy + 2, 5, 5); c.fillRect(ox + 9, oy + 2, 5, 5); c.fillRect(ox + 2, oy + 9, 12, 5); break; }
      case 'craft_side': { drawTex(c, ox, oy, 'planks'); c.fillStyle = '#6b4f2a'; c.fillRect(ox + 1, oy + 8, 14, 7); break; }
      case 'furnace': { drawTex(c, ox, oy, 'stone'); c.fillStyle = '#222'; c.fillRect(ox + 4, oy + 6, 8, 8); c.fillStyle = '#e8902a'; c.fillRect(ox + 5, oy + 11, 6, 3); break; }
      case 'chest': { drawTex(c, ox, oy, 'planks'); c.fillStyle = '#3a2a14'; c.fillRect(ox, oy + 7, 16, 2); c.fillStyle = '#d7c27a'; c.fillRect(ox + 7, oy + 6, 2, 4); break; }
      default: fillNoise('#888', '#666', '#aaa');
    }
    function oreTex(c, ox, oy, ore) { drawTex2Base(c, ox, oy); for (let i = 0; i < 8; i++) { const x = 2 + ((hash3(i, 1, 0) * 12) | 0), y = 2 + ((hash3(i, 2, 0) * 12) | 0); c.fillStyle = ore; c.fillRect(ox + x, oy + y, 2, 2); c.fillStyle = '#fff4'; c.fillRect(ox + x, oy + y, 1, 1); } }
    function drawTex2Base(c, ox, oy) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); c.fillStyle = t < 0.33 ? '#727272' : t < 0.66 ? '#7e7e7e' : '#8a8a8a'; c.fillRect(ox + x, oy + y, 1, 1); } }
  }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  function buildAtlas() {
    const names = new Set();
    BLOCKS.forEach(b => { if (!b.tex) return; if (typeof b.tex === 'string') names.add(b.tex); else { names.add(b.tex.top); names.add(b.tex.side); names.add(b.tex.bottom); } });
    const list = Array.from(names); const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 16; const c = cv.getContext('2d');
    list.forEach((nm, i) => { const cx = (i % cols) * 16, cy = ((i / cols) | 0) * 16; drawTex(c, cx, cy, nm); });
    // UV(작은 인셋으로 블리딩 방지)
    list.forEach((nm, i) => { const cx = (i % cols), cy = ((i / cols) | 0); const e = 0.02; atlasUV[nm] = { x0: (cx + e) / cols, x1: (cx + 1 - e) / cols, y0: (cy + e) / rows, y1: (cy + 1 - e) / rows }; });
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false; atlasTex.needsUpdate = true;
    blockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
    waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
  }

  /* ---------------- 입력 ---------------- */
  function bindInput() {
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp); canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerlockchange', () => { look.locked = (document.pointerLockElement === canvas); });
  }
  function unbindInput() {
    document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
    if (canvas) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); }
    window.removeEventListener('pointerup', onUp);
  }
  function onKey(e) {
    keys[e.code] = true;
    if (e.code === 'KeyE') { e.preventDefault(); toggleInventory(); }
    if (e.code === 'Space') e.preventDefault();
    if (e.code.indexOf('Digit') === 0) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) { hotbar = n - 1; refreshHotbar(); } }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onWheel(e) { e.preventDefault(); hotbar = (hotbar + (e.deltaY > 0 ? 1 : -1) + 9) % 9; refreshHotbar(); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function onDown(e) {
    const p = relPos(e); const W = canvas.clientWidth;
    if (!isTouch) {
      if (!look.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 2) placeOrUse(); else mining = true;   // 좌클릭 꾹=캐기, 우클릭=설치/사용
      return;
    }
    // 터치: 좌측 이동 조이스틱, 우측 = 꾹 캐기 / 탭 설치
    if (p.x < W * 0.4 && move.id === -1) { move.active = true; move.id = e.pointerId; move.ox = move.x = p.x; move.oy = move.y = p.y; }
    else if (look.id === -1) { look.id = e.pointerId; look.lx = p.x; look.ly = p.y; look.moved = 0; look.downT = performance.now(); mining = true; }
  }
  function onMove(e) {
    if (!isTouch) {
      if (look.locked) { P.yaw -= (e.movementX || 0) * 0.0024; P.pitch -= (e.movementY || 0) * 0.0024; clampPitch(); }
      return;
    }
    const p = relPos(e);
    if (e.pointerId === move.id) { move.x = p.x; move.y = p.y; }
    else if (e.pointerId === look.id) { const dx = p.x - look.lx, dy = p.y - look.ly; P.yaw -= dx * 0.005; P.pitch -= dy * 0.005; clampPitch(); look.lx = p.x; look.ly = p.y; look.moved += Math.abs(dx) + Math.abs(dy); if (look.moved > 16) mining = false; }
  }
  function onUp(e) {
    if (!isTouch) { if (e.button === 0) mining = false; return; }
    if (e.pointerId === move.id) { move.active = false; move.id = -1; }
    else if (e.pointerId === look.id) {
      mining = false; breakProg = 0;
      if (look.moved < 10 && (performance.now() - look.downT) < 200) placeOrUse();   // 짧은 탭 = 설치/사용
      look.id = -1;
    }
  }
  function clampPitch() { const lim = Math.PI / 2 - 0.02; if (P.pitch > lim) P.pitch = lim; if (P.pitch < -lim) P.pitch = -lim; }

  /* ---------------- 레이캐스트(복셀 DDA) ---------------- */
  function lookDir() { return { x: Math.sin(P.yaw) * Math.cos(P.pitch) * -1, y: Math.sin(P.pitch), z: Math.cos(P.yaw) * Math.cos(P.pitch) * -1 }; }
  function raycast() {
    const o = { x: P.x, y: P.y + P.eye, z: P.z }; const d = lookDir();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = d.x > 0 ? 1 : -1, stepY = d.y > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (d.x || 1e-9)), tDY = Math.abs(1 / (d.y || 1e-9)), tDZ = Math.abs(1 / (d.z || 1e-9));
    let tMX = ((d.x > 0 ? (x + 1 - o.x) : (o.x - x)) ) * tDX;
    let tMY = ((d.y > 0 ? (y + 1 - o.y) : (o.y - y)) ) * tDY;
    let tMZ = ((d.z > 0 ? (z + 1 - o.z) : (o.z - z)) ) * tDZ;
    let face = [0, 0, 0];
    for (let i = 0; i < REACH * 3; i++) {
      const id = getBlock(x, y, z);
      if (id !== 0 && blockSolid(id)) return { x, y, z, face };
      if (tMX < tMY && tMX < tMZ) { x += stepX; tMX += tDX; face = [-stepX, 0, 0]; }
      else if (tMY < tMZ) { y += stepY; tMY += tDY; face = [0, -stepY, 0]; }
      else { z += stepZ; tMZ += tDZ; face = [0, 0, -stepZ]; }
      if (Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y, z + 0.5 - o.z) > REACH + 1) break;
    }
    return null;
  }

  /* ---------------- 파괴/설치 ---------------- */
  let mining = false, breakProg = 0, breakTarget = null, swingT = 0;
  function breakTime(key, held) {
    const def = bprop(key); if (!def || def.hard == null) return 0.15;
    const it = held && window.ADV_ITEMS && window.ADV_ITEMS[held.k]; const need = def.tool;
    const proper = !need || (it && it.tool === need);
    let mult = 1; if (it && it.tool && need && it.tool === need) mult = it.speed || 1;
    let harvest = true; if (def.level && def.level > 0) { const lvl = (it && it.tool === need) ? (it.level || 0) : -1; harvest = lvl >= def.level; }
    let t = def.hard * ((proper && harvest) ? 1.5 : 5) / mult;
    return Math.max(0.05, t * (cfg.breakMul || 1));
  }
  function canHarvest(key, held) { const def = bprop(key); if (!def) return true; if (def.level && def.level > 0) { const it = held && window.ADV_ITEMS && window.ADV_ITEMS[held.k]; const lvl = (it && it.tool === def.tool) ? (it.level || 0) : -1; return lvl >= def.level; } return true; }
  function processMining(dt) {
    if (!mining) { breakProg = 0; breakTarget = null; return; }
    const t = raycast(); if (!t) { breakProg = 0; breakTarget = null; return; }
    const id = getBlock(t.x, t.y, t.z); if (id === ID.bedrock || id === 0) { breakProg = 0; return; }
    if (!breakTarget || breakTarget.x !== t.x || breakTarget.y !== t.y || breakTarget.z !== t.z) { breakTarget = { x: t.x, y: t.y, z: t.z }; breakProg = 0; }
    const bt = breakTime(BYID[id].key, inv[hotbar]);
    breakProg += dt / bt; swing();
    if (breakProg >= 1) { breakBlock(t.x, t.y, t.z); breakProg = 0; breakTarget = null; }
  }
  function swing() { if (swingT <= 0) swingT = 0.28; }
  function placeOrUse() {
    const t = raycast();
    if (t) { const id = getBlock(t.x, t.y, t.z); const b = BYID[id]; if (b && b.station) { openStation(b.station); swing(); return; } }
    if (placeBlock()) swing();
  }
  function openStation(st) { if (st === 'craft') openInventory('table'); else if (st === 'furnace') toast('화로는 곧 추가돼요'); else if (st === 'chest') toast('상자는 곧 추가돼요'); }
  function breakBlock(x, y, z) {
    const id = getBlock(x, y, z); const key = BYID[id].key; const def = bprop(key);
    const harvest = canHarvest(key, inv[hotbar]);
    setBlock(x, y, z, 0);
    settleGravity(x, y + 1, z);                    // 위 모래/자갈 낙하
    swing();
    if (!harvest) return;                          // 요구 도구 미달 → 드롭 없음
    if (def) {
      const drops = def.drops || [{ i: key, c: 1 }];
      for (const dr of drops) { const ch = dr.chance != null ? dr.chance * cfg.dropMul : 1; if (Math.random() > ch) continue; let cnt = dr.c; if (dr.max) cnt = dr.c + Math.floor(Math.random() * (dr.max - dr.c + 1)); if (cnt > 0) addItem(dr.i, cnt); }
    } else addItem(key, 1);
  }
  // 모래/자갈 낙하
  function settleGravity(x, y, z) {
    let cur = y;
    while (cur < WORLD_H) {
      const id = getBlock(x, cur, z); const def = bprop(BYID[id] && BYID[id].key);
      if (!def || !def.gravity) break;
      let ny = cur; while (ny > 0 && getBlock(x, ny - 1, z) === 0) ny--;
      if (ny !== cur) { setBlock(x, cur, z, 0); setBlock(x, ny, z, id); }
      cur++;
    }
  }
  function placeBlock() {
    const s = inv[hotbar]; if (!s) return false;
    const placeKey = window.ADV_BLOCKS[s.k] ? s.k : null; if (!placeKey || ID[placeKey] === undefined) return false;
    const t = raycast(); if (!t) return false;
    const nx = t.x + t.face[0], ny = t.y + t.face[1], nz = t.z + t.face[2];
    if (getBlock(nx, ny, nz) !== 0) return false;
    if (aabbHitsBlock(nx, ny, nz)) return false;
    setBlock(nx, ny, nz, ID[placeKey]); consumeHeld(1);
    settleGravity(nx, ny, nz);                      // 설치한 중력블록 낙하
    return true;
  }
  function aabbHitsBlock(bx, by, bz) {
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    return (bx + 1 > minX && bx < maxX && bz + 1 > minZ && bz < maxZ && by + 1 > minY && by < maxY);
  }
  function flash() { /* 채집 피드백 자리(차후 파티클) */ }

  /* ---------------- 인벤토리 ---------------- */
  function addItem(key, n) {
    n = n || 1; const max = (window.advStack && window.advStack(key)) || 64;
    for (let i = 0; i < inv.length && n > 0; i++) { const s = inv[i]; if (s && s.k === key && s.n < max) { const a = Math.min(max - s.n, n); s.n += a; n -= a; } }
    for (let i = 0; i < inv.length && n > 0; i++) { if (!inv[i]) { const a = Math.min(max, n); inv[i] = { k: key, n: a }; n -= a; } }
    refreshHotbar(); scheduleSave(); return n;
  }
  function countItem(k) { let c = 0; for (const s of inv) if (s && s.k === k) c += s.n; return c; }
  function consumeHeld(n) { const s = inv[hotbar]; if (!s) return; s.n -= n || 1; if (s.n <= 0) inv[hotbar] = null; refreshHotbar(); scheduleSave(); }

  /* ---------------- 물리 ---------------- */
  function collide(dt) {
    // 이동 입력
    let mf = 0, ms = 0;
    if (!invOpen) {
      if (keys.KeyW) mf += 1; if (keys.KeyS) mf -= 1; if (keys.KeyA) ms -= 1; if (keys.KeyD) ms += 1;
      if (move.active) { const dx = move.x - move.ox, dy = move.y - move.oy; if (Math.abs(dx) > 8) ms += dx > 0 ? 1 : -1; if (Math.abs(dy) > 8) mf += dy < 0 ? 1 : -1; }
    }
    const sprint = (keys.ControlLeft || keys.ControlRight) && (mf > 0) && !invOpen; P.sprinting = sprint && (mf || ms);
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw); const speed = (keys.ShiftLeft ? 2.6 : (sprint ? 5.8 : 4.3));
    // 전진 방향(시점 yaw 기준): forward = (-sin, , -cos)
    let dx = (-sin * mf + cos * ms), dz = (-cos * mf - (-sin) * ms);
    const len = Math.hypot(dx, dz); if (len > 0) { dx /= len; dz /= len; }
    P.vx = dx * speed; P.vz = dz * speed;
    // 점프/중력
    P.vy -= 26 * dt; if (P.vy < -55) P.vy = -55;
    const wantJump = keys.Space || (move.active && (move.y - move.oy) < -34);
    if (wantJump && P.onGround && !invOpen) { P.vy = 8.5; P.onGround = false; }
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    if (P.y < -30) { respawn(); }
  }
  function moveAxis(ax, amt) {
    if (amt === 0) return; P[ax] += amt;
    const minX = P.x - P.w / 2, maxX = P.x + P.w / 2, minZ = P.z - P.w / 2, maxZ = P.z + P.w / 2, minY = P.y, maxY = P.y + P.h;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      if (!blockSolid(getBlock(x, y, z))) continue;
      // 충돌 해소
      if (ax === 'y') { if (amt > 0) { P.y = y - P.h - 0.0001; P.vy = 0; } else { P.y = y + 1 + 0.0001; P.vy = 0; P.onGround = true; } return; }
      if (ax === 'x') { if (amt > 0) P.x = x - P.w / 2 - 0.0001; else P.x = x + 1 + P.w / 2 + 0.0001; P.vx = 0; return; }
      if (ax === 'z') { if (amt > 0) P.z = z - P.w / 2 - 0.0001; else P.z = z + 1 + P.w / 2 + 0.0001; P.vz = 0; return; }
    }
  }
  function respawn() { const sy = surfaceH(Math.floor(P.x), Math.floor(P.z)); P.y = sy + 2; P.vy = 0; P.hp = cfg.startHp || 20; }

  /* ---------------- 청크 스트리밍 ---------------- */
  function streamChunks() {
    const pcx = Math.floor(P.x / CHUNK), pcz = Math.floor(P.z / CHUNK);
    let built = 0;
    for (let r = 0; r <= RENDER && built < 2; r++) {
      for (let dx = -r; dx <= r && built < 2; dx++) for (let dz = -r; dz <= r && built < 2; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = pcx + dx, cz = pcz + dz; const c = getChunk(cx, cz, true);
        if (c.dirty) { buildChunkMesh(c); built++; }
      }
    }
    // 멀리 언로드
    chunks.forEach((c, k) => { if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > RENDER + 2) { disposeMesh(c.mesh); disposeMesh(c.waterMesh); chunks.delete(k); } });
  }

  /* ---------------- 낮밤 ---------------- */
  function dayFactor() { const f = (world.time % cfg.dayLen) / cfg.dayLen; if (f < 0.5) { let b = 1 - Math.abs(f - 0.25) / 0.25 * 0.15; if (f < 0.06) b = 0.3 + f / 0.06 * 0.7; else if (f > 0.44) b = 0.3 + (0.5 - f) / 0.06 * 0.7; return Math.max(0.3, b); } return 0.28; }
  function updateSky() {
    const d = dayFactor(); const day = (world.time % cfg.dayLen) / cfg.dayLen < 0.5;
    const sky = day ? new THREE.Color(0x7fb2e0).multiplyScalar(d) : new THREE.Color(0x0a0e1a);
    scene.background = sky; if (scene.fog) scene.fog.color = sky;
    if (renderer) renderer.setClearColor(sky, 1);
    if (blockMat) blockMat.color.setScalar(d); if (waterMat) waterMat.color.setScalar(d);
  }

  /* ---------------- 루프 ---------------- */
  let lastT = 0;
  function loop(ts) {
    if (!running) return; raf = requestAnimationFrame(loop);
    try {
      if (!lastT) lastT = ts; let dt = (ts - lastT) / 1000; lastT = ts; if (dt > 0.1) dt = 0.1;
      world.time += dt;
      collide(dt); streamChunks(); netTick(dt); processMining(dt);
      // 카메라
      camera.position.set(P.x, P.y + P.eye, P.z);
      const d = lookDir(); camera.lookAt(P.x + d.x, P.y + P.eye + d.y, P.z + d.z);
      const fovTarget = P.sprinting ? 80 : 72; camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
      updateSky();
      updateOverlays(mining ? breakTarget : raycast());
      if (swingT > 0) { swingT -= dt; updateHand(); }
      renderer.render(scene, camera);
      _saveT += dt; if (_saveT > 8 && _dirty) { _saveT = 0; saveNow(); flushServer(); }
    } catch (e) { console.error('adv3d loop', e); }
  }

  /* ---------------- HUD/DOM ---------------- */
  function screenHTML() {
    return `<section class="screen adv3-screen" data-adv3="1">
      <canvas id="adv3canvas"></canvas>
      <div class="adv3-cross">+</div>
      <div class="adv3-top">
        <div class="adv3-hp" id="adv3hp"></div>
        <div class="adv3-topbtns"><button class="adv-ibtn" data-act="adv3_inv">🎒</button><button class="adv-ibtn" data-act="adv_exit">✕</button></div>
      </div>
      ${isTouch ? `<div class="adv3-jump" data-act="adv3_jump">⤒</div>` : `<div class="adv3-hint">WASD 이동 · 마우스 시점 · 좌클릭 꾹 파괴 · 우클릭 설치/사용 · 휠/숫자 핫바 · Ctrl 달리기 · E 가방</div>`}
      <img class="adv3-hand" id="adv3hand" alt="">
      <div class="adv-hotbar" id="adv3hotbar"></div>
    </section>`;
  }
  function updateHand() {
    const el = document.getElementById('adv3hand'); if (!el) return;
    const s = inv[hotbar];
    if (s) { el.style.display = 'block'; const u = icon(s.k); if (el.dataset.k !== s.k) { el.src = u; el.dataset.k = s.k; } } else { el.style.display = 'none'; el.dataset.k = ''; }
    const sw = swingT > 0 ? Math.sin((1 - swingT / 0.28) * Math.PI) : 0;
    el.style.transform = `translate(${-sw * 18}px, ${ -10 + sw * 22}px) rotate(${-sw * 24}deg)`;
  }
  function refreshHotbar() {
    const el = document.getElementById('adv3hotbar'); if (!el) return; let h = '';
    for (let i = 0; i < 9; i++) { const s = inv[i]; const sel = i === hotbar ? ' is-sel' : ''; h += `<button class="adv-slot${sel}" data-act="adv3_hot" data-i="${i}">${s ? `<img src="${icon(s.k)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : ''}</button>`; }
    el.innerHTML = h; updateHand();
  }
  function updateHUD() { const el = document.getElementById('adv3hp'); if (!el) return; let s = ''; for (let i = 0; i < 10; i++) s += (P.hp - i * 2 >= 2 ? '❤️' : P.hp - i * 2 === 1 ? '💗' : '🖤'); el.textContent = s; }

  /* ---------------- 아이콘(블록=아이소 큐브, 아이템=2D) ---------------- */
  const iconCache = {};
  function icon(key) {
    if (iconCache[key]) return iconCache[key];
    const s = 48; const cv = document.createElement('canvas'); cv.width = cv.height = s; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    if (window.ADV_BLOCKS[key] && ID[key] !== undefined) drawCubeIcon(c, key, s); else drawItemIcon2(c, key, s);
    const u = cv.toDataURL(); iconCache[key] = u; return u;
  }
  function texCanvas(name) { const cv = document.createElement('canvas'); cv.width = cv.height = 16; drawTex(cv.getContext('2d'), 0, 0, name); return cv; }
  function drawCubeIcon(c, key, s) {
    const b = BYID[ID[key]]; const top = texCanvas(faceTexName(b, 'top')), side = texCanvas(faceTexName(b, 'side'));
    // 간단 아이소 큐브
    const cx = s / 2, w = s * 0.42, hh = s * 0.24;
    function quad(img, pts, sh) { c.save(); c.globalAlpha = 1; const pat = c.createPattern(img, 'repeat'); c.fillStyle = pat || '#888'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); c.fillStyle = 'rgba(0,0,0,' + (1 - sh) + ')'; c.fill(); c.restore(); }
    const T = s * 0.14, B = s * 0.86, M = s * 0.5;
    quad(top, [[cx, T], [cx + w, T + hh], [cx, T + 2 * hh], [cx - w, T + hh]], 1.0);   // 윗면
    quad(side, [[cx - w, T + hh], [cx, T + 2 * hh], [cx, B], [cx - w, B - hh]], 0.8);   // 좌면
    quad(side, [[cx, T + 2 * hh], [cx + w, T + hh], [cx + w, B - hh], [cx, B]], 0.62);  // 우면
  }
  function drawItemIcon2(c, key, s) {
    const d = window.ADV_ITEMS && window.ADV_ITEMS[key]; const u = s / 16;
    const matCol = { wood: '#9c7a44', stone: '#9a9a9a', iron: '#dcdcdc', gold: '#f7d75c', diamond: '#5decd5' };
    function rect(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); }
    if (d && d.tool) { const m = matCol[d.mat] || '#bbb'; rect(7, 7, 1.8, 8, '#6b4f2a'); if (d.tool === 'pickaxe') { rect(3, 4, 10, 2, m); rect(3, 4, 2, 3, m); rect(11, 4, 2, 3, m); } else if (d.tool === 'axe') { rect(8, 3, 4, 5, m); } else if (d.tool === 'shovel') { rect(7, 3, 3, 4, m); } else if (d.tool === 'sword') { rect(7.4, 2, 1.8, 9, m); rect(6, 10, 4, 1.8, '#6b4f2a'); } else rect(6, 4, 5, 6, m); return; }
    if (d && d.food) { c.fillStyle = '#cc7a3a'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, 7); c.fill(); return; }
    c.fillStyle = '#b88'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.28, 0, 7); c.fill();
  }

  /* ---------------- 인벤/조합 UI(직접 배치 3×3, 셰이프리스) ---------------- */
  let invOpen = false; let grid = new Array(9).fill(null); let carry = null; let craftN = 4, craftTable = false;
  function toggleInventory() { if (invOpen) closeInv(); else openInventory('inv'); }
  function openInventory(mode) {
    invOpen = true; craftTable = (mode === 'table'); craftN = craftTable ? 9 : 4;
    if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
    renderInv();
  }
  function closeInv() { invOpen = false; // 그리드 아이템 회수
    grid.forEach((g, i) => { if (g) { addItem(g.k, g.n); grid[i] = null; } }); if (carry) { addItem(carry.k, carry.n); carry = null; }
    closeSheet(); refreshHotbar();
  }
  function craftOutput() {
    const items = {}; for (let i = 0; i < craftN; i++) { const g = grid[i]; if (g) items[g.k] = (items[g.k] || 0) + g.n; }
    const keys2 = Object.keys(items); if (!keys2.length) return null;
    for (const rc of window.ADV_RECIPES) {
      if (rc.table && !craftTable) continue;                 // 큰 조합은 제작대 필요
      const need = {}; rc.need.forEach(([k, n]) => need[k] = n);
      const nk = Object.keys(need); if (nk.length !== keys2.length) continue;
      let ok = true; for (const k of nk) { if (items[k] !== need[k]) { ok = false; break; } }
      if (ok) return rc;
    }
    return null;
  }
  function renderInv() {
    const out = craftOutput();
    const gcell = (i) => { const g = grid[i]; return `<button class="adv-slot adv3-gcell" data-act="adv3_grid" data-i="${i}">${g ? `<img src="${icon(g.k)}"><span class="adv-cnt">${g.n > 1 ? g.n : ''}</span>` : ''}</button>`; };
    const cellsN = craftTable ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3];
    const gridHTML = `<div class="adv3-craftgrid ${craftTable ? 'g3' : 'g2'}">${cellsN.map(gcell).join('')}</div>`;
    const outHTML = `<div class="adv3-craftout"><button class="adv-slot adv3-outcell" data-act="adv3_take">${out ? `<img src="${icon(out.out)}"><span class="adv-cnt">${out.count > 1 ? out.count : ''}</span>` : ''}</button></div>`;
    const cells = inv.map((s, i) => `<button class="adv-slot${i < 9 ? ' hot' : ''}" data-act="adv3_islot" data-i="${i}">${s ? `<img src="${icon(s.k)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : ''}</button>`).join('');
    const carryHTML = carry ? `<div class="adv3-carry">들고있음: ${window.advKor(carry.k)} ×${carry.n} <button class="btn btn--ghost" data-act="adv3_drop">내려놓기</button></div>` : '';
    openSheet(`<h3 class="sheet__title">🛠 조합 (${craftTable ? '제작대 3×3' : '2×2'} · 직접 배치)</h3>
      <p class="muted" style="font-size:12px">아이템 탭→들기, 칸 탭→1개 놓기. ${craftTable ? '' : '큰 조합은 제작대(crafting_table)를 설치하고 우클릭/탭하세요. '}재료를 칸에 채우면 결과가 뜨고, 결과 탭하면 제작.</p>
      <div class="adv3-crafttop">${gridHTML}<div class="adv3-arrow">▶</div>${outHTML}</div>
      ${carryHTML}
      <div class="adv3-invlabel muted">가방</div><div class="adv-invgrid">${cells}</div>
      <button class="btn btn--ghost btn--lg" data-act="adv3_close">닫기 (E)</button>`);
  }
  function invItemTap(i) {
    const s = inv[i]; if (carry) { // 들고있는 것을 인벤에 합치기/스왑
      if (!s) { inv[i] = carry; carry = null; } else if (s.k === carry.k) { s.n += carry.n; carry = null; } else { inv[i] = carry; carry = { k: s.k, n: s.n }; }
    } else { if (!s) return; carry = { k: s.k, n: s.n }; inv[i] = null; }
    refreshHotbar(); renderInv();
  }
  function gridTap(i) {
    if (carry) { const g = grid[i]; if (!g) { grid[i] = { k: carry.k, n: 1 }; carry.n--; if (carry.n <= 0) carry = null; } else if (g.k === carry.k) { g.n++; carry.n--; if (carry.n <= 0) carry = null; } else { /* 교체: 기존 회수 */ addItem(g.k, g.n); grid[i] = { k: carry.k, n: 1 }; carry.n--; if (carry.n <= 0) carry = null; } }
    else { const g = grid[i]; if (g) { if (!carry) { carry = { k: g.k, n: g.n }; grid[i] = null; } } }
    renderInv();
  }
  function takeOutput() {
    const out = craftOutput(); if (!out) return;
    for (const [k, n] of out.need) { let rem = n; for (let i = 0; i < 9; i++) { if (grid[i] && grid[i].k === k) { const d = Math.min(grid[i].n, rem); grid[i].n -= d; rem -= d; if (grid[i].n <= 0) grid[i] = null; } } }
    addItem(out.out, out.count); renderInv();
  }

  /* ---------------- 세이브/서버 ---------------- */
  let _saveT = 0, _dirty = false;
  function scheduleSave() { _dirty = true; }
  function serialize() { const ov = {}; overlay.forEach((v, k) => ov[k] = v); return { p: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp }, inv, hotbar, overlay: ov }; }
  function saveNow() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ p: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp }, inv, hotbar })); } catch (e) {} cloudSavePlayer(); _dirty = false; }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }

  function cloudReady() { return cfg.cloud && typeof sb !== 'undefined' && sb && typeof ME !== 'undefined' && ME && ME.token; }
  function queueServer(x, y, z, id) { pendingServer.set(x + ',' + y + ',' + z, id); }
  let _flushAt = 0;
  async function flushServer() { if (!cloudReady() || !pendingServer.size) return; if (Date.now() - _flushAt < 1500) return; _flushAt = Date.now(); const batch = {}; pendingServer.forEach((v, k) => batch[k] = String(v)); pendingServer = new Map(); try { await sb.rpc('adv3_world_set', { p_token: ME.token, p_edits: batch }); } catch (e) { for (const k in batch) if (!pendingServer.has(k)) pendingServer.set(k, Number(batch[k])); } }
  async function cloudLoadWorld() { if (!cloudReady()) return null; try { const { data, error } = await sb.rpc('adv3_world_get'); if (error) return null; return data || {}; } catch (e) { return null; } }
  let _cpAt = 0;
  async function cloudSavePlayer() { if (!cloudReady()) return; if (Date.now() - _cpAt < 4000) return; _cpAt = Date.now(); try { await sb.rpc('adv_save_player', { p_token: ME.token, p_state: { v3: serialize() } }); } catch (e) {} }
  async function cloudLoadPlayer() { if (!cloudReady()) return null; try { const { data } = await sb.rpc('adv_load_player', { p_token: ME.token }); return data && data.v3 ? data.v3 : null; } catch (e) { return null; } }

  /* ---------------- 멀티 ---------------- */
  let _posT = 0;
  function netStart() { if (typeof sb === 'undefined' || !sb || !cfg.cloud) return; try { const ch = sb.channel('adv3-world', { config: { broadcast: { self: false } } }); ch.on('broadcast', { event: 'a' }, p => onNet(p.payload)); ch.subscribe(); netCh = ch; netSend = (m) => { try { m.id = (ME && ME.id) || 'me'; ch.send({ type: 'broadcast', event: 'a', payload: m }); } catch (e) {} }; } catch (e) {} }
  function onNet(m) { if (!m || m.id === ((ME && ME.id) || 'me')) return; if (m.t === 'b') { setBlock(m.x, m.y, m.z, m.i, true); } else if (m.t === 'p') { let o = others[m.id]; if (!o) { o = others[m.id] = makeAvatar(m.name); } o.mesh.position.set(m.x, m.y, m.z); o.mesh.rotation.y = m.yaw || 0; o.t = Date.now(); } else if (m.t === 'leave') { removeAvatar(m.id); } }
  function makeAvatar(name) { const g = new THREE.BoxGeometry(0.6, 1.8, 0.6); const mat = new THREE.MeshBasicMaterial({ color: 0x3b7fd4 }); const mesh = new THREE.Mesh(g, mat); scene.add(mesh); return { mesh }; }
  function removeAvatar(id) { const o = others[id]; if (o) { scene.remove(o.mesh); o.mesh.geometry.dispose(); delete others[id]; } }
  function netTick(dt) { _posT += dt; if (_posT > 0.12 && netSend) { _posT = 0; netSend({ t: 'p', x: P.x, y: P.y, z: P.z, yaw: P.yaw, name: P.name }); } const now = Date.now(); for (const id in others) if (now - others[id].t > 4000) removeAvatar(id); }
  function netStop() { if (netSend) netSend({ t: 'leave' }); if (netCh && typeof leaveChannel === 'function') leaveChannel(netCh); netCh = null; netSend = null; for (const id in others) removeAvatar(id); }

  /* ---------------- 시작/종료 ---------------- */
  function start() {
    if (typeof THREE === 'undefined') { app().innerHTML = serverErr('3D 라이브러리를 불러오지 못했어요(네트워크 확인).'); return; }
    setScreen('adventure'); app().innerHTML = screenHTML();
    canvas = document.getElementById('adv3canvas');
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' }); }
    catch (e) { app().innerHTML = serverErr('이 기기/브라우저가 3D(WebGL)를 지원하지 않아요.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x7fb2e0, CHUNK * (RENDER - 1), CHUNK * (RENDER + 1));
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);
    cfg = loadCfg(); seed = WORLD_SEED;
    try { world.time = (typeof serverNow === 'function' ? serverNow() : Date.now()) / 1000 % cfg.dayLen; } catch (e) { world.time = cfg.dayLen * 0.25; }
    const _f = world.time / cfg.dayLen; if (!(_f > 0.1 && _f < 0.45)) world.time = cfg.dayLen * 0.22;   // 첫 진입은 환한 낮 보장(마크 새월드처럼)
    buildAtlas(); setupOverlays();
    resize(); window.addEventListener('resize', resize);
    bindInput(); running = true; lastT = 0;
    (async () => {
      // 서버 월드 로드(가능하면), 아니면 로컬
      let loadedOverlay = null;
      if (cloudReady()) { const w = await cloudLoadWorld(); if (w) { loadedOverlay = w; } const pd = await cloudLoadPlayer(); if (pd) applyPlayer(pd); else newPlayer(); }
      else { const ls = loadLocal(); if (ls) applyPlayer(ls); else newPlayer(); }
      if (loadedOverlay) { for (const k in loadedOverlay) overlay.set(k, Number(loadedOverlay[k])); }
      else { const ls = loadLocal(); if (ls && ls.overlay) for (const k in ls.overlay) overlay.set(k, ls.overlay[k]); }
      // 지표로 스폰 보정
      ensureSpawn();
      refreshHotbar(); updateHUD(); netStart();
    })();
    raf = requestAnimationFrame(loop);
  }
  function applyPlayer(d) { if (d.p) { P.x = d.p.x; P.y = d.p.y; P.z = d.p.z; P.yaw = d.p.yaw || 0; P.pitch = d.p.pitch || 0; P.hp = d.p.hp || 20; } if (d.inv) inv = d.inv.map(s => s ? { k: s.k, n: s.n } : null); if (d.hotbar != null) hotbar = d.hotbar; }
  function newPlayer() { inv = new Array(36).fill(null); P.x = 0.5; P.z = 0.5; P.y = surfaceH(0, 0) + 2; P.hp = cfg.startHp || 20; }   // 기본템 없음
  function ensureSpawn() { getChunk(Math.floor(P.x / CHUNK), Math.floor(P.z / CHUNK), true); let y = WORLD_H - 1; while (y > 1 && getBlock(Math.floor(P.x), y, Math.floor(P.z)) === 0) y--; if (P.y < y + 1) P.y = y + 2; }
  function resize() { if (!renderer) return; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function serverErr(msg) { return `<section class="screen"><header class="room__top"><button class="btn btn--ghost" data-act="adv_exit">← 홈</button><b style="margin-left:6px">🗺️ 모험</b></header><div class="grow center" style="justify-content:center;text-align:center;padding:20px"><p style="white-space:pre-wrap;line-height:1.7">${esc(msg)}</p></div></section>`; }
  function stop() {
    if (!running) return; running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', resize); unbindInput();
    try { saveNow(); flushServer(); } catch (e) {}
    netStop();
    chunks.forEach(c => { disposeMesh(c.mesh); disposeMesh(c.waterMesh); }); chunks.clear();
    if (renderer) { try { renderer.dispose(); } catch (e) {} }
    if (document.exitPointerLock && document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {}
    renderer = null; scene = null; camera = null; canvas = null; invOpen = false;
  }

  /* ---------------- 액션 위임 ---------------- */
  function act(a, el) {
    switch (a) {
      case 'adv3_inv': toggleInventory(); return true;
      case 'adv3_close': closeInv(); return true;
      case 'adv3_hot': hotbar = Number(el.dataset.i); refreshHotbar(); return true;
      case 'adv3_islot': invItemTap(Number(el.dataset.i)); return true;
      case 'adv3_grid': gridTap(Number(el.dataset.i)); return true;
      case 'adv3_take': takeOutput(); return true;
      case 'adv3_drop': if (carry) { addItem(carry.k, carry.n); carry = null; renderInv(); } return true;
      case 'adv3_jump': keys.Space = true; setTimeout(() => keys.Space = false, 120); return true;
    }
    return false;
  }

  /* ---------------- 공개 API ---------------- */
  window.adventure3dStart = start;
  window.adventure3dStop = stop;
  window.adventure3dRunning = function () { return running; };
  window.adventure3dAct = function (a, el) { if (a.indexOf('adv3_') === 0) return act(a, el); return false; };
  setInterval(() => { if (running) updateHUD(); }, 500);
})();
