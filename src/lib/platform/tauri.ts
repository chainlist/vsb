// The desktop's backend: one typed function per Tauri command. The only module that calls `invoke`.
import { invoke } from '@tauri-apps/api/core';
import type {
	Batch,
	BatchCard,
	BatchEdge,
	BatchScope,
	Created,
	EdgeStyle,
	Entry,
	Erased,
	HAlign,
	ItemState,
	Link,
	LinkPlan,
	Move,
	Rect,
	Shape,
	Stroke,
	Arrow,
	VAlign,
	VaultEntry,
	VaultHome,
	Viewport,
	Wheel,
	ZoneNodes,
	ZoneRow
} from '#lib/api.js';

/** This device's interface size in percent, the same in every vault; null for the default. */
export const deviceInterfaceSize = () => invoke<number | null>('device_interface_size');

/** Keeps this device's interface size; null leaves it out, for the default. */
export const setDeviceInterfaceSize = (size: number | null) => invoke<void>('set_device_interface_size', { size });

/** What the mouse wheel does on this device's canvas, the same in every vault. */
export const deviceWheel = () => invoke<Wheel>('device_wheel');

/** Keeps what the wheel does on this device; zooming, the default, is left out. */
export const setDeviceWheel = (wheel: Wheel) => invoke<void>('set_device_wheel', { wheel });

export const listVaults = () => invoke<VaultEntry[]>('list_vaults');

/** Asks for a folder and makes it a vault if needed. Null if the dialog was cancelled. */
export const chooseVault = () => invoke<VaultEntry | null>('choose_vault');

/** What the vault picker says, above and on its button: here, choosing a folder. */
export const vaultPicker = {
	lede: 'Pick any folder. Your notes stay in it as plain Markdown files.',
	action: 'Open a folder'
};

/** Opens the vault and brings its index up to date. */
export const openVault = (id: string) => invoke<VaultEntry>('open_vault', { id });

/** The theme named in the open vault's `vault.json`, or null for the default. */
export const vaultTheme = () => invoke<string | null>('vault_theme');

/** Names the open vault's theme in its `vault.json`; null leaves it out, for the default. */
export const setVaultTheme = (theme: string | null) => invoke<void>('set_vault_theme', { theme });

/** Whether the open vault's `vault.json` has moved and resized cards and zones snap to the grid. */
export const vaultSnap = () => invoke<boolean>('vault_snap');

/** Turns snapping to the grid on or off in the open vault's `vault.json`. */
export const setVaultSnap = (snap: boolean) => invoke<void>('set_vault_snap', { snap });

/** The style the open vault's `vault.json` gives every edge the app creates. */
export const vaultEdgeStyle = () => invoke<EdgeStyle>('vault_edge_style');

/** Sets the style for new edges in the open vault's `vault.json`, which leaves out what is at the default. */
export const setVaultEdgeStyle = (style: EdgeStyle) => invoke<void>('set_vault_edge_style', { style });

/** Where the open vault lives: its folder, which can be shown in Explorer or Finder. */
export const vaultHome = async (): Promise<VaultHome> => ({
	place: await invoke<string>('vault_folder'),
	about: 'Its notes are plain Markdown files in its notes folder, yours to open, sync and back up.',
	action: { label: 'Show in folder', run: () => invoke<void>('reveal_vault') }
});

/** Zones, cards and edges in `rect`, skipping those smaller than `minSize` world units. Zoomed
 * out, given the size of a `cell` of the clusters' grid, nothing inside a zone comes back: only the
 * outermost zones, the loose cards counted per cell and the edges bundled. */
export const queryViewport = (rect: Rect, minSize: number, cell: number | null) =>
	invoke<Viewport>('query_viewport', { rect, minSize, cell });

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

/** The cards inside `zone` at any depth, or else the cards `cards`, as the batch builder opens with them. */
export const batchScope = (zone: string | null, cards: string[]) => invoke<BatchScope>('batch_scope', { zone, cards });

/** What applying the links would do to the edges between the `scope` cards, without doing it. */
export const planLinks = (scope: string[], links: Link[]) => invoke<LinkPlan>('plan_links', { scope, links });

/** Writes new cards in `zone` (or on the canvas) and brings the edges between them and the `scope`
 * cards to what the links draw, as one edit. */
export const editBatch = (zone: string | null, scope: string[], cards: BatchCard[], links: Link[]) =>
	invoke<Batch>('edit_batch', { zone, scope, cards, links });

/** The nodes of a zone, or of the canvas itself for null. */
export const zoneNodes = (zone: string | null) => invoke<ZoneNodes>('zone_nodes', { zone });

/** Moves cards and zones to world positions, each staying in its zone, which grows to hold them; a
 * zone brings everything in it. */
export const arrangeItems = (cards: Move[], zones: Move[]) => invoke<ItemState[]>('arrange', { cards, zones });

/** A card's or a zone's box in the world, or null when it is gone. */
export const itemBox = (kind: 'card' | 'zone', id: string) => invoke<Rect | null>('item_box', { kind, id });

/** A page of the notes with no card, most recently changed first. */
export const unplacedNotes = (offset: number, limit: number) =>
	invoke<Entry[]>('unplaced_notes', { offset, limit });

/** A page of the zones, then the notes, holding every word typed, best matches first. */
export const search = (text: string, offset: number, limit: number) =>
	invoke<Entry[]>('search', { text, offset, limit });

/** A page of the zones directly inside `parent`, or on the canvas for null, by name ignoring case. */
export const zoneRows = (parent: string | null, offset: number, limit: number) =>
	invoke<ZoneRow[]>('zone_rows', { parent, offset, limit });

/** A page of the zones at any depth whose name holds every word typed, as search finds them, by
 * name ignoring case. Nothing for nothing typed. */
export const zoneMatches = (text: string, offset: number, limit: number) =>
	invoke<ZoneRow[]>('zone_matches', { text, offset, limit });

/** A value of this device's state for the open vault, kept in its index, never in a synced file. */
export const uiState = (key: string) => invoke<string | null>('ui_state', { key });

export const setUiState = (key: string, value: string) => invoke<void>('set_ui_state', { key, value });

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

/** Sets the color of cards, zones and drawings, as one edit; null for none. */
export const colorItems = (cards: string[], zones: string[], drawings: string[], color: string | null) =>
	invoke<ItemState[]>('color_items', { cards, zones, drawings, color });

/** Deletes zones. What was inside moves up to the nearest zone left, without moving on screen. */
export const deleteZones = (ids: string[]) => invoke<ItemState[]>('delete_zones', { ids });

/** Connects two cards. When they are already connected, either way round, the existing edge comes
 * back with nothing to undo. */
export const createEdge = (from: string, to: string) => invoke<Created>('create_edge', { from, to });

/** Inserts an empty card on an edge, on the world rectangle `at` in `zone` (null: the canvas): the
 * edge is split around it, both halves keeping its style and the first its label, and the cards,
 * zones and drawings given move to make room, the zone growing where needed. */
export const insertCard = (edge: string, zone: string | null, at: Rect, cards: Move[], zones: Move[], drawings: Move[]) =>
	invoke<Created>('insert_card', { edge, zone, at, cards, zones, drawings });

/** Adds an empty card on the world rectangle `at`, in the zone of the card `from` whatever lies under
 * it, with a new edge from that card to it. The zone grows where needed to hold it. */
export const addChild = (from: string, at: Rect) => invoke<Created>('add_child', { from, at });

/** Sets an edge's label; an empty one removes it. */
export const labelEdge = (id: string, label: string) => invoke<ItemState[]>('label_edge', { id, label });

export const shapeEdges = (ids: string[], shape: Shape) => invoke<ItemState[]>('shape_edges', { ids, shape });

export const arrowEdges = (ids: string[], arrow: Arrow) => invoke<ItemState[]>('arrow_edges', { ids, arrow });

export const strokeEdges = (ids: string[], stroke: Stroke) => invoke<ItemState[]>('stroke_edges', { ids, stroke });

export const deleteEdges =(ids: string[]) => invoke<ItemState[]>('delete_edges', { ids });

/** Adds a stroke of the pen, its points as world x, y and pressure in turn: to the drawing whose box it
 * starts near, or as a new drawing, in the zone under its start. */
export const addStroke = (points: number[]) => invoke<Created>('add_stroke', { points });

/** Takes strokes out of drawings, as one edit: a drawing's box shrinks to the strokes left, and a
 * drawing left with none is deleted. */
export const eraseStrokes = (erased: Erased[]) => invoke<ItemState[]>('erase_strokes', { erased });

/** Drops drawings with their top-left corners at world positions; each joins the zone under its center. */
export const moveDrawings = (moves: Move[]) => invoke<ItemState[]>('move_drawings', { moves });

export const deleteDrawings = (ids: string[]) => invoke<ItemState[]>('delete_drawings', { ids });

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
