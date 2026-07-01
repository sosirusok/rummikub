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

  const CHUNK = 16, WORLD_H = 96, SEA = 44, RENDER = 3;   // 렌더 반경(청크) — 저사양 성능(3=49청크, 폴더폰 타깃)
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
    { key: 'oak_leaves', tex: 'leaves' },
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
    { key: 'birch_log', tex: { top: 'log_top', side: 'birch_side', bottom: 'log_top' } },
    { key: 'birch_leaves', tex: 'leaves' },
    { key: 'cactus', tex: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' } },
    { key: 'tall_grass', tex: 'tall_grass', opaque: false, solid: false, cross: true },
    { key: 'flower_red', tex: 'flower_red', opaque: false, solid: false, cross: true },
    { key: 'flower_yellow', tex: 'flower_yellow', opaque: false, solid: false, cross: true },
    { key: 'sugar_cane', tex: 'sugar_cane', opaque: false, solid: false, cross: true },
    { key: 'birch_planks', tex: 'birch_planks' },
    { key: 'lapis_ore', tex: 'lapis_ore' },
    { key: 'emerald_ore', tex: 'emerald_ore' },
    { key: 'iron_block', tex: 'iron_block' },
    { key: 'gold_block', tex: 'gold_block' },
    { key: 'diamond_block', tex: 'diamond_block' },
    { key: 'coal_block', tex: 'coal_block' },
    { key: 'redstone_block', tex: 'redstone_block' },
    { key: 'lapis_block', tex: 'lapis_block' },
    { key: 'emerald_block', tex: 'emerald_block' },
    { key: 'pumpkin', tex: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' } },
    { key: 'farmland', tex: { top: 'farmland_top', side: 'dirt', bottom: 'dirt' } },
    { key: 'wheat_crop', tex: 'wheat_young', opaque: false, solid: false, cross: true },
    { key: 'wheat_ripe', tex: 'wheat_mature', opaque: false, solid: false, cross: true },
    { key: 'carrot_crop', tex: 'carrot_young', opaque: false, solid: false, cross: true },
    { key: 'carrot_ripe', tex: 'carrot_mature', opaque: false, solid: false, cross: true },
    { key: 'potato_crop', tex: 'potato_young', opaque: false, solid: false, cross: true },
    { key: 'potato_ripe', tex: 'potato_mature', opaque: false, solid: false, cross: true },
    { key: 'sapling', tex: 'sapling_tex', opaque: false, solid: false, cross: true },
    { key: 'granite', tex: 'granite' },
    { key: 'andesite', tex: 'andesite' },
    { key: 'diorite', tex: 'diorite' },
    { key: 'mossy_cobblestone', tex: 'mossy_cobble' },
    { key: 'clay', tex: 'clay_block' },
    { key: 'ice', tex: 'ice', opaque: false },
    { key: 'wool', tex: 'wool' },
    { key: 'bookshelf', tex: { top: 'planks', side: 'bookshelf', bottom: 'planks' } },
    { key: 'torch', tex: 'torch', opaque: false, solid: false, cross: true, light: true },
    { key: 'lava', tex: 'lava', solid: false, opaque: false, liquid: 'lava', light: true },
    { key: 'ladder', tex: 'ladder', opaque: false, solid: false, cross: true },
    { key: 'tnt', tex: 'tnt' },
    { key: 'bed', tex: 'wool', opaque: false, solid: false },
  ];
  const ID = {}, BYID = BLOCKS;
  BLOCKS.forEach((b, i) => { b.id = i; ID[b.key] = i; if (b.solid === undefined) b.solid = true; if (b.opaque === undefined) b.opaque = true; });
  function bprop(key) { return (window.ADV_BLOCKS && window.ADV_BLOCKS[key]) || null; }   // 경도/도구/드롭

  /* ---------------- 상태 ---------------- */
  let running = false, loaded = false, renderer = null, scene = null, camera = null, raf = 0, contextLost = false;
  let canvas = null, atlasTex = null, atlasUV = {};
  const chunks = new Map();             // "cx,cz" -> {blocks:Uint8Array, mesh, waterMesh, dirty}
  const overlay = new Map();            // "x,y,z" -> id (사용자 편집, 영속)
  let pendingServer = new Map();
  const others = {};                    // 멀티 플레이어 아바타
  let netCh = null, netSend = null;

  const P = { x: 0.5, y: 70, z: 0.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false,
    w: 0.6, h: 1.8, eye: 1.62, hp: 20, hunger: 20, sat: 5, exh: 0, airT: 0, hurtT: 0, attackT: 0,
    fallStart: null, name: 'Player', flying: false };
  let inv = new Array(36).fill(null);   // {k,n}
  let hotbar = 0;
  let armorEq = { head: null, chest: null, legs: null, feet: null, off: null };   // 장착(투구/갑옷/바지/부츠/보조손)
  let world = { time: 0 };
  let cfg = loadCfg();

  const keys = {};
  const look = { active: false, id: -1, lx: 0, ly: 0 };
  const move = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  let breakState = { key: '', t: 0 };

  // 낮/밤 각 600초(총 1200초=20분, 마크와 동일). dayLen=전체 주기.
  function loadCfg() { try { const c = Object.assign({ breakMul: 1, dropMul: 1, dayLen: 1200, cloud: true, startHp: 20, keepInvOnDeath: false }, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); if (!c.dayLen || c.dayLen < 1200) c.dayLen = 1200; return c; } catch (e) { return { breakMul: 1, dropMul: 1, dayLen: 1200, cloud: true }; } }

  /* ---------------- 노이즈/지형 ---------------- */
  let seed = WORLD_SEED;
  function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function h2(x, z) { return hash3(x, 0, z); }
  function vnoise(x, z, f) { const xf = x * f, zf = z * f; const x0 = Math.floor(xf), z0 = Math.floor(zf), tx = xf - x0, tz = zf - z0; const a = h2(x0, z0), b = h2(x0 + 1, z0), c = h2(x0, z0 + 1), d = h2(x0 + 1, z0 + 1); const ux = tx * tx * (3 - 2 * tx), uz = tz * tz * (3 - 2 * tz); return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz; }
  // 프랙탈 노이즈(여러 옥타브 합) → 자연스러운 기복. 반환 -0.5..0.5
  function fbm(x, z, f, oct) { let a = 0, amp = 1, fr = f, tot = 0; for (let i = 0; i < oct; i++) { a += (vnoise(x + i * 211, z - i * 173, fr) - 0.5) * amp; tot += amp; amp *= 0.5; fr *= 2; } return a / tot; }
  // 3D 값 노이즈(트라이리니어) → 진짜 3D 동굴(평면 반복 패턴 없음)
  function vnoise3(x, y, z, f) {
    const xf = x * f, yf = y * f, zf = z * f; const x0 = Math.floor(xf), y0 = Math.floor(yf), z0 = Math.floor(zf);
    const tx = xf - x0, ty = yf - y0, tz = zf - z0; const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
    const c000 = hash3(x0, y0, z0), c100 = hash3(x0 + 1, y0, z0), c010 = hash3(x0, y0 + 1, z0), c110 = hash3(x0 + 1, y0 + 1, z0);
    const c001 = hash3(x0, y0, z0 + 1), c101 = hash3(x0 + 1, y0, z0 + 1), c011 = hash3(x0, y0 + 1, z0 + 1), c111 = hash3(x0 + 1, y0 + 1, z0 + 1);
    const a00 = c000 + (c100 - c000) * ux, a10 = c010 + (c110 - c010) * ux, a01 = c001 + (c101 - c001) * ux, a11 = c011 + (c111 - c011) * ux;
    const b0 = a00 + (a10 - a00) * uy, b1 = a01 + (a11 - a01) * uy; return b0 + (b1 - b0) * uz;
  }
  // 마크식 2축(온도·습도) 바이옴 — 큰 지역 단위로 또렷하게 구분(설원/사막/사바나/숲/평원)
  const biomeCache = new Map();
  function biome(x, z) {
    const k = x + ',' + z; const c = biomeCache.get(k); if (c !== undefined) return c;
    const t = vnoise(x + 8000, z - 8000, 0.0046);          // 온도 0..1 (파장 ~220 → 이동 중 여러 바이옴 통과)
    const h = vnoise(x - 6000, z + 6000, 0.0052);          // 습도 0..1 (파장 ~190)
    let b;
    if (t < 0.27) b = 'snow';                              // 추움 → 설원(자작/눈)
    else if (t > 0.70) b = h < 0.40 ? 'desert' : 'savanna';// 더움: 건조=사막 / 보통=사바나
    else if (h > 0.62) b = 'forest';                       // 온화+습함 → 숲(빽빽)
    else b = 'plains';                                     // 그 외 → 평원
    biomeCache.set(k, b); if (biomeCache.size > 80000) biomeCache.clear();
    return b;
  }
  const surfCache = new Map();
  function surfaceH(x, z) {
    const ck = x + ',' + z; if (surfCache.has(ck)) return surfCache.get(ck);
    // 마크식 3-맵 합성: 대륙성(저주파 대지/바다) + 기복도(평지↔산) + 다옥타브 구릉.
    const cont = fbm(x, z, 0.0035, 3);                       // 대륙성 -0.5..0.5 (파장 ~285, 시야 내 가끔 해안)
    let relief = vnoise(x + 5000, z + 5000, 0.004);          // 기복도 0..1 (파장 ~250)
    relief = relief * relief * (2 - relief);                 // smoothstep풍 → 대부분 평지, 가끔 험지
    const hills = fbm(x + 1234, z - 4321, 0.021, 4);         // 주 구릉 -0.5..0.5 (파장 ~48, 시야 내 2-3개)
    const detail = (vnoise(x - 99, z + 99, 0.09) - 0.5);    // 미세 기복(파장 ~11)
    // 평지: ±6블록 완만 / 언덕: ±20 / 산악: ±34. 대륙성으로 해안·바다 형성.
    let h = SEA + 6 + cont * 28 + hills * (11 + relief * 56) + detail * 1.8;
    const sy = Math.max(6, Math.min(WORLD_H - 18, Math.round(h)));
    surfCache.set(ck, sy); if (surfCache.size > 60000) surfCache.clear();
    return sy;
  }
  const treeCache = new Map();
  // 나무 배치: 순수 셀당 확률(과거 방식)은 캐노피(반경2)가 서로 겹치는 밀집 클러스터를
  // 만들어 '초록 벽'처럼 보이는 버그를 냄. 격자(지터드 그리드)로 후보 위치를 셀당 1곳만
  // 두어 나무 사이 최소 간격을 보장(실제 마크 트리 피처 배치와 동일한 접근).
  const TREE_CELL = 6, TREE_MARGIN = 1;   // 셀 안쪽으로만 지터링 → 이웃 셀 나무와 최소 간격 보장(캐노피 겹침 방지)
  function isTreeAt(x, z) {
    const k = x + ',' + z; const cv = treeCache.get(k); if (cv !== undefined) return cv;
    let res = false;
    const cx = Math.floor(x / TREE_CELL), cz = Math.floor(z / TREE_CELL);
    const span = TREE_CELL - TREE_MARGIN * 2;
    const jx = cx * TREE_CELL + TREE_MARGIN + (hash3(cx * 13 + 7, 0, cz * 13 + 3) * span | 0);
    const jz = cz * TREE_CELL + TREE_MARGIN + (hash3(cx * 17 + 11, 1, cz * 17 + 5) * span | 0);
    if (x === jx && z === jz) {   // 이 셀의 유일한 후보 좌표일 때만 검사(셀당 나무 최대 1그루)
      const b = biome(x, z);
      if (b !== 'desert') {
        const p = b === 'forest' ? 0.55 : b === 'savanna' ? 0.10 : b === 'snow' ? 0.20 : 0.16;   // 셀당 확률(간격은 격자가 보장)
        if (h2(x * 7 + 1, z * 13 + 3) < p) {
          const sy = surfaceH(x, z);
          if (sy > SEA + 1) {   // 물·해변엔 나무 X + 주변 완만할 때만(절벽 나무 방지)
            const e = Math.abs(surfaceH(x + 1, z) - sy) + Math.abs(surfaceH(x - 1, z) - sy) + Math.abs(surfaceH(x, z + 1) - sy) + Math.abs(surfaceH(x, z - 1) - sy);
            res = e <= 3;
          }
        }
      }
    }
    treeCache.set(k, res); if (treeCache.size > 80000) treeCache.clear();
    return res;
  }
  // 바이옴별 잔디/잎 색조(마크의 biome coloring) — 또렷하게 구분
  function biomeTint(x, z) {
    const b = biome(x, z);
    if (b === 'desert') return [0.74, 0.71, 0.33];     // 마른 황록
    if (b === 'savanna') return [0.76, 0.70, 0.36];    // 사바나 올리브
    if (b === 'snow') return [0.51, 0.72, 0.60];       // 차가운 청록
    if (b === 'forest') return [0.33, 0.69, 0.29];     // 진한 숲 초록
    const n = vnoise(x + 50, z + 50, 0.02);
    return [0.42 + n * 0.16, 0.75 - n * 0.05, 0.34 + n * 0.10];   // 평원 밝은 초록
  }
  function genBlock(x, y, z) {
    if (y <= 0) return ID.bedrock;
    if (y <= 2 && hash3(x, y, z) < 0.5) return ID.bedrock;
    const sy = surfaceH(x, z), b = biome(x, z);
    if (y > sy) {
      if (y <= SEA) { if (b === 'snow' && y === SEA) return ID.ice; return ID.water; }   // 설원 수면 = 얼음
      // 나무
      const t = treeBlock(x, y, z); if (t) return t;
      // 식물(지표 위)
      if (sy > SEA) {
        if (b === 'desert') {                                          // 선인장(1~2칸)
          if (h2(x * 3 + 2, z * 3 + 5) < 0.018) { const ch = 1 + (hash3(x, 7, z) < 0.5 ? 1 : 0); if (y >= sy + 1 && y <= sy + ch) return ID.cactus; }
        } else if (y === sy + 1) {
          // 사탕수수(물가 1칸 옆, 2~3칸)
          const nearWater = surfaceH(x + 1, z) <= SEA || surfaceH(x - 1, z) <= SEA || surfaceH(x, z + 1) <= SEA || surfaceH(x, z - 1) <= SEA;
          const pv = hash3(x * 5 + 7, 0, z * 5 + 13);
          if (b !== 'snow' && nearWater && sy <= SEA + 2 && hash3(x * 9 + 1, 0, z * 9 + 4) < 0.28) return ID.sugar_cane;
          if (b === 'snow') { if (pv < 0.04) return ID.tall_grass; }
          else {
            if ((b === 'forest' || b === 'plains' || b === 'savanna') && hash3(x * 13 + 3, 0, z * 13 + 9) < 0.004) return ID.pumpkin;   // 호박 덩굴(드묾)
            const dense = (b === 'forest') ? 0.20 : 0.13; if (pv < dense) return ID.tall_grass; else if (pv < dense + 0.018) return ID.flower_red; else if (pv < dense + 0.034) return ID.flower_yellow;
          }
        } else if (b !== 'snow' && b !== 'desert' && y === sy + 2) {
          // 사탕수수 2~3번째 칸
          const nearWater = surfaceH(x + 1, z) <= SEA || surfaceH(x - 1, z) <= SEA || surfaceH(x, z + 1) <= SEA || surfaceH(x, z - 1) <= SEA;
          if (nearWater && sy <= SEA + 2 && hash3(x * 9 + 1, 0, z * 9 + 4) < 0.28) { if (hash3(x, 3, z) < 0.6) return ID.sugar_cane; }
        }
      }
      return ID.air;
    }
    if (y === sy) {
      if (sy <= SEA) { if (sy >= SEA - 3 && hash3(x * 7 + 3, 0, z * 7 + 11) < 0.05) return ID.clay; return ID.sand; }   // 해수면 이하(수중 바닥·해변) = 모래(얕은 곳 일부 점토)
      if (b === 'desert') return ID.sand;             // 사막 = 모래
      if (b === 'snow') return ID.snow_block;         // 설원 = 눈
      return ID.grass;                                // 육지 = 잔디
    }
    const depth = sy - y;
    if (depth <= 3) return (b === 'desert' || sy <= SEA + 1) ? (b === 'desert' ? ID.sandstone : ID.sand) : ID.dirt;
    // 동굴
    if (caveCarve(x, y, z)) { if (y <= 9 && vnoise3(x + 3000, y, z + 3000, 0.05) > 0.62) return ID.lava; return ID.air; }   // 깊은 곳 용암 웅덩이
    // 광물 — 2×2×2 셀 해시로 미니 광맥(마크식 y분포). 깊을수록 귀한 광물.
    const r = hash3((x >> 1) * 3 + 1, (y >> 1) * 5 + 2, (z >> 1) * 7 + 3);
    if (r < 0.014) return ID.coal_ore;                                   // 석탄: 어디서나 흔함
    if (r < 0.024 && y < 46) return ID.iron_ore;                         // 철: 지하 흔함
    if (r < 0.030 && y >= 6 && y < 28) return ID.lapis_ore;              // 청금석: 중간 깊이
    if (r < 0.036 && y < 22) return ID.gold_ore;                         // 금: 깊음
    if (r < 0.041 && y < 15) return ID.redstone_ore;                     // 레드스톤: 매우 깊음
    if (r < 0.045 && y < 14) return ID.diamond_ore;                      // 다이아: 최심부, 드묾
    if (r < 0.030 && y >= 30 && surfaceH(x, z) > 64) return ID.emerald_ore;   // 에메랄드: 산악에만
    // 화강암/안산암/섬록암 — 4×4×4 셀 뭉치(마크식 반점 분포)
    const sv = hash3((x >> 2) * 11 + 3, (y >> 2) * 7 + 5, (z >> 2) * 13 + 9);
    if (sv < 0.10) { const which = hash3((x >> 2) * 17 + 1, (y >> 2) * 19 + 2, (z >> 2) * 23 + 3); return which < 0.34 ? ID.granite : which < 0.67 ? ID.andesite : ID.diorite; }
    if (y < 20 && sv > 0.97) return ID.mossy_cobblestone;   // 깊은 축축한 동굴 근처 희귀 이끼 조약돌
    return ID.stone;
  }
  function caveCarve(x, y, z) {
    if (y < 4 || y > 58) return false;
    // 스파게티 동굴: 두 3D 노이즈가 동시에 0 부근 → 가늘게 굽이치는 터널(반복 패턴 없음)
    const n1 = vnoise3(x, y, z, 0.045), n2 = vnoise3(x + 421, y + 13, z + 977, 0.045);
    const band = 0.066 + (y < 30 ? 0.02 : 0);          // 깊을수록 살짝 넓게
    if (Math.abs(n1 - 0.5) < band && Math.abs(n2 - 0.5) < band) return true;
    // 치즈 동굴: 깊은 곳 넓은 공동
    if (y < 40 && vnoise3(x, y * 1.4, z, 0.03) > 0.82) return true;
    return false;
  }
  function treeBlock(x, y, z) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ox = x - dx, oz = z - dz; if (!isTreeAt(ox, oz)) continue;
      const sy = surfaceH(ox, oz); if (sy < SEA) continue;
      const th = 4 + Math.floor(h2(ox, oz) * 3);
      const top = sy + th;
      const birch = biome(ox, oz) === 'snow' || h2(ox * 11 + 5, oz * 11 + 7) < 0.22;   // 설원/일부 = 자작나무
      if (dx === 0 && dz === 0 && y > sy && y <= top - 1) return birch ? ID.birch_log : ID.oak_log;   // 줄기
      const ly = y - (top - 1);
      if (Math.abs(dx) + Math.abs(dz) <= 3 && ly >= -1 && ly <= 1) {                 // 잎
        if (!(dx === 0 && dz === 0 && y <= top - 1)) { if (hash3(x, y, z) < 0.85) return birch ? ID.birch_leaves : ID.oak_leaves; }
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
    const ppos = [], pcol = [], puv = [], pidx = [];
    const lpos = [], lcol = [], luv = [], lidx = [];
    let vi = 0, wvi = 0, pvi = 0, lvi = 0;
    // 패딩 불투명 마스크(청크+1칸 경계). 면 컬링/AO를 Map조회 대신 배열조회로 → 메싱 대폭 가속.
    const MW = CHUNK + 2, baseX = c.cx * CHUNK - 1, baseZ = c.cz * CHUNK - 1;
    const omask = _omask || (_omask = new Uint8Array(MW * MW * WORLD_H)); omask.fill(0);   // 재사용(매 빌드 31KB 할당 → GC 부담 제거)
    for (let mz = 0; mz < MW; mz++) for (let mx = 0; mx < MW; mx++) {
      const inside = (mx >= 1 && mx <= CHUNK && mz >= 1 && mz <= CHUNK);
      for (let y = 0; y < WORLD_H; y++) { const id2 = inside ? c.blocks[idx(mx - 1, y, mz - 1)] : getBlock(baseX + mx, y, baseZ + mz); if (id2 && BYID[id2] && BYID[id2].opaque) omask[(y * MW + mz) * MW + mx] = 1; }
    }
    function mOpaque(wx, y, wz) { if (y < 0 || y >= WORLD_H) return 0; const mx = wx - baseX, mz = wz - baseZ; if (mx < 0 || mx >= MW || mz < 0 || mz >= MW) return blockOpaque(getBlock(wx, y, wz)) ? 1 : 0; return omask[(y * MW + mz) * MW + mx]; }
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) for (let y = 0; y < WORLD_H; y++) {
      const id = c.blocks[idx(lx, y, lz)]; if (id === 0) continue;
      const b = BYID[id]; const wx = c.cx * CHUNK + lx, wz = c.cz * CHUNK + lz;
      const liq = b.liquid;   // undefined(고체) | true(물) | 'lava'(용암)
      if (b.cross) {   // 십자(X) 스프라이트 식물 — 대각 2장
        const tn = faceTexName(b, 'side'); const u = atlasUV[tn] || atlasUV.stone;
        const uvco = [[u.x0, u.y1], [u.x1, u.y1], [u.x1, u.y0], [u.x0, u.y0]];
        let tr = 1, tg = 1, tb = 1;
        if (b.key === 'tall_grass') { const tt = biomeTint(wx, wz); tr = tt[0]; tg = tt[1]; tb = tt[2]; }
        const diags = [[[wx, wz], [wx + 1, wz + 1]], [[wx + 1, wz], [wx, wz + 1]]];
        for (const dg of diags) {
          const a0 = dg[0], a1 = dg[1];
          const vtx = [[a0[0], y, a0[1]], [a1[0], y, a1[1]], [a1[0], y + 1, a1[1]], [a0[0], y + 1, a0[1]]];
          for (let k = 0; k < 4; k++) { ppos.push(vtx[k][0], vtx[k][1], vtx[k][2]); pcol.push(tr, tg, tb); puv.push(uvco[k][0], uvco[k][1]); }
          pidx.push(pvi, pvi + 1, pvi + 2, pvi, pvi + 2, pvi + 3); pvi += 4;
        }
        continue;
      }
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi]; const nx = wx + f.dir[0], ny = y + f.dir[1], nz = wz + f.dir[2];
        if (mOpaque(nx, ny, nz)) continue;                       // 빠른 컬링(버려진 면은 getBlock 없이 스킵)
        const nid = getBlock(nx, ny, nz); const nb = BYID[nid] || BLOCKS[0];   // 노출된 면만 실제 조회
        if (liq && nid === id) continue;
        if (!liq && nb.liquid && f.dir[1] !== 1) { /* 액체에 접한 고체 면은 그림 */ }
        const tn = faceTexName(b, f.n); const u = atlasUV[tn] || atlasUV.stone;
        const target = liq === 'lava' ? { pos: lpos, col: lcol, uv: luv, idx: lidx } : liq ? { pos: wpos, col: wcol, uv: wuv, idx: widx } : { pos, col, uv, idx: idxArr };
        const base = liq === 'lava' ? lvi : liq ? wvi : vi;
        const sh = f.shade;
        const uvco = [[u.x0, u.y1], [u.x0, u.y0], [u.x1, u.y0], [u.x1, u.y1]];
        const axA = f.ax[0], axB = f.ax[1];   // 면내 두 축(법선 외). 'b'(블록)와 셰도잉 금지!
        const bx = wx + f.dir[0], by = y + f.dir[1], bz = wz + f.dir[2];   // 면 바깥(공기) 칸
        // 바이옴 색조: 잔디 윗면 / 잎 전체
        let tr = 1, tg = 1, tb = 1;
        if ((b.key === 'grass' && f.n === 'top') || b.key === 'oak_leaves' || b.key === 'birch_leaves') { const tt = biomeTint(wx, wz); tr = tt[0]; tg = tt[1]; tb = tt[2]; }
        for (let k = 0; k < 4; k++) {
          const cc = f.corners[k];
          // 코너 음영(AO): 면내 두 인접 + 대각
          const sa = cc[axA] ? 1 : -1, sb = cc[axB] ? 1 : -1;
          const o1 = [0, 0, 0], o2 = [0, 0, 0], od = [0, 0, 0]; o1[axA] = sa; o2[axB] = sb; od[axA] = sa; od[axB] = sb;
          const s1 = mOpaque(bx + o1[0], by + o1[1], bz + o1[2]);
          const s2 = mOpaque(bx + o2[0], by + o2[1], bz + o2[2]);
          const sd = mOpaque(bx + od[0], by + od[1], bz + od[2]);
          const aol = (s1 && s2) ? 0 : (3 - (s1 + s2 + sd));
          const v = sh * AO_MUL[aol];
          target.pos.push(wx + cc[0], y + cc[1] - (liq && f.n === 'top' ? 0.12 : 0), wz + cc[2]);
          target.col.push(v * tr, v * tg, v * tb);
          target.uv.push(uvco[k][0], uvco[k][1]);
        }
        target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        if (liq === 'lava') lvi += 4; else if (liq) wvi += 4; else vi += 4;
      }
    }
    disposeMesh(c.mesh); disposeMesh(c.waterMesh); disposeMesh(c.plantMesh); disposeMesh(c.lavaMesh); c.mesh = null; c.waterMesh = null; c.plantMesh = null; c.lavaMesh = null;
    if (pos.length) c.mesh = makeMesh(pos, col, uv, idxArr, blockMat);
    if (wpos.length) c.waterMesh = makeMesh(wpos, wcol, wuv, widx, waterMat);
    if (ppos.length) c.plantMesh = makeMesh(ppos, pcol, puv, pidx, plantMat);
    if (lpos.length) c.lavaMesh = makeMesh(lpos, lcol, luv, lidx, lavaMat);
    c.dirty = false;
  }
  function makeMesh(pos, col, uv, idxArr, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idxArr);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = true; scene.add(m); return m;
  }
  function disposeMesh(m) { if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); } }
  let blockMat = null, waterMat = null, plantMat = null, lavaMat = null, _omask = null;

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
  let skyDome = null, sunMesh = null;   // (CSS 하늘로 대체 — WebGL 돔 미사용)
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
  // 정밀(16×16) 원본 패턴 생성 — 아래 drawTex()가 이걸 2×2 평균으로 8×8 실효해상도로 낮춤
  function drawTexFine(c, ox, oy, name) {
    const r = rngFrom(hashStr(name) >>> 0);
    function f(x, y, col) { px(c, ox + x, oy + y, col); }
    function fillNoise(p0, p1, p2) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? p1 : t < 0.66 ? p0 : p2); } }
    switch (name) {
      case 'stone': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.25 ? '#6f6f6f' : t < 0.5 ? '#787878' : t < 0.78 ? '#828282' : '#8c8c8c'); if (t > 0.96) f(x, y, '#5e5e5e'); } break;
      case 'dirt': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.25 ? '#6e4c34' : t < 0.55 ? '#7d573c' : t < 0.82 ? '#8a6044' : '#976b4d'); if (t > 0.95) f(x, y, '#5a3d28'); } break;
      case 'grass_top': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.3 ? '#5b9142' : t < 0.7 ? '#6aa84f' : '#7bbf5c'); if (t > 0.95) f(x, y, '#4f7f3a'); } break;   // 초록 베이스(아이콘=초록, 월드=바이옴 틴트로 곱)
      case 'grass_side': { fillNoise('#7d573c', '#6e4c34', '#8a6044'); for (let x = 0; x < 16; x++) { const gh = 3 + (r() < 0.33 ? 1 : 0); for (let y = 0; y < gh; y++) f(x, y, r() < 0.5 ? '#5b9142' : '#6aa84f'); } break; }   // 흙 베이스 + 상단 3~4px 초록 띠(마크식)
      case 'sand': fillNoise('#e0d6a0', '#d4c98e', '#ece2b0'); break;
      case 'sandstone': { fillNoise('#d9cda0', '#cabf90', '#e6dab0'); for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) f(x, y, '#bcb080'); break; }
      case 'gravel': fillNoise('#867f7e', '#76706f', '#999190'); break;
      case 'cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, (hash3(x * 3, 0, y * 3) < 0.18) ? '#5a5a5a' : (r() < 0.5 ? '#7d7d7d' : '#919191')); break;
      case 'stonebrick': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 8 === 0) || (x % 8 === (y < 8 ? 0 : 4)); f(x, y, e ? '#5a5a5a' : (r() < 0.5 ? '#7b7b7b' : '#888')); } break;
      case 'bricks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = (y % 4 === 0) || ((x + (((y >> 2) % 2) ? 4 : 0)) % 8 === 0); f(x, y, e ? '#7a3527' : '#9a4f3f'); } break;
      case 'log_top': { fillNoise('#b59b6a', '#a78c5b', '#c4aa79'); for (let i = 2; i <= 7; i += 2) { c.strokeStyle = '#8a724a'; c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); } break; }
      case 'log_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, ((x + (r() < .3 ? 1 : 0)) % 5 === 0) ? '#5b472d' : (r() < 0.5 ? '#6b5436' : '#7c6342')); break; }
      case 'planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#9c7a44' : '#b08a4f'); if (y % 4 === 0) f(x, y, '#7a5f34'); } break;
      case 'birch_planks': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { f(x, y, ((y >> 2) % 2) ? '#c8b787' : '#d8c99a'); if (y % 4 === 0) f(x, y, '#b0a074'); } break;   // 자작 판자(밝은 크림색)
      case 'leaves': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.35 ? '#3f7a2e' : t < 0.7 ? '#4c8f38' : '#5aa042'); if (t > 0.92) f(x, y, '#16240e'); if (t < 0.05) f(x, y, '#0e1a09'); } break;   // 초록(바이옴 틴트로 곱) + 불투명(구멍은 어두운 색, 투명 X — 성능·8×8 변환 용이)
      case 'coal_ore': oreTex(c, ox, oy, r, '#26262a'); break;
      case 'iron_ore': oreTex(c, ox, oy, r, '#d8a282'); break;
      case 'gold_ore': oreTex(c, ox, oy, r, '#fbdb4b'); break;
      case 'diamond_ore': oreTex(c, ox, oy, r, '#5decd5'); break;
      case 'redstone_ore': oreTex(c, ox, oy, r, '#e8323b'); break;
      case 'lapis_ore': oreTex(c, ox, oy, r, '#1a44a5'); break;
      case 'emerald_ore': oreTex(c, ox, oy, r, '#17a94f'); break;
      case 'glass': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, '#bfe6f2'); c.fillStyle = '#dff2f9'; c.fillRect(ox, oy, 16, 1); c.fillRect(ox, oy, 1, 16); c.fillStyle = '#9fd0e0'; c.fillRect(ox, oy + 15, 16, 1); c.fillRect(ox + 15, oy, 1, 16); break; }
      case 'bedrock': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.33 ? '#3a3a3a' : t < 0.66 ? '#565656' : '#6b6b6b'); } break;
      case 'snow': fillNoise('#f0f4f7', '#e2e8ec', '#ffffff'); break;
      case 'water': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#3463cf' : '#3a6ee0'); break;
      case 'obsidian': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.4 ? '#120d1c' : t < 0.8 ? '#1a1326' : '#2a2040'); } break;
      case 'glow': { fillNoise('#c8a23f', '#b38e30', '#f4d35e'); for (let i = 0; i < 8; i++) f((r() * 16) | 0, (r() * 16) | 0, '#fff7cc'); break; }
      case 'craft_top': { drawTexFine(c, ox, oy, 'planks'); c.fillStyle = '#5a4327'; c.fillRect(ox + 2, oy + 2, 5, 5); c.fillRect(ox + 9, oy + 2, 5, 5); c.fillRect(ox + 2, oy + 9, 12, 5); break; }
      case 'craft_side': { drawTexFine(c, ox, oy, 'planks'); c.fillStyle = '#6b4f2a'; c.fillRect(ox + 1, oy + 8, 14, 7); break; }
      case 'furnace': { drawTexFine(c, ox, oy, 'stone'); c.fillStyle = '#222'; c.fillRect(ox + 4, oy + 6, 8, 8); c.fillStyle = '#e8902a'; c.fillRect(ox + 5, oy + 11, 6, 3); break; }
      case 'chest': { drawTexFine(c, ox, oy, 'planks'); c.fillStyle = '#3a2a14'; c.fillRect(ox, oy + 7, 16, 2); c.fillStyle = '#d7c27a'; c.fillRect(ox + 7, oy + 6, 2, 4); break; }
      case 'birch_side': { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); f(x, y, t < 0.6 ? '#d7d3c8' : t < 0.85 ? '#e7e3d8' : '#c4c0b4'); } for (let i = 0; i < 5; i++) { const bx = (r() * 13) | 0, by = (r() * 14) | 0, bw = 2 + ((r() * 3) | 0); c.fillStyle = '#3a3a32'; c.fillRect(ox + bx, oy + by, bw, 1); } break; }
      case 'cactus_top': { fillNoise('#3f7d3a', '#356a31', '#4c8f46'); c.fillStyle = '#2e5e2a'; c.fillRect(ox + 4, oy + 4, 8, 8); c.fillStyle = '#5aa050'; c.fillRect(ox + 6, oy + 6, 4, 4); break; }
      case 'cactus_side': { fillNoise('#3f7d3a', '#356a31', '#4c8f46'); c.fillStyle = '#2e5e2a'; c.fillRect(ox, oy, 1, 16); c.fillRect(ox + 15, oy, 1, 16); c.fillRect(ox + 7, oy, 2, 16); for (let i = 0; i < 10; i++) f((r() * 16) | 0, (r() * 16) | 0, '#dfe7a0'); break; }
      case 'iron_block': fillNoise('#e4e4e0', '#d6d6d2', '#f0f0ec'); break;
      case 'gold_block': fillNoise('#f2d75c', '#e4c74c', '#fbe36e'); break;
      case 'diamond_block': fillNoise('#6ef0dc', '#5ee0cc', '#7effe8'); break;
      case 'coal_block': fillNoise('#1c1c1e', '#141416', '#26262a'); break;
      case 'redstone_block': fillNoise('#c81f28', '#b81a22', '#d83038'); break;
      case 'lapis_block': fillNoise('#1f4fc0', '#1740a0', '#2a5fd8'); break;
      case 'emerald_block': fillNoise('#1fbf5c', '#17a94f', '#2ad06c'); break;
      case 'pumpkin_top': { fillNoise('#d6791f', '#c46c18', '#e8902f'); c.fillStyle = '#8a5012'; for (let i = 2; i <= 6; i += 2) c.strokeRect(ox + 8 - i + .5, oy + 8 - i + .5, i * 2 - 1, i * 2 - 1); break; }
      case 'pumpkin_side': { fillNoise('#d6791f', '#c46c18', '#e8902f'); for (let y = 0; y < 16; y++) { f(3, y, '#a85f16'); f(7, y, '#a85f16'); f(12, y, '#a85f16'); } break; }
      // ---- cross 스프라이트(투명 배경) ----
      case 'tall_grass': { for (let x = 1; x < 16; x += 2) { const h = 6 + ((r() * 7) | 0); const col = r() < 0.5 ? '#5b9142' : '#6aa84f'; for (let y = 16 - h; y < 16; y++) { let xx = x + ((y % 3 === 0 && r() < 0.5) ? 1 : 0); f(xx, y, col); } } break; }
      case 'flower_red': { for (let y = 7; y < 16; y++) f(8, y, '#3f7d3a'); f(7, 11, '#356a31'); f(9, 9, '#356a31'); c.fillStyle = '#d23b32'; c.fillRect(ox + 6, oy + 3, 5, 5); c.fillStyle = '#f0d33a'; c.fillRect(ox + 8, oy + 5, 1, 1); break; }
      case 'flower_yellow': { for (let y = 7; y < 16; y++) f(8, y, '#3f7d3a'); f(7, 10, '#356a31'); f(10, 12, '#356a31'); c.fillStyle = '#f0c829'; c.fillRect(ox + 6, oy + 3, 5, 5); c.fillStyle = '#8a5a18'; c.fillRect(ox + 8, oy + 5, 1, 1); break; }
      case 'sugar_cane': { for (let y = 0; y < 16; y++) { const col = (y % 5 === 0) ? '#7bbf5c' : (r() < 0.5 ? '#8fc36a' : '#a3d178'); f(7, y, col); f(8, y, col); } break; }
      case 'farmland_top': { fillNoise('#5a3f28', '#4a3320', '#6a4d34'); c.fillStyle = '#3a2818'; for (let y = 2; y < 16; y += 4) c.fillRect(ox, oy + y, 16, 1); break; }
      case 'wheat_young': { for (let x = 2; x < 14; x += 3) { const h = 4 + ((r() * 3) | 0); for (let y = 16 - h; y < 16; y++) f(x, y, r() < 0.5 ? '#5b9142' : '#6aa84f'); } break; }
      case 'wheat_mature': { for (let x = 1; x < 16; x += 2) { const h = 9 + ((r() * 4) | 0); const topY = 16 - h; for (let y = topY; y < 16; y++) f(x, y, (y < topY + 4) ? (r() < 0.5 ? '#d8b23a' : '#e8c24a') : (r() < 0.5 ? '#8a7a2a' : '#a08a30')); } break; }
      case 'carrot_young': { for (let x = 3; x < 13; x += 3) { const h = 3 + ((r() * 3) | 0); for (let y = 16 - h; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } break; }
      case 'carrot_mature': { for (let x = 1; x < 16; x += 2) { const h = 8 + ((r() * 3) | 0); for (let y = 16 - h; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } for (let i = 0; i < 3; i++) { const x = 4 + i * 4; f(x, 15, '#e07b1f'); f(x, 14, '#d06a15'); } break; }
      case 'potato_young': { for (let x = 3; x < 13; x += 3) { const h = 3 + ((r() * 3) | 0); for (let y = 16 - h; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } break; }
      case 'potato_mature': { for (let x = 1; x < 16; x += 2) { const h = 8 + ((r() * 3) | 0); for (let y = 16 - h; y < 16; y++) f(x, y, r() < 0.5 ? '#3f7d3a' : '#4c8f46'); } for (let i = 0; i < 3; i++) { const x = 4 + i * 4; f(x, 15, '#c8a25a'); f(x, 14, '#b8924a'); } break; }
      case 'sapling_tex': { for (let y = 6; y < 16; y++) f(8, y, '#4c8f38'); f(6, 9, '#4c8f38'); f(10, 8, '#4c8f38'); f(6, 10, '#3f7d3a'); f(10, 9, '#3f7d3a'); break; }
      case 'granite': fillNoise('#9a7163', '#8c6356', '#a87e6f'); break;
      case 'andesite': fillNoise('#888a89', '#7c7e7d', '#9a9c9b'); break;
      case 'diorite': fillNoise('#bcbcbc', '#a8a8a8', '#d0d0d0'); break;
      case 'mossy_cobble': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); let col = (hash3(x * 3, 0, y * 3) < 0.18) ? '#5a5a5a' : (t < 0.5 ? '#7d7d7d' : '#919191'); if (hash3(x * 5 + 2, 1, y * 5 + 3) < 0.22) col = t < 0.5 ? '#5c6b4d' : '#6b7a5a'; f(x, y, col); } break;
      case 'clay_block': fillNoise('#a4a8b6', '#9498a6', '#b4b8c6'); break;
      case 'ice': fillNoise('#83a0f0', '#7390e0', '#a0bcff'); break;
      case 'wool': fillNoise('#e9ecec', '#dadddd', '#f6f9f9'); break;
      case 'bookshelf': { drawTexFine(c, ox, oy, 'planks'); for (let by = 0; by < 2; by++) { const y0 = 2 + by * 7; c.fillStyle = '#6b4f2a'; c.fillRect(ox + 1, oy + y0, 14, 5); for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#c0392b' : '#3a6ee0'; c.fillRect(ox + 2 + i * 2, oy + y0 + 1, 1, 3); } } break; }
      case 'torch': { c.fillStyle = '#5b472d'; c.fillRect(ox + 7, oy + 6, 2, 9); c.fillStyle = '#e8902a'; c.fillRect(ox + 6, oy + 3, 4, 4); c.fillStyle = '#ffd35e'; c.fillRect(ox + 7, oy + 4, 2, 2); break; }
      case 'lava': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y, r() < 0.5 ? '#e8632a' : '#d2541f'); for (let i = 0; i < 5; i++) f((r() * 16) | 0, (r() * 16) | 0, '#f7a02a'); break;
      case 'ladder': { for (let xx = 2; xx <= 13; xx += 11) { c.fillStyle = '#8a6a3a'; c.fillRect(ox + xx, oy, 2, 16); } for (let y = 2; y < 16; y += 5) { c.fillStyle = '#9c7a44'; c.fillRect(ox + 3, oy + y, 10, 2); } break; }
      case 'tnt': { fillNoise('#c0392b', '#a93226', '#e74c3c'); c.fillStyle = '#e8d840'; c.fillRect(ox, oy + 6, 16, 4); c.fillStyle = '#222'; for (let i = 0; i < 3; i++) c.fillRect(ox + 2 + i * 5, oy + 7, 2, 2); break; }
      default: fillNoise('#888', '#666', '#aaa');
    }
  }
  function oreTex(c, ox, oy, r, ore) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const t = r(); px(c, ox + x, oy + y, t < 0.33 ? '#727272' : t < 0.66 ? '#7e7e7e' : '#8a8a8a'); }
    for (let i = 0; i < 6; i++) { const x = 2 + ((hash3(i, 1, 0) * 11) | 0), y = 2 + ((hash3(i, 2, 0) * 11) | 0); c.fillStyle = ore; c.fillRect(ox + x, oy + y, 3, 3); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(ox + x, oy + y, 1, 1); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ox + x + 2, oy + y + 2, 1, 1); }
  }
  // ★ 16×16 정밀 패턴 → 색은 8×8(2×2 블록 평균)로 단순화. 단, 십자(컷아웃) 식물처럼
  // '꽉 차지 않은' 모양은 실루엣(알파)을 16×16 그대로 유지하고 채색만 8×8 팔레트를 써서
  // 잎맥처럼 가느다란 형태가 뭉개지지 않게 함. 그 외(불투명 블록)는 2×2 블록 단위로 채워
  // 동일한 결과를 더 적은 fillRect로 얻음. atlas·texCanvas 등 drawTex의 모든 호출 경로에 적용.
  const CUTOUT_TEX = { tall_grass: 1, flower_red: 1, flower_yellow: 1, sugar_cane: 1, wheat_young: 1, wheat_mature: 1, carrot_young: 1, carrot_mature: 1, potato_young: 1, potato_mature: 1, sapling_tex: 1, torch: 1, ladder: 1 };
  let _dtOffCanvas = null;
  function drawTex(c, ox, oy, name) {
    if (!_dtOffCanvas) { _dtOffCanvas = document.createElement('canvas'); _dtOffCanvas.width = 16; _dtOffCanvas.height = 16; }
    const oc = _dtOffCanvas.getContext && _dtOffCanvas.getContext('2d');
    if (!oc || typeof oc.getImageData !== 'function') { drawTexFine(c, ox, oy, name); return; }   // 캔버스 픽셀 읽기 미지원 환경(테스트 등) 폴백
    oc.clearRect(0, 0, 16, 16);
    drawTexFine(oc, 0, 0, name);
    let id;
    try { id = oc.getImageData(0, 0, 16, 16).data; } catch (e) { drawTexFine(c, ox, oy, name); return; }
    // 8×8 팔레트(각 2×2 블록의 알파가중 평균색) 계산 — 공통
    const pal = new Array(64);
    for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px2 = bx * 2 + dx, py2 = by * 2 + dy, idx = (py2 * 16 + px2) * 4, a = id[idx + 3];
        sr += id[idx] * a; sg += id[idx + 1] * a; sb += id[idx + 2] * a; sa += a;
      }
      const avgA = (sa / 4) | 0;
      pal[by * 8 + bx] = avgA < 24 ? null : [Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa), avgA];
    }
    if (CUTOUT_TEX[name]) {
      // 모양(알파)은 16×16 원본 그대로, 색만 8×8 팔레트 사용 — 가는 형태 보존
      for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
        const idx = (py * 16 + px) * 4, a = id[idx + 3]; if (a < 8) continue;
        const p = pal[(py >> 1) * 8 + (px >> 1)] || [id[idx], id[idx + 1], id[idx + 2]];
        c.fillStyle = a >= 248 ? `rgb(${p[0]},${p[1]},${p[2]})` : `rgba(${p[0]},${p[1]},${p[2]},${(a / 255).toFixed(3)})`;
        c.fillRect(ox + px, oy + py, 1, 1);
      }
    } else {
      // 불투명/일반 블록: 2×2 블록 단위로 채우기(더 적은 fillRect, 결과 동일)
      for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
        const p = pal[by * 8 + bx]; if (!p) continue;
        c.fillStyle = p[3] >= 248 ? `rgb(${p[0]},${p[1]},${p[2]})` : `rgba(${p[0]},${p[1]},${p[2]},${(p[3] / 255).toFixed(3)})`;
        c.fillRect(ox + bx * 2, oy + by * 2, 2, 2);
      }
    }
  }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  // 패딩 아틀라스(256x256, 8x8 셀, 16px 타일 + 8px 가장자리 익스트루드) → 밉맵/이방성 필터에서 블리딩 없음
  function buildAtlas() {
    const names = new Set();
    BLOCKS.forEach(b => { if (!b.tex) return; if (typeof b.tex === 'string') names.add(b.tex); else { names.add(b.tex.top); names.add(b.tex.side); names.add(b.tex.bottom); } });
    const list = Array.from(names); const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 16; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    list.forEach((nm, i) => { const cx = (i % cols) * 16, cy = ((i / cols) | 0) * 16; drawTex(c, cx, cy, nm); });
    list.forEach((nm, i) => { const cx = (i % cols), cy = ((i / cols) | 0); const e = 0.01; atlasUV[nm] = { x0: (cx + e) / cols, x1: (cx + 1 - e) / cols, y0: (cy + e) / rows, y1: (cy + 1 - e) / rows }; });
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false; atlasTex.needsUpdate = true;
    blockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
    waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    plantMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });   // 컷아웃 식물(양면)
    lavaMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });   // 용암(물과 달리 불투명)
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
    if (e.code.indexOf('Digit') === 0) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) { hotbar = n - 1; refreshHotbar(); flashHeldName(); } }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onWheel(e) { e.preventDefault(); hotbar = (hotbar + (e.deltaY > 0 ? 1 : -1) + 9) % 9; refreshHotbar(); flashHeldName(); }
  function relPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function onDown(e) {
    const p = relPos(e); const W = canvas.clientWidth;
    if (!isTouch) {
      if (!look.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 2) { placeOrUse(); return; }
      const m = mobInFront(); if (m) { attackMob(m); return; }   // 좌클릭: 앞 몹 공격
      mining = true;   // 아니면 꾹=캐기
      return;
    }
    // 터치: 좌측 이동 조이스틱, 우측 = (앞 몹이면 공격) 꾹 캐기 / 탭 설치
    if (p.x < W * 0.4 && move.id === -1) { move.active = true; move.id = e.pointerId; move.ox = move.x = p.x; move.oy = move.y = p.y; }
    else if (look.id === -1) { look.id = e.pointerId; look.lx = p.x; look.ly = p.y; look.moved = 0; look.downT = performance.now(); look.attacked = false; const m = mobInFront(); if (m) { attackMob(m); look.attacked = true; } else mining = true; }
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
      if (!look.attacked && look.moved < 10 && (performance.now() - look.downT) < 200) placeOrUse();   // 짧은 탭 = 설치/사용
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
    const held = inv[hotbar];
    if (held) {
      const it0 = window.ADV_ITEMS[held.k]; if (it0 && it0.bow) { shootArrow(); return; }   // 활: 조준 발사
      // 괭이: 흙/잔디 → 경작지(위 칸이 비어야 함)
      if (it0 && it0.tool === 'hoe' && t) {
        const tk = BYID[getBlock(t.x, t.y, t.z)].key;
        if ((tk === 'dirt' || tk === 'grass') && getBlock(t.x, t.y + 1, t.z) === 0) { setBlock(t.x, t.y, t.z, ID.farmland); swing(); return; }
      }
      // 씨앗/작물 심기: 경작지 위에 심기
      if (it0 && it0.plant && t) {
        const tk = BYID[getBlock(t.x, t.y, t.z)].key;
        if (tk === 'farmland' && getBlock(t.x, t.y + 1, t.z) === 0 && ID[it0.plant] !== undefined) { setBlock(t.x, t.y + 1, t.z, ID[it0.plant]); consumeHeld(1); swing(); return; }
      }
      // 동물 먹이(번식)
      const m = mobInFront(); if (m && MOB[m.type] && !MOB[m.type].hostile && MOB[m.type].breed === held.k && !m.baby && m.loveT <= 0) { feedMob(m); swing(); return; }
      // 음식 먹기
      const it = window.ADV_ITEMS[held.k]; if (it && it.food) { if (eatFood(hotbar)) { swing(); return; } }
    }
    if (placeBlock()) swing();
  }
  function openStation(st) { if (st === 'craft') openInventory('table'); else if (st === 'furnace') toast('화로는 곧 추가돼요'); else if (st === 'chest') toast('상자는 곧 추가돼요'); }
  function breakBlock(x, y, z) {
    const id = getBlock(x, y, z); const key = BYID[id].key; const def = bprop(key);
    const harvest = canHarvest(key, inv[hotbar]);
    setBlock(x, y, z, 0);
    settleGravity(x, y + 1, z);                    // 위 모래/자갈 낙하
    swing(); addExhaustion(0.005);                 // 블록 파괴 탈진
    if (!harvest) return;                          // 요구 도구 미달 → 드롭 없음
    if (def) {
      const drops = def.drops || [{ i: key, c: 1 }];
      for (const dr of drops) { const ch = dr.chance != null ? dr.chance * cfg.dropMul : 1; if (Math.random() > ch) continue; let cnt = dr.c; if (dr.max) cnt = dr.c + Math.floor(Math.random() * (dr.max - dr.c + 1)); if (cnt > 0) addItem(dr.i, cnt); }
    } else if (window.advDef && window.advDef(key)) addItem(key, 1);   // 미정의 장식(잡초/꽃)은 드롭 없음 — 죽은 아이템 방지
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
  // 작물 성장 — 실제 마크 랜덤틱 공식: 확률=1/(floor(25/points)+1), 평균 랜덤틱 간격 68.27초(자바 에디션)
  const CROP_RIPE = { wheat_crop: 'wheat_ripe', carrot_crop: 'carrot_ripe', potato_crop: 'potato_ripe' };
  function isHydrated(fx, fy, fz) {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (getBlock(fx + dx, fy, fz + dz) === ID.water || getBlock(fx + dx, fy + 1, fz + dz) === ID.water) return true;
    }
    return false;
  }
  let _growT = 0;
  function growTick(dt) {
    _growT += dt; if (_growT < 1) return; _growT = 0;
    overlay.forEach((id, key) => {
      const b = BYID[id]; if (!b || !CROP_RIPE[b.key]) return;
      const p = key.split(',').map(Number); const x = p[0], y = p[1], z = p[2];
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK); if (!chunks.has(ckey(cx, cz))) return;   // 로드된 청크만(마크처럼 언로드 지역은 성장 정지)
      if (getBlock(x, y + 1, z) !== 0) return;                    // 위가 막히면 성장 불가(빛 차단 근사)
      const hyd = isHydrated(x, y - 1, z);
      const points = hyd ? 4 : 2;
      const chance = 1 / (Math.floor(25 / points) + 1);
      if (Math.random() < chance / 68.27) setBlock(x, y, z, ID[CROP_RIPE[b.key]]);
    });
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
    P.vy -= 32 * dt; if (P.vy < -78) P.vy = -78;   // 마크 실제 중력(≈32블록/s²)에 맞춤(예전 26은 점프가 미세하게 더 늘어짐)
    const wantJump = keys.Space || (move.active && (move.y - move.oy) < -34);
    const wasGround = P.onGround;
    if (wantJump && P.onGround && !invOpen) { P.vy = 8.5; P.onGround = false; addExhaustion(sprint ? 0.2 : 0.05); }   // 점프 탈진
    const px = P.x, pz = P.z;
    moveAxis('x', P.vx * dt); moveAxis('z', P.vz * dt); P.onGround = false; moveAxis('y', P.vy * dt);
    // 이동거리 탈진(달리기 0.1/m, 수영 0.01/m)
    const moved = Math.hypot(P.x - px, P.z - pz);
    if (moved > 0.0005) { if (headInWater() || feetInWater()) addExhaustion(0.01 * moved); else if (sprint) addExhaustion(0.1 * moved); }
    // 낙하 데미지 추적
    if (!wasGround && P.onGround) { if (P.fallStart != null) { const d = P.fallStart - P.y; const dmg = Math.floor(d - 3); if (dmg > 0 && !feetInWater()) hurtPlayer(dmg, 'fall'); } P.fallStart = null; }
    if (!P.onGround) { if (P.vy <= 0 && P.fallStart == null) P.fallStart = P.y; if (P.fallStart != null && P.y > P.fallStart) P.fallStart = P.y; }
    if (P.y < -30) hurtPlayer(99, 'void');
  }
  function feetInWater() { return getBlock(Math.floor(P.x), Math.floor(P.y + 0.2), Math.floor(P.z)) === ID.water; }
  function headInWater() { return getBlock(Math.floor(P.x), Math.floor(P.y + P.h - 0.2), Math.floor(P.z)) === ID.water; }
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
  function respawn() {
    const sx = P.spawnX != null ? P.spawnX : 0.5, sz = P.spawnZ != null ? P.spawnZ : 0.5;
    P.x = sx; P.z = sz; P.y = columnTop(Math.floor(sx), Math.floor(sz)) + 1.05; P.vx = P.vy = P.vz = 0;
    P.hp = 20; P.hunger = 20; P.sat = 5; P.exh = 0; P.airT = 0; P.fallStart = null;
    if (!cfg.keepInvOnDeath) { inv = new Array(36).fill(null); refreshHotbar(); }
    updateHUD();
  }

  /* ---------------- 생존(체력/허기/포화/탈진) — 1.10.2 정확값 ---------------- */
  function addExhaustion(v) {
    P.exh += v;
    while (P.exh >= 4) { P.exh -= 4; if (P.sat > 0) P.sat = Math.max(0, P.sat - 1); else P.hunger = Math.max(0, P.hunger - 1); }
  }
  const FOOD_SAT = { bread: 6, cooked_porkchop: 12.8, cooked_beef: 12.8, cooked_chicken: 7.2, raw_porkchop: 1.8, raw_beef: 1.8, raw_chicken: 1.2, apple: 2.4, golden_apple: 9.6, carrot: 3.6, potato: 0.6, baked_potato: 6, cookie: 0.4, melon_slice: 1.2, raw_fish: 0.4, cooked_fish: 6, pumpkin_pie: 4.8, rotten_flesh: 0.8 };
  function eatFood(slot) {
    const s = inv[slot]; if (!s) return false; const it = window.ADV_ITEMS[s.k]; if (!it || !it.food) return false;
    if (P.hunger >= 20 && !it.regen) return false;
    P.hunger = Math.min(20, P.hunger + it.food);
    P.sat = Math.min(P.hunger, P.sat + (FOOD_SAT[s.k] != null ? FOOD_SAT[s.k] : it.food * 1.2));
    if (it.regen) P.hp = Math.min(20, P.hp + 4);
    if (it.poison && Math.random() < it.poison) hurtPlayer(1, 'poison');
    s.n--; if (s.n <= 0) inv[slot] = null; refreshHotbar(); updateHUD(); scheduleSave(); return true;
  }
  let _regenT = 0, _starveT = 0, _drownT = 0, _hurtCss = 0;
  function updateVitals(dt) {
    // 자연재생: 허기>=18 → 4초마다 1HP + 탈진 6.0 (1.10.2)
    if (P.hunger >= 18 && P.hp < 20) { _regenT += dt; if (_regenT >= 4) { _regenT = 0; P.hp = Math.min(20, P.hp + 1); addExhaustion(6.0); } } else _regenT = 0;
    // 포화 빠른재생(허기 만땅 & 포화>0): 0.5초마다 1HP + 탈진 6.0
    if (P.hunger >= 20 && P.sat > 0 && P.hp < 20) { _regenT += dt; if (_regenT >= 0.5) { _regenT = 0; P.hp = Math.min(20, P.hp + 1); addExhaustion(6.0); } }
    // 굶주림: 허기0 → 4초마다 1피해(Normal: 체력 1칸까지)
    if (P.hunger <= 0) { _starveT += dt; if (_starveT >= 4) { _starveT = 0; if (P.hp > 1) hurtPlayer(1, 'starve'); } } else _starveT = 0;
    // 익사: 머리 물속 → 15초 후 1초마다 2피해
    if (headInWater()) { P.airT += dt; if (P.airT > 15) { _drownT += dt; if (_drownT >= 1) { _drownT = 0; hurtPlayer(2, 'drown'); } } } else { P.airT = Math.max(0, P.airT - dt * 3); _drownT = 0; }
    // 용암: 4피해/0.5초
    const feet = getBlock(Math.floor(P.x), Math.floor(P.y + 0.2), Math.floor(P.z));
    if (BYID[feet] && BYID[feet].key === 'lava') { P._lavaT = (P._lavaT || 0) + dt; if (P._lavaT >= 0.5) { P._lavaT = 0; hurtPlayer(4, 'lava'); } }
    if (P.hurtT > 0) P.hurtT -= dt;
    if (P.attackT > 0) P.attackT -= dt;
    // 데미지 비네트
    const el = document.getElementById('adv3hurt'); if (el) { const a = P.hurtT > 0 ? Math.min(0.5, P.hurtT) : 0; if (Math.abs(a - _hurtCss) > 0.02) { _hurtCss = a; el.style.opacity = a; } }
  }
  function hurtPlayer(dmg, cause) {
    if (P.hp <= 0) return;
    if (P.hurtT > 0.2 && cause !== 'starve' && cause !== 'drown' && cause !== 'lava' && cause !== 'fall') return;   // 무적프레임
    if (cause !== 'starve' && cause !== 'drown') { const p = armorPoints(); if (p > 0) dmg = dmg * (1 - Math.min(0.8, p * 0.04)); }   // 방어구 경감(1포인트=4%, 최대 80%)
    if (cause !== 'starve' && cause !== 'drown' && cause !== 'fall' && armorEq.off && armorEq.off.k === 'shield') dmg *= 0.7;   // 방패 소지: 근접/발사체 피해 30% 추가 경감
    P.hp = Math.max(0, P.hp - dmg); P.hurtT = 0.5; if (cause !== 'starve' && cause !== 'drown') addExhaustion(0.1);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
    if (P.hp <= 0) { onDeath(cause); }
    updateHUD();
  }
  function onDeath(cause) { if (!cfg.keepInvOnDeath) { /* 인벤 드롭 생략(즉시 리셋) */ } toast('사망 — 리스폰', false); respawn(); }

  /* ---------------- 몹 — 1.10.2 수치 ---------------- */
  const MOB = {
    pig:     { kor: '돼지', hostile: false, hp: 10, dmg: 0, speed: 4.0, w: 0.9, h: 0.9, col: 0xe6a8ad, drops: [{ i: 'raw_porkchop', min: 1, max: 3 }], breed: 'wheat', biped: false },
    cow:     { kor: '소', hostile: false, hp: 10, dmg: 0, speed: 3.4, w: 0.9, h: 1.4, col: 0x4a3a2c, drops: [{ i: 'raw_beef', min: 1, max: 3 }, { i: 'leather', min: 0, max: 2 }], breed: 'wheat', biped: false },
    sheep:   { kor: '양', hostile: false, hp: 8, dmg: 0, speed: 3.4, w: 0.9, h: 1.3, col: 0xeceff0, drops: [{ i: 'raw_beef', min: 1, max: 2 }, { i: 'wool', min: 1, max: 1 }], breed: 'wheat', biped: false },
    chicken: { kor: '닭', hostile: false, hp: 4, dmg: 0, speed: 3.5, w: 0.4, h: 0.7, col: 0xf2f2f2, drops: [{ i: 'raw_chicken', min: 1, max: 1 }, { i: 'feather', min: 0, max: 2 }], breed: 'seeds', biped: true },
    zombie:  { kor: '좀비', hostile: true, hp: 20, dmg: 3, speed: 3.5, w: 0.6, h: 1.95, col: 0x3f7a4f, burn: true, drops: [{ i: 'rotten_flesh', min: 0, max: 2 }], biped: true },
    skeleton:{ kor: '스켈레톤', hostile: true, hp: 20, dmg: 3, speed: 3.5, w: 0.6, h: 1.99, col: 0xd5d8d6, burn: true, ranged: true, drops: [{ i: 'bone', min: 0, max: 2 }, { i: 'arrow', min: 0, max: 2 }], biped: true },
    creeper: { kor: '크리퍼', hostile: true, hp: 20, dmg: 0, speed: 3.5, w: 0.6, h: 1.7, col: 0x5fa05f, explode: true, drops: [{ i: 'gunpowder', min: 0, max: 2 }], biped: true },
    spider:  { kor: '거미', hostile: true, hp: 16, dmg: 2, speed: 4.6, w: 1.4, h: 0.9, col: 0x39312e, climb: true, drops: [{ i: 'string', min: 0, max: 2 }], biped: false },
  };
  let mobs = [], mobMatCache = {}, _spawnT = 0;
  function mobMat(col) { if (!mobMatCache[col]) mobMatCache[col] = new THREE.MeshBasicMaterial({ color: col }); return mobMatCache[col]; }
  function mkBox(w, h, d, col, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mobMat(col)); if (x !== undefined) m.position.set(x, y, z); return m; }
  function buildMobMesh(type) {
    const md = MOB[type]; const g = new THREE.Group();
    const body = md.col, dark = shade(md.col, 0.78), light = shade(md.col, 1.12), W = md.w, H = md.h;
    if (md.biped) {
      g.add(mkBox(W, H * 0.5, W * 0.5, body, 0, H * 0.52, 0));                 // 몸통
      g.add(mkBox(W * 0.85, W * 0.85, W * 0.85, light, 0, H * 0.85, 0));       // 머리
      g.add(mkBox(W * 0.6, W * 0.22, 0.03, 0x20140c, 0, H * 0.9, W * 0.44));   // 눈(어두운 띠)
      if (type === 'creeper') {
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(o => g.add(mkBox(W * 0.3, H * 0.28, W * 0.3, dark, o[0] * W * 0.22, H * 0.14, o[1] * W * 0.22)));   // 4다리
        g.add(mkBox(W * 0.34, W * 0.34, 0.04, 0x0c160c, 0, H * 0.78, W * 0.44));    // 입(검정)
      } else {
        [-1, 1].forEach(s => g.add(mkBox(W * 0.32, H * 0.42, W * 0.32, dark, s * W * 0.2, H * 0.21, 0)));   // 2다리
        if (type === 'zombie' || type === 'skeleton') [-1, 1].forEach(s => g.add(mkBox(W * 0.22, W * 0.22, H * 0.42, type === 'skeleton' ? 0xdedede : body, s * W * 0.55, H * 0.62, W * 0.22)));   // 앞으로 뻗은 팔
      }
    } else {
      g.add(mkBox(W * 0.72, H * 0.6, W * 1.05, body, 0, H * 0.5, 0));          // 몸통
      g.add(mkBox(W * 0.58, H * 0.5, W * 0.45, light, 0, H * 0.55, W * 0.58)); // 머리(앞)
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(o => g.add(mkBox(W * 0.2, H * 0.38, W * 0.2, dark, o[0] * W * 0.26, H * 0.19, o[1] * W * 0.32)));   // 4다리
      if (type === 'pig') g.add(mkBox(W * 0.28, W * 0.22, 0.1, 0xd98a90, 0, H * 0.5, W * 0.82));   // 돼지 코
      if (type === 'cow') { [-1, 1].forEach(s => g.add(mkBox(0.06, 0.16, 0.06, 0xe8e0cf, s * W * 0.16, H * 0.8, W * 0.55))); g.add(mkBox(W * 0.5, H * 0.28, 0.03, 0xf2f2f2, 0, H * 0.5, W * 0.58)); }   // 뿔+흰 얼룩
      if (type === 'sheep') { g.add(mkBox(W * 0.9, H * 0.72, W * 1.12, 0xededed, 0, H * 0.5, 0)); g.add(mkBox(W * 0.45, H * 0.4, W * 0.4, 0x3a3a3a, 0, H * 0.52, W * 0.6)); }   // 양털+검은 얼굴
      if (type === 'chicken') { g.add(mkBox(0.1, 0.08, 0.12, 0xf0a030, 0, H * 0.55, W * 0.82)); g.add(mkBox(0.09, 0.12, 0.14, 0xd23b32, 0, H * 0.78, W * 0.55)); }   // 부리+볏
    }
    if (type === 'spider') [-1, 1].forEach(s => g.add(mkBox(0.09, 0.09, 0.03, 0xff2020, s * W * 0.16, H * 0.55, W * 0.5)));   // 거미 빨간 눈
    return g;
  }
  function shade(col, f) { const r = Math.min(255, ((col >> 16) & 255) * f) | 0, gr = Math.min(255, ((col >> 8) & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0; return (r << 16) | (gr << 8) | b; }
  const PASSIVE = ['pig', 'cow', 'sheep', 'chicken'], HOSTILE = ['zombie', 'skeleton', 'creeper', 'spider'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // 마크식 스폰 상수: 최소 24칸, 최대 128칸, 디스폰 128, 32칸 밖 무작위 디스폰
  const SPAWN_MIN = 24, SPAWN_MAX = 96, DESPAWN = 128, RANDOM_DESPAWN = 32;
  function spawnMobs(dt) {
    _spawnT += dt; if (_spawnT < 2.0) return; _spawnT = 0;
    const night = dayFactor() < 0.45; let nH = 0, nP = 0;
    for (const m of mobs) { if (MOB[m.type].hostile) nH++; else nP++; }
    // 밤: 적대몹 무리(마크: 팩 4) / 낮·황혼: 수동동물 무리 보충
    if (night) { if (nH < 16 && Math.random() < 0.8) trySpawnPack(pick(HOSTILE), night, 2 + (Math.random() * 3 | 0)); }
    else { if (nP < 12 && Math.random() < 0.7) trySpawnPack(pick(PASSIVE), night, 3 + (Math.random() * 2 | 0)); }
  }
  // 팩 단위 스폰(한 지점 주변에 여러 마리)
  function trySpawnPack(type, night, n) {
    const c = trySpawn(type, night, SPAWN_MIN, SPAWN_MAX); if (!c) return;
    for (let i = 1; i < n; i++) trySpawnNear(type, night, c[0], c[1]);
  }
  function trySpawnNear(type, night, cx, cz) { const sx = cx + (Math.random() * 8 - 4 | 0), sz = cz + (Math.random() * 8 - 4 | 0); return placeMob(type, night, sx, sz); }
  // 지정 종을 플레이어 주변 적절한 지면에 스폰. 성공하면 [sx,sz], 실패 null.
  function trySpawn(type, night, rMin, rMax) {
    const ang = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    const sx = Math.floor(P.x + Math.cos(ang) * r), sz = Math.floor(P.z + Math.sin(ang) * r);
    return placeMob(type, night, sx, sz) ? [sx, sz] : null;
  }
  function placeMob(type, night, sx, sz) {
    const md = MOB[type]; const surf = surfaceH(sx, sz);
    let y = Math.min(WORLD_H - 3, Math.floor(surf + 2)); while (y > 2 && getBlock(sx, y, sz) === 0) y--;   // 지면 하강 탐색
    const ground = getBlock(sx, y, sz);
    if (!blockSolid(ground)) return false;
    if (getBlock(sx, y + 1, sz) !== 0 || getBlock(sx, y + 2, sz) !== 0) return false;   // 2칸 여유
    const gk = BYID[ground] && BYID[ground].key;
    if (md.hostile) { if (!night && y >= surf - 1) return false; }                          // 적대: 밤 또는 지하(낮 지표 금지)
    else { if (gk !== 'grass' && gk !== 'snow_block' && gk !== 'sand') return false; if (y < surf - 1) return false; }   // 수동: 밝은 지표(잔디/눈/모래)
    addMob(type, sx + 0.5, y + 1, sz + 0.5);
    return true;
  }
  // 새 월드/입장 시 주변에 수동동물 무리 즉시 배치(가까이, 바로 보이게)
  function spawnInitialMobs() {
    let made = 0; for (let tries = 0; tries < 100 && made < 10; tries++) { if (trySpawn(pick(PASSIVE), false, 16, 44)) made++; }
  }
  function addMob(type, x, y, z, baby) {
    const md = MOB[type]; const g = buildMobMesh(type); if (baby) g.scale.setScalar(0.5); scene.add(g);
    mobs.push({ type, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, hp: md.hp, onGround: false, group: g, w: md.w, h: md.h, baby: baby ? 1 : 0, growT: baby ? 1200 : 0, loveT: 0, fleeT: 0, fuse: 0, atkT: 0, wT: 0, wdir: 0, hurtT: 0, fallStart: null });
  }
  function entMoveAxis(e, ax, amt) {
    if (amt === 0) return; e[ax] += amt;
    const minX = e.x - e.w / 2, maxX = e.x + e.w / 2, minZ = e.z - e.w / 2, maxZ = e.z + e.w / 2, minY = e.y, maxY = e.y + e.h;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      if (!blockSolid(getBlock(x, y, z))) continue;
      if (ax === 'y') { if (amt > 0) { e.y = y - e.h - 1e-4; e.vy = 0; } else { e.y = y + 1 + 1e-4; e.vy = 0; e.onGround = true; } return; }
      if (ax === 'x') { if (amt > 0) e.x = x - e.w / 2 - 1e-4; else e.x = x + 1 + e.w / 2 + 1e-4; e.vx = 0; e.blocked = true; return; }
      if (ax === 'z') { if (amt > 0) e.z = z - e.w / 2 - 1e-4; else e.z = z + 1 + e.w / 2 + 1e-4; e.vz = 0; e.blocked = true; return; }
    }
  }
  function entPhysics(e, dt) {
    e.vy -= 32 * dt; if (e.vy < -78) e.vy = -78; e.blocked = false; e.onGround = false;
    const sy = e.y; entMoveAxis(e, 'x', e.vx * dt); entMoveAxis(e, 'z', e.vz * dt); entMoveAxis(e, 'y', e.vy * dt);
    if (e.onGround && e.fallStart != null) { const d = e.fallStart - e.y; const dm = Math.floor(d - 3); if (dm > 0) e.hp -= dm; e.fallStart = null; }
    if (!e.onGround) { if (e.vy <= 0 && e.fallStart == null) e.fallStart = sy; if (e.fallStart != null && e.y > e.fallStart) e.fallStart = e.y; }
  }
  function exposedToSky(x, y, z) { for (let yy = y + 1; yy < WORLD_H; yy++) if (blockOpaque(getBlock(x, yy, z))) return false; return true; }
  function updateMobs(dt) {
    spawnMobs(dt);
    const bright = dayFactor() > 0.8;
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i]; const md = MOB[m.type];
      const dx = P.x - m.x, dz = P.z - m.z, dist = Math.hypot(dx, dz), distY = Math.abs(P.y - m.y);
      if (dist > DESPAWN) { scene.remove(m.group); mobs.splice(i, 1); continue; }                                  // 128칸 밖 즉시 디스폰(마크)
      if (dist > RANDOM_DESPAWN && !m.baby && m.loveT <= 0 && Math.random() < 0.0004) { scene.remove(m.group); mobs.splice(i, 1); continue; }   // 32칸 밖 무작위 디스폰
      // 좀비/스켈레톤 낮 화상
      if (md.burn && bright && exposedToSky(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))) { m.burnT = (m.burnT || 0) + dt; if (m.burnT > 0.5) { m.burnT = 0; m.hp -= 1; m.hurtT = 0.2; } }
      let dir = 0;
      if (md.hostile) {
        if (dist < 16 && distY < 6) {
          const s = Math.sign(dx) || 1, sz2 = Math.sign(dz) || 0; const ln = dist || 1;
          m.vx = (dx / ln) * md.speed; m.vz = (dz / ln) * md.speed; m.yaw = Math.atan2(dx, dz);
          if (dist < 1.4 && distY < 2) {
            if (md.explode) { m.fuse += dt; if (m.fuse > 1.5) { creeperBoom(m); scene.remove(m.group); mobs.splice(i, 1); continue; } }
            else { m.atkT -= dt; if (m.atkT <= 0) { m.atkT = 1.0; hurtPlayer(md.dmg, m.type); } }
          } else if (md.explode) m.fuse = Math.max(0, m.fuse - dt);
          // 스켈레톤 원거리
          if (md.ranged && dist > 2 && dist < 15) { m.atkT -= dt; if (m.atkT <= 0) { m.atkT = 2.0; hurtPlayer(md.dmg, m.type); } }
        } else { wander(m, dt, md); }
      } else {
        if (m.fleeT > 0) { m.fleeT -= dt; const ln = dist || 1; m.vx = -(dx / ln) * md.speed * 1.3; m.vz = -(dz / ln) * md.speed * 1.3; m.yaw = Math.atan2(-dx, -dz); }
        else wander(m, dt, md);
        if (m.loveT > 0) { m.loveT -= dt; tryBreed(m); }
        if (m.baby) { m.growT -= dt; if (m.growT <= 0) { m.baby = 0; m.group.scale.setScalar(1); } }
      }
      // 턱 점프 / 거미 등반
      if (m.blocked && m.onGround) { m.vy = (md.climb ? 7 : 8); }
      entPhysics(m, dt);
      if (m.hurtT > 0) m.hurtT -= dt;
      if (m.y < -20 || m.hp <= 0) { if (m.hp <= 0) mobDeath(m); scene.remove(m.group); mobs.splice(i, 1); continue; }
      // 메시 갱신
      m.group.position.set(m.x, m.y, m.z); m.group.rotation.y = m.yaw;
      if (m.hurtT > 0) m.group.scale.setScalar((m.baby ? 0.5 : 1) * 1.05); else if (!m.baby) m.group.scale.setScalar(1);
    }
  }
  function wander(m, dt, md) { m.wT -= dt; if (m.wT <= 0) { m.wT = 1.5 + Math.random() * 2.5; m.wdir = Math.random() < 0.4 ? 0 : (Math.random() * Math.PI * 2); m.wmove = Math.random() < 0.6; } if (m.wmove) { m.vx = Math.sin(m.wdir) * md.speed * 0.4; m.vz = Math.cos(m.wdir) * md.speed * 0.4; m.yaw = m.wdir; } else { m.vx = 0; m.vz = 0; } }
  function creeperBoom(m) {
    const R = 3.5;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) {
      if (dx * dx + dy * dy + dz * dz > R * R) continue; const x = Math.floor(m.x) + dx, y = Math.floor(m.y) + dy, z = Math.floor(m.z) + dz;
      const id = getBlock(x, y, z); if (id !== 0 && id !== ID.bedrock && BYID[id]) setBlock(x, y, z, 0);
    }
    const pd = Math.hypot(P.x - m.x, P.y - m.y, P.z - m.z); if (pd < R + 1) hurtPlayer(Math.round(24 * (1 - pd / (R + 1))), 'creeper');
  }
  function mobDeath(m) { const md = MOB[m.type]; for (const dr of (md.drops || [])) { let cnt = dr.min + Math.floor(Math.random() * (dr.max - dr.min + 1)); if (cnt > 0) addItem(dr.i, cnt); } }
  function mobInSight(range, dotMin) {
    const d = lookDir(); let best = null, bestDot = dotMin;
    for (const m of mobs) { const vx = (m.x) - P.x, vy = (m.y + m.h / 2) - (P.y + P.eye), vz = (m.z) - P.z; const dist = Math.hypot(vx, vy, vz); if (dist > range || dist < 0.01) continue; const dot = (vx * d.x + vy * d.y + vz * d.z) / dist; if (dot > bestDot) { bestDot = dot; best = m; } }
    return best;
  }
  function mobInFront() { return mobInSight(3.6, 0.86); }
  function attackMob(m) { const held = inv[hotbar]; const it = held && window.ADV_ITEMS[held.k]; const dmg = (it && it.dmg) ? it.dmg : 1; m.hp -= dmg; m.hurtT = 0.25; const ln = Math.hypot(m.x - P.x, m.z - P.z) || 1; m.vx = (m.x - P.x) / ln * 6; m.vz = (m.z - P.z) / ln * 6; m.vy = 5; if (!MOB[m.type].hostile) m.fleeT = 6; addExhaustion(0.1); swing(); }
  // 활: 화살 소모 후 조준선상 가장 가까운 몹에 즉발 명중(투사체 물리 생략, 히트스캔으로 근사)
  function consumeArrow() { for (let i = 0; i < inv.length; i++) { const s = inv[i]; if (s && s.k === 'arrow') { s.n--; if (s.n <= 0) inv[i] = null; refreshHotbar(); scheduleSave(); return true; } } return false; }
  function shootArrow() {
    if (!consumeArrow()) { toast('화살이 없어요', false); return; }
    const m = mobInSight(24, 0.985);
    if (m) { const dmg = 5 + Math.random() * 2; m.hp -= dmg; m.hurtT = 0.25; const ln = Math.hypot(m.x - P.x, m.z - P.z) || 1; m.vx = (m.x - P.x) / ln * 4; m.vz = (m.z - P.z) / ln * 4; m.vy = 3; if (!MOB[m.type].hostile) m.fleeT = 6; }
    addExhaustion(0.1); swing();
  }
  function feedMob(m) { const s = inv[hotbar]; if (!s) return; s.n--; if (s.n <= 0) inv[hotbar] = null; refreshHotbar(); m.loveT = 30; }
  function tryBreed(m) { for (const o of mobs) { if (o !== m && o.type === m.type && o.loveT > 0 && !o.baby && Math.hypot(o.x - m.x, o.z - m.z) < 6) { addMob(m.type, m.x, m.y, m.z, true); m.loveT = 0; o.loveT = 0; toast('새끼가 태어났어요!', true); return; } } }

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
    chunks.forEach((c, k) => { if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > RENDER + 2) { disposeMesh(c.mesh); disposeMesh(c.waterMesh); disposeMesh(c.plantMesh); disposeMesh(c.lavaMesh); chunks.delete(k); } });
  }

  /* ---------------- 낮밤 ---------------- */
  function dayFactor() { const f = (world.time % cfg.dayLen) / cfg.dayLen; if (f < 0.5) { let b = 1 - Math.abs(f - 0.25) / 0.25 * 0.15; if (f < 0.06) b = 0.3 + f / 0.06 * 0.7; else if (f > 0.44) b = 0.3 + (0.5 - f) / 0.06 * 0.7; return Math.max(0.3, b); } return 0.28; }
  let _lastSkyD = -1;
  function updateSky() {
    const d = dayFactor(); const f = (world.time % cfg.dayLen) / cfg.dayLen; const day = f < 0.5;
    // 지평선 색(안개/캔버스 가장자리) — CSS 하늘과 맞춤
    const hc = day ? mixHex('#9fc6ea', '#05070d', 1 - Math.max(0.35, d)) : '#0a0e18';
    if (scene.fog) scene.fog.color.set(hc);
    // CSS 하늘 갱신(밝기 0.02 이상 변할 때만)
    if (Math.abs(d - _lastSkyD) > 0.02) {
      _lastSkyD = d; const el = document.getElementById('adv3sky'); if (el) el.style.background = skyGradient(day, d, f);
    }
    if (blockMat) blockMat.color.setScalar(d); if (waterMat) waterMat.color.setScalar(d); if (plantMat) plantMat.color.setScalar(d);
  }
  function skyGradient(day, d, f) {
    if (!day) return 'linear-gradient(#04060c 0%, #070b14 55%, #0c1320 100%)';
    const top = mixHex('#3f7fc8', '#0a1424', 1 - d), mid = mixHex('#76adde', '#0c1a2e', 1 - d), hor = mixHex('#bfe0f5', '#16283e', 1 - d);
    // 일출/일몰 노을
    const dusk = (f < 0.08 || f > 0.42);
    const horC = dusk ? mixHex('#f4a25a', hor, 0.5) : hor;
    return `linear-gradient(${top} 0%, ${mid} 55%, ${horC} 100%)`;
  }
  function mixHex(a, b, t) { t = Math.max(0, Math.min(1, t)); const ca = hx(a), cb = hx(b); const r = Math.round(ca[0] + (cb[0] - ca[0]) * t), g = Math.round(ca[1] + (cb[1] - ca[1]) * t), bl = Math.round(ca[2] + (cb[2] - ca[2]) * t); return 'rgb(' + r + ',' + g + ',' + bl + ')'; }
  function hx(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }

  /* ---------------- 루프 ---------------- */
  let lastT = 0;
  function loop(ts) {
    if (!running) return; raf = requestAnimationFrame(loop);
    if (contextLost) { lastT = ts; return; }   // GPU 컨텍스트 복구 대기(렌더 호출 시 추가 오류 방지)
    try {
      if (!lastT) lastT = ts; let dt = (ts - lastT) / 1000; lastT = ts; if (dt > 0.1) dt = 0.1;
      world.time += dt;
      streamChunks();
      if (loaded) { collide(dt); netTick(dt); processMining(dt); updateVitals(dt); updateMobs(dt); growTick(dt); }   // 로드 완료 전엔 물리 정지(지형에 박히는 버그 방지)
      // 카메라
      camera.position.set(P.x, P.y + P.eye, P.z);
      const d = lookDir(); camera.lookAt(P.x + d.x, P.y + P.eye + d.y, P.z + d.z);
      const fovTarget = P.sprinting ? 80 : 72; camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
      if (skyDome) skyDome.position.copy(camera.position);
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
      <div class="adv3-sky" id="adv3sky"></div>
      <canvas id="adv3canvas"></canvas>
      <div class="adv3-hurt" id="adv3hurt"></div>
      <div class="adv3-cross">+</div>
      <div class="adv3-top">
        <div class="adv3-vitals"><div class="adv3-armor" id="adv3armor"></div><div class="adv3-hp" id="adv3hp"></div><div class="adv3-food" id="adv3food"></div></div>
        <div class="adv3-topbtns"><button class="adv-ibtn" data-act="adv3_inv">🎒</button><button class="adv-ibtn" data-act="adv_exit">✕</button></div>
      </div>
      ${isTouch ? `<div class="adv3-jump" data-act="adv3_jump">⤒</div>` : `<div class="adv3-hint">WASD 이동 · 마우스 시점 · 좌클릭 꾹 파괴 · 우클릭 설치/사용 · 휠/숫자 핫바 · Ctrl 달리기 · E 가방</div>`}
      <img class="adv3-hand" id="adv3hand" alt="">
      <div class="adv3-itemname" id="adv3itemname"></div>
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
    for (let i = 0; i < 9; i++) { const s = inv[i]; const sel = i === hotbar ? ' is-sel' : ''; const nm = s ? esc(itemName(s.k)) : ''; h += `<button class="adv-slot${sel}" data-act="adv3_hot" data-i="${i}" title="${nm}">${s ? `<img src="${icon(s.k)}"><span class="adv-cnt">${s.n > 1 ? s.n : ''}</span>` : ''}</button>`; }
    el.innerHTML = h; updateHand();
  }
  function itemName(k) { try { return (window.advKor && window.advKor(k)) || k; } catch (e) { return k; } }
  let _nameT = null;
  function flashHeldName() {
    const el = document.getElementById('adv3itemname'); if (!el) return;
    const s = inv[hotbar]; if (!s) { el.classList.remove('show'); return; }
    el.textContent = itemName(s.k) + (s.n > 1 ? ' ×' + s.n : ''); el.classList.add('show');
    clearTimeout(_nameT); _nameT = setTimeout(() => { const e2 = document.getElementById('adv3itemname'); if (e2) e2.classList.remove('show'); }, 1800);
  }
  function updateHUD() {
    const el = document.getElementById('adv3hp'); if (!el) return;
    let s = ''; for (let i = 0; i < 10; i++) { const v = P.hp - i * 2; s += (v >= 2 ? '❤️' : v === 1 ? '💗' : '🖤'); } el.textContent = s;
    const fe = document.getElementById('adv3food'); if (fe) { let f = ''; for (let i = 0; i < 10; i++) { const v = P.hunger - i * 2; f += (v >= 2 ? '🍗' : v === 1 ? '🦴' : '▫️'); } fe.textContent = f; }
    updateArmorClass();
  }

  /* ---------------- 아이콘(블록=아이소 큐브, 아이템=2D) ---------------- */
  const iconCache = {};
  function icon(key) {
    if (iconCache[key]) return iconCache[key];
    const s = 48; const cv = document.createElement('canvas'); cv.width = cv.height = s; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    try {
      const bid = ID[key], b = bid !== undefined ? BYID[bid] : null;
      if (window.ADV_BLOCKS[key] && b && b.cross) drawCrossIcon(c, key, s);        // 십자 식물: 평면 아이콘(정육면체 X)
      else if (window.ADV_BLOCKS[key] && b && b.tex) drawCubeIcon(c, key, s);      // 일반 블록: 아이소 큐브
      else drawItemIcon2(c, key, s);
    } catch (e) { try { drawItemIcon2(c, key, s); } catch (e2) {} }
    const u = cv.toDataURL(); iconCache[key] = u; return u;
  }
  function drawCrossIcon(c, key, s) {
    const b = BYID[ID[key]]; const img = texCanvas(faceTexName(b, 'side'));
    c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, 16, 16, s * 0.06, s * 0.06, s * 0.88, s * 0.88);
  }
  const _texCanvasCache = {};
  function texCanvas(name) { if (_texCanvasCache[name]) return _texCanvasCache[name]; const cv = document.createElement('canvas'); cv.width = cv.height = 16; drawTex(cv.getContext('2d'), 0, 0, name); _texCanvasCache[name] = cv; return cv; }
  // 한 면(평행사변형)에 16×16 텍스처를 affine 변환으로 1번 매핑 + 음영(타일링 X → 반블럭처럼 안 보임)
  function isoFace(c, img, A, B, C, shade) {
    // A=원점, B=u축(가로 16px), C=v축(세로 16px) → 네번째 점 D=B+C-A
    const D = [B[0] + C[0] - A[0], B[1] + C[1] - A[1]];
    c.save();
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(D[0], D[1]); c.lineTo(C[0], C[1]); c.closePath(); c.clip();
    const ux = (B[0] - A[0]) / 16, uy = (B[1] - A[1]) / 16, vx = (C[0] - A[0]) / 16, vy = (C[1] - A[1]) / 16;
    c.imageSmoothingEnabled = false; c.setTransform(ux, uy, vx, vy, A[0], A[1]); c.drawImage(img, 0, 0, 16, 16);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (shade < 1) { c.fillStyle = 'rgba(0,0,0,' + (1 - shade).toFixed(2) + ')'; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(D[0], D[1]); c.lineTo(C[0], C[1]); c.closePath(); c.fill(); }
    c.restore();
  }
  function drawCubeIcon(c, key, s) {
    const b = BYID[ID[key]]; const top = texCanvas(faceTexName(b, 'top')), side = texCanvas(faceTexName(b, 'side'));
    const cx = s / 2, hw = s * 0.40, mh = s * 0.225, topY = s * 0.10, sideH = s * 0.40;
    // 윗면 꼭짓점(다이아몬드): Vt 위, Vr 우, Vb 아래중앙, Vl 좌
    const Vt = [cx, topY], Vr = [cx + hw, topY + mh], Vb = [cx, topY + 2 * mh], Vl = [cx - hw, topY + mh];
    // 아래로 내린 점(측면 하단)
    const Vbd = [Vb[0], Vb[1] + sideH], Vld = [Vl[0], Vl[1] + sideH], Vrd = [Vr[0], Vr[1] + sideH];
    isoFace(c, top, Vl, Vt, Vb, 1.0);     // 윗면(가장 밝게)
    isoFace(c, side, Vl, Vb, Vld, 0.80);  // 좌측면
    isoFace(c, side, Vb, Vr, Vbd, 0.60);  // 우측면(가장 어둡게)
    void Vrd;
  }
  function drawItemIcon2(c, key, s) {
    const d = window.ADV_ITEMS && window.ADV_ITEMS[key]; const u = s / 16;
    const matCol = { wood: '#9c7a44', stone: '#9a9a9a', iron: '#dcdcdc', gold: '#f7d75c', diamond: '#5decd5' };
    const armCol = { leather: '#8a5a32', gold: '#f7d75c', iron: '#cfcfcf', diamond: '#5decd5' };
    function rect(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); }
    if (d && d.tool) { const m = matCol[d.mat] || '#bbb'; rect(7, 7, 1.8, 8, '#6b4f2a'); if (d.tool === 'pickaxe') { rect(3, 4, 10, 2, m); rect(3, 4, 2, 3, m); rect(11, 4, 2, 3, m); } else if (d.tool === 'axe') { rect(8, 3, 4, 5, m); } else if (d.tool === 'shovel') { rect(7, 3, 3, 4, m); } else if (d.tool === 'sword') { rect(7.4, 2, 1.8, 9, m); rect(6, 10, 4, 1.8, '#6b4f2a'); } else rect(6, 4, 5, 6, m); return; }
    if (d && d.armor != null && d.slot) {   // 방어구: 부위별 실루엣
      const m = armCol[d.mat] || '#bbb', dk = 'rgba(0,0,0,.22)';
      if (d.slot === 'head') { rect(4, 3, 8, 5, m); rect(3, 6, 10, 2, m); rect(5, 7, 6, 2, dk); }
      else if (d.slot === 'chest') { rect(3, 3, 10, 2, m); rect(4, 4, 8, 8, m); rect(2, 4, 2, 5, m); rect(12, 4, 2, 5, m); rect(7, 5, 2, 6, dk); }
      else if (d.slot === 'legs') { rect(4, 3, 8, 3, m); rect(4, 5, 3, 9, m); rect(9, 5, 3, 9, m); rect(7, 5, 2, 8, dk); }
      else { rect(3, 7, 5, 4, m); rect(8, 7, 5, 4, m); rect(3, 11, 6, 2, m); rect(8, 11, 5, 2, m); }
      return;
    }
    if (d && d.food) { c.fillStyle = '#cc7a3a'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, 7); c.fill(); return; }
    if (d && d.shield) { c.fillStyle = '#9c7a44'; c.beginPath(); c.moveTo(8 * u, 2 * u); c.lineTo(13 * u, 3.5 * u); c.lineTo(13 * u, 9 * u); c.quadraticCurveTo(13 * u, 13 * u, 8 * u, 14.5 * u); c.quadraticCurveTo(3 * u, 13 * u, 3 * u, 9 * u); c.lineTo(3 * u, 3.5 * u); c.closePath(); c.fill(); c.fillStyle = '#dcdcdc'; c.beginPath(); c.arc(8 * u, 7.5 * u, 2.2 * u, 0, 7); c.fill(); return; }
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
    const w = document.getElementById('adv3invwrap'); if (w) w.remove(); refreshHotbar();
  }
  /* ---- 조합 레시피: 마크식 shaped(위치) + shapeless ---- */
  function trimPat(rows) {
    let r0 = 99, r1 = -1, c0 = 99, c1 = -1;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c]) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
    if (r1 < 0) return null;
    const out = []; for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(rows[r][c] || null); out.push(row); }
    return out;
  }
  // 셀 매칭: 레시피 셀(문자열 또는 태그배열)에 그리드 셀(문자열)이 부합하는가
  function cellMatch(g, p) { if (!g && !p) return true; if (!g || !p) return false; return Array.isArray(p) ? p.indexOf(g) >= 0 : g === p; }
  function patEq(a, b) { if (!a || !b || a.length !== b.length) return false; for (let r = 0; r < a.length; r++) { if (a[r].length !== b[r].length) return false; for (let c = 0; c < a[r].length; c++) if (!cellMatch(a[r][c], b[r][c])) return false; } return true; }
  function mirrorPat(p) { return p.map(row => row.slice().reverse()); }
  const PLANKS = ['oak_planks', 'birch_planks'];   // 마크 #planks 태그(아무 판자나 가능)
  let _recipes = null;
  function recipes() {
    if (_recipes) return _recipes;
    const R = [];
    const shaped = (out, count, rows, key, table) => { R.push({ out, count, table: !!table, shaped: true, pat: trimPat(rows.map(r => r.split('').map(ch => ch === ' ' ? null : key[ch]))) }); };
    const shapeless = (out, count, bag, table) => { R.push({ out, count, table: !!table, shaped: false, bag }); };
    shapeless('oak_planks', 4, { oak_log: 1 });
    shapeless('birch_planks', 4, { birch_log: 1 });
    shaped('stick', 4, ['P', 'P'], { P: PLANKS });
    shaped('crafting_table', 1, ['PP', 'PP'], { P: PLANKS });
    shaped('torch', 4, ['O', 'S'], { O: ['coal', 'charcoal'], S: 'stick' });
    shaped('chest', 1, ['PPP', 'P P', 'PPP'], { P: PLANKS }, true);
    shaped('furnace', 1, ['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, true);
    shaped('ladder', 3, ['S S', 'SSS', 'S S'], { S: 'stick' }, true);
    shaped('bowl', 4, ['P P', ' P '], { P: PLANKS }, true);
    shaped('bookshelf', 1, ['PPP', 'BBB', 'PPP'], { P: PLANKS, B: 'book' }, true);
    shaped('bricks', 1, ['BB', 'BB'], { B: 'brick_item' }, true);
    shaped('stone_bricks', 4, ['SS', 'SS'], { S: 'stone' }, true);
    shaped('bread', 1, ['WWW'], { W: 'wheat' }, true);
    shaped('cookie', 8, ['WSW'], { W: 'wheat', S: 'sugar' }, true);
    shaped('tnt', 1, ['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, true);
    shaped('bucket', 1, ['I I', ' I '], { I: 'iron_ingot' }, true);
    shaped('bow', 1, [' ST', 'S T', ' ST'], { S: 'stick', T: 'string' }, true);
    shaped('arrow', 4, ['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, true);
    shaped('shears', 1, [' I', 'I '], { I: 'iron_ingot' }, true);
    shaped('flint_and_steel', 1, ['I ', ' F'], { I: 'iron_ingot', F: 'flint' });
    shaped('glowstone', 1, ['DD', 'DD'], { D: 'glowstone_dust' }, true);
    shaped('fishing_rod', 1, ['  J', ' JT', 'J T'], { J: 'stick', T: 'string' }, true);
    shaped('bed', 1, ['WWW', 'PPP'], { W: 'wool', P: PLANKS }, true);
    shaped('paper', 3, ['UUU'], { U: 'sugar_cane' }, true);
    shapeless('book', 1, { paper: 3, leather: 1 });
    const TMAT = { wood: PLANKS, stone: 'cobblestone', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond' };
    for (const m in TMAT) { const M = TMAT[m]; const k = { M, S: 'stick' };
      shaped(m + '_pickaxe', 1, ['MMM', ' S ', ' S '], k, true);
      shaped(m + '_axe', 1, ['MM', 'MS', ' S'], k, true);
      shaped(m + '_shovel', 1, ['M', 'S', 'S'], k, true);
      shaped(m + '_sword', 1, ['M', 'M', 'S'], k, true);
      shaped(m + '_hoe', 1, ['MM', ' S', ' S'], k, true);
    }
    const AMAT = { leather: 'leather', gold: 'gold_ingot', iron: 'iron_ingot', diamond: 'diamond' };
    for (const m in AMAT) { const A = AMAT[m]; const k = { A };
      shaped(m + '_helmet', 1, ['AAA', 'A A'], k, true);
      shaped(m + '_chestplate', 1, ['A A', 'AAA', 'AAA'], k, true);
      shaped(m + '_leggings', 1, ['AAA', 'A A', 'A A'], k, true);
      shaped(m + '_boots', 1, ['A A', 'A A'], k, true);
    }
    // 저장 블록(광물 9개 ↔ 블록 1개)
    const STORE = { iron_ingot: 'iron_block', gold_ingot: 'gold_block', diamond: 'diamond_block', coal: 'coal_block', redstone: 'redstone_block', lapis: 'lapis_block', emerald: 'emerald_block' };
    for (const src in STORE) { const blk = STORE[src];
      shaped(blk, 1, ['III', 'III', 'III'], { I: src }, true);
      shapeless(src, 9, { [blk]: 1 });
    }
    shaped('gold_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }, true);
    shapeless('gold_nugget', 9, { gold_ingot: 1 });
    shaped('shield', 1, ['PIP', 'PPP', ' P '], { P: PLANKS, I: 'iron_ingot' }, true);
    shapeless('pumpkin_pie', 1, { pumpkin: 1, sugar: 1 });
    _recipes = R; return R;
  }
  function craftOutput() {
    const N = craftTable ? 3 : 2;
    const mat = []; for (let r = 0; r < N; r++) { const row = []; for (let cc = 0; cc < N; cc++) { const g = grid[r * N + cc]; row.push(g ? g.k : null); } mat.push(row); }
    const gp = trimPat(mat); if (!gp) return null;
    const bag = {}; for (let i = 0; i < N * N; i++) { const g = grid[i]; if (g) bag[g.k] = (bag[g.k] || 0) + 1; }
    const bk = Object.keys(bag);
    for (const rc of recipes()) {
      if (rc.table && !craftTable) continue;                        // 3×3 전용은 제작대 필요
      if (rc.shaped) { if (patEq(gp, rc.pat) || patEq(gp, mirrorPat(rc.pat))) return rc; }
      else { const nk = Object.keys(rc.bag); if (nk.length === bk.length && bk.every(k => rc.bag[k] !== undefined)) return rc; }   // shapeless: 정확히 그 종류들만(여분 금지)
    }
    return null;
  }
  function maxStack(k) { try { return (window.advStack && window.advStack(k)) || 64; } catch (e) { return 64; } }
  // 슬롯 종류별 접근자(인벤/제작/방어구/보조손) — 좌/우클릭 통합 로직이 사용
  function slotRef(kind, idx) {
    if (kind === 'inv') return { get: () => inv[idx], set: v => { inv[idx] = v; } };
    if (kind === 'grid') return { get: () => grid[idx], set: v => { grid[idx] = v; } };
    if (kind === 'off') return { get: () => armorEq.off, set: v => { armorEq.off = v; } };
    if (kind === 'armor') return { get: () => armorEq[idx], set: v => { armorEq[idx] = v; }, accept: k => { const d = window.advDef && window.advDef(k); return !!(d && d.slot === idx); }, max: 1 };
    return null;
  }
  // 셀 HTML(data-sk 슬롯종류, data-si 인덱스/방어구키) — 이름 툴팁 포함
  function cell(s, kind, idx, cls, placeholder) {
    const nm = s ? esc(itemName(s.k)) : '';
    const inner = s ? `<img src="${icon(s.k)}"><span class="mc-cnt">${s.n > 1 ? s.n : ''}</span>` : (placeholder ? `<span class="mc-ph">${placeholder}</span>` : '');
    return `<button class="mc-slot${cls || ''}" data-sk="${kind}" data-si="${idx}" title="${nm}">${inner}</button>`;
  }
  function renderInv() {
    const out = craftOutput();
    const cn = craftTable ? 9 : 4, cc = craftTable ? 3 : 2;
    const craftCells = []; for (let i = 0; i < cn; i++) craftCells.push(cell(grid[i], 'grid', i));
    const outCell = `<button class="mc-slot mc-out" data-sk="out" data-si="0" title="${out ? esc(itemName(out.out)) : ''}">${out ? `<img src="${icon(out.out)}"><span class="mc-cnt">${out.count > 1 ? out.count : ''}</span>` : ''}</button>`;
    const arm = ['head', 'chest', 'legs', 'feet'].map((sk, j) => cell(armorEq[sk], 'armor', sk, ' mc-arm', ['🪖', '👕', '👖', '🥾'][j]));
    const offCell = cell(armorEq.off, 'off', 0, ' mc-off', '🛡');
    const store = []; for (let i = 9; i < 36; i++) store.push(cell(inv[i], 'inv', i));
    const hot = []; for (let i = 0; i < 9; i++) hot.push(cell(inv[i], 'inv', i, ' mc-hot'));
    const carryB = carry ? `<div class="mc-carry"><img src="${icon(carry.k)}"><span>${carry.n}</span> ${esc(itemName(carry.k))}<button class="mc-drop" data-act="adv3_drop">버리기</button></div>` : '';
    const html = `<div class="mc-panel">
        <div class="mc-row1">
          <div class="mc-armor">${arm.join('')}<div class="mc-offwrap">${offCell}</div></div>
          <div class="mc-craft mc-c${cc}">${craftCells.join('')}</div>
          <div class="mc-arrow">▶</div>
          <div class="mc-outwrap">${outCell}</div>
        </div>
        <div class="mc-store">${store.join('')}</div>
        <div class="mc-hot">${hot.join('')}</div>
        ${carryB}
        <button class="mc-x" data-act="adv3_close">✕</button>
        <div class="mc-hint">${craftTable ? '제작대 3×3' : '2×2'} · 좌클릭=전체 집기/놓기·교체 · 우클릭=절반/한 개 · 방어구칸=장착</div>
      </div>`;
    let w = document.getElementById('adv3invwrap');
    if (!w) {
      w = document.createElement('div'); w.id = 'adv3invwrap'; w.className = 'mc-wrap';
      w.addEventListener('pointerdown', onInvPointer);
      w.addEventListener('contextmenu', e => e.preventDefault());   // 우클릭 메뉴 억제
      document.body.appendChild(w);
    }
    w.innerHTML = html;
  }
  function onInvPointer(e) {
    const w = document.getElementById('adv3invwrap');
    if (e.target === w) { closeInv(); return; }                       // 빈 곳 → 닫기
    const sl = e.target.closest('.mc-slot');
    if (!sl) return;                                                  // 닫기/버리기 버튼은 data-act 로 처리(전역)
    e.preventDefault(); e.stopPropagation();                          // 전역 탭 시스템 차단(좌클릭 중복 방지)
    const right = (e.button === 2) || (e.button == null && e.ctrlKey);
    slotClick(sl.dataset.sk, sl.dataset.si, right);
  }
  // 마인크래프트식 좌/우클릭 인벤 조작
  function slotClick(kind, idx, right) {
    if (kind === 'out') { takeOutput(); return; }
    if (kind === 'inv' || kind === 'grid') { /* idx는 숫자 */ idx = Number(idx); }
    const ref = slotRef(kind, idx); if (!ref) return;
    const max = ref.max || (carry ? maxStack(carry.k) : 64);
    let s = ref.get();
    if (!carry) {
      if (!s) return;
      if (right && s.n > 1) { const half = Math.ceil(s.n / 2); carry = { k: s.k, n: half }; s.n -= half; ref.set(s.n > 0 ? s : null); }
      else { carry = { k: s.k, n: s.n }; ref.set(null); }
    } else {
      if (ref.accept && !ref.accept(carry.k)) { refreshHotbar(); renderInv(); return; }   // 방어구칸: 맞는 부위만
      if (!s) {
        if (right) { ref.set({ k: carry.k, n: 1 }); carry.n--; if (carry.n <= 0) carry = null; }
        else { const put = Math.min(carry.n, max); ref.set({ k: carry.k, n: put }); carry.n -= put; if (carry.n <= 0) carry = null; }
      } else if (s.k === carry.k) {
        if (s.n < max) { const add = right ? 1 : Math.min(max - s.n, carry.n); s.n += add; carry.n -= add; if (carry.n <= 0) carry = null; }
      } else {
        if (!right && carry.n <= max) { ref.set({ k: carry.k, n: carry.n }); carry = { k: s.k, n: s.n }; }   // 교체(좌클릭)
      }
    }
    refreshHotbar(); updateArmorClass(); renderInv();
  }
  function takeOutput() {
    const rc = craftOutput(); if (!rc) return;
    if (carry && (carry.k !== rc.out || carry.n + rc.count > maxStack(rc.out))) return;   // 손에 들고 있으면 같은 종류만 누적
    const N = craftTable ? 3 : 2;
    if (rc.shaped) { for (let i = 0; i < N * N; i++) { if (grid[i]) { grid[i].n--; if (grid[i].n <= 0) grid[i] = null; } } }   // 채워진 칸마다 1개 소비
    else { for (const k in rc.bag) { let rem = rc.bag[k]; for (let i = 0; i < N * N; i++) { if (grid[i] && grid[i].k === k) { const d = Math.min(grid[i].n, rem); grid[i].n -= d; rem -= d; if (grid[i].n <= 0) grid[i] = null; } } } }
    if (carry) carry.n += rc.count; else carry = { k: rc.out, n: rc.count };
    refreshHotbar(); renderInv();
  }
  function armorPoints() { let p = 0; for (const sk of ['head', 'chest', 'legs', 'feet']) { const a = armorEq[sk]; if (a) { const d = window.advDef && window.advDef(a.k); if (d && d.armor) p += d.armor; } } return p; }
  function updateArmorClass() { const el = document.getElementById('adv3armor'); if (el) { const p = armorPoints(); el.textContent = p > 0 ? '🛡'.repeat(Math.min(10, Math.ceil(p / 2))) : ''; } }

  /* ---------------- 세이브/서버 ---------------- */
  let _saveT = 0, _dirty = false;
  function scheduleSave() { _dirty = true; }
  function pState() { return { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp, hunger: P.hunger, sat: P.sat, spawnX: P.spawnX, spawnZ: P.spawnZ }; }
  function serialize() { const ov = {}; overlay.forEach((v, k) => ov[k] = v); return { p: pState(), inv, hotbar, armor: armorEq, overlay: ov }; }
  function saveNow() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ p: pState(), inv, hotbar })); } catch (e) {} cloudSavePlayer(); _dirty = false; }
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
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { app().innerHTML = serverErr('이 기기/브라우저가 3D(WebGL)를 지원하지 않아요.'); return; }
    renderer.setPixelRatio(1);   // 저사양 성능: 픽셀비율 1 고정(고DPI에서 프래그먼트 2~4배 절감)
    renderer.setClearColor(0x000000, 0);   // 캔버스 투명 → 뒤의 CSS 하늘이 보임(소프트웨어GL에서도 안정적)
    // ★ WebGL 컨텍스트 손실 복구(저사양 기기에서 GPU 메모리 부족 시 '튕김/검은화면' 방지)
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { try { _texCanvasCache && (void 0); buildAtlas(); setupOverlays(); chunks.forEach(c => c.dirty = true); contextLost = false; } catch (err) { console.error('ctx restore', err); } }, false);
    scene = new THREE.Scene(); scene.background = null; scene.fog = new THREE.Fog(0x9fc6ea, CHUNK * (RENDER - 1), CHUNK * (RENDER + 1.5));
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);
    cfg = loadCfg(); seed = WORLD_SEED;
    try { world.time = (typeof serverNow === 'function' ? serverNow() : Date.now()) / 1000 % cfg.dayLen; } catch (e) { world.time = cfg.dayLen * 0.25; }
    const _f = world.time / cfg.dayLen; if (!(_f > 0.1 && _f < 0.45)) world.time = cfg.dayLen * 0.22;   // 첫 진입은 환한 낮 보장(마크 새월드처럼)
    buildAtlas(); setupOverlays();
    resize(); window.addEventListener('resize', resize);
    bindInput(); running = true; lastT = 0;
    (async () => {
      // 서버 월드 로드(가능하면), 아니면 로컬
      let loadedOverlay = null, hasSaved = false;
      if (cloudReady()) { const w = await cloudLoadWorld(); if (w) { loadedOverlay = w; } const pd = await cloudLoadPlayer(); if (pd) { applyPlayer(pd); hasSaved = true; } else newPlayer(); }
      else { const ls = loadLocal(); if (ls) { applyPlayer(ls); hasSaved = true; } else newPlayer(); }
      if (loadedOverlay) { for (const k in loadedOverlay) overlay.set(k, Number(loadedOverlay[k])); }
      else { const ls = loadLocal(); if (ls && ls.overlay) for (const k in ls.overlay) overlay.set(k, ls.overlay[k]); }
      findSafeSpawn(hasSaved);             // 안전 지면에 안착(지형 박힘/추락 방지)
      loaded = true;                       // 이제부터 물리 시작
      refreshHotbar(); updateHUD(); netStart();
      try { spawnInitialMobs(); } catch (e) {}   // 주변에 동물 무리 즉시 배치
      flashHeldName();
    })();
    raf = requestAnimationFrame(loop);
  }
  function applyPlayer(d) { if (d.p) { P.x = d.p.x; P.y = d.p.y; P.z = d.p.z; P.yaw = d.p.yaw || 0; P.pitch = d.p.pitch || 0; P.hp = d.p.hp || 20; P.hunger = d.p.hunger != null ? d.p.hunger : 20; P.sat = d.p.sat != null ? d.p.sat : 5; P.spawnX = d.p.spawnX; P.spawnZ = d.p.spawnZ; } if (d.inv) inv = d.inv.map(s => s ? { k: s.k, n: s.n } : null); if (d.hotbar != null) hotbar = d.hotbar; if (d.armor) { for (const sk of ['head', 'chest', 'legs', 'feet', 'off']) armorEq[sk] = d.armor[sk] ? { k: d.armor[sk].k, n: d.armor[sk].n } : null; } }
  function newPlayer() { inv = new Array(36).fill(null); armorEq = { head: null, chest: null, legs: null, feet: null, off: null }; P.x = 0.5; P.z = 0.5; P.y = surfaceH(0, 0) + 2; P.hp = 20; P.hunger = 20; P.sat = 5; P.exh = 0; P.spawnX = 0.5; P.spawnZ = 0.5; }   // 기본템 없음
  // 컬럼 최상단 고체 y (청크 생성 포함)
  function columnTop(x, z) { getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK), true); let y = WORLD_H - 2; while (y > 1 && !blockSolid(getBlock(x, y, z))) y--; return y; }
  function findSafeSpawn(hasSaved) {
    if (hasSaved) {
      const fx = Math.floor(P.x), fz = Math.floor(P.z); const top = columnTop(fx, fz);
      // 저장 위치가 지형에 박혀있거나 비정상이면 표면 위로 보정
      if (P.y < top + 1 || P.y > top + 40 || blockSolid(getBlock(fx, Math.floor(P.y + 0.1), fz)) || blockSolid(getBlock(fx, Math.floor(P.y + 1), fz))) P.y = top + 1.05;
      P.vx = P.vy = P.vz = 0; P.onGround = false; return;
    }
    // 새 캐릭터: 0,0 부근에서 '물 위가 아닌 마른 육지' 컬럼 탐색. 지면(surfaceH) 위에 안착(나무 위 X).
    let bx = 0, bz = 0, found = false;
    for (let r = 0; r < 80 && !found; r++) for (let dx = -r; dx <= r && !found; dx++) for (let dz = -r; dz <= r && !found; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const sh = surfaceH(dx, dz); if (sh <= SEA + 1) continue;       // 마른 육지만(물·해변 제외)
      getChunk(Math.floor(dx / CHUNK), Math.floor(dz / CHUNK), true);
      if (isTreeAt(dx, dz)) continue;                                 // 나무 줄기 칸 회피
      bx = dx; bz = dz; found = true;
    }
    const gy = surfaceH(bx, bz);                                      // 지면 높이(나무 무시)
    P.x = bx + 0.5; P.z = bz + 0.5; P.y = gy + 1.05; P.spawnX = P.x; P.spawnZ = P.z; P.vx = P.vy = P.vz = 0; P.onGround = false;
  }
  function resize() { if (!renderer) return; const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function serverErr(msg) { return `<section class="screen"><header class="room__top"><button class="btn btn--ghost" data-act="adv_exit">← 홈</button><b style="margin-left:6px">🗺️ 모험</b></header><div class="grow center" style="justify-content:center;text-align:center;padding:20px"><p style="white-space:pre-wrap;line-height:1.7">${esc(msg)}</p></div></section>`; }
  function stop() {
    if (!running) return; running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', resize); unbindInput();
    try { saveNow(); flushServer(); } catch (e) {}
    netStop();
    chunks.forEach(c => { disposeMesh(c.mesh); disposeMesh(c.waterMesh); disposeMesh(c.plantMesh); disposeMesh(c.lavaMesh); }); chunks.clear();
    mobs.forEach(m => { try { scene.remove(m.group); } catch (e) {} }); mobs = [];
    if (renderer) { try { renderer.dispose(); } catch (e) {} }
    if (document.exitPointerLock && document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {}
    renderer = null; scene = null; camera = null; canvas = null; invOpen = false;
  }

  /* ---------------- 액션 위임 ---------------- */
  function act(a, el) {
    switch (a) {
      case 'adv3_inv': toggleInventory(); return true;
      case 'adv3_close': closeInv(); return true;
      case 'adv3_hot': hotbar = Number(el.dataset.i); refreshHotbar(); flashHeldName(); return true;
      case 'adv3_drop': if (carry) { addItem(carry.k, carry.n); carry = null; renderInv(); } return true;
      case 'adv3_jump': keys.Space = true; setTimeout(() => keys.Space = false, 120); return true;
    }
    return false;
  }

  /* ---------------- 공개 API ---------------- */
  if (typeof window !== 'undefined' && window.__ADV3_TEST) window.__adv3 = {
    addMob, P, mobs: () => mobs, hurtPlayer, eatFood, MOB, getBlock, genBlock, surfaceH, ID, BYID, blockSolid,
    chunkInfo: () => ({ n: chunks.size, meshed: Array.from(chunks.values()).filter(c => c.mesh).length, loaded }),
    // 인벤/장비 검증용
    icon, drawCubeIcon, openInventory, closeInv, renderInv, slotClick, takeOutput, armorPoints, craftOutput,
    inv: () => inv, grid: () => grid, armor: () => armorEq, carry: () => carry,
    setInv: (i, v) => { inv[i] = v; }, setGrid: (i, v) => { grid[i] = v; }, setCarry: v => { carry = v; },
    setCraftTable: v => { craftTable = v; craftN = v ? 9 : 4; },
    setBlock, breakBlock, BLOCKS, icon2: icon, biome,
    chunks: () => chunks, scene: () => scene, texCanvas,
    placeOrUse, raycast, growTick, overlay: () => overlay, isHydrated,
    hotbar: () => hotbar, setHotbar: v => { hotbar = v; },
  };
  window.adventure3dStart = start;
  window.adventure3dStop = stop;
  window.adventure3dRunning = function () { return running; };
  window.adventure3dAct = function (a, el) { if (a.indexOf('adv3_') === 0) return act(a, el); return false; };
  setInterval(() => { if (running) updateHUD(); }, 500);
})();
