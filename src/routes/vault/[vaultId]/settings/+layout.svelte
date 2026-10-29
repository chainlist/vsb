<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import Palette from '@lucide/svelte/icons/palette';
	import Vault from '@lucide/svelte/icons/vault';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { bindKeys } from '#lib/keys.js';
	import { PANEL_KEYS } from '#lib/panel/panels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** One child route per tab. */
	const tabs = [
		{ route: '/vault/[vaultId]/settings/appearance', name: 'Appearance', icon: Palette },
		{ route: '/vault/[vaultId]/settings/canvas', name: 'Canvas', icon: Grid3x3 },
		{ route: '/vault/[vaultId]/settings/keyboard', name: 'Keyboard', icon: Keyboard },
		{ route: '/vault/[vaultId]/settings/vault', name: 'Vault', icon: Vault }
	] as const;

	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	// A modal over the canvas, which stays mounted underneath: its keys are off meanwhile, but for the
	// one that opened settings, which closes them. Escape, Close and a click on the wash are the
	// dialog's own.
	$effect(() => bindKeys([{ ...PANEL_KEYS.settings, inText: true, run: () => goto(canvas) }], { modal: true }));
</script>

<!-- Open while its route is: closing it goes back to the canvas. -->
<Dialog.Root
	bind:open={
		() => true,
		(open) => {
			if (!open) goto(canvas);
		}
	}
>
	<!-- Obsidian's settings size: 90% of the window wide and 85% tall, at most 1100 by 1000 pixels,
	     whichever tab is open; the tab scrolls. Percentages, not viewport units, which the interface
	     size's zoom would scale. -->
	<Dialog.Content
		class="chrome grid h-[min(85%,1000px)] w-[min(90%,1100px)] max-w-none grid-cols-[180px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 max-sm:grid-cols-[minmax(0,1fr)] max-sm:grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-none"
	>
		<header>
			<Dialog.Title>Settings</Dialog.Title>
		</header>
		<nav aria-label="Settings">
			{#each tabs as tab (tab.route)}
				<a
					class="icon-label"
					href={resolve(tab.route, { vaultId: data.vault.id })}
					aria-current={page.route.id === tab.route ? 'page' : undefined}
				>
					<tab.icon />
					{tab.name}
				</a>
			{/each}
		</nav>
		<section>
			{@render children()}
		</section>
	</Dialog.Content>
</Dialog.Root>

<style>
	header {
		grid-column: 1 / -1;
		padding: 16px 56px 16px 24px;
		border-bottom: 1px solid var(--border);
	}

	header :global([data-slot='dialog-title']) {
		font: 600 22px/1.2 var(--font-note);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 12px;
		border-right: 1px solid var(--border);
	}

	a {
		padding: 6px 12px;
		border-radius: var(--radius-control);
		color: var(--ink-soft);
		font-weight: 500;
		text-decoration: none;
	}

	a:hover {
		background: var(--paper);
		color: var(--ink);
	}

	[aria-current='page'],
	[aria-current='page']:hover {
		background: color-mix(in srgb, var(--pen) 10%, transparent);
		color: var(--pen);
	}

	section {
		overflow-y: auto;
		padding: 20px 28px 28px;
	}

	/* What every tab is made of: groups of settings, each under its heading with a hint under that. */
	section :global(fieldset) {
		min-width: 0;
		margin: 0 0 32px;
		padding: 0;
		border: none;
	}

	section :global(legend) {
		padding: 0;
		font-weight: 600;
		font-size: 16px;
	}

	section :global(.hint) {
		color: var(--ink-soft);
		font-size: 14px;
	}

	section :global(p.hint) {
		margin: 4px 0 18px;
	}

	@media (max-width: 640px) {
		nav {
			flex-direction: row;
			flex-wrap: wrap;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
