/** Editors holder: collapsible Styles, Properties and Documentation sections. */
import type React from 'react'
import { UiIcon } from '../icons'
import { uiStore, useUiStore, type EditorSection } from '../uiStore'
import { DocumentationEditor } from './DocumentationEditor'
import { PropertyEditor } from './PropertyEditor'
import { StyleEditor } from './StyleEditor'

function Section({ id, title, children }: { id: EditorSection; title: string; children: React.ReactNode }): React.JSX.Element {
  const open = useUiStore((s) => s.sections[id])
  const bodyId = `section-${id}`
  return (
    <section className={`editor-section${open ? ' open' : ''}`} aria-label={title}>
      <button className="section-header" aria-expanded={open} aria-controls={bodyId} onClick={() => uiStore.getState().toggleSection(id)}>
        <UiIcon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        <span>{title}</span>
      </button>
      {open ? (
        <div className="section-body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function EditorsPanel(): React.JSX.Element {
  return (
    <div className="panel editors">
      <Section id="styles" title="Styles">
        <StyleEditor />
      </Section>
      <Section id="properties" title="Properties">
        <PropertyEditor />
      </Section>
      <Section id="documentation" title="Documentation">
        <DocumentationEditor />
      </Section>
    </div>
  )
}
