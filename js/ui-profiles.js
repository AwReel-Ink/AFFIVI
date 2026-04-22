import { DB } from './db.js';

export class ProfilesUI {
  constructor(overlay, onChange) {
    this.overlay = overlay;
    this.onChange = onChange;
  }

  async open() {
    const profiles = await DB.getAllProfiles();
    const activeId = await DB.getSetting('activeProfileId', 'standard');
    this.overlay.innerHTML = `
      <header class="overlay-header">
        <button class="back-btn" id="p-back">←</button>
        <h2>Mes véhicules</h2>
      </header>
      <div class="overlay-body">
        <div class="profile-list" id="p-list"></div>
        <button class="btn-primary" id="p-add">+ Ajouter un véhicule</button>
      </div>
    `;
    this.overlay.classList.remove('hidden');
    requestAnimationFrame(() => this.overlay.classList.add('visible'));

    const list = this.overlay.querySelector('#p-list');
    profiles.forEach(p => list.appendChild(this._renderItem(p, activeId)));

    new Sortable(list, {
      handle: '.profile-handle',
      animation: 150,
      onEnd: async () => {
        const ids = [...list.querySelectorAll('.profile-item')].map(el => el.dataset.id);
        await DB.reorderProfiles(ids);
      }
    });

    this.overlay.querySelector('#p-back').onclick = () => this.close();
    this.overlay.querySelector('#p-add').onclick = () => this._addProfile();
  }

  close() {
    this.overlay.classList.remove('visible');
    setTimeout(() => this.overlay.classList.add('hidden'), 300);
  }

  _renderItem(p, activeId) {
    const el = document.createElement('div');
    el.className = 'profile-item' + (p.id === activeId ? ' active' : '');
    el.dataset.id = p.id;
    el.innerHTML = `
      <span class="profile-handle">☰</span>
      <div class="profile-main">
        <div class="profile-name">${escapeHtml(p.name)}</div>
        <div class="profile-meta">
          <span class="calib-badge ${p.calibrated ? 'ok' : 'no'}">${p.calibrated ? '✓ calibré' : 'non calibré'}</span>
          <span>× ${p.coefficient.toFixed(3)}</span>
        </div>
      </div>
      <div class="profile-actions">
        <button class="act-calib" title="Calibrer">📏</button>
        <button class="act-rename" title="Renommer">✏️</button>
        <button class="act-del" title="Supprimer" ${p.isDefault ? 'disabled' : ''}>🗑️</button>
      </div>
    `;
    el.querySelector('.profile-main').onclick = async () => {
      await DB.setSetting('activeProfileId', p.id);
      this.onChange?.();
      this.open();
    };
    el.querySelector('.act-rename').onclick = (e) => { e.stopPropagation(); this._rename(p); };
    el.querySelector('.act-del').onclick = (e) => { e.stopPropagation(); this._delete(p); };
    el.querySelector('.act-calib').onclick = (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('affivi:calibrate', { detail: { profileId: p.id }}));
    };
    return el;
  }

  async _addProfile() {
    const name = await prompt2('Nouveau véhicule', 'Nom du véhicule (ex. Clio, Golf…)');
    if (!name) return;
    const profiles = await DB.getAllProfiles();
    const maxOrder = profiles.reduce((m, p) => Math.max(m, p.order ?? 0), 0);
    await DB.saveProfile({
      id: 'p_' + Date.now(),
      name: name.trim(),
      coefficient: 1.0,
      isDefault: false,
      calibrated: false,
      samples: [],
      order: maxOrder + 1,
      createdAt: Date.now()
    });
    this.open();
  }

  async _rename(p) {
    const name = await prompt2('Renommer', 'Nouveau nom', p.name);
    if (!name) return;
    p.name = name.trim();
    await DB.saveProfile(p);
    this.onChange?.();
    this.open();
  }

  async _delete(p) {
    if (p.isDefault) return;
    const ok = await confirm2('Supprimer', `Supprimer le véhicule « ${p.name} » ?`);
    if (!ok) return;
    await DB.deleteProfile(p.id);
    const activeId = await DB.getSetting('activeProfileId', 'standard');
    if (activeId === p.id) await DB.setSetting('activeProfileId', 'standard');
    this.onChange?.();
    this.open();
  }
}

// Petits modals universels
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

export function prompt2(title, desc, initial = '') {
  return new Promise(res => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(desc)}</p>
        <input type="text" value="${escapeHtml(initial)}">
        <div class="modal-actions">
          <button class="cancel">Annuler</button>
          <button class="ok">OK</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const input = bd.querySelector('input');
    input.focus();
    input.select();
    const done = v => { document.body.removeChild(bd); res(v); };
    bd.querySelector('.cancel').onclick = () => done(null);
    bd.querySelector('.ok').onclick = () => done(input.value.trim() || null);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(input.value.trim() || null); });
  });
}
export function confirm2(title, desc) {
  return new Promise(res => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(desc)}</p>
        <div class="modal-actions">
          <button class="cancel">Annuler</button>
          <button class="ok">Confirmer</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const done = v => { document.body.removeChild(bd); res(v); };
    bd.querySelector('.cancel').onclick = () => done(false);
    bd.querySelector('.ok').onclick = () => done(true);
  });
}
