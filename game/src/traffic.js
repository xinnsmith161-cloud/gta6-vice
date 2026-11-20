// Traffic: AI cars driving the road grid and pedestrians on the sidewalks.
// Traffic cars follow roads, slow for the car ahead, and turn at
// intersections. Pedestrians wander sidewalks and flee from danger.
import * as THREE from 'three';
import { BLOCK, GRID_N, ROAD_W, SIDEWALK_W, TRAFFIC, PALETTE, roadCoord, clampToCity } from './config.js';
import { makeRng } from './random.js';
import { Car } from './vehicles.js';

function makePedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirtMat);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), skinMat);
  head.position.y = 1.64;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.24);
  legGeo.translate(0, -0.35, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.15, 0.76, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.15, 0.76, 0);
  g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.58, 0.18);
  armGeo.translate(0, -0.29, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.38, 1.4, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.38, 1.4, 0);
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

const PED_SHIRTS = [0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xe8c84f, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c, 0xf06292, 0x795548];
const PED_PANTS = [0x2a2f38, 0x3a4a6b, 0x5b4636, 0x222222, 0x4a4a4a];
const PED_SKIN = [0xc98e6b, 0x8d5524, 0xe8b88a, 0xa06b42, 0xf1c27d];

export class TrafficCar {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.car = null;
    this.axis = 'x';
    this.roadCoord = 0;
    this.dir = 1;
    this.speed = 0;
    this.targetSpeed = 0;
    this.respawn(rng);
  }

  respawn(rng) {
    // Pick a road and a spot away from the player.
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.int(0, GRID_N);
    const c = roadCoord(line);
    const along = rng.range(-260, 260);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = this.laneOffset(axis, dir);
    const x = axis === 'x' ? along : c + lane;
    const z = axis === 'x' ? c + lane : along;
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const color = rng.pick(PALETTE.carPaint);
    if (this.car) this.car.remove();
    this.car = new Car(this.scene, x, z, heading, color, {});
    this.car.driver = 'traffic';
    this.axis = axis;
    this.roadCoord = c;
    this.dir = dir;
    this.targetSpeed = rng.range(TRAFFIC.carSpeed[0], TRAFFIC.carSpeed[1]);
    this.speed = this.targetSpeed;
  }

  laneOffset(axis, dir) {
    // Right-hand traffic.
    if (axis === 'x') return dir > 0 ? 3.5 : -3.5;
    return dir > 0 ? -3.5 : 3.5;
  }

  /** Drive along the road; turn at intersections; stop for cars ahead. */
  step(dt, allCars, playerPos) {
    const car = this.car;
    const lane = this.laneOffset(this.axis, this.dir);
    // Slow down if a car is ahead on the same road+lane.
    let want = this.targetSpeed;
    for (const other of allCars) {
      if (other === car || other.dead) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      if (this.axis === 'x') {
        if (Math.abs(dz - lane) < 2.5 && dx * this.dir > 0 && Math.abs(dx) < 12) want = 0;
      } else {
        if (Math.abs(dx - lane) < 2.5 && dz * this.dir > 0 && Math.abs(dz) < 12) want = 0;
      }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 2.5);
    // Move along the road.
    const along = this.axis === 'x' ? car.pos.x : car.pos.z;
    const next = along + this.dir * this.speed * dt;
    // At an intersection, sometimes turn.
    const half = (GRID_N / 2) * BLOCK;
    let turned = false;
    for (let i = 0; i <= GRID_N; i += 1) {
      const c = roadCoord(i);
      if (Math.abs(next - c) < Math.max(1.5, this.speed * dt) && this.rng.chance(0.3)) {
        this.turnAt(c);
        turned = true;
        break;
      }
    }
    if (!turned) {
      if (this.axis === 'x') car.pos.x = next;
      else car.pos.z = next;
    }
    // Edge of the city: turn around.
    const pos = this.axis === 'x' ? car.pos.x : car.pos.z;
    if (pos > half + 10 || pos < -half - 10) {
      this.dir *= -1;
      const l = this.laneOffset(this.axis, this.dir);
      if (this.axis === 'x') car.pos.z = this.roadCoord + l;
      else car.pos.x = this.roadCoord + l;
      car.heading = this.axis === 'x'
        ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (this.dir > 0 ? 0 : Math.PI);
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }

  turnAt(intersectionCoord) {
    // Turn 90° onto the crossing road at this intersection.
    const newAxis = this.axis === 'x' ? 'z' : 'x';
    const newDir = this.rng.chance(0.5) ? 1 : -1;
    const lane = this.laneOffset(newAxis, newDir);
    if (newAxis === 'x') {
      this.car.pos.z = intersectionCoord + lane;
      this.car.pos.x = intersectionCoord;
    } else {
      this.car.pos.x = intersectionCoord + lane;
      this.car.pos.z = intersectionCoord;
    }
    this.axis = newAxis;
    this.roadCoord = intersectionCoord;
    this.dir = newDir;
    this.car.heading = newAxis === 'x'
      ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (newDir > 0 ? 0 : Math.PI);
  }
}

export class Pedestrian {
  constructor(scene, rng, city, opts = {}) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.beach = !!opts.beach;
    const shirt = rng.pick(PED_SHIRTS);
    const pants = rng.pick(PED_PANTS);
    const skin = rng.pick(PED_SKIN);
    this.mesh = makePedMesh(shirt, pants, skin);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.speed = rng.range(TRAFFIC.pedSpeed[0], TRAFFIC.pedSpeed[1]);
    this.health = 50;
    this.dead = false;
    this.fleeing = 0;
    this.walkPhase = rng.range(0, 6);
    this.axis = 'x';
    this.dir = 1;
    this.roadCoord = 0;
    this.respawn(rng);
  }

  respawn(rng) {
    if (this.beach) {
      // Stroll east-west along the sand.
      const dir = rng.chance(0.5) ? 1 : -1;
      this.pos.set(rng.range(-250, 250), 0, rng.range(318, 352));
      this.axis = 'x';
      this.dir = dir;
      this.roadCoord = this.pos.z;
      this.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.mesh.position.copy(this.pos);
      return;
    }
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.int(0, GRID_N);
    const c = roadCoord(line);
    const along = rng.range(-260, 260);
    const dir = rng.chance(0.5) ? 1 : -1;
    const side = rng.chance(0.5) ? 1 : -1;
    const off = side * (ROAD_W / 2 + SIDEWALK_W / 2);
    this.pos.set(axis === 'x' ? along : c + off, 0, axis === 'x' ? c + off : along);
    this.axis = axis;
    this.dir = dir;
    this.roadCoord = c;
    this.yaw = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    this.mesh.position.copy(this.pos);
  }

  step(dt, dangerPos, dangerRadius) {
    if (this.dead) return;
    // Flee if danger is close.
    const dx = this.pos.x - dangerPos.x;
    const dz = this.pos.z - dangerPos.z;
    const d = Math.hypot(dx, dz);
    if (d < dangerRadius) {
      this.fleeing = 2.5;
      // Run directly away from danger.
      const away = Math.atan2(dx, dz);
      this.yaw = away;
      const sp = 4.5;
      this.pos.x += Math.sin(away) * sp * dt;
      this.pos.z += Math.cos(away) * sp * dt;
      this.walkPhase += dt * 14;
    } else {
      this.fleeing = Math.max(0, this.fleeing - dt);
      const sp = this.fleeing > 0 ? 4 : this.speed;
      const along = this.axis === 'x' ? this.pos.x : this.pos.z;
      const next = along + this.dir * sp * dt;
      // Turn at intersections sometimes (city peds only — beach strollers stay on the sand).
      let turned = false;
      if (!this.beach) {
      for (let i = 0; i <= GRID_N; i += 1) {
        const c = roadCoord(i);
        if (Math.abs(next - c) < Math.max(1, sp * dt) && this.rng.chance(0.25)) {
          const newAxis = this.axis === 'x' ? 'z' : 'x';
          const newDir = this.rng.chance(0.5) ? 1 : -1;
          const side = this.rng.chance(0.5) ? 1 : -1;
          const off = side * (ROAD_W / 2 + SIDEWALK_W / 2);
          if (newAxis === 'x') { this.pos.z = c + off; this.pos.x = c; }
          else { this.pos.x = c + off; this.pos.z = c; }
          this.axis = newAxis;
          this.dir = newDir;
          this.roadCoord = c;
          this.yaw = newAxis === 'x' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
          turned = true;
          break;
        }
      }
      } // !beach
      if (!turned) {
        if (this.axis === 'x') this.pos.x = next;
        else this.pos.z = next;
      }
      const half = (GRID_N / 2) * BLOCK;
      const p = this.axis === 'x' ? this.pos.x : this.pos.z;
      if (p > half + 8 || p < -half - 8) this.dir *= -1;
      this.yaw = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
      this.walkPhase += dt * (5 + sp * 2);
    }
    // Stay out of buildings.
    this.city.collideCircle(this.pos, 0.5);
    const cl = clampToCity(this.pos.x, this.pos.z);
    this.pos.x = cl.x; this.pos.z = cl.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const swing = Math.sin(this.walkPhase) * 0.55;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.6;
    u.armR.rotation.x = swing * 0.6;
  }

  die() {
    this.dead = true;
    // Fall over.
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = 0.3;
  }
}

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed);
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < TRAFFIC.carCount; i += 1) {
      this.cars.push(new TrafficCar(scene, this.rng, city));
    }
    for (let i = 0; i < TRAFFIC.pedCount; i += 1) {
      this.peds.push(new Pedestrian(scene, this.rng, city));
    }
    // Beach strollers on the sand.
    for (let i = 0; i < 8; i += 1) {
      this.peds.push(new Pedestrian(scene, this.rng, city, { beach: true }));
    }
  }

  /** All drivable cars (traffic) as Car instances, for collision checks. */
  allCars() {
    return this.cars.map((t) => t.car);
  }

  step(dt, playerPos, dangerPos, dangerRadius) {
    const cars = this.allCars();
    for (const t of this.cars) t.step(dt, cars, playerPos);
    for (const p of this.peds) p.step(dt, dangerPos, dangerRadius);
  }

  /** Remove dead peds / wrecked cars that are far from the player. */
  cleanup(playerPos) {
    for (const p of this.peds) {
      if (p.dead && p.pos.distanceTo(playerPos) > 120) {
        p.dead = false;
        p.mesh.rotation.x = 0;
        p.mesh.position.y = 0;
        p.health = 50;
        p.respawn(this.rng);
      }
    }
  }
}
