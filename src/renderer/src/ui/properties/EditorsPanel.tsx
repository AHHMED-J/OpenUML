/**
 * Editor panel bodies: Styles, Properties and Documentation are independently dockable panels
 * (chrome, header and collapse state come from the dock).
 */
import type React from 'react'
import { DocumentationEditor } from './DocumentationEditor'
import { PropertyEditor } from './PropertyEditor'
import { StyleEditor } from './StyleEditor'

function EditorBody({ name, children }: { name: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={`panel editor-panel ${name}-panel`}>
      <div className="section-body">{children}</div>
    </div>
  )
}

export function StylesPanel(): React.JSX.Element {
  return (
    <EditorBody name="styles">
      <StyleEditor />
    </EditorBody>
  )
}

export function PropertiesPanel(): React.JSX.Element {
  return (
    <EditorBody name="properties">
      <PropertyEditor />
    </EditorBody>
  )
}

export function DocumentationPanel(): React.JSX.Element {
  return (
    <EditorBody name="documentation">
      <DocumentationEditor />
    </EditorBody>
  )
}
