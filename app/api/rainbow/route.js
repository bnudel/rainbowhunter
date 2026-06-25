// app/api/rainbow/route.js
import { NextResponse } from "next/server";
import { buildGrid } from "../../../lib/grid.js";
import { getWeatherForGrid } from "../../../lib/weather.js";
import { getCellsInBox, dbInfo } from "../../../lib/db.js";
import { makeLookup, probabilityForCell, probabilitySeries } from "../../../lib/rainbow.js";
import { haversineKm } from "../../../lib/geo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MILES_TO_KM = 1.60934;
const SPACING_KM = Number(process.env.GRID_SPACING_KM || 14);
const OFFSETS = Array.from({ length: 17 }, (_, i) => i - 8); // -8 .. +8
const HOT = 0.05; // a cell earns a sparkline/tooltip if it gets this hot now

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lon = parseFloat(searchParams.get("lon"));
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const radiusMi = Math.min(parseFloat(searchParams.get("radius") || "100"), 150);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }

  const radiusKm = radiusMi * MILES_TO_KM;
  const clamped = Math.max(-8, Math.min(8, offset));
  const nowUnix = Math.floor(Date.now() / 1000);
  const baseUnix = Math.floor(nowUnix / 3600) * 3600;
  const targetUnix = baseUnix + clamped * 3600;
  const date = new Date(targetUnix * 1000);

  // 1) Fetch weather only inside the search radius (cached cells reused).
  const grid = buildGrid(lat, lon, radiusKm, SPACING_KM);
  const gridWeather = await getWeatherForGrid(grid);

  // 2) Add any already-cached cells from a wider box (no new API calls) so
  //    coverage beyond 100 miles shows up if it exists.
  const padDeg = radiusKm / 111.32 + 2;
  const lonPad = padDeg / Math.cos((lat * Math.PI) / 180);
  let extraWeather = [];
  try {
    extraWeather = await getCellsInBox(lat - padDeg, lon - lonPad, lat + padDeg, lon + lonPad);
  } catch {
    extraWeather = [];
  }

  // 3) Merge, then score every cell at the current hour (cheap, one pass).
  const byKey = new Map();
  for (const c of extraWeather) byKey.set(`${c.lat.toFixed(3)},${c.lon.toFixed(3)}`, c);
  for (const c of gridWeather) byKey.set(`${c.lat.toFixed(3)},${c.lon.toFixed(3)}`, c);
  const allCells = [...byKey.values()];

  const lookup = makeLookup(allCells, SPACING_KM);

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  const cells = [];  // compact [lat, lon, p] for ALL cells -> drives the field
  const detail = []; // full breakdown + sparkline for every in-radius cell
  let hotCount = 0;

  for (const c of allCells) {
    const r = probabilityForCell(c, lookup, date, targetUnix);
    cells.push([+c.lat.toFixed(4), +c.lon.toFixed(4), +r.p.toFixed(3)]);
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;

    // Full detail for every cell within the search radius, so a click anywhere
    // can snap to a nearby cell and explain what's going on there.
    const inRadius = haversineKm(lat, lon, c.lat, c.lon) <= radiusKm + SPACING_KM;
    if (inRadius) {
      const sp = probabilitySeries(c, lookup, baseUnix, OFFSETS);
      detail.push({
        lat: +c.lat.toFixed(4),
        lon: +c.lon.toFixed(4),
        p: +r.p.toFixed(3),
        sun: +r.sun.toFixed(2),
        rain: +r.rain.toFixed(2),
        light: +r.light.toFixed(2),
        sunAlt: +r.sunAltDeg.toFixed(1),
        sunAz: +r.sunAzDeg.toFixed(0),
        look: +r.antiBearingDeg.toFixed(0), // compass bearing to face for the bow
        series: sp.series,
        peakOffset: sp.peakOffset,
      });
      if (r.p >= HOT) hotCount++;
    }
  }

  const bounds = cells.length > 0 ? { minLat, minLon, maxLat, maxLon } : null;

  return NextResponse.json({
    center: { lat, lon },
    radiusMi,
    offset: clamped,
    now: nowUnix,
    base: baseUnix,
    target: targetUnix,
    offsets: OFFSETS,
    spacingKm: SPACING_KM,
    bounds,
    counts: { searched: grid.length, scored: allCells.length, hot: hotCount },
    cells,
    detail,
    db: dbInfo.hasDb,
    attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
  });
}
