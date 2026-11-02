// The rules of a grip. No THREE, no DOM, no clock reads: stepMatch(state, input, dt)
// mutates state and returns events. It is deterministic for a given seed, which is
// what makes test/sim.test.mjs possible.
//
// Angle convention: +1 is the OPPONENT'S hand on their pad (you win),
// -1 is YOURS (you lose). One sign rule, used the same way in the stage.

import { mulberry32 } from './rng.js';
import { opponentSignal, pressQuality, GOOD_PRESS_AT } from './opponents.js';

export const PIN_ANGLE = 1;
export const SELF_PIN_ANGLE = -1;
export const ROUND_SECONDS = 75;
export const PIN_HOLD_SECONDS = 0.35;
export const MAX_FALSE_STARTS = 2;
export const STALL_SECONDS = 5;

const INERTIA = 1.2;
const DAMPING_PER_SECOND = 0.15; // fraction of angular velocity surviving 1 s
const DRIVE_DECAY = 0.55;
const BOOST_DECAY = 0.004;
export const PRESS_COOLDOWN = 0.16; // one pump takes this long; a hand cannot beat it
const BAD_PRESS_DRIVE = 0.14;  // pulling out of time loses your rhythm
const BAD_PRESS_KICK = 0.12;   // and it costs you position
const TORQUE_BASE = 0.2;       // what just leaning on the grip is worth
const TORQUE_DRIVE = 0.8;      // what a wound-up pump is worth on top
const BRACE_ABSORB = 0.45;
const BRACE_DRAIN = 9;
const IDLE_RECOVERY_DELAY = 0.35;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

// A tired arm is a weak arm, but never a dead one: floor at 70%. A gassed heavy arm
// must still out-pull a fresh light one (1.34 * 0.7 > 0.86). This is the resource
// layer of the game — it is why which arm you bring matters.
function fuel(stamina, max) {
  return 0.7 + 0.3 * clamp01(stamina / max);
}

// Opponents do not gas the way you do. A champion is hard to wear down, so "just
// outlast them" is not a strategy for every round; some rounds need muscle.
function oppFuel(stamina, max) {
  return 0.8 + 0.2 * clamp01(stamina / max);
}

export function createMatch({ arm, opponent, seed = 1, startStamina }) {
  const rng = mulberry32(seed);
  const goAt = 1.1 + rng() * 1.4;
  return {
    arm,
    opponent,
    rng,
    phase: 'set',
    t: 0,
    fightT: 0,
    goAt,
    // The referee's "set" call. A jump is only punishable after it, which is what
    // makes the rule fair instead of arbitrary.
    setCallAt: Math.max(0.35, goAt - 0.55),
    angle: 0,
    angleVel: 0,
    pinSide: 0,
    pinHold: 0,
    stallT: 0,
    clock: ROUND_SECONDS,
    winner: null,
    reason: null,
    you: {
      stamina: startStamina === undefined ? arm.staminaMax : startStamina,
      drive: 0,
      boost: 1,
      brace: false,
      presses: 0,
      counters: 0,
      wasted: 0,
      falseStarts: 0,
      pressing: false,
      lastPressT: -10,
      lastPressQuality: 1,
    },
    opp: { stamina: opponent.staminaMax, push: 0, tell: 0, phase: 0 },
  };
}

function finish(m, winner, reason, ev) {
  m.phase = 'over';
  m.winner = winner;
  m.reason = reason;
  ev.push({ type: 'over', winner, reason });
  return ev;
}

/**
 * Advance one step. `input` = { pressEdge: boolean, brace: boolean }.
 * Returns the events this step produced (possibly empty). Mutates `m`.
 */
export function stepMatch(m, input, dtRaw) {
  const dt = clamp(dtRaw || 0, 0, 0.05); // a tab that was in the background must not fast-forward the grip
  const ev = [];
  if (dt === 0 || m.phase === 'over') return ev;

  m.t += dt;

  if (m.phase === 'set') {
    // A thumb already resting on Press is the normal phone posture, so it is not a
    // jump. Only a *new* press after the referee's "set" steals the whistle.
    const jumped = input.pressEdge && !m.you.pressing && m.t >= m.setCallAt;
    m.you.pressing = Boolean(input.pressEdge);
    if (m.t >= m.setCallAt && !m.setCalled) {
      m.setCalled = true;
      ev.push({ type: 'set' });
    }
    if (jumped) {
      m.you.falseStarts += 1;
      ev.push({ type: 'false_start', n: m.you.falseStarts });
      if (m.you.falseStarts >= MAX_FALSE_STARTS) {
        return finish(m, 'opponent', 'two false starts', ev);
      }
    }
    if (m.t >= m.goAt) {
      m.phase = 'fighting';
      ev.push({ type: 'go' });
    }
    return ev;
  }

  m.fightT += dt;
  m.clock -= dt;

  const sig = opponentSignal(m.opponent, m.fightT);
  m.opp.push = sig.push;
  m.opp.tell = sig.tell;
  m.opp.phase = sig.phase;
  m.opp.peakPhase = sig.peakPhase;

  // --- you ---
  const you = m.you;
  const arm = m.arm;
  you.brace = !!input.brace;

  if (input.pressEdge) {
    if (m.t - you.lastPressT >= PRESS_COOLDOWN) {
      // `tell` is what the player sees, so timing skill is exactly the ability to
      // read the arena. Pressing out of time is a net loss, not a free extra.
      const q = pressQuality(m.opp.tell);
      you.lastPressT = m.t;
      you.presses += 1;
      you.lastPressQuality = q;
      if (q >= GOOD_PRESS_AT) {
        you.drive = Math.min(1, you.drive + arm.speed * q);
        you.boost = Math.max(you.boost, q);
        you.stamina -= arm.pressCost;
        you.counters += 1;
        ev.push({ type: 'counter', quality: q });
      } else {
        you.drive = Math.max(0, you.drive - BAD_PRESS_DRIVE);
        you.stamina -= arm.pressCost * 0.6;
        m.angleVel -= BAD_PRESS_KICK;
        you.wasted += 1;
        ev.push({ type: 'early', quality: q });
      }
    }
  }

  you.drive = Math.max(0, you.drive - DRIVE_DECAY * dt);
  you.boost = 1 + (you.boost - 1) * Math.pow(BOOST_DECAY, dt);

  if (you.brace) {
    you.stamina -= BRACE_DRAIN * dt;
  } else if (m.t - you.lastPressT > IDLE_RECOVERY_DELAY) {
    you.stamina += arm.recovery * dt;
  }
  you.stamina = clamp(you.stamina, 0, arm.staminaMax);

  // --- them: they spend fuel on every push, and recover in the trough ---
  const opp = m.opponent;
  m.opp.stamina = clamp(
    m.opp.stamina - opp.drainRate * sig.push * dt + opp.drainRate * 0.35 * (1 - sig.push) * dt,
    0,
    opp.staminaMax,
  );

  const oppTorque = opp.strength * oppFuel(m.opp.stamina, opp.staminaMax) * sig.push;
  const hold = TORQUE_BASE + TORQUE_DRIVE * you.drive;
  const selfTorque = arm.strength * fuel(you.stamina, arm.staminaMax) * hold * you.boost;
  const net = selfTorque - oppTorque * (you.brace ? BRACE_ABSORB : 1);

  m.angleVel += (net / INERTIA) * dt;
  m.angleVel *= Math.pow(DAMPING_PER_SECOND, dt);
  const next = m.angle + m.angleVel * dt;
  if (next > PIN_ANGLE || next < SELF_PIN_ANGLE) {
    m.angle = clamp(next, SELF_PIN_ANGLE, PIN_ANGLE);
    m.angleVel = 0;
  } else {
    m.angle = next;
  }

  // --- the pin must be held, not touched ---
  let side = 0;
  if (m.angle >= PIN_ANGLE - 1e-6) side = 1;
  else if (m.angle <= SELF_PIN_ANGLE + 1e-6) side = -1;

  if (side === 0) {
    m.pinSide = 0;
    m.pinHold = 0;
  } else {
    if (m.pinSide !== side) {
      m.pinSide = side;
      m.pinHold = 0;
    }
    m.pinHold += dt;
    if (m.pinHold >= PIN_HOLD_SECONDS) {
      return finish(m, side > 0 ? 'you' : 'opponent', 'pin', ev);
    }
  }

  // --- a dead grip is broken and re-centred, as a real referee would ---
  if (Math.abs(m.angleVel) < 0.05 && Math.abs(m.angle) < 0.6) {
    m.stallT += dt;
    if (m.stallT >= STALL_SECONDS) {
      m.stallT = 0;
      m.angle = 0;
      m.angleVel = 0;
      ev.push({ type: 'stall' });
    }
  } else {
    m.stallT = 0;
  }

  // --- judges award an unfinished grip to whoever is ahead ---
  if (m.clock <= 0) {
    const who = m.angle > 0.02 ? 'you' : m.angle < -0.02 ? 'opponent' : null;
    return finish(m, who || 'opponent', who ? 'judges decision' : 'draw awarded to the challenger', ev);
  }

  return ev;
}

/** Plain data for the renderer and the hud. Nothing here knows about THREE. */
export function readView(m) {
  return {
    phase: m.phase,
    angle: m.angle,
    clock: Math.max(0, m.clock),
    goIn: m.phase === 'set' ? Math.max(0, m.goAt - m.t) : 0,
    setCalled: Boolean(m.setCalled),
    falseStarts: m.you.falseStarts,
    you: {
      stamina: m.you.stamina / m.arm.staminaMax,
      drive: m.you.drive,
      boost: m.you.boost,
      brace: m.you.brace,
      cooldown: Math.max(0, 1 - (m.t - m.you.lastPressT) / 0.16),
      lastPressT: m.you.lastPressT,
      lastPressQuality: m.you.lastPressQuality,
      presses: m.you.presses,
      counters: m.you.counters,
      wasted: m.you.wasted,
    },
    opp: {
      name: m.opponent.name,
      species: m.opponent.species,
      stamina: m.opp.stamina / m.opponent.staminaMax,
      push: m.opp.push,
      tell: m.opp.tell,
      phase: m.opp.phase,
    },
    pinHold: m.pinHold,
    winner: m.winner,
    reason: m.reason,
  };
}
