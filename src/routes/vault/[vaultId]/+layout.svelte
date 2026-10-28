<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Settings from '@lucide/svelte/icons/settings';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import Canvas from '#lib/canvas/Canvas.svelte';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import { zoneList } from '#lib/panel/zoneList.svelte.js';
	import ZoneList from '#lib/panel/ZoneList.svelte';
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
	$effect(() => {
		zoneList.open = data.zoneList;
	});

	/** Where a panel's button and key lead: the panel, or back to the canvas when it is open. */
	function toggle(panel: Panel) {
		const vaultId = data.vault.id;
		return page.route.id === panel.route ? resolve('/vault/[vaultId]', { vaultId }) : resolve(panel.route, { vaultId });
	}

	$effect(() =>
		bindKeys([
			...PANELS.map((p) => ({ keys: [`Mod+${p.key}`], inText: true, run: () => goto(toggle(p)) })),
			{ keys: ['Mod+l'], inText: true, run: () => zoneList.toggle() }
		])
	);
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
		<!-- Not a route like the panels: the zone list stays open beside them. -->
		<button
			class="icon-label"
			aria-pressed={zoneList.open}
			title="Zones ({MOD_NAME}+L)"
			onclick={() => zoneList.toggle()}
		>
			<SquareDashed />
			Zones
		</button>
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

{#if zoneList.open}
	<ZoneList />
{/if}

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

	.panels a,
	.panels button {
		margin: -3px 0;
		padding: 3px 8px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.panels a:hover,
	.panels button:hover {
		background: var(--paper);
		color: var(--ink);
	}

	.panels [aria-current='page'],
	.panels [aria-current='page']:hover,
	.panels [aria-pressed='true'],
	.panels [aria-pressed='true']:hover {
		background: color-mix(in srgb, var(--pen) 10%, transparent);
		color: var(--pen);
	}
</style>
