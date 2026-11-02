// Drama report: not who wins, but what a round FEELS like from the inside.
//
// tools/balance.mjs answers "can this arm win". This answers the other half:
// is a round a contest, or a one-sided shove that ends after an uncomfortable
// wait? It reads the grip trace and reports the things a player would describe:
// how often the lead changes, how long you spend losing, how late the outcome is
// decided, how long the round runs, and whether it ends in a pin or on points.
//
// These are proxies for tension, not measurements of fun. A bot's trace cannot
// tell you whether a human wanted another round; it can only tell you whether
// there was anything at stake while it ran.
//
//   node tools/drama.mjs [armId]

import { armById } from '../src/sim/arms.js';
import { OPPONENTS } from '../src/sim/opponents.js';
import { createMatch, stepMatch, ROUND_SECONDS } from '../src/sim/match.js';
import { mash, pumper, thinking } from './bots.mjs';

const BOTS = { pumper: pumper(), thinking: thinking(), mash: mash() };
const DEAD = 0.05; // a grip this close to even is no lead at all

export function trace(armId, oppIndex, makeBot, seed) {
  const arm = armById(armId);
  const m = createMatch({ arm, opponent: OPPONENTS[oppIndex], seed, startStamina: arm.staminaMax });
  const bot = makeBot(m);
  const grip = [];
  for (let i = 0; i < (ROUND_SECONDS + 2) * 60 && m.phase !== 'over'; i += 1) {
    const input = m.phase === 'fighting' ? bot(i / 60) : { pressEdge: false, brace: false };
    stepMatch(m, input, 1 / 60);
    if (m.phase === 'fighting') grip.push(m.angle);
  }
  return { grip, won: m.winner === 'you', reason: m.reason };
}

/** Shape of one grip, as a player would describe it. */
export function shape({ grip, won, reason }) {
  const n = grip.length;
  if (!n) return null;
  const lead = grip.map((a) => (a > DEAD ? 1 : a < -DEAD ? -1 : 0));
  let changes = 0;
  let last = 0;
  for (const s of lead) {
    if (s !== 0 && last !== 0 && s !== last) changes += 1;
    if (s !== 0) last = s;
  }
  const mine = won ? 1 : -1;
  // How late was it decided? The last moment the eventual loser held the lead.
  let loserHeld = -1;
  lead.forEach((s, i) => { if (s !== 0 && s !== mine) loserHeld = i; });
  return {
    secs: n / 60,
    changes,
    losing: lead.filter((s) => s === -1).length / n,
    decidedAt: loserHeld < 0 ? 0 : loserHeld / n,
    margin: Math.abs(grip[n - 1]),
    pinned: reason === 'pin',
    won,
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '  -  ');

if (process.argv[1]?.endsWith('drama.mjs')) {
  const armId = process.argv[2] || 's3';
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => s * 131 + 7);
  console.log(`arm=${armId}  ${OPPONENTS.length} opponents x 5 seeds per bot\n`);
  console.log('bot        opp        secs  leadChanges  timeLosing  decidedAt  margin  pin/judges');
  for (const [name, makeBot] of Object.entries(BOTS)) {
    for (let i = 0; i < OPPONENTS.length; i++) {
      const rows = seeds.slice(0, 5).map((s) => shape(trace(armId, i, makeBot, s))).filter(Boolean);
      const pins = rows.filter((r) => r.pinned).length;
      console.log(
        `${name.padEnd(10)} ${OPPONENTS[i].name.padEnd(10)} ${f(mean(rows.map((r) => r.secs)), 1).padStart(5)}  ` +
        `${f(mean(rows.map((r) => r.changes)), 1).padStart(11)}  ${(100 * mean(rows.map((r) => r.losing))).toFixed(0).padStart(10)}%  ` +
        `${(100 * mean(rows.map((r) => r.decidedAt))).toFixed(0).padStart(9)}%  ` +
        `${f(mean(rows.map((r) => r.margin))).padStart(6)}  ${String(pins).padStart(3)}/${rows.length}`,
      );
    }
    console.log('');
  }
}
