<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { HAlign, VAlign } from '#lib/api.js';
	import { alignSelected, colorSelected, deleteSelected } from './actions.js';
	import { camera } from './camera.svelte.js';
	import { items } from './items.svelte.js';
	import { selection } from './selection.svelte.js';
	import EdgeStyle from './EdgeStyle.svelte';

	const rows: [VAlign, string][] = [
		['top', 'Top'],
		['center', 'Middle'],
		['bottom', 'Bottom']
	];
	const columns: HAlign[] = ['left', 'center', 'right'];
	/** Half an edge label's height, in world units: the bar clears a label on the edge's middle. */
	const LABEL_HALF = 11;
	/** Highlighter colors for zones; null is the default gray. */
	const colors: [string | null, string][] = [
		[null, 'Gray'],
		['#f5d76e', 'Yellow'],
		['#f4a261', 'Orange'],
		['#e98a9b', 'Pink'],
		['#a78bdb', 'Violet'],
		['#6fa8dc', 'Blue'],
		['#7cc49a', 'Green']
	];

	const cards = $derived(selection.cards);
	const zones = $derived(selection.zones);
	// An edge counts by its middle, where its label is (its ends lie on its cards).
	const mids = $derived(selection.edges.map((e) => items.routeOf(e).mid));
	// In screen space, so the bar keeps its size at any zoom: above the top-left corner of the
	// selection, or centered over the middle when only edges are selected.
	const at = $derived.by(() => {
		const boxes = [...cards, ...zones];
		const points = [...boxes, ...mids];
		if (!points.length) return null;
		const xs = points.map((p) => p.x);
		const top = Math.min(...points.map((p) => p.y));
		if (boxes.length) return { ...camera.toScreen(Math.min(...xs), top), centered: false };
		return { ...camera.toScreen((Math.min(...xs) + Math.max(...xs)) / 2, top - LABEL_HALF), centered: true };
	});
	const shared = $derived(
		cards.every((c) => c.halign === cards[0].halign && c.valign === cards[0].valign) ? cards[0] : null
	);
	const color = $derived(zones.every((z) => z.color === zones[0].color) ? zones[0]?.color : undefined);
</script>

{#if at && !selection.editing}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="bar index-card"
		class:centered={at.centered}
		style:left="{Math.max(8, at.x)}px"
		style:top="{Math.max(52, at.y - 10)}px"
		onpointerdown={(e) => e.stopPropagation()}
		ondblclick={(e) => e.stopPropagation()}
	>
		{#if cards.length}
			<div class="align" role="group" aria-label="Text alignment">
				{#each rows as [valign, row] (valign)}
					{#each columns as halign (halign)}
						<button
							aria-label="{row} {halign}"
							title="{row} {halign}"
							class:on={shared?.halign === halign && shared?.valign === valign}
							onclick={() => alignSelected(halign, valign)}
						></button>
					{/each}
				{/each}
			</div>
		{/if}
		{#if zones.length}
			<div class="colors" role="group" aria-label="Zone color">
				{#each colors as [value, label] (label)}
					<button
						aria-label={label}
						title={label}
						class:on={color === value}
						style:--swatch={value ?? 'var(--zone-default)'}
						onclick={() => colorSelected(value)}
					></button>
				{/each}
			</div>
		{/if}
		{#if mids.length}
			<EdgeStyle />
		{/if}
		<button class="delete" aria-label="Delete" title="Delete" onclick={deleteSelected}><Trash2 /></button>
	</div>
{/if}

<style>
	.bar {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 6px 5px 8px;
		transform: translateY(-100%);
	}

	.centered {
		transform: translate(-50%, -100%);
	}

	.align {
		display: grid;
		grid-template-columns: repeat(3, 9px);
		gap: 3px;
	}

	.align button {
		width: 9px;
		height: 9px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-mark);
		background: var(--card);
		cursor: pointer;
	}

	.align button:hover {
		border-color: var(--pen);
	}

	.align .on {
		border-color: var(--ink);
		background: var(--ink);
	}

	.colors {
		display: flex;
		gap: 4px;
	}

	.colors button {
		width: 16px;
		height: 16px;
		padding: 0;
		border: 1.5px solid color-mix(in srgb, var(--swatch) 70%, var(--ink));
		border-radius: 50%;
		background: color-mix(in srgb, var(--swatch) 45%, var(--card));
		cursor: pointer;
	}

	.colors button:hover,
	.colors .on {
		box-shadow: 0 0 0 1.5px var(--card), 0 0 0 3px var(--ink);
	}

	.delete {
		display: flex;
		padding: 4px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--danger);
		cursor: pointer;
	}

	.delete:hover {
		background: var(--danger-paper);
	}
</style>
