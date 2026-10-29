// Inserting a card on an edge: an empty card between its two cards, in the innermost zone at the
// edge's middle, with the edge split around it. What lies past the middle in that zone, drawings
// included, moves along the edge's way to make room. One undo step; the card opens for editing, as a placed card does.
import { insertCard, zoneNodes, type EdgeView } from '#lib/api.js';
import { apart } from './arrange.js';
import { RANK_GAP } from './batch.js';
import { NEW_CARD } from './gestures.js';
import { GRID, snap } from './grid.svelte.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { makeRoom } from './room.js';
import { selection } from './selection.svelte.js';

export function insertOnEdge(edge: EdgeView) {
	const { mid, out } = items.routeOf(edge);
	const zone = items.zoneAt(mid)?.id ?? null;
	const from = items.find(edge.from)?.item ?? edge.ends[0];
	return history.edit(async () => {
		// All of the zone's own cards, inner zones and drawings, those off-screen too.
		const { nodes, drawings } = await zoneNodes(zone);
		const drawn = new Set(drawings.map((d) => d.id));
		const all = [...nodes, ...drawings.map((d) => ({ ...d, zone: false }))];
		const { card, moves } = makeRoom(mid, out, from, NEW_CARD, all, RANK_GAP, snap.on ? GRID : 0);
		const at = { minX: card.x, minY: card.y, maxX: card.x + card.w, maxY: card.y + card.h };
		const [cards, zones] = apart(moves.filter((m) => !drawn.has(m.id)));
		const marks = moves.filter((m) => drawn.has(m.id)).map(({ id, x, y }) => ({ id, x, y }));
		const { id, undo } = await insertCard(edge.id, zone, at, cards, zones, marks);
		selection.only(id);
		selection.editing = id;
		return undo;
	});
}
