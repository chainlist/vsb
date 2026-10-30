//! Drawings: strokes grouped by where they start, each in its own color and width, erased whole or
//! cut, moved, recolored and deleted, kept in zones as cards are, and found by the viewport query.

use super::{files, hour_ago, move_to, open, put_zone, set_time, Fixture, WORLD};
use crate::drawings::{Cut, Erased};
use crate::index::Rect;
use crate::items::{Kind, MEDIUM};
use crate::session::Session;
use serde_json::{json, Value};

const YELLOW: &str = "#f5d76e";

/// Points as world x, y and pressure 0.5, from (x, y) pairs.
fn stroke(points: &[(f64, f64)]) -> Vec<f64> {
  points.iter().flat_map(|&(x, y)| [x, y, 0.5]).collect()
}

fn drawing(f: &Fixture, id: &str) -> Value {
  files(f)[&format!("drawings/{id}.json")].clone()
}

/// A stroke in the ink, at medium width.
fn drawn(s: &Session, points: &[(f64, f64)]) -> String {
  s.add_stroke(&stroke(points), None, MEDIUM).unwrap().id
}

fn erase(id: &str, cuts: Vec<(usize, Vec<Vec<f64>>)>) -> Erased {
  Erased { id: id.into(), strokes: cuts.into_iter().map(|(index, pieces)| Cut { index, pieces }).collect() }
}

#[test]
fn a_stroke_starts_a_drawing_its_points_rounded_from_its_corner() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.add_stroke(&[10.04, 20.06, 0.333, 30.0, 5.0, 0.7, 50.0, 25.0, 1.4], None, MEDIUM).unwrap().id;
  // The box holds the ink, half the medium width past the points.
  let strokes = json!([{ "points": [1.5, 16.6, 0.33, 21.5, 1.5, 0.7, 41.5, 21.5, 1.0] }]);
  assert_eq!(drawing(&f, &id), json!({ "zone": null, "x": 8.5, "y": 3.5, "w": 43.0, "h": 23.0, "strokes": strokes }), "ink and medium left out");
  let text = f.read(&format!(".canvas/drawings/{id}.json"));
  assert!(text.contains("\n    {\"points\":[1.5,16.6,0.33,21.5,1.5,0.7,41.5,21.5,1.0]}\n"), "a stroke on one line: {text}");
  assert!(s.add_stroke(&[1.0, 2.0], None, MEDIUM).is_err(), "points come in threes");
  assert!(s.add_stroke(&[1.0, 2.0, 0.5], None, 0.0).is_err(), "a stroke has a width");
}

#[test]
fn a_stroke_starting_near_a_drawing_joins_the_nearest_and_grows_its_box() {
  let f = Fixture::new();
  let s = open(&f);
  let a = drawn(&s, &[(0.0, 0.0), (100.0, 0.0)]);
  let b = drawn(&s, &[(160.0, 0.0), (200.0, 0.0)]);
  assert_ne!(a, b, "58.5 units off is too far");
  assert_eq!(drawn(&s, &[(125.0, 5.0), (125.0, 20.0)]), a, "24 units from A's box, 34 from B's");
  let undo = s.add_stroke(&stroke(&[(-20.0, -20.0), (10.0, 10.0)]), None, MEDIUM).unwrap();
  assert_eq!(undo.id, a, "26 units from A's corner");
  let strokes = json!([
    { "points": [21.5, 21.5, 0.5, 121.5, 21.5, 0.5] },
    { "points": [146.5, 26.5, 0.5, 146.5, 41.5, 0.5] },
    { "points": [1.5, 1.5, 0.5, 31.5, 31.5, 0.5] }
  ]);
  assert_eq!(drawing(&f, &a), json!({ "zone": null, "x": -21.5, "y": -21.5, "w": 148.0, "h": 43.0, "strokes": strokes }), "grown left and up");
  s.apply(undo.undo).unwrap();
  assert_eq!(drawing(&f, &a)["x"], json!(-1.5), "one undo step per stroke");
  assert_eq!(files(&f).len(), 2);
}

#[test]
fn strokes_of_other_colors_and_widths_join_a_drawing_each_keeping_its_own() {
  let f = Fixture::new();
  let s = open(&f);
  let a = drawn(&s, &[(0.0, 0.0), (100.0, 0.0)]);
  let thick = s.add_stroke(&stroke(&[(110.0, 0.0), (150.0, 0.0)]), Some(YELLOW.into()), 8.0).unwrap().id;
  assert_eq!(thick, a);
  // The thick stroke's ink reaches 4 past its points.
  let strokes = json!([{ "points": [1.5, 4.0, 0.5, 101.5, 4.0, 0.5] }, { "points": [111.5, 4.0, 0.5, 151.5, 4.0, 0.5], "color": YELLOW, "width": 8.0 }]);
  assert_eq!(drawing(&f, &a), json!({ "zone": null, "x": -1.5, "y": -4.0, "w": 155.5, "h": 8.0, "strokes": strokes }));
  // Recoloring paints every stroke; no color takes them all back to the ink.
  s.color_items(&[], &[], std::slice::from_ref(&a), Some("#6fa8dc".into())).unwrap();
  let colors: Vec<Value> = drawing(&f, &a)["strokes"].as_array().unwrap().iter().map(|s| s["color"].clone()).collect();
  assert_eq!(colors, [json!("#6fa8dc"), json!("#6fa8dc")]);
  s.color_items(&[], &[], std::slice::from_ref(&a), None).unwrap();
  let file = drawing(&f, &a);
  assert!(file["strokes"].as_array().unwrap().iter().all(|s| s.get("color").is_none()));
  assert_eq!(file["strokes"][1]["width"], json!(8.0), "each keeps its width");
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
fn erasing_whole_strokes_shrinks_drawings_and_deletes_those_left_empty_in_one_step() {
  let f = Fixture::new();
  let s = open(&f);
  let a = drawn(&s, &[(0.0, 0.0), (100.0, 0.0)]);
  drawn(&s, &[(-20.0, -20.0), (10.0, 10.0)]);
  let b = drawn(&s, &[(500.0, 0.0), (600.0, 50.0)]);
  let before = files(&f);
  let undo = s.erase_strokes(&[erase(&a, vec![(1, vec![])]), erase(&b, vec![(0, vec![])])]).unwrap();
  assert_eq!(drawing(&f, &a), json!({ "zone": null, "x": -1.5, "y": -1.5, "w": 103.0, "h": 3.0, "strokes": [{ "points": [1.5, 1.5, 0.5, 101.5, 1.5, 0.5] }] }));
  assert!(!f.exists(&format!(".canvas/drawings/{b}.json")), "a drawing with no strokes left is deleted");
  assert!(s.index.viewport(WORLD, 0.0, None).unwrap().drawings.iter().all(|d| d.id != b));
  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn cutting_leaves_the_pieces_of_a_stroke_in_its_color_and_width() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.add_stroke(&stroke(&[(0.0, 0.0), (50.0, 0.0), (100.0, 0.0)]), Some(YELLOW.into()), 8.0).unwrap().id;
  assert_eq!(drawing(&f, &id)["strokes"][0]["points"], json!([4.0, 4.0, 0.5, 54.0, 4.0, 0.5, 104.0, 4.0, 0.5]));
  // Cut through its middle: two strokes, the drawing's box the same.
  let pieces = vec![vec![4.0, 4.0, 0.5, 44.04, 4.0, 0.504], vec![64.0, 4.0, 0.5, 104.0, 4.0, 0.5]];
  let undo = s.erase_strokes(&[erase(&id, vec![(0, pieces)])]).unwrap();
  let piece = |points: Value| json!({ "points": points, "color": YELLOW, "width": 8.0 });
  let strokes = json!([piece(json!([4.0, 4.0, 0.5, 44.0, 4.0, 0.5])), piece(json!([64.0, 4.0, 0.5, 104.0, 4.0, 0.5]))]);
  assert_eq!(drawing(&f, &id), json!({ "zone": null, "x": -4.0, "y": -4.0, "w": 108.0, "h": 8.0, "strokes": strokes }));
  s.apply(undo).unwrap();
  // Cut off its left part: the box shrinks to what is left.
  s.erase_strokes(&[erase(&id, vec![(0, vec![vec![64.0, 4.0, 0.5, 104.0, 4.0, 0.5]])])]).unwrap();
  let file = drawing(&f, &id);
  assert_eq!((&file["x"], &file["w"], &file["strokes"][0]["points"]), (&json!(56.0), &json!(48.0), &json!([4.0, 4.0, 0.5, 44.0, 4.0, 0.5])));
  assert!(s.erase_strokes(&[erase(&id, vec![(0, vec![vec![1.0]])])]).is_err(), "pieces are points too");
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
fn the_viewport_brings_drawings_open_and_zoomed_out_the_loose_ones_and_previews_by_color() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 1000.0, 0.0, 1000.0, 1000.0);
  let s = open(&f);
  let inside = drawn(&s, &[(1100.0, 100.0), (1300.0, 200.0)]);
  let loose = drawn(&s, &[(-500.0, 0.0), (-300.0, 100.0)]);
  s.color_items(&[], &[], std::slice::from_ref(&inside), Some(YELLOW.into())).unwrap();
  drawn(&s, &[(1310.0, 210.0), (1320.0, 230.0)]);
  let open_view = s.index.viewport(WORLD, 0.0, None).unwrap();
  let mut shown: Vec<_> = open_view.drawings.iter().map(|d| (d.id.clone(), d.x, d.y, serde_json::to_value(&d.strokes).unwrap())).collect();
  shown.sort_by(|a, b| a.1.total_cmp(&b.1));
  let first = json!([1.5, 1.5, 0.5, 201.5, 101.5, 0.5]);
  let second = json!([211.5, 111.5, 0.5, 221.5, 131.5, 0.5]);
  let expected = [
    (loose.clone(), -501.5, -1.5, json!([{ "points": first }])),
    (inside.clone(), 1098.5, 98.5, json!([{ "points": first, "color": YELLOW }, { "points": second }])),
  ];
  assert_eq!(shown, expected);
  assert!(s.index.viewport(WORLD, 300.0, None).unwrap().drawings.is_empty(), "smaller than the least size");

  let zoomed = s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap();
  assert_eq!(zoomed.drawings.iter().map(|d| &d.id).collect::<Vec<_>>(), [&loose], "loose ones only");
  assert!(zoomed.clusters.is_empty(), "never counted in clusters");
  let inks = serde_json::to_value(&zoomed.previews[0].inks).unwrap();
  let sketch = |strokes: Value| json!([{ "x": 98.5, "y": 98.5, "strokes": [strokes] }]);
  assert_eq!(inks, json!([{ "color": null, "drawings": sketch(second) }, { "color": YELLOW, "drawings": sketch(first) }]), "its strokes by color");
}

#[test]
fn deleting_and_inserting_a_card_reach_drawings() {
  let f = Fixture::new();
  let s = open(&f);
  let id = drawn(&s, &[(0.0, 0.0), (100.0, 50.0)]);
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
fn drawings_written_before_strokes_had_colors_keep_their_look() {
  let f = Fixture::new();
  f.write(".canvas/drawings/D.json", r##"{ "zone": null, "x": 10, "y": 10, "w": 20, "h": 0, "color": "#e98a9b", "strokes": [[0, 0, 0.5, 20, 0, 0.5]] }"##);
  let s = open(&f);
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!(serde_json::to_value(&view.drawings[0].strokes).unwrap(), json!([{ "points": [0.0, 0.0, 0.5, 20.0, 0.0, 0.5], "color": "#e98a9b" }]));
  // Written again, it takes the new shape.
  s.move_drawings(&[move_to("D", 30.0, 10.0)]).unwrap();
  let file = drawing(&f, "D");
  assert_eq!((file.get("color"), &file["strokes"]), (None, &json!([{ "points": [0.0, 0.0, 0.5, 20.0, 0.0, 0.5], "color": "#e98a9b" }])));
}

#[test]
fn drawings_are_scanned_and_checked_before_every_write() {
  let f = Fixture::new();
  f.write(".canvas/drawings/D.json", r#"{ "zone": null, "x": 10, "y": 10, "w": 20, "h": 0, "strokes": [{ "points": [0, 0, 0.5, 20, 0, 0.5] }] }"#);
  let s = open(&f);
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().drawings.len(), 1, "read at startup");
  // A sync tool brings in another stroke; recoloring keeps it.
  let synced = r#"{ "zone": null, "x": 10, "y": 10, "w": 20, "h": 10, "strokes": [{ "points": [0, 0, 0.5, 20, 0, 0.5] }, { "points": [0, 10, 0.5] }] }"#;
  f.write(".canvas/drawings/D.json", synced);
  set_time(&f, ".canvas/drawings/D.json", hour_ago());
  s.color_items(&[], &[], &["D".into()], Some("#e98a9b".into())).unwrap();
  let strokes = drawing(&f, "D")["strokes"].clone();
  assert_eq!((strokes.as_array().unwrap().len(), &strokes[1]["color"]), (2, &json!("#e98a9b")));
}
