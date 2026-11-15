-- Outbound clicks from the personal site to each project ("exits" registered on the homepage with data-go).
-- Aggregated per exit, day and source only: no visitor identifiers, no IP addresses.
CREATE TABLE IF NOT EXISTS go_clicks (
  exit_id TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('page', 'room', 'link')),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  PRIMARY KEY (exit_id, day, source)
);
