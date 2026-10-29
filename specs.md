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
| Browser backend | TypeScript on IndexedDB, for the web build (see [Browser](#browser)). No WebAssembly. |
| Platform layer | `#lib/api`, which talks to one of the two backends, picked when the app is built |
| Frontend | SvelteKit 3 with Svelte 5, built as a static single-page app (`@sveltejs/adapter-static`) |
| Index | SQLite, used only from Rust. The build must include FTS5, R*Tree and math functions (`floor()`). |
| Batch creation layout | `@dagrejs/dagre` |
| Dialogs, menus and tooltips | shadcn-svelte (on bits-ui), styled with Tailwind CSS 4 |
| Icons | Lucide (`@lucide/svelte`) |

### Responsibilities

**The backend (Rust) owns everything that touches disk** (in the web build, the browser backend owns the browser's storage the same way: see [Browser](#browser)):

- reading and writing vault files, with atomic writes and the write order from [Storage](#storage)
- frontmatter parsing and ULID assignment
- the SQLite index: startup scan, rebuilds and every query
- the check before every write, so a file changed outside the app is never overwritten

**The frontend owns everything on screen:**

- the canvas: rendering, pan and zoom, viewport queries
- card editing
- parsing the batch syntax and laying it out with dagre; the result goes to the backend as one command

The frontend never reads files or SQLite directly. It calls typed Tauri commands and listens to Tauri events, through the platform layer.

**The platform layer** is `#lib/api`, the one way from the frontend to a backend:

- **Everything platform-specific goes through it.** Nothing else imports `@tauri-apps`, and nothing else touches IndexedDB or localStorage. A feature that needs the platform adds a function to the layer, implemented by both backends.
- It keeps the types and one function per command. The functions come from `#platform`, a `package.json` import resolved when the app is built: `platform/tauri.ts` by default (the desktop: each function calls its Tauri command), or `platform/browser/` under the `web` condition, which the web build's Vite config adds. Each build bundles one backend only: the web build holds no Tauri code, the desktop build no browser backend.
- Both backends have the same functions with the same signatures, checked when the code is type-checked, and the same behavior, checked by tests: the browser backend's mirror the Rust tests' cases.
- The layer costs nothing at run time: `api.ts` re-exports the backend's functions, so a call goes straight to them. Measured on the desktop, calls through the layer and straight to the Tauri module time the same, within 0.2 ms (`bench/`).
- Errors come back from both as plain strings, as Tauri's do.

## Code organization

### General

- **DRY is the main rule.** When code or UI appears a second time, extract it before continuing.
- **No abstraction for something used once.**
- **Small files with one job.** Around 150 lines is the point to look for a split. It is a guide, not a hard limit: pieces that only make sense together are better in one file than split across three.
- **The same applies to Rust:** one module per concern (vault files, index, startup scan, commands).

### Routing

- Every screen and panel is a SvelteKit route. No view flags or `{#if}` chains to switch screens; navigation uses `<a href>` and `goto`.
  - The one exception is the [zone list](#zone-list), a card floating beside the canvas that stays open with the tray or search: it is canvas chrome, opened and closed by a state remembered on the device.
- The canvas lives in the vault layout, so it stays mounted while panels open and close as child routes.
- Route data is loaded in `+layout.ts` and `+page.ts` `load` functions, through `#lib/api`.
- No server code: no `+page.server.ts`, `+server.ts` or form actions, since Tauri has no Node server. SSR is off.
- Interaction inside the canvas (selection, drag, edit mode) is component state, not routes.

```
src/routes/
  +layout.svelte              # app shell
  +layout.ts                  # SPA mode: SSR off
  +page.svelte                # /: vault picker (choose a vault, recent vaults)
  vault/[vaultId]/
    +layout.svelte            # the canvas, mounted for every child route, and its chrome
    +layout.ts                # opens the vault
    +page.svelte              # canvas with no panel open
    (panel)/
      +layout.svelte          # the panel shell, a sheet shared by the tray and search
      unplaced/+page.svelte   # Unplaced tray
      search/+page.svelte     # search
    settings/
      +layout.svelte          # settings: a modal over the canvas, one tab per child route
      +page.ts                # opens the first tab
      appearance/+page.svelte # the vault's theme, the device's interface size
      canvas/+page.svelte     # snapping, the style for new edges, the device's mouse wheel
      keyboard/+page.svelte   # every key and gesture, read-only
      vault/+page.svelte      # the vault's name and where it lives
```

### Shared pieces

- **`#lib/api`:** the platform layer, one typed function per backend command and event (SvelteKit 3 replaced `$lib` with the `#lib` subpath import). Components never call `invoke` or `listen` directly, nor the browser's storage.
- **`#lib/platform`:** the two backends behind it. `tauri.ts` calls the desktop's commands. `browser/` is the browser's backend, in small modules, one concern each (the vault list, notes, card, zone and edge edits, the batch builder, the viewport query, the lists beside the canvas, the index it keeps). Browser-only UI, such as naming a vault, is mounted by the browser backend itself, and words that differ by platform, such as the vault picker's and where Settings > Vault says the vault lives, come from the backend too, so no page knows which platform it runs on.
- **Shared state** lives in `.svelte.ts` modules using runes, not passed down through many component levels.
- **One system per cross-cutting behavior**, never a copy per component or route:
  - keyboard shortcuts: one declarative key layer. A screen over the canvas adds a modal layer, which turns the canvas's keys off while it is open. Each part keeps its keys, with what each does, in a table its bindings take them from; Settings > Keyboard lists those tables, so the list is what is bound.
  - selection and focus
  - world-to-screen conversion: one module owns the pan and zoom transform
  - undo
- **Repeated UI is one component.** For example, the Unplaced tray and search results both list notes, so they share one note list component; the tray and search share one panel shell. Every list beside the canvas pages through one helper.
- **Design tokens:** every color, font, radius and shadow comes from a theme's tokens (see [Appearance](#appearance)). Components never hard-code them.
- **shadcn-svelte components** live in `#lib/components/ui`, copied from its registry. `app.css` maps their colors, radii and shadows onto the theme's tokens, so they follow the vault's theme. Tailwind comes without its preflight reset, which the rest of the app is not styled for, and without `dark:` variants: a theme, not the OS, decides whether it is dark.
- **Icons are Lucide icons**, drawn in the color of their text, at a size set once in the root layout. An icon Lucide lacks (the angled edge shape) is drawn through Lucide's own `Icon` component, so it matches.
  - A universal symbol in a tight bar stands alone, with a tooltip and a screen-reader label: close (cross), delete (trash).
  - The [rail](#canvas-chrome) and the zoom controls show their icons alone too: a tooltip gives each one's name and shortcut, and a label names it for screen readers.
  - Everywhere else the icon sits beside its text.
- **The interface size scales the chrome through one mechanism:** CSS `zoom` on each piece of chrome (the `.chrome` class), never a multiplier per component, never the WebView's own zoom. See [Appearance](#appearance).

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

<OS app-data>/                # this device only, never synced
  vaults.json                 # recent vaults
  device.json                 # this device's settings: the interface size, what the wheel does
  <vault-id>/
    index.sqlite              # derived cache
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
- vault settings, each left out at its default:
  - `theme`: the theme the vault is drawn in
  - `snap`: `false` when moved and resized cards and zones do not snap to the grid (on by default)
  - `newEdges`: the style every edge the app creates gets (see [Edges](#edges)), each part (`shape`, `arrow`, `stroke`) left out at its default as in an edge file, and the whole of it while all are: `"newEdges": { "shape": "angled", "stroke": "dashed" }`

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
{ "note": "01JC...", "zone": null, "x": 120, "y": 40, "w": 200, "h": 80, "halign": "center", "valign": "center", "color": "#f5d76e" }
```

- `note`: note ULID, or `null` for an empty card.
- `zone`: zone ULID, or `null` for a card directly on the canvas. The canvas acts as an invisible zone at (0, 0), so both cases share one code path.
- `x`, `y`: relative to the card's zone.
- `halign`: `left` (default), `center`, `right`.
- `valign`: `top` (default), `center`, `bottom`.
- `color`: one of the highlighters zones take (see [Color](#color)), or left out for none.
- Fields at their default value are left out of the file.

### Edge: `.canvas/edges/<edge-id>.json`

```json
{ "from": "01JD...", "to": "01JE...", "label": "needs", "shape": "angled", "arrow": "both", "stroke": "dashed" }
```

- `from`, `to`: card ULIDs.
- `label`: optional.
- `shape`: `curved` (default), `straight`, `angled`.
- `arrow`: where arrowheads are drawn: `to` (default), `both`, `none`.
- `stroke`: how the line is drawn: `solid` (default), `dashed`, `dotted`, `double` (two parallel lines).
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
- **Resizing:** dragging a side or corner of a card or zone resizes it, selected or not. The card or zone under the pointer, and the single selected one, show a square on each corner; the sides are 10 screen pixels wide, half inside the item. A click on a side or corner selects the item, and a double-click on a card's side edits it.
- **Snap to grid**, on by default: a card or zone being moved lands with its top-left corner on a crossing of the minor grid (20 world units). With several items selected, the one pressed snaps and the others keep their places around it. Resizing, the sides pulled land on grid lines; the minimum size and a zone's contents still win over the grid. Holding Alt (Option on macOS) while dragging moves or resizes freely. A drag that snaps back to where it started writes nothing. Turned off in Settings > Canvas, which writes `snap: false` to `vault.json`.

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

### Tab: a linked card

- **Tab on a lone selected card,** or while typing in a card, adds a linked card after it: an empty card, with a new edge from the card to it. Typed text is saved first, as when the edit ends. With no card, several or a zone selected, Tab does what it did before.
- **Which way:** the way the card's edges already flow, by the sides their lines leave or reach it as drawn, after any switch around other cards.
  - Where its outgoing edges leave it.
  - With none, on past where its incoming edges arrive: an edge arriving on its top puts the new card below it.
  - With no edges, the direction last picked in the builder, as Arrange takes it (right until then).
  - When the edges that decide leave or arrive on several sides, a small picker over the card's middle, kept on screen, asks: four arrow buttons around it. An arrow key or a click picks, Enter is not needed; Escape or a press anywhere else adds nothing. The canvas's keys are off meanwhile.
- **Where:** beside the card's children that way (the cards its edges leaving that way reach), one gap after the last of them in reading order and centered on it: below it when they stand in a column (a way to a side), right of it in a row (a way up or down). The gap is 40 world units, as between the cards of a rank in a batch. With no children there, it goes 80 past the card (the gap between ranks), centered on it.
  - If that spot comes nearer than a gap to any card, on screen or not, at any depth, the new card slides on down its column or right along its row to the first spot that does not. Nothing else moves.
- **The card** has the size of a card placed by double-click and lands on the grid when snapping is on. It stays in the selected card's zone, whatever lies under it, and the zone grows to hold it, as for a batch. The edge has the vault's style for new edges. The card and its edge are one undo step.
- **Then** the new card is selected and opens for typing, so Tab there chains the next one. Landing off screen, or under the chrome, it is shown: the canvas glides just far enough, at the same zoom (at once under reduced motion).

### Color

- A card can take a color, as a zone can: one of the same seven highlighters, from one list shared by both, kept in its card file and the same in every theme. Without one it stays on the theme's plain stock.
- The whole card takes a light wash of its color over its stock, as a zone is washed over the paper. Each theme sets how strong the wash is (stronger on dark themes), so each color tells apart from the others and from plain stock while the text stays as readable as on plain stock.
- The card stays tinted while it is edited. A dimmed card fades into its tinted stock. An unresolved card keeps its "Note not found" look whatever its color.
- It is picked in the [selection bar](#canvas-chrome), for the selected cards and zones together. A card placed, inserted on an edge or made by a batch starts with no color.

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
- Each edge has a style, picked for the selected edges in the selection bar: its shape, its arrowheads and its line.
  - **New edges take the vault's style for new edges,** picked in Settings > Canvas with the selection bar's own selects and kept in `vault.json` (`newEdges`). By default it is curved and solid, with an arrowhead at `to`. A drawn edge, Tab's edge and an edge the builder creates all take it, and an edge being drawn shows its shape and arrowheads. The builder's arrows always say an edge's arrowheads and line, so a builder edge takes only the shape. The two halves of an edge a card is inserted on keep that edge's style: they are the old edge cut in two, not new edges.
  - Curved and angled lines leave each card square to the side that faces the other card, from the middle of that side. An angled line bends at right angles halfway across.
  - When that line would run through another card on the canvas, the edge takes the other pair of sides (top and bottom instead of left and right, or the reverse) if that line misses every card; when neither does, it keeps the first. Only cards count: crossing another edge or a zone's frame is fine. A line moves as soon as a card is dragged into or out of its way.
  - A straight line runs along the line between the two cards' centers, from border to border, whatever lies between.
- Pressing the line or its label selects the edge. Double-clicking it, or Enter while it is selected, edits the label in place at the curve's middle. New edges have no label; clearing a label removes it from the file.
- Deleting a card deletes its edges. An edge is drawn whenever it crosses the screen, even with both its cards off-screen.
- **Inserting a card on an edge.** A lone selected edge shows a + on its middle, or just under its label when it has one, so the label stays readable. Clicking it places an empty card, the size of a card placed by double-click, between the edge's two cards, in the innermost zone at the edge's middle, and opens it for editing, as a placed card. The edge is split in two, from its first card to the new one and from the new one to its second: both keep its shape, arrowheads and line, and the first keeps its label.
  - **Making room,** like inserting a row: along the way the line leaves its first card, across or down as it is routed, the new card is centered on the edge's middle, or put the usual gap past the first card when the middle is nearer (80 world units, the gap between linked cards in a batch). Across that way it is centered on the middle. Every card and inner zone directly in that zone (on the paper, the canvas's own cards and zones) lying wholly past the middle moves along by the same amount, just enough to leave that gap after the new card; an inner zone moves with everything in it. With snapping on, the card lands on the grid and the moves are whole squares. Nothing outside that zone moves, and the zone grows to hold what moved, as for a batch.
  - The card, both edges and every move are one undo step.
- Selecting cards brings out their links: every other card that no edge joins to one of them dims, and so does every edge that touches none of them. They stay solid, nothing shows through: a card's content fades into its stock, an edge's color into the paper. Dimming and undimming fade over 200 ms; selecting shows at once. Zones never dim. A card with no edges dims all the others.

## Canvas chrome

- **The controls sit in the canvas's corners,** never across it: the vault top left, the tools down the left edge, the zoom bottom right. Each is a small card of the theme's stock floating over the canvas, which runs under them to the window's edges.
- **The vault card** shows the vault's name after its first letter on the accent. It opens a menu: Switch vault, back to the vault picker, and Settings, which shows its key, Mod+, (Ctrl+, or Cmd+, on macOS).
- **The rail,** down the left edge right under the vault card, holds the tools by their icons alone, with bigger targets: Zones (Mod+L), Unplaced (Mod+U) and Search (Mod+F), then Builder (Mod+B). The Zones button shows when the [zone list](#zone-list) is open, and a panel's button when its route is. The panels stay routes, reached through links.
- **The zoom controls,** in the bottom-right corner: zoom out, the zoom in percent, zoom in, and fit to content.
  - Minus and plus step through set zooms, from 5% to 400% with 40% among them, around the middle of the window.
  - Fit frames everything on the canvas, as opening the vault does, gliding there. An empty canvas stays as it is.
  - While a panel is open, they sit left of its sheet.
- **The selection bar** floats above the selection: above its top-left corner, or centered above an edge's middle when only edges are selected. It holds what applies to the selection: the cards' text alignment (a 3 by 3 grid), the color of the cards and zones, the edges' style, Arrange, Builder and Delete.
  - The color and each part of the edges' style (shape, arrowheads, line) is a small select: its button shows the current choice's look (a swatch or an icon) beside a chevron, or "Mixed" when the selected items differ; its list shows each choice's look and name, the current one checked.
  - One color select serves the selected cards and zones together: a pick colors them all, in one undo step. Its first choice is No color, drawn as the plain stock struck through: a card goes back to the theme's plain stock, a zone to the theme's gray.
  - A menu keeps its keys: Escape, Enter or Delete pressed in it never reach the canvas. Choosing leaves the selection and the view as they are, and the focus goes back to the canvas.
- **Framing stays clear of the chrome:** whatever is framed (opening a vault, fit, a search result, a zone list row) keeps 80 pixels free on every side, at the interface size, so the rail and the corner cards never cover it.

## Unplaced tray and search

- **Panels beside the canvas.** The tray and search are child routes in the vault's `(panel)` route group, whose layout is their shell: a shadcn-svelte Sheet docked on the right, full height. The canvas stays mounted and usable beside it, keys included: the panel is not modal, so the sheet has no overlay and does not hold the focus.
- **Opening and closing.** The [rail](#canvas-chrome) has an Unplaced and a Search button. Mod+U opens the tray and Mod+F opens search (Ctrl, Cmd on macOS), also while typing. The same key or button again, Close, or Escape while the focus is in the panel goes back to the canvas.
- **One note list.** Each line shows the title and the excerpt from the index, the excerpt as plain text without Markdown marks. Lines are fetched 50 at a time as the list scrolls, never all at once. After any edit to the vault (an undo step, the end of a card edit), the lines shown are fetched again.
- **The tray** lists the notes with no card, most recently changed first: notes never placed, created outside the app, or whose cards were all deleted, and `(conflict).md` copies.
- **Search** covers note text (titles and bodies) and zone names, through `notes_fts` and `zones_fts`. Every word typed must be there, each as the start of a word; case and accents are ignored. Matching zones come first, then notes, best match first. A note that has a card is marked "On the canvas".
- **Clicking a result** with a place on the canvas, a placed note or a zone, frames and selects it: centered at 100%, or zoomed out until it fits but never below 40%, so the zones around it open. The panel stays open. Clicking an unplaced note does nothing; it is placed by dragging.
- **Dragging a note onto the canvas** places its card where it is dropped. A ghost of the card, at the canvas's zoom, follows the pointer. The card has the size of a card placed by double-click, is centered on the drop point and joins the innermost zone under its center. A note without an ID gets its ULID first, then the card is written. The card is one undo step; undoing it keeps the ULID in the note, which goes back to the tray. Dropping back on the panel or the chrome places nothing.
  - Dropped while zoomed out, the card would be hidden, in a collapsed zone (it joins it, or the zone inside it under the drop point) or in a cluster on the paper: it is framed, as a click on a placed result does.
- **One card per note until V3:** dragging a note that already has a card creates nothing and frames its card, as a click does.

## Zone list

- **A card floating on the left**, beside the rail and level with its top, listing the vault's zones as a tree. It is canvas chrome, not a route, so it can stay open beside the tray or search, and the canvas keeps its keys until the keyboard is put in the card.
- **Opening and closing.** The rail's Zones button, first on it; Mod+L (Ctrl, Cmd on macOS), also while typing, which opens it with the keyboard in its find field; or the card's close cross. A click outside it closes it too, on the canvas, the vault card or the zoom controls; dragging the paper, the wheel and a pinch leave it open, and so do clicks on the rail and in the tray or search beside it. Whether it is open is remembered for each vault on this device, in the index's `ui_state`, never in `vault.json`. It starts closed.
- **It slides in** from the left while fading in, in 0.2 s, and slides back out. Each level unrolls once its first rows are in, its rows arriving in a quick cascade; a zone's inner zones unfold under it the same way, and fold back up when its chevron closes.
- **The tree.** The outermost zones, by name, ignoring case. A zone holding other zones has a chevron that lists them, indented under it and by name too; closed by default. Cards are never rows.
- **One level at a time.** The outermost zones are fetched when the card opens, and a zone's inner zones when its chevron opens, 50 rows at a time as the list scrolls, never every zone. After any edit to the vault, the rows shown are fetched again.
- **Finding a zone.** A small field under the card's title finds zones by name. While it holds a word, the tree gives way to a flat list of the zones at any depth whose name holds every word typed, each as the start of a word, case and accents ignored, as search finds them: by name, 50 rows at a time, fetched again after any edit to the vault. Its rows work as the tree's do. Emptying the field, or Escape in it, brings the tree back.
- **A row** shows the zone's color as a dot, as in the selection bar's color picker; its name, set like zone names on the canvas; a dot in the accent color while any part of the zone is on screen, following pans and zooms; and how many cards it holds, its inner zones' included. The selected zone's row is tinted with the accent.
- **Clicking a row** frames and selects the zone, as a zone search result does. **Double-clicking** it renames the zone in the row, not on the canvas: Enter, Escape or a click elsewhere ends it, keeping what was typed. A rename is one undo step.
- **The keyboard,** so the mouse is never needed, and it still works as before. Mod+L opens the card with the keyboard in its find field. Down goes from the field to the first row; Up and Down go from row to row as the list shows them, and Up from the first row back to the field. Right lists a zone's inner zones, or, once they are listed, goes to the first; Left folds them back up, or, when they are, goes to the zone around. Enter frames and selects the zone, as a click does, and the keyboard stays in the list. Escape on a row, or in the empty field, gives the keyboard back to the canvas. The row the keyboard is on is ringed in the accent. While the keyboard is in the card the canvas's keys are off, as while typing; Mod+L still closes it.

## Batch creation

A small text syntax, inspired by Mermaid but not compatible with it, to create several cards and edges at once:

```
Competitor scan -> Price tiers --> Customer interviews
Competitor scan .-> Pricing risks
Open questions
```

This creates 5 cards and 3 edges: one solid, one dashed, one dotted.

- **Running it.** Mod+B (Ctrl, Cmd on macOS) or the rail's Builder button opens the batch dialog, a modal over the canvas, which turns the canvas's keys off. The cards land on the point the pointer was over, or on the middle of the screen when it was elsewhere. Mod+Enter or Create makes the cards. Escape, Cancel, Close or a click outside closes it; the text stays for the next time it opens, until it creates cards.
- **The syntax.**
  - Each line is one card, or a chain of cards joined by arrows. Blank lines and empty steps (`A -> -> B`, a trailing `->`) are skipped.
  - An arrow is a line with a head at one end or both. The heads set the arrowheads: `A -> B` points at B, `A <- B` at A (the edge runs from B), `A <-> B` at both.
  - The line sets the stroke: one `-` is solid, `--` (or longer) dashed, any `.` dotted (`.->`, `<-.`, `-.->`), `=` double (`=>`, `<=`, `<=>`). Each arrow in a chain keeps its own.
  - A line with no head draws an edge with no arrowheads when it has three marks or more: `---` solid, `-.-` dotted, `===` double, as Mermaid's open links. There is no dashed one. Shorter, or anything else, a line with no head is text: a hyphenated word, `--` or `...` stays in its card.
  - The text is the note's content. The same text twice in one block is the same card.
  - A card's text in double quotes is taken as written, arrows included: `"Build -> ship" -> Release`. A quote inside it is doubled.
  - Edges follow the [edge](#edges) rules: none from a card to itself, at most one between two cards, either way round.
  - The dialog lists the arrows, counts the cards and edges as they are typed, and shows `->` as typed, even in a font that draws it as an arrow.
- **A preview map** under the text shows what the batch creates as it is typed, laid out as it will land: the cards by their titles only, and the edges with their arrowheads and lines. It fits the map, never drawing a card above half its size on the canvas.
- **Layout** uses `@dagrejs/dagre` along the edges, and centers the whole batch on the point. The dialog picks the direction the edges run: left to right (the default), top to bottom, right to left or bottom to top. The pick stays for the next batches and for [arranging](#arranging-cards) the selected cards, and the preview map follows it. Each card has the size of a card placed by double-click, with `halign: center` and `valign: center`.
- **Run inside a zone,** the cards all join the innermost zone under the point. A zone too small for them grows to hold them, like a resize, its contents staying in place: one graph-paper square of room on the sides and at the bottom, three at the top for its name.
- **One command** writes the batch: the notes, then a grown zone, the cards and the edges.
- **The new cards are selected.** Made zoomed out, where they would be hidden in a collapsed zone or a cluster, or landing partly off-screen, they are framed, zoomed in at least until the zones open.
- **One-shot:** the text creates the cards once and is not kept or linked to them.
- **The whole batch is one undo step.** Undoing it removes the cards and edges and gives a grown zone back its size. The notes stay, in the Unplaced tray, as for any deleted card; redo places them again.
- Not supported yet: edge labels, empty cards, zones.

### Editing edges with the builder

- **Opening it on cards of the canvas.** With a zone selected alone, or one card or more, Mod+B, the rail's Builder button or the selection bar's (icon beside text) opens the builder on them, titled "Edit edges, add cards", with Apply in place of Create. With nothing selected it makes new cards, as above.
  - A zone brings every card inside it, its inner zones' included.
  - Selected cards bring every card an edge joins to one of them, with the edges between all those cards.
  - Cards with no title (empty, unresolved, or a note whose first line is blank) cannot be written, so they are left out, and so are their edges.
- **The text it opens with** writes each edge between those cards on a line of its own, from its first card, then each card no edge joins on a line of its own, cards top to bottom, then left to right.
  - A card is written by its title, the first line of its note. Its note is never rewritten from the builder; new cards are one line, as above.
  - Titles that repeat stay distinct: the later cards are numbered (`Idea #2`), skipping numbers another card's title holds.
  - A title holding an arrow, or starting with a quote, is written in quotes.
  - A dashed edge with no heads, which the syntax cannot write, is written `---` and keeps its dashes while its line stays as written.
- **The text is the truth for the edges between those cards.** Applying it is one undo step:
  - a line removed deletes its edge;
  - an arrow changed restyles its edge (arrowheads, line, direction), keeping its label and shape;
  - a new arrow creates an edge, in the shape of the vault's style for new edges, and a new name a new card;
  - edges to cards the builder did not open with are neither shown nor touched.
  - Cards are never deleted, renamed or moved. A card's name changed in the text is a new card, and the edges of the card it named go.
- **The preview** shows the cards of the canvas where they are and the new cards where they will land, in the accent color, the new and restyled edges in the accent color, and the edges to be removed in red. Beside the directions, the dialog counts the new cards, new edges, changed and removed edges as the text is typed, checked by the backend without writing anything.
- **New cards** join the selected zone, or the zone all the selected cards share, else the canvas; a zone too small grows to hold them, as above. Each group of new cards joined by edges is laid out like a batch, then set beside a card of the canvas it joins, or beside them all, in the picked direction, and moved along until clear of the cards there. They are selected after Apply, and framed where they would be hidden or off-screen.
- The batch rules still hold: at most one edge between two cards, either way round, none from a card to itself, and the text is not kept after Apply.

### Arranging cards

- With two cards or more selected, the selection bar's Arrange button (icon beside text) lays them out as the builder lays out a batch: with dagre, along the edges between them, in the direction last picked in the builder (left to right until then).
- With a zone selected alone, Arrange lays out what is directly in it: its own cards and its inner zones together. An inner zone moves as one block with everything in it, and an edge to a card inside it, at any depth, counts as an edge to it.
- Each card and inner zone keeps its size. The group stays centered where it was, each one landing on the grid when snapping is on.
- Each stays in its zone, which grows where needed to hold them, its contents staying in place, as for a batch. Cards not selected are not moved out of the way.
- It is one undo step.

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
  color     TEXT,                     -- NULL = the theme's plain stock
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
  stroke    TEXT NOT NULL DEFAULT 'solid',
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
- **Mouse and trackpad, like a map:** the mouse wheel, two fingers on a trackpad and a pinch all zoom around the pointer; dragging the paper pans, in any direction. A pinch follows the fingers. Two-finger panning is left out by default because on Windows the touchpad locks each swipe to one axis before the page sees it. A pinch never zooms the window itself.
  - **The wheel can pan instead,** for each device, in Settings > Canvas: Zoom (the default) or Pan. Panning, the wheel and two fingers move the canvas, Shift+wheel sideways (the page turns it sideways when the browser leaves that to it), and Ctrl+wheel and a pinch still zoom around the pointer. It is kept with the interface size: in `device.json` on the desktop, in localStorage in the browser, the default left out.
  - On Windows, Tauri leaves WebView2's pinch zoom off, which drops the pinch before the page sees it; the app turns it on at startup, before the first page loads, so the pinch arrives as a wheel turned with Ctrl held. WebKit, on macOS, reports it as gesture events instead.
- **Framing glides.** Every jump that frames something (a zone list row, a search result, a cluster marker, a bundle, double-clicking a collapsed zone, new cards framed while zoomed out) glides there like a map: a far jump zooms out, travels and zooms back in, along the path that feels shortest (van Wijk and Nuij's, as d3 draws it). It takes 0.25 to 0.8 s, by the length of the path, eased in and out. Opening a vault frames everything at once. The wheel, a pinch and dragging stay direct, and stop a glide where it is.
- **Reduced motion.** When the system asks for reduced motion, glides jump and the panels' animations are off.
- One viewport query per pan or zoom, with a margin so small pans don't need a new query.
- Queries depend on zoom: zoomed out, what is inside a zone comes back only as the boxes of its [preview](#previews), never as cards, and anything smaller than a few pixels on screen is skipped.
- A card's title and excerpt come from the index. The `.md` is read only when a card is opened or zoomed in enough to show its body.
- Zoomed out below 40%, where 14px card text would be under 6px on screen, every zone collapses at once, and loose cards cluster:
  - A collapsed zone draws its frame, its name centered, and a [preview](#previews) of what it holds. The name keeps its size on screen (20px) at any zoom and is cut with an ellipsis at the zone's sides. The frame keeps its line width and corners on screen too.
  - Only the outermost zones show, each with its preview: nothing inside a collapsed zone is drawn as itself or can be picked, child zones included. Its cards' edges are drawn as [bundles](#bundles).
  - The name is still the handle: click selects, drag moves (the contents come along), double-click renames. Double-clicking the body frames the zone, zoomed in at least until it opens, instead of placing a card it would hide. Drawing a zone inside a collapsed zone creates nothing.
  - A collapsed zone smaller on screen than a cluster's marker (96 by 32 pixels, either way) is drawn as a marker instead of its frame, so big zones keep the map's shape and small ones stay readable. The zone marker is centered on the zone and keeps its size on screen: the name on the zone's wash, edged in the zone's color, 32 pixels high and as wide as the name from 96 to 192 pixels, cut with an ellipsis. It is a flat tag, where a cluster's marker is a lifted stack of cards, and it shows no preview. The name is still the handle; the marker's rim around it is the body, so double-clicking the rim frames the zone. A zone marker has no resize handles, and bundles end at its sides.
  - Zooming back in past 40% queries and draws what is inside the zones again, as itself. The cards fade in over 200 ms, as long as dimming takes: their stock from the faded blocks the previews drew, their text from nothing. A card fades in the same way whenever it appears on the canvas (opening the vault, panning to it, undoing its deletion), but not when an edit ends. Zooming out past 40%, the cards fade out over the same 200 ms, into the previews drawn beneath them, and take no presses meanwhile; a card leaving the canvas any other way goes at once.

### Previews

- **A collapsed zone drawn as a frame shows what it holds**, at any depth: every card as a faded block at its real place and size, and every inner zone as a faint frame. It is the zone's general shape at a glance; it has no text.
- **A block is the card's stock:** washed with its color as the card is, or the theme's plain stock for a card with none. The whole preview is faded as a dimmed card is, and an inner zone's frame is drawn as the zone's own frame is.
- **It is not interactive.** Presses go through to the zone's body, which keeps its behavior (dragging pans, double-clicking frames the zone). While a collapsed zone is dragged, its preview moves with it, as its bundles do.
- **The query brings it:** zoomed out, the viewport answer holds, for each collapsed zone it returns, the boxes of the cards and inner zones meeting the queried area, in the zone's coordinates from its corner, the cards grouped by color. Anything smaller than a few pixels on screen is left out, as everywhere, so far out the preview thins to the bigger cards. Loose cards keep their cluster markers.
- **Drawn cheaply:** one SVG inside the zone, with one path per color and one for the inner frames, whatever the number of cards.

### Clusters

- Zoomed out, loose cards (in no zone) are counted per cell of a square grid, each card in the cell holding its center. Each cell is drawn as one marker: "14 notes", or "1 note" for a lone card. No card is drawn.
- The query returns a count per cell and the box around each cell's cards, never the cards themselves. A cell at the edge of the queried area comes back whole.
- A cell is a power of two world units wide, picked so it measures 160 to 320 pixels on screen: as the zoom halves, four cells merge into one, and the new size is queried.
- The cell is computed with `floor()`, not `CAST(... AS INTEGER)`, which rounds toward zero and makes the cells around 0 twice as wide.
- The marker is a small stack of cards in the theme's card stock, with the count in the controls font, centered on the box around its cards. It keeps its size on screen (96 by 32 pixels) at any zoom. Markers of neighboring cells can touch when their cards sit near the line between the cells, and far out, markers of clusters and zones can overlap.
- Clicking a marker frames its cards, zoomed in at least until they show. Dragging from it pans, as on the paper.
- A card placed by double-click, dropped from a panel or batch-created while zoomed out would be hidden in a cluster or a collapsed zone: it is framed, zoomed in until it shows. A double-click whose first click zoomed in (on a marker or a bundle) places nothing.

### Bundles

- Zoomed out, each end of an edge is drawn at the outermost zone holding its card (its frame, or its marker when it is drawn as one) or, for a loose card, at its cell's marker. The edges between two ends are drawn as one line, a bundle. An edge with both cards at the same end lies inside it and is not drawn.
- A bundle is drawn curved and solid, whatever its edges' styles and the style for new edges, from the middle of the sides facing each other. Its line and arrowheads keep their size on screen. It has an arrowhead at each end that at least one of its edges points to: edges both ways give heads at both ends, edges without heads add none.
- The count sits on the line, like an edge's label, when it is 2 or more.
- Clicking the line or its count frames both ends, zoomed in at least until their edges show. Dragging from it pans. While a collapsed zone is dragged, its bundles follow it.
- A bundle is found through its edges' bounds: it is drawn when one of its edges crosses the queried area.

## Appearance

- **Settings is a modal** at `vault/[vaultId]/settings/`: the shared dialog, a centered sheet over the canvas, which stays mounted and visible behind the theme's dialog wash. It is sized as Obsidian's settings are: 90% of the window wide and 85% tall, at most 1100 by 1000 pixels at the interface size, whichever tab is open; a long tab scrolls. Each tab is a child route, so a tab can be linked to: Appearance, Canvas, Keyboard and Vault. The focus stays inside, and the canvas's keys are off while it is open. Escape, Close or a click on the wash goes back to the canvas.
  - **Mod+, opens it** (Ctrl+, or Cmd+, on macOS) from anywhere in a vault, also while typing, on its first tab; the same key again closes it, as the rail's keys open and close the panels.
  - **Appearance:** the vault's theme and the device's interface size, below.
  - **Canvas:** snapping to the grid and the style for new edges, both the vault's, and what the mouse wheel does on this device.
  - **Keyboard:** every key, read-only, grouped by where it works: the canvas, editing, placing a linked card, panels and settings, the zone list, the builder. Each group lists its bindings' own tables, then the keys a control takes itself (Enter in a field, Escape in a dialog), and a last group lists the mouse and trackpad: dragging, the wheel, Shift+wheel, Ctrl+wheel and a pinch, double-clicking, Shift+click, Mod+drag and Alt while dragging.
  - **Vault:** the vault's name and where it lives, in its backend's words. On the desktop, its folder's path and Show in folder, which opens the folder around it in Explorer or Finder with the vault selected (the opener plugin's Rust function, called by a command of the app's own; the plugin is not registered, so its commands stay out of the page's reach). In the browser, that it is kept in this browser and whether the browser agreed to keep it (see [Persistence](#persistence)).
- **Four themes:** Studio, the default, Engineering pad, and two dark ones, Orbit and Cairn.
  - Studio: a cool gray canvas dotted at the grid crossings, white cards with a hairline edge, graphite text and a petrol accent. Instrument Sans for notes and controls; zone names are set narrower.
  - Engineering pad: sage graph paper, index cards with a red rule under the title, fountain-pen blue. Literata for notes, IBM Plex Sans for controls.
  - Orbit (futuristic): a deep navy canvas with faint major lines and brighter nodes where they cross, cards edged in light, an ice-blue accent. Saira for notes and controls; zone names are set narrower.
  - Cairn (eerie, Celtic): a peat-moss canvas with a faint speckle, slate cards with a dim gold rule under the title, fog-pale text and a bog-gold accent. Alegreya for notes, Alegreya Sans for controls.
- **A theme is a set of design tokens:** CSS custom properties, picked by the `data-theme` attribute on the root element. A new theme, or a dark variant, is a new set of values with no component changes.
  - The tokens also set whether the theme is light or dark (for scrollbars and form controls), the wash behind a dialog, how strongly zones and cards are washed (more on dark paper, so each highlighter still reads as its color), and an x-height for fonts that run small, so text reads the same size in every theme.
  - Fonts are bundled with the app; nothing loads from the network.
- **The theme belongs to the vault.** Picking one in Appearance applies it at once and writes it to `vault.json`, so the vault looks the same on every device that opens it. The default is left out of the file; a theme this build does not know shows as the default.
- **Screens outside a vault** (the vault picker, errors) use the default theme.
- **The interface size belongs to the device:** 100% (the default), 115% or 130%, picked in Appearance, applied at once and kept in the app-data folder's `device.json`, the same in every vault and never synced. The default is left out of the file.
  - It scales the chrome: the vault card, the rail, the zoom controls, the zone list, the tray and search's sheet, the selection bar, the batch dialog, menus and tooltips, the settings dialog and the vault picker.
  - It never scales the canvas's cards, zones and edges, nor the marks drawn at a constant size on screen over them: zone names once collapsed, zone and cluster markers, bundles and resize handles. They belong to the map, and the zoomed-out map is built on their sizes.
  - It works through CSS `zoom` on each piece of chrome, never through the WebView's own zoom, which would scale the canvas too and fight the pinch. `zoom` scales viewport units along with everything else, so chrome sizes itself against the window with percentages instead.
- Zone and card colors live in their files, so they are the same in every theme. The default zone gray, for a zone with no color, and the plain card stock, for a card with none, come from the theme.
- Later: a dark mode (Orbit and Cairn are dark themes of their own, not that feature).

## Sync

- The vault works with folder-sync tools (Syncthing, Dropbox, Google Drive). They don't merge files: two devices writing the same file before syncing produce a conflict copy.
- With one file per item, conflicts only happen when two devices change the same note, card, zone or edge before syncing, and the conflict copy is a small file.
- Files synced in while the app is open show up at the next startup.
- Files can arrive out of order. A card whose note hasn't arrived yet shows as unresolved until the first startup after it arrives.
- Known case: the same empty card filled on two offline devices. Each device creates its own note and points the card at it, so the card file conflicts. The card is pointed at one note and the other goes to the Unplaced tray. Both texts survive.
- Not planned: a per-device append-only operation log (`.canvas/ops/<device-id>.jsonl`). It would avoid conflicts entirely, but it means building a CRDT and the files stop being readable by hand.

## Browser

The web build runs the same app in a browser, without Tauri: the [platform layer](#responsibilities) talks to the browser backend, TypeScript on IndexedDB, with no WebAssembly. It is a static site for GitHub Pages, under `/vsb`.

### Storage

- **One IndexedDB database per vault** (`vsb-<vault-id>`), holding what a vault folder holds on the desktop: the vault's settings as `vault.json` has them, the notes, and one record per zone, card and edge holding exactly the JSON its file would hold, defaults left out. Item states, undo and every edit are the desktop's.
- **A note keeps a path**, `notes/<title>.md`, named after its title as on the desktop: characters Windows rejects left out, a clash numbered (ignoring case), renamed on blur. Search and the tray show it, and a vault written out as files would use it.
- **The same records hold what the desktop's index derives**, kept up to date in the transaction of every write: each card's absolute box and its note's title and excerpt, each edge's two card boxes. This device's `ui_state` is kept in the vault's database too. What SQLite gives the desktop, the browser backend builds itself:
  - **A spatial index.** Each card and edge is filed under every square of a grid it overlaps, the squares 1024, 4096, 16,384 or 65,536 world units wide, the smallest at least a quarter of its size, so a long edge spans at most five a side; bigger ones go in one bucket. A viewport query reads one key range per column of squares the queried area overlaps, never every card.
  - **The zoomed-out map.** Cluster counts and boxes per cell, and bundle counts, arrowheads and boxes per pair of ends, are kept on every write for the cell sizes the canvas asks for, 512 to 4096 (40% zoom down to 5%); another size is refused. A zoomed-out query reads them, never the cards: the clusters of the columns it covers, and every bundle of its cell size, kept when the box around its edges meets the queried area. A box only shrinks when something reaching its side leaves, and is then measured again from what is left.
  - **A bundle counts all its edges.** On the desktop a bundle's count and arrowheads come from those of its edges whose own box meets the queried area, so they change as the window moves; in the browser they come from all the edges between its two ends, as [Bundles](#bundles) describes them. A bundle is found when the box around all its edges meets the area: on rare layouts one more than on the desktop, never one fewer.
  - **Search.** A word index of its own: for each word, folded (case and accents left out), the notes holding it and those holding it in their title, split in sixteen shards by note, so a save rewrites small records and a word typed reads a few. Every word typed must start a word of the note, as with FTS5. Best first means: a title word counts thrice, every other word starting as typed once; the matches are the desktop's, their order is not bm25's.
  - **Zones in memory.** While a vault is open its zones are held in memory: a vault has few, and the desktop walks them all on every query too. Each zone record keeps the cards it holds directly, each card's box and color, for the zone list's counts, framing and the [previews](#previews), so a zoomed-out query never reads the cards. A vault from before (database version 1, which kept a count and a box) gets them when it is next opened.
- **One command at a time**, as the desktop's lock runs them, and each edit is one transaction: it lands whole or not at all.

### Vaults by name

- **A vault is chosen by name**, not by folder. The vault picker says "Name a vault. Your notes stay in this browser.", and its button, "Open a vault", asks for a name, in a dialog the browser backend mounts. A name already used, ignoring case, opens that vault, as choosing a folder that already is a vault does.
- **The vault list lives in localStorage**, most recent first, as `vaults.json` does on the desktop. A browser vault has no path.
- **This device's settings live in localStorage too:** the interface size and what the wheel does, as `device.json` holds them.
- **One tab per vault.** A tab holds a Web Lock on the vault while it is open. Another tab opening it gets "This vault is open in another tab", on the error page, rather than two tabs writing over each other. Closing the tab, or opening another vault in it, lets it go.

### What does not apply

- **The startup scan, the check before every write and conflict copies.** Nothing changes a vault from outside the browser, so a save always lands (`saveNote` returns true) and a card is unresolved only when its note was deleted. These are no-ops, not missing features.
- **Sync, atomic file writes and the write order.** A browser vault lives in one browser; a transaction stands in for the other two.

### Persistence

- **Opening or creating a vault asks the browser to keep its storage** (`navigator.storage.persist()`). The browser decides: Chrome from how the site is used, without asking; Firefox asks the user.
- **The risk:** a browser may clear a site's data. The user can clear it with their browsing data; a browser short of disk evicts sites that are not persisted; Safari clears a site not visited for seven days unless it was added to the Home Screen. Until a vault can be exported, its notes in a browser are only as safe as the browser's storage; the desktop app is where they are owned as files.
- **Settings > Vault says where it stands:** whether the browser agreed to keep the vault's data (`navigator.storage.persisted()`), with the risk above in short. Until it has, an Ask again button asks once more (`persist()`) and the tab looks again.

### The web build

- `pnpm build:web` writes the static site to `build/web`, for `/vsb`. Every route is served by the app's one page, also copied to `404.html`, which GitHub Pages serves for any path it does not know, so a link to a vault opens it. The app's folder is `app`, not `_app`, which Jekyll would leave out. `pnpm dev:web` serves it on port 5175.
- Its configuration is `vite.web.config.ts`: the desktop's `vite.config.ts` does not change.

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
- AI assistance and paper import are not covered by this spec.
- Exporting a browser vault as vault files, and importing a vault folder into the browser: not built. The records already hold each file's JSON and each note's path.