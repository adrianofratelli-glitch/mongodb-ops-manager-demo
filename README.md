<div align="center">

# MongoDB Ops Manager — Interactive PoV

**A faithful, fully interactive simulation of MongoDB Ops Manager**, built with
MongoDB's LeafyGreen Design System and a Python backend.

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

**Full local stack with the Python backend:**

```bash
./start.sh           # optimized portfolio build
POV_DEV=1 ./start.sh # development mode with HMR
```

The launcher starts the backend on `127.0.0.1:8077` and the frontend on
`127.0.0.1:5377`. It preserves any process already using either port.

> Local prerequisites: `backend/.venv` with `requirements.txt` installed and
> `frontend/node_modules` available. The launcher does not modify dependencies
> during a presentation.

**Publish a new live-demo version:**

```bash
./deploy-pages.sh   # static mock build → GitHub Pages
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for architecture, endpoints, and manual
execution.

> **Two modes:** GitHub Pages uses a zero-cost mock with data embedded in the
> frontend. When run locally through `opsmgr`, the frontend uses the real
> FastAPI backend, which is better suited to technical architecture demos.

---

## Resilience tests

```bash
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest -q backend/tests
```

The suite submits malformed configuration, invalid IP/CIDR values, hostile
version and port inputs, excessive node counts, and 32 concurrent attempts to
create the same cluster. The contract is to reject invalid or conflicting
requests with `422`/`409` and keep exactly one state entry. Cluster creation,
node addition, and reset are serialized; each cluster is limited to 12 nodes.

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
| **Performance Advisor** | Index recommendations and slow-query analysis |
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
| Backend | Python and FastAPI with in-memory state |

## Scope and disclaimer

This is a visual and educational PoV. It uses synthetic in-memory data and does
not connect to a real Ops Manager installation. MongoDB, Ops Manager, and
Enterprise Advanced are trademarks of MongoDB, Inc.

## License

MIT, see [LICENSE](LICENSE).
