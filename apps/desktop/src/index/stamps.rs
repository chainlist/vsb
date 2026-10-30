//! The modified time and size the index took of each file when the app last read or wrote it.
//! The scan skips files that still match; every write first checks that its file still does.

use super::rows::tables;
use super::Index;
use crate::error::Result;
use crate::fsx::Stamp;
use crate::items::Kind;
use rusqlite::OptionalExtension;
use std::collections::HashMap;

impl Index {
  /// Stamps of every indexed note, by path.
  pub fn note_stamps(&self) -> Result<HashMap<String, Stamp>> {
    self.stamps("SELECT path, mtime, size FROM notes")
  }

  /// Stamps of every indexed zone, card or edge, by ID.
  pub fn item_stamps(&self, kind: Kind) -> Result<HashMap<String, Stamp>> {
    self.stamps(&format!("SELECT id, mtime, size FROM {}", tables(kind).0))
  }

  pub fn note_stamp(&self, path: &str) -> Result<Option<Stamp>> {
    self.stamp("SELECT mtime, size FROM notes WHERE path = ?1", path)
  }

  pub fn item_stamp(&self, kind: Kind, id: &str) -> Result<Option<Stamp>> {
    self.stamp(&format!("SELECT mtime, size FROM {} WHERE id = ?1", tables(kind).0), id)
  }

  fn stamps(&self, sql: &str) -> Result<HashMap<String, Stamp>> {
    let mut stmt = self.db.prepare(sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, Stamp { mtime: r.get(1)?, size: r.get(2)? })))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
  }

  fn stamp(&self, sql: &str, key: &str) -> Result<Option<Stamp>> {
    Ok(self.db.query_row(sql, [key], |r| Ok(Stamp { mtime: r.get(0)?, size: r.get(1)? })).optional()?)
  }
}
