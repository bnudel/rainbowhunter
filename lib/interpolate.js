// lib/interpolate.js
// Inverse-distance-weighting sampler. Given scattered probability cells, returns
// a function sample(lat, lon) -> p that averages nearby points. This is what
// fills the space "between datapoints" so the heatmap reads as a continuous
// field instead of dots. Beyond ~1.7 grid spacings from any data it returns 0,
// so blobs fade out cleanly rather than bleeding across the whole map.

import { haversineKm, buildSpatialIndex } from "./geo.js";

export function makeSampler(cells, spacingKm = 14, { power = 2 } = {}) {
  const cellSizeDeg = Math.max(spacingKm, 1) / 111.32;
  const idx = buildSpatialIndex(cells, cellSizeDeg);
  const searchKm = spacingKm * 1.7;

  return function sample(lat, lon) {
    const near = idx.neighbors(lat, lon, 2);
    let wsum = 0;
    let vsum = 0;
    let hit = false;
    for (const it of near) {
      const d = haversineKm(lat, lon, it.lat, it.lon);
      if (d > searchKm) continue;
      hit = true;
      if (d < 0.05) return it.p; // sitting on a sample
      const w = 1 / Math.pow(d, power);
      wsum += w;
      vsum += w * it.p;
    }
    return hit && wsum > 0 ? vsum / wsum : 0;
  };
}
