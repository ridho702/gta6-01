// Solmar Bay — the wanted system. Crimes raise the heat; the heat becomes
// stars; stars bring police cars that chase and ram, and foot cops that try
// to bust the player. Stay clean and out of sight and the heat cools off.

import { RNG, clamp, dist2 } from './util.js';
import { HALF } from './city.js';
import { createCarMesh } from './vehicles.js';
import { Roadblocks } from './airunit.js';

const STAR_HEAT = [0, 25, 55, 95, 140, 190]; // heat needed for each star count

// SBPD unit call signs and their dispatch roles.
const UNIT_NAMES = [
  'Unit 7 — Vega', 'Unit 12 — Rook', 'Unit 3 — Marlowe', 'Unit 21 — Kestrel',
  'Unit 9 — Boone', 'Unit 16 — Sable', 'Unit 5 — Harrow', 'Unit 28 — Pike',
];
const UNIT_ROLES = ['PURSUE', 'RAMMING', 'CLOSING IN', 'ROADBLOCK', 'SPOTLIGHT', 'FLANKING'];

export class Police {
  constructor(scene, THREE, seed) {
    this.scene = scene;
    this.THREE = THREE;
    this.rng = new RNG(seed);
    this.heat = 0;
    this.wanted = 0;
    this.cars = []; // { mesh, pos, angle, speed }
    this.cops = []; // { mesh, pos, angle, bustTimer }
    this._copMeshes = [];
    this.sirenOn = false;
    this._spawnTimer = 0;
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 220);
    this._recalcWanted();
  }

  // Mira — Swap Plates: drop one wanted star (heat falls just below the
  // threshold for the current star count).
  dropStar() {
    if (this.wanted <= 0) return false;
    this.heat = STAR_HEAT[this.wanted] - 1;
    this._recalcWanted();
    return true;
  }

  clear() {
    this.heat = 0;
    this.wanted = 0;
    for (const c of this.cars) this.scene.remove(c.mesh.group);
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cars = [];
    this.cops = [];
  }

  _recalcWanted() {
    let w = 0;
    for (let s = 5; s >= 1; s--) {
      if (this.heat >= STAR_HEAT[s]) {
        w = s;
        break;
      }
    }
    this.wanted = w;
  }

  _makePoliceCarMesh() {
    const { group, wheels } = createCarMesh(this.THREE, 0x1a1a22, false);
    // White doors + light bar on top.
    const doorMat = new this.THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    for (const sx of [-1, 1]) {
      const door = new this.THREE.Mesh(new this.THREE.BoxGeometry(0.06, 0.5, 1.6), doorMat);
      door.position.set(sx * 1.01, 0.55, -0.2);
      group.add(door);
    }
    const barGeo = new this.THREE.BoxGeometry(1.2, 0.18, 0.4);
    const barRed = new this.THREE.Mesh(barGeo, new this.THREE.MeshBasicMaterial({ color: 0xff2020 }));
    barRed.position.set(-0.32, 1.35, -0.2);
    group.add(barRed);
    const barBlue = new this.THREE.Mesh(barGeo, new this.THREE.MeshBasicMaterial({ color: 0x2040ff }));
    barBlue.position.set(0.32, 1.35, -0.2);
    group.add(barBlue);
    return { group, wheels, barRed, barBlue };
  }

  _makeCopMesh() {
    const g = new this.THREE.Group();
    const navy = new this.THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new this.THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const body = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.28, 0.32, 1.0, 8), navy);
    body.position.y = 1.0;
    g.add(body);
    const head = new this.THREE.Mesh(new this.THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.7;
    g.add(head);
    const hat = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
      new this.THREE.MeshLambertMaterial({ color: 0x101828 }),
    );
    hat.position.y = 1.92;
    g.add(hat);
    const legGeo = new this.THREE.BoxGeometry(0.16, 0.7, 0.16);
    const legL = new this.THREE.Mesh(legGeo, navy);
    legL.position.set(-0.13, 0.35, 0);
    g.add(legL);
    const legR = new this.THREE.Mesh(legGeo, navy);
    legR.position.set(0.13, 0.35, 0);
    g.add(legR);
    return { group: g, legL, legR };
  }

  // Spawn one police car at an exact spot (used to stage screenshots).
  spawnCarAt(x, z) {
    const built = this._makePoliceCarMesh();
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const car = { mesh: built, pos: { x, z }, angle: 0, speed: 0 };
    car.unitName = UNIT_NAMES[this.cars.length % UNIT_NAMES.length];
    car.unitRole = UNIT_ROLES[this.cars.length % UNIT_ROLES.length];
    this.cars.push(car);
    return car;
  }

  _spawnPointNear(playerPos, minDist, maxDist) {
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(minDist, maxDist);
      const x = clamp(playerPos.x + Math.sin(a) * d, -HALF + 10, HALF - 10);
      const z = clamp(playerPos.z + Math.cos(a) * d, -HALF + 10, HALF - 10);
      if (dist2(x, z, playerPos.x, playerPos.z) >= minDist) return { x, z };
    }
    return { x: clamp(playerPos.x + 60, -HALF + 10, HALF - 10), z: playerPos.z };
  }

  update(dt, player, city, audio) {
    // Cool off slowly when no crime is happening (checked by the caller
    // through addHeat; here we just decay over time).
    if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 1.6);
      this._recalcWanted();
    }
    const wantCars = this.wanted >= 1 ? Math.min(this.wanted, 4) : 0;
    const wantCops = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    this._spawnTimer -= dt;
    const pp = player.getPos();
    if (this._spawnTimer <= 0) {
      this._spawnTimer = 2.5;
      while (this.cars.length < wantCars) {
        const sp = this._spawnPointNear(pp, 70, 120);
        const built = this._makePoliceCarMesh();
        built.group.position.set(sp.x, 0, sp.z);
        this.scene.add(built.group);
        const car = { mesh: built, pos: sp, angle: 0, speed: 0 };
        car.unitName = UNIT_NAMES[this.cars.length % UNIT_NAMES.length];
        car.unitRole = UNIT_ROLES[this.cars.length % UNIT_ROLES.length];
        this.cars.push(car);
      }
      while (this.cops.length < wantCops) {
        const sp = this._spawnPointNear(pp, 25, 45);
        const mesh = this._makeCopMesh();
        mesh.group.position.set(sp.x, 0, sp.z);
        this.scene.add(mesh.group);
        this.cops.push({ mesh: mesh.group, legs: mesh, pos: sp, angle: 0, bustTimer: 0, phase: 0 });
      }
    }
    // Despawn the extras when the heat drops.
    while (this.cars.length > wantCars) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh.group);
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    // Siren while any police car is active.
    const siren = this.cars.length > 0;
    if (siren !== this.sirenOn) {
      this.sirenOn = siren;
      if (audio) audio.siren(siren);
    }
    // Chase: steer toward the player, ram on contact.
    let busted = false;
    const playerSpeed = player.mode === 'car' ? Math.abs(player.carSpeed || 0) : Math.abs(player.speed || 0);
    for (const car of this.cars) {
      const dx = pp.x - car.pos.x;
      const dz = pp.z - car.pos.z;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const targetSpeed = Math.min(34, 16 + playerSpeed * 0.85 + this.wanted * 1.5);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.8);
      car.pos.x += Math.sin(car.angle) * car.speed * dt;
      car.pos.z += Math.cos(car.angle) * car.speed * dt;
      car.pos.x = clamp(car.pos.x, -HALF - 20, HALF + 20);
      car.pos.z = clamp(car.pos.z, -HALF - 20, 330);
      car.mesh.group.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.group.rotation.y = car.angle;
      // Ram: shove the player and hurt them a little.
      if (d < 4.5) {
        if (player.mode === 'car' && player.car) {
          player.car.speed *= 0.6;
          player.car.pos.x += (dx / d) * -1.2;
          player.car.pos.z += (dz / d) * -1.2;
        } else {
          player.damage(12 * dt);
        }
      }
    }
    // Foot cops: run at the player, bust on close contact.
    for (const cop of this.cops) {
      const dx = pp.x - cop.pos.x;
      const dz = pp.z - cop.pos.z;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
      const targetAngle = Math.atan2(dx, dz);
      cop.angle = targetAngle;
      const speed = player.mode === 'car' ? 0 : 7.5;
      cop.pos.x += Math.sin(cop.angle) * speed * dt;
      cop.pos.z += Math.cos(cop.angle) * speed * dt;
      cop.phase += dt * 9;
      cop.legs.legL.rotation.x = Math.sin(cop.phase) * 0.6;
      cop.legs.legR.rotation.x = -Math.sin(cop.phase) * 0.6;
      cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
      cop.mesh.rotation.y = cop.angle;
      if (d < 1.8 && player.mode === 'foot') {
        cop.bustTimer += dt;
        if (cop.bustTimer > 2) busted = true;
      } else {
        cop.bustTimer = 0;
      }
    }
    // Flash every active car's light bar, red and blue alternating.
    const phase = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of this.cars) {
      if (car.mesh.barRed) car.mesh.barRed.visible = phase;
      if (car.mesh.barBlue) car.mesh.barBlue.visible = !phase;
    }
    return { busted };
  }
}
