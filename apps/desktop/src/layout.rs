//! Card edits: placing, moving, resizing, aligning, clearing and deleting. Each builds the
//! target item states and hands them to `apply`, so every edit can be undone.

use crate::attachments;
use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Card, Drawing, HAlign, Kind, VAlign, Zone};
use crate::session::Session;
use crate::states::{Created, ItemState};
use serde::Deserialize;
use std::collections::BTreeMap;

/// A card, zone or drawing dropped with its top-left corner at a world position.
#[derive(Deserialize, Clone, Debug)]
pub struct Move {
  pub id: String,
  pub x: f64,
  pub y: f64,
}

impl Session {
  /// Where a card or a drawing on this world rectangle lands: the innermost zone under its center,
  /// with that zone's absolute origin. The canvas is (None, 0, 0).
  pub(crate) fn landing(&self, x: f64, y: f64, w: f64, h: f64) -> Result<(Option<String>, f64, f64)> {
    self.index.zone_around(Rect::of(x + w / 2.0, y + h / 2.0, 0.0, 0.0), &[])
  }

  /// Places an empty card on a world rectangle. It joins the innermost zone under its center.
  pub fn create_card(&self, x: f64, y: f64, w: f64, h: f64) -> Result<String> {
    Ok(self.place(None, None, x, y, w, h)?.id)
  }

  /// Places a card showing the vault's attachment at vault path `path`, like an empty card. Several
  /// cards may show one file.
  pub fn place_file(&self, path: &str, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
    attachments::check(path)?;
    if !self.vault.abs(path).is_file() {
      return msg("file not found");
    }
    self.place(None, Some(path.to_string()), x, y, w, h)
  }

  /// Places a card for the note at vault path `path`, like an empty card, and gives the note its
  /// ID if it has none. Until V3 a note has one card: when it already has it, that card comes
  /// back with nothing to undo.
  pub fn place_note(&self, path: &str, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
    let note = self.note_id(path)?;
    if let Some(id) = self.index.card_of_note(&note)? {
      return Ok(Created { id, undo: Vec::new() });
    }
    self.place(Some(note), None, x, y, w, h)
  }

  fn place(&self, note: Option<String>, file: Option<String>, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
    let (zone, ox, oy) = self.landing(x, y, w, h)?;
    let card = Card { note, zone, x: x - ox, y: y - oy, w, h, halign: HAlign::default(), valign: VAlign::default(), color: None, file };
    let id = crate::new_id();
    let undo = self.apply(vec![ItemState::of(&id, &card)?])?;
    Ok(Created { id, undo })
  }

  /// Drops cards at new world positions. Each joins the innermost zone under its center, or the canvas.
  pub fn move_cards(&self, moves: &[Move]) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = moves.iter().map(|m| m.id.as_str()).collect();
    self.edit::<Card>(&ids, |i, card| {
      let to = &moves[i];
      let (zone, ox, oy) = self.landing(to.x, to.y, card.w, card.h)?;
      card.zone = zone;
      card.x = to.x - ox;
      card.y = to.y - oy;
      Ok(())
    })
  }

  /// Moves cards and zones to new world positions, each staying in its zone, which grows where
  /// needed to hold them, its contents staying in place. A zone brings everything in it. Arranging
  /// selected cards, or a zone's contents, does this.
  pub fn arrange(&self, cards: &[Move], zones: &[Move]) -> Result<Vec<ItemState>> {
    let card_items = cards.iter().map(|m| self.read::<Card>(&m.id)).collect::<Result<Vec<_>>>()?;
    self.apply(self.placed(cards, card_items, zones, &[])?)
  }

  /// The states that put cards, given whole with their zone (new ones too), zones and drawings at
  /// world positions, as `arrange` does.
  pub(crate) fn placed(&self, cards: &[Move], mut card_items: Vec<Card>, zones: &[Move], drawings: &[Move]) -> Result<Vec<ItemState>> {
    let mut zone_items = zones.iter().map(|m| self.read::<Zone>(&m.id)).collect::<Result<Vec<_>>>()?;
    let mut drawing_items = drawings.iter().map(|m| self.read::<Drawing>(&m.id)).collect::<Result<Vec<_>>>()?;
    let boxes = cards.iter().zip(&card_items).map(|(m, c)| (&c.zone, Rect::of(m.x, m.y, c.w, c.h)));
    let boxes = boxes.chain(zones.iter().zip(&zone_items).map(|(m, z)| (&z.parent, Rect::of(m.x, m.y, z.w, z.h))));
    let boxes = boxes.chain(drawings.iter().zip(&drawing_items).map(|(m, d)| (&d.zone, Rect::of(m.x, m.y, d.w, d.h))));
    let mut spans: BTreeMap<String, Rect> = BTreeMap::new();
    for (inside, r) in boxes {
      if let Some(zone) = inside {
        spans.entry(zone.clone()).and_modify(|s| *s = s.union(r)).or_insert(r);
      }
    }
    let (mut states, mut origins) = (Vec::new(), BTreeMap::new());
    for (zone, span) in &spans {
      let (origin, grown) = self.holding(zone, *span)?;
      origins.insert(zone.clone(), origin);
      states.extend(grown);
    }
    // A zone grown leftward shifts its contents back; those arranged get their own place instead.
    states.retain(|s| {
      let placing = match s.kind {
        Kind::Card => cards,
        Kind::Zone => zones,
        Kind::Drawing => drawings,
        Kind::Edge => &[],
      };
      !placing.iter().any(|m| m.id == s.id)
    });
    let origin = |inside: &Option<String>| inside.as_ref().map_or((0.0, 0.0), |z| origins[z]);
    for (m, zone) in zones.iter().zip(&mut zone_items) {
      let (ox, oy) = origin(&zone.parent);
      (zone.x, zone.y) = (m.x - ox, m.y - oy);
      states.push(ItemState::of(&m.id, zone)?);
    }
    for (m, card) in cards.iter().zip(&mut card_items) {
      let (ox, oy) = origin(&card.zone);
      (card.x, card.y) = (m.x - ox, m.y - oy);
      states.push(ItemState::of(&m.id, card)?);
    }
    for (m, drawing) in drawings.iter().zip(&mut drawing_items) {
      let (ox, oy) = origin(&drawing.zone);
      (drawing.x, drawing.y) = (m.x - ox, m.y - oy);
      states.push(ItemState::of(&m.id, drawing)?);
    }
    Ok(states)
  }

  /// Gives a card a new world rectangle. Resizing from the left or top moves its corner too, but
  /// never its zone: only a move changes membership.
  pub fn resize_card(&self, id: &str, x: f64, y: f64, w: f64, h: f64) -> Result<Vec<ItemState>> {
    self.edit::<Card>(&[id], |_, card| {
      let origin = match &card.zone {
        Some(zone) => self.index.zone_origin(zone)?,
        None => None,
      };
      let (ox, oy) = origin.unwrap_or((0.0, 0.0));
      card.x = x - ox;
      card.y = y - oy;
      card.w = w;
      card.h = h;
      Ok(())
    })
  }

  pub fn align_cards(&self, ids: &[String], halign: HAlign, valign: VAlign) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    self.edit::<Card>(&ids, |_, card| {
      card.halign = halign;
      card.valign = valign;
      Ok(())
    })
  }

  /// Turns an unresolved card, whose note or file is missing, into an empty one.
  pub fn clear_card(&self, id: &str) -> Result<Vec<ItemState>> {
    self.edit::<Card>(&[id], |_, card| {
      card.note = None;
      card.file = None;
      Ok(())
    })
  }

  /// Deletes cards and the edges that touch them. Their notes stay, unplaced.
  pub fn delete_cards(&self, ids: &[String]) -> Result<Vec<ItemState>> {
    let edges = self.index.edges_touching(ids)?;
    let states = edges.iter().map(|e| ItemState::gone(Kind::Edge, e)).chain(ids.iter().map(|c| ItemState::gone(Kind::Card, c)));
    self.apply(states.collect())
  }
}
