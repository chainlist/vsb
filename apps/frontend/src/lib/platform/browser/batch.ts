// Batch creation and editing with the batch builder, as on the desktop: its text is the truth for the
// edges between the cards it opened with. An edge the text drops is deleted; one it draws differently
// is restyled, keeping its label and shape; a new one is created; new lines add new cards. Creating a
// batch is the same edit, on no cards.
import type { Batch, BatchCard, BatchEdge, ItemState, Link, LinkEnd, LinkPlan } from '#lib/api.js';
import { apply, gone, read, state, type Edit } from './apply.ts';
import { cover, rectAt } from './grid.ts';
import { edgesAmong } from './lookups.ts';
import { newNote } from './notes.ts';
import { edgeStyle } from './settings.ts';
import { newId } from './ulid.ts';
import { holding } from './zones.ts';

/** Writes a note for each card, then the cards, then the edges between them. The cards all join the
 * innermost zone under the world point (x, y). */
export function createBatch(e: Edit, x: number, y: number, cards: BatchCard[], edges: BatchEdge[]) {
	const { zone } = e.layout.around(rectAt(x, y, 0, 0));
	const links = edges.map((l): Link => ({ from: { new: l.from }, to: { new: l.to }, arrow: l.arrow, stroke: l.stroke }));
	return editBatch(e, zone, [], cards, links);
}

/** The states writing a note and a card for each of `cards` in `zone`, or on the canvas, and the
 * cards' IDs. A zone too small for them grows to hold them, its contents staying in place. */
async function newCards(e: Edit, zone: string | null, cards: BatchCard[]): Promise<[string[], ItemState[]]> {
	if (cards.some((c) => !c.text.trim())) throw new Error('every card in a batch has text');
	const spans = cards.map((c) => rectAt(c.x, c.y, c.w, c.h));
	const grown = zone !== null && spans.length ? await holding(e, zone, spans.reduce(cover)) : null;
	const [[ox, oy], states] = [grown?.origin ?? [0, 0], grown?.states ?? []];
	const ids = cards.map(() => newId());
	for (const [i, c] of cards.entries()) {
		const note = await newNote(e, c.text);
		states.push(state('card', ids[i], { note, zone, x: c.x - ox, y: c.y - oy, w: c.w, h: c.h, halign: 'center', valign: 'center' }));
	}
	return [ids, states];
}

/** An end's place in the order the desktop sorts them: cards of the canvas first, by ID, then new
 * cards, by number. A link and its reverse make one pair. */
const endKey = (end: LinkEnd) => ('card' in end ? `0${end.card}` : `1${String(end.new).padStart(10, '0')}`);
const pair = (a: LinkEnd, b: LinkEnd) => [endKey(a), endKey(b)].sort().join(' ');

/** What the links do to the edges between the `scope` cards. The first link between two cards
 * counts: at most one edge joins them, either way round. */
export async function planLinks(e: Edit, scope: string[], links: Link[]): Promise<LinkPlan> {
	const wanted = new Map<string, number>();
	links.forEach((l, i) => wanted.has(pair(l.from, l.to)) || wanted.set(pair(l.from, l.to), i));
	const plan: LinkPlan = { removed: [], restyled: [], created: [] };
	for (const edge of await edgesAmong(e, scope)) {
		const key = pair({ card: edge.from }, { card: edge.to });
		const i = wanted.get(key);
		wanted.delete(key);
		if (i === undefined) plan.removed.push(edge.id);
		else if (!same(edge, links[i])) plan.restyled.push([edge.id, i]);
	}
	plan.created = [...wanted.values()].sort((a, b) => a - b);
	return plan;
}

/** Whether a link draws an edge as the text wrote it. With heads at both ends or none, a line has
 * no direction. The text has no dashed line without heads: such an edge is written solid, and keeps
 * its dashes while its line stays as written. */
function same(edge: { from: string; arrow: string; stroke: string }, l: Link) {
	const stroke = edge.arrow === 'none' && edge.stroke === 'dashed' ? 'solid' : edge.stroke;
	const along = edge.arrow !== 'to' || ('card' in l.from && l.from.card === edge.from);
	return l.arrow === edge.arrow && l.stroke === stroke && along;
}

/** Writes new notes and cards for `cards` in `zone`, or on the canvas, then brings the edges between
 * them and the `scope` cards to what the links draw, as one edit. */
export async function editBatch(e: Edit, zone: string | null, scope: string[], cards: BatchCard[], links: Link[]): Promise<Batch> {
	const known = (end: LinkEnd) => ('card' in end ? scope.includes(end.card) : end.new < cards.length);
	if (links.some((l) => endKey(l.from) === endKey(l.to) || !known(l.from) || !known(l.to))) {
		throw new Error('a link joins two different cards of the batch');
	}
	const plan = await planLinks(e, scope, links);
	const [ids, states] = await newCards(e, zone, cards);
	// An edge never points at a card that is not there.
	const card = async (end: LinkEnd) => ('card' in end ? (await read(e, 'card', end.card), end.card) : ids[end.new]);
	for (const id of plan.removed) states.push(gone('edge', id));
	for (const [id, i] of plan.restyled) {
		const l = links[i];
		const edge = await read(e, 'edge', id);
		states.push(state('edge', id, { ...edge, from: await card(l.from), to: await card(l.to), arrow: l.arrow, stroke: l.stroke }));
	}
	// The text always says a new edge's arrowheads and line, never its shape: that is the vault's.
	const { shape } = await edgeStyle(e);
	for (const i of plan.created) {
		const l = links[i];
		states.push(state('edge', newId(), { from: await card(l.from), to: await card(l.to), shape, arrow: l.arrow, stroke: l.stroke }));
	}
	return { cards: ids, undo: await apply(e, states) };
}
