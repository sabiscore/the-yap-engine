# The Yap Engine — Installation Guide

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)

## System requirements

| Component | Minimum | Verified on this host |
|---|---|---|
| OS | Linux (Ubuntu 22.04+ recommended), macOS 13+, WSL2 | WSL2 on Windows 11 |
| Python | 3.11 | **3.14.6** |
| Node.js | 22 LTS | **v24.17.0** |
| pnpm | 11.9.0 | **11.9.0** (`npm install -g pnpm@11.9.0`) |
| Redis | 7.x | 7.x (optional — only required when `SWARMX_VIDEO_USE_BULLMQ=1`) |
| Disk | 2 GB free | Models need additional space — see Step 5 |
| RAM | 8 GB minimum | **16 GB** (this host) |

### Production deployment requirements

These are required for full video pipeline operation. The pipeline degrades gracefully without them:

| Dependency | Minimum version | Purpose | Status on this host |
|---|---|---|---|
| FFmpeg + FFprobe | ≥ 6.0 | Local video render and artifact validation | **Not in Windows PATH** — install in WSL2 |
| espeak-ng | any | Fallback TTS voice synthesis | Needs WSL2 install check |
| Kokoro TTS | any | Production-quality narration | Optional — `pip install '.[tts]'` |
| faster-whisper | ≥ 1.1.0 | Word-level caption alignment | **Not installed** — `pip install '.[video]'` |
| Modal credentials | any | Cloud GPU render backend | **Not provisioned** — set `SWARMX_MODAL_RENDER_URL` |

### 1 — Clone and enter the repo

```bash
git clone <repo-url> the-yap-engine
cd the-yap-engine
```

### 2 — Python side

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 3 — Node.js side

```bash
pnpm install --frozen-lockfile
pnpm build
```

### 4 — Redis

```bash
# Ubuntu / Debian
sudo apt-get install redis-server
sudo systemctl enable --now redis

# macOS
brew install redis
brew services start redis
```

### 5 — Local LLM models (Ollama)

Download the GGUF files referenced by the canonical Modelfiles and place them in
`~/llm-local/gguf/`. The Modelfiles under `models/Modelfiles/` expect that exact
directory path; edit the `FROM` line in each Modelfile if you store GGUFs elsewhere.

| Operator  | Canonical tag                        | GGUF family |
|-----------|--------------------------------------|-------------|
| Relay     | `route-phi4-lite-q4km-prod`         | Phi-4-mini |
| Pilot     | `instruct-phi4-pro-q8-prod`         | Phi-4-mini |
| Architect | `plan-phi4-pro-q8-prod`             | Phi-4-mini |
| Architect | `plan-qwen25-pro-q5km-prod`         | Qwen2.5-7B |
| Forge     | `code-qwen25-pro-q5km-prod`         | Qwen2.5-7B |
| Oracle    | `reason-deepseekr1-pro-q5km-prod`   | DeepSeek-R1-7B |
| Auditor   | `critique-deepseekr1-pro-q5km-prod` | DeepSeek-R1-7B |

The authoritative GGUF filenames and all eleven canonical tags are defined by the
Modelfiles and rebuild script, not by ad hoc `ollama create` commands.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Rebuild the canonical model set from Modelfiles
bash scripts/rebuild-all-modelfiles.sh

# Verify canonical naming compliance
bash scripts/rebuild-all-modelfiles.sh --validate
```

To remove legacy alias-era models after migration, run:

```bash
bash scripts/rebuild-all-modelfiles.sh --evict-legacy
```

To swap any model later: update the corresponding Modelfile, rebuild the canonical
tag, then rerun the validation and doctor checks.

### 6 — Environment variables

Copy the example and fill in values:

```bash
cp configs/swarmx.defaults.yaml ~/.swarmx/config.yaml
```

Key environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `SWARMX_HOME` | `~/.swarmx` | Runtime data directory |
| `SWARMX_API_PORT` | `3001` | Fastify API port |
| `SWARMX_DASHBOARD_ORIGIN` | `http://localhost:3000` | Dashboard origin for CORS |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |
| `SWARMX_WORKSPACE` | current dir | Default workspace |
| `SWARMX_LOG_LEVEL` | `info` | Log verbosity |
| `SWARMX_MAX_PTY_SESSIONS` | `8` | Max concurrent terminal sessions |
| `SWARMX_PTY_SHELL` | `/bin/bash` | Shell for terminal sessions |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `SWARM_MODEL_FAST` | `instruct-phi4-pro-q8-prod` | Pilot model (fast fallback) |
| `SWARM_MODEL_REASON` | `reason-deepseekr1-pro-q5km-prod` | Oracle model (reasoning) |
| `SWARM_MODEL_CODE` | `code-qwen25-pro-q5km-prod` | Forge model (code generation) |

For day-to-day local startup, prefer:

```bash
bash scripts/startup-enhanced.sh --dashboard
```

The enhanced startup auto-detects host RAM:
- On **16 GB hosts** (`standard_cpu_16gb`), it sets `OLLAMA_MAX_LOADED_MODELS=2` to keep Pilot (~3 GB) resident while a 7B model runs (serial inference, `OLLAMA_NUM_PARALLEL=1`).
- On **8 GB hosts** (`constrained_cpu_8gb`), it clamps `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, and `OLLAMA_KEEP_ALIVE=0`.

Secrets belong in a secrets manager. Never commit API keys or credentials to the repo.

## Post-install verification

```bash
bash scripts/verify.sh
```

Expected output: all 6 checks green.

## Updating

See [UPGRADE.md](UPGRADE.md).

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
