//! Batch creation: new notes, a card for each and the edges between them, as one edit. The
//! frontend parses the batch syntax and lays it out; this writes the result.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Arrow, Card, Edge, HAlign, Kind, Shape, Stroke, VAlign};
use crate::session::Session;
use crate::states::ItemState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Room a zone grown for a batch leaves around its cards, in world units: a graph-paper square on
/// the sides and bottom, three at the top, where the zone's name is.
const MARGIN: f64 = 20.0;
const NAME_ROOM: f64 = 60.0;

/// A card to create on a world rectangle, with a new note holding `text`.
#[derive(Deserialize, Clone, Debug)]
pub struct BatchCard {
  pub text: String,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// An edge to create between two of the batch's cards, given as indexes into them.
#[derive(Deserialize, Clone, Copy, Debug)]
pub struct BatchEdge {
  pub from: usize,
  pub to: usize,
  pub arrow: Arrow,
  pub stroke: Stroke,
}

/// The new cards' IDs, in the order they were given, and the states that undo the batch.
#[derive(Serialize, Debug)]
pub struct Batch {
  pub cards: Vec<String>,
  pub undo: Vec<ItemState>,
}

impl Session {
  /// Writes a note for each card, then the cards, then the edges between them. The cards are centered, and all join the innermost zone under the world
  /// point (x, y), which grows to hold them, its contents staying in place. Undoing the batch
  /// keeps the notes, unplaced, as deleting any card does.
  pub fn create_batch(&self, x: f64, y: f64, cards: &[BatchCard], edges: &[BatchEdge]) -> Result<Batch> {
    if cards.iter().any(|c| c.text.trim().is_empty()) {
      return msg("every card in a batch has text");
    }
    if edges.iter().any(|e| e.from == e.to || e.from >= cards.len() || e.to >= cards.len()) {
      return msg("an edge in a batch joins two of its cards");
    }
    let Some(span) = cards.iter().map(|c| Rect::of(c.x, c.y, c.w, c.h)).reduce(Rect::union) else {
      return Ok(Batch { cards: Vec::new(), undo: Vec::new() });
    };
    let (zone, mut ox, mut oy) = self.index.zone_around(Rect::of(x, y, 0.0, 0.0), &[])?;
    let mut states = Vec::new();
    if let Some(zone) = &zone {
      let Some(frame) = self.index.item_box(Kind::Zone, zone)? else {
        return msg("zone not found");
      };
      let room = Rect { min_x: span.min_x - MARGIN, min_y: span.min_y - NAME_ROOM, max_x: span.max_x + MARGIN, max_y: span.max_y + MARGIN };
      let grown = frame.union(room);
      if grown != frame {
        states = self.reshaped(zone, grown)?;
        (ox, oy) = (grown.min_x, grown.min_y);
      }
    }
    let ids: Vec<String> = cards.iter().map(|_| crate::new_id()).collect();
    for (id, c) in ids.iter().zip(cards) {
      let note = Some(self.new_note(&c.text)?);
      let card = Card { note, zone: zone.clone(), x: c.x - ox, y: c.y - oy, w: c.w, h: c.h, halign: HAlign::Center, valign: VAlign::Center };
      states.push(ItemState::of(id, &card)?);
    }
    // At most one edge between two cards, either way round.
    let mut joined = HashSet::new();
    for e in edges {
      if joined.insert((e.from.min(e.to), e.from.max(e.to))) {
        let (from, to) = (ids[e.from].clone(), ids[e.to].clone());
        let edge = Edge { from, to, label: None, shape: Shape::default(), arrow: e.arrow, stroke: e.stroke };
        states.push(ItemState::of(&crate::new_id(), &edge)?);
      }
    }
    Ok(Batch { cards: ids, undo: self.apply(states)? })
  }
}
