<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import { chooseVault, vaultPicker } from '#lib/api.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let error = $state('');

	async function choose() {
		try {
			const vault = await chooseVault();
			if (vault) await goto(resolve('/vault/[vaultId]', { vaultId: vault.id }));
		} catch (e) {
			error = String(e);
		}
	}
</script>

<main class="page graph-paper chrome">
	<h1>Visual Second Brain</h1>
	<p class="lede">{vaultPicker.lede}</p>
	<button class="button" onclick={choose}><FolderOpen /> {vaultPicker.action}</button>
	{#if error}
		<p class="error">{error}</p>
	{/if}
	{#if data.vaults.length}
		<h2>Recent vaults</h2>
		<ul>
			{#each data.vaults as vault (vault.id)}
				<li>
					<a class="index-card" href={resolve('/vault/[vaultId]', { vaultId: vault.id })}>
						<span class="index-card-title">{vault.name}</span>
						<span class="path">{vault.path}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	h1 {
		margin: 0 0 12px;
		font: 600 44px/1.1 var(--font-note);
		letter-spacing: -0.01em;
	}

	.lede {
		margin: 0 0 28px;
		color: var(--ink-soft);
		font-size: 17px;
	}

	h2 {
		margin: 56px 0 14px;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink-soft);
	}

	ul {
		display: grid;
		/* minmax(0, ...) lets a long path shrink and ellipsize instead of widening the page. */
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: block;
		padding: 12px 14px 14px;
		color: inherit;
		text-decoration: none;
	}

	a:hover .index-card-title {
		color: var(--pen);
	}

	.path {
		display: block;
		overflow: hidden;
		color: var(--ink-soft);
		font-size: 13px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
