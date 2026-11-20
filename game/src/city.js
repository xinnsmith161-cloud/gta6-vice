// Solmar City — procedural coastal city: grid streets, buildings, palms,
// beach and water. Everything is generated from a seed; the function returns
// the colliders (AABBs) and the road network the traffic and missions use.
import * as THREE from 'three';
import { BLOCK, GRID_N, ROAD_W, SIDEWALK_W, CITY_SIZE, BEACH_Z, WATER_Z, PALETTE, roadCoord } from './config.js';
import { makeRng } from './random.js';

// ---- Canvas textures (generated at runtime, no files) ----
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#33383f';
    for (let i = 0; i < 200; i += 1) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#d8d8d8';
    g.fillRect(w / 2 - 2, 0, 4, 18);
    g.fillRect(w / 2 - 2, 32, 4, 18);
    g.fillRect(w / 2 - 2, 64, 4, 18);
    g.fillRect(w / 2 - 2, 96, 4, 18);
    g.fillStyle = '#e8e8e8';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}

function buildingTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // window grid
    for (let y = 14; y < h - 10; y += 26) {
      for (let x = 10; x < w - 10; x += 22) {
        const on = Math.random() < (lit ? 0.45 : 0.18);
        g.fillStyle = on ? '#ffd98a' : '#20283a';
        g.fillRect(x, y, 14, 16);
      }
    }
  });
}

function sandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d29a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dcc184';
    for (let i = 0; i < 400; i += 1) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
}

// ---- City ----
export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = [];   // {minX, maxX, minZ, maxZ}
    this.neonSigns = [];   // meshes whose emissive we boost at night
    this.streetLights = []; // {light, mesh}
    this.spawnPoints = []; // road positions for cars / police
    this.beachSpots = [];
    this.build();
  }

  build() {
    const rng = this.rng;
    const scene = this.scene;
    const half = CITY_SIZE / 2;

    // Ground (grass between blocks)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_SIZE + 220, CITY_SIZE + 260),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 20);
    ground.receiveShadow = true;
    scene.add(ground);

    // Roads: one dark strip per grid line, both directions.
    const roadTex = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const roadLen = CITY_SIZE + ROAD_W;
    for (let i = 0; i <= GRID_N; i += 1) {
      const c = roadCoord(i);
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, roadLen), roadMat.clone());
      ns.material.map = roadTex.clone();
      ns.material.map.repeat.set(1, roadLen / 16);
      ns.material.map.needsUpdate = true;
      ns.rotation.x = -Math.PI / 2;
      ns.position.set(c, 0.01, 0);
      ns.receiveShadow = true;
      scene.add(ns);
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_W), roadMat.clone());
      ew.material.map = roadTex.clone();
      ew.material.map.repeat.set(roadLen / 16, 1);
      ew.material.map.needsUpdate = true;
      ew.rotation.x = -Math.PI / 2;
      ew.position.set(0, 0.01, c);
      ew.receiveShadow = true;
      scene.add(ew);
      // Sidewalks flanking each road
      const swMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
      const swGeoNS = new THREE.BoxGeometry(SIDEWALK_W, 0.12, roadLen);
      const swGeoEW = new THREE.BoxGeometry(roadLen, 0.12, SIDEWALK_W);
      for (const off of [-1, 1]) {
        const s1 = new THREE.Mesh(swGeoNS, swMat);
        s1.position.set(c + off * (ROAD_W / 2 + SIDEWALK_W / 2), 0.06, 0);
        s1.receiveShadow = true;
        scene.add(s1);
        const s2 = new THREE.Mesh(swGeoEW, swMat);
        s2.position.set(0, 0.06, c + off * (ROAD_W / 2 + SIDEWALK_W / 2));
        s2.receiveShadow = true;
        scene.add(s2);
      }
      // spawn points along this road
      for (let t = -half + 20; t <= half - 20; t += 45) {
        this.spawnPoints.push({ x: c + 3.5, z: t, angle: 0 });
        this.spawnPoints.push({ x: c - 3.5, z: t, angle: Math.PI });
        this.spawnPoints.push({ x: t, z: c + 3.5, angle: Math.PI / 2 });
        this.spawnPoints.push({ x: t, z: c - 3.5, angle: -Math.PI / 2 });
      }
    }

    // Buildings: fill each block interior with 1-4 boxes.
    const blockInner = BLOCK - ROAD_W - SIDEWALK_W * 2 - 4;
    for (let bi = 0; bi < GRID_N; bi += 1) {
      for (let bj = 0; bj < GRID_N; bj += 1) {
        const cx = roadCoord(bi) + BLOCK / 2;
        const cz = roadCoord(bj) + BLOCK / 2;
        // Skip the central plaza block (a park with a fountain).
        if (bi === 2 && bj === 2) { this.buildPlaza(cx, cz); continue; }
        // Skip the beachfront row's south edge (boardwalk instead).
        const count = rng.int(1, 3);
        for (let k = 0; k < count; k += 1) {
          const w = rng.range(16, 30);
          const d = rng.range(16, 30);
          const h = rng.range(10, 52);
          const ox = rng.range(-blockInner / 2 + w / 2, blockInner / 2 - w / 2);
          const oz = rng.range(-blockInner / 2 + d / 2, blockInner / 2 - d / 2);
          const x = cx + ox;
          const z = cz + oz;
          const color = rng.pick(PALETTE.building);
          const tex = buildingTexture('#' + color.toString(16).padStart(6, '0'), false);
          const mat = new THREE.MeshLambertMaterial({ map: tex });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(x, h / 2, z);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          // Roof rim
          const rim = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            new THREE.MeshLambertMaterial({ color: 0x444444 }),
          );
          rim.position.set(x, h + 0.25, z);
          scene.add(rim);
          // Neon sign on some tall buildings
          if (h > 30 && rng.chance(0.4)) {
            const neon = new THREE.Mesh(
              new THREE.BoxGeometry(0.4, 2.2, Math.min(w, 10)),
              new THREE.MeshBasicMaterial({ color: rng.pick(PALETTE.neon) }),
            );
            neon.position.set(x + w / 2 + 0.3, h * 0.75, z);
            scene.add(neon);
            this.neonSigns.push(neon);
          }
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
        // Palm trees on the block corners
        for (let p = 0; p < 2; p += 1) {
          const px = cx + rng.range(-blockInner / 2, blockInner / 2);
          const pz = cz + rng.range(-blockInner / 2, blockInner / 2);
          this.addPalm(px, pz, rng);
        }
      }
    }

    // Beach + water (south edge)
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_SIZE + 220, 90),
      new THREE.MeshLambertMaterial({ map: sandTexture() }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, BEACH_Z + 20);
    sand.receiveShadow = true;
    scene.add(sand);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_SIZE + 400, 220),
      new THREE.MeshLambertMaterial({ color: PALETTE.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.3, WATER_Z + 80);
    scene.add(water);
    this.water = water;
    // Boardwalk + palms along the beach
    for (let x = -half; x <= half; x += 26) {
      this.addPalm(x + rng.range(-3, 3), BEACH_Z - 6, rng);
    }
    // Beach umbrellas (colourful cones)
    for (let i = 0; i < 18; i += 1) {
      const x = rng.range(-half, half);
      const z = BEACH_Z + rng.range(8, 55);
      const um = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 1.4, 8),
        new THREE.MeshLambertMaterial({ color: rng.pick(PALETTE.neon) }),
      );
      um.position.set(x, 2.2, z);
      scene.add(um);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }),
      );
      pole.position.set(x, 1.1, z);
      scene.add(pole);
      this.beachSpots.push({ x, z });
    }
    // Beach towels (flat coloured mats on the sand).
    const towelCols = [0xff5d8f, 0x3ec1d3, 0xff9f1c, 0x7bd389, 0xb388eb];
    for (let i = 0; i < 12; i += 1) {
      const tx = rng.range(-half, half);
      const tz = BEACH_Z + rng.range(6, 50);
      const towel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 2.4),
        new THREE.MeshLambertMaterial({ color: towelCols[i % towelCols.length] }),
      );
      towel.rotation.x = -Math.PI / 2;
      towel.rotation.z = rng.range(0, Math.PI);
      towel.position.set(tx, 0.05, tz);
      scene.add(towel);
    }

    // Streetlights at intersections. Only a few carry a real point light
    // (many lights are expensive); the rest are lamp meshes only.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    let lightCount = 0;
    for (let i = 0; i <= GRID_N; i += 1) {
      for (let j = 0; j <= GRID_N; j += 1) {
        if ((i + j) % 2 !== 0) continue;
        const x = roadCoord(i) + ROAD_W / 2 + 1.2;
        const z = roadCoord(j) + ROAD_W / 2 + 1.2;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.set(x, 3, z);
        scene.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), poleMat);
        arm.position.set(x - 1, 5.9, z);
        scene.add(arm);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
        );
        lamp.position.set(x - 2, 5.8, z);
        scene.add(lamp);
        if (lightCount < 8) {
          const light = new THREE.PointLight(0xffd98a, 0, 26, 1.6);
          light.position.set(x - 2, 5.6, z);
          scene.add(light);
          this.streetLights.push({ light, mesh: lamp });
          lightCount += 1;
        }
      }
    }

    // Landmark: the Solmar Tower (tall, centre-north) — a navigation beacon.
    const towerTex = buildingTexture('#c97a6b', true);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(26, 95, 26),
      new THREE.MeshLambertMaterial({ map: towerTex }),
    );
    tower.position.set(roadCoord(3) + BLOCK / 2, 47.5, roadCoord(0) + BLOCK / 2);
    tower.castShadow = true;
    scene.add(tower);
    this.colliders.push({
      minX: tower.position.x - 13, maxX: tower.position.x + 13,
      minZ: tower.position.z - 13, maxZ: tower.position.z + 13,
    });
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
    );
    beacon.position.set(tower.position.x, 97, tower.position.z);
    scene.add(beacon);
    this.neonSigns.push(beacon);
  }

  buildPlaza(cx, cz) {
    // Central park: fountain + benches + palms, no buildings.
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(26, 24),
      new THREE.MeshLambertMaterial({ color: 0x4a8f5f }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.05, cz);
    lawn.receiveShadow = true;
    this.scene.add(lawn);
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 7, 1.2, 16),
      new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }),
    );
    fountain.position.set(cx, 0.6, cz);
    this.scene.add(fountain);
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.2, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0xcfefff }),
    );
    jet.position.set(cx, 3, cz);
    this.scene.add(jet);
    this.colliders.push({ minX: cx - 7, maxX: cx + 7, minZ: cz - 7, maxZ: cz + 7 });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      this.addPalm(cx + Math.cos(a) * 20, cz + Math.sin(a) * 20, this.rng);
    }
  }

  addPalm(x, z, rng) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
    );
    trunk.position.y = 3.25;
    trunk.rotation.z = rng.range(-0.06, 0.06);
    g.add(trunk);
    // One stylised crown cone instead of six separate leaves.
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 2.6, 7),
      new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf }),
    );
    crown.position.y = 7.2;
    g.add(crown);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }

  /** Night (0..1): streetlights on, neon bright, water darker. */
  setNight(night01) {
    for (const s of this.streetLights) {
      s.light.intensity = night01 * 1.6;
    }
    for (const n of this.neonSigns) {
      n.material.color.setScalar(1);
    }
    if (this.water) {
      this.water.material.color.setHex(night01 > 0.5 ? 0x0d3a52 : PALETTE.water);
    }
  }

  /** Circle vs building AABBs: push `pos` (with radius) out. Returns true if hit. */
  collideCircle(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // centre inside the box: push along the smallest penetration axis
          const pl = pos.x - c.minX, pr = c.maxX - pos.x;
          const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = c.minX - radius;
          else if (m === pr) pos.x = c.maxX + radius;
          else if (m === pt) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
    return hit;
  }

  /** Is (x,z) on a road (within the road half-width of a grid line)? */
  onRoad(x, z) {
    const half = ROAD_W / 2 + 0.5;
    for (let i = 0; i <= GRID_N; i += 1) {
      const c = roadCoord(i);
      if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
    }
    return false;
  }

  /** Nearest road centreline coordinate for an axis value. */
  nearestRoad(v) {
    let best = roadCoord(0);
    let bd = Infinity;
    for (let i = 0; i <= GRID_N; i += 1) {
      const d = Math.abs(roadCoord(i) - v);
      if (d < bd) { bd = d; best = roadCoord(i); }
    }
    return best;
  }
}
