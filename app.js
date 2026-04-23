/* ═══════════════════════════════════════════
   AFFIVI — AFFIchage VItesse
   Version 1.2
   app.js
   © 2026 LEROY Aurélien — Tous droits réservés
═══════════════════════════════════════════ */

'use strict';

// ── PWA Service Worker ───────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ── DOM ──────────────────────────────────────
const DOM = {
  body:          document.getElementById('app-body'),
  metaTheme:     document.getElementById('meta-theme'),
  speedValue:    document.getElementById('speed-value'),
  startBtn:      document.getElementById('start-btn'),
  limitNumber:   document.getElementById('limit-number'),
  limitRing:     document.getElementById('limit-ring'),
  limitLabel:    document.getElementById('limit-label'),
  roadType:      document.getElementById('road-type'),
  signalBars:    document.getElementById('signal-bars'),
  signalLabel:   document.getElementById('signal-label'),
  lagBlock:      document.getElementById('lag-block'),
  lagValue:      document.getElementById('lag-value'),
  lagIcon:       document.getElementById('lag-icon'),
  settingsBtn:   document.getElementById('settings-btn'),
  settingsPanel: document.getElementById('settings-panel'),
  closeBtn:      document.getElementById('close-btn'),
  overlay:       document.getElementById('overlay'),
  themeGrid:     document.getElementById('theme-grid'),
  lagOptions:    document.getElementById('lag-options'),
  modeBtn:       document.getElementById('mode-btn'),
  modeLabel:     document.getElementById('mode-label'), // ← nouveau
};

// ── État ─────────────────────────────────────
const STATE = {
  gpsActive:      false,
  watchId:        null,
  currentSpeed:   0,
  speedLimit:     null,
  currentTheme:   'dark',
  lagThreshold:   3,
  lastUpdateTime: null,
  lagInterval:    null,
  wakeLock:       null,
  travelMode:     'car',
};

// ══════════════════════════════════════════════
//  FILTRE DE KALMAN SIMPLIFIÉ
//  Lisse la vitesse GPS brute pour éviter les
//  sauts / instabilités liées au signal.
// ══════════════════════════════════════════════
const KALMAN = {
  // Variance du bruit de mesure GPS (plus élevé = on fait moins confiance au GPS)
  R: 4,
  // Variance du bruit de processus (plus élevé = on suit plus vite les vraies variations)
  Q: 1,
  // État interne
  _estimate:  0,   // vitesse estimée
  _errorCov:  1,   // covariance d'erreur
  _init:      false,

  reset() {
    this._estimate = 0;
    this._errorCov = 1;
    this._init     = false;
  },

  filter(measurement) {
    // Première mesure : initialisation directe
    if (!this._init) {
      this._estimate = measurement;
      this._init     = true;
      return measurement;
    }

    // ── Prédiction ──────────────────────────
    // On suppose vitesse quasi-constante entre 2 ticks
    const predictedEstimate = this._estimate;
    const predictedErrorCov = this._errorCov + this.Q;

    // ── Mise à jour (correction) ─────────────
    // Gain de Kalman : quel poids donner à la mesure vs la prédiction
    const K = predictedErrorCov / (predictedErrorCov + this.R);

    this._estimate  = predictedEstimate + K * (measurement - predictedEstimate);
    this._errorCov  = (1 - K) * predictedErrorCov;

    return Math.max(0, this._estimate);
  },
};

// ── Limites légales FR — Mode Voiture ─────────
const DEFAULT_LIMITS_CAR = {
  motorway:       130,
  motorway_link:  110,
  trunk:          110,
  trunk_link:     110,
  primary:        80,
  primary_link:   80,
  secondary:      80,
  secondary_link: 80,
  tertiary:       80,
  tertiary_link:  80,
  unclassified:   80,
  residential:    30,
  living_street:  20,
  service:        20,
};

// ── Limites légales FR — Mode Doux ────────────
const DEFAULT_LIMITS_SOFT = {
  cycleway:       30,
  path:           25,
  pedestrian:     20,
  footway:        15,
  living_street:  20,
  residential:    30,
  service:        20,
  tertiary:       30,
  tertiary_link:  30,
  unclassified:   30,
  secondary:      30,
  secondary_link: 30,
};

const ROAD_LABELS = {
  motorway:       'Autoroute',
  motorway_link:  'Bretelle autoroute',
  trunk:          'Route express',
  trunk_link:     'Bretelle voie express',
  primary:        'Route nationale',
  primary_link:   'Liaison nationale',
  secondary:      'Route départementale',
  secondary_link: 'Liaison départementale',
  tertiary:       'Route locale',
  tertiary_link:  'Liaison locale',
  unclassified:   'Route non classée',
  residential:    'Rue résidentielle',
  living_street:  'Zone de rencontre',
  service:        'Voie de service',
  cycleway:       'Piste cyclable',
  path:           'Chemin',
  pedestrian:     'Zone piétonne',
  footway:        'Trottoir / Chemin piéton',
};

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
function init() {
  const savedTheme = localStorage.getItem('affivi-theme') || 'dark';
  document.body.classList.add(`theme-${savedTheme}`);
  applyTheme(savedTheme);

  const savedLag = localStorage.getItem('affivi-lag');
  if (savedLag) STATE.lagThreshold = parseInt(savedLag);

  const savedMode = localStorage.getItem('affivi-mode') || 'car';
  setTravelMode(savedMode, false);

  console.log('themeGrid:', DOM.themeGrid);
  console.log('themeGrid HTML:', document.getElementById('theme-grid'));

  buildThemeGrid();
  buildLagOptions();

  DOM.startBtn.addEventListener('click', toggleGPS);
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeBtn.addEventListener('click', closeSettings);
  DOM.overlay.addEventListener('click', closeSettings);
  DOM.modeBtn.addEventListener('click', toggleTravelMode);

  startLagTimer();
}

// ══════════════════════════════════════════════
//  MODE DÉPLACEMENT
// ══════════════════════════════════════════════
function toggleTravelMode() {
  const next = STATE.travelMode === 'car' ? 'soft' : 'car';
  setTravelMode(next, true);

  if (STATE.gpsActive && _fetchLat !== null) {
    _lastFetchTime = 0;
    fetchSpeedLimit(_fetchLat, _fetchLon);
  }
}

function setTravelMode(mode, save = true) {
  STATE.travelMode = mode;
  if (save) localStorage.setItem('affivi-mode', mode);

  if (mode === 'car') {
    DOM.modeBtn.textContent  = '🚗';
    DOM.modeBtn.title        = 'Mode voiture actif';
    DOM.modeBtn.dataset.mode = 'car';
    if (DOM.modeLabel) DOM.modeLabel.textContent = 'Voiture';
  } else {
    DOM.modeBtn.textContent  = '🚲';
    DOM.modeBtn.title        = 'Mode doux actif';
    DOM.modeBtn.dataset.mode = 'soft';
    if (DOM.modeLabel) DOM.modeLabel.textContent = 'Vélo';
  }
}

// ══════════════════════════════════════════════
//  THÈMES
// ══════════════════════════════════════════════
const THEMES = ['dark','light','night','ocean','forest','sunset'];

function buildThemeGrid() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('affivi-theme', theme);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Marquer le thème actif au chargement
  const saved = localStorage.getItem('affivi-theme') || 'dark';
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === saved);
  });
}

function applyTheme(theme) {
  // Retire toutes les classes de thème existantes
  document.body.classList.forEach(cls => {
    if (cls.startsWith('theme-')) document.body.classList.remove(cls);
  });
  document.body.classList.add(`theme-${theme}`);
  
  STATE.currentTheme = theme;
  localStorage.setItem('affivi-theme', theme);
  
  const colors = {
    dark:   '#0a0a0f',
    light:  '#f0f2f5',
    space:  '#020210',
    ocean:  '#021520',
    nature: '#0a1a0a',
    zen:    '#1a1510',
  };
  if (DOM.metaTheme) DOM.metaTheme.content = colors[theme] || '#0a0a0f';
}

// ══════════════════════════════════════════════
//  LAG OPTIONS
// ══════════════════════════════════════════════
function buildLagOptions() {
  if (!DOM.lagOptions) return;
  const thresholds = [2, 3, 5, 10];
  DOM.lagOptions.innerHTML = '';
  thresholds.forEach(v => {
    const btn = document.createElement('button');
    btn.className   = 'lag-opt-btn' + (v === STATE.lagThreshold ? ' active' : '');
    btn.textContent = v + 's';
    btn.addEventListener('click', () => {
      STATE.lagThreshold = v;
      localStorage.setItem('affivi-lag', v);
      document.querySelectorAll('.lag-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    DOM.lagOptions.appendChild(btn);
  });
}

// ══════════════════════════════════════════════
//  SETTINGS PANEL
// ══════════════════════════════════════════════
function openSettings() {
  DOM.settingsPanel.classList.add('open');
  DOM.overlay.classList.add('visible');
}

function closeSettings() {
  DOM.settingsPanel.classList.remove('open');
  DOM.overlay.classList.remove('visible');
}

// ══════════════════════════════════════════════
//  GPS
// ══════════════════════════════════════════════
function toggleGPS() {
  STATE.gpsActive ? stopGPS() : startGPS();
}

function startGPS() {
  if (!navigator.geolocation) {
    DOM.roadType.textContent = 'GPS non supporté';
    return;
  }
  STATE.gpsActive = true;
  DOM.startBtn.textContent = '⏹ Arrêter';
  DOM.startBtn.classList.add('active');
  KALMAN.reset(); // ← reset filtre à chaque démarrage
  requestWakeLock();

  STATE.watchId = navigator.geolocation.watchPosition(
    onGPSUpdate,
    onGPSError,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function stopGPS() {
  if (STATE.watchId !== null) {
    navigator.geolocation.clearWatch(STATE.watchId);
    STATE.watchId = null;
  }
  STATE.gpsActive      = false;
  STATE.lastUpdateTime = null;
  KALMAN.reset();
  DOM.startBtn.textContent = '▶ Démarrer';
  DOM.startBtn.classList.remove('active');
  DOM.speedValue.textContent = '0';
  setSignal(-1);
  updateLimitDisplay(null, '');
  if (STATE.wakeLock) { STATE.wakeLock.release().catch(() => {}); }
}

function onGPSUpdate(pos) {
  const { latitude, longitude, speed, accuracy } = pos.coords;
  STATE.lastUpdateTime = Date.now();

  // Vitesse brute GPS en km/h
  const rawKmh = speed !== null ? Math.max(0, speed * 3.6) : 0;

  // ── Filtre de Kalman ──────────────────────
  // On ajuste R dynamiquement selon la précision GPS :
  // mauvaise précision = on fait moins confiance à la mesure
  KALMAN.R = accuracy != null ? Math.max(2, Math.min(accuracy / 3, 20)) : 8;
  const smoothKmh = KALMAN.filter(rawKmh);
  const kmh       = Math.round(smoothKmh);

  STATE.currentSpeed = kmh;
  updateSpeedDisplay(kmh);
  updateSignal(accuracy);

  if (shouldFetch(latitude, longitude)) {
    fetchSpeedLimit(latitude, longitude);
  }
}

function onGPSError(err) {
  STATE.lastUpdateTime = null;
  DOM.speedValue.textContent = '--';
  setSignal(-1);
  const msgs = {
    1: 'Permission GPS refusée',
    2: 'Signal GPS indisponible',
    3: 'Délai GPS dépassé',
  };
  DOM.roadType.textContent = msgs[err.code] || 'Erreur GPS';
}

// ── Fetch throttle ────────────────────────────
let _fetchLat      = null;
let _fetchLon      = null;
let _lastFetchTime = 0;

const FETCH_DISTANCE = 25;
const FETCH_INTERVAL = 5000;

function shouldFetch(lat, lon) {
  if (_fetchLat === null) return true;
  const dist    = haversine(lat, lon, _fetchLat, _fetchLon);
  const elapsed = Date.now() - _lastFetchTime;
  return dist > FETCH_DISTANCE || elapsed > FETCH_INTERVAL;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*rad) * Math.cos(lat2*rad) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ══════════════════════════════════════════════
//  OVERPASS API
// ══════════════════════════════════════════════
let _abortCtrl = null;

async function fetchSpeedLimit(lat, lon) {
  _fetchLat      = lat;
  _fetchLon      = lon;
  _lastFetchTime = Date.now();

  if (_abortCtrl) _abortCtrl.abort();
  _abortCtrl = new AbortController();

  const exclusions = STATE.travelMode === 'car'
    ? '[highway!~"footway|cycleway|path|steps|pedestrian"]'
    : '[highway!~"motorway|motorway_link|trunk|trunk_link"]';

  // Rayon élargi à 20m + géométrie complète pour calcul de distance
  const query = `[out:json][timeout:5];
way(around:20,${lat},${lon})[highway]${exclusions};
out tags geom;`;

  try {
    const res  = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal: _abortCtrl.signal }
    );
    const data = await res.json();
    if (!data.elements?.length) { updateLimitDisplay(null, ''); return; }

    const way = pickBestWay(data.elements, lat, lon);
    if (!way)  { updateLimitDisplay(null, ''); return; }

    const tags    = way.tags || {};
    const highway = tags.highway || '';
    let   limit   = parseMaxspeed(tags.maxspeed);

    if (limit === null) {
      const limits = STATE.travelMode === 'car'
        ? DEFAULT_LIMITS_CAR
        : DEFAULT_LIMITS_SOFT;
      limit = limits[highway] ?? null;
    }

    const label = ROAD_LABELS[highway] || highway || '';
    const name  = tags.name || tags.ref || '';
    const info  = [tags.ref, name !== tags.ref ? name : '']
                    .filter(Boolean).join(' — ') || label;

    updateLimitDisplay(limit, info);
  } catch (e) {
    if (e.name !== 'AbortError') { /* silencieux */ }
  }
}

// ══════════════════════════════════════════════
//  SÉLECTION DU MEILLEUR SEGMENT
//  Score combiné : rang hiérarchique + distance
//  géométrique + cohérence avec vitesse actuelle
// ══════════════════════════════════════════════
function pickBestWay(elements, userLat, userLon) {
  const orderCar  = ['motorway','trunk','primary','secondary',
                     'tertiary','unclassified','residential','living_street','service'];
  const orderSoft = ['cycleway','pedestrian','path','footway',
                     'living_street','residential','service',
                     'tertiary','unclassified'];

  const order = STATE.travelMode === 'car' ? orderCar : orderSoft;
  const roads = elements.filter(e => e.type === 'way' && e.tags?.highway);
  if (!roads.length) return null;

  // Vitesse actuelle pour pondérer la cohérence
  const spd = STATE.currentSpeed;

  const scored = roads.map(way => {
    const hw   = (way.tags.highway || '').replace(/_link$/, '');
    const rank = order.indexOf(hw);

    // ── Distance géométrique au segment ─────
    // On cherche le point le plus proche sur la polyligne du way
    const dist = distanceToWay(way, userLat, userLon);

    // ── Score de rang (0 = meilleur) ────────
    const rankScore = rank === -1 ? 999 : rank;

    // ── Cohérence vitesse / type de route ───
    // Pénaliser si on va vite sur une route lente ou inversement
    let coherencePenalty = 0;
    const defaultLimits  = STATE.travelMode === 'car'
      ? DEFAULT_LIMITS_CAR : DEFAULT_LIMITS_SOFT;
    const expectedLimit  = defaultLimits[way.tags.highway] ?? 50;

    if (spd > 0) {
      // Ex : on roule à 90km/h et le segment est résidentiel (30) → pénalité forte
      const ratio = Math.abs(spd - expectedLimit) / Math.max(expectedLimit, 1);
      coherencePenalty = ratio * 2; // coefficient ajustable
    }

    // ── Bonus maxspeed explicite ─────────────
    const hasLimit = way.tags.maxspeed ? -1 : 0; // bonus léger

    // Score final : plus bas = meilleur
    const score = rankScore * 1.5
                + (dist / 5)          // distance en mètres, normalisée
                + coherencePenalty
                + hasLimit;

    return { way, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].way;
}

// Distance d'un point à un segment de polyligne (way avec géométrie)
function distanceToWay(way, lat, lon) {
  const geom = way.geometry;
  if (!geom || geom.length < 2) {
    // Pas de géométrie : distance au centroïde approchée
    return 0;
  }

  let minDist = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const d = distanceToSegment(
      lat, lon,
      geom[i].lat,   geom[i].lon,
      geom[i+1].lat, geom[i+1].lon
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Distance d'un point à un segment [A,B] en mètres
function distanceToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  // Projection sur le segment en coordonnées approchées (plan local)
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx*dx + dy*dy;

  let t = 0;
  if (lenSq > 0) {
    t = ((pLon - aLon)*dx + (pLat - aLat)*dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestLat = aLat + t * dy;
  const closestLon = aLon + t * dx;
  return haversine(pLat, pLon, closestLat, closestLon);
}

function parseMaxspeed(raw) {
  if (!raw) return null;
  const map = {
    'FR:motorway':      130,
    'FR:rural':          80,
    'FR:urban':          50,
    'FR:living_street':  20,
    'FR:walk':           20,
    'walk':               7,
  };
  if (map[raw] !== undefined) return map[raw];
  const n = parseInt(raw);
  return (!isNaN(n) && n > 0) ? n : null;
}

// ══════════════════════════════════════════════
//  AFFICHAGE VITESSE & LIMITE
// ══════════════════════════════════════════════
function updateSpeedDisplay(kmh) {
  DOM.speedValue.textContent = kmh;
  checkOverLimit(kmh, STATE.speedLimit);
}

function updateLimitDisplay(limit, info) {
  STATE.speedLimit            = limit;
  DOM.limitNumber.textContent = limit !== null ? limit : '--';
  DOM.limitLabel.textContent  = limit !== null ? 'Limitation' : 'Inconnue';
  DOM.roadType.textContent    = info || '';
  checkOverLimit(STATE.currentSpeed, limit);
}

function checkOverLimit(speed, limit) {
  const over = limit !== null && speed > limit;
  DOM.speedValue.classList.toggle('over-limit', over);
  DOM.limitRing.classList.toggle('over-limit', over);
}

// ══════════════════════════════════════════════
//  SIGNAL GPS
// ══════════════════════════════════════════════
function updateSignal(accuracy) {
  let level;
  if (accuracy == null)     level = -1;
  else if (accuracy <= 15)  level =  3;
  else if (accuracy <= 40)  level =  2;
  else if (accuracy <= 100) level =  1;
  else                      level =  0;
  setSignal(level);
}

function setSignal(level) {
  DOM.signalBars.className    = 'signal-bars' + (level >= 0 ? ` sig-${level}` : '');
  DOM.signalLabel.textContent = ['Faible','Moyen','Bon','Excellent'][level] ?? 'GPS';
}

// ══════════════════════════════════════════════
//  LAG TIMER
// ══════════════════════════════════════════════
function startLagTimer() {
  setInterval(() => {
    if (!STATE.gpsActive || STATE.lastUpdateTime === null) {
      DOM.lagValue.textContent = '--';
      DOM.lagBlock.className   = 'lag-block';
      return;
    }
    const elapsed = Math.floor((Date.now() - STATE.lastUpdateTime) / 1000);
    DOM.lagValue.textContent = elapsed + 's';
    const crit = STATE.lagThreshold * 1.67;
    if (elapsed >= crit) {
      DOM.lagBlock.className  = 'lag-block lag-crit';
      DOM.lagIcon.textContent = '⚠️';
    } else if (elapsed >= STATE.lagThreshold) {
      DOM.lagBlock.className  = 'lag-block lag-warn';
      DOM.lagIcon.textContent = '⚠️';
    } else {
      DOM.lagBlock.className  = 'lag-block';
      DOM.lagIcon.textContent = '⏱';
    }
  }, 500);
}

// ══════════════════════════════════════════════
//  WAKE LOCK
// ══════════════════════════════════════════════
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    STATE.wakeLock = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        STATE.wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      }
    });
  } catch (e) {}
}

// ── Démarrage ────────────────────────────────
init();
