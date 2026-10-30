<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { Snippet } from 'svelte';
	import { messageOf } from '#lib/failure.svelte.js';

	/** `what` names the part in the notice ("The canvas", "This card"); `center` puts the notice in
	 * the middle of the window, for a part that fills it. */
	let { what, center = false, children }: { what: string; center?: boolean; children: Snippet } = $props();
</script>

<!-- A part that fails while it draws, or in one of its effects, shows what went wrong in its place
     and the rest of the app keeps working; Try again draws it afresh. Errors in clicks and commands
     never reach a boundary: they go to the failure notice (#lib/failure.svelte.ts). Nor does a
     route's load, which goes to the error page. -->
<svelte:boundary onerror={(error) => console.error(error)}>
	{@render children()}

	{#snippet failed(error, reset)}
		<div class="failed" class:center role="alert">
			<div class="notice" class:index-card={center} class:chrome={center}>
				<p class="error">{what} could not be shown: {messageOf(error)}</p>
				<button class="retry icon-label" onclick={reset}><RotateCcw size={14} /> Try again</button>
			</div>
		</div>
	{/snippet}
</svelte:boundary>

<style>
	.failed {
		font: 13px/1.4 var(--font-ui);
	}

	.center {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
	}

	.center .notice {
		max-width: 420px;
		padding: 16px 18px;
	}

	p {
		margin: 0 0 8px;
	}

	.retry {
		padding: 3px 10px;
		border: 1px solid currentColor;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		font: 500 13px var(--font-ui);
		cursor: pointer;
	}

	.retry:hover {
		color: var(--ink);
	}
</style>
