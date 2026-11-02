// Rules *structure*: what must be true whatever the numbers are.
// Anything that depends on tuning lives in test/balance.test.mjs instead, so
// there is one place that owns the difficulty curve.
// Run: node --test test/sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { ARMS, armById } from '../src/sim/arms.js';
import { OPPONENTS, opponentSignal, pressQuality, GOOD_PRESS_AT } from '../src/sim/opponents.js';
import {
  createMatch, stepMatch, readView,
  PIN_ANGLE, SELF_PIN_ANGLE, PIN_HOLD_SECONDS, PRESS_COOLDOWN, MAX_FALSE_STARTS,
} from '../src/sim/match.js';
import {
  createTournament, finishRound, startingStamina, availableArms, REST_PER_ROUND,
} from '../src/sim/tournament.js';

const DT = 1 / 60;

test('the roster is well formed', () => {
  assert.equal(OPPONENTS.length, 5);
  assert.equal(ARMS.length, 8);
  assert.equal(new Set(ARMS.map((a) => a.id)).size, 8);
  assert.deepEqual(ARMS.map((a) => a.reach), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const opp of OPPONENTS) {
    for (let t = 0; t < opp.period * 3; t += 0.01) {
      const s = opponentSignal(opp, t);
      assert.ok(s.push >= 0 && s.push <= 1.35, `${opp.id}: push out of range`);
      assert.ok(s.tell >= 0 && s.tell <= 1, `${opp.id}: tell out of range`);
    }
    // Every opponent must be readable: some moment where the tell says "now".
    let maxTell = 0;
    for (let t = 0; t < opp.period * 2; t += 0.005) maxTell = Math.max(maxTell, opponentSignal(opp, t).tell);
    assert.ok(pressQuality(maxTell) >= GOOD_PRESS_AT, `${opp.id}: must have a pressable window`);
  }
});

test('press quality only pays off on the tell', () => {
  assert.equal(pressQuality(0), 1);
  assert.equal(pressQuality(0.45), 1);
  assert.equal(pressQuality(1), 1.75);
  assert.ok(pressQuality(0.8) > GOOD_PRESS_AT);
  assert.ok(pressQuality(0.5) < GOOD_PRESS_AT);
  for (let t = 0.4; t < 1.4; t += 0.01) assert.ok(pressQuality(t) <= 1.75);
});

test('the same seed and the same inputs give the same match', () => {
  const build = () => createMatch({ arm: armById('s3'), opponent: OPPONENTS[0], seed: 42 });
  const drive = (m) => {
    let armed = true;
    for (let t = 0; t < 20 && m.phase !== 'over'; t += DT) {
      const press = m.opp.tell > 0.6 && armed;
      armed = !press;
      stepMatch(m, { pressEdge: press, brace: false }, DT);
    }
    return m;
  };
  const a = drive(build()), b = drive(build());
  assert.equal(a.winner, b.winner);
  assert.equal(a.reason, b.reason);
  assert.equal(a.angle.toFixed(9), b.angle.toFixed(9));
  assert.equal(a.you.counters, b.you.counters);
});

test('a backgrounded tab cannot fast-forward the grip', () => {
  const m = createMatch({ arm: armById('s1'), opponent: OPPONENTS[4], seed: 7 });
  m.phase = 'fighting';
  const before = m.angle;
  for (let i = 0; i < 4; i++) stepMatch(m, { pressEdge: true, brace: false }, 30);
  assert.ok(Math.abs(m.angle - before) < 0.35, 'huge dt must be clamped, not integrated');
  assert.ok(m.angle >= SELF_PIN_ANGLE && m.angle <= PIN_ANGLE);
});

test('the angle never leaves the two pads', () => {
  const m = createMatch({ arm: armById('s1'), opponent: OPPONENTS[0], seed: 3 });
  m.phase = 'fighting';
  for (let t = 0; t < 60; t += DT) {
    stepMatch(m, { pressEdge: Math.sin(t * 9) > 0, brace: Math.sin(t * 2) > 0.7 }, DT);
    assert.ok(m.angle <= PIN_ANGLE && m.angle >= SELF_PIN_ANGLE, `angle escaped at t=${t}`);
  }
});

test('a new press after the referee calls set is a false start, and twice is a loss', () => {
  const m = createMatch({ arm: armById('s1'), opponent: OPPONENTS[0], seed: 11 });
  const ev = [];
  // Two deliberate taps inside the window after the call, with the thumb off between
  // them. Holding the button through the set is covered by its own test below.
  for (let t = 0; m.phase === 'set'; t += DT) {
    const tap1 = t > m.setCallAt + 0.05 && t < m.setCallAt + 0.11;
    const tap2 = t > m.setCallAt + 0.25 && t < m.setCallAt + 0.31;
    ev.push(...stepMatch(m, { pressEdge: tap1 || tap2, brace: false }, DT));
  }
  assert.deepEqual(ev.filter((e) => e.type === 'false_start').map((e) => e.n), [1, 2]);
  assert.equal(m.you.falseStarts, MAX_FALSE_STARTS);
  assert.equal(m.winner, 'opponent');
  assert.equal(m.reason, 'two false starts');
});

test('the first press after Go is free', () => {
  const m = createMatch({ arm: armById('s1'), opponent: OPPONENTS[0], seed: 12 });
  let events = [];
  for (let t = 0; m.phase === 'set'; t += DT) events = events.concat(stepMatch(m, { pressEdge: false, brace: false }, DT));
  assert.ok(events.some((e) => e.type === 'go'));
  assert.equal(m.you.falseStarts, 0);
  const ev = stepMatch(m, { pressEdge: true, brace: false }, DT);
  assert.ok(!ev.some((e) => e.type === 'false_start'));
});

test('touching the pad is not a pin; holding it is', () => {
  // A perfectly timed player against an opponent who cannot push back. The point is
  // the hold rule, so measure from the moment the hand reaches the pad.
  const still = { ...OPPONENTS[0], strength: 0 };
  const m = createMatch({ arm: armById('s1'), opponent: still, seed: 9 });
  m.phase = 'fighting';

  let contactFrame = -1;
  let frame = 0;
  for (; frame < 900 && m.phase !== 'over'; frame += 1) {
    if (contactFrame < 0 && m.angle >= PIN_ANGLE - 1e-6) contactFrame = frame;
    stepMatch(m, { pressEdge: m.opp.tell > 0.9, brace: false }, DT);
  }
  assert.ok(contactFrame >= 0, 'the hand never reached the pad');
  assert.equal(m.reason, 'pin');
  // Two frames of tolerance: contact is detected before the step that registers it.
  const heldFor = (frame - contactFrame) * DT;
  assert.ok(heldFor >= PIN_HOLD_SECONDS - 2 * DT, `pinned after holding only ${heldFor.toFixed(3)}s, expected ~${PIN_HOLD_SECONDS}s`);
  assert.ok(heldFor < PIN_HOLD_SECONDS + 0.2, `pinned ${heldFor.toFixed(3)}s after contact; the hold is not what ended it`);

  // A graze: reach the pad, then let go before the hold completes.
  const puller = { ...OPPONENTS[4], strength: 3 };
  const g = createMatch({ arm: armById('s1'), opponent: puller, seed: 8 });
  g.phase = 'fighting';
  g.angle = PIN_ANGLE;
  g.angleVel = 0;
  for (let i = 0; i < Math.floor((PIN_HOLD_SECONDS - 0.08) / DT); i++) {
    stepMatch(g, { pressEdge: false, brace: false }, DT);
  }
  assert.notEqual(g.phase, 'over', 'a short touch must not end the grip');
});

test('a thumb resting on Press is not a false start; tapping early is', () => {
  // The phone posture: the thumb is already on the button when the referee sets.
  const m = createMatch({ arm: armById('s3'), opponent: OPPONENTS[0], seed: 4 });
  for (let t = 0; m.phase === 'set'; t += DT) stepMatch(m, { pressEdge: true, brace: false }, DT);
  assert.equal(m.phase, 'fighting', 'holding through the set lost the grip before it began');
  assert.equal(m.you.falseStarts, 0);

  // The same match, but the player taps again after the referee says set: that is
  // stealing the whistle, and two of those lose the grip.
  const g = createMatch({ arm: armById('s3'), opponent: OPPONENTS[0], seed: 4 });
  const events = [];
  for (let t = 0; g.phase === 'set' && t < g.goAt; t += DT) {
    const holdEarly = t < g.setCallAt - 0.1; // held, but before the call: not a jump
    const tap1 = t > g.setCallAt + 0.05 && t < g.setCallAt + 0.11;
    const tap2 = t > g.setCallAt + 0.25 && t < g.setCallAt + 0.31;
    events.push(...stepMatch(g, { pressEdge: holdEarly || tap1 || tap2, brace: false }, DT));
  }
  assert.ok(events.some((e) => e.type === 'set'), 'the referee must call set before the whistle');
  assert.equal(g.you.falseStarts, 2, 'each new press after "set" is one false start');
  assert.equal(g.reason, 'two false starts');
});

test('a pump has a real period, so mashing cannot exceed it', () => {
  const m = createMatch({ arm: armById('s3'), opponent: OPPONENTS[0], seed: 13 });
  m.phase = 'fighting';
  m.opp.tell = 1; // pretend the tell is perfect, to count pure press rate
  let accepted = 0;
  for (let t = 0; t < 3; t += DT) {
    const before = m.you.presses;
    stepMatch(m, { pressEdge: true, brace: false }, DT);
    if (m.you.presses > before) accepted += 1;
  }
  assert.ok(accepted <= Math.ceil(3 / PRESS_COOLDOWN), `${accepted} pumps in 3s exceeds the pump period`);
  assert.ok(accepted >= 3 / PRESS_COOLDOWN - 2, 'the pump period must not be absurdly slow');
});

test('holding Press is never worse than tapping it', () => {
  // This is what makes the game fair on a phone: a thumb that stays down gets the
  // same result as one that taps as fast as it can.
  const run = (hold) => {
    const m = createMatch({ arm: armById('s3'), opponent: OPPONENTS[1], seed: 17 });
    let tap = 0;
    for (let t = 0; t < 25 && m.phase !== 'over'; t += DT) {
      const pressEdge = hold ? m.opp.tell > 0.62 : m.opp.tell > 0.62 && tap++ % 2 === 0;
      stepMatch(m, { pressEdge, brace: false }, DT);
    }
    return m;
  };
  const held = run(true), tapped = run(false);
  assert.equal(held.you.counters, tapped.you.counters, 'same number of pumps');
  assert.ok(Math.abs(held.angle - tapped.angle) < 1e-9, 'same grip');
});

test('fatigue is carried per arm and rest is the only cure', () => {
  const t = createTournament();
  const used = armById('s1');
  const rested = armById('s4');

  // Spending 80% of an arm leaves it able to start the next round with 20%.
  finishRound(t, { armId: used.id, staminaLeftRatio: 0.2, won: true });
  assert.equal(startingStamina(t, used), Math.round(used.staminaMax * 0.2));
  assert.equal(startingStamina(t, rested), rested.staminaMax);

  // A round of rest takes a fixed slice of that back off arms that did not wrestle.
  finishRound(t, { armId: rested.id, staminaLeftRatio: 1, won: true });
  const after = availableArms(t).find((a) => a.arm.id === used.id).fatigue;
  assert.ok(Math.abs(after - (0.8 - REST_PER_ROUND)) < 1e-9, 'unused arms shake off fatigue');
});

test('the bracket closes out and a loss ends it', () => {
  const t = createTournament();
  finishRound(t, { armId: 's3', staminaLeftRatio: 0.5, won: true });
  assert.equal(t.round, 1);
  assert.equal(t.state, 'bracket');
  for (let i = 1; i < OPPONENTS.length; i++) finishRound(t, { armId: 's3', staminaLeftRatio: 1, won: true });
  assert.equal(t.state, 'champion');

  const lost = createTournament();
  finishRound(lost, { armId: 's3', staminaLeftRatio: 0, won: false });
  assert.equal(lost.state, 'out');
  assert.equal(lost.round, 0);
});

test('a grip that runs out of time is awarded, never left open', () => {
  const m = createMatch({ arm: armById('s1'), opponent: OPPONENTS[3], seed: 51 });
  for (let t = 0; m.phase !== 'fighting'; t += DT) stepMatch(m, { pressEdge: false, brace: false }, DT);
  m.clock = 0.01; // the horn, not a contrived stalemate
  for (let t = 0; m.phase !== 'over'; t += DT) stepMatch(m, { pressEdge: false, brace: false }, DT);
  assert.equal(m.phase, 'over');
  assert.match(m.reason, /judges|draw/);
});

test('the view is plain data the stage can consume', () => {
  const m = createMatch({ arm: armById('s3'), opponent: OPPONENTS[2], seed: 61 });
  for (let t = 0; t < 6; t += DT) stepMatch(m, { pressEdge: m.opp.tell > 0.7, brace: false }, DT);
  const v = readView(m);
  assert.deepEqual(Object.keys(v).sort(), ['angle', 'clock', 'falseStarts', 'goIn', 'opp', 'phase', 'pinHold', 'reason', 'setCalled', 'winner', 'you']);
  assert.equal(JSON.stringify(v).length > 0, true);
  assert.ok(v.you.cooldown >= 0 && v.you.cooldown <= 1);
  for (const key of ['stamina', 'drive', 'boost', 'presses', 'counters']) assert.equal(typeof v.you[key], 'number');
});
