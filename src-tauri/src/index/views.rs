//! What the viewport query returns: zones, cards and edges, or zoomed out clusters and bundles,
//! in absolute coordinates.

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

/// Zoomed out, the loose cards whose centers lie in one square of the grid: how many, never which.
#[derive(Serialize, Debug, PartialEq)]
pub struct ClusterView {
  /// The square's column and row, counted in squares from the world origin.
  pub cell: [i64; 2],
  pub count: i64,
  /// The box around its cards.
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// One end of a bundle: an outermost zone and its box, or, with no zone, the box of a cluster.
#[derive(Serialize, Debug, PartialEq)]
pub struct BundleEnd {
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

/// Zoomed out, the edges between two ends drawn as one line.
#[derive(Serialize, Debug, PartialEq)]
pub struct BundleView {
  pub ends: [BundleEnd; 2],
  pub count: i64,
  /// Where the line has arrowheads, as for an edge: at the end some edge points to, the second.
  pub arrow: String,
}

/// Open, the zones, cards and edges; zoomed out, the outermost zones, the clusters and the bundles.
#[derive(Serialize, Debug)]
pub struct Viewport {
  pub zones: Vec<ZoneView>,
  pub cards: Vec<CardView>,
  pub edges: Vec<EdgeView>,
  pub clusters: Vec<ClusterView>,
  pub bundles: Vec<BundleView>,
}
