<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { createCards } from './actions.js';
	import { parse } from './batch.js';
	import { batchDialog } from './batchDialog.svelte.js';
	import BatchPreview from './BatchPreview.svelte';

	const EXAMPLE = 'Competitor scan -> Price tiers --> Customer interviews\nCompetitor scan .-> Pricing risks\nOpen questions';
	const ARROWS: [string, string][] = [
		['->', 'arrow'],
		['<-', 'reversed'],
		['<->', 'both ends'],
		['-->', 'dashed'],
		['.->', 'dotted'],
		['=>', 'double']
	];

	// Kept while the dialog is closed without creating anything, so it comes back when it reopens.
	let text = $state('');
	let field = $state<HTMLTextAreaElement | null>(null);

	const plan = $derived(parse(text));
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	// Over the canvas: its keys are off while the dialog is open.
	$effect(() => {
		if (batchDialog.at) return bindKeys([{ keys: ['Mod+Enter'], inText: true, run: create }], { modal: true });
	});

	function create() {
		const at = batchDialog.at;
		if (!at || !plan.texts.length) return;
		createCards(text, at);
		text = '';
		batchDialog.close();
	}
</script>

<Dialog.Root
	bind:open={
		() => batchDialog.at !== null,
		(open) => {
			if (!open) batchDialog.close();
		}
	}
>
	<!-- No taller than the window: the preview map gives way first, then the dialog scrolls. -->
	<Dialog.Content
		class="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto sm:max-w-2xl"
		onOpenAutoFocus={(e) => {
			e.preventDefault();
			field?.focus();
		}}
	>
		<Dialog.Header>
			<Dialog.Title>New cards</Dialog.Title>
			<Dialog.Description>
				One card per line, joined by arrows:
				{#each ARROWS as [arrow, meaning] (arrow)}
					<span class="arrow"><code>{arrow}</code> {meaning}</span>
				{/each}
			</Dialog.Description>
		</Dialog.Header>
		<Textarea
			bind:ref={field}
			bind:value={text}
			placeholder={EXAMPLE}
			spellcheck="false"
			aria-label="Cards, one per line"
			class="max-h-[30vh] min-h-28 font-[family-name:var(--font-note)] whitespace-pre [font-variant-ligatures:none]"
		/>
		<BatchPreview {plan} />
		<Dialog.Footer class="items-center">
			<span class="summary">{plural(plan.texts.length, 'card')}, {plural(plan.edges.length, 'edge')}</span>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button disabled={!plan.texts.length} title="Create ({MOD_NAME}+Enter)" onclick={create}>Create</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Some fonts draw `->` as an arrow: the legend shows what is typed. */
	code {
		color: var(--ink);
		font: 600 13px var(--font-ui);
		font-variant-ligatures: none;
	}

	.arrow {
		margin-left: 10px;
		white-space: nowrap;
	}

	.summary {
		margin-right: auto;
		color: var(--ink-soft);
		font-size: 13px;
	}
</style>
