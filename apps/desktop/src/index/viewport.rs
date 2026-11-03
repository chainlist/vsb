//! The viewport query: zones, cards, edges and drawings whose bounds meet a world rectangle.

use super::bounds::ZONE_ABS;
use super::views::{CardView, EdgeView, Frame, Viewport, ZoneView};
use super::{Index, Rect};
use crate::error::Result;
use crate::items::Preview;
use rusqlite::params;

/// R*Tree filter: bounds `b` meet the rectangle ?1..?4.
pub(super) const MEETS: &str = "b.max_x >= ?1 AND b.min_x <= ?3 AND b.max_y >= ?2 AND b.min_y <= ?4";
/// R*Tree filter: bounds `b` are at least ?5 wide or tall.
pub(super) const LARGE: &str = "(b.max_x - b.min_x >= ?5 OR b.max_y - b.min_y >= ?5)";

/// Zoomed out, what the loose cards come back as: counted per cell of the clusters' grid, this many
/// world units wide, or as themselves.
#[derive(Clone, Copy)]
pub enum Loose {
  Clusters(f64),
  Cards,
}

impl Index {
  /// Zones (parents first), cards, edges and drawings in `rect`, skipping those smaller than `min_size`
  /// world units. Zoomed out, with `loose` saying what loose cards come back as, nothing inside a zone
  /// comes back on its own: only the outermost zones with a preview of what they hold, the loose cards
  /// counted per cell or as themselves with the edges between them, the other edges bundled and the
  /// loose drawings.
  pub fn viewport(&self, rect: Rect, min_size: f64, loose: Option<Loose>) -> Result<Viewport> {
    let out = loose.is_some();
    let args = params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, min_size, out];
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT z.id, z.parent, coalesce(z.name, ''), z.color, zabs.ax, zabs.ay, z.w, z.h
       FROM zone_bounds b JOIN zones z ON z.key = b.key JOIN zabs ON zabs.id = z.id
       WHERE {MEETS} AND {LARGE} AND (NOT ?6 OR zabs.depth = 0) ORDER BY zabs.depth"
    ))?;
    let zones: Vec<ZoneView> = stmt
      .query_map(args, |r| {
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
    if let Some(Loose::Clusters(cell)) = loose {
      let (clusters, bundles, previews) = (self.clusters(rect, cell)?, self.bundles(rect, Some(cell))?, self.previews(rect, min_size, &zones)?);
      let drawings = self.drawings(rect, min_size, true)?;
      return Ok(Viewport { zones, cards: vec![], edges: vec![], drawings, clusters, bundles, previews });
    }
    // Zoomed out, only the loose cards and the edges between two of them come back as themselves.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT c.id, c.note, c.zone, coalesce(zabs.ax, 0) + c.x, coalesce(zabs.ay, 0) + c.y, c.w, c.h,
         c.halign, c.valign, c.color, n.title, n.excerpt, n.key IS NOT NULL, c.file, c.link,
         json_extract(c.preview, '$.title'), json_extract(c.preview, '$.description'), json_extract(c.preview, '$.image'), c.kind, c.view, c.scale
       FROM card_bounds b JOIN cards c ON c.key = b.key
       LEFT JOIN zabs ON zabs.id = c.zone LEFT JOIN notes n ON n.id = c.note
       WHERE {MEETS} AND {LARGE} AND (NOT ?6 OR zabs.id IS NULL)"
    ))?;
    let cards = stmt
      .query_map(args, |r| {
        Ok(CardView {
          id: r.get(0)?,
          kind: r.get(18)?,
          view: r.get(19)?,
          scale: r.get(20)?,
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
          file: r.get(13)?,
          link: r.get(14)?,
          preview: Some(Preview { title: r.get(15)?, description: r.get(16)?, image: r.get(17)? }).filter(|p| *p != Preview::default()),
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
       WHERE {MEETS} AND {LARGE} AND (NOT ?6 OR (fz.id IS NULL AND tz.id IS NULL))"
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
    let drawings = self.drawings(rect, min_size, out)?;
    let (bundles, previews) = if out { (self.bundles(rect, None)?, self.previews(rect, min_size, &zones)?) } else { (vec![], vec![]) };
    Ok(Viewport { zones, cards, edges, drawings, clusters: vec![], bundles, previews })
  }
}
