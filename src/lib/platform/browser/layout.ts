// The zones, held in memory while their vault is open: a vault has few, and the desktop walks them
// all on every query too. Where each sits follows from the `parent` links, as the desktop's `zabs`.
import type { Frame, Rect } from '#lib/api.js';
import type { Box } from './grid.ts';
import type { ZoneFile, ZoneRecord } from './records.ts';
import { wordSet } from './text.ts';

/** Where a zone sits: its absolute top-left corner, how deep it is nested and its outermost zone. */
export type Place = { x: number; y: number; depth: number; root: string };

export class Layout {
	readonly zones = new Map<string, ZoneRecord>();
	/** Every zone reachable from the canvas. A zone whose parent is missing sits on the canvas; a
	 * zone in a loop of parents sits nowhere, as on the desktop. */
	places = new Map<string, Place>();
	/** The zones directly inside each zone, by `parent` as written (null: the canvas). */
	kids = new Map<string | null, string[]>();
	/** Each zone's name, as search compares words. */
	words = new Map<string, string[]>();

	constructor(records: ZoneRecord[]) {
		for (const r of records) this.zones.set(r.id, r);
		this.refresh();
	}

	put(id: string, file: ZoneFile) {
		const was = this.zones.get(id);
		this.zones.set(id, { id, file, own: was?.own ?? 0, cbox: was?.cbox ?? null });
	}

	drop(id: string) {
		this.zones.delete(id);
	}

	refresh() {
		this.kids = new Map();
		this.words = new Map();
		for (const { id, file } of this.zones.values()) {
			const kids = this.kids.get(file.parent);
			if (kids) kids.push(id);
			else this.kids.set(file.parent, [id]);
			this.words.set(id, wordSet(file.name));
		}
		this.places = new Map();
		const walk: [string, Place][] = [];
		for (const { id, file } of this.zones.values()) {
			if (file.parent === null || !this.zones.has(file.parent)) walk.push([id, { x: file.x, y: file.y, depth: 0, root: id }]);
		}
		for (let i = 0; i < walk.length; i++) {
			const [id, at] = walk[i];
			this.places.set(id, at);
			if (at.depth >= 64) continue;
			for (const kid of this.kids.get(id) ?? []) {
				const f = this.zones.get(kid)!.file;
				walk.push([kid, { x: at.x + f.x, y: at.y + f.y, depth: at.depth + 1, root: at.root }]);
			}
		}
	}

	/** A zone's box in the world, its size as written; null when it sits nowhere. */
	frame(id: string): Frame | null {
		const at = this.places.get(id);
		const f = this.zones.get(id)?.file;
		return at && f ? { x: at.x, y: at.y, w: f.w, h: f.h } : null;
	}

	/** A zone's box, never inside out. */
	box(id: string): Box | null {
		const f = this.frame(id);
		return f && [f.x, f.y, f.x + Math.max(f.w, 0), f.y + Math.max(f.h, 0)];
	}

	/** A zone and every zone inside it, at any depth. */
	subtree(id: string) {
		const out = new Set([id]);
		for (const z of out) for (const kid of this.kids.get(z) ?? []) out.add(kid);
		return [...out];
	}

	/** The innermost zone that fully contains a world rectangle, with its absolute origin, skipping
	 * the zones in `skip` and every zone inside them. The canvas is null at (0, 0). */
	around(r: Rect, skip: string[] = []) {
		const out = new Set(skip.flatMap((id) => this.subtree(id)));
		let best: { zone: string; x: number; y: number; depth: number; area: number } | null = null;
		for (const [id, at] of this.places) {
			const f = this.zones.get(id)!.file;
			if (out.has(id) || at.x > r.minX || at.x + f.w < r.maxX || at.y > r.minY || at.y + f.h < r.maxY) continue;
			const area = f.w * f.h;
			if (!best || at.depth > best.depth || (at.depth === best.depth && area < best.area)) best = { zone: id, x: at.x, y: at.y, depth: at.depth, area };
		}
		return best ? { zone: best.zone, x: best.x, y: best.y } : { zone: null, x: 0, y: 0 };
	}

	/** The zones directly in `zone` (null: on the canvas). With `within`, only those lying fully
	 * inside it, in that zone's coordinates. */
	children(zone: string | null, within?: Rect) {
		const kids = this.kids.get(zone) ?? [];
		if (!within) return kids;
		return kids.filter((id) => fits(this.zones.get(id)!.file, within));
	}
}

/** Whether an item lies fully inside a rectangle, both in the same coordinates. */
export const fits = (f: Frame, r: Rect) => f.x >= r.minX && f.y >= r.minY && f.x + f.w <= r.maxX && f.y + f.h <= r.maxY;
