/**
 * User-facing release notes shown by the What's New window. Written by hand (not generated from
 * the progress log): a release has a few big features, one slide each, and a list of smaller
 * improvements and fixes that share the final slide. Newest release first; a test requires an
 * entry for the version in package.json, so a release cannot ship without notes.
 */

/** Hero drawings available to feature slides (see `illustrations.tsx`). */
export type IllustrationId = 'pending-arrows' | 'box-table' | 'advanced-arrows' | 'website' | 'rad-lines' | 'show-in-folder' | 'whats-new' | 'dark-canvas' | 'working-diagrams'

export interface ReleaseFeature {
  readonly title: string
  readonly description: string
  readonly illustration: IllustrationId
}

export interface ReleaseMinorItem {
  readonly kind: 'improved' | 'fixed'
  readonly text: string
}

export interface Release {
  /** Plain `major.minor.patch`. */
  readonly version: string
  /** ISO date of the release. */
  readonly date: string
  readonly features: readonly ReleaseFeature[]
  readonly minor: readonly ReleaseMinorItem[]
}

/** Public release page of a version (the "Full changelog" link). */
export function releaseUrl(version: string): string {
  return `https://github.com/AHHMED-J/OpenUML/releases/tag/v${version}`
}

export const RELEASES: readonly Release[] = [
  {
    version: '0.1.9',
    date: '2026-11-05',
    features: [
      {
        title: 'Dark canvas',
        description:
          'Draw your diagrams on a dark canvas with View > Dark Canvas or Cmd/Ctrl+Shift+D, or choose Light, Dark or Follow App in Preferences. Your file does not change and exports stay light unless you ask for dark ones in Preferences.',
        illustration: 'dark-canvas'
      },
      {
        title: 'Every diagram ready when you open a file',
        description:
          'Opening a file now lists all its diagrams in Working Diagrams and the tabs, in Model Explorer order, so you no longer have to open them one by one.',
        illustration: 'working-diagrams'
      }
    ],
    minor: [
      { kind: 'improved', text: 'The toolbar has one Export button that offers PNG or PDF.' },
      { kind: 'improved', text: 'A newer version is offered on every start, and after Later the window title keeps showing it.' },
      { kind: 'improved', text: 'The Model Explorer shows the path to the selected row, and rows can be dropped between rows.' },
      { kind: 'improved', text: 'Show Diagrams Only in the Model Explorer settings lists just the diagrams and the containers that lead to them.' },
      { kind: 'improved', text: 'Add Diagram places the new diagram beside the one you are working on.' },
      { kind: 'improved', text: 'Sequence lifelines have an Is Actor box that draws a stick figure, also in StarUML.' },
      { kind: 'improved', text: 'Deleting a diagram also removes the Interaction and Collaboration left empty around it.' },
      { kind: 'improved', text: 'Spread Boundary Arrows, in Model > IDEF0, gives every arrow on the frame edge of a diagram its own spot.' },
      { kind: 'fixed', text: 'All to One PDF prints in Model Explorer order, so an IDEF0 model starts with A-0.' },
      { kind: 'fixed', text: 'New IDEF0 boundary arrows take a free spot on the frame edge, and their bends no longer share one line.' },
      { kind: 'fixed', text: 'Delete from Model never leaves an IDEF0 boundary port behind, and a new warning finds the ones left by earlier deletions.' },
      { kind: 'fixed', text: 'Saving the same file twice in a row can no longer lose a save.' },
      { kind: 'fixed', text: 'Undo and redo apply completely or not at all.' },
      { kind: 'fixed', text: 'Cut and menu Delete follow the same IDEF0 and RAD deletion rules as the Delete key.' },
      { kind: 'fixed', text: 'Pasting goes to the scope of the target diagram and numbers boxes there, and a copied branch never comes without its trunk.' },
      { kind: 'fixed', text: 'Reconnecting a relationship moves it to its new source in the model.' },
      { kind: 'fixed', text: 'Auto-save waits while the unsaved changes question is open, and a dialog left without an answer is cancelled.' },
      { kind: 'fixed', text: 'The window closes without asking once OpenUML has crashed four times in a row.' }
    ]
  },
  {
    version: '0.1.8',
    date: '2026-10-26',
    features: [
      {
        title: 'What’s New after every update',
        description:
          'The first time you start a newer version, OpenUML now shows its big new features and one last slide with the smaller improvements and fixes. Open it again from Help > What’s New, or turn it off in Preferences > Updates.',
        illustration: 'whats-new'
      }
    ],
    minor: []
  },
  {
    version: '0.1.7',
    date: '2026-10-26',
    features: [
      {
        title: 'Show the project file in its folder',
        description:
          'A new button next to Save (also File > Show in Finder or Explorer) opens the folder of the project you are working on with its file selected. It stays disabled until the project has a file.',
        illustration: 'show-in-folder'
      }
    ],
    minor: []
  },
  {
    version: '0.1.6',
    date: '2026-10-19',
    features: [
      {
        title: 'Pending arrows on child diagrams',
        description:
          'When you decompose an IDEF0 box, the arrows of the parent diagram now wait on the child diagram as dashed stubs until you decide which box uses each one. The status bar counts the ones still not connected.',
        illustration: 'pending-arrows'
      },
      {
        title: 'Pick the boxes for an arrow',
        description:
          'Click a pending arrow, or choose Connect to... on any boundary arrow, to open a table of the diagram’s boxes. Tick one box for a plain arrow or several for a fork or join, preview the result, and apply it in one undo step.',
        illustration: 'box-table'
      },
      {
        title: 'Advanced Arrows panel',
        description:
          'A new panel lists every parent arrow against every box in a single matrix, so you can assign them all at once. Open it from View > Panels or by right-clicking the diagram in the Model Explorer.',
        illustration: 'advanced-arrows'
      }
    ],
    minor: [
      { kind: 'improved', text: 'Pending arrows spread out along the frame edge so they never overlap each other or connected arrows.' },
      { kind: 'improved', text: 'Deleting an arrow on a child diagram leaves its parent arrow pending instead of deleting it.' },
      { kind: 'fixed', text: 'A boundary arrow drawn from empty canvas takes the side it comes from, so dragging up from below no longer makes a control.' },
      { kind: 'fixed', text: 'An arrow’s role now follows the side of the box the drag entered through.' },
      { kind: 'fixed', text: 'New IDEF0 boxes get a unique name across the whole model instead of repeating the names of the level above.' },
      { kind: 'fixed', text: 'Renaming an IDEF0 diagram now sticks; the next edit no longer reverts it.' },
      { kind: 'fixed', text: 'Copying and pasting a box never creates a second port for the same parent arrow.' },
      { kind: 'fixed', text: 'A tunneled parent arrow is no longer left pending on the child diagram.' }
    ]
  },
  {
    version: '0.1.5',
    date: '2026-10-16',
    features: [
      {
        title: 'Export an interactive website',
        description:
          'File > Export Interactive Website writes one self-contained page with your model tree and diagrams. Pan, zoom, follow IDEF0 boxes into their child diagrams, and walk the model box by box with the arrow keys.',
        illustration: 'website'
      },
      {
        title: 'Faster RAD editing',
        description:
          'One Line tool now draws both state lines and interactions between roles. Refinement groups move as one piece, and Format > Lock Position and Size locks a role in place.',
        illustration: 'rad-lines'
      }
    ],
    minor: [
      { kind: 'improved', text: 'Paste creates new, independent elements instead of extra views of the originals.' },
      { kind: 'improved', text: 'Fill, line and text colors have an editable hex code in Styles.' },
      { kind: 'improved', text: 'Icon buttons show a quick tooltip with their name and shortcut.' },
      { kind: 'improved', text: 'RAD interaction links accept bend points, and lines to Start and End markers run straight.' },
      { kind: 'fixed', text: 'Deleting on a RAD diagram now removes the elements from the model too, unless they appear on another diagram.' }
    ]
  }
]
