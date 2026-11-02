// The difficulty curve, as a test. This file owns "is the game fair and does the
// arm choice matter". BALANCE.md explains the intent; do not fix a failure here by
// editing these numbers — change the constants in src/sim and make them true.
//
// Seeds are fixed and a majority must pass, so tuning that only works on one seed
// does not pass here.
import test from 'node:test';
import assert from 'node:assert/strict';

import { OPPONENTS } from '../src/sim/opponents.js';
import { play, winRate } from '../tools/balance.mjs';
import { idle, mash, pumper } from '../tools/bots.mjs';

const SEEDS = [11, 29, 43, 61, 77];
const LIGHT = 's4';
const HEAVY = 's1';
const EVEN = 's3';
const ALL_ARMS = ['s1', 's2', 's3', 's4', 'p1', 'p2', 'p3', 'p4'];

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function assertWins(arm, round, maxSeconds, label) {
  const r = winRate(arm, round, pumper(), SEEDS);
  assert.ok(
    r.wins >= 4,
    `${label}: ${arm} vs ${OPPONENTS[round].name} won only ${r.wins}/5 (${r.runs.map((x) => x.reason).join(', ')})`,
  );
  const secs = median(r.runs.filter((x) => x.won).map((x) => x.secs));
  assert.ok(secs <= maxSeconds, `${label}: median win took ${secs.toFixed(1)}s, wanted <= ${maxSeconds}s`);
  return r;
}

function assertLoses(arm, round, label) {
  const r = winRate(arm, round, pumper(), SEEDS);
  assert.ok(r.wins === 0, `${label}: ${arm} vs ${OPPONENTS[round].name} won ${r.wins}/5, should not be winnable`);
}

test('round 1 teaches the tell and rewards reading it', () => {
  assertWins(LIGHT, 0, 25, 'round 1 light');
  assertWins(HEAVY, 0, 25, 'round 1 heavy');
});

test('round 2 is won by reading the real push', () => {
  assertWins(LIGHT, 1, 40, 'round 2 light');
  assertWins(HEAVY, 1, 40, 'round 2 heavy');
});

test('round 3 is won against the spikes', () => {
  assertWins(LIGHT, 2, 40, 'round 3 light');
  assertWins(HEAVY, 2, 40, 'round 3 heavy');
});

test('round 4 needs muscle: the light arm cannot move a whale', () => {
  assertLoses(LIGHT, 3, 'round 4 light');
  assertWins(HEAVY, 3, 60, 'round 4 heavy');
});

test('round 5 needs muscle and a good read: the light arm loses the final', () => {
  assertLoses(LIGHT, 4, 'round 5 light');
  assertWins(HEAVY, 4, 70, 'round 5 heavy');
});

test('mashing loses every round', () => {
  for (let round = 0; round < OPPONENTS.length; round++) {
    const r = winRate(EVEN, round, mash(), SEEDS);
    assert.ok(r.wins <= 1, `mashing beat ${OPPONENTS[round].name} ${r.wins}/5`);
  }
});

test('doing nothing is losing, not stalling', () => {
  for (let round = 0; round < OPPONENTS.length; round++) {
    const r = winRate(EVEN, round, idle(), SEEDS);
    assert.equal(r.wins, 0, `idling beat ${OPPONENTS[round].name}`);
    for (const run of r.runs) {
      assert.equal(run.reason, 'pin', `idling vs ${OPPONENTS[round].name} ended in ${run.reason}, not a pin`);
      assert.ok(run.secs <= 45, `idling vs ${OPPONENTS[round].name} took ${run.secs.toFixed(0)}s to lose`);
    }
  }
});

test('no arm is useless: each of the eight wins somewhere', () => {
  const useless = [];
  for (const arm of ALL_ARMS) {
    const any = OPPONENTS.some((_, round) => winRate(arm, round, pumper(), SEEDS).wins >= 3);
    if (!any) useless.push(arm);
  }
  assert.deepEqual(useless, [], 'these arms cannot win any round');
});

test('a grip resolves at a playable length, not in one frame', () => {
  const quick = winRate(HEAVY, 0, pumper(), SEEDS);
  const fastest = Math.min(...quick.runs.map((r) => r.secs));
  assert.ok(fastest >= 5, `a round ended in ${fastest.toFixed(1)}s; too fast to feel like a grip`);
});
