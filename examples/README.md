# Examples

Models that show what OpenUML can do. Open one with *File > Open Example*, or open the `.mdj` file directly.
All names and structure are original; they are written for this project.

## software-release-idef0.mdj

An IDEF0 model, *Release a Software Change* (node prefix `SR`), with three levels:

- **A-0** context diagram with purpose and viewpoint, one input, five controls, four mechanisms and two outputs.
- **A0** with six boxes: Triage Change Request, Plan Release, Build and Test Change, Approve Release,
  Deploy to Production, Monitor and Review Release.
- **A3** (the decomposition of box 3) with two boxes: Assemble Build and Run Test Suites.

Notation shown: arrows on all four ICOM sides, a fork (*Release Policy* controls boxes 1 and 2), a join
(*Release Schedule* merges into *Sign-off* on its way to deployment), feedback arrows (*Rework Request* goes back
to the build, *Lessons Learned* "up and over" to planning), a call arrow (deployment reuses the test suites,
`SR/A32`), a tunneled arrow end (*Build Farm* serves box 3 but is not shown below it), boundary arrows with ICOM
codes on A0 and on A3, and the title block (author, status).

Validation reports exactly one warning, on purpose: the A3 diagram has two boxes and IDEF0 recommends three to six
(W01). Everything else is consistent.

The file is produced by `buildReleaseExample()` (`src/renderer/src/diagram/idef0/example-release.ts`); to
regenerate it after changing the builder run `UPDATE_EXAMPLES=1 npx vitest run example-release`.
