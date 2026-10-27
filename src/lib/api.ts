// One typed function per Tauri command. The only module that calls `invoke`.
import { invoke } from '@tauri-apps/api/core';

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

export type Viewport = { zones: ZoneView[]; cards: CardView[]; edges: EdgeView[] };

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

/** A card or zone dropped with its top-left corner at a world position. */
export type Move = { id: string; x: number; y: number };

/** One line of a list beside the canvas: a note, with its card when it has one, or a zone. */
export type Entry =
	| { kind: 'note'; path: string; title: string; excerpt: string; card: string | null }
	| { kind: 'zone'; id: string; name: string };

export const listVaults = () => invoke<VaultEntry[]>('list_vaults');

/** Asks for a folder and makes it a vault if needed. Null if the dialog was cancelled. */
export const chooseVault = () => invoke<VaultEntry | null>('choose_vault');

/** Opens the vault and brings its index up to date. */
export const openVault = (id: string) => invoke<VaultEntry>('open_vault', { id });

/** The theme named in the open vault's `vault.json`, or null for the default. */
export const vaultTheme = () => invoke<string | null>('vault_theme');

/** Names the open vault's theme in its `vault.json`; null leaves it out, for the default. */
export const setVaultTheme = (theme: string | null) => invoke<void>('set_vault_theme', { theme });

/** Zones, cards and edges in `rect`, skipping those smaller than `minSize` world units. When
 * `collapsed`, nothing inside a zone comes back: only the outermost zones and the loose cards. */
export const queryViewport = (rect: Rect, minSize: number, collapsed: boolean) =>
	invoke<Viewport>('query_viewport', { rect, minSize, collapsed });

/** Places an empty card on a world rectangle and returns its ID. */
export const createCard = (x: number, y: number, w: number, h: number) =>
	invoke<string>('create_card', { x, y, w, h });

/** Places a card for the note at vault path `path` on a world rectangle, and gives the note its ID
 * if it has none. A note that already has its card gets no other: that card comes back, with
 * nothing to undo. */
export const placeNote = (path: string, x: number, y: number, w: number, h: number) =>
	invoke<Created>('place_note', { path, x, y, w, h });

/** Writes a note for each card, then the cards, centered, then the edges between them. They all
 * join the innermost zone under world point (x, y), which grows to hold them. */
export const createBatch = (x: number, y: number, cards: BatchCard[], edges: BatchEdge[]) =>
	invoke<Batch>('create_batch', { x, y, cards, edges });

/** A card's or a zone's box in the world, or null when it is gone. */
export const itemBox = (kind: 'card' | 'zone', id: string) => invoke<Rect | null>('item_box', { kind, id });

/** A page of the notes with no card, most recently changed first. */
export const unplacedNotes = (offset: number, limit: number) =>
	invoke<Entry[]>('unplaced_notes', { offset, limit });

/** A page of the zones, then the notes, holding every word typed, best matches first. */
export const search = (text: string, offset: number, limit: number) =>
	invoke<Entry[]>('search', { text, offset, limit });

/** Drops cards with their top-left corners at world positions; each joins the zone under its center. */
export const moveCards = (moves: Move[]) =>
	invoke<ItemState[]>('move_cards', { moves });

/** Gives a card a new world rectangle; it stays in its zone. */
export const resizeCard = (id: string, x: number, y: number, w: number, h: number) =>
	invoke<ItemState[]>('resize_card', { id, x, y, w, h });

export const alignCards = (ids: string[], halign: HAlign, valign: VAlign) =>
	invoke<ItemState[]>('align_cards', { ids, halign, valign });

/** Turns an unresolved card into an empty one. */
export const clearCard = (id: string) => invoke<ItemState[]>('clear_card', { id });

/** Deletes cards and their edges. Their notes stay, unplaced. */
export const deleteCards = (ids: string[]) => invoke<ItemState[]>('delete_cards', { ids });

/** Draws a zone on a world rectangle, inside the innermost zone around it. Cards and zones fully
 * inside it, at that level, join it. */
export const createZone = (x: number, y: number, w: number, h: number) =>
	invoke<Created>('create_zone', { x, y, w, h });

/** Drops zones with their top-left corners at world positions; each joins the innermost zone
 * fully around it, and brings its contents along. */
export const moveZones = (moves: Move[]) => invoke<ItemState[]>('move_zones', { moves });

/** Gives a zone a new world rectangle, grown to cover its contents, which stay in place. */
export const resizeZone = (id: string, x: number, y: number, w: number, h: number) =>
	invoke<ItemState[]>('resize_zone', { id, x, y, w, h });

/** The world area covered by everything inside a zone, or null when it is empty. */
export const zoneContents = (id: string) => invoke<Rect | null>('zone_contents', { id });

/** The world area covered by every zone and card, or null for an empty canvas. */
export const canvasContents = () => invoke<Rect | null>('canvas_contents');

export const renameZone = (id: string, name: string) => invoke<ItemState[]>('rename_zone', { id, name });

/** Sets the zones' color; null for the default. */
export const colorZones = (ids: string[], color: string | null) =>
	invoke<ItemState[]>('color_zones', { ids, color });

/** Deletes zones. What was inside moves up to the nearest zone left, without moving on screen. */
export const deleteZones = (ids: string[]) => invoke<ItemState[]>('delete_zones', { ids });

/** Connects two cards. When they are already connected, either way round, the existing edge comes
 * back with nothing to undo. */
export const createEdge = (from: string, to: string) => invoke<Created>('create_edge', { from, to });

/** Sets an edge's label; an empty one removes it. */
export const labelEdge = (id: string, label: string) => invoke<ItemState[]>('label_edge', { id, label });

export const shapeEdges = (ids: string[], shape: Shape) => invoke<ItemState[]>('shape_edges', { ids, shape });

export const arrowEdges = (ids: string[], arrow: Arrow) => invoke<ItemState[]>('arrow_edges', { ids, arrow });

export const strokeEdges = (ids: string[], stroke: Stroke) => invoke<ItemState[]>('stroke_edges', { ids, stroke });

export const deleteEdges =(ids: string[]) => invoke<ItemState[]>('delete_edges', { ids });

/** Brings items to the given states and returns the states they had. */
export const applyStates = (states: ItemState[]) => invoke<ItemState[]>('apply_states', { states });

/** The note's body, without frontmatter. */
export const readNote = (id: string) => invoke<string>('read_note', { id });

/** Writes a new note for an empty card and returns the note's ID. */
export const createNoteForCard = (cardId: string, body: string) =>
	invoke<string>('create_note_for_card', { cardId, body });

/** Replaces the note's body and returns true. When the note changed outside the app, it stays as
 * it is and the body goes to a new `<title> (conflict).md` instead: false. */
export const saveNote = (id: string, body: string) => invoke<boolean>('save_note', { id, body });

/** Empties the card, then deletes its (empty) note. */
export const discardNote = (cardId: string, noteId: string) =>
	invoke<void>('discard_note', { cardId, noteId });

/** Renames the note's file after its title, if the title changed. */
export const renameNote = (id: string) => invoke<void>('rename_note', { id });
