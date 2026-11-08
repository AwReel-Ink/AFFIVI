/* ═══════════════════════════════════════════
   AFFIVI — AFFIchage VItesse
   Version 2.0 — engine.js
   Logique pure (sans interface) :
   vitesse, cap, zone de routes, choix de la route, limitation.
   © 2026 LEROY Aurélien — Tous droits réservés
═══════════════════════════════════════════ */

(function (root) {
'use strict';

const EARTH_R = 6371000;
const RAD = Math.PI / 180;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Projection locale en mètres (précise à moins d'1 % sur quelques km)
function project(lat, lon, refLat, refLon) {
  return [
    (lon - refLon) * RAD * EARTH_R * Math.cos(refLat * RAD),
    (lat - refLat) * RAD * EARTH_R,
  ];
}

const validNum = v => typeof v === 'number' && isFinite(v);

// ══════════════════════════════════════════════
//  VITESSE
//  Cause des sauts de la v1 : une position sans
//  vitesse était affichée comme 0 km/h.
//  Ici : jamais de 0 inventé, rejet des valeurs
//  physiquement impossibles, lissage léger
//  seulement quand la précision est mauvaise.
// ══════════════════════════════════════════════
const SMOOTHING = {
  // coefficient appliqué à chaque mesure (1 = valeur brute, aucun retard)
  reactive: { good: 1.00, mid: 1.00, poor: 0.80 },
  balanced: { good: 1.00, mid: 0.75, poor: 0.55 },
  stable:   { good: 0.70, mid: 0.50, poor: 0.35 },
};

const MAX_ACCEL = 20;   // km/h gagnés par seconde au maximum (voiture très puissante)
const MAX_DECEL = 40;   // km/h perdus par seconde au maximum (freinage d'urgence)
const STOP_KMH  = 2.5;  // en dessous : considéré à l'arrêt (dérive GPS)

class SpeedFilter {
  constructor(mode = 'balanced') { this.mode = mode; this.reset(); }

  reset() {
    this.value  = null;  // vitesse filtrée (décimale)
    this.shown  = null;  // vitesse affichée (entier)
    this.lastT  = null;
    this.prev   = null;  // dernière position {lat, lon, acc, t}
    this.source = null;  // 'gps' | 'calc' | 'hold'
  }

  setMode(mode) { if (SMOOTHING[mode]) this.mode = mode; }

  /** fix = {speed (m/s|null), lat, lon, accuracy, t (ms)} → entier km/h ou null */
  update(fix) {
    const { lat, lon, accuracy, t } = fix;
    let raw = null;
    let src = 'gps';

    if (validNum(fix.speed) && fix.speed >= 0) {
      raw = fix.speed * 3.6;
    } else if (this.prev && validNum(accuracy) && accuracy <= 25 && this.prev.acc <= 25) {
      // Pas de vitesse fournie : on la calcule à partir des deux dernières positions
      const dt = (t - this.prev.t) / 1000;
      if (dt >= 0.5 && dt <= 5) {
        raw = haversine(this.prev.lat, this.prev.lon, lat, lon) / dt * 3.6;
        src = 'calc';
      }
    }

    if (validNum(accuracy) && accuracy <= 100) {
      this.prev = { lat, lon, acc: accuracy, t };
    }

    if (raw === null) {           // rien d'exploitable : on garde la dernière valeur
      this.source = this.value === null ? null : 'hold';
      return this.shown;
    }

    if (raw < STOP_KMH) raw = 0;

    if (this.value === null) {
      this.value = raw;
    } else {
      const dt = this.lastT ? clamp((t - this.lastT) / 1000, 0.2, 10) : 1;
      // Rejet des sauts impossibles : on borne la variation au physiquement possible
      const limited = clamp(raw, this.value - MAX_DECEL * dt, this.value + MAX_ACCEL * dt);
      const tier = !validNum(accuracy) ? 'poor'
                 : accuracy <= 10 ? 'good'
                 : accuracy <= 30 ? 'mid' : 'poor';
      let k = SMOOTHING[this.mode][tier];
      if (src === 'calc') k = Math.min(k, 0.6);
      this.value = this.value + k * (limited - this.value);
      if (raw === 0 && this.value < STOP_KMH) this.value = 0;
    }
    this.lastT  = t;
    this.source = src;

    // Hystérésis d'affichage : évite le 49 / 50 / 49 / 50
    const v = Math.max(0, this.value);
    if (this.shown === null || Math.abs(v - this.shown) >= 0.7 || v === 0) {
      this.shown = Math.round(v);
    }
    return this.shown;
  }
}

// ══════════════════════════════════════════════
//  CAP (direction de déplacement)
// ══════════════════════════════════════════════
class HeadingTracker {
  constructor() { this.reset(); }
  reset() { this.heading = null; this.t = 0; this.anchor = null; }

  update(fix, speedKmh) {
    const { lat, lon, accuracy, t } = fix;
    if (validNum(fix.heading) && speedKmh >= 5) {
      this.heading = fix.heading; this.t = t;
    } else if (validNum(accuracy) && accuracy <= 30) {
      if (!this.anchor) this.anchor = { lat, lon };
      else if (haversine(this.anchor.lat, this.anchor.lon, lat, lon) >= 10) {
        this.heading = bearing(this.anchor.lat, this.anchor.lon, lat, lon);
        this.t = t;
        this.anchor = { lat, lon };
      }
    }
    if (this.heading !== null && t - this.t > 15000) this.heading = null; // trop ancien
    return this.heading;
  }
}

// ══════════════════════════════════════════════
//  REQUÊTE OVERPASS (une zone entière à la fois)
// ══════════════════════════════════════════════
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const CAR_TYPES  = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const CAR_FAST   = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const SOFT_TYPES = 'trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|trunk_link|primary_link|secondary_link|tertiary_link|cycleway|path|pedestrian|footway|track|bridleway';

function tileRadius(speedKmh) {
  return Math.round(clamp((speedKmh / 3.6) * 40, 500, 1000));
}

function refetchMargin(speedKmh) {
  return clamp((speedKmh / 3.6) * 15, 150, 450);
}

function buildQuery(lat, lon, radius, mode, speedKmh) {
  const types = mode === 'soft' ? SOFT_TYPES : (speedKmh > 60 ? CAR_FAST : CAR_TYPES);
  return `[out:json][timeout:20];way(around:${radius},${lat.toFixed(6)},${lon.toFixed(6)})["highway"~"^(${types})$"];out tags geom;`;
}

function prepareTile(elements, lat, lon, radius, mode) {
  const ways = [];
  for (const el of elements || []) {
    if (el.type !== 'way' || !el.tags || !el.geometry || el.geometry.length < 2) continue;
    const pts = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of el.geometry) {
      if (!p) continue;
      const [x, y] = project(p.lat, p.lon, lat, lon);
      pts.push(x, y);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (pts.length < 4) continue;
    ways.push({ id: el.id, tags: el.tags, pts, minX, minY, maxX, maxY });
  }
  return { lat, lon, radius, mode, ways, t: Date.now() };
}

class TileManager {
  constructor({ fetchFn, endpoints = ENDPOINTS, now = () => Date.now() } = {}) {
    this.fetchFn   = fetchFn || ((...a) => root.fetch(...a));
    this.endpoints = endpoints;
    this.now       = now;
    this.tile      = null;
    this.loading   = false;
    this.state     = 'idle';   // idle | loading | ok | error
    this.fails     = 0;
    this.retryAt   = 0;
  }

  covers(lat, lon) {
    const t = this.tile;
    return !!t && haversine(lat, lon, t.lat, t.lon) <= t.radius - 30;
  }

  needsFetch(lat, lon, speedKmh, mode) {
    if (this.loading || this.now() < this.retryAt) return false;
    const t = this.tile;
    if (!t || t.mode !== mode) return true;
    return haversine(lat, lon, t.lat, t.lon) > t.radius - refetchMargin(speedKmh);
  }

  async load(lat, lon, speedKmh, mode) {
    this.loading = true;
    this.state   = 'loading';
    const radius = tileRadius(speedKmh);
    const body   = 'data=' + encodeURIComponent(buildQuery(lat, lon, radius, mode, speedKmh));
    try {
      for (const url of this.endpoints) {
        const ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => ctrl && ctrl.abort(), 25000);
        try {
          const res = await this.fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          this.tile    = prepareTile(data.elements, lat, lon, radius, mode);
          this.state   = 'ok';
          this.fails   = 0;
          this.retryAt = 0;
          return true;
        } catch (e) {
          /* on essaie le serveur suivant */
        } finally {
          clearTimeout(timer);
        }
      }
      this.fails++;
      this.state   = 'error';
      this.retryAt = this.now() + Math.min(30000, 4000 * 2 ** (this.fails - 1));
      return false;
    } finally {
      this.loading = false;
    }
  }
}

// ══════════════════════════════════════════════
//  CHOIX DE LA ROUTE (map-matching)
//  Distance réelle au tracé + cohérence avec la
//  direction suivie + stabilité aux carrefours.
//  Ne dépend PAS de la vitesse actuelle.
// ══════════════════════════════════════════════
const SOFT_ONLY = new Set(['cycleway', 'path', 'pedestrian', 'footway', 'track', 'bridleway', 'steps']);
const CAR_ONLY  = new Set(['motorway', 'motorway_link']);

function onewayOf(tags) {
  const o = tags.oneway;
  if (o === 'yes' || o === '1' || o === 'true') return 1;
  if (o === '-1' || o === 'reverse') return -1;
  if (o === 'no') return 0;
  if (tags.junction === 'roundabout' || tags.junction === 'circular') return 1;
  if (tags.highway === 'motorway' || tags.highway === 'motorway_link') return 1;
  return 0;
}

function usable(tags, mode) {
  const hw = tags.highway;
  if (tags.area === 'yes') return false;
  if (mode === 'soft') return !CAR_ONLY.has(hw) && tags.motorroad !== 'yes';
  if (SOFT_ONLY.has(hw)) return false;
  if (tags.access === 'no' || tags.motor_vehicle === 'no') return false;
  return true;
}

/** Évalue toutes les routes proches → liste triée [{way, dist, score, forward}] */
function candidates(tile, pos, mode) {
  if (!tile) return [];
  const [px, py] = project(pos.lat, pos.lon, tile.lat, tile.lon);
  const acc     = validNum(pos.accuracy) ? pos.accuracy : 30;
  const maxDist = clamp(acc * 1.5, 25, 50);
  const useHead = validNum(pos.heading) && (pos.speedKmh || 0) >= 8;
  const out = [];

  for (const w of tile.ways) {
    if (px < w.minX - maxDist || px > w.maxX + maxDist ||
        py < w.minY - maxDist || py > w.maxY + maxDist) continue;
    if (!usable(w.tags, mode)) continue;

    const ow = onewayOf(w.tags);
    let best = null;
    const p = w.pts;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      const cx = ax + t * dx - px, cy = ay + t * dy - py;
      const d = Math.sqrt(cx * cx + cy * cy);
      if (d > maxDist) continue;

      const segB = (Math.atan2(dx, dy) / RAD + 360) % 360; // cap du segment (sens du tracé)
      let penalty = 0, forward = true;
      if (useHead && len2 > 1) {
        const dFwd = angleDiff(pos.heading, segB);
        forward = dFwd <= 90;
        const diff = ow === 1 ? dFwd
                   : ow === -1 ? 180 - dFwd
                   : Math.min(dFwd, 180 - dFwd);
        penalty = diff <= 20 ? 0 : (diff - 20) / 70 * 25;
      }
      let bias = 0;
      if (mode === 'car' && w.tags.highway === 'service') bias = 6;
      const score = d + penalty + bias;
      if (!best || score < best.score) best = { way: w, dist: d, score, forward };
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

class RoadMatcher {
  constructor() { this.reset(); }
  reset() { this.current = null; this.pendingId = null; this.pendingCount = 0; }

  update(tile, pos, mode) {
    const list = candidates(tile, pos, mode);
    if (!list.length) {
      // Aucune route proche : on garde l'ancienne quelques instants (pont, imprécision)
      this.pendingId = null; this.pendingCount = 0;
      if (this.current && pos.t - this.current.t > 8000) this.current = null;
      return this.current;
    }
    const best = list[0];
    const cur  = this.current && list.find(c => c.way.id === this.current.way.id);

    if (!this.current || !cur) {
      // Pas de route courante (ou elle n'est plus proche) : on prend la meilleure
      if (this.current && !cur) {
        // confirmation sur 2 positions avant de changer (sauf si l'ancienne est loin)
        if (this.pendingId !== best.way.id) { this.pendingId = best.way.id; this.pendingCount = 1; }
        else this.pendingCount++;
        if (this.pendingCount < 2 && pos.t - this.current.t < 4000) return this.current;
      }
      this.current = { ...best, t: pos.t };
      this.pendingId = null; this.pendingCount = 0;
      return this.current;
    }

    if (best.way.id !== cur.way.id && best.score < cur.score - 6) {
      if (this.pendingId === best.way.id) this.pendingCount++;
      else { this.pendingId = best.way.id; this.pendingCount = 1; }
      if (this.pendingCount >= 2) {
        this.current = { ...best, t: pos.t };
        this.pendingId = null; this.pendingCount = 0;
        return this.current;
      }
    } else {
      this.pendingId = null; this.pendingCount = 0;
    }
    this.current = { ...cur, t: pos.t };
    return this.current;
  }
}

// ══════════════════════════════════════════════
//  LIMITATION
// ══════════════════════════════════════════════
const SYMBOLIC = {
  'FR:urban': 50, 'FR:rural': 80, 'FR:motorway': 130, 'FR:expressway': 110,
  'FR:zone30': 30, 'FR:zone20': 20, 'FR:zone:30': 30, 'FR:zone:20': 20,
  'FR:living_street': 20,
};

/** Texte OSM → km/h (nombre), null (pas de valeur exploitable) */
function parseMaxspeed(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.split(';')[0].trim();
  if (SYMBOLIC[s] !== undefined) return SYMBOLIC[s];
  if (/^[A-Z]{2}:urban$/.test(s)) return 50;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/i);
  if (!m) return null;           // 'none', 'signals', 'walk', 'variable'…
  let v = parseFloat(m[1]);
  if (m[2] && m[2].toLowerCase() === 'mph') v *= 1.609344;
  v = Math.round(v);
  return v > 0 && v <= 200 ? v : null;
}

const URBAN_NAME = /^(rue|avenue|av\.|boulevard|bd|place|allée|allee|impasse|quai|cours|square|passage|ruelle|chaussée|faubourg)\b/i;

/** Estimation agglomération : nom de voie urbain ou forte densité de rues résidentielles */
function isUrban(tile, pos, way) {
  if (way && way.tags.name && URBAN_NAME.test(way.tags.name)) return true;
  if (!tile) return false;
  const [px, py] = project(pos.lat, pos.lon, tile.lat, tile.lon);
  let n = 0;
  for (const w of tile.ways) {
    const hw = w.tags.highway;
    if (hw !== 'residential' && hw !== 'living_street') continue;
    if (px >= w.minX - 200 && px <= w.maxX + 200 && py >= w.minY - 200 && py <= w.maxY + 200) {
      if (++n >= 6) return true;
    }
  }
  return false;
}

/**
 * → { kmh: nombre|null, source: 'osm'|'estimate'|'none', reason }
 *   osm      : valeur présente dans OpenStreetMap (panneau)
 *   estimate : règle générale française déduite du type de route
 *   none     : aucune valeur (voie sans limitation connue)
 */
function resolveLimit(match, ctx) {
  if (!match) return { kmh: null, source: 'none' };
  const tags = match.way.tags;
  const hw   = tags.highway || '';
  const base = hw.replace(/_link$/, '');

  // 1. Valeur explicite (avec sens de circulation si elle diffère)
  const dirKey = match.forward ? 'maxspeed:forward' : 'maxspeed:backward';
  let v = parseMaxspeed(tags[dirKey]);
  if (v === null) v = parseMaxspeed(tags.maxspeed);
  if (v !== null) return { kmh: v, source: 'osm' };

  // 2. Indication de zone (FR:urban, FR:zone30…)
  for (const k of ['maxspeed:type', 'source:maxspeed', 'zone:maxspeed', 'zone:traffic']) {
    v = parseMaxspeed(tags[k]);
    if (v !== null) return { kmh: v, source: 'estimate', reason: 'zone' };
  }

  // 3. Règle générale selon le type de voie
  const urban = !!ctx.urban;
  if (ctx.mode === 'soft' && SOFT_ONLY.has(hw)) return { kmh: null, source: 'none', reason: 'path' };

  let d = null;
  switch (base) {
    case 'motorway': d = hw === 'motorway' ? 130 : null; break;
    case 'trunk':
      if (hw === 'trunk_link') d = null;
      else d = onewayOf(tags) === 1 ? 110 : 80;   // 2x2 voies séparées : 110, sinon 80
      break;
    case 'primary': case 'secondary': case 'tertiary': case 'unclassified': case 'road':
      d = urban ? 50 : 80; break;
    case 'residential':   d = 50; break;
    case 'living_street': d = 20; break;
    default: d = null;    // service, chemins… : pas de règle fiable
  }
  return d === null ? { kmh: null, source: 'none' } : { kmh: d, source: 'estimate', reason: urban ? 'urban' : 'type' };
}

const ROAD_LABELS = {
  motorway: 'Autoroute', motorway_link: 'Bretelle d\'autoroute',
  trunk: 'Voie express', trunk_link: 'Bretelle',
  primary: 'Route principale', primary_link: 'Bretelle',
  secondary: 'Route secondaire', secondary_link: 'Bretelle',
  tertiary: 'Route locale', tertiary_link: 'Bretelle',
  unclassified: 'Route', road: 'Route',
  residential: 'Rue', living_street: 'Zone de rencontre',
  service: 'Voie de service', cycleway: 'Piste cyclable', path: 'Chemin',
  pedestrian: 'Zone piétonne', footway: 'Chemin piéton', track: 'Chemin agricole',
  bridleway: 'Chemin',
};

function roadInfo(match) {
  if (!match) return '';
  const t = match.way.tags;
  const parts = [];
  if (t.ref) parts.push(t.ref.split(';')[0]);
  if (t.name && t.name !== t.ref) parts.push(t.name);
  return parts.join(' — ') || ROAD_LABELS[t.highway] || '';
}

const API = {
  haversine, bearing, angleDiff, project, parseMaxspeed, onewayOf,
  SpeedFilter, HeadingTracker, TileManager, RoadMatcher,
  candidates, resolveLimit, isUrban, roadInfo, prepareTile, buildQuery,
  tileRadius, refetchMargin, SMOOTHING,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.AffiviEngine = API;

})(typeof self !== 'undefined' ? self : this);
