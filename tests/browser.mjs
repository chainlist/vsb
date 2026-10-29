// The browser backend under Node, run straight from its TypeScript: IndexedDB in memory
// (fake-indexeddb), a localStorage in memory, and a fresh vault per test, reached through the same
// commands the app calls. Items are written with `applyStates`, as the desktop's tests write files.
import 'fake-indexeddb/auto';
import * as api from '../src/lib/platform/browser/index.ts';
import { request } from '../src/lib/platform/browser/idb.ts';
import { opened } from '../src/lib/platform/browser/session.ts';
import { createVault } from '../src/lib/platform/browser/vaults.ts';

const kept = new Map();
globalThis.localStorage ??= {
	getItem: (k) => kept.get(k) ?? null,
	setItem: (k, v) => kept.set(k, String(v)),
	removeItem: (k) => kept.delete(k)
};

export { api, createVault };

export const WORLD = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };

let made = 0;

/** Opens a new, empty vault. */
export async function fresh() {
	const { id } = await createVault(`Test ${++made}`);
	await api.openVault(id);
	return id;
}

export const zoneAt = (id, parent, x, y, w, h, extra = {}) => ({ kind: 'zone', id, value: { name: id, parent, x, y, w, h, ...extra } });
export const cardAt = (id, zone, x, y, extra = {}) => ({ kind: 'card', id, value: { note: null, zone, x, y, w: 100, h: 50, ...extra } });
export const edgeOf = (id, from, to, extra = {}) => ({ kind: 'edge', id, value: { from, to, ...extra } });

/** Writes items as given, as a test on the desktop writes their files. */
export const put = (...states) => api.applyStates(states);

/** What every zone, card, edge and drawing holds, by kind and ID: the files the desktop would have. */
export async function files() {
	const { db, layout } = opened();
	const tx = db.transaction(['cards', 'edges', 'drawings'], 'readonly');
	const out = {};
	for (const [id, zone] of layout.zones) out[`zones/${id}`] = zone.file;
	for (const kind of ['cards', 'edges', 'drawings']) {
		for (const r of await request(tx.objectStore(kind).getAll())) out[`${kind}/${r.id}`] = r.file;
	}
	return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export const file = async (kind, id) => (await files())[`${kind}s/${id}`];

/** The open vault's settings, as its `vault.json` would hold them. */
export const vaultFile = () => request(opened().db.transaction('meta').objectStore('meta').get('vault'));

/** The keys whose files differ between two snapshots. */
export const changed = (before, after) =>
	[...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();

/** Every zone's and card's absolute position, from the viewport query. */
export async function positions() {
	const v = await api.queryViewport(WORLD, 0, null);
	return Object.fromEntries([...v.zones, ...v.cards].map((i) => [i.id, [i.x, i.y]]));
}

/** A note's ID, made through a card that is then deleted, so the note is unplaced. */
export async function looseNote(text) {
	const card = await api.createCard(-1e5, -1e5, 100, 50);
	const note = await api.createNoteForCard(card, text);
	await api.deleteCards([card]);
	return note;
}

/** A card showing a new note. */
export async function noteCard(text, x = 0, y = 0, w = 200, h = 100) {
	const card = await api.createCard(x, y, w, h);
	return { card, note: await api.createNoteForCard(card, text) };
}

/** Lets the clock move on, so the next write is newer. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
