//! What the viewport query returns: zones, cards, edges and drawings, or zoomed out clusters and
//! bundles, in absolute coordinates.

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
  pub color: Option<String>,
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

/// A drawing, in absolute coordinates, with its strokes as its file has them: from its corner.
#[derive(Serialize, Debug, PartialEq)]
pub struct DrawingView {
  pub id: String,
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  pub color: Option<String>,
  pub strokes: Vec<Vec<f64>>,
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

/// The boxes of a collapsed zone's cards of one color: None for the theme's plain stock.
#[derive(Serialize, Debug, PartialEq)]
pub struct Tint {
  pub color: Option<String>,
  pub boxes: Vec<Frame>,
}

/// A drawing in a collapsed zone's preview: its corner in the zone's coordinates, and its strokes.
#[derive(Serialize, Debug, PartialEq)]
pub struct Sketch {
  pub x: f64,
  pub y: f64,
  pub strokes: Vec<Vec<f64>>,
}

/// The drawings of a collapsed zone in one color: None for the theme's ink.
#[derive(Serialize, Debug, PartialEq)]
pub struct Ink {
  pub color: Option<String>,
  pub drawings: Vec<Sketch>,
}

/// Zoomed out, what a collapsed zone holds at any depth, in its coordinates from its top-left corner:
/// its cards' boxes by color, its inner zones' boxes and its drawings by color. No text, nothing to
/// point at.
#[derive(Serialize, Debug, PartialEq)]
pub struct PreviewView {
  pub zone: String,
  pub cards: Vec<Tint>,
  pub zones: Vec<Frame>,
  pub inks: Vec<Ink>,
}

/// Open, the zones, cards, edges and drawings; zoomed out, the outermost zones with what they hold,
/// the loose drawings, the clusters and the bundles.
#[derive(Serialize, Debug)]
pub struct Viewport {
  pub zones: Vec<ZoneView>,
  pub cards: Vec<CardView>,
  pub edges: Vec<EdgeView>,
  pub drawings: Vec<DrawingView>,
  pub clusters: Vec<ClusterView>,
  pub bundles: Vec<BundleView>,
  pub previews: Vec<PreviewView>,
}
