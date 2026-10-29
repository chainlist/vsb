import type { HandleClientError } from '@sveltejs/kit/hooks';

// Command errors are plain strings from the backend: show them instead of "Internal Error", and the
// app's own errors by their message. The error page and every error boundary show what this returns.
export const handleError: HandleClientError = ({ kind, error }) =>
	kind === 'unknown' ? { message: error instanceof Error ? error.message : String(error) } : undefined;
