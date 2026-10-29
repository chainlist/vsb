//! Zones, cards, edges and drawings: one JSON file per item in `.canvas/`.

use crate::error::Result;
use crate::fsx::atomic_write;
use crate::vault::Vault;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
  Zone,
  Card,
  Edge,
  Drawing,
}

impl Kind {
  fn dir(self) -> &'static str {
    match self {
      Kind::Zone => "zones",
      Kind::Card => "cards",
      Kind::Edge => "edges",
      Kind::Drawing => "drawings",
    }
  }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HAlign {
  #[default]
  Left,
  Center,
  Right,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VAlign {
  #[default]
  Top,
  Center,
  Bottom,
}

/// How an edge runs between its cards.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
  #[default]
  Curved,
  Straight,
  Angled,
}

/// Where an edge has arrowheads: at its `to` card, at both cards, or at neither.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Arrow {
  #[default]
  To,
  Both,
  None,
}

/// How an edge's line is drawn: one solid line, dashes, dots, or two parallel lines.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Stroke {
  #[default]
  Solid,
  Dashed,
  Dotted,
  Double,
}

impl HAlign {
  pub fn as_str(self) -> &'static str {
    match self {
      HAlign::Left => "left",
      HAlign::Center => "center",
      HAlign::Right => "right",
    }
  }
}

impl VAlign {
  pub fn as_str(self) -> &'static str {
    match self {
      VAlign::Top => "top",
      VAlign::Center => "center",
      VAlign::Bottom => "bottom",
    }
  }
}

impl Shape {
  pub fn as_str(self) -> &'static str {
    match self {
      Shape::Curved => "curved",
      Shape::Straight => "straight",
      Shape::Angled => "angled",
    }
  }
}

impl Arrow {
  pub fn as_str(self) -> &'static str {
    match self {
      Arrow::To => "to",
      Arrow::Both => "both",
      Arrow::None => "none",
    }
  }
}

impl Stroke {
  pub fn as_str(self) -> &'static str {
    match self {
      Stroke::Solid => "solid",
      Stroke::Dashed => "dashed",
      Stroke::Dotted => "dotted",
      Stroke::Double => "double",
    }
  }
}

/// An edge's style: its shape, arrowheads and line. Every edge the app creates takes the vault's
/// style for new edges, unless the builder's text says otherwise.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct EdgeStyle {
  pub shape: Shape,
  pub arrow: Arrow,
  pub stroke: Stroke,
}

pub(crate) fn is_default<T: Default + PartialEq>(v: &T) -> bool {
  *v == T::default()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Zone {
  #[serde(default)]
  pub name: String,
  pub parent: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub color: Option<String>,
}

/// `x` and `y` are relative to the card's zone (or the canvas).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Card {
  pub note: Option<String>,
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
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Edge {
  pub from: String,
  pub to: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  #[serde(default, skip_serializing_if = "is_default")]
  pub shape: Shape,
  #[serde(default, skip_serializing_if = "is_default")]
  pub arrow: Arrow,
  #[serde(default, skip_serializing_if = "is_default")]
  pub stroke: Stroke,
}

/// The pen's medium width in world units, at middling pressure: a stroke's unless it says otherwise.
pub const MEDIUM: f64 = 3.0;

fn medium() -> f64 {
  MEDIUM
}

pub(crate) fn is_medium(width: &f64) -> bool {
  *width == MEDIUM
}

/// One stroke of the pen: its points as x, y and pressure in turn, from its drawing's corner, its
/// color (None for the theme's ink) and its width.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PenStroke {
  pub points: Vec<f64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub color: Option<String>,
  #[serde(default = "medium", skip_serializing_if = "is_medium")]
  pub width: f64,
}

/// Strokes of the pen grouped as one item. `x` and `y` are relative to its zone (or the canvas), as a
/// card's; `w` and `h` the box around its ink.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(from = "Written")]
pub struct Drawing {
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  pub strokes: Vec<PenStroke>,
}

/// A drawing as its file may hold it: its strokes as they are written now, or as they were before
/// strokes had their own color and width, a bare list of points each, the drawing's `color` applying
/// to all of them.
#[derive(Deserialize)]
struct Written {
  zone: Option<String>,
  x: f64,
  y: f64,
  w: f64,
  h: f64,
  #[serde(default)]
  color: Option<String>,
  strokes: Vec<WrittenStroke>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum WrittenStroke {
  Points(Vec<f64>),
  Stroke(PenStroke),
}

impl From<Written> for Drawing {
  fn from(d: Written) -> Drawing {
    let strokes = d.strokes.into_iter().map(|s| match s {
      WrittenStroke::Points(points) => PenStroke { points, color: d.color.clone(), width: MEDIUM },
      WrittenStroke::Stroke(s) => PenStroke { color: s.color.or_else(|| d.color.clone()), ..s },
    });
    Drawing { zone: d.zone, x: d.x, y: d.y, w: d.w, h: d.h, strokes: strokes.collect() }
  }
}

pub trait Item: Serialize + DeserializeOwned {
  const KIND: Kind;

  /// The file's text: pretty JSON.
  fn json(&self) -> Result<Vec<u8>> {
    Ok(serde_json::to_vec_pretty(self)?)
  }
}

impl Item for Zone {
  const KIND: Kind = Kind::Zone;
}

impl Item for Card {
  const KIND: Kind = Kind::Card;
}

impl Item for Edge {
  const KIND: Kind = Kind::Edge;
}

impl Item for Drawing {
  const KIND: Kind = Kind::Drawing;

  /// Pretty JSON as every item's, but each stroke on one line: a drawing holds hundreds of numbers.
  fn json(&self) -> Result<Vec<u8>> {
    let head = serde_json::to_string_pretty(&Drawing { zone: self.zone.clone(), strokes: Vec::new(), ..*self })?;
    if self.strokes.is_empty() {
      return Ok(head.into_bytes());
    }
    let lines = self.strokes.iter().map(serde_json::to_string).collect::<serde_json::Result<Vec<_>>>()?;
    let head = head.strip_suffix("[]\n}").unwrap_or(&head);
    Ok(format!("{head}[\n    {}\n  ]\n}}", lines.join(",\n    ")).into_bytes())
  }
}

pub fn dir(vault: &Vault, kind: Kind) -> PathBuf {
  vault.canvas_dir().join(kind.dir())
}

pub fn path(vault: &Vault, kind: Kind, id: &str) -> PathBuf {
  dir(vault, kind).join(format!("{id}.json"))
}

pub fn read<T: Item>(path: &Path) -> Result<T> {
  Ok(serde_json::from_slice(&fs::read(path)?)?)
}

/// Writes the item's file and returns its path.
pub fn write<T: Item>(vault: &Vault, id: &str, item: &T) -> Result<PathBuf> {
  let path = path(vault, T::KIND, id);
  atomic_write(&path, &item.json()?)?;
  Ok(path)
}
