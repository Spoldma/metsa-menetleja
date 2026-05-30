import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';

export interface SpeciesRatios {
  conifer: number;
  broadleaf: number;
  land: number;
  pixelCount: number;
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');

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

// Natural-colour RGB orthophoto.
// Conifers: dark to medium green (H 85–165°, low-mid L).
// Broadleaf: bright yellow-green or autumn yellow/orange.
function classify(r: number, g: number, b: number): 'conifer' | 'broadleaf' | 'land' {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (h >= 85 && h <= 165 && s > 0.08 && l < 0.58) return 'conifer';
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

      const { data, info } = await sharp(filePath, { limitInputPixels: false })
        .resize(gridW, gridH, { fit: 'fill', kernel: 'nearest' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const totalPixels = info.width * info.height;
      const CH = 4;

      let coniferCount = 0, broadleafCount = 0;

      for (let i = 0; i < totalPixels; i++) {
        const r = data[i * CH];
        const g = data[i * CH + 1];
        const b = data[i * CH + 2];
        const a = data[i * CH + 3];

        if (a < 128 || (r < 8 && g < 8 && b < 8)) continue;

        const cls = classify(r, g, b);
        if (cls === 'conifer') coniferCount++;
        else if (cls === 'broadleaf') broadleafCount++;
      }

      const treePx = coniferCount + broadleafCount;
      if (treePx === 0) return { conifer: 0, broadleaf: 0, land: 0, pixelCount: 0 };

      return {
        conifer: coniferCount / treePx,
        broadleaf: broadleafCount / treePx,
        land: 0,
        pixelCount: treePx,
      };
    } catch {
      return { conifer: 0, broadleaf: 0, land: 0, pixelCount: 0 };
    }
  }
}
