//! A vault folder: `notes/` for the user's Markdown, `.canvas/` for the layout.

use crate::error::{msg, Result};
use crate::fsx::atomic_write;
use crate::items::{is_default, Arrow, EdgeStyle, Shape, Stroke};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Version of the file format written by this build.
pub const FORMAT: u32 = 1;

#[derive(Serialize, Deserialize)]
struct VaultFile {
  format: u32,
  id: String,
  /// The theme the app is drawn in for this vault; left out for the default.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  theme: Option<String>,
  /// Whether moved and resized cards and zones land on the grid; left out while on, the default.
  #[serde(default = "on", skip_serializing_if = "is_on")]
  snap: bool,
  /// The style every edge the app creates gets; left out at the default, each part as in an edge file.
  #[serde(default, rename = "newEdges", skip_serializing_if = "is_default")]
  new_edges: NewEdges,
}

/// The style for new edges, as `vault.json` writes it.
#[derive(Serialize, Deserialize, Default, PartialEq)]
struct NewEdges {
  #[serde(default, skip_serializing_if = "is_default")]
  shape: Shape,
  #[serde(default, skip_serializing_if = "is_default")]
  arrow: Arrow,
  #[serde(default, skip_serializing_if = "is_default")]
  stroke: Stroke,
}

fn on() -> bool {
  true
}

fn is_on(b: &bool) -> bool {
  *b
}

pub struct Vault {
  pub root: PathBuf,
  pub id: String,
}

fn vault_file(root: &Path) -> PathBuf {
  root.join(".canvas").join("vault.json")
}

fn read_vault_file(root: &Path) -> Result<VaultFile> {
  Ok(serde_json::from_slice(&fs::read(vault_file(root))?)?)
}

impl Vault {
  /// Opens an existing vault: `root` must hold `.canvas/vault.json`.
  pub fn open(root: &Path) -> Result<Vault> {
    if !vault_file(root).is_file() {
      return msg(format!("no vault in {}", root.display()));
    }
    let v = read_vault_file(root)?;
    if v.format > FORMAT {
      return msg("this vault was written by a newer version of the app");
    }
    Ok(Vault { root: root.to_path_buf(), id: v.id })
  }

  /// Opens the vault at `root`, first making the folder a vault if it is not one yet.
  pub fn open_or_init(root: &Path) -> Result<Vault> {
    let file = vault_file(root);
    if !file.exists() {
      let v = VaultFile { format: FORMAT, id: crate::new_id(), theme: None, snap: true, new_edges: NewEdges::default() };
      atomic_write(&file, &serde_json::to_vec_pretty(&v)?)?;
    }
    fs::create_dir_all(root.join("notes"))?;
    Vault::open(root)
  }

  /// The theme named in `vault.json`, or None for the default.
  pub fn theme(&self) -> Result<Option<String>> {
    Ok(read_vault_file(&self.root)?.theme)
  }

  /// Names the theme in `vault.json`, or leaves it out for the default. The file is read again
  /// first, so a version synced in since the vault opened only gets its theme changed.
  pub fn set_theme(&self, theme: Option<String>) -> Result<()> {
    let mut v = read_vault_file(&self.root)?;
    v.theme = theme;
    atomic_write(&vault_file(&self.root), &serde_json::to_vec_pretty(&v)?)
  }

  /// Whether `vault.json` has moved and resized items snap to the grid: on unless it says otherwise.
  pub fn snap(&self) -> Result<bool> {
    Ok(read_vault_file(&self.root)?.snap)
  }

  /// Turns snapping off in `vault.json`, or on again by leaving it out. Read again first, as for
  /// the theme.
  pub fn set_snap(&self, snap: bool) -> Result<()> {
    let mut v = read_vault_file(&self.root)?;
    v.snap = snap;
    atomic_write(&vault_file(&self.root), &serde_json::to_vec_pretty(&v)?)
  }

  /// The style `vault.json` gives every edge the app creates: the default unless it says otherwise.
  pub fn edge_style(&self) -> Result<EdgeStyle> {
    let NewEdges { shape, arrow, stroke } = read_vault_file(&self.root)?.new_edges;
    Ok(EdgeStyle { shape, arrow, stroke })
  }

  /// Sets the style for new edges in `vault.json`, which leaves out what is at the default. Read
  /// again first, as for the theme.
  pub fn set_edge_style(&self, style: EdgeStyle) -> Result<()> {
    let mut v = read_vault_file(&self.root)?;
    v.new_edges = NewEdges { shape: style.shape, arrow: style.arrow, stroke: style.stroke };
    atomic_write(&vault_file(&self.root), &serde_json::to_vec_pretty(&v)?)
  }

  pub fn name(&self) -> String {
    self.root.file_name().map_or_else(|| self.root.display().to_string(), |n| n.to_string_lossy().into_owned())
  }

  pub fn notes_dir(&self) -> PathBuf {
    self.root.join("notes")
  }

  pub fn canvas_dir(&self) -> PathBuf {
    self.root.join(".canvas")
  }

  /// Vault-relative path with `/` separators, as stored in the index.
  pub fn rel(&self, path: &Path) -> String {
    let rel = path.strip_prefix(&self.root).unwrap_or(path);
    rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/")
  }

  pub fn abs(&self, rel: &str) -> PathBuf {
    self.root.join(rel)
  }
}
