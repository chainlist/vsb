<script lang="ts">
	import type { CardView, ItemState, ZoneView } from '#lib/api.js';
	import { isMod } from '#lib/keys.js';
	import { edit } from './actions.js';
	import { GRIP, startResize, type Pull } from './gestures.js';
	import { items } from './items.svelte.js';
	import { asMarker } from './marker.js';
	import { selection } from './selection.svelte.js';

	/** The card or zone under the pointer, if any. */
	let { hovered }: { hovered: string | null } = $props();

	// A strip along each side and a square on each corner, named by compass point.
	const handles: { at: string; px: Pull; py: Pull }[] = [
		{ at: 'n', px: 0, py: -1 },
		{ at: 's', px: 0, py: 1 },
		{ at: 'w', px: -1, py: 0 },
		{ at: 'e', px: 1, py: 0 },
		{ at: 'nw', px: -1, py: -1 },
		{ at: 'ne', px: 1, py: -1 },
		{ at: 'sw', px: -1, py: 1 },
		{ at: 'se', px: 1, py: 1 }
	];

	// A single selected card or zone has handles, while it is edited too, and so has the one under
	// the pointer, which can be resized without selecting it first. A zone drawn as a marker has none.
	const targets = $derived.by(() => {
		const ids = new Set<string>();
		if (selection.ids.length === 1) ids.add(selection.ids[0]);
		if (hovered) ids.add(hovered);
		return [...ids].flatMap((id) => items.find(id) ?? []).filter((t) => t.kind === 'card' || !asMarker(t.item));
	});

	// Mod+drag draws an edge from a card: the canvas handles it, as it does on the card itself.
	function press(e: PointerEvent, item: CardView | ZoneView, kind: ItemState['kind'], h: (typeof handles)[number]) {
		if (!isMod(e)) startResize(e, item, kind, h.px, h.py);
	}

	// A double-click on a card's side opens it, as one inside it does. On a zone's side it does
	// nothing: it never reaches the paper, where it would place a card.
	function open(e: MouseEvent, item: CardView | ZoneView, kind: ItemState['kind']) {
		e.stopPropagation();
		if (kind === 'card') edit(item);
	}
</script>

{#each targets as { item, kind } (item.id)}
	<!-- Drawn above every card, at a constant size on screen whatever the zoom. -->
	<div
		class="frame"
		style:--grip="calc({GRIP}px * var(--scale))"
		style:left="{item.x}px"
		style:top="{item.y}px"
		style:width="{item.w}px"
		style:height="{item.h}px"
	>
		{#each handles as h (h.at)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="handle {h.at}"
				class:corner={h.px && h.py}
				onpointerdown={(e) => press(e, item, kind, h)}
				ondblclick={(e) => open(e, item, kind)}
			></span>
		{/each}
	</div>
{/each}

<style>
	.frame {
		--half: calc(var(--grip) / -2);
		position: absolute;
		pointer-events: none;
	}

	.handle {
		position: absolute;
		pointer-events: auto;
	}

	.n,
	.s {
		left: 0;
		right: 0;
		height: var(--grip);
		cursor: ns-resize;
	}

	.w,
	.e {
		top: 0;
		bottom: 0;
		width: var(--grip);
		cursor: ew-resize;
	}

	.n,
	.nw,
	.ne {
		top: var(--half);
	}

	.s,
	.sw,
	.se {
		bottom: var(--half);
	}

	.w,
	.nw,
	.sw {
		left: var(--half);
	}

	.e,
	.ne,
	.se {
		right: var(--half);
	}

	.corner {
		width: var(--grip);
		height: var(--grip);
		box-sizing: border-box;
		border: calc(1.5px * var(--scale)) solid var(--pen);
		border-radius: calc(var(--radius-mark) * var(--scale));
		background: var(--card);
	}

	.nw,
	.se {
		cursor: nwse-resize;
	}

	.ne,
	.sw {
		cursor: nesw-resize;
	}
</style>
