<script lang="ts">
	import type { ZoneView } from '#lib/api.js';
	import { edit, rename } from './actions.js';
	import { camera } from './camera.svelte.js';
	import { startMove } from './gestures.js';
	import { items, OPEN_ZOOM } from './items.svelte.js';
	import { selection } from './selection.svelte.js';
	import InlineField from './InlineField.svelte';

	let { zone }: { zone: ZoneView } = $props();

	const selected = $derived(selection.has(zone.id));
	const editing = $derived(selection.editing === zone.id);

	function open(e: MouseEvent) {
		// Not a double-click on the canvas, which would place a card.
		e.stopPropagation();
		edit(zone);
	}

	// A card placed in a collapsed zone would be hidden: double-clicking one frames it instead,
	// zoomed in at least until it opens.
	function zoomIn(e: MouseEvent) {
		if (!items.collapsed) return;
		e.stopPropagation();
		camera.fit({ minX: zone.x, minY: zone.y, maxX: zone.x + zone.w, maxY: zone.y + zone.h }, OPEN_ZOOM);
	}
</script>

<!-- The body is paper: dragging it pans, double-clicking places a card inside, or zooms in on a
     collapsed zone. The name is the handle: a press selects, a drag moves, a double-click renames. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="zone"
	class:selected
	class:collapsed={items.collapsed}
	style:left="{zone.x}px"
	style:top="{zone.y}px"
	style:width="{zone.w}px"
	style:height="{zone.h}px"
	style:--zone-color={zone.color ?? 'var(--zone-default)'}
	ondblclick={zoomIn}
>
	<div class="title">
		{#if editing}
			<InlineField value={zone.name} placeholder="Untitled" save={(name) => rename(zone.id, name)} />
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="name" class:untitled={!zone.name} onpointerdown={(e) => startMove(e, zone)} ondblclick={open}>
				{zone.name || 'Untitled'}
			</span>
		{/if}
	</div>
</div>

<style>
	/* A highlighter wash over the paper: the grid shows through. */
	.zone {
		/* One pixel: in world units while open, on screen once collapsed. */
		--px: 1px;
		position: absolute;
		box-sizing: border-box;
		border: calc(1.5 * var(--px)) solid color-mix(in srgb, var(--zone-color) 70%, var(--ink));
		border-radius: var(--radius-zone);
		background: color-mix(in srgb, var(--zone-color) var(--zone-wash), transparent);
	}

	/* Zoomed out, the zone is only its frame and its name, which keep their size on screen. */
	.collapsed {
		--px: calc(1px * var(--scale));
		border-radius: calc(var(--radius-zone) * var(--scale));
	}

	.selected {
		box-shadow: 0 0 0 calc(1.5 * var(--px)) var(--pen);
	}

	/* Above every card, so a card never hides the zone's handle. */
	.title {
		position: absolute;
		z-index: 1;
		left: 14px;
		top: 10px;
		color: color-mix(in srgb, var(--zone-color) 35%, var(--ink));
		font: 600 calc(20 * var(--px)) / 1.2 var(--font-ui);
		font-stretch: var(--zone-stretch);
	}

	/* Centered, and cut at the zone's sides when too long. */
	.collapsed .title {
		left: 50%;
		top: 50%;
		width: max-content;
		max-width: calc(100% - 28 * var(--px));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transform: translate(-50%, -50%);
	}

	.name {
		cursor: move;
	}

	.untitled {
		opacity: 0.55;
	}
</style>
