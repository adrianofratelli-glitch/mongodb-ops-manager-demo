# MongoDB Ops Manager — Demo (React + LeafyGreen + FastAPI)

Migração da demo single-file para a stack oficial da MongoDB (**LeafyGreen Design System**)
com backend Python.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React + Vite + [@leafygreen-ui](https://www.mongodb.design/) (design system oficial da MongoDB) |
| **Gráficos** | @lg-charts/core (charts oficiais MongoDB) |
| **HTTP** | axios |
| **Backend** | Python FastAPI (estado em memória, sem banco real) |

## Como rodar (local)

### Opção rápida — script único
```bash
./start.sh
```
Sobe backend (porta 8077) + frontend (porta 5377). Use `POV_DEV=1` para HMR.

### Manual
```bash
# Terminal 1 — backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8077   # Swagger em http://localhost:8077/docs

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                        # http://127.0.0.1:5377
```
O Vite faz proxy de `/api` → backend (porta 8077) automaticamente em dev.

## Estrutura

```
backend/
  main.py            # FastAPI — endpoints REST + mutações
  data.py            # carrega o seed (frontend/src/api/seed.json) e devolve cópias
  tests/             # pytest + cenários compartilhados com o mock
  requirements.txt
frontend/
  src/
    api/client.js    # camada axios (todos os endpoints tipados) + errMsg()
    api/mock.js      # mesma API 100% no cliente, para o build do GitHub Pages
    api/seed.json    # estado inicial único dos dois modos
    components/       # TopBar, Sidebar, MongoLeaf, LineChart, ui helpers
    modals/           # New Deployment, Connect, Agent Logs
    pages/            # uma por seção; só o Dashboard entra no bundle inicial
    lib/sections.js   # config da navegação
    lib/csv.js        # exportação CSV local (Activity, Audit, Agents)
    App.jsx           # shell: LeafyGreenProvider, dark mode, toast, roteamento
```

## Endpoints principais (backend)

`GET /api/dashboard` · `GET/POST/DELETE /api/clusters` · `GET /api/automation` ·
`GET /api/perf-advisor` · `GET /api/backup` · `GET /api/users` ·
`POST /api/reset` … (lista completa em `/docs`).

Monitoring e ciclo de vida:

| Rota | O que faz |
|---|---|
| `GET /api/metrics/{id}` | janela de 60 amostras + timestamps |
| `GET /api/metrics/{id}/tick` | amostra seguinte (o front empurra na janela) |
| `GET /api/realtime/{id}` | operações vivas do cluster, persistidas entre polls |
| `POST /api/realtime/{id}/kill/{opid}` | encerra uma operação existente |
| `POST /api/clusters/{id}/resync` | initial sync de 25s em um secundário |
| `POST /api/clusters/{id}/stepdown` | eleição, com PRIMARY e SECONDARY validados |
| `GET /api/agents/{host}/logs` | últimas linhas do log do agent |
| `POST /api/alerts/{id}/acknowledge` | silencia o alerta por 60 minutos |
| `POST /api/clusters/{id}/upgrade` | inicia rolling upgrade simulado (`cluster.upgrade` mostra `done/total`) |
| `GET /api/backup` | snapshots + `pit_windows` por cluster + `storage_gb` (simulado) |
| `POST /api/restore` | `{cluster, point}` (PIT) ou `{cluster, snapshot_id}`; `target` = `same`, `download` ou cluster de mesma topologia |
| `DELETE /api/roles/{name}` · `DELETE /api/security/ip?ip=` · `DELETE /api/alerts/configs/{id}` · `POST /api/perf-advisor/index/{id}` | remoção por chave estável |

As regras de recusa (409/422) estão em `docs/briefing/architecture.md`, seção
"Regras de simulação", e em `backend/tests/scenarios_adversarial.json`.

## Estado

- [x] Backend FastAPI completo (todos os dados + mutações + reset)
- [x] Shell LeafyGreen (SideNav oficial, TopBar, dark mode, toast, axios)
- [x] Todos os módulos ligados ao backend
- [x] Monitoring ao vivo em janela móvel, reagindo ao estado do cluster
- [x] Ciclo de vida coerente entre clusters, agents e alertas
- [x] Mock do GitHub Pages em paridade com o backend
- [x] Páginas em lazy loading; React, LeafyGreen e Emotion em chunks próprios

> O GitHub Pages usa o mesmo frontend React em modo mock; o runtime local usa FastAPI.
