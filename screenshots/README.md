# Solmar Bay — Screenshots

Four staged gameplay screenshots for the make.fun entry, 1280×720 JPEG
(quality 88). Captured headless via the CDP driver
(`/tmp/cdp-run.mjs`, Chrome remote debugging on 127.0.0.1:9333+) from
`game/index.html?shot=N&seed=1`. Staging lives in
`game/src/autopilot.js` (`stageShot()`) and `game/src/staging-fx.js`;
the seed is fixed, so re-running the driver reproduces the same staging.

Regenerate one shot:

```
node /tmp/cdp-run.mjs "?shot=<N>" /tmp/s12-selftest.js screenshots/<file>.jpg 9000
```

Last regenerated: 22 Nov 2026 (sprint 12, recording v12). All four staged
cleanly with zero page errors (`window.__errors` empty in the CDP diag).
Missions now 12 (was 10); weapon slots now 6 (sniper + RPG added).

## 1-chase.jpg — heli chase + roadblock

- Mission 9/12 **"Harbor Heat"**, stage 1/3 — "Go to Solmar Bank".
- Staging: player in car at (0, 120), heading π, speed 24; heat 185
  (5 wanted stars); SMG owned, 120 ammo; rep 500. Roadblock
  pre-spawned ahead of the car. Camera: `camYaw 0.55, camDist 10,
  camPitch 0.15`; heli held at `holdAngle = camYaw + π + 0.15`,
  height 12.
- What is visible: police helicopter overhead with a searchlight cone
  shining down on the player's grey car; amber banner
  "⚠ ROADBLOCK AHEAD — 52m"; SBPD DISPATCH panel listing four units
  (Vega PURSUE, Rook RAMMING, Marlowe CLOSING IN, Kestrel ROADBLOCK)
  plus "ROADBLOCK · 1 set up ahead"; red "SOLMAR ARMS" neon sign;
  downtown buildings; minimap with the roadblock marker; speedometer
  117 km/h; radio "BAY FM 88.5 — Coral Skyline — The Palmettos".
  Weapon slots now list [5] LONGSHOT 50 · LOCKED $2500 and
  [6] HARBOUR RAIN RPG · LOCKED $4000.

## 2-driving.jpg — beach-road driving, ferris wheel + pier

- Mission 6/12 **"Neon Street Race"**, stage 1/3 — "Checkpoint 1/3:
  the pier".
- Staging: player in car at (-130, 300), heading π/2, speed 10; rep
  180. Eight pedestrians placed along the sidewalk and six traffic
  cars placed ahead on the beach road. Camera: `camYaw -π/2,
  camDist 8`.
- What is visible: large ferris wheel with colourful cabins dominating
  the centre-left skyline; the pier boardwalk and ocean on the right;
  a tall pale tower on the horizon; pedestrians on the sidewalk;
  traffic cars ahead in both lanes; the player's blue "Dune Runner"
  at 68 km/h; "BOARDWALK BEACH" district label; mission timer
  "90s LEFT". A green traffic motorcycle is visible on the left
  (sprint 12: ~15% of traffic are now bikes).

## 3-onfoot.jpg — on-foot shootout, sniper equipped

- Mission 8/12 **"Vulture War"**, stage 1/4 — "Go to Solmar Mall".
- Staging (sprint 12): player on foot at (0, -20), facing π; heat 55
  (1 wanted star); LONGSHOT 50 sniper selected, 12 ammo; rep 950.
  Four enemies spawned near the player at (-6,-5), (6,-6), (-5,-9),
  (5,-10). Camera: `camYaw 0.15, camDist 5.5`. Orange tracer beams
  staged by `stageShotFx()` from the nearest enemy's muzzle to the
  player's chest.
- What is visible: the player (blue shirt) from behind in the centre
  of the frame; crosshair "+" in the centre; HUD weapon row
  "[5] LONGSHOT 50 · 12" active and "Ammo 12 (LONGSHOT 50)"; a bright
  orange tracer beam crossing the street from an enemy muzzle toward
  the player; red banner "★ WANTED — SBPD IN PURSUIT"; Mira's
  dialogue box bottom-left ("I will watch the exits. Do not let them
  circle you, Dana."); "DOWNTOWN SOLMAR" district label; downtown
  buildings; minimap. (Enemies sit just off-frame left at capture
  time; the tracer beam shows the live firefight.)

## 4-shootout.jpg — roadblock shootout, orange cones, player on a bike

- Mission 10/12 **"The Big Score"**, stage 4/4 — "Escape to the pier".
- Staging: player in car at (0, -240), heading 0, speed 26; heat 220
  (5 wanted stars); shotgun owned, 24 ammo; rep 950. Roadblock moved
  closer to z=-216 with two police cars at (-5,-215) and (5,-217).
  Six orange traffic cones placed across the road at x = -7.5, -4.5,
  -1.5, 1.5, 4.5, 7.5, z=-232. Camera: `camYaw π, camDist 11,
  camPitch 0.15`; heli held at `holdAngle = camYaw + π + 0.55`,
  height 17, radius 28.
- What is visible: six orange cones in a row across the road directly
  ahead; two roadblock police cars with blue lights behind the cones;
  police helicopter with searchlight top-left; amber banner
  "⚠ ROADBLOCK AHEAD — 8m"; SBPD DISPATCH panel (four units +
  "ROADBLOCK · 1 set up ahead"); "NORTH HEIGHTS" district label;
  speedometer 131 km/h. The player vehicle this capture is a
  "Coast Runner" motorcycle (sprint 12 bikes enter traffic and the
  staging vehicle pool) — vehicle panel top-right reads
  "Coast Runner".
