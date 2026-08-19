// lib/colors.js
// Shared rainbow color ramp (violet = low, red = high) so the map, popups, and
// the time-slider track all speak the same visual language.

const STOPS = [
  [0.0, [123, 44, 191]],
  [0.25, [58, 134, 255]],
  [0.45, [6, 214, 160]],
  [0.65, [255, 209, 102]],
  [0.82, [247, 127, 0]],
  [1.0, [230, 57, 70]],
];

// t in 0..1 -> [r,g,b]
export function colorForProb(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function rgba([r, g, b], a) {
  return `rgba(${r},${g},${b},${a})`;
}
