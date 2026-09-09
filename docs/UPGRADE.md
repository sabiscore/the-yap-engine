# The Yap Engine — Upgrade Guide

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)

## Check for an update

```bash
swarm update
```

`swarm update` checks the installed version against the latest published package version.

Apply the update with:

```bash
swarm update --apply
```

Or with the explicit subcommand form:

```bash
swarm update apply --yes
```

During `apply`, SwarmX:

1. checks the currently installed version
2. creates a pre-update backup in `SWARMX_HOME/backups/`
3. runs `python -m pip install --upgrade swarmx`
4. reports the installed version after completion

Options:

| Flag | Effect |
|---|---|
| `--apply` | Apply the update instead of only checking |
| `--yes` | Skip the confirmation prompt during apply |
| `--pre` | Allow pre-release versions during apply |

## Manual upgrade

```bash
# 1 — Back up current state first
swarm backup --tag pre-upgrade

# 2 — Pull latest
git pull origin main

# 3 — Python
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"

# 4 — Node.js
pnpm install --frozen-lockfile
pnpm -F @swarmx/types typecheck
pnpm -F @swarmx/api build
pnpm -F @swarmx/dashboard build

# 5 — Verify
pnpm -F @swarmx/api test
pnpm -F @swarmx/dashboard test
swarm doctor
bash scripts/verify.sh
```

## Rollback

If the upgrade introduces a regression:

```bash
# 1 — Restore from the most recent backup
swarm restore --latest

# 2 — Revert the code to the previous commit
git checkout HEAD~1

# 3 — Reinstall
source .venv/bin/activate
pip install -e ".[dev]"
pnpm install --frozen-lockfile
pnpm -F @swarmx/api build
pnpm -F @swarmx/dashboard build

# 4 — Restart the stack
swarm up --restart --detach
```

## Version compatibility

| Engine / Runtime version | Python | Node.js | pnpm | Redis |
|---|---|---|---|---|
| **v6 (`2026.6.0`)** | **3.11+ (verified: 3.14.6)** | **22+ (verified: v24.17.0)** | **11.9.0** | **7.x** (optional) |
| 4.x (RC1) | 3.11 – 3.12 | 22 LTS | 9.x | 7.x |
| 3.x | 3.10+ | 20 LTS | 8.x | 6.x |

Downgrading across major versions is not supported without a full backup/restore cycle.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for per-release changes and [V6.md](V6.md) for the v6 production certification pass.
