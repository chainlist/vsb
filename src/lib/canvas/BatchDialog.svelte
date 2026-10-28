<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { planLinks, type LinkPlan } from '#lib/api.js';
	import { bindKeys, MOD_NAME } from '#lib/keys.js';
	import { parse } from './batch.js';
	import { createCards, editCards } from './batchApply.js';
	import { batchDialog } from './batchDialog.svelte.js';
	import { sketchEdit, sketchNew, wanted } from './batchEdit.js';
	import BatchPreview from './BatchPreview.svelte';
	import Directions from './Directions.svelte';

	const EXAMPLE = 'Competitor scan -> Price tiers --> Customer interviews\nCompetitor scan .-> Pricing risks\nOpen questions';
	const ARROWS: [string, string][] = [
		['->', 'arrow'],
		['<-', 'reversed'],
		['<->', 'both ends'],
		['-->', 'dashed'],
		['.->', 'dotted'],
		['=>', 'double'],
		['---', 'no heads']
	];
	// New cards only: kept while the dialog is closed without creating anything, so it comes back when
	// it reopens.
	let draft = $state('');
	let field = $state<HTMLTextAreaElement | null>(null);

	/** Opened on cards of the canvas, the text edits the edges between them. */
	const edit = $derived(batchDialog.edit);
	const text = $derived(edit ? edit.text : draft);
	const plan = $derived(parse(text));
	/** What the text does to those edges, as the last check found. */
	let done = $state<LinkPlan | null>(null);
	const sketch = $derived(edit ? sketchEdit(plan, edit, batchDialog.direction, done) : sketchNew(plan, batchDialog.direction));
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const summary = $derived.by(() => {
		if (!edit) return `${plural(plan.texts.length, 'card')}, ${plural(plan.edges.length, 'edge')}`;
		const fresh = sketch.cards.filter((c) => c.mark === 'new').length;
		const counts = [
			fresh && plural(fresh, 'new card'),
			done?.created.length && plural(done.created.length, 'new edge'),
			done?.restyled.length && `${done.restyled.length} changed`,
			done?.removed.length && `${done.removed.length} removed`
		];
		return counts.filter(Boolean).join(', ') || 'No change';
	});

	// Checked by the backend as it is typed, without writing anything.
	$effect(() => {
		if (!edit) return;
		const { links } = wanted(plan, edit);
		let live = true;
		planLinks(edit.scope.cards.map((c) => c.id), links).then((found) => live && (done = found));
		return () => (live = false);
	});

	// Over the canvas: its keys are off while the dialog is open.
	$effect(() => {
		if (batchDialog.at) return bindKeys([{ keys: ['Mod+Enter'], inText: true, run: create }], { modal: true });
	});

	function create() {
		const at = batchDialog.at;
		if (edit) editCards(edit, text, batchDialog.direction);
		else if (at && plan.texts.length) {
			createCards(text, at, batchDialog.direction);
			draft = '';
		} else return;
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
			<Dialog.Title>{edit ? 'Edit edges, add cards' : 'New cards'}</Dialog.Title>
			<Dialog.Description>
				{#if edit}
					The text is the truth for the edges between these cards: delete a line to remove its edge. A
					new name is a new card.
				{/if}
				One card per line, joined by arrows:
				{#each ARROWS as [arrow, meaning] (arrow)}
					<span class="arrow"><code>{arrow}</code> {meaning}</span>
				{/each}
			</Dialog.Description>
		</Dialog.Header>
		<Textarea
			bind:ref={field}
			bind:value={() => text, (value) => (edit ? (edit.text = value) : (draft = value))}
			placeholder={EXAMPLE}
			spellcheck="false"
			aria-label="Cards, one per line"
			class="max-h-[30vh] min-h-28 font-[family-name:var(--font-note)] whitespace-pre [font-variant-ligatures:none]"
		/>
		<BatchPreview {sketch} />
		<Dialog.Footer class="items-center">
			<Directions bind:direction={batchDialog.direction} />
			<span class="summary">{summary}</span>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			{#if edit}
				<Button title="Apply ({MOD_NAME}+Enter)" onclick={create}>Apply</Button>
			{:else}
				<Button disabled={!plan.texts.length} title="Create ({MOD_NAME}+Enter)" onclick={create}>Create</Button>
			{/if}
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
