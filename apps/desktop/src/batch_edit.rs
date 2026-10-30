//! Editing with the batch builder, opened on cards of the canvas: its text is the truth for the
//! edges between those cards. An edge the text drops is deleted; one it draws differently is
//! restyled, keeping its label and shape; a new one is created; new lines add new cards. The cards
//! themselves are never deleted, renamed or moved. Creating a batch is the same edit, on no cards.

use crate::batch::{Batch, BatchCard};
use crate::error::{msg, Result};
use crate::index::ScopeEdge;
use crate::items::{Arrow, Card, Edge, Kind, Stroke};
use crate::session::Session;
use crate::states::ItemState;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// An end of a link: one of the cards the builder opened with, or one of its new cards.
#[derive(Deserialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum End {
  Card(String),
  New(usize),
}

/// An edge the text draws.
#[derive(Deserialize, Clone, Debug)]
pub struct Link {
  pub from: End,
  pub to: End,
  pub arrow: Arrow,
  pub stroke: Stroke,
}

/// What a text does to the edges between the cards the builder opened with.
#[derive(Serialize, Debug, Default, PartialEq)]
pub struct LinkPlan {
  /// Edges it drops: deleted.
  pub removed: Vec<String>,
  /// Edges it draws differently, each with the link that restyles it, as an index into the links.
  pub restyled: Vec<(String, usize)>,
  /// Links between cards no edge joins yet, as indexes into the links: created.
  pub created: Vec<usize>,
}

/// The two ends of a link, in order, so a link and its reverse are one pair.
fn pair(a: &End, b: &End) -> (End, End) {
  if a <= b { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) }
}

/// Whether a link draws an edge as the text wrote it. With heads at both ends or none, a line has
/// no direction. The text has no dashed line without heads: such an edge is written solid, and
/// keeps its dashes while its line stays as written.
fn same(e: &ScopeEdge, l: &Link) -> bool {
  let stroke = if e.arrow == "none" && e.stroke == "dashed" { "solid" } else { e.stroke.as_str() };
  let along = e.arrow != "to" || l.from == End::Card(e.from.clone());
  l.arrow.as_str() == e.arrow && l.stroke.as_str() == stroke && along
}

impl Session {
  /// What the links do to the edges between the `scope` cards. The first link between two cards
  /// counts: at most one edge joins them, either way round.
  pub fn plan_links(&self, scope: &[String], links: &[Link]) -> Result<LinkPlan> {
    let mut wanted = BTreeMap::new();
    for (i, l) in links.iter().enumerate() {
      wanted.entry(pair(&l.from, &l.to)).or_insert(i);
    }
    let mut plan = LinkPlan::default();
    for e in self.index.edges_among(scope)? {
      match wanted.remove(&pair(&End::Card(e.from.clone()), &End::Card(e.to.clone()))) {
        None => plan.removed.push(e.id),
        Some(i) if !same(&e, &links[i]) => plan.restyled.push((e.id, i)),
        Some(_) => {}
      }
    }
    plan.created = wanted.into_values().collect();
    plan.created.sort();
    Ok(plan)
  }

  /// Writes new notes and cards for `cards` in `zone`, or on the canvas, then brings the edges
  /// between them and the `scope` cards to what the links draw, as one edit.
  pub fn edit_batch(&self, zone: Option<&str>, scope: &[String], cards: &[BatchCard], links: &[Link]) -> Result<Batch> {
    for l in links {
      let known = |end: &End| match end {
        End::Card(id) => scope.contains(id),
        End::New(i) => *i < cards.len(),
      };
      if l.from == l.to || !known(&l.from) || !known(&l.to) {
        return msg("a link joins two different cards of the batch");
      }
    }
    let plan = self.plan_links(scope, links)?;
    let (ids, mut states) = self.new_cards(zone, cards)?;
    let card = |end: &End| -> Result<String> {
      match end {
        // An edge never points at a card file that is not there.
        End::Card(id) => self.read::<Card>(id).map(|_| id.clone()),
        End::New(i) => Ok(ids[*i].clone()),
      }
    };
    for id in &plan.removed {
      states.push(ItemState::gone(Kind::Edge, id));
    }
    for (id, i) in &plan.restyled {
      let (l, mut edge) = (&links[*i], self.read::<Edge>(id)?);
      (edge.from, edge.to, edge.arrow, edge.stroke) = (card(&l.from)?, card(&l.to)?, l.arrow, l.stroke);
      states.push(ItemState::of(id, &edge)?);
    }
    // The text always says a new edge's arrowheads and line, never its shape: that is the vault's.
    let shape = self.vault.edge_style()?.shape;
    for &i in &plan.created {
      let l = &links[i];
      let edge = Edge { from: card(&l.from)?, to: card(&l.to)?, label: None, shape, arrow: l.arrow, stroke: l.stroke };
      states.push(ItemState::of(&crate::new_id(), &edge)?);
    }
    Ok(Batch { cards: ids, undo: self.apply(states)? })
  }
}
