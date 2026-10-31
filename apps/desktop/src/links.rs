//! Links: web pages a card shows in place of a note, by their address. Pasting a lone address on the
//! canvas places one, and Ctrl+click opens it in the system's browser; the app never fetches it.

use crate::error::{msg, Result};

/// Refuses an address that is not a web page's, http or https: a link can come from anywhere, a clip
/// or a note, and opening another scheme could start any program.
pub fn check(url: &str) -> Result<()> {
  match tauri::Url::parse(url) {
    Ok(u) if matches!(u.scheme(), "http" | "https") => Ok(()),
    _ => msg("not a web link"),
  }
}
