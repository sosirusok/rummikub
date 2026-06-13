/* =========================================================================
   race.js — 운빨 대시 (2D 톱다운 미로 대시, 2~8인)
   window.MiniGames.race 로 등록. 자급자족 단일 파일.

   게임 코어(전면 재설계):
   (A) 갈림길 + 막다른길 : 분기에서 한 갈래만 위로 통하고 나머지는 막다른 길.
       어디가 통로인지는 안 보이며(전부 같은 외형), 통로는 seed로 전 클라 동일.
   (B) 지름길 도박       : 짧은 지름길(50% 확률로 막힘, seed로 결정) vs 긴 우회로.
   (C) 작은 미로         : 짧은 미로 구간(막다른 골목 포함). seed로 동일 생성.

   표현/물리:
   - 2D 톱다운 타일 그리드. 통로=바닥, 충돌=벽(통과불가). 카메라가 내 캐릭터 추적.
   - 시작(아래)→결승(위)까지 seed로 생성. 무작위는 M.rng(state.seed)만 사용.
   - 좌표/벽 판정은 정수 그리드(전 클라 동일). 캐릭터=원+좌석색+번호.

   mini-core 계약:
   - 좌하 조이스틱 이동 + 우하 액션(짧은 대시, actionLabel="대시"). 즉사/탈락 없음.
   - 결승 통과 시 M.appendFinish({seat,timeMs}) 1회.
   - hostTick: 첫 골인 후 ~20s 마감 또는 전원 완주 시 M.endGame().
   - finishPatch: {ranks:{seat:rank}} — 완주=timeMs순, 미완주=진행도순, 전 좌석 1..n.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  /* ----------------------------- 그리드 상수 -------------------------- */
  const TILE   = 28;          // 타일 한 변(px) — 통로 폭
  const COLS   = 17;          // 미로 가로 칸 수(홀수: 벽-통로 격자)
  const SEC_H  = 9;           // 한 섹션 세로 칸 수(홀수)
  const SEC_N  = 9;           // 섹션 수(아래→위)
  const ROWS   = SEC_H * SEC_N + 2;   // 전체 세로 칸(+상하 테두리 여유)
  const PR     = 9;           // 캐릭터 반지름(px). 통로(TILE)보다 작아야 모서리 통과
  const GOAL_ROW = 1;         // 결승 통로 행(위쪽)
  const CUTOFF_MS = 20000;    // 첫 골인 후 마감(ms)

  // 운동 파라미터(고정스텝 dt=ms)
  const SPD       = 0.115;    // 기본 이속(px/ms)
  const DASH_SPD  = 0.230;    // 대시 중 이속
  const DASH_DUR  = 360;      // 대시 지속(ms)
  const DASH_CD   = 900;      // 대시 쿨다운(ms)

  // 셀 종류
  const WALL = 1, FLOOR = 0;

  /* ----------------------------- 결정론 미로 생성 -------------------- */
  // seed로 전 클라 동일한 그리드를 만든다. 각 섹션은 3종 중 하나:
  //   'fork'     : 갈림길+막다른길(한 갈래만 위로 통함)
  //   'shortcut' : 지름길 도박(가운데 짧은 길 50% 막힘 vs 좌우 긴 우회)
  //   'maze'     : 작은 미로(DFS 백트래킹, 막다른 골목 포함)
  // grid[r][c] = WALL|FLOOR. 섹션 사이는 항상 한 칸으로 이어붙임(연결 보장).
  function buildMaze(M) {
    const seed = ((M.state && M.state.seed) || 1) >>> 0;
    const rnd = M.rng(seed);
    const ri = (n) => Math.floor(rnd() * n);     // 0..n-1

    // 전부 벽으로 초기화
    const grid = [];
    for (let r = 0; r < ROWS; r++) { const row = new Array(COLS).fill(WALL); grid.push(row); }
    const carve = (r, c) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = FLOOR; };
    const carveCol = (c, r0, r1) => { for (let r = r0; r <= r1; r++) carve(r, c); };
    const carveRow = (r, c0, c1) => { for (let c = c0; c <= c1; c++) carve(r, c); };

    const types = [];           // 섹션 메타(디버그/미니맵용)
    // 각 섹션의 "입구 열"(아래쪽 연결점) / "출구 열"(위쪽 연결점)
    let entryCol = (COLS - 1) >> 1;     // 첫 섹션 입구는 가운데
    carveCol(entryCol, ROWS - 2, ROWS - 1);   // 출발 통로(맨 아래)

    for (let s = 0; s < SEC_N; s++) {
      // 섹션의 행 범위(아래가 큰 r). s=0 이 가장 아래.
      const rBot = ROWS - 2 - s * SEC_H;       // 섹션 바닥 행
      const rTop = rBot - (SEC_H - 1);         // 섹션 천장 행
      const kindRoll = rnd();
      let kind, exitCol;
      if (kindRoll < 0.40)      { ({ exitCol, kind } = secFork(grid, rTop, rBot, entryCol, ri, rnd, carve, carveCol, carveRow)); }
      else if (kindRoll < 0.70) { ({ exitCol, kind } = secShortcut(grid, rTop, rBot, entryCol, ri, rnd, carve, carveCol, carveRow)); }
      else                      { ({ exitCol, kind } = secMaze(grid, rTop, rBot, entryCol, ri, rnd, carve)); }
      types.push({ kind, rTop, rBot });
      // 다음 섹션으로 한 칸 잇기(현재 출구열 = 다음 입구열)
      if (s < SEC_N - 1) carve(rTop - 1, exitCol);
      entryCol = exitCol;
    }
    // 결승 통로(맨 위)와 마지막 출구를 연결
    carveRow(GOAL_ROW, Math.min(entryCol, (COLS - 1) >> 1), Math.max(entryCol, (COLS - 1) >> 1));
    carveCol(entryCol, GOAL_ROW, ROWS - 2 - (SEC_N - 1) * SEC_H);

    const goalCol = (COLS - 1) >> 1;
    carveCol(goalCol, GOAL_ROW, GOAL_ROW + 1);
    return { seed, grid, types, startCol: (COLS - 1) >> 1, goalCol, goalRow: GOAL_ROW };
  }

  // (A) 갈림길 + 막다른길: 입구에서 위로 가다 분기. 2~3 갈래 중 한 갈래만 천장까지 통함.
  function secFork(grid, rTop, rBot, entryCol, ri, rnd, carve, carveCol, carveRow) {
    // 분기 지점(섹션 아래쪽 1/3)
    const splitRow = rBot - 2;
    carveCol(entryCol, splitRow, rBot);         // 입구→분기까지 세로 통로
    // 분기 가지들의 열(서로 떨어뜨림)
    const branchCols = pickCols(entryCol, ri, rnd);
    const openIdx = ri(branchCols.length);      // 진짜 통로 가지(seed 결정)
    carveRow(splitRow, Math.min(entryCol, ...branchCols), Math.max(entryCol, ...branchCols));
    let exitCol = entryCol;
    branchCols.forEach((bc, idx) => {
      if (idx === openIdx) {
        carveCol(bc, rTop, splitRow);           // 천장까지 통함(진짜 길)
        exitCol = bc;
      } else {
        // 막다른 길: 조금만 올라가다 막힘(전부 같은 외형)
        const dead = splitRow - (2 + ri(Math.max(1, (splitRow - rTop) - 2)));
        carveCol(bc, Math.max(rTop + 1, dead), splitRow);
      }
    });
    return { exitCol, kind: 'fork' };
  }

  // (B) 지름길 도박: 가운데 짧은 직통(50% 막힘) vs 좌우 긴 우회로(항상 뚫림).
  function secShortcut(grid, rTop, rBot, entryCol, ri, rnd, carve, carveCol, carveRow) {
    const open = rnd() < 0.50;                   // 지름길이 뚫려있나(seed 결정)
    const exitCol = entryCol;                    // 출구는 입구와 같은 열(가운데 정렬)
    if (open) {
      carveCol(entryCol, rTop, rBot);            // 지름길 직통
    } else {
      // 지름길은 위쪽이 막힘(들어가면 막다른 길) → 우회 강제
      const block = rTop + 2 + ri(2);
      carveCol(entryCol, block, rBot);           // 아래 일부만 뚫림(막힌 지름길 미끼)
    }
    // 우회로: 좌/우 중 한 쪽(seed). ㄷ자 형태로 천장 통과.
    const side = (rnd() < 0.5) ? -1 : 1;
    const farC = (side < 0) ? 2 : (COLS - 3);
    carveRow(rBot, Math.min(entryCol, farC), Math.max(entryCol, farC));   // 아래 가로
    carveCol(farC, rTop, rBot);                                           // 바깥 세로
    carveRow(rTop, Math.min(exitCol, farC), Math.max(exitCol, farC));     // 위 가로(천장)
    carveCol(exitCol, rTop, rTop + 1);
    return { exitCol, kind: 'shortcut' };
  }

  // (C) 작은 미로: DFS 백트래킹으로 섹션 내부를 격자 미로로(막다른 골목 자연발생).
  function secMaze(grid, rTop, rBot, entryCol, ri, rnd, carve) {
    // 격자 셀 좌표(홀수 행/열을 통로 노드로 사용)
    const cells = [];
    for (let r = rTop; r <= rBot; r++) cells.push(r);
    // 입구를 통로로
    const startR = rBot, startC = entryCol;
    carve(startR, startC);
    // 셀 노드(짝수 간격) 방문 DFS
    const isNode = (r, c) => (r % 2 === rBot % 2) && (c % 2 === entryCol % 2);
    const inSec = (r, c) => r >= rTop && r <= rBot && c >= 1 && c <= COLS - 2;
    const visited = {};
    const key = (r, c) => r + ',' + c;
    const stack = [[startR, startC]];
    visited[key(startR, startC)] = true;
    const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];   // 노드 간 2칸 이동
    let topReached = startC;                            // 천장에 닿은 마지막 열
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      // 미방문 이웃 셔플(seed)
      const order = shuffle(dirs.slice(), rnd);
      let moved = false;
      for (const [dr, dc] of order) {
        const nr = r + dr, nc = c + dc;
        if (!inSec(nr, nc) || !isNode(nr, nc) || visited[key(nr, nc)]) continue;
        carve((r + nr) >> 1, (c + nc) >> 1);           // 벽 허물기(중간 칸)
        carve(nr, nc);
        visited[key(nr, nc)] = true;
        stack.push([nr, nc]);
        if (nr <= rTop + 1 && nr < r) topReached = nc; // 천장 부근 도달 열 기록
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }
    // 천장으로 확실히 나가는 출구를 보장(미로가 위로 안 뚫렸으면 강제 통로)
    let exitCol = topReached;
    if (!isFloor(grid, rTop, exitCol)) {
      // 가까운 통로 열을 찾아 천장까지 한 칸 세로로 연결
      exitCol = entryCol;
      for (let r = rTop; r <= rBot; r++) carve(r, exitCol);
    } else {
      carve(rTop, exitCol);
    }
    return { exitCol, kind: 'maze' };
  }

  /* ----------------------------- 생성 유틸 ---------------------------- */
  function pickCols(entryCol, ri, rnd) {
    // 분기 가지 2~3개의 열(가운데/좌/우, 서로 충분히 떨어뜨림)
    const n = 2 + ri(2);
    const opts = [2, (COLS - 1) >> 1, COLS - 3];
    let cols = shuffle(opts.slice(), rnd).slice(0, n);
    // entryCol 이 포함되도록 한 가지는 입구열로(자연스러운 분기)
    if (!cols.includes(entryCol)) cols[0] = entryCol;
    return Array.from(new Set(cols)).sort((a, b) => a - b);
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function isFloor(grid, r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === FLOOR; }

  /* ----------------------------- 좌표 변환 ---------------------------- */
  // 월드(px) ↔ 그리드(칸). 셀 중심 = (c+0.5)*TILE, (r+0.5)*TILE.
  function cellCenterX(c) { return Math.round((c + 0.5) * TILE); }
  function cellCenterY(r) { return Math.round((r + 0.5) * TILE); }
  // 진행도: 시작행→결승행(위로 갈수록 큼). y가 작을수록 전진.
  function progOfY(y) {
    const startY = cellCenterY(ROWS - 2);
    const goalY = cellCenterY(GOAL_ROW);
    return Math.max(0, Math.min(1, (startY - y) / (startY - goalY))) * 1000;
  }
  const PROG_MAX = 1000;

  /* ----------------------------- 충돌(원 vs 벽 타일) ------------------ */
  // 벽 셀이면 통과불가. 원의 AABB 가 겹치는 셀들만 검사(저비용).
  function isWallAt(grid, px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    return grid[r][c] === WALL;
  }
  // 한 축씩 이동시키며 벽이면 되돌림(슬라이딩). 원을 4꼭짓점+중심으로 근사.
  function collideMove(grid, x, y, nx, ny) {
    // X 축 먼저
    if (!circleHitsWall(grid, nx, y)) x = nx;
    // Y 축
    if (!circleHitsWall(grid, x, ny)) y = ny;
    return [x, y];
  }
  function circleHitsWall(grid, px, py) {
    // 원 둘레 8점 + 중심으로 벽 검사(정수 그리드, 결정적)
    const pts = [
      [px, py],
      [px - PR, py], [px + PR, py], [px, py - PR], [px, py + PR],
      [px - PR * 0.7, py - PR * 0.7], [px + PR * 0.7, py - PR * 0.7],
      [px - PR * 0.7, py + PR * 0.7], [px + PR * 0.7, py + PR * 0.7],
    ];
    for (const [qx, qy] of pts) if (isWallAt(grid, qx, qy)) return true;
    return false;
  }

  /* ----------------------------- 모듈 -------------------------------- */
  const race = {
    label: '운빨 대시',

    init(M) {
      M.maze = buildMaze(M);
      const seat = M.mySeat || 1;
      const startX = cellCenterX(M.maze.startCol);
      const startY = cellCenterY(ROWS - 2);
      M.local = M.amSpectator ? null : {
        x: startX, y: startY,
        prog: 0, bestProg: 0,
        fin: false, finished: false, finT: 0, _appended: false,
        dashUntil: 0, dashCdUntil: 0,
      };
      M._peerProg = {};          // 순위 추정용 캐시
    },

    /* step: 조이스틱 이동 + 대시 + 벽 충돌 + 진행/결승 */
    step(M, dt) {
      const L = M.local; if (!L || L.finished) return;
      const t = M.simT();
      const grid = M.maze.grid;

      // 대시 발동(엣지) — 쿨다운 통과 시
      if (M.input.action && t >= L.dashCdUntil) {
        L.dashUntil = t + DASH_DUR; L.dashCdUntil = t + DASH_CD;
        if (!M.lowPower) M.vibrate(18);
      }
      const dashing = t < L.dashUntil;
      const spd = dashing ? DASH_SPD : SPD;

      // 입력 방향(8방향). 위(dy<0)가 전진.
      let dx = clamp(M.input.dx, -1, 1), dy = clamp(M.input.dy, -1, 1);
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      const nx = L.x + dx * spd * dt;
      const ny = L.y + dy * spd * dt;
      const [ax, ay] = collideMove(grid, L.x, L.y, nx, ny);
      L.x = ax; L.y = ay;

      // 진행도(되돌아가기=손실, 탈락 없음). bestProg 는 순위표시용 최대치.
      L.prog = progOfY(L.y);
      if (L.prog > L.bestProg) L.bestProg = L.prog;

      // 결승: 결승 행(위쪽 통로)에 도달
      if (!L.fin) {
        const r = Math.floor(L.y / TILE);
        if (r <= GOAL_ROW) {
          L.fin = true; L.finished = true; L.finT = M.simT();
          if (!L._appended) {
            L._appended = true;
            M.flash('골인!');
            try { M.appendFinish({ seat: M.mySeat, timeMs: Math.round(L.finT) }); } catch (e) {}
          }
        }
      }
    },

    /* draw: 2D 톱다운. 카메라가 내 캐릭터 추적. 화면밖 컬링. */
    draw(M) {
      const ctx = M.ctx, W = M.W, H = M.H;
      if (!M.maze) return;
      const grid = M.maze.grid;

      // 카메라: 내 캐릭터를 화면 중앙에(관전자는 결승 부근)
      const camTX = M.local ? M.local.x : cellCenterX(M.maze.goalCol);
      const camTY = M.local ? M.local.y : cellCenterY(GOAL_ROW + 4);
      const camX = camTX - W * 0.5;
      const camY = camTY - H * 0.55;
      const sx = (wx) => Math.round(wx - camX);
      const sy = (wy) => Math.round(wy - camY);

      // 배경
      ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, W, H);

      // 보이는 셀 범위(컬링)
      const c0 = Math.max(0, Math.floor(camX / TILE) - 1);
      const c1 = Math.min(COLS - 1, Math.ceil((camX + W) / TILE) + 1);
      const r0 = Math.max(0, Math.floor(camY / TILE) - 1);
      const r1 = Math.min(ROWS - 1, Math.ceil((camY + H) / TILE) + 1);

      // 바닥(통로)만 그림 — 벽은 어두운 배경 그대로(통로/벽 외형은 균일)
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (grid[r][c] !== FLOOR) continue;
          const isGoal = (r <= GOAL_ROW + 0);
          ctx.fillStyle = isGoal ? '#1d3350' : '#1b2740';
          ctx.fillRect(sx(c * TILE) + 1, sy(r * TILE) + 1, TILE - 1, TILE - 1);
        }
      }

      // 결승 체크무늬 바
      drawFinish(M, ctx, sx, sy);

      // 원격 플레이어(컬링)
      for (const seat of M.seats) {
        if (seat === M.mySeat) continue;
        const p = M.peerAt(seat);
        if (!p || p.x == null || p.y == null) continue;
        const px = sx(p.x), py = sy(p.y);
        if (px < -30 || px > W + 30 || py < -30 || py > H + 30) continue;
        drawRunner(ctx, px, py, seat, !!p.fin, M.lowPower, false, false);
      }
      // 내 캐릭터(맨 위)
      if (M.local) {
        const L = M.local;
        drawRunner(ctx, sx(L.x), sy(L.y), M.mySeat, L.fin, M.lowPower, true, M.simT() < L.dashUntil);
      }

      // 미니맵(우상단) — 저사양 생략
      if (!M.lowPower) drawMiniMap(M, ctx, W, H);
    },

    /* hud: 순위·진행률·타이머 */
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
        const left = Math.max(0, CUTOFF_MS - (t - firstT));
        timerTxt = `<b>마감 ${(left / 1000).toFixed(1)}s</b>`;
      } else {
        timerTxt = `${(t / 1000).toFixed(1)}s`;
      }
      const stateTxt = L && L.fin ? '🏁 완주' : `진행 ${pct}%`;
      return `<div class="mini-hud__row">`
        + `<span>순위 <b>${rank}</b>/${M.n}</span>`
        + `<span>${stateTxt}</span>`
        + `<span>${timerTxt}</span>`
        + `</div>`;
    },

    /* netPayload: 위치/진행/완주 */
    netPayload(M) {
      const L = M.local; if (!L) return null;
      return { x: Math.round(L.x), y: Math.round(L.y), prog: Math.round(L.bestProg), fin: !!L.fin };
    },

    onPeer(M, seat, msg) { if (msg && msg.prog != null) M._peerProg[seat] = msg.prog; },

    actionLabel() { return '대시'; },

    /* hostTick: 첫 골인 후 cutoff, 전원 완주 시 종료 */
    hostTick(M, dt) {
      if (M._ended) return;
      const fin = (M.state && M.state.finishOrder) || [];
      if (fin.length === 0) return;
      const uniq = new Set(fin.map(f => f.seat));
      if (uniq.size >= M.n) { M.endGame(); return; }
      const firstT = Math.min.apply(null, fin.map(f => f.timeMs));
      if (M.simT() - firstT >= CUTOFF_MS) M.endGame();
    },

    /* finishPatch: {ranks:{seat:rank}} 완주=timeMs순, 미완주=진행도순, 1..n */
    finishPatch(M) {
      const ranks = {};
      const fin = ((M.state && M.state.finishOrder) || []).slice();
      const seen = new Set(); const finished = [];
      fin.sort((a, b) => (a.timeMs - b.timeMs) || (a.seat - b.seat));
      for (const f of fin) {
        if (f == null || f.seat == null || seen.has(f.seat)) continue;
        if (M.seats.indexOf(f.seat) < 0) continue;
        seen.add(f.seat); finished.push(f.seat);
      }
      const progOf = (s) => {
        if (s === M.mySeat && M.local) return M.local.bestProg || 0;
        const p = M.peerAt(s);
        if (p && p.prog != null) return p.prog;
        return (M._peerProg && M._peerProg[s]) || 0;
      };
      const rest = M.seats.filter(s => !seen.has(s)).sort((a, b) => (progOf(b) - progOf(a)) || (a - b));
      let r = 1;
      for (const s of finished) ranks[s] = r++;
      for (const s of rest) ranks[s] = r++;
      for (const s of M.seats) if (ranks[s] == null) ranks[s] = r++;   // 안전망
      return { ranks };
    },
  };

  /* ----------------------------- 순위 추정 --------------------------- */
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

  /* ----------------------------- 그리기 헬퍼 ------------------------- */
  // 캐릭터 = 원 + 좌석색 + 번호
  function drawRunner(ctx, cx, cy, seat, fin, lowPower, isMe, dashing) {
    const r = PR + 3;
    if (dashing && !lowPower) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = seatColor(seat); ctx.fill();
    ctx.lineWidth = isMe ? 3 : 2;
    ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();
    ctx.fillStyle = '#0b0e14';
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(seat), cx, cy + 1);
    if (fin) { ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(cx + r, cy - r, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  // 결승 체크무늬(결승 행 통로 위)
  function drawFinish(M, ctx, sx, sy) {
    const y = sy(GOAL_ROW * TILE);
    const cell = Math.round(TILE / 2);
    const x0 = sx(0), x1 = sx(COLS * TILE);
    for (let x = x0; x < x1; x += cell) {
      const k = Math.floor((x - x0) / cell) % 2;
      ctx.fillStyle = k === 0 ? '#eef1f6' : '#11151d';
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = k === 0 ? '#11151d' : '#eef1f6';
      ctx.fillRect(x, y + cell, cell, cell);
    }
  }

  // 미니맵: 전체 미로 축소 + 나/원격 진행 점
  function drawMiniMap(M, ctx, W, H) {
    const mw = 64, mh = 92, pad = 10;
    const ox = W - mw - pad, oy = pad;
    ctx.fillStyle = 'rgba(8,12,20,0.7)';
    ctx.fillRect(ox - 3, oy - 3, mw + 6, mh + 6);
    const grid = M.maze.grid;
    const cw = mw / COLS, ch = mh / ROWS;
    ctx.fillStyle = '#26344e';
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (grid[r][c] === FLOOR) ctx.fillRect(ox + c * cw, oy + r * ch, Math.max(1, cw), Math.max(1, ch));
      }
    }
    // 결승선
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(ox, oy + GOAL_ROW * ch, mw, Math.max(1, ch));
    // 점(나/원격) — 진행도 기반 y
    const dot = (prog, seat, me) => {
      const k = clamp(prog / PROG_MAX, 0, 1);
      const yy = oy + mh - k * mh;
      ctx.beginPath(); ctx.arc(ox + mw * 0.5, yy, me ? 2.6 : 2, 0, Math.PI * 2);
      ctx.fillStyle = seatColor(seat); ctx.fill();
      if (me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    };
    for (const seat of M.seats) {
      if (seat === M.mySeat) continue;
      const p = M.peerAt(seat);
      const pr = (p && p.prog != null) ? p.prog : ((M._peerProg && M._peerProg[seat]) || 0);
      dot(pr, seat, false);
    }
    if (M.local) dot(M.local.bestProg, M.mySeat, true);
  }

  /* ----------------------------- 유틸 -------------------------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  window.MiniGames.race = race;
})();
