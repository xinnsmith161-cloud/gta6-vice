// Combat: the player's pistol (hitscan with a tracer) and melee punch.
// Targets are pedestrians, traffic cars and police cars. Shooting and
// killing are crimes — the caller reports them to the wanted system.
import * as THREE from 'three';
import { COMBAT, PLAYER, WANTED } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.cooldown = 0;
    this.ammo = COMBAT.pistolMag;
    this.reloading = 0;
    this.raycaster = new THREE.Raycaster();
  }

  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = COMBAT.pistolMag;
    }
  }

  reload() {
    if (this.reloading <= 0 && this.ammo < COMBAT.pistolMag) this.reloading = 1.0;
  }

  /** Fire the pistol from `origin` along `dir`. Returns the hit info. */
  shoot(origin, dir, targets) {
    if (this.cooldown > 0 || this.reloading > 0 || this.ammo <= 0) return null;
    this.cooldown = COMBAT.pistolCooldown;
    this.ammo -= 1;
    if (this.ammo === 0) this.reload();
    this.raycaster.set(origin, dir);
    this.raycaster.far = COMBAT.pistolRange;
    // Build a list of meshes to test (peds + cars), with their owners.
    const meshes = [];
    for (const t of targets) {
      if (t.mesh) meshes.push(t.mesh);
      if (t.car && t.car.mesh) meshes.push(t.car.mesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return { hit: false, point: origin.clone().addScaledVector(dir, COMBAT.pistolRange) };
    const hit = hits[0];
    // Walk up to the object that owns this mesh.
    let obj = hit.object;
    while (obj && !obj.userData.owner) obj = obj.parent;
    const owner = obj ? obj.userData.owner : null;
    return { hit: true, point: hit.point.clone(), owner, distance: hit.distance };
  }

  /** Melee punch: the nearest ped in front within range takes damage. */
  punch(playerPos, playerYaw, peds) {
    let best = null;
    let bestD = PLAYER.punchRange;
    const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
    for (const p of peds) {
      if (p.dead) continue;
      const to = new THREE.Vector3().subVectors(p.pos, playerPos);
      const d = to.length();
      if (d > PLAYER.punchRange) continue;
      to.normalize();
      if (to.dot(fwd) < 0.3) continue;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
