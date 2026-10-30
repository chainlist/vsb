//! Drawing edits: adding a stroke, erasing, moving and deleting. Like card edits, each hands the
//! target item states to `apply`, so every edit can be undone. Recoloring goes with the cards' and
//! zones', in `color_items`.

use crate::error::{msg, Result};
use crate::index::Rect;
use crate::items::{Drawing, Kind, PenStroke};
use crate::layout::Move;
use crate::session::Session;
use crate::states::{Created, ItemState};
use serde::Deserialize;

/// How near a drawing's box a stroke must start to join it, in world units: two graph-paper squares.
const REACH: f64 = 40.0;

/// What erasing leaves of one stroke of a drawing, by its place in it: the pieces a cutting eraser
/// left, each with its points from the drawing's corner and kept as a stroke of its own in the same
/// color and width, or none when the stroke goes whole.
#[derive(Deserialize, Clone, Debug)]
pub struct Cut {
  pub index: usize,
  pub pieces: Vec<Vec<f64>>,
}

/// The strokes of a drawing an eraser passed over.
#[derive(Deserialize, Clone, Debug)]
pub struct Erased {
  pub id: String,
  pub strokes: Vec<Cut>,
}

impl Session {
  /// Adds a stroke in a color (None for the ink) and a width, its points as world x, y and pressure
  /// in turn, kept to a tenth of a unit and a hundredth of the pressure. Starting within REACH of a
  /// drawing's box, it joins the nearest, whose box grows to hold it, whatever the colors and widths
  /// of its strokes; otherwise it starts a drawing in the innermost zone under its start.
  pub fn add_stroke(&self, points: &[f64], color: Option<String>, width: f64) -> Result<Created> {
    if width <= 0.0 || !width.is_finite() {
      return msg("a stroke has a width");
    }
    let Some((&sx, &sy)) = points.first().zip(points.get(1)) else {
      return msg("a stroke is points of x, y and pressure");
    };
    let (id, mut drawing, corner) = match self.index.nearest_drawing(sx, sy, REACH)? {
      Some((id, at)) => {
        let drawing = self.read::<Drawing>(&id)?;
        (id, drawing, (at.min_x, at.min_y))
      }
      None => {
        let (zone, ox, oy) = self.index.zone_around(Rect::of(sx, sy, 0.0, 0.0), &[])?;
        let drawing = Drawing { zone, x: sx - ox, y: sy - oy, w: 0.0, h: 0.0, strokes: Vec::new() };
        (crate::new_id(), drawing, (sx, sy))
      }
    };
    drawing.strokes.push(PenStroke { points: rounded(points, corner)?, color, width });
    fit(&mut drawing);
    let undo = self.apply(vec![ItemState::of(&id, &drawing)?])?;
    Ok(Created { id, undo })
  }

  /// Erases from drawings, as one edit: each stroke passed over goes, whole or for the pieces left of
  /// it. A drawing's box shrinks to the ink left, and a drawing left with none is deleted.
  pub fn erase_strokes(&self, erased: &[Erased]) -> Result<Vec<ItemState>> {
    let mut states = Vec::new();
    for e in erased {
      let mut drawing: Drawing = self.read(&e.id)?;
      let mut left = Vec::new();
      for (i, stroke) in std::mem::take(&mut drawing.strokes).into_iter().enumerate() {
        let Some(cut) = e.strokes.iter().find(|c| c.index == i) else {
          left.push(stroke);
          continue;
        };
        for piece in &cut.pieces {
          left.push(PenStroke { points: rounded(piece, (0.0, 0.0))?, ..stroke.clone() });
        }
      }
      drawing.strokes = left;
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

/// Points as x, y and pressure in turn, from `corner`, rounded to a tenth of a unit and a hundredth of
/// the pressure.
fn rounded(points: &[f64], corner: (f64, f64)) -> Result<Vec<f64>> {
  if points.is_empty() || !points.len().is_multiple_of(3) {
    return msg("a stroke is points of x, y and pressure");
  }
  let rounded = points.chunks(3).flat_map(|p| [tenth(p[0] - corner.0), tenth(p[1] - corner.1), hundredth(p[2].clamp(0.0, 1.0))]);
  Ok(rounded.collect())
}

/// Fits a drawing's box to its ink: each stroke's points, with half the stroke's width around them, so
/// a lone dot has a size and shows. Its corner moves, the points shift back by as much, and its size
/// spans them.
fn fit(drawing: &mut Drawing) {
  let (mut left, mut top, mut right, mut bottom) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
  for stroke in &drawing.strokes {
    let ink = stroke.width / 2.0;
    for p in stroke.points.chunks(3) {
      (left, top, right, bottom) = (left.min(p[0] - ink), top.min(p[1] - ink), right.max(p[0] + ink), bottom.max(p[1] + ink));
    }
  }
  for stroke in &mut drawing.strokes {
    for p in stroke.points.chunks_mut(3) {
      (p[0], p[1]) = (tenth(p[0] - left), tenth(p[1] - top));
    }
  }
  (drawing.x, drawing.y) = (tenth(drawing.x + left), tenth(drawing.y + top));
  (drawing.w, drawing.h) = (tenth(right - left), tenth(bottom - top));
}

/// Rounded to a tenth, halves up, as the browser backend rounds.
fn tenth(v: f64) -> f64 {
  (v * 10.0 + 0.5).floor() / 10.0
}

fn hundredth(v: f64) -> f64 {
  (v * 100.0 + 0.5).floor() / 100.0
}
