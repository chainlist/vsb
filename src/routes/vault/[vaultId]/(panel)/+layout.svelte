<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import X from '@lucide/svelte/icons/x';
	import { bindKeys } from '#lib/keys.js';
	import { PANELS } from '#lib/panel/panels.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let el: HTMLElement;
	const panel = $derived(PANELS.find((p) => p.route === page.route.id)!);
	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	// Beside the canvas, which keeps working and keeps its keys: Escape closes the panel only while
	// the focus is in it.
	$effect(() =>
		bindKeys([
			{ keys: ['Escape'], inText: true, when: () => el.contains(document.activeElement), run: () => goto(canvas) }
		])
	);
</script>

<aside class="panel index-card" bind:this={el} aria-label={panel.name}>
	<header>
		<h2 class="icon-label"><panel.icon /> {panel.name}</h2>
		<a class="close" href={canvas} aria-label="Close {panel.name}" title="Close (Esc)"><X /></a>
	</header>
	{@render children()}
</aside>

<style>
	.panel {
		position: fixed;
		top: 14px;
		right: 14px;
		bottom: 14px;
		display: flex;
		flex-direction: column;
		width: min(360px, calc(100vw - 28px));
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 8px 8px 16px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}

	.close {
		display: flex;
		padding: 6px;
		border-radius: var(--radius-control);
		color: var(--ink-soft);
	}

	.close:hover {
		background: var(--paper);
		color: var(--ink);
	}
</style>
