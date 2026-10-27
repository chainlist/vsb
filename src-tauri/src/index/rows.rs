//! Index rows for notes, zones, cards and edges. Upserts keep each row's `key`,
//! which the R*Trees and the full-text table share.

use super::{Index, Rect};
use crate::error::Result;
use crate::fsx::Stamp;
use crate::items::{Card, Edge, Item, Kind, Zone};
use rusqlite::{params, OptionalExtension};

/// What the index keeps about one note file.
pub struct NoteRow<'a> {
  pub path: &'a str,
  pub id: Option<&'a str>,
  pub stamp: Stamp,
  pub title: &'a str,
  pub excerpt: &'a str,
  pub body: &'a str,
}

pub(super) fn tables(kind: Kind) -> (&'static str, &'static str) {
  match kind {
    Kind::Zone => ("zones", "zone_bounds"),
    Kind::Card => ("cards", "card_bounds"),
    Kind::Edge => ("edges", "edge_bounds"),
  }
}

impl Index {
  pub fn put_note(&self, n: &NoteRow) -> Result<()> {
    let key: i64 = self.db.query_row(
      "INSERT INTO notes (id, path, mtime, size, title, excerpt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (path) DO UPDATE SET id = excluded.id, mtime = excluded.mtime, size = excluded.size,
         title = excluded.title, excerpt = excluded.excerpt
       RETURNING key",
      params![n.id, n.path, n.stamp.mtime, n.stamp.size, n.title, n.excerpt],
      |r| r.get(0),
    )?;
    self.db.execute("DELETE FROM notes_fts WHERE rowid = ?1", [key])?;
    self.db.execute("INSERT INTO notes_fts (rowid, title, body) VALUES (?1, ?2, ?3)", params![key, n.title, n.body])?;
    Ok(())
  }

  pub fn remove_note(&self, path: &str) -> Result<()> {
    self.db.execute("DELETE FROM notes_fts WHERE rowid = (SELECT key FROM notes WHERE path = ?1)", [path])?;
    self.db.execute("DELETE FROM notes WHERE path = ?1", [path])?;
    Ok(())
  }

  /// Vault-relative path of the note with this ULID.
  pub fn note_path(&self, id: &str) -> Result<Option<String>> {
    Ok(self.db.query_row("SELECT path FROM notes WHERE id = ?1", [id], |r| r.get(0)).optional()?)
  }

  /// A zone, card or edge as its row holds it: its file as the app last read or wrote it.
  pub fn item<T: Item>(&self, id: &str) -> Result<Option<T>> {
    let fields = match T::KIND {
      Kind::Zone => "'name', name, 'parent', parent, 'x', x, 'y', y, 'w', w, 'h', h, 'color', color",
      Kind::Card => "'note', note, 'zone', zone, 'x', x, 'y', y, 'w', w, 'h', h, 'halign', halign, 'valign', valign",
      Kind::Edge => "'from', from_card, 'to', to_card, 'label', label, 'shape', shape, 'arrow', arrow",
    };
    let sql = format!("SELECT json_object({fields}) FROM {} WHERE id = ?1", tables(T::KIND).0);
    let json: Option<String> = self.db.query_row(&sql, [id], |r| r.get(0)).optional()?;
    Ok(json.map(|j| serde_json::from_str(&j)).transpose()?)
  }

  pub fn put_zone(&self, id: &str, z: &Zone, stamp: Stamp) -> Result<()> {
    let key: i64 = self.db.query_row(
      "INSERT INTO zones (id, parent, name, color, x, y, w, h, mtime, size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT (id) DO UPDATE SET parent = excluded.parent, name = excluded.name, color = excluded.color,
         x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h, mtime = excluded.mtime, size = excluded.size
       RETURNING key",
      params![id, z.parent, z.name, z.color, z.x, z.y, z.w, z.h, stamp.mtime, stamp.size],
      |r| r.get(0),
    )?;
    self.db.execute("DELETE FROM zones_fts WHERE rowid = ?1", [key])?;
    self.db.execute("INSERT INTO zones_fts (rowid, name) VALUES (?1, ?2)", params![key, z.name])?;
    Ok(())
  }

  pub fn put_card(&self, id: &str, c: &Card, stamp: Stamp) -> Result<()> {
    self.db.execute(
      "INSERT INTO cards (id, note, zone, x, y, w, h, halign, valign, mtime, size)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (id) DO UPDATE SET note = excluded.note, zone = excluded.zone, x = excluded.x, y = excluded.y,
         w = excluded.w, h = excluded.h, halign = excluded.halign, valign = excluded.valign,
         mtime = excluded.mtime, size = excluded.size",
      params![id, c.note, c.zone, c.x, c.y, c.w, c.h, c.halign.as_str(), c.valign.as_str(), stamp.mtime, stamp.size],
    )?;
    Ok(())
  }

  pub fn put_edge(&self, id: &str, e: &Edge, stamp: Stamp) -> Result<()> {
    self.db.execute(
      "INSERT INTO edges (id, from_card, to_card, label, shape, arrow, mtime, size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (id) DO UPDATE SET from_card = excluded.from_card, to_card = excluded.to_card,
         label = excluded.label, shape = excluded.shape, arrow = excluded.arrow, mtime = excluded.mtime, size = excluded.size",
      params![id, e.from, e.to, e.label, e.shape.as_str(), e.arrow.as_str(), stamp.mtime, stamp.size],
    )?;
    Ok(())
  }

  /// IDs of the edges that start or end at any of these cards.
  pub fn edges_touching(&self, cards: &[String]) -> Result<Vec<String>> {
    let mut stmt = self.db.prepare("SELECT id FROM edges WHERE from_card = ?1 OR to_card = ?1")?;
    let mut edges = Vec::new();
    for card in cards {
      for edge in stmt.query_map([card], |r| r.get::<_, String>(0))? {
        let edge = edge?;
        if !edges.contains(&edge) {
          edges.push(edge);
        }
      }
    }
    Ok(edges)
  }

  /// The edge between two cards, in either direction.
  pub fn edge_between(&self, a: &str, b: &str) -> Result<Option<String>> {
    let sql = "SELECT id FROM edges WHERE (from_card = ?1 AND to_card = ?2) OR (from_card = ?2 AND to_card = ?1)";
    Ok(self.db.query_row(sql, [a, b], |r| r.get(0)).optional()?)
  }

  /// The zones, then the cards, directly in `zone` (None: on the canvas). With `within`, only
  /// those lying fully inside it, in that zone's coordinates.
  pub fn children(&self, zone: Option<&str>, within: Option<Rect>) -> Result<Vec<(Kind, String)>> {
    const FITS: &str = "(?2 IS NULL OR (x >= ?2 AND y >= ?3 AND x + w <= ?4 AND y + h <= ?5))";
    let mut stmt = self.db.prepare(&format!(
      "SELECT 1, id FROM zones WHERE parent IS ?1 AND {FITS}
       UNION ALL
       SELECT 0, id FROM cards WHERE zone IS ?1 AND {FITS}"
    ))?;
    let args = params![zone, within.map(|r| r.min_x), within.map(|r| r.min_y), within.map(|r| r.max_x), within.map(|r| r.max_y)];
    let rows = stmt.query_map(args, |r| Ok((if r.get(0)? { Kind::Zone } else { Kind::Card }, r.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }

  pub fn remove_item(&self, kind: Kind, id: &str) -> Result<()> {
    let (table, bounds) = tables(kind);
    if kind == Kind::Zone {
      self.db.execute("DELETE FROM zones_fts WHERE rowid = (SELECT key FROM zones WHERE id = ?1)", [id])?;
    }
    self.db.execute(&format!("DELETE FROM {bounds} WHERE key = (SELECT key FROM {table} WHERE id = ?1)"), [id])?;
    self.db.execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])?;
    Ok(())
  }
}
