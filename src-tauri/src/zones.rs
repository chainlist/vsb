//! Zone edits: drawing, moving, resizing, renaming, recoloring and deleting. Like card edits,
//! each builds the target item states and hands them to `apply`, so every edit can be undone.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Card, Drawing, Kind, Zone};
use crate::layout::Move;
use crate::session::Session;
use crate::states::{Created, ItemState};
use std::collections::HashMap;
use std::iter;

/// Room a zone grown to hold cards leaves around them, in world units: a graph-paper square on the
/// sides and at the bottom, three at the top, where the zone's name is.
const MARGIN: f64 = 20.0;
const NAME_ROOM: f64 = 60.0;

impl Session {
  /// Draws a zone on a world rectangle, inside the innermost zone that fully contains it. The
  /// cards, zones and drawings at that level lying fully inside the new zone join it, staying in place.
  pub fn create_zone(&self, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
    let (parent, ox, oy) = self.index.zone_around(Rect::of(x, y, w, h), &[])?;
    let zone = Zone { name: String::new(), parent, x: x - ox, y: y - oy, w, h, color: None };
    let id = crate::new_id();
    let mut states = vec![ItemState::of(&id, &zone)?];
    for (kind, item) in self.index.children(zone.parent.as_deref(), Some(Rect::of(zone.x, zone.y, w, h)))? {
      states.push(self.rehomed(kind, &item, Some(&id), -zone.x, -zone.y)?);
    }
    Ok(Created { id, undo: self.apply(states)? })
  }

  /// Drops zones with their top-left corners at world positions. Each joins the innermost zone
  /// that fully contains it, apart from the moving zones and what is inside them. What a zone
  /// holds comes along; what it lands on is never captured.
  pub fn move_zones(&self, moves: &[Move]) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = moves.iter().map(|m| m.id.as_str()).collect();
    self.edit::<Zone>(&ids, |i, zone| {
      let to = &moves[i];
      let (parent, ox, oy) = self.index.zone_around(Rect::of(to.x, to.y, zone.w, zone.h), &ids)?;
      (zone.parent, zone.x, zone.y) = (parent, to.x - ox, to.y - oy);
      Ok(())
    })
  }

  /// Gives a zone a new world rectangle, grown where needed to cover its contents, which stay in place.
  pub fn resize_zone(&self, id: &str, x: f64, y: f64, w: f64, h: f64) -> Result<Vec<ItemState>> {
    let mut r = Rect::of(x, y, w, h);
    if let Some(contents) = self.index.zone_contents(id)? {
      r = r.union(contents);
    }
    self.apply(self.reshaped(id, r)?)
  }

  /// The states that give a zone the world rectangle `r`, its contents staying in place: when its
  /// corner moves, its direct children shift back by as much.
  pub(crate) fn reshaped(&self, id: &str, r: Rect) -> Result<Vec<ItemState>> {
    let Some((ax, ay)) = self.index.zone_origin(id)? else {
      return msg("zone not found");
    };
    let (dx, dy) = (r.min_x - ax, r.min_y - ay);
    let mut zone: Zone = self.read(id)?;
    (zone.x, zone.y, zone.w, zone.h) = (zone.x + dx, zone.y + dy, r.max_x - r.min_x, r.max_y - r.min_y);
    let mut states = vec![ItemState::of(id, &zone)?];
    if (dx, dy) != (0.0, 0.0) {
      for (kind, child) in self.index.children(Some(id), None)? {
        states.push(self.rehomed(kind, &child, Some(id), -dx, -dy)?);
      }
    }
    Ok(states)
  }

  /// The states that grow a zone where needed to hold cards covering the world rectangle `span`, its
  /// contents staying in place, and the zone's world origin then.
  pub(crate) fn holding(&self, id: &str, span: Rect) -> Result<((f64, f64), Vec<ItemState>)> {
    let Some(frame) = self.index.item_box(Kind::Zone, id)? else {
      return msg("zone not found");
    };
    let room = Rect { min_x: span.min_x - MARGIN, min_y: span.min_y - NAME_ROOM, max_x: span.max_x + MARGIN, max_y: span.max_y + MARGIN };
    let grown = frame.union(room);
    let states = if grown == frame { Vec::new() } else { self.reshaped(id, grown)? };
    Ok(((grown.min_x, grown.min_y), states))
  }

  pub fn rename_zone(&self, id: &str, name: &str) -> Result<Vec<ItemState>> {
    self.edit::<Zone>(&[id], |_, zone| {
      zone.name = name.to_string();
      Ok(())
    })
  }

  /// Sets the color of cards, zones and drawings, as one edit; None for none, which leaves a card on
  /// the theme's plain stock, a zone on its gray and a drawing in its ink.
  pub fn color_items(&self, cards: &[String], zones: &[String], drawings: &[String], color: Option<String>) -> Result<Vec<ItemState>> {
    let cards: Vec<&str> = cards.iter().map(String::as_str).collect();
    let zones: Vec<&str> = zones.iter().map(String::as_str).collect();
    let drawings: Vec<&str> = drawings.iter().map(String::as_str).collect();
    let mut states = self.edited::<Card>(&cards, |_, card| {
      card.color = color.clone();
      Ok(())
    })?;
    states.extend(self.edited::<Zone>(&zones, |_, zone| {
      zone.color = color.clone();
      Ok(())
    })?);
    states.extend(self.edited::<Drawing>(&drawings, |_, drawing| {
      drawing.color = color.clone();
      Ok(())
    })?);
    self.apply(states)
  }

  /// Deletes zones. Their cards, drawings and child zones move up to the nearest zone that stays, or
  /// the canvas, without moving on screen. Nothing inside is deleted.
  pub fn delete_zones(&self, ids: &[String]) -> Result<Vec<ItemState>> {
    let gone = ids.iter().map(|id| Ok((id.as_str(), self.read::<Zone>(id)?))).collect::<Result<HashMap<_, _>>>()?;
    // The deleted zones from `id` upwards, until a zone that stays.
    let chain = |id: Option<&str>| {
      iter::successors(id.and_then(|id| gone.get(id)), |z| z.parent.as_deref().and_then(|p| gone.get(p)))
    };
    // Parents first: `apply` deletes in reverse order, and an undo writes them back in this order.
    let mut order: Vec<&str> = ids.iter().map(String::as_str).collect();
    order.sort_by_key(|id| chain(gone[id].parent.as_deref()).count());
    let mut states: Vec<ItemState> = order.iter().map(|id| ItemState::gone(Kind::Zone, id)).collect();
    for id in order {
      let up: Vec<&Zone> = chain(Some(id)).collect();
      let to = up.last().and_then(|z| z.parent.as_deref());
      let (dx, dy) = up.iter().fold((0.0, 0.0), |(dx, dy), z| (dx + z.x, dy + z.y));
      for (kind, child) in self.index.children(Some(id), None)? {
        if !gone.contains_key(child.as_str()) {
          states.push(self.rehomed(kind, &child, to, dx, dy)?);
        }
      }
    }
    self.apply(states)
  }

  /// A zone's, card's or drawing's state once moved into zone `to` (None: the canvas) and shifted by
  /// (dx, dy).
  fn rehomed(&self, kind: Kind, id: &str, to: Option<&str>, dx: f64, dy: f64) -> Result<ItemState> {
    let to = to.map(String::from);
    match kind {
      Kind::Zone => {
        let mut z: Zone = self.read(id)?;
        (z.parent, z.x, z.y) = (to, z.x + dx, z.y + dy);
        ItemState::of(id, &z)
      }
      Kind::Card => {
        let mut c: Card = self.read(id)?;
        (c.zone, c.x, c.y) = (to, c.x + dx, c.y + dy);
        ItemState::of(id, &c)
      }
      Kind::Drawing => {
        let mut d: Drawing = self.read(id)?;
        (d.zone, d.x, d.y) = (to, d.x + dx, d.y + dy);
        ItemState::of(id, &d)
      }
      Kind::Edge => unreachable!("edges sit in no zone"),
    }
  }
}
