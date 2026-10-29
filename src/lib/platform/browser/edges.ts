// Edge edits: connecting two cards, inserting a card on an edge, adding a linked card after one,
// labeling, styling and deleting, as on the desktop. Each hands target item states to `apply`, so
// every edit can be undone.
import type { Arrow, Created, Move, Rect, Shape, Stroke } from '#lib/api.js';
import { apply, edit, gone, read, state, type Edit } from './apply.ts';
import { placed } from './cards.ts';
import { edgeBetween } from './lookups.ts';
import type { CardFile, EdgeFile } from './records.ts';
import { edgeStyle } from './settings.ts';
import { newId } from './ulid.ts';

/** Connects two different cards. Two cards are connected at most once, either way round: when they
 * already are, the existing edge comes back with nothing to undo. */
export async function createEdge(e: Edit, from: string, to: string): Promise<Created> {
	if (from === to) throw new Error('an edge joins two different cards');
	const existing = await edgeBetween(e, from, to);
	if (existing) return { id: existing, undo: [] };
	// An edge never points at a card that is not there.
	await Promise.all([read(e, 'card', from), read(e, 'card', to)]);
	const id = newId();
	return { id, undo: await apply(e, [state('edge', id, { from, to, ...(await edgeStyle(e)) })]) };
}

/** An empty card on the world rectangle `at` in `zone`, and where it is placed. */
function emptyCard(id: string, zone: string | null, at: Rect): [Move, CardFile] {
	const [x, y, w, h] = [at.minX, at.minY, at.maxX - at.minX, at.maxY - at.minY];
	return [{ id, x, y }, { note: null, zone, x, y, w, h }];
}

/** Inserts an empty card on an edge, on the world rectangle `at` in `zone` (null: the canvas). The
 * edge is split around it, from its first card to the new one and on to its second: both halves keep
 * its style, not the style for new edges, and the first its label. The cards and zones given move to make room, as arranging moves
 * them, and the zone grows where needed to hold them and the new card. */
export async function insertCard(e: Edit, edge: string, zone: string | null, at: Rect, cards: Move[], zones: Move[]): Promise<Created> {
	const old = await read(e, 'edge', edge);
	const id = newId();
	const files = await Promise.all(cards.map((m) => read(e, 'card', m.id)));
	const [move, card] = emptyCard(id, zone, at);
	const states = await placed(e, [...cards, move], [...files, card], zones);
	const second: EdgeFile = { ...old, from: id };
	delete second.label;
	states.push(state('edge', newId(), { ...old, to: id }), state('edge', newId(), second), gone('edge', edge));
	return { id, undo: await apply(e, states) };
}

/** Adds an empty card on the world rectangle `at`, in the zone of the card `from` whatever lies
 * under it, with a new edge from that card to it. The zone grows where needed to hold it. */
export async function addChild(e: Edit, from: string, at: Rect): Promise<Created> {
	const parent = await read(e, 'card', from);
	const id = newId();
	const [move, card] = emptyCard(id, parent.zone, at);
	const states = await placed(e, [move], [card], []);
	states.push(state('edge', newId(), { from, to: id, ...(await edgeStyle(e)) }));
	return { id, undo: await apply(e, states) };
}

/** Sets an edge's label; an empty one removes it. */
export function labelEdge(e: Edit, id: string, label: string) {
	const text = label.trim();
	return edit(e, 'edge', [id], (edge) => {
		if (text) edge.label = text;
		else delete edge.label;
	});
}

export const shapeEdges = (e: Edit, ids: string[], shape: Shape) => edit(e, 'edge', ids, (edge) => (edge.shape = shape));

export const arrowEdges = (e: Edit, ids: string[], arrow: Arrow) => edit(e, 'edge', ids, (edge) => (edge.arrow = arrow));

export const strokeEdges = (e: Edit, ids: string[], stroke: Stroke) => edit(e, 'edge', ids, (edge) => (edge.stroke = stroke));

export const deleteEdges = (e: Edit, ids: string[]) => apply(e, ids.map((id) => gone('edge', id)));
