#!/bin/sh
set -e

cd /app/backend
# One worker only: the whole demo state (clusters, upgrades, restores) is an
# in-process dict guarded by STATE_LOCK. Two workers would split it.
uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 &
nginx -g 'daemon off;'
