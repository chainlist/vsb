# Visual Second Brain

A local-first, canvas-based knowledge app. The design is in [specs.md](specs.md).

Tauri 2 (Rust) with SvelteKit 3 and Svelte 5, built as a static single-page app.

## Developing

```sh
npm install
npm run tauri dev
```

## Checks

```sh
npm run check
cd src-tauri && cargo test
```
