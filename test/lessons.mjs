// Proves the guided lessons against the real engine: every position is a valid Portes position,
// the scripted answer is a legal play that satisfies the goal, the goal is not met by every play
// (so it tests something), and the claims the lesson text makes about the rules actually hold.
// Run: node test/lessons.mjs
import { createTurn, turnPlay, turnSteps, turnDone, finalPositions, commitTurn, winner, S, expandDice, newGame, pips } from '../src/engine.js';
import { LESSONS, lessonBoard, lessonSteps, boardFrom } from '../src/lessons.js';

let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL: ' + msg); } };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const L = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
const game = (q) => ({ pos: [Int8Array.from(q.mine), Int8Array.from(q.opp)], off: [q.myOff, q.oppOff] });
const turnOf = (l) => { const q = lessonBoard(l); return createTurn(game(q), 0, q.dice); };
const has = (T, from, d) => turnSteps(T).some((s) => s.r === 25 - from && s.d === d);

ok(LESSONS.length === 9, 'nine lessons');
ok(new Set(LESSONS.map((l) => l.id)).size === LESSONS.length, 'lesson ids are unique');

for (const l of LESSONS) {
  const q = lessonBoard(l);
  // a valid position: fifteen checkers a side; no point holds both colours
  ok(sum(q.mine) + q.myOff === 15, `${l.id}: 15 of mine`);
  ok(sum(q.opp) + q.oppOff === 15, `${l.id}: 15 of the computer's`);
  let clash = 0;
  for (let r = 1; r <= 24; r++) if (q.mine[r] && q.opp[S(r)]) clash++;
  ok(clash === 0, `${l.id}: no point held by both sides`);
  ok(q.dice.length === 2 && q.dice.every((d) => d >= 1 && d <= 6), `${l.id}: dice`);
  ok(l.goal.every((s) => s >= 1 && s <= 24), `${l.id}: goal points are real`);
  ok(typeof l.teach === 'string' && typeof l.task === 'string' && typeof l.win === 'string' && typeof l.miss === 'string', `${l.id}: all texts present`);

  // the scripted answer is legal, step by step, completes the turn and meets the goal
  const T = turnOf(l);
  let legalAnswer = true;
  try { for (const st of lessonSteps(l.answer)) turnPlay(T, st); } catch { legalAnswer = false; }
  ok(legalAnswer && turnDone(T), `${l.id}: the answer is a legal complete play`);
  ok(l.check(T.v), `${l.id}: the answer meets the goal`);

  // the goal is a real test: some legal complete play misses it (where more than one play exists)
  const view = { mine: Int8Array.from(q.mine), opp: Int8Array.from(q.opp), myOff: q.myOff, oppOff: q.oppOff };
  const finals = finalPositions(view, expandDice(q.dice));
  const good = finals.filter((f) => l.check({ mine: f.mine, opp: f.opp, myOff: f.myOff, oppOff: q.oppOff }));
  ok(finals.length >= 1 && good.length >= 1, `${l.id}: ${good.length}/${finals.length} legal plays meet the goal`);
  if (!['larger', 'mars'].includes(l.id)) ok(good.length < finals.length, `${l.id}: the goal is not met by every play (${good.length}/${finals.length})`);
}

// --- the claims the texts make
{ // boardFrom puts the computer's checkers where the player sees them (its own point = the shown number)
  const b = boardFrom({ mine: { 1: 15 }, opp: { 24: 15 } });
  ok(b.mine[24] === 15 && b.opp[24] === 15, 'boardFrom: shown 1 is the player\'s own 24, the computer\'s shown 24 its own 24');
  const s = lessonBoard(L.direction), n = newGame();
  ok(Array.from(s.mine).join() === Array.from(n.pos[0]).join() && Array.from(s.opp).join() === Array.from(n.pos[1]).join(), 'direction: the lesson starts from the real starting position');
}
{ // hit: 1 -> 5 with the 4 hits; the hit checker loses 20 pips (5 to go -> 25)
  const T = turnOf(L.hit);
  const st = turnSteps(T).find((s) => s.r === 25 - 1 && s.d === 4);
  ok(st && st.hit, 'hit: 1 -> 5 with the 4 hits the blot');
  const g = game(lessonBoard(L.hit)), before = pips(g, 1);
  turnPlay(T, { r: 24, d: 4 });
  commitTurn(g, T);
  ok(pips(g, 1) - before === 20, `hit: the computer's checker goes from 5 pips to 25 (${pips(g, 1) - before})`);
}
{ // closed: from 1 the 5 lands on the closed 6, so the run 1 -> 12 must play the 6 first
  const T = turnOf(L.closed);
  ok(!has(T, 1, 5) && has(T, 1, 6), 'closed: 1 -> 6 is closed, 1 -> 7 open');
}
{ // bar: only the bar checker may move first; the 6 cannot enter, the 3 can
  const T = turnOf(L.bar);
  ok(turnSteps(T).every((s) => s.r === 25), 'bar: nothing else moves while a checker is on the bar');
  ok(turnSteps(T).some((s) => s.r === 25 && s.d === 3 && s.t === 25 - 3), 'bar: the 3 enters on point 3');
  ok(!turnSteps(T).some((s) => s.d === 6), 'bar: the 6 cannot enter (the computer holds point 6)');
}
{ // home: the computer, on the bar, enters only on the points the player has not closed
  const q = lessonBoard(L.home), g = game(q), T = createTurn(g, 0, q.dice);
  for (const st of lessonSteps(L.home.answer)) turnPlay(T, st);
  commitTurn(g, T);
  let enter = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (createTurn(g, 1, [a, b]).M > 0) enter++;
  ok(enter === 11, `home: with 19-23 closed the computer enters on 11 rolls of 36 (${enter})`);
  const g0 = game(q);
  let e4 = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (createTurn(g0, 1, [a, b]).M > 0) e4++;
  ok(e4 === 20, `home: with four points closed it enters on 20 rolls of 36, "5 in 9" (${e4})`);
  ok(enter / 36 < 1 / 3, 'home: with five closed, under 1 in 3');
}
{ // larger: only one die is playable, and it is the 6
  const T = turnOf(L.larger);
  ok(T.M === 1, 'larger: only one die can be played');
  ok(turnSteps(T).length >= 1 && turnSteps(T).every((s) => s.d === 6), 'larger: the only die offered is the larger');
}
{ // doubles: four moves
  ok(turnOf(L.doubles).M === 4, 'doubles: four moves to play');
}
{ // bearoff: the 6 bears off from 20 (nothing behind), the 2 from 23
  const T = turnOf(L.bearoff);
  ok(turnSteps(T).some((s) => s.r === 25 - 20 && s.d === 6 && s.t === 0), 'bearoff: the 6 bears off the furthest-back checker on 20');
  ok(turnSteps(T).some((s) => s.r === 25 - 23 && s.d === 2 && s.t === 0), 'bearoff: the 2 bears off from 23');
}
{ // mars: three checkers left, the computer has none off, so bearing them off is a mars
  const q = lessonBoard(L.mars), g = game(q), T = createTurn(g, 0, q.dice);
  ok(q.oppOff === 0 && q.myOff === 12 && T.M === 3, 'mars: three to bear off, the computer has none off');
  for (const st of lessonSteps(L.mars.answer)) turnPlay(T, st);
  commitTurn(g, T);
  ok(winner(g).points === 2, 'mars: the answer is a double win');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
