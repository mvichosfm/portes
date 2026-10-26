// Rule tests for src/engine.js: node test/rules.mjs
// Positions are written in the engine's numbering: each side counts its own path 24 (rear) -> 1,
// 25 = the bar, and my point r is the opponent's point S(r) = 25 - r.
import {
  newGame, createTurn, turnSteps, turnPlay, turnDone, commitTurn, finalPositions, viewOf,
  expandDice, evaluate, S, absOf, chooseMove, winner, cloneGame, applySteps, gamePlain, gameFrom, pips,
} from '../src/engine.js';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; console.log('FAIL:', msg); }
}
const fmt = (steps) => steps.map((s) => `${s.r}>${s.t}/${s.d}`).sort().join(' ');

// game({ point: count }, { point: count }, { offW, offB }); point 25 = the bar
function game(white, black, o = {}) {
  const g = { pos: [new Int8Array(26), new Int8Array(26)], off: [o.offW || 0, o.offB || 0] };
  for (const [r, n] of Object.entries(white)) g.pos[0][r] = n;
  for (const [r, n] of Object.entries(black)) g.pos[1][r] = n;
  const tw = g.pos[0].reduce((a, b) => a + b, 0) + g.off[0], tb = g.pos[1].reduce((a, b) => a + b, 0) + g.off[1];
  if (tw !== 15 || tb !== 15) throw new Error(`bad fixture ${tw}/${tb}`);
  for (let r = 1; r <= 24; r++) if (g.pos[0][r] && g.pos[1][S(r)]) throw new Error(`both colours on white ${r}`);
  return g;
}
// plays a list of [r, d] steps for side p through the interactive API and commits it
function play(g, p, dice, steps) {
  const T = createTurn(g, p, dice);
  for (const [r, d] of steps) turnPlay(T, { r, d });
  if (!turnDone(T)) throw new Error('turn not finished');
  commitTurn(g, T);
  return T;
}

// coordinate maps: opposite directions
ok(S(S(7)) === 7 && S(24) === 1 && S(1) === 24 && S(13) === 12, 'S(r) = 25 - r is an involution');
ok(absOf(0, 24) === 23 && absOf(1, 1) === 23 && absOf(1, 24) === 0 && absOf(0, 1) === 0, 'white\'s rear point is black\'s last home point and vice versa');

// 1. The starting position is backgammon's: 2 on 24, 5 on 13, 3 on 8, 5 on 6, 167 pips each, and
//    no checker of one side stands on the other's point.
{
  const g = newGame();
  ok(g.pos[0][24] === 2 && g.pos[0][13] === 5 && g.pos[0][8] === 3 && g.pos[0][6] === 5 && g.pos[1][24] === 2 && g.pos[1][6] === 5, 'start: 2-5-3-5');
  ok(pips(g, 0) === 167 && pips(g, 1) === 167, 'start: 167 pips each');
  let clash = 0; for (let r = 1; r <= 24; r++) if (g.pos[0][r] && g.pos[1][S(r)]) clash++;
  ok(clash === 0, 'start: no shared points');
  const T = createTurn(newGame(), 0, [3, 1]);
  ok(T.M === 2, 'opening 3-1 plays both dice');
  ok(finalPositions(viewOf(newGame(), 0), [3, 1]).some((f) => f.mine[5] === 2 && f.mine[8] === 2 && f.mine[6] === 4), 'opening 3-1 can make the 5-point (8/5 6/5)');
  ok(createTurn(newGame(), 1, [3, 3]).M === 4, 'doubles play four times');
  // the 6-point of the opponent (my 19) is not blocked at the start, his 6 is my 19
  ok(!turnSteps(createTurn(newGame(), 0, [5, 5])).some((s) => s.r === 24 && s.t === 19), 'my 24 -> 19 with a 5 lands on his 6-point (5 checkers): closed');
}

// 2. Hitting: landing on a lone opponent checker sends it to the bar.
{
  const g = game({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 4, [S(20)]: 1 }); // black blot on white's 20 (black 5)
  const T = createTurn(g, 0, [4, 1]);
  const s4 = turnSteps(T).find((s) => s.r === 24 && s.d === 4);
  ok(s4 && s4.t === 20 && s4.hit, 'white lands on the lone black checker: a hit');
  turnPlay(T, { r: 24, d: 4 }); turnPlay(T, { r: 6, d: 1 });
  commitTurn(g, T);
  ok(g.pos[1][25] === 1 && g.pos[1][5] === 0 && g.pos[0][20] === 1, 'the hit checker is on black\'s bar');
  ok(pips(g, 1) === 167 - 1 + 20, `the hit costs black 20 pips (${pips(g, 1)})`);
}

// 3. Two or more opponent checkers close a point.
{
  const g = game({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 3, [S(18)]: 2 });
  ok(!turnSteps(createTurn(g, 0, [6, 5])).some((s) => s.t === 18), 'two black checkers close white\'s 18');
}

// 4. The bar: a checker there must enter first (die d -> my point 25 - d), nothing else moves
//    until it has; a closed entry point refuses that die.
{
  const g = game({ 25: 1, 24: 1, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 });
  const T = createTurn(g, 0, [6, 3]);
  const st = turnSteps(T);
  ok(st.every((s) => s.r === 25), `only the bar checker may move first (${fmt(st)})`);
  ok(fmt(st) === '25>22/3', `the 6 is blocked (black's 6-point), the 3 enters on 22 (${fmt(st)})`);
  turnPlay(T, { r: 25, d: 3 });
  ok(turnSteps(T).some((s) => s.r !== 25), 'once in, the other die is free');
  ok(turnSteps(T)[0].from !== -2 && st[0].from === -2, 'a step from the bar reports from = -2');
  // two on the bar, one can enter: the second stays and the rest of the turn is lost
  const h = game({ 25: 2, 13: 5, 8: 3, 6: 5 }, { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 13: 5 });
  const H = createTurn(h, 0, [1, 2]);
  ok(H.M === 1 && fmt(turnSteps(H)) === '25>24/1', `two on the bar, one way in: one step (${fmt(turnSteps(H))})`);
  // a closed board: no entry at all
  const c = game({ 25: 2, 13: 5, 8: 3, 6: 5 }, { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 2, 13: 3 });
  ok(createTurn(c, 0, [6, 6]).M === 0 && finalPositions(viewOf(c, 0), [6, 6, 6, 6]).length === 0, 'a closed board: no entry, no move');
  // entering hits a blot in the opponent's home
  const e = game({ 25: 1, 13: 5, 8: 4, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 4, 3: 1 });
  const E = createTurn(e, 0, [3, 1]);
  const enter = turnSteps(E).find((s) => s.r === 25 && s.d === 3);
  ok(enter && enter.t === 22 && enter.hit, 'entering on a blot hits it');
}

// 5. One checker playing both dice touches down between: it can hit there and move on; a closed
//    point between blocks the combined move (but the other order may still work).
{
  const g = game({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 4, [S(18)]: 1 });
  const T = createTurn(g, 0, [6, 5]);
  turnPlay(T, { r: 24, d: 6 });
  ok(T.v.opp[25] === 1, 'touch-down hits');
  turnPlay(T, { r: 18, d: 5 });
  ok(T.v.opp[25] === 1 && T.v.mine[13] === 6, 'hit and run: the black checker stays on the bar');
  const shut = game({ 24: 1, 6: 14 }, { [S(18)]: 2, [S(19)]: 2, 3: 11 });
  ok(!turnSteps(createTurn(shut, 0, [6, 5])).some((s) => s.r === 24) && !finalPositions(viewOf(shut, 0), [6, 5]).some((f) => f.mine[13] === 1), 'both points between closed: the back checker cannot run 11');
}

// 6. Only one die playable: it must be the larger.
{
  const g = game({ 13: 1 }, { 24: 13, [S(2)]: 2 }, { offW: 14 });
  const T = createTurn(g, 0, [6, 5]);
  ok(T.M === 1, 'only one die can be played');
  ok(fmt(turnSteps(T)) === '13>7/6', `must be the larger die: ${fmt(turnSteps(T))}`);
  const f = finalPositions(viewOf(g, 0), [6, 5]);
  ok(f.length === 1 && f[0].steps[0].d === 6, 'enumeration agrees on the larger die');
  const h = game({ 13: 1 }, { 24: 11, [S(2)]: 2, [S(7)]: 2 }, { offW: 14 });
  ok(fmt(turnSteps(createTurn(h, 0, [6, 5]))) === '13>8/5', 'the smaller die when the larger cannot move');
  const last = game({ 1: 1 }, { 23: 15 }, { offW: 14 });
  for (const lv of [1, 4, 5]) {
    const steps = chooseMove(last, 0, [3, 5], lv);
    let replayed = true;
    try { const L = createTurn(last, 0, [3, 5]); for (const s of steps) turnPlay(L, s); replayed = turnDone(L); } catch { replayed = false; }
    ok(steps.length === 1 && steps[0].d === 5 && replayed, `level ${lv}: last checker borne off with the larger die and replayable (${JSON.stringify(steps)})`);
  }
}

// 7. Bearing off: not before all 15 are home (the bar counts as outside); exact; a higher die from
//    the highest point only.
{
  const notHome = game({ 7: 1, 6: 14 }, { 24: 15 });
  ok(!turnSteps(createTurn(notHome, 0, [6, 5])).some((s) => s.t === 0), 'no bearing off with a checker on 7');
  const g = game({ 3: 2, 1: 13 }, { 12: 15 });
  ok(fmt(turnSteps(createTurn(g, 0, [6, 5]))) === '3>0/5 3>0/6', `higher die only from the highest point: ${fmt(turnSteps(createTurn(g, 0, [6, 5])))}`);
  const ex = game({ 6: 15 }, { 24: 15 });
  ok(createTurn(ex, 0, [6, 6]).M === 4 && turnSteps(createTurn(ex, 0, [6, 6])).every((s) => s.t === 0), 'double 6 bears off four from 6');
  const mixed = game({ 6: 1, 2: 14 }, { 24: 15 });
  ok(!turnSteps(createTurn(mixed, 0, [5, 1])).some((s) => s.r === 2 && s.d === 5 && s.t === 0), 'a 5 cannot bear off from 2 while 6 is occupied');
  // hit while bearing off: the checker must come all the way round before bearing off resumes
  const onBar = game({ 25: 1, 6: 2, 5: 3, 4: 3, 3: 3, 2: 2 }, { 24: 1, 16: 14 }, { offW: 1 });
  const B = createTurn(onBar, 0, [6, 5]);
  ok(turnSteps(B).every((s) => s.r === 25), 'a checker on the bar stops bearing off');
}

// 8. Results: single win, mars (gammon) = 2, and no triple win (a checker still on the bar or in
//    the winner's home board changes nothing).
{
  const g = game({ 1: 1 }, { 23: 15 }, { offW: 14 });
  play(g, 0, [1, 2], [[1, 2]]);
  ok(JSON.stringify(winner(g)) === JSON.stringify({ p: 0, points: 2, how: 'off' }), 'mars: the loser bore nothing off');
  const h = game({ 1: 1 }, { 23: 14 }, { offW: 14, offB: 1 });
  play(h, 0, [1, 2], [[1, 2]]);
  ok(winner(h).points === 1, 'single win when the loser has borne off');
  const bg = game({ 1: 1 }, { 25: 1, 23: 14 }, { offW: 14 });
  play(bg, 0, [1, 2], [[1, 2]]);
  ok(winner(bg).points === 2, 'a loser on the bar is still a mars (2), not a triple');
}

// 9. No legal move at all: a six-point prime in front of the back checkers.
{
  const g = game({ 24: 2, 13: 13 }, { [S(23)]: 2, [S(22)]: 2, [S(21)]: 2, [S(20)]: 2, [S(19)]: 2, [S(18)]: 2, 13: 3 });
  const T = createTurn(g, 0, [3, 4]);
  ok(T.M === 2 && turnSteps(T).every((s) => s.r === 13), 'primed back checkers cannot move; the others can');
}

// 10. Evaluation is antisymmetric (two-ply search depends on it), bar checkers included.
{
  const g = game({ 25: 1, 24: 1, 20: 2, 15: 3, 9: 1, 4: 2, 3: 5 }, { 24: 3, 19: 3, 11: 3, 6: 3, 4: 2, 2: 1 });
  const a = evaluate(viewOf(g, 0)), b = evaluate(viewOf(g, 1));
  ok(Math.abs(a + b) < 1e-9, `evaluate antisymmetric (${a} vs ${b})`);
}

// 11. Random playouts never break invariants, and the interactive turn agrees with the enumeration.
{
  let rs = 12345;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  let games = 0, mismatch = 0, hits = 0;
  const outcomes = { 1: 0, 2: 0 };
  for (let n = 0; n < 60; n++) {
    const g = newGame();
    let p = n % 2, turns = 0;
    while (!winner(g) && turns < 2000) {
      const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
      const finals = finalPositions(viewOf(g, p), expandDice(dice));
      const T = createTurn(g, p, dice);
      const len = finals.length ? finals[0].steps.length : 0;
      if (len !== T.M) mismatch++;
      while (!turnDone(T)) {
        const st = turnSteps(T);
        if (!st.length) { mismatch++; break; }
        const s = st[Math.floor(rnd() * st.length)];
        if (s.hit) hits++;
        turnPlay(T, s);
      }
      commitTurn(g, T);
      for (let q = 0; q < 2; q++) {
        let tot = g.off[q];
        for (let r = 1; r <= 25; r++) { if (g.pos[q][r] < 0) mismatch++; tot += g.pos[q][r]; }
        for (let r = 1; r <= 24; r++) if (g.pos[q][r] && g.pos[1 - q][S(r)]) mismatch++;
        if (tot !== 15) mismatch++;
      }
      p = 1 - p; turns++;
    }
    const w = winner(g);
    if (w) { games++; outcomes[w.points]++; }
  }
  ok(mismatch === 0, `random playouts consistent (mismatches: ${mismatch})`);
  ok(games === 60 && hits > 100, `random games all finish (${games}/60: ${JSON.stringify(outcomes)}, ${hits} hits)`);
}

// 12. A recorded game (dice + steps per turn) replays to the identical final position, bar
//     included, also through JSON (that is how saved games are stored) and the worker's plain arrays.
{
  let rs = 777;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const g = newGame(); const turns = []; let p = 0, n = 0, barSeen = 0;
  while (!winner(g) && n++ < 2000) {
    const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    const steps = chooseMove(g, p, dice, 3, rnd);
    turns.push({ p, dice, steps: steps.map(({ r, t, d }) => ({ r, t, d })) });
    applySteps(g, p, steps);
    barSeen += g.pos[0][25] + g.pos[1][25];
    p = 1 - p;
  }
  const rec = JSON.parse(JSON.stringify({ turns }));
  const r = newGame();
  for (const t of rec.turns) applySteps(r, t.p, t.steps);
  const same = (x, y) => JSON.stringify(gamePlain(x)) === JSON.stringify(gamePlain(y));
  ok(same(r, g) && !!winner(r), `recorded game replays to the same final position (${rec.turns.length} turns, bar seen ${barSeen})`);
  ok(same(gameFrom(JSON.parse(JSON.stringify(gamePlain(g)))), g), 'plain-array round trip');
}

// 13. .vbg files: export -> import round-trips; damaged or tampered files are refused.
{
  const { toVbg, parseVbg, vbgFileName, stepsText } = await import('../src/records.js');
  let rs = 99;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const g = newGame(); const turns = []; let p = 0, enters = 0;
  while (!winner(g)) {
    const d = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    const st = chooseMove(g, p, d, 3, rnd);
    enters += st.filter((s) => s.r === 25).length;
    turns.push({ p, dice: d, steps: st.map(({ r, t, d: die }) => ({ r, t, d: die })) });
    applySteps(g, p, st); p = 1 - p;
  }
  const rec = { name: 'Lesson / test', date: 1790000000000, level: 4, human: 0, opening: [5, 3], turns, result: { winner: 'cpu', points: 9 } };
  const text = toVbg(rec), back = parseVbg(text);
  ok(back.rec && back.rec.turns.length === turns.length && back.rec.imported, `.vbg round-trips (${enters} entries from the bar)`);
  const w = winner(g);
  ok(back.rec.result.points === w.points && back.rec.result.winner === (w.p === 0 ? 'you' : 'cpu') && back.rec.result.how === w.how, 'result recomputed from the moves, not taken from the file');
  ok(vbgFileName(rec) === 'Lesson test.vbg', `safe file name (${vbgFileName(rec)})`);
  ok(JSON.parse(text).format === 'portes-vbg', 'Portes files carry their own format name');
  ok(!!parseVbg(text.replace('portes-vbg', 'plakoto-vbg')).error, 'a Plakoto game file is refused');
  const tamper = (f) => { const d = JSON.parse(text); f(d.game); return parseVbg(JSON.stringify(d)).error; };
  ok(!!tamper((x) => { x.turns[10].steps[0].t = 0; }), 'illegal move refused');
  ok(!!tamper((x) => { x.turns[5].dice = [6, 6]; }), 'changed dice refused');
  ok(!!tamper((x) => { x.turns.splice(3, 1); }), 'removed move refused');
  ok(!!tamper((x) => { x.turns.push(x.turns[0]); }), 'moves after the end refused');
  ok(!!parseVbg('not json').error && !!parseVbg('{"a":1}').error, 'non-game files refused');
  const short = { ...rec, turns: turns.slice(0, 20), resigned: true };
  const r2 = parseVbg(toVbg(short)).rec;
  ok(r2.result && r2.result.resigned && r2.result.winner === 'cpu' && r2.result.points === 2, 'resigned game keeps its double win');
  const single = { ...short, result: { winner: 'cpu', points: 1, resigned: true } };
  ok(parseVbg(toVbg(single)).rec.result.points === 1, 'single-loss concession keeps its 1 point');
  const odd = JSON.parse(toVbg(short)); odd.game.resignPoints = 7;
  ok(parseVbg(JSON.stringify(odd)).rec.result.points === 2, 'hostile resignPoints clamped to double');
  ok(parseVbg(toVbg({ ...rec, resigned: true })).rec.result.resigned === undefined, 'a resigned flag cannot override a finished board');
  ok(stepsText([{ r: 25, t: 22, d: 3 }, { r: 13, t: 0, d: 6 }]) === 'bar/3 12/off', `entering and bearing off read in the shown numbering (${stepsText([{ r: 25, t: 22, d: 3 }, { r: 13, t: 0, d: 6 }])})`);
}

// 14. Mistake review: an Expert's own plays screen at zero loss; a random player's do not;
//     reviewTurn measures the move actually played.
{
  const { screenTurns, reviewTurn } = await import('../src/engine.js');
  const playGame = (lv0, seed) => {
    let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    const g = newGame(), turns = []; let p = 0;
    while (!winner(g) && turns.length < 600) {
      const d = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
      const steps = chooseMove(g, p, d, p === 0 ? lv0 : 4, rnd);
      turns.push({ p, dice: d, steps: steps.map(({ r, t, d: die }) => ({ r, t, d: die })) });
      applySteps(g, p, steps); p = 1 - p;
    }
    return turns;
  };
  const expert = screenTurns(playGame(5, 11), 0);
  ok(expert.length > 5 && expert.every((x) => Math.abs(x.loss) < 1e-9), `Expert's plays screen at zero loss (${expert.length} turns)`);
  ok(expert.every((x) => x.legal > 1), 'only turns with a choice are screened');
  const turns = playGame(1, 7), rand = screenTurns(turns, 0);
  ok(rand.some((x) => x.loss > 1) && rand.every((x) => x.loss >= -1e-9), 'a random player shows clear losses, never negative');
  const worst = rand.sort((a, b) => b.loss - a.loss)[0];
  const r = reviewTurn(turns, worst.i, { rollouts: 30, top: 2, seed: 1 });
  const g0 = newGame(); for (let k = 0; k < worst.i; k++) applySteps(g0, turns[k].p, turns[k].steps);
  const after = applySteps(cloneGame(g0), 0, turns[worst.i].steps);
  const pAfter = applySteps(cloneGame(g0), 0, r.played.steps);
  ok(JSON.stringify(gamePlain(after)) === JSON.stringify(gamePlain(pAfter)), 'reviewTurn reports the move actually played');
  ok(r.best.eq >= r.played.eq && r.cands[0] === r.best, 'reviewTurn ranks the best candidate first');
}

// 15. Puzzles (src/puzzles.js, generated): every stored answer is legal through the interactive
//     turn API, lands on its stored key, is among the accepted keys; the best wrong move is not
//     accepted; the legal-play count and the >= 10-point gap hold; ids run 1..N.
{
  const { PUZZLES } = await import('../src/puzzles.js');
  const { playKey, viewFrom } = await import('../src/engine.js');
  const bad = [];
  PUZZLES.forEach((q, n) => {
    if (!q || q.id !== n + 1) { bad.push(`#${n + 1}: missing or misnumbered`); return; }
    const v0 = viewFrom(q);
    const g = { pos: [v0.mine, v0.opp], off: [q.myOff, q.oppOff] };
    const v = viewOf(g, 0);
    try {
      const T = createTurn(g, 0, q.dice);
      for (const s of q.best) turnPlay(T, { r: s.r, d: s.d });
      if (!turnDone(T)) bad.push(`#${q.id}: answer does not use every playable die`);
      if (playKey(v, T.played) !== q.key || playKey(v, q.best) !== q.key) bad.push(`#${q.id}: answer lands elsewhere`);
    } catch (e) { bad.push(`#${q.id}: answer is not legal (${e.message})`); }
    if (!q.keys.includes(q.key)) bad.push(`#${q.id}: answer not among the accepted keys`);
    if (q.keys.includes(playKey(v, q.second))) bad.push(`#${q.id}: the wrong move is accepted`);
    if (finalPositions(v, expandDice(q.dice)).length !== q.legal) bad.push(`#${q.id}: legal count`);
    if (q.win[0] - q.win[1] < 0.1 - 1e-9) bad.push(`#${q.id}: gap below 10 points`);
    if (![1, 2, 3, 4].includes(q.tier)) bad.push(`#${q.id}: tier`);
  });
  ok(PUZZLES.length >= 12 && !bad.length, `${PUZZLES.length} puzzles valid${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
}

// 16. Winning chances (Settings > Show winning chances) and the computer conceding (.vbg round-trip)
{
  const { winChances } = await import('../src/engine.js');
  const { toVbg, parseVbg, resultText } = await import('../src/records.js');
  const start = winChances(newGame(), 0, { rollouts: 120, seed: 3 });
  ok(start.white > 0.35 && start.white < 0.75 && Math.abs(start.white + start.black + start.tie - 1) < 1e-9 && start.tie === 0, `opening position is fairly even (${Math.round(start.white * 100)}% white)`);
  const g1 = newGame(); g1.pos[0].fill(0); g1.pos[0][1] = 1; g1.off[0] = 14;
  const lop = winChances(g1, 0, { rollouts: 60, seed: 3 });
  ok(lop.white === 1 && lop.blackMars === 0, 'a board one move from bearing off the last checker is a certain win');
  const g2 = cloneGame(g1); g2.off[0] = 15; g2.pos[0][1] = 0;
  ok(winChances(g2, 1).white === 1 && winChances(g2, 1).rollouts === 0, 'a finished game reports its result without play-outs');
  const rec = { name: 't', date: 1, level: 3, human: 0, opening: null, turns: [], resigned: true, result: { winner: 'you', points: 2, resigned: true } };
  const back = parseVbg(toVbg(rec)).rec;
  ok(back.result.winner === 'you' && back.result.points === 2 && back.result.resigned, 'computer-conceded game round-trips through .vbg');
  const rec2 = { ...rec, result: { winner: 'cpu', points: 1, resigned: true } };
  ok(parseVbg(toVbg(rec2)).rec.result.winner === 'cpu', 'player-admitted game still round-trips');
  ok(resultText(rec).startsWith('computer conceded'), 'result text names the computer\'s concession');
}

// 17. .vbs settings files: round-trip, clamping of hostile values, refusal of other files
{
  const { toVbs, parseVbs } = await import('../src/records.js');
  const setup = { level: 4, color: 1, light: 0.6, lamp: true, freeCam: false, view: [40, 60, 100], theme: 'olive', numbers: false, trails: false, round: true, total: true, odds: true, muted: true, autoEnd: true, quick: true, autoRoll: true, openingPlay: true, match: true };
  const back = parseVbs(toVbs(setup, [{ name: 'Night', s: setup }]));
  ok(JSON.stringify(back.setup) === JSON.stringify(setup) && back.favourites.length === 1 && back.favourites[0].name === 'Night', '.vbs round-trips');
  const evil = parseVbs(JSON.stringify({ format: 'portes-vbs', version: 1, setup: { level: 99, color: 'x', light: 1e9, view: [1e9, 0, 0], theme: { a: 1 }, lamp: 'yes', extra: '<script>' }, favourites: [{ name: 42, s: null }, 'junk'] }));
  ok(evil.setup.level === 3 && evil.setup.color === 0 && evil.setup.light === 1.6 && evil.setup.view === null && evil.setup.theme === 'walnut' && evil.setup.lamp === false && !('extra' in evil.setup), 'hostile values clamped or dropped');
  ok(evil.favourites.length === 0, 'unreadable favourites dropped');
  ok(evil.setup.quick === false, 'quick move is off unless exactly true (older files lack it)');
  ok(evil.setup.autoRoll === false, 'auto-roll is off unless exactly true (older files lack it)');
  ok(!!parseVbs('{"format":"portes-vbg","version":1}').error && !!parseVbs('nope').error, 'non-settings files refused');
}

// 18. records: result texts
{
  const { resultText } = await import('../src/records.js');
  ok(resultText({ result: { winner: 'cpu', points: 2, resigned: true } }) === 'you admitted the loss, computer +2', 'resigned result text');
  ok(resultText({ result: { winner: 'you', points: 2, how: 'off' } }) === 'you won +2 (mars)', 'mars result text');
  ok(resultText({ result: { winner: 'cpu', points: 1, how: 'off' } }) === 'computer won +1', 'single result text');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
