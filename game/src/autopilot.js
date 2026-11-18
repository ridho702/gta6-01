// Solmar Bay — autopilot and self-test hooks, driven by URL query params.
// ?shot=1..4 stages a fixed scene for screenshots, ?demo=1 runs a slow
// camera orbit over the living city, ?selftest=1 records a checks object on
// window.__selftest. These paths also skip the start menu so headless
// Chrome can capture the game without a click.

import { dist2 } from './util.js';

function clearDialogue(game) {
  game.missions.dialogue = [];
  game.missions.dialogueIdx = 0;
  game.hud.hideDialogue();
}

function putPlayerInCar(game, x, z, angle, speed) {
  const rec = game.player.spawnStarterCar(x, z, angle);
  game.player.enterCar(rec);
  if (game.player.car) game.player.car.speed = speed;
  game.camYaw = angle + Math.PI; // camera behind the car
  game.camDist = 13;
}

export function applyAutopilot(game) {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const demo = params.get('demo') === '1';
  const selftest = params.get('selftest') === '1';
  if (!shot && !demo && !selftest) return { shot: null, demo: false, selftest: false };

  // Skip the menu: straight into the world.
  game.startGame({ silent: true });

  if (demo) {
    game.demoOrbit = true;
    game.player.pos.x = 0;
    game.player.pos.z = -20;
    game.player.angle = Math.PI;
    return { shot: null, demo: true, selftest };
  }

  if (shot === '1') {
    // Police chase: the player fleeing up the central avenue, four stars.
    // Heat 185 stays at four stars after a few seconds of cool-off.
    putPlayerInCar(game, 0, 120, Math.PI, 24);
    game.police.addHeat(185);
    game.police._spawnTimer = 0;
    game.missions.startMission(4);
    clearDialogue(game);
    // A three-quarter camera angle so the chasing police read in frame.
    game.camYaw = 0.55;
  } else if (shot === '2') {
    // City driving: cruising east on a cross street, no heat.
    putPlayerInCar(game, -120, 0, Math.PI / 2, 22);
    game.missions.startMission(1);
    clearDialogue(game);
    game.camYaw = -Math.PI / 2;
  } else if (shot === '3') {
    // On foot downtown, looking up the avenue toward the bank tower.
    game.player.pos.x = 0;
    game.player.pos.z = -20;
    game.player.angle = Math.PI;
    game.camYaw = 0.45;
    game.camDist = 8;
    game.missions.startMission(0);
    clearDialogue(game);
  } else if (shot === '4') {
    // Docks shootout: Vultures closing in, one star on the board.
    const d = game.city.landmarks.docks;
    game.player.pos.x = d.x - 18;
    game.player.pos.z = d.z + 6;
    game.player.angle = Math.PI / 2;
    game.camYaw = -Math.PI / 2 + 0.5;
    game.camDist = 10;
    game.missions.startMission(3);
    game.missions.stage = 1;
    game.missions._beginStage();
    clearDialogue(game);
    game.police.addHeat(25);
    // Fire one shot toward the nearest Vulture for a live tracer.
    const enemies = game.combat.livingEnemies();
    if (enemies.length > 0) {
      let best = enemies[0];
      let bestD = Infinity;
      for (const e of enemies) {
        const dd = dist2(game.player.pos.x, game.player.pos.z, e.pos.x, e.pos.z);
        if (dd < bestD) {
          bestD = dd;
          best = e;
        }
      }
      const o = { x: game.player.pos.x, y: 1.5, z: game.player.pos.z };
      const dir = { x: best.pos.x - o.x, y: 0, z: best.pos.z - o.z };
      const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      dir.x /= len;
      dir.z /= len;
      game.combat.shoot(o, dir, 60, enemies);
    }
  }

  if (selftest) {
    window.setTimeout(() => {
      const checks = {
        noErrors: (window.__errors || []).length === 0,
        renderer: !!game.renderer,
        scenePopulated: game.scene.children.length > 50,
        trafficCars: game.traffic.cars.length === 14,
        parkedCars: game.traffic.parked.length === 12,
        pedestrians: game.peds.list.length === 26,
        missions: game.missions.defs.length === 6,
        playerAlive: game.player.health > 0,
      };
      checks.errors = window.__errors || [];
      const ok = Object.keys(checks).every((k) => k === 'errors' || checks[k] === true);
      window.__selftest = { ok, checks };
      document.title = ok ? 'SELFTEST OK' : 'SELFTEST FAIL';
      // eslint-disable-next-line no-console
      console.log('SELFTEST', JSON.stringify(window.__selftest));
    }, 2000);
  }

  return { shot, demo, selftest };
}
