use super::{hour_ago, put_card, set_time, Fixture, WORLD};
use crate::index::Index;
use crate::note::NoteText;
use crate::scan::{scan, Stats};
use std::fs;

const CARD_ON_N1: &str = r#"{ "note": "N1", "zone": null, "x": 0, "y": 0, "w": 100, "h": 50 }"#;

#[test]
fn notes_without_id_are_indexed_and_titles_come_from_the_body() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/sub/x.md", "# Competitor scan\n\nPrices");
  scan(&f.vault, &index).unwrap();
  let row: (Option<String>, String, String) = index
    .db
    .query_row("SELECT id, title, excerpt FROM notes WHERE path = 'notes/sub/x.md'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
    .unwrap();
  assert_eq!(row, (None, "Competitor scan".into(), "Prices".into()));
  let hits: i64 = index.db.query_row("SELECT count(*) FROM notes_fts WHERE notes_fts MATCH 'prices'", [], |r| r.get(0)).unwrap();
  assert_eq!(hits, 1);
}

#[test]
fn a_new_note_becomes_an_unplaced_note_and_keeps_its_file_as_is() {
  let f = Fixture::new();
  let index = f.index();
  put_card(&f, "C1", None, 0.0, 0.0);
  scan(&f.vault, &index).unwrap();
  f.write("notes/new.md", "Fresh idea");
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 0 });
  let mut stmt = index.db.prepare("SELECT title FROM notes WHERE id IS NULL OR id NOT IN (SELECT note FROM cards WHERE note IS NOT NULL)").unwrap();
  let unplaced: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
  assert_eq!(unplaced, ["Fresh idea"]);
  assert_eq!(f.read("notes/new.md"), "Fresh idea", "no ID is written just because the app saw the file");
}

#[test]
fn a_renamed_note_keeps_its_id_and_its_card() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha");
  f.write(".canvas/cards/C.json", CARD_ON_N1);
  scan(&f.vault, &index).unwrap();
  fs::rename(f.dir.path().join("notes/a.md"), f.dir.path().join("notes/Alpha.md")).unwrap();
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 1 });
  assert_eq!(index.note_path("N1").unwrap().as_deref(), Some("notes/Alpha.md"));
  assert_eq!(f.read(".canvas/cards/C.json"), CARD_ON_N1);
  let cards = index.viewport(WORLD, 0.0, None).unwrap().cards;
  assert_eq!((cards[0].title.as_deref(), cards[0].resolved), (Some("Alpha"), true));
}

#[test]
fn moved_note_keeps_its_id() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha");
  scan(&f.vault, &index).unwrap();
  fs::create_dir(f.dir.path().join("notes/moved")).unwrap();
  fs::rename(f.dir.path().join("notes/a.md"), f.dir.path().join("notes/moved/a.md")).unwrap();
  scan(&f.vault, &index).unwrap();
  assert_eq!(index.note_path("N1").unwrap().as_deref(), Some("notes/moved/a.md"));
  assert_eq!(f.read("notes/moved/a.md"), "---\nid: N1\n---\nAlpha");
}

#[test]
fn a_deleted_note_leaves_its_card_unresolved() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha");
  f.write(".canvas/cards/C.json", CARD_ON_N1);
  scan(&f.vault, &index).unwrap();
  fs::remove_file(f.dir.path().join("notes/a.md")).unwrap();
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 0, removed: 1 });
  let cards = index.viewport(WORLD, 0.0, None).unwrap().cards;
  assert_eq!((cards[0].note.as_deref(), cards[0].resolved), (Some("N1"), false));
  assert_eq!(f.read(".canvas/cards/C.json"), CARD_ON_N1);
}

#[test]
fn duplicate_id_goes_to_the_newer_file() {
  let f = Fixture::new();
  let index: Index = f.index();
  f.write("notes/original.md", "---\nid: N1\n---\nOriginal");
  f.write("notes/copy.md", "---\nid: N1\n---\nOriginal");
  set_time(&f, "notes/original.md", hour_ago());
  scan(&f.vault, &index).unwrap();
  assert_eq!(index.note_path("N1").unwrap().as_deref(), Some("notes/original.md"));
  let copy = NoteText::parse(&f.read("notes/copy.md"));
  assert!(copy.id().is_some_and(|id| id != "N1"));
  assert_eq!(index.note_path(&copy.id().unwrap()).unwrap().as_deref(), Some("notes/copy.md"));
}

#[test]
fn a_copy_made_while_the_app_was_closed_gets_a_fresh_id() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha");
  f.write(".canvas/cards/C.json", CARD_ON_N1);
  set_time(&f, "notes/a.md", hour_ago());
  scan(&f.vault, &index).unwrap();
  fs::copy(f.dir.path().join("notes/a.md"), f.dir.path().join("notes/a copy.md")).unwrap();
  scan(&f.vault, &index).unwrap();
  assert_eq!(f.read("notes/a.md"), "---\nid: N1\n---\nAlpha");
  let copy = NoteText::parse(&f.read("notes/a copy.md")).id().unwrap();
  assert_ne!(copy, "N1");
  assert_eq!(index.note_path(&copy).unwrap().as_deref(), Some("notes/a copy.md"));
  assert!(index.viewport(WORLD, 0.0, None).unwrap().cards[0].resolved);
}

#[test]
fn an_id_another_file_gave_up_while_the_app_was_closed_is_no_duplicate() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/b.md", "---\nid: N1\n---\nBeta");
  scan(&f.vault, &index).unwrap();
  // Another device gave b.md a fresh ID and synced a.md, which kept N1. a.md is read first.
  f.write("notes/b.md", "---\nid: N2\n---\nBeta");
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha");
  scan(&f.vault, &index).unwrap();
  assert_eq!(f.read("notes/a.md"), "---\nid: N1\n---\nAlpha");
  assert_eq!(f.read("notes/b.md"), "---\nid: N2\n---\nBeta");
  assert_eq!(index.note_path("N1").unwrap().as_deref(), Some("notes/a.md"));
  assert_eq!(index.note_path("N2").unwrap().as_deref(), Some("notes/b.md"));
}
