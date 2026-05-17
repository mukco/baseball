#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""
ML_PID=""
TUNNEL_PID=""

ENV_FILE="${ROOT_DIR}/backend_rails/.env"
TOKENS_FILE="${ROOT_DIR}/backend_rails/tmp/yahoo_tokens.json"

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT

  for pid_var in FRONTEND_PID BACKEND_PID ML_PID TUNNEL_PID; do
    local pid="${!pid_var}"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done

  for pid_var in FRONTEND_PID BACKEND_PID ML_PID TUNNEL_PID; do
    local pid="${!pid_var}"
    [[ -n "${pid}" ]] && wait "${pid}" 2>/dev/null || true
  done

  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"${port}" 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "Killing existing process(es) on port ${port}: ${pids}"
    echo "${pids}" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

# ── Yahoo Fantasy setup ────────────────────────────────────────────────────────

setup_yahoo() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Yahoo Fantasy — one-time setup"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  echo ""
  echo "  Starting HTTPS tunnel for OAuth callback..."

  local tunnel_log
  tunnel_log=$(mktemp)

  npx --yes localtunnel --port 8000 > "${tunnel_log}" 2>&1 &
  TUNNEL_PID=$!

  local tunnel_url=""
  for _ in $(seq 1 15); do
    tunnel_url=$(grep -o 'https://[^ ]*\.loca\.lt' "${tunnel_log}" 2>/dev/null | head -1 || true)
    [[ -n "${tunnel_url}" ]] && break
    sleep 1
  done
  rm -f "${tunnel_log}"

  if [[ -z "${tunnel_url}" ]]; then
    echo ""
    echo "  Warning: could not start localtunnel automatically."
    echo "  Run this manually in another terminal:"
    echo "    npx localtunnel --port 8000"
    echo ""
    return 0
  fi

  local redirect_uri="${tunnel_url}/api/yahoo/callback"

  if grep -q "^YAHOO_REDIRECT_URI=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^YAHOO_REDIRECT_URI=.*|YAHOO_REDIRECT_URI=${redirect_uri}|" "${ENV_FILE}"
  else
    printf '\nYAHOO_REDIRECT_URI=%s\n' "${redirect_uri}" >> "${ENV_FILE}"
  fi

  # Check if credentials are present
  local has_id has_secret
  has_id=$(grep -c "^YAHOO_CLIENT_ID=.\+" "${ENV_FILE}" 2>/dev/null || echo "0")
  has_secret=$(grep -c "^YAHOO_CLIENT_SECRET=.\+" "${ENV_FILE}" 2>/dev/null || echo "0")

  if [[ "${has_id}" == "0" ]] || [[ "${has_secret}" == "0" ]]; then
    echo ""
    echo "  Yahoo credentials not found in backend_rails/.env."
    echo ""
    echo "  Steps to get them:"
    echo ""
    echo "  1. Go to https://developer.yahoo.com/apps/"
    echo "  2. Click 'Create App' and fill in:"
    echo "       Name:        anything (e.g. Statline)"
    echo "       Description: anything"
    echo "       Client Type: Confidential Client"
    echo "       Permissions: Fantasy Sports → Read"
    echo ""
    echo "  3. Copy Client ID (Consumer Key) and Client Secret (Consumer Secret)"
    echo "     from the app page and add them to backend_rails/.env:"
    echo ""
    echo "       YAHOO_REDIRECT_URI=${redirect_uri}"
    echo "       YAHOO_CLIENT_ID=<Consumer Key>"
    echo "       YAHOO_CLIENT_SECRET=<Consumer Secret>"
    echo "       YAHOO_LEAGUE_ID=<number from your league URL>"
    echo "          e.g. baseball.fantasysports.yahoo.com/b1/211665 → 211665"
    echo ""
    echo "  Use the redirect URI above in the Yahoo app settings, then re-run ./start.sh."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    return 0
  fi

  echo ""
  echo "┌─────────────────────────────────────────────────────────────┐"
  echo "│  Yahoo OAuth is ready                                       │"
  echo "│                                                             │"
  echo "│  Redirect URI (set this in your Yahoo app):                │"
  echo "│  ${redirect_uri}"
  echo "│                                                             │"
  echo "│  Yahoo Developer app settings:                             │"
  echo "│    developer.yahoo.com/apps → your app → Redirect URI(s)  │"
  echo "│                                                             │"
  echo "│  Once updated, go to /fantasy in the app and click         │"
  echo "│  'Connect Yahoo Fantasy'. This is a one-time step —        │"
  echo "│  tokens are saved and the tunnel won't be needed again.    │"
  echo "└─────────────────────────────────────────────────────────────┘"
  echo ""
}

if [[ ! -f "${TOKENS_FILE}" ]]; then
  setup_yahoo
fi

# ── Dependencies ───────────────────────────────────────────────────────────────

kill_port 8000
kill_port 8002
kill_port 5173

echo "Checking backend gems..."
(
  cd "${ROOT_DIR}/backend_rails"
  bundle check >/dev/null 2>&1 || bundle install
)

echo "Checking frontend packages..."
(
  cd "${ROOT_DIR}/frontend"
  if [[ -d node_modules ]]; then
    npm install --no-audit --no-fund
  else
    npm ci --no-audit --no-fund
  fi
)

echo "Checking ML service dependencies..."
(
  cd "${ROOT_DIR}/ml_service"
  if ! python -c "import fastapi, uvicorn, sklearn, torch, duckdb, pandas" 2>/dev/null; then
    echo "Installing ML service Python packages..."
    pip install -r requirements.txt --quiet
  fi
)

# ── Start services ─────────────────────────────────────────────────────────────

echo "Starting Rails backend..."
(
  cd "${ROOT_DIR}/backend_rails"
  bundle exec rails server -p 8000
) &
BACKEND_PID=$!

echo "Starting ML service..."
(
  cd "${ROOT_DIR}/ml_service"
  python main.py
) &
ML_PID=$!

echo "Starting frontend dev server..."
(
  cd "${ROOT_DIR}/frontend"
  npm run dev
) &
FRONTEND_PID=$!

echo "Backend PID:  ${BACKEND_PID}"
echo "ML PID:       ${ML_PID}"
echo "Frontend PID: ${FRONTEND_PID}"
[[ -n "${TUNNEL_PID}" ]] && echo "Tunnel PID:   ${TUNNEL_PID}"
echo "Press Ctrl+C to stop all services."

wait -n "${BACKEND_PID}" "${ML_PID}" "${FRONTEND_PID}"
