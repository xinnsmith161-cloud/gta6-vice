// Screenshot scenes behind ?shot=cover|chase|mission|night. Each one sets
// the world to a moment that shows several systems at once, then lets the
// game run for a few seconds (traffic moving, police chasing) before the
// screenshot is taken. Deterministic for a fixed seed.
import { BLOCK, GRID_N, roadCoord, BEACH_Z } from './config.js';

/**
 * Stage a scene. `game` is the main game object (see main.js).
 * Returns the seconds to let the world settle before the shot.
 */
export function stageShot(name, game) {
  const g = game;
  g.hud.showScreen(null);
  g.state = 'playing';
  g.audio.ensure();
  g.audio.setMuted(true); // screenshots run silent
  g.input.enabled = false;

  if (name === 'chase') {
    // Driving with a 3-star wanted level, police in pursuit, HUD lit up.
    // Long straight east-west road so the chase stays on the asphalt.
    g.timeOfDay = 0.24;
    const car = g.spawnPlayerCar(-200, roadCoord(2), Math.PI / 2, 0xd92b2b, false);
    g.player.enterCar(car);
    g.police.stars = 3;
    g.police.crimeTimer = 0;
    for (let i = 0; i < 3; i += 1) g.police.spawnNear(car.pos.x, car.pos.z, 30);
    g.missions.stageForShot(2, 0);
    g.hud.setObjective('Reach the safehouse — lose the cops');
    g.camMode = 'chaseback';
    g.shotThrottle = 0.45; // slower so the police stay on the tail
    return 4;
  }
  if (name === 'mission') {
    // On foot on the beach, facing the city and the pickup beacon.
    g.timeOfDay = 0.3;
    g.player.teleport(-190, 335, Math.PI);
    g.missions.stageForShot(0, 0);
    g.hud.setObjective('Pick up the client at the beach');
    g.camMode = 'foot';
    g.camYaw = Math.PI;
    g.camPitch = 0.2;
    return 3;
  }
  if (name === 'night') {
    // Dusk on the neon strip, on foot, sports car parked nearby.
    g.timeOfDay = 0.55;
    g.player.teleport(roadCoord(3) + 8, roadCoord(2) + 6, Math.PI * 0.75);
    g.spawnPlayerCar(roadCoord(3) + 2, roadCoord(2) + 10, Math.PI / 2, 0xd21f1f, true);
    g.missions.stageForShot(3, 0);
    g.hud.setObjective('Steal Kane\'s red Comet at the docks');
    g.camMode = 'foot';
    g.camYaw = Math.PI * 1.2;
    g.camPitch = 0.3;
    return 3;
  }
  // Default: cover — driving through the city at noon, traffic + HUD + minimap.
  g.timeOfDay = 0.25;
  const car = g.spawnPlayerCar(roadCoord(2), roadCoord(1) - 60, 0, 0x2b6fd9, false);
  g.player.enterCar(car);
  g.missions.stageForShot(0, 1);
  g.hud.setObjective('Drop the client at the Solmar Hotel');
  g.camMode = 'car';
  return 4;
}

/**
 * Autopilot for shot mode: drive the player's car down the road, and on
 * foot stand still (the camera does the work). Returns {throttle, steer}.
 */
export function autopilot(game, dt) {
  const g = game;
  if (!g.player.inCar) return { throttle: 0, steer: 0, handbrake: false };
  const car = g.player.inCar;
  // Steer toward the nearest road centreline ahead.
  const fwd = car.forward();
  const ahead = { x: car.pos.x + fwd.x * 18, z: car.pos.z + fwd.z * 18 };
  const city = g.city;
  const nearX = city.nearestRoad(ahead.x);
  const nearZ = city.nearestRoad(ahead.z);
  // Prefer the axis the car is mostly travelling along.
  let targetHeading = car.heading;
  if (Math.abs(fwd.x) > Math.abs(fwd.z)) {
    const dz = nearZ - car.pos.z;
    targetHeading = Math.atan2(fwd.x, fwd.z) + Math.max(-0.5, Math.min(0.5, dz * 0.03));
  } else {
    const dx = nearX - car.pos.x;
    targetHeading = Math.atan2(fwd.x, fwd.z) + Math.max(-0.5, Math.min(0.5, -dx * 0.03));
  }
  let dh = targetHeading - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dh * 2.2));
  // Chase shots run slower so the police can stay on the player's tail.
  const throttle = g.shotThrottle !== undefined ? g.shotThrottle : 0.75;
  return { throttle, steer, handbrake: false };
}
