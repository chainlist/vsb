//! What the batch builder opens with, to edit the edges between cards: the cards of a zone, at any
//! depth, or the selected cards with every card an edge joins to them, by their titles, and the
//! edges between them.

use super::bounds::ZONE_ABS;
use super::Index;
use crate::error::Result;
use rusqlite::params;
use serde::Serialize;

/// A card the builder opens with: its title, the first line of its note, and its box in the world.
#[derive(Serialize, Debug, PartialEq)]
pub struct ScopeCard {
  pub id: String,
  pub title: String,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// An edge between two of the cards the builder opens with.
#[derive(Serialize, Debug, PartialEq)]
pub struct ScopeEdge {
  pub id: String,
  pub from: String,
  pub to: String,
  pub arrow: String,
  pub stroke: String,
}

/// The cards, top to bottom then left to right, the edges between them, and the zone new cards join.
#[derive(Serialize, Debug, PartialEq)]
pub struct BatchScope {
  pub zone: Option<String>,
  pub cards: Vec<ScopeCard>,
  pub edges: Vec<ScopeEdge>,
}

impl Index {
  /// The cards inside `zone` at any depth, or else the cards `ids` and every card an edge joins to
  /// one of them. A card with no title (empty, unresolved, or a note whose first line is blank)
  /// cannot be written, so it is left out. New cards join `zone`, or the zone the cards `ids` all
  /// share, or the canvas.
  pub fn batch_scope(&self, zone: Option<&str>, ids: &[String]) -> Result<BatchScope> {
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS},
       inside (id) AS (SELECT ?1 UNION SELECT z.id FROM zones z JOIN inside ON z.parent = inside.id),
       picked (id) AS (SELECT value FROM json_each(?2)),
       joined (id) AS (
         SELECT id FROM picked
         UNION SELECT to_card FROM edges WHERE from_card IN picked
         UNION SELECT from_card FROM edges WHERE to_card IN picked
       )
       SELECT c.id, n.title, coalesce(zabs.ax, 0) + c.x AS ax, coalesce(zabs.ay, 0) + c.y AS ay, c.w, c.h,
         c.id IN picked, c.zone
       FROM cards c JOIN notes n ON n.id = c.note LEFT JOIN zabs ON zabs.id = c.zone
       WHERE CASE WHEN ?1 IS NULL THEN c.id IN joined ELSE c.zone IN inside END
         AND trim(coalesce(n.title, '')) <> ''
       ORDER BY ay, ax, c.id"
    ))?;
    let rows = stmt.query_map(params![zone, serde_json::to_string(ids)?], |r| {
      let card = ScopeCard { id: r.get(0)?, title: r.get(1)?, x: r.get(2)?, y: r.get(3)?, w: r.get(4)?, h: r.get(5)? };
      Ok((card, (r.get::<_, bool>(6)?, r.get::<_, Option<String>>(7)?)))
    })?;
    let (cards, zones): (Vec<ScopeCard>, Vec<(bool, Option<String>)>) = rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().unzip();
    // The zone of the picked cards, not of the cards joined to them.
    let zones: Vec<Option<String>> = zones.into_iter().filter_map(|(picked, zone)| picked.then_some(zone)).collect();
    let shared = zones.first().filter(|z| zones.iter().all(|o| o == *z)).cloned().flatten();
    let ids: Vec<String> = cards.iter().map(|c| c.id.clone()).collect();
    Ok(BatchScope { zone: zone.map(str::to_string).or(shared), edges: self.edges_among(&ids)?, cards })
  }

  /// The edges with both ends among these cards.
  pub fn edges_among(&self, ids: &[String]) -> Result<Vec<ScopeEdge>> {
    let mut stmt = self.db.prepare(
      "SELECT id, from_card, to_card, arrow, stroke FROM edges
       WHERE from_card IN (SELECT value FROM json_each(?1)) AND to_card IN (SELECT value FROM json_each(?1)) ORDER BY id",
    )?;
    let rows = stmt.query_map([serde_json::to_string(ids)?], |r| {
      Ok(ScopeEdge { id: r.get(0)?, from: r.get(1)?, to: r.get(2)?, arrow: r.get(3)?, stroke: r.get(4)? })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }
}
