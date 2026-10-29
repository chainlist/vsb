// The one way to the backend: one typed function per command, and the types they speak. Each build
// talks to one backend through `#platform` (package.json `imports`), picked when the app is built:
// the desktop's Rust through Tauri (`platform/tauri.ts`, the default), or, in the web build, the
// browser's own on IndexedDB (`platform/browser/`, the `web` condition). Components never call
// either directly.
export * from '#platform';

export type VaultEntry = { id: string; name: string; path: string };

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

/** Zoomed out, the loose cards whose centers lie in one square of the grid: the box around them,
 * how many, and the square's column and row counted from the world origin. Never the cards. */
export type Cluster = Frame & { cell: [number, number]; count: number };

/** One end of a bundle: an outermost zone and its box, or, with no zone, the box of a cluster. */
export type BundleEnd = Frame & { zone: string | null };

/** Zoomed out, the edges between two ends drawn as one line: how many, and where they point. */
export type Bundle = { ends: [BundleEnd, BundleEnd]; count: number; arrow: Arrow };

/** Zoomed out, what a collapsed zone holds at any depth, in its coordinates from its top-left corner:
 * its cards' boxes by color (null for the theme's plain stock), and its inner zones' boxes, top to
 * bottom then left to right. Only what meets the queried area and is large enough comes back. */
export type Preview = { zone: string; cards: { color: string | null; boxes: Frame[] }[]; zones: Frame[] };

/** Open, the zones, cards and edges; zoomed out, the outermost zones with a preview of what they
 * hold, the clusters and the bundles. */
export type Viewport = {
	zones: ZoneView[];
	cards: CardView[];
	edges: EdgeView[];
	clusters: Cluster[];
	bundles: Bundle[];
	previews: Preview[];
};

/** One zone, card or edge file: its JSON, or null for no file. Layout edits return the states
 * they replaced, and applying those reverses the edit. */
export type ItemState = { kind: 'zone' | 'card' | 'edge'; id: string; value: unknown };

/** A new item's ID, with the states that undo its creation. */
export type Created = { id: string; undo: ItemState[] };

/** A card to create on a world rectangle, with a new note holding `text`. */
export type BatchCard = Frame & { text: string };

/** An edge to create between two of a batch's cards, given as indexes into them. */
export type BatchEdge = { from: number; to: number; arrow: Arrow; stroke: Stroke };

/** The new cards' IDs, in the order they were given, with the states that undo the batch. */
export type Batch = { cards: string[]; undo: ItemState[] };

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

/** A card or zone dropped with its top-left corner at a world position. */
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
 * them. An edge to a card inside an inner zone joins that zone. */
export type ZoneNodes = { nodes: (Frame & { id: string; zone: boolean })[]; edges: { from: number; to: number }[] };
