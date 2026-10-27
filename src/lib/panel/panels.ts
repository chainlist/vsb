// The panels beside the canvas, each a child route of the vault sharing one shell, the (panel)
// layout. The top bar opens them, and so does Mod with their key.
import Inbox from '@lucide/svelte/icons/inbox';
import Search from '@lucide/svelte/icons/search';

export const PANELS = [
	{ route: '/vault/[vaultId]/(panel)/unplaced', name: 'Unplaced', icon: Inbox, key: 'u' },
	{ route: '/vault/[vaultId]/(panel)/search', name: 'Search', icon: Search, key: 'f' }
] as const;
