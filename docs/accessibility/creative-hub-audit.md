# Creative Hub accessibility audit

## Summary

This branch applies source-level fixes for muted-text contrast, control boundaries, 44 px primitives, coarse-pointer touch targets, focus visibility, safe areas and theme colour.

Automated axe, WebKit/iPhone, 320 px reflow and VoiceOver execution are OPEN — needs operator until executed against the preview build.

## POUR findings

| Principle | Issue | Criterion | Severity | Fix |
|---|---|---|---|---|
| Perceivable | Muted text failed AA on raised panels | 1.4.3 | P1 | --nocturne-muted: #8E99A6 |
| Perceivable | Control boundary tokens were too faint | 1.4.11 | P1 | --nocturne-control-border: #6B7583 |
| Operable | Button primitives were 28–36 px | 2.5.8 / 2.5.5 | P1 | 44 px primitive/mobile baseline |
| Operable | Focus ring was 1–1.5 px | 2.4.7 | P1 | 2 px ring + offset |
| Robust | Live stage changes need coalesced announcements | 4.1.3 | P1 | Validate single polite live region on preview |
| Perceivable | Self-hosted Space Grotesk/JetBrains Mono evidence not yet captured | performance support | P1 | OPEN — needs operator |

## Contrast

| Foreground | Background | Ratio | Target | Status |
|---|---|---:|---:|---|
| #8E99A6 | #0E0E10 | 6.66 | 4.5 | PASS |
| #8E99A6 | #1B1B1D | 5.94 | 4.5 | PASS |
| #8E99A6 | #2A2A2E | 4.94 | 4.5 | PASS |
| #6B7583 | #0E0E10 | 4.13 | 3.0 | PASS |
| #6B7583 | #1B1B1D | 3.68 | 3.0 | PASS |
| #6B7583 | #2A2A2E | 3.06 | 3.0 | PASS |

Recompute these ratios from the final rendered token values in CI/axe.

## Keyboard

| Element | Tab order | Enter/Space | Esc | Arrows |
|---|---|---|---|---|
| Button | DOM order | activates | n/a | n/a |
| TabsTrigger | Radix-managed | activates | n/a | Radix tab navigation |
| Sheet | trigger → content | opens/activates | closes/restores focus | n/a |
| Form input | DOM order | n/a | n/a | native |
| Bottom nav | DOM order | activates | n/a | n/a |

## Screen reader

| Element | Announced as | Issue / verification |
|---|---|---|
| StateBadge | label + state | glyph must remain aria-hidden |
| Pipeline Pulse | stage label and status text | verify stage changes are not spammed |
| Resource Budget | textual RAM/queue/concurrency values | numeric telemetry is not live-announced |
| Signal Estimate | estimate + not measured | must not imply measured reach/revenue |
| Error banner | alert | include remediation and request ID where available |

## Manual procedure

1. Run axe against /video, /video/[id] and /system.
2. Run WebKit with iPhone 14 Pro Max emulation.
3. Repeat at 320 px width and 200% zoom.
4. Tab through the shell; record focus loss or targets below 44 px.
5. Use VoiceOver and record state announcements.
6. Attach screenshots and command output to the release evidence row.

## Current result

OPEN — needs operator for physical/browser execution. No automated-only result is represented as a pass.
