// The word index search reads, the browser's stand-in for FTS5: for each word, the notes holding it
// and those whose title does. Each word's notes are split in sixteen shards by note, so a save
// rewrites small records, and a word typed reads a few records rather than thousands of index keys.
import { request } from './idb.ts';

/** One word's notes in one shard. Title words are words of the text too. */
export type Posting = { word: string; shard: number; notes: string[]; titled: string[] };

/** A note's words, folded, and its title's. */
export type Words = { words: string[]; tw: string[] };

/** A note's shard, from the last, random character of its ID. */
const shard = (id: string) => id.charCodeAt(id.length - 1) % 16;

/** Brings the index from a note's words `was` (none for a new note) to `now` (none once deleted). */
export async function reindex(tx: IDBTransaction, id: string, was: Words | undefined, now: Words | undefined) {
	const store = tx.objectStore('words');
	const s = shard(id);
	const [before, after] = [was, now].map((w) => ({ words: new Set(w?.words), tw: new Set(w?.tw) }));
	const changed = [...new Set([...before.words, ...after.words])].filter(
		(word) => before.words.has(word) !== after.words.has(word) || before.tw.has(word) !== after.tw.has(word)
	);
	const found = await Promise.all(changed.map((word) => request(store.get([word, s])) as Promise<Posting | undefined>));
	changed.forEach((word, i) => {
		const p = found[i] ?? { word, shard: s, notes: [], titled: [] };
		p.notes = p.notes.filter((n) => n !== id);
		p.titled = p.titled.filter((n) => n !== id);
		if (after.words.has(word)) p.notes.push(id);
		if (after.tw.has(word)) p.titled.push(id);
		if (p.notes.length) store.put(p);
		else store.delete([word, s]);
	});
}

/** The postings of every word from `lo` to `hi`. */
export const postings = (tx: IDBTransaction, lo: string, hi: string) =>
	request(tx.objectStore('words').getAll(IDBKeyRange.bound([lo, -Infinity], [hi, Infinity]))) as Promise<Posting[]>;
