/** Preferences: theme, grid, snap, grid size, default font size. Changes apply immediately. */
import type React from 'react'
import { FONT_SIZES } from '../../diagram'
import { Modal } from '../components/Modal'
import { uiStore, useUiStore, type ThemePreference } from '../uiStore'

const GRID_SIZES = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

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
          <label htmlFor="pref-font-size">Default font size</label>
          <select id="pref-font-size" value={prefs.defaultFontSize} onChange={(e) => set({ defaultFontSize: Number(e.target.value) })}>
            {FONT_SIZES.map((s) => (
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
          <label htmlFor="pref-grid-size">Grid size</label>
          <select id="pref-grid-size" value={prefs.gridSize} onChange={(e) => set({ gridSize: Number(e.target.value) })}>
            {GRID_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    </Modal>
  )
}
