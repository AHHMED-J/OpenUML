# Security audit

Scope: the Electron main process, preload bridge and IPC contract, the renderer's Content
Security Policy, parsing of `.mdj` projects and clipboard payloads, SVG/PNG export, the release
workflow and the dependency tree. Threat model: OpenUML is installed from GitHub Releases and opens
`.mdj` files that people receive from others, so every file (and clipboard text) is untrusted
input. The renderer displays that content, so the main process treats the renderer as less
trusted than itself.

Severity scale: **High** means a single hostile file or common situation causes harm without
further conditions. **Medium** means real harm that needs one more condition, such as a renderer
compromise or a planted file. **Low** is defense in depth. **Info** is a note, with no
vulnerability.

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | High | A project `_parent` cycle froze the app (infinite loop) | Fixed `2423d11` |
| 2 | Medium | `__proto__` and other `Object.prototype` names in files and clipboard text became prototypes or fields | Fixed `83649a0` |
| 3 | Medium | Unbounded nesting in files caused stack overflows | Fixed `83649a0` |
| 4 | Medium | `.mdj` reads followed links to any file, with no size or file-type limit | Fixed `fa65351` |
| 5 | Medium | Writes under an export folder followed links out of the folder | Fixed `fa65351` |
| 6 | Medium | `openExternal` accepted any https URL, which gave a compromised renderer a way to send data out | Fixed `320ae9a` |
| 7 | Medium | The UI ran on `file://` with Electron's extra file privileges | Fixed `1f9dcf3`, `ffe6827` |
| 8 | Medium | No Electron fuses: `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` worked, with no asar integrity | Fixed `ffe6827` |
| 9 | Low | IPC arguments not validated at runtime (menu roles, message box options, filters, titles) | Fixed `320ae9a` |
| 10 | Low | IPC senders not checked | Fixed `320ae9a` |
| 11 | Low | No permission handler, so Electron granted camera, microphone, location and others by default | Fixed `3a3b4ba` |
| 12 | Low | `ELECTRON_RENDERER_URL` honored by installed builds | Fixed `3a3b4ba` |
| 13 | Low | Command-line and OS file paths were only partly validated | Fixed `320ae9a` |
| 14 | Low | Content Security Policy lacked `object-src`, `base-uri` and `form-action`, and allowed inline styles | Fixed `14ba6d8` |
| 15 | Low | Colors from files went into SVG attributes unchecked (`url(...)` in exported SVG) | Fixed `b63a9a0` |
| 16 | Low | Release workflow: tag-pinned actions on Node 20, persisted token, shared npm cache | Fixed `1c74c63`, `18f5127` |
| 17 | Info | `npm audit`: 8 moderate advisories, all in the build toolchain | Fixed `459a9f3` |
| 18 | Info | Renderer sinks (`innerHTML`, `eval`, `window.open`, ...) | None found |
| 19 | Info | A renderer crash left a blank window | Fixed `3a3b4ba` |
| 20 | — | Known limits and recommendations (not fixed) | See the end |

## Findings

### 1. Project `_parent` cycle froze the app — High

The reader forces `_parent` for every nested element, but for the root it resolved whatever
`_parent` reference the file contained. A file could point the project's `_parent` at one of its
own descendants. Every loop that walks up the owner chain then ran forever, and there are many
(explorer reveal, namespace lookup, IDEF0 numbering, `while (root._parent) root = root._parent`).
The window froze for good as soon as the file was opened. No code ran, but the hostile file
denied service at once.

**Fix (`2423d11`):** `readMdj` drops any `_parent` on the project and adds a warning. Fragment
import and paste already reattach their roots to a chosen owner; tests cover both.

### 2. `__proto__` and reserved names in untrusted JSON — Medium

`JSON.parse` creates `__proto__` as an ordinary own key. The reader then ran
`el[key] = value` for each key, which calls the `__proto__` setter, so a file could replace an
element's prototype. The element then inherited fields such as `isAbstract` and `_type` from data
in the file. The global `Object.prototype` was never polluted, because no code merges recursively
into shared objects. `remapIds` and the clipboard `remapAll` (`out[key] = ...`) had the same
problem. Keys such as `toString`, `valueOf` and `hasOwnProperty` became own fields that shadow
built-in methods: `${element}` threw "Cannot convert object to primitive value". `_type` and
`_id` values with these names could match plain-object lookup tables, for example the explorer's
`TYPE_ORDER[el._type]`.

**Fix (`83649a0`):** `parseJsonText` removes own `__proto__` keys at every level right after
parsing. The clipboard now goes through `parseJsonText` as well. `ElementReader` ignores
`Object.prototype` member names (and `prototype`) as field names, gives a fresh ID to elements
that use them as IDs, and skips elements that use them as type names. Each case adds a load
warning. Tests are in `format/hostile.test.ts`.

### 3. Unbounded nesting caused stack overflows — Medium

V8's `JSON.parse` is iterative, but the reader, serializer, `structuredClone` of raw values and
several views are recursive. A file with deeply nested arrays or about 20,000 nested packages
threw `RangeError: Maximum call stack size exceeded`. Opening a file caught that error, but less
extreme depths could load and then overflow later, during rendering or saving.

**Fix (`83649a0`):** an iterative check after parsing rejects nesting deeper than 512 levels
(about 250 levels of nested elements; real models stay well below that) with a `FormatError`.
Invalid-JSON messages are also capped at 200 characters, because V8 includes a snippet of the
input in them.

### 4. `.mdj` reads: links, size and file type — Medium

`readTextFile` checked only that the name ended in `.mdj`. Problems:

- A planted symbolic link such as `model.mdj -> ~/.ssh/id_rsa` (zip archives can contain links)
  was read and returned to the renderer, and reading it also granted write access to that path.
- Relative paths resolved against the main process's working directory.
- Devices and named pipes named `*.mdj` were read without limit, and so were huge files.

**Fix (`fa65351`):** reads by path need an absolute path to a regular file of at most 256 MiB
whose real target, after links are resolved, also ends in `.mdj`. Files the user picks in the
Open dialog may still be links to any name, but the size and file-type checks still apply.

### 5. Folder-grant writes followed links — Medium

A folder chosen for "export all diagrams" lets the renderer write anywhere under it. That check
was lexical only, so a link inside the folder, such as `export/link -> ~/.ssh`, let a compromised
renderer write `export/link/authorized_keys`.

**Fix (`fa65351`):** `FileAccess.canWriteResolved` resolves links on the target, or on its
nearest existing ancestor, and requires the real path to stay inside the real granted folder.
Writing a dangling link replaces the link rather than following it, and a test covers that.
Files chosen in a Save dialog are still written through links, which keeps the earlier
behavior.

### 6. `openExternal` allowed any https URL — Medium

A compromised renderer could open `https://attacker/?d=<data>` in the user's browser and send
data out that way, which the CSP cannot stop. The check was also a plain `startsWith('https://')`
with no URL parsing.

**Fix (`320ae9a`):** the URL is parsed and must be https, with no credentials or port, under
`https://github.com/AHHMED-J/OpenUML` on a path boundary (look-alikes such as `OpenUML-evil`
fail). That covers every URL the app opens today: help and issues.

### 7. `file://` origin privileges — Medium

The packaged UI loaded from `file://`. Electron gives `file://` pages extra privileges, such as
using `fetch` to read any local file. Combined with any renderer compromise, that exposes the
whole disk.

**Fix (`1f9dcf3`, `ffe6827`):** packaged builds serve the renderer from `app://openuml/` through
`protocol.handle`. The scheme is standard and secure; the handler serves only bundle file types
under `out/renderer` and blocks traversal and encoded separators (`main/appProtocol.ts`, with
tests). The `grantFileProtocolExtraPrivileges` fuse is now off.

I checked this in a hidden Electron instance through CDP only:

- The UI renders and the preload bridge is present.
- Loading the UI caused no CSP violations.
- `fetch('file:///etc/hosts')` is refused.
- Clipboard permission is granted, and location is denied.

**Side effect:** `localStorage` belongs to the origin, so per-viewer settings (recent files,
panel layout, working diagrams) start empty once after this change.

### 8. Electron fuses — Medium

Without fuses, anyone able to start the app binary could make it run as plain Node
(`ELECTRON_RUN_AS_NODE`), inject code through `NODE_OPTIONS`, or attach a debugger with
`--inspect`. That bypasses whatever OS trust is given to OpenUML. The app also loaded from an
unchecked `app` folder or `app.asar`.

**Fix (`ffe6827`):** `build.electronFuses` turns off `runAsNode`, `NODE_OPTIONS` and the
`--inspect` switches. It turns on `onlyLoadAppFromAsar` and embedded asar integrity validation
(macOS and Windows; Linux ignores it), and turns off the `file://` privileges.

I verified a local `electron-builder --mac dir --arm64` package with `@electron/fuses read`: the
fuses are flipped, the `ElectronAsarIntegrity` hash is in `Info.plist`, and the ad-hoc signature
is valid. Windows asar integrity is written by electron-builder but was not run here; check the
first Windows build from CI. Cookie encryption stays off: the app sets no cookies, and on macOS
it would add a Keychain prompt for an ad-hoc signed app.

### 9. IPC argument validation — Low

The handlers trusted the TypeScript types of renderer arguments. A compromised renderer could:

- add menu items with any role, including `toggleDevTools` and `forceReload` in production;
- pass any `dialog.showMessageBox` options, such as an `icon` path, `checkboxLabel` or huge
  strings;
- send arbitrary dialog filters and titles, or a non-boolean `dirty` flag.

**Fix (`320ae9a`):** `main/ipcValidation.ts` rebuilds every argument from known fields:

- Menus use an allowlist of roles, with limits on depth, item count and string length.
- Message boxes keep only `message`, `detail`, `buttons` (1–8) and `type`.
- Filters must have alphanumeric extensions.
- Titles are single-line and bounded.
- `base64` payloads must use the base64 alphabet.
- Recent-document paths must be absolute `.mdj` paths.

### 10. IPC sender validation — Low

**Fix (`320ae9a`):** each handler first checks that the message comes from the main frame of the
main window, showing the app's own origin. Other frames or web contents are refused. Navigation
is blocked, so this is defense in depth.

### 11. Permissions, web views, navigation — Low

By default, Electron grants every permission request. **Fix (`3a3b4ba`):**

- Only `clipboard-read` and `clipboard-sanitized-write` are granted, and only to the app page.
  Paste needs them.
- Device access and downloads are refused.
- `will-attach-webview` and `will-redirect` are blocked, and `will-frame-navigate` is guarded.
- `web-contents-created` applies the deny rules to any other web contents.
- `webPreferences` are explicit: no web view tag, no insecure content, no experimental features,
  no navigation by drag and drop, safe dialogs, and devtools in development only.

The existing settings (context isolation, sandbox, no Node integration, deny window-open,
prevent navigation) were already correct.

### 12. `ELECTRON_RENDERER_URL` in installed builds — Low

An environment variable could make an installed app load a remote page with full access to the
preload bridge. **Fix (`3a3b4ba`):** the variable is now read only when `!app.isPackaged`.

### 13. Command-line and OS file paths — Low

`second-instance` resolved relative paths against the running instance's directory instead of the
second instance's `workingDirectory`, and macOS `open-file` paths were not checked. **Fix
(`320ae9a`):** switches, NUL bytes and over-long arguments are skipped. Relative paths resolve
against the sender's working directory. Only absolute `.mdj` paths reach the renderer, and
`readTextFile` checks them again.

### 14. Content Security Policy — Low

**Fix (`14ba6d8`):** the policy is now:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; media-src 'none'
```

Removing `'unsafe-inline'` from `style-src` works because:

- React applies `style` props through the CSSOM, which CSP does not restrict.
- No code adds `<style>` elements or sets `style` attributes as markup.

I confirmed this at runtime: inline style props still apply, and an injected `<style>` element is
blocked. The Vite dev server injects CSS as `<style>` elements, so a serve-only plugin in
`electron.vite.config.ts` adds `'unsafe-inline'` in development only. `frame-ancestors` cannot be
set from a `<meta>` policy; the app is never framed and blocks all navigation, so it is not
needed. There is no `'unsafe-eval'`.

### 15. Colors from files in SVG attributes — Low

`fillColor`, `lineColor`, `fontColor` and edge-label colors went from the file straight into
`fill` and `stroke`. React escapes attribute values, so markup injection was never possible. A
value like `url(https://tracker/x)` could still put an external reference into exported SVG
files. In the app, the CSP already blocked it.

**Fix (`b63a9a0`):** `format/cssColor.ts` accepts only hex, numeric `rgb()`/`hsl()` and keywords,
and falls back to the default color otherwise. Applied in `styleOf` and for edge labels.

Tests show that hostile names (`<script>`, `<foreignObject>`, event-handler and `javascript:`
text) stay escaped text in exported SVG. PNG export rasterizes the same SVG as an image, and SVG
images neither run scripts nor load external resources.

### 16. Release workflow — Low

**Fix (`1c74c63`, `18f5127`):**

- **Pinned actions:** `actions/checkout` v7.0.1, `setup-node` v7.0.0, `upload-artifact` v7.0.1 and
  `download-artifact` v8.0.1 are pinned to full commit SHAs with version comments. All run on
  Node 24, which clears the Node 20 deprecation warning. I chose releases at least several weeks
  old rather than the newest.
- **Credentials:** `persist-credentials: false` on checkouts.
- **No dependency cache:** release builds install with `npm ci` from the lockfile without the
  shared npm cache, so a poisoned cache cannot reach the installers.
- **Matrix arguments:** they reach the shell through an environment variable.
- **Dependabot:** weekly updates for npm and GitHub Actions.

**Already correct:**

- Top-level `permissions: contents: read`, and only the publish job gets `contents: write`.
- No `pull_request_target` trigger.
- `${{ github.ref_name }}` was already passed through `env`.

### 17. npm audit — Info

All 8 moderate advisories came from one source: `sprintf-js` (unbounded precision, DoS), reached
through `roarr` ← `global-agent@3` ← `@electron/get@3` ← `electron-builder`. That is build
tooling and none of it ships. The packaged `app.asar` contains only `out/`, `resources/` and
`zustand`. No patched `sprintf-js` exists, so **fix (`459a9f3`):** an npm `overrides` entry pins
`global-agent@4.1.3`, which has no `roarr` dependency and the same CommonJS `bootstrap()` that
`@electron/get` calls for proxy support. `npm audit` now reports 0 vulnerabilities, and
packaging still works.

### 18. Renderer sinks — Info

There is no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `window.open` or
`document.write` in `src/renderer`. All model text is rendered as React text, and exported SVG
uses `renderToStaticMarkup`, which escapes it. `localStorage` content is per viewer and only
read as JSON with fallbacks. File paths read back from it still go through the main-process
checks.

### 19. Renderer crash recovery — Info

If the renderer process dies (for example, out of memory on a hostile file), the main process
reloads it, at most three times a minute to avoid a loop (`3a3b4ba`). Unsaved work in that
window is lost either way.

## Known limits and recommendations (not fixed)

- **Any existing `.mdj` can be overwritten after a read.** Recent files and files opened by the
  OS must be readable and savable by path, so a compromised renderer can read and then overwrite
  any `.mdj` on disk. The sender checks and the absence of HTML sinks make that compromise
  unlikely. I accepted this as the price of the feature.
- **No code signing.** Builds are unsigned on Windows and ad-hoc signed on macOS, with
  `hardenedRuntime: false` (both documented in the release notes). With certificates, enable
  signing, notarization and the hardened runtime. The fuses already cover what the hardened
  runtime would add for Node.
- **No app-level error boundary.** Only the diagram area has a React error boundary. A render
  exception in another panel blanks the window until reload. Crash recovery only handles a dead
  renderer process, not JavaScript exceptions.
- **Huge geometry.** Very large coordinates or font sizes in a file can make PNG export ask for a
  canvas larger than the browser allows. Export then fails with an error, and the app keeps
  working.
- **No devtools in installed builds.** Developer tools are now off in packaged builds, so
  troubleshooting user reports needs a development build.
- **Path comparison off Linux.** It is case-insensitive and does not expand Windows 8.3 short
  names. Mismatches fail closed: the write is refused.

## Follow-ups

- **App-level error boundaries (was "Known limits": no app-level error boundary).** Every dock
  panel, the toolbar, the status bar, the diagram tabs, dialogs and menus have their own boundary
  (`ui/components/PanelBoundary.tsx`), plus one around the whole window layout. A render error
  shows "This panel hit an error" with a Reload panel button in place of that part (dialogs can
  be closed, menus close) and an error toast; the other panels keep working, and the open project
  is untouched because it lives in the stores (`7b44c65`, tests `a3ed9c5`).
- **Clipboard and fragment parsing share one ID remapper** (`remapTreeIds` in `format/fragment.ts`).
  Both paths still parse with `parseJsonText` (depth limit, `__proto__` removed), and the
  remapper itself never copies a `__proto__` key (`1cfb6a8`, `32c82ae`).
- **Release workflow cache.** The build jobs cache the Electron and electron-builder downloads
  (`actions/cache` pinned to a commit SHA, `v6.1.0`), keyed per OS and per Electron /
  electron-builder version; permissions are unchanged (`contents: read`). npm dependencies are
  still never cached. The cached downloads are verified again before use: Electron zips against
  the release's `SHASUMS256.txt`, builder tools against the checksums in electron-builder, so a
  tampered entry is downloaded again instead of being packaged (`b91a586`).
- **New dev dependency:** `happy-dom` 20.14.5 (exact version, tests only, not packaged; no
  install scripts). `npm audit` reports 0 vulnerabilities.
