# OpenUML

<p align="center"><img src="build/icon.png" alt="OpenUML logo" width="128"></p>

OpenUML is an open-source desktop modeling tool for macOS, Windows and Linux, built with Electron, React and
TypeScript. It edits 15 UML diagram types plus Role Activity Diagrams (RAD) and IDEF0 process models, and
reads and writes `.mdj` project files.

**[Download the latest version](https://github.com/AHHMED-J/OpenUML/releases/latest)** — see [Download](#download)
for which file to pick.

> OpenUML is an independent project. It is not affiliated with, endorsed by, or connected to any other UML tool
> or its vendor. It is implemented from written behavioral specifications in its own code and contains no
> third-party proprietary code, icons or other assets.

## Features

- **Model Explorer** – the project tree with type icons, sorting by insertion order or name, search,
  double-click to open a diagram or show an element on its diagram, inline rename (F2), drag-and-drop re-parenting, and context menus to add elements and diagrams.
- **UML diagrams** – class, object, package, component, deployment, composite structure, profile, use case,
  activity, state machine, sequence, communication, timing, interaction overview and information flow, each with
  its own toolbox, plus annotations (notes, note links, text).
- **Role Activity Diagrams (RAD)** – roles, activities, state lines, interactions between roles, alternative
  (case) and parallel (part) refinements, iteration, waits, role initialization and state markers. One *Line* tool
  draws a state line within a role and an interaction between roles (the activities it joins become interactions);
  interaction lines take bend points. Symbols line up on their thread, a refinement moves with its branches, a role
  can be locked (*Format > Lock Position and Size*) to select inside it without moving it, roles grow to fit their
  content, threads stay connected when elements move, and soft warnings (for example a role name that is not a
  gerund) never block editing.
- **IDEF0** – function boxes with automatic numbering, ICOM arrows (input, control, output, mechanism) that
  snap to the right side, forks and joins, call and tunneled arrows, the A-0 context diagram, *Decompose* into
  child diagrams with Go to Parent/Child, *Set Number of Child Boxes* (add boxes, or choose which boxes to remove
  with their arrows and sub-diagrams; one undo step), the title block, and consistency warnings with a status-bar count.
  Decomposing no longer wires the parent's arrows to the child boxes: each one waits on the frame edge as a dashed
  *pending arrow* (role color, ICOM code and name) until you drag it onto the side of a box that matches its role;
  dragging it to more boxes makes a fork (a join for outputs), and the status bar counts the arrows still pending.
  Clicking a pending arrow (or *Connect to...* on a boundary arrow) opens a table of the diagram's boxes: the checked
  boxes are previewed on the canvas, a box with its own child diagram warns before it loses the arrow, and *Connect*
  applies the choice in one undo step.
- **Editing** – live preview while moving, resizing and drawing, animated zoom, grid and snap-to-grid, inline
  name editing and quick-edit syntax (e.g. `-total : Money [0..1] = 0`, `trigger [guard] / effect`), copy,
  paste and duplicate (pasted elements are new, independent copies with the same names), alignment commands.
  Diagram tabs and a Working Diagrams list. Icon buttons show their name and shortcut in a quick tooltip.
- **Customizable layout** – long-press a panel header (Toolbox, Model Explorer, Properties, …) and drag it to
  another place; the layout is remembered. *View > Reset Layout* restores the default.
- **Property Editor** – rows generated from the metamodel (text, numbers, checkboxes, enumerations, references,
  type/stereotype autocomplete, attribute/operation/parameter/literal lists), multi-selection editing,
  association-end sections, plus a Style editor (colors can be picked, or typed and pasted as `#rrggbb` codes) and a
  Documentation editor.
- **Undo/redo** for every change (one step per gesture), with unsaved-change tracking.
- **Files** – New, Open, Open Recent, *Open Example* (bundled models from `examples/`, e.g. a six-box IDEF0 software
  release process), Save, Save As; export the current diagram (or all diagrams) to PNG or SVG, or to PDF
  (one diagram, or every diagram in one file; IDEF0 sheets sized to a paper print on that paper).
- **Interactive website** – *File > Export Interactive Website* writes one self-contained HTML file anyone can open
  offline in a browser (email it, upload it to Moodle or GitHub Pages): the model tree, the diagrams with pan and
  zoom, IDEF0 boxes that zoom into their child diagrams, a breadcrumb, Left/Right to walk the model box by box, and
  under each IDEF0 diagram the inputs, controls, outputs and mechanisms of the focused box. The page loads nothing
  from the internet.
- **Your work is protected** – a project with a file is saved automatically every minute while it has unsaved
  changes (*Preferences > Files*, from 30 seconds to 10 minutes, or off), and unsaved work is kept aside so that,
  if OpenUML closes unexpectedly, the next start offers to recover it.
- **Commands** – native application menu, context menus, keyboard shortcuts (`Cmd` on macOS, `Ctrl` elsewhere)
  that you can change in *Keyboard Shortcuts* (any command, conflicts asked about, reset per command or all),
  a command palette (`Cmd/Ctrl+Shift+P`) and `Cmd/Ctrl+F` to search the Model Explorer.
- **Updates** – the window title shows the version you run. At startup and once a day OpenUML asks GitHub for the
  latest release (only that request, no personal data) and, when a newer one exists, offers it in the status bar;
  *Download* opens its release page. Turn it off in *Preferences > Updates*, or check by hand with
  *Check for Updates…*.
- **Themes** – light and dark, following the system setting by default; preferences for grid, snap and default
  font size.

## Download

Installers are published on the [Releases page](https://github.com/AHHMED-J/OpenUML/releases/latest).
Download the file for your system:

| System | File |
| --- | --- |
| macOS, Apple Silicon (M1/M2/M3/M4) | `OpenUML-<version>-mac-arm64.dmg` |
| macOS, Intel | `OpenUML-<version>-mac-x64.dmg` |
| Windows 10/11 (64-bit) | `OpenUML-<version>-win-x64.exe` |
| Linux (64-bit) | `OpenUML-<version>-linux-x86_64.AppImage` |

Not sure which Mac you have? Open the Apple menu > *About This Mac*: "Chip: Apple M…" means Apple Silicon.
Each release lists SHA-256 checksums (`SHA256SUMS.txt`) to verify the downloads.

The builds are **not code-signed** (that needs paid Apple and Microsoft certificates), so each
system warns on first launch:

- **Windows:** SmartScreen shows "Windows protected your PC": click *More info*, then *Run anyway*.
  The installer lets you choose the folder and registers OpenUML as the editor of `.mdj` files.
- **macOS:** open the `.dmg` (or unzip), drag `OpenUML.app` to *Applications*, then right-click it
  and choose *Open* (or *System Settings > Privacy & Security > Open Anyway*). After the first launch it
  opens normally from Launchpad, Spotlight or the Dock. If macOS reports that the app "is damaged and
  can't be opened", run `xattr -cr /Applications/OpenUML.app` once in Terminal. The app is signed ad hoc,
  which Apple Silicon requires to run it at all.
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
[CONTRIBUTING.md](CONTRIBUTING.md) describes the checks to run and the commit message convention.

## License

MIT — see [LICENSE](LICENSE).
