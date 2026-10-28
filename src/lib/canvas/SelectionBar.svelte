<script lang="ts">
	import Network from '@lucide/svelte/icons/network';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { MOD_NAME } from '#lib/keys.js';
	import { colorSelected, deleteSelected } from './actions.js';
	import { arrangeSelected } from './arrange.js';
	import { batchDialog } from './batchDialog.svelte.js';
	import { camera } from './camera.svelte.js';
	import { items } from './items.svelte.js';
	import { selection } from './selection.svelte.js';
	import AlignGrid from './AlignGrid.svelte';
	import EdgeStyle from './EdgeStyle.svelte';

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
	const zone = $derived(zones.length === 1 && selection.ids.length === 1);
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
	const color = $derived(zones.every((z) => z.color === zones[0].color) ? zones[0]?.color : undefined);
</script>

{#if at && !selection.editing}
	<!-- The anchor holds the bar's place on screen; the bar inside it is drawn at the interface size. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="anchor"
		class:centered={at.centered}
		style:left="{Math.max(8, at.x)}px"
		style:top="{Math.max(52, at.y - 10)}px"
		onpointerdown={(e) => e.stopPropagation()}
		ondblclick={(e) => e.stopPropagation()}
	>
		<div class="bar index-card chrome">
			{#if cards.length}
				<AlignGrid {cards} />
			{/if}
			{#if zones.length}
				<div class="colors" role="group" aria-label="Zone color">
					{#each colors as [value, label] (label)}
						<button
							class="swatch"
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
			<!-- Arranging and the builder work on the selected cards, or on a lone selected zone's contents. -->
			{#if cards.length > 1 || zone}
				<button class="tool icon-label" title="Arrange along their edges, in the builder's direction" onclick={arrangeSelected}>
					<Network /> Arrange
				</button>
			{/if}
			{#if cards.length || zone}
				<button class="tool icon-label" title="Edit edges, add cards ({MOD_NAME}+B)" onclick={() => batchDialog.open()}>
					<Workflow /> Builder
				</button>
			{/if}
			<button class="delete" aria-label="Delete" title="Delete" onclick={deleteSelected}><Trash2 /></button>
		</div>
	</div>
{/if}

<style>
	.anchor {
		position: absolute;
		transform: translateY(-100%);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 6px 5px 8px;
	}

	.centered {
		transform: translate(-50%, -100%);
	}

	.colors {
		display: flex;
		gap: 4px;
	}

	.colors button {
		padding: 0;
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

	.tool {
		padding: 3px 8px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		font: 500 13px var(--font-ui);
		cursor: pointer;
	}

	.tool:hover {
		background: var(--paper);
		color: var(--ink);
	}
</style>
