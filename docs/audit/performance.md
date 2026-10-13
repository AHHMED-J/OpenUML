# Performance audit

Date: 2026-10-12. Scope: layout and render hot paths (`diagram/layout`, `diagram/render`,
`diagram/editor`, `diagram/core`), the model engine and store, the Model Explorer, the dock,
startup and bundle size, the test and CI setup, and memory growth.

## Method

All numbers were measured before optimizing anything, on generated models, with the same
harness run against the original source and the optimized source back to back (Apple Silicon,
Node 24, medians of 5 to 15 runs after warm-up; deterministic fixed-width text measurer unless
stated).

- **Node benchmarks of the pure code** (layout, edits, undo, `.mdj`, explorer tree). A trimmed
  version is committed in `bench/layout.perf.ts`; run it with
  `npx vitest run -c bench/vitest.config.ts` (it is not part of `npm test`).
- **React rendering**: `ModelExplorer` and `DiagramEditor` mounted with `react-dom` in jsdom, with
  the real stores. Each case measures the synchronous re-render after one model edit (a rename)
  and after a selection change. jsdom is slower than Chromium at DOM work, so use these numbers
  to compare before and after, not as absolute times.
- **Startup**: the built app started in a hidden Electron instance that cannot take focus (own
  profile under `/tmp`, driven only through the Chrome DevTools Protocol), reading navigation and
  paint timings and the `Performance` domain metrics.
- **CPU profiles** (V8 sampling profiler) to find where the time goes.

Generated models: class diagrams with 200, 500 and 1000 classes (3 attributes and 2 operations
each, n - 1 associations and generalizations); a sequence diagram with 50 lifelines and 500
messages; an IDEF0 model decomposed 6 x 4 x 4 (32 diagrams); a role activity diagram (RAD) with
20 roles of 20 activities and 19 state lines each; a project of 50 class diagrams with 40 classes
each (64,803 elements, 27 MB as `.mdj`).

## Results

### Layout and editing (Node)

| Case | Before | After |
| --- | ---: | ---: |
| Class 200: full layout | 2.63 ms | 1.59 ms |
| Class 200: one edit (move a class, geometry write-back, editor re-layout) | 6.97 ms | 2.96 ms |
| Class 200: live drag preview frame | 6.14 ms | 2.59 ms |
| Class 500: full layout | 5.18 ms | 3.21 ms |
| Class 500: one edit | 14.91 ms | 6.09 ms |
| Class 500: live drag preview frame | 15.19 ms | 6.44 ms |
| Class 1000: full layout | 10.70 ms | 6.07 ms |
| Class 1000: one edit | 35.24 ms | 15.98 ms |
| Class 1000: live drag preview frame | 34.54 ms | 15.32 ms |
| Class 1000: undo + redo of a move | 0.02 ms | 0.02 ms |
| Class 1000: add an attribute | 1.34 ms | 0.97 ms |
| Text width cache, 1000 classes: warm hit rate | 0 % | 100 % |
| Text width cache, 1000 classes: warm layout with a canvas-like measurer | 13.68 ms | 7.60 ms |
| Sequence 50 x 500: full layout | 4.09 ms | 3.10 ms |
| Sequence 50 x 500: move a lifeline | 7.90 ms | 6.26 ms |
| IDEF0 6 x 4 x 4: draw a boundary arrow at depth 3 (propagates to A-0) | 0.66 ms | 0.51 ms |
| IDEF0: move a box (normalize hook) | 0.27 ms | 0.20 ms |
| RAD 20 x 20: full layout | 16.32 ms | 3.87 ms |
| RAD 20 x 20: move an activity | 32.63 ms | 7.60 ms |
| Project 50 diagrams: move a class in one diagram | 0.86 ms | 0.51 ms |
| Explorer tree of 64,803 elements, all expanded (14,003 rows) | 7.54 ms | 6.65 ms |
| Explorer search | 3.08 ms | 1.93 ms |
| `.mdj` write, 27 MB | 71.7 ms | 72.9 ms |
| `.mdj` read, 27 MB | 321.8 ms | 304.2 ms |
| Heap held by the loaded 27 MB project | 110 MB | 109 MB |

The canvas-like measurer measures time spent in the cache; a real canvas `measureText` costs
more than the stand-in, so in the app the gain of the cache fix is larger than the 1.8x shown.

### React rendering (jsdom)

| Case | Before | After |
| --- | ---: | ---: |
| Explorer, 1000 classes in a package (1003 rows): mount | 155.7 ms | 52.5 ms |
| Explorer, 1003 rows: re-render after an edit | 10.0 ms | 1.3 ms |
| Explorer, 1003 rows: re-render after a selection change | 8.8 ms | 1.0 ms |
| Explorer, all expanded (6003 rows): mount | 728.8 ms | 62.6 ms |
| Explorer, 6003 rows: edit / selection change | 61.4 / 59.5 ms | 4.1 / 0.9 ms |
| Explorer, all expanded (12,003 rows): mount | 1356 ms | 74.7 ms |
| Explorer, 12,003 rows: edit / selection change | 125.3 / 122.2 ms | 8.0 / 0.8 ms |
| Diagram editor, 1000 classes: re-render after an edit (layout included) | 11.7 ms | 8.7 ms |
| Diagram editor, 1000 classes: selection change | 0.3 ms | 0.4 ms |

### Startup and bundle

| Case | Before | After |
| --- | ---: | ---: |
| Renderer JavaScript | 2,183 KB (431 KB gzipped) | 994 KB (301 KB gzipped) |
| Renderer CSS | 27.1 KB | 20.4 KB |
| V8 compile of the renderer bundle (Node) | 12.4 ms | 9.1 ms |
| Hidden Electron start: DOMContentLoaded | 65 ms | 58 ms |
| Hidden Electron start: script time until idle | 33 ms | 28 ms |
| Hidden Electron start: first contentful paint | 120 ms | 111 ms |

## Findings and changes

1. **Structural sharing serialized every view layout** (`layout/layoutDiagram.ts`). To reuse an
   unchanged view's layout object (so its memoized component skips rendering), every pass ran
   `JSON.stringify` on every new layout and kept the strings in a `WeakMap`, also for passes
   without a previous layout (geometry write-back, previews). It was the top item of the
   profiles (about 30 % of a drag preview frame, plus garbage collection). It is now an
   allocation-free deep comparison that stops at the first difference, with the same semantics
   (undefined properties absent, key order ignored).
   Commit: `perf(layout): compare view layouts structurally instead of serializing them`.

2. **The text width cache never hit on large diagrams** (`core/text.ts`). `CanvasTextMeasurer`
   cleared its whole cache when it reached 5000 entries; a 1000-class diagram measures 6000
   distinct strings per pass, so every layout pass re-measured everything through canvas
   `measureText`. The cache now has two generations of 20,000 entries (old entries promoted on
   use): the warm hit rate went from 0 to 100 % and memory stays bounded (at most 40,000 widths).
   Commit: `perf(layout): keep the text width cache warm for large diagrams`.

3. **Metaclass lookups allocated on every call** (`model/metamodel.ts`). `resolve(name, seen =
   new Set())` evaluated its default parameter, a new `Set`, on every `isKindOf` and `fieldOf`
   call, cache hit or not, and `containmentFields`/`referenceFields` filtered the field list on
   every call of every tree walk (`walk`, `register`, explorer, `.mdj`). Lookups no longer
   allocate and the field groups are computed once per metaclass.
   Commit: `perf(model): stop allocating in metaclass lookups and cache field groups`.

4. **A move laid the diagram out three times** (`editor/actions.ts`). `moveSelection` computed
   a full layout only to read the move axis of the moved views, then the geometry write-back laid
   the diagram out again, then the editor re-laid it out with structural sharing. The editor now
   passes the layout it already has, so a move and each live drag frame cost two passes. The
   live drag preview of a 1000-class diagram went from 35 ms (2 frames at 60 Hz) to 15 ms.
   Commit: `perf(editor): reuse the editor's layout for the move axis of a move`.

5. **RAD layout was quadratic** (`rad/layout.ts`, `rad/routing.ts`). Every activity scanned all
   views of the diagram for the state lines entering it and for its link partners, and every
   bus line for its siblings; every symbol also copied its whole view object. A per-pass edge
   index (`layout/passIndex.ts`, keyed by the pass's `LayoutContext`) and a prototype-backed
   fixed-size view overlay cut the 20 x 20 layout from 16 to 4 ms.
   Commit: `perf(layout): index RAD state lines and links once per layout pass`.

6. **The Model Explorer rendered every row** (`ui/explorer/ModelExplorer.tsx`). Every model change
   and every selection change (also selections made on the canvas) re-rendered all expanded rows,
   about 10 ms per change for 1000 rows and 125 ms for 12,000 rows in jsdom. Rows have a fixed
   height, so the explorer now renders only the rows in view plus 12 above and below, with
   spacers for the rest (`ui/explorer/virtualRows.ts`). Keyboard navigation and Reveal scroll
   to the row by its index.
   Commit: `perf(explorer): render only the Model Explorer rows near the viewport`.

7. **The production renderer was not minified** (`electron.vite.config.ts`). electron-vite
   leaves the renderer unminified by default; it is now minified (no source maps are shipped,
   no code relies on function names).
   Commit: `build(renderer): minify the production renderer bundle`.

8. **Benchmarks** are committed so these numbers can be checked again.
   Commit: `test(bench): add layout and editing benchmarks on large generated models`.

## Checked and fine as is

- **Incremental edits do not re-layout the project.** The geometry write-back lays out only the
  edited diagram (a move in a 50-diagram project: 0.5 ms). IDEF0 propagation lays out each
  diagram it changes, which is small (0.5 ms for a 3-level propagation), and the normalizer hook
  costs 0.2 ms per edit.
- **Undo and redo** replay recorded steps rather than snapshots: 0.02 ms for a move at 1000
  classes. The history is capped at 100 operations; 25 moves at 1000 classes hold about 220 KB
  of step data (geometry write-back of the rerouted edges), so a full history is around 1 MB.
  Insert/remove steps keep a JSON copy of the subtree, so deleting a large package keeps its
  copy until the operation leaves the history, which is the expected cost of undoing it.
- **Store subscriptions** select single fields; `version` is subscribed to by the editor, the
  explorer, the property editor, the toolbar, the status bar and the working-diagram list, all of
  which need it. The drag preview runs in `ModelEngine.simulate`, which does not notify the store,
  so dragging re-renders only the editor, and only the views whose layout changed.
  `NodeItem`/`EdgeItem` are memoized on layout identity, which the sharing keeps stable.
- **Selection changes on the canvas** cost 0.3 to 0.4 ms in the editor at 1000 classes.
- **Listeners, observers and timers**: every `addEventListener` in the editor, dock drag controller,
  menus, explorer and lifecycle has a matching removal; `ResizeObserver`s are disconnected and
  animation frames cancelled on unmount; the project store unsubscribes from the previous engine
  when a project is opened. No growing caches remain (layout signatures and the text cache were
  the two candidates).
- **Packaged contents**: the `files` list ships `out/`, `resources/` and `package.json` only; no
  tests, fixtures, docs, sources or benchmarks reach the asar.
- **Tests** run in about 2 s (81 files, parallel workers); nothing is slow enough to tune.

## Left open

- **`zustand` ships twice.** It is bundled into the renderer and also copied into the asar as a
  production dependency (about 170 KB; the inspected build also still contained `immer`, now
  removed from the dependencies). Moving `zustand` to `devDependencies` would leave the asar
  without `node_modules`. Not changed here because `package.json` is owned by the security audit.
- **Adding a feature scans the whole repository.** `addFeature` calls `Repository.viewsOf`, a scan
  of every element, to add item views to the owner's views (1 ms at 32,000 elements; building
  thousands of features in one go is quadratic). A model-to-views reverse index would need hooks
  on every `model` assignment; not worth it at the sizes users edit.
- **Other notation families still scan `diagram.ownedViews` per view** (activity, state machine,
  composite, component interfaces, timing, IDEF0 arrows, sequence frame lookup). They are not
  measurable at realistic sizes (sequence 50 x 500: 3 ms per layout), but `layout/passIndex.ts`
  is there if one of them grows.
- **A layout pass is still a full pass.** Each edit lays out the edited diagram twice (geometry
  write-back, then the editor); about 6 ms each at 1000 classes. Skipping unchanged views would
  need dependency tracking between views (edges depend on nodes, containers on children), a
  larger change than the remaining cost justifies.
- **`.mdj` reading** (300 ms for 27 MB) is spread over parsing, element instantiation, reference
  resolution and model repair with no single hot spot; `src/renderer/src/format/` belongs to the
  security audit.
- **The status bar recounts IDEF0 warnings on every store change** (its selector calls
  `validateIdef0`); 0.2 ms on the 32-diagram model, so left as is.
- **Explorer rows out of view are not in the DOM**, so `aria-activedescendant` can point at a row
  that is not rendered after scrolling it away with the mouse; keyboard navigation always brings
  the focused row back into view.
- **CI** (`.github/workflows/release.yml`, owned by the security audit) already caches npm. The
  build jobs could also cache the Electron and electron-builder downloads
  (`~/.cache/electron`, `~/.cache/electron-builder`, `~/Library/Caches/electron` on macOS) to
  save a download of about 100 MB per runner.
- **Vitest** suggests `fsModuleCache` to persist transforms between runs; the suite already
  takes about 2 s, so it is not worth a configuration change.

## Follow-ups

- **Explorer accessibility after virtualization (was left open).** The focused row, which is the
  tree's `aria-activedescendant`, is always rendered in place (with spacers around it) even when
  it is scrolled out of the rendered window, so screen readers keep their focus after mouse
  scrolling; tabbing into the tree also scrolls it back into view. This adds at most one row to
  the DOM (`virtualRows.ts` `rowSlots`, `743c4db`).
- **CI downloads (was left open).** The release build jobs cache the Electron and electron-builder
  downloads per OS and version (`b91a586`, see [security.md](security.md)).
- **Editor preferences.** The grid size preference only changes the step used by snapping and the
  spacing of the grid pattern; the default font size is applied once, inside the creating
  operation, to the views it inserts. Neither adds work to layout or dragging (`c9ff927`).
