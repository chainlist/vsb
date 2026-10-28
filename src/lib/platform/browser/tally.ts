// Counts and boxes kept per key: what each zone holds directly, each cluster square and each bundle,
// and how many cards show each note. A write adds and takes away; a box only shrinks when something
// reaching its side leaves, and then it is measured again from what is left.
import type { Frame } from '#lib/api.js';
import { type Box, boxOf, gridKey, touches, union } from './grid.ts';
import { request } from './idb.ts';
import type { Layout } from './layout.ts';
import { tray, type CardFile, type CardRecord, type ClusterRecord, type BundleRecord, type EdgeRecord, type NoteRecord } from './records.ts';
import type { Next } from './settle.ts';

type Entry = { key: IDBValidKey; count: number; ha: number; hb: number; adds: Box[]; removes: Box[] };

export class Tally {
	readonly entries = new Map<string, Entry>();

	/** One item in (1) or out (-1) of `key`, with its box and, for a bundle, the arrowheads it brings. */
	change(key: IDBValidKey, box: Box, sign: 1 | -1, ha = 0, hb = 0) {
		const id = JSON.stringify(key);
		let e = this.entries.get(id);
		if (!e) this.entries.set(id, (e = { key, count: 0, ha: 0, hb: 0, adds: [], removes: [] }));
		e.count += sign;
		e.ha += sign * ha;
		e.hb += sign * hb;
		(sign > 0 ? e.adds : e.removes).push(box);
	}
}

/** A card's box in its zone's coordinates, as zone contents count it. */
export const inZone = (f: CardFile): Box => [f.x, f.y, f.x + Math.max(f.w, 0), f.y + Math.max(f.h, 0)];

/** A card's box as clusters count it, its size as written. */
export const rawBox = (f: CardFile): Box => [f.x, f.y, f.x + f.w, f.y + f.h];

/** Where a card's end of an edge is drawn zoomed out, at a cell size: its outermost zone, or the
 * cluster square holding its center. */
export const end = (f: Frame, root: string, cell: number) =>
	root ? `z${root}` : `c${Math.floor((f.x + f.w / 2) / cell)},${Math.floor((f.y + f.h / 2) / cell)}`;

/** An edge's box: around both its cards. */
export const bounds = (ends: [Frame, Frame]) => union(boxOf(ends[0]), boxOf(ends[1]));

/** Counts an edge in or out of its bundle at each cell size, with the arrowheads it brings to each end. */
export function bundled(edge: EdgeRecord, bundles: Tally, sign: 1 | -1) {
	if (!edge.ends || !edge.bk) return;
	const arrow = edge.file.arrow ?? 'to';
	const [atFrom, atTo] = [+(arrow === 'both'), +(arrow !== 'none')];
	for (const key of edge.bk) {
		const fromFirst = end(edge.ends[0], edge.roots[0], key[0] as number) === key[1];
		bundles.change(key, bounds(edge.ends), sign, fromFirst ? atFrom : atTo, fromFirst ? atTo : atFrom);
	}
}

const cover = (boxes: Box[]) => (boxes.length ? boxes.reduce(union) : null);

/** Whether what left may have reached the box's side. */
const shrinks = (e: Entry, box: Box | null) => e.removes.length > 0 && (!box || e.removes.some((b) => touches(b, box)));

type Tallies = { zones: Tally; clusters: Tally; bundles: Tally; notes: Map<string, number> };

/** Writes what the tallies changed, after every item of the edit is written. */
export async function flush(tx: IDBTransaction, layout: Layout, t: Tallies, next: Next) {
	const cards = tx.objectStore('cards');
	const touched = new Set(next.zone.keys());
	await Promise.all(
		[...t.zones.entries.values()].map(async (e) => {
			const zone = layout.zones.get(e.key as string);
			if (!zone) return;
			touched.add(zone.id);
			if (shrinks(e, zone.cbox)) {
				const held = (await request(cards.index('zk').getAll(e.key))) as CardRecord[];
				zone.own = held.length;
				zone.cbox = cover(held.map((c) => inZone(c.file)));
			} else {
				zone.own += e.count;
				zone.cbox = cover([...(zone.cbox ? [zone.cbox] : []), ...e.adds]);
			}
		})
	);
	const zones = tx.objectStore('zones');
	for (const id of touched) {
		const zone = layout.zones.get(id);
		if (zone) zones.put(zone);
		else zones.delete(id);
	}

	const clusters = tx.objectStore('clusters');
	await update<ClusterRecord>(clusters, t.clusters, async (e, was) => {
		const [cell, cx, cy] = e.key as number[];
		if (!shrinks(e, was?.box ?? null)) return { cell, cx, cy, count: (was?.count ?? 0) + e.count, box: cover([...(was ? [was.box] : []), ...e.adds])! };
		const held = (await request(cards.index('cl').getAll(e.key))) as CardRecord[];
		return { cell, cx, cy, count: held.length, box: cover(held.map((c) => rawBox(c.file)))! };
	});

	const edges = tx.objectStore('edges');
	await update<BundleRecord>(tx.objectStore('bundles'), t.bundles, async (e, was) => {
		const [cell, a, b] = e.key as [number, string, string];
		let { count, ha, hb, adds } = e;
		let box = cover([...(was ? [was.box] : []), ...adds]);
		[count, ha, hb] = [count + (was?.count ?? 0), ha + (was?.ha ?? 0), hb + (was?.hb ?? 0)];
		if (shrinks(e, was?.box ?? null)) {
			const again = new Tally();
			for (const edge of (await request(edges.index('bk').getAll(e.key))) as EdgeRecord[]) bundled(edge, again, 1);
			const all = again.entries.get(JSON.stringify(e.key));
			[count, ha, hb, box] = all ? [all.count, all.ha, all.hb, cover(all.adds)] : [0, 0, 0, null];
		}
		return { cell, a, b, count, ha, hb, box: box!, g: box ? [cell, ...gridKey(box)] : [] };
	});

	const notes = tx.objectStore('notes');
	const ids = [...t.notes].filter(([, by]) => by !== 0).map(([id]) => id);
	const found = await Promise.all(ids.map((id) => request(notes.get(id)) as Promise<NoteRecord | undefined>));
	found.forEach((note, i) => note && notes.put(tray({ ...note, placed: note.placed + t.notes.get(ids[i])! })));
}

/** Reads each tallied record, works out what it now holds, and keeps it, or drops it when it holds nothing. */
async function update<T extends { count: number }>(store: IDBObjectStore, tally: Tally, next: (e: Entry, was: T | undefined) => Promise<T>) {
	const entries = [...tally.entries.values()];
	const was = await Promise.all(entries.map((e) => request(store.get(e.key)) as Promise<T | undefined>));
	await Promise.all(
		entries.map(async (e, i) => {
			const now = await next(e, was[i]);
			if (now.count > 0) store.put(now);
			else if (was[i]) store.delete(e.key);
		})
	);
}
