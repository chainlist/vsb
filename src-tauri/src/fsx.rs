//! File helpers shared by every vault write and by the scan.

use crate::error::{msg, Result};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Writes a temp file next to `path`, then renames it over `path`,
/// so a sync tool never uploads half a file.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
  let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
    return msg(format!("not a file path: {}", path.display()));
  };
  fs::create_dir_all(dir)?;
  let tmp = dir.join(format!(".{}.{}.tmp", name.to_string_lossy(), crate::new_id()));
  let mut file = fs::File::create(&tmp)?;
  file.write_all(bytes)?;
  file.sync_all()?;
  drop(file);
  fs::rename(&tmp, path).inspect_err(|_| {
    let _ = fs::remove_file(&tmp);
  })?;
  Ok(())
}

/// Modified time (ms) and size: what the scan compares to skip unchanged files.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamp {
  pub mtime: i64,
  pub size: i64,
}

pub fn stamp(path: &Path) -> Result<Stamp> {
  let meta = fs::metadata(path)?;
  Ok(Stamp { mtime: millis(meta.modified()?), size: meta.len() as i64 })
}

/// Whether a file changed outside the app: its stamp differs from `known`, the one the index
/// took when the app last read or wrote it, or the file appeared or vanished. Any difference
/// counts, not only a newer time: sync tools keep the time of the device that made the change.
pub fn changed(path: &Path, known: Option<Stamp>) -> Result<bool> {
  let now = if path.exists() { Some(stamp(path)?) } else { None };
  Ok(now != known)
}

/// When the file was created, or last modified where creation time is unknown.
pub fn born(path: &Path) -> Result<SystemTime> {
  let meta = fs::metadata(path)?;
  Ok(meta.created().or_else(|_| meta.modified())?)
}

fn millis(t: SystemTime) -> i64 {
  t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// Every file under `dir`, recursively, with extension `ext`. Hidden entries
/// (our temp files, `.obsidian`, ...) are skipped. A missing `dir` is empty.
pub fn files(dir: &Path, ext: &str) -> Result<Vec<PathBuf>> {
  let mut out = Vec::new();
  if dir.is_dir() {
    collect(dir, ext, &mut out)?;
  }
  Ok(out)
}

fn collect(dir: &Path, ext: &str, out: &mut Vec<PathBuf>) -> Result<()> {
  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    if entry.file_name().to_string_lossy().starts_with('.') {
      continue;
    }
    let path = entry.path();
    if entry.file_type()?.is_dir() {
      collect(&path, ext, out)?;
    } else if path.extension().is_some_and(|e| e == ext) {
      out.push(path);
    }
  }
  Ok(())
}
