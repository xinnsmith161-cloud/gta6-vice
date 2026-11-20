// The player on foot: a low-poly figure with walk animation, third-person
// movement relative to the camera, and enter/exit-car handling.
import * as THREE from 'three';
import { PLAYER } from './config.js';

function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x241a12 });
  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
  hair.position.y = 1.88;
  g.add(hair);
  // Legs (pivot at hip for walk swing)
  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.26);
  legGeo.translate(0, -0.36, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.78, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.16, 0.78, 0);
  legR.castShadow = true;
  g.add(legR);
  // Arms (pivot at shoulder)
  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.42, 1.44, 0);
  armL.castShadow = true;
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.42, 1.44, 0);
  armR.castShadow = true;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = makePersonMesh(0x2b6fd9, 0x2a2f38, 0xc98e6b);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // facing direction (radians)
    this.health = PLAYER.maxHealth;
    this.money = 0;
    this.inCar = null;       // Car instance or null
    this.walkPhase = 0;
    this.moving = false;
    this.punchTimer = 0;
    this.punchAnim = 0;
    this.dead = false;
  }

  /** Move on foot. moveX/moveZ are camera-relative (-1..1), run bool. */
  step(dt, moveX, moveZ, run, city) {
    if (this.inCar || this.dead) return;
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.punchAnim = Math.max(0, this.punchAnim - dt * 3);
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const target = new THREE.Vector3(moveX, 0, moveZ);
    const len = target.length();
    this.moving = len > 0.1;
    if (this.moving) {
      target.normalize().multiplyScalar(speed);
      // Face movement direction smoothly
      const wantYaw = Math.atan2(target.x, target.z);
      let dy = wantYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 12);
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 10);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 10);
    } else {
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
    }
    this.pos.addScaledVector(this.vel, dt);
    // Stay in the city + out of buildings
    const c = city.collideCircle(this.pos, PLAYER.radius);
    if (c) this.vel.multiplyScalar(0.4);
    if (this.pos.x < -290) this.pos.x = -290;
    if (this.pos.x > 290) this.pos.x = 290;
    if (this.pos.z < -290) this.pos.z = -290;
    if (this.pos.z > 330) this.pos.z = 330;
    // Mesh sync + walk animation
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const speed01 = Math.min(1, this.vel.length() / PLAYER.runSpeed);
    if (this.moving) this.walkPhase += dt * (6 + speed01 * 7);
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.7 * speed01 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    if (this.punchAnim > 0) {
      u.armR.rotation.x = -1.5 * this.punchAnim;
      u.armL.rotation.x = 0;
    } else {
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
    }
  }

  punch() {
    if (this.punchTimer > 0 || this.inCar) return false;
    this.punchTimer = PLAYER.punchCooldown;
    this.punchAnim = 1;
    return true;
  }

  damage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  enterCar(car) {
    this.inCar = car;
    car.driver = 'player';
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.inCar) return null;
    const car = this.inCar;
    car.driver = null;
    this.inCar = null;
    // Step out to the car's left side
    const side = car.right();
    this.pos.copy(car.pos).addScaledVector(side, -2.2);
    this.pos.y = 0;
    this.vel.set(0, 0, 0);
    this.yaw = car.heading;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    return car;
  }

  teleport(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = yaw;
  }
}
