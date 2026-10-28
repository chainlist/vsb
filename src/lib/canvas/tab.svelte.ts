// Tab on a lone selected card, or in the card being edited, adds a linked card after it: an empty
// card the way the card's edges already flow, beside its children there, with an edge to it. When
// they flow several ways, a picker asks which. The new card opens for typing, so Tab there chains.
import { tick } from 'svelte';
import { addChild, queryViewport, type CardView, type Rect } from '#lib/api.js';
import { NODE_GAP, RANK_GAP } from './batch.js';
import { batchDialog } from './batchDialog.svelte.js';
import { camera } from './camera.svelte.js';
import { children, firstSpot, lane, slide, ways, WAYS, type Link } from './child.js';
import { finished } from './editSession.js';
import { NEW_CARD } from './gestures.js';
import { GRID, snap } from './grid.svelte.js';
import { history } from './history.js';
import { items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

type Point = { x: number; y: number };

class Picker {
	/** The card whose new child's way is asked; null while nothing is. */
	card = $state<CardView | null>(null);
	#answer: (way: Point | null) => void = () => {};

	/** Which way the new child of `card` goes; null when the picker is cancelled. */
	ask(card: CardView) {
		this.card = card;
		return new Promise<Point | null>((resolve) => (this.#answer = resolve));
	}

	answer(way: Point | null) {
		this.card = null;
		this.#answer(way);
	}
}

export const picker = new Picker();

/** While a card is being added, Tab adds no other. */
let busy = false;

const box = (f: { x: number; y: number; w: number; h: number }): Rect => ({ minX: f.x, minY: f.y, maxX: f.x + f.w, maxY: f.y + f.h });

/** Adds a linked card after `card`, ending its edit first: the note is saved before the card is added. */
export async function addChildTo(card: CardView) {
	if (busy) return;
	busy = true;
	try {
		if (selection.editing === card.id) {
			selection.editing = null;
			await tick();
			await finished();
		}
		// Its edges as drawn, those running off-screen too: an edge's bounds cover both its cards.
		const { edges } = await queryViewport(box(card), 0, null);
		const links: Link[] = edges.filter((e) => e.from === card.id || e.to === card.id).map((e) => ({ ...e, ...items.routeOf(e) }));
		const found = ways(card.id, links);
		const way = found.length > 1 ? await picker.ask(card) : (found[0] ?? WAYS[batchDialog.direction]);
		if (!way) return;
		const grid = snap.on ? GRID : 0;
		const first = firstSpot(card, way, children(card.id, way, links), NEW_CARD, { rank: RANK_GAP, gap: NODE_GAP }, grid);
		// Every card along the way it may slide, off-screen and inside zones too.
		const { cards } = await queryViewport(lane(first, way, NODE_GAP), 0, null);
		const at = box(slide(first, way, cards, NODE_GAP, grid));
		await history.edit(async () => {
			const { id, undo } = await addChild(card.id, at);
			camera.reveal(at);
			selection.only(id);
			selection.editing = id;
			return undo;
		});
	} finally {
		busy = false;
	}
}
