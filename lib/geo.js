// lib/geo.js
// Small geodesy helpers. All angles in degrees on the public API.

const R_EARTH_KM = 6371.0088;

export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;

// Great-circle distance between two lat/lon points, in km.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Forward geodesic: start point + compass bearing (deg, 0=N, 90=E) + distance (km).
// Returns { lat, lon }.
export function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const d = distanceKm / R_EARTH_KM;
  const br = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: toDeg(lat2), lon: ((toDeg(lon2) + 540) % 360) - 180 };
}

// Round a coordinate to a grid key so cache lookups are stable.
export function cellKey(lat, lon, precision = 3) {
  return `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
}

// Bucketed spatial index for fast nearest-neighbour / neighbourhood queries.
// items: [{ lat, lon, ... }]. cellSizeDeg ~ grid spacing in degrees.
export function buildSpatialIndex(items, cellSizeDeg) {
  const buckets = new Map();
  const k = (a, b) => a + ":" + b;
  for (const it of items) {
    const bi = Math.floor(it.lat / cellSizeDeg);
    const bj = Math.floor(it.lon / cellSizeDeg);
    const key = k(bi, bj);
    let arr = buckets.get(key);
    if (!arr) buckets.set(key, (arr = []));
    arr.push(it);
  }
  return {
    cellSizeDeg,
    // All items within `ring` buckets of the query point.
    neighbors(lat, lon, ring = 1) {
      const bi = Math.floor(lat / cellSizeDeg);
      const bj = Math.floor(lon / cellSizeDeg);
      const res = [];
      for (let di = -ring; di <= ring; di++) {
        for (let dj = -ring; dj <= ring; dj++) {
          const arr = buckets.get(k(bi + di, bj + dj));
          if (arr) for (const it of arr) res.push(it);
        }
      }
      return res;
    },
    nearest(lat, lon, maxKm, ring = 2) {
      let best = null;
      let bestKm = Infinity;
      for (const it of this.neighbors(lat, lon, ring)) {
        const d = haversineKm(lat, lon, it.lat, it.lon);
        if (d < bestKm) {
          bestKm = d;
          best = it;
        }
      }
      return bestKm <= maxKm ? best : null;
    },
  };
}
