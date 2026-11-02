// Input timing budget: how much precision do the rules ask of a thumb, and what
// does a laggy device cost?
//
// tools/balance.mjs assumes a perfect player and tools/drama.mjs looks at the
// shape of a grip. This asks the device question: how wide is the window in which
// a press counts, in milliseconds, and does a 30 fps screen or a 90 ms touch
// pipeline cost a player the round? It matters because the phone is the target,
// and a touch-to-pixels delay of 60-120 ms is normal there.
//
//   node tools/input-window.mjs
import { OPPONENTS, opponentSignal, pressQuality, GOOD_PRESS_AT } from '../src/sim/opponents.js';
import { armById } from '../src/sim/arms.js';
import { createMatch, stepMatch, ROUND_SECONDS } from '../src/sim/match.js';

// --- 1. how wide is the window, per opponent, in milliseconds ---
const tellAt = (opp, t) => opponentSignal(opp, t).tell;
const peakTell = (opp) => {
  let best = 0;
  for (let t = 0; t < opp.period; t += 1 / 2000) best = Math.max(best, tellAt(opp, t));
  return best;
};
function windows(opp, thr) {
  // total time per cycle above thr, and the longest single run above thr
  let total = 0, run = 0, longest = 0;
  const dt = 1 / 2000;
  for (let t = 0; t < opp.period * 3; t += dt) {
    if (tellAt(opp, t) >= thr) { total += dt; run += dt; longest = Math.max(longest, run); }
    else run = 0;
  }
  return { total: (total / 3) * 1000, longest: longest * 1000 };
}
console.log('the rules call a press a counter when quality >= ' + GOOD_PRESS_AT.toFixed(2) + ' (tell >= ~0.59)');
console.log('opp        pattern  peakTell  window(counter)  window(full 1.75x)  cycle');
for (const o of OPPONENTS) {
  const w1 = windows(o, 0.586), w2 = windows(o, 0.85);
  console.log(
    `${o.name.padEnd(10)} ${o.pattern.padEnd(8)} ${peakTell(o).toFixed(2).padStart(7)}  ` +
    `${String(Math.round(w1.longest)).padStart(9)} ms  ${String(Math.round(w2.longest)).padStart(14)} ms  ${(o.period * 1000).toFixed(0).padStart(5)} ms`,
  );
}

// --- 2. what does a sloppy press cost? offset from the best moment in the cycle ---
console.log('\nquality actually earned when the press lands this many ms off the peak:');
const offs = [-200, -120, -80, -40, 0, 40, 80, 120, 200];
console.log('opp        ' + offs.map((o) => String(o).padStart(7)).join(''));
for (const o of OPPONENTS) {
  // find the peak time inside one cycle
  let peakT = 0, best = -1;
  for (let t = 0; t < o.period; t += 1 / 4000) { const v = tellAt(o, t); if (v > best) { best = v; peakT = t; } }
  const row = offs.map((d) => pressQuality(tellAt(o, peakT + d / 1000)).toFixed(2).padStart(7));
  console.log(`${o.name.padEnd(10)} ${row.join('')}`);
}

// --- 3. what does a slower device cost? A player only sees the tell as often as
// their screen refreshes, and the image they react to is already old by the
// display pipeline. Both are modelled: read no more often than frameMs, and read
// it as it was lagMs ago.
function playWithFrame(armId, oppIndex, seed, frameMs, lagMs = 0) {
  const arm = armById(armId);
  const m = createMatch({ arm, opponent: OPPONENTS[oppIndex], seed, startStamina: arm.staminaMax });
  const hist = [];
  let press = false, lastRead = -1, seen = 0;
  for (let i = 0; i < (ROUND_SECONDS + 2) * 60 && m.phase !== 'over'; i++) {
    const t = i / 60;
    hist.push(m.opp.tell);
    if (m.phase === 'fighting') {
      if (t - lastRead >= frameMs / 1000) {
        lastRead = t;
        const back = Math.round(lagMs / (1000 / 60));
        seen = hist[Math.max(0, hist.length - 1 - back)];
      }
      press = seen > 0.62;
    } else press = false;
    stepMatch(m, { pressEdge: press, brace: false }, 1 / 60);
  }
  return { won: m.winner === 'you', counters: m.you.counters, wasted: m.you.wasted, secs: m.t - m.goAt };
}

console.log('\ncost of a slow screen or a laggy touch (arm=s3, 5 seeds each):');
console.log('opp        input path            wins  counters wasted  secs');
for (const opp of [0, 2, 3, 4]) {
  for (const [label, frame, lag] of [
    ['60fps no lag', 17, 0],
    ['30fps no lag', 33, 0],
    ['20fps no lag', 50, 0],
    ['60fps + 60ms lag', 17, 60],
    ['30fps + 90ms lag', 33, 90],
  ]) {
    const rows = [1, 2, 3, 4, 5].map((s) => playWithFrame('s3', opp, s * 97 + opp, frame, lag));
    console.log(
      `${OPPONENTS[opp].name.padEnd(10)} ${label.padEnd(21)} ${rows.filter((r) => r.won).length}/5  ` +
      `${(rows.reduce((a, r) => a + r.counters, 0) / 5).toFixed(1).padStart(8)} ${(rows.reduce((a, r) => a + r.wasted, 0) / 5).toFixed(1).padStart(7)} ${(rows.reduce((a, r) => a + r.secs, 0) / 5).toFixed(1).padStart(6)}`,
    );
  }
  console.log('');
}
