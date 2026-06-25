// components/popupContent.js
// Builds the DOM for the "why here?" popup: a factor breakdown + an interactive
// ±8h sparkline. Kept out of React because Leaflet popups take a DOM node; the
// sparkline bars call ctx.onSelectHour so clicking a bar moves the time slider.

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg) => COMPASS[Math.round(((deg % 360) / 45)) % 8];

function colorFor(p) {
  const stops = [
    [0.0, [123, 44, 191]], [0.25, [58, 134, 255]], [0.45, [6, 214, 160]],
    [0.65, [255, 209, 102]], [0.82, [247, 127, 0]], [1.0, [230, 57, 70]],
  ];
  const t = Math.max(0, Math.min(1, p));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return `rgb(${Math.round(c0[0] + f * (c1[0] - c0[0]))},${Math.round(
        c0[1] + f * (c1[1] - c0[1])
      )},${Math.round(c0[2] + f * (c1[2] - c0[2]))})`;
    }
  }
  return "rgb(230,57,70)";
}

// Builds an explanation focused on the limiting factor (or the win).
function explain(cell) {
  const look = compass(cell.look);
  const sunDir = compass(cell.sunAz);

  // Hint about a better hour, if this spot peaks elsewhere in the window.
  const peak = Math.max(0, ...(cell.series || [0]));
  const peakHint =
    peak >= 0.1 && cell.p < peak - 0.02
      ? ` It looks best at <b>${cell.peakOffset === 0 ? "now" : (cell.peakOffset > 0 ? "+" : "") + cell.peakOffset + "h"}</b> (${Math.round(peak * 100)}%).`
      : "";

  if (cell.sunAlt <= 0)
    return `The sun is below the horizon here — no daylight for a bow.${peakHint}`;
  if (cell.sun === 0)
    return `The sun is too high (<b>${cell.sunAlt}°</b>). A ground rainbow needs it below 42°, so try a lower-sun hour.${peakHint}`;

  if (cell.p >= 0.05)
    return (
      `Sun is <b>${cell.sunAlt}°</b> up to the <b>${sunDir}</b> (behind you). ` +
      `Face <b>${look}</b> — that's where the rain and the bow are.${peakHint}`
    );

  // Sun is fine but something's missing.
  if (cell.rain < 0.1 && cell.light >= 0.4)
    return `Sun's well placed (<b>${cell.sunAlt}°</b>, ${sunDir}), but there's no rain to the <b>${look}</b> to catch it.${peakHint}`;
  if (cell.light < 0.3 && cell.rain >= 0.2)
    return `Rain is out to the <b>${look}</b>, but it's too overcast overhead for direct sun here.${peakHint}`;
  return `Sun's up (<b>${cell.sunAlt}°</b>, ${sunDir}), but rain and clear sun don't line up here yet.${peakHint}`;
}

function bar(label, value) {
  const row = document.createElement("div");
  row.className = "fb-row";
  const name = document.createElement("span");
  name.className = "fb-name";
  name.textContent = label;
  const track = document.createElement("div");
  track.className = "fb-track";
  const fill = document.createElement("div");
  fill.className = "fb-fill";
  fill.style.width = `${Math.round(value * 100)}%`;
  track.appendChild(fill);
  const pct = document.createElement("span");
  pct.className = "fb-pct";
  pct.textContent = `${Math.round(value * 100)}%`;
  row.append(name, track, pct);
  return row;
}

export function buildPopupContent(cell, ctx) {
  const { base, offsets, requestedOffset, onSelectHour } = ctx;
  const el = document.createElement("div");
  el.className = "why";

  // Header
  const head = document.createElement("div");
  head.className = "why-head";
  head.innerHTML = `<span class="why-pct">${Math.round(cell.p * 100)}%</span><span class="why-sub">chance of seeing a bow here</span>`;
  el.appendChild(head);

  // Plain-language explanation tailored to whatever is helping/blocking a bow.
  const why = document.createElement("p");
  why.className = "why-text";
  why.innerHTML = explain(cell);
  el.appendChild(why);

  // Factor bars
  el.appendChild(bar("Sun angle", cell.sun));
  el.appendChild(bar("Rain ahead", cell.rain));
  el.appendChild(bar("Clear o/head", cell.light));

  // Sparkline title
  const sTitle = document.createElement("div");
  sTitle.className = "spark-title";
  sTitle.textContent = "Next ±8 hours (tap a bar)";
  el.appendChild(sTitle);

  // Sparkline (flex of clickable bars)
  const spark = document.createElement("div");
  spark.className = "spark";
  const peak = Math.max(0.001, ...cell.series);
  offsets.forEach((off, i) => {
    const v = cell.series[i];
    const b = document.createElement("button");
    b.className = "spark-bar" + (off === requestedOffset ? " sel" : "");
    b.style.height = `${Math.max(3, Math.round((v / peak) * 100))}%`;
    b.style.background = v > 0.02 ? colorFor(v) : "rgba(255,255,255,0.12)";
    b.title = `${off === 0 ? "now" : (off > 0 ? "+" : "") + off + "h"}: ${Math.round(v * 100)}%`;
    b.onclick = () => onSelectHour && onSelectHour(off);
    spark.appendChild(b);
  });
  el.appendChild(spark);

  const ticks = document.createElement("div");
  ticks.className = "spark-ticks";
  ticks.innerHTML = `<span>-8h</span><span>now</span><span>+8h</span>`;
  el.appendChild(ticks);

  return el;
}
