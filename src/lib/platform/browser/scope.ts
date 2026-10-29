// What the builder opens with, what arranging a zone lays out, and the boxes framing reads: a card's
// or zone's, a zone's contents, the whole canvas's.
import type { BatchScope, Rect, ZoneNodes } from '#lib/api.js';
import type { Edit } from './apply.ts';
import { type Box, boxOf, rectOf, union } from './grid.ts';
import { request } from './idb.ts';
import { edgesAmong } from './lookups.ts';
import type { CardRecord, ClusterRecord, EdgeRecord } from './records.ts';
import { all, CELLS } from './settle.ts';

const cardsIn = (e: Edit, zone: string) => request(e.tx.objectStore('cards').index('zk').getAll(zone)) as Promise<CardRecord[]>;

/** The cards inside `zone` at any depth, or else the cards `ids` and every card an edge joins to one
 * of them, top to bottom then left to right. A card with no title (empty, unresolved, or a note whose
 * first line is blank) cannot be written, so it is left out. New cards join `zone`, or the zone the
 * cards `ids` all share, or the canvas. */
export async function batchScope(e: Edit, zone: string | null, ids: string[]): Promise<BatchScope> {
	let found: CardRecord[];
	if (zone !== null) found = (await Promise.all(e.layout.subtree(zone).map((z) => cardsIn(e, z)))).flat();
	else {
		const edges = e.tx.objectStore('edges');
		const ends = await Promise.all(ids.flatMap((id) => ['from', 'to'].map((side) => request(edges.index(side).getAll(id)) as Promise<EdgeRecord[]>)));
		const joined = new Set([...ids, ...ends.flat().flatMap((edge) => [edge.file.from, edge.file.to])]);
		found = (await all<CardRecord>(e.tx.objectStore('cards'), [...joined])).filter((c) => !!c);
	}
	const cards = found.filter((c) => c.resolved && c.title?.trim());
	cards.sort((a, b) => a.ay - b.ay || a.ax - b.ax || (a.id < b.id ? -1 : 1));
	// The zone of the cards picked, not of the cards joined to them.
	const zones = cards.filter((c) => ids.includes(c.id)).map((c) => c.file.zone);
	const shared = zones.length && zones.every((z) => z === zones[0]) ? zones[0] : null;
	return {
		zone: zone ?? shared,
		cards: cards.map((c) => ({ id: c.id, title: c.title!, x: c.ax, y: c.ay, w: c.file.w, h: c.file.h })),
		edges: await edgesAmong(e, cards.map((c) => c.id))
	};
}

/** The cards and the zones directly in a zone (null: on the canvas), and the edges between them. An
 * edge to a card in an inner zone, at any depth, joins that zone; edges within one node are left out. */
export async function zoneNodes(e: Edit, zone: string | null): Promise<ZoneNodes> {
	const own = (await cardsIn(e, zone ?? '')).sort((a, b) => (a.id < b.id ? -1 : 1));
	const inner = e.layout.children(zone).sort();
	const nodes = [
		...own.map((c) => ({ zone: false, id: c.id, x: c.ax, y: c.ay, w: c.file.w, h: c.file.h })),
		...inner.flatMap((id) => {
			const f = e.layout.frame(id);
			return f ? [{ zone: true, id, ...f }] : [];
		})
	];
	// Each card inside, at any depth, with the node it belongs to.
	const node = new Map(own.map((c) => [c.id, c.id]));
	for (const top of inner) {
		const held = await Promise.all(e.layout.subtree(top).map((z) => request(e.tx.objectStore('cards').index('zk').getAllKeys(z))));
		for (const id of held.flat()) node.set(id as string, top);
	}
	// Past a thousand cards, reading every edge once is quicker than reading them card by card.
	const store = e.tx.objectStore('edges');
	const edges =
		node.size > 1000
			? ((await request(store.getAll())) as EdgeRecord[])
			: (await Promise.all([...node.keys()].map((id) => request(store.index('from').getAll(id)) as Promise<EdgeRecord[]>))).flat();
	const pairs = new Set<string>();
	for (const { file } of edges) {
		const [a, b] = [node.get(file.from), node.get(file.to)];
		if (a !== undefined && b !== undefined && a !== b) pairs.add(JSON.stringify([a, b]));
	}
	const at = new Map(nodes.map((n, i) => [n.id, i]));
	const sorted = [...pairs].map((p) => JSON.parse(p) as [string, string]).sort(([a1, b1], [a2, b2]) => (a1 < a2 ? -1 : a1 > a2 ? 1 : b1 < b2 ? -1 : 1));
	return { nodes, edges: sorted.flatMap(([a, b]) => (at.has(a) && at.has(b) ? [{ from: at.get(a)!, to: at.get(b)! }] : [])) };
}

/** The world boxes of the cards a zone holds directly, from what the zone keeps of them. */
const held = (e: Edit, zone: string) => e.layout.cards(zone).map(boxOf);

const covering = (boxes: (Box | null)[]) => {
	const kept = boxes.filter((b): b is Box => !!b);
	return kept.length ? rectOf(kept.reduce(union)) : null;
};

/** The world area covered by everything inside a zone, at any depth. Null when it is empty. */
export function zoneContents(e: Edit, id: string): Rect | null {
	const inside = e.layout.subtree(id);
	return covering([...inside.filter((z) => z !== id).map((z) => e.layout.box(z)), ...inside.flatMap((z) => held(e, z))]);
}

/** The world area covered by every zone and card: the zones, what they hold, and the loose cards'
 * clusters at the coarsest cell size, never the cards one by one. Null for an empty canvas. */
export async function canvasContents(e: Edit): Promise<Rect | null> {
	const cell = CELLS[CELLS.length - 1];
	const range = IDBKeyRange.bound([cell, -Infinity, -Infinity], [cell, Infinity, Infinity]);
	const clusters = (await request(e.tx.objectStore('clusters').getAll(range))) as ClusterRecord[];
	const zones = [...e.layout.zones.keys()];
	return covering([...zones.map((z) => e.layout.box(z)), ...zones.filter((z) => e.layout.places.has(z)).flatMap((z) => held(e, z)), ...clusters.map((c) => c.box)]);
}

/** A card's or a zone's own box in the world. Null when it is gone. */
export async function itemBox(e: Edit, kind: 'card' | 'zone', id: string): Promise<Rect | null> {
	if (kind === 'zone') {
		const f = e.layout.frame(id);
		return f && { minX: f.x, minY: f.y, maxX: f.x + f.w, maxY: f.y + f.h };
	}
	const card = (await request(e.tx.objectStore('cards').get(id))) as CardRecord | undefined;
	return card ? { minX: card.ax, minY: card.ay, maxX: card.ax + Math.max(card.file.w, 0), maxY: card.ay + Math.max(card.file.h, 0) } : null;
}
