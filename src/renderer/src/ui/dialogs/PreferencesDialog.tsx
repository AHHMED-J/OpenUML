/** Preferences: appearance, diagram editor, files (auto-save), updates and keyboard shortcuts. Changes apply immediately. */
import type React from 'react'
import { FONT_SIZES } from '../../diagram'
import { Modal } from '../components/Modal'
import { AUTO_SAVE_INTERVALS, uiStore, useUiStore, type ThemePreference } from '../uiStore'

const GRID_SIZES = [2, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64]

function intervalLabel(seconds: number): string {
  if (seconds === 0) return 'Off'
  return seconds < 60 ? `Every ${seconds} seconds` : seconds === 60 ? 'Every minute' : `Every ${seconds / 60} minutes`
}

/** The offered values plus the current one, so a value saved from elsewhere still shows. */
function withCurrent(values: readonly number[], current: number): number[] {
  return values.includes(current) ? [...values] : [...values, current].sort((a, b) => a - b)
}

export function PreferencesDialog(): React.JSX.Element {
  const prefs = useUiStore((s) => s.prefs)
  const set = uiStore.getState().setPrefs
  const close = (): void => uiStore.getState().openModal(null)
  return (
    <Modal
      title="Preferences"
      onClose={close}
      width={420}
      footer={
        <>
          <button className="button" onClick={() => uiStore.getState().resetPrefs()}>
            Restore Defaults
          </button>
          <button className="button" onClick={() => uiStore.getState().openModal({ kind: 'shortcuts' })}>
            Keyboard Shortcuts...
          </button>
          <span className="spacer" />
          <button className="button primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <fieldset className="pref-group">
        <legend>Appearance</legend>
        <div className="pref-row">
          <label htmlFor="pref-theme">Theme</label>
          <select id="pref-theme" value={prefs.theme} onChange={(e) => set({ theme: e.target.value as ThemePreference })}>
            <option value="system">Follow System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="pref-row">
          <label htmlFor="pref-font-size" title="Font size of elements created from now on; existing diagrams keep theirs">
            Default font size
          </label>
          <select id="pref-font-size" value={prefs.defaultFontSize} onChange={(e) => set({ defaultFontSize: Number(e.target.value) })}>
            {withCurrent(FONT_SIZES, prefs.defaultFontSize).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset className="pref-group">
        <legend>Diagram Editor</legend>
        <div className="pref-row">
          <label htmlFor="pref-grid">Show grid</label>
          <input id="pref-grid" type="checkbox" checked={prefs.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} />
        </div>
        <div className="pref-row">
          <label htmlFor="pref-snap">Snap to grid</label>
          <input id="pref-snap" type="checkbox" checked={prefs.snapToGrid} onChange={(e) => set({ snapToGrid: e.target.checked })} />
        </div>
        <div className="pref-row">
          <label htmlFor="pref-rad-thread">Role activity diagrams: connect new elements with a state line</label>
          <input id="pref-rad-thread" type="checkbox" checked={prefs.radAutoThread} onChange={(e) => set({ radAutoThread: e.target.checked })} />
        </div>
        <div className="pref-row">
          <label htmlFor="pref-grid-size" title="Grid spacing in diagram units, also the snap step and the Shift+arrow nudge">
            Grid size
          </label>
          <select id="pref-grid-size" value={prefs.gridSize} onChange={(e) => set({ gridSize: Number(e.target.value) })}>
            {withCurrent(GRID_SIZES, prefs.gridSize).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset className="pref-group">
        <legend>Files</legend>
        <div className="pref-row">
          <label htmlFor="pref-autosave" title="Saves a project that already has a file while it has unsaved changes. Unsaved work is also kept for recovery after a crash.">
            Auto-save
          </label>
          <select id="pref-autosave" value={prefs.autoSaveSeconds} onChange={(e) => set({ autoSaveSeconds: Number(e.target.value) })}>
            {AUTO_SAVE_INTERVALS.map((s) => (
              <option key={s} value={s}>
                {intervalLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset className="pref-group">
        <legend>Updates</legend>
        <div className="pref-row">
          <label htmlFor="pref-updates" title="Asks GitHub for the latest OpenUML release at startup and once a day">
            Check for updates automatically
          </label>
          <input id="pref-updates" type="checkbox" checked={prefs.checkForUpdates} onChange={(e) => set({ checkForUpdates: e.target.checked })} />
        </div>
      </fieldset>
    </Modal>
  )
}
