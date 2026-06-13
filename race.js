/* =========================================================================
   race.js — 운빨 대시 (복불복 세로스크롤 레이스, 2~8인)
   window.MiniGames.race 로 등록. 자급자족 단일 파일.

   규칙 요약(mini-core 계약 준수):
   - 모든 무작위는 M.rng(M.state.seed) 만 사용(기기간 동일). 좌표 정수화.
   - 카메라는 내 캐릭터를 따라 위로(결승선이 위, y 작을수록 전진).
   - 본인=M.local, 원격=M.peerAt(seat). 캐릭터=원+좌석색+번호.
   - 결승 통과 시 M.appendFinish({seat,timeMs}) 1회.
   - hostTick: finishOrder 첫 골인 후 cutoff(20s) → 전원 완주 or 초과 시 endGame.
   - finishPatch: {ranks:{seat:rank}} 모든 좌석 빠짐없이.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  /* ----------------------------- 코스 상수 ----------------------------- */
  // 좌표계: CSS px 가상월드. 가로 폭 고정(WORLD_W), 세로로 위(작은 y)가 결승.
  const WORLD_W   = 360;          // 가상 코스 폭(px) — 화면에 맞춰 스케일
  const LANE_N    = 3;            // 갈림길 레인 수
  const LANE_W    = WORLD_W / LANE_N;
  const SEG_H     = 420;          // 한 구간(갈림길+직선)의 세로 길이
  const SEG_COUNT = 14;           // 구간 수
  const START_Y   = 0;            // 출발선 y(가장 큰 y에서 위로 달림 → 부호 반전)
  const TRACK_LEN = SEG_H * SEG_COUNT;   // 총 코스 길이(전진해야 할 거리)
  const FINISH_Y  = -TRACK_LEN;   // 결승선 y(가장 작은 y)
  const WALL_TH   = 26;           // 갈림길 벽 두께
  const GATE_BAND = 120;          // 갈림길 벽이 차지하는 세로 밴드
  const PLAYER_R  = 13;           // 캐릭터 반지름
  const FINAL_BAND_FROM_FINISH = SEG_H; // 결승 직전 마지막 구간 = 3갈래 관문

  // 운동 파라미터(고정스텝 dt=ms 기준)
  const ACCEL      = 0.0016;      // 가속(px/ms^2 유사)
  const FRICTION   = 0.0085;      // 감속 마찰(정지 입력시)
  const MAX_SPD    = 0.30;        // 기본 최고 이속(px/ms)
  const SIDE_SPD   = 0.26;        // 좌우 이속(px/ms)
  const DASH_BOOST = 0.55;        // 대시 순간 가속도 부스트(전방)
  const DASH_DUR   = 320;         // 대시 지속(ms) — 이 동안 구덩이 건너뜀
  const DASH_CD    = 800;         // 대시 쿨다운(ms)
  const STUN_SPIKE = 1200;        // 스파이크 기절(ms)
  const SLOW_WALL  = 400;         // 막힌 레인 충돌 감속(ms)
  const CUTOFF_MS  = 20000;       // 첫 골인 후 마감(ms)

  // 함정 종류
  const TRAP_NONE = 0, TRAP_PIT = 1, TRAP_SPIKE = 2;

  /* ----------------------------- 결정론 코스 생성 ---------------------- */
  // seed 로 모든 구간의 통과 레인/함정/마지막 관문을 동일하게 생성.
  function buildCourse(M) {
    const seed = (M.state && M.state.seed) || 1;
    const rnd = M.rng(seed >>> 0);
    const ri = (n) => Math.floor(rnd() * n);   // 0..n-1 정수
    const segs = [];
    for (let i = 0; i < SEG_COUNT; i++) {
      // 구간의 위쪽 끝(전진 방향) y
      const topY = START_Y - (i + 1) * SEG_H;
      const isFinalGate = (i === SEG_COUNT - 1);
      // 갈림길: 1개만 통과(open), 나머지는 벽(막힘)
      const laneN = isFinalGate ? 3 : (2 + ri(2)); // 보통 2~3갈래, 마지막은 3갈래
      const openLane = ri(laneN);
      // 함정: 통과 레인 중앙쯤 0~1개(낙하/스파이크). 마지막 관문엔 함정 없음.
      let trap = TRAP_NONE;
      if (!isFinalGate) {
        const roll = rnd();
        if (roll < 0.20) trap = TRAP_PIT;
        else if (roll < 0.36) trap = TRAP_SPIKE;
      }
      // 갈림길 밴드의 세로 위치(구간 위쪽). gateY = 벽 중심 y
      const gateY = topY + GATE_BAND * 0.5 + 40;
      // 함정 y(갈림길 통과 직후 직선부)
      const trapY = gateY - GATE_BAND * 0.5 - 70 - ri(60);
      segs.push({ i, topY, laneN, openLane, trap, gateY, trapY, isFinalGate });
    }
    return { seed, segs };
  }

  // 특정 레인의 x중심(정수)
  function laneCenterX(laneN, lane) {
    const w = WORLD_W / laneN;
    return Math.round(w * lane + w * 0.5);
  }
  // 레인의 [x0,x1] 경계(정수)
  function laneBounds(laneN, lane) {
    const w = WORLD_W / laneN;
    return [Math.round(w * lane), Math.round(w * (lane + 1))];
  }

  /* ----------------------------- 모듈 ---------------------------------- */
  const race = {
    label: '운빨 대시',

    /* init: 결정론 월드 + 내 엔티티 세팅 */
    init(M) {
      M.course = buildCourse(M);
      // 내 출발 x: 좌석순으로 분산(정수). 관전자는 local 없음.
      const seat = M.mySeat || 1;
      const idx = Math.max(0, M.seats.indexOf(seat));
      const slots = Math.max(1, M.n);
      const startX = Math.round(WORLD_W * (idx + 0.5) / slots);
      M.local = M.amSpectator ? null : {
        x: startX, y: START_Y - 8,
        vx: 0, vy: 0,
        prog: 0,                 // 전진거리(0..TRACK_LEN)
        fin: false, finT: 0, finished: false,
        stunUntil: 0,            // 스파이크 기절 종료 simT
        slowUntil: 0,            // 벽 충돌 감속 종료 simT
        dashUntil: 0, dashCdUntil: 0,
        cp: { x: startX, y: START_Y - 8 }, // 마지막 체크포인트(낙하 복귀)
        _appended: false,
      };
      // peer 표시용 추정 진행도 캐시(원격은 payload 의 prog 사용)
      M._peerProg = {};
    },

    /* step: 입력→가감속/충돌/함정/전진. (관전자는 mini-core 가 호출 안 함) */
    step(M, dt) {
      const L = M.local; if (!L || L.finished) return;
      const t = M.simT();
      const stunned = t < L.stunUntil;
      const slowed  = t < L.slowUntil;
      const dashing = t < L.dashUntil;

      // 대시 입력(엣지) — 쿨다운 통과 시 발동
      if (M.input.action && !stunned && t >= L.dashCdUntil) {
        L.dashUntil = t + DASH_DUR;
        L.dashCdUntil = t + DASH_CD;
        L.vy -= 0.10;            // 즉발 전방 가속
        if (!M.lowPower) M.vibrate(20);
      }

      // 역전보정: 내 prog 가 평균보다 뒤처지면 가속(꼴찌일수록 +)
      let rubber = 1;
      const avg = avgProg(M);
      if (avg > 0 && L.prog < avg) {
        rubber = 1 + Math.min(0.35, (avg - L.prog) / TRACK_LEN * 1.6);
      }

      // 전방(위=음의 y) 가속: 기본 전진 + 입력 dy(위로 밀면 가속)
      const fwdIn = -Math.max(0, -M.input.dy); // dy<0(위)면 가속, 아래는 무시(후진 없음)
      const baseAcc = ACCEL * rubber * (dashing ? (1 + DASH_BOOST) : 1);
      if (!stunned) {
        L.vy -= baseAcc;                       // 항상 전방으로(자동 러닝 느낌)
        L.vy += fwdIn * ACCEL * 0.6 * rubber;  // 위 입력 추가 가속
        // 좌우 이동
        L.vx = clamp(M.input.dx, -1, 1) * SIDE_SPD;
      } else {
        L.vx = 0;
      }

      // 속도 캡
      const capV = MAX_SPD * rubber * (dashing ? (1 + DASH_BOOST) : 1) * (slowed ? 0.45 : 1);
      if (L.vy < -capV) L.vy = -capV;
      if (L.vy > 0) L.vy *= (1 - FRICTION * dt); // 뒤로 밀리지 않게 마찰
      if (stunned) { L.vy *= (1 - FRICTION * 2 * dt); }

      // 적분(정수화는 그리기 시점에만; 물리는 float, 충돌은 결정적 좌표)
      L.x += L.vx * dt;
      L.y += L.vy * dt;
      L.x = clamp(L.x, PLAYER_R, WORLD_W - PLAYER_R);
      if (L.y > START_Y) L.y = START_Y;          // 출발선 뒤로 못감

      // 충돌/함정 판정
      handleHazards(M, L, dt, dashing);

      // 전진거리(체크포인트 갱신)
      L.prog = clamp(START_Y - L.y, 0, TRACK_LEN);

      // 결승 통과
      if (!L.fin && L.y <= FINISH_Y) {
        L.fin = true; L.finished = true; L.finT = M.simT();
        L.y = FINISH_Y;
        if (!L._appended) {
          L._appended = true;
          M.flash('골인!');
          try { M.appendFinish({ seat: M.mySeat, timeMs: Math.round(L.finT) }); } catch (e) {}
        }
      }
    },

    /* draw: 카메라(내 캐릭터 추적, 위가 전방) + 코스 + 캐릭터 */
    draw(M) {
      const ctx = M.ctx, W = M.W, H = M.H;
      if (!M.course) return;
      const scale = W / WORLD_W;               // 가로 꽉 채움
      // 카메라 기준 y: 내 캐릭터(또는 관전 시 결승부근)를 화면 60% 지점에
      const camTargetY = M.local ? M.local.y : FINISH_Y * 0.5;
      const camY = camTargetY - (H * 0.6) / scale;  // 월드→화면 변환용 오프셋

      // 배경(어두운 트랙)
      ctx.fillStyle = '#0c1320';
      ctx.fillRect(0, 0, W, H);

      // 월드→스크린 변환 헬퍼
      const sx = (wx) => Math.round(wx * scale);
      const sy = (wy) => Math.round((wy - camY) * scale);

      // 트랙 좌우 경계(연한 가드레일)
      ctx.fillStyle = '#1a2740';
      ctx.fillRect(0, 0, sx(0), H);
      ctx.fillRect(sx(WORLD_W), 0, W - sx(WORLD_W), H);

      // 화면에 보이는 월드 y 범위
      const wyTop = camY;                 // 화면 위쪽 = 작은 y
      const wyBot = camY + H / scale;     // 화면 아래쪽 = 큰 y

      // 출발선
      if (START_Y >= wyTop && START_Y <= wyBot) {
        ctx.fillStyle = '#2e3d57';
        ctx.fillRect(0, sy(START_Y) - 2, W, 4);
      }
      // 결승선(체크무늬 바)
      if (FINISH_Y >= wyTop - 30 && FINISH_Y <= wyBot) {
        drawFinish(ctx, sx, sy, scale);
      }

      // 구간(컬링): 보이는 것만
      for (const s of M.course.segs) {
        if (s.topY > wyBot || s.topY + SEG_H < wyTop) continue; // 화면 밖
        drawSegment(ctx, s, sx, sy, scale);
      }

      // 원격 플레이어
      for (const seat of M.seats) {
        if (seat === M.mySeat) continue;
        const p = M.peerAt(seat);
        if (!p || p.x == null || p.y == null) continue;
        if (p.y < wyTop - 40 || p.y > wyBot + 40) continue;     // 컬링
        drawRunner(ctx, sx(p.x), sy(p.y), scale, seat, p.fin, M.lowPower);
      }
      // 내 캐릭터(맨 위에)
      if (M.local) {
        const L = M.local;
        drawRunner(ctx, sx(L.x), sy(L.y), scale, M.mySeat, L.fin, M.lowPower, true,
                   M.simT() < L.stunUntil, M.simT() < L.dashUntil);
      }

      // 진행 게이지(우측 미니 트랙) — 저사양에선 생략
      if (!M.lowPower) drawProgressRail(M, ctx, W, H);
    },

    /* hud: 순위 추정·남은거리·타이머 */
    hud(M) {
      const L = M.local;
      const myProg = L ? L.prog : 0;
      const rank = estimateRank(M, myProg);
      const remain = Math.max(0, Math.round((TRACK_LEN - myProg) / 10));
      const t = M.simT();
      const fin = (M.state && M.state.finishOrder) || [];
      let timerTxt = '';
      if (fin.length >= 1) {
        const firstT = Math.min.apply(null, fin.map(f => f.timeMs));
        const left = Math.max(0, CUTOFF_MS - (t - firstT));
        timerTxt = `<b>마감 ${(left / 1000).toFixed(1)}s</b>`;
      } else {
        timerTxt = `${(t / 1000).toFixed(1)}s`;
      }
      const finishedTxt = L && L.fin ? '🏁 완주' : `남은 ${remain}m`;
      return `<div class="mini-hud__row">`
        + `<span>순위 <b>${rank}</b>/${M.n}</span>`
        + `<span>${finishedTxt}</span>`
        + `<span>${timerTxt}</span>`
        + `</div>`;
    },

    /* netPayload: 위치/진행/완주 */
    netPayload(M) {
      const L = M.local; if (!L) return null;
      return {
        x: Math.round(L.x), y: Math.round(L.y),
        prog: Math.round(L.prog), fin: !!L.fin,
      };
    },

    /* onPeer: 그리기는 peerAt 사용 → prog 캐시만 갱신(순위추정용) */
    onPeer(M, seat, msg) {
      if (msg && msg.prog != null) M._peerProg[seat] = msg.prog;
    },

    actionLabel() { return '대시'; },

    /* hostTick: 첫 골인 후 cutoff. 전원 완주 또는 cutoff 초과 시 종료 */
    hostTick(M, dt) {
      if (M._ended) return;
      const fin = (M.state && M.state.finishOrder) || [];
      if (fin.length === 0) return;
      // 전원 완주
      const uniqSeats = new Set(fin.map(f => f.seat));
      if (uniqSeats.size >= M.n) { M.endGame(); return; }
      // cutoff
      const firstT = Math.min.apply(null, fin.map(f => f.timeMs));
      if (M.simT() - firstT >= CUTOFF_MS) { M.endGame(); }
    },

    /* finishPatch: {ranks:{seat:rank}} 모든 좌석 1..n 빠짐없이 */
    finishPatch(M) {
      const ranks = {};
      const fin = ((M.state && M.state.finishOrder) || []).slice();
      // 1) 완주자: timeMs 오름차순(같으면 seat). 중복 seat 은 첫 기록만.
      const seenFin = new Set();
      const finished = [];
      fin.sort((a, b) => (a.timeMs - b.timeMs) || (a.seat - b.seat));
      for (const f of fin) {
        if (f == null || f.seat == null || seenFin.has(f.seat)) continue;
        if (M.seats.indexOf(f.seat) < 0) continue;   // 유효 좌석만
        seenFin.add(f.seat); finished.push(f.seat);
      }
      // 2) 미완주자: 마지막 알려진 prog 내림차순(많이 간 사람 앞). 동률은 seat.
      const rest = M.seats.filter(s => !seenFin.has(s));
      const progOf = (s) => {
        if (s === M.mySeat && M.local) return M.local.prog || 0;
        // peerAt 보간값 우선, 없으면 onPeer 캐시
        const p = M.peerAt(s);
        if (p && p.prog != null) return p.prog;
        return (M._peerProg && M._peerProg[s]) || 0;
      };
      rest.sort((a, b) => (progOf(b) - progOf(a)) || (a - b));
      // 3) 순위 부여(1..n, 빠짐없이)
      let r = 1;
      for (const s of finished) ranks[s] = r++;
      for (const s of rest)     ranks[s] = r++;
      // 안전망: 혹시 누락 좌석 있으면 끝에 채움
      for (const s of M.seats) if (ranks[s] == null) ranks[s] = r++;
      return { ranks };
    },
  };

  /* ----------------------------- 충돌/함정 처리 ------------------------ */
  // 갈림길 막힌 레인 벽 + 함정(낙하/스파이크) 결정적 판정.
  function handleHazards(M, L, dt, dashing) {
    const t = M.simT();
    for (const s of M.course.segs) {
      // 1) 갈림길 벽: gateY 밴드 내에서, 막힌 레인 위에 있으면 충돌
      const inGate = L.y <= s.gateY + GATE_BAND * 0.5 && L.y >= s.gateY - GATE_BAND * 0.5;
      if (inGate) {
        const lane = laneOf(L.x, s.laneN);
        if (lane !== s.openLane) {
          // 벽에 막힘 → 통과 못함: 밴드 아래쪽 경계로 되밀고 감속
          const wallBottom = s.gateY + GATE_BAND * 0.5;
          if (L.y < wallBottom) { L.y = wallBottom; if (L.vy < 0) L.vy = 0; }
          if (t >= L.slowUntil) L.slowUntil = t + SLOW_WALL;
          // 체크포인트는 벽 직전으로
        }
      }
      // 2) 함정(통과 직후 직선부). 낙하=대시중엔 건너뜀.
      if (s.trap !== TRAP_NONE) {
        const near = Math.abs(L.y - s.trapY) <= 22;
        // 함정은 통과 레인 중앙 부근에만 배치(피할 좌우 여백 있음)
        const tcx = laneCenterX(s.laneN, s.openLane);
        const hitX = Math.abs(L.x - tcx) <= 30;
        if (near && hitX) {
          if (s.trap === TRAP_PIT) {
            if (!dashing) {
              // 낙하 → 직전 체크포인트로 복귀(시간손실, 탈락 없음)
              L.x = L.cp.x; L.y = L.cp.y;
              L.vy = 0; L.vx = 0;
              L.slowUntil = t + 200;
              if (!M.lowPower) M.vibrate(30);
            }
          } else if (s.trap === TRAP_SPIKE) {
            if (t >= L.stunUntil + 50) {  // 연속 중복기절 방지
              L.stunUntil = t + STUN_SPIKE;
              L.vy = 0; L.vx = 0;
              M.flash('스파이크!');
              if (!M.lowPower) M.vibrate(60);
            }
          }
        }
      }
      // 3) 체크포인트: 갈림길을 통과한 직후 지점으로 전진 갱신(y 가 더 작아질 때만)
      const cpY = s.gateY - GATE_BAND * 0.5 - 30;
      if (L.y < cpY && cpY < L.cp.y) {
        L.cp = { x: clamp(L.x, PLAYER_R, WORLD_W - PLAYER_R), y: cpY };
      }
    }
  }

  function laneOf(x, laneN) {
    const w = WORLD_W / laneN;
    return clamp(Math.floor(x / w), 0, laneN - 1);
  }

  /* ----------------------------- 순위/평균 ----------------------------- */
  function avgProg(M) {
    let sum = 0, cnt = 0;
    if (M.local) { sum += M.local.prog || 0; cnt++; }
    for (const seat of M.seats) {
      if (seat === M.mySeat) continue;
      const p = M.peerAt(seat);
      const pr = (p && p.prog != null) ? p.prog : ((M._peerProg && M._peerProg[seat]) || 0);
      sum += pr; cnt++;
    }
    return cnt ? sum / cnt : 0;
  }
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

  /* ----------------------------- 그리기 헬퍼 --------------------------- */
  // 캐릭터 = 원 + 좌석색 + 번호
  function drawRunner(ctx, cx, cy, scale, seat, fin, lowPower, isMe, stunned, dashing) {
    const r = Math.max(8, Math.round(PLAYER_R * scale));
    // 잔상/대시 글로우(저사양 OFF)
    if (dashing && !lowPower) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx, cy + r, r * 1.3, 0, Math.PI * 2); ctx.fill();
    }
    // 본체
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = stunned ? '#888' : seatColor(seat);
    ctx.fill();
    // 외곽(내 캐릭터 강조)
    ctx.lineWidth = isMe ? 3 : 2;
    ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();
    // 번호
    ctx.fillStyle = '#0b0e14';
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(seat), cx, cy + 1);
    if (fin) { // 완주 깃발 점
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.arc(cx + r, cy - r, Math.max(2, r * 0.3), 0, Math.PI * 2); ctx.fill();
    }
  }

  // 한 구간: 막힌 레인 벽(통과레인과 같은 회색벽) + 함정 마커
  function drawSegment(ctx, s, sx, sy, scale) {
    const bandTop = sy(s.gateY - GATE_BAND * 0.5);
    const bandBot = sy(s.gateY + GATE_BAND * 0.5);
    const h = bandBot - bandTop;
    // 막힌 레인 = 벽(통과 레인과 동일 외형의 회색 벽처럼)
    for (let lane = 0; lane < s.laneN; lane++) {
      const [x0, x1] = laneBounds(s.laneN, lane);
      const px0 = sx(x0), px1 = sx(x1);
      if (lane === s.openLane) {
        // 통과 레인: 약간 밝은 바닥(틈)
        ctx.fillStyle = '#16233a';
        ctx.fillRect(px0 + 2, bandTop, (px1 - px0) - 4, h);
      } else {
        // 벽: 통과 레인과 "같은 벽처럼" 보이게(동일 톤). 좌표는 seed 동일.
        ctx.fillStyle = '#33425e';
        ctx.fillRect(px0 + 2, bandTop, (px1 - px0) - 4, h);
        // 벽 스트라이프(시각 구분)
        ctx.fillStyle = '#2a3650';
        for (let yy = bandTop; yy < bandBot; yy += 10) ctx.fillRect(px0 + 2, yy, (px1 - px0) - 4, 4);
      }
    }
    // 레인 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let lane = 1; lane < s.laneN; lane++) {
      const x = sx(laneBounds(s.laneN, lane)[0]);
      ctx.beginPath(); ctx.moveTo(x, sy(s.topY)); ctx.lineTo(x, sy(s.topY + SEG_H)); ctx.stroke();
    }
    // 함정 마커
    if (s.trap !== TRAP_NONE) {
      const tcx = sx(laneCenterX(s.laneN, s.openLane));
      const tcy = sy(s.trapY);
      const rr = Math.round(20 * scale);
      if (s.trap === TRAP_PIT) {
        ctx.fillStyle = '#05080f';
        ctx.beginPath(); ctx.ellipse(tcx, tcy, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0a1018'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        // 스파이크: 빨간 삼각 톱니
        ctx.fillStyle = '#c8324a';
        const n = 4, w = rr * 1.6, step = w / n;
        ctx.beginPath();
        ctx.moveTo(tcx - w / 2, tcy + 6);
        for (let k = 0; k < n; k++) {
          const x0 = tcx - w / 2 + step * k;
          ctx.lineTo(x0 + step / 2, tcy - 8);
          ctx.lineTo(x0 + step, tcy + 6);
        }
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // 결승선 체크무늬
  function drawFinish(ctx, sx, sy, scale) {
    const y = sy(FINISH_Y);
    const cell = Math.max(8, Math.round(14 * scale));
    const W = sx(WORLD_W);
    for (let x = 0; x < W; x += cell) {
      ctx.fillStyle = ((Math.floor(x / cell) % 2) === 0) ? '#f2f4f8' : '#11151d';
      ctx.fillRect(x, y - cell, cell, cell);
      ctx.fillStyle = ((Math.floor(x / cell) % 2) === 0) ? '#11151d' : '#f2f4f8';
      ctx.fillRect(x, y - cell * 2, cell, cell);
    }
    ctx.fillStyle = '#ffd54a';
    ctx.font = `bold ${Math.round(16 * scale)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('FINISH', W / 2, y - cell * 2 - 4);
  }

  // 우측 미니 진행레일(나/원격 점)
  function drawProgressRail(M, ctx, W, H) {
    const x = W - 12, top = 16, bot = H - 16;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    const place = (prog, seat, me) => {
      const k = clamp(prog / TRACK_LEN, 0, 1);
      const yy = Math.round(bot - (bot - top) * k);  // 위가 결승
      ctx.beginPath(); ctx.arc(x, yy, me ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = seatColor(seat); ctx.fill();
      if (me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    };
    for (const seat of M.seats) {
      if (seat === M.mySeat) continue;
      const p = M.peerAt(seat);
      const pr = (p && p.prog != null) ? p.prog : ((M._peerProg && M._peerProg[seat]) || 0);
      place(pr, seat, false);
    }
    if (M.local) place(M.local.prog, M.mySeat, true);
  }

  /* ----------------------------- 유틸 --------------------------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  window.MiniGames.race = race;
})();
