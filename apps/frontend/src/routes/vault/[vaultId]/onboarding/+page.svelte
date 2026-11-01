<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { setVaultEdgeStyle, setVaultOnboarded, setVaultTheme, type EdgeStyle as Style, type Frame } from '#lib/api.js';
	import EdgeLine from '#lib/canvas/EdgeLine.svelte';
	import EdgeStyle from '#lib/canvas/EdgeStyle.svelte';
	import { newEdges } from '#lib/canvas/newEdges.svelte.js';
	import { route } from '#lib/canvas/route.js';
	import ThemePicker from '#lib/chrome/ThemePicker.svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { bindKeys } from '#lib/keys.js';
	import { DEFAULT_THEME, theme } from '#lib/theme.svelte.js';
	import type { PageProps } from './$types';

	// What kind of board the vault is: first a theme and a style for new edges together, then either
	// one changed on its own. Each pick applies at once and is kept, as in Settings. However it
	// closes, the onboarding is noted as done in vault.json; Settings > Appearance opens it again.
	let { data }: PageProps = $props();

	type Board = { name: string; look: string; theme: string; style: Style; cards: [string, string] };
	const BOARDS: Board[] = [
		{
			name: 'Engineering',
			look: 'The Studio theme, with curved edges.',
			theme: 'studio',
			style: { shape: 'curved', arrow: 'to', stroke: 'solid' },
			cards: ['Spec', 'Prototype']
		},
		{
			name: 'Investigation',
			look: 'The Investigation board theme, with red thread.',
			theme: 'board',
			style: { shape: 'thread', arrow: 'to', stroke: 'solid' },
			cards: ['Suspect', 'Alibi']
		}
	];
	/** The two cards in a board's preview, joined by its edge. */
	const PAIR: [Frame, Frame] = [
		{ x: 24, y: 34, w: 110, h: 56 },
		{ x: 176, y: 84, w: 110, h: 56 }
	];

	let step = $state<'board' | 'adjust'>('board');
	let error = $state('');
	/** The board the vault's theme and new edges are, if they are one. */
	const board = $derived(BOARDS.find((b) => b.theme === theme.id && b.style.shape === newEdges.style.shape));
	const canvas = $derived(resolve('/vault/[vaultId]', { vaultId: data.vault.id }));

	async function keep(write: () => Promise<void>) {
		error = '';
		try {
			await write();
		} catch (e) {
			error = String(e);
		}
	}

	function pickBoard(b: Board) {
		theme.id = b.theme;
		newEdges.style = b.style;
		keep(async () => {
			await setVaultTheme(b.theme === DEFAULT_THEME ? null : b.theme);
			await setVaultEdgeStyle(b.style);
		});
	}

	function pickTheme(id: string) {
		theme.id = id;
		keep(() => setVaultTheme(id === DEFAULT_THEME ? null : id));
	}

	function restyle(change: Partial<Style>) {
		newEdges.style = { ...newEdges.style, ...change };
		keep(() => setVaultEdgeStyle(newEdges.style));
	}

	async function close() {
		await keep(setVaultOnboarded);
		if (!error) goto(canvas);
	}

	// A modal over the canvas, whose keys are off meanwhile.
	$effect(() => bindKeys([], { modal: true }));
</script>

<!-- Open while its route is. Escape, Close and a click on the wash close it, as Done does. -->
<Dialog.Root
	bind:open={
		() => true,
		(open) => {
			if (!open) close();
		}
	}
>
	<Dialog.Content class="chrome max-h-[90%] w-[min(90%,760px)] max-w-none gap-0 overflow-y-auto p-0 sm:max-w-none">
		<div class="step">
			{#if step === 'board'}
				<Dialog.Title class="title">What kind of board is this?</Dialog.Title>
				<Dialog.Description class="hint">Each brings a theme and a style for the edges you draw.</Dialog.Description>
				<div class="boards">
					{#each BOARDS as b (b.name)}
						{@const line = route(...PAIR, b.style)}
						<label class="option">
							<!-- Two cards on that theme's paper, joined as its edges would join them. -->
							<span class="preview graph-paper" data-theme={b.theme} data-paper={theme.paperIn(b.theme)}>
								<!-- A curved line runs behind its cards, a thread in front of them. -->
								{#if b.style.shape !== 'thread'}
									<EdgeLine route={line} shape={b.style.shape} />
								{/if}
								{#each PAIR as f, i (i)}
									<span class="index-card card" style:left="{f.x}px" style:top="{f.y}px" style:width="{f.w}px" style:height="{f.h}px">
										{b.cards[i]}
									</span>
								{/each}
								{#if b.style.shape === 'thread'}
									<EdgeLine route={line} shape={b.style.shape} />
								{/if}
							</span>
							<span class="name">
								<input type="radio" name="board" checked={board === b} onchange={() => pickBoard(b)} />
								{b.name}
							</span>
							<span class="hint">{b.look}</span>
						</label>
					{/each}
				</div>
				<p class="note">You can change the theme and the default edges separately later, in Settings.</p>
				<footer>
					<button class="button" disabled={!board} onclick={() => (step = 'adjust')}>Next</button>
				</footer>
			{:else}
				<Dialog.Title class="title">Adjust your board</Dialog.Title>
				<Dialog.Description class="hint">Change the theme or the default edges, or keep them as they are.</Dialog.Description>
				<fieldset>
					<legend>Theme</legend>
					<ThemePicker pick={pickTheme} />
				</fieldset>
				<fieldset>
					<legend>Default edges</legend>
					<p class="hint">How the edges you draw look in this vault.</p>
					<div class="styles">
						<EdgeStyle
							style={newEdges.style}
							pick={{ shape: (shape) => restyle({ shape }), arrow: (arrow) => restyle({ arrow }), stroke: (stroke) => restyle({ stroke }) }}
						/>
					</div>
				</fieldset>
				<footer>
					<button class="quiet" onclick={() => (step = 'board')}>Back</button>
					<button class="button" onclick={close}>Done</button>
				</footer>
			{/if}
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.step {
		padding: 24px 28px;
	}

	.step :global(.title) {
		margin: 0 32px 4px 0;
		font: 600 22px/1.2 var(--font-note);
	}

	.step :global(.hint) {
		margin: 0;
		color: var(--ink-soft);
		font-size: 14px;
	}

	.boards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 18px;
		margin: 22px 0 18px;
	}

	.option {
		display: grid;
		gap: 8px;
		cursor: pointer;
	}

	/* --px: what a line's width is measured in, a world pixel on the canvas. */
	.preview {
		--px: 1px;
		position: relative;
		display: block;
		height: 170px;
		overflow: hidden;
		border-radius: var(--radius-control);
		box-shadow: inset 0 0 0 1px var(--border);
	}

	/* In the preview's own accent: the board picked is the one on screen. */
	.option:has(:checked) .preview {
		box-shadow: 0 0 0 2px var(--pen);
	}

	/* Titled near the bottom, clear of a thread's tack and of where it leaves. */
	.card {
		position: absolute;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		box-sizing: border-box;
		padding-bottom: 10px;
		font: 600 14px var(--font-note);
	}

	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
	}

	input {
		margin: 0;
		accent-color: var(--pen);
	}

	.note {
		margin: 0;
		padding: 10px 14px;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--pen) 8%, transparent);
		font-size: 14px;
	}

	fieldset {
		min-width: 0;
		margin: 22px 0 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 12px;
		padding: 0;
		font-weight: 600;
		font-size: 16px;
	}

	fieldset .hint {
		margin: -6px 0 12px;
	}

	.styles {
		display: inline-flex;
		gap: 2px;
		padding: 4px;
		border-radius: var(--radius-control);
		box-shadow: inset 0 0 0 1px var(--border);
	}

	footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 24px;
	}

	.button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.quiet {
		padding: 9px 18px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		box-shadow: inset 0 0 0 1px var(--border);
		color: var(--ink);
		font: 500 15px var(--font-ui);
		cursor: pointer;
	}

	.quiet:hover {
		background: var(--paper);
	}
</style>
