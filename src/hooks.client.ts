import type { HandleClientError } from '@sveltejs/kit/hooks';

// Command errors are plain strings from the backend: show them instead of "Internal Error".
export const handleError: HandleClientError = ({ kind, error }) =>
	kind === 'unknown' ? { message: String(error) } : undefined;
