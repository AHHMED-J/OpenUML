# Code-quality audit

Scope: the renderer (`src/renderer/src/**`) except `format/` and `export/`, the dependency list,
`docs/ARCHITECTURE.md` and the test suite. `src/main/**`, `src/preload/**`, `src/shared/**`,
`format/`, `export/` and the build configuration belong to the security audit
([security.md](security.md)); rendering, layout, editor and store hot paths belong to the
performance audit. Where this audit touched a file in those areas the change was kept to a few
lines (an `export` keyword, an import, a shared helper).

Every change is behavior-preserving and was checked with `npm run typecheck`, `npm test` and
`npx electron-vite build`.

## Results

| Measure | Before | After |
|---------|--------|-------|
| knip unused exports | 103 | 0 in the renderer (3 in `src/main/**`, see finding 4) |
| knip unused exported types | 42 | 0 |
| knip unused dependencies | `immer` (missed by knip because zustand lists it as an optional peer) | none |
| jscpd clones (`--min-lines 8 --min-tokens 70`, tests and fixtures excluded) | 20 clones, 276 lines (0.75%) | 4 clones, 45 lines (0.12%) |
| Lines in the audit commits | | 557 added, 1026 removed (544 / 1011 under `src/`) |

`npm run lint:unused` runs knip 6.41.0 with `knip.json`.

## Findings

Categories: **Dead code**, **Duplication**, **Smell** (casts, error handling, naming, magic
numbers), **Unused** (CSS, icons, preferences, scripts), **Docs**, **Tests**.

### Dead code and exports

| # | Category | Location | Finding | Action |
|---|----------|----------|---------|--------|
| 1 | Unused | `package.json` | `immer` was a runtime dependency but is never imported | Removed with `npm uninstall`, lockfile updated (`b1ed8a4`) |
| 2 | Dead code | `diagram/core/{geometry,viewport,style}.ts`, `diagram/idef0/geometry.ts`, `diagram/uml/{activity,communication,component,sequence}`, `diagram/commands.ts`, `ui/dock/dragController.ts` | Helpers and constants nothing referenced: `pt`, `midpoint`, `floorPoint`, `translateRect`, `roundRect`, `snapRectPosition`, `screenToDiagramLength`, `sideOfRole`, `opposite`, `swimlaneHeaderSize`, `isMessageView`, `isDockDragging`, `NUDGE_GRID_STEP`, `LINE_WIDTH`, `COMPARTMENT_TITLE_FONT_SCALE`, `MESSAGE_STACK_STEP`, `displayFormOf`, the `HorizontalAlignment` / `VerticalAlignment` code tables, the `NodeLabelKind` and `Idef0StatusLiteral` types. `DEFAULT_SEQUENCE_FRAME` (692 × 592) no longer matched the 700 × 600 frame the factory creates | Deleted (`75cf2c2`, `8f3a7e7`, `5e65333`). The swimlane renderer now uses `SWIMLANE_LINE_WIDTH` instead of a literal `2` |
| 3 | Dead code | about 150 symbols across `diagram/**`, `model/factories-{statemachine,timing}.ts`, `ui/**` | Exported but used only in their own file; unused pass-through re-exports in the family `index.ts` files, `render/generic.tsx`, `idef0/geometry.ts`, `idef0/strings.ts`, `object/containers.ts`; `ui/index.ts` re-exported the UI store and the drag type although only `Shell` is imported | Un-exported or removed (`8f3a7e7`, `39ad29e`, `5b24681`, `85f3832`) |
| 4 | Dead code | `src/main/appProtocol.ts` (`APP_HOST`), `src/main/fileAccess.ts` (`MAX_PROJECT_BYTES`), `src/main/ipcValidation.ts` (`MAX_PATH_LENGTH`) | Exported but unused; new code from the security audit | Left for the owner of `src/main/**`; they are the only knip findings left |
| 5 | Dead code | `ui/app/appCommands.ts` | The shell registered fallback select all, zoom, line style, view format, alignment and z-order commands for ids still free, but `registerDiagramCommands` always registers all 31 of them first (checked by registering both into one registry). About 180 lines duplicating `diagram/commands.ts` and `editor/alignment.ts` never ran | Removed (`a79eb71`). If `registerDiagramCommands` throws, those menu items are now disabled instead of running the copies |
| 6 | Config | `knip.json` | knip reported the documented module barrels as unused API | Added `knip.json`: the module barrels (`model`, `commands`, `diagram`, `format`, `export`, `store`) and the IPC contract `src/shared/ipc.ts` are entry points, and the Vitest plugin picks up the tests. Added `npm run lint:unused` (`5738275`) |

### Duplication

| # | Location | Finding | Action |
|---|----------|---------|--------|
| 7 | `render/generic.tsx`, `uml/timing/render.tsx` | `TimingFrameNode` copied the generic frame renderer line for line | The timing frame uses the exported `Frame` (`40b35ed`) |
| 8 | `uml/{class,object,sequence,statemachine,timing}/render.tsx` | Five local `Line` components | One `SvgLine` in `render/primitives.tsx` (`6f42e70`) |
| 9 | `uml/activity/layout.ts`, `uml/statemachine/layout.ts`, `uml/composite/layout.ts` | The host view lookup of pins and connection point references, and the host layout computation (three copies) | `diagram/uml/gluedViews.ts` (`efba040`). The port lookup of composite also matches the owner's type, so it stays separate |
| 10 | `uml/sequence/messages.ts`, `uml/timing/edges.ts` | Message label specs (name, stereotype, property) | `messageLabelSpecs` exported from sequence (`60d69d6`) |
| 11 | `editor/quickEditSyntax.ts`, `uml/object/strings.ts`, `uml/sequence/strings.ts` | Three copies of the stereotype and visibility prefix parser, plus two visibility tables | `parseQuickEditPrefix` (`7f6e7ae`) |
| 12 | `editor/quickEditApply.ts`, `uml/object/quickEdit.ts`, `uml/sequence/quickEdit.ts` | Stereotype and type resolution of quick edits | `setStereotype` and `typeValue` exported from `quickEditApply.ts` (`5f8c07a`) |
| 13 | `model/factories.ts`, `model/structure-factories.ts`, `model/factories-statemachine.ts` | Default points of a new edge (center to center, or a self loop) | `defaultEdgePoints` in `view-builders.ts` (`cc4b253`) |
| 14 | `uml/class/layout.ts`, `uml/usecase/layout.ts`, `uml/component/layout.ts`, `uml/deployment/layout.ts` | Four copies of the compartment stacking loop; use case repeated the classifier format and the attribute and operation rows | `stackCompartments`, `featureFormatOf`, `attributeRows`, `operationRows` (`fcb1f40`) |
| 15 | `rad/render.tsx` | The inscribed circle of waits, refinements and case branches (three copies) | `CircleIn` (`4c28a2e`) |
| 16 | `ui/properties/PropertyEditor.tsx` | The choose-element button of reference fields and type fields | `ChooseElementButton` (`80bba49`) |
| 17 | `ui/properties/StyleEditor.tsx`, `ui/dialogs/PreferencesDialog.tsx`, `ui/uiStore.ts` | Copies of `FONT_SIZES` and of the zoom range (`ZOOM_MIN`, `ZOOM_MAX`, an unused `ZOOM_STEP`) from `diagram/core/style.ts` | Imported through the diagram barrel (`6bcb14c`). The store still rounds zoom to whole percents, as before |
| 18 | `diagram/clipboard.ts` `remapAll`, `format/fragment.ts` `remapIds` | The same ID and `$ref` rewriting | Left: `remapIds` takes one root and does not return the old to new map that the clipboard needs. Sharing it means changing `format/`, which belongs to the security audit. Suggested: make `remapIds` take several roots and return the map |
| 19 | `uml/usecase/layout.ts`, `uml/timing/render.tsx`, `uml/statemachine/render.tsx` | Three similarities inside a single file (9 to 13 lines each) | Left: the same calls with different geometry. A helper would not make them clearer |

### Smells

| # | Location | Finding | Action |
|---|----------|---------|--------|
| 20 | `rad/layout.ts` | `as unknown as { tail; head }` on values that `edgesAt` already types as `EdgeView` | Removed (`72b675c`) |
| 21 | `render/registry.ts` (`typeOnly`), `uml/object/containers.ts`, `idef0/edges.ts`, `clipboard.ts`, `model/structure-factories.ts` | Five other `as unknown as` casts (type-only probe views, a validated JSON payload, `hostEdge`). There are also about 570 plain `as` casts, mostly narrowing `Elem` fields of the dynamic metamodel | Left: they stand for checks done at runtime. A typed `nodeNotationForType(viewType)` in the registry would remove the copy in `object/containers.ts` (registry belongs to the performance audit) |
| 22 | `editor/DiagramEditor.tsx` (4 places), `editor/actions.ts` (3) | Invalid connections, drops that cannot be placed and failed creations go only to `console.warn`, so the user gets no feedback. Paste errors use the `notify` toast | Left: this changes behavior, and the editor belongs to the performance audit. Suggested: send these through the same `notify` callback as paste |
| 23 | `ui/app/commands.ts` | A failure in `registerDiagramCommands` is logged with `console.error` only | Left. With finding 5 those commands are now missing, not duplicated. Consider a toast |
| 24 | `catch {}` blocks (persist, clipboard, pointer capture, notation probes, host layouts) | Each has a comment or returns a fallback value. No `catch` swallows an error the user should see | No action |
| 25 | Whole renderer | No `console.log`, `TODO`, `FIXME`, `any`, `@ts-ignore` or commented-out code. One non-null assertion (`menus/commandIds.ts`), guarded by a length check | No action |
| 26 | `editor/DiagramEditor.tsx` (`DiagramEditor` is about 900 lines), `ui/explorer/ModelExplorer.tsx` (`ModelExplorer` is about 340 lines), `ui/icons.tsx` (`typeGlyph` is a 500-line lookup) | Long functions | Left: splitting `DiagramEditor` overlaps with the performance work on the editor. `typeGlyph` is a flat table, easy to read. `ModelExplorer` could move its row rendering into a component later |
| 27 | `diagram/layout/{helpers,edges}.ts` import `format/cssColor` directly; `export/svg.tsx` imports diagram internals | Deep cross-module imports, against the rule that imports go through `index.ts` | Left (performance and security areas). Low risk |

### Unused UI, settings and scripts

| # | Location | Finding | Action |
|---|----------|---------|--------|
| 28 | `ui/styles.css` | `.section-header` matches no element. `role-*`, `dock-edge-*`, `splitter-*` and `*-panel` classes are built with template strings and are used | Removed `.section-header` (`039b4ee`) |
| 29 | `ui/icons.tsx` | Every `UiIconName` is referenced | No action |
| 30 | Preferences, `ui/uiStore.ts` and `PreferencesDialog.tsx` | **Grid Size** and **Default Font Size** can be changed and are saved, but nothing reads them. The editor always uses `GRID.size` (8), and new views use `DEFAULT_FONT` | Left open: it needs either wiring (`DiagramEditor` grid and snapping; the font of the node factories) or hiding the two controls. That is a product decision |
| 31 | `package.json` scripts | All scripts are current | Added `lint:unused` |

### Docs and tests

| # | Location | Finding | Action |
|---|----------|---------|--------|
| 32 | `docs/ARCHITECTURE.md` | It placed keymaps and menus in `commands/` (they are in `ui/`) and preferences in `store/` (they are in `ui/uiStore.ts`) | Corrected. It also mentions the knip barrel check (`86f9101`) |
| 33 | `diagram/uml/*/layout.test.ts` (10 files) | Each redefined `CHAR`, `BOLD_CHAR` and `nameWidth` for the fixed-width test measurer | Moved to `diagram/testUtils.ts` (`6a5cf5f`) |
| 34 | `diagram/uml/sequence/layout.test.ts` and others | Some suites build their own repository, engine and measurer instead of `testDiagram()` | Left: they need options `testDiagram` does not offer (a custom diagram kind, direct layout calls) |
| 35 | All `*.test.ts` | No test uses timers or the clock, and every `it` block makes an assertion | No action |

## Commits

- `chore(deps): remove the unused immer dependency`
- `refactor(diagram): delete unused geometry helpers, constants and aliases`
- `refactor(diagram): un-export module-local symbols and trim unused re-exports`
- `refactor(model): un-export factory helpers used only in their own file`
- `refactor(ui): un-export module-local symbols and reduce the ui barrel to Shell`
- `refactor(ui): drop shell fallbacks for commands the diagram module always registers`
- `refactor(ui): take font sizes and the zoom range from the diagram module`
- `refactor(diagram): delete the unused alignment code tables of core/style`
- `chore(deps): add a knip config and an npm run lint:unused script`
- `refactor(timing): draw the timing frame with the generic Frame component`
- `refactor(diagram): share one SvgLine primitive instead of five local Line components`
- `refactor(diagram): share the host-view lookup of pins, ports and connection points`
- `refactor(timing): reuse the sequence message label specs for timing messages`
- `refactor(diagram): share the quick-edit stereotype and visibility prefix parser`
- `refactor(diagram): share the quick-edit stereotype and type setters`
- `refactor(model): share the default points of new edges`
- `refactor(rad): draw the inscribed circle of waits, refinements and branches once`
- `refactor(class): share compartment stacking and feature rows with use case, component and deployment layouts`
- `chore(diagram): remove blank lines left behind by the dead-code removal`
- `refactor(properties): share the choose-element button of reference and type fields`
- `chore(ui): drop the unused .section-header selector`
- `docs(architecture): correct where keymaps, menus and preferences live`
- `test(diagram): share the fixed-width character constants of the layout tests`
- `refactor(rad): drop as-unknown casts on edge views in the layout`
- `refactor(explorer): keep the row overscan constant module-local`

## Follow-ups

Open items resolved after the audit:

| # | Finding | Resolution |
|---|---------|------------|
| 18 | Clipboard and fragment ID remapping duplicated | `format/fragment.ts` has `remapTreeIds(roots)`, which remaps several trees and returns the old to new ID map; `remapIds` is its single-root form. The clipboard's `remapAll` is gone: paste and duplicate use `remapTreeIds`. Clipboard text still goes through `parseJsonText` (depth limit, no `__proto__`), and the remapper never copies a `__proto__` key either (`1cfb6a8`, `32c82ae`) |
| 22 | Refused editor gestures only reached `console.warn` | Invalid connections and reconnections, elements that cannot be created where they were drawn, and views dropped entirely inside a container that does not take them show one plain-language toast per gesture, for example "A Generalization can't connect an Actor to a Package" (`diagram/editor/feedback.ts`, `DiagramEditor` `onNotify`). Factory rules throw `ModelRuleError`, whose message is shown as is; only unexpected errors are logged. A toast already shown is replaced rather than stacked (`1dadec1`, `ed1de29`, `4fe1319`) |
| 23 | A failure in `registerDiagramCommands` was only logged | It also shows an error toast (`248f51f`) |
| 30 | Grid Size and Default Font Size preferences were unused | Grid size (2 to 64 diagram units, other values fall back to 8) drives the drawn grid (lines every two steps, at least 8 units apart), snapping and the Shift+arrow nudge. Default font size is given to the views the editor creates (tools, double-click text, line tools, IDEF0 arrows) where they would take the default 13; deliberately smaller fonts (namespace labels, IDEF0 labels), existing views, pasted and duplicated views, views made by other commands (new diagram frames, IDEF0 decomposition) and files without a font keep their sizes (`c9ff927`) |

`npm test` now also renders a few React components in a DOM: tests that need one select
happy-dom (a dev dependency) with `// @vitest-environment happy-dom`; the rest run in Node.
