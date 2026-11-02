# Tentaclash — design

An octopus enters the Deep Championship, an arm-wrestling tournament held in a coral
arena. He loves this sport. Everyone in the reef knows it, and nobody thinks an
octopus choosing to compete with one arm is strange.

## The one idea

Arm wrestling with one arm, while the other seven rest.

Each round you pick which of your eight arms competes. Strong arms hit hard and tire
fast. Light arms recover quickly and win on timing. The arm you burn out in round two
is still tired in round five. The tournament is decided as much by which arm you bring
as by how well you wrestle.

## Two inputs, one skill

Real arm wrestling has two levers. So does this.

| Input | Key | Touch | What it does |
|---|---|---|---|
| **Press** | Space / ↑ | right side tap | Drives the opponent's hand toward their pad |
| **Brace** | Shift (hold) | left side hold | Absorbs their push. Costs stamina, gives no torque |

The skill is **timing**. Every opponent pushes in a rhythm you can see — their body
tenses, the water shifts, the arena lights pulse with the push. Press as their push
lands and you counter: the biggest torque in the game. A real arm wrestler waits for
the push and takes it.

Mashing loses. Each press costs stamina, and a tired arm is a weak arm.

## Rules of a round

1. The referee eel sets the grip: "Ready…". Press before "Go!" and it is a false
   start. Two false starts is a loss. This is the real rule and it is worth teaching.
2. Push the opponent's hand to their pad. The pin must be held, not touched: 0.35 s.
3. Seventy-five seconds, then the judges award it to whoever is ahead.

## The bracket

Five opponents. Each one teaches one thing, and each one is real about its animal.

| # | Opponent | Style | What it teaches |
|---|---|---|---|
| 1 | **Carcinus**, shore crab | Slow, high torque, obvious tell | Press on the tell |
| 2 | **Tula**, cuttlefish | Feints, changes colour and rhythm | Read the real tell |
| 3 | **Rav**, mantis shrimp | Explosive spikes | Brace the spike, counter after it |
| 4 | **Bruno**, sperm whale calf | Grinds, huge stamina | Win on points, manage stamina |
| 5 | **Ota**, deep-sea isopod, champion | Mixes everything | Pick the right arm |

## Look

Under the brand palette from `vivid-fish` (this lives in the same reef):

```
mantle      #8B3A62    tentacle  #C84B6E    sucker   #FF6B9D
abyss       #0A1A2E    lime      #00FF88    cyan     #00D9FF   violet #FF00FF
pupil       #2C1B4A
```

Deep teal water, fog, light shafts from the surface, caustics moving over the table,
plankton drifting, a crowd of small creatures in a coral ring that flares when a pin
lands. Bloom on the bioluminescent tells. The octopus has visible suckers, forward
eyes with pupils and a shine, and skin that shifts colour when he is working hard —
because that is what octopuses do.

Camera sits low and close on the clasped hands, with a slow push-in on a pin and a
beat of slow motion at the moment it lands.

## Structure

```
src/sim/     rules only. No THREE. Plain objects in, plain objects out. Unit-tested.
src/stage/   THREE only. Reads a plain view state, draws it. Never touches the sim.
src/ui/      DOM hud.
src/input/   keyboard, pointer, touch.
```

`sim` is a pure function of `(state, input, dt)`. Nothing in `stage` may import
`sim`, and nothing in `sim` may import `three`. The contract between them is
`stage/CONTRACT.md`.
