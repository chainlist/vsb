// The one way to the backend: one typed function per command, and the types they speak. Each build
// talks to one backend through `#platform` (package.json `imports`), picked when the app is built:
// the desktop's Rust through Tauri (`platform/tauri.ts`, the default), or, in the web build, the
// browser's own on IndexedDB (`platform/browser/`, the `web` condition). Components never call
// either directly.
export * from '#platform';

export type VaultEntry = { id: string; name: string; path: string };

/** Where the open vault is kept, in its backend's words, as Settings > Vault shows it. */
export type VaultHome = {
	/** Its folder's path, or this browser. */
	place: string;
	/** What that means for its notes. */
	about: string;
	/** A button beside it, such as showing the folder; null for none. The tab asks again after it. */
	action: { label: string; run: () => Promise<void> } | null;
};

/** What the mouse wheel does on the canvas, on this device: zoom, the default, or pan. */
export type Wheel = 'zoom' | 'pan';

/** A world rectangle. */
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/** A zone in absolute world coordinates. */
export type ZoneView = {
	id: string;
	parent: string | null;
	name: string;
	color: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
};

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';

/** A card in absolute world coordinates, with what the index knows of its note. */
export type CardView = {
	id: string;
	note: string | null;
	zone: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
	halign: HAlign;
	valign: VAlign;
	/** A highlighter the card is washed with; null for the theme's plain stock. */
	color: string | null;
	title: string | null;
	excerpt: string | null;
	/** False when `note` is set but its file is missing. */
	resolved: boolean;
};

/** An item's box in absolute world coordinates. */
export type Frame = { x: number; y: number; w: number; h: number };

/** How an edge runs between its cards. */
export type Shape = 'curved' | 'straight' | 'angled';
/** Where an edge has arrowheads: at its `to` card, at both cards, or at neither. */
export type Arrow = 'to' | 'both' | 'none';
/** How an edge's line is drawn: one solid line, dashes, dots, or two parallel lines. */
export type Stroke = 'solid' | 'dashed' | 'dotted' | 'double';
/** An edge's style. Every edge the app creates takes the vault's style for new edges, unless the
 * builder's text says otherwise. */
export type EdgeStyle = { shape: Shape; arrow: Arrow; stroke: Stroke };

/** An edge, with the boxes of both its cards, `from` first, so it is drawn when they are off-screen. */
export type EdgeView = {
	id: string;
	from: string;
	to: string;
	label: string | null;
	shape: Shape;
	arrow: Arrow;
	stroke: Stroke;
	ends: [Frame, Frame];
};

/** One stroke of the pen, as its drawing's file has it: its points as x, y and pressure in turn, from
 * the drawing's corner; its color, left out for the theme's ink; its width in world units, left out
 * at the pen's medium width. */
export type PenStroke = { points: number[]; color?: string; width?: number };

/** Strokes of the pen grouped as one item, in absolute world coordinates: the box around its ink, and
 * its strokes, each in its own color and width. */
export type DrawingView = Frame & { id: string; zone: string | null; strokes: PenStroke[] };

/** What erasing leaves of one stroke of a drawing, by its place in it: the pieces a cutting eraser
 * left, each with its points from the drawing's corner and kept as a stroke of its own in the same
 * color and width, or none when the stroke goes whole. */
export type Cut = { index: number; pieces: number[][] };

/** The strokes of a drawing an eraser passed over. */
export type Erased = { id: string; strokes: Cut[] };

/** Which eraser the pen takes: one that takes out whole strokes, or one that cuts them where it passes. */
export type Eraser = 'stroke' | 'cut';

/** The pen as this device last left it: its color (null for the theme's ink), its width in world
 * units, and the eraser it takes. */
export type Pen = { color: string | null; width: number; eraser: Eraser };

/** Zoomed out, the loose cards whose centers lie in one square of the grid: the box around them,
 * how many, and the square's column and row counted from the world origin. Never the cards. */
export type Cluster = Frame & { cell: [number, number]; count: number };

/** One end of a bundle: an outermost zone and its box, or, with no zone, the box of a cluster. */
export type BundleEnd = Frame & { zone: string | null };

/** Zoomed out, the edges between two ends drawn as one line: how many, and where they point. */
export type Bundle = { ends: [BundleEnd, BundleEnd]; count: number; arrow: Arrow };

/** Zoomed out, what a collapsed zone holds at any depth, in its coordinates from its top-left corner:
 * its cards' boxes by color (null for the theme's plain stock) and its inner zones' boxes, top to
 * bottom then left to right, and its drawings by color (null for the theme's ink), oldest first, each
 * as its corner and its strokes. Only what meets the queried area and is large enough comes back. */
export type Preview = {
	zone: string;
	cards: { color: string | null; boxes: Frame[] }[];
	zones: Frame[];
	inks: { color: string | null; drawings: { x: number; y: number; strokes: number[][] }[] }[];
};

/** Open, the zones, cards, edges and drawings; zoomed out, the outermost zones with a preview of what
 * they hold, the loose drawings, the clusters and the bundles. */
export type Viewport = {
	zones: ZoneView[];
	cards: CardView[];
	edges: EdgeView[];
	/** Oldest first, so newer ones are drawn on top. */
	drawings: DrawingView[];
	clusters: Cluster[];
	bundles: Bundle[];
	previews: Preview[];
};

/** One zone, card, edge or drawing file: its JSON, or null for no file. Layout edits return the
 * states they replaced, and applying those reverses the edit. */
export type ItemState = { kind: 'zone' | 'card' | 'edge' | 'drawing'; id: string; value: unknown };

/** A new item's ID, with the states that undo its creation. */
export type Created = { id: string; undo: ItemState[] };

/** A card to create on a world rectangle, with a new note holding `text`. */
export type BatchCard = Frame & { text: string };

/** An edge to create between two of a batch's cards, given as indexes into them. */
export type BatchEdge = { from: number; to: number; arrow: Arrow; stroke: Stroke };

/** The new cards' IDs, in the order they were given, with the states that undo the batch. */
export type Batch = { cards: string[]; undo: ItemState[] };

/** What copying gathers, for the clipboard: the box around it in the world it was copied from, and
 * its items by the IDs they were copied from, their corners from the box's corner. An item's zone (a
 * zone's `parent`) is the copied zone around it, or null. Zones come parents first. A card brings
 * its note's text, null for none. */
export type Clip = Frame & {
	zones: (Frame & { id: string; parent: string | null; name: string; color?: string })[];
	cards: (Frame & { id: string; zone: string | null; halign?: HAlign; valign?: VAlign; color?: string; text: string | null })[];
	drawings: (Frame & { id: string; zone: string | null; strokes: PenStroke[] })[];
	edges: { from: string; to: string; label?: string; shape?: Shape; arrow?: Arrow; stroke?: Stroke }[];
};

/** The new items pasted on their own, not inside a pasted zone, with the states that undo the paste. */
export type Pasted = { ids: string[]; undo: ItemState[] };

/** What the batch builder opens with: cards by their titles, top to bottom, the edges between them,
 * and the zone new cards join (null for the canvas). */
export type BatchScope = {
	zone: string | null;
	cards: (Frame & { id: string; title: string })[];
	edges: { id: string; from: string; to: string; arrow: Arrow; stroke: Stroke }[];
};

/** An end of a link the builder's text draws: a card it opened with, or one of its new cards. */
export type LinkEnd = { card: string } | { new: number };

export type Link = { from: LinkEnd; to: LinkEnd; arrow: Arrow; stroke: Stroke };

/** What a text does to the edges between the cards the builder opened with: the edges it removes,
 * those it restyles (each with the link that does it, an index into the links), and the links that
 * make new edges. */
export type LinkPlan = { removed: string[]; restyled: [string, number][]; created: number[] };

/** A card, zone or drawing dropped with its top-left corner at a world position. */
export type Move = { id: string; x: number; y: number };

/** One line of the zone list: a zone, whether zones lie inside it, how many cards it holds at any
 * depth, and its box in the world. */
export type ZoneRow = Frame & { id: string; name: string; color: string | null; inner: boolean; cards: number };

/** One line of a list beside the canvas: a note, with its card when it has one, or a zone. */
export type Entry =
	| { kind: 'note'; path: string; title: string; excerpt: string; card: string | null }
	| { kind: 'zone'; id: string; name: string };

/** What arranging a zone lays out, or inserting a card in it moves: its own cards and its inner
 * zones (`zone` true), each with its box in the world, and the edges between them as indexes into
 * them. An edge to a card inside an inner zone joins that zone. Inserting a card also moves the
 * drawings directly in it, which arranging leaves. */
export type ZoneNodes = {
	nodes: (Frame & { id: string; zone: boolean })[];
	edges: { from: number; to: number }[];
	drawings: (Frame & { id: string })[];
};
