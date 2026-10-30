// A vault's settings, as the desktop's `vault.json` holds them (each left out at its default), and
// this device's state for it, as the desktop's `ui_state`.
import type { EdgeStyle } from '#lib/api.js';
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

/** How the paper is marked, or null for the theme's own. */
export const paper = async (e: Edit) => (await settings(e)).paper ?? null;

export const setPaper = (e: Edit, paper: string | null) =>
	change(e, (v) => {
		if (paper === null) delete v.paper;
		else v.paper = paper;
	});

/** Snapping to the grid: on unless the vault says otherwise. */
export const snap = async (e: Edit) => (await settings(e)).snap ?? true;

export const setSnap = (e: Edit, snap: boolean) =>
	change(e, (v) => {
		if (snap) delete v.snap;
		else v.snap = false;
	});

/** How new edges look until the vault says otherwise. */
const NEW_EDGE: EdgeStyle = { shape: 'curved', arrow: 'to', stroke: 'solid' };

/** The style every edge the app creates gets: the default, but for the parts the vault sets. */
export const edgeStyle = async (e: Edit): Promise<EdgeStyle> => ({ ...NEW_EDGE, ...(await settings(e)).newEdges });

export const setEdgeStyle = (e: Edit, style: EdgeStyle) =>
	change(e, (v) => {
		const set = Object.entries(style).filter(([part, value]) => value !== NEW_EDGE[part as keyof EdgeStyle]);
		if (set.length) v.newEdges = Object.fromEntries(set);
		else delete v.newEdges;
	});

export const uiState = async (e: Edit, key: string) => ((await request(e.tx.objectStore('ui').get(key))) as string | undefined) ?? null;

export const setUiState = async (e: Edit, key: string, value: string) => {
	e.tx.objectStore('ui').put(value, key);
};
