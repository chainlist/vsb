// The lists beside the canvas, a page at a time: the Unplaced tray, search over notes and zone names,
// and the zone list. Search finds every word typed as the start of a word, case and accents ignored,
// through the notes' word index, as the desktop's FTS5 tables do.
import type { Entry, ZoneRow } from '#lib/api.js';
import type { Edit } from './apply.ts';
import { request } from './idb.ts';
import type { Layout } from './layout.ts';
import type { NoteRecord } from './records.ts';
import { all } from './settle.ts';
import { holds, wanted, type Wanted } from './text.ts';
import { postings } from './words.ts';

const notes = (e: Edit) => e.tx.objectStore('notes');

const noteEntry = (n: NoteRecord, card: string | null): Entry => ({ kind: 'note', path: n.path, title: n.title, excerpt: n.excerpt, card });

/** Notes with no card, most recently changed first. */
export async function unplaced(e: Edit, offset: number, limit: number): Promise<Entry[]> {
	const ids = (await request(notes(e).index('loose').getAllKeys(null, offset + limit))).slice(offset);
	return (await all<NoteRecord>(notes(e), ids)).map((n) => noteEntry(n!, null));
}

/** Zones whose name holds every word typed, then notes whose text does, best matches first. */
export async function search(e: Edit, text: string, offset: number, limit: number): Promise<Entry[]> {
	const words = wanted(text);
	if (!words.length) return [];
	const zones = matching(e.layout, words).map(([id]) => id);
	const page = [...zones.map((id) => ({ zone: id })), ...(await rankedNotes(e, words)).map((id) => ({ note: id }))].slice(offset, offset + limit);
	const ids = page.flatMap((p) => ('note' in p ? [p.note] : []));
	const [found, cards] = await Promise.all([
		all<NoteRecord>(notes(e), ids),
		Promise.all(ids.map((id) => request(e.tx.objectStore('cards').index('note').getKey(id)) as Promise<string | undefined>))
	]);
	const byId = new Map(ids.map((id, i) => [id, noteEntry(found[i]!, cards[i] ?? null)]));
	return page.map((p) => ('zone' in p ? { kind: 'zone', id: p.zone, name: e.layout.zones.get(p.zone)!.file.name } : byId.get(p.note)!));
}

/** How many of a text's words start as a word typed: what ranks one match above another. */
const hits = (words: string[], w: Wanted) => words.filter((t) => t.startsWith(w.start)).length;

/** The zones whose name holds every word typed, best first, with their scores. */
function matching(layout: Layout, words: Wanted[]): [string, number][] {
	const found: [string, number][] = [];
	for (const [id, names] of layout.words) {
		if (words.every((w) => holds(names, w))) found.push([id, words.reduce((s, w) => s + hits(names, w), 0)]);
	}
	return found.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** The notes holding every word typed, best first: a word in the title counts thrice, each word of
 * the text that starts as typed once. Read from the word index alone, never the notes. */
async function rankedNotes(e: Edit, words: Wanted[]) {
	const each = await Promise.all(
		words.map(async (w) => {
			const [starting, ...whole] = await Promise.all([postings(e.tx, w.start, `${w.start}￿`), ...w.whole.map((t) => postings(e.tx, t, t))]);
			// Each posting is one word starting as typed.
			const score = new Map<string, number>();
			for (const p of starting) {
				for (const id of p.notes) score.set(id, (score.get(id) ?? 0) + 1);
				for (const id of p.titled) score.set(id, score.get(id)! + 2);
			}
			for (const has of whole.map((ps) => new Set(ps.flatMap((p) => p.notes)))) for (const id of score.keys()) if (!has.has(id)) score.delete(id);
			return score;
		})
	);
	const [first, ...rest] = each;
	const total = [...first].filter(([id]) => rest.every((s) => s.has(id))).map(([id, s]): [string, number] => [id, rest.reduce((t, r) => t + r.get(id)!, s)]);
	return total.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

/** A page of zone rows, by name ignoring case as SQLite's NOCASE does (ASCII letters only), then ID. */
function rows(layout: Layout, ids: string[], offset: number, limit: number): ZoneRow[] {
	const fold = (id: string) => layout.zones.get(id)!.file.name.replace(/[A-Z]/g, (c) => c.toLowerCase());
	const sorted = ids.map((id) => [fold(id), id]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : 1));
	return sorted.slice(offset, offset + limit).map(([, id]) => {
		const { file } = layout.zones.get(id)!;
		const at = layout.places.get(id)!;
		const cards = layout.subtree(id).reduce((n, z) => n + Object.keys(layout.zones.get(z)?.held ?? {}).length, 0);
		return { id, name: file.name, color: file.color ?? null, inner: !!layout.kids.get(id)?.length, cards, x: at.x, y: at.y, w: file.w, h: file.h };
	});
}

/** The zones directly inside `parent`, or on the canvas for null. */
export function zoneRows(layout: Layout, parent: string | null, offset: number, limit: number) {
	const ids = [...layout.places].filter(([id, at]) => (parent === null ? at.depth === 0 : layout.zones.get(id)!.file.parent === parent));
	return rows(layout, ids.map(([id]) => id), offset, limit);
}

/** The zones at any depth whose name holds every word typed. Nothing for nothing typed. */
export function zoneMatches(layout: Layout, text: string, offset: number, limit: number) {
	const words = wanted(text);
	const ids = words.length ? matching(layout, words).map(([id]) => id).filter((id) => layout.places.has(id)) : [];
	return rows(layout, ids, offset, limit);
}
