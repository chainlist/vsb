//! Edge edits: connecting two cards, labeling, styling and deleting. Like card and zone edits,
//! each hands the target item states to `apply`, so every edit can be undone.

use crate::error::{msg, Result};
use crate::items::{Arrow, Card, Edge, Kind, Shape};
use crate::session::Session;
use crate::states::{Created, ItemState};

impl Session {
  /// Connects two different cards. Two cards are connected at most once, either way round: when
  /// they already are, the existing edge comes back with nothing to undo.
  pub fn create_edge(&self, from: &str, to: &str) -> Result<Created> {
    if from == to {
      return msg("an edge joins two different cards");
    }
    if let Some(id) = self.index.edge_between(from, to)? {
      return Ok(Created { id, undo: Vec::new() });
    }
    // An edge never points at a card file that is not there.
    self.read::<Card>(from)?;
    self.read::<Card>(to)?;
    let id = crate::new_id();
    let edge = Edge { from: from.to_string(), to: to.to_string(), label: None, shape: Shape::default(), arrow: Arrow::default() };
    let undo = self.apply(vec![ItemState::of(&id, &edge)?])?;
    Ok(Created { id, undo })
  }

  /// Sets an edge's label; an empty one removes it.
  pub fn label_edge(&self, id: &str, label: &str) -> Result<Vec<ItemState>> {
    let label = label.trim();
    self.edit::<Edge>(&[id], |_, edge| {
      edge.label = (!label.is_empty()).then(|| label.to_string());
      Ok(())
    })
  }

  pub fn shape_edges(&self, ids: &[String], shape: Shape) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    self.edit::<Edge>(&ids, |_, edge| {
      edge.shape = shape;
      Ok(())
    })
  }

  pub fn arrow_edges(&self, ids: &[String], arrow: Arrow) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    self.edit::<Edge>(&ids, |_, edge| {
      edge.arrow = arrow;
      Ok(())
    })
  }

  pub fn delete_edges(&self, ids: &[String]) -> Result<Vec<ItemState>> {
    self.apply(ids.iter().map(|id| ItemState::gone(Kind::Edge, id)).collect())
  }
}
