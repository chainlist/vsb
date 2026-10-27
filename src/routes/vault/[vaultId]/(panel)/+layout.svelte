<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { bindKeys } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let el = $state<HTMLElement | null>(null);
	const panel = $derived(PANELS.find((p) => p.route === page.route.id)!);
	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	// Beside the canvas, which keeps working and keeps its keys: Escape closes the panel only while
	// the focus is in it.
	$effect(() =>
		bindKeys([
			{ keys: ['Escape'], inText: true, when: () => !!el?.contains(document.activeElement), run: () => goto(canvas) }
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
		class="gap-0"
		showOverlay={false}
		trapFocus={false}
		preventScroll={false}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<Sheet.Header class="border-b">
			<Sheet.Title class="icon-label"><panel.icon /> {panel.name}</Sheet.Title>
		</Sheet.Header>
		{@render children()}
	</Sheet.Content>
</Sheet.Root>
