/**
 * Error boundary around one part of the window (a dock panel, the toolbar, the status bar, a
 * dialog or menu). A render error there shows a small fallback with "Reload panel" instead of
 * blanking the whole window, and is reported once. The open project lives in the stores, outside
 * React, so reloading a panel (or losing it) never loses work.
 */
import { Component, Fragment, type ErrorInfo } from 'react'
import type React from 'react'
import { uiStore } from '../uiStore'

interface PanelFallbackProps {
  readonly error: Error
  /** Clears the error and mounts the panel's content again. */
  readonly reload: () => void
}

export interface PanelBoundaryProps {
  /** What failed, in reports: "Model Explorer", "Toolbar", ... */
  readonly name: string
  readonly children?: React.ReactNode
  /** Clears a shown error when it changes (e.g. the dialog or menu being shown). */
  readonly resetKey?: unknown
  /** Called once per caught error; default: an error toast naming the panel. */
  readonly onError?: (error: Error, name: string) => void
  /** Replaces the default fallback ("This panel hit an error" + "Reload panel"); may render nothing. */
  readonly fallback?: (props: PanelFallbackProps) => React.ReactNode
}

interface PanelBoundaryState {
  readonly error: Error | null
  /** Bumped by a reload so the content mounts afresh (its local state is dropped). */
  readonly generation: number
}

/** Default report of a caught panel error: a toast (React itself logs the error and stack). */
export function reportPanelError(error: Error, name: string): void {
  // Deferred: the store update must not run inside React's commit of the failed tree.
  queueMicrotask(() => uiStore.getState().toast(`${name} hit an error: ${error.message}`, 'error'))
}

export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  override state: PanelBoundaryState = { error: null, generation: 0 }

  static getDerivedStateFromError(error: unknown): Partial<PanelBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error))
    ;(this.props.onError ?? reportPanelError)(err, this.props.name)
  }

  override componentDidUpdate(prev: PanelBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  readonly reload = (): void => {
    this.setState((s) => ({ error: null, generation: s.generation + 1 }))
  }

  override render(): React.ReactNode {
    const { error, generation } = this.state
    if (error) {
      if (this.props.fallback) return this.props.fallback({ error, reload: this.reload })
      return <PanelErrorMessage name={this.props.name} reload={this.reload} />
    }
    return <Fragment key={generation}>{this.props.children}</Fragment>
  }
}

/** The default fallback: a short notice and a button that mounts the panel again. */
export function PanelErrorMessage({ name, reload, what = 'panel' }: { name: string; reload: () => void; what?: string }): React.JSX.Element {
  return (
    <div className="panel-error" role="alert" aria-label={`${name} error`}>
      <span>This {what} hit an error.</span>
      <button className="button" onClick={reload}>
        Reload {what}
      </button>
    </div>
  )
}
