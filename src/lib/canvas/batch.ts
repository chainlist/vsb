// Batch creation's text syntax, inspired by Mermaid but not compatible with it: each line is a card,
// or a chain of cards joined by arrows, and the same text twice in one block is the same card. The
// cards are laid out with dagre, left to right along their edges.
import { Graph, layout } from '@dagrejs/dagre';
import type { BatchEdge, Frame, Stroke } from '#lib/api.js';
import { NEW_CARD } from './gestures.js';

/** Room between cards, in world units: 2 graph-paper squares within a column, 4 between columns. */
const NODE_GAP = 40;
const RANK_GAP = 80;
/** An arrow: a line of `-`, `.` or `=` with a head, `<` or `>`, at one end or both. Without a head
 * it is text, so a hyphenated word stays one card. */
const ARROW = /(<(?:[-.]+|=+)>?|(?:[-.]+|=+)>)/;

/** The cards' texts, and the edges between them as indexes into `texts`. */
export type Plan = { texts: string[]; edges: BatchEdge[] };

/** How an arrow's line is drawn: `=` double, any `.` dotted, `--` dashed, one `-` solid. */
function strokeOf(line: string): Stroke {
	if (line.startsWith('=')) return 'double';
	if (line.includes('.')) return 'dotted';
	return line.length > 1 ? 'dashed' : 'solid';
}

/** The edge an arrow draws between the cards before and after it: `->` points at the second,
 * `<-` at the first, `<->` at both. */
function edgeOf(arrow: string, before: number, after: number): BatchEdge {
	const [back, ahead] = [arrow.startsWith('<'), arrow.endsWith('>')];
	const stroke = strokeOf(arrow.slice(back ? 1 : 0, ahead ? -1 : undefined));
	if (back && !ahead) return { from: after, to: before, arrow: 'to', stroke };
	return { from: before, to: after, arrow: back ? 'both' : 'to', stroke };
}

export function parse(text: string): Plan {
	const texts: string[] = [];
	const edges: BatchEdge[] = [];
	const cards = new Map<string, number>();
	const joined = new Set<string>();
	const card = (t: string) => {
		if (!cards.has(t)) cards.set(t, texts.push(t) - 1);
		return cards.get(t)!;
	};
	for (const line of text.split('\n')) {
		// Texts and arrows take turns. Empty cards are not supported yet: an empty step in a chain is
		// skipped, and the arrow just before the next card joins it.
		let [last, arrow]: [number | undefined, string | undefined] = [undefined, undefined];
		for (const [i, part] of line.split(ARROW).entries()) {
			if (i % 2) {
				arrow = part;
				continue;
			}
			if (!part.trim()) continue;
			const next = card(part.trim());
			// No edge from a card to itself, and at most one between two cards, either way round.
			if (last !== undefined && arrow && last !== next) {
				const pair = `${Math.min(last, next)} ${Math.max(last, next)}`;
				if (!joined.has(pair)) edges.push(edgeOf(arrow, last, next));
				joined.add(pair);
			}
			[last, arrow] = [next, undefined];
		}
	}
	return { texts, edges };
}

/** The cards' world rectangles, each the size of a placed card, the whole centered on a world point. */
export function layOut({ texts, edges }: Plan, at: { x: number; y: number }): Frame[] {
	const g = new Graph();
	g.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: RANK_GAP });
	g.setDefaultEdgeLabel(() => ({}));
	texts.forEach((_, i) => g.setNode(String(i), { width: NEW_CARD.w, height: NEW_CARD.h }));
	for (const { from, to } of edges) g.setEdge(String(from), String(to));
	layout(g);
	// Dagre gives the centers, in a graph that starts at (0, 0).
	const { width, height } = g.graph();
	const [left, top] = [at.x - width / 2 - NEW_CARD.w / 2, at.y - height / 2 - NEW_CARD.h / 2];
	return texts.map((_, i) => {
		const { x, y } = g.node(String(i));
		return { x: Math.round(left + x), y: Math.round(top + y), ...NEW_CARD };
	});
}
