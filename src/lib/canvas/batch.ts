// Batch creation's text syntax, inspired by Mermaid but not compatible with it: each line is a card,
// or a chain of cards joined by arrows, and the same text twice in one block is the same card. The
// cards are laid out with dagre along their edges, left to right unless another direction is picked.
import { Graph, layout } from '@dagrejs/dagre';
import type { Arrow, BatchEdge, Frame, Stroke } from '#lib/api.js';
import { NEW_CARD } from './gestures.js';

/** Room between cards, in world units: 2 graph-paper squares within a rank, 4 between ranks. */
export const NODE_GAP = 40;
export const RANK_GAP = 80;
/** An arrow: a line of `-`, `.` or `=` with a head, `<` or `>`, at one end or both. With no head, a
 * line of three marks or more: `---`, `-.-`, `===`. Shorter, it is text, so a hyphenated word
 * stays one card. */
const ARROW = /<(?:[-.]+|=+)>?|(?:[-.]+|=+)>|-{3,}|-\.+-|={3,}/;
/** A card's text in double quotes, where arrows are text; a quote inside is doubled. */
const QUOTED = /"(?:[^"]|"")*"/;
/** In a line, quoted texts, skipped, and the arrows between card texts. */
const TOKEN = new RegExp(`(${QUOTED.source})|${ARROW.source}`, 'g');
/** The line of an arrow with a head, for each stroke. */
const LINES: Record<Stroke, string> = { solid: '-', dashed: '--', dotted: '.-', double: '=' };

/** The cards' texts, and the edges between them as indexes into `texts`. */
export type Plan = { texts: string[]; edges: BatchEdge[] };

/** Which way the edges run in the layout, as dagre names it: left to right, top to bottom, and back. */
export type Direction = 'LR' | 'TB' | 'RL' | 'BT';

/** How an arrow's line is drawn: `=` double, any `.` dotted, `--` dashed, one `-` solid. */
function strokeOf(line: string): Stroke {
	if (line.startsWith('=')) return 'double';
	if (line.includes('.')) return 'dotted';
	return line.length > 1 ? 'dashed' : 'solid';
}

/** The edge an arrow draws between the cards before and after it: `->` points at the second,
 * `<-` at the first, `<->` at both, `---` at neither. */
function edgeOf(arrow: string, before: number, after: number): BatchEdge {
	const [back, ahead] = [arrow.startsWith('<'), arrow.endsWith('>')];
	const stroke = strokeOf(arrow.slice(back ? 1 : 0, ahead ? -1 : undefined));
	// With no head, a line is solid, dotted or double, never dashed.
	if (!back && !ahead) return { from: before, to: after, arrow: 'none', stroke: stroke === 'dashed' ? 'solid' : stroke };
	if (back && !ahead) return { from: after, to: before, arrow: 'to', stroke };
	return { from: before, to: after, arrow: back ? 'both' : 'to', stroke };
}

/** How the syntax writes an edge's arrow. It has no dashed line without heads: that one is solid. */
export function arrowOf(arrow: Arrow, stroke: Stroke) {
	if (arrow === 'none') return stroke === 'dotted' ? '-.-' : stroke === 'double' ? '===' : '---';
	return `${arrow === 'both' ? '<' : ''}${LINES[stroke]}>`;
}

/** How the syntax writes a card's text: in quotes when it holds an arrow or starts with a quote. */
export function quote(text: string) {
	return ARROW.test(text) || text.startsWith('"') ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A card's text as written, its quotes taken off. */
function unquote(part: string) {
	const text = part.trim();
	return text.length > 1 && QUOTED.exec(text)?.[0] === text ? text.slice(1, -1).replaceAll('""', '"') : text;
}

/** A line's card texts and arrows, taking turns, a text first. Arrows inside quotes are text. */
function steps(line: string) {
	const parts: string[] = [];
	let start = 0;
	for (const m of line.matchAll(TOKEN)) {
		if (m[1]) continue;
		parts.push(line.slice(start, m.index), m[0]);
		start = m.index + m[0].length;
	}
	return [...parts, line.slice(start)];
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
		for (const [i, part] of steps(line).entries()) {
			if (i % 2) {
				arrow = part;
				continue;
			}
			const text = unquote(part);
			if (!text) continue;
			const next = card(text);
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
export function layOut({ texts, edges }: Plan, at: { x: number; y: number }, direction: Direction = 'LR'): Frame[] {
	return arrange(texts.map(() => NEW_CARD), edges, at, direction);
}

/** World rectangles for cards of these sizes, laid out with dagre along the edges between them, as
 * indexes into `sizes`, the whole centered on a world point. */
export function arrange(sizes: { w: number; h: number }[], edges: { from: number; to: number }[], at: { x: number; y: number }, direction: Direction): Frame[] {
	const g = new Graph();
	g.setGraph({ rankdir: direction, nodesep: NODE_GAP, ranksep: RANK_GAP });
	g.setDefaultEdgeLabel(() => ({}));
	sizes.forEach(({ w, h }, i) => g.setNode(String(i), { width: w, height: h }));
	for (const { from, to } of edges) g.setEdge(String(from), String(to));
	layout(g);
	// Dagre gives the centers, in a graph that starts at (0, 0).
	const { width, height } = g.graph();
	return sizes.map(({ w, h }, i) => {
		const { x, y } = g.node(String(i));
		return { x: Math.round(at.x - width / 2 + x - w / 2), y: Math.round(at.y - height / 2 + y - h / 2), w, h };
	});
}
