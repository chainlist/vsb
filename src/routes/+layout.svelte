<script lang="ts">
	import '../app.css';
	import { setLucideProps } from '@lucide/svelte/context';
	import favicon from '#lib/assets/favicon.svg';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Every icon in the app is a Lucide icon at this size, drawn in the color of its text.
	setLucideProps({ size: 16 });

	$effect(() => {
		document.documentElement.dataset.theme = theme.id;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
