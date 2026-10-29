// What the browser keeps of each item. The `file` of a zone, card or edge is what the desktop writes
// to its JSON file, defaults left out, so item states, undo and a later export are the same on both
// platforms. The rest is derived on every write, as the desktop's index derives it.
import type { Arrow, Frame, HAlign, Shape, Stroke, VAlign } from '#lib/api.js';
import type { Box } from './grid.ts';
import type { Words } from './words.ts';

export type Kind = 'zone' | 'card' | 'edge';

export type ZoneFile = { name: string; parent: string | null; x: number; y: number; w: number; h: number; color?: string };

export type CardFile = {
	note: string | null;
	zone: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
	halign?: HAlign;
	valign?: VAlign;
	color?: string;
};

export type EdgeFile = { from: string; to: string; label?: string; shape?: Shape; arrow?: Arrow; stroke?: Stroke };

export type File = ZoneFile | CardFile | EdgeFile;

/** A zone, with how many cards sit directly in it and the box around them, in its own coordinates. */
export type ZoneRecord = { id: string; file: ZoneFile; own: number; cbox: Box | null };

/** A card, with all the viewport query draws it from: its absolute corner, its outermost zone (''
 * when loose), the grid square it is filed under, its cluster square at each cell size when loose,
 * and its note's title and excerpt. `zk` is its zone as written, '' for the canvas. */
export type CardRecord = {
	id: string;
	file: CardFile;
	zk: string;
	ax: number;
	ay: number;
	root: string;
	g: number[][];
	cl?: number[][];
	title: string | null;
	excerpt: string | null;
	resolved: boolean;
};

/** An edge, with its cards' boxes, `from` first, and their outermost zones; when a card is missing
 * the edge is drawn nowhere and has no grid square. `bk` names its bundle at each cell size. */
export type EdgeRecord = {
	id: string;
	file: EdgeFile;
	ends: [Frame, Frame] | null;
	roots: [string, string];
	g?: number[][];
	bk?: (number | string)[][];
};

/** A note: its text, where it would live as a file, and the words the word index holds it under.
 * `loose` is set while no card shows it, as the Unplaced tray's order: most recently changed first. */
export type NoteRecord = Words & {
	id: string;
	path: string;
	/** The path ignoring case, unique, as on the file systems a vault may be written to. */
	pk: string;
	body: string;
	title: string;
	excerpt: string;
	mtime: number;
	placed: number;
	loose?: [number, string];
};

/** A note with its place in the Unplaced tray: there while no card shows it. */
export const tray = (n: NoteRecord): NoteRecord => ({ ...n, loose: n.placed > 0 ? undefined : [-n.mtime, n.id] });

/** Clusters and bundles: counts and boxes kept per cell size, never the cards themselves. */
export type ClusterRecord = { cell: number; cx: number; cy: number; count: number; box: Box };
export type BundleRecord = { cell: number; a: string; b: string; count: number; ha: number; hb: number; box: Box };

const number = (v: unknown, field: string) => {
	if (typeof v !== 'number') throw new Error(`missing field \`${field}\``);
	return v;
};
const text = (v: unknown, field: string) => {
	if (typeof v !== 'string') throw new Error(`missing field \`${field}\``);
	return v;
};
const maybe = (v: unknown) => (typeof v === 'string' ? v : null);
/** An optional field, left out at its default or when absent. */
function choice<T extends string>(v: unknown, values: readonly T[], fallback: T, field: string): T | undefined {
	if (v === undefined || v === null || v === fallback) return undefined;
	if (!values.includes(v as T)) throw new Error(`unknown variant \`${String(v)}\` for \`${field}\``);
	return v as T;
}
/** Drops the fields left undefined, so they are left out as the desktop leaves them out. */
const kept = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** A state's value as the file it stands for, read as the desktop reads it. */
export function fileOf(kind: Kind, value: unknown): File {
	const v = (value ?? {}) as Record<string, unknown>;
	if (kind === 'edge') {
		return kept({
			from: text(v.from, 'from'),
			to: text(v.to, 'to'),
			label: maybe(v.label) ?? undefined,
			shape: choice(v.shape, ['curved', 'straight', 'angled'], 'curved', 'shape'),
			arrow: choice(v.arrow, ['to', 'both', 'none'], 'to', 'arrow'),
			stroke: choice(v.stroke, ['solid', 'dashed', 'dotted', 'double'], 'solid', 'stroke')
		});
	}
	const at = { x: number(v.x, 'x'), y: number(v.y, 'y'), w: number(v.w, 'w'), h: number(v.h, 'h') };
	if (kind === 'zone') return kept({ name: maybe(v.name) ?? '', parent: maybe(v.parent), ...at, color: maybe(v.color) ?? undefined });
	return kept({
		note: maybe(v.note),
		zone: maybe(v.zone),
		...at,
		halign: choice(v.halign, ['left', 'center', 'right'], 'left', 'halign'),
		valign: choice(v.valign, ['top', 'center', 'bottom'], 'top', 'valign'),
		color: maybe(v.color) ?? undefined
	});
}
