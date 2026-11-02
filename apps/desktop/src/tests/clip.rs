use super::{card_file, files, open, put_card, put_zone, Fixture, WORLD};
use crate::clip::Clip;
use crate::items::{self, CardKind, Edge, Kind, MapScale, MindmapView, Preview, Zone};
use crate::note::NoteText;
use crate::session::Session;
use serde_json::json;

fn zone(f: &Fixture, id: &str) -> Zone {
  items::read(&items::path(&f.vault, Kind::Zone, id)).unwrap()
}

/// Zone A on the canvas holding card c1, with text, and zone B, which holds card c2, whose note is
/// missing; card c3 loose beside it, card c4 below. Edges run from c1 to c2, c3 and c4.
fn scene(f: &Fixture) -> Session {
  put_zone(f, "A", None, 100.0, 100.0, 400.0, 300.0);
  put_zone(f, "B", Some("A"), 200.0, 40.0, 150.0, 150.0);
  put_card(f, "c1", Some("A"), 20.0, 60.0);
  let c2 = json!({ "note": "01ABSENT", "zone": "B", "x": 10.0, "y": 60.0, "w": 100.0, "h": 50.0, "color": "#f5d76e" });
  f.write(".canvas/cards/c2.json", &c2.to_string());
  put_card(f, "c3", None, 600.0, 100.0);
  put_card(f, "c4", None, 600.0, 600.0);
  let s = open(f);
  s.create_note_for_card("c1", "Alpha\nbody").unwrap();
  for to in ["c2", "c3", "c4"] {
    s.create_edge("c1", to).unwrap();
  }
  s
}

fn ids(of: &[impl AsRef<str>]) -> Vec<String> {
  of.iter().map(|s| s.as_ref().to_string()).collect()
}

fn copied(s: &Session) -> Clip {
  // c1 is named too, but it lies inside A and comes with it.
  s.copy_items(&ids(&["c3", "c1"]), &ids(&["A"]), &[]).unwrap()
}

#[test]
fn copying_gathers_zones_with_what_they_hold_and_the_edges_between_the_cards() {
  let f = Fixture::new();
  let s = scene(&f);
  let clip = copied(&s);

  assert_eq!((clip.x, clip.y, clip.w, clip.h), (100.0, 100.0, 600.0, 300.0));
  let zones: Vec<_> = clip.zones.iter().map(|z| (z.id.as_str(), z.item.parent.as_deref(), z.item.x, z.item.y)).collect();
  assert_eq!(zones, [("A", None, 0.0, 0.0), ("B", Some("A"), 200.0, 40.0)]);
  let mut cards: Vec<_> = clip.cards.iter().map(|c| (c.id.as_str(), c.zone.as_deref(), c.x, c.y, c.text.as_deref())).collect();
  cards.sort_by_key(|c| c.0);
  assert_eq!(cards, [("c1", Some("A"), 20.0, 60.0, Some("Alpha\nbody")), ("c2", Some("B"), 210.0, 100.0, None), ("c3", None, 500.0, 0.0, None)]);
  assert_eq!(clip.cards.iter().find(|c| c.id == "c2").unwrap().color.as_deref(), Some("#f5d76e"));
  let mut edges: Vec<_> = clip.edges.iter().map(|e| (e.from.as_str(), e.to.as_str())).collect();
  edges.sort();
  assert_eq!(edges, [("c1", "c2"), ("c1", "c3")]);
}

#[test]
fn a_paste_writes_new_items_new_notes_and_their_edges_in_one_step() {
  let f = Fixture::new();
  let s = scene(&f);
  let clip = copied(&s);
  let before = files(&f);
  let pasted = s.paste_items(&clip, 2000.0, 0.0).unwrap();

  // A and c3 were copied on their own; B, c1 and c2 come inside A.
  assert_eq!(pasted.ids.len(), 2);
  let a = pasted.ids.iter().find(|id| f.exists(&format!(".canvas/zones/{id}.json"))).unwrap();
  assert_eq!((zone(&f, a).parent, zone(&f, a).x, zone(&f, a).y, zone(&f, a).name.as_str()), (None, 2000.0, 0.0, "A"));
  let c3 = pasted.ids.iter().find(|id| *id != a).unwrap();
  assert_eq!((card_file(&f, c3).zone, card_file(&f, c3).x, card_file(&f, c3).y, card_file(&f, c3).note), (None, 2500.0, 0.0, None));

  let now = files(&f);
  let added: Vec<_> = now.keys().filter(|k| !before.contains_key(*k)).collect();
  assert_eq!(added.iter().filter(|k| k.starts_with("zones/")).count(), 2);
  assert_eq!(added.iter().filter(|k| k.starts_with("cards/")).count(), 3);
  assert_eq!(added.iter().filter(|k| k.starts_with("edges/")).count(), 2);
  let b = added.iter().map(|k| &now[*k]).find(|v| v["parent"] == json!(a)).unwrap();
  assert_eq!((b["name"].as_str(), b["x"].as_f64(), b["y"].as_f64()), (Some("B"), Some(200.0), Some(40.0)));

  // c1's copy gets a note of its own with the same text; c2's missing note leaves its copy empty.
  let note = NoteText::read(&f.dir.path().join("notes/Alpha 2.md")).unwrap();
  assert_eq!(note.body, "Alpha\nbody");
  let c1 = added.iter().map(|k| &now[*k]).find(|v| v["note"] == json!(note.id())).unwrap();
  assert_eq!((c1["zone"].as_str(), c1["x"].as_f64(), c1["y"].as_f64()), (Some(a.as_str()), Some(20.0), Some(60.0)));
  let c2 = added.iter().map(|k| &now[*k]).find(|v| v["color"] == json!("#f5d76e") && v["zone"] != json!("B")).unwrap();
  assert_eq!((&c2["note"], c2["x"].as_f64(), c2["y"].as_f64()), (&json!(null), Some(10.0), Some(60.0)));
  for key in added.iter().filter(|k| k.starts_with("edges/")) {
    let edge: Edge = serde_json::from_value(now[*key].clone()).unwrap();
    assert!(!["c1", "c2", "c3"].contains(&edge.from.as_str()) && !["c1", "c2", "c3", "c4"].contains(&edge.to.as_str()));
  }

  // One undo step takes it all away; the new note stays, unplaced.
  s.apply(pasted.undo).unwrap();
  assert_eq!(files(&f), before);
  assert!(f.exists("notes/Alpha 2.md"));
}

#[test]
fn a_paste_joins_the_zone_under_its_middle_which_grows_to_hold_it() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 300.0, 200.0);
  put_card(&f, "c", None, 1000.0, 1000.0);
  let s = open(&f);
  let clip = s.copy_items(&ids(&["c"]), &[], &[]).unwrap();
  let pasted = s.paste_items(&clip, 200.0, 120.0).unwrap();

  let card = card_file(&f, &pasted.ids[0]);
  assert_eq!((card.zone.as_deref(), card.x, card.y), (Some("Z"), 200.0, 120.0));
  // A graph-paper square clear of the card on the right.
  assert_eq!((zone(&f, "Z").w, zone(&f, "Z").h), (320.0, 200.0));
}

#[test]
fn a_copy_never_lands_inside_the_zone_it_copies() {
  let f = Fixture::new();
  put_zone(&f, "A", None, 0.0, 0.0, 400.0, 300.0);
  put_card(&f, "c", Some("A"), 20.0, 60.0);
  let s = open(&f);
  let clip = s.copy_items(&[], &ids(&["A"]), &[]).unwrap();
  // Its middle lies inside A.
  let pasted = s.paste_items(&clip, clip.x + 40.0, clip.y + 40.0).unwrap();

  let copy = zone(&f, &pasted.ids[0]);
  assert_eq!((copy.parent, copy.x, copy.y), (None, 40.0, 40.0));
  assert_eq!((zone(&f, "A").w, zone(&f, "A").h), (400.0, 300.0));
}

#[test]
fn drawings_copy_with_their_strokes() {
  let f = Fixture::new();
  let s = open(&f);
  let drawing = s.add_stroke(&[0.0, 0.0, 0.5, 30.0, 20.0, 0.5], Some("#f5d76e".into()), 8.0).unwrap().id;
  let clip = s.copy_items(&[], &[], std::slice::from_ref(&drawing)).unwrap();
  let pasted = s.paste_items(&clip, 500.0, 500.0).unwrap();

  let original: serde_json::Value = serde_json::from_str(&f.read(&format!(".canvas/drawings/{drawing}.json"))).unwrap();
  let copy: serde_json::Value = serde_json::from_str(&f.read(&format!(".canvas/drawings/{}.json", pasted.ids[0]))).unwrap();
  assert_eq!(copy["strokes"], original["strokes"]);
  assert_eq!((copy["x"].as_f64(), copy["y"].as_f64()), (Some(500.0), Some(500.0)));
}

#[test]
fn a_link_card_copies_with_its_link_and_preview_and_a_clip_brings_only_web_pages() {
  let f = Fixture::new();
  let preview = json!({ "title": "A", "description": "About A", "image": "attachments/links/example.com.png" });
  let card = json!({ "note": null, "zone": null, "x": 0.0, "y": 0.0, "w": 320.0, "h": 300.0, "link": "https://example.com/a", "preview": preview });
  f.write(".canvas/cards/l.json", &card.to_string());
  let s = open(&f);
  let view = s.index.viewport(WORLD, 0.0, None).unwrap().cards.into_iter().find(|c| c.id == "l").unwrap();
  assert_eq!((view.note, view.link.as_deref()), (None, Some("https://example.com/a")));
  let shown = Preview { title: Some("A".into()), description: Some("About A".into()), image: Some("attachments/links/example.com.png".into()) };
  assert_eq!(view.preview.as_ref(), Some(&shown));

  let mut clip = s.copy_items(&ids(&["l"]), &[], &[]).unwrap();
  assert_eq!((clip.cards[0].kind, clip.cards[0].text.as_deref(), clip.cards[0].link.as_deref()), (CardKind::Link, None, Some("https://example.com/a")));
  let copy = card_file(&f, &s.paste_items(&clip, 500.0, 0.0).unwrap().ids[0]);
  assert_eq!((copy.kind, copy.note, copy.link.as_deref(), copy.preview.as_ref()), (CardKind::Link, None, Some("https://example.com/a"), Some(&shown)));

  // A preview's image outside the attachments is left out.
  clip.cards[0].preview.as_mut().unwrap().image = Some("../secret.png".into());
  let copy = card_file(&f, &s.paste_items(&clip, 500.0, 500.0).unwrap().ids[0]);
  assert_eq!(copy.preview.map(|p| (p.title, p.image)), Some((Some("A".into()), None)));

  // Any other address is left out, with its preview: the copy is an empty card.
  clip.cards[0].link = Some("javascript:alert(1)".into());
  let copy = card_file(&f, &s.paste_items(&clip, 1000.0, 0.0).unwrap().ids[0]);
  assert_eq!((copy.kind, copy.note, copy.link, copy.preview), (CardKind::Note, None, None, None));
}

#[test]
fn a_post_it_pastes_as_a_post_it_with_a_note_of_its_own() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(CardKind::Postit, Some("#f5d76e".into()), 0.0, 0.0, 200.0, 200.0).unwrap();
  s.create_note_for_card(&id, "Ask Marie").unwrap();
  let clip = s.copy_items(&ids(&[&id]), &[], &[]).unwrap();
  assert_eq!((clip.cards[0].kind, clip.cards[0].text.as_deref()), (CardKind::Postit, Some("Ask Marie")));
  let copy = card_file(&f, &s.paste_items(&clip, 500.0, 0.0).unwrap().ids[0]);
  assert_eq!((copy.kind, copy.color.as_deref()), (CardKind::Postit, Some("#f5d76e")));
  assert_ne!(copy.note, card_file(&f, &id).note);
  assert_eq!(s.read_note(copy.note.as_deref().unwrap()).unwrap(), "Ask Marie");
}

#[test]
fn a_mindmap_showing_its_markdown_pastes_showing_it() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(CardKind::Mindmap, None, 0.0, 0.0, 480.0, 300.0).unwrap();
  s.set_mindmap_view(&id, MindmapView::Markdown).unwrap();
  let clip = s.copy_items(&ids(&[&id]), &[], &[]).unwrap();
  let copy = card_file(&f, &s.paste_items(&clip, 600.0, 0.0).unwrap().ids[0]);
  assert_eq!((copy.kind, copy.view), (CardKind::Mindmap, MindmapView::Markdown));
}

#[test]
fn a_scaled_mindmap_pastes_at_its_scale() {
  let f = Fixture::new();
  let s = open(&f);
  let id = s.create_card(CardKind::Mindmap, None, 0.0, 0.0, 480.0, 300.0).unwrap();
  s.scale_mindmap(&id, 0.0, 0.0, 240.0, 150.0, 0.5).unwrap();
  let clip = s.copy_items(&ids(&[&id]), &[], &[]).unwrap();
  let copy = card_file(&f, &s.paste_items(&clip, 600.0, 0.0).unwrap().ids[0]);
  assert_eq!((copy.kind, copy.scale, copy.w), (CardKind::Mindmap, MapScale(0.5), 240.0));
}

#[test]
fn a_clip_from_before_kinds_is_told_by_what_its_cards_show() {
  let f = Fixture::new();
  let s = open(&f);
  let card = |extra: serde_json::Value| {
    let mut card = json!({ "id": "c", "zone": null, "x": 0.0, "y": 0.0, "w": 100.0, "h": 100.0 });
    card.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
    card
  };
  let clip = |c: serde_json::Value| -> Clip { serde_json::from_value(json!({ "x": 0.0, "y": 0.0, "w": 100.0, "h": 100.0, "cards": [c] })).unwrap() };
  let pasted = |c| card_file(&f, &s.paste_items(&clip(c), 0.0, 0.0).unwrap().ids[0]);
  assert_eq!(pasted(card(json!({ "file": "attachments/images/a.png" }))).kind, CardKind::Image);
  // An image card naming a file outside the attachments shows nothing: it pastes as an empty index card.
  let copy = pasted(card(json!({ "kind": "image", "file": "../secret.png" })));
  assert_eq!((copy.kind, copy.file), (CardKind::Note, None));
  // Text on a card that shows no note makes none.
  let copy = pasted(card(json!({ "kind": "link", "link": "https://example.com", "text": "stray" })));
  assert_eq!((copy.kind, copy.note), (CardKind::Link, None));
}
