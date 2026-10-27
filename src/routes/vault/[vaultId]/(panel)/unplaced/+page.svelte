<script lang="ts">
	import { unplacedNotes } from '#lib/api.js';
	import NoteList from '#lib/panel/NoteList.svelte';
</script>

<!-- Notes with no card: drag one onto the canvas to place it. -->
<NoteList load={unplacedNotes} empty="Every note is on the canvas." />
