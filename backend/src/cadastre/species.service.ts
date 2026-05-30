import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';

export interface SpeciesRatios {
  conifer: number;
  broadleaf: number;
  land: number;
  pixelCount: number;
  debug?: string;
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');

// Max grid dimension — never upsamples
const MAX_GRID = 128;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h * 360, s, l];
}

// Natural-colour RGB orthophoto (the WMS renders cir_ngr as a standard-looking colour image).
// Conifers: dark, saturated blue-green (H 100–155°, low L).
// Broadleaf: lighter yellow-green or mid-green (H 55–110°, higher L) — also yellow/orange in autumn.
// Land: everything else (soil, road, water, buildings).
function classify(r: number, g: number, b: number): 'conifer' | 'broadleaf' | 'land' {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Conifer: dark to medium green — checked first so it claims the lighter greens before broadleaf
  if (h >= 85 && h <= 165 && s > 0.08 && l < 0.58) return 'conifer';

  // Broadleaf: bright yellow-green or autumn yellow/orange (only clearly bright, not light-green)
  if (h >= 55 && h <= 110 && s > 0.15 && l >= 0.52) return 'broadleaf';
  if (h >= 20 && h <= 60 && s > 0.20 && l >= 0.38) return 'broadleaf';

  return 'land';
}

@Injectable()
export class SpeciesService {
  async analyzeSpecies(filename: string): Promise<SpeciesRatios> {
    const safe = path.basename(filename);
    const filePath = path.join(OUTPUT_DIR, safe);

    try {
      const meta = await sharp(filePath, { limitInputPixels: false }).metadata();
      const origW = meta.width ?? 256;
      const origH = meta.height ?? 256;
      const scale = Math.min(1, MAX_GRID / Math.max(origW, origH));
      const gridW = Math.max(1, Math.round(origW * scale));
      const gridH = Math.max(1, Math.round(origH * scale));
      const hasAlpha = (meta.channels ?? 3) === 4;

      console.log(`[SpeciesService] ${safe}: ${origW}×${origH} ${meta.channels}ch ${meta.format} → grid ${gridW}×${gridH} alphaMode=${hasAlpha}`);

      // Read as RGBA always — gives us the alpha channel for masking on CIR PNGs
      const { data, info } = await sharp(filePath, { limitInputPixels: false })
        .resize(gridW, gridH, { fit: 'fill', kernel: 'nearest' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const totalPixels = info.width * info.height;
      // ensureAlpha always gives 4 channels
      const CH = 4;

      let coniferCount = 0, broadleafCount = 0, landCount = 0, maskedCount = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      const hBuckets = new Array<number>(36).fill(0);

      for (let i = 0; i < totalPixels; i++) {
        const r = data[i * CH];
        const g = data[i * CH + 1];
        const b = data[i * CH + 2];
        const a = data[i * CH + 3];

        // Alpha < 128 = outside cadastre polygon (transparent PNG mask)
        // Also skip near-black pixels as fallback for non-alpha sources
        if (a < 128 || (r < 8 && g < 8 && b < 8)) { maskedCount++; continue; }

        sumR += r; sumG += g; sumB += b;
        const [h] = rgbToHsl(r, g, b);
        hBuckets[Math.min(35, Math.floor(h / 10))]++;

        const cls = classify(r, g, b);
        if (cls === 'conifer') coniferCount++;
        else if (cls === 'broadleaf') broadleafCount++;
        else landCount++;
      }

      const nonMasked = totalPixels - maskedCount;

      if (nonMasked === 0) {
        console.log('[SpeciesService] all pixels masked — no data inside polygon');
        return { conifer: 0, broadleaf: 0, land: 1, pixelCount: 0, debug: 'all masked' };
      }

      const avgR = (sumR / nonMasked).toFixed(0);
      const avgG = (sumG / nonMasked).toFixed(0);
      const avgB = (sumB / nonMasked).toFixed(0);
      const topBuckets = hBuckets
        .map((count, i) => ({ range: `${i * 10}–${i * 10 + 10}°`, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map(b => `${b.range}:${b.count}`)
        .join(' ');

      console.log(`[SpeciesService] avgRGB=(${avgR},${avgG},${avgB}) masked=${maskedCount} nonMasked=${nonMasked}`);
      console.log(`[SpeciesService] top hue buckets: ${topBuckets}`);
      console.log(`[SpeciesService] conifer=${coniferCount} broadleaf=${broadleafCount} land=${landCount}`);

      // Ratios are relative to tree pixels only — conifer + broadleaf = 100%
      const treePx = coniferCount + broadleafCount;
      if (treePx === 0) {
        return { conifer: 0, broadleaf: 0, land: 0, pixelCount: 0, debug: `no trees detected. avg(${avgR},${avgG},${avgB}) hue:${topBuckets}` };
      }

      return {
        conifer: coniferCount / treePx,
        broadleaf: broadleafCount / treePx,
        land: 0,
        pixelCount: treePx,
        debug: `avg(${avgR},${avgG},${avgB}) hue:${topBuckets}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SpeciesService] ERROR for ${safe}:`, msg);
      return { conifer: 0, broadleaf: 0, land: 1, pixelCount: 0, debug: `error: ${msg}` };
    }
  }
}
