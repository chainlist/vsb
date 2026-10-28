// Arranging the selected cards, or a selected zone's contents: laid out as the builder lays out a
// batch, along the edges between them and in its direction, centered where they were and on the
// grid when snapping is on. Each keeps its size and its zone, which grows to hold them.
import { arrangeItems, zoneNodes, type Move, type ZoneNodes } from '#lib/api.js';
import { arrange } from './batch.js';
import { batchDialog } from './batchDialog.svelte.js';
import { snap, toGrid } from './grid.svelte.js';
import { history } from './history.js';
import { cover, items } from './items.svelte.js';
import { selection } from './selection.svelte.js';

/** A lone selected zone arranges its own cards and its inner zones, each moving as one block with
 * everything in it; otherwise the selected cards are arranged. */
export async function arrangeSelected() {
	const [zone] = selection.zones;
	if (zone && selection.ids.length === 1) return lay(await zoneNodes(zone.id));
	const cards = selection.cards;
	const at = new Map(cards.map((c, i) => [c.id, i]));
	const edges = items.edges.flatMap((e) => (at.has(e.from) && at.has(e.to) ? [{ from: at.get(e.from)!, to: at.get(e.to)! }] : []));
	return lay({ nodes: cards.map((c) => ({ ...c, zone: false })), edges });
}

function lay({ nodes, edges }: ZoneNodes) {
	if (nodes.length < 2) return;
	const span = cover(nodes);
	const middle = { x: (span.minX + span.maxX) / 2, y: (span.minY + span.maxY) / 2 };
	const place = (v: number) => (snap.on ? toGrid(v) : v);
	const moves = arrange(nodes, edges, middle, batchDialog.direction).map((b, i) => ({ ...nodes[i], x: place(b.x), y: place(b.y) }));
	return history.edit(() => arrangeItems(...apart(moves)));
}

/** Moves of nodes, as the backend takes them: the cards', then the zones'. */
export function apart(moves: ZoneNodes['nodes']): [Move[], Move[]] {
	const of = (zone: boolean) => moves.filter((m) => m.zone === zone).map(({ id, x, y }) => ({ id, x, y }));
	return [of(false), of(true)];
}
