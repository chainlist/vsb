// Image cards: cards showing an image file of the vault. Image files dropped on the canvas, or an
// image pasted, are written under the vault's attachments and placed as cards; each file is read
// once while the vault is open and shown through an object URL.
import { placeFile, readAttachment, writeImage, type ItemState } from '#lib/api.js';
import { landing } from './actions.js';
import { camera } from './camera.svelte.js';
import { MIN, NEW_CARD } from './gestures.js';
import { snap, toGrid } from './grid.svelte.js';
import { history } from './history.js';
import { pointIn } from './zoom.js';

/** Longest side of an image card as it is added, in world units: two placed cards wide. */
const LONGEST = 480;
/** Room between images added together, in world units, as between the cards of a rank in a batch. */
const GAP = 40;

/** The type of each image a card shows, by its extension. */
const TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	bmp: 'image/bmp',
	avif: 'image/avif',
	svg: 'image/svg+xml'
};
/** The extension of each type of image a card shows. */
const EXTENSIONS: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

/** Whether a file pasted or dropped is an image a card shows. */
export const isImage = (blob: Blob) => blob.type in EXTENSIONS;

/** An image to add, with the name its file takes. */
type Image = { name: string; blob: Blob };

let urls = new Map<string, Promise<string>>();

/** An object URL showing an attachment, read once while the vault is open. A file found missing is
 * looked for again the next time it is asked for. */
export function imageUrl(path: string) {
	let url = urls.get(path);
	if (!url) {
		const type = TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? '';
		url = readAttachment(path).then((bytes) => URL.createObjectURL(new Blob([bytes], { type })));
		url.catch(() => urls.delete(path));
		urls.set(path, url);
	}
	return url;
}

/** Lets go of the images shown in the vault that closes. */
export function forgetImages() {
	for (const url of urls.values()) url.then(URL.revokeObjectURL, () => {});
	urls = new Map();
}

/** Adds images as cards in a row centered on a world point, as one undo step, each written under
 * the vault's attachments first, and selects them. With snapping on, their corners land on the grid. */
export async function addImages(images: Image[], at: { x: number; y: number }) {
	const sizes = await Promise.all(images.map((i) => sizeOf(i.blob)));
	const place = (v: number) => (snap.on ? toGrid(v) : Math.round(v));
	let x = at.x - (sizes.reduce((sum, s) => sum + s.w, 0) + GAP * (sizes.length - 1)) / 2;
	const boxes = sizes.map((s) => {
		const box = { x: place(x), y: place(at.y - s.h / 2), ...s };
		x += s.w + GAP;
		return box;
	});
	const land = landing(boxes);
	return history.edit(async () => {
		const ids: string[] = [];
		const undo: ItemState[] = [];
		for (const [i, { x, y, w, h }] of boxes.entries()) {
			const path = await writeImage(images[i].name, await images[i].blob.arrayBuffer());
			const placed = await placeFile(path, x, y, w, h);
			ids.push(placed.id);
			undo.push(...placed.undo);
		}
		land(ids);
		return undo;
	});
}

/** The size an image is added at: a world unit for each of its pixels, shrunk to LONGEST on its
 * longest side, and grown to a card's smallest size when smaller. */
async function sizeOf(blob: Blob) {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		// An SVG without a size of its own has none.
		const [w, h] = [img.naturalWidth || NEW_CARD.w, img.naturalHeight || NEW_CARD.h];
		const scale = Math.max(Math.min(1, LONGEST / Math.max(w, h)), MIN.w / w, MIN.h / h);
		return { w: Math.round(w * scale), h: Math.round(h * scale) };
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** The name a pasted image's file takes, which the clipboard does not give: the time it was pasted. */
export function pastedName(blob: Blob) {
	const ext = EXTENSIONS[blob.type] ?? 'png';
	const n = new Date();
	const stamp = [n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()];
	return `Pasted image ${stamp.map((v) => String(v).padStart(2, '0')).join('')}.${ext}`;
}

/** Takes image files dragged in from the system and dropped on the canvas, `el`: they land as image
 * cards where they are dropped. Until the returned function is called. */
export function listenForDrops(el: HTMLElement) {
	const drop = (e: DragEvent) => {
		const files = [...(e.dataTransfer?.files ?? [])].filter(isImage);
		if (!files.length) return;
		const p = pointIn(el, e);
		void addImages(files.map((blob) => ({ name: blob.name, blob })), camera.toWorld(p.x, p.y));
	};
	addEventListener('drop', drop);
	return () => removeEventListener('drop', drop);
}
