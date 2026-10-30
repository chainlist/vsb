<script lang="ts">
	import type { Bundle, BundleEnd } from '#lib/api.js';
	import { camera } from './camera.svelte.js';
	import { tap } from './drag.js';
	import { cover, items, OPEN_ZOOM } from './items.svelte.js';
	import { asMarker, markerAt, zoneMarkers } from './marker.js';
	import { route } from './route.js';
	import EdgeLine from './EdgeLine.svelte';

	let { bundle }: { bundle: Bundle } = $props();

	/** A zone as it is on the canvas, so the line follows a drag, or its marker when it is drawn as one;
	 * or a cluster's marker. */
	function box(end: BundleEnd) {
		if (!end.zone) return markerAt(end);
		const zone = items.find(end.zone)?.item ?? end;
		return asMarker(zone) ? markerAt(zone, zoneMarkers.get(end.zone)) : zone;
	}
	// Drawn curved and solid, whatever its edges' styles, its arrowheads keeping their size on screen.
	const line = $derived(
		route(box(bundle.ends[0]), box(bundle.ends[1]), { shape: 'curved', arrow: bundle.arrow }, 1 / camera.zoom)
	);

	// Clicking frames both ends, zoomed in until their edges show. A drag pans, as on the paper.
	const press = (e: PointerEvent) => tap(e, () => camera.glide(cover(bundle.ends), OPEN_ZOOM));
</script>

<EdgeLine route={line} onpointerdown={press} />
{#if bundle.count > 1}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="line-label count" style:left="{line.mid.x}px" style:top="{line.mid.y}px" onpointerdown={press}>
		{bundle.count}
	</div>
{/if}

<style>
	/* Laid out in screen pixels, scaled back from the world's zoom. */
	.count {
		transform: translate(-50%, -50%) scale(var(--scale));
	}
</style>
