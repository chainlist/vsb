//! Zones, cards and edges: one JSON file per item in `.canvas/`.

use crate::error::Result;
use crate::fsx::atomic_write;
use crate::vault::Vault;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
  Zone,
  Card,
  Edge,
}

impl Kind {
  fn dir(self) -> &'static str {
    match self {
      Kind::Zone => "zones",
      Kind::Card => "cards",
      Kind::Edge => "edges",
    }
  }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HAlign {
  #[default]
  Left,
  Center,
  Right,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VAlign {
  #[default]
  Top,
  Center,
  Bottom,
}

/// How an edge runs between its cards.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
  #[default]
  Curved,
  Straight,
  Angled,
}

/// Where an edge has arrowheads: at its `to` card, at both cards, or at neither.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Arrow {
  #[default]
  To,
  Both,
  None,
}

impl HAlign {
  pub fn as_str(self) -> &'static str {
    match self {
      HAlign::Left => "left",
      HAlign::Center => "center",
      HAlign::Right => "right",
    }
  }
}

impl VAlign {
  pub fn as_str(self) -> &'static str {
    match self {
      VAlign::Top => "top",
      VAlign::Center => "center",
      VAlign::Bottom => "bottom",
    }
  }
}

impl Shape {
  pub fn as_str(self) -> &'static str {
    match self {
      Shape::Curved => "curved",
      Shape::Straight => "straight",
      Shape::Angled => "angled",
    }
  }
}

impl Arrow {
  pub fn as_str(self) -> &'static str {
    match self {
      Arrow::To => "to",
      Arrow::Both => "both",
      Arrow::None => "none",
    }
  }
}

fn is_default<T: Default + PartialEq>(v: &T) -> bool {
  *v == T::default()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Zone {
  #[serde(default)]
  pub name: String,
  pub parent: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub color: Option<String>,
}

/// `x` and `y` are relative to the card's zone (or the canvas).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Card {
  pub note: Option<String>,
  pub zone: Option<String>,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
  #[serde(default, skip_serializing_if = "is_default")]
  pub halign: HAlign,
  #[serde(default, skip_serializing_if = "is_default")]
  pub valign: VAlign,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Edge {
  pub from: String,
  pub to: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  #[serde(default, skip_serializing_if = "is_default")]
  pub shape: Shape,
  #[serde(default, skip_serializing_if = "is_default")]
  pub arrow: Arrow,
}

pub trait Item: Serialize + DeserializeOwned {
  const KIND: Kind;
}

impl Item for Zone {
  const KIND: Kind = Kind::Zone;
}

impl Item for Card {
  const KIND: Kind = Kind::Card;
}

impl Item for Edge {
  const KIND: Kind = Kind::Edge;
}

pub fn dir(vault: &Vault, kind: Kind) -> PathBuf {
  vault.canvas_dir().join(kind.dir())
}

pub fn path(vault: &Vault, kind: Kind, id: &str) -> PathBuf {
  dir(vault, kind).join(format!("{id}.json"))
}

pub fn read<T: Item>(path: &Path) -> Result<T> {
  Ok(serde_json::from_slice(&fs::read(path)?)?)
}

/// Writes the item's file and returns its path.
pub fn write<T: Item>(vault: &Vault, id: &str, item: &T) -> Result<PathBuf> {
  let path = path(vault, T::KIND, id);
  atomic_write(&path, &serde_json::to_vec_pretty(item)?)?;
  Ok(path)
}
