//! Edge edits: connecting two cards, inserting a card on an edge, labeling, styling (shape,
//! arrowheads, line) and deleting. Like card and zone edits, each hands the target item states to
//! `apply`, so every edit can be undone.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Arrow, Card, Edge, HAlign, Kind, Shape, Stroke, VAlign};
use crate::layout::Move;
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
    let edge = Edge { from: from.to_string(), to: to.to_string(), label: None, shape: Shape::default(), arrow: Arrow::default(), stroke: Stroke::default() };
    let undo = self.apply(vec![ItemState::of(&id, &edge)?])?;
    Ok(Created { id, undo })
  }

  /// Inserts an empty card on an edge, on the world rectangle `at` in `zone` (None: the canvas).
  /// The edge is split around it, from its first card to the new one and on to its second: both
  /// halves keep its style, and the first its label. The cards and zones given move to make room,
  /// as arranging moves them, and the zone grows where needed to hold them and the new card.
  pub fn insert_card(&self, edge: &str, zone: Option<&str>, at: Rect, cards: &[Move], zones: &[Move]) -> Result<Created> {
    let old: Edge = self.read(edge)?;
    let id = crate::new_id();
    let (x, y, w, h) = (at.min_x, at.min_y, at.max_x - at.min_x, at.max_y - at.min_y);
    let mut moves = cards.to_vec();
    let mut items = cards.iter().map(|m| self.read::<Card>(&m.id)).collect::<Result<Vec<_>>>()?;
    moves.push(Move { id: id.clone(), x, y });
    items.push(Card { note: None, zone: zone.map(str::to_string), x, y, w, h, halign: HAlign::default(), valign: VAlign::default() });
    let mut states = self.placed(&moves, items, zones)?;
    let first = Edge { to: id.clone(), ..old.clone() };
    let second = Edge { from: id.clone(), label: None, ..old };
    states.extend([ItemState::of(&crate::new_id(), &first)?, ItemState::of(&crate::new_id(), &second)?, ItemState::gone(Kind::Edge, edge)]);
    let undo = self.apply(states)?;
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

  pub fn stroke_edges(&self, ids: &[String], stroke: Stroke) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    self.edit::<Edge>(&ids, |_, edge| {
      edge.stroke = stroke;
      Ok(())
    })
  }

  pub fn delete_edges(&self, ids: &[String]) -> Result<Vec<ItemState>> {
    self.apply(ids.iter().map(|id| ItemState::gone(Kind::Edge, id)).collect())
  }
}
