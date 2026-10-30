// The browser's stand-in for the desktop's folder dialog, mounted by the backend itself so no page
// needs to know which platform it runs on.
import { mount, unmount } from 'svelte';
import NameVault from './NameVault.svelte';

/** The name typed, or null when the dialog is cancelled. */
export function askName() {
	return new Promise<string | null>((resolve) => {
		const dialog = mount(NameVault, {
			target: document.body,
			props: {
				done: (name: string | null) => {
					void unmount(dialog);
					resolve(name);
				}
			}
		});
	});
}
