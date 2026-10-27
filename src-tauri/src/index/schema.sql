CREATE TABLE notes (
  key       INTEGER PRIMARY KEY,
  id        TEXT UNIQUE,              -- ULID; NULL until first placed
  path      TEXT UNIQUE NOT NULL,     -- vault-relative
  mtime     INTEGER, size INTEGER,
  title     TEXT, excerpt TEXT        -- enough to draw a card without opening the .md
);

CREATE TABLE zones (
  key       INTEGER PRIMARY KEY,      -- shared with zone_bounds
  id        TEXT UNIQUE NOT NULL,
  parent    TEXT,                     -- NULL = canvas
  name      TEXT, color TEXT,
  x REAL, y REAL, w REAL, h REAL,     -- relative to parent, as in the file
  mtime     INTEGER, size INTEGER
);
CREATE INDEX zones_parent ON zones(parent);

CREATE TABLE cards (
  key       INTEGER PRIMARY KEY,      -- shared with card_bounds
  id        TEXT UNIQUE NOT NULL,
  note      TEXT,                     -- NULL = empty card
  zone      TEXT,                     -- NULL = canvas
  x REAL, y REAL, w REAL, h REAL,     -- relative to zone, as in the file
  halign    TEXT NOT NULL DEFAULT 'left',
  valign    TEXT NOT NULL DEFAULT 'top',
  mtime     INTEGER, size INTEGER
);
CREATE INDEX cards_note ON cards(note);
CREATE INDEX cards_zone ON cards(zone);

CREATE TABLE edges (
  key       INTEGER PRIMARY KEY,      -- shared with edge_bounds
  id        TEXT UNIQUE NOT NULL,
  from_card TEXT NOT NULL,
  to_card   TEXT NOT NULL,
  label     TEXT,
  shape     TEXT NOT NULL DEFAULT 'curved',
  arrow     TEXT NOT NULL DEFAULT 'to',
  stroke    TEXT NOT NULL DEFAULT 'solid',
  mtime     INTEGER, size INTEGER
);
CREATE INDEX edges_from ON edges(from_card);
CREATE INDEX edges_to ON edges(to_card);

-- absolute world coordinates
CREATE VIRTUAL TABLE zone_bounds USING rtree(key, min_x, max_x, min_y, max_y);
CREATE VIRTUAL TABLE card_bounds USING rtree(key, min_x, max_x, min_y, max_y);
CREATE VIRTUAL TABLE edge_bounds USING rtree(key, min_x, max_x, min_y, max_y);

CREATE VIRTUAL TABLE notes_fts USING fts5(title, body);   -- rowid = notes.key
CREATE VIRTUAL TABLE zones_fts USING fts5(name);          -- rowid = zones.key

-- per device, not derived from files: viewport, zoom, last opened zone
CREATE TABLE ui_state (k TEXT PRIMARY KEY, v TEXT);
