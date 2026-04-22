export const COUNTRIES_2026 = {
  FR: { name: 'France',      flag: '🇫🇷', limits: { city:50, road:80,  expressway:110, highway:130 }},
  BE: { name: 'Belgique',    flag: '🇧🇪', limits: { city:50, road:90,  expressway:120, highway:120 }},
  DE: { name: 'Allemagne',   flag: '🇩🇪', limits: { city:50, road:100, expressway:130, highway:130 }},
  CH: { name: 'Suisse',      flag: '🇨🇭', limits: { city:50, road:80,  expressway:100, highway:120 }},
  ES: { name: 'Espagne',     flag: '🇪🇸', limits: { city:50, road:90,  expressway:100, highway:120 }},
  IT: { name: 'Italie',      flag: '🇮🇹', limits: { city:50, road:90,  expressway:110, highway:130 }},
  LU: { name: 'Luxembourg',  flag: '🇱🇺', limits: { city:50, road:90,  expressway:110, highway:130 }},
  NL: { name: 'Pays-Bas',    flag: '🇳🇱', limits: { city:50, road:80,  expressway:100, highway:100 }},
  PT: { name: 'Portugal',    flag: '🇵🇹', limits: { city:50, road:90,  expressway:100, highway:120 }},
  AT: { name: 'Autriche',    flag: '🇦🇹', limits: { city:50, road:100, expressway:100, highway:130 }},
  GB: { name: 'Royaume-Uni', flag: '🇬🇧', limits: { city:48, road:96,  expressway:112, highway:112 }},
  PL: { name: 'Pologne',     flag: '🇵🇱', limits: { city:50, road:90,  expressway:120, highway:140 }},
};

export function getLimitsFor(code, overrides = {}) {
  const base = COUNTRIES_2026[code];
  if (!base) return null;
  const o = overrides[code] || {};
  return { ...base.limits, ...o };
}

export function roadFromSpeed(kmh) {
  if (kmh < 60) return 'city';
  if (kmh < 100) return 'road';
  if (kmh < 120) return 'expressway';
  return 'highway';
}
