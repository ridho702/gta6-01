import { RNG, clamp } from './util.js';

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
    this.tracers = [];
    this.bursts = [];
    this.enemies = [];
    this._flashes = [];
    this._flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  }

  shoot(origin, dir, maxDist, targets, damage) {
    const dmg = damage || 34;
    let wallDist = maxDist;
    for (const c of this.colliders) {
      const t = rayBox(origin, dir, c);
      if (t < wallDist) wallDist = t;
    }
    let best = null;
    let bestDist = wallDist;
    for (const t of targets) {
      if (!t.alive) continue;
      const ox = t.pos.x - origin.x;
      const oy = t.pos.y - origin.y;
      const oz = t.pos.z - origin.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0 || along > bestDist) continue;
      const cx = origin.x + dir.x * along;
      const cy = origin.y + dir.y * along;
      const cz = origin.z + dir.z * along;
      const ddx = t.pos.x - cx;
      const ddy = t.pos.y - cy;
      const ddz = t.pos.z - cz;
      const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
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
    const THREE = this.THREE;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      a.x, a.y, a.z,
      b.x, b.y, b.z,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _burst(p) {
    const THREE = this.THREE;
    const n = 8;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    const vel = [];
    for (let i = 0; i < n; i++) {
      vel.push({
        x: this.rng.range(-3, 3),
        y: this.rng.range(0, 4),
        z: this.rng.range(-3, 3),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffc040, size: 0.35, transparent: true, opacity: 1 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0.45 });
  }

  spawnEnemy(x, z) {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const jacketMat = new THREE.MeshLambertMaterial({ color: 0x9a3030, emissive: 0x2a0d0d });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3a48 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.0, 8), jacketMat);
    body.position.y = 1.0;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skinMat);
    head.position.y = 1.72;
    g.add(head);
    const headband = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.1, 0.62),
      new THREE.MeshBasicMaterial({ color: 0xd02020 })
    );
    headband.position.y = 1.86;
    g.add(headband);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
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
    for (const e of this.enemies) {
      this.scene.remove(e.mesh);
    }
    this.enemies = [];
  }

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
        let dir = {
          x: dx / d + spread,
          y: (1.2 - 1.4) / d,
          z: dz / d + spread,
        };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
        const end = {
          x: from.x + dir.x * d,
          y: 1.2,
          z: from.z + dir.z * d,
        };
        this._tracer(from, end);
        const flash = new this.THREE.Mesh(
          new this.THREE.SphereGeometry(0.18, 8, 6),
          this._flashMat
        );
        flash.position.set(
          from.x + (dx / d) * 0.7,
          1.4,
          from.z + (dz / d) * 0.7
        );
        this.scene.add(flash);
        this._flashes.push({ mesh: flash, life: 0.06 });
        if (audio) audio.enemyShot();
        if (this.rng.chance(0.34)) onPlayerHit(this.rng.range(8, 14));
      }
    }
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      const f = this._flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        this._flashes.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.09) * 0.9;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
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
