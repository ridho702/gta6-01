// Solmar Bay — progression: respect ranks, the weapon locker, the radio
// dial, named cars, districts, and the crew ability. All names here are
// original inventions for this game. Pure data + small state logic; the
// HUD, combat and shops read from one Progress instance owned by main.js.

export const RANKS = [
  { name: 'HUSTLER', rep: 0 },
  { name: 'RUNNER', rep: 150 },
  { name: 'FIXER', rep: 400 },
  { name: 'SHOT CALLER', rep: 900 },
  { name: 'BAY KING', rep: 1600 },
];

export const WEAPONS = [
  {
    id: 'fists', slot: 1, name: 'FISTS', price: 0, rank: 0,
    damage: 25, rate: 0.45, spread: 0, pellets: 1, auto: false, range: 60,
  },
  {
    id: 'pistol', slot: 2, name: 'HARBOR 9', price: 0, rank: 0,
    damage: 34, rate: 0.28, spread: 0.012, pellets: 1, auto: false, range: 80,
  },
  {
    id: 'smg', slot: 3, name: 'RIPTIDE SMG', price: 800, rank: 1,
    damage: 16, rate: 0.09, spread: 0.035, pellets: 1, auto: true, range: 70,
  },
  {
    id: 'shotgun', slot: 4, name: 'BREAKER 12', price: 1500, rank: 2,
    damage: 14, rate: 0.85, spread: 0.09, pellets: 6, auto: false, range: 45,
  },
  {
    id: 'sniper', slot: 5, name: 'LONGSHOT 50', price: 2500, rank: 3,
    damage: 120, rate: 1.4, spread: 0.001, pellets: 1, auto: false, range: 220,
  },
  {
    id: 'rpg', slot: 6, name: 'HARBOUR RAIN RPG', price: 4000, rank: 3,
    damage: 90, rate: 2.0, spread: 0, pellets: 1, auto: false, range: 120,
  },
];

export const STATIONS = [
  {
    name: 'BAY FM 88.5', show: 'Sunset Drive',
    songs: ['Coral Skyline — The Palmettos', 'Low Tide Love — Marina Keys', 'Gold Hour — Sunset Riders', 'Pier Lights — The Boardwalkers'],
    bpm: 100, bass: [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0],
  },
  {
    name: 'HARBOUR STATIC 101.3', show: 'Night Static',
    songs: ['Static Bloom — Low Orbit', 'Copper Rain — Velour Static', 'Half Moon FM — The Receivers', 'Warehouse Dawn — Cold Circuit'],
    bpm: 84, bass: [49, 0, 0, 49, 0, 0, 58.27, 0, 49, 0, 0, 49, 0, 55, 0, 0],
  },
  {
    name: 'NEON TIDE 96.9', show: 'Chrome Nights',
    songs: ['Chrome Horizon — Neon Tide', 'Violet Avenue — Glass City', 'Midnight Ferry — Laser Palms', 'Sunset Protocol — The Duskers'],
    bpm: 118, bass: [65.41, 0, 65.41, 0, 0, 65.41, 0, 82.41, 65.41, 0, 65.41, 0, 73.42, 0, 98, 0],
  },
];

// Original car names, assigned by body style / colour at spawn time.
export const CAR_NAMES = {
  sport: ['Comet GT', 'Solstice S', 'Vagabond GT', 'Pier Runner X'],
  sedan: ['Meridian LX', 'Coral Cruiser', 'Harborline', 'Dune Runner', 'Bayliner 4', 'Solstice Sedan'],
  truck: ['Harbor Hauler', 'Dock Mule', 'Sand Runner'],
  bike: ['Coast Runner', 'Bay Hopper'],
};

// District names by world position (city spans -260..260, beach z 262..300).
export function districtAt(x, z) {
  if (z >= 262) return 'BOARDWALK BEACH';
  if (z <= -262) return 'AIRFIELD FLATS';
  if (x >= 180) return 'DOCKSIDE';
  if (x <= -180) return 'OLD TOWN';
  if (Math.abs(x) <= 60 && Math.abs(z) <= 60) return 'DOWNTOWN SOLMAR';
  if (z < -120) return 'NORTH HEIGHTS';
  if (z > 120) return 'PALM ROW';
  if (x > 60) return 'EAST MARKET';
  return 'WEST END';
}

export class Progress {
  constructor() {
    this.rep = 0;
    this.rankIdx = 0;
    this.owned = { fists: true, pistol: true, smg: false, shotgun: false, sniper: false, rpg: false };
    this.ammo = { fists: Infinity, pistol: 48, smg: 0, shotgun: 0, sniper: 0, rpg: 0 };
    this.weapon = 'pistol';
    this.station = 0;
    this.songIdx = 0;
    this.armor = 0; // 0..100, absorbs damage before health
    this.tune = 0; // engine tune level 0..3, each +8% top speed
    this.crewCooldown = 0; // seconds left on Mira's Swap Plates
    this.crewUsed = 0;
  }

  rank() {
    return RANKS[this.rankIdx];
  }

  nextRank() {
    return RANKS[this.rankIdx + 1] || null;
  }

  addRep(n) {
    this.rep += n;
    let leveled = false;
    while (this.rankIdx + 1 < RANKS.length && this.rep >= RANKS[this.rankIdx + 1].rep) {
      this.rankIdx++;
      leveled = true;
    }
    return leveled;
  }

  repProgress() {
    const next = this.nextRank();
    if (!next) return 1;
    const cur = RANKS[this.rankIdx];
    return Math.min(1, Math.max(0, (this.rep - cur.rep) / (next.rep - cur.rep)));
  }

  canBuy(w) {
    return this.rankIdx >= w.rank;
  }

  buyWeapon(w, cash) {
    if (this.owned[w.id]) return { ok: false, reason: 'already owned' };
    if (!this.canBuy(w)) return { ok: false, reason: 'needs rank ' + RANKS[w.rank].name };
    if (cash < w.price) return { ok: false, reason: 'not enough cash' };
    this.owned[w.id] = true;
    this.ammo[w.id] = w.id === 'smg' ? 120 : w.id === 'sniper' ? 12 : w.id === 'rpg' ? 6 : 24;
    return { ok: true, cost: w.price };
  }

  buyAmmo(w, cash) {
    const price = w.id === 'smg' ? 120 : w.id === 'shotgun' ? 90 : w.id === 'sniper' ? 100 : w.id === 'rpg' ? 200 : 60;
    if (cash < price) return { ok: false, reason: 'not enough cash' };
    this.ammo[w.id] += w.id === 'smg' ? 90 : w.id === 'shotgun' ? 16 : w.id === 'sniper' ? 12 : w.id === 'rpg' ? 4 : 36;
    return { ok: true, cost: price };
  }

  currentWeapon() {
    return WEAPONS.find((w) => w.id === this.weapon) || WEAPONS[1];
  }

  selectWeapon(id) {
    if (this.owned[id]) {
      this.weapon = id;
      return true;
    }
    return false;
  }

  stationNow() {
    return STATIONS[this.station];
  }

  songNow() {
    const st = this.stationNow();
    return st.songs[this.songIdx % st.songs.length];
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.songIdx = 0;
    return this.stationNow();
  }

  nextSong() {
    const st = this.stationNow();
    this.songIdx = (this.songIdx + 1) % st.songs.length;
    return this.songNow();
  }

  // Mira — Swap Plates: drop one wanted star, 60s cooldown.
  crewReady() {
    return this.crewCooldown <= 0;
  }

  useCrew() {
    if (!this.crewReady()) return false;
    this.crewCooldown = 60;
    this.crewUsed++;
    return true;
  }

  update(dt) {
    if (this.crewCooldown > 0) this.crewCooldown = Math.max(0, this.crewCooldown - dt);
  }

  // Damage goes to armor first, then health. Returns health damage.
  absorbDamage(n) {
    if (this.armor > 0) {
      const taken = Math.min(this.armor, n);
      this.armor -= taken;
      return n - taken;
    }
    return n;
  }
}
