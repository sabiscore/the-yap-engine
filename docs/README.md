# The Yap Engine — Documentation Index

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)

## Canonical top-level docs

- [`../README.md`](../README.md) — product overview, quick start, operator map, troubleshooting
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — control-plane design
- [`../SAFETY.md`](../SAFETY.md) — safety posture and review boundaries
- [`../INTEGRATION.md`](../INTEGRATION.md) — current integration instructions
- [`../SYSTEM-PROMPT.md`](../SYSTEM-PROMPT.md) — active system prompt baseline
- [`../MICRO-UTILITIES.md`](../MICRO-UTILITIES.md) — reusable inline utilities

## Operator guides

- [`QUICKSTART.md`](QUICKSTART.md) — **get running in under five minutes** (start here)
- [`STARTUP_GUIDE.md`](STARTUP_GUIDE.md) — full startup, env vars, cold-start tuning, `.env.local`
- [`INSTALL.md`](INSTALL.md) — detailed prerequisites, model Modelfiles, Redis, environment variables
- [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) — all environment variables and runtime config options
- [`OPERATIONS.md`](OPERATIONS.md) — day-to-day operator commands, dashboard, logs, audit, telemetry
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — `swarm doctor` flow, common errors, canonical model fix, debug flags
- [`UPGRADE.md`](UPGRADE.md) — version checks, upgrades, and rollback posture
- [`BACKUP.md`](BACKUP.md) — backup creation, listing, restore, and dry-run validation

## Video pipeline

- [`VIDEO-GENERATION.md`](VIDEO-GENERATION.md) — full route/payload contract, template taxonomy (10 templates), stage contracts
- [`TIKTOK_SETUP.md`](TIKTOK_SETUP.md) — TikTok Content API OAuth and publisher setup

## Version history and release

- [`V6.md`](V6.md) — **v6 production certification pass** (`8f25287`) — what changed, invariants confirmed, quality gate results
- [`CHANGELOG.md`](CHANGELOG.md) — full version history from V6.2.0 onward

## Reference docs

- [`AGENT_CATALOG.md`](AGENT_CATALOG.md) — runtime and domain agent roles
- [`SKILL_CATALOG.md`](SKILL_CATALOG.md) — core and meta skill inventory
- [`MODELFILE-GUIDE.md`](MODELFILE-GUIDE.md) — Ollama Modelfile conventions and rebuild instructions
- [`FRAMEWORK_MATRIX.md`](FRAMEWORK_MATRIX.md) — orchestration framework comparison

## Archive

- [`archive/README.md`](archive/README.md) — historical production notes, superseded guides, and archived implementation docs
  - Includes `SWARMX_OPERATOR_PASS0_INVENTORY.md` — full Pass 0 audit of broken surfaces and remediation status
- [`SETUP_AND_IMPLEMENTATION.md`](SETUP_AND_IMPLEMENTATION.md) — historical r7→r8 migration guide (skip on a fresh r8 checkout)
- [`SWARMXQ-APEX17-UPGRADE.md`](SWARMXQ-APEX17-UPGRADE.md) — APEX-17 r7 upgrade changelog
