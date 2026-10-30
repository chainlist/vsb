//! This device's state for a vault, such as which panels are open: kept in the index, which lives
//! on this device only, never in a synced file.

use super::Index;
use crate::error::Result;
use rusqlite::OptionalExtension;

impl Index {
  pub fn ui_state(&self, key: &str) -> Result<Option<String>> {
    Ok(self.db.query_row("SELECT v FROM ui_state WHERE k = ?1", [key], |r| r.get(0)).optional()?)
  }

  pub fn set_ui_state(&self, key: &str, value: &str) -> Result<()> {
    self.db.execute("INSERT INTO ui_state (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET v = excluded.v", [key, value])?;
    Ok(())
  }
}
