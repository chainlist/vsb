// Attachments, as on the desktop: files of the vault a card shows in place of a note, under
// `attachments/`, a folder per kind of file. Images for now, in `attachments/images/`. The browser
// keeps each one's bytes by its vault path, as a folder would hold its file.
import type { Edit } from './apply.ts';
import { request } from './idb.ts';
import { fileStem, freeName } from './text.ts';

/** The folder every attachment lives under, in the vault's root. */
const DIR = 'attachments';
/** The extensions of the images a card shows. */
const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];

/** An attachment: its vault path, the path as compared ignoring case, and its bytes. */
type AttachmentRecord = { path: string; pk: string; bytes: ArrayBuffer };

const attachments = (e: Edit) => e.tx.objectStore('attachments');

/** Whether a path is a vault path under `attachments/`: not an absolute one, nor one climbing out with `..`. */
export function isAttachment(path: string) {
	const parts = path.split(/[\\/]/);
	return parts[0] === DIR && !parts.includes('..');
}

/** Refuses a path that is not an attachment of the vault. */
export function check(path: string) {
	if (!isAttachment(path)) throw new Error('not an attachment of the vault');
}

/** Whether an attachment is kept at this path. */
export const hasAttachment = async (e: Edit, path: string) => (await request(attachments(e).getKey(path))) !== undefined;

/** Writes an image under `attachments/images/`, named after `name`, as a note is after its title:
 * characters invalid on Windows left out, a clash numbered, ignoring case. Returns its vault path. */
export async function writeImage(e: Edit, name: string, bytes: ArrayBuffer) {
	const base = name.split(/[\\/]/).pop() ?? '';
	const dot = base.lastIndexOf('.');
	const ext = dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
	if (!IMAGES.includes(ext)) throw new Error('not an image');
	const taken = async (path: string) => (await request(attachments(e).index('pk').getKey(path.toLowerCase()))) !== undefined;
	const path = await freeName(`${DIR}/images`, fileStem(base.slice(0, dot)), ext, taken);
	attachments(e).put({ path, pk: path.toLowerCase(), bytes } satisfies AttachmentRecord);
	return path;
}

/** The bytes of an attachment, by its vault path. */
export async function readAttachment(e: Edit, path: string) {
	check(path);
	const found = (await request(attachments(e).get(path))) as AttachmentRecord | undefined;
	if (!found) throw new Error('file not found');
	return found.bytes;
}
