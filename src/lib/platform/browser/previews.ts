// Zoomed out, a collapsed zone shows what it holds, at any depth: every card as a block of its color,
// every inner zone as a frame and every drawing's strokes, at their real place and size. Read from
// what each zone keeps of its cards, in memory, never from the cards themselves.
import type { Frame, Preview, Rect, ZoneView } from '#lib/api.js';
import { boxOf, large, meets } from './grid.ts';
import type { Layout } from './layout.ts';
import type { DrawingRecord } from './records.ts';

/** Top to bottom, then left to right, as the desktop lists them. */
const byPlace = (a: Frame, b: Frame) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h;

/** The plain stock or ink first, then the colors by name. */
const byColor = ([a]: [string | null, unknown], [b]: [string | null, unknown]) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1);

/** The previews of the outermost `zones`: the cards and the inner zones meeting `rect` and at least
 * `minSize` wide or tall, and the `drawings` given, those meeting it and large enough in zones, oldest
 * first, in their outermost zone's coordinates. */
export function previews(layout: Layout, rect: Rect, minSize: number, zones: ZoneView[], drawings: DrawingRecord[]): Preview[] {
	const shown = (f: Frame) => meets(boxOf(f), rect) && large(boxOf(f), minSize);
	const found: Preview[] = [];
	for (const top of [...zones].sort((a, b) => (a.id < b.id ? -1 : 1))) {
		const local = (f: Frame): Frame => ({ x: f.x - top.x, y: f.y - top.y, w: f.w, h: f.h });
		const tints = new Map<string | null, Frame[]>();
		const inner: Frame[] = [];
		for (const zone of layout.subtree(top.id)) {
			for (const card of layout.cards(zone).filter(shown)) {
				const boxes = tints.get(card.color) ?? tints.set(card.color, []).get(card.color)!;
				boxes.push(local(card));
			}
			const frame = zone === top.id ? null : layout.frame(zone);
			if (frame && shown(frame)) inner.push(local(frame));
		}
		const cards = [...tints].sort(byColor).map(([color, boxes]) => ({ color, boxes: boxes.sort(byPlace) }));
		const inks = new Map<string | null, Preview['inks'][number]['drawings']>();
		for (const d of drawings.filter((d) => d.root === top.id)) {
			const color = d.file.color ?? null;
			const sketches = inks.get(color) ?? inks.set(color, []).get(color)!;
			sketches.push({ x: d.ax - top.x, y: d.ay - top.y, strokes: d.file.strokes });
		}
		const ink = [...inks].sort(byColor).map(([color, drawings]) => ({ color, drawings }));
		if (cards.length || inner.length || ink.length) found.push({ zone: top.id, cards, zones: inner.sort(byPlace), inks: ink });
	}
	return found;
}
