// Solmar Bay — pedestrians: sidewalk walkers who stroll the street grid,
// flee from danger, and get knocked down by a speeding car.

import { RNG, clamp, dist2 } from './util.js';
import { PITCH, HALF } from './city.js';

const SHIRTS = [0xc05050, 0x5080c0, 0x50a050, 0xc0a050, 0x8050a0, 0x909090, 0xd0d0d0];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a30, 0xf0c8a0];

export class Pedestrians {
  constructor(scene, THREE, seed) {
    this.scene = scene;
    this.THREE = THREE;
    this.rng = new RNG(seed);
    this.list = [];
    this._spawn();
  }

  _makeMesh(shirt, skin) {
    const THREE = this.THREE;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.95, 8),
      new THREE.MeshLambertMaterial({ color: shirt }),
    );
    body.position.y = 0.95;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshLambertMaterial({ color: skin }),
    );
    head.position.y = 1.62;
    group.add(head);

    const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2c34 });
    const legGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.35, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.35, 0);
    group.add(legR);

    return { group, legL, legR, head };
  }

  _spawn() {
    for (let i = 0; i < 26; i++) {
      const street = this.rng.int(0, 10);
      const line = -HALF + street * PITCH;
      const along = this.rng.range(-HALF + 10, HALF - 10);
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const offset = this.rng.range(-7.5, 7.5);
      const pos =
        axis === 'x'
          ? { x: along, z: line + offset }
          : { x: line + offset, z: along };
      const mesh = this._makeMesh(this.rng.pick(SHIRTS), this.rng.pick(SKINS));
      mesh.group.position.set(pos.x, 0, pos.z);
      this.scene.add(mesh.group);
      this.list.push({
        mesh,
        pos,
        axis,
        dir: this.rng.chance(0.5) ? 1 : -1,
        speed: this.rng.range(1.1, 2.0),
        phase: this.rng.range(0, Math.PI * 2),
        flee: 0,
        down: 0,
      });
    }
  }

  checkCarHit(carPos, carSpeed) {
    if (carSpeed < 5) return 0;
    let hits = 0;
    for (const p of this.list) {
      if (p.down > 0) continue;
      if (dist2(p.pos.x, p.pos.z, carPos.x, carPos.z) < 1.8) {
        p.down = 5;
        p.mesh.group.rotation.z = Math.PI / 2;
        p.mesh.group.position.y = 0.3;
        hits++;
      }
    }
    return hits;
  }

  update(dt, playerPos, dangerPos) {
    const nearLine = (v) => {
      for (let i = 0; i <= 10; i++) {
        if (Math.abs(v - (-HALF + i * PITCH)) < 2) return true;
      }
      return false;
    };

    for (const p of this.list) {
      // Knocked down: lie still, then get back up and flee.
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0) {
          p.mesh.group.rotation.z = 0;
          p.mesh.group.position.y = 0;
          p.flee = 2;
        }
        continue;
      }

      // Run from danger.
      if (dangerPos && dist2(p.pos.x, p.pos.z, dangerPos.x, dangerPos.z) < 14) {
        p.flee = 2;
      }

      let mx = 0;
      let mz = 0;
      let speed = p.speed;
      const fleeing = p.flee > 0;
      if (fleeing) {
        p.flee -= dt;
        speed = 4.2;
        const from = dangerPos || playerPos;
        if (from) {
          const dx = p.pos.x - from.x;
          const dz = p.pos.z - from.z;
          const len = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
          mx = dx / len;
          mz = dz / len;
        }
      } else if (p.axis === 'x') {
        mx = p.dir;
      } else {
        mz = p.dir;
      }

      p.pos.x += mx * speed * dt;
      p.pos.z += mz * speed * dt;

      // Turn at intersections (only while strolling, not while fleeing).
      if (!fleeing) {
        if (p.axis === 'x' && nearLine(p.pos.z) && this.rng.chance(dt * 0.5)) {
          p.axis = 'z';
          p.dir = this.rng.chance(0.5) ? 1 : -1;
          const offset = this.rng.range(-7.5, 7.5);
          p.pos.z = Math.round((p.pos.z + HALF) / PITCH) * PITCH - HALF + offset;
        } else if (p.axis === 'z' && nearLine(p.pos.x) && this.rng.chance(dt * 0.5)) {
          p.axis = 'x';
          p.dir = this.rng.chance(0.5) ? 1 : -1;
          const offset = this.rng.range(-7.5, 7.5);
          p.pos.x = Math.round((p.pos.x + HALF) / PITCH) * PITCH - HALF + offset;
        }
      }

      // City edges: turn around.
      if (p.pos.x < -HALF + 4 || p.pos.x > HALF - 4) {
        if (p.axis === 'x') p.dir = -p.dir;
      }
      if (p.pos.z < -HALF + 4 || p.pos.z > HALF - 4) {
        if (p.axis === 'z') p.dir = -p.dir;
      }
      p.pos.x = clamp(p.pos.x, -HALF + 2, HALF - 2);
      // Upper z bound is 312, not HALF - 2: the beach road sits at z ~ 296
      // and pedestrians must be able to stand there.
      p.pos.z = clamp(p.pos.z, -HALF + 2, 312);

      // Walk animation.
      p.phase += dt * speed * 3.2;
      const swing = Math.sin(p.phase) * 0.55;
      p.mesh.legL.rotation.x = swing;
      p.mesh.legR.rotation.x = -swing;
      p.mesh.group.position.set(p.pos.x, p.mesh.group.position.y, p.pos.z);

      // Face the direction of travel (shortest-angle interpolation).
      const heading = Math.atan2(mx, mz);
      if (mx !== 0 || mz !== 0) {
        let d = (heading - p.mesh.group.rotation.y) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d <= -Math.PI) d += Math.PI * 2;
        p.mesh.group.rotation.y += d * Math.min(1, dt * 8);
      }
    }
  }
}
