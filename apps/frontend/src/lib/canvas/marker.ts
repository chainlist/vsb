// Markers: what zoomed out stands for something too small to draw, at the same size on screen at
// any zoom. A cluster's marker sits at the middle of its cards; a zone smaller than a marker is
// drawn as one, centered on it.
import type { Frame } from '#lib/api.js';
import { SvelteMap } from 'svelte/reactivity';
import { camera } from './camera.svelte.js';
import { items } from './items.svelte.js';

/** A marker's size on screen, in pixels. A zone's marker is as wide as its name, up to twice this. */
export const MARKER = { w: 96, h: 32 };

/** The width on screen of each zone marker drawn, by zone. */
export const zoneMarkers = new SvelteMap<string, number>();

/** Whether a zone is drawn as a marker: collapsed, and smaller on screen than a marker. */
export function asMarker(zone: Frame) {
	return items.collapsed && (zone.w * camera.zoom < MARKER.w || zone.h * camera.zoom < MARKER.h);
}

/** Where a marker `width` pixels wide, centered on this box, lies in the world. */
export function markerAt(box: Frame, width = MARKER.w): Frame {
	const w = width / camera.zoom;
	const h = MARKER.h / camera.zoom;
	return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
