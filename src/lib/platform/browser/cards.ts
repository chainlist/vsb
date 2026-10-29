// Card edits: placing, moving, arranging, resizing, aligning, clearing and deleting, as on the
// desktop. Each builds target item states and hands them to `apply`, so every edit can be undone.
import type { Created, HAlign, ItemState, Move, Rect, VAlign } from '#lib/api.js';
import { apply, edit, gone, read, state, type Edit } from './apply.ts';
import { cover, rectAt } from './grid.ts';
import { cardOfNote, edgesTouching } from './lookups.ts';
import { noteAt } from './notes.ts';
import type { CardFile } from './records.ts';
import { newId } from './ulid.ts';
import { holding } from './zones.ts';

/** Where a card or a drawing on this world rectangle lands: the innermost zone under its center,
 * with that zone's origin. The canvas is null at (0, 0). */
export const landing = (e: Edit, x: number, y: number, w: number, h: number) => e.layout.around(rectAt(x + w / 2, y + h / 2, 0, 0));

async function place(e: Edit, note: string | null, x: number, y: number, w: number, h: number): Promise<Created> {
	const at = landing(e, x, y, w, h);
	const id = newId();
	const undo = await apply(e, [state('card', id, { note, zone: at.zone, x: x - at.x, y: y - at.y, w, h })]);
	return { id, undo };
}

/** Places an empty card on a world rectangle. It joins the innermost zone under its center. */
export const createCard = async (e: Edit, x: number, y: number, w: number, h: number) => (await place(e, null, x, y, w, h)).id;

/** Places a card for the note at `path`. Until V3 a note has one card: when it already has it, that
 * card comes back with nothing to undo. */
export async function placeNote(e: Edit, path: string, x: number, y: number, w: number, h: number): Promise<Created> {
	const note = await noteAt(e, path);
	const card = await cardOfNote(e, note);
	return card ? { id: card, undo: [] } : place(e, note, x, y, w, h);
}

/** Drops cards at new world positions. Each joins the innermost zone under its center, or the canvas. */
export function moveCards(e: Edit, moves: Move[]) {
	return edit(e, 'card', moves.map((m) => m.id), (card, i) => {
		const at = landing(e, moves[i].x, moves[i].y, card.w, card.h);
		Object.assign(card, { zone: at.zone, x: moves[i].x - at.x, y: moves[i].y - at.y });
	});
}

/** Moves cards and zones to world positions, each staying in its zone, which grows where needed to
 * hold them, its contents staying in place. A zone brings everything in it. */
export async function arrange(e: Edit, cards: Move[], zones: Move[]) {
	const files = await Promise.all(cards.map((m) => read(e, 'card', m.id)));
	return apply(e, await placed(e, cards, files, zones, []));
}

/** The states that put cards, given whole with their zone (new ones too), zones and drawings at
 * world positions, as `arrange` does. */
export async function placed(e: Edit, cards: Move[], cardFiles: CardFile[], zones: Move[], drawings: Move[]): Promise<ItemState[]> {
	const zoneFiles = await Promise.all(zones.map((m) => read(e, 'zone', m.id)));
	const drawingFiles = await Promise.all(drawings.map((m) => read(e, 'drawing', m.id)));
	const spans = new Map<string, Rect>();
	const boxes: [string | null, Rect][] = [
		...cards.map((m, i): [string | null, Rect] => [cardFiles[i].zone, rectAt(m.x, m.y, cardFiles[i].w, cardFiles[i].h)]),
		...zones.map((m, i): [string | null, Rect] => [zoneFiles[i].parent, rectAt(m.x, m.y, zoneFiles[i].w, zoneFiles[i].h)]),
		...drawings.map((m, i): [string | null, Rect] => [drawingFiles[i].zone, rectAt(m.x, m.y, drawingFiles[i].w, drawingFiles[i].h)])
	];
	for (const [inside, r] of boxes) if (inside !== null) spans.set(inside, spans.has(inside) ? cover(spans.get(inside)!, r) : r);
	let states: ItemState[] = [];
	const origins = new Map<string, [number, number]>();
	for (const zone of [...spans.keys()].sort()) {
		const grown = await holding(e, zone, spans.get(zone)!);
		origins.set(zone, grown.origin);
		states.push(...grown.states);
	}
	// A zone grown leftward shifts its contents back; those arranged get their own place instead.
	const placing: Record<ItemState['kind'], Move[]> = { card: cards, zone: zones, drawing: drawings, edge: [] };
	states = states.filter((s) => !placing[s.kind].some((m) => m.id === s.id));
	const origin = (inside: string | null) => (inside === null ? [0, 0] : origins.get(inside)!);
	zones.forEach((m, i) => {
		const [ox, oy] = origin(zoneFiles[i].parent);
		states.push(state('zone', m.id, { ...zoneFiles[i], x: m.x - ox, y: m.y - oy }));
	});
	cards.forEach((m, i) => {
		const [ox, oy] = origin(cardFiles[i].zone);
		states.push(state('card', m.id, { ...cardFiles[i], x: m.x - ox, y: m.y - oy }));
	});
	drawings.forEach((m, i) => {
		const [ox, oy] = origin(drawingFiles[i].zone);
		states.push(state('drawing', m.id, { ...drawingFiles[i], x: m.x - ox, y: m.y - oy }));
	});
	return states;
}

/** Gives a card a new world rectangle. Resizing from the left or top moves its corner too, but
 * never its zone: only a move changes membership. */
export function resizeCard(e: Edit, id: string, x: number, y: number, w: number, h: number) {
	return edit(e, 'card', [id], (card) => {
		const at = card.zone === null ? undefined : e.layout.places.get(card.zone);
		Object.assign(card, { x: x - (at?.x ?? 0), y: y - (at?.y ?? 0), w, h });
	});
}

export const alignCards = (e: Edit, ids: string[], halign: HAlign, valign: VAlign) =>
	edit(e, 'card', ids, (card) => Object.assign(card, { halign, valign }));

/** Turns an unresolved card into an empty one. */
export const clearCard = (e: Edit, id: string) => edit(e, 'card', [id], (card) => (card.note = null));

/** Deletes cards and the edges that touch them. Their notes stay, unplaced. */
export async function deleteCards(e: Edit, ids: string[]) {
	const edges = await edgesTouching(e, ids);
	return apply(e, [...edges.map((id) => gone('edge', id)), ...ids.map((id) => gone('card', id))]);
}
