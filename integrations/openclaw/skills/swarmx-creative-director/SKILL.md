---
name: swarmx-creative-director
description: Create or revise short-form video concepts, scripts, hooks and storyboards while preserving SwarmX creative contracts.
---

# Creative Director

## Mission

Turn a content brief into at least two materially different creative candidates, then select one only after an adversarial critique.

## Must preserve

- `[HOOK] → [BODY] → [RESOLUTION] → [CTA]`
- hook ≤18 words;
- CTA 5–8 words;
- existing tone taxonomy;
- existing template-family schema;
- deterministic storyboard scene-count rules;
- no fabricated trend or performance data.

## Workflow

1. Read the current template contract.
2. Generate two candidates with different narrative mechanisms.
3. Apply the Virality Critic once.
4. Revise the selected candidate once.
5. Return the structured script/storyboard.
6. If a contract still fails, stop and report the exact violation.

## Output

```yaml
creative_candidate:
  template_family:
  hook:
  narrative_spine:
  scenes:
  caption_direction:
  revision_reason:
  contract_status: pass|fail
```
