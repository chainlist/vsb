//! Inserting a card on an edge: the card, the split edge and the moves that make room, in one step.

use super::{card_file, files, move_to, open, put_card, put_zone, Fixture, WORLD};
use crate::index::Rect;
use crate::items::{self, Arrow, Edge, EdgeStyle, Kind, Shape, Stroke, Zone};
use std::collections::BTreeMap;

/// A zone holding Name above a row of three cards, Name joined to Space by a labeled, styled edge.
fn row() -> Fixture {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 700.0, 260.0);
  put_card(&f, "NAME", Some("Z"), 300.0, 60.0);
  for (id, x) in [("OTHERS", 20.0), ("SPACE", 340.0), ("FRENCH", 500.0)] {
    put_card(&f, id, Some("Z"), x, 160.0);
  }
  f.write(".canvas/edges/E.json", r#"{ "from": "NAME", "to": "SPACE", "label": "needs", "shape": "angled", "stroke": "dashed" }"#);
  f
}

/// Every edge file, by its cards: (from, to).
fn edges(f: &Fixture) -> BTreeMap<(String, String), Edge> {
  let dir = f.dir.path().join(".canvas/edges");
  std::fs::read_dir(dir)
    .unwrap()
    .map(|e| items::read::<Edge>(&e.unwrap().path()).unwrap())
    .map(|e| ((e.from.clone(), e.to.clone()), e))
    .collect()
}

#[test]
fn inserting_a_card_splits_the_edge_moves_the_row_and_grows_the_zone_in_one_step() {
  let f = row();
  // The halves are the old edge cut in two: the style for new edges is not theirs.
  f.vault.set_edge_style(EdgeStyle { shape: Shape::Straight, arrow: Arrow::Both, stroke: Stroke::Dotted }).unwrap();
  let s = open(&f);
  let before = files(&f);
  let moves = [move_to("OTHERS", 20.0, 410.0), move_to("SPACE", 340.0, 410.0), move_to("FRENCH", 500.0, 410.0)];
  let created = s.insert_card("E", Some("Z"), Rect::of(300.0, 190.0, 240.0, 140.0), &moves, &[]).unwrap();
  let new = created.id.as_str();

  let card = card_file(&f, new);
  assert_eq!((card.note, card.zone.as_deref(), card.x, card.y, card.w, card.h), (None, Some("Z"), 300.0, 190.0, 240.0, 140.0));
  assert_eq!((card_file(&f, "SPACE").y, card_file(&f, "FRENCH").y, card_file(&f, "NAME").y), (410.0, 410.0, 60.0));
  // Grown down to hold the moved row, with a square of room under it.
  let zone: Zone = items::read(&items::path(&f.vault, Kind::Zone, "Z")).unwrap();
  assert_eq!((zone.y, zone.h), (0.0, 480.0));

  let split = edges(&f);
  assert_eq!(split.len(), 2, "the old edge is gone");
  let first = &split[&("NAME".into(), new.into())];
  let second = &split[&(new.into(), "SPACE".into())];
  assert_eq!((first.label.as_deref(), first.shape, first.stroke), (Some("needs"), Shape::Angled, Stroke::Dashed));
  assert_eq!((second.label.as_deref(), second.shape, second.stroke), (None, Shape::Angled, Stroke::Dashed));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().edges.len(), 2);

  s.apply(created.undo).unwrap();
  assert_eq!(files(&f), before);
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards.len(), 4);
}

#[test]
fn a_card_inserted_on_the_canvas_joins_no_zone() {
  let f = Fixture::new();
  put_card(&f, "A", None, 0.0, 0.0);
  put_card(&f, "B", None, 0.0, 400.0);
  f.write(".canvas/edges/E.json", r#"{ "from": "A", "to": "B" }"#);
  let s = open(&f);
  let id = s.insert_card("E", None, Rect::of(0.0, 150.0, 100.0, 50.0), &[], &[]).unwrap().id;
  let card = card_file(&f, &id);
  assert_eq!((card.zone, card.x, card.y), (None, 0.0, 150.0));
  assert!(edges(&f).contains_key(&("A".into(), id.clone())) && edges(&f).contains_key(&(id, "B".into())));
}

#[test]
fn the_canvas_lists_its_own_cards_and_zones_for_making_room() {
  let f = row();
  put_card(&f, "LOOSE", None, 900.0, 0.0);
  let s = open(&f);
  let nodes = s.index.zone_nodes(None).unwrap().nodes;
  assert_eq!(nodes.iter().map(|n| (n.id.as_str(), n.zone)).collect::<Vec<_>>(), [("LOOSE", false), ("Z", true)]);
}
