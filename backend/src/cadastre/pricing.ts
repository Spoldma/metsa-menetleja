// Forest standing timber valuation — RMK 2026 I price list.
// Prices are looked up from rmk_2026_I_prices.json at the project root.
// For conifers (MA, KU) the diameter-class price is used when available.
// For all other species the primary assortment weighted average is used.

import * as fs from 'fs';
import * as path from 'path';
import type { TimberVolumeElement, TimberVolumeResult } from './timber-volume.js';

export interface SpeciesPriceBreakdown {
  speciesCode: string;
  assortment: string;
  pricePerM3: number;
  volumeM3: number;
  totalEur: number;
}

export interface ForestValueResult {
  source: string;
  period: string;
  elements: SpeciesPriceBreakdown[];
  totalEur: number;
}

interface PriceData {
  meta: { source: string; period: string };
  species_prices: Record<string, {
    primary_assortment: {
      sortiment: string;
      weighted_avg_price_eur_m3: number;
      price_by_diameter_class_cm?: Record<string, number>;
    };
  }>;
}

function loadPrices(): PriceData {
  const jsonPath = path.join(process.cwd(), '..', 'rmk_2026_I_prices.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(raw) as PriceData;
}

// Resolve the diameter-class price bracket for a given DBH (cm).
function diameterClassPrice(
  dbhCm: number,
  priceByClass: Record<string, number>,
): number {
  const brackets: Array<[number, string]> = [
    [8,  '5.0-7.9'],
    [10, '8.0-9.9'],
    [13, '10.0-12.9'],
    [18, '13.0-17.9'],
    [25, '18.0-24.9'],
    [32, '25.0-31.9'],
  ];
  for (const [upper, key] of brackets) {
    if (dbhCm < upper) return priceByClass[key] ?? 0;
  }
  return priceByClass['32.0+'] ?? 0;
}

function priceForElement(
  el: TimberVolumeElement,
  prices: PriceData,
): { assortment: string; pricePerM3: number } {
  const sp = prices.species_prices[el.speciesCode];
  if (!sp) {
    return { assortment: 'Küttepuit', pricePerM3: 43.3 };
  }

  const primary = sp.primary_assortment;
  let pricePerM3 = primary.weighted_avg_price_eur_m3;

  // Use per-diameter-class price when available (MA and KU)
  if (primary.price_by_diameter_class_cm) {
    pricePerM3 = diameterClassPrice(el.dbhCm, primary.price_by_diameter_class_cm);
  }

  return { assortment: primary.sortiment, pricePerM3 };
}

export function calculateForestValue(timberVolume: TimberVolumeResult): ForestValueResult {
  const prices = loadPrices();

  const elements: SpeciesPriceBreakdown[] = timberVolume.elements.map((el) => {
    const { assortment, pricePerM3 } = priceForElement(el, prices);
    return {
      speciesCode: el.speciesCode,
      assortment,
      pricePerM3,
      volumeM3: el.volumeTotalM3,
      totalEur: el.volumeTotalM3 * pricePerM3,
    };
  });

  return {
    source: prices.meta.source,
    period: prices.meta.period,
    elements,
    totalEur: elements.reduce((s, e) => s + e.totalEur, 0),
  };
}
