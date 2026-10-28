// Zone edits: drawing, moving, resizing, renaming, recoloring and deleting, as on the desktop. Like
// card edits, each builds target item states and hands them to `apply`, so every edit can be undone.
import type { Created, ItemState, Move, Rect } from '#lib/api.js';
import { apply, edit, edited, gone, read, state, type Edit } from './apply.ts';
import { cover, rectAt } from './grid.ts';
import { children } from './lookups.ts';
import type { Kind, ZoneFile } from './records.ts';
import { zoneContents } from './scope.ts';
import { newId } from './ulid.ts';

/** Room a zone grown to hold cards leaves around them, in world units: a graph-paper square on the
 * sides and at the bottom, three at the top, where the zone's name is. */
const MARGIN = 20;
const NAME_ROOM = 60;

/** Draws a zone on a world rectangle, inside the innermost zone that fully contains it. The cards
 * and zones at that level lying fully inside the new zone join it, staying in place. */
export async function createZone(e: Edit, x: number, y: number, w: number, h: number): Promise<Created> {
	const at = e.layout.around(rectAt(x, y, w, h));
	const zone: ZoneFile = { name: '', parent: at.zone, x: x - at.x, y: y - at.y, w, h };
	const id = newId();
	const states = [state('zone', id, zone)];
	for (const [kind, item] of await children(e, zone.parent, rectAt(zone.x, zone.y, w, h))) {
		states.push(await rehomed(e, kind, item, id, -zone.x, -zone.y));
	}
	return { id, undo: await apply(e, states) };
}

/** Drops zones with their top-left corners at world positions. Each joins the innermost zone that
 * fully contains it, apart from the moving zones and what is inside them. What a zone holds comes
 * along; what it lands on is never captured. */
export function moveZones(e: Edit, moves: Move[]) {
	const ids = moves.map((m) => m.id);
	return edit(e, 'zone', ids, (zone, i) => {
		const at = e.layout.around(rectAt(moves[i].x, moves[i].y, zone.w, zone.h), ids);
		Object.assign(zone, { parent: at.zone, x: moves[i].x - at.x, y: moves[i].y - at.y });
	});
}

/** Gives a zone a new world rectangle, grown where needed to cover its contents, which stay in place. */
export async function resizeZone(e: Edit, id: string, x: number, y: number, w: number, h: number) {
	const contents = await zoneContents(e, id);
	const r = rectAt(x, y, w, h);
	return apply(e, await reshaped(e, id, contents ? cover(r, contents) : r));
}

/** The states that give a zone the world rectangle `r`, its contents staying in place: when its
 * corner moves, its direct children shift back by as much. */
async function reshaped(e: Edit, id: string, r: Rect): Promise<ItemState[]> {
	const at = e.layout.places.get(id);
	if (!at) throw new Error('zone not found');
	const [dx, dy] = [r.minX - at.x, r.minY - at.y];
	const zone = await read(e, 'zone', id);
	Object.assign(zone, { x: zone.x + dx, y: zone.y + dy, w: r.maxX - r.minX, h: r.maxY - r.minY });
	const states = [state('zone', id, zone)];
	if (dx !== 0 || dy !== 0) {
		for (const [kind, child] of await children(e, id)) states.push(await rehomed(e, kind, child, id, -dx, -dy));
	}
	return states;
}

/** The states that grow a zone where needed to hold cards covering the world rectangle `span`, its
 * contents staying in place, and the zone's world origin then. */
export async function holding(e: Edit, id: string, span: Rect) {
	const frame = e.layout.frame(id);
	if (!frame) throw new Error('zone not found');
	const box = rectAt(frame.x, frame.y, frame.w, frame.h);
	const grown = cover(box, { minX: span.minX - MARGIN, minY: span.minY - NAME_ROOM, maxX: span.maxX + MARGIN, maxY: span.maxY + MARGIN });
	const same = grown.minX === box.minX && grown.minY === box.minY && grown.maxX === box.maxX && grown.maxY === box.maxY;
	return { origin: [grown.minX, grown.minY] as [number, number], states: same ? [] : await reshaped(e, id, grown) };
}

export const renameZone = (e: Edit, id: string, name: string) => edit(e, 'zone', [id], (zone) => (zone.name = name));

/** Sets the color of cards and zones, as one edit; null for none, which leaves a card on the
 * theme's plain stock and a zone on its gray. */
export async function colorItems(e: Edit, cards: string[], zones: string[], color: string | null) {
	const paint = (item: { color?: string }) => {
		if (color === null) delete item.color;
		else item.color = color;
	};
	return apply(e, [...(await edited(e, 'card', cards, paint)), ...(await edited(e, 'zone', zones, paint))]);
}

/** Deletes zones. Their cards and child zones move up to the nearest zone that stays, or the
 * canvas, without moving on screen. Nothing inside is deleted. */
export async function deleteZones(e: Edit, ids: string[]) {
	const leaving = new Map(await Promise.all(ids.map(async (id) => [id, await read(e, 'zone', id)] as const)));
	/** The deleted zones from `id` upwards, until a zone that stays. */
	const chain = (id: string | null) => {
		const up: ZoneFile[] = [];
		for (let z = id === null ? undefined : leaving.get(id); z; z = z.parent === null ? undefined : leaving.get(z.parent)) up.push(z);
		return up;
	};
	// Parents first: an undo writes them back in this order.
	const order = [...ids].sort((a, b) => chain(leaving.get(a)!.parent).length - chain(leaving.get(b)!.parent).length);
	const states = order.map((id) => gone('zone', id));
	for (const id of order) {
		const up = chain(id);
		const to = up[up.length - 1].parent;
		const [dx, dy] = up.reduce(([x, y], z) => [x + z.x, y + z.y], [0, 0]);
		for (const [kind, child] of await children(e, id)) {
			if (!leaving.has(child)) states.push(await rehomed(e, kind, child, to, dx, dy));
		}
	}
	return apply(e, states);
}

/** A zone's or card's state once moved into zone `to` (null: the canvas) and shifted by (dx, dy). */
async function rehomed(e: Edit, kind: Kind, id: string, to: string | null, dx: number, dy: number) {
	if (kind === 'zone') {
		const z = await read(e, 'zone', id);
		return state('zone', id, { ...z, parent: to, x: z.x + dx, y: z.y + dy });
	}
	const c = await read(e, 'card', id);
	return state('card', id, { ...c, zone: to, x: c.x + dx, y: c.y + dy });
}
