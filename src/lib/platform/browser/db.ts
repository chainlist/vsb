// One IndexedDB database per vault: the vault itself (its settings, notes, zones, cards and edges)
// and what the desktop's index derives from it, kept up to date on every write.
import { request } from './idb.ts';

export const STORES = ['meta', 'ui', 'notes', 'zones', 'cards', 'edges', 'clusters', 'bundles'];

/** The vault's settings, as the desktop's `vault.json`: settings at their default are left out. */
export type VaultFile = { format: number; id: string; theme?: string; snap?: boolean };

/** Version of the format written by this build. */
export const FORMAT = 1;

export function openDb(vault: string) {
	const open = indexedDB.open(`vsb-${vault}`, 1);
	open.onupgradeneeded = () => {
		const db = open.result;
		db.createObjectStore('meta');
		// This device's state for the vault, such as which panels are open, as the desktop's `ui_state`.
		db.createObjectStore('ui');
		const notes = db.createObjectStore('notes', { keyPath: 'id' });
		notes.createIndex('pk', 'pk', { unique: true });
		notes.createIndex('loose', 'loose');
		notes.createIndex('tw', 'tw', { multiEntry: true });
		notes.createIndex('words', 'words', { multiEntry: true });
		db.createObjectStore('zones', { keyPath: 'id' });
		const cards = db.createObjectStore('cards', { keyPath: 'id' });
		cards.createIndex('g', 'g');
		cards.createIndex('zk', 'zk');
		cards.createIndex('note', 'file.note');
		cards.createIndex('cl', 'cl', { multiEntry: true });
		const edges = db.createObjectStore('edges', { keyPath: 'id' });
		edges.createIndex('g', 'g');
		edges.createIndex('from', 'file.from');
		edges.createIndex('to', 'file.to');
		edges.createIndex('bk', 'bk', { multiEntry: true });
		db.createObjectStore('clusters', { keyPath: ['cell', 'cx', 'cy'] });
		db.createObjectStore('bundles', { keyPath: ['cell', 'a', 'b'] }).createIndex('g', 'g');
	};
	return request(open);
}
