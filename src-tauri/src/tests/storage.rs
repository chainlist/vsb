use super::{names, Fixture};
use crate::device;
use crate::fsx::{atomic_write, files};
use crate::items::{self, Card, Edge, HAlign, Kind, VAlign, Zone};
use crate::vault::Vault;
use std::fs;
use tempfile::TempDir;

#[test]
fn atomic_write_replaces_and_leaves_no_temp_file() {
  let dir = TempDir::new().unwrap();
  let path = dir.path().join("sub").join("a.json");
  atomic_write(&path, b"one").unwrap();
  atomic_write(&path, b"two").unwrap();
  assert_eq!(fs::read_to_string(&path).unwrap(), "two");
  assert_eq!(names(&dir.path().join("sub")), ["a.json"]);
}

#[test]
fn files_recurse_and_skip_hidden_entries() {
  let f = Fixture::new();
  f.write("notes/a.md", "");
  f.write("notes/deep/b.md", "");
  f.write("notes/c.txt", "");
  f.write("notes/.hidden/d.md", "");
  f.write("notes/.e.md.01X.tmp", "");
  let mut found: Vec<String> = files(&f.vault.notes_dir(), "md").unwrap().iter().map(|p| f.vault.rel(p)).collect();
  found.sort();
  assert_eq!(found, ["notes/a.md", "notes/deep/b.md"]);
}

#[test]
fn init_creates_vault_json_and_notes_and_reopening_keeps_the_id() {
  let f = Fixture::new();
  assert!(f.exists(".canvas/vault.json"));
  assert!(f.exists("notes"));
  let json: serde_json::Value = serde_json::from_str(&f.read(".canvas/vault.json")).unwrap();
  assert_eq!(json["format"], 1);
  assert_eq!(json["id"], f.vault.id.as_str());
  assert_eq!(Vault::open_or_init(f.dir.path()).unwrap().id, f.vault.id);
  assert_eq!(Vault::open(f.dir.path()).unwrap().id, f.vault.id);
}

#[test]
fn theme_is_kept_in_vault_json_and_left_out_for_the_default() {
  let f = Fixture::new();
  assert_eq!(f.vault.theme().unwrap(), None);
  f.vault.set_theme(Some("pad".into())).unwrap();
  let json: serde_json::Value = serde_json::from_str(&f.read(".canvas/vault.json")).unwrap();
  assert_eq!(json["theme"], "pad");
  assert_eq!(json["id"], f.vault.id.as_str());
  assert_eq!(Vault::open(f.dir.path()).unwrap().theme().unwrap().as_deref(), Some("pad"));
  f.vault.set_theme(None).unwrap();
  assert!(!f.read(".canvas/vault.json").contains("theme"));
}

#[test]
fn snap_is_on_by_default_and_only_written_while_off() {
  let f = Fixture::new();
  assert!(f.vault.snap().unwrap());
  assert!(!f.read(".canvas/vault.json").contains("snap"));
  f.vault.set_theme(Some("pad".into())).unwrap();
  f.vault.set_snap(false).unwrap();
  let json: serde_json::Value = serde_json::from_str(&f.read(".canvas/vault.json")).unwrap();
  assert_eq!(json["snap"], false);
  assert_eq!(json["theme"], "pad");
  assert!(!Vault::open(f.dir.path()).unwrap().snap().unwrap());
  f.vault.set_snap(true).unwrap();
  assert!(!f.read(".canvas/vault.json").contains("snap"));
}

#[test]
fn open_refuses_a_folder_that_is_not_a_vault() {
  let dir = TempDir::new().unwrap();
  assert!(Vault::open(dir.path()).is_err());
  assert!(!dir.path().join(".canvas").exists());
}

#[test]
fn card_file_leaves_out_default_alignment() {
  let f = Fixture::new();
  let mut card = Card { note: None, zone: None, x: 1.0, y: 2.0, w: 3.0, h: 4.0, halign: HAlign::Left, valign: VAlign::Top, color: None };
  let path = items::write(&f.vault, "C1", &card).unwrap();
  let json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
  assert_eq!(json, serde_json::json!({ "note": null, "zone": null, "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0 }));
  card.halign = HAlign::Center;
  card.valign = VAlign::Bottom;
  items::write(&f.vault, "C1", &card).unwrap();
  let json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
  assert_eq!((json["halign"].as_str(), json["valign"].as_str()), (Some("center"), Some("bottom")));
  assert_eq!(items::read::<Card>(&path).unwrap(), card);
  assert_eq!(path, items::path(&f.vault, Kind::Card, "C1"));
}

#[test]
fn items_read_files_written_by_hand() {
  let f = Fixture::new();
  f.write(".canvas/zones/Z.json", r##"{ "name": "Pricing", "parent": null, "x": 0, "y": 0, "w": 800, "h": 600, "color": "#f5d76e" }"##);
  f.write(".canvas/edges/E.json", r#"{ "from": "A", "to": "B", "extra": true }"#);
  let zone: Zone = items::read(&items::path(&f.vault, Kind::Zone, "Z")).unwrap();
  assert_eq!((zone.name.as_str(), zone.w, zone.color.as_deref()), ("Pricing", 800.0, Some("#f5d76e")));
  let edge: Edge = items::read(&items::path(&f.vault, Kind::Edge, "E")).unwrap();
  assert_eq!((edge.from.as_str(), edge.to.as_str(), edge.label), ("A", "B", None));
}

#[test]
fn interface_size_is_kept_per_device_and_left_out_for_the_default() {
  let data = TempDir::new().unwrap();
  assert_eq!(device::interface_size(data.path()).unwrap(), None);
  device::set_interface_size(data.path(), Some(130)).unwrap();
  assert_eq!(device::interface_size(data.path()).unwrap(), Some(130));
  let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(data.path().join("device.json")).unwrap()).unwrap();
  assert_eq!(json["interfaceSize"], 130);
  device::set_interface_size(data.path(), None).unwrap();
  assert!(!fs::read_to_string(data.path().join("device.json")).unwrap().contains("interfaceSize"));
}
