mod commands;
mod edges;
mod error;
mod fsx;
mod index;
mod items;
mod layout;
mod note;
mod registry;
mod scan;
mod session;
mod states;
mod vault;
mod zones;

#[cfg(test)]
mod tests;

/// A new ULID: the ID of every vault, note, zone, card and edge.
pub fn new_id() -> String {
  ulid::Ulid::generate().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(commands::AppState::default())
    .invoke_handler(tauri::generate_handler![
      commands::list_vaults,
      commands::choose_vault,
      commands::open_vault,
      commands::vault_theme,
      commands::set_vault_theme,
      commands::query_viewport,
      commands::create_card,
      commands::place_note,
      commands::item_box,
      commands::unplaced_notes,
      commands::search,
      commands::move_cards,
      commands::resize_card,
      commands::align_cards,
      commands::clear_card,
      commands::delete_cards,
      commands::create_zone,
      commands::move_zones,
      commands::resize_zone,
      commands::zone_contents,
      commands::canvas_contents,
      commands::rename_zone,
      commands::color_zones,
      commands::delete_zones,
      commands::create_edge,
      commands::label_edge,
      commands::shape_edges,
      commands::arrow_edges,
      commands::delete_edges,
      commands::apply_states,
      commands::read_note,
      commands::create_note_for_card,
      commands::save_note,
      commands::discard_note,
      commands::rename_note,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
