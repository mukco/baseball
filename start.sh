#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  local exit_code=$?

  trap - INT TERM EXIT

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID}" ]]; then
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID}" ]]; then
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi

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

echo "Starting Rails backend..."
(
  cd "${ROOT_DIR}/backend_rails"
  bundle exec rails server -p 8000
) &
BACKEND_PID=$!

echo "Starting frontend dev server..."
(
  cd "${ROOT_DIR}/frontend"
  npm run dev
) &
FRONTEND_PID=$!

echo "Backend PID: ${BACKEND_PID}"
echo "Frontend PID: ${FRONTEND_PID}"
echo "Press Ctrl+C to stop both services."

wait -n "${BACKEND_PID}" "${FRONTEND_PID}"
