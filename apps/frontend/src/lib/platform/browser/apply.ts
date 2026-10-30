// Item states, as on the desktop: every layout edit hands target states to `apply`, which returns
// the states it replaced. Applying those reverses the edit, so undo and redo are the same call. An
// edit is one transaction: all of it lands, or none of it.
import type { ItemState } from '#lib/api.js';
import { request } from './idb.ts';
import type { Layout } from './layout.ts';
import { fileOf, type CardFile, type DrawingFile, type EdgeFile, type File, type Kind, type ZoneFile } from './records.ts';
import { settle, type Next } from './settle.ts';

/** An open vault inside one transaction over every store. */
export type Edit = { tx: IDBTransaction; layout: Layout };

type Files = { zone: ZoneFile; card: CardFile; edge: EdgeFile; drawing: DrawingFile };

/** Brings items to the given states and returns the states they had. An item both written and
 * deleted ends up deleted, as on the desktop, where writes run before deletions. */
export async function apply(e: Edit, states: ItemState[]): Promise<ItemState[]> {
	const before = await Promise.all(states.map(async ({ kind, id }) => ({ kind, id, value: (await held(e, kind, id)) ?? null })));
	const next: Next = { zone: new Map(), card: new Map(), edge: new Map(), drawing: new Map() };
	for (const s of states) if (s.value !== null) (next[s.kind] as Map<string, File>).set(s.id, fileOf(s.kind, s.value));
	for (const s of states) if (s.value === null) next[s.kind].set(s.id, null);
	await settle(e.tx, e.layout, next);
	return before;
}

/** An item's file, or undefined when there is none. */
async function held<K extends Kind>(e: Edit, kind: K, id: string): Promise<Files[K] | undefined> {
	if (kind === 'zone') return e.layout.zones.get(id)?.file as Files[K] | undefined;
	const record = (await request(e.tx.objectStore(`${kind}s`).get(id))) as { file: Files[K] } | undefined;
	return record?.file;
}

/** A copy of an item's file, to edit; an error when it is gone, as reading a missing file is on the desktop. */
export async function read<K extends Kind>(e: Edit, kind: K, id: string): Promise<Files[K]> {
	const file = await held(e, kind, id);
	if (!file) throw new Error(`${kind} not found`);
	return { ...file };
}

export const state = <K extends Kind>(kind: K, id: string, file: Files[K]): ItemState => ({ kind, id, value: file });

export const gone = (kind: Kind, id: string): ItemState => ({ kind, id, value: null });

/** The states that read each item and let `change` edit it, with its position in `ids`. */
export async function edited<K extends Kind>(e: Edit, kind: K, ids: string[], change: (file: Files[K], i: number) => void) {
	const files = await Promise.all(ids.map((id) => read(e, kind, id)));
	return files.map((file, i) => {
		change(file, i);
		return state(kind, ids[i], file);
	});
}

/** Reads each item, lets `change` edit it, and applies the result. */
export const edit = async <K extends Kind>(e: Edit, kind: K, ids: string[], change: (file: Files[K], i: number) => void) =>
	apply(e, await edited(e, kind, ids, change));
