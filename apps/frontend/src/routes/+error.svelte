<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
</script>

<main class="page graph-paper chrome">
	<h1>That did not work</h1>
	<p class="error">{page.error?.message}</p>
	<a class="icon-label" href={resolve('/')}><ArrowLeft /> Back to your vaults</a>
</main>

<style>
	h1 {
		margin: 0 0 12px;
		font: 600 32px/1.2 var(--font-note);
	}
</style>
