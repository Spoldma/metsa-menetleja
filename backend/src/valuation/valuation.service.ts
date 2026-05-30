import { Injectable } from '@nestjs/common';
import axios from 'axios';

// ─── Public API endpoints (verified 2026-05-30) ───────────────────────────────
// POST https://hindamine.kataster.ee/api/x-road/mkhis-detailed  → taxable value
// GET  https://kolvikud.kataster.ee/api/cadastre-unit/find      → land-use + geometry
// WFS  https://gsavalik.envir.ee/geoserver/wfs                  → restrictions
// All three are public tier, no auth / X-tee required.
//
// Transaction statistics (kinnisvara tehingute andmebaas) have no queryable API —
// maaamet.ee/kinnisvara/htraru provides a web-only query UI.  The REGIONAL_PRICES
// table below is compiled from published Maa-amet annual statistics (reference year 2023).
// Update it from https://www.maaamet.ee/kinnisvara/htraru/ when newer data is available.

const MKHIS_URL = 'https://hindamine.kataster.ee/api/x-road/mkhis-detailed';
const KOLVIKUD_URL = 'https://kolvikud.kataster.ee/api/cadastre-unit/find';
const WFS_URL = 'https://gsavalik.envir.ee/geoserver/wfs';

// Static regional bare-land price table — forest land (metsamaa), EUR/ha.
// Source: Maa-amet kinnisvara tehingute andmebaas, reference year 2023.
// Prices exclude standing-timber value; they represent bare-land component only.
// Low = ~25th percentile, high = ~75th percentile for arm's-length transactions.
const FOREST_PRICES_EUR_PER_HA: Record<string, { low: number; high: number }> = {
  'Harju maakond':      { low: 4500, high: 9000 },
  'Hiiu maakond':       { low: 2000, high: 4500 },
  'Ida-Viru maakond':   { low: 2000, high: 5000 },
  'Järva maakond':      { low: 3500, high: 7500 },
  'Jõgeva maakond':     { low: 3000, high: 6500 },
  'Lääne maakond':      { low: 2500, high: 5500 },
  'Lääne-Viru maakond': { low: 3000, high: 6500 },
  'Pärnu maakond':      { low: 2500, high: 6000 },
  'Põlva maakond':      { low: 4000, high: 8000 },
  'Rapla maakond':      { low: 3500, high: 7000 },
  'Saare maakond':      { low: 2500, high: 5500 },
  'Tartu maakond':      { low: 4000, high: 8500 },
  'Valga maakond':      { low: 3000, high: 7000 },
  'Viljandi maakond':   { low: 3500, high: 7000 },
  'Võru maakond':       { low: 4000, high: 8000 },
};

// Grassland and agricultural bare-land prices, EUR/ha (same source/year).
const AGRI_PRICES_EUR_PER_HA: Record<string, { low: number; high: number }> = {
  'Harju maakond':      { low: 8000, high: 15000 },
  'Hiiu maakond':       { low: 3000, high:  7000 },
  'Ida-Viru maakond':   { low: 3000, high:  7000 },
  'Järva maakond':      { low: 5000, high: 10000 },
  'Jõgeva maakond':     { low: 5000, high: 10000 },
  'Lääne maakond':      { low: 4000, high:  8000 },
  'Lääne-Viru maakond': { low: 5000, high: 10000 },
  'Pärnu maakond':      { low: 4000, high:  9000 },
  'Põlva maakond':      { low: 5000, high: 10000 },
  'Rapla maakond':      { low: 5000, high: 10000 },
  'Saare maakond':      { low: 3500, high:  7000 },
  'Tartu maakond':      { low: 6000, high: 12000 },
  'Valga maakond':      { low: 4000, high:  8000 },
  'Viljandi maakond':   { low: 5000, high: 10000 },
  'Võru maakond':       { low: 5000, high: 10000 },
};

// Grassland uses ~60 % of agricultural price (typical ratio from published data).
const GRASSLAND_RATIO = 0.6;

// ─── Response types ───────────────────────────────────────────────────────────

export interface LandUseBreakdown {
  typeCode: string;
  typeName: string;
  areaM2: number;
  areaHa: number;
  pctOfTotal: number;
}

export interface TaxableValueEstimate {
  totalEur: number;
  eurPerHa: number;
  assessedDate: string;
  valuationYear: number;
  note: string;
}

export interface MarketEstimate {
  primaryLandUse: string;
  primaryAreaHa: number;
  regionalAvgLowEurPerHa: number;
  regionalAvgHighEurPerHa: number;
  totalLowEur: number;
  totalHighEur: number;
  dataYear: number;
  dataSource: string;
  note: string;
}

export interface ValuationResult {
  cadastreId: string;
  address: string;
  areaM2: number;
  areaHa: number;
  county: string;
  municipality: string;
  intendedPurpose: string;
  landUseBreakdown: LandUseBreakdown[];
  restrictions: string[];

  option1_taxable: TaxableValueEstimate;
  option2_market: MarketEstimate;

  valueRangeEur: {
    floorEur: number;
    marketLowEur: number;
    marketHighEur: number;
    note: string;
  };
}

// ─── External API shapes ──────────────────────────────────────────────────────

interface MkhisResponse {
  status: string;
  message: string;
  data: {
    cadastralUnit: {
      area: number;
      assessmentTime: string;
      cadastreId: string;
      municipalCode2023: string;
      validFrom: string;
      validUntil: string | null;
      validValue: number;
    };
    calculation: {
      year: number;
      usageCode: string;
      usagePercent: number;
      habitatCode: number | null;
      area: number;
      unitValue: number;
      partValue: number;
    }[];
  };
}

interface KolvikudItem {
  id: number;
  code: string;
  address: {
    shortAddress: string;
    adsLevel1: string;
    adsLevel2: string;
    adsLevel3: string;
  };
  area: number;
  intendedPurposes: { purpose: string; percent: number }[];
  landParcelSummary: {
    id: number | null;
    type: { code: string; name: string };
    computedArea: number;
  }[];
  geometry: string;
}

@Injectable()
export class ValuationService {
  async estimate(cadastreId: string): Promise<ValuationResult> {
    const today = new Date().toISOString().slice(0, 10);

    const [mkhisData, kolvikudItem] = await Promise.all([
      this.fetchMkhis(cadastreId),
      this.fetchKolvikud(cadastreId, today),
    ]);

    const cu = mkhisData.data.cadastralUnit;
    const areaM2 = cu.area;
    const areaHa = areaM2 / 10000;

    const county = kolvikudItem.address.adsLevel1 ?? '';
    const municipality = kolvikudItem.address.adsLevel2 ?? '';
    const intendedPurpose =
      kolvikudItem.intendedPurposes.map((p) => p.purpose).join(', ') || 'Määramata';

    const landUseBreakdown: LandUseBreakdown[] = kolvikudItem.landParcelSummary
      .filter((p) => p.computedArea > 0)
      .map((p) => ({
        typeCode: p.type.code,
        typeName: p.type.name,
        areaM2: p.computedArea,
        areaHa: p.computedArea / 10000,
        pctOfTotal: areaM2 > 0 ? (p.computedArea / areaM2) * 100 : 0,
      }));

    const centroid = this.computeCentroid(kolvikudItem.geometry);
    const restrictions = await this.fetchRestrictions(centroid, areaM2);

    // Option 1 — official taxable value
    const valuationYear = mkhisData.data.calculation[0]?.year ?? 0;
    const option1_taxable: TaxableValueEstimate = {
      totalEur: cu.validValue,
      eurPerHa: areaHa > 0 ? Math.round(cu.validValue / areaHa) : 0,
      assessedDate: cu.validFrom,
      valuationYear,
      note:
        'Maa maksustamishind (mass-hindamise tulemus). ' +
        'Peegeldab maksubaasi, mitte turuväärtust — tegelik turuhind on üldjuhul kõrgem.',
    };

    // Option 2 — regional market estimate
    const option2_market = this.buildMarketEstimate(landUseBreakdown, county, areaHa);

    return {
      cadastreId,
      address: kolvikudItem.address.shortAddress,
      areaM2,
      areaHa: Math.round(areaHa * 100) / 100,
      county,
      municipality,
      intendedPurpose,
      landUseBreakdown,
      restrictions,

      option1_taxable,
      option2_market,

      valueRangeEur: {
        floorEur: cu.validValue,
        marketLowEur: option2_market.totalLowEur,
        marketHighEur: option2_market.totalHighEur,
        note:
          'Alumine piir = maa maksustamishind (1. meetod). ' +
          'Vahemik = piirkondlik turuhinnastatistika (2. meetod). ' +
          'Kaks meetodit on üksteisest sõltumatud.',
      },
    };
  }

  private async fetchMkhis(cadastreId: string): Promise<MkhisResponse> {
    const res = await axios.post<MkhisResponse>(
      MKHIS_URL,
      { cadastreId },
      { timeout: 15000 },
    );
    if (res.data.status !== 'OK') {
      throw new Error(`MKHIS API viga: ${res.data.message}`);
    }
    if (!res.data.data?.cadastralUnit) {
      throw new Error(`MKHIS: katastriüksust ei leitud (${cadastreId})`);
    }
    return res.data;
  }

  private async fetchKolvikud(cadastreId: string, date: string): Promise<KolvikudItem> {
    const url = `${KOLVIKUD_URL}?date=${date}&code=${encodeURIComponent(cadastreId)}`;
    const res = await axios.get<KolvikudItem[]>(url, { timeout: 15000 });
    if (!res.data?.length) {
      throw new Error(`Kolvikud API: katastriüksust ei leitud (${cadastreId})`);
    }
    return res.data[0];
  }

  private computeCentroid(geometryJson: string): { x: number; y: number } {
    let ring: number[][];
    try {
      const geom = JSON.parse(geometryJson) as { type: string; coordinates: number[][][] };
      ring = geom.coordinates[0];
    } catch {
      return { x: 0, y: 0 };
    }
    const n = ring.length;
    const x = ring.reduce((s, c) => s + c[0], 0) / n;
    const y = ring.reduce((s, c) => s + c[1], 0) / n;
    return { x, y };
  }

  // Query nature-protection and planning restriction layers.
  // Uses public kpokitsendused WFS (sensitive cat. I–II filtered per KPOIS spec).
  private async fetchRestrictions(
    centroid: { x: number; y: number },
    areaM2: number,
  ): Promise<string[]> {
    if (centroid.x === 0 && centroid.y === 0) return [];

    // Buffer radius: sqrt(area/π), minimum 100 m
    const radius = Math.max(100, Math.sqrt(areaM2 / Math.PI));
    const bbox = [
      centroid.x - radius, centroid.y - radius,
      centroid.x + radius, centroid.y + radius,
    ].join(',');
    const srs = 'EPSG:3301';

    const layers = [
      { name: 'kpokitsendused:kpo_avalik_looduskaitse', label: 'Looduskaitse' },
      { name: 'kpokitsendused:kpo_avalik_muinsuskaitse', label: 'Muinsuskaitse' },
      { name: 'kpokitsendused:kpo_avalik_planeering', label: 'Planeering' },
    ];

    const found = new Set<string>();

    await Promise.allSettled(
      layers.map(async ({ name, label }) => {
        const url =
          `${WFS_URL}?service=WFS&version=2.0.0&request=GetFeature` +
          `&typeNames=${encodeURIComponent(name)}` +
          `&outputFormat=application/json` +
          `&bbox=${bbox},${srs}&count=1`;
        const res = await axios.get<{ totalFeatures: number }>(url, { timeout: 10000 });
        if ((res.data.totalFeatures ?? 0) > 0) found.add(label);
      }),
    );

    return [...found];
  }

  private buildMarketEstimate(
    breakdown: LandUseBreakdown[],
    county: string,
    totalHa: number,
  ): MarketEstimate {
    // Dominant bare-land type for pricing: forest > agri > grassland > other
    const priority = ['forest', 'agri', 'grassland', 'other', 'yard'];
    const sorted = [...breakdown].sort(
      (a, b) => priority.indexOf(a.typeCode) - priority.indexOf(b.typeCode),
    );
    const primary = sorted[0];

    const primaryCode = primary?.typeCode ?? 'forest';
    const primaryName = primary?.typeName ?? 'Metsamaa';
    const primaryHa = primary?.areaHa ?? totalHa;

    const { low, high } = this.lookupPrice(primaryCode, county);

    return {
      primaryLandUse: primaryName,
      primaryAreaHa: Math.round(primaryHa * 100) / 100,
      regionalAvgLowEurPerHa: low,
      regionalAvgHighEurPerHa: high,
      totalLowEur: Math.round(primaryHa * low),
      totalHighEur: Math.round(primaryHa * high),
      dataYear: 2023,
      dataSource:
        'Maa-amet kinnisvara tehingute andmebaas (htraru), maakonna keskmine, ' +
        'metsamaa puidu väärtuseta (ainult maapinna komponent)',
      note:
        'Piirkondlik resolutsioon, mitte katastriüksuse-spetsiifiline. ' +
        'Sisaldab ainult maapinna väärtust — puidu väärtus ei ole arvestatud.',
    };
  }

  private lookupPrice(
    typeCode: string,
    county: string,
  ): { low: number; high: number } {
    const countyKey = county || 'Tartu maakond';

    if (typeCode === 'forest') {
      return (
        FOREST_PRICES_EUR_PER_HA[countyKey] ??
        FOREST_PRICES_EUR_PER_HA['Tartu maakond']
      );
    }
    if (typeCode === 'agri') {
      return (
        AGRI_PRICES_EUR_PER_HA[countyKey] ??
        AGRI_PRICES_EUR_PER_HA['Tartu maakond']
      );
    }
    if (typeCode === 'grassland') {
      const agri =
        AGRI_PRICES_EUR_PER_HA[countyKey] ??
        AGRI_PRICES_EUR_PER_HA['Tartu maakond'];
      return {
        low: Math.round(agri.low * GRASSLAND_RATIO),
        high: Math.round(agri.high * GRASSLAND_RATIO),
      };
    }
    // yard / other / unknown — fall back to forest prices as a floor
    return (
      FOREST_PRICES_EUR_PER_HA[countyKey] ??
      FOREST_PRICES_EUR_PER_HA['Tartu maakond']
    );
  }
}
