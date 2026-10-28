mod arrange;
mod batch;
mod batch_edit;
mod check;
mod child;
mod clusters;
mod edges;
mod index;
mod insert;
mod layout;
mod note;
mod scan;
mod scan_notes;
mod search;
mod session;
mod storage;
mod unplaced;
mod zone_list;
mod zones;

use crate::index::{Index, Rect};
use crate::items::{self, Card, Kind};
use crate::layout::Move;
use crate::session::Session;
use crate::vault::Vault;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};
use tempfile::TempDir;

pub const WORLD: Rect = Rect { min_x: -1e6, min_y: -1e6, max_x: 1e6, max_y: 1e6 };

/// A fresh vault in a temp folder, with its index in a second temp folder.
pub struct Fixture {
  pub dir: TempDir,
  pub data: TempDir,
  pub vault: Vault,
}

impl Fixture {
  pub fn new() -> Fixture {
    let dir = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    let vault = Vault::open_or_init(dir.path()).unwrap();
    Fixture { dir, data, vault }
  }

  pub fn index(&self) -> Index {
    Index::open(&self.data.path().join("index.sqlite")).unwrap()
  }

  pub fn write(&self, rel: &str, text: &str) {
    let path = self.dir.path().join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
  }

  pub fn read(&self, rel: &str) -> String {
    fs::read_to_string(self.dir.path().join(rel)).unwrap()
  }

  pub fn exists(&self, rel: &str) -> bool {
    self.dir.path().join(rel).exists()
  }
}

pub fn hour_ago() -> SystemTime {
  SystemTime::now() - Duration::from_secs(3600)
}

/// Gives a file another modified time, and creation time where the OS keeps one, as a sync tool
/// or a restore from backup can.
pub fn set_time(f: &Fixture, rel: &str, time: SystemTime) {
  let file = fs::File::options().write(true).open(f.dir.path().join(rel)).unwrap();
  file.set_times(fs::FileTimes::new().set_modified(time)).unwrap();
  #[cfg(windows)]
  {
    use std::os::windows::fs::FileTimesExt;
    file.set_times(fs::FileTimes::new().set_created(time)).unwrap();
  }
}

/// Every file name in `dir`, sorted.
pub fn names(dir: &Path) -> Vec<String> {
  let mut names: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
  names.sort();
  names
}

pub fn open(f: &Fixture) -> Session {
  Session::open(f.dir.path(), f.data.path()).unwrap()
}

pub fn card_file(f: &Fixture, id: &str) -> Card {
  items::read(&items::path(&f.vault, Kind::Card, id)).unwrap()
}

pub fn put_zone(f: &Fixture, id: &str, parent: Option<&str>, x: f64, y: f64, w: f64, h: f64) {
  let zone = json!({ "name": id, "parent": parent, "x": x, "y": y, "w": w, "h": h });
  f.write(&format!(".canvas/zones/{id}.json"), &zone.to_string());
}

pub fn put_card(f: &Fixture, id: &str, zone: Option<&str>, x: f64, y: f64) {
  let card = json!({ "note": null, "zone": zone, "x": x, "y": y, "w": 100.0, "h": 50.0 });
  f.write(&format!(".canvas/cards/{id}.json"), &card.to_string());
}

pub fn move_to(id: &str, x: f64, y: f64) -> Move {
  Move { id: id.into(), x, y }
}

/// An item's R*Tree box: (min_x, min_y, max_x, max_y).
pub fn rtree(s: &Session, table: &str, id: &str) -> (f64, f64, f64, f64) {
  let (items, bounds) = (table, format!("{}_bounds", table.trim_end_matches('s')));
  let sql = format!("SELECT b.min_x, b.min_y, b.max_x, b.max_y FROM {bounds} b JOIN {items} t ON t.key = b.key WHERE t.id = ?1");
  s.index.db.query_row(&sql, [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap()
}

/// The JSON in every file in `.canvas`, by path.
pub fn files(f: &Fixture) -> BTreeMap<String, Value> {
  let mut out = BTreeMap::new();
  for kind in ["zones", "cards", "edges"] {
    let Ok(dir) = fs::read_dir(f.dir.path().join(".canvas").join(kind)) else { continue };
    for entry in dir {
      let path = entry.unwrap().path();
      out.insert(format!("{kind}/{}", path.file_name().unwrap().to_string_lossy()), serde_json::from_slice(&fs::read(path).unwrap()).unwrap());
    }
  }
  out
}
