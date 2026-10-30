//! The check before every write: a file changed outside the app is never overwritten.

use super::{card_file, hour_ago, move_to, names, open, set_time, Fixture, WORLD};
use crate::fsx;
use crate::items::{self, Edge, HAlign, Kind, Shape, Zone};
use serde_json::json;
use std::fs;

#[test]
fn an_undo_on_a_card_changed_outside_reverts_only_what_it_changed() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let undo = s.move_cards(&[move_to(&id, 300.0, 40.0)]).unwrap();
  // A sync tool brings in a note and an alignment from another device.
  let theirs = json!({ "note": "N9", "zone": null, "x": 300, "y": 40, "w": 200, "h": 100, "halign": "center" });
  f.write(&format!(".canvas/cards/{id}.json"), &theirs.to_string());
  s.apply(undo).unwrap();
  let c = card_file(&f, &id);
  assert_eq!((c.x, c.y, c.note.as_deref(), c.halign), (0.0, 0.0, Some("N9"), HAlign::Center));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].x, view.cards[0].note.as_deref(), view.cards[0].halign.as_str()), (0.0, Some("N9"), "center"));
}

#[test]
fn an_undo_that_clears_a_field_keeps_what_changed_outside() {
  let f = Fixture::new();
  let s = open(&f);
  let a = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  let b = s.create_card(400.0, 0.0, 200.0, 100.0).unwrap();
  let edge = s.create_edge(&a, &b).unwrap().id;
  let undo = s.label_edge(&edge, "needs").unwrap();
  let rel = format!(".canvas/edges/{edge}.json");
  f.write(&rel, &json!({ "from": a, "to": b, "label": "needs", "shape": "angled" }).to_string());
  set_time(&f, &rel, hour_ago());
  s.apply(undo).unwrap();
  let e: Edge = items::read(&items::path(&f.vault, Kind::Edge, &edge)).unwrap();
  assert_eq!((e.label, e.shape), (None, Shape::Angled));
}

#[test]
fn moving_a_zone_renamed_outside_keeps_its_new_name() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_zone(0.0, 0.0, 400.0, 300.0).unwrap().id;
  let theirs = json!({ "name": "Pricing", "parent": null, "x": 0, "y": 0, "w": 400, "h": 300, "color": "#f5d76e" });
  f.write(&format!(".canvas/zones/{id}.json"), &theirs.to_string());
  s.move_zones(&[move_to(&id, 1000.0, 0.0)]).unwrap();
  let z: Zone = items::read(&items::path(&f.vault, Kind::Zone, &id)).unwrap();
  assert_eq!((z.name.as_str(), z.color.as_deref(), z.x), ("Pricing", Some("#f5d76e"), 1000.0));
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().zones[0].name, "Pricing");
}

#[test]
fn undoing_the_delete_of_a_card_changed_outside_brings_back_the_outside_version() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(0.0, 0.0, 200.0, 100.0).unwrap();
  f.write(&format!(".canvas/cards/{id}.json"), &json!({ "note": "N9", "zone": null, "x": 0, "y": 0, "w": 200, "h": 100 }).to_string());
  let undo = s.delete_cards(std::slice::from_ref(&id)).unwrap();
  assert!(!f.exists(&format!(".canvas/cards/{id}.json")));
  s.apply(undo).unwrap();
  assert_eq!(card_file(&f, &id).note.as_deref(), Some("N9"));
}

#[test]
fn saving_a_note_changed_outside_keeps_it_and_puts_the_text_in_a_conflict_note() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Plan\nv1").unwrap();
  // Same size and an older time: only "differs" catches it.
  let theirs = format!("---\nid: {note}\n---\nPlan\nv9");
  f.write("notes/Plan.md", &theirs);
  set_time(&f, "notes/Plan.md", hour_ago());
  assert!(!s.save_note(&note, "Plan\nv2").unwrap());
  assert_eq!(f.read("notes/Plan.md"), theirs);
  assert_eq!(f.read("notes/Plan (conflict).md"), "Plan\nv2");
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!(view.cards[0].excerpt.as_deref(), Some("v9"), "the card shows the version on disk");
  let id: Option<String> = s.index.db.query_row("SELECT id FROM notes WHERE path = 'notes/Plan (conflict).md'", [], |r| r.get(0)).unwrap();
  assert_eq!(id, None, "no ID: the conflict note lands in the Unplaced tray");
}

#[test]
fn saving_a_note_deleted_outside_does_not_bring_it_back() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Plan\nv1").unwrap();
  fs::remove_file(f.dir.path().join("notes/Plan.md")).unwrap();
  assert!(!s.save_note(&note, "Plan\nv2").unwrap());
  assert_eq!(names(&f.vault.notes_dir()), ["Plan (conflict).md"]);
  assert!(!s.index.viewport(WORLD, 0.0, None).unwrap().cards[0].resolved);
}

#[test]
fn a_note_changed_outside_is_never_discarded() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "x").unwrap();
  assert!(s.save_note(&note, "").unwrap());
  f.write("notes/x.md", &format!("---\nid: {note}\ntags: [later]\n---\n"));
  s.discard_note(&card, &note).unwrap();
  assert!(f.exists("notes/x.md"));
  assert_eq!(card_file(&f, &card).note.as_deref(), Some(note.as_str()));
}

#[test]
fn a_note_changed_outside_before_editing_saves_normally() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Plan\nv1").unwrap();
  f.write("notes/Plan.md", &format!("---\nid: {note}\n---\nPlan\nfrom elsewhere"));
  assert_eq!(s.read_note(&note).unwrap(), "Plan\nfrom elsewhere");
  assert!(s.save_note(&note, "Plan\nfrom elsewhere, edited").unwrap());
  assert_eq!(names(&f.vault.notes_dir()), ["Plan.md"]);
}

#[test]
fn the_apps_own_writes_are_not_taken_for_outside_changes() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let path = items::path(&f.vault, Kind::Card, &card);
  for x in [10.0, 20.0, 30.0] {
    s.move_cards(&[move_to(&card, x, 0.0)]).unwrap();
    assert!(!fsx::changed(&path, s.index.item_stamp(Kind::Card, &card).unwrap()).unwrap());
  }
  let note = s.create_note_for_card(&card, "Draft").unwrap();
  for body in ["Draft 1", "Draft 22", "Draft 333"] {
    assert!(s.save_note(&note, body).unwrap());
  }
  assert_eq!(names(&f.vault.notes_dir()), ["Draft.md"]);
  assert_eq!(s.read_note(&note).unwrap(), "Draft 333");
}
