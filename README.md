# OpenUML

OpenUML is an open-source desktop UML modeling tool built with Electron, React and TypeScript. It edits
class, use case, sequence and activity diagrams and reads and writes `.mdj` project files.

> OpenUML is an independent project. It is not affiliated with, endorsed by, or connected to any other UML tool
> or its vendor. It is implemented from written behavioral specifications in its own code and contains no
> third-party proprietary code, icons or other assets.

## Features

- **Model Explorer** – the project tree with type icons, sorting by insertion order or name, search,
  inline rename (F2 or double-click), drag-and-drop re-parenting, and context menus to add elements and diagrams.
- **Diagrams** – class, use case, sequence and activity diagrams with a toolbox per diagram type plus annotations
  (notes, note links, text). Diagram tabs and a Working Diagrams list, zoom, grid and snap-to-grid.
- **Property Editor** – rows generated from the metamodel (text, numbers, checkboxes, enumerations, references,
  type/stereotype autocomplete, attribute/operation/parameter/literal lists), multi-selection editing,
  association-end sections, plus a Style editor and a Documentation editor.
- **Undo/redo** for every change (one step per gesture), with unsaved-change tracking.
- **Files** – New, Open, Open Recent, Save, Save As; export the current diagram (or all diagrams) to PNG or SVG.
- **Commands** – native application menu, context menus, keyboard shortcuts (`Cmd` on macOS, `Ctrl` elsewhere)
  and a command palette (`Cmd/Ctrl+Shift+P`).
- **Themes** – light and dark, following the system setting by default; preferences for grid, snap and default
  font size.

## Getting started

Requirements: Node.js 20 or later.

```sh
npm install      # install dependencies
npm run dev      # start the app in development mode
npm test         # run the unit tests
npm run build    # production build into out/
```

`npm run typecheck` runs the TypeScript compiler.

## Packaging

`npm run dist` builds the installers for the current operating system into `release/` with
electron-builder (macOS: `.dmg` and `.zip`; Windows: NSIS installer; Linux: AppImage). Installed
builds register OpenUML as the editor of `.mdj` files, with their own document icon; opening a
`.mdj` file while OpenUML runs opens it in the running window. The builds are not code-signed, so
macOS Gatekeeper and Windows SmartScreen warn on first launch.

The icons in `build/` and `resources/icon.png` are generated from the logo artwork in
`build/icon-src/` (Python 3 with Pillow and NumPy):

```sh
python3 build/icon-src/make_icons.py
```

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the process and module structure and
[docs/PROGRESS.md](docs/PROGRESS.md) for the development log.

## License

MIT — see [LICENSE](LICENSE).
