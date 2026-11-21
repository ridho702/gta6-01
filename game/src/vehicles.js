import { RNG, dist2 } from './util.js';
import { PITCH, HALF, blockCenter } from './city.js';
import { CAR_NAMES } from './progress.js';

const TRAFFIC_COLORS = [0xc0c0c8, 0x30343c, 0x8a2020, 0x205a8a, 0xc0a030, 0x3a6a3a, 0x707880, 0x904a70];

const STREET_LINES = [];
for (let i = 0; i <= 10; i++) STREET_LINES.push(-HALF + i * PITCH);

export function createCarMesh(THREE, color, sport) {
  const group = new THREE.Group();
  const bodyH = sport ? 0.55 : 0.7;
  const bodyY = sport ? 0.45 : 0.55;
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, 4.4), bodyMat);
  body.position.set(0, bodyY, 0);
  group.add(body);

  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), cabinMat);
  cabin.position.set(0, bodyY + bodyH / 2 + 0.3, -0.2);
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 2.0), bodyMat);
  roof.position.set(0, bodyY + bodyH / 2 + 0.62, -0.2);
  group.add(roof);

  if (sport) {
    const spoilerMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.4), spoilerMat);
    spoiler.position.set(0, bodyY + bodyH / 2 + 0.25, -2.1);
    group.add(spoiler);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
  const wheels = [];
  for (const wx of [-0.95, 0.95]) {
    for (const wz of [-1.45, 1.45]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd02020 });
  for (const lx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    head.position.set(lx, bodyY, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), tailMat);
    tail.position.set(lx, bodyY, -2.22);
    group.add(tail);
  }

  return { group, wheels, bodyMat };
}

export class Traffic {
  constructor(scene, THREE, seed) {
    this.scene = scene;
    this.THREE = THREE;
    this.rng = new RNG(seed);
    this.cars = [];
    this.parked = [];
    this._spawnTraffic();
    this._spawnParked();
  }

  _randomIntersection() {
    return { x: this.rng.pick(STREET_LINES), z: this.rng.pick(STREET_LINES) };
  }

  _spawnTraffic() {
    for (let i = 0; i < 14; i++) {
      const color = this.rng.pick(TRAFFIC_COLORS);
      const { group } = createCarMesh(this.THREE, color, false);
      this.scene.add(group);
      const from = this._randomIntersection();
      const to = this._randomIntersection();
      this.cars.push({
        mesh: group,
        pos: { x: from.x, z: from.z },
        angle: 0,
        speed: this.rng.range(8, 13),
        target: to,
        wait: 0,
        name: this.rng.pick(CAR_NAMES.sedan),
        condition: this.rng.int(60, 100),
      });
    }
  }

  _spawnParked() {
    const spots = [];
    const sportSpot = blockCenter(6, 3);
    spots.push({ x: sportSpot.x + 8, z: sportSpot.z - 18, sport: true, name: 'Comet GT' });
    const dockSpot = blockCenter(9, 3);
    spots.push({ x: dockSpot.x - 6, z: dockSpot.z + 21.5, sport: true, name: 'Solstice S', collector: true });
    for (let i = 0; i < 10; i++) {
      const bx = this.rng.int(0, 9);
      const bz = this.rng.int(0, 9);
      const c = blockCenter(bx, bz);
      const side = this.rng.pick([-1, 1]);
      spots.push({
        x: c.x + side * this.rng.range(6, 18),
        z: c.z + this.rng.pick([-1, 1]) * 21.5,
        sport: false,
        name: this.rng.pick(CAR_NAMES.sedan),
      });
    }
    for (const spot of spots) {
      const { x, z, sport, name, collector } = spot;
      const color = sport ? 0xd02030 : this.rng.pick(TRAFFIC_COLORS);
      const { group } = createCarMesh(this.THREE, color, sport);
      const angle = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      group.position.set(x, 0, z);
      group.rotation.y = angle;
      this.scene.add(group);
      this.parked.push({
        mesh: group,
        pos: { x, z },
        angle,
        taken: false,
        sport,
        color,
        name,
        collector: !!collector,
        condition: this.rng.int(70, 100),
      });
    }
  }

  nearestParked(pos, maxDist) {
    if (!Number.isFinite(maxDist)) maxDist = 30;
    let best = null;
    let bestD = maxDist;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = dist2(pos.x, pos.z, p.pos.x, p.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  takeParked(p) {
    p.taken = true;
    this.scene.remove(p.mesh);
  }

  update(dt, playerCarPos) {
    for (const car of this.cars) {
      if (car.wait > 0) {
        car.wait -= dt;
        continue;
      }
      const dx = car.target.x - car.pos.x;
      const dz = car.target.z - car.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.5) {
        const options = [];
        if (car.target.x + PITCH <= HALF) options.push({ x: car.target.x + PITCH, z: car.target.z });
        if (car.target.x - PITCH >= -HALF) options.push({ x: car.target.x - PITCH, z: car.target.z });
        if (car.target.z + PITCH <= HALF) options.push({ x: car.target.x, z: car.target.z + PITCH });
        if (car.target.z - PITCH >= -HALF) options.push({ x: car.target.x, z: car.target.z - PITCH });
        if (options.length > 0) car.target = this.rng.pick(options);
        car.wait = this.rng.chance(0.4) ? this.rng.range(0.5, 2) : 0;
        continue;
      }
      let speed = car.speed;
      const fx = Math.sin(car.angle);
      const fz = Math.cos(car.angle);
      for (const other of this.cars) {
        if (other === car) continue;
        const od = dist2(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
        if (od < 9 && od > 0) {
          const ox = (other.pos.x - car.pos.x) / od;
          const oz = (other.pos.z - car.pos.z) / od;
          if (fx * ox + fz * oz > 0.85) {
            speed = Math.min(speed, 3);
            break;
          }
        }
      }
      if (playerCarPos && dist2(car.pos.x, car.pos.z, playerCarPos.x, playerCarPos.z) < 7) {
        speed = 0;
      }
      const step = speed * dt;
      car.pos.x += (dx / d) * step;
      car.pos.z += (dz / d) * step;
      car.angle = Math.atan2(dx, dz);
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.angle;
      for (const child of car.mesh.children) {
        if (child.geometry && child.geometry.parameters && child.geometry.parameters.radiusTop === 0.36) {
          child.rotation.x += speed * dt / 0.36;
        }
      }
    }
  }
}
