// Eight arms. They are not interchangeable — that choice is the game's strategy.
//
// strength    torque while wrestling. Only the heavy arms can move Bruno, who does
//             not gas out.
// staminaMax  their fuel. A heavy arm gasses in a long grip.
// pressCost   stamina per effective press. Light arms can keep pumping; heavy
//             arms win the grip early or lose it.
// recovery    stamina regained per second while not pressing
// speed       drive gained per good press (deliberately close across arms: the
//             difference between arms is power and fuel, not hand speed)
// reach       which arm it is on the body, 0..7. Drives the rig only.
export const ARMS = [
  { id: 's1', name: 'Starboard Rear',  family: 'heavy', strength: 1.34, staminaMax:  84, speed: 0.34, recovery: 4.6, pressCost: 4.2, reach: 0 },
  { id: 's2', name: 'Starboard Mid',   family: 'heavy', strength: 1.26, staminaMax:  96, speed: 0.34, recovery: 5.4, pressCost: 4.3, reach: 1 },
  { id: 's3', name: 'Starboard Front', family: 'even',  strength: 1.10, staminaMax: 114, speed: 0.32, recovery: 7.2, pressCost: 3.3, reach: 2 },
  { id: 's4', name: 'Starboard Reach', family: 'light', strength: 0.86, staminaMax: 134, speed: 0.30, recovery: 10.5, pressCost: 2.3, reach: 3 },
  { id: 'p1', name: 'Port Reach',      family: 'light', strength: 0.86, staminaMax: 128, speed: 0.30, recovery: 11.0, pressCost: 2.2, reach: 4 },
  { id: 'p2', name: 'Port Front',      family: 'even',  strength: 1.08, staminaMax: 118, speed: 0.32, recovery: 7.6, pressCost: 3.2, reach: 5 },
  { id: 'p3', name: 'Port Mid',        family: 'heavy', strength: 1.24, staminaMax:  98, speed: 0.34, recovery: 5.6, pressCost: 4.2, reach: 6 },
  { id: 'p4', name: 'Port Rear',       family: 'heavy', strength: 1.30, staminaMax:  88, speed: 0.34, recovery: 4.8, pressCost: 4.6, reach: 7 },
];

export function armById(id) {
  const arm = ARMS.find((a) => a.id === id);
  if (!arm) throw new Error(`unknown arm: ${id}`);
  return arm;
}

const POWER = ['soft', 'steady', 'strong', 'huge'];
const WIND = ['short fuse', 'average wind', 'deep wind', 'endless'];

export function armBlurb(arm) {
  const power = POWER[Math.min(3, Math.max(0, Math.floor((arm.strength - 0.85) / 0.14)))];
  const wind = WIND[Math.min(3, Math.max(0, Math.floor((arm.staminaMax - 75) / 18)))];
  return `${power} · ${wind}`;
}
