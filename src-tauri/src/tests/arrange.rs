use super::{card_file, files, move_to, open, put_card, put_zone, Fixture};
use crate::items::{self, Kind, Zone};

#[test]
fn arranged_cards_stay_in_their_zone_which_grows_to_hold_them() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 100.0, 100.0, 500.0, 400.0);
  put_card(&f, "A", Some("Z"), 20.0, 60.0);
  put_card(&f, "B", Some("Z"), 20.0, 200.0);
  put_card(&f, "C", None, -400.0, 0.0);
  let s = open(&f);
  let before = files(&f);

  // A goes past the zone's right side and B above its top; C stays on the canvas.
  let undo = s.arrange(&[move_to("A", 700.0, 160.0), move_to("B", 300.0, 40.0), move_to("C", -500.0, 20.0)], &[]).unwrap();
  let zone: Zone = items::read(&items::path(&f.vault, Kind::Zone, "Z")).unwrap();
  // Grown up to hold B with room for the name, and right to hold A with a square of room.
  assert_eq!((zone.x, zone.y, zone.w, zone.h), (100.0, -20.0, 720.0, 520.0));
  let (a, b, c) = (card_file(&f, "A"), card_file(&f, "B"), card_file(&f, "C"));
  assert_eq!((a.zone.as_deref(), a.x, a.y), (Some("Z"), 600.0, 180.0));
  assert_eq!((b.zone.as_deref(), b.x, b.y), (Some("Z"), 200.0, 60.0));
  assert_eq!((c.zone, c.x, c.y), (None, -500.0, 20.0));

  // One undo step.
  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn a_zone_arranges_its_cards_and_its_inner_zones_as_blocks() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 1000.0, 800.0);
  put_zone(&f, "Y", Some("Z"), 500.0, 100.0, 300.0, 300.0);
  put_zone(&f, "Y2", Some("Y"), 150.0, 150.0, 120.0, 120.0);
  put_card(&f, "A", Some("Z"), 20.0, 60.0);
  put_card(&f, "B", Some("Z"), 20.0, 300.0);
  put_card(&f, "C", Some("Y"), 20.0, 40.0);
  put_card(&f, "D", Some("Y2"), 10.0, 10.0);
  put_card(&f, "X", None, -500.0, 0.0);
  for (id, from, to) in [("AC", "A", "C"), ("DB", "D", "B"), ("CD", "C", "D"), ("AX", "A", "X")] {
    f.write(&format!(".canvas/edges/{id}.json"), &format!(r#"{{ "from": "{from}", "to": "{to}" }}"#));
  }
  let s = open(&f);

  // Its own cards and its inner zone Y; edges to cards inside Y, at any depth, join Y. An edge
  // within Y, and one to a card outside, are left out.
  let nodes = s.index.zone_nodes("Z").unwrap();
  let listed: Vec<_> = nodes.nodes.iter().map(|n| (n.id.as_str(), n.zone, n.x, n.y)).collect();
  assert_eq!(listed, [("A", false, 20.0, 60.0), ("B", false, 20.0, 300.0), ("Y", true, 500.0, 100.0)]);
  let edges: Vec<_> = nodes.edges.iter().map(|e| (e.from, e.to)).collect();
  assert_eq!(edges, [(0, 2), (2, 1)]);

  // Y moves as one block, above Z's top: Z grows, and what Y holds comes along.
  let before = files(&f);
  let undo = s.arrange(&[move_to("A", 0.0, 100.0), move_to("B", 700.0, 100.0)], &[move_to("Y", 300.0, -100.0)]).unwrap();
  let zone = |id: &str| -> Zone { items::read(&items::path(&f.vault, Kind::Zone, id)).unwrap() };
  let (z, y) = (zone("Z"), zone("Y"));
  assert_eq!((z.x, z.y, z.w, z.h), (-20.0, -160.0, 1020.0, 960.0));
  assert_eq!((y.parent.as_deref(), y.x, y.y), (Some("Z"), 320.0, 60.0));
  assert_eq!((card_file(&f, "A").x, card_file(&f, "A").y), (20.0, 260.0));
  for kept in ["cards/C.json", "cards/D.json", "zones/Y2.json"] {
    assert_eq!(files(&f)[kept], before[kept]);
  }
  s.apply(undo).unwrap();
  assert_eq!(files(&f), before);
}
