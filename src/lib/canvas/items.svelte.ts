// What the canvas holds: only the zones, cards and edges, or zoomed out the clusters and bundles,
// returned by the last viewport query.
import {
	queryViewport,
	type Bundle,
	type CardView,
	type Cluster,
	type EdgeView,
	type Frame,
	type Rect,
	type ZoneView
} from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { route } from './route.js';

/** Area queried around the screen, as a fraction of its size, so small pans need no new query. */
const MARGIN = 0.5;
/** Items smaller than this on screen are skipped. */
const MIN_PIXELS = 4;
/** Below this zoom, 14px card text would be under 6px on screen: zones collapse to their frame and
 * title, nothing inside them is queried, and loose cards are counted per cell of a grid. */
export const OPEN_ZOOM = 0.4;
/** Smallest side of a cell on screen, in pixels. A cell is a power of two world units wide, so it
 * measures 160 to 320 pixels, and four cells merge into one as the zoom halves. */
const CELL = 160;

/** The side of a cell at a zoom, in world units; null while zones are open. */
const cellAt = (zoom: number) => (zoom < OPEN_ZOOM ? 2 ** Math.ceil(Math.log2(CELL / zoom)) : null);

function grow(r: Rect, by: number): Rect {
	const dx = (r.maxX - r.minX) * by;
	const dy = (r.maxY - r.minY) * by;
	return { minX: r.minX - dx, minY: r.minY - dy, maxX: r.maxX + dx, maxY: r.maxY + dy };
}

export function inside(a: Rect, b: Rect) {
	return a.minX >= b.minX && a.minY >= b.minY && a.maxX <= b.maxX && a.maxY <= b.maxY;
}

/** The smallest world rectangle covering these boxes. */
export function cover(boxes: Frame[]): Rect {
	return {
		minX: Math.min(...boxes.map((b) => b.x)),
		minY: Math.min(...boxes.map((b) => b.y)),
		maxX: Math.max(...boxes.map((b) => b.x + b.w)),
		maxY: Math.max(...boxes.map((b) => b.y + b.h))
	};
}

class Items {
	zones = $state<ZoneView[]>([]);
	cards = $state<CardView[]>([]);
	edges = $state<EdgeView[]>([]);
	/** Zoomed out, the loose cards counted per cell, and the edges drawn as one line per pair of ends. */
	clusters = $state<Cluster[]>([]);
	bundles = $state<Bundle[]>([]);
	/** Whether the zones above were queried zoomed out, without what lies inside them. */
	collapsed = $state(false);
	/** Counts edits to the vault, so the lists beside the canvas reload after each. */
	revision = $state(0);
	#byId = $derived(new Map(this.cards.map((c) => [c.id, c])));
	#queried: Rect | null = null;
	#zoom = 1;
	#latest = 0;

	reset() {
		this.zones = [];
		this.cards = [];
		this.edges = [];
		this.clusters = [];
		this.bundles = [];
		this.collapsed = false;
		this.#queried = null;
	}

	/** The topmost card under a world point. */
	cardAt(p: { x: number; y: number }) {
		return this.cards.findLast((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
	}

	/** The topmost card within `margin` of a world point, or else the topmost zone. */
	itemAt(p: { x: number; y: number }, margin: number): CardView | ZoneView | undefined {
		const near = (i: CardView | ZoneView) =>
			p.x >= i.x - margin && p.x <= i.x + i.w + margin && p.y >= i.y - margin && p.y <= i.y + i.h + margin;
		return this.cards.findLast(near) ?? this.zones.findLast(near);
	}

	/** The card or zone on the canvas with this id, and which of the two it is. */
	find(id: string) {
		const card = this.#byId.get(id);
		if (card) return { item: card, kind: 'card' as const };
		const zone = this.zones.find((z) => z.id === id);
		if (zone) return { item: zone, kind: 'zone' as const };
	}

	/** Where an edge runs, between its cards as they are on the canvas, so it follows a drag, or
	 * as the query found them when they are off-screen. */
	routeOf(edge: EdgeView) {
		return route(this.#byId.get(edge.from) ?? edge.ends[0], this.#byId.get(edge.to) ?? edge.ends[1], edge);
	}

	/** The zones and cards on the canvas lying inside these zones, at any depth. */
	inside(zoneIds: string[]) {
		const zones = new Set(zoneIds);
		// Zones come parents first, so one pass reaches every depth.
		for (const z of this.zones) if (z.parent && zones.has(z.parent)) zones.add(z.id);
		return [
			...this.zones.filter((z) => z.parent && zones.has(z.parent)),
			...this.cards.filter((c) => c.zone && zones.has(c.zone))
		];
	}

	/** Queries again once the screen leaves the queried area, the zoom changed twofold, zones open or
	 * collapse, or cells change size. */
	update() {
		const zoomed = Math.abs(Math.log2(camera.zoom / this.#zoom)) >= 1;
		const crossed = cellAt(camera.zoom) !== cellAt(this.#zoom);
		if (this.#queried && inside(camera.visible, this.#queried) && !zoomed && !crossed) return;
		void this.refresh();
	}

	/** Redraws after an edit to the vault. */
	changed() {
		this.revision++;
		return this.refresh();
	}

	/** Queries the area around the screen now. Answers to older queries are dropped. */
	async refresh() {
		const query = ++this.#latest;
		this.#queried = grow(camera.visible, MARGIN);
		this.#zoom = camera.zoom;
		const cell = cellAt(camera.zoom);
		const found = await queryViewport(this.#queried, MIN_PIXELS / camera.zoom, cell);
		if (query !== this.#latest) return;
		// Zones change look with the answer, so they never collapse over cards still on the canvas.
		this.collapsed = cell !== null;
		this.zones = found.zones;
		this.cards = found.cards;
		this.edges = found.edges;
		this.clusters = found.clusters;
		this.bundles = found.bundles;
	}
}

export const items = new Items();
