# Bench

Times the hot paths at the level of `#lib/api`, the platform layer, inside the app's own page, so a
number covers the whole call: the layer, the transport (Tauri's IPC, or none in the browser) and the
backend. The numbers and what they mean are in [REPORT.md](REPORT.md).

## The vault

`vault.mjs` generates the same vault on every run, in Node or in a page: 300 zones nested three deep
(60 on the canvas, each holding three, one of which holds one more), 8,000 cards (4,000 in zones,
4,000 loose in 100 clumps of 40), 5,000 notes (4,500 on cards, 500 unplaced) and 6,000 edges (chains
inside each zone and clump, links between zones, and between clumps and zones, so about half the
edges are long). It spans about 49,000 by 46,000 world units.

- Desktop: `node bench/write-vault.mjs <folder>` writes it as vault files.
- Browser: `node bench/generate-browser.mjs --port <cdp port>` builds it in the page through
  `#lib/api`, as the app would: about 23,000 commands.

## The scenarios

`scenarios.mjs`, run in the page:

| Name | What |
|---|---|
| open | `openVault` then `canvasContents`, as the vault route's load does; 10 times. The browser's vault is closed before each, so each open is a real one |
| open (cold) | the same, once, on a vault never opened: the desktop builds its index from the files |
| viewport 100%, 40% | `queryViewport` for a 1600 by 1000 window panned a quarter window per step across the zones and the loose clumps, on the area the canvas queries (the window grown by half its size on each side) |
| viewport 20%, 5%, clusters | the same zoomed out, with the cell size the canvas asks for: clusters and bundles |
| move card | `moveCards` for one card and back, 20 cards in zones and 20 loose |
| search | `search` for every prefix of six phrases, as typed, three times |
| zone rows | `zoneRows` for the outermost zones and five opened zones, ten times |
| zone matches | `zoneMatches` for every prefix of three words, three times |
| unplaced page | `unplacedNotes`, ten pages of 50, five times |

`render.mjs` times drawing the zoomed-out map on the vault's canvas: from asking for it to the frame
painted, the longest the main thread is held, and the elements drawn, at 20% and 5%.

`run.mjs` (`--only <regex>` to run some scenarios) reports p50 and p95 (nearest rank) and the maximum per scenario, and writes them to
`results/<label>.json`. `compare.mjs <label>...` sets labels side by side, taking the median of each
label's runs (`<label>-1`, `-2`, ...).

`layer.mjs` measures the layer alone on the desktop: the same calls straight to the Tauri module
(the code `api.ts` held before the layer) and through `api.ts`, alternating call by call, 200 times
each, into `results/desktop-layer-ab.json`.

## Running it

**The desktop** runs in its own copy of the app, never Kevin's: its own app ID (so its own data
folder), Vite port and WebView2 debug port, and a release build of the Rust (the shipped speed).
From the repo root, in PowerShell, with the vault written to `<vault>`:

```powershell
# tauri.bench.json:
# {"identifier": "com.visualsecondbrain.bench", "build": {"devUrl": "http://localhost:5174", "beforeDevCommand": "pnpm dev --port 5174"}}
# %LOCALAPPDATA%\com.visualsecondbrain.bench\vaults.json lists <vault> by its ID.
$env:CARGO_TARGET_DIR = "<short temp folder>"   # the MSVC linker fails on long paths
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9224"
pnpm tauri dev --release --config tauri.bench.json
node bench/run.mjs --port 9224 --label desktop-after-1 [--cold]
```

`--cold` opens first on a missing index: delete `%LOCALAPPDATA%\com.visualsecondbrain.bench\<vault id>`
with the app closed. "Before" runs put `main`'s `api.ts` back in the working tree for the run (the
dev server reloads it), alternating with "after" runs, so a drift in the machine's load hits both.

**The browser** runs in Chrome with its own profile and debug port, on the web build's dev server
(the base path is `/vsb/`):

```powershell
pnpm dev:web
chrome --headless=new --remote-debugging-port=9225 --user-data-dir=<short temp folder> http://localhost:5175/vsb/
node bench/generate-browser.mjs --port 9225
node bench/run.mjs --port 9225 --base /vsb/ --vault <id it printed> --label browser-1
```

In Git Bash, set `MSYS_NO_PATHCONV=1` so `/vsb/` is passed as is. Chrome fails to open IndexedDB
under a profile folder with a long path.

Each label is run three times. Background load on the machine moves whole runs by 20% and more, so
compare labels run alternately, or with `layer.mjs`.
