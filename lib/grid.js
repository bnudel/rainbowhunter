// lib/grid.js
import { haversineKm } from "./geo.js";

// Build a roughly-even lat/lon grid covering a disc of `radiusKm` around center,
// spaced ~`spacingKm` apart. Returns [{ lat, lon }].
export function buildGrid(centerLat, centerLon, radiusKm, spacingKm) {
  const latStep = spacingKm / 111.32; // deg per km (lat)
  const lonStep = spacingKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));

  const nLat = Math.ceil(radiusKm / spacingKm);
  const nLon = Math.ceil(radiusKm / spacingKm);

  const cells = [];
  for (let i = -nLat; i <= nLat; i++) {
    for (let j = -nLon; j <= nLon; j++) {
      const lat = centerLat + i * latStep;
      const lon = centerLon + j * lonStep;
      if (lat < -89 || lat > 89) continue;
      if (haversineKm(centerLat, centerLon, lat, lon) <= radiusKm) {
        cells.push({ lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
      }
    }
  }
  return cells;
}
