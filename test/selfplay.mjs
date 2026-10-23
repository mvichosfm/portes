// Level-vs-level matches: node test/selfplay.mjs [games] [pairs...]
// e.g. node test/selfplay.mjs 200 1-2 2-3 3-4 4-5
// Each pair "a-b" plays `games` games, alternating who moves first; prints b's win share
// (points share counts mars and mother wins as 2), ties (both mothers pinned) and the average
// think time per move for each level.
import { newGame, chooseMove, winner, applySteps, mulberry } from '../src/engine.js';

export function playGame(levels, first, seed, stats) {
  const rnd = mulberry(seed);
  const g = newGame();
  let p = first, turns = 0;
  while (!winner(g) && turns < 3000) {
    const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    const t0 = performance.now();
    const steps = chooseMove(g, p, dice, levels[p], rnd);
    const ms = performance.now() - t0;
    const st = stats[levels[p]] ||= { ms: 0, n: 0, max: 0 };
    st.ms += ms; st.n++; st.max = Math.max(st.max, ms);
    applySteps(g, p, steps);
    p = 1 - p; turns++;
  }
  return { w: winner(g), turns };
}

const args = process.argv.slice(2);
const games = parseInt(args[0] || '100', 10);
const pairs = (args.length > 1 ? args.slice(1) : ['1-2', '2-3', '3-4', '4-5']).map((s) => s.split('-').map(Number));
for (const [a, b] of pairs) {
  const stats = {};
  let bWins = 0, bPts = 0, aPts = 0, turns = 0, ties = 0, unfinished = 0, mother = 0;
  const t0 = performance.now();
  for (let i = 0; i < games; i++) {
    // seat 0 = level a, seat 1 = level b; alternate who starts, same seeds per pair index
    const r = playGame([a, b], i % 2, 1000 + i, stats);
    turns += r.turns;
    if (!r.w) { unfinished++; continue; }
    if (r.w.p === -1) { ties++; continue; }
    if (r.w.how === 'mother') mother++;
    if (r.w.p === 1) { bWins++; bPts += r.w.points; } else aPts += r.w.points;
  }
  const decided = games - ties - unfinished;
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  const lv = (l) => `L${l} ${(stats[l].ms / stats[l].n).toFixed(1)}ms avg / ${stats[l].max.toFixed(0)}ms max`;
  console.log(`L${a} vs L${b}: L${b} won ${bWins}/${decided} (${(100 * bWins / decided).toFixed(1)}%), points ${bPts}-${aPts} (${(100 * bPts / (bPts + aPts)).toFixed(1)}%), ` +
    `mother wins ${mother}, ties ${ties}, unfinished ${unfinished}, avg ${Math.round(turns / games)} turns, ${sec}s | ${lv(a)} | ${lv(b)}`);
}
