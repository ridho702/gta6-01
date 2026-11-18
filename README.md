# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridho702/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridho702/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay — an original 3D open-world crime game in the spirit of GTA VI, built from scratch in a single recorded agent session. Dana Reyes returns to a sun-soaked fictional coastal city with $250 and a debt to Marlow, and works it off across six story missions: stealing a Comet GT, running timed courier drops, clearing the docks of the Vultures gang, cracking the Solmar Bank vault, and escaping to the pier with the case from the airfield.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests: the game is plain static files under `game/`, with three.js vendored at `game/vendor/three.min.js`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pxdmc197&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## What is in the game

- **A procedural city**: a 10×10 street grid with ~150 buildings (canvas-painted facades), a beach and animated ocean to the south, a pier, an airfield with a runway and a prop plane to the north, and named landmarks — hospital, Solmar Bank, Marlow's Garage, paint shop, mall, docks, safehouse.
- **Traffic and pedestrians**: 14 cars following the street grid, 12 stealable parked cars, 26 pedestrians strolling the sidewalks who flee from gunfire and speeding cars.
- **Six story missions with dialogue**: Fresh Start, Hot Wheels, Courier Run, Dockside Trouble, The Getaway, The Big Score — steal / deliver / timed / combat / vault-crack / escape stages, with a yellow beacon and a minimap marker on every objective.
- **A 5-star wanted system**: police cars that chase and ram (flashing light bars, sirens) and foot cops who can bust the player. Heat cools off when you lay low.
- **Combat**: hitscan pistol with tracers and impact bursts (blocked by buildings, so cover matters), fist punches, and gang enemies who shoot back.
- **HUD**: health, cash, ammo, clock, wanted stars, objective with distance, a circular minimap, and a speedometer while driving. Start screen, pause menu, wasted / busted respawns, and a localStorage save that autosaves after every mission.
- **Sound**: everything is synthesized with the Web Audio API — a funk groove, engine hum, sirens, gunshots, horns, and cash chimes. No audio files.
- **Controls**: WASD move / drive, Shift sprint, E enter car / interact, mouse drag to orbit the camera, click to shoot, F punch, Space handbrake, H horn, C camera, P pause, M mute.

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` (Node 22, standard library only).
- `serve.ts` — a tiny static server for local play on port 8080.
- `game/` — the whole game: `index.html`, `style.css`, `src/*.js` (one module per system), and `vendor/three.min.js` (three.js r160).
- `screenshots/` — four staged shots of the game (police chase, driving, on foot, docks shootout).
- `shots.json` — the query strings that stage each screenshot.
