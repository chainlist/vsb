// The panels beside the canvas, each a child route of the vault sharing one shell, the (panel)
// layout. The rail opens them, and so does Mod with their key.
import Inbox from '@lucide/svelte/icons/inbox';
import Search from '@lucide/svelte/icons/search';
import type { KeyHelp } from '#lib/keys.js';

/** The keys that open and close what sits over and beside the canvas, also while typing, as
 * Settings list them. */
export const PANEL_KEYS = {
	zones: { keys: ['Mod+l'], label: 'Open or close the zone list, ready to find a zone' },
	unplaced: { keys: ['Mod+u'], label: 'Open or close the Unplaced tray' },
	search: { keys: ['Mod+f'], label: 'Open or close search' },
	close: { keys: ['Escape'], label: 'Close the tray or search, while the keyboard is in it' },
	settings: { keys: ['Mod+,'], label: 'Open or close settings' }
} satisfies Record<string, KeyHelp>;

export const PANELS = [
	{ route: '/vault/[vaultId]/(panel)/unplaced', name: 'Unplaced', icon: Inbox, key: PANEL_KEYS.unplaced },
	{ route: '/vault/[vaultId]/(panel)/search', name: 'Search', icon: Search, key: PANEL_KEYS.search }
] as const;
