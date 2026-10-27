//! What the viewport query returns: zones, cards and edges in absolute coordinates.

use serde::Serialize;

/// A zone, in absolute coordinates.
#[derive(Serialize, Debug, PartialEq)]
pub struct ZoneView {
  pub id: String,
  pub parent: Option<String>,
  pub name: String,
  pub color: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// A card, in absolute coordinates, with what the index knows of its note.
#[derive(Serialize, Debug, PartialEq)]
pub struct CardView {
  pub id: String,
  pub note: Option<String>,
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  pub halign: String,
  pub valign: String,
  pub title: Option<String>,
  pub excerpt: Option<String>,
  /// False when `note` is set but no indexed file has that ID.
  pub resolved: bool,
}

/// An item's box in absolute coordinates.
#[derive(Serialize, Debug, PartialEq)]
pub struct Frame {
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// An edge, with the boxes of both its cards: it is drawn even when they are off-screen.
#[derive(Serialize, Debug, PartialEq)]
pub struct EdgeView {
  pub id: String,
  pub from: String,
  pub to: String,
  pub label: Option<String>,
  pub shape: String,
  pub arrow: String,
  pub stroke: String,
  /// The `from` card's box, then the `to` card's.
  pub ends: [Frame; 2],
}

#[derive(Serialize, Debug)]
pub struct Viewport {
  pub zones: Vec<ZoneView>,
  pub cards: Vec<CardView>,
  pub edges: Vec<EdgeView>,
}
