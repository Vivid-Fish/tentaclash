// The arena: water, light, crowd, table. Owns the renderer, the camera, and the
// one shared grip pivot that both wrestlers reach for (the octopus and the opponent
// rigs take it as an argument, so neither of them has to know where the table is).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createOctopus, PALETTE } from './octopus.js';
import { createOpponent } from './opponents.js';

const WATER = 0x06111b;
const SHALLOW = 0x0e4a66;
const ACCENT = 0x82d9df;
const ACCENT2 = 0xf1b4be;
const OK = 0x64d7a5;
const WARN = 0xe0bc66;
const BAD = 0xec806e;
const TELL = 0xff00ff;
const TELL_LIGHT = new THREE.Color(0x7fe9ff);
const KEY_BASE = new THREE.Color(0xfff4e4);

const TEXTURES = {
  env: 'assets/textures/underwater-equi.jpg',
  sand: 'assets/textures/sand-seamless.jpg',
};

// Both wrestlers face each other along the table's long axis (x), elbows on their
// own pad, hands meeting at the centre. `ELBOW` is the pivot the whole grip turns
// about, which is how a real grip works: the hands rotate around the elbow line.
const ELBOW_Y = 1.06;
const YOU_PAD = new THREE.Vector3(-0.62, ELBOW_Y, 0);
const OPP_PAD = new THREE.Vector3(0.62, ELBOW_Y, 0);
const HAND = new THREE.Vector3(0, ELBOW_Y + 0.34, 0);

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WATER);
  // Fog that reads as depth, not as a blackout: at 0.02 the far stands still show.
  scene.fog = new THREE.FogExp2(WATER, 0.022);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 2.2, 4.2);

  let quality = 'high';
  let composer = null;

  // ---------- light ----------
  // Under water the ambient is cyan, but a cyan key turns brass green and skin grey.
  // So: cool ambient for depth, a neutral-warm sun for actual colour, fog for range.
  scene.add(new THREE.HemisphereLight(0x2f7a99, 0x0a1a24, 1.1));
  const sun = new THREE.DirectionalLight(0xf7e9d2, 2.4);
  sun.position.set(2.5, 9, 3.5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(ACCENT2, 0.7);
  rim.position.set(-4, 2.5, -4);
  scene.add(rim);
  const key = new THREE.PointLight(0xfff4e4, 14, 20, 1.7);
  key.position.set(0.4, 2.6, 1.6);
  scene.add(key);

  const shaders = [];
  let shaderId = 0;
  /**
   * Patch a stock material with water motion. Each patch gets its own program
   * cache key: sharing one would make three different shaders reuse one program.
   */
  function patch(material, head, body, fragHead = '', fragBody = '') {
    const id = `tc${shaderId++}`;
    material.onBeforeCompile = (shader) => {
      const u = {};
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${head}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
      if (fragHead) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${fragHead}`)
          .replace('#include <color_fragment>', `#include <color_fragment>\n${fragBody}`);
        u.uT = { value: 0 };
        u.uTint = { value: new THREE.Color(ACCENT) };
        u.uCaus = { value: 1 };
      }
      shader.userData = { u };
      shaders.push(shader);
      material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => id;
    return material;
  }

  // ---------- water and floor ----------
  const loader = new THREE.TextureLoader();

  // The generated photo is used for reflections only, never as the sky: a
  // photograph behind hand-built creatures reads as a costume party. The sky here
  // is a gradient from open water above to dark bottom below.
  // PMREM has to run in the load callback: the texture has no image until then.
  loader.load(TEXTURES.env, (envTex) => {
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envTex.dispose();
    pmrem.dispose();
  });

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(45, 24, 16),
    patch(
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false }),
      'varying vec3 vLocal;',
      'vLocal = position;',
      'varying vec3 vLocal;',
      `float h = clamp(vLocal.y / 45.0 * 0.5 + 0.5, 0.0, 1.0);
       vec3 deep = vec3(0.03, 0.09, 0.13);
       vec3 mid = vec3(0.10, 0.34, 0.45);
       vec3 high = vec3(0.55, 0.82, 0.90);
       vec3 sky = mix(deep, mix(mid, high, smoothstep(0.62, 1.0, h)), smoothstep(0.20, 0.85, h));
       float shaft = pow(max(0.0, sin(atan(vLocal.z, vLocal.x) * 3.0)), 12.0) * smoothstep(0.45, 1.0, h);
       diffuseColor.rgb = sky + vec3(0.22, 0.38, 0.42) * shaft;`,
    ),
  );
  scene.add(dome);
  const sandTex = loader.load(TEXTURES.sand);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  // A wide repeat turns beach sand into mud blotches at arena scale; and it has to
  // be read as sand under five metres of water, so it is tinted toward the water.
  sandTex.repeat.set(3.5, 3.5);
  sandTex.colorSpace = THREE.SRGBColorSpace;

  const floorMat = patch(
    new THREE.MeshStandardMaterial({ map: sandTex, color: 0x8fa6b2, roughness: 0.95, metalness: 0 }),
    'uniform float uT; varying vec3 vWPos;',
    'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    'uniform float uT; uniform vec3 uTint; uniform float uCaus; varying vec3 vWPos;',
    `float cx = vWPos.x * 4.0 + sin(vWPos.z * 5.2 + uT * 0.5) * 3.0;
     float cz = vWPos.z * 4.0 - sin(vWPos.x * 4.9 - uT * 0.4) * 3.0;
     float caustic = pow(max(0.0, sin(cx * 2.4) * sin(cz * 2.4)), 10.0);
     float ripple = pow(max(0.0, sin(cx * 7.0 + uT) * sin(cz * 6.0 - uT * 0.7)), 16.0) * 0.5;
     totalEmissiveRadiance += uTint * (caustic * 0.5 + ripple * 0.3) * uCaus;`,
  );
  floorMat.defines = { USE_UV: '' };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // The surface, seen from below: a dim animated ceiling of light.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70, 1, 1),
    patch(
      new THREE.MeshBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      'uniform float uT;',
      `transformed.y += sin(position.x * 0.7 + uT * 1.2) * 0.12 + cos(position.y * 0.6 - uT) * 0.1;`,
    ),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 9.5;
  scene.add(surface);

  // Light shafts: three wide additive prisms, cheap and unmistakable.
  const shafts = [];
  for (let i = 0; i < 3; i++) {
    const m = patch(
      new THREE.MeshBasicMaterial({
        color: i === 1 ? ACCENT : 0xbfe9ff, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }),
      'uniform float uT; varying float vShade;',
      `vShade = position.y;`,
    );
    const g = new THREE.ConeGeometry(2.2 + i, 12, 5, 1, true);
    const shaft = new THREE.Mesh(g, m);
    shaft.position.set(-6 + i * 6, 6.5, -6 + i * 3);
    shaft.rotation.z = (i - 1) * 0.12;
    scene.add(shaft);
    shafts.push(shaft);
  }

  // ---------- motes ----------
  const moteGeo = new THREE.BufferGeometry();
  const moteCount = 900;
  const mp = new Float32Array(moteCount * 3);
  const ms = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    mp[i * 3] = (Math.random() - 0.5) * 34;
    mp[i * 3 + 1] = Math.random() * 8;
    mp[i * 3 + 2] = (Math.random() - 0.5) * 34;
    ms[i] = Math.random();
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  moteGeo.setAttribute('seed', new THREE.BufferAttribute(ms, 1));
  const moteMat = patch(
    new THREE.PointsMaterial({ color: 0xcfeef5, size: 0.045, transparent: true, opacity: 0.5, depthWrite: false }),
    'uniform float uT; attribute float seed;',
    `transformed.y += sin(uT * 0.25 + seed * 6.28) * 0.4 + mod(uT * 0.12 + seed, 1.0) * 0.5;
     transformed.x += sin(uT * 0.3 + seed * 3.1) * 0.3;`,
  );
  scene.add(new THREE.Points(moteGeo, moteMat));

  // ---------- the crowd ----------
  // A drifting shoal: one instanced silhouette, because a crowd that is 200 draw
  // calls is not a crowd, it is a slideshow. Kept high and far, where a school of
  // fish belongs; at eye level cones read as floating debris.
  const fishGeo = new THREE.ConeGeometry(0.2, 0.9, 5);
  fishGeo.rotateX(-Math.PI / 2);
  const fishMat = new THREE.MeshStandardMaterial({ color: 0x0c1c28, roughness: 0.8, emissive: new THREE.Color(ACCENT), emissiveIntensity: 0.1 });
  const SHOAL = 70;
  const shoal = new THREE.InstancedMesh(fishGeo, fishMat, SHOAL);
  const fishData = [];
  for (let i = 0; i < SHOAL; i++) {
    fishData.push({
      r: 12 + Math.random() * 10, a: Math.random() * Math.PI * 2,
      y: 5.2 + Math.random() * 3.0, sp: 0.1 + Math.random() * 0.14,
      s: 0.45 + Math.random() * 0.8, wob: Math.random() * 6.28,
    });
  }
  scene.add(shoal);

  // Spectator ring: glowing anemones rooted on the sand around the table, which is
  // also arena lighting. Out at the horizon they read as balloons, not a crowd.
  const anemoneGeo = new THREE.SphereGeometry(0.34, 10, 8);
  const anemoneMat = new THREE.MeshStandardMaterial({ color: 0x0e2a36, emissive: new THREE.Color(ACCENT2), emissiveIntensity: 0.5, roughness: 0.7 });
  const ANEMONES = 30;
  const anemones = new THREE.InstancedMesh(anemoneGeo, anemoneMat, ANEMONES);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ANEMONES; i++) {
    const a = (i / ANEMONES) * Math.PI * 2 + (i % 3) * 0.21;
    const r = 4.6 + (i % 4) * 1.5;
    const s = 0.4 + ((i * 7) % 10) / 16;
    dummy.position.set(Math.cos(a) * r, s * 0.12, Math.sin(a) * r);
    dummy.scale.set(s, s * 1.7, s);
    dummy.updateMatrix();
    anemones.setMatrixAt(i, dummy.matrix);
  }
  scene.add(anemones);

  // ---------- the table ----------
  const table = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x24405c, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.6 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9b45f, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.8 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x7d4f47, roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 1.0), woodMat);
  top.position.y = 0.94;
  const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), brassMat);
  peg.position.set(-1.25, 1.14, 0.36);
  const peg2 = peg.clone();
  peg2.position.x = 1.25;
  const padL = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.6), padMat);
  padL.position.set(-0.62, 1.02, 0);
  const padR = padL.clone();
  padR.position.x = 0.62;
  table.add(top, peg, peg2, padL, padR);
  for (const x of [-1.15, 1.15]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.94, 8), woodMat);
    leg.position.set(x, 0.47, 0);
    table.add(leg);
  }
  // A small brass strip on the near skirt: signage without a billboard.
  const nameplate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.02), brassMat);
  nameplate.position.set(0, 0.9, 0.52);
  table.add(nameplate);
  scene.add(table);

  // ---------- the grip ----------
  // The thing the whole game is about, and the thing a player must be able to see:
  // two forearms and two locked hands, turning about the elbow line as `angle` moves.
  const gripPivot = new THREE.Group();
  gripPivot.position.set(0, ELBOW_Y, 0);
  const youSkin = new THREE.MeshStandardMaterial({ color: PALETTE.arm, roughness: 0.5, metalness: 0.02, emissive: new THREE.Color(PALETTE.effort), emissiveIntensity: 0 });
  const oppSkin = new THREE.MeshStandardMaterial({ color: 0xc4614f, roughness: 0.6, metalness: 0.02 });
  function forearm(from, to, material, r0 = 0.075, r1 = 0.05) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 12);
    const m = new THREE.Mesh(g, material);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }
  // Elbows sit on the pads; in the pivot's frame those points are on the x axis and
  // therefore do not move when the grip turns.
  gripPivot.add(
    forearm(new THREE.Vector3(-0.62, 0, 0), new THREE.Vector3(0, 0.3, 0), youSkin),
    forearm(new THREE.Vector3(0.62, 0, 0), new THREE.Vector3(0, 0.3, 0), oppSkin),
  );
  // Two clasped fists. Fingers at this scale read as lumps, so the hands are fists
  // with a thumb over the knuckles: fewer shapes, and it reads instantly.
  const handMatA = new THREE.MeshStandardMaterial({ color: 0xcf7f6f, roughness: 0.5 });
  const handMatB = new THREE.MeshStandardMaterial({ color: 0xa8514a, roughness: 0.55 });
  for (const [mat, x, thumb] of [[handMatA, 0.045, 1], [handMatB, -0.045, -1]]) {
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), mat);
    fist.position.set(x, 0.3, 0);
    fist.scale.set(0.95, 1, 1.05);
    gripPivot.add(fist);
    const knuckles = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 6, 12, Math.PI), mat);
    knuckles.position.set(x, 0.33, 0.055);
    knuckles.rotation.set(0.2, 0, thumb * 0.3);
    gripPivot.add(knuckles);
  }
  scene.add(gripPivot);

  // ---------- the referee ----------
  // One tube along a curve, not a chain of spheres: nine separate balls read as a
  // string of bubbles, and this is the one character that has to look official.
  const ref = new THREE.Group();
  const eelMat = new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.5, emissive: new THREE.Color(WARN), emissiveIntensity: 0.12 });
  const eelCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.55),
    new THREE.Vector3(0.06, 0.05, 0.25),
    new THREE.Vector3(-0.04, -0.02, -0.1),
    new THREE.Vector3(0.03, 0.04, -0.45),
    new THREE.Vector3(-0.02, 0, -0.8),
  ]);
  const eel = new THREE.Group();
  const body = new THREE.Mesh(new THREE.TubeGeometry(eelCurve, 24, 0.1, 8, false), eelMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), eelMat);
  head.scale.set(0.85, 0.75, 1.35);
  head.position.set(0, 0.01, 0.62);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.6 }),
  );
  cap.position.set(0, 0.11, 0.6);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), new THREE.MeshStandardMaterial({ color: 0x120c1c, roughness: 0.3 }));
  const eyeR = eye.clone();
  eye.position.set(-0.09, 0.05, 0.68);
  eyeR.position.set(0.09, 0.05, 0.68);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), eelMat);
  fin.position.set(0, 0.02, -0.85);
  fin.rotation.x = -Math.PI / 2;
  eel.add(body, head, cap, eye, eyeR, fin);
  eel.position.set(0.05, 1.32, -1.05);
  ref.add(eel);
  const whistle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 6, 12), brassMat);
  whistle.position.set(0.14, 1.24, -0.72);
  ref.add(whistle);
  scene.add(ref);

  // ---------- the wrestlers ----------
  const octopus = createOctopus();
  octopus.group.position.set(-1.75, 0, 0);
  octopus.group.scale.setScalar(0.92);
  octopus.group.rotation.y = Math.PI / 2; // faces +x, toward the opponent
  scene.add(octopus.group);

  let opponent = null;
  let opponentId = null;
  const gripScratch = { x: 0, y: 0, z: 0, angle: 0, elbowX: 0, elbowY: 0, elbowZ: 0 };

  // ---------- post ----------
  function buildComposer() {
    if (composer) { composer.dispose?.(); composer = null; }
    if (quality === 'low') return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.7, 0.85);
    composer.addPass(bloom);
  }

  // ---------- camera ----------
  const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0 };
  const menuTarget = new THREE.Vector3();
  function aimCamera(view, dt, t) {
    const ph = view.phase;
    let pos, look, fov = 50;
    if (ph === 'menu') {
      // Establishing shot: from the far side of the table, low, so the octopus is
      // looking at you across the pads. Subject pushed to the right third.
      const a = 0.55 + Math.sin(t * 0.05) * 0.2;
      const target = menuTarget.set(-1.15, 1.15, 0);
      pos = new THREE.Vector3(2.15 + Math.sin(a) * 2.2, 1.75 + Math.sin(t * 0.2) * 0.12, -3.9 + Math.cos(a) * 1.6);
      look = new THREE.Vector3(target.x + 0.7, target.y - 0.25, target.z + 0.95);
      fov = 40;
    } else if (ph === 'over') {
      const s = Math.min(1, view.pinHold ?? 1);
      pos = new THREE.Vector3(-1.4, 1.75 + s * 0.3, 1.95 - s * 0.4);
      look = new THREE.Vector3(0, ELBOW_Y + 0.22, 0);
      fov = 40;
    } else {
      // Over your shoulder, behind and above your own octopus: your arm on the pad
      // in the foreground, the opponent facing you so its body is readable, because
      // reading that body is the game.
      const lean = view.angle * 0.28;
      pos = new THREE.Vector3(-3.35 - lean * 0.25, 2.02 + view.angle * 0.14, 1.62 + lean * 0.55);
      look = new THREE.Vector3(0.42, ELBOW_Y + 0.14 - view.angle * 0.1, 0.02);
      fov = 42;
    }
    const k = Math.min(1, dt * 3.2);
    camState.pos.lerp(pos, k);
    camState.look.lerp(look, k);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
  }

  let time = 0;

  return {
    renderer,
    scene,

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      composer?.setSize(w, h);
    },

    setQuality(q) {
      if (q === quality) return;
      quality = q;
      scene.fog.density = q === 'low' ? 0.03 : 0.022;
      buildComposer();
    },

    render(view, dt) {
      time += dt;
      const tell = Math.max(0, Math.min(1, view?.opp?.tell ?? 0));
      const boost = Math.max(0, (view?.you?.boost ?? 1) - 1) / 0.75;

      // The tell is not a HUD gauge; it is the room. Same number the sim uses, so
      // what the player reads and what the rules pay attention to cannot drift.
      key.color.copy(KEY_BASE).lerp(TELL_LIGHT, tell);
      key.intensity = 14 + tell * 22 + boost * 10;

      for (const s of shaders) {
        if (s.userData?.u?.uT) s.userData.u.uT.value = time;
        if (s.userData?.u?.uTint) s.userData.u.uTint.value.copy(ACCENT).lerp(TELL_LIGHT, tell);
        if (s.userData?.u?.uCaus) s.userData.u.uCaus.value = 0.45 + tell * 1.4;
      }

      if (view.phase !== 'menu' && view.opponentId !== opponentId) {
        opponentId = view.opponentId;
        if (opponent) { scene.remove(opponent.group); opponent.dispose?.(); }
        opponent = createOpponent(opponentId);
        // Raised and scaled so its elbow lands on its own pad: a wrestler at the
        // table, not a creature standing under it.
        opponent.group.position.set(1.72, 0.62, 0);
        opponent.group.scale.setScalar(1.35);
        opponent.group.rotation.y = -Math.PI / 2; // faces -x, toward you
        scene.add(opponent.group);
      }

      // The grip: one pivot, turned by the same angle the rules are integrating.
      const gripAngle = view.phase === 'fighting' || view.phase === 'over' ? view.angle : 0;
      gripPivot.rotation.x = -gripAngle * 1.15;
      const taut = Math.abs(gripAngle);
      youSkin.emissiveIntensity = Math.max(0, (view.you?.boost ?? 1) - 1) * 0.5;
      handMatA.roughness = handMatB.roughness = 0.5 - taut * 0.2;

      gripScratch.x = HAND.x; gripScratch.y = HAND.y; gripScratch.z = HAND.z;
      gripScratch.angle = gripAngle;
      // The octopus reaches to its own elbow; the grip rig supplies the forearm.
      gripScratch.elbowX = YOU_PAD.x; gripScratch.elbowY = YOU_PAD.y; gripScratch.elbowZ = YOU_PAD.z;
      octopus.update(view, dt, gripScratch);
      opponent?.update(view, dt);

      // The referee keeps time from the side of the table, leaning in as a pin
      // gets close, and swims with a slow eel undulation.
      const near = Math.max(0, Math.abs(view.angle) - 0.6);
      eel.position.z = THREE.MathUtils.lerp(eel.position.z, -1.05 + near * 0.35, Math.min(1, dt * 2));
      eel.position.y = 1.32 + Math.sin(time * 1.1) * 0.02;
      eel.rotation.y = Math.sin(time * 1.4) * 0.12;
      eel.rotation.z = Math.sin(time * 1.1) * 0.04 + gripAngle * 0.08;

      // The shoal wheels around the arena.
      for (let i = 0; i < shoal.count; i++) {
        const f = fishData[i];
        const a = f.a + time * f.sp;
        dummy.position.set(Math.cos(a) * f.r, f.y + Math.sin(time + f.wob) * 0.3, Math.sin(a) * f.r);
        dummy.rotation.set(0, -a + Math.PI / 2, Math.sin(time * 4 + f.wob) * 0.18);
        dummy.scale.set(f.s, f.s, f.s * 1.4);
        dummy.updateMatrix();
        shoal.setMatrixAt(i, dummy.matrix);
      }
      shoal.instanceMatrix.needsUpdate = true;
      anemoneMat.emissiveIntensity = 0.22 + tell * 0.5 + Math.sin(time * 0.8) * 0.06;
      fishMat.emissiveIntensity = 0.2 + tell * 0.5;

      shafts.forEach((s, i) => { s.rotation.y = time * 0.03 + i; s.material.opacity = 0.012 + Math.abs(Math.sin(time * 0.2 + i)) * 0.02; });

      aimCamera(view, dt, time);
      if (view.screenShake) {
        camera.position.x += (Math.random() - 0.5) * view.screenShake * 0.25;
        camera.position.y += (Math.random() - 0.5) * view.screenShake * 0.2;
      }

      if (composer) composer.render();
      else renderer.render(scene, camera);
    },

    /** Draw calls, for the budget check in test/render.mjs. */
    stats() { return renderer.info.render.calls; },
  };
}
