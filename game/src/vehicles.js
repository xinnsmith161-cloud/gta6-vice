// Cars: mesh factory (body, cabin, wheels, lights) and arcade driving
// physics. A car is a group in the scene plus a small physics state.
import * as THREE from 'three';
import { CAR, SPORTS_CAR, PALETTE } from './config.js';
import { makeRng } from './random.js';

let carId = 0;

export function makeCarMesh(color, opts = {}) {
  const { police = false, sports = false } = opts;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2634 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const len = sports ? 4.6 : 4.4;
  const wid = 1.9;
  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.62, len), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.55, len * 0.48), glass);
  cabin.position.set(0, 1.08, -len * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  // Hood / trunk hint: a slightly darker nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.1, 0.18, 0.5), paint);
  nose.position.set(0, 0.72, len / 2 - 0.2);
  g.add(nose);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPos = [
    [-wid / 2 + 0.1, 0.36, len / 2 - 0.85],
    [wid / 2 - 0.1, 0.36, len / 2 - 0.85],
    [-wid / 2 + 0.1, 0.36, -len / 2 + 0.85],
    [wid / 2 - 0.1, 0.36, -len / 2 + 0.85],
  ];
  const wheels = [];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, y, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // Headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    hl.position.set(x, 0.62, len / 2 + 0.01);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    tl.position.set(x, 0.62, -len / 2 - 0.01);
    g.add(tl);
  }
  let lightBar = null;
  let lightBarL = null;
  let lightBarR = null;
  if (police) {
    // Black-and-white livery: white doors, black hood/trunk
    const doorMat = new THREE.MeshLambertMaterial({ color: PALETTE.policeWhite });
    const door = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.5, len * 0.5), doorMat);
    door.position.set(0, 0.58, 0);
    g.add(door);
    const star = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 16),
      new THREE.MeshBasicMaterial({ color: 0x2244aa }),
    );
    star.rotation.y = Math.PI / 2;
    star.position.set(wid / 2 + 0.02, 0.6, 0);
    g.add(star);
    const star2 = star.clone();
    star2.rotation.y = -Math.PI / 2;
    star2.position.set(-wid / 2 - 0.02, 0.6, 0);
    g.add(star2);
    // Light bar (flashing red/blue)
    lightBar = new THREE.Group();
    lightBarL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lightBarL.position.set(-0.35, 1.42, -0.1);
    lightBarR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    lightBarR.position.set(0.35, 1.42, -0.1);
    lightBar.add(lightBarL);
    lightBar.add(lightBarR);
    g.add(lightBar);
  }
  g.userData.wheels = wheels;
  g.userData.lightBarL = lightBarL;
  g.userData.lightBarR = lightBarR;
  return g;
}

export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.id = carId += 1;
    this.scene = scene;
    this.sports = !!opts.sports;
    this.police = !!opts.police;
    this.tuning = this.sports ? { ...CAR, ...SPORTS_CAR } : CAR;
    this.mesh = makeCarMesh(color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;          // forward speed (m/s), signed
    this.steer = 0;          // current steer angle
    this.vel = new THREE.Vector3(); // world velocity (for drift/grip)
    this.health = 100;
    this.dead = false;
    this.driver = null;      // 'player' | 'traffic' | 'police' | null
    this.flashTimer = Math.random();
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }
  right() {
    return new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  /** Drive the car: throttle -1..1, steerInput -1..1, handbrake bool. */
  drive(dt, throttle, steerInput, handbrake) {
    const t = this.tuning;
    const fwd = this.forward();
    const fwdSpeed = this.vel.dot(fwd);
    // Steering: more at low speed, less at high speed
    const steerTarget = steerInput * t.steer * (1 / (1 + Math.abs(fwdSpeed) * 0.045));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * t.steerSpeed * 2);
    // Turn rate from speed + steer (bicycle-ish)
    const turn = (fwdSpeed / 2.6) * Math.tan(this.steer) * dt;
    this.heading += turn;
    // Recompute forward after turning
    const f2 = this.forward();
    // Longitudinal force
    let accel = 0;
    if (throttle > 0) accel = t.accel * throttle;
    else if (throttle < 0) {
      accel = fwdSpeed > 0.5 ? -t.brake : t.reverseAccel * throttle;
    }
    const newFwdSpeed = fwdSpeed + accel * dt;
    // Clamp
    const clamped = Math.max(-t.maxReverse, Math.min(t.maxSpeed, newFwdSpeed));
    // Lateral grip: kill sideways velocity, keep forward
    const right = this.right();
    const lat = this.vel.dot(right);
    const grip = handbrake ? t.handbrakeGrip : t.grip;
    const newLat = lat * Math.exp(-grip * dt);
    this.vel.copy(f2).multiplyScalar(clamped).addScaledVector(right, newLat);
    // Drag + rolling resistance
    const dragK = 1 - Math.min(0.9, (t.drag * Math.abs(clamped) * 0.02 + t.rollDrag * 0.02) * dt);
    this.vel.multiplyScalar(dragK);
    this.speed = this.vel.dot(f2);
    // Integrate
    this.pos.addScaledVector(this.vel, dt);
    // Mesh sync: body lean + wheel spin + steer
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const lean = -this.steer * Math.min(1, Math.abs(this.speed) / 20) * 0.12;
    this.mesh.rotation.z = lean;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.mesh.userData.wheels[0]) this.mesh.userData.wheels[0].rotation.y = this.steer * 0.7;
    if (this.mesh.userData.wheels[1]) this.mesh.userData.wheels[1].rotation.y = this.steer * 0.7;
    // Police light bar flash
    if (this.police && this.mesh.userData.lightBarL) {
      this.flashTimer += dt;
      const on = Math.floor(this.flashTimer * 6) % 2 === 0;
      this.mesh.userData.lightBarL.material.color.setHex(on ? 0xff0000 : 0x550000);
      this.mesh.userData.lightBarR.material.color.setHex(on ? 0x000088 : 0x2244ff);
    }
  }

  /** Push the car sideways (collision response). */
  shove(dir, amount) {
    this.pos.addScaledVector(dir, amount);
    this.vel.addScaledVector(dir, amount * 4);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

/** A parked/driving car the player can steal. */
export function spawnParkedCar(scene, rng, city) {
  const spot = rng.pick(city.spawnPoints);
  const color = rng.pick(PALETTE.carPaint);
  const sports = rng.chance(0.15);
  const car = new Car(scene, spot.x, spot.z, spot.angle + (rng.chance(0.5) ? 0 : Math.PI), color, { sports });
  car.driver = null;
  return car;
}
