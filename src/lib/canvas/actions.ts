// What can be done to cards, zones and edges, shared by the keyboard, the selection bar and the
// items themselves.
import {
	alignCards,
	arrowEdges,
	clearCard,
	colorZones,
	deleteCards,
	deleteEdges,
	deleteZones,
	labelEdge,
	renameZone,
	shapeEdges,
	type Arrow,
	type CardView,
	type EdgeView,
	type HAlign,
	type Shape,
	type VAlign,
	type ZoneView
} from '#lib/api.js';
import { history } from './history.js';
import { selection } from './selection.svelte.js';

/** Opens the card's editor, the zone's name or the edge's label. A card whose note is missing has
 * nothing to edit. */
export function edit(item: CardView | ZoneView | EdgeView) {
	if ('note' in item && item.note !== null && !item.resolved) return;
	selection.only(item.id);
	selection.editing = item.id;
}

export function editSelected() {
	const [item] = [...selection.cards, ...selection.zones, ...selection.edges];
	if (item && selection.ids.length === 1) edit(item);
}

/** Leaves edit mode; the item stays selected. */
export function stopEditing() {
	selection.editing = null;
}

export function deleteSelected() {
	const edges = selection.edges.map((e) => e.id);
	const cards = selection.cards.map((c) => c.id);
	const zones = selection.zones.map((z) => z.id);
	selection.clear();
	// Edges first, so a deleted card doesn't list them again with its own edges. Cards next, so a
	// deleted zone moves up only what is left inside it.
	return history.edit(async () => [
		...(await deleteEdges(edges)),
		...(await deleteCards(cards)),
		...(await deleteZones(zones))
	]);
}

export function alignSelected(halign: HAlign, valign: VAlign) {
	const ids = selection.cards.map((c) => c.id);
	return history.edit(() => alignCards(ids, halign, valign));
}

/** Sets the selected zones' color; null for the default. */
export function colorSelected(color: string | null) {
	const ids = selection.zones.map((z) => z.id);
	return history.edit(() => colorZones(ids, color));
}

export function shapeSelected(shape: Shape) {
	const ids = selection.edges.map((e) => e.id);
	return history.edit(() => shapeEdges(ids, shape));
}

export function arrowSelected(arrow: Arrow) {
	const ids = selection.edges.map((e) => e.id);
	return history.edit(() => arrowEdges(ids, arrow));
}

export function rename(id: string, name: string) {
	return history.edit(() => renameZone(id, name));
}

/** Sets an edge's label; an empty one removes it. */
export function label(id: string, text: string) {
	return history.edit(() => labelEdge(id, text));
}

/** Turns an unresolved card into an empty one. */
export function clear(card: CardView) {
	return history.edit(() => clearCard(card.id));
}
