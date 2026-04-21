/**
 * gps.js — AffiVi
 * Gestion du GPS : watchPosition, conversion m/s → km/h,
 * lissage sur 3 mesures, état du signal.
 */

// ─── Constantes ──────────────────────────────────────────────────────────────
const SMOOTHING_WINDOW = 3;    // Nombre de mesures pour le lissage
const SPEED_ZERO_THRESHOLD = 1; // m/s — en dessous : afficher 0

// ─── État interne du module ───────────────────────────────────────────────────
let _watchId         = null;
let _speedSamples    = [];     // tableau des dernières vitesses brutes en km/h
let _accuracy        = null;   // précision horizontale en mètres
let _lastTimestamp   = null;
let _onSpeedUpdate   = null;   // callback(speedKmh: number, signal: string)
let _onError         = null;   // callback(error: GeolocationPositionError)

/**
 * Signal GPS calculé selon la précision et la fraîcheur des données.
 * @returns {'good'|'weak'|'lost'|'unknown'}
 */
export function getSignalState() {
  if (_accuracy === null) return 'unknown';
  if (_accuracy <= 15)    return 'good';
  if (_accuracy <= 50)    return 'weak';
  return 'lost';
}

/**
 * Démarre le suivi GPS.
 * @param {function} onUpdate - Appelé à chaque mise à jour : (speedKmh, signalState)
 * @param {function} [onError] - Appelé en cas d'erreur GPS
 */
export function startGPS(onUpdate, onError = null) {
  if (!('geolocation' in navigator)) {
    console.warn('[GPS] Géolocalisation non disponible sur cet appareil.');
    onError?.({ code: 0, message: 'Géolocalisation non disponible' });
    return;
  }

  _onSpeedUpdate = onUpdate;
  _onError       = onError;
  _speedSamples  = [];
  _accuracy      = null;

  _watchId = navigator.geolocation.watchPosition(
    _handlePosition,
    _handleError,
    {
      enableHighAccuracy: true,  // GPS matériel, pas seulement Wi-Fi/réseau
      maximumAge:         1000,  // Accepter des positions vieilles de 1 s max
      timeout:            10000, // Délai d'attente max pour une position
    }
  );

  console.log('[GPS] Démarrage watchPosition, ID :', _watchId);
}

/**
 * Arrête le suivi GPS.
 */
export function stopGPS() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    console.log('[GPS] Arrêt watchPosition, ID :', _watchId);
    _watchId = null;
  }
  _speedSamples = [];
  _accuracy     = null;
  _lastTimestamp = null;
}

/**
 * Retourne la dernière vitesse lissée en km/h (0 si aucune donnée).
 */
export function getLastSpeedKmh() {
  return _computeSmoothedSpeed();
}

// ─── Handlers internes ───────────────────────────────────────────────────────

function _handlePosition(position) {
  const { coords, timestamp } = position;
  _accuracy      = coords.accuracy;
  _lastTimestamp = timestamp;

  // Vitesse brute en m/s (peut être null sur certains appareils)
  const rawSpeedMs = coords.speed;

  let speedKmh;
  if (rawSpeedMs === null || rawSpeedMs === undefined || rawSpeedMs < SPEED_ZERO_THRESHOLD) {
    // Vitesse nulle ou non disponible → 0
    speedKmh = 0;
  } else {
    // Conversion m/s → km/h
    speedKmh = rawSpeedMs * 3.6;
  }

  // Lissage : maintien d'un tableau glissant
  _speedSamples.push(speedKmh);
  if (_speedSamples.length > SMOOTHING_WINDOW) {
    _speedSamples.shift();
  }

  const smoothed = _computeSmoothedSpeed();
  const signal   = getSignalState();

  _onSpeedUpdate?.(smoothed, signal);
}

function _handleError(error) {
  console.error('[GPS] Erreur :', error.code, error.message);
  _accuracy = null;

  // Informer l'UI que le signal est perdu
  _onSpeedUpdate?.(0, 'lost');
  _onError?.(error);
}

/**
 * Calcule la moyenne des vitesses dans le buffer de lissage.
 * @returns {number} Vitesse lissée en km/h
 */
function _computeSmoothedSpeed() {
  if (_speedSamples.length === 0) return 0;
  const sum = _speedSamples.reduce((acc, v) => acc + v, 0);
  return sum / _speedSamples.length;
}
