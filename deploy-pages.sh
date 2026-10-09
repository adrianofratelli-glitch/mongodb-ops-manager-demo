#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Deploy do frontend (modo MOCK, estático) para o GitHub Pages.
# Build sem backend — dados embutidos no cliente (src/api/mock.js).
# Publica em https://adrianofratelli-glitch.github.io/mongodb-ops-manager-demo/
#
# Sem force-push: o build entra como um commit novo em cima de origin/gh-pages
# (worktree temporária) e sobe com push normal. A mensagem registra o commit
# da main que gerou o build, para conferir que o Pages reflete a main.
# ───────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="/mongodb-ops-manager-demo/"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
VERSION="$(node -p "require('$ROOT/frontend/package.json').version")"

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "Erro: árvore com mudanças não commitadas; o deploy precisa vir de um commit." >&2
  exit 1
fi

cd "$ROOT/frontend"
echo "Build estático (mock + base ${BASE}) de ${SHA}..."
VITE_USE_MOCK=1 VITE_BASE="$BASE" npm run build

WT="$(mktemp -d)"
cleanup() { git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; }
trap cleanup EXIT
git -C "$ROOT" fetch -q origin gh-pages
git -C "$ROOT" worktree add -q --detach "$WT" origin/gh-pages

rsync -a --delete --exclude .git "$ROOT/frontend/dist/" "$WT/"
touch "$WT/.nojekyll"
cd "$WT"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages já está igual ao build de ${SHA}; nada a publicar."
else
  git commit -q -m "deploy: pages ${VERSION} (main ${SHA}, mock estático)"
  git push -q origin HEAD:gh-pages
  echo "Publicado ${VERSION} (main ${SHA}). Pode levar ~1 min para propagar."
fi
echo "   https://adrianofratelli-glitch.github.io/mongodb-ops-manager-demo/"
