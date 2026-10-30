//! Tab's linked card: an empty card in its parent's zone and the edge to it, in one step.

use super::{card_file, files, open, put_card, put_zone, Fixture, WORLD};
use crate::index::Rect;
use crate::items::{self, Arrow, Edge, EdgeStyle, Kind, Shape, Stroke, Zone};

/// The one edge file there is.
fn only_edge(f: &Fixture) -> Edge {
  let dir = f.dir.path().join(".canvas/edges");
  let mut all = std::fs::read_dir(dir).unwrap().map(|e| items::read::<Edge>(&e.unwrap().path()).unwrap());
  let edge = all.next().expect("an edge");
  assert!(all.next().is_none(), "one edge");
  edge
}

#[test]
fn a_child_and_its_edge_are_one_step_in_the_parent_zone_grown_to_hold_it() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 100.0, 0.0, 600.0, 260.0);
  put_card(&f, "P", Some("Z"), 20.0, 60.0);
  let s = open(&f);
  let before = files(&f);
  // Left of the zone: it grows leftward, a square past the card, its contents staying in place.
  let created = s.add_child("P", Rect::of(-200.0, 60.0, 240.0, 140.0)).unwrap();
  let new = created.id.as_str();

  let card = card_file(&f, new);
  assert_eq!((card.note, card.zone.as_deref(), card.x, card.y, card.w, card.h, card.color), (None, Some("Z"), 20.0, 60.0, 240.0, 140.0, None));
  let zone: Zone = items::read(&items::path(&f.vault, Kind::Zone, "Z")).unwrap();
  assert_eq!((zone.x, zone.w), (-220.0, 920.0));
  let parent = s.index.viewport(WORLD, 0.0, None).unwrap().cards.into_iter().find(|c| c.id == "P").unwrap();
  assert_eq!((parent.x, parent.y), (120.0, 60.0), "the parent stays where it was on the canvas");

  let edge = only_edge(&f);
  assert_eq!((edge.from.as_str(), edge.to.as_str(), edge.label), ("P", new, None));
  assert_eq!((edge.shape, edge.arrow, edge.stroke), (Shape::Curved, Arrow::To, Stroke::Solid));

  s.apply(created.undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn a_childs_edge_takes_the_vaults_style_for_new_edges() {
  let f = Fixture::new();
  put_card(&f, "P", None, 0.0, 60.0);
  let style = EdgeStyle { shape: Shape::Angled, arrow: Arrow::None, stroke: Stroke::Dotted };
  f.vault.set_edge_style(style).unwrap();
  let s = open(&f);
  s.add_child("P", Rect::of(400.0, 60.0, 240.0, 140.0)).unwrap();
  let edge = only_edge(&f);
  assert_eq!(EdgeStyle { shape: edge.shape, arrow: edge.arrow, stroke: edge.stroke }, style);
}

#[test]
fn a_child_stays_in_its_parent_zone_whatever_lies_under_it() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 400.0, 0.0, 600.0, 400.0);
  put_card(&f, "P", None, 0.0, 60.0);
  let s = open(&f);
  let id = s.add_child("P", Rect::of(500.0, 100.0, 240.0, 140.0)).unwrap().id;
  let card = card_file(&f, &id);
  assert_eq!((card.zone, card.x, card.y), (None, 500.0, 100.0));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().edges.len(), 1);
}

#[test]
fn a_child_of_a_missing_card_is_refused() {
  let f = Fixture::new();
  let s = open(&f);
  let before = files(&f);
  assert!(s.add_child("GONE", Rect::of(0.0, 0.0, 240.0, 140.0)).is_err());
  assert_eq!(files(&f), before);
}
