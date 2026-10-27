# Visual Second Brain: Specs

## Overview

A local-first, canvas-based knowledge management app. The infinite canvas is the primary interface: notes are placed on it as cards, grouped into zones and connected with edges. Notes are plain Markdown files, the layout is JSON, and a local SQLite database indexes both.

Principles:

1. **Canvas-first:** visual thinking takes priority over document management.
2. **Low friction:** creating and connecting ideas must feel immediate.
3. **Progressive complexity:** advanced features never complicate basic workflows.
4. **User ownership:** all knowledge stays in open, portable files.
5. **Manual-first, AI-assisted:** AI supports the user's thinking without replacing it.
6. **Paper-friendly:** handwritten notes remain a valid, independent thinking tool.

## Stack

| Part | Technology |
|---|---|
| Desktop shell and backend | Tauri 2 (Rust) |
| Frontend | SvelteKit 3 with Svelte 5, built as a static single-page app (`@sveltejs/adapter-static`) |
| Index | SQLite, used only from Rust. The build must include FTS5, R*Tree and math functions (`floor()`). |
| Batch creation layout | `@dagrejs/dagre` |
| Icons | Lucide (`@lucide/svelte`) |

### Responsibilities

**The backend (Rust) owns everything that touches disk:**

- reading and writing vault files, with atomic writes and the write order from [Storage](#storage)
- frontmatter parsing and ULID assignment
- the SQLite index: startup scan, rebuilds and every query
- the check before every write, so a file changed outside the app is never overwritten

**The frontend owns everything on screen:**

- the canvas: rendering, pan and zoom, viewport queries
- card editing
- parsing the batch syntax and laying it out with dagre; the result goes to the backend as one command

The frontend never reads files or SQLite directly. It calls typed Tauri commands and listens to Tauri events.

## Code organization

### General

- **DRY is the main rule.** When code or UI appears a second time, extract it before continuing.
- **No abstraction for something used once.**
- **Small files with one job.** Around 150 lines is the point to look for a split. It is a guide, not a hard limit: pieces that only make sense together are better in one file than split across three.
- **The same applies to Rust:** one module per concern (vault files, index, startup scan, commands).

### Routing

- Every screen and panel is a SvelteKit route. No view flags or `{#if}` chains to switch screens; navigation uses `<a href>` and `goto`.
- The canvas lives in the vault layout, so it stays mounted while panels open and close as child routes.
- Route data is loaded in `+layout.ts` and `+page.ts` `load` functions, through `#lib/api`.
- No server code: no `+page.server.ts`, `+server.ts` or form actions, since Tauri has no Node server. SSR is off.
- Interaction inside the canvas (selection, drag, edit mode) is component state, not routes.

```
src/routes/
  +layout.svelte              # app shell
  +layout.ts                  # SPA mode: SSR off
  +page.svelte                # /: vault picker (open a folder, recent vaults)
  vault/[vaultId]/
    +layout.svelte            # the canvas, mounted for every child route
    +layout.ts                # opens the vault
    +page.svelte              # canvas with no panel open
    (panel)/
      +layout.svelte          # the panel shell, shared by the tray and search
      unplaced/+page.svelte   # Unplaced tray
      search/+page.svelte     # search
    settings/
      +layout.svelte          # settings: a full page over the canvas, one tab per child route
      +page.ts                # opens the first tab
      appearance/+page.svelte # the vault's theme
```

### Shared pieces

- **`#lib/api`:** one typed function per Tauri command and event (SvelteKit 3 replaced `$lib` with the `#lib` subpath import). Components never call `invoke` or `listen` directly.
- **Shared state** lives in `.svelte.ts` modules using runes, not passed down through many component levels.
- **One system per cross-cutting behavior**, never a copy per component or route:
  - keyboard shortcuts: one declarative key layer. A screen over the canvas adds a modal layer, which turns the canvas's keys off while it is open.
  - selection and focus
  - world-to-screen conversion: one module owns the pan and zoom transform
  - undo
- **Repeated UI is one component.** For example, the Unplaced tray and search results both list notes, so they share one note list component; the tray and search share one panel shell.
- **Design tokens:** every color, font, radius and shadow comes from a theme's tokens (see [Appearance](#appearance)). Components never hard-code them.
- **Icons are Lucide icons**, drawn in the color of their text, at a size set once in the root layout. An icon Lucide lacks (the angled edge shape) is drawn through Lucide's own `Icon` component, so it matches.
  - A universal symbol in a tight bar stands alone, with a tooltip and a screen-reader label: settings (gear), close (cross), delete (trash).
  - Everywhere else the icon sits beside its text.

## Concepts

| Concept | What it is | Stored in |
|---|---|---|
| Note | Markdown content | `notes/**/*.md` |
| Card | A placement on the canvas: position, size, alignment, and optionally a note | `.canvas/cards/<card-id>.json` |
| Zone | A user-defined area that groups cards and other zones | `.canvas/zones/<zone-id>.json` |
| Edge | A connection between two cards | `.canvas/edges/<edge-id>.json` |

- A card can have no note: an empty card, used to preplace structure.
- A note can have no card: it appears in the Unplaced tray.
- Edges connect cards, never notes directly.
- Connections exist only as edges. There are no `[[wikilinks]]` and no backlinks.

## Storage

### Layout

```
<vault>/
  notes/                      # plain .md, user-owned, any folder structure
    some-idea.md
  .canvas/                    # app-owned, synced with the vault
    vault.json
    zones/<zone-id>.json
    cards/<card-id>.json
    edges/<edge-id>.json

<OS app-data>/<vault-id>/
  index.sqlite                # derived cache, never synced
```

### Rules

- **One file per zone, card and edge.** Two devices only conflict when they changed the same item before syncing.
- **The parent is stored on the child**, never as a list of children on the parent. Moving anything is a single file write.
- **References point one way:** cards point to notes, edges point to cards. A note never references its cards.
- **Writes are atomic:** write a temp file, then rename it, so a sync tool never uploads half a file.
- **Check before every write or delete.** There is no file watcher, so a sync tool can replace a file while the app is open. Before writing or deleting a file, the app compares its current modified time and size with the index. If either differs, the file changed outside the app:
  - **Card, zone or edge file:** re-read it, then apply the edit on top of it.
  - **`.md` file:** never overwritten or deleted. The version on disk stays, and the card reloads from it. If the app had text to save, it goes into a new note, `<title> (conflict).md`, without the original's ID, so it lands in the Unplaced tray. Nothing is lost.
- **Write each thing before anything that points at it:** notes, then zones (parents first), then cards, then edges. A crash can leave unplaced notes or empty zones, never a reference to a missing file.
- **Per-device state** (viewport, zoom, last opened zone) is never written to a synced file.

### `vault.json`

Rarely written. Holds:

- `format`: file format version
- `id`: vault ULID, used to find the index in the app-data folder
- vault settings: for now `theme`, the theme the vault is drawn in, left out for the default

### Note: `notes/**/*.md`

```markdown
---
id: 01JC8W3K9QZ7XH2M4N5P6R8S9T
---
Competitor scan

...
```

- `id` is a ULID in the frontmatter. It is written when the note gets its first card, never just because the app saw the file. (If every device wrote an ID on sight, two devices would write different IDs into the same new file and create a sync conflict.)
- The app keeps frontmatter keys it did not write, and hides the frontmatter from the card editor.
- The title is the first line of the body.
- The filename comes from the title at the first save. Characters invalid on Windows are removed, and a name clash adds a number (`Idea 2.md`).
- When the title changes, the file is renamed on blur, not on every keystroke. Renames are safe because cards reference the ID, not the path.
- If two files share an ID (a file copied outside the app), the newer one gets a fresh ID.

### Zone: `.canvas/zones/<zone-id>.json`

```json
{ "name": "Pricing", "parent": null, "x": 0, "y": 0, "w": 800, "h": 600, "color": "#f5d76e" }
```

- `parent`: zone ULID, or `null` for a zone directly on the canvas.
- `x`, `y`: relative to the parent zone, or to the canvas origin.

### Card: `.canvas/cards/<card-id>.json`

```json
{ "note": "01JC...", "zone": null, "x": 120, "y": 40, "w": 200, "h": 80, "halign": "center", "valign": "center" }
```

- `note`: note ULID, or `null` for an empty card.
- `zone`: zone ULID, or `null` for a card directly on the canvas. The canvas acts as an invisible zone at (0, 0), so both cases share one code path.
- `x`, `y`: relative to the card's zone.
- `halign`: `left` (default), `center`, `right`.
- `valign`: `top` (default), `center`, `bottom`.
- Fields at their default value are left out of the file.

### Edge: `.canvas/edges/<edge-id>.json`

```json
{ "from": "01JD...", "to": "01JE...", "label": "needs", "shape": "angled", "arrow": "both" }
```

- `from`, `to`: card ULIDs.
- `label`: optional.
- `shape`: `curved` (default), `straight`, `angled`.
- `arrow`: where arrowheads are drawn: `to` (default), `both`, `none`.
- Fields at their default value are left out of the file.

## Zones and membership

- A card belongs to one zone or to none. A card inside two overlapping zones belongs to the innermost one it was dropped in.
- Nested zones use `parent`, the same mechanism as cards.
- Membership changes only when the user does one of these:
  - **Moves a card:** dropping it into a zone sets `zone` and converts its coordinates. One write.
  - **Moves a zone:** dropping it fully inside another zone sets its `parent`, the same way; dragging it out puts it back on the canvas. One write: its contents come along.
  - **Creates a zone:** the new zone sits in the innermost zone that fully contains it. The cards and zones at that level lying fully inside it join it.
  - **Deletes a zone:** its cards and child zones move to its parent (or the canvas), with coordinates converted. Nothing inside is deleted.
- Moving or resizing a zone never changes what is inside it. Moving a zone over loose cards does not capture them.
- A zone cannot be resized smaller than the area its contents cover. Resizing from the left or top keeps the contents in place, so its direct children's coordinates are rewritten.
- Ctrl+drag (Cmd on macOS) on the paper draws a zone. A zone's name is its handle: click selects, drag moves, double-click renames. Its body behaves like the paper: dragging pans, double-clicking places a card inside.

## Cards

### States

| `note` | `.md` found | State | Display |
|---|---|---|---|
| `null` | n/a | Empty, on purpose | A blank card, styled like a normal one |
| ULID | yes | Normal | The note's content |
| ULID | no | Unresolved | "Note not found": not synced yet, or deleted outside the app |

- Empty and unresolved cards look different. An empty card is a choice; an unresolved card means a file is missing.
- An unresolved card offers "clear", which turns it into an empty card.

### Creating and editing

1. Placing a card creates an empty card (`note: null`), and the card file is saved.
2. Double-clicking a card enters edit mode.
3. While editing, the note is saved about a second after the last keystroke, and on blur.
4. The first save with content writes the `.md` with a new ULID, then sets the card's `note`.
5. On blur:
   - An empty card that is still empty stays an empty card.
   - A note created during this edit session that is now empty: the `.md` is deleted and the card goes back to `note: null`.
   - A note that existed before this edit session is kept, even if empty. Deleting a note always takes an explicit action.

### Deleting

- Deleting a card never deletes its `.md`. A note left with no cards goes to the Unplaced tray.
- Empty cards are removed with an explicit delete.

### Unplaced notes

Notes with no card (never placed, created outside the app, or whose cards were all deleted) are not on the canvas. They are reachable through:

- the Unplaced tray, a query for notes with no cards
- search
- dragging one onto the canvas, which creates its card and writes its ULID if it has none

See [Unplaced tray and search](#unplaced-tray-and-search).

## Edges

- Mod+drag (Ctrl, Cmd on macOS) from a card draws an edge: releasing on another card connects them, `from` the first, `to` the second. Started on the paper, the same gesture draws a zone. Releasing on the paper or on the starting card creates nothing.
- Edges join cards only, never zones or notes. Cards in different zones and empty cards can be connected.
- No edge from a card to itself, and at most one edge between two cards, in either direction. Connecting a pair that is already connected selects its edge.
- Each edge has a style, picked for the selected edges in the selection bar: its shape and its arrowheads. New edges are curved, with an arrowhead at `to`.
  - Curved and angled lines leave each card square to the side that faces the other card, from the middle of that side. An angled line bends at right angles halfway across.
  - A straight line runs along the line between the two cards' centers, from border to border.
- Pressing the line or its label selects the edge. Double-clicking it, or Enter while it is selected, edits the label in place at the curve's middle. New edges have no label; clearing a label removes it from the file.
- Deleting a card deletes its edges. An edge is drawn whenever it crosses the screen, even with both its cards off-screen.

## Unplaced tray and search

- **Panels beside the canvas.** The tray and search are child routes in the vault's `(panel)` route group, whose layout is their shell: a panel docked on the right, full height. The canvas stays mounted and usable beside it, keys included: the panel is not modal.
- **Opening and closing.** The top bar has an Unplaced and a Search button, icon beside text, between the vault name and the settings gear. Mod+U opens the tray and Mod+F opens search (Ctrl, Cmd on macOS), also while typing. The same key or button again, Close, or Escape while the focus is in the panel goes back to the canvas.
- **One note list.** Each line shows the title and the excerpt from the index, the excerpt as plain text without Markdown marks. Lines are fetched 50 at a time as the list scrolls, never all at once. After any edit to the vault (an undo step, the end of a card edit), the lines shown are fetched again.
- **The tray** lists the notes with no card, most recently changed first: notes never placed, created outside the app, or whose cards were all deleted, and `(conflict).md` copies.
- **Search** covers note text (titles and bodies) and zone names, through `notes_fts` and `zones_fts`. Every word typed must be there, each as the start of a word; case and accents are ignored. Matching zones come first, then notes, best match first. A note that has a card is marked "On the canvas".
- **Clicking a result** with a place on the canvas, a placed note or a zone, frames and selects it: centered at 100%, or zoomed out until it fits but never below 40%, so the zones around it open. The panel stays open. Clicking an unplaced note does nothing; it is placed by dragging.
- **Dragging a note onto the canvas** places its card where it is dropped. A ghost of the card, at the canvas's zoom, follows the pointer. The card has the size of a card placed by double-click, is centered on the drop point and joins the innermost zone under its center. A note without an ID gets its ULID first, then the card is written. The card is one undo step; undoing it keeps the ULID in the note, which goes back to the tray. Dropping back on the panel or the top bar places nothing.
  - Dropped on a collapsed zone, the card joins it (or the zone inside it under the drop point), where it would be hidden: it is framed, as a click on a placed result does. A card dropped on the paper while zoomed out stays in view, so the camera does not move.
- **One card per note until V3:** dragging a note that already has a card creates nothing and frames its card, as a click does.

## Batch creation

A small text syntax, inspired by Mermaid but not compatible with it, to create several cards and edges at once:

```
Competitor scan -> Price tiers -> Customer interviews
Competitor scan -> Pricing risks
Open questions
```

This creates 5 cards and 3 edges.

- Each line is one card, or a chain of cards joined by `->`.
- The text is the note's content. The same text twice in one block is the same card.
- The cards land where the command is run. Run inside a zone, they join that zone.
- Created cards have `halign: center` and `valign: center`.
- Layout uses `@dagrejs/dagre`.
- One-shot: the text creates the cards once and is not kept or linked to them.
- The whole batch is one undo step.
- Not supported yet: edge labels, empty cards, zones.

## Index (SQLite)

### Rules

- **It lives in the OS app-data folder, never in the vault.** Synced SQLite files get corrupted because the `-wal` and `-shm` files sync out of step with the main file.
- **It is never the source of truth.** Deleting it loses only per-device UI state; a rescan rebuilds everything else.
- **The schema version is stored in `PRAGMA user_version`.** On mismatch, the index is dropped and rebuilt.
- **The canvas reads only from the index** and only holds what the current viewport query returns. Notes and cards are never all loaded in memory.

### Schema

```sql
CREATE TABLE notes (
  key       INTEGER PRIMARY KEY,
  id        TEXT UNIQUE,              -- ULID; NULL until first placed
  path      TEXT UNIQUE NOT NULL,     -- vault-relative
  mtime     INTEGER, size INTEGER,
  title     TEXT, excerpt TEXT        -- enough to draw a card without opening the .md
);

CREATE TABLE zones (
  key       INTEGER PRIMARY KEY,      -- shared with zone_bounds
  id        TEXT UNIQUE NOT NULL,
  parent    TEXT,                     -- NULL = canvas
  name      TEXT, color TEXT,
  x REAL, y REAL, w REAL, h REAL,     -- relative to parent, as in the file
  mtime     INTEGER, size INTEGER
);
CREATE INDEX zones_parent ON zones(parent);

CREATE TABLE cards (
  key       INTEGER PRIMARY KEY,      -- shared with card_bounds
  id        TEXT UNIQUE NOT NULL,
  note      TEXT,                     -- NULL = empty card
  zone      TEXT,                     -- NULL = canvas
  x REAL, y REAL, w REAL, h REAL,     -- relative to zone, as in the file
  halign    TEXT NOT NULL DEFAULT 'left',
  valign    TEXT NOT NULL DEFAULT 'top',
  mtime     INTEGER, size INTEGER
);
CREATE INDEX cards_note ON cards(note);
CREATE INDEX cards_zone ON cards(zone);

CREATE TABLE edges (
  key       INTEGER PRIMARY KEY,      -- shared with edge_bounds
  id        TEXT UNIQUE NOT NULL,
  from_card TEXT NOT NULL,
  to_card   TEXT NOT NULL,
  label     TEXT,
  shape     TEXT NOT NULL DEFAULT 'curved',
  arrow     TEXT NOT NULL DEFAULT 'to',
  mtime     INTEGER, size INTEGER
);
CREATE INDEX edges_from ON edges(from_card);
CREATE INDEX edges_to ON edges(to_card);

-- absolute world coordinates
CREATE VIRTUAL TABLE zone_bounds USING rtree(key, min_x, max_x, min_y, max_y);
CREATE VIRTUAL TABLE card_bounds USING rtree(key, min_x, max_x, min_y, max_y);
CREATE VIRTUAL TABLE edge_bounds USING rtree(key, min_x, max_x, min_y, max_y);

CREATE VIRTUAL TABLE notes_fts USING fts5(title, body);   -- rowid = notes.key
CREATE VIRTUAL TABLE zones_fts USING fts5(name);          -- rowid = zones.key

-- per device, not derived from files: viewport, zoom, last opened zone
CREATE TABLE ui_state (k TEXT PRIMARY KEY, v TEXT);
```

### Coordinates

- Files store coordinates relative to the zone; the R*Trees store absolute bounds.
- Moving a zone is one file write. The index recomputes the bounds of everything inside it with a recursive CTE over `zones.parent`.
- An edge's bounds are the box around both of its cards, updated when either card moves.
- The R*Tree stores 32-bit floats rounded outward, so it is only a filter. Exact coordinates live in the tables. Bounds are always recomputed from those values, never shifted by adding offsets inside the R*Tree.

### Startup scan

- **There is no live file watcher**, so no background process. Changes made outside the app while it is open (another editor, a sync tool) are picked up at the next startup. Until then, the check before every write (see [Storage](#storage)) keeps the app from overwriting them.
- **At startup, the app compares every file's modified time and size with the index**, and re-reads a file when either one differs. The test is "differs", not "newer": sync tools keep the modification time of the device that made the change, so a synced, restored or copied file can carry an older time than the one in the index. Only a cold start (no index) reads everything.
- **The scan handles files added, deleted, renamed or moved while the app was closed:**
  - A renamed or moved `.md` keeps its ULID, so the scan only updates `path`. No card file changes.
  - A new `.md` becomes an unplaced note.
  - A deleted `.md` leaves its cards unresolved.
  - Two files with the same ID: the newer one gets a fresh ID.

## Rendering and zoom

- Opening a vault frames everything on its canvas: centered, zoomed out until it all fits, never zoomed in past 100%. An empty canvas opens at 100% on the origin.
- One viewport query per pan or zoom, with a margin so small pans don't need a new query.
- Queries depend on zoom: zoomed out, nothing inside a zone is queried, and anything smaller than a few pixels on screen is skipped.
- A card's title and excerpt come from the index. The `.md` is read only when a card is opened or zoomed in enough to show its body.
- Zoomed out below 40%, where 14px card text would be under 6px on screen, every zone collapses at once:
  - A collapsed zone draws only its frame and its name, centered. The name keeps its size on screen (20px) at any zoom and is cut with an ellipsis at the zone's sides. The frame keeps its line width and corners on screen too.
  - Nothing inside a collapsed zone is queried or drawn, child zones included, so only the outermost zones show. Edges with an end inside a collapsed zone are not drawn.
  - The name is still the handle: click selects, drag moves (the contents come along), double-click renames. Double-clicking the body frames the zone, zoomed in at least until it opens, instead of placing a card it would hide. Drawing a zone inside a collapsed zone creates nothing.
  - Zooming back in past 40% queries and draws what is inside the zones again.
- Later, in the semantic zoom milestone:
  - Loose cards (no zone) are grouped into grid cells, each drawn as one marker with a count ("14 notes"). Clicking a marker zooms in. The cell is computed with `floor()`, not `CAST(... AS INTEGER)`, which rounds toward zero and makes the cells around 0 twice as wide. Until then, loose cards are drawn as usual when zoomed out.
  - Edges between zones are drawn as one line per pair of zones, with a count. A loose card's edges attach to its cluster marker.

## Appearance

- **Settings is a full page** at `vault/[vaultId]/settings/`, drawn over the canvas, which stays mounted underneath. Each tab is a child route; only Appearance exists so far. Escape or Close goes back to the canvas.
- **Four themes:** Studio, the default, Engineering pad, and two dark ones, Orbit and Cairn.
  - Studio: a cool gray canvas dotted at the grid crossings, white cards with a hairline edge, graphite text and a petrol accent. Instrument Sans for notes and controls; zone names are set narrower.
  - Engineering pad: sage graph paper, index cards with a red rule under the title, fountain-pen blue. Literata for notes, IBM Plex Sans for controls.
  - Orbit (futuristic): a deep navy canvas with faint major lines and brighter nodes where they cross, cards edged in light, an ice-blue accent. Saira for notes and controls; zone names are set narrower.
  - Cairn (eerie, Celtic): a peat-moss canvas with a faint speckle, slate cards with a dim gold rule under the title, fog-pale text and a bog-gold accent. Alegreya for notes, Alegreya Sans for controls.
- **A theme is a set of design tokens:** CSS custom properties, picked by the `data-theme` attribute on the root element. A new theme, or a dark variant, is a new set of values with no component changes.
  - The tokens also set whether the theme is light or dark (for scrollbars and form controls), how strongly zones are washed (more on dark paper, so each highlighter still reads as its color), and an x-height for fonts that run small, so text reads the same size in every theme.
  - Fonts are bundled with the app; nothing loads from the network.
- **The theme belongs to the vault.** Picking one in Appearance applies it at once and writes it to `vault.json`, so the vault looks the same on every device that opens it. The default is left out of the file; a theme this build does not know shows as the default.
- **Screens outside a vault** (the vault picker, errors) use the default theme.
- Zone colors live in the zone files, so they are the same in every theme. The default zone gray, for a zone with no color, comes from the theme.
- Later: a dark mode (Orbit and Cairn are dark themes of their own, not that feature).

## Sync

- The vault works with folder-sync tools (Syncthing, Dropbox, Google Drive). They don't merge files: two devices writing the same file before syncing produce a conflict copy.
- With one file per item, conflicts only happen when two devices change the same note, card, zone or edge before syncing, and the conflict copy is a small file.
- Files synced in while the app is open show up at the next startup.
- Files can arrive out of order. A card whose note hasn't arrived yet shows as unresolved until the first startup after it arrives.
- Known case: the same empty card filled on two offline devices. Each device creates its own note and points the card at it, so the card file conflicts. The card is pointed at one note and the other goes to the Unplaced tray. Both texts survive.
- Not planned: a per-device append-only operation log (`.canvas/ops/<device-id>.jsonl`). It would avoid conflicts entirely, but it means building a CRDT and the files stop being readable by hand.

## V3: shared note references

The model already supports it:

- Cards have their own IDs, separate from notes. Until V3, the UI allows only one card per note.
- Edges connect cards, so each placement has its own connections.
- V3 removes the one-card-per-note limit. Editing a note updates every card that shows it, and deleting a card never deletes the note.

## Not doing

- **No `[[wikilinks]]` and no backlinks.** Connections exist only as canvas edges. As a result, opening the vault in another app shows the notes but not the connections.
- **No Mermaid compatibility.** Batch creation uses its own small syntax.
- **No synced or authoritative SQLite.**
- **No live file watcher.** Outside changes are picked up at the next startup.

## Open questions

- How conflict copies are detected (`.sync-conflict-`, `(conflicted copy)`, `(1)`) and resolved (per field, or last write wins).
- The zoom where loose cards cluster, and the clustering cell size.
- AI assistance and paper import are not covered by this spec.
