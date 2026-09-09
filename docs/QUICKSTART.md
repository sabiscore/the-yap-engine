# The Yap Engine — Quick Start

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)

Get from zero to a working video generation stack in under five minutes.

---

## Prerequisites

| Requirement | Verified version | Notes |
|---|---|---|
| Node.js | **v24.17.0** (min v22) | nodejs.org |
| pnpm | **11.9.0** | `npm install -g pnpm@11.9.0` |
| Python | **3.14.6** (min 3.11) | python.org |
| Ollama | latest | ollama.com/install.sh |
| Redis | 7.x | Optional — only needed when `SWARMX_VIDEO_USE_BULLMQ=1` |

> **Known environment blockers on this host (document only — no code changes needed):**
> - **FFmpeg not in Windows PATH** — install via `sudo apt install ffmpeg` in WSL2 for local video renders.
> - **`faster-whisper` not installed** — word-level caption alignment is disabled; video pipeline still runs.
> - **Modal credentials not provisioned** — cloud GPU render backend disabled; pipeline falls back to local FFmpeg.

---

## 1 — Clone and install

```bash
git clone <repo-url> the-yap-engine
cd the-yap-engine

# Python side
python -m venv .venv
source .venv/bin/activate    # Linux / WSL2
python -m pip install --editable '.[dev]'

# Node side
pnpm install --frozen-lockfile
```

---

## 2 — Configure environment

```bash
cp env.example .env.local
# Edit .env.local: set SWARMX_VIDEO_API_TOKEN and OLLAMA_HOST at minimum
```

Key variables for a local dev start:

```bash
SWARMX_HOST_PROFILE=auto          # auto-detects constrained_cpu_8gb / standard_cpu_16gb
OLLAMA_HOST=http://127.0.0.1:11434
SWARMX_VIDEO_API_TOKEN=your-token-here
```

For a full reference see [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md).

---

## 3 — Start the stack

```bash
bash scripts/startup-enhanced.sh --dashboard
```

What this does automatically:
- Checks Python, Node.js, pnpm are available
- Kills stale port 3000 and 3001 processes
- Starts Fastify API on `http://127.0.0.1:3001`
- Starts Next.js dashboard on `http://127.0.0.1:3000`
- Auto-detects host RAM profile (`constrained_cpu_8gb` vs `standard_cpu_16gb`)
- Sets `OLLAMA_MAX_LOADED_MODELS=2` on the 16 GB profile, `1` on 8 GB

Check health:

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/system/health | python3 -m json.tool
```

---

## 4 — Open the dashboard

Open **http://localhost:3000** in your browser.

- `/video` — submit a video job, view job list and status
- `/system` — RAM pressure, Ollama status, model fleet
- `/composer` — AI chat with the swarm

---

## 5 — Generate your first Yap

From the `/video` page, select a template family, fill in a creative brief, and click **Generate**.

### 10 Creative Templates
Choose from 10 production-tested template structures:
- `myth-vs-fact`: Direct debunking (myth → reality → why it persisted)
- `list/countdown`: Rapid-fire high-retention list (accepts legacy `listicle-countdown`)
- `mystery/reveal`: Narrative puzzle with clues leading to payoff
- `product-demo`: Visceral pain point to practical solution
- `quote-to-insight`: Powerful quote breakdown and personal application
- `chart/data`: Single striking data point and implications
- `motivational`: Micro-narrative defeat → grind → triumph
- `series-recap`: Fast-paced catch-up cliffhanger setup
- `pov-immersion`: First-person direct sensory immersion
- `reddit-story`: Found-story readaloud with escalating beats

The canonical pipeline executes:

```
intent_classification → planning → scripting → storyboard_generation → render_assembly → finalizing
```

Post-pipeline (non-blocking): `stageViralityAndCaption()`

Expected duration on this CPU-only host: **3–8 minutes** per video.

---

## 6 — Run tests

```bash
# TypeScript type check
pnpm -F @swarmx/types typecheck
pnpm -F @swarmx/api typecheck
pnpm -F @swarmx/dashboard typecheck
# (or from root: pnpm typecheck)

# Unit tests
pnpm -F @swarmx/api test              # 377 passing (26 test files)
pnpm -F @swarmx/dashboard test        # 69 passing (9 test files)
# (or from root: pnpm test)

# Video regression assertions
pnpm -F @swarmx/api run test:video

# Python
source .venv/bin/activate
python -m pytest
```

---

## 7 — Stop the stack

Press `Ctrl-C` in the terminal running `startup-enhanced.sh`, or kill stale processes:

```bash
pkill -f "swarmx-api/dist"
pkill -f "next start"
```

---

## Next steps

- [STARTUP_GUIDE.md](STARTUP_GUIDE.md) — detailed startup options, cold-start tuning, persistent `.env.local`
- [INSTALL.md](INSTALL.md) — model installation, Modelfile setup, Redis
- [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) — full environment variable reference
- [VIDEO-GENERATION.md](VIDEO-GENERATION.md) — video pipeline API contract and template taxonomy
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — `swarm doctor`, common errors, debug flags