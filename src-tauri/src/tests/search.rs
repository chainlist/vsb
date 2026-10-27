use super::{open, Fixture};
use crate::index::{Entry, Rect};
use crate::items::Kind;
use crate::session::Session;

/// What a search finds: zone names and note titles, in order, with whether each note is placed.
fn found(s: &Session, text: &str) -> Vec<(String, bool)> {
  let entries = s.index.search(text, 0, 50).unwrap();
  entries
    .into_iter()
    .map(|e| match e {
      Entry::Zone { name, .. } => (format!("zone {name}"), false),
      Entry::Note { title, card, .. } => (title, card.is_some()),
    })
    .collect()
}

fn titles(s: &Session, text: &str) -> Vec<String> {
  found(s, text).into_iter().map(|(t, _)| t).collect()
}

#[test]
fn search_matches_every_word_as_a_prefix_zones_first() {
  let f = Fixture::new();
  f.write("notes/a.md", "Competitor scan\n\nPrice tiers");
  f.write("notes/b.md", "Hiring plan\n\nTwo engineers");
  f.write("notes/c.md", "Notes sur l'École\n\nRentrée");
  f.write(".canvas/zones/Z.json", r#"{ "name": "Pricing strategy", "parent": null, "x": 0, "y": 0, "w": 500, "h": 500 }"#);
  let s = open(&f);
  assert_eq!(titles(&s, "pric"), ["zone Pricing strategy", "Competitor scan"]);
  assert_eq!(titles(&s, "PRICE tiers"), ["Competitor scan"]);
  assert_eq!(titles(&s, "tiers hiring"), Vec::<String>::new(), "every word must be there");
  assert_eq!(titles(&s, "ecole rentree"), ["Notes sur l'École"], "case and accents are ignored");
  for text in ["", "   ", "-- !!", "\"price", "price AND", "title:x", "^plan*"] {
    s.index.search(text, 0, 50).unwrap();
  }
  assert_eq!(s.index.search("plan", 0, 1).unwrap().len(), 1);
  assert!(s.index.search("plan", 1, 1).unwrap().is_empty());
}

#[test]
fn search_follows_saves_and_rescans_and_tells_placed_notes() {
  let f = Fixture::new();
  f.write("notes/loose.md", "Loose alpha");
  let s = open(&f);
  let card = s.create_card(0.0, 0.0, 200.0, 80.0).unwrap();
  let note = s.create_note_for_card(&card, "Draft\nalpha").unwrap();
  assert_eq!(found(&s, "alpha"), [("Loose alpha".to_string(), false), ("Draft".to_string(), true)]);
  s.save_note(&note, "Draft\nbeta").unwrap();
  assert_eq!(titles(&s, "alpha"), ["Loose alpha"]);
  assert_eq!(titles(&s, "beta"), ["Draft"]);
  drop(s);

  // Changed and deleted while the app was closed: the startup scan catches up.
  f.write("notes/Draft.md", &format!("---\nid: {note}\n---\nDraft\ngamma"));
  std::fs::remove_file(f.dir.path().join("notes/loose.md")).unwrap();
  let s = open(&f);
  assert_eq!(titles(&s, "gamma"), ["Draft"]);
  assert!(titles(&s, "beta").is_empty());
  assert!(titles(&s, "alpha").is_empty());
}

#[test]
fn search_follows_zone_names_through_edits_and_undo() {
  let f = Fixture::new();
  let s = open(&f);
  let zone = s.create_zone(0.0, 0.0, 400.0, 300.0).unwrap().id;
  s.rename_zone(&zone, "Pricing").unwrap();
  assert_eq!(titles(&s, "pricing"), ["zone Pricing"]);
  s.rename_zone(&zone, "Hiring").unwrap();
  assert!(titles(&s, "pricing").is_empty());
  let undo = s.delete_zones(std::slice::from_ref(&zone)).unwrap();
  assert!(titles(&s, "hiring").is_empty());
  s.apply(undo).unwrap();
  assert_eq!(titles(&s, "hiring"), ["zone Hiring"]);
}

#[test]
fn a_result_is_framed_by_its_box_in_the_world() {
  let f = Fixture::new();
  f.write(".canvas/zones/Z1.json", r#"{ "name": "Z1", "parent": null, "x": 1000, "y": 0, "w": 800, "h": 600 }"#);
  f.write(".canvas/zones/Z2.json", r#"{ "name": "Z2", "parent": "Z1", "x": 100, "y": 100, "w": 400, "h": 300 }"#);
  f.write(".canvas/cards/C.json", r#"{ "note": null, "zone": "Z2", "x": 10, "y": 20, "w": 100, "h": 50 }"#);
  let s = open(&f);
  assert_eq!(s.index.item_box(Kind::Card, "C").unwrap(), Some(Rect::of(1110.0, 120.0, 100.0, 50.0)));
  assert_eq!(s.index.item_box(Kind::Zone, "Z2").unwrap(), Some(Rect::of(1100.0, 100.0, 400.0, 300.0)));
  assert_eq!(s.index.item_box(Kind::Card, "NONE").unwrap(), None);
  assert_eq!(s.index.item_box(Kind::Zone, "NONE").unwrap(), None);
}
