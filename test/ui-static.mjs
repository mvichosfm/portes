// Static checks of UI code in src/main.js that needs no browser: node test/ui-static.mjs
// main.js cannot be imported in node (renderer, DOM), so the global keyboard handler is cut out
// of the source text and run against stubs. Checked here:
// - no game key acts behind an open sheet (Settings, Rules, Puzzles); only Esc is handled there;
// - Esc closes the Puzzles picker instead of leaving the puzzle underneath it;
// - with nothing open the keys still do what they did;
// - index.html: the toast is stacked above the sheets, so a message raised inside one is seen;
// - index.html: a closed sheet, and the panels behind the welcome screen, are taken out of the tab
//   order and the accessibility tree (visibility), not only faded out.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL: ' + msg); } };

const HEAD = "window.addEventListener('keydown', (e) => {\n  if (heroOpen()) {";
const TAIL = "\n});\n\n$('rollBtn').onclick = roll;";
const from = src.indexOf(HEAD), to = src.indexOf(TAIL, from);
ok(from >= 0 && to > from, 'the global keydown handler is found in src/main.js');
const body = from >= 0 && to > from ? src.slice(from + HEAD.indexOf('{\n') + 1, to) : '';

// Everything the handler reads from main.js's module scope, in a fixed order.
const NAMES = ['$', 'heroOpen', 'closeHero', 'editing', 'phase', 'replay', 'replayStep', 'replayJump',
  'replayPlay', 'exitReplay', 'setLight', 'lightLevel', 'roll', 'done', 'T', 'turnDone', 'undo', 'hint',
  'makisDemo', 'homeView', 'setFreeCam', 'freeCam', 'slam', 'setLamp', 'lampOn', 'puzzle', 'exitPuzzle',
  'select'];
const SPIES = ['closeHero', 'replayStep', 'replayJump', 'replayPlay', 'exitReplay', 'setLight', 'roll',
  'done', 'undo', 'hint', 'makisDemo', 'homeView', 'setFreeCam', 'slam', 'setLamp', 'exitPuzzle', 'select'];
let build = null;
try { build = new Function(...NAMES, 'return (e) => {' + body + '\n};'); }
catch (err) { ok(false, 'the keydown handler compiles on its own: ' + err.message); }

// Press one key with the given sheets open; returns what the handler called.
function press(key, { open = [], phase = 'human-roll', puzzle = null, hero = false } = {}) {
  const calls = [];
  let prevented = false;
  const env = {
    $: (id) => ({ classList: {
      contains: (c) => c === 'hidden' && !open.includes(id),
      add: (c) => { if (c === 'hidden') calls.push('hide:' + id); },
      remove: () => {},
    } }),
    heroOpen: () => hero, editing: null, phase, replay: { idx: 0, rec: { turns: [] } },
    lightLevel: 1, T: null, turnDone: () => false, freeCam: false, lampOn: false, puzzle,
  };
  for (const n of SPIES) env[n] = () => { calls.push(n); };
  const handler = build(...NAMES.map((n) => env[n]));
  handler({ key, target: { tagName: 'BODY' }, preventDefault: () => { prevented = true; } });
  return { calls, prevented };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (build) {
  let r;

  // --- no game keys behind a sheet ---
  r = press(' ', { open: ['rules'] });
  ok(same(r.calls, []) && !r.prevented, `Rules open + Space does nothing (got ${JSON.stringify(r.calls)}, prevented ${r.prevented})`);
  r = press('Enter', { open: ['rules'], phase: 'opening' });
  ok(same(r.calls, []), `Rules open + Enter does not throw the opening dice (got ${JSON.stringify(r.calls)})`);
  r = press('h', { open: ['puzzles'], phase: 'human-move' });
  ok(same(r.calls, []), `Puzzles open + H asks for no hint (got ${JSON.stringify(r.calls)})`);
  for (const key of ['u', 'm', 's', 'l', 'v', 'c', '[', ']', 'Backspace']) {
    for (const sheet of ['rules', 'puzzles']) {
      r = press(key, { open: [sheet], phase: 'human-move' });
      ok(same(r.calls, []), `${sheet} open + ${key} does nothing (got ${JSON.stringify(r.calls)})`);
    }
  }
  r = press(' ', { open: ['settings'] });
  ok(same(r.calls, []) && !r.prevented, `Settings open + Space does nothing (got ${JSON.stringify(r.calls)})`);

  // --- Esc closes the sheet on top ---
  r = press('Escape', { open: ['puzzles'] });
  ok(r.calls.includes('hide:puzzles'), `Puzzles open + Esc closes the picker (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { open: ['puzzles'], phase: 'human-move', puzzle: { live: true } });
  ok(r.calls.includes('hide:puzzles') && !r.calls.includes('exitPuzzle'),
    `Puzzles open over a running puzzle + Esc closes the picker and keeps the puzzle (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { open: ['rules'], phase: 'human-move', puzzle: { live: true } });
  ok(r.calls.includes('hide:rules') && !r.calls.includes('exitPuzzle'),
    `Rules open over a running puzzle + Esc closes Rules and keeps the puzzle (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { open: ['settings'] });
  ok(r.calls.includes('hide:settings'), `Settings open + Esc closes it (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { open: ['games'] });
  ok(same(r.calls, ['hide:games']), `Games open + Esc closes it (got ${JSON.stringify(r.calls)})`);

  // --- with nothing open the keys work as before ---
  r = press(' ');
  ok(same(r.calls, ['roll']) && r.prevented, `nothing open + Space in human-roll rolls (got ${JSON.stringify(r.calls)})`);
  r = press('h', { phase: 'human-move' });
  ok(same(r.calls, ['hint']), `nothing open + H asks for a hint (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { phase: 'human-move', puzzle: { live: true } });
  ok(same(r.calls, ['exitPuzzle']), `nothing open + Esc in a puzzle leaves it (got ${JSON.stringify(r.calls)})`);
  r = press('Escape', { phase: 'human-move' });
  ok(r.calls[0] === 'select' && !r.calls.includes('exitPuzzle'), `nothing open + Esc drops the selection (got ${JSON.stringify(r.calls)})`);
  r = press(' ', { phase: 'replay' });
  ok(same(r.calls, ['replayPlay']) && r.prevented, `replay + Space plays the replay (got ${JSON.stringify(r.calls)})`);
  r = press(' ', { hero: true });
  ok(same(r.calls, ['closeHero']), `welcome screen + Space starts playing (got ${JSON.stringify(r.calls)})`);
}

// --- index.html: a message raised while a sheet is open is drawn over the sheet ---
// The toast comes before the sheets in the page, so without a z-index of its own it is painted
// under them. It must sit above the sheets (.modal) and the welcome screen (#hero), and below
// the loading veil (#veil).
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // every z-index declared in a rule whose selector list names exactly `sel`
  const zOf = (sel) => {
    const out = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1].split(',').some((s) => s.trim() === sel)) continue;
      const z = /(?:^|;)\s*z-index\s*:\s*(-?\d+)/.exec(m[2]);
      if (z) out.push(Number(z[1]));
    }
    return out;
  };
  const toast = zOf('#toast'), modal = zOf('.modal'), hero = zOf('#hero'), veil = zOf('#veil');
  ok(modal.length > 0 && hero.length > 0 && veil.length > 0,
    `index.html declares a z-index for .modal, #hero and #veil (got ${JSON.stringify({ modal, hero, veil })})`);
  ok(toast.length > 0, 'index.html declares a z-index for #toast');
  ok(toast.length > 0 && Math.min(...toast) > Math.max(...modal),
    `#toast is above the sheets (toast ${JSON.stringify(toast)}, .modal ${JSON.stringify(modal)})`);
  ok(toast.length > 0 && Math.min(...toast) > Math.max(...hero),
    `#toast is above the welcome screen (toast ${JSON.stringify(toast)}, #hero ${JSON.stringify(hero)})`);
  ok(toast.length > 0 && Math.max(...toast) < Math.min(...veil),
    `#toast is below the loading veil (toast ${JSON.stringify(toast)}, #veil ${JSON.stringify(veil)})`);

  // --- index.html: what is faded out cannot be reached with Tab ---
  // opacity:0 + pointer-events:none hides a closed sheet from the mouse only: its buttons and
  // switches stay in the tab order and Space still toggles them. visibility:hidden removes them.
  // It is switched after the fade-out (a delayed transition) and back at once on opening, so the
  // fades are kept and focus() right after removing .hidden still lands.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((s) => s.trim()), body: m[2] }));
  const decl = (body, prop) => {
    const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(body);
    return m ? m[1].trim() : null;
  };
  // the visibility switch waits exactly as long as the opacity fade lasts
  const delayed = (t) => {
    const o = /opacity\s+([\d.]+s)/.exec(t || ''), v = /visibility\s+0s\s+([\d.]+s)/.exec(t || '');
    return !!o && !!v && o[1] === v[1];
  };
  const HERO_UP = 'body:has(#hero:not(.hidden))';
  const groups = [
    ['a closed sheet (.modal.hidden)', rules.filter((r) => r.sels.includes('.modal.hidden')),
      rules.filter((r) => r.sels.includes('.modal'))],
    ['the panels behind the welcome screen', rules.filter((r) => r.sels.some((s) => s.startsWith(HERO_UP))),
      rules.filter((r) => r.sels.includes('#brand') && r.body.includes('transition'))],
  ];
  for (const [name, hiddenRules, shownRules] of groups) {
    ok(hiddenRules.length > 0, `index.html has a rule for ${name}`);
    ok(hiddenRules.some((r) => decl(r.body, 'visibility') === 'hidden'),
      `${name}: visibility:hidden, so its controls leave the tab order`);
    ok(hiddenRules.some((r) => delayed(decl(r.body, 'transition'))),
      `${name}: visibility switches only after the fade-out (got ${JSON.stringify(hiddenRules.map((r) => decl(r.body, 'transition')))})`);
    ok(shownRules.length > 0 && shownRules.every((r) => !/visibility/.test(decl(r.body, 'transition') || '')),
      `${name}: shown again at once, no delayed visibility on the open state`);
  }
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
