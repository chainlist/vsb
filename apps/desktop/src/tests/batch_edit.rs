use super::{files, open, put_zone, Fixture};
use crate::batch::BatchCard;
use crate::batch_edit::{End, Link, LinkPlan};
use crate::items::{self, Arrow, Edge, EdgeStyle, Kind, Shape, Stroke};
use serde_json::json;

/// A card at (x, y) in `zone`, showing a note titled `title`, or empty for None.
fn card(f: &Fixture, id: &str, zone: Option<&str>, x: f64, y: f64, title: Option<&str>) {
  let note = title.map(|t| {
    f.write(&format!("notes/{id}.md"), &format!("---\nid: N{id}\n---\n{t}\nMore lines."));
    format!("N{id}")
  });
  f.write(&format!(".canvas/cards/{id}.json"), &json!({ "note": note, "zone": zone, "x": x, "y": y, "w": 200, "h": 100 }).to_string());
}

fn edge_file(f: &Fixture, id: &str, value: serde_json::Value) {
  f.write(&format!(".canvas/edges/{id}.json"), &value.to_string());
}

fn read_edge(f: &Fixture, id: &str) -> Edge {
  items::read(&items::path(&f.vault, Kind::Edge, id)).unwrap()
}

fn link(from: End, to: End, arrow: Arrow, stroke: Stroke) -> Link {
  Link { from, to, arrow, stroke }
}

fn at(id: &str) -> End {
  End::Card(id.into())
}

/// Cards A, B, C and D on the canvas, X too, and their edges: A to B labeled and angled, B and C
/// with no heads and dashed, C and A both ways and dotted, A to X.
fn linked() -> Fixture {
  let f = Fixture::new();
  for (i, id) in ["A", "B", "C", "D", "X"].iter().enumerate() {
    card(&f, id, None, i as f64 * 300.0, 0.0, Some(id));
  }
  edge_file(&f, "E1", json!({ "from": "A", "to": "B", "label": "needs", "shape": "angled" }));
  edge_file(&f, "E2", json!({ "from": "B", "to": "C", "arrow": "none", "stroke": "dashed" }));
  edge_file(&f, "E3", json!({ "from": "C", "to": "A", "arrow": "both", "stroke": "dotted" }));
  edge_file(&f, "E4", json!({ "from": "A", "to": "X" }));
  f
}

const SCOPE: [&str; 4] = ["A", "B", "C", "D"];

fn scope() -> Vec<String> {
  SCOPE.iter().map(|s| s.to_string()).collect()
}

/// The links the builder writes for `linked`: a dashed line without heads is written solid, and a
/// line with heads at both ends either way round.
fn as_written() -> Vec<Link> {
  vec![
    link(at("A"), at("B"), Arrow::To, Stroke::Solid),
    link(at("B"), at("C"), Arrow::None, Stroke::Solid),
    link(at("A"), at("C"), Arrow::Both, Stroke::Dotted),
  ]
}

#[test]
fn the_builder_opens_with_a_zone_at_any_depth_by_title_or_with_the_selected_cards() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 2000.0, 2000.0);
  put_zone(&f, "Z2", Some("Z"), 100.0, 100.0, 800.0, 800.0);
  card(&f, "A", Some("Z"), 1000.0, 100.0, Some("Alpha"));
  card(&f, "B", Some("Z2"), 10.0, 10.0, Some("Beta"));
  card(&f, "E", Some("Z"), 1500.0, 1500.0, None);
  card(&f, "X", None, 0.0, -500.0, Some("Xeno"));
  edge_file(&f, "AB", json!({ "from": "A", "to": "B" }));
  edge_file(&f, "AX", json!({ "from": "A", "to": "X" }));
  edge_file(&f, "BE", json!({ "from": "B", "to": "E" }));
  let s = open(&f);

  // The cards inside, nested ones included, top to bottom; an empty card cannot be written.
  let zone = s.index.batch_scope(Some("Z"), &[]).unwrap();
  let cards: Vec<_> = zone.cards.iter().map(|c| (c.id.as_str(), c.title.as_str(), c.x, c.y)).collect();
  assert_eq!(cards, [("A", "Alpha", 1000.0, 100.0), ("B", "Beta", 110.0, 110.0)]);
  assert_eq!(zone.edges.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), ["AB"]);
  assert_eq!(zone.zone.as_deref(), Some("Z"));

  // Selected cards bring every card an edge joins to them, and the edges between them all. New
  // cards join the zone the selected cards share, not the joined cards', or the canvas.
  let ids = |ids: &[&str]| ids.iter().map(|s| s.to_string()).collect::<Vec<_>>();
  let one = s.index.batch_scope(None, &ids(&["X"])).unwrap();
  assert_eq!(one.cards.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["X", "A"]);
  assert_eq!(one.edges.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), ["AX"]);
  assert_eq!(one.zone, None);
  assert_eq!(s.index.batch_scope(None, &ids(&["B"])).unwrap().zone.as_deref(), Some("Z2"));
  assert_eq!(s.index.batch_scope(None, &ids(&["A", "B"])).unwrap().zone, None);
  let picked = s.index.batch_scope(None, &ids(&["B", "E"])).unwrap();
  assert_eq!(picked.cards.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["A", "B"]);
  assert_eq!(picked.edges.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), ["AB"]);
}

#[test]
fn a_text_left_as_written_changes_nothing() {
  let f = linked();
  let s = open(&f);
  assert_eq!(s.plan_links(&scope(), &as_written()).unwrap(), LinkPlan::default());
  let before = files(&f);
  let batch = s.edit_batch(None, &scope(), &[], &as_written()).unwrap();
  assert!(batch.undo.is_empty());
  assert_eq!(files(&f), before);
}

#[test]
fn the_text_removes_restyles_and_creates_edges_and_adds_cards_in_one_step() {
  let f = linked();
  let s = open(&f);
  let links = vec![
    // A to B turned around: restyled, keeping its label and shape.
    link(at("B"), at("A"), Arrow::To, Stroke::Solid),
    // B and C dropped: removed. C and A as written: kept.
    link(at("C"), at("A"), Arrow::Both, Stroke::Dotted),
    // Between cards no edge joins yet, and to a new card.
    link(at("A"), at("D"), Arrow::To, Stroke::Dashed),
    link(at("C"), End::New(0), Arrow::To, Stroke::Double),
  ];
  let plan = s.plan_links(&scope(), &links).unwrap();
  assert_eq!(plan, LinkPlan { removed: vec!["E2".into()], restyled: vec![("E1".into(), 0)], created: vec![2, 3] });

  let before = files(&f);
  let delta = BatchCard { text: "Delta".into(), x: 900.0, y: 300.0, w: 240.0, h: 140.0 };
  let batch = s.edit_batch(None, &scope(), &[delta], &links).unwrap();
  let e1 = read_edge(&f, "E1");
  assert_eq!((e1.from.as_str(), e1.to.as_str(), e1.label.as_deref(), e1.shape), ("B", "A", Some("needs"), Shape::Angled));
  assert!(!f.exists(".canvas/edges/E2.json"));
  assert_eq!(files(&f)["edges/E3.json"], before["edges/E3.json"]);
  // An edge to a card the builder did not open with is left alone.
  assert_eq!(files(&f)["edges/E4.json"], before["edges/E4.json"]);
  let new: Vec<Edge> = files(&f).into_iter().filter(|(k, _)| k.starts_with("edges/") && !before.contains_key(k)).map(|(_, v)| serde_json::from_value(v).unwrap()).collect();
  let delta = &batch.cards[0];
  assert!(new.iter().any(|e| (e.from.as_str(), e.to.as_str(), e.stroke) == ("A", "D", Stroke::Dashed)));
  assert!(new.iter().any(|e| (e.from.as_str(), e.to.as_str(), e.stroke) == ("C", delta.as_str(), Stroke::Double)));
  assert_eq!(new.len(), 2);

  // One undo step puts every edge back; the new note stays, unplaced.
  s.apply(batch.undo).unwrap();
  assert_eq!(files(&f), before);
}

#[test]
fn a_new_edge_takes_the_vaults_shape_and_the_texts_heads_and_line() {
  let f = linked();
  f.vault.set_edge_style(EdgeStyle { shape: Shape::Straight, arrow: Arrow::None, stroke: Stroke::Dotted }).unwrap();
  let s = open(&f);
  let mut links = as_written();
  links.push(link(at("A"), at("D"), Arrow::To, Stroke::Solid));
  let before = files(&f);
  s.edit_batch(None, &scope(), &[], &links).unwrap();
  let new: Vec<Edge> = files(&f).into_iter().filter(|(k, _)| k.starts_with("edges/") && !before.contains_key(k)).map(|(_, v)| serde_json::from_value(v).unwrap()).collect();
  assert_eq!(new.len(), 1);
  assert_eq!((new[0].shape, new[0].arrow, new[0].stroke), (Shape::Straight, Arrow::To, Stroke::Solid));
  assert_eq!(read_edge(&f, "E1").shape, Shape::Angled, "an edge the text keeps keeps its shape");
}

#[test]
fn links_join_two_different_cards_of_the_batch() {
  let f = linked();
  let s = open(&f);
  let outside = link(at("A"), at("X"), Arrow::To, Stroke::Solid);
  let missing = link(at("A"), End::New(1), Arrow::To, Stroke::Solid);
  let itself = link(at("A"), at("A"), Arrow::To, Stroke::Solid);
  for bad in [outside, missing, itself] {
    assert!(s.edit_batch(None, &scope(), &[], &[bad]).is_err());
  }
}
