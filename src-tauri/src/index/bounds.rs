//! Absolute bounds in the R*Trees. Files store coordinates relative to the zone; bounds are
//! always recomputed from those exact values, never shifted by offsets inside the R*Tree.

use super::{Index, Rect};
use crate::error::{msg, Result};
use crate::items::Kind;
use rusqlite::OptionalExtension;

/// `zabs`: absolute origin, nesting depth and outermost zone of every zone, walking `parent` down
/// from the canvas. A zone whose parent is missing (not synced yet) sits on the canvas.
pub(super) const ZONE_ABS: &str = "
  zabs (id, ax, ay, depth, root) AS (
    SELECT id, x, y, 0, id FROM zones WHERE parent IS NULL OR parent NOT IN (SELECT id FROM zones)
    UNION ALL
    SELECT z.id, zabs.ax + z.x, zabs.ay + z.y, zabs.depth + 1, zabs.root FROM zones z JOIN zabs ON z.parent = zabs.id
    WHERE zabs.depth < 64
  )";

/// What a refresh covers, from the parameters ?1 (a card) and ?2 (a zone), both NULL for all.
/// `inside`: zone ?2 and every zone within it. `moved`: card ?1, or the cards in `inside`.
const SCOPE: &str = "
  inside (id) AS (
    SELECT id FROM zones WHERE id = ?2 OR coalesce(?1, ?2) IS NULL
    UNION
    SELECT z.id FROM zones z JOIN inside ON z.parent = inside.id
  ),
  moved (id) AS (
    SELECT id FROM cards WHERE id = ?1 OR zone IN (SELECT id FROM inside) OR coalesce(?1, ?2) IS NULL
  )";

/// `cabs`: absolute boxes of the moved cards and of their edge neighbours.
const CARD_ABS: &str = "
  cabs (key, id, ax, ay, w, h) AS (
    SELECT c.key, c.id, coalesce(zabs.ax, 0) + c.x, coalesce(zabs.ay, 0) + c.y, max(c.w, 0), max(c.h, 0)
    FROM cards c LEFT JOIN zabs ON zabs.id = c.zone
    WHERE c.id IN moved
      OR c.id IN (SELECT to_card FROM edges WHERE from_card IN moved)
      OR c.id IN (SELECT from_card FROM edges WHERE to_card IN moved)
  )";

/// Which bounds a refresh recomputes.
#[derive(Clone, Copy)]
pub enum Scope<'a> {
  All,
  /// One card and its edges.
  Card(&'a str),
  /// A zone, every zone and card inside it at any depth, and the edges of those cards.
  Zone(&'a str),
}

impl<'a> Scope<'a> {
  fn params(self) -> (Option<&'a str>, Option<&'a str>) {
    match self {
      Scope::All => (None, None),
      Scope::Card(id) => (Some(id), None),
      Scope::Zone(id) => (None, Some(id)),
    }
  }
}

impl Index {
  pub fn refresh_bounds(&self, scope: Scope) -> Result<()> {
    if let Scope::All = scope {
      self.db.execute_batch("DELETE FROM zone_bounds; DELETE FROM card_bounds; DELETE FROM edge_bounds;")?;
    }
    let (card, zone) = scope.params();
    self.db.execute(
      &format!(
        "WITH RECURSIVE {ZONE_ABS}, {SCOPE}
         INSERT OR REPLACE INTO zone_bounds
         SELECT z.key, zabs.ax, zabs.ax + max(z.w, 0), zabs.ay, zabs.ay + max(z.h, 0)
         FROM zabs JOIN zones z ON z.id = zabs.id WHERE z.id IN inside"
      ),
      (card, zone),
    )?;
    self.db.execute(
      &format!(
        "WITH RECURSIVE {ZONE_ABS}, {SCOPE}, {CARD_ABS}
         INSERT OR REPLACE INTO card_bounds
         SELECT key, ax, ax + w, ay, ay + h FROM cabs WHERE id IN moved"
      ),
      (card, zone),
    )?;
    self.db.execute(
      &format!(
        "WITH RECURSIVE {ZONE_ABS}, {SCOPE}, {CARD_ABS}
         INSERT OR REPLACE INTO edge_bounds
         SELECT e.key, min(a.ax, b.ax), max(a.ax + a.w, b.ax + b.w), min(a.ay, b.ay), max(a.ay + a.h, b.ay + b.h)
         FROM edges e JOIN cabs a ON a.id = e.from_card JOIN cabs b ON b.id = e.to_card
         WHERE e.from_card IN moved OR e.to_card IN moved"
      ),
      (card, zone),
    )?;
    Ok(())
  }

  /// The world area covered by everything inside a zone, at any depth. None when it is empty.
  pub fn zone_contents(&self, id: &str) -> Result<Option<Rect>> {
    self.contents(Scope::Zone(id))
  }

  /// The world area covered by every zone and card. None for an empty canvas.
  pub fn canvas_contents(&self) -> Result<Option<Rect>> {
    self.contents(Scope::All)
  }

  /// A card's or a zone's own box in the world. None when it is not indexed.
  pub fn item_box(&self, kind: Kind, id: &str) -> Result<Option<Rect>> {
    match kind {
      Kind::Card => self.contents(Scope::Card(id)),
      Kind::Zone => {
        let sql = format!("WITH RECURSIVE {ZONE_ABS} SELECT ax, ay, w, h FROM zabs JOIN zones USING (id) WHERE id = ?1");
        Ok(self.db.query_row(&sql, [id], |r| Ok(Rect::of(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional()?)
      }
      Kind::Edge => msg("an edge has no box of its own"),
    }
  }

  /// What a scope's zones (other than a scoped zone itself) and cards cover, from the exact coordinates.
  fn contents(&self, scope: Scope) -> Result<Option<Rect>> {
    let sql = format!(
      "WITH RECURSIVE {ZONE_ABS}, {SCOPE}, {CARD_ABS},
       boxes (x1, y1, x2, y2) AS (
         SELECT zabs.ax, zabs.ay, zabs.ax + max(z.w, 0), zabs.ay + max(z.h, 0)
         FROM zabs JOIN zones z ON z.id = zabs.id WHERE z.id IN inside AND z.id IS NOT ?2
         UNION ALL
         SELECT ax, ay, ax + w, ay + h FROM cabs WHERE id IN moved
       )
       SELECT min(x1), min(y1), max(x2), max(y2) FROM boxes"
    );
    let (card, zone) = scope.params();
    let row: [Option<f64>; 4] = self.db.query_row(&sql, (card, zone), |r| Ok([r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?]))?;
    Ok(match row {
      [Some(min_x), Some(min_y), Some(max_x), Some(max_y)] => Some(Rect { min_x, min_y, max_x, max_y }),
      _ => None,
    })
  }
}
