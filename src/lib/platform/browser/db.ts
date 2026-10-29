// One IndexedDB database per vault: the vault itself (its settings, notes, zones, cards and edges)
// and what the desktop's index derives from it, kept up to date on every write.
import { request } from './idb.ts';
import type { CardRecord, ZoneRecord } from './records.ts';

export const STORES = ['meta', 'ui', 'notes', 'words', 'zones', 'cards', 'edges', 'clusters', 'bundles'];

/** The vault's settings, as the desktop's `vault.json`: settings at their default are left out. */
export type VaultFile = { format: number; id: string; theme?: string; snap?: boolean };

/** Version of the format written by this build. */
export const FORMAT = 1;

export function openDb(vault: string) {
	const open = indexedDB.open(`vsb-${vault}`, 2);
	open.onupgradeneeded = ({ oldVersion }) => {
		if (oldVersion === 0) create(open.result);
		// Version 2: a zone keeps the cards it holds, where version 1 kept how many and their box.
		else if (oldVersion === 1) void holding(open.transaction!);
	};
	return request(open);
}

function create(db: IDBDatabase) {
	db.createObjectStore('meta');
	// This device's state for the vault, such as which panels are open, as the desktop's `ui_state`.
	db.createObjectStore('ui');
	const notes = db.createObjectStore('notes', { keyPath: 'id' });
	notes.createIndex('pk', 'pk', { unique: true });
	notes.createIndex('loose', 'loose');
	db.createObjectStore('words', { keyPath: ['word', 'shard'] });
	db.createObjectStore('zones', { keyPath: 'id' });
	const cards = db.createObjectStore('cards', { keyPath: 'id' });
	cards.createIndex('g', 'g', { multiEntry: true });
	cards.createIndex('zk', 'zk');
	cards.createIndex('note', 'file.note');
	cards.createIndex('cl', 'cl', { multiEntry: true });
	const edges = db.createObjectStore('edges', { keyPath: 'id' });
	edges.createIndex('g', 'g', { multiEntry: true });
	edges.createIndex('from', 'file.from');
	edges.createIndex('to', 'file.to');
	edges.createIndex('bk', 'bk', { multiEntry: true });
	db.createObjectStore('clusters', { keyPath: ['cell', 'cx', 'cy'] });
	db.createObjectStore('bundles', { keyPath: ['cell', 'a', 'b'] });
}

/** Gives each zone of a version 1 vault the cards it holds. */
async function holding(tx: IDBTransaction) {
	const zones = tx.objectStore('zones');
	const [records, cards] = await Promise.all([request(zones.getAll()), request(tx.objectStore('cards').getAll())]);
	for (const { id, file } of records as ZoneRecord[]) {
		const held = (cards as CardRecord[]).filter((c) => c.zk === id).map(({ id, file: f }) => [id, [f.x, f.y, f.w, f.h, f.color ?? null]]);
		zones.put({ id, file, held: Object.fromEntries(held) });
	}
}
