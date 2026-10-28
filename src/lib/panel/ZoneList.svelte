<script lang="ts">
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import X from '@lucide/svelte/icons/x';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { MOD_NAME } from '#lib/keys.js';
	import { motion } from '#lib/motion.js';
	import { zoneList } from './zoneList.svelte.js';
	import ZoneLevel from './ZoneLevel.svelte';
</script>

<!-- The outermost zones, and the zones inside one when it is opened. A card floating beside the
     canvas, not a route: it stays open with the tray or search, and the canvas keeps its keys. It
     slides in from the left, and back out. -->
<aside class="zones index-card" aria-label="Zones" transition:fly={{ x: -24, duration: motion(200), easing: cubicOut }}>
	<header>
		<h2 class="icon-label"><SquareDashed /> Zones</h2>
		<button class="close" aria-label="Close" title="Close ({MOD_NAME}+L)" onclick={() => zoneList.toggle()}>
			<X />
		</button>
	</header>
	<div class="rows">
		<ZoneLevel parent={null} depth={0} />
	</div>
</aside>

<style>
	/* Under the top bar, down the left side, as tall as its rows. */
	.zones {
		position: fixed;
		top: 66px;
		left: 14px;
		display: flex;
		flex-direction: column;
		width: 264px;
		max-height: calc(100% - 80px);
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

	.rows {
		overflow-y: auto;
		padding: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
</style>
