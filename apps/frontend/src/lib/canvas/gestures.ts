// Pointer gestures on cards, zones, edges and drawings: a press selects, a drag moves the selected
// cards, zones and drawings, a handle on a side or corner resizes. Items change on screen as the pointer moves; the
// files are written on release.
import {
	moveCards,
	moveDrawings,
	moveZones,
	resizeCard,
	resizeZone,
	scaleMindmap,
	zoneContents,
	type CardView,
	type DrawingView,
	type ItemState,
	type Rect,
	type ZoneView
} from '#lib/api.js';
import { isMod } from '#lib/keys.js';
import { guides, lines, pull, type Axis } from './align.js';
import { camera } from './camera.svelte.js';
import { track } from './drag.js';
import { snap, toGrid } from './grid.svelte.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { mindmapFit } from './mindmapFit.svelte.js';
import { selection } from './selection.svelte.js';
import { videoOf } from './video.js';

/** Smallest card or zone, in world units: 3 by 2 graph-paper squares. */
export const MIN = { w: 60, h: 40 };
/** Size of a newly placed card, in world units: 12 by 7 squares. */
export const NEW_CARD = { w: 240, h: 140 };
/** Size of a newly placed post-it, in world units: 10 by 10 squares. */
export const NEW_POSTIT = { w: 200, h: 200 };
/** Size of a newly placed mindmap, in world units: 24 by 15 squares, while maps fit their cards. */
export const NEW_MINDMAP = { w: 480, h: 300 };
/** About the size of a new mindmap's card holding its empty root, while cards take their maps' size. */
export const NEW_ROOT = { w: 80, h: 64 };

/** Each mindmap drawn whose card takes its map's size, by its card: its map at its own size, and the
 * card's padding around it, so resizing the card scales the map. */
export const mindmaps = new Map<string, { w: number; h: number; pad: { x: number; y: number } }>();
/** Width of a resize handle on a side or corner, in screen pixels, half of it outside the item. */
export const GRIP = 10;
/** How near, in screen pixels, a side or middle is pulled onto one of a card around it. */
const REACH = 6;

/** Where a new card of this size lies, centered on a world point. */
export function newCardAt(p: { x: number; y: number }, size = NEW_CARD) {
	return { x: Math.round(p.x - size.w / 2), y: Math.round(p.y - size.h / 2), ...size };
}

type Item = CardView | ZoneView;

const drops = (moved: (Item | DrawingView)[]) => moved.map(({ id, x, y }) => ({ id, x, y }));

/** The cards on screen, other than these, for what is moved or resized to line up with. */
function around(skip: Set<string>) {
	const v = camera.visible;
	return items.cards
		.filter((c) => !skip.has(c.id) && c.x < v.maxX && c.x + c.w > v.minX && c.y < v.maxY && c.y + c.h > v.minY)
		.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** A press on a node of a closed mindmap: a click runs `click`, which opens it at that node, and
 * leaves the card unselected; a drag moves the card, as a press on it would, from where it was
 * pressed. Shift and Mod presses are the card's. */
export function pressNode(down: PointerEvent, card: CardView, click: () => void) {
	if (down.button !== 0 || isMod(down)) return;
	if (down.shiftKey) return startMove(down, card);
	down.stopPropagation();
	let moving = false;
	track(down, {
		move() {
			if (!moving) startMove(down, card);
			moving = true;
		},
		end(dragged) {
			if (!dragged) click();
		}
	});
}

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
	// The item pressed lines up with the cards around or lands on the grid, and the others keep their
	// places around it. Pressing an edge moves its selection, led by the first item in it.
	const lead = moving.find((m) => m.item.id === item.id) ?? moving[0];
	const still = around(new Set(moving.map((m) => m.item.id)));
	track(down, {
		move(dx, dy, e) {
			selection.dragging = true;
			const by = { x: Math.round(dx / camera.zoom), y: Math.round(dy / camera.zoom) };
			// Alt held moves freely.
			const snapping = lead && snap.on && !e.altKey;
			if (snapping) {
				// A side or the middle within reach of one of a card around lands on it, or else the
				// corner lands on the grid.
				const at = { x: lead.x + by.x, y: lead.y + by.y, w: lead.item.w, h: lead.item.h };
				const reach = REACH / camera.zoom;
				by.x += pull(lines(at, 'x'), still, 'x', reach) ?? toGrid(at.x) - at.x;
				by.y += pull(lines(at, 'y'), still, 'y', reach) ?? toGrid(at.y) - at.y;
			}
			for (const m of moving) {
				m.item.x = m.x + by.x;
				m.item.y = m.y + by.y;
			}
			snap.guides = snapping ? guides(lead.item, still) : [];
		},
		end(dragged) {
			snap.guides = [];
			selection.dragging = false;
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
	const still = around(new Set([item.id]));
	// A YouTube video's width over its height: 16:9, or a Short's 9:16. Null for anything else.
	const video = 'kind' in item && item.kind === 'link' && item.link !== null ? videoOf(item.link) : null;
	const ratio = video ? (video.upright ? 9 / 16 : 16 / 9) : null;
	// A mindmap whose card takes its map's size scales its map instead, the card keeping the map's shape.
	const onMap = 'kind' in item && item.kind === 'mindmap' && item.view === 'map';
	const map = onMap && !mindmapFit.on ? mindmaps.get(item.id) : undefined;
	// A pulled side within reach of a side or the middle of a card around lands on it, or else on the grid.
	const land = (v: number, axis: Axis) => v + (pull([v], still, axis, REACH / camera.zoom) ?? toGrid(v) - v);
	track(down, {
		move(dx, dy, e) {
			selection.dragging = true;
			let bx = dx / camera.zoom;
			let by = dy / camera.zoom;
			// Alt held resizes freely.
			const snapping = snap.on && !e.altKey;
			if (snapping) {
				bx = land(side.x + bx, 'x') - side.x;
				by = land(side.y + by, 'y') - side.y;
			}
			item.w = stretch(from.w, px, bx, MIN.w);
			item.h = stretch(from.h, py, by, MIN.h);
			// An image keeps its shape, led by the side pulled further.
			if ('kind' in item && item.kind === 'image') {
				const scale = Math.max(px ? item.w / from.w : 0, py ? item.h / from.h : 0, MIN.w / from.w, MIN.h / from.h);
				[item.w, item.h] = [Math.round(from.w * scale), Math.round(from.h * scale)];
			}
			// A video takes its own shape, whatever the card's was, led as an image is.
			if (ratio) {
				const w = Math.max(px ? item.w : 0, py ? item.h * ratio : 0, MIN.w, MIN.h * ratio);
				[item.w, item.h] = [Math.round(w), Math.round(w / ratio)];
			}
			// Led as an image is, the map's padding staying as it is, never smaller than a card.
			if (map && 'scale' in item) {
				const { w, h, pad } = map;
				const along = (side: number, size: number, padding: number) => (side - padding) / size;
				const scale = Math.max(
					px ? along(item.w, w, pad.x) : 0,
					py ? along(item.h, h, pad.y) : 0,
					along(MIN.w, w, pad.x),
					along(MIN.h, h, pad.y)
				);
				[item.w, item.h, item.scale] = [w * scale + pad.x, h * scale + pad.y, scale];
			}
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
			// Only the pulled sides show the lines they share.
			const pulled = { x: px ? [px < 0 ? item.x : item.x + item.w] : [], y: py ? [py < 0 ? item.y : item.y + item.h] : [] };
			snap.guides = snapping ? guides(item, still, pulled) : [];
		},
		end(dragged) {
			snap.guides = [];
			selection.dragging = false;
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
			if (map && 'scale' in item) history.edit(() => scaleMindmap(id, x, y, w, h, item.scale));
			else history.edit(() => (kind === 'zone' ? resizeZone : resizeCard)(id, x, y, w, h));
		}
	});
}
