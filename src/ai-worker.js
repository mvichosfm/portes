// Runs the computer player, Mr. Makis's analysis and the mistake review off the main thread so
// the 3D scene never stutters while they think. Games and views arrive as plain arrays
// (engine.gamePlain / viewPlain), bars included.
import { chooseMove, analyzeView, screenTurns, reviewTurn, winChances, gameFrom, viewFrom } from './engine.js';

self.onmessage = (e) => {
  const { id, type } = e.data;
  if (type === 'makis') {
    const { view, rem, opts } = e.data;
    self.postMessage({ id, analysis: analyzeView(viewFrom(view), rem, opts) });
    return;
  }
  if (type === 'odds') {
    const { g, toMove, opts } = e.data;
    self.postMessage({ id, analysis: winChances(gameFrom(g), toMove, opts) });
    return;
  }
  if (type === 'screen') { self.postMessage({ id, analysis: screenTurns(e.data.turns, e.data.side) }); return; }
  if (type === 'review') { self.postMessage({ id, analysis: reviewTurn(e.data.turns, e.data.i, e.data.opts) }); return; }
  const { g, p, dice, level } = e.data;
  const steps = chooseMove(gameFrom(g), p, dice, level);
  self.postMessage({ id, steps });
};
