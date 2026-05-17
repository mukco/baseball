#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""
ML_PID=""

cleanup() {
  local exit_code=$?

  trap - INT TERM EXIT

  for pid_var in FRONTEND_PID BACKEND_PID ML_PID; do
    local pid="${!pid_var}"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done

  for pid_var in FRONTEND_PID BACKEND_PID ML_PID; do
    local pid="${!pid_var}"
    [[ -n "${pid}" ]] && wait "${pid}" 2>/dev/null || true
  done

  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

# Kill any processes already bound to the ports we need
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
echo "Press Ctrl+C to stop all services."

wait -n "${BACKEND_PID}" "${ML_PID}" "${FRONTEND_PID}"
