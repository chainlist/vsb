//! Batch creation: new notes, a card for each and the edges between them, as one edit. The
//! frontend parses the batch syntax and lays it out; this writes the result, as an edit of the
//! batch builder on no cards of the canvas (see `batch_edit`).

use crate::batch_edit::{End, Link};
use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Arrow, Card, HAlign, Stroke, VAlign};
use crate::session::Session;
use crate::states::ItemState;
use serde::{Deserialize, Serialize};

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
  /// Writes a note for each card, then the cards, then the edges between them. The cards all join
  /// the innermost zone under the world point (x, y). Undoing the batch keeps the notes, unplaced,
  /// as deleting any card does.
  pub fn create_batch(&self, x: f64, y: f64, cards: &[BatchCard], edges: &[BatchEdge]) -> Result<Batch> {
    let (zone, ..) = self.index.zone_around(Rect::of(x, y, 0.0, 0.0), &[])?;
    let links: Vec<Link> = edges.iter().map(|e| Link { from: End::New(e.from), to: End::New(e.to), arrow: e.arrow, stroke: e.stroke }).collect();
    self.edit_batch(zone.as_deref(), &[], cards, &links)
  }

  /// The states writing a note and a card for each of `cards` in `zone`, or on the canvas, and the
  /// cards' IDs. A zone too small for them grows to hold them, its contents staying in place.
  pub(crate) fn new_cards(&self, zone: Option<&str>, cards: &[BatchCard]) -> Result<(Vec<String>, Vec<ItemState>)> {
    if cards.iter().any(|c| c.text.trim().is_empty()) {
      return msg("every card in a batch has text");
    }
    let ((ox, oy), mut states) = match (zone, cards.iter().map(|c| Rect::of(c.x, c.y, c.w, c.h)).reduce(Rect::union)) {
      (Some(zone), Some(span)) => self.holding(zone, span)?,
      _ => ((0.0, 0.0), Vec::new()),
    };
    let ids: Vec<String> = cards.iter().map(|_| crate::new_id()).collect();
    for (id, c) in ids.iter().zip(cards) {
      let note = Some(self.new_note(&c.text)?);
      let card = Card { note, zone: zone.map(str::to_string), x: c.x - ox, y: c.y - oy, w: c.w, h: c.h, halign: HAlign::Center, valign: VAlign::Center, color: None, file: None };
      states.push(ItemState::of(id, &card)?);
    }
    Ok((ids, states))
  }
}
