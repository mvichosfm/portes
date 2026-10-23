// The guided lessons (Learn): nine short scripted positions on the real board, each introducing
// one rule of Portes. Pure data + goal checks, no DOM - main.js plays them through the normal turn
// machinery (the way puzzles are played) and test/lessons.mjs proves every position, answer and
// check against the engine.
//
// Everything here is written in the numbering a player SEES (records.shown): point 1 is the
// player's rearmost point (top right), 1-12 run right to left along the far rail, 13-24 left to
// right along the near rail, home is 19-24 (bottom right) and bearing off is "after 24". The computer
// travels the other way round: its home is the player's 1-6, so a computer checker on shown point s
// stands on its OWN point s. The engine counts the player's side the other way (r = 25 - shown);
// boardFrom / lessonSteps convert. 'bar' is a side's bar (engine point 25).

const rOf = (shown) => (shown === 'bar' ? 25 : 25 - shown); // the player's own engine point for a shown point

// { mine: { shown | 'bar': count }, opp: { shown | 'bar': count }, myOff, oppOff } -> an engine view
// (mine / opp each in its own numbering, as puzzles.js stores them).
export function boardFrom({ mine, opp, myOff = 0, oppOff = 0 }) {
  const m = new Int8Array(26), o = new Int8Array(26);
  for (const [s, n] of Object.entries(mine)) m[rOf(s === 'bar' ? s : +s)] += n;
  for (const [s, n] of Object.entries(opp)) o[s === 'bar' ? 25 : +s] += n; // the computer's own point is the shown number
  return { mine: m, opp: o, myOff, oppOff };
}

// [{from, to, d}] in shown numbers (from: 'bar' enters, to: 'off' bears off) -> engine steps [{r, t, d}]
export const lessonSteps = (answer) => answer.map(({ from, to, d }) => ({ r: rOf(from), t: to === 'off' ? 0 : rOf(to), d }));

// the starting position as the player sees it: his 2 / 5 / 3 / 5 on 1, 12, 17, 19; the computer's on 24, 13, 8, 6
const START_MINE = { 1: 2, 12: 5, 17: 3, 19: 5 }, START_OPP = { 24: 2, 13: 5, 8: 3, 6: 5 };

export const LESSONS = [
  {
    id: 'direction', title: 'The board and the two ways round',
    mine: START_MINE, opp: START_OPP, dice: [3, 1], goal: [20],
    teach: `<p>You are the ivory checkers. You travel <b>1 to 12 along the far rail (right to left), then 13 to 24 along the near rail (left to right)</b>; your home is <b>19–24</b>, bottom right. The computer goes the <b>other way round</b> and its home is your <b>1–6</b>, top right. You start as in backgammon: <b>2 on point 1</b> (top right, deep in the computer's home), <b>5 on 12</b>, <b>3 on 17</b> and <b>5 on 19</b>; the computer mirrors you. The gold numbers on the rails stay on during the lessons.</p>`,
    task: `You rolled <b>3–1</b>, the best opening roll there is: make the glowing point <b>20</b> with two checkers — 17 → 20 with the 3 and 19 → 20 with the 1. Click a glowing checker, then a point — or drag the checker there.`,
    check: (v) => v.mine[rOf(20)] === 2,
    answer: [{ from: 17, to: 20, d: 3 }, { from: 19, to: 20, d: 1 }],
    win: `<p>Point 20 is made: two checkers of yours there, and the computer can never land on it. Each die moves a checker that many points along your way round; you choose how to spend the dice.</p>`,
    miss: `<p>Not quite: the goal is two of your checkers on point 20 — one from 17 with the 3, one from 19 with the 1. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'hit', title: 'Hitting: off to the bar',
    mine: START_MINE, opp: { 24: 2, 13: 5, 8: 3, 6: 4, 5: 1 }, dice: [4, 2], goal: [5],
    teach: `<p>A single checker on a point is a <b>blot</b>. Land on a blot of the computer's and you <b>hit</b> it: it is lifted off and put on the <b>bar</b> in the middle of the board, and it has to start its whole journey again. That is the heart of Portes — <i>"πόρτες"</i>, doors: two checkers on a point make a door the other side cannot pass through, one checker alone is an open invitation.</p>`,
    task: `The computer left a blot on <b>5</b>. You rolled <b>4–2</b>: hit it with a back checker, 1 → 5 with the 4, and play the 2 anywhere.`,
    check: (v) => v.opp[25] === 1,
    answer: [{ from: 1, to: 5, d: 4 }, { from: 12, to: 14, d: 2 }],
    win: `<p>Hit! The computer's checker was 5 pips from home; now it waits on the bar with 25 to go. Your checker on 5 is a blot itself now — hitting usually costs a little safety.</p>`,
    miss: `<p>The computer's checker on 5 should end the move on the bar — land on it with the 4 from point 1. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'closed', title: 'Closed points',
    mine: START_MINE, opp: START_OPP, dice: [6, 5], goal: [12],
    teach: `<p>A point is <b>closed</b> to you when the computer has <b>two or more</b> checkers on it. Closed points never light up, and a checker that plays both dice must touch down on the point in between — so that point must be open too. At the start the computer holds your 6, 8, 13 and 24.</p>`,
    task: `You rolled <b>6–5</b>. Run a back checker all the way from 1 to <b>12</b>: the 5 first would land on 6, which is closed, so play the 6 first (1 → 7), then the 5 (7 → 12).`,
    check: (v) => v.mine[rOf(12)] === 6 && v.mine[rOf(1)] === 1,
    answer: [{ from: 1, to: 7, d: 6 }, { from: 7, to: 12, d: 5 }],
    win: `<p>The "lover's leap": 1 → 7 → 12, a back checker safe among friends. Had you landed on a closed point the game would simply not have offered it.</p>`,
    miss: `<p>The goal is a back checker on 12 (six there) with one left on 1: 1 → 7 with the 6, then 7 → 12 with the 5. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'bar', title: 'Coming in from the bar',
    mine: { bar: 1, 1: 1, 12: 5, 17: 3, 19: 5 }, opp: START_OPP, dice: [6, 3], goal: [3],
    teach: `<p>A checker on the <b>bar</b> must come back in <b>before anything else moves</b>. It enters the computer's home board — your points <b>1–6</b> — on the point its die shows: a 3 enters on your 3, a 6 on your 6. A closed point cannot be entered, and if neither die gets in, the whole turn is lost.</p>`,
    task: `One of your checkers is on the bar. You rolled <b>6–3</b>: the 6 is closed (the computer holds your 6), so enter with the 3 — then play the 6 with any checker.`,
    check: (v) => v.mine[25] === 0 && v.mine[rOf(3)] >= 1,
    answer: [{ from: 'bar', to: 3, d: 3 }, { from: 12, to: 18, d: 6 }],
    win: `<p>Back in on 3. Only once the bar was empty could the 6 move another checker. The more points the computer closes in its home board, the harder it is to come in.</p>`,
    miss: `<p>Enter the checker from the bar on point 3 with the 3 (click it on the bar), then play the 6. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'home', title: 'Close the door',
    mine: { 12: 4, 17: 2, 19: 3, 20: 2, 21: 2, 22: 2 }, opp: { bar: 1, 13: 5, 8: 4, 6: 5 }, dice: [6, 6], goal: [23],
    teach: `<p>The computer's checkers enter into <b>your home board</b> (19–24). Every point you close there is a door shut in its face: with four closed, a checker on the bar gets in on only 5 rolls in 9; with five, under 1 in 3; with all six closed it <b>cannot enter at all</b> and the computer loses its turn until you open up.</p>`,
    task: `The computer has a checker on the bar and you hold 19–22. You rolled <b>6–6</b>: close point <b>23</b> (both checkers from 17), and bring two more checkers from 12 to 18.`,
    check: (v) => v.mine[rOf(23)] >= 2,
    answer: [{ from: 17, to: 23, d: 6 }, { from: 17, to: 23, d: 6 }, { from: 12, to: 18, d: 6 }, { from: 12, to: 18, d: 6 }],
    win: `<p>Five points closed: only a 1 (your 24) lets the computer back in, 11 rolls in 36. Close the sixth and it is shut out completely — a <b>closed board</b>.</p>`,
    miss: `<p>End with two checkers on 23: both from 17 with two of the 6s, and two from 12 to 18 with the others. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'larger', title: 'Both dice — or the larger',
    mine: { 12: 1 }, myOff: 14, opp: { 24: 13, 23: 2 }, dice: [6, 5], goal: [18],
    teach: `<p>You must play <b>both dice</b> whenever that is possible (all four on a double). If only <b>one</b> die can be played, it has to be the <b>larger</b> one.</p>`,
    task: `Your last checker stands on 12 and you rolled <b>6–5</b>. 12 + 6 + 5 = 23, which the computer holds, so you cannot play both. Move the checker and see which die the game lets you use.`,
    check: (v) => v.mine[rOf(18)] === 1,
    answer: [{ from: 12, to: 18, d: 6 }],
    win: `<p>The 6. 12 → 17 with the 5 is open too, but when only one die can be played it must be the larger one, so the game only offers the 6.</p>`,
    miss: `<p>The checker should end on 18, played with the 6. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'doubles', title: 'Doubles play four times',
    mine: { 1: 13, 12: 1, 15: 1 }, opp: { 24: 15 }, dice: [3, 3], goal: [21],
    teach: `<p>A double is played <b>four times</b>: a 3–3 gives you four moves of 3, split between your checkers however you like.</p>`,
    task: `You rolled <b>3–3</b>. Take the checker on 12 to <b>21</b> (12 → 15 → 18 → 21 uses three of the 3s), then play the fourth 3 anywhere.`,
    check: (v) => v.mine[rOf(21)] >= 1 && !v.mine[rOf(12)],
    answer: [{ from: 12, to: 15, d: 3 }, { from: 15, to: 18, d: 3 }, { from: 18, to: 21, d: 3 }, { from: 15, to: 18, d: 3 }],
    win: `<p>Twelve pips in one roll. Notice the game kept the count for you — it said how many moves were still to play.</p>`,
    miss: `<p>The checker from 12 should reach point 21 in three steps of 3. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'bearoff', title: 'Bearing off',
    mine: { 20: 3, 21: 3, 22: 3, 23: 3, 24: 3 }, opp: { 3: 7, 4: 8 }, dice: [6, 2], goal: [],
    teach: `<p>When all fifteen are in your home (19–24) you may <b>bear off</b>: a die takes a checker off the point it counts to (a 1 from 24 … a 6 from 19). If that point is empty <b>and nothing of yours stands further back</b>, a larger die takes the furthest-back checker. A checker hit while you bear off must come all the way round again before you can go on.</p>`,
    task: `You rolled <b>6–2</b>. Point 19 is empty and nothing stands behind 20, so the 6 bears off a checker from <b>20</b>; bear off one from <b>23</b> with the 2.`,
    check: (v) => v.myOff === 2 && v.mine[rOf(20)] === 2,
    answer: [{ from: 20, to: 'off', d: 6 }, { from: 23, to: 'off', d: 2 }],
    win: `<p>Two off. The larger die took the checker furthest back — a 6 is never wasted in a bear-off.</p>`,
    miss: `<p>Bear off one checker from 20 with the 6 and one from 23 with the 2. Press <b>Try again</b>.</p>`,
  },
  {
    id: 'mars', title: 'Mars: a double win',
    mine: { 24: 3 }, myOff: 12, opp: { 7: 5, 8: 5, 9: 5 }, dice: [1, 1], goal: [],
    teach: `<p>A win scores <b>1 point</b>. If you bear off all fifteen before the computer has borne off <b>a single checker</b> it is a <b>mars</b> (a gammon), worth <b>2 points</b>. Portes has no doubling cube and no triple win: a mars is the most a game can score.</p>`,
    task: `You have 12 checkers off, three left on 24, and the computer has none off. You rolled <b>1–1</b>: bear off all three.`,
    check: (v) => v.myOff === 15,
    answer: [{ from: 24, to: 'off', d: 1 }, { from: 24, to: 'off', d: 1 }, { from: 24, to: 'off', d: 1 }],
    win: `<p><b>Mars!</b> Fifteen off while the computer has none: two points. That is every rule. Play a game, try the puzzles, or read the strategy guide to start winning on purpose.</p>`,
    miss: `<p>Bear off all three checkers from 24, one per 1. Press <b>Try again</b>.</p>`,
  },
];

// a lesson's board as an engine puzzle-style record (what puzzleGame / pzView expect)
export const lessonBoard = (L) => ({ ...boardFrom(L), dice: L.dice.slice() });
