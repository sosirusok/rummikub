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
    oaklog: '#8a6a3a', birchlog: '#d7d3c8', sprucelog: '#4a3722', apple: '#d23b32',
    rawfish: '#7aa5c8', salmon: '#e0806a', clownfish: '#f0983a', pufferfish: '#e8d24a', prismarine: '#66c2b4',
    sponge: '#d8cf62', clay: '#a4a8b6',
    rotten_flesh: '#8a5a3a', bone: '#e8e4d4', string: '#e4e4e4', ender_pearl: '#1f8a7a', blaze_rod: '#f0a03a',
    dungeon_essence: '#b06ae8',
  };

  function findShop(key) { return (D().SHOP || []).find(s => s.key === key); }

  // 외부 스프라이트 시트(assets/econ_items.png, 8열×6행 고정 그리드) — 있으면 자동 활성화, 없으면 절차 생성 아이콘 폴백
  const SPRITE_COLS = 8, SPRITE_ROWS = 6;
  // 셀 좌표 [col,row] — 이미지 생성 프롬프트의 번호 순서(1번=0,0 … 48번=7,5)와 1:1
  const SPRITE_CELLS = {
    weapon_common: [0, 0], weapon_uncommon: [1, 0], weapon_rare: [2, 0], weapon_epic: [3, 0], weapon_legendary: [4, 0], weapon_mythic: [5, 0], weapon_ancient: [6, 0], necron_blade: [7, 0],
    bow_common: [0, 1], bow_uncommon: [1, 1], bow_rare: [2, 1], bow_epic: [3, 1], bow_legendary: [4, 1], bow_mythic: [5, 1], bow_ancient: [6, 1], spirit_bow: [7, 1],
    staff_common: [0, 2], staff_uncommon: [1, 2], staff_rare: [2, 2], staff_epic: [3, 2], staff_legendary: [4, 2], staff_mythic: [5, 2], staff_ancient: [6, 2], bonzo_staff: [7, 2],
    armor_common: [0, 3], armor_uncommon: [1, 3], armor_rare: [2, 3], armor_epic: [3, 3], armor_legendary: [4, 3], armor_mythic: [5, 3], armor_ancient: [6, 3], wither_armor: [7, 3],
    wooden_pickaxe: [0, 4], iron_pickaxe: [1, 4], diamond_pickaxe: [2, 4], ancient_pickaxe: [3, 4], iron_axe: [4, 4], iron_hoe: [5, 4], fishing_rod: [6, 4], livid_dagger: [7, 4],
    enchant_book: [0, 5], reforge_stone: [1, 5], pet_egg: [2, 5], minion_item: [3, 5], talisman: [4, 5], talisman_dragon_heart: [5, 5], fairy_soul: [6, 5], dungeon_essence: [7, 5],
    // 유사 아이템 별칭(같은 도상 공유)
    giant_sword: [5, 0], adaptive_armor: [2, 3], shadow_assassin_armor: [3, 3],
    stone_pickaxe: [1, 4], wooden_axe: [4, 4], stone_axe: [4, 4], diamond_axe: [4, 4], ancient_axe: [4, 4],
    wooden_hoe: [5, 4], stone_hoe: [5, 4], diamond_hoe: [5, 4], ancient_hoe: [5, 4],
    stone_rod: [6, 4], iron_rod: [6, 4], diamond_rod: [6, 4], ancient_rod: [6, 4],
    essence_reforge_stone: [1, 5], minion_slot_expander: [3, 5], auto_shipping_module: [3, 5], diamond_spreading: [3, 5],
    skin_diamond_steve: [3, 5], minion_fuel_coal: [1, 5],
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
  function drawGear(c, col) {
    c.fillStyle = col;
    for (let i = 0; i < 8; i++) { c.save(); c.translate(20, 20); c.rotate(i * Math.PI / 4); c.fillRect(-2.5, -14, 5, 7); c.restore(); }
    c.beginPath(); c.arc(20, 20, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#20242c'; c.beginPath(); c.arc(20, 20, 4, 0, Math.PI * 2); c.fill();
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
    if (/cape/.test(key)) return 'cape';
    if (/^(rawfish|salmon|clownfish|pufferfish|fish_insomnia)$/.test(key)) return 'fish';
    if (/^skin_/.test(key)) return 'skin';
    if (/^enchanted_/.test(key)) return 'cube';
    return 'cube';
  }
  function baseColorOf(key, cat) {
    const shop = findShop(key);
    if (shop && shop.tierKey) return tierColor(shop.tierKey);
    const rk = key.replace(/^enchanted_/, '');
    if (RES_COLORS[rk]) return RES_COLORS[rk];
    if (cat === 'book') return '#9365b8';
    if (cat === 'stone') return '#c9a227';
    if (cat === 'gear') return '#8c98a8';
    if (/^(wooden)/.test(key)) return '#9c7a44';
    if (/^stone_/.test(key)) return '#8c8c8c';
    if (/^iron_/.test(key)) return '#d8d8d4';
    if (/^diamond_/.test(key)) return '#5decd5';
    if (/^ancient_/.test(key)) return '#5decd5';
    return '#9aa2ad';
  }

  function econIcon(key) {
    if (cache[key]) return cache[key];
    trySheet();
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return '';
    // 외부 시트 우선(8×6 그리드에서 해당 셀을 잘라 사용 — 셀 크기는 이미지 실제 크기에서 자동 계산)
    const cell = spriteCellFor(key);
    if (sheetReady && cell) {
      const cw = sheet.width / SPRITE_COLS, ch = sheet.height / SPRITE_ROWS;
      const pad = Math.round(Math.min(cw, ch) * 0.04);   // 셀 가장자리 여백(이웃 셀 침범 방지)
      c.imageSmoothingEnabled = true;
      c.drawImage(sheet, cell[0] * cw + pad, cell[1] * ch + pad, cw - pad * 2, ch - pad * 2, 0, 0, S, S);
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
      case 'ring': drawRing(c, col); break;
      case 'book': drawBook(c, col); break;
      case 'egg': drawEgg(c, col); break;
      case 'pickaxe': drawPickaxe(c, col); break;
      case 'axe': drawAxe(c, col); break;
      case 'hoe': drawHoe(c, col); break;
      case 'rod': drawRod(c, col); break;
      case 'stone': drawStone(c, col); break;
      case 'flame': drawFlame(c); break;
      case 'gear': drawGear(c, col); break;
      case 'cape': drawCape(c, '#9365b8'); break;
      case 'fish': drawFish(c, col); break;
      case 'skin': drawSkin(c); break;
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
