//! Bringing the index up to date with the vault files. At startup, only files whose
//! modified time or size changed are read again; a cold start (empty index) reads everything.

use crate::error::Result;
use crate::fsx::{self, atomic_write};
use crate::index::{Index, NoteRow, Scope};
use crate::items::{self, Card, Drawing, Edge, Kind, Zone};
use crate::note::{self, NoteText};
use crate::vault::Vault;
use std::path::Path;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Stats {
  pub read: usize,
  pub removed: usize,
}

pub fn scan(vault: &Vault, index: &Index) -> Result<Stats> {
  index.batch(|| {
    let mut stats = Stats::default();
    for kind in [Kind::Zone, Kind::Card, Kind::Edge, Kind::Drawing] {
      scan_items(vault, index, kind, &mut stats)?;
    }
    let layout_changed = stats != Stats::default();
    scan_notes(vault, index, &mut stats)?;
    if layout_changed {
      index.refresh_bounds(Scope::All)?;
    }
    Ok(stats)
  })
}

fn scan_items(vault: &Vault, index: &Index, kind: Kind, stats: &mut Stats) -> Result<()> {
  let mut gone = index.item_stamps(kind)?;
  for path in fsx::files(&items::dir(vault, kind), "json")? {
    let Some(id) = path.file_stem().map(|s| s.to_string_lossy().into_owned()) else { continue };
    let stamp = fsx::stamp(&path)?;
    if gone.remove(&id) == Some(stamp) {
      continue;
    }
    let put = match kind {
      Kind::Zone => items::read::<Zone>(&path).and_then(|z| index.put_zone(&id, &z, stamp)),
      Kind::Card => items::read::<Card>(&path).and_then(|c| index.put_card(&id, &c, stamp)),
      Kind::Edge => items::read::<Edge>(&path).and_then(|e| index.put_edge(&id, &e, stamp)),
      Kind::Drawing => items::read::<Drawing>(&path).and_then(|d| index.put_drawing(&id, &d, stamp)),
    };
    // A broken file (half-synced, edited by hand) keeps its old row and is retried next time.
    match put {
      Ok(()) => stats.read += 1,
      Err(e) => log::warn!("skipped {}: {e}", path.display()),
    }
  }
  for id in gone.keys() {
    index.remove_item(kind, id)?;
    stats.removed += 1;
  }
  Ok(())
}

fn scan_notes(vault: &Vault, index: &Index, stats: &mut Stats) -> Result<()> {
  let mut gone = index.note_stamps()?;
  let mut changed = Vec::new();
  for path in fsx::files(&vault.notes_dir(), "md")? {
    if gone.remove(&vault.rel(&path)) != Some(fsx::stamp(&path)?) {
      changed.push(path);
    }
  }
  // Rows of deleted or moved files go first, so a moved file keeps its ID without clashing with itself.
  for rel in gone.keys() {
    index.remove_note(rel)?;
    stats.removed += 1;
  }
  for path in changed {
    match index_note(vault, index, &path) {
      Ok(()) => stats.read += 1,
      Err(e) => log::warn!("skipped {}: {e}", path.display()),
    }
  }
  Ok(())
}

/// Reads one note file into the index. When another file already has its ID
/// (a copy made outside the app), the newer of the two gets a fresh ID.
pub fn index_note(vault: &Vault, index: &Index, path: &Path) -> Result<()> {
  let note = NoteText::read(path)?;
  let rel = vault.rel(path);
  let id = note.id();
  if let Some(other) = id.as_deref().map(|id| index.note_path(id)).transpose()?.flatten().filter(|o| *o != rel) {
    let other_path = vault.abs(&other);
    if !other_path.exists() {
      index.remove_note(&other)?;
    } else if NoteText::read(&other_path)?.id() != id {
      // That row is out of date: the other file no longer has this ID.
      index_note(vault, index, &other_path)?;
    } else if fsx::born(path)? >= fsx::born(&other_path)? {
      give_fresh_id(path)?;
      return index_note(vault, index, path);
    } else {
      give_fresh_id(&other_path)?;
      index_note(vault, index, &other_path)?;
    }
  }
  index.put_note(&NoteRow {
    path: &rel,
    id: id.as_deref(),
    stamp: fsx::stamp(path)?,
    title: &note::title(&note.body),
    excerpt: &note::excerpt(&note.body),
    body: &note.body,
  })
}

fn give_fresh_id(path: &Path) -> Result<()> {
  let mut note = NoteText::read(path)?;
  note.set_id(&crate::new_id());
  atomic_write(path, note.text().as_bytes())
}
