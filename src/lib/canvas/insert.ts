// Inserting a card on an edge: an empty card between its two cards, in the innermost zone at the
// edge's middle, with the edge split around it. What lies past the middle in that zone moves along
// the edge's way to make room. One undo step; the card opens for editing, as a placed card does.
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
		// All of the zone's own cards and inner zones, those off-screen too.
		const { nodes } = await zoneNodes(zone);
		const { card, moves } = makeRoom(mid, out, from, NEW_CARD, nodes, RANK_GAP, snap.on ? GRID : 0);
		const at = { minX: card.x, minY: card.y, maxX: card.x + card.w, maxY: card.y + card.h };
		const { id, undo } = await insertCard(edge.id, zone, at, ...apart(moves));
		selection.only(id);
		selection.editing = id;
		return undo;
	});
}
