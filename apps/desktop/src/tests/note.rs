use crate::note::{excerpt, file_stem, free_path, stem_fits, title, NoteText};
use std::fs;
use tempfile::TempDir;

#[test]
fn text_without_frontmatter_is_all_body() {
  let n = NoteText::parse("Idea\n---\nnot frontmatter\n");
  assert_eq!(n.front, "");
  assert_eq!(n.body, "Idea\n---\nnot frontmatter\n");
  assert_eq!(n.id(), None);
}

#[test]
fn frontmatter_is_split_and_id_read() {
  let n = NoteText::parse("---\r\ntags: [a]\r\nid: \"01ABC\"\r\n---\r\nTitle\r\n");
  assert_eq!(n.front, "---\r\ntags: [a]\r\nid: \"01ABC\"\r\n---\r\n");
  assert_eq!(n.body, "Title\r\n");
  assert_eq!(n.id().as_deref(), Some("01ABC"));
}

#[test]
fn unclosed_frontmatter_is_body() {
  let n = NoteText::parse("---\nid: X\nno end");
  assert_eq!(n.front, "");
}

#[test]
fn set_id_adds_a_block_when_there_is_none() {
  let mut n = NoteText::parse("Idea\n");
  n.set_id("01X");
  assert_eq!(n.text(), "---\nid: 01X\n---\nIdea\n");
}

#[test]
fn set_id_keeps_other_keys() {
  let mut n = NoteText::parse("---\ntags: [a, b]\nauthor: me\n---\nBody");
  n.set_id("01X");
  assert_eq!(n.text(), "---\nid: 01X\ntags: [a, b]\nauthor: me\n---\nBody");
  n.set_id("01Y");
  assert_eq!(n.text(), "---\nid: 01Y\ntags: [a, b]\nauthor: me\n---\nBody");
}

#[test]
fn set_id_keeps_crlf_line_endings() {
  let mut n = NoteText::parse("---\r\ntags: x\r\n---\r\nBody");
  n.set_id("01X");
  assert_eq!(n.front, "---\r\nid: 01X\r\ntags: x\r\n---\r\n");
}

#[test]
fn title_is_first_line_without_heading_marks() {
  assert_eq!(title("\n\n## Competitor scan \nmore"), "Competitor scan");
  assert_eq!(title(""), "");
}

#[test]
fn excerpt_is_what_follows_the_title() {
  assert_eq!(excerpt("Title\n\nFirst point\nSecond"), "First point\nSecond");
  assert_eq!(excerpt("Only a title"), "");
  assert_eq!(excerpt(&format!("T\n{}", "é".repeat(1000))).chars().count(), 400);
}

#[test]
fn file_stem_drops_characters_invalid_on_windows() {
  assert_eq!(file_stem("What? A/B: \"test\" <1>|*"), "What AB test 1");
  assert_eq!(file_stem("Trailing dots..."), "Trailing dots");
  assert_eq!(file_stem("???"), "Untitled");
  assert_eq!(file_stem("con"), "con_");
  assert_eq!(file_stem("LPT1.notes"), "LPT1.notes_");
  assert_eq!(file_stem(&"x".repeat(200)).len(), 80);
}

#[test]
fn stem_fits_title_or_clash_name() {
  assert!(stem_fits("Idea", "Idea"));
  assert!(stem_fits("Idea 2", "Idea"));
  assert!(!stem_fits("Idea 1", "Idea"));
  assert!(!stem_fits("Ideas", "Idea"));
  assert!(!stem_fits("idea", "Idea"));
}

#[test]
fn free_path_numbers_clashes() {
  let dir = TempDir::new().unwrap();
  assert_eq!(free_path(dir.path(), "Idea", None), dir.path().join("Idea.md"));
  fs::write(dir.path().join("Idea.md"), "").unwrap();
  fs::write(dir.path().join("Idea 2.md"), "").unwrap();
  assert_eq!(free_path(dir.path(), "Idea", None), dir.path().join("Idea 3.md"));
}

#[test]
fn free_path_lets_a_note_keep_its_own_name() {
  let dir = TempDir::new().unwrap();
  let own = dir.path().join("idea.md");
  fs::write(&own, "").unwrap();
  let found = free_path(dir.path(), "Idea", Some(&own));
  // On a case-insensitive file system "Idea.md" is the note itself; elsewhere it is free.
  assert_eq!(found, dir.path().join("Idea.md"));
}
