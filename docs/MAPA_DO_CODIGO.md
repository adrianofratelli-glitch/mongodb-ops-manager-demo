# Mapa do código — mongodb-ops-manager-demo

> Também conhecida como: Ops Manager (pasta antiga `ops-manager-demo`). Portas: frontend 5377 / backend 8077. Em uma frase: uma simulação interativa do MongoDB Ops Manager (implantações, Automation, métricas, backup/restore, alertas, segurança) feita com LeafyGreen; **não há Ops Manager nem MongoDB reais por trás**, o estado vive em memória.

Telas e roteiro: [briefing/ui-flows.md](briefing/ui-flows.md). Sobre "queries": [briefing/queries.md](briefing/queries.md) (resumo: não existe nenhuma query MongoDB). Arquitetura: [briefing/architecture.md](briefing/architecture.md) e `ARCHITECTURE.md` na raiz.

## 1. Árvore anotada

```
backend/                     API FastAPI (porta 8077), tudo em memória
  main.py                    as 60+ rotas /api/* e TODAS as regras de negócio simuladas (1.216 linhas; abrir aqui primeiro)
  data.py                    carrega o seed e devolve uma cópia nova (usado no start e no reset)
  tests/                     pytest (ver seção 6) + scenarios_adversarial.json
frontend/                    React + Vite + LeafyGreen (porta 5377, proxy /api -> 8077: vite.config.js)
  src/App.jsx                casca: TopBar, Sidebar, página atual, contadores, gaveta "Ver chamada simulada"
  src/lib/sections.js        lista das 16 telas e dos 5 grupos do menu lateral
  src/pages/index.js         mapa id da tela -> componente (só o Dashboard entra no bundle inicial)
  src/pages/*.jsx            uma página por tela (Dashboard, Deployments, Automation, Agents, Settings, Metrics,
                             PerfAdvisor, Realtime, Alerts, Backup, Restore, Users, Roles, Auth, Audit, Activity)
  src/modals/                NewDeploymentModal, ConnectModal (strings de exemplo), AgentLogsModal
  src/components/            Sidebar, TopBar, LineChart (@lg-charts), QueryDetails, ui.jsx (pedaços de UI), MongoLeaf
  src/api/client.js          camada HTTP: axios (modo real) ou MockAPI (modo GitHub Pages) + evento de rastro de chamada
  src/api/mock.js            reimplementa o backend no navegador (694 linhas) para o build estático
  src/api/seed.json          FONTE ÚNICA do estado inicial: o backend e o mock leem o mesmo arquivo
  src/lib/csv.js             exportação CSV real (Agents, Audit, Activity)
  src/pov-signature.css      estilo de marca
  tests/                     mock_parity.mjs e e2e_ui.mjs
start.sh                     sobe backend (8077) e frontend (5377); POV_DEV=1 liga o HMR
deploy-pages.sh              publica o build em modo mock no GitHub Pages
ARCHITECTURE.md, AGENTS.md   notas de arquitetura e de operação do repo
docs/                        briefing/, decks/, screenshots/
```

## 2. "Apertei o botão X, o que roda?"

Todo botão chama `API.<método>` de `frontend/src/api/client.js` (`RealAPI`, linhas 15-70); cada método vira uma rota `/api/...` em `backend/main.py`. **Coluna MongoDB: nenhuma linha toca MongoDB**; o "banco" é o dicionário `STATE` em `backend/main.py:36` (ver seção 3). Abaixo, a coluna "função de negócio" é a própria função handler (e auxiliares).

| Tela / botão | Componente (arquivo:linha) | Chamada HTTP | Handler / função de negócio | Estado que muda (em memória) |
|---|---|---|---|---|
| Abrir o app (contadores do menu, nome do projeto) | `App.jsx:25` (dashboard, alerts, perf), `App.jsx:35` (meta) | `GET /api/dashboard`, `/api/alerts`, `/api/perf-advisor`, `/api/meta` | `main.py:178 get_dashboard`, `:1033 get_alerts`, `:805 get_perf_advisor`, `:173 get_meta` | leitura |
| Dashboard: abrir / "Refresh" | `Dashboard.jsx:55`, botão `:68` | `GET /api/dashboard` | `main.py:179 get_dashboard` (usa `_top_alert` :354) | leitura |
| Dashboard: "Add Deployment" / link "Ver alerta" | `Dashboard.jsx:69`, `:76` | nenhuma (só `navigate`) | n/a | n/a |
| All Clusters: abrir a lista | `Deployments.jsx:133` | `GET /api/clusters` | `main.py:368 list_clusters` | leitura |
| "New Deployment" -> "Deploy" | `Deployments.jsx:152`; `NewDeploymentModal.jsx:21` | `POST /api/clusters` | `main.py:374 create_cluster` (valida `NewCluster`; `_register_agents` :200) | `STATE["clusters"]`, `STATE["agents"]`, activity |
| "Terminate" (com confirmação) | `Deployments.jsx:102,118` | `DELETE /api/clusters/{id}` | `main.py:403 delete_cluster` (`_busy_reason` :345, `_drop_agents` :212, `_close_alerts_for` :217) | remove cluster, agents e alertas dele; 409 se for origem/destino de restore |
| "Add node" (só replica set) | `Deployments.jsx:96` | `POST /api/clusters/{id}/nodes` | `main.py:442 add_node` | `STATE["clusters"]` (+ agent) |
| "Step Down" | `Deployments.jsx:72` | `POST /api/clusters/{id}/stepdown?node_idx=` | `main.py:464 step_down` (só com secundário elegível) | troca de papel PRIMARY/SECONDARY |
| "Resync" (secundário) | `Deployments.jsx:74-75` | `POST /api/clusters/{id}/resync?node_idx=` | `main.py:488 resync_node` (`RESYNC_SECONDS`=25, `_expire_resyncs` :230) | `resync_until` no nó; métricas sobem e voltam sozinhas |
| Upgrade de versão do cluster | `Deployments.jsx:97-98` | `POST /api/clusters/{id}/upgrade` | `main.py:515 upgrade_cluster` (`_check_upgrade` :249, `_start_upgrade` :268, `_advance_upgrades` :282; 3 s por nó) | rolling upgrade simulado |
| "Connect" | `Deployments.jsx:95` -> `ConnectModal.jsx` | nenhuma | n/a (strings estáticas de exemplo) | n/a |
| (sem botão) editar cluster | `client.js` tem `editCluster`, nenhuma tela chama | `PUT /api/clusters/{id}` | `main.py:426 edit_cluster` | n/a |
| Automation: abrir | `Automation.jsx:14` | `GET /api/automation` | `main.py:529 get_automation` | leitura |
| Automation: "Apply" | `Automation.jsx:21,41` | `POST /api/automation/pending/{pid}/apply` | `main.py:539 apply_pending` | move item para o histórico; pode iniciar rolling upgrade |
| Automation: "Discard" | `Automation.jsx:29,42` | `DELETE /api/automation/pending/{pid}` | `main.py:564 discard_pending` | remove pendência |
| Agents: abrir | `Agents.jsx:17` | `GET /api/agents` | `main.py:574 get_agents` | leitura |
| Agents: "Upgrade All" | `Agents.jsx:23,52` | `POST /api/agents/upgrade` | `main.py:606 upgrade_agents` (`AGENT_LATEST`=12.0.28) | versão dos agents |
| Agents: "Logs" | `Agents.jsx:28,41` -> `AgentLogsModal.jsx` | `GET /api/agents/{host}/logs` | `main.py:582 get_agent_logs` (linhas sintéticas) | leitura |
| Agents: exportar CSV | `Agents.jsx:48-49` | nenhuma (`lib/csv.js`) | n/a | n/a |
| Metrics: abrir / trocar cluster | `Metrics.jsx:66` | `GET /api/metrics/{cid}` | `main.py:716 get_metrics` (`_point` :653, `_walk` :627) | série em `_WALKS` |
| Metrics: tick a cada 1 s ("Pausar/Retomar") | `Metrics.jsx:76`, botão `:124` | `GET /api/metrics/{cid}/tick` | `main.py:732 get_metrics_tick` | avança a série (60 amostras) |
| Real-Time: abrir / tick 1 s | `Realtime.jsx:46` | `GET /api/realtime/{cid}` | `main.py:757 get_realtime` (`_rt_new_op` :746) | `_RT_OPS` |
| Real-Time: "Kill" | `Realtime.jsx:58,103` | `POST /api/realtime/{cid}/kill/{opid}` | `main.py:789 kill_op` | remove a operação de `_RT_OPS` |
| Performance Advisor: abrir / "Re-scan" | `PerfAdvisor.jsx:18,48` | `GET /api/perf-advisor` | `main.py:806 get_perf_advisor` | leitura (dados do seed, "simulated") |
| Performance Advisor: "Create Index" | `PerfAdvisor.jsx:24,34` | `POST /api/perf-advisor/index/{sid}` | `main.py:828 create_index` (só tira a sugestão da lista; **não cria índice**) | `STATE["perf_index_suggestions"]` |
| Backup: abrir | `Backup.jsx:20` | `GET /api/backup` | `main.py:877 get_backup` (`_pit_windows` :849) | leitura |
| Backup: "Take Snapshot" | `Backup.jsx:28,69` | `POST /api/backup/snapshot?cluster=` | `main.py:890 take_snapshot` (recusa standalone) | `STATE` snapshots |
| Backup: "Delete" snapshot | `Backup.jsx:33,61` | `DELETE /api/backup/snapshot/{sid}` | `main.py:911 delete_snapshot` | remove snapshot |
| Backup: "Restore" na linha | `Backup.jsx:38,60` | `POST /api/restore` | `main.py:947 start_restore` | cria job de restore |
| Restore: abrir (janela PIT) | `Restore.jsx:32-35` | `GET /api/restore`, `/api/clusters`, `/api/backup` | `main.py:936 get_restore_jobs`, `:368`, `:877` | leitura (jobs avançam via `_update_restore_jobs` :308) |
| Restore: "Start Point-in-Time Restore" | `Restore.jsx:57,106` | `POST /api/restore` | `main.py:947 start_restore` (`RESTORE_RUNNING_SECONDS`=3, `RESTORE_TOTAL_SECONDS`=9; 409 se já houver job) | job `queued -> running -> completed` |
| Alerts: abrir | `Alerts.jsx:19` | `GET /api/alerts` | `main.py:1034 get_alerts` (`_expire_acks` :1023) | leitura |
| Alerts: "Acknowledge" | `Alerts.jsx:30,71` | `POST /api/alerts/{aid}/acknowledge` | `main.py:1044 acknowledge_alert` (silencia 60 min) | alerta ack |
| Alerts: "Resolve" | `Alerts.jsx:25,72` | `POST /api/alerts/{aid}/resolve` | `main.py:1059 resolve_alert` | remove de `alerts_open` |
| Alerts: "Delete" config | `Alerts.jsx:36,46` | `DELETE /api/alerts/configs/{cfg_id}` | `main.py:1084 delete_alert_config` | remove config |
| (sem botão) criar config de alerta | `client.js` tem `addAlertConfig`, nenhuma tela chama | `POST /api/alerts/configs` | `main.py:1071 add_alert_config` | n/a |
| Database Users: "Create User" / "Delete" | `Users.jsx:30,77` / `:34,48` | `POST /api/users` / `DELETE /api/users/{name}` | `main.py:1102 add_user` / `:1117 delete_user` | `STATE["users"]` |
| Database Users: "Reset Pw" | `Users.jsx:47` | nenhuma (só toast) | n/a | n/a |
| Custom Roles: "Create Role" / "Delete" | `Roles.jsx:29,62` / `:33,42` | `POST /api/roles` / `DELETE /api/roles/{name}` | `main.py:1132 add_role` / `:1142 delete_role` | `STATE["roles"]` |
| Authentication: listar / "Remove" IP | `Auth.jsx:28`, `:34,40` | `GET /api/security/ip` / `DELETE /api/security/ip?ip=` | `main.py:1152 get_ips` / `:1174 delete_ip` | lista de IPs |
| Authentication: "Rotate TLS Certificates" | `Auth.jsx:62` | nenhuma (só toast) | n/a | n/a |
| (sem botão) adicionar IP | `client.js` tem `addIp`, nenhuma tela chama | `POST /api/security/ip` | `main.py:1164 add_ip` (valida CIDR) | n/a |
| Audit Log: abrir / exportar CSV | `Audit.jsx:16`, `:34` | `GET /api/audit` | `main.py:1185 get_audit` | leitura |
| Activity Feed: abrir / exportar CSV | `Activity.jsx:13`, `:36` | `GET /api/activity` | `main.py:1193 get_activity` (`_log_activity` :1197 grava) | leitura |
| Project Settings: "Reset Demo" (com confirmação) | `Settings.jsx:20,39` | `POST /api/reset` | `main.py:1202 reset_demo` (`data.seed()` + limpa `_WALKS`, `_RT_OPS`) | volta 100% ao seed |
| Gaveta "Ver chamada simulada" | `App.jsx:41,64` + `QueryDetails.jsx`; evento disparado em `client.js:83,93` | nenhuma | n/a | só mostra a última chamada (operação, args, tempo, modo "mock local"/"FastAPI local") |

Saúde: `GET /health/live` (`main.py:50`).

## 3. Onde estão as queries MongoDB

**Não existem.** Conferido em `backend/` e `frontend/src/`: não há `pymongo`, `MongoClient`, `.aggregate(`, `$search`, `create_index` de driver, nem change streams. Os `.find(` que aparecem são `Array.prototype.find` (ex.: `find_cluster`, `main.py:55`, é um `next(...)` sobre lista).

| O que parece query | Onde está de verdade | O que é |
|---|---|---|
| Totais do dashboard (healthy/warning, hosts) | `backend/main.py::get_dashboard` (:179) | `sum(...)` / list comprehension sobre `STATE["clusters"]` |
| Alerta mais severo | `main.py::_top_alert` (:354) | `sorted(...)[0]` sobre `alerts_open` |
| Janela de PIT e tamanhos de backup | `main.py::_pit_windows` (:849), `_size_gb` (:842), `get_backup` (:877) | min/max/soma em Python |
| "Create Index" do Performance Advisor | `main.py::create_index` (:828) | remove item da lista em memória |
| Estado inicial | `backend/data.py::seed` (:19) lendo `frontend/src/api/seed.json` | `json.load` + `copy.deepcopy` |

Se perguntarem "onde está a query que popula a tela": é `STATE` em memória, carregado de `seed.json`. Detalhes em [briefing/queries.md](briefing/queries.md).

## 4. Compartilhado × só desta PoV

- **`_shared`**: nenhum (sem import de `_shared` no backend nem no frontend; conferido). O `frontend/src/pov-signature.css` é o CSS de marca do portfólio (não confirmei no repo se é cópia sincronizada de `_shared/ui`).
- **Variáveis de ambiente**: o backend não lê nenhuma (sem `os.getenv` em `backend/*.py`; sem `.env.example`). Frontend, só em tempo de build: `VITE_USE_MOCK` (liga o mock, `client.js:6`), `VITE_API_URL` (base da API em produção, `client.js:10`), `VITE_BASE` (prefixo do GitHub Pages, `vite.config.js`). `start.sh`: `POV_DEV=1` (HMR).
- **Bancos/coleções**: nenhum; não há conexão com Atlas.
- **Chamadas externas**: nenhuma. Sem LLM/Gateway, Voyage, Langfuse. Os dados são fictícios (`seed.json`).
- **Dois "backends"**: `backend/main.py` (modo real local) e `frontend/src/api/mock.js` (modo estático do GitHub Pages). As regras estão duplicadas de propósito; `frontend/tests/mock_parity.mjs` e `backend/tests/scenarios_adversarial.json` garantem que os dois se comportam igual. Mudou regra no Python? Mude no `mock.js` também.

## 5. "Quero mexer em..."

- Dados iniciais (clusters, alertas, usuários, sugestões do advisor) -> `frontend/src/api/seed.json` (vale para o backend e para o mock).
- Uma regra de negócio (ex.: o que bloqueia um upgrade) -> `backend/main.py` (`_check_upgrade` :249, `_busy_reason` :345) **e** o equivalente em `frontend/src/api/mock.js`.
- Tempos simulados (resync, upgrade por nó, restore, ack) -> constantes em `backend/main.py` (`RESYNC_SECONDS` :46, `UPGRADE_SECONDS_PER_NODE` :45, `UPGRADE_SECONDS_PER_NODE`, `RESTORE_RUNNING_SECONDS`/`RESTORE_TOTAL_SECONDS` :927-928, `ACK_MINUTES` :1020).
- Itens do menu lateral -> `frontend/src/lib/sections.js` e o mapa em `frontend/src/pages/index.js`.
- Texto/colunas de uma tela -> `frontend/src/pages/<Tela>.jsx`.
- Adicionar rota -> `backend/main.py` (decorator `@app`), método em `frontend/src/api/client.js` (`RealAPI`) e em `mock.js`.
- Gráficos de Metrics (séries, ruído) -> `backend/main.py::_point` (:653) e `_walk` (:627); desenho em `frontend/src/components/LineChart.jsx` e `pages/Metrics.jsx`.
- Texto da gaveta "Ver chamada simulada" -> `frontend/src/components/QueryDetails.jsx` e `App.jsx:64`.
- Strings de conexão do modal "Connect" -> `frontend/src/modals/ConnectModal.jsx`.
- Porta -> `start.sh` (:5-6), `frontend/vite.config.js` (5377 e proxy 8077), CORS em `backend/main.py:27-33`.
- Versão de agent "mais nova" -> `AGENT_LATEST` em `backend/main.py:38`; versões conhecidas em `RELEASE_SERIES`.
- Publicar versão estática -> `deploy-pages.sh` (usa `npm run build:pages`).

## 6. Testes

Comandos (README): `backend/.venv/bin/pytest -q backend/tests`; `(cd frontend && npm run test:parity)`; E2E de UI sem abrir porta: `(cd frontend && npx vite build --outDir /tmp/opsm-dist-real && node tests/e2e_ui.mjs bridge /tmp/opsm-dist-real)` e a versão mock com `VITE_USE_MOCK=1` (`node tests/e2e_ui.mjs mock ...`).

- `backend/tests/test_adversarial.py` — entradas inválidas em cluster/segurança, limite de nós, criação concorrente do mesmo cluster.
- `backend/tests/test_reset_hostile_adversarial.py` — reset volta ao estado exato, nomes/payloads hostis, corpo malformado, restore no futuro, concorrência (upgrade, restore, apply, snapshot, reset com escritas).
- `backend/tests/test_restore_lifecycle.py` — apagar origem/destino durante restore, job que perde o destino, reset no meio do job.
- `backend/tests/test_scenarios_adversarial.py` — executa `scenarios_adversarial.json` contra o FastAPI.
- `backend/tests/test_cors.py` — origens permitidas; `asgi_bridge.py` é apoio (ponte ASGI para o E2E).
- `frontend/tests/mock_parity.mjs` — mesmos cenários contra o `MockAPI`; reset do mock = seed.
- `frontend/tests/e2e_ui.mjs` — Playwright em modos `mock`, `offline`, `bridge`, `live`.
