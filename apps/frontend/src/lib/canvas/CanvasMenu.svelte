<script lang="ts">
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import Copy from '@lucide/svelte/icons/copy';
	import CopyPlus from '@lucide/svelte/icons/copy-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import GitBranchPlus from '@lucide/svelte/icons/git-branch-plus';
	import Group from '@lucide/svelte/icons/group';
	import Network from '@lucide/svelte/icons/network';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Scan from '@lucide/svelte/icons/scan';
	import SquareDashedMousePointer from '@lucide/svelte/icons/square-dashed-mouse-pointer';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Workflow from '@lucide/svelte/icons/workflow';
	import type { Component } from 'svelte';
	import { openLink } from '#lib/api.js';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.js';
	import { failure } from '#lib/failure.svelte.js';
	import { keyName, MOD_NAME, type KeyHelp } from '#lib/keys.js';
	import { deleteSelected, editable, editSelected, fitAll, placeCard, zoneSelected } from './actions.js';
	import { arrangeSelected } from './arrange.js';
	import { batchDialog, BUILDER_KEYS } from './batchDialog.svelte.js';
	import { selectAll } from './boxSelect.svelte.js';
	import { copyable, copySelected, duplicateSelected, pasteAt } from './clipboard.js';
	import { selection } from './selection.svelte.js';
	import { CANVAS_KEYS } from './shortcuts.js';
	import { addChildTo } from './tab.svelte.js';

	/** Where the paper was right-clicked, in world units; null for the selection's menu. */
	let { paper }: { paper: { x: number; y: number } | null } = $props();

	type Entry = { label: string; icon: Component; keys?: string; run: () => unknown; danger?: boolean };

	const key = (help: KeyHelp) => keyName(help.keys[0]);

	// In groups split by a line. The selection's menu lists what applies to it, as the selection bar does.
	const groups = $derived.by((): (Entry | false)[][] => {
		if (paper) {
			const at = paper;
			return [
				[
					{ label: 'Add card here', icon: SquarePlus, keys: 'Double-click', run: () => placeCard(at) },
					{ label: 'Paste here', icon: ClipboardPaste, keys: key(CANVAS_KEYS.paste), run: () => pasteAt(at).catch(failure.report) }
				],
				[
					{ label: 'Select all on screen', icon: SquareDashedMousePointer, keys: key(CANVAS_KEYS.all), run: selectAll },
					{ label: 'Fit to content', icon: Scan, keys: key(CANVAS_KEYS.fit), run: fitAll }
				]
			];
		}
		const { cards, zones, edges, drawings } = selection;
		const lone = selection.ids.length === 1;
		const card = lone ? cards[0] : undefined;
		const zone = lone && zones.length === 1;
		const item = lone ? [...cards, ...zones, ...edges][0] : undefined;
		const link = card?.link ?? null;
		return [
			[
				!!item && editable(item) && { label: card ? 'Edit' : zone ? 'Rename' : 'Edit label', icon: Pencil, keys: key(CANVAS_KEYS.edit), run: editSelected },
				!!card && { label: 'Add linked card', icon: GitBranchPlus, keys: key(CANVAS_KEYS.child), run: () => addChildTo(card) },
				link !== null && { label: 'Open link', icon: ExternalLink, keys: `${MOD_NAME}+Click`, run: () => openLink(link) }
			],
			[
				copyable() && { label: 'Copy', icon: Copy, keys: key(CANVAS_KEYS.copy), run: copySelected },
				copyable() && { label: 'Duplicate', icon: CopyPlus, keys: key(CANVAS_KEYS.duplicate), run: duplicateSelected }
			],
			// Arranging and the builder work on the selected cards, or on a lone selected zone's contents.
			[
				cards.length + zones.length + drawings.length > 1 && { label: 'Zone around them', icon: Group, run: zoneSelected },
				(cards.length > 1 || zone) && { label: 'Arrange', icon: Network, run: arrangeSelected },
				(cards.length > 0 || zone) && { label: 'Builder', icon: Workflow, keys: key(BUILDER_KEYS.open), run: () => batchDialog.open() }
			],
			[{ label: 'Delete', icon: Trash2, keys: key(CANVAS_KEYS.remove), run: deleteSelected, danger: true }]
		];
	});
	const shown = $derived(groups.map((group) => group.filter((e) => e !== false)).filter((group) => group.length));
</script>

<!-- Closing it leaves the focus where the chosen action put it: in a card opened for editing, say. -->
<ContextMenu.Content class="chrome min-w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
	{#each shown as group, i (i)}
		{#if i}
			<ContextMenu.Separator />
		{/if}
		{#each group as entry (entry.label)}
			<ContextMenu.Item variant={entry.danger ? 'destructive' : 'default'} onSelect={entry.run}>
				<entry.icon />
				{entry.label}
				{#if entry.keys}
					<kbd class="shortcut">{entry.keys}</kbd>
				{/if}
			</ContextMenu.Item>
		{/each}
	{/each}
</ContextMenu.Content>

<style>
	/* Each item's keys at its far end. */
	.shortcut {
		margin-left: auto;
		padding-left: 24px;
	}
</style>
