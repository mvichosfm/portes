// Mr. Makis (level-10 coach, analyzeView) vs level 5: node test/makis.mjs [games] [rollouts] [first=0]
// Slow by design (~3-4 s per Makis move): run in the background, and split a long match over
// several processes with `first` (game i uses seed 4242 + i, so the split changes nothing).
import { newGame, viewOf, expandDice, analyzeView, chooseMove, applySteps, winner, mulberry } from '../src/engine.js';

const games = parseInt(process.argv[2] || '30', 10), rollouts = parseInt(process.argv[3] || '120', 10), first = parseInt(process.argv[4] || '0', 10);
let makisPts = 0, l5Pts = 0, makisWins = 0, ties = 0;
const t0 = Date.now();
for (let i = first; i < first + games; i++) {
  const rnd = mulberry(4242 + i), g = newGame();
  const makisSide = i % 2; // alternate colours; side 0 always moves first
  let p = 0, n = 0;
  while (!winner(g) && n++ < 3000) {
    const d = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    let steps;
    if (p === makisSide) {
      const a = analyzeView(viewOf(g, p), expandDice(d), { rollouts, seed: i * 1000 + n });
      steps = a.cands.length ? a.cands[0].steps : [];
    } else steps = chooseMove(g, p, d, 5, rnd);
    applySteps(g, p, steps);
    p = 1 - p;
  }
  const w = winner(g);
  if (!w || w.p === -1) ties++;
  else if (w.p === makisSide) { makisPts += w.points; makisWins++; } else l5Pts += w.points;
  console.log(`game ${i + 1}: ${!w || w.p === -1 ? 'tie' : w.p === makisSide ? 'Makis' : 'L5'} ${w && w.p !== -1 ? '+' + w.points + (w.how === 'mother' ? ' (mother)' : '') : ''} | Makis ${makisWins}/${i - first + 1 - ties} wins, points ${makisPts}-${l5Pts}, ties ${ties} | ${Math.round((Date.now() - t0) / 1000)}s`);
}
