// Copying, pasting and duplicating. Copying puts the selection on the system clipboard twice: as its
// cards' text, for other apps, and as a clip hidden in the HTML, for this app, in any vault. Pasting
// lands centered under the pointer, or where the paper was right-clicked; text from another app
// becomes a card, a lone web address a link card once its page is read, and an image an image card.
import { copyItems, pasteItems, type Clip } from '#lib/api.js';
import { typing } from '#lib/keys.js';
import { renderMarkdown } from '#lib/markdown.js';
import { landing } from './actions.js';
import { camera } from './camera.svelte.js';
import { NEW_CARD } from './gestures.js';
import { GRID, snap, toGrid } from './grid.svelte.js';
import { history } from './history.js';
import { addImages, isImage, pastedName } from './images.js';
import { linkClip, webAddress } from './links.svelte.js';
import { selection } from './selection.svelte.js';

/** The attribute of the HTML on the clipboard that holds a clip. */
const MARK = 'data-vsb-clip';
/** How far a duplicate lands from its original, right and down, in world units: two graph-paper squares. */
const STEP = 2 * GRID;

/** Whether anything that copies is selected: cards, zones or drawings. Edges come with their cards. */
export const copyable = () => selection.cards.length + selection.zones.length + selection.drawings.length > 0;

const gather = () =>
	copyItems(
		selection.cards.map((c) => c.id),
		selection.zones.map((z) => z.id),
		selection.drawings.map((d) => d.id)
	);

export async function copySelected() {
	const clip = await gather();
	// The cards' text in reading order, top to bottom, then left to right; a link card's is its address.
	const texts = clip.cards
		.filter((c) => (c.link ?? c.text)?.trim())
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((c) => c.link ?? c.text!);
	const html = `<div ${MARK}="${encodeURIComponent(JSON.stringify(clip))}">${texts.map(renderMarkdown).join('')}</div>`;
	const blob = (text: string, type: string) => new Blob([text], { type });
	await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob(html, 'text/html'), 'text/plain': blob(texts.join('\n\n'), 'text/plain') })]);
}

/** Copies the selection two graph-paper squares right and down, and selects the copies. */
export function duplicateSelected() {
	return history.edit(async () => {
		const clip = await gather();
		const [x, y] = [clip.x + STEP, clip.y + STEP];
		const { ids, undo } = await pasteItems(clip, x, y);
		landing([{ x, y, w: clip.w, h: clip.h }])(ids);
		return undo;
	});
}

/** Where Mod+V lands, from the key until the paste event it lets through; null when no paste is due. */
let due: { x: number; y: number } | null = null;

/** Mod+V on the canvas: the paste event that follows lands under the pointer. */
export function armPaste() {
	due = camera.pointed();
}

/** Listens for the paste event Mod+V lets through, until the returned function is called. */
export function listenForPaste() {
	addEventListener('paste', onPaste);
	return () => removeEventListener('paste', onPaste);
}

function onPaste(e: ClipboardEvent) {
	const at = due;
	due = null;
	const data = e.clipboardData;
	if (!at || typing(e.target) || !data) return;
	if (land(data.getData('text/plain'), data.getData('text/html'), [...data.files], at)) e.preventDefault();
}

/** Pastes centered on a world point from the paper's right-click menu. A menu has no paste event: the
 * clipboard is read, which a browser may ask permission for first. */
export async function pasteAt(at: { x: number; y: number }) {
	const found = await navigator.clipboard.read();
	const read = (type: string) => found.find((item) => item.types.includes(type))?.getType(type);
	const text = (await (await read('text/plain'))?.text()) ?? '';
	const html = (await (await read('text/html'))?.text()) ?? '';
	const images = await Promise.all(found.flatMap((item) => item.types.filter((t) => t.startsWith('image/')).map((t) => item.getType(t))));
	land(text, html, images, at);
}

/** Lands what the clipboard holds centered on a world point, saying whether it held anything to paste.
 * Text comes before an image: an app such as a word processor copies text with a picture of it. */
function land(text: string, html: string, files: Blob[], at: { x: number; y: number }) {
	const link = webAddress(text);
	const clip = clipIn(html) ?? (link ? null : textClip(text));
	const image = clip || link ? undefined : files.find(isImage);
	if (clip) paste(clip, at);
	else if (link) void linkClip(link, at).then((read) => read && paste(read, at));
	else if (image) void addImages([{ name: pastedName(image), blob: image }], at);
	return !!(clip || link || image);
}

/** Pastes a clip centered on a world point, its corner on the grid when snapping is on, as one undo
 * step, and selects what it pasted. */
function paste(clip: Clip, at: { x: number; y: number }) {
	const place = (v: number) => (snap.on ? toGrid(v) : Math.round(v));
	const [x, y] = [place(at.x - clip.w / 2), place(at.y - clip.h / 2)];
	const land = landing([{ x, y, w: clip.w, h: clip.h }]);
	return history.edit(async () => {
		const { ids, undo } = await pasteItems(clip, x, y);
		land(ids);
		return undo;
	});
}

/** The clip in HTML copied from this app, or null. */
function clipIn(html: string): Clip | null {
	const found = new RegExp(`${MARK}="([^"]*)"`).exec(html);
	if (!found) return null;
	try {
		const clip = JSON.parse(decodeURIComponent(found[1]));
		const lists = [clip.zones, clip.cards, clip.drawings, clip.edges];
		return [clip.w, clip.h].every(Number.isFinite) && lists.every(Array.isArray) ? clip : null;
	} catch {
		return null;
	}
}

/** Text from another app, as a clip of one card the size of a placed card; null for none. */
function textClip(text: string): Clip | null {
	if (!text.trim()) return null;
	const card = { id: 'text', zone: null, x: 0, y: 0, ...NEW_CARD, text };
	return { x: 0, y: 0, ...NEW_CARD, zones: [], cards: [card], drawings: [], edges: [] };
}
