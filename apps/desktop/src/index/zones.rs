//! Zone lookups for placing items: a zone's absolute origin, and the innermost zone around a rectangle.

use super::bounds::ZONE_ABS;
use super::{Index, Rect};
use crate::error::Result;
use rusqlite::{params, OptionalExtension};

impl Index {
  /// A zone's absolute origin, if the zone is indexed.
  pub fn zone_origin(&self, id: &str) -> Result<Option<(f64, f64)>> {
    let sql = format!("WITH RECURSIVE {ZONE_ABS} SELECT ax, ay FROM zabs WHERE id = ?1");
    Ok(self.db.query_row(&sql, [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?)
  }

  /// The innermost zone that fully contains a world rectangle, with its absolute origin. Zones
  /// in `exclude`, and every zone inside them, are skipped. The canvas is (None, 0, 0).
  pub fn zone_around(&self, r: Rect, exclude: &[&str]) -> Result<(Option<String>, f64, f64)> {
    let sql = format!(
      "WITH RECURSIVE {ZONE_ABS},
       skip (id) AS (SELECT value FROM json_each(?5) UNION SELECT z.id FROM zones z JOIN skip ON z.parent = skip.id)
       SELECT z.id, zabs.ax, zabs.ay
       FROM zone_bounds b JOIN zones z ON z.key = b.key JOIN zabs ON zabs.id = z.id
       WHERE b.min_x <= ?1 AND b.max_x >= ?3 AND b.min_y <= ?2 AND b.max_y >= ?4
         AND zabs.ax <= ?1 AND zabs.ax + z.w >= ?3 AND zabs.ay <= ?2 AND zabs.ay + z.h >= ?4
         AND z.id NOT IN skip
       ORDER BY zabs.depth DESC, z.w * z.h LIMIT 1"
    );
    let args = params![r.min_x, r.min_y, r.max_x, r.max_y, serde_json::to_string(exclude)?];
    let row = self.db.query_row(&sql, args, |r| Ok((Some(r.get(0)?), r.get(1)?, r.get(2)?)));
    Ok(row.optional()?.unwrap_or((None, 0.0, 0.0)))
  }
}
