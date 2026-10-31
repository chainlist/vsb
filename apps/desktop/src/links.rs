//! Links: web pages a card shows in place of a note, by their address. Pasting a lone address on the
//! canvas places one, and Ctrl+click opens it in the system's browser. As it is pasted, the page is
//! read once for what it says of itself in its head: its title, description and image.

use crate::error::{msg, Error, Result};
use crate::fsx::atomic_write;
use crate::items::Preview;
use crate::note;
use crate::session::Session;
use std::io::Read;
use std::time::Duration;
use tauri::Url;
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
use ureq::ResponseExt;

/// Where a page's image is kept, under the vault's attachments.
const DIR: &str = "attachments/links";
/// The most of a page read for its head, in bytes: the rest is its body.
const PAGE_BYTES: u64 = 1 << 20;
/// The largest image kept, in bytes.
const IMAGE_BYTES: u64 = 5 << 20;
/// How long each request may take, from connecting to the last byte.
const TIMEOUT: Duration = Duration::from_secs(8);
/// The longest title and description kept, in characters.
const TITLE_CHARS: usize = 200;
const DESCRIPTION_CHARS: usize = 500;
/// The extension of each type of image a card shows.
const IMAGES: [(&str, &str); 7] =
  [("image/png", "png"), ("image/jpeg", "jpg"), ("image/gif", "gif"), ("image/webp", "webp"), ("image/bmp", "bmp"), ("image/avif", "avif"), ("image/svg+xml", "svg")];

/// Refuses an address that is not a web page's, http or https: a link can come from anywhere, a clip
/// or a note, and opening another scheme could start any program.
pub fn check(url: &str) -> Result<()> {
  match Url::parse(url) {
    Ok(u) if matches!(u.scheme(), "http" | "https") => Ok(()),
    _ => msg("not a web link"),
  }
}

/// What a page's head says of it: Open Graph's tags first, then Twitter's, then plain HTML. The
/// image's address is made whole against the page's.
#[derive(Debug, Default, PartialEq)]
pub struct Head {
  pub title: Option<String>,
  pub description: Option<String>,
  pub image: Option<Url>,
}

/// A page read from the web: its head's title and description, and its image's bytes with their
/// extension.
#[derive(Debug, Default)]
pub struct Page {
  pub title: Option<String>,
  pub description: Option<String>,
  pub image: Option<(Vec<u8>, &'static str)>,
}

/// Reads a web page's head, and its image when it names one. A page that cannot be read fails; an
/// image that cannot is left out.
pub fn fetch(url: &str) -> Result<Page> {
  check(url)?;
  let agent = agent();
  let mut res = agent.get(url).header("Accept", "text/html,application/xhtml+xml").call().map_err(net)?;
  if !matches!(res.body().mime_type(), Some("text/html" | "application/xhtml+xml")) {
    return msg("not a web page");
  }
  let base = Url::parse(&res.get_uri().to_string()).map_err(|e| Error::Msg(e.to_string()))?;
  let mut bytes = Vec::new();
  res.body_mut().as_reader().take(PAGE_BYTES).read_to_end(&mut bytes)?;
  let head = read_head(&String::from_utf8_lossy(&bytes), &base);
  let image = head.image.and_then(|src| image(&agent, src.as_str()).ok());
  Ok(Page { title: head.title, description: head.description, image })
}

fn agent() -> ureq::Agent {
  // The system's own TLS and certificates, as a browser on it would use.
  let tls = TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build();
  let user_agent = concat!("Mozilla/5.0 (compatible; VisualSecondBrain/", env!("CARGO_PKG_VERSION"), "; link preview)");
  ureq::Agent::config_builder().tls_config(tls).timeout_global(Some(TIMEOUT)).user_agent(user_agent).build().into()
}

fn net(e: ureq::Error) -> Error {
  Error::Msg(e.to_string())
}

/// An image's bytes and the extension its type takes; refused when it is not an image a card shows.
fn image(agent: &ureq::Agent, url: &str) -> Result<(Vec<u8>, &'static str)> {
  let mut res = agent.get(url).call().map_err(net)?;
  let Some(&(_, ext)) = IMAGES.iter().find(|(t, _)| res.body().mime_type() == Some(*t)) else {
    return msg("not an image");
  };
  Ok((res.body_mut().with_config().limit(IMAGE_BYTES).read_to_vec().map_err(net)?, ext))
}

/// What a page's HTML says of it in its head, up to its body. Each tag's value is taken from the
/// first tag that gives one.
pub fn read_head(html: &str, base: &Url) -> Head {
  let mut metas: Vec<(String, String)> = Vec::new();
  let mut title = None;
  let mut i = 0;
  while let Some(p) = html[i..].find('<') {
    let start = i + p + 1;
    let end = start + html[start..].bytes().position(|c| !c.is_ascii_alphanumeric()).unwrap_or(html.len() - start);
    let name = &html[start..end];
    i = end;
    if name.eq_ignore_ascii_case("meta") {
      let (attrs, next) = attributes(html, end);
      i = next;
      let value = |key: &str| attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
      if let (Some(key), Some(content)) = (value("property").or_else(|| value("name")), value("content")) {
        metas.push((key.to_ascii_lowercase(), content));
      }
    } else if name.eq_ignore_ascii_case("title") && title.is_none() {
      let (_, next) = attributes(html, end);
      let close = find_ignoring_case(html, next, "</title").unwrap_or(html.len());
      title = Some(html[next..close].to_string());
      i = close;
    } else if name.eq_ignore_ascii_case("body") {
      break;
    }
  }
  let meta = |keys: &[&str]| keys.iter().find_map(|k| metas.iter().find(|(key, v)| key == k && !v.trim().is_empty()).map(|(_, v)| v.clone()));
  Head {
    title: clean(meta(&["og:title", "twitter:title"]).or(title), TITLE_CHARS),
    description: clean(meta(&["og:description", "twitter:description", "description"]), DESCRIPTION_CHARS),
    image: meta(&["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"])
      .and_then(|src| base.join(decode(&src).trim()).ok())
      .filter(|u| matches!(u.scheme(), "http" | "https")),
  }
}

/// The attributes of the tag whose name ends at `i`, names lowercased and values as written, and
/// where the tag ends. A `>` inside a quoted value does not end it.
fn attributes(html: &str, mut i: usize) -> (Vec<(String, String)>, usize) {
  let b = html.as_bytes();
  let skip = |mut i: usize| {
    while i < b.len() && b[i].is_ascii_whitespace() {
      i += 1;
    }
    i
  };
  let mut attrs = Vec::new();
  loop {
    while i < b.len() && (b[i].is_ascii_whitespace() || b[i] == b'/') {
      i += 1;
    }
    if i >= b.len() {
      return (attrs, b.len());
    }
    if b[i] == b'>' {
      return (attrs, i + 1);
    }
    let start = i;
    while i < b.len() && !b[i].is_ascii_whitespace() && !matches!(b[i], b'=' | b'>' | b'/') {
      i += 1;
    }
    let name = html[start..i].to_ascii_lowercase();
    i = skip(i);
    let mut value = String::new();
    if i < b.len() && b[i] == b'=' {
      i = skip(i + 1);
      if i < b.len() && matches!(b[i], b'"' | b'\'') {
        let quote = b[i] as char;
        let from = i + 1;
        let to = html[from..].find(quote).map_or(b.len(), |p| from + p);
        value = html[from..to].to_string();
        i = (to + 1).min(b.len());
      } else {
        let from = i;
        while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'>' {
          i += 1;
        }
        value = html[from..i].to_string();
      }
    }
    attrs.push((name, value));
  }
}

/// Where `needle`, ASCII, next starts in `hay` from `from`, ignoring ASCII case.
fn find_ignoring_case(hay: &str, from: usize, needle: &str) -> Option<usize> {
  let (hay, needle) = (hay.as_bytes(), needle.as_bytes());
  (from..=hay.len().checked_sub(needle.len())?).find(|&i| hay[i..i + needle.len()].eq_ignore_ascii_case(needle))
}

/// A text as it reads: character references decoded, runs of white space made one space, and cut to
/// `max` characters with an ellipsis. None when nothing is left.
fn clean(text: Option<String>, max: usize) -> Option<String> {
  let text = decode(&text?).split_whitespace().collect::<Vec<_>>().join(" ");
  match text.chars().count() {
    0 => None,
    n if n > max => Some(text.chars().take(max - 1).collect::<String>().trim_end().to_string() + "…"),
    _ => Some(text),
  }
}

/// Decodes HTML's character references: the few named ones pages use in their heads, and numeric ones.
/// Anything else stays as written.
fn decode(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  let mut rest = text;
  while let Some(p) = rest.find('&') {
    out.push_str(&rest[..p]);
    rest = &rest[p..];
    let end = rest[1..].find(';').map(|e| e + 1).filter(|&e| e <= 10);
    match end.and_then(|e| reference(&rest[1..e]).map(|c| (e, c))) {
      Some((e, c)) => {
        out.push(c);
        rest = &rest[e + 1..];
      }
      None => {
        out.push('&');
        rest = &rest[1..];
      }
    }
  }
  out.push_str(rest);
  out
}

fn reference(name: &str) -> Option<char> {
  match name {
    "amp" => Some('&'),
    "lt" => Some('<'),
    "gt" => Some('>'),
    "quot" => Some('"'),
    "apos" => Some('\''),
    "nbsp" => Some(' '),
    _ => {
      let n = name.strip_prefix('#')?;
      let code = match n.strip_prefix(['x', 'X']) {
        Some(hex) => u32::from_str_radix(hex, 16).ok()?,
        None => n.parse().ok()?,
      };
      char::from_u32(code)
    }
  }
}

impl Session {
  /// Keeps what a page said of itself: its image is written under `attachments/links/`, named after
  /// the page's host as a note is after its title, a clash numbered. None when it said nothing.
  pub fn keep_preview(&self, url: &str, page: Page) -> Result<Option<Preview>> {
    let image = match page.image {
      Some((bytes, ext)) => {
        let host = Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string()));
        let path = note::free_name(&self.vault.abs(DIR), &note::file_stem(&host.unwrap_or_default()), ext, None);
        atomic_write(&path, &bytes)?;
        Some(self.vault.rel(&path))
      }
      None => None,
    };
    let preview = Preview { title: page.title, description: page.description, image };
    Ok((preview != Preview::default()).then_some(preview))
  }
}
