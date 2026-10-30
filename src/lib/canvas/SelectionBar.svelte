<script lang="ts">
	import Group from '@lucide/svelte/icons/group';
	import Network from '@lucide/svelte/icons/network';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Workflow from '@lucide/svelte/icons/workflow';
	import Tip from '#lib/chrome/Tip.svelte';
	import { keyName } from '#lib/keys.js';
	import { arrowSelected, colorSelected, deleteSelected, shapeSelected, strokeSelected, zoneSelected } from './actions.js';
	import { arrangeSelected } from './arrange.js';
	import { batchDialog, BUILDER_KEYS } from './batchDialog.svelte.js';
	import { camera } from './camera.svelte.js';
	import { COLORS, shared } from './colors.js';
	import { items } from './items.svelte.js';
	import { LABEL_HALF } from './route.js';
	import { selection } from './selection.svelte.js';
	import { CANVAS_KEYS } from './shortcuts.js';
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
				<Tip label="Arrange: along their edges, in the builder's direction" side="top">
					{#snippet children(props)}
						<button {...props} class="tool" onclick={arrangeSelected}><Network /></button>
					{/snippet}
				</Tip>
			{/if}
			{#if cards.length || zone}
				<Tip label="Builder: edit edges, add cards" keys={keyName(BUILDER_KEYS.open.keys[0])} side="top">
					{#snippet children(props)}
						<button {...props} class="tool" onclick={() => batchDialog.open()}><Workflow /></button>
					{/snippet}
				</Tip>
			{/if}
			{#if cards.length + zones.length + drawings.length > 1}
				<Tip label="Zone around them" side="top">
					{#snippet children(props)}
						<button {...props} class="tool" onclick={zoneSelected}><Group /></button>
					{/snippet}
				</Tip>
			{/if}
			<Tip label="Delete" keys={keyName(CANVAS_KEYS.remove.keys[0])} side="top">
				{#snippet children(props)}
					<button {...props} class="tool delete" onclick={deleteSelected}><Trash2 /></button>
				{/snippet}
			</Tip>
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

	.tool {
		display: flex;
		padding: 4px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.tool:hover {
		background: var(--paper);
		color: var(--ink);
	}

	.delete {
		color: var(--danger);
	}

	.delete:hover {
		background: var(--danger-paper);
		color: var(--danger);
	}
</style>
