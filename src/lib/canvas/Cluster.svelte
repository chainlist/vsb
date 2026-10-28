<script lang="ts">
	import type { Cluster } from '#lib/api.js';
	import { camera } from './camera.svelte.js';
	import { tap } from './drag.js';
	import { cover, OPEN_ZOOM } from './items.svelte.js';
	import { MARKER, markerAt } from './marker.js';

	let { cluster }: { cluster: Cluster } = $props();

	const at = $derived(markerAt(cluster));

	// Clicking frames the cards, zoomed in until they show. A drag pans, as on the paper.
	const press = (e: PointerEvent) => tap(e, () => camera.glide(cover([cluster]), OPEN_ZOOM));
</script>

<!-- A stack of cards in the theme's stock, saying how many it stands for. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="cluster"
	style:left="{at.x}px"
	style:top="{at.y}px"
	style:width="{MARKER.w}px"
	style:height="{MARKER.h}px"
	onpointerdown={press}
>
	<div class="index-card back"></div>
	<div class="index-card front">{cluster.count} {cluster.count === 1 ? 'note' : 'notes'}</div>
</div>

<style>
	/* Laid out in screen pixels, scaled back from the world's zoom. */
	.cluster {
		position: absolute;
		transform-origin: 0 0;
		transform: scale(var(--scale));
		cursor: zoom-in;
	}

	.index-card {
		position: absolute;
		inset: 0;
	}

	/* The card under it, peeking out at the top right. */
	.back {
		transform: translate(4px, -4px);
	}

	.front {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-soft);
		font: 500 13px var(--font-ui);
		white-space: nowrap;
	}
</style>
