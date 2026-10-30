use super::{card_file, open, put_zone, Fixture, WORLD};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n not really an image";

#[test]
fn an_image_is_written_under_attachments_named_after_its_file() {
  let f = Fixture::new();
  let s = open(&f);
  let first = s.write_image("Photo café.PNG", PNG).unwrap();
  let second = s.write_image("C:\\Users\\me\\Photo café.png", PNG).unwrap();
  assert_eq!((first.as_str(), second.as_str()), ("attachments/images/Photo café.png", "attachments/images/Photo café 2.png"));
  assert_eq!(s.read_attachment(&second).unwrap(), PNG);
  assert_eq!(s.write_image("a:b?.gif", PNG).unwrap(), "attachments/images/ab.gif");
  assert!(s.write_image("notes.txt", PNG).is_err());
  assert!(s.write_image("no extension", PNG).is_err());
}

#[test]
fn an_image_card_shows_its_file_until_it_is_cleared() {
  let f = Fixture::new();
  put_zone(&f, "Z", None, 0.0, 0.0, 600.0, 400.0);
  let s = open(&f);
  let path = s.write_image("diagram.png", PNG).unwrap();
  let placed = s.place_file(&path, 100.0, 100.0, 320.0, 180.0).unwrap();

  let card = card_file(&f, &placed.id);
  assert_eq!((card.note, card.file.as_deref(), card.zone.as_deref(), card.x), (None, Some(path.as_str()), Some("Z"), 100.0));
  let view = s.index.viewport(WORLD, 0.0, None).unwrap().cards.into_iter().find(|c| c.id == placed.id).unwrap();
  assert_eq!(view.file.as_deref(), Some(path.as_str()));
  // A second card may show the same file.
  assert!(s.place_file(&path, 300.0, 100.0, 320.0, 180.0).is_ok());

  s.clear_card(&placed.id).unwrap();
  assert_eq!((card_file(&f, &placed.id).note, card_file(&f, &placed.id).file), (None, None));
  // Undoing the placing takes the card away; the image stays.
  s.apply(placed.undo).unwrap();
  assert!(!f.exists(&format!(".canvas/cards/{}.json", placed.id)));
  assert!(f.exists(&path));
}

#[test]
fn only_attachments_are_read_or_placed() {
  let f = Fixture::new();
  f.write("notes/Secret.md", "Secret");
  let s = open(&f);
  for path in ["notes/Secret.md", "attachments/../notes/Secret.md", "../Secret.md", "/etc/passwd", "C:/Windows/win.ini"] {
    assert!(s.read_attachment(path).is_err(), "{path}");
    assert!(s.place_file(path, 0.0, 0.0, 100.0, 100.0).is_err(), "{path}");
  }
  assert!(s.place_file("attachments/images/missing.png", 0.0, 0.0, 100.0, 100.0).is_err());
}

#[test]
fn a_pasted_image_card_shows_the_same_file() {
  let f = Fixture::new();
  let s = open(&f);
  let path = s.write_image("diagram.png", PNG).unwrap();
  let placed = s.place_file(&path, 0.0, 0.0, 320.0, 180.0).unwrap();
  let mut clip = s.copy_items(&[placed.id], &[], &[]).unwrap();
  assert_eq!(clip.cards[0].file.as_deref(), Some(path.as_str()));
  let pasted = s.paste_items(&clip, 500.0, 0.0).unwrap();
  assert_eq!(card_file(&f, &pasted.ids[0]).file.as_deref(), Some(path.as_str()));

  // A clip from elsewhere naming a file outside the attachments pastes an empty card.
  clip.cards[0].file = Some("../outside.png".into());
  let pasted = s.paste_items(&clip, 900.0, 0.0).unwrap();
  assert_eq!(card_file(&f, &pasted.ids[0]).file, None);
}
