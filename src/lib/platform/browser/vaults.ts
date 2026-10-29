// Vaults in this browser, chosen by name. The list of them and this device's settings live in
// localStorage, each vault in its own IndexedDB database. A vault is open in one tab at a time: a
// second tab opening it is told so, rather than both writing past each other.
import type { VaultEntry, VaultHome, Wheel } from '#lib/api.js';
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

type Device = { interfaceSize?: number; wheel?: Wheel };

/** Changes this device's settings and keeps them. */
function change(edit: (d: Device) => void) {
	const device = stored<Device>(DEVICE, {});
	edit(device);
	localStorage.setItem(DEVICE, JSON.stringify(device));
}

/** This device's interface size in percent, the same in every vault; null for the default. */
export const interfaceSize = () => stored<Device>(DEVICE, {}).interfaceSize ?? null;

export const setInterfaceSize = (size: number | null) =>
	change((d) => {
		if (size === null) delete d.interfaceSize;
		else d.interfaceSize = size;
	});

/** What the mouse wheel does on this device's canvas: zoom unless it says otherwise. */
export const wheel = () => stored<Device>(DEVICE, {}).wheel ?? 'zoom';

export const setWheel = (wheel: Wheel) =>
	change((d) => {
		if (wheel === 'zoom') delete d.wheel;
		else d.wheel = wheel;
	});

const KEPT_AS_FILES = 'Until a vault can be exported, the desktop app is where notes are kept as files.';

/** Where the open vault lives: in this browser, which may clear it unless it agreed to keep it. */
export async function home(): Promise<VaultHome> {
	if (await navigator.storage?.persisted?.()) {
		return {
			place: 'This browser',
			about: `The browser agreed to keep its data, so it is not cleared to free space. Clearing your browsing data still deletes it. ${KEPT_AS_FILES}`,
			action: null
		};
	}
	return {
		place: 'This browser',
		about: `The browser has not agreed to keep its data: it may clear it when the disk runs low, and Safari after seven days without a visit. Clearing your browsing data deletes it too. ${KEPT_AS_FILES}`,
		action: { label: 'Ask again', run: async () => void (await navigator.storage?.persist?.()) }
	};
}
