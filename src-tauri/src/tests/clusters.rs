use super::{put_card, put_zone, Fixture, WORLD};
use crate::index::{Index, Rect, Viewport};
use crate::scan::scan;

/// Each cluster as (column, row, count, box), in order.
fn clusters(v: &Viewport) -> Vec<(i64, i64, i64, [f64; 4])> {
  let mut out: Vec<_> = v.clusters.iter().map(|c| (c.cell[0], c.cell[1], c.count, [c.x, c.y, c.w, c.h])).collect();
  out.sort_by_key(|c| (c.0, c.1));
  out
}

/// Each bundle as (from, to, count, arrow), an end named by its zone or, for a cluster, its box's corner.
fn bundles(v: &Viewport) -> Vec<(String, String, i64, String)> {
  let named = v.bundles.iter().map(|b| {
    let [from, to] = b.ends.each_ref().map(|e| e.zone.clone().unwrap_or_else(|| format!("({}, {})", e.x, e.y)));
    (from, to, b.count, b.arrow.clone())
  });
  named.collect()
}

fn zoomed_out(index: &Index, rect: Rect, cell: f64) -> Viewport {
  index.viewport(rect, 0.0, Some(cell)).unwrap()
}

#[test]
fn loose_cards_are_counted_per_cell_never_returned() {
  let f = Fixture::new();
  let index = f.index();
  // Cards are 100 by 50: these have their centers at (-10, -10), (10, 10), (0, 0) and (-210, 0).
  put_card(&f, "A", None, -60.0, -35.0);
  put_card(&f, "B", None, -40.0, -15.0);
  put_card(&f, "C", None, -50.0, -25.0);
  put_card(&f, "D", None, -260.0, -25.0);
  // A card whose zone is missing sits on the canvas; a card in a zone is not loose.
  put_card(&f, "E", Some("GONE"), 300.0, 0.0);
  put_zone(&f, "Z", None, 1000.0, 1000.0, 400.0, 400.0);
  put_card(&f, "IN", Some("Z"), 10.0, 10.0);
  scan(&f.vault, &index).unwrap();

  let v = zoomed_out(&index, WORLD, 100.0);
  // Rounding toward zero would put A with B and C: the cells on either side of 0 are distinct.
  assert_eq!(
    clusters(&v),
    [
      (-3, 0, 1, [-260.0, -25.0, 100.0, 50.0]),
      (-1, -1, 1, [-60.0, -35.0, 100.0, 50.0]),
      (0, 0, 2, [-50.0, -25.0, 110.0, 60.0]),
      (3, 0, 1, [300.0, 0.0, 100.0, 50.0]),
    ]
  );
  assert!(v.cards.is_empty() && v.edges.is_empty());
  assert_eq!(v.zones.iter().map(|z| z.id.as_str()).collect::<Vec<_>>(), ["Z"]);
}

#[test]
fn a_cell_touched_by_the_rectangle_comes_back_with_all_its_cards() {
  let f = Fixture::new();
  let index = f.index();
  // Centers at (-90, -90) and (-10, -10), in cell (-1, -1); and (110, 10), in cell (1, 0).
  put_card(&f, "A", None, -140.0, -115.0);
  put_card(&f, "B", None, -60.0, -35.0);
  put_card(&f, "C", None, 60.0, -15.0);
  scan(&f.vault, &index).unwrap();

  let corner = Rect { min_x: -5.0, min_y: -5.0, max_x: -1.0, max_y: -1.0 };
  assert_eq!(clusters(&zoomed_out(&index, corner, 100.0)), [(-1, -1, 2, [-140.0, -115.0, 180.0, 130.0])]);
  // A card counts in the cell holding its center only: B and C overlap cell (0, 0), their centers do not.
  let middle = Rect { min_x: 1.0, min_y: 1.0, max_x: 99.0, max_y: 99.0 };
  assert!(clusters(&zoomed_out(&index, middle, 100.0)).is_empty());
}

#[test]
fn edges_are_bundled_per_pair_of_outermost_zones() {
  let f = Fixture::new();
  let index = f.index();
  put_zone(&f, "Z1", None, 0.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "Z1a", Some("Z1"), 100.0, 100.0, 500.0, 500.0);
  put_zone(&f, "Z2", None, 2000.0, 0.0, 1000.0, 1000.0);
  put_zone(&f, "Z3", None, 0.0, 2000.0, 1000.0, 1000.0);
  put_card(&f, "A", Some("Z1"), 700.0, 700.0);
  put_card(&f, "B", Some("Z1a"), 10.0, 10.0);
  put_card(&f, "C", Some("Z2"), 10.0, 10.0);
  put_card(&f, "D", Some("Z2"), 300.0, 300.0);
  put_card(&f, "E", Some("Z3"), 10.0, 10.0);
  // Z1 and Z2: edges both ways. B is in a zone inside Z1, so it counts for Z1.
  f.write(".canvas/edges/E1.json", r#"{ "from": "A", "to": "C" }"#);
  f.write(".canvas/edges/E2.json", r#"{ "from": "B", "to": "D" }"#);
  f.write(".canvas/edges/E3.json", r#"{ "from": "D", "to": "A" }"#);
  // Z3 to Z1: the lone arrowhead stays at Z1, the second end.
  f.write(".canvas/edges/E4.json", r#"{ "from": "E", "to": "A" }"#);
  // Z2 and Z3, with no arrowhead.
  f.write(".canvas/edges/E5.json", r#"{ "from": "C", "to": "E", "arrow": "none" }"#);
  // Inside Z1: left out.
  f.write(".canvas/edges/E6.json", r#"{ "from": "A", "to": "B" }"#);
  scan(&f.vault, &index).unwrap();

  let v = zoomed_out(&index, WORLD, 1000.0);
  let pair = |a: &str, b: &str, n, arrow: &str| (a.to_string(), b.to_string(), n, arrow.to_string());
  assert_eq!(bundles(&v), [pair("Z1", "Z2", 3, "both"), pair("Z3", "Z1", 1, "to"), pair("Z2", "Z3", 1, "none")]);
  let z1 = &v.bundles[0].ends[0];
  assert_eq!([z1.x, z1.y, z1.w, z1.h], [0.0, 0.0, 1000.0, 1000.0]);
  assert!(v.edges.is_empty());
}

#[test]
fn a_loose_cards_edges_attach_to_its_cluster() {
  let f = Fixture::new();
  let index = f.index();
  put_zone(&f, "Z", None, 0.0, 0.0, 1000.0, 1000.0);
  put_card(&f, "A", Some("Z"), 100.0, 100.0);
  // L1 and L2 are in cell (-1, 0), L3 in cell (-3, 0).
  put_card(&f, "L1", None, -500.0, 100.0);
  put_card(&f, "L2", None, -800.0, 300.0);
  put_card(&f, "L3", None, -3000.0, 0.0);
  f.write(".canvas/edges/E1.json", r#"{ "from": "L1", "to": "A" }"#);
  f.write(".canvas/edges/E2.json", r#"{ "from": "L2", "to": "A" }"#);
  f.write(".canvas/edges/E3.json", r#"{ "from": "L1", "to": "L3" }"#);
  // Inside one cluster: left out.
  f.write(".canvas/edges/E4.json", r#"{ "from": "L1", "to": "L2" }"#);
  scan(&f.vault, &index).unwrap();

  let v = zoomed_out(&index, WORLD, 1000.0);
  let pair = |a: &str, b: &str, n, arrow: &str| (a.to_string(), b.to_string(), n, arrow.to_string());
  assert_eq!(bundles(&v), [pair("(-800, 100)", "Z", 2, "to"), pair("(-800, 100)", "(-3000, 0)", 1, "to")]);
  // The end is the whole cluster's box, the one its marker is drawn from.
  let end = &v.bundles[0].ends[0];
  assert_eq!([end.x, end.y, end.w, end.h], [-800.0, 100.0, 400.0, 250.0]);
  assert_eq!(clusters(&v)[1], (-1, 0, 2, [-800.0, 100.0, 400.0, 250.0]));

  // Looking at the zone alone, the cluster is off-screen and still its whole self.
  let zone = Rect { min_x: 0.0, min_y: 0.0, max_x: 1000.0, max_y: 1000.0 };
  let v = zoomed_out(&index, zone, 1000.0);
  assert_eq!(bundles(&v), [pair("(-800, 100)", "Z", 2, "to")]);
  let end = &v.bundles[0].ends[0];
  assert_eq!([end.x, end.y, end.w, end.h], [-800.0, 100.0, 400.0, 250.0]);
}
