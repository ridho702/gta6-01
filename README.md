# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridho702/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridho702/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay — an original 3D open-world crime game in the spirit of GTA VI, built from scratch in a single recorded agent session. Dana Reyes returns to a sun-soaked fictional coastal city at golden hour with $250 and a debt to Marlow, and works it off across fifteen story missions: stealing a Comet GT, running timed courier drops, racing rival Vex through the neon streets, stealing a collector's Solstice S, clearing the docks of the Vultures gang, cracking the Solmar Bank vault, escaping to the pier with the case from the airfield, flying the SEAGULL helicopter, and finally earning the crown as King of Solmar — while the SBPD dispatch, its AIR-1 helicopter and roadblocks close in.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests: the game is plain static files under `game/`, with three.js vendored at `game/vendor/three.min.js`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pxdmc197&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## What is in the game

- **A procedural city at golden hour**: a 10×10 street grid with ~150 buildings (canvas-painted facades), a beach with palms and umbrellas and an animated ocean to the south, a neon ferris wheel on the pier, an airfield with a runway and a prop plane to the north, and named landmarks — hospital, Solmar Bank, Marlow's Garage, paint shop, mall, docks, safehouse. Low warm sun, purple-orange dusk sky and long shadows; the HUD clock reads 18:47.
- **Traffic and pedestrians**: 14 cars following the street grid, 12 stealable parked cars with original names (Comet GT, Solstice S, Meridian LX…) and a condition % that drops with crashes and shows smoke damage below 35%, 26 pedestrians strolling the sidewalks who flee from gunfire and speeding cars.
- **Ten story missions with dialogue**: Fresh Start, Hot Wheels, Courier Run, Dockside Trouble, The Getaway, Neon Street Race (timed checkpoints vs rival Vex), The Collector (steal the silver Solstice S), Vulture War (two gang clear-outs), Harbor Heat (bank fight + escape), The Big Score — steal / deliver / timed / combat / vault-crack / escape stages, with a yellow beacon and a minimap marker on every objective. Each completed job pays cash and REP toward the ranks HUSTLER → RUNNER → FIXER → SHOT CALLER → BAY KING.
- **A 5-star wanted system**: police cars that chase and ram (flashing light bars, sirens) and foot cops who can bust the player. Named SBPD units with dispatch roles (PURSUE, RAMMING, CLOSING IN, ROADBLOCK, SPOTLIGHT, FLANKING) show in a live dispatch panel with distances. At 3+ stars the AIR-1 helicopter circles with a searchlight; at 4+ stars roadblocks are thrown across the road ahead. Heat cools off when you lay low, and crew member Mira's **Swap Plates** ability (Z, 60s cooldown) drops one wanted star.
- **Combat and weapons**: hitscan shooting with tracers and impact bursts (blocked by buildings, so cover matters), fist punches, and gang enemies who shoot back. Four weapon slots (1–4): FISTS, HARBOR 9 pistol, RIPTIDE SMG (auto, $800) and BREAKER 12 shotgun (6 pellets, $1,500), each with its own damage, fire rate, spread and ammo pool; SMG and shotgun are bought with cash at Solmar Arms (rank-locked), ammo restocked there too.
- **Shops and garage**: walk up to Solmar Arms (weapons + ammo) or Marlow's Garage (full repair $150, engine tune +8% top speed per stage up to 3, body armor +50) and press E — buying spends cash and earns REP.
- **Radio**: three original stations — BAY FM 88.5 (Sunset Drive), HARBOUR STATIC 101.3 (Night Static), NEON TIDE 96.9 (Chrome Nights) — each with its own songs, tempo and bass groove, synthesized live; R switches station, the now-playing song shows in the HUD and rotates every ~24s.
- **Dense HUD**: mission panel (n/10, stage x/y + progress bar, timer), SBPD dispatch panel, weapon slots with LOCKED prices, rank/respect bar, wanted stars, car panel (name, condition %, speed, gear, tune/armor), radio strip, district label that follows the player's position, WANTED / IN SIGHT / ROADBLOCK AHEAD alerts, dialogue box with a canvas-drawn speaker portrait, and a circular minimap (traffic, police, heli, roadblocks, enemies, mission target).
- **HUD**: health, cash, ammo, clock, wanted stars, objective with distance, a circular minimap, and a speedometer while driving. Start screen, pause menu, wasted / busted respawns, and a localStorage save that autosaves after every mission.
- **Sound**: everything is synthesized with the Web Audio API — a funk groove that retunes per radio station, engine hum, sirens, gunshots, horns, and cash chimes. No audio files.
- **Controls**: WASD move / drive, Shift sprint, E enter car / interact, mouse drag to orbit the camera, click to shoot, F punch, 1–4 weapons, R radio, Z Mira: Swap Plates, Space handbrake, H horn, C camera, P pause, M mute.
- **Chase camera**: while driving the camera eases in low and close behind the car; drag to look around.

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` (Node 22, standard library only).
- `serve.ts` — a tiny static server for local play on port 8080.
- `game/` — the whole game: `index.html`, `style.css`, `src/*.js` (one module per system: `progress.js` ranks/weapons/radio/districts, `airunit.js` helicopter + roadblocks, `shops.js` gun shop + garage, plus city, traffic, player, police, combat, missions, HUD, audio), and `vendor/three.min.js` (three.js r160).
- `screenshots/` — four staged shots of the game (golden-hour police chase with AIR-1 + roadblock, beach drive past the ferris wheel, on-foot SMG shootout with dialogue, five-star final escape at the airfield).
- `shots.json` — the query strings that stage each screenshot.
