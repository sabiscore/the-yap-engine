---
name: openclaw-vision-storyboard
description: Use bounded local vision inference to improve storyboard composition, OCR, caption placement, continuity and visual effect selection.
user-invocable: true
---

# Vision-Enhanced Storyboard

## Use when
A storyboard, frame sequence or rendered short needs visual inspection.

## Workflow
1. Select the minimum frame sample needed.
2. Resize frames to the smallest resolution that preserves required evidence.
3. Run exactly one admitted vision workload at a time on CPU-only hosts.
4. Convert output into structured observations: composition, subject/foreground/background, OCR, caption-safe region, continuity, motion/effect opportunities and visual defects.
5. Feed observations back into the storyboard contract.
6. Release the vision model before another heavyweight model stage.

## Boundaries
Never keep a vision model resident beside an active 7B model on the constrained baseline. Never retain raw frames unnecessarily. Do not invent OCR text when confidence is low.

## Output
Return scene-indexed observations and concrete storyboard revisions.

## Stop conditions
Stop when each sampled scene has enough evidence for a deterministic revision or an explicit insufficient-evidence result.
