use super::{card_file, files, names, open, put_card, put_zone, Fixture, WORLD};
use crate::batch::{BatchCard, BatchEdge};
use crate::items::{self, Arrow, Edge, HAlign, Kind, Stroke, VAlign, Zone};
use crate::note::NoteText;
use crate::session::Session;
use std::collections::BTreeMap;

/// Batch cards the size of a placed card, at world positions.
fn cards(at: &[(&str, f64, f64)]) -> Vec<BatchCard> {
  at.iter().map(|&(text, x, y)| BatchCard { text: text.into(), x, y, w: 240.0, h: 140.0 }).collect()
}

/// A solid edge between two batch cards, with its arrow at `to`.
fn edge(from: usize, to: usize) -> BatchEdge {
  BatchEdge { from, to, arrow: Arrow::To, stroke: Stroke::Solid }
}

fn zone(f: &Fixture, id: &str) -> Zone {
  items::read(&items::path(&f.vault, Kind::Zone, id)).unwrap()
}

/// Every card's absolute position, from the viewport query.
fn positions(s: &Session) -> BTreeMap<String, (f64, f64)> {
  s.index.viewport(WORLD, 0.0, None).unwrap().cards.into_iter().map(|c| (c.id, (c.x, c.y))).collect()
}

#[test]
fn a_batch_writes_a_note_and_a_centered_card_for_each_text_and_its_edges_in_one_step() {
  let f = Fixture::new();
  let s = open(&f);
  let texts = ["Competitor scan", "Price tiers", "Customer interviews", "Pricing risks", "Open questions"];
  let at = [(0.0, 90.0), (320.0, 180.0), (640.0, 180.0), (320.0, 0.0), (0.0, 270.0)];
  let given: Vec<_> = texts.iter().zip(at).map(|(t, (x, y))| (*t, x, y)).collect();
  let batch = s.create_batch(400.0, 200.0, &cards(&given), &[edge(0, 1), edge(1, 2), edge(0, 3)]).unwrap();

  assert_eq!(batch.cards.len(), 5);
  let mut stems: Vec<String> = texts.iter().map(|t| format!("{t}.md")).collect();
  stems.sort();
  assert_eq!(names(&f.vault.notes_dir()), stems);
  for ((id, text), (x, y)) in batch.cards.iter().zip(texts).zip(at) {
    let card = card_file(&f, id);
    assert_eq!((card.zone, card.x, card.y, card.w, card.h), (None, x, y, 240.0, 140.0));
    assert_eq!((card.halign, card.valign), (HAlign::Center, VAlign::Center));
    let note = NoteText::read(&f.dir.path().join(format!("notes/{text}.md"))).unwrap();
    assert_eq!((note.id(), note.body.as_str()), (card.note, text));
  }
  let edges: Vec<(String, String)> = names(&items::dir(&f.vault, Kind::Edge))
    .iter()
    .map(|n| items::read::<Edge>(&items::dir(&f.vault, Kind::Edge).join(n)).unwrap())
    .map(|e| (e.from, e.to))
    .collect();
  let c = &batch.cards;
  for pair in [(&c[0], &c[1]), (&c[1], &c[2]), (&c[0], &c[3])] {
    assert!(edges.contains(&(pair.0.clone(), pair.1.clone())), "edge {pair:?}");
  }
  assert_eq!(edges.len(), 3);

  // One undo step takes the cards and edges away; the notes stay, unplaced. Redo brings them back.
  let after = files(&f);
  let redo = s.apply(batch.undo).unwrap();
  assert!(files(&f).is_empty());
  assert_eq!(s.index.unplaced(0, 50).unwrap().len(), 5);
  s.apply(redo).unwrap();
  assert_eq!(files(&f), after);
  assert!(s.index.unplaced(0, 50).unwrap().is_empty());
  assert_eq!(s.index.viewport(WORLD, 0.0, None).unwrap().edges.len(), 3);
}

#[test]
fn a_batch_run_inside_a_zone_joins_it_and_grows_it_with_its_contents_in_place() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 1000.0, 0.0, 400.0, 300.0);
  put_card(&f, "C", Some("Z"), 20.0, 60.0);
  let s = open(&f);
  let (before, at, original) = (files(&f), positions(&s), zone(&f, "Z"));

  // Run at (1100, 100), inside Z: the cards overhang it to the left, top and right.
  let batch = s.create_batch(1100.0, 100.0, &cards(&[("A", 900.0, 30.0), ("B", 1220.0, 30.0)]), &[edge(0, 1)]).unwrap();
  let z = zone(&f, "Z");
  assert_eq!((z.x, z.y, z.w, z.h), (880.0, -30.0, 600.0, 330.0), "20 around the cards, 60 above them for the name");
  let mut expected = at.clone();
  expected.insert(batch.cards[0].clone(), (900.0, 30.0));
  expected.insert(batch.cards[1].clone(), (1220.0, 30.0));
  assert_eq!(positions(&s), expected, "what Z held stays in place");
  let a = card_file(&f, &batch.cards[0]);
  assert_eq!((a.zone.as_deref(), a.x, a.y), (Some("Z"), 20.0, 60.0));

  // Undo gives the zone and its card back as they were.
  s.apply(batch.undo).unwrap();
  assert_eq!(files(&f), before);

  // A batch that fits leaves the zone alone.
  let batch = s.create_batch(1200.0, 200.0, &cards(&[("Small", 1100.0, 80.0)]), &[]).unwrap();
  assert_eq!(zone(&f, "Z"), original);
  assert_eq!(card_file(&f, &batch.cards[0]).zone.as_deref(), Some("Z"));
}

#[test]
fn a_batch_keeps_one_edge_between_two_cards_and_refuses_what_it_cannot_write() {
  let f = Fixture::new();
  let s = open(&f);
  let two = cards(&[("A", 0.0, 0.0), ("B", 320.0, 0.0)]);
  let blank = cards(&[("A", 0.0, 0.0), (" ", 0.0, 0.0)]);
  for (batch, edges) in [(&two, vec![edge(0, 0)]), (&two, vec![edge(0, 2)]), (&blank, vec![])] {
    assert!(s.create_batch(0.0, 0.0, batch, &edges).is_err());
  }
  assert!(names(&f.vault.notes_dir()).is_empty(), "nothing is written for a refused batch");

  // The first of the edges between two cards wins, with its arrowheads and line.
  let first = BatchEdge { from: 1, to: 0, arrow: Arrow::Both, stroke: Stroke::Dashed };
  let batch = s.create_batch(0.0, 0.0, &two, &[first, edge(0, 1), edge(1, 0)]).unwrap();
  let edges = names(&items::dir(&f.vault, Kind::Edge));
  assert_eq!(edges.len(), 1);
  let e: Edge = items::read(&items::dir(&f.vault, Kind::Edge).join(&edges[0])).unwrap();
  assert_eq!((e.from, e.to, e.arrow, e.stroke), (batch.cards[1].clone(), batch.cards[0].clone(), Arrow::Both, Stroke::Dashed));
}
