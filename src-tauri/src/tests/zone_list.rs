use super::{put_card, put_zone, Fixture};
use crate::index::Index;
use crate::scan::scan;

/// Each row as (name, has inner zones, cards held), in order.
fn rows(index: &Index, parent: Option<&str>, offset: u32, limit: u32) -> Vec<(String, bool, i64)> {
  index.zone_rows(parent, offset, limit).unwrap().into_iter().map(|z| (z.name, z.inner, z.cards)).collect()
}

#[test]
fn the_zone_list_shows_a_level_at_a_time_by_name_with_cards_counted_at_any_depth() {
  let f = Fixture::new();
  let index = f.index();
  put_zone(&f, "beta", None, 0.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "Inner", Some("beta"), 100.0, 100.0, 300.0, 300.0);
  put_zone(&f, "Deep", Some("Inner"), 10.0, 10.0, 100.0, 100.0);
  put_zone(&f, "Alpha", None, 2000.0, 0.0, 500.0, 500.0);
  // Its parent is not synced yet: it sits on the canvas.
  put_zone(&f, "Gamma", Some("MISSING"), 5000.0, 0.0, 100.0, 100.0);
  put_card(&f, "C1", Some("beta"), 500.0, 500.0);
  put_card(&f, "C2", Some("Inner"), 150.0, 150.0);
  put_card(&f, "C3", Some("Deep"), 5.0, 5.0);
  put_card(&f, "C4", None, -500.0, 0.0);
  put_card(&f, "C5", Some("Alpha"), 10.0, 10.0);
  scan(&f.vault, &index).unwrap();

  let row = |name: &str, inner, cards| (name.to_string(), inner, cards);
  // Ignoring case: "Gamma" after "beta".
  assert_eq!(rows(&index, None, 0, 50), [row("Alpha", false, 1), row("beta", true, 3), row("Gamma", false, 0)]);
  assert_eq!(rows(&index, Some("beta"), 0, 50), [row("Inner", true, 2)]);
  assert_eq!(rows(&index, Some("Inner"), 0, 50), [row("Deep", false, 1)]);
  assert!(rows(&index, Some("Deep"), 0, 50).is_empty());

  // A page at a time.
  assert_eq!(rows(&index, None, 1, 1), [row("beta", true, 3)]);
  assert!(rows(&index, None, 3, 50).is_empty());

  // Boxes are in the world, through the zones around.
  let deep = &index.zone_rows(Some("Inner"), 0, 50).unwrap()[0];
  assert_eq!((deep.id.as_str(), deep.x, deep.y, deep.w, deep.h), ("Deep", 110.0, 110.0, 100.0, 100.0));
}

#[test]
fn zone_search_finds_names_at_any_depth_by_word_starts_ignoring_case_and_accents() {
  let f = Fixture::new();
  let index = f.index();
  let zone = |id: &str, name: &str, parent: Option<&str>| {
    let json = serde_json::json!({ "name": name, "parent": parent, "x": 0.0, "y": 0.0, "w": 400.0, "h": 400.0 });
    f.write(&format!(".canvas/zones/{id}.json"), &json.to_string());
  };
  zone("Q3", "Q3 plan", None);
  zone("PR", "Pricing risks", Some("Q3"));
  zone("PT", "pricing", None);
  zone("EL", "Éléments de prix", Some("PR"));
  zone("SP", "Supprime", None);
  put_card(&f, "C1", Some("EL"), 10.0, 10.0);
  scan(&f.vault, &index).unwrap();

  let names = |text: &str, offset, limit| -> Vec<String> {
    index.zone_matches(text, offset, limit).unwrap().into_iter().map(|z| z.name).collect()
  };
  // At any depth, by name ignoring case; a word must start the way it was typed, so not "Supprime".
  assert_eq!(names("pri", 0, 50), ["pricing", "Pricing risks", "Éléments de prix"]);
  // Every word typed, each anywhere in the name.
  assert_eq!(names("risk pri", 0, 50), ["Pricing risks"]);
  // Accents and case are ignored.
  assert_eq!(names("elements", 0, 50), ["Éléments de prix"]);
  // Rows as in the tree: cards counted at any depth.
  assert_eq!(index.zone_matches("risks", 0, 50).unwrap()[0].cards, 1);
  // A page at a time, and nothing for nothing typed.
  assert_eq!(names("pri", 1, 1), ["Pricing risks"]);
  assert!(names("  ", 0, 50).is_empty());
  assert!(names("->", 0, 50).is_empty());
}

#[test]
fn ui_state_is_kept_in_the_index_across_reopening() {
  let f = Fixture::new();
  let index = f.index();
  assert_eq!(index.ui_state("zone-list").unwrap(), None);
  index.set_ui_state("zone-list", "open").unwrap();
  index.set_ui_state("zone-list", "closed").unwrap();
  drop(index);
  let index = f.index();
  assert_eq!(index.ui_state("zone-list").unwrap().as_deref(), Some("closed"));
  assert!(!f.exists(".canvas/ui_state.json"));
}
