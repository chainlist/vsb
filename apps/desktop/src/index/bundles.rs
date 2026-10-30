//! Zoomed out, the edges between two ends (outermost zones and clusters of loose cards) are drawn
//! as one line, a bundle.

use super::bounds::ZONE_ABS;
use super::viewport::MEETS;
use super::views::{BundleEnd, BundleView};
use super::{Index, Rect};
use crate::error::{msg, Result};
use crate::items::Kind;
use rusqlite::{params, Row};
use std::collections::BTreeMap;

/// Where a card is drawn zoomed out: as its outermost zone or, loose, as its square's cluster.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum End {
  Zone(String),
  Cell(i64, i64),
}

impl Index {
  /// The edges crossing `rect`, one bundle per pair of ends, with `cell` the size of the clusters'
  /// grid. An edge whose cards are drawn at the same end lies inside it, and is left out.
  pub fn bundles(&self, rect: Rect, cell: f64) -> Result<Vec<BundleView>> {
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT e.arrow, fz.root, floor((f.x + f.w / 2) / ?5), floor((f.y + f.h / 2) / ?5),
         tz.root, floor((t.x + t.w / 2) / ?5), floor((t.y + t.h / 2) / ?5)
       FROM edge_bounds b JOIN edges e ON e.key = b.key
       JOIN cards f ON f.id = e.from_card LEFT JOIN zabs fz ON fz.id = f.zone
       JOIN cards t ON t.id = e.to_card LEFT JOIN zabs tz ON tz.id = t.zone
       WHERE {MEETS}"
    ))?;
    let end = |r: &Row, at: usize| -> rusqlite::Result<End> {
      Ok(match r.get(at)? {
        Some(zone) => End::Zone(zone),
        None => End::Cell(r.get::<_, f64>(at + 1)? as i64, r.get::<_, f64>(at + 2)? as i64),
      })
    };
    // Per pair of ends, in order: how many edges, and whether any points at the first, the second.
    let mut pairs = BTreeMap::<(End, End), (i64, bool, bool)>::new();
    let args = params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, cell];
    for row in stmt.query_map(args, |r| Ok((r.get::<_, String>(0)?, end(r, 1)?, end(r, 4)?)))? {
      let (arrow, from, to) = row?;
      if from == to {
        continue;
      }
      let (at_from, at_to) = (arrow == "both", arrow != "none");
      let (key, heads) = if from < to { ((from, to), (at_from, at_to)) } else { ((to, from), (at_to, at_from)) };
      let pair = pairs.entry(key).or_default();
      pair.0 += 1;
      pair.1 |= heads.0;
      pair.2 |= heads.1;
    }
    pairs
      .into_iter()
      .map(|((a, b), (count, at_a, at_b))| {
        // A lone arrowhead goes on the second end, as an edge's goes on `to`.
        let (from, to, arrow) = match (at_a, at_b) {
          (true, true) => (a, b, "both"),
          (true, false) => (b, a, "to"),
          (false, true) => (a, b, "to"),
          (false, false) => (a, b, "none"),
        };
        Ok(BundleView { ends: [self.end(from, cell)?, self.end(to, cell)?], count, arrow: arrow.into() })
      })
      .collect()
  }

  /// An end's box: its zone's, or that of its square's cluster.
  fn end(&self, end: End, cell: f64) -> Result<BundleEnd> {
    match end {
      End::Zone(id) => {
        let Some(r) = self.item_box(Kind::Zone, &id)? else { return msg(format!("zone {id} is not indexed")) };
        Ok(BundleEnd { zone: Some(id), x: r.min_x, y: r.min_y, w: r.max_x - r.min_x, h: r.max_y - r.min_y })
      }
      End::Cell(cx, cy) => {
        // The square's middle touches no other square.
        let middle = Rect::of((cx as f64 + 0.5) * cell, (cy as f64 + 0.5) * cell, 0.0, 0.0);
        let Some(c) = self.clusters(middle, cell)?.pop() else { return msg("a bundle's cluster is empty") };
        Ok(BundleEnd { zone: None, x: c.x, y: c.y, w: c.w, h: c.h })
      }
    }
  }
}
