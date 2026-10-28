// A vault's settings, as the desktop's `vault.json` holds them (each left out at its default), and
// this device's state for it, as the desktop's `ui_state`.
import type { Edit } from './apply.ts';
import type { VaultFile } from './db.ts';
import { request } from './idb.ts';

const meta = (e: Edit) => e.tx.objectStore('meta');
const settings = async (e: Edit) => (await request(meta(e).get('vault'))) as VaultFile;

/** Changes the vault's settings and keeps them. */
async function change(e: Edit, edit: (v: VaultFile) => void) {
	const v = await settings(e);
	edit(v);
	meta(e).put(v, 'vault');
}

export const theme = async (e: Edit) => (await settings(e)).theme ?? null;

export const setTheme = (e: Edit, theme: string | null) =>
	change(e, (v) => {
		if (theme === null) delete v.theme;
		else v.theme = theme;
	});

/** Snapping to the grid: on unless the vault says otherwise. */
export const snap = async (e: Edit) => (await settings(e)).snap ?? true;

export const setSnap = (e: Edit, snap: boolean) =>
	change(e, (v) => {
		if (snap) delete v.snap;
		else v.snap = false;
	});

export const uiState = async (e: Edit, key: string) => ((await request(e.tx.objectStore('ui').get(key))) as string | undefined) ?? null;

export const setUiState = async (e: Edit, key: string, value: string) => {
	e.tx.objectStore('ui').put(value, key);
};
