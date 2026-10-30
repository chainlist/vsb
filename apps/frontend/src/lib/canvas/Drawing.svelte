<script lang="ts">
	import type { DrawingView, PenStroke } from '#lib/api.js';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import { isMod } from '#lib/keys.js';
	import { startMove } from './gestures.js';
	import { outline } from './ink.js';
	import { ink } from './pen.svelte.js';
	import { selection } from './selection.svelte.js';

	let { drawing }: { drawing: DrawingView } = $props();

	const selected = $derived(selection.has(drawing.id));
	/** What an eraser passed over: a whole stroke (null), or the pieces left of a cut one. */
	const erased = $derived(ink.erased[drawing.id] ?? {});

	// Mod+drag draws an edge from a card under the ink, or a zone: the canvas handles it.
	function press(e: PointerEvent) {
		if (!isMod(e)) startMove(e, drawing);
	}
</script>

{#snippet line(points: number[], stroke: PenStroke, faded: boolean)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<path class="inked" class:faded style:--tint={stroke.color} d={outline(points, stroke.width)} onpointerdown={press} />
{/snippet}

<!-- Above cards and edges. Presses go through it, to what lies beneath, except on its ink, which
     selects and moves it as a card is. Selected, it shows its box. -->
<div
	class="drawing"
	class:selected
	style:left="{drawing.x}px"
	style:top="{drawing.y}px"
	style:width="{drawing.w}px"
	style:height="{drawing.h}px"
>
	<!-- A drawing that fails to show fails alone, in its place. -->
	<ErrorBoundary what="This drawing">
		<svg aria-hidden="true">
			{#each drawing.strokes as stroke, i (i)}
				{@const cut = erased[i]}
				{#if Array.isArray(cut)}
					{#each cut as piece, k (k)}
						{@render line(piece, stroke, false)}
					{/each}
				{:else}
					{@render line(stroke.points, stroke, cut === null)}
				{/if}
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

	/* Each stroke in its ink. A few pixels around it take presses. */
	path {
		fill: currentColor;
		stroke: transparent;
		stroke-width: calc(8px * var(--scale));
		pointer-events: all;
	}

	/* Passed over by the stroke eraser: it goes on release. */
	.faded {
		opacity: 0.25;
	}
</style>
