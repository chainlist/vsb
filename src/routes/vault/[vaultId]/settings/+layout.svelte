<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Palette from '@lucide/svelte/icons/palette';
	import X from '@lucide/svelte/icons/x';
	import { bindKeys } from '#lib/keys.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** One child route per tab. */
	const tabs = [{ route: '/vault/[vaultId]/settings/appearance', name: 'Appearance', icon: Palette }] as const;

	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	// A full page over the canvas, which stays mounted underneath: its keys are off meanwhile.
	$effect(() => bindKeys([{ keys: ['Escape'], inText: true, run: () => goto(canvas) }], { modal: true }));
</script>

<div class="settings graph-paper">
	<div class="sheet index-card">
		<header>
			<h1>Settings</h1>
			<a class="close" href={canvas} aria-label="Close settings" title="Close (Esc)"><X size={20} /></a>
		</header>
		<nav aria-label="Settings">
			{#each tabs as tab (tab.route)}
				<a
					class="icon-label"
					href={resolve(tab.route, { vaultId: data.vault.id })}
					aria-current={page.route.id === tab.route ? 'page' : undefined}
				>
					<tab.icon />
					{tab.name}
				</a>
			{/each}
		</nav>
		<section>
			{@render children()}
		</section>
	</div>
</div>

<style>
	.settings {
		position: fixed;
		inset: 0;
		overflow: auto;
		padding: 10vh 24px 48px;
	}

	.sheet {
		display: grid;
		grid-template-columns: 180px minmax(0, 1fr);
		grid-template-rows: auto 1fr;
		max-width: 820px;
		min-height: 440px;
		margin: 0 auto;
	}

	header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 16px 24px;
		border-bottom: 1px solid var(--border);
	}

	h1 {
		margin: 0;
		font: 600 22px/1.2 var(--font-note);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 12px;
		border-right: 1px solid var(--border);
	}

	a {
		padding: 6px 12px;
		border-radius: var(--radius-control);
		color: var(--ink-soft);
		font-weight: 500;
		text-decoration: none;
	}

	a:hover {
		background: var(--paper);
		color: var(--ink);
	}

	[aria-current='page'],
	[aria-current='page']:hover {
		background: color-mix(in srgb, var(--pen) 10%, transparent);
		color: var(--pen);
	}

	.close {
		display: flex;
		padding: 6px;
	}

	section {
		padding: 20px 28px 28px;
	}

	@media (max-width: 640px) {
		.sheet {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto 1fr;
		}

		nav {
			flex-direction: row;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
