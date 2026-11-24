// daynight.js — day/night cycle for Solmar Bay (Sprint 15, Builder B).
//
// One full game day lasts CYCLE_MINUTES of real time (8 minutes by
// default: 1440 game minutes / 480 real seconds = 3 game minutes per
// real second). The clock starts at 18:47 — the sunset golden hour the
// game already opens on — so the first frame looks exactly like it does
// today: the sunset palette below copies the hardcoded light / sky /
// fog values from main.js verbatim.
//
// The cycle lerps between four keyframes (night / dawn / day / sunset).
// Every frame it drives: the sun DirectionalLight (colour + intensity),
// the HemisphereLight (sky + ground colour + intensity), the scene
// background colour, the fog colour, the sun's offset from the player
// (via sunOffset(), read by updateSun in main.js), and the street-lamp
// glow (the one shared lamp material in city.js, found by scanning the
// scene — no city file is touched).
//
// ---------------------------------------------------------------------
// WIRE-UP CONTRACT — for the coordinator (main.js only, this file is
// standalone and needs no other edits):
//
//   1. Import, next to the other system imports:
//        import { DayNight } from './daynight.js';
//
//   2. Construct AFTER dressCity() + scene.add(city.group) (the lamp
//      scan needs the city in the scene) and BEFORE animate():
//        const daynight = new DayNight(scene, sun, hemi, { game: game });
//        game.daynight = daynight;
//
//   3. DELETE the old clock line in the 'playing' branch:
//        game.clockMinutes += dt * 0.5;
//      DayNight owns the clock now and writes game.clockMinutes itself,
//      so the HUD clock (#hud-clock, fed by formatClock) keeps working
//      with no hud.js change.
//
//   4. In updateSun(), use the cycle's sun offset instead of the fixed
//      one, so the sun rises / sets instead of sitting at sunset:
//        const off = daynight.sunOffset();
//        sun.position.set(pp.x + off.x, off.y, pp.z + off.z);
//      At 18:47 sunOffset() returns exactly (-220, 55, 140), the offset
//      updateSun uses today, so the opening shot is unchanged.
//
//   5. Advance the cycle in the 'playing' branch, right next to the
//      missions.update call, with the SAME freeze gate missions use:
//        // Frozen in shot/demo/selftest modes so staged screenshots and the
//        // scripted selftest stay exactly as composed.
//        if (!isShot && !isDemo && !isSelftest) {
//          try { daynight.update(dt, isShot || isDemo || isSelftest); } catch (e) {}
//        }
//      The outer if-guard is the missions.update pattern copied verbatim;
//      the `frozen` argument carries the same predicate into update() as
//      a second layer, so a direct call with frozen=true also freezes.
//      Do NOT call daynight.update() from the menu branch: the menu
//      orbit keeps the opening 18:47 sunset, like today.
// ---------------------------------------------------------------------

const START_MINUTES = 1127; // 18:47 — sunset, the game's opening look.
const DAY_MINUTES = 1440;
const CYCLE_MINUTES = 480; // real seconds per full game day (8 minutes).
const MINUTES_PER_SECOND = DAY_MINUTES / CYCLE_MINUTES; // 3 game min / s.

// Keyframe stops, in game minutes since midnight. The sunset stop sits
// exactly on the opening time so the first applied frame is pixel-identical
// to the current hardcoded lighting.
const STOPS = [
  { at: 0, name: 'night' },
  { at: 360, name: 'dawn' }, // 06:00
  { at: 720, name: 'day' }, // 12:00
  { at: 1127, name: 'sunset' }, // 18:47
  { at: 1440, name: 'night' }, // 24:00 == 00:00, wraps the loop
];

// Sun colour / intensity per keyframe. Sunset copies main.js exactly:
// sun 0xffb060 @ 1.6, hemi sky 0xd8a0c8 / ground 0x5a4a3a @ 0.85,
// background 0x8a5a8a, fog 0xc07850.
const PALETTES = {
  night: {
    sun: 0x8fa8ff, sunIntensity: 0.12, // cold moonlight, shadows stay on
    hemiSky: 0x1c2a4a, hemiGround: 0x0e0e14, hemiIntensity: 0.3,
    bg: 0x070d1d, fog: 0x0a1226,
    lampGlow: 1.0,
  },
  dawn: {
    sun: 0xffc890, sunIntensity: 0.9,
    hemiSky: 0xf0b090, hemiGround: 0x4a3a30, hemiIntensity: 0.6,
    bg: 0xd98a7a, fog: 0xe0a080,
    lampGlow: 0.5,
  },
  day: {
    sun: 0xfff2d8, sunIntensity: 2.0,
    hemiSky: 0xbfd8ff, hemiGround: 0x6a6a55, hemiIntensity: 1.0,
    bg: 0x87b5e0, fog: 0xa8c8e0,
    lampGlow: 0.0,
  },
  sunset: {
    sun: 0xffb060, sunIntensity: 1.6,
    hemiSky: 0xd8a0c8, hemiGround: 0x5a4a3a, hemiIntensity: 0.85,
    bg: 0x8a5a8a, fog: 0xc07850,
    lampGlow: 1.0,
  },
};

// Sun offset from the player per keyframe (x, y, z). Sunset copies the
// offset updateSun() uses today, (-220, 55, 140): low in the west, long
// shadows. Day is near-overhead; night is a high moon on the far side;
// dawn is low in the east.
const SUN_OFFSETS = {
  night: { x: 180, y: 120, z: -160 },
  dawn: { x: 220, y: 45, z: 60 },
  day: { x: -60, y: 260, z: -80 },
  sunset: { x: -220, y: 55, z: 140 },
};

// Street-lamp bulb colours. The lamp material in city.js is one shared
// MeshBasicMaterial (colour 0xffe9a8) on all 16 lamp spheres, so lerping
// that single material lights every lamp at once. At sunset the glow is
// 1.0, so the opening frame keeps the exact 0xffe9a8 bulbs it has today.
const LAMP_BRIGHT = 0xffe9a8;
const LAMP_DIM = 0x6a6558; // cold grey bulb, lamps "off" in daylight

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class DayNight {
  // scene: THREE.Scene — background + fog live here.
  // sun: THREE.DirectionalLight. hemi: THREE.HemisphereLight.
  // opts: { game, startMinutes, cycleMinutes, lampMaterial, fill }.
  //   game — optional; when given, game.clockMinutes is kept in sync so
  //     the HUD clock keeps working with no other change.
  //   startMinutes — opening game time, default 18:47 (1127).
  //   cycleMinutes — real seconds per full day, default 480 (8 min).
  //   lampMaterial — optional explicit lamp material; when omitted the
  //     scene is scanned for the street-lamp material (see _findLamps).
  //   fill — optional fill DirectionalLight; dimmed a little at night.
  constructor(scene, sun, hemi, opts) {
    this.scene = scene || null;
    this.sun = sun || null;
    this.hemi = hemi || null;
    const o = opts || {};
    this.game = o.game || null;
    this.cycleMinutes = typeof o.cycleMinutes === 'number' && o.cycleMinutes > 0
      ? o.cycleMinutes
      : CYCLE_MINUTES;
    this.minutesPerSecond = DAY_MINUTES / this.cycleMinutes;
    this.minutes = typeof o.startMinutes === 'number'
      ? o.startMinutes
      : (this.game && typeof this.game.clockMinutes === 'number'
        ? this.game.clockMinutes
        : START_MINUTES);
    this.minutes = ((this.minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    this.fill = o.fill || null;
    this._fillBase = this.fill && typeof this.fill.intensity === 'number'
      ? this.fill.intensity
      : 0;
    // Scratch colours, built from the sun's own colour class so this
    // module never needs a THREE import or global.
    const ColorCtor = (sun && sun.color && sun.color.constructor) || null;
    this._cA = ColorCtor ? new ColorCtor(0xffffff) : null;
    this._cB = ColorCtor ? new ColorCtor(0xffffff) : null;
    this._lamp = ColorCtor ? new ColorCtor(LAMP_BRIGHT) : null;
    this._lampBright = ColorCtor ? new ColorCtor(LAMP_BRIGHT) : null;
    this._lampDim = ColorCtor ? new ColorCtor(LAMP_DIM) : null;
    // Current sun offset from the player (recomputed by apply()).
    this._offset = { x: SUN_OFFSETS.sunset.x, y: SUN_OFFSETS.sunset.y, z: SUN_OFFSETS.sunset.z };
    this._phase = 'sunset';
    this.lampGlow = 1;
    // Street lamps: one shared material, found by scanning the scene.
    // A caller that already holds the material can pass it in instead.
    this._lampMats = [];
    if (o.lampMaterial) this.registerLampMaterial(o.lampMaterial);
    else this._findLamps();
    // Apply the opening palette immediately so the first rendered frame
    // is the 18:47 sunset the game opens with today.
    this.apply();
  }

  // Find the street-lamp material without touching city.js: the lamps in
  // city.js are the only SphereGeometry(0.35) meshes in the city, all
  // sitting at y = 7.1 on their poles and sharing one material. Matching
  // on geometry + height (never on colour alone) keeps muzzle flashes,
  // particles and pier bulbs out of the match.
  _findLamps() {
    if (!this.scene || typeof this.scene.traverse !== 'function') return;
    const seen = [];
    this.scene.traverse((obj) => {
      if (!obj || !obj.isMesh || !obj.geometry || !obj.material) return;
      const g = obj.geometry;
      if (g.type !== 'SphereGeometry') return;
      const p = g.parameters;
      if (!p || p.radius !== 0.35) return;
      if (Math.abs((obj.position ? obj.position.y : 0) - 7.1) > 0.01) return;
      if (seen.indexOf(obj.material) === -1) seen.push(obj.material);
    });
    for (let i = 0; i < seen.length; i++) this.registerLampMaterial(seen[i]);
  }

  // Register a lamp material explicitly (coordinator use; also lets a
  // future city change hand the material over directly). Safe to call
  // twice with the same material.
  registerLampMaterial(mat) {
    if (!mat || !mat.color) return;
    if (this._lampMats.indexOf(mat) === -1) this._lampMats.push(mat);
  }

  // Advance the game clock and re-apply the lighting.
  // dt: real seconds since the last frame (clamped, tab-switch safe).
  // frozen: true in shot / demo / selftest modes — the clock does not
  //   move and no light changes, exactly like missions.update, which is
  //   gated by the same predicate in main.js:
  //     if (!isShot && !isDemo && !isSelftest) { missions.update(dt); }
  //   The coordinator passes isShot || isDemo || isSelftest here, inside
  //   the identical outer if-guard, so both layers use one condition.
  update(dt, frozen) {
    if (frozen) return; // frozen in shot/demo/selftest modes
    // No clamp here on purpose: main.js already clamps dt to 0.05 s per
    // frame, and update() must advance in proportion to dt whatever the
    // caller passes (a hidden cap would silently slow the cycle down).
    const step = typeof dt === 'number' && dt > 0 ? dt : 0;
    if (step === 0) return;
    this.minutes += step * this.minutesPerSecond;
    if (this.minutes >= DAY_MINUTES) this.minutes -= DAY_MINUTES;
    if (this.game) this.game.clockMinutes = this.minutes;
    this.apply();
  }

  // Recompute every driven light / colour from the current game time.
  // Public so the coordinator (or a debug handle) can force a re-apply
  // after setTime() without advancing the clock.
  apply() {
    const m = this.minutes;
    // Bracketing keyframe stops (the last stop wraps to the first).
    let i = 0;
    for (let k = 0; k < STOPS.length - 1; k++) {
      if (m >= STOPS[k].at && m < STOPS[k + 1].at) { i = k; break; }
      i = k;
    }
    const a = STOPS[i];
    const b = STOPS[i + 1];
    const span = b.at - a.at;
    const t = span > 0 ? clamp01((m - a.at) / span) : 0;
    const pa = PALETTES[a.name];
    const pb = PALETTES[b.name];
    this._phase = t < 0.5 ? a.name : b.name;
    this.lampGlow = lerp(pa.lampGlow, pb.lampGlow, t);
    const oa = SUN_OFFSETS[a.name];
    const ob = SUN_OFFSETS[b.name];
    this._offset.x = lerp(oa.x, ob.x, t);
    this._offset.y = lerp(oa.y, ob.y, t);
    this._offset.z = lerp(oa.z, ob.z, t);
    if (!this._cA || !this._cB) return;
    // Sun colour + intensity.
    if (this.sun) {
      this._cA.set(pa.sun);
      this._cB.set(pb.sun);
      this.sun.color.lerpColors(this._cA, this._cB, t);
      this.sun.intensity = lerp(pa.sunIntensity, pb.sunIntensity, t);
    }
    // Hemisphere sky / ground / intensity.
    if (this.hemi) {
      this._cA.set(pa.hemiSky);
      this._cB.set(pb.hemiSky);
      this.hemi.color.lerpColors(this._cA, this._cB, t);
      this._cA.set(pa.hemiGround);
      this._cB.set(pb.hemiGround);
      this.hemi.groundColor.lerpColors(this._cA, this._cB, t);
      this.hemi.intensity = lerp(pa.hemiIntensity, pb.hemiIntensity, t);
    }
    // Sky background + fog colour (near/far distances are untouched).
    if (this.scene) {
      if (this.scene.background && this.scene.background.lerpColors) {
        this._cA.set(pa.bg);
        this._cB.set(pb.bg);
        this.scene.background.lerpColors(this._cA, this._cB, t);
      }
      if (this.scene.fog && this.scene.fog.color && this.scene.fog.color.lerpColors) {
        this._cA.set(pa.fog);
        this._cB.set(pb.fog);
        this.scene.fog.color.lerpColors(this._cA, this._cB, t);
      }
    }
    // Fill light, if one was handed in: a touch dimmer at night.
    if (this.fill && this._fillBase > 0) {
      this.fill.intensity = this._fillBase * lerp(1, 0.4, this._isDark(t, pa, pb));
    }
    // Street lamps: lerp the shared bulb material from dim grey (day)
    // to warm bright (night). One material, all 16 lamps at once.
    if (this._lampMats.length > 0 && this._lamp) {
      this._lamp.lerpColors(this._lampDim, this._lampBright, clamp01(this.lampGlow));
      for (let k = 0; k < this._lampMats.length; k++) {
        this._lampMats[k].color.copy(this._lamp);
      }
    }
  }

  // How dark the current blend is, 0 (full day) to 1 (full night):
  // used only to scale the optional fill light.
  _isDark(t, pa, pb) {
    const glow = lerp(pa.lampGlow, pb.lampGlow, t);
    return clamp01(glow);
  }

  // Sun offset from the player for updateSun() in main.js. The caller
  // may pass an object to fill (e.g. a THREE.Vector3) or take the plain
  // {x, y, z} return value. At 18:47 this is exactly (-220, 55, 140).
  sunOffset(out) {
    if (out && typeof out.set === 'function') {
      out.set(this._offset.x, this._offset.y, this._offset.z);
      return out;
    }
    if (out) {
      out.x = this._offset.x;
      out.y = this._offset.y;
      out.z = this._offset.z;
      return out;
    }
    return { x: this._offset.x, y: this._offset.y, z: this._offset.z };
  }

  // Name of the nearest keyframe: 'night' | 'dawn' | 'day' | 'sunset'.
  phaseName() {
    return this._phase;
  }

  // True during the dark hours (after dusk, before dawn).
  isNight() {
    return this.minutes >= 19.5 * 60 || this.minutes < 5.5 * 60;
  }

  // Jump the clock (debug / staging use). Does not advance the cycle;
  // call apply() is done here, and game.clockMinutes is kept in sync.
  setTime(hours, mins) {
    const h = typeof hours === 'number' ? hours : 18;
    const mi = typeof mins === 'number' ? mins : 47;
    this.minutes = (((h * 60 + mi) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    if (this.game) this.game.clockMinutes = this.minutes;
    this.apply();
  }

  // HH:MM for the current game time (same format as formatClock).
  timeString() {
    const m = Math.floor(this.minutes) % DAY_MINUTES;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return hh + ':' + mm;
  }
}
