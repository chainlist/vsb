<script lang="ts">
	import type { Frame } from '#lib/api.js';
	import type { Sketch } from './batchEdit.js';
	import { route } from './route.js';
	import EdgeLine from './EdgeLine.svelte';

	// A small map of what a batch does, laid out as it will land: the cards by their titles only, and
	// the edges with their arrowheads and lines. Editing cards of the canvas, the new cards and the
	// new or restyled edges stand out in the accent color, and the edges to be removed in red.
	let { sketch }: { sketch: Sketch } = $props();

	/** Room around the map's contents, in pixels. */
	const PAD = 16;
	/** The most a card is drawn at, of its size on the canvas, so a lone card does not fill the map. */
	const MAX_SCALE = 0.5;

	let width = $state(0);
	let height = $state(0);

	// In the map's own pixels, edges included, so arrowheads and dashes keep their size on screen.
	const cards = $derived.by((): Frame[] => {
		const boxes = sketch.cards;
		if (!boxes.length) return [];
		const [minX, minY] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
		const [maxX, maxY] = [Math.max(...boxes.map((b) => b.x + b.w)), Math.max(...boxes.map((b) => b.y + b.h))];
		const scale = Math.min(MAX_SCALE, (width - 2 * PAD) / (maxX - minX), (height - 2 * PAD) / (maxY - minY));
		const [left, top] = [(width - (maxX - minX) * scale) / 2, (height - (maxY - minY) * scale) / 2];
		return boxes.map((b) => ({ x: left + (b.x - minX) * scale, y: top + (b.y - minY) * scale, w: b.w * scale, h: b.h * scale }));
	});
	const edges = $derived(
		cards.length ? sketch.edges.map((e) => ({ ...e, route: route(cards[e.from], cards[e.to], { shape: 'curved', arrow: e.arrow }) })) : []
	);
</script>

<div class="map graph-paper" role="img" aria-label="Preview of the cards and edges" bind:clientWidth={width} bind:clientHeight={height}>
	{#each edges as edge, i (i)}
		<div class:removed={edge.mark === 'removed'}>
			<EdgeLine route={edge.route} stroke={edge.stroke} selected={edge.mark === 'new' || edge.mark === 'changed'} />
		</div>
	{/each}
	{#each cards as card, i (i)}
		<div
			class="card index-card"
			class:new={sketch.cards[i].mark === 'new'}
			style:left="{card.x}px"
			style:top="{card.y}px"
			style:width="{card.w}px"
			style:height="{card.h}px"
		>
			<span>{sketch.cards[i].text}</span>
		</div>
	{/each}
	{#if !cards.length}
		<p>The cards show here as you type.</p>
	{/if}
</div>

<style>
	/* Shrinks, down to half, where there is no room for it. */
	.map {
		position: relative;
		height: 240px;
		min-height: 120px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
	}

	.card {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px 6px;
		border-radius: var(--radius-mark);
		color: var(--ink);
		font: 600 11px/1.25 var(--font-note);
		text-align: center;
	}

	.new {
		box-shadow: 0 0 0 1.5px var(--pen), var(--lift);
		color: var(--pen);
	}

	.removed :global(.edge-line) {
		color: var(--danger);
		opacity: 0.6;
	}

	/* Two lines at most, cut with an ellipsis. */
	span {
		display: -webkit-box;
		overflow: hidden;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	p {
		margin: 0;
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--ink-soft);
		font-size: 13px;
	}
</style>
