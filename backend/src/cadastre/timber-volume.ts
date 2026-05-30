// Timber volume calculation module — Estonian standard table method (standardtabelid).
// All formulas applied per species element (puistuelement).

export interface TimberVolumeInput {
  areaM2: number;
  averageHeightM: number;
  boniteet?: 'I' | 'II' | 'III' | 'IV' | 'V';
  // Each entry: one species in one canopy layer with total tree count for that element.
  elements: Array<{ speciesCode: string; count: number }>;
}

export interface TimberVolumeElement {
  speciesCode: string;
  count: number;
  nPerHa: number;
  dbhCm: number;
  basalAreaPerTreeM2: number;
  standBasalAreaM2ha: number;
  g100: number;
  v100: number;
  rsd: number;
  volumePerHaM3: number;
  volumeTotalM3: number;
}

export interface TimberVolumeResult {
  areaHa: number;
  averageHeightM: number;
  boniteet: string;
  totalTreeCount: number;
  elements: TimberVolumeElement[];
  totalVolumePerHaM3: number;
  totalVolumeM3: number;
}

// ── Species DBH coefficients (Kiviste-style power eq, ForMIS/ENFRP calibration) ──
const SPECIES_COEFFS: Record<string, { a: number; b: number }> = {
  MA: { a: 1.10, b: 0.95 },
  KU: { a: 0.95, b: 0.98 },
  KS: { a: 1.05, b: 0.93 },
  LM: { a: 1.20, b: 0.90 },
  HB: { a: 1.15, b: 0.92 },
  LV: { a: 1.00, b: 0.88 },
  TM: { a: 0.85, b: 1.00 },
};
const DEFAULT_COEFFS = { a: 1.05, b: 0.92 };

// ── Boniteet (site index) multiplier applied to coefficient a ──
const BONITEET_MULT: Record<string, number> = {
  I: 1.10, II: 1.05, III: 1.00, IV: 0.94, V: 0.87,
};

// ── Standard tables: fully-stocked stand basal area and volume per height ──
// Each row: { h, g100 (m²/ha), v100 (m³/ha) }
const STANDARD_TABLE: Record<string, Array<{ h: number; g100: number; v100: number }>> = {
  MA: [
    { h: 8,  g100: 18, v100: 40  },
    { h: 12, g100: 22, v100: 90  },
    { h: 15, g100: 25, v100: 140 },
    { h: 18, g100: 27, v100: 190 },
    { h: 21, g100: 29, v100: 250 },
    { h: 24, g100: 30, v100: 310 },
    { h: 27, g100: 31, v100: 375 },
    { h: 30, g100: 32, v100: 440 },
  ],
  KU: [
    { h: 8,  g100: 20, v100: 50  },
    { h: 12, g100: 26, v100: 115 },
    { h: 15, g100: 30, v100: 175 },
    { h: 18, g100: 33, v100: 245 },
    { h: 21, g100: 35, v100: 320 },
    { h: 24, g100: 37, v100: 400 },
    { h: 27, g100: 38, v100: 480 },
    { h: 30, g100: 39, v100: 560 },
  ],
  KS: [
    { h: 8,  g100: 17, v100: 35  },
    { h: 12, g100: 22, v100: 85  },
    { h: 15, g100: 26, v100: 135 },
    { h: 18, g100: 29, v100: 190 },
    { h: 21, g100: 31, v100: 255 },
    { h: 24, g100: 33, v100: 320 },
    { h: 27, g100: 34, v100: 390 },
    { h: 30, g100: 35, v100: 460 },
  ],
  LM: [
    { h: 8,  g100: 18, v100: 38  },
    { h: 12, g100: 24, v100: 95  },
    { h: 15, g100: 28, v100: 150 },
    { h: 18, g100: 31, v100: 210 },
    { h: 21, g100: 33, v100: 275 },
    { h: 24, g100: 34, v100: 340 },
  ],
  HB: [
    { h: 8,  g100: 16, v100: 33  },
    { h: 12, g100: 22, v100: 88  },
    { h: 15, g100: 26, v100: 142 },
    { h: 18, g100: 29, v100: 200 },
    { h: 21, g100: 31, v100: 265 },
    { h: 24, g100: 33, v100: 330 },
  ],
  LV: [
    { h: 6,  g100: 15, v100: 28  },
    { h: 8,  g100: 17, v100: 45  },
    { h: 12, g100: 21, v100: 95  },
    { h: 15, g100: 24, v100: 140 },
  ],
};

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

// Step 1 — Estimate DBH (cm) from height and site index.
export function estimateDBH(
  speciesCode: string,
  heightM: number,
  boniteet: string,
): number {
  const { a, b } = SPECIES_COEFFS[speciesCode] ?? DEFAULT_COEFFS;
  const mult = BONITEET_MULT[boniteet] ?? 1.00;
  return a * mult * Math.pow(heightM, b);
}

// Steps 2 — Basal area per tree (m²) and stand basal area (m²/ha).
export function computeBasalAreas(
  dbhCm: number,
  nPerHa: number,
): { basalAreaPerTreeM2: number; standBasalAreaM2ha: number } {
  const dM = dbhCm / 100;
  const basalAreaPerTreeM2 = (Math.PI / 4) * dM * dM;
  return { basalAreaPerTreeM2, standBasalAreaM2ha: basalAreaPerTreeM2 * nPerHa };
}

// Step 3 — Lookup G_100 and V_100 from standard table, interpolating linearly.
// Falls back to KS (silver birch / other deciduous) if species not in table.
export function lookupStandardTable(
  speciesCode: string,
  heightM: number,
): { g100: number; v100: number } {
  const rows = STANDARD_TABLE[speciesCode] ?? STANDARD_TABLE['KS'];

  if (heightM <= rows[0].h) return { g100: rows[0].g100, v100: rows[0].v100 };
  const last = rows[rows.length - 1];
  if (heightM >= last.h) return { g100: last.g100, v100: last.v100 };

  for (let i = 0; i < rows.length - 1; i++) {
    if (heightM >= rows[i].h && heightM <= rows[i + 1].h) {
      const t = (heightM - rows[i].h) / (rows[i + 1].h - rows[i].h);
      return {
        g100: lerp(t, rows[i].g100, rows[i + 1].g100),
        v100: lerp(t, rows[i].v100, rows[i + 1].v100),
      };
    }
  }

  return { g100: last.g100, v100: last.v100 };
}

// Step 4 — Relative stand density, clamped to [0.0, 1.3].
export function computeRSD(standBasalAreaM2ha: number, g100: number): number {
  const rsd = g100 > 0 ? standBasalAreaM2ha / g100 : 0;
  return Math.min(1.3, Math.max(0, rsd));
}

// Steps 5 & 6 — Volume per hectare and total parcel volume.
export function computeVolumes(
  rsd: number,
  v100: number,
  areaHa: number,
): { volumePerHaM3: number; volumeTotalM3: number } {
  const volumePerHaM3 = rsd * v100;
  return { volumePerHaM3, volumeTotalM3: volumePerHaM3 * areaHa };
}

// Full pipeline — runs all steps for each species element and returns a summary.
export function calculateTimberVolume(input: TimberVolumeInput): TimberVolumeResult {
  const areaHa = input.areaM2 / 10000;
  const boniteet = input.boniteet ?? 'III';
  const H = input.averageHeightM;

  const elements: TimberVolumeElement[] = input.elements.map((el) => {
    const nPerHa = areaHa > 0 ? el.count / areaHa : 0;

    const dbhCm = estimateDBH(el.speciesCode, H, boniteet);
    const { basalAreaPerTreeM2, standBasalAreaM2ha } = computeBasalAreas(dbhCm, nPerHa);
    const { g100, v100 } = lookupStandardTable(el.speciesCode, H);
    const rsd = computeRSD(standBasalAreaM2ha, g100);
    const { volumePerHaM3, volumeTotalM3 } = computeVolumes(rsd, v100, areaHa);

    return {
      speciesCode: el.speciesCode,
      count: el.count,
      nPerHa,
      dbhCm,
      basalAreaPerTreeM2,
      standBasalAreaM2ha,
      g100,
      v100,
      rsd,
      volumePerHaM3,
      volumeTotalM3,
    };
  });

  const totalVolumePerHaM3 = elements.reduce((s, e) => s + e.volumePerHaM3, 0);
  const totalVolumeM3 = elements.reduce((s, e) => s + e.volumeTotalM3, 0);

  return {
    areaHa,
    averageHeightM: H,
    boniteet,
    totalTreeCount: input.elements.reduce((s, e) => s + e.count, 0),
    elements,
    totalVolumePerHaM3,
    totalVolumeM3,
  };
}
