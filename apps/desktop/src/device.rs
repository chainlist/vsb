//! Settings of this device, the same in every vault. Kept in the app-data folder next to the
//! recent vaults list, never synced.

use crate::error::Result;
use crate::fsx::atomic_write;
use crate::items::{is_default, is_medium, MEDIUM};
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
  /// The pen's color, width and kind of eraser; left out at the default, each part too.
  #[serde(default, skip_serializing_if = "is_default")]
  pen: PenFile,
}

/// The pen as the drawing tools last left it: its color (None for the theme's ink), its width in
/// world units, and the eraser it takes.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Pen {
  pub color: Option<String>,
  pub width: f64,
  pub eraser: Eraser,
}

/// Which eraser the pen takes: one that takes out whole strokes, or one that cuts them where it passes.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Eraser {
  #[default]
  Stroke,
  Cut,
}

/// The pen, as `device.json` writes it.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
struct PenFile {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  color: Option<String>,
  #[serde(default = "medium", skip_serializing_if = "is_medium")]
  width: f64,
  #[serde(default, skip_serializing_if = "is_default")]
  eraser: Eraser,
}

impl Default for PenFile {
  fn default() -> PenFile {
    PenFile { color: None, width: MEDIUM, eraser: Eraser::default() }
  }
}

fn medium() -> f64 {
  MEDIUM
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

/// The pen as this device last left it: the ink, at medium width, taking the stroke eraser unless
/// `device.json` says otherwise.
pub fn pen(data_dir: &Path) -> Result<Pen> {
  let PenFile { color, width, eraser } = read(data_dir)?.pen;
  Ok(Pen { color, width, eraser })
}

pub fn set_pen(data_dir: &Path, pen: Pen) -> Result<()> {
  let mut file = read(data_dir)?;
  file.pen = PenFile { color: pen.color, width: pen.width, eraser: pen.eraser };
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
