// Bots stand in for players. Same shape everywhere: (match) => (t) => input.
// `pumper` is the reference player because it is what a thumb does on a phone:
// hold while the tell is bright, release when it is not.

export const idle = () => (m) => () => ({ pressEdge: false, brace: false });

export const mash = (rate = 0.09) => (m) => {
  let acc = 0;
  return () => {
    acc += 1 / 60;
    if (acc >= rate) {
      acc = 0;
      return { pressEdge: true, brace: false };
    }
    return { pressEdge: false, brace: false };
  };
};

export const pumper = (armThreshold = 0.62) => (m) => () => ({
  pressEdge: m.opp.tell > armThreshold,
  brace: false,
});

// Skilled and thoughtful: pumps in the tell, braces when it is being crushed.
export const thinking = (armThreshold = 0.62) => (m) => {
  let braceT = 0;
  return () => {
    const low = m.angle < 0.1;
    const heavy = m.opp.push > 0.85;
    const fresh = m.you.stamina > m.arm.staminaMax * 0.5;
    const brace = heavy && low && fresh && braceT < 0.5;
    if (brace) braceT += 1 / 60;
    else braceT = 0;
    return { pressEdge: m.opp.tell > armThreshold, brace };
  };
};
