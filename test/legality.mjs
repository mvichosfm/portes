// Independent legality audit of src/engine.js: node test/legality.mjs [games=60] [synthetic=1500]
//
// A from-scratch Portes rules implementation on the ABSOLUTE board (no engine code, no shared
// numbering): 24 cells, each { c: 'W' | 'B' | '', n }, plus a bar and an off count per colour.
// White moves from cell 23 down to cell 0 and off, entering from the bar as if from cell 24; black
// moves from cell 0 up to cell 23 and off, entering as if from cell -1. For every test position x
// all 21 rolls it brute-forces every legal full play and compares the set of resulting boards with
//   1. engine.finalPositions (what the computer chooses from),
//   2. every board reachable by clicking through turnSteps / turnPlay (what the player can do),
//      checking each offered step's squares, no dead ends and T.M,
//   3. the computer's chosen plays (levels 4 and 5 on a sample),
// and compares engine.winner with its own reading of the game result.
// FAILS are printed with the position; exit code 1 on any failure.
// PORTES_ENGINE=<path> audits another engine copy (used to prove the audit catches rule mutants).
import { pathToFileURL } from 'node:url';
const E = await import(process.env.PORTES_ENGINE ? pathToFileURL(process.env.PORTES_ENGINE).href : '../src/engine.js');

const GAMES = +(process.argv[2] || 60), SYNTH = +(process.argv[3] || 1500);

// ------------------------------------------------------------------ reference implementation
const other = (c) => (c === 'W' ? 'B' : 'W');
const dirOf = (c) => (c === 'W' ? -1 : 1);
const barCell = (c) => (c === 'W' ? 24 : -1);
const inHome = (c, a) => (c === 'W' ? a <= 5 : a >= 18);
const BARSQ = 99; // the reference's "from the bar" marker

function refLegalStep(B, c, a, d) {
  // returns the target cell (-1 = off) or null; a = BARSQ moves from the bar
  if (B.bar[c] && a !== BARSQ) return null;
  if (a === BARSQ) { if (!B.bar[c]) return null; } else if (B.cells[a].c !== c) return null;
  const from = a === BARSQ ? barCell(c) : a;
  const b = from + dirOf(c) * d;
  if (b >= 0 && b <= 23) {
    const t = B.cells[b];
    if (t.c === other(c) && t.n >= 2) return null;
    return b;
  }
  if (a === BARSQ) return null;
  // bearing off: every checker of mine inside the home board, none on the bar
  for (let k = 0; k < 24; k++) if (!inHome(c, k) && B.cells[k].c === c) return null;
  const dist = c === 'W' ? a + 1 : 24 - a;
  if (d === dist) return -1;
  // a higher die: only when no checker of mine stands farther from home inside the home board
  if (c === 'W') { for (let k = a + 1; k <= 5; k++) if (B.cells[k].c === c) return null; }
  else { for (let k = 18; k < a; k++) if (B.cells[k].c === c) return null; }
  return -1;
}
function refApply(B, c, a, b) {
  const N = { cells: B.cells.map((x) => ({ ...x })), bar: { ...B.bar }, off: { ...B.off } };
  if (a === BARSQ) N.bar[c]--;
  else { N.cells[a].n--; if (!N.cells[a].n) N.cells[a].c = ''; }
  if (b === -1) { N.off[c]++; return N; }
  const t = N.cells[b];
  if (t.c === other(c)) { N.bar[other(c)]++; t.n = 0; } // a hit (the legal check allowed only a lone one)
  t.c = c; t.n++;
  return N;
}
const refKey = (B) => B.cells.map((x) => (x.n ? x.c + x.n : '')).join('.') + '|bar' + B.bar.W + ',' + B.bar.B + '|off' + B.off.W + ',' + B.off.B;
const SQUARES = [BARSQ, ...Array.from({ length: 24 }, (_, i) => i)];

// every legal full play: Map(finalKey -> { steps: [[a, b, d]], board })
function refPlays(B, c, dice) {
  const rem0 = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
  const finals = new Map();
  let maxLen = 0;
  const seen = new Set();
  const go = (S, rem, steps) => {
    const k = refKey(S) + '#' + rem.slice().sort().join('') + '#' + steps.length;
    if (seen.has(k)) return;
    seen.add(k);
    let any = false;
    for (let i = 0; i < rem.length; i++) {
      if (rem.indexOf(rem[i]) !== i) continue;
      for (const a of SQUARES) {
        const b = refLegalStep(S, c, a, rem[i]);
        if (b === null) continue;
        any = true;
        go(refApply(S, c, a, b), rem.slice(0, i).concat(rem.slice(i + 1)), steps.concat([[a, b, rem[i]]]));
      }
    }
    if (!any) {
      if (steps.length > maxLen) maxLen = steps.length;
      const fk = refKey(S);
      if (!finals.has(fk) || finals.get(fk).steps.length < steps.length) finals.set(fk, { steps, board: S });
    }
  };
  go(B, rem0, []);
  let out = [...finals.entries()].filter(([, v]) => v.steps.length === maxLen);
  if (maxLen === 1 && dice[0] !== dice[1]) {
    const hi = Math.max(...dice);
    // keep plays using the larger die; a final reachable both ways counts as "uses the larger" if any way does
    const viaHi = new Set();
    for (const a of SQUARES) { const b = refLegalStep(B, c, a, hi); if (b !== null) viaHi.add(refKey(refApply(B, c, a, b))); }
    if (viaHi.size) out = out.filter(([k]) => viaHi.has(k));
  }
  return { maxLen, finals: new Map(out) };
}

// the game result the reference reads off a board: 1 point, 2 if the loser has borne nothing off
function refResult(B) {
  if (B.off.W === 15) return { w: 'W', pts: B.off.B ? 1 : 2 };
  if (B.off.B === 15) return { w: 'B', pts: B.off.W ? 1 : 2 };
  return null;
}

// ------------------------------------------------------------------ engine <-> reference
function toRef(g) {
  const cells = Array.from({ length: 24 }, () => ({ c: '', n: 0 }));
  for (let a = 0; a < 24; a++) {
    const wc = g.pos[0][a + 1], bc = g.pos[1][24 - a];
    if (wc && bc) throw new Error('engine position: both colours on cell ' + a);
    if (wc) cells[a] = { c: 'W', n: wc };
    if (bc) cells[a] = { c: 'B', n: bc };
  }
  return { cells, bar: { W: g.pos[0][25], B: g.pos[1][25] }, off: { W: g.off[0], B: g.off[1] } };
}
function leafGame(g, p, f) {
  const n = E.cloneGame(g);
  n.pos[p] = Int8Array.from(f.mine); n.pos[1 - p] = Int8Array.from(f.opp); n.off[p] = f.myOff;
  return n;
}
const engSquare = (p, r) => (r === 25 ? BARSQ : E.absOf(p, r));

// ------------------------------------------------------------------ the audit
let fails = 0, comparisons = 0, clicks = 0, chosen = 0, results = 0, replays = 0;
const stats = { hits: 0, enters: 0, barBlocked: 0, blockedSteps: 0, bearOff: 0, noMove: 0, oneDie: 0, largerDieBound: 0, gammon: 0 };
const ROLLS = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b]);
const fail = (msg, g, p, d) => {
  fails++;
  if (fails <= 12) console.log(`FAIL: ${msg}\n  side ${p} dice ${d}\n  ${refKey(toRef(g))}`);
};

function audit(g, p, sample) {
  const B = toRef(g), c = p === 0 ? 'W' : 'B';
  // the engine's result reading must match the reference on this position
  const er = E.winner(g), rr = refResult(B);
  results++;
  const erTxt = er ? `${er.p === 0 ? 'W' : 'B'}/${er.points}` : 'none';
  const rrTxt = rr ? `${rr.w}/${rr.pts}` : 'none';
  if (erTxt !== rrTxt) fail(`winner ${erTxt} vs reference ${rrTxt}`, g, p, '-');
  if (er) { if (er.points === 2) stats.gammon++; return; }
  for (const d of ROLLS) {
    comparisons++;
    const ref = refPlays(B, c, d);
    const refSet = new Set(ref.finals.keys());
    // 1. enumeration
    const v = E.viewOf(g, p);
    const fin = E.finalPositions(v, E.expandDice(d));
    // (no legal play: the engine lists nothing, the reference lists the unchanged board)
    const engSet = fin.length ? new Set(fin.map((f) => refKey(toRef(leafGame(g, p, f))))) : new Set([refKey(B)]);
    if (engSet.size !== refSet.size || [...engSet].some((k) => !refSet.has(k))) {
      fail(`finalPositions differ: engine ${engSet.size}, reference ${refSet.size}; engine-only ${[...engSet].filter((k) => !refSet.has(k)).slice(0, 1)} reference-only ${[...refSet].filter((k) => !engSet.has(k)).slice(0, 1)}`, g, p, d);
      continue;
    }
    if (!fin.length) { stats.noMove++; if (B.bar[c]) stats.barBlocked++; }
    // every enumerated play's step list (what the computer, Hint and Mr. Makis play) must replay
    // through the interactive turn to the same board
    for (const f of fin) {
      replays++;
      try {
        const T = E.createTurn(g, p, d);
        for (const s of f.steps) E.turnPlay(T, { r: s.r, d: s.d });
        const n = E.cloneGame(g); E.commitTurn(n, T);
        if (!E.turnDone(T) || refKey(toRef(n)) !== refKey(toRef(leafGame(g, p, f)))) fail('an enumerated play replays to a different board', g, p, d);
      } catch (e) { fail(`an enumerated play cannot be replayed through the turn: ${e.message}`, g, p, d); }
    }
    if (ref.maxLen === 1) stats.oneDie++;
    // 2. clicking: every node of the interactive turn
    const T0 = E.createTurn(g, p, d);
    if (T0.M !== ref.maxLen) { fail(`T.M ${T0.M} vs reference ${ref.maxLen}`, g, p, d); continue; }
    const clickSet = new Set(), visited = new Set();
    const walk = (T) => {
      const cur = E.cloneGame(g); E.commitTurn(cur, T);
      const curB = toRef(cur);
      if (E.turnDone(T)) { clickSet.add(refKey(curB)); return; }
      const vk = refKey(curB) + '#' + T.rem.slice().sort().join('');
      if (visited.has(vk)) return; // the same board with the same dice left was already walked
      visited.add(vk);
      const steps = E.turnSteps(T);
      if (!steps.length) { fail('dead end: turn not done and no step offered', g, p, d); return; }
      for (const s of steps) {
        clicks++;
        const a = engSquare(p, s.r), b = s.t ? E.absOf(p, s.t) : -1;
        const fromShown = s.r === 25 ? -2 : a;
        if (s.from !== fromShown || s.to !== b) fail(`step squares ${s.from}->${s.to} vs ${fromShown}->${b}`, g, p, d);
        const rb = refLegalStep(curB, c, a, s.d);
        if (rb === null || rb !== b) { fail(`offered step ${a}->${b} with ${s.d} is not legal (reference: ${rb})`, cur, p, d); continue; }
        const hitRef = b >= 0 && curB.cells[b].c === other(c);
        if (!!s.hit !== hitRef) fail(`step ${a}->${b} hit flag ${s.hit} vs reference ${hitRef}`, cur, p, d);
        if (s.hit) stats.hits++;
        if (s.r === 25) stats.enters++;
        if (b === -1) stats.bearOff++;
        const T2 = { ...T, v: { ...T.v, mine: Int8Array.from(T.v.mine), opp: Int8Array.from(T.v.opp) }, rem: T.rem.slice(), played: T.played.slice() };
        E.turnPlay(T2, s);
        walk(T2);
      }
      // squares refused here that the reference allows as single steps are only fine if they cannot lead to a maximal play
      for (let k = 0; k < T.rem.length; k++) for (const a of SQUARES) {
        if (refLegalStep(curB, c, a, T.rem[k]) !== null && !steps.some((s) => engSquare(p, s.r) === a && s.d === T.rem[k])) stats.blockedSteps++;
      }
    };
    walk(T0);
    if (clickSet.size !== refSet.size || [...clickSet].some((k) => !refSet.has(k))) fail(`clickable plays differ: ${clickSet.size} vs reference ${refSet.size}`, g, p, d);
    if (d[0] !== d[1] && ref.maxLen === 1) {
      if ([...ref.finals.values()].some((x) => x.steps[0][2] !== Math.max(...d))) stats.largerDieBound++;
    }
    // 3. the computer's choice
    if (sample && refSet.size > 1) {
      for (const lv of [4, 5]) {
        const steps = E.chooseMove(g, p, d, lv, Math.random);
        const n = E.applySteps(E.cloneGame(g), p, steps);
        chosen++;
        if (!refSet.has(refKey(toRef(n)))) fail(`level ${lv} chose an illegal play`, g, p, d);
      }
    }
  }
}

// hand-worked positions: game({wPoint: n}, {bPoint: n}, {offW, offB}), engine numbering, 25 = bar
function game(white, black, o = {}) {
  const g = { pos: [new Int8Array(26), new Int8Array(26)], off: [o.offW || 0, o.offB || 0] };
  for (const [r, n] of Object.entries(white)) g.pos[0][r] = n;
  for (const [r, n] of Object.entries(black)) g.pos[1][r] = n;
  return g;
}
const HAND = [
  E.newGame(),
  game({ 25: 1, 24: 1, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 4, 5: 1 }),     // white on the bar, a black blot to hit on entry
  game({ 25: 2, 13: 5, 8: 3, 6: 5 }, { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 2, 13: 3 }), // closed board: no entry at all
  game({ 25: 2, 13: 5, 8: 3, 6: 5 }, { 6: 2, 5: 2, 4: 2, 3: 2, 13: 7 }),             // two on the bar, two points open
  game({ 25: 1, 6: 14 }, { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 20: 5 }),                  // one entry point, then free play
  game({ 13: 1 }, { 24: 13, 23: 2 }, { offW: 14 }),                                   // larger die
  game({ 1: 1 }, { 23: 15 }, { offW: 14 }),                                           // last checker: either die bears it off, only the larger may
  game({ 2: 1 }, { 22: 14 }, { offW: 14, offB: 1 }),                                  // the same from point 2
  game({ 6: 3, 5: 3, 4: 3, 3: 3, 2: 3 }, { 24: 1, 18: 14 }),                          // bearing off with a black blot in white's home
  game({ 8: 1, 3: 14 }, { 20: 2, 16: 1, 1: 12 }),                                      // one outside: no bear-off; a blot on the way
  game({ 13: 2, 10: 1, 6: 12 }, { 17: 1, 14: 1, 1: 13 }),                             // combined move hits on the touch-down point
  game({ 24: 2, 13: 13 }, { 19: 2, 18: 2, 17: 2, 16: 2, 15: 2, 14: 2, 2: 3 }),       // a six-prime in front of white's back checkers
  game({}, { 1: 15 }, { offW: 15 }),                                                  // finished: white wins a mars (2)
  game({}, { 1: 12 }, { offW: 15, offB: 3 }),                                         // finished: white wins single (1)
  game({ 25: 1, 20: 14 }, {}, { offB: 15 }),                                          // finished: black wins a mars with white on the bar (still 2, no triple)
];
for (const g of HAND) for (let p = 0; p < 2; p++) {
  let n = g.off[p]; for (let r = 1; r <= 25; r++) n += g.pos[p][r];
  if (n !== 15) throw new Error(`hand position count ${n}`);
}

const t0 = Date.now();
for (const g of HAND) { audit(g, 0, true); audit(g, 1, true); }

// self-play positions (mixed levels, so blunders and hits both happen)
const rnd = E.mulberry(2026);
let positions = 0;
for (let gi = 0; gi < GAMES; gi++) {
  const g = E.newGame();
  let p = gi % 2;
  const lv = [1, 2, 3, 4][gi % 4];
  for (let n = 0; n < 400 && !E.winner(g); n++) {
    if (n % 3 === 0) { audit(g, p, n % 9 === 0); positions++; }
    E.applySteps(g, p, E.chooseMove(g, p, E.rollDice(rnd), lv, rnd));
    p = 1 - p;
  }
  audit(g, p, false); positions++; // the final position: result reading
}

// synthetic random positions with blots, bar checkers and borne-off checkers
function synthetic() {
  for (let tries = 0; tries < 100; tries++) {
    const g = { pos: [new Int8Array(26), new Int8Array(26)], off: [0, 0] };
    const cells = Array.from({ length: 24 }, () => ({ c: '', n: 0 }));
    let ok = true;
    for (const c of ['W', 'B']) {
      const p = c === 'W' ? 0 : 1;
      const off = rnd() < 0.3 ? Math.floor(rnd() * 14) : 0;
      g.off[p] = off;
      const homeOnly = rnd() < 0.3;
      for (let k = 0; k < 15 - off; k++) {
        if (!homeOnly && rnd() < 0.06) { g.pos[p][25]++; continue; } // on the bar
        let a = -1;
        for (let k2 = 0; k2 < 40 && a < 0; k2++) {
          const x = homeOnly ? (c === 'W' ? 0 : 18) + Math.floor(rnd() * 6) : Math.floor(rnd() * 24);
          if (!cells[x].c || cells[x].c === c) a = x; // a cell holds one colour only
        }
        if (a < 0) { ok = false; break; }
        cells[a].c = c; cells[a].n++;
      }
      if (!ok) break;
    }
    if (!ok) continue;
    for (let a = 0; a < 24; a++) {
      const x = cells[a];
      if (x.c === 'W') g.pos[0][a + 1] = x.n;
      if (x.c === 'B') g.pos[1][24 - a] = x.n;
    }
    return g;
  }
  return E.newGame();
}
for (let i = 0; i < SYNTH; i++) { const g = synthetic(); audit(g, i % 2, i % 25 === 0); positions++; }

console.log(`${HAND.length} hand positions, ${positions} game/synthetic positions; ${comparisons} position x roll comparisons, ${clicks} clickable steps checked, ${replays} enumerated plays replayed, ${chosen} computer choices, ${results} result readings`);
console.log(`rules exercised: ${JSON.stringify(stats)}`);
console.log(`${fails ? fails + ' FAILURES' : '0 failures'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
