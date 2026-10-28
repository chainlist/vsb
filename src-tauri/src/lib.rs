mod batch;
mod batch_edit;
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

/// WebView2 drops a trackpad pinch while its pinch zoom is off, as Tauri leaves it without the zoom
/// hotkeys. Turned on, the pinch reaches the page as a wheel turned with Ctrl held, which the canvas
/// zooms on and the page cancels everywhere, so the window itself never zooms.
///
/// The setting applies from the next navigation. Called from `setup`, it runs at once, while the
/// window's first navigation is still pending, so that navigation is the next one. Reloading here
/// would cancel it and leave the window blank.
#[cfg(windows)]
fn enable_pinch(app: &tauri::App) -> tauri::Result<()> {
  use tauri::Manager;
  use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
  use windows_core::Interface;

  let Some(window) = app.get_webview_window("main") else {
    return Ok(());
  };
  window.with_webview(|webview| {
    // SAFETY: called on the main thread with Tauri's live controller.
    let enabled = unsafe {
      webview
        .controller()
        .CoreWebView2()
        .and_then(|core| core.Settings())
        .and_then(|settings| settings.cast::<ICoreWebView2Settings5>())
        .and_then(|settings| settings.SetIsPinchZoomEnabled(true))
    };
    if let Err(e) = enabled {
      log::warn!("trackpad pinch stays off: {e}");
    }
  })
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
      commands::vault_snap,
      commands::set_vault_snap,
      commands::query_viewport,
      commands::create_card,
      commands::place_note,
      commands::create_batch,
      commands::item_box,
      commands::unplaced_notes,
      commands::search,
      commands::batch_scope,
      commands::plan_links,
      commands::edit_batch,
      commands::zone_rows,
      commands::ui_state,
      commands::set_ui_state,
      commands::move_cards,
      commands::arrange,
      commands::zone_nodes,
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
      commands::stroke_edges,
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
      #[cfg(windows)]
      enable_pinch(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
