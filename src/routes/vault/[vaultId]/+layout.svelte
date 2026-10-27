<script lang="ts">
	import { resolve } from '$app/paths';
	import Settings from '@lucide/svelte/icons/settings';
	import Canvas from '#lib/canvas/Canvas.svelte';
	import { theme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The vault's own theme while it is open, the default again once it closes.
	$effect(() => {
		theme.use(data.theme);
		return () => theme.use(null);
	});
</script>

<!-- The canvas stays mounted while panels open and close as child routes. -->
{#key data.vault.id}
	<Canvas contents={data.contents} />
{/key}

<nav class="bar index-card">
	<a href={resolve('/')}>Vaults</a>
	<span class="sep">/</span>
	<span>{data.vault.name}</span>
	<a
		class="settings"
		href={resolve('/vault/[vaultId]/settings', { vaultId: data.vault.id })}
		aria-label="Settings"
		title="Settings"
	>
		<Settings />
	</a>
</nav>

{@render children()}

<style>
	.bar {
		position: fixed;
		top: 14px;
		left: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		font-size: 14px;
	}

	a {
		text-decoration: none;
	}

	.sep {
		color: var(--ink-soft);
	}

	.settings {
		display: flex;
		margin-left: 4px;
		padding-left: 12px;
		border-left: 1px solid var(--border);
	}
</style>
