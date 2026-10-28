<script lang="ts">
	import type { CardView, HAlign, VAlign } from '#lib/api.js';
	import { alignSelected } from './actions.js';

	// Where the selected cards' text sits: a 3 by 3 grid, the cards' place marked when they share it.
	let { cards }: { cards: CardView[] } = $props();

	const rows: [VAlign, string][] = [
		['top', 'Top'],
		['center', 'Middle'],
		['bottom', 'Bottom']
	];
	const columns: HAlign[] = ['left', 'center', 'right'];

	const shared = $derived(cards.every((c) => c.halign === cards[0].halign && c.valign === cards[0].valign) ? cards[0] : null);
</script>

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

<style>
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
</style>
