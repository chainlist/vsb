<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { failure } from '#lib/failure.svelte.js';
</script>

{#if failure.message}
	<div class="failure index-card chrome" role="alert">
		<p class="error">That did not work: {failure.message}</p>
		<button class="close" aria-label="Close" title="Close" onclick={() => failure.close()}><X /></button>
	</div>
{/if}

<style>
	/* Top center, clear of the canvas chrome, and over the panels and dialogs. */
	.failure {
		position: fixed;
		top: var(--inset);
		left: 50%;
		z-index: 60;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		max-width: min(480px, calc(100% - 2 * var(--inset)));
		padding: 8px 8px 8px 14px;
		transform: translateX(-50%);
		font: 13px/1.4 var(--font-ui);
	}

	p {
		margin: 4px 0;
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
</style>
