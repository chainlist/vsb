//! The viewport query: zones, cards and edges whose bounds meet a world rectangle.

use super::bounds::ZONE_ABS;
use super::views::{CardView, EdgeView, Frame, Viewport, ZoneView};
use super::{Index, Rect};
use crate::error::Result;
use rusqlite::params;

/// R*Tree filter: bounds `b` meet the rectangle ?1..?4.
pub(super) const MEETS: &str = "b.max_x >= ?1 AND b.min_x <= ?3 AND b.max_y >= ?2 AND b.min_y <= ?4";
/// R*Tree filter: bounds `b` are at least ?5 wide or tall.
pub(super) const LARGE: &str = "(b.max_x - b.min_x >= ?5 OR b.max_y - b.min_y >= ?5)";

impl Index {
  /// Zones (parents first), cards and edges in `rect`, skipping those smaller than `min_size` world
  /// units. Zoomed out, with the size of a `cell` of the clusters' grid (?6), nothing inside a zone
  /// comes back on its own: only the outermost zones with a preview of what they hold, the loose cards
  /// counted per cell and the edges bundled.
  pub fn viewport(&self, rect: Rect, min_size: f64, cell: Option<f64>) -> Result<Viewport> {
    let args = params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, min_size];
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT z.id, z.parent, coalesce(z.name, ''), z.color, zabs.ax, zabs.ay, z.w, z.h
       FROM zone_bounds b JOIN zones z ON z.key = b.key JOIN zabs ON zabs.id = z.id
       WHERE {MEETS} AND {LARGE} AND (?6 IS NULL OR zabs.depth = 0) ORDER BY zabs.depth"
    ))?;
    let zones: Vec<ZoneView> = stmt
      .query_map(params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, min_size, cell], |r| {
        Ok(ZoneView {
          id: r.get(0)?,
          parent: r.get(1)?,
          name: r.get(2)?,
          color: r.get(3)?,
          x: r.get(4)?,
          y: r.get(5)?,
          w: r.get(6)?,
          h: r.get(7)?,
        })
      })?
      .collect::<rusqlite::Result<_>>()?;
    if let Some(cell) = cell {
      let (clusters, bundles, previews) = (self.clusters(rect, cell)?, self.bundles(rect, cell)?, self.previews(rect, min_size, &zones)?);
      return Ok(Viewport { zones, cards: vec![], edges: vec![], clusters, bundles, previews });
    }
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT c.id, c.note, c.zone, coalesce(zabs.ax, 0) + c.x, coalesce(zabs.ay, 0) + c.y, c.w, c.h,
         c.halign, c.valign, c.color, n.title, n.excerpt, n.key IS NOT NULL
       FROM card_bounds b JOIN cards c ON c.key = b.key
       LEFT JOIN zabs ON zabs.id = c.zone LEFT JOIN notes n ON n.id = c.note
       WHERE {MEETS} AND {LARGE}"
    ))?;
    let cards = stmt
      .query_map(args, |r| {
        Ok(CardView {
          id: r.get(0)?,
          note: r.get(1)?,
          zone: r.get(2)?,
          x: r.get(3)?,
          y: r.get(4)?,
          w: r.get(5)?,
          h: r.get(6)?,
          halign: r.get(7)?,
          valign: r.get(8)?,
          color: r.get(9)?,
          title: r.get(10)?,
          excerpt: r.get(11)?,
          resolved: r.get(12)?,
        })
      })?
      .collect::<rusqlite::Result<_>>()?;
    // An edge's bounds cover both its cards, so one crossing the rectangle is found even when
    // neither card is inside it.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT e.id, e.from_card, e.to_card, e.label, e.shape, e.arrow, e.stroke,
         coalesce(fz.ax, 0) + f.x, coalesce(fz.ay, 0) + f.y, f.w, f.h,
         coalesce(tz.ax, 0) + t.x, coalesce(tz.ay, 0) + t.y, t.w, t.h
       FROM edge_bounds b JOIN edges e ON e.key = b.key
       JOIN cards f ON f.id = e.from_card LEFT JOIN zabs fz ON fz.id = f.zone
       JOIN cards t ON t.id = e.to_card LEFT JOIN zabs tz ON tz.id = t.zone
       WHERE {MEETS} AND {LARGE}"
    ))?;
    let frame = |r: &rusqlite::Row, at: usize| -> rusqlite::Result<Frame> {
      Ok(Frame { x: r.get(at)?, y: r.get(at + 1)?, w: r.get(at + 2)?, h: r.get(at + 3)? })
    };
    let edges = stmt
      .query_map(args, |r| {
        Ok(EdgeView {
          id: r.get(0)?,
          from: r.get(1)?,
          to: r.get(2)?,
          label: r.get(3)?,
          shape: r.get(4)?,
          arrow: r.get(5)?,
          stroke: r.get(6)?,
          ends: [frame(r, 7)?, frame(r, 11)?],
        })
      })?
      .collect::<rusqlite::Result<_>>()?;
    Ok(Viewport { zones, cards, edges, clusters: vec![], bundles: vec![], previews: vec![] })
  }
}
