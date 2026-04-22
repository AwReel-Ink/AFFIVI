/* ===================================================================
   AFFIVI — Point d'entrée applicatif
   Version 1.0.0
   Copyright © 2026 LEROY Aurélien — Tous droits réservés.
   -------------------------------------------------------------------
   Orchestration générale de l'application :
   - Initialisation IndexedDB
   - Chargement des réglages
   - Gestion du profil actif
   - Branchement GPS + WakeLock
   - Ouverture des différents écrans (Drive, Profils, Réglages, Pays)
   =================================================================== */

import { DB }            from './db.js';
import { GPS }           from './gps.js';
import { WakeLockMgr }   from './wake-lock.js';
import { COUNTRIES, getCountry } from './countries.js';
import { DriveUI }       from './ui-drive.js';
import { ProfilesUI }    from './ui-profiles.js';
import { CalibrationUI } from './ui-calibration.js';
import { CountryUI }     from './ui-country.js';
import { SettingsUI }    from './ui-settings.js';

/* -------------------------------------------------------------------
   État applicatif global (simple singleton)
   ------------------------------------------------------------------- */
const App = {
  settings: null,
  profile:  null,           // véhicule actif
  country:  null,           // code pays courant (ex: 'FR')
  gps:      new GPS(),
  wakeLock: new WakeLockMgr(),
  drive:    null,           // instance DriveUI
};

/* ===================================================================
   1. DÉMARRAGE
   =================================================================== */
window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await DB.open();
    await loadSettings();
    await loadActiveProfile();
    applyTheme(App.settings.theme);
    applySpeedSize(App.settings.speedSize);
    bindGlobalUI();
    registerServiceWorker();

    // Si un profil est actif → on lance l'écran de conduite
    // Sinon → on ouvre la sélection de véhicule
    if (App.profile) {
      startDrive();
    } else {
      openProfiles(true);
    }
  } catch (err) {
    console.error('[AffiVi] Erreur initialisation :', err);
    showFatalError(err);
  }
}

/* ===================================================================
   2. CHARGEMENT DES RÉGLAGES
   =================================================================== */
async function loadSettings() {
  App.settings = {
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
  App.country = App.settings.country;
}

/* ===================================================================
   3. CHARGEMENT DU PROFIL ACTIF
   =================================================================== */
async function loadActiveProfile() {
  const activeId = await DB.getSetting('activeProfileId', null);
  if (!activeId) { App.profile = null; return; }
  const all = await DB.getAllProfiles();
  App.profile = all.find(p => p.id === activeId) || null;
}

async function setActiveProfile(profile) {
  App.profile = profile;
  await DB.setSetting('activeProfileId', profile ? profile.id : null);
}

/* ===================================================================
   4. ÉCRAN DE CONDUITE
   =================================================================== */
async function startDrive() {
  if (!App.profile) { openProfiles(true); return; }

  // WakeLock si activé
  if (App.settings.wakeLock) App.wakeLock.request();

  // Plein écran si demandé
  if (App.settings.fullscreen && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  // Instanciation de l'UI de conduite
  App.drive = new DriveUI({
    profile:  App.profile,
    settings: App.settings,
    country:  getCountry(App.country),
    gps:      App.gps,
  });
  App.drive.mount(document.getElementById('app'));

  // Démarrage GPS
  App.gps.start(err => {
    console.warn('[GPS] Erreur :', err);
    if (App.drive) App.drive.showGPSError(err);
  });
}

function stopDrive() {
  if (App.drive) { App.drive.unmount(); App.drive = null; }
  App.gps.stop();
  App.wakeLock.release();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/* ===================================================================
   5. OUVERTURE DES ÉCRANS SECONDAIRES
   =================================================================== */
function openProfiles(forceChoice = false) {
  const ui = new ProfilesUI({
    currentId: App.profile ? App.profile.id : null,
    forceChoice,
    onSelect: async (profile) => {
      await setActiveProfile(profile);
      stopDrive();
      startDrive();
    },
    onCalibrate: (profile) => openCalibration(profile),
  });
  ui.open();
}

function openCalibration(profile) {
  const ui = new CalibrationUI({
    profile,
    onDone: async (updated) => {
      if (App.profile && App.profile.id === updated.id) {
        App.profile = updated;
        if (App.drive) App.drive.updateProfile(updated);
      }
    },
  });
  ui.open();
}

function openCountry() {
  const ui = new CountryUI({
    current: App.country,
    onSelect: async (code) => {
      App.country = code;
      await DB.setSetting('country', code);
      App.settings.country = code;
      if (App.drive) App.drive.updateCountry(getCountry(code));
    },
  });
  ui.open();
}

function openSettings() {
  const ui = new SettingsUI({
    onChange: (key, value) => handleSettingChange(key, value),
  });
  ui.open();
}

/* ===================================================================
   6. APPLICATION DES RÉGLAGES À CHAUD
   =================================================================== */
function handleSettingChange(key, value) {
  App.settings[key] = value;

  switch (key) {
    case 'theme':
      applyTheme(value);
      break;
    case 'speedSize':
      applySpeedSize(value);
      break;
    case 'wakeLock':
      value ? App.wakeLock.request() : App.wakeLock.release();
      break;
    case 'country':
      App.country = value;
      if (App.drive) App.drive.updateCountry(getCountry(value));
      break;
    case 'unit':
    case 'autoCountry':
    case 'alertOver':
    case 'tolerance':
    case 'vibrate':
    case 'sound':
      if (App.drive) App.drive.updateSettings(App.settings);
      break;
    case 'fullscreen':
      if (value && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      break;
  }
}

/* ===================================================================
   7. APPARENCE : THÈME & TAILLE VITESSE
   =================================================================== */
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light', 'theme-night');

  let effective = theme;
  if (theme === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  root.classList.add(`theme-${effective}`);
}

function applySpeedSize(size) {
  const root = document.documentElement;
  root.classList.remove('speed-normal', 'speed-large', 'speed-xl');
  root.classList.add(`speed-${size}`);
}

/* ===================================================================
   8. BOUTONS DE LA BARRE D'OUTILS
   =================================================================== */
function bindGlobalUI() {
  const $ = (id) => document.getElementById(id);

  $('open-profiles')?.addEventListener('click', () => openProfiles(false));
  $('open-country') ?.addEventListener('click', () => openCountry());
  $('open-settings')?.addEventListener('click', () => openSettings());

  // Ré-application du thème auto si changement système
  window.matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      if (App.settings.theme === 'auto') applyTheme('auto');
    });

  // Reprise WakeLock au retour de l'onglet
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && App.settings.wakeLock) {
      App.wakeLock.request();
    }
  });
}

/* ===================================================================
   9. SERVICE WORKER (PWA hors-ligne)
   =================================================================== */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('[SW] Enregistrement impossible :', err);
  });
}

/* ===================================================================
   10. ERREUR FATALE
   =================================================================== */
function showFatalError(err) {
  document.body.innerHTML = `
    <div style="padding:30px;font-family:sans-serif;color:#fff;background:#c62828;min-height:100vh;">
      <h1>⚠️ Erreur au démarrage</h1>
      <p>${(err && err.message) || err}</p>
      <button onclick="location.reload()"
              style="margin-top:20px;padding:12px 20px;font-size:1rem;border:none;border-radius:8px;cursor:pointer;">
        Recharger
      </button>
    </div>
  `;
}

/* -------------------------------------------------------------------
   Exposition pour debug console (optionnel)
   ------------------------------------------------------------------- */
window.__AFFIVI__ = App;
