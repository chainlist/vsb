//! Drawing edits: adding a stroke, erasing strokes, moving and deleting. Like card edits, each hands
//! the target item states to `apply`, so every edit can be undone. Recoloring goes with the cards'
//! and zones', in `color_items`.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Drawing, Kind};
use crate::layout::Move;
use crate::session::Session;
use crate::states::{Created, ItemState};
use serde::Deserialize;

/// How near a drawing's box a stroke must start to join it, in world units: two graph-paper squares.
const REACH: f64 = 40.0;
/// Half the pen's width at middling pressure: a drawing's box holds its ink, not only the line through
/// its points, so a lone dot has a size and shows.
const INK: f64 = 1.5;

/// Strokes taken out of a drawing, by their place in it.
#[derive(Deserialize, Clone, Debug)]
pub struct Erased {
  pub id: String,
  pub strokes: Vec<usize>,
}

impl Session {
  /// Adds a stroke, its points as world x, y and pressure in turn, kept to a tenth of a unit and a
  /// hundredth of the pressure. Starting within REACH of a drawing's box, it joins the nearest, whose
  /// box grows to hold it; otherwise it starts a drawing in the innermost zone under its start.
  pub fn add_stroke(&self, points: &[f64]) -> Result<Created> {
    if points.is_empty() || !points.len().is_multiple_of(3) {
      return msg("a stroke is points of x, y and pressure");
    }
    let (sx, sy) = (points[0], points[1]);
    let (id, mut drawing, corner) = match self.index.nearest_drawing(sx, sy, REACH)? {
      Some((id, at)) => {
        let drawing = self.read::<Drawing>(&id)?;
        (id, drawing, (at.min_x, at.min_y))
      }
      None => {
        let (zone, ox, oy) = self.index.zone_around(Rect::of(sx, sy, 0.0, 0.0), &[])?;
        let drawing = Drawing { zone, x: sx - ox, y: sy - oy, w: 0.0, h: 0.0, color: None, strokes: Vec::new() };
        (crate::new_id(), drawing, (sx, sy))
      }
    };
    let stroke = points.chunks(3).flat_map(|p| [tenth(p[0] - corner.0), tenth(p[1] - corner.1), hundredth(p[2].clamp(0.0, 1.0))]);
    drawing.strokes.push(stroke.collect());
    fit(&mut drawing);
    let undo = self.apply(vec![ItemState::of(&id, &drawing)?])?;
    Ok(Created { id, undo })
  }

  /// Takes strokes out of drawings, as one edit. A drawing's box shrinks to the strokes left, and a
  /// drawing left with none is deleted.
  pub fn erase_strokes(&self, erased: &[Erased]) -> Result<Vec<ItemState>> {
    let mut states = Vec::new();
    for e in erased {
      let mut drawing: Drawing = self.read(&e.id)?;
      let strokes = std::mem::take(&mut drawing.strokes).into_iter().enumerate();
      drawing.strokes = strokes.filter(|(i, _)| !e.strokes.contains(i)).map(|(_, s)| s).collect();
      if drawing.strokes.is_empty() {
        states.push(ItemState::gone(Kind::Drawing, &e.id));
      } else {
        fit(&mut drawing);
        states.push(ItemState::of(&e.id, &drawing)?);
      }
    }
    self.apply(states)
  }

  /// Drops drawings at new world positions. Each joins the innermost zone under its center, or the
  /// canvas, as a card does.
  pub fn move_drawings(&self, moves: &[Move]) -> Result<Vec<ItemState>> {
    let ids: Vec<&str> = moves.iter().map(|m| m.id.as_str()).collect();
    self.edit::<Drawing>(&ids, |i, drawing| {
      let to = &moves[i];
      let (zone, ox, oy) = self.landing(to.x, to.y, drawing.w, drawing.h)?;
      (drawing.zone, drawing.x, drawing.y) = (zone, to.x - ox, to.y - oy);
      Ok(())
    })
  }

  pub fn delete_drawings(&self, ids: &[String]) -> Result<Vec<ItemState>> {
    self.apply(ids.iter().map(|id| ItemState::gone(Kind::Drawing, id)).collect())
  }
}

/// Fits a drawing's box to its ink: its strokes' points, with INK around them. Its corner moves, the
/// points shift back by as much, and its size spans them.
fn fit(drawing: &mut Drawing) {
  let points = || drawing.strokes.iter().flat_map(|s| s.chunks(3));
  let (mut min_x, mut min_y, mut max_x, mut max_y) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
  for p in points() {
    (min_x, min_y, max_x, max_y) = (min_x.min(p[0]), min_y.min(p[1]), max_x.max(p[0]), max_y.max(p[1]));
  }
  let (left, top) = (min_x - INK, min_y - INK);
  for stroke in &mut drawing.strokes {
    for p in stroke.chunks_mut(3) {
      (p[0], p[1]) = (tenth(p[0] - left), tenth(p[1] - top));
    }
  }
  (drawing.x, drawing.y) = (tenth(drawing.x + left), tenth(drawing.y + top));
  (drawing.w, drawing.h) = (tenth(max_x - min_x + 2.0 * INK), tenth(max_y - min_y + 2.0 * INK));
}

/// Rounded to a tenth, halves up, as the browser backend rounds.
fn tenth(v: f64) -> f64 {
  (v * 10.0 + 0.5).floor() / 10.0
}

fn hundredth(v: f64) -> f64 {
  (v * 100.0 + 0.5).floor() / 100.0
}
