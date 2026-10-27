<script lang="ts">
	import type { Stroke } from '#lib/api.js';
	import type { Route } from './route.js';

	let {
		route,
		stroke = 'solid',
		selected = false,
		dimmed = false,
		draft = false,
		onpointerdown,
		ondblclick
	}: {
		route: Route;
		stroke?: Stroke;
		selected?: boolean;
		/** Faded, while the selected cards' links stand out. */
		dimmed?: boolean;
		/** Dashed, while it is being drawn. */
		draft?: boolean;
		/** Given these, a wide invisible line along the curve takes the pointer. */
		onpointerdown?: (e: PointerEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
	} = $props();
</script>

<!-- A 1px SVG at the world origin, drawing past its edges: at zero size it would draw nothing. -->
<svg class="edge-line" class:selected class:dimmed class:draft data-stroke={stroke}>
	{#if onpointerdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<path class="hit" d={route.path} {onpointerdown} {ondblclick} />
	{/if}
	<path class="line" d={route.path} />
	{#if stroke === 'double'}
		<!-- Paper down the middle of a wide line leaves two, as a label is pasted over the line. -->
		<path class="gap" d={route.path} />
	{/if}
	{#each route.arrows as points (points)}
		<polygon {points} />
	{/each}
</svg>

<style>
	.edge-line {
		position: absolute;
		left: 0;
		top: 0;
		width: 1px;
		height: 1px;
		overflow: visible;
		pointer-events: none;
		color: var(--ink-soft);
	}

	.selected,
	.draft {
		color: var(--pen);
	}

	.dimmed {
		color: var(--edge-dim);
	}

	path {
		fill: none;
	}

	.line {
		stroke: currentColor;
		stroke-width: 1.5;
	}

	.draft .line {
		stroke-dasharray: 6 4;
	}

	[data-stroke='dashed'] .line {
		stroke-dasharray: 8 5;
	}

	/* Dashes of no length, with round ends: dots. */
	[data-stroke='dotted'] .line {
		stroke-width: 2.25;
		stroke-dasharray: 0 5;
		stroke-linecap: round;
	}

	[data-stroke='double'] .line {
		stroke-width: 5;
	}

	.gap {
		stroke: var(--paper);
		stroke-width: 2;
	}

	polygon {
		fill: currentColor;
	}

	.hit {
		stroke: transparent;
		stroke-width: 14;
		pointer-events: stroke;
	}
</style>
