<script lang="ts">
	import '../../../src/lib/themes/studio.css';
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { NAME, REPO } from '#lib/app.js';
	import mark from '#lib/mark.svg';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={mark} type="image/svg+xml" />
</svelte:head>

{#snippet links()}
	<a href="{resolve('/download')}/">Download</a>
	<!-- The web app is another site beside this one: the browser loads it, not this site's router. -->
	<a href="{resolve('/')}web/" rel="external">Open in browser</a>
	<a href="https://github.com/{REPO}">Source</a>
{/snippet}

<header class="wrap">
	<a class="brand" href={resolve('/')}><img src={mark} alt="" width="28" height="28" />{NAME}</a>
	<nav aria-label="Site">{@render links()}</nav>
</header>
<main>{@render children()}</main>
<footer class="wrap">
	<p class="brand"><img src={mark} alt="" width="22" height="22" />{NAME}</p>
	<nav aria-label="Footer">{@render links()}</nav>
</footer>

<style>
	/* The header and footer, like the app's chrome: small and out of the way. */
	header,
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
	}

	header {
		padding-block: 20px;
	}

	footer {
		padding-block: 40px 56px;
		font-size: 0.9375rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		font-size: 1.125rem;
		font-weight: 600;
		font-stretch: 90%;
		text-decoration: none;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 20px;
	}

	nav :global(a) {
		color: var(--ink-soft);
		text-decoration: none;
	}

	nav :global(a:hover) {
		color: var(--ink);
		text-decoration: underline;
	}
</style>
