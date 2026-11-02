<script module lang="ts">
	import type { CardView } from '#lib/api.js';
	import type { Key } from './mindmap.js';
	import { selection } from './selection.svelte.js';

	/** The node a mindmap opens at, when a click on it opened it; else it opens at its root. */
	let start: { card: string; key: Key } | null = null;

	/** Opens a mindmap at one of its nodes. */
	export function openAt(card: CardView, key: Key) {
		start = { card: card.id, key };
		selection.editing = card.id;
	}
</script>

<script lang="ts">
	// An open mindmap: its nodes are selected, added, typed and removed in the map, or its note is
	// typed as Markdown, on an index card. Each change in the map writes the whole note, saved as a
	// card's text is. While it shows its map, the card itself is not selected: no outline, handles or
	// selection bar.
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { readNote } from '#lib/api.js';
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
		identify,
		keyOf,
		MINDMAP_KEYS,
		node,
		normalize,
		parentKey,
		parse,
		setText,
		textOf,
		TYPING_KEYS,
		walk,
		write,
		type MindNode
	} from './mindmap.js';

	/** `onsize` hears its map's size once its note is read. */
	let { card, onsize }: { card: CardView; onsize: (w: number, h: number) => void } = $props();

	/** The note's text, and an ID for each node of its map that stays with the node through each
	 * change, so the map can animate it: a node added grows, one removed draws back, one moved glides. */
	type Version = { text: string; ids: Map<Key, string> };

	let text = $state('');
	const root = $derived(parse(text));
	let ids = $state.raw(new Map<Key, string>());
	let made = 0;
	const fresh = () => `n${++made}`;
	let ready = $state(false);
	/** What it shows, as it opened: it shows that until it closes. */
	const mode = untrack(() => card.view);
	let selected = $state<Key>('');
	/** The node whose text is being typed, and what to put back on Escape: the note before, and the
	 * node selected before, when a node was added to be typed. */
	let typing = $state<{ key: Key; before: Version; back: Key } | null>(null);
	/** What is typed so far, kept apart so the field never reads it from a typing that just ended. */
	let draft = $state('');
	/** The note before each change made since the mindmap opened, and after each undone. */
	let undos: Version[] = [];
	let redos: Version[] = [];

	const now = (): Version => ({ text, ids });

	/** Shows a version of the note: its nodes keep the IDs `known` gives them by key, and the others
	 * get new ones. */
	function show(next: string, known = ids) {
		text = next;
		ids = identify(root, known, fresh);
	}
	let editor: HTMLElement;
	let markdown = $state<HTMLTextAreaElement>();
	let session: ReturnType<typeof editSession> | undefined;

	// A note that fails to load or save says so in the failure notice, as in a card's editor.
	onMount(async () => {
		// Open on its map, the card is no longer selected: its nodes are. It opens at the root, unless a
		// click on another node opened it. On its Markdown, it stays selected, as an index card does.
		if (mode === 'map') selection.clear();
		const opening = start?.card === card.id ? start.key : '';
		start = null;
		// The map as it was drawn closed, at once, so a second click of a double-click finds its node
		// while the note is read again.
		const drawn = card.note ? texts.get(card.note) : undefined;
		if (drawn !== undefined) {
			show(drawn);
			if (at(root, opening)) selected = opening;
		}
		try {
			show(card.note ? await readNote(card.note) : '');
		} catch (e) {
			failure.report(e);
			selection.editing = null;
			return;
		}
		session = editSession(card.id, card.note, text, failure.report, () => (selection.editing = null));
		if (at(root, opening)) selected = opening;
		ready = true;
		await tick();
		if (mode === 'markdown') return markdown?.focus();
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

	/** Changes a copy of the map, then writes the note in its form, the map read again from it. Each
	 * node keeps its ID wherever the change and its form put it. The node the change returns is
	 * selected, else the one selected before. A change is recorded for undo when it changes the note,
	 * but a node added to be typed is not saved until it is typed: `before` is null. */
	function change(edit: (map: MindNode) => MindNode | void, before: Version | null = now()) {
		const map = clone(root);
		const was = new Map<MindNode, string>();
		walk(map, (n, key) => was.set(n, ids.get(key)!));
		const kept = at(map, selected);
		const pick = edit(map) ?? kept;
		normalize(map);
		const key = (pick && keyOf(map, pick)) ?? '';
		const known = new Map<Key, string>();
		walk(map, (n, k) => was.has(n) && known.set(k, was.get(n)!));
		const next = write(map);
		show(next, known);
		if (before && next !== before.text) {
			undos.push(before);
			redos = [];
			session?.input(next);
		}
		selected = at(root, key) ? key : '';
		return selected;
	}

	/** Starts typing a node's text, from `from`. */
	function type(key: Key, from: string, before = now(), back = key) {
		selected = key;
		draft = from;
		typing = { key, before, back };
	}

	/** Keeps what was typed. A node left with no text and no children goes; the root stays. The map
	 * takes the focus back when the keyboard kept it, not when a click elsewhere did. */
	function keep(refocus = true) {
		if (!typing) return;
		const { key, before } = typing;
		const typed = draft;
		typing = null;
		if (refocus) editor.focus();
		change((map) => {
			const n = at(map, key);
			if (!n) return;
			setText(n, typed);
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
		show(before.text, before.ids);
		selected = at(root, back) ? back : '';
	}

	function addChild() {
		const [before, back] = [now(), selected];
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
		const [before, back] = [now(), selected];
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
		redos.push(now());
		step(last);
	}

	function redo() {
		const next = redos.pop();
		if (next === undefined) return;
		undos.push(now());
		step(next);
	}

	function step(to: Version) {
		show(to.text, to.ids);
		session?.input(to.text);
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

	/** Types a node's text, once the note is read: what is typed before would not be saved. */
	function open(key: Key) {
		if (!ready || typing?.key === key) return;
		keep(false);
		const n = at(root, key);
		if (n) type(key, textOf(n));
	}

	/** Leaving the mindmap closes it: a click outside the card, or the focus going elsewhere. */
	function leave(e: FocusEvent) {
		if (!editor.contains(e.relatedTarget as Node | null)) selection.editing = null;
	}

	/** Closes the mindmap and selects its card, as Escape does. */
	function toCard() {
		selection.editing = null;
		selection.only(card.id);
	}

	/** A press on the space around the nodes closes the mindmap and goes on to its card, which it
	 * selects or drags. Presses on a node or a field stay in the map. */
	function press(e: PointerEvent) {
		if ((e.target as Element).closest('[data-node], textarea')) e.stopPropagation();
		else toCard();
	}

	const inMap = () => ready && mode === 'map' && !typing;
	const inTyping = () => typing !== null;

	$effect(() =>
		bindKeys([
			{ ...MINDMAP_KEYS.close, inText: true, when: () => ready && !typing, run: toCard },
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
			{ ...MINDMAP_KEYS.indent, inText: true, when: () => mode === 'markdown', run: indent }
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
	onpointerdown={press}
	ondblclick={(e) => e.stopPropagation()}
	oncontextmenu={(e) => e.stopPropagation()}
>
	{#if mode === 'map'}
		<MindmapMap
			{root}
			{ids}
			halign={card.halign}
			valign={card.valign}
			size={card.scale}
			{selected}
			typing={typing?.key ?? null}
			onpick={(key) => (selected = key)}
			onopen={open}
			onsize={ready ? onsize : undefined}
		>
			{#snippet field()}
				<span class="field" data-text={draft}>
					<textarea rows="1" cols="1" bind:value={draft} use:focus onblur={() => keep(false)}></textarea>
				</span>
			{/snippet}
		</MindmapMap>
	{:else}
		<textarea
			class="markdown"
			bind:this={markdown}
			bind:value={text}
			disabled={!ready}
			style:text-align={card.halign}
			oninput={() => session?.input(text)}
		></textarea>
	{/if}
</div>

<style>
	.editor {
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

	/* Typed as an index card's text is, on the card's stock. */
	.markdown {
		flex: 1;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: inherit;
		font: inherit;
	}
</style>
