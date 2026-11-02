// The tournament layer: which arm you bring, and what it cost you last time.
// Fatigue is carried per arm, and rest is the only cure. This is the whole
// strategy of the game, so it lives in its own pure module.

import { ARMS, armById } from './arms.js';
import { OPPONENTS } from './opponents.js';

export const REST_PER_ROUND = 0.22; // fraction of depletion an unused arm shakes off

export function createTournament() {
  return {
    round: 0,
    arms: ARMS.map((a) => ({ id: a.id, fatigue: 0 })),
    record: [],
    state: 'bracket', // 'bracket' | 'champion' | 'out'
  };
}

export function armState(t, id) {
  const s = t.arms.find((a) => a.id === id);
  if (!s) throw new Error(`unknown arm: ${id}`);
  return s;
}

export function availableArms(t) {
  return ARMS.map((arm) => ({
    arm,
    fatigue: armState(t, arm.id).fatigue,
    stamina: startingStamina(t, arm),
    staminaMax: arm.staminaMax,
  }));
}

export function startingStamina(t, arm) {
  return Math.round(arm.staminaMax * (1 - armState(t, arm.id).fatigue));
}

export function currentOpponent(t) {
  const opp = OPPONENTS[t.round];
  if (!opp) throw new Error(`no opponent at round ${t.round}`);
  return opp;
}

/**
 * Close out a round. `staminaLeftRatio` is how much the used arm still had, which
 * is exactly how little it is tired by. Every other arm gets some rest back.
 */
export function finishRound(t, { armId, staminaLeftRatio, won }) {
  const used = armState(t, armId);
  used.fatigue = Math.min(1, Math.max(0, 1 - staminaLeftRatio));
  for (const s of t.arms) {
    if (s.id !== armId) s.fatigue = Math.max(0, s.fatigue - REST_PER_ROUND);
  }
  t.record.push({ round: t.round + 1, armId, won });
  if (!won) {
    t.state = 'out';
    return t;
  }
  t.round += 1;
  t.state = t.round >= OPPONENTS.length ? 'champion' : 'bracket';
  return t;
}

export function armByIdExport(id) {
  return armById(id);
}
