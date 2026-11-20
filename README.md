# Solmar City

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/xinnsmith161-cloud/gta6-vice/rank.svg)
![reward](https://make.fun/badge/gta6-01/xinnsmith161-cloud/gta6-vice/reward.svg)

An open-world crime game in the browser, built for the
[Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on make.fun.

You are Jax Moreno, a driver-for-hire in Solmar City — a sun-soaked
coastal city of your own, far from any Rockstar map. Rosa Delgado, your
fixer, calls with jobs. The rival crew Los Tiburones, led by Kane, owns
the north docks. Work your way up: four story missions, from a first
fare on the beach to stealing Kane's red Comet sports car.

## Play

Serve the `game/` folder with any static server and open
`game/index.html` in a desktop browser (or run `node serve.ts` and open
http://localhost:8080). No network, no install, no account — everything
is local files, and the game runs fully offline.

- **WASD** — move / drive · **Mouse** — look (click to lock the pointer)
- **E** — enter / exit a car (steal any parked car)
- **Space** — handbrake · **Shift** — sprint
- **Left click** — shoot the pistol · **R** — reload
- **M** — mute · **Esc** — pause / resume
- **P** — pause

## What is in the city

- A full 3D city to explore **on foot and by car**: a road grid, a
  beach with umbrellas and strollers, a plaza with a fountain, Solmar
  Tower, and a neon strip that lights up at dusk.
- **Traffic**: AI cars driving the roads (they turn at intersections
  and slow for the car ahead) and pedestrians on the sidewalks who flee
  when shots are fired.
- **Cars to steal**: parked cars all over the city — approach one and
  press E. Each handles a little differently; the Comet is the fastest.
- **Wanted level**: commit crimes and the police respond — up to 5
  stars, with patrol cars that chase, ram, and (at 3+ stars) shoot.
  Lie low and the heat decays; get busted on foot and it is over.
- **Four story missions** with dialogue, objectives, beacons, and
  payouts ($200 → $400 → $600 → $1,500), plus free-roam money pickups.
- **Combat**: pistol with tracers and reload, melee punch, explosions,
  and a health system with pickups.
- **HUD + minimap**: health, money, wanted stars, objective, clock,
  speed, and a live canvas minimap showing you, traffic, police, and
  mission markers.
- **Save system**: progress (money, missions, best wanted level) is
  saved to localStorage — continue where you left off.
- **Sound**: fully synthesized with WebAudio — engine hum, sirens,
  gunshots, pickup chimes, and a music loop. No audio files.
- **Day cycle**: a full day passes in ten minutes; the sun, sky, and
  streetlights follow it.

## Tech

- Three.js (vendored minified under `game/vendor/`) for 3D, plain ES
  modules for the game itself — every system is its own file under
  `game/src/` (`city`, `traffic`, `police`, `missions`, `player`,
  `vehicles`, `combat`, `hud`, `audio`, `save`, `effects`, `shots`).
- All textures are procedural (canvas-generated); all sound is
  synthesized. Nothing is fetched from the network.

## Screenshots

Four real renders of the game, in `screenshots/` (first by name is the
cover): driving through the city, a 5-star police chase, a mission on
the beach, and dusk on the neon strip. They are produced from the game
itself with `?shot=cover|chase|mission|night&seed=1` — see `shots.json`.

## Build

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.
