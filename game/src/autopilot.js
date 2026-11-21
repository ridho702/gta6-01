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
    // Police chase at golden hour: the player fleeing up the central
    // avenue in the Comet GT, four stars, AIR-1 overhead and a roadblock
    // ahead. The dispatch panel, alert banner and heli sell the chase.
    putPlayerInCar(game, 0, 120, Math.PI, 24);
    game.police.addHeat(185); // 4 stars with decay headroom (threshold 140)
    game.police._spawnTimer = 0;
    game.progress.addRep(500); // FIXER rank for a full HUD
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    game.missions.startMission(8); // Harbor Heat — escape energy
    clearDialogue(game);
    // A three-quarter camera angle so the chasing police read in frame.
    game.camYaw = 0.55;
    game.camDist = 10;
  } else if (shot === '2') {
    // Golden-hour beach drive: cruising east along Boardwalk Beach past
    // the palms and the neon ferris wheel, radio on, no heat. The car
    // starts just west of the wheel so it stays ahead in frame, on the
    // ocean-side lane clear of the pines.
    putPlayerInCar(game, -130, 296, Math.PI / 2, 10);
    game.progress.addRep(180); // RUNNER rank
    game.missions.startMission(5); // Neon Street Race
    clearDialogue(game);
    game.camYaw = -Math.PI / 2;
    game.camDist = 8;
  } else if (shot === '3') {
    // On-foot shootout downtown with the SMG: Vultures closing in, Mira
    // talking in the dialogue box, two stars on the board.
    game.player.pos.x = 0;
    game.player.pos.z = -20;
    game.player.angle = Math.PI;
    game.camYaw = 0.45;
    game.camDist = 7;
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    game.progress.selectWeapon('smg');
    game.progress.addRep(420); // FIXER rank
    game.missions.startMission(7); // Vulture War — keep Mira's intro dialogue visible
    game.missions.dialogueIdx = 1; // show Mira's line ("I will watch the exits…")
    game.hud.showDialogue(game.missions.dialogue[1].name, game.missions.dialogue[1].text);
    game._holdDialogue = true; // freeze the dialogue box for the screenshot
    // Vultures closing in on the player's downtown spot (north of the
    // player, ahead of the camera, close enough to read in frame).
    for (const [dx, dz] of [[-6, -12], [6, -16], [0, -21], [-12, -18]]) {
      game.combat.spawnEnemy(game.player.pos.x + dx, game.player.pos.z + dz);
    }
    game.police.addHeat(55);
  } else if (shot === '4') {
    // The final escape: five stars at the airfield, the case in hand,
    // AIR-1 circling and roadblocks on the road to the pier.
    putPlayerInCar(game, 0, -240, 0, 26);
    game.police.addHeat(220); // 5 stars with decay headroom (threshold 190)
    game.police._spawnTimer = 0;
    game.progress.addRep(950); // SHOT CALLER rank
    game.progress.owned.shotgun = true;
    game.progress.ammo.shotgun = 24;
    game.missions.startMission(9); // The Big Score
    game.missions.stage = 3;
    game.missions._beginStage();
    clearDialogue(game);
    game.camYaw = Math.PI;
    game.camDist = 11;
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
        missions: game.missions.defs.length === 10,
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
