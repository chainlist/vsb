// What the browser keeps of each item. The `file` of a zone, card, edge or drawing is what the desktop writes
// to its JSON file, defaults left out, so item states, undo and a later export are the same on both
// platforms. The rest is derived on every write, as the desktop's index derives it.
import type { Arrow, Frame, HAlign, PenStroke, Shape, Stroke, VAlign } from '#lib/api.js';
import type { Box } from './grid.ts';
import type { Words } from './words.ts';

export type Kind = 'zone' | 'card' | 'edge' | 'drawing';

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

/** The pen's medium width in world units, at middling pressure: a stroke's unless it says otherwise. */
export const MEDIUM = 3;

/** Strokes of the pen grouped as one item: its corner in its zone, the box around its ink, and its
 * strokes, each in its own color and width. */
export type DrawingFile = { zone: string | null; x: number; y: number; w: number; h: number; strokes: PenStroke[] };

export type File = ZoneFile | CardFile | EdgeFile | DrawingFile;

/** A card a zone holds directly: its box in the zone's coordinates, as its file has it, and its color. */
export type Held = [x: number, y: number, w: number, h: number, color: string | null];

/** A zone, with the cards it holds directly, by ID: what the zone list counts, framing covers and a
 * collapsed zone's preview draws, without reading the cards. */
export type ZoneRecord = { id: string; file: ZoneFile; held: Record<string, Held> };

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

/** A drawing, with its absolute corner, its outermost zone ('' when loose) and the grid squares it is
 * filed under. `zk` is its zone as written, '' for the canvas. It is never counted in clusters. */
export type DrawingRecord = { id: string; file: DrawingFile; zk: string; ax: number; ay: number; root: string; g: number[][] };

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

/** A stroke as its file has it now, or as it was before strokes had their own color and width: a bare
 * list of points, in `color`, the drawing's. */
function penStroke(s: unknown, color: string | null): PenStroke {
	const o = (Array.isArray(s) ? { points: s } : (s ?? {})) as Record<string, unknown>;
	const points = o.points;
	if (!Array.isArray(points) || !points.every((n) => typeof n === 'number')) throw new Error('invalid field `strokes`');
	const width = o.width === undefined || o.width === null ? MEDIUM : number(o.width, 'width');
	return kept({ points, color: maybe(o.color) ?? color ?? undefined, width: width === MEDIUM ? undefined : width });
}

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
	if (kind === 'drawing') {
		if (!Array.isArray(v.strokes)) throw new Error('missing field `strokes`');
		// Before strokes had their own color, the drawing's applied to all of them.
		const color = maybe(v.color);
		return kept({ zone: maybe(v.zone), ...at, strokes: v.strokes.map((s: unknown) => penStroke(s, color)) });
	}
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
