// What can be done to cards, zones and edges, shared by the keyboard, the selection bar and the
// items themselves.
import {
	alignCards,
	arrowEdges,
	clearCard,
	colorZones,
	createBatch,
	deleteCards,
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
import { layOut, parse, type Direction } from './batch.js';
import { camera } from './camera.svelte.js';
import { newCardAt } from './gestures.js';
import { history } from './history.js';
import { inside, items, OPEN_ZOOM } from './items.svelte.js';
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

/** Frames a card or a zone, zoomed in at least until zones open, and selects it. */
export async function show(kind: 'card' | 'zone', id: string) {
	const box = await itemBox(kind, id);
	if (!box) return;
	camera.fit(box, OPEN_ZOOM);
	selection.only(id);
}

/** Places a card for a note, centered on a world point, and selects it. A note that already has
 * its card gets no other (one card per note until V3): its card is shown instead. */
export function dropNote(path: string, at: { x: number; y: number }) {
	const { x, y, w, h } = newCardAt(at);
	// The card joins the zone under its center. In a collapsed zone it would be hidden: it is shown.
	const hidden = items.hides({ x: x + w / 2, y: y + h / 2 });
	return history.edit(async () => {
		const { id, undo } = await placeNote(path, x, y, w, h);
		if (undo.length && !hidden) selection.only(id);
		else await show('card', id);
		return undo;
	});
}

/** Creates the cards and edges written in the batch syntax, laid out in a direction and centered on a
 * world point, as one undo step, and selects the cards. Hidden in a collapsed zone, or partly
 * off-screen, they are framed. */
export function createCards(text: string, at: { x: number; y: number }, direction: Direction) {
	const plan = parse(text);
	if (!plan.texts.length) return;
	const boxes = layOut(plan, at, direction);
	const span = {
		minX: Math.min(...boxes.map((b) => b.x)),
		minY: Math.min(...boxes.map((b) => b.y)),
		maxX: Math.max(...boxes.map((b) => b.x + b.w)),
		maxY: Math.max(...boxes.map((b) => b.y + b.h))
	};
	const framed = items.hides(at) || !inside(span, camera.visible);
	return history.edit(async () => {
		const cards = boxes.map((box, i) => ({ ...box, text: plan.texts[i] }));
		const { cards: ids, undo } = await createBatch(at.x, at.y, cards, plan.edges);
		selection.ids = ids;
		if (framed) camera.fit(span, OPEN_ZOOM);
		return undo;
	});
}
