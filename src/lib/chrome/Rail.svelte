<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { batchDialog } from '#lib/canvas/batchDialog.svelte.js';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import { zoneList } from '#lib/panel/zoneList.svelte.js';
	import Tip from './Tip.svelte';

	let { vaultId }: { vaultId: string } = $props();

	type Panel = (typeof PANELS)[number];

	const ICON = 20;
	const keys = (key: string) => `${MOD_NAME}+${key.toUpperCase()}`;

	/** Where a panel's button and key lead: the panel, or back to the canvas when it is open. */
	function toggle(panel: Panel) {
		return page.route.id === panel.route ? resolve('/vault/[vaultId]', { vaultId }) : resolve(panel.route, { vaultId });
	}

	// Mod+B, which opens the builder, is the canvas's own key.
	$effect(() =>
		bindKeys([
			...PANELS.map((p) => ({ keys: [`Mod+${p.key}`], inText: true, run: () => goto(toggle(p)) })),
			{ keys: ['Mod+l'], inText: true, run: () => zoneList.toggle() }
		])
	);
</script>

<!-- Down the left edge: the zone list, the panels and the builder, by their icons alone. -->
<nav class="rail index-card chrome" aria-label="Tools" data-beside-zones>
	<!-- Not a route like the panels: the zone list stays open beside them. -->
	<Tip label="Zones" keys={keys('l')}>
		{#snippet children(props)}
			<button {...props} aria-pressed={zoneList.open} onclick={() => zoneList.toggle()}>
				<SquareDashed size={ICON} />
			</button>
		{/snippet}
	</Tip>
	{#each PANELS as panel (panel.route)}
		<Tip label={panel.name} keys={keys(panel.key)}>
			{#snippet children(props)}
				<!-- A link, without the button type the tooltip's trigger gives. -->
				<a
					{...props}
					type={undefined}
					href={toggle(panel)}
					aria-current={page.route.id === panel.route ? 'page' : undefined}
				>
					<panel.icon size={ICON} />
				</a>
			{/snippet}
		</Tip>
	{/each}
	<hr />
	<Tip label="Builder" keys={keys('b')}>
		{#snippet children(props)}
			<button {...props} onclick={() => batchDialog.open()}>
				<Workflow size={ICON} />
			</button>
		{/snippet}
	</Tip>
</nav>

<style>
	/* Down the left edge, under the vault card. */
	.rail {
		position: fixed;
		top: var(--under-vault);
		left: var(--inset);
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: var(--rail);
		padding: 6px;
	}

	a,
	button {
		display: grid;
		place-items: center;
		height: 40px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	a:hover,
	button:hover {
		background: var(--paper);
		color: var(--ink);
	}

	[aria-current='page'],
	[aria-current='page']:hover,
	[aria-pressed='true'],
	[aria-pressed='true']:hover {
		background: color-mix(in srgb, var(--pen) 12%, transparent);
		color: var(--pen);
	}

	hr {
		width: 24px;
		height: 1px;
		margin: 4px auto;
		border: none;
		background: var(--border);
	}
</style>
