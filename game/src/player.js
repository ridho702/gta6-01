export class Player {
  constructor(scene, THREE, opts) {
    this.scene = scene;
    this.THREE = THREE;
    const spawn = opts || {};
    const startX = typeof spawn.x === 'number' ? spawn.x : 0;
    const startZ = typeof spawn.z === 'number' ? spawn.z : 0;
    this.pos = new THREE.Vector3(startX, 0, startZ);
    this.angle = 0;
    this.health = 100;
    this.cash = 250;
    this.mode = 'foot';
    this.car = null;
    this.inCar = false;
    this.driving = false;
    this.speed = 0;
    this.carSpeed = 0;
    this.alive = true;
    this.smoking = false;

    const group = new THREE.Group();
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x2b5cb8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

    const box = (w, h, d, mat, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // Torso - blue jacket
    box(0.7, 1.0, 0.38, jacketMat, 0, 1.3, 0);
    // Head - skin
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skinMat);
    head.position.set(0, 2.05, 0);
    group.add(head);
    // Legs - pants
    box(0.26, 0.8, 0.3, pantsMat, -0.18, 0.4, 0);
    box(0.26, 0.8, 0.3, pantsMat, 0.18, 0.4, 0);
    // Shoes
    box(0.28, 0.12, 0.42, shoeMat, -0.18, 0.06, 0.05);
    box(0.28, 0.12, 0.42, shoeMat, 0.18, 0.06, 0.05);
    // Arms - jacket
    box(0.2, 0.85, 0.24, jacketMat, -0.47, 1.28, 0);
    box(0.2, 0.85, 0.24, jacketMat, 0.47, 1.28, 0);

    group.position.set(startX, 0, startZ);
    group.rotation.y = this.angle;
    scene.add(group);
    this.mesh = group;
  }

  _down(input, code) {
    if (!input) return false;
    if (typeof input.isDown === 'function') return !!input.isDown(code);
    if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
    return false;
  }

  _hitsBuilding(x, z, radius, colliders) {
    if (!colliders) return false;
    for (const b of colliders) {
      if (x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius) return true;
    }
    return false;
  }

  getPos() { return this.pos; }

  setPosition(x, z) {
    this.pos.x = x;
    this.pos.z = z;
    if (this.mesh) this.mesh.position.set(x, 0, z);
  }

  update(dt, input, ctx) {
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    const context = ctx || {};
    const colliders = context.colliders || [];
    const trafficCars = context.trafficCars || [];
    const camYaw = typeof context.camYaw === 'number' ? context.camYaw : 0;

    if ((this.mode === 'car' || this.mode === 'drive') && !this.car) {
      this.mode = 'foot';
      this.inCar = false;
      this.driving = false;
      this.carSpeed = 0;
    }

    if (this.mode === 'car' || this.mode === 'drive') {
      this._updateDriving(dt, input, colliders, trafficCars);
    } else {
      this._updateOnFoot(dt, input, colliders, camYaw);
    }

    // INVARIAN UTAMA (perbaikan sprint 2): pos pemain mengikuti mobil saat mengemudi
    if ((this.mode === 'car' || this.mode === 'drive') && this.car && this.car.pos) {
      this.pos.x = this.car.pos.x;
      this.pos.z = this.car.pos.z;
      this.pos.y = this.car.pos.y ?? 0;
      if (this.mesh) {
        this.mesh.position.set(this.pos.x, 0, this.pos.z);
        this.mesh.visible = false;
      }
    } else if (this.mesh) {
      this.mesh.visible = true;
    }
  }

  _updateOnFoot(dt, input, colliders, camYaw) {
    const w = this._down(input, 'KeyW');
    const s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA');
    const d = this._down(input, 'KeyD');
    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    let moveX = fwdX * ((w ? 1 : 0) - (s ? 1 : 0)) + rightX * ((d ? 1 : 0) - (a ? 1 : 0));
    let moveZ = fwdZ * ((w ? 1 : 0) - (s ? 1 : 0)) + rightZ * ((d ? 1 : 0) - (a ? 1 : 0));
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }
    const walkSpeed = 7;
    const oldX = this.pos.x;
    const oldZ = this.pos.z;
    const nextX = this.pos.x + moveX * walkSpeed * dt;
    const nextZ = this.pos.z + moveZ * walkSpeed * dt;
    // Geser sepanjang dinding: coba tiap sumbu sendiri
    if (!this._hitsBuilding(nextX, oldZ, 0.5, colliders)) this.pos.x = nextX;
    if (!this._hitsBuilding(this.pos.x, nextZ, 0.5, colliders)) this.pos.z = nextZ;
    if (len > 0) this.angle = Math.atan2(moveX, moveZ);
    const dist = Math.sqrt((this.pos.x - oldX) * (this.pos.x - oldX) + (this.pos.z - oldZ) * (this.pos.z - oldZ));
    this.speed = dt > 0 ? dist / dt : 0;
    this.carSpeed = 0;
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      this.mesh.rotation.y = this.angle;
      this.mesh.visible = true;
    }
  }

  _updateDriving(dt, input, colliders, trafficCars) {
    const car = this.car;
    if (!car || !car.pos) return;
    const w = this._down(input, 'KeyW');
    const s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA');
    const d = this._down(input, 'KeyD');
    let carSpeed = typeof this.carSpeed === 'number' ? this.carSpeed : 0;
    const isBike = !!car.bike;
    // Sprint 12 — bikes: quicker off the line, higher top speed than cars.
    // Car top speed stays at its original 38; bikes go to 45.
    const topSpeed = isBike ? 45 : 38;
    const topReverse = 12;
    if (w) {
      carSpeed += (isBike ? 20 : 14) * dt;
      if (carSpeed > topSpeed) carSpeed = topSpeed;
    } else if (s) {
      if (carSpeed > 0.5) {
        carSpeed -= 30 * dt;
        if (carSpeed < 0) carSpeed = 0;
      } else {
        carSpeed -= 10 * dt;
        if (carSpeed < -topReverse) carSpeed = -topReverse;
      }
    } else {
      // Coast menuju 0
      if (carSpeed > 0) {
        carSpeed -= 6 * dt;
        if (carSpeed < 0) carSpeed = 0;
      } else if (carSpeed < 0) {
        carSpeed += 6 * dt;
        if (carSpeed > 0) carSpeed = 0;
      }
    }
    const steerInput = (d ? 1 : 0) - (a ? 1 : 0);
    if (steerInput !== 0 && carSpeed !== 0) {
      const grip = Math.min(Math.abs(carSpeed) / 8, 1);
      car.angle += steerInput * (isBike ? 2.4 : 1.9) * dt * grip * (carSpeed > 0 ? 1 : -1);
    }
    const nextX = car.pos.x + Math.sin(car.angle) * carSpeed * dt;
    const nextZ = car.pos.z + Math.cos(car.angle) * carSpeed * dt;
    if (this._hitsBuilding(nextX, nextZ, 1.2, colliders)) {
      carSpeed *= 0.3;
    } else {
      car.pos.x = nextX;
      car.pos.z = nextZ;
    }
    if (trafficCars) {
      for (const other of trafficCars) {
        if (!other || !other.pos) continue;
        const dx = car.pos.x - other.pos.x;
        const dz = car.pos.z - other.pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.4) {
          carSpeed *= 0.5;
          car.pos.x -= Math.sin(car.angle) * 0.8;
          car.pos.z -= Math.cos(car.angle) * 0.8;
          break;
        }
      }
    }
    car.speed = carSpeed;
    if (car.heading !== undefined) car.heading = car.angle;
    if (car.mesh) {
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.angle;
      // Sprint 12 — a ridden bike leans into corners while moving.
      if (isBike) car.mesh.rotation.z = Math.abs(carSpeed) > 0.5 ? -steerInput * 0.3 : 0;
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
    if (car.pos) {
      this.pos.x = car.pos.x;
      this.pos.z = car.pos.z;
      this.pos.y = car.pos.y ?? 0;
    }
    if (typeof car.angle === 'number') this.angle = car.angle;
  }

  exitCar() {
    if (!this.inCar || !this.car) return;
    const car = this.car;
    const carAngle = car.angle ?? 0;
    const carX = car.pos ? car.pos.x : this.pos.x;
    const carZ = car.pos ? car.pos.z : this.pos.z;
    const outX = carX + Math.cos(carAngle) * 2.2;
    const outZ = carZ - Math.sin(carAngle) * 2.2;
    this.pos.x = outX;
    this.pos.y = 0;
    this.pos.z = outZ;
    this.angle = carAngle;
    this.mode = 'foot';
    this.inCar = false;
    this.driving = false;
    this.car = null;
    this.carSpeed = 0;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.position.set(outX, 0, outZ);
      this.mesh.rotation.y = this.angle;
    }
  }

  getIn(car) { this.enterCar(car); }
  getOut() { this.exitCar(); }

  damage(n) {
    this.health = Math.max(0, this.health - (n || 0));
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
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(px, py, pz);
      group.add(mesh);
      return mesh;
    };

    box(2.0, 0.7, 4.4, bodyMat, 0, 0.55, 0);
    box(1.7, 0.55, 2.2, glassMat, 0, 1.1, -0.2);
    box(1.7, 0.08, 2.0, bodyMat, 0, 1.42, -0.2);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 14);
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      group.add(wheel);
    }
    box(0.35, 0.15, 0.08, lightMat, -0.6, 0.6, 2.22);
    box(0.35, 0.15, 0.08, lightMat, 0.6, 0.6, 2.22);
    box(0.35, 0.15, 0.08, tailMat, -0.6, 0.6, -2.22);
    box(0.35, 0.15, 0.08, tailMat, 0.6, 0.6, -2.22);

    group.position.set(x, 0, z);
    group.rotation.y = carAngle;
    this.scene.add(group);
    return { mesh: group, pos: { x, z }, angle: carAngle, heading: carAngle, speed: 0, name: 'Meridian LX', condition: 100, smoking: false };
  }
}
