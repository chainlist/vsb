// The batch builder opened on cards of the canvas: the text it starts with, what an edited text asks
// for, and where its new cards go. Cards are written by their titles, and the text is the truth for
// the edges between them; the cards themselves never move.
import type { Arrow, BatchScope, Frame, Link, LinkEnd, LinkPlan, Rect, Stroke } from '#lib/api.js';
import { arrowOf, layOut, NODE_GAP, quote, RANK_GAP, type Direction, type Plan } from './batch.js';
import { cover } from './items.svelte.js';

type Point = { x: number; y: number };

export type Edit = {
	scope: BatchScope;
	/** Each card by its name in the text: its title, numbered when titles repeat ("Idea #2"). */
	names: Map<string, string>;
	/** Where new cards go when no card of the canvas is there to join. */
	at: Point;
	text: string;
};

/** The text writing the scope: each edge on a line of its own, from its first card, then each card
 * no edge joins on its own line too. */
export function opening(scope: BatchScope, at: Point): Edit {
	const titles = new Set(scope.cards.map((c) => c.title));
	const names = new Map<string, string>();
	const nameOf = new Map<string, string>();
	for (const c of scope.cards) {
		// A repeated title gets a number another card's title does not hold.
		const taken = (name: string) => names.has(name) || (name !== c.title && titles.has(name));
		let name = c.title;
		for (let n = 2; taken(name); n++) name = `${c.title} #${n}`;
		names.set(name, c.id);
		nameOf.set(c.id, quote(name));
	}
	const lines = scope.cards.flatMap((c) => {
		const out = scope.edges.filter((e) => e.from === c.id);
		const alone = !out.length && !scope.edges.some((e) => e.to === c.id);
		const edges = out.map((e) => `${nameOf.get(e.from)} ${arrowOf(e.arrow, e.stroke)} ${nameOf.get(e.to)}`);
		return alone ? [nameOf.get(c.id)!] : edges;
	});
	return { scope, names, at, text: lines.join('\n') };
}

/** What a text asks for: its new cards, as indexes into its texts, and its links. */
export function wanted(plan: Plan, edit: Edit) {
	const fresh = plan.texts.flatMap((t, i) => (edit.names.has(t) ? [] : [i]));
	const end = (i: number): LinkEnd => {
		const id = edit.names.get(plan.texts[i]);
		return id ? { card: id } : { new: fresh.indexOf(i) };
	};
	const links: Link[] = plan.edges.map((e) => ({ from: end(e.from), to: end(e.to), arrow: e.arrow, stroke: e.stroke }));
	return { fresh, links };
}

const meets = (a: Frame, b: Frame) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where the new cards go, in the order of `fresh`. Each group of new cards joined by edges is laid
 * out with dagre, then set beside a card of the canvas it joins, or else beside all of them, in the
 * layout's direction, and moved along until it is clear of the cards already there. */
export function place(plan: Plan, edit: Edit, fresh: number[], direction: Direction): Frame[] {
	const boxes = new Map<string, Frame>(edit.scope.cards.map((c) => [c.id, c]));
	const taken: Frame[] = [...boxes.values()];
	const placed = new Map<number, Frame>();
	for (const group of groups(plan, fresh)) {
		const inside = plan.edges.filter((e) => group.includes(e.from) && group.includes(e.to));
		const sub = { texts: group.map((i) => plan.texts[i]), edges: inside.map((e) => ({ ...e, from: group.indexOf(e.from), to: group.indexOf(e.to) })) };
		const laid = layOut(sub, { x: 0, y: 0 }, direction);
		// The card of the canvas it joins.
		const joined = plan.edges.flatMap((e) => (group.includes(e.from) ? [e.to] : group.includes(e.to) ? [e.from] : []));
		const id = joined.map((i) => edit.names.get(plan.texts[i])).find(Boolean);
		const block = cover(laid);
		const [w, h] = [block.maxX - block.minX, block.maxY - block.minY];
		const by = beside(id ? boxes.get(id)! : taken.length ? frameOf(cover(taken)) : { ...edit.at, w: 0, h: 0 }, w, h, direction);
		const across = direction === 'LR' || direction === 'RL' ? { x: 0, y: h + NODE_GAP } : { x: w + NODE_GAP, y: 0 };
		const at = (b: Frame, k: number) => ({ ...b, x: Math.round(b.x - block.minX + by.x + k * across.x), y: Math.round(b.y - block.minY + by.y + k * across.y) });
		let k = 0;
		while (k < 50 && laid.some((b) => taken.some((t) => meets(at(b, k), t)))) k++;
		group.forEach((i, n) => placed.set(i, at(laid[n], k)));
		taken.push(...group.map((i) => placed.get(i)!));
	}
	return fresh.map((i) => placed.get(i)!);
}

const frameOf = (r: Rect): Frame => ({ x: r.minX, y: r.minY, w: r.maxX - r.minX, h: r.maxY - r.minY });

/** The top-left corner of a block `w` by `h` set beside `a` in a direction, centered across it. */
function beside(a: Frame, w: number, h: number, direction: Direction): Point {
	const [cx, cy] = [a.x + a.w / 2 - w / 2, a.y + a.h / 2 - h / 2];
	if (direction === 'LR') return { x: a.x + a.w + RANK_GAP, y: cy };
	if (direction === 'RL') return { x: a.x - RANK_GAP - w, y: cy };
	if (direction === 'TB') return { x: cx, y: a.y + a.h + RANK_GAP };
	return { x: cx, y: a.y - RANK_GAP - h };
}

/** The new cards in groups that edges join, each in the order of `fresh`. */
function groups(plan: Plan, fresh: number[]) {
	const group = new Map(fresh.map((i) => [i, i]));
	const root = (i: number): number => (group.get(i) === i ? i : root(group.get(i)!));
	for (const e of plan.edges) if (group.has(e.from) && group.has(e.to)) group.set(root(e.from), root(e.to));
	const out = new Map<number, number[]>();
	for (const i of fresh) out.set(root(i), [...(out.get(root(i)) ?? []), i]);
	return [...out.values()];
}

/** How a card or an edge of the preview changes, if it does. */
export type Mark = 'new' | 'changed' | 'removed' | null;

/** What the preview map draws, in world units: the cards, and the edges as indexes into them. */
export type Sketch = {
	cards: (Frame & { text: string; mark: Mark })[];
	edges: { from: number; to: number; arrow: Arrow; stroke: Stroke; mark: Mark }[];
};

/** New cards only, laid out in a direction. */
export function sketchNew(plan: Plan, direction: Direction): Sketch {
	const boxes = layOut(plan, { x: 0, y: 0 }, direction);
	return { cards: boxes.map((b, i) => ({ ...b, text: plan.texts[i], mark: null })), edges: plan.edges.map((e) => ({ ...e, mark: null })) };
}

/** An edited text: the cards of the canvas where they are, the new ones beside them, and the edges
 * kept, restyled, removed or new, as `done`, the last plan of the links, says. */
export function sketchEdit(plan: Plan, edit: Edit, direction: Direction, done: LinkPlan | null): Sketch {
	const { fresh, links } = wanted(plan, edit);
	const nameOf = new Map([...edit.names].map(([name, id]) => [id, name]));
	const cards = [
		...edit.scope.cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, text: nameOf.get(c.id)!, mark: null })),
		...place(plan, edit, fresh, direction).map((b, i) => ({ ...b, text: plan.texts[fresh[i]], mark: 'new' as const }))
	];
	const at = (end: LinkEnd) => ('card' in end ? edit.scope.cards.findIndex((c) => c.id === end.card) : edit.scope.cards.length + end.new);
	// A plan made for an older text can name a link the text no longer has.
	const drawn = (i: number, mark: Mark) => (links[i] ? [{ ...links[i], from: at(links[i].from), to: at(links[i].to), mark }] : []);
	const restyled = new Map(done?.restyled);
	const removed = new Set(done?.removed);
	const edges = [
		...edit.scope.edges.flatMap((e) => {
			const i = restyled.get(e.id);
			if (i !== undefined) return drawn(i, 'changed');
			return [{ ...e, from: at({ card: e.from }), to: at({ card: e.to }), mark: removed.has(e.id) ? ('removed' as const) : null }];
		}),
		...(done?.created ?? []).flatMap((i) => drawn(i, 'new'))
	];
	return { cards, edges };
}
