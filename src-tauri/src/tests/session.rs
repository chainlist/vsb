use super::{card_file, names, open, Fixture, WORLD};
use crate::note::NoteText;

#[test]
fn index_lives_in_the_data_folder_under_the_vault_id() {
  let f = Fixture::new();
  open(&f);
  assert!(f.data.path().join(&f.vault.id).join("index.sqlite").exists());
  assert!(!f.dir.path().join(".canvas").join("index.sqlite").exists());
}

#[test]
fn placing_a_card_saves_an_empty_card() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(10.0, 20.0, 200.0, 80.0).unwrap();
  let card = card_file(&f, &id);
  assert_eq!((card.note, card.zone, card.x, card.y), (None, None, 10.0, 20.0));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!(view.cards.len(), 1);
}

#[test]
fn a_card_placed_in_a_zone_joins_it_with_relative_coordinates() {
  let f = Fixture::new();
  f.write(".canvas/zones/Z.json", r#"{ "name": "Z", "parent": null, "x": 500, "y": 500, "w": 400, "h": 400 }"#);
  let s = open(&f);
  let id = s.create_card(600.0, 650.0, 100.0, 50.0).unwrap();
  let card = card_file(&f, &id);
  assert_eq!((card.zone.as_deref(), card.x, card.y), (Some("Z"), 100.0, 150.0));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].x, view.cards[0].y), (600.0, 650.0));
}

#[test]
fn first_save_writes_the_note_then_points_the_card_at_it() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Competitor scan\n\nPrices").unwrap();
  assert_eq!(card_file(&f, &card).note.as_deref(), Some(note.as_str()));
  let text = NoteText::parse(&f.read("notes/Competitor scan.md"));
  assert_eq!((text.id(), text.body.as_str()), (Some(note.clone()), "Competitor scan\n\nPrices"));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!((view.cards[0].title.as_deref(), view.cards[0].resolved), (Some("Competitor scan"), true));
  assert!(s.create_note_for_card(&card, "again").is_err());
}

#[test]
fn a_title_clash_adds_a_number() {
  let f = Fixture::new();
  f.write("notes/Idea.md", "Idea");
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  s.create_note_for_card(&card, "Idea").unwrap();
  assert_eq!(names(&f.vault.notes_dir()), ["Idea 2.md", "Idea.md"]);
}

#[test]
fn saving_keeps_frontmatter_keys_the_app_did_not_write() {
  let f = Fixture::new();
  f.write("notes/a.md", "---\nid: N1\ntags: [x]\n---\nOld");
  let s = open(&f);
  assert_eq!(s.read_note("N1").unwrap(), "Old");
  s.save_note("N1", "New\nbody").unwrap();
  assert_eq!(f.read("notes/a.md"), "---\nid: N1\ntags: [x]\n---\nNew\nbody");
}

#[test]
fn discarding_empties_the_card_then_deletes_the_file() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "x").unwrap();
  assert!(s.discard_note(&card, &note).is_err(), "a note with content is never discarded");
  s.save_note(&note, "  \n").unwrap();
  s.discard_note(&card, &note).unwrap();
  assert_eq!(card_file(&f, &card).note, None);
  assert!(names(&f.vault.notes_dir()).is_empty());
  assert!(s.index.note_path(&note).unwrap().is_none());
}

#[test]
fn renaming_follows_the_title_and_keeps_the_id() {
  let f = Fixture::new();
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Draft").unwrap();
  s.save_note(&note, "Final plan\nmore").unwrap();
  assert_eq!(names(&f.vault.notes_dir()), ["Draft.md"], "no rename on save");
  s.rename_note(&note).unwrap();
  assert_eq!(names(&f.vault.notes_dir()), ["Final plan.md"]);
  assert_eq!(s.index.note_path(&note).unwrap().as_deref(), Some("notes/Final plan.md"));
  s.rename_note(&note).unwrap();
  assert_eq!(names(&f.vault.notes_dir()), ["Final plan.md"]);
}

#[test]
fn renaming_keeps_a_clash_name_and_handles_case_changes() {
  let f = Fixture::new();
  f.write("notes/Idea.md", "Idea");
  f.write("notes/Idea 2.md", "---\nid: N2\n---\nIdea");
  f.write("notes/plan.md", "---\nid: N3\n---\nPlan");
  let s = open(&f);
  s.rename_note("N2").unwrap();
  s.rename_note("N3").unwrap();
  assert_eq!(names(&f.vault.notes_dir()), ["Idea 2.md", "Idea.md", "Plan.md"]);
}
