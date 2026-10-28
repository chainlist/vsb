// Vaults in this browser, chosen by name. The list of them and this device's settings live in
// localStorage, each vault in its own IndexedDB database. A vault is open in one tab at a time: a
// second tab opening it is told so, rather than both writing past each other.
import type { VaultEntry } from '#lib/api.js';
import { FORMAT, openDb, type VaultFile } from './db.ts';
import { finished } from './idb.ts';
import { loadLayout, opened, setOpen } from './session.ts';
import { newId } from './ulid.ts';

const VAULTS = 'vsb:vaults';
const DEVICE = 'vsb:device';

const stored = <T>(key: string, fallback: T): T => JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;

/** The vaults opened in this browser, most recent first. */
export const listVaults = () => stored<VaultEntry[]>(VAULTS, []);

/** Moves the vault to the top of the list. */
function touch(entry: VaultEntry) {
	localStorage.setItem(VAULTS, JSON.stringify([entry, ...listVaults().filter((v) => v.id !== entry.id)]));
}

/** The vault with this name, ignoring case, made if there is none: as choosing a folder on the
 * desktop opens the vault in it, or makes it one. A browser vault has no path. */
export async function createVault(name: string): Promise<VaultEntry> {
	const known = listVaults().find((v) => v.name.toLowerCase() === name.toLowerCase());
	const entry = known ?? { id: newId(), name, path: '' };
	if (!known) {
		const db = await openDb(entry.id);
		const tx = db.transaction('meta', 'readwrite');
		tx.objectStore('meta').put({ format: FORMAT, id: entry.id } satisfies VaultFile, 'vault');
		await finished(tx);
		db.close();
	}
	touch(entry);
	return entry;
}

/** Opens the vault, in this tab only, and asks the browser to keep its data. */
export async function openVault(id: string) {
	const entry = listVaults().find((v) => v.id === id);
	if (!entry) throw new Error('unknown vault');
	if (opened()?.id !== id) {
		const release = await hold(id);
		if (!release) throw new Error('This vault is open in another tab. Close it there to open it here.');
		try {
			const db = await openDb(id);
			setOpen({ id, db, layout: await loadLayout(db), release });
		} catch (e) {
			release();
			throw e;
		}
		// Without it, the browser may clear the vault when the disk runs low. It may still say no.
		void navigator.storage?.persist?.();
	}
	touch(entry);
	return entry;
}

/** Takes the vault's lock for this tab, held until released; null while another tab holds it. */
function hold(id: string): Promise<(() => void) | null> {
	if (!navigator.locks) return Promise.resolve(() => {});
	return new Promise((resolve) => {
		void navigator.locks.request(`vsb-vault-${id}`, { ifAvailable: true }, (lock) =>
			lock ? new Promise<void>((release) => resolve(release)) : resolve(null)
		);
	});
}

type Device = { interfaceSize?: number };

/** This device's interface size in percent, the same in every vault; null for the default. */
export const interfaceSize = () => stored<Device>(DEVICE, {}).interfaceSize ?? null;

export function setInterfaceSize(size: number | null) {
	const device = stored<Device>(DEVICE, {});
	if (size === null) delete device.interfaceSize;
	else device.interfaceSize = size;
	localStorage.setItem(DEVICE, JSON.stringify(device));
}
