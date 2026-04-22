import { DB } from './db.js';
import { COUNTRIES_2026, getLimitsFor, roadFromSpeed } from './countries.js';

export class DriveUI {
  constructor() {
    this.speedEl = document.getElementById('speed-value');
    this.unitEl = document.getElementById('speed-unit');
    this.gpsInd = document.getElementById('gps-indicator');
    this.nameEl = document.getElementById('profile-name-display');
    this.flagEl = document.getElementById('country-flag');
    this.limitEl = document.getElementById('current-limit');
    this.cursorEl = document.getElementById('legal-cursor');
    this.safetyEl = document.getElementById('safety-indicator');
    this.roadBtns = document.querySelectorAll('.road-btn');

    // État
    this.profile = null;
    this.country = 'FR';
    this.overrides = {};
    this.margin = 0;
    this.unit = 'kmh';
    this.roadType = 'auto';
    this.currentSpeedKmh = 0;

    // Hystérésis barre légale
    this.pendingState = null;
    this.pendingSince = 0;
    this.legalState = 'ok';

    this.roadBtns.forEach(b => b.addEventListener('click', () => this.setRoad(b.dataset.road)));
  }

  async loadSettings() {
    const activeId = await DB.getSetting('activeProfileId', 'standard');
    this.profile = await DB.getProfile(activeId) || await DB.getProfile('standard');
    this.country = await DB.getSetting('activeCountry', 'FR');
    this.overrides = await DB.getSetting('countryOverrides', {});
    this.margin = await DB.getSetting('safetyMargin', 0);
    this.unit = await DB.getSetting('unit', 'kmh');
    this.roadType = await DB.getSetting('roadType', 'auto');
    this._refreshStatic();
  }

  _refreshStatic() {
    this.nameEl.textContent = this.profile?.name || 'Standard';
    const c = COUNTRIES_2026[this.country];
    this.flagEl.textContent = c?.flag || '🏳️';
    this.unitEl.textContent = this.unit === 'mph' ? 'mph' : 'km/h';
    this.roadBtns.forEach(b => b.classList.toggle('active', b.dataset.road === this.roadType));
    if (this.margin > 0) {
      this.safetyEl.textContent = `− ${this.margin} km/h`;
      this.safetyEl.classList.remove('hidden');
    } else {
      this.safetyEl.classList.add('hidden');
    }
    this._updateDisplay();
  }

  setRoad(r) {
    this.roadType = r;
    DB.setSetting('roadType', r);
    this.roadBtns.forEach(b => b.classList.toggle('active', b.dataset.road === r));
    this._updateDisplay();
  }

  onGpsUpdate(data) {
    if (data.statusChange) {
      this.gpsInd.classList.remove('ok', 'weak', 'lost');
      this.gpsInd.classList.add(data.statusChange);
      return;
    }
    this.currentSpeedKmh = data.speedKmh || 0;
    this._updateDisplay();
  }

  _updateDisplay() {
    const coef = this.profile?.coefficient ?? 1;
    let corrected = this.currentSpeedKmh * coef;
    let displayed = Math.max(0, corrected - this.margin);
    let shown = displayed;
    if (this.unit === 'mph') shown = displayed * 0.621371;
    this.speedEl.textContent = Math.round(shown);

    // Limite courante
    const limits = getLimitsFor(this.country, this.overrides);
    if (!limits) return;
    const road = this.roadType === 'auto' ? roadFromSpeed(displayed) : this.roadType;
    const limit = limits[road];
    if (limit == null) {
      this.limitEl.textContent = '∞';
      this.cursorEl.style.left = '30%';
      return;
    }
    let limShown = this.unit === 'mph' ? Math.round(limit * 0.621371) : limit;
    this.limitEl.textContent = limShown;

    // Position curseur (0..150% de la limite mappé sur 0..100%)
    const ratio = Math.min(1.5, displayed / limit) / 1.5;
    this.cursorEl.style.left = `${ratio * 100}%`;

    this._updateLegalState(displayed, limit);
  }

  _updateLegalState(speed, limit) {
    const delta = speed - limit;
    let theoretical = 'ok';
    if (delta > 5) theoretical = 'over';
    else if (delta > -5) theoretical = 'near';

    const now = Date.now();
    if (theoretical !== this.legalState) {
      if (this.pendingState !== theoretical) {
        this.pendingState = theoretical;
        this.pendingSince = now;
      } else if (now - this.pendingSince > 3000 && Math.abs(delta) > 7) {
        this.legalState = theoretical;
      }
    } else {
      this.pendingState = null;
    }
  }
}
