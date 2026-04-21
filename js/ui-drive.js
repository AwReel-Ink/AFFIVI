/**
 * ui-drive.js — AffiVi
 * Gestion de l'écran de conduite principal.
 * Étape 1 : affichage vitesse brute + état GPS + sélecteur type de route.
 * (Coefficients et barre légale seront branchés aux étapes 2 et 4.)
 */

import { startGPS, stopGPS } from './gps.js';
import { requestWakeLock }   from './wake-lock.js';

// ─── État local de l'écran de conduite ───────────────────────────────────────
const state = {
  currentSpeed:    0,       // km/h, après lissage
  signalState:     'unknown',
  roadType:        'auto',  // 'auto' | 'city' | 'road' | 'expressway' | 'highway'
  // Étapes suivantes : coefficient, safetyMargin, activeCountry, limit...
};

// ─── Références DOM ───────────────────────────────────────────────────────────
let _elSpeedValue;
let _elSpeedUnit;
let _elGpsIcon;
let _elGpsLabel;
let _elGpsStatus;
let _elRoadTypeBtns;
let _elSafetyIndicator;
let _elLegalBar;
let _elLegalLimitText;
let _elCountryFlag;
let _initialized = false;

/**
 * Initialise l'écran de conduite.
 * Doit être appelé une seule fois depuis app.js.
 */
export function initDriveScreen() {
  if (_initialized) return;
  _initialized = true;

  // Récupération des éléments DOM
  _elSpeedValue       = document.getElementById('speed-value');
  _elSpeedUnit        = document.getElementById('speed-unit');
  _elGpsIcon          = document.getElementById('gps-icon');
  _elGpsLabel         = document.getElementById('gps-label');
  _elGpsStatus        = document.querySelector('.gps-status');
  _elRoadTypeBtns     = document.querySelectorAll('.road-type-btn');
  _elSafetyIndicator  = document.getElementById('safety-margin-indicator');
  _elLegalBar         = document.getElementById('legal-bar');
  _elLegalLimitText   = document.getElementById('legal-limit-text');
  _elCountryFlag      = document.getElementById('country-flag');

  // Sélecteur de type de route
  _elRoadTypeBtns.forEach((btn) => {
    btn.addEventListener('click', _handleRoadTypeClick);
  });

  // Démarrer le GPS
  startGPS(_handleGPSUpdate, _handleGPSError);

  // Activer le Wake Lock
  requestWakeLock();

  console.log('[UI-Drive] Écran de conduite initialisé.');
}

/**
 * Met à jour le badge de profil dans le bandeau.
 * Appelé depuis app.js quand le profil actif change.
 * @param {string} name — nom du véhicule
 */
export function updateProfileBadge(name) {
  const el = document.getElementById('profile-badge-name');
  if (el) el.textContent = name;
}

/**
 * Met à jour la vitesse affichée.
 * À l'étape 1 : vitesse brute GPS.
 * Aux étapes suivantes : vitesse corrigée par coefficient + marge.
 * @param {number} speedKmh
 */
export function setDisplaySpeed(speedKmh) {
  state.currentSpeed = speedKmh;
  _renderSpeed();
}

// ─── Handlers GPS ─────────────────────────────────────────────────────────────

function _handleGPSUpdate(speedKmh, signalState) {
  state.currentSpeed = speedKmh;
  state.signalState  = signalState;

  _renderSpeed();
  _renderGPSStatus(signalState);
}

function _handleGPSError(error) {
  state.signalState = 'lost';
  _renderGPSStatus('lost');

  const messages = {
    1: 'Autorisation GPS refusée. Vérifiez les permissions.',
    2: 'Signal GPS indisponible.',
    3: 'Délai GPS dépassé.',
    0: 'GPS non disponible sur cet appareil.',
  };
  console.warn('[UI-Drive] Erreur GPS :', messages[error.code] || error.message);
}

// ─── Rendu ────────────────────────────────────────────────────────────────────

function _renderSpeed() {
  if (!_elSpeedValue) return;

  const speed = Math.max(0, Math.round(state.currentSpeed));
  _elSpeedValue.textContent = speed > 0 ? speed : '--';
  _elSpeedValue.setAttribute('aria-label', `${speed} kilomètres par heure`);
}

function _renderGPSStatus(signalState) {
  if (!_elGpsStatus) return;

  // Retirer toutes les classes d'état
  _elGpsStatus.classList.remove(
    'gps-status--good',
    'gps-status--weak',
    'gps-status--lost',
    'gps-status--unknown'
  );

  const config = {
    good:    { class: 'gps-status--good',    label: 'GPS OK',     title: 'Signal GPS bon' },
    weak:    { class: 'gps-status--weak',    label: 'GPS faible', title: 'Signal GPS faible' },
    lost:    { class: 'gps-status--lost',    label: 'GPS perdu',  title: 'Signal GPS perdu' },
    unknown: { class: 'gps-status--unknown', label: 'GPS',        title: 'Signal GPS inconnu' },
  };

  const cfg = config[signalState] ?? config.unknown;
  _elGpsStatus.classList.add(cfg.class);
  _elGpsLabel.textContent = cfg.label;
  _elGpsStatus.setAttribute('aria-label', cfg.title);
}

// ─── Sélecteur de type de route ───────────────────────────────────────────────

function _handleRoadTypeClick(event) {
  const btn      = event.currentTarget;
  const roadType = btn.dataset.road;

  state.roadType = roadType;

  // Mise à jour de l'état actif des boutons
  _elRoadTypeBtns.forEach((b) => {
    const isActive = b.dataset.road === roadType;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', String(isActive));
  });

  console.log('[UI-Drive] Type de route sélectionné :', roadType);
  // Étape 4 : this will trigger limit recalculation
}

/**
 * Retourne le type de route actif.
 * @returns {string}
 */
export function getActiveRoadType() {
  return state.roadType;
}

/**
 * Définit le type de route depuis l'extérieur (ex: mode auto).
 * @param {string} roadType
 */
export function setRoadType(roadType) {
  _handleRoadTypeClick({ currentTarget: document.querySelector(`[data-road="${roadType}"]`) });
}
