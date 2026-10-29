<script lang="ts">
	import Canvas from '#lib/canvas/Canvas.svelte';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { newEdges } from '#lib/canvas/newEdges.svelte.js';
	import { wheel } from '#lib/canvas/wheel.svelte.js';
	import Rail from '#lib/chrome/Rail.svelte';
	import VaultCard from '#lib/chrome/VaultCard.svelte';
	import ZoomControls from '#lib/chrome/ZoomControls.svelte';
	import { zoneList } from '#lib/panel/zoneList.svelte.js';
	import ZoneList from '#lib/panel/ZoneList.svelte';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The vault's own theme while it is open, the default again once it closes.
	$effect(() => {
		theme.use(data.theme);
		return () => theme.use(null);
	});
	$effect(() => {
		snap.on = data.snap;
	});
	$effect(() => {
		newEdges.style = data.edgeStyle;
	});
	$effect(() => {
		wheel.does = data.wheel;
	});
	$effect(() => {
		zoneList.open = data.zoneList;
	});
</script>

<!-- The canvas stays mounted while panels open and close as child routes. Its chrome sits in the
     corners: the vault top left, the tools down the left edge, the zoom bottom right. -->
{#key data.vault.id}
	<Canvas contents={data.contents} />
{/key}

<VaultCard vault={data.vault} />
<Rail vaultId={data.vault.id} />
<ZoomControls />

{#if zoneList.open}
	<ZoneList />
{/if}

{@render children()}
