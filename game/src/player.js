// Solmar Bay — the player on foot: third-person walking, sprinting, jumping
// is not needed, entering/exiting cars, and the player mesh.
import { makePersonMesh } from './people.js';
import { clamp, angleLerp, dist2d } from './util.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = makePersonMesh(0x2e6fd8, 0xe8b88a, false, false);
    // Dana Reyes: teal jacket, dark jeans.
    this.mesh.userData.body.material = new THREE.MeshLambertMaterial({ color: 0x2e8b8b });
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 0;
    this.walkPhase = 0;
    this.onFoot = true;
  }
  update(dt, input, colliders, cameraYaw) {
    if (!this.onFoot) return;
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    const sprint = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
    const maxSpeed = sprint ? 9 : 5;
    let mx = 0, mz = 0;
    if (fwd || strafe) {
      const a = cameraYaw;
      mx = Math.sin(a) * fwd + Math.cos(a) * strafe;
      mz = Math.cos(a) * fwd - Math.sin(a) * strafe;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.heading = angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    }
    const target = (fwd || strafe) ? maxSpeed : 0;
    this.speed = lerp2(this.speed, target, Math.min(1, dt * 10));
    if (this.speed > 0.1) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      const c = collideCircle(colliders, nx, nz, 0.7);
      this.x = c.x; this.z = c.z;
      this.walkPhase += dt * this.speed * 1.8;
    }
    const m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.heading;
    const sw = Math.sin(this.walkPhase) * clamp(this.speed / 5, 0, 1) * 0.6;
    m.userData.legL.rotation.x = sw; m.userData.legR.rotation.x = -sw;
    m.userData.armL.rotation.x = -sw * 0.7; m.userData.armR.rotation.x = sw * 0.7;
  }
  setVisible(v) { this.mesh.visible = v; }
}
function lerp2(a, b, t) { return a + (b - a) * t; }
