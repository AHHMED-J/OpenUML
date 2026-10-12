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

## Download

Installers for Windows (64-bit), macOS (Apple Silicon and Intel) and Linux (64-bit AppImage) are
published on the [Releases page](https://github.com/AHHMED-J/OpenUML/releases): pick the latest
release and download the file for your system. Each release lists SHA-256 checksums
(`SHA256SUMS.txt`) to verify the downloads.

The builds are **not code-signed** (that needs paid Apple and Microsoft certificates), so each
system warns on first launch:

- **Windows:** SmartScreen shows "Windows protected your PC": click *More info*, then *Run anyway*.
  The installer lets you choose the folder and registers OpenUML as the editor of `.mdj` files.
- **macOS:** open the `.dmg` (or unzip), drag `OpenUML.app` to *Applications*, then right-click it
  and choose *Open* (or *System Settings > Privacy & Security > Open Anyway*). The app is signed
  ad hoc, which Apple Silicon requires to run it at all.
- **Linux:** `chmod +x OpenUML-<version>-linux-x86_64.AppImage` and run it. Without FUSE 2, add
  `--appimage-extract-and-run`; on Ubuntu 24.04 and later you may also need `--no-sandbox`.

### Publishing a release (maintainers)

Releases are built by the [Release workflow](.github/workflows/release.yml) on real Windows, macOS
and Linux runners. After typecheck and tests pass, it publishes the installers and their checksums:

```sh
# 1. set "version" in package.json (e.g. 0.1.1), commit and push
# 2. tag that commit with the same version and push the tag
git tag v0.1.1
git push origin v0.1.1
```

The workflow fails early if the tag and `package.json` disagree. Tags with a suffix (`v0.2.0-beta.1`)
are published as pre-releases. To only build the installers without publishing, run the workflow
from *Actions > Release > Run workflow*: they are attached to the run for 14 days.

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
electron-builder (macOS: `.dmg` and `.zip`; Windows: NSIS installer; Linux: AppImage), named
`OpenUML-<version>-<os>-<arch>.<ext>`. Installed
builds register OpenUML as the editor of `.mdj` files, with their own document icon; opening a
`.mdj` file while OpenUML runs opens it in the running window. The builds are not code-signed, so
macOS Gatekeeper and Windows SmartScreen warn on first launch.

Building on Linux for the other systems also works: Windows needs Wine (32- and 64-bit:
`wine64` and `wine32:i386` on Ubuntu) for the NSIS installer and the executable icon. macOS
targets cannot be signed or put in a `.dmg` off macOS: build with `npx electron-builder --mac dir`,
sign the bundle ad hoc with [rcodesign](https://github.com/indygreg/apple-platform-rs)
(`rcodesign sign release/mac-arm64/OpenUML.app`), and zip it keeping its symbolic links
(`zip -qry`); electron-builder's own zip on Linux turns the framework symlinks into copies.

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
