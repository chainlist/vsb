//! What arranging a zone lays out: its own cards, and its inner zones, each as one block with
//! everything in it.

use super::bounds::ZONE_ABS;
use super::Index;
use crate::error::Result;
use serde::Serialize;
use std::collections::HashMap;

/// A card or an inner zone of the zone, with its box in the world.
#[derive(Serialize, Debug, PartialEq)]
pub struct Node {
  pub zone: bool,
  pub id: String,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// An edge between two nodes, as indexes into them.
#[derive(Serialize, Debug, PartialEq)]
pub struct NodeEdge {
  pub from: usize,
  pub to: usize,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct ZoneNodes {
  pub nodes: Vec<Node>,
  pub edges: Vec<NodeEdge>,
}

impl Index {
  /// The cards and the zones directly in a zone, and the edges between them. An edge to a card in
  /// an inner zone, at any depth, joins that zone; edges within one node are left out.
  pub fn zone_nodes(&self, id: &str) -> Result<ZoneNodes> {
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT 0, c.id, coalesce(zabs.ax, 0) + c.x, coalesce(zabs.ay, 0) + c.y, c.w, c.h
       FROM cards c LEFT JOIN zabs ON zabs.id = c.zone WHERE c.zone = ?1
       UNION ALL
       SELECT 1, z.id, zabs.ax, zabs.ay, z.w, z.h FROM zones z JOIN zabs USING (id) WHERE z.parent = ?1
       ORDER BY 1, 2"
    ))?;
    let rows = stmt.query_map([id], |r| Ok(Node { zone: r.get(0)?, id: r.get(1)?, x: r.get(2)?, y: r.get(3)?, w: r.get(4)?, h: r.get(5)? }))?;
    let nodes: Vec<Node> = rows.collect::<rusqlite::Result<_>>()?;
    let at: HashMap<&str, usize> = nodes.iter().enumerate().map(|(i, n)| (n.id.as_str(), i)).collect();
    // Each card inside the zone, at any depth, with the node it belongs to.
    let mut stmt = self.db.prepare(
      "WITH RECURSIVE
       under (id, top) AS (
         SELECT id, id FROM zones WHERE parent = ?1
         UNION SELECT z.id, under.top FROM zones z JOIN under ON z.parent = under.id
       ),
       owner (card, node) AS (
         SELECT id, id FROM cards WHERE zone = ?1
         UNION ALL SELECT c.id, under.top FROM cards c JOIN under ON c.zone = under.id
       )
       SELECT DISTINCT a.node, b.node FROM edges e
       JOIN owner a ON a.card = e.from_card JOIN owner b ON b.card = e.to_card
       WHERE a.node <> b.node ORDER BY 1, 2",
    )?;
    let pairs = stmt.query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut edges = Vec::new();
    for pair in pairs {
      let (from, to) = pair?;
      edges.push(NodeEdge { from: at[from.as_str()], to: at[to.as_str()] });
    }
    Ok(ZoneNodes { nodes, edges })
  }
}
