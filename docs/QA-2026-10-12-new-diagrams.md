# QA report — new UML diagrams, RAD and IDEF0 (2026-10-12)

Scope: the 11 UML diagram types added in Phase A (state machine, timing, component, deployment,
package, profile, object, composite structure, communication, interaction overview, information
flow), the Role Activity Diagram (RAD) and IDEF0.

## Method

- Baseline: `npm run typecheck`, `npm test` (843 tests) and `npm run build` all green before QA.
- The renderer was run in Chromium (vite dev server, Playwright) and driven with real pointer
  gestures on the toolbox and the canvas; the stores were inspected from the page.
- Palette smoke: every node tool of every diagram type placed on the canvas, then undo all, redo
  all and `.mdj` save/reopen (byte-identical in all 13 types; no runtime errors).
- Edge fuzz: every edge tool tried between every pair of nodes (including self links) in each
  UML family, with `validateModel` after every gesture; every view deleted (Delete and Delete
  from Model) and undone, checking the model is structurally valid and byte-identical after undo.
- Scenario scripts per family: containers and re-parenting, quick edit, moving hosts, deletion
  cascades, navigation, IDEF0 decomposition/wiring/renumbering/validation, RAD threads and roles.
- Screenshots reviewed for notation and layout defects.

Structural integrity held everywhere: no dangling references, no invalid `_parent`, undo always
restored the exact project.

## Fixed in this pass

| # | Diagram | Bug | Fix |
| --- | --- | --- | --- |
| 1 | Composite structure | Ports and parts show `name: Type[mult]`, but inline edit used the plain-name syntax: typing `eng: Engine[2]` was rejected silently. | Edit region uses the typed-name syntax with the shown text (type resolved to a classifier by name, multiplicity applied). |
| 2 | State machine | Transitions could leave a Final State or Terminate and enter an Initial pseudostate. | `canConnect` refuses them (UML 2.5 constraints). |
| 3 | Communication | Delete from Model of a connector left its messages in the model with `connector = null` and no view (invisible orphans). | Messages shown only in communication diagrams are deleted with their connector (sequence messages keep theirs). |
| 4 | Communication | A second message on the same connector was stacked 18 units out: the first message's label touched the second arrow. | Stack step 30. |
| 5 | Package | Containing an element in B after A moved it but left the A containment line drawn (diagram contradicted the model). | Containment links of the moved element to other owners are removed in the same undo step. |
| 6 | IDEF0 | The Decompose prompt said "3 to 6" while it accepts 1 to 6 (the error message said 1 to 6). | Prompt states the accepted range and the recommendation. |

Each fix has a regression test that fails without it (848 tests green).

## Open findings (not fixed: design decisions needed)

| # | Severity | Diagram | Finding | Repro |
| --- | --- | --- | --- | --- |
| A | Medium | RAD | Roles grow to fit their content and can grow over the neighbouring role. Earlier roles are drawn on top of later ones, so the overlapped role and its elements are hidden and clicks in the overlap go to the wrong role. | Two default roles side by side (80 apart); add a Case Refinement in the first: its default branches (120 and 240 to the right) widen the role over the second. |
| B | Medium | IDEF0 | Auto-renumbering on move uses a diagonal band anchored on the first box; moving a box ~120 down (still between its neighbours) takes it off the band and swaps box numbers, which also renames node references (A2 ↔ A3) of decomposed boxes. | Decompose with 3 boxes, move box 2 down by 120: box 2 becomes #3 and box 3 becomes #2. |
| C | Medium | Composite structure | A part dragged outside its host class stays owned and contained by it but is drawn outside the class box. | Class with a part; drag the part to empty canvas. |
| D | Low | Package | Explorer drag re-parenting leaves containment lines that no longer hold (same as fix 5, other entry point). Delete from Model on a containment line does nothing (the line has no model). | — |
| E | Low | All | Refused connections are silent (only a console warning); there is no toast or cursor feedback. | Drag a State Line between two RAD roles. |
| F | Low | State machine | Transition quick edit: a guard containing `/` (e.g. `[x/2 > 1]`) is a syntax error; re-editing a transition with two effects merges them into one effect named `e1, e2`. | — |
| G | Low | Interaction overview (and activity) | Control flows may leave a Final node and enter an Initial node. Shared with the activity diagram rules. | — |
| H | Low | IDEF0 | The A-0 and A0 diagrams are both named after the top function, so two tabs and two Working Diagrams rows read "Top Function". | Decompose the A-0 box. |
| I | Low | IDEF0 | Boundary input arrow has a 2-unit jog where the port and the box slot are not aligned. | New A-0, draw an input from the canvas into the box. |
| J | Low | RAD | "Add Alternative" clicked on the refinement circle places the new branch on top of it; the next auto-threaded element then starts from that branch. | — |
