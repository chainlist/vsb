# Performance report

The platform layer on the desktop, and the browser backend, timed on the same generated vault
(300 zones, 8,000 cards, 5,000 notes, 6,000 edges, about half of them long). Method and scenarios
are in [README.md](README.md); every number is from `results/`.

Machine: Windows 11, with 50 to 60% CPU taken by other programs throughout, which moved whole runs
by 20% and more between the start and the end of the session. Comparisons below are only ever
between runs made alternately. Desktop: a release build of the Rust in WebView2 156. Browser: Chrome
152, headless, on the web build's dev server.

## The layer costs nothing on the desktop

Before (`main`'s `api.ts`, calling `invoke` itself) and after (`api.ts` re-exporting the Tauri
module), run alternately, three times each; the median of the three runs' p50 and p95, in ms:

| Scenario | Before p50 | Before p95 | After p50 | After p95 |
|---|---:|---:|---:|---:|
| open | 1943 | 2267 | 1908 | 2223 |
| viewport 100% | 11.5 | 18.0 | 11.0 | 16.6 |
| viewport 40% | 19.4 | 24.5 | 18.8 | 23.3 |
| viewport 20%, clusters | 789 | 1130 | 795 | 1145 |
| viewport 5%, clusters | 1740 | 1914 | 1754 | 1850 |
| move card | 29.7 | 39.3 | 27.5 | 35.2 |
| search | 9.7 | 14.7 | 9.4 | 15.4 |
| zone rows | 4.5 | 5.7 | 4.5 | 6.1 |
| zone matches | 4.5 | 5.5 | 4.5 | 6.2 |
| unplaced page | 7.6 | 8.8 | 7.5 | 9.0 |

Measured on its own (`layer.mjs`: the same call straight to the Tauri module and through `api.ts`,
alternating, 200 times each), the layer adds 0.0 to 0.1 ms, either way: inside noise. That is as
expected: `api.ts` re-exports the Tauri module's functions, so a call reaches the very same function.

## The browser against the desktop

Same vault, built in the browser through `#lib/api` (about 23,000 commands in 89 s, so about 4 ms per
write with the index kept up to date). Median of three runs' p50 and p95, in ms; the desktop is the
"after" column above:

| Scenario | Desktop p50 | Desktop p95 | Browser p50 | Browser p95 |
|---|---:|---:|---:|---:|
| open (cold) | 127,703 | | 172 | |
| open | 1908 | 2223 | 6 | 8 |
| viewport 100% | 11.0 | 16.6 | 20.9 | 34.7 |
| viewport 40% | 18.8 | 23.3 | 37.0 | 62.8 |
| viewport 20%, clusters | 795 | 1145 | 27.1 | 32.9 |
| viewport 5%, clusters | 1754 | 1850 | 17.7 | 21.7 |
| move card | 27.5 | 35.2 | 3.7 | 6.3 |
| search | 9.4 | 15.4 | 6.1 | 11.0 |
| zone rows | 4.5 | 6.1 | 0.0 | 0.1 |
| zone matches | 4.5 | 6.2 | 0.0 | 0.1 |
| unplaced page | 7.5 | 9.0 | 4.9 | 7.1 |

The browser's cold open is a fresh browser process opening the vault; the desktop's builds its
index from the files. Its warm open is the desktop's startup scan, which the browser has no use for.

## What would feel slow, and what was done

**Browser viewport, open zones: 21 ms at 100%, 37 ms at 40% (p95 35 and 63).** Over a frame, and
about twice the desktop. On this vault a window meets 300 to 470 items, most of them long edges
whose box crosses it (the desktop returns the same ones), and the browser reads about 800 records at
about 12 µs each. It does not stutter: the longest the page's main thread is held during one query is
4.5 ms at the median and 7.4 ms at worst; the rest runs in the browser's storage process while the
canvas keeps its previous answer, and the canvas queries half a window beyond each side of the
screen, so a pan reaches the edge of what is drawn only half a window later.
- Done: items are filed under every grid square they overlap, at a side a quarter of their size,
  rather than under one square with the query widened to catch overhangs. Reads at 100% went from
  1,536 records to about 750, and the query from 36 ms to 21 ms.
- Not done: moving the bundle bookkeeping off the edge records (about 10% less to read), or a cache
  of the squares already read. A vault whose edges are mostly short reads far fewer records.

**Browser search while typing: was p95 100 to 113 ms, now 11 ms (max 33 ms).** A first letter read
9,000 to 15,000 keys of a word index on the notes (8 µs each). Search now reads its own word index,
one record per word and shard of notes, so a first letter reads a few hundred records: 9 to 18 ms
for any single letter, 6 ms at the median.

**Browser zoomed-out map: 27 ms at 20%, 18 ms at 5%.** Over a frame, but 30 to 100 times quicker
than the desktop. Bundles were first filed in the grid too, which made the 5% query 150 to 170 ms (a
long bundle came back once per square); each cell size's bundles are now read in one range, a few
thousand small records at most. Main thread: 8 ms at the median at 20%, 3.5 ms at 5%.

**Desktop, as it is (not changed, by the rules of this work):**
- The zoomed-out map takes 0.8 s at 20% and 1.75 s at 5% on this vault: well past a frame. Bundles
  look up each end's box one by one, each with a fresh recursive walk of the zones and, for a cluster
  end, a clusters query of its own.
- A cold open (no index yet) took 128 s here, and 154 s once before; another cold run took 4.6 s.
- Moving a card takes 28 to 30 ms (a file written and synced to disk, then the index).

## Same vault, same answers

Built from the same plan, the desktop and the browser return the same cards and edges in a 40% window
(179 cards and 563 edges: positions, titles, excerpts, colors, styles), the same zone rows, zone
matches, Unplaced tray, cluster cells and boxes, canvas contents, and over the whole canvas the same
bundles (1,447 at cell 4096, holding 2,137 edges). They differ in:

- **Bundle counts in a window.** The browser counts every edge between two ends; the desktop counts
  those whose own box meets the window, so its count and arrowheads change as the window moves.
- **Search order.** The same notes and zones match every query; the ranking differs (FTS5's bm25 on
  the desktop; title words thrice, other words once, in the browser).
- **Order of zones at the same depth** in a viewport answer (parents still come first).
