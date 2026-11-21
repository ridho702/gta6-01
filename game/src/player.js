// player.js — Solmar Bay (GTA-style, Three.js, plain ES module).
// Pedestrian / driver. On foot: camera-relative WASD. In a car: arcade
// driving. Core rule (the Sprint 2 fix): while driving, this.pos is
// ALWAYS copied from the car at the end of every update(), so police,
// helicopter, roadblocks, HUD, minimap and missions track the moving
// car, never the spot where the player climbed in. No imports — only
// the THREE object passed to the constructor and plain Math.
export class Player {
  constructor(scene, THREE, opts) {
    this.scene = scene;
    this.THREE = THREE;
    const spawn = opts || {};
    const startX = typeof spawn.x === 'number' ? spawn.x : 0;
    const startZ = typeof spawn.z === 'number' ? spawn.z : 0;
    this.pos = new THREE.Vector3(startX, 0, startZ); // live position
    this.angle = 0;
    this.health = 100;
    this.cash = 250;
    this.mode = 'foot';
    this.car = null;
    this.inCar = false;
    this.driving = false;
    this.speed = 0; // on-foot speed, m/s
    this.carSpeed = 0; // signed car speed, m/s
    this.alive = true;
    this.smoking = false;
    // Low-poly pedestrian: blue-jacket torso, skin head, dark legs/arms.
    const group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2b5cb8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a2f38 });
    const shoeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); group.add(m); return m;
    };
    box(0.7, 1.0, 0.38, jacket, 0, 1.3, 0); // torso
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skin);
    head.position.set(0, 2.05, 0); group.add(head);
    box(0.26, 0.8, 0.3, pants, -0.18, 0.4, 0); // left leg
    box(0.26, 0.8, 0.3, pants, 0.18, 0.4, 0); // right leg
    box(0.28, 0.12, 0.42, shoeM, -0.18, 0.06, 0.05); // left shoe
    box(0.28, 0.12, 0.42, shoeM, 0.18, 0.06, 0.05); // right shoe
    box(0.2, 0.85, 0.24, jacket, -0.47, 1.28, 0); // left arm
    box(0.2, 0.85, 0.24, jacket, 0.47, 1.28, 0); // right arm
    group.position.set(startX, 0, startZ);
    group.rotation.y = this.angle;
    scene.add(group);
    this.mesh = group;
  }
  // True while a key is held: input.isDown() if present, else input.keys.
  _down(input, code) {
    if (!input) return false;
    if (typeof input.isDown === 'function') return !!input.isDown(code);
    if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
    return false;
  }
  // True if point (x,z) sits inside any collider AABB expanded by radius.
  _hitsBuilding(x, z, radius, colliders) {
    if (!colliders) return false;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!b) continue;
      if (x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius) return true;
    }
    return false;
  }
  getPos() { return this.pos; }
  setPosition(x, z) {
    this.pos.x = x; this.pos.z = z;
    if (this.mesh) this.mesh.position.set(x, 0, z);
  }
  update(dt, input, ctx) {
    if (!dt || dt <= 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    const context = ctx || {};
    const colliders = context.colliders || [];
    const trafficCars = context.trafficCars || [];
    const camYaw = typeof context.camYaw === 'number' ? context.camYaw : 0;
    // Defensive: driving with no car is an on-foot state.
    if ((this.mode === 'car' || this.mode === 'drive') && !this.car) {
      this.mode = 'foot'; this.inCar = false; this.driving = false; this.carSpeed = 0;
    }
    if (this.mode === 'car' || this.mode === 'drive') this._updateDriving(dt, input, colliders, trafficCars);
    else this._updateOnFoot(dt, input, colliders, camYaw);
    // THE INVARIANT: while driving, the car's position IS the player's
    // position. Copy it into this.pos every frame, and park the hidden
    // pedestrian mesh on the car too — never a stale entry point.
    if ((this.mode === 'car' || this.mode === 'drive') && this.car && this.car.pos) {
      this.pos.x = this.car.pos.x;
      this.pos.z = this.car.pos.z;
      this.pos.y = this.car.pos.y != null ? this.car.pos.y : 0;
      if (this.mesh) { this.mesh.position.set(this.pos.x, 0, this.pos.z); this.mesh.visible = false; }
    } else if (this.mesh) {
      this.mesh.visible = true;
    }
  }
  // On foot: camera-relative WASD, wall sliding, face travel direction.
  _updateOnFoot(dt, input, colliders, camYaw) {
    const w = this._down(input, 'KeyW'), s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA'), d = this._down(input, 'KeyD');
    // Camera sits behind the player at camYaw, so W (into the screen)
    // is (-sin(camYaw), -cos(camYaw)); right is (-fwdZ, fwdX).
    const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
    const rightX = -fwdZ, rightZ = fwdX;
    let moveX = fwdX * ((w ? 1 : 0) - (s ? 1 : 0)) + rightX * ((d ? 1 : 0) - (a ? 1 : 0));
    let moveZ = fwdZ * ((w ? 1 : 0) - (s ? 1 : 0)) + rightZ * ((d ? 1 : 0) - (a ? 1 : 0));
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }
    const walkSpeed = 7;
    const oldX = this.pos.x, oldZ = this.pos.z;
    if (len > 0) {
      const nextX = oldX + moveX * walkSpeed * dt;
      const nextZ = oldZ + moveZ * walkSpeed * dt;
      // Slide along walls: try each axis on its own.
      if (!this._hitsBuilding(nextX, oldZ, 0.5, colliders)) this.pos.x = nextX;
      if (!this._hitsBuilding(this.pos.x, nextZ, 0.5, colliders)) this.pos.z = nextZ;
      this.angle = Math.atan2(moveX, moveZ); // face travel direction
    }
    const moved = Math.sqrt((this.pos.x - oldX) ** 2 + (this.pos.z - oldZ) ** 2);
    this.speed = dt > 0 ? moved / dt : 0;
    this.carSpeed = 0;
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      this.mesh.rotation.y = this.angle;
      this.mesh.visible = true;
    }
  }
  // Driving: arcade car physics.
  _updateDriving(dt, input, colliders, trafficCars) {
    const car = this.car;
    if (!car || !car.pos) return;
    const w = this._down(input, 'KeyW'), s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA'), d = this._down(input, 'KeyD');
    let carSpeed = typeof this.carSpeed === 'number' ? this.carSpeed : 0;
    const topSpeed = 38, topReverse = 12;
    if (w) {
      carSpeed += 14 * dt; // throttle
      if (carSpeed > topSpeed) carSpeed = topSpeed;
    } else if (s) {
      if (carSpeed > 0.5) { carSpeed -= 30 * dt; if (carSpeed < 0) carSpeed = 0; } // brake
      else { carSpeed -= 10 * dt; if (carSpeed < -topReverse) carSpeed = -topReverse; } // reverse
    } else { // no pedal: coast down ~6 m/s^2
      if (carSpeed > 0) { carSpeed -= 6 * dt; if (carSpeed < 0) carSpeed = 0; }
      else if (carSpeed < 0) { carSpeed += 6 * dt; if (carSpeed > 0) carSpeed = 0; }
    }
    // Steering: none when stationary, full once rolling; flips in reverse.
    const steerInput = (d ? 1 : 0) - (a ? 1 : 0);
    if (steerInput !== 0 && carSpeed !== 0) {
      const grip = Math.min(Math.abs(carSpeed) / 8, 1);
      car.angle += steerInput * 1.9 * dt * grip * (carSpeed > 0 ? 1 : -1);
    }
    const nextX = car.pos.x + Math.sin(car.angle) * carSpeed * dt;
    const nextZ = car.pos.z + Math.cos(car.angle) * carSpeed * dt;
    if (this._hitsBuilding(nextX, nextZ, 1.2, colliders)) {
      carSpeed *= 0.3; // hit a building: stay put, shed speed
    } else {
      car.pos.x = nextX; car.pos.z = nextZ;
    }
    // Bump into ambient traffic: lose half speed, shove back a little.
    if (trafficCars) {
      for (let i = 0; i < trafficCars.length; i++) {
        const other = trafficCars[i];
        if (!other || !other.pos) continue;
        const dx = car.pos.x - other.pos.x, dz = car.pos.z - other.pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.4) {
          carSpeed *= 0.5;
          car.pos.x -= Math.sin(car.angle) * 0.8;
          car.pos.z -= Math.cos(car.angle) * 0.8;
          break;
        }
      }
    }
    car.speed = carSpeed;
    if (typeof car.heading !== 'undefined') car.heading = car.angle;
    if (car.mesh) {
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.angle;
    }
    this.carSpeed = carSpeed;
    this.speed = 0;
    this.angle = car.angle;
  }
  enterCar(car) {
    if (!car) return;
    this.car = car;
    this.mode = 'car';
    this.inCar = true;
    this.driving = true;
    this.carSpeed = typeof car.speed === 'number' ? car.speed : 0;
    if (this.mesh) this.mesh.visible = false;
    // Snap immediately: never leave even one stale frame behind.
    if (car.pos) {
      this.pos.x = car.pos.x; this.pos.z = car.pos.z;
      this.pos.y = car.pos.y != null ? car.pos.y : 0;
    }
    if (typeof car.angle === 'number') this.angle = car.angle;
  }
  exitCar() {
    if (!this.inCar || !this.car) return;
    const car = this.car;
    const carAngle = typeof car.angle === 'number' ? car.angle : 0;
    const carX = car.pos ? car.pos.x : this.pos.x;
    const carZ = car.pos ? car.pos.z : this.pos.z;
    // Step out to the side, perpendicular to the car's heading.
    const outX = carX + Math.cos(carAngle) * 2.2;
    const outZ = carZ - Math.sin(carAngle) * 2.2;
    this.pos.x = outX; this.pos.y = 0; this.pos.z = outZ;
    this.angle = carAngle;
    this.mode = 'foot'; this.inCar = false; this.driving = false;
    this.car = null; this.carSpeed = 0;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.position.set(outX, 0, outZ);
      this.mesh.rotation.y = this.angle;
    }
  }
  getIn(car) { this.enterCar(car); }
  getOut() { this.exitCar(); }
  damage(n) {
    const amount = typeof n === 'number' ? n : 0;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.alive = false;
  }
  spawnStarterCar(x, z, angle) {
    const THREE = this.THREE;
    const carAngle = typeof angle === 'number' ? angle : 0;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a7bd5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, metalness: 0.4, roughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xc0392b });
    const box = (w, h, d, mat, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz); group.add(m); return m;
    };
    box(2.0, 0.7, 4.4, bodyMat, 0, 0.55, 0); // body
    box(1.7, 0.55, 2.2, glassMat, 0, 1.1, -0.2); // cabin
    box(1.7, 0.08, 2.0, bodyMat, 0, 1.42, -0.2); // roof
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 14);
    const spots = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
    for (let i = 0; i < spots.length; i++) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(spots[i][0], 0.38, spots[i][1]);
      group.add(wheel);
    }
    box(0.35, 0.15, 0.08, lightMat, -0.6, 0.6, 2.22); // headlight L
    box(0.35, 0.15, 0.08, lightMat, 0.6, 0.6, 2.22); // headlight R
    box(0.35, 0.15, 0.08, tailMat, -0.6, 0.6, -2.22); // taillight L
    box(0.35, 0.15, 0.08, tailMat, 0.6, 0.6, -2.22); // taillight R
    group.position.set(x, 0, z);
    group.rotation.y = carAngle;
    this.scene.add(group);
    return {
      mesh: group, pos: { x: x, z: z }, angle: carAngle, heading: carAngle,
      speed: 0, name: 'Meridian LX', condition: 100, smoking: false,
    };
  }
}
