/* ═══════════════════════════════════════════
   AFFIVI — AFFIchage VItesse
   Version 1.1
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
  travelMode:     'car',   // 'car' | 'soft'
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
  // Restaurer thème
  const savedTheme = localStorage.getItem('affivi-theme') || 'dark';
  applyTheme(savedTheme);

  // Restaurer seuil lag
  const savedLag = localStorage.getItem('affivi-lag');
  if (savedLag) STATE.lagThreshold = parseInt(savedLag);

  // Restaurer mode déplacement
  const savedMode = localStorage.getItem('affivi-mode') || 'car';
  setTravelMode(savedMode, false);

  // Thèmes dans le panel
  buildThemeGrid();

  // Lag options
  buildLagOptions();

  // Events
  DOM.startBtn.addEventListener('click', toggleGPS);
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeBtn.addEventListener('click', closeSettings);
  DOM.overlay.addEventListener('click', closeSettings);
  DOM.modeBtn.addEventListener('click', toggleTravelMode);

  // Lag timer
  startLagTimer();
}

// ══════════════════════════════════════════════
//  MODE DÉPLACEMENT
// ══════════════════════════════════════════════
function toggleTravelMode() {
  const next = STATE.travelMode === 'car' ? 'soft' : 'car';
  setTravelMode(next, true);

  // Re-fetch immédiat si GPS actif
  if (STATE.gpsActive && _fetchLat !== null) {
    _lastFetchTime = 0; // force re-fetch
    fetchSpeedLimit(_fetchLat, _fetchLon);
  }
}

function setTravelMode(mode, save = true) {
  STATE.travelMode = mode;
  if (save) localStorage.setItem('affivi-mode', mode);

  if (mode === 'car') {
    DOM.modeBtn.textContent   = '🚗';
    DOM.modeBtn.title         = 'Mode voiture — cliquer pour mode doux';
    DOM.modeBtn.dataset.mode  = 'car';
  } else {
    DOM.modeBtn.textContent   = '🚲';
    DOM.modeBtn.title         = 'Mode doux — cliquer pour mode voiture';
    DOM.modeBtn.dataset.mode  = 'soft';
  }
}

// ══════════════════════════════════════════════
//  THÈMES
// ══════════════════════════════════════════════
const THEMES = ['dark','light','night','ocean','forest','sunset'];

function buildThemeGrid() {
  if (!DOM.themeGrid) return;
  DOM.themeGrid.innerHTML = '';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className   = 'theme-btn' + (t === STATE.currentTheme ? ' active' : '');
    btn.dataset.theme = t;
    btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    btn.addEventListener('click', () => {
      applyTheme(t);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    DOM.themeGrid.appendChild(btn);
  });
}

function applyTheme(theme) {
  STATE.currentTheme = theme;
  DOM.body.dataset.theme = theme;
  localStorage.setItem('affivi-theme', theme);
  const colors = {
    dark:   '#111111',
    light:  '#f5f5f5',
    night:  '#0a0a1a',
    ocean:  '#0a1628',
    forest: '#0a1a0a',
    sunset: '#1a0a00',
  };
  if (DOM.metaTheme) DOM.metaTheme.content = colors[theme] || '#111111';
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
  STATE.gpsActive     = false;
  STATE.lastUpdateTime = null;
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

  const kmh = speed !== null ? Math.max(0, Math.round(speed * 3.6)) : 0;
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

const FETCH_DISTANCE = 25;    // mètres
const FETCH_INTERVAL = 5000;  // ms

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

  // Query adaptée au mode
  const exclusions = STATE.travelMode === 'car'
    ? '[highway!~"footway|cycleway|path|steps|pedestrian"]'
    : '[highway!~"motorway|motorway_link|trunk|trunk_link"]';

  const query = `[out:json][timeout:4];
way(around:15,${lat},${lon})[highway]${exclusions};
out tags geom(${lat-0.0003},${lon-0.0003},${lat+0.0003},${lon+0.0003});`;

  try {
    const res  = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal: _abortCtrl.signal }
    );
    const data = await res.json();
    if (!data.elements?.length) { updateLimitDisplay(null, ''); return; }

    const way = pickBestWay(data.elements);
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

function pickBestWay(elements) {
  const orderCar  = ['motorway','trunk','primary','secondary',
                     'tertiary','unclassified','residential','living_street','service'];
  const orderSoft = ['cycleway','pedestrian','path','footway',
                     'living_street','residential','service',
                     'tertiary','unclassified'];

  const order = STATE.travelMode === 'car' ? orderCar : orderSoft;
  const roads = elements.filter(e => e.type === 'way' && e.tags?.highway);
  if (!roads.length) return null;

  // Priorité aux routes avec maxspeed explicite
  const withLimit = roads.filter(r => r.tags.maxspeed);
  const pool      = withLimit.length ? withLimit : roads;

  pool.sort((a, b) => {
    const ia = order.indexOf(a.tags.highway.replace(/_link$/, ''));
    const ib = order.indexOf(b.tags.highway.replace(/_link$/, ''));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return pool[0];
}

function parseMaxspeed(raw) {
  if (!raw) return null;
  const map = {
    'FR:motorway':     130,
    'FR:rural':         80,
    'FR:urban':         50,
    'FR:living_street': 20,
    'FR:walk':          20,
    'walk':              7,
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
    DOM.lagValue.textContent   = elapsed + 's';
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
