/* =========================================================================
   wordbomb.js — 말잇폭(끝말잇기 폭탄돌리기) 게임 로직 (클라이언트, 순수)
   루미큐브와 동일 인프라(방/방장/티어/점수/연승) 재사용. 사전 없음(우기는 것도 재미).
   - 폭탄 심지(fuse)는 기존 턴 타이머 메커니즘 재사용(turn_started_at + state.fuse).
   - 게임 종료 시 좌석별 finishScore(낮을수록 1등)를 만들어 서버 rk_finish_generic 이 채점.
   ========================================================================= */

const WB_SEEDS = [
  '사과','바다','구름','나무','하늘','기차','학교','시간','우유','가방',
  '노래','두부','라면','만두','수박','지구','초밥','커피','토끼','파도',
  '햇살','강물','단어','모자','보물','소리','연필','자유','책상','풍선',
  '바람','시계','우산','전화','창문','호수','구두','다리','마음','별빛',
  '신발','얼음','정원','주말','참새','거울','노을','달빛','바위','사슴',
];

/* ---- 한글 두음 매칭 ---- */
function wbDecompose(ch){ const c = (ch||'').charCodeAt(0) - 0xAC00; if(c < 0 || c > 11171) return null; return { ini: Math.floor(c/588), med: Math.floor((c%588)/28), fin: c%28 }; }
// a 가 요구문자 b 를 두음법칙(ㄴ/ㄹ/ㅇ 교체)으로 만족하는가
function wbDueumMatch(a, b){
  if(a === b) return true;
  const da = wbDecompose(a), db = wbDecompose(b);
  if(!da || !db) return false;
  if(da.med !== db.med || da.fin !== db.fin) return false;
  const grp = new Set([2, 5, 11]); // ㄴ, ㄹ, ㅇ
  return grp.has(da.ini) && grp.has(db.ini);
}
function wbLastChar(word){ return word ? word[word.length - 1] : ''; }
function wbReqChar(state){ return wbLastChar(state.lastWord); }

// 검증: 통과면 null, 실패면 사유 문자열
function wbValidate(word, state){
  word = (word || '').trim();
  if(!/^[가-힣]+$/.test(word)) return '한글 단어만 입력하세요';
  const minLen = state.rules.allowSingle ? 1 : 2;
  if(word.length < minLen) return minLen + '글자 이상 입력하세요';
  if((state.usedWords || []).includes(word)) return '이미 나온 단어예요';
  const req = wbReqChar(state);
  const ok = state.rules.dueum ? wbDueumMatch(word[0], req) : (word[0] === req);
  if(!ok) return `'${req}'(으)로 시작해야 해요`;
  return null;
}

function wbRandomSeed(used){
  const pool = WB_SEEDS.filter(w => !(used || []).includes(w));
  const arr = pool.length ? pool : WB_SEEDS;
  return arr[Math.floor(Math.random() * arr.length)];
}

// 초기 상태. seats: 착석 좌석 배열. opts: {fuse, dueum, allowSingle, startLives}
function buildWordState(seats, players, names, scores, opts){
  const seed = WB_SEEDS[Math.floor(Math.random() * WB_SEEDS.length)];
  const lives = {}, defused = {}, exploded = {};
  seats.forEach(s => { lives[s] = opts.startLives; defused[s] = 0; exploded[s] = 0; });
  return {
    game: 'wordbomb', players, names, scores, n: seats.length,
    turn: Math.min(...seats),
    lastWord: seed, usedWords: [seed],
    startFuse: opts.fuse, fuse: opts.fuse,
    rules: { dueum: !!opts.dueum, allowSingle: !!opts.allowSingle, startLives: opts.startLives },
    lives, defused, exploded,
    alive: seats.slice(), eliminated: [],
    status: 'playing', results: null,
    lastEvent: { type: 'start', word: seed },
  };
}

function wbNextAlive(state, fromSeat){
  const al = state.alive.slice().sort((a,b)=>a-b);
  if(al.length <= 1) return al[0];
  const after = al.filter(s => s > fromSeat);
  return after.length ? after[0] : al[0];
}

// 성공: 단어 통과 → 다음 사람에게 (심지 ×0.9, 최소 4초)
function wbApplyPass(state, seat, word){
  const s = JSON.parse(JSON.stringify(state));
  s.lastWord = word;
  s.usedWords.push(word);
  s.defused[seat] = (s.defused[seat] || 0) + 1;
  s.fuse = Math.max(4, Math.round(s.fuse * 0.9 * 10) / 10);
  s.turn = wbNextAlive(s, seat);
  s.lastEvent = { type: 'pass', seat, word };
  return s;
}

// 폭발: 시간초과 → 목숨 -1, 폭탄 리셋, 다음 사람에게
function wbApplyExplode(state, seat){
  const s = JSON.parse(JSON.stringify(state));
  s.exploded[seat] = (s.exploded[seat] || 0) + 1;
  s.lives[seat] = (s.lives[seat] || 0) - 1;
  s.lastEvent = { type: 'boom', seat, word: s.lastWord };
  if(s.lives[seat] <= 0){
    s.alive = s.alive.filter(x => x !== seat);
    if(!s.eliminated.includes(seat)) s.eliminated.push(seat);
    s.lastEvent.elim = true;
  }
  const seed = wbRandomSeed(s.usedWords);
  s.lastWord = seed; s.usedWords.push(seed);
  s.fuse = s.startFuse;
  s.turn = wbNextAlive(s, seat);
  return s;
}

function wbGameOver(state){ return (state.alive || []).length <= 1; }

// 좌석별 finishScore(낮을수록 1등). 생존자=최저, 먼저 탈락=최고. 마진 텍스처 위해 폭발·방어 반영.
function wbFinishScores(state){
  const out = {};
  const elimOrder = state.eliminated || [];
  const total = state.n;
  Object.keys(state.players).forEach(k=>{
    const seat = Number(k);
    const exploded = state.exploded[seat] || 0;
    const defused = state.defused[seat] || 0;
    const ei = elimOrder.indexOf(seat);                 // -1 = 생존
    const elimPenalty = ei >= 0 ? (total - ei) * 8 : 0; // 먼저 탈락(작은 ei)일수록 큰 페널티
    out[seat] = Math.max(0, exploded * 10 + elimPenalty - defused);
  });
  return out;
}
