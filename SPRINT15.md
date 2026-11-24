# Sprint 15 — Solmar Bay: drivable boat + day/night cycle, mission 15, WASTED screen

Base commit: `cb4ad53` (sprint 14). Recording v15: `01a20cbd`.
Deadline: submit by 24 Nov 2026 22:00 WIB (1 submit of quota left — this sprint is
a push-only candidate; the submit itself is the main session's call).

## What is new

1. **Drivable speedboat "BAY RUNNER"** (`game/src/boat.js`, new, 476 lines).
   Moored at the south pier, DOCK (10, 336). Walk to the pier head, press E to
   board; W/S throttle, A/D steer, E steps off — only near the dock, so the boat
   can never be abandoned at sea. Top speed 32 m/s (~115 km/h), wake spray above
   4 m/s, hull clamped to water via `city.js isInWater()`. Player position tracks
   the boat, so camera, police and HUD follow for free (same trick as the heli).
   Own HUD hint line (`#hud-boat`); the car panel is reused (name BAY RUNNER,
   speed km/h, controls line) and the speedometer reads `game.boat.speed`;
   minimap shows a cyan dot.
2. **Day/night cycle** (`game/src/daynight.js`, new, 351 lines). One game day =
   480 real seconds (3 game-minutes per real second), starting at 18:47 sunset.
   The opening frame is pixel-identical to before: the sunset palette copies the
   old hardcoded light/sky/fog values verbatim, and `sunOffset()` at 18:47
   returns exactly (-220, 55, 140). Four keyframes (night / dawn / day / sunset)
   drive sun + hemisphere light, sky background, fog, sun offset and the shared
   street-lamp material (lamps glow at night, dim by day). `DayNight` owns the
   clock now and writes `game.clockMinutes` back, so the HUD clock keeps working.
   Frozen in shot/demo/selftest modes under the same gate missions use.
3. **Mission 15 "King of Solmar"** (`game/src/missions.js`, +82 lines) — the
   epilogue: steal a fresh red Comet GT in the east blocks (86, -96, 180 s
   timer), new stage type `loseHeat` (the theft puts the player at 5 stars via
   `police.addHeat(220)`; the stage clears at ≤ 2 stars), then deliver to the
   harbour docks (234, -26). Reward $12,000. Unlocks from `_completeMission()`
   of mission 14. The king car is (re)spawned on every (re)start so a retry
   after a fail or death never strands the player.
4. **WASTED screen** (`game/src/hud.js` `showWasted()`/`hideWasted()`,
   `game/index.html`, `game/style.css`): classic GTA-style WASTED overlay on
   death; respawn charges a flat **$100 hospital fee** (was: half the cash) via
   the `#btn-respawn` handler (`HOSPITAL_FEE = 100` in `main.js`).
5. **README**: "ten story missions" (stale since sprint 11) → fifteen, with the
   heli and King of Solmar beats added to the intro.

## Wire-up (coordinator, `main.js` + `hud.js`)

- `main.js`: imports `Boat` + `DayNight`; constructs both next to `flyHeli` /
  `grenades` and exposes them as `game.boat` / `game.daynight`; `boat.update()`
  in the `playing` branch right after `flyHeli.update()`; `boat.forceExit()` in
  `respawn()` next to `flyHeli.forceExit()`; `updateSun()` uses
  `daynight.sunOffset()`; the old `game.clockMinutes += dt * 0.5` line is
  deleted; `daynight.update(dt, ...)` runs under the same freeze gate as
  `missions.update()`.
- One recorded deviation: DayNight's contract says construct right after
  `dressCity()` + `scene.add(city.group)`, but `game` does not exist yet at that
  point in `main.js`, so both systems are constructed with the other systems —
  the city is already in the scene, so the lamp scan still works, and the
  opening sunset is unchanged (verified live: sun 1.59, bg #895a89 at 18:50).
- `hud.js`: car panel gains a `player.mode === 'boat'` branch (BAY RUNNER);
  speedometer shows boat speed; minimap draws the boat dot after the heli block.
  Mission panel already reads `n/15` (builder C).

## Live verification (coordinator, headless Chromium + Playwright, swiftshader)

Game time runs ~20x slower than wall time under swiftshader; all probes below
ran with that in mind. Zero page errors in every run.

- **Selftest** (`?selftest`, 45 s wait): **SELFTEST OK** — 0 errors; counts
  scene 81, traffic 14, parked 14, peds 26, **missionDefs 15**; interactions
  7/7 (radio, weapon, crew, arms, garage, buyArms, buyGarage).
- **Boat**: teleported to the pier head (7, 334) — hint "Tekan [E] — Naik
  speedboat BAY RUNNER" appeared; E boarded (`mode: 'boat'`, `active: true`);
  car panel showed BAY RUNNER / SPEED 0 km/h / "W/S gas · A/D belok · E turun
  di dermaga"; speedometer showed 0 km/h. Held W 3 s → 1.4 m/s (5 km/h);
  held W 12 s → **7.4 m/s (27 km/h)**, above the 4 m/s wake threshold, so the
  wake spray is live. Teleported the boat back to the dock, E stepped off
  (`mode: 'foot'`, player at (5, 336) on the pier).
- **Day/night**: opening 18:47 — sun 1.59, bg #895a89, lampGlow 1 (matches the
  old hardcoded sunset). `setTime(0,0)` → night, sun 0.12, bg #070d1d,
  lampGlow 1, `isNight()` true. `setTime(12,0)` → day, sun 2.0, bg #87b5e0,
  lampGlow 0. `update(60, false)` from 18:47 → 21:47, clock synced
  (game.clockMinutes 1307). `update(60, true)` frozen (no change).
  `sunOffset()` at 18:47 = exactly (-220, 55, 140).
- **Mission 15**: defs 15, last "King of Solmar", $12,000, stages
  steal (86,-96, 180 s) → loseHeat → deliver (234,-26). `startMission(14)`
  spawned the red Comet GT at (86, -96) with the beacon on it and 180 s on the
  timer. Stole it with E → `mode: 'car'`, stage 1, **wanted 5**, heat ~220.
  Cooled heat to 50 → wanted 1 → stage 2 (deliver to the docks). Delivered
  (dialogue cleared first) → **idx 15, state 'done', cash $250 → $12,250,
  story-complete screen shown**. Full epilogue loop works end to end.
- **WASTED**: set health 0 → state `wasted`, `#screen-wasted` shown ("WASTED —
  Dana wakes up at Solmar General. Hospital fee: $100…"). Clicked Respawn →
  state `playing`, health 100, **cash $250 → $150 (exactly −$100)**, respawned
  at the hospital.
- **Regression**: the plain page load still auto-plays the Harbor Heat demo
  (pre-existing autopilot behaviour, not a sprint-15 change); mission panel
  reads `n/15` everywhere.

## Screenshots (all 1280x720, ≤ 256 KiB, exactly 4 files)

- `1-chase.jpg` (107,469 B): the BAY RUNNER at the pier at sunset — white/blue
  hull, windscreen, red seats, outboard motor; HUD panel "BAY RUNNER / SPEED
  21 km/h / W/S gas · A/D belok · E turun di dermaga" and the hint line at the
  bottom; purple-orange sunset sky, ocean, ferris wheel. (Mission 9 dialogue
  visible — the page auto-plays the Harbor Heat demo on a plain load.)
- `2-driving.jpg` (82,941 B): night street scene, 00:30 on the clock — dark sky,
  glowing street lamps and lit windows, Dana on foot in Downtown Solmar, the
  orange grenade beam, WANTED banner. Proves the night palette in a real frame.
- `3-onfoot.jpg` (95,312 B): Dana on foot at sunset, WANTED banner, SBPD
  dispatch (Unit 7 — Vega · PURSUE · 103 m), Mira dialogue, city skyline.
- `4-shootout.jpg` (109,674 B): roadblock with police cars, AIR-1 helicopter
  with spotlight cone, "ROADBLOCK AHEAD — 6m", dispatch list, Dana on the Coast
  Runner bike at 134 km/h, mission 13/15 "One Last Job".

## Dossier

`node main.ts` → **exit 0**, `/output/dossier.json` **696,495 bytes**
(0.66 MiB < 1.5 MiB cap). `node --check` passes on `main.js`, `hud.js`,
`boat.js`, `daynight.js`, `missions.js`.

## Files changed (vs `cb4ad53`)

- New: `game/src/boat.js`, `game/src/daynight.js`
- Edited: `game/src/main.js` (wire-up), `game/src/hud.js` (boat panel,
  speedometer, minimap, WASTED), `game/src/missions.js` (mission 15),
  `game/src/autopilot.js` (selftest `missionsOk === 15`), `game/index.html`,
  `game/style.css` (WASTED styling), `README.md` (15 missions)
- Regenerated: all 4 screenshots
- This file: `SPRINT15.md`
