//! An open vault with its index, and the edits that write both. Each thing is written before
//! anything that points at it: notes, then zones, then cards, then edges.

use crate::error::{msg, Result};
use crate::fsx::{self, atomic_write};
use crate::index::Index;
use crate::items::{self, Card, Item};
use crate::note::{self, NoteText};
use crate::scan;
use crate::states::ItemState;
use crate::vault::Vault;
use std::fs;
use std::path::{Path, PathBuf};

pub struct Session {
  pub vault: Vault,
  pub index: Index,
}

impl Session {
  /// Opens the vault at `root`, with its index in `data_dir/<vault-id>/`, and scans it.
  pub fn open(root: &Path, data_dir: &Path) -> Result<Session> {
    let vault = Vault::open(root)?;
    let index = Index::open(&data_dir.join(&vault.id).join("index.sqlite"))?;
    scan::scan(&vault, &index)?;
    Ok(Session { vault, index })
  }

  /// The note's body, without its frontmatter. If the file changed outside the app, the index
  /// takes it first, so the next save is checked against the version the editor shows.
  pub fn read_note(&self, id: &str) -> Result<String> {
    let path = self.note_file(id)?;
    self.changed_outside(&path)?;
    Ok(NoteText::read(&path)?.body)
  }

  /// First save with content: writes the note with a new ULID, then points the card at it.
  pub fn create_note_for_card(&self, card_id: &str, body: &str) -> Result<String> {
    let mut card: Card = self.read(card_id)?;
    if card.note.is_some() {
      return msg("this card already has a note");
    }
    let id = self.new_note(body)?;
    card.note = Some(id.clone());
    self.apply(vec![ItemState::of(card_id, &card)?])?;
    Ok(id)
  }

  /// Writes a new note with a new ULID, named after its title, and returns the ID.
  pub(crate) fn new_note(&self, body: &str) -> Result<String> {
    let id = crate::new_id();
    let mut note = NoteText { front: String::new(), body: body.to_string() };
    note.set_id(&id);
    let path = note::free_path(&self.vault.notes_dir(), &note::file_stem(&note::title(body)), None);
    self.write_note(&path, &note)?;
    Ok(id)
  }

  /// Replaces the note's body, keeping its frontmatter, and returns true. A file changed outside
  /// the app is never overwritten: it stays as it is, the card shows it, and the body goes to a
  /// new `<title> (conflict).md` beside it, with no ID, so it lands in the Unplaced tray. Then
  /// this returns false.
  pub fn save_note(&self, id: &str, body: &str) -> Result<bool> {
    let path = self.note_file(id)?;
    if self.changed_outside(&path)? {
      if !body.trim().is_empty() {
        let stem = format!("{} (conflict)", note::file_stem(&note::title(body)));
        let conflict = NoteText { front: String::new(), body: body.to_string() };
        self.write_note(&note::free_path(&self.folder(&path), &stem, None), &conflict)?;
      }
      return Ok(false);
    }
    let mut note = NoteText::read(&path)?;
    note.body = body.to_string();
    self.write_note(&path, &note)?;
    Ok(true)
  }

  /// Drops a note created during this edit session and left empty: the card goes back to
  /// empty first, then the file is deleted. A note with content is never deleted here, nor one
  /// changed outside the app: that one stays, and the card shows it.
  pub fn discard_note(&self, card_id: &str, id: &str) -> Result<()> {
    let path = self.note_file(id)?;
    if self.changed_outside(&path)? {
      return Ok(());
    }
    if !NoteText::read(&path)?.body.trim().is_empty() {
      return msg("the note is not empty");
    }
    let mut card: Card = self.read(card_id)?;
    if card.note.as_deref() == Some(id) {
      card.note = None;
      self.apply(vec![ItemState::of(card_id, &card)?])?;
    }
    fs::remove_file(&path)?;
    self.index.remove_note(&self.vault.rel(&path))
  }

  /// The ULID of the note at vault path `rel`, written into its frontmatter first if it has none:
  /// a note gets its ID with its first card, never just because the app saw it.
  pub(crate) fn note_id(&self, rel: &str) -> Result<String> {
    let path = self.vault.abs(rel);
    // Only a note the index knows, never any path, read as it is on disk now.
    if self.index.note_stamp(rel)?.is_none() || (self.changed_outside(&path)? && !path.exists()) {
      return msg("note not found");
    }
    let mut note = NoteText::read(&path)?;
    if let Some(id) = note.id() {
      return Ok(id);
    }
    let id = crate::new_id();
    note.set_id(&id);
    self.write_note(&path, &note)?;
    Ok(id)
  }

  /// Renames the note's file after its title, if the title changed.
  pub fn rename_note(&self, id: &str) -> Result<()> {
    let path = self.note_file(id)?;
    let stem = note::file_stem(&note::title(&NoteText::read(&path)?.body));
    let current = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    if note::stem_fits(&current, &stem) {
      return Ok(());
    }
    let new = note::free_path(&self.folder(&path), &stem, Some(&path));
    fs::rename(&path, &new)?;
    self.index.remove_note(&self.vault.rel(&path))?;
    scan::index_note(&self.vault, &self.index, &new)
  }

  fn note_file(&self, id: &str) -> Result<PathBuf> {
    match self.index.note_path(id)? {
      Some(rel) => Ok(self.vault.abs(&rel)),
      None => msg("note not found"),
    }
  }

  fn folder(&self, path: &Path) -> PathBuf {
    path.parent().map_or_else(|| self.vault.notes_dir(), Path::to_path_buf)
  }

  /// Checks a note's file against the index. When it changed outside the app, the index takes
  /// the version on disk (or drops the note if the file is gone) and this returns true.
  fn changed_outside(&self, path: &Path) -> Result<bool> {
    let rel = self.vault.rel(path);
    if !fsx::changed(path, self.index.note_stamp(&rel)?)? {
      return Ok(false);
    }
    if path.exists() {
      scan::index_note(&self.vault, &self.index, path)?;
    } else {
      self.index.remove_note(&rel)?;
    }
    Ok(true)
  }

  /// Writes a note and indexes it, recording the stamp the write left.
  fn write_note(&self, path: &Path, note: &NoteText) -> Result<()> {
    atomic_write(path, note.text().as_bytes())?;
    scan::index_note(&self.vault, &self.index, path)
  }

  pub(crate) fn read<T: Item>(&self, id: &str) -> Result<T> {
    items::read(&items::path(&self.vault, T::KIND, id))
  }
}
