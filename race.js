/* =========================================================================
   race.js — 운빨 대시 (좀비고 "서바이벌 서커스" 식 2D 톱다운 장애물 레이스, 2~8인)
   window.MiniGames.race 로 등록. 자급자족 단일 파일.

   레퍼런스(좀비고 서바이벌 서커스):
   - 십자키 이동 + 스킬버튼 1개: 1번 누름=점프, 점프 중 1번 더=대시(이단). 점프↔대시 짧은 쿨타임.
   - 점프/대시로 함정·구멍을 "넘어" 통과(공중엔 안전). 착지 지점이 함정/구멍이면 추락.
   - 속임수 발판(가짜): 멀쩡한 바닥처럼 보이지만 밟으면 빠짐 → 직전 체크포인트로 복귀(운=복불복).
   - 장애물: 구멍(점프로 건너기)·트램펄린(튕겨 올림)·별 범퍼(뒤로 밀림)·속도 발판·사라지는 발판.
   - 결승(헌니버터칩)까지 먼저 도착하면 승리. 추락은 시간 손해만(탈락 없음).

   맵은 seed 로 매판 새로 생성(전 클라 동일). 시작=아래, 결승=위. 카메라가 내 캐릭터 추적.

   mini-core 계약: init/step/draw/hud/netPayload/onPeer/actionLabel/hostTick/finishPatch.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  /* ----------------------------- 그리드/코스 상수 ------------------------ */
  const TILE = 30;                 // 타일 한 변(px)
  const COLS = 13;                 // 가로 칸(가장자리 col0/COLS-1 = 허공 경계)
  const ZONES = 8;                 // 장애물 구역 수(아래→위)
  const ZH = 6;                    // 한 구역 높이(칸)
  const ROWS = 4 + ZONES * (ZH + 1) + 2;  // 시작대(4) + 구역들(각 ZH + 체크포인트1) + 결승(2)
  const PR = 9;                    // 캐릭터 반지름(px)
  const CUTOFF_MS = 22000;         // 첫 골인 후 마감(ms)

  // 타일 종류
  const VOID = 0, SOLID = 1, FAKE = 2, TRAMP = 3, BUMP = 4, SPEED = 5, BLINK = 6, GOAL = 9;

  // 운동 파라미터(고정스텝 dt=ms) — 플레이로 미세조정 가능
  const WALK      = 0.080;         // 걷기 이속(px/ms)
  const AIR_SPD   = 0.165;         // 점프 중 수평 이속(공중 컨트롤)
  const DASH_SPD  = 0.300;         // 대시 중 수평 이속
  const JUMP_AIR  = 470;           // 점프 체공(ms)
  const DASH_EXT  = 150;           // 대시 시 체공 연장(ms)
  const DASH_GAP  = 110;           // 점프 후 대시까지 최소 간격(ms)
  const JUMP_CD   = 280;           // 착지 후 다음 점프까지 쿨다운(ms)
  const STUN_MS   = 650;           // 추락 후 부활 경직(ms)
  const SPEED_MS  = 1500;          // 속도 발판 지속(ms)
  const BLINK_MS  = 1400;          // 사라지는 발판 주기(ms, 절반은 사라짐)

  /* ----------------------------- 결정론 코스 생성 ----------------------- */
  // 기본은 통로(SOLID)로 채우고, 구역마다 함정 패턴을 "깎아" 넣는다(=항상 완주 가능, 함정은 점프로 회피).
  function buildCourse(M) {
    const seed = ((M.state && M.state.seed) || 1) >>> 0;
    const rnd = M.rng(seed);
    const ri = (n) => Math.floor(rnd() * n);

    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = new Array(COLS).fill(VOID);
      for (let c = 1; c < COLS - 1; c++) row[c] = SOLID;   // 안쪽은 통로, 양끝은 허공(경계)
      grid.push(row);
    }
    const cps = [{ r: ROWS - 3, c: (COLS - 1) >> 1 }];     // 시작 체크포인트
    const KINDS = ['gap', 'fake', 'bumper', 'speed', 'blink', 'tramp', 'fakegap'];

    let r = ROWS - 5;                                       // 시작대(맨 아래 4행) 위부터 구역 배치
    for (let z = 0; z < ZONES && r > 4; z++) {
      const top = Math.max(3, r - ZH + 1);
      // seed 로 패턴 선택(연속 중복 회피로 변별↑)
      let kind = KINDS[ri(KINDS.length)];
      carveZone(grid, top, r, kind, rnd, ri);
      r = top - 1;
      if (r > 3) { for (let c = 1; c < COLS - 1; c++) grid[r][c] = SOLID; cps.push({ r, c: (COLS - 1) >> 1 }); r -= 1; }
    }
    // 결승(맨 위)
    for (let rr = Math.max(1, r); rr >= 1; rr--) for (let c = 1; c < COLS - 1; c++) grid[rr][c] = SOLID;
    const goalC = (COLS - 1) >> 1;
    grid[1][goalC] = GOAL;
    return { seed, grid, cps, startC: (COLS - 1) >> 1, startR: ROWS - 3, goalR: 1, goalC };
  }

  // 구역(행 top..bot)에 함정 패턴을 깎는다. 함정 폭은 점프로 넘을 수 있게 제한.
  function carveZone(grid, top, bot, kind, rnd, ri) {
    const setRow = (r, v) => { for (let c = 1; c < COLS - 1; c++) grid[r][c] = v; };
    const band = (r0, r1, v) => { for (let r = r0; r <= r1; r++) setRow(r, v); };
    const midRow = top + ((bot - top) >> 1);
    switch (kind) {
      case 'gap': {                       // 구멍: 1~2칸 허공 → 점프로 건너기
        const h = 1 + ri(2);
        band(midRow, Math.min(bot - 1, midRow + h - 1), VOID);
        break;
      }
      case 'fake': {                       // 속임수 발판: 진짜/가짜 섞인 띠(밟으면 빠짐, 안전칸 존재=복불복)
        fakeMix(grid, midRow, rnd);
        if (ri(2)) fakeMix(grid, Math.min(bot - 1, midRow + 1), rnd);
        break;
      }
      case 'fakegap': {                    // 가짜 섞인 띠 + 위쪽 구멍
        fakeMix(grid, midRow, rnd);
        setRow(Math.max(top, midRow - 2), VOID);
        break;
      }
      case 'bumper': {                     // 별 범퍼 흩뿌리기(닿으면 뒤로)
        const n = 2 + ri(3);
        for (let i = 0; i < n; i++) { const rr = top + ri(bot - top + 1); const cc = 1 + ri(COLS - 2); grid[rr][cc] = BUMP; }
        break;
      }
      case 'speed': {                      // 속도 발판 줄 + 위쪽 구멍(가속해서 점프)
        const cc = 2 + ri(COLS - 4);
        for (let r = top; r <= bot; r++) grid[r][cc] = SPEED;
        setRow(top, VOID);
        break;
      }
      case 'blink': {                      // 사라지는 발판 띠(주기적으로 허공)
        setRow(midRow, BLINK);
        if (ri(2)) setRow(Math.min(bot - 1, midRow + 1), BLINK);
        break;
      }
      case 'tramp': {                      // 트램펄린(밟으면 위로 튕김) + 위 구멍
        const cc = (COLS - 1) >> 1;
        grid[bot][cc] = TRAMP;
        band(top, midRow, VOID);
        // 양옆 우회 통로 보장(트램펄린 못 타도 통과 가능)
        for (let r = top; r <= bot; r++) { grid[r][1] = SOLID; grid[r][COLS - 2] = SOLID; }
        break;
      }
    }
  }

  // 한 행을 진짜/가짜 섞기: ~45% 가짜, 진짜 칸 최소 2개 보장(안전 통로 존재 — 복불복)
  function fakeMix(grid, r, rnd) {
    const inner = []; for (let c = 1; c < COLS - 1; c++) inner.push(c);
    const sh = inner.slice();
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = sh[i]; sh[i] = sh[j]; sh[j] = tmp; }
    const safe = new Set([sh[0], sh[1]]);               // 항상 진짜로 남길 안전칸 2개
    for (const c of inner) { if (!safe.has(c) && rnd() < 0.5) grid[r][c] = FAKE; }
  }

  /* ----------------------------- 좌표/판정 ------------------------------ */
  function cx(c) { return Math.round((c + 0.5) * TILE); }
  function cy(r) { return Math.round((r + 0.5) * TILE); }
  function colAt(px) { return Math.floor(px / TILE); }
  function rowAt(py) { return Math.floor(py / TILE); }
  function tileAt(grid, px, py) {
    const c = colAt(px), r = rowAt(py);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return VOID;
    return grid[r][c];
  }
  // BLINK 발판이 지금 "있는" 상태인가(주기). solidPhase=true 면 디딤 가능.
  function blinkSolid(t) { return (Math.floor(t / BLINK_MS) % 2) === 0; }
  // 디딜 수 있는 바닥인가(추락 판정용). 공중(airborne)일 땐 호출 안 함.
  function isSupport(grid, px, py, t, triggered) {
    const c = colAt(px), r = rowAt(py);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const v = grid[r][c];
    if (v === VOID) return false;
    if (v === FAKE) { return !triggered[r * COLS + c]; }     // 한 번 깨진 가짜는 영구 구멍
    if (v === BLINK) return blinkSolid(t);
    return true;                                             // SOLID/TRAMP/BUMP/SPEED/GOAL
  }
  // 진행도(시작행→결승행, 위로 갈수록 큼)
  const PROG_MAX = 1000;
  function progOfY(y) {
    const sY = cy(ROWS - 3), gY = cy(1);
    return Math.max(0, Math.min(1, (sY - y) / (sY - gY))) * PROG_MAX;
  }

  /* ----------------------------- 모듈 ----------------------------------- */
  const race = {
    label: '운빨 대시',

    init(M) {
      M.course = buildCourse(M);
      M._trig = {};                       // 깨진 가짜 발판 기록(좌표키)
      const sc = M.course.startC, sr = M.course.startR;
      M.local = M.amSpectator ? null : {
        x: cx(sc), y: cy(sr), z: 0,
        dir: { x: 0, y: -1 },             // 마지막 이동방향(점프 방향). 기본=위(전진)
        air: false, airUntil: 0, jumpAt: 0, dashed: false, jumpReadyAt: 0,
        speedUntil: 0, stunUntil: 0,
        cpR: sr, cpC: sc,                 // 직전 체크포인트
        prog: 0, bestProg: 0, fin: false, finished: false, finT: 0, _appended: false,
      };
      M._peerProg = {};
      M._peerFinT = {};                   // 브로드캐스트로 받은 peer 완주시각(DB 전파 지연 우회용)
    },

    step(M, dt) {
      const L = M.local; if (!L || L.finished) return;
      const t = M.simT();
      const grid = M.course.grid;
      const trig = M._trig;

      if (t < L.stunUntil) return;        // 추락 경직 중

      // 입력 방향(8방향). 위(dy<0)=전진.
      let dx = clamp(M.input.dx, -1, 1), dy = clamp(M.input.dy, -1, 1);
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      if (mag > 0.05) { L.dir.x = dx / (mag || 1); L.dir.y = dy / (mag || 1); }

      // 스킬버튼: 지상=점프 / 공중(쿨 지나고 1회)=대시
      if (M.input.action) {
        if (!L.air && t >= L.jumpReadyAt) {
          L.air = true; L.jumpAt = t; L.airUntil = t + JUMP_AIR; L.dashed = false;
          if (!M.lowPower) M.vibrate(12);
        } else if (L.air && !L.dashed && t >= L.jumpAt + DASH_GAP) {
          L.dashed = true; L.airUntil = Math.max(L.airUntil, t) + DASH_EXT;
          if (!M.lowPower) M.vibrate(18);
        }
      }

      const sped = t < L.speedUntil ? 1.5 : 1;
      let spd;
      if (L.air) spd = (L.dashed ? DASH_SPD : AIR_SPD) * sped;
      else spd = WALK * sped;

      // 수평 이동: 공중이면 입력방향(없으면 점프방향)으로 진행, 지상이면 입력방향
      let mvx, mvy;
      if (L.air) {
        if (mag > 0.05) { mvx = dx; mvy = dy; } else { mvx = L.dir.x; mvy = L.dir.y; }
      } else { mvx = dx; mvy = dy; }
      let nx = L.x + mvx * spd * dt;
      let ny = L.y + mvy * spd * dt;
      // 가장자리(경계 허공) 안으로 클램프 — 떨어지지 않게 좌우 벽 역할
      nx = clamp(nx, TILE + PR, (COLS - 1) * TILE - PR);
      ny = clamp(ny, PR, ROWS * TILE - PR);

      // 점프 높이(z) 포물선(시각/공중판정)
      if (L.air) {
        const dur = L.airUntil - L.jumpAt;
        const k = Math.max(0, Math.min(1, (t - L.jumpAt) / (dur || 1)));
        L.z = Math.sin(k * Math.PI) * (L.dashed ? 26 : 18);
        L.x = nx; L.y = ny;
        if (t >= L.airUntil) {            // 착지
          L.air = false; L.z = 0; L.jumpReadyAt = t + JUMP_CD;
          resolveGround(M, L, grid, trig, t, true);
        }
      } else {
        // 지상 이동: 한 축씩(슬라이드). 이동 후 바닥 판정.
        L.x = nx; L.y = ny;
        resolveGround(M, L, grid, trig, t, false);
      }

      // 진행/결승
      L.prog = progOfY(L.y);
      if (L.prog > L.bestProg) L.bestProg = L.prog;
      if (!L.fin && (L.prog >= PROG_MAX - 18 || rowAt(L.y) <= M.course.goalR)) {
        L.fin = true; L.finished = true; L.finT = t;
        if (!L._appended) { L._appended = true; M.flash('골인! 🍯'); try { M.appendFinish({ seat: M.mySeat, timeMs: Math.round(t) }); } catch (e) {} }
      }
    },

    draw(M) {
      const ctx = M.ctx, W = M.W, H = M.H;
      if (!M.course) return;
      const grid = M.course.grid, t = M.simT(), trig = M._trig;
      const Z = M.lowPower ? 1.25 : 1.45;       // 적당한 줌(앞 장애물은 보이되 시야는 코스에 집중)
      const L = M.local;
      const camX = L ? L.x : cx(M.course.goalC);
      const camY = L ? L.y : cy(M.course.goalR + 5);
      const cx0 = W * 0.5, cy0 = H * 0.62;       // 내 캐릭터를 약간 아래쪽에 두어 앞이 더 보임
      const sx = (wx) => Math.round((wx - camX) * Z + cx0);
      const sy = (wy) => Math.round((wy - camY) * Z + cy0);
      const TZ = TILE * Z;

      ctx.fillStyle = '#0c0f17'; ctx.fillRect(0, 0, W, H);

      const halfW = (W * 0.5) / Z + TILE, halfUp = (H * 0.62) / Z + TILE, halfDn = (H * 0.38) / Z + TILE;
      const c0 = Math.max(0, colAt(camX - halfW)), c1 = Math.min(COLS - 1, colAt(camX + halfW));
      const r0 = Math.max(0, rowAt(camY - halfUp)), r1 = Math.min(ROWS - 1, rowAt(camY + halfDn));
      const bSolid = blinkSolid(t);

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const X = sx(c * TILE), Y = sy(r * TILE), v = grid[r][c];
          drawTile(ctx, X, Y, TZ, v, r, c, trig, bSolid, t);
        }
      }
      drawGoalLine(M, ctx, sx, sy, TZ);

      // 다른 주자
      for (const seat of M.seats) {
        if (seat === M.mySeat) continue;
        const p = M.peerAt(seat); if (!p || p.x == null) continue;
        const px = sx(p.x), py = sy(p.y) - (p.z || 0) * Z;
        if (px < -50 || px > W + 50 || py < -50 || py > H + 50) continue;
        drawRunner(ctx, sx(p.x), sy(p.y), p.z || 0, seat, !!p.fin, false, false, Z);
      }
      if (L) drawRunner(ctx, sx(L.x), sy(L.y), L.z, M.mySeat, L.fin, true, t < L.stunUntil, Z);

      // 가벼운 가장자리 음영(시야 제한 아님)
      if (!M.lowPower) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(8,10,16,0.35)'); g.addColorStop(0.5, 'rgba(8,10,16,0)'); g.addColorStop(1, 'rgba(8,10,16,0.25)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    },

    hud(M) {
      const L = M.local;
      const myProg = L ? L.bestProg : 0;
      const rank = estimateRank(M, myProg);
      const pct = Math.round(myProg / PROG_MAX * 100);
      const t = M.simT();
      const fin = (M.state && M.state.finishOrder) || [];
      let timerTxt;
      if (fin.length >= 1) {
        const firstT = Math.min.apply(null, fin.map(f => f.timeMs));
        timerTxt = `<b>마감 ${(Math.max(0, CUTOFF_MS - (t - firstT)) / 1000).toFixed(1)}s</b>`;
      } else timerTxt = `${(t / 1000).toFixed(1)}s`;
      const stateTxt = L && L.fin ? '🏁 완주' : (L && t < L.stunUntil ? '💫 추락' : `진행 ${pct}%`);
      let skillTxt = '';
      if (L && !L.fin) {
        if (L.air) skillTxt = L.dashed ? '대시!' : '점프 — ⚡한번 더 대시';
        else skillTxt = t >= L.jumpReadyAt ? '점프 ⚡준비' : `점프 ${((L.jumpReadyAt - t) / 1000).toFixed(1)}s`;
      }
      return `<div class="mini-hud__row">`
        + `<span>순위 <b>${rank}</b>/${M.n}</span>`
        + `<span>${stateTxt}</span>`
        + (skillTxt ? `<span>${skillTxt}</span>` : '')
        + `<span>${timerTxt}</span></div>`;
    },

    netPayload(M) {
      const L = M.local; if (!L) return null;
      // fin/finT 를 함께 브로드캐스트 → DB(finishOrder) 전파 지연과 무관하게 모든 클라가 완주·완주시각을 즉시 공유.
      return { x: Math.round(L.x), y: Math.round(L.y), z: Math.round(L.z), prog: Math.round(L.bestProg),
               fin: !!L.fin, finT: L.fin ? Math.round(L.finT) : null };
    },
    onPeer(M, seat, msg) {
      if (!msg) return;
      if (msg.prog != null) M._peerProg[seat] = Math.max(M._peerProg[seat] || 0, msg.prog);
      if (msg.fin && msg.finT != null) {                 // 완주시각은 가장 이른 값을 유지(중복 수신 안정)
        M._peerFinT[seat] = (M._peerFinT[seat] == null) ? msg.finT : Math.min(M._peerFinT[seat], msg.finT);
      }
    },
    actionLabel() { return '점프'; },

    hostTick(M) {
      if (M._ended) return;
      const fin = (M.state && M.state.finishOrder) || [];
      if (fin.length === 0) return;
      if (new Set(fin.map(f => f.seat)).size >= M.n) { M.endGame(); return; }
      const firstT = Math.min.apply(null, fin.map(f => f.timeMs));
      if (M.simT() - firstT >= CUTOFF_MS) M.endGame();
    },

    finishPatch(M) {
      const ranks = {};
      // 완주시각 수집: 어느 한 정보원이 늦더라도 누락되지 않도록 3중 병합.
      //  (1) 공유 finishOrder(DB) (2) 브로드캐스트로 받은 peer 완주시각 (3) 내 로컬 완주(아직 CAS 반영 전일 수 있음)
      // → 모든 클라가 동일한 완주자/순서를 산출(첫 골인=1등 보장, 전파 지연으로 방장이 미완주 처리되던 버그 수정).
      const times = {};
      const note = (seat, tm) => {
        if (seat == null || tm == null || M.seats.indexOf(seat) < 0) return;
        if (times[seat] == null || tm < times[seat]) times[seat] = tm;
      };
      for (const f of ((M.state && M.state.finishOrder) || [])) if (f) note(f.seat, f.timeMs);
      if (M._peerFinT) for (const s in M._peerFinT) note(Number(s), M._peerFinT[s]);
      if (M.local && M.local.fin) note(M.mySeat, Math.round(M.local.finT || 0));

      const finished = Object.keys(times).map(Number).sort((a, b) => (times[a] - times[b]) || (a - b));
      const seen = new Set(finished);
      const progOf = (s) => {
        if (s === M.mySeat && M.local) return M.local.bestProg || 0;
        const p = M.peerAt(s); if (p && p.prog != null) return p.prog;
        return (M._peerProg && M._peerProg[s]) || 0;
      };
      const rest = M.seats.filter(s => !seen.has(s)).sort((a, b) => (progOf(b) - progOf(a)) || (a - b));
      let r = 1;
      for (const s of finished) ranks[s] = r++;
      for (const s of rest) ranks[s] = r++;
      for (const s of M.seats) if (ranks[s] == null) ranks[s] = r++;
      return { ranks };
    },
  };

  /* ----------------------------- 지상 판정(바닥/함정/효과) -------------- */
  function resolveGround(M, L, grid, trig, t, landed) {
    const c = colAt(L.x), r = rowAt(L.y);
    const v = (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? grid[r][c] : VOID;

    // 발판 효과 먼저(추락 아닌 것)
    if (v === TRAMP) {                         // 트램펄린: 위로 강하게 튕김(자동 점프+대시급)
      L.air = true; L.jumpAt = t; L.airUntil = t + JUMP_AIR + DASH_EXT; L.dashed = true;
      L.dir = { x: 0, y: -1 };
      return;
    }
    if (v === BUMP) {                          // 별 범퍼: 진행 반대로 2칸 밀림 + 짧은 경직
      L.x = clamp(L.x, TILE + PR, (COLS - 1) * TILE - PR);
      L.y = Math.min(ROWS * TILE - PR, L.y + 2 * TILE);
      L.stunUntil = t + 220;
      return;
    }
    if (v === SPEED) { L.speedUntil = t + SPEED_MS; }

    // 추락 판정: 가짜는 디디는 순간 붕괴, 허공/사라진 블링크면 추락
    let solid;
    if (v === FAKE) { trig[r * COLS + c] = true; solid = false; }   // 밟으면 빠짐
    else if (v === VOID) solid = false;
    else if (v === BLINK) solid = blinkSolid(t);
    else solid = true;                                              // SOLID/SPEED/GOAL
    if (!solid) { fall(M, L, t); return; }

    // 체크포인트 갱신: 더 전진한 체크포인트 행에 안전히 서면 저장(여긴 이미 단단한 바닥)
    const cps = M.course.cps;
    for (const cp of cps) if (r === cp.r && cp.r < L.cpR) { L.cpR = cp.r; L.cpC = c; }
  }
  function fall(M, L, t) {
    L.x = cx(L.cpC); L.y = cy(L.cpR); L.z = 0; L.air = false; L.dashed = false;
    L.stunUntil = t + STUN_MS; L.speedUntil = 0;
    M.flash('💫 추락! 체크포인트로');
    if (!M.lowPower) M.vibrate(30);
  }

  /* ----------------------------- 순위 추정 ------------------------------ */
  function estimateRank(M, myProg) {
    let ahead = 0;
    for (const seat of M.seats) {
      if (seat === M.mySeat) continue;
      const p = M.peerAt(seat);
      const pr = (p && p.prog != null) ? p.prog : ((M._peerProg && M._peerProg[seat]) || 0);
      if (pr > myProg) ahead++;
    }
    return ahead + 1;
  }

  /* ----------------------------- 그리기 헬퍼 ---------------------------- */
  function drawTile(ctx, X, Y, TZ, v, r, c, trig, bSolid, t) {
    const broken = (v === FAKE && trig[r * COLS + c]);
    if (v === VOID || broken) {                 // 허공/깨진 가짜 = 구멍(어둡게)
      ctx.fillStyle = '#070a11'; ctx.fillRect(X, Y, Math.ceil(TZ), Math.ceil(TZ));
      ctx.strokeStyle = 'rgba(40,55,80,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, Y + 0.5, TZ - 1, TZ - 1);
      return;
    }
    let fill = '#243650', edge = '#33507a';
    if (v === GOAL) { fill = '#2a4a2e'; edge = '#46c25a'; }
    else if (v === SPEED) { fill = '#1d4a4a'; edge = '#3ad0d6'; }
    else if (v === TRAMP) { fill = '#21305e'; edge = '#5d7bff'; }
    else if (v === BUMP) { fill = '#4a2030'; edge = '#ff6fae'; }
    else if (v === BLINK) { fill = bSolid ? '#3a2e55' : '#11101c'; edge = bSolid ? '#b07cff' : '#2a2540'; }
    // FAKE 는 일부러 SOLID 와 동일 외형(복불복) — fill/edge 그대로 둠
    ctx.fillStyle = fill; ctx.fillRect(X + 1, Y + 1, TZ - 1, TZ - 1);
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, Y + 0.5, TZ - 1, TZ - 1);
    // 아이콘
    ctx.fillStyle = edge; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(TZ * 0.5)}px system-ui,sans-serif`;
    const mx = X + TZ / 2, my = Y + TZ / 2;
    if (v === SPEED) ctx.fillText('»', mx, my);
    else if (v === TRAMP) ctx.fillText('▲', mx, my);
    else if (v === BUMP) ctx.fillText('★', mx, my);
    else if (v === BLINK && !bSolid) {}
  }

  function drawGoalLine(M, ctx, sx, sy, TZ) {
    const y = sy(M.course.goalR * TILE);
    const cell = Math.max(6, Math.round((TZ || TILE) / 2));
    const x0 = sx(0), x1 = sx(COLS * TILE);
    for (let x = x0; x < x1; x += cell) {
      const k = Math.floor((x - x0) / cell) % 2;
      ctx.fillStyle = k === 0 ? '#eef1f6' : '#11151d'; ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = k === 0 ? '#11151d' : '#eef1f6'; ctx.fillRect(x, y + cell, cell, cell);
    }
    ctx.fillStyle = '#ffd54a'; ctx.font = `bold ${Math.round(cell * 1.6)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('🍯', sx(M.course.goalC * TILE) + TZ / 2, y - cell);
  }

  function drawRunner(ctx, cx0, cy0, z, seat, fin, isMe, stunned, scale) {
    const r = (PR + 3) * (scale || 1);
    const yy = cy0 - z * (scale || 1);
    // 그림자(점프 높이 표현)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx0, cy0 + r * 0.5, r * (1 - z / 60), r * 0.4 * (1 - z / 90), 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = stunned ? 0.5 : 1;
    ctx.beginPath(); ctx.arc(cx0, yy, r, 0, Math.PI * 2);
    ctx.fillStyle = seatColor(seat); ctx.fill();
    ctx.lineWidth = isMe ? 3 : 2; ctx.strokeStyle = isMe ? '#fff' : 'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.fillStyle = '#0b0e14'; ctx.font = `bold ${Math.round(r * 1.05)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(seat), cx0, yy + 1);
    ctx.globalAlpha = 1;
    if (fin) { ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(cx0 + r, yy - r, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  window.MiniGames.race = race;
})();
