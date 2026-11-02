# Acceptance matrix for the rules

`test/balance.test.mjs` asserts these. They are the design, not a wish list: a
player who reads the arena wins, a player who mashes loses, and the arm you bring
decides the late rounds. `tools/balance.mjs` is the oracle.

Two bots stand in for players:

- **`pumper`** — a skilled player: holds Press while the tell is in the good zone.
  This is exactly what a thumb on a phone does, so it is the reference player.
- **`mash`** — an unskilled player: presses as fast as possible, ignoring the tell.

## The bar

| Round | Opponent | `pumper`, fresh arm | `mash` | Light arm (`s4`) | Heavy arm (`s1`) |
|---|---|---|---|---|---|
| 1 | Carcinus | wins in ≤ 25 s | loses | fine | fine |
| 2 | Tula | wins in ≤ 40 s | loses | fine | fine |
| 3 | Rav | wins in ≤ 40 s | loses | fine | fine |
| 4 | Bruno | — | loses | **loses** | wins in ≤ 60 s |
| 5 | Ota | — | loses | **loses** | wins in ≤ 70 s |

Plus, for every round: idling loses outright by pin inside 45 s (never a draw), and
no arm is strictly dominated — each of the eight must win at least one round.
A round must not end faster than 5 s, or it never feels like a grip.

## Where the numbers sit now

Measured with `node tools/balance.mjs <arm>`, 5 fixed seeds, wins and median seconds:

| Round | light `s4` | even `s3` | heavy `s1` |
|---|---|---|---|
| Carcinus | win 15 s | win 9 s | win 7 s |
| Tula | win 29 s | win 12 s | win 8 s |
| Rav | win 21 s | win 9 s | win 6 s |
| Bruno | **loses on points** | **loses on points** | win 27 s |
| Ota | **loses on points** | win 27 s | win 14 s |

Mashing loses all five with every arm. Idling is pinned inside 9 s. On 20 unseen
seeds the light arms go 0/20 against Bruno and Ota while `s1` goes 20/20.

So the ladder reads: rounds 1–3 are about reading the arena and any arm will do,
quickly if it is heavy; round 4 cannot be won without muscle; round 5 needs muscle
*and* the feint read. Early rounds are short (7–15 s) on purpose — they are the
tutorial, not the test.

## What was traded to get here

The fatigue floor went from 0.4 to 0.7 of an arm's strength, so that a gassed heavy
arm still out-pulls a fresh light one. That weakens the between-round penalty, which
was the original lever; the arm choice still bites because fatigue sets *starting*
stamina, and a 60%-fatigued arm starts a long grip with 40% of its fuel. If the
resource layer ever feels shallow, that is the knob to revisit — together with
raising the champions' strength again rather than flattening fatigue.

## Known softness

A `thinking` bot (pumps *and* braces) takes Ota with the light arm in 2 of 5 seeds.
Bracing well is a real strategy, so this is not treated as a defect, but it means
"the light arm cannot win the final" is true for unbraced play only. The heavy arms
`s3`/`p4` win Ota only 3/5, so `s1` is the strongest arm in the final rather than
the heavy family being uniformly best.
