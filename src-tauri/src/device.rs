//! Settings of this device, the same in every vault. Kept in the app-data folder next to the
//! recent vaults list, never synced.

use crate::error::Result;
use crate::fsx::atomic_write;
use crate::items::is_default;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const FILE: &str = "device.json";

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DeviceFile {
  /// How large the controls and panels are drawn, in percent; left out for the default.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  interface_size: Option<u32>,
  /// What the mouse wheel does on the canvas; left out while it zooms, the default.
  #[serde(default, skip_serializing_if = "is_default")]
  wheel: Wheel,
}

/// What the mouse wheel does on the canvas: zoom around the pointer, or pan.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Wheel {
  #[default]
  Zoom,
  Pan,
}

fn read(data_dir: &Path) -> Result<DeviceFile> {
  let path = data_dir.join(FILE);
  if !path.exists() {
    return Ok(DeviceFile::default());
  }
  Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn interface_size(data_dir: &Path) -> Result<Option<u32>> {
  Ok(read(data_dir)?.interface_size)
}

pub fn set_interface_size(data_dir: &Path, size: Option<u32>) -> Result<()> {
  let mut file = read(data_dir)?;
  file.interface_size = size;
  atomic_write(&data_dir.join(FILE), &serde_json::to_vec_pretty(&file)?)
}

pub fn wheel(data_dir: &Path) -> Result<Wheel> {
  Ok(read(data_dir)?.wheel)
}

pub fn set_wheel(data_dir: &Path, wheel: Wheel) -> Result<()> {
  let mut file = read(data_dir)?;
  file.wheel = wheel;
  atomic_write(&data_dir.join(FILE), &serde_json::to_vec_pretty(&file)?)
}
