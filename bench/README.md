# Bench

Times the hot paths at the level of `#lib/api`, the platform layer, inside the app's own page, so a
number covers the whole call: the layer, the transport (Tauri's IPC, or none in the browser) and the
backend.

## The vault

`vault.mjs` generates the same vault on every run: 300 zones nested three deep (60 on the canvas,
each holding three, one of which holds one more), 8,000 cards (4,000 in zones, 4,000 loose in 100
clumps of 40), 5,000 notes (4,500 on cards, 500 unplaced) and 6,000 edges (chains inside each zone
and clump, links between zones, and between clumps and zones). It spans about 50,000 by 46,000 world
units.

- Desktop: `node bench/write-vault.mjs <folder>` writes it as vault files.
- Browser: `generate-browser.mjs` builds it in the page through `#lib/api`, as the app would.

## The scenarios

`scenarios.mjs`, run in the page:

| Name | What |
|---|---|
| open | `openVault` then `canvasContents`, as the vault route's load does; 10 times |
| open (cold) | the same, once, on a vault never opened (desktop: no index yet) |
| viewport 100%, 40% | `queryViewport` for a 1600 by 1000 window panned a quarter window per step across the zones and the loose clumps, on the area the canvas queries (the window grown by half its size on each side) |
| viewport 20%, 5%, clusters | the same zoomed out, with the cell size the canvas asks for: clusters and bundles |
| move card | `moveCards` for one card and back, 20 cards in zones and 20 loose |
| search | `search` for every prefix of six phrases, as typed, three times |
| zone rows | `zoneRows` for the outermost zones and five opened zones, ten times |
| zone matches | `zoneMatches` for every prefix of three words, three times |
| unplaced page | `unplacedNotes`, ten pages of 50, five times |

`run.mjs` reports p50 and p95 (nearest rank) and the maximum per scenario, and writes them to
`results/<label>.json`.

## Running it

The desktop runs in its own copy of the app, never Kevin's: its own app ID (so its own data folder),
Vite port and WebView2 debug port, and a release build of the Rust (the shipped speed). From the
repo root, in PowerShell, with the vault written to `<vault>`:

```powershell
# tauri.bench.json:
# {"identifier": "com.visualsecondbrain.bench", "build": {"devUrl": "http://localhost:5174", "beforeDevCommand": "pnpm dev --port 5174"}}
# %LOCALAPPDATA%\com.visualsecondbrain.bench\vaults.json lists <vault> by its ID.
$env:CARGO_TARGET_DIR = "<short temp folder>"   # the MSVC linker fails on long paths
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9224"
pnpm tauri dev --release --config tauri.bench.json
node bench/run.mjs --port 9224 --label desktop-before-1 [--cold]
```

`--cold` opens first on a missing index: delete `%LOCALAPPDATA%\com.visualsecondbrain.bench\<vault id>`
with the app closed. The browser runs in Edge with its own profile and debug port, on the web build's
dev server; see `REPORT.md`.

Each label is run three times; runs differ by up to about 20% at the p50 on this machine, so a change
is called a regression only past that.
