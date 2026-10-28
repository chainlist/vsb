use super::{card_file, move_to, open, Fixture, WORLD};
use crate::items::{HAlign, Kind, VAlign};
use serde_json::Value;
use std::fs;

fn raw(f: &Fixture, rel: &str) -> Value {
  serde_json::from_str(&f.read(rel)).unwrap()
}

fn with_zone() -> Fixture {
  let f = Fixture::new();
  f.write(".canvas/zones/Z.json", r#"{ "name": "Z", "parent": null, "x": 1000, "y": 0, "w": 500, "h": 500 }"#);
  f
}

#[test]
fn dropping_into_a_zone_joins_it_and_dropping_outside_leaves_it() {
  let f = with_zone();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  s.move_cards(&[move_to(&id, 1100.0, 50.0)]).unwrap();
  let c = card_file(&f, &id);
  assert_eq!((c.zone.as_deref(), c.x, c.y), (Some("Z"), 100.0, 50.0));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].x, view.cards[0].y), (1100.0, 50.0));
  s.move_cards(&[move_to(&id, 300.0, 40.0)]).unwrap();
  let c = card_file(&f, &id);
  assert_eq!((c.zone, c.x, c.y), (None, 300.0, 40.0));
}

#[test]
fn applying_the_returned_states_undoes_and_redoes_an_edit() {
  let f = with_zone();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let rel = format!(".canvas/cards/{id}.json");
  let original = raw(&f, &rel);
  let undo = s.move_cards(&[move_to(&id, 1100.0, 50.0)]).unwrap();
  let moved = raw(&f, &rel);
  let redo = s.apply(undo).unwrap();
  assert_eq!(raw(&f, &rel), original);
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards[0].x, 0.0, "the index follows");
  s.apply(redo).unwrap();
  assert_eq!(raw(&f, &rel), moved);
}

#[test]
fn undoing_a_placement_removes_the_card() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let redo = s.apply(vec![crate::states::ItemState { kind: Kind::Card, id: id.clone(), value: None }]).unwrap();
  assert!(!f.exists(&format!(".canvas/cards/{id}.json")));
  assert!(s.index.viewport(WORLD, 0.0, None).unwrap().cards.is_empty());
  s.apply(redo).unwrap();
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards.len(), 1);
}

#[test]
fn deleting_a_card_removes_its_edges_and_keeps_its_note() {
  let f = Fixture::new();
  let s = open(&f);
  let a = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let b = s.create_card(400.0, 0.0, 200.0, 100.0).unwrap();
  s.create_note_for_card(&a, "Kept").unwrap();
  f.write(".canvas/edges/E.json", &format!(r#"{{ "from": "{a}", "to": "{b}" }}"#));
  let s = open(&f);
  let undo = s.delete_cards(std::slice::from_ref(&a)).unwrap();
  assert!(!f.exists(&format!(".canvas/cards/{a}.json")));
  assert!(!f.exists(".canvas/edges/E.json"));
  assert!(f.exists("notes/Kept.md"));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards.len(), 1);
  s.apply(undo).unwrap();
  assert!(f.exists(".canvas/edges/E.json"));
  assert!(card_file(&f, &a).note.is_some());
  let edges: i64 = s.index.db.query_row("SELECT count(*) FROM edge_bounds", [], |r| r.get(0)).unwrap();
  assert_eq!(edges, 1);
}

#[test]
fn resizing_from_the_bottom_right_keeps_position_and_zone() {
  let f = with_zone();
  let s = open(&f);
  let id = s.create_card(1100.0, 100.0, 200.0, 100.0).unwrap();
  s.resize_card(&id, 1100.0, 100.0, 320.0, 180.0).unwrap();
  let c = card_file(&f, &id);
  assert_eq!((c.zone.as_deref(), c.x, c.y, c.w, c.h), (Some("Z"), 100.0, 100.0, 320.0, 180.0));
}

#[test]
fn resizing_from_the_top_left_moves_the_corner_but_not_the_zone() {
  let f = with_zone();
  let s = open(&f);
  let id = s.create_card(1100.0, 100.0, 200.0, 100.0).unwrap();
  // The new corner lies outside the zone; the card still belongs to it.
  s.resize_card(&id, 950.0, 80.0, 350.0, 120.0).unwrap();
  let c = card_file(&f, &id);
  assert_eq!((c.zone.as_deref(), c.x, c.y, c.w, c.h), (Some("Z"), -50.0, 80.0, 350.0, 120.0));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].x, view.cards[0].y), (950.0, 80.0));
}

#[test]
fn aligning_writes_alignment_and_default_drops_it_again() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let rel = format!(".canvas/cards/{id}.json");
  s.align_cards(std::slice::from_ref(&id), HAlign::Center, VAlign::Bottom).unwrap();
  assert_eq!((raw(&f, &rel)["halign"].as_str(), raw(&f, &rel)["valign"].as_str()), (Some("center"), Some("bottom")));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards[0].halign, "center");
  s.align_cards(std::slice::from_ref(&id), HAlign::Left, VAlign::Top).unwrap();
  assert!(raw(&f, &rel).get("halign").is_none() && raw(&f, &rel).get("valign").is_none());
}

#[test]
fn clearing_an_unresolved_card_makes_it_empty() {
  let f = Fixture::new();
  f.write(".canvas/cards/C.json", r#"{ "note": "GONE", "zone": null, "x": 0, "y": 0, "w": 200, "h": 100 }"#);
  let s = open(&f);
  s.clear_card("C").unwrap();
  assert_eq!(card_file(&f, "C").note, None);
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].note.as_deref(), view.cards[0].resolved), (None, false));
}

#[test]
fn deleting_both_ends_of_an_edge_and_undoing_restores_all_three() {
  let f = Fixture::new();
  let s = open(&f);
  let a = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let b = s.create_card(400.0, 0.0, 200.0, 100.0).unwrap();
  f.write(".canvas/edges/E.json", &format!(r#"{{ "from": "{a}", "to": "{b}" }}"#));
  let s = open(&f);
  let undo = s.delete_cards(&[a.clone(), b.clone()]).unwrap();
  assert_eq!(undo.iter().filter(|u| u.value.is_some()).count(), 3);
  assert!(fs::read_dir(f.dir.path().join(".canvas/cards")).unwrap().next().is_none());
  s.apply(undo).unwrap();
  assert!(f.exists(".canvas/edges/E.json"));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards.len(), 2);
}

#[test]
fn a_card_and_a_zone_take_one_color_in_one_step_and_lose_it_again() {
  let f = with_zone();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let rel = format!(".canvas/cards/{id}.json");
  assert!(raw(&f, &rel).get("color").is_none(), "no color, no field");

  let undo = s.color_items(std::slice::from_ref(&id), &["Z".into()], Some("#f5d76e".into())).unwrap();
  assert_eq!((raw(&f, &rel)["color"].as_str(), raw(&f, ".canvas/zones/Z.json")["color"].as_str()), (Some("#f5d76e"), Some("#f5d76e")));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].color.as_deref(), view.zones[0].color.as_deref()), (Some("#f5d76e"), Some("#f5d76e")));

  // One undo step takes both back.
  s.apply(undo).unwrap();
  assert!(raw(&f, &rel).get("color").is_none() && raw(&f, ".canvas/zones/Z.json").get("color").is_none());
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards[0].color, None);
  s.color_items(std::slice::from_ref(&id), &[], Some("#6fa8dc".into())).unwrap();
  s.color_items(std::slice::from_ref(&id), &[], None).unwrap();
  assert!(raw(&f, &rel).get("color").is_none(), "no color leaves the field out again");
}

#[test]
fn a_card_color_from_its_file_is_indexed_and_kept_by_other_edits() {
  let f = Fixture::new();
  f.write(".canvas/cards/C.json", r##"{ "note": null, "zone": null, "x": 0, "y": 0, "w": 200, "h": 100, "color": "#6fa8dc" }"##);
  let s = open(&f);
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().cards[0].color.as_deref(), Some("#6fa8dc"));
  s.move_cards(&[move_to("C", 40.0, 0.0)]).unwrap();
  s.align_cards(&["C".into()], HAlign::Center, VAlign::Center).unwrap();
  assert_eq!(card_file(&f, "C").color.as_deref(), Some("#6fa8dc"));
}
