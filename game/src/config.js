// Solmar City — tuning constants, city layout and palette.
// One place for every number the rest of the game shares, so balancing
// never means hunting through files.

export const GAME_NAME = 'SOLMAR CITY';
export const SAVE_KEY = 'solmar-city-save-v1';

// ---- City layout (metres) ----
export const BLOCK = 90;            // one city block, road centre to road centre
export const GRID_N = 6;            // 6 x 6 blocks of streets
export const ROAD_W = 14;           // road width
export const SIDEWALK_W = 4;        // sidewalk width each side of a road
export const CITY_SIZE = GRID_N * BLOCK; // 540 m across
export const BEACH_Z = CITY_SIZE / 2 + 40; // sand starts here (south edge)
export const WATER_Z = BEACH_Z + 55;       // water plane beyond the sand

// Road centrelines sit at multiples of BLOCK, centred on the origin.
export function roadCoord(i) {
  return (i - GRID_N / 2) * BLOCK;
}
export function clampToCity(x, z) {
  const m = CITY_SIZE / 2 + 30;
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(BEACH_Z + 40, z)) };
}

// ---- Palette: sun-soaked coastal city ----
export const PALETTE = {
  skyDay: 0x87bfe8,
  skyNight: 0x0b1026,
  sunDay: 0xfff2d8,
  sunNight: 0x8fa8ff,
  ground: 0x3f6b4f,      // grass / ground between blocks
  road: 0x2b2f36,        // asphalt
  roadLine: 0xd8d8d8,
  sidewalk: 0x9aa0a6,
  sand: 0xe8d29a,
  water: 0x1e6f8e,
  building: [0xe8b48a, 0xd98a7a, 0x8ab4d9, 0xf2e3c6, 0xb98ad9, 0x7ac9a8, 0xe8e0d0, 0xc97a6b],
  glass: 0x9fd4e8,
  palmTrunk: 0x7a5a3a,
  palmLeaf: 0x2f9e5f,
  neon: [0xff2e88, 0x22d3ee, 0xffd166, 0x7c3aed, 0x34d399],
  carPaint: [0xd92b2b, 0x2b6fd9, 0xf2c230, 0x27ae60, 0xe8e8e8, 0x222222, 0xe67e22, 0x8e44ad, 0x16a085, 0xc0c0c0],
  policeWhite: 0xf2f2f2,
  policeBlack: 0x1a1a1a,
};

// ---- Player (on foot) ----
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  accel: 40,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 25,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

// ---- Cars ----
export const CAR = {
  accel: 26,          // m/s^2 at full throttle
  brake: 42,
  reverseAccel: 16,
  maxSpeed: 46,       // ~165 km/h
  maxReverse: 12,
  steer: 0.55,        // max steer angle (rad)
  steerSpeed: 2.6,
  grip: 6.5,          // lateral grip
  drag: 0.35,
  rollDrag: 1.6,
  handbrakeGrip: 1.2,
  length: 4.4,
  width: 1.9,
  radius: 1.6,
};
export const SPORTS_CAR = {
  accel: 34,
  maxSpeed: 58,
  steer: 0.62,
  grip: 8.0,
};

// ---- Wanted / police ----
export const WANTED = {
  maxStars: 5,
  decayDelay: 12,      // seconds with no crime before stars start falling
  decayInterval: 9,    // seconds per star lost
  crimeCarTheft: 1,
  crimePedHit: 1,
  crimeShoot: 1,
  crimeCopKill: 2,
  crimeCarDamage: 0,   // bumping cars is free; smashing them is not a crime
  policePerStar: [0, 2, 3, 4, 6, 8],
  policeSpeed: [0, 30, 34, 38, 42, 46],
  bustRadius: 3.2,
  bustTime: 2.5,
};

// ---- Combat ----
export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 70,
  pistolCooldown: 0.22,
  pistolMag: 12,
  policeDamage: 8,
  policeRange: 45,
  policeCooldown: 0.9,
  pedHealth: 50,
  copHealth: 100,
};

// ---- Missions ----
export const MISSION_REWARDS = [200, 400, 600, 1500];
export const MISSION_NAMES = ['First Fare', 'The Pickup', 'Hot Pursuit', 'The Big Score'];

// ---- Traffic ----
export const TRAFFIC = {
  carCount: 26,
  pedCount: 40,
  carSpeed: [9, 14],
  pedSpeed: [1.1, 2.0],
};

// ---- Time of day (0..1, 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = night) ----
export const TIME = {
  dayStart: 0.22,
  cycleSeconds: 600,   // full day in 10 minutes of play
};
