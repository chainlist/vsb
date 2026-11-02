// What can be done to cards, zones, edges and drawings, shared by the keyboard, the selection bar and
// the items themselves.
import {
	alignCards,
	arrowEdges,
	canvasContents,
	clearCard,
	colorItems,
	createCard,
	createZone,
	deleteCards,
	deleteDrawings,
	deleteEdges,
	deleteZones,
	itemBox,
	itemsBox,
	labelEdge,
	placeNote,
	renameZone,
	setMindmapView,
	shapeEdges,
	strokeEdges,
	type Arrow,
	type CardView,
	type EdgeView,
	type Frame,
	type HAlign,
	type MindmapView,
	type Shape,
	type Stroke,
	type VAlign,
	type ZoneView
} from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { POSTIT_COLOR } from './colors.js';
import { NEW_CARD, NEW_MINDMAP, NEW_POSTIT, newCardAt } from './gestures.js';
import { history } from './history.js';
import { cover, inside, items, OPEN_ZOOM } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** Whether a card shows a note: an index card, a post-it or a mindmap. An image or link card shows
 * something else in its place, with no text to edit or align. */
export const showsNote = (card: CardView) => card.kind !== 'image' && card.kind !== 'link';

/** How far a card leans, in degrees: a post-it from half a degree to two either way, told by its ID
 * so it leans the same each time it is drawn and on every device; any other card stands straight. */
export function tilt(card: CardView) {
	if (card.kind !== 'postit') return 0;
	// FNV-1a, then MurmurHash3's mix: IDs made together differ only at their end, and without the mix
	// a pasted post-it would lean as its original does.
	let h = 2166136261;
	for (const c of card.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	const lean = 0.5 + ((h >>> 0) % 1500) / 1000;
	return h < 0 ? -lean : lean;
}

/** Whether an item has something to edit. A card whose note is missing has nothing, nor has a card
 * showing an image or a web page. */
export const editable = (item: CardView | ZoneView | EdgeView) =>
	!('note' in item && (!showsNote(item) || (item.note !== null && !item.resolved)));

/** Opens the card's editor, the zone's name or the edge's label. */
export function edit(item: CardView | ZoneView | EdgeView) {
	// Already open: a mindmap opened by a click on a node stays as it is, its card unselected.
	if (!editable(item) || selection.editing === item.id) return;
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

/** Room a zone drawn around the selection leaves around it, in world units: a graph-paper square on
 * the sides and at the bottom, three at the top, where the zone's name is. */
const MARGIN = 20;
const NAME_ROOM = 60;

/** Draws a zone around the selected cards, zones and drawings, which join it as they would a zone
 * drawn there by hand, with whatever else lies fully inside it. Like a drawn zone, it opens for
 * editing: its name. */
export function zoneSelected() {
	const boxes = [...selection.cards, ...selection.zones, ...selection.drawings];
	const x = Math.round(Math.min(...boxes.map((b) => b.x)) - MARGIN);
	const y = Math.round(Math.min(...boxes.map((b) => b.y)) - NAME_ROOM);
	const w = Math.round(Math.max(...boxes.map((b) => b.x + b.w)) + MARGIN) - x;
	const h = Math.round(Math.max(...boxes.map((b) => b.y + b.h)) + MARGIN) - y;
	return history.edit(async () => {
		const { id, undo } = await createZone(x, y, w, h);
		selection.only(id);
		selection.editing = id;
		return undo;
	});
}

/** Aligns the text of the selected cards; a card showing an image or a web page has none. */
export function alignSelected(halign: HAlign, valign: VAlign) {
	const ids = selection.cards.filter(showsNote).map((c) => c.id);
	return history.edit(() => alignCards(ids, halign, valign));
}

/** Shows a mindmap's map, or its note's Markdown on an index card. */
export const showMindmap = (card: CardView, view: MindmapView) => history.edit(() => setMindmapView(card.id, view));

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

/** What selects new items landing on these boxes, then frames them when zoomed out, where they would
 * be hidden in a collapsed zone or a cluster, or when they land partly off-screen. Asked before the
 * edit, which can move the camera. */
export function landing(boxes: Frame[]) {
	const span = cover(boxes);
	const framed = items.collapsed || !inside(span, camera.visible);
	return (ids: string[]) => {
		selection.ids = ids;
		if (framed) camera.glide(span, OPEN_ZOOM);
	};
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

/** Frames the selection wherever it is, gliding there, zoomed in at least until zones open. */
export async function fitSelected() {
	const box = await itemsBox(selection.ids);
	if (box) camera.glide(box, OPEN_ZOOM);
}

/** Places an empty card centered on a world point and opens it: an index card, a post-it, square and
 * yellow, or a mindmap, wide. Zoomed out, it would be hidden in a cluster: it is framed, zoomed in
 * until it shows. */
export function placeCard(at: { x: number; y: number }, kind: 'note' | 'postit' | 'mindmap' = 'note') {
	const postit = kind === 'postit';
	const { x, y, w, h } = newCardAt(at, postit ? NEW_POSTIT : kind === 'mindmap' ? NEW_MINDMAP : NEW_CARD);
	const hidden = items.collapsed;
	return history.edit(async () => {
		const id = await createCard(x, y, w, h, kind, postit ? POSTIT_COLOR : null);
		if (hidden) camera.glide(cover([{ x, y, w, h }]), OPEN_ZOOM);
		selection.only(id);
		selection.editing = id;
		return [{ kind: 'card', id, value: null }];
	});
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
