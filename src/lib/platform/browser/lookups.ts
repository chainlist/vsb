// What edits look up before they write: a zone's children, the edges at cards, the edge between two
// cards, the card showing a note.
import type { Rect } from '#lib/api.js';
import type { Edit } from './apply.ts';
import { gridRanges } from './grid.ts';
import { request } from './idb.ts';
import { fits } from './layout.ts';
import type { CardRecord, EdgeRecord, Kind } from './records.ts';

/** Every record filed in the grid squares that may meet `r`. */
export async function inGrid<T>(store: IDBObjectStore, r: Rect, prefix: number[] = []) {
	const found = await Promise.all(gridRanges(r, prefix).map((range) => request(store.index('g').getAll(range))));
	return found.flat() as T[];
}

/** The zones, then the cards, directly in `zone` (null: on the canvas). With `within`, only those
 * lying fully inside it, in that zone's coordinates. */
export async function children(e: Edit, zone: string | null, within?: Rect): Promise<[Kind, string][]> {
	const cards = e.tx.objectStore('cards');
	// On the canvas the grid finds them: its coordinates are the world's.
	const found = (zone === null && within ? await inGrid<CardRecord>(cards, within) : await request(cards.index('zk').getAll(zone ?? ''))) as CardRecord[];
	const kept = found.filter((c) => c.zk === (zone ?? '') && (!within || fits(c.file, within)));
	return [...e.layout.children(zone, within).map((id): [Kind, string] => ['zone', id]), ...kept.map((c): [Kind, string] => ['card', c.id])];
}

const at = (e: Edit, side: 'from' | 'to', card: string) => request(e.tx.objectStore('edges').index(side).getAll(card)) as Promise<EdgeRecord[]>;

/** The edges that start or end at any of these cards. */
export async function edgesTouching(e: Edit, cards: string[]) {
	const found = await Promise.all(cards.flatMap((c) => [at(e, 'from', c), at(e, 'to', c)]));
	return [...new Set(found.flat().map((edge) => edge.id))];
}

/** The edge between two cards, either way round. */
export async function edgeBetween(e: Edit, a: string, b: string) {
	const [ab, ba] = await Promise.all([at(e, 'from', a), at(e, 'from', b)]);
	return (ab.find((edge) => edge.file.to === b) ?? ba.find((edge) => edge.file.to === a))?.id ?? null;
}

/** The edges with both ends among these cards, by ID. */
export async function edgesAmong(e: Edit, ids: string[]) {
	const among = new Set(ids);
	const found = (await Promise.all(ids.map((c) => at(e, 'from', c)))).flat().filter((edge) => among.has(edge.file.to));
	found.sort((a, b) => (a.id < b.id ? -1 : 1));
	return found.map(({ id, file }) => ({ id, from: file.from, to: file.to, arrow: file.arrow ?? 'to', stroke: file.stroke ?? 'solid' }));
}

/** The card showing a note. Until V3 a note has at most one. */
export async function cardOfNote(e: Edit, note: string) {
	return ((await request(e.tx.objectStore('cards').index('note').getKey(note))) as string | undefined) ?? null;
}
