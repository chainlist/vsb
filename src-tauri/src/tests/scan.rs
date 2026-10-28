use super::{hour_ago, put_card, put_zone, set_time, Fixture, WORLD};
use crate::scan::{scan, Stats};
use std::fs;

#[test]
fn scan_reads_only_what_changed() {
  let f = Fixture::new();
  let index = f.index();
  f.write("notes/a.md", "---\nid: N1\n---\nAlpha\nfirst");
  f.write("notes/b.md", "Beta");
  put_card(&f, "C1", None, 0.0, 0.0);
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 3, removed: 0 });
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 0, removed: 0 });

  f.write("notes/b.md", "Beta, longer");
  fs::remove_file(f.dir.path().join(".canvas/cards/C1.json")).unwrap();
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 1 });
  assert!(index.viewport(WORLD, 0.0, None).unwrap().cards.is_empty());
}

#[test]
fn a_file_is_read_again_when_its_time_or_size_differs_even_if_older() {
  let f = Fixture::new();
  let index = f.index();
  let title = || -> String { index.db.query_row("SELECT title FROM notes WHERE path = 'notes/a.md'", [], |r| r.get(0)).unwrap() };
  f.write("notes/a.md", "Alpha");
  scan(&f.vault, &index).unwrap();
  // Same size, older time: a synced or restored file.
  f.write("notes/a.md", "Gamma");
  set_time(&f, "notes/a.md", hour_ago());
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 0 });
  assert_eq!(title(), "Gamma");
  // Same time, other size.
  let time = fs::metadata(f.dir.path().join("notes/a.md")).unwrap().modified().unwrap();
  f.write("notes/a.md", "Delta, longer");
  set_time(&f, "notes/a.md", time);
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 0 });
  assert_eq!(title(), "Delta, longer");
}

#[test]
fn layout_files_added_or_changed_outside_are_read() {
  let f = Fixture::new();
  let index = f.index();
  put_zone(&f, "Z", None, 0.0, 0.0, 1000.0, 1000.0);
  put_card(&f, "C1", Some("Z"), 10.0, 10.0);
  put_card(&f, "C2", None, 2000.0, 0.0);
  f.write(".canvas/edges/E1.json", r#"{ "from": "C1", "to": "C2" }"#);
  scan(&f.vault, &index).unwrap();

  put_zone(&f, "Z", None, 500.0, 0.0, 1000.0, 1000.0);
  set_time(&f, ".canvas/zones/Z.json", hour_ago());
  put_card(&f, "C2", None, 3000.0, 0.0);
  put_card(&f, "C3", None, 0.0, 2000.0);
  f.write(".canvas/edges/E1.json", r#"{ "from": "C1", "to": "C2", "label": "needs" }"#);
  f.write(".canvas/edges/E2.json", r#"{ "from": "C2", "to": "C3" }"#);
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 5, removed: 0 });

  let view = index.viewport(WORLD, 0.0, None).unwrap();
  let mut cards: Vec<_> = view.cards.iter().map(|c| (c.id.as_str(), c.x, c.y)).collect();
  cards.sort_by_key(|c| c.0);
  assert_eq!(cards, [("C1", 510.0, 10.0), ("C2", 3000.0, 0.0), ("C3", 0.0, 2000.0)]);
  let mut edges: Vec<_> = view.edges.iter().map(|e| (e.id.as_str(), e.label.as_deref(), e.ends[0].x)).collect();
  edges.sort_by_key(|e| e.0);
  assert_eq!(edges, [("E1", Some("needs"), 510.0), ("E2", None, 3000.0)]);
}

#[test]
fn layout_files_deleted_outside_are_dropped() {
  let f = Fixture::new();
  let index = f.index();
  put_zone(&f, "Z", None, 1000.0, 0.0, 1000.0, 1000.0);
  put_card(&f, "C1", Some("Z"), 10.0, 10.0);
  put_card(&f, "C2", None, 0.0, 0.0);
  f.write(".canvas/edges/E.json", r#"{ "from": "C1", "to": "C2" }"#);
  scan(&f.vault, &index).unwrap();
  for rel in [".canvas/zones/Z.json", ".canvas/cards/C2.json", ".canvas/edges/E.json"] {
    fs::remove_file(f.dir.path().join(rel)).unwrap();
  }
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 0, removed: 3 });
  let view = index.viewport(WORLD, 0.0, None).unwrap();
  assert!(view.zones.is_empty() && view.edges.is_empty());
  // A card whose zone is gone sits on the canvas.
  assert_eq!(view.cards.iter().map(|c| (c.id.as_str(), c.x)).collect::<Vec<_>>(), [("C1", 10.0)]);
}

#[test]
fn broken_item_file_is_skipped_not_fatal() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/cards/BAD.json", "{ half a fil");
  put_card(&f, "OK", None, 0.0, 0.0);
  assert_eq!(scan(&f.vault, &index).unwrap(), Stats { read: 1, removed: 0 });
}
