export function stageShotFx(game) {
  try {
    if (!game || !game.scene || !game.player || !game.player.pos) return 0;
    const THREE = game.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
    if (!THREE) return 0;
    if (!game.combat || typeof game.combat.livingEnemies !== 'function') return 0;
    const enemies = game.combat.livingEnemies();
    if (!enemies || enemies.length === 0) return 0;

    const px = game.player.pos.x;
    const pz = game.player.pos.z;

    // Musuh terdekat dari pemain (jarak kuadrat di bidang xz).
    let nearest = null;
    let nearestDistSq = Infinity;
    for (const e of enemies) {
      if (!e || !e.pos) continue;
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq;
        nearest = e;
      }
    }
    if (!nearest) return 0;

    const ex = nearest.pos.x;
    const ez = nearest.pos.z;

    const enemyMuzzle = new THREE.Vector3(ex, 1.4, ez);
    const playerChest = new THREE.Vector3(px, 1.2, pz);
    const playerMuzzle = new THREE.Vector3(px, 1.3, pz);
    const enemyChest = new THREE.Vector3(ex, 1.2, ez);

    const dir = playerChest.clone().sub(enemyMuzzle).normalize();
    const impact = playerChest.clone().add(dir.clone().multiplyScalar(-0.7));

    function addBeam(from, to) {
      const segDir = to.clone().sub(from);
      const len = segDir.length();
      if (len <= 0) return;
      segDir.normalize();
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        segDir
      );

      const outerGeo = new THREE.CylinderGeometry(0.15, 0.15, len, 8, 1, true);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffb040,
        transparent: true,
        opacity: 0.55,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.position.copy(mid);
      outer.quaternion.copy(quat);
      game.scene.add(outer);

      const coreGeo = new THREE.CylinderGeometry(0.06, 0.06, len, 8, 1, true);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff6c0,
        transparent: true,
        opacity: 0.95,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.copy(mid);
      core.quaternion.copy(quat);
      game.scene.add(core);
    }

    addBeam(enemyMuzzle, impact);
    addBeam(playerMuzzle, enemyChest);

    function addGlow(radius, color, transparent, opacity, at) {
      const geo = new THREE.SphereGeometry(radius, 12, 8);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent,
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(at);
      game.scene.add(mesh);
    }

    addGlow(0.22, 0xffe9a8, false, 1, enemyMuzzle);
    addGlow(0.4, 0xffc040, true, 0.5, enemyMuzzle);
    addGlow(0.22, 0xffe9a8, false, 1, playerMuzzle);
    addGlow(0.3, 0xffc040, false, 1, impact);

    return 2;
  } catch (err) {
    return 0;
  }
}
