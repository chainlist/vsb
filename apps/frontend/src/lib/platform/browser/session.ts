// The open vault, and how commands reach it: one at a time, as the desktop's lock over its session
// runs them, each in one transaction. Errors come back as plain strings, as Tauri's do.
import type { Edit } from './apply.ts';
import { STORES } from './db.ts';
import { finished, request } from './idb.ts';
import { Layout } from './layout.ts';
import type { ZoneRecord } from './records.ts';

type Open = { id: string; db: IDBDatabase; layout: Layout; release: () => void };

let open: Open | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Runs a command once those before it are done. */
export function command<T>(run: () => Promise<T>): Promise<T> {
	const result = queue.then(run);
	queue = result.catch(() => {});
	return result.catch((e) => {
		throw e instanceof Error ? e.message : String(e);
	});
}

export const opened = () => open;

/** Makes `next` the open vault, closing the one before. */
export function setOpen(next: Open | null) {
	if (open) {
		open.db.close();
		open.release();
	}
	open = next;
}

function vault() {
	if (!open) throw new Error('no vault is open');
	return open;
}

/** The open vault's zones, for what needs nothing else. */
export const zones = () => vault().layout;

/** The zones of a vault, read into memory. */
export async function loadLayout(db: IDBDatabase) {
	const tx = db.transaction('zones', 'readonly');
	return new Layout((await request(tx.objectStore('zones').getAll())) as ZoneRecord[]);
}

/** Reads, in one transaction over every store. */
export function read<T>(run: (e: Edit) => Promise<T> | T) {
	const v = vault();
	return Promise.resolve(run({ tx: v.db.transaction(STORES, 'readonly'), layout: v.layout }));
}

/** Edits, in one transaction: all of it lands, or none of it, and the zones in memory follow. */
export async function write<T>(run: (e: Edit) => Promise<T>) {
	const v = vault();
	const tx = v.db.transaction(STORES, 'readwrite');
	const done = finished(tx);
	try {
		const out = await run({ tx, layout: v.layout });
		await done;
		return out;
	} catch (e) {
		try {
			tx.abort();
		} catch {
			// Already ended: a failed request aborts it.
		}
		await done.catch(() => {});
		v.layout = await loadLayout(v.db);
		throw e;
	}
}
