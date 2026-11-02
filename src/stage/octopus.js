// The octopus. Eight arms: seven idle and drifting, one on the table.
//
// Each arm is one merged geometry (tapered tube + sucker spheres) bent in the
// vertex shader. Nothing is rebuilt per frame, so eight arms cost the same as one
// on the CPU, which is what keeps this runnable on a phone. The bend is a function
// of distance along the arm, so the suckers follow it without extra work.

import * as THREE from 'three';

export const PALETTE = {
  mantle: 0x8b3a62,
  arm: 0xc84b6e,
  sucker: 0xff6b9d,
  pupil: 0x2c1b4a,
  shine: 0xf1ebd9,
  effort: 0xff6b9d,
};

const ARM_SEGMENTS = 26;
const ARM_ROWS = 16;
const ARM_SIDES = 8;

// Points along one arm, in arm-local space: +Z out of the body, drooping under
// gravity and curling inward. `length` scales it.
function armCurve(length, droop, curl) {
  const pts = [];
  for (let i = 0; i <= ARM_SEGMENTS; i++) {
    const t = i / ARM_SEGMENTS;
    const z = t * length;
    const y = -droop * t * t * length;
    const x = curl * Math.sin(t * Math.PI * 0.9) * length * 0.25;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function radiusAt(t) {
  // Thick at the shoulder, whip-thin at the tip: a real arm is about a tenth as
  // wide as it is long, and thin tubes read as sticks rather than limbs.
  return 0.145 * (1 - t * 0.85) + 0.019;
}

/** Tube plus suckers as a single geometry, with `along` (0..1) as an attribute. */
function buildArm(length, droop, curl) {
  const curve = new THREE.CatmullRomCurve3(armCurve(length, droop, curl));
  const tube = new THREE.TubeGeometry(curve, ARM_ROWS, 1, ARM_SIDES, false);

  // TubeGeometry stores radius 1 along the path, so scale each ring by the taper.
  // getPoint (not getPointAt) matches how TubeGeometry spaces its own rings.
  const pos = tube.attributes.position;
  const along = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const row = Math.floor(i / (ARM_SIDES + 1));
    const t = Math.min(1, row / ARM_ROWS);
    along[i] = t;
    const r = radiusAt(t);
    const centre = curve.getPoint(Math.min(1, t));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i, centre.x + (x - centre.x) * r, centre.y + (y - centre.y) * r, centre.z + (z - centre.z) * r);
  }
  tube.setAttribute('along', new THREE.BufferAttribute(along, 1));

  // Suckers: two staggered rows of small spheres hugging the arm.
  const parts = [tube];
  const suckerRows = 8;
  for (let i = 1; i <= suckerRows; i++) {
    const t = i / (suckerRows + 2);
    if (t > 0.78) continue;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const r = radiusAt(t);
    // Suckers are a detail, not the shape. Too many and an arm reads as a
    // caterpillar: small, five around, none near the tip.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + (i % 2) * 0.7;
      const sphere = new THREE.SphereGeometry(Math.max(0.008, r * 0.3), 6, 5);
      const off = side.clone().multiplyScalar(Math.cos(a) * r).add(up.clone().multiplyScalar(Math.sin(a) * r));
      const m = new THREE.Matrix4().setPosition(p.clone().add(off));
      sphere.applyMatrix4(m);
      const sp = sphere.attributes.position;
      const sa = new Float32Array(sp.count).fill(t);
      sphere.setAttribute('along', new THREE.BufferAttribute(sa, 1));
      parts.push(sphere);
    }
  }

  const merged = mergeSimple(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Minimal merge: same attribute set, no groups, no vertex colours needed.
function mergeSimple(geoms) {
  const names = ['position', 'normal', 'uv', 'along'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const arrays = geoms.map((g) => g.getAttribute(name)).filter(Boolean);
    if (!arrays.length) continue;
    const itemSize = arrays[0].itemSize;
    const total = arrays.reduce((s, a) => s + a.array.length, 0);
    const merged = new (arrays[0].array.constructor)(total);
    let o = 0;
    for (const a of arrays) { merged.set(a.array, o); o += a.array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(merged, itemSize));
  }
  // Re-index by rewriting each geometry's indices into one flat list.
  const tris = [];
  let base = 0;
  for (const g of geoms) {
    const idx = g.getIndex();
    const count = idx ? idx.count : g.getAttribute('position').count;
    for (let i = 0; i < count; i++) tris.push((idx ? idx.getX(i) : i) + base);
    base += g.getAttribute('position').count;
  }
  out.setIndex(tris);
  out.computeBoundingSphere();
  return out;
}

/**
 * One material per arm: the bend uniforms are per arm. `uBend` curls the arm,
 * `uEffort` shifts skin colour, `uGrip` stiffens the arm that is wrestling.
 */
function armMaterial(opts = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uPhase: { value: Math.random() * 6.28 },
    uBend: { value: 0 },
    uGrip: { value: 0 },
    uEffort: { value: 0 },
    uBase: { value: new THREE.Color(opts.color ?? PALETTE.arm) },
    uSuck: { value: new THREE.Color(opts.sucker ?? PALETTE.sucker) },
    uHot: { value: new THREE.Color(PALETTE.effort) },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? PALETTE.arm,
    roughness: opts.roughness ?? 0.55,
    metalness: 0.02,
    emissive: new THREE.Color(PALETTE.effort),
    emissiveIntensity: 0.0,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float along;
        uniform float uTime; uniform float uPhase; uniform float uBend;
        uniform float uGrip;
        varying vec3 vSkinPos;`)
      .replace('#include <begin_vertex>', `
        vSkinPos = position;
        float a = along;
        float wob = sin(uTime * (1.6 + uGrip * 1.4) + uPhase + a * 4.2) * (1.0 - uGrip) * 0.35;
        float curl = (uBend + wob * 0.25) * a * a;
        float stiff = mix(1.0, 0.25, uGrip);
        vec3 transformed = vec3( position );
        transformed.y -= curl * 0.55 * stiff;
        transformed.x += (wob * 0.22 + curl * 0.18) * stiff;
        transformed.z -= curl * curl * 0.12 * a;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uEffort; uniform vec3 uBase; uniform vec3 uSuck; uniform vec3 uHot;
        varying vec3 vSkinPos;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${skinGLSL(15.0, 0.3)}`);

    mat.userData.shader = shader;
  };

  // Available before the first compile, so the animation never sees `undefined`.
  mat.userData.uniforms = uniforms;
  mat.userData.bend = 0.35;
  return mat;
}

/**
 * Skin. Real octopuses change colour when they work, so the mottling and the flush
 * are the same mechanism: a cheap value noise on the object-space position, scaled
 * by effort. Written once and shared by the arms and the mantle.
 */
const NOISE_GLSL = `
float tcHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.27, 0.13)); p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tcNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tcHash(i), tcHash(i + vec3(1,0,0)), f.x),
                 mix(tcHash(i + vec3(0,1,0)), tcHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tcHash(i + vec3(0,0,1)), tcHash(i + vec3(1,0,1)), f.x),
                 mix(tcHash(i + vec3(0,1,1)), tcHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

/** @returns {string} GLSL for the fragment shader: mottle the albedo by effort. */
function skinGLSL(mottleScale, flushMix) {
  return `vec3 sp = vSkinPos * ${mottleScale.toFixed(1)};
    float mottle = tcNoise(sp) * 0.6 + tcNoise(sp * 2.7) * 0.4;
    float spots = smoothstep(0.52, 0.78, tcNoise(sp * 1.6));
    diffuseColor.rgb *= 0.72 + 0.55 * mottle;
    diffuseColor.rgb = mix(diffuseColor.rgb, uHot * 1.15, uEffort * ${flushMix.toFixed(2)});
    diffuseColor.rgb += uHot * spots * uEffort * 0.4;`;
}

/** Patch the mantle/head material: colour flush + papillae when the octopus works. */
function skinMaterial(opts) {
  const mat = new THREE.MeshStandardMaterial(opts);
  const uniforms = { uEffort: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSkinPos; uniform float uEffort; uniform vec3 uHot;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${skinGLSL(11.0, 0.26)}`);
    mat.userData.shader = shader;
  };
  mat.userData.uniforms = uniforms;
  mat.userData.skin = true;
  return mat;
}

export function createOctopus() {
  const group = new THREE.Group();
  const materials = [];
  const hotColor = new THREE.Color(PALETTE.effort);
  const baseColor = new THREE.Color(PALETTE.mantle);
  const scratch = new THREE.Color();

  // --- body: a mantle over a head. An octopus is not a balloon on sticks; the
  // mantle is a tall oval that narrows into a neck, and the eyes sit on the head
  // below it. Two shapes read as one animal; one sphere reads as a party favour. ---
  const mantleGeo = new THREE.SphereGeometry(0.5, 28, 20);
  {
    const mp = mantleGeo.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
      // Narrow the underside so the mantle meets the head instead of sitting on it.
      const neck = y < 0 ? 0.62 + 0.38 * (1 + y) : 1;
      mp.setXYZ(i, x * 0.78 * neck, y * 1.24, z * 0.9 * neck);
    }
    mantleGeo.computeVertexNormals();
  }
  const mantleMat = skinMaterial({
    color: PALETTE.mantle, roughness: 0.5, metalness: 0.03,
    emissive: new THREE.Color(PALETTE.effort), emissiveIntensity: 0,
  });
  const mantle = new THREE.Mesh(mantleGeo, mantleMat);
  mantle.position.y = 1.28;
  group.add(mantle);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 26, 18), mantleMat);
  head.scale.set(1.02, 0.9, 1.05);
  head.position.y = 0.78;
  group.add(head);

  // --- eyes: forward-facing, pupils and a shine. Small things read as alive. ---
  const eyes = new THREE.Group();
  const pupils = [];
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf6e7c8, roughness: 0.35 }),
    );
    white.position.set(side * 0.29, 0.86, 0.33);
    white.scale.set(1.1, 0.95, 0.7);
    eyes.add(white);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.pupil, roughness: 0.25 }),
    );
    pupil.position.set(side * 0.3, 0.85, 0.4);
    pupil.scale.set(0.5, 1.2, 0.6); // a horizontal slit, as real ones are
    eyes.add(pupil);
    pupils.push({ mesh: pupil, home: pupil.position.clone() });

    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 8, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.shine }),
    );
    shine.position.set(side * 0.27, 0.9, 0.42);
    eyes.add(shine);
  }
  group.add(eyes);

  // --- eight arms around the mantle skirt ---
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const isRight = i < 4;
    const len = 1.55 + (i % 2) * 0.22;
    const geo = buildArm(len, 0.42, isRight ? 0.5 : -0.5);
    const mat = armMaterial({});
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * 0.36, 0.62, Math.sin(angle) * 0.36);
    mesh.rotation.y = -angle + Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(mesh);
    group.add(holder);
    arms.push({ mesh, mat, holder, baseRot: mesh.rotation.clone(), index: i });
  }

  let time = 0;
  const aimScratch = new THREE.Vector3();
  const dirScratch = new THREE.Vector3();
  const baseY = 0;

  return {
    group,

    /**
     * @param view   the plain view object (see stage/CONTRACT.md)
     * @param dt     seconds since last frame
     * @param grip   world-space { x, y, z, angle } of the clasped hands, from world.js
     */
    update(view, dt, grip) {
      time += dt;
      const effort = view?.you?.boost ? Math.min(1, (view.you.boost - 1) / 0.75) : 0;
      const fatigue = 1 - (view?.you?.stamina ?? 1);
      const reach = view?.armReach ?? 0;

      mantleMat.emissiveIntensity = effort * 0.35;
      mantleMat.userData.uniforms.uEffort.value = effort;
      mantleMat.color.copy(scratch.copy(baseColor).lerp(hotColor, effort * 0.25));
      // Breathing: an octopus at rest still moves.
      const breathe = 1 + Math.sin(time * 1.1) * 0.018;
      mantle.scale.set(breathe, 1 / breathe, breathe);
      mantle.position.y = 1.28 + Math.sin(time * 1.1) * 0.012;

      // Eyes follow the grip.
      const blink = Math.max(0, Math.sin(time * 0.35)) ** 24;
      for (const p of pupils) {
        p.mesh.position.set(p.home.x, p.home.y, p.home.z + 0.012);
        p.mesh.scale.y = 1.2 * (1 - blink * 0.85);
      }

      // Aim the competing arm in the octopus's own space: the caller gives a world
      // point, and the group is placed and turned in the arena.
      if (grip) aimScratch.set(grip.elbowX ?? grip.x, grip.elbowY ?? grip.y, grip.elbowZ ?? grip.z);
      else aimScratch.set(0, 0.8, 1.2);
      group.worldToLocal(aimScratch);

      for (const arm of arms) {
        const u = arm.mat.userData.uniforms;
        u.uTime.value = time;
        const competing = arm.index === reach;
        u.uGrip.value += ((competing ? 1 : 0) - u.uGrip.value) * Math.min(1, dt * 6);
        u.uEffort.value = effort * (competing ? 1 : 0.35);
        // Idle arms droop and drift; the competing arm lifts toward its pad.
        const target = competing ? -0.1 : 0.35 + Math.sin(time * 0.5 + arm.index) * 0.12;
        const bend = arm.mat.userData.bend;
        arm.mat.userData.bend = bend + (target - bend) * Math.min(1, dt * 4);
        u.uBend.value = arm.mat.userData.bend;

        if (competing) {
          dirScratch.copy(aimScratch).sub(arm.holder.position);
          const horiz = Math.hypot(dirScratch.x, dirScratch.z);
          const want = Math.atan2(dirScratch.x, dirScratch.z);
          const pitch = -Math.atan2(dirScratch.y - 0.1, horiz);
          arm.holder.rotation.y = THREE.MathUtils.lerp(arm.holder.rotation.y, want, Math.min(1, dt * 5));
          arm.holder.rotation.x = THREE.MathUtils.lerp(arm.holder.rotation.x, pitch, Math.min(1, dt * 4));
        } else {
          arm.holder.rotation.x = THREE.MathUtils.lerp(arm.holder.rotation.x, 0, Math.min(1, dt * 3));
          arm.holder.rotation.y = THREE.MathUtils.lerp(arm.holder.rotation.y, arm.baseRot.y, Math.min(1, dt * 2));
        }
      }
      // Fatigue makes the whole octopus sag.
      group.position.y = baseY - fatigue * 0.06;
    },

    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); });
      materials.forEach((m) => m.dispose());
      mantleMat.dispose();
    },
  };
}
