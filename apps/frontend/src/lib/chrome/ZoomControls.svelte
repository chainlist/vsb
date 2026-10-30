<script lang="ts">
	import { page } from '$app/state';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Scan from '@lucide/svelte/icons/scan';
	import { fitAll } from '#lib/canvas/actions.js';
	import { camera } from '#lib/canvas/camera.svelte.js';
	import { CANVAS_KEYS } from '#lib/canvas/shortcuts.js';
	import { keyName } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import Tip from './Tip.svelte';

	// Left of the panel's sheet while one is open, which would cover them.
	const beside = $derived(PANELS.some((p) => p.route === page.route.id));
</script>

<!-- In the bottom-right corner. Minus and plus zoom around the middle of the canvas. -->
<div class="zoom index-card chrome" class:beside role="group" aria-label="Zoom">
	<Tip label="Zoom out" side="top">
		{#snippet children(props)}
			<button {...props} onclick={() => camera.step(-1)}><Minus /></button>
		{/snippet}
	</Tip>
	<span class="percent">{Math.round(camera.zoom * 100)}%</span>
	<Tip label="Zoom in" side="top">
		{#snippet children(props)}
			<button {...props} onclick={() => camera.step(1)}><Plus /></button>
		{/snippet}
	</Tip>
	<span class="sep"></span>
	<Tip label="Fit to content" keys={keyName(CANVAS_KEYS.fit.keys[0])} side="top">
		{#snippet children(props)}
			<button {...props} onclick={fitAll}><Scan /></button>
		{/snippet}
	</Tip>
</div>

<style>
	.zoom {
		position: fixed;
		right: var(--inset);
		bottom: var(--inset);
		display: flex;
		align-items: center;
		gap: 2px;
		height: 44px;
		padding: 0 6px;
	}

	.beside {
		right: calc(var(--inset) + var(--panel));
	}

	button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	button:hover {
		background: var(--paper);
		color: var(--ink);
	}

	/* Wide enough for 400%, so the buttons never shift as the zoom changes. */
	.percent {
		width: 48px;
		color: var(--ink);
		font: 500 13px var(--font-ui);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.sep {
		width: 1px;
		height: 20px;
		margin: 0 4px;
		background: var(--border);
	}
</style>
