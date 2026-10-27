<script lang="ts">
	import { startResize, type Pull } from './gestures.js';
	import { selection } from './selection.svelte.js';

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

	// Only a single selected card or zone can be resized, while it is edited too.
	const target = $derived.by(() => {
		if (selection.ids.length !== 1) return undefined;
		const [card] = selection.cards;
		if (card) return { item: card, kind: 'card' as const };
		const [zone] = selection.zones;
		if (zone) return { item: zone, kind: 'zone' as const };
	});
</script>

{#if target}
	<!-- Drawn above every card, at a constant size on screen whatever the zoom. -->
	<div
		class="frame"
		style:left="{target.item.x}px"
		style:top="{target.item.y}px"
		style:width="{target.item.w}px"
		style:height="{target.item.h}px"
	>
		{#each handles as h (h.at)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="handle {h.at}"
				class:corner={h.px && h.py}
				onpointerdown={(e) => target && startResize(e, target.item, target.kind, h.px, h.py)}
			></span>
		{/each}
	</div>
{/if}

<style>
	.frame {
		--grip: calc(10px * var(--scale));
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
