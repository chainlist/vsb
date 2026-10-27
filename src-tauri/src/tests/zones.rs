use super::{files, move_to, open, put_card, put_zone, rtree, Fixture, WORLD};
use crate::index::Rect;
use crate::items::{self, Card, Kind, Zone};
use crate::session::Session;
use serde_json::Value;
use std::collections::BTreeMap;

fn zone(f: &Fixture, id: &str) -> Zone {
  items::read(&items::path(&f.vault, Kind::Zone, id)).unwrap()
}

fn card(f: &Fixture, id: &str) -> Card {
  items::read(&items::path(&f.vault, Kind::Card, id)).unwrap()
}

/// Every item's absolute position, from the viewport query.
fn positions(s: &Session) -> BTreeMap<String, (f64, f64)> {
  let view = s.index.viewport(WORLD, 0.0, false).unwrap();
  let zones = view.zones.into_iter().map(|z| (z.id, (z.x, z.y)));
  zones.chain(view.cards.into_iter().map(|c| (c.id, (c.x, c.y)))).collect()
}

fn changed(before: &BTreeMap<String, Value>, after: &BTreeMap<String, Value>) -> Vec<String> {
  let keys = before.keys().chain(after.keys()).collect::<std::collections::BTreeSet<_>>();
  keys.into_iter().filter(|k| before.get(*k) != after.get(*k)).cloned().collect()
}

#[test]
fn drawing_a_zone_takes_in_what_lies_fully_inside_it_and_undo_gives_it_back() {
  let f = Fixture::new();
  put_card(&f, "IN", None, 100.0, 100.0);
  put_card(&f, "EDGE", None, 380.0, 100.0);
  put_zone(&f, "Q", None, 150.0, 200.0, 200.0, 150.0);
  put_card(&f, "QC", Some("Q"), 10.0, 10.0);
  put_zone(&f, "R", None, 350.0, 300.0, 200.0, 200.0);
  let s = open(&f);
  let (before, at) = (files(&f), positions(&s));

  let created = s.create_zone(50.0, 50.0, 400.0, 400.0).unwrap();
  let n = created.id.as_str();
  assert_eq!((zone(&f, n).parent, zone(&f, n).x, zone(&f, n).y), (None, 50.0, 50.0));
  let c = card(&f, "IN");
  assert_eq!((c.zone.as_deref(), c.x, c.y), (Some(n), 50.0, 50.0));
  let q = zone(&f, "Q");
  assert_eq!((q.parent.as_deref(), q.x, q.y), (Some(n), 100.0, 150.0), "zones join too");
  assert_eq!(card(&f, "EDGE").zone, None, "partly inside stays out");
  assert_eq!(zone(&f, "R").parent, None);
  let mut expected = at.clone();
  expected.insert(n.to_string(), (50.0, 50.0));
  assert_eq!(positions(&s), expected, "nothing moves on screen");
  assert_eq!(changed(&before, &files(&f)), ["cards/IN.json".into(), format!("zones/{n}.json"), "zones/Q.json".into()]);

  s.apply(created.undo).unwrap();
  assert_eq!(files(&f), before);
  assert_eq!(positions(&s), at);
}

#[test]
fn a_zone_drawn_inside_a_zone_nests_there_and_takes_in_only_its_siblings() {
  let f = Fixture::new();
  put_zone(&f, "P", None, 1000.0, 0.0, 800.0, 800.0);
  put_card(&f, "C1", Some("P"), 100.0, 100.0);
  put_zone(&f, "Q", Some("P"), 250.0, 250.0, 300.0, 300.0);
  // Inside the new zone's rectangle, but its zone Q only overlaps the new zone.
  put_card(&f, "C2", Some("Q"), 10.0, 10.0);
  let s = open(&f);

  let n = s.create_zone(1050.0, 50.0, 350.0, 350.0).unwrap().id;
  let z = zone(&f, &n);
  assert_eq!((z.parent.as_deref(), z.x, z.y), (Some("P"), 50.0, 50.0));
  let c1 = card(&f, "C1");
  assert_eq!((c1.zone.as_deref(), c1.x, c1.y), (Some(n.as_str()), 50.0, 50.0));
  assert_eq!(card(&f, "C2").zone.as_deref(), Some("Q"));
  assert_eq!(zone(&f, "Q").parent.as_deref(), Some("P"));
}

#[test]
fn moving_a_zone_writes_one_file_and_brings_its_contents_and_their_edges_along() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 600.0, 600.0);
  put_zone(&f, "Z2", Some("Z"), 100.0, 100.0, 300.0, 300.0);
  put_card(&f, "C1", Some("Z"), 450.0, 450.0);
  put_card(&f, "C2", Some("Z2"), 10.0, 20.0);
  put_card(&f, "D", None, 2000.0, 0.0);
  f.write(".canvas/edges/E.json", r#"{ "from": "C2", "to": "D" }"#);
  let s = open(&f);
  let before = files(&f);

  let undo = s.move_zones(&[move_to("Z", 1000.0, 500.0)]).unwrap();
  assert_eq!(changed(&before, &files(&f)), ["zones/Z.json"]);
  let at = positions(&s);
  assert_eq!((at["Z2"], at["C1"], at["C2"], at["D"]), ((1100.0, 600.0), (1450.0, 950.0), (1110.0, 620.0), (2000.0, 0.0)));
  assert_eq!(rtree(&s, "zones", "Z2"), (1100.0, 600.0, 1400.0, 900.0));
  assert_eq!(rtree(&s, "cards", "C2"), (1110.0, 620.0, 1210.0, 670.0));
  assert_eq!(rtree(&s, "edges", "E"), (1110.0, 0.0, 2100.0, 670.0));

  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
  assert_eq!(rtree(&s, "edges", "E"), (110.0, 0.0, 2100.0, 170.0));
}

#[test]
fn dropping_a_zone_inside_another_nests_it_and_dragging_it_out_unnests_it() {
  let f = Fixture::new();
  put_zone(&f, "A", None, 0.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "B", None, 2000.0, 0.0, 200.0, 200.0);
  put_card(&f, "BC", Some("B"), 10.0, 10.0);
  put_card(&f, "LOOSE", None, 3010.0, 10.0);
  let s = open(&f);

  s.move_zones(&[move_to("B", 100.0, 100.0)]).unwrap();
  let b = zone(&f, "B");
  assert_eq!((b.parent.as_deref(), b.x, b.y), (Some("A"), 100.0, 100.0));
  assert_eq!(positions(&s)["BC"], (110.0, 110.0));

  // Half out of A is out; landing on a loose card does not capture it.
  s.move_zones(&[move_to("B", 900.0, 0.0)]).unwrap();
  assert_eq!(zone(&f, "B").parent, None);
  s.move_zones(&[move_to("B", 3000.0, 0.0)]).unwrap();
  let b = zone(&f, "B");
  assert_eq!((b.parent, b.x, b.y), (None, 3000.0, 0.0));
  assert_eq!(card(&f, "LOOSE").zone, None);
}

#[test]
fn a_zone_never_lands_inside_itself_or_another_zone_moving_with_it() {
  let f = Fixture::new();
  // K overhangs its parent P: P's new place lies inside K's old one.
  put_zone(&f, "P", None, 0.0, 0.0, 500.0, 500.0);
  put_zone(&f, "K", Some("P"), 0.0, 0.0, 2000.0, 2000.0);
  put_zone(&f, "S1", None, 5000.0, 0.0, 100.0, 100.0);
  put_zone(&f, "S2", None, 6000.0, 0.0, 1000.0, 1000.0);
  let s = open(&f);

  s.move_zones(&[move_to("P", 100.0, 100.0)]).unwrap();
  assert_eq!(zone(&f, "P").parent, None);
  // S1 lands where S2 was, while S2 moves away.
  s.move_zones(&[move_to("S1", 6100.0, 100.0), move_to("S2", 9000.0, 0.0)]).unwrap();
  assert_eq!(zone(&f, "S1").parent, None);
}

#[test]
fn a_zone_cannot_shrink_past_its_contents_which_stay_in_place() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 1000.0, 1000.0);
  put_card(&f, "C", Some("Z"), 300.0, 300.0);
  put_zone(&f, "K", Some("Z"), 600.0, 600.0, 200.0, 200.0);
  // Overhangs K to the right: the contents reach x = 850.
  put_card(&f, "KC", Some("K"), 150.0, 150.0);
  let s = open(&f);
  let (before, at) = (files(&f), positions(&s));
  assert_eq!(s.index.zone_contents("Z").unwrap(), Some(Rect { min_x: 300.0, min_y: 300.0, max_x: 850.0, max_y: 800.0 }));

  let undo = s.resize_zone("Z", 500.0, 500.0, 100.0, 100.0).unwrap();
  let z = zone(&f, "Z");
  assert_eq!((z.x, z.y, z.w, z.h), (300.0, 300.0, 550.0, 500.0));
  assert_eq!((card(&f, "C").x, zone(&f, "K").x), (0.0, 300.0));
  assert_eq!(changed(&before, &files(&f)), ["cards/C.json", "zones/K.json", "zones/Z.json"]);
  let mut expected = at.clone();
  expected.insert("Z".into(), (300.0, 300.0));
  assert_eq!(positions(&s), expected);

  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
  // Growing from the bottom-right corner rewrites only the zone.
  s.resize_zone("Z", 0.0, 0.0, 1200.0, 1100.0).unwrap();
  assert_eq!(changed(&before, &files(&f)), ["zones/Z.json"]);
  assert_eq!(s.index.zone_contents("C").unwrap(), None, "a card holds nothing");
}

#[test]
fn deleting_a_zone_moves_its_contents_up_in_place_and_undo_restores_it() {
  let f = Fixture::new();
  put_zone(&f, "P", None, 1000.0, 0.0, 800.0, 800.0);
  put_zone(&f, "Z", Some("P"), 100.0, 100.0, 500.0, 500.0);
  put_card(&f, "C", Some("Z"), 10.0, 10.0);
  put_zone(&f, "K", Some("Z"), 50.0, 50.0, 200.0, 200.0);
  put_card(&f, "KC", Some("K"), 5.0, 5.0);
  let s = open(&f);
  let (before, mut at) = (files(&f), positions(&s));

  let undo = s.delete_zones(&["Z".into()]).unwrap();
  assert!(!f.exists(".canvas/zones/Z.json"));
  let c = card(&f, "C");
  assert_eq!((c.zone.as_deref(), c.x, c.y), (Some("P"), 110.0, 110.0));
  let k = zone(&f, "K");
  assert_eq!((k.parent.as_deref(), k.x, k.y), (Some("P"), 150.0, 150.0));
  assert_eq!(changed(&before, &files(&f)), ["cards/C.json", "zones/K.json", "zones/Z.json"]);
  at.remove("Z");
  assert_eq!(positions(&s), at);

  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn deleting_nested_zones_together_moves_contents_to_the_nearest_zone_left() {
  let f = Fixture::new();
  put_zone(&f, "P", None, 1000.0, 0.0, 800.0, 800.0);
  put_zone(&f, "Z1", Some("P"), 100.0, 100.0, 500.0, 500.0);
  put_zone(&f, "Z2", Some("Z1"), 50.0, 50.0, 300.0, 300.0);
  put_card(&f, "C", Some("Z2"), 10.0, 10.0);
  let s = open(&f);
  let before = files(&f);

  let undo = s.delete_zones(&["Z2".into(), "Z1".into()]).unwrap();
  let c = card(&f, "C");
  assert_eq!((c.zone.as_deref(), c.x, c.y), (Some("P"), 160.0, 160.0));
  assert_eq!(positions(&s)["C"], (1160.0, 160.0));
  // Parents first, so the undo writes Z1 before Z2, which points at it.
  assert_eq!(undo.iter().map(|u| u.id.as_str()).collect::<Vec<_>>(), ["Z1", "Z2", "C"]);

  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn renaming_and_recoloring_a_zone_write_its_file() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 400.0, 400.0);
  let s = open(&f);
  let undo = s.rename_zone("Z", "Pricing").unwrap();
  s.color_zones(&["Z".into()], Some("#f5d76e".into())).unwrap();
  let view = s.index.viewport(WORLD, 0.0, false).unwrap();
  assert_eq!((view.zones[0].name.as_str(), view.zones[0].color.as_deref()), ("Pricing", Some("#f5d76e")));
  s.color_zones(&["Z".into()], None).unwrap();
  assert!(!f.read(".canvas/zones/Z.json").contains("color"), "the default color is left out");
  s.apply(undo).unwrap();
  assert_eq!(zone(&f, "Z").name, "Z");
}

#[test]
fn the_canvas_contents_cover_every_zone_and_card() {
  let f = Fixture::new();
  assert_eq!(open(&f).index.canvas_contents().unwrap(), None);
  put_zone(&f, "Z", None, 1000.0, -200.0, 400.0, 300.0);
  put_zone(&f, "K", Some("Z"), 350.0, 0.0, 200.0, 100.0);
  put_card(&f, "C", None, -50.0, 40.0);
  put_card(&f, "KC", Some("K"), 10.0, 250.0);
  let s = open(&f);
  // K overhangs Z to the right, and KC hangs below K.
  assert_eq!(s.index.canvas_contents().unwrap(), Some(Rect { min_x: -50.0, min_y: -200.0, max_x: 1550.0, max_y: 100.0 }));
}
