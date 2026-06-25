// lib/weather.js
import { getFreshCells, saveCells } from "./db.js";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const HOURLY_VARS =
  "precipitation,precipitation_probability,cloud_cover,cloud_cover_low,weather_code";

// How long a cached cell stays usable before we refetch it (ms).
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const BATCH = 100; // coords per Open-Meteo request
const CONCURRENCY = 3;

// Fetch one batch of coordinates from Open-Meteo. Returns [{lat,lon,hourly}].
async function fetchBatch(cells) {
  const lat = cells.map((c) => c.lat).join(",");
  const lon = cells.map((c) => c.lon).join(",");
  const url =
    `${OPEN_METEO}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}&past_days=1&forecast_days=2` +
    `&timezone=UTC&timeformat=unixtime`;

  const res = await fetch(url, { headers: { "User-Agent": "rainbowhunter" } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [data]; // multi-coord => array

  return list.map((d, i) => ({
    lat: cells[i].lat,
    lon: cells[i].lon,
    hourly: {
      time: d.hourly?.time ?? [],
      precipitation: d.hourly?.precipitation ?? [],
      precipitation_probability: d.hourly?.precipitation_probability ?? [],
      cloud_cover: d.hourly?.cloud_cover ?? [],
      cloud_cover_low: d.hourly?.cloud_cover_low ?? [],
      weather_code: d.hourly?.weather_code ?? [],
    },
  }));
}

async function fetchAllBatches(missing) {
  const batches = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));

  const results = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map(fetchBatch));
    for (const s of settled) if (s.status === "fulfilled") results.push(...s.value);
  }
  return results;
}

// Ensure we have fresh weather for every grid cell. Returns [{lat,lon,hourly}].
export async function getWeatherForGrid(cells) {
  const fresh = await getFreshCells(cells, CACHE_TTL_MS);
  const have = [];
  const missing = [];
  for (const c of cells) {
    const k = `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
    if (fresh.has(k)) have.push(fresh.get(k));
    else missing.push(c);
  }

  if (missing.length) {
    const fetched = await fetchAllBatches(missing);
    if (fetched.length) {
      // fire-and-forget save would be nice, but serverless may freeze; await it.
      await saveCells(fetched);
      have.push(...fetched);
    }
  }
  return have;
}
