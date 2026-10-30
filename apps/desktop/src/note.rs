//! Note text: frontmatter and ULID, title, excerpt, and the file name made from the title.

use crate::error::Result;
use std::fs;
use std::path::{Path, PathBuf};

/// Characters kept in an excerpt.
const EXCERPT_CHARS: usize = 400;
/// Longest file stem made from a title.
const STEM_CHARS: usize = 80;
/// Names Windows reserves for devices, with or without an extension.
const RESERVED: [&str; 22] = [
  "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
  "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A note split into its frontmatter block, kept byte for byte, and its body.
pub struct NoteText {
  pub front: String,
  pub body: String,
}

impl NoteText {
  pub fn parse(text: &str) -> NoteText {
    let end = front_end(text).unwrap_or(0);
    NoteText { front: text[..end].to_string(), body: text[end..].to_string() }
  }

  pub fn read(path: &Path) -> Result<NoteText> {
    Ok(NoteText::parse(&String::from_utf8_lossy(&fs::read(path)?)))
  }

  pub fn text(&self) -> String {
    format!("{}{}", self.front, self.body)
  }

  pub fn id(&self) -> Option<String> {
    let value = self.front.lines().find_map(|l| l.strip_prefix("id:"))?;
    let value = value.trim().trim_matches(['"', '\'']);
    (!value.is_empty()).then(|| value.to_string())
  }

  /// Sets `id`, keeping every other frontmatter line as it was.
  pub fn set_id(&mut self, id: &str) {
    let nl = if self.front.contains("\r\n") { "\r\n" } else { "\n" };
    let line = format!("id: {id}{nl}");
    if self.front.is_empty() {
      self.front = format!("---{nl}{line}---{nl}");
      return;
    }
    let mut lines: Vec<&str> = self.front.split_inclusive('\n').collect();
    match lines.iter().position(|l| l.starts_with("id:")) {
      Some(i) => lines[i] = &line,
      None => lines.insert(1, &line),
    }
    self.front = lines.concat();
  }
}

/// Byte offset just past the closing `---` line, if the text starts with frontmatter.
fn front_end(text: &str) -> Option<usize> {
  let mut lines = text.split_inclusive('\n');
  let first = lines.next()?;
  if first.trim_end() != "---" || !first.ends_with('\n') {
    return None;
  }
  let mut end = first.len();
  for line in lines {
    end += line.len();
    if line.trim_end() == "---" {
      return Some(end);
    }
  }
  None
}

/// The first line of the body, without Markdown heading marks.
pub fn title(body: &str) -> String {
  let line = body.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
  line.trim_start_matches('#').trim().to_string()
}

/// The body after the title line, cut to a few hundred characters.
pub fn excerpt(body: &str) -> String {
  let rest = body.trim_start().split_once('\n').map_or("", |(_, rest)| rest);
  rest.trim().chars().take(EXCERPT_CHARS).collect()
}

/// File stem for a title: characters invalid on Windows are removed.
pub fn file_stem(title: &str) -> String {
  let kept: String = title
    .chars()
    .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') && !c.is_control())
    .take(STEM_CHARS)
    .collect();
  // Windows drops trailing dots and spaces itself, which would change the name behind our back.
  let stem = kept.trim().trim_end_matches(['.', ' ']);
  let device = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
  match stem {
    "" => "Untitled".to_string(),
    _ if RESERVED.contains(&device.as_str()) => format!("{stem}_"),
    _ => stem.to_string(),
  }
}

/// Whether a file stem already fits a title's stem: `Idea`, or a clash name like `Idea 2`.
pub fn stem_fits(current: &str, stem: &str) -> bool {
  let number = current.strip_prefix(stem).and_then(|rest| rest.strip_prefix(' '));
  current == stem || number.is_some_and(|n| n.parse::<u32>().is_ok_and(|n| n >= 2))
}

/// `dir/<stem>.md`, or `<stem> 2.md`, `<stem> 3.md`... : the first name no other file uses.
/// `current` is the note being renamed, which may take a name that only differs from its own by case.
pub fn free_path(dir: &Path, stem: &str, current: Option<&Path>) -> PathBuf {
  free_name(dir, stem, "md", current)
}

/// `<dir>/<stem>.<ext>`, or `<stem> 2.<ext>`, `<stem> 3.<ext>`...: the first name no file takes,
/// apart from `current`, the file being renamed.
pub fn free_name(dir: &Path, stem: &str, ext: &str, current: Option<&Path>) -> PathBuf {
  (1..)
    .map(|n| match n {
      1 => dir.join(format!("{stem}.{ext}")),
      _ => dir.join(format!("{stem} {n}.{ext}")),
    })
    .find(|p| !p.exists() || current.is_some_and(|c| same_file(p, c)))
    .expect("an unused name exists")
}

fn same_file(a: &Path, b: &Path) -> bool {
  matches!((fs::canonicalize(a), fs::canonicalize(b)), (Ok(a), Ok(b)) if a == b)
}
