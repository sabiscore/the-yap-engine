# The Yap Engine — Backup and Restore

> **Powered by SwarmXQ** — Capturing runtime state, mission logs, memories, and SQLite backups.

## What is backed up

A SwarmX backup captures the full runtime state needed to restore a running swarm:

| Component | Path | Notes |
|---|---|---|
| SQLite database | `~/.swarmx/swarmx.db` | Missions, runs, jobs, memories, events |
| Audit log | `~/.swarmx/audit.log` | Append-only; full history |
| Active config | `~/.swarmx/config.yaml` | Runtime configuration |
| Memory graph | `~/.swarmx/graph/` | FAISS index + node metadata |
| Skills | `~/.swarmx/skills/` | Custom skill definitions |

Model weights (Ollama) are **not** included — they are pulled separately.

## Create a backup

```bash
swarm backup
```

Creates a timestamped backup under `~/.swarmx/backups/`.

Options:

| Flag | Effect |
|---|---|
| `--tag TEXT` | Append a tag to the backup name |
| `--no-compress` | Write as a plain tar (faster, larger) |
| `--list` | List existing backups instead of creating a new one |

Example — pre-upgrade backup with a tag:

```bash
swarm backup --tag pre-upgrade-$(date +%Y%m%d)
```

## List backups

```bash
swarm backup --list
swarm backup list
```

The CLI reports the backup name, size, and whether the entry is compressed or an extracted directory.

## Restore from backup

```bash
swarm restore --latest
swarm restore --latest --dry-run
swarm restore run /path/to/swarmx-backup-20260501T101500Z.tar.gz
swarm restore run /path/to/swarmx-backup-20260501T101500Z --yes
```

Restore will:

1. Validate the backup manifest
2. Verify file integrity where checksums are available
3. Prompt before overwriting runtime files unless `--yes` is supplied
4. Restore runtime files into `SWARMX_HOME`
5. Restore config snapshots into the repository `configs/` directory

Add `--dry-run` to see what would change without applying.

## SQLite direct backup

For automated backup pipelines (cron, systemd timer):

```bash
# SQLite online backup — safe while the database is running
sqlite3 ~/.swarmx/swarmx.db ".backup ~/.swarmx/backups/$(date +%Y%m%d-%H%M%S).db"
```

## Systemd timer example

`/etc/systemd/system/swarmx-backup.service`:

```ini
[Unit]
Description=SwarmX daily backup

[Service]
Type=oneshot
User=swarmx
ExecStart=/home/swarmx/.local/bin/swarm backup --tag daily
```

`/etc/systemd/system/swarmx-backup.timer`:

```ini
[Unit]
Description=SwarmX daily backup timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now swarmx-backup.timer
```

## Audit log

The audit log is append-only and is **never** truncated by normal operations. It is included in every backup. To export it separately:

```bash
swarm audit --export ~/audit-export-$(date +%Y%m%d).ndjson
```
