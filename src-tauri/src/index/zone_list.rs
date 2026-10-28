//! The zone list beside the canvas: a level of the zone tree at a time, one page at a time, so the
//! list never holds every zone.

use super::bounds::ZONE_ABS;
use super::Index;
use crate::error::Result;
use rusqlite::params;
use serde::Serialize;

/// One line of the zone list: a zone, whether zones lie inside it, how many cards it holds at any
/// depth, and its box in the world.
#[derive(Serialize, Debug, PartialEq)]
pub struct ZoneRow {
  pub id: String,
  pub name: String,
  pub color: Option<String>,
  pub inner: bool,
  pub cards: i64,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

impl Index {
  /// The zones directly inside `parent`, or on the canvas for None, by name ignoring case.
  pub fn zone_rows(&self, parent: Option<&str>, offset: u32, limit: u32) -> Result<Vec<ZoneRow>> {
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS},
       page AS (
         SELECT z.id, coalesce(z.name, '') AS name, z.color, zabs.ax, zabs.ay, z.w, z.h FROM zones z JOIN zabs USING (id)
         WHERE (?1 IS NULL AND zabs.depth = 0) OR z.parent = ?1
         ORDER BY name COLLATE NOCASE, z.id LIMIT ?3 OFFSET ?2
       ),
       -- Each zone of the page with every zone inside it, at any depth.
       sub (top, id) AS (SELECT id, id FROM page UNION ALL SELECT sub.top, z.id FROM zones z JOIN sub ON z.parent = sub.id)
       SELECT p.id, p.name, p.color, EXISTS (SELECT 1 FROM zones WHERE parent = p.id),
         (SELECT count(*) FROM sub JOIN cards c ON c.zone = sub.id WHERE sub.top = p.id), p.ax, p.ay, p.w, p.h
       FROM page p ORDER BY p.name COLLATE NOCASE, p.id"
    ))?;
    let rows = stmt.query_map(params![parent, offset, limit], |r| {
      Ok(ZoneRow {
        id: r.get(0)?,
        name: r.get(1)?,
        color: r.get(2)?,
        inner: r.get(3)?,
        cards: r.get(4)?,
        x: r.get(5)?,
        y: r.get(6)?,
        w: r.get(7)?,
        h: r.get(8)?,
      })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }
}
