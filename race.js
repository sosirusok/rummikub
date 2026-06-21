/* =========================================================================
   race.js — 운빨 대시 : 좀비고 "서바이벌 서커스" 식 톱다운 장애물 점프맵 (2~8인)
   window.MiniGames.race 로 등록. 자급자족 단일 파일.

   설계(실제 좀비고 서바이벌 서커스 리서치 반영):
   - 십자키/조이스틱 연속이동 + 스킬버튼 1개. 누름=점프(전방 2칸), 공중에서 한 번 더=대시(+3칸=합 5칸).
     착지하면 즉시 다음 점프 가능(짧은 쿨), 점프당 대시 1회. 착지는 목표 타일 중심에 스냅 → '1칸 정밀'.
   - 코스 = 20여 개 '구간(섹션) 템플릿' 풀에서 매판 3~5개를 난이도 제약을 지켜 랜덤 조립.
     구간 경계마다 체크포인트(추락 시 마지막 체크포인트로 부활, 탈락 없음). 결승 🍯 먼저 도착 = 승.
   - 장애물: 속도발판 / 죽는발판(광대=점프로 회피 가능, 분홍구름=공중에서도 죽음) / 공허(낙사) /
     얼음판(미끄럼) / 탱탱볼·분홍솜(튕김) / 트램펄린(연속바운스) / 별범퍼(뒤로) / 가짜발판(복불복) /
     사라지는발판(점멸) / 가시(주기) / 여닫이 손바닥(닫힐 때 뒤로 넉백) / 컨베이어 / 점프대(런치) / 톱날(이동).
   - 시작 전 3-2-1-GO 카운트다운(전 클라 turn_started_at 공유로 동기). 모든 코스는 빌드시 BFS로 완주 보장.

   mini-core 계약: init/step/draw/hud/netPayload/onPeer/actionLabel/hostTick/finishPatch.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  /* ----------------------------- 그리드/코스 상수 ------------------------ */
  const TILE = 32;                 // 타일 한 변(px)
  const COLS = 11;                 // 가로 칸(col0/COLS-1 = 허공 경계, 안쪽 1..9 = 9레인)
  const C    = (COLS - 1) >> 1;    // 중앙 열(5)
  const PR   = 9;                  // 캐릭터 반지름(px)
  const START_ROWS  = 3;           // 출발 발판(맨 아래)
  const FINISH_ROWS = 4;           // 결승 통로(맨 위)

  // 타일 종류
  const VOID=0, SOLID=1, GOAL=2, FAKE=3, SPEED=4, BLINK=5, ICE=6, BOUNCE=7,
        TRAMP=8, BUMP=9, KILL=10, CLOUD=11, SPIKE=12, PALM=13,
        CNV_U=14, CNV_D=15, CNV_L=16, CNV_R=17, ARR_U=18, ARR_D=19, ARR_L=20, ARR_R=21,
        CP=22, START=23;
  const isConvey = (v) => v >= CNV_U && v <= CNV_R;
  const isArrow  = (v) => v >= ARR_U && v <= ARR_R;
  const DIRV = { [CNV_U]:[0,-1],[CNV_D]:[0,1],[CNV_L]:[-1,0],[CNV_R]:[1,0],
                 [ARR_U]:[0,-1],[ARR_D]:[0,1],[ARR_L]:[-1,0],[ARR_R]:[1,0] };
  // 디딜 수 있는 단단한 바닥류(추락 아님)
  const SOLIDISH = new Set([SOLID, GOAL, SPEED, ICE, BOUNCE, TRAMP, BUMP, CP, START,
                            CNV_U,CNV_D,CNV_L,CNV_R, ARR_U,ARR_D,ARR_L,ARR_R, SPIKE, PALM]);
  // BFS 완주가능성 판정에서 '결국 디딜 수 있는' 칸(점멸/가시/손바닥=타이밍이면 통과 가능)
  const BFS_SAFE = new Set([SOLID, GOAL, SPEED, ICE, BOUNCE, TRAMP, BUMP, CP, START, BLINK,
                            CNV_U,CNV_D,CNV_L,CNV_R, ARR_U,ARR_D,ARR_L,ARR_R, SPIKE, PALM]);

  // 운동 파라미터(고정스텝 dt=ms) — 좀비고 체감(점프 2칸·대시 +3칸·짧은 쿨)
  const WALK      = 0.150;         // 걷기 이속(px/ms ≈ 4.7 tiles/s)
  const JUMP_TILES= 2, JUMP_MS = 360;     // 평점프 전방 2칸, 체공 360ms
  const DASH_TILES= 3, DASH_MS = 210;     // 대시 +3칸(합 5칸), 체공 연장 210ms
  const JUMP_SPD  = JUMP_TILES * TILE / JUMP_MS;   // 0.178
  const DASH_SPD  = DASH_TILES * TILE / DASH_MS;   // 0.457 — 대시는 딱 +3칸(스냅)
  const DASH_GAP  = 60;            // 점프 후 대시 가능까지 최소(ms) — 버퍼링으로 구제
  const JUMP_CD   = 90;            // 착지 후 다음 점프 쿨다운(ms) — 스냅한 연속점프
  const LAND_STUN = 110;           // 대시 착지 경직(ms)
  const STUN_MS   = 430;           // 추락 후 부활 경직(ms)
  const BUMP_STUN = 190;
  const SPEED_MUL = 1.55, SPEED_MS = 2200;   // 속도발판 배율/지속
  const BLINK_MS  = 1500;          // 점멸 주기(절반 OFF)
  const SPIKE_MS  = 1400;          // 가시 주기(절반 솟음)
  const PALM_MS   = 1700;          // 손바닥 개폐 주기
  const START_MS  = 3600;          // 3-2-1-GO 카운트다운(ms)
  const CUTOFF_MS = 18000;         // 첫 골인 후 마감(ms)
  const HARD_LIMIT_MS = 180000;    // 아무도 못 끝내도 무조건 마감(교착 방지)
  const PROG_MAX  = 1000;

  /* ----------------------------- 좌표/주기 ------------------------------ */
  function cx(c){ return Math.round((c + 0.5) * TILE); }
  function cy(r){ return Math.round((r + 0.5) * TILE); }
  function colAt(px){ return Math.floor(px / TILE); }
  function rowAt(py){ return Math.floor(py / TILE); }
  function blinkOn(t){ return (Math.floor(t / BLINK_MS) % 2) === 0; }
  function spikeUp(t, ph){ return (Math.floor((t + ph) / SPIKE_MS) % 2) === 0; }
  function palmShut(t, ph){ return (Math.floor((t + ph) / PALM_MS) % 2) === 0; }
  function gridV(grid, r, c){ return (r >= 0 && r < grid.length && c >= 0 && c < COLS) ? grid[r][c] : VOID; }
  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

  /* =====================================================================
     구간(섹션) 템플릿 — 각 구간은 입구(맨아래 bot)·출구(맨위 top) 행이 단단한 통로,
     중간에 장애물을 깎는다. 모든 구간은 입구→출구로 통과 가능한 경로를 보장(BFS로 최종검증).
     build(g, top, bot, ctx) : ctx={rng, ri, line(r,v), cell(r,c,v), band(r0,r1,v), safeRow(r)}
     ===================================================================== */
  const SECTIONS = [
    /* ---- EASY ---- */
    { name:'warmup', diff:'easy', h:7, build(g,top,bot,x){            // 등간격 1칸 갭 점프 학습
        for(let r=bot-1;r>top;r--) x.line(r,SOLID);
        const gaps=[bot-2, bot-4]; for(const gr of gaps) if(gr>top) x.bandCols(gr, C-1, C+1, VOID);
      }},
    { name:'plaza', diff:'easy', h:7, build(g,top,bot,x){             // 넓은 휴식 광장 + 별범퍼 몇 개
        for(let r=bot-1;r>top;r--) x.line(r,SOLID);
        for(let i=0;i<3;i++){ const r=top+1+x.ri(bot-top-1), c=2+x.ri(COLS-4); if(c!==C) g[r][c]=BUMP; }
      }},
    { name:'speedlane', diff:'easy', h:8, build(g,top,bot,x){         // 속도발판 가속 후 2칸 갭
        for(let r=bot-1;r>top;r--) g[r][C]=SOLID, g[r][C-1]=SOLID, g[r][C+1]=SOLID;
        for(let r=bot-1;r>top+2;r--) g[r][C]=SPEED;
        x.bandCols(top+2, C-1, C+1, VOID); x.line(top+1,SOLID);
      }},
    /* ---- MEDIUM ---- */
    { name:'gaprhythm', diff:'med', h:9, build(g,top,bot,x){          // 변박 갭(2-3-2칸) 가운데 통로, 양옆 허공
        x.line(bot-1,SOLID);
        const ys=[bot-3,bot-5,bot-7];
        for(let r=top;r<bot;r++) x.bandCols(r, C-1, C+1, VOID);
        for(const r of ys) if(r>top) { g[r][C-1]=SOLID; g[r][C]=SOLID; g[r][C+1]=SOLID; }
        for(let c=C-1;c<=C+1;c++) g[top][c]=SOLID;
      }},
    { name:'fakepath', diff:'med', h:9, build(g,top,bot,x){           // 가짜발판 복불복(진짜칸 보장)
        for(let r=bot-1;r>top;r--) x.line(r,SOLID);
        x.fakeBand(top+2); x.fakeBand(bot-3);
      }},
    { name:'blinkfloor', diff:'med', h:9, build(g,top,bot,x){         // 사라지는 발판 타이밍
        x.line(bot-1,SOLID);
        for(let r=top+1;r<bot-1;r++){ if((bot-1-r)%2===0){ for(let c=2;c<=COLS-3;c++) g[r][c]=BLINK; } else x.line(r,SOLID); }
        x.line(top+1,SOLID);
      }},
    { name:'iceslide', diff:'med', h:9, build(g,top,bot,x){           // 얼음판 미끄럼 + 가장자리 허공
        for(let r=bot-1;r>top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=ICE; }
        g[bot-1]&&x.line(bot-1,SOLID); x.line(top+1,SOLID);
        x.bandCols(top+3, 1, C-3, VOID); x.bandCols(top+3, C+3, COLS-2, VOID);
      }},
    { name:'bounce', diff:'med', h:9, build(g,top,bot,x){             // 탱탱볼/분홍솜 + 구멍 건너기
        x.line(bot-1,SOLID); x.line(top+1,SOLID);
        for(let r=top+2;r<bot-1;r++) x.bandCols(r,C-1,C+1,VOID);
        g[bot-2][C]=BOUNCE; g[Math.floor((top+bot)/2)][C]=BOUNCE;
      }},
    { name:'conveyor', diff:'med', h:9, build(g,top,bot,x){           // 컨베이어 통로(전진방향=위)
        for(let r=bot-1;r>top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=CNV_U; }
        x.line(bot-1,SOLID); x.line(top+1,SOLID);
        const gr=Math.floor((top+bot)/2); x.bandCols(gr,C-2,C+2,VOID); g[gr][C]=SOLID;
      }},
    { name:'clownpads', diff:'med', h:9, build(g,top,bot,x){          // 광대발판(점프로 회피) 빽빽이 — 가운데도 안전 아님
        for(let r=bot-1;r>top;r--) x.line(r,SOLID);
        for(let i=0;i<8;i++){ const r=top+2+x.ri(bot-top-3), c=1+x.ri(COLS-2); g[r][c]=KILL; }
      }},
    { name:'palmgate', diff:'med', h:9, build(g,top,bot,x){           // 여닫이 손바닥 게이트(닫힐 때 넉백)
        for(let r=bot-1;r>top;r--) g[r][C]=SOLID, g[r][C-1]=SOLID, g[r][C+1]=SOLID;
        const r1=bot-3, r2=top+2;
        for(const rr of [r1,r2]) if(rr>top){ g[rr][C]=PALM; }
      }},
    { name:'launch', diff:'med', h:9, build(g,top,bot,x){             // 점프대(위로 런치)로 넓은 허공 통과
        x.line(bot-1,SOLID);
        for(let r=top+1;r<bot-1;r++) x.line(r,VOID);
        g[bot-2][C]=ARR_U; for(let c=C-1;c<=C+1;c++) g[top][c]=SOLID; for(let c=C-1;c<=C+1;c++) g[top+1][c]=SOLID;
      }},
    /* ---- HARD ---- */
    { name:'narrow', diff:'hard', h:10, build(g,top,bot,x){           // 좁은 지그재그 외길 — 안전칸 좌우 교차, 사이 허공/가시
        x.line(bot-1,SOLID); x.line(top+1,SOLID);
        for(let r=top+2;r<bot-1;r++) x.bandCols(r,1,COLS-2,VOID);
        let side=0; for(let r=bot-2;r>=top+2;r--){ const c=side?C-1:C+1; g[r][c]=SOLID; g[r][side?C+1:C-1]=SPIKE; side^=1; }
      }},
    { name:'sawline', diff:'hard', h:10, build(g,top,bot,x,course){   // 이동 톱날이 쓰는 통로
        for(let r=bot-1;r>top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=SOLID; }
        x.line(top+1,SOLID);
        const r1=bot-3, r2=top+3;
        course.entities.push({kind:'saw', row:r1, c0:C-2, c1:C+2, period:2200, ph:0});
        course.entities.push({kind:'saw', row:r2, c0:C-2, c1:C+2, period:2600, ph:1100});
      }},
    { name:'fakecloud', diff:'hard', h:10, build(g,top,bot,x){        // 가짜발판 + 분홍구름(공중에서도 죽음) 회피
        for(let r=bot-1;r>top;r--) x.line(r,SOLID);
        x.fakeBand(bot-3);
        for(let c=2;c<=C-2;c++) g[top+3][c]=CLOUD;          // 좌측 구름 벽 → 우측으로 우회
        for(let c=C+2;c<=COLS-3;c++) g[top+3][c]=CLOUD;     // 우측도 구름 → 가운데 통로만
      }},
    { name:'blinknarrow', diff:'hard', h:11, build(g,top,bot,x){      // 좁은 점멸발판 + 별범퍼
        x.line(bot-1,SOLID); x.line(top+1,SOLID);
        for(let r=top+2;r<bot-1;r++) x.bandCols(r,C-1,C+1,VOID);
        for(let r=top+2;r<bot-1;r++){ g[r][C]=( (r%2===0)?BLINK:SOLID ); }
        g[bot-3][C-1]=BUMP; g[top+3][C+1]=BUMP;
      }},
    { name:'spiralforce', diff:'hard', h:11, build(g,top,bot,x){      // 컨베이어 역류 + 가시(거슬러 점프)
        for(let r=bot-1;r>top;r--){ for(let c=C-2;c<=C+2;c++) g[r][c]=CNV_D; } // 아래로 미는 역류
        x.line(bot-1,SOLID); x.line(top+1,SOLID); g[top+2]&&(g[top+2][C]=SOLID);
        for(let r=top+3;r<bot-2;r+=2){ g[r][C-2]=SPIKE; g[r][C+2]=SPIKE; }
      }},
    { name:'gauntlet', diff:'hard', h:12, build(g,top,bot,x){         // 종합: 가짜+구멍+가시 클라이맥스
        x.line(bot-1,SOLID); x.line(top+1,SOLID);
        x.fakeBand(bot-3);
        const gr=Math.floor((top+bot)/2); x.bandCols(gr,1,COLS-2,VOID); for(let c=C-1;c<=C+1;c++) g[gr][c]=SOLID;
        for(let r=top+2;r<gr-1;r+=2){ g[r][C-2]=SPIKE; g[r][C+2]=SPIKE; g[r][C]=SOLID; }
      }},
  ];

  /* ----------------------------- 코스 조립 ------------------------------ */
  function pickSections(rng, ri){
    const easy = SECTIONS.filter(s=>s.diff==='easy');
    const med  = SECTIONS.filter(s=>s.diff==='med');
    const hard = SECTIONS.filter(s=>s.diff==='hard');
    const pick = (arr)=> arr[ri(arr.length)];
    const n = 3 + ri(3);                    // 3~5 구간
    const out = [pick(easy)];               // 1번=쉬움(워밍업)
    let prevHard = false, prevName = out[0].name;
    for(let i=1;i<n-1;i++){
      let cand, tries=0;
      do { const pool = (!prevHard && ri(2)===0) ? hard : med; cand = pick(pool); tries++; }
      while(tries<8 && (cand.name===prevName || (prevHard && cand.diff==='hard')));
      out.push(cand); prevHard = cand.diff==='hard'; prevName = cand.name;
    }
    if(n>=2){ const last = ri(2)===0 ? pick(easy) : pick(med); out.push(last); }   // 마지막=쉬움/중간(역전 여지)
    return out;
  }

  function assemble(specs, seed){
    const rng = mulb(seed); const ri = (n)=>Math.floor(rng()*n);
    const totalSec = specs.reduce((a,s)=>a+s.h,0);
    const ROWS = START_ROWS + totalSec + FINISH_ROWS;
    const grid = [];
    for(let r=0;r<ROWS;r++){ const row=new Array(COLS).fill(VOID); grid.push(row); }
    const entities = [];
    const cps = [];

    // 출발 발판(맨 아래)
    for(let r=ROWS-START_ROWS;r<ROWS;r++) for(let c=1;c<COLS-1;c++) grid[r][c]=START;
    const startR = ROWS-2, startC = C;
    cps.push({ r: ROWS-START_ROWS, c: C });

    // 구간들(아래→위)
    const ctxFor = (course)=>({
      rng, ri,
      line:(r,v)=>{ if(r<0||r>=ROWS) return; for(let c=1;c<COLS-1;c++) grid[r][c]=v; },
      bandCols:(r,c0,c1,v)=>{ if(r<0||r>=ROWS) return; for(let c=Math.max(1,c0);c<=Math.min(COLS-2,c1);c++) grid[r][c]=v; },
      band:(r0,r1,v)=>{ for(let r=r0;r<=r1;r++){ if(r<0||r>=ROWS) continue; for(let c=1;c<COLS-1;c++) grid[r][c]=v; } },
      cell:(r,c,v)=>{ if(r>=0&&r<ROWS&&c>=1&&c<COLS-1) grid[r][c]=v; },
      fakeBand:(r)=>fakeBand(grid, r, rng),
      ri,
    });
    const course = { entities };
    let nextBottom = ROWS - START_ROWS - 1;
    const labels = [];
    for(const s of specs){
      const top = nextBottom - s.h + 1;
      for(let r=top;r<=nextBottom;r++) for(let c=1;c<COLS-1;c++) grid[r][c]=SOLID;  // 바탕 통로
      for(let c=1;c<COLS-1;c++){ grid[nextBottom][c]=CP; grid[top][c]=SOLID; }      // 입구=체크포인트, 출구=통로
      s.build(grid, top, nextBottom, ctxFor(course), course);
      // 입출구 행은 항상 단단히(빌더가 덮었어도 복구)
      for(let c=1;c<COLS-1;c++){ if(grid[nextBottom][c]!==CP) grid[nextBottom][c]=CP; if(!SOLIDISH.has(grid[top][c])) grid[top][c]=SOLID; }
      cps.push({ r: nextBottom, c: C });
      labels.push(s.name+'('+s.diff+')');
      nextBottom = top - 1;
    }

    // 결승 통로(맨 위): 중앙 3열만 단단, 양옆 허공 → 정렬 요구
    const goalR = 0, goalC = C;
    for(let r=0;r<FINISH_ROWS;r++){ for(let c=1;c<COLS-1;c++) grid[r][c]=VOID; for(let c=C-1;c<=C+1;c++) grid[r][c]=SOLID; }
    grid[goalR][goalC] = GOAL;

    return { grid, cps, startR, startC, goalR, goalC, rows:ROWS, entities, labels, seed };
  }

  // 가짜발판 띠: 진짜칸 최소 2개만 보장(중앙도 가짜일 수 있음=진짜 복불복), ~50% 가짜
  function fakeBand(grid, r, rng){
    if(r<0||r>=grid.length) return;
    const inner=[]; for(let c=1;c<COLS-1;c++) inner.push(c);
    const sh=inner.slice();
    for(let i=sh.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=sh[i]; sh[i]=sh[j]; sh[j]=t; }
    const safe=new Set([sh[0], sh[1]]);                // 임의 2칸만 항상 진짜(어디가 안전한지 모름)
    for(const c of inner){ if(!safe.has(c) && rng()<0.5) grid[r][c]=FAKE; }
  }

  function mulb(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

  // BFS 완주가능성: 출발→결승 도달 가능? (점프/대시 사거리 보수적 모델)
  function reachable(grid, sR, sC, gR, gC){
    const ROWS=grid.length;
    const key=(r,c)=>r*COLS+c;
    const safe=(r,c)=> r>=0&&r<ROWS&&c>=0&&c<COLS && BFS_SAFE.has(grid[r][c]);
    if(!safe(sR,sC)) return false;
    const seen=new Set([key(sR,sC)]); const q=[[sR,sC]];
    while(q.length){
      const [r,c]=q.shift();
      if(r<=gR && Math.abs(c-gC)<=1) return true;
      // 후보: 보행(맨해튼1) + 직선점프(≤5) + 대각도약(맨해튼≤4)
      for(let dr=-5;dr<=5;dr++) for(let dc=-5;dc<=5;dc++){
        if(dr===0&&dc===0) continue;
        const md=Math.abs(dr)+Math.abs(dc);
        const straight=(dr===0||dc===0)&&Math.max(Math.abs(dr),Math.abs(dc))<=5;
        if(!straight && md>4) continue;
        const r2=r+dr, c2=c+dc; if(!safe(r2,c2)) continue;
        const k=key(r2,c2); if(seen.has(k)) continue; seen.add(k); q.push([r2,c2]);
      }
    }
    return false;
  }

  function buildCourse(M){
    const seed = ((M.state && M.state.seed) || 1) >>> 0;
    const rng = mulb(seed); const ri=(n)=>Math.floor(rng()*n);
    for(let attempt=0; attempt<6; attempt++){
      const specs = (attempt<5) ? pickSections(rng, ri)
                                : [SECTIONS[0], SECTIONS[1], SECTIONS[0]];   // 폴백=전부 쉬움
      const c = assemble(specs, (seed ^ (attempt*0x9e3779b1)) >>> 0);
      if(reachable(c.grid, c.startR, c.startC, c.goalR, c.goalC)) return c;
    }
    return assemble([SECTIONS[0], SECTIONS[1], SECTIONS[0]], seed);
  }

  /* ----------------------------- 판정 헬퍼 ------------------------------ */
  function isSupport(grid, px, py, t, trig){
    const c=colAt(px), r=rowAt(py); const v=gridV(grid,r,c);
    if(v===VOID) return false;
    if(v===FAKE) return !trig[r*COLS+c];
    if(v===BLINK) return blinkOn(t);
    if(v===CLOUD || v===KILL) return false;   // 죽는 발판 위엔 못 섬
    if(v===SPIKE) return true;                 // 가시는 발판(솟으면 죽지만 디딤은 됨)
    return SOLIDISH.has(v);
  }
  function progOfY(course, y){
    const sY=cy(course.startR), gY=cy(course.goalR);
    return clamp((sY-y)/(sY-gY),0,1)*PROG_MAX;
  }

  /* ----------------------------- 모듈 ----------------------------------- */
  const race = {
    label: '운빨 대시',

    init(M){
      M.course = buildCourse(M);
      M._trig = {};
      M._peerProg = {}; M._peerFin = {};
      const sc=M.course.startC, sr=M.course.startR;
      M.local = M.amSpectator ? null : {
        x:cx(sc), y:cy(sr), z:0, dir:{x:0,y:-1},
        air:false, airUntil:0, jumpAt:0, dashed:false, jumpReadyAt:0, dashBuf:false,
        vx:0, vy:0, speedUntil:0, stunUntil:0, slideX:0, slideY:0,
        cpR:sr, cpC:sc, prog:0, bestProg:0, fin:false, finished:false, finT:0, _appended:false,
      };
    },

    step(M, dt){
      const L=M.local; if(!L || L.finished) return;
      const t=M.simT();
      if(t < START_MS){ L.vx=L.vy=0; return; }    // 카운트다운 중 입력 잠금
      const grid=M.course.grid, trig=M._trig;
      if(t < L.stunUntil){ if(M.input.action) L.dashBuf=true; return; }

      // 입력 방향(8방향)
      let dx=clamp(M.input.dx,-1,1), dy=clamp(M.input.dy,-1,1);
      const mag=Math.hypot(dx,dy); if(mag>1){ dx/=mag; dy/=mag; }
      if(mag>0.05){ L.dir.x=dx/(mag||1); L.dir.y=dy/(mag||1); }

      // 스킬버튼: 지상=점프 / 공중=대시(점프당 1회). 입력버퍼로 빡빡함 제거.
      const wantAct = M.input.action || L.dashBuf;
      if(wantAct){
        if(!L.air && t>=L.jumpReadyAt){
          L.air=true; L.jumpAt=t; L.airUntil=t+JUMP_MS; L.dashed=false; L.dashBuf=false;
          const sp=(t<L.speedUntil?SPEED_MUL:1)*JUMP_SPD;
          L.vx=L.dir.x*sp; L.vy=L.dir.y*sp;
          if(!M.lowPower) M.vibrate(10);
        } else if(L.air && !L.dashed && t>=L.jumpAt+DASH_GAP){
          L.dashed=true; L.airUntil=t+DASH_MS; L.dashBuf=false;
          const d = mag>0.05 ? {x:dx,y:dy} : {x:L.dir.x,y:L.dir.y};
          const sp=(t<L.speedUntil?SPEED_MUL:1)*DASH_SPD;
          L.vx=d.x*sp; L.vy=d.y*sp;
          if(!M.lowPower) M.vibrate(16);
        } else if(L.air && L.dashed && M.input.action){
          // 대시 이미 씀: 다음 점프용으로 버퍼(착지 직후 발동)
          L.dashBuf=true;
        } else if(!L.air && t<L.jumpReadyAt && M.input.action){
          L.dashBuf=true;
        }
      }

      if(L.air){
        L.x+=L.vx*dt; L.y+=L.vy*dt;
        L.x=clamp(L.x, TILE+PR, (COLS-1)*TILE-PR);
        L.y=clamp(L.y, PR, M.course.rows*TILE-PR);
        const dur=L.airUntil-L.jumpAt;
        const k=clamp((t-L.jumpAt)/(dur||1),0,1);
        L.z=Math.sin(k*Math.PI)*(L.dashed?24:16);
        // 공중에서도 죽는 분홍구름/가시 솟음/이동 톱날 판정
        airHazard(M,L,grid,t);
        if(L.finished) return;
        if(t>=L.airUntil){                       // 착지 → 타일 중심 스냅(1칸 정밀)
          L.air=false; L.z=0;
          const col=clamp(Math.round((L.x-TILE/2)/TILE),1,COLS-2);
          const row=clamp(Math.round((L.y-TILE/2)/TILE),0,M.course.rows-1);
          L.x=cx(col); L.y=cy(row);
          L.jumpReadyAt=t+JUMP_CD; if(L.dashed) L.stunUntil=Math.max(L.stunUntil,t+LAND_STUN);
          resolveGround(M,L,grid,trig,t,true);
        }
      } else {
        // 지상 이동(얼음=미끄럼 관성)
        const onIce = gridV(grid,rowAt(L.y),colAt(L.x))===ICE;
        const sped=(t<L.speedUntil?SPEED_MUL:1)*WALK;
        if(onIce){
          L.slideX += (dx*sped - L.slideX)*0.06; L.slideY += (dy*sped - L.slideY)*0.06;
          L.x+=L.slideX*dt; L.y+=L.slideY*dt;
        } else {
          L.slideX=L.slideY=0;
          L.x+=dx*sped*dt; L.y+=dy*sped*dt;
          if(mag<0.05){ const tc=cx(clamp(colAt(L.x),1,COLS-2)); L.x+=(tc-L.x)*0.12; } // idle 열 정렬
        }
        L.x=clamp(L.x, TILE+PR, (COLS-1)*TILE-PR);
        L.y=clamp(L.y, PR, M.course.rows*TILE-PR);
        resolveGround(M,L,grid,trig,t,false);
      }

      // 진행/결승 — 실제 결승 통로(goalR 도달 + goalC 정렬)만 인정
      L.prog=progOfY(M.course,L.y);
      if(L.prog>L.bestProg) L.bestProg=L.prog;
      if(!L.fin && rowAt(L.y)<=M.course.goalR && Math.abs(colAt(L.x)-M.course.goalC)<=1){
        L.fin=true; L.finished=true; L.finT=t; L.bestProg=PROG_MAX;
        if(!L._appended){ L._appended=true; M.flash('골인! 🍯'); try{ M.appendFinish({seat:M.mySeat, timeMs:Math.round(t)}); }catch(e){} }
      }
    },

    draw(M){ drawRace(M); },

    hud(M){
      const L=M.local; const myProg=L?L.bestProg:0;
      const rank=estimateRank(M,myProg); const pct=Math.round(myProg/PROG_MAX*100);
      const t=M.simT();
      const fin=(M.state&&M.state.finishOrder)||[];
      let timerTxt;
      if(t<START_MS){ timerTxt='출발 대기'; }
      else if(fin.length>=1){ const f0=Math.min.apply(null,fin.map(f=>f.timeMs)); timerTxt=`<b>마감 ${(Math.max(0,CUTOFF_MS-(t-f0))/1000).toFixed(1)}s</b>`; }
      else timerTxt=`${Math.max(0,(t-START_MS)/1000).toFixed(1)}s`;
      const stateTxt = L&&L.fin ? '🏁 완주' : (L&&t<L.stunUntil&&t>=START_MS ? '💫 추락' : `진행 ${pct}%`);
      let skillTxt='';
      if(L&&!L.fin&&t>=START_MS){
        if(L.air) skillTxt = L.dashed ? '대시!' : '점프 — ⚡한번 더 대시';
        else skillTxt = t>=L.jumpReadyAt ? '점프 ⚡준비' : `점프 ${Math.max(0,(L.jumpReadyAt-t)/1000).toFixed(1)}s`;
      }
      return `<div class="mini-hud__row"><span>순위 <b>${rank}</b>/${M.n}</span>`
        + `<span>${stateTxt}</span>` + (skillTxt?`<span>${skillTxt}</span>`:'')
        + `<span>${timerTxt}</span></div>`;
    },

    netPayload(M){ const L=M.local; if(!L) return null;
      return { x:Math.round(L.x), y:Math.round(L.y), z:Math.round(L.z), prog:Math.round(L.bestProg), fin:!!L.fin }; },
    onPeer(M,seat,msg){ if(msg&&msg.prog!=null) M._peerProg[seat]=Math.max(M._peerProg[seat]||0,msg.prog); if(msg&&msg.fin) M._peerFin[seat]=true; },
    actionLabel(){ return '점프'; },

    hostTick(M){
      if(M._ended) return;
      const fin=(M.state&&M.state.finishOrder)||[];
      if(M.simT()>=HARD_LIMIT_MS){ M.endGame(); return; }     // 교착 방지 절대 상한
      if(fin.length===0) return;
      if(new Set(fin.map(f=>f.seat)).size>=M.n){ M.endGame(); return; }
      const f0=Math.min.apply(null,fin.map(f=>f.timeMs));
      if(M.simT()-f0>=CUTOFF_MS) M.endGame();
    },

    finishPatch(M){
      const ranks={};
      const fin=((M.state&&M.state.finishOrder)||[]).slice().sort((a,b)=>(a.timeMs-b.timeMs)||(a.seat-b.seat));
      const seen=new Set(); const finished=[];
      for(const f of fin){ if(!f||f.seat==null||seen.has(f.seat)||M.seats.indexOf(f.seat)<0) continue; seen.add(f.seat); finished.push(f.seat); }
      const progOf=(s)=>{ if(s===M.mySeat&&M.local) return M.local.bestProg||0; return (M._peerProg&&M._peerProg[s])||0; };
      const rest=M.seats.filter(s=>!seen.has(s)).sort((a,b)=>(progOf(b)-progOf(a))||(a-b));
      let r=1; for(const s of finished) ranks[s]=r++; for(const s of rest) ranks[s]=r++;
      for(const s of M.seats) if(ranks[s]==null) ranks[s]=r++;
      return { ranks };
    },
  };

  /* ----------------------------- 지상 판정 ------------------------------ */
  function resolveGround(M,L,grid,trig,t,landed){
    const c=colAt(L.x), r=rowAt(L.y); const v=gridV(grid,r,c);

    if(v===TRAMP){ L.air=true; L.jumpAt=t; L.airUntil=t+JUMP_MS+DASH_MS; L.dashed=true;
      L.vx=L.dir.x*JUMP_SPD*0.4; L.vy=-Math.abs(JUMP_SPD); return; }   // 위로 연속 바운스
    if(v===BOUNCE){ L.air=true; L.jumpAt=t; L.airUntil=t+JUMP_MS; L.dashed=false;
      L.vx=L.dir.x*JUMP_SPD; L.vy=-Math.abs(JUMP_SPD); return; }       // 단발 튕김(전방+위)
    if(isArrow(v)){ const d=DIRV[v]; L.air=true; L.jumpAt=t; L.airUntil=t+JUMP_MS+DASH_MS; L.dashed=true;
      L.vx=d[0]*DASH_SPD; L.vy=d[1]*DASH_SPD; return; }                // 점프대 런치
    if(v===BUMP){ L.y=Math.min(M.course.rows*TILE-PR, L.y+2*TILE); L.x=clamp(L.x,TILE+PR,(COLS-1)*TILE-PR);
      L.stunUntil=t+BUMP_STUN; L.vx=L.vy=0;
      if(!isSupport(grid,L.x,L.y,t,trig)) return fall(M,L,t); return; } // 뒤로 2칸 후 재판정
    if(v===PALM){ if(palmShut(t, ((r*7+c*13)%5)*340)){ L.y=Math.min(M.course.rows*TILE-PR, L.y+2*TILE); L.stunUntil=t+BUMP_STUN; L.vx=L.vy=0;
        if(!M.lowPower) M.vibrate(20); if(!isSupport(grid,L.x,L.y,t,trig)) return fall(M,L,t); } return; }
    if(v===SPEED) L.speedUntil=t+SPEED_MS;
    if(isConvey(v)){ const d=DIRV[v]; L.x+=d[0]*0.05*TILE; L.y+=d[1]*0.05*TILE;
      L.x=clamp(L.x,TILE+PR,(COLS-1)*TILE-PR); L.y=clamp(L.y,PR,M.course.rows*TILE-PR); }

    // 추락/죽음 판정
    if(v===KILL || v===CLOUD) return fall(M,L,t);                      // 죽는 발판
    if(v===SPIKE && spikeUp(t,((r*5+c*11)%4)*350)) return fall(M,L,t); // 가시 솟음
    let solid;
    if(v===FAKE){ trig[r*COLS+c]=true; solid=false; }
    else if(v===VOID) solid=false;
    else if(v===BLINK) solid=blinkOn(t);
    else solid=SOLIDISH.has(v);
    if(!solid) return fall(M,L,t);

    // 체크포인트(진행기반): 더 전진한 체크포인트 행에 단단히 서면 저장
    for(const cp of M.course.cps) if(r<=cp.r && cp.r<L.cpR){ L.cpR=cp.r; L.cpC=cp.c; }
  }

  function airHazard(M,L,grid,t){
    const c=colAt(L.x), r=rowAt(L.y); const v=gridV(grid,r,c);
    if(v===CLOUD){ return fall(M,L,t); }                              // 분홍구름=공중에서도 죽음
    // 이동 톱날(지상 블레이드)은 공중이면 안전 → 여기선 미판정. 컨베이어/가시 등은 착지 시 판정.
    sawHit(M,L,t,false);
  }
  function sawHit(M,L,t,grounded){
    const ents=M.course.entities; if(!ents||!ents.length) return;
    for(const e of ents){ if(e.kind!=='saw') continue;
      if(L.air) continue;                                             // 점프로 톱날 회피
      if(rowAt(L.y)!==e.row) continue;
      const fr=(Math.sin(2*Math.PI*((t+e.ph)/e.period))+1)/2;
      const col=e.c0+fr*(e.c1-e.c0);
      if(Math.abs(L.x-cx(col))<TILE*0.6){ return fall(M,L,t); }
    }
  }
  function fall(M,L,t){
    L.x=cx(L.cpC); L.y=cy(L.cpR); L.z=0; L.air=false; L.dashed=false; L.vx=L.vy=0; L.slideX=L.slideY=0;
    L.stunUntil=t+STUN_MS; L.speedUntil=0;
    M.flash('💫 추락! 체크포인트로'); if(!M.lowPower) M.vibrate(28);
  }

  /* ----------------------------- 순위 추정 ------------------------------ */
  function estimateRank(M,myProg){
    let ahead=0; const fin=new Set(((M.state&&M.state.finishOrder)||[]).map(f=>f.seat));
    const myFin=M.local&&M.local.fin;
    for(const seat of M.seats){ if(seat===M.mySeat) continue;
      const pr=(M._peerProg&&M._peerProg[seat])||0; const pf=fin.has(seat)||(M._peerFin&&M._peerFin[seat]);
      if(pf && !myFin) ahead++; else if(!pf && pr>myProg) ahead++;
    }
    return ahead+1;
  }

  /* ----------------------------- 그리기 -------------------------------- */
  function drawRace(M){
    const ctx=M.ctx, W=M.W, H=M.H; if(!M.course) return;
    const grid=M.course.grid, t=M.simT();
    const Z=M.lowPower?1.2:1.4;
    const L=M.local;
    const camX=L?L.x:cx(M.course.goalC), camY=L?L.y:cy(M.course.goalR+5);
    const cx0=W*0.5, cy0=H*0.62;
    const sx=(wx)=>Math.round((wx-camX)*Z+cx0), sy=(wy)=>Math.round((wy-camY)*Z+cy0);
    const TZ=TILE*Z;

    ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,W,H);
    const halfW=(W*0.5)/Z+TILE, halfUp=(H*0.62)/Z+TILE, halfDn=(H*0.38)/Z+TILE;
    const c0=Math.max(0,colAt(camX-halfW)), c1=Math.min(COLS-1,colAt(camX+halfW));
    const r0=Math.max(0,rowAt(camY-halfUp)), r1=Math.min(M.course.rows-1,rowAt(camY+halfDn));
    const bOn=blinkOn(t);
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) drawTile(ctx, sx(c*TILE), sy(r*TILE), TZ, grid[r][c], r, c, M._trig, bOn, t, M.lowPower);
    drawGoalLine(M,ctx,sx,sy,TZ);
    drawEntities(M,ctx,sx,sy,TZ,t);

    for(const seat of M.seats){ if(seat===M.mySeat) continue;
      const p=M.peerAt(seat); if(!p||p.x==null) continue;
      const px=sx(p.x), py=sy(p.y)-(p.z||0)*Z; if(px<-50||px>W+50||py<-50||py>H+50) continue;
      drawRunner(ctx,sx(p.x),sy(p.y),p.z||0,seat,!!p.fin,false,false,Z); }
    if(L) drawRunner(ctx,sx(L.x),sy(L.y),L.z,M.mySeat,L.fin,true,t<L.stunUntil&&t>=START_MS,Z);

    if(!M.lowPower){ const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'rgba(6,8,14,0.4)'); g.addColorStop(0.5,'rgba(6,8,14,0)'); g.addColorStop(1,'rgba(6,8,14,0.3)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }

    if(t<START_MS) drawCountdown(ctx,W,H,t);
  }

  function drawTile(ctx,X,Y,TZ,v,r,c,trig,bOn,t,low){
    const broken=(v===FAKE&&trig[r*COLS+c]);
    if(v===VOID||broken){ ctx.fillStyle='#05070d'; ctx.fillRect(X,Y,Math.ceil(TZ),Math.ceil(TZ));
      ctx.strokeStyle='rgba(34,48,72,0.45)'; ctx.lineWidth=1; ctx.strokeRect(X+0.5,Y+0.5,TZ-1,TZ-1); return; }
    let fill='#26384f', edge='#3a5a86', icon='';
    switch(v){
      case GOAL:  fill='#274d2c'; edge='#46c25a'; break;
      case START: fill='#23314a'; edge='#4a6aa0'; break;
      case CP:    fill='#1e3a4d'; edge='#39c6c0'; icon='✦'; break;
      case SPEED: fill='#5a4410'; edge='#ffcb3a'; icon='»'; break;
      case BLINK: fill=bOn?'#3a2e55':'#0f0e1a'; edge=bOn?'#b07cff':'#241f38'; break;
      case ICE:   fill='#1d3f57'; edge='#7fd6ff'; break;
      case BOUNCE:fill='#5a2347'; edge='#ff79c6'; icon='◓'; break;
      case TRAMP: fill='#21305e'; edge='#5d7bff'; icon='▲'; break;
      case BUMP:  fill='#4a2030'; edge='#ff6fae'; icon='★'; break;
      case KILL:  fill='#5a1f3a'; edge='#ff4d8d'; icon='☻'; break;   // 광대(점프로 회피)
      case CLOUD: fill='#7a2d63'; edge='#ff8fd6'; icon='✜'; break;   // 분홍구름(공중도 죽음)
      case SPIKE: { const up=spikeUp(t,((r*5+c*11)%4)*350); fill=up?'#5a1b1b':'#2a2024'; edge=up?'#ff5252':'#5a3a3a'; icon=up?'▴':''; break; }
      case PALM:  { const sh=palmShut(t,((r*7+c*13)%5)*340); fill=sh?'#5a3a1a':'#3a3320'; edge=sh?'#ffb454':'#caa860'; icon=sh?'✊':'✋'; break; }
      default:
        if(isConvey(v)){ fill='#243a3a'; edge='#5fd0a0'; icon=v===CNV_U?'↑':v===CNV_D?'↓':v===CNV_L?'←':'→'; }
        else if(isArrow(v)){ fill='#26405a'; edge='#6fb6ff'; icon=v===ARR_U?'⇑':v===ARR_D?'⇓':v===ARR_L?'⇐':'⇒'; }
    }
    ctx.fillStyle=fill; ctx.fillRect(X+1,Y+1,TZ-1,TZ-1);
    ctx.strokeStyle=edge; ctx.lineWidth=1; ctx.strokeRect(X+0.5,Y+0.5,TZ-1,TZ-1);
    if(icon){ ctx.fillStyle=edge; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`${Math.round(TZ*0.5)}px system-ui,sans-serif`; ctx.fillText(icon, X+TZ/2, Y+TZ/2+1); }
  }

  function drawEntities(M,ctx,sx,sy,TZ,t){
    const ents=M.course.entities; if(!ents) return;
    for(const e of ents){ if(e.kind!=='saw') continue;
      const fr=(Math.sin(2*Math.PI*((t+e.ph)/e.period))+1)/2; const col=e.c0+fr*(e.c1-e.c0);
      const X=sx(cx(col)), Y=sy(cy(e.row)), R=TZ*0.42;
      ctx.save(); ctx.translate(X,Y); ctx.rotate((t/120)%(Math.PI*2));
      ctx.fillStyle='#c9ccd6'; ctx.strokeStyle='#7a7f8c'; ctx.lineWidth=2;
      ctx.beginPath(); for(let i=0;i<8;i++){ const a=i/8*Math.PI*2; const rr=i%2?R:R*0.6; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); } ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.fillStyle='#41454f'; ctx.beginPath(); ctx.arc(0,0,R*0.28,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  }

  function drawGoalLine(M,ctx,sx,sy,TZ){
    const y=sy(M.course.goalR*TILE); const cell=Math.max(6,Math.round((TZ||TILE)/2));
    const x0=sx((C-1)*TILE), x1=sx((C+2)*TILE);
    for(let x=x0;x<x1;x+=cell){ const k=Math.floor((x-x0)/cell)%2;
      ctx.fillStyle=k===0?'#eef1f6':'#11151d'; ctx.fillRect(x,y,cell,cell);
      ctx.fillStyle=k===0?'#11151d':'#eef1f6'; ctx.fillRect(x,y+cell,cell,cell); }
    ctx.fillStyle='#ffd54a'; ctx.font=`bold ${Math.round(cell*1.6)}px system-ui`; ctx.textAlign='center';
    ctx.fillText('🍯', sx(M.course.goalC*TILE)+TZ/2, y-cell);
  }

  function drawRunner(ctx,cx0,cy0,z,seat,fin,isMe,stunned,scale){
    const r=(PR+3)*(scale||1); const yy=cy0-z*(scale||1);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath();
    ctx.ellipse(cx0,cy0+r*0.5,r*(1-z/60),r*0.4*(1-z/90),0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=stunned?0.5:1; ctx.beginPath(); ctx.arc(cx0,yy,r,0,Math.PI*2);
    ctx.fillStyle=seatColor(seat); ctx.fill();
    ctx.lineWidth=isMe?3:2; ctx.strokeStyle=isMe?'#fff':'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.fillStyle='#0b0e14'; ctx.font=`bold ${Math.round(r*1.05)}px system-ui,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(seat),cx0,yy+1);
    ctx.globalAlpha=1;
    if(fin){ ctx.fillStyle='#ffd54a'; ctx.beginPath(); ctx.arc(cx0+r,yy-r,3,0,Math.PI*2); ctx.fill(); }
  }

  function drawCountdown(ctx,W,H,t){
    ctx.fillStyle='rgba(6,8,14,0.45)'; ctx.fillRect(0,0,W,H);
    const phase=t/1000;                  // 0..3.6
    let txt, sub='준비!', col='#ffd54a';
    if(phase<1){ txt='3'; col='#ff6f6f'; } else if(phase<2){ txt='2'; col='#ffb454'; }
    else if(phase<3){ txt='1'; col='#ffe066'; } else { txt='GO!'; col='#5fe08a'; sub='출발!'; }
    const frac=phase-Math.floor(phase); const punch=1+Math.max(0,(1-frac*4))*0.5;
    if(phase>=3 && frac<0.1){ ctx.fillStyle='rgba(255,255,255,'+(0.5-frac*5)+')'; ctx.fillRect(0,0,W,H); }
    ctx.save(); ctx.translate(W/2,H*0.45); ctx.scale(punch,punch);
    ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`900 ${Math.round(Math.min(W,H)*0.34)}px system-ui,sans-serif`;
    ctx.fillText(txt,0,0); ctx.restore();
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.textAlign='center';
    ctx.font=`700 ${Math.round(Math.min(W,H)*0.05)}px system-ui,sans-serif`;
    ctx.fillText(sub, W/2, H*0.45+Math.min(W,H)*0.22);
  }

  const SEATC=['#4f9dff','#ff5d5d','#43d18b','#f6c544','#b07cff','#ff8c42','#3ad0d6','#ff6fae'];
  function seatColor(s){ return SEATC[((s||1)-1)%SEATC.length]; }

  // 헤드리스 검증용 노출
  race._buildCourse=buildCourse; race._reachable=reachable; race._assemble=assemble; race._SECTIONS=SECTIONS;

  window.MiniGames.race = race;
})();
