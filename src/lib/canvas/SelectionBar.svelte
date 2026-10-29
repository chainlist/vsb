<script lang="ts">
	import Network from '@lucide/svelte/icons/network';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { MOD_NAME } from '#lib/keys.js';
	import { arrowSelected, colorSelected, deleteSelected, shapeSelected, strokeSelected } from './actions.js';
	import { arrangeSelected } from './arrange.js';
	import { batchDialog } from './batchDialog.svelte.js';
	import { camera } from './camera.svelte.js';
	import { COLORS, shared } from './colors.js';
	import { items } from './items.svelte.js';
	import { LABEL_HALF } from './route.js';
	import { selection } from './selection.svelte.js';
	import { picker } from './tab.svelte.js';
	import AlignGrid from './AlignGrid.svelte';
	import EdgeStyle from './EdgeStyle.svelte';
	import StyleSelect from './StyleSelect.svelte';

	/** Each color drawn as its swatch. */
	const colors = COLORS.map(([value, name]): [string | null, string, string | null] => [value, name, value]);

	const cards = $derived(selection.cards);
	const zones = $derived(selection.zones);
	const drawings = $derived(selection.drawings);
	const zone = $derived(zones.length === 1 && selection.ids.length === 1);
	// An edge counts by its middle, where its label is (its ends lie on its cards).
	const mids = $derived(selection.edges.map((e) => items.routeOf(e).mid));
	// In screen space, so the bar keeps its size at any zoom: above the top-left corner of the
	// selection, or centered over the middle when only edges are selected.
	const at = $derived.by(() => {
		const boxes = [...cards, ...zones, ...drawings];
		const points = [...boxes, ...mids];
		if (!points.length) return null;
		const xs = points.map((p) => p.x);
		const top = Math.min(...points.map((p) => p.y));
		if (boxes.length) return { ...camera.toScreen(Math.min(...xs), top), centered: false };
		return { ...camera.toScreen((Math.min(...xs) + Math.max(...xs)) / 2, top - LABEL_HALF), centered: true };
	});
	// A drawing's color is each of its strokes': Mixed when they differ.
	const color = $derived(shared([...cards, ...zones].map((i) => i.color).concat(drawings.flatMap((d) => d.strokes.map((s) => s.color ?? null)))));
	const edgeStyle = $derived.by(() => {
		const edges = selection.edges;
		return {
			shape: shared(edges.map((e) => e.shape)),
			arrow: shared(edges.map((e) => e.arrow)),
			stroke: shared(edges.map((e) => e.stroke))
		};
	});
</script>

{#snippet swatch(value: string | null)}
	<span class="swatch" class:none={value === null} style:--swatch={value ?? 'var(--card)'}></span>
{/snippet}

<!-- Not while the card is edited, or while Tab's picker asks where its new card goes. -->
{#if at && !selection.editing && !picker.card}
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
			{#if cards.length || zones.length || drawings.length}
				<StyleSelect label="Color" options={colors} current={color} pick={colorSelected} look={swatch} />
			{/if}
			{#if mids.length}
				<EdgeStyle style={edgeStyle} pick={{ shape: shapeSelected, arrow: arrowSelected, stroke: strokeSelected }} />
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

	/* No color: the plain stock, struck through. */
	.none {
		background: linear-gradient(135deg, transparent 44%, var(--ink-soft) 44% 56%, transparent 56%), var(--card);
	}

	.centered {
		transform: translate(-50%, -100%);
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
