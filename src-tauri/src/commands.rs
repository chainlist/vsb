//! Tauri commands: the frontend's only way to the vault files and the index.

use crate::batch::{Batch, BatchCard, BatchEdge};
use crate::error::{msg, Error, Result};
use crate::index::{Entry, Rect, Viewport};
use crate::items::{Arrow, HAlign, Kind, Shape, Stroke, VAlign};
use crate::layout::Move;
use crate::states::{Created, ItemState};
use crate::registry::{self, VaultEntry};
use crate::session::Session;
use crate::vault::Vault;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// The open vault, if any.
#[derive(Default)]
pub struct AppState(Mutex<Option<Session>>);

impl AppState {
  fn lock(&self) -> Result<MutexGuard<'_, Option<Session>>> {
    self.0.lock().map_err(|_| Error::Msg("vault state is poisoned".into()))
  }

  fn with<T>(&self, f: impl FnOnce(&Session) -> Result<T>) -> Result<T> {
    match self.lock()?.as_ref() {
      Some(session) => f(session),
      None => msg("no vault is open"),
    }
  }
}

/// Per-device data: the recent vaults list and one index folder per vault.
fn data_dir(app: &AppHandle) -> Result<PathBuf> {
  // Local, not roaming: a roaming profile would sync the index.
  app.path().app_local_data_dir().map_err(|e| Error::Msg(e.to_string()))
}

#[tauri::command]
pub async fn list_vaults(app: AppHandle) -> Result<Vec<VaultEntry>> {
  registry::list(&data_dir(&app)?)
}

/// Asks for a folder, makes it a vault if needed and adds it to the recent list. None if cancelled.
#[tauri::command]
pub async fn choose_vault(app: AppHandle) -> Result<Option<VaultEntry>> {
  let Some(folder) = app.dialog().file().blocking_pick_folder() else {
    return Ok(None);
  };
  let root = folder.into_path().map_err(|e| Error::Msg(e.to_string()))?;
  let entry = VaultEntry::of(&Vault::open_or_init(&root)?);
  registry::touch(&data_dir(&app)?, &entry)?;
  Ok(Some(entry))
}

#[tauri::command]
pub async fn open_vault(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<VaultEntry> {
  let dir = data_dir(&app)?;
  let entry = registry::find(&dir, &id)?;
  let session = Session::open(Path::new(&entry.path), &dir)?;
  if session.vault.id != id {
    return msg(format!("{} now holds a different vault", entry.path));
  }
  registry::touch(&dir, &entry)?;
  *state.lock()? = Some(session);
  Ok(entry)
}

#[tauri::command]
pub async fn vault_theme(state: State<'_, AppState>) -> Result<Option<String>> {
  state.with(|s| s.vault.theme())
}

#[tauri::command]
pub async fn set_vault_theme(state: State<'_, AppState>, theme: Option<String>) -> Result<()> {
  state.with(|s| s.vault.set_theme(theme))
}

#[tauri::command]
pub async fn vault_snap(state: State<'_, AppState>) -> Result<bool> {
  state.with(|s| s.vault.snap())
}

#[tauri::command]
pub async fn set_vault_snap(state: State<'_, AppState>, snap: bool) -> Result<()> {
  state.with(|s| s.vault.set_snap(snap))
}

#[tauri::command]
pub async fn query_viewport(state: State<'_, AppState>, rect: Rect, min_size: f64, collapsed: bool) -> Result<Viewport> {
  state.with(|s| s.index.viewport(rect, min_size, collapsed))
}

#[tauri::command]
pub async fn create_card(state: State<'_, AppState>, x: f64, y: f64, w: f64, h: f64) -> Result<String> {
  state.with(|s| s.create_card(x, y, w, h))
}

#[tauri::command]
pub async fn place_note(state: State<'_, AppState>, path: String, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
  state.with(|s| s.place_note(&path, x, y, w, h))
}

#[tauri::command]
pub async fn create_batch(state: State<'_, AppState>, x: f64, y: f64, cards: Vec<BatchCard>, edges: Vec<BatchEdge>) -> Result<Batch> {
  state.with(|s| s.create_batch(x, y, &cards, &edges))
}

#[tauri::command]
pub async fn item_box(state: State<'_, AppState>, kind: Kind, id: String) -> Result<Option<Rect>> {
  state.with(|s| s.index.item_box(kind, &id))
}

// The lists beside the canvas come a page at a time.

#[tauri::command]
pub async fn unplaced_notes(state: State<'_, AppState>, offset: u32, limit: u32) -> Result<Vec<Entry>> {
  state.with(|s| s.index.unplaced(offset, limit))
}

#[tauri::command]
pub async fn search(state: State<'_, AppState>, text: String, offset: u32, limit: u32) -> Result<Vec<Entry>> {
  state.with(|s| s.index.search(&text, offset, limit))
}

// Layout edits return the item states they replaced: the frontend's undo history applies them.

#[tauri::command]
pub async fn move_cards(state: State<'_, AppState>, moves: Vec<Move>) -> Result<Vec<ItemState>> {
  state.with(|s| s.move_cards(&moves))
}

#[tauri::command]
pub async fn resize_card(state: State<'_, AppState>, id: String, x: f64, y: f64, w: f64, h: f64) -> Result<Vec<ItemState>> {
  state.with(|s| s.resize_card(&id, x, y, w, h))
}

#[tauri::command]
pub async fn align_cards(state: State<'_, AppState>, ids: Vec<String>, halign: HAlign, valign: VAlign) -> Result<Vec<ItemState>> {
  state.with(|s| s.align_cards(&ids, halign, valign))
}

#[tauri::command]
pub async fn clear_card(state: State<'_, AppState>, id: String) -> Result<Vec<ItemState>> {
  state.with(|s| s.clear_card(&id))
}

#[tauri::command]
pub async fn delete_cards(state: State<'_, AppState>, ids: Vec<String>) -> Result<Vec<ItemState>> {
  state.with(|s| s.delete_cards(&ids))
}

#[tauri::command]
pub async fn create_zone(state: State<'_, AppState>, x: f64, y: f64, w: f64, h: f64) -> Result<Created> {
  state.with(|s| s.create_zone(x, y, w, h))
}

#[tauri::command]
pub async fn move_zones(state: State<'_, AppState>, moves: Vec<Move>) -> Result<Vec<ItemState>> {
  state.with(|s| s.move_zones(&moves))
}

#[tauri::command]
pub async fn resize_zone(state: State<'_, AppState>, id: String, x: f64, y: f64, w: f64, h: f64) -> Result<Vec<ItemState>> {
  state.with(|s| s.resize_zone(&id, x, y, w, h))
}

#[tauri::command]
pub async fn zone_contents(state: State<'_, AppState>, id: String) -> Result<Option<Rect>> {
  state.with(|s| s.index.zone_contents(&id))
}

#[tauri::command]
pub async fn canvas_contents(state: State<'_, AppState>) -> Result<Option<Rect>> {
  state.with(|s| s.index.canvas_contents())
}

#[tauri::command]
pub async fn rename_zone(state: State<'_, AppState>, id: String, name: String) -> Result<Vec<ItemState>> {
  state.with(|s| s.rename_zone(&id, &name))
}

#[tauri::command]
pub async fn color_zones(state: State<'_, AppState>, ids: Vec<String>, color: Option<String>) -> Result<Vec<ItemState>> {
  state.with(|s| s.color_zones(&ids, color))
}

#[tauri::command]
pub async fn delete_zones(state: State<'_, AppState>, ids: Vec<String>) -> Result<Vec<ItemState>> {
  state.with(|s| s.delete_zones(&ids))
}

#[tauri::command]
pub async fn create_edge(state: State<'_, AppState>, from: String, to: String) -> Result<Created> {
  state.with(|s| s.create_edge(&from, &to))
}

#[tauri::command]
pub async fn label_edge(state: State<'_, AppState>, id: String, label: String) -> Result<Vec<ItemState>> {
  state.with(|s| s.label_edge(&id, &label))
}

#[tauri::command]
pub async fn shape_edges(state: State<'_, AppState>, ids: Vec<String>, shape: Shape) -> Result<Vec<ItemState>> {
  state.with(|s| s.shape_edges(&ids, shape))
}

#[tauri::command]
pub async fn arrow_edges(state: State<'_, AppState>, ids: Vec<String>, arrow: Arrow) -> Result<Vec<ItemState>> {
  state.with(|s| s.arrow_edges(&ids, arrow))
}

#[tauri::command]
pub async fn stroke_edges(state: State<'_, AppState>, ids: Vec<String>, stroke: Stroke) -> Result<Vec<ItemState>> {
  state.with(|s| s.stroke_edges(&ids, stroke))
}

#[tauri::command]
pub async fn delete_edges(state: State<'_, AppState>, ids: Vec<String>) -> Result<Vec<ItemState>> {
  state.with(|s| s.delete_edges(&ids))
}

#[tauri::command]
pub async fn apply_states(state: State<'_, AppState>, states: Vec<ItemState>) -> Result<Vec<ItemState>> {
  state.with(|s| s.apply(states))
}

#[tauri::command]
pub async fn read_note(state: State<'_, AppState>, id: String) -> Result<String> {
  state.with(|s| s.read_note(&id))
}

#[tauri::command]
pub async fn create_note_for_card(state: State<'_, AppState>, card_id: String, body: String) -> Result<String> {
  state.with(|s| s.create_note_for_card(&card_id, &body))
}

#[tauri::command]
pub async fn save_note(state: State<'_, AppState>, id: String, body: String) -> Result<bool> {
  state.with(|s| s.save_note(&id, &body))
}

#[tauri::command]
pub async fn discard_note(state: State<'_, AppState>, card_id: String, note_id: String) -> Result<()> {
  state.with(|s| s.discard_note(&card_id, &note_id))
}

#[tauri::command]
pub async fn rename_note(state: State<'_, AppState>, id: String) -> Result<()> {
  state.with(|s| s.rename_note(&id))
}
