//! Zoomed out, a collapsed zone shows what it holds, at any depth: every card as a block of its
//! color, every inner zone as a frame and every drawing's strokes, at their real place and size.

use super::bounds::ZONE_ABS;
use super::viewport::{LARGE, MEETS};
use super::views::{Frame, Ink, PreviewView, Sketch, Tint, ZoneView};
use super::{Index, Rect};
use crate::error::Result;
use crate::items::PenStroke;
use rusqlite::params;
use std::collections::BTreeMap;

/// What a preview gathers for one zone: its cards' boxes by color, its inner zones' boxes, and its
/// drawings' strokes by color.
type Gathered = (BTreeMap<Option<String>, Vec<Frame>>, Vec<Frame>, BTreeMap<Option<String>, Vec<Sketch>>);

impl Index {
  /// The previews of the outermost `zones`: the cards, the inner zones and the drawings meeting `rect`
  /// and at least `min_size` wide or tall, in their outermost zone's coordinates, boxes top to bottom
  /// then left to right, drawings oldest first.
  pub fn previews(&self, rect: Rect, min_size: f64, zones: &[ZoneView]) -> Result<Vec<PreviewView>> {
    let mut found: BTreeMap<String, Gathered> = zones.iter().map(|z| (z.id.clone(), Gathered::default())).collect();
    let args = params![rect.min_x, rect.min_y, rect.max_x, rect.max_y, min_size];
    // Each card in a zone, with its outermost zone and its box from that zone's corner.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT zabs.root, c.color, zabs.ax + c.x - top.ax, zabs.ay + c.y - top.ay, c.w, c.h
       FROM card_bounds b JOIN cards c ON c.key = b.key
       JOIN zabs ON zabs.id = c.zone JOIN zabs top ON top.id = zabs.root
       WHERE {MEETS} AND {LARGE}"
    ))?;
    let frame = |r: &rusqlite::Row, at: usize| -> rusqlite::Result<Frame> {
      Ok(Frame { x: r.get(at)?, y: r.get(at + 1)?, w: r.get(at + 2)?, h: r.get(at + 3)? })
    };
    for row in stmt.query_map(args, |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, frame(r, 2)?)))? {
      let (zone, color, at) = row?;
      if let Some((cards, _, _)) = found.get_mut(&zone) {
        cards.entry(color).or_default().push(at);
      }
    }
    // Each zone inside another, the same way.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT zabs.root, zabs.ax - top.ax, zabs.ay - top.ay, z.w, z.h
       FROM zone_bounds b JOIN zones z ON z.key = b.key
       JOIN zabs ON zabs.id = z.id JOIN zabs top ON top.id = zabs.root
       WHERE {MEETS} AND {LARGE} AND zabs.depth > 0"
    ))?;
    for row in stmt.query_map(args, |r| Ok((r.get::<_, String>(0)?, frame(r, 1)?)))? {
      let (zone, at) = row?;
      if let Some((_, inner, _)) = found.get_mut(&zone) {
        inner.push(at);
      }
    }
    // Each drawing in a zone, with its corner from its outermost zone's, its strokes by color.
    let mut stmt = self.db.prepare(&format!(
      "WITH RECURSIVE {ZONE_ABS}
       SELECT zabs.root, zabs.ax + d.x - top.ax, zabs.ay + d.y - top.ay, d.strokes
       FROM drawing_bounds b JOIN drawings d ON d.key = b.key
       JOIN zabs ON zabs.id = d.zone JOIN zabs top ON top.id = zabs.root
       WHERE {MEETS} AND {LARGE} ORDER BY d.id"
    ))?;
    let rows = stmt.query_map(args, |r| Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?, r.get::<_, String>(3)?)))?;
    for row in rows {
      let (zone, x, y, strokes) = row?;
      let Some((_, _, inks)) = found.get_mut(&zone) else { continue };
      let mut colors: BTreeMap<Option<String>, Vec<Vec<f64>>> = BTreeMap::new();
      for stroke in serde_json::from_str::<Vec<PenStroke>>(&strokes)? {
        colors.entry(stroke.color).or_default().push(stroke.points);
      }
      for (color, strokes) in colors {
        inks.entry(color).or_default().push(Sketch { x, y, strokes });
      }
    }
    let previews = found.into_iter().map(|(zone, (cards, mut zones, inks))| {
      let cards = cards.into_iter().map(|(color, mut boxes)| {
        sort(&mut boxes);
        Tint { color, boxes }
      });
      sort(&mut zones);
      let inks = inks.into_iter().map(|(color, drawings)| Ink { color, drawings });
      PreviewView { zone, cards: cards.collect(), zones, inks: inks.collect() }
    });
    Ok(previews.filter(|p| !p.cards.is_empty() || !p.zones.is_empty() || !p.inks.is_empty()).collect())
  }
}

/// Top to bottom, then left to right, so both backends list a preview the same way.
fn sort(boxes: &mut [Frame]) {
  boxes.sort_by(|a, b| (a.y, a.x, a.w, a.h).partial_cmp(&(b.y, b.x, b.w, b.h)).unwrap_or(std::cmp::Ordering::Equal));
}
