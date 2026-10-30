<script lang="ts">
	import Canvas from '#lib/canvas/Canvas.svelte';
	import { snap } from '#lib/canvas/grid.svelte.js';
	import { newEdges } from '#lib/canvas/newEdges.svelte.js';
	import { ink } from '#lib/canvas/pen.svelte.js';
	import { wheel } from '#lib/canvas/wheel.svelte.js';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import PenBar from '#lib/chrome/PenBar.svelte';
	import Rail from '#lib/chrome/Rail.svelte';
	import VaultCard from '#lib/chrome/VaultCard.svelte';
	import ZoomControls from '#lib/chrome/ZoomControls.svelte';
	import { zoneList } from '#lib/panel/zoneList.svelte.js';
	import ZoneList from '#lib/panel/ZoneList.svelte';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The vault's own theme and paper while it is open, the defaults again once it closes.
	$effect(() => {
		theme.use(data.theme, data.paper);
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
		ink.pen = data.pen;
	});
	$effect(() => {
		zoneList.open = data.zoneList;
	});
</script>

<!-- The canvas stays mounted while panels open and close as child routes. Its chrome sits in the
     corners: the vault top left, the tools down the left edge, the zoom bottom right. -->
{#key data.vault.id}
	<ErrorBoundary what="The canvas" center>
		<Canvas contents={data.contents} />
	</ErrorBoundary>
{/key}

<VaultCard vault={data.vault} />
<Rail vaultId={data.vault.id} />
<ZoomControls />
{#if ink.on}
	<PenBar />
{/if}

{#if zoneList.open}
	<ZoneList />
{/if}

{@render children()}
