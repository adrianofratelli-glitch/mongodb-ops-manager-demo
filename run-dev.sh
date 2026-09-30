#!/usr/bin/env bash
set -e

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export POV_DEV="${POV_DEV:-1}"
exec bash "$BASE/start.sh" "$@"
