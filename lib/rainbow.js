// lib/rainbow.js
//
// The science of "where do I stand to SEE a rainbow".
// -----------------------------------------------------------------------------
// A rainbow is observer-centric. It appears as a 42deg-radius cone centred on the
// antisolar point (the shadow of your own head, directly opposite the sun).
// To see one you need, simultaneously:
//   1. The sun BEHIND you and LOW: its altitude must be between 0 and ~42deg.
//      Above 42deg the whole bow sits below the horizon (unless you're elevated).
//      The lower the sun, the taller and fuller the bow -> best near sunrise/sunset.
//   2. RAIN in front of you, in the antisolar direction, ~42deg off the antisolar
//      axis. We sample precipitation along the antisolar compass bearing.
//   3. DIRECT SUNLIGHT reaching you and those drops -> you must be in the clear,
//      i.e. low cloud cover overhead. The sweet spot is the sunlit EDGE of a
//      passing shower, which is exactly what this model lights up.
//
// So the heatmap value at a cell = probability that a person STANDING there can
// see a bow at the chosen time. It is NOT "where the rainbow is" (a rainbow has
// no single location -- every observer gets their own).
//
// Sources: the 42deg "rainbow angle" / antisolar geometry is standard atmospheric
// optics (Descartes ray, minimum deviation 138deg -> 180-138 = 42deg).
// -----------------------------------------------------------------------------

import SunCalc from "suncalc";
import { toDeg, destinationPoint, haversineKm, buildSpatialIndex } from "./geo.js";

export const PRIMARY_BOW_ALT_LIMIT = 42; // deg; sun higher than this => no ground bow

// Distances (km) out along the antisolar bearing at which we look for rain.
// A shower a few km away is the classic case; drops can be near or far.
const RAIN_SAMPLE_DISTANCES_KM = [4, 8, 16, 24];

const SHOWER_CODES = new Set([80, 81, 82]); // WMO rain-shower codes (convective)
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

// --- Sun geometry -----------------------------------------------------------
// SunCalc azimuth is measured from SOUTH, positive toward WEST.
// Convert to a compass bearing (0 = N, 90 = E, 180 = S, 270 = W).
export function sunPosition(date, lat, lon) {
  const p = SunCalc.getPosition(date, lat, lon);
  const altDeg = toDeg(p.altitude);
  const compass = (toDeg(p.azimuth) + 180 + 360) % 360;
  return { altDeg, azimuthDeg: compass };
}

// --- Individual factors (all return 0..1) -----------------------------------

// Favours a low sun (fuller, taller bow) but knocks down the dim moments right at
// the horizon. Zero outside the visible window (0 .. 42deg).
export function sunFactor(altDeg) {
  if (altDeg <= 0 || altDeg >= PRIMARY_BOW_ALT_LIMIT) return 0;
  const bowVisibility = (PRIMARY_BOW_ALT_LIMIT - altDeg) / PRIMARY_BOW_ALT_LIMIT; // 1 -> 0
  const brightness = Math.min(altDeg / 5, 1); // dim at 0deg, full by ~5deg
  return bowVisibility * (0.4 + 0.6 * brightness);
}

// Active or likely precipitation in the antisolar direction.
export function rainFactor(precipMm, precipProbPct, weatherCode) {
  const amt = Math.min((precipMm || 0) / 2.0, 1); // ~2 mm/h saturates
  const prob = Math.min((precipProbPct || 0) / 100, 1);
  let base = Math.max(amt, 0.6 * prob);
  if (SHOWER_CODES.has(weatherCode)) base *= 1.15; // convective showers are ideal
  else if (weatherCode != null && !RAIN_CODES.has(weatherCode)) base *= 0.9;
  return Math.max(0, Math.min(base, 1));
}

// The observer needs direct sun -> low cloud overhead is the deal-breaker.
// High/mid cloud still lets enough sun through to light the drops.
export function sunlightFactor(cloudTotalPct, cloudLowPct) {
  const low = (cloudLowPct ?? cloudTotalPct ?? 0) / 100;
  const total = (cloudTotalPct ?? 0) / 100;
  const f = (1 - low) * (0.5 + 0.5 * (1 - total));
  return Math.max(0, Math.min(f, 1));
}

// --- Weather series access --------------------------------------------------
// Each cell carries an Open-Meteo hourly object with a unix `time` array.
export function indexForTime(timeArr, targetUnix) {
  if (!timeArr || timeArr.length === 0) return -1;
  // assume hourly & sorted; nearest within 30 min
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < timeArr.length; i++) {
    const diff = Math.abs(timeArr[i] - targetUnix);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return bestDiff <= 1800 ? best : -1;
}

function readCellAt(cell, targetUnix) {
  const h = cell.hourly;
  if (!h) return null;
  const i = indexForTime(h.time, targetUnix);
  if (i < 0) return null;
  return {
    precip: h.precipitation?.[i] ?? 0,
    precipProb: h.precipitation_probability?.[i] ?? null,
    cloud: h.cloud_cover?.[i] ?? null,
    cloudLow: h.cloud_cover_low?.[i] ?? null,
    code: h.weather_code?.[i] ?? null,
  };
}

// --- Nearest-cell lookup ----------------------------------------------------
// Spatial index keeps this O(1)-ish even with thousands of cached cells.
export function makeLookup(cells, spacingKm = 14) {
  const cellSizeDeg = Math.max(spacingKm, 1) / 111.32;
  const idx = buildSpatialIndex(cells, cellSizeDeg);
  return function nearest(lat, lon, maxKm = 20) {
    return idx.nearest(lat, lon, maxKm, 2);
  };
}

// --- Main: probability that an observer at this cell sees a bow -------------
export function probabilityForCell(cell, lookup, date, targetUnix) {
  const { altDeg, azimuthDeg } = sunPosition(date, cell.lat, cell.lon);
  const antiBearing = (azimuthDeg + 180) % 360;
  const base = { sunAltDeg: altDeg, sunAzDeg: azimuthDeg, antiBearingDeg: antiBearing };

  const sF = sunFactor(altDeg);
  if (sF === 0) return { p: 0, sun: 0, rain: 0, light: 0, ...base };

  // Sunlight on the observer (clear sky overhead).
  const here = readCellAt(cell, targetUnix);
  const lF = sunlightFactor(here?.cloud, here?.cloudLow);
  if (lF === 0) return { p: 0, sun: sF, rain: 0, light: 0, ...base };

  // Look for rain in the antisolar direction (opposite the sun's compass bearing).
  let bestRain = 0;
  for (const dKm of RAIN_SAMPLE_DISTANCES_KM) {
    const pt = destinationPoint(cell.lat, cell.lon, antiBearing, dKm);
    const rc = lookup(pt.lat, pt.lon);
    if (!rc) continue;
    const w = readCellAt(rc, targetUnix);
    if (!w) continue;
    const rf = rainFactor(w.precip, w.precipProb, w.code);
    if (rf > bestRain) bestRain = rf;
  }

  const p = sF * bestRain * lF;
  return { p, sun: sF, rain: bestRain, light: lF, ...base };
}

// Probability of this cell across a set of hour offsets (for the sparkline).
// Returns { series:[p...], peak, peakOffset }.
export function probabilitySeries(cell, lookup, baseUnix, offsets) {
  const series = [];
  let peak = 0;
  let peakOffset = offsets[0];
  for (const off of offsets) {
    const targetUnix = baseUnix + off * 3600;
    const date = new Date(targetUnix * 1000);
    const r = probabilityForCell(cell, lookup, date, targetUnix);
    series.push(+r.p.toFixed(3));
    if (r.p > peak) {
      peak = r.p;
      peakOffset = off;
    }
  }
  return { series, peak, peakOffset };
}
