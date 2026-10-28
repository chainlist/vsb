<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';
	import { zoneRows } from '#lib/api.js';
	import { MOD_NAME } from '#lib/keys.js';
	import { motion } from '#lib/motion.js';
	import { Paged } from './paged.svelte.js';
	import ZoneRow from './ZoneRow.svelte';

	/** The zone whose inner zones are listed, or null for the outermost; and how deep it lies. */
	let { parent, depth }: { parent: string | null; depth: number } = $props();

	const load = $derived((offset: number, limit: number) => zoneRows(parent, offset, limit));
	const list = new Paged(() => load);
</script>

<!-- One level of the zone tree, a page at a time. It unrolls once its first page is in: while it
     does, its end stays clipped, so the next page waits for a scroll. -->
{#if list.loaded}
	<div in:slide={{ duration: motion(200), easing: cubicOut }}>
		<ul>
			{#each list.lines as zone, index (zone.id)}
				<ZoneRow {zone} {depth} {index} />
			{/each}
			{#if list.more}
				<li class="status" {@attach list.atEnd}>Loading…</li>
			{/if}
		</ul>
		{#if !parent && !list.lines.length}
			<p class="status">No zones yet. {MOD_NAME}+drag on the paper draws one.</p>
		{/if}
	</div>
{/if}

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.status {
		margin: 0;
		padding: 8px 10px;
		color: var(--ink-soft);
		font-size: 13px;
	}
</style>
