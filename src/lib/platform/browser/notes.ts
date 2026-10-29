// Notes: their text, and the path each would have as a file, named after its title as on the
// desktop. Nothing changes them from outside the app, so a save always lands: the desktop's check
// against outside changes and its conflict copies have nothing to do here.
import { apply, read, state, type Edit } from './apply.ts';
import { request } from './idb.ts';
import { tray, type CardRecord, type NoteRecord } from './records.ts';
import { showing } from './settle.ts';
import { excerpt, fileStem, stemFits, title, wordSet } from './text.ts';
import { newId } from './ulid.ts';
import { reindex } from './words.ts';

const notes = (e: Edit) => e.tx.objectStore('notes');

async function note(e: Edit, id: string) {
	const found = (await request(notes(e).get(id))) as NoteRecord | undefined;
	if (!found) throw new Error('note not found');
	return found;
}

/** A note as kept, with its title, excerpt and words for search drawn from its body. */
function record(id: string, path: string, body: string, placed: number): NoteRecord {
	const t = title(body);
	return tray({ id, path, pk: path.toLowerCase(), body, title: t, excerpt: excerpt(body), mtime: Date.now(), placed, tw: wordSet(t), words: wordSet(body) });
}

/** Keeps a note as it is now, or deletes it for none, with its words in the word index, and redraws
 * the cards showing it: a note gone leaves them unresolved. */
async function keep(e: Edit, id: string, was: NoteRecord | undefined, now: NoteRecord | undefined) {
	if (now) notes(e).put(now);
	else notes(e).delete(id);
	await reindex(e.tx, id, was, now);
	const cards = e.tx.objectStore('cards');
	for (const card of (await request(cards.index('note').getAll(id))) as CardRecord[]) cards.put({ ...card, ...showing(now) });
}

/** `<dir>/<stem>.md`, or `<stem> 2.md`, `<stem> 3.md`... : the first name no other note uses,
 * ignoring case. The note `self` may take a name that differs from its own only by case. */
async function freePath(e: Edit, dir: string, stem: string, self: string | null) {
	for (let n = 1; ; n++) {
		const path = n === 1 ? `${dir}/${stem}.md` : `${dir}/${stem} ${n}.md`;
		const taken = (await request(notes(e).index('pk').get(path.toLowerCase()))) as NoteRecord | undefined;
		if (!taken || taken.id === self) return path;
	}
}

export const readNote = async (e: Edit, id: string) => (await note(e, id)).body;

/** Writes a new note named after its title and returns its ID. */
export async function newNote(e: Edit, body: string) {
	const id = newId();
	await keep(e, id, undefined, record(id, await freePath(e, 'notes', fileStem(title(body)), null), body, 0));
	return id;
}

/** First save with content: writes the note, then points the card at it. */
export async function createNoteForCard(e: Edit, cardId: string, body: string) {
	const card = await read(e, 'card', cardId);
	if (card.note !== null) throw new Error('this card already has a note');
	const id = await newNote(e, body);
	card.note = id;
	await apply(e, [state('card', cardId, card)]);
	return id;
}

export async function saveNote(e: Edit, id: string, body: string) {
	const n = await note(e, id);
	await keep(e, id, n, record(id, n.path, body, n.placed));
	return true;
}

/** Drops a note created during this edit session and left empty: the card goes back to empty
 * first, then the note goes. A note with content is never dropped here. */
export async function discardNote(e: Edit, cardId: string, id: string) {
	const n = await note(e, id);
	if (n.body.trim()) throw new Error('the note is not empty');
	const card = await read(e, 'card', cardId);
	if (card.note === id) {
		card.note = null;
		await apply(e, [state('card', cardId, card)]);
	}
	await keep(e, id, n, undefined);
}

/** Renames the note after its title, if the title changed. */
export async function renameNote(e: Edit, id: string) {
	const n = await note(e, id);
	const stem = fileStem(title(n.body));
	const slash = n.path.lastIndexOf('/');
	if (stemFits(n.path.slice(slash + 1).replace(/\.md$/, ''), stem)) return;
	const path = await freePath(e, n.path.slice(0, slash), stem, id);
	notes(e).put({ ...n, path, pk: path.toLowerCase() });
}

/** The ID of the note at `path`, for placing it. Every note made in the browser has one. */
export async function noteAt(e: Edit, path: string) {
	const found = (await request(notes(e).index('pk').get(path.toLowerCase()))) as NoteRecord | undefined;
	if (!found || found.path !== path) throw new Error('note not found');
	return found.id;
}
