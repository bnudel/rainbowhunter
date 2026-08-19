// lib/db.js
//
// Weather cache. Uses Neon Postgres when DATABASE_URL is set (the production /
// Vercel path). Falls back to a per-process in-memory Map when it isn't, so the
// app still runs locally with zero setup -- you just lose cross-request caching.

import { neon } from "@neondatabase/serverless";

const HAS_DB = !!process.env.DATABASE_URL;
const sql = HAS_DB ? neon(process.env.DATABASE_URL) : null;

// in-memory fallback
const mem = new Map(); // key "lat,lon" -> { lat, lon, hourly, fetchedAt(ms) }
const memKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

let ensured = false;
async function ensureSchema() {
  if (!HAS_DB || ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS weather_cache (
      cell_lat   double precision NOT NULL,
      cell_lon   double precision NOT NULL,
      fetched_at timestamptz      NOT NULL DEFAULT now(),
      hourly     jsonb            NOT NULL,
      PRIMARY KEY (cell_lat, cell_lon)
    );`;
  ensured = true;
}

// Return cached rows for the given cells that are still fresh (< ttlMs old).
// `cells` is [{lat,lon}]. Returns Map key "lat,lon"(3dp) -> { lat, lon, hourly }.
export async function getFreshCells(cells, ttlMs) {
  const out = new Map();
  const cutoff = Date.now() - ttlMs;

  if (!HAS_DB) {
    for (const c of cells) {
      const row = mem.get(memKey(c.lat, c.lon));
      if (row && row.fetchedAt >= cutoff) {
        out.set(memKey(c.lat, c.lon), { lat: row.lat, lon: row.lon, hourly: row.hourly });
      }
    }
    return out;
  }

  await ensureSchema();
  // Round to 3dp to match how we store; query the bounding box then filter.
  const lats = cells.map((c) => c.lat);
  const lons = cells.map((c) => c.lon);
  const rows = await sql`
    SELECT cell_lat, cell_lon, hourly
    FROM weather_cache
    WHERE cell_lat BETWEEN ${Math.min(...lats)} AND ${Math.max(...lats)}
      AND cell_lon BETWEEN ${Math.min(...lons)} AND ${Math.max(...lons)}
      AND fetched_at >= to_timestamp(${cutoff / 1000})`;
  const fresh = new Map();
  for (const r of rows) fresh.set(`${r.cell_lat.toFixed(3)},${r.cell_lon.toFixed(3)}`, r);
  for (const c of cells) {
    const k = `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
    const r = fresh.get(k);
    if (r) out.set(k, { lat: r.cell_lat, lon: r.cell_lon, hourly: r.hourly });
  }
  return out;
}

// Upsert freshly fetched cells. `rows` is [{lat,lon,hourly}].
export async function saveCells(rows) {
  if (!HAS_DB) {
    for (const r of rows) {
      mem.set(memKey(r.lat, r.lon), { ...r, fetchedAt: Date.now() });
    }
    return;
  }
  await ensureSchema();
  for (const r of rows) {
    await sql`
      INSERT INTO weather_cache (cell_lat, cell_lon, hourly, fetched_at)
      VALUES (${r.lat}, ${r.lon}, ${JSON.stringify(r.hourly)}, now())
      ON CONFLICT (cell_lat, cell_lon)
      DO UPDATE SET hourly = EXCLUDED.hourly, fetched_at = now();`;
  }
}

// "If more data exists in the database, show that as well": every cached cell
// inside a generous bounding box (so we can render coverage beyond the 100mi
// search radius). Returns [{lat,lon,hourly}].
export async function getCellsInBox(minLat, minLon, maxLat, maxLon, limit = 4000) {
  if (!HAS_DB) {
    const res = [];
    for (const row of mem.values()) {
      if (row.lat >= minLat && row.lat <= maxLat && row.lon >= minLon && row.lon <= maxLon) {
        res.push({ lat: row.lat, lon: row.lon, hourly: row.hourly });
      }
    }
    return res.slice(0, limit);
  }
  await ensureSchema();
  const rows = await sql`
    SELECT cell_lat, cell_lon, hourly FROM weather_cache
    WHERE cell_lat BETWEEN ${minLat} AND ${maxLat}
      AND cell_lon BETWEEN ${minLon} AND ${maxLon}
    LIMIT ${limit};`;
  return rows.map((r) => ({ lat: r.cell_lat, lon: r.cell_lon, hourly: r.hourly }));
}

export const dbInfo = { hasDb: HAS_DB };
