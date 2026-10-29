<script lang="ts">
	import { vaultHome } from '#lib/api.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Where the vault lives, in its backend's words: asked again after its button. */
	let home = $derived(data.home);
	let error = $state('');

	async function act(run: () => Promise<void>) {
		error = '';
		try {
			await run();
			home = await vaultHome();
		} catch (e) {
			error = String(e);
		}
	}
</script>

<fieldset>
	<legend>This vault</legend>
	<dl>
		<div>
			<dt>Name</dt>
			<dd>{data.vault.name}</dd>
		</div>
		<div>
			<dt>Location</dt>
			<dd class="place">{home.place}</dd>
		</div>
	</dl>
	<p class="hint">{home.about}</p>
	{#if home.action}
		{@const run = home.action.run}
		<Button variant="outline" onclick={() => act(run)}>{home.action.label}</Button>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}
</fieldset>

<style>
	dl {
		margin: 14px 0 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 100px minmax(0, 1fr);
		gap: 12px;
		padding: 7px 0;
		border-top: 1px solid var(--border);
	}

	dt {
		color: var(--ink-soft);
	}

	dd {
		margin: 0;
		font-weight: 500;
	}

	/* A folder's path breaks anywhere rather than run past the sheet. */
	.place {
		overflow-wrap: anywhere;
	}

	.hint {
		margin: 12px 0 16px;
	}
</style>
