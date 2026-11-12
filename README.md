<div align="center">

Mapa do código: [docs/MAPA_DO_CODIGO.md](docs/MAPA_DO_CODIGO.md)

# MongoDB Ops Manager — Interactive PoV

**A fully interactive simulation of MongoDB Ops Manager 9.0** (no real Ops Manager behind it), built with
MongoDB's LeafyGreen Design System and a Python backend — plus an optional **Performance Advisor lab**
that runs the suggested indexes against a real MongoDB and shows `explain("executionStats")` before and after.

Created to support MongoDB Enterprise Advanced positioning in Brazil. This
public overview is in English; the PoV interface and presentation-specific
documentation remain in Brazilian Portuguese.

![stack](https://img.shields.io/badge/frontend-React%20%2B%20Vite%20%2B%20LeafyGreen-00ED64)
![backend](https://img.shields.io/badge/backend-FastAPI%20(Python)-001E2B)

### [Open the live demo](https://adrianofratelli-glitch.github.io/mongodb-ops-manager-demo/)

*Runs directly in the browser in mock mode, with no backend or installation required.*

</div>

![Dashboard: fleet overview with a critical disk alert, four deployments, and recent activity](docs/screenshots/01-dashboard.png)

| Live metrics (60-second window) | Deployments and node lifecycle |
|---|---|
| ![Metrics: live charts over a moving 60-second window](docs/screenshots/02-metrics.png) | ![Deployments: replica sets and a sharded cluster with node actions](docs/screenshots/03-deployments.png) |

![Security: database users, authentication mechanisms, and roles](docs/screenshots/04-security.png)

---

## Run it

**Live demo:** https://adrianofratelli-glitch.github.io/mongodb-ops-manager-demo/

**Full local stack with the Python backend** (Python 3.11+ and Node 20+):

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
(cd frontend && npm ci)

./start.sh           # optimized build, opens http://127.0.0.1:5377
POV_DEV=1 ./start.sh # development mode with HMR
POV_NO_OPEN=1 ./start.sh # do not open the browser
```

The launcher starts the backend on `127.0.0.1:8077` and the frontend on
`127.0.0.1:5377`. If either port is already in use it stops with an error and
leaves the existing process alone. It never installs dependencies, so run the
setup above once before a presentation.

**Reset:** the simulation has no database. All state lives in memory and comes from
`frontend/src/api/seed.json` (shared by the backend and the GitHub Pages mock).
*Project Settings → Reset Demo* (`POST /api/reset`) or restarting the backend
returns everything to that seed, including in-flight upgrades and restores.

**Publish a new live-demo version:**

```bash
./deploy-pages.sh   # static mock build → GitHub Pages (new commit on gh-pages, no force-push)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for architecture, endpoints, and manual
execution.

> **Optional real MongoDB (Performance Advisor lab):** set `MONGODB_URI` in the
> environment or in a local `.env` (never committed) and the *Performance Advisor*
> page shows a "Prova no MongoDB real" panel. See
> [Performance Advisor lab](#performance-advisor-lab-real-mongodb). Without it the
> panel says it is off and everything else is unchanged.

> **Two modes:** GitHub Pages uses a zero-cost mock with data embedded in the
> frontend. When run locally with `./start.sh`, the frontend uses the real
> FastAPI backend, which is better suited to technical architecture demos.
> Both modes read the same seed and are held to the same rule scenarios.

---

## Docker

One container (nginx + FastAPI, non-root, port 8080), no external service and no `.env` needed
(pass `--env-file` with `MONGODB_URI` only if you want the Performance Advisor lab):

```bash
docker build -t ops-manager-demo .
docker run --rm -p 18086:8080 ops-manager-demo   # http://127.0.0.1:18086
```

Prebuilt image (published to GHCR on every push to `main` that touches the image):

```bash
docker pull ghcr.io/adrianofratelli-glitch/mongodb-ops-manager-demo:latest
docker run --rm -p 8080:8080 ghcr.io/adrianofratelli-glitch/mongodb-ops-manager-demo:latest   # no .env needed
```

Same `--env-file` rule as above (`KEY=value`, no quotes); tags: `latest` and `sha-<7-char commit>`.

nginx serves the build and proxies `/api` (prefix kept, as in `vite.config.js`); healthcheck at
`/health/live`. State is in memory: restarting the container is a reset.

---

## Tests

```bash
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest -q backend/tests      # FastAPI: rules, reset, hostile input, concurrency
(cd frontend && npm run test:parity)            # same scenarios against the GitHub Pages mock

# UI end-to-end without opening a port (Playwright serves the build itself)
(cd frontend && npx vite build --outDir /tmp/opsm-dist-real && node tests/e2e_ui.mjs bridge /tmp/opsm-dist-real)
(cd frontend && VITE_USE_MOCK=1 npx vite build --outDir /tmp/opsm-dist-mock && node tests/e2e_ui.mjs mock /tmp/opsm-dist-mock)

# Performance Advisor lab against a real MongoDB (writes only to the opsmgr_lab_test database)
OPSMGR_LIVE=1 MONGODB_URI='<your connection string>' backend/.venv/bin/pytest -q backend/tests/test_lab_live.py
```

The offline suite always runs with the lab switched off (`backend/tests/conftest.py`),
so it never needs a network or a database.

`backend/tests/scenarios_adversarial.json` describes out-of-order actions
(restore without a backup, upgrade during an upgrade, resync of a standalone),
double clicks, and two-tab conflicts; it runs against both the FastAPI backend
and the mock. The backend suite also covers malformed and 1 MB bodies,
operator-injection payloads (`{"$gt": ""}`), unicode/zero-width/RTL names,
32 parallel requests on the same resource, and a test proving that state after
many actions plus `POST /api/reset` equals the initial state. The `bridge` E2E
drives the real UI build against the real FastAPI app in process (two full demo
runs from reset, 360/768/1440 px layouts, `prefers-reduced-motion`).

## Performance Advisor lab (real MongoDB)

The one deliberate exception to "everything is simulated". When `MONGODB_URI` is
set, `backend/lab.py`:

1. **Populates** four synthetic collections in database `opsmgr_lab_test`
   (override with `OPSMGR_LAB_DB`; only `opsmgr_lab` or `opsmgr_lab_<suffix>` is
   accepted, and any write to a database not ending in `_test` is refused unless
   `ALLOW_DEMO_DB_WRITE=1`): `orders` 12,400, `sessions` 8,900, `events` 45,000 and
   `products` 6,200 documents, deterministic (seed 42), plus the two indexes the
   simulated table says already exist (`timestamp_1`, `category_1`).
2. **Explains** the exact query shape behind each index suggestion
   (`frontend/src/api/lab_scenarios.json`, shared with the mock) with
   `explain("executionStats")`.
3. **Creates the suggested index** (named `opsmgr_lab_ix_<n>`) and explains again,
   returning plan, index used, docs and keys examined, documents returned and
   server time, plus the commands that ran, printed from the very dictionaries
   sent to the server (`db.runCommand({...})`, dates as `ISODate(...)`).
4. **Undoes** only its own indexes (`opsmgr_lab_` prefix); data stays.

Write routes (`POST /api/lab/*`) require the `X-Lab-Action: 1` header, which
the frontend sends; a plain cross-site POST cannot set it.

Measured on 2026-11-12 against MongoDB 9.0.7 (`backend/tests/test_lab_live.py`):

| Suggestion | Before | After |
|---|---|---|
| `orders {customerId:1, createdAt:-1}` | COLLSCAN → SORT, 12,400 docs examined | IXSCAN → FETCH → LIMIT, 20 |
| `sessions {userId:1, expiresAt:1}` | COLLSCAN, 8,900 | IXSCAN → FETCH, 2 |
| `events {eventType:1, timestamp:-1}` | IXSCAN on `timestamp_1`, 561 | IXSCAN on the compound index, 50 |
| `products {category:1, price:1}` | IXSCAN on `category_1` + in-memory SORT, 638 | IXSCAN → FETCH → LIMIT, 20 |

The "Docs Examined" column of the simulated slow-query table uses these same
numbers, and the simulated *Create Index* now switches the linked slow query to
the new index. The connection string never leaves the backend (the API returns
only database name and server version); infrastructure failures become
`enabled: false` with a reason, never a crash. The static GitHub Pages build has
no backend, so the panel is always off there. Rationale:
[docs/adr/0001-laboratorio-real-performance-advisor.md](docs/adr/0001-laboratorio-real-performance-advisor.md).

## What is simulated, and which rules are real

**Everything else is simulated.** There is no Ops Manager installation, no MongoDB
process and no agent behind the rest of this demo: every number, duration and action lives
in memory (FastAPI or the browser mock), and the top bar says so on every
screen. The demo is **not evidence of product performance or results**; it
shows the operator experience and the order in which Ops Manager allows things
to happen.

What *was* checked is the set of refusals below, against official MongoDB
documentation (read on 2026-10-09). "Literal" means the page states the rule;
"inferred" means the page describes the mechanism and the demo picks the
refusal that follows from it.

| Rule enforced by the demo | Basis | Source |
|---|---|---|
| Upgrades go one release series at a time (6.0 → 7.0 → 8.0 → 9.0) | Literal | [Upgrade a Replica Set to 8.0](https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-replica-set/) |
| Version changes are rolling, one process at a time, and block resync, step down, add node and a second upgrade while they run | Inferred (Automation applies one goal state per deployment) | [Change the Version of MongoDB](https://www.mongodb.com/docs/ops-manager/current/tutorial/change-mongodb-version/) |
| Downgrade is refused | Simplification: Ops Manager allows a downgrade within the same FCV; the demo refuses all downgrades and says why | [Change the Version of MongoDB](https://www.mongodb.com/docs/ops-manager/current/tutorial/change-mongodb-version/) |
| A standalone has no continuous backup or point-in-time restore | Literal (no oplog) | [FAQ: Backup and Restore](https://www.mongodb.com/docs/ops-manager/current/reference/faq/faq-backup/) |
| A member in `STARTUP2` (initial sync) is never elected primary | Literal | [Replica Set Member States](https://www.mongodb.com/docs/manual/reference/replica-states/) |
| Restore requires a snapshot, a point inside the PIT window and a target with the same topology; sharded restores cover all shards | Literal | [Restore Overview](https://www.mongodb.com/docs/ops-manager/current/tutorial/nav/restore-overview/) |
| While a restore runs, its target cannot be terminated, upgraded or changed (add node, step down, resync) | Inferred: an automated restore removes all data on the target and rewrites it through Automation | [Restore Overview](https://www.mongodb.com/docs/ops-manager/current/tutorial/nav/restore-overview/) |
| While a restore runs, its source cannot be terminated and its snapshot cannot be deleted | Inferred: removing a deployment from Ops Manager deletes its snapshots | [Stop Managing and/or Monitoring One Deployment](https://www.mongodb.com/docs/ops-manager/current/tutorial/unmanage-deployment/) |
| A restore job that loses its source or target ends `failed` with a reason, never `completed` | Inferred: restore jobs end `FINISHED`, `BROKEN` or `KILLED` | [Troubleshoot Backup and Restore Failures](https://www.mongodb.com/docs/manual/troubleshooting/backup-restore-failures/) |

Durations (3 s per upgraded process, 9 s restore, 25 s initial sync) are demo
timings, not product measurements. Rules not listed here (alert thresholds,
Performance Advisor counters) are illustrative only. The platform label
(Ops Manager 9.0.1) and agent versions (seed `109.0.0.9285-1`, "Upgrade All" to
`109.0.1.9309-1`) follow the
[Ops Manager release notes](https://www.mongodb.com/docs/ops-manager/current/release-notes/application/)
(read on 2026-11-12); the simulation does not model other 9.0 features
(OpenTelemetry export of agent metrics, direct-to-S3 backup).

---

## What the PoV covers

The React interface uses MongoDB's LeafyGreen components and data provided by a
FastAPI backend. Actions have coherent simulated effects: provisioning creates
a cluster, termination removes it, and counters update.

State stays consistent across modules. Provisioning registers agents for the
new nodes; termination removes those agents and closes the cluster alerts; and
resynchronizing a secondary moves it into `STARTUP2` while CPU, replication lag,
and IOPS rise until the node recovers automatically.

| Module | Demonstrated capability |
|---|---|
| **Dashboard** | Fleet overview, alerts, and cluster status |
| **Deployments** | Replica sets, sharded clusters, standalone deployments, and lifecycle actions |
| **Automation** | Pending changes with apply/discard and history |
| **Agents** | Inventory, per-host logs, upgrades, and CSV export |
| **Metrics** | Eight live charts over a moving 60-second window |
| **Performance Advisor** | Index recommendations and slow-query analysis; optional lab that proves each suggestion on a real MongoDB with `explain` before/after `createIndex` |
| **Real-Time** | Per-cluster live operations and a functional `killOp` simulation |
| **Backup / Restore** | Snapshots and point-in-time recovery |
| **Alerts** | Open/closed views, settings, and one-hour acknowledgement |
| **Security** | Users, RBAC, authentication options, IP access list, and audit log |
| **Activity / Settings** | Event feed and deterministic demo reset |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, and [LeafyGreen UI](https://www.mongodb.design/) |
| HTTP | Axios |
| Backend | Python and FastAPI with in-memory state; PyMongo for the optional lab |

## Scope and disclaimer

This is a visual and educational PoV. It uses synthetic data and does not
connect to a real Ops Manager installation; the optional lab writes only synthetic
documents to its own `opsmgr_lab*` database. MongoDB, Ops Manager, and
Enterprise Advanced are trademarks of MongoDB, Inc.

## License

MIT, see [LICENSE](LICENSE).

### Compatibilidade do frontend

LeafyGreen utiliza módulos Node transitivos. O Vite resolve `buffer`, `process`, `events`
e `stream` com aliases explícitos; o módulo inicial configura os globais no dev e Rolldown resolve os símbolos no build.
Isso mantém os chunks independentes da ordem de inicialização de globais. Após atualizar
essas dependências, validar build e abertura no navegador (um build verde não detecta
`Buffer is not defined` em runtime).
