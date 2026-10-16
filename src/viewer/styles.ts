/** Stylesheet of the website viewer (light and dark, following the system). */
export const VIEWER_CSS = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --text: #1f2328; --muted: #6e7781; --border: #d0d7de;
  --hover: rgba(31, 35, 40, 0.06); --selection: rgba(47, 111, 219, 0.14); --accent: #2f6fdb;
  --canvas: #ffffff; color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1d21; --panel: #23262b; --text: #e6e8eb; --muted: #9aa1a9; --border: #3a3f46;
    --hover: rgba(230, 232, 235, 0.07); --selection: rgba(75, 140, 240, 0.25); --accent: #4b8cf0;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
button { font: inherit; color: inherit; }
.ouv { display: grid; height: 100vh; grid-template-columns: minmax(200px, 280px) 1fr;
  grid-template-rows: auto 1fr auto; grid-template-areas: "top top" "tree main" "foot foot"; }
.ouv-top { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 8px 14px;
  background: var(--panel); border-bottom: 1px solid var(--border); min-width: 0; }
.ouv-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30%; }
.ouv-crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; overflow: hidden; flex: 1; }
.ouv-crumbs button { border: none; background: none; padding: 2px 6px; border-radius: 4px; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.ouv-crumbs button:hover { background: var(--hover); }
.ouv-crumbs button[aria-current] { font-weight: 600; cursor: default; }
.ouv-crumbs .sep { color: var(--muted); }
.ouv-tree { grid-area: tree; overflow: auto; background: var(--panel); border-right: 1px solid var(--border); padding: 6px 0; }
.ouv-tree ul { list-style: none; margin: 0; padding: 0; }
.ouv-row { display: flex; align-items: center; gap: 2px; padding: 1px 8px 1px 0; min-height: 24px; }
.ouv-row:hover { background: var(--hover); }
.ouv-row.current { background: var(--selection); }
.ouv-twisty { width: 18px; height: 18px; flex: none; border: none; background: none; padding: 0;
  color: var(--muted); cursor: pointer; }
.ouv-twisty[disabled] { visibility: hidden; }
.ouv-label { border: none; background: none; padding: 0 2px; text-align: left; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.ouv-label.inert { cursor: default; color: var(--muted); }
.ouv-label.diagram { font-weight: 600; }
.ouv-main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.ouv-canvas { position: relative; flex: 1; min-height: 160px; }
.ouv-stage { position: absolute; inset: 0; overflow: hidden; background: var(--canvas); cursor: grab; touch-action: none; }
.ouv-stage.ouv-panning { cursor: grabbing; }
.ouv-diagram { display: block; width: 100%; height: 100%; user-select: none; }
.ouv-diagram.ouv-enter { animation: ouv-fade 220ms ease-out; }
@keyframes ouv-fade { from { opacity: 0; } to { opacity: 1; } }
.ouv-diagram [data-view-id].ouv-drill { cursor: zoom-in; }
.ouv-diagram [data-view-id].ouv-drill:hover { filter: drop-shadow(0 0 3px rgba(47, 111, 219, 0.9)); }
.ouv-diagram.ouv-dimmed [data-view-id]:not(.ouv-lit) { opacity: 0.25; transition: opacity 150ms; }
.ouv-zoom { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 4px; }
.ouv-zoom button { min-width: 32px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--panel); cursor: pointer; }
.ouv-zoom button:hover { background: var(--hover); }
.ouv-walk { display: flex; align-items: center; gap: 4px; flex: none; }
.ouv-walk[hidden] { display: none; }
.ouv-walk button { min-width: 30px; height: 26px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--panel); cursor: pointer; }
.ouv-walk button:hover:not(:disabled) { background: var(--hover); }
.ouv-walk button:disabled { opacity: 0.4; cursor: default; }
.ouv-walk-label { min-width: 56px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.ouv-icom { flex: none; max-height: 34%; overflow: auto; background: var(--panel);
  border-top: 1px solid var(--border); padding: 8px 14px 10px; }
.ouv-icom[hidden] { display: none; }
.ouv-icom header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
.ouv-icom-hint { color: var(--muted); font-size: 12px; }
.ouv-icom-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 4px 16px; }
.ouv-icom h3 { margin: 0 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.ouv-icom ul { list-style: none; margin: 0; padding: 0; }
.ouv-icom-row { display: flex; align-items: baseline; gap: 6px; width: 100%; border: none; background: none;
  padding: 2px 4px; border-radius: 4px; text-align: left; cursor: pointer; }
.ouv-icom-row:hover:not(:disabled) { background: var(--hover); }
.ouv-icom-row:disabled { cursor: default; }
.ouv-icom-code { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 28px; }
.ouv-icom-text { display: flex; flex-direction: column; min-width: 0; }
.ouv-icom-detail { color: var(--muted); font-size: 12px; }
.ouv-icom-none { color: var(--muted); padding: 2px 4px; }
.role-input h3 { color: #2f6fdb; } .role-control h3 { color: #b7791f; } .role-output h3 { color: #1f9d55; }
.role-mechanism h3 { color: #805ad5; } .role-call h3 { color: var(--muted); }
@media (prefers-color-scheme: dark) {
  .role-input h3 { color: #6ea2f5; } .role-control h3 { color: #e0a84e; } .role-output h3 { color: #4cc38a; }
  .role-mechanism h3 { color: #b39af0; }
}
.ouv-foot { grid-area: foot; padding: 3px 14px; font-size: 11px; color: var(--muted);
  background: var(--panel); border-top: 1px solid var(--border); }
.ouv-error { padding: 24px; }
@media (max-width: 640px) {
  .ouv { grid-template-columns: 1fr; grid-template-rows: auto 30vh 1fr auto;
    grid-template-areas: "top" "tree" "main" "foot"; }
  .ouv-tree { border-right: none; border-bottom: 1px solid var(--border); }
}
`
