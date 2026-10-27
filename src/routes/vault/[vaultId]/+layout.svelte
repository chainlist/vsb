<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Settings from '@lucide/svelte/icons/settings';
	import Canvas from '#lib/canvas/Canvas.svelte';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	type Panel = (typeof PANELS)[number];

	// The vault's own theme while it is open, the default again once it closes.
	$effect(() => {
		theme.use(data.theme);
		return () => theme.use(null);
	});
	$effect(() => {
		snap.on = data.snap;
	});

	/** Where a panel's button and key lead: the panel, or back to the canvas when it is open. */
	function toggle(panel: Panel) {
		const vaultId = data.vault.id;
		return page.route.id === panel.route ? resolve('/vault/[vaultId]', { vaultId }) : resolve(panel.route, { vaultId });
	}

	$effect(() => bindKeys(PANELS.map((p) => ({ keys: [`Mod+${p.key}`], inText: true, run: () => goto(toggle(p)) }))));
</script>

<!-- The canvas stays mounted while panels open and close as child routes. -->
{#key data.vault.id}
	<Canvas contents={data.contents} />
{/key}

<nav class="bar index-card">
	<a href={resolve('/')}>Vaults</a>
	<span class="sep">/</span>
	<span>{data.vault.name}</span>
	<span class="panels">
		{#each PANELS as panel (panel.route)}
			<a
				class="icon-label"
				href={toggle(panel)}
				aria-current={page.route.id === panel.route ? 'page' : undefined}
				title="{panel.name} ({MOD_NAME}+{panel.key.toUpperCase()})"
			>
				<panel.icon />
				{panel.name}
			</a>
		{/each}
	</span>
	<a
		class="settings"
		href={resolve('/vault/[vaultId]/settings', { vaultId: data.vault.id })}
		aria-label="Settings"
		title="Settings"
	>
		<Settings />
	</a>
</nav>

{@render children()}

<style>
	.bar {
		position: fixed;
		top: 14px;
		left: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		font-size: 14px;
	}

	a {
		text-decoration: none;
	}

	.sep {
		color: var(--ink-soft);
	}

	.panels,
	.settings {
		display: flex;
		margin-left: 4px;
		padding-left: 12px;
		border-left: 1px solid var(--border);
	}

	.panels {
		gap: 2px;
		padding-left: 8px;
	}

	.panels a {
		margin: -3px 0;
		padding: 3px 8px;
		border-radius: var(--radius-control);
		color: var(--ink-soft);
		font-weight: 500;
	}

	.panels a:hover {
		background: var(--paper);
		color: var(--ink);
	}

	.panels [aria-current='page'],
	.panels [aria-current='page']:hover {
		background: color-mix(in srgb, var(--pen) 10%, transparent);
		color: var(--pen);
	}
</style>
