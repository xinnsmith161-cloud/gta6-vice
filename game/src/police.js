// Wanted level and police. Stars rise with crimes and decay when the player
// lies low; police cars spawn to match the level, chase, ram, and at high
// wanted shoot. On foot, a cop car parked on the player busts them.
import * as THREE from 'three';
import { WANTED, COMBAT, BLOCK, GRID_N, roadCoord } from './config.js';
import { Car } from './vehicles.js';
import { makeRng } from './random.js';

export class Police {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed);
    this.stars = 0;
    this.crimeTimer = 0;      // time since last crime
    this.decayTimer = 0;
    this.cars = [];           // active police Cars
    this.bustProgress = 0;
    this.shootTimer = 0;
    this.onBusted = null;     // callback
    this.onShoot = null;      // callback(origin Vector3) — for tracers/sound
  }

  addWanted(n, reason) {
    if (n <= 0) return;
    const before = this.stars;
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    this.crimeTimer = 0;
    this.decayTimer = 0;
    if (this.stars > before && this.onCrime) this.onCrime(this.stars, reason);
  }

  clearWanted() {
    this.stars = 0;
    this.bustProgress = 0;
    this.despawnAll();
  }

  despawnAll() {
    for (const c of this.cars) c.remove();
    this.cars = [];
  }

  /** Spawn a police car on a road near (x,z), at least minDist away. */
  spawnNear(x, z, minDist) {
    const rng = this.rng;
    for (let tries = 0; tries < 12; tries += 1) {
      const spot = rng.pick(this.city.spawnPoints);
      const d = Math.hypot(spot.x - x, spot.z - z);
      if (d < minDist || d > minDist + 90) continue;
      const car = new Car(this.scene, spot.x, spot.z, spot.angle, 0xffffff, { police: true });
      car.driver = 'police';
      this.cars.push(car);
      return car;
    }
    return null;
  }

  step(dt, player, playerCar, allCars, effects) {
    this.crimeTimer += dt;
    // Wanted decay: after a quiet spell, lose a star every few seconds.
    if (this.stars > 0 && this.crimeTimer > WANTED.decayDelay) {
      this.decayTimer += dt;
      if (this.decayTimer > WANTED.decayInterval) {
        this.decayTimer = 0;
        this.stars -= 1;
        if (this.stars === 0) this.despawnAll();
      }
    }
    // Match the number of police cars to the wanted level.
    const want = this.stars > 0 ? WANTED.policePerStar[this.stars] : 0;
    const target = playerCar ? playerCar.pos : player.pos;
    while (this.cars.length < want) {
      if (!this.spawnNear(target.x, target.z, 35)) break;
    }
    while (this.cars.length > want) {
      const c = this.cars.pop();
      c.remove();
    }
    // Chase behaviour.
    const speed = WANTED.policeSpeed[this.stars] || 30;
    let busting = false;
    for (const cop of this.cars) {
      const toTarget = new THREE.Vector3(target.x - cop.pos.x, 0, target.z - cop.pos.z);
      const dist = toTarget.length();
      if (dist < 1) continue;
      toTarget.normalize();
      // Desired heading toward the player.
      const wantHeading = Math.atan2(toTarget.x, toTarget.z);
      let dh = wantHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.6));
      // Slow down when close so they ram rather than overshoot.
      const throttle = dist > 8 ? 1 : 0.6;
      cop.drive(dt, throttle, steer, false);
      // Keep police cars out of buildings; if stuck, respawn nearby.
      const hit = this.city.collideCircle(cop.pos, 1.7);
      if (hit) {
        cop.vel.multiplyScalar(0.5);
        cop.stuckTime = (cop.stuckTime || 0) + dt;
        if (cop.stuckTime > 3) {
          cop.stuckTime = 0;
          const spot = this.rng.pick(this.city.spawnPoints);
          cop.pos.set(spot.x, 0, spot.z);
          cop.heading = spot.angle;
          cop.vel.set(0, 0, 0);
        }
      } else {
        cop.stuckTime = 0;
      }
      // Ram the player's car.
      if (playerCar && !playerCar.dead) {
        const d = cop.pos.distanceTo(playerCar.pos);
        if (d < 3.4) {
          const push = new THREE.Vector3().subVectors(playerCar.pos, cop.pos).normalize();
          playerCar.shove(push, dt * 2.2);
          cop.vel.multiplyScalar(0.6);
          if (this.onRam) this.onRam(d);
        }
      }
      // Bust: on foot, a cop car sitting on the player.
      if (!playerCar && !player.dead) {
        const d = cop.pos.distanceTo(player.pos);
        if (d < WANTED.bustRadius && player.vel.length() < 3) {
          busting = true;
        }
      }
      // Shooting at high wanted.
      if (this.stars >= 3 && !player.dead && dist < COMBAT.policeRange) {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = COMBAT.policeCooldown * (0.7 + Math.random() * 0.6);
          if (this.onShoot) this.onShoot(cop.pos.clone(), playerCar ? playerCar.pos.clone() : player.pos.clone());
        }
      }
    }
    if (busting) {
      this.bustProgress += dt / WANTED.bustTime;
      if (this.bustProgress >= 1) {
        this.bustProgress = 0;
        if (this.onBusted) this.onBusted();
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 0.5);
    }
  }
}
