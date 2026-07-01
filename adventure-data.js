/* =========================================================================
   adventure-data.js — 모험 탭(2D 마인크래프트) 데이터 테이블
   블록 / 아이템 / 조합법 / 제련 / 몹 정의. 엔진(adventure.js)이 참조.
   수치(경도·드롭률·체력 등)는 ADV.cfg 배수로 개발자 모드에서 조정 가능.
   ※ 텍스처는 마인크래프트 팔레트 기반으로 캔버스에서 절차 생성(저작권 이미지 미사용).
   ========================================================================= */
(function () {
  'use strict';

  // 채굴 도구 종류 (아이템 도구 kind 와 동일 문자열이어야 적합도구 판정이 맞음)
  const PICK = 'pickaxe', AXE = 'axe', SHOVEL = 'shovel', SWORD = 'sword', SHEARS = 'shears';
  // 채굴 레벨(수확 등급): 0 맨손/나무/금, 1 돌, 2 철, 3 다이아
  // 블록 정의: id(문자키), 한글명, 색 팔레트, 경도(초), 적합도구, 요구레벨, 드롭, 발광, 투과/액체/중력
  // hard: 맨손 적정시간(초) 기준값. 실제시간 = hard * (적합도구 보정) * cfg.breakMul
  const B = {};
  function def(key, o) { o.key = key; B[key] = o; return o; }

  // ---- 자연/기반 ----
  def('air',        { kor: '공기', solid: false, transparent: true, air: true });
  def('bedrock',    { kor: '기반암', hard: 9999, tool: PICK, level: 99, pal: ['#565656', '#3a3a3a', '#6b6b6b'], tex: 'noise' });
  def('stone',      { kor: '돌', hard: 1.5, tool: PICK, level: 0, drops: [{ i: 'cobblestone', c: 1 }], pal: ['#7e7e7e', '#727272', '#8a8a8a'], tex: 'noise' });
  def('granite',    { kor: '화강암', hard: 1.5, tool: PICK, level: 0, pal: ['#9a7163', '#8c6356', '#a87e6f'], tex: 'noise' });
  def('andesite',   { kor: '안산암', hard: 1.5, tool: PICK, level: 0, pal: ['#888a89', '#7c7e7d', '#9a9c9b'], tex: 'noise' });
  def('diorite',    { kor: '섬록암', hard: 1.5, tool: PICK, level: 0, pal: ['#bcbcbc', '#a8a8a8', '#d0d0d0'], tex: 'noise' });
  def('dirt',       { kor: '흙', hard: 0.5, tool: SHOVEL, level: 0, pal: ['#866043', '#75543b', '#946a4a'], tex: 'noise' });
  def('grass',      { kor: '잔디', hard: 0.6, tool: SHOVEL, level: 0, drops: [{ i: 'dirt', c: 1 }], pal: ['#866043', '#75543b', '#946a4a'], top: ['#6aa84f', '#5b9142', '#7bbf5c'], tex: 'grass' });
  def('cobblestone',{ kor: '조약돌', hard: 2.0, tool: PICK, level: 0, pal: ['#7d7d7d', '#6b6b6b', '#919191'], tex: 'cobble' });
  def('mossy_cobblestone', { kor: '이끼 조약돌', hard: 2.0, tool: PICK, level: 0, pal: ['#6b7a5a', '#5c6b4d', '#7d8c6a'], tex: 'cobble' });
  def('sand',       { kor: '모래', hard: 0.5, tool: SHOVEL, level: 0, gravity: true, pal: ['#e0d6a0', '#d4c98e', '#ece2b0'], tex: 'noise' });
  def('sandstone',  { kor: '사암', hard: 0.8, tool: PICK, level: 0, pal: ['#d9cda0', '#cabf90', '#e6dab0'], tex: 'sandstone' });
  def('gravel',     { kor: '자갈', hard: 0.6, tool: SHOVEL, level: 0, gravity: true, drops: [{ i: 'gravel', c: 1 }, { i: 'flint', c: 1, chance: 0.1 }], pal: ['#867f7e', '#76706f', '#999190'], tex: 'cobble' });
  def('clay',       { kor: '점토', hard: 0.6, tool: SHOVEL, level: 0, drops: [{ i: 'clay_ball', c: 4 }], pal: ['#a4a8b6', '#9498a6', '#b4b8c6'], tex: 'noise' });
  def('snow_block', { kor: '눈 블록', hard: 0.2, tool: SHOVEL, level: 0, needsTool: true, drops: [{ i: 'snowball', c: 4 }], pal: ['#f0f4f7', '#e2e8ec', '#ffffff'], tex: 'noise' });   // 삽 없으면 드롭 없음, 삽으로 눈덩이 4개
  def('ice',        { kor: '얼음', hard: 0.5, tool: PICK, level: 0, transparent: true, drops: [], pal: ['#83a0f0', '#7390e0', '#a0bcff'], tex: 'noise' });
  def('obsidian',   { kor: '흑요석', hard: 50, tool: PICK, level: 3, pal: ['#1a1326', '#120d1c', '#2a2040'], tex: 'noise' });

  // ---- 광물 ----
  def('coal_ore',     { kor: '석탄 광석', hard: 3.0, tool: PICK, level: 0, drops: [{ i: 'coal', c: 1 }], xp: 1, pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#1c1c1c', tex: 'ore' });
  def('iron_ore',     { kor: '철 광석', hard: 3.0, tool: PICK, level: 1, drops: [{ i: 'iron_ore_drop', c: 1 }], smeltSelf: 'iron_ingot', pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#d2a282', tex: 'ore' });
  def('gold_ore',     { kor: '금 광석', hard: 3.0, tool: PICK, level: 2, drops: [{ i: 'gold_ore_drop', c: 1 }], smeltSelf: 'gold_ingot', pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#f7d75c', tex: 'ore' });
  def('redstone_ore', { kor: '레드스톤 광석', hard: 3.0, tool: PICK, level: 2, drops: [{ i: 'redstone', c: 4, max: 5 }], light: 7, pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#e8323b', tex: 'ore' });
  def('lapis_ore',    { kor: '청금석 광석', hard: 3.0, tool: PICK, level: 1, drops: [{ i: 'lapis', c: 4, max: 8 }], xp: 3, pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#2552c4', tex: 'ore' });
  def('diamond_ore',  { kor: '다이아 광석', hard: 3.0, tool: PICK, level: 2, drops: [{ i: 'diamond', c: 1 }], xp: 5, pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#5decd5', tex: 'ore' });
  def('emerald_ore',  { kor: '에메랄드 광석', hard: 3.0, tool: PICK, level: 2, drops: [{ i: 'emerald', c: 1 }], xp: 5, pal: ['#7e7e7e', '#727272', '#8a8a8a'], ore: '#3bd16f', tex: 'ore' });

  // ---- 저장 블록(광물 9개 ↔ 블록 1개) ----
  def('iron_block',    { kor: '철 블록', hard: 5.0, tool: PICK, level: 1, pal: ['#e4e4e0', '#d6d6d2', '#f0f0ec'], tex: 'iron_block' });
  def('gold_block',    { kor: '금 블록', hard: 3.0, tool: PICK, level: 2, pal: ['#f2d75c', '#e4c74c', '#fbe36e'], tex: 'gold_block' });
  def('diamond_block', { kor: '다이아 블록', hard: 5.0, tool: PICK, level: 2, pal: ['#6ef0dc', '#5ee0cc', '#7effe8'], tex: 'diamond_block' });
  def('coal_block',    { kor: '석탄 블록', hard: 5.0, tool: PICK, level: 0, pal: ['#1c1c1e', '#141416', '#26262a'], tex: 'coal_block' });
  def('redstone_block',{ kor: '레드스톤 블록', hard: 5.0, tool: PICK, level: 0, pal: ['#c81f28', '#b81a22', '#d83038'], tex: 'redstone_block' });
  def('lapis_block',   { kor: '청금석 블록', hard: 3.0, tool: PICK, level: 1, pal: ['#1f4fc0', '#1740a0', '#2a5fd8'], tex: 'lapis_block' });
  def('emerald_block', { kor: '에메랄드 블록', hard: 5.0, tool: PICK, level: 2, pal: ['#1fbf5c', '#17a94f', '#2ad06c'], tex: 'emerald_block' });

  // ---- 나무/식물 ----
  def('oak_log',    { kor: '참나무 원목', hard: 2.0, tool: AXE, level: 0, pal: ['#6b5436', '#5b472d', '#7c6342'], ring: '#b59b6a', tex: 'log' });
  def('birch_log',  { kor: '자작나무 원목', hard: 2.0, tool: AXE, level: 0, pal: ['#d7d3c8', '#c4c0b4', '#e7e3d8'], ring: '#5c5a4e', tex: 'log' });
  def('spruce_log', { kor: '가문비나무 원목', hard: 2.0, tool: AXE, level: 0, pal: ['#3b2a18', '#2e2012', '#4a3722'], ring: '#6b5236', tex: 'log' });
  def('oak_planks', { kor: '참나무 판자', hard: 2.0, tool: AXE, level: 0, pal: ['#b08a4f', '#9c7a44', '#c49a5b'], tex: 'plank' });
  def('birch_planks', { kor: '자작나무 판자', hard: 2.0, tool: AXE, level: 0, pal: ['#d8cda0', '#c8bd90', '#e6dbb0'], tex: 'plank' });
  def('spruce_planks', { kor: '가문비나무 판자', hard: 2.0, tool: AXE, level: 0, pal: ['#6b4f2e', '#5b4226', '#7c5e38'], tex: 'plank' });
  def('oak_leaves', { kor: '참나무 잎', hard: 0.2, tool: SHEARS, level: 0, transparent: true, drops: [{ i: 'sapling', c: 1, chance: 0.06 }, { i: 'apple', c: 1, chance: 0.04 }], pal: ['#3f7a2e', '#356a26', '#4c8f38'], tex: 'leaves' });
  def('birch_leaves', { kor: '자작나무 잎', hard: 0.2, tool: SHEARS, level: 0, transparent: true, drops: [{ i: 'sapling', c: 1, chance: 0.06 }], pal: ['#5c6b4d', '#4c5a3e', '#6d7c5c'], tex: 'leaves' });
  def('spruce_leaves', { kor: '가문비나무 잎', hard: 0.2, tool: SHEARS, level: 0, transparent: true, drops: [{ i: 'sapling', c: 1, chance: 0.06 }], pal: ['#2c4a2c', '#233b23', '#375a37'], tex: 'leaves' });
  def('sapling',    { kor: '묘목', solid: false, transparent: true, hard: 0, plant: true, pal: ['#4c8f38'], tex: 'cross' });
  def('cactus',     { kor: '선인장', hard: 0.4, tool: AXE, level: 0, transparent: true, hurt: 1, pal: ['#3f7d3a', '#356a31', '#4c8f46'], tex: 'noise' });
  def('tall_grass', { kor: '키 큰 풀', solid: false, transparent: true, hard: 0, drops: [{ i: 'seeds', c: 1, chance: 0.12 }], pal: ['#5b9142', '#4f7f3a', '#6aa84f'], tex: 'cross' });
  def('flower_red', { kor: '빨간 꽃', solid: false, transparent: true, hard: 0, drops: [{ i: 'flower_red', c: 1 }], pal: ['#d23b32', '#b8302a', '#e8483e'], tex: 'cross' });
  def('flower_yellow', { kor: '노란 꽃', solid: false, transparent: true, hard: 0, drops: [{ i: 'flower_yellow', c: 1 }], pal: ['#f0c829', '#dcb622', '#f7d75c'], tex: 'cross' });
  def('sugar_cane', { kor: '사탕수수', solid: false, transparent: true, hard: 0, drops: [{ i: 'sugar_cane', c: 1 }], pal: ['#8fc36a', '#7bbf5c', '#a3d178'], tex: 'cross' });
  def('wheat_crop', { kor: '밀(어림)', solid: false, transparent: true, hard: 0, plant: true, crop: 'wheat_ripe', drops: [{ i: 'seeds', c: 1 }], pal: ['#6a8c3a'], tex: 'cross' });
  def('wheat_ripe', { kor: '밀(익음)', solid: false, transparent: true, hard: 0, plant: true, ripe: true, drops: [{ i: 'wheat', c: 1 }, { i: 'seeds', c: 1, max: 3 }], pal: ['#cdb24a'], tex: 'cross' });
  def('carrot_crop', { kor: '당근(어림)', solid: false, transparent: true, hard: 0, plant: true, crop: 'carrot_ripe', drops: [{ i: 'carrot', c: 1 }], pal: ['#3f7d3a'], tex: 'cross' });
  def('carrot_ripe', { kor: '당근(익음)', solid: false, transparent: true, hard: 0, plant: true, ripe: true, drops: [{ i: 'carrot', c: 1, max: 3 }], pal: ['#e07b1f'], tex: 'cross' });
  def('potato_crop', { kor: '감자(어림)', solid: false, transparent: true, hard: 0, plant: true, crop: 'potato_ripe', drops: [{ i: 'potato', c: 1 }], pal: ['#3f7d3a'], tex: 'cross' });
  def('potato_ripe', { kor: '감자(익음)', solid: false, transparent: true, hard: 0, plant: true, ripe: true, drops: [{ i: 'potato', c: 1, max: 3 }], pal: ['#c8a25a'], tex: 'cross' });
  def('farmland',   { kor: '경작지', hard: 0.6, tool: SHOVEL, level: 0, drops: [{ i: 'dirt', c: 1 }], pal: ['#5a3f28', '#4a3320', '#6a4d34'], tex: 'noise' });
  def('bed',        { kor: '침대', solid: false, transparent: true, hard: 0.2, station: 'bed', drops: [{ i: 'bed', c: 1 }], pal: ['#c0392b', '#a93226', '#e74c3c'], tex: 'wool' });

  // ---- 가공/건축 ----
  def('glass',      { kor: '유리', hard: 0.3, tool: null, level: 0, transparent: true, drops: [], pal: ['#aee3f0', '#9bd0e0'], tex: 'glass' });
  def('bricks',     { kor: '벽돌', hard: 2.0, tool: PICK, level: 0, pal: ['#9a4f3f', '#8a4537', '#ad5e4c'], tex: 'bricks' });
  def('stone_bricks', { kor: '돌벽돌', hard: 2.0, tool: PICK, level: 0, pal: ['#7b7b7b', '#6e6e6e', '#888888'], tex: 'stonebrick' });
  def('wool',       { kor: '양털', hard: 0.8, tool: SHEARS, level: 0, pal: ['#e9ecec', '#dadddd', '#f6f9f9'], tex: 'wool' });
  def('glowstone',  { kor: '발광석', hard: 0.3, tool: PICK, level: 0, light: 15, drops: [{ i: 'glowstone_dust', c: 3, max: 4 }], pal: ['#c8a23f', '#b38e30', '#f4d35e'], tex: 'glow' });
  def('bookshelf',  { kor: '책장', hard: 1.5, tool: AXE, level: 0, drops: [{ i: 'book', c: 3 }], pal: ['#b08a4f', '#9c7a44'], tex: 'bookshelf' });
  def('crafting_table', { kor: '제작대', hard: 2.5, tool: AXE, level: 0, station: 'craft', pal: ['#9c7a44', '#7a5f34'], tex: 'craft' });
  def('furnace',    { kor: '화로', hard: 3.5, tool: PICK, level: 0, station: 'furnace', pal: ['#6e6e6e', '#5e5e5e', '#7e7e7e'], tex: 'furnace' });
  def('chest',      { kor: '상자', hard: 2.5, tool: AXE, level: 0, station: 'chest', transparent: true, pal: ['#9c7a44', '#7a5f34'], tex: 'chest' });
  def('torch',      { kor: '횃불', solid: false, transparent: true, hard: 0, light: 14, pal: ['#5b472d'], tex: 'torch' });
  def('tnt',        { kor: 'TNT', hard: 0, tool: null, level: 0, tnt: true, pal: ['#c0392b', '#a93226', '#e74c3c'], tex: 'tnt' });
  def('ladder',     { kor: '사다리', solid: false, transparent: true, climb: true, hard: 0.4, tool: AXE, level: 0, pal: ['#9c7a44'], tex: 'ladder' });
  def('pumpkin',    { kor: '호박', hard: 1.0, tool: AXE, level: 0, pal: ['#d6791f', '#bd6a18', '#e8902f'], tex: 'pumpkin' });

  // ---- 액체 ----
  def('water',      { kor: '물', solid: false, transparent: true, liquid: 'water', pal: ['#3a6ee0', '#3463cf', '#4d80f0'], tex: 'liquid' });
  def('lava',       { kor: '용암', solid: false, transparent: true, liquid: 'lava', light: 15, hurt: 4, pal: ['#e8632a', '#d2541f', '#f7a02a'], tex: 'liquid' });

  // ---------------- 아이템(블록 외) ----------------
  const I = {};
  function item(key, o) { o.key = key; o.itemOnly = true; I[key] = o; return o; }
  // 도구: tier 0나무 1돌 2철 3다이아 4금
  const TIER = { wood: 0, stone: 1, iron: 2, diamond: 3, gold: 4 };
  const MAT_LEVEL = { wood: 0, gold: 0, stone: 1, iron: 2, diamond: 3 };  // 수확 가능 레벨
  const MAT_SPEED = { wood: 2, stone: 4, iron: 6, gold: 12, diamond: 8 }; // 채굴 속도 배수
  const MAT_DMG = { wood: 1, stone: 2, iron: 3, gold: 1, diamond: 4 };    // 곡괭이/도끼 데미지 계산용
  const MAT_DUR = { wood: 59, stone: 131, iron: 250, gold: 32, diamond: 1561 };
  const MAT_KOR = { wood: '나무', stone: '돌', iron: '철', gold: '금', diamond: '다이아' };
  // 검/삽 데미지는 재질별 배수가 아니라 실제 마크값을 직접 표(공식으로 못 뽑음)
  const SWORD_DMG = { wood: 4, gold: 4, stone: 5, iron: 6, diamond: 7 };
  const SHOVEL_DMG = { wood: 2.5, gold: 2.5, stone: 3.5, iron: 4.5, diamond: 5.5 };
  const tool = (mat, kind, kor, dmg) => item(mat + '_' + kind, {
    tool: kind, mat, level: MAT_LEVEL[mat], speed: MAT_SPEED[mat], dur: MAT_DUR[mat],
    dmg: dmg, kor: MAT_KOR[mat] + ' ' + kor, stack: 1, tier: TIER[mat],
  });
  ['wood', 'stone', 'iron', 'gold', 'diamond'].forEach(m => {
    tool(m, 'pickaxe', '곡괭이', 1 + MAT_DMG[m]);
    tool(m, 'axe', '도끼', 2 + MAT_DMG[m]);
    tool(m, 'shovel', '삽', SHOVEL_DMG[m]);
    tool(m, 'sword', '검', SWORD_DMG[m]);
    tool(m, 'hoe', '괭이', 1);
  });
  item('shears', { tool: 'shears', kor: '가위', dur: 238, stack: 1, dmg: 1 });
  item('bow', { kor: '활', stack: 1, dur: 384, bow: true });
  item('flint_and_steel', { kor: '부싯돌과 부시', stack: 1, dur: 64, igniter: true });
  item('bucket', { kor: '양동이', stack: 16 });
  item('water_bucket', { kor: '물 양동이', stack: 1, places: 'water' });
  item('lava_bucket', { kor: '용암 양동이', stack: 1, places: 'lava' });
  item('fishing_rod', { kor: '낚싯대', stack: 1, dur: 65, fishing: true });
  item('shield', { kor: '방패', stack: 1, dur: 336, shield: true });

  // 방어구: 마인크래프트 방어 포인트(1.5.2). 1포인트 = 피해 4% 감소(최대 80%).
  const ARMOR_PTS = { leather: { head: 1, chest: 3, legs: 2, feet: 1 }, gold: { head: 2, chest: 5, legs: 3, feet: 1 }, iron: { head: 2, chest: 6, legs: 5, feet: 2 }, diamond: { head: 3, chest: 8, legs: 6, feet: 3 } };
  const ARMOR_DUR = { leather: { head: 55, chest: 80, legs: 75, feet: 65 }, gold: { head: 77, chest: 112, legs: 105, feet: 91 }, iron: { head: 165, chest: 240, legs: 225, feet: 195 }, diamond: { head: 363, chest: 528, legs: 495, feet: 429 } };
  const ARM_M = { leather: '가죽', gold: '황금', iron: '철', diamond: '다이아' };
  const ARM_S = { head: '투구', chest: '갑옷', legs: '바지', feet: '부츠' };
  const ARM_PIECE = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
  ['leather', 'gold', 'iron', 'diamond'].forEach(m => { ['head', 'chest', 'legs', 'feet'].forEach(s => {
    item(m + '_' + ARM_PIECE[s], { armor: ARMOR_PTS[m][s], slot: s, mat: m, dur: ARMOR_DUR[m][s], kor: ARM_M[m] + ' ' + ARM_S[s], stack: 1 });
  }); });

  // 재료
  const mat = (key, kor, extra) => item(key, Object.assign({ kor }, extra || {}));
  mat('stick', '막대기'); mat('coal', '석탄', { fuel: 80 }); mat('charcoal', '숯', { fuel: 80 });
  mat('iron_ore_drop', '철 원석'); mat('gold_ore_drop', '금 원석');
  mat('iron_ingot', '철괴'); mat('gold_ingot', '금괴'); mat('gold_nugget', '금 조각');
  mat('diamond', '다이아몬드'); mat('emerald', '에메랄드'); mat('redstone', '레드스톤 가루');
  mat('lapis', '청금석'); mat('flint', '부싯돌'); mat('string', '실'); mat('gunpowder', '화약');
  mat('bone', '뼈'); mat('bone_meal', '뼛가루'); mat('feather', '깃털'); mat('leather', '가죽');
  mat('wheat', '밀'); mat('sapling', '묘목', { block: 'sapling' });
  mat('clay_ball', '점토 덩어리'); mat('brick_item', '벽돌(아이템)');
  mat('paper', '종이'); mat('book', '책'); mat('sugar', '설탕');
  mat('slimeball', '슬라임볼'); mat('arrow', '화살', { stack: 64 });
  mat('snowball', '눈덩이', { stack: 16 });
  mat('glowstone_dust', '발광석 가루'); mat('blaze_rod', '블레이즈 막대'); mat('seeds', '씨앗', { plant: 'wheat_crop' });

  // 음식: food=허기회복(0.5칸=1), sat=포화
  const food = (key, kor, h, extra) => item(key, Object.assign({ kor, food: h }, extra || {}));
  food('apple', '사과', 4); food('golden_apple', '황금 사과', 4, { regen: true });
  food('bread', '빵', 5); food('cookie', '쿠키', 2, { stack: 64 });
  food('raw_porkchop', '날 돼지고기', 3); food('cooked_porkchop', '익힌 돼지고기', 8);
  food('raw_beef', '날 소고기', 3); food('cooked_beef', '스테이크', 8);
  food('raw_chicken', '날 닭고기', 2, { poison: 0.3 }); food('cooked_chicken', '익힌 닭고기', 6);
  food('melon_slice', '수박 조각', 2); food('carrot', '당근', 3, { plant: 'carrot_crop' }); food('potato', '감자', 1, { plant: 'potato_crop' });
  food('baked_potato', '구운 감자', 5); food('pumpkin_pie', '호박 파이', 8);
  food('raw_fish', '날 물고기', 2); food('cooked_fish', '익힌 물고기', 5);

  // ---------------- 조합법 ----------------
  // {out:[item,count], grid:[...9], table:bool}  또는 shapeless {out, need:[[item,count]...]}
  // 모바일은 레시피북 탭으로 조합 → grid 는 표시용, need 가 소모 기준.
  const R = [];
  const recipe = (out, count, need, table, grid) => R.push({ out, count, need, table: !!table, grid: grid || null });
  recipe('oak_planks', 4, [['oak_log', 1]], false, ['oak_log']);
  recipe('birch_planks', 4, [['birch_log', 1]], false, ['birch_log']);
  recipe('stick', 4, [['oak_planks', 2]], false, ['oak_planks', null, null, 'oak_planks']);
  recipe('crafting_table', 1, [['oak_planks', 4]], false, ['oak_planks', 'oak_planks', null, 'oak_planks', 'oak_planks']);
  recipe('torch', 4, [['coal', 1], ['stick', 1]], false, ['coal', null, null, 'stick']);
  recipe('chest', 1, [['oak_planks', 8]], true);
  recipe('furnace', 1, [['cobblestone', 8]], true);
  recipe('bookshelf', 1, [['oak_planks', 6], ['book', 3]], true);
  recipe('ladder', 3, [['stick', 7]], true);
  recipe('bricks', 1, [['brick_item', 4]], true);
  recipe('stone_bricks', 4, [['stone', 4]], true);
  recipe('wool', 1, [['string', 4]], true);
  recipe('paper', 3, [['sugar_cane', 3]], false);
  recipe('book', 1, [['paper', 3], ['leather', 1]], false);
  recipe('bowl', 4, [['oak_planks', 3]], true);
  recipe('bread', 1, [['wheat', 3]], true);
  recipe('cookie', 8, [['wheat', 2], ['sugar', 1]], true);
  recipe('tnt', 1, [['gunpowder', 5], ['sand', 4]], true);
  recipe('bucket', 1, [['iron_ingot', 3]], true);
  recipe('bow', 1, [['stick', 3], ['string', 3]], true);
  recipe('arrow', 4, [['flint', 1], ['stick', 1], ['feather', 1]], true);
  recipe('shears', 1, [['iron_ingot', 2]], true);
  recipe('flint_and_steel', 1, [['iron_ingot', 1], ['flint', 1]], false);
  recipe('glowstone', 1, [['glowstone_dust', 4]], true);
  recipe('fishing_rod', 1, [['stick', 3], ['string', 2]], true);
  recipe('bed', 1, [['wool', 3], ['oak_planks', 3]], true);
  // 방어구 조합(투구5·갑옷8·바지7·부츠4)
  const ARMOR_MAT = { leather: 'leather', gold: 'gold_ingot', iron: 'iron_ingot', diamond: 'diamond' };
  ['leather', 'gold', 'iron', 'diamond'].forEach(m => { const h = ARMOR_MAT[m];
    recipe(m + '_helmet', 1, [[h, 5]], true);
    recipe(m + '_chestplate', 1, [[h, 8]], true);
    recipe(m + '_leggings', 1, [[h, 7]], true);
    recipe(m + '_boots', 1, [[h, 4]], true);
  });
  // 도구 조합(나무/돌/철/금/다이아)
  const TMAT = { wood: 'oak_planks', stone: 'cobblestone', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond' };
  Object.keys(TMAT).forEach(m => {
    const h = TMAT[m];
    recipe(m + '_pickaxe', 1, [[h, 3], ['stick', 2]], true, [h, h, h, null, 'stick', null, null, 'stick', null]);
    recipe(m + '_axe', 1, [[h, 3], ['stick', 2]], true, [h, h, null, h, 'stick', null, null, 'stick', null]);
    recipe(m + '_shovel', 1, [[h, 1], ['stick', 2]], true, [h, null, null, 'stick', null, null, 'stick', null, null]);
    recipe(m + '_sword', 1, [[h, 2], ['stick', 1]], true, [h, null, null, h, null, null, 'stick', null, null]);
    recipe(m + '_hoe', 1, [[h, 2], ['stick', 2]], true, [h, h, null, null, 'stick', null, null, 'stick', null]);
  });

  // ---------------- 제련(화로) ----------------
  // in -> out (연료 필요). 시간 cfg.smeltTime.
  const SMELT = {
    iron_ore_drop: 'iron_ingot', gold_ore_drop: 'gold_ingot', sand: 'glass',
    cobblestone: 'stone', clay_ball: 'brick_item', raw_porkchop: 'cooked_porkchop',
    raw_beef: 'cooked_beef', raw_chicken: 'cooked_chicken', potato: 'baked_potato',
    oak_log: 'charcoal', birch_log: 'charcoal', iron_ore: 'iron_ingot', gold_ore: 'gold_ingot',
    raw_fish: 'cooked_fish',
  };
  const FUEL = { coal: 8, charcoal: 8, coal_block: 80, oak_planks: 1.5, oak_log: 1.5, birch_planks: 1.5, birch_log: 1.5, stick: 0.5, lava_bucket: 100, crafting_table: 1.5, chest: 1.5, bowl: 0.5 };   // 책장은 실제 마크에서 연료 아님(제거), 그릇은 막대와 동일(0.5)

  // ---------------- 몹 ----------------
  // hp, dmg, speed(타일/초), 적대(공격), drops, 크기
  const MOBS = {
    pig:     { kor: '돼지', hp: 10, hostile: false, speed: 1.6, w: 0.9, h: 0.9, drops: [{ i: 'raw_porkchop', c: 1, max: 3 }], col: '#e89aa0' },
    cow:     { kor: '소', hp: 10, hostile: false, speed: 1.4, w: 1.0, h: 1.2, drops: [{ i: 'raw_beef', c: 1, max: 3 }, { i: 'leather', c: 0, max: 2 }], col: '#5b4636' },
    sheep:   { kor: '양', hp: 8, hostile: false, speed: 1.5, w: 0.9, h: 1.0, drops: [{ i: 'raw_beef', c: 1, max: 2 }, { i: 'wool', c: 1 }], col: '#eceff0' },
    chicken: { kor: '닭', hp: 4, hostile: false, speed: 1.6, w: 0.6, h: 0.7, drops: [{ i: 'raw_chicken', c: 1 }, { i: 'feather', c: 0, max: 2 }], col: '#f2f2f2' },
    zombie:  { kor: '좀비', hp: 20, hostile: true, dmg: 3, speed: 1.5, w: 0.8, h: 1.8, burn: true, drops: [{ i: 'rotten_flesh', c: 0, max: 2 }], col: '#4f7a4f' },
    skeleton:{ kor: '스켈레톤', hp: 20, hostile: true, dmg: 2, speed: 1.6, w: 0.8, h: 1.8, burn: true, ranged: true, drops: [{ i: 'bone', c: 0, max: 2 }, { i: 'arrow', c: 0, max: 2 }], col: '#cdd0cf' },
    creeper: { kor: '크리퍼', hp: 20, hostile: true, dmg: 8, speed: 1.4, w: 0.8, h: 1.7, explode: true, drops: [{ i: 'gunpowder', c: 0, max: 2 }], col: '#5fa05f' },
    spider:  { kor: '거미', hp: 16, hostile: true, dmg: 2, speed: 2.1, w: 1.3, h: 0.8, climb: true, drops: [{ i: 'string', c: 0, max: 2 }], col: '#3a3a3a' },
  };
  mat('rotten_flesh', '썩은 살점', { food: 4, poison: 0.8 });
  item('bowl', { kor: '그릇', stack: 64 });

  window.ADV_BLOCKS = B;
  window.ADV_ITEMS = I;
  window.ADV_RECIPES = R;
  window.ADV_SMELT = { recipes: SMELT, fuel: FUEL };
  window.ADV_MOBS = MOBS;
  // 통합 조회: 블록이면서 아이템으로도 존재. name(key)->정의(블록 우선, 아이템 보조)
  window.advDef = function (k) { return B[k] || I[k] || null; };
  window.advKor = function (k) { const d = advDef(k); return (d && d.kor) || k; };
  window.advIsBlock = function (k) { return !!B[k]; };
  window.advStack = function (k) { const d = advDef(k); return (d && d.stack) || 64; };
})();
