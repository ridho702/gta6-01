// Solmar Bay — pedestrians. They stroll the sidewalks, turn at
// intersections, and flee from danger (gunfire, a speeding car). A
// pedestrian run over by a fast car is knocked down for a while and counts
// as a crime for the wanted system.

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
    const g = new this.THREE.Group();
    const body = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(0.26, 0.3, 0.95, 8),
      new this.THREE.MeshLambertMaterial({ color: shirt }),
    );
    body.position.y = 0.95;
    g.add(body);
    const head = new this.THREE.Mesh(
      new this.THREE.SphereGeometry(0.26, 10, 8),
      new this.THREE.MeshLambertMaterial({ color: skin }),
    );
    head.position.y = 1.62;
    g.add(head);
    const legMat = new this.THREE.MeshLambertMaterial({ color: 0x2a2c34 });
    const legGeo = new this.THREE.BoxGeometry(0.16, 0.7, 0.16);
    const legL = new this.THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.35, 0);
    g.add(legL);
    const legR = new this.THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.35, 0);
    g.add(legR);
    return { group: g, legL, legR, head };
  }

  _spawn() {
    for (let i = 0; i < 26; i++) {
      const street = this.rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const line = -HALF + street * PITCH;
      const along = this.rng.range(-HALF + 10, HALF - 10);
      const axis = this.rng.pick(['x', 'z']);
      const mesh = this._makeMesh(this.rng.pick(SHIRTS), this.rng.pick(SKINS));
      this.scene.add(mesh.group);
      this.list.push({
        mesh,
        pos: axis === 'x' ? { x: along, z: line + this.rng.pick([-7.5, 7.5]) } : { x: line + this.rng.pick([-7.5, 7.5]), z: along },
        axis,
        dir: this.rng.pick([-1, 1]),
        speed: this.rng.range(1.1, 2.0),
        phase: this.rng.range(0, Math.PI * 2),
        flee: 0,
        down: 0,
      });
    }
  }

  // Returns the number of pedestrians newly knocked down by a fast car.
  checkCarHit(carPos, carSpeed) {
    let hits = 0;
    if (carSpeed < 5) return 0;
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
    for (const p of this.list) {
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0) {
          p.mesh.group.rotation.z = 0;
          p.mesh.group.position.y = 0;
          p.flee = 2;
        }
        continue;
      }
      let speed = p.speed;
      let mx = 0;
      let mz = 0;
      // Flee from danger.
      if (dangerPos && dist2(p.pos.x, p.pos.z, dangerPos.x, dangerPos.z) < 14) {
        p.flee = 2;
      }
      if (p.flee > 0) {
        p.flee -= dt;
        speed = 4.2;
        const dx = p.pos.x - (dangerPos ? dangerPos.x : playerPos.x);
        const dz = p.pos.z - (dangerPos ? dangerPos.z : playerPos.z);
        const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
        mx = dx / d;
        mz = dz / d;
      } else if (p.axis === 'x') {
        mx = p.dir;
      } else {
        mz = p.dir;
      }
      p.pos.x += mx * speed * dt;
      p.pos.z += mz * speed * dt;
      // Turn at intersections or city edge.
      if (p.flee <= 0) {
        const nearLine = (v) => {
          for (let i = 0; i <= 10; i++) {
            if (Math.abs(v - (-HALF + i * PITCH)) < 2) return true;
          }
          return false;
        };
        if (p.axis === 'x' && nearLine(p.pos.z) && this.rng.chance(dt * 0.5)) {
          p.axis = 'z';
          p.dir = this.rng.pick([-1, 1]);
          p.pos.z = Math.round((p.pos.z + HALF) / PITCH) * PITCH - HALF + this.rng.pick([-7.5, 7.5]);
        } else if (p.axis === 'z' && nearLine(p.pos.x) && this.rng.chance(dt * 0.5)) {
          p.axis = 'x';
          p.dir = this.rng.pick([-1, 1]);
          p.pos.x = Math.round((p.pos.x + HALF) / PITCH) * PITCH - HALF + this.rng.pick([-7.5, 7.5]);
        }
        if (p.pos.x < -HALF + 4 || p.pos.x > HALF - 4) p.dir = p.axis === 'x' ? -p.dir : p.dir;
        if (p.pos.z < -HALF + 4 || p.pos.z > HALF - 4) p.dir = p.axis === 'z' ? -p.dir : p.dir;
        p.pos.x = clamp(p.pos.x, -HALF + 2, HALF - 2);
        p.pos.z = clamp(p.pos.z, -HALF + 2, 312);
      }
      // Animate walk + face movement direction.
      p.phase += dt * speed * 3.2;
      const swing = Math.sin(p.phase) * 0.55;
      p.mesh.legL.rotation.x = swing;
      p.mesh.legR.rotation.x = -swing;
      p.mesh.group.position.set(p.pos.x, p.mesh.group.position.y, p.pos.z);
      const heading = Math.atan2(mx, mz);
      if (mx !== 0 || mz !== 0) {
        let d = heading - p.mesh.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        p.mesh.group.rotation.y += d * Math.min(1, dt * 8);
      }
    }
  }
}
