<script lang="ts">
	import '../app.css';
	import { setLucideProps } from '@lucide/svelte/context';
	import favicon from '#lib/assets/favicon.svg';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import FailureNotice from '#lib/chrome/FailureNotice.svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { failure } from '#lib/failure.svelte.js';
	import { interfaceSize } from '#lib/interfaceSize.svelte.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Every icon in the app is a Lucide icon at this size, drawn in the color of its text.
	setLucideProps({ size: 16 });

	$effect(() => {
		document.documentElement.dataset.theme = theme.id;
	});

	$effect(() => interfaceSize.use(data.interfaceSize));
	$effect(() => {
		document.documentElement.style.setProperty('--ui-scale', String(interfaceSize.percent / 100));
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

	// A command that fails from a click or a key, with nothing to catch it, says so.
	$effect(() => {
		const onrejection = (e: PromiseRejectionEvent) => {
			e.preventDefault();
			failure.report(e.reason);
		};
		addEventListener('unhandledrejection', onrejection);
		return () => removeEventListener('unhandledrejection', onrejection);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Tooltip.Provider delayDuration={300}>
	<!-- The last resort, for a part with no boundary of its own: the vault's chrome, the picker. -->
	<ErrorBoundary what="This screen" center>
		{@render children()}
	</ErrorBoundary>
	<FailureNotice />
</Tooltip.Provider>
