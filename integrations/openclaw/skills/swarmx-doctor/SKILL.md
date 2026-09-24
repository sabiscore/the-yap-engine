---
name: swarmx-doctor
description: Diagnose SwarmX/Ollama pressure, model residency, pipeline health and integration failures without mutating protected invariants.
---

# Swarm Doctor

Use read-only diagnostics first.

Check:

1. API health;
2. Ollama reachability;
3. `/api/ps` residency;
4. available RAM;
5. pressure tier;
6. active 7B model;
7. `OLLAMA_NUM_PARALLEL`;
8. model registry consistency;
9. recent stage failures;
10. OpenClaw provider configuration.

## Hard stops

Never change:

- `RAM_CRITICAL_MB=800`;
- `MAX_CONCURRENT_JOBS=1`;
- `OLLAMA_NUM_PARALLEL=1`;
- SINGLE-7B lock;
- production promotion gates.

## Output

Return a concise incident-style report with observed values, likely cause, safe next action, and rollback/containment path.
