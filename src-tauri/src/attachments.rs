//! Attachments: files of the vault a card shows in place of a note, under `attachments/`, a folder
//! per kind of file. Images for now, in `attachments/images/`. The app writes them as they are
//! dropped or pasted on the canvas and reads them back for the cards showing them; deleting a card
//! leaves its file, as it leaves a note.

use crate::error::{msg, Result};
use crate::fsx::atomic_write;
use crate::note;
use crate::session::Session;
use std::fs;
use std::path::{Component, Path};

/// The folder every attachment lives under, in the vault's root.
const DIR: &str = "attachments";
/// The extensions of the images a card shows.
const IMAGES: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];

/// Refuses a path that is not a vault path under `attachments/`: an absolute one, or one climbing
/// out with `..`.
pub fn check(path: &str) -> Result<()> {
  let mut parts = Path::new(path).components();
  let inside = parts.next() == Some(Component::Normal(DIR.as_ref())) && parts.all(|c| matches!(c, Component::Normal(_)));
  if !inside {
    return msg("not an attachment of the vault");
  }
  Ok(())
}

impl Session {
  /// Writes an image under `attachments/images/`, named after `name`, as a note is after its title:
  /// characters invalid on Windows left out, a clash numbered. Returns its vault path.
  pub fn write_image(&self, name: &str, bytes: &[u8]) -> Result<String> {
    // Split by hand: as a path, `a:b.png` would be a drive on Windows.
    let name = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let (stem, ext) = name.rsplit_once('.').map(|(s, e)| (s, e.to_lowercase())).unwrap_or_default();
    if !IMAGES.contains(&ext.as_str()) {
      return msg("not an image");
    }
    let path = note::free_name(&self.vault.abs(DIR).join("images"), &note::file_stem(stem), &ext, None);
    atomic_write(&path, bytes)?;
    Ok(self.vault.rel(&path))
  }

  /// The bytes of an attachment, by its vault path.
  pub fn read_attachment(&self, path: &str) -> Result<Vec<u8>> {
    check(path)?;
    Ok(fs::read(self.vault.abs(path))?)
  }
}
