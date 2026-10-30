// Copying and pasting, as on the desktop. Copying gathers the selected cards, zones and drawings,
// everything inside those zones and the edges between the cards, as a clip the clipboard carries.
// Pasting writes a clip back as new items: each gets a new ID, each card with text a new note. A clip
// names its items by the IDs they were copied from, only to join them to each other.
import type { Clip, ItemState, Pasted, Rect } from '#lib/api.js';
import { apply, read, state, type Edit } from './apply.ts';
import { cover, rectAt } from './grid.ts';
import { children, edgesAmong } from './lookups.ts';
import { bodyOf, newNote } from './notes.ts';
import { newId } from './ulid.ts';
import { holding } from './zones.ts';

/** Deepest nesting walked up from an item: a zone in a loop of parents sits nowhere. */
const DEPTH = 64;

type Clipped = 'zone' | 'card' | 'drawing';

/** Gathers the cards, zones and drawings named, everything inside those zones at any depth, and the
 * edges with both ends among the cards gathered. What lies inside a gathered zone comes with it, not
 * on its own. */
export async function copyItems(e: Edit, cards: string[], zones: string[], drawings: string[]): Promise<Clip> {
	const picked = new Set(zones);
	const clip: Clip = { x: 0, y: 0, w: 0, h: 0, zones: [], cards: [], drawings: [], edges: [] };
	for (const [kind, ids] of [['zone', zones], ['card', cards], ['drawing', drawings]] as const) {
		for (const id of ids) {
			const file = await read(e, kind, id);
			const zone = 'parent' in file ? file.parent : file.zone;
			if (!under(e, zone, picked)) await clipItem(e, clip, kind, id, null, origin(e, zone));
		}
	}
	for (const edge of await edgesAmong(e, clip.cards.map((c) => c.id))) clip.edges.push(await read(e, 'edge', edge.id));
	// Coordinates run from the corner of the box around what was copied on its own.
	const boxes = loose(clip);
	if (!boxes.length) return clip;
	const span = boxes.reduce(cover);
	const [dx, dy] = [span.minX, span.minY];
	for (const item of [...clip.zones, ...clip.cards, ...clip.drawings]) [item.x, item.y] = [item.x - dx, item.y - dy];
	return { ...clip, x: dx, y: dy, w: span.maxX - dx, h: span.maxY - dy };
}

/** Writes a clip as new items, its corner at the world point (x, y), as one edit. What was copied on
 * its own joins the innermost zone under the middle of what is pasted, other than the zones copied,
 * so a copy never lands inside its original; that zone grows to hold it. Undoing the paste keeps the
 * new notes, unplaced, as deleting any card does. */
export async function pasteItems(e: Edit, clip: Clip, x: number, y: number): Promise<Pasted> {
	const boxes = loose(clip);
	if (!boxes.length) return { ids: [], undo: [] };
	const at = boxes.reduce(cover);
	const span = rectAt(x + at.minX, y + at.minY, at.maxX - at.minX, at.maxY - at.minY);
	const middle = rectAt((span.minX + span.maxX) / 2, (span.minY + span.maxY) / 2, 0, 0);
	const landing = e.layout.around(middle, clip.zones.map((z) => z.id)).zone;
	const grown = landing === null ? null : await holding(e, landing, span);
	const [[ox, oy], states] = [grown?.origin ?? [0, 0], grown?.states ?? ([] as ItemState[])];
	const zones = new Map(clip.zones.map((z) => [z.id, { around: z, id: newId() }]));
	// An item's zone and corner there: inside its copied zone as it was, or else in the landing zone.
	const home = (zone: string | null, cx: number, cy: number): [string | null, number, number] => {
		const copied = zone === null ? undefined : zones.get(zone);
		return copied ? [copied.id, cx - copied.around.x, cy - copied.around.y] : [landing, x + cx - ox, y + cy - oy];
	};
	const ids: string[] = [];
	for (const { id: was, ...zone } of clip.zones) {
		const [parent, zx, zy] = home(zone.parent, zone.x, zone.y);
		const id = zones.get(was)!.id;
		if (parent === landing) ids.push(id);
		states.push(state('zone', id, { ...zone, parent, x: zx, y: zy }));
	}
	const cards = new Map<string, string>();
	for (const { id: was, text, ...card } of clip.cards) {
		const [zone, cx, cy] = home(card.zone, card.x, card.y);
		const note = text?.trim() ? await newNote(e, text) : null;
		const id = newId();
		if (zone === landing) ids.push(id);
		states.push(state('card', id, { ...card, note, zone, x: cx, y: cy }));
		cards.set(was, id);
	}
	for (const { id: _, ...drawing } of clip.drawings) {
		const [zone, dx, dy] = home(drawing.zone, drawing.x, drawing.y);
		const id = newId();
		if (zone === landing) ids.push(id);
		states.push(state('drawing', id, { ...drawing, zone, x: dx, y: dy }));
	}
	for (const edge of clip.edges) {
		const [from, to] = [cards.get(edge.from), cards.get(edge.to)];
		if (from && to && from !== to) states.push(state('edge', newId(), { ...edge, from, to }));
	}
	return { ids, undo: await apply(e, states) };
}

/** Adds an item to the clip at its absolute corner, its zone's origin plus its own corner, as copied
 * inside the zone `within` (null: on its own), and everything inside it when it is a zone. */
async function clipItem(e: Edit, clip: Clip, kind: Clipped, id: string, within: string | null, [ox, oy]: [number, number]) {
	if (kind === 'zone') {
		const zone = await read(e, 'zone', id);
		const [x, y] = [ox + zone.x, oy + zone.y];
		clip.zones.push({ id, ...zone, parent: within, x, y });
		for (const [kind, child] of await children(e, id)) await clipItem(e, clip, kind as Clipped, child, id, [x, y]);
	} else if (kind === 'card') {
		const { note, ...card } = await read(e, 'card', id);
		const text = note === null ? null : await bodyOf(e, note);
		clip.cards.push({ id, ...card, zone: within, x: ox + card.x, y: oy + card.y, text });
	} else {
		const drawing = await read(e, 'drawing', id);
		clip.drawings.push({ id, ...drawing, zone: within, x: ox + drawing.x, y: oy + drawing.y });
	}
}

/** A zone's absolute origin; the canvas's for null, or for a zone that sits nowhere. */
function origin(e: Edit, zone: string | null): [number, number] {
	const at = zone === null ? undefined : e.layout.places.get(zone);
	return at ? [at.x, at.y] : [0, 0];
}

/** Whether `zone`, or a zone around it, is one of `zones`. */
function under(e: Edit, zone: string | null, zones: Set<string>) {
	for (let i = 0; i < DEPTH && zone !== null; i++) {
		if (zones.has(zone)) return true;
		zone = e.layout.zones.get(zone)?.file.parent ?? null;
	}
	return false;
}

/** The boxes of what a clip holds on its own, not inside one of its zones. */
function loose(clip: Clip): Rect[] {
	const ids = new Set(clip.zones.map((z) => z.id));
	const inside = (zone: string | null) => zone !== null && ids.has(zone);
	return [
		...clip.zones.filter((z) => !inside(z.parent)),
		...clip.cards.filter((c) => !inside(c.zone)),
		...clip.drawings.filter((d) => !inside(d.zone))
	].map((b) => rectAt(b.x, b.y, b.w, b.h));
}
