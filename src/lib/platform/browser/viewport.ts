// The viewport query: zones, cards and edges meeting a world rectangle, through the grid. Zoomed out,
// the outermost zones, the loose cards' clusters and the bundles, read from the counts and boxes kept
// per cell on every write, never from the cards themselves.
import type { Bundle, BundleEnd, CardView, Cluster, EdgeView, Rect, Viewport, ZoneView } from '#lib/api.js';
import type { Edit } from './apply.ts';
import { type Box, boxOf, frameOf, large, meets } from './grid.ts';
import { request } from './idb.ts';
import { inGrid } from './lookups.ts';
import type { BundleRecord, CardRecord, ClusterRecord, EdgeRecord } from './records.ts';
import { CELLS } from './settle.ts';
import { bounds } from './tally.ts';

export async function viewport(e: Edit, rect: Rect, minSize: number, cell: number | null): Promise<Viewport> {
	const zones = zonesIn(e, rect, minSize, cell);
	if (cell !== null) {
		if (!CELLS.includes(cell)) throw new Error(`the zoomed-out map is kept for cells of ${CELLS.join(', ')}, not ${cell}`);
		const clusters = await clustersIn(e, rect, cell);
		return { zones, cards: [], edges: [], clusters, bundles: await bundlesIn(e, rect, cell, clusters) };
	}
	const [cards, edges] = await Promise.all([
		inGrid<CardRecord>(e.tx.objectStore('cards'), rect),
		inGrid<EdgeRecord>(e.tx.objectStore('edges'), rect)
	]);
	const shown = (b: Box) => meets(b, rect) && large(b, minSize);
	return {
		zones,
		cards: cards
			.filter((c) => shown(boxOf({ x: c.ax, y: c.ay, w: c.file.w, h: c.file.h })))
			.sort((a, b) => (a.id < b.id ? -1 : 1))
			.map(cardView),
		edges: edges.filter((edge) => edge.ends && shown(bounds(edge.ends))).map(edgeView),
		clusters: [],
		bundles: []
	};
}

/** The zones meeting the rectangle, parents first; zoomed out, the outermost alone. */
function zonesIn(e: Edit, rect: Rect, minSize: number, cell: number | null): ZoneView[] {
	const found: (ZoneView & { depth: number })[] = [];
	for (const [id, at] of e.layout.places) {
		if (cell !== null && at.depth > 0) continue;
		const { file } = e.layout.zones.get(id)!;
		const box = e.layout.box(id)!;
		if (!meets(box, rect) || !large(box, minSize)) continue;
		found.push({ id, parent: file.parent, name: file.name, color: file.color ?? null, x: at.x, y: at.y, w: file.w, h: file.h, depth: at.depth });
	}
	return found.sort((a, b) => a.depth - b.depth).map(({ depth: _, ...zone }) => zone);
}

const cardView = ({ id, file, ax, ay, title, excerpt, resolved }: CardRecord): CardView => ({
	id,
	note: file.note,
	zone: file.zone,
	x: ax,
	y: ay,
	w: file.w,
	h: file.h,
	halign: file.halign ?? 'left',
	valign: file.valign ?? 'top',
	color: file.color ?? null,
	title,
	excerpt,
	resolved
});

const edgeView = ({ id, file, ends }: EdgeRecord): EdgeView => ({
	id,
	from: file.from,
	to: file.to,
	label: file.label ?? null,
	shape: file.shape ?? 'curved',
	arrow: file.arrow ?? 'to',
	stroke: file.stroke ?? 'solid',
	ends: ends!
});

/** The loose cards in the `cell`-sized squares the rectangle touches, counted per square. Every
 * square comes back whole, with all its cards, even those beyond the rectangle. */
async function clustersIn(e: Edit, rect: Rect, cell: number): Promise<Cluster[]> {
	const [x0, y0, x1, y1] = [rect.minX, rect.minY, rect.maxX, rect.maxY].map((v) => Math.floor(v / cell));
	// One read for the whole stripe of columns: a cluster is small, a read is not.
	const range = IDBKeyRange.bound([cell, x0, y0], [cell, x1, y1]);
	const found = (await request(e.tx.objectStore('clusters').getAll(range))) as ClusterRecord[];
	return found.filter((c) => c.cy >= y0 && c.cy <= y1).map(cluster);
}

const cluster = (c: ClusterRecord): Cluster => ({ cell: [c.cx, c.cy], count: c.count, ...frameOf(c.box) });

/** The bundles one of whose edges may cross the rectangle: those whose edges' box meets it. */
async function bundlesIn(e: Edit, rect: Rect, cell: number, clusters: Cluster[]): Promise<Bundle[]> {
	// Every bundle at this cell size: they are few, and a zoomed-out window spans much of the canvas,
	// where a grid would hand back a long bundle once per square.
	const range = IDBKeyRange.bound([cell, '', ''], [cell, '￿', '￿']);
	const found = ((await request(e.tx.objectStore('bundles').getAll(range))) as BundleRecord[]).filter((b) => meets(b.box, rect));
	// The clusters at their ends: those in view are already read.
	const known = new Map<string, Cluster>(clusters.map((c) => [`c${c.cell[0]},${c.cell[1]}`, c]));
	const wanted = [...new Set(found.flatMap((b) => [b.a, b.b]).filter((end) => end[0] === 'c' && !known.has(end)))];
	const store = e.tx.objectStore('clusters');
	const read = await Promise.all(wanted.map((end) => request(store.get([cell, ...end.slice(1).split(',').map(Number)])) as Promise<ClusterRecord | undefined>));
	read.forEach((c, i) => c && known.set(wanted[i], cluster(c)));
	const endOf = (end: string): BundleEnd | null => {
		if (end[0] === 'z') {
			const f = e.layout.frame(end.slice(1));
			return f && { zone: end.slice(1), ...f };
		}
		const c = known.get(end);
		return c ? { zone: null, x: c.x, y: c.y, w: c.w, h: c.h } : null;
	};
	const bundles: { order: [string, string]; bundle: Bundle }[] = [];
	for (const b of found) {
		// The desktop's order of ends: zones before clusters, zones by ID, clusters by column then row.
		const [first, second, atFirst, atSecond] = before(b.a, b.b) ? [b.a, b.b, b.ha > 0, b.hb > 0] : [b.b, b.a, b.hb > 0, b.ha > 0];
		// A lone arrowhead goes on the second end, as an edge's goes on `to`.
		const [from, to] = atFirst && !atSecond ? [second, first] : [first, second];
		const ends = [endOf(from), endOf(to)];
		if (!ends[0] || !ends[1]) continue;
		const arrow = atFirst && atSecond ? 'both' : atFirst || atSecond ? 'to' : 'none';
		bundles.push({ order: [first, second], bundle: { ends: ends as [BundleEnd, BundleEnd], count: b.count, arrow } });
	}
	return bundles.sort((x, y) => (x.order[0] !== y.order[0] ? (before(x.order[0], y.order[0]) ? -1 : 1) : before(x.order[1], y.order[1]) ? -1 : 1)).map((b) => b.bundle);
}

/** Whether end `a` comes before end `b` in the desktop's order. */
function before(a: string, b: string) {
	if (a[0] !== b[0]) return a[0] === 'z';
	if (a[0] === 'z') return a < b;
	const [ax, ay] = a.slice(1).split(',').map(Number);
	const [bx, by] = b.slice(1).split(',').map(Number);
	return ax < bx || (ax === bx && ay < by);
}
