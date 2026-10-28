<script lang="ts">
	import { createCard, type Rect } from '#lib/api.js';
	import { bindKeys, isMod } from '#lib/keys.js';
	import { batchDialog } from './batchDialog.svelte.js';
	import { camera } from './camera.svelte.js';
	import { draft, startDraw } from './draw.svelte.js';
	import { track } from './drag.js';
	import { GRIP, newCardAt } from './gestures.js';
	import { GRID } from './grid.svelte.js';
	import { history } from './history.js';
	import { cover, items, OPEN_ZOOM } from './items.svelte.js';
	import { NEW_EDGE, route } from './route.js';
	import { selection } from './selection.svelte.js';
	import { shortcuts } from './shortcuts.js';
	import { pointIn, zoomOn } from './zoom.js';
	import BatchDialog from './BatchDialog.svelte';
	import Bundle from './Bundle.svelte';
	import Card from './Card.svelte';
	import Cluster from './Cluster.svelte';
	import EdgeLine from './EdgeLine.svelte';
	import Edge from './Edge.svelte';
	import EdgeInsert from './EdgeInsert.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import SelectionBar from './SelectionBar.svelte';
	import WayPicker from './WayPicker.svelte';
	import Zone from './Zone.svelte';

	/** Smallest minor square on screen before the paper steps up to the next, 5 times coarser, grid. */
	const MIN_SQUARE = 8;

	/** What the canvas holds, framed when it opens; null for an empty canvas. */
	let { contents }: { contents: Rect | null } = $props();

	let el: HTMLDivElement;
	let panning = $state(false);
	/** The card or zone under the pointer, which shows its resize handles. */
	let hovered = $state<string | null>(null);
	let framed = false;
	/** The camera at the last two presses. A double-click whose first click moved it, zooming in on a
	 * cluster or a bundle, ends somewhere else, and places nothing. */
	let views = ['', ''];

	camera.reset();
	items.reset();
	selection.clear();
	selection.editing = null;
	history.reset();
	batchDialog.close();

	// Frames the contents once, as soon as the canvas has a size.
	$effect(() => {
		if (framed || !camera.width || !camera.height) return;
		framed = true;
		if (contents) camera.fit(contents);
	});
	$effect(() => items.update());
	$effect(() => bindKeys(shortcuts));
	$effect(() => zoomOn(el, hover));

	// The paper moves with the world. Its minor lines fade out as squares shrink, then the grid
	// steps up so the old major lines become the new minor ones.
	const paper = $derived.by(() => {
		let square = GRID * camera.zoom;
		while (square < MIN_SQUARE) square *= 5;
		return { square, origin: camera.toScreen(0, 0), minor: Math.min(1, (square - MIN_SQUARE) / (2 * MIN_SQUARE)) };
	});

	function local(e: { clientX: number; clientY: number }) {
		return pointIn(el, e);
	}

	// Dragging the paper pans, Mod+dragging draws an edge from a card or a zone on the paper; a plain
	// click on the paper clears the selection. The middle button pans wherever it is pressed: cards,
	// zones and edges leave it to the canvas, and it never selects anything.
	function down(e: PointerEvent) {
		views = [views[1], camera.transform];
		const middle = e.button === 1;
		if (e.button !== 0 && !middle) return;
		if (isMod(e) && !middle) {
			const p = local(e);
			return startDraw(e, camera.toWorld(p.x, p.y));
		}
		let last = { dx: 0, dy: 0 };
		track(e, {
			move(dx, dy) {
				panning = true;
				hovered = null;
				camera.panBy(dx - last.dx, dy - last.dy);
				last = { dx, dy };
			},
			end(dragged) {
				panning = false;
				if (!dragged && !middle) selection.clear();
			}
		});
	}

	// While a button is down the item keeps its handles, so they stay with it as it moves or resizes.
	function move(e: PointerEvent) {
		const p = local(e);
		batchDialog.pointer = p;
		if (!e.buttons) hover(p);
	}

	function hover(p: { x: number; y: number }) {
		// Within half a handle of an item, the pointer is on its handle.
		hovered = items.itemAt(camera.toWorld(p.x, p.y), GRIP / 2 / camera.zoom)?.id ?? null;
	}

	function leave(e: PointerEvent) {
		batchDialog.pointer = null;
		if (!e.buttons) hovered = null;
	}

	function place(e: MouseEvent) {
		if (views[0] !== camera.transform) return;
		const p = local(e);
		const { x, y, w, h } = newCardAt(camera.toWorld(p.x, p.y));
		// Zoomed out, the card would be hidden in a cluster: it is framed, zoomed in until it shows.
		const hidden = items.collapsed;
		return history.edit(async () => {
			const id = await createCard(x, y, w, h);
			if (hidden) camera.glide(cover([{ x, y, w, h }]), OPEN_ZOOM);
			selection.only(id);
			selection.editing = id;
			return [{ kind: 'card', id, value: null }];
		});
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="canvas graph-paper"
	class:panning
	style:--cell="{paper.square}px"
	style:--ox="{paper.origin.x}px"
	style:--oy="{paper.origin.y}px"
	style:--minor={paper.minor}
	bind:this={el}
	bind:clientWidth={camera.width}
	bind:clientHeight={camera.height}
	onpointerdown={down}
	onpointermove={move}
	onpointerleave={leave}
	ondblclick={place}
>
	<!-- --scale: one screen pixel in world units, for marks drawn at a constant size on screen. -->
	<div class="world" class:collapsed={items.collapsed} style:transform={camera.transform} style:--scale={1 / camera.zoom}>
		{#each items.zones as zone (zone.id)}
			<Zone {zone} />
		{/each}
		{#each items.edges as edge (edge.id)}
			<Edge {edge} />
		{/each}
		{#each items.bundles as bundle}
			<Bundle {bundle} />
		{/each}
		{#if draft.link}
			<EdgeLine route={route(...draft.link, NEW_EDGE)} draft />
		{/if}
		{#each items.cards as card (card.id)}
			<Card {card} />
		{/each}
		{#each items.clusters as cluster (cluster.cell.join())}
			<Cluster {cluster} />
		{/each}
		{#if draft.box}
			<div
				class="draft"
				style:left="{draft.box.x}px"
				style:top="{draft.box.y}px"
				style:width="{draft.box.w}px"
				style:height="{draft.box.h}px"
			></div>
		{/if}
		<ResizeHandles {hovered} />
	</div>
	<SelectionBar />
	<EdgeInsert />
	<WayPicker />
</div>
<BatchDialog />

<style>
	.canvas {
		position: fixed;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		user-select: none;
	}

	.panning {
		cursor: grabbing;
	}

	.world {
		/* One pixel, for frames and lines: in world units while open, on screen once zones collapse. */
		--px: 1px;
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
	}

	.collapsed {
		--px: calc(1px * var(--scale));
	}

	.draft {
		position: absolute;
		box-sizing: border-box;
		border: 1.5px dashed var(--pen);
		border-radius: var(--radius-zone);
		background: color-mix(in srgb, var(--pen) 6%, transparent);
	}
</style>
