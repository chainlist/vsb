# Scree

A local-first, canvas-based knowledge app. The design is in [specs.md](specs.md).

Tauri 2 (Rust) with SvelteKit 3 and Svelte 5, built as a static single-page app.

## Layout

A pnpm workspace:

- `apps/desktop`: the Tauri app (Rust)
- `apps/frontend`: the SvelteKit app, built for the desktop and for the web
- `apps/site`: the presentation site
- `tools/bench`: timings of both platforms

## Developing

With [pnpm](https://pnpm.io):

```sh
pnpm install
pnpm tauri dev
```

## Checks

```sh
pnpm check
cd apps/desktop && cargo test
```
