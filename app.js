/* ═══════════════════════════════════════════
   AFFIVI — AFFIchage VItesse
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
};

// ── Limites légales FR (fallback) ─────────────
const DEFAULT_LIMITS = {
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

const ROAD_LABELS = {
  motorway:       'Autoroute',
  motorway_link:  'Bretelle autoroute',
  trunk:          'Route express',
  trunk_link:     'Bretelle voie express',
  primary:        'Route nationale',
  primary_link:   'Liaison nationale',
  secondary:      'Route départementale',
  secondary_link: 'Liaison départementale',
  tertiary:       'Route tertiaire',
  unclassified:   'Route communale',
  residential:    'Zone résidentielle',
  living_street:  'Aire piétonne',
  service:        'Voie de service',
};

const THEME_META = {
  dark:   '#0a0a0f',
  light:  '#f0f2f5',
  space:  '#020210',
  ocean:  '#021520',
  nature: '#0a1a0a',
  zen:    '#1a1510',
};

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
function init() {
  loadSettings();
  DOM.startBtn.addEventListener('click', startGPS);
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeBtn.addEventListener('click', closeSettings);
  DOM.overlay.addEventListener('click', closeSettings);
  DOM.themeGrid.addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if (btn) applyTheme(btn.dataset.theme);
  });
  DOM.lagOptions.addEventListener('click', e => {
    const btn = e.target.closest('.lag-opt');
    if (!btn) return;
    STATE.lagThreshold = parseInt(btn.dataset.lag);
    syncLagUI();
    saveSettings();
  });
  startLagTimer();
}

// ══════════════════════════════════════════════
//  SETTINGS PERSISTANCE
// ══════════════════════════════════════════════
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('affivi-settings') || '{}');
    if (s.theme)        applyTheme(s.theme);
    if (s.lagThreshold) STATE.lagThreshold = s.lagThreshold;
  } catch (e) {}
  syncLagUI();
}

function saveSettings() {
  localStorage.setItem('affivi-settings', JSON.stringify({
    theme: STATE.currentTheme,
    lagThreshold: STATE.lagThreshold,
  }));
}

// ══════════════════════════════════════════════
//  THÈME
// ══════════════════════════════════════════════
function applyTheme(theme) {
  DOM.body.className = DOM.body.className.replace(/theme-\S+/g, '').trim();
  DOM.body.classList.add(`theme-${theme}`);
  STATE.currentTheme = theme;

  const metaColor = THEME_META[theme] || '#0a0a0f';
  DOM.metaTheme.setAttribute('content', metaColor);
  document.querySelectorAll('meta[name="theme-color"]')
    .forEach(m => m.setAttribute('content', metaColor));

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  saveSettings();
}

// ══════════════════════════════════════════════
//  LAG UI
// ══════════════════════════════════════════════
function syncLagUI() {
  document.querySelectorAll('.lag-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.lag) === STATE.lagThreshold);
  });
}

// ══════════════════════════════════════════════
//  PANNEAU PARAMÈTRES
// ══════════════════════════════════════════════
function openSettings() {
  DOM.settingsPanel.classList.add('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'false');
  DOM.overlay.classList.add('active');
}

function closeSettings() {
  DOM.settingsPanel.classList.remove('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'true');
  DOM.overlay.classList.remove('active');
}

// ══════════════════════════════════════════════
//  GPS
// ══════════════════════════════════════════════
function startGPS() {
  if (!('geolocation' in navigator)) {
    alert('La géolocalisation n\'est pas disponible sur cet appareil.');
    return;
  }
  DOM.startBtn.classList.add('hidden');
  STATE.gpsActive = true;
  requestWakeLock();

  STATE.watchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function onGPSSuccess(pos) {
  const { latitude, longitude, speed, accuracy } = pos.coords;
  STATE.lastUpdateTime = Date.now();

  const kmh = speed !== null ? Math.max(0, Math.round(speed * 3.6)) : 0;
  STATE.currentSpeed = kmh;

  DOM.speedValue.textContent = kmh;
  updateSignal(accuracy);
  checkOverLimit(kmh, STATE.speedLimit);

  if (shouldFetch(latitude, longitude)) {
    fetchSpeedLimit(latitude, longitude);
  }
}

function onGPSError(err) {
  STATE.lastUpdateTime = null;
  DOM.speedValue.textContent = '--';
  setSignal(-1);
  const msgs = { 1: 'Permission GPS refusée', 2: 'Signal GPS indisponible', 3: 'Délai GPS dépassé' };
  DOM.roadType.textContent = msgs[err.code] || 'Erreur GPS';
}

// ── Fetch throttle (tous les ~30m) ───────────
let _fetchLat = null, _fetchLon = null;

function shouldFetch(lat, lon) {
  if (_fetchLat === null) return true;
  return haversine(lat, lon, _fetchLat, _fetchLon) > 30;
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
  _fetchLat = lat;
  _fetchLon = lon;
  if (_abortCtrl) _abortCtrl.abort();
  _abortCtrl = new AbortController();

  const query = `[out:json][timeout:5];
way(around:25,${lat},${lon})[highway];
out tags;`;

  try {
    const res  = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal: _abortCtrl.signal }
    );
    const data = await res.json();
    if (!data.elements?.length) { updateLimitDisplay(null, ''); return; }

    const way  = pickBestWay(data.elements);
    if (!way)  { updateLimitDisplay(null, ''); return; }

    const tags    = way.tags || {};
    const highway = tags.highway || '';
    let   limit   = parseMaxspeed(tags.maxspeed);
    if (limit === null) limit = DEFAULT_LIMITS[highway] ?? null;

    const label  = ROAD_LABELS[highway] || highway || '';
    const name   = tags.name || tags.ref || '';
    const info   = [tags.ref, name !== tags.ref ? name : '']
                     .filter(Boolean).join(' — ') || label;

    updateLimitDisplay(limit, info);
  } catch (e) {
    if (e.name !== 'AbortError') { /* silencieux */ }
  }
}

function pickBestWay(elements) {
  const order = ['motorway','trunk','primary','secondary',
                 'tertiary','unclassified','residential','living_street','service'];
  const roads = elements.filter(e => e.type === 'way' && e.tags?.highway);
  if (!roads.length) return null;
  roads.sort((a, b) => {
    const ia = order.indexOf(a.tags.highway.replace(/_link$/,''));
    const ib = order.indexOf(b.tags.highway.replace(/_link$/,''));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return roads[0];
}

function parseMaxspeed(raw) {
  if (!raw) return null;
  const map = {
    'FR:motorway': 130, 'FR:rural': 80, 'FR:urban': 50,
    'FR:living_street': 20, 'FR:walk': 20, 'walk': 7,
  };
  if (map[raw] !== undefined) return map[raw];
  const n = parseInt(raw);
  return (!isNaN(n) && n > 0) ? n : null;
}

// ══════════════════════════════════════════════
//  AFFICHAGE LIMITE
// ══════════════════════════════════════════════
function updateLimitDisplay(limit, info) {
  STATE.speedLimit = limit;
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
//  SIGNAL
// ══════════════════════════════════════════════
function updateSignal(accuracy) {
  let level;
  if (accuracy == null)    level = -1;
  else if (accuracy <= 15) level = 3;
  else if (accuracy <= 40) level = 2;
  else if (accuracy <= 100)level = 1;
  else                     level = 0;
  setSignal(level);
}

function setSignal(level) {
  DOM.signalBars.className = 'signal-bars' + (level >= 0 ? ` sig-${level}` : '');
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
      DOM.lagBlock.className   = 'lag-block lag-crit';
      DOM.lagIcon.textContent  = '⚠️';
    } else if (elapsed >= STATE.lagThreshold) {
      DOM.lagBlock.className   = 'lag-block lag-warn';
      DOM.lagIcon.textContent  = '⚠️';
    } else {
      DOM.lagBlock.className   = 'lag-block';
      DOM.lagIcon.textContent  = '⏱';
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
