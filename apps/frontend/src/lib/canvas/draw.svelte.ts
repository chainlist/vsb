// Drawing with Mod+drag, Mod being Ctrl (Cmd on macOS): from a card, an edge to the card it is
// released on, or to a new card where it is released on the paper; anywhere else on the paper, a
// zone, which takes in the cards and zones fully inside it. The draft follows the pointer; the item
// is created on release.
import { createCard, createEdge, createZone, type CardView, type Frame } from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { spotAt } from './child.js';
import { track } from './drag.js';
import { MIN, NEW_CARD } from './gestures.js';
import { GRID, snap } from './grid.svelte.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { route } from './route.js';
import { selection } from './selection.svelte.js';

type Point = { x: number; y: number };

/** The zone or the edge being drawn, in world coordinates. An edge's draft ends at the card it
 * would connect to, or at the pointer. */
export const draft = $state<{ box: Frame | null; link: [Frame, Frame] | null }>({ box: null, link: null });

/** Starts drawing from a world point. */
export function startDraw(down: PointerEvent, from: Point) {
	const card = items.cardAt(from);
	if (card) connect(down, card, from);
	else drawZone(down, from);
}

function drawZone(down: PointerEvent, from: Point) {
	track(down, {
		move(dx, dy) {
			const to = { x: from.x + dx / camera.zoom, y: from.y + dy / camera.zoom };
			const x = Math.round(Math.min(from.x, to.x));
			const y = Math.round(Math.min(from.y, to.y));
			draft.box = { x, y, w: Math.round(Math.max(from.x, to.x)) - x, h: Math.round(Math.max(from.y, to.y)) - y };
		},
		end() {
			const box = draft.box;
			draft.box = null;
			if (!box || box.w < MIN.w || box.h < MIN.h) return;
			// Drawn inside a collapsed zone, the new zone would land in it, hidden.
			const within = (z: Frame) => box.x >= z.x && box.y >= z.y && box.x + box.w <= z.x + z.w && box.y + box.h <= z.y + z.h;
			if (items.collapsed && items.zones.some(within)) return;
			// Like a placed card, the new zone opens for editing: its name.
			history.edit(async () => {
				const { id, undo } = await createZone(box.x, box.y, box.w, box.h);
				selection.only(id);
				selection.editing = id;
				return undo;
			});
		}
	});
}

/** Releasing on the paper adds a card there; on the card it started from, it connects nothing. */
function connect(down: PointerEvent, card: CardView, from: Point) {
	let target: CardView | undefined;
	let paper: Point | undefined;
	track(down, {
		move(dx, dy) {
			const to = { x: from.x + dx / camera.zoom, y: from.y + dy / camera.zoom };
			target = items.cardAt(to);
			paper = target ? undefined : to;
			if (target?.id === card.id) target = undefined;
			draft.link = [card, target ?? { ...to, w: 0, h: 0 }];
		},
		end() {
			draft.link = null;
			if (paper) return addLinked(card, paper);
			if (!target) return;
			const to = target.id;
			history.edit(async () => {
				const { id, undo } = await createEdge(card.id, to);
				selection.only(id);
				return undo;
			});
		}
	});
}

/** Adds an empty card where an edge drawn from `card` was released on the paper, the middle of its
 * side facing `card` on that point, connected from `card` and open for typing. It joins the zone
 * under its center, as a placed card does. The card and its edge are one undo step. */
function addLinked(card: CardView, at: Point) {
	// The side a curved line reaches, whatever the style: a straight line drawn to a point always
	// arrives across.
	const { into } = route(card, { ...at, w: 0, h: 0 }, { shape: 'curved', arrow: 'none' });
	const { x, y, w, h } = spotAt(at, into, NEW_CARD, snap.on ? GRID : 0);
	history.edit(async () => {
		const id = await createCard(x, y, w, h);
		const { undo } = await createEdge(card.id, id);
		camera.reveal({ minX: x, minY: y, maxX: x + w, maxY: y + h });
		selection.only(id);
		selection.editing = id;
		return [{ kind: 'card', id, value: null }, ...undo];
	});
}
