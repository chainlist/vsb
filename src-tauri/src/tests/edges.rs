use super::{files, move_to, open, put_card, put_zone, rtree, Fixture, WORLD};
use crate::index::Rect;
use crate::items::{self, Arrow, Edge, Kind, Shape, Stroke};
use crate::session::Session;
use serde_json::Value;

type Frame = (f64, f64, f64, f64);

fn edge(f: &Fixture, id: &str) -> Edge {
  items::read(&items::path(&f.vault, Kind::Edge, id)).unwrap()
}

/// The (x, y, w, h) boxes of both cards of the only edge in `rect`.
fn ends(s: &Session, rect: Rect) -> [Frame; 2] {
  let mut edges = s.index.viewport(rect, 0.0, false).unwrap().edges;
  assert_eq!(edges.len(), 1);
  edges.remove(0).ends.map(|e| (e.x, e.y, e.w, e.h))
}

fn two_cards() -> Fixture {
  let f = Fixture::new();
  put_card(&f, "A", None, 0.0, 0.0);
  put_card(&f, "B", None, 400.0, 300.0);
  f
}

#[test]
fn creating_an_edge_writes_its_file_and_undo_removes_it() {
  let f = two_cards();
  let s = open(&f);
  let created = s.create_edge("A", "B").unwrap();
  let rel = format!(".canvas/edges/{}.json", created.id);
  let raw: Value = serde_json::from_str(&f.read(&rel)).unwrap();
  assert_eq!(raw, serde_json::json!({ "from": "A", "to": "B" }), "no label key until there is one");
  assert_eq!(ends(&s, WORLD), [(0.0, 0.0, 100.0, 50.0), (400.0, 300.0, 100.0, 50.0)]);
  assert_eq!(rtree(&s, "edges", &created.id), (0.0, 0.0, 500.0, 350.0));

  let redo = s.apply(created.undo).unwrap();
  assert!(!f.exists(&rel));
  assert!(s.index.viewport(WORLD, 0.0, false).unwrap().edges.is_empty());
  s.apply(redo).unwrap();
  assert_eq!(edge(&f, &created.id).to, "B");
  assert_eq!(s.index.viewport(WORLD, 0.0, false).unwrap().edges.len(), 1);
}

#[test]
fn an_edge_joins_two_different_existing_cards_once() {
  let f = two_cards();
  let s = open(&f);
  assert!(s.create_edge("A", "A").is_err(), "no loops");
  assert!(s.create_edge("A", "GONE").is_err(), "no edge to a missing card");
  let first = s.create_edge("A", "B").unwrap();
  // Either way round, the pair is already connected: nothing new, nothing to undo.
  let again = s.create_edge("B", "A").unwrap();
  assert_eq!((again.id, again.undo.len()), (first.id, 0));
  assert_eq!(files(&f).keys().filter(|k| k.starts_with("edges/")).count(), 1);
}

#[test]
fn labeling_an_edge_writes_it_and_an_empty_label_removes_it() {
  let f = two_cards();
  let s = open(&f);
  let id = s.create_edge("A", "B").unwrap().id;
  let undo = s.label_edge(&id, "  needs ").unwrap();
  assert_eq!(edge(&f, &id).label.as_deref(), Some("needs"));
  assert_eq!(s.index.viewport(WORLD, 0.0, false).unwrap().edges[0].label.as_deref(), Some("needs"));
  let redo = s.apply(undo).unwrap();
  assert_eq!(edge(&f, &id).label, None);
  s.apply(redo).unwrap();
  s.label_edge(&id, " ").unwrap();
  assert!(!f.read(&format!(".canvas/edges/{id}.json")).contains("label"));
}

#[test]
fn deleting_edges_with_one_of_their_cards_is_undone_in_one_step() {
  let f = two_cards();
  put_card(&f, "C", None, 800.0, 0.0);
  let s = open(&f);
  let ab = s.create_edge("A", "B").unwrap().id;
  s.create_edge("B", "C").unwrap();
  let before = files(&f);

  // As the canvas deletes a selection: edges first, then cards, which take their other edges along.
  let mut undo = s.delete_edges(std::slice::from_ref(&ab)).unwrap();
  undo.extend(s.delete_cards(&["B".into()]).unwrap());
  assert_eq!(files(&f).keys().collect::<Vec<_>>(), ["cards/A.json", "cards/C.json"]);
  assert!(s.index.viewport(WORLD, 0.0, false).unwrap().edges.is_empty());
  let count: i64 = s.index.db.query_row("SELECT count(*) FROM edge_bounds", [], |r| r.get(0)).unwrap();
  assert_eq!(count, 0);

  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
  assert_eq!(s.index.viewport(WORLD, 0.0, false).unwrap().edges.len(), 2);
}

#[test]
fn an_edge_crossing_the_viewport_is_found_with_both_cards_off_screen() {
  let f = Fixture::new();
  put_card(&f, "A", None, 0.0, 0.0);
  put_card(&f, "B", None, 2000.0, 0.0);
  let s = open(&f);
  s.create_edge("A", "B").unwrap();
  let middle = Rect { min_x: 900.0, min_y: -100.0, max_x: 1100.0, max_y: 100.0 };
  assert!(s.index.viewport(middle, 0.0, false).unwrap().cards.is_empty());
  assert_eq!(ends(&s, middle)[1], (2000.0, 0.0, 100.0, 50.0));
  let below = s.index.viewport(Rect { min_x: 900.0, min_y: 100.0, max_x: 1100.0, max_y: 300.0 }, 0.0, false).unwrap();
  assert!(below.edges.is_empty());
}

#[test]
fn edge_bounds_follow_card_moves_resizes_and_zone_moves() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 1000.0, 0.0, 500.0, 500.0);
  put_card(&f, "A", None, 0.0, 0.0);
  put_card(&f, "B", Some("Z"), 10.0, 10.0);
  let s = open(&f);
  let id = s.create_edge("A", "B").unwrap().id;
  assert_eq!(rtree(&s, "edges", &id), (0.0, 0.0, 1110.0, 60.0));

  let undo = s.move_cards(&[move_to("A", 200.0, 300.0)]).unwrap();
  assert_eq!(rtree(&s, "edges", &id), (200.0, 10.0, 1110.0, 350.0));
  s.resize_card("A", 200.0, 300.0, 400.0, 100.0).unwrap();
  assert_eq!(rtree(&s, "edges", &id), (200.0, 10.0, 1110.0, 400.0));
  assert_eq!(ends(&s, WORLD)[0], (200.0, 300.0, 400.0, 100.0));

  s.move_zones(&[move_to("Z", 3000.0, 500.0)]).unwrap();
  assert_eq!(rtree(&s, "edges", &id), (200.0, 300.0, 3110.0, 560.0));
  assert_eq!(ends(&s, WORLD)[1], (3010.0, 510.0, 100.0, 50.0));

  // Undo writes back A's file from before the move.
  s.apply(undo).unwrap();
  assert_eq!(rtree(&s, "edges", &id), (0.0, 0.0, 3110.0, 560.0));
}

#[test]
fn shape_arrow_and_stroke_are_written_only_when_not_the_default() {
  let f = two_cards();
  // A file from before edges had a style reads as curved and solid, with its arrow at `to`.
  f.write(".canvas/edges/OLD.json", r#"{ "from": "A", "to": "B" }"#);
  let s = open(&f);
  let view = s.index.viewport(WORLD, 0.0, false).unwrap().edges.remove(0);
  assert_eq!((view.shape.as_str(), view.arrow.as_str(), view.stroke.as_str()), ("curved", "to", "solid"));

  let ids = ["OLD".to_string()];
  let undo = s.shape_edges(&ids, Shape::Angled).unwrap();
  s.arrow_edges(&ids, Arrow::Both).unwrap();
  let restroke = s.stroke_edges(&ids, Stroke::Dotted).unwrap();
  let raw: Value = serde_json::from_str(&f.read(".canvas/edges/OLD.json")).unwrap();
  assert_eq!((raw["shape"].as_str(), raw["arrow"].as_str(), raw["stroke"].as_str()), (Some("angled"), Some("both"), Some("dotted")));
  let view = s.index.viewport(WORLD, 0.0, false).unwrap().edges.remove(0);
  assert_eq!((view.shape.as_str(), view.arrow.as_str(), view.stroke.as_str()), ("angled", "both", "dotted"));

  s.apply(restroke).unwrap();
  s.apply(undo).unwrap();
  assert_eq!((edge(&f, "OLD").shape, edge(&f, "OLD").stroke), (Shape::Curved, Stroke::Solid));
  s.arrow_edges(&ids, Arrow::To).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&f.read(".canvas/edges/OLD.json")).unwrap(), serde_json::json!({ "from": "A", "to": "B" }));
}
