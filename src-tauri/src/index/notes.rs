//! The lists beside the canvas: the unplaced notes, and search over notes and zone names. Each
//! query returns one page, so a list never holds every note.

use super::Index;
use crate::error::Result;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

/// One line of a list: a note, with its card when it has one, or a zone.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Entry {
  Note { path: String, title: String, excerpt: String, card: Option<String> },
  Zone { id: String, name: String },
}

/// What was typed, as an FTS5 query: every word must be there, each as the start of a word.
/// Quoting keeps FTS5 syntax (AND, *, ^, :) plain text; a run of marks alone is no word.
fn words(text: &str) -> String {
  let words = text.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric));
  words.map(|w| format!("\"{}\"*", w.replace('"', "\"\""))).collect::<Vec<_>>().join(" ")
}

impl Index {
  /// Notes with no card, most recently changed first: never placed, written outside the app, or
  /// whose cards were all deleted.
  pub fn unplaced(&self, offset: u32, limit: u32) -> Result<Vec<Entry>> {
    let mut stmt = self.db.prepare(
      "SELECT path, title, excerpt FROM notes n
       WHERE id IS NULL OR NOT EXISTS (SELECT 1 FROM cards WHERE note = n.id)
       ORDER BY mtime DESC, key LIMIT ?1 OFFSET ?2",
    )?;
    let rows = stmt.query_map(params![limit, offset], |r| {
      Ok(Entry::Note { path: r.get(0)?, title: r.get(1)?, excerpt: r.get(2)?, card: None })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }

  /// Zones whose name holds every word typed, then notes whose text does, best matches first.
  pub fn search(&self, text: &str, offset: u32, limit: u32) -> Result<Vec<Entry>> {
    let query = words(text);
    if query.is_empty() {
      return Ok(Vec::new());
    }
    let mut stmt = self.db.prepare(
      "SELECT 0 AS is_note, bm25(zones_fts) AS score, z.id, z.name, NULL, NULL
       FROM zones_fts JOIN zones z ON z.key = zones_fts.rowid WHERE zones_fts MATCH ?1
       UNION ALL
       SELECT 1, bm25(notes_fts), n.path, n.title, n.excerpt, (SELECT id FROM cards WHERE note = n.id LIMIT 1)
       FROM notes_fts JOIN notes n ON n.key = notes_fts.rowid WHERE notes_fts MATCH ?1
       ORDER BY is_note, score LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(params![query, limit, offset], |r| {
      Ok(match r.get(0)? {
        false => Entry::Zone { id: r.get(2)?, name: r.get(3)? },
        true => Entry::Note { path: r.get(2)?, title: r.get(3)?, excerpt: r.get(4)?, card: r.get(5)? },
      })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }

  /// The card showing a note. Until V3 a note has at most one.
  pub fn card_of_note(&self, id: &str) -> Result<Option<String>> {
    Ok(self.db.query_row("SELECT id FROM cards WHERE note = ?1 LIMIT 1", [id], |r| r.get(0)).optional()?)
  }
}
