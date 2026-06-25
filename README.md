# 🌈 RainbowHunter

A live map that overlays a heatmap of **where you'd need to stand to see a rainbow**
right now (and ±8 hours). It is **not** a map of "where the rainbow is" — a rainbow
has no fixed location; every observer sees their own. So the heatmap answers the
useful question: *if I were standing here, could I see a bow?*

Built with **Next.js** (React + serverless API routes) so it deploys to **Vercel**
in one click. Weather comes from **Open-Meteo** (free, no API key) and is cached in
**Postgres** so you never hit a rate limit.

---

## How the probability model works

A rainbow needs three things to line up at once. Each contributes a 0–1 factor and
they're multiplied together (`lib/rainbow.js`):

1. **Sun low and behind you** — `sunFactor`. The primary bow is a 42°-radius circle
   centred on the *antisolar point* (the shadow of your head). If the sun is higher
   than ~42° the whole bow is below the horizon, so probability is 0. The lower the
   sun, the taller/fuller the bow, so the factor peaks when the sun is low (just a
   touch off the horizon) and falls to 0 by 42°.
2. **Rain in front of you** — `rainFactor`. We take the antisolar compass bearing
   (opposite the sun) and sample precipitation in the grid cells 4–24 km out along
   it. Active precipitation and high precipitation-probability both count; convective
   shower weather-codes get a small bonus (they make the best bows).
3. **Direct sunlight on you and the drops** — `sunlightFactor`. You have to be in the
   clear for the sun to reach the raindrops, so low cloud cover overhead is the
   deal-breaker; high/thin cloud is forgiven.

`P = sunFactor × rainFactor × sunlightFactor`. The result naturally lights up the
**sunlit edges of passing showers, on the side away from the sun** — exactly where
rainbows appear. Sun position is computed with `suncalc` (no API call needed).

Everything is tunable: sample distances, the 42° limit, shower bonuses, and cloud
weighting all live at the top of `lib/rainbow.js`.

### Known simplifications
- Ground-level observers only (no "I'm on a mountain / in a plane" 42°+ bows).
- Illumination of the drops is approximated from the observer's cloud cover.
- Grid resolution is ~14 km by default — finer than the heat blur, coarser than reality.

---

## Architecture

```
app/
  page.js              client UI: geolocation, ±8h slider, fetch
  api/rainbow/route.js serverless endpoint -> grid + weather + scoring + series
components/
  MapView.jsx          react-leaflet map + click-to-explain popups
  FieldOverlay.jsx     interpolated raster overlay (smooth at any zoom)
  popupContent.js      "why here?" breakdown + interactive sparkline
lib/
  rainbow.js           physics + probability model (the interesting part)
  interpolate.js       inverse-distance weighting between grid points
  grid.js              builds the search disc
  weather.js           Open-Meteo fetch, batching, cache orchestration
  db.js                Neon Postgres cache (+ in-memory fallback)
  geo.js               haversine, forward-geodesic, spatial index
```

### Interactions
- **Cohesive heatmap at any zoom.** The grid is ~14 km, so a fixed-pixel dot heatmap
  falls apart when you zoom in. Instead the client runs **inverse-distance weighting**
  (`lib/interpolate.js`) to average between data points and paints the result to a
  **geographic raster overlay** (`FieldOverlay.jsx`). Because the raster is anchored
  in lat/lon, the browser upsamples it smoothly as you zoom — it stays a continuous
  field instead of separating into dots.
- **"Why here?"** Tap *anywhere* on the map — it snaps to the nearest grid cell and
  explains what's happening: the three factors (sun angle, rain ahead, clear sky
  overhead), the sun's altitude/direction, which way to face, and — if the spot is a
  dud right now — *why* (sun too high, no rain, too cloudy) plus when it looks best.
- **Sparkline.** Each popup shows the spot's probability across the next ±8 hours;
  tap a bar to jump the time slider straight to that hour.
- **Jump to best spot.** One tap flies to the strongest spot in view (or the global
  best if none are on screen) and opens its popup.

**Request flow:** the browser asks for your location → calls
`/api/rainbow?lat&lon&offset` → the server builds a grid inside the **100-mile**
radius, serves fresh cells from Postgres and only fetches the *missing* ones from
Open-Meteo (then caches them) → it **also** pulls any already-cached cells from a
wider box so coverage that exists beyond 100 miles is shown too → computes the
probability for every cell and returns the visible ones.

---

## Run locally

```bash
npm install
cp .env.example .env      # DATABASE_URL optional for local dev
npm run dev               # http://localhost:3000
```

Without `DATABASE_URL` it uses an in-memory cache — perfect for trying it out.

## Deploy to Vercel

1. Push this folder to a Git repo and import it at [vercel.com/new](https://vercel.com/new).
2. Add a Postgres database: **Storage → Create → Neon** (Vercel's integrated
   Postgres). It sets `DATABASE_URL` for you. (Any Neon/Postgres URL works.)
3. Deploy. The `weather_cache` table is created automatically on first request.

That's it — no API keys to manage. Open-Meteo's free tier allows ~10k calls/day and
the Postgres cache keeps you well under it.

## Attribution
Weather data by [Open-Meteo.com](https://open-meteo.com) under CC BY 4.0. Map tiles
© OpenStreetMap contributors, © CARTO.
