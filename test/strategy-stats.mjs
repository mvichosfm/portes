// Evidence for strategy.html: node test/strategy-stats.mjs [games=3000] [level=4]
// Self-play at one level (both sides alike, fixed seeds: the numbers reproduce exactly) and the
// figures the guide quotes, printed as JSON. If the engine, weights or levels change, rerun this
// and update the page's DATA block and prose (both languages), then node test/strategy-check.mjs.
import { newGame, chooseMove, applySteps, winner, mulberry, cloneGame, pips } from '../src/engine.js';

const N = +(process.argv[2] || 3000), LV = +(process.argv[3] || 4);
const out = {
  turns: 0, starterWins: 0, decided: 0,
  ends: { single: 0, mars: 0, unfinished: 0 },
  firstHit: { games: 0, hitterWins: 0 },
  hitBuckets: { '1-6': [0, 0], '7-12': [0, 0], '13-18': [0, 0], '19-24': [0, 0] }, // pips the hit checker lost: [hits, hitter won]
  homeAt10: {},   // my closed home points after my 10th turn -> [positions, wins]
  blotsAt10: {},  // my lone checkers within the opponent's reach (1-12 pips) after my 10th turn -> [positions, wins]
  shutOut: { sides: 0, wins: 0 }, // sides that ever had a checker on the bar against a closed board
  race: {},       // first position without contact, side to roll: its pip lead bucket -> [positions, wins]
  hits: 0,
};
const bucket = (lost) => (lost <= 6 ? '1-6' : lost <= 12 ? '7-12' : lost <= 18 ? '13-18' : '19-24');
const raceBucket = (d) => (d <= -20 ? '-20' : d <= -10 ? '-10' : d < 0 ? '-1' : d < 10 ? '0' : d < 20 ? '10' : '20');
const rear = (A) => { for (let r = 25; r >= 1; r--) if (A[r]) return r; return 0; };
const homeClosed = (A) => { let k = 0; for (let t = 1; t <= 6; t++) if (A[t] >= 2) k++; return k; };

for (let i = 0; i < N; i++) {
  const rnd = mulberry(90001 + i);
  const g = newGame();
  const first = i % 2;
  let p = first, turn = 0, firstHitBy = -1, raceAt = null;
  const hitEvents = [];          // [hitter, bucket]
  const shut = [false, false];
  const at10 = [null, null];
  let w = null;
  for (; turn < 1000; turn++) {
    w = winner(g); if (w) break;
    const o = 1 - p;
    // the side to roll: on the bar against a closed board?
    if (g.pos[p][25] && homeClosed(g.pos[o]) === 6) shut[p] = true;
    // the first position without contact, from the side to roll
    if (!raceAt && rear(g.pos[p]) + rear(g.pos[o]) <= 25) raceAt = { p, d: pips(g, o) - pips(g, p) };
    const before = cloneGame(g);
    const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    applySteps(g, p, chooseMove(g, p, dice, LV, rnd));
    // p's hits this turn: o's lone checkers that left their point (only a hit moves o's checkers)
    if (g.pos[o][25] > before.pos[o][25]) {
      if (firstHitBy < 0) firstHitBy = p;
      for (let s = 1; s <= 24; s++) if (before.pos[o][s] === 1 && g.pos[o][s] === 0) hitEvents.push([p, bucket(25 - s)]);
    }
    const myTurnNo = Math.floor(turn / 2) + 1;
    if (myTurnNo === 10 && at10[p] === null) {
      let blots = 0;
      for (let r = 1; r <= 24; r++) {
        if (g.pos[p][r] !== 1) continue;
        let reach = false;
        for (let s = 25 - r + 1; s <= Math.min(25, 25 - r + 12); s++) if (g.pos[o][s] > 0) reach = true;
        if (reach) blots++;
      }
      at10[p] = { home: homeClosed(g.pos[p]), blots: Math.min(blots, 4) };
    }
    p = o;
  }
  out.turns += turn;
  out.hits += hitEvents.length;
  if (!w) { out.ends.unfinished++; continue; }
  out.decided++;
  if (w.p === first) out.starterWins++;
  if (w.points === 2) out.ends.mars++; else out.ends.single++;
  if (firstHitBy >= 0) { out.firstHit.games++; if (firstHitBy === w.p) out.firstHit.hitterWins++; }
  for (const [hitter, b] of hitEvents) { out.hitBuckets[b][0]++; if (hitter === w.p) out.hitBuckets[b][1]++; }
  for (let q = 0; q < 2; q++) {
    if (shut[q]) { out.shutOut.sides++; if (w.p === q) out.shutOut.wins++; }
    if (at10[q]) {
      const h = String(Math.min(at10[q].home, 5)), b = String(at10[q].blots);
      (out.homeAt10[h] ||= [0, 0])[0]++; if (w.p === q) out.homeAt10[h][1]++;
      (out.blotsAt10[b] ||= [0, 0])[0]++; if (w.p === q) out.blotsAt10[b][1]++;
    }
  }
  if (raceAt) { const k = raceBucket(raceAt.d); (out.race[k] ||= [0, 0])[0]++; if (w.p === raceAt.p) out.race[k][1]++; }
}
const pc = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const table = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => +a[0] - +b[0]).map(([k, [n, w]]) => [k, { n, win: pc(w, n) }]));
const summary = {
  games: N, level: LV, avgTurns: +(out.turns / N).toFixed(1), hitsPerGame: +(out.hits / N).toFixed(1),
  ends: Object.fromEntries(Object.entries(out.ends).map(([k, v]) => [k, pc(v, N)])),
  starterWins: pc(out.starterWins, out.decided),
  firstHitterWins: pc(out.firstHit.hitterWins, out.firstHit.games),
  hitWinByPipsLost: Object.fromEntries(Object.entries(out.hitBuckets).map(([k, [n, w]]) => [k, { hits: n, hitterWins: pc(w, n) }])),
  homePointsAt10: table(out.homeAt10),
  loneCheckersAt10: table(out.blotsAt10),
  shutOut: { sides: out.shutOut.sides, share: pc(out.shutOut.sides, 2 * out.decided), win: pc(out.shutOut.wins, out.shutOut.sides) },
  raceLead: table(out.race),
};
console.log(JSON.stringify(summary));
