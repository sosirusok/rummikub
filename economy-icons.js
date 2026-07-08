/* =========================================================================
   economy-icons.js — 경제 탭 아이템 전용 아이콘(40×40 절차적 픽셀아트)
   window.econIcon(key) → dataURL. 카테고리별 전용 도안(검/활/지팡이/갑옷/반지/북/알/도구/자원…)
   + 티어 색상 테두리·광채. 외부 스프라이트 시트(assets/econ_items.png + ECON_SPRITE_MAP)가
   로드되어 있으면 해당 셀을 우선 사용(추후 고품질 이미지 교체 대비 훅).
   ========================================================================= */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const cache = {};
  const S = 40;
  const USE_SPRITE_SHEET = false;

  function D() { return window.ECON_DATA || {}; }
  function tierColor(tierKey) {
    const t = (D().ITEM_TIERS || []).find(x => x.key === tierKey);
    return t ? t.colorHex : '#9aa2ad';
  }
  // 자원 키 → 대표 색
  const RES_COLORS = {
    stone: '#8c8c8c', coal: '#26262a', iron: '#d8a282', gold: '#fbdb4b', lapis: '#1f4fc0', redstone: '#c81f28',
    diamond: '#5decd5', emerald: '#1fbf5c', obsidian: '#2a2040',
    wheat: '#e8c24a', carrot: '#e07b1f', potato: '#c8a25a', pumpkin: '#d6791f', melon: '#4c8f46', sugarcane: '#8fc36a',
    oaklog: '#8a6a3a', birchlog: '#d7d3c8', sprucelog: '#4a3722', dark_oak_log: '#3d2517', jungle_log: '#7b5b2c', acacia_log: '#b06a36', apple: '#d23b32',
    oak_planks: '#b8874b', birch_planks: '#d8c88a', spruce_planks: '#6b4a2a', dark_oak_planks: '#4b2f1d', jungle_planks: '#a98245', acacia_planks: '#b86c38',
    crafting_table: '#9c6b35', furnace: '#777777', chest: '#a66a2c', torch: '#f0b040',
    rawfish: '#7aa5c8', salmon: '#e0806a', clownfish: '#f0983a', pufferfish: '#e8d24a', prismarine: '#66c2b4',
    sponge: '#d8cf62', clay: '#a4a8b6',
    rotten_flesh: '#8a5a3a', bone: '#e8e4d4', string: '#e4e4e4', ender_pearl: '#1f8a7a', blaze_rod: '#f0a03a',
    dungeon_essence: '#b06ae8',
  };

  function findShop(key) { return (D().SHOP || []).find(s => s.key === key); }

  // 외부 스프라이트 시트(assets/econ_items.png) — 있으면 자동 활성화, 없으면 절차 생성 아이콘 폴백.
  // 현재 시트: 마크 픽셀풍 9열×6행(사용자 제공 이미지의 실제 배치에 맞춰 매핑).
  // 실제 스카이블럭 방식대로 "같은 등급 = 같은 외형"이라 이름만 다른 무기(AOTE/미다스/AOTD/히페리온 등)는 등급 셀을 공유.
  const SPRITE_COLS = 9, SPRITE_ROWS = 6;
  const SPRITE_CELLS = {
    // 1행: 검 9자루(0~3: 일반~희귀 계열, 4:영웅 보라, 5:전설 금, 6:신화 마젠타, 7:고대 청록, 8:흑암=네크론)
    weapon_common: [0, 0], weapon_uncommon: [1, 0], weapon_rare: [3, 0], weapon_epic: [4, 0], weapon_legendary: [5, 0], weapon_mythic: [6, 0], weapon_ancient: [7, 0], necron_blade: [8, 0],
    aspect_of_the_end: [3, 0], livid_dagger: [5, 0], midas_sword: [5, 0], aspect_of_the_dragons: [5, 0], giant_sword: [6, 0], hyperion: [6, 0],
    // 2행: 활 9개(같은 색 순서)
    bow_common: [0, 1], bow_uncommon: [2, 1], bow_rare: [3, 1], bow_epic: [4, 1], bow_legendary: [5, 1], bow_mythic: [6, 1], bow_ancient: [7, 1], spirit_bow: [8, 1],
    // 3행: 흉갑 7개(0~6) + 특수 지팡이 2(7:광대=본조, 8:흑암 지팡이)
    armor_common: [0, 2], armor_uncommon: [1, 2], armor_rare: [3, 2], armor_epic: [4, 2], armor_legendary: [5, 2], armor_mythic: [6, 2], armor_ancient: [6, 2],
    adaptive_armor: [3, 2], shadow_assassin_armor: [4, 2], bonzo_staff: [7, 2],
    // 4행: 지팡이/메이스 9개
    staff_common: [0, 3], staff_uncommon: [1, 3], staff_rare: [3, 3], staff_epic: [4, 3], staff_legendary: [5, 3], staff_mythic: [5, 3], staff_ancient: [6, 3],
    // 5행: 곡괭이 5(0~4) + 망치/도끼(5) + 낚싯대(6,7) + 흑암 갑주(8=위더)
    wooden_pickaxe: [0, 4], stone_pickaxe: [1, 4], iron_pickaxe: [2, 4], diamond_pickaxe: [3, 4], ancient_pickaxe: [3, 4],
    iron_axe: [5, 4], wooden_axe: [5, 4], stone_axe: [5, 4], diamond_axe: [5, 4], ancient_axe: [5, 4],
    iron_hoe: [5, 4], wooden_hoe: [5, 4], stone_hoe: [5, 4], diamond_hoe: [5, 4], ancient_hoe: [5, 4],
    fishing_rod: [6, 4], stone_rod: [6, 4], iron_rod: [7, 4], diamond_rod: [7, 4], ancient_rod: [7, 4],
    // golden_* 도구는 시트 셀 미지정 — 금색 드로잉 아이콘으로 렌더(철 스프라이트 오인 방지)
    wither_armor: [8, 4],
    // 6행: 인챈트북/금덩이/알/스티브 미니언/반지/심장/요정/주머니/물약
    enchant_book: [0, 5], reforge_stone: [1, 5], pet_egg: [2, 5], minion_item: [3, 5], talisman: [4, 5], talisman_dragon_heart: [5, 5], fairy_soul: [6, 5], minion_fuel_coal: [7, 5], dungeon_essence: [8, 5],
    essence_reforge_stone: [1, 5], minion_slot_expander: [3, 5], auto_shipping_module: [3, 5], diamond_spreading: [3, 5], skin_diamond_steve: [3, 5],
  };
  function spriteCellFor(key) {
    if (SPRITE_CELLS[key]) return SPRITE_CELLS[key];
    if (/^enchant_book_/.test(key)) return SPRITE_CELLS.enchant_book;
    if (/^pet_egg_/.test(key)) return SPRITE_CELLS.pet_egg;
    if (key === 'talisman_dragon_heart') return SPRITE_CELLS.talisman_dragon_heart;
    if (/^talisman_/.test(key)) return SPRITE_CELLS.talisman;
    if (key === 'dungeon_essence') return SPRITE_CELLS.dungeon_essence;
    return null;
  }
  let sheet = null, sheetReady = false, sheetTried = false;
  function trySheet() {
    if (sheetTried) return;
    sheetTried = true;
    sheet = new Image();
    sheet.onload = () => { sheetReady = true; for (const k in cache) delete cache[k]; };
    sheet.onerror = () => { sheet = null; };   // 시트 없음 → 절차 생성 아이콘 폴백
    sheet.src = 'assets/econ_items.png';
  }
  trySheet();

  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function shade(hex, f) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((n >> 16) & 255) * f) | 0, g = Math.min(255, ((n >> 8) & 255) * f) | 0, b = Math.min(255, (n & 255) * f) | 0;
    return `rgb(${r},${g},${b})`;
  }

  /* ---- 도안들(중앙 40×40 캔버스, 픽셀 스케일 2) ---- */
  function drawSword(c, col) {
    c.save(); c.translate(20, 20); c.rotate(-Math.PI / 4);
    px(c, -2, -14, 4, 20, col); px(c, -1, -14, 1, 20, shade(col, 1.4));       // 검신+하이라이트
    px(c, -6, 6, 12, 3, '#6b5436'); px(c, -2, 9, 4, 7, '#4a3720');           // 가드+손잡이
    px(c, -3, 15, 6, 3, '#d8b23a');                                           // 폼멜
    c.restore();
  }
  function drawBow(c, col) {
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(16, 20, 12, -Math.PI / 2.6, Math.PI / 2.6); c.stroke();
    c.strokeStyle = '#e4e4e4'; c.lineWidth = 1; c.beginPath(); c.moveTo(21, 9); c.lineTo(21, 31); c.stroke();
    px(c, 20, 18, 12, 2, '#8a6a3a'); px(c, 30, 17, 3, 4, '#c8c8c8');          // 화살
  }
  function drawStaff(c, col) {
    c.save(); c.translate(20, 22); c.rotate(Math.PI / 8);
    px(c, -2, -10, 4, 24, '#6b5436');
    c.restore();
    c.fillStyle = col; c.beginPath(); c.arc(23, 9, 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(col, 1.5); c.beginPath(); c.arc(21.5, 7.5, 2, 0, Math.PI * 2); c.fill();
  }
  function drawArmor(c, col) {
    px(c, 12, 8, 16, 6, col); px(c, 8, 10, 6, 10, shade(col, 0.8)); px(c, 26, 10, 6, 10, shade(col, 0.8));   // 어깨
    px(c, 12, 14, 16, 16, shade(col, 0.95)); px(c, 14, 16, 5, 6, shade(col, 1.25));                          // 몸통+광
    px(c, 18, 8, 4, 3, '#20242c');                                                                            // 목선
  }
  function drawHelmet(c, col) {   // V11: 투구 — 돔 + 챙
    c.fillStyle = col; c.beginPath(); c.arc(20, 20, 10, Math.PI, 0); c.fill();
    c.fillRect(10, 20, 20, 4);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(13, 16, 14, 3);
  }
  function drawLeggings(c, col) {   // V11: 레깅스 — 허리 + 두 다리
    c.fillStyle = col; c.fillRect(12, 10, 16, 6);
    c.fillRect(12, 16, 6, 14); c.fillRect(22, 16, 6, 14);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(12, 14, 16, 2);
  }
  function drawBoots(c, col) {   // V11: 부츠 — 두 짝
    c.fillStyle = col;
    c.fillRect(9, 14, 7, 10); c.fillRect(9, 24, 11, 5);
    c.fillRect(24, 14, 7, 10); c.fillRect(24, 24, 11, 5);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(9, 14, 7, 2); c.fillRect(24, 14, 7, 2);
  }
  function drawRing(c, col) {
    c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(20, 23, 9, 0, Math.PI * 2); c.stroke();
    px(c, 16, 8, 8, 8, shade(col, 1.3)); px(c, 18, 10, 3, 3, '#ffffff');       // 보석
  }
  function drawBook(c, col) {
    px(c, 8, 10, 24, 22, '#6b4f2e'); px(c, 10, 12, 20, 18, col);
    px(c, 19, 10, 2, 22, shade(col, 0.6));
    px(c, 12, 15, 6, 2, '#fff'); px(c, 12, 19, 6, 2, '#fff');                  // 룬 줄
    px(c, 23, 15, 5, 2, '#fff'); px(c, 23, 19, 5, 2, '#fff');
  }
  function drawEgg(c, col) {
    c.fillStyle = col; c.beginPath(); c.ellipse(20, 22, 10, 13, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(col, 1.3); c.beginPath(); c.ellipse(17, 17, 3.5, 5, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(col, 0.75);
    for (let i = 0; i < 4; i++) { c.fillRect(13 + i * 5, 26 + (i % 2) * 3, 3, 3); }   // 반점
  }
  function drawPickaxe(c, col) {
    c.save(); c.translate(20, 20); c.rotate(-Math.PI / 4);
    px(c, -2, -4, 4, 20, '#8a6a3a');
    c.fillStyle = col; c.beginPath(); c.moveTo(-12, -4); c.quadraticCurveTo(0, -14, 12, -4); c.lineTo(12, 0); c.quadraticCurveTo(0, -9, -12, 0); c.fill();
    c.restore();
  }
  function drawAxe(c, col) {
    c.save(); c.translate(20, 20); c.rotate(-Math.PI / 5);
    px(c, -2, -6, 4, 22, '#8a6a3a');
    c.fillStyle = col; c.beginPath(); c.moveTo(2, -12); c.quadraticCurveTo(14, -8, 10, 2); c.lineTo(2, -1); c.fill();
    c.restore();
  }
  function drawHoe(c, col) {
    c.save(); c.translate(20, 20); c.rotate(-Math.PI / 5);
    px(c, -2, -6, 4, 22, '#8a6a3a');
    px(c, -2, -10, 12, 4, col);
    c.restore();
  }
  function drawRod(c, col) {
    c.save(); c.translate(20, 22); c.rotate(Math.PI / 5);
    px(c, -1, -16, 3, 26, '#8a6a3a');
    c.restore();
    c.strokeStyle = '#dfe6ee'; c.lineWidth = 1; c.beginPath(); c.moveTo(30, 8); c.quadraticCurveTo(33, 18, 27, 26); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(27, 28, 3, 0, Math.PI * 2); c.fill();
  }
  function drawCube(c, col) {
    // 아이소 큐브(자원)
    const top = shade(col, 1.25), left = shade(col, 0.8), right = shade(col, 0.6);
    c.fillStyle = top; c.beginPath(); c.moveTo(20, 8); c.lineTo(32, 15); c.lineTo(20, 22); c.lineTo(8, 15); c.fill();
    c.fillStyle = left; c.beginPath(); c.moveTo(8, 15); c.lineTo(20, 22); c.lineTo(20, 34); c.lineTo(8, 27); c.fill();
    c.fillStyle = right; c.beginPath(); c.moveTo(32, 15); c.lineTo(20, 22); c.lineTo(20, 34); c.lineTo(32, 27); c.fill();
  }
  function drawIsoLine(c, pts, col) {
    c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  }
  function drawBlock(c, key, col) {
    drawCube(c, col);
    const dark = shade(col, 0.45), light = shade(col, 1.45);
    if (/log$|log_/.test(key) || /^(oaklog|birchlog|sprucelog)$/.test(key)) {
      c.strokeStyle = dark; c.lineWidth = 1;
      c.beginPath(); c.ellipse(20, 15, 6, 3.4, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(20, 15, 3, 1.7, 0, 0, Math.PI * 2); c.stroke();
      [12, 16, 24, 28].forEach(x => drawIsoLine(c, [[x, 18], [x - 1, 28]], dark));
      return;
    }
    if (/planks|trapdoor|door|fence/.test(key)) {
      [[11, 17], [15, 19], [24, 19], [29, 17]].forEach(p => c.fillRect(p[0], p[1], 5, 1));
      drawIsoLine(c, [[10, 22], [19, 27]], dark);
      drawIsoLine(c, [[22, 24], [30, 19]], dark);
      drawIsoLine(c, [[20, 23], [20, 33]], dark);
      return;
    }
    if (/ore|coal|iron|gold|lapis|redstone|diamond|emerald/.test(key)) {
      const ore = key.indexOf('coal') >= 0 ? '#1c1c1f' : key.indexOf('iron') >= 0 ? '#e0b08a' : key.indexOf('gold') >= 0 ? '#ffd84d' : key.indexOf('lapis') >= 0 ? '#234ec8' : key.indexOf('redstone') >= 0 ? '#e63232' : key.indexOf('diamond') >= 0 ? '#78fff2' : key.indexOf('emerald') >= 0 ? '#35e36f' : light;
      [[18, 12], [12, 20], [25, 18], [15, 27], [27, 26]].forEach(p => { c.fillStyle = ore; c.fillRect(p[0], p[1], 3, 3); });
      return;
    }
    if (key === 'crafting_table') {
      c.strokeStyle = dark; c.lineWidth = 1; c.strokeRect(15.5, 12.5, 9, 6);
      c.fillStyle = '#d0aa58'; c.fillRect(18, 14, 4, 3);
      drawIsoLine(c, [[10, 23], [19, 28]], dark); drawIsoLine(c, [[23, 23], [30, 18]], dark);
      return;
    }
    if (key === 'furnace') {
      c.fillStyle = '#202020'; c.fillRect(15, 15, 10, 6);
      c.fillStyle = '#e8632a'; c.fillRect(17, 21, 6, 2);
      return;
    }
    if (key === 'chest') {
      c.strokeStyle = '#5a3416'; c.lineWidth = 1; c.strokeRect(13.5, 15.5, 13, 9);
      c.fillStyle = '#d9b64a'; c.fillRect(19, 19, 3, 4);
      return;
    }
    if (/glass/.test(key)) {
      drawIsoLine(c, [[14, 13], [20, 10], [26, 13]], '#eaffff');
      drawIsoLine(c, [[11, 21], [18, 25]], '#eaffff');
      drawIsoLine(c, [[23, 25], [30, 21]], '#eaffff');
      return;
    }
    if (/wool_/.test(key)) {
      drawIsoLine(c, [[12, 16], [17, 14], [22, 16], [27, 14]], dark);
      drawIsoLine(c, [[11, 24], [16, 26], [20, 24]], dark);
      drawIsoLine(c, [[23, 24], [28, 22], [31, 24]], dark);
      return;
    }
    if (/brick/.test(key)) {
      drawIsoLine(c, [[12, 16], [28, 16]], dark);
      drawIsoLine(c, [[10, 23], [20, 28]], dark);
      drawIsoLine(c, [[21, 27], [31, 22]], dark);
      [15, 23, 27].forEach(x => drawIsoLine(c, [[x, 13], [x + 3, 15]], dark));
      return;
    }
    if (/sandstone|quartz|purpur|smooth_stone|prismarine|concrete_|terracotta_|stone|cobblestone|obsidian|dirt|sand|gravel|hay_block|bookshelf/.test(key)) {
      drawIsoLine(c, [[11, 17], [20, 22], [29, 17]], dark);
      c.fillStyle = light; c.globalAlpha = 0.5; c.fillRect(14, 12, 3, 2); c.fillRect(24, 21, 3, 2); c.globalAlpha = 1;
    }
  }
  function isBlockLike(key) {
    return /(_planks|_log|log$|_ore|stone|cobblestone|dirt|grass|sand|sandstone|brick|glass|obsidian|wool_|concrete_|terracotta_|leaves|crafting_table|furnace|chest|torch|slab|stairs|fence|trapdoor|door|hay_block|bookshelf|prismarine|quartz|purpur|mossy|andesite|gravel)/.test(key);
  }
  function drawGear(c, col) {
    c.fillStyle = col;
    for (let i = 0; i < 8; i++) { c.save(); c.translate(20, 20); c.rotate(i * Math.PI / 4); c.fillRect(-2.5, -14, 5, 7); c.restore(); }
    c.beginPath(); c.arc(20, 20, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#20242c'; c.beginPath(); c.arc(20, 20, 4, 0, Math.PI * 2); c.fill();
  }
  function drawPortal(c, col) {
    c.save();
    c.translate(20, 20);
    c.strokeStyle = '#2a2040';
    c.lineWidth = 6;
    c.beginPath();
    c.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2);
    c.stroke();
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 15);
    g.addColorStop(0, shade(col, 1.45));
    g.addColorStop(0.55, col);
    g.addColorStop(1, '#201030');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = '#d8c8ff';
    [[14, 10], [26, 13], [12, 28], [29, 26]].forEach(p => c.fillRect(p[0], p[1], 2, 2));
  }
  function drawStone(c, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(12, 28); c.lineTo(10, 18); c.lineTo(18, 10); c.lineTo(28, 13); c.lineTo(30, 24); c.lineTo(22, 31); c.fill();
    c.fillStyle = shade(col, 1.3); c.fillRect(16, 15, 5, 4);
  }
  function drawFlame(c) {
    c.fillStyle = '#e8632a'; c.beginPath(); c.moveTo(20, 6); c.quadraticCurveTo(31, 16, 26, 27); c.quadraticCurveTo(24, 33, 20, 34); c.quadraticCurveTo(16, 33, 14, 27); c.quadraticCurveTo(9, 16, 20, 6); c.fill();
    c.fillStyle = '#f7a02a'; c.beginPath(); c.moveTo(20, 14); c.quadraticCurveTo(26, 21, 22, 29); c.quadraticCurveTo(20, 31, 18, 29); c.quadraticCurveTo(14, 21, 20, 14); c.fill();
    c.fillStyle = '#ffe28a'; c.beginPath(); c.arc(20, 27, 3, 0, Math.PI * 2); c.fill();
  }
  function drawTorch(c) {
    c.save(); c.translate(20, 22); c.rotate(Math.PI / 7);
    px(c, -2, -1, 4, 15, '#7a4a22');
    px(c, -3, -5, 6, 5, '#3b2412');
    c.restore();
    c.fillStyle = '#e8632a'; c.beginPath(); c.moveTo(20, 5); c.quadraticCurveTo(28, 13, 23, 21); c.quadraticCurveTo(20, 24, 17, 21); c.quadraticCurveTo(12, 13, 20, 5); c.fill();
    c.fillStyle = '#ffd85a'; c.beginPath(); c.moveTo(20, 10); c.quadraticCurveTo(24, 15, 21, 20); c.quadraticCurveTo(19, 21, 18, 19); c.quadraticCurveTo(16, 15, 20, 10); c.fill();
  }
  function drawCape(c, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(12, 8); c.lineTo(28, 8); c.lineTo(30, 32); c.lineTo(24, 28); c.lineTo(20, 33); c.lineTo(16, 28); c.lineTo(10, 32); c.fill();
    px(c, 12, 8, 16, 3, shade(col, 1.3));
  }
  function drawFish(c, col) {
    c.fillStyle = col; c.beginPath(); c.ellipse(18, 20, 10, 6, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(27, 20); c.lineTo(33, 14); c.lineTo(33, 26); c.fill();
    c.fillStyle = '#101820'; c.beginPath(); c.arc(13, 18, 1.5, 0, Math.PI * 2); c.fill();
  }
  function drawSkin(c) {
    px(c, 12, 8, 16, 16, '#5decd5'); px(c, 12, 8, 16, 4, '#3a2a1a');
    px(c, 15, 14, 3, 3, '#20242c'); px(c, 22, 14, 3, 3, '#20242c'); px(c, 17, 20, 6, 2, '#7a5a4a');
  }

  function categoryOf(key) {
    if (/^sw_/.test(key)) return 'sword';        // V11: 신규 검 400종
    if (/^bw_/.test(key)) return 'bow';          // V11: 신규 활 200종
    if (/^hm_/.test(key)) return 'helmet';       // V11: 투구
    if (/^lg_/.test(key)) return 'leggings';     // V11: 레깅스
    if (/^bt_/.test(key)) return 'boots';        // V11: 부츠
    if (/^ch_/.test(key)) return 'armor';        // V11: 흉갑
    if (/^(hot|fuming)_potato_book$/.test(key)) return 'book';
    if (/^(weapon|bow_|staff_)|_(sword|blade|dagger)$|bonzo_staff|spirit_bow|livid_dagger|giant_sword|necron_blade/.test(key)) {
      if (/^bow_|spirit_bow/.test(key)) return 'bow';
      if (/^staff_|bonzo_staff/.test(key)) return 'staff';
      return 'sword';
    }
    if (/^armor_|adaptive_armor|shadow_assassin_armor|wither_armor/.test(key)) return 'armor';
    if (/^talisman_/.test(key)) return 'ring';
    if (/^enchant_book_/.test(key)) return 'book';
    if (/^pet_egg_/.test(key)) return 'egg';
    if (/pickaxe/.test(key)) return 'pickaxe';
    if (/axe$/.test(key)) return 'axe';
    if (/hoe$/.test(key)) return 'hoe';
    if (/rod$/.test(key)) return 'rod';
    if (/^reforge_stone|essence_reforge_stone/.test(key)) return 'stone';
    if (/^minion_fuel/.test(key)) return 'flame';
    if (/^(minion_slot_expander|auto_shipping_module|diamond_spreading)$/.test(key)) return 'gear';
    if (/^portal_/.test(key)) return 'portal';
    if (key === 'torch') return 'torch';
    if (/cape/.test(key)) return 'cape';
    if (/^(rawfish|salmon|clownfish|pufferfish|fish_insomnia)$/.test(key)) return 'fish';
    if (/^skin_/.test(key)) return 'skin';
    if (isBlockLike(key)) return 'block';
    if (/^enchanted_/.test(key)) return 'cube';
    return 'cube';
  }
  let _dyeCol = null;
  function dyeColorOf(key) {   // V15: 양털/콘크리트/테라코타 16색 + 장식 블럭 → 아이콘 색
    if (!_dyeCol) {
      _dyeCol = { smooth_stone: '#9a9a9a', polished_andesite: '#a2a4a2', chiseled_stone_bricks: '#7b7b7b', mossy_cobblestone: '#6a7a52', prismarine: '#66c2b4', bookshelf: '#b08a4f', hay_block: '#c8a83a' };
      ((D().DYES) || []).forEach(d => { _dyeCol['wool_' + d.k] = d.hex; _dyeCol['concrete_' + d.k] = d.hex; _dyeCol['terracotta_' + d.k] = d.hex; });
    }
    return _dyeCol[key] || null;
  }
  function baseColorOf(key, cat) {
    const shop = findShop(key);
    if (shop && shop.tierKey) return tierColor(shop.tierKey);
    const dc = dyeColorOf(key); if (dc) return dc;
    const rk = key.replace(/^enchanted_/, '');
    if (RES_COLORS[rk]) return RES_COLORS[rk];
    if (cat === 'book') return '#9365b8';
    if (cat === 'stone') return '#c9a227';
    if (cat === 'gear') return '#8c98a8';
    if (cat === 'portal') return '#8f63ff';
    if (/^(wooden)/.test(key)) return '#9c7a44';
    if (/^stone_/.test(key)) return '#8c8c8c';
    if (/^iron_/.test(key)) return '#d8d8d4';
    if (/^golden_/.test(key)) return '#f7d84a';
    if (/^diamond_/.test(key)) return '#5decd5';
    if (/^ancient_/.test(key)) return '#5decd5';
    return '#9aa2ad';
  }

  function econIcon(key) {
    if (cache[key]) return cache[key];
    trySheet();
    // V21-B: 블럭 아이템은 월드와 '같은 텍스처'의 등축 큐브 아이콘 우선 — 인벤토리에서 실제 생김새로 구분
    if (typeof window.econBlockIcon === 'function') {
      try { const bi = window.econBlockIcon(key); if (bi) return (cache[key] = bi); } catch (e) {}
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return '';
    // 외부 시트 우선(8×6 그리드에서 해당 셀을 잘라 사용 — 셀 크기는 이미지 실제 크기에서 자동 계산)
    const cell = spriteCellFor(key);
    if (USE_SPRITE_SHEET && sheetReady && cell) {
      const cw = sheet.width / SPRITE_COLS, ch = sheet.height / SPRITE_ROWS;
      const pad = Math.round(Math.min(cw, ch) * 0.04);   // 셀 가장자리 여백(이웃 셀 침범 방지)
      c.imageSmoothingEnabled = true;
      c.drawImage(sheet, cell[0] * cw + pad, cell[1] * ch + pad, cw - pad * 2, ch - pad * 2, 0, 0, S, S);
      // V21-B: 시트의 체커/흰 배경 제거(크로마키) — 아이템이 배경 없이 중앙에 깔끔히
      try {
        const img = c.getImageData(0, 0, S, S), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const grayish = Math.abs(r - g) < 14 && Math.abs(g - b) < 14 && Math.abs(r - b) < 14;
          if (grayish && r > 170) d[i + 3] = 0;   // 흰/밝은 회색 체커 → 투명
        }
        c.putImageData(img, 0, 0);
      } catch (e) {}
      return (cache[key] = cv.toDataURL());
    }
    const cat = categoryOf(key);
    const col = baseColorOf(key, cat);
    const shop = findShop(key);
    // 티어 배경 광채 + 슬롯 테두리
    const tc = shop && shop.tierKey ? tierColor(shop.tierKey) : null;
    if (tc) {
      const g = c.createRadialGradient(20, 20, 4, 20, 20, 20);
      g.addColorStop(0, tc + '55'); g.addColorStop(1, 'transparent');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
    c.strokeStyle = tc || 'rgba(255,255,255,0.22)'; c.lineWidth = 2;
    c.strokeRect(1, 1, S - 2, S - 2);
    switch (cat) {
      case 'sword': drawSword(c, col); break;
      case 'bow': drawBow(c, col); break;
      case 'staff': drawStaff(c, col); break;
      case 'armor': drawArmor(c, col); break;
      case 'helmet': drawHelmet(c, col); break;
      case 'leggings': drawLeggings(c, col); break;
      case 'boots': drawBoots(c, col); break;
      case 'ring': drawRing(c, col); break;
      case 'book': drawBook(c, col); break;
      case 'egg': drawEgg(c, col); break;
      case 'pickaxe': drawPickaxe(c, col); break;
      case 'axe': drawAxe(c, col); break;
      case 'hoe': drawHoe(c, col); break;
      case 'rod': drawRod(c, col); break;
      case 'stone': drawStone(c, col); break;
      case 'flame': drawFlame(c); break;
      case 'torch': drawTorch(c); break;
      case 'gear': drawGear(c, col); break;
      case 'portal': drawPortal(c, col); break;
      case 'cape': drawCape(c, '#9365b8'); break;
      case 'fish': drawFish(c, col); break;
      case 'skin': drawSkin(c); break;
      case 'block': drawBlock(c, key, col); break;
      default: drawCube(c, col); break;
    }
    // 인챈티드 자원은 보라 반짝이 오버레이
    if (/^enchanted_/.test(key)) {
      c.fillStyle = 'rgba(190,120,255,0.28)'; c.fillRect(2, 2, S - 4, S - 4);
      c.fillStyle = '#e8c8ff';
      [[9, 9], [30, 12], [12, 30], [28, 28]].forEach(p => { c.fillRect(p[0], p[1], 2, 2); });
    }
    return (cache[key] = cv.toDataURL());
  }

  window.econIcon = econIcon;
})();
