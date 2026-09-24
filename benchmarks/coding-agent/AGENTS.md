# Coding-agent benchmark contract

- Cases are deterministic and local-only.
- Never place credentials, private repository contents, or production artifacts in fixtures.
- Keep the tool surface bounded; do not add arbitrary shell or network tools.
- Validation commands are fixed by the case corpus.
- Change one model/runtime variable at a time when comparing candidates.
- Results are evidence for the model-evolution gate, not an automatic promotion mechanism.
