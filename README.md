# Tentaclash

An octopus enters the Deep Championship arm-wrestling tournament. One arm wrestles
each round; seven rest and stay tired.

**Play it:** <https://tentaclash.vivid.fish>

## The game in one paragraph

You read your opponent's body. Every opponent builds toward a push and shows it —
the arena itself brightens as the tell rises, because the tell is not a HUD gauge,
it is the room. Press while it is up and you get up to a 1.75× counter. Press out
of time and you lose ground. Mashing loses to everything; reading wins. Between
rounds you pick which of your eight arms takes the grip: light arms are quick and
almost never tire but cannot move the two champions, heavy arms win big grips and
arrive wrecked at the next round.

Round 1 is a shore crab. Round 5 is a giant isopod the size of a dog.

## How it is built

Three layers, with a hard boundary between the last two:

| Layer | What it is |
|---|---|
| `src/sim/` | Pure deterministic rules. No three.js, no DOM, fixed timestep, seeded RNG. This is what the tests run. |
| `src/stage/` | three.js. Consumes one plain `view` object; it is not allowed to import the sim. |
| `src/ui/`, `src/input/`, `src/audio/` | HUD, two thumb zones, sound. |

`src/stage/CONTRACT.md` is the interface between rules and pixels. It exists so the
game can be tested without a browser and the visuals can be rebuilt without touching
the rules.

Input has two boolean channels and no "press event": the pump period lives in the
rules, so holding a thumb and tapping it arrive identically. That parity is what
makes the game fair on a phone.

## Run it

```sh
npm install
./test.sh        # rules tests, difficulty matrix, build, then a real browser
./build.sh       # bundles three.js and inlines every asset into dist/index.html
```

`dist/index.html` is a single self-contained file: no external requests, no CDN,
no runtime asset fetches. That is what the container serves, so it is **committed to
the repo on purpose**: the deploy is `FROM nginx:alpine` plus a `COPY` of that one
file, with no build step on the server. Rebuild and commit it with any source
change, or the deploy serves the old game.

Other useful commands:

```sh
node tools/balance.mjs s1     # win rates, round times, counters, fuel per arm
node test/render.mjs          # Chromium: desktop + mobile, screenshots in artifacts/
node tools/shots.mjs          # screenshots plus draw-call and frame counters
```

## Design and balance

- `DESIGN.md` — the design, written before any code, and what it survived.
- `BALANCE.md` — the acceptance matrix the rules must hit, and the measured numbers.
- `assets/PROVENANCE.md` — which generated assets exist and how they were made.

## Deploy

Dockerfile + nginx on Coolify, following the same pattern as the other Vivid Fish
games: GitHub push → auto-deploy → `tentaclash.vivid.fish`.
