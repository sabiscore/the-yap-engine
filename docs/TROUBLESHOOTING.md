# The Yap Engine — Troubleshooting

## First steps

Always start with:

```bash
swarm doctor
```

`swarm doctor` runs all health checks and reports the exact failure with a fix suggestion for each. Most issues are diagnosed here.

```bash
swarm status --json
```

Provides machine-readable runtime state.

---

## Common problems

### `swarm: command not found`

The CLI is not on `$PATH`.

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add this line to `~/.bashrc` or `~/.zshrc`, then reload:

```bash
source ~/.bashrc
```

If `~/.local/bin/swarm` does not exist, reinstall:

```bash
./scripts/install.sh
```

---

### `swarm doctor` reports Python version failure

The Yap Engine requires Python 3.11+. The verified runtime on this host is **3.14.6**.

```bash
python3 --version
```

If the version is below 3.11, install a newer Python:

```bash
# Ubuntu / WSL2
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt-get install python3.12

# macOS
brew install python@3.12
```

---

### Redis connection refused

```
ECONNREFUSED redis://localhost:6379
```

Start Redis:

```bash
sudo systemctl start redis        # Linux systemd
brew services start redis         # macOS
```

Verify:

```bash
redis-cli ping
# → PONG
```

If using a remote Redis, set:

```bash
export REDIS_URL=redis://host:6379
```

---

### API starts but dashboard shows "Connecting…"

The SSE stream at `/api/events` is not reachable from the dashboard.

Confirm the API is running and then follow the runtime logs:

```bash
swarm status
swarm logs --follow --level warn
```

Test the endpoint directly:

```bash
curl -N http://localhost:3001/api/events
```

---

### Terminal sessions disconnect immediately

The WebSocket endpoint `/ws/terminal/:sessionId` is timing out.

Check that `node-pty` is installed:

```bash
cd apps/swarmx-api && node -e "require('node-pty')"
```

If it fails, rebuild native modules:

```bash
pnpm rebuild
```

node-pty requires a C++ toolchain. On Ubuntu:

```bash
sudo apt-get install build-essential
```

---

### Ollama models not found

The Yap Engine uses canonical APEX-17 r8 model tags. If you see model-not-found errors, the models need to be built from Modelfiles:

```bash
# Rebuild all canonical models from Modelfiles
bash scripts/rebuild-all-modelfiles.sh

# Verify canonical naming
bash scripts/rebuild-all-modelfiles.sh --validate

# Then verify they are available
ollama list
```

Expected models after rebuild:

| Operator | Canonical tag |
|---|---|
| Relay | `route-phi4-lite-q4km-prod` |
| Pilot | `instruct-phi4-pro-q8-prod` |
| Architect | `plan-qwen25-pro-q5km-prod` |
| Oracle | `reason-deepseekr1-pro-q5km-prod` |
| Forge | `code-qwen25-pro-q5km-prod` |
| Auditor | `critique-deepseekr1-pro-q5km-prod` |

Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags | python3 -m json.tool | head -20
```

---

### `swarm run` exits immediately with no output

Check the runtime and then inspect recent logs:

```bash
swarm status
swarm logs --lines 100 --level info
```

Enable verbose logging:

```bash
SWARMX_LOG_LEVEL=debug swarm run <workspace> --target "..." --verbose
```

---

### Dashboard performance is slow

For large agent fleets (>50 agents), the virtualized list is active by default. If scrolling is still slow:

- Reduce `SWARMX_MAX_LOG_BUFFER` (default 1000 entries)
- Lower the SSE event rate in `configs/brain.yaml`

---

### `agent-browser install` cannot download Chrome on Linux

If the CLI prints a Chrome-for-Testing URL and retries the download, first check
whether the archive already exists:

```bash
ls -lh ~/.cache/agent-browser/chrome-linux64.zip
```

When the archive was downloaded manually, extract it under the agent-browser
cache and point the user-level config at the extracted Chrome binary. For the
151.0.7922.47 Linux archive, the verified shape is:

```text
~/.cache/agent-browser/chrome-linux64.zip
~/.cache/agent-browser/chrome-151.0.7922.47/chrome-linux64/chrome
~/.agent-browser/config.json
```

`~/.agent-browser/config.json`:

```json
{
  "executablePath": "/home/<user>/.cache/agent-browser/chrome-151.0.7922.47/chrome-linux64/chrome",
  "args": "--no-sandbox,--disable-dev-shm-usage"
}
```

Use the fully expanded absolute home path in JSON. To verify the local launch
path without relying on persistent config, pass the same values as environment
variables:

```bash
AGENT_BROWSER_EXECUTABLE_PATH="$HOME/.cache/agent-browser/chrome-151.0.7922.47/chrome-linux64/chrome" \
  AGENT_BROWSER_ARGS="--no-sandbox,--disable-dev-shm-usage" \
  agent-browser open about:blank

agent-browser close
```

`agent-browser doctor` may still fail its CDN network probe while offline. Treat
that as an install blocker only if the Chrome check or launch test also fails.

If Linux dependency errors remain, run `agent-browser install --with-deps`.

---

### Database locked / `SQLITE_BUSY`

Multiple processes are writing to the same SQLite file.

Only one SwarmX stack instance should run per `SWARMX_HOME`. Check for orphaned processes:

```bash
ps aux | grep swarmx
```

Kill any duplicates, then restart:

```bash
swarm up --down
swarm up
```

---

## Video pipeline issues

### `FFMPEG_UNAVAILABLE` error during render

The video renderer requires `ffmpeg` and `ffprobe` (version ≥ 6.0). On Windows hosts running WSL2, the binaries must be installed and executable inside WSL2:

```bash
which ffmpeg
which ffprobe
```

If not found, install via apt:

```bash
sudo apt update && sudo apt install -y ffmpeg
```

Run the smoke test to verify:

```bash
pnpm -F @swarmx/api run test:video:smoke
```

### Word-level captions not aligned (`faster-whisper` missing)

If video renders complete but subtitles lack word-level timing precision, `faster-whisper` is not installed. This is non-blocking — the pipeline degrades gracefully to sentence-level timing.

To enable word-level alignment:

```bash
source .venv/bin/activate
pip install faster-whisper
```

### Modal cloud GPU render fallback

If `SWARMX_VIDEO_RENDER_BACKEND=auto` is configured but Modal credentials (`SWARMX_MODAL_RENDER_URL`) are not provisioned, the pipeline automatically falls back to local FFmpeg rendering. No action is required unless cloud GPU acceleration is specifically needed.

### Loudnorm filter errors (Gap B audio mastering fail-open)

In v6 (`ffmpeg-video-renderer.ts`), audio mastering loudnorm errors fail open. If the EBU R128 two-pass loudnorm normalization encounters an error, the render completes with un-normalized audio rather than failing the job.

### Script schema validation failed (`SCRIPT_SCHEMA_INVALID`)

Scripting output from the Architect model must conform to the 4 canonical script sections:
- `[HOOK]` (≤ 18 words, passes `HOOK_BLOCKLIST`)
- `[BODY]` (stakes escalation, `[VISUAL: ...]` prompts)
- `[RESOLUTION]` (1–2 sentences, resolves tension)
- `[CTA]` (5–8 words, audience-specific action)

If an LLM returns poorly structured text, check that `plan-qwen25-pro-q5km-prod` has sufficient context or retry the job with a more specific brief.

---

## Debug flags

| Environment variable | Effect |
|---|---|
| `SWARMX_LOG_LEVEL=debug` | Verbose logging everywhere |
| `SWARMX_JSON=1` | All CLI output as JSON |
| `SWARMX_NO_COLOR=1` | Disable terminal colors |
| `SWARMX_QUIET=1` | Suppress decorative output |
| `SWARMX_DRY_RUN=1` | Run planning steps only, no execution |

## Getting help

Collect the following before filing an issue:

- `swarm doctor`
- `swarm status --json`
- `swarm logs --lines 200 --json`
