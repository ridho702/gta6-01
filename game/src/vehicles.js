// Solmar Bay — vehicles: procedural car meshes, arcade driving physics and traffic AI.
import { clamp, angleLerp, angleDiff, dist2d } from './util.js';
import { STREETS, nearestStreet, collideCircle } from './city.js';

export const CAR_MODELS = [
  { name: 'Comet Coupe', color: 0xd8382e, top: 34, accel: 15, price: 900 },
  { name: 'Sunset Sedan', color: 0x2e6fd8, top: 29, accel: 12, price: 500 },
  { name: 'Palm Taxi', color: 0xf2c200, top: 27, accel: 11, price: 350 },
  { name: 'Bay Pickup', color: 0x3a8b4a, top: 28, accel: 12, price: 600 },
  { name: 'Dune Buggy', color: 0xe87a2e, top: 31, accel: 14, price: 750 },
  { name: 'Ocean Van', color: 0x8a7ad8, top: 24, accel: 10, price: 400 },
];

// Build a low-poly car from boxes + cylinder wheels. `police` adds light bar.
export function makeCarMesh(model, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0x1a1a22 : model.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2f42 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 2.3), glass);
  cabin.position.set(0, 1.2, -0.25); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 2.0), paint);
  roof.position.set(0, 1.52, -0.25); g.add(roof);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    hl.position.set(sx, 0.62, 2.22); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xd8382e }));
    tl.position.set(sx, 0.62, -2.22); g.add(tl);
  }
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w); wheels.push(w);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    bar.position.set(0, 1.65, -0.25); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.35, 1.65, -0.25); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.35, 1.65, -0.25); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, model, x, z, heading, police) {
    this.model = model; this.police = !!police;
    this.mesh = makeCarMesh(model, police);
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0; this.steer = 0; this.alive = true;
    this.ai = null; // {street, along, dir, targetSpeed}
    this.stolen = false; this.isPlayerCar = false;
  }
  // Arcade driving. input: {throttle:-1..1, steer:-1..1, brake}
  drive(dt, input, colliders) {
    const m = this.model;
    const accel = input.throttle * m.accel;
    this.speed += accel * dt;
    if (input.brake) this.speed *= Math.pow(0.12, dt);
    this.speed *= Math.pow(0.35, dt * Math.max(0, -input.throttle * Math.sign(this.speed)));
    this.speed = clamp(this.speed, -10, m.top);
    if (Math.abs(this.speed) < 0.15 && input.throttle === 0) this.speed = 0;
    const steerTarget = input.steer * clamp(Math.abs(this.speed) / 8, 0, 1) * 1.9;
    this.steer = angleLerp(this.steer, steerTarget, Math.min(1, dt * 8));
    this.heading += this.steer * dt * Math.sign(this.speed);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const c = collideCircle(colliders, nx, nz, 2.2);
    if (Math.abs(c.x - nx) > 0.01 || Math.abs(c.z - nz) > 0.01) {
      this.speed *= 0.45; // bumped a wall
      if (Math.abs(this.speed) > 8) this.bump = 1;
    }
    this.x = c.x; this.z = c.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -this.steer * 0.06;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2;
  }
  // Traffic AI: cruise along a street, turn at intersections, avoid the player.
  updateAI(dt, colliders, playerPos) {
    if (!this.ai) return;
    const a = this.ai;
    // current lane position
    const along = a.horizontal ? this.x : this.z;
    const cross = a.horizontal ? this.z : this.x;
    const targetCross = a.street + (a.dir > 0 ? 2.2 : -2.2);
    const steerTo = clamp((targetCross - cross) * 0.4, -1, 1);
    let targetHeading = a.horizontal ? (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.dir > 0 ? 0 : Math.PI);
    // slow for the player ahead
    let targetSpeed = a.targetSpeed;
    if (playerPos) {
      const d = dist2d(this.x, this.z, playerPos.x, playerPos.z);
      const ahead = Math.cos(angleDiff(this.heading, Math.atan2(playerPos.x - this.x, playerPos.z - this.z)));
      if (d < 14 && ahead > 0.5) targetSpeed = 0;
    }
    const desired = clamp((targetSpeed - this.speed) * 0.3, -1, 1);
    this.drive(dt, { throttle: desired, steer: steerTo * 0.4 + angleDiff(this.heading, targetHeading) * 0.25, brake: targetSpeed === 0 }, colliders);
    // at an intersection, maybe turn onto a cross street
    const atEnd = a.horizontal ? (a.dir > 0 ? along > 295 : along < -295) : (a.dir > 0 ? along > 295 : along < -295);
    const nearCross = Math.abs(along - nearestStreet(along)) < 1.2;
    if ((atEnd || (nearCross && Math.random() < dt * 0.25)) && Math.abs(angleDiff(this.heading, targetHeading)) < 0.3) {
      const ns = nearestStreet(along);
      if (atEnd) { a.dir *= -1; }
      else if (Math.random() < 0.5) {
        a.horizontal = !a.horizontal; a.street = ns;
        a.dir = Math.random() < 0.5 ? 1 : -1;
      } else a.dir *= -1;
      // snap onto the new street centre
      if (a.horizontal) this.z = a.street; else this.x = a.street;
    }
  }
  dispose(scene) { scene.remove(this.mesh); this.alive = false; }
}

export function spawnTrafficCar(scene, colliders, rnd) {
  const model = CAR_MODELS[Math.floor(rnd() * CAR_MODELS.length)];
  const horizontal = rnd() < 0.5;
  const street = STREETS[Math.floor(rnd() * STREETS.length)];
  const along = (rnd() * 2 - 1) * 170;
  const dir = rnd() < 0.5 ? 1 : -1;
  const x = horizontal ? along : street;
  const z = horizontal ? street : along;
  const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const car = new Car(scene, model, x, z, heading, false);
  car.ai = { horizontal, street, dir, targetSpeed: 9 + rnd() * 5 };
  car.speed = car.ai.targetSpeed;
  return car;
}
