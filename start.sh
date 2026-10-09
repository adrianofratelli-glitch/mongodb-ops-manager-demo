#!/usr/bin/env bash
set -uo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8077
FRONTEND_PORT=5377
BACKEND_LOG="${TMPDIR:-/tmp}/ops-manager-demo-backend.log"
FRONTEND_LOG="${TMPDIR:-/tmp}/ops-manager-demo-frontend.log"

fail() {
  echo "Erro: $1" >&2
  exit 1
}

cleanup() {
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-45}"
  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

command -v curl >/dev/null || fail "curl não encontrado."
command -v npm >/dev/null || fail "npm não encontrado."
[[ -x "$BASE/backend/.venv/bin/python" ]] || fail "Virtualenv ausente. Execute python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt."
[[ -d "$BASE/frontend/node_modules" ]] || fail "Dependências frontend ausentes. Execute npm install em frontend/."

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Porta $port já está ocupada; o processo existente foi preservado."
  fi
done

trap cleanup EXIT INT TERM

echo "Ops Manager · iniciando backend em :$BACKEND_PORT"
(
  cd "$BASE/backend"
  exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

if ! wait_for_url "http://127.0.0.1:$BACKEND_PORT/health/live" 30; then
  tail -n 30 "$BACKEND_LOG" >&2
  fail "Backend não ficou pronto; veja $BACKEND_LOG."
fi

cd "$BASE/frontend"
if [[ "${POV_DEV:-0}" != "1" ]] && {
  [[ ! -f dist/index.html ]] ||
  grep -q "/mongodb-ops-manager-demo/" dist/index.html ||
  [[ -n "$(find src -type f -newer dist/index.html -print -quit)" ]] ||
  [[ index.html -nt dist/index.html ]] ||
  [[ package-lock.json -nt dist/index.html ]] ||
  [[ package.json -nt dist/index.html ]] ||
  [[ vite.config.js -nt dist/index.html ]];
}; then
  echo "Ops Manager · gerando frontend otimizado"
  npm run build >"$FRONTEND_LOG" 2>&1 || {
    tail -n 30 "$FRONTEND_LOG" >&2
    fail "Build do frontend falhou; veja $FRONTEND_LOG."
  }
fi

if [[ "${POV_DEV:-0}" == "1" ]]; then
  FRONTEND_CMD=(node_modules/.bin/vite --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort)
else
  FRONTEND_CMD=(node_modules/.bin/vite preview --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort)
fi
"${FRONTEND_CMD[@]}" >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

if ! wait_for_url "http://127.0.0.1:$FRONTEND_PORT" 30; then
  tail -n 30 "$FRONTEND_LOG" >&2
  fail "Frontend não ficou pronto; veja $FRONTEND_LOG."
fi

echo "Ops Manager pronta: http://127.0.0.1:$FRONTEND_PORT"
if [[ "${POV_NO_OPEN:-0}" != "1" ]]; then
  command -v open >/dev/null && open "http://127.0.0.1:$FRONTEND_PORT"
fi

wait "$BACKEND_PID" "$FRONTEND_PID"
