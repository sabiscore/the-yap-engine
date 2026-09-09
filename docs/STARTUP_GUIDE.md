# The Yap Engine — Startup Guide

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)
> **Hardware:** HP EliteBook 850 G3 · 16 GB RAM · CPU-only · WSL2

## Quick Start (Recommended)

### Enhanced Startup with Health Checks

For the best experience with built-in health checks and diagnostics:

```bash
cd the-yap-engine
bash scripts/startup-enhanced.sh --dashboard
```

**What happens automatically:**
- Checks Python 3.11+ is installed (verified: **3.14.6**)
- Checks Node.js 22+ is installed (verified: **v24.17.0**)
- Verifies pnpm is available (verified: **11.9.0**)
- Checks port 3000 and 3001 availability (kills stale processes if needed)
- Evicts stale SwarmX API/dashboard instances from current and legacy roots before launch
- Verifies Ollama is running (non-blocking; continues without it)
- Attempts best-effort non-blocking `ollama serve` autostart when enabled
- Auto-seeds CORS origins for localhost (`http://localhost:3000`)
✅ Starts API server on `http://127.0.0.1:3001`  
✅ Starts dashboard on `http://127.0.0.1:3000`  

### Classic Startup

If you prefer the traditional method:

```bash
cd the-yap-engine
python -m venv .venv
source .venv/bin/activate
python -m pip install --editable '.[dev]'
pnpm install --frozen-lockfile
python -m cli up --dashboard --host 127.0.0.1 --port 3001
```

Then open: **http://localhost:3000**

## Advanced Usage

### Health Checks Only (No Startup)

Verify your environment is ready without starting services:

```bash
bash scripts/startup-enhanced.sh --check-only
```

### Verbose Output

See detailed logs for debugging:

```bash
bash scripts/startup-enhanced.sh --dashboard --verbose
```

### Custom Port

Use a different API port (if 3001 is already in use):

```bash
python -m cli up --dashboard --host 127.0.0.1 --port 3002
```

## Environment Variables

### Required (usually auto-set)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SWARMX_DASHBOARD_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | CORS allowlist for API |
| `SWARMX_API_HOST` | `127.0.0.1` | API server bind address |
| `SWARMX_API_PORT` | `3001` | API server port |
| `SWARM_HOME` | `~/.swarmx` | Runtime state directory |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Node environment (dev/production) |
| `TZ` | `Africa/Lagos` | Timezone for dashboard (WAT) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama LLM backend URL |
| `SWARMX_COMPOSER_TIMEOUT_MS` | `60000` (API default) | Composer model timeout in milliseconds. Increase on slow/cold hosts, decrease for faster fallback behavior. |
| `SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS` | `45000` | Cap used for short prompts (<=180 chars). Keeps interactive queries responsive without forcing premature 30s fallbacks. |
| `SWARMX_COMPOSER_NUM_PREDICT` | `256` | Composer response token ceiling; lower values reduce latency on constrained hosts. |
| `SWARMX_COMPOSER_KEEP_ALIVE` | unset | Optional override for Composer model keep-alive. Leave unset on 8 GB hosts so the request-level model policy remains authoritative. |
| `SWARMX_COMPOSER_FAST_MODEL` | `instruct-phi4-pro-q8-prod` | Fast fallback model candidate used when configured composer model fails. |
| `SWARMX_COMPOSER_TIMEOUT_HISTO_LOG_EVERY` | `3` | Log compact composer timeout histogram every N timeout fallbacks (`0` or negative logs every timeout). |
| `SWARMX_COMPOSER_RETRY_MAX_ATTEMPTS` | `2` | Max model call attempts per candidate before fallback. |
| `SWARMX_COMPOSER_RETRY_BASE_DELAY_MS` | `250` | Exponential backoff base delay between retries. |
| `SWARMX_COMPOSER_RETRY_MAX_DELAY_MS` | `2500` | Exponential backoff ceiling between retries. |
| `SWARMX_COMPOSER_CB_FAILURE_THRESHOLD` | `4` | Consecutive model failures before opening Composer circuit breaker. |
| `SWARMX_COMPOSER_CB_OPEN_MS` | `20000` | Circuit breaker cooldown window before half-open probe. |
| `SWARMX_COMPOSER_DEEP_TIMEOUT_MS` | `90000` | Minimum timeout budget for deep/complex prompts. |
| `SWARMX_COMPOSER_DEEP_TIMEOUT_MIN_MS` | Same as `SWARMX_COMPOSER_DEEP_TIMEOUT_MS` | Lower bound applied to deep-prompt timeout on constrained hosts — set this below `SWARMX_COMPOSER_DEEP_TIMEOUT_MS` to let complex prompts fail faster rather than waiting the full 90 s. |
| `SWARMX_OLLAMA_CACHE_TTL_MS` | `15000` | Ollama service-discovery cache TTL in milliseconds. Lowering this causes more-frequent re-discovery; raising it reduces overhead on stable Ollama deployments. |
| `SWARMX_OLLAMA_PROBE_TIMEOUT_MS` | `5000` | Default timeout for general fast Ollama `/api/version` probes. Use this longer budget for cold or constrained hosts. |
| `SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS` | `1500` | Dashboard-facing Ollama liveness budget for `/api/system/health`, bounded to 250–10000 ms. A failed liveness check skips model discovery. |
| `SWARMX_SYSTEM_HEALTH_MODEL_PROBE_TIMEOUT_MS` | `2500` | Model-readiness budget used only after Ollama is live, bounded to 250–10000 ms. |
| `NEXT_PUBLIC_SWARMX_COMPOSER_CLIENT_TIMEOUT_MS` | `120000` | Dashboard client-side abort ceiling for composer requests. |
| `SWARMX_START_OLLAMA_IF_DOWN` | `1` | Startup script attempts non-blocking `ollama serve` when endpoint is down. |
| `SWARMX_V5_POLL_TIMEOUT_MS` | `25000` | Timeout for `python -m swarmx metrics` subprocess used by API poller. Increase on slow hosts to avoid SIGTERM skips. |
| `SWARMX_REPO_ROOT` | Auto-detected | Absolute path to SwarmX repository; auto-set by `swarm up`. Required for metrics subprocess PYTHONPATH composition. |
| `SWARMX_PYTHON` | `sys.executable` | Python interpreter for metrics poller and CLI sidecars; auto-detected from active venv by `swarm up`. |
| `SWARMX_STARTUP_CURL_MAX_TIME` | `8` | Hard max-time (seconds) for startup script curl probes (Ollama/API/dashboard). Prevents hangs on half-open sockets. |
| `SWARMX_MODEL_STARTUP_PREWARM` | `0` | Set to `1` only when you explicitly want startup Relay prewarm. |
| `SWARMX_MODEL_PREDICTIVE_PREWARM` | `0` | Set to `1` only when you explicitly want speculative specialist prewarm after routing. |
| `SWARMX_HOST_PROFILE` | `auto` | Auto-detect `constrained_cpu_8gb` vs `standard_cpu_16gb`, or pin one explicitly in `.env.local`. |
| `VERBOSE` | (not set) | Enable verbose logging in startup script |

### Ollama Tuning By Host Profile

These Ollama variables are read by the Ollama daemon at startup. Export them before launching the stack, or pin them in `.env.local` (auto-loaded by `startup-enhanced.sh`).

| Variable | `constrained_cpu_8gb` profile | `standard_cpu_16gb` profile | Purpose |
|----------|---------------------|--------|
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | `http://127.0.0.1:11434` | Ollama base URL; must point to the daemon that holds model blobs. |
| `OLLAMA_NUM_PARALLEL` | `1` | `1` | Concurrent model inference slots. `1` remains safest on CPU-only hosts. |
| `OLLAMA_MAX_LOADED_MODELS` | `1` | `2` after measurement | Maximum resident models. `1` preserves strict constrained mode; `2` enables warmer reuse only when pressure checks remain safe. |
| `OLLAMA_FLASH_ATTENTION` | `0` | `0` until measured safe | Disabled on this CPU-only host because no local measurement supports enabling it. |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | `f16` until measured safe | Conservative KV cache default paired with flash attention off. |
| `OLLAMA_KEEP_ALIVE` | `0` | profile-derived | Global keep-alive. Constrained hosts unload aggressively; standard hosts may use a short reuse window after measurement. |

`startup-enhanced.sh` chooses the profile automatically from total RAM: hosts with at least roughly 12 GB total memory resolve to `standard_cpu_16gb`, otherwise `constrained_cpu_8gb`. When current free RAM drops below roughly 2.2 GB, the startup script temporarily falls back to constrained safeguards even on a standard host.

### Setting Environment Variables

## Cold Start and Model Warm-Up

### Why the first Composer request may take 60-120 s

instruct-phi4-pro-q8-prod (4.1 GB) is not kept resident when Ollama first starts — it is loaded
on demand. On a CPU-only host without enough VRAM, cold loading takes 60-120 s.

**Before V6.2-FIX-25/26**, the stack had a deadlock:
1. The Composer sent `POST /api/chat stream:false` with an `AbortSignal(45 s)`.
2. Ollama started loading the model (60-120 s).
3. The `AbortSignal` fired at 45 s — client disconnected.
4. Ollama's HTTP handler stayed blocked on the in-progress model load.
5. All subsequent `/api/version` probes timed out → Ollama deadlocked.

**After V6.2-FIX-25/26/27/28** (active since V6.2):

- **Python warmup** (`startup.py`): disabled unless
  `SWARMX_MODEL_STARTUP_PREWARM=1`. When enabled, it checks `/api/ps` before
  sending any warmup request. If the model is not resident, warmup is skipped.
- **Python health probe** (`startup.py`): uses `/api/version` with a short timeout
  instead of `/api/tags`, so startup health checks fail fast even when model listing
  is blocked by an in-flight load.
- **TypeScript composer** (`composer.ts`): checks `/api/ps` before the model call
  loop. If nothing is loaded, it starts an async preload (`/api/generate` with no
  `AbortSignal`) and immediately returns a `mode=fallback` "warming up" response.
  The dashboard shows a blue banner and auto-retries after 90 s.
  The preload uses a bounded 30-second keep-alive so a completed cold load is
  available for the retry without pinning a multi-gigabyte model for minutes on
  the 8 GB profile.
- **Enhanced startup shell** (`startup-enhanced.sh`): if Ollama is unresponsive but
  still owns the configured port, startup now kills the deadlocked listener before
  non-blocking autostart. This avoids "autostart succeeded=false" loops caused by
  failed rebind attempts to an already-occupied port.

### Constrained-host tuning for cold starts

Add to `.env.local` to optimize for this host:

```bash
# Raise probe timeout so cold Ollama (2-3 s to respond) is not incorrectly
# marked unreachable during the startup health check.
SWARMX_OLLAMA_PROBE_TIMEOUT_MS=5000

# Keep global residency disabled. Request-level keep_alive remains authoritative.
OLLAMA_KEEP_ALIVE=0

# Reduce response token ceiling for faster turnaround on simple queries.
SWARMX_COMPOSER_NUM_PREDICT=96

# Raise short-prompt timeout — gives the model up to 120 s to respond
# (used once the model IS loaded; preload guard prevents deadlocks).
SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS=120000
SWARMX_COMPOSER_TIMEOUT_MS=150000
```

`startup-enhanced.sh` now auto-detects the host profile and applies the matching
defaults automatically. The constrained `8gb` profile remains the safety floor,
and any host with low current free RAM still falls back to that single-model
path even when `SWARMX_HOST_PROFILE=16gb` is requested.

### Degraded health behavior

`GET /api/system/health` always distinguishes the API being available from the
Ollama backend being available. When Ollama is down, the API returns HTTP `200`
with `status: "degraded"`, reports every canonical model as `error` with
`"Ollama unreachable"`, and **does not** start `/api/tags` discovery. This keeps
dashboard health feedback bounded by `SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS`
instead of waiting for a full model-list timeout.

The dashboard surfaces three independent recovery states:

- **SwarmX API unavailable:** restore the API on port `3001`, then refresh.
- **Ollama backend unavailable:** run `ollama serve`, then wait for health to recover.
- **Memory pressure high/critical:** finish or unload memory-heavy work before
  starting another model-backed job.

On the 8 GB profile, do not respond to a degraded state by prewarming multiple
models. Restore at most one model only after physical memory headroom is safe.

### Manual opt-in prewarm before first use

To avoid the first cold request after a restart, explicitly warm the model with
a short keep-alive and verify residency. Do this only when you have enough
physical `MemAvailable` headroom:

```bash
# Pre-load the canonical Pilot for this session.
curl -s http://127.0.0.1:11434/api/generate \
  -d '{"model":"instruct-phi4-pro-q8-prod","prompt":"Hi","stream":false,"keep_alive":"2m","options":{"num_predict":1}}'

# Then verify the model is loaded, and unload it when finished:
ollama ps
ollama stop instruct-phi4-pro-q8-prod
```

```bash
# For this session only
export SWARMX_DASHBOARD_ORIGIN=http://localhost:3000
bash scripts/startup-enhanced.sh --dashboard

# Or set inline
VERBOSE=1 bash scripts/startup-enhanced.sh --check-only
```

### Persistent Across Shells (.env.local)

`startup-enhanced.sh` now auto-loads local overrides from `.env.local` (or `env.local`) at repository root before startup defaults are resolved.

Use this for stable Ollama endpoint pinning and constrained-host tuning across new terminals:

```bash
cat > .env.local <<'EOF'
# Ollama endpoint — points to the daemon that holds model blobs
OLLAMA_HOST=http://127.0.0.1:11434
SWARMX_OLLAMA_URL=http://127.0.0.1:11434
SWARMX_OLLAMA_BASE_URL=http://127.0.0.1:11434

# Host profile: auto-detect, or pin to constrained_cpu_8gb / standard_cpu_16gb explicitly
SWARMX_HOST_PROFILE=auto

# Ollama defaults for the constrained 8gb profile
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_KEEP_ALIVE=0
OLLAMA_FLASH_ATTENTION=0
OLLAMA_KV_CACHE_TYPE=f16
SWARMX_MODEL_STARTUP_PREWARM=0
SWARMX_MODEL_PREDICTIVE_PREWARM=0

# Composer tuning for constrained hardware
SWARMX_COMPOSER_MODEL=instruct-phi4-pro-q8-prod
SWARMX_COMPOSER_FAST_MODEL=instruct-phi4-pro-q8-prod
SWARMX_COMPOSER_NUM_PREDICT=96
SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS=120000
SWARMX_COMPOSER_TIMEOUT_MS=150000
EOF
```

> **Note:** Replace `11434` with the port of whichever Ollama daemon holds your
> model blobs. To find it: `ollama list` (or `curl http://127.0.0.1:11434/api/tags`).
> If you see `total blobs: 0`, that daemon has no models — switch to the one that does.

Then start normally:

```bash
bash scripts/startup-enhanced.sh --dashboard
```

`.env.local` is ignored by git and safe for machine-specific local overrides.

## Validation Commands

Run project checks through `make` from the repository root. When `.venv/bin/python`
exists, the Makefile uses it automatically; this ensures optional development tools
such as `pytest-timeout`, Ruff, and mypy are available instead of accidentally using
an incomplete system Python installation.

```bash
make test
make typecheck-py
make typecheck-ts
make check-phase1
```

## Troubleshooting

### "Port 3000 already in use"

The enhanced startup will attempt to free the port automatically. If that fails:

```bash
# Find the process
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use a different port
python -m cli up --dashboard --host 127.0.0.1 --port 3002
```

### Deterministic restart hygiene (new)

`startup-enhanced.sh` now performs an explicit old-instance eviction pass before port checks.

It also resolves `SCRIPT_DIR`/`ROOT_DIR` with `CDPATH` suppressed so customized
shell environments cannot corrupt repo-root detection during startup.

What it evicts:
- prior `python -m cli up` and `swarm.sh up` sessions
- stale Fastify API runtime (`swarmx-api/dist/server.js`)
- stale dashboard runtime (`@swarmx/dashboard` / `next start --port 3000`)

Scope guard:
- eviction is limited to processes associated with this repository root or the legacy `SwarmX-1.5` root hint.

Operational result:
- repeated restarts are deterministic even after interrupted runs.

### "Ollama is not responding"

This is non-blocking — the API will start anyway. To fix:

```bash
# In a new terminal
ollama serve

# Or check the connection
curl http://localhost:11434/api/version
```

If startup stalls at `Checking Ollama service...`, cap probe time explicitly:

```bash
export SWARMX_STARTUP_CURL_MAX_TIME=8
bash scripts/startup-enhanced.sh --dashboard
```

If you want startup to skip background autostart attempts:

```bash
export SWARMX_START_OLLAMA_IF_DOWN=0
bash scripts/startup-enhanced.sh --dashboard
```

### Composer always falls back or times out on a low-RAM host

Symptoms: every Composer response is a fleet summary (mode = `fallback`) even when
`ollama list` shows models installed, or requests time out after 60 s.

**Diagnosis:**

```bash
# 1. Confirm Ollama endpoint holds model blobs
curl -s http://127.0.0.1:11434/api/tags | python3 -m json.tool | head -20

# 2. Verify the effective Ollama URL SwarmX sees
curl -s http://127.0.0.1:3001/api/system/health | python3 -m json.tool | grep -A5 ollama

# 3. Check available RAM before starting the stack
free -h
```

**Fix — pin the correct endpoint and extend timeouts in `.env.local`:**

```bash
cat > .env.local <<'EOF'
OLLAMA_HOST=http://127.0.0.1:11434
SWARMX_OLLAMA_URL=http://127.0.0.1:11434
SWARMX_OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_FLASH_ATTENTION=0
OLLAMA_KV_CACHE_TYPE=f16
SWARMX_COMPOSER_MODEL=instruct-phi4-pro-q8-prod
SWARMX_COMPOSER_NUM_PREDICT=96
SWARMX_COMPOSER_TIMEOUT_MS=150000
SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS=120000
EOF
bash scripts/startup-enhanced.sh --dashboard
```

Key notes:
- `instruct-phi4-pro-q8-prod` requires ~4.3 GB RAM. If the host has <5 GB available, the model
  may be paged to RAM and take 2–3 min to answer. Token ceiling (`NUM_PREDICT=96`) keeps
  responses short and prevents runaway inference.
- Keep `OLLAMA_FLASH_ATTENTION=0` and `OLLAMA_KV_CACHE_TYPE=f16` on this CPU host class unless
  a measured compatibility pass proves a different pair is stable. Q8 Phi-4 plus
  flash-attention/q8 KV has a documented segfault risk on the EliteBook profile.
- `startup-enhanced.sh` auto-discovers the live Ollama endpoint on startup
  (`check_ollama()`) so stale `.env.local` entries self-correct at launch.
- The Composer reports `mode: "fallback"` in its diagnostic payload. Check `diagnostics`
  in the API response or the `composer_preflight` log entry.

### Composer fallback despite models being installed

If Composer falls back even when models are installed:

```bash
# Verify installed model tags
ollama list

# Recommended explicit setting (tag included)
export SWARMX_COMPOSER_MODEL=instruct-phi4-pro-q8-prod
```

Notes:
- API auto-normalizes model names by appending `:latest` when omitted.
- First inference after startup can be slower due to model load.
- Presence checks like `are you there?` and `ping` are handled locally from fleet state and do not require model inference.
- Idle-assignment questions (`how many are idle and why no tasks?`) are handled locally and include assignment guidance.
- API now emits `composer_preflight` logs for each composer request with route-level decision (`local` vs `model`) and timeout/model context.
- Verify effective timeout in your shell before startup:
   `echo ${SWARMX_COMPOSER_TIMEOUT_MS:-60000}`

### Composer latency diagnostics (preflight + timeout histogram)

When tuning under load, use these logs from the API process:

- `composer_preflight`: shows whether request was routed locally or to model, with model tag and timeout.
- `Composer model call failed — using fleet summary fallback`: includes `elapsedMs`, `timeoutCount`, and compact `timeoutHistogram` every N timeouts.
- `composer_model_retry_backoff`: logs retry attempt, delay, and error reason when transient model/network failures occur.
- Composer fallback output now includes `Model discovery source` (`http`, `subprocess`, or `static`) so operators can tell whether `/api/tags`, `ollama list`, or static config was used.

Example tuning:

```bash
export SWARMX_COMPOSER_TIMEOUT_MS=55000
export SWARMX_COMPOSER_TIMEOUT_HISTO_LOG_EVERY=2
bash scripts/startup-enhanced.sh --dashboard
```

### Repeated "V5 metrics poll skipped" logs

If you see frequent metrics poll skips with subprocess `SIGTERM`, increase the poll timeout:

```bash
export SWARMX_V5_POLL_TIMEOUT_MS=30000
bash scripts/startup-enhanced.sh --dashboard
```

### Agent list initially empty

The API seeds the in-memory agent registry from `agents/catalog.yaml` on startup.
If the catalog is missing, it falls back to a static internal snapshot so the dashboard still renders agents as `idle`.

### "Cross-Origin Request Blocked" in Browser

See [CORS_CONFIGURATION.md](../docs/CORS_CONFIGURATION.md#troubleshooting) for detailed solutions.

Common fixes:
```bash
# 1. Restart with auto-seeding
bash scripts/startup-enhanced.sh --dashboard

# 2. Verify CORS env var is set
echo $SWARMX_DASHBOARD_ORIGIN

# 3. Clear browser cache (Cmd+Shift+Delete on macOS, Ctrl+Shift+Delete on Linux)
```

### "Cannot find Python / Node.js"

```bash
# Check Python
python3 --version

# If missing: Install Python 3.11+ (verified on this host: 3.14.6)
# macOS
brew install python@3.12
# Ubuntu/Debian
sudo apt-get install python3.12 python3.12-venv

# Check Node.js
node --version
# If missing: Download from nodejs.org or use nvm
```

### "Dashboard shows 'Cannot reach API'"

```bash
# Check if API is running
curl http://127.0.0.1:3001/health

# Inspect structured swarm + Ollama health
curl http://127.0.0.1:3001/api/system/health | python3 -m json.tool

# Check API logs
tail -50 ~/.swarmx/logs/swarmx-*.log

# Restart
bash scripts/startup-enhanced.sh --dashboard
```

### Slow Dashboard Load on First Run

First build takes 2-3 minutes. This is normal:
- TypeScript compilation
- Next.js Turbopack build
- Route prerendering

Subsequent startups are faster (~30s).

## Log Files

Logs are stored in `~/.swarmx/logs/`:

```bash
# API server logs
# Foreground mode (`swarm up --dashboard`): API logs stream in the terminal
# where you started the stack.
# Detached mode (`swarm up --detach`):
tail -f ~/.swarmx/logs/swarmx-api.log

# Dashboard logs
tail -f ~/.swarmx/logs/swarmx-dashboard.log

# Enhanced startup logs
tail -f ~/.swarmx/logs/startup-enhanced.log

# All logs
tail -f ~/.swarmx/logs/*.log
```

## Performance Tuning

### Memory Pressure

If you see "MEM HIGH" or "MEM CRITICAL" in the dashboard:

1. **Reduce model concurrency:**
   ```bash
   export SWARMX_MAX_CONCURRENT_TASKS=2
   ```

2. **Reduce token output ceilings:**
   Edit `configs/guardrails.yaml` → `governance.token_ceilings`

3. **Enable ZRAM (Linux):**
   ```bash
   bash setup/zram_setup.sh
   ```

### CPU Optimization

To improve performance on 4-core systems:

```bash
export SWARMX_CONCURRENCY_POOL_SIZE=2
bash scripts/startup-enhanced.sh --dashboard
```

## Stopping Services

```bash
# Graceful shutdown (Ctrl+C in terminal where started)
# Waits for in-flight tasks to complete

# Or force-stop all services
pkill -f "python -m cli up"
pkill -f "next start|@swarmx/dashboard"
```

## Production Deployment

For production, set strict CORS:

```bash
export NODE_ENV=production
export SWARMX_DASHBOARD_ORIGIN=https://swarmx.your-domain.com
bash scripts/startup-enhanced.sh --dashboard
```

**Important:** 
- Never use `NODE_ENV=development` in production
- Always set explicit CORS origins, no fallback
- Use `.env` files or secrets manager, never commit credentials

## Monitoring

### Dashboard Telemetry

The dashboard displays real-time metrics:
- **System Health:** CPU, memory, pressure tier (normal/high/critical)
- **Agent Activity:** Running agents, completed tasks, error count
- **Model Status:** Response times, token usage, Ollama status
- **Recent Events:** Last 100 lifecycle events with timestamps

### Command Palette

Press `Ctrl+K` (or `Cmd+K` on macOS) to open the command palette:
- Navigate to pages
- View running agents
- Run quick diagnostics
- Access system commands

### Health API

```bash
# Check API health
curl http://127.0.0.1:3001/health

# Check structured system + swarm health
curl http://127.0.0.1:3001/api/system/health

# Get system metrics
curl http://127.0.0.1:3001/api/system/metrics

# Stream events
curl -N http://127.0.0.1:3001/api/events
```

## Development Setup

For local development with hot-reload:

```bash
# Terminal 1: Start API (auto-reloads on Python changes)
source .venv/bin/activate
python -m cli up --dashboard --host 127.0.0.1 --port 3001

# Terminal 2: Start Dashboard dev server (auto-reloads on TypeScript/CSS changes)
pnpm -F @swarmx/dashboard dev
```

Navigate to `http://localhost:3000` (dev server) for auto-reload.

## Next Steps

1. ✅ **Startup successful?** Open http://localhost:3000
2. 📚 **Learn the Dashboard:** Explore the Composer, Workflows, and Logs pages
3. 🤖 **Run a Task:** Use the Composer to test a simple task
4. 📖 **Read Documentation:**
   - [CORS Configuration](CORS_CONFIGURATION.md) — network setup
   - [README.md](../README.md) — project overview
   - [ARCHITECTURE.md](../ARCHITECTURE.md) — system design

## Getting Help

- **Documentation:** See `docs/` directory
- **Logs:** Check `~/.swarmx/logs/` for detailed error messages
- **Issues:** Open an issue on GitHub with logs and environment details
- **Community:** See README.md for community resources

## Further Reading

- [CORS Configuration Guide](CORS_CONFIGURATION.md)
- [SwarmX Architecture](../ARCHITECTURE.md)
- [Safety & Execution Policy](../SAFETY.md)
- [System Prompt](../SYSTEM-PROMPT.md)
