// Solmar Bay — procedural coastal city: streets, buildings, beach, pier,
// landmarks, palms and street props. Everything is generated, no assets.
import { mulberry32, facadeTexture, roadTexture, groundTexture } from './util.js';

export const WORLD = 620;            // playable half-extent is ~310
export const STREET_STEP = 60;
export const STREETS = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270];

// Landmark positions (shared with missions / HUD).
export const LANDMARKS = {
  plaza: { x: 0, z: 0, name: 'Marina Plaza' },
  hospital: { x: -210, z: -210, name: 'Solmar General' },
  bank: { x: 90, z: -90, name: 'Bay Trust Bank' },
  garage: { x: 210, z: 150, name: "Marlow's Garage" },
  docks: { x: -270, z: 270, name: 'Fisherman Docks' },
  pier: { x: -300, z: 30, name: 'Sunset Pier' },
  safehouse: { x: 150, z: -210, name: 'Safehouse' },
  beach: { x: -300, z: -150, name: 'Coral Beach' },
  mall: { x: -90, z: 150, name: 'Palms Mall' },
  airport: { x: 270, z: -270, name: 'Solmar Airfield' },
};

export function buildCity(scene) {
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const rnd = mulberry32(20261118);
  const group = new THREE.Group();
  scene.add(group);

  // Sky, sun, fog, lights
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 220, 700);
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x8a7a55, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cf, 1.6);
  sun.position.set(180, 260, 120);
  scene.add(sun);

  // Ground + ocean (west) + sand beach
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2.4, WORLD * 2.4),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.1, 0);
  group.add(ground);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(600, WORLD * 2.4),
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(-620, 0.05, 0);
  group.add(ocean);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(46, WORLD * 2.2),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-312, 0.02, 0);
  group.add(sand);

  // Roads: dark strips along every street line, plus sidewalk kerbs.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  for (const s of STREETS) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 60, 13), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.repeat.set((WORLD + 60) / 16, 1);
      road.material.map.needsUpdate = true;
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0, s); }
      else { road.rotation.z = Math.PI / 2; road.position.set(s, 0, 0); }
      group.add(road);
      for (const off of [-8.5, 8.5]) {
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(WORLD + 60, 0.35, 2.4), kerbMat);
        if (horizontal) kerb.position.set(0, 0.17, s + off);
        else { kerb.rotation.y = Math.PI / 2; kerb.position.set(s + off, 0.17, 0); }
        group.add(kerb);
      }
    }
  }

  // Buildings: one or two per block, heights vary by district; plaza stays open.
  const palette = ['#c98f5f', '#b7a98f', '#8fa8b7', '#d8c9a3', '#a88f7a', '#7a94a8', '#c9b18a', '#9a8fa8'];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2b4a63 });
  let seed = 7;
  for (let ix = 0; ix < STREETS.length - 1; ix++) {
    for (let iz = 0; iz < STREETS.length - 1; iz++) {
      const cx = (STREETS[ix] + STREETS[ix + 1]) / 2;
      const cz = (STREETS[iz] + STREETS[iz + 1]) / 2;
      if (Math.abs(cx) < 45 && Math.abs(cz) < 45) continue; // plaza
      if (cx < -280) continue; // beach
      const distC = Math.hypot(cx, cz);
      const tall = distC < 140 ? 0.75 : 0.3;
      const n = rnd() < 0.55 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = 16 + rnd() * 14, d = 16 + rnd() * 14;
        const h = (rnd() < tall ? 26 + rnd() * 42 : 10 + rnd() * 16);
        const ox = n === 2 ? (k === 0 ? -11 : 11) : 0;
        const oz = n === 2 ? (k === 0 ? -11 : 11) : 0;
        const x = cx + ox, z = cz + oz;
        const base = palette[Math.floor(rnd() * palette.length)];
        const tex = facadeTexture(base, 0.35, seed++);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2, d * 0.7), roofMat);
        roof.position.set(x, h + 0.6, z); group.add(roof);
        if (rnd() < 0.3) { // rooftop sign / water tank
          const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 1), new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x554400 }));
          sign.position.set(x, h + 2.5, z + d / 2); group.add(sign);
        }
        colliders.push({ minX: x - w / 2 - 0.5, maxX: x + w / 2 + 0.5, minZ: z - d / 2 - 0.5, maxZ: z + d / 2 + 0.5 });
      }
    }
  }

  // Landmark buildings (bigger, named in HUD/missions)
  function landmarkBuilding(x, z, w, h, d, color, signText, signColor) {
    const tex = facadeTexture(color, 0.5, seed++);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: tex }));
    b.position.set(x, h / 2, z); group.add(b);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (signText) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = signColor || '#10202f'; g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#ffd23e'; g.font = 'bold 52px Trebuchet MS, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(signText, 256, 50);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.17),
        new THREE.MeshBasicMaterial({ map: t }));
      sign.position.set(x, h - 4, z + d / 2 + 0.3); group.add(sign);
    }
    return b;
  }
  landmarkBuilding(LANDMARKS.hospital.x, LANDMARKS.hospital.z, 34, 22, 26, '#e8e4da', 'SOLMAR GENERAL', '#1c5a7a');
  landmarkBuilding(LANDMARKS.bank.x, LANDMARKS.bank.z, 30, 30, 24, '#b7a98f', 'BAY TRUST BANK', '#10202f');
  landmarkBuilding(LANDMARKS.garage.x, LANDMARKS.garage.z, 30, 12, 24, '#5a6a7a', "MARLOW'S GARAGE", '#c0392b');
  landmarkBuilding(LANDMARKS.mall.x, LANDMARKS.mall.z, 40, 18, 30, '#8fa8b7', 'PALMS MALL', '#7a2b8f');

  // Plaza fountain + benches
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
  fountain.position.set(0, 0.7, 0); group.add(fountain);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x2e9fd8 }));
  water.position.set(0, 1.3, 0); group.add(water);
  colliders.push({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });

  // Sunset pier (west, over the ocean)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 10), pierMat);
  pier.position.set(-330, 0.6, 30); group.add(pier);
  colliders.push({ minX: -365, maxX: -295, minZ: 24, maxZ: 36 });

  // Palm trees along streets + beach
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b4a });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.4, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z); group.add(g);
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }
  for (const s of STREETS) for (const t of [-240, -120, 0, 120, 240]) {
    if (rnd() < 0.7 && Math.hypot(s + 12 - LANDMARKS.docks.x, t + 12 - LANDMARKS.docks.z) > 22) palm(s + 12, t + 12);
    if (rnd() < 0.5) palm(-312 + rnd() * 8, t);
  }

  // Street lamps (glow at dusk look — emissive heads)
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const s of STREETS) for (const t of [-270, -150, -30, 90, 210]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), lampMat);
    pole.position.set(s + 9, 3, t); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
    bulb.position.set(s + 9, 6.2, t); group.add(bulb);
  }

  // Park (south-east block): grass circle + trees
  const park = new THREE.Mesh(new THREE.CircleGeometry(24, 24),
    new THREE.MeshLambertMaterial({ color: 0x4e8b3a }));
  park.rotation.x = -Math.PI / 2; park.position.set(240, 0.05, 240); group.add(park);
  for (let i = 0; i < 8; i++) palm(240 + (rnd() - 0.5) * 36, 240 + (rnd() - 0.5) * 36);

  return { group, colliders };
}

// Circle (radius r) vs building AABBs — push out, return corrected position.
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        // centre inside box: push along smallest penetration axis
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  const LIM = 305;
  x = Math.max(-360, Math.min(LIM, x));
  z = Math.max(-LIM, Math.min(LIM, z));
  return { x, z };
}
export function nearestStreet(v) {
  let best = STREETS[0], bd = 1e9;
  for (const s of STREETS) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
  return best;
}
