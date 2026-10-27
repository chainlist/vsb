<script lang="ts">
	import type { Route } from './route.js';

	let {
		route,
		selected = false,
		draft = false,
		onpointerdown,
		ondblclick
	}: {
		route: Route;
		selected?: boolean;
		/** Dashed, while it is being drawn. */
		draft?: boolean;
		/** Given these, a wide invisible line along the curve takes the pointer. */
		onpointerdown?: (e: PointerEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
	} = $props();
</script>

<!-- A 1px SVG at the world origin, drawing past its edges: at zero size it would draw nothing. -->
<svg class="edge-line" class:selected class:draft>
	{#if onpointerdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<path class="hit" d={route.path} {onpointerdown} {ondblclick} />
	{/if}
	<path class="line" d={route.path} />
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

	polygon {
		fill: currentColor;
	}

	.hit {
		stroke: transparent;
		stroke-width: 14;
		pointer-events: stroke;
	}
</style>
