import { deviceInterfaceSize } from '#lib/api.js';
import type { LayoutLoad } from './$types';

// Tauri has no Node server: the app is a static single-page app.
export const ssr = false;

export const load: LayoutLoad = async () => ({ interfaceSize: await deviceInterfaceSize() });
