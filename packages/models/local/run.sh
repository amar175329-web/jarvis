#!/usr/bin/env bash
set -euo pipefail

LOCAL_MODEL_HOST="127.0.0.1"
LOCAL_MODEL_PORT="${LOCAL_MODEL_PORT:-8080}"
LOCAL_MODEL_THREADS="${LOCAL_MODEL_THREADS:-2}"
LOCAL_MODEL_CTX="${LOCAL_MODEL_CTX:-2048}"
LOCAL_IDLE_MINUTES="${LOCAL_IDLE_MINUTES:-5}"
MIN_RAM_MB=800

PID_FILE="/tmp/jarvis_llama_server.pid"
LAST_REQ_FILE="/tmp/jarvis_llama_last_request"
WATCHDOG_PID_FILE="/tmp/jarvis_llama_watchdog.pid"
LOG_FILE="/tmp/jarvis_llama_server.log"

find_binary() {
  if command -v llama-server >/dev/null 2>&1; then
    command -v llama-server
  elif [ -x "/usr/local/bin/llama-server" ]; then
    echo "/usr/local/bin/llama-server"
  elif [ -x "/root/llama-bin/llama-server" ]; then
    echo "/root/llama-bin/llama-server"
  else
    return 1
  fi
}

find_model() {
  if [ -n "${LOCAL_MODEL_PATH:-}" ] && [ -f "$LOCAL_MODEL_PATH" ]; then
    echo "$LOCAL_MODEL_PATH"
  elif [ -f "$HOME/models/gemma-3-1b-it-Q4_K_M.gguf" ]; then
    echo "$HOME/models/gemma-3-1b-it-Q4_K_M.gguf"
  elif [ -f "$HOME/models/google_gemma-3-1b-it-Q4_K_M.gguf" ]; then
    echo "$HOME/models/google_gemma-3-1b-it-Q4_K_M.gguf"
  elif [ -f "/root/models/gemma-3-1b-it-Q4_K_M.gguf" ]; then
    echo "/root/models/gemma-3-1b-it-Q4_K_M.gguf"
  elif [ -f "/root/models/google_gemma-3-1b-it-Q4_K_M.gguf" ]; then
    echo "/root/models/google_gemma-3-1b-it-Q4_K_M.gguf"
  elif [ -f "$HOME/models/gemma-3-270m-it-Q4_K_M.gguf" ]; then
    echo "$HOME/models/gemma-3-270m-it-Q4_K_M.gguf"
  elif [ -f "$HOME/models/google_gemma-3-270m-it-Q4_K_M.gguf" ]; then
    echo "$HOME/models/google_gemma-3-270m-it-Q4_K_M.gguf"
  elif [ -f "/root/models/gemma-3-270m-it-Q4_K_M.gguf" ]; then
    echo "/root/models/gemma-3-270m-it-Q4_K_M.gguf"
  elif [ -f "/root/models/google_gemma-3-270m-it-Q4_K_M.gguf" ]; then
    echo "/root/models/google_gemma-3-270m-it-Q4_K_M.gguf"
  else
    return 1
  fi
}

get_available_ram_mb() {
  if [ -f /proc/meminfo ]; then
    awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo
  else
    free -m | awk '/^Mem:/{print $NF}'
  fi
}

is_server_alive() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      local auth_hdr=()
      if [ -n "${LOCAL_MODEL_TOKEN:-}" ]; then
        auth_hdr=(-H "Authorization: Bearer $LOCAL_MODEL_TOKEN")
      fi
      local status_code
      status_code=$(curl -s -o /dev/null -w "%{http_code}" -m 1 "${auth_hdr[@]}" "http://${LOCAL_MODEL_HOST}:${LOCAL_MODEL_PORT}/health" 2>/dev/null || echo "000")
      if [ "$status_code" = "200" ] || [ "$status_code" = "401" ]; then
        return 0
      fi
    fi
  fi
  return 1
}

start_watchdog() {
  if [ -f "$WATCHDOG_PID_FILE" ]; then
    local wpid
    wpid=$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$wpid" ] && kill -0 "$wpid" 2>/dev/null; then
      return 0
    fi
  fi
  (
    set +e
    if [ -n "${LOCAL_IDLE_SECONDS:-}" ]; then
      idle_limit_sec="$LOCAL_IDLE_SECONDS"
    else
      idle_limit_sec=$(( LOCAL_IDLE_MINUTES * 60 ))
    fi
    while true; do
      sleep 5
      if [ ! -f "$PID_FILE" ]; then
        break
      fi
      s_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
      if [ -z "$s_pid" ] || ! kill -0 "$s_pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        break
      fi
      now_time=$(date +%s)
      last_time=$(stat -c %Y "$LAST_REQ_FILE" 2>/dev/null || echo "$now_time")
      if [ "$last_time" -le 0 ]; then
        last_time=$now_time
      fi
      diff=$(( now_time - last_time ))
      if [ "$diff" -ge "$idle_limit_sec" ]; then
        kill "$s_pid" 2>/dev/null || true
        rm -f "$PID_FILE"
        break
      fi
    done
    rm -f "$WATCHDOG_PID_FILE"
  ) >/dev/null 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
  echo $! > "$WATCHDOG_PID_FILE"
}

start_server() {
  local avail_ram
  avail_ram=$(get_available_ram_mb)
  if [ "$avail_ram" -lt "$MIN_RAM_MB" ]; then
    echo "unavailable"
    return 1
  fi

  local bin
  bin=$(find_binary) || {
    echo "unavailable"
    return 1
  }

  local model
  model=$(find_model) || {
    echo "unavailable"
    return 1
  }

  local auth_args=()
  if [ -n "${LOCAL_MODEL_TOKEN:-}" ]; then
    auth_args=(--api-key "$LOCAL_MODEL_TOKEN")
  fi

  # Clean any stale pid
  rm -f "$PID_FILE"

  nohup "$bin" \
    --host "$LOCAL_MODEL_HOST" \
    --port "$LOCAL_MODEL_PORT" \
    -t "$LOCAL_MODEL_THREADS" \
    -c "$LOCAL_MODEL_CTX" \
    "${auth_args[@]}" \
    -m "$model" > "$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  echo "$pid" > "$PID_FILE"
  touch "$LAST_REQ_FILE"

  # Wait for health check (up to 15s)
  local ready=0
  local auth_hdr=()
  if [ -n "${LOCAL_MODEL_TOKEN:-}" ]; then
    auth_hdr=(-H "Authorization: Bearer $LOCAL_MODEL_TOKEN")
  fi

  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "unavailable"
      return 1
    fi
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 1 "${auth_hdr[@]}" "http://${LOCAL_MODEL_HOST}:${LOCAL_MODEL_PORT}/health" 2>/dev/null || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "401" ]; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if [ "$ready" -ne 1 ]; then
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "unavailable"
    return 1
  fi

  start_watchdog
  return 0
}

stop_server() {
  if [ -f "$WATCHDOG_PID_FILE" ]; then
    local wpid
    wpid=$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$wpid" ]; then
      kill "$wpid" 2>/dev/null || true
    fi
    rm -f "$WATCHDOG_PID_FILE"
  fi

  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

ensure_running() {
  if ! is_server_alive; then
    start_server
  else
    touch "$LAST_REQ_FILE"
    start_watchdog
  fi
}

status_server() {
  local avail_ram
  avail_ram=$(get_available_ram_mb)
  local bin_ok="false"
  find_binary >/dev/null 2>&1 && bin_ok="true"
  local model_ok="false"
  find_model >/dev/null 2>&1 && model_ok="true"
  local running="false"
  is_server_alive && running="true"
  local ok="false"
  if [ "$bin_ok" = "true" ] && [ "$model_ok" = "true" ] && [ "$avail_ram" -ge "$MIN_RAM_MB" ]; then
    ok="true"
  fi
  cat <<EOF
{"ok":$ok,"running":$running,"binary":$bin_ok,"model":$model_ok,"free_ram_mb":$avail_ram}
EOF
}

handle_request() {
  touch "$LAST_REQ_FILE"

  if ! ensure_running; then
    exit 1
  fi

  local auth_hdr=()
  if [ -n "${LOCAL_MODEL_TOKEN:-}" ]; then
    auth_hdr=(-H "Authorization: Bearer $LOCAL_MODEL_TOKEN")
  fi

  local payload=""
  if [ $# -ge 1 ]; then
    payload="$1"
  else
    payload=$(cat)
  fi

  if [[ "$payload" =~ ^\{ ]]; then
    curl -s -X POST "http://${LOCAL_MODEL_HOST}:${LOCAL_MODEL_PORT}/v1/chat/completions" \
      -H "Content-Type: application/json" \
      "${auth_hdr[@]}" \
      -d "$payload"
  else
    local escaped_prompt
    escaped_prompt=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    curl -s -X POST "http://${LOCAL_MODEL_HOST}:${LOCAL_MODEL_PORT}/v1/chat/completions" \
      -H "Content-Type: application/json" \
      "${auth_hdr[@]}" \
      -d "{\"messages\":[{\"role\":\"user\",\"content\":$escaped_prompt}],\"max_tokens\":512}"
  fi
}

cmd="${1:-request}"
case "$cmd" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  status)
    status_server
    ;;
  ensure)
    ensure_running
    ;;
  request|invoke)
    shift
    handle_request "$@"
    ;;
  *)
    handle_request "$@"
    ;;
esac
