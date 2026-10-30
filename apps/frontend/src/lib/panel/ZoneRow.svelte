<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { cubicOut } from 'svelte/easing';
	import { fly, slide } from 'svelte/transition';
	import type { ZoneRow } from '#lib/api.js';
	import { rename, show } from '#lib/canvas/actions.js';
	import { camera } from '#lib/canvas/camera.svelte.js';
	import InlineField from '#lib/canvas/InlineField.svelte';
	import { selection } from '#lib/canvas/selection.svelte.js';
	import { bindKeys } from '#lib/keys.js';
	import { motion } from '#lib/motion.js';
	import ZoneLevel from './ZoneLevel.svelte';
	import { zoneList, ZONE_LIST_KEYS } from './zoneList.svelte.js';

	/** `index`: its place in its level, which staggers the rows' arrival. */
	let { zone, depth, index }: { zone: ZoneRow; depth: number; index: number } = $props();

	/** Whether the zones inside it are listed under it. */
	const open = $derived(zoneList.unfolded.has(zone.id));
	let renaming = $state(false);
	const selected = $derived(selection.has(zone.id));
	const onScreen = $derived.by(() => {
		const v = camera.visible;
		return zone.x < v.maxX && zone.x + zone.w > v.minX && zone.y < v.maxY && zone.y + zone.h > v.minY;
	});
	const cards = $derived(`${zone.cards} card${zone.cards === 1 ? '' : 's'}`);

	// Escape ends the renaming, keeping what was typed, as it does on the canvas.
	$effect(() => {
		if (renaming) return bindKeys([{ ...ZONE_LIST_KEYS.renamed, inText: true, run: () => (renaming = false) }]);
	});
</script>

<!-- Rows arrive in a quick cascade, as the card opens or a zone unfolds: global, since they come
     with their level's block. -->
<li in:fly|global={{ x: -8, duration: motion(160), delay: motion(Math.min(index, 12) * 18), easing: cubicOut }}>
	<div class="row" class:selected style:--depth={depth} style:--swatch={zone.color ?? 'var(--zone-default)'}>
		{#if zone.inner}
			<button
				class="chevron"
				class:open
				aria-expanded={open}
				aria-label={open ? 'Hide the zones inside' : 'Show the zones inside'}
				onclick={() => zoneList.unfold(zone.id)}
			>
				<ChevronRight size={14} />
			</button>
		{:else}
			<span class="chevron"></span>
		{/if}
		{#if renaming}
			<span class="zone">
				<span class="swatch"></span>
				<InlineField value={zone.name} placeholder="Untitled" save={(name) => rename(zone.id, name)} done={() => (renaming = false)} />
			</span>
		{:else}
			<!-- A click, or Enter, frames and selects the zone, as a search result does; a double-click
			     renames it. The list's arrow keys find the zone and its inner zones by data-zone and
			     data-inner. -->
			<button
				class="zone"
				title="Show on the canvas"
				data-zone={zone.id}
				data-inner={zone.inner || undefined}
				onclick={() => show('zone', zone.id)}
				ondblclick={() => (renaming = true)}
			>
				<span class="swatch"></span>
				<span class="name" class:untitled={!zone.name}>{zone.name || 'Untitled'}</span>
				{#if onScreen}
					<span class="here" title="On screen"></span>
				{/if}
				<span class="count" title={cards}>{zone.cards}</span>
			</button>
		{/if}
	</div>
	{#if open}
		<!-- Folds back up as it closes; it unrolls itself as it opens, once its rows are in. -->
		<div out:slide={{ duration: motion(160), easing: cubicOut }}>
			<ZoneLevel parent={zone.id} depth={depth + 1} />
		</div>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		height: 30px;
		padding-left: calc(var(--depth) * 16px);
		border-radius: var(--radius-control);
	}

	.row:hover {
		background: var(--paper);
	}

	.selected,
	.selected:hover {
		background: color-mix(in srgb, var(--pen) 10%, transparent);
		color: var(--pen);
	}

	/* The row the keyboard is on: ringed whole, not just its name's button. */
	.row:has(.zone:focus-visible) {
		box-shadow: inset 0 0 0 1.5px var(--pen);
	}

	.zone:focus-visible {
		outline: none;
	}

	.chevron {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: var(--radius-mark);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	button.chevron:hover {
		color: var(--ink);
	}

	.chevron :global(svg) {
		transition: rotate 120ms;
	}

	.open :global(svg) {
		rotate: 90deg;
	}

	.zone {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 8px;
		min-width: 0;
		height: 100%;
		padding: 0 8px 0 2px;
		border: none;
		background: none;
		color: inherit;
		font: 500 14px var(--font-ui);
		text-align: left;
		cursor: pointer;
	}

	.swatch {
		flex: none;
		width: 12px;
		height: 12px;
	}

	/* Set like a zone's name on the canvas. */
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-stretch: var(--zone-stretch);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.untitled {
		opacity: 0.55;
	}

	.here {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--pen);
	}

	.count {
		flex: none;
		min-width: 18px;
		color: var(--ink-soft);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>
