// What the canvas holds: only the zones, cards and edges returned by the last viewport query.
import { queryViewport, type CardView, type EdgeView, type Rect, type ZoneView } from '#lib/api.js';
import { camera } from './camera.svelte.js';
import { route } from './route.js';

/** Area queried around the screen, as a fraction of its size, so small pans need no new query. */
const MARGIN = 0.5;
/** Items smaller than this on screen are skipped. */
const MIN_PIXELS = 4;
/** Below this zoom, 14px card text would be under 6px on screen: zones collapse to their frame and
 * title, and nothing inside them is queried. */
export const OPEN_ZOOM = 0.4;

const collapsedAt = (zoom: number) => zoom < OPEN_ZOOM;

function grow(r: Rect, by: number): Rect {
	const dx = (r.maxX - r.minX) * by;
	const dy = (r.maxY - r.minY) * by;
	return { minX: r.minX - dx, minY: r.minY - dy, maxX: r.maxX + dx, maxY: r.maxY + dy };
}

export function inside(a: Rect, b: Rect) {
	return a.minX >= b.minX && a.minY >= b.minY && a.maxX <= b.maxX && a.maxY <= b.maxY;
}

class Items {
	zones = $state<ZoneView[]>([]);
	cards = $state<CardView[]>([]);
	edges = $state<EdgeView[]>([]);
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
		this.collapsed = false;
		this.#queried = null;
	}

	/** The topmost card under a world point. */
	cardAt(p: { x: number; y: number }) {
		return this.cards.findLast((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
	}

	/** Whether a world point lies in a collapsed zone, where a card placed there would be hidden. */
	hides(p: { x: number; y: number }) {
		return this.collapsed && this.zones.some((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
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

	/** Queries again once the screen leaves the queried area, the zoom changed twofold, or zones
	 * open or collapse. */
	update() {
		const zoomed = Math.abs(Math.log2(camera.zoom / this.#zoom)) >= 1;
		const crossed = collapsedAt(camera.zoom) !== collapsedAt(this.#zoom);
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
		const collapsed = collapsedAt(camera.zoom);
		const found = await queryViewport(this.#queried, MIN_PIXELS / camera.zoom, collapsed);
		if (query !== this.#latest) return;
		// Zones change look with the answer, so they never collapse over cards still on the canvas.
		this.collapsed = collapsed;
		this.zones = found.zones;
		this.cards = found.cards;
		this.edges = found.edges;
	}
}

export const items = new Items();
