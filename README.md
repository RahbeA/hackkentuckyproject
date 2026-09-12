# DART (District Automated Routing & Tracking)

Hackathon judges: open the web app → **Start guided demo** → **Start walkthrough**. Jefferson Demo Schools is already seeded. Follow the blue coach (about 6 minutes). Password for every demo account is `DemoPass123!`. Full script: [docs/demo.md](docs/demo.md).

---

DART is a **proof-of-concept** multi-tenant school transportation platform. Districts can import fictional transportation records, generate bus routes with OR-Tools, compare fastest vs reliability plans, stress-test mornings with a Monte Carlo digital twin, watch simulated GPS, and show families a private ETA.

**This is not a production-ready student transportation system.** It is not certified for school-bus navigation, student privacy compliance (FERPA/COPPA), or operational dispatch. Demo students, GPS, and ML labels are synthetic.

## Architecture

Independent applications share one Django API:

- `web/` — Vite + React + TypeScript
- `mobile/` — Expo + Expo Router (driver + guardian)
- `backend/` — Django 5 + DRF `/api/v1/`
- `infrastructure/` — Docker Compose for PostgreSQL/PostGIS and Redis only

Django, Vite, Celery, and Expo run on the host. See [docs/architecture.md](docs/architecture.md).

## Tech stack

Web: React, TypeScript, Vite, Tailwind, React Router, TanStack Query, Axios, React Hook Form, Zod, Recharts, MapLibre, Lucide.

Mobile: React Native, Expo, Expo Router, TanStack Query, Axios, Expo Secure Store, Expo Location.

Backend: Python 3.12+, Django, DRF, SimpleJWT, Celery, Channels, OR-Tools, pandas, NumPy, scikit-learn, joblib.

## Deploy (Docker)

Single command — builds and runs Postgres/PostGIS, Redis, Django API (Daphne), a Celery worker, and the web UI:

```bash
cp .env.example .env   # set DJANGO_SECRET_KEY to a real secret first
docker compose up --build
```

- Web: http://localhost:8080 — API: http://localhost:8000/api/v1/ — Health: http://localhost:8000/health/
- First boot migrates, collects static files, seeds the Jefferson demo (`SEED_DEMO=false` to skip), and trains the synthetic ML models (`TRAIN_ML_ON_BOOT=false` to skip; artifacts persist in a volume).
- `docker compose down` stops everything; add `-v` to also drop the database.
- Behind TLS, set `SESSION_COOKIE_SECURE=true` and `CSRF_COOKIE_SECURE=true`. Mobile/Expo still runs on the host (see `EXPO_PUBLIC_API_URL`).

## Setup

Requirements: Docker Desktop, Python 3.12+ (Windows `py` launcher is supported), Node 20+, npm.

### Windows PowerShell (this repo’s default terminal)

PowerShell 5 does not accept bash `&&`. Run **one command at a time**, or separate with `;`.

```powershell
# If you see "running scripts is disabled", use the .cmd launcher:
.\rundev.cmd -NoMobile
```

Flags: `-NoMobile`, `-SkipInstall`, `-ResetDemo`, `-Help`.

`rundev.sh` still exists for Git Bash / WSL (`./rundev.sh --no-mobile`).

### Git Bash / macOS / Linux

```bash
cp .env.example .env
./rundev.sh
```

Flags: `--no-mobile`, `--skip-install`, `--reset-demo`.

## Demo users

Password for all: `DemoPass123!`

| Role | Email |
| --- | --- |
| Platform admin | platform@routewise.demo |
| District admin | admin@jefferson.demo |
| Planner | planner@jefferson.demo |
| Dispatcher | dispatcher@jefferson.demo |
| Driver | driver@jefferson.demo |
| Guardian | guardian@jefferson.demo |

URLs after `.\rundev.ps1` or `./rundev.sh`:

- Web: http://localhost:5173
- API docs: http://localhost:8000/api/docs/

Physical phone: set `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000/api/v1`.

## Testing

PowerShell:

```powershell
Set-Location backend; .\.venv\Scripts\python.exe -m pytest
Set-Location ..\web; npm test; npm run typecheck
```

Git Bash:

```bash
cd backend && .venv/Scripts/python -m pytest
cd ../web && npm test && npm run typecheck
```

## ML design

scikit-learn `GradientBoostingRegressor` quantile models (P50 α=0.5, P90 α=0.9) plus a late classifier. Trained on ≥20,000 **fictional** seeded segments with realistic planned speeds (18–42 km/h) and late labels that exclude normal boarding dwell. The UI labels this as synthetic. Live trip ETAs sum per-leg model predictions over remaining stops; the optimizer blends worst-leg classifier risk into on-time probability. Travel matrix prefers OSRM street durations (`USE_STREET_MATRIX=true` in deploy) with per-cell Haversine fallback. If artifacts are missing, routing falls back to Haversine durations.

```bash
python manage.py generate_synthetic_ml_data
python manage.py train_travel_models
python manage.py evaluate_travel_models
```

## OR-Tools design

Morning routes are a capacitated VRP with time windows on **stops** (student demand aggregated). Vehicles start at a depot and end at the school. Fastest uses P50, balanced mixes P50/P90, reliability uses P90 and late risk. Infeasibility returns structured reasons, not a bare “solver failed.”

## Privacy and safety limitations

- Guardian APIs return only linked children; manifests are driver/staff only.
- Tokens are not written to application logs; student addresses are not logged.
- JWT refresh is stored in web `localStorage` (POC only). Mobile uses Expo Secure Store.
- Simulated GPS is labeled. Do not use this app to navigate a real bus.

## Troubleshooting

- Postgres not ready: `docker compose -f infrastructure/docker-compose.yml logs postgres`
- Windows bash: install Git for Windows and run `./rundev.sh` from Git Bash
- Port 8000 busy: stop the other process or change the daphne bind in `rundev.sh`
- Expo cannot reach API: use LAN IP, not localhost
- Solver infeasible: check wheelchair seats, approved stops, and bell windows
