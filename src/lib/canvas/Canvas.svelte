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
	import { items } from './items.svelte.js';
	import { NEW_EDGE, route } from './route.js';
	import { selection } from './selection.svelte.js';
	import { shortcuts } from './shortcuts.js';
	import BatchDialog from './BatchDialog.svelte';
	import Card from './Card.svelte';
	import EdgeLine from './EdgeLine.svelte';
	import Edge from './Edge.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import SelectionBar from './SelectionBar.svelte';
	import Zone from './Zone.svelte';

	/** Smallest minor square on screen before the paper steps up to the next, 5 times coarser, grid. */
	const MIN_SQUARE = 8;
	/** Zoom per pixel of wheel travel. A pinch moves a few pixels per event where a mouse notch moves
	 * 100, so it zooms faster, to follow the fingers. */
	const WHEEL_ZOOM = 0.0015;
	const PINCH_ZOOM = 0.01;

	/** What the canvas holds, framed when it opens; null for an empty canvas. */
	let { contents }: { contents: Rect | null } = $props();

	let el: HTMLDivElement;
	let panning = $state(false);
	/** The card or zone under the pointer, which shows its resize handles. */
	let hovered = $state<string | null>(null);
	let framed = false;

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

	// The paper moves with the world. Its minor lines fade out as squares shrink, then the grid
	// steps up so the old major lines become the new minor ones.
	const paper = $derived.by(() => {
		let square = GRID * camera.zoom;
		while (square < MIN_SQUARE) square *= 5;
		return { square, origin: camera.toScreen(0, 0), minor: Math.min(1, (square - MIN_SQUARE) / (2 * MIN_SQUARE)) };
	});

	// Like a map: the mouse wheel, two fingers on a trackpad and a pinch all zoom around the pointer,
	// and dragging pans in any direction. Chromium reports a pinch as a wheel turned with Ctrl held,
	// WebKit as gesture events carrying the scale since it began. Zooming must stop the page from
	// scrolling or zooming itself, which a passive listener cannot do.
	$effect(() => {
		/** The scale reached by the WebKit pinch under way, or null. */
		let pinch: number | null = null;
		const onwheel = (e: WheelEvent) => {
			e.preventDefault();
			if (pinch !== null) return;
			const p = local(e);
			// Ctrl+wheel on a mouse still turns by notches, at the wheel's pace.
			const rate = e.ctrlKey && !notched(e) ? PINCH_ZOOM : WHEEL_ZOOM;
			camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * rate));
			// What lies under the pointer changed without it moving.
			if (!e.buttons) hover(p);
		};
		const onstart = (e: Event) => {
			e.preventDefault();
			pinch = 1;
		};
		const onchange = (e: Event) => {
			e.preventDefault();
			const g = e as Event & { scale: number; clientX: number; clientY: number };
			const p = local(g);
			camera.zoomAt(p.x, p.y, g.scale / (pinch ?? 1));
			pinch = g.scale;
		};
		const onend = (e: Event) => {
			e.preventDefault();
			pinch = null;
		};
		const listeners = [
			['wheel', onwheel],
			['gesturestart', onstart],
			['gesturechange', onchange],
			['gestureend', onend]
		] as const;
		for (const [type, on] of listeners) el.addEventListener(type, on as EventListener, { passive: false });
		return () => {
			for (const [type, on] of listeners) el.removeEventListener(type, on as EventListener);
		};
	});

	function local(e: { clientX: number; clientY: number }) {
		const box = el.getBoundingClientRect();
		return { x: e.clientX - box.left, y: e.clientY - box.top };
	}

	// A mouse wheel turns by notches, which Chromium and WebKit report as multiples of 120 in the
	// legacy wheelDelta, and Firefox in lines. A trackpad scrolls and pinches by the pixel.
	function notched(e: WheelEvent) {
		const { wheelDeltaY } = e as WheelEvent & { wheelDeltaY?: number };
		return e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || (!!wheelDeltaY && wheelDeltaY % 120 === 0);
	}

	// Dragging the paper pans, Mod+dragging draws an edge from a card or a zone on the paper; a plain
	// click on the paper clears the selection. The middle button pans wherever it is pressed: cards,
	// zones and edges leave it to the canvas, and it never selects anything.
	function down(e: PointerEvent) {
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
		const p = local(e);
		const { x, y, w, h } = newCardAt(camera.toWorld(p.x, p.y));
		return history.edit(async () => {
			const id = await createCard(x, y, w, h);
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
	<div class="world" style:transform={camera.transform} style:--scale={1 / camera.zoom}>
		{#each items.zones as zone (zone.id)}
			<Zone {zone} />
		{/each}
		{#each items.edges as edge (edge.id)}
			<Edge {edge} />
		{/each}
		{#if draft.link}
			<EdgeLine route={route(...draft.link, NEW_EDGE)} draft />
		{/if}
		{#each items.cards as card (card.id)}
			<Card {card} />
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
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
	}

	.draft {
		position: absolute;
		box-sizing: border-box;
		border: 1.5px dashed var(--pen);
		border-radius: var(--radius-zone);
		background: color-mix(in srgb, var(--pen) 6%, transparent);
	}
</style>
