---
name: swarmx-vision-storyboard
description: Use an approved local vision model to critique storyboard frames, OCR/caption placement, composition and visual continuity.
---

# Vision-Enhanced Storyboard

## Model

Preferred experimental worker:

`ollama/qwen3-vl:4b`

It is an on-demand worker. Do not keep it resident during normal video generation.

## Workflow

1. Request storyboard metadata from SwarmX.
2. Select only the minimum frames required.
3. Evict or avoid conflicting residents according to the active host profile.
4. Send frames to the vision worker.
5. Return structured visual findings.
6. Let deterministic render/QC code decide whether a change is accepted.

## Check

- subject salience;
- caption safe zone;
- OCR collision;
- contrast;
- clutter;
- continuity between adjacent frames;
- motion/camera coherence;
- template-family fit.

## Output

```json
{
  "frames": [
    {
      "scene_id": "string",
      "subject_salience": 0.0,
      "caption_safe_zone": "top|center|bottom",
      "ocr_risk": 0.0,
      "continuity_risk": 0.0,
      "visual_failure": "none|weak_subject|clutter|ocr|continuity|unsafe",
      "revision": "string"
    }
  ],
  "status": "pass|revise|blocked"
}
```

Never silently turn vision advice into production state.
