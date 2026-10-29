//! Edge edits: connecting two cards, inserting a card on an edge, adding a linked card after one,
//! labeling, styling (shape, arrowheads, line) and deleting. Like card and zone edits, each hands
//! the target item states to `apply`, so every edit can be undone.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Arrow, Card, Edge, EdgeStyle, HAlign, Kind, Shape, Stroke, VAlign};
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
    let undo = self.apply(vec![ItemState::of(&id, &new_edge(from, to, self.vault.edge_style()?))?])?;
    Ok(Created { id, undo })
  }

  /// Inserts an empty card on an edge, on the world rectangle `at` in `zone` (None: the canvas).
  /// The edge is split around it, from its first card to the new one and on to its second: both
  /// halves keep its style, not the style for new edges, and the first its label. The cards, zones and drawings given move to make room,
  /// as arranging moves them, and the zone grows where needed to hold them and the new card.
  pub fn insert_card(&self, edge: &str, zone: Option<&str>, at: Rect, cards: &[Move], zones: &[Move], drawings: &[Move]) -> Result<Created> {
    let old: Edge = self.read(edge)?;
    let id = crate::new_id();
    let mut moves = cards.to_vec();
    let mut items = cards.iter().map(|m| self.read::<Card>(&m.id)).collect::<Result<Vec<_>>>()?;
    let (place, card) = empty_card(&id, zone.map(str::to_string), at);
    moves.push(place);
    items.push(card);
    let mut states = self.placed(&moves, items, zones, drawings)?;
    let first = Edge { to: id.clone(), ..old.clone() };
    let second = Edge { from: id.clone(), label: None, ..old };
    states.extend([ItemState::of(&crate::new_id(), &first)?, ItemState::of(&crate::new_id(), &second)?, ItemState::gone(Kind::Edge, edge)]);
    let undo = self.apply(states)?;
    Ok(Created { id, undo })
  }

  /// Adds an empty card on the world rectangle `at`, in the zone of the card `from` whatever lies
  /// under it, with a new edge from that card to it. The zone grows where needed to hold it.
  pub fn add_child(&self, from: &str, at: Rect) -> Result<Created> {
    let parent: Card = self.read(from)?;
    let id = crate::new_id();
    let (place, card) = empty_card(&id, parent.zone, at);
    let mut states = self.placed(&[place], vec![card], &[], &[])?;
    states.push(ItemState::of(&crate::new_id(), &new_edge(from, &id, self.vault.edge_style()?))?);
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

/// An edge from one card to another, with no label, in the vault's style for new edges.
fn new_edge(from: &str, to: &str, style: EdgeStyle) -> Edge {
  let EdgeStyle { shape, arrow, stroke } = style;
  Edge { from: from.to_string(), to: to.to_string(), label: None, shape, arrow, stroke }
}

/// An empty card on the world rectangle `at` in `zone`, and where it is placed.
fn empty_card(id: &str, zone: Option<String>, at: Rect) -> (Move, Card) {
  let (x, y, w, h) = (at.min_x, at.min_y, at.max_x - at.min_x, at.max_y - at.min_y);
  let card = Card { note: None, zone, x, y, w, h, halign: HAlign::default(), valign: VAlign::default(), color: None };
  (Move { id: id.to_string(), x, y }, card)
}
