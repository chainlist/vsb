// What can be done to cards, zones, edges and drawings, shared by the keyboard, the selection bar and
// the items themselves.
import {
	alignCards,
	arrowEdges,
	canvasContents,
	clearCard,
	colorItems,
	deleteCards,
	deleteDrawings,
	deleteEdges,
	deleteZones,
	itemBox,
	labelEdge,
	placeNote,
	renameZone,
	shapeEdges,
	strokeEdges,
	type Arrow,
	type CardView,
	type EdgeView,
	type HAlign,
	type Shape,
	type Stroke,
	type VAlign,
	type ZoneView
} from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { newCardAt } from './gestures.js';
import { history } from './history.js';
import { items, OPEN_ZOOM } from './items.svelte.js';
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
	const drawings = selection.drawings.map((d) => d.id);
	selection.clear();
	// Edges first, so a deleted card doesn't list them again with its own edges. Cards and drawings
	// next, so a deleted zone moves up only what is left inside it.
	return history.edit(async () => [
		...(await deleteEdges(edges)),
		...(await deleteCards(cards)),
		...(await deleteDrawings(drawings)),
		...(await deleteZones(zones))
	]);
}

export function alignSelected(halign: HAlign, valign: VAlign) {
	const ids = selection.cards.map((c) => c.id);
	return history.edit(() => alignCards(ids, halign, valign));
}

/** Sets the color of the selected cards, zones and drawings together; null for none. */
export function colorSelected(color: string | null) {
	const cards = selection.cards.map((c) => c.id);
	const zones = selection.zones.map((z) => z.id);
	const drawings = selection.drawings.map((d) => d.id);
	return history.edit(() => colorItems(cards, zones, drawings, color));
}

export function shapeSelected(shape: Shape) {
	const ids = selection.edges.map((e) => e.id);
	return history.edit(() => shapeEdges(ids, shape));
}

export function arrowSelected(arrow: Arrow) {
	const ids = selection.edges.map((e) => e.id);
	return history.edit(() => arrowEdges(ids, arrow));
}

export function strokeSelected(stroke: Stroke) {
	const ids = selection.edges.map((e) => e.id);
	return history.edit(() => strokeEdges(ids, stroke));
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

/** Glides to frame a card or a zone, zoomed in at least until zones open, and selects it. */
export async function show(kind: 'card' | 'zone', id: string) {
	const box = await itemBox(kind, id);
	if (!box) return;
	camera.glide(box, OPEN_ZOOM);
	selection.only(id);
}

/** Frames everything on the canvas, as opening the vault does, gliding there. */
export async function fitAll() {
	const contents = await canvasContents();
	if (contents) camera.glide(contents);
}

/** Places a card for a note, centered on a world point, and selects it. A note that already has
 * its card gets no other (one card per note until V3): its card is shown instead. */
export function dropNote(path: string, at: { x: number; y: number }) {
	const { x, y, w, h } = newCardAt(at);
	// The card joins the zone under its center. Zoomed out it would be hidden, in a collapsed zone or
	// a cluster: it is shown.
	const hidden = items.collapsed;
	return history.edit(async () => {
		const { id, undo } = await placeNote(path, x, y, w, h);
		if (undo.length && !hidden) selection.only(id);
		else await show('card', id);
		return undo;
	});
}
