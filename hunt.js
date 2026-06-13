/* =========================================================================
   hunt.js — "나도 사람이야" (술래잡기 in 군중)
   술래(seeker) 1명이 결정론 AI 군중(NPC) 속에 숨은 플레이어(hider)들을 색출.
   제한시간 생존 = 숨은측 승, 전원 색출 = 술래 승. 2~8인.

   계약: window.MiniGames.hunt = { label, init, step, draw, hud, netPayload,
                                   onPeer, actionLabel, hostTick, finishPatch }
   - 모든 무작위는 M.rng(seed) (mulberry32) 만 사용. JS 내장 난수 금지.
   - 외형: 모든 엔티티(플레이어·NPC) 동일한 군중색 원 — 본인만 자기 정체를 앎.
   - 호스트 권위: 색출/오인 판정 → M.pushPatch({alive}) 로 저빈도 전파.
   ========================================================================= */
(function () {
  window.MiniGames = window.MiniGames || {};

  // ---- 월드/물리 상수 (CSS px, 정수화로 기기간 일치) ----
  const FIELD_W = 1200, FIELD_H = 800;   // 고정 경계 광장(논리 좌표)
  const WALL = 24;                       // 경계 여백
  const R_ENT = 13;                      // 엔티티 반경
  const SPEED = 132;                     // 이동 속도 캡(px/s) — 플레이어·NPC 동일
  const AIM_R = 64;                      // 술래 조준(제거) 반경
  const COOL_OK = 900;                   // 색출 성공/일반 쿨다운(ms)
  const COOL_MISS = 2600;                // 오인 패널티 쿨다운(ms)
  const CROWD_COLOR = '#c8cdd6';         // 군중 단색(모두 동일)
  const CROWD_EDGE = '#8b909a';

  // ---- 군중(NPC) 규모: hider 수*8, [16..60] ----
  function npcCount(M, hiderN) {
    // 기기 독립(결정론): lowPower 와 무관하게 전 클라 동일 군중수여야 색출 판정이 일치.
    // 저사양 최적화는 '생성 수'가 아니라 draw 의 화면밖 컬링에서만.
    return Math.min(60, Math.max(16, hiderN * 8)) | 0;
  }

  // ---- 역할/제한시간 도출(state 우선, 없으면 seed 로 결정론 산출) ----
  function ensureRoles(M) {
    const st = M.state;
    if (st.roles && st.it != null) return;           // app.js 가 이미 세팅
    // 폴백: seed 로 술래 1명 결정(전 클라 동일)
    const seats = M.seats.slice();
    const r = M.rng((st.seed | 0) ^ 0x5eed);
    const idx = Math.floor(r() * seats.length) % seats.length;
    const it = seats[idx];
    const roles = {};
    seats.forEach(s => { roles[s] = (s === it) ? 'seeker' : 'hider'; });
    st.it = it; st.roles = roles;
  }

  function myRole(M) { return (M.state.roles || {})[M.mySeat] || 'hider'; }
  function isAlive(M, seat) {
    const a = M.state.alive || {};
    return a[seat] !== false;   // 미정의=생존
  }

  // =========================================================================
  // NPC 결정론 배회 — 순수함수 npcPos(i,t): seed+i PRNG 로 웨이포인트 사인 이동.
  // 네트워크 전송 0. 모든 클라가 같은 t(=simT)로 같은 좌표를 계산.
  // =========================================================================
  // 각 NPC 의 고정 파라미터(스폰·진동) — init 에서 1회 생성.
  function buildNpcs(M, count, seed) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const rr = M.rng((seed | 0) + 1013 * (i + 1));
      // 기준 위치(광장 내부)
      const bx = WALL + R_ENT + rr() * (FIELD_W - 2 * (WALL + R_ENT));
      const by = WALL + R_ENT + rr() * (FIELD_H - 2 * (WALL + R_ENT));
      // 두 축 사인 진동(서로 다른 위상·주기 → 부드러운 8자/배회)
      const ax = 30 + rr() * 70, ay = 30 + rr() * 70;
      const wx = 0.35 + rr() * 0.5, wy = 0.35 + rr() * 0.5;   // rad/s
      const px = rr() * Math.PI * 2, py = rr() * Math.PI * 2;
      // 느린 표류(웨이포인트 효과) — 경계서 반사
      const dvx = (rr() - 0.5) * 40, dvy = (rr() - 0.5) * 40;  // px/s
      list.push({ bx, by, ax, ay, wx, wy, px, py, dvx, dvy });
    }
    return list;
  }
  // 순수: 시간 t(ms) 에서 NPC i 의 좌표(정수). 경계 반사로 광장 안에 가둠.
  function npcPos(npc, t) {
    const s = t / 1000;
    const lo = WALL + R_ENT, hiX = FIELD_W - WALL - R_ENT, hiY = FIELD_H - WALL - R_ENT;
    // 표류 + 진동
    let x = npc.bx + npc.dvx * s + npc.ax * Math.sin(npc.wx * s + npc.px);
    let y = npc.by + npc.dvy * s + npc.ay * Math.sin(npc.wy * s + npc.py);
    x = reflect(x, lo, hiX); y = reflect(y, lo, hiY);
    return { x: Math.round(x), y: Math.round(y) };
  }
  // [lo,hi] 구간 삼각파 반사(연속·결정론)
  function reflect(v, lo, hi) {
    const span = hi - lo; if (span <= 0) return lo;
    let p = (v - lo) % (2 * span); if (p < 0) p += 2 * span;
    return lo + (p <= span ? p : 2 * span - p);
  }

  // =========================================================================
  // 모듈
  // =========================================================================
  window.MiniGames.hunt = {
    label: '나도 사람이야',

    init(M) {
      ensureRoles(M);
      const seed = (M.state.seed | 0) || 1;
      const st = M.state;
      // hider 수
      let hiderN = 0;
      M.seats.forEach(s => { if ((st.roles[s] || 'hider') === 'hider') hiderN++; });
      if (hiderN < 1) hiderN = Math.max(1, M.n - 1);
      // 제한시간(초) — state 우선, 기본 120s
      M.h_limitSec = (st.limitSec | 0) || 120;
      // NPC 군중(결정론)
      M.h_npcs = buildNpcs(M, npcCount(M, hiderN), seed);
      // 내 엔티티(M.local) — 좌석별 결정론 스폰
      if (!M.amSpectator) {
        const rr = M.rng((seed | 0) ^ (0xa11 * (M.mySeat + 1)));
        M.local = {
          x: Math.round(WALL + R_ENT + rr() * (FIELD_W - 2 * (WALL + R_ENT))),
          y: Math.round(WALL + R_ENT + rr() * (FIELD_H - 2 * (WALL + R_ENT))),
        };
      } else {
        M.local = null;
      }
      // 카메라(본인 추적; 관전자는 중앙)
      M.h_cam = { x: FIELD_W / 2, y: FIELD_H / 2 };
      // 술래 쿨다운(로컬 표시용; 권위는 호스트)
      M.h_cool = 0;            // ms 남음
      M.h_lastEmote = 0;       // 내 감정표현 타임스탬프
      M.h_emotes = {};         // seat -> 표시 만료 t(ms)
      // 호스트 권위 추적
      if (M.isHost) {
        M.h_alive = {};        // seat -> bool (hider 만 의미)
        M.h_caughtMid = {};    // seat -> 중도 색출 여부
        M.h_misses = 0;        // 오인 총합(표시)
        M.seats.forEach(s => { if ((st.roles[s] || 'hider') === 'hider') M.h_alive[s] = true; });
      }
      M.h_msg = '';            // 하단 토스트성 메시지
    },

    // ----------------------- 시뮬레이션(본인만) -----------------------
    step(M, dt) {
      const me = M.local; if (!me) return;
      const dead = (myRole(M) === 'hider') && !isAlive(M, M.mySeat);
      // 쿨다운 감소
      if (M.h_cool > 0) M.h_cool = Math.max(0, M.h_cool - dt);
      // 감정표현 만료 청소(가벼움)
      const now = M.simT();
      for (const k in M.h_emotes) { if (M.h_emotes[k] <= now) delete M.h_emotes[k]; }

      if (dead) {                          // 사망 hider = 입력무시(관전)
        focusCam(M, me, dt, true);
        return;
      }

      // 이동(캡 적용) — NPC 와 동일 물리
      const ix = M.input.dx || 0, iy = M.input.dy || 0;
      const mag = Math.hypot(ix, iy);
      if (mag > 0) {
        const k = (mag > 1 ? 1 / mag : 1);
        me.x += ix * k * SPEED * (dt / 1000);
        me.y += iy * k * SPEED * (dt / 1000);
      }
      // 경계 클램프
      me.x = clamp(me.x, WALL + R_ENT, FIELD_W - WALL - R_ENT);
      me.y = clamp(me.y, WALL + R_ENT, FIELD_H - WALL - R_ENT);

      // 액션
      if (M.input.action) {
        if (myRole(M) === 'seeker') {
          if (M.h_cool <= 0) {
            // 즉시 쿨다운(연타 방지) — 판정은 호스트
            M.h_cool = COOL_OK;
            M.send({ kill: 1, seat: M.mySeat, x: Math.round(me.x), y: Math.round(me.y), t: now });
            M.vibrate(15);
            // 내가 호스트면 직접 판정
            if (M.isHost) judgeKill(M, M.mySeat, Math.round(me.x), Math.round(me.y));
          }
        } else {
          // hider 감정표현(하트) — 위험하지만 본인 표현
          M.h_lastEmote = now;
          M.h_emotes[M.mySeat] = now + 900;
          M.send({ emote: 1, seat: M.mySeat, t: now });
        }
      }
      focusCam(M, me, dt, false);
    },

    // ----------------------- 그리기 -----------------------
    draw(M) {
      const ctx = M.ctx, t = M.simT();
      const cam = M.h_cam;
      // 카메라 → 화면 변환(본인을 중앙에). 광장이 화면보다 작으면 중앙 정렬.
      const ox = Math.round(M.W / 2 - cam.x);
      const oy = Math.round(M.H / 2 - cam.y);
      const sx = x => x + ox, sy = y => y + oy;

      // 배경 광장
      ctx.fillStyle = '#1b2433';
      ctx.fillRect(sx(0), sy(0), FIELD_W, FIELD_H);
      // 격자(저사양 생략)
      if (!M.lowPower) {
        ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = 0; gx <= FIELD_W; gx += 80) { ctx.moveTo(sx(gx), sy(0)); ctx.lineTo(sx(gx), sy(FIELD_H)); }
        for (let gy = 0; gy <= FIELD_H; gy += 80) { ctx.moveTo(sx(0), sy(gy)); ctx.lineTo(sx(FIELD_W), sy(gy)); }
        ctx.stroke();
      }
      // 경계 벽
      ctx.strokeStyle = '#3a475c'; ctx.lineWidth = WALL;
      ctx.strokeRect(sx(WALL / 2), sy(WALL / 2), FIELD_W - WALL, FIELD_H - WALL);

      // 가시 범위(컬링) — 화면 + 마진
      const vis = (x, y) => x > -ox - 40 && x < -ox + M.W + 40 && y > -oy - 40 && y < -oy + M.H + 40;

      // 1) NPC 군중(결정론, 화면 밖 컬링)
      for (let i = 0; i < M.h_npcs.length; i++) {
        const p = npcPos(M.h_npcs[i], t);
        if (!vis(p.x, p.y)) continue;
        drawCrowd(ctx, sx(p.x), sy(p.y), false);
      }

      // 2) 원격 플레이어(보간) — 동일 외형. 사망 hider 는 흐리게.
      const roles = M.state.roles || {};
      for (const seat of M.seats) {
        if (seat === M.mySeat) continue;
        const pp = M.peerAt(seat);
        if (!pp || pp.x == null) continue;
        const hiderDead = (roles[seat] === 'hider') && !isAlive(M, seat);
        if (!vis(pp.x, pp.y)) { /* 화면 밖도 emote 는 생략 */ continue; }
        drawCrowd(ctx, sx(pp.x), sy(pp.y), hiderDead);
        if (M.h_emotes[seat] && M.h_emotes[seat] > t) drawHeart(ctx, sx(pp.x), sy(pp.y) - R_ENT - 10);
      }

      // 3) 본인 — 동일 외형이나 얇은 표식(나만 보임)
      const me = M.local;
      if (me) {
        const meDead = (myRole(M) === 'hider') && !isAlive(M, M.mySeat);
        drawCrowd(ctx, sx(me.x), sy(me.y), meDead);
        // 본인 표식: 좌석색 링 + 번호(나만의 식별)
        ctx.lineWidth = 2.5; ctx.strokeStyle = seatColor(M.mySeat);
        ctx.beginPath(); ctx.arc(sx(me.x), sy(me.y), R_ENT + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#0c0f16'; ctx.font = 'bold 12px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(myRole(M) === 'seeker' ? '술' : String(M.mySeat), sx(me.x), sy(me.y));
        // 술래 조준원 + 쿨다운
        if (myRole(M) === 'seeker' && !meDead) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = M.h_cool > 0 ? 'rgba(255,93,93,0.35)' : 'rgba(255,93,93,0.85)';
          ctx.beginPath(); ctx.arc(sx(me.x), sy(me.y), AIM_R, 0, Math.PI * 2); ctx.stroke();
          if (M.h_cool > 0) {   // 쿨다운 호(시계방향 감소)
            const frac = M.h_cool / COOL_MISS;
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(sx(me.x), sy(me.y), AIM_R + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
            ctx.stroke();
          }
        }
        // 내 감정표현
        if (M.h_emotes[M.mySeat] && M.h_emotes[M.mySeat] > t) drawHeart(ctx, sx(me.x), sy(me.y) - R_ENT - 10);
      }
    },

    // ----------------------- HUD -----------------------
    hud(M) {
      const role = myRole(M);
      const remain = Math.max(0, (M.h_limitSec * 1000) - M.simT());
      const sec = Math.ceil(remain / 1000);
      const mmss = `${String(Math.floor(sec / 60)).padStart(1, '0')}:${String(sec % 60).padStart(2, '0')}`;
      // 생존 hider 수 계산(state.alive 기준)
      const roles = M.state.roles || {};
      let h = 0, found = 0;
      M.seats.forEach(s => { if ((roles[s] || 'hider') === 'hider') { h++; if (!isAlive(M, s)) found++; } });
      const tag = role === 'seeker'
        ? `<b style="color:#ff5d5d">술래</b>`
        : (isAlive(M, M.mySeat) ? `<b style="color:#43d18b">숨은이</b>` : `<b style="color:#8b909a">색출됨</b>`);
      let right;
      if (role === 'seeker') {
        const miss = M.isHost ? (M.h_misses || 0) : '?';
        right = `색출 ${found}/${h} · 오인 ${miss}`;
      } else {
        right = isAlive(M, M.mySeat) ? `생존 중 · 남은 ${h - found}명` : `관전 중`;
      }
      const msg = M.h_msg ? `<div class="mini-hud__msg">${esc(M.h_msg)}</div>` : '';
      return `<div class="mini-hud__row"><span>${GAME_LOGO.hunt} ${tag}</span><span>⏱ ${mmss}</span><span>${right}</span></div>${msg}`;
    },

    // ----------------------- 넷코드 -----------------------
    netPayload(M) {
      const me = M.local; if (!me) return null;
      return { x: Math.round(me.x), y: Math.round(me.y) };
    },

    // peer 이벤트(위치는 core 보간). kill/emote/miss 만 처리.
    onPeer(M, seat, msg) {
      if (msg.emote) { M.h_emotes[seat] = (msg.t || M.simT()) + 900; return; }
      // 호스트가 통지한 오인 패널티 — 내가 그 술래면 쿨다운 연장
      if (msg.miss && msg.seat === M.mySeat && myRole(M) === 'seeker') { M.h_cool = COOL_MISS; return; }
      if (msg.kill && M.isHost) {
        // 호스트가 권위 판정(자기 kill 은 step 에서 직접 처리됨)
        if (seat !== M.mySeat) judgeKill(M, seat, msg.x | 0, msg.y | 0);
      }
    },

    actionLabel(M) { return myRole(M) === 'seeker' ? '제거' : '표현'; },

    // ----------------------- 호스트 종료조건 -----------------------
    hostTick(M, dt) {
      // 시간 초과 또는 전원 색출 → 종료
      const over = M.simT() >= (M.h_limitSec * 1000);
      let allFound = true, any = false;
      const roles = M.state.roles || {};
      M.seats.forEach(s => {
        if ((roles[s] || 'hider') === 'hider') { any = true; if (M.h_alive[s] !== false) allFound = false; }
      });
      if (over || (any && allFound)) {
        M.h_msg = allFound && !over ? '전원 색출! 술래 승' : '시간 종료';
        M.endGame();
      }
    },

    // 호스트 추적값 → state 권위필드. RPC(rk_finish_hunt)가 found/survived 파생.
    finishPatch(M) {
      const alive = {}, caughtMid = {};
      const roles = M.state.roles || {};
      M.seats.forEach(s => {
        if ((roles[s] || 'hider') === 'hider') {
          alive[s] = (M.h_alive && M.h_alive[s] !== false);
          caughtMid[s] = !!(M.h_caughtMid && M.h_caughtMid[s]);
        }
      });
      return { alive, roles, it: M.state.it, caughtMid };
    },
  };

  // =========================================================================
  // 호스트 권위 판정 — (sx,sy) 술래 좌표 기준 AIM_R 내 최근접 엔티티 찾기.
  //   최근접이 hider → 색출(alive=false, 중도색출 표기) + pushPatch
  //   최근접이 NPC   → 오인(쿨다운↑, misses++)  (alive 변경 없음)
  // =========================================================================
  function judgeKill(M, seekerSeat, kx, ky) {
    if (!M.isHost) return;
    // 술래만 제거 가능
    if ((M.state.roles || {})[seekerSeat] !== 'seeker') return;
    const t = M.simT();
    let best = null, bestD = AIM_R; // 반경 내만
    // 후보 1: 살아있는 hider(원격은 peerAt, 본인은 local)
    const roles = M.state.roles || {};
    for (const seat of M.seats) {
      if (seat === seekerSeat) continue;
      if ((roles[seat] || 'hider') !== 'hider') continue;
      if (M.h_alive[seat] === false) continue;     // 이미 색출
      let pos = null;
      if (seat === M.mySeat && M.local) pos = M.local;
      else { const pp = M.peerAt(seat); if (pp && pp.x != null) pos = pp; }
      if (!pos) continue;
      const d = Math.hypot(pos.x - kx, pos.y - ky);
      if (d <= bestD) { bestD = d; best = { type: 'hider', seat }; }
    }
    // 후보 2: NPC(결정론 좌표). hider 보다 더 가까우면 오인 대상.
    for (let i = 0; i < M.h_npcs.length; i++) {
      const p = npcPos(M.h_npcs[i], t);
      const d = Math.hypot(p.x - kx, p.y - ky);
      if (d <= bestD) { bestD = d; best = { type: 'npc' }; }
    }
    if (!best) return;  // 반경 내 아무것도 없음 — 쿨다운만(step 에서 이미 적용)

    if (best.type === 'hider') {
      M.h_alive[best.seat] = false;
      M.h_caughtMid[best.seat] = true;   // 시간 종료 전 색출
      M.h_msg = `색출! (${M.state.names && M.state.names[best.seat] ? M.state.names[best.seat] : best.seat + '번'})`;
      M.vibrate(40);
      // 저빈도 권위 전파
      M.pushPatch({ alive: Object.assign({}, M.state.alive || {}, { [best.seat]: false }) });
    } else {
      // 오인 — 술래에게만 패널티(쿨다운↑). 본인이 술래면 쿨 연장.
      M.h_misses = (M.h_misses || 0) + 1;
      M.h_msg = '오인! (군중 NPC)';
      if (seekerSeat === M.mySeat) M.h_cool = COOL_MISS;
      else M.send({ miss: 1, seat: seekerSeat, t });   // 술래에게 쿨 패널티 통지
    }
  }

  // =========================================================================
  // 보조
  // =========================================================================
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // 카메라 부드럽게 추적(본인). 관전자/사망자는 본인 위치 고정.
  function focusCam(M, me, dt, dead) {
    const tx = me.x, ty = me.y;
    const k = M.lowPower ? 1 : Math.min(1, dt / 120);
    M.h_cam.x += (tx - M.h_cam.x) * k;
    M.h_cam.y += (ty - M.h_cam.y) * k;
  }

  // 군중 원(모두 동일 외형). dead=true → 흐리게.
  function drawCrowd(ctx, x, y, dead) {
    ctx.globalAlpha = dead ? 0.28 : 1;
    ctx.fillStyle = CROWD_COLOR;
    ctx.beginPath(); ctx.arc(x, y, R_ENT, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = CROWD_EDGE;
    ctx.beginPath(); ctx.arc(x, y, R_ENT, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 하트(감정표현) — 단색 도형.
  function drawHeart(ctx, x, y) {
    ctx.fillStyle = '#ff6fae';
    ctx.beginPath();
    ctx.arc(x - 4, y, 4, 0, Math.PI * 2);
    ctx.arc(x + 4, y, 4, 0, Math.PI * 2);
    ctx.moveTo(x - 8, y + 1); ctx.lineTo(x, y + 9); ctx.lineTo(x + 8, y + 1);
    ctx.closePath(); ctx.fill();
  }
})();
