// Solmar Bay — CORAL CHARGE throwable grenades (weapon slot 7).
//
// A thrown charge arcs under gravity, bounces once off the ground, then
// blows up when its 1.8 s fuse runs out. The blast is area damage: anyone
// standing within 8 m takes the full hit — mission enemies lose health,
// pedestrians get knocked flat, foot cops are taken out of the fight, and
// police cars are stopped dead for a moment. Throwing costs one grenade
// from the locker; an empty locker cannot throw.
//
// The module is deliberately self-contained: the main loop only has to
// construct it once, call update(dt) every frame while playing, and call
// throwFromPlayer() when the player presses G or clicks with slot 7
// equipped. All effects reuse the systems that already exist — the pooled
// explosion in particles.js and the one-shot boom in audio.js — so this
// file owns no particle or sound code of its own.

const FUSE_SECS = 1.8;
const BLAST_RADIUS = 8;
const BLAST_DAMAGE = 110;
const GRAVITY = 22;
const LOB_UP = 6.5;
const SELF_HURT_RADIUS = 4;
const SELF_HURT_DAMAGE = 30;

function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export class Grenades {
  constructor(game) {
    this.game = game;
    this.THREE = game.THREE || (typeof window !== 'undefined' ? window.THREE : null);
    this.scene = game.scene;
    this.list = [];
    this.thrown = 0;
    this.detonated = 0;
    this.lastBlast = null;
    this._geo = new this.THREE.SphereGeometry(0.17, 10, 8);
    this._mat = new this.THREE.MeshBasicMaterial({ color: 0xff6a2a });
    this._pinMat = new this.THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    this._pinGeo = new this.THREE.SphereGeometry(0.06, 6, 5);
  }

  // Ammo lives on progress.ammo.grenade; the locker starts empty.
  ammoLeft() {
    const p = this.game.progress;
    if (!p || !p.ammo) return 0;
    const v = p.ammo.grenade;
    return typeof v === 'number' ? v : 0;
  }

  owned() {
    const p = this.game.progress;
    return !!(p && p.owned && p.owned.grenade);
  }

  liveCount() {
    return this.list.length;
  }

  // Lob a charge at a ground point (x, z). Returns false without spending
  // ammo when the locker has no grenade or the player does not own one.
  throwAt(tx, tz) {
    if (!this.owned()) return { ok: false, reason: 'not owned' };
    if (this.ammoLeft() <= 0) return { ok: false, reason: 'no ammo' };
    const player = this.game.player;
    const from = player && typeof player.getPos === 'function'
      ? player.getPos()
      : (player && player.pos) || { x: 0, y: 0, z: 0 };
    const dx = tx - from.x;
    const dz = tz - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = Math.min(17, Math.max(7, dist * 1.15));
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    this.game.progress.ammo.grenade -= 1;
    this.thrown += 1;
    const mesh = new this.THREE.Mesh(this._geo, this._mat);
    const pin = new this.THREE.Mesh(this._pinGeo, this._pinMat);
    pin.position.set(0.14, 0.12, 0);
    mesh.add(pin);
    mesh.position.set(from.x, 1.5, from.z);
    this.scene.add(mesh);
    this.list.push({
      mesh,
      x: from.x,
      y: 1.5,
      z: from.z,
      vx,
      vy: LOB_UP,
      vz,
      fuse: FUSE_SECS,
      bounced: false,
      spin: 0,
    });
    if (this.game.hud && typeof this.game.hud.toast === 'function') {
      this.game.hud.toast('CORAL CHARGE thrown — ' + this.ammoLeft() + ' left');
    }
    return { ok: true, ammo: this.ammoLeft() };
  }

  // Throw along the camera's aim, landing about 12 m ahead. This is what
  // the G key and the slot-7 mouse click call.
  throwFromPlayer() {
    const player = this.game.player;
    const from = player && typeof player.getPos === 'function'
      ? player.getPos()
      : (player && player.pos) || { x: 0, y: 0, z: 0 };
    let fx = 0;
    let fz = 1;
    const cam = this.game.camera;
    if (cam && typeof cam.getWorldDirection === 'function') {
      const dir = cam.getWorldDirection(new this.THREE.Vector3());
      const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      if (len > 0.01) {
        fx = dir.x / len;
        fz = dir.z / len;
      }
    } else if (player && typeof player.angle === 'number') {
      fx = Math.sin(player.angle);
      fz = Math.cos(player.angle);
    }
    return this.throwAt(from.x + fx * 12, from.z + fz * 12);
  }

  // Step every live charge: gravity, one ground bounce, fuse countdown.
  update(dt) {
    if (!dt || dt <= 0) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      g.vy -= GRAVITY * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      if (g.y <= 0.22) {
        g.y = 0.22;
        if (!g.bounced) {
          g.bounced = true;
          g.vy = -g.vy * 0.35;
          g.vx *= 0.55;
          g.vz *= 0.55;
          if (Math.abs(g.vy) < 1.2) g.vy = 0;
        } else {
          g.vy = 0;
          g.vx *= Math.max(0, 1 - 3 * dt);
          g.vz *= Math.max(0, 1 - 3 * dt);
        }
      }
      g.spin += dt * 9;
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x = g.spin;
      g.mesh.rotation.z = g.spin * 0.6;
      if (g.fuse <= 0) {
        this.list.splice(i, 1);
        this._detonate(g);
      }
    }
  }

  // The blast itself: fireball + smoke, boom, then area damage to every
  // kind of target the game tracks. Counts are recorded on lastBlast so a
  // live probe can read exactly what the explosion did.
  _detonate(g) {
    this.scene.remove(g.mesh);
    this.detonated += 1;
    const at = { x: g.x, y: g.y + 0.4, z: g.z };
    if (this.game.particles && typeof this.game.particles.explosion === 'function') {
      this.game.particles.explosion(at);
    }
    if (this.game.audio && typeof this.game.audio.explosion === 'function') {
      this.game.audio.explosion();
    }
    let enemiesHit = 0;
    let pedsDown = 0;
    let copsDown = 0;
    let carsHit = 0;

    const foes = this.game.combat
      ? (typeof this.game.combat.livingEnemies === 'function'
        ? this.game.combat.livingEnemies()
        : (this.game.combat.enemies || []))
      : [];
    for (const e of foes) {
      if (!e || e.alive === false) continue;
      const ep = (e.pos) || (e.mesh && e.mesh.position) || null;
      if (!ep) continue;
      const d = Math.sqrt(
        ((ep.x || 0) - at.x) * ((ep.x || 0) - at.x) +
        ((ep.y || 1.2) - at.y) * ((ep.y || 1.2) - at.y) +
        ((ep.z || 0) - at.z) * ((ep.z || 0) - at.z),
      );
      if (d > BLAST_RADIUS) continue;
      enemiesHit += 1;
      if (typeof e.health === 'number') {
        e.health -= BLAST_DAMAGE;
        if (e.health <= 0) {
          e.alive = false;
          if (e.mesh) e.mesh.visible = false;
        }
      }
      if (typeof e.onHit === 'function') e.onHit(e);
    }

    const walkers = (this.game.peds && this.game.peds.list) || [];
    for (const p of walkers) {
      if (!p || !p.pos || p.down > 0) continue;
      if (flatDist(p.pos.x, p.pos.z, at.x, at.z) > BLAST_RADIUS) continue;
      p.down = 5;
      p.flee = 2;
      if (p.mesh && p.mesh.group) {
        p.mesh.group.rotation.z = Math.PI / 2;
        p.mesh.group.position.y = 0.3;
      }
      pedsDown += 1;
    }

    const police = this.game.police;
    if (police && Array.isArray(police.cops)) {
      for (let i = police.cops.length - 1; i >= 0; i--) {
        const cop = police.cops[i];
        if (!cop || !cop.pos) continue;
        if (flatDist(cop.pos.x, cop.pos.z, at.x, at.z) > BLAST_RADIUS) continue;
        if (cop.mesh) this.scene.remove(cop.mesh);
        police.cops.splice(i, 1);
        copsDown += 1;
      }
    }
    if (police && Array.isArray(police.cars)) {
      for (const car of police.cars) {
        if (!car || !car.pos) continue;
        if (flatDist(car.pos.x, car.pos.z, at.x, at.z) > BLAST_RADIUS) continue;
        car.speed = 0;
        carsHit += 1;
      }
    }

    let selfDamage = 0;
    const player = this.game.player;
    const pp = player && typeof player.getPos === 'function' ? player.getPos() : (player && player.pos);
    if (pp && flatDist(pp.x, pp.z, at.x, at.z) <= SELF_HURT_RADIUS) {
      selfDamage = SELF_HURT_DAMAGE;
      let rest = selfDamage;
      const prog = this.game.progress;
      if (prog && typeof prog.absorbDamage === 'function') {
        const r = prog.absorbDamage(selfDamage);
        if (typeof r === 'number') rest = r;
      }
      if (rest > 0 && player && typeof player.damage === 'function') player.damage(rest);
    }
    if (police && typeof police.addHeat === 'function') police.addHeat(10);

    this.lastBlast = {
      x: at.x,
      y: at.y,
      z: at.z,
      enemiesHit,
      pedsDown,
      copsDown,
      carsHit,
      selfDamage,
    };
  }
}
