# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridho702/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridho702/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — an original open-world crime game in the browser, built for make.fun's "Make GTA 6" bounty. Dana Reyes is back in Solmar Bay — a sun-soaked coastal city of your own — with $250 and a debt to Marlow. Steal cars, outrun the Bay Police, run six story missions, and take the city for yourself. Everything is original: the city, characters, vehicles, story, art and music (synthesized with WebAudio). Nothing from any commercial game.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`. The game plays fully offline — every script, texture and sound is generated or vendored under `game/`.

## Play

- **On foot** — WASD move, Shift sprint, E get in a car, LMB shoot, F punch, drag mouse to look
- **Driving** — W/S accelerate & brake, A/D steer, Space handbrake, E leave car, H horn
- **Wanted** — crimes raise your stars; Bay Police cars and foot cops respond. Lose them, or get busted / wasted
- **Missions** — follow the yellow beam and the minimap marker through six story jobs, from "Fresh Start" to "The Big Score"
- **Save** — progress auto-saves after every mission; P pauses (save / resume / restart)

## Features

3D city with traffic and pedestrians, stealable cars, wanted system with police chases, combat, six story missions with dialogue, HUD with circular minimap, day clock, pickups, synthesized music and sound effects, save/load via localStorage, and a debug autopilot (`?demo=1`, `?shot=1..4`) for screenshots.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pxdmc197&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
