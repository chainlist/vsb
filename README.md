# Visual Second Brain

A local-first, canvas-based knowledge app. The design is in [specs.md](specs.md).

Tauri 2 (Rust) with SvelteKit 3 and Svelte 5, built as a static single-page app.

## Developing

With [pnpm](https://pnpm.io):

```sh
pnpm install
pnpm tauri dev
```

## Checks

```sh
pnpm check
cd src-tauri && cargo test
```
