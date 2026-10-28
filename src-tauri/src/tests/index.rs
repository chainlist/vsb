use super::{Fixture, WORLD};
use crate::index::Rect;
use crate::scan::scan;

fn card(zone: Option<&str>, x: f64, y: f64, note: Option<&str>) -> String {
  serde_json::json!({ "note": note, "zone": zone, "x": x, "y": y, "w": 100, "h": 50 }).to_string()
}

fn zone(parent: Option<&str>, x: f64, y: f64, w: f64, h: f64) -> String {
  serde_json::json!({ "name": "Z", "parent": parent, "x": x, "y": y, "w": w, "h": h }).to_string()
}

#[test]
fn sqlite_build_has_fts5_rtree_and_math_functions() {
  let f = Fixture::new();
  let index = f.index();
  let floor: f64 = index.db.query_row("SELECT floor(-0.5)", [], |r| r.get(0)).unwrap();
  assert_eq!(floor, -1.0);
  let fts: i64 = index.db.query_row("SELECT count(*) FROM notes_fts WHERE notes_fts MATCH 'x'", [], |r| r.get(0)).unwrap();
  assert_eq!(fts, 0);
  let rtree: i64 = index.db.query_row("SELECT count(*) FROM card_bounds WHERE min_x > 0", [], |r| r.get(0)).unwrap();
  assert_eq!(rtree, 0);
}

#[test]
fn schema_version_mismatch_rebuilds_the_index() {
  let f = Fixture::new();
  let index = f.index();
  index.db.execute("INSERT INTO ui_state (k, v) VALUES ('viewport', '{}')", []).unwrap();
  index.db.pragma_update(None, "user_version", 0).unwrap();
  drop(index);
  let index = f.index();
  let rows: i64 = index.db.query_row("SELECT count(*) FROM ui_state", [], |r| r.get(0)).unwrap();
  let version: i32 = index.db.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
  assert_eq!((rows, version), (0, crate::index::VERSION));
}

#[test]
fn viewport_returns_absolute_positions_through_nested_zones() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/zones/Z1.json", &zone(None, 1000.0, 0.0, 800.0, 600.0));
  f.write(".canvas/zones/Z2.json", &zone(Some("Z1"), 100.0, 100.0, 400.0, 300.0));
  f.write(".canvas/cards/C1.json", &card(Some("Z2"), 10.0, 20.0, Some("N1")));
  f.write(".canvas/cards/C2.json", &card(None, 0.0, 0.0, None));
  f.write("notes/n.md", "---\nid: N1\n---\nHello\nworld");
  scan(&f.vault, &index).unwrap();

  let all = index.viewport(WORLD, 0.0, None).unwrap();
  assert_eq!(all.zones.iter().map(|z| (z.id.as_str(), z.x, z.y)).collect::<Vec<_>>(), [("Z1", 1000.0, 0.0), ("Z2", 1100.0, 100.0)]);
  let c1 = all.cards.iter().find(|c| c.id == "C1").unwrap();
  assert_eq!((c1.x, c1.y, c1.title.as_deref(), c1.resolved), (1110.0, 120.0, Some("Hello"), true));
  let c2 = all.cards.iter().find(|c| c.id == "C2").unwrap();
  assert_eq!((c2.note.as_deref(), c2.resolved), (None, false));

  let left = index.viewport(Rect { min_x: -10.0, min_y: -10.0, max_x: 200.0, max_y: 200.0 }, 0.0, None).unwrap();
  assert_eq!(left.cards.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["C2"]);
  assert!(left.zones.is_empty());
  let tiny = index.viewport(WORLD, 500.0, None).unwrap();
  assert_eq!(tiny.zones.len(), 1);
  assert!(tiny.cards.is_empty());
}

#[test]
fn collapsed_viewport_leaves_out_everything_inside_zones() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/zones/Z1.json", &zone(None, 1000.0, 0.0, 800.0, 600.0));
  f.write(".canvas/zones/Z2.json", &zone(Some("Z1"), 100.0, 100.0, 400.0, 300.0));
  f.write(".canvas/cards/IN1.json", &card(Some("Z1"), 600.0, 20.0, None));
  f.write(".canvas/cards/IN2.json", &card(Some("Z2"), 10.0, 20.0, None));
  f.write(".canvas/cards/L1.json", &card(None, 0.0, 0.0, None));
  f.write(".canvas/cards/L2.json", &card(None, 0.0, 300.0, None));
  f.write(".canvas/edges/E1.json", r#"{ "from": "L1", "to": "L2" }"#);
  f.write(".canvas/edges/E2.json", r#"{ "from": "L1", "to": "IN2" }"#);
  scan(&f.vault, &index).unwrap();
  let ids = |cell| {
    let v = index.viewport(WORLD, 0.0, cell).unwrap();
    let sorted = |mut ids: Vec<String>| {
      ids.sort();
      ids
    };
    [
      v.zones.into_iter().map(|z| z.id).collect(),
      sorted(v.cards.into_iter().map(|c| c.id).collect()),
      sorted(v.edges.into_iter().map(|e| e.id).collect()),
    ]
  };

  // Zoomed out: the outer zone alone. Loose cards and edges come back as clusters and bundles.
  assert_eq!(ids(Some(1000.0)), [vec!["Z1"], vec![], vec![]]);
  // Zoomed back in: everything inside the zones again.
  assert_eq!(ids(None), [vec!["Z1", "Z2"], vec!["IN1", "IN2", "L1", "L2"], vec!["E1", "E2"]]);
}

#[test]
fn card_pointing_at_a_missing_note_is_unresolved() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/cards/C1.json", &card(None, 0.0, 0.0, Some("GONE")));
  scan(&f.vault, &index).unwrap();
  let cards = index.viewport(WORLD, 0.0, None).unwrap().cards;
  assert_eq!((cards[0].note.as_deref(), cards[0].resolved), (Some("GONE"), false));
}

#[test]
fn zone_around_picks_the_innermost_zone_containing_the_whole_rectangle() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/zones/Z1.json", &zone(None, 0.0, 0.0, 1000.0, 1000.0));
  f.write(".canvas/zones/Z2.json", &zone(Some("Z1"), 100.0, 100.0, 200.0, 200.0));
  scan(&f.vault, &index).unwrap();
  let point = |x, y| Rect { min_x: x, min_y: y, max_x: x, max_y: y };
  assert_eq!(index.zone_around(point(150.0, 150.0), &[]).unwrap(), (Some("Z2".into()), 100.0, 100.0));
  assert_eq!(index.zone_around(point(500.0, 500.0), &[]).unwrap(), (Some("Z1".into()), 0.0, 0.0));
  assert_eq!(index.zone_around(point(-5.0, 0.0), &[]).unwrap(), (None, 0.0, 0.0));
  // Overlapping Z2's edge: only Z1 holds all of it.
  let wide = Rect { min_x: 150.0, min_y: 150.0, max_x: 350.0, max_y: 200.0 };
  assert_eq!(index.zone_around(wide, &[]).unwrap().0.as_deref(), Some("Z1"));
  // Skipping Z1 skips what is inside it too.
  assert_eq!(index.zone_around(point(150.0, 150.0), &["Z1"]).unwrap().0, None);
}

#[test]
fn edge_bounds_cover_both_cards() {
  let f = Fixture::new();
  let index = f.index();
  f.write(".canvas/cards/A.json", &card(None, 0.0, 0.0, None));
  f.write(".canvas/cards/B.json", &card(None, 400.0, 300.0, None));
  f.write(".canvas/edges/E.json", r#"{ "from": "A", "to": "B" }"#);
  scan(&f.vault, &index).unwrap();
  let b: (f64, f64, f64, f64) = index
    .db
    .query_row("SELECT min_x, max_x, min_y, max_y FROM edge_bounds", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
    .unwrap();
  assert_eq!(b, (0.0, 500.0, 0.0, 350.0));
}
