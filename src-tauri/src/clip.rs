//! Copying and pasting. Copying gathers the selected cards, zones and drawings, everything inside
//! those zones and the edges between the cards, as a clip the clipboard carries. Pasting writes a
//! clip back as new items: each gets a new ID, each card with text a new note. A clip names its
//! items by the IDs they were copied from, only to join them to each other.

use crate::error::Result;
use crate::index::Rect;
use crate::items::{is_default, Card, Drawing, Edge, HAlign, Kind, VAlign, Zone};
use crate::session::Session;
use crate::states::ItemState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Deepest nesting walked up from an item: a zone in a loop of parents sits nowhere.
const DEPTH: usize = 64;

/// A zone or a drawing in a clip, by the ID it was copied from, its corner from the clip's corner
/// and its zone (a zone's `parent`) the copied zone around it, or None.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Clipped<T> {
  pub id: String,
  #[serde(flatten)]
  pub item: T,
}

/// A card in a clip, as a zone is, with its note's text in place of its note: None for an empty
/// card, or one whose note is missing.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ClipCard {
  pub id: String,
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  #[serde(default, skip_serializing_if = "is_default")]
  pub halign: HAlign,
  #[serde(default, skip_serializing_if = "is_default")]
  pub valign: VAlign,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub color: Option<String>,
  #[serde(default)]
  pub text: Option<String>,
}

/// What copying gathers: the box around it in the world it was copied from, zones parents first,
/// cards, drawings, and the edges between the cards, from and to the IDs they were copied from.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Clip {
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  #[serde(default)]
  pub zones: Vec<Clipped<Zone>>,
  #[serde(default)]
  pub cards: Vec<ClipCard>,
  #[serde(default)]
  pub drawings: Vec<Clipped<Drawing>>,
  #[serde(default)]
  pub edges: Vec<Edge>,
}

/// The new items pasted on their own, not inside a pasted zone, and the states that undo the paste.
#[derive(Serialize, Debug)]
pub struct Pasted {
  pub ids: Vec<String>,
  pub undo: Vec<ItemState>,
}

impl Session {
  /// Gathers the cards, zones and drawings named, everything inside those zones at any depth, and
  /// the edges with both ends among the cards gathered. What lies inside a gathered zone comes with
  /// it, not on its own.
  pub fn copy_items(&self, cards: &[String], zones: &[String], drawings: &[String]) -> Result<Clip> {
    let picked: HashSet<&str> = zones.iter().map(String::as_str).collect();
    let mut clip = Clip::default();
    for (kind, ids) in [(Kind::Zone, zones), (Kind::Card, cards), (Kind::Drawing, drawings)] {
      for id in ids {
        let zone = match kind {
          Kind::Zone => self.read::<Zone>(id)?.parent,
          Kind::Card => self.read::<Card>(id)?.zone,
          _ => self.read::<Drawing>(id)?.zone,
        };
        if !self.under(zone.clone(), &picked) {
          self.clip_item(&mut clip, kind, id, None, self.origin(zone.as_deref())?)?;
        }
      }
    }
    let ids: Vec<String> = clip.cards.iter().map(|c| c.id.clone()).collect();
    for e in self.index.edges_among(&ids)? {
      clip.edges.push(self.read(&e.id)?);
    }
    // Coordinates run from the corner of the box around what was copied on its own.
    let Some(span) = loose(&clip).reduce(Rect::union) else {
      return Ok(clip);
    };
    let (dx, dy) = (span.min_x, span.min_y);
    clip.zones.iter_mut().for_each(|z| (z.item.x, z.item.y) = (z.item.x - dx, z.item.y - dy));
    clip.cards.iter_mut().for_each(|c| (c.x, c.y) = (c.x - dx, c.y - dy));
    clip.drawings.iter_mut().for_each(|d| (d.item.x, d.item.y) = (d.item.x - dx, d.item.y - dy));
    (clip.x, clip.y, clip.w, clip.h) = (dx, dy, span.max_x - dx, span.max_y - dy);
    Ok(clip)
  }

  /// Writes a clip as new items, its corner at the world point (x, y), as one edit. What was copied
  /// on its own joins the innermost zone under the middle of what is pasted, other than the zones
  /// copied, so a copy never lands inside its original; that zone grows to hold it. Undoing the
  /// paste keeps the new notes, unplaced, as deleting any card does.
  pub fn paste_items(&self, clip: &Clip, x: f64, y: f64) -> Result<Pasted> {
    let Some(span) = loose(clip).reduce(Rect::union) else {
      return Ok(Pasted { ids: Vec::new(), undo: Vec::new() });
    };
    let span = Rect::of(x + span.min_x, y + span.min_y, span.max_x - span.min_x, span.max_y - span.min_y);
    let copied: Vec<&str> = clip.zones.iter().map(|z| z.id.as_str()).collect();
    let middle = Rect::of((span.min_x + span.max_x) / 2.0, (span.min_y + span.max_y) / 2.0, 0.0, 0.0);
    let (landing, ..) = self.index.zone_around(middle, &copied)?;
    let ((ox, oy), mut states) = match &landing {
      Some(zone) => self.holding(zone, span)?,
      None => ((0.0, 0.0), Vec::new()),
    };
    let zones: HashMap<&str, (&Zone, String)> = clip.zones.iter().map(|z| (z.id.as_str(), (&z.item, crate::new_id()))).collect();
    // An item's zone and corner there: inside its copied zone as it was, or else in the landing zone.
    let home = |zone: &Option<String>, cx: f64, cy: f64| match zone.as_deref().and_then(|z| zones.get(z)) {
      Some((around, id)) => (Some(id.clone()), cx - around.x, cy - around.y),
      None => (landing.clone(), x + cx - ox, y + cy - oy),
    };
    let mut ids = Vec::new();
    for z in &clip.zones {
      let (parent, zx, zy) = home(&z.item.parent, z.item.x, z.item.y);
      let id = &zones[z.id.as_str()].1;
      if parent == landing {
        ids.push(id.clone());
      }
      states.push(ItemState::of(id, &Zone { parent, x: zx, y: zy, ..z.item.clone() })?);
    }
    let mut cards = HashMap::new();
    for c in &clip.cards {
      let (zone, cx, cy) = home(&c.zone, c.x, c.y);
      let note = match c.text.as_deref() {
        Some(text) if !text.trim().is_empty() => Some(self.new_note(text)?),
        _ => None,
      };
      let id = crate::new_id();
      if zone == landing {
        ids.push(id.clone());
      }
      let card = Card { note, zone, x: cx, y: cy, w: c.w, h: c.h, halign: c.halign, valign: c.valign, color: c.color.clone() };
      states.push(ItemState::of(&id, &card)?);
      cards.insert(c.id.as_str(), id);
    }
    for d in &clip.drawings {
      let (zone, dx, dy) = home(&d.item.zone, d.item.x, d.item.y);
      let id = crate::new_id();
      if zone == landing {
        ids.push(id.clone());
      }
      states.push(ItemState::of(&id, &Drawing { zone, x: dx, y: dy, ..d.item.clone() })?);
    }
    for e in &clip.edges {
      if let (Some(from), Some(to)) = (cards.get(e.from.as_str()), cards.get(e.to.as_str()))
        && from != to
      {
        states.push(ItemState::of(&crate::new_id(), &Edge { from: from.clone(), to: to.clone(), ..e.clone() })?);
      }
    }
    Ok(Pasted { ids, undo: self.apply(states)? })
  }

  /// Adds an item to the clip at its absolute corner, its zone's origin plus its own corner, as
  /// copied inside the zone `within` (None: on its own), and everything inside it when it is a zone.
  fn clip_item(&self, clip: &mut Clip, kind: Kind, id: &str, within: Option<&str>, (ox, oy): (f64, f64)) -> Result<()> {
    let within = within.map(String::from);
    match kind {
      Kind::Zone => {
        let zone: Zone = self.read(id)?;
        let (x, y) = (ox + zone.x, oy + zone.y);
        clip.zones.push(Clipped { id: id.into(), item: Zone { parent: within, x, y, ..zone } });
        for (kind, child) in self.index.children(Some(id), None)? {
          self.clip_item(clip, kind, &child, Some(id), (x, y))?;
        }
      }
      Kind::Card => {
        let c: Card = self.read(id)?;
        let text = match &c.note {
          Some(note) if self.index.note_path(note)?.is_some() => Some(self.read_note(note)?),
          _ => None,
        };
        let (halign, valign, color) = (c.halign, c.valign, c.color);
        clip.cards.push(ClipCard { id: id.into(), zone: within, x: ox + c.x, y: oy + c.y, w: c.w, h: c.h, halign, valign, color, text });
      }
      Kind::Drawing => {
        let d: Drawing = self.read(id)?;
        let (x, y) = (ox + d.x, oy + d.y);
        clip.drawings.push(Clipped { id: id.into(), item: Drawing { zone: within, x, y, ..d } });
      }
      Kind::Edge => unreachable!("edges sit in no zone"),
    }
    Ok(())
  }

  /// A zone's absolute origin; the canvas's for None.
  fn origin(&self, zone: Option<&str>) -> Result<(f64, f64)> {
    Ok(match zone {
      Some(id) => self.index.zone_origin(id)?.unwrap_or((0.0, 0.0)),
      None => (0.0, 0.0),
    })
  }

  /// Whether `zone`, or a zone around it, is one of `zones`. A zone whose file is missing sits on
  /// the canvas.
  fn under(&self, mut zone: Option<String>, zones: &HashSet<&str>) -> bool {
    for _ in 0..DEPTH {
      let Some(id) = zone else { break };
      if zones.contains(id.as_str()) {
        return true;
      }
      zone = self.read::<Zone>(&id).ok().and_then(|z| z.parent);
    }
    false
  }
}

/// The boxes of what a clip holds on its own, not inside one of its zones.
fn loose(clip: &Clip) -> impl Iterator<Item = Rect> + '_ {
  let inside = |zone: &Option<String>| zone.as_deref().is_some_and(|z| clip.zones.iter().any(|o| o.id == z));
  let zones = clip.zones.iter().filter(move |z| !inside(&z.item.parent)).map(|z| Rect::of(z.item.x, z.item.y, z.item.w, z.item.h));
  let cards = clip.cards.iter().filter(move |c| !inside(&c.zone)).map(|c| Rect::of(c.x, c.y, c.w, c.h));
  let drawings = clip.drawings.iter().filter(move |d| !inside(&d.item.zone)).map(|d| Rect::of(d.item.x, d.item.y, d.item.w, d.item.h));
  zones.chain(cards).chain(drawings)
}
