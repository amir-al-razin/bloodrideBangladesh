#!/usr/bin/env bash
# Runs BloodRide on Linux or macOS with one command:  ./run.sh
#   ./run.sh          fresh database with sample data, then API + website
#   ./run.sh --keep   keep the data from the last run
# Needs: Docker (for the database), Python 3.12+ with uv or venv, Node 20+.
# Open http://localhost:3000 . Ctrl+C stops the API and website; the database container keeps running
# (stop it with: docker stop bloodride-db).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
KEEP=${1:-}
export PGHOST=localhost PGPORT=5433 PGUSER=postgres

echo "== Database (PostGIS in Docker, port 5433)"
if ! docker ps -a --format '{{.Names}}' | grep -qx bloodride-db; then
  docker run -d --name bloodride-db -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgis/postgis:16-3.4 >/dev/null
fi
docker start bloodride-db >/dev/null
for _ in $(seq 1 30); do pg_isready -q -d postgres && break; sleep 1; done
if [ "$KEEP" != "--keep" ] || ! psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='bloodride'" | grep -q 1; then
  echo "fresh database with sample data"
  psql -d postgres -qc "DROP DATABASE IF EXISTS bloodride WITH (FORCE)" -c "CREATE DATABASE bloodride"
  psql -d bloodride -q -v ON_ERROR_STOP=1 -f "$ROOT/db/build.sql" | tail -1
  rm -rf "$ROOT/backend/uploads"
fi

echo "== Backend (FastAPI, port 8000)"
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null; then uv venv -q .venv && uv pip install -q --python .venv/bin/python -r requirements.txt
  else python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; fi
fi
[ -f .env ] || cp .env.example .env
.venv/bin/python run.py & API=$!

echo "== Website (Next.js, port 3000)"
cd "$ROOT/frontend"
[ -d node_modules ] || npm install --silent
npm run dev & WEB=$!

trap 'kill $API $WEB 2>/dev/null' EXIT INT TERM
echo
echo "Open http://localhost:3000   (demo password for all sample accounts: bloodride123)"
wait
