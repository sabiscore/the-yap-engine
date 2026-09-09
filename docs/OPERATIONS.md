# The Yap Engine — Operations Guide

> **Powered by SwarmXQ** · Day-to-day commands for running the stack as an operator.


## Stack lifecycle

### Start

```bash
swarm up
```

Options:

| Flag | Effect |
|---|---|
| `--dashboard` | Also start the dashboard dev server |
| `--workers N` | Set BullMQ worker concurrency |
| `--port PORT` | Override API port |
| `--host HOST` | Override the API bind host |
| `--detach` | Run the services in the background and write PID files |

Foreground API plus dashboard:

```bash
swarm up --dashboard
```

Detached operator services:

```bash
swarm up --dashboard --detach
```

### Stop

```bash
swarm up --down
```

### Restart

```bash
swarm up --restart --detach
```

## Health and status

```bash
swarm status               # current status snapshot
swarm status --watch       # live-refresh in terminal
swarm status --json        # machine-readable JSON
swarm doctor               # dependency and config health check
```

## Logs

```bash
swarm logs                 # recent runtime logs
swarm logs --follow        # stream (Ctrl-C to stop)
swarm logs --agent ID      # filter by agent ID
swarm logs --level error   # filter by severity
swarm logs --lines 200     # increase history window
swarm logs --json          # NDJSON output
```

## Dashboard

```bash
swarm status dashboard     # open browser dashboard
```

The dashboard surfaces:

- **Agent fleet** — live status per agent, PID, CPU/memory
- **Queue depth** — BullMQ queue pressure per named queue
- **Health radar** — composite SCS score with per-layer breakdown
- **System resources** — cgroup CPU, memory, I/O
- **Live logs** — journald-backed structured log stream
- **Workflows** — DAG inspection and YAML editing

### Browser-agent verification

Use `agent-browser` for repeatable dashboard checks after starting a local dev
or production dashboard. It is an operator verification tool only; it is not
part of the SwarmX runtime.

```bash
agent-browser doctor
agent-browser open http://localhost:3000/video
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser errors
agent-browser console
agent-browser set viewport 390 844
agent-browser open http://localhost:3000/system
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser close
```

For video closeout, verify `/video`, the certified `/video/<jobId>` detail route,
and `/system` at desktop and narrow widths. Any page error or application
console error is a release blocker until investigated.

## Missions and runs

```bash
swarm run <workspace> --target "..." --autonomous --max-iterations 3
swarm inspect mission <id>
swarm inspect memory <id>
swarm inspect graph
```

## Evolution

```bash
swarm evolve generate <workspace>    # generate proposals for review
swarm evolve review <proposal-id>    # inspect a proposal
swarm evolve apply <proposal-id>     # apply a proposal
swarm gate check "apply proposal"    # evaluate a gate decision
```

## Audit

```bash
swarm audit               # view recent audit entries
swarm audit --limit 50    # show more entries
swarm audit --count       # show total audit entry count
swarm audit --json        # machine-readable output
```

## Backup and restore

See [BACKUP.md](BACKUP.md).

## Queue operations

Queue and runtime pressure are easiest to inspect from the dashboard and from `swarm status` plus `swarm logs --follow`.

## systemd unit (Linux production)

Example unit file at `/etc/systemd/system/swarmx.service`:

```ini
[Unit]
Description=SwarmX Control Plane
After=network.target redis.service

[Service]
Type=simple
User=swarmx
WorkingDirectory=/opt/swarmx
ExecStart=/home/swarmx/.local/bin/swarm up --workers 4
ExecStop=/home/swarmx/.local/bin/swarm up --down
Restart=on-failure
RestartSec=5
Environment=SWARMX_HOME=/var/lib/swarmx
Environment=SWARMX_LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
```

Use `ExecStart=/home/swarmx/.local/bin/swarm up --detach --workers 4` if you want the CLI to manage PID files and background processes itself.

```bash
sudo systemctl enable --now swarmx
journalctl -u swarmx -f
```

## journald integration

When running under systemd, logs are forwarded to journald automatically. The API's `journald.ts` service tails `journalctl -f -o json` and emits `log:entry` SSE events to the dashboard.

Structured log fields forwarded:

| journald field | SSE field | Notes |
|---|---|---|
| `MESSAGE` | `message` | Log body |
| `PRIORITY` | `level` | 0–7 mapped to error/warn/info/debug |
| `_SYSTEMD_UNIT` | `unit` | systemd unit name |
| `SWARMX_AGENT_ID` | `agentId` | Agent that emitted the log |

## Telemetry

```bash
swarm telemetry             # recent trace events
swarm telemetry --stats     # aggregate statistics
swarm telemetry --json      # machine-readable output
```

OTLP endpoint configurable via `OTEL_EXPORTER_OTLP_ENDPOINT`.
