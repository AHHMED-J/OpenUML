# Contributing to OpenUML

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organized and the README for
setup. Before sending a change, run:

```sh
npm run typecheck
npm test
npm run build
npm run lint:unused   # knip: no unused files, exports or dependencies
npm audit
```

## Commit messages

Titles follow `type(scope): description`:

- **type** is one of `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci` or `chore`.
- **scope** names the area changed, usually a module or folder: `diagram`, `editor`, `format`,
  `model`, `ui`, `explorer`, `main`, `release`, `deps`, `audit`, ...
- **description** is in the imperative mood and lower case, without a final period:
  `fix(editor): keep the selection after an undone move`, not `Fixed selection bug.`

Keep one logical change per commit. A body is welcome when the reason is not obvious from the
title.

Commit with explicit paths, so nothing else that happens to be in the working tree goes in:

```sh
git diff --stat -- src/renderer/src/diagram/editor/actions.ts
git commit -m "fix(editor): ..." -- src/renderer/src/diagram/editor/actions.ts
```

Committed files must not contain local absolute paths, user names, e-mail addresses or secrets.

## Progress log

Every milestone (a feature delivered, a release, an audit, a QA pass) gets a row in
[docs/PROGRESS.md](docs/PROGRESS.md) with an ISO-8601 timestamp in local time with its UTC offset
(`date +%Y-%m-%dT%H:%M:%S%z`, written as `-07:00`) and a short description of what changed.
