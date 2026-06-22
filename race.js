/* =========================================================================
   race.js — 운빨 대시 : 좀비고 "서바이벌 서커스"(베타+시즌1) 100% 재현 (2~8인)
   window.MiniGames.race 로 등록. 자급자족 단일 파일.

   ── 핵심 불변식: 캐릭터는 항상 정수 칸(gx,gy) 위에 있거나 두 칸 사이를 '렌더만' 보간 중.
      보간이 끝나면 반드시 정수 칸에 스냅 → 칸 걸침 원천 불가(1칸 단위 이동).
   ── 조작: 십자키 1 + 스킬버튼 1. 스킬=처음 점프 / 점프 중 다시=대시.
      · 방향키 없이 점프 = 제자리(칸 이동 0)  · 방향+점프 = 2칸  · 점프 후 대시 = 총 5칸
   ── 장애물(베타·시즌1): 점프대 / 손바닥 / 트램펄린 / 별범퍼 / 얼음·비눗방울(대시불가) /
      광대발판(점프회피) / 분홍구름(점프불가 사망) / 속임수발판(운) / 회전점프대 / 풍선(대시팝) /
      컨베이어 / 속도발판 / 마법진=사라지는발판(3×3 점멸) / 쇠공(5×5 즉사) / 늪(점프봉인) /
      전기장(점멸 사망) / 배출구(개폐 구멍).
   ── 코스: 20개 구간 풀에서 난이도 1~5 각 1개씩 5구간 연결(마지막=결승형). 구간당 100~170칸.
      구간 경계마다 체크포인트(추락=직전 체크포인트 부활·탈락 없음). 결승 🍯 먼저 도착 = 승.
      모든 코스는 빌드시 BFS로 완주 보장. 시작 전 3-2-1-GO 카운트다운(전 클라 동기).
   mini-core 계약: init/step/draw/hud/netPayload/onPeer/actionLabel/hostTick/finishPatch.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  /* ----------------------------- 상수 ----------------------------------- */
  const TILE = 32, COLS = 11, C = (COLS - 1) >> 1, PR = 10;
  const START_ROWS = 3, FINISH_ROWS = 4;

  // 칸당 모션 시간(ms) — 스냅하고 빠르게(점프가 걷기보다 느리지 않게)
  const T_WALK = 140, T_JUMP = 240, T_DASH = 200, T_SLIDE = 95, T_BUMP = 140, T_LAUNCH = 55; // launch=칸당
  const LAND_STUN = 35, RESPAWN_STUN = 350, INPUT_BUF = 140, DASH_GAP = 45;
  const JUMP_TILES = 2, DASH_TOTAL = 4;          // 점프 2칸, 대시는 +2칸(합 4)
  const JUMP_H = TILE * 0.85;
  const SPEED_MUL = 1.5, SPEED_MS = 2000;
  const START_MS = 3600, CUTOFF_MS = 25000, HARD_LIMIT_MS = 360000, PROG_MAX = 1000;

  // 장애물 주기(ms)
  const MAGIC_CYC = 2400, VENT_CYC = 2400, ELEC_CYC = 1600, ROT_STEP = 300, CONV_CYC = 400, TRAMP_CYC = 520;

  // 타일 종류
  const VOID=0, SOLID=1, START=2, CP=3, GOAL=4, FAKE=5, SPEED=6, MAGIC=7, ICE=8, TRAMP=9, BUMP=10,
        KILL=11, CLOUD=12, ELEC=13, VENT=14, SWAMP=15, BALLOON=16, ROT=17,
        ARR_U=18, ARR_D=19, ARR_L=20, ARR_R=21, CNV_U=22, CNV_D=23, CNV_L=24, CNV_R=25,
        HAND_U=26, HAND_D=27, HAND_L=28, HAND_R=29;
  const isArrow=(v)=>v>=ARR_U&&v<=ARR_R, isConvey=(v)=>v>=CNV_U&&v<=CNV_R, isHand=(v)=>v>=HAND_U&&v<=HAND_R;
  const DIRV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  const OPP={up:'down',down:'up',left:'right',right:'left'};
  const DIR8=['up','right','down','left'];   // 회전점프대(반시계는 역순 인덱싱)
  const ARR_DIR={[ARR_U]:'up',[ARR_D]:'down',[ARR_L]:'left',[ARR_R]:'right',[CNV_U]:'up',[CNV_D]:'down',[CNV_L]:'left',[CNV_R]:'right',[HAND_U]:'up',[HAND_D]:'down',[HAND_L]:'left',[HAND_R]:'right'};
  // 디딜 수 있는 단단한 바닥류
  const SOLIDISH = new Set([SOLID,START,CP,GOAL,SPEED,ICE,TRAMP,BUMP,ROT,SWAMP,ARR_U,ARR_D,ARR_L,ARR_R,CNV_U,CNV_D,CNV_L,CNV_R,HAND_U,HAND_D,HAND_L,HAND_R]);
  // BFS '결국 통과 가능' 칸(점멸/타이밍 포함). 제외=VOID/FAKE/KILL/CLOUD(벽성).
  const BFS_SAFE = new Set([SOLID,START,CP,GOAL,SPEED,ICE,TRAMP,BUMP,ROT,SWAMP,MAGIC,ELEC,VENT,
                            ARR_U,ARR_D,ARR_L,ARR_R,CNV_U,CNV_D,CNV_L,CNV_R,HAND_U,HAND_D,HAND_L,HAND_R]);
  // 풍선=벽(BFS는 우회 경로만 인정). 대시로만 터뜨려 통과(아래 upgradeDash).

  /* ----------------------------- 좌표/주기 ------------------------------ */
  const cx=(gx)=>(gx+0.5)*TILE, cy=(gy)=>(gy+0.5)*TILE;
  const colAt=(px)=>Math.floor(px/TILE), rowAt=(py)=>Math.floor(py/TILE);
  const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
  const gV=(g,r,c)=>(r>=0&&r<g.length&&c>=0&&c<COLS)?g[r][c]:VOID;
  function ph(r,c){ return ((r*7+c*13)%6); }            // 타일별 위상(0..5)
  const magicSolid=(t,p)=>((t+p*400)%MAGIC_CYC)<MAGIC_CYC/2;
  const ventSolid =(t,p)=>((t+p*400)%VENT_CYC)<VENT_CYC/2;   // 닫힘=단단 / 열림=구멍
  const elecOn    =(t,p)=>((t+p*400)%ELEC_CYC)<ELEC_CYC/2;
  const rotDir    =(t,p)=>DIR8[(3 - (Math.floor((t+p*300)/ROT_STEP)%4) + 4)%4];  // 반시계
  function mulb(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

  /* =====================================================================
     밴드 빌더 — 각 밴드는 입구(bot)·출구(top) 행이 단단한 통로, 중간에 장애물.
     세션 구간은 이 밴드들을 위로 이어붙여 길게 만든다(밴드별 통과 경로 보장).
     x = { line,bandCols,cell,fakeBand,ri,rng }
     ===================================================================== */
  function fakeBand(g,r,rng){ if(r<0||r>=g.length) return; const inner=[]; for(let c=1;c<COLS-1;c++) inner.push(c);
    const sh=inner.slice(); for(let i=sh.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=sh[i];sh[i]=sh[j];sh[j]=t;}
    const safe=new Set([sh[0],sh[1]]); for(const c of inner){ if(safe.has(c)) g[r][c]=SOLID; else g[r][c]=FAKE; } }   // 진짜 2칸만, 나머지 가짜처럼 보이는 발판

  const BANDS = {
    gaps:{h:6, fn(g,top,bot,x){ x.line(top,SOLID); x.line(bot,SOLID); for(let r=bot-1;r>top;r--) x.bandCols(r,C-1,C+1,VOID);
      for(let r=bot-2;r>top;r-=2){ g[r][C-1]=SOLID; g[r][C]=SOLID; g[r][C+1]=SOLID; } }},
    fakefield:{h:7, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) x.line(r,SOLID); x.fakeBand(top+2); x.fakeBand(bot-2); }},
    magic:{h:8, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      const mr=Math.floor((top+bot)/2); for(let r=mr-1;r<=mr+1;r++) for(let c=C-1;c<=C+1;c++) if(r>top&&r<bot) g[r][c]=MAGIC;
      g[bot-1][C]=SOLID; g[top+1][C]=SOLID; }},
    ice:{h:8, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++){ for(let c=C-2;c<=C+2;c++) g[r][c]=ICE; }
      x.bandCols(top+1,1,C-3,VOID); x.bandCols(top+1,C+3,COLS-2,VOID); g[top][C]=SOLID; }},
    tramp:{h:7, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,C-1,C+1,VOID);
      g[bot-1][C]=TRAMP; g[Math.floor((top+bot)/2)][C]=TRAMP; for(let c=C-1;c<=C+1;c++) g[top+1][c]=SOLID; }},
    bumpers:{h:7, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) x.line(r,SOLID); for(let i=0;i<4;i++){ const r=top+2+x.ri(bot-top-2), c=2+x.ri(COLS-4); g[r][c]=BUMP; } }},
    clown:{h:8, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) x.line(r,SOLID); for(let i=0;i<7;i++){ const r=top+2+x.ri(bot-top-3), c=1+x.ri(COLS-2); g[r][c]=KILL; } }},
    cloud:{h:8, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) x.line(r,SOLID); let gap=C-1;
      for(let r=bot-2;r>top+1;r--){ gap=clamp(gap+(x.ri(3)-1),1,COLS-4); for(let c=1;c<COLS-1;c++) if(c<gap||c>gap+2) g[r][c]=CLOUD; } }},   // 분홍구름 벽 사이 통로(±1 드리프트로 항상 연결)
    arrow:{h:8, fn(g,top,bot,x){ x.line(bot,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      g[bot-1][C]=ARR_U; for(let c=C-1;c<=C+1;c++){ g[bot-5][c]=SOLID; g[top+1][c]=SOLID; g[top][c]=SOLID; } }},   // 점프대 4칸 발사 → bot-5 착지 → 점프로 출구
    hand:{h:7, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      g[bot-1][C]=HAND_U; for(let c=C-1;c<=C+1;c++){ g[bot-5][c]=SOLID; g[top+1][c]=SOLID; } }},
    conveyor:{h:8, fn(g,top,bot,x){ for(let r=bot;r>=top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=CNV_U; } x.line(bot,SOLID); x.line(top,SOLID);
      const mr=Math.floor((top+bot)/2); x.bandCols(mr,C-2,C+2,VOID); g[mr][C]=SOLID; }},
    balloon:{h:6, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) x.line(r,SOLID); const mr=Math.floor((top+bot)/2);
      for(let c=C-1;c<=C+1;c++) g[mr][c]=BALLOON; }},
    speed:{h:7, fn(g,top,bot,x){ for(let r=bot;r>=top;r--) g[r][C]=SOLID,g[r][C-1]=SOLID,g[r][C+1]=SOLID; for(let r=bot-1;r>top+1;r--) g[r][C]=SPEED;
      x.bandCols(top+1,C-1,C+1,VOID); g[top][C]=SOLID; }},
    elec:{h:8, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      const mr=Math.floor((top+bot)/2); for(let c=2;c<=COLS-3;c++) g[mr][c]=ELEC; for(let c=C-1;c<=C+1;c++){g[bot-1][c]=SOLID;g[top+1][c]=SOLID;} g[mr][C]=ELEC; }},
    vent:{h:7, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,C-1,C+1,VOID);
      for(let r=bot-1;r>top;r--) g[r][C]=VENT; g[bot-1][C]=SOLID; }},
    swamp:{h:7, fn(g,top,bot,x){ for(let r=bot;r>=top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=SWAMP; } x.line(bot,SOLID); x.line(top,SOLID);
      for(let r=bot-1;r>top+1;r-=2) g[r][C]=SPEED; }},
    narrow:{h:9, fn(g,top,bot,x){ x.line(bot,SOLID); x.line(top,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      let s=0; for(let r=bot-1;r>top;r--){ const c=s?C-1:C+1; g[r][c]=SOLID; s^=1; } }},
    rotor:{h:8, fn(g,top,bot,x){ x.line(bot,SOLID); for(let r=top+1;r<bot;r++) x.bandCols(r,1,COLS-2,VOID);
      g[bot-1][C]=ROT; for(let c=C-1;c<=C+1;c++){ g[bot-5][c]=SOLID; g[top+1][c]=SOLID; g[top][c]=SOLID; } }},
    ball:{h:9, fn(g,top,bot,x,course){ for(let r=bot;r>=top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=SOLID; } x.line(top,SOLID);
      const mr=Math.floor((top+bot)/2); course.entities.push({kind:'ball',row:mr,c0:C-2,c1:C+2,period:1800,ph:course.entities.length*500}); }},
  };

  // 20개 구간 테마(난이도 tier 1~5, 결승형 fin). band=가중 밴드 풀, len=목표 칸 길이
  const THEMES = [
    // tier 1 (입문)
    {name:'트램펄린 워밍업',tier:1,len:100,bands:['tramp','arrow','gaps']},
    {name:'점프대 부스터 길',tier:1,len:100,bands:['arrow','hand','gaps']},
    {name:'컨베이어 산책로',tier:1,len:105,bands:['conveyor','speed','gaps']},
    {name:'별범퍼 튜토리얼',tier:1,len:105,bands:['bumpers','gaps','speed']},
    // tier 2
    {name:'빙판 미끄럼틀',tier:2,len:120,bands:['ice','gaps','tramp']},
    {name:'손바닥 미로',tier:2,len:120,bands:['hand','gaps','arrow']},
    {name:'풍선 벽 돌파',tier:2,len:115,bands:['balloon','gaps','speed']},
    {name:'첫 마법진',tier:2,len:125,bands:['magic','gaps'],fin:true},
    // tier 3
    {name:'속임수 도박장',tier:3,len:135,bands:['fakefield','gaps','clown']},
    {name:'회전 점프대 정원',tier:3,len:135,bands:['rotor','gaps','tramp']},
    {name:'분홍구름 절벽',tier:3,len:135,bands:['cloud','clown','gaps']},
    {name:'전기장 다리',tier:3,len:140,bands:['elec','gaps','magic'],fin:true},
    // tier 4
    {name:'극한 대시 라인',tier:4,len:150,bands:['gaps','narrow','arrow']},
    {name:'빙판+낭떠러지',tier:4,len:150,bands:['ice','gaps','narrow']},
    {name:'컨베이어 역주행',tier:4,len:145,bands:['conveyor','gaps','bumpers']},
    {name:'쇠공 회랑',tier:4,len:150,bands:['ball','gaps','narrow']},
    // tier 5 (결승형)
    {name:'마법진 리듬 러시',tier:5,len:160,bands:['magic','gaps'],fin:true},
    {name:'전기장 결승',tier:5,len:160,bands:['elec','magic','gaps'],fin:true},
    {name:'별범퍼 지옥',tier:5,len:155,bands:['bumpers','narrow','gaps'],fin:true},
    {name:'늪지대 결승',tier:5,len:155,bands:['swamp','magic','gaps'],fin:true},
  ];

  /* ----------------------------- 코스 조립 ------------------------------ */
  function buildSection(theme, rng, ri){
    // 밴드를 목표 길이까지 이어붙여 한 구간 그리드(행 배열) 생성. 행0=출구(위), 끝=입구(아래)
    const rows = [];
    const tmp = { grid:[], entities:[] };
    // 임시로 충분히 큰 그리드에 아래→위로 채운 뒤 잘라낸다
    const MAXH = theme.len + 40;
    const g = []; for(let r=0;r<MAXH;r++){ const row=new Array(COLS).fill(VOID); g.push(row); }
    const x = { rng, ri,
      line:(r,v)=>{ for(let c=1;c<COLS-1;c++) g[r][c]=v; },
      bandCols:(r,c0,c1,v)=>{ for(let c=Math.max(1,c0);c<=Math.min(COLS-2,c1);c++) g[r][c]=v; },
      cell:(r,c,v)=>{ if(c>=1&&c<COLS-1) g[r][c]=v; },
      fakeBand:(r)=>fakeBand(g,r,rng) };
    for(let rr=MAXH-1;rr>=MAXH-3;rr--) for(let c=1;c<COLS-1;c++) g[rr][c]=SOLID;   // 입구 안전 활주로 3행
    let bot = MAXH-3; const cpsLocal=[MAXH-1];
    let placed=0;
    while(placed < theme.len){
      const bn = theme.bands[ri(theme.bands.length)];
      const band = BANDS[bn]; const h=band.h;
      const top = bot - h; if(top < 1) break;
      band.fn(g, top, bot, x, tmp);
      // 입출구 행 단단히 복구
      for(let c=1;c<COLS-1;c++){ if(!SOLIDISH.has(g[bot][c])) g[bot][c]=SOLID; if(!SOLIDISH.has(g[top][c])) g[top][c]=SOLID; }
      if(!reachableRows(g, bot, top)){ for(let r=top;r<=bot;r++) for(let c=1;c<COLS-1;c++) g[r][c]=SOLID; }   // 막힌 밴드=평지 폴백(완주 보장)
      placed += h; bot = top;
      if(placed % 40 < h) cpsLocal.push(bot);   // 약 40칸마다 메인 체크포인트
    }
    // 잘라내기: 행 bot..MAXH-1 사용
    const used = []; for(let r=bot; r<MAXH; r++) used.push(g[r]);
    return { rows:used, baseRow:bot, cps:cpsLocal, entities:tmp.entities };
  }

  function assemble(seed){
    const rng = mulb(seed), ri=(n)=>Math.floor(rng()*n);
    // 난이도 1~5 각 1개씩(마지막 tier5=결승형) 선택
    const chosen=[]; for(let tier=1;tier<=5;tier++){ const pool=THEMES.filter(t=>t.tier===tier); chosen.push(pool[ri(pool.length)]); }
    // 각 구간 생성
    const secs = chosen.map(t=>({ theme:t, ...buildSection(t, rng, ri) }));
    const totalSec = secs.reduce((a,s)=>a+s.rows.length,0);
    const ROWS = START_ROWS + totalSec + FINISH_ROWS;
    const grid=[]; for(let r=0;r<ROWS;r++){ const row=new Array(COLS).fill(VOID); grid.push(row); }
    const entities=[]; const cps=[]; const labels=[];

    // 출발 발판
    for(let r=ROWS-START_ROWS;r<ROWS;r++) for(let c=1;c<COLS-1;c++) grid[r][c]=START;
    const startR=ROWS-2, startC=C; cps.push({r:ROWS-START_ROWS,c:C});

    // 구간 배치(아래→위). 구간의 마지막 행(입구)이 아래쪽.
    let base = ROWS - START_ROWS - 1;   // 다음 구간 입구가 놓일 그리드 행
    for(const s of secs){
      const n=s.rows.length;
      const topRow = base - n + 1;
      for(let i=0;i<n;i++){ const gr=topRow+i; const sr=i; for(let c=0;c<COLS;c++) grid[gr][c]=s.rows[sr][c]; }
      // 입구 행(아래)=체크포인트
      for(let c=1;c<COLS-1;c++) if(SOLIDISH.has(grid[base][c])) grid[base][c]=CP;
      cps.push({r:base,c:C});
      // 구간 내 추가 메인 체크포인트(약 40칸마다) — s.cps 의 baseRow 기준 오프셋
      for(const lc of s.cps){ const gr = topRow + (lc - s.baseRow); if(gr>topRow && gr<base){ for(let c=1;c<COLS-1;c++) if(SOLIDISH.has(grid[gr][c])) grid[gr][c]=CP; cps.push({r:gr,c:C}); } }
      // 엔티티 행 오프셋 변환
      for(const e of s.entities){ entities.push({...e, row: topRow + (e.row - s.baseRow)}); }
      labels.push(s.theme.name);
      base = topRow - 1;
    }

    // 결승 통로(맨 위): 중앙 3열만 단단
    const goalR=0, goalC=C;
    for(let r=0;r<FINISH_ROWS;r++){ for(let c=1;c<COLS-1;c++) grid[r][c]=VOID; for(let c=C-1;c<=C+1;c++) grid[r][c]=SOLID; }
    grid[goalR][goalC]=GOAL;

    // 체크포인트를 행 내림차순(아래=먼저)
    cps.sort((a,b)=>b.r-a.r);
    return { grid, cps, startR, startC, goalR, goalC, rows:ROWS, entities, labels, seed };
  }

  // BFS 이동: 걷기1·점프2·대시5(4방향) + 점프대/회전점프대/손바닥 발사(최대4칸). 점멸/타이밍 칸=통과가능 취급.
  function bfsExpand(grid, r, c, rMin, rMax, push){
    const blocksJump=(rr,cc)=>{ const v=gV(grid,rr,cc); return v===CLOUD||v===BALLOON; };
    for(const d of Object.values(DIRV)) for(const s of [1,JUMP_TILES,DASH_TOTAL]){
      let ok=true; for(let k=1;k<s;k++){ if(blocksJump(r+d[1]*k,c+d[0]*k)){ ok=false; break; } }
      if(ok) push(r+d[1]*s, c+d[0]*s);
    }
    const v=gV(grid,r,c);
    const dirs = isArrow(v)?[ARR_DIR[v]] : v===ROT?['up','down','left','right'] : isHand(v)?[ARR_DIR[v]] : null;
    if(dirs) for(const dn of dirs){ const d=DIRV[dn]; for(let k=1;k<=4;k++){ const rr=r+d[1]*k, cc=c+d[0]*k; if(rr<rMin||rr>rMax||cc<1||cc>COLS-2||gV(grid,rr,cc)===BALLOON) break; push(rr,cc); } }
  }
  function reachable(grid, sR, sC, gR, gC){
    const ROWS=grid.length; const safe=(r,c)=> r>=0&&r<ROWS&&c>=1&&c<=COLS-2 && BFS_SAFE.has(grid[r][c]);
    if(!safe(sR,sC)) return false;
    const seen=new Set([sR*COLS+sC]); const q=[[sR,sC]];
    while(q.length){ const [r,c]=q.shift(); if(r<=gR && Math.abs(c-gC)<=1) return true;
      bfsExpand(grid,r,c,0,ROWS-1,(r2,c2)=>{ if(!safe(r2,c2)) return; const k=r2*COLS+c2; if(seen.has(k)) return; seen.add(k); q.push([r2,c2]); }); }
    return false;
  }
  // 밴드 단위 통과검사: 행 botRow(아래) → topRow(위)
  function reachableRows(grid, botRow, topRow){
    const safe=(r,c)=> r>=topRow&&r<=botRow&&c>=1&&c<=COLS-2 && BFS_SAFE.has(grid[r][c]);
    const seen=new Set(); const q=[]; for(let c=1;c<=COLS-2;c++) if(safe(botRow,c)){ seen.add(botRow*COLS+c); q.push([botRow,c]); }
    while(q.length){ const [r,c]=q.shift(); if(r<=topRow) return true;
      bfsExpand(grid,r,c,topRow,botRow,(r2,c2)=>{ if(!safe(r2,c2)) return; const k=r2*COLS+c2; if(seen.has(k)) return; seen.add(k); q.push([r2,c2]); }); }
    return false;
  }

  function buildCourse(M){
    const seed=((M.state&&M.state.seed)||1)>>>0;
    for(let a=0;a<6;a++){ const c=assemble((seed ^ (a*0x9e3779b1))>>>0); if(reachable(c.grid,c.startR,c.startC,c.goalR,c.goalC)) return c; }
    return assemble(seed);
  }

  /* ----------------------------- 판정 헬퍼 ------------------------------ */
  function tileDeadlyResting(g,r,c,t){ const v=gV(g,r,c);
    if(v===VOID) return true;
    if(v===MAGIC) return !magicSolid(t,ph(r,c));
    if(v===VENT) return !ventSolid(t,ph(r,c));
    if(v===ELEC) return elecOn(t,ph(r,c));
    if(v===KILL||v===CLOUD) return true;
    return false; }
  function progOf(course,gy){ return clamp((course.startR-gy)/(course.startR-course.goalR),0,1)*PROG_MAX; }

  /* ----------------------------- 모듈 ----------------------------------- */
  const race = {
    label:'운빨 대시',
    init(M){
      M.course=buildCourse(M); M._peerProg={}; M._peerFin={};
      M._fake={};
      const sc=M.course.startC, sr=M.course.startR;
      M.local = M.amSpectator ? null : {
        gx:sc, gy:sr, x:cx(sc), y:cy(sr), z:0, state:'idle', mv:null, mvT:0,
        dirHeld:null, lastDir:'up', skillBuf:-1e9, air:false, dashUsed:false, jumpFromR:sr, jumpFromC:sc,
        jumpReadyAt:0, stunUntil:0, sliding:false, slideDir:null, speedUntil:0, convT:0,
        cpR:sr, cpC:sc, prog:0, bestProg:0, fin:false, finished:false, finT:0, _appended:false,
      };
    },

    step(M, dt){
      const L=M.local; if(!L||L.finished) return;
      const t=M.simT(); if(t<START_MS){ return; }
      if(!L.mv && t<L.stunUntil){ L.skillBuf=-1e9; return; }   // 경직(부활/착지) 중: 입력·버퍼 폐기 → 부활 직후 자동점프 차단
      if(M.input.action) L.skillBuf=t;
      L.dirHeld=readDir(M.input); if(L.dirHeld) L.lastDir=L.dirHeld;

      if(L.mv) advanceTween(M,L,dt,t);
      else handleResting(M,L,dt,t);

      // 쇠공(체공 무관 즉사) 매 프레임 영역검사
      ballHit(M,L,t);

      L.prog=progOf(M.course,L.gy); if(L.prog>L.bestProg) L.bestProg=L.prog;
      if(!L.fin && L.gy<=M.course.goalR && Math.abs(L.gx-M.course.goalC)<=1){
        L.fin=true; L.finished=true; L.finT=t; L.bestProg=PROG_MAX;
        if(!L._appended){ L._appended=true; M.flash('골인! 🍯'); try{M.appendFinish({seat:M.mySeat,timeMs:Math.round(t)});}catch(e){} }
      }
    },

    draw(M){ drawRace(M); },
    hud(M){ return hudHTML(M); },
    netPayload(M){ const L=M.local; if(!L) return null; return {x:Math.round(L.x),y:Math.round(L.y),z:Math.round(L.z),prog:Math.round(L.bestProg),fin:!!L.fin}; },
    onPeer(M,seat,msg){ if(msg&&msg.prog!=null) M._peerProg[seat]=Math.max(M._peerProg[seat]||0,msg.prog); if(msg&&msg.fin) M._peerFin[seat]=true; },
    actionLabel(){ return '점프'; },
    hostTick(M){ if(M._ended) return; const fin=(M.state&&M.state.finishOrder)||[];
      if(M.simT()>=HARD_LIMIT_MS){ M.endGame(); return; }
      if(fin.length===0) return; if(new Set(fin.map(f=>f.seat)).size>=M.n){ M.endGame(); return; }
      const f0=Math.min.apply(null,fin.map(f=>f.timeMs)); if(M.simT()-f0>=CUTOFF_MS) M.endGame(); },
    finishPatch(M){ const ranks={};
      const fin=((M.state&&M.state.finishOrder)||[]).slice().sort((a,b)=>(a.timeMs-b.timeMs)||(a.seat-b.seat));
      const seen=new Set(),finished=[]; for(const f of fin){ if(!f||f.seat==null||seen.has(f.seat)||M.seats.indexOf(f.seat)<0) continue; seen.add(f.seat); finished.push(f.seat); }
      const pg=(s)=>{ if(s===M.mySeat&&M.local) return M.local.bestProg||0; return (M._peerProg&&M._peerProg[s])||0; };
      const rest=M.seats.filter(s=>!seen.has(s)).sort((a,b)=>(pg(b)-pg(a))||(a-b));
      let r=1; for(const s of finished) ranks[s]=r++; for(const s of rest) ranks[s]=r++;
      for(const s of M.seats) if(ranks[s]==null) ranks[s]=r++; return {ranks}; },

    _buildCourse:buildCourse, _reachable:reachable, _assemble:assemble, _THEMES:THEMES,
  };

  /* ----------------------------- 이동 상태머신 -------------------------- */
  function readDir(input){ const ax=input.dx, ay=input.dy;
    if(Math.abs(ax)<0.35 && Math.abs(ay)<0.35) return null;
    return Math.abs(ax)>=Math.abs(ay) ? (ax>0?'right':'left') : (ay>0?'down':'up'); }
  function skillBuffered(L,t){ return (t-L.skillBuf)<=INPUT_BUF; }
  function inBounds(gx,gy,rows){ return gx>=1 && gx<=COLS-2 && gy>=0 && gy<=rows-1; }
  function blockedTile(g,gx,gy,rows){ if(!inBounds(gx,gy,rows)) return true; return g[gy][gx]===BALLOON; }

  function beginMove(L, tgx, tgy, dur, kind, arc, dir){
    L.mv={ fx:L.x, fy:L.y, tx:cx(tgx), ty:cy(tgy), tgx, tgy, dur, kind, arc, dir }; L.mvT=0; L.state=kind;
  }
  function advanceTween(M,L,dt,t){
    const mv=L.mv; L.mvT+=dt; const a=clamp(L.mvT/mv.dur,0,1);
    L.x=mv.fx+(mv.tx-mv.fx)*a; L.y=mv.fy+(mv.ty-mv.fy)*a;
    L.z = mv.arc ? Math.sin(a*Math.PI)*JUMP_H : 0;
    // 점프 중 대시 승격
    if(mv.kind==='jump' && !L.dashUsed && L.mvT>=DASH_GAP && skillBuffered(L,t)){ upgradeDash(M,L,t); return; }
    // 공중 비점프 사망(분홍구름/전기장 켜짐)은 통과 중에도 — 단 점프판정(jump/dash/arrow)은 안전
    if(a>=1){ arrive(M,L,t); }
  }
  function upgradeDash(M,L,t){ const dir=L.dirHeld||L.lastDir; if(!dir) return;
    const d=DIRV[dir], g=M.course.grid; let tgx=L.jumpFromC, tgy=L.jumpFromR;
    for(let k=1;k<=DASH_TOTAL;k++){ const nx=L.jumpFromC+d[0]*k, ny=L.jumpFromR+d[1]*k; if(!inBounds(nx,ny,M.course.rows)) break;
      if(g[ny][nx]===BALLOON){ g[ny][nx]=SOLID; if(!M.lowPower) M.vibrate(12); break; }   // 풍선=대시로 터뜨리고 앞에서 정지(다음에 통과)
      tgx=nx; tgy=ny; }
    L.dashUsed=true; L.skillBuf=-1e9; L.lastDir=dir; beginMove(L,tgx,tgy,T_DASH,'dash',true,dir);
  }
  function startJump(M,L,t){
    const g=M.course.grid;
    if(g[L.gy][L.gx]===SWAMP) return;                  // 늪=점프 봉인
    L.air=true; L.dashUsed=false; L.jumpFromR=L.gy; L.jumpFromC=L.gx; L.sliding=false; L.skillBuf=-1e9;
    const dir=L.dirHeld;
    if(!dir){ beginMove(L,L.gx,L.gy,T_JUMP,'jump',true,null); return; }   // 방향 없으면 제자리
    const d=DIRV[dir]; L.lastDir=dir; let tgx=clamp(L.gx+d[0]*JUMP_TILES,1,COLS-2), tgy=clamp(L.gy+d[1]*JUMP_TILES,0,M.course.rows-1);
    while(blockedTile(g,tgx,tgy,M.course.rows) && (tgx!==L.gx||tgy!==L.gy)){ tgx-=d[0]; tgy-=d[1]; }
    beginMove(L,tgx,tgy,T_JUMP,'jump',true,dir);
  }
  function bounce(M,L){ const g=M.course.grid; L.air=true; L.dashUsed=false; L.jumpFromR=L.gy; L.jumpFromC=L.gx; L.sliding=false;
    const dir=L.dirHeld;
    if(!dir){ beginMove(L,L.gx,L.gy,T_JUMP,'jump',true,null); return; }
    const d=DIRV[dir]; let tgx=clamp(L.gx+d[0]*JUMP_TILES,1,COLS-2), tgy=clamp(L.gy+d[1]*JUMP_TILES,0,M.course.rows-1);
    while(blockedTile(g,tgx,tgy,M.course.rows)&&(tgx!==L.gx||tgy!==L.gy)){ tgx-=d[0]; tgy-=d[1]; }
    beginMove(L,tgx,tgy,T_JUMP,'jump',true,dir); }
  function startWalk(M,L,dir){ const d=DIRV[dir]; const tgx=L.gx+d[0], tgy=L.gy+d[1];
    if(blockedTile(M.course.grid,tgx,tgy,M.course.rows)) return;       // 벽/풍선/경계=제자리(걸침 없음)
    const slow = M.course.grid[L.gy][L.gx]===SWAMP ? 1.9 : 1;
    const fast = M.simT()<L.speedUntil ? 0.7 : 1;
    beginMove(L,tgx,tgy,T_WALK*slow*fast,'walk',false,dir);
  }

  function handleResting(M,L,dt,t){
    const g=M.course.grid, gx=L.gx, gy=L.gy, v=g[gy][gx];
    // 발밑 주기 사망(마법진 소멸·배출구 열림·전기장 켜짐·구멍·죽는발판)
    if(tileDeadlyResting(g,gy,gx,t)){ die(M,L,t); return; }
    // 트램펄린 위=계속 바운스(올라가 있으면 자동 점프)
    if(v===TRAMP && t>=L.jumpReadyAt){ bounce(M,L); return; }
    // 스킬(점프) — 슬라이드/일반 모두 점프로 탈출 가능
    if(skillBuffered(L,t) && t>=L.jumpReadyAt){ startJump(M,L,t); return; }
    // 얼음 슬라이드: 진입 방향대로 계속(대시 불가)
    if(L.sliding){ const d=DIRV[L.slideDir]; const tgx=gx+d[0], tgy=gy+d[1];
      if(blockedTile(g,tgx,tgy,M.course.rows)){ L.sliding=false; }
      else { beginMove(L,tgx,tgy,T_SLIDE,'slide',false,L.slideDir); return; } }
    // 컨베이어 드리프트
    if(isConvey(v)){ L.convT+=dt; if(L.convT>=CONV_CYC){ L.convT=0; const cd=ARR_DIR[v]; const d=DIRV[cd]; const tgx=gx+d[0],tgy=gy+d[1];
        if(!blockedTile(g,tgx,tgy,M.course.rows) && !L.dirHeld){ beginMove(L,tgx,tgy,T_WALK,'walk',false,cd); return; } } }
    else L.convT=0;
    // 걷기(방향 입력)
    if(L.dirHeld) startWalk(M,L,L.dirHeld);
  }

  function arrive(M,L,t){
    const mv=L.mv; L.gx=mv.tgx; L.gy=mv.tgy; L.x=cx(L.gx); L.y=cy(L.gy); L.z=0; const kind=mv.kind, enterDir=mv.dir; L.mv=null;
    if(kind==='jump'||kind==='dash'||kind==='launch'){ L.air=false; L.dashUsed=false; L.jumpReadyAt=t+LAND_STUN; L.stunUntil=Math.max(L.stunUntil,t+LAND_STUN); }
    resolveTile(M,L,t,enterDir,kind);
  }

  function resolveTile(M,L,t,enterDir,kind){
    const g=M.course.grid, gx=L.gx, gy=L.gy, v=g[gy][gx];
    // 사망류
    if(v===VOID) return die(M,L,t);
    if(v===FAKE){ if(isFake(M,gy,gx)) return die(M,L,t); }
    if(v===KILL) return die(M,L,t);                                   // 광대발판: 착지(=닿음)하면 사망(점프로 넘는 건 통과)
    if(v===CLOUD) return die(M,L,t);
    if(v===ELEC && elecOn(t,ph(gy,gx))) return die(M,L,t);
    if(v===MAGIC && !magicSolid(t,ph(gy,gx))) return die(M,L,t);
    if(v===VENT && !ventSolid(t,ph(gy,gx))) return die(M,L,t);
    // 효과류
    if(v===BUMP){ const back=OPP[enterDir||'up']; const d=DIRV[back]; let tgx=clamp(gx+d[0]*2,1,COLS-2),tgy=clamp(gy+d[1]*2,0,M.course.rows-1);
      while(blockedTile(g,tgx,tgy,M.course.rows)&&(tgx!==gx||tgy!==gy)){tgx-=d[0];tgy-=d[1];} L.sliding=false; if(!M.lowPower)M.vibrate(14); beginMove(L,tgx,tgy,T_BUMP,'bump',false,back); return; }
    if(v===TRAMP){ bounce(M,L); return; }   // 트램펄린: 착지 시 즉시 재바운스
    if(isArrow(v)){ launch(M,L, ARR_DIR[v], 4, true); return; }       // 점프대(점프판정)
    if(v===ROT){ launch(M,L, rotDir(t,ph(gy,gx)), 4, true); return; } // 회전점프대
    if(isHand(v)){ launch(M,L, ARR_DIR[v], 4, false); return; }       // 손바닥(점프판정 아님)
    if(v===ICE){ L.sliding=true; L.slideDir=enterDir||L.lastDir||'up'; }
    else L.sliding=false;
    if(v===SPEED) L.speedUntil=t+SPEED_MS;
    // 체크포인트/결승
    if(v===CP||v===START){ for(const cp of M.course.cps) if(gy<=cp.r && cp.r<L.cpR){ L.cpR=cp.r; L.cpC=cp.c; } }
  }
  function launch(M,L,dir,cells,air){ const d=DIRV[dir]; let tgx=L.gx,tgy=L.gy;
    for(let k=1;k<=cells;k++){ const nx=L.gx+d[0]*k, ny=L.gy+d[1]*k; if(!inBounds(nx,ny,M.course.rows)||M.course.grid[ny][nx]===BALLOON) break; tgx=nx; tgy=ny; }
    L.air=air; L.dashUsed=false; L.jumpFromR=L.gy; L.jumpFromC=L.gx; L.sliding=false;
    beginMove(L,tgx,tgy,Math.max(140,cells*T_LAUNCH),'launch',air,dir);
  }
  function die(M,L,t){ L.gx=L.cpC; L.gy=L.cpR; L.x=cx(L.gx); L.y=cy(L.gy); L.z=0; L.mv=null; L.air=false; L.dashUsed=false;
    L.sliding=false; L.state='idle'; L.stunUntil=t+RESPAWN_STUN; L.speedUntil=0; L.skillBuf=-1e9;
    M.flash('💫 추락! 체크포인트로'); if(!M.lowPower) M.vibrate(26); }
  function isFake(M,r,c){ const k=r*COLS+c; if(M._fake[k]==null){ const rng=mulb((M.course.seed^(r*73856093)^(c*19349663))>>>0); M._fake[k]=rng()<0.55; } return M._fake[k]; }
  function ballHit(M,L,t){ const ents=M.course.entities; if(!ents||!ents.length||L.finished) return;
    for(const e of ents){ if(e.kind!=='ball') continue; const fr=(Math.sin(2*Math.PI*((t+e.ph)/e.period))+1)/2; const col=e.c0+fr*(e.c1-e.c0);
      if(Math.abs(L.gy-e.row)<=2 && Math.abs(L.x-cx(col))<TILE*1.6 && t>=L.stunUntil){ die(M,L,t); return; } } }

  /* ----------------------------- HUD ----------------------------------- */
  function estimateRank(M,myProg){ let ahead=0; const fin=new Set(((M.state&&M.state.finishOrder)||[]).map(f=>f.seat)); const myFin=M.local&&M.local.fin;
    for(const s of M.seats){ if(s===M.mySeat) continue; const pr=(M._peerProg&&M._peerProg[s])||0; const pf=fin.has(s)||(M._peerFin&&M._peerFin[s]);
      if(pf&&!myFin) ahead++; else if(!pf&&pr>myProg) ahead++; } return ahead+1; }
  function hudHTML(M){ const L=M.local; const myProg=L?L.bestProg:0; const rank=estimateRank(M,myProg); const pct=Math.round(myProg/PROG_MAX*100); const t=M.simT();
    const fin=(M.state&&M.state.finishOrder)||[]; let timer;
    if(t<START_MS) timer='출발 대기'; else if(fin.length){ const f0=Math.min.apply(null,fin.map(f=>f.timeMs)); timer=`<b>마감 ${(Math.max(0,CUTOFF_MS-(t-f0))/1000).toFixed(1)}s</b>`; } else timer=`${Math.max(0,(t-START_MS)/1000).toFixed(0)}s`;
    const stateTxt = L&&L.fin?'🏁 완주':(L&&t<L.stunUntil&&t>=START_MS?'💫 추락':`진행 ${pct}%`);
    return `<div class="mini-hud__row"><span>순위 <b>${rank}</b>/${M.n}</span><span>${stateTxt}</span><span>${timer}</span></div>`; }

  /* ----------------------------- 그리기 -------------------------------- */
  function drawRace(M){ const ctx=M.ctx,W=M.W,H=M.H; if(!M.course) return;
    const g=M.course.grid,t=M.simT(); const Z=M.lowPower?1.15:1.35; const L=M.local;
    const camX=L?L.x:cx(M.course.goalC), camY=L?L.y:cy(M.course.goalR+5);
    const sx=(wx)=>Math.round((wx-camX)*Z+W*0.5), sy=(wy)=>Math.round((wy-camY)*Z+H*0.6); const TZ=TILE*Z;
    ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,W,H);
    const hw=(W*0.5)/Z+TILE, hu=(H*0.6)/Z+TILE, hd=(H*0.4)/Z+TILE;
    const c0=Math.max(0,colAt(camX-hw)),c1=Math.min(COLS-1,colAt(camX+hw)),r0=Math.max(0,rowAt(camY-hu)),r1=Math.min(M.course.rows-1,rowAt(camY+hd));
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) drawTile(M,ctx,sx(c*TILE),sy(r*TILE),TZ,g[r][c],r,c,t);
    drawGoal(M,ctx,sx,sy,TZ); drawEntities(M,ctx,sx,sy,TZ,t);
    for(const seat of M.seats){ if(seat===M.mySeat) continue; const p=M.peerAt(seat); if(!p||p.x==null) continue;
      const px=sx(p.x),py=sy(p.y)-(p.z||0)*Z; if(px<-50||px>W+50||py<-50||py>H+50) continue; drawRunner(ctx,sx(p.x),sy(p.y),p.z||0,seat,!!p.fin,false,false,Z); }
    if(L) drawRunner(ctx,sx(L.x),sy(L.y),L.z,M.mySeat,L.fin,true,t<L.stunUntil&&t>=START_MS,Z);
    if(!M.lowPower){ const grd=ctx.createLinearGradient(0,0,0,H); grd.addColorStop(0,'rgba(6,8,14,0.4)'); grd.addColorStop(0.5,'rgba(6,8,14,0)'); grd.addColorStop(1,'rgba(6,8,14,0.3)'); ctx.fillStyle=grd; ctx.fillRect(0,0,W,H); }
    if(t<START_MS) drawCountdown(ctx,W,H,t);
  }
  function drawTile(M,ctx,X,Y,TZ,v,r,c,t){
    if(v===VOID){ ctx.fillStyle='#05070d'; ctx.fillRect(X,Y,Math.ceil(TZ),Math.ceil(TZ)); ctx.strokeStyle='rgba(34,48,72,0.4)'; ctx.lineWidth=1; ctx.strokeRect(X+0.5,Y+0.5,TZ-1,TZ-1); return; }
    let fill='#26384f',edge='#3a5a86',icon='';
    switch(v){
      case GOAL: fill='#274d2c';edge='#46c25a';break;
      case START: fill='#23314a';edge='#4a6aa0';break;
      case CP: fill='#1e3a4d';edge='#39c6c0';icon='✦';break;
      case FAKE: { const f=isFake(M,r,c); fill=f?'#5a4a22':'#3e5a2a'; edge=f?'#caa24a':'#7cc24a'; break; }   // 연두/갈색 — 진위 비공개
      case SPEED: fill='#5a4410';edge='#ffcb3a';icon='»';break;
      case MAGIC: { const s=magicSolid(t,ph(r,c)); fill=s?'#3a2a55':'#0d0a18'; edge=s?'#b07cff':'#2a2440'; icon=s?'✷':''; break; }
      case ICE: fill='#1d3f57';edge='#7fd6ff';break;
      case TRAMP: fill='#21305e';edge='#5d7bff';icon='▲';break;
      case BUMP: fill='#4a2030';edge='#ff6fae';icon='★';break;
      case KILL: fill='#5a1f3a';edge='#ff4d8d';icon='☻';break;
      case CLOUD: fill='#7a2d63';edge='#ff8fd6';icon='✿';break;
      case ELEC: { const on=elecOn(t,ph(r,c)); fill=on?'#5a5410':'#23280f'; edge=on?'#ffe14a':'#5a5a2a'; icon=on?'⚡':''; break; }
      case VENT: { const s=ventSolid(t,ph(r,c)); fill=s?'#4a3a22':'#0a0a10'; edge=s?'#caa24a':'#2a2420'; icon=s?'▦':''; break; }
      case SWAMP: fill='#243a26';edge='#3a6a3a';icon='≈';break;
      case BALLOON: fill='#5a2347';edge='#ff79c6';icon='●';break;
      case ROT: { const d=rotDir(t,ph(r,c)); fill='#26405a';edge='#6fb6ff';icon=d==='up'?'↑':d==='down'?'↓':d==='left'?'←':'→'; break; }
      default:
        if(isArrow(v)){ fill='#26405a';edge='#6fb6ff'; const dn=ARR_DIR[v]; icon=dn==='up'?'⇑':dn==='down'?'⇓':dn==='left'?'⇐':'⇒'; }
        else if(isConvey(v)){ fill='#3a2e1a';edge='#caa860'; const dn=ARR_DIR[v]; icon=dn==='up'?'↑':dn==='down'?'↓':dn==='left'?'←':'→'; }
        else if(isHand(v)){ fill='#5a4632';edge='#ffcaa0';icon='✋'; }
    }
    ctx.fillStyle=fill; ctx.fillRect(X+1,Y+1,TZ-1,TZ-1); ctx.strokeStyle=edge; ctx.lineWidth=1; ctx.strokeRect(X+0.5,Y+0.5,TZ-1,TZ-1);
    if(icon){ ctx.fillStyle=edge; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${Math.round(TZ*0.52)}px system-ui,sans-serif`; ctx.fillText(icon,X+TZ/2,Y+TZ/2+1); }
  }
  function drawEntities(M,ctx,sx,sy,TZ,t){ const ents=M.course.entities; if(!ents) return;
    for(const e of ents){ if(e.kind!=='ball') continue; const fr=(Math.sin(2*Math.PI*((t+e.ph)/e.period))+1)/2; const col=e.c0+fr*(e.c1-e.c0);
      const X=sx(cx(col)),Y=sy(cy(e.row)),R=TZ*0.95;
      ctx.fillStyle='rgba(255,60,60,0.18)'; ctx.beginPath(); ctx.arc(X,Y,R*1.3,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#9aa0ad'; ctx.strokeStyle='#5a5f6a'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(X,Y,R,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#41454f'; ctx.beginPath(); ctx.arc(X-R*0.3,Y-R*0.3,R*0.3,0,Math.PI*2); ctx.fill(); } }
  function drawGoal(M,ctx,sx,sy,TZ){ const y=sy(M.course.goalR*TILE); const cell=Math.max(6,Math.round((TZ||TILE)/2));
    const x0=sx((C-1)*TILE),x1=sx((C+2)*TILE); for(let x=x0;x<x1;x+=cell){ const k=Math.floor((x-x0)/cell)%2; ctx.fillStyle=k?'#11151d':'#eef1f6'; ctx.fillRect(x,y,cell,cell); ctx.fillStyle=k?'#eef1f6':'#11151d'; ctx.fillRect(x,y+cell,cell,cell); }
    ctx.fillStyle='#ffd54a'; ctx.font=`bold ${Math.round(cell*1.6)}px system-ui`; ctx.textAlign='center'; ctx.fillText('🍯',sx(M.course.goalC*TILE)+TZ/2,y-cell); }
  function drawRunner(ctx,cx0,cy0,z,seat,fin,isMe,stun,scale){ const r=(PR+2)*(scale||1); const yy=cy0-z*(scale||1);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx0,cy0+r*0.5,r*(1-z/70),r*0.4*(1-z/100),0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=stun?0.5:1; ctx.beginPath(); ctx.arc(cx0,yy,r,0,Math.PI*2); ctx.fillStyle=seatColor(seat); ctx.fill();
    ctx.lineWidth=isMe?3:2; ctx.strokeStyle=isMe?'#fff':'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.fillStyle='#0b0e14'; ctx.font=`bold ${Math.round(r*1.05)}px system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(seat),cx0,yy+1); ctx.globalAlpha=1;
    if(fin){ ctx.fillStyle='#ffd54a'; ctx.beginPath(); ctx.arc(cx0+r,yy-r,3,0,Math.PI*2); ctx.fill(); } }
  function drawCountdown(ctx,W,H,t){ ctx.fillStyle='rgba(6,8,14,0.45)'; ctx.fillRect(0,0,W,H);
    const phase=t/1000; let txt,sub='준비!',col='#ffd54a';
    if(phase<1){txt='3';col='#ff6f6f';} else if(phase<2){txt='2';col='#ffb454';} else if(phase<3){txt='1';col='#ffe066';} else {txt='GO!';col='#5fe08a';sub='출발!';}
    const frac=phase-Math.floor(phase), punch=1+Math.max(0,(1-frac*4))*0.5;
    if(phase>=3&&frac<0.1){ ctx.fillStyle='rgba(255,255,255,'+(0.5-frac*5)+')'; ctx.fillRect(0,0,W,H); }
    ctx.save(); ctx.translate(W/2,H*0.45); ctx.scale(punch,punch); ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`900 ${Math.round(Math.min(W,H)*0.34)}px system-ui,sans-serif`; ctx.fillText(txt,0,0); ctx.restore();
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.textAlign='center'; ctx.font=`700 ${Math.round(Math.min(W,H)*0.05)}px system-ui,sans-serif`; ctx.fillText(sub,W/2,H*0.45+Math.min(W,H)*0.22); }
  const SEATC=['#4f9dff','#ff5d5d','#43d18b','#f6c544','#b07cff','#ff8c42','#3ad0d6','#ff6fae'];
  function seatColor(s){ return SEATC[((s||1)-1)%SEATC.length]; }

  // 검증용 내비게이터(헤드리스 봇): 현재 시각 기준 통과가능 칸으로 BFS(걷기1·점프2·발사패드 포함). 첫 한 수 반환.
  race._nav = function(M){
    const L=M.local; if(!L) return {dir:'up',jump:false}; const g=M.course.grid, t=M.simT();
    const goalR=M.course.goalR, goalC=M.course.goalC, ROWS=M.course.rows;
    const passNow=(r,c)=> r>=0&&r<ROWS&&c>=1&&c<=COLS-2 && BFS_SAFE.has(g[r][c]) && !tileDeadlyResting(g,r,c,t);
    const start=L.gy*COLS+L.gx, prev=new Map(), seen=new Set([start]), q=[[L.gy,L.gx]]; let goalNode=null;
    while(q.length){ const [r,c]=q.shift(); if(r<=goalR && Math.abs(c-goalC)<=1){ goalNode=r*COLS+c; break; }
      const add=(r2,c2,kind,dir)=>{ if(!passNow(r2,c2)) return; const key=r2*COLS+c2; if(seen.has(key)) return; seen.add(key); prev.set(key,{from:r*COLS+c,kind,dir}); q.push([r2,c2]); };
      const noWall=(rr,cc,s)=>{ for(let k=1;k<=s;k++){ const v2=gV(g,r+(rr-r)/s*k,c+(cc-c)/s*k); if(v2===CLOUD||v2===BALLOON) return false; } return true; };
      for(const dn of ['up','left','right','down']){ const d=DIRV[dn];
        add(r+d[1],c+d[0],'walk',dn);
        if(noWall(r+d[1]*JUMP_TILES,c+d[0]*JUMP_TILES,JUMP_TILES)) add(r+d[1]*JUMP_TILES,c+d[0]*JUMP_TILES,'jump',dn);
        if(noWall(r+d[1]*DASH_TOTAL,c+d[0]*DASH_TOTAL,DASH_TOTAL)) add(r+d[1]*DASH_TOTAL,c+d[0]*DASH_TOTAL,'dash',dn); }
      const v=gV(g,r,c); const ld = isArrow(v)?[ARR_DIR[v]] : v===ROT?['up','down','left','right'] : isHand(v)?[ARR_DIR[v]] : null;
      if(ld) for(const dn of ld){ const d=DIRV[dn]; for(let k=1;k<=4;k++){ const rr=r+d[1]*k,cc=c+d[0]*k; if(rr<0||rr>=ROWS||cc<1||cc>COLS-2||gV(g,rr,cc)===BALLOON) break; add(rr,cc,'launch',dn); } } }
    let step=null;
    if(goalNode!=null){ let cur=goalNode; while(prev.has(cur)){ const p=prev.get(cur); if(p.from===start){ step=p; break; } cur=p.from; } }
    if(!step){ // 전체 경로 못 찾음 → 허공 진입 금지하는 탐욕 안전수
      for(const [dn,kind] of [['up','jump'],['up','walk'],['left','walk'],['right','walk'],['left','jump'],['right','jump'],['up','dash']]){
        const d=DIRV[dn], s=kind==='walk'?1:kind==='dash'?DASH_TOTAL:JUMP_TILES; const r2=L.gy+d[1]*s,c2=L.gx+d[0]*s;
        if(passNow(r2,c2)){ step={dir:dn,kind}; break; } } }
    if(!step) return {dir:'up',jump:false,dash:false};
    return {dir:step.dir, jump:step.kind==='jump', dash:step.kind==='dash'};
  };

  // 검증용 노출(테스트 전용)
  race._T={VOID,SOLID,START,CP,GOAL,FAKE,SPEED,MAGIC,ICE,TRAMP,BUMP,KILL,CLOUD,ELEC,VENT,SWAMP,BALLOON,ROT,ARR_U,ARR_D,ARR_L,ARR_R,CNV_U,CNV_D,CNV_L,CNV_R,HAND_U,HAND_D,HAND_L,HAND_R};
  race._periodic={magicSolid,ventSolid,elecOn,ph,MAGIC_CYC,VENT_CYC,ELEC_CYC};

  window.MiniGames.race = race;
})();
