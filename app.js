/* ═══════════════════════════════════════════
   AFFIVI — AFFIchage VItesse
   Version 2.0 — app.js (interface)
   © 2026 LEROY Aurélien — Tous droits réservés
═══════════════════════════════════════════ */

'use strict';

const E = window.AffiviEngine;

// ── PWA Service Worker ───────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ── Stockage sûr (navigation privée, etc.) ───
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ── DOM ──────────────────────────────────────
const $ = id => document.getElementById(id);
const DOM = {
  metaTheme:     $('meta-theme'),
  speedValue:    $('speed-value'),
  startBtn:      $('start-btn'),
  limitNumber:   $('limit-number'),
  limitRing:     $('limit-ring'),
  limitLabel:    $('limit-label'),
  roadType:      $('road-type'),
  statusLine:    $('status-line'),
  signalBars:    $('signal-bars'),
  signalLabel:   $('signal-label'),
  lagBlock:      $('lag-block'),
  lagValue:      $('lag-value'),
  lagIcon:       $('lag-icon'),
  settingsBtn:   $('settings-btn'),
  settingsPanel: $('settings-panel'),
  closeBtn:      $('close-btn'),
  overlay:       $('overlay'),
  modeBtn:       $('mode-btn'),
  modeLabel:     $('mode-label'),
  smoothHint:    $('smooth-hint'),
};

// ── État ─────────────────────────────────────
const STATE = {
  gpsActive:    false,
  watchId:      null,
  lastFixTime:  null,   // heure de la dernière position reçue
  lastPos:      null,   // dernière position exploitable
  speed:        null,   // vitesse affichée (km/h) ou null
  limit:        null,   // limitation affichée (km/h) ou null
  lagThreshold: parseInt(store.get('affivi-lag', '3'), 10) || 3,
  travelMode:   store.get('affivi-mode', 'car') === 'soft' ? 'soft' : 'car',
  smoothing:    store.get('affivi-smooth', 'balanced'),
  wakeLock:     null,
  gpsError:     null,
  stale:        false,  // vitesse plus à jour (signal perdu)
};

const speedFilter = new E.SpeedFilter(STATE.smoothing);
const headingTrk  = new E.HeadingTracker();
const tiles       = new E.TileManager();
const matcher     = new E.RoadMatcher();

const SMOOTH_HINTS = {
  reactive: 'Valeur GPS brute, aucun retard. Seules les valeurs impossibles sont filtrées.',
  balanced: 'Recommandé. Aucun retard quand le signal est bon, léger lissage quand il est moyen.',
  stable:   'Chiffres plus calmes, mais environ 1 à 2 secondes de retard sur les changements.',
};

const THEME_COLORS = {
  dark: '#0a0a0f', light: '#f0f2f5', space: '#020210',
  ocean: '#021520', nature: '#0a1a0a', zen: '#1a1510',
};

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
function init() {
  applyTheme(store.get('affivi-theme', 'dark'));
  setTravelMode(STATE.travelMode, false);
  bindOptions();

  DOM.startBtn.addEventListener('click', toggleGPS);
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeBtn.addEventListener('click', closeSettings);
  DOM.overlay.addEventListener('click', closeSettings);
  DOM.modeBtn.addEventListener('click', toggleTravelMode);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && STATE.gpsActive) requestWakeLock();
  });

  setInterval(updateLagIndicator, 250);
  updateLagIndicator();
}

// ══════════════════════════════════════════════
//  THÈMES & OPTIONS
// ══════════════════════════════════════════════
function applyTheme(theme) {
  if (!THEME_COLORS[theme]) theme = 'dark';
  [...document.body.classList].forEach(c => { if (c.startsWith('theme-')) document.body.classList.remove(c); });
  document.body.classList.add(`theme-${theme}`);
  store.set('affivi-theme', theme);
  if (DOM.metaTheme) DOM.metaTheme.content = THEME_COLORS[theme];
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

function bindOptions() {
  document.querySelectorAll('.theme-btn').forEach(btn =>
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

  const lagBtns = document.querySelectorAll('[data-lag]');
  lagBtns.forEach(btn => {
    const v = parseInt(btn.dataset.lag, 10);
    btn.classList.toggle('active', v === STATE.lagThreshold);
    btn.addEventListener('click', () => {
      STATE.lagThreshold = v;
      store.set('affivi-lag', String(v));
      lagBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  const smBtns = document.querySelectorAll('[data-smooth]');
  const setSmooth = mode => {
    if (!SMOOTH_HINTS[mode]) mode = 'balanced';
    STATE.smoothing = mode;
    speedFilter.setMode(mode);
    store.set('affivi-smooth', mode);
    smBtns.forEach(b => b.classList.toggle('active', b.dataset.smooth === mode));
    DOM.smoothHint.textContent = SMOOTH_HINTS[mode];
  };
  smBtns.forEach(btn => btn.addEventListener('click', () => setSmooth(btn.dataset.smooth)));
  setSmooth(STATE.smoothing);
}

function openSettings() {
  DOM.settingsPanel.classList.add('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'false');
  DOM.overlay.classList.add('visible');
}

function closeSettings() {
  DOM.settingsPanel.classList.remove('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'true');
  DOM.overlay.classList.remove('visible');
}

// ══════════════════════════════════════════════
//  MODE DÉPLACEMENT
// ══════════════════════════════════════════════
function toggleTravelMode() {
  setTravelMode(STATE.travelMode === 'car' ? 'soft' : 'car', true);
  matcher.reset();
  renderLimit({ kmh: null, source: 'none' }, null);
  if (STATE.gpsActive && STATE.lastPos) maybeLoadTile(STATE.lastPos, true);
}

function setTravelMode(mode, save = true) {
  STATE.travelMode = mode;
  if (save) store.set('affivi-mode', mode);
  const car = mode === 'car';
  DOM.modeBtn.textContent  = car ? '🚗' : '🚲';
  DOM.modeBtn.title        = car ? 'Mode voiture actif' : 'Mode vélo actif';
  DOM.modeBtn.dataset.mode = mode;
  DOM.modeLabel.textContent = car ? 'Voiture' : 'Vélo';
}

// ══════════════════════════════════════════════
//  GPS
// ══════════════════════════════════════════════
function toggleGPS() { STATE.gpsActive ? stopGPS() : startGPS(); }

function startGPS() {
  if (!('geolocation' in navigator)) {
    setStatus('GPS non disponible sur cet appareil', 'error');
    return;
  }
  STATE.gpsActive   = true;
  STATE.lastFixTime = null;
  STATE.gpsError    = null;
  speedFilter.reset();
  headingTrk.reset();
  matcher.reset();
  DOM.startBtn.textContent = '⏹ Arrêter';
  DOM.startBtn.classList.add('active');
  DOM.speedValue.textContent = '--';
  DOM.speedValue.classList.add('waiting');
  setStatus('Recherche du signal GPS…');
  requestWakeLock();

  STATE.watchId = navigator.geolocation.watchPosition(
    onGPSUpdate,
    onGPSError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function stopGPS() {
  if (STATE.watchId !== null) navigator.geolocation.clearWatch(STATE.watchId);
  STATE.watchId     = null;
  STATE.gpsActive   = false;
  STATE.lastFixTime = null;
  STATE.speed       = null;
  DOM.startBtn.textContent = '▶ Activer le GPS';
  DOM.startBtn.classList.remove('active');
  DOM.speedValue.textContent = '--';
  DOM.speedValue.className = 'speed-value';
  setSignal(-1);
  renderLimit({ kmh: null, source: 'none' }, null);
  DOM.limitLabel.textContent = 'Limitation';
  setStatus('');
  if (STATE.wakeLock) { STATE.wakeLock.release().catch(() => {}); STATE.wakeLock = null; }
}

function onGPSUpdate(pos) {
  if (!STATE.gpsActive) return;
  const c   = pos.coords;
  const now = Date.now();
  STATE.lastFixTime = now;
  STATE.gpsError    = null;
  STATE.stale       = false;

  const fix = {
    lat: c.latitude, lon: c.longitude, accuracy: c.accuracy,
    speed: c.speed, heading: c.heading, t: now,
  };

  const kmh = speedFilter.update(fix);
  STATE.speed = kmh;
  const heading = headingTrk.update(fix, kmh || 0);

  DOM.speedValue.textContent = kmh === null ? '--' : kmh;
  DOM.speedValue.classList.toggle('waiting', kmh === null);
  updateSignal(c.accuracy);

  // Positions trop imprécises (réseau / wifi) : pas d'analyse de route
  if (!(c.accuracy <= 60)) {
    if (!tiles.tile) setStatus('Précision GPS insuffisante…', 'warn');
    checkOverLimit();
    return;
  }

  const p = { lat: fix.lat, lon: fix.lon, accuracy: c.accuracy, heading, speedKmh: kmh || 0, t: now };
  STATE.lastPos = p;
  maybeLoadTile(p, false);
  refreshLimit(p);
}

function onGPSError(err) {
  if (err.code === 1) {
    stopGPS();
    setStatus('Permission de localisation refusée', 'error');
    return;
  }
  // Signal perdu / délai dépassé : on ne remet PAS le compteur à zéro,
  // l'alerte de retard continue de monter.
  STATE.gpsError = err.code;
}

// ══════════════════════════════════════════════
//  ROUTES & LIMITATION
// ══════════════════════════════════════════════
function maybeLoadTile(p, force) {
  if (!force && !tiles.needsFetch(p.lat, p.lon, p.speedKmh, STATE.travelMode)) return;
  if (tiles.loading) return;
  if (!tiles.covers(p.lat, p.lon) || tiles.tile?.mode !== STATE.travelMode) {
    setStatus('Chargement des routes…');
  }
  tiles.load(p.lat, p.lon, p.speedKmh, STATE.travelMode).then(ok => {
    if (!STATE.gpsActive) return;
    if (ok) setStatus('');
    if (STATE.lastPos) refreshLimit(STATE.lastPos);
  });
}

function refreshLimit(p) {
  const tile = tiles.tile;
  if (!tile || tile.mode !== STATE.travelMode || !tiles.covers(p.lat, p.lon)) {
    if (tiles.state === 'error') {
      setStatus(tile ? 'Hors zone chargée — nouvelle tentative…' : 'Données routières indisponibles — nouvelle tentative…', 'warn');
      // au-delà de la zone : on n'affiche plus une limitation qui pourrait être fausse
      if (tile && !tiles.covers(p.lat, p.lon)) renderLimit({ kmh: null, source: 'none' }, null);
    }
    checkOverLimit();
    return;
  }
  if (tiles.state === 'ok') setStatus('');
  const match = matcher.update(tile, p, STATE.travelMode);
  const urban = E.isUrban(tile, p, match?.way);
  renderLimit(E.resolveLimit(match, { urban, mode: STATE.travelMode }), match);
}

function renderLimit(res, match) {
  STATE.limit = res.kmh;
  DOM.limitNumber.textContent = res.kmh !== null ? res.kmh : '--';
  const est = res.source === 'estimate';
  DOM.limitRing.classList.toggle('estimated', est);
  DOM.limitLabel.classList.toggle('estimated', est);
  DOM.limitLabel.textContent =
    res.source === 'osm'      ? 'Limitation' :
    res.source === 'estimate' ? 'Estimée'    :
    match                     ? 'Non renseignée' : 'Inconnue';
  DOM.roadType.textContent = E.roadInfo(match);
  checkOverLimit();
}

function checkOverLimit() {
  // Pas d'alerte sur une vitesse périmée (signal perdu) : elle serait trompeuse
  const over = !STATE.stale && STATE.limit !== null && STATE.speed !== null && STATE.speed > STATE.limit;
  DOM.speedValue.classList.toggle('over-limit', over);
  DOM.limitRing.classList.toggle('over-limit', over);
}

function setStatus(text, level) {
  DOM.statusLine.textContent = text || '';
  DOM.statusLine.className = 'status-line' + (level ? ' ' + level : '');
}

// ══════════════════════════════════════════════
//  SIGNAL GPS
// ══════════════════════════════════════════════
function updateSignal(accuracy) {
  let level;
  if (accuracy == null || !isFinite(accuracy)) level = -1;
  else if (accuracy <= 10)  level = 3;
  else if (accuracy <= 25)  level = 2;
  else if (accuracy <= 60)  level = 1;
  else                      level = 0;
  setSignal(level);
}

function setSignal(level, label) {
  DOM.signalBars.className    = 'signal-bars' + (level >= 0 ? ` sig-${level}` : '');
  DOM.signalLabel.textContent = label || (['Faible', 'Moyen', 'Bon', 'Excellent'][level] ?? 'GPS');
}

// ══════════════════════════════════════════════
//  INDICATEUR DE RETARD
// ══════════════════════════════════════════════
function updateLagIndicator() {
  const sv = DOM.speedValue;
  if (!STATE.gpsActive) {
    DOM.lagValue.textContent = '--';
    DOM.lagBlock.className   = 'lag-block';
    DOM.lagIcon.textContent  = '⏱';
    sv.classList.remove('aging', 'stale');
    return;
  }
  if (STATE.lastFixTime === null) {
    DOM.lagValue.textContent = '…';
    DOM.lagBlock.className   = 'lag-block';
    if (STATE.gpsError) setStatus('Signal GPS introuvable — allez à découvert', 'warn');
    return;
  }

  const elapsed = (Date.now() - STATE.lastFixTime) / 1000;
  // À l'arrêt, certains téléphones espacent les positions : alerte plus tolérante
  const thr  = STATE.lagThreshold * (STATE.speed === 0 ? 3 : 1);
  const crit = thr * 1.67;

  DOM.lagValue.textContent = Math.floor(elapsed) + 's';
  if (elapsed >= crit) {
    DOM.lagBlock.className  = 'lag-block lag-crit';
    DOM.lagIcon.textContent = '⚠️';
    sv.classList.remove('aging'); sv.classList.add('stale');
    setSignal(0, 'Perdu');
    if (!STATE.stale) { STATE.stale = true; checkOverLimit(); }
  } else if (elapsed >= thr) {
    DOM.lagBlock.className  = 'lag-block lag-warn';
    DOM.lagIcon.textContent = '⚠️';
    sv.classList.add('aging'); sv.classList.remove('stale');
  } else {
    DOM.lagBlock.className  = 'lag-block';
    DOM.lagIcon.textContent = '⏱';
    sv.classList.remove('aging', 'stale');
  }
  if (elapsed < crit && STATE.stale) { STATE.stale = false; checkOverLimit(); }
}

// ══════════════════════════════════════════════
//  ÉCRAN TOUJOURS ALLUMÉ
// ══════════════════════════════════════════════
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || STATE.wakeLock) return;
  try {
    STATE.wakeLock = await navigator.wakeLock.request('screen');
    STATE.wakeLock.addEventListener('release', () => { STATE.wakeLock = null; });
  } catch {}
}

init();
