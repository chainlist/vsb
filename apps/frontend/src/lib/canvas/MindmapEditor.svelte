<script lang="ts">
	// An open mindmap: its nodes are selected, added, typed and removed in the map, or its note is
	// typed as Markdown. Each change in the map writes the whole note, saved as a card's text is.
	import { onDestroy, onMount, tick } from 'svelte';
	import { readNote, type CardView } from '#lib/api.js';
	import { failure } from '#lib/failure.svelte.js';
	import { bindKeys, isMod } from '#lib/keys.js';
	import { editSession } from './editSession.js';
	import { items } from './items.svelte.js';
	import { texts } from './Mindmap.svelte';
	import MindmapMap from './MindmapMap.svelte';
	import {
		at,
		child,
		clone,
		keyOf,
		MINDMAP_KEYS,
		node,
		normalize,
		parentKey,
		parse,
		setText,
		textOf,
		TYPING_KEYS,
		write,
		type Key,
		type MindNode
	} from './mindmap.js';
	import { selection } from './selection.svelte.js';

	let { card }: { card: CardView } = $props();

	let text = $state('');
	const root = $derived(parse(text));
	let ready = $state(false);
	let mode = $state<'map' | 'text'>('map');
	let selected = $state<Key>('');
	/** The node whose text is being typed, what is typed so far, and what to put back on Escape: the
	 * note's text before, and the node selected before, when a node was added to be typed. */
	let typing = $state<{ key: Key; draft: string; before: string; back: Key } | null>(null);
	/** The note's text before each change made since the mindmap opened, and after each undone. */
	let undos: string[] = [];
	let redos: string[] = [];
	/** The note's text as its Markdown was opened. */
	let opened = '';
	let editor: HTMLElement;
	let markdown = $state<HTMLTextAreaElement>();
	let session: ReturnType<typeof editSession> | undefined;

	// A note that fails to load or save says so in the failure notice, as in a card's editor.
	onMount(async () => {
		try {
			if (card.note) text = await readNote(card.note);
		} catch (e) {
			failure.report(e);
			selection.editing = null;
			return;
		}
		session = editSession(card.id, card.note, text, failure.report, () => (selection.editing = null));
		ready = true;
		await tick();
		editor.focus();
		// An empty mindmap opens with its root ready for typing.
		if (!text.trim()) type('', '');
	});

	// However it closes, what is being typed is kept, then the session finishes: last save, then the
	// blur rules.
	onDestroy(() => {
		keep(false);
		if (card.note) texts.set(card.note, text);
		session?.finish().then(() => items.changed());
	});

	/** Writes the note after a change, recorded for undo unless it is the same. */
	function save(next: string, before = text) {
		text = next;
		if (next === before) return;
		undos.push(before);
		redos = [];
		session?.input(next);
	}

	/** Changes a copy of the map, then writes the note in its form, the map read again from it. The
	 * node the change returns is selected, else the one selected before, wherever its form puts it.
	 * A node added to be typed is not saved until it is typed: `before` is null. */
	function change(edit: (map: MindNode) => MindNode | void, before: string | null = text) {
		const map = clone(root);
		const kept = at(map, selected);
		const pick = edit(map) ?? kept;
		normalize(map);
		const key = (pick && keyOf(map, pick)) ?? '';
		const next = write(map);
		if (before === null) text = next;
		else save(next, before);
		selected = at(root, key) ? key : '';
		return selected;
	}

	/** Starts typing a node's text, from `draft`. */
	function type(key: Key, draft: string, before = text, back = key) {
		selected = key;
		typing = { key, draft, before, back };
	}

	/** Keeps what was typed. A node left with no text and no children goes; the root stays. The map
	 * takes the focus back when the keyboard kept it, not when a click elsewhere did. */
	function keep(refocus = true) {
		if (!typing) return;
		const { key, draft, before } = typing;
		typing = null;
		if (refocus) editor.focus();
		change((map) => {
			const n = at(map, key);
			if (!n) return;
			setText(n, draft);
			const parent = at(map, parentKey(key) ?? '');
			if (!key || !parent || n.title || n.body || n.children.length) return;
			parent.children.splice(parent.children.indexOf(n), 1);
			if (selected === key) return parent;
		}, before);
	}

	/** Puts back what was there before typing, dropping a node just added. */
	function cancel() {
		if (!typing) return;
		const { before, back } = typing;
		typing = null;
		editor.focus();
		text = before;
		selected = at(root, back) ? back : '';
	}

	function addChild() {
		const [before, back] = [text, selected];
		const added = node();
		const key = change((map) => {
			at(map, selected)?.children.push(added);
			return added;
		}, null);
		type(key, '', before, back);
	}

	/** Adds a node after the selected one, or a child of the root, which has no siblings. */
	function addSibling() {
		const parent = parentKey(selected);
		if (parent === undefined) return addChild();
		const [before, back] = [text, selected];
		const added = node();
		const key = change((map) => {
			const siblings = at(map, parent)!.children;
			siblings.splice(siblings.indexOf(at(map, selected)!) + 1, 0, added);
			return added;
		}, null);
		type(key, '', before, back);
	}

	/** Removes the selected node with its children, selecting the node after it, or before, or its
	 * parent. */
	function remove() {
		const parent = parentKey(selected);
		if (parent === undefined) return;
		change((map) => {
			const siblings = at(map, parent)!.children;
			const i = siblings.indexOf(at(map, selected)!);
			siblings.splice(i, 1);
			return siblings[i] ?? siblings[i - 1] ?? at(map, parent);
		});
	}

	/** Selects the parent, the first child, or the sibling above or below. */
	function go(key: string) {
		const parent = parentKey(selected);
		const i = Number(selected.split('.').at(-1));
		const to =
			key === 'ArrowLeft'
				? parent
				: key === 'ArrowRight'
					? child(selected, 0)
					: parent === undefined
						? undefined
						: child(parent, key === 'ArrowUp' ? i - 1 : i + 1);
		if (to !== undefined && at(root, to)) selected = to;
	}

	function undo() {
		const last = undos.pop();
		if (last === undefined) return;
		redos.push(text);
		step(last);
	}

	function redo() {
		const next = redos.pop();
		if (next === undefined) return;
		undos.push(text);
		step(next);
	}

	function step(to: string) {
		text = to;
		session?.input(to);
		if (!at(root, selected)) selected = '';
	}

	/** Shows the note's Markdown, kept as one change for undo once the map is back. The focus moves
	 * before the field holding it goes, which would close the mindmap. */
	async function toText() {
		if (mode === 'text') return;
		keep();
		opened = text;
		mode = 'text';
		await tick();
		markdown?.focus();
	}

	function toMap() {
		if (mode === 'map') return;
		if (text !== opened) {
			undos.push(opened);
			redos = [];
		}
		editor.focus();
		mode = 'map';
		if (!at(root, selected)) selected = '';
	}

	/** In the Markdown, Tab indents by two spaces, so a list item nests. */
	function indent() {
		if (!markdown || document.execCommand('insertText', false, '  ')) return;
		markdown.setRangeText('  ', markdown.selectionStart, markdown.selectionEnd, 'end');
		markdown.dispatchEvent(new Event('input', { bubbles: true }));
	}

	/** A character typed on the map starts the selected node's text over with it. */
	function typeOver(e: KeyboardEvent) {
		if (!inMap() || e.target !== editor || e.key.length !== 1 || isMod(e) || e.altKey) return;
		e.preventDefault();
		e.stopPropagation();
		type(selected, e.key);
	}

	function open(key: Key) {
		if (typing?.key === key) return;
		keep(false);
		const n = at(root, key);
		if (n) type(key, textOf(n));
	}

	/** Leaving the mindmap closes it: a click outside the card, or the focus going elsewhere. */
	function leave(e: FocusEvent) {
		if (!editor.contains(e.relatedTarget as Node | null)) selection.editing = null;
	}

	const inMap = () => ready && mode === 'map' && !typing;
	const inTyping = () => typing !== null;

	$effect(() =>
		bindKeys([
			{ ...TYPING_KEYS.keep, inText: true, when: inTyping, run: () => keep() },
			{ ...TYPING_KEYS.child, inText: true, when: inTyping, run: () => (keep(), addChild()) },
			{ ...TYPING_KEYS.cancel, inText: true, when: inTyping, run: cancel },
			{ ...MINDMAP_KEYS.child, inText: true, when: inMap, run: addChild },
			{ ...MINDMAP_KEYS.sibling, inText: true, when: inMap, run: addSibling },
			{ ...MINDMAP_KEYS.type, inText: true, when: inMap, run: () => open(selected) },
			{ ...MINDMAP_KEYS.remove, inText: true, when: inMap, run: remove },
			{ ...MINDMAP_KEYS.undo, inText: true, when: inMap, run: undo },
			{ ...MINDMAP_KEYS.redo, inText: true, when: inMap, run: redo },
			...MINDMAP_KEYS.move.keys.map((key) => ({ keys: [key], inText: true, when: inMap, run: () => go(key) })),
			{ ...MINDMAP_KEYS.indent, inText: true, when: () => mode === 'text', run: indent }
		])
	);

	function focus(field: HTMLTextAreaElement) {
		field.focus();
		field.setSelectionRange(field.value.length, field.value.length);
	}
</script>

<!-- The canvas's keys are off in here (data-own-keys); the map's are bound above. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<div
	class="editor"
	tabindex="-1"
	data-own-keys
	bind:this={editor}
	onkeydown={typeOver}
	onfocusout={leave}
	onpointerdown={(e) => e.stopPropagation()}
	ondblclick={(e) => e.stopPropagation()}
	oncontextmenu={(e) => e.stopPropagation()}
>
	{#if mode === 'map'}
		<MindmapMap
			{root}
			halign={card.halign}
			valign={card.valign}
			{selected}
			typing={typing?.key ?? null}
			onpick={(key) => (selected = key)}
			onopen={open}
		>
			{#snippet field()}
				{#if typing}
					<span class="field" data-text={typing.draft}>
						<textarea rows="1" cols="1" bind:value={typing.draft} use:focus onblur={() => keep(false)}></textarea>
					</span>
				{/if}
			{/snippet}
		</MindmapMap>
	{:else}
		<textarea class="markdown" bind:this={markdown} bind:value={text} oninput={() => session?.input(text)}></textarea>
	{/if}
	<!-- Pressing them keeps the focus where it is, so the mindmap stays open. -->
	<div class="modes">
		<button aria-pressed={mode === 'map'} onpointerdown={(e) => e.preventDefault()} onclick={toMap}>Map</button>
		<button aria-pressed={mode === 'text'} onpointerdown={(e) => e.preventDefault()} onclick={toText}>Markdown</button>
	</div>
</div>

<style>
	.editor {
		position: relative;
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-height: 0;
		outline: none;
	}

	/* What is typed grows its node: the hidden copy after it sizes the cell both share. */
	.field {
		display: grid;
	}

	.field::after {
		content: attr(data-text) ' ';
		visibility: hidden;
		white-space: pre-wrap;
	}

	.field::after,
	.field textarea {
		grid-area: 1 / 1;
		font: inherit;
		overflow-wrap: anywhere;
	}

	.field textarea {
		width: 100%;
		min-width: 2ch;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		resize: none;
		overflow: hidden;
		background: transparent;
		color: inherit;
	}

	/* On the paper's plain color, so the grid never runs under the text. */
	.markdown {
		flex: 1;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		resize: none;
		background: var(--paper);
		color: inherit;
		font: 13px/1.5 var(--font-mono, ui-monospace, monospace);
	}

	/* In the card's top right corner, over its padding. */
	.modes {
		position: absolute;
		top: -8px;
		right: -10px;
		display: flex;
		padding: 2px;
		border-radius: var(--radius-control);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--border);
		font: 500 11px var(--font-ui);
	}

	.modes button {
		padding: 2px 8px;
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.modes button[aria-pressed='true'] {
		background: var(--card);
		box-shadow: var(--lift);
		color: var(--ink);
	}
</style>
