# Changelog

## 1.3.0 (2026-11-12)

- Performance Advisor lab (optional, real MongoDB): with `MONGODB_URI` set, `backend/lab.py` seeds four deterministic synthetic collections in `opsmgr_lab_test` (default) and runs each suggested query with `explain("executionStats")` before and after a real `createIndexes` (`/api/lab/*`, "Prova no MongoDB real" panel); the commands shown are the ones sent to the server (`db.runCommand`, `ISODate`). Database name must be `opsmgr_lab` or `opsmgr_lab_<suffix>`; writes to a database not ending in `_test` need `ALLOW_DEMO_DB_WRITE=1`; POST routes require `X-Lab-Action: 1`; drops only its own `opsmgr_lab_*` indexes; never returns the connection string. Off (with a reason) when the URI is missing, in Docker without `--env-file` and in the GitHub Pages mock. ADR `docs/adr/0001-laboratorio-real-performance-advisor.md`.
- Simulated Performance Advisor is now coherent: query shapes match the suggested indexes (ESR), slow queries link to their suggestion, and the simulated Create Index switches the linked query from COLLSCAN to the new index with the docs-examined numbers measured by the lab.
- Platform shown as Ops Manager 9.0.1; agents `109.0.0.9285-1` → "Upgrade All" to `109.0.1.9309-1` (official release notes); release series catalog includes 9.0 (8.0 → 9.0 allowed, 7.0 → 9.0 refused); "Major → x.0.0" upgrade button; 9.0.7 in New Deployment.
- Tests: 52 → 65 offline backend tests (+6 live, opt-in with `OPSMGR_LIVE=1`), mock parity 14 → 17 scenarios.

## Unreleased (before 1.3.0)

- Corrige abas controladas de Connect/Alerts para a API LeafyGreen v17 (`value`/`onValueChange`); usa injeção nativa do Rolldown para preservar React em modo produção.

- Atualiza dependências compatíveis e pisos de segurança; alinha metadados de versão entre aplicação e frontend.
- Substitui polyfills genéricos por aliases explícitos de Buffer, process, events e stream.

## 1.2.1

- Separa build Pages em `dist-pages` e recompila a versão local quando o base path diverge (commit `3a5e2c4`).

## 1.2.0 (2026-10-09)

- Restore lifecycle: while a restore job is queued or running, its target refuses terminate, upgrade, add node, step down and resync, its source refuses terminate, and the snapshot in use cannot be deleted (409 with the job id). A rolling upgrade on the target blocks a new restore into it.
- A restore job whose source or target disappears now ends `failed` with a reason instead of `completed`; the Restore page shows the failed badge and stops polling when no job is active (and only polls while the tab is visible).
- README: explicit statement that everything is simulated, and a table of the refusals checked against official MongoDB documentation (literal vs inferred, with links). The "Simulação" chip in the top bar links to it.

## 1.1.0 (2026-10-06)

- Simulation rules aligned with Ops Manager: rolling upgrades (one process at a time, one release series at a time, no downgrade), backup and restore only for replica sets and sharded clusters, restore limited to the PIT window and to one job per source/target, resync only for secondaries, and no election of a member in initial sync.
- Automation "Apply" on a version upgrade now starts the same rolling upgrade; changes for a terminated cluster are refused.
- Deletes by stable key (role name, network, config id, suggestion id) instead of list position, so two tabs cannot remove the wrong item; duplicates return 409.
- `POST /api/reset` now also clears the Performance Advisor's last scan; a test proves state after many actions plus reset equals the initial state.
- Single seed file (`frontend/src/api/seed.json`) for the backend and the GitHub Pages mock; shared adversarial scenarios run against both.
- UI: permanent "Simulação" label, honest Backup/Restore figures computed from state instead of fixed numbers, offline states on Metrics and Real-Time, Settings without a fake "Save".
- UI: layout MongoDB 2026 "Dark Stage v4" (tokens mais escuros, Special Gothic / Source Code Pro locais, motivos de escada e grade, movimento escalonado).
- Removed the unused `run-dev.sh` wrapper (`POV_DEV=1 ./start.sh` does the same).

## 1.0.0 (2026-09-30)

First public release.

- Repository rebuilt with a clean, single-commit history.
- English README and repository description, with screenshots of the running demo.
- MIT license.
- Internal notes, presentation decks, test-output snapshots, and tooling configuration removed from the repository.
