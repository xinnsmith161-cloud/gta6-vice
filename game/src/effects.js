// Effects: pooled particles (sparks, smoke, muzzle flash), explosions,
// tracers and skid marks. All cheap, all reusable, nothing allocated per
// frame beyond the pools.
import * as THREE from 'three';

const MAX_PARTICLES = 600;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Particle pool (Points with per-particle colour/size via attributes).
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.vels = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.head = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // Tracers: a pool of thin stretched boxes.
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
    for (let i = 0; i < 8; i += 1) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    // Skid marks: a pool of dark quads on the road.
    this.skids = [];
    const skidGeo = new THREE.PlaneGeometry(0.5, 1.4);
    const skidMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 120; i += 1) {
      const m = new THREE.Mesh(skidGeo, skidMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.skids.push({ mesh: m, life: 0 });
    }
    this.skidHead = 0;
    // Explosion flash light (reused).
    this.flash = new THREE.PointLight(0xffa040, 0, 30, 1.5);
    scene.add(this.flash);
    this.flashTimer = 0;
  }

  burst(pos, color, count, speed, life, gravity = 6, up = 2) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      const idx = this.head;
      this.head = (this.head + 1) % MAX_PARTICLES;
      const i3 = idx * 3;
      this.positions[i3] = pos.x;
      this.positions[i3 + 1] = pos.y;
      this.positions[i3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vels[i3] = Math.cos(a) * Math.cos(e) * s;
      this.vels[i3 + 1] = Math.sin(e) * s + up;
      this.vels[i3 + 2] = Math.sin(a) * Math.cos(e) * s;
      const shade = 0.7 + Math.random() * 0.5;
      this.colors[i3] = Math.min(1, c.r * shade);
      this.colors[i3 + 1] = Math.min(1, c.g * shade);
      this.colors[i3 + 2] = Math.min(1, c.b * shade);
      this.life[idx] = life * (0.6 + Math.random() * 0.7);
      this.maxLife[idx] = this.life[idx];
      this.grav[idx] = gravity;
    }
    this.alive = MAX_PARTICLES;
  }

  explosion(pos) {
    this.burst(pos, 0xff8822, 60, 12, 1.0, 4, 4);
    this.burst(pos, 0xffcc66, 30, 8, 0.7, 2, 5);
    this.burst(pos, 0x333333, 25, 5, 1.6, -1, 6);
    this.flash.position.copy(pos).y += 2;
    this.flash.intensity = 60;
    this.flashTimer = 0.25;
  }

  muzzle(pos) { this.burst(pos, 0xffe9a0, 6, 6, 0.12, 0, 1); }
  impact(pos) { this.burst(pos, 0xcccccc, 8, 4, 0.4, 8, 2); }
  pickup(pos) { this.burst(pos, 0x7dff9e, 14, 3, 0.7, -2, 3); }
  smoke(pos) { this.burst(pos, 0x666666, 3, 1.5, 1.2, -1, 2); }

  tracer(from, to) {
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) t = this.tracers[0];
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.09;
  }

  skid(pos, heading) {
    const s = this.skids[this.skidHead];
    this.skidHead = (this.skidHead + 1) % this.skids.length;
    s.mesh.position.set(pos.x, 0.03, pos.z);
    s.mesh.rotation.z = -heading;
    s.mesh.material.opacity = 0.5;
    s.mesh.visible = true;
    s.life = 7;
  }

  step(dt) {
    // Particles
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vels[i3 + 1] -= this.grav[i] * dt;
      this.positions[i3] += this.vels[i3] * dt;
      this.positions[i3 + 1] += this.vels[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vels[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.05) { this.positions[i3 + 1] = 0.05; this.vels[i3 + 1] *= -0.3; }
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -100; // hide
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.setDrawRange(0, any ? MAX_PARTICLES : 0);
    // Tracers
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    // Skids fade
    for (const s of this.skids) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.material.opacity = Math.max(0, s.life / 7) * 0.5;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    // Flash
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.intensity = Math.max(0, this.flashTimer / 0.25) * 60;
    } else {
      this.flash.intensity = 0;
    }
  }
}
