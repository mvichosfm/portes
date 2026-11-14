// Browser harness (dev server only; test/ is never published). In the page's console:
//   const H = await import('/test/browser-harness.mjs');
//   await H.playGame({ seat: 0, humanLevel: 2, cpuLevel: 3 })
// plays a whole game through the page - the human side driven by the engine at humanLevel through
// playPath / done, the computer by the page itself - and after every committed turn compares the
// 3D board (window.__portes.stackColours / offStacks, both bars included) with the engine's game
// state. Animations are stepped with __portes.advance, so it also works while the preview pane is
// hidden. Also here: checkBarHalo() (the bar's source ring), checkHintBar() (the hint names the
// bar), frameSpike() (one long frame must not lower the render resolution) and
// checkCpuNoMovePause() (a new game during the computer's no-move pause), each described above
// its function.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the expected colours of each board slot (0..23 drawn from the human's seat, 24 the human's bar,
// 25 the computer's bar)
export function expectedStacks(P, g) {
  const H = P.human, C = 1 - H, ch = (p, n) => (p === 0 ? 'W' : 'B').repeat(n), out = [];
  for (let a = 0; a < 24; a++) {
    const rr = [H === 0 ? a + 1 : 24 - a, H === 1 ? a + 1 : 24 - a];
    out.push(ch(0, g.pos[0][rr[0]]) + ch(1, g.pos[1][rr[1]]));
  }
  out.push(ch(H, g.pos[H][25]), ch(C, g.pos[C][25]));
  return out;
}

export async function playGame({ seat = 0, humanLevel = 2, cpuLevel = 3, maxChecks = 400 } = {}) {
  const P = window.__portes;
  P.setTimeScale(0.01);
  P.setLevel(cpuLevel);
  if (P.human !== seat) document.querySelector(`#seat button[data-color="${seat}"]`).click(); else P.startGame();
  let checks = 0, lastLen = -1, barSeen = 0, guard = 0, started = null, stuck = 0, lastSig = '';
  const mismatches = [];
  const compare = (n) => {
    lastLen = n; checks++;
    const e = expectedStacks(P, P.g), s = P.stackColours;
    barSeen += s[24].length + s[25].length;
    for (let a = 0; a < 26; a++) if (e[a] !== s[a]) mismatches.push({ turn: n, a, e: e[a], s: s[a] });
    const off = P.offStacks;
    if (off[0] !== P.g.off[0] || off[1] !== P.g.off[1]) mismatches.push({ turn: n, off, g: P.g.off.slice() });
  };
  while (guard++ < 60000) {
    P.advance(0.3);
    await sleep(2);
    const ph = P.phase, n = P.record ? P.record.turns.length : 0;
    const sig = ph + n + (P.T ? P.T.played.length : -1) + P.busy;
    if (sig === lastSig) { if (++stuck > 3000) return { stuckAt: sig, turns: n, mismatches, nMismatch: mismatches.length }; } else { stuck = 0; lastSig = sig; }
    if (!P.busy && n !== lastLen && (!P.T || (ph === 'human-move' && P.T.played.length === 0))) compare(n);
    if (ph === 'over' || checks > maxChecks) break;
    if (P.busy) continue;
    if (ph === 'opening' || ph === 'human-roll') { P.roll(); continue; }
    if (ph === 'human-move') {
      const T = P.T;
      if (T.M === 0) continue;
      if (T.played.length === 0 && started !== T) {
        started = T;
        const steps = P.engine.chooseMove(P.engine.cloneGame(P.g), P.human, P.curDice, humanLevel);
        P.playPath(steps.map((s) => ({ ...s, from: P.A(P.human, s.r), to: s.t ? P.A(P.human, s.t) : -1 })));
      } else if (T.played.length >= T.M) P.done();
    }
  }
  P.advance(1);
  compare(-2);
  return { phase: P.phase, turns: P.record && P.record.turns.length, result: P.record && P.record.result, checks, barSeen, mismatches: mismatches.slice(0, 10), nMismatch: mismatches.length, title: document.getElementById('ovTitle').textContent };
}

// The bar's source ring must go out with the other marks:
//   await H.checkBarHalo()   ->   { pass: true, bar: 0, rings: [] }
// Puts one of the player's checkers on the bar, rolls a forced 3-1, enters with the 3 and then lists
// the rings (renderOrder 4) still lit on the centre bar (x = 0). With the bar empty there must be
// none. Leaves the test position on the board - start a new game afterwards.
export async function checkBarHalo() {
  const P = window.__portes;
  P.setTimeScale(0.01);
  const arr = (o) => { const out = new Array(26).fill(0); for (const k in o) out[k] = o[k]; return out; };
  const mine = arr({ 25: 1, 24: 1, 13: 5, 8: 3, 6: 5 }), his = arr({ 24: 2, 13: 5, 8: 3, 6: 5 });
  const settle = async (ready) => {
    for (let i = 0; i < 4000; i++) { P.advance(0.3); await sleep(2); if (ready()) return true; }
    return false;
  };
  // never jump to the test position in the middle of a move (the computer's turn would lose its T)
  if (!await settle(() => !P.busy)) return { pass: false, error: 'the board never came to rest', phase: P.phase };
  P.setGame(P.human === 0 ? [mine, his] : [his, mine], [0, 0]);
  P.forceDice([3, 1]);
  P.roll();
  const barRings = () => {
    const out = [];
    P.three.scene.traverse((m) => {
      if (m.isMesh && m.visible && m.renderOrder === 4 && Math.abs(m.position.x) < 0.01) out.push(m.position.toArray().map((v) => +v.toFixed(2)));
    });
    return out;
  };
  if (!await settle(() => P.phase === 'human-move' && !P.busy)) return { pass: false, error: 'the turn did not start', phase: P.phase };
  const before = barRings();
  const step = P.legal.find((s) => s.from === 24 && s.d === 3);
  if (!step) return { pass: false, error: 'no entry from the bar with the 3', legal: P.legal };
  P.playPath([step]);
  if (!await settle(() => !P.busy && P.T && P.T.played.length === 1)) return { pass: false, error: 'the entry did not finish', phase: P.phase };
  const bar = P.stacks[24], rings = barRings();
  return { pass: before.length === 1 && bar === 0 && rings.length === 0, bar, before, rings };
}

// The hint must call the bar "bar", never point 0:
//   await H.checkHintBar()   ->   { pass: true, toast: 'Suggested play: bar...' }
// Puts one of the player's checkers on the bar, rolls a forced 4-2 and asks for a hint. A checker on
// the bar must enter first, so whichever play the Expert picks its first step starts from the bar,
// and the message must name it. Leaves the test position on the board - start a new game afterwards.
export async function checkHintBar() {
  const P = window.__portes;
  P.setTimeScale(0.01);
  const arr = (o) => { const out = new Array(26).fill(0); for (const k in o) out[k] = o[k]; return out; };
  const mine = arr({ 25: 1, 24: 1, 13: 5, 8: 3, 6: 5 }), his = arr({ 24: 2, 13: 5, 8: 3, 6: 5 });
  const settle = async (ready) => {
    for (let i = 0; i < 4000; i++) { P.advance(0.3); await sleep(2); if (ready()) return true; }
    return false;
  };
  if (!await settle(() => !P.busy)) return { pass: false, error: 'the board never came to rest', phase: P.phase };
  P.setGame(P.human === 0 ? [mine, his] : [his, mine], [0, 0]);
  P.forceDice([4, 2]);
  P.roll();
  if (!await settle(() => P.phase === 'human-move' && !P.busy)) return { pass: false, error: 'the turn did not start', phase: P.phase };
  const el = document.getElementById('toast');
  el.textContent = '';
  const h = P.hint();
  if (!await settle(() => !P.busy)) return { pass: false, error: 'the hint never came', phase: P.phase };
  await h;
  const text = el.textContent, arrow = String.fromCharCode(0x2192);
  return { pass: text.startsWith('Suggested play: bar' + arrow) && !new RegExp('(^|[ ,:])0' + arrow).test(text), toast: text };
}

// One long frame must not lower the render resolution:
//   await H.frameSpike()   ->   { ok: true, before: 1, lowest: 1, cap: 1, frameMs: 9.8 }
// Paces the page's own render loop with a timer (requestAnimationFrame is replaced for the test and
// put back afterwards), waits for full resolution, runs frames `pace` ms apart for 3 s, blocks the
// main thread for `block` ms (one long frame, like coming back to the app) and then watches the
// renderer's pixel ratio for 4 s: it must stay at the cap (devicePixelRatio, at most 1.5). frameMs
// is the steady frame time it measured. Where the pane fires no frames (hidden), start it without
// awaiting, take one screenshot (the one real frame that hands the loop to the timer), then await.
export async function frameSpike({ pace = 8, block = 4000 } = {}) {
  const R = window.__portes.three.renderer, cap = Math.min(window.devicePixelRatio, 1.5);
  if (cap <= 0.6) return { ok: false, why: 'no room to lower the resolution', cap };
  const raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
  let delay = 0;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), delay);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  const until = async (ready, ms) => {
    for (const t0 = performance.now(); performance.now() - t0 < ms;) { if (ready()) return true; await sleep(50); }
    return ready();
  };
  try {
    const f0 = R.info.render.frame;
    if (!await until(() => R.info.render.frame >= f0 + 5, 20000)) return { ok: false, why: 'no frames' };
    if (!await until(() => R.getPixelRatio() === cap, 30000)) return { ok: false, why: 'never at full resolution', ratio: R.getPixelRatio(), cap };
    delay = pace;
    const f1 = R.info.render.frame, t1 = performance.now();
    await sleep(3000);
    const frameMs = +((performance.now() - t1) / Math.max(1, R.info.render.frame - f1)).toFixed(1);
    const before = R.getPixelRatio();
    for (const t0 = performance.now(); performance.now() - t0 < block;);
    let lowest = R.getPixelRatio();
    for (let i = 0; i < 40; i++) { await sleep(100); lowest = Math.min(lowest, R.getPixelRatio()); }
    return { ok: before === cap && lowest === cap, before, lowest, cap, frameMs };
  } finally {
    window.requestAnimationFrame = raf;
    window.cancelAnimationFrame = caf;
  }
}

// A new game during the computer's "no legal move" pause must stop that turn:
//   await H.checkCpuNoMovePause()   ->   { pass: true, phase: 'opening', errors: [] }
// Closes the player's six home points with a computer checker on the bar, plays a forced 1-2 from
// point 8 (the home points stay closed) and lets the computer roll a forced 3-4: it cannot enter.
// The moment the status line says so, a new game is started. The old turn must end there - no
// unhandled error - and the new game must still be waiting for the opening throw.
export async function checkCpuNoMovePause() {
  const P = window.__portes;
  P.setTimeScale(0.02);
  const arr = (o) => { const out = new Array(26).fill(0); for (const k in o) out[k] = o[k]; return out; };
  const mine = arr({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 8: 3 }), his = arr({ 25: 1, 6: 5, 5: 5, 4: 4 });
  const settle = async (ready) => {
    for (let i = 0; i < 4000; i++) { P.advance(0.3); await sleep(2); if (ready()) return true; }
    return false;
  };
  const errors = [], onError = (e) => errors.push(String((e.reason && e.reason.message) || e.reason));
  const status = document.getElementById('status');
  let restarted = false;
  // (an observer, not a poll: at this time scale the pause lasts 28 ms)
  const seen = new MutationObserver(() => {
    const text = status.textContent;
    if (!restarted && text.includes('Computer rolled') && text.includes('no legal move')) { restarted = true; P.startGame(); }
  });
  window.addEventListener('unhandledrejection', onError);
  try {
    if (!await settle(() => !P.busy)) return { pass: false, error: 'the board never came to rest', phase: P.phase };
    P.setGame(P.human === 0 ? [mine, his] : [his, mine], [0, 0]);
    P.forceDice([1, 2], [3, 4]);
    P.roll();
    if (!await settle(() => P.phase === 'human-move' && !P.busy)) return { pass: false, error: 'the turn did not start', phase: P.phase };
    seen.observe(status, { childList: true, characterData: true, subtree: true });
    for (const d of [1, 2]) {
      const step = P.legal.find((s) => s.r === 8 && s.d === d);
      if (!step) return { pass: false, error: 'no step from point 8 with the ' + d, legal: P.legal };
      const n = P.T.played.length;
      P.playPath([step]);
      if (!await settle(() => restarted || (!P.busy && P.T && P.T.played.length === n + 1))) return { pass: false, error: 'the step did not finish', phase: P.phase };
    }
    P.done(); // (does nothing if the turn already ended by itself)
    if (!await settle(() => restarted)) return { pass: false, error: 'the computer never ran out of moves', phase: P.phase, status: status.textContent };
    for (let i = 0; i < 60; i++) { P.advance(0.2); await sleep(2); }
    await sleep(200);
    return { pass: errors.length === 0 && P.phase === 'opening', phase: P.phase, errors };
  } finally {
    seen.disconnect();
    window.removeEventListener('unhandledrejection', onError);
  }
}
