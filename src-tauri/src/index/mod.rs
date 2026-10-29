//! The SQLite index: a cache in the app-data folder, rebuilt from the vault files at will.

mod batch_scope;
mod bounds;
mod bundles;
mod clusters;
mod drawings;
mod notes;
mod previews;
mod rows;
mod stamps;
mod ui_state;
mod viewport;
mod views;
mod zone_list;
mod zone_nodes;
mod zones;

pub use batch_scope::{BatchScope, ScopeEdge};
pub use bounds::Scope;
pub use notes::Entry;
pub use rows::NoteRow;
pub use views::Viewport;
pub use zone_list::ZoneRow;
pub use zone_nodes::ZoneNodes;

use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// A world rectangle.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
  pub min_x: f64,
  pub min_y: f64,
  pub max_x: f64,
  pub max_y: f64,
}

impl Rect {
  /// The rectangle at (x, y) of size w by h; a point when both are 0.
  pub fn of(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect { min_x: x, min_y: y, max_x: x + w, max_y: y + h }
  }

  /// The smallest rectangle covering both.
  pub fn union(self, o: Rect) -> Rect {
    Rect { min_x: self.min_x.min(o.min_x), min_y: self.min_y.min(o.min_y), max_x: self.max_x.max(o.max_x), max_y: self.max_y.max(o.max_y) }
  }
}

/// Bump on any schema change: a mismatch drops the index and rebuilds it.
pub(crate) const VERSION: i32 = 6;
const SCHEMA: &str = include_str!("schema.sql");

pub struct Index {
  pub(crate) db: Connection,
}

impl Index {
  pub fn open(path: &Path) -> Result<Index> {
    if let Some(dir) = path.parent() {
      fs::create_dir_all(dir)?;
    }
    let mut db = Connection::open(path)?;
    let version: i32 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != VERSION {
      drop(db);
      for suffix in ["", "-wal", "-shm"] {
        let mut file = path.as_os_str().to_owned();
        file.push(suffix);
        if Path::new(&file).exists() {
          fs::remove_file(&file)?;
        }
      }
      db = Connection::open(path)?;
      db.execute_batch(SCHEMA)?;
      db.pragma_update(None, "user_version", VERSION)?;
    }
    db.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
    Ok(Index { db })
  }

  /// Runs `f` in one transaction.
  pub fn batch<T>(&self, f: impl FnOnce() -> Result<T>) -> Result<T> {
    let tx = self.db.unchecked_transaction()?;
    let out = f()?;
    tx.commit()?;
    Ok(out)
  }
}
