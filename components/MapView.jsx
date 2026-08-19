// components/MapView.jsx
"use client";

import { MapContainer, TileLayer, CircleMarker, Circle, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import FieldOverlay from "./FieldOverlay";
import { buildPopupContent } from "./popupContent";
import { haversineKm } from "../lib/geo";

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lon], map.getZoom() || 9);
  }, [center, map]);
  return null;
}

function openWhy(map, cell, ctx) {
  const content = buildPopupContent(cell, ctx);
  return L.popup({ className: "why-popup", maxWidth: 280, closeButton: true })
    .setLatLng([cell.lat, cell.lon])
    .setContent(content)
    .openOn(map);
}

// Click the map -> nearest cell with detail -> "why here?" popup.
function ClickProbe({ detail, ctx, spacingKm, mapRef }) {
  useMapEvents({
    click(e) {
      const map = mapRef.current;
      if (!map || !detail || detail.length === 0) return;
      const { lat, lng } = e.latlng;
      let best = null;
      let bestKm = Infinity;
      for (const c of detail) {
        const d = haversineKm(lat, lng, c.lat, c.lon);
        if (d < bestKm) { bestKm = d; best = c; }
      }
      // Every grid cell has detail now, so any click inside the data lands within
      // ~half a grid spacing. Allow a generous range; ignore clicks far outside.
      if (best && bestKm <= spacingKm * 1.5) openWhy(map, best, ctx);
    },
  });
  return null;
}

export default function MapView({ center, data, currentOffset, onSelectHour, onReady, radiusMi }) {
  const start = center || { lat: 39.7392, lon: -104.9903 }; // Denver fallback
  const radiusM = (radiusMi || 100) * 1609.34;
  const mapRef = useRef(null);

  // Keep latest props in refs so the imperative jumpToPeak() is never stale.
  const dataRef = useRef(data);
  const offsetRef = useRef(currentOffset);
  const selectRef = useRef(onSelectHour);
  dataRef.current = data;
  offsetRef.current = currentOffset;
  selectRef.current = onSelectHour;

  const ctx = {
    base: data?.base,
    offsets: data?.offsets || [],
    requestedOffset: currentOffset,
    onSelectHour,
  };

  // Fly to the strongest spot in the current view (or globally if none visible).
  const jumpToPeak = useCallback(() => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d?.detail?.length) return;

    const b = map.getBounds();
    let best = null;
    for (const c of d.detail) {
      if (c.p > 0 && b.contains([c.lat, c.lon]) && (!best || c.p > best.p)) best = c;
    }
    if (!best) for (const c of d.detail) if (c.p > 0 && (!best || c.p > best.p)) best = c;
    if (!best) return;

    map.flyTo([best.lat, best.lon], Math.max(map.getZoom(), 11), { duration: 0.8 });
    openWhy(map, best, {
      base: d.base,
      offsets: d.offsets || [],
      requestedOffset: offsetRef.current,
      onSelectHour: selectRef.current,
    });
  }, []);

  useEffect(() => {
    if (onReady) onReady({ jumpToPeak });
  }, [onReady, jumpToPeak]);

  return (
    <MapContainer
      id="map"
      center={[start.lat, start.lon]}
      zoom={9}
      zoomControl={false}
      ref={mapRef}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; OpenStreetMap &copy; CARTO"
      />
      {center && (
        <>
          <Circle
            center={[center.lat, center.lon]}
            radius={radiusM}
            pathOptions={{ color: "#ffd166", weight: 1, opacity: 0.35, fill: false }}
          />
          <CircleMarker
            center={[center.lat, center.lon]}
            radius={6}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#ffd166", fillOpacity: 1 }}
          />
        </>
      )}
      <FieldOverlay cells={data?.cells} bounds={data?.bounds} spacingKm={data?.spacingKm || 14} />
      <ClickProbe detail={data?.detail} ctx={ctx} spacingKm={data?.spacingKm || 14} mapRef={mapRef} />
      <Recenter center={center} />
    </MapContainer>
  );
}
