//! Item states: what a zone, card or edge file holds, or that it is absent. Every layout edit
//! hands target states to `apply`, which returns the states it replaced. Applying those reverses
//! the edit, so undo and redo are the same call.

use crate::error::Result;
use crate::fsx::{self, Stamp};
use crate::index::Scope;
use crate::items::{self, Card, Edge, Item, Kind, Zone};
use crate::session::Session;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::cmp::Reverse;
use std::fs;

/// One zone, card or edge file: its JSON content, or None when there is no file.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ItemState {
  pub kind: Kind,
  pub id: String,
  pub value: Option<Value>,
}

impl ItemState {
  pub fn of<T: Item>(id: &str, item: &T) -> Result<ItemState> {
    Ok(ItemState { kind: T::KIND, id: id.to_string(), value: Some(serde_json::to_value(item)?) })
  }

  pub fn gone(kind: Kind, id: &str) -> ItemState {
    ItemState { kind, id: id.to_string(), value: None }
  }
}

/// A new item's ID, and the states that undo its creation.
#[derive(Serialize, Debug)]
pub struct Created {
  pub id: String,
  pub undo: Vec<ItemState>,
}

/// Write order: zones, cards, edges. Nothing may point at a file that is not there yet.
fn rank(kind: Kind) -> u8 {
  match kind {
    Kind::Zone => 0,
    Kind::Card => 1,
    Kind::Edge => 2,
  }
}

impl Session {
  /// Brings items to the given states and returns the states they had. Writes run first, in
  /// write order, then deletions in reverse (edges before the cards they point at), so nothing
  /// is left pointing at a missing file. Within a kind, writes keep the given order and
  /// deletions reverse it: list parent zones before their children. A deletion needs no check
  /// against outside changes: the states it returns hold the file as it was on disk.
  pub fn apply(&self, states: Vec<ItemState>) -> Result<Vec<ItemState>> {
    let before = states.iter().map(|s| self.state_of(s.kind, &s.id)).collect::<Result<Vec<_>>>()?;
    let (mut deletes, mut writes): (Vec<_>, Vec<_>) = states.into_iter().partition(|s| s.value.is_none());
    writes.sort_by_key(|s| rank(s.kind));
    deletes.reverse();
    deletes.sort_by_key(|s| Reverse(rank(s.kind)));
    self.index.batch(|| {
      for s in writes {
        if let Some(value) = s.value {
          self.write_item(s.kind, &s.id, value)?;
        }
      }
      for s in &deletes {
        let path = items::path(&self.vault, s.kind, &s.id);
        if path.exists() {
          fs::remove_file(&path)?;
        }
        self.index.remove_item(s.kind, &s.id)?;
      }
      Ok(())
    })?;
    Ok(before)
  }

  /// Reads each item, lets `edit` change it (with the item's position in `ids`), and applies the result.
  pub(crate) fn edit<T: Item>(&self, ids: &[&str], edit: impl Fn(usize, &mut T) -> Result<()>) -> Result<Vec<ItemState>> {
    self.apply(self.edited(ids, edit)?)
  }

  /// The states `edit` would apply, to apply along with others.
  pub(crate) fn edited<T: Item>(&self, ids: &[&str], edit: impl Fn(usize, &mut T) -> Result<()>) -> Result<Vec<ItemState>> {
    let mut states = Vec::new();
    for (i, id) in ids.iter().enumerate() {
      let mut item = self.read(id)?;
      edit(i, &mut item)?;
      states.push(ItemState::of(id, &item)?);
    }
    Ok(states)
  }

  fn state_of(&self, kind: Kind, id: &str) -> Result<ItemState> {
    let path = items::path(&self.vault, kind, id);
    let value = if path.exists() { Some(serde_json::from_slice(&fs::read(&path)?)?) } else { None };
    Ok(ItemState { kind, id: id.to_string(), value })
  }

  fn write_item(&self, kind: Kind, id: &str, value: Value) -> Result<()> {
    match kind {
      Kind::Zone => {
        let (zone, stamp) = self.write::<Zone>(id, value)?;
        self.index.put_zone(id, &zone, stamp)?;
        self.index.refresh_bounds(Scope::Zone(id))
      }
      Kind::Card => {
        let (card, stamp) = self.write::<Card>(id, value)?;
        self.index.put_card(id, &card, stamp)?;
        self.index.refresh_bounds(Scope::Card(id))
      }
      Kind::Edge => {
        let (edge, stamp) = self.write::<Edge>(id, value)?;
        self.index.put_edge(id, &edge, stamp)?;
        self.index.refresh_bounds(Scope::Card(&edge.from))
      }
    }
  }

  /// Writes an item's file and returns what it now holds, with the stamp the index records. If
  /// the file changed outside the app since the index last saw it, it is read again and only the
  /// fields this write changes go on top of it: an undo never reverts what a sync tool brought in.
  fn write<T: Item>(&self, id: &str, value: Value) -> Result<(T, Stamp)> {
    let path = items::path(&self.vault, T::KIND, id);
    let mut item: T = serde_json::from_value(value)?;
    if path.exists() && fsx::changed(&path, self.index.item_stamp(T::KIND, id)?)? {
      item = on_top(self.index.item(id)?, item, items::read(&path)?)?;
    }
    items::write(&self.vault, id, &item)?;
    Ok((item, fsx::stamp(&path)?))
  }
}

/// The fields `target` changes from `base` (None: from nothing), set on `disk`.
fn on_top<T: Item>(base: Option<T>, target: T, disk: T) -> Result<T> {
  let fields = |item: Option<T>| -> Result<Map<String, Value>> {
    Ok(match item.map(serde_json::to_value).transpose()? {
      Some(Value::Object(map)) => map,
      _ => Map::new(),
    })
  };
  let (base, target, mut out) = (fields(base)?, fields(Some(target))?, fields(Some(disk))?);
  for key in base.keys().chain(target.keys()) {
    if base.get(key) != target.get(key) {
      match target.get(key) {
        Some(value) => out.insert(key.clone(), value.clone()),
        None => out.remove(key),
      };
    }
  }
  Ok(serde_json::from_value(Value::Object(out))?)
}
