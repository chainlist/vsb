<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { camera } from './camera.svelte.js';
	import { insertOnEdge } from './insert.js';
	import { items } from './items.svelte.js';
	import { LABEL_HALF } from './route.js';
	import { selection } from './selection.svelte.js';

	// A + on a lone selected edge inserts a card there. It sits on the line's middle, or just under
	// the label when the edge has one, so the label stays readable; the selection bar is above.
	const edge = $derived(selection.ids.length === 1 && !selection.editing ? selection.edges[0] : undefined);
	const at = $derived.by(() => {
		if (!edge) return null;
		const { mid } = items.routeOf(edge);
		return camera.toScreen(mid.x, mid.y + (edge.label ? LABEL_HALF : 0));
	});
	const stop = (e: Event) => e.stopPropagation();
</script>

{#if edge && at}
	<!-- The anchor holds the button's place on screen; the button inside is drawn at the interface size. -->
	<div class="anchor" class:below={!!edge.label} style:left="{at.x}px" style:top="{at.y}px">
		<button
			class="insert index-card chrome"
			title="Insert a card here"
			aria-label="Insert a card here"
			onpointerdown={stop}
			ondblclick={stop}
			onclick={() => insertOnEdge(edge)}
		>
			<Plus />
		</button>
	</div>
{/if}

<style>
	.anchor {
		position: absolute;
		transform: translate(-50%, -50%);
	}

	.below {
		transform: translate(-50%, 4px);
	}

	.insert {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 50%;
		color: var(--pen);
		cursor: pointer;
	}

	.insert:hover {
		background: var(--pen);
		color: var(--on-pen);
	}
</style>
