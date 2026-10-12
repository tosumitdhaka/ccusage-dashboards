# UI interaction audit — 2026-10-12

Screenshots were captured automatically using a **real headless Chrome browser** at 1440 × 850, with **synthetic populated ccusage data only**. No private usage logs, usernames, session identifiers, or local browser profiles were captured.

## Screenshots
- `dashboard-overview.jpg`: chart toolbar and options visibility
- `populated-model-list.jpg`: Model, Provider, Cache and Session scrollports
- `model-options-menu.jpg`: native visualization menu
- `model-visualization-editor.jpg`: options dialog, dimension checkboxes and Save
- `dashboard-customization.jpg`: workspace customization modal
- `floating-drag-preview.jpg`: pointer-held Provider card and target outline
- `after-drag-release.jpg`: grid after drag release, before Save/Cancel

## Verified browser data

Before the focused fix, CSS had `scroll-behavior:smooth` on the root:
a scripted 400 px scroll measured 0 px immediately, 82 px after 75 ms, and
400 px after 350 ms. After the fix it measured 400 px immediately, at 75 ms,
and at 350 ms.

The post-fix Chrome audit asserts mouse-wheel hits inside the *visible*
content of Trend, Provider, Model (both at scroll offset 0 and 100 px),
Cache and Sessions. Every test advanced the document by 170–180 px while
leaving the relevant inner content scroll position unchanged. The
customization and visualization dialogs both opened; model options showed.

For an 80 × 128 px pointer drag, the floating card moved 36 × 57.6 px.
Grid placement snapped two rows (64 px) after release, so the card does
not stay directly attached to the cursor. That is an **open drag UX
concern**, not a claim of resolution.

These screenshots are **not** screenshots of the user's Windows browser.
Manual validation is still required for the exact user's local saved
configuration, browser extensions, input device, and responsiveness.

CI evidence: https://github.com/tosumitdhaka/ccusage-dashboards/actions/runs/38200223696
