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

	// A trackpad pinch comes as a wheel turned with Ctrl held. The canvas zooms on it; anywhere else
	// it would zoom the whole window.
	$effect(() => {
		const onwheel = (e: WheelEvent) => {
			if (e.ctrlKey) e.preventDefault();
		};
		addEventListener('wheel', onwheel, { passive: false });
		return () => removeEventListener('wheel', onwheel);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
