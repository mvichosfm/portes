// Cross-check of strategy.html: node test/strategy-check.mjs [--fast]
// - the page's DATA block equals a fresh run of test/strategy-stats.mjs with the same games/level
//   (skipped with --fast; the run takes ~30 s);
// - every figure reference (data-k) in both languages resolves to a number in DATA;
// - the English and Greek copies quote the same figures and draw the same charts, section by section;
// - section ids pair up (x / x-el).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../strategy.html', import.meta.url), 'utf8');
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL: ' + msg); } };

const m = html.match(/\/\*DATA\*\/([\s\S]*?)\/\*\/DATA\*\//);
ok(!!m, 'DATA block present');
const DATA = m ? JSON.parse(m[1]) : {};
ok(DATA.games > 0 && DATA.level >= 1, 'DATA has its sample');
const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), DATA);

const en = html.slice(html.indexOf('<div data-lang="en">'), html.indexOf('<div data-lang="el"'));
const el = html.slice(html.indexOf('<div data-lang="el"'), html.indexOf('<footer>'));
const keys = (s) => [...s.matchAll(/data-k="([^"]+)"/g)].map((x) => x[1]);
const figs = (s) => [...s.matchAll(/data-fig="([^"]+)"/g)].map((x) => x[1]);
for (const [name, part] of [['en', en], ['el', el]]) {
  for (const k of keys(part)) ok(typeof get(k) === 'number', `${name}: data-k="${k}" resolves to a number`);
}
ok(JSON.stringify(keys(en).sort()) === JSON.stringify(keys(el).sort()), `EN and EL quote the same figures (${keys(en).length} vs ${keys(el).length})`);
ok(JSON.stringify(figs(en)) === JSON.stringify(figs(el)), 'EN and EL draw the same charts in the same order');
// section by section
const sections = (s) => [...s.matchAll(/<section class="card" id="([^"]+)">([\s\S]*?)<\/section>/g)].map((x) => ({ id: x[1], k: keys(x[2]).sort().join('|'), f: figs(x[2]).join('|') }));
const se = sections(en), sg = sections(el);
ok(se.length === sg.length && se.length > 0, `same number of sections (${se.length} / ${sg.length})`);
se.forEach((s, i) => {
  const g = sg[i] || {};
  ok(g.id === `${s.id}-el`, `section ${s.id} pairs with ${g.id}`);
  ok(g.k === s.k, `section ${s.id}: the same figures in both languages`);
  ok(g.f === s.f, `section ${s.id}: the same charts in both languages`);
});
// internal links point at existing ids
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((x) => x[1]));
for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) ok(ids.has(href), `link #${href} has a target`);

if (!process.argv.includes('--fast')) {
  const script = fileURLToPath(new URL('./strategy-stats.mjs', import.meta.url));
  const fresh = JSON.parse(execFileSync('node', [script, String(DATA.games), String(DATA.level)], { encoding: 'utf8', maxBuffer: 1e7 }));
  ok(JSON.stringify(fresh) === JSON.stringify(DATA), 'DATA equals a fresh run of test/strategy-stats.mjs (rerun it and paste the output if the engine changed)');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
