// app/page.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map must be client-only.
const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

const RADIUS_MI = 100;

function fmtClock(unix) {
  return new Date(unix * 1000).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Page() {
  const [center, setCenter] = useState(null);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);
  const mapApi = useRef(null);

  const askLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported by this browser.");
      return;
    }
    setStatus("Locating you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus("");
      },
      (err) => setStatus(`Location denied (${err.message}). You can still pan the map.`),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }, []);

  // Ask once on first load.
  useEffect(() => {
    askLocation();
  }, [askLocation]);

  // Fetch probabilities whenever center or offset changes (debounced for the slider).
  useEffect(() => {
    if (!center) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setStatus("Scanning skies…");
      try {
        const url = `/api/rainbow?lat=${center.lat}&lon=${center.lon}&offset=${offset}&radius=${RADIUS_MI}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
        const v = json.counts?.hot ?? 0;
        setStatus(
          v === 0
            ? "No rainbow-friendly spots at this hour. Try sliding the time."
            : `${v} promising spot${v === 1 ? "" : "s"} — tap one for details.`
        );
      } catch (e) {
        setStatus(`Error: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [center, offset]);

  const targetUnix = useMemo(() => {
    if (data?.target) return data.target;
    return Math.floor(Date.now() / 1000 / 3600) * 3600 + offset * 3600;
  }, [data, offset]);

  const relLabel =
    offset === 0 ? "now" : offset > 0 ? `+${offset}h from now` : `${offset}h from now`;

  return (
    <>
      <MapView
        center={center}
        data={data}
        currentOffset={offset}
        onSelectHour={(off) => setOffset(off)}
        onReady={(api) => (mapApi.current = api)}
        radiusMi={RADIUS_MI}
      />

      <div className="panel top-left">
        <h1 className="title">
          <span className="arc" /> RainbowHunter
        </h1>
        <p className="subtitle">
          The heatmap shows where to <em>stand</em> to catch a rainbow — sun low and
          behind you, rain ahead, clear sky overhead. Not where the bow "is."
        </p>
        <button className="btn" onClick={askLocation} disabled={loading}>
          {center ? "Re-center on me" : "Use my location"}
        </button>
        <button
          className="btn ghost"
          onClick={() => mapApi.current?.jumpToPeak()}
          disabled={!data?.counts?.hot}
        >
          ✨ Jump to best spot
        </button>
        <div className="status">{status}</div>
      </div>

      <div className="panel legend">
        <div>Chance of seeing a bow</div>
        <div className="legend-bar" />
        <div className="legend-row">
          <span>low</span>
          <span>high</span>
        </div>
      </div>

      <div className="panel bottom-bar">
        <div className="slider-head">
          <span className="slider-time">{fmtClock(targetUnix)}</span>
          <span className="slider-rel">{relLabel}</span>
        </div>
        <input
          type="range"
          min={-8}
          max={8}
          step={1}
          value={offset}
          onChange={(e) => setOffset(parseInt(e.target.value, 10))}
        />
        <div className="ticks">
          <span>-8h</span>
          <span>-4h</span>
          <span>now</span>
          <span>+4h</span>
          <span>+8h</span>
        </div>
      </div>

      <div className="attrib">
        Weather: <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0)
      </div>
    </>
  );
}
