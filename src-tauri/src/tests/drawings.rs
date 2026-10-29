//! Drawings: strokes grouped by where they start, erased, moved, recolored and deleted, kept in
//! zones as cards are, and found by the viewport query.

use super::{files, move_to, open, put_zone, set_time, hour_ago, Fixture, WORLD};
use crate::drawings::Erased;
use crate::index::Rect;
use crate::items::Kind;
use crate::session::Session;
use serde_json::{json, Value};

/// Points as world x, y and pressure 0.5, from (x, y) pairs.
fn stroke(points: &[(f64, f64)]) -> Vec<f64> {
  points.iter().flat_map(|&(x, y)| [x, y, 0.5]).collect()
}

fn drawing(f: &Fixture, id: &str) -> Value {
  files(f)[&format!("drawings/{id}.json")].clone()
}

fn drawn(s: &Session, points: &[(f64, f64)]) -> String {
  s.add_stroke(&stroke(points)).unwrap().id
}

#[test]
fn a_stroke_starts_a_drawing_its_points_rounded_from_its_corner() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.add_stroke(&[10.04, 20.06, 0.333, 30.0, 5.0, 0.7, 50.0, 25.0, 1.4]).unwrap().id;
  // The box holds the ink, 1.5 past the points.
  let strokes = json!([[1.5, 16.6, 0.33, 21.5, 1.5, 0.7, 41.5, 21.5, 1.0]]);
  assert_eq!(drawing(&f, &id), json!({ "zone": null, "x": 8.5, "y": 3.5, "w": 43.0, "h": 23.0, "strokes": strokes }));
  let text = f.read(&format!(".canvas/drawings/{id}.json"));
  assert!(text.contains("\n    [1.5,16.6,0.33,21.5,1.5,0.7,41.5,21.5,1.0]\n"), "a stroke on one line: {text}");
  assert!(s.add_stroke(&[1.0, 2.0]).is_err(), "points come in threes");
}

#[test]
fn a_stroke_starting_near_a_drawing_joins_the_nearest_and_grows_its_box() {
  let f = Fixture::new();
  let s = open(&f);
  let a = drawn(&s, &[(0.0, 0.0), (100.0, 0.0)]);
  let b = drawn(&s, &[(160.0, 0.0), (200.0, 0.0)]);
  assert_ne!(a, b, "58.5 units off is too far");
  assert_eq!(drawn(&s, &[(125.0, 5.0), (125.0, 20.0)]), a, "24 units from A's box, 34 from B's");
  let undo = s.add_stroke(&stroke(&[(-20.0, -20.0), (10.0, 10.0)])).unwrap();
  assert_eq!(undo.id, a, "26 units from A's corner");
  let strokes = json!([[21.5, 21.5, 0.5, 121.5, 21.5, 0.5], [146.5, 26.5, 0.5, 146.5, 41.5, 0.5], [1.5, 1.5, 0.5, 31.5, 31.5, 0.5]]);
  assert_eq!(drawing(&f, &a), json!({ "zone": null, "x": -21.5, "y": -21.5, "w": 148.0, "h": 43.0, "strokes": strokes }), "grown left and up");
  s.apply(undo.undo).unwrap();
  assert_eq!(drawing(&f, &a)["x"], json!(-1.5), "one undo step per stroke");
  assert_eq!(files(&f).len(), 2);
}

#[test]
fn a_new_drawing_joins_the_innermost_zone_under_its_start() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "Z1", Some("Z"), 100.0, 100.0, 400.0, 400.0);
  let s = open(&f);
  let id = drawn(&s, &[(150.0, 150.0), (700.0, 700.0)]);
  let file = drawing(&f, &id);
  assert_eq!((&file["zone"], &file["x"], &file["y"], &file["w"]), (&json!("Z1"), &json!(48.5), &json!(48.5), &json!(553.0)));
  // Strokes added later leave it in its zone, wherever they reach.
  drawn(&s, &[(160.0, 120.0), (2000.0, 120.0)]);
  assert_eq!(drawing(&f, &id)["zone"], json!("Z1"));
}

#[test]
fn erasing_shrinks_drawings_and_deletes_those_left_empty_in_one_step() {
  let f = Fixture::new();
  let s = open(&f);
  let a = drawn(&s, &[(0.0, 0.0), (100.0, 0.0)]);
  drawn(&s, &[(-20.0, -20.0), (10.0, 10.0)]);
  let b = drawn(&s, &[(500.0, 0.0), (600.0, 50.0)]);
  let before = files(&f);
  let erased = [Erased { id: a.clone(), strokes: vec![1] }, Erased { id: b.clone(), strokes: vec![0] }];
  let undo = s.erase_strokes(&erased).unwrap();
  assert_eq!(drawing(&f, &a), json!({ "zone": null, "x": -1.5, "y": -1.5, "w": 103.0, "h": 3.0, "strokes": [[1.5, 1.5, 0.5, 101.5, 1.5, 0.5]] }));
  assert!(!f.exists(&format!(".canvas/drawings/{b}.json")), "a drawing with no strokes left is deleted");
  assert!(s.index.viewport(WORLD, 0.0, None).unwrap().drawings.iter().all(|d| d.id != b));
  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn a_moved_drawing_joins_the_zone_under_its_center() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 1000.0, 0.0, 500.0, 500.0);
  let s = open(&f);
  let id = drawn(&s, &[(0.0, 0.0), (100.0, 50.0)]);
  s.move_drawings(&[move_to(&id, 1300.0, 100.0)]).unwrap();
  let file = drawing(&f, &id);
  assert_eq!((&file["zone"], &file["x"], &file["y"]), (&json!("Z"), &json!(300.0), &json!(100.0)));
  // Its center past the zone's side: back on the canvas.
  s.move_drawings(&[move_to(&id, 1460.0, 100.0)]).unwrap();
  assert_eq!(drawing(&f, &id)["zone"], Value::Null);
}

#[test]
fn zones_take_in_hold_and_hand_back_their_drawings_as_cards() {
  let f = Fixture::new();
  let s = open(&f);
  let id = drawn(&s, &[(100.0, 100.0), (200.0, 150.0)]);
  let ink = Some(Rect { min_x: 98.5, min_y: 98.5, max_x: 201.5, max_y: 151.5 });
  assert_eq!(s.index.canvas_contents().unwrap(), ink, "fit frames it");
  let zone = s.create_zone(50.0, 50.0, 300.0, 300.0).unwrap().id;
  let file = drawing(&f, &id);
  assert_eq!((&file["zone"], &file["x"], &file["y"]), (&json!(zone), &json!(48.5), &json!(48.5)), "taken in, in place");
  assert_eq!(s.index.zone_contents(&zone).unwrap(), ink);
  s.resize_zone(&zone, 150.0, 120.0, 20.0, 20.0).unwrap();
  assert_eq!(s.index.item_box(Kind::Zone, &zone).unwrap(), ink, "never smaller than its drawing");
  assert_eq!(drawing(&f, &id)["x"], json!(0.0), "its corner moved: the drawing stays in place");
  assert_eq!(s.index.zone_nodes(Some(&zone)).unwrap().drawings.len(), 1);
  s.delete_zones(std::slice::from_ref(&zone)).unwrap();
  let file = drawing(&f, &id);
  assert_eq!((&file["zone"], &file["x"], &file["y"]), (&Value::Null, &json!(98.5), &json!(98.5)), "handed back in place");
}

#[test]
fn the_viewport_brings_drawings_open_and_zoomed_out_the_loose_ones_and_previews() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 1000.0, 0.0, 1000.0, 1000.0);
  let s = open(&f);
  let inside = drawn(&s, &[(1100.0, 100.0), (1300.0, 200.0)]);
  let loose = drawn(&s, &[(-500.0, 0.0), (-300.0, 100.0)]);
  s.color_items(&[], &[], std::slice::from_ref(&inside), Some("#f5d76e".into())).unwrap();
  let open_view = s.index.viewport(WORLD, 0.0, None).unwrap();
  let mut shown: Vec<_> = open_view.drawings.iter().map(|d| (d.id.clone(), d.x, d.y, d.color.clone(), d.strokes.clone())).collect();
  shown.sort_by(|a, b| a.1.total_cmp(&b.1));
  let strokes = vec![vec![1.5, 1.5, 0.5, 201.5, 101.5, 0.5]];
  assert_eq!(shown, [(loose.clone(), -501.5, -1.5, None, strokes.clone()), (inside.clone(), 1098.5, 98.5, Some("#f5d76e".into()), strokes.clone())]);
  assert!(s.index.viewport(WORLD, 300.0, None).unwrap().drawings.is_empty(), "smaller than the least size");

  let zoomed = s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap();
  assert_eq!(zoomed.drawings.iter().map(|d| &d.id).collect::<Vec<_>>(), [&loose], "loose ones only");
  assert!(zoomed.clusters.is_empty(), "never counted in clusters");
  let ink = &zoomed.previews[0].inks[0];
  assert_eq!((zoomed.previews[0].zone.as_str(), ink.color.as_deref()), ("Z", Some("#f5d76e")));
  assert_eq!((ink.drawings[0].x, ink.drawings[0].y, &ink.drawings[0].strokes), (98.5, 98.5, &strokes));
}

#[test]
fn recoloring_deleting_and_inserting_a_card_reach_drawings() {
  let f = Fixture::new();
  let s = open(&f);
  let id = drawn(&s, &[(0.0, 0.0), (100.0, 50.0)]);
  s.color_items(&[], &[], std::slice::from_ref(&id), Some("#6fa8dc".into())).unwrap();
  assert_eq!(drawing(&f, &id)["color"], json!("#6fa8dc"));
  s.color_items(&[], &[], std::slice::from_ref(&id), None).unwrap();
  assert!(drawing(&f, &id).get("color").is_none(), "back to the ink, left out");

  super::put_card(&f, "A", None, -400.0, 0.0);
  super::put_card(&f, "B", None, -200.0, 0.0);
  f.write(".canvas/edges/E.json", r#"{ "from": "A", "to": "B" }"#);
  let s = open(&f);
  s.insert_card("E", None, Rect::of(-200.0, 0.0, 100.0, 50.0), &[move_to("B", 0.0, 0.0)], &[], &[move_to(&id, 200.0, 0.0)]).unwrap();
  assert_eq!(drawing(&f, &id)["x"], json!(200.0), "moved along to make room");

  let undo = s.delete_drawings(std::slice::from_ref(&id)).unwrap();
  assert!(!f.exists(&format!(".canvas/drawings/{id}.json")));
  s.apply(undo).unwrap();
  assert_eq!(drawing(&f, &id)["x"], json!(200.0));
}

#[test]
fn drawings_are_scanned_and_checked_before_every_write() {
  let f = Fixture::new();
  f.write(".canvas/drawings/D.json", r#"{ "zone": null, "x": 10, "y": 10, "w": 20, "h": 0, "strokes": [[0, 0, 0.5, 20, 0, 0.5]] }"#);
  let s = open(&f);
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().drawings.len(), 1, "read at startup");
  // A sync tool brings in another stroke; recoloring keeps it.
  f.write(".canvas/drawings/D.json", r#"{ "zone": null, "x": 10, "y": 10, "w": 20, "h": 10, "strokes": [[0, 0, 0.5, 20, 0, 0.5], [0, 10, 0.5]] }"#);
  set_time(&f, ".canvas/drawings/D.json", hour_ago());
  s.color_items(&[], &[], &["D".into()], Some("#e98a9b".into())).unwrap();
  let file = drawing(&f, "D");
  assert_eq!((file["strokes"].as_array().unwrap().len(), &file["color"]), (2, &json!("#e98a9b")));
}
