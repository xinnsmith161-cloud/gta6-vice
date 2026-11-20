// Solmar City — boot, the fixed-step loop, cameras, collisions, crimes,
// pickups, time of day and the state machine (menu / playing / paused /
// wasted / busted). The one file that knows about every other file.
import * as THREE from 'three';
import { GAME_NAME, PLAYER, CAR, WANTED, COMBAT, TIME, BLOCK, GRID_N, BEACH_Z, PALETTE, roadCoord, clampToCity } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Car, spawnParkedCar } from './vehicles.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { stageShot, autopilot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bfe8);
    this.scene.fog = new THREE.Fog(0x87bfe8, 120, 420);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 40, 80);

    // Lights
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    this.sun.position.set(120, 180, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.far = 500;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a5f3a, 0.75);
    this.scene.add(this.hemi);
    // Player headlight (night driving)
    this.headlight = new THREE.SpotLight(0xfff2c0, 0, 60, 0.55, 0.5, 1.2);
    this.scene.add(this.headlight);
    this.headlightTarget = new THREE.Object3D();
    this.scene.add(this.headlightTarget);
    this.headlight.target = this.headlightTarget;

    // Systems
    this.rng = makeRng(seed);
    this.city = new City(this.scene, seed);
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.effects = new Effects(this.scene);
    this.player = new Player(this.scene, 0, 40);
    this.traffic = new Traffic(this.scene, this.city, seed + 7);
    this.police = new Police(this.scene, this.city, seed + 13);
    this.combat = new Combat(this.scene);
    this.missions = new Missions(this.scene);
    this.hud = new HUD();
    this.hud.buildMinimapBg(this.city.colliders);

    // State
    this.state = 'menu'; // menu | playing | paused | wasted | busted
    this.timeOfDay = TIME.dayStart;
    this.timeScale = 1;
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.camMode = 'foot';
    this.camPos = new THREE.Vector3(0, 40, 80);
    this.parked = [];
    this.pickups = [];
    this.muted = false;
    this.missionTimer = 0;
    this.missionStarted = false;
    this.shotMode = !!shotName;
    this.shotSettle = 0;
    this.shotElapsed = 0;
    this.damageCooldown = 0;
    this.crosshair = this.makeCrosshair();
    this.bindUI();
    this.spawnWorld();
    this.wireCallbacks();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.shotMode) this.pause();
    });
  }

  makeCrosshair() {
    const el = document.createElement('div');
    el.id = 'crosshair';
    el.style.cssText = 'position:fixed;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;z-index:30;display:none;';
    el.innerHTML = '<div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:#fff;box-shadow:0 0 3px #000"></div><div style="position:absolute;top:8px;left:0;width:18px;height:2px;background:#fff;box-shadow:0 0 3px #000"></div>';
    document.body.appendChild(el);
    return el;
  }

  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('btn-new', () => { this.audio.ensure(); this.newGame(); });
    on('btn-continue', () => { this.audio.ensure(); this.continueGame(); });
    on('btn-sound', () => {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      document.getElementById('btn-sound').textContent = this.muted ? 'SOUND: OFF' : 'SOUND: ON';
    });
    on('btn-resume', () => this.resume());
    on('btn-save', () => { this.doSave(); this.hud.toast('Game saved.'); });
    on('btn-replay', () => { this.missions.replay(); this.resume(); this.hud.toast('Missions restarted — Rosa is calling.'); });
    on('btn-quit', () => { this.toMenu(); });
    on('btn-retry', () => { this.respawn(); });
    on('btn-end-menu', () => { this.toMenu(); });
    document.getElementById('btn-continue').style.display = hasSave() ? '' : 'none';
  }

  spawnWorld() {
    // Parked cars the player can steal.
    for (let i = 0; i < 12; i += 1) {
      const c = spawnParkedCar(this.scene, this.rng, this.city);
      this.parked.push(c);
    }
    // Cash + health pickups.
    for (let i = 0; i < 14; i += 1) {
      this.addPickup('cash');
    }
    for (let i = 0; i < 6; i += 1) {
      this.addPickup('health');
    }
  }

  addPickup(kind, x, z) {
    const spot = this.rng.pick(this.city.spawnPoints);
    const px = x !== undefined ? x : spot.x + this.rng.range(-6, 6);
    const pz = z !== undefined ? z : spot.z + this.rng.range(-6, 6);
    const color = kind === 'cash' ? 0x37d67a : 0xe5534b;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(px, 1.2, pz);
    this.scene.add(mesh);
    this.pickups.push({ kind, mesh, pos: new THREE.Vector3(px, 1.2, pz), taken: false, timer: 0 });
  }

  /** Spawn a car for the player (used by shots + missions). */
  spawnPlayerCar(x, z, heading, color, sports) {
    const car = new Car(this.scene, x, z, heading, color, { sports });
    car.driver = null;
    this.parked.push(car);
    return car;
  }

  wireCallbacks() {
    this.police.onBusted = () => this.busted();
    this.police.onShoot = (from, to) => {
      this.effects.tracer(from.clone().setY(1.4), to.clone().setY(1.2));
      this.audio.gunshot();
      // Police bullets can hit the player.
      if (!this.player.dead && Math.random() < 0.45) {
        this.damagePlayer(COMBAT.policeDamage * 0.5);
      }
    };
    this.police.onRam = () => { this.audio.crash(); };
    this.police.onCrime = (stars, reason) => {
      this.hud.toast(reason ? `WANTED — ${reason}` : 'WANTED LEVEL UP');
    };
    this.missions.onDialogue = (line) => this.hud.setDialogue(line);
    this.missions.onMissionStart = (def) => {
      this.hud.toast(`MISSION: ${def.name}`);
      this.audio.pickup();
    };
    this.missions.onMissionComplete = (def) => {
      this.player.money += def.reward;
      this.hud.toast(`MISSION COMPLETE: ${def.name} — +$${def.reward}`);
      this.audio.missionDone();
      this.doSave();
    };
    this.missions.onPickup = (t) => {
      this.effects.pickup(new THREE.Vector3(t.x, 1.5, t.z));
      this.audio.pickup();
    };
    this.missions.onWanted = (n) => this.police.addWanted(n, 'The cops are onto you');
    this.missions.onStealTarget = (target) => {
      // Park Kane's red Comet at the target for the steal stage.
      const car = this.spawnPlayerCar(target.x, target.z, 0, 0xd92b2b, true);
      this.missions.stealCar = car;
    };
  }

  // ---- State transitions ----
  newGame() {
    clearSave();
    this.player.money = 0;
    this.player.health = PLAYER.maxHealth;
    this.player.dead = false;
    this.player.teleport(0, 40, Math.PI);
    this.police.clearWanted();
    this.missions.index = -1;
    this.missions.active = false;
    this.missions.done = false;
    this.missionStarted = false;
    this.missionTimer = 3;
    this.timeOfDay = TIME.dayStart;
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
    this.hud.toast('Welcome to Solmar City. Rosa will call soon.');
  }

  continueGame() {
    const data = loadGame();
    if (!data) { this.newGame(); return; }
    this.player.money = data.money || 0;
    this.player.health = data.player?.health ?? PLAYER.maxHealth;
    this.player.teleport(data.player?.x ?? 0, data.player?.z ?? 40, Math.PI);
    this.timeOfDay = data.timeOfDay ?? TIME.dayStart;
    this.muted = !!data.muted;
    this.audio.setMuted(this.muted);
    this.missions.index = -1;
    this.missions.active = false;
    if (data.missionIndex >= 0 && !data.missionDone) {
      this.missions.startMission(Math.min(data.missionIndex, 3));
    }
    this.missionStarted = true;
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
    this.hud.toast('Welcome back to Solmar City.');
  }

  toMenu() {
    this.state = 'menu';
    this.input.unlock();
    this.hud.showScreen('screen-start');
    document.getElementById('btn-continue').style.display = hasSave() ? '' : 'none';
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.hud.showScreen('screen-pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
  }

  wasted() {
    this.state = 'wasted';
    this.input.unlock();
    this.audio.busted();
    const lost = Math.min(this.player.money, 100);
    this.player.money -= lost;
    this.hud.showEnd('WASTED', `You got taken out. The hospital patched you up — and charged you $${lost}.`);
    this.doSave();
  }

  busted() {
    this.state = 'busted';
    this.input.unlock();
    this.audio.busted();
    const lost = Math.min(this.player.money, 100);
    this.player.money -= lost;
    this.police.clearWanted();
    this.hud.showEnd('BUSTED', `The Solmar PD caught you. Bail cost you $${lost}.`);
    this.doSave();
  }

  respawn() {
    this.player.health = PLAYER.maxHealth;
    this.player.dead = false;
    if (this.player.inCar) this.player.exitCar();
    this.player.teleport(0, 40, Math.PI);
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
  }

  doSave() {
    saveGame({
      money: this.player.money,
      missionIndex: this.missions.done ? -1 : this.missions.index,
      missionDone: this.missions.done,
      player: { x: this.player.pos.x, z: this.player.pos.z, health: this.player.health },
      timeOfDay: this.timeOfDay,
      muted: this.muted,
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- Interaction ----
  nearestEnterableCar(maxDist) {
    const p = this.player.pos;
    let best = null;
    let bestD = maxDist;
    const consider = (car) => {
      if (!car || car.dead || car.driver === 'police') return;
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    };
    for (const c of this.parked) consider(c);
    for (const t of this.traffic.cars) consider(t.car);
    return best;
  }

  tryEnterCar() {
    const car = this.nearestEnterableCar(4.5);
    if (!car) return;
    // Carjack a traffic car: pull the driver out.
    const tc = this.traffic.cars.find((t) => t.car === car);
    if (tc) {
      this.traffic.cars.splice(this.traffic.cars.indexOf(tc), 1);
      // The driver flees on foot.
      const ped = this.traffic.peds.find((x) => x.dead);
      if (ped) {
        ped.dead = false;
        ped.mesh.rotation.x = 0;
        ped.pos.copy(car.pos).add(new THREE.Vector3(2, 0, 0));
        ped.health = 50;
      }
      this.police.addWanted(WANTED.crimeCarTheft, 'Carjacking');
    } else if (this.parked.includes(car)) {
      // Stealing a parked car is a crime.
      this.police.addWanted(WANTED.crimeCarTheft, 'Grand theft auto');
      this.parked.splice(this.parked.indexOf(car), 1);
    }
    this.player.enterCar(car);
    this.camMode = 'car';
    this.audio.blip(440, 0.08, 'square', 0.15);
  }

  tryExitCar() {
    const car = this.player.exitCar();
    if (car) {
      this.parked.push(car);
      this.camMode = 'foot';
      // Step out and face the car.
      this.camYaw = car.heading + Math.PI;
    }
  }

  tryShoot() {
    if (this.player.inCar) return; // no drive-by for now; keep combat on foot
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // Targets: peds + cars (police + traffic + parked).
    const targets = [];
    for (const p of this.traffic.peds) {
      if (p.dead) continue;
      p.mesh.userData.owner = p;
      targets.push(p);
    }
    const allCars = [...this.parked, ...this.traffic.cars.map((t) => t.car), ...this.police.cars];
    for (const c of allCars) {
      if (c.dead) continue;
      c.mesh.userData.owner = c;
      targets.push({ car: c, mesh: c.mesh });
    }
    const res = this.combat.shoot(origin, dir, targets);
    if (!res) return;
    this.audio.gunshot();
    const muzzlePos = this.player.pos.clone().setY(1.4).add(new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)).multiplyScalar(0.8));
    this.effects.muzzle(muzzlePos);
    this.effects.tracer(muzzlePos, res.point);
    if (res.hit && res.owner) {
      this.effects.impact(res.point);
      this.damageTarget(res.owner);
    }
    this.police.addWanted(WANTED.crimeShoot, 'Shots fired');
  }

  damageTarget(owner) {
    // Pedestrian
    if (owner.pos && owner.health !== undefined && !owner.car) {
      owner.health -= COMBAT.pistolDamage;
      this.effects.burst(owner.pos.clone().setY(1.2), 0xcc2222, 10, 4, 0.5, 8, 2);
      if (owner.health <= 0 && !owner.dead) {
        if (owner.die) owner.die();
        this.police.addWanted(WANTED.crimePedHit, 'Pedestrian down');
      }
      return;
    }
    // Car
    if (owner.car || owner.mesh) {
      const car = owner.car || owner;
      if (car.damage && car.damage(COMBAT.pistolDamage)) {
        this.explodeCar(car);
        if (car.police) this.police.addWanted(WANTED.crimeCopKill, 'Cop car destroyed');
      }
    }
  }

  explodeCar(car) {
    this.effects.explosion(car.pos.clone().setY(1));
    this.audio.explosion();
    // Remove from whichever list holds it.
    const pi = this.parked.indexOf(car);
    if (pi >= 0) this.parked.splice(pi, 1);
    const ti = this.traffic.cars.findIndex((t) => t.car === car);
    if (ti >= 0) { this.traffic.cars.splice(ti, 1); }
    const ci = this.police.cars.indexOf(car);
    if (ci >= 0) this.police.cars.splice(ci, 1);
    car.remove();
    // If the player was in it, they're out and hurt.
    if (this.player.inCar === car) {
      this.player.exitCar();
      this.damagePlayer(30);
    }
  }

  damagePlayer(amount) {
    if (this.player.dead || this.damageCooldown > 0) return;
    this.damageCooldown = 0.25;
    this.hud.damageFlash();
    if (this.player.damage(amount)) {
      this.wasted();
    }
  }

  // ---- Per-frame ----
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dtMs = Math.min(now - this.last, 100);
    this.last = now;
    let dt = dtMs / 1000;
    if (this.state !== 'playing') {
      // Still render the scene behind menus.
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Fixed steps.
    this.acc += Math.min(dt, MAX_FRAME);
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    // Edge-triggered keys are consumed by the steps above; clear them now.
    this.input.endFrame();
    this.updateCamera(dt);
    this.updateHUD(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    const input = this.input;
    const { dx, dy } = input.mouseDelta();
    // Mouse look (only when pointer locked, or in shot mode).
    if (input.locked || this.shotMode) {
      this.camYaw -= dx * 0.0028;
      this.camPitch = Math.max(-0.15, Math.min(0.9, this.camPitch + dy * 0.0022));
    }
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.combat.step(dt);
    this.effects.step(dt);

    // Time of day.
    this.timeOfDay = (this.timeOfDay + (dt / TIME.cycleSeconds) * this.timeScale) % 1;
    this.applyTimeOfDay();

    // Mission auto-start (first mission, a few seconds in).
    if (!this.missionStarted) {
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) {
        this.missionStarted = true;
        this.missions.startMission(0);
      }
    }
    this.missions.stepPending(dt);

    // --- Player / car ---
    const inCar = this.player.inCar;
    if (inCar) {
      let throttle = 0;
      let steer = 0;
      if (this.shotMode) {
        const ap = autopilot(this, dt);
        throttle = ap.throttle; steer = ap.steer;
      } else {
        if (input.down('KeyW') || input.down('ArrowUp')) throttle = 1;
        if (input.down('KeyS') || input.down('ArrowDown')) throttle = -1;
        if (input.down('KeyA') || input.down('ArrowLeft')) steer = -1;
        if (input.down('KeyD') || input.down('ArrowRight')) steer = 1;
      }
      const handbrake = input.down('Space');
      const prevPos = inCar.pos.clone();
      inCar.drive(dt, throttle, steer, handbrake);
      // Building collision.
      if (this.city.collideCircle(inCar.pos, CAR.radius)) {
        const impact = inCar.vel.length();
        inCar.vel.multiplyScalar(0.35);
        if (impact > 14) {
          this.audio.crash();
          this.effects.burst(inCar.pos.clone().setY(1), 0xaaaaaa, 10, 5, 0.5, 6, 2);
          if (inCar.damage(12)) this.explodeCar(inCar);
        }
      }
      // Skid marks when drifting / handbrake.
      if (handbrake && Math.abs(inCar.speed) > 8 && Math.random() < 0.6) {
        this.effects.skid(inCar.pos, inCar.heading);
      }
      // Car vs traffic / police cars.
      for (const other of [...this.traffic.cars.map((t) => t.car), ...this.police.cars]) {
        if (other === inCar || other.dead) continue;
        const d = inCar.pos.distanceTo(other.pos);
        if (d < 3.2) {
          const push = new THREE.Vector3().subVectors(inCar.pos, other.pos).normalize();
          inCar.shove(push, dt * 3);
          other.shove(push.clone().negate(), dt * 3);
          const rel = Math.abs(inCar.speed - other.speed || 0);
          if (rel > 8) this.audio.crash();
        }
      }
      // Car vs peds: running someone over.
      for (const p of this.traffic.peds) {
        if (p.dead) continue;
        const d = Math.hypot(inCar.pos.x - p.pos.x, inCar.pos.z - p.pos.z);
        if (d < 2.0 && Math.abs(inCar.speed) > 3) {
          p.die();
          this.effects.burst(p.pos.clone().setY(1), 0xcc2222, 12, 5, 0.6, 8, 2);
          this.police.addWanted(WANTED.crimePedHit, 'Pedestrian down');
          this.audio.crash();
        }
      }
      // Engine audio.
      this.audio.update(dt, Math.abs(inCar.speed) / CAR.maxSpeed, true, this.police.stars);
      // Exit car.
      if (input.wasPressed('KeyE')) this.tryExitCar();
    } else {
      // On foot movement (camera-relative).
      let mx = 0, mz = 0;
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      if (input.down('KeyW') || input.down('ArrowUp')) { mx += sin; mz += cos; }
      if (input.down('KeyS') || input.down('ArrowDown')) { mx -= sin; mz -= cos; }
      if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= cos; mz += sin; }
      if (input.down('KeyD') || input.down('ArrowRight')) { mx += cos; mz -= sin; }
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      this.player.step(dt, mx, mz, run, this.city);
      // Enter car.
      if (input.wasPressed('KeyE')) this.tryEnterCar();
      // Punch / shoot.
      if (input.wasPressed('KeyF')) {
        if (this.player.punch()) {
          this.audio.punch();
          const hit = this.combat.punch(this.player.pos, this.player.yaw, this.traffic.peds);
          if (hit) {
            hit.health -= PLAYER.punchDamage;
            this.effects.burst(hit.pos.clone().setY(1.2), 0xcc2222, 8, 4, 0.4, 8, 2);
            if (hit.health <= 0 && !hit.dead) {
              hit.die();
              this.police.addWanted(WANTED.crimePedHit, 'Pedestrian down');
            }
          }
        }
      }
      if (input.mouseClicked || input.mouseDown) this.tryShoot();
      if (input.wasPressed('KeyR')) this.combat.reload();
      this.audio.update(dt, 0, false, this.police.stars);
    }

    // --- Traffic + police ---
    const playerPos = inCar ? inCar.pos : this.player.pos;
    const dangerPos = playerPos;
    const dangerRadius = inCar ? 10 : 14;
    this.traffic.step(dt, playerPos, dangerPos, dangerRadius);
    this.traffic.cleanup(playerPos);
    this.police.step(dt, this.player, inCar, this.traffic.allCars(), this.effects);

    // --- Missions ---
    this.missions.step(dt, playerPos, inCar);
    // The steal stage completes when the player enters the marked car.
    if (this.missions.active && this.missions.defs[this.missions.index]?.stages[this.missions.stage]?.type === 'steal') {
      if (inCar === this.missions.stealCar) {
        this.missions.advance();
      }
    }

    // --- Pickups ---
    for (const pk of this.pickups) {
      if (pk.taken) {
        pk.timer -= dt;
        if (pk.timer <= 0) {
          // Respawn elsewhere.
          const spot = this.rng.pick(this.city.spawnPoints);
          pk.pos.set(spot.x + this.rng.range(-6, 6), 1.2, spot.z + this.rng.range(-6, 6));
          pk.mesh.position.copy(pk.pos);
          pk.mesh.visible = true;
          pk.taken = false;
        }
        continue;
      }
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.2 + Math.sin(performance.now() / 400) * 0.15;
      const d = Math.hypot(playerPos.x - pk.pos.x, playerPos.z - pk.pos.z);
      if (d < 2.4) {
        pk.taken = true;
        pk.timer = 25;
        pk.mesh.visible = false;
        if (pk.kind === 'cash') {
          const amount = 25 + this.rng.int(0, 25);
          this.player.money += amount;
          this.hud.toast(`+$${amount}`);
          this.audio.pickup();
          this.effects.pickup(pk.pos);
        } else {
          this.player.heal(35);
          this.hud.toast('+35 HEALTH');
          this.audio.pickup();
          this.effects.pickup(pk.pos);
        }
      }
    }

    // --- Global keys ---
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.pause();
    if (input.wasPressed('KeyM')) {
      if (!this.missions.active && !this.missions.done) this.missions.startMission(0);
      else if (this.missions.done) this.missions.replay();
    }
    if (input.wasPressed('KeyH')) { this.doSave(); this.hud.toast('Game saved.'); }
    if (input.wasPressed('KeyN')) { this.audio.setMuted(!this.muted); this.muted = !this.muted; }

    // Health regen (slow).
    if (!this.player.dead && this.player.health < PLAYER.maxHealth) {
      this.player.health = Math.min(PLAYER.maxHealth, this.player.health + dt * 1.2);
    }

    // Player car smoke when badly damaged.
    if (inCar && inCar.health < 40 && Math.random() < dt * 4) {
      this.effects.smoke(inCar.pos.clone().setY(1.2));
    }
  }

  applyTimeOfDay() {
    const t = this.timeOfDay;
    // Sun height: 1 at noon (t=0.25), -1 at midnight (t=0.75).
    const sunH = Math.cos((t - 0.25) * Math.PI * 2);
    const day01 = Math.max(0, Math.min(1, sunH * 0.85 + 0.3));
    const night01 = 1 - day01;
    const az = t * Math.PI * 2;
    this.sun.position.set(Math.cos(az) * 170, Math.max(18, sunH * 210 + 25), 60 + Math.sin(az) * 60);
    this.sun.intensity = 0.45 + day01 * 1.4;
    this.sun.color.setHex(night01 > 0.6 ? 0x8fa8ff : 0xfff2d8);
    this.hemi.intensity = 0.4 + day01 * 0.55;
    const sky = new THREE.Color(PALETTE.skyDay).lerp(new THREE.Color(PALETTE.skyNight), night01);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.city.setNight(night01);
    // Headlight at night when driving.
    const inCar = this.player.inCar;
    this.headlight.intensity = night01 > 0.5 && inCar ? 90 : 0;
    if (inCar) {
      const fwd = inCar.forward();
      this.headlight.position.copy(inCar.pos).addScaledVector(fwd, 1.5).setY(1);
      this.headlightTarget.position.copy(inCar.pos).addScaledVector(fwd, 25).setY(0.5);
    }
    this.night01 = night01;
  }

  updateCamera(dt) {
    const target = this.player.inCar ? this.player.inCar.pos : this.player.pos;
    const focusY = this.player.inCar ? 1.6 : 1.6;
    if (this.camMode === 'car' && this.player.inCar) {
      const car = this.player.inCar;
      // Chase cam: behind the car, smoothed.
      const back = car.forward().multiplyScalar(-1);
      const desired = new THREE.Vector3(
        car.pos.x + back.x * 9.5 + Math.sin(this.camYaw - car.heading) * 0,
        3.4,
        car.pos.z + back.z * 9.5,
      );
      // Allow mouse to orbit slightly around the car.
      const orbit = this.camYaw - car.heading;
      if (Math.abs(orbit) > 0.15) {
        desired.x = car.pos.x - Math.sin(car.heading + orbit * 0.6) * 9.5;
        desired.z = car.pos.z - Math.cos(car.heading + orbit * 0.6) * 9.5;
      }
      this.camPos.lerp(desired, Math.min(1, dt * 6));
      // Keep the camera out of buildings.
      this.pullCameraOut(target, 1.6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(target.x, focusY, target.z);
      const speed01 = Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
      const fov = 62 + speed01 * 12;
      if (Math.abs(this.camera.fov - fov) > 0.1) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    } else if (this.camMode === 'chaseback' && this.player.inCar) {
      // Reverse chase cam: ahead of the car, looking back at it and the
      // police on its tail — the money shot for a pursuit.
      const car = this.player.inCar;
      const fwd = car.forward();
      const desired = new THREE.Vector3(
        car.pos.x + fwd.x * 13,
        3.6,
        car.pos.z + fwd.z * 13,
      );
      this.camPos.lerp(desired, Math.min(1, dt * 6));
      this.pullCameraOut(target, 1.6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(target.x, focusY, target.z);
      if (Math.abs(this.camera.fov - 62) > 0.1) {
        this.camera.fov = 62;
        this.camera.updateProjectionMatrix();
      }
    } else {
      // On-foot orbit camera.
      const dist = 7.5;
      const cx = target.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cz = target.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
      const cy = focusY + Math.sin(this.camPitch) * dist + 1.2;
      const desired = new THREE.Vector3(cx, cy, cz);
      this.camPos.lerp(desired, Math.min(1, dt * 14));
      this.pullCameraOut(target, focusY);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(target.x, focusY + 0.4, target.z);
      if (Math.abs(this.camera.fov - 62) > 0.1) {
        this.camera.fov = 62;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /** Pull the camera out of any building it ended up inside. */
  pullCameraOut(target, focusY) {
    const p = this.camPos;
    for (let i = 0; i < 4; i += 1) {
      let inside = false;
      for (const c of this.city.colliders) {
        if (p.x > c.minX - 0.4 && p.x < c.maxX + 0.4 && p.z > c.minZ - 0.4 && p.z < c.maxZ + 0.4 && p.y < 60) {
          inside = true;
          // Move toward the target.
          p.lerp(new THREE.Vector3(target.x, focusY, target.z), 0.35);
          break;
        }
      }
      if (!inside) break;
    }
    if (p.y < 0.6) p.y = 0.6;
  }

  updateHUD(dt) {
    this.hud.step(dt);
    this.hud.setHealth(this.player.health, PLAYER.maxHealth);
    this.hud.setMoney(this.player.money);
    this.hud.setStars(this.police.stars, this.police.bustProgress);
    this.hud.setObjective(this.missions.objectiveText());
    this.hud.setAmmo(this.combat.ammo, this.combat.reloading);
    const inCar = this.player.inCar;
    this.hud.setSpeed(inCar ? Math.abs(inCar.speed) * 3.6 : 0, !!inCar);
    // Clock from time of day (0 = midnight, 0.25 = 06:00, 0.5 = noon... map 0..1 to 24h).
    const hours = Math.floor(((this.timeOfDay + 0.25) % 1) * 24);
    const minutes = Math.floor((((this.timeOfDay + 0.25) % 1) * 24 % 1) * 60);
    this.hud.setClock(hours, minutes);
    // Context prompt.
    let prompt = '';
    if (!inCar && !this.player.dead) {
      const car = this.nearestEnterableCar(4.5);
      if (car) prompt = car.police ? '' : 'Press E to enter car';
      const nearPed = this.traffic.peds.some((p) => !p.dead && Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z) < 2.5);
      if (nearPed) prompt = 'Press F to punch';
    } else if (inCar) {
      prompt = 'E exit car · Space handbrake';
    }
    this.hud.setPrompt(prompt);
    this.crosshair.style.display = (!inCar && this.state === 'playing' && (this.input.locked || this.shotMode)) ? 'block' : 'none';
    // Minimap.
    const marker = this.missions.markerPos();
    this.hud.drawMinimap(
      this.player.inCar ? this.player.inCar.pos : this.player.pos,
      this.player.inCar ? this.player.inCar.heading : this.player.yaw,
      this.traffic.allCars().filter((c) => !c.dead),
      this.police.cars,
      marker,
      this.night01 || 0,
    );
    // Dialogue auto-clear.
    if (this.missions.currentLine === '' && this.missions.dialogue.length === 0) {
      this.hud.setDialogue('');
    }
  }

  run() {
    this.last = performance.now();
    this.acc = 0;
    if (this.shotMode) {
      // Stage the shot scene, then run the whole settle synchronously
      // (fixed steps, no rendering) so the screenshot does not depend on
      // frame rate — then render a few frames and signal readiness.
      this.state = 'playing';
      this.hud.showScreen(null);
      const settle = stageShot(shotName, this);
      this.missionStarted = true; // the shot stages its own mission; don't auto-start another
      const steps = Math.round((1.5 + settle) * 60);
      for (let i = 0; i < steps; i += 1) this.step(STEP);
      for (let i = 0; i < 3; i += 1) {
        this.updateCamera(1); // snap the camera to its desired spot
        this.updateHUD(1 / 60);
        this.renderer.render(this.scene, this.camera);
      }
      window.__shotReady = true;
    } else {
      this.toMenu();
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

// Boot.
const game = new Game();
game.run();
