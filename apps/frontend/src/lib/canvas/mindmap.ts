// A note read as a mindmap, and a mindmap written back as a note: headings for the nodes with
// children and the leaves of several lines, list items for the leaves of one line (specs.md,
// Mindmaps). Pure, so Node runs it straight from its TypeScript source.
import type { KeyHelp } from '#lib/keys.js';

/** An open mindmap's keys, as Settings list them. */
export const MINDMAP_KEYS = {
	child: { keys: ['Tab'], label: 'Add a child to the selected node' },
	sibling: { keys: ['Enter'], label: 'Add a node after the selected one, or a child of the root' },
	type: { keys: ['F2'], label: "Type the selected node's text; typing a character starts it over" },
	remove: { keys: ['Delete', 'Backspace'], label: 'Remove the selected node with its children' },
	move: { keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], label: 'Select the parent, the first child, or the sibling above or below' },
	undo: { keys: ['Mod+z'], label: 'Undo a change to the map' },
	redo: { keys: ['Mod+Shift+z', 'Mod+y'], label: 'Redo a change to the map' },
	indent: { keys: ['Tab'], label: 'In its Markdown, indent by two spaces' }
} satisfies Record<string, KeyHelp>;

/** The keys while a node's text is typed, as Settings list them. */
export const TYPING_KEYS = {
	keep: { keys: ['Enter'], label: 'Keep what was typed' },
	child: { keys: ['Tab'], label: 'Keep it and add a child' },
	cancel: { keys: ['Escape'], label: 'Put back what was there' }
} satisfies Record<string, KeyHelp>;

/** A node of a mindmap: its title, the first line of its text, and the lines after it. */
export type MindNode = { title: string; body: string; children: MindNode[] };

/** A node's place in its map: the indexes down from the root, joined by dots; '' for the root. */
export type Key = string;

export type Size = { w: number; h: number };

/** A node laid out in its map, its corner from the map's. */
export type Placed = Size & { key: Key; node: MindNode; parent: Key | null; x: number; y: number };

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const ITEM = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;

/** The deepest heading `######`: a node under it is a list item. */
const DEEPEST = 6;

export const node = (title = '', body = '', children: MindNode[] = []): MindNode => ({ title, body, children });

/** Whether a node is written as a list item under a heading: a leaf of one line. */
export const oneLine = (n: MindNode) => !n.body && !n.children.length;

const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length;

/** The note's text as a mindmap. Its first line is the root, whatever it is, as it is the note's
 * title; the rest nests under it by its headings and lists. */
export function parse(text: string): MindNode {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const first = lines.findIndex((l) => l.trim());
	const root = node(first < 0 ? '' : lines[first].trim().replace(/^#+/, '').trim());
	const bodies = new Map<MindNode, string[]>();
	// The headings open above the line, and the list items, each with where its marker and its text
	// start.
	const headings = [{ node: root, level: 1 }];
	let items: { node: MindNode; indent: number; content: number }[] = [];
	// Where text goes, and how much of its lines' indentation it drops.
	let target = root;
	let strip = 0;
	let fence: string | null = null;
	let blank = false;

	const add = (line: string) => {
		const lines = bodies.get(target) ?? [];
		lines.push(line.replace(new RegExp(`^ {0,${strip}}`), ''));
		bodies.set(target, lines);
	};

	for (const line of lines.slice(first + 1)) {
		if (fence !== null) {
			add(line);
			if (line.trim().startsWith(fence)) fence = null;
			continue;
		}
		if (!line.trim()) {
			add('');
			blank = true;
			continue;
		}
		const indent = indentOf(line);
		const heading = HEADING.exec(line);
		const item = heading ? null : ITEM.exec(line);
		if (heading) {
			const level = heading[1].length;
			while (headings.length > 1 && headings.at(-1)!.level >= level) headings.pop();
			const n = node((heading[2] ?? '').trim());
			headings.at(-1)!.node.children.push(n);
			headings.push({ node: n, level });
			items = [];
			[target, strip] = [n, 0];
		} else if (item) {
			while (items.length && items.at(-1)!.indent >= indent) items.pop();
			const n = node((item[2] ?? '').trim());
			(items.at(-1)?.node ?? headings.at(-1)!.node).children.push(n);
			const content = item[2] === undefined ? indent + 2 : line.length - item[2].length;
			items.push({ node: n, indent, content });
			[target, strip] = [n, content];
		} else {
			// Text: of the deepest item it is indented under, or of the item it follows with no blank
			// line between; else the list has ended, and it is the heading's.
			const under = items.findLast((i) => i.content <= indent);
			if (under) [target, strip] = [under.node, under.content];
			else if (items.length && !blank) strip = Math.min(indent, items.at(-1)!.content);
			else {
				items = [];
				[target, strip] = [headings.at(-1)!.node, 0];
			}
			add(line);
			fence = FENCE.exec(line)?.[1] ?? null;
		}
		blank = false;
	}

	for (const [n, lines] of bodies) {
		const from = lines.findIndex((l) => l.trim());
		const to = lines.findLastIndex((l) => l.trim());
		n.body = from < 0 ? '' : lines.slice(from, to + 1).join('\n');
	}
	return root;
}

/** Puts each node's children in the order the note holds them: under a heading, its one-line
 * leaves first, as its list items, then the others, as headings. Below the deepest heading every
 * node is a list item, kept in its order. */
export function normalize(n: MindNode, level = 1) {
	if (level >= DEEPEST) return;
	n.children = [...n.children.filter(oneLine), ...n.children.filter((c) => !oneLine(c))];
	for (const c of n.children) normalize(c, level + 1);
}

/** The note's text for a mindmap, its children in the order `normalize` gives. An empty map is an
 * empty note. */
export function write(root: MindNode): string {
	if (!root.title && !root.body && !root.children.length) return '';
	const out = [`# ${root.title}`.trimEnd()];
	if (root.body) out.push(root.body);
	under(root, 1, out);
	return out.join('\n') + '\n';
}

/** Writes the children of a node written as a heading of `level`: its list right under it, or after
 * a blank line when it has text, then its headings. */
function under(n: MindNode, level: number, out: string[]) {
	const items = level >= DEEPEST ? n.children : n.children.filter(oneLine);
	if (items.length && n.body) out.push('');
	list(items, '', out);
	if (level >= DEEPEST) return;
	for (const c of n.children.filter((c) => !oneLine(c))) {
		out.push('', `${'#'.repeat(level + 1)} ${c.title}`.trimEnd());
		if (c.body) out.push(c.body);
		under(c, level + 1, out);
	}
}

function list(nodes: MindNode[], indent: string, out: string[]) {
	for (const c of nodes) {
		out.push(`${indent}- ${c.title}`.trimEnd());
		if (c.body) out.push(...c.body.split('\n').map((l) => (l ? `${indent}  ${l}` : '')));
		list(c.children, `${indent}  `, out);
	}
}

/** The node at a key, or undefined when the map has none there. */
export function at(root: MindNode, key: Key): MindNode | undefined {
	let n: MindNode | undefined = root;
	for (const i of key ? key.split('.') : []) n = n?.children[Number(i)];
	return n;
}

/** The key of a node's child. */
export const child = (key: Key, i: number): Key => (key ? `${key}.${i}` : `${i}`);

/** The key of a node of the map, found by identity. */
export function keyOf(root: MindNode, target: MindNode, key: Key = ''): Key | undefined {
	if (root === target) return key;
	for (const [i, c] of root.children.entries()) {
		const found = keyOf(c, target, child(key, i));
		if (found !== undefined) return found;
	}
	return undefined;
}

/** The key of a node's parent; undefined for the root. */
export const parentKey = (key: Key) => (key ? key.split('.').slice(0, -1).join('.') : undefined);

/** A deep copy of a map. */
export const clone = (n: MindNode): MindNode => node(n.title, n.body, n.children.map(clone));

/** A node's text as typed: its title, and its body on the lines after. */
export const textOf = (n: MindNode) => (n.body ? `${n.title}\n${n.body}` : n.title);

/** Sets a node's title and body from its text as typed: the first line, and the lines after, without
 * the blank lines around them. */
export function setText(n: MindNode, text: string) {
	const [title, ...rest] = text.split('\n');
	n.title = title.trim();
	n.body = rest.join('\n').replace(/^\s*\n/, '').trimEnd();
}

/** Lays the map out from left to right: the root on the left, each node's children in a column
 * `gap.x` right of it, stacked `gap.y` apart and centered on it. A node not measured yet counts as
 * empty. */
export function layout(root: MindNode, size: (key: Key) => Size | undefined, gap = { x: 40, y: 10 }) {
	const sizeOf = (key: Key) => size(key) ?? { w: 0, h: 0 };
	// The height of each node's column of children, and of its branch: itself or that column,
	// whichever is taller.
	const columns = new Map<Key, number>();
	const branches = new Map<Key, number>();
	const measure = (n: MindNode, key: Key): number => {
		const column = n.children.reduce((sum, c, i) => sum + measure(c, child(key, i)), 0) + gap.y * Math.max(0, n.children.length - 1);
		const branch = Math.max(sizeOf(key).h, column);
		columns.set(key, column);
		branches.set(key, branch);
		return branch;
	};
	measure(root, '');
	const placed: Placed[] = [];
	const place = (n: MindNode, key: Key, parent: Key | null, x: number, top: number) => {
		const { w, h } = sizeOf(key);
		const middle = top + branches.get(key)! / 2;
		placed.push({ key, node: n, parent, x, y: middle - h / 2, w, h });
		let y = middle - columns.get(key)! / 2;
		for (const [i, c] of n.children.entries()) {
			const k = child(key, i);
			place(c, k, key, x + w + gap.x, y);
			y += branches.get(k)! + gap.y;
		}
	};
	place(root, '', null, 0, 0);
	return { nodes: placed, w: Math.max(...placed.map((p) => p.x + p.w)), h: branches.get('')! };
}
