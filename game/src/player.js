// Solmar Bay — the player. On foot: a third-person walker with a pistol
// and fists. In a car: arcade driving (accelerate, brake, steer,
// handbrake drift). E enters/exits the nearest car. The player owns health
// and cash; damage, healing and pickups flow through here.

import { clamp, lerpAngle } from './util.js';
import { resolveCircle, isInWater, HALF } from './city.js';
import { createCarMesh } from './vehicles.js';

const WALK_SPEED = 6;
const SPRINT_SPEED = 10;
const CAR_MAX_SPEED = 38;
const CAR_ACCEL = 16;
const CAR_BRAKE = 30;

export class Player {
  constructor(scene, THREE, startPos) {
    this.scene = scene;
    this.THREE = THREE;
    this.pos = { x: startPos.x, y: 0, z: startPos.z };
    this.angle = Math.PI; // facing north (+z is south, so face the city)
    this.health = 100;
    this.cash = 250;
    this.mode = 'foot';
    this.car = null; // { mesh, pos, angle, speed, steering, sport }
    this.speed = 0; // on-foot speed
    this.carSpeed = 0;
    this.ammo = 48;
    this._buildMesh();
  }

  _buildMesh() {
    const g = new this.THREE.Group();
    const shirt = new this.THREE.MeshLambertMaterial({ color: 0x3a7ac0 });
    const pants = new this.THREE.MeshLambertMaterial({ color: 0x2a2c34 });
    const skin = new this.THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const body = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.3, 0.34, 1.0, 10), shirt);
    body.position.y = 1.0;
    g.add(body);
    const head = new this.THREE.Mesh(new this.THREE.SphereGeometry(0.28, 12, 10), skin);
    head.position.y = 1.75;
    g.add(head);
    const cap = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(0.29, 0.29, 0.12, 12),
      new this.THREE.MeshLambertMaterial({ color: 0xc02020 }),
    );
    cap.position.y = 1.95;
    g.add(cap);
    const legGeo = new this.THREE.BoxGeometry(0.18, 0.75, 0.18);
    this.legL = new this.THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.15, 0.38, 0);
    g.add(this.legL);
    this.legR = new this.THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.15, 0.38, 0);
    g.add(this.legR);
    // Pistol in the right hand (visible while on foot).
    this.gun = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(0.08, 0.14, 0.34),
      new this.THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    this.gun.position.set(0.42, 1.05, 0.3);
    g.add(this.gun);
    g.position.set(this.pos.x, 0, this.pos.z);
    this.mesh = g;
    this.scene.add(g);
  }

  getPos() {
    return this.mode === 'car' && this.car ? this.car.pos : this.pos;
  }

  // Direction the player is facing, as an (x, z) unit vector.
  facing() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  heal(n) {
    this.health = clamp(this.health + n, 0, 100);
  }

  damage(n) {
    if (this.progress) n = this.progress.absorbDamage(n);
    this.health = clamp(this.health - n, 0, 100);
    return this.health <= 0;
  }

  enterCar(parked) {
    // Build a drivable car from the parked car's data, then remove the
    // parked mesh it replaces.
    const { group } = createCarMesh(this.THREE, parked.color ?? 0xd02030, parked.sport);
    group.position.set(parked.pos.x, 0, parked.pos.z);
    group.rotation.y = parked.angle;
    this.scene.add(group);
    this.scene.remove(parked.mesh);
    parked.taken = true;
    this.car = {
      mesh: group,
      pos: { x: parked.pos.x, z: parked.pos.z },
      angle: parked.angle,
      speed: 0,
      steering: 0,
      sport: parked.sport,
      wheels: [],
      name: parked.name || 'Meridian LX',
      condition: parked.condition ?? 100,
      smoking: (parked.condition ?? 100) < 35,
    };
    // Collect the wheel meshes for spin animation.
    for (const child of group.children) {
      const p = child.geometry && child.geometry.parameters;
      if (p && p.radiusTop === 0.36) this.car.wheels.push(child);
    }
    this.mode = 'car';
    this.mesh.visible = false;
    return this.car;
  }

  // The starter car Marlow lends the player (mission 1).
  spawnStarterCar(x, z, angle) {
    const { group } = createCarMesh(this.THREE, 0x2a6ab0, false);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    this.scene.add(group);
    return { mesh: group, pos: { x, z }, angle, taken: false, sport: false, starter: true, color: 0x2a6ab0, name: 'Meridian LX', condition: 100 };
  }

  exitCar() {
    if (!this.car) return;
    const side = { x: Math.cos(this.car.angle), z: -Math.sin(this.car.angle) };
    this.pos.x = this.car.pos.x + side.x * 2.5;
    this.pos.z = this.car.pos.z + side.z * 2.5;
    this.angle = this.car.angle;
    this.mode = 'foot';
    this.mesh.visible = true;
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.angle;
    // Leave the car parked where it stopped.
    this.car = null;
  }

  _drive(dt, input, colliders, trafficCars) {
    const car = this.car;
    const fwd = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('Space');
    if (fwd) car.speed += CAR_ACCEL * dt;
    if (back) car.speed -= (car.speed > 0.5 ? CAR_BRAKE : CAR_ACCEL * 0.6) * dt;
    if (!fwd && !back) {
      // Engine braking + rolling resistance.
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    }
    const maxSpeed = (car.sport ? CAR_MAX_SPEED * 1.25 : CAR_MAX_SPEED) * (1 + 0.08 * (this.progress ? this.progress.tune : 0));
    car.speed = clamp(car.speed, -10, maxSpeed);
    const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    car.steering += (steerTarget - car.steering) * Math.min(1, dt * 6);
    const grip = handbrake ? 0.45 : 1;
    const turnRate = 1.9 * grip * clamp(Math.abs(car.speed) / 10, 0, 1);
    car.angle += car.steering * turnRate * Math.sign(car.speed) * dt;
    if (handbrake) car.speed *= Math.max(0, 1 - 0.9 * dt);
    const nx = car.pos.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.angle) * car.speed * dt;
    const p = { x: nx, z: nz };
    resolveCircle(p, 2.1, colliders);
    // Scraping a wall at speed damages the car.
    if ((p.x !== nx || p.z !== nz) && Math.abs(car.speed) > 8) {
      car.condition = Math.max(0, car.condition - 1.5);
      if (car.condition < 35) car.smoking = true;
    }
    // Bounce off traffic cars.
    for (const other of trafficCars) {
      const dx = p.x - other.pos.x;
      const dz = p.z - other.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 4.2 && d > 0.01) {
        p.x = other.pos.x + (dx / d) * 4.2;
        p.z = other.pos.z + (dz / d) * 4.2;
        if (Math.abs(car.speed) > 6) {
          car.condition = Math.max(0, car.condition - 2);
          if (car.condition < 35) car.smoking = true;
        }
        car.speed *= 0.5;
      }
    }
    // Stay out of the sea and inside the world.
    if (isInWater(p.x, p.z)) {
      p.x = car.pos.x;
      p.z = car.pos.z;
      car.speed *= -0.3;
    }
    p.x = clamp(p.x, -HALF - 40, HALF + 40);
    p.z = clamp(p.z, -HALF - 50, 330);
    car.pos.x = p.x;
    car.pos.z = p.z;
    car.mesh.position.set(p.x, 0, p.z);
    car.mesh.rotation.y = car.angle;
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    this.carSpeed = car.speed;
    return car;
  }

  _walk(dt, input, colliders, camYaw) {
    let ix = 0;
    let iz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    const len = Math.sqrt(ix * ix + iz * iz);
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    if (len > 0) {
      ix /= len;
      iz /= len;
      // Camera-relative movement. The camera sits at player +
      // (sin camYaw, cos camYaw) * dist, so its forward is
      // (-sin camYaw, -cos camYaw) and its right is (cos camYaw, -sin camYaw).
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = ix * cos + iz * sin;
      const wz = -ix * sin + iz * cos;
      const targetAngle = Math.atan2(wx, wz);
      this.angle = lerpAngle(this.angle, targetAngle, Math.min(1, dt * 10));
      const nx = this.pos.x + wx * speed * dt;
      const nz = this.pos.z + wz * speed * dt;
      const p = { x: nx, z: nz };
      resolveCircle(p, 0.5, colliders);
      if (!isInWater(p.x, p.z)) {
        this.pos.x = clamp(p.x, -HALF - 40, HALF + 40);
        this.pos.z = clamp(p.z, -HALF - 50, 340);
      }
      this.speed = speed;
      // Walk-cycle leg swing.
      const phase = performance.now() * 0.012 * (sprint ? 1.5 : 1);
      this.legL.rotation.x = Math.sin(phase) * 0.6;
      this.legR.rotation.x = -Math.sin(phase) * 0.6;
    } else {
      this.speed = 0;
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.angle;
  }

  update(dt, input, world) {
    if (this.mode === 'car' && this.car) {
      this._drive(dt, input, world.colliders, world.trafficCars);
    } else {
      this._walk(dt, input, world.colliders, world.camYaw);
    }
  }
}
