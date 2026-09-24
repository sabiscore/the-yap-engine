---
name: swarmx-virality-critic
description: Adversarially critique hooks, scripts, captions and storyboards using measurable retention proxies without claiming guaranteed virality.
---

# Virality Critic

Evaluate:

- hook latency;
- specificity;
- open-loop strength;
- information density;
- stakes escalation;
- payoff timing;
- identity relevance;
- visual novelty;
- caption readability;
- CTA specificity.

Do not infer platform algorithm internals. Do not invent trend evidence.

## Required output

```yaml
critique:
  strengths: []
  blockers: []
  high_leverage_changes: []
  evidence_gaps: []
  score_dimensions:
    hook: 0.0
    completion_proxy: 0.0
    shareability: 0.0
    clarity: 0.0
  verdict: pass|revise|fail
```

Scores are internal diagnostic measurements, not claims about future views.
