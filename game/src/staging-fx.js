// staging-fx.js — persistent gunfight visuals for the on-foot screenshot (?shot=3).
// Combat tracers (0.09s) and muzzle flashes (0.06s) vanish before the still is
// taken, so the shot reads as a standoff instead of a firefight. This module
// stages two bright tracer lines and four glow spheres that are NEVER updated
// or removed — they exist only so the staged still reads as an active gunfight.
// Called once during shot-3 staging; safe to call repeatedly (each call adds
// fresh lines/spheres).
//
// Expects a `game` object exposing game.THREE (fallback: window.THREE),
// game.scene, game.player (.pos {x, z}) and game.combat (.livingEnemies()
// returning enemies, each with .pos {x, y, z}).

export function stageShotFx(game) {
  try {
    if (!game || !game.scene || !game.player || !game.player.pos) return 0;
    const THREE = game.THREE || (typeof window !== 'undefined' ? window.THREE : null);
    if (!THREE) return 0;

    const enemies = game.combat && typeof game.combat.livingEnemies === 'function'
      ? game.combat.livingEnemies()
      : null;
    if (!enemies || enemies.length === 0) return 0;

    const px = game.player.pos.x;
    const pz = game.player.pos.z;

    // Nearest living enemy to the player (2D distance).
    let nearest = null;
    let nearestD2 = Infinity;
    for (const e of enemies) {
      if (!e || !e.pos) continue;
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = e;
      }
    }
    if (!nearest) return 0;

    const ex = nearest.pos.x;
    const ez = nearest.pos.z;

    // Enemy muzzle (1.4 m up) and player chest (1.2 m up).
    const enemyMuzzle = new THREE.Vector3(ex, 1.4, ez);
    const playerChest = new THREE.Vector3(px, 1.2, pz);
    // Player muzzle (1.3 m up) and enemy chest (1.2 m up).
    const playerMuzzle = new THREE.Vector3(px, 1.3, pz);
    const enemyChest = new THREE.Vector3(ex, 1.2, ez);

    // Tracer 1 endpoint: 0.7 m short of the player chest along muzzle->chest.
    const dir = new THREE.Vector3().subVectors(playerChest, enemyMuzzle).normalize();
    const impact = new THREE.Vector3().copy(playerChest).addScaledVector(dir, -0.7);

    const tracerMat = () => new THREE.LineBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.95,
    });

    // 1. Enemy -> player tracer (muzzle to impact point near the player).
    const geo1 = new THREE.BufferGeometry().setFromPoints([enemyMuzzle, impact]);
    game.scene.add(new THREE.Line(geo1, tracerMat()));

    // 2. Player -> enemy tracer (player muzzle to enemy chest).
    const geo2 = new THREE.BufferGeometry().setFromPoints([playerMuzzle, enemyChest]);
    game.scene.add(new THREE.Line(geo2, tracerMat()));

    const glow = (radius, color, transparent, opacity) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      if (transparent) {
        mat.transparent = true;
        mat.opacity = opacity;
      }
      return new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), mat);
    };

    // Glow spheres (no lifetime; they persist for the still).
    const g1 = glow(0.22, 0xffe9a8, false);           // enemy muzzle flash
    g1.position.copy(enemyMuzzle);
    game.scene.add(g1);

    const g2 = glow(0.4, 0xffc040, true, 0.5);       // enemy muzzle halo
    g2.position.copy(enemyMuzzle);
    game.scene.add(g2);

    const g3 = glow(0.22, 0xffe9a8, false);           // player muzzle flash
    g3.position.copy(playerMuzzle);
    game.scene.add(g3);

    const g4 = glow(0.3, 0xffc040, false);            // impact glow near player
    g4.position.copy(impact);
    game.scene.add(g4);

    return 2;
  } catch (_err) {
    return 0;
  }
}
