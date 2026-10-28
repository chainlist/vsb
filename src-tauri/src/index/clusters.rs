//! Zoomed out, loose cards are counted per square of a grid instead of being returned one by one.

use super::bounds::ZONE_ABS;
use super::viewport::MEETS;
use super::views::ClusterView;
use super::{Index, Rect};
use crate::error::Result;
use rusqlite::params;

impl Index {
  /// The loose cards in the `cell`-sized squares of the grid that `rect` touches, counted per
  /// square, each card in the square holding its center. Every square comes back with all its cards,
  /// even those beyond `rect`. The cards themselves never come back.
  pub fn clusters(&self, rect: Rect, cell: f64) -> Result<Vec<ClusterView>> {
    // floor(), not CAST(... AS INTEGER), which rounds toward zero and would make the squares on
    // either side of 0 one square, twice as wide.
    let [x0, y0, x1, y1] = [rect.min_x, rect.min_y, rect.max_x, rect.max_y].map(|v| (v / cell).floor());
    // A card whose zone is missing (not synced yet) sits on the canvas, so it is loose.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT floor((c.x + c.w / 2) / ?5) AS cx, floor((c.y + c.h / 2) / ?5) AS cy, count(*),
         min(c.x), min(c.y), max(c.x + c.w), max(c.y + c.h)
       FROM card_bounds b JOIN cards c ON c.key = b.key LEFT JOIN zabs ON zabs.id = c.zone
       WHERE {MEETS} AND zabs.id IS NULL
       GROUP BY cx, cy HAVING cx BETWEEN ?6 AND ?8 AND cy BETWEEN ?7 AND ?9"
    ))?;
    // The squares' outer edges, so their cards are found wherever they lie in them.
    let args = params![x0 * cell, y0 * cell, (x1 + 1.0) * cell, (y1 + 1.0) * cell, cell, x0, y0, x1, y1];
    let clusters = stmt
      .query_map(args, |r| {
        let (min_x, min_y): (f64, f64) = (r.get(3)?, r.get(4)?);
        Ok(ClusterView {
          cell: [r.get::<_, f64>(0)? as i64, r.get::<_, f64>(1)? as i64],
          count: r.get(2)?,
          x: min_x,
          y: min_y,
          w: r.get::<_, f64>(5)? - min_x,
          h: r.get::<_, f64>(6)? - min_y,
        })
      })?
      .collect::<rusqlite::Result<_>>()?;
    Ok(clusters)
  }
}
