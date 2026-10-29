//! Drawings in the index: those meeting the viewport, and the one a new stroke joins.

use super::bounds::ZONE_ABS;
use super::viewport::{LARGE, MEETS};
use super::views::DrawingView;
use super::{Index, Rect};
use crate::error::Result;
use rusqlite::{params, OptionalExtension};

impl Index {
  /// The drawings meeting `rect` and at least `min_size` wide or tall, oldest first, so newer ones
  /// are drawn on top. With `loose`, only those in no zone: zoomed out, a zone's drawings are in its
  /// preview. A drawing whose zone is missing (not synced yet) sits on the canvas, so it is loose.
  pub fn drawings(&self, rect: Rect, min_size: f64, loose: bool) -> Result<Vec<DrawingView>> {
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT d.id, d.zone, coalesce(zabs.ax, 0) + d.x, coalesce(zabs.ay, 0) + d.y, d.w, d.h, d.strokes
       FROM drawing_bounds b JOIN drawings d ON d.key = b.key LEFT JOIN zabs ON zabs.id = d.zone
       WHERE {MEETS} AND {LARGE} AND (NOT ?6 OR zabs.id IS NULL) ORDER BY d.id"
    ))?;
    let args = params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, min_size, loose];
    let rows = stmt.query_map(args, |r| {
      let view = DrawingView {
        id: r.get(0)?,
        zone: r.get(1)?,
        x: r.get(2)?,
        y: r.get(3)?,
        w: r.get(4)?,
        h: r.get(5)?,
        strokes: Vec::new(),
      };
      Ok((view, r.get::<_, String>(6)?))
    })?;
    let mut drawings = Vec::new();
    for row in rows {
      let (mut view, strokes) = row?;
      view.strokes = serde_json::from_str(&strokes)?;
      drawings.push(view);
    }
    Ok(drawings)
  }

  /// The drawing whose box is nearest a world point, if one lies within `reach` of it, with that box.
  /// Equally near, the oldest.
  pub fn nearest_drawing(&self, x: f64, y: f64, reach: f64) -> Result<Option<(String, Rect)>> {
    let sql = format!(
      "WITH RECURSIVE {ZONE_ABS},
       near (id, x1, y1, x2, y2) AS (
         SELECT d.id, coalesce(zabs.ax, 0) + d.x, coalesce(zabs.ay, 0) + d.y, coalesce(zabs.ax, 0) + d.x + max(d.w, 0),
           coalesce(zabs.ay, 0) + d.y + max(d.h, 0)
         FROM drawing_bounds b JOIN drawings d ON d.key = b.key LEFT JOIN zabs ON zabs.id = d.zone
         WHERE b.max_x >= ?1 - ?3 AND b.min_x <= ?1 + ?3 AND b.max_y >= ?2 - ?3 AND b.min_y <= ?2 + ?3
       )
       SELECT id, x1, y1, x2, y2, max(x1 - ?1, ?1 - x2, 0) AS dx, max(y1 - ?2, ?2 - y2, 0) AS dy FROM near
       WHERE dx * dx + dy * dy <= ?3 * ?3 ORDER BY dx * dx + dy * dy, id LIMIT 1"
    );
    let row = self.db.query_row(&sql, params![x, y, reach], |r| {
      Ok((r.get(0)?, Rect { min_x: r.get(1)?, min_y: r.get(2)?, max_x: r.get(3)?, max_y: r.get(4)? }))
    });
    Ok(row.optional()?)
  }
}
