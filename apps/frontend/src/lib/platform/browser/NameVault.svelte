<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	// Where the desktop asks for a folder, the browser asks for a name: a vault lives in the browser,
	// found again by its name. An existing name opens that vault.
	let { done }: { done: (name: string | null) => void } = $props();

	let open = $state(true);
	let name = $state('');
	const create = () => name.trim() && done(name.trim());
</script>

<Dialog.Root bind:open onOpenChange={(next) => next || done(null)}>
	<Dialog.Content class="chrome sm:max-w-md">
		<form
			class="grid gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				create();
			}}
		>
			<Dialog.Header>
				<Dialog.Title>Name your vault</Dialog.Title>
				<Dialog.Description>It is kept in this browser. A name you already use opens that vault.</Dialog.Description>
			</Dialog.Header>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
				aria-label="Vault name"
				placeholder="My vault"
				autofocus
				bind:value={name}
			/>
			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={!name.trim()}>Open</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
