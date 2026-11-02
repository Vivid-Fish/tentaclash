// The five opponents. Each is geometry, not a texture, and each telegraphs its own
// push the way the rules telegraph it (`view.opp.tell` is the same number the sim
// pays attention to, which is what makes the arena readable instead of numeric).

import * as THREE from 'three';

const C = {
  crab: 0xb0402f, crabDark: 0x6f2a20, crabShell: 0xd96a4a,
  cuttle: 0x9a7fb0, cuttleBand: 0x00d9ff, cuttlePale: 0xd9c7a8,
  mantis: 0x3f9e6a, mantisStripe: 0xf1b4be, mantisClub: 0xe0bc66,
  whale: 0x6f7f8c, whalePale: 0xa9b7c2, whaleDark: 0x404b57,
  isopod: 0x8fa3b8, isopodPlate: 0xb6cbd9, isopodDark: 0x3c4a5a,
  eye: 0x120c1c, shine: 0xf1ebd9,
};

const mat = (hex, rough = 0.6) =>
  new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.04 });

function ellipsoid(rx, ry, rz, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 6));
  g.scale(rx, ry, rz);
  return g;
}

function eyeAt(x, y, z, r = 0.05) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat(0xf3e9d2, 0.35));
  ball.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), new THREE.MeshStandardMaterial({ color: C.eye, roughness: 0.2 }));
  pupil.position.set(x, y, z + r * 0.75);
  pupil.scale.set(0.6, 1.2, 0.5);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 6, 6), new THREE.MeshBasicMaterial({ color: C.shine }));
  shine.position.set(x - r * 0.3, y + r * 0.35, z + r * 0.95);
  g.add(ball, pupil, shine);
  return g;
}

function legRow(parent, count, { x0, z0, len, spread, color, bend = 0.5 }) {
  const legs = [];
  const material = mat(color, 0.7);
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1]) {
      const t = (i + 0.5) / count;
      const pivot = new THREE.Group();
      pivot.position.set(x0 + (t - 0.5) * spread, 0, z0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, len, 6), material);
      upper.position.y = -len * 0.4;
      const knee = new THREE.Group();
      knee.position.y = -len * 0.8;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, len * 0.8, 6), material);
      lower.position.y = -len * 0.4;
      knee.add(lower);
      pivot.add(upper, knee);
      pivot.rotation.z = side * (0.5 + bend * 0.3);
      pivot.rotation.x = (t - 0.5) * 0.6;
      parent.add(pivot);
      legs.push({ pivot, knee, side, t });
    }
  }
  return { legs, material };
}

/**
 * Everything shares one cue contract: flare = how loud the tell is right now.
 * It drives emissive, not albedo: repainting a body by 35% washes a red crab to
 * cream, and an opponent you cannot recognise is an opponent you cannot read.
 */
function cueMaterials(list) {
  const bases = list.map((m) => ({ m, e: m.emissiveIntensity ?? 0 }));
  return (flare, tint = 0x00d9ff) => {
    for (const { m, e } of bases) {
      m.emissiveIntensity = e + flare * 0.22;
      if (m.emissive?.setHex) m.emissive.setHex(tint);
    }
  };
}

function eyeStalk(parent, x, y, z, r = 0.05) {
  // Crabs put their eyes on stalks; a ball on the head reads as a face, a stalk
  // with a ball on it reads as a crab.
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.16, 8), mat(0xd96a4a, 0.5));
  stalk.position.set(x, y + 0.08, z);
  parent.add(stalk);
  const g = eyeAt(x, y + 0.17, z, r);
  parent.add(g);
  return g;
}

function buildCarcinus() {
  const g = new THREE.Group();
  const shell = mat(C.crab, 0.55), rim = mat(C.crabShell, 0.5), dark = mat(C.crabDark, 0.7);
  // One mesh, scalloped rim: a real crab carapace is wider than it is tall, with a
  // serrated front edge. Separate spikes would be six more draw calls for less shape.
  const carapace = new THREE.SphereGeometry(1, 26, 16);
  {
    const p = carapace.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const front = Math.max(0, z);
      const scallop = 1 + 0.16 * Math.cos(ang * 7) * front;
      p.setXYZ(i, x * 0.66 * scallop, y * (y > 0 ? 0.3 : 0.2), z * 0.52 * scallop);
    }
    carapace.computeVertexNormals();
  }
  const body = new THREE.Mesh(carapace, shell);
  body.position.y = 0.42;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 22), rim);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = 0.4;
  brim.scale.set(1.22, 1.0, 0.95);
  g.add(body, brim);

  const claws = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.42, 8), dark);
    upper.position.set(side * 0.42, 0.36, 0.28);
    upper.rotation.set(0.9, 0, side * -0.6);
    const claw = new THREE.Group();
    const fixed = new THREE.Mesh(ellipsoid(0.16, 0.11, 0.1, 12), shell);
    const moving = new THREE.Mesh(ellipsoid(0.15, 0.09, 0.09, 12), rim);
    moving.position.set(0, 0.07, 0.05);
    claw.add(fixed, moving);
    claw.position.set(side * 0.62, 0.3, 0.52);
    g.add(upper, claw);
    claws.push({ claw, moving, side });
  }

  const { legs } = legRow(g, 3, { x0: 0, z0: 0.44, len: 0.42, spread: 0.7, color: C.crabDark, bend: 0.8 });
  eyeStalk(g, -0.17, 0.5, 0.34, 0.05);
  eyeStalk(g, 0.17, 0.5, 0.34, 0.05);

  const setFlare = cueMaterials([rim]);
  return {
    group: g,
    update(view, dt, t) {
      const flare = view.opp?.tell ?? 0;
      setFlare(flare, 0xe0bc66);
      g.rotation.z = Math.sin(t * 1.4) * 0.03;
      // The claw winds back before it drives: the tell, made physical.
      for (const c of claws) {
        c.claw.rotation.x = -flare * 0.5;
        c.moving.rotation.z = c.side * (0.12 + flare * 0.22);
      }
      legs.forEach((l, i) => { l.knee.rotation.x = Math.sin(t * 3 + i) * 0.12; });
    },
  };
}

function buildTula() {
  const g = new THREE.Group();
  const skin = mat(C.cuttle, 0.45), band = mat(C.cuttleBand, 0.4), pale = mat(C.cuttlePale, 0.5);
  const mantle = new THREE.Mesh(ellipsoid(0.34, 0.3, 0.85, 22), skin);
  mantle.position.set(0, 0.62, 0);
  const ridge = new THREE.Mesh(ellipsoid(0.06, 0.09, 0.7, 12), band);
  ridge.position.set(0, 0.86, 0);
  const finL = new THREE.Mesh(ellipsoid(0.1, 0.03, 0.62, 12), pale);
  const finR = finL.clone();
  finL.position.set(-0.34, 0.6, 0.05);
  finR.position.set(0.34, 0.6, 0.05);
  g.add(mantle, ridge, finL, finR);

  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 1.2 - Math.PI * 0.6;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.012, 0.5, 6), skin);
    m.position.set(Math.sin(a) * 0.2, 0.42, 0.78);
    m.rotation.set(1.2, 0, -a * 0.5);
    g.add(m);
    tentacles.push(m);
  }
  g.add(eyeAt(-0.2, 0.68, 0.62, 0.07), eyeAt(0.2, 0.68, 0.62, 0.07));

  const setFlare = cueMaterials([band]);
  return {
    group: g,
    update(view, dt, t) {
      const flare = view.opp?.tell ?? 0;
      // She reads the fake pushes too: the bands flash, but only the real one is bright.
      setFlare(flare, flare > 0.6 ? 0xff00ff : 0x00d9ff);
      const fin = Math.sin(t * 3.2) * 0.18;
      finL.rotation.z = 0.2 + fin;
      finR.rotation.z = -0.2 - fin;
      tentacles.forEach((m, i) => { m.rotation.x = 1.2 + Math.sin(t * 2.4 + i * 0.7) * 0.18 - flare * 0.25; });
      mantle.scale.x = 1 + flare * 0.06;
    },
  };
}

function buildRav() {
  const g = new THREE.Group();
  const body = mat(C.mantis, 0.45), stripe = mat(C.mantisStripe, 0.4), club = mat(C.mantisClub, 0.35);
  const segments = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const seg = new THREE.Mesh(ellipsoid(0.2 - t * 0.07, 0.14, 0.16, 12), i % 2 ? stripe : body);
    seg.position.set(0, 0.42 - t * 0.05, -0.1 - t * 0.55);
    g.add(seg);
    segments.push(seg);
  }
  const head = new THREE.Mesh(ellipsoid(0.2, 0.16, 0.22, 14), body);
  head.position.set(0, 0.44, 0.28);
  g.add(head);

  const clubs = [];
  for (const side of [-1, 1]) {
    const joint = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 8), body);
    upper.position.y = -0.18;
    const fist = new THREE.Mesh(ellipsoid(0.1, 0.1, 0.14, 12), club);
    fist.position.y = -0.42;
    joint.add(upper, fist);
    joint.position.set(side * 0.22, 0.5, 0.36);
    joint.rotation.set(0.5, 0, side * -0.3);
    g.add(joint);
    clubs.push({ joint, side });
  }
  g.add(eyeAt(-0.12, 0.56, 0.42, 0.05), eyeAt(0.12, 0.56, 0.42, 0.05));

  const setFlare = cueMaterials([club]);
  return {
    group: g,
    update(view, dt, t) {
      const flare = view.opp?.tell ?? 0;
      setFlare(flare, 0x00ff88);
      // Rav loads up hard, then fires. The wind-up is the whole lesson of round 3.
      for (const c of clubs) {
        c.joint.rotation.x = 0.5 - flare * 1.5;
        c.joint.rotation.z = c.side * (-0.3 - flare * 0.5);
      }
      segments.forEach((s, i) => { s.rotation.y = Math.sin(t * 2 + i * 0.5) * 0.06; });
    },
  };
}

function buildBruno() {
  const g = new THREE.Group();
  const skin = mat(C.whale, 0.65), pale = mat(C.whalePale, 0.7), dark = mat(C.whaleDark, 0.7);
  // A calf, so the head is the big square box a sperm whale actually has.
  const head = new THREE.Mesh(ellipsoid(0.5, 0.42, 0.72, 24), skin);
  head.position.set(0, 0.86, 0.1);
  const jaw = new THREE.Mesh(ellipsoid(0.28, 0.12, 0.34, 16), pale);
  jaw.position.set(0, 0.56, 0.42);
  const back = new THREE.Mesh(ellipsoid(0.42, 0.3, 0.9, 20), skin);
  back.position.set(0, 0.72, -0.75);
  const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), dark);
  ridge.position.set(0, 1.05, -0.6);
  const flukeL = new THREE.Mesh(ellipsoid(0.34, 0.04, 0.22, 12), dark);
  const flukeR = flukeL.clone();
  flukeL.position.set(-0.3, 0.6, -1.6);
  flukeR.position.set(0.3, 0.6, -1.6);
  flukeL.rotation.y = 0.5; flukeR.rotation.y = -0.5;
  g.add(head, jaw, back, ridge, flukeL, flukeR);
  g.add(eyeAt(-0.42, 0.72, 0.3, 0.055), eyeAt(0.42, 0.72, 0.3, 0.055));

  const setFlare = cueMaterials([pale]);
  return {
    group: g,
    update(view, dt, t) {
      const flare = view.opp?.tell ?? 0;
      // No flash for Bruno. His cue is a slow swell, like a real breath.
      setFlare(flare * 0.5, 0x82bce0);
      const breath = 1 + flare * 0.05 + Math.sin(t * 0.9) * 0.012;
      head.scale.set(breath, breath, 1);
      g.position.y = Math.sin(t * 0.7) * 0.03;
      flukeL.rotation.z = flukeR.rotation.z = Math.sin(t * 1.1) * 0.16;
    },
  };
}

function buildOta() {
  const g = new THREE.Group();
  const plate = mat(C.isopodPlate, 0.45), dark = mat(C.isopodDark, 0.6), mid = mat(C.isopod, 0.5);
  const plates = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const w = 0.42 - Math.abs(t - 0.35) * 0.22;
    const p = new THREE.Mesh(ellipsoid(w, 0.2, 0.16, 14), i % 2 ? plate : mid);
    p.position.set(0, 0.6 - t * 0.04, 0.5 - t * 1.1);
    p.rotation.x = -0.08 + t * 0.12;
    g.add(p);
    plates.push(p);
  }
  const head = new THREE.Mesh(ellipsoid(0.3, 0.18, 0.24, 16), plate);
  head.position.set(0, 0.58, 0.72);
  const telson = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 8), mid);
  telson.position.set(0, 0.5, -0.75);
  telson.rotation.x = Math.PI / 2;
  g.add(head, telson);

  const { legs } = legRow(g, 5, { x0: 0, z0: 0.5, len: 0.5, spread: 1.1, color: C.isopodDark, bend: 0.7 });
  g.add(eyeAt(-0.16, 0.68, 0.82, 0.05), eyeAt(0.16, 0.68, 0.82, 0.05));

  const setFlare = cueMaterials([plate]);
  return {
    group: g,
    update(view, dt, t) {
      const flare = view.opp?.tell ?? 0;
      setFlare(flare, 0xff00ff);
      // A champion keeps its shape: the plates only shift a hand's width.
      plates.forEach((p, i) => { p.rotation.x = -0.08 + (i / 5) * 0.12 - flare * 0.12; });
      legs.forEach((l, i) => { l.knee.rotation.x = Math.sin(t * 1.8 + i * 0.6) * 0.1; });
      g.position.y = Math.sin(t * 0.8) * 0.012;
    },
  };
}

const BUILDERS = {
  carcinus: buildCarcinus,
  tula: buildTula,
  rav: buildRav,
  bruno: buildBruno,
  ota: buildOta,
};

export function createOpponent(id) {
  const build = BUILDERS[id] ?? BUILDERS.carcinus;
  const rig = build();
  let t = Math.random() * 10;
  return {
    group: rig.group,
    update(view, dt) {
      t += dt;
      rig.update(view, dt, t);
    },
    dispose() {
      rig.group.traverse((o) => o.geometry?.dispose?.());
    },
  };
}
