<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Settings from '@lucide/svelte/icons/settings';
	import type { VaultEntry } from '#lib/api.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { bindKeys, keyName } from '#lib/keys.js';
	import { PANEL_KEYS } from '#lib/panel/panels.js';

	let { vault }: { vault: VaultEntry } = $props();

	const settings = $derived(resolve('/vault/[vaultId]/settings', { vaultId: vault.id }));

	// From anywhere in the vault, also while typing. Settings bind the same key to close them.
	$effect(() => bindKeys([{ ...PANEL_KEYS.settings, inText: true, run: () => goto(settings) }]));
</script>

<!-- The vault in the top-left corner. Its menu leads back to the vaults, and to settings. -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button {...props} class="vault index-card chrome">
				<span class="mark" aria-hidden="true">{vault.name.slice(0, 1)}</span>
				<span class="name">{vault.name}</span>
				<ChevronDown />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" sideOffset={6} class="chrome min-w-52">
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href={resolve('/')}><ArrowLeftRight /> Switch vault</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href={settings}>
					<Settings /> Settings <kbd class="shortcut">{keyName(PANEL_KEYS.settings.keys[0])}</kbd>
				</a>
			{/snippet}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style>
	.vault {
		position: fixed;
		top: var(--inset);
		left: var(--inset);
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 320px;
		height: 44px;
		padding: 0 12px 0 8px;
		border: none;
		color: var(--ink-soft);
		font: 600 15px var(--font-ui);
		cursor: pointer;
	}

	.vault:hover,
	.vault[data-state='open'] {
		color: var(--ink);
	}

	/* The vault's first letter on the accent: which vault this is, at a glance. */
	.mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-control);
		background: var(--pen);
		color: var(--on-pen);
		font-size: 14px;
		text-transform: uppercase;
	}

	.name {
		overflow: hidden;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	.shortcut {
		margin-left: auto;
	}
</style>
