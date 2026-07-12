/* =========================================================================
   economy-data.js — 경제 탭(하이픽셀 스카이블럭 x 메이플스토리) 데이터 레이어 V2
   순수 데이터만 정의(로직은 economy.js, 3D 월드는 economy3d.js).
   V2: 자원 31종·미니언 20종·슬레이어 5종(실제 스카이블럭 보스 라인업)·던전 7층(카타콤)
   ·장신구(부적) 20종+마력(Magical Power)·펫 12종·인챈트·페어리 소울·은행 이자·일일 특가.
   ========================================================================= */
(function () {
  const ITEM_TIERS = [
    // V95: 등급 색을 하이픽셀 스카이블럭 공식(마인크래프트 채팅 색코드)에 정렬 — key/name/magicalPower는 불변.
    { key: 'common', name: '일반', colorHex: '#FFFFFF', statMultiplier: 1, reforgeCost: 250, magicalPower: 3 },       // §f 흰색
    { key: 'uncommon', name: '고급', colorHex: '#55FF55', statMultiplier: 1.2, reforgeCost: 500, magicalPower: 5 },   // §a 초록
    { key: 'rare', name: '희귀', colorHex: '#5555FF', statMultiplier: 1.4, reforgeCost: 1000, magicalPower: 8 },      // §9 파랑
    { key: 'epic', name: '영웅', colorHex: '#AA00AA', statMultiplier: 1.6, reforgeCost: 2500, magicalPower: 12 },     // §5 암보라
    { key: 'legendary', name: '전설', colorHex: '#FFAA00', statMultiplier: 1.8, reforgeCost: 5000, magicalPower: 16 },// §6 금색
    { key: 'mythic', name: '신화', colorHex: '#FF55FF', statMultiplier: 2.0, reforgeCost: 9000, magicalPower: 22 },   // §d 밝은 분홍
    { key: 'ancient', name: '고대', colorHex: '#5DECD5', statMultiplier: 2.4, reforgeCost: 15000, magicalPower: 28 },
    { key: 'divine', name: '신성', colorHex: '#55FFFF', statMultiplier: 2.8, reforgeCost: 25000, magicalPower: 34 },   // V11 · V126: DIVINE 아쿠아 §b 정합
    { key: 'primal', name: '태초', colorHex: '#FF5470', statMultiplier: 3.2, reforgeCost: 40000, magicalPower: 40 },   // V11
  ];

  /* ---------------- 컬렉션(자원 31종, 5개 카테고리) ---------------- */
  // V8: 아이템별 컬렉션 티어 수·임계값이 전부 다름(실제 스카이블럭) — custom 배열이 있으면 그것을 사용
  // V16: 실제 하이픽셀 컬렉션 10티어 곡선(위키 검증). th0=50이면 조약돌 실제값 [50,100,250,1000,2500,5000,10000,25000,40000,70000]와 정확히 일치.
  function res(key, name, sell, th0, custom) { return { key, name, stackSize: 64, sellPrice: sell, tierThresholds: custom || [th0, th0 * 2, th0 * 5, th0 * 20, th0 * 50, th0 * 100, th0 * 200, th0 * 500, th0 * 800, th0 * 1400] }; }
  // V31-A: 티어별 실제 보상명(wiki.hypixel.net 인용 그대로 수작업 옮김) — 인덱스 = 티어-1.
  //   미기재 티어는 '레시피 해금'으로 표기. 모든 티어 공통 +4 스카이블럭 XP는 economy.js에서 지급.
  // V39: 위키(hypixelskyblock.minecraft.wiki) 전 컬렉션 전 티어 실보상 — 수작업 옮김. 인덱스 = 티어-1.
  const COL_TIER_REWARDS = {
    stone: ['조약돌 미니언 I 레시피', '돌 발판 레시피', '실버피시 펫 레시피 + 자동 제련기 레시피', '인챈티드 조약돌 레시피', '컴팩터 레시피', '채광 XP +1,000', '신속의 반지 레시피', '하이퍼 화로 레시피', '신속의 유물 레시피', '슈퍼 컴팩터 3000 레시피'],
    coal: ['석탄 미니언 I 레시피', '제련의 손길 XP 할인 -25%', '인챈티드 석탄 레시피 + 신속 물약 레시피', '위더 스켈레톤 펫 레시피', '인챈티드 목탄 레시피 + 소형 채광 자루 레시피', '골드 광산 이동 스크롤 레시피', '인챈티드 석탄 블럭 레시피 + 중형 채광 자루 레시피', '인챈티드 용암 양동이 레시피', '대형 채광 자루 레시피', '대형 인챈티드 채광 자루 레시피'],
    iron: ['철 미니언 I 레시피', '골렘 모자 레시피 + 프로스펙팅 갑옷 레시피', '보호 XP 할인 -25%', '인챈티드 철 주괴 레시피', '버짓 호퍼 레시피', '골렘 갑옷 레시피', '인챈티드 철 블럭 레시피', '골렘 소드 레시피', '인챈티드 호퍼 레시피 + 퍼스널 딜리터 4000 레시피', '퍼스널 딜리터 5000 레시피', '퍼스널 딜리터 6000 레시피', '퍼스널 딜리터 7000 레시피'],
    gold: ['금 미니언 I 레시피', '클리버 레시피', '약탈 XP 할인 -25%', '골드 광산 포탈 레시피', '인챈티드 금 주괴 레시피', '흡수 물약 레시피', '스캐빈저 XP 할인 -25%', '인챈티드 금 블럭 레시피', '행운 XP 할인 -25%', '인챈티드 시계 레시피'],
    lapis: ['청금석 미니언 I 레시피', '경험치 병 레시피', '청금석 곡괭이 레시피 + 경험 XP 할인 -25%', '인챈티드 청금석 레시피', '그랜드 경험치 병 레시피', '경험 물약 레시피', '인챈티드 청금석 블럭 레시피', '타이타닉 경험치 병 레시피', '경험의 유물 레시피', '교과서 레시피'],
    redstone: ['레드스톤 미니언 I 레시피', '소형 장신구 가방 업그레이드', '효율 XP 할인 -25%', '인챈티드 레드스톤 레시피', '날씨 스틱 레시피', '중형 장신구 가방 업그레이드', '깊은 동굴 이동 스크롤 레시피', '인챈티드 레드스톤 블럭 레시피', '대형 장신구 가방 업그레이드 + 퍼스널 컴팩터 4000 레시피', '그레이터 장신구 가방 업그레이드', '자이언트 장신구 가방 업그레이드 + 퍼스널 컴팩터 5000 레시피', '매시브 장신구 가방 업그레이드', '휴몽거스 장신구 가방 업그레이드 + 퍼스널 컴팩터 6000 레시피', '콜로설 장신구 가방 업그레이드 + 퍼스널 컴팩터 7000 레시피', '타이타닉 장신구 가방 업그레이드', '프리포스터러스 장신구 가방 업그레이드'],
    diamond: ['다이아몬드 미니언 I 레시피', '처형 XP 할인 -25%', '깊은 동굴 포탈 레시피', '인챈티드 다이아몬드 레시피', '치명타 XP 할인 -25%', '다이아몬드 스프레딩 레시피', '강화 다이아몬드 갑옷 레시피', '인챈티드 다이아몬드 블럭 레시피', '퍼펙트 갑옷 레시피'],
    emerald: ['에메랄드 미니언 I 레시피', '동전의 부적 레시피', '자석 부적 레시피', '인챈티드 에메랄드 레시피', '에메랄드 반지 레시피', '개인 은행 아이템 레시피 (/bank 접근)', '인챈티드 에메랄드 블럭 레시피', '에메랄드 블레이드 레시피', '에메랄드 갑옷 레시피'],
    obsidian: ['흑요석 미니언 I 레시피', '리썰리티 XP 할인 -25%', '중력의 부적 레시피', '인챈티드 흑요석 레시피', '채광 행운 +1', '기절 물약 레시피', '채광 행운 +1', '채광 행운 +1', '흑요석 태블릿 레시피', '채광 행운 +1 + 채광 XP +50,000'],
    wheat: ['밀 미니언 I 레시피', '수확 XP 할인 -25%', '농부 수트 레시피', '농사 부적 레시피', '인챈티드 밀 레시피 + 인챈티드 빵 레시피', '농사 섬 레시피', '소형 농경 자루 레시피', '중형 농경 자루 레시피', '농장 갑옷 레시피', '대형 농경 자루 레시피', '인챈티드 건초 더미 레시피 + 대형 인챈티드 농경 자루 레시피'],
    carrot: ['당근 미니언 I 레시피', '심플 당근 캔디 레시피', '당근 미끼 레시피', '인챈티드 당근 레시피', '인챈티드 당근 낚싯대 레시피', '그레이트 당근 캔디 레시피', '인챈티드 황금 당근 레시피', '슈퍼브 당근 캔디 레시피', '농사 XP +10,000'],
    potato: ['감자 미니언 I 레시피', '농장(The Barn) 포탈 레시피', '백신 부적 레시피', '인챈티드 감자 레시피', '맹독 물약 레시피', '농장 이동 스크롤 레시피', '인챈티드 구운 감자 레시피', '핫 포테이토 북 레시피', '농사 XP +10,000'],
    pumpkin: ['호박 미니언 I 레시피', '호박 갑옷 레시피', '인챈티드 호박 레시피', '큐비즘 XP 할인 -25% + 스푸키 미끼 레시피', '훈련용 더미 레시피', '파머 오브 레시피', '랜턴 투구 레시피', '농장 크리스탈 레시피', '파머 부츠 레시피', '폴리시드 호박 레시피', '랜처 부츠 레시피'],
    melon: ['수박 미니언 I 레시피', '농사 XP +50', '농사 XP +125', '인챈티드 수박 조각 레시피', '인챈티드 반짝이는 수박 레시피', '인챈티드 수박 블럭 레시피', '농사 XP +5,000', '농사 XP +10,000', '수박 갑옷 4부위 레시피'],
    sugarcane: ['사탕수수 미니언 I 레시피', '스피드 부적 레시피', '인챈티드 설탕 레시피', '스피드스터 갑옷 레시피', '인챈티드 종이 레시피 + 스피드 반지 레시피', '인챈티드 책장 레시피', '농사 XP +10,000', '인챈티드 사탕수수 레시피 + 스피드 유물 레시피', '농사 XP +25,000'],
    raw_porkchop: ['돼지 미니언 I 레시피', '농사 XP +500', '피그맨 펫 레시피 + 인챈티드 생돼지고기 레시피', '농사 XP +2,500', '피기 뱅크 레시피', '농사 XP +10,000', '인챈티드 익힌 돼지고기 레시피', '농사 XP +25,000', '피그맨 소드 레시피'],
    raw_chicken: ['닭 미니언 I 레시피', '다리 알 레시피', '닭 펫 레시피 + 닭 모자 레시피', '인챈티드 생닭 레시피', '인챈티드 달걀 레시피', '농사 XP +5,000', '인챈티드 케이크 레시피', '민첩 물약 레시피', '슈퍼 인챈티드 달걀 레시피', '오메가 인챈티드 달걀 레시피'],
    raw_mutton: ['양 미니언 I 레시피', '농사 XP +10', '양 펫 레시피', '마나 물약 레시피', '인챈티드 생양고기 레시피 + 소형 축산 자루 레시피', '레인보우 XP 할인 -25%', '중형 축산 자루 레시피', '인챈티드 익힌 양고기 레시피', '고통의 뿔 레시피 + 대형 축산 자루 레시피', '대형 인챈티드 축산 자루 레시피'],
    feather: ['발사체 보호 XP 할인 -25%', '가벼운 착지 XP 할인 -25%', '궁술 물약 레시피', '깃털 부적 레시피', '인챈티드 깃털 레시피', '드래곤 트레이서 XP 할인 -25%', '깃털 반지 레시피', '저격 XP 할인 -25%', '깃털 유물 레시피'],
    leather: ['소 미니언 I 레시피', '소 모자 레시피 + 우유 양동이 거래', '소형 배낭 레시피 + 말 펫 레시피', '인챈티드 가죽 레시피', '인챈티드 생소고기 레시피', '중형 배낭 레시피', '농사 XP +5,000', '안장 레시피', '대형 배낭 레시피', '농사 XP +10,000', '그레이터 배낭 레시피'],
    oaklog: ['참나무 미니언 I 레시피', '리플릿 갑옷 레시피 + 참나무 잎 거래', '인챈티드 참나무 원목 레시피', '소형 창고 레시피', '숲 바이옴 스틱 레시피', '중형 창고 레시피', '나무 친화 부적 레시피', '벌목 XP +10,000', '대형 창고 레시피'],
    birchlog: ['자작나무 미니언 I 레시피', '자작나무 잎 거래', '인챈티드 자작나무 원목 레시피 + 자작나무 공원 포탈 레시피', '조각가의 도끼 레시피', '자작나무 숲 바이옴 스틱 레시피', '소형 벌목 자루 레시피', '중형 벌목 자루 레시피', '대형 벌목 자루 레시피', '대형 인챈티드 벌목 자루 레시피'],
    sprucelog: ['가문비 미니언 I 레시피', '가문비 도끼 레시피 + 가문비 잎 거래', '인챈티드 가문비 원목 레시피 + 가문비 숲 포탈 레시피 + 늑대 펫 레시피', '벌목 XP +500', '타이가 바이옴 스틱 레시피', '벌목 XP +2,000', '벌목 크리스탈 레시피', '벌목 XP +10,000', '벌목 XP +25,000'],
    dark_oak_log: ['짙은 참나무 미니언 I 레시피', '짙은 참나무 잎 거래', '인챈티드 짙은 참나무 원목 레시피 + 다크 시킷 포탈 레시피', '지붕 숲 섬 레시피', '지붕 숲 바이옴 스틱 레시피', '벌목 XP +2,000', '성장 XP 할인 -25%', '벌목 XP +10,000', '성장의 갑옷 레시피'],
    acacia_log: ['아카시아 미니언 I 레시피', '아카시아 잎 거래', '인챈티드 아카시아 원목 레시피 + 사바나 삼림 포탈 레시피', '사바나 활 레시피', '사바나 바이옴 스틱 레시피', '벌목 XP +2,000', '리펠링 캔들 레시피', '벌목 XP +10,000', '아카시아 새집 레시피'],
    jungle_log: ['정글나무 미니언 I 레시피', '정글나무 잎 거래', '인챈티드 정글나무 원목 레시피 + 정글 섬 포탈 레시피 + 오셀롯 펫 레시피', '덩굴 거래', '정글 바이옴 스틱 레시피', '벌목 XP +2,000', '트리캐피테이터 레시피', '벌목 XP +10,000', '벌목 XP +10,000'],
    rawfish: ['물고기 모자 레시피 + 미노우 미끼 레시피', '낚시 미니언 I 레시피', '소형 낚시 가방 업그레이드', '연못 섬 레시피', '낚시 XP +2,500', '인챈티드 생대구 레시피', '중형 낚시 가방 업그레이드', '인챈티드 구운 대구 레시피', '대형 낚시 가방 업그레이드', '자이언트 낚시 가방 업그레이드', '매시브 낚시 가방 업그레이드'],
    salmon: ['연어 모자 레시피', '회피 물약 레시피', '루어 XP 할인 -25%', '인챈티드 생연어 레시피', '물고기 미끼 레시피', '연어 갑옷 레시피', '낚시 XP +5,000', '인챈티드 구운 연어 레시피', '낚시 XP +10,000'],
    clownfish: ['열대어 모자 레시피', '물 양동이 거래', '자석 XP 할인 -25%', '소형 자루 가방 업그레이드 + 인챈티드 열대어 레시피', '중형 자루 가방 업그레이드', '대형 자루 가방 업그레이드', '트로피컬 망토 레시피 + 그레이터 자루 가방 업그레이드', '자이언트 자루 가방 업그레이드', '매시브 자루 가방 업그레이드'],
    pufferfish: ['복어 모자 레시피', '인챈티드 복어 레시피', '클리브 XP 할인 -25%', '물갈퀴 XP 할인 -25%', '스파이크 미끼 레시피 + 소형 낚시 자루 레시피', '스파이크 훅 XP 할인 -25%', '중형 낚시 자루 레시피', '핫스팟 미끼 레시피', '대형 낚시 자루 레시피', '대형 인챈티드 낚시 자루 레시피'],
    prismarine: ['임페일링 XP 할인 -25%', '프리즈마린 블레이드 레시피', '인챈티드 프리즈마린 조각 레시피', '프리즈마린 싱커 레시피', '프리즈마린 활 레시피', '웨더 노드 레시피', '프리즈마린 목걸이 레시피'],
    sponge: ['스펀지 거래', '스펀지 싱커 레시피', '해양 생물 부적 레시피', '인챈티드 스펀지 레시피', '스펀지 벨트 레시피', '해양 생물 반지 레시피', '인챈티드 젖은 스펀지 레시피 + 스테레오 바지 레시피', '해양 생물 유물 레시피', '스펀지 갑옷 레시피'],
    clay: ['점토 미니언 I 레시피', '인챈티드 점토 레시피', '수중 호흡 XP 할인 -25%', '프레일 XP 할인 -25%', '점토 팔찌 레시피', '낚시 XP +2,500', '인챈티드 점토 블럭 레시피'],
    rotten_flesh: ['좀비 미니언 I 레시피', '좀비 곡괭이 레시피', '강타 XP 할인 -25% + 좀비 펫 레시피', '인챈티드 썩은 살점 레시피', '좀비 모자 레시피 + 소형 전투 자루 레시피', '좀비의 심장 레시피', '좀비 소드 레시피 + 중형 전투 자루 레시피', '좀비 갑옷 레시피', '대형 전투 자루 레시피', '대형 인챈티드 전투 자루 레시피'],
    bone: ['스켈레톤 미니언 I 레시피', '인챈티드 뼛가루 거래', '파워 XP 할인 -25% + 스켈레톤 펫 레시피', '스켈레톤 모자 레시피', '인챈티드 뼈 레시피', '전투 XP +1,000', '허리케인 활 레시피', '스켈레톤 투구 레시피', '루난의 활 레시피', '인챈티드 뼈 블럭 레시피'],
    string: ['거미 미니언 I 레시피', '거미줄 블럭 레시피', '화살통 업그레이드 + 거미 펫 레시피', '인챈티드 실 레시피 + 그래플링 훅 레시피', '섬세한 손길 XP 할인 -25%', '무한 화살통 XP 할인 -25% + 대형 화살통 업그레이드', '전투 XP +20,000', '거미의 부츠 레시피', '자이언트 화살통 업그레이드'],
    spider_eye: ['동굴 거미 미니언 I 레시피', '거미 검 레시피', '거미 모자 레시피', '인챈티드 거미 눈 레시피', '절지류의 재앙 XP 할인 -25%', '베노머스 XP 할인 -25%', '인챈티드 발효된 거미 눈 레시피', '전투 XP +25,000', '리핑 소드 레시피'],
    gunpowder: ['크리퍼 미니언 I 레시피', '크리퍼 모자 레시피', '폭발 보호 XP 할인 -25%', '인챈티드 화약 레시피', '썬더로드 XP 할인 -25%', '인챈티드 폭죽 레시피', '전투 XP +10,000', '크리퍼 바지 레시피', '폭발 활 레시피'],
    ender_pearl: ['엔더맨 미니언 I 레시피 + 사일런트 진주 레시피', '인챈티드 엔더 진주 레시피', '엔더 슬레이어 XP 할인 -25%', '소형 드래곤 자루 레시피', '엔더 활 레시피', '중형 드래곤 자루 레시피 + 인챈티드 엔더의 눈 레시피', '텔레포트 패드 거래 + 앱솔루트 엔더 진주 레시피', '엔드의 형상 레시피', '대형 드래곤 자루 레시피 + 세이빙 그레이스 레시피'],
    ghast_tear: ['가스트 미니언 I 레시피', '자이언트 킬러 XP 할인 -25%', '인챈티드 가스트 눈물 레시피', '뱀피리즘 XP 할인 -25% + 가스트 망토 레시피', '실버 팽 레시피', '메테오 청크 레시피', '정복된 가스트 망토 레시피'],
    slime_ball: ['슬라임 미니언 I 레시피', '슬라임 모자 레시피', '밀치기 XP 할인 -25%', '밀치기 물약 레시피', '인챈티드 슬라임볼 레시피', '펀치 XP 할인 -25%', '발사 패드 레시피', '인챈티드 슬라임 블럭 레시피', '슬라임 활 레시피'],
    blaze_rod: ['블레이즈 미니언 I 레시피', '발화 XP 할인 -25%', '인챈티드 블레이즈 파우더 레시피', '화염 부적 레시피 + 블레이즈 벨트 레시피', '화염(Flame) XP 할인 -25%', '인챈티드 블레이즈 막대 레시피 + 블레이즈 왁스 레시피 + 블레이즈 펫 레시피', '블레이즈 갑옷 레시피 + 정복된 블레이즈 벨트 레시피', '전투 XP +10,000'],
    magma_cream: ['마그마 큐브 미니언 I 레시피', '화염 보호 XP 할인 -25%', '네더 바이옴 스틱 레시피 + 인챈티드 마그마 크림 레시피', '마그마 목걸이 레시피', '용암 양동이 거래', '용암 부적 레시피 + 시어링 스톤 레시피', '정복된 마그마 목걸이 레시피', '휘핑 마그마 크림 레시피'],
  };
  // V39: 기능 보상 — sx: [스킬, XP] 실지급 / ds: 해당 인챈트 부여 비용 -25% / mf: 채광 행운 +1 (위키 그대로)
  const COL_TIER_FX = {
    raw_porkchop: { 2: { sx: ['farming', 500] }, 4: { sx: ['farming', 2500] }, 6: { sx: ['farming', 10000] }, 8: { sx: ['farming', 25000] } },
    raw_chicken: { 6: { sx: ['farming', 5000] } },
    raw_mutton: { 2: { sx: ['farming', 10] } },
    stone: { 6: { sx: ['mining', 1000] } },
    obsidian: { 5: { mf: 1 }, 7: { mf: 1 }, 8: { mf: 1 }, 10: { mf: 1, sx: ['mining', 50000] } },
    gold: { 3: { ds: 'looting' }, 9: { ds: 'fortune' } },
    lapis: { 3: { ds: 'experience' } },
    redstone: { 3: { ds: 'efficiency' } },
    diamond: { 2: { ds: 'execute' }, 5: { ds: 'critical' } },
    iron: { 3: { ds: 'protection' } },
    carrot: { 9: { sx: ['farming', 10000] } },
    potato: { 9: { sx: ['farming', 10000] } },
    pumpkin: { 4: { ds: 'cubism' } },
    melon: { 2: { sx: ['farming', 50] }, 3: { sx: ['farming', 125] }, 7: { sx: ['farming', 5000] }, 8: { sx: ['farming', 10000] } },
    sugarcane: { 7: { sx: ['farming', 10000] }, 9: { sx: ['farming', 25000] } },
    leather: { 7: { sx: ['farming', 5000] }, 10: { sx: ['farming', 10000] } },
    oaklog: { 8: { sx: ['foraging', 10000] } },
    sprucelog: { 4: { sx: ['foraging', 500] }, 6: { sx: ['foraging', 2000] }, 8: { sx: ['foraging', 10000] }, 9: { sx: ['foraging', 25000] } },
    dark_oak_log: { 6: { sx: ['foraging', 2000] }, 7: { ds: 'growth' }, 8: { sx: ['foraging', 10000] } },
    acacia_log: { 6: { sx: ['foraging', 2000] }, 8: { sx: ['foraging', 10000] } },
    jungle_log: { 6: { sx: ['foraging', 2000] }, 8: { sx: ['foraging', 10000] }, 9: { sx: ['foraging', 10000] } },
    rawfish: { 5: { sx: ['fishing', 2500] } },
    salmon: { 7: { sx: ['fishing', 5000] }, 9: { sx: ['fishing', 10000] } },
    clownfish: { 3: { ds: 'magnet' } },
    clay: { 6: { sx: ['fishing', 2500] } },
    rotten_flesh: { 3: { ds: 'smite' } },
    bone: { 3: { ds: 'power' }, 6: { sx: ['combat', 1000] } },
    string: { 7: { sx: ['combat', 20000] } },
    spider_eye: { 5: { ds: 'bane_of_arthropods' }, 6: { ds: 'venomous' }, 8: { sx: ['combat', 25000] } },
    gunpowder: { 5: { ds: 'thunderlord' }, 7: { sx: ['combat', 10000] } },
    ender_pearl: { 3: { ds: 'ender_slayer' } },
    ghast_tear: { 2: { ds: 'giant_killer' }, 4: { ds: 'vampirism' } },
    blaze_rod: { 2: { ds: 'fire_aspect' }, 8: { sx: ['combat', 10000] } },
    slime_ball: { 6: { ds: 'punch' } },
  };
  // 인챈트키 → [컬렉션, 티어] 역인덱스 (부여 비용 -25% 판정용)
  const ENCH_COL_DISCOUNT = {};
  for (const ck in COL_TIER_FX) for (const t in COL_TIER_FX[ck]) if (COL_TIER_FX[ck][t].ds) ENCH_COL_DISCOUNT[COL_TIER_FX[ck][t].ds] = [ck, Number(t)];
  // V27-E: 채굴/농사/벌목 티어 요구량 = wiki.hypixel.net 확정값(3표 검증). 전투/낚시도 V30에서 위키 정합.
  const COLLECTIONS = [
    { category: '채굴', key: 'mining', resources: [
      res('stone', '돌', 2, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 40000, 70000]),   /* 위키 확정: IX/X=40k/70k */   /* V23-B: '조약돌' 중복 이름 해소 — 채집/제련 돌='돌', 건축 블럭 cobblestone='조약돌' */   /* V23-B: '조약돌' 중복 이름 해소 — 채집/제련 돌='돌', 건축 블럭 cobblestone='조약돌' */ res('coal', '석탄', 3, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]), res('iron', '철 주괴', 6, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 200000, 400000]),   /* 위키 확정 12티어 */
      res('gold', '금 주괴', 12, 0, [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 500000]),   /* 위키 확정: X=500k */ res('lapis', '청금석', 8, 0, [250, 500, 1000, 2000, 10000, 25000, 50000, 100000, 150000, 250000]), res('redstone', '레드스톤', 7, 0, [100, 250, 750, 1500, 3000, 5000, 10000, 25000, 50000, 200000, 400000, 600000, 800000, 1000000, 1200000, 1400000]),   /* 위키 확정 16티어 */
      res('diamond', '다이아몬드', 45, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]), res('emerald', '에메랄드', 25, 0, [50, 100, 250, 1000, 5000, 15000, 30000, 50000, 100000]), res('obsidian', '흑요석', 18, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]),
    ] },
    { category: '농사', key: 'farming', resources: [
      res('wheat', '밀', 3, 0, [50, 100, 250, 500, 1000, 2500, 10000, 15000, 25000, 50000, 100000]), res('carrot', '당근', 3, 0, [100, 250, 500, 1750, 5000, 10000, 25000, 50000, 100000]), res('potato', '감자', 3, 0, [100, 200, 500, 1750, 5000, 10000, 25000, 50000, 100000]),
      res('pumpkin', '호박', 6, 0, [40, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000]), res('melon', '수박', 5, 0, [250, 500, 1250, 5000, 15000, 25000, 50000, 100000, 250000]), res('sugarcane', '사탕수수', 4, 0, [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]),
    ] },
    { category: '벌목', key: 'foraging', resources: [
      res('oaklog', '참나무 원목', 5, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]), res('birchlog', '자작나무 원목', 5, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]),
      res('sprucelog', '가문비 원목', 6, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]),
      res('dark_oak_log', '짙은 참나무 원목', 6, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]),
      res('acacia_log', '아카시아 원목', 6, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]),
      res('jungle_log', '정글나무 원목', 6, 0, [50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000]),
    ] },
    { category: '낚시', key: 'fishing', resources: [
      res('rawfish', '생선', 4, 0, [20, 50, 100, 250, 500, 1000, 2500, 15000, 30000, 45000, 60000]), res('salmon', '연어', 7, 0, [20, 50, 100, 250, 500, 1000, 2500, 5000, 10000]), res('clownfish', '열대어', 20, 0, [10, 25, 50, 100, 200, 400, 800, 1600, 4000]),
      res('pufferfish', '복어', 12, 0, [20, 50, 100, 150, 400, 800, 2400, 4800, 9000, 18000]), res('prismarine', '프리즈마린 조각', 9, 0, [10, 25, 50, 100, 200, 400, 800]),
      res('sponge', '스펀지', 30, 0, [20, 50, 100, 250, 500, 1000, 1500, 2000, 4000]), res('clay', '점토', 4, 0, [50, 100, 250, 1000, 1500, 2500, 5000]),
    ] },
    { category: '전투', key: 'combat', resources: [
      res('rotten_flesh', '썩은 살점', 2, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]), res('bone', '뼈', 3, 0, [50, 100, 250, 500, 1000, 5000, 10000, 25000, 50000, 150000]), res('string', '거미줄', 4, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]),
      res('ender_pearl', '엔더 진주', 15, 0, [50, 250, 1000, 2500, 5000, 10000, 15000, 25000, 50000]), res('blaze_rod', '블레이즈 막대', 20, 0, [50, 250, 1000, 2500, 5000, 10000, 25000, 50000]),
      res('magma_cream', '마그마 크림', 8, 0, [50, 250, 1000, 2500, 5000, 10000, 25000, 50000]), res('ghast_tear', '가스트의 눈물', 40, 0, [20, 250, 1000, 2500, 5000, 10000, 25000]),
      res('spider_eye', '거미 눈', 5, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]), res('slime_ball', '슬라임볼', 4, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]),
      res('gunpowder', '화약', 6, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]),
    ] },
    { category: '축산', key: 'husbandry', resources: [
      res('feather', '깃털', 3, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]), res('leather', '가죽', 5, 0, [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]),
      // V76: 위키 대조 — Raw Porkchop 9T / Raw Chicken 10T / Mutton 10T (실사다리·실판매가)
      res('raw_porkchop', '생돼지고기', 5, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000]),
      res('raw_chicken', '생닭', 4, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]),
      res('raw_mutton', '생양고기', 5, 0, [50, 100, 250, 1000, 2500, 5000, 10000, 25000, 50000, 100000]),
    ] },
  ];
  // V39: 위키에 없는 컬렉션은 제외하되 아이템/레시피는 유지 — 별도 원자재 목록
  const EXTRA_RES = [res('apple', '사과', 8, 20), res('ender_shard', '엔더 조각', 22, 0, [10, 25, 75, 250, 1000])];

  // 실제 하이픽셀 스카이블럭 스킬 XP 테이블(위키): 레벨 n→n+1 필요 XP. 최대 50레벨.
  // V16: 실제 하이픽셀 스카이블럭 스킬 XP 표(위키 검증). L1~L50는 실제와 100% 일치, L51~L60 확장.
  // 누적: L50=55,172,425 / L60=111,672,425 (딥리서치 검증).
  const SKILL_XP_TABLE = [
    50, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3500,
    5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 200000,
    300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000,
    1300000, 1400000, 1500000, 1600000, 1700000, 1800000, 1900000, 2000000, 2100000, 2200000,
    2300000, 2400000, 2500000, 2600000, 2750000, 2900000, 3100000, 3400000, 3700000, 4000000,
    4300000, 4600000, 4900000, 5200000, 5500000, 5800000, 6100000, 6400000, 6700000, 7000000,
  ];
  const SKILL_MAX_LEVEL = 60;
  // 실제 스카이블럭 스킬별 상한(공식 Hypixel API resources/skyblock/skills 대조): 전투/채광/농사/마법부여/조련 60, 벌목/낚시/연금술 50, 사교/사냥 25
  // V126: 실제 상한 정합 — 조련/벌목/낚시/연금술/사냥 50, 전투/채광/농사/마법부여 60, 사교 25
  const SKILL_MAX_BY = { combat: 60, mining: 60, farming: 60, enchanting: 60, taming: 50, foraging: 50, fishing: 50, alchemy: 50, social: 25, hunting: 50 };
  const SKILLS = [
    { key: 'combat', name: '전투', bonusText: '레벨당 최종 피해 +4%, 크리 확률 +0.5%' },
    { key: 'mining', name: '채광', bonusText: '레벨당 방어력 +1' },
    { key: 'farming', name: '농사', bonusText: '레벨당 체력 +2' },
    { key: 'foraging', name: '벌목', bonusText: '레벨당 힘 +1' },
    { key: 'fishing', name: '낚시', bonusText: '레벨당 체력 +1' },
    { key: 'enchanting', name: '마법부여', bonusText: '레벨당 지력(마나) +2' },
    { key: 'alchemy', name: '연금술', bonusText: '레벨당 지력 +1 (실제 스카이블럭) — 물약 양조로 성장, 레벨이 오르면 양조 물약 티어 상승' },
    { key: 'taming', name: '조련', bonusText: '레벨당 펫 경험치 +1%' },
    { key: 'social', name: '사교', bonusText: '5레벨마다 상점 판매가 +1%(최대 +10%)' },
    { key: 'hunting', name: '사냥', bonusText: '속성 파편 사이펀 해금(희귀도별 요구 레벨: 고급5/희귀10/영웅15/전설20 — 실제 스카이블럭). 상한 50' },
  ];

  /* ---------------- 기본 스탯(실제 스카이블럭 기본값 그대로) ---------------- */
  // 피해 = (5+무기공격)×(1+힘/100)×(스킬/인챈트/리포지/스타포스 배율)×크리티컬
  // 피해 감소 = 방어/(방어+100), 이동속도 100 = 기준 속도
  // V126: 실측 기본스탯 — 지능 0(마나 = 100 + 지능), 해양생물확률 20, 진방어 0, 펫운 0
  const BASE_STATS = { hp: 100, defense: 0, strength: 0, speed: 100, critChance: 30, critDamage: 50, intelligence: 0 };
  // V20: 신규 스탯 기본치 — 매직파인드(희귀드롭%)·포춘(추가채집)·공격속도 · V126: 해양생물/진방어/펫운 추가
  const BASE_STATS2 = { magicFind: 0, miningFortune: 0, farmingFortune: 0, foragingFortune: 0, attackSpeed: 0, miningSpeed: 0, seaCreatureChance: 20, trueDefense: 0, petLuck: 0 };
  /* ---------------- V20: 젬스톤(장비 소켓) — 실제 스카이블럭 8종 × 5품질 ---------------- */
  const GEM_TYPES = [
    { key: 'ruby', name: '루비', stat: 'hp' }, { key: 'jasper', name: '재스퍼', stat: 'str' },
    { key: 'sapphire', name: '사파이어', stat: 'intelligence' }, { key: 'amethyst_gem', name: '자수정 젬', stat: 'defense' },
    { key: 'jade', name: '제이드', stat: 'miningFortune' }, { key: 'amber', name: '앰버', stat: 'miningSpeed' },
    { key: 'topaz', name: '토파즈', stat: 'pristine' }, { key: 'opal', name: '오팔', stat: 'trueDefense' },
  ];
  // 품질별 배율(러프→완벽). 스탯별 기본값 × 배율
  const GEM_QUALITY = [
    { key: 'rough', name: '러프', mul: 1 }, { key: 'flawed', name: '플로드', mul: 2 },
    { key: 'fine', name: '파인', mul: 4 }, { key: 'flawless', name: '플로리스', mul: 8 }, { key: 'perfect', name: '퍼펙트', mul: 15 },
  ];
  const GEM_BASE = { hp: 12, str: 3, intelligence: 6, defense: 4, miningFortune: 5, farmingFortune: 5, critChance: 0.6, critDamage: 4, miningSpeed: 20, trueDefense: 2, pristine: 0.4 };   // V106: 앰버=채굴속도, 오팔=진방어, 토파즈=프리스틴(위키 실측)
  // V111: 위키 실측 젬스톤 스탯값 — 전설(Legendary) 등급 기준, 품질 [러프,플로드,파인,플로리스,퍼펙트]
  //   (실제는 아이템 희귀도별로 다르나 게임은 등급 비의존이라 엔드게임 표준인 전설 기준 채택)
  const GEM_STAT_VALUES = {
    hp: [5, 8, 10, 18, 24], defense: [5, 8, 10, 18, 24], str: [3, 4, 6, 10, 13],
    intelligence: [6, 10, 11, 17, 24], miningFortune: [10, 14, 20, 27, 40],
    miningSpeed: [20, 24, 36, 58, 80], trueDefense: [2, 3, 4, 8, 11], pristine: [0.4, 0.8, 1.2, 1.6, 2],
  };
  // 아이템 등급별 젬 소켓 수
  const GEM_SLOTS_BY_TIER = { common: 0, uncommon: 0, rare: 1, epic: 1, legendary: 2, mythic: 2, ancient: 3, divine: 3, primal: 4 };
  // 리컴보뷸레이터 3000: 아이템 등급 1단계 상승(수치 +18%) — 실제 스블 상징 아이템
  const RECOMB = { statBoostPct: 18 };

  /* ---------------- 채집(4개 존: 광산/농장/숲/부둣가) ---------------- */
  const GATHER_TABLE = {
    mine: { skill: 'mining', toolFamily: 'pickaxe', drops: [
      { key: 'stone', weight: 38, min: 1, max: 3 }, { key: 'coal', weight: 18, min: 1, max: 2 },
      { key: 'iron', weight: 14, min: 1, max: 2 }, { key: 'gold', weight: 9, min: 1, max: 2 },
      { key: 'lapis', weight: 8, min: 1, max: 3 }, { key: 'redstone', weight: 7, min: 1, max: 3 },
      { key: 'diamond', weight: 3, min: 1, max: 1 }, { key: 'emerald', weight: 2, min: 1, max: 1 },
      { key: 'obsidian', weight: 1, min: 1, max: 1 },
      // V94: 기초 자재 출처 부재(모래/자갈/석영 → 유리·TNT·화강암 등 90여 레시피 잠금) 해소
      { key: 'sand', weight: 10, min: 1, max: 3 }, { key: 'gravel', weight: 9, min: 1, max: 3 }, { key: 'quartz', weight: 5, min: 1, max: 2 },
    ] },
    farm: { skill: 'farming', toolFamily: 'hoe', drops: [
      { key: 'wheat', weight: 28, min: 1, max: 4 }, { key: 'carrot', weight: 22, min: 1, max: 3 },
      { key: 'potato', weight: 22, min: 1, max: 3 }, { key: 'sugarcane', weight: 12, min: 1, max: 3 },
      { key: 'pumpkin', weight: 9, min: 1, max: 1 }, { key: 'melon', weight: 7, min: 1, max: 2 },
    ] },
    forest: { skill: 'foraging', toolFamily: 'axe', drops: [
      { key: 'oaklog', weight: 42, min: 1, max: 3 }, { key: 'birchlog', weight: 30, min: 1, max: 2 },
      { key: 'sprucelog', weight: 20, min: 1, max: 2 }, { key: 'apple', weight: 8, min: 1, max: 1 },
    ] },
    dock: { skill: 'fishing', toolFamily: 'rod', drops: [
      { key: 'rawfish', weight: 40, min: 1, max: 1 }, { key: 'salmon', weight: 20, min: 1, max: 1 },
      { key: 'clay', weight: 14, min: 1, max: 2 }, { key: 'pufferfish', weight: 12, min: 1, max: 1 },
      { key: 'prismarine', weight: 8, min: 1, max: 1 }, { key: 'clownfish', weight: 4, min: 1, max: 1 },
      { key: 'sponge', weight: 2, min: 1, max: 1 },
    ] },
  };

  /* ---------------- 도구(존별 4계열 × 5티어, 수확량 배율) ---------------- */
  // 도구 없음 = 0.5배. 상위 도구 보유 시 최고 티어의 배율 적용.
  // V21-D: 금 도구 티어 추가(바닐라 도구 6종 완성 — 나무/돌/철/금/다이아/태초)
  const TOOL_TIER_NAMES = ['나무', '돌', '철', '금', '다이아', '태초의'];
  const TOOL_MULS = [1.0, 1.2, 1.45, 1.6, 1.75, 2.2];
  const TOOL_PRICES = [0, 0, 0, 0, 0, 0];   // V7: 도구는 조합 전용(무화폐 구매 경제)
  const TOOL_FAMILY_NAMES = { pickaxe: '곡괭이', hoe: '괭이', axe: '도끼', shovel: '삽', rod: '낚싯대' };   // V27-D: 삽(흙/모래/자갈 클래스)
  const TOOL_TIER_KEYS = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'ancient'];
  const TOOL_REQS = [0, 1, 3, 4, 6, 10];   // V7: 티어별 요구 스킬 레벨(곡괭이=채광 등)
  const TOOLS = {};   // family -> [{key,name,mul,price,req}] 낮은 티어부터
  Object.keys(TOOL_FAMILY_NAMES).forEach(fam => {
    TOOLS[fam] = TOOL_TIER_KEYS.map((tk, i) => ({
      key: fam === 'rod' && i === 0 ? 'fishing_rod' : `${tk}_${fam}`,   // 기존 세이브 호환(fishing_rod 키 유지)
      name: fam === 'rod' && i === 0 ? '낚싯대' : `${TOOL_TIER_NAMES[i]} ${TOOL_FAMILY_NAMES[fam]}`,
      mul: TOOL_MULS[i], price: 0, req: TOOL_REQS[i],
    }));
  });

  /* ---------------- 미니언 20종 ---------------- */
  // 실제 스카이블럭처럼 11티어(위키: 미니언은 최대 11~12티어) — 고티어는 기하급수 골드 싱크
  // 실제 스카이블럭식: 미니언은 골드 구매가 아니라 "자원으로 조합"한다.
  //   T1 = 원자재 80개 · T2~T6 = 원자재 160/320/512/1024/2048 · T7~T11 = 인챈티드 자원 8/16/32/64/128
  // V109: 실측 미니언 저장량 — 티어 밴드별(위키 그대로): I~II 64, III~V 192, VI~VII 320, VIII~IX 448, X~XI 576, XII 704
  // V126: 실측 미니언 내장 저장 — 64→960(티어 XI=960). 대부분 미니언 최대 티어 XI
  const MINION_STORAGE_BY_TIER = { 1: 64, 2: 64, 3: 192, 4: 192, 5: 192, 6: 320, 7: 320, 8: 448, 9: 448, 10: 576, 11: 960 };
  function mkMinionTiers(baseInterval, resource) {
    const rawCost = [80, 160, 320, 512, 1024, 2048];
    const tiers = [];
    for (let t = 1; t <= 11; t++) {   // V126: 실측 최대 티어 XI(대부분 미니언)
      const mat = t <= 6 ? { key: resource, n: rawCost[t - 1] } : { key: `enchanted_${resource}`, n: 8 * Math.pow(2, t - 7) };
      // V126: 기하감쇠 과속 폐기 → 실측식 완만 감소(티어 XI ≈ 기본의 57%)
      tiers.push({ tier: t, intervalSec: +(baseInterval * (1 - 0.043 * (t - 1))).toFixed(1), craftCost: mat, storage: MINION_STORAGE_BY_TIER[t] });
    }
    return tiers;
  }
  function minion(key, name, resource, baseInterval, baseCost) { return { key, name, resource, tiers: mkMinionTiers(baseInterval, resource), maxTier: 11, unlockCollection: resource }; }
  const MINIONS = [
    minion('cobblestone_minion', '돌 미니언', 'stone', 27, 80),   /* V23-B: 생산 자원(돌)과 이름 일치 */
    minion('coal_minion', '석탄 미니언', 'coal', 27, 80),
    minion('iron_minion', '철 미니언', 'iron', 28, 80),
    minion('gold_minion', '금 미니언', 'gold', 29, 120),
    minion('lapis_minion', '청금석 미니언', 'lapis', 29, 120),
    minion('redstone_minion', '레드스톤 미니언', 'redstone', 29, 120),
    minion('diamond_minion', '다이아 미니언', 'diamond', 32, 400),
    minion('emerald_minion', '에메랄드 미니언', 'emerald', 33, 400),
    minion('obsidian_minion', '흑요석 미니언', 'obsidian', 36, 500),
    minion('wheat_minion', '밀 미니언', 'wheat', 25, 80),
    minion('carrot_minion', '당근 미니언', 'carrot', 25, 80),
    minion('potato_minion', '감자 미니언', 'potato', 25, 80),
    minion('pumpkin_minion', '호박 미니언', 'pumpkin', 30, 150),
    minion('melon_minion', '수박 미니언', 'melon', 28, 150),
    minion('sugarcane_minion', '사탕수수 미니언', 'sugarcane', 24, 80),
    minion('oak_minion', '참나무 미니언', 'oaklog', 26, 80),
    minion('birch_minion', '자작나무 미니언', 'birchlog', 26, 80),
    minion('spruce_minion', '가문비 미니언', 'sprucelog', 27, 100),
    minion('dark_oak_minion', '짙은 참나무 미니언', 'dark_oak_log', 27, 100),
    minion('acacia_minion', '아카시아 미니언', 'acacia_log', 27, 100),
    minion('jungle_minion', '정글나무 미니언', 'jungle_log', 27, 100),
    minion('fishing_minion', '낚시 미니언', 'rawfish', 30, 60),
    minion('clay_minion', '점토 미니언', 'clay', 26, 60),
    // V9: 전투/축산 미니언(실제 스카이블럭 로스터)
    minion('zombie_minion', '좀비 미니언', 'rotten_flesh', 26, 80),
    minion('skeleton_minion', '스켈레톤 미니언', 'bone', 26, 80),
    minion('spider_minion', '거미 미니언', 'string', 26, 80),
    minion('slime_minion', '슬라임 미니언', 'slime_ball', 26, 120),
    minion('blaze_minion', '블레이즈 미니언', 'blaze_rod', 33, 400),
    minion('cow_minion', '소 미니언', 'leather', 26, 80),
    minion('chicken_minion', '닭 미니언', 'raw_chicken', 26, 80),   // V76: 위키 — 생닭 생산, Raw Chicken I 해금
    minion('pig_minion', '돼지 미니언', 'raw_porkchop', 26, 80),      // V76: 위키 — Raw Porkchop I 해금
    minion('sheep_minion', '양 미니언', 'raw_mutton', 24, 80),        // V76: 위키 — Mutton I 해금
    minion('ghast_minion', '가스트 미니언', 'ghast_tear', 36, 500),
    // V10: 컬렉션 수(39)와 동일하게 — 나머지 11종
    minion('apple_minion', '사과 미니언', 'apple', 30, 80),
    minion('salmon_minion', '연어 미니언', 'salmon', 30, 100),
    minion('clownfish_minion', '광대어 미니언', 'clownfish', 34, 200),
    minion('pufferfish_minion', '복어 미니언', 'pufferfish', 32, 150),
    minion('prismarine_minion', '프리즈마린 미니언', 'prismarine', 31, 150),
    minion('sponge_minion', '스펀지 미니언', 'sponge', 36, 300),
    minion('magma_cube_minion', '마그마 큐브 미니언', 'magma_cream', 31, 200),
    minion('cave_spider_minion', '동굴 거미 미니언', 'spider_eye', 27, 90),
    minion('creeper_minion', '크리퍼 미니언', 'gunpowder', 29, 120),
    minion('endermite_minion', '엔더마이트 미니언', 'ender_shard', 34, 300),
    minion('enderman_minion', '엔더맨 미니언', 'ender_pearl', 33, 300),
  ];
  // V39: 위키 해금 보정 — 컬렉션에서 빠진 자원의 미니언은 관련 컬렉션으로, 낚시 미니언은 생선 II
  MINIONS.find(m => m.key === 'apple_minion').unlockCollection = 'oaklog';
  MINIONS.find(m => m.key === 'endermite_minion').unlockCollection = 'ender_pearl';
  MINIONS.find(m => m.key === 'fishing_minion').unlockTier = 2;
  const MINION_STORAGE_BASE = 15, MINION_STORAGE_UPGRADED = 24, MINION_STORAGE_UPGRADE_COST = 5000;
  const MINION_OFFLINE_CAP_HOURS = 48;
  const MINION_SLOT_MAX = 31, MINION_SLOT_COST_BASE = 6000, MINION_SLOT_COST_MUL = 1.6;
  // V10 ⑱: 필드 미니보스 유니크 전리품(드롭 전용)
  const MINIBOSS_LOOT = [
    { key: 'yeti_fur', name: '예티의 모피', category: '전리품', buyPrice: 0, sellPrice: 2800 },
    // V75/V76: 농장 동물 실드롭 — 생소고기만 전리품(소고기는 실제 컬렉션 아님), 나머지 3종은 축산 컬렉션 원자재로 자동 생성
    { key: 'raw_beef', name: '생소고기', category: '전리품', buyPrice: 0, sellPrice: 4 },
    { key: 'poisonous_potato', name: '독감자', category: '전리품', buyPrice: 0, sellPrice: 2 },   // V77: 좀비 드롭(위키)
    { key: 'summoning_eye', name: '소환의 눈', category: '전리품', buyPrice: 0, sellPrice: 40000 },   // V80: 특수 질럿 드롭(위키, 1/420) — 드래곤 소환 재료
    { key: 'golem_core', name: '골렘의 코어', category: '전리품', buyPrice: 0, sellPrice: 2200 },
    { key: 'mushroom_crown', name: '무쉬룸 킹의 왕관', category: '전리품', buyPrice: 0, sellPrice: 1500 },
  ];
  const MINION_FUEL = { key: 'minion_fuel_coal', name: '석탄 연료 (+5%)', speedMul: 1.05, durationHours: 0.39, price: 800 };   // V126: 실측 — 석탄 +5%, 23.4분
  const MINION_FUEL2 = { key: 'minion_fuel_lava', name: '인챈티드 용암 양동이 (+25%)', speedMul: 1.25, durationHours: 0 };   // V126: 실측 — +25%, 무한(비소모)

  /* ---------------- 슬레이어 5종(실제 스카이블럭 라인업) ---------------- */
  // rareDropTable: 실제 아이템 키 배열(승리 시 인벤토리에 실제 지급). [자주(60%), 가끔(30%), 희귀(10%)]
  // V17: 실제 하이픽셀 보스 HP — 리븐넌트(좀비) 500/20k/400k/1.5M/10M 확정 앵커 기준, 계열별 실측 스케일.
  //   HP는 명시 테이블(hpTable), 피해는 계열배율(mulScale)^0.30로 완만화(실제 HP에서도 엔드게임 유효체력으로 생존 가능).
  //   피해 감소·유효체력이 함께 실제 규모로 커지므로(V17-A/C) 만렙이 10M~수억 HP 보스를 실제처럼 잡을 수 있음.
  // V107: 실측 슬레이어 소환 비용 — 표준 계열(좀비/거미/늑대/엔더맨)은 티어별 동일, 인페르노(블레이즈)만 상이
  const SLAYER_COST_STD = [100, 2000, 10000, 50000, 100000];   // V126: 실제 스블 표준 슬레이어 의뢰 비용(T1=100…T5=100k)
  const SLAYER_COST_INFERNO = [10000, 25000, 60000, 150000, 350000];
  function mkSlayerTiers(hpTable, baseDmg, baseXp, baseCoin, mulScale, lootByTier, costTable) {
    const dmgMul = [1, 2.6, 6.8, 17.6, 45.7], xpMul = [1, 5, 20, 100, 300], coinMul = [1, 8, 24, 80, 240];
    const cost = costTable || SLAYER_COST_STD;
    return lootByTier.map((loot, i) => ({
      tier: i + 1,
      turnInGold: cost[i],
      hp: hpTable[i],
      dmg: Math.round(baseDmg * dmgMul[i] * Math.pow(mulScale, 0.30)),
      xpReward: Math.round(baseXp * xpMul[i]),
      coinReward: Math.round(baseCoin * coinMul[i] * Math.pow(mulScale, 0.6)),
      rareDropTable: loot,
      minCombatLevel: Math.min(30, Math.round(i * 6 + Math.log(mulScale) / Math.log(6.9) * 5)),
    }));
  }
  // V9: 슬레이어 레벨 XP(계열별 누적: 실제 스카이블럭 5/15/200/1000/5000/20000/100000/400000/1000000)
  const SLAYER_XP_LEVELS = [5, 15, 200, 1000, 5000, 20000, 100000, 400000, 1000000];
  const SLAYER_QUEST = { killsNeeded: [5, 10, 15, 20, 25], xpPerTier: [5, 25, 100, 500, 1500] };   // 티어별 처치 수/보스 XP
  const SLAYERS = [
    { key: 'zombie_slayer', uniqueDrop: 'reaper_scythe', name: '좀비 슬레이어', flavor: '리븐넌트 호러', dropResource: 'rotten_flesh', tiers: mkSlayerTiers([500, 20000, 400000, 1500000, 10000000], 25, 5, 300, 1, [
      ['rotten_flesh', 'reforge_stone_common', 'talisman_zombie'],
      ['rotten_flesh', 'enchant_book_sharpness', 'talisman_campfire'],
      ['rotten_flesh', 'weapon_epic', 'enchant_book_growth'],
      ['rotten_flesh', 'talisman_dragon_claw', 'pet_egg_enderman'],
      ['rotten_flesh', 'reforge_stone_rare', 'hot_potato_book'],
    ]) },
    { key: 'spider_slayer', uniqueDrop: 'scorpion_foil', name: '거미 슬레이어', flavor: '타란튤라 브루드파더', dropResource: 'string', tiers: mkSlayerTiers([750, 40000, 900000, 3200000, 12000000], 25, 5, 300, 6.9, [   // V96 C13: T1 위키 실측 750
      ['string', 'reforge_stone_common', 'talisman_spider_ring'],
      ['string', 'enchant_book_critical', 'talisman_wolf_claw'],
      ['string', 'armor_epic', 'enchant_book_protection'],
      ['string', 'talisman_lava_charm', 'pet_egg_wolf'],
      ['string', 'reforge_stone_rare', 'hot_potato_book'],
    ]) },
    { key: 'wolf_slayer', uniqueDrop: 'pooch_sword', name: '늑대 슬레이어', flavor: '스벤 팩마스터', dropResource: 'bone', tiers: mkSlayerTiers([2000, 60000, 1200000, 5000000, 20000000], 25, 6, 400, 47.6, [   // V96 C13: T1 위키 실측 2000
      ['bone', 'reforge_stone_rare', 'talisman_wolf_claw'],
      ['bone', 'enchant_book_first_strike', 'talisman_fisher_anklet'],
      ['bone', 'weapon_legendary', 'enchant_book_growth'],
      ['bone', 'talisman_dragon_heart', 'pet_egg_wolf'],
      ['bone', 'reforge_stone_rare', 'fuming_potato_book'],
    ]) },
    { key: 'enderman_slayer', uniqueDrop: 'voidedge_katana', name: '엔더맨 슬레이어', flavor: '보이드글룸 세라프', dropResource: 'ender_pearl', tiers: mkSlayerTiers([300000, 12000000, 50000000, 210000000, 500000000], 25, 8, 600, 328, [
      ['ender_pearl', 'reforge_stone_rare', 'talisman_deep_pearl'],
      ['ender_pearl', 'aspect_of_the_end', 'talisman_hourglass'],
      ['ender_pearl', 'armor_mythic', 'enchant_book_protection'],
      ['ender_pearl', 'aspect_of_the_dragon', 'pet_egg_enderman'],
      ['ender_pearl', 'reforge_stone_rare', 'fuming_potato_book'],
    ]) },
    { key: 'blaze_slayer', uniqueDrop: 'fire_fury_staff', name: '블레이즈 슬레이어', flavor: '인페르노 데몬로드', dropResource: 'blaze_rod', tiers: mkSlayerTiers([2500000, 10000000, 45000000, 150000000, 350000000], 25, 10, 900, 2266, [
      ['blaze_rod', 'reforge_stone_rare', 'talisman_lava_charm'],
      ['blaze_rod', 'enchant_book_looting', 'talisman_wealth_rune'],
      ['blaze_rod', 'midas_sword', 'enchant_book_sharpness'],
      ['blaze_rod', 'talisman_primal_shard', 'pet_egg_ender_dragon'],
      ['blaze_rod', 'fuming_potato_book', 'pet_egg_ender_dragon'],
    ], SLAYER_COST_INFERNO) },   // V107: 인페르노 실측 소환비용
  ];

  /* ---------------- 던전 — 카타콤 7층(F1~F7, 실제 보스 라인업) ---------------- */
  // V9: 던전 15개 난이도 = 엔트런스(F0) + 카타콤 F1~F7 + 마스터 모드 M1~M7(F7 클리어 해금)
  const MASTER_MODE = { hpMul: 3.5, dmgMul: 3.0, rewardMul: 3, unlockFloor: 7 };
  const DUNGEON = {
    floors: [
      { floor: 0, mobList: ['크립트 입구 좀비', '허약한 스켈레톤'], bossName: '수문장(입구)', bossHp: 4000, bossDmg: 25, lootTable: ['enchant_book_protection', 'enchant_book_sharpness', 'reforge_stone_common'], essenceReward: 4 },
      { floor: 1, mobList: ['좀비 견습생', '해골 파수병', '거미 새끼'], bossName: '본조 (광대)', bossHp: 12000, bossDmg: 35, lootTable: ['bonzo_staff', 'enchant_book_sharpness', 'reforge_stone_common'], essenceReward: 8 },
      { floor: 2, mobList: ['강화 좀비 기사', '저주받은 사제 부하'], bossName: '스카프 (해골 군주)', bossHp: 30000, bossDmg: 60, lootTable: ['talisman_scarf_studies', 'enchant_book_protection', 'reforge_stone_rare'], essenceReward: 14 },
      { floor: 3, mobList: ['수문장 골렘', '방벽 기사단'], bossName: '교수 (미치광이 연금술사)', bossHp: 70000, bossDmg: 95, lootTable: ['adaptive_armor', 'enchant_book_growth', 'pet_egg_silverfish'], essenceReward: 22 },
      { floor: 4, mobList: ['유령 늑대 무리', '영혼 결계병'], bossName: '쏜 (유령 수호자)', bossHp: 150000, bossDmg: 140, lootTable: ['spirit_bow', 'enchant_book_critical', 'pet_egg_ocelot'], essenceReward: 32 },
      { floor: 5, mobList: ['그림자 암살단', '분신 환영'], bossName: '리비드 (그림자 군주)', bossHp: 300000, bossDmg: 200, lootTable: ['livid_dagger', 'shadow_assassin_armor', 'enchant_book_giant_killer'], essenceReward: 45 },
      { floor: 6, mobList: ['거인 병사', '왕의 근위대'], bossName: '사단 (거인왕)', bossHp: 600000, bossDmg: 280, lootTable: ['giant_sword', 'juju_shortbow', 'enchant_book_looting', 'pet_egg_blue_whale'], essenceReward: 60 },
      { floor: 7, mobList: ['위더 기사', '지배자의 사도'], bossName: '네크론 (마지막 지배자)', bossHp: 1200000, bossDmg: 400, lootTable: ['necron_blade', 'hyperion', 'valkyrie', 'scylla', 'wither_armor', 'pet_egg_ender_dragon'], essenceReward: 85 },
      // V11: 지옥층 M8~M10 — M7 클리어 후 해금되는 극악 3난이도(마스터 토글 불가, 자체가 지옥)
      // V19-D 밸런스: 지옥층 매끄러운 램프(F7 1.2M → ×~4~5씩) — 엔드게임 딜(근접 ~1M·캐스터 ~2.8M)에 맞춘 처치시간
      { floor: 8, hell: true, mobList: ['화염 파수병', '용암 기사단'], bossName: '화염의 파수왕 이프리트', bossHp: 5000000, bossDmg: 650, lootTable: ['hot_potato_book', 'fuming_potato_book', 'astraea'], essenceReward: 130 },
      { floor: 9, hell: true, mobList: ['폭풍 정령', '뇌전 사도'], bossName: '뇌전의 지배자 라이젤', bossHp: 25000000, bossDmg: 950, lootTable: ['fuming_potato_book', 'terminator_bow', 'necron_blade', 'pet_egg_ender_dragon'], essenceReward: 180 },
      { floor: 10, hell: true, mobList: ['태초의 파편', '시간 정령'], bossName: '태초의 시간지기 크로노스', bossHp: 120000000, bossDmg: 1400, lootTable: ['fuming_potato_book', 'hot_potato_book', 'essence_cosmetic_cape'], essenceReward: 300 },
      // V19-B/D: 최종층 F11 — 스블 최강(보이드글룸 T4 2.1억)을 능가하는 창세 용신 보스(10억 HP, 실제×4.8, 게임 최강)
      { floor: 11, hell: true, apex: true, mobList: ['천공 수호병', '용의 그림자'], bossName: '창세의 용신 오리진', bossHp: 1000000000, bossDmg: 2200, lootTable: ['fuming_potato_book', 'hyperion', 'astraea', 'enchant_book_one_for_all', 'enchant_book_soul_eater', 'recombobulator', 'gem_ruby_perfect', 'reforge_stone_apex'], essenceReward: 600 },
    ],
    scoreThresholds: [ ['F', -Infinity], ['D', 0], ['C', 100], ['B', 160], ['A', 230], ['S', 270], ['S+', 300] ],
    roomTypes: ['전투방', '퍼즐방', '함정방', '미니보스방', '보물방'],
  };
  const DUNGEON_ROOM_SCORE = { combat: 40, puzzleSuccess: 30, puzzleFail: -14, miniboss: 50, treasure: 20, secretDoor: 40 };
  const ESSENCE_SHOP = [
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', cost: 15, kind: 'item' },
    { key: 'essence_gold_sack', name: '던전 정수 골드 주머니(500G)', cost: 10, kind: 'gold', goldAmount: 500 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', cost: 60, kind: 'item' },
    { key: 'enchant_book_sharpness', name: '인챈트북: 예리함', cost: 25, kind: 'item' },
    { key: 'pet_egg_griffin', name: '펫 알: 그리핀', cost: 200, kind: 'item' },
    // V20: 젬스톤/리컴 — 정수로 교환(고급은 던전/슬레이어 드롭이 더 저렴)
    { key: 'recombobulator', name: '💠 리컴보뷸레이터 3000(등급↑ +18%)', cost: 300, kind: 'item' },
    { key: 'gem_jasper_perfect', name: '💎 퍼펙트 재스퍼(힘+13)', cost: 120, kind: 'item' },   /* V111: 실측 전설 기준 */
    { key: 'gem_ruby_perfect', name: '💎 퍼펙트 루비(체력+24)', cost: 120, kind: 'item' },
    { key: 'gem_sapphire_perfect', name: '💎 퍼펙트 사파이어(지력+24)', cost: 120, kind: 'item' },
    { key: 'gem_amethyst_gem_perfect', name: '💎 퍼펙트 자수정(방어+24)', cost: 120, kind: 'item' },
    // V20-C: 펫 아이템(정수 교환)
    { key: 'petitem_tier_boost', name: '🐾 티어 부스트(펫 +10%)', cost: 250, kind: 'item' },
    { key: 'petitem_gold_claws', name: '🐾 황금 발톱(힘+30)', cost: 90, kind: 'item' },
    { key: 'petitem_bigger_teeth', name: '🐾 큰 이빨(치명피해+40)', cost: 90, kind: 'item' },
    { key: 'petitem_textbook', name: '🐾 교과서(지력+50)', cost: 90, kind: 'item' },
    { key: 'reforge_stone_apex', name: '🐉 신룡의 룬석(전설 리포지)', cost: 400, kind: 'item' },   // V20-D: 정수 교환(드롭이 주 획득처)
  ];

  /* ---------------- 등급별 장비(무기 3계열: 검/활/지팡이 × 7티어) + 던전 전용 장비 ---------------- */
  // 직업 상성(메이플식): 전사/도적→검, 궁수→활, 마법사→지팡이 — 상성 무기는 위력 +25%
  const WEAPON_NAMES = ['낡은 검', '강철 검', '기사의 장검', '용살자의 대검', '여명의 검', '천공의 인챈트 블레이드', '태초의 검'];
  const BOW_NAMES = ['나무 활', '사냥꾼의 활', '유격병의 장궁', '용린 활', '여명의 시위', '천공의 폭풍 활', '태초의 활'];
  const STAFF_NAMES = ['견습생 지팡이', '마도사의 지팡이', '현자의 스태프', '용언 지팡이', '여명의 마봉', '천공의 룬 스태프', '태초의 지팡이'];
  const ARMOR_NAMES = ['누더기 갑옷', '가죽 갑옷', '기사단 갑옷', '용비늘 갑옷', '여명의 갑옷', '천공의 신성 갑옷', '태초의 갑옷'];
  const EQUIPMENT = { weapons: [], armor: [], accessories: [] };
  // 티어별 상점 무기는 해당 티어 생성 무기 대역(base+0~14)의 상위권 값 — "그 티어의 확실한 선택지"
  const TIER_WEAPON_DMG = [20, 38, 55, 73, 91, 109, 126];
  const TIER_ARMOR_DEF = [12, 26, 38, 50, 60, 70, 76];
  ITEM_TIERS.slice(0, 7).forEach((t, i) => {   // V11: 레거시 생성은 7티어까지(신성/태초는 신규 DB 전용)
    const baseBuy = Math.round(60 * Math.pow(3.1, i));
    const dmg = TIER_WEAPON_DMG[i];
    EQUIPMENT.weapons.push({ key: `weapon_${t.key}`, name: WEAPON_NAMES[i], wclass: 'sword', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `bow_${t.key}`, name: BOW_NAMES[i], wclass: 'bow', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.weapons.push({ key: `staff_${t.key}`, name: STAFF_NAMES[i], wclass: 'staff', tierKey: t.key, dmg, buyPrice: 0, sellPrice: Math.round(baseBuy * 0.2) });
    EQUIPMENT.armor.push({ key: `armor_${t.key}`, name: ARMOR_NAMES[i], tierKey: t.key, defense: TIER_ARMOR_DEF[i], buyPrice: 0, sellPrice: Math.round(baseBuy * 1.3 * 0.2) });
  });
  // 던전/보스 전용 무기(상점 판매 X, 드롭 전용).
  // 실제 스카이블럭 방식: 같은 등급이면 외형(스프라이트)은 같고 이름·수치만 다른 무기가 여럿 존재
  // (예: Midas' Sword와 Aspect of the Dragons는 다른 무기지만 각자 등급 외형을 공유).
  // V17: 실제 하이픽셀 무기 데미지 사다리 + 부가 스탯(힘/치명피해/광포/지력, caster=지력 스케일 어빌리티)
  const DUNGEON_WEAPONS = [
    { key: 'bonzo_staff', name: '본조의 지팡이', wclass: 'staff', tierKey: 'rare', dmg: 90, intelligence: 100, caster: true, abilityDmg: 400, abilityScaling: 0.6, buyPrice: 0, sellPrice: 800 },
    { key: 'aspect_of_the_end', name: '종말의 형상(AOTE)', wclass: 'sword', tierKey: 'rare', dmg: 100, buyPrice: 0, sellPrice: 1500 },
    { key: 'spirit_bow', name: '영혼의 활', wclass: 'bow', tierKey: 'epic', dmg: 160, buyPrice: 0, sellPrice: 2500 },
    { key: 'livid_dagger', name: '리비드 대거', wclass: 'sword', tierKey: 'legendary', dmg: 180, critDamage: 40, critChance: 10, buyPrice: 0, sellPrice: 7000 },
    { key: 'midas_sword', name: '미다스의 검', wclass: 'sword', tierKey: 'legendary', dmg: 130, str: 50, buyPrice: 0, sellPrice: 12000 },
    { key: 'aspect_of_the_dragon', name: '용의 형상(AOTD)', wclass: 'sword', tierKey: 'legendary', dmg: 225, str: 100, buyPrice: 0, sellPrice: 14000 },
    { key: 'giant_sword', name: '거인의 대검', wclass: 'sword', tierKey: 'mythic', dmg: 500, abilityDmg: 9000, abilityStat: 'str', abilityScaling: 0.6, buyPrice: 0, sellPrice: 15000 },
    { key: 'necron_blade', name: '네크론의 검', wclass: 'sword', tierKey: 'ancient', dmg: 190, str: 100, abilityDmg: 8500, abilityStat: 'str', abilityScaling: 0.6, buyPrice: 0, sellPrice: 40000 },
    // V17: 위더 블레이드 4종(네크론의 검 + 촉매) — 실제 최종 캐스터 무기
    { key: 'hyperion', name: '히페리온', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, intelligence: 350, ferocity: 30, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'valkyrie', name: '발키리', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, ferocity: 60, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'scylla', name: '스킬라', wclass: 'sword', tierKey: 'mythic', dmg: 260, str: 150, critChance: 15, critDamage: 40, caster: true, abilityDmg: 9000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    { key: 'astraea', name: '아스트라이아', wclass: 'sword', tierKey: 'mythic', dmg: 270, str: 150, defense: 250, intelligence: 50, ferocity: 30, caster: true, abilityDmg: 9500, abilityScaling: 0.6, buyPrice: 0, sellPrice: 25000 },
    // V17: 최종 활(원거리 캐리)
    { key: 'juju_shortbow', name: '주주 단궁', wclass: 'bow', tierKey: 'legendary', dmg: 310, str: 40, critChance: 10, critDamage: 110, buyPrice: 0, sellPrice: 30000 },
    { key: 'terminator_bow', name: '터미네이터', wclass: 'bow', tierKey: 'mythic', dmg: 300, str: 130, critChance: 25, critDamage: 40, buyPrice: 0, sellPrice: 45000 },
    // V10: 슬레이어 계열 전용 유니크 무기(보스 티어2+ 희귀 드롭)
    { key: 'reaper_scythe', name: '리븐넌트 팔션', wclass: 'sword', tierKey: 'epic', dmg: 120, str: 40, buyPrice: 0, sellPrice: 3200 },
    { key: 'scorpion_foil', name: '스콜피온 포일', wclass: 'sword', tierKey: 'epic', dmg: 130, critChance: 15, buyPrice: 0, sellPrice: 4200 },
    { key: 'pooch_sword', name: '푸치 소드', wclass: 'sword', tierKey: 'legendary', dmg: 160, str: 60, buyPrice: 0, sellPrice: 9000 },
    { key: 'voidedge_katana', name: '보이드엣지 카타나', wclass: 'sword', tierKey: 'mythic', dmg: 200, str: 80, critDamage: 30, buyPrice: 0, sellPrice: 18000 },
    { key: 'fire_fury_staff', name: '화염 분노 지팡이', wclass: 'staff', tierKey: 'mythic', dmg: 220, intelligence: 200, ferocity: 20, caster: true, abilityDmg: 8000, abilityScaling: 0.6, buyPrice: 0, sellPrice: 22000 },
  ];
  // 아이템 초기 능력치 무작위 롤(실제 스카이블럭 감성): 같은 이름의 장비라도 획득 시
  // 기본 수치가 ±8% 범위에서 굴려져 고정됨(인챈트/리포지/스타포스와 완전 별개의 "생 초기치").
  const ITEM_ROLL = { pct: 0.08 };
  const DUNGEON_ARMORS = [
    { key: 'adaptive_armor', name: '적응형 갑옷', tierKey: 'epic', defense: 13, buyPrice: 0, sellPrice: 2500 },
    { key: 'shadow_assassin_armor', name: '그림자 암살자 갑옷', tierKey: 'legendary', defense: 15, buyPrice: 0, sellPrice: 7000 },
    { key: 'wither_armor', name: '위더 갑주', tierKey: 'ancient', defense: 18, buyPrice: 0, sellPrice: 40000 },
  ];
  EQUIPMENT.weapons = EQUIPMENT.weapons.concat(DUNGEON_WEAPONS).sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  EQUIPMENT.armor = EQUIPMENT.armor.concat(DUNGEON_ARMORS).sort((a, b) => a.defense - b.defense);

  /* ---------------- 스타포스 강화(메이플 시스템) ---------------- */
  // 무기/방어구 슬롯별 0~15성. 성공률은 성수가 오를수록 하락, 5성부터 실패 시 30% 확률로 1성 하락.
  const STARFORCE = {
    maxStars: 25,           // V20-B: 초월 강화 — 15→25성(16~25는 +α 초월 구간, 파괴 위험 급증)
    // 메이플식 체계: 성별 [성공, 유지, 하락, 파괴] — 파괴돼도 장비는 남고 리셋
    table: [
      [0.95, 0.05, 0.00, 0.00], [0.90, 0.10, 0.00, 0.00], [0.85, 0.15, 0.00, 0.00], [0.85, 0.15, 0.00, 0.00], [0.80, 0.20, 0.00, 0.00],   // →1~5성: 하락 없음
      [0.75, 0.25, 0.00, 0.00], [0.70, 0.30, 0.00, 0.00], [0.65, 0.35, 0.00, 0.00], [0.60, 0.40, 0.00, 0.00], [0.55, 0.45, 0.00, 0.00],   // →6~10성
      [0.50, 0.40, 0.10, 0.00], [0.45, 0.40, 0.15, 0.00], [0.40, 0.35, 0.18, 0.07], [0.35, 0.35, 0.21, 0.09], [0.30, 0.33, 0.26, 0.11],   // →11~15성: 하락/파괴 구간
      // →16~25성: 초월(Transcendent) — 성공률 급락·파괴율 급증(수만 시간 그라인드)
      [0.28, 0.30, 0.30, 0.12], [0.25, 0.28, 0.33, 0.14], [0.22, 0.26, 0.36, 0.16], [0.20, 0.24, 0.38, 0.18], [0.18, 0.22, 0.40, 0.20],   // →16~20성
      [0.15, 0.20, 0.43, 0.22], [0.13, 0.18, 0.45, 0.24], [0.11, 0.16, 0.47, 0.26], [0.09, 0.14, 0.49, 0.28], [0.07, 0.13, 0.50, 0.30],   // →21~25성
    ],
    boomResetTo: 12,        // 15성 이하 파괴 시 12성 / 16성+ 파괴 시 boomResetToHigh
    boomResetToHigh: 20,    // V20-B: 초월 구간 파괴 시 20성으로(완전 초기화 방지)
    chanceTime: true,       // 2연속 하락 → 다음 강화 100% 성공(찬스 타임)
    costBase: 400, costMul: 1.55,
    // 구간별 스탯 상승(뒤 구간일수록 큰 폭 — 단순 %/성 아님)
    weaponAtkPctByBand: [2, 3, 5, 9],    // 1~5 +2% · 6~10 +3% · 11~15 +5% · 16~25 +9%/성(초월)
    armorDefByBand: [2, 3, 5, 9],
    armorHpByBand: [6, 10, 16, 28],
  };

  /* ---------------- 리포지(실제 스카이블럭 리포지 명칭) ---------------- */
  // 기본 리포지(무작위): 무기 Sharp/Spicy/Heroic/Legendary 등 / 리포지 스톤: Fabled(무기)·Ancient(방어구)
  const REFORGES = {
    weapon: [
      { key: 'sharp', name: '예리한', dmgPct: 8 }, { key: 'spicy', name: '매콤한', dmgPct: 10 },
      { key: 'heroic', name: '영웅적인', dmgPct: 7, hp: 10 }, { key: 'legendary_r', name: '전설적인', dmgPct: 12 },
      { key: 'fast', name: '재빠른', dmgPct: 5 }, { key: 'rich', name: '부유한', dmgPct: 4, sellBonus: 2 },
      // V17: 엔드게임 무기 리포지(힘/치명피해/광포 — 실제 스카이블럭 최상급). stone=리포지 스톤 전용(무작위 풀 제외)
      { key: 'withered', name: '시든(Withered)', dmgPct: 18, str: 25, critDamage: 20, stone: true },
      { key: 'fabled', name: '전설의(Fabled)', dmgPct: 16, critChance: 4, critDamage: 12, str: 10, stone: true },
      { key: 'gilded', name: '금빛의(Gilded)', dmgPct: 10, str: 20, ferocity: 12, stone: true },
      // V20-D: +α 최상급 리포지 — 신룡의 룬석 전용(신룡/드래곤 테마)
      { key: 'draconic', name: '신룡의(Draconic)', dmgPct: 22, str: 35, critDamage: 25, ferocity: 10, stone: true },
    ],
    armor: [
      { key: 'wise', name: '현명한(Wise)', int: 30 }, { key: 'pure', name: '순수한', def: 6, hp: 6 },   /* V107: 실측 — 현명한은 지력 리포지(와이즈 드래곤 프래그먼트) */
      { key: 'titanic', name: '타이타닉', def: 8, hp: 8 }, { key: 'heavy', name: '묵직한', def: 12 },
      { key: 'clean', name: '깔끔한', def: 5, hp: 10 },
      // V17: 엔드게임 방어구 리포지(부위당 힘/치명피해/광포 — 4부위 합산으로 대폭 성장). stone=스톤 전용
      { key: 'necrotic', name: '괴사의(Necrotic)', def: 5, hp: 5, int: 90, stone: true },   /* V107: 실측 — 괴사의는 지력 리포지(네크로맨서 브로치), str→int */
      { key: 'renowned', name: '명성의(Renowned)', def: 8, hp: 40, str: 28, critDamage: 8, stone: true },
      { key: 'ancient_r', name: '고대의(Ancient)', def: 14, hp: 20, str: 12, ferocity: 4, stone: true },
      { key: 'necron_r', name: '지배자의(Necron)', def: 12, hp: 25, str: 22, critDamage: 6, stone: true },
      // V20-D: +α 최상급 리포지 — 신룡의 룬석 전용(천상/신성 테마)
      { key: 'celestial', name: '천상의(Celestial)', def: 12, hp: 45, str: 45, critDamage: 12, ferocity: 6, stone: true },
    ],
    // 리포지 스톤 전용(확정 최상급): reforge_stone_rare 소모
    premium: { weapon: { key: 'withered', name: '시든(Withered)', dmgPct: 18, str: 25, critDamage: 20 }, armor: { key: 'necrotic', name: '괴사의(Necrotic)', def: 5, hp: 5, int: 90 } },   /* V107: 괴사의 str→int */
    // V20-D: 신룡의 룬석(reforge_stone_apex, F11 드롭) 전용 — +α 최상급 리포지(신룡/천상)
    premiumApex: { weapon: { key: 'draconic', name: '신룡의(Draconic)', dmgPct: 22, str: 35, critDamage: 25, ferocity: 10 }, armor: { key: 'celestial', name: '천상의(Celestial)', def: 12, hp: 45, str: 45, critDamage: 12, ferocity: 6 } },
  };


  /* ---------------- 대량 장비 생성 — 계열별 100종 이상(쓰레기~신급) ----------------
     실제 스카이블럭처럼: 같은 등급이면 외형(스프라이트)은 등급 셀을 공유하고,
     이름과 수치만 다른 장비가 티어당 15종씩 존재. 티어 내 하위 2종만 상점 구매 가능(기본템),
     나머지 13종은 몬스터/슬레이어/던전/보물방 드롭 전용 — 드롭템이 이 게임의 메인 획득 경로. */
  const GEN_TIER_PREFIX = ['낡은', '견습', '정예', '용맹한', '찬란한', '초월한', '태초의'];
  const GEN_SWORD_BASES = ['단검', '소검', '직검', '곡검', '대검', '세이버', '레이피어', '클레이모어', '카타나', '팔치온', '글라디우스', '츠바이핸더', '바스타드 소드', '전투검', '처형검'];
  const GEN_BOW_BASES = ['숏보우', '사냥활', '장궁', '곡궁', '합성궁', '연사궁', '강궁', '저격궁', '섬멸궁', '폭풍궁', '유성궁', '섬광궁', '천궁', '용골궁', '심판의 활'];
  const GEN_STAFF_BASES = ['나무 지팡이', '수정 지팡이', '룬 지팡이', '마도 지팡이', '현자 지팡이', '원소 지팡이', '뇌전 지팡이', '빙결 지팡이', '화염 지팡이', '공허 지팡이', '별빛 지팡이', '월광 지팡이', '태양 지팡이', '용언 지팡이', '창세 지팡이'];
  const GEN_ARMOR_BASES = ['튜닉', '가죽조끼', '사슬갑옷', '스케일 아머', '판금갑옷', '기사갑주', '중장갑주', '수호갑주', '용린갑주', '성기사갑주', '룬 갑주', '심연갑주', '천상갑주', '불멸갑주', '창세갑주'];
  const GEN_WEAPON_DMG_BASE = [10, 28, 46, 64, 82, 100, 118];   // 티어별 시작 위력(+0~14)
  const GEN_ARMOR_DEF_BASE = [6, 16, 26, 36, 46, 56, 66];
  function genFamily(prefix, bases, wclass) {
    const out = [];
    ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
      bases.forEach((bn, i) => {
        const dmg = GEN_WEAPON_DMG_BASE[ti] + i;
        const buyable = false;   // V7: 장비는 100% 드롭/조합 — 화폐는 강화·합성 전용
        const price = Math.round(60 * Math.pow(3.1, ti) * (0.5 + i * 0.18));
        out.push({ key: `g_${prefix}_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${bn}`, wclass, tierKey: t.key,
          dmg, buyPrice: buyable ? price : 0, sellPrice: Math.round(price * 0.2) });
      });
    });
    return out;
  }
  // V7: 티어별 요구 전투 레벨(장비 착용 조건 — 실제 스카이블럭식 게이트)
  const REQ_COMBAT_BY_TIER = { common: 0, uncommon: 2, rare: 5, epic: 9, legendary: 14, mythic: 20, ancient: 26, divine: 33, primal: 40 };   // V11 9티어
  EQUIPMENT.weapons = EQUIPMENT.weapons
    .concat(genFamily('sw', GEN_SWORD_BASES, 'sword'), genFamily('bw', GEN_BOW_BASES, 'bow'), genFamily('st', GEN_STAFF_BASES, 'staff'))
    .sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  const GEN_ARMORS = [];
  ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
    GEN_ARMOR_BASES.forEach((bn, i) => {
      const def = GEN_ARMOR_DEF_BASE[ti] + i;
      const buyable = false;   // V7: 전 장비 드롭/조합 전용
      const price = Math.round(78 * Math.pow(3.1, ti) * (0.5 + i * 0.18));
      GEN_ARMORS.push({ key: `g_ar_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${bn}`, tierKey: t.key,
        defense: def, buyPrice: buyable ? price : 0, sellPrice: Math.round(price * 0.2) });
    });
  });
  EQUIPMENT.armor = EQUIPMENT.armor.concat(GEN_ARMORS).sort((a, b) => a.defense - b.defense || (a.key < b.key ? -1 : 1));
  // V12: 바닐라 검(나무/돌) — 최하 등급 무기(조합 전용). 장착 시스템이 인식하도록 EQUIPMENT에 등록.
  EQUIPMENT.weapons.push(
    { key: 'wooden_sword', name: '나무 검', wclass: 'sword', slot: 'weapon', tierKey: 'common', dmg: 15, buyPrice: 0, sellPrice: 2, flavor: '갓 깎은 나무 검. 없는 것보다 낫다.' },
    { key: 'stone_sword', name: '돌 검', wclass: 'sword', slot: 'weapon', tierKey: 'common', dmg: 20, buyPrice: 0, sellPrice: 4, flavor: '조약돌을 깎아 만든 투박한 검.' }
  );
  EQUIPMENT.weapons.push(
    { key: 'iron_sword', name: '철 검', wclass: 'sword', slot: 'weapon', tierKey: 'uncommon', dmg: 28, buyPrice: 0, sellPrice: 7, flavor: '바닐라 조합으로 만든 철 검.' },
    { key: 'golden_sword', name: '금 검', wclass: 'sword', slot: 'weapon', tierKey: 'uncommon', dmg: 22, buyPrice: 0, sellPrice: 10, flavor: '바닐라 그대로 — 화려하지만 무르다.' },
    { key: 'diamond_sword', name: '다이아몬드 검', wclass: 'sword', slot: 'weapon', tierKey: 'rare', dmg: 38, buyPrice: 0, sellPrice: 18, flavor: '바닐라 조합으로 만든 다이아몬드 검.' }
  );
  EQUIPMENT.weapons.sort((a, b) => a.dmg - b.dmg || (a.key < b.key ? -1 : 1));
  EQUIPMENT.weapons.forEach(w => { w.reqCombat = REQ_COMBAT_BY_TIER[w.tierKey] || 0; });
  EQUIPMENT.armor.forEach(a => { a.reqCombat = REQ_COMBAT_BY_TIER[a.tierKey] || 0; });

  /* ================ V11: 장비 초대확장 — 특성 카탈로그 · 세트 · 1400종 DB 머지 ================ */
  // 특성(트레잇): 모든 신규 장비가 1~3개 보유. 전투/채집/경제 전 분야에 실동작(economy.js 특성 엔진).
  const TRAITS = {
    lifesteal: { n: '흡혈', f: '타격 피해의 {v}%만큼 회복' }, execute: { n: '처형', f: '적 HP 30% 이하일 때 피해 +{v}%' },
    first_strike: { n: '선제 공격', f: '첫 2타 피해 +{v}%' }, combo: { n: '연격', f: '연속 타격당 피해 +{v}% (최대 5중첩)' },
    giant_slayer: { n: '거인 학살자', f: '보스·미니보스 피해 +{v}%' }, swift: { n: '신속', f: '이동속도 +{v}' },
    vampiric_kill: { n: '흡혼', f: '처치 시 HP {v} 회복' }, gold_rush: { n: '골드 러시', f: '처치 골드 +{v}%' },
    wisdom: { n: '지혜', f: '처치 경험치 +{v}%' }, crit_eye: { n: '매의 눈', f: '크리티컬 확률 +{v}%' },
    brutality: { n: '잔혹', f: '크리티컬 피해 +{v}%' }, double_strike: { n: '이도류', f: '{v}% 확률로 2회 타격' },
    rage: { n: '분노', f: '내 HP 40% 이하일 때 피해 +{v}%' }, focus: { n: '집중', f: '내 HP 90% 이상일 때 피해 +{v}%' },
    shred: { n: '파쇄', f: '타격당 고정 추가 피해 +{v}' }, midas: { n: '미다스의 손', f: '보유 골드 10만당 피해 +{v}% (최대 5중첩)' },
    vs_undead: { n: '언데드 특효', f: '좀비 계열 피해 +{v}%' }, vs_arachnid: { n: '절지류 특효', f: '거미 계열 피해 +{v}%' },
    vs_beast: { n: '야수 특효', f: '늑대 계열 피해 +{v}%' }, vs_ender: { n: '엔더 특효', f: '엔더 계열 피해 +{v}%' },
    vs_demon: { n: '악마 특효', f: '화염 계열 피해 +{v}%' },
    guard: { n: '수호', f: '받는 피해 -{v}%' }, vitality: { n: '활력', f: '최대 HP +{v}' }, bulwark: { n: '방벽', f: '방어 +{v}' },
    regeneration: { n: '재생', f: '2초마다 HP {v} 회복' }, swiftness: { n: '질주', f: '이동속도 +{v}' },
    gatherer: { n: '채집꾼', f: '모든 채집 속도 +{v}%' }, angler: { n: '강태공', f: '낚시 입질 +{v}% 빨라짐' },
    miner: { n: '광부', f: '채광 속도 +{v}%' }, lumber: { n: '벌목꾼', f: '벌목 속도 +{v}%' },
    lucky: { n: '행운', f: '희귀 드롭 확률 +{v}%' }, thorns: { n: '가시', f: '받은 피해의 {v}% 반사' },
    greed: { n: '탐욕', f: '골드 획득 +{v}%' }, scholar: { n: '학자', f: '경험치 획득 +{v}%' }, mana_well: { n: '마나 샘', f: '지능 +{v}' },
  };
  // 세트 40종 보너스 — 투구+흉갑+레깅스+부츠 4부위 동일 세트 착용 시 발동
  const EQUIP_SETS = {
    squire: { name: '견습 기사단', bonus: { def: 6, hp: 15 }, desc: '기사단의 첫걸음' },
    gravekeeper: { name: '묘지기', bonus: { def: 5, hp: 10, xpPct: 5 }, desc: '망자의 가호' },
    miner_guild: { name: '광부조합', bonus: { def: 6, minerPct: 12 }, desc: '조합원의 곡괭이 축복' },
    wolfhide: { name: '늑대가죽', bonus: { speed: 6, str: 4 }, desc: '설원 무리의 온기' },
    angler_crew: { name: '노련한 어부', bonus: { hp: 20, anglerPct: 15 }, desc: '만선의 기운' },
    harvest: { name: '풍년 농군', bonus: { hp: 30, gathererPct: 8 }, desc: '황금 들녘의 축복' },
    hunter: { name: '숲 사냥꾼', bonus: { str: 8, critChance: 3 }, desc: '숨죽인 추적자' },
    skeletal: { name: '백골', bonus: { def: 10, str: 6 }, desc: '뼈까지 시린 냉기' },
    spider_queen: { name: '거미 여왕', bonus: { str: 10, speed: 5, dmgPct: 4 }, desc: '여왕의 독니' },
    diver: { name: '심연 잠수부', bonus: { hp: 45, def: 8, anglerPct: 20 }, desc: '깊은 곳의 숨결' },
    magma_walker: { name: '용암 행자', bonus: { def: 14, guard: 3 }, desc: '불길 위를 걷는 자' },
    frost: { name: '서리칼바람', bonus: { str: 12, critDamage: 10 }, desc: '살을 에는 한파' },
    golden_pharaoh: { name: '황금 파라오', bonus: { goldPct: 15, hp: 30 }, desc: '사막 왕의 부' },
    dune_wanderer: { name: '사구 방랑자', bonus: { speed: 10, def: 10 }, desc: '모래폭풍의 인도' },
    jungle_stalker: { name: '밀림 추적자', bonus: { str: 14, speed: 6 }, desc: '보이지 않는 사냥' },
    storm: { name: '뇌운', bonus: { dmgPct: 8, critChance: 4 }, desc: '천둥을 두른 자' },
    moonlight: { name: '달빛 무희', bonus: { critChance: 6, critDamage: 14, speed: 4 }, desc: '달 아래의 검무' },
    steel_knight: { name: '강철 기사', bonus: { def: 22, hp: 40 }, desc: '꺾이지 않는 방벽' },
    dragon_scale: { name: '용비늘', bonus: { def: 20, str: 15, dmgPct: 6 }, desc: '용의 비호' },
    shadow_assassin: { name: '그림자 암살자', bonus: { dmgPct: 12, speed: 30, critDamage: 100, str: 60 }, desc: '그림자에서 그림자로 (실제 +치명피해100%)' },
    archmage: { name: '대마법사', bonus: { intelligence: 60, dmgPct: 8 }, desc: '마나의 흐름을 지배' },
    paladin: { name: '성기사', bonus: { def: 25, hp: 60, guard: 4 }, desc: '빛의 서약' },
    blood_fiend: { name: '혈귀', bonus: { dmgPct: 10, lifestealPct: 4 }, desc: '피의 갈증' },
    beast_king: { name: '야수왕', bonus: { str: 22, speed: 8, dmgPct: 5 }, desc: '무리의 왕' },
    thunder_emperor: { name: '뇌제', bonus: { dmgPct: 14, critChance: 10, critDamage: 40, str: 50, ferocity: 15 }, desc: '벼락의 옥좌' },
    glacier: { name: '빙하 거인', bonus: { hp: 120, def: 26, guard: 5 }, desc: '만년설의 육체' },
    necro_lord: { name: '사령군주', bonus: { dmgPct: 12, hp: 60, xpPct: 12 }, desc: '망자 군단의 주인' },
    phoenix: { name: '불사조', bonus: { hp: 90, regenFlat: 5, dmgPct: 8 }, desc: '재에서 다시 태어나다' },
    necron: { name: '네크론', bonus: { dmgPct: 25, str: 130, def: 80, hp: 400, critDamage: 40, ferocity: 20 }, desc: '지배자의 유산 (골도르/네크론 마스터)' },
    void_seraph: { name: '공허 세라프', bonus: { dmgPct: 15, speed: 12, critDamage: 60, str: 80, ferocity: 20 }, desc: '공허를 가르는 날개' },
    world_tree: { name: '세계수', bonus: { hp: 150, regenFlat: 8, gathererPct: 15 }, desc: '뿌리 깊은 생명' },
    stargazer: { name: '별지기', bonus: { intelligence: 90, critChance: 8, xpPct: 15 }, desc: '별의 궤적을 읽는 자' },
    hell_monarch: { name: '지옥 군주', bonus: { dmgPct: 22, str: 110, critDamage: 40, ferocity: 40, guard: 5 }, desc: '불지옥의 옥좌' },
    chrono: { name: '시간 방랑자', bonus: { speed: 18, critChance: 10, dmgPct: 12 }, desc: '시간의 틈을 걷다' },
    deep_emperor: { name: '심해 제왕', bonus: { hp: 180, def: 35, anglerPct: 30 }, desc: '해구의 왕관' },
    celestial: { name: '천상 수호자', bonus: { def: 45, hp: 140, guard: 7 }, desc: '하늘의 방패' },
    primal_titan: { name: '태초 거인', bonus: { str: 150, hp: 500, dmgPct: 20, critDamage: 40, ferocity: 20 }, desc: '세계를 빚은 손' },
    genesis: { name: '창세', bonus: { dmgPct: 30, str: 130, critDamage: 80, hp: 300, ferocity: 30 }, desc: '시작이자 끝' },
    yeti_lord: { name: '예티 군주', bonus: { hp: 80, def: 24, guard: 4 }, desc: '설산의 지배자' },
    arachne_brood: { name: '아라크네 혈족', bonus: { dmgPct: 12, speed: 8, lifestealPct: 3 }, desc: '어미의 축복' },
  };
  // 레거시 장비 슬롯 정규화(구 방어구는 전부 흉갑 취급, 무기는 wclass 기준)
  EQUIPMENT.weapons.forEach(w => { if (!w.slot) w.slot = w.wclass === 'bow' ? 'bow' : 'weapon'; });
  EQUIPMENT.armor.forEach(a => { if (!a.slot) a.slot = 'chest'; });
  // 실제 하이픽셀 장비 카탈로그(economy-gear.js가 window.ECON_GEAR로 선로드, 공식 Hypixel API 원본) 머지.
  //   실제 id·이름·등급·스탯·요구·판매가 그대로. 무기 220 / 방어구 830 / 장신구 553 / 도구 152.
  const STAT_FIELDS = ['str', 'critDamage', 'critChance', 'hp', 'defense', 'trueDefense', 'intelligence', 'ferocity', 'attackSpeed', 'speed', 'seaCreatureChance', 'magicFind', 'miningSpeed', 'miningFortune', 'farmingFortune', 'foragingFortune', 'fishingSpeed', 'swingRange', 'abilityDamage'];
  function mergeReal(it, list, isWeapon) {
    const e = { key: it.key, id: it.id, name: it.name, real: true, tierKey: it.tierKey, tier: it.tier, category: it.category,
      buyPrice: 0, sellPrice: it.sellPrice || 0, reqCombat: it.reqCombat || 0, req: it.req || null, stats: it.stats || {} };
    for (const f of STAT_FIELDS) if (it[f] != null) e[f] = it[f];
    if (isWeapon) { e.wclass = it.wclass || 'sword'; e.slot = it.slot === 'bow' ? 'bow' : 'weapon'; e.dmg = it.dmg || 0; }
    else { e.slot = it.slot; e.defense = it.defense || 0; e.hp = it.hp || 0; }
    list.push(e);
  }
  const GEAR = (typeof window !== 'undefined' && window.ECON_GEAR) ? window.ECON_GEAR : null;
  if (GEAR) {
    // 이미 존재하는 실제 키(던전/슬레이어 드롭 플레이스홀더 등)는 실제 데이터로 덮어쓰고, 없으면 추가.
    const wByKey = {}; EQUIPMENT.weapons.forEach(x => wByKey[x.key] = x);
    const aByKey = {}; EQUIPMENT.armor.forEach(x => aByKey[x.key] = x);
    function upsert(it, isWeapon) {
      const ex = isWeapon ? wByKey[it.key] : aByKey[it.key];
      if (ex) { ex.name = it.name; ex.id = it.id; ex.real = true; ex.tierKey = it.tierKey; ex.tier = it.tier; ex.category = it.category; ex.sellPrice = it.sellPrice || ex.sellPrice || 0; ex.stats = it.stats || {}; ex.req = it.req || ex.req || null; if (it.reqCombat) ex.reqCombat = it.reqCombat;
        for (const f of STAT_FIELDS) if (it[f] != null) ex[f] = it[f];
        if (isWeapon) { ex.wclass = it.wclass || ex.wclass || 'sword'; ex.slot = it.slot === 'bow' ? 'bow' : 'weapon'; ex.dmg = it.dmg || 0; } else { ex.slot = it.slot; ex.defense = it.defense || 0; ex.hp = it.hp || 0; }
      } else mergeReal(it, isWeapon ? EQUIPMENT.weapons : EQUIPMENT.armor, isWeapon);
    }
    (GEAR.weapons || []).forEach(it => upsert(it, true));
    (GEAR.armor || []).forEach(it => upsert(it, false));
    EQUIPMENT.accessories = (GEAR.accessories || []).map(it => ({ key: it.key, id: it.id, name: it.name, real: true, tierKey: it.tierKey, tier: it.tier, category: it.category, sellPrice: it.sellPrice || 0, slot: 'accessory', stats: it.stats || {}, magicalPower: (ITEM_TIERS.find(t => t.key === it.tierKey) || {}).magicalPower || 3 }));
    EQUIPMENT.weapons.sort((x, y) => (x.dmg || 0) - (y.dmg || 0) || (x.key < y.key ? -1 : 1));
    EQUIPMENT.armor.sort((x, y) => (x.defense || 0) - (y.defense || 0) || (x.key < y.key ? -1 : 1));
    // 레거시 티어 장비(레시피/드롭이 참조하는 weapon_*/armor_* 등)를 동급 실제 아이템 이름·스탯으로 이식(키 유지 → 호환).
    const realByClassTier = { weapon: {}, bow: {}, staff: {}, armor: {} };
    const saneGear = it => it.tier !== 'UNOBTAINABLE' && (it.dmg || 0) <= 1000 && (it.defense || 0) <= 1000;   // 노벨티/미획득(레이건 등) 제외
    (GEAR.weapons || []).forEach(it => { if (!saneGear(it)) return; const c = it.wclass || 'sword'; const g = c === 'bow' ? 'bow' : c === 'staff' ? 'staff' : 'weapon'; (realByClassTier[g][it.tierKey] = realByClassTier[g][it.tierKey] || []).push(it); });
    (GEAR.armor || []).forEach(it => { if (!saneGear(it)) return; (realByClassTier.armor[it.tierKey] = realByClassTier.armor[it.tierKey] || []).push(it); });
    const TIER_ORDER = ITEM_TIERS.map(t => t.key);
    function nearestReal(group, tierKey) {
      const gt = realByClassTier[group]; if (!gt) return null;
      if (gt[tierKey] && gt[tierKey].length) return gt[tierKey];
      const ti = TIER_ORDER.indexOf(tierKey);
      for (let d = 1; d < TIER_ORDER.length; d++) { for (const k of [TIER_ORDER[ti - d], TIER_ORDER[ti + d]]) if (k && gt[k] && gt[k].length) return gt[k]; }
      return null;
    }
    const pick = { weapon: {}, bow: {}, staff: {}, armor: {} };
    function assignReal(e, group) {
      const pool = nearestReal(group, e.tierKey); if (!pool || !pool.length) return;
      const idx = (pick[group][e.tierKey] = (pick[group][e.tierKey] || 0)); pick[group][e.tierKey] = idx + 1;
      const r = pool[idx % pool.length];
      e.name = r.name; e.id = r.id; e.real = true; e.stats = r.stats || {}; e.tier = r.tier; e.tierKey = r.tierKey;
      for (const f of STAT_FIELDS) if (r[f] != null) e[f] = r[f];
      if (group === 'armor') { e.defense = r.defense || 0; e.hp = r.hp || 0; } else { e.dmg = r.dmg || 0; }
    }
    EQUIPMENT.weapons.forEach(w => { if (!w.real) assignReal(w, w.wclass === 'bow' ? 'bow' : w.wclass === 'staff' ? 'staff' : 'weapon'); });
    EQUIPMENT.armor.forEach(a => { if (!a.real) assignReal(a, 'armor'); });
    EQUIPMENT.weapons.sort((x, y) => (x.dmg || 0) - (y.dmg || 0) || (x.key < y.key ? -1 : 1));
    EQUIPMENT.armor.sort((x, y) => (x.defense || 0) - (y.defense || 0) || (x.key < y.key ? -1 : 1));
    // V95 (E11): 던전 클래스 어빌리티 의사 아이템(빈 스탯, 장착 불가)은 무기 목록에서 제외 — 실제 장비가 아님.
    const ABILITY_KEYS = new Set(['archer_dungeon_ability_2', 'archer_dungeon_ability_3', 'aspect_of_the_leech_1', 'aspect_of_the_leech_2', 'aspect_of_the_leech_3']);
    const emptyStats = e => !e.stats || Object.keys(e.stats).length === 0;
    const isAbilityPseudo = e => ABILITY_KEYS.has(e.key) || (/_ability_\d+$/.test(e.key || '') && emptyStats(e) && !(e.dmg > 0));
    EQUIPMENT.weapons = EQUIPMENT.weapons.filter(w => !isAbilityPseudo(w));
    // V95 (E5): 실제 아이템인데 API가 빈 스탯·0 데미지/방어로 들어와 죽은 아이템을 티어 기준 최소 스탯으로 백필.
    //   티어 순서(ITEM_TIERS)가 높을수록 큰 값. UNOBTAINABLE/노벨티(saneGear 제외분)는 손대지 않음.
    const WEAPON_DMG_BASELINE = [20, 40, 70, 110, 160, 220, 280, 340, 400];   // 일반→태초(ancient/divine/primal은 신화 위로)
    const ARMOR_DEF_BASELINE = [15, 30, 50, 80, 115, 155, 195, 235, 275];
    const tierIdx = tk => { const i = TIER_ORDER.indexOf(tk); return i < 0 ? 0 : i; };
    EQUIPMENT.weapons.forEach(w => {
      if (w.real && w.tier !== 'UNOBTAINABLE' && emptyStats(w) && !(w.dmg > 0)) w.dmg = WEAPON_DMG_BASELINE[tierIdx(w.tierKey)];
    });
    EQUIPMENT.armor.forEach(a => {
      if (a.real && a.tier !== 'UNOBTAINABLE' && emptyStats(a) && !(a.defense > 0) && !(a.hp > 0)) a.defense = ARMOR_DEF_BASELINE[tierIdx(a.tierKey)];
    });
    // 백필로 dmg/defense가 바뀌었으니 재정렬.
    EQUIPMENT.weapons.sort((x, y) => (x.dmg || 0) - (y.dmg || 0) || (x.key < y.key ? -1 : 1));
    EQUIPMENT.armor.sort((x, y) => (x.defense || 0) - (y.defense || 0) || (x.key < y.key ? -1 : 1));
  }
  // 도구도 계열별 105종 추가(전부 드롭 전용) — 배율 0.6~2.6, 기존 5종 사다리는 그대로 유지
  const GEN_TOOL_BASES = ['공구', '연장', '장비', '명품', '걸작', '비장의 도구', '유물 공구', '고대 연장', '전설의 공구', '신화의 연장', '용의 도구', '별의 공구', '태초의 연장', '창세의 공구', '신의 연장'];
  Object.keys(TOOL_FAMILY_NAMES).forEach(fam => {
    const gen = [];
    ITEM_TIERS.slice(0, 7).forEach((t, ti) => {
      GEN_TOOL_BASES.forEach((bn, i) => {
        const mul = +(0.6 + (ti * 15 + i) * 0.019).toFixed(2);   // 0.6 ~ 2.58
        gen.push({ key: `g_t_${fam}_${t.key}_${i}`, name: `${GEN_TIER_PREFIX[ti]} ${TOOL_FAMILY_NAMES[fam]} ${bn}`, tierKey: t.key, mul, price: 0, req: Math.min(25, Math.max(0, Math.round((mul - 1) * 10))) });
      });
    });
    TOOLS[fam] = TOOLS[fam].concat(gen).sort((a, b) => a.mul - b.mul);
  });

  /* ---------------- 장신구(부적) 20종 — 마력(Magical Power) 시스템 ---------------- */
  // 보유한 모든 부적의 마력 합계가 전역 스탯 보너스로 작동(스카이블럭 MP 방식).
  // effect: str/def/hp 직접 스탯, doubleZone: 해당 존 채집 2배 확률(%), minionSpeed/sellBonus: 특수효과(%)
  function tali(key, name, tierKey, price, effect, desc) { return { key, name, tierKey, buyPrice: 0, sellPrice: Math.round(price * 0.2), effect, desc }; }   // V7: 부적은 몹/보스/던전 드롭·조합 전용
  const TALISMANS = [
    tali('talisman_zombie', '좀비 부적', 'common', 400, { hp: 5 }, '체력 +5'),
    tali('talisman_farming', '농부의 부적', 'common', 1500, { doubleZone: 'farm', doublePct: 5 }, '농장 수확 2배 확률 +5%'),
    tali('talisman_mining', '광부의 부적', 'common', 1500, { doubleZone: 'mine', doublePct: 5 }, '광산 채굴 2배 확률 +5%'),
    tali('talisman_feather', '깃털 부적', 'common', 600, { hp: 3 }, '체력 +3, 사뿐히 착지'),
    tali('talisman_potato', '감자 부적', 'common', 777, { str: 1 }, '힘 +1 (왠지 감자 냄새가 난다)'),
    tali('talisman_lumber', '벌목꾼의 부적', 'uncommon', 2000, { doubleZone: 'forest', doublePct: 6 }, '벌목 2배 확률 +6%'),
    tali('talisman_fisher_anklet', '낚시꾼의 발찌', 'uncommon', 2000, { doubleZone: 'dock', doublePct: 6 }, '낚시 2배 확률 +6%'),
    tali('talisman_campfire', '모닥불 부적', 'uncommon', 1800, { hp: 10 }, '체력 +10'),
    tali('talisman_wolf_claw', '늑대 발톱', 'uncommon', 2200, { str: 3 }, '힘 +3'),
    tali('talisman_lava_charm', '용암 부적', 'rare', 5000, { def: 8 }, '방어 +8'),
    tali('talisman_deep_pearl', '심해의 진주', 'rare', 5500, { hp: 15, def: 3 }, '체력 +15, 방어 +3'),
    tali('talisman_spider_ring', '거미의 반지', 'rare', 5200, { str: 5 }, '힘 +5'),
    tali('talisman_collector_seal', '수집가의 인장', 'rare', 6000, { sellBonus: 3 }, '판매가 +3%'),
    tali('talisman_scarf_studies', '스카프의 연구록', 'rare', 0, { str: 4, def: 4 }, '힘 +4, 방어 +4 (던전 2층 전리품)'),
    tali('talisman_dragon_claw', '드래곤 발톱', 'epic', 15000, { str: 10 }, '힘 +10'),
    tali('talisman_dawn_seal', '여명의 인장', 'epic', 16000, { def: 12 }, '방어 +12'),
    tali('talisman_hourglass', '시간의 모래시계', 'epic', 20000, { minionSpeed: 5 }, '모든 미니언 생산속도 +5%'),
    tali('talisman_dragon_heart', '용의 심장', 'legendary', 45000, { hp: 40 }, '체력 +40'),
    tali('talisman_wealth_rune', '재물의 룬', 'legendary', 50000, { sellBonus: 5 }, '판매가 +5%'),
    tali('talisman_void_eye', '공허의 눈', 'mythic', 120000, { str: 18, def: 10 }, '힘 +18, 방어 +10'),
    tali('talisman_primal_shard', '태초의 파편', 'ancient', 300000, { str: 15, def: 15, hp: 50 }, '힘 +15, 방어 +15, 체력 +50'),
      tali('talisman_revenant', '리븐넌트 부적', 'rare', 8000, { str: 3, hp: 10 }, '힘 +3, 체력 +10 (좀비 슬레이어 Lv3 보상)'),
    tali('talisman_tarantula', '타란튤라 부적', 'rare', 9000, { str: 4 }, '힘 +4 (거미 슬레이어 Lv3 보상)'),
    tali('talisman_sven', '스벤 부적', 'epic', 15000, { def: 5, hp: 15 }, '방어 +5, 체력 +15 (늑대 슬레이어 Lv3 보상)'),
    tali('talisman_voidgloom', '보이드글룸 부적', 'epic', 22000, { str: 6 }, '힘 +6 (엔더맨 슬레이어 Lv3 보상)'),
    tali('talisman_inferno', '인페르노 부적', 'legendary', 30000, { str: 7, hp: 20 }, '힘 +7, 체력 +20 (블레이즈 슬레이어 Lv3 보상)'),
  ];
  // V20-I: 마력(Magical Power) + 전능의 힘(Accessory Power) — 실제 스블 파워 선택 시스템.
  // 선택한 힘이 마력에 비례해 스탯을 부여(mpScale = MP^0.6, 부드러운 성장 곡선).
  const MAGICAL_POWER = {
    statPctPer10MP: 1.5,   // 마력 10당 최종 공격/방어 +1.5%(기존)
    scaleExp: 0.6,         // 파워 스탯 스케일 = MP^scaleExp
    powers: [
      { key: 'none', name: '없음', per: {} },
      { key: 'fortitude', name: '견고함(Fortitude)', per: { def: 0.5, hp: 2 } },
      { key: 'warrior', name: '전사(Warrior)', per: { str: 0.5, critDamage: 0.35 } },
      { key: 'bloody', name: '피의(Bloody)', per: { critChance: 0.12, critDamage: 0.4, str: 0.2 } },
      { key: 'protected', name: '수호(Protected)', per: { def: 0.7, hp: 3 } },
      { key: 'healthy', name: '건강(Healthy)', per: { hp: 5 } },
      { key: 'mana_flux', name: '마나 유동(Mana Flux)', per: { intelligence: 1.2 } },
      { key: 'sighted', name: '예지(Sighted)', per: { critChance: 0.2, intelligence: 0.6 } },
      { key: 'demonic', name: '악마(Demonic)', per: { str: 0.6, intelligence: 0.8 } },
    ],
  };

  /* ---------------- 펫 12종 ---------------- */
  // skill: 해당 스킬 XP 획득 시 펫도 성장(조련 레벨당 +1%). perLvl: 펫 레벨당 스탯.
  function pet(key, name, tierKey, skill, perLvl, perkText, eggPrice) { return { key, name, tierKey, skill, perLvl, perkText, eggPrice }; }
  const PETS = [
    pet('rock', '바위', 'common', 'mining', { def: 0.3 }, '레벨당 방어 +0.3', 2000),
    pet('silverfish', '실버피쉬', 'uncommon', 'mining', { def: 0.5 }, '레벨당 방어 +0.5', 0),
    pet('rabbit', '토끼', 'uncommon', 'farming', { hp: 0.4 }, '레벨당 체력 +0.4', 5000),
    pet('ocelot', '오셀롯', 'rare', 'foraging', { str: 0.5 }, '레벨당 힘 +0.5', 0),
    pet('squid', '오징어', 'rare', 'fishing', { hp: 0.5 }, '레벨당 체력 +0.5', 9000),
    pet('elephant', '코끼리', 'epic', 'farming', { hp: 1.0 }, '레벨당 체력 +1', 25000),
    pet('wolf', '늑대', 'epic', 'combat', { str: 1.0 }, '레벨당 힘 +1', 8000),
    pet('bee', '꿀벌', 'legendary', 'farming', { str: 0.8, def: 0.3 }, '레벨당 힘 +0.8, 방어 +0.3', 60000),
    pet('blue_whale', '흰수염고래', 'legendary', 'fishing', { hp: 2.0 }, '레벨당 체력 +2', 70000),
    pet('enderman', '엔더맨', 'legendary', 'combat', { str: 1.4 }, '레벨당 힘 +1.4', 0),
    pet('ender_dragon', '엔더 드래곤', 'legendary', 'combat', { str: 1.5, def: 0.5, hp: 1.0 }, '레벨당 힘 +1.5, 방어 +0.5, 체력 +1', 0),   // V126: 최대등급 전설(신화 아님)
    pet('griffin', '그리핀', 'mythic', 'combat', { str: 2.0, def: 0.7, hp: 1.5 }, '레벨당 힘 +2, 방어 +0.7, 체력 +1.5', 0),
    pet('spider', '거미 펫', 'rare', 'combat', { str: 0.4, def: 0.1 }, '레벨당 힘 +0.4, 방어 +0.1', 0),   // V101: statsPerLv 오타 스키마 → pet()(perLvl)로 교정(petStats 크래시 수정)
    pet('blaze', '블레이즈 펫', 'epic', 'combat', { str: 0.5, hp: 0.5 }, '레벨당 힘 +0.5, 체력 +0.5', 0),
  ];   // V101: 중복 'enderman' 펫(위 821행에 이미 존재) 제거 — 죽은 데이터 + 스키마 불일치
  // V20-C: 펫 아이템(활성 펫 1개 장착) — 실제 스카이블럭. mul=펫 기본 능력치 배율, stat=고정 스탯
  const PET_ITEMS = [
    { key: 'petitem_tier_boost', name: '펫: 티어 부스트', desc: '펫 기본 능력치 +10%', mul: 1.1 },
    { key: 'petitem_gold_claws', name: '펫: 황금 발톱', desc: '힘 +30', stat: { str: 30 } },
    { key: 'petitem_bigger_teeth', name: '펫: 큰 이빨', desc: '치명 피해 +40%', stat: { critDamage: 40 } },
    { key: 'petitem_hardened_scales', name: '펫: 단단한 비늘', desc: '방어 +25', stat: { def: 25 } },
    { key: 'petitem_textbook', name: '펫: 교과서', desc: '지력 +50', stat: { intelligence: 50 } },
    { key: 'petitem_lucky_clover', name: '펫: 행운의 클로버', desc: '매직파인드 +7', stat: { magicFind: 7 } },
    { key: 'petitem_titanium', name: '펫: 티타늄 부적', desc: '힘 +15, 방어 +15', stat: { str: 15, def: 15 } },
    { key: 'petitem_crystallized_heart', name: '펫: 결정화된 심장', desc: '채광 포춘 +40', stat: { miningFortune: 40 } },
  ];
  // V20-C: 펫 시그니처 능력(레벨 마일스톤 해금) — 계열별 고유 패시브
  const PET_ABILITIES = {
    griffin: [{ lv: 50, name: '하늘의 왕', stat: { str: 60 } }, { lv: 100, name: '전설의 체질', stat: { str: 60, critDamage: 30 } }],
    ender_dragon: [{ lv: 50, name: '용의 분노', stat: { str: 50 } }, { lv: 100, name: '종말의 숨결', stat: { str: 60, intelligence: 100 } }],
    enderman: [{ lv: 50, name: '공허 보행', stat: { str: 40 } }, { lv: 100, name: '엔더 지배', stat: { str: 50 } }],
    wolf: [{ lv: 50, name: '무리의 힘', stat: { str: 25 } }],
    blue_whale: [{ lv: 50, name: '거대한 심장', stat: { hp: 100 } }, { lv: 100, name: '심해의 생명력', stat: { hp: 200 } }],
  };
  const PET_XP_BASE = 60, PET_XP_EXP = 1.7, PET_MAX_LEVEL = 100;   // xpToLevel(n) = base * n^exp

  /* ---------------- 인챈트 12종(위키 실측 상한) + 혼돈의 마법부여(상한 돌파) ---------------- */
  // 전역 슬롯 방식: 무기 인챈트는 현재 장착 무기에, 방어구 인챈트는 방어구에 적용(장비 교체 시 유지).
  // maxLvl = 인챈트북으로 도달 가능한 상한(위키: 예리함 7·치명 7·선제공격 5·거인사냥꾼 7·약탈 5·보호 7·성장 7).
  // 그 위로는 "혼돈의 마법부여"(골드+북 소모, 확률 성공/실패 시 레벨 하락 위험)로 +5레벨까지 돌파 가능 — 노가다·운빨 초월 강화.
  // V7: 인챈트북은 몹 드롭 전용. 부여(합성)에는 골드 + 마법부여 스킬 레벨 필요.
  const ENCHANTS = [
    // ── 무기 20종 ──  fx: dmg(상시%), first(첫타%), dmgBig(체력10만+%), dmgLow(적HP50%↓), dmgHigh(적HP50%↑),
    //                  dmgVs(특정 슬레이어%), dmgBoss(던전보스%), third(3타마다%), coin(골드%), xp(전투XP%),
    //                  lifesteal(가한 피해%회복), healHit(타격당 고정회복)
    { key: 'sharpness', name: '예리함', target: 'weapon', vanilla: true, maxLvl: 7, fx: { dmg: 5 }, desc: '레벨당 근접 피해 +5%(V=25%, VII=35% — 실제 스블)', bookBasePrice: 500 },
    { key: 'critical', name: '치명', target: 'weapon', maxLvl: 7, fx: { critDamage: 10 }, desc: '레벨당 크리 피해 +10%(VI=+60%, VII=+70% — 실측)', bookBasePrice: 600 },
    { key: 'first_strike', name: '선제공격', target: 'weapon', maxLvl: 4, fx: { first: 25 }, desc: '첫 공격 피해 +25%/레벨(IV=+100%)', bookBasePrice: 900 },
    { key: 'triple_strike', name: '삼연격', target: 'weapon', maxLvl: 5, fx: { firstThree: 10 }, desc: '처음 3회 공격 +10%/레벨', bookBasePrice: 950 },
    { key: 'giant_killer', name: '거인 사냥꾼', target: 'weapon', maxLvl: 7, fx: { dmgBig: 1 }, desc: '레벨당 (대상 최대체력이 내 체력 초과한 %)% 피해, 레벨당 +5% 상한 (실측)', bookBasePrice: 1500 },
    { key: 'titan_killer', name: '타이탄 킬러', target: 'weapon', maxLvl: 7, fx: { dmgBig: 6 }, desc: '최대체력 10만+ 적에게 +6%/레벨', bookBasePrice: 1300 },
    { key: 'execute', name: '처형', target: 'weapon', maxLvl: 6, fx: { dmgLow: 1 }, desc: '레벨당 0.5% × 대상 잃은 체력 % (실측 — 체력 낮을수록 증가)', bookBasePrice: 1400 },
    { key: 'prosecute', name: '기소', target: 'weapon', maxLvl: 6, fx: { dmgHigh: 4 }, desc: '적 체력 50% 이상 +4%/레벨', bookBasePrice: 1200 },
    { key: 'smite', name: '강타', target: 'weapon', maxLvl: 7, fx: { dmgVs: 'zombie_slayer', v: 8 }, desc: '좀비 슬레이어 +8%/레벨', bookBasePrice: 800 },
    { key: 'bane_of_arthropods', name: '살충', target: 'weapon', maxLvl: 6, fx: { dmgVs: 'spider_slayer', v: 8 }, desc: '거미 슬레이어 +8%/레벨', bookBasePrice: 800 },
    { key: 'ender_slayer', name: '엔더 슬레이어', target: 'weapon', maxLvl: 7, fx: { dmgVs: 'enderman_slayer', v: 18 }, desc: '엔더맨 슬레이어 +18%/레벨(VII≈130%)', bookBasePrice: 1600 },
    { key: 'cubism', name: '큐비즘', target: 'weapon', maxLvl: 6, fx: { dmgVs: 'cube', v: 10 }, desc: '큐브형 몹(슬라임·마그마 큐브) +10%/레벨', bookBasePrice: 1400 },   /* V109: 실측 — 큐비즘은 큐브형 몹 대상(블레이즈 슬레이어 아님) */
    { key: 'dragon_hunter', name: '용 사냥꾼', target: 'weapon', maxLvl: 5, fx: { dmgBoss: 8 }, desc: '던전 보스 +8%/레벨', bookBasePrice: 1800 },
    { key: 'thunderlord', name: '뇌제', target: 'weapon', maxLvl: 6, fx: { third: 15 }, desc: '3번째 공격마다 +15%/레벨', bookBasePrice: 1700 },
    { key: 'fire_aspect', name: '발화', target: 'weapon', maxLvl: 3, fx: { dmg: 3 }, desc: '레벨당 최종 피해 +3%', bookBasePrice: 700 },
    { key: 'venomous', name: '맹독', target: 'weapon', maxLvl: 6, fx: { dmgHigh: 3 }, desc: '적 체력 50% 이상 +3%/레벨', bookBasePrice: 900 },
    { key: 'looting', name: '약탈', target: 'weapon', maxLvl: 5, fx: { coin: 15 }, desc: '전투 보상 골드 +15%/레벨', bookBasePrice: 1200 },
    { key: 'experience', name: '경험', target: 'weapon', maxLvl: 5, fx: { xp: 10 }, desc: '전투 스킬 XP +10%/레벨', bookBasePrice: 1000 },
    { key: 'vampirism', name: '흡혈', target: 'weapon', maxLvl: 6, fx: { lifesteal: 1 }, desc: '가한 피해의 1%/레벨 회복', bookBasePrice: 1600 },
    { key: 'life_steal', name: '생명 강탈', target: 'weapon', maxLvl: 5, fx: { healHit: 3 }, desc: '공격마다 HP +3/레벨', bookBasePrice: 1500 },
    // ── 방어구 12종 ──  fx: def(방어), hp(체력), thorns(반사%), healHit, lastStand(HP30%↓ 방어),
    //                    roomHeal(던전 방이동 회복%p), speed(이동속도%), sell(판매가%), coin
    { key: 'protection', name: '보호', target: 'armor', maxLvl: 7, fx: { def: 3 }, desc: '레벨당 방어 +3(VI=+18, VII=+21 — 실제 스블)', bookBasePrice: 500 },
    { key: 'growth', name: '성장', target: 'armor', maxLvl: 7, fx: { hp: 15 }, desc: '레벨당 체력 +15', bookBasePrice: 700 },
    { key: 'true_protection', name: '진정한 보호', target: 'armor', maxLvl: 1, fx: { def: 15 }, desc: '방어 +15', bookBasePrice: 4000 },
    { key: 'hardened', name: '경화', target: 'armor', maxLvl: 5, fx: { def: 2, hp: 5 }, desc: '레벨당 방어 +2, 체력 +5', bookBasePrice: 900 },
    { key: 'thorns', name: '가시', target: 'armor', maxLvl: 3, fx: { thorns: 10 }, desc: '받는 피해의 10%/레벨 반사', bookBasePrice: 1300 },
    { key: 'cactus', name: '선인장', target: 'armor', maxLvl: 3, fx: { thorns: 5 }, desc: '받는 피해의 5%/레벨 반사', bookBasePrice: 800 },
    { key: 'vitality', name: '활력', target: 'armor', maxLvl: 5, fx: { healHit: 2 }, desc: '공격마다 HP +2/레벨', bookBasePrice: 1100 },
    { key: 'rejuvenate', name: '재생', target: 'armor', maxLvl: 5, fx: { roomHeal: 3 }, desc: '던전 방 이동 회복 +3%p/레벨', bookBasePrice: 1200 },
    { key: 'last_stand', name: '최후의 저항', target: 'armor', maxLvl: 5, fx: { lastStand: 8 }, desc: '내 HP 30% 이하일 때 방어 +8/레벨', bookBasePrice: 1500 },
    { key: 'sugar_rush', name: '슈가 러시', target: 'armor', maxLvl: 3, fx: { speed: 4 }, desc: '이동속도 +4%/레벨(3D 월드)', bookBasePrice: 1000 },
    { key: 'big_brain', name: '빅 브레인', target: 'armor', maxLvl: 5, fx: { intelligence: 5 }, desc: '지력 +5/레벨', bookBasePrice: 1000 },   /* V109: 실측 — 빅 브레인은 지력 부여(XP 아님) */
    { key: 'magnet', name: '자석', target: 'armor', maxLvl: 5, fx: { coin: 5 }, desc: '전투 보상 골드 +5%/레벨', bookBasePrice: 900 },
    // ── 도구 3종 ──  fx: mineSpeed(채집 속도%), fortune(추가 드롭%), area(주변 블록 동시 파괴 개수)
    { key: 'efficiency', name: '효율', target: 'tool', maxLvl: 5, fx: { mineSpeed: 12 }, desc: '채집 속도 +12%/레벨(기본 최대 V, 실렉스로만 X)', bookBasePrice: 800 },
    { key: 'fortune', name: '행운', target: 'tool', maxLvl: 4, fx: { fortune: 20 }, desc: '추가 드롭 확률 +20%/레벨', bookBasePrice: 1400 },
    { key: 'area_mining', name: '광역 채집', target: 'tool', maxLvl: 5, fx: { area: 1 }, desc: '파괴 시 주변 블록 +1개/레벨 동시 파괴(혼돈으로 최대 10)', bookBasePrice: 2200 },
    // ── V19: 얼티밋 인챈트(실제 스카이블럭) — 중복 인챈트북 합성으로 레벨업, 무기당 1종만 장착 가능(강력) ──
    { key: 'one_for_all', name: '원 포 올', target: 'weapon', ultimate: true, maxLvl: 1, fx: { dmg: 100 }, desc: '최종 피해 +100% (단, 다른 무기 인챈트 무효 — 극단 특화)', bookBasePrice: 8000 },
    { key: 'soul_eater', name: '소울 이터', target: 'weapon', ultimate: true, maxLvl: 5, fx: { first: 8 }, desc: '처치 후 다음 타격 강화 +8%/레벨(첫타 보정)', bookBasePrice: 5000 },
    { key: 'combo_ult', name: '콤보', target: 'weapon', ultimate: true, maxLvl: 5, fx: { third: 8 }, desc: '연속 공격 누적 피해 +8%/레벨', bookBasePrice: 5500 },
    { key: 'legion', name: '리전', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmg: 2 }, desc: '주변 협동 시 스탯 강화 +2%/레벨', bookBasePrice: 5200 },
    { key: 'swarm', name: '스웜', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmgBig: 5 }, desc: '거대 적(체력 10만+)에게 +5%/레벨', bookBasePrice: 5800 },
    { key: 'fatal_tempo', name: '페이탈 템포', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmg: 6 }, desc: '연타 유지 시 +6%/레벨(공속→피해)', bookBasePrice: 7000 },
    { key: 'ultimate_jerry', name: '얼티밋 제리', target: 'weapon', ultimate: true, maxLvl: 5, fx: { first: 5 }, desc: '첫 타격 폭발 +5%/레벨', bookBasePrice: 6000 },
    { key: 'inferno', name: '인페르노', target: 'weapon', ultimate: true, maxLvl: 5, fx: { dmg: 4 }, desc: '화염 중첩 최종 피해 +4%/레벨', bookBasePrice: 5400 },
    { key: 'last_stand_ult', name: '라스트 스탠드(얼티밋)', target: 'armor', ultimate: true, maxLvl: 5, fx: { lastStand: 12 }, desc: 'HP 30% 이하 방어 +12/레벨', bookBasePrice: 5000 },
    { key: 'wisdom', name: '위즈덤', target: 'weapon', ultimate: true, maxLvl: 5, fx: { xp: 12 }, desc: '전투 XP +12%/레벨', bookBasePrice: 4800 },
    { key: 'bank', name: '뱅크', target: 'armor', ultimate: true, maxLvl: 5, fx: { coin: 8 }, desc: '전투 골드 +8%/레벨', bookBasePrice: 4600 },
    // ── V19: 바닐라 마인크래프트 인챈트 명시(활 계열) — vanilla:true ──
    { key: 'power', name: '힘(Power)', target: 'weapon', vanilla: true, maxLvl: 7, fx: { dmg: 5 }, desc: '바닐라: 원거리 피해 +5%/레벨(혼돈으로 초과 가능)', bookBasePrice: 600 },
    { key: 'punch', name: '밀치기(Punch)', target: 'weapon', vanilla: true, maxLvl: 2, fx: { first: 6 }, desc: '바닐라: 넉백 + 첫타 +6%/레벨', bookBasePrice: 700 },
  ];
  // 인챈트북 부여 비용 = bookBasePrice × 현재 레벨(첫 부여는 무료)
  const CHAOS_ENCHANT = {
    overcapLevels: 5,                       // 북 상한 + 5레벨까지 혼돈 부여 가능
    costMulPerOver: 3,                      // 비용 = bookBasePrice × 3 × (초과 단계)
    successBase: 0.60, successDropPerOver: 0.10, successMin: 0.15,   // 초과 단계마다 성공률 -10%p
    failDowngradeChance: 0.40,              // 실패 시 40% 확률로 레벨 1 하락(북 상한 밑으로는 안 떨어짐)
  };

  /* ---------------- 제작 레시피(컬렉션 티어로 해금 — 실제 스카이블럭 방식) ---------------- */
  // 인챈티드 자원: 원자재 160개 → 1개(판매가 20% 프리미엄 = 제작 노가다 보상)
  // 인챈티드 아이템: 모든 컬렉션 자원 — 원자재 160개(32×5 십자 배열) → 인챈티드 1개
  // V43: 실제 스카이블럭 속성(위키 Attributes) — 파편을 사이펀해 I~X 성장. 만렙 누적 파편 = 위키 확정(96/64/48/32/24)
  const ATTR_LADDER = {   // 레벨별 소요 파편(누적이 위키 만렙값과 정확히 일치하도록 수작업 배분)
    common: [1, 2, 3, 5, 8, 12, 16, 20, 29],       // 누적 96
    uncommon: [1, 2, 3, 4, 6, 8, 10, 13, 17],      // 누적 64
    rare: [1, 2, 3, 4, 5, 6, 8, 9, 10],            // 누적 48
    epic: [1, 2, 3, 3, 4, 4, 5, 5, 5],             // 누적 32
    legendary: [1, 2, 2, 3, 3, 3, 3, 3, 4],        // 누적 24
  };
  const ATTR_HUNT_REQ = { common: 0, uncommon: 5, rare: 10, epic: 15, legendary: 20 };   // 위키: 사이펀 요구 사냥 레벨
  const ATTRIBUTES = [
    { key: 'vitality', name: '생명력(Vitality)', rarity: 'common', fx: { hp: 2 }, mobs: ['zombie', 'pig', 'cow', 'sheep'], desc: '레벨당 체력 +2' },
    { key: 'fortitude', name: '불굴(Fortitude)', rarity: 'common', fx: { defense: 2 }, mobs: ['skeleton', 'golem'], desc: '레벨당 방어력 +2' },
    { key: 'speed_attr', name: '신속(Speed)', rarity: 'common', fx: { speed: 1 }, mobs: ['chicken', 'rabbit', 'silverfish'], desc: '레벨당 속도 +1' },
    { key: 'mana_pool', name: '마나 풀(Mana Pool)', rarity: 'common', fx: { intelligence: 2 }, mobs: ['witch', 'sea'], desc: '레벨당 지력 +2' },
    { key: 'lifeline', name: '생명줄(Lifeline)', rarity: 'uncommon', fx: { hp: 4 }, mobs: ['spider', 'wolf'], desc: '레벨당 체력 +4' },
    { key: 'attack_speed', name: '공격 속도(Attack Speed)', rarity: 'uncommon', fx: { attackSpeed: 1 }, mobs: ['blaze', 'piglin'], desc: '레벨당 공격 속도 +1' },
    { key: 'mending', name: '수선(Mending)', rarity: 'uncommon', fx: { hpRegen: 1 }, mobs: ['slime', 'creeper'], desc: '레벨당 2초 재생 +1' },
    { key: 'veteran', name: '베테랑(Veteran)', rarity: 'uncommon', fx: { combatWisdom: 1 }, mobs: ['crypt', 'graveyard'], desc: '레벨당 전투 XP +1%' },
    { key: 'undead_attr', name: '언데드(Undead)', rarity: 'rare', fx: { undeadDmg: 1 }, mobs: ['zombie', 'skeleton', 'ghoul'], desc: '레벨당 언데드 피해 +1%' },
    { key: 'arachno', name: '아라크노(Arachno)', rarity: 'rare', fx: { arachnoDmg: 1 }, mobs: ['spider', 'tarantula'], desc: '레벨당 거미류 피해 +1%' },
    { key: 'blazing', name: '블레이징(Blazing)', rarity: 'rare', fx: { blazingDmg: 1 }, mobs: ['blaze', 'magma'], desc: '레벨당 화염계 피해 +1%' },
    { key: 'ender_attr', name: '엔더(Ender)', rarity: 'rare', fx: { enderDmg: 1 }, mobs: ['enderman', 'endermite'], desc: '레벨당 엔더계 피해 +1%' },
    { key: 'pet_wisdom', name: '펫 지혜(Pet Wisdom)', rarity: 'epic', fx: { tamingWisdom: 0.5 }, mobs: ['wolf', 'ocelot', 'horse'], desc: '레벨당 조련 XP +0.5%' },
    { key: 'blazing_fortune', name: '블레이징 포춘(Blazing Fortune)', rarity: 'epic', fx: { magicFind: 1 }, mobs: ['magma', 'blaze'], desc: '레벨당 마법 탐지 +1' },
    { key: 'fishing_speed', name: '낚시 속도(Fishing Speed)', rarity: 'epic', fx: { fishingWisdom: 3 }, mobs: ['sea', 'squid', 'guardian'], desc: '레벨당 낚시 XP +3%' },
    { key: 'dominance', name: '지배(Dominance)', rarity: 'legendary', fx: { dominance: 1.5 }, mobs: ['dragon', 'boss', 'wither'], desc: '체력이 가득할 때 레벨당 피해 +1.5%' },
  ];
  // V42: 실제 스카이블럭 물약(위키 Potions) — fx는 레벨당 수치, dur(분)=3+레벨, 일부는 컬렉션 보상 해금(위키 그대로)
  const BREWS = [
    { key: 'speed', name: '신속', maxLvl: 8, fx: { speed: 5 }, needs: { sugarcane: 8 }, xp: 40, flavor: '설탕 — 이동 속도 +5/레벨' },
    { key: 'strength', name: '힘', maxLvl: 8, fx: { strength: 5 }, needs: { blaze_rod: 1 }, xp: 80, flavor: '블레이즈 파우더 — 힘 +5/레벨' },
    { key: 'healing', name: '치유', maxLvl: 8, instant: { heal: 20 }, needs: { melon: 12 }, xp: 50, flavor: '반짝이는 수박 — 즉시 회복 20/레벨' },
    { key: 'regeneration', name: '재생', maxLvl: 9, fx: { hpRegen: 5 }, needs: { ghast_tear: 1 }, xp: 80, flavor: '가스트의 눈물 — 2초마다 +5/레벨 회복' },
    { key: 'mana', name: '마나', maxLvl: 8, fx: { intelligence: 10 }, needs: { lapis: 16 }, xp: 60, flavor: '청금석 — 지력 +10/레벨' },
    { key: 'critical', name: '치명타', maxLvl: 4, fx: { critChance: 5, critDamage: 10 }, needs: { diamond: 2, sugarcane: 4 }, xp: 90, flavor: '크리 확률 +5%/크리 피해 +10%/레벨' },
    { key: 'archery', name: '궁술', maxLvl: 4, fx: { bowDmg: 12.5 }, needs: { feather: 8 }, xp: 70, unlock: { resource: 'feather', tier: 3 }, flavor: '활 피해 +12.5%/레벨 (깃털 III 해금)' },
    { key: 'haste', name: '성급함', maxLvl: 4, fx: { miningSpeed: 20 }, needs: { coal: 16 }, xp: 60, unlock: { resource: 'coal', tier: 3 }, flavor: '채굴 속도 +20%/레벨 (석탄 III 해금)' },
    { key: 'rabbit', name: '토끼', maxLvl: 6, fx: { speed: 10 }, needs: { carrot: 16 }, xp: 50, flavor: '토끼처럼 빠르게 — 속도 +10/레벨' },
    { key: 'night_vision', name: '야간 투시', maxLvl: 1, fx: { nightVision: 1 }, needs: { carrot: 8, gold: 2 }, xp: 40, flavor: '황금 당근 — 밤에도 밝게' },
    { key: 'water_breathing', name: '수중 호흡', maxLvl: 4, fx: { waterBreath: 1 }, needs: { pufferfish: 2 }, xp: 50, flavor: '복어 — 물속에서 숨쉬기' },
    { key: 'experience', name: '경험', maxLvl: 4, fx: { xpBoost: 10 }, needs: { lapis: 32 }, xp: 100, unlock: { resource: 'lapis', tier: 6 }, flavor: '스킬 XP +10%/레벨 (청금석 VI 해금)' },
    { key: 'resistance', name: '저항', maxLvl: 8, fx: { defense: 5 }, needs: { iron: 8 }, xp: 60, flavor: '방어력 +5/레벨' },
    { key: 'absorption', name: '흡수', maxLvl: 8, fx: { hp: 10 }, needs: { gold: 8 }, xp: 70, unlock: { resource: 'gold', tier: 6 }, flavor: '체력 +10/레벨 (금 VI 해금)' },
    { key: 'magic_find', name: '마법 탐지', maxLvl: 4, fx: { magicFind: 10 }, needs: { ender_pearl: 4, diamond: 2 }, xp: 120, flavor: '마법 탐지 +10/레벨' },
    { key: 'dodge', name: '회피', maxLvl: 4, fx: { defense: 10 }, needs: { salmon: 8 }, xp: 60, unlock: { resource: 'salmon', tier: 2 }, flavor: '몸놀림이 가벼워진다 (연어 II 해금)' },
    { key: 'venomous', name: '맹독', maxLvl: 4, fx: { strength: 3 }, needs: { spider_eye: 8, potato: 16 }, xp: 80, unlock: { resource: 'potato', tier: 5 }, flavor: '공격에 독을 바른다 (감자 V 해금)' },
    { key: 'knockback', name: '밀치기', maxLvl: 4, fx: { knockback: 1 }, needs: { slime_ball: 8 }, xp: 50, unlock: { resource: 'slime_ball', tier: 4 }, flavor: '공격 넉백 증가 (슬라임볼 IV 해금)' },
    { key: 'stun', name: '기절', maxLvl: 4, fx: { stun: 1 }, needs: { obsidian: 4 }, xp: 90, unlock: { resource: 'obsidian', tier: 6 }, flavor: '공격 시 몹을 잠시 멈춘다 (흑요석 VI 해금)' },
    { key: 'burning', name: '연소', maxLvl: 4, fx: { burn: 5 }, needs: { magma_cream: 8 }, xp: 70, flavor: '공격에 화염 데미지를 더한다' },
  ];
  const ENCHANTED_RES = COLLECTIONS.reduce((a, c) => a.concat(c.resources.map(r => r.key)), []).concat(EXTRA_RES.map(r => r.key));
  // V39: 인챈티드 레시피 해금 티어 — 위키 컬렉션 보상 티어 그대로(수작업)
  const ENCH_UNLOCK_T = { stone: 4, coal: 3, iron: 4, gold: 5, lapis: 4, redstone: 4, diamond: 4, emerald: 4, obsidian: 4, wheat: 5, carrot: 4, potato: 4, pumpkin: 3, melon: 4, sugarcane: 3, oaklog: 3, birchlog: 3, sprucelog: 3, dark_oak_log: 3, jungle_log: 3, acacia_log: 3, rotten_flesh: 4, bone: 5, string: 4, spider_eye: 4, gunpowder: 4, ender_pearl: 2, ghast_tear: 3, slime_ball: 5, blaze_rod: 6, magma_cream: 3, feather: 5, leather: 4, raw_porkchop: 3, raw_chicken: 4, raw_mutton: 5, rawfish: 6, salmon: 4, clownfish: 4, pufferfish: 2, prismarine: 3, sponge: 4, clay: 2 };
  const ENCH_BLOCK_T = { stone: 5, coal: 7, iron: 7, gold: 8, lapis: 7, redstone: 8, diamond: 8, emerald: 7, bone: 10, slime_ball: 8, gunpowder: 6, ender_pearl: 6 };
  // 광물은 한 단계 더: 인챈티드 160개 → 인챈티드 블록
  const ENCHANTED_BLOCK_RES = ['stone', 'coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond', 'emerald', 'bone', 'slime_ball', 'gunpowder', 'ender_pearl'];   // V10: 12종
  // V94: 컬렉션에 없는 자원(EXTRA_RES: apple/ender_shard)은 티어가 없어 unlock이 영구 false → 인챈티드 레시피 영구 잠금. 컬렉션 자원만 티어 잠금, 그 외는 항상 해금.
  const COLL_RES_SET = new Set(COLLECTIONS.reduce((a, c) => a.concat(c.resources.map(r => r.key)), []));
  const RECIPES = [
    ...ENCHANTED_RES.map(rk => ({
      key: `enchanted_${rk}`, needs: { [rk]: 160 }, gives: 1, unlock: COLL_RES_SET.has(rk) ? { resource: rk, tier: ENCH_UNLOCK_T[rk] || 2 } : null,
    })),
    ...ENCHANTED_BLOCK_RES.map(rk => ({
      key: `enchanted_${rk}_block`, needs: { [`enchanted_${rk}`]: 160 }, gives: 1, unlock: { resource: rk, tier: ENCH_BLOCK_T[rk] || 5 },
    })),
    // ===== V12: 바닐라 마인크래프트 조합 체인(항상 해금 — 원목→판자→막대→도구/작업대/화로/상자) =====
    { key: 'oak_planks', needs: { oaklog: 1 }, gives: 4, unlock: null },
    { key: 'birch_planks', needs: { birchlog: 1 }, gives: 4, unlock: null },
    { key: 'spruce_planks', needs: { sprucelog: 1 }, gives: 4, unlock: null },
    { key: 'dark_oak_planks', needs: { dark_oak_log: 1 }, gives: 4, unlock: null },
    { key: 'jungle_planks', needs: { jungle_log: 1 }, gives: 4, unlock: null },
    { key: 'acacia_planks', needs: { acacia_log: 1 }, gives: 4, unlock: null },
    // V21-C: 나무 호환(MC 표준) — 막대/작업대/상자/나무도구는 '아무 판자'로 제작(any_planks 그룹)
    { key: 'stick', needs: { any_planks: 2 }, gives: 4, unlock: null },
    { key: 'crafting_table', needs: { any_planks: 4 }, gives: 1, unlock: null },
    { key: 'furnace', needs: { cobblestone: 8 }, gives: 1, unlock: null },
    { key: 'chest', needs: { any_planks: 8 }, gives: 1, unlock: null },
    { key: 'torch', needs: { coal: 1, stick: 1 }, gives: 4, unlock: null },
    // 바닐라 도구(정확한 재료: 판자/조약돌 + 막대). 여기선 전부 최하 등급 성능.
    { key: 'wooden_pickaxe', needs: { any_planks: 3, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_axe', needs: { any_planks: 3, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_hoe', needs: { any_planks: 2, stick: 2 }, gives: 1, unlock: null },
    { key: 'wooden_sword', needs: { any_planks: 2, stick: 1 }, gives: 1, unlock: null },
    // V21-C: 섬 포탈 레시피 — 제작 후 '프라이빗 섬에 설치'해야 해당 섬 워프 해금(허브/홈 제외, 실제 스블 방식)
    { key: 'portal_barn', needs: { wheat: 64, any_planks: 32 }, gives: 1, unlock: null },
    { key: 'portal_park', needs: { oaklog: 96, stick: 16 }, gives: 1, unlock: null },
    { key: 'portal_gold', needs: { stone: 128, coal: 64 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'portal_deep', needs: { stone: 192, iron: 64 }, gives: 1, unlock: { resource: 'iron', tier: 1 } },
    { key: 'portal_spider', needs: { string: 64, bone: 32 }, gives: 1, unlock: { skill: 'combat', lv: 2 } },
    { key: 'portal_mushroom', needs: { wheat: 96, potato: 48 }, gives: 1, unlock: { skill: 'farming', lv: 2 } },
    { key: 'portal_nether', needs: { obsidian: 24, blaze_rod: 12 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'portal_end', needs: { ender_pearl: 24, obsidian: 48 }, gives: 1, unlock: { skill: 'combat', lv: 10 } },
    { key: 'fishing_rod', needs: { stick: 3, string: 2 }, gives: 1, unlock: null },
    { key: 'stone_pickaxe', needs: { cobblestone: 3, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_axe', needs: { cobblestone: 3, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_hoe', needs: { cobblestone: 2, stick: 2 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_sword', needs: { cobblestone: 2, stick: 1 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'iron_sword', needs: { iron: 2, stick: 1 }, gives: 1, unlock: { resource: 'iron', tier: 1 } },
    // V21-D: 금 도구/검(바닐라 조합 — 금 주괴 + 막대)
    { key: 'golden_pickaxe', needs: { gold: 3, stick: 2 }, gives: 1, unlock: { resource: 'gold', tier: 1 } },
    { key: 'golden_axe', needs: { gold: 3, stick: 2 }, gives: 1, unlock: { resource: 'gold', tier: 1 } },
    { key: 'golden_hoe', needs: { gold: 2, stick: 2 }, gives: 1, unlock: { resource: 'gold', tier: 1 } },
    { key: 'golden_sword', needs: { gold: 2, stick: 1 }, gives: 1, unlock: { resource: 'gold', tier: 1 } },
    { key: 'golden_rod', needs: { gold: 12, string: 8 }, gives: 1, unlock: { resource: 'gold', tier: 1 } },
    // V22-G2: 석재 변형(바닐라 조합) — 섬록암=조약돌2+석영2, 화강암=섬록암+석영, 안산암=섬록암+조약돌, 연마=4→4, 석재벽돌=돌4
    { key: 'diorite', needs: { cobblestone: 2, quartz_block: 2 }, gives: 2, unlock: null },
    { key: 'granite', needs: { diorite: 1, quartz_block: 1 }, gives: 1, unlock: null },
    { key: 'andesite', needs: { diorite: 1, cobblestone: 1 }, gives: 2, unlock: null },
    { key: 'polished_granite', needs: { granite: 4 }, gives: 4, unlock: null },
    { key: 'polished_diorite', needs: { diorite: 4 }, gives: 4, unlock: null },
    { key: 'stone_bricks', needs: { stone: 4 }, gives: 4, unlock: null },
    // V21-F1: 광물 저장 블록 9↔1 (바닐라 압축/해체)
    { key: 'iron_block', needs: { iron: 9 }, gives: 1, unlock: null },
    { key: 'gold_block', needs: { gold: 9 }, gives: 1, unlock: null },
    { key: 'diamond_block', needs: { diamond: 9 }, gives: 1, unlock: null },
    { key: 'emerald_block', needs: { emerald: 9 }, gives: 1, unlock: null },
    { key: 'coal_block', needs: { coal: 9 }, gives: 1, unlock: null },
    { key: 'redstone_block', needs: { redstone: 9 }, gives: 1, unlock: null },
    { key: 'lapis_block', needs: { lapis: 9 }, gives: 1, unlock: null },
    // V23-C: 구리(원시 구리 9=블록, 주괴 9=구리 블록, 깎은/조각) + 딥슬레이트 가공 체인(바닐라)
    { key: 'raw_copper_block', needs: { raw_copper: 9 }, gives: 1, unlock: null },
    { key: 'raw_copper', needs: { raw_copper_block: 1 }, gives: 9, unlock: null },
    { key: 'copper_block', needs: { copper: 9 }, gives: 1, unlock: null },
    { key: 'copper', needs: { copper_block: 1 }, gives: 9, unlock: null },
    { key: 'cut_copper', needs: { copper_block: 4 }, gives: 4, unlock: null },
    { key: 'chiseled_copper', needs: { cut_copper: 2 }, gives: 1, unlock: null },
    { key: 'polished_deepslate', needs: { cobbled_deepslate: 4 }, gives: 4, unlock: null },
    { key: 'deepslate_bricks', needs: { polished_deepslate: 4 }, gives: 4, unlock: null },
    { key: 'deepslate_tiles', needs: { deepslate_bricks: 4 }, gives: 4, unlock: null },
    { key: 'chiseled_deepslate', needs: { cobbled_deepslate: 2 }, gives: 1, unlock: null },
    { key: 'iron', needs: { iron_block: 1 }, gives: 9, unlock: null },
    { key: 'gold', needs: { gold_block: 1 }, gives: 9, unlock: null },
    { key: 'diamond', needs: { diamond_block: 1 }, gives: 9, unlock: null },
    { key: 'emerald', needs: { emerald_block: 1 }, gives: 9, unlock: null },
    { key: 'coal', needs: { coal_block: 1 }, gives: 9, unlock: null },
    { key: 'redstone', needs: { redstone_block: 1 }, gives: 9, unlock: null },
    { key: 'lapis', needs: { lapis_block: 1 }, gives: 9, unlock: null },
    // V21-E2: 사다리/침대/보트(바닐라 조합)
    { key: 'ladder', needs: { stick: 7 }, gives: 3, unlock: null },
    { key: 'bed', needs: { any_wool: 3, any_planks: 3 }, gives: 1, unlock: null },
    { key: 'boat', needs: { any_planks: 5 }, gives: 1, unlock: null },
    { key: 'diamond_sword', needs: { diamond: 2, stick: 1 }, gives: 1, unlock: { resource: 'diamond', tier: 1 } },
    // V17: 계단/반블럭 조합(MC 정확: 판자 3→반블럭 6, 판자 6→계단 4). 재료 있는 흔한 종류만 조합 지원(나머지는 빌더 구매).
    { key: 'oak_planks_slab', needs: { oak_planks: 3 }, gives: 6, unlock: null },
    { key: 'oak_planks_stairs', needs: { oak_planks: 6 }, gives: 4, unlock: null },
    { key: 'birch_planks_slab', needs: { birch_planks: 3 }, gives: 6, unlock: null },
    { key: 'birch_planks_stairs', needs: { birch_planks: 6 }, gives: 4, unlock: null },
    { key: 'spruce_planks_slab', needs: { spruce_planks: 3 }, gives: 6, unlock: null },
    { key: 'spruce_planks_stairs', needs: { spruce_planks: 6 }, gives: 4, unlock: null },
    { key: 'dark_oak_planks_slab', needs: { dark_oak_planks: 3 }, gives: 6, unlock: null },
    { key: 'dark_oak_planks_stairs', needs: { dark_oak_planks: 6 }, gives: 4, unlock: null },
    { key: 'jungle_planks_slab', needs: { jungle_planks: 3 }, gives: 6, unlock: null },
    { key: 'jungle_planks_stairs', needs: { jungle_planks: 6 }, gives: 4, unlock: null },
    { key: 'acacia_planks_slab', needs: { acacia_planks: 3 }, gives: 6, unlock: null },
    { key: 'acacia_planks_stairs', needs: { acacia_planks: 6 }, gives: 4, unlock: null },
    { key: 'cobblestone_slab', needs: { cobblestone: 3 }, gives: 6, unlock: null },
    { key: 'cobblestone_stairs', needs: { cobblestone: 6 }, gives: 4, unlock: null },
    { key: 'stone_bricks', needs: { cobblestone: 4 }, gives: 4, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_bricks_slab', needs: { stone_bricks: 3 }, gives: 6, unlock: { resource: 'stone', tier: 1 } },
    { key: 'stone_bricks_stairs', needs: { stone_bricks: 6 }, gives: 4, unlock: { resource: 'stone', tier: 1 } },
    // V17-B: 울타리(판자4+막대2→3) + 트랩도어(판자6→2) — 흔한 나무 조합
    { key: 'oak_fence', needs: { oak_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'oak_trapdoor', needs: { oak_planks: 6 }, gives: 2, unlock: null },
    { key: 'birch_fence', needs: { birch_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'birch_trapdoor', needs: { birch_planks: 6 }, gives: 2, unlock: null },
    { key: 'spruce_fence', needs: { spruce_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'spruce_trapdoor', needs: { spruce_planks: 6 }, gives: 2, unlock: null },
    { key: 'oak_door', needs: { oak_planks: 6 }, gives: 3, unlock: null },
    { key: 'birch_door', needs: { birch_planks: 6 }, gives: 3, unlock: null },
    { key: 'spruce_door', needs: { spruce_planks: 6 }, gives: 3, unlock: null },
    { key: 'dark_oak_fence', needs: { dark_oak_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'dark_oak_trapdoor', needs: { dark_oak_planks: 6 }, gives: 2, unlock: null },
    { key: 'dark_oak_door', needs: { dark_oak_planks: 6 }, gives: 3, unlock: null },
    { key: 'jungle_fence', needs: { jungle_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'jungle_trapdoor', needs: { jungle_planks: 6 }, gives: 2, unlock: null },
    { key: 'jungle_door', needs: { jungle_planks: 6 }, gives: 3, unlock: null },
    { key: 'acacia_fence', needs: { acacia_planks: 4, stick: 2 }, gives: 3, unlock: null },
    { key: 'acacia_trapdoor', needs: { acacia_planks: 6 }, gives: 2, unlock: null },
    { key: 'acacia_door', needs: { acacia_planks: 6 }, gives: 3, unlock: null },
    { key: 'iron_pickaxe', needs: { iron: 3, stick: 2 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'iron_axe', needs: { iron: 3, stick: 2 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'minion_fuel_coal', needs: { coal: 32 }, gives: 1, unlock: { resource: 'coal', tier: 2 } },
    { key: 'talisman_potato', needs: { potato: 160 }, gives: 1, unlock: { resource: 'potato', tier: 2 } },
    { key: 'talisman_zombie', needs: { rotten_flesh: 160 }, gives: 1, unlock: { resource: 'rotten_flesh', tier: 2 } },
    { key: 'talisman_farming', needs: { wheat: 256 }, gives: 1, unlock: { resource: 'wheat', tier: 3 } },
    { key: 'talisman_mining', needs: { coal: 256 }, gives: 1, unlock: { resource: 'coal', tier: 3 } },
    { key: 'talisman_lumber', needs: { oaklog: 256 }, gives: 1, unlock: { resource: 'oaklog', tier: 3 } },
    { key: 'talisman_fisher_anklet', needs: { rawfish: 160, prismarine: 16 }, gives: 1, unlock: { resource: 'rawfish', tier: 3 } },
    { key: 'talisman_campfire', needs: { sprucelog: 128, coal: 64 }, gives: 1, unlock: { resource: 'sprucelog', tier: 2 } },
    { key: 'talisman_feather', needs: { string: 64, bone: 64 }, gives: 1, unlock: { resource: 'bone', tier: 2 } },
    { key: 'reforge_stone_common', needs: { gold: 32, diamond: 4 }, gives: 1, unlock: { resource: 'gold', tier: 3 } },
    { key: 'reforge_stone_rare', needs: { diamond: 32, obsidian: 8 }, gives: 1, unlock: { resource: 'diamond', tier: 4 } },
    { key: 'diamond_pickaxe', needs: { diamond: 3, stick: 2 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'diamond_axe', needs: { diamond: 3, stick: 2 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'diamond_hoe', needs: { diamond: 2, stick: 2 }, gives: 1, unlock: { resource: 'diamond', tier: 2 } },
    { key: 'iron_hoe', needs: { iron: 2, stick: 2 }, gives: 1, unlock: { resource: 'iron', tier: 2 } },
    { key: 'iron_rod', needs: { iron: 16, string: 8 }, gives: 1, unlock: { resource: 'string', tier: 2 } },
    { key: 'diamond_rod', needs: { diamond: 10, string: 16 }, gives: 1, unlock: { resource: 'clay', tier: 3 } },
    { key: 'ancient_pickaxe', needs: { dungeon_essence: 60, diamond: 32 }, gives: 1, unlock: { resource: 'diamond', tier: 5 } },
    { key: 'ancient_axe', needs: { dungeon_essence: 60, diamond: 32 }, gives: 1, unlock: { resource: 'obsidian', tier: 4 } },
    { key: 'ancient_hoe', needs: { dungeon_essence: 50, diamond: 24 }, gives: 1, unlock: { resource: 'wheat', tier: 6 } },
    { key: 'ancient_rod', needs: { dungeon_essence: 50, prismarine: 64 }, gives: 1, unlock: { resource: 'prismarine', tier: 4 } },
    { key: 'auto_shipping_module', needs: { iron: 64, redstone: 32 }, gives: 1, unlock: { resource: 'redstone', tier: 2 } },
    { key: 'diamond_spreading', needs: { diamond: 64, gold: 32 }, gives: 1, unlock: { resource: 'diamond', tier: 3 } },
    // V8: 스킬 레벨 해금 레시피(전투/마법부여 게이트)
    { key: 'weapon_rare', needs: { iron: 32, oaklog: 8 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'bow_rare', needs: { string: 24, oaklog: 16 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'staff_rare', needs: { lapis: 24, oaklog: 12 }, gives: 1, unlock: { skill: 'enchanting', lv: 4 } },
    { key: 'armor_rare', needs: { iron: 48 }, gives: 1, unlock: { skill: 'combat', lv: 5 } },
    { key: 'weapon_epic', needs: { gold: 48, diamond: 8 }, gives: 1, unlock: { skill: 'combat', lv: 9 } },
    { key: 'armor_epic', needs: { gold: 64, diamond: 12 }, gives: 1, unlock: { skill: 'combat', lv: 9 } },
    { key: 'weapon_legendary', needs: { diamond: 48, obsidian: 12, dungeon_essence: 40 }, gives: 1, unlock: { skill: 'combat', lv: 14 } },
    { key: 'armor_legendary', needs: { diamond: 64, obsidian: 16, dungeon_essence: 50 }, gives: 1, unlock: { skill: 'combat', lv: 14 } },
    // 마인크래프트 기본 조합(해금 없음)
    { key: 'minion_fuel_lava', needs: { magma_cream: 32, iron: 16 }, gives: 1, unlock: { resource: 'magma_cream', tier: 2 } },
    { key: 'super_compactor', needs: { enchanted_redstone: 1, iron: 64 }, gives: 1, unlock: { resource: 'redstone', tier: 4 } },
    { key: 'compactor', needs: { cobblestone: 160, redstone: 16 }, gives: 1, unlock: { resource: 'stone', tier: 5 } },
    { key: 'hot_potato_book', needs: { potato: 128, sugarcane: 32 }, gives: 1, unlock: { resource: 'potato', tier: 3 } },   // V11
    { key: 'fuming_potato_book', needs: { hot_potato_book: 2, magma_cream: 48 }, gives: 1, unlock: { resource: 'potato', tier: 6 } },   // V11
    { key: 'weapon_common', needs: { oaklog: 10, stone: 4 }, gives: 1, unlock: null },
    { key: 'bow_common', needs: { oaklog: 6, string: 6 }, gives: 1, unlock: null },
    { key: 'armor_common', needs: { rotten_flesh: 24, string: 12 }, gives: 1, unlock: null },
    { key: 'weapon_uncommon', needs: { stone: 24, oaklog: 6 }, gives: 1, unlock: { resource: 'stone', tier: 1 } },
    { key: 'armor_uncommon', needs: { iron: 16, string: 8 }, gives: 1, unlock: { resource: 'iron', tier: 1 } },
    { key: 'treecapitator', needs: { oaklog: 128, sprucelog: 64, gold: 32, diamond: 8 }, gives: 1, unlock: { resource: 'oaklog', tier: 5 } },
    { key: 'stonk', needs: { gold: 64, diamond: 16, obsidian: 8 }, gives: 1, unlock: { resource: 'gold', tier: 5 } },
    { key: 'enchant_book_efficiency', needs: { lapis: 48, redstone: 16 }, gives: 1, unlock: { resource: 'redstone', tier: 2 } },
    { key: 'enchant_book_sharpness', needs: { lapis: 48, ender_pearl: 4 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
    { key: 'enchant_book_protection', needs: { lapis: 48, obsidian: 8 }, gives: 1, unlock: { resource: 'lapis', tier: 2 } },
    { key: 'portal_park', needs: { oaklog: 32, birchlog: 16, sprucelog: 16 }, gives: 1, unlock: { resource: 'oaklog', tier: 2 } },
    { key: 'portal_barn', needs: { wheat: 48, carrot: 16, potato: 16 }, gives: 1, unlock: { resource: 'wheat', tier: 2 } },
    { key: 'portal_gold', needs: { stone: 64, coal: 16 }, gives: 1, unlock: { resource: 'stone', tier: 2 } },
    { key: 'portal_deep', needs: { iron: 32, coal: 32, redstone: 16 }, gives: 1, unlock: { resource: 'iron', tier: 3 } },
    { key: 'portal_spider', needs: { string: 32, spider_eye: 16, bone: 16 }, gives: 1, unlock: { resource: 'string', tier: 2 } },
    { key: 'portal_nether', needs: { blaze_rod: 16, magma_cream: 32, obsidian: 8 }, gives: 1, unlock: { resource: 'blaze_rod', tier: 2 } },
    { key: 'portal_end', needs: { ender_pearl: 32, obsidian: 16, diamond: 8 }, gives: 1, unlock: { resource: 'ender_pearl', tier: 3 } },
    { key: 'portal_mushroom', needs: { sugarcane: 32, melon: 24, pumpkin: 16 }, gives: 1, unlock: { resource: 'melon', tier: 2 } },
  ];

  const _recipeKeys = new Set(RECIPES.map(r => r.key));
  function addRecipe(r) {
    if (_recipeKeys.has(r.key)) return;
    RECIPES.push(r);
    _recipeKeys.add(r.key);
  }
  [
    ['stone', null], ['quartz_block', null], ['sandstone', null], ['bricks', null], ['purpur', null, 'purpur_block'],   // V94: 퍼퍼 블럭 아이템 키는 purpur_block(채굴 드롭)
    ['smooth_stone', null], ['prismarine', null], ['mossy_cobblestone', null], ['polished_andesite', null],
    ['chiseled_stone_bricks', null],
  ].forEach(([mat, unlock, needKey]) => {
    addRecipe({ key: mat + '_slab', needs: { [needKey || mat]: 3 }, gives: 6, unlock });
    addRecipe({ key: mat + '_stairs', needs: { [needKey || mat]: 6 }, gives: 4, unlock });
  });
  addRecipe({ key: 'sandstone', needs: { sand: 4 }, gives: 1, unlock: null });
  addRecipe({ key: 'hay_block', needs: { wheat: 9 }, gives: 1, unlock: null });

  // V89: 바닐라 전 아이템(974)·조합법(economy-vanilla.js, PrismarineJS 데이터) 병합.
  //   기존 게임 조합법이 배열 앞이라 우선 매칭 → 기존 크래프팅 그대로, 바닐라는 미보유 키만 채움(변형 다수 허용).
  const VANILLA_NAMES = {};
  {
    const VAN = (typeof window !== 'undefined' && window.ECON_VANILLA) ? window.ECON_VANILLA : null;
    // V94: 바닐라 재료 키 → 게임 자원 키 별칭(게임은 sugarcane/oaklog 등 무언더스코어 키 사용) — 미스매치로 조합 불가되던 체인 복구
    const VAN_ING_ALIAS = { sugar_cane: 'sugarcane', oak_log: 'oaklog', birch_log: 'birchlog', spruce_log: 'sprucelog' };
    const normIng = needs => { if (!needs) return needs; const o = {}; for (const k in needs) o[VAN_ING_ALIAS[k] || k] = needs[k]; return o; };
    if (VAN) {
      (VAN.items || []).forEach(it => { if (!(it.key in VANILLA_NAMES)) VANILLA_NAMES[it.key] = it.name; });
      // 정책: 게임 조합법(RECIPES 앞)이 이미 있는 키는 바닐라 정의를 '의도적으로' 무시(게임 레시피 우선).
      //   → 겹치는 562키는 죽은 데이터이므로 로드하지 않음. 신규 키만 편입 + 재료 키 정규화.
      (VAN.recipes || []).forEach(r => { if (!_recipeKeys.has(r.key)) { if (r.needs) r.needs = normIng(r.needs); RECIPES.push(r); } });
      // V97 (E2): 병합 후 원본 바닐라 배열(1198 레시피·974 아이템)은 어디서도 다시 읽지 않음 —
      //   이름은 VANILLA_NAMES로 복사됐고 신규 레시피는 RECIPES로 복사됨. 참조를 끊어 파싱본 메모리 회수.
      try { if (typeof window !== 'undefined' && window.ECON_VANILLA) { window.ECON_VANILLA.recipes = null; window.ECON_VANILLA.items = null; } } catch (e) {}
    }
  }

  // V115: 페어리 소울 기능 완전 제거(데이터 삭제) — 사용자 요청

  /* ---------------- 은행 ---------------- */
  // V107: 실측 은행 — 7티어(스타터~팔라티얼), 이자는 트랜치(브래킷) 방식·티어별 최대이자 상한. 시즌(31시간)마다 지급.
  //   각 티어: cap(잔고 상한)/cost(골드)/egb(인챈티드 골드블럭 수)/goldColl(골드 컬렉션 요구)/maxInterest(시즌 최대이자)/brackets([구간상한, 이율%])
  const BANK_BRK = {
    starter: [[10000000, 2], [15000000, 1]],
    gold: [[10000000, 2], [20000000, 1]],
    deluxe: [[10000000, 2], [20000000, 1], [30000000, 0.5]],
    superdeluxe: [[10000000, 2], [20000000, 1], [30000000, 0.5], [50000000, 0.2]],
    premier: [[10000000, 2], [20000000, 1], [30000000, 0.5], [50000000, 0.2], [160000000, 0.1]],
    luxurious: [[10000000, 2], [20000000, 1], [30000000, 0.5], [50000000, 0.2], [160000000, 0.1], [5100000000, 0.01]],
  };
  const BANK = { interestPctPerDay: 2, interestCapBalance: 10000000, interestSeasonHours: 31, unlockBalance: 10000000,
    upgrades: [
      { name: 'Starter', cap: 50000000, cost: 0, egb: 0, goldColl: 0, maxInterest: 250000, brackets: BANK_BRK.starter },
      { name: 'Gold', cap: 100000000, cost: 5000000, egb: 1, goldColl: 100000, maxInterest: 300000, brackets: BANK_BRK.gold },
      { name: 'Deluxe', cap: 250000000, cost: 10000000, egb: 5, goldColl: 250000, maxInterest: 350000, brackets: BANK_BRK.deluxe },
      { name: 'Super Deluxe', cap: 500000000, cost: 25000000, egb: 20, goldColl: 500000, maxInterest: 390000, brackets: BANK_BRK.superdeluxe },
      { name: 'Premier', cap: 1000000000, cost: 50000000, egb: 50, goldColl: 1000000, maxInterest: 500000, brackets: BANK_BRK.premier },
      { name: 'Luxurious', cap: 6000000000, cost: 100000000, egb: 100, goldColl: 2000000, maxInterest: 1000000, brackets: BANK_BRK.luxurious },
      { name: 'Palatial', cap: 60000000000, cost: 200000000, egb: 200, goldColl: 3000000, maxInterest: 1500000, brackets: BANK_BRK.luxurious },
    ] };

  /* ---------------- 일일 특가(경매인) ---------------- */
  const DAILY_DEALS = { count: 5, jackpotMul: 5, normalMul: 2.5 };   // V9: 수집상 5종 + 잭팟 1종(시세 ×5)

  /* ---------------- 상점 ---------------- */
  const SHOP = [
    ...MINIBOSS_LOOT,
    // V12: 바닐라 제작품(이름 표기용 — 성능/블럭 기능은 코드에서)
    { key: 'oak_planks', name: '참나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'birch_planks', name: '자작나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'spruce_planks', name: '가문비 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'cobblestone', name: '조약돌', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    // V23-C: 딥슬레이트 + 구리 계열
    { key: 'deepslate', name: '딥슬레이트', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'cobbled_deepslate', name: '조각난 딥슬레이트', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'polished_deepslate', name: '윤나는 딥슬레이트', category: '건축', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'deepslate_bricks', name: '딥슬레이트 벽돌', category: '건축', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'cracked_deepslate_bricks', name: '금 간 딥슬레이트 벽돌', category: '건축', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'deepslate_tiles', name: '딥슬레이트 타일', category: '건축', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'chiseled_deepslate', name: '조각된 딥슬레이트', category: '건축', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'deepslate_coal_ore', name: '딥슬레이트 석탄 광석', category: '건축', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'deepslate_iron_ore', name: '딥슬레이트 철 광석', category: '건축', buyPrice: 0, sellPrice: 7, stackSize: 64 },
    { key: 'deepslate_gold_ore', name: '딥슬레이트 금 광석', category: '건축', buyPrice: 0, sellPrice: 13, stackSize: 64 },
    { key: 'deepslate_diamond_ore', name: '딥슬레이트 다이아 광석', category: '건축', buyPrice: 0, sellPrice: 46, stackSize: 64 },
    { key: 'deepslate_emerald_ore', name: '딥슬레이트 에메랄드 광석', category: '건축', buyPrice: 0, sellPrice: 26, stackSize: 64 },
    { key: 'deepslate_lapis_ore', name: '딥슬레이트 청금석 광석', category: '건축', buyPrice: 0, sellPrice: 9, stackSize: 64 },
    { key: 'deepslate_redstone_ore', name: '딥슬레이트 레드스톤 광석', category: '건축', buyPrice: 0, sellPrice: 8, stackSize: 64 },
    { key: 'deepslate_copper_ore', name: '딥슬레이트 구리 광석', category: '건축', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'copper_ore', name: '구리 광석', category: '건축', buyPrice: 0, sellPrice: 5, stackSize: 64 },
    { key: 'raw_copper', name: '원시 구리', category: '재료', buyPrice: 0, sellPrice: 3, stackSize: 64 },
    { key: 'copper', name: '구리 주괴', category: '재료', buyPrice: 0, sellPrice: 5, stackSize: 64 },
    { key: 'raw_copper_block', name: '원시 구리 블록', category: '건축', buyPrice: 0, sellPrice: 27, stackSize: 64 },
    { key: 'copper_block', name: '구리 블록', category: '건축', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'cut_copper', name: '깎은 구리', category: '건축', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'chiseled_copper', name: '조각된 구리', category: '건축', buyPrice: 0, sellPrice: 46, stackSize: 64 },
    { key: 'exposed_copper', name: '노출된 구리', category: '건축', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'weathered_copper', name: '풍화된 구리', category: '건축', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'oxidized_copper', name: '산화된 구리', category: '건축', buyPrice: 0, sellPrice: 45, stackSize: 64 },
    { key: 'stick', name: '막대기', category: '재료', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'crafting_table', name: '작업대', category: '제작품', buyPrice: 0, sellPrice: 4, stackSize: 64 },
    { key: 'furnace', name: '화로', category: '제작품', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'chest', name: '상자', category: '제작품', buyPrice: 0, sellPrice: 6, stackSize: 64 },
    { key: 'torch', name: '횃불', category: '제작품', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    // 도구 4계열 × 5티어
    ...Object.keys(TOOLS).flatMap(fam => TOOLS[fam].map(t => ({ key: t.key, name: t.name, category: '도구', tierKey: t.tierKey, buyPrice: t.price, sellPrice: Math.round((t.price || 900 * t.mul) * 0.2), stackSize: 1 }))),
    // 강화/미니언/인챈트
    { key: 'hot_potato_book', name: '핫 포테이토 북', category: '강화재료', buyPrice: 0, sellPrice: 800, stackSize: 64 },   // V11: 장비당 10권(무기 공+2 / 방어구 방+2·체+4)
    { key: 'fuming_potato_book', name: '퓨밍 포테이토 북', category: '강화재료', buyPrice: 0, sellPrice: 4000, stackSize: 64 },   // V11: 11~15권째 확장(희귀)
    { key: 'reforge_stone_common', name: '리포지 스톤(일반)', category: '강화재료', buyPrice: 0, sellPrice: 50, stackSize: 64 },
    { key: 'reforge_stone_rare', name: '리포지 스톤(희귀)', category: '강화재료', buyPrice: 0, sellPrice: 200, stackSize: 64 },
    { key: 'reforge_stone_apex', name: '🐉 신룡의 룬석(전설 리포지)', category: '강화재료', buyPrice: 0, sellPrice: 12000, stackSize: 64 },   // V20-D: F11 최종층 드롭 — 최상급 리포지 스톤
    { key: 'essence_reforge_stone', name: '던전 정수 리포지 스톤', category: '강화재료', buyPrice: 0, sellPrice: 400, stackSize: 64 },
    { key: 'essence_cosmetic_cape', name: '지배자의 망토(장식)', category: '장식', buyPrice: 0, sellPrice: 5000, stackSize: 1 },
    { key: 'dungeon_essence', name: '던전 정수', category: '재료', buyPrice: 0, sellPrice: 120, stackSize: 64 },
    { key: 'arachne_crystal', name: '아라크네 크리스탈', category: '재료', buyPrice: 0, sellPrice: 900, stackSize: 16 },
    ...['magma_cream', 'ghast_tear', 'spider_eye', 'slime_ball', 'gunpowder', 'ender_shard', 'feather', 'leather'].map(k => {
      const names = { magma_cream: '마그마 크림', ghast_tear: '가스트의 눈물', spider_eye: '거미 눈', slime_ball: '슬라임볼', gunpowder: '화약', ender_shard: '엔더 조각', feather: '깃털', leather: '가죽' };
      const sells = { magma_cream: 8, ghast_tear: 40, spider_eye: 5, slime_ball: 4, gunpowder: 6, ender_shard: 22, feather: 3, leather: 5 };
      return { key: k, name: names[k], category: '재료', buyPrice: 0, sellPrice: sells[k], stackSize: 64 };
    }),
    { key: 'treecapitator', name: '트리캐피테이터(나무 통째 벌목)', category: '특수 도구', buyPrice: 0, sellPrice: 20000, stackSize: 1 },
    { key: 'stonk', name: '스통크(채굴 가속 곡괭이)', category: '특수 도구', buyPrice: 0, sellPrice: 25000, stackSize: 1 },
    { key: 'minion_slot_expander', name: '미니언 슬롯 확장권', category: '미니언', buyPrice: 0, sellPrice: 0, stackSize: 1 },
    { key: 'auto_shipping_module', name: '자동출하 모듈', category: '미니언', buyPrice: 0, sellPrice: 500, stackSize: 1 },
    { key: 'diamond_spreading', name: '다이아 살포기(생산 시 10% 다이아 추가)', category: '미니언', buyPrice: 0, sellPrice: 2000, stackSize: 1 },
    { key: MINION_FUEL.key, name: MINION_FUEL.name, category: '미니언', buyPrice: 0, sellPrice: 100, stackSize: 64 },
    { key: MINION_FUEL2.key, name: MINION_FUEL2.name, category: '미니언', buyPrice: 0, sellPrice: 800, stackSize: 16 },
    { key: 'super_compactor', name: '슈퍼 컴팩터(미니언 산출 압축 — 판매가치 +50%)', category: '미니언', buyPrice: 0, sellPrice: 3000, stackSize: 1 },
    // 인챈티드 자원(제작 전용, 판매가 20% 프리미엄)
    ...ENCHANTED_BLOCK_RES.map(rk => {
      const r = COLLECTIONS.flatMap(c => c.resources).concat(EXTRA_RES).find(x => x.key === rk);
      return { key: `enchanted_${rk}_block`, name: `인챈티드 ${r.name} 블록`, category: '제작품', buyPrice: 0, sellPrice: Math.round(r.sellPrice * 160 * 1.2 * 160 * 1.1), stackSize: 64 };
    }),
    ...ENCHANTED_RES.map(rk => {
      const r = COLLECTIONS.flatMap(c => c.resources).concat(EXTRA_RES).find(x => x.key === rk);
      return { key: `enchanted_${rk}`, name: `인챈티드 ${r.name}`, category: '제작품', buyPrice: 0, sellPrice: Math.round(r.sellPrice * 160 * 1.2), stackSize: 64 };
    }),
    ...ENCHANTS.map(e => ({ key: `enchant_book_${e.key}`, name: `인챈트북: ${e.name}`, category: '인챈트', buyPrice: 0, sellPrice: Math.round(e.bookBasePrice * 0.2), stackSize: 64 })),   // V7: 북은 몹 드롭 전용 — 골드는 합성(부여) 비용에만
    // 부적 20종
    ...TALISMANS.map(t => ({ key: t.key, name: `${t.name} [${ITEM_TIERS.find(x => x.key === t.tierKey).name}]`, category: '장신구', tierKey: t.tierKey, buyPrice: t.buyPrice, sellPrice: t.sellPrice, stackSize: 1 })),
    // 펫 알(eggPrice>0만 상점 판매, 나머지는 드롭 전용)
    ...PETS.map(p => ({ key: `pet_egg_${p.key}`, name: `펫 알: ${p.name}`, category: '펫', tierKey: p.tierKey, buyPrice: 0, sellPrice: Math.max(2000, Math.round((p.eggPrice || 10000) * 0.2)), stackSize: 1 })),   // V7: 펫 알도 몹/낚시/던전 드롭 전용
    // 원자재 31종(sellPrice는 컬렉션 정의에서)
    ...COLLECTIONS.flatMap(cat => cat.resources.map(r => ({ key: r.key, name: r.name, category: '원자재', buyPrice: 0, sellPrice: r.sellPrice, stackSize: 64 }))),
    ...EXTRA_RES.map(r => ({ key: r.key, name: r.name, category: '원자재', buyPrice: 0, sellPrice: r.sellPrice, stackSize: 64 })),
    ...BREWS.map(b => ({ key: `potion_${b.key}`, name: `${b.name}의 물약`, category: '물약', buyPrice: 0, sellPrice: 40 + b.xp, stackSize: 16, flavor: b.flavor })),
    ...ATTRIBUTES.map(a => ({ key: `shard_${a.key}`, name: `속성 파편: ${a.name}`, category: '속성', tierKey: a.rarity === 'common' ? 'common' : a.rarity === 'uncommon' ? 'uncommon' : a.rarity, buyPrice: 0, sellPrice: { common: 50, uncommon: 150, rare: 500, epic: 1500, legendary: 5000 }[a.rarity], stackSize: 64, flavor: a.desc })),
    // 장비(던전 전용은 buyPrice 0 → 구매 불가, 판매만 가능)
    ...EQUIPMENT.weapons.map(w => ({ key: w.key, name: `${w.name} [${ITEM_TIERS.find(t => t.key === w.tierKey).name}]`, category: '무기', tierKey: w.tierKey, buyPrice: w.buyPrice, sellPrice: w.sellPrice, stackSize: 1, dmg: w.dmg, slot: w.slot, traits: w.traits, set: w.set, flavor: w.flavor, reqCombat: w.reqCombat })),
    ...EQUIPMENT.armor.map(a => ({ key: a.key, name: `${a.name} [${ITEM_TIERS.find(t => t.key === a.tierKey).name}]`, category: '방어구', tierKey: a.tierKey, buyPrice: a.buyPrice, sellPrice: a.sellPrice, stackSize: 1, defense: a.defense, hp: a.hp || 0, slot: a.slot, traits: a.traits, set: a.set, flavor: a.flavor, reqCombat: a.reqCombat })),
  ];
  SHOP.push(
    { key: 'granite', name: '화강암', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'polished_granite', name: '윤나는 화강암', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'diorite', name: '섬록암', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'polished_diorite', name: '윤나는 섬록암', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'andesite', name: '안산암', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'mossy_stone_bricks', name: '이끼 낀 석재 벽돌', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'cracked_stone_bricks', name: '금 간 석재 벽돌', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'red_sandstone', name: '붉은 사암', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'smooth_sandstone', name: '매끄러운 사암', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'iron_block', name: '철 블록', category: '건축', buyPrice: 0, sellPrice: 54, stackSize: 64 },
    { key: 'gold_block', name: '금 블록', category: '건축', buyPrice: 0, sellPrice: 72, stackSize: 64 },
    { key: 'diamond_block', name: '다이아몬드 블록', category: '건축', buyPrice: 0, sellPrice: 270, stackSize: 64 },
    { key: 'emerald_block', name: '에메랄드 블록', category: '건축', buyPrice: 0, sellPrice: 270, stackSize: 64 },
    { key: 'coal_block', name: '석탄 블록', category: '건축', buyPrice: 0, sellPrice: 27, stackSize: 64 },
    { key: 'redstone_block', name: '레드스톤 블록', category: '건축', buyPrice: 0, sellPrice: 36, stackSize: 64 },
    { key: 'lapis_block', name: '청금석 블록', category: '건축', buyPrice: 0, sellPrice: 36, stackSize: 64 },
    { key: 'ladder', name: '사다리', category: '건축', buyPrice: 0, sellPrice: 2, stackSize: 64 },
    { key: 'bed', name: '침대', category: '건축', buyPrice: 0, sellPrice: 8, stackSize: 1 },
    { key: 'boat', name: '보트', category: '도구', buyPrice: 0, sellPrice: 6, stackSize: 1 },
    { key: 'promising_axe', name: '프로미싱 도끼', category: '도구', buyPrice: 0, sellPrice: 20, stackSize: 1, flavor: '나무꾼의 벌목 튜토리얼 보상 — 나무 등급 도끼.' },
    { key: 'promising_shovel', name: '프로미싱 삽', category: '도구', buyPrice: 0, sellPrice: 20, stackSize: 1, flavor: '플린트 형제 퀘스트 보상 — 나무 등급 삽.' },
    { key: 'compactor', name: '컴팩터(미니언 산출 블럭 압축)', category: '미니언', buyPrice: 0, sellPrice: 500, stackSize: 1, flavor: '조약돌 컬렉션 V 레시피.' },
    { key: 'dark_oak_planks', name: '짙은 참나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'jungle_planks', name: '정글나무 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'acacia_planks', name: '아카시아 판자', category: '건축', buyPrice: 0, sellPrice: 1, stackSize: 64 },
    { key: 'portal_park', name: '더 파크 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 150, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 더 파크 메뉴 워프를 해금한다.' },
    { key: 'portal_barn', name: '농장 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 150, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 농장 메뉴 워프를 해금한다.' },
    { key: 'portal_gold', name: '골드 광산 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 150, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 골드 광산 메뉴 워프를 해금한다.' },
    { key: 'portal_deep', name: '깊은 동굴 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 180, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 깊은 동굴 메뉴 워프를 해금한다.' },
    { key: 'portal_spider', name: '스파이더 덴 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 180, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 스파이더 덴 메뉴 워프를 해금한다.' },
    { key: 'portal_nether', name: '네더 요새 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 240, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 네더 계열 메뉴 워프를 해금한다.' },
    { key: 'portal_end', name: '엔드 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 320, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 엔드 메뉴 워프를 해금한다.' },
    { key: 'portal_mushroom', name: '버섯 사막 워프 포탈', category: '제작품', buyPrice: 0, sellPrice: 180, stackSize: 1, flavor: '프라이빗 섬에 설치한 뒤 버섯 사막 메뉴 워프를 해금한다.' }
  );
  const DAILY_SELL_LIMIT_PER_STACK = 10;   // dailySellLimit = 10 * stackSize

  // V20-E: 바자회(Bazaar) — 실제 스카이블럭 대량 자원 시장. 즉시구매/즉시판매 + 실시간 시세 변동(스프레드).
  // 장비는 취급하지 않음(무화폐 장비 경제 유지) — 원자재/인챈티드 자원만 거래해 골드↔자원 순환을 담당.
  // 각 상품의 기준가는 SHOP sellPrice에서 런타임 해석. enchanted_ 변형이 SHOP에 있으면 자동 포함.
  const _bzEnch = (k) => ENCHANTED_RES.includes(k) ? [k, `enchanted_${k}`] : [k];
  const BAZAAR = {
    spreadPct: 30,          // 즉시구매가 = 즉시판매가 × (1 + 30%) — 실제 바자 스프레드 반영
    fluxPct: 15,            // 시세 변동폭 ±15%(1시간 단위 시드 — 세이브 무관 재현)
    fluxPeriodMs: 3600000,  // 시세 갱신 주기(1시간)
    cats: [
      { key: 'farming', name: '🌾 농사', keys: ['wheat', 'carrot', 'potato', 'pumpkin', 'melon', 'sugarcane'].flatMap(_bzEnch) },
      { key: 'mining', name: '⛏️ 광물', keys: ['stone', 'coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond', 'emerald', 'obsidian'].flatMap(_bzEnch) },
      { key: 'combat', name: '⚔️ 전투', keys: ['rotten_flesh', 'bone', 'string', 'spider_eye', 'slime_ball', 'gunpowder', 'ender_pearl', 'blaze_rod', 'magma_cream', 'ghast_tear', 'ender_shard'].flatMap(_bzEnch) },
      { key: 'woods_fish', name: '🌲 목재·어획', keys: ['oaklog', 'birchlog', 'sprucelog', 'apple', 'rawfish', 'salmon', 'clownfish', 'pufferfish', 'prismarine', 'sponge', 'clay'].flatMap(_bzEnch) },
      { key: 'odds', name: '🎁 기타', keys: ['feather', 'leather'].flatMap(_bzEnch) },
    ],
  };

  // V20-F: 경매장(Auction House) — 실제 스카이블럭식 경매/즉구(BIN) 판매 시스템.
  // ‘판매 창구’로 구현: 보유 아이템을 경매/BIN 등록 → NPC 수집가가 입찰 → 낙찰 골드 수령.
  // 장비는 여전히 골드로 살 수 없음(드롭·조합 전용) — 경매장은 잉여분을 더 비싸게 파는 골드 창구.
  const AUCTION_HOUSE = {
    maxListings: 7,                 // 동시 등록 슬롯(무료 3 + 클레임/취소로 순환)
    durations: [1, 6, 24],          // 경매 기간(시간)
    minStartMul: 0.6,               // 시작가 하한(시세 대비) — 너무 싸게 던지는 것 방지 안내용
    binMaxMul: 5,                   // BIN 상한(시세 대비) — 안 팔릴 뿐, 등록은 허용
    // 낙찰가 산정: 물품 가치(시세)의 배수 범위에서 시드 결정 → 경매는 시간에 따라 입찰 상승.
    auctionValueMin: 1.5, auctionValueMax: 2.6,   // 경매 낙찰 배수(시세 대비) — 인내의 보상
    binSellValueMul: 1.3,           // BIN은 시세×1.3 이하일 때만 팔림(그 이상은 대기)
    binHalfLifeH: 6,                // BIN 판매 확률 반감기(시간)
    feePct: 1,                      // 등록 수수료(낙찰가 기준 차감)
  };

  // V20-G: 산의 심장(Heart of the Mountain) — 실제 스카이블럭 채광 퍼크 트리.
  // 채광으로 미스릴/젬스톤 가루를 모아 노드를 강화 → 채광 포춘/속도/특수능력 획득.
  const HEART_OF_MOUNTAIN = {
    maxTier: 7,
    // tier 해금에 필요한 누적 미스릴 가루(idx = 해금할 tier). tier1은 기본 개방.
    tierUnlock: [0, 0, 5000, 25000, 100000, 300000, 800000, 2000000],
    powderPerMine: 4,               // 채광 1회당 미스릴 가루 기대치(수량 비례)
    gemstoneChance: 0.12,           // 채광 시 젬스톤 가루 획득 확률
    gemstonePerMine: 2,
    nodes: [
      // tier 1
      { key: 'mining_speed', name: '채광 속도', emoji: '⚡', tier: 1, max: 50, powder: 'mithril', base: 50, mul: 1.08, stat: 'miningSpeed', per: 20, desc: '채광 속도 +{v}' },
      { key: 'mining_fortune', name: '채광 행운', emoji: '🍀', tier: 1, max: 50, powder: 'mithril', base: 50, mul: 1.08, stat: 'miningFortune', per: 5, desc: '채광 포춘 +{v}%' },
      // tier 2
      { key: 'quick_forge', name: '신속한 제련', emoji: '🔨', tier: 2, max: 20, powder: 'mithril', base: 200, mul: 1.15, stat: 'forgeSpeed', per: 1, desc: '제련 속도 +{v}%' },
      { key: 'titanium_insanity', name: '티타늄 광기', emoji: '🔩', tier: 2, max: 10, powder: 'mithril', base: 300, mul: 1.2, stat: 'titanium', per: 2, desc: '티타늄 확률 +{v}%' },
      { key: 'daily_powder', name: '일일 가루', emoji: '📅', tier: 2, max: 100, powder: 'mithril', base: 100, mul: 1.05, stat: 'dailyPowder', per: 200, desc: '채광 가루 획득 +{v}' },
      // tier 3
      { key: 'mining_madness', name: '채광 광란', emoji: '🌀', tier: 3, max: 1, powder: 'mithril', base: 50000, mul: 1, stat: 'madness', per: 50, desc: '채광 속도·포춘 +50' },
      { key: 'pickobulus', name: '피코불로스', emoji: '💥', tier: 3, max: 3, powder: 'mithril', base: 40000, mul: 1.4, stat: 'pickobulus', per: 1, desc: '광역 채광 능력 Lv{v}' },
      { key: 'seasoned_mineman', name: '노련한 광부', emoji: '📈', tier: 3, max: 100, powder: 'mithril', base: 100, mul: 1.06, stat: 'miningXp', per: 0.1, desc: '채광 경험치 +{v}%' },
      // tier 4~ (gemstone)
      { key: 'goblin_killer', name: '고블린 사냥꾼', emoji: '👺', tier: 4, max: 200, powder: 'gemstone', base: 250, mul: 1.06, stat: 'gemstoneFortune', per: 1, desc: '젬스톤 포춘 +{v}' },
      { key: 'lonesome_miner', name: '고독한 광부', emoji: '🕳️', tier: 5, max: 45, powder: 'gemstone', base: 400, mul: 1.1, stat: 'combatMining', per: 5, desc: '채광 시 힘·크리 +{v}' },
      { key: 'professional', name: '프로페셔널', emoji: '🎓', tier: 5, max: 140, powder: 'gemstone', base: 300, mul: 1.05, stat: 'miningSpeed', per: 5, desc: '채광 속도 +{v}' },
      { key: 'mineshaft_mayhem', name: '광맥의 대혼란', emoji: '🌋', tier: 6, max: 1, powder: 'gemstone', base: 500000, mul: 1, stat: 'gemMadness', per: 100, desc: '젬스톤 포춘 +100' },
      { key: 'titans_grip', name: '타이탄의 손아귀', emoji: '✊', tier: 7, max: 1, powder: 'gemstone', base: 2000000, mul: 1, stat: 'titanGrip', per: 250, desc: '채광 포춘 +250' },
    ],
  };

  // 실제 스카이블럭 방식: 상시 직업은 없음. 클래스는 카타콤 던전 전용(입장 시 선택) — 실제 5클래스 라인업.
  const DUNGEON_CLASSES = [
    { key: 'berserk', name: '버서크', emoji: '🗡️', perk: '던전 공격 +25%', dmgMul: 1.25 },
    { key: 'mage', name: '메이지', emoji: '🔮', perk: '퍼즐 자동 성공 + 던전 공격 +10%', dmgMul: 1.10, autoPuzzle: true },
    { key: 'archer', name: '아처', emoji: '🏹', perk: '각 몬스터 첫 타격 +50% + 던전 공격 +10%', dmgMul: 1.10, firstHitMul: 1.5 },
    { key: 'tank', name: '탱크', emoji: '🛡️', perk: '던전에서 받는 피해 -30%', dmgTakenMul: 0.70 },
    { key: 'healer', name: '힐러', emoji: '💚', perk: '방 이동 회복 30% + 공격 시 HP +3', roomHealPct: 0.30, healPerHit: 3 },
  ];

  const ZONES = [
    { key: 'hub', name: '중앙 마을', emoji: '🏘️', desc: '상점·은행·미니언 관리소·펫 상점·인챈트 탑이 모인 허브.' },
    { key: 'mine', name: '깊은 동굴', emoji: '⛏️', desc: '돌부터 흑요석까지 9종 광물을 캐는 대형 광산.' },
    { key: 'farm', name: '농장 벌판', emoji: '🌾', desc: '6종 작물이 자라는 너른 들판. 풍차가 돈다.' },
    { key: 'forest', name: '속삭이는 숲', emoji: '🌲', desc: '참나무·자작나무·가문비를 벌목하는 울창한 숲.' },
    { key: 'dock', name: '어부의 부두', emoji: '🎣', desc: '등대가 서 있는 항구. 7종 해산물을 낚는다.' },
    { key: 'slayerden', name: '슬레이어 황무지', emoji: '💀', desc: '5대 슬레이어 보스에게 도전하는 저주받은 땅.' },
    { key: 'dungeonentrance', name: '카타콤 지구라트', emoji: '🗝️', desc: '7층 카타콤 던전으로 통하는 고대 피라미드.' },
  ];

  const EASTER_EGGS = {
    bankSecretName: '소이러석',
    minionSkinDropChance: 1 / 10000,
    minionSkinName: '다이아몬드 스티브',
    dungeonSecretSequence: ['left', 'left', 'right', 'left'],
    insomniaFishHourRange: [23, 1],
    insomniaFishName: '불면증의 물고기',
    insomniaFishLine: '오늘도 늦게까지 게임하시네요',
    lighthouseKeeper: '등대 꼭대기에 오르면 좋은 일이 생긴다는 소문이 있다',
  };

  /* ================ V11: 난이도 스펙트럼 · 아레나 · 업적 · 일일 퀘스트 · 분해 · 주간 보스 ================ */
  // 필드 난이도 4단계 — 던전·프라이빗 섬 제외 전 필드 몹에 적용(메뉴에서 전환)
  const FIELD_DIFF = {
    easy: { name: '쉬움', emoji: '🌱', lvMul: 0.55, hpMul: 0.5, dmgMul: 0.55, rewardMul: 0.7, req: 0, desc: '입문자용 — 몹이 약해지고 보상도 소폭 감소' },
    normal: { name: '일반', emoji: '⚔️', lvMul: 1, hpMul: 1, dmgMul: 1, rewardMul: 1, req: 0, desc: '표준 밸런스' },
    heroic: { name: '영웅', emoji: '🔥', lvMul: 1.8, hpMul: 2.5, dmgMul: 1.9, rewardMul: 2.1, req: 8, desc: '전투 Lv8+ — 강한 몹, 2배 보상' },
    hell: { name: '지옥', emoji: '☠️', lvMul: 2.8, hpMul: 5.5, dmgMul: 3.2, rewardMul: 3.6, req: 15, desc: '전투 Lv15+ — Lv100 몹과 지옥 보스, 3.6배 보상 + 전용 드롭' },
  };
  // 콜로세움 웨이브 아레나 — 10웨이브 생존전 4난이도
  const ARENA = {
    waves: 10, equipChance: 0.45,
    difficulties: [
      { key: 'easy', name: '입문 투기장', lv: 5, hpMul: 0.8, waveGold: 300, finalGold: 2000, req: 0 },
      { key: 'normal', name: '투사의 시험', lv: 20, hpMul: 1.6, waveGold: 900, finalGold: 7000, req: 6 },
      { key: 'heroic', name: '검투왕 결선', lv: 45, hpMul: 3.2, waveGold: 2500, finalGold: 20000, req: 14 },
      { key: 'hell', name: '지옥 투기장', lv: 80, hpMul: 6.5, waveGold: 6000, finalGold: 60000, req: 20 },
    ],
  };
  // 업적 30종 — statValue(counter/파생값) 기반, 달성 시 보상 자동 지급
  const ACHIEVEMENTS = [
    { key: 'first_blood', name: '첫 사냥', desc: '몬스터 1마리 처치', stat: 'kills', gte: 1, gold: 500 },
    { key: 'hunter_100', name: '사냥꾼', desc: '몬스터 100마리 처치', stat: 'kills', gte: 100, gold: 2000 },
    { key: 'hunter_1000', name: '학살자', desc: '몬스터 1,000마리 처치', stat: 'kills', gte: 1000, gold: 10000 },
    { key: 'hunter_10000', name: '전장의 신', desc: '몬스터 10,000마리 처치', stat: 'kills', gte: 10000, gold: 50000, item: 'fuming_potato_book' },
    { key: 'boss_10', name: '보스 헌터', desc: '보스급 10회 처치', stat: 'bossKills', gte: 10, gold: 5000 },
    { key: 'boss_100', name: '왕조 붕괴자', desc: '보스급 100회 처치', stat: 'bossKills', gte: 100, gold: 30000, item: 'fuming_potato_book' },
    { key: 'hit_1k', name: '천 단위 타격', desc: '한 방 피해 1,000 달성', stat: 'maxHit', gte: 1000, gold: 2000 },
    { key: 'hit_10k', name: '만 단위 타격', desc: '한 방 피해 10,000 달성', stat: 'maxHit', gte: 10000, gold: 8000 },
    { key: 'hit_100k', name: '유성 낙하', desc: '한 방 피해 100,000 달성', stat: 'maxHit', gte: 100000, gold: 40000 },
    { key: 'rich_10k', name: '첫 목돈', desc: '누적 1만 골드 획득', stat: 'goldEarned', gte: 10000, gold: 1000 },
    { key: 'rich_100k', name: '알부자', desc: '누적 10만 골드 획득', stat: 'goldEarned', gte: 100000, gold: 5000 },
    { key: 'rich_1m', name: '백만장자', desc: '누적 100만 골드 획득', stat: 'goldEarned', gte: 1000000, gold: 20000 },
    { key: 'rich_10m', name: '재벌', desc: '누적 1,000만 골드 획득', stat: 'goldEarned', gte: 10000000, gold: 100000 },
    { key: 'fisher_100', name: '어부의 길', desc: '물고기 100마리', stat: 'fishCaught', gte: 100, gold: 3000 },
    { key: 'fisher_1000', name: '바다의 친구', desc: '물고기 1,000마리', stat: 'fishCaught', gte: 1000, gold: 15000 },
    { key: 'miner_1000', name: '광부의 손', desc: '블록 1,000개 채집', stat: 'blocksMined', gte: 1000, gold: 3000 },
    { key: 'miner_20000', name: '대지의 조각가', desc: '블록 20,000개 채집', stat: 'blocksMined', gte: 20000, gold: 20000 },
    { key: 'dungeon_5', name: '카타콤 입문', desc: '던전 5회 완주', stat: 'dungeonClears', gte: 5, gold: 4000 },
    { key: 'dungeon_50', name: '카타콤 정복자', desc: '던전 50회 완주', stat: 'dungeonClears', gte: 50, gold: 25000 },
    { key: 'slayer_10', name: '현상금 사냥꾼', desc: '슬레이어 보스 10회', stat: 'slayerBosses', gte: 10, gold: 5000 },
    { key: 'slayer_100', name: '마덕스의 오른팔', desc: '슬레이어 보스 100회', stat: 'slayerBosses', gte: 100, gold: 40000 },
    { key: 'arena_40', name: '검투 챔피언', desc: '아레나 웨이브 40회 클리어', stat: 'arenaWaves', gte: 40, gold: 15000 },
    { key: 'quest_10', name: '성실한 일꾼', desc: '일일 퀘스트 10회 완료', stat: 'questsDone', gte: 10, gold: 5000 },
    { key: 'quest_50', name: '의뢰 전문가', desc: '일일 퀘스트 50회 완료', stat: 'questsDone', gte: 50, gold: 25000 },
    { key: 'gear_100', name: '수집가', desc: '장비 도감 100종 등록', stat: 'equipLog', gte: 100, gold: 10000 },
    { key: 'gear_400', name: '박물관장', desc: '장비 도감 400종 등록', stat: 'equipLog', gte: 400, gold: 50000, item: 'fuming_potato_book' },
    { key: 'minion_30', name: '자동화 제국', desc: '미니언 슬롯 30칸 달성', stat: 'minionSlots', gte: 30, gold: 20000 },
    { key: 'star_15', name: '별을 삼킨 자', desc: '스타포스 15성 달성', stat: 'starMax', gte: 15, gold: 30000 },
    { key: 'combat_30', name: '무의 극의', desc: '전투 스킬 30레벨', stat: 'combatLv', gte: 30, gold: 100000, item: 'fuming_potato_book' },
  ];
  // 일일 퀘스트 풀(매일 3종 무작위 배정, 카운터 스냅샷 기반)
  // V50: 페처(Fetchur) — 실제 스블처럼 매일 아이템 1종 요구(월 13일 순환, 수수께끼 힌트). 실제 목록을 보유 아이템으로 대응.
  const FETCHUR = [
    { key: 'wool_yellow', n: 20, hint: '노랗고 창문처럼 반짝이는 것' },          // yellow stained glass 대응
    { key: 'iron', n: 8, hint: '방향을 알려주는 바늘의 재료' },                  // compass 대응
    { key: 'diamond', n: 3, hint: '깊은 곳에서 캐낸 푸른 보석' },               // mithril 대응
    { key: 'gunpowder', n: 8, hint: '하늘에서 펑 터지는 것의 속' },              // firework 대응
    { key: 'potion_speed', n: 1, hint: '졸음을 확 깨워주는 물약' },              // cheap coffee 대응
    { key: 'oak_planks', n: 16, hint: '문을 짜기 좋은 판자' },                   // wooden door 대응
    { key: 'leather', n: 3, hint: '토끼처럼 부드러운 가죽' },                    // rabbit foot 대응
    { key: 'obsidian', n: 4, hint: '폭발도 못 부수는 검은 돌' },                 // superboom TNT 대응
    { key: 'pumpkin', n: 1, hint: '가을의 얼굴' },
    { key: 'coal', n: 16, hint: '불을 붙일 때 쓰는 검은 돌' },                   // flint and steel 대응
    { key: 'emerald', n: 5, hint: '주민이 사랑하는 초록 보석' },
    { key: 'wool_red', n: 32, hint: '빨갛고 포근한 것' },
    { key: 'ender_pearl', n: 4, hint: '순간이동의 구슬' },
  ];
  const FETCHUR_REWARD = { gold: 2500, miningXp: 200 };
  // V50: 광부 커미션(실제 드워븐 마인스식) — 매일 4슬롯 순환, 보상 = 산의 심장 가루 + 채광 XP
  const COMMISSIONS = [
    { key: 'cm_coal', name: '석탄 채굴부', type: 'col', target: 'coal', goal: 50 },
    { key: 'cm_iron', name: '철 채굴부', type: 'col', target: 'iron', goal: 30 },
    { key: 'cm_gold', name: '금 채굴부', type: 'col', target: 'gold', goal: 20 },
    { key: 'cm_lapis', name: '청금석 채굴부', type: 'col', target: 'lapis', goal: 40 },
    { key: 'cm_redstone', name: '레드스톤 채굴부', type: 'col', target: 'redstone', goal: 40 },
    { key: 'cm_diamond', name: '다이아몬드 채굴부', type: 'col', target: 'diamond', goal: 5 },
    { key: 'cm_blocks', name: '갱도 확장부', type: 'stat', target: 'blocksMined', goal: 200 },
    { key: 'cm_guard', name: '갱도 경비부', type: 'stat', target: 'kills', goal: 30 },
  ];
  const COMMISSION_REWARD = { powder: 250, miningXp: 300 };
  const DAILY_QUESTS = [
    { key: 'dq_kills', name: '오늘의 사냥', counter: 'kills', goal: 60, gold: 1500 },
    { key: 'dq_mine', name: '광맥 청소', counter: 'blocksMined', goal: 150, gold: 1200 },
    { key: 'dq_chop', name: '벌목 할당량', counter: 'treesChopped', goal: 60, gold: 1000 },
    { key: 'dq_crop', name: '풍작 준비', counter: 'cropsHarvested', goal: 80, gold: 1000 },
    { key: 'dq_fish', name: '오늘의 조황', counter: 'fishCaught', goal: 12, gold: 1500 },
    { key: 'dq_dungeon', name: '카타콤 순찰', counter: 'dungeonClears', goal: 1, gold: 2500 },
    { key: 'dq_slayer', name: '현상금 집행', counter: 'slayerBosses', goal: 1, gold: 3000 },
    { key: 'dq_gold', name: '장사 수완', counter: 'goldEarned', goal: 5000, gold: 2000 },
    { key: 'dq_sell', name: '재고 정리', counter: 'itemsSold', goal: 40, gold: 1200 },
    { key: 'dq_ench', name: '마법부여 실습', counter: 'enchantsApplied', goal: 1, gold: 1500 },
    { key: 'dq_arena', name: '투기장 몸풀기', counter: 'arenaWaves', goal: 5, gold: 2000 },
    { key: 'dq_boss', name: '거물 사냥', counter: 'bossKills', goal: 2, gold: 2500 },
  ];
  // 장비 분해 — 티어 인덱스별 던전 정수 회수(+15% 확률 인챈티드 재료)
  const SALVAGE = { essenceByTier: [1, 2, 4, 7, 12, 20, 32, 50, 80], bonusChance: 0.15, bonusItem: 'enchanted_iron' };
  // 주간 순환 보스 — ISO 주차마다 한 계열이 강화(⭐ HP·보상 2배)
  const WEEKLY = { families: ['zombie_slayer', 'spider_slayer', 'wolf_slayer', 'enderman_slayer', 'blaze_slayer'], hpMul: 2, rewardMul: 2 };
  // 핫 포테이토 북 규칙
  const HPB = { maxBooks: 10, fumingMax: 15, weaponDmgPerBook: 2, weaponStrPerBook: 2, armorDefPerBook: 2, armorHpPerBook: 2 };   /* V107: 무기 핫포북 공격+2·힘+2 · V126: 방어구 핫포북 체력+2(실측, +4 오류 수정) */

  /* V15: 마인크래프트 16색 염료 팔레트 — 양털/콘크리트/테라코타 생성의 단일 출처 */
  const DYES = [
    { k: 'white', name: '하양', hex: '#e9ecec' }, { k: 'orange', name: '주황', hex: '#f07613' },
    { k: 'magenta', name: '자홍', hex: '#bd44b3' }, { k: 'lightblue', name: '하늘', hex: '#3aafd9' },
    { k: 'yellow', name: '노랑', hex: '#f8c527' }, { k: 'lime', name: '연두', hex: '#70b919' },
    { k: 'pink', name: '분홍', hex: '#ed8dac' }, { k: 'gray', name: '회색', hex: '#3e4447' },
    { k: 'lightgray', name: '연회색', hex: '#8e8e86' }, { k: 'cyan', name: '청록', hex: '#158991' },
    { k: 'purple', name: '보라', hex: '#792aac' }, { k: 'blue', name: '파랑', hex: '#35399d' },
    { k: 'brown', name: '갈색', hex: '#724728' }, { k: 'green', name: '초록', hex: '#546d1b' },
    { k: 'red', name: '빨강', hex: '#a12722' }, { k: 'black', name: '검정', hex: '#1d1d21' },
  ];

  /* V14: 건축가 빌더 상점 — 건축 블럭을 코인으로 대량(스택) 구매(설치는 서바이벌 소모) */
  const BUILDER_SHOP = [
    { key: 'cobblestone', name: '조약돌', amount: 16, price: 40 },
    { key: 'stone', name: '돌', amount: 16, price: 64 },
    { key: 'stone_bricks', name: '석재 벽돌', amount: 16, price: 120 },
    { key: 'oak_planks', name: '참나무 판자', amount: 16, price: 80 },
    { key: 'birch_planks', name: '자작나무 판자', amount: 16, price: 80 },
    { key: 'spruce_planks', name: '가문비 판자', amount: 16, price: 80 },
    { key: 'oak_log', name: '참나무 원목', amount: 16, price: 120 },
    { key: 'bricks', name: '벽돌', amount: 16, price: 160 },
    { key: 'sandstone', name: '사암', amount: 16, price: 90 },
    { key: 'quartz_block', name: '석영 블럭', amount: 16, price: 260 },
    { key: 'glass', name: '유리', amount: 16, price: 120 },
    { key: 'glowstone', name: '발광석', amount: 8, price: 200 },
    { key: 'wool_white', name: '흰 양털', amount: 16, price: 100 },
    { key: 'wool_red', name: '빨강 양털', amount: 16, price: 100 },
    { key: 'obsidian', name: '흑요석', amount: 4, price: 320 },
    { key: 'dirt', name: '흙', amount: 32, price: 30 },
    { key: 'sand', name: '모래', amount: 16, price: 40 },
    { key: 'gravel', name: '자갈', amount: 16, price: 40 },
  ];
  // V15: 16색 양털·콘크리트·테라코타를 빌더 상점에 자동 편성(색상 건축)
  DYES.forEach(d => {
    BUILDER_SHOP.push({ key: 'wool_' + d.k, name: d.name + ' 양털', amount: 16, price: 100 });
    BUILDER_SHOP.push({ key: 'concrete_' + d.k, name: d.name + ' 콘크리트', amount: 16, price: 130 });
    BUILDER_SHOP.push({ key: 'terracotta_' + d.k, name: d.name + ' 테라코타', amount: 16, price: 120 });
  });
  // V15: 장식 석재/목재
  [['smooth_stone', '매끄러운 돌', 90], ['chiseled_stone_bricks', '조각된 석재벽돌', 150], ['mossy_cobblestone', '이끼 낀 조약돌', 90],
   ['polished_andesite', '윤나는 안산암', 90], ['prismarine', '프리즈머린', 200], ['bookshelf', '책장', 260], ['hay_block', '건초 더미', 80]]
    .forEach(([k, n, p]) => BUILDER_SHOP.push({ key: k, name: n, amount: 16, price: p }));
  // V17: 모든 나무 판자(신규 3종) + 계단·반블럭(모든 나무 + 돌 계열) — 건축의 핵심 형태
  const SHAPE_NAMES = [
    ['oak_planks', '참나무'], ['birch_planks', '자작나무'], ['spruce_planks', '가문비'],
    ['dark_oak_planks', '짙은참나무'], ['jungle_planks', '정글'], ['acacia_planks', '아카시아'],
    ['stone', '돌'], ['cobblestone', '조약돌'], ['stone_bricks', '석재벽돌'],
    ['quartz_block', '석영'], ['sandstone', '사암'], ['bricks', '벽돌'],
    ['purpur', '퍼퍼'], ['smooth_stone', '매끄러운 돌'], ['prismarine', '프리즈머린'],
  ];
  [['dark_oak_planks', '짙은참나무 판자'], ['jungle_planks', '정글 판자'], ['acacia_planks', '아카시아 판자']]
    .forEach(([k, n]) => BUILDER_SHOP.push({ key: k, name: n, amount: 16, price: 80 }));
  SHAPE_NAMES.forEach(([k, n]) => {
    BUILDER_SHOP.push({ key: k + '_slab', name: n + ' 반블럭', amount: 16, price: 70 });
    BUILDER_SHOP.push({ key: k + '_stairs', name: n + ' 계단', amount: 16, price: 90 });
  });
  // V17-B: 울타리 + 트랩도어(모든 나무)
  const WOOD_KO = [['oak', '참나무'], ['birch', '자작나무'], ['spruce', '가문비'], ['dark_oak', '짙은참나무'], ['jungle', '정글'], ['acacia', '아카시아']];
  WOOD_KO.forEach(([w, n]) => {
    BUILDER_SHOP.push({ key: w + '_fence', name: n + ' 울타리', amount: 16, price: 80 });
    BUILDER_SHOP.push({ key: w + '_trapdoor', name: n + ' 트랩도어', amount: 8, price: 70 });
    BUILDER_SHOP.push({ key: w + '_door', name: n + ' 문', amount: 4, price: 90 });
  });

  /* ---------------- V13-B: 위치 기반 퀘스트 시스템 ----------------
     퀘스트를 주는 NPC는 특정 월드의 특정 좌표에 서 있다. 플레이어가 그 반경(region) 안에
     들어오면 우측 중앙에 퀘스트가 나타나고, 떠나면 사라진다. NPC에게 E(대화)로 수락.
     objective.type: gather(누적 채집) / kill / killBoss / mine / chop / farm / fish / craft / place / gold / talk(대화만)
     metric은 economy.js questMetric()가 카운터/컬렉션 스냅샷으로 계산(일일퀘스트와 동일 방식). */
  // V40: 실제 하이픽셀 스카이블럭 퀘스트 NPC(위키 Quests) — 프라이빗 섬 제리 + 허브 마을/각 섬 담당자
  const QUEST_NPCS = [
    { key: 'jerry', name: '제리', world: 'home', x: 99, z: 106, color: 0x4fae5a, region: 12, blurb: '스카이블럭 안내인 — 시작하기 오브젝티브' },
    // 허브 마을
    { key: 'auction_master', name: '경매인', world: 'hub', x: 214, z: 232, color: 0xcaa24a, region: 20, blurb: '경매장을 소개해 준다' },
    { key: 'banker', name: '은행원', world: 'hub', x: 220, z: 238, color: 0x3f6f3f, region: 20, blurb: '저축하기 — 이자를 받는 법' },
    { key: 'carpenter', name: '목수', world: 'hub', x: 224, z: 232, color: 0x8a6a3a, region: 20, blurb: '목공 — 양털을 모아오면 목공 테이블을' },
    { key: 'librarian', name: '사서', world: 'hub', x: 218, z: 242, color: 0x9365b8, region: 20, blurb: '도서관 카드 — 첫 인챈트' },
    { key: 'blacksmith', name: '대장장이', world: 'hub', x: 226, z: 238, color: 0x5a5a62, region: 20, blurb: '채굴할 시간/리포저 — 리포지 입문' },
    { key: 'bartender', name: '바텐더', world: 'hub', x: 158, z: 314, color: 0x7a4a2a, region: 22, blurb: '공격의 시간 — 묘지의 좀비 소탕' },
    { key: 'enid', name: '낚시꾼 에니드', world: 'hub', x: 320, z: 322, color: 0x3f9fd0, region: 22, blurb: '낚시 튜토리얼' },
    { key: 'lumber_jack', name: '나무꾼', world: 'hub', x: 150, z: 134, color: 0x5d8a3a, region: 24, blurb: '벌목 튜토리얼' },
    { key: 'rigby', name: '농부 릭비', world: 'hub', x: 322, z: 214, color: 0xd8b23a, region: 24, blurb: '첫 수확' },
    { key: 'tia', name: '티아', world: 'hub', x: 196, z: 150, color: 0xff7ad9, region: 22, blurb: '장신구(부적)를 감정해 드려요' },
    { key: 'village_guide', name: '안내인', world: 'hub', x: 230, z: 244, color: 0xb8a24a, region: 20, blurb: '탐험가 — 스카이블럭 곳곳을 여행' },
    // 각 섬
    { key: 'farmhand', name: '일꾼', world: 'barn', x: 72, z: 100, color: 0xd8b23a, region: 18, blurb: '헛간으로 돌아가서' },
    { key: 'lazy_miner', name: '게으른 광부', world: 'gold', x: 56, z: 80, color: 0x8a8a8a, region: 18, blurb: '분실물 — 곡괭이를 잃어버렸다' },
    { key: 'rhys', name: '리스', world: 'deep', x: 48, z: 66, color: 0x6a6a72, region: 18, blurb: '더 깊은 곳으로' },
    { key: 'lapis_miner', name: '청금석 광부', world: 'deep', x: 44, z: 56, color: 0x1f4fc0, region: 18, blurb: '도움이 되는 광부' },
    { key: 'rick', name: '릭', world: 'spider', x: 64, z: 80, color: 0x8a5a2a, region: 18, blurb: '플린트 형제 — 부싯돌 사업' },
    { key: 'elle', name: '네더의 엘', world: 'nether', x: 64, z: 78, color: 0xc84a1f, region: 18, blurb: '전사의 퀘스트' },
    { key: 'pearl_dealer', name: '진주 상인', world: 'end', x: 64, z: 82, color: 0x7a3fae, region: 18, blurb: '엔드의 시작' },
    { key: 'charlie', name: '찰리', world: 'park', x: 72, z: 108, color: 0x4a7a3a, region: 18, blurb: '숲으로 — 짙은 참나무를 찾아서' },
    { key: 'hiker', name: '다정한 등산객', world: 'mushroom', x: 72, z: 100, color: 0xc89a5a, region: 18, blurb: '중급 농부' },
  ];
  // region은 QUEST_NPCS의 좌표 반경을 그대로 쓴다(economy.js에서 매핑).
  const QUESTS = [
    // ===== 시작하기(Getting Started) — 프라이빗 섬 제리(실제 오브젝티브 체인, 보상 없음) =====
    { key: 'gs_log', giver: 'jerry', name: '나무 부수기', req: null,
      story: '스카이블럭에 온 걸 환영해! 첫 오브젝티브야 — 섬의 참나무에서 원목 1개를 채집해 봐.',
      objective: { type: 'gather', target: 'oaklog', count: 1, label: '참나무 원목 1개' },
      reward: {} },
    { key: 'gs_bench', giver: 'jerry', name: '작업대 제작', req: 'gs_log',
      story: '좋아! 이제 ✦ 제작 메뉴에서 판자를 만들고, 판자 4개로 작업대를 제작해 봐.',
      objective: { type: 'gather', target: 'crafting_table', count: 1, label: '작업대 제작' },
      reward: {} },
    { key: 'gs_pick', giver: 'jerry', name: '나무 곡괭이 제작', req: 'gs_bench',
      story: '마지막 단계! 판자와 막대로 나무 곡괭이를 만들면 시작하기 완료야. 포탈을 타고 허브로 떠나 봐.',
      objective: { type: 'gather', target: 'wooden_pickaxe', count: 1, label: '나무 곡괭이 제작' },
      reward: {} },
    // ===== 허브 마을 =====
    { key: 'auctioneer', giver: 'auction_master', name: '경매인', req: null,
      story: '처음 보는 얼굴이군요! 경매장에서는 희귀한 아이템을 사고팔 수 있답니다. 언제든 들러요.',
      objective: { type: 'talk', target: null, count: 1, label: '경매인과 대화' },
      reward: {} },
    { key: 'fishing_tutorial', giver: 'enid', name: '낚시 튜토리얼', req: null,
      story: '낚시는 스카이블럭 최고의 휴식이죠. 물가에서 물고기를 한 마리만 낚아 보세요.',
      objective: { type: 'fish', target: null, count: 1, label: '물고기 낚기' },
      reward: { gold: 1000, xp: { skill: 'fishing', amt: 10 }, sbXp: 5, items: [] } },
    { key: 'foraging_tutorial', giver: 'lumber_jack', name: '벌목 튜토리얼', req: null,
      story: '나무는 모든 것의 재료지! 원목 20개를 모아 오면 내 도끼를 하나 주지.',
      objective: { type: 'gather', target: 'oaklog', count: 20, label: '원목 20개 수집' },
      reward: { gold: 1000, xp: { skill: 'foraging', amt: 100 }, sbXp: 5, items: [{ key: 'promising_axe', n: 1 }] } },
    { key: 'first_harvest', giver: 'rigby', name: '첫 수확', req: null,
      story: '농장 밀밭이 잘 익었어요. 밀 10개만 수확해다 주겠어요?',
      objective: { type: 'gather', target: 'wheat', count: 10, label: '밀 10개 수확' },
      reward: { xp: { skill: 'farming', amt: 20 }, items: [] } },
    { key: 'saving_up', giver: 'banker', name: '저축하기', req: null,
      story: '코인은 은행에 넣어두면 이자가 붙는답니다. 아무 금액이나 한 번 예치해 보세요.',
      objective: { type: 'bank', target: null, count: 1, label: '은행에 코인 예치' },
      reward: { gold: 10, sbXp: 5, items: [] } },
    { key: 'carpentry', giver: 'carpenter', name: '목공', req: null,
      story: '가구를 만들려면 양털이 필요해요. 양털 64개를 모아 오면 목공 테이블 만드는 법을 알려드리죠.',
      objective: { type: 'gather', target: 'wool_white', count: 64, label: '양털 64개 수집' },
      reward: { sbXp: 5, items: [] } },
    { key: 'time_to_mine', giver: 'blacksmith', name: '채굴할 시간', req: null,
      story: '대장간 화로가 식어가는군. 석탄 광석 10개를 캐다 주게. 그러면 리포지(재련)를 가르쳐 주지.',
      objective: { type: 'gather', target: 'coal', count: 10, label: '석탄 10개 채굴' },
      reward: { xp: { skill: 'mining', amt: 40 }, items: [] } },
    { key: 'reforger', giver: 'blacksmith', name: '리포저', req: 'time_to_mine',
      story: '이제 재련을 해볼 차례야. 무기든 방어구든 도구든, 아무거나 하나 리포지해 보게.',
      objective: { type: 'reforge', target: null, count: 1, label: '아이템 1개 리포지' },
      reward: { xp: { skill: 'mining', amt: 10 }, items: [] } },
    { key: 'library_card', giver: 'librarian', name: '도서관 카드', req: null,
      story: '지식은 힘이에요. 인챈트를 하나만 부여해 보세요 — 도서관 카드를 만들어 드릴게요.',
      objective: { type: 'enchant', target: null, count: 1, label: '인챈트 1회 부여' },
      reward: { xp: { skill: 'enchanting', amt: 10 }, items: [] } },
    { key: 'time_to_strike', giver: 'bartender', name: '공격의 시간', req: null,
      story: '묘지의 좀비들이 술집 앞까지 어슬렁거려서 장사가 안 돼요. 10마리만 처치해 주세요.',
      objective: { type: 'kill', target: null, count: 10, label: '묘지 좀비 10마리 처치' },
      reward: { gold: 100, xp: { skill: 'combat', amt: 15 }, items: [] } },
    { key: 'explorer', giver: 'village_guide', name: '탐험가', req: null,
      story: '스카이블럭은 넓어요! 허브의 구역들과 다른 섬까지, 서로 다른 장소 14곳을 방문해 보세요.',
      objective: { type: 'zones', target: null, count: 14, label: '장소 14곳 방문' },
      reward: { gold: 50, items: [] } },
    // V115: fairy_souls_quest 제거(페어리 소울 기능 삭제)
    // ===== 각 섬 =====
    { key: 'barnyard', giver: 'farmhand', name: '헛간으로 돌아가서', req: null,
      story: '일손이 부족해요! 밀 미니언을 하나 조합해서 농장을 자동화해 보세요.',
      objective: { type: 'minion', target: null, count: 1, label: '미니언 1개 조합' },
      reward: { xp: { skill: 'farming', amt: 20 }, items: [] } },
    { key: 'intermediate_farmer', giver: 'hiker', name: '중급 농부', req: null,
      story: '버섯 사막까지 오다니 제법인데요! 이 지역의 작물을 모아 보세요 — 사탕수수 32개면 충분해요.',
      objective: { type: 'gather', target: 'sugarcane', count: 32, label: '사탕수수 32개 수집' },
      reward: { xp: { skill: 'farming', amt: 45 }, items: [] } },
    { key: 'lost_and_found', giver: 'lazy_miner', name: '분실물', req: null,
      story: '내 곡괭이를 갱도 어딘가에 두고 왔지 뭐야… 대신 금 광석을 캐다 주면 여분의 철 곡괭이를 줄게.',
      objective: { type: 'gather', target: 'gold', count: 1, label: '금 광석 채굴' },
      reward: { xp: { skill: 'mining', amt: 10 }, items: [{ key: 'iron_pickaxe', n: 1 }] } },
    { key: 'going_deeper', giver: 'rhys', name: '더 깊은 곳으로', req: null,
      story: '딥 캐번의 각 층에는 서로 다른 광물이 잠들어 있지. 레드스톤 10개를 캐 오게.',
      objective: { type: 'gather', target: 'redstone', count: 10, label: '레드스톤 10개 채굴' },
      reward: { xp: { skill: 'mining', amt: 115 }, items: [] } },
    { key: 'helpful_miner', giver: 'lapis_miner', name: '도움이 되는 광부', req: 'going_deeper',
      story: '청금석 채석장에서 일하는데 물량이 밀렸어… 청금석 64개만 보태 주게. 컴팩터로 보답하지.',
      objective: { type: 'gather', target: 'lapis', count: 64, label: '청금석 64개 수집' },
      reward: { items: [{ key: 'compactor', n: 1 }] } },
    { key: 'flint_bros', giver: 'rick', name: '플린트 형제', req: null,
      story: '동생 팻이랑 부싯돌 사업을 하는데 도구 만들 철이 없어. 철 주괴 2개만 갖다 주면 삽을 하나 줄게.',
      objective: { type: 'gather', target: 'iron', count: 2, label: '철 주괴 2개 전달' },
      reward: { items: [{ key: 'promising_shovel', n: 1 }] } },
    { key: 'warriors_quest', giver: 'elle', name: '전사의 퀘스트', req: null,
      story: '요새의 블레이즈들이 심상치 않아. 블레이즈 막대 5개를 모아 와 — 진짜 전사인지 보겠어.',
      objective: { type: 'gather', target: 'blaze_rod', count: 5, label: '블레이즈 막대 5개' },
      reward: { xp: { skill: 'combat', amt: 30 }, items: [] } },
    { key: 'beginning_end', giver: 'pearl_dealer', name: '엔드의 시작', req: null,
      story: '드래곤의 둥지로 가려면 엔드석 지대를 지나야 해. 엔드석 32개를 캐 오면 길을 알려주지.',
      objective: { type: 'gather', target: 'end_stone', count: 32, label: '엔드석 32개 채굴' },
      reward: { xp: { skill: 'combat', amt: 10 }, items: [] } },
    { key: 'into_the_woods', giver: 'charlie', name: '숲으로', req: 'foraging_tutorial',
      story: '더 파크 깊은 곳의 짙은 참나무는 최고급 목재야. 64개를 모아 오면 소형 창고 만드는 법을 알려줄게.',
      objective: { type: 'gather', target: 'dark_oak_log', count: 64, label: '짙은 참나무 원목 64개' },
      reward: { sbXp: 5, items: [] } },
  ];

  // V21-C: 섬 포탈 아이템(제작→프라이빗 섬 설치→워프 해금) — 이름/목적지 매핑
  // V21-D8: 화로 제련 레시피(바닐라식) — 화로 근처에서만, 석탄 1개 = 8회 제련
  const SMELT_RECIPES = [
    { in: 'cobblestone', inN: 1, out: 'stone', n: 1, name: '조약돌 → 돌' },
    { in: 'sand', inN: 1, out: 'glass', n: 1, name: '모래 → 유리' },
    { in: 'clay', inN: 4, out: 'bricks', n: 1, name: '점토 4 → 벽돌 블록' },
    { in: 'stone_bricks', inN: 1, out: 'cracked_stone_bricks', n: 1, name: '석재 벽돌 → 금 간 석재 벽돌' },   // V22-G2(바닐라)
    { in: 'sandstone', inN: 1, out: 'smooth_sandstone', n: 1, name: '사암 → 매끄러운 사암' },
    { in: 'raw_copper', inN: 1, out: 'copper', n: 1, name: '원시 구리 → 구리 주괴' },   // V23-C
    { in: 'cobbled_deepslate', inN: 1, out: 'deepslate', n: 1, name: '조각난 딥슬레이트 → 딥슬레이트' },
    { in: 'deepslate_bricks', inN: 1, out: 'cracked_deepslate_bricks', n: 1, name: '딥슬레이트 벽돌 → 금 간 벽돌' },
    { in: 'oaklog', inN: 1, out: 'charcoal', n: 1, name: '원목 → 숯' },   // V94: 숯 출처 부재(횃불/모닥불/화염구 35레시피) 해소 — 바닐라 원목 제련
  ];
  const PORTAL_ITEMS = {
    portal_barn: { name: '🌾 더 반 포탈', dest: 'barn' },
    portal_park: { name: '🌲 더 파크 포탈', dest: 'park' },
    portal_gold: { name: '⛏️ 골드 광산 포탈', dest: 'gold' },
    portal_deep: { name: '💎 딥 캐번 포탈', dest: 'deep' },
    portal_spider: { name: '🕷️ 스파이더 덴 포탈', dest: 'spider' },
    portal_mushroom: { name: '🍄 버섯 사막 포탈', dest: 'mushroom' },
    portal_nether: { name: '🔥 블레이징 포트리스 포탈', dest: 'nether' },
    portal_end: { name: '🌌 디 엔드 포탈', dest: 'end' },
  };
  // V21-C: 제작 재료 그룹(MC 나무 호환) — needs 키가 그룹이면 구성원 아무거나 합산 소모
  const CRAFT_GROUPS = {
    any_planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'dark_oak_planks', 'jungle_planks', 'acacia_planks'],
    any_log: ['oaklog', 'birchlog', 'sprucelog'],
    any_wool: DYES.map(d => 'wool_' + d.k),   // V21-E2: 침대 등 — 아무 색 양털
  };
  // V101: 이름에 남은 MC 포맷 코드 제거 — API 원본을 그대로 복사하다 §색상코드/%%color%% 토큰이
  //   6종 아이템 이름에 남아 렌더러가 파싱 못 하면 raw로 노출되던 문제(예: '§4Sin§5seeker Scythe').
  const stripFmt = s => (typeof s === 'string') ? s.replace(/§[0-9a-fk-orA-FK-OR]/g, '').replace(/%%[a-z_]+%%/gi, '').replace(/\s{2,}/g, ' ').trim() : s;
  [EQUIPMENT.weapons, EQUIPMENT.armor, EQUIPMENT.accessories, SHOP].forEach(list => (list || []).forEach(it => { if (it && it.name) it.name = stripFmt(it.name); }));
  // V101: 카탈로그 중복행 제거(키 기준 첫 항목 유지) — SHOP 재료 중복 8종·pet_egg_enderman, BUILDER_SHOP wool_white/red 중복
  const dedupByKey = arr => { if (!arr) return; const seen = new Set(); for (let i = 0; i < arr.length; i++) { const k = arr[i] && arr[i].key; if (k == null) continue; if (seen.has(k)) { arr.splice(i, 1); i--; } else seen.add(k); } };
  dedupByKey(SHOP); if (typeof BUILDER_SHOP !== 'undefined') dedupByKey(BUILDER_SHOP);
  window.ECON_DATA = {
    PORTAL_ITEMS, CRAFT_GROUPS, SMELT_RECIPES,
    ITEM_TIERS, COLLECTIONS, COL_TIER_REWARDS, COL_TIER_FX, ENCH_COL_DISCOUNT, EXTRA_RES, SKILLS, BREWS, ATTRIBUTES, ATTR_LADDER, ATTR_HUNT_REQ, GATHER_TABLE, TOOLS, MINIONS, MINION_STORAGE_BASE, MINION_STORAGE_UPGRADED,
    MINION_STORAGE_UPGRADE_COST, MINION_OFFLINE_CAP_HOURS, MINION_SLOT_MAX, MINION_SLOT_COST_BASE, MINION_SLOT_COST_MUL,
    MINION_FUEL, MINION_FUEL2, SLAYERS, DUNGEON, DUNGEON_ROOM_SCORE, ESSENCE_SHOP, SHOP, BAZAAR, AUCTION_HOUSE, HEART_OF_MOUNTAIN, DAILY_SELL_LIMIT_PER_STACK,
    EQUIPMENT, STARFORCE, REFORGES, ITEM_ROLL,
    TRAITS, EQUIP_SETS, FIELD_DIFF, ARENA, ACHIEVEMENTS, DAILY_QUESTS, FETCHUR, FETCHUR_REWARD, COMMISSIONS, COMMISSION_REWARD, SALVAGE, WEEKLY, HPB, QUESTS, QUEST_NPCS, BUILDER_SHOP, DYES,
    TALISMANS, MAGICAL_POWER, PETS, PET_ITEMS, PET_ABILITIES, PET_XP_BASE, PET_XP_EXP, PET_MAX_LEVEL,
    ENCHANTS, CHAOS_ENCHANT, RECIPES, MASTER_MODE,
    BANK, DAILY_DEALS, DUNGEON_CLASSES, ZONES, EASTER_EGGS,
    SKILL_XP_TABLE, SKILL_MAX_LEVEL, SKILL_MAX_BY, BASE_STATS, BASE_STATS2, GEM_TYPES, GEM_QUALITY, GEM_BASE, GEM_STAT_VALUES, GEM_SLOTS_BY_TIER, RECOMB, ENCHANTED_RES, ENCHANTED_BLOCK_RES, SLAYER_XP_LEVELS, SLAYER_QUEST, VANILLA_NAMES,
  };
})();
