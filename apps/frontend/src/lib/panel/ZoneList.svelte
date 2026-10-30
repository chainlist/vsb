<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { THRESHOLD } from '#lib/canvas/drag.js';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { motion } from '#lib/motion.js';
	import { zoneList, ZONE_LIST_KEYS } from './zoneList.svelte.js';
	import ZoneLevel from './ZoneLevel.svelte';

	/** What is typed to find zones; while it holds a word, the matches stand in for the tree. */
	let find = $state('');
	let field: HTMLInputElement;
	let card: HTMLElement;
	let rows: HTMLElement;

	onMount(() => {
		if (zoneList.focusFind) field.focus();
	});

	/** The row the keyboard is on: its zone's button. */
	function focused() {
		const on = document.activeElement;
		return on instanceof HTMLButtonElement && rows.contains(on) && on.matches('.zone') ? on : null;
	}

	/** Moves the keyboard `by` rows, as the tree shows them; up from the first, to the find field. Rows
	 * still folding away are inert, and skipped. */
	function step(by: 1 | -1) {
		const all = [...rows.querySelectorAll<HTMLButtonElement>('button.zone')].filter((b) => !b.closest('[inert]'));
		const on = focused();
		const next = (on ? all.indexOf(on) : -1) + by;
		if (next < 0) field.focus();
		else all[Math.min(next, all.length - 1)]?.focus();
	}

	/** Lists the zone's inner zones, or, once they are, steps to the first. */
	function unfold(row: HTMLButtonElement) {
		const id = row.dataset.zone!;
		if (!row.dataset.inner) return;
		if (zoneList.unfolded.has(id)) step(1);
		else zoneList.unfold(id, true);
	}

	/** Folds the zone's inner zones back up, or, when they are, steps out to the zone around. */
	function fold(row: HTMLButtonElement) {
		const id = row.dataset.zone!;
		if (zoneList.unfolded.has(id)) zoneList.unfold(id, false);
		else row.closest('li')?.parentElement?.closest('li')?.querySelector<HTMLButtonElement>('button.zone')?.focus();
	}

	// Once the keyboard is in the card (Mod+L puts it in the find field), it takes its keys, through
	// data-own-keys: Up and Down go from row to row, Right and Left unfold and fold, Enter is a row's
	// own click, and Escape gives the keys back to the canvas. In the field, Escape empties it first.
	$effect(() => {
		const onRow = () => focused() !== null;
		const inField = () => document.activeElement === field;
		return bindKeys([
			{ ...ZONE_LIST_KEYS.down, inText: true, when: () => onRow() || inField(), run: () => step(1) },
			{ ...ZONE_LIST_KEYS.up, inText: true, when: onRow, run: () => step(-1) },
			{ ...ZONE_LIST_KEYS.unfold, inText: true, when: onRow, run: () => unfold(focused()!) },
			{ ...ZONE_LIST_KEYS.fold, inText: true, when: onRow, run: () => fold(focused()!) },
			{
				...ZONE_LIST_KEYS.leave,
				inText: true,
				when: () => onRow() || (inField() && !find),
				run: () => (document.activeElement as HTMLElement).blur()
			}
		]);
	});

	// A click outside closes it, but not a drag that pans, the wheel or a pinch, nor a click on what
	// it stays open beside: the rail and the tray or search, marked data-beside-zones. Caught on the
	// way down, since cards and zones keep their presses from the canvas.
	$effect(() => {
		let down: { x: number; y: number } | null = null;
		const press = (e: PointerEvent) => {
			const on = e.target as Element;
			const outside = !card.contains(on) && !on.closest('[data-beside-zones]');
			down = e.button === 0 && outside ? { x: e.clientX, y: e.clientY } : null;
		};
		const release = (e: PointerEvent) => {
			if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < THRESHOLD) zoneList.toggle();
			down = null;
		};
		addEventListener('pointerdown', press, true);
		addEventListener('pointerup', release, true);
		return () => {
			removeEventListener('pointerdown', press, true);
			removeEventListener('pointerup', release, true);
		};
	});
</script>

<!-- The outermost zones, and the zones inside one when it is opened, or the zones found by name. A
     card floating beside the canvas, not a route: it stays open with the tray or search, and the
     canvas keeps its keys until the keyboard is put in the card. It slides in from the left, and
     back out. -->
<aside
	class="zones index-card chrome"
	aria-label="Zones"
	data-own-keys
	bind:this={card}
	transition:fly={{ x: -24, duration: motion(200), easing: cubicOut }}
>
	<header>
		<h2 class="icon-label"><SquareDashed /> Zones</h2>
		<button class="close" aria-label="Close" title="Close ({MOD_NAME}+L)" onclick={() => zoneList.toggle()}>
			<X />
		</button>
	</header>
	<!-- A search field: Escape or the cross empties it, bringing the tree back. -->
	<label class="find">
		<Search size={14} />
		<input type="search" placeholder="Find a zone" aria-label="Find a zone" bind:this={field} bind:value={find} />
		{#if find}
			<button
				class="clear"
				aria-label="Clear"
				title="Clear (Esc)"
				onclick={() => {
					find = '';
					field.focus();
				}}
			>
				<X size={14} />
			</button>
		{/if}
	</label>
	<div class="rows" bind:this={rows}>
		<ErrorBoundary what="The zone list">
			<ZoneLevel parent={null} depth={0} find={find.trim()} />
		</ErrorBoundary>
	</div>
</aside>

<style>
	/* Beside the rail, level with its top, as tall as its rows. */
	.zones {
		position: fixed;
		top: var(--under-vault);
		left: calc(var(--inset) + var(--rail) + var(--gap));
		display: flex;
		flex-direction: column;
		width: 264px;
		max-height: calc(100% - var(--under-vault) - var(--inset));
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 8px 8px 14px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font: 600 14px var(--font-ui);
	}

	.close {
		display: flex;
		padding: 5px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.close:hover {
		background: var(--paper);
		color: var(--ink);
	}

	.find {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 8px 0;
		padding: 0 10px;
		border-radius: var(--radius-control);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--border);
		color: var(--ink-soft);
	}

	.find:focus-within {
		box-shadow: inset 0 0 0 1px var(--pen);
	}

	input {
		flex: 1;
		min-width: 0;
		height: 30px;
		padding: 0;
		border: none;
		outline: none;
		background: none;
		color: var(--ink);
		font: 13px var(--font-ui);
	}

	input::placeholder {
		color: var(--ink-soft);
	}

	/* The browser's own cross is drawn in its colors, not the theme's: the clear button stands in. */
	input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		display: flex;
		margin-right: -6px;
		padding: 3px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.clear:hover {
		color: var(--ink);
	}

	.rows {
		overflow-y: auto;
		padding: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
</style>
