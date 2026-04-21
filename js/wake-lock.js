/**
 * wake-lock.js — AffiVi
 * Maintien de l'écran allumé via Wake Lock API.
 * Gère automatiquement la re-acquisition après interruption
 * (appel entrant, passage en arrière-plan, etc.)
 */

let _wakeLock = null;
let _active   = false;

/**
 * Demande le Wake Lock pour maintenir l'écran allumé.
 * Ne lance pas d'erreur si l'API n'est pas disponible.
 */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    console.warn('[WakeLock] API non disponible sur cet appareil.');
    return;
  }

  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _active   = true;
    console.log('[WakeLock] Écran maintenu allumé.');

    // Écouter la libération automatique (ex: app mise en arrière-plan)
    _wakeLock.addEventListener('release', _handleRelease);

  } catch (err) {
    // Peut arriver si batterie faible ou permissions refusées
    console.warn('[WakeLock] Impossible d\'activer :', err.name, err.message);
    _active = false;
  }
}

/**
 * Libère le Wake Lock.
 */
export async function releaseWakeLock() {
  if (_wakeLock) {
    try {
      await _wakeLock.release();
      console.log('[WakeLock] Libéré manuellement.');
    } catch (err) {
      console.warn('[WakeLock] Erreur lors de la libération :', err);
    }
    _wakeLock = null;
  }
  _active = false;
}

/**
 * @returns {boolean} true si le Wake Lock est actif
 */
export function isWakeLockActive() {
  return _active;
}

// ─── Gestion de la visibilité de la page ─────────────────────────────────────
// Quand l'utilisateur revient sur l'app après l'avoir mise en arrière-plan,
// on re-demande le Wake Lock automatiquement.

function _handleRelease() {
  console.log('[WakeLock] Libéré par le système.');
  _active   = false;
  _wakeLock = null;
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    // L'app est à nouveau au premier plan — re-acquérir
    if (!_active) {
      console.log('[WakeLock] Retour au premier plan — re-acquisition...');
      await requestWakeLock();
    }
  } else {
    // L'app passe en arrière-plan — le système libère automatiquement,
    // mais on note l'état pour la re-acquisition
    _active = false;
  }
});
