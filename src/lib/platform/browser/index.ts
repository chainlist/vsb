// The browser's backend: every command the desktop's Rust answers, with the same signature and the
// same behavior, in TypeScript on IndexedDB. Commands run one at a time, as the desktop's do, and
// fail with plain strings, as Tauri's do.
import type {
	Arrow,
	BatchCard,
	BatchEdge,
	Clip,
	EdgeStyle,
	Erased,
	HAlign,
	ItemState,
	Link,
	Move,
	Pen,
	Rect,
	Shape,
	Stroke,
	VAlign,
	Wheel
} from '#lib/api.js';
import type * as Desktop from '../tauri.ts';
import { apply, type Edit } from './apply.ts';
import * as attachments from './attachments.ts';
import * as batch from './batch.ts';
import * as cards from './cards.ts';
import * as clip from './clip.ts';
import * as drawings from './drawings.ts';
import * as edges from './edges.ts';
import * as lists from './lists.ts';
import * as notes from './notes.ts';
import * as scope from './scope.ts';
import { command, read, write, zones as layout } from './session.ts';
import * as settings from './settings.ts';
import * as vaults from './vaults.ts';
import { viewport } from './viewport.ts';
import * as zones from './zones.ts';

const reading = <T>(run: (e: Edit) => Promise<T> | T) => command(() => read(run));
const writing = <T>(run: (e: Edit) => Promise<T>) => command(() => write(run));
const local = <T>(run: () => T) => command(async () => run());

export const deviceInterfaceSize = () => local(vaults.interfaceSize);
export const setDeviceInterfaceSize = (size: number | null) => local(() => vaults.setInterfaceSize(size));
export const devicePen = () => local(vaults.pen);
export const setDevicePen = (pen: Pen) => local(() => vaults.setPen(pen));
export const deviceWheel = () => local(vaults.wheel);
export const setDeviceWheel = (wheel: Wheel) => local(() => vaults.setWheel(wheel));
export const listVaults = () => local(vaults.listVaults);
/** Asks for a vault's name, as the desktop asks for a folder. Null if the dialog was cancelled. */
export const chooseVault = () =>
	command(async () => {
		const { askName } = await import('./askName.ts');
		const name = await askName();
		return name === null ? null : vaults.createVault(name);
	});
/** What the vault picker says, above and on its button: here, naming a vault. */
export const vaultPicker = {
	lede: 'Name a vault. Your notes stay in this browser.',
	action: 'Open a vault'
};
export const openVault = (id: string) => command(() => vaults.openVault(id));
export const vaultTheme = () => reading(settings.theme);
export const setVaultTheme = (theme: string | null) => writing((e) => settings.setTheme(e, theme));
export const vaultPaper = () => reading(settings.paper);
export const setVaultPaper = (paper: string | null) => writing((e) => settings.setPaper(e, paper));
export const vaultSnap = () => reading(settings.snap);
export const setVaultSnap = (snap: boolean) => writing((e) => settings.setSnap(e, snap));
export const vaultEdgeStyle = () => reading(settings.edgeStyle);
export const setVaultEdgeStyle = (style: EdgeStyle) => writing((e) => settings.setEdgeStyle(e, style));
export const vaultHome = () => command(vaults.home);

export const queryViewport = (rect: Rect, minSize: number, cell: number | null) => reading((e) => viewport(e, rect, minSize, cell));
export const createCard = (x: number, y: number, w: number, h: number) => writing((e) => cards.createCard(e, x, y, w, h));
export const placeNote = (path: string, x: number, y: number, w: number, h: number) => writing((e) => cards.placeNote(e, path, x, y, w, h));
export const placeFile = (path: string, x: number, y: number, w: number, h: number) => writing((e) => cards.placeFile(e, path, x, y, w, h));
export const writeImage = (name: string, bytes: ArrayBuffer) => writing((e) => attachments.writeImage(e, name, bytes));
export const readAttachment = (path: string) => reading((e) => attachments.readAttachment(e, path));
export const createBatch = (x: number, y: number, c: BatchCard[], l: BatchEdge[]) => writing((e) => batch.createBatch(e, x, y, c, l));
export const copyItems = (c: string[], z: string[], d: string[]) => reading((e) => clip.copyItems(e, c, z, d));
export const pasteItems = (from: Clip, x: number, y: number) => writing((e) => clip.pasteItems(e, from, x, y));
export const batchScope = (zone: string | null, ids: string[]) => reading((e) => scope.batchScope(e, zone, ids));
export const planLinks = (ids: string[], links: Link[]) => reading((e) => batch.planLinks(e, ids, links));
export const editBatch = (zone: string | null, ids: string[], c: BatchCard[], links: Link[]) =>
	writing((e) => batch.editBatch(e, zone, ids, c, links));
export const zoneNodes = (zone: string | null) => reading((e) => scope.zoneNodes(e, zone));
export const arrangeItems = (c: Move[], z: Move[]) => writing((e) => cards.arrange(e, c, z));
export const itemBox = (kind: 'card' | 'zone', id: string) => reading((e) => scope.itemBox(e, kind, id));

export const unplacedNotes = (offset: number, limit: number) => reading((e) => lists.unplaced(e, offset, limit));
export const search = (text: string, offset: number, limit: number) => reading((e) => lists.search(e, text, offset, limit));
export const zoneRows = (parent: string | null, offset: number, limit: number) => local(() => lists.zoneRows(layout(), parent, offset, limit));
export const zoneMatches = (text: string, offset: number, limit: number) => local(() => lists.zoneMatches(layout(), text, offset, limit));
export const uiState = (key: string) => reading((e) => settings.uiState(e, key));
export const setUiState = (key: string, value: string) => writing((e) => settings.setUiState(e, key, value));

export const moveCards = (moves: Move[]) => writing((e) => cards.moveCards(e, moves));
export const resizeCard = (id: string, x: number, y: number, w: number, h: number) => writing((e) => cards.resizeCard(e, id, x, y, w, h));
export const alignCards = (ids: string[], halign: HAlign, valign: VAlign) => writing((e) => cards.alignCards(e, ids, halign, valign));
export const clearCard = (id: string) => writing((e) => cards.clearCard(e, id));
export const deleteCards = (ids: string[]) => writing((e) => cards.deleteCards(e, ids));

export const createZone = (x: number, y: number, w: number, h: number) => writing((e) => zones.createZone(e, x, y, w, h));
export const moveZones = (moves: Move[]) => writing((e) => zones.moveZones(e, moves));
export const resizeZone = (id: string, x: number, y: number, w: number, h: number) => writing((e) => zones.resizeZone(e, id, x, y, w, h));
export const zoneContents = (id: string) => reading((e) => scope.zoneContents(e, id));
export const canvasContents = () => reading(scope.canvasContents);
export const renameZone = (id: string, name: string) => writing((e) => zones.renameZone(e, id, name));
export const colorItems = (c: string[], z: string[], d: string[], color: string | null) => writing((e) => zones.colorItems(e, c, z, d, color));
export const deleteZones = (ids: string[]) => writing((e) => zones.deleteZones(e, ids));

export const createEdge = (from: string, to: string) => writing((e) => edges.createEdge(e, from, to));
export const insertCard = (edge: string, zone: string | null, at: Rect, c: Move[], z: Move[], d: Move[]) =>
	writing((e) => edges.insertCard(e, edge, zone, at, c, z, d));
export const addChild = (from: string, at: Rect) => writing((e) => edges.addChild(e, from, at));
export const labelEdge = (id: string, label: string) => writing((e) => edges.labelEdge(e, id, label));
export const shapeEdges = (ids: string[], shape: Shape) => writing((e) => edges.shapeEdges(e, ids, shape));
export const arrowEdges = (ids: string[], arrow: Arrow) => writing((e) => edges.arrowEdges(e, ids, arrow));
export const strokeEdges = (ids: string[], stroke: Stroke) => writing((e) => edges.strokeEdges(e, ids, stroke));
export const deleteEdges = (ids: string[]) => writing((e) => edges.deleteEdges(e, ids));

export const addStroke = (points: number[], color: string | null, width: number) => writing((e) => drawings.addStroke(e, points, color, width));
export const eraseStrokes = (erased: Erased[]) => writing((e) => drawings.eraseStrokes(e, erased));
export const moveDrawings = (moves: Move[]) => writing((e) => drawings.moveDrawings(e, moves));
export const deleteDrawings = (ids: string[]) => writing((e) => drawings.deleteDrawings(e, ids));

export const applyStates = (states: ItemState[]) => writing((e) => apply(e, states));

export const readNote = (id: string) => reading((e) => notes.readNote(e, id));
export const createNoteForCard = (cardId: string, body: string) => writing((e) => notes.createNoteForCard(e, cardId, body));
export const saveNote = (id: string, body: string) => writing((e) => notes.saveNote(e, id, body));
export const discardNote = (cardId: string, noteId: string) => writing((e) => notes.discardNote(e, cardId, noteId));
export const renameNote = (id: string) => writing((e) => notes.renameNote(e, id));

/** The browser answers every command the desktop does, with the same signature: this fails to type
 * check when it does not. */
type Same<T extends typeof Desktop> = T;
export type Checked = Same<typeof import('./index.ts')>;
