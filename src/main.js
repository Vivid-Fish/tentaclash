// The shell: it owns the loop, the tournament flow, and the one line across which
// plain state becomes pixels. It knows the rules and the stage; nothing else does.

import { createStage } from './stage/world.js';
import { createControls } from './input/controls.js';
import { createHud } from './ui/hud.js';
import { createSound } from './audio/sound.js';
import { createMatch, stepMatch, readView } from './sim/match.js';
import {
  createTournament, availableArms, currentOpponent, finishRound, startingStamina,
} from './sim/tournament.js';
import { OPPONENTS } from './sim/opponents.js';

const FIXED_DT = 1 / 60; // physics steps identically on a 60Hz laptop and a 120Hz phone
const RESOLVE_PAUSE = 1700;

const canvas = document.getElementById('stage');
const hud = createHud();
const sound = createSound();
const stage = createStage(canvas);

const controls = createControls({
  pressZone: document.getElementById('touch-right'),
  braceZone: document.getElementById('touch-left'),
  onPauseKey: () => togglePause(),
});

const app = {
  mode: 'menu', // 'menu' | 'pick' | 'match' | 'resolved' | 'paused'
  tournament: createTournament(),
  match: null,
  time: 0,
  acc: 0,
  last: 0,
  shake: 0,
  slowmo: 1,
  quality: 'high',
  fps: [],
  qualityLocked: false,
};

function resize() {
  stage.resize();
}
/** A small hook so the render gate can check the draw-call budget. */
window.__tentaclash = { stats: () => stage.stats?.() ?? null, canvas: () => [canvas.width, canvas.height] };

// Size it before the first frame: without this the canvas keeps its default
// 300x150 buffer and the whole game is a blurred upscale of that.
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

function beginRound() {
  if (app.tournament.state !== 'bracket') return endTournament();
  const opponent = currentOpponent(app.tournament);
  app.mode = 'pick';
  hud.chooseArm({ round: app.tournament.round, opponent, options: availableArms(app.tournament) })
    .then((option) => beginMatch(option.arm, opponent));
}

function beginMatch(arm, opponent) {
  app.match = createMatch({
    arm,
    opponent,
    seed: (Math.random() * 1e9) | 0,
    startStamina: startingStamina(app.tournament, arm),
  });
  app.acc = 0;
  app.slowmo = 1;
  app.shake = 0;
  app.mode = 'match';
  app.arm = arm;
  hud.hideOverlays();
  hud.startRound({ round: app.tournament.round, opponent });
  hud.call('Ready…', 900);
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'set') {
      // The referee's cadence: the player is told when a jump becomes punishable.
      hud.call('Set.', 500);
    } else if (ev.type === 'go') {
      hud.call('GO!', 700);
      sound.play('whistle', { gain: 0.8 });
    } else if (ev.type === 'false_start') {
      hud.call(ev.n === 1 ? 'False start — once more and it is lost' : 'Two false starts', 1400);
    } else if (ev.type === 'stall') {
      hud.call('Stall — the referee resets the grip', 1400);
    } else if (ev.type === 'counter') {
      app.shake = Math.max(app.shake, (ev.quality - 1.2) * 0.5);
    } else if (ev.type === 'over') {
      onResolved(ev);
    }
  }
}

function onResolved(ev) {
  app.mode = 'resolved';
  controls.releaseAll();
  const won = ev.winner === 'you';
  app.slowmo = 0.3;
  app.shake = 1;
  sound.play('pin', { gain: 0.9 });
  if (won) setTimeout(() => sound.play('cheer', { gain: 0.55 }), 260);

  const arm = app.arm;
  const opponent = app.match.opponent;
  const staminaLeft = app.match.you.stamina / arm.staminaMax;

  setTimeout(() => {
    app.slowmo = 1;
    finishRound(app.tournament, { armId: arm.id, staminaLeftRatio: staminaLeft, won });
    const used = availableArms(app.tournament).find((a) => a.arm.id === arm.id);
    const nextOpponent = OPPONENTS[app.tournament.round];
    hud.showResult({
      won,
      opponent,
      stats: {
        line: won
          ? `${arm.name} is tired — ${Math.round(100 * used.fatigue)}% spent. Rest it and pick another.`
          : `${opponent.name} said: ${opponent.teaches}`,
        detail: `${ev.reason} · ${app.match.you.counters} good presses, ${app.match.you.wasted} out of time · ${arm.name} ${Math.round(100 * (1 - used.fatigue))}% ready`,
      },
      nextLabel: app.tournament.state === 'champion' ? 'Lift the shell'
        : app.tournament.state === 'out' ? 'Try the tournament again'
        : `Next: ${nextOpponent.name}`,
      onNext: () => {
        if (app.tournament.state === 'out') {
          app.tournament = createTournament();
        }
        beginRound();
      },
    });
    app.mode = 'pick';
    app.match = null;
  }, RESOLVE_PAUSE);
}

function endTournament() {
  const champion = app.tournament.state === 'champion';
  hud.showResult({
    won: champion,
    opponent: { name: 'the reef', teaches: '' },
    stats: {
      line: champion
        ? 'The Deep Championship goes to an octopus who argued he only needed one arm.'
        : 'Somewhere in the crowd, a crab is not surprised at all.',
      detail: `Rounds won: ${app.tournament.record.filter((r) => r.won).length} of ${OPPONENTS.length}`,
    },
    nextLabel: 'Again',
    onNext: () => { app.tournament = createTournament(); beginRound(); },
  });
  if (champion) sound.play('cheer', { gain: 0.7 });
  app.mode = 'pick';
}

function togglePause() {
  if (app.mode === 'match') { app.mode = 'paused'; hud.call('Paused — press P', 1500); }
  else if (app.mode === 'paused') { app.mode = 'match'; }
}

/** Plain data for the stage. The stage may not import the sim, so it arrives here. */
function buildView() {
  const view = app.match ? readView(app.match) : {
    phase: 'menu', angle: 0, clock: 0, goIn: 0, falseStarts: 0, pinHold: 0, winner: null, reason: null,
    you: { stamina: 1, drive: 0, boost: 1, brace: false, cooldown: 0, lastPressT: 0, lastPressQuality: 1, presses: 0, counters: 0, wasted: 0 },
    opp: { name: '', species: '', stamina: 1, push: 0, tell: 0, phase: 0 },
  };
  const opponent = app.match?.opponent || OPPONENTS[Math.min(app.tournament.round, OPPONENTS.length - 1)];
  return Object.assign(view, {
    time: app.time,
    round: app.tournament.round,
    opponentId: opponent.id,
    opponentSpec: opponent.pattern,
    armReach: app.arm?.reach ?? 0,
    screenShake: app.shake,
    slowmo: app.slowmo,
  });
}

/** A phone that cannot hold 45fps gets the low tier once, not repeatedly. */
function watchPerformance(dt) {
  if (app.qualityLocked || app.time < 3) return;
  app.fps.push(1 / Math.max(dt, 1e-4));
  if (app.fps.length < 90) return;
  const avg = app.fps.reduce((a, b) => a + b, 0) / app.fps.length;
  if (avg < 45) {
    stage.setQuality?.('low');
    app.quality = 'low';
    app.qualityLocked = true;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = app.last ? Math.min(0.05, (now - app.last) / 1000) : 0;
  app.last = now;
  app.time += dt;
  app.shake = Math.max(0, app.shake - dt * 1.8);
  watchPerformance(dt);

  if (app.mode === 'match' && app.match && app.match.phase !== 'over') {
    const input = controls.read();
    app.acc += dt;
    let events = [];
    while (app.acc >= FIXED_DT) {
      events = events.concat(stepMatch(app.match, { pressEdge: input.pressHeld, brace: input.braceHeld }, FIXED_DT));
      app.acc -= FIXED_DT;
    }
    if (events.length) handleEvents(events);
    hud.update(readView(app.match));
  }

  stage.render(buildView(), dt * (app.mode === 'resolved' ? app.slowmo : 1));
}

document.getElementById('start').addEventListener('click', async () => {
  hud.hideOverlays();
  await sound.start();
  beginRound();
});

hud.showMenu();
requestAnimationFrame(frame);
