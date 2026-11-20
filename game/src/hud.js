// HUD: DOM overlay (health, money, wanted stars, objective, dialogue,
// prompts, speed) plus a canvas minimap, plus the start / pause /
// wasted / busted screens. All DOM — the 3D canvas stays clean.
import { BLOCK, GRID_N, CITY_SIZE, BEACH_Z, roadCoord } from './config.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.build();
    this.minimapBg = null;
    this.flashTimer = 0;
    this.toastTimer = 0;
  }

  build() {
    this.root.innerHTML = `
      <div id="hud-tl">
        <div id="health-row"><div id="health-label">HEALTH</div><div id="health-bar"><div id="health-fill"></div></div></div>
        <div id="money-row">$<span id="money">0</span></div>
        <div id="stars-row"></div>
      </div>
      <div id="hud-tc">
        <div id="objective"></div>
        <div id="dialogue"></div>
      </div>
      <div id="hud-tr">
        <canvas id="minimap" width="220" height="220"></canvas>
        <div id="clock">12:00</div>
      </div>
      <div id="hud-bl"><span id="weapon">PISTOL</span> <span id="ammo">12 / ∞</span></div>
      <div id="hud-br"><span id="speed">0</span><span id="speed-unit"> km/h</span></div>
      <div id="hud-bc"><span id="prompt"></span></div>
      <div id="toast"></div>
      <div id="damage-flash"></div>
      <div id="screen-start" class="screen">
        <div class="panel">
          <h1>SOLMAR CITY</h1>
          <p class="tagline">An open-world crime story on the coast. Drive, hustle, outrun the law.</p>
          <div class="btn-row"><button id="btn-new">NEW GAME</button><button id="btn-continue">CONTINUE</button></div>
          <div class="btn-row"><button id="btn-how">HOW TO PLAY</button><button id="btn-sound">SOUND: ON</button></div>
          <div id="howto" class="hidden">
            <p><b>W A S D</b> move / drive &nbsp; <b>Mouse</b> look &nbsp; <b>Shift</b> run</p>
            <p><b>E</b> enter / exit car &nbsp; <b>Click</b> shoot &nbsp; <b>F</b> punch &nbsp; <b>R</b> reload</p>
            <p><b>Space</b> handbrake &nbsp; <b>M</b> missions &nbsp; <b>P</b> pause &nbsp; <b>H</b> save</p>
            <p>Steal cars, run missions for Rosa, and watch your wanted level — the Solmar PD does not give up easy.</p>
          </div>
          <p class="foot">A fan-made open-world game. Original city, characters and story.</p>
        </div>
      </div>
      <div id="screen-pause" class="screen hidden">
        <div class="panel">
          <h1>PAUSED</h1>
          <div class="btn-row"><button id="btn-resume">RESUME</button><button id="btn-save">SAVE GAME</button></div>
          <div class="btn-row"><button id="btn-replay">REPLAY MISSIONS</button><button id="btn-quit">QUIT TO MENU</button></div>
          <p class="foot">Progress saves to this browser.</p>
        </div>
      </div>
      <div id="screen-end" class="screen hidden">
        <div class="panel">
          <h1 id="end-title">WASTED</h1>
          <p id="end-text"></p>
          <div class="btn-row"><button id="btn-retry">RESPAWN</button><button id="btn-end-menu">MAIN MENU</button></div>
        </div>
      </div>
    `;
    this.el = {};
    for (const id of ['money', 'stars-row', 'objective', 'dialogue', 'weapon', 'ammo', 'speed', 'prompt', 'toast', 'health-fill', 'clock', 'damage-flash', 'screen-start', 'screen-pause', 'screen-end', 'end-title', 'end-text', 'howto', 'btn-sound']) {
      this.el[id] = document.getElementById(id);
    }
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    document.getElementById('btn-how').addEventListener('click', () => {
      this.el.howto.classList.toggle('hidden');
    });
  }

  showScreen(name) {
    for (const s of ['screen-start', 'screen-pause', 'screen-end']) {
      this.el[s].classList.add('hidden');
    }
    if (name) this.el[name].classList.remove('hidden');
  }

  showEnd(title, text) {
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.showScreen('screen-end');
  }

  setHealth(h, max) {
    const pct = Math.max(0, Math.min(100, (h / max) * 100));
    this.el['health-fill'].style.width = pct + '%';
    this.el['health-fill'].style.background = pct > 50 ? '#37d67a' : pct > 25 ? '#f2c230' : '#e5534b';
  }
  setMoney(m) { this.el.money.textContent = Math.floor(m).toLocaleString('en-US'); }
  setStars(n, bustProgress) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    this.el['stars-row'].textContent = s;
    this.el['stars-row'].style.opacity = n > 0 ? '1' : '0.35';
    if (bustProgress > 0) this.el['stars-row'].textContent = s + '  BUSTED ' + Math.round(bustProgress * 100) + '%';
  }
  setObjective(text) { this.el.objective.textContent = text; }
  setDialogue(line) {
    this.el.dialogue.textContent = line || '';
    this.el.dialogue.style.opacity = line ? '1' : '0';
  }
  setPrompt(text) { this.el.prompt.textContent = text || ''; }
  setAmmo(ammo, reloading) {
    this.el.ammo.textContent = reloading > 0 ? 'RELOADING…' : ammo + ' / ∞';
  }
  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? Math.round(kmh) : '';
    document.getElementById('speed-unit').style.display = inCar ? '' : 'none';
  }
  setClock(hour, minute) {
    this.el.clock.textContent = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  toast(text, ms = 3500) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = ms / 1000;
  }
  damageFlash() {
    this.el['damage-flash'].style.opacity = '0.45';
    this.flashTimer = 0.25;
  }
  step(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.el['damage-flash'].style.opacity = Math.max(0, this.flashTimer / 0.25) * 0.45;
    }
  }

  /** Pre-render the static minimap background (roads + buildings). */
  buildMinimapBg(colliders) {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 220;
    const g = c.getContext('2d');
    const half = CITY_SIZE / 2 + 60;
    const scale = 220 / (half * 2);
    const toMap = (x, z) => [110 + x * scale, 110 + z * scale];
    g.fillStyle = '#10141c';
    g.fillRect(0, 0, 220, 220);
    // Beach + water
    const [, beachY] = toMap(0, BEACH_Z);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, beachY, 220, 220 - beachY);
    g.fillStyle = '#1e6f8e';
    g.fillRect(0, beachY + 24, 220, 220 - beachY - 24);
    // Roads
    g.strokeStyle = '#565d68';
    g.lineWidth = 7;
    for (let i = 0; i <= GRID_N; i += 1) {
      const rc = roadCoord(i);
      const [x1] = toMap(rc, 0);
      const [, z1] = toMap(0, rc);
      g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, 220); g.stroke();
      g.beginPath(); g.moveTo(0, z1); g.lineTo(220, z1); g.stroke();
    }
    // Buildings
    g.fillStyle = '#2c3442';
    for (const b of colliders) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      g.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
    this.minimapBg = c;
  }

  /** Draw the minimap: background + player, cars, police, marker. */
  drawMinimap(playerPos, playerYaw, cars, policeCars, marker, night01) {
    const g = this.mm;
    if (this.minimapBg) g.drawImage(this.minimapBg, 0, 0);
    else { g.fillStyle = '#10141c'; g.fillRect(0, 0, 220, 220); }
    const half = CITY_SIZE / 2 + 60;
    const scale = 220 / (half * 2);
    const toMap = (x, z) => [110 + x * scale, 110 + z * scale];
    // Mission marker
    if (marker) {
      const [mx, mz] = toMap(marker.x, marker.z);
      g.save();
      g.translate(mx, mz);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd166';
      g.fillRect(-5, -5, 10, 10);
      g.restore();
      g.strokeStyle = 'rgba(255,209,102,0.6)';
      g.beginPath(); g.arc(mx, mz, 10, 0, Math.PI * 2); g.stroke();
    }
    // Traffic cars (grey dots)
    g.fillStyle = '#c8cdd4';
    for (const c of cars) {
      const [x, z] = toMap(c.pos.x, c.pos.z);
      g.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police (blue dots with red ring)
    for (const c of policeCars) {
      const [x, z] = toMap(c.pos.x, c.pos.z);
      g.fillStyle = '#3b82f6';
      g.beginPath(); g.arc(x, z, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ef4444';
      g.beginPath(); g.arc(x, z, 5, 0, Math.PI * 2); g.stroke();
    }
    // Player arrow
    const [px, pz] = toMap(playerPos.x, playerPos.z);
    g.save();
    g.translate(px, pz);
    g.rotate(playerYaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // North + frame
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = 'bold 11px system-ui, sans-serif';
    g.fillText('N', 8, 16);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 218, 218);
  }
}
