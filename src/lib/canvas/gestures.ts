// Pointer gestures on cards, zones and edges: a press selects, a drag moves the selected cards and
// zones, a handle on a side or corner resizes. Items change on screen as the pointer moves; the
// files are written on release.
import {
	moveCards,
	moveZones,
	resizeCard,
	resizeZone,
	zoneContents,
	type CardView,
	type ItemState,
	type Rect,
	type ZoneView
} from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { track } from './drag.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** Smallest card or zone, in world units: 3 by 2 graph-paper squares. */
export const MIN = { w: 60, h: 40 };
/** Size of a newly placed card, in world units: 12 by 7 squares. */
export const NEW_CARD = { w: 240, h: 140 };

/** Where a new card lies, centered on a world point. */
export function newCardAt(p: { x: number; y: number }) {
	return { x: Math.round(p.x - NEW_CARD.w / 2), y: Math.round(p.y - NEW_CARD.h / 2), ...NEW_CARD };
}

type Item = CardView | ZoneView;

const drops = (moved: Item[]) => moved.map(({ id, x, y }) => ({ id, x, y }));

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
	const moving = [...zones, ...cards, ...inside].map((i) => ({ item: i, x: i.x, y: i.y }));
	track(down, {
		move(dx, dy) {
			const by = { x: Math.round(dx / camera.zoom), y: Math.round(dy / camera.zoom) };
			for (const m of moving) {
				m.item.x = m.x + by.x;
				m.item.y = m.y + by.y;
			}
		},
		end(dragged) {
			if (dragged) {
				// Zones land first, so cards dropped along with them find them where they now are.
				history.edit(async () => [...(await moveZones(drops(zones))), ...(await moveCards(drops(cards)))]);
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
	// Cancelling the press stops the mouse events that would take focus from an open editor.
	down.preventDefault();
	down.stopPropagation();
	const from = { x: item.x, y: item.y, w: item.w, h: item.h };
	// A zone can't shrink smaller than the area its contents cover.
	let cover: Rect | null = null;
	if (kind === 'zone') zoneContents(item.id).then((r) => (cover = r));
	track(down, {
		move(dx, dy) {
			item.w = stretch(from.w, px, dx / camera.zoom, MIN.w);
			item.h = stretch(from.h, py, dy / camera.zoom, MIN.h);
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
			if (!dragged) return;
			const { id, x, y, w, h } = item;
			history.edit(() => (kind === 'zone' ? resizeZone : resizeCard)(id, x, y, w, h));
		}
	});
}
