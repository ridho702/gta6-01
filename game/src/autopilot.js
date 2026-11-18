// Solmar Bay — debug autopilot (?demo=1 / ?shot=N) used for screenshots and
// play-testing: drives itself, starts a police chase, runs a mission.
// Never runs unless the URL asks for it.
import { LANDMARKS, nearestStreet } from './city.js';
import { Car, CAR_MODELS } from './vehicles.js';

export class Autopilot {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.mode = 'drive';
    this.preset = null;
  }
  configure(params) {
    const demo = params.get('demo');
    const shot = params.get('shot');
    if (shot) {
      this.enabled = true; this.preset = shot;
      this.applyShot(shot);
      return;
    }
    if (demo === '1') {
      this.enabled = true; this.mode = 'drive';
      const g = this.game;
      g.startGame(true);
      // jump into the nearest car and head for the mission marker
      g.enterNearestCar(true);
      g.missions.start(1);
    }
  }
  applyShot(shot) {
    const g = this.game;
    g.startGame(true);
    if (shot === '1') {
      // On foot downtown, mid-mission, pedestrians + traffic around.
      g.player.x = 30; g.player.z = 30; g.player.heading = Math.PI * 0.8;
      g.camYaw = g.player.heading;
      g.missions.start(0);
      g.missions.stage = 0;
    } else if (shot === '2') {
      // Driving fast through the city: snap the car onto the nearest
      // intersection so it starts on the road, heading along a street.
      g.player.x = -90; g.player.z = 90;
      g.enterNearestCar(true);
      if (g.playerCar) {
        g.playerCar.x = nearestStreet(g.playerCar.x); g.playerCar.z = nearestStreet(g.playerCar.z);
        g.playerCar.mesh.position.set(g.playerCar.x, 0, g.playerCar.z);
        g.playerCar.heading = 0; g.playerCar.speed = 14; // first leg runs north along the street
      }
      g.missions.start(1);
    } else if (shot === '3') {
      // Wanted police chase in a car.
      g.player.x = 0; g.player.z = -30;
      g.enterNearestCar(true);
      if (g.playerCar) {
        g.playerCar.x = nearestStreet(g.playerCar.x); g.playerCar.z = nearestStreet(g.playerCar.z);
        g.playerCar.mesh.position.set(g.playerCar.x, 0, g.playerCar.z);
        g.playerCar.heading = 0; g.playerCar.speed = 20;
      }
      g.wanted.addHeat(60, '');
      g.missions.start(4);
      g.missions.escaped = true;
      // Two police cars right behind the player so the chase is in frame.
      for (const [ox, oz] of [[-8, -26], [8, -30]]) {
        const pc = new Car(g.scene, CAR_MODELS[1], g.player.x + ox, g.player.z + oz, 0, true);
        pc.police = true; pc.chase = true;
        g.wanted.policeCars.push(pc);
      }
      g.sound.setSiren(true);
    } else if (shot === '4') {
      // Mission shootout at the docks — close enough to see the Vultures.
      g.player.x = LANDMARKS.docks.x + 13; g.player.z = LANDMARKS.docks.z - 9;
      g.player.heading = Math.atan2(LANDMARKS.docks.x - g.player.x, LANDMARKS.docks.z - g.player.z);
      g.camYaw = g.player.heading;
      g.missions.start(3);
      g.missions.update(0.01, g);
      g.wanted.addHeat(20, '');
    }
    this.mode = shot === '3' || shot === '2' ? 'drive' : 'stand';
  }
  // Steer the player car toward the current mission target, following the
  // street grid (align to a street, cruise along it, turn, final approach)
  // so the car never ploughs through a city block.
  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    if (this.mode === 'stand') return;
    if (!g.inCar) { g.enterNearestCar(true); return; }
    const car = g.playerCar;
    const t = g.missions.currentTarget() || LANDMARKS.plaza;
    const wp = this.streetWaypoint(car, t);
    const wantHeading = Math.atan2(wp.x - car.x, wp.z - car.z);
    let steer = (wantHeading - car.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    const sharp = Math.abs(steer) > 1.0;
    steer = Math.max(-1, Math.min(1, steer * 1.6));
    const d = Math.hypot(t.x - car.x, t.z - car.z);
    // Unstuck: if wedged, reverse briefly.
    this.stuckT = Math.abs(car.speed) < 2 ? (this.stuckT || 0) + dt : 0;
    const reversing = this.stuckT > 1.5 && this.stuckT < 3;
    if (this.stuckT > 3) this.stuckT = 0;
    car.drive(dt, {
      throttle: reversing ? -1 : (sharp ? 0.35 : (d > 12 ? 1 : 0.3)),
      steer: reversing ? -steer : steer,
      brake: sharp && Math.abs(car.speed) > 12,
    }, g.colliders);
    g.sound.setEngine(Math.abs(car.speed) / car.model.top, true);
    // In chase mode keep the heat up.
    if (this.preset === '3' && g.wanted.stars < 3) g.wanted.addHeat(10, '');
  }
  streetWaypoint(car, t) {
    const sz = nearestStreet(car.z), sx = nearestStreet(car.x);
    if (Math.abs(car.z - sz) > 3) return { x: car.x, z: sz };
    if (Math.abs(car.x - t.x) > 10) return { x: t.x, z: sz };
    if (Math.abs(t.x - nearestStreet(t.x)) < 8 && Math.abs(car.x - sx) > 3) return { x: sx, z: car.z };
    return t;
  }
}
