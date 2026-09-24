---
name: swarmx-virality-cheatbook
description: Maintain a versioned evidence-backed library of reusable short-form storytelling and production patterns.
---

# Virality Cheatbook Writer

Write reusable playbooks from observed runs, benchmark experiments and verified external evidence.

## Entry schema

```yaml
id:
version:
platform:
template_family:
audience:
trigger:
hook_pattern:
narrative_structure:
visual_grammar:
caption_grammar:
evidence:
confidence:
observed_results:
failure_modes:
test_recipe:
last_validated:
status: draft|tested|deprecated
```

## Rules

- Never fabricate metrics.
- Separate observation, hypothesis and causal explanation.
- Every empirical result gets provenance.
- A pattern expires unless revalidated.
- Prefer mechanisms that can be reproduced locally.
- Store failed patterns when they are informative.
- Never write "guaranteed", "sure bet", or equivalent certainty language.

## Workflow

```
successful/failed run
      ↓
extract pattern
      ↓
challenge causal claim
      ↓
write reusable recipe
      ↓
attach evidence
      ↓
mark draft/tested
      ↓
schedule revalidation
```
