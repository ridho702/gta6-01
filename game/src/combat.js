// Solmar Bay — combat. Hitscan pistol fire with tracers and impact bursts,
// fist punches, and the mission enemies (the Vultures) who shoot back.
// Shots are blocked by buildings (ray vs AABB), so cover matters.

import { RNG, clamp } from './util.js';

// Ray vs axis-aligned box (slab test). Returns the distance along the ray
// to the first hit, or Infinity when the ray misses the box.
function rayBox(o, d, c) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [o.x, d.x, c.x0, c.x1],
    [o.y, d.y, 0, 60],
    [o.z, d.z, c.z0, c.z1],
  ];
  for (const [oo, dd, lo, hi] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return Infinity;
    } else {
      let t1 = (lo - oo) / dd;
      let t2 = (hi - oo) / dd;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export class Combat {
  constructor(scene, THREE, colliders) {
    this.scene = scene;
    this.THREE = THREE;
    this.colliders = colliders;
    this.rng = new RNG(4242);
    this.tracers = []; // { line, life }
    this.bursts = []; // { points, vel, life }
    this.enemies = [];
    this._flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  }

  // Fire a hitscan shot. targets are { pos:{x,y,z}, radius, health, onHit }.
  // Returns { hit, point, target, dist }. Damage is per-weapon (the
  // shotgun calls this once per pellet).
  shoot(origin, dir, maxDist, targets, damage) {
    const dmg = damage || 34;
    // Nearest wall hit caps the range.
    let wallDist = maxDist;
    for (const c of this.colliders) {
      const t = rayBox(origin, dir, c);
      if (t < wallDist) wallDist = t;
    }
    let best = null;
    let bestDist = wallDist;
    for (const t of targets) {
      if (!t.alive) continue;
      // Sphere test: distance from the ray to the target centre.
      const ox = t.pos.x - origin.x;
      const oy = t.pos.y - origin.y;
      const oz = t.pos.z - origin.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0 || along > bestDist) continue;
      const cx = origin.x + dir.x * along;
      const cy = origin.y + dir.y * along;
      const cz = origin.z + dir.z * along;
      const dd = Math.sqrt((t.pos.x - cx) ** 2 + (t.pos.y - cy) ** 2 + (t.pos.z - cz) ** 2);
      if (dd < t.radius + 0.4 && along < bestDist) {
        bestDist = along;
        best = t;
      }
    }
    const end = {
      x: origin.x + dir.x * bestDist,
      y: origin.y + dir.y * bestDist,
      z: origin.z + dir.z * bestDist,
    };
    this._tracer(origin, end);
    this._burst(end);
    if (best) {
      best.health -= dmg;
      if (best.health <= 0) {
        best.alive = false;
        best.mesh.visible = false;
      }
      if (best.onHit) best.onHit(best);
    }
    return { hit: best, point: end, target: best, dist: bestDist };
  }

  // Melee punch: nearest living target within range and in front takes 25.
  punch(origin, dir, targets) {
    let best = null;
    let bestD = 2.4;
    for (const t of targets) {
      if (!t.alive) continue;
      const dx = t.pos.x - origin.x;
      const dz = t.pos.z - origin.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD && (dx * dir.x + dz * dir.z) / Math.max(0.01, d) > 0.3) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      best.health -= 25;
      if (best.health <= 0) {
        best.alive = false;
        best.mesh.visible = false;
      }
      if (best.onHit) best.onHit(best);
    }
    return best;
  }

  _tracer(a, b) {
    const geo = new this.THREE.BufferGeometry().setFromPoints([
      new this.THREE.Vector3(a.x, a.y, a.z),
      new this.THREE.Vector3(b.x, b.y, b.z),
    ]);
    const line = new this.THREE.Line(
      geo,
      new this.THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _burst(p) {
    const n = 8;
    const positions = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      vel.push({
        x: this.rng.range(-3, 3),
        y: this.rng.range(0, 4),
        z: this.rng.range(-3, 3),
      });
    }
    const geo = new this.THREE.BufferGeometry();
    geo.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));
    const points = new this.THREE.Points(
      geo,
      new this.THREE.PointsMaterial({ color: 0xffc040, size: 0.35, transparent: true, opacity: 1 }),
    );
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0.45 });
  }

  spawnEnemy(x, z) {
    const g = new this.THREE.Group();
    const jacket = new this.THREE.MeshLambertMaterial({ color: 0x5a1a1a });
    const pants = new this.THREE.MeshLambertMaterial({ color: 0x1c1c22 });
    const skin = new this.THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const body = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.3, 0.34, 1.0, 8), jacket);
    body.position.y = 1.0;
    g.add(body);
    const head = new this.THREE.Mesh(new this.THREE.SphereGeometry(0.27, 10, 8), skin);
    head.position.y = 1.72;
    g.add(head);
    const band = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(0.56, 0.1, 0.56),
      new this.THREE.MeshBasicMaterial({ color: 0xd02020 }),
    );
    band.position.y = 1.86;
    g.add(band);
    const gun = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(0.08, 0.12, 0.4),
      new this.THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    gun.position.set(0.4, 1.05, 0.3);
    g.add(gun);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const enemy = {
      mesh: g,
      pos: { x, y: 1.2, z },
      radius: 0.9,
      health: 100,
      alive: true,
      shootCd: this.rng.range(0.8, 2.0),
      onHit: null,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  livingEnemies() {
    return this.enemies.filter((e) => e.alive);
  }

  allDead() {
    return this.enemies.length > 0 && this.enemies.every((e) => !e.alive);
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  // Enemies shoot back at the player. onPlayerHit(dmg) is called on a hit.
  update(dt, playerPos, onPlayerHit, audio) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = playerPos.x - e.pos.x;
      const dz = playerPos.z - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.shootCd -= dt;
      if (d < 34 && e.shootCd <= 0) {
        e.shootCd = this.rng.range(1.1, 2.1);
        const from = { x: e.pos.x, y: 1.4, z: e.pos.z };
        const spread = this.rng.range(-0.06, 0.06);
        const dir = {
          x: dx / d + spread,
          y: (1.2 - 1.4) / d,
          z: dz / d + spread,
        };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        dir.x /= len;
        dir.y /= len;
        dir.z /= len;
        const end = { x: from.x + dir.x * d, y: 1.2, z: from.z + dir.z * d };
        this._tracer(from, end);
        if (audio) audio.enemyShot();
        if (this.rng.chance(0.34)) onPlayerHit(this.rng.range(8, 14));
      }
    }
    // Fade tracers and bursts.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const attr = b.points.geometry.getAttribute('position');
      for (let j = 0; j < b.vel.length; j++) {
        attr.array[j * 3] += b.vel[j].x * dt;
        attr.array[j * 3 + 1] += b.vel[j].y * dt;
        attr.array[j * 3 + 2] += b.vel[j].z * dt;
        b.vel[j].y -= 9 * dt;
      }
      attr.needsUpdate = true;
      b.points.material.opacity = clamp(b.life / 0.45, 0, 1);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
