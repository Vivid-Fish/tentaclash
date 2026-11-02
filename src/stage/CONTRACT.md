# The sim → stage contract

The stage never imports `src/sim`, and the sim never imports `three`. `main.js`
copies plain objects across this line, ~60 times a second.

Everything below is plain JSON-able data. Colours are hex numbers (`0x8b3a62`).

## What the stage is given

`createStage(canvas)` returns:

```js
{
  render(view, dt),   // draw one frame. view is read-only to the stage.
  resize(),           // on window resize / orientation change
  setQuality(level),  // 'high' | 'low'. 'low' must still look intentional.
  dispose(),
}
```

`view` is the object `readView(match)` returns in `src/sim/match.js`, plus fields
`main.js` adds:

```js
view = {
  // from readView():
  phase,            // 'set' | 'fighting' | 'over'
  angle,            // -1 you are pinned .. 0 neutral .. +1 opponent is pinned
  clock, goIn, falseStarts,
  you:  { stamina: 0..1, drive: 0..1, boost: 1..1.75, brace: bool,
          lastPressT, lastPressQuality, presses, counters },
  opp:  { name, species, stamina: 0..1, push: 0..1.3, tell: 0..1, phase: 0..1 },
  pinHold, winner, reason,

  // added by main.js:
  time,              // seconds since page start, monotonic
  round,             // 0..4
  opponentId,        // 'carcinus'|'tula'|'rav'|'bruno'|'ota' — picks the rig
  opponentSpec,      // 'wave' | 'spike' | 'grind' | 'feint' — how it pushes
  armReach,          // 0..7, which of the eight arms is competing
  screenShake,       // 0..1, decaying impulse from pins and spikes
  slowmo,            // 1 normal, <1 for the pin moment
}
```

## Who draws what

| File | Owns |
|---|---|
| `stage/world.js` | renderer, camera, fog, water/caustics, lights, particles, crowd, the table, bloom. `main.js` calls `world.render(view)`. |
| `stage/octopus.js` | the octopus: mantle, eyes, eight tentacles with suckers, colour shift under effort. `createOctopus()` returns `{ group, update(view, dt) }`. |
| `stage/opponents.js` | the five opponent rigs, chosen by `opponentId` (two of them share a push pattern, so the pattern cannot be the key). `createOpponent(id, pattern)` returns `{ group, update(view, dt) }`. |
| `stage/referee.js` | the referee eel and the start sequence. Small; leave it to `world.js` if easier. |

`angle` must be visible on screen within one frame of changing: the clasped hands sit
at the centre of the composition and rotate with it. This is the one thing a player
reads, so it is the one thing not to smooth away.

## Look

Palette (this game lives in the vivid.fish reef, same creatures as the landing page):

```
mantle 0x8b3a62   tentacle 0xc84b6e   sucker 0xff6b9d
abyss  0x0a1a2e   lime     0x00ff88   cyan   0x00d9ff   violet 0xff00ff
pupil  0x2c1b4a
```

Non-negotiables, because they are what makes it feel like the sea:

1. Fog and depth — you cannot see the far wall; light falls off.
2. Moving caustics on the table and floor.
3. Something drifting: plankton, silt, bubbles. Never still water.
4. `opp.tell` drives a visible pulse (light shafts, the opponent's body, the table rim).
   The player must be able to play by looking instead of reading a number.
5. `you.boost > 1.2` flashes the octopus's skin — an octopus changes colour when it
   is working. That is free characterisation and it teaches the counter.

## Performance

It must run at 60fps on integrated graphics, and the headless test runs it in
SwiftShader. No per-frame allocations, and `setQuality('low')` drops bloom and
instance counts without dropping the caustics or the tell.

Draw calls: the target was under 60. The build is currently at **77**, measured by
`tools/shots.mjs` (`window.__tentaclash.stats()`). The gap is known and mechanical:
the table is 9 meshes that share two materials, the grip is 6, and the referee is 6.
Merging each material group into one geometry (three merges, no behaviour change)
closes it. Nothing measured here is close to a frame budget problem on real GPUs, so
it is recorded rather than guessed at — SwiftShader frame rates are not a signal.
