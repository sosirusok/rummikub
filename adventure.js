/* =========================================================================
   adventure.js — 모험 탭: 2D 마인크래프트 서바이벌 엔진 (Canvas 2D)
   - 절차 생성 월드(10000 폭 · 바이옴 · 동굴 · 광맥 · 나무)
   - 채굴/설치(블록별 경도·요구도구·드롭률) · 인벤/핫바/조합/제련/상자
   - 몹(수동·적대) · 체력/허기 · 낮밤·조명 · 물/용암 · 낙하/전투
   - 브롤식 플로팅 조이스틱 + 점프 + 월드 탭 채굴
   - 자동 세이브(로컬 + 선택적 Supabase) · 멀티 프레즌스(브로드캐스트)
   - 비밀번호 게이트(초기 1234qwer, 개발자 모드에서 변경/해제)
   공용: ui-core.js, net.js(sb). 데이터: adventure-data.js
   ========================================================================= */
(function () {
  'use strict';

  /* ============================ 설정/상수 ============================ */
  const WORLD_W = 10000, WORLD_H = 256, SEA = 62;
  const WORLD_SEED = 20240601;   // 고정 시드 → 모든 유저가 '같은 하나의 맵'을 공유(멀티)
  const REACH = 5.2;                      // 상호작용 사거리(타일)
  const SAVE_KEY = 'adv_save_v1';
  const CFG_KEY = 'adv_cfg_v1';
  const PW_KEY = 'adv_pw_v1';

  // 개발자 조정 가능한 기본 수치
  const DEFAULT_CFG = {
    breakMul: 1,        // 채굴시간 배수(↓ 빠름)
    dropMul: 1,         // 드롭률 배수
    mobHpMul: 1,        // 몹 체력 배수
    mobDmgMul: 1,       // 몹 데미지 배수
    hungerMul: 1,       // 허기 소모 배수
    spawnMul: 1,        // 몹 스폰 배수
    dayLen: 600,        // 하루 길이(초)
    startHp: 20,
    invSave: true,      // 인벤토리/진행 자동 세이브
    pwEnabled: true,    // 비밀번호 사용 여부
    keepInvOnDeath: false,
    cloud: true,        // Supabase 동기/멀티(가능할 때)
  };
  let cfg = loadCfg();
  function loadCfg() { try { return Object.assign({}, DEFAULT_CFG, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULT_CFG); } }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} if (cfg.cloud) cloudSaveSetting('cfg', cfg); }

  function getPassword() { try { return localStorage.getItem(PW_KEY) || '1234qwer'; } catch (e) { return '1234qwer'; } }
  function setPassword(v) { try { localStorage.setItem(PW_KEY, v); } catch (e) {} if (cfg.cloud) cloudSaveSetting('pw', v); }

  /* ============================ 상태 ============================ */
  let running = false, started = false;
  let canvas = null, ctx = null, rafId = 0;
  let W = 0, H = 0, TS = 28;               // 화면 폭/높이(px), 타일 픽셀크기
  let lastT = 0, acc = 0;
  const STEP = 1 / 60;                      // 고정 물리 스텝

  // 월드 편집 오버라이드: "x,y" -> blockKey ('air' 포함)
  let edits = new Map();
  let surfCache = new Map();               // x -> surfaceY
  let chestStore = new Map();              // "x,y" -> [ {k,n}...18 ]
  let mobs = [], drops = [], particles = [], others = {};  // others: 멀티 플레이어
  const tileCache = new Map();             // blockKey -> canvas(TS)
  let seed = 1337;

  // 플레이어
  const P = {
    x: 5000.5, y: 40, vx: 0, vy: 0, w: 0.6, h: 1.8, onGround: false, face: 1,
    hp: 20, hunger: 20, sat: 5, air: 10, xp: 0, lvl: 0,
    hurtT: 0, regenT: 0, starveT: 0, inWater: false, onLadder: false, name: 'Steve',
  };
  // 인벤토리: 36칸(0~8 핫바). slot={k,n} 또는 null
  let inv = new Array(36).fill(null);
  let hotbar = 0;
  let world = { time: 0 };                 // time: 0..dayLen 초

  // 입력
  const joy = { active: false, ox: 0, oy: 0, x: 0, y: 0, id: -1 };
  const aim = { active: false, tx: 0, ty: 0, id: -1, progress: 0, holding: false, hitKey: '' };
  let jumpHeld = false, jumpQueued = false;

  /* ============================ 유틸 ============================ */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ikey = (x, y) => x + ',' + y;
  function rngFrom(n) { let s = (n >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function noise1(x, f) { const xf = x * f; const x0 = Math.floor(xf), t = xf - x0; const a = hash2(x0, 99), b = hash2(x0 + 1, 99); const u = t * t * (3 - 2 * t); return a + (b - a) * u; }
  function noise2(x, y, f) { const xf = x * f, yf = y * f; const x0 = Math.floor(xf), y0 = Math.floor(yf), tx = xf - x0, ty = yf - y0; const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1); const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty); return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy; }

  /* ============================ 월드 생성 ============================ */
  function biomeAt(x) { const n = noise1(x + 5000, 0.004); return n < 0.30 ? 'desert' : n < 0.42 ? 'plains' : n < 0.72 ? 'forest' : n < 0.85 ? 'plains' : 'snow'; }
  function surfaceY(x) {
    if (surfCache.has(x)) return surfCache.get(x);
    const base = 70;
    let h = base - (noise1(x, 0.012) - 0.5) * 26 - (noise1(x, 0.05) - 0.5) * 8 - (noise1(x, 0.18) - 0.5) * 3;
    const b = biomeAt(x);
    if (b === 'desert') h -= 2;
    const sy = Math.round(clamp(h, 18, WORLD_H - 30));
    surfCache.set(x, sy); if (surfCache.size > 6000) surfCache.clear();
    return sy;
  }
  function isTreeOrigin(x) {
    const b = biomeAt(x); if (b === 'desert' || b === 'snow') return hash2(x, 7) < 0.02 && b !== 'desert';
    return hash2(x, 7) < (b === 'forest' ? 0.18 : 0.05);
  }
  function treeAt(x, y) {
    for (let ox = x - 2; ox <= x + 2; ox++) {
      if (ox < 0 || ox >= WORLD_W || !isTreeOrigin(ox)) continue;
      const sy = surfaceY(ox); if (sy >= SEA) continue;        // 물속/저지대 제외
      const th = 4 + Math.floor(hash2(ox, 3) * 3);             // 줄기 높이
      const topY = sy - 1 - th;
      const log = (biomeAt(ox) === 'snow') ? 'birch_log' : 'oak_log';
      if (ox === x && y <= sy - 1 && y > topY) return log;     // 줄기
      // 잎: 꼭대기 주변 반경
      const dx = x - ox, dy = y - (topY + 1);
      if (Math.abs(dx) <= 2 && dy >= -1 && dy <= 2) {
        if (Math.abs(dx) === 2 && (dy < 0 || dy > 1)) continue;
        if (ox === x && y > topY && y <= sy - 1) continue;     // 줄기칸은 줄기
        if (hash2(x * 13 + ox, y * 7) < 0.86) return 'oak_leaves';
      }
    }
    return null;
  }
  function procBlock(x, y) {
    if (x < 0 || x >= WORLD_W || y < 0) return 'air';
    if (y >= WORLD_H - 1) return 'bedrock';
    if (y >= WORLD_H - 4 && hash2(x, y) < 0.6) return 'bedrock';
    const sy = surfaceY(x), b = biomeAt(x);
    if (y < sy) {                                   // 지표 위
      const t = treeAt(x, y); if (t) return t;
      if (y >= SEA) return (y >= SEA && sy > SEA) ? 'water' : 'air';   // 해수면 아래는 물
      return 'air';
    }
    if (y === sy) {                                 // 지표면
      if (sy >= SEA) return 'sand';                 // 물 아래 바닥
      if (b === 'desert') return 'sand';
      if (b === 'snow') return 'snow_block';
      return 'grass';
    }
    const depth = y - sy;
    if (depth <= (b === 'desert' ? 4 : 3)) return b === 'desert' ? 'sandstone' : 'dirt';
    // 동굴
    const cave = noise2(x, y * 1.4, 0.07);
    if (cave > 0.72 && y < WORLD_H - 6) return (y > 110 && hash2(x, y) < 0.4) ? 'lava' : 'air';
    // 광물(깊이별)
    const r = hash2(x * 31 + 1, y * 17 + 3);
    if (depth > 6) {
      if (r < 0.012) return 'coal_ore';
      if (r < 0.020 && y > 40) return 'iron_ore';
      if (r < 0.026 && y > 100) return 'gold_ore';
      if (r < 0.031 && y > 110) return 'redstone_ore';
      if (r < 0.034 && y > 90) return 'lapis_ore';
      if (r < 0.0365 && y > 120) return 'diamond_ore';
      if (r < 0.038 && y > 120) return 'emerald_ore';
    }
    const m = noise2(x, y, 0.09);
    if (m > 0.80) return (m > 0.90) ? 'andesite' : 'granite';
    return 'stone';
  }
  function getBlock(x, y) {
    x |= 0; y |= 0;
    const e = edits.get(ikey(x, y));
    if (e !== undefined) return e;
    return procBlock(x, y);
  }
  function setBlock(x, y, k, broadcast) {
    edits.set(ikey(x, y), k);
    if (broadcast !== false) netSend({ t: 'b', x, y, k });
    scheduleSave();
  }
  function blockDef(k) { return window.ADV_BLOCKS[k] || null; }
  function isSolid(k) { const d = blockDef(k); return d && d.solid !== false && !d.liquid && !d.air && d.key !== 'air' && !(d.plant) && d.key !== 'torch' && d.key !== 'sapling' && d.key !== 'wheat_crop'; }
  function isOpaque(k) { const d = blockDef(k); return d && !d.air && d.key !== 'air' && !d.transparent && !d.liquid; }

  /* ============================ 텍스처 ============================ */
  function mix(c1, c2, t) {
    const a = hx(c1), b = hx(c2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function hx(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function makeTile(k) {
    const d = blockDef(k); const N = 16; const cv = document.createElement('canvas'); cv.width = N; cv.height = N; const c = cv.getContext('2d');
    let pal = (d && d.pal) || ['#888', '#666', '#aaa'];
    if (pal.length < 3) pal = [pal[0], pal[0] || '#888', pal[0] || '#888'];   // 단색 팔레트 보정
    const r = rngFrom((hashStr(k) ^ 0x9e3779b9) >>> 0);
    function px(x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
    const tex = (d && d.tex) || 'noise';
    // 기본 노이즈 채움
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = r();
      px(x, y, t < 0.33 ? pal[1] : t < 0.66 ? pal[0] : pal[2]);
    }
    if (tex === 'grass') {
      const top = (d.top) || ['#6aa84f', '#5b9142', '#7bbf5c'];
      for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) { const t = r(); px(x, y, t < 0.33 ? top[1] : t < 0.66 ? top[0] : top[2]); }
      for (let x = 0; x < N; x++) if (r() < 0.5) px(x, 4, top[1]);
    } else if (tex === 'log') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if ((x + y) % 5 === 0) px(x, y, d.ring || pal[2]); }
      for (let y = 0; y < N; y++) { px(0, y, pal[1]); px(N - 1, y, pal[1]); }
    } else if (tex === 'plank') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { px(x, y, ((y >> 2) % 2) ? pal[1] : pal[0]); if (x % 7 === 0) px(x, y, pal[1]); }
      for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x++) px(x, y, mix(pal[1], '#000', 0.25));
    } else if (tex === 'cobble' || tex === 'stonebrick' || tex === 'bricks') {
      const bw = tex === 'bricks' ? 8 : 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let edge;
        if (tex === 'bricks') edge = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0);
        else if (tex === 'stonebrick') edge = (y % 8 === 0) || (x % 8 === ((y < 8) ? 0 : 4));
        else edge = (hash2(x * 3 + 1, y * 3) < 0.16);
        px(x, y, edge ? mix(pal[1], '#000', 0.35) : (r() < 0.5 ? pal[0] : pal[2]));
      }
    } else if (tex === 'ore') {
      for (let i = 0; i < 9; i++) { const ox = 2 + ((hash2(i, 1) * 12) | 0), oy = 2 + ((hash2(i, 2) * 12) | 0); px(ox, oy, d.ore); px(ox + 1, oy, mix(d.ore, '#000', .2)); px(ox, oy + 1, mix(d.ore, '#fff', .25)); if (i % 2) px(ox + 1, oy + 1, d.ore); }
    } else if (tex === 'leaves') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = r(); px(x, y, t < 0.4 ? pal[1] : t < 0.75 ? pal[0] : pal[2]); if (t > 0.93) px(x, y, mix(pal[0], '#000', 0.4)); }
    } else if (tex === 'glass') {
      c.clearRect(0, 0, N, N); c.fillStyle = 'rgba(174,227,240,0.18)'; c.fillRect(0, 0, N, N);
      c.strokeStyle = '#cdebf5'; c.strokeRect(0.5, 0.5, N - 1, N - 1); px(3, 3, '#fff'); px(4, 3, '#fff');
    } else if (tex === 'wool') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, ((x + y) % 2) ? pal[0] : pal[1]);
    } else if (tex === 'glow' || tex === 'furnace' || tex === 'craft' || tex === 'chest' || tex === 'bookshelf') {
      // 기본 노이즈 위에 면 그림
      if (tex === 'glow') { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = r(); px(x, y, t < 0.5 ? pal[2] : pal[0]); } for (let i = 0; i < 6; i++) px((hash2(i, 5) * 16) | 0, (hash2(i, 6) * 16) | 0, '#fff7cc'); }
      if (tex === 'craft') { c.fillStyle = pal[1]; c.fillRect(0, 0, N, N); c.fillStyle = pal[0]; c.fillRect(1, 1, N - 2, 5); c.strokeStyle = mix(pal[1], '#000', .4); for (let i = 4; i < N; i += 4) { c.beginPath(); c.moveTo(0, i + .5); c.lineTo(N, i + .5); c.stroke(); } c.fillStyle = '#5a4327'; c.fillRect(3, 8, 4, 4); c.fillRect(9, 8, 4, 4); }
      if (tex === 'furnace') { c.fillStyle = pal[0]; c.fillRect(0, 0, N, N); c.fillStyle = pal[1]; c.fillRect(0, 0, N, 2); c.fillStyle = '#222'; c.fillRect(4, 6, 8, 7); c.fillStyle = '#e8902a'; c.fillRect(5, 10, 6, 3); }
      if (tex === 'chest') { c.fillStyle = pal[0]; c.fillRect(1, 1, N - 2, N - 2); c.strokeStyle = pal[1]; c.strokeRect(1.5, 1.5, N - 3, N - 3); c.fillStyle = '#3a2a14'; c.fillRect(0, 7, N, 2); c.fillStyle = '#d7c27a'; c.fillRect(7, 7, 2, 3); }
      if (tex === 'bookshelf') { c.fillStyle = pal[0]; c.fillRect(0, 0, N, N); c.fillStyle = pal[1]; c.fillRect(0, 0, N, 2); c.fillRect(0, 13, N, 3); const cols = ['#b23b3b', '#3b6bb2', '#3bb24f', '#c9a23b']; for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % 4]; c.fillRect(1 + i * 2.4, 3, 2, 9); } }
    } else if (tex === 'sandstone') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, ((y >> 2) % 2) ? pal[1] : pal[0]); for (let y = 3; y < N; y += 4) for (let x = 0; x < N; x++) px(x, y, mix(pal[1], '#000', .25));
    } else if (tex === 'pumpkin') {
      c.fillStyle = pal[0]; c.fillRect(0, 0, N, N); for (let x = 1; x < N; x += 3) { c.fillStyle = mix(pal[0], '#000', .25); c.fillRect(x, 0, 1, N); } c.fillStyle = '#5a3a14'; c.fillRect(6, 0, 4, 2);
    } else if (tex === 'tnt') {
      c.fillStyle = pal[0]; c.fillRect(0, 0, N, N); c.fillStyle = '#f4f4f4'; c.fillRect(0, 6, N, 4); c.fillStyle = '#000'; c.font = '5px monospace'; c.fillText('TNT', 1, 10);
    } else if (tex === 'liquid') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = r(); px(x, y, t < 0.5 ? pal[0] : pal[1]); }
    }
    return cv;
  }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
  function tileFor(k) {
    const ck = k + '@' + TS; let cv = tileCache.get(ck);
    if (cv) return cv;
    const base = makeTile(k);
    cv = document.createElement('canvas'); cv.width = TS; cv.height = TS; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(base, 0, 0, TS, TS);
    tileCache.set(ck, cv); return cv;
  }

  /* ============================ 아이콘 ============================ */
  const iconCache = new Map();
  function itemIcon(key, size) {
    size = size || 40; const ck = key + '#' + size; if (iconCache.has(ck)) return iconCache.get(ck);
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    const special = { torch: 1, sapling: 1, wheat_crop: 1 };
    if (window.ADV_BLOCKS[key] && !special[key]) { c.drawImage(makeTile(key), 0, 0, size, size); }
    else { drawItemIcon(c, key, size); }
    const url = cv.toDataURL(); iconCache.set(ck, url); return url;
  }
  function drawItemIcon(c, key, s) {
    const d = window.ADV_ITEMS[key] || {}; const u = s / 16;
    c.clearRect(0, 0, s, s);
    // 블록형 특수 아이콘(횃불/묘목/밀)
    if (key === 'torch') { c.fillStyle = '#6b4f2a'; c.fillRect(s * 0.44, s * 0.45, s * 0.12, s * 0.45); c.fillStyle = '#ffcf5a'; c.fillRect(s * 0.38, s * 0.28, s * 0.24, s * 0.22); c.fillStyle = '#fff7cc'; c.fillRect(s * 0.45, s * 0.32, s * 0.1, s * 0.1); return; }
    if (key === 'sapling') { c.fillStyle = '#6b4f2a'; c.fillRect(s * 0.46, s * 0.55, s * 0.08, s * 0.35); c.fillStyle = '#4c8f38'; c.fillRect(s * 0.28, s * 0.3, s * 0.44, s * 0.32); return; }
    if (key === 'wheat_crop') { c.fillStyle = '#cdb24a'; for (let i = 0; i < 3; i++) c.fillRect(s * (0.28 + i * 0.22), s * 0.3, s * 0.08, s * 0.55); return; }
    const matCol = { wood: '#9c7a44', stone: '#9a9a9a', iron: '#dcdcdc', gold: '#f7d75c', diamond: '#5decd5' };
    function rect(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); }
    if (d.tool) {
      const m = matCol[d.mat] || '#bbb';
      rect(7, 7, 1.6, 8, '#6b4f2a');                          // 손잡이
      if (d.tool === 'pickaxe') { rect(3, 4, 10, 2, m); rect(3, 4, 2, 2, m); rect(11, 4, 2, 2, m); }
      else if (d.tool === 'axe') { rect(8, 3, 4, 5, m); rect(7, 4, 1.6, 3, m); }
      else if (d.tool === 'shovel') { rect(7, 3, 2.4, 4, m); }
      else if (d.tool === 'sword') { rect(7.5, 2, 1.6, 9, m); rect(6, 10, 4, 1.6, '#6b4f2a'); }
      else if (d.tool === 'hoe') { rect(8, 3, 4, 1.8, m); }
      else { rect(5, 4, 6, 7, m); }
    } else if (d.food) {
      const fc = { apple: '#d0322b', golden_apple: '#f7d75c', bread: '#c8923a', cooked_porkchop: '#caa07a', cooked_beef: '#8a4b2a', cooked_chicken: '#d8b07a', raw_porkchop: '#e89aa0', raw_beef: '#b5483f', raw_chicken: '#e8c0a0', melon_slice: '#3fa03f', carrot: '#e07b1f', potato: '#c8a25a', baked_potato: '#a87a3a', cookie: '#a86c3a', pumpkin_pie: '#d6791f' }[key] || '#cc7a3a';
      c.fillStyle = fc; c.beginPath(); c.arc(s / 2, s / 2, s * 0.32, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(s * 0.4, s * 0.4, s * 0.08, 0, 7); c.fill();
    } else {
      const mc = { stick: '#9c7a44', coal: '#222', charcoal: '#333', iron_ingot: '#dcdcdc', gold_ingot: '#f7d75c', gold_nugget: '#f7e08c', diamond: '#5decd5', emerald: '#3bd16f', redstone: '#e8323b', lapis: '#2552c4', flint: '#43423f', string: '#eee', gunpowder: '#555', bone: '#e8e6d8', bone_meal: '#f0eee0', feather: '#f4f4f4', leather: '#8a5a32', wheat: '#cdb24a', seeds: '#6a8c3a', clay_ball: '#a4a8b6', brick_item: '#9a4f3f', paper: '#f4f4f4', book: '#9a4f3f', sugar: '#fff', arrow: '#ccc', glowstone_dust: '#f4d35e', rotten_flesh: '#6a5a3a', sugar_cane: '#7ac86a', iron_ore_drop: '#caa07a', gold_ore_drop: '#e8c878' }[key] || '#b88';
      if (d.tool === undefined) {
        if (key === 'stick') { rect(7, 3, 2, 10, mc); }
        else { c.fillStyle = mc; c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(s * 0.35, s * 0.55, s * 0.3, s * 0.12); }
      }
    }
  }

  /* ============================ 인벤토리 로직 ============================ */
  function addItem(key, n) {
    n = n || 1; const max = window.advStack(key);
    for (let i = 0; i < inv.length && n > 0; i++) { const s = inv[i]; if (s && s.k === key && s.n < max) { const add = Math.min(max - s.n, n); s.n += add; n -= add; } }
    for (let i = 0; i < inv.length && n > 0; i++) { if (!inv[i]) { const add = Math.min(max, n); inv[i] = { k: key, n: add }; n -= add; } }
    refreshHotbar(); scheduleSave(); return n;        // 남은(못담은) 수량
  }
  function countItem(key) { let c = 0; for (const s of inv) if (s && s.k === key) c += s.n; return c; }
  function removeItem(key, n) { for (let i = 0; i < inv.length && n > 0; i++) { const s = inv[i]; if (s && s.k === key) { const d = Math.min(s.n, n); s.n -= d; n -= d; if (s.n <= 0) inv[i] = null; } } refreshHotbar(); }
  function heldSlot() { return inv[hotbar]; }
  function consumeHeld(n) { const s = inv[hotbar]; if (!s) return; s.n -= (n || 1); if (s.n <= 0) inv[hotbar] = null; refreshHotbar(); }
  function damageTool(slotIdx) {
    const s = inv[slotIdx]; if (!s) return; const d = window.ADV_ITEMS[s.k]; if (!d || !d.dur) return;
    s.dmg = (s.dmg || 0) + 1; if (s.dmg >= d.dur) { inv[slotIdx] = null; toast('도구가 부서졌어요'); } refreshHotbar();
  }

  /* ============================ 채굴/설치 ============================ */
  function toolFactor(blockKey, slot) {
    const bd = blockDef(blockKey); if (!bd) return { mult: 1, ok: true, harvest: true };
    const it = slot && window.ADV_ITEMS[slot.k];
    let mult = 1, harvest = true;
    const need = bd.tool;                              // 적합 도구 종류
    const usingTool = it && it.tool;
    // 요구 레벨(수확)
    if (bd.level && bd.level > 0) {
      const lvl = (usingTool && need && it.tool === need) ? (it.level || 0) : -1;
      harvest = lvl >= bd.level;
    }
    // 속도
    if (usingTool && need && it.tool === need) mult = it.speed || 1;
    else if (usingTool && it.tool === 'sword' && bd.key === 'oak_leaves') mult = 1.5;
    return { mult, harvest, need };
  }
  function breakTime(blockKey, slot) {
    const bd = blockDef(blockKey); if (!bd || bd.hard == null) return 0.0;
    const f = toolFactor(blockKey, slot);
    // 마인크래프트식: base = hardness*1.5(적합) / *5(부적합·미수확)
    const proper = !bd.tool || (slot && window.ADV_ITEMS[slot.k] && window.ADV_ITEMS[slot.k].tool === bd.tool);
    let t = bd.hard * (proper && f.harvest ? 1.5 : 5) / (f.mult || 1);
    return Math.max(0.05, t * cfg.breakMul);
  }
  function mineTile(x, y) {
    const k = getBlock(x, y); const bd = blockDef(k);
    if (!bd || k === 'air' || k === 'bedrock' || bd.liquid) return;
    const f = toolFactor(k, heldSlot());
    // 드롭
    if (f.harvest) {
      const drops = bd.drops || [{ i: k, c: 1 }];
      for (const dr of drops) {
        let chance = (dr.chance != null ? dr.chance : 1) * (dr.chance != null ? cfg.dropMul : 1);
        if (Math.random() > chance) continue;
        let cnt = dr.c; if (dr.max) cnt = dr.c + Math.floor(Math.random() * (dr.max - dr.c + 1));
        if (cnt > 0) spawnDrop(x + 0.5, y + 0.3, dr.i, cnt);
      }
      if (bd.xp) P.xp += bd.xp;
    }
    // 도구 내구
    if (heldSlot() && window.ADV_ITEMS[heldSlot().k] && window.ADV_ITEMS[heldSlot().k].tool) damageTool(hotbar);
    setBlock(x, y, 'air');
    spawnParticles(x + 0.5, y + 0.5, bd.pal ? bd.pal[0] : '#999');
    // 위 식물/모래 낙하 처리
    afterEditPhysics(x, y);
    addHungerExert(0.02);
  }
  function afterEditPhysics(x, y) {
    // 위에 중력블록(모래/자갈) 또는 식물 있으면 처리
    const up = getBlock(x, y - 1); const ud = blockDef(up);
    if (ud && ud.gravity) { /* 낙하 엔티티 단순화: 한 칸 내려놓기 반복 */ collapseGravity(x, y - 1); }
    if (ud && (ud.plant || up === 'torch')) setBlock(x, y - 1, 'air');
  }
  function collapseGravity(x, y) {
    let k = getBlock(x, y); if (!blockDef(k) || !blockDef(k).gravity) return;
    let ny = y; while (getBlock(x, ny + 1) === 'air' && ny < WORLD_H - 2) ny++;
    if (ny !== y) { setBlock(x, y, 'air'); setBlock(x, ny, k); }
  }
  function placeTile(x, y) {
    const s = heldSlot(); if (!s) return false;
    const k = s.k; const bd = window.ADV_BLOCKS[k];
    const placeKey = bd ? k : (window.ADV_ITEMS[k] && window.ADV_ITEMS[k].places);
    if (!placeKey) return false;
    if (getBlock(x, y) !== 'air' && !blockDef(getBlock(x, y)).liquid) return false;
    // 지지블록 필요(허공 설치 방지): 상하좌우 중 하나는 비어있지 않아야
    const nbAir = getBlock(x - 1, y) === 'air' && getBlock(x + 1, y) === 'air' && getBlock(x, y - 1) === 'air' && getBlock(x, y + 1) === 'air';
    if (nbAir) return false;
    // 플레이어와 겹치면 금지(고체만)
    if (window.ADV_BLOCKS[placeKey] && isSolid(placeKey) && rectsOverlap(x, y, 1, 1, P.x - P.w / 2, P.y - P.h, P.w, P.h)) return false;
    setBlock(x, y, placeKey);
    if (window.ADV_ITEMS[k] && window.ADV_ITEMS[k].places) { inv[hotbar] = { k: 'bucket', n: s.n }; }  // 양동이 비우기
    else consumeHeld(1);
    return true;
  }
  function interactStation(x, y) {
    const k = getBlock(x, y); const bd = blockDef(k); if (!bd || !bd.station) return false;
    if (bd.station === 'craft') { openCrafting(true); return true; }
    if (bd.station === 'furnace') { openFurnace(x, y); return true; }
    if (bd.station === 'chest') { openChest(x, y); return true; }
    return false;
  }

  /* ============================ 드롭/파티클 ============================ */
  function spawnDrop(x, y, key, n) { drops.push({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: -2, k: key, n, t: 0 }); }
  function spawnParticles(x, y, col) { for (let i = 0; i < 6; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, col, life: 0.5 }); }

  /* ============================ 물리 ============================ */
  function solidAt(x, y) { return isSolid(getBlock(Math.floor(x), Math.floor(y))); }
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  function collideMove(ent) {
    // x
    ent.x += ent.vx * STEP;
    let bx = boxBlocks(ent);
    for (const [cx, cy] of bx) {
      if (isSolid(getBlock(cx, cy)) && rectsOverlap(cx, cy, 1, 1, ent.x - ent.w / 2, ent.y - ent.h, ent.w, ent.h)) {
        if (ent.vx > 0) ent.x = cx - ent.w / 2 - 0.001; else if (ent.vx < 0) ent.x = cx + 1 + ent.w / 2 + 0.001;
        ent.blockedX = true; ent.vx = 0;
      }
    }
    // y
    ent.y += ent.vy * STEP; ent.onGround = false;
    bx = boxBlocks(ent);
    for (const [cx, cy] of bx) {
      if (isSolid(getBlock(cx, cy)) && rectsOverlap(cx, cy, 1, 1, ent.x - ent.w / 2, ent.y - ent.h, ent.w, ent.h)) {
        if (ent.vy > 0) { ent.y = cy - 0.001; ent.onGround = true; if (ent.vy > 11) fallDamage(ent, ent.vy); ent.vy = 0; }
        else if (ent.vy < 0) { ent.y = cy + 1 + ent.h + 0.001; ent.vy = 0; }
      }
    }
  }
  function boxBlocks(ent) {
    const out = []; const x0 = Math.floor(ent.x - ent.w / 2 - 1), x1 = Math.floor(ent.x + ent.w / 2 + 1);
    const y0 = Math.floor(ent.y - ent.h - 1), y1 = Math.floor(ent.y + 1);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
    return out;
  }
  function fallDamage(ent, v) { if (ent === P) { const dmg = Math.floor((v - 11) * 0.7); if (dmg > 0) hurtPlayer(dmg, '낙하'); } }

  /* ============================ 플레이어 업데이트 ============================ */
  function feetBlock() { return getBlock(Math.floor(P.x), Math.floor(P.y - 0.1)); }
  function headBlock() { return getBlock(Math.floor(P.x), Math.floor(P.y - P.h + 0.2)); }
  function updatePlayer(dt) {
    // 입력 → 속도
    let move = 0;
    if (joy.active) { const dx = joy.x - joy.ox; if (Math.abs(dx) > TS * 0.18) move = dx > 0 ? 1 : -1; }
    if (move !== 0) P.face = move;
    const inLiquid = blockDef(getBlock(Math.floor(P.x), Math.floor(P.y - P.h / 2)) ).liquid;
    P.inWater = getBlock(Math.floor(P.x), Math.floor(P.y - 0.5)) === 'water' || getBlock(Math.floor(P.x), Math.floor(P.y - P.h + 0.3)) === 'water';
    P.onLadder = getBlock(Math.floor(P.x), Math.floor(P.y - 0.9)) === 'ladder';
    const speed = 4.3;
    P.vx = move * speed;

    // 점프 / 사다리 / 수영
    const jumpUp = joy.active && (joy.y - joy.oy) < -TS * 0.45;
    const climbUp = joy.active && (joy.y - joy.oy) < -TS * 0.2;
    const wantJump = jumpQueued || jumpHeld || jumpUp;
    if (P.onLadder) { P.vy = (climbUp || jumpHeld) ? -3.4 : 1.8; }   // 사다리: 위로 밀면 오르고 아니면 천천히 내려감
    else if (P.inWater) { P.vy += 16 * dt; P.vy = Math.min(P.vy, 3.0); if (wantJump) P.vy = -3.2; }
    else {
      P.vy += 30 * dt; P.vy = Math.min(P.vy, 22);
      if (wantJump && P.onGround) { P.vy = -9.2; }
    }
    jumpQueued = false;

    // 자동 점프(1칸 턱)
    if (move !== 0 && P.onGround && !wantJump) {
      const fx = Math.floor(P.x + P.face * (P.w / 2 + 0.05));
      const footY = Math.floor(P.y - 0.1);
      if (isSolid(getBlock(fx, footY)) && !isSolid(getBlock(fx, footY - 1)) && !isSolid(getBlock(fx, footY - 2))) P.vy = -8.0;
    }

    P.blockedX = false;
    collideMove(P);

    // 환경 피해
    const fb = blockDef(feetBlock()); const hb = blockDef(getBlock(Math.floor(P.x), Math.floor(P.y - P.h / 2)));
    if (fb && fb.hurt) hurtPlayer(fb.hurt, '용암/선인장');
    else if (hb && hb.hurt) hurtPlayer(hb.hurt, '용암');

    // 떨어지면 사망(허공)
    if (P.y > WORLD_H + 5) { hurtPlayer(99, '심연'); }

    updateVitals(dt);
  }

  function updateVitals(dt) {
    // 허기 소모
    P._hungerAcc = (P._hungerAcc || 0) + dt * 0.06 * cfg.hungerMul;
    if (Math.abs(P.vx) > 0.1) P._hungerAcc += dt * 0.02 * cfg.hungerMul;
    if (P._hungerAcc >= 1) { P._hungerAcc -= 1; if (P.sat > 0) P.sat = Math.max(0, P.sat - 1); else P.hunger = Math.max(0, P.hunger - 1); }
    // 재생/굶주림
    if (P.hunger >= 18 && P.hp < 20) { P.regenT += dt; if (P.regenT >= 3) { P.regenT = 0; P.hp = Math.min(20, P.hp + 1); if (P.sat > 0) P.sat--; } }
    else P.regenT = 0;
    if (P.hunger <= 0) { P.starveT += dt; if (P.starveT >= 4) { P.starveT = 0; if (P.hp > 1) hurtPlayer(1, '굶주림'); } }
    if (P.hurtT > 0) P.hurtT -= dt;
    // 레벨
    while (P.xp >= 10 + P.lvl * 2) { P.xp -= (10 + P.lvl * 2); P.lvl++; }
  }
  function addHungerExert(v) { P._hungerAcc = (P._hungerAcc || 0) + v; }
  function hurtPlayer(dmg, cause) {
    if (P.hurtT > 0.0 && cause !== '굶주림' && cause !== '낙하' && cause !== '용암' && cause !== '용암/선인장') return;
    if (P.hp <= 0) return;
    P.hp = Math.max(0, P.hp - dmg); P.hurtT = 0.5; if (navigator.vibrate) navigator.vibrate(30);
    if (P.hp <= 0) onDeath(cause);
    updateHUD();
  }
  function onDeath(cause) {
    if (!cfg.keepInvOnDeath) { for (const s of inv) if (s) spawnDrop(P.x, P.y - 0.5, s.k, s.n); inv = new Array(36).fill(null); refreshHotbar(); }
    toast('사망: ' + (cause || '') + ' — 부활합니다', false);
    respawn();
  }
  function respawn() { P.hp = cfg.startHp; P.hunger = 20; P.sat = 5; P.x = 5000.5; P.y = surfaceY(5000) - 0.1; P.vx = P.vy = 0; updateHUD(); scheduleSave(); }

  /* ============================ 몹 ============================ */
  function spawnMobs() {
    if (mobs.length > 14 * cfg.spawnMul) return;
    const day = isDay();
    const r = Math.random();
    if (r > 0.04 * cfg.spawnMul) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const sx = Math.floor(P.x + side * (10 + Math.random() * 6));
    if (sx < 1 || sx >= WORLD_W - 1) return;
    let sy = surfaceY(sx) - 1;
    // 지표 위 빈칸 찾기
    while (sy > 4 && getBlock(sx, sy) !== 'air') sy--;
    while (sy < WORLD_H - 2 && getBlock(sx, sy + 1) === 'air') sy++;
    const lightHere = lightAt(sx, sy);
    let type;
    if (day && lightHere > 7) { type = ['pig', 'cow', 'sheep', 'chicken'][Math.floor(Math.random() * 4)]; }
    else if (lightHere <= 6) { type = ['zombie', 'skeleton', 'creeper', 'spider'][Math.floor(Math.random() * 4)]; }
    else return;
    const md = window.ADV_MOBS[type];
    mobs.push({ type, x: sx + 0.5, y: sy + 0.999, vx: 0, vy: 0, w: md.w, h: md.h, hp: Math.round(md.hp * cfg.mobHpMul), face: 1, hurtT: 0, atkT: 0, fuse: 0, jumpT: 0 });
  }
  function updateMobs(dt) {
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i]; const md = window.ADV_MOBS[m.type];
      if (Math.abs(m.x - P.x) > 40) { mobs.splice(i, 1); continue; }
      // 낮 화상
      if (md.burn && isDay() && lightAt(Math.floor(m.x), Math.floor(m.y - 1)) > 11) { m.hp -= dt * 2; m.hurtT = 0.2; }
      // AI
      m.vy += 30 * dt; m.vy = Math.min(m.vy, 22);
      let dir = 0;
      if (md.hostile) {
        const dx = P.x - m.x; dir = Math.abs(dx) > 0.4 ? Math.sign(dx) : 0;
        if (Math.abs(dx) < 14 && Math.abs(P.y - m.y) < 6) {
          m.vx = dir * md.speed;
          // 접근 시 공격/폭발
          if (rectsOverlap(m.x - m.w / 2, m.y - m.h, m.w, m.h, P.x - P.w / 2, P.y - P.h, P.w, P.h)) {
            if (md.explode) { m.fuse += dt; if (m.fuse > 1.4) { creeperBoom(m); mobs.splice(i, 1); continue; } }
            else { m.atkT -= dt; if (m.atkT <= 0) { m.atkT = 0.8; hurtPlayer(Math.max(1, Math.round((md.dmg || 1) * cfg.mobDmgMul)), m.type); knockback(P, Math.sign(P.x - m.x)); } }
          } else if (md.explode) m.fuse = Math.max(0, m.fuse - dt);
        } else m.vx *= 0.8;
      } else {
        // 수동: 랜덤 배회
        m.wT = (m.wT || 0) - dt; if (m.wT <= 0) { m.wT = 1 + Math.random() * 2; m.wdir = [-1, 0, 1][Math.floor(Math.random() * 3)]; }
        m.vx = (m.wdir || 0) * md.speed * 0.5; dir = m.wdir;
      }
      if (dir) m.face = dir;
      // 턱 점프
      if (m.vx !== 0 && m.onGround) { const fx = Math.floor(m.x + Math.sign(m.vx) * (m.w / 2 + 0.1)); const fy = Math.floor(m.y - 0.1); if (isSolid(getBlock(fx, fy)) && !isSolid(getBlock(fx, fy - 1))) m.vy = -8; if (md.climb && isSolid(getBlock(fx, fy))) m.vy = -6; }
      collideMove(m);
      if (m.hurtT > 0) m.hurtT -= dt;
      if (m.y > WORLD_H + 5) { mobs.splice(i, 1); continue; }
      if (m.hp <= 0) { mobDeath(m); mobs.splice(i, 1); }
    }
    if (Math.random() < 0.5) spawnMobs();
  }
  function knockback(ent, dir) { ent.vx = dir * 4; ent.vy = Math.min(ent.vy, -3.5); }
  function creeperBoom(m) {
    const R = 4; for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) { if (dx * dx + dy * dy > R * R) continue; const x = Math.floor(m.x) + dx, y = Math.floor(m.y) + dy; const k = getBlock(x, y); const bd = blockDef(k); if (k !== 'air' && k !== 'bedrock' && bd && bd.hard < 50) setBlock(x, y, 'air'); }
    for (let i = 0; i < 30; i++) particles.push({ x: m.x, y: m.y - 0.5, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, col: '#888', life: 0.6 });
    const d = Math.hypot(P.x - m.x, P.y - m.y); if (d < R + 1) hurtPlayer(Math.round((window.ADV_MOBS.creeper.dmg) * cfg.mobDmgMul * (1 - d / (R + 1))), 'creeper');
  }
  function mobDeath(m) { const md = window.ADV_MOBS[m.type]; for (const dr of (md.drops || [])) { let cnt = dr.c; if (dr.max != null) cnt = dr.c + Math.floor(Math.random() * (dr.max - dr.c + 1)); if (cnt > 0) spawnDrop(m.x, m.y - 0.3, dr.i, cnt); } P.xp += 1 + Math.floor(Math.random() * 3); }
  function hitMob(m) {
    const s = heldSlot(); const it = s && window.ADV_ITEMS[s.k]; const dmg = (it && it.dmg) ? it.dmg : 1;
    m.hp -= dmg; m.hurtT = 0.25; knockback(m, Math.sign(m.x - P.x) || P.face);
    if (it && it.dur && it.tool === 'sword') damageTool(hotbar);
    addHungerExert(0.05);
  }

  /* ============================ 드롭/파티클 업데이트 ============================ */
  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt;
      const cx = P.x, cy = P.y - P.h / 2; const dx = cx - d.x, dy = cy - d.y; const dist = Math.hypot(dx, dy);
      // 자석: 가까우면 플레이어 쪽으로 끌려옴(획득 보장)
      if (d.t > 0.15 && dist < 2.6) { const pull = (2.6 - dist) / 2.6 * 14; d.x += (dx / (dist || 1)) * pull * dt; d.y += (dy / (dist || 1)) * pull * dt; }
      const inWater = getBlock(Math.floor(d.x), Math.floor(d.y)) === 'water';
      d.vy += (inWater ? 6 : 30) * dt; d.vy = Math.min(d.vy, inWater ? 2 : 18); if (inWater && d.vy > 0.5) d.vy = 0.4;
      d.x += d.vx * dt; d.vx *= 0.9;
      let ny = d.y + d.vy * dt; if (isSolid(getBlock(Math.floor(d.x), Math.floor(ny)))) { d.vy = 0; ny = Math.floor(ny); } d.y = ny;
      // 획득
      if (d.t > 0.15 && Math.abs(d.x - P.x) < 1.0 && Math.abs(d.y - cy) < 1.2) {
        const left = addItem(d.k, d.n); if (left === 0) { drops.splice(i, 1); flashPickup(d.k, d.n); continue; } else d.n = left;
      }
      if (d.t > 600) drops.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; } p.vy += 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  let _pickT = 0, _pickMsg = '';
  function flashPickup(k, n) { _pickMsg = '+' + n + ' ' + window.advKor(k); _pickT = 1.4; }

  /* ============================ 낮밤/조명 ============================ */
  function dayFrac() { return (world.time % cfg.dayLen) / cfg.dayLen; }   // 0=일출 0.25=정오 0.5=일몰 0.75=자정
  function isDay() { const f = dayFrac(); return f > 0.04 && f < 0.46; }
  function skyLevel() {
    const f = dayFrac(); let b;
    if (f < 0.5) {                              // 낮
      b = 15 - Math.abs(f - 0.25) / 0.25 * 3;   // 정오 15, 일출/일몰 12
      if (f < 0.06) b = 5 + (f / 0.06) * 10;    // 새벽 박명
      else if (f > 0.44) b = 5 + ((0.5 - f) / 0.06) * 10;  // 황혼
    } else b = 4;                               // 밤
    return clamp(Math.round(b), 4, 15);
  }
  // 간이 조명: 컬럼 하늘빛 + 광원(횃불/용암/발광석) 반경
  let lightGrid = null, lgX0 = 0, lgY0 = 0, lgW = 0, lgH = 0;
  function buildLight(x0, y0, w, h) {
    lgX0 = x0; lgY0 = y0; lgW = w; lgH = h;
    const g = new Float32Array(w * h); const sky = skyLevel();
    for (let cx = 0; cx < w; cx++) {
      const wx = x0 + cx; let open = true;
      for (let cy = 0; cy < h; cy++) {
        const wy = y0 + cy; const k = getBlock(wx, wy);
        if (open && isOpaque(k)) open = false;
        g[cy * w + cx] = open ? sky : 0;
      }
    }
    // 광원 BFS
    const q = [];
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      const k = getBlock(x0 + cx, y0 + cy); const bd = blockDef(k);
      if (bd && bd.light) { const idx = cy * w + cx; if (bd.light > g[idx]) { g[idx] = bd.light; q.push(idx); } }
    }
    let head = 0;
    while (head < q.length) {
      const idx = q[head++]; const cx = idx % w, cy = (idx / w) | 0; const lv = g[idx]; if (lv <= 1) continue;
      const nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nidx = ny * w + nx; const nk = getBlock(x0 + nx, y0 + ny);
        const atten = isOpaque(nk) ? 3 : 1; const nl = lv - atten;
        if (nl > g[nidx]) { g[nidx] = nl; if (nl > 1) q.push(nidx); }
      }
    }
    lightGrid = g;
  }
  function lightAt(wx, wy) {
    if (lightGrid && wx >= lgX0 && wy >= lgY0 && wx < lgX0 + lgW && wy < lgY0 + lgH) return lightGrid[(wy - lgY0) * lgW + (wx - lgX0)];
    // 폴백: 컬럼 하늘빛
    let open = true; for (let y = 0; y <= wy; y++) { if (isOpaque(getBlock(wx, y))) { open = false; break; } if (y === wy) break; }
    return open ? skyLevel() : 0;
  }

  /* ============================ 렌더 ============================ */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    TS = clamp(Math.round(Math.min(W, H) / 15), 22, 46);
    tileCache.clear();
  }
  function camera() { return { cx: P.x - (W / TS) / 2, cy: (P.y - P.h / 2) - (H / TS) / 2 }; }
  function render() {
    const cam = camera(); const cx = cam.cx, cy = cam.cy;
    // 하늘
    const sky = skyLevel() / 15; const f = (world.time % cfg.dayLen) / cfg.dayLen;
    let top, bot;
    if (f < 0.5) { top = mix('#3a6ea5', '#7fb2e0', sky); bot = mix('#6a8fb5', '#bfe0f5', sky); }
    else { top = '#0a0e1a'; bot = '#1a2233'; }
    const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, top); grad.addColorStop(1, bot); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // 해/달/별
    drawCelestial(f);
    const x0 = Math.floor(cx) - 1, y0 = Math.floor(cy) - 1;
    const cols = Math.ceil(W / TS) + 3, rows = Math.ceil(H / TS) + 3;
    buildLight(x0, y0, cols, rows);
    // 타일
    for (let j = 0; j < rows; j++) {
      const wy = y0 + j;
      for (let i = 0; i < cols; i++) {
        const wx = x0 + i; if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) continue;
        const k = getBlock(wx, wy); if (k === 'air') continue;
        const sx = Math.round((wx - cx) * TS), sy = Math.round((wy - cy) * TS);
        const bd = blockDef(k);
        if (bd && bd.liquid) { ctx.globalAlpha = k === 'water' ? 0.62 : 0.86; ctx.drawImage(tileFor(k), sx, sy, TS, TS); ctx.globalAlpha = 1; }
        else if (bd && (bd.plant || k === 'torch' || k === 'sapling' || k === 'wheat_crop')) drawSpecial(k, sx, sy);
        else ctx.drawImage(tileFor(k), sx, sy, TS, TS);
        // 조명 음영
        const lv = lightAt(wx, wy); const dark = 1 - clamp(lv / 15, 0.06, 1);
        if (dark > 0.02) { ctx.fillStyle = 'rgba(0,0,0,' + dark.toFixed(3) + ')'; ctx.fillRect(sx, sy, TS, TS); }
      }
    }
    // 채굴 진행
    if (aim.holding && aim.progress > 0) {
      const sx = Math.round((aim.tx - cx) * TS), sy = Math.round((aim.ty - cy) * TS);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, TS - 2, TS - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; const ph = TS * aim.progress; ctx.fillRect(sx, sy + TS - ph, TS, ph);
    }
    // 드롭
    for (const d of drops) { const sx = Math.round((d.x - cx) * TS), sy = Math.round((d.y - cy) * TS); const sz = TS * 0.5; ctx.save(); ctx.translate(sx, sy + Math.sin(d.t * 3) * 2); drawIconImg(d.k, -sz / 2, -sz / 2, sz); ctx.restore(); }
    // 몹
    for (const m of mobs) drawMob(m, cx, cy);
    // 다른 플레이어
    for (const id in others) { const o = others[id]; const sx = Math.round((o.x - cx) * TS), sy = Math.round((o.y - cy) * TS); drawHuman(sx, sy, o.face || 1, '#3b7fd4', o.name); }
    // 내 플레이어
    drawPlayer(cx, cy);
    // 파티클
    for (const p of particles) { ctx.fillStyle = p.col; const sx = (p.x - cx) * TS, sy = (p.y - cy) * TS; ctx.fillRect(sx, sy, 3, 3); }
    // 조준 하이라이트
    drawAimHint(cx, cy);
    // 데미지 비네트
    if (P.hurtT > 0) { ctx.fillStyle = 'rgba(180,0,0,' + (P.hurtT * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawCelestial(f) {
    const cxp = W / 2, horizon = H * 0.96, r = Math.min(W, H) * 0.46;
    if (f < 0.5) {                              // 해: 동(좌)→정오(위)→서(우)
      const a = Math.PI * (1 - 2 * f); const x = cxp - Math.cos(a) * r, y = horizon - Math.sin(a) * r;
      ctx.fillStyle = '#fff4c0'; ctx.fillRect(x - 17, y - 17, 34, 34); ctx.fillStyle = '#ffe070'; ctx.fillRect(x - 13, y - 13, 26, 26);
    } else {                                    // 달 + 별
      const g = f - 0.5; const a = Math.PI * (1 - 2 * g); const x = cxp - Math.cos(a) * r, y = horizon - Math.sin(a) * r;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 40; i++) { const sx = (i * 137.5) % W, sy = (i * 89.3) % (H * 0.62); ctx.fillRect(sx, sy, 1.5, 1.5); }
      ctx.fillStyle = '#eef'; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fill();
    }
  }
  function drawSpecial(k, sx, sy) {
    if (k === 'torch') { ctx.fillStyle = '#6b4f2a'; ctx.fillRect(sx + TS * 0.42, sy + TS * 0.35, TS * 0.16, TS * 0.55); ctx.fillStyle = '#ffcf5a'; ctx.fillRect(sx + TS * 0.38, sy + TS * 0.22, TS * 0.24, TS * 0.22); ctx.fillStyle = '#fff7cc'; ctx.fillRect(sx + TS * 0.44, sy + TS * 0.26, TS * 0.12, TS * 0.1); return; }
    if (k === 'sapling') { ctx.fillStyle = '#6b4f2a'; ctx.fillRect(sx + TS * 0.46, sy + TS * 0.5, TS * 0.08, TS * 0.4); ctx.fillStyle = '#4c8f38'; ctx.fillRect(sx + TS * 0.3, sy + TS * 0.3, TS * 0.4, TS * 0.3); return; }
    if (k === 'wheat_crop') { ctx.fillStyle = '#cdb24a'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + TS * (0.25 + i * 0.25), sy + TS * 0.3, TS * 0.08, TS * 0.6); return; }
    ctx.drawImage(tileFor(k), sx, sy, TS, TS);
  }
  const itemCanvasCache = new Map();
  function itemCanvas(k) { let cv = itemCanvasCache.get(k); if (cv) return cv; cv = document.createElement('canvas'); cv.width = cv.height = 16; drawItemIcon(cv.getContext('2d'), k, 16); itemCanvasCache.set(k, cv); return cv; }
  function drawIconImg(k, x, y, s) {
    // 캔버스 직접 그리기(드롭/손에 든 아이템). 캔버스 캐시로 매 프레임 할당 방지.
    if (window.ADV_BLOCKS[k]) ctx.drawImage(tileFor(k), x, y, s, s);
    else ctx.drawImage(itemCanvas(k), x, y, s, s);
  }
  function drawHuman(sx, sy, face, col, name) {
    const w = TS * 0.6, h = TS * 1.8;
    ctx.fillStyle = '#caa07a'; ctx.fillRect(sx - w / 2, sy - h, w, TS * 0.45);       // 머리
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(sx - w / 2, sy - h, w, TS * 0.12);       // 머리카락
    ctx.fillStyle = col; ctx.fillRect(sx - w / 2, sy - h + TS * 0.45, w, TS * 0.75); // 몸통
    ctx.fillStyle = '#26456e'; ctx.fillRect(sx - w / 2, sy - h + TS * 1.2, w, TS * 0.6); // 다리
    // 눈(방향)
    ctx.fillStyle = '#fff'; const ex = face > 0 ? sx + w * 0.1 : sx - w * 0.3; ctx.fillRect(ex, sy - h + TS * 0.18, TS * 0.1, TS * 0.1);
    if (name) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.font = '10px sans-serif'; const tw = ctx.measureText(name).width; ctx.fillRect(sx - tw / 2 - 2, sy - h - 14, tw + 4, 12); ctx.fillStyle = '#fff'; ctx.fillText(name, sx - tw / 2, sy - h - 4); }
  }
  function drawPlayer(cx, cy) {
    const sx = Math.round((P.x - cx) * TS), sy = Math.round((P.y - cy) * TS);
    if (P.hurtT > 0 && Math.floor(P.hurtT * 20) % 2) ctx.globalAlpha = 0.6;
    drawHuman(sx, sy, P.face, '#2f8f4f', null);
    // 손에 든 도구
    const s = heldSlot(); if (s) { const hx = P.face > 0 ? sx + TS * 0.3 : sx - TS * 0.5; drawIconImg(s.k, hx, sy - TS * 1.05, TS * 0.55); }
    ctx.globalAlpha = 1;
  }
  function drawMob(m, cx, cy) {
    const md = window.ADV_MOBS[m.type]; const sx = Math.round((m.x - cx) * TS), sy = Math.round((m.y - cy) * TS);
    const w = m.w * TS, h = m.h * TS;
    if (m.hurtT > 0) ctx.globalAlpha = 0.7;
    ctx.fillStyle = md.col; ctx.fillRect(sx - w / 2, sy - h, w, h);
    // 디테일
    if (m.type === 'creeper') { ctx.fillStyle = '#1a3a1a'; ctx.fillRect(sx - w * 0.28, sy - h * 0.8, w * 0.18, h * 0.18); ctx.fillRect(sx + w * 0.1, sy - h * 0.8, w * 0.18, h * 0.18); ctx.fillRect(sx - w * 0.1, sy - h * 0.62, w * 0.2, h * 0.3); }
    else { ctx.fillStyle = (md.hostile ? '#a00' : '#000'); const ex = m.face > 0 ? sx + w * 0.05 : sx - w * 0.25; ctx.fillRect(ex, sy - h * 0.85, w * 0.18, h * 0.12); ctx.fillRect(ex + w * 0.25, sy - h * 0.85, w * 0.18, h * 0.12); }
    // 체력바
    const hpf = clamp(m.hp / (md.hp * cfg.mobHpMul), 0, 1); if (hpf < 1) { ctx.fillStyle = '#400'; ctx.fillRect(sx - w / 2, sy - h - 6, w, 3); ctx.fillStyle = '#e33'; ctx.fillRect(sx - w / 2, sy - h - 6, w * hpf, 3); }
    ctx.globalAlpha = 1;
  }
  function drawAimHint(cx, cy) {
    const t = currentTarget(); if (!t) return;
    const sx = Math.round((t.x - cx) * TS), sy = Math.round((t.y - cy) * TS);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);
  }

  /* ============================ 조준 대상 ============================ */
  function currentTarget() {
    if (aim.active) return { x: aim.tx, y: aim.ty };
    return null;
  }
  function screenToTile(px, py) { const cam = camera(); return { x: Math.floor(cam.cx + px / TS), y: Math.floor(cam.cy + py / TS) }; }
  function inReach(tx, ty) { return Math.hypot((tx + 0.5) - P.x, (ty + 0.5) - (P.y - P.h / 2)) <= REACH; }

  /* ============================ 입력 ============================ */
  function bindInput() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  function unbindInput() { if (!canvas) return; canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onDown(e) {
    const p = relPos(e); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    if (p.x < W * 0.42 && joy.id === -1) {                 // 좌측: 조이스틱
      joy.active = true; joy.id = e.pointerId; joy.ox = joy.x = p.x; joy.oy = joy.y = p.y;
    } else if (aim.id === -1) {                              // 우측: 조준/채굴
      aim.id = e.pointerId; aimAt(p);
    }
  }
  function onMove(e) {
    const p = relPos(e);
    if (e.pointerId === joy.id) { joy.x = p.x; joy.y = p.y; }
    else if (e.pointerId === aim.id) { aimAt(p); }
  }
  function onUp(e) {
    if (e.pointerId === joy.id) { joy.active = false; joy.id = -1; }
    else if (e.pointerId === aim.id) {
      // 짧은 탭: 설치/상호작용/공격
      if (!aim.didMine) tapAction();
      aim.id = -1; aim.active = false; aim.holding = false; aim.progress = 0; aim.didMine = false;
    }
  }
  function aimAt(p) {
    const t = screenToTile(p.x, p.y); aim.tx = t.x; aim.ty = t.y; aim.active = true;
    if (!inReach(t.x, t.y)) { aim.holding = false; return; }
    const k = getBlock(t.x, t.y); const bd = blockDef(k);
    if (k !== 'air' && bd && bd.hard != null && k !== 'bedrock' && !bd.liquid) { aim.holding = true; if (aim.hitKey !== ikey(t.x, t.y)) { aim.hitKey = ikey(t.x, t.y); aim.progress = 0; } }
    else aim.holding = false;
  }
  function tapAction() {
    const tx = aim.tx, ty = aim.ty; if (!inReach(tx, ty)) return;
    // 몹 공격
    for (const m of mobs) { if (rectsOverlap(tx, ty, 1, 1, m.x - m.w / 2, m.y - m.h, m.w, m.h)) { hitMob(m); return; } }
    // 작업대/화로/상자
    if (interactStation(tx, ty)) return;
    // 설치
    const k = getBlock(tx, ty); if (k === 'air' || blockDef(k).liquid) { placeTile(tx, ty); return; }
    // 음식 먹기(빈손 탭 시 무시) — 핫바 음식이면 먹기 버튼으로 처리
  }
  function updateMining(dt) {
    if (!aim.holding || !aim.active) { aim.progress = 0; return; }
    const k = getBlock(aim.tx, aim.ty); if (k === 'air' || k === 'bedrock' || !blockDef(k) || blockDef(k).hard == null) { aim.holding = false; return; }
    if (!inReach(aim.tx, aim.ty)) { aim.holding = false; return; }
    const t = breakTime(k, heldSlot()); aim.progress += dt / t;
    if (aim.progress >= 1) { mineTile(aim.tx, aim.ty); aim.progress = 0; aim.didMine = true; aim.holding = false; aim.hitKey = ''; }
  }

  /* ============================ HUD / DOM ============================ */
  function screenHTML() {
    return `
    <section class="screen adv-screen" data-adv="1">
      <canvas id="advCanvas"></canvas>
      <div class="adv-top">
        <div class="adv-stats" id="advStats"></div>
        <div class="adv-topbtns">
          <button class="adv-ibtn" data-act="adv_inv" aria-label="인벤토리">🎒</button>
          <button class="adv-ibtn" data-act="adv_exit" aria-label="나가기">✕</button>
        </div>
      </div>
      <div class="adv-pickup" id="advPickup"></div>
      <div class="adv-joy" id="advJoyEl"></div>
      <div class="adv-rbtns">
        <button class="adv-jump" data-act="adv_jumpdown" id="advJump">⤒</button>
      </div>
      <div class="adv-hotbar" id="advHotbar"></div>
    </section>`;
  }
  function refreshHotbar() {
    const el = document.getElementById('advHotbar'); if (!el) return;
    let h = '';
    for (let i = 0; i < 9; i++) {
      const s = inv[i];
      const sel = i === hotbar ? ' is-sel' : '';
      const icon = s ? `<img src="${itemIcon(s.k, 40)}" alt=""><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : '';
      const dur = s && window.ADV_ITEMS[s.k] && window.ADV_ITEMS[s.k].dur ? `<i class="adv-dur" style="width:${Math.round((1 - (s.dmg || 0) / window.ADV_ITEMS[s.k].dur) * 100)}%"></i>` : '';
      h += `<button class="adv-slot${sel}" data-act="adv_hot" data-i="${i}">${icon}${dur}</button>`;
    }
    el.innerHTML = h;
  }
  function updateHUD() {
    const el = document.getElementById('advStats'); if (!el) return;
    let hearts = ''; for (let i = 0; i < 10; i++) { const v = P.hp - i * 2; hearts += `<span class="adv-heart">${v >= 2 ? '❤️' : v === 1 ? '💗' : '🖤'}</span>`; }
    let food = ''; for (let i = 0; i < 10; i++) { const v = P.hunger - i * 2; food += `<span class="adv-food">${v >= 2 ? '🍗' : v === 1 ? '🦴' : '▫️'}</span>`; }
    el.innerHTML = `<div class="adv-bar">${hearts}</div><div class="adv-bar">${food}</div><div class="adv-xp">Lv.${P.lvl} · XP ${P.xp}</div>`;
  }
  function updatePickup(dt) { const el = document.getElementById('advPickup'); if (!el) return; if (_pickT > 0) { _pickT -= dt; el.textContent = _pickMsg; el.style.opacity = clamp(_pickT, 0, 1); } else el.style.opacity = 0; }
  function drawJoy() {
    const el = document.getElementById('advJoyEl'); if (!el) return;
    if (!joy.active) { el.style.display = 'none'; return; }
    el.style.display = 'block'; const r = 52;
    el.style.left = (joy.ox - r) + 'px'; el.style.top = (joy.oy - r) + 'px'; el.style.width = el.style.height = (r * 2) + 'px';
    const dx = clamp(joy.x - joy.ox, -r, r), dy = clamp(joy.y - joy.oy, -r, r);
    el.innerHTML = `<div class="adv-joy-knob" style="transform:translate(${dx}px,${dy}px)"></div>`;
  }

  /* ============================ 조합 UI ============================ */
  function recipeAvailable(rc, hasTable) {
    if (rc.table && !hasTable) return false;
    for (const [k, n] of rc.need) if (countItem(k) < n) return false;
    return true;
  }
  function openCrafting(hasTable) {
    const list = window.ADV_RECIPES.map((rc, idx) => ({ rc, idx, ok: recipeAvailable(rc, hasTable), vis: !rc.table || hasTable }))
      .filter(r => r.vis).sort((a, b) => (b.ok - a.ok));
    const rows = list.map(r => {
      const need = r.rc.need.map(([k, n]) => `<span class="adv-need ${countItem(k) >= n ? 'ok' : 'no'}"><img src="${itemIcon(k, 22)}">${n}</span>`).join('');
      return `<div class="adv-recipe ${r.ok ? '' : 'dim'}">
        <img class="adv-rout" src="${itemIcon(r.rc.out, 34)}">
        <div class="adv-rinfo"><b>${window.advKor(r.rc.out)} ${r.rc.count > 1 ? '×' + r.rc.count : ''}</b><div class="adv-needs">${need}</div></div>
        <button class="btn btn--primary adv-craftbtn" data-act="adv_craft" data-i="${r.idx}" data-t="${hasTable ? 1 : 0}" ${r.ok ? '' : 'disabled'}>제작</button>
      </div>`;
    }).join('');
    openSheet(`<h3 class="sheet__title">🛠 조합 ${hasTable ? '(제작대 3×3)' : '(2×2)'}</h3>
      <div class="adv-craftlist">${rows || '<p class="muted">조합 가능한 게 없어요</p>'}</div>
      <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
  }
  function doCraft(idx, hasTable) {
    const rc = window.ADV_RECIPES[idx]; if (!rc || !recipeAvailable(rc, !!hasTable)) return;
    for (const [k, n] of rc.need) removeItem(k, n);
    addItem(rc.out, rc.count); P.xp += 1;
    openCrafting(!!hasTable);   // 갱신
  }

  /* ============================ 제련 UI ============================ */
  let furnacePos = null;
  function openFurnace(x, y) {
    furnacePos = ikey(x, y);
    const smeltables = Object.keys(window.ADV_SMELT.recipes).filter(k => countItem(k) > 0);
    const fuels = Object.keys(window.ADV_SMELT.fuel).filter(k => countItem(k) > 0);
    const fuelHTML = fuels.length ? fuels.map(k => `<span class="adv-need ok"><img src="${itemIcon(k, 22)}">${countItem(k)}</span>`).join('') : '<span class="muted">연료 없음(석탄/숯/판자)</span>';
    const rows = smeltables.map(k => {
      const out = window.ADV_SMELT.recipes[k];
      return `<div class="adv-recipe"><img class="adv-rout" src="${itemIcon(k, 30)}"><div class="adv-rinfo"><b>${window.advKor(k)} → ${window.advKor(out)}</b><div class="muted" style="font-size:11px">보유 ${countItem(k)}</div></div>
        <button class="btn btn--primary adv-craftbtn" data-act="adv_smelt" data-k="${k}" ${fuels.length ? '' : 'disabled'}>제련</button></div>`;
    }).join('');
    openSheet(`<h3 class="sheet__title">🔥 화로</h3><p class="muted" style="font-size:12px">연료: ${fuelHTML}</p>
      <div class="adv-craftlist">${rows || '<p class="muted">제련할 아이템이 없어요</p>'}</div>
      <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
  }
  function doSmelt(k) {
    if (countItem(k) <= 0) return;
    const fuels = Object.keys(window.ADV_SMELT.fuel).filter(f => countItem(f) > 0);
    if (!fuels.length) { toast('연료가 없어요'); return; }
    removeItem(k, 1); removeItem(fuels[0], 1);   // 단순화: 1개당 연료 1
    addItem(window.ADV_SMELT.recipes[k], 1); P.xp += 1;
    openFurnace(furnacePos.split(',')[0] | 0, furnacePos.split(',')[1] | 0);
  }

  /* ============================ 상자 UI ============================ */
  function openChest(x, y) {
    const key = ikey(x, y); _chestKey = key; let store = chestStore.get(key); if (!store) { store = new Array(18).fill(null); chestStore.set(key, store); }
    const cells = store.map((s, i) => `<button class="adv-slot" data-act="adv_chest_take" data-i="${i}">${s ? `<img src="${itemIcon(s.k, 36)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : ''}</button>`).join('');
    const myCells = inv.map((s, i) => `<button class="adv-slot" data-act="adv_chest_put" data-i="${i}">${s ? `<img src="${itemIcon(s.k, 36)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : ''}</button>`).join('');
    openSheet(`<h3 class="sheet__title">📦 상자</h3><div class="adv-invgrid adv-chestgrid">${cells}</div>
      <p class="muted" style="font-size:12px;margin:6px 2px">내 가방 (탭→상자로)</p><div class="adv-invgrid">${myCells}</div>
      <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
  }
  function chestTake(i) { const s = chestStore.get(_openChestKey()); if (!s || !s[i]) return; const it = s[i]; const left = addItem(it.k, it.n); if (left) it.n = left; else s[i] = null; scheduleSave(); openChestRefresh(); }
  function chestPut(i) { if (!inv[i]) return; const s = chestStore.get(_openChestKey()); if (!s) return; const it = inv[i]; for (let j = 0; j < s.length; j++) { if (!s[j]) { s[j] = it; inv[i] = null; break; } else if (s[j].k === it.k && s[j].n < window.advStack(it.k)) { s[j].n += it.n; inv[i] = null; break; } } refreshHotbar(); scheduleSave(); openChestRefresh(); }
  function _openChestKey() { return _chestKey; }
  let _chestKey = null;
  function openChestRefresh() { if (_chestKey) { const p = _chestKey.split(','); openChest(p[0] | 0, p[1] | 0); } }

  /* ============================ 인벤토리 UI ============================ */
  function openInventory() {
    const cells = inv.map((s, i) => {
      const dur = s && window.ADV_ITEMS[s.k] && window.ADV_ITEMS[s.k].dur ? `<i class="adv-dur" style="width:${Math.round((1 - (s.dmg || 0) / window.ADV_ITEMS[s.k].dur) * 100)}%"></i>` : '';
      const eat = s && window.ADV_ITEMS[s.k] && window.ADV_ITEMS[s.k].food ? ' adv-eatable' : '';
      return `<button class="adv-slot${i < 9 ? ' hot' : ''}${eat}" data-act="adv_islot" data-i="${i}">${s ? `<img src="${itemIcon(s.k, 38)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>${dur}` : ''}</button>`;
    }).join('');
    openSheet(`<h3 class="sheet__title">🎒 가방</h3>
      <p class="muted" style="font-size:12px">아이템 탭 → 핫바(1번칸)로 이동 · 음식은 먹기. 아래 줄이 핫바.</p>
      <div class="adv-invgrid">${cells}</div>
      <div class="adv-invrow"><button class="btn btn--primary btn--lg" data-act="adv_craft2">🛠 조합(2×2)</button></div>
      <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
  }
  function invSlotTap(i) {
    const s = inv[i]; if (!s) return;
    const it = window.ADV_ITEMS[s.k];
    if (it && it.food) { eatFood(i); return; }
    // 핫바로 스왑(빈 핫바칸 우선, 없으면 0번과 스왑)
    if (i >= 9) { let dst = -1; for (let j = 0; j < 9; j++) if (!inv[j]) { dst = j; break; } if (dst === -1) dst = hotbar; const tmp = inv[dst]; inv[dst] = s; inv[i] = tmp; }
    else { hotbar = i; }
    refreshHotbar(); openInventory();
  }
  function eatFood(i) {
    const s = inv[i]; const it = window.ADV_ITEMS[s.k]; if (!it || !it.food) return;
    if (P.hunger >= 20 && !it.regen) { toast('배가 불러요'); return; }
    P.hunger = Math.min(20, P.hunger + it.food); P.sat = Math.min(P.hunger, P.sat + it.food * 0.6);
    if (it.regen) P.hp = Math.min(20, P.hp + 4);
    if (it.poison && Math.random() < it.poison) { hurtPlayer(1, '식중독'); }
    s.n--; if (s.n <= 0) inv[i] = null; refreshHotbar(); updateHUD(); openInventory();
  }

  /* ============================ 세이브/로드 ============================ */
  let saveT = 0, dirty = false;
  function scheduleSave() { dirty = true; }
  function serialize() {
    const e = {}; edits.forEach((v, k) => { e[k] = v; }); const ch = {}; chestStore.forEach((v, k) => { ch[k] = v; });
    return { v: 1, p: { x: P.x, y: P.y, hp: P.hp, hunger: P.hunger, sat: P.sat, xp: P.xp, lvl: P.lvl }, inv, hotbar, time: world.time, edits: e, chests: ch, seed };
  }
  function saveNow() {
    if (!cfg.invSave) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) { /* 용량초과 등 */ }
    if (cfg.cloud) cloudSavePlayer();
    dirty = false;
  }
  function loadSave(data) {
    try {
      if (!data) return false;
      seed = WORLD_SEED;   // 항상 공유 맵 시드 사용(유저별 편집은 edits 로 덮어씀)
      surfCache.clear();
      if (data.p) { P.x = data.p.x; P.y = data.p.y; P.hp = data.p.hp; P.hunger = data.p.hunger; P.sat = data.p.sat || 5; P.xp = data.p.xp || 0; P.lvl = data.p.lvl || 0; }
      if (data.inv) inv = data.inv.map(s => s ? { k: s.k, n: s.n, dmg: s.dmg } : null);
      if (data.hotbar != null) hotbar = data.hotbar;
      if (data.time != null) world.time = data.time;
      edits = new Map(); if (data.edits) for (const k in data.edits) edits.set(k, data.edits[k]);
      chestStore = new Map(); if (data.chests) for (const k in data.chests) chestStore.set(k, data.chests[k]);
      return true;
    } catch (e) { console.warn('adv load', e); return false; }
  }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }

  /* ============================ 클라우드(선택) ============================ */
  function cloudReady() { return cfg.cloud && typeof sb !== 'undefined' && sb && typeof ME !== 'undefined' && ME && ME.token; }
  async function cloudSaveSetting(kind, val) { if (!cloudReady()) return; try { await sb.rpc('adv_set_setting', { p_token: ME.token, p_key: kind, p_value: val }); } catch (e) {} }
  async function cloudGetSettings() { if (!cloudReady()) return null; try { const { data } = await sb.rpc('adv_get_settings'); return data; } catch (e) { return null; } }
  let _cloudSaveAt = 0;
  async function cloudSavePlayer() { if (!cloudReady()) return; if (Date.now() - _cloudSaveAt < 4000) return; _cloudSaveAt = Date.now(); try { await sb.rpc('adv_save_player', { p_token: ME.token, p_state: serialize() }); } catch (e) {} }
  async function cloudLoadPlayer() { if (!cloudReady()) return null; try { const { data } = await sb.rpc('adv_load_player', { p_token: ME.token }); return data; } catch (e) { return null; } }

  /* ============================ 멀티(브로드캐스트) ============================ */
  let netCh = null, netSendFn = null, _posT = 0;
  function netStart() {
    if (typeof sb === 'undefined' || !sb || !cfg.cloud) return;
    try {
      const ch = sb.channel('adventure-world', { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'a' }, (p) => onNet(p.payload));
      ch.subscribe();
      netCh = ch; netSendFn = (payload) => { try { ch.send({ type: 'broadcast', event: 'a', payload }); } catch (e) {} };
    } catch (e) {}
  }
  function netSend(m) { if (netSendFn) { m.id = (ME && ME.id) || 'me'; netSendFn(m); } }
  function onNet(m) {
    if (!m || m.id === ((ME && ME.id) || 'me')) return;
    if (m.t === 'b') { edits.set(ikey(m.x, m.y), m.k); }
    else if (m.t === 'p') { others[m.id] = { x: m.x, y: m.y, face: m.face, name: m.name, hp: m.hp, t: Date.now() }; }
    else if (m.t === 'leave') { delete others[m.id]; }
  }
  function netTick(dt) {
    _posT += dt; if (_posT > 0.1 && netSendFn) { _posT = 0; netSend({ t: 'p', x: P.x, y: P.y, face: P.face, name: P.name, hp: P.hp }); }
    const now = Date.now(); for (const id in others) if (now - others[id].t > 3000) delete others[id];
  }
  function netStop() { if (netSendFn) netSend({ t: 'leave' }); if (netCh && typeof leaveChannel === 'function') leaveChannel(netCh); netCh = null; netSendFn = null; others = {}; }

  /* ============================ 루프 ============================ */
  function loop(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    try {
      if (!lastT) lastT = ts; let dt = (ts - lastT) / 1000; lastT = ts; if (dt > 0.1) dt = 0.1;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) { stepPhysics(STEP); acc -= STEP; steps++; }
      world.time += dt;
      updateMining(dt); updateDrops(dt); updateMobs(dt); netTick(dt);
      updatePickup(dt);
      render(); drawJoy();
      // HUD 갱신(저빈도)
      _hudT = (_hudT || 0) + dt; if (_hudT > 0.25) { _hudT = 0; updateHUD(); }
      saveT += dt; if (saveT > 8 && dirty) { saveT = 0; saveNow(); }
    } catch (e) { console.error('adv loop', e); }
  }
  let _hudT = 0;
  function stepPhysics(dt) { updatePlayer(dt); for (const p of particles) {} }

  /* ============================ 시작/종료 ============================ */
  function start() {
    setScreen('adventure');
    app().innerHTML = screenHTML();
    canvas = document.getElementById('advCanvas'); ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { app().innerHTML = '<div class="screen center"><p>이 기기는 캔버스를 지원하지 않아요.</p><button class="btn btn--primary" data-act="adv_exit">홈으로</button></div>'; return; }
    P.name = (typeof ME !== 'undefined' && ME && ME.real_name) ? ME.real_name : 'Player';
    resize(); window.addEventListener('resize', resize);
    bindInput();
    running = true; started = true; lastT = 0; acc = 0;
    // 로드: 클라우드 우선, 없으면 로컬, 없으면 신규
    (async () => {
      let data = null;
      if (cfg.cloud) { const cs = await cloudGetSettings(); if (cs) applyCloudSettings(cs); data = await cloudLoadPlayer(); }
      if (!data) data = loadLocal();
      if (!data || !loadSave(data)) { newWorld(); }
      refreshHotbar(); updateHUD();
      netStart();
    })();
    rafId = requestAnimationFrame(loop);
  }
  function applyCloudSettings(cs) {
    try { if (cs.cfg) cfg = Object.assign(cfg, cs.cfg); if (cs.pw != null) localStorage.setItem(PW_KEY, cs.pw); } catch (e) {}
  }
  function newWorld() {
    seed = WORLD_SEED; surfCache.clear(); edits = new Map(); chestStore = new Map();   // 공유 맵(고정 시드)
    inv = new Array(36).fill(null);
    // 시작 지급(편의)
    inv[0] = { k: 'wood_pickaxe', n: 1 }; inv[1] = { k: 'wood_axe', n: 1 }; inv[2] = { k: 'oak_planks', n: 16 }; inv[3] = { k: 'torch', n: 8 }; inv[4] = { k: 'bread', n: 3 };
    P.x = 5000.5; P.y = surfaceY(5000) - 0.1; P.vx = P.vy = 0; P.hp = cfg.startHp; P.hunger = 20; P.sat = 5; P.xp = 0; P.lvl = 0;
    world.time = cfg.dayLen * 0.18;   // 환한 아침에 시작
  }
  function stop() {
    if (!running && !canvas) return;   // 이미 정지(중복 호출 안전)
    running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    window.removeEventListener('resize', resize);
    unbindInput();
    if (started) { try { saveNow(); } catch (e) {} }
    netStop();
    canvas = null; ctx = null;
  }

  /* ============================ 액션 위임 ============================ */
  function act(a, el) {
    switch (a) {
      case 'adv_exit': stop(); if (typeof goHome === 'function') goHome(); return true;
      case 'adv_inv': openInventory(); return true;
      case 'adv_hot': hotbar = Number(el.dataset.i); refreshHotbar(); return true;
      case 'adv_islot': invSlotTap(Number(el.dataset.i)); return true;
      case 'adv_craft': doCraft(Number(el.dataset.i), el.dataset.t === '1'); return true;
      case 'adv_craft2': openCrafting(false); return true;
      case 'adv_smelt': doSmelt(el.dataset.k); return true;
      case 'adv_chest_take': chestTake(Number(el.dataset.i)); return true;
      case 'adv_chest_put': chestPut(Number(el.dataset.i)); return true;
      case 'adv_jumpdown': jumpQueued = true; return true;
    }
    return false;
  }

  // 점프 버튼 hold 처리(브롤식: 누르고 있는 동안 점프 유지는 아니지만 길게 눌러 연속점프)
  document.addEventListener('pointerdown', e => { const t = e.target.closest && e.target.closest('#advJump'); if (t) { jumpHeld = true; jumpQueued = true; } });
  document.addEventListener('pointerup', () => { jumpHeld = false; });

  /* ============================ 비밀번호 게이트 ============================ */
  function passwordScreen() {
    // 클라우드 설정 동기(비번 변경 반영)
    (async () => { if (cfg.cloud) { const cs = await cloudGetSettings(); if (cs) applyCloudSettings(cs); if (!getPasswordEnabled()) { enterAdventure(); } } })();
    if (!getPasswordEnabled()) { enterAdventure(); return; }
    setScreen('rank');
    app().innerHTML = `
      <section class="screen">
        <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🗺️ 모험</b><span class="spacer"></span></header>
        <div class="grow center" style="justify-content:center">
          <div class="auth" style="max-width:340px">
            <div class="auth__logo">🗺️ 모험 월드<small>비밀번호를 입력하면 누구나 입장</small></div>
            <input class="input" id="adv_pw_in" type="password" placeholder="비밀번호" autocomplete="off" />
            <div class="auth__err" id="adv_pw_err"></div>
            <button class="btn btn--primary btn--lg" data-act="adv_enter">입장</button>
          </div>
        </div>
      </section>`;
  }
  function getPasswordEnabled() { return cfg.pwEnabled !== false; }
  function tryEnter() {
    const v = (document.getElementById('adv_pw_in') || {}).value || '';
    if (!getPasswordEnabled() || v === getPassword()) { enterAdventure(); }
    else { const e = document.getElementById('adv_pw_err'); if (e) e.textContent = '비밀번호가 틀렸어요.'; }
  }
  function enterAdventure() { start(); }

  /* ============================ 개발자 모드 패널 ============================ */
  function devPaneHTML() {
    const c = cfg;
    const row = (label, key, min, max, step) => `<div class="dev-row"><span class="dev-lab">${label}</span><input class="input" type="number" id="advc_${key}" value="${c[key]}" min="${min}" max="${max}" step="${step || 1}"></div>`;
    const chk = (label, key) => `<label class="dev-row" style="cursor:pointer"><span class="dev-lab">${label}</span><input type="checkbox" id="advc_${key}" ${c[key] ? 'checked' : ''} style="width:22px;height:22px"></label>`;
    return `
      <p class="muted">모험 탭 설정. 변경 후 <b>저장</b>을 누르면 (클라우드 사용 시) 모든 기기에 반영돼요.</p>
      <div class="dev-row"><span class="dev-lab">비밀번호</span><input class="input" id="advc_pw" value="${esc(getPassword())}"></div>
      ${chk('비밀번호 사용', 'pwEnabled')}
      ${chk('인벤/진행 자동저장', 'invSave')}
      ${chk('클라우드 동기·멀티', 'cloud')}
      ${chk('사망 시 인벤 유지', 'keepInvOnDeath')}
      ${row('채굴시간 배수(↓빠름)', 'breakMul', 0.05, 10, 0.05)}
      ${row('드롭률 배수', 'dropMul', 0.1, 10, 0.1)}
      ${row('몹 체력 배수', 'mobHpMul', 0.1, 10, 0.1)}
      ${row('몹 데미지 배수', 'mobDmgMul', 0, 10, 0.1)}
      ${row('허기 소모 배수', 'hungerMul', 0, 10, 0.1)}
      ${row('몹 스폰 배수', 'spawnMul', 0, 10, 0.1)}
      ${row('하루 길이(초)', 'dayLen', 60, 3600, 10)}
      ${row('시작 체력', 'startHp', 1, 20, 1)}
      <div class="dev-row" style="gap:8px;margin-top:8px">
        <button class="btn btn--primary btn--lg" data-act="adv_devsave">설정 저장</button>
        <button class="btn btn--ghost btn--lg" data-act="adv_devreset">월드 초기화</button>
      </div>
      <p class="muted" style="font-size:12px">월드 초기화: 내 진행/월드 편집을 지우고 새 월드를 만듭니다(점수와 무관).</p>`;
  }
  function devSave() {
    const num = (k) => { const el = document.getElementById('advc_' + k); if (el) cfg[k] = Number(el.value); };
    const bool = (k) => { const el = document.getElementById('advc_' + k); if (el) cfg[k] = !!el.checked; };
    ['breakMul', 'dropMul', 'mobHpMul', 'mobDmgMul', 'hungerMul', 'spawnMul', 'dayLen', 'startHp'].forEach(num);
    ['pwEnabled', 'invSave', 'cloud', 'keepInvOnDeath'].forEach(bool);
    const pw = document.getElementById('advc_pw'); if (pw && pw.value) setPassword(pw.value);
    saveCfg();
    if (typeof toast === 'function') toast('모험 설정 저장됨', true);
  }
  function devResetWorld() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    edits = new Map(); chestStore = new Map(); surfCache.clear();
    if (cloudReady()) { try { sb.rpc('adv_reset_player', { p_token: ME.token }); } catch (e) {} }
    if (typeof toast === 'function') toast('모험 월드 초기화됨', true);
  }
  function devAct(a, el) {
    switch (a) {
      case 'adv_devsave': devSave(); return true;
      case 'adv_devreset': devResetWorld(); return true;
    }
    return false;
  }

  /* ============================ 공개 API ============================ */
  window.adventureOpen = passwordScreen;       // 홈 카드 → 비밀번호 게이트
  window.adventureStop = stop;
  window.adventureAct = function (a, el) {
    if (a === 'adv_enter') { tryEnter(); return true; }
    if (a.indexOf('adv_dev') === 0) return devAct(a, el);
    if (a.indexOf('adv_') === 0) return act(a, el);
    return false;
  };
  window.adventureDevPaneHTML = devPaneHTML;
  window.adventureIsRunning = function () { return running; };

  // 테스트 전용 훅(브라우저 미사용; window.__ADV_TEST 일 때만 노출)
  if (typeof window !== 'undefined' && window.__ADV_TEST) {
    window.__adv = { procBlock, getBlock, setBlock, surfaceY, biomeAt, breakTime, mineTile, addItem, countItem, removeItem, recipeAvailable, doCraft, buildLight, lightAt, makeTile, itemIcon, newWorld, serialize, loadSave, spawnDrop, updateDrops, P, getInv: () => inv };
  }
})();
