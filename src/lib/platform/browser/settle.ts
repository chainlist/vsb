// What follows from items changing, as the desktop's index derives it on every write: where cards
// and edges sit in the world and on the grid, what cards show of their notes, the clusters and
// bundles of the zoomed-out map, what each zone holds, and how many cards show each note.
import type { Frame } from '#lib/api.js';
import { boxOf, gridKey } from './grid.ts';
import { request } from './idb.ts';
import type { Layout } from './layout.ts';
import type { CardFile, CardRecord, EdgeFile, EdgeRecord, NoteRecord, ZoneFile } from './records.ts';
import { bounds, bundled, end, flush, inZone, rawBox, Tally } from './tally.ts';

/** Cell sizes the zoomed-out map is kept for: those the canvas asks for, from 40% zoom down to 5%. */
export const CELLS = [512, 1024, 2048, 4096];

/** The file each item is to hold, null for none. */
export type Next = { zone: Map<string, ZoneFile | null>; card: Map<string, CardFile | null>; edge: Map<string, EdgeFile | null> };

export async function settle(tx: IDBTransaction, layout: Layout, next: Next) {
	const cards = tx.objectStore('cards');
	const edges = tx.objectStore('edges');
	const tallies = { zones: new Tally(), clusters: new Tally(), bundles: new Tally(), notes: new Map<string, number>() };
	const count = (note: string | null, by: number) => note && tallies.notes.set(note, (tallies.notes.get(note) ?? 0) + by);

	// Zones first, in memory. Every zone that gained, lost or changed its place moves its cards.
	const was = layout.places;
	for (const [id, file] of next.zone) {
		if (file) layout.put(id, file);
		else layout.drop(id);
	}
	if (next.zone.size) layout.refresh();
	const moved = [...new Set([...was.keys(), ...layout.places.keys()])].filter((id) => !samePlace(was.get(id), layout.places.get(id)));

	const cardIds = new Set(next.card.keys());
	for (const keys of await Promise.all(moved.map((z) => request(cards.index('zk').getAllKeys(z))))) {
		for (const id of keys) cardIds.add(id as string);
	}
	const ids = [...cardIds];
	const olds = await all<CardRecord>(cards, ids);
	const files = ids.map((id, i) => (next.card.has(id) ? next.card.get(id)! : (olds[i]?.file ?? null)));
	const shown = [...new Set(files.flatMap((f, i) => (f?.note && f.note !== olds[i]?.file.note ? [f.note] : [])))];
	const found = await all<NoteRecord>(tx.objectStore('notes'), shown);
	const notes = new Map(shown.map((id, i) => [id, found[i]]));
	/** The cards as they are now, for the edges at them. */
	const now = new Map<string, CardRecord | undefined>();
	ids.forEach((id, i) => {
		const [old, file] = [olds[i], files[i]];
		if (old) {
			tallies.zones.change(old.zk, inZone(old.file), -1);
			for (const key of old.cl ?? []) tallies.clusters.change(key, rawBox(old.file), -1);
			count(old.file.note, -1);
		}
		if (!file) {
			if (old) cards.delete(id);
			now.set(id, undefined);
			return;
		}
		const card = cardRecord(layout, id, file, old, notes);
		cards.put(card);
		now.set(id, card);
		tallies.zones.change(card.zk, inZone(file), 1);
		for (const key of card.cl ?? []) tallies.clusters.change(key, rawBox(file), 1);
		count(file.note, 1);
	});

	// Then the edges written, and every edge at a card that changed.
	const edgeIds = new Set(next.edge.keys());
	const at = await Promise.all(ids.flatMap((id) => ['from', 'to'].map((side) => request(edges.index(side).getAllKeys(id)))));
	for (const keys of at) for (const id of keys) edgeIds.add(id as string);
	const eids = [...edgeIds];
	const oldEdges = await all<EdgeRecord>(edges, eids);
	const efiles = eids.map((id, i) => (next.edge.has(id) ? next.edge.get(id)! : (oldEdges[i]?.file ?? null)));
	const missing = [...new Set(efiles.flatMap((f) => (f ? [f.from, f.to] : [])))].filter((id) => !now.has(id));
	(await all<CardRecord>(cards, missing)).forEach((card, i) => now.set(missing[i], card));
	eids.forEach((id, i) => {
		const [old, file] = [oldEdges[i], efiles[i]];
		if (old) bundled(old, tallies.bundles, -1);
		if (!file) {
			if (old) edges.delete(id);
			return;
		}
		const edge = edgeRecord(id, file, now.get(file.from), now.get(file.to));
		edges.put(edge);
		bundled(edge, tallies.bundles, 1);
	});

	await flush(tx, layout, tallies, next);
}

const samePlace = (a: { x: number; y: number; root: string } | undefined, b: typeof a) =>
	a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.root === b.root);

/** Records by key, in one round of reads; undefined where there is none. */
export const all = <T>(store: IDBObjectStore | IDBIndex, keys: IDBValidKey[]) =>
	Promise.all(keys.map((k) => request(store.get(k)) as Promise<T | undefined>));

/** The cluster squares a loose card counts in, at each cell size: the one holding its center. */
const squares = (f: CardFile) => CELLS.map((cell) => [cell, Math.floor((f.x + f.w / 2) / cell), Math.floor((f.y + f.h / 2) / cell)]);

/** What a card shows of its note: nothing for no note, or for a note that is not there. */
export const showing = (note: NoteRecord | undefined) => ({ title: note?.title ?? null, excerpt: note?.excerpt ?? null, resolved: !!note });

/** What the index keeps of a card. A card in a missing zone sits on the canvas, as on the desktop. */
function cardRecord(layout: Layout, id: string, file: CardFile, old: CardRecord | undefined, notes: Map<string, NoteRecord | undefined>): CardRecord {
	const place = file.zone === null ? undefined : layout.places.get(file.zone);
	const [ax, ay] = [(place?.x ?? 0) + file.x, (place?.y ?? 0) + file.y];
	const note = old && old.file.note === file.note ? old : showing(file.note === null ? undefined : notes.get(file.note));
	return {
		id,
		file,
		zk: file.zone ?? '',
		ax,
		ay,
		root: place?.root ?? '',
		g: gridKey(boxOf({ x: ax, y: ay, w: file.w, h: file.h })),
		...(place ? {} : { cl: squares(file) }),
		title: note.title,
		excerpt: note.excerpt,
		resolved: note.resolved
	};
}

const frame = (c: CardRecord): Frame => ({ x: c.ax, y: c.ay, w: c.file.w, h: c.file.h });

/** What the index keeps of an edge. With a card missing, it is drawn nowhere. */
function edgeRecord(id: string, file: EdgeFile, from: CardRecord | undefined, to: CardRecord | undefined): EdgeRecord {
	if (!from || !to) return { id, file, ends: null, roots: ['', ''] };
	const ends: [Frame, Frame] = [frame(from), frame(to)];
	const roots: [string, string] = [from.root, to.root];
	const bk = [];
	for (const cell of CELLS) {
		const [a, b] = [end(ends[0], roots[0], cell), end(ends[1], roots[1], cell)];
		if (a !== b) bk.push(a < b ? [cell, a, b] : [cell, b, a]);
	}
	return { id, file, ends, roots, g: gridKey(bounds(ends)), bk };
}
