// The bracket. Each opponent is a pattern, not a stat wall: the bracket teaches
// press-on-the-tell, read-the-real-tell, brace-the-spike, win-on-points, pick-the-arm.
//
// strength     torque multiplier
// staminaMax   their fuel. They spend it on every push, like you do.
// drainRate    stamina per second at full push
// period       seconds per push cycle
// pattern      'wave' | 'spike' | 'grind' | 'feint' — see opponentSignal()
export const OPPONENTS = [
  {
    id: 'carcinus', name: 'Carcinus', species: 'shore crab', round: 1,
    title: 'Harbour champion, eleven years running',
    teaches: 'Press when the light peaks.',
    strength: 0.92, staminaMax: 70, drainRate: 9, period: 2.6, pattern: 'wave',
  },
  {
    id: 'tula', name: 'Tula', species: 'cuttlefish', round: 2,
    title: 'She talks a lot before the grip',
    teaches: 'Only one of those pushes is real.',
    strength: 1.02, staminaMax: 104, drainRate: 10, period: 2.2, pattern: 'feint',
  },
  {
    id: 'rav', name: 'Rav', species: 'mantis shrimp', round: 3,
    title: 'Corked three portholes on the way here',
    teaches: 'Brace the spike, then take what comes back. He tires.',
    strength: 0.96, staminaMax: 78, drainRate: 15, period: 1.9, pattern: 'spike',
  },
  {
    id: 'bruno', name: 'Bruno', species: 'sperm whale calf', round: 4,
    title: 'Still growing into it',
    teaches: 'No flash, and he will not gas out. Bring muscle.',
    strength: 1.1, staminaMax: 220, drainRate: 5, period: 3.4, pattern: 'grind',
  },
  {
    id: 'ota', name: 'Ota', species: 'deep-sea isopod, defending champion', round: 5,
    title: 'Has never lost a grip in nine seasons',
    teaches: 'Read the feint and bring the heavy arm.',
    strength: 1.3, staminaMax: 160, drainRate: 8, period: 2.1, pattern: 'feint',
  },
];

export function opponentByIndex(i) {
  const opp = OPPONENTS[i];
  if (!opp) throw new Error(`no opponent at index ${i}`);
  return opp;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A push signal is pure data: the sim reads `push` for torque, the stage draws
// `tell` (light shafts, body tension, the table glow). `tell` is also what the
// player may press on — see pressQuality(). It is deliberately the same number
// the eye sees, so reading the arena is the skill.
export function opponentSignal(opp, t) {
  const phase = (t / opp.period) % 1;

  if (opp.pattern === 'wave') {
    const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase - 0.25));
    return { push: 0.35 + 0.7 * s, tell: s, phase };
  }

  if (opp.pattern === 'spike') {
    const g = Math.exp(-((phase - 0.5) ** 2) / 0.008);
    return { push: 0.3 + 0.95 * g, tell: clamp01(g), phase };
  }

  if (opp.pattern === 'grind') {
    // Bruno never spikes. His tell is a slow breath, easy to miss if you are
    // watching his hand instead of his body.
    const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase - 0.25));
    return { push: clamp01(0.62 + 0.18 * s), tell: clamp01(0.1 + 0.82 * s), phase };
  }

  if (opp.pattern === 'feint') {
    const half = Math.floor(phase * 2);
    const local = (phase * 2) % 1;
    const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (local - 0.25));
    const real = half % 2 === 0;
    return {
      push: 0.3 + 0.28 * s + (real ? 0.5 * s : 0),
      tell: real ? s : 0.35 * s,
      phase,
    };
  }

  throw new Error(`unknown pattern: ${opp.pattern}`);
}

// Pressing as the opponent commits is the biggest number in the game: up to 1.75x.
// Pressing out of time is worse than not pressing, because pulling when they are
// committed the other way breaks your own frame. That asymmetry is the whole sport.
export function pressQuality(tell) {
  const t = clamp01((tell - 0.45) / 0.4);
  return 1 + 0.75 * (t * t * (3 - 2 * t));
}

export const GOOD_PRESS_AT = 1.2; // below this a press is out of time
