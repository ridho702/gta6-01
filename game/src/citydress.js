// citydress.js — static dressing props for Solmar Bay (Sprint 1).
// Adds rooftop props, street props, neon signs and pier string lights to
// city.group. Visual only: no colliders are added. All placement is
// deterministic (seeded RNG), so every load looks the same.
//
// Landmark coordinates/heights are the known ones from the city layout:
// hospital (-182,-182) h18, bank (26,26) h34, garage (182,-130) h9,
// paintShop (-78,78) h8, mall (-130,130) h12, gunShop (-26,78) h8,
// safehouse (-234,182) h7, hangar (-70,-286) h10, pier hut (0,336) h5.
// Roads run at x=-260+i*52 and z=-260+i*52 (i 0..10), width 12.
// Block centres are at -260+b*52+26 (b 0..9).

export function dressCity(THREE, city) {
  const group = city && city.group;
  if (!THREE || !group) return;
  try {
    dress(THREE, group);
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[citydress]', err && err.message ? err.message : err);
    }
  }
}

function dress(THREE, group) {
  // ---------- tiny deterministic RNG (mulberry32) ----------
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(777);

  // ---------- material + mesh helpers ----------
  const matCache = {};
  function lam(color) {
    if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color: color });
    return matCache[color];
  }
  function bas(color) {
    const key = 'b' + color;
    if (!matCache[key]) matCache[key] = new THREE.MeshBasicMaterial({ color: color });
    return matCache[key];
  }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  function cyl(rt, rb, h, color, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), lam(color));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  function sph(r, color, x, y, z, basic) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 8),
      basic ? bas(color) : lam(color)
    );
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // ---------- (a) rooftop props ----------
  function roofAC(x, z, h, dx, dz) {
    box(2.2, 1.0, 1.6, 0x8a8f96, x + dx, h + 0.5, z + dz);
  }
  function antenna(x, z, h, height, dx, dz) {
    const ax = x + (dx || 0);
    const az = z + (dz || 0);
    cyl(0.07, 0.12, height, 0x3a3f45, ax, h + height / 2, az, 6);
    sph(0.3, 0xff2a2a, ax, h + height, az, true);
  }
  function waterTower(x, z, h, dx, dz) {
    const tx = x + dx;
    const tz = z + dz;
    const legH = 2.4;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < corners.length; i++) {
      cyl(0.09, 0.09, legH, 0x4a4238, tx + corners[i][0], h + legH / 2, tz + corners[i][1], 6);
    }
    cyl(1.4, 1.4, 2.6, 0x7a6a55, tx, h + legH + 1.3, tz, 14);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.65, 1.1, 12), lam(0x5d5348));
    cone.position.set(tx, h + legH + 2.6 + 0.55, tz);
    group.add(cone);
  }

  // hospital (-182,-182) h18
  roofAC(-182, -182, 18, -6, -5);
  roofAC(-182, -182, 18, 5, -6);
  roofAC(-182, -182, 18, 0, 6);
  antenna(-182, -182, 18, 7, 7, 6);
  // bank (26,26) h34 — gold tower, water tower + tall antenna
  roofAC(26, 26, 34, -6, -5);
  roofAC(26, 26, 34, 6, 5);
  antenna(26, 26, 34, 9, -7, 6);
  waterTower(26, 26, 34, 5, -6);
  // garage (182,-130) h9
  roofAC(182, -130, 9, -5, -4);
  roofAC(182, -130, 9, 5, 4);
  antenna(182, -130, 9, 4, 6, -5);
  // paintShop (-78,78) h8
  roofAC(-78, 78, 8, 0, -5);
  antenna(-78, 78, 8, 4, 6, 5);
  // mall (-130,130) h12 — water tower + antenna
  roofAC(-130, 130, 12, -6, -5);
  roofAC(-130, 130, 12, 6, -6);
  roofAC(-130, 130, 12, 0, 6);
  waterTower(-130, 130, 12, -5, 5);
  antenna(-130, 130, 12, 5, 7, -5);
  // gunShop (-26,78) h8
  roofAC(-26, 78, 8, -4, 4);
  // safehouse (-234,182) h7
  roofAC(-234, 182, 7, 4, -4);
  antenna(-234, 182, 7, 4, -6, 5);
  // airfield hangar (-70,-286) h10
  roofAC(-70, -286, 10, -5, -4);
  roofAC(-70, -286, 10, 5, 4);
  antenna(-70, -286, 10, 5, 7, 5);
  // pier hut (0,336) h5
  antenna(0, 336, 5, 3, 3, -2);

  // ---------- (b) street props along the avenues ----------
  const roads = [];
  for (let i = 0; i <= 10; i++) roads.push(-260 + i * 52);
  const blockC = [];
  for (let b = 0; b < 10; b++) blockC.push(-260 + b * 52 + 26);

  function hydrant(x, z) {
    cyl(0.28, 0.34, 0.9, 0xc02020, x, 0.45, z, 8);
    sph(0.26, 0xc02020, x, 0.95, z, false);
  }
  // Bench faces the road. Local +z is the sitting direction.
  function bench(x, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.7), lam(0x7a5230));
    seat.position.set(0, 0.55, 0);
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.12), lam(0x7a5230));
    back.position.set(0, 1.0, -0.32);
    g.add(back);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.6), lam(0x3a3f45));
    legL.position.set(-0.9, 0.27, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.6), lam(0x3a3f45));
    legR.position.set(0.9, 0.27, 0);
    g.add(legR);
    group.add(g);
  }
  function dumpster(x, z) {
    box(2.4, 1.4, 1.2, 0x1f4d2e, x, 0.7, z);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.2), lam(0x2a6b3c));
    lid.position.set(x, 1.46, z);
    lid.rotation.y = 0.12;
    group.add(lid);
  }
  function streetProp(kind, x, z, rotY) {
    if (kind === 'hydrant') hydrant(x, z);
    else if (kind === 'bench') bench(x, z, rotY);
    else dumpster(x, z);
  }

  // Vertical avenues (constant x): props sit 8.5 m off the centreline,
  // at block centres along the road. Never on the beach (z > 250).
  for (let ri = 0; ri < roads.length; ri++) {
    const rx = roads[ri];
    const side = rx === -260 ? 1 : rx === 260 ? -1 : rng() < 0.5 ? -1 : 1;
    for (let bi = 0; bi < blockC.length; bi++) {
      const zc = blockC[bi];
      if (zc > 250) continue;
      const r = rng();
      if (r >= 0.17) continue;
      const kind = r < 0.07 ? 'hydrant' : r < 0.13 ? 'bench' : 'dumpster';
      const jz = (rng() - 0.5) * 10;
      streetProp(kind, rx + side * 8.5, zc + jz, -side * Math.PI / 2);
    }
  }
  // Horizontal avenues (constant z): same idea, offset in z.
  for (let ri = 0; ri < roads.length; ri++) {
    const rz = roads[ri];
    if (rz > 250) continue;
    const side = rz === -260 ? 1 : rng() < 0.5 ? -1 : 1;
    for (let bi = 0; bi < blockC.length; bi++) {
      const xc = blockC[bi];
      const r = rng();
      if (r >= 0.17) continue;
      const kind = r < 0.07 ? 'hydrant' : r < 0.13 ? 'bench' : 'dumpster';
      const jx = (rng() - 0.5) * 10;
      streetProp(kind, xc + jx, rz + side * 8.5, side > 0 ? Math.PI : 0);
    }
  }

  // ---------- (c) neon signs (own canvas texture, freestanding boards) ----------
  function neonTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.font = 'bold 62px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 68);
    return new THREE.CanvasTexture(c);
  }
  function neonSign(x, z, y, rotY, text, color) {
    const tex = neonTexture(text, color);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    group.add(sign);
    // Two poles under the ends of the board.
    const alongZ = Math.abs(Math.sin(rotY)) > 0.5;
    for (let s = -1; s <= 1; s += 2) {
      const px = alongZ ? x : x + s * 3.8;
      const pz = alongZ ? z + s * 3.8 : z;
      cyl(0.09, 0.09, y - 1.1, 0x3a3f45, px, (y - 1.1) / 2, pz, 6);
    }
  }
  // Mall east face, toward avenue x=-104.
  neonSign(-113, 130, 5.5, Math.PI / 2, 'LIQUOR', '#ff4fd8');
  // Bank south face, toward avenue z=52.
  neonSign(26, 43, 7, 0, 'PIZZA', '#ff8c1a');
  // Paint shop west face, toward avenue x=-104.
  neonSign(-95, 78, 5, -Math.PI / 2, '24H MOTEL', '#2ee6ff');
  // Gun shop east face, toward avenue x=0.
  neonSign(-9, 78, 5, Math.PI / 2, 'BAR', '#ff3355');

  // ---------- (d) string lights along the pier deck ----------
  // Deck runs z ~300..342 at x ~0; two rows of warm bulbs at x=+/-5.5.
  for (let s = -1; s <= 1; s += 2) {
    const lx = s * 5.5;
    const postZ = [302, 316, 330, 342];
    for (let i = 0; i < postZ.length; i++) {
      cyl(0.09, 0.09, 3.4, 0x3a3f45, lx, 1.7, postZ[i], 6);
    }
    for (let z = 304; z <= 340; z += 4) {
      sph(0.16, 0xffc06a, lx, 3.3, z, true);
    }
  }
}
