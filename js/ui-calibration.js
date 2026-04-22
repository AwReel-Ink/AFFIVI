import { DB } from './db.js';
import { prompt2 } from './ui-profiles.js';

export class CalibrationUI {
  constructor(overlay, gps, onDone) {
    this.overlay = overlay;
    this.gps = gps;
    this.onDone = onDone;
    this.profile = null;
    this.samples = [];
    this.currentSpeed = 0;
    this._unsub = null;
  }

  async open(profileId) {
    this.profile = await DB.getProfile(profileId);
    if (!this.profile) return;
    this.samples = [];
    this._renderStep1();
    this.overlay.classList.remove('hidden');
    requestAnimationFrame(() => this.overlay.classList.add('visible'));
  }

  close() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this.overlay.classList.remove('visible');
    setTimeout(() => this.overlay.classList.add('hidden'), 300);
  }

  _shell(title, inner) {
    this.overlay.innerHTML = `
      <header class="overlay-header">
        <button class="back-btn" id="c-back">←</button>
        <h2>${title}</h2>
      </header>
      <div class="overlay-body">${inner}</div>
    `;
    this.overlay.querySelector('#c-back').onclick = () => this.close();
  }

  _renderStep1() {
    this._shell(`Calibrer ${this.profile.name}`, `
      <div class="wizard-step">
        <h3>Bienvenue 👋</h3>
        <p>On va calibrer votre véhicule pour que la vitesse affichée soit parfaitement exacte. Ça prend 2 minutes sur une route dégagée.</p>
        <p>Vous allez rouler à différentes vitesses stables (50, 70, 90, 110 km/h) et à chaque fois, saisir ce que votre compteur indique.</p>
        <button class="btn-primary" id="c-start">Commencer une nouvelle calibration</button>
        ${this.profile.samples?.length ? `<button class="btn-secondary" id="c-add">Compléter la calibration existante (${this.profile.samples.length} échantillon(s))</button>` : ''}
      </div>
    `);
    this.overlay.querySelector('#c-start').onclick = () => { this.samples = []; this._renderStep3(); };
    const addBtn = this.overlay.querySelector('#c-add');
    if (addBtn) addBtn.onclick = () => { this.samples = [...(this.profile.samples || [])]; this._renderStep3(); };
  }

  _renderStep3() {
    this._shell(`Calibrer ${this.profile.name}`, `
      <div class="wizard-step">
        <p>Stabilisez votre vitesse, lisez votre compteur, puis appuyez sur <strong>Enregistrer</strong>.</p>
        <div class="big-speed-display" id="c-speed">0</div>
        <p style="text-align:center">Vitesse GPS en direct (km/h)</p>
        <button class="btn-primary" id="c-capture">📸 Enregistrer cet échantillon</button>
        <div id="c-samples"></div>
        <button class="btn-secondary" id="c-finish" ${this.samples.length < 2 ? 'disabled style="opacity:.4"' : ''}>Terminer (${this.samples.length} échantillon(s))</button>
      </div>
    `);
    this._renderSamples();
    this._unsub = this.gps.onUpdate(d => {
      if (d.speedKmh != null) {
        this.currentSpeed = d.speedKmh;
        const el = this.overlay.querySelector('#c-speed');
        if (el) el.textContent = Math.round(d.speedKmh);
      }
    });
    this.overlay.querySelector('#c-capture').onclick = () => this._capture();
    this.overlay.querySelector('#c-finish').onclick = () => this._renderStep4();
  }

  _renderSamples() {
    const c = this.overlay.querySelector('#c-samples');
    if (!c) return;
    if (!this.samples.length) { c.innerHTML = '<p style="text-align:center;margin:10px 0;">Aucun échantillon encore.</p>'; return; }
    c.innerHTML = `<table class="sample-table">
      <tr><th>GPS</th><th>Compteur</th><th>Écart</th></tr>
      ${this.samples.map(s => `<tr><td>${s.gps.toFixed(1)}</td><td>${s.dashboard}</td><td>${((s.dashboard - s.gps) / s.gps * 100).toFixed(1)}%</td></tr>`).join('')}
    </table>`;
  }

  async _capture() {
    if (this.currentSpeed < 20) {
      alert('Roulez à au moins 20 km/h pour un échantillon fiable.');
      return;
    }
    const val = await prompt2('Valeur du compteur', `Que lisez-vous sur votre tableau de bord ? (GPS = ${Math.round(this.currentSpeed)} km/h)`);
    const dash = parseFloat(val);
    if (!dash || dash < 5) return;
    this.samples.push({ gps: this.currentSpeed, dashboard: dash, timestamp: Date.now() });
    this._renderStep3();
  }

  _computeCoef() {
    if (!this.samples.length) return 1;
    let totalW = 0, sum = 0;
    this.samples.forEach(s => {
      const w = s.gps >= 70 ? 2 : 1;
      sum += (s.gps / s.dashboard) * w;
      totalW += w;
    });
    return sum / totalW;
  }

  _renderStep4() {
  if (this._unsub) { this._unsub(); this._unsub = null; }
  const coef = this._computeCoef();
  const deltaPct = ((1 - coef) * 100).toFixed(1);
  const sense = coef < 1 ? 'de plus' : 'de moins';
  this._shell(`Résultat`, `
    <div class="wizard-step">
      <h3>Calibration calculée ✅</h3>
      <p>Votre véhicule affiche environ <strong>${Math.abs(deltaPct)}% ${sense}</strong> que la vitesse réelle.</p>
      <p>Coefficient : <strong>× ${coef.toFixed(4)}</strong></p>
      <table class="sample-table">
        <tr><th>GPS</th><th>Compteur</th></tr>
        ${this.samples.map(s => `<tr><td>${s.gps.toFixed(1)}</td><td>${s.dashboard}</td></tr>`).join('')}
      </table>
      <div class="wizard-actions">
        <button class="btn-secondary" id="c-redo">Recommencer</button>
        <button class="btn-primary" id="c-save">Enregistrer</button>
      </div>
    </div>
  `);
  this.overlay.querySelector('#c-redo').onclick = () => { this.samples = []; this._renderStep2(); };
  this.overlay.querySelector('#c-save').onclick = () => this._save(coef);
}

async _save(coef) {
  this.profile.calibrationCoef = coef;
  this.profile.calibrationSamples = this.samples;
  this.profile.calibrationDate = Date.now();
  await DB.putProfile(this.profile);
  this.close();
  if (this.onDone) this.onDone(this.profile);
}

close() {
  if (this._unsub) { this._unsub(); this._unsub = null; }
  if (this.overlay) { this.overlay.remove(); this.overlay = null; }
}
}

// Mini-prompt custom (évite le prompt natif qui bloque le GPS sur certains navigateurs)
function prompt2(title, msg) {
return new Promise(resolve => {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `
    <div class="overlay-inner small">
      <h3>${title}</h3>
      <p>${msg}</p>
      <input type="number" id="p2-input" inputmode="decimal" style="width:100%;font-size:1.5rem;padding:10px;text-align:center;">
      <div class="wizard-actions">
        <button class="btn-secondary" id="p2-cancel">Annuler</button>
        <button class="btn-primary" id="p2-ok">Valider</button>
      </div>
    </div>`;
  document.body.appendChild(o);
  const input = o.querySelector('#p2-input');
  input.focus();
  o.querySelector('#p2-cancel').onclick = () => { o.remove(); resolve(null); };
  o.querySelector('#p2-ok').onclick = () => { const v = input.value; o.remove(); resolve(v); };
  input.onkeydown = e => { if (e.key === 'Enter') o.querySelector('#p2-ok').click(); };
});
}
