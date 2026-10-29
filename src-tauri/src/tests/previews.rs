//! Zoomed out, a collapsed zone's preview: its cards by color and its inner zones, at any depth.

use super::{move_to, open, put_card, put_zone, Fixture, WORLD};
use crate::index::{Rect, Viewport};
use crate::session::Session;

type Boxes = Vec<[f64; 4]>;
/// A preview as (zone, cards by color with "stock" for none, inner zones), boxes as [x, y, w, h].
type Shown = (String, Vec<(String, Boxes)>, Boxes);

fn previews(v: &Viewport) -> Vec<Shown> {
  let preview = v.previews.iter().map(|p| {
    let tints = p.cards.iter().map(|t| (t.color.clone().unwrap_or("stock".into()), t.boxes.iter().map(|f| [f.x, f.y, f.w, f.h]).collect()));
    (p.zone.clone(), tints.collect(), p.zones.iter().map(|f| [f.x, f.y, f.w, f.h]).collect())
  });
  preview.collect()
}

fn colored(f: &Fixture, id: &str, zone: &str, x: f64, y: f64, color: &str) {
  let card = serde_json::json!({ "note": null, "zone": zone, "x": x, "y": y, "w": 100, "h": 50, "color": color });
  f.write(&format!(".canvas/cards/{id}.json"), &card.to_string());
}

/// Z1 holds A (yellow) and B, an inner zone Z1a holding C (blue), and in it Z1b holding D. Z2 is
/// empty; L is loose.
fn nested() -> (Fixture, Session) {
  let f = Fixture::new();
  put_zone(&f, "Z1", None, 1000.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "Z1a", Some("Z1"), 100.0, 500.0, 400.0, 300.0);
  put_zone(&f, "Z1b", Some("Z1a"), 10.0, 100.0, 200.0, 150.0);
  put_zone(&f, "Z2", None, 3000.0, 0.0, 500.0, 500.0);
  colored(&f, "A", "Z1", 50.0, 60.0, "#f5d76e");
  put_card(&f, "B", Some("Z1"), 300.0, 60.0);
  colored(&f, "C", "Z1a", 20.0, 20.0, "#6fa8dc");
  put_card(&f, "D", Some("Z1b"), 5.0, 5.0);
  put_card(&f, "L", None, -500.0, 0.0);
  let s = open(&f);
  (f, s)
}

#[test]
fn a_collapsed_zone_previews_its_cards_by_color_and_its_inner_zones_at_any_depth() {
  let (_f, s) = nested();
  let v = s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap();
  let stock = ("stock".to_string(), vec![[300.0, 60.0, 100.0, 50.0], [115.0, 605.0, 100.0, 50.0]]);
  let blue = ("#6fa8dc".to_string(), vec![[120.0, 520.0, 100.0, 50.0]]);
  let yellow = ("#f5d76e".to_string(), vec![[50.0, 60.0, 100.0, 50.0]]);
  let inner = vec![[100.0, 500.0, 400.0, 300.0], [110.0, 600.0, 200.0, 150.0]];
  assert_eq!(previews(&v), [("Z1".to_string(), vec![stock, blue, yellow], inner)], "an empty zone has none; loose cards are clusters");
  assert!(s.index.viewport(WORLD, 0.0, None).unwrap().previews.is_empty(), "open zones show their cards themselves");
}

#[test]
fn a_preview_holds_what_meets_the_area_and_is_large_enough() {
  let (_f, s) = nested();
  let corner = Rect { min_x: 1000.0, min_y: 0.0, max_x: 1250.0, max_y: 200.0 };
  let v = s.index.viewport(corner, 0.0, Some(1024.0)).unwrap();
  assert_eq!(previews(&v), [("Z1".to_string(), vec![("#f5d76e".to_string(), vec![[50.0, 60.0, 100.0, 50.0]])], vec![])]);
  // Far out, cards smaller than a few pixels on screen are left out, bigger zones stay.
  let v = s.index.viewport(WORLD, 120.0, Some(4096.0)).unwrap();
  assert_eq!(previews(&v), [("Z1".to_string(), vec![], vec![[100.0, 500.0, 400.0, 300.0], [110.0, 600.0, 200.0, 150.0]])]);
}

#[test]
fn a_preview_moves_with_its_zone_and_follows_its_cards() {
  let (_f, s) = nested();
  let before = previews(&s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap());
  s.move_zones(&[move_to("Z1", 5000.0, 2000.0)]).unwrap();
  assert_eq!(previews(&s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap()), before, "in the zone's coordinates");
  // A card moved out of the zone leaves its preview; one moved within it moves in it.
  s.move_cards(&[move_to("A", 0.0, 0.0), move_to("B", 5100.0, 2100.0)]).unwrap();
  let after = previews(&s.index.viewport(WORLD, 0.0, Some(1024.0)).unwrap());
  assert_eq!(after[0].1, [("stock".to_string(), vec![[100.0, 100.0, 100.0, 50.0], [115.0, 605.0, 100.0, 50.0]]), ("#6fa8dc".to_string(), vec![[120.0, 520.0, 100.0, 50.0]])]);
}
