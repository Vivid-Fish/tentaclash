// Balance report: how does each bot do against each opponent?
// This is the tuning oracle for the rules. Run: node tools/balance.mjs [armId]
import { armById } from '../src/sim/arms.js';
import { OPPONENTS } from '../src/sim/opponents.js';
import { createMatch, stepMatch, ROUND_SECONDS } from '../src/sim/match.js';
import { idle, mash, pumper, thinking } from './bots.mjs';

export const BOTS = { idle: idle(), mash: mash(), pumper: pumper(), thinking: thinking() };

/** Play one match to the end. Returns the facts the acceptance matrix cares about. */
export function play(armId, oppIndex, makeBot, seed = 1, startStamina) {
  const arm = armById(armId);
  const m = createMatch({ arm, opponent: OPPONENTS[oppIndex], seed, startStamina });
  const bot = makeBot(m);
  for (let t = 0; t < ROUND_SECONDS + 2 && m.phase !== 'over'; t += 1 / 60) {
    // A player who mashes during the set has already been warned twice.
    const input = m.phase === 'fighting' ? bot(t) : { pressEdge: false, brace: false };
    stepMatch(m, input, 1 / 60);
  }
  return {
    won: m.winner === 'you',
    secs: Math.max(0, m.t - m.goAt),
    counters: m.you.counters,
    wasted: m.you.wasted,
    youFuel: m.you.stamina / arm.staminaMax,
    oppFuel: m.opp.stamina / m.opponent.staminaMax,
    reason: m.reason,
  };
}

export function winRate(armId, oppIndex, makeBot, seeds = [1, 2, 3, 4, 5]) {
  const runs = seeds.map((s) => play(armId, oppIndex, makeBot, s * 97 + oppIndex));
  return {
    wins: runs.filter((r) => r.won).length,
    runs,
    avg: (k) => runs.reduce((s, r) => s + r[k], 0) / runs.length,
  };
}

if (process.argv[1]?.endsWith('balance.mjs')) {
  const arm = process.argv[2] || 's3';
  const a = armById(arm);
  console.log(`arm=${arm} strength=${a.strength} stamina=${a.staminaMax} cost=${a.pressCost}\n`);
  console.log('opp        bot        wins   secs  counters wasted youFuel oppFuel  reason');
  for (let i = 0; i < OPPONENTS.length; i++) {
    for (const [name, makeBot] of Object.entries(BOTS)) {
      const r = winRate(arm, i, makeBot);
      console.log(
        `${OPPONENTS[i].name.padEnd(10)} ${name.padEnd(10)} ${r.wins}/5  ${r.avg('secs').toFixed(1).padStart(6)}  ` +
        `${r.avg('counters').toFixed(1).padStart(7)} ${r.avg('wasted').toFixed(1).padStart(7)} ` +
        `${(100 * r.avg('youFuel')).toFixed(0).padStart(6)} ${(100 * r.avg('oppFuel')).toFixed(0).padStart(6)}  ${r.runs[0].reason}`,
      );
    }
    console.log('');
  }
}
