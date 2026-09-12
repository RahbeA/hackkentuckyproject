#!/usr/bin/env bash
# RouteWise local development orchestrator.
# Requires Git Bash or WSL on Windows.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

NO_MOBILE=0
SKIP_INSTALL=0
RESET_DEMO=0

usage() {
  cat <<'EOF'
Usage: ./rundev.sh [options]

  --no-mobile      Do not start Expo
  --skip-install   Skip pip/npm installs
  --reset-demo     Delete and reseed Jefferson Demo data (interactive confirm)
  --help           Show this help

Starts PostgreSQL and Redis via Docker Compose, then Django, Celery, Vite,
and Expo from their own folders.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-mobile) NO_MOBILE=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --reset-demo) RESET_DEMO=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    case "$1" in
      docker) echo "Install Docker Desktop: https://docs.docker.com/get-docker/" ;;
      python|python3) echo "Install Python 3.12+: https://www.python.org/downloads/" ;;
      node) echo "Install Node.js 20+: https://nodejs.org/" ;;
      npm) echo "Install Node.js (includes npm): https://nodejs.org/" ;;
    esac
    exit 1
  fi
}

PYTHON=""
if command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
  PYTHON="python3"
elif command -v py >/dev/null 2>&1; then
  PYTHON="py"
elif command -v python >/dev/null 2>&1; then
  PYTHON="python"
fi
if [[ -z "$PYTHON" ]]; then
  echo "Missing required command: python"
  echo "Install Python 3.12+: https://www.python.org/downloads/"
  echo "On Windows, the 'py' launcher is also supported."
  exit 1
fi
need node
need npm

py_run() {
  if [[ "$PYTHON" == "py" ]]; then
    py -3 "$@"
  else
    "$PYTHON" "$@"
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    py_run - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket()
s.settimeout(0.4)
try:
    s.connect(("127.0.0.1", port))
except Exception:
    sys.exit(1)
sys.exit(0)
PY
  fi
}

USE_DOCKER=1
if ! command -v docker >/dev/null 2>&1; then
  if port_in_use 5432 && port_in_use 6379; then
    USE_DOCKER=0
    echo "Docker not found — using existing Postgres/Redis on localhost."
  else
    echo "Missing required command: docker"
    echo "Install Docker Desktop: https://docs.docker.com/get-docker/"
    echo "Or start local Postgres (5432) and Redis (6379) and re-run."
    exit 1
  fi
fi

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created .env from .env.example"
fi

# shellcheck disable=SC1091
set -a
source "$ROOT/.env"
set +a

for p in 5432 6379 8000 5173; do
  if port_in_use "$p"; then
    if [[ "$p" == "5432" || "$p" == "6379" ]]; then
      echo "Port $p already in use — assuming existing Postgres/Redis is fine."
    else
      echo "Warning: port $p is already in use. The matching service may fail to bind."
    fi
  fi
done

if [[ "$USE_DOCKER" -eq 1 ]]; then
  echo "==> Starting PostgreSQL and Redis (Docker)"
  docker compose -f "$ROOT/infrastructure/docker-compose.yml" --env-file "$ROOT/.env" up -d
else
  echo "==> Using local PostgreSQL and Redis"
fi

bash "$ROOT/scripts/wait_for_postgres.sh" localhost "${POSTGRES_PORT:-5432}" "${POSTGRES_USER:-routewise}" "${POSTGRES_DB:-routewise}"
bash "$ROOT/scripts/wait_for_redis.sh"

VENV="$ROOT/backend/.venv"
if [[ ! -x "$VENV/bin/python" && ! -x "$VENV/Scripts/python.exe" ]]; then
  echo "==> Creating Python virtualenv"
  py_run -m venv "$VENV"
fi
if [[ -x "$VENV/Scripts/python.exe" ]]; then
  PY="$VENV/Scripts/python.exe"
  PIP="$VENV/Scripts/pip.exe"
else
  PY="$VENV/bin/python"
  PIP="$VENV/bin/pip"
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "==> Installing backend dependencies"
  "$PIP" install -q -r "$ROOT/backend/requirements.txt"
fi

export DJANGO_SETTINGS_MODULE=config.settings.development
cd "$ROOT/backend"
"$PY" manage.py migrate --noinput

if [[ "$RESET_DEMO" -eq 1 ]]; then
  echo "This will delete Jefferson Demo Schools data only, not the whole database."
  read -r -p "Type RESET-DEMO to continue: " confirm
  if [[ "$confirm" != "RESET-DEMO" ]]; then
    echo "Aborted."
    exit 1
  fi
  "$PY" manage.py seed_demo --reset-demo
else
  "$PY" manage.py seed_demo --skip-if-exists
fi

if [[ ! -f "$ROOT/model_artifacts/p50_travel.joblib" ]]; then
  echo "==> Generating and training synthetic ML models"
  "$PY" manage.py generate_synthetic_ml_data
  "$PY" manage.py train_travel_models
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "==> Installing web dependencies"
  (cd "$ROOT/web" && npm install)
  if [[ "$NO_MOBILE" -eq 0 ]]; then
    echo "==> Installing mobile dependencies"
    (cd "$ROOT/mobile" && npm install)
  fi
fi

mkdir -p "$ROOT/logs"
PIDS=()

cleanup() {
  echo ""
  echo "==> Stopping RouteWise services"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

prefix() {
  local name="$1"
  while IFS= read -r line; do
    printf "[%s] %s\n" "$name" "$line"
  done
}

echo "==> Starting Django"
cd "$ROOT/backend"
"$PY" -m daphne -b 0.0.0.0 -p 8000 config.asgi:application \
  > >(prefix django) 2>&1 &
PIDS+=($!)

echo "==> Starting Celery"
"$PY" -m celery -A config worker -l info --pool=solo \
  > >(prefix celery) 2>&1 &
PIDS+=($!)

echo "==> Starting Vite"
cd "$ROOT/web"
VITE_API_URL="${VITE_API_URL:-http://localhost:8000/api/v1}" \
VITE_WS_URL="${VITE_WS_URL:-ws://localhost:8000/ws}" \
VITE_DEMO_MODE="${VITE_DEMO_MODE:-true}" \
  npm run dev -- --host \
  > >(prefix vite) 2>&1 &
PIDS+=($!)

if [[ "$NO_MOBILE" -eq 0 ]]; then
  echo "==> Starting Expo"
  cd "$ROOT/mobile"
  EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:8000/api/v1}" \
  EXPO_PUBLIC_WS_URL="${EXPO_PUBLIC_WS_URL:-ws://localhost:8000/ws}" \
  EXPO_PUBLIC_DEMO_MODE="${EXPO_PUBLIC_DEMO_MODE:-true}" \
    npx expo start \
    > >(prefix expo) 2>&1 &
  PIDS+=($!)
fi

LAN_IP="$(py_run - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80))
    print(s.getsockname()[0])
except Exception:
    print("YOUR_LAN_IP")
finally:
    s.close()
PY
)"

cat <<EOF

RouteWise is running.

  Web UI:     http://localhost:5173
  API:        http://localhost:8000/api/v1/
  OpenAPI:    http://localhost:8000/api/docs/
  Health:     http://localhost:8000/health/

Demo accounts (password: ${DEMO_PASSWORD:-DemoPass123!})
  ${DEMO_PLATFORM_EMAIL:-platform@routewise.demo}     platform admin
  ${DEMO_DISTRICT_ADMIN_EMAIL:-admin@jefferson.demo}  district admin
  ${DEMO_PLANNER_EMAIL:-planner@jefferson.demo}       planner
  ${DEMO_DISPATCHER_EMAIL:-dispatcher@jefferson.demo} dispatcher
  ${DEMO_DRIVER_EMAIL:-driver@jefferson.demo}         driver
  ${DEMO_GUARDIAN_EMAIL:-guardian@jefferson.demo}     guardian

Physical phone: Expo Go cannot use localhost. Set EXPO_PUBLIC_API_URL to
http://${LAN_IP}:8000/api/v1 in .env, ensure the phone is on the same Wi-Fi,
and allow port 8000 through the firewall.

Proof of concept only — not a production student transportation system.
Ctrl+C stops Django, Celery, Vite, and Expo. Docker Postgres/Redis stay up.

EOF

wait
