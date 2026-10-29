// Pointer gestures on cards, zones, edges and drawings: a press selects, a drag moves the selected
// cards, zones and drawings, a handle on a side or corner resizes. Items change on screen as the pointer moves; the
// files are written on release.
import {
	moveCards,
	moveDrawings,
	moveZones,
	resizeCard,
	resizeZone,
	zoneContents,
	type CardView,
	type DrawingView,
	type ItemState,
	type Rect,
	type ZoneView
} from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { track } from './drag.js';
import { snap, toGrid } from './grid.svelte.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** Smallest card or zone, in world units: 3 by 2 graph-paper squares. */
export const MIN = { w: 60, h: 40 };
/** Size of a newly placed card, in world units: 12 by 7 squares. */
export const NEW_CARD = { w: 240, h: 140 };
/** Width of a resize handle on a side or corner, in screen pixels, half of it outside the item. */
export const GRIP = 10;

/** Where a new card lies, centered on a world point. */
export function newCardAt(p: { x: number; y: number }) {
	return { x: Math.round(p.x - NEW_CARD.w / 2), y: Math.round(p.y - NEW_CARD.h / 2), ...NEW_CARD };
}

type Item = CardView | ZoneView;

const drops = (moved: (Item | DrawingView)[]) => moved.map(({ id, x, y }) => ({ id, x, y }));

export function startMove(down: PointerEvent, item: { id: string }) {
	if (down.button !== 0) return;
	// Pressing an item never pans the canvas or clears the selection.
	down.stopPropagation();
	if (selection.editing === item.id) return;
	const wasSelected = selection.has(item.id);
	if (down.shiftKey) selection.toggle(item.id);
	else if (!wasSelected) selection.only(item.id);
	if (!selection.has(item.id)) return;

	// What lies inside a selected zone travels with it and is not dropped on its own.
	const inside = items.inside(selection.zones.map((z) => z.id));
	const carried = new Set(inside.map((i) => i.id));
	const zones = selection.zones.filter((z) => !carried.has(z.id));
	const cards = selection.cards.filter((c) => !carried.has(c.id));
	const drawings = selection.drawings.filter((d) => !carried.has(d.id));
	const moving = [...zones, ...cards, ...drawings, ...inside].map((i) => ({ item: i, x: i.x, y: i.y }));
	// The item pressed lands on the grid and the others keep their places around it. Pressing an
	// edge moves its selection, led by the first item in it.
	const lead = moving.find((m) => m.item.id === item.id) ?? moving[0];
	track(down, {
		move(dx, dy, e) {
			const by = { x: Math.round(dx / camera.zoom), y: Math.round(dy / camera.zoom) };
			// Alt held moves freely.
			if (lead && snap.on && !e.altKey) {
				by.x = toGrid(lead.x + by.x) - lead.x;
				by.y = toGrid(lead.y + by.y) - lead.y;
			}
			for (const m of moving) {
				m.item.x = m.x + by.x;
				m.item.y = m.y + by.y;
			}
		},
		end(dragged) {
			if (dragged) {
				// Back where it started, as a short drag can snap, nothing is written.
				if (!lead || (lead.item.x === lead.x && lead.item.y === lead.y)) return;
				// Zones land first, so cards and drawings dropped along with them find them where they now are.
				history.edit(async () => [
					...(await moveZones(drops(zones))),
					...(await moveCards(drops(cards))),
					...(await moveDrawings(drops(drawings)))
				]);
			} else if (wasSelected && !down.shiftKey) {
				// A plain click on one item of a larger selection keeps just that item.
				selection.only(item.id);
			}
		}
	});
}

/** Which way a handle pulls on each axis: -1 the left or top side, 1 the right or bottom, 0 neither. */
export type Pull = -1 | 0 | 1;

/** New length of one side when its edge is pulled `by` world units. */
function stretch(length: number, pull: Pull, by: number, min: number) {
	return pull ? Math.max(min, Math.round(length + pull * by)) : length;
}

export function startResize(down: PointerEvent, item: Item, kind: ItemState['kind'], px: Pull, py: Pull) {
	if (down.button !== 0) return;
	// Pressing a handle never pans the canvas or clears the selection. On the item being edited,
	// cancelling the press stops the mouse events that would take focus from its editor.
	down.stopPropagation();
	if (selection.editing === item.id) down.preventDefault();
	const from = { x: item.x, y: item.y, w: item.w, h: item.h };
	// Where the pulled sides start.
	const side = { x: px > 0 ? from.x + from.w : from.x, y: py > 0 ? from.y + from.h : from.y };
	// A zone can't shrink smaller than the area its contents cover.
	let cover: Rect | null = null;
	if (kind === 'zone') zoneContents(item.id).then((r) => (cover = r));
	track(down, {
		move(dx, dy, e) {
			let bx = dx / camera.zoom;
			let by = dy / camera.zoom;
			// The pulled sides land on the grid. Alt held resizes freely.
			if (snap.on && !e.altKey) {
				bx = toGrid(side.x + bx) - side.x;
				by = toGrid(side.y + by) - side.y;
			}
			item.w = stretch(from.w, px, bx, MIN.w);
			item.h = stretch(from.h, py, by, MIN.h);
			// Pulling the left or top edge keeps the opposite edge in place.
			item.x = px < 0 ? from.x + from.w - item.w : from.x;
			item.y = py < 0 ? from.y + from.h - item.h : from.y;
			if (cover) {
				const right = Math.max(item.x + item.w, cover.maxX);
				const bottom = Math.max(item.y + item.h, cover.maxY);
				item.x = Math.min(item.x, cover.minX);
				item.y = Math.min(item.y, cover.minY);
				item.w = right - item.x;
				item.h = bottom - item.y;
			}
		},
		end(dragged) {
			const { id, x, y, w, h } = item;
			// A click on a side or corner selects the item, as a click inside it does.
			if (!dragged) {
				if (selection.editing === id) return;
				if (down.shiftKey) selection.toggle(id);
				else selection.only(id);
				return;
			}
			// Back to its size, as a short drag can snap, nothing is written.
			if (x === from.x && y === from.y && w === from.w && h === from.h) return;
			history.edit(() => (kind === 'zone' ? resizeZone : resizeCard)(id, x, y, w, h));
		}
	});
}
