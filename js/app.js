/**
 * app.js — AffiVi
 * Point d'entrée et orchestrateur général.
 * Étape 1 : initialisation PWA, GPS, Wake Lock, écran de conduite.
 */

import { initDriveScreen, updateProfileBadge } from './ui-drive.js';

// ─── Enregistrement du Service Worker ────────────────────────────────────────
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[App] Service Worker non supporté.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });
    console.log('[App] Service Worker enregistré, scope :', registration.scope);

    // Écouter les mises à jour du SW
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[App] Nouvelle version disponible.');
          showToast('Mise à jour disponible. Rechargez l\'app.', 5000);
        }
      });
    });

  } catch (err) {
    console.error('[App] Échec enregistrement Service Worker :', err);
  }
}

// ─── Toast de notification ────────────────────────────────────────────────────
let _toastTimer = null;

/**
 * Affiche un message temporaire en bas d'écran.
 * @param {string} message
 * @param {number} [duration=3000] — durée en ms
 */
export function showToast(message, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('visible');

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, duration);
}

// ─── Navigation entre écrans ──────────────────────────────────────────────────
// Étape 1 : seul l'écran de conduite est affiché.
// Les écrans secondaires seront gérés aux étapes 2-5.

let _overlay = null;

function _createOverlay() {
  _overlay = document.createElement('div');
  _overlay.className = 'overlay';
  _overlay.id        = 'overlay';
  document.body.appendChild(_overlay);
  _overlay.addEventListener('click', hideAllSecondaryScreens);
}

/**
 * Affiche un écran secondaire (slide depuis la droite).
 * @param {string} screenId — ID de l'élément DOM
 */
export function showScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) {
    console.warn(`[App] Écran introuvable : ${screenId}`);
    return;
  }

  screen.hidden = false;
  // Forcer un reflow pour que la transition fonctionne
  screen.getBoundingClientRect();
  screen.classList.add('slide-in');

  if (_overlay) {
    _overlay.classList.add('visible');
  }
}

/**
 * Masque un écran secondaire.
 * @param {string} screenId
 */
export function hideScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  screen.classList.remove('slide-in');

  // Attendre la fin de la transition avant de masquer
  const handleTransitionEnd = () => {
    screen.hidden = true;
    screen.removeEventListener('transitionend', handleTransitionEnd);
  };
  screen.addEventListener('transitionend', handleTransitionEnd);

  // Masquer l'overlay si aucun écran n'est visible
  const anyVisible = document.querySelectorAll('.slide-screen.slide-in').length > 0;
  if (!anyVisible && _overlay) {
    _overlay.classList.remove('visible');
  }
}

/**
 * Masque tous les écrans secondaires.
 */
export function hideAllSecondaryScreens() {
  document.querySelectorAll('.slide-screen.slide-in').forEach((screen) => {
    hideScreen(screen.id);
  });
}

// ─── Gestion du profil actif (placeholder étape 1) ───────────────────────────
// À l'étape 2, cette logique sera remplacée par db.js + ui-profiles.js

function _initPlaceholderProfile() {
  updateProfileBadge('Standard');
}

// ─── Boutons du bandeau (wiring) ──────────────────────────────────────────────
function _wireTopbarButtons() {
  const btnProfile  = document.getElementById('btn-profile-badge');
  const btnSettings = document.getElementById('btn-settings');

  btnProfile?.addEventListener('click', () => {
    // Étape 2 : ouvrira ui-profiles
    showToast('Gestion des véhicules disponible à l\'étape 2.');
  });

  btnSettings?.addEventListener('click', () => {
    // Étape 5 : ouvrira ui-settings
    showToast('Réglages disponibles à l\'étape 5.');
  });
}

// ─── Initialisation principale ────────────────────────────────────────────────
async function init() {
  console.log('[App] AffiVi — démarrage...');

  // 1. Thème sombre par défaut
  document.body.setAttribute('data-theme', 'dark');

  // 2. Overlay de navigation
  _createOverlay();

  // 3. Service Worker
  await registerServiceWorker();

  // 4. Profil placeholder
  _initPlaceholderProfile();

  // 5. Wiring boutons du bandeau
  _wireTopbarButtons();

  // 6. Écran de conduite (GPS + Wake Lock démarrés ici)
  initDriveScreen();

  console.log('[App] Initialisation terminée.');
}

// Lancer l'app quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
