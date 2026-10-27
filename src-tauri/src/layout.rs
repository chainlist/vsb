//! Card edits: placing, moving, resizing, aligning, clearing and deleting. Each builds the
//! target item states and hands them to `apply`, so every edit can be undone.

use crate::error::Result;
use crate::index::Rect;
use crate::items::{Card, HAlign, Kind, VAlign};
use crate::session::Session;
use crate::states::ItemState;
use serde::Deserialize;

/// A card or zone dropped with its top-left corner at a world position.
#[derive(Deserialize, Clone, Debug)]
pub struct Move {
  pub id: String,
  pub x: f64,
  pub y: f64,
}

impl Session {
  /// Where a card on this world rectangle lands: the innermost zone under its center, with that
  /// zone's absolute origin. The canvas is (None, 0, 0).
  fn landing(&self, x: f64, y: f64, w: f64, h: f64) -> Result<(Option<String>, f64, f64)> {
    self.index.zone_around(Rect::of(x + w / 2.0, y + h / 2.0, 0.0, 0.0), &[])
  }

  /// Places an empty card on a world rectangle. It joins the innermost zone under its center.
  pub fn create_card(&self, x: f64, y: f64, w: f64, h: f64) -> Result<String> {
    let (zone, ox, oy) = self.landing(x, y, w, h)?;
    let card = Card { note: None, zone, x: x - ox, y: y - oy, w, h, halign: HAlign::default(), valign: VAlign::default() };
    let id = crate::new_id();
    self.apply(vec![ItemState::of(&id, &card)?])?;
    Ok(id)
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

  /// Turns an unresolved card into an empty one.
  pub fn clear_card(&self, id: &str) -> Result<Vec<ItemState>> {
    self.edit::<Card>(&[id], |_, card| {
      card.note = None;
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
