// Solmar Bay — the city of Solmar Bay, generated procedurally from a fixed
// seed so the world is identical every load. A 10x10 street grid with
// ~150 buildings, a beach and ocean to the south, an airfield to the north,
// and named landmark blocks the missions point at. All art is procedural:
// canvas-painted facades, signs and road markings, box-built landmarks.

import { RNG, clamp, makeCanvas } from './util.js';

export const PITCH = 52; // block (40) + street (12)
export const BLOCK = 40;
export const HALF = 260; // city spans -260..260 on both axes

// World coordinates of a block's centre.
export function blockCenter(bx, bz) {
  return { x: -HALF + bx * PITCH + PITCH / 2, z: -HALF + bz * PITCH + PITCH / 2 };
}

// Push a circle (pos {x,z}, radius r) out of every axis-aligned collider.
export function resolveCircle(p, r, colliders) {
  for (const c of colliders) {
    const nx = clamp(p.x, c.x0, c.x1);
    const nz = clamp(p.z, c.z0, c.z1);
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: shove out along the smallest penetration.
        const pl = p.x - c.x0;
        const pr = c.x1 - p.x;
        const pt = p.z - c.z0;
        const pb = c.z1 - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = c.x0 - r;
        else if (m === pr) p.x = c.x1 + r;
        else if (m === pt) p.z = c.z0 - r;
        else p.z = c.z1 + r;
      }
    }
  }
}

// True when a point is in the sea. The pier strip is walkable.
export function isInWater(x, z) {
  if (z <= 300) return false;
  if (Math.abs(x) < 7 && z < 342) return false; // the pier
  return true;
}

const FACADE_BASES = ['#b98a5e', '#8a9bb0', '#a89a7d', '#7d8a6a', '#b0705e', '#6a7d8a', '#c0a060'];

export function buildCity(THREE) {
  const rng = new RNG(1337);
  const group = new THREE.Group();
  const colliders = [];
  const addCollider = (x0, z0, x1, z1) => {
    colliders.push({ x0, z0, x1, z1 });
  };

  // ---------- ground: one 1024px canvas painted with roads, sidewalks,
  // parks, beach and runway. Canvas top = north (-z), left = west (-x).
  const WORLD = 700; // ground plane covers -350..350
  const px = (x) => ((x + WORLD / 2) / WORLD) * 1024;
  const py = (z) => ((z + WORLD / 2) / WORLD) * 1024;
  const groundCanvas = makeCanvas(1024, 1024, (ctx) => {
    ctx.fillStyle = '#8f8a7c';
    ctx.fillRect(0, 0, 1024, 1024);
    // Parks.
    ctx.fillStyle = '#5d8a4a';
    for (const [bx, bz] of [[4, 2], [7, 7]]) {
      const c = blockCenter(bx, bz);
      ctx.fillRect(px(c.x - 20), py(c.z - 20), px(40) - px(0), py(40) - py(0));
    }
    // Beach sand, south edge.
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(0, py(262), 1024, py(300) - py(262));
    // Runway, north edge.
    ctx.fillStyle = '#2c2c31';
    ctx.fillRect(px(-130), py(-312), px(260) - px(0), py(-262) - py(-312));
    ctx.fillStyle = '#f2f2f2';
    for (let x = -120; x < 120; x += 24) {
      ctx.fillRect(px(x), py(-288) - 2, px(12) - px(0), 4);
    }
    // Streets: dark asphalt strips.
    ctx.fillStyle = '#33333a';
    for (let i = 0; i <= 10; i++) {
      const c = -HALF + i * PITCH;
      ctx.fillRect(px(c - 6), py(-HALF), px(12) - px(0), py(HALF) - py(-HALF));
      ctx.fillRect(px(-HALF), py(c - 6), px(HALF) - px(-HALF), py(12) - py(0));
    }
    // Sidewalk frames around each block.
    ctx.fillStyle = '#b5ac9c';
    for (let bx = 0; bx < 10; bx++) {
      for (let bz = 0; bz < 10; bz++) {
        const c = blockCenter(bx, bz);
        ctx.fillRect(px(c.x - 21), py(c.z - 21), px(42) - px(0), py(42) - py(0));
      }
    }
    // Centre dashes on the two main avenues.
    ctx.fillStyle = '#e8c832';
    for (let i = 0; i <= 10; i++) {
      const c = -HALF + i * PITCH;
      for (let s = -HALF + 8; s < HALF; s += 26) {
        ctx.fillRect(px(c) - 1, py(s), 2, py(10) - py(0));
        ctx.fillRect(px(s), py(c) - 1, px(10) - px(0), 2);
      }
    }
  });
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  group.add(ground);

  // ---------- ocean (animated) ----------
  const oceanCanvas = makeCanvas(256, 256, (ctx) => {
    ctx.fillStyle = '#1d6fa8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#2b86c4';
    for (let i = 0; i < 40; i++) {
      const y = (i * 37) % 256;
      ctx.fillRect(0, y, 256, 3);
    }
    ctx.fillStyle = '#7fc4e8';
    for (let i = 0; i < 24; i++) {
      ctx.fillRect((i * 53) % 256, (i * 91) % 256, 14, 2);
    }
  });
  const oceanTex = new THREE.CanvasTexture(oceanCanvas);
  oceanTex.colorSpace = THREE.SRGBColorSpace;
  oceanTex.wrapS = THREE.RepeatWrapping;
  oceanTex.wrapT = THREE.RepeatWrapping;
  oceanTex.repeat.set(6, 4);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 420),
    new THREE.MeshLambertMaterial({ map: oceanTex }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.06, 512);
  group.add(ocean);

  // ---------- facade + sign texture caches ----------
  const facadeCache = new Map();
  function facadeTexture(base, floors, variant) {
    const key = base + '|' + floors + '|' + variant;
    if (facadeCache.has(key)) return facadeCache.get(key);
    const tex = new THREE.CanvasTexture(
      makeCanvas(128, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        // Ground floor: darker shopfront band.
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, h - 42, w, 42);
        ctx.fillStyle = '#22242a';
        ctx.fillRect(10, h - 34, w - 20, 26);
        const cols = 4;
        const rows = Math.max(2, floors);
        const cw = w / cols;
        const ch = (h - 48) / rows;
        const vr = new RNG(9000 + floors * 131 + variant * 17);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const lit = vr.chance(0.35);
            ctx.fillStyle = lit ? '#ffd98a' : '#2a3442';
            ctx.fillRect(6 + c * cw, 8 + r * ch, cw - 12, ch - 10);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(6 + c * cw, 8 + r * ch, cw - 12, 3);
          }
        }
      }),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    facadeCache.set(key, tex);
    return tex;
  }

  function signTexture(text, bg, fg) {
    return new THREE.CanvasTexture(
      makeCanvas(512, 128, (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = fg;
        ctx.font = 'bold 52px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 2);
      }),
    );
  }

  function addSign(text, bg, fg, x, y, z, w, rotY) {
    const tex = signTexture(text, bg, fg);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
    return m;
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3c3a36 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x24262b });

  function addBuilding(cx, cz, w, h, d, base, floors, variant) {
    const side = new THREE.MeshLambertMaterial({ map: facadeTexture(base, floors, variant) });
    const mesh = new THREE.Mesh(boxGeo, [side, side, roofMat, darkMat, side, side]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    group.add(mesh);
    addCollider(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
    return mesh;
  }

  // ---------- landmarks ----------
  const landmarks = {};
  const lm = (name, bx, bz) => {
    const c = blockCenter(bx, bz);
    landmarks[name] = { x: c.x, z: c.z };
    return c;
  };

  // Hospital (1,1): white mid-rise + red cross sign.
  {
    const c = lm('hospital', 1, 1);
    addBuilding(c.x, c.z, 26, 18, 22, '#e8e6df', 4, 0);
    addSign('HOSPITAL', '#f2f2f2', '#c02020', c.x, 20.5, c.z + 11.4, 20, 0);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xc02020 }),
    );
    cross.position.set(c.x, 15, c.z + 11.4);
    group.add(cross);
  }
  // Bank (5,5): tall tower at the city centre, gold sign.
  {
    const c = lm('bank', 5, 5);
    addBuilding(c.x, c.z, 24, 34, 24, '#c8a24a', 7, 1);
    addSign('SOLMAR BANK', '#1a1a22', '#e8c832', c.x, 36.5, c.z + 12.4, 22, 0);
  }
  // Marlow's garage (8,2): low wide workshop.
  {
    const c = lm('garage', 8, 2);
    addBuilding(c.x, c.z, 30, 9, 20, '#5e6b7a', 2, 2);
    addSign("MARLOW'S GARAGE", '#22303c', '#ffd98a', c.x, 11, c.z + 10.4, 26, 0);
  }
  // Paint shop (3,6).
  {
    const c = lm('paintShop', 3, 6);
    addBuilding(c.x, c.z, 22, 8, 18, '#7a5a8a', 2, 0);
    addSign('PAINT SHOP', '#3c2a4a', '#e8e8e8', c.x, 10, c.z + 9.4, 20, 0);
  }
  // Mall (2,7): big low box.
  {
    const c = lm('mall', 2, 7);
    addBuilding(c.x, c.z, 36, 12, 30, '#9a8a6a', 2, 1);
    addSign('SOLMAR MALL', '#4a3a22', '#ffffff', c.x, 14, c.z + 15.4, 30, 0);
  }
  // Safehouse (0,8): small house.
  {
    const c = lm('safehouse', 0, 8);
    addBuilding(c.x, c.z, 14, 7, 12, '#8a6a4a', 1, 0);
    addSign('SAFEHOUSE', '#2a3a2a', '#cfe8c0', c.x, 9, c.z + 6.4, 14, 0);
  }
  // Docks (9,4) + (9,5): container stacks and a crane.
  {
    const c1 = lm('docks', 9, 4);
    const c2 = blockCenter(9, 5);
    landmarks.docks2 = { x: c2.x, z: c2.z };
    const contCols = [0xb04030, 0x2a6ab0, 0x3a8a4a, 0xc09030, 0x704a90];
    for (let i = 0; i < 14; i++) {
      const bx = i < 7 ? c1.x - 12 + (i % 4) * 9 : c2.x - 12 + (i % 4) * 9;
      const bz = i < 7 ? c1.z - 8 + Math.floor(i / 4) * 9 : c2.z - 8 + Math.floor((i - 7) / 4) * 9;
      const h = rng.pick([2.6, 2.6, 5.2]);
      const m = new THREE.Mesh(
        boxGeo,
        new THREE.MeshLambertMaterial({ color: contCols[i % contCols.length] }),
      );
      m.scale.set(8, h, 2.6);
      m.position.set(bx, h / 2, bz);
      group.add(m);
      addCollider(bx - 4, bz - 1.3, bx + 4, bz + 1.3);
    }
    // Crane: two legs, a beam, a hanging hook block.
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
    const legGeo = new THREE.BoxGeometry(1.4, 26, 1.4);
    for (const dx of [-8, 8]) {
      const leg = new THREE.Mesh(legGeo, craneMat);
      leg.position.set(c1.x + dx, 13, c1.z + 14);
      group.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 1.6), craneMat);
    beam.position.set(c1.x, 26, c1.z + 14);
    group.add(beam);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), darkMat);
    hook.position.set(c1.x + 6, 20, c1.z + 14);
    group.add(hook);
    addCollider(c1.x - 9, c1.z + 12.6, c1.x + 9, c1.z + 15.4);
  }
  // Airfield (north): runway is painted on the ground; add hangar + plane.
  {
    landmarks.airfield = { x: 0, z: -286 };
    const hangar = new THREE.Mesh(
      boxGeo,
      new THREE.MeshLambertMaterial({ color: 0x707a80 }),
    );
    hangar.scale.set(30, 10, 18);
    hangar.position.set(-70, 5, -286);
    group.add(hangar);
    addCollider(-85, -295, -55, -277);
    addSign('HANGAR 2', '#3a444a', '#ffffff', -70, 11.5, -276.6, 20, 0);
    // Small prop plane: fuselage + wings + tail.
    const plane = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf0f0ea });
    const blue = new THREE.MeshLambertMaterial({ color: 0x2a5ab0 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 12, 10), white);
    fus.rotation.x = Math.PI / 2;
    plane.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 3), blue);
    plane.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 2), blue);
    tail.position.set(0, 0.4, -5.4);
    plane.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 2.4), blue);
    fin.position.set(0, 1.6, -5.4);
    plane.add(fin);
    plane.position.set(45, 1.6, -286);
    plane.rotation.y = Math.PI / 2;
    group.add(plane);
    addCollider(39, -292, 51, -280);
  }
  // Pier (south): deck + posts into the ocean.
  {
    landmarks.pier = { x: 0, z: 330 };
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    const deck = new THREE.Mesh(boxGeo, deckMat);
    deck.scale.set(14, 1, 84);
    deck.position.set(0, 0.5, 302);
    group.add(deck);
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
    for (let z = 266; z <= 340; z += 12) {
      for (const x of [-6.5, 6.5]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, -0.5, z);
        group.add(post);
      }
    }
    // A small shack at the pier end.
    addBuilding(0, 336, 8, 5, 6, '#a08050', 1, 2);
  }

  // ---------- ordinary blocks: 1-4 buildings each ----------
  const landmarkBlocks = new Set(['1,1', '5,5', '8,2', '3,6', '2,7', '0,8', '9,4', '9,5']);
  const parkBlocks = new Set(['4,2', '7,7']);
  for (let bx = 0; bx < 10; bx++) {
    for (let bz = 0; bz < 10; bz++) {
      const key = bx + ',' + bz;
      if (landmarkBlocks.has(key) || parkBlocks.has(key)) continue;
      const c = blockCenter(bx, bz);
      const n = rng.int(1, 4);
      for (let i = 0; i < n; i++) {
        const w = rng.range(9, 17);
        const d = rng.range(9, 17);
        const h = rng.range(8, 38);
        const ox = rng.range(-11, 11);
        const oz = rng.range(-11, 11);
        // Keep buildings inside the block and apart from each other roughly.
        const x = c.x + clamp(ox, -19 + w / 2, 19 - w / 2);
        const z = c.z + clamp(oz, -19 + d / 2, 19 - d / 2);
        const floors = Math.max(2, Math.round(h / 5));
        addBuilding(x, z, w, h, d, rng.pick(FACADE_BASES), floors, rng.int(0, 2));
      }
    }
  }

  // ---------- trees, palms, streetlights ----------
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafGeo = new THREE.ConeGeometry(1.8, 4.5, 8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  function addTree(x, z, s) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.2 * s, z);
    trunk.scale.setScalar(s);
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, (2.4 + 2) * s, z);
    leaf.scale.setScalar(s);
    group.add(leaf);
  }
  for (const [bx, bz] of [[4, 2], [7, 7]]) {
    const c = blockCenter(bx, bz);
    for (let i = 0; i < 6; i++) {
      addTree(c.x + rng.range(-15, 15), c.z + rng.range(-15, 15), rng.range(0.8, 1.3));
    }
  }
  for (let i = 0; i < 8; i++) {
    addTree(rng.range(-240, 240), 268 + rng.range(0, 24), rng.range(0.9, 1.4));
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x303035 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 16; i++) {
    const along = -234 + i * 31;
    const x = i % 2 === 0 ? along : -260 + (i % 5) * 52;
    const z = i % 2 === 0 ? -254 : along;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 3.5, z);
    group.add(pole);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 7.1, z);
    group.add(lamp);
  }

  function update(dt, t) {
    oceanTex.offset.y = (t * 0.015) % 1;
    oceanTex.offset.x = (t * 0.008) % 1;
  }

  return {
    group,
    colliders,
    landmarks,
    bounds: { minX: -310, maxX: 310, minZ: -320, maxZ: 344 },
    update,
  };
}
