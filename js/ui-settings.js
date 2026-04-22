import { DB } from './db.js';
import { COUNTRIES } from './countries.js';

export class SettingsUI {
  constructor({ onClose, onChange }) {
    this.onClose = onClose;
    this.onChange = onChange;
    this.overlay = null;
  }

  async open() {
    const settings = await this._loadSettings();
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="overlay-inner">
        <header class="overlay-header">
          <h2>⚙️ Réglages</h2>
          <button class="icon-btn" id="s-close" aria-label="Fermer">✕</button>
        </header>

        <div class="settings-body">

          <section class="settings-section">
            <h3>🎨 Apparence</h3>
            <label class="setting-row">
              <span>Thème</span>
              <select id="s-theme">
                <option value="auto">Automatique</option>
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
                <option value="night">Nuit (rouge)</option>
              </select>
            </label>
            <label class="setting-row">
              <span>Taille de la vitesse</span>
              <select id="s-size">
                <option value="normal">Normale</option>
                <option value="large">Grande</option>
                <option value="xl">Très grande</option>
              </select>
            </label>
          </section>

          <section class="settings-section">
            <h3>🌍 Pays & unités</h3>
            <label class="setting-row">
              <span>Pays par défaut</span>
              <select id="s-country">
                ${Object.entries(COUNTRIES).map(([k, c]) =>
                  `<option value="${k}">${c.flag} ${c.name}</option>`).join('')}
              </select>
            </label>
            <label class="setting-row">
              <span>Détection auto du pays</span>
              <input type="checkbox" id="s-auto-country">
            </label>
            <label class="setting-row">
              <span>Unité</span>
              <select id="s-unit">
                <option value="auto">Selon le pays</option>
                <option value="kmh">km/h</option>
                <option value="mph">mph</option>
              </select>
            </label>
          </section>

          <section class="settings-section">
            <h3>🚨 Alertes</h3>
            <label class="setting-row">
              <span>Alerte dépassement</span>
              <input type="checkbox" id="s-alert-over">
            </label>
            <label class="setting-row">
              <span>Tolérance (km/h)</span>
              <input type="number" id="s-tolerance" min="0" max="20" step="1" style="width:80px;text-align:center;">
            </label>
            <label class="setting-row">
              <span>Vibration</span>
              <input type="checkbox" id="s-vibrate">
            </label>
            <label class="setting-row">
              <span>Son</span>
              <input type="checkbox" id="s-sound">
            </label>
          </section>

          <section class="settings-section">
            <h3>📱 Écran</h3>
            <label class="setting-row">
              <span>Empêcher la mise en veille</span>
              <input type="checkbox" id="s-wakelock">
            </label>
            <label class="setting-row">
              <span>Mode plein écran au démarrage</span>
              <input type="checkbox" id="s-fullscreen">
            </label>
          </section>

          <section class="settings-section">
            <h3>💾 Données</h3>
            <div class="settings-buttons">
              <button class="btn-secondary" id="s-export">📤 Exporter mes véhicules</button>
              <button class="btn-secondary" id="s-import">📥 Importer</button>
              <button class="btn-danger" id="s-reset">🗑 Réinitialiser l'application</button>
            </div>
            <input type="file" id="s-import-file" accept="application/json" hidden>
          </section>

          <section class="settings-section">
            <h3>ℹ️ À propos</h3>
            <p class="about-text">
              <strong>AffiVi</strong> — Compteur de vitesse GPS<br>
              Version 1.0.0<br>
              <small>Fonctionne 100% hors-ligne. Aucune donnée envoyée.</small>
            </p>
          </section>

        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    // Remplir les valeurs actuelles
    this.overlay.querySelector('#s-theme').value       = settings.theme;
    this.overlay.querySelector('#s-size').value        = settings.speedSize;
    this.overlay.querySelector('#s-country').value     = settings.country;
    this.overlay.querySelector('#s-auto-country').checked = settings.autoCountry;
    this.overlay.querySelector('#s-unit').value        = settings.unit;
    this.overlay.querySelector('#s-alert-over').checked = settings.alertOver;
    this.overlay.querySelector('#s-tolerance').value   = settings.tolerance;
    this.overlay.querySelector('#s-vibrate').checked   = settings.vibrate;
    this.overlay.querySelector('#s-sound').checked     = settings.sound;
    this.overlay.querySelector('#s-wakelock').checked  = settings.wakeLock;
    this.overlay.querySelector('#s-fullscreen').checked = settings.fullscreen;

    this._bind();
  }

  async _loadSettings() {
    return {
      theme:       await DB.getSetting('theme', 'auto'),
      speedSize:   await DB.getSetting('speedSize', 'large'),
      country:     await DB.getSetting('country', 'FR'),
      autoCountry: await DB.getSetting('autoCountry', true),
      unit:        await DB.getSetting('unit', 'auto'),
      alertOver:   await DB.getSetting('alertOver', true),
      tolerance:   await DB.getSetting('tolerance', 5),
      vibrate:     await DB.getSetting('vibrate', true),
      sound:       await DB.getSetting('sound', false),
      wakeLock:    await DB.getSetting('wakeLock', true),
      fullscreen:  await DB.getSetting('fullscreen', false),
    };
  }

  _bind() {
    const o = this.overlay;
    o.querySelector('#s-close').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });

    const save = async (key, value) => {
      await DB.setSetting(key, value);
      if (this.onChange) this.onChange(key, value);
    };

    o.querySelector('#s-theme').onchange       = e => save('theme', e.target.value);
    o.querySelector('#s-size').onchange        = e => save('speedSize', e.target.value);
    o.querySelector('#s-country').onchange     = e => save('country', e.target.value);
    o.querySelector('#s-auto-country').onchange = e => save('autoCountry', e.target.checked);
    o.querySelector('#s-unit').onchange        = e => save('unit', e.target.value);
    o.querySelector('#s-alert-over').onchange  = e => save('alertOver', e.target.checked);
    o.querySelector('#s-tolerance').onchange   = e => save('tolerance', parseInt(e.target.value) || 0);
    o.querySelector('#s-vibrate').onchange     = e => save('vibrate', e.target.checked);
    o.querySelector('#s-sound').onchange       = e => save('sound', e.target.checked);
    o.querySelector('#s-wakelock').onchange    = e => save('wakeLock', e.target.checked);
    o.querySelector('#s-fullscreen').onchange  = e => save('fullscreen', e.target.checked);

    o.querySelector('#s-export').onclick = () => this._export();
    o.querySelector('#s-import').onclick = () => o.querySelector('#s-import-file').click();
    o.querySelector('#s-import-file').onchange = e => this._import(e.target.files[0]);
    o.querySelector('#s-reset').onclick = () => this._reset();
  }

  async _export() {
    const profiles = await DB.getAllProfiles();
    const settings = await this._loadSettings();
    const payload = {
      app: 'AffiVi',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles,
      settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affivi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _import(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.app !== 'AffiVi' || !Array.isArray(data.profiles)) throw new Error('Fichier invalide');
      if (!confirm(`Importer ${data.profiles.length} véhicule(s) ? Les véhicules portant le même identifiant seront remplacés.`)) return;
      for (const p of data.profiles) await DB.putProfile(p);
      if (data.settings) {
        for (const [k, v] of Object.entries(data.settings)) await DB.setSetting(k, v);
      }
      alert('✅ Import terminé. L\'application va redémarrer.');
      location.reload();
    } catch (err) {
      alert('❌ Impossible de lire le fichier : ' + err.message);
    }
  }

  async _reset() {
    if (!confirm('⚠️ Supprimer TOUTES les données (véhicules, calibrations, réglages) ?\n\nCette action est irréversible.')) return;
    if (!confirm('Vraiment sûr ? Dernière chance.')) return;
    indexedDB.deleteDatabase('affivi');
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    alert('✅ Application réinitialisée.');
    location.reload();
  }

  close() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    if (this.onClose) this.onClose();
  }
}
