// Limites légales 2026 (valeurs en km/h sauf UK/US en mph convertis)
export const COUNTRIES = {
  FR: { name: 'France', flag: '🇫🇷', unit: 'kmh', limits: { city: 50, road: 80, expressway: 110, highway: 130 } },
  BE: { name: 'Belgique', flag: '🇧🇪', unit: 'kmh', limits: { city: 50, road: 90, expressway: 120, highway: 120 } },
  CH: { name: 'Suisse', flag: '🇨🇭', unit: 'kmh', limits: { city: 50, road: 80, expressway: 100, highway: 120 } },
  LU: { name: 'Luxembourg', flag: '🇱🇺', unit: 'kmh', limits: { city: 50, road: 90, expressway: 110, highway: 130 } },
  DE: { name: 'Allemagne', flag: '🇩🇪', unit: 'kmh', limits: { city: 50, road: 100, expressway: 130, highway: 130 } },
  IT: { name: 'Italie', flag: '🇮🇹', unit: 'kmh', limits: { city: 50, road: 90, expressway: 110, highway: 130 } },
  ES: { name: 'Espagne', flag: '🇪🇸', unit: 'kmh', limits: { city: 50, road: 90, expressway: 100, highway: 120 } },
  PT: { name: 'Portugal', flag: '🇵🇹', unit: 'kmh', limits: { city: 50, road: 90, expressway: 100, highway: 120 } },
  NL: { name: 'Pays-Bas', flag: '🇳🇱', unit: 'kmh', limits: { city: 50, road: 80, expressway: 100, highway: 100 } },
  GB: { name: 'Royaume-Uni', flag: '🇬🇧', unit: 'mph', limits: { city: 48, road: 96, expressway: 112, highway: 112 } },
  US: { name: 'USA', flag: '🇺🇸', unit: 'mph', limits: { city: 40, road: 89, expressway: 105, highway: 113 } },
  CA: { name: 'Canada', flag: '🇨🇦', unit: 'kmh', limits: { city: 50, road: 80, expressway: 100, highway: 110 } }
};

export function getCountry(code) { return COUNTRIES[code] || COUNTRIES.FR; }
