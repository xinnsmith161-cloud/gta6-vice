// Missions and story. Jax Moreno, a driver-for-hire in Solmar City, takes
// jobs from his fixer Rosa Delgado while the Tiburones crew breathes down
// his neck. Four missions, chained; each pays out. A 3D beacon marks the
// current objective, and the HUD shows the objective text.
import * as THREE from 'three';
import { MISSION_NAMES, MISSION_REWARDS, BLOCK, GRID_N, roadCoord, BEACH_Z } from './config.js';
import { makeRng } from './random.js';

// Mission start / targets, in world coordinates.
function missionDefs() {
  const hotel = { x: roadCoord(4) + BLOCK / 2, z: roadCoord(1) + BLOCK / 2 };
  const beachPickup = { x: roadCoord(2), z: BEACH_Z + 10 };
  const garage = { x: roadCoord(1) + BLOCK / 2, z: roadCoord(4) + BLOCK / 2 };
  const safehouse = { x: roadCoord(5) + BLOCK / 2, z: roadCoord(5) + BLOCK / 2 };
  const docks = { x: roadCoord(0) + BLOCK / 2, z: roadCoord(5) + BLOCK / 2 };
  const pkgSpots = [
    { x: roadCoord(0) + BLOCK / 2, z: roadCoord(3) + BLOCK / 2 },
    { x: roadCoord(5) + BLOCK / 2, z: roadCoord(2) + BLOCK / 2 },
    { x: roadCoord(3) + BLOCK / 2, z: roadCoord(0) + BLOCK / 2 },
  ];
  return [
    {
      name: MISSION_NAMES[0],
      reward: MISSION_REWARDS[0],
      intro: [
        'ROSA: Jax, you awake? Got a fare for you.',
        'ROSA: Pick up my client at the beach, then take him to the Solmar Hotel. Easy money.',
        'ROSA: And Jax — drive like you mean it, but don\'t scratch the paint.',
      ],
      stages: [
        { type: 'reach', target: beachPickup, radius: 6, text: 'Pick up the client at the beach' },
        { type: 'reach', target: hotel, radius: 7, text: 'Drop the client at the Solmar Hotel' },
      ],
    },
    {
      name: MISSION_NAMES[1],
      reward: MISSION_REWARDS[1],
      intro: [
        'ROSA: Three packages stashed around the city. Grab them all, bring them to my garage.',
        'ROSA: The Tiburones are sniffing around. If the cops show up, don\'t stop to chat.',
      ],
      stages: [
        { type: 'collect', targets: pkgSpots, radius: 5, text: 'Collect the packages (0/3)' },
        { type: 'reach', target: garage, radius: 7, text: 'Deliver the packages to Rosa\'s garage' },
      ],
      wantedOnStage: 1, // cops notice at stage index 1
    },
    {
      name: MISSION_NAMES[2],
      reward: MISSION_REWARDS[2],
      intro: [
        'ROSA: The job went south. Cops are all over you, Jax.',
        'ROSA: Lose them and get to the safehouse on the east side. Don\'t get busted.',
      ],
      stages: [
        { type: 'reach', target: safehouse, radius: 8, text: 'Reach the safehouse — lose the cops' },
      ],
      wantedAtStart: 3,
    },
    {
      name: MISSION_NAMES[3],
      reward: MISSION_REWARDS[3],
      intro: [
        'ROSA: One last job, Jax. The big one.',
        'ROSA: Kane\'s red Comet is parked by the docks. Take it. Bring it to the north docks and we\'re rich.',
        'ROSA: The whole department will be on you. Make it count.',
      ],
      stages: [
        { type: 'steal', target: docks, radius: 6, text: 'Steal Kane\'s red Comet at the docks' },
        { type: 'deliver', target: { x: roadCoord(5) + BLOCK / 2, z: roadCoord(0) + BLOCK / 2 }, radius: 8, text: 'Deliver the Comet to the north docks' },
      ],
      wantedAtStart: 0,
      wantedOnSteal: 4,
    },
  ];
}

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.defs = missionDefs();
    this.index = -1;          // current mission index (-1 = none)
    this.stage = 0;
    this.active = false;
    this.done = false;        // all missions complete
    this.dialogue = [];       // lines to show, in order
    this.dialogueTimer = 0;
    this.currentLine = '';
    this.collected = 0;
    this.target = null;       // current target {x,z}
    this.targets = null;      // for collect stages
    this.onMissionStart = null;
    this.onMissionComplete = null;
    this.onDialogue = null;   // (line) => show it
    this.onStealTarget = null; // for the steal stage (spawn the sports car)
    this.stealCar = null;
    // Beacon: a light pillar + floating marker at the target.
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    scene.add(this.beacon);
    const dia = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    this.marker = dia;
    this.marker.visible = false;
    scene.add(this.marker);
    this.markerTimer = 0;
  }

  startMission(index) {
    if (index < 0 || index >= this.defs.length) return false;
    const def = this.defs[index];
    this.index = index;
    this.stage = 0;
    this.active = true;
    this.collected = 0;
    this.dialogue = [...def.intro];
    this.dialogueTimer = 0;
    this.currentLine = '';
    this.stealCar = null;
    if (def.wantedAtStart && this.onWanted) this.onWanted(def.wantedAtStart);
    this.setStage(0);
    if (this.onMissionStart) this.onMissionStart(def);
    return true;
  }

  setStage(i) {
    const def = this.defs[this.index];
    this.stage = i;
    const st = def.stages[i];
    if (!st) { this.completeMission(); return; }
    if (st.type === 'collect') {
      this.targets = st.targets.map((t) => ({ ...t, taken: false }));
      this.target = this.targets.find((t) => !t.taken) || null;
    } else {
      this.targets = null;
      this.target = st.target;
    }
    if (st.type === 'steal' && this.onStealTarget) this.onStealTarget(st.target);
    if (def.wantedOnStage === i && this.onWanted) this.onWanted(1);
  }

  /** Current objective text for the HUD. */
  objectiveText() {
    if (!this.active) return this.done ? 'Story complete — free roam. Press M to replay missions.' : '';
    const def = this.defs[this.index];
    const st = def.stages[this.stage];
    if (!st) return '';
    if (st.type === 'collect') return `Collect the packages (${this.collected}/3)`;
    return st.text;
  }

  /** The target marker for the minimap. */
  markerPos() {
    return this.active ? this.target : null;
  }

  step(dt, playerPos, inCar) {
    // Dialogue lines, one at a time.
    if (this.dialogue.length > 0) {
      this.dialogueTimer += dt;
      if (this.dialogueTimer > 4.5 || this.currentLine === '') {
        this.dialogueTimer = 0;
        this.currentLine = this.dialogue.shift();
        if (this.onDialogue) this.onDialogue(this.currentLine);
      }
    }
    // Beacon animation.
    this.markerTimer += dt;
    if (this.active && this.target) {
      this.beacon.visible = true;
      this.marker.visible = true;
      this.beacon.position.set(this.target.x, 30, this.target.z);
      this.marker.position.set(this.target.x, 6 + Math.sin(this.markerTimer * 2.5) * 0.6, this.target.z);
      this.marker.rotation.y = this.markerTimer * 1.5;
    } else {
      this.beacon.visible = false;
      this.marker.visible = false;
    }
    if (!this.active) return;
    const def = this.defs[this.index];
    const st = def.stages[this.stage];
    if (!st) return;
    const px = playerPos.x;
    const pz = playerPos.z;
    if (st.type === 'reach' || st.type === 'deliver') {
      const d = Math.hypot(px - st.target.x, pz - st.target.z);
      if (d < st.radius) this.advance();
    } else if (st.type === 'collect') {
      for (const t of this.targets) {
        if (t.taken) continue;
        const d = Math.hypot(px - t.x, pz - t.z);
        if (d < st.radius) {
          t.taken = true;
          this.collected += 1;
          if (this.onPickup) this.onPickup(t);
          this.target = this.targets.find((x) => !x.taken) || null;
          if (this.collected >= this.targets.length) this.advance();
          break;
        }
      }
    } else if (st.type === 'steal') {
      // Completed by entering the marked sports car (main checks via onSteal).
      const d = Math.hypot(px - st.target.x, pz - st.target.z);
      if (d < st.radius && this.stealCar && inCar === this.stealCar) {
        if (def.wantedOnSteal && this.onWanted) this.onWanted(def.wantedOnSteal);
        this.advance();
      }
    }
  }

  advance() {
    const def = this.defs[this.index];
    if (this.stage + 1 < def.stages.length) {
      this.setStage(this.stage + 1);
    } else {
      this.completeMission();
    }
  }

  completeMission() {
    const def = this.defs[this.index];
    this.active = false;
    this.target = null;
    this.beacon.visible = false;
    this.marker.visible = false;
    if (this.onMissionComplete) this.onMissionComplete(def);
    // Chain the next mission after a beat.
    const next = this.index + 1;
    if (next < this.defs.length) {
      this.pendingNext = next;
      this.pendingTimer = 5;
    } else {
      this.done = true;
      this.pendingNext = -1;
    }
  }

  stepPending(dt) {
    if (this.pendingNext >= 0) {
      this.pendingTimer -= dt;
      if (this.pendingTimer <= 0) {
        const n = this.pendingNext;
        this.pendingNext = -1;
        this.startMission(n);
      }
    }
  }

  replay() {
    this.done = false;
    this.pendingNext = -1;
    this.startMission(0);
  }

  /** For screenshots: jump straight to a mission+stage. */
  stageForShot(index, stage) {
    this.startMission(index);
    if (stage > 0) this.setStage(stage);
    this.dialogue = [];
    this.currentLine = '';
  }
}
