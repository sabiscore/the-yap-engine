#!/usr/bin/env bash
# Yap Engine Enhanced Startup Automation
# Comprehensive health checks + intelligent retry + startup telemetry
#
# Usage:
#   ./scripts/startup-enhanced.sh [--check-only] [--verbose] [--timeout 300]
#
# Features:
#   - Health check for required services (Ollama, Python, Node.js)
#   - Intelligent port conflict detection and recovery
#   - Auto-seeding CORS origins for localhost development
#   - Graceful degradation (non-blocking health failures)
#   - Startup telemetry and timing metrics
#   - Support for custom timeout and verbosity

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
readonly SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" >/dev/null 2>&1 && pwd -P)"
readonly ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd -P)"

# [V6.2-FIX-03] Load repo-local persistent environment overrides before
# resolving startup defaults so values survive across shell sessions.
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
elif [[ -f "$ROOT_DIR/env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/env.local"
  set +a
fi

readonly STARTUP_LOG="${STARTUP_LOG:-${SWARM_HOME:-.swarmx}/logs/startup-enhanced.log}"
readonly DEFAULT_TIMEOUT=300  # seconds
OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
readonly CURL_MAX_TIME="${SWARMX_STARTUP_CURL_MAX_TIME:-8}"
readonly API_HOST="${SWARMX_API_HOST:-127.0.0.1}"
readonly API_PORT="${SWARMX_API_PORT:-3001}"
readonly DASHBOARD_PORT="3000"
readonly LEGACY_ROOT_HINT="/SwarmX-1.5"
readonly OLLAMA_AUTOSTART="${SWARMX_START_OLLAMA_IF_DOWN:-1}"

# ─── Flags ───────────────────────────────────────────────────────────────────
CHECK_ONLY=false
VERBOSE=false
TIMEOUT="${DEFAULT_TIMEOUT}"

# ─── Colors & Formatting ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'  # No Color

# ─── Logging ──────────────────────────────────────────────────────────────────
log() {
  local level="$1"
  shift
  local msg="$@"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] [${level}] ${msg}" >> "$STARTUP_LOG"
  if [[ "$VERBOSE" == true ]]; then
    echo -e "${BLUE}[${level}]${NC} ${msg}" >&2
  fi
}

log_success() {
  echo -e "${GREEN}✓${NC} $*" >&2
  log "INFO" "✓ $*"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $*" >&2
  log "WARN" "⚠ $*"
}

log_error() {
  echo -e "${RED}✗${NC} $*" >&2
  log "ERROR" "✗ $*"
}

log_info() {
  echo -e "${BLUE}ℹ${NC} $*" >&2
  log "INFO" "ℹ $*"
}

detect_available_mem_mb() {
  local avail_kb
  avail_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
  if [[ -z "$avail_kb" || "$avail_kb" == "0" ]]; then
    echo "0"
    return 0
  fi
  echo $((avail_kb / 1024))
}

detect_total_mem_mb() {
  local total_kb
  total_kb=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
  if [[ -z "$total_kb" || "$total_kb" == "0" ]]; then
    echo "0"
    return 0
  fi
  echo $((total_kb / 1024))
}

resolve_host_profile() {
  local requested="${SWARMX_HOST_PROFILE:-auto}"
  local normalized="${requested,,}"
  local total_mb
  total_mb=$(detect_total_mem_mb)

  case "$normalized" in
    ""|auto)
      if [[ "$total_mb" -ge 12288 ]]; then
        echo "standard_cpu_16gb"
      else
        echo "constrained_cpu_8gb"
      fi
      ;;
    8gb|8g|constrained|constrained_cpu|constrained_cpu_8gb)
      echo "constrained_cpu_8gb"
      ;;
    16gb|16g|standard|standard_cpu|standard_cpu_16gb)
      echo "standard_cpu_16gb"
      ;;
    accelerated|accelerated_optional)
      echo "accelerated_optional"
      ;;
    *)
      log_warning "Unknown SWARMX_HOST_PROFILE=$requested; falling back to auto detection"
      if [[ "$total_mb" -ge 12288 ]]; then
        echo "standard_cpu_16gb"
      else
        echo "constrained_cpu_8gb"
      fi
      ;;
  esac
}

probe_ollama_url() {
  local url="$1"
  curl -s --connect-timeout 2 --max-time 3 "$url/api/version" >/dev/null 2>&1
}

discover_working_ollama_url() {
  local candidates=(
    "$OLLAMA_URL"
    "${SWARMX_OLLAMA_URL:-}"
    "${SWARMX_OLLAMA_BASE_URL:-}"
    "http://127.0.0.1:11434"
    "http://localhost:11434"
  )
  local seen="|"

  for candidate in "${candidates[@]}"; do
    [[ -z "$candidate" ]] && continue
    if [[ "$seen" == *"|$candidate|"* ]]; then
      continue
    fi
    seen+="$candidate|"
    if probe_ollama_url "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

setup_ollama_runtime_tuning() {
  # [V6.2-ENH-03] Hardware-aware Ollama defaults with an auto-detected host profile.
  # 8 GB remains the safe baseline; 16 GB unlocks a warmer reuse profile unless
  # current free RAM is already low, in which case we fall back to constrained safeguards.
  local avail_mb
  avail_mb=$(detect_available_mem_mb)
  local total_mb
  total_mb=$(detect_total_mem_mb)
  local constrained=false
  local requested_profile
  requested_profile=$(resolve_host_profile)
  local effective_profile="$requested_profile"
  local inherited_max_models="${OLLAMA_MAX_LOADED_MODELS:-}"
  local inherited_num_parallel="${OLLAMA_NUM_PARALLEL:-}"
  local inherited_keep_alive="${OLLAMA_KEEP_ALIVE:-}"
  if [[ "$avail_mb" -gt 0 && "$avail_mb" -lt 2200 ]]; then
    constrained=true
    if [[ "$requested_profile" == "standard_cpu_16gb" ]]; then
      effective_profile="constrained_cpu_8gb"
    fi
  fi

  # flash_attention=1 + kv_cache_type=q8_0 causes llama.cpp segfaults with Q8 Phi-4
  # models (confirmed on i5-6300U / Ollama 0.22.0). Default to off; GPU operators
  # can override by exporting OLLAMA_FLASH_ATTENTION=1 before running this script.
  export OLLAMA_FLASH_ATTENTION="${OLLAMA_FLASH_ATTENTION:-0}"
  export OLLAMA_KV_CACHE_TYPE="${OLLAMA_KV_CACHE_TYPE:-f16}"
  # [V6.2-ENH-05] Leave 1 core for WSL2 hypervisor + OS; bare-metal Linux uses all cores.
  if grep -qi microsoft /proc/version 2>/dev/null; then
    export OLLAMA_NUM_THREADS="${OLLAMA_NUM_THREADS:-3}"
  else
    export OLLAMA_NUM_THREADS="${OLLAMA_NUM_THREADS:-4}"
  fi
  export SWARMX_HOST_PROFILE="$requested_profile"
  export SWARMX_EFFECTIVE_HOST_PROFILE="$effective_profile"

  if [[ "$effective_profile" == "standard_cpu_16gb" || "$effective_profile" == "accelerated_optional" ]]; then
    if [[ -n "$inherited_max_models" && "$inherited_max_models" != "2" ]]; then
      log_warning "Overriding OLLAMA_MAX_LOADED_MODELS=$inherited_max_models to 2 for the standard_cpu_16gb profile"
    fi
    if [[ -n "$inherited_num_parallel" && "$inherited_num_parallel" != "1" ]]; then
      log_warning "Overriding OLLAMA_NUM_PARALLEL=$inherited_num_parallel to 1 for the standard_cpu_16gb profile"
    fi
    if [[ -n "$inherited_keep_alive" && "$inherited_keep_alive" != "0" && "$inherited_keep_alive" != "0s" ]]; then
      log_warning "Overriding OLLAMA_KEEP_ALIVE=$inherited_keep_alive to 0 — request-level keep_alive policy (PILOT_S=300) stays authoritative"
    fi
    export OLLAMA_MAX_LOADED_MODELS="2"
    export OLLAMA_NUM_PARALLEL="1"
    export OLLAMA_KEEP_ALIVE="0"
    export OLLAMA_KEEP_ALIVE_PILOT_S="${OLLAMA_KEEP_ALIVE_PILOT_S:-300}"
    export SWARMX_MODEL_STARTUP_PREWARM="${SWARMX_MODEL_STARTUP_PREWARM:-1}"
    export SWARMX_MODEL_PREDICTIVE_PREWARM="${SWARMX_MODEL_PREDICTIVE_PREWARM:-1}"
  else
    if [[ "$requested_profile" == "standard_cpu_16gb" && "$constrained" == true ]]; then
      log_warning "Low available RAM detected (${avail_mb} MB). Temporarily falling back to constrained safeguards despite 16 GB host profile."
    fi
    if [[ -n "$inherited_max_models" && "$inherited_max_models" != "1" ]]; then
      log_warning "Overriding OLLAMA_MAX_LOADED_MODELS=$inherited_max_models to 1 for the constrained_cpu_8gb profile"
    fi
    if [[ -n "$inherited_num_parallel" && "$inherited_num_parallel" != "1" ]]; then
      log_warning "Overriding OLLAMA_NUM_PARALLEL=$inherited_num_parallel to 1 for the constrained_cpu_8gb profile"
    fi
    if [[ -n "$inherited_keep_alive" && "$inherited_keep_alive" != "0" && "$inherited_keep_alive" != "0s" ]]; then
      log_warning "Overriding OLLAMA_KEEP_ALIVE=$inherited_keep_alive to 0 so request-level lifecycle policy stays authoritative"
    fi
    export OLLAMA_MAX_LOADED_MODELS="1"
    export OLLAMA_NUM_PARALLEL="1"
    export OLLAMA_KEEP_ALIVE="0"
    export SWARMX_MODEL_STARTUP_PREWARM="${SWARMX_MODEL_STARTUP_PREWARM:-0}"
    export SWARMX_MODEL_PREDICTIVE_PREWARM="${SWARMX_MODEL_PREDICTIVE_PREWARM:-0}"
  fi

  if [[ "$constrained" == true ]]; then
    export SWARMX_COMPOSER_NUM_PREDICT="${SWARMX_COMPOSER_NUM_PREDICT:-96}"
    export SWARMX_COMPOSER_TIMEOUT_MS="${SWARMX_COMPOSER_TIMEOUT_MS:-150000}"
    export SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS="${SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS:-120000}"
    export SWARMX_OLLAMA_PROBE_TIMEOUT_MS="${SWARMX_OLLAMA_PROBE_TIMEOUT_MS:-5000}"
    log_warning "Low available RAM detected (${avail_mb} MB). Applying constrained Ollama/Composer defaults."
  else
    export SWARMX_COMPOSER_NUM_PREDICT="${SWARMX_COMPOSER_NUM_PREDICT:-256}"
    export SWARMX_COMPOSER_TIMEOUT_MS="${SWARMX_COMPOSER_TIMEOUT_MS:-60000}"
    export SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS="${SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS:-45000}"
  fi

  log_info "Ollama tuning: HOST_PROFILE=$SWARMX_HOST_PROFILE EFFECTIVE_PROFILE=$SWARMX_EFFECTIVE_HOST_PROFILE TOTAL_MB=$total_mb AVAILABLE_MB=$avail_mb FLASH_ATTENTION=$OLLAMA_FLASH_ATTENTION KV_CACHE=$OLLAMA_KV_CACHE_TYPE THREADS=$OLLAMA_NUM_THREADS PARALLEL=$OLLAMA_NUM_PARALLEL MAX_MODELS=$OLLAMA_MAX_LOADED_MODELS KEEP_ALIVE=$OLLAMA_KEEP_ALIVE PILOT_KEEP_ALIVE_S=${OLLAMA_KEEP_ALIVE_PILOT_S:-0} STARTUP_PREWARM=$SWARMX_MODEL_STARTUP_PREWARM PREDICTIVE_PREWARM=$SWARMX_MODEL_PREDICTIVE_PREWARM"
}

# ─── CPU Governor Check ──────────────────────────────��───────────────────────
# On bare-metal Linux (non-WSL2) the default governor is often "powersave",
# which runs at ~500 MHz instead of ~2.5 GHz — a 5× inference slowdown.
# This function checks the governor and tries to set "performance" if it's wrong.
# Non-fatal: logs a warning and continues if sudo access is unavailable.
check_cpu_governor() {
  # Skip on WSL2 — WSL2 CPU scaling is managed by the Windows hypervisor.
  if grep -qi microsoft /proc/version 2>/dev/null; then
    return 0
  fi
  local first_gov
  first_gov=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
  if [[ "$first_gov" == "performance" ]]; then
    log_success "CPU governor: performance (optimal for inference)"
    return 0
  fi
  log_warning "CPU governor is '$first_gov' — inference will run at reduced clock speed (~5× slower than 'performance')"
  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor >/dev/null 2>&1
      local new_gov
      new_gov=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
      if [[ "$new_gov" == "performance" ]]; then
        log_success "CPU governor set to performance"
      else
        log_warning "Failed to set CPU governor to performance — run: echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor"
      fi
    else
      log_warning "Cannot set CPU governor (no passwordless sudo). To fix: echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor"
    fi
  else
    log_warning "sudo not available — cannot set CPU governor"
  fi
}

# ─── Ensure yapengine-video-model Exists ───────────────────────────────────────
# yapengine-video-model is a derived Ollama model with a 21-token system prompt and
# n_batch=256 (vs the parent's 1239-token prompt and n_batch=32). It is NOT in git
# because Ollama models are local. This function re-creates it if missing.
ensure_video_model() {
  if ! command -v ollama >/dev/null 2>&1; then
    log_warning "ollama CLI not found — skipping yapengine-video-model check"
    return 0
  fi
  if ! probe_ollama_url "${OLLAMA_HOST:-http://localhost:11434}" 2>/dev/null; then
    log_warning "Ollama not reachable — skipping yapengine-video-model check"
    return 0
  fi
  if ollama list 2>/dev/null | grep -q "yapengine-video-model"; then
    log_success "yapengine-video-model: present"
    return 0
  fi
  log_info "yapengine-video-model not found — creating from instruct-phi4-lite-q4km-prod..."
  local tmp_modelfile
  tmp_modelfile=$(mktemp /tmp/swarmxq-video-XXXXXX.Modelfile)
  cat > "$tmp_modelfile" << 'MODELFILE'
FROM instruct-phi4-lite-q4km-prod
SYSTEM "You are a helpful assistant. Follow instructions precisely."
PARAMETER num_batch 256
PARAMETER num_ctx 3072
PARAMETER num_thread 4
PARAMETER temperature 0.1
PARAMETER num_predict 1024
MODELFILE
  if ollama create yapengine-video-model -f "$tmp_modelfile" >/dev/null 2>&1; then
    log_success "yapengine-video-model created successfully"
  else
    log_warning "Failed to create yapengine-video-model — video inference will fall back to instruct-phi4-lite-q4km-prod (slower due to 1239-token system prompt)"
  fi
  rm -f "$tmp_modelfile"
}

# ─── Helper: Port Availability Check ──────────────────────────────────────────
check_port_available() {
  local port="$1"
  local name="${2:-Service}"
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    return 1  # Port is in use
  fi
  return 0  # Port is available
}

wait_for_port_free() {
  local port="$1"
  local max_wait_s="${2:-6}"
  local elapsed=0
  while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
    if [[ $elapsed -ge $max_wait_s ]]; then
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 0
}

# ─── Helper: Kill Process on Port ────────────────────────────────────────────
kill_port() {
  local port="$1"
  local max_attempts=3
  local attempt=1
  
  log_info "Attempting to stop service on port $port..."
  
  while [ $attempt -le $max_attempts ]; do
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null | head -1)
    if [[ -z "$pid" ]]; then
      log_success "Port $port is now available"
      return 0
    fi
    
    if [ $attempt -eq 1 ]; then
      log_info "Sending SIGTERM to PID $pid..."
      kill -15 "$pid" 2>/dev/null || true
      wait_for_port_free "$port" 3 || true
    elif [ $attempt -eq 2 ]; then
      log_warning "SIGTERM timeout, sending SIGKILL to PID $pid..."
      kill -9 "$pid" 2>/dev/null || true
      wait_for_port_free "$port" 2 || true
    else
      log_error "Failed to free port $port after $max_attempts attempts"
      return 1
    fi
    
    attempt=$((attempt + 1))
  done
  
  return 1
}

# ─── Startup Hygiene: stale instance eviction ───────────────────────────────
evict_stale_instances() {
  log_info "Running startup hygiene (old-instance eviction)..."

  local patterns=(
    "python -m cli up"
    "swarm.sh up"
    "swarmx-api/dist/server.js"
    "@swarmx/dashboard"
    "next start --port 3000"
  )

  local evicted=0
  local current_pid="$$"
  local parent_pid="${PPID:-0}"

  for pattern in "${patterns[@]}"; do
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      [[ "$pid" == "$current_pid" ]] && continue
      [[ "$pid" == "$parent_pid" ]] && continue

      local cmd
      cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
      [[ -z "$cmd" ]] && continue

      # Only evict known SwarmX roots (current repo or legacy sibling root).
      if [[ "$cmd" != *"$ROOT_DIR"* && "$cmd" != *"$LEGACY_ROOT_HINT"* ]]; then
        continue
      fi

      log_warning "Evicting stale process PID=$pid ($cmd)"
      kill -15 "$pid" 2>/dev/null || true
      evicted=$((evicted + 1))
    done < <(pgrep -f "$pattern" 2>/dev/null || true)
  done

  # [V6.2-FIX-08] Give SIGTERM-ed processes a brief window to exit cleanly
  # before the second pass force-kills them. Without this wait, Node.js
  # children (e.g. Next.js, Fastify) may not flush open handles in time.
  if [[ $evicted -gt 0 ]]; then
    sleep 2
  fi

  # Force kill any lingering matched processes.
  for pattern in "${patterns[@]}"; do
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      [[ "$pid" == "$current_pid" ]] && continue
      [[ "$pid" == "$parent_pid" ]] && continue
      local cmd
      cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
      [[ -z "$cmd" ]] && continue
      if [[ "$cmd" != *"$ROOT_DIR"* && "$cmd" != *"$LEGACY_ROOT_HINT"* ]]; then
        continue
      fi
      log_warning "Force-evicting lingering process PID=$pid"
      # Only SIGKILL if process is still alive after the grace window.
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    done < <(pgrep -f "$pattern" 2>/dev/null || true)
  done

  if [[ $evicted -gt 0 ]]; then
    log_success "Startup hygiene evicted $evicted stale process(es)"
  else
    log_info "No stale Yap Engine instances detected"
  fi
}

# ─── Health Check: Ollama ─────────────────────────────────────────────────────
check_ollama() {
  log_info "Checking Ollama service at $OLLAMA_URL..."
  
  if ! command -v curl &> /dev/null; then
    log_warning "curl not found, skipping Ollama health check"
    return 0
  fi
  
  # [V6.1-FIX-17] Bound total request time to avoid hangs on half-open sockets.
  if probe_ollama_url "$OLLAMA_URL"; then
    log_success "Ollama is responding"
    return 0
  else
    log_warning "Ollama is not responding at $OLLAMA_URL"
    # [V6.2-FIX-11] Repo-local overrides can point at a stale port even while
    # the real daemon is healthy on a default local endpoint. Prefer failing
    # over to a live endpoint over autostarting a second daemon.
    local fallback_url
    fallback_url=$(discover_working_ollama_url || true)
    if [[ -n "$fallback_url" && "$fallback_url" != "$OLLAMA_URL" ]]; then
      log_warning "Configured Ollama endpoint is stale; failing over to $fallback_url"
      OLLAMA_URL="$fallback_url"
      export OLLAMA_HOST="$fallback_url"
      export SWARMX_OLLAMA_URL="$fallback_url"
      export SWARMX_OLLAMA_BASE_URL="$fallback_url"
      log_success "Ollama fallback endpoint is responding"
      return 0
    fi

    # [V6.2-FIX-27] Deadlock detection: if the probe failed but something IS
    # listening on the port, the daemon is deadlocked (accepted TCP but its
    # HTTP handler is blocked by a mid-load client disconnect). Kill it before
    # trying to start a fresh instance — otherwise `ollama serve` will fail to
    # bind and autostart silently does nothing.
    local ollama_port
    ollama_port=$(printf '%s' "$OLLAMA_URL" | grep -oP ':\K[0-9]+$' || echo "11434")
    [[ -z "$ollama_port" ]] && ollama_port="11434"
    local hung_pid
    hung_pid=$(lsof -Pi :"$ollama_port" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
    if [[ -n "$hung_pid" ]]; then
      log_warning "Ollama (PID=$hung_pid) is deadlocked on port $ollama_port — killing and restarting..."
      kill -9 "$hung_pid" 2>/dev/null || true
      sleep 1
    fi

    if [[ "$OLLAMA_AUTOSTART" == "1" ]] && command -v ollama >/dev/null 2>&1; then
      log_info "Attempting non-blocking Ollama autostart (best-effort)..."
      nohup ollama serve >> "$STARTUP_LOG" 2>&1 &
      disown || true
      # Give the daemon a moment to bind the port before probing.
      sleep 2
      if probe_ollama_url "$OLLAMA_URL"; then
        log_success "Ollama autostart succeeded"
      else
        log_warning "Ollama still unavailable after autostart attempt (startup continues in degraded mode)"
      fi
    else
      log_info "To start Ollama manually: ollama serve"
    fi
    return 0  # Non-blocking; continue with startup
  fi
}

# ─── Health Check: Python Environment ─────────────────────────────────────────
check_python() {
  log_info "Checking Python environment..."
  
  if ! command -v python3 &> /dev/null; then
    log_error "python3 not found"
    return 1
  fi
  
  local python_version
  python_version=$(python3 --version 2>&1 | awk '{print $2}')
  log_success "Python $python_version found"
  
  # Check for venv
  if [[ ! -d "$ROOT_DIR/.venv" ]]; then
    log_error "Virtual environment not found at $ROOT_DIR/.venv"
    log_info "Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    return 1
  fi
  
  log_success "Virtual environment found"
  return 0
}

# ─── Health Check: Node.js ───────────────────────────────────────────────────
check_nodejs() {
  log_info "Checking Node.js environment..."
  
  if ! command -v node &> /dev/null; then
    log_error "node not found"
    return 1
  fi
  
  local node_version
  node_version=$(node --version)
  log_success "Node.js $node_version found"
  
  if ! command -v pnpm &> /dev/null; then
    log_error "pnpm not found"
    log_info "Run: npm install -g pnpm"
    return 1
  fi
  
  log_success "pnpm is available"
  return 0
}

# ─── Health Check: Port Availability ──────────────────────────────────────────
check_ports() {
  log_info "Checking port availability..."
  
  local api_available=true
  local dashboard_available=true
  
  if ! check_port_available "$API_PORT" "API"; then
    log_warning "API port $API_PORT is already in use"
    api_available=false
  else
    log_success "API port $API_PORT is available"
  fi
  
  if ! check_port_available "$DASHBOARD_PORT" "Dashboard"; then
    log_warning "Dashboard port $DASHBOARD_PORT is already in use"
    dashboard_available=false
  else
    log_success "Dashboard port $DASHBOARD_PORT is available"
  fi
  
  # Try to recover by killing existing processes
  if [[ "$api_available" == false ]] || [[ "$dashboard_available" == false ]]; then
    log_warning "Attempting to free ports..."
    if [[ "$api_available" == false ]]; then
      kill_port "$API_PORT" || return 1
    fi
    if [[ "$dashboard_available" == false ]]; then
      kill_port "$DASHBOARD_PORT" || return 1
    fi
  fi
  
  return 0
}

# ─── Health Check: Directory Structure ────────────────────────────────────────
check_directories() {
  log_info "Checking required directories..."
  
  local required_dirs=(
    "$ROOT_DIR/apps/swarmx-api"
    "$ROOT_DIR/apps/swarmx-dashboard"
    "$ROOT_DIR/orchestration"
    "$ROOT_DIR/brain"
    "$ROOT_DIR/configs"
  )
  
  for dir in "${required_dirs[@]}"; do
    if [[ ! -d "$dir" ]]; then
      log_error "Required directory not found: $dir"
      return 1
    fi
  done
  
  log_success "All required directories found"
  return 0
}

# ─── Environment Setup ────────────────────────────────────────────────────────
setup_environment() {
  log_info "Setting up environment variables..."
  
  # Ensure SWARM_HOME exists
  local swarm_home="${SWARM_HOME:-.swarmx}"
  mkdir -p "$swarm_home/logs"
  
  # Auto-seed SWARMX_DASHBOARD_ORIGIN for local development if not set
  if [[ -z "${SWARMX_DASHBOARD_ORIGIN:-}" ]]; then
    export SWARMX_DASHBOARD_ORIGIN="http://127.0.0.1:3000,http://localhost:3000"
    log_success "Auto-seeded SWARMX_DASHBOARD_ORIGIN=$SWARMX_DASHBOARD_ORIGIN"
  else
    log_info "Using SWARMX_DASHBOARD_ORIGIN=$SWARMX_DASHBOARD_ORIGIN"
  fi
  
  # Ensure timezone is set (WAT for operator dashboard)
  if [[ -z "${TZ:-}" ]]; then
    export TZ="Africa/Lagos"
    log_info "Set timezone to $TZ for operator dashboard"
  fi
  
  # Set Node environment to development if not explicitly set
  if [[ -z "${NODE_ENV:-}" ]]; then
    export NODE_ENV="development"
    log_info "Set NODE_ENV to development"
  fi
}

# ─── Startup Banner ──────────────────────────────────────────────────────────
print_startup_banner() {
  cat >&2 << 'EOF'
╔════════════════════════════════════════════════════════════════════════════╗
║                         The Yap Engine Startup                               ║
║                    Enhanced Health Check & Automation                      ║
╚════════════════════════════════════════════════════════════════════════════╝
EOF
  
  echo >&2
  log_info "Startup timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  log_info "Root directory: $ROOT_DIR"
  log_info "Ollama URL: $OLLAMA_URL"
  log_info "API: http://$API_HOST:$API_PORT"
  log_info "Dashboard: http://127.0.0.1:$DASHBOARD_PORT"
  echo >&2
}

# ─── Startup Summary ──────────────────────────────────────────────────────────
print_startup_summary() {
  echo >&2
  cat >&2 << EOF
${GREEN}${BOLD}✓ Yap Engine Stack Ready${NC}

  ${BOLD}API Server:${NC}
    🚀 http://$API_HOST:$API_PORT
    📡 CORS Origins: $SWARMX_DASHBOARD_ORIGIN
    
  ${BOLD}Dashboard:${NC}
    🌐 http://127.0.0.1:$DASHBOARD_PORT
    🔌 Connected to API via proxy + fallback
    
  ${BOLD}LLM Backend:${NC}
    🤖 Ollama at $OLLAMA_URL
    📚 Models: instruct-phi4-pro-q8-prod, code-qwen25-pro-q5km-prod, reason-deepseekr1-pro-q5km-prod
    
  ${BOLD}Quick Commands:${NC}
    • View logs: tail -f ~/.swarmx/logs/swarmx-*.log
    • Health check: curl http://$API_HOST:$API_PORT/health
    • Stop services: pkill -f 'swarmx|next start|@swarmx/dashboard'

  ${BOLD}Troubleshooting:${NC}
    • CORS errors? Check: docs/CORS_CONFIGURATION.md
    • API timeout? Start Ollama: ollama serve
    • Logs: $STARTUP_LOG

${YELLOW}Note: Ctrl+C to stop services${NC}
EOF
}

# ─── Startup Verification ────────────────────────────────────────────────────
verify_startup() {
  log_info "Verifying startup..."
  
  local max_attempts=30
  local attempt=1
  local api_ready=false
  local dashboard_ready=false
  
  while [ $attempt -le $max_attempts ]; do
    # Check API health
    if [[ "$api_ready" == false ]]; then
      if curl -s --connect-timeout 2 --max-time 3 "http://$API_HOST:$API_PORT/health" >/dev/null 2>&1; then
        log_success "API is responding on port $API_PORT"
        api_ready=true
      fi
    fi
    
    # Check Dashboard health
    if [[ "$dashboard_ready" == false ]]; then
      if curl -s --connect-timeout 2 --max-time 3 "http://127.0.0.1:$DASHBOARD_PORT" >/dev/null 2>&1; then
        log_success "Dashboard is responding on port $DASHBOARD_PORT"
        dashboard_ready=true
      fi
    fi
    
    if [[ "$api_ready" == true ]] && [[ "$dashboard_ready" == true ]]; then
      log_success "All services are operational"
      return 0
    fi
    
    if [ $((attempt % 5)) -eq 0 ]; then
      log_info "Waiting for services... ($attempt/$max_attempts)"
    fi
    
    sleep 1
    attempt=$((attempt + 1))
  done
  
  log_warning "Services took longer than expected to become ready"
  log_info "Try accessing manually: http://127.0.0.1:$DASHBOARD_PORT"
  return 0  # Non-blocking; don't fail
}

# ─── Main Execution ──────────────────────────────────────────────────────────
main() {
  # Ensure log directory exists
  mkdir -p "$(dirname "$STARTUP_LOG")"
  
  # Print startup banner
  print_startup_banner
  
  log_info "Starting Yap Engine enhanced startup..."
  # [V6.2-ENH-03] Surface available RAM before launch so operators can
  # correlate pressure-adjusted defaults with system state.
  local _avail_mb_pre
  _avail_mb_pre=$(detect_available_mem_mb)
  log_info "System memory: ${_avail_mb_pre} MB available at startup"
  
  # Run health checks
  log_info "Running health checks..."
  check_directories || { log_error "Directory check failed"; exit 1; }
  evict_stale_instances
  check_cpu_governor  # Non-fatal: advisory only; sets governor if sudo is available
  check_python || { log_error "Python check failed"; exit 1; }
  check_nodejs || { log_error "Node.js check failed"; exit 1; }
  check_ports || { log_error "Port check failed"; exit 1; }
  check_ollama || true  # Non-blocking

  # Validate effective runtime env even in health-check mode so stale shell
  # exports cannot hide unsafe low-RAM settings.
  setup_environment
  setup_ollama_runtime_tuning

  # Ensure yapengine-video-model exists (21-token system prompt + n_batch=256).
  # Must run after Ollama is checked and after ollama runtime tuning is set.
  ensure_video_model

  # Write warmup status marker — API reads this via readWarmupStatus() in src/routes/system.ts
  # to serve a dynamic cold-start ETA to the dashboard instead of the hardcoded 140 s default.
  # Server.ts overwrites it with {"done":true,...} when Pilot prewarm completes.
  local _warmup_file="${SWARMX_WARMUP_STATUS_FILE:-/tmp/yapengine-warmup.json}"
  mkdir -p "$(dirname "$_warmup_file")" 2>/dev/null || true
  printf '{"done":false,"startedAt":"%s","coldStartEtaSecs":140}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$_warmup_file"
  log_info "Warmup status marker written: $_warmup_file"

  # If check-only flag, exit after health checks
  if [[ "$CHECK_ONLY" == true ]]; then
    log_success "Health checks passed"
    return 0
  fi
  
  # Full-pipeline RAM gate: only enforced on the 16 GB path. Low-RAM mode (8 GB
  # effective profile) intentionally runs below this threshold.
  if [[ "${SWARMX_EFFECTIVE_HOST_PROFILE:-}" == "16gb" && "${SWARMX_VIDEO_LOW_RAM_MODE:-0}" != "1" ]]; then
    local _avail_mb_gate
    _avail_mb_gate=$(detect_available_mem_mb)
    if [[ "$_avail_mb_gate" -gt 0 && "$_avail_mb_gate" -lt 6170 ]]; then
      log_error "Pre-launch RAM check FAILED: ${_avail_mb_gate} MB available (minimum 6170 MB for 16 GB profile)."
      log_error "Options: free RAM, set SWARMX_VIDEO_LOW_RAM_MODE=1, or set SWARMX_EFFECTIVE_HOST_PROFILE=8gb."
      exit 1
    fi
    log_info "Pre-launch RAM check passed: ${_avail_mb_gate} MB available (≥6170 MB required)"
  fi

  # Delegate to main startup script
  log_info "Delegating to swarm up command..."
  log_info "Startup log: $STARTUP_LOG"
  echo >&2

  cd "$ROOT_DIR"
  bash "$ROOT_DIR/swarm-up.sh" "${@:1}"
  
  # If we get here, startup succeeded
  verify_startup
  print_startup_summary
}

# ─── Argument Parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

main "$@"
