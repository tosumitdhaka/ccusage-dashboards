# v0.4 browser performance and responsive evidence

This document establishes testable budgets for the local synthetic report in `scripts/browser-visual-audit.mjs`.

- **Filter redraw:** p95 of 12 successive 7D/30D workspace-filter updates must stay at or below **250 ms** in the GitHub Actions Ubuntu Chrome runner. This is a CI regression guard, **not** a 60 fps guarantee.
- **Pointer interactions:** native Chrome smoke asserts live drag preview and committed grid placement, with RAF-coalesced pointer updates. A dedicated frame-time trace and device-specific 16.7 ms motion budget remain a non-blocking optimization target.
- **Responsive geometry:** 390, 768, 1024, 1280, 1440, 1920 CSS-pixel viewports × dark/light/contrast; the audit checks horizontal overflow and visible dashboard content.
- **Zoom reflow:** CSS zoom at 125%, 150%, 200% verifies no horizontal overflow in the default 1440px viewport. CSS zoom approximates layout scaling; it is not browser UI zoom certification.
- **Visual artifacts:** 18 screenshot JPEGs are retained per CI run in the `ccusage-v04-ui-audit` Actions artifact for independent inspection. Screenshots are evidence, not an automatic proof of WCAG contrast or text clipping.
- **Privacy:** all performance and screenshot checks use an explicitly synthetic report, never local user usage logs.

If the performance gate regresses, first separate model aggregation time from DOM update cost and evaluate selective widget rendering. Do not disable the gate or substitute source-pattern assertions.
