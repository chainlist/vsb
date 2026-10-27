<script lang="ts">
	import type { Frame } from '#lib/api.js';
	import { layOut, type Direction, type Plan } from './batch.js';
	import { route } from './route.js';
	import EdgeLine from './EdgeLine.svelte';

	// A small map of what a batch creates, laid out as it will land: the cards by their titles only,
	// and the edges with their arrowheads and lines.
	let { plan, direction }: { plan: Plan; direction: Direction } = $props();

	/** Room around the map's contents, in pixels. */
	const PAD = 16;
	/** The most a card is drawn at, of its size on the canvas, so a lone card does not fill the map. */
	const MAX_SCALE = 0.5;

	let width = $state(0);
	let height = $state(0);

	// In the map's own pixels, edges included, so arrowheads and dashes keep their size on screen.
	const cards = $derived.by((): Frame[] => {
		const boxes = layOut(plan, { x: 0, y: 0 }, direction);
		if (!boxes.length) return [];
		const [minX, minY] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
		const [maxX, maxY] = [Math.max(...boxes.map((b) => b.x + b.w)), Math.max(...boxes.map((b) => b.y + b.h))];
		const scale = Math.min(MAX_SCALE, (width - 2 * PAD) / (maxX - minX), (height - 2 * PAD) / (maxY - minY));
		const [left, top] = [(width - (maxX - minX) * scale) / 2, (height - (maxY - minY) * scale) / 2];
		return boxes.map((b) => ({ x: left + (b.x - minX) * scale, y: top + (b.y - minY) * scale, w: b.w * scale, h: b.h * scale }));
	});
	const edges = $derived(
		cards.length ? plan.edges.map((e) => ({ ...e, route: route(cards[e.from], cards[e.to], { shape: 'curved', arrow: e.arrow }) })) : []
	);
</script>

<div class="map graph-paper" role="img" aria-label="Preview of the cards and edges" bind:clientWidth={width} bind:clientHeight={height}>
	{#each edges as edge, i (i)}
		<EdgeLine route={edge.route} stroke={edge.stroke} />
	{/each}
	{#each cards as card, i (i)}
		<div class="card index-card" style:left="{card.x}px" style:top="{card.y}px" style:width="{card.w}px" style:height="{card.h}px">
			<span>{plan.texts[i]}</span>
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
