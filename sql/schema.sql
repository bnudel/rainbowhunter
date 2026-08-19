-- sql/schema.sql
-- The app creates this automatically on first run, but here it is for reference.
CREATE TABLE IF NOT EXISTS weather_cache (
  cell_lat   double precision NOT NULL,
  cell_lon   double precision NOT NULL,
  fetched_at timestamptz      NOT NULL DEFAULT now(),
  hourly     jsonb            NOT NULL,
  PRIMARY KEY (cell_lat, cell_lon)
);

-- Speeds up the bounding-box lookups used to show cached coverage beyond 100mi.
CREATE INDEX IF NOT EXISTS weather_cache_latlon ON weather_cache (cell_lat, cell_lon);
