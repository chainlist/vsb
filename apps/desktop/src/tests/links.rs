use super::{open, Fixture};
use crate::links::{read_head, Head, Page};
use tauri::Url;

fn head(html: &str) -> Head {
  read_head(html, &Url::parse("https://www.example.com/blog/post?x=1").unwrap())
}

#[test]
fn a_page_says_what_it_is_with_open_graph_first() {
  let html = r#"<!doctype html><html><head>
    <title>Plain title</title>
    <meta name="description" content="Plain description">
    <meta content="Canvas notes &amp; more" property="og:title" />
    <META PROPERTY='og:description' CONTENT='A field guide, &quot;quoted&quot; &#8217; &#x2192; done'>
    <meta property="og:image" content="/img/cover.png?w=1200&amp;h=630">
    <meta name="twitter:image" content="https://cdn.example.com/other.png">
  </head><body><meta property="og:title" content="Not this one"></body></html>"#;
  assert_eq!(
    head(html),
    Head {
      title: Some("Canvas notes & more".into()),
      description: Some("A field guide, \"quoted\" \u{2019} \u{2192} done".into()),
      image: Some(Url::parse("https://www.example.com/img/cover.png?w=1200&h=630").unwrap()),
    }
  );
}

#[test]
fn without_open_graph_a_page_falls_back_on_twitter_then_plain_html() {
  let html = "<head><TITLE>\n  The  page's\ttitle </TITLE><meta name=description content=Short>\
    <meta name=\"twitter:image\" content=\"//cdn.example.com/card.jpg\"></head>";
  assert_eq!(
    head(html),
    Head {
      title: Some("The page's title".into()),
      description: Some("Short".into()),
      image: Some(Url::parse("https://cdn.example.com/card.jpg").unwrap()),
    }
  );
}

#[test]
fn a_page_that_says_nothing_gives_nothing() {
  assert_eq!(head("<html><body><p>Hello</p></body></html>"), Head::default());
  // A `>` inside a quoted value does not end its tag, an empty value counts for nothing, and an
  // image that is not on the web is left out.
  let html = r#"<meta property="og:title" content="a > b"><meta property="og:description" content="  ">
    <meta property="og:image" content="javascript:alert(1)">"#;
  assert_eq!(head(html), Head { title: Some("a > b".into()), ..Head::default() });
}

#[test]
fn a_long_description_is_cut_with_an_ellipsis() {
  let long = "word ".repeat(200);
  let description = head(&format!(r#"<meta property="og:description" content="{long}">"#)).description.unwrap();
  assert_eq!(description.chars().count(), 500);
  assert!(description.ends_with("word…"));
}

#[test]
fn a_preview_keeps_its_image_under_attachments_named_after_the_host() {
  let f = Fixture::new();
  let s = open(&f);
  let page = |image: bool| Page { title: Some("T".into()), description: None, image: image.then(|| (b"PNG".to_vec(), "png")) };
  let first = s.keep_preview("https://www.example.com/a", page(true)).unwrap().unwrap();
  let second = s.keep_preview("https://www.example.com/b", page(true)).unwrap().unwrap();
  assert_eq!(first.image.as_deref(), Some("attachments/links/example.com.png"));
  assert_eq!(second.image.as_deref(), Some("attachments/links/example.com 2.png"));
  assert_eq!(f.read("attachments/links/example.com.png"), "PNG");
  assert_eq!((first.title.as_deref(), first.description), (Some("T"), None));
  assert_eq!(s.keep_preview("https://example.com", page(false)).unwrap().unwrap().image, None);
  assert_eq!(s.keep_preview("https://example.com", Page::default()).unwrap(), None);
}
