// components/FieldOverlay.jsx
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { makeSampler } from "../lib/interpolate";

// Rainbow gradient stops: [t, [r,g,b]]
const STOPS = [
  [0.0, [123, 44, 191]],
  [0.25, [58, 134, 255]],
  [0.45, [6, 214, 160]],
  [0.65, [255, 209, 102]],
  [0.82, [247, 127, 0]],
  [1.0, [230, 57, 70]],
];

function colorFor(p) {
  const t = Math.max(0, Math.min(1, p));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Render the interpolated probability field to an image overlay. Because the
// overlay is anchored in geographic coordinates, the browser upsamples it
// smoothly as you zoom in -> it stays cohesive instead of breaking into dots.
export default function FieldOverlay({ cells, bounds, spacingKm = 14, longSidePx = 260 }) {
  const map = useMap();
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      map.removeLayer(ref.current);
      ref.current = null;
    }
    if (!cells || cells.length === 0 || !bounds) return;

    const { minLat, minLon, maxLat, maxLon } = bounds;
    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLon = Math.max(maxLon - minLon, 1e-6);

    // Raster size: keep aspect, cap the long side.
    const aspect = spanLon / spanLat;
    let W, H;
    if (aspect >= 1) {
      W = longSidePx;
      H = Math.max(2, Math.round(longSidePx / aspect));
    } else {
      H = longSidePx;
      W = Math.max(2, Math.round(longSidePx * aspect));
    }

    const sample = makeSampler(
      cells.map((c) => ({ lat: c[0], lon: c[1], p: c[2] })),
      spacingKm
    );

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);

    for (let r = 0; r < H; r++) {
      const lat = maxLat - (r / (H - 1)) * spanLat; // row 0 = north
      for (let c = 0; c < W; c++) {
        const lon = minLon + (c / (W - 1)) * spanLon;
        const p = sample(lat, lon);
        const idx = (r * W + c) * 4;
        if (p <= 0.02) {
          img.data[idx + 3] = 0; // transparent
          continue;
        }
        const [rr, gg, bb] = colorFor(p);
        img.data[idx] = rr;
        img.data[idx + 1] = gg;
        img.data[idx + 2] = bb;
        img.data[idx + 3] = Math.round(255 * Math.min(0.85, 0.28 + 0.62 * p));
      }
    }
    ctx.putImageData(img, 0, 0);

    const url = canvas.toDataURL();
    ref.current = L.imageOverlay(
      url,
      [
        [minLat, minLon],
        [maxLat, maxLon],
      ],
      { opacity: 1, interactive: false, className: "field-overlay" }
    ).addTo(map);

    return () => {
      if (ref.current) {
        map.removeLayer(ref.current);
        ref.current = null;
      }
    };
  }, [cells, bounds, spacingKm, longSidePx, map]);

  return null;
}
