//! Vaults opened on this device, most recent first. Kept in the app-data folder, never synced.

use crate::error::{msg, Result};
use crate::fsx::atomic_write;
use crate::vault::Vault;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const FILE: &str = "vaults.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VaultEntry {
  pub id: String,
  pub name: String,
  pub path: String,
}

impl VaultEntry {
  pub fn of(vault: &Vault) -> VaultEntry {
    VaultEntry { id: vault.id.clone(), name: vault.name(), path: vault.root.display().to_string() }
  }
}

pub fn list(data_dir: &Path) -> Result<Vec<VaultEntry>> {
  let path = data_dir.join(FILE);
  if !path.exists() {
    return Ok(Vec::new());
  }
  Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn find(data_dir: &Path, id: &str) -> Result<VaultEntry> {
  match list(data_dir)?.into_iter().find(|v| v.id == id) {
    Some(entry) => Ok(entry),
    None => msg("unknown vault"),
  }
}

/// Moves the vault to the top of the list.
pub fn touch(data_dir: &Path, entry: &VaultEntry) -> Result<()> {
  let mut vaults = list(data_dir)?;
  vaults.retain(|v| v.id != entry.id);
  vaults.insert(0, entry.clone());
  atomic_write(&data_dir.join(FILE), &serde_json::to_vec_pretty(&vaults)?)
}
