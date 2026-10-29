<script lang="ts">
	import type { DrawingView } from '#lib/api.js';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import { isMod } from '#lib/keys.js';
	import { startMove } from './gestures.js';
	import { outline } from './ink.js';
	import { ink } from './pen.svelte.js';
	import { selection } from './selection.svelte.js';

	let { drawing }: { drawing: DrawingView } = $props();

	const selected = $derived(selection.has(drawing.id));
	const erased = $derived(ink.erased[drawing.id] ?? []);

	// Mod+drag draws an edge from a card under the ink, or a zone: the canvas handles it.
	function press(e: PointerEvent) {
		if (!isMod(e)) startMove(e, drawing);
	}
</script>

<!-- Above cards and edges. Presses go through it, to what lies beneath, except on its ink, which
     selects and moves it as a card is. Selected, it shows its box. -->
<div
	class="drawing"
	class:selected
	class:tinted={drawing.color !== null}
	style:left="{drawing.x}px"
	style:top="{drawing.y}px"
	style:width="{drawing.w}px"
	style:height="{drawing.h}px"
	style:--tint={drawing.color}
>
	<!-- A drawing that fails to show fails alone, in its place. -->
	<ErrorBoundary what="This drawing">
		<svg aria-hidden="true">
			{#each drawing.strokes as stroke, i (i)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<path d={outline(stroke)} class:erased={erased.includes(i)} onpointerdown={press} />
			{/each}
		</svg>
	</ErrorBoundary>
</div>

<style>
	.drawing {
		position: absolute;
		pointer-events: none;
	}

	.drawing > :global(.failed) {
		pointer-events: auto;
	}

	.selected {
		outline: calc(1.5 * var(--px)) solid var(--pen);
		outline-offset: calc(4 * var(--px));
	}

	svg {
		position: absolute;
		overflow: visible;
		width: 1px;
		height: 1px;
	}

	/* The ink, in the theme's own, or darker than the highlighter it is colored with, so it reads on the
	   paper: mixed toward the ink, as a color's swatch is rimmed. A few pixels around it take presses. */
	path {
		fill: var(--ink);
		stroke: transparent;
		stroke-width: calc(8px * var(--scale));
		pointer-events: all;
	}

	.tinted path {
		fill: color-mix(in srgb, var(--tint) 70%, var(--ink));
	}

	/* Passed over by the eraser: it goes on release. */
	.erased {
		opacity: 0.25;
	}
</style>
