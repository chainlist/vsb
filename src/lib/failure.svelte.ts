// What last failed: an edit, a save, a command. One notice over everything shows it
// (#lib/chrome/FailureNotice.svelte) until it is closed or the next failure takes its place.

/** What an error says: its message (SvelteKit hands a boundary the `{ message }` the client hook
 * shaped), or itself, for a command's plain string. */
export const messageOf = (error: unknown) =>
	typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);

class Failure {
	message = $state('');

	/** Shows what went wrong, and logs all of it for the developer console. */
	report = (error: unknown) => {
		console.error(error);
		this.message = messageOf(error);
	};

	close() {
		this.message = '';
	}
}

export const failure = new Failure();
