<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ErrorBoundary from '#lib/chrome/ErrorBoundary.svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { bindKeys } from '#lib/keys.js';
	import { PANEL_KEYS, PANELS } from '#lib/panel/panels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let el = $state<HTMLElement | null>(null);
	const panel = $derived(PANELS.find((p) => p.route === page.route.id)!);
	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	// Beside the canvas, which keeps working and keeps its keys: Escape closes the panel only while
	// the focus is in it.
	$effect(() =>
		bindKeys([
			{ ...PANEL_KEYS.close, inText: true, when: () => !!el?.contains(document.activeElement), run: () => goto(canvas) }
		])
	);
</script>

<!-- Open while its route is: closing it goes back to the canvas. Not modal, so notes can be dragged
     out of it onto the canvas: no overlay, and the focus and clicks may leave it without closing
     it. The sheet's own Escape would close it wherever the focus is. -->
<Sheet.Root
	bind:open={
		() => true,
		(open) => {
			if (!open) goto(canvas);
		}
	}
>
	<!-- The search field takes the focus itself; the tray takes none. -->
	<Sheet.Content
		bind:ref={el}
		data-beside-zones
		class="chrome w-(--panel) gap-0 sm:max-w-none"
		showOverlay={false}
		trapFocus={false}
		preventScroll={false}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<!-- Its empty space moves the window, as the band along the window's top does, which the sheet
		     covers. -->
		<Sheet.Header class="border-b" data-tauri-drag-region>
			<Sheet.Title class="icon-label"><panel.icon /> {panel.name}</Sheet.Title>
		</Sheet.Header>
		<ErrorBoundary what="This panel">
			{@render children()}
		</ErrorBoundary>
	</Sheet.Content>
</Sheet.Root>

<style>
	/* The sheet's close button, left of the window's buttons over its top-right corner. The sheet is
	   drawn at the interface size; they are not. */
	:global([data-slot='sheet-content'] > [data-dialog-close]) {
		inset-inline-end: calc(1rem + var(--window-buttons) / var(--ui-scale, 1));
	}
</style>
