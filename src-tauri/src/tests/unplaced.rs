use super::{card_file, hour_ago, names, open, set_time, Fixture};
use crate::index::Entry;
use crate::note::NoteText;
use crate::session::Session;
use std::fs;
use std::time::Duration;

/// The tray's paths, in order.
fn tray(s: &Session) -> Vec<String> {
  let entries = s.index.unplaced(0, 50).unwrap();
  entries.into_iter().map(|e| if let Entry::Note { path, .. } = e { path } else { panic!("a zone in the tray") }).collect()
}

#[test]
fn the_tray_lists_notes_with_no_card_newest_first_a_page_at_a_time() {
  let f = Fixture::new();
  f.write("notes/placed.md", "---\nid: N1\n---\nPlaced");
  f.write(".canvas/cards/C1.json", r#"{ "note": "N1", "zone": null, "x": 0, "y": 0, "w": 100, "h": 50 }"#);
  f.write("notes/orphan.md", "---\nid: N2\n---\nOrphan\n\nIts cards were deleted");
  f.write("notes/new.md", "New idea\n\nWritten outside the app");
  set_time(&f, "notes/orphan.md", hour_ago() - Duration::from_secs(60));
  set_time(&f, "notes/new.md", hour_ago());
  let s = open(&f);
  assert_eq!(tray(&s), ["notes/new.md", "notes/orphan.md"]);
  let first = s.index.unplaced(0, 1).unwrap();
  let entry = Entry::Note { path: "notes/new.md".into(), title: "New idea".into(), excerpt: "Written outside the app".into(), card: None };
  assert_eq!(first, [entry]);
  assert_eq!(s.index.unplaced(1, 1).unwrap().len(), 1);
  assert!(s.index.unplaced(2, 1).unwrap().is_empty());
  s.delete_cards(&["C1".into()]).unwrap();
  assert_eq!(tray(&s), ["notes/placed.md", "notes/new.md", "notes/orphan.md"]);
}

#[test]
fn a_conflict_copy_lands_in_the_tray() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Plan").unwrap();
  f.write("notes/Plan.md", &format!("---\nid: {note}\n---\nPlan, from another device"));
  assert!(!s.save_note(&note, "Plan\nmine").unwrap());
  assert_eq!(tray(&s), ["notes/Plan (conflict).md"]);
}

#[test]
fn placing_a_note_writes_its_id_then_its_card_as_one_undo_step() {
  let f = Fixture::new();
  f.write(".canvas/zones/Z.json", r#"{ "name": "Z", "parent": null, "x": 1000, "y": 0, "w": 500, "h": 500 }"#);
  f.write("notes/idea.md", "---\ntags: [x]\n---\nIdea\nbody");
  let s = open(&f);
  let placed = s.place_note("notes/idea.md", 1100.0, 100.0, 240.0, 140.0).unwrap();
  let id = NoteText::parse(&f.read("notes/idea.md")).id().unwrap();
  assert_eq!(f.read("notes/idea.md"), format!("---\nid: {id}\ntags: [x]\n---\nIdea\nbody"), "other keys stay");
  let card = card_file(&f, &placed.id);
  assert_eq!((card.note.as_deref(), card.zone.as_deref(), card.x, card.y), (Some(id.as_str()), Some("Z"), 100.0, 100.0));
  assert!(tray(&s).is_empty());

  let redo = s.apply(placed.undo).unwrap();
  assert!(!f.exists(&format!(".canvas/cards/{}.json", placed.id)));
  assert_eq!(tray(&s), ["notes/idea.md"], "back in the tray, keeping its ID");
  assert_eq!(NoteText::parse(&f.read("notes/idea.md")).id(), Some(id.clone()));
  s.apply(redo).unwrap();
  assert_eq!(card_file(&f, &placed.id).note, Some(id));
  assert!(tray(&s).is_empty());
}

#[test]
fn a_note_with_its_card_gets_no_second_one() {
  let f = Fixture::new();
  f.write("notes/a.md", "---\nid: N1\n---\nA");
  let s = open(&f);
  let first = s.place_note("notes/a.md", 0.0, 0.0, 240.0, 140.0).unwrap();
  assert_eq!(f.read("notes/a.md"), "---\nid: N1\n---\nA", "an ID it has is kept as it is");
  let again = s.place_note("notes/a.md", 500.0, 0.0, 240.0, 140.0).unwrap();
  assert_eq!((again.id, again.undo.len()), (first.id, 0));
  assert_eq!(names(&f.dir.path().join(".canvas/cards")).len(), 1);
}

#[test]
fn only_a_note_the_index_knows_and_that_is_still_there_is_placed() {
  let f = Fixture::new();
  f.write("notes/gone.md", "Gone");
  f.write("outside.md", "Not a note");
  let s = open(&f);
  fs::remove_file(f.dir.path().join("notes/gone.md")).unwrap();
  for path in ["notes/gone.md", "notes/missing.md", "outside.md", "notes/../outside.md"] {
    assert!(s.place_note(path, 0.0, 0.0, 240.0, 140.0).is_err(), "{path}");
  }
  assert!(tray(&s).is_empty(), "the vanished note left the index");
  assert!(!f.dir.path().join(".canvas/cards").exists());
  assert_eq!(f.read("outside.md"), "Not a note");
}
