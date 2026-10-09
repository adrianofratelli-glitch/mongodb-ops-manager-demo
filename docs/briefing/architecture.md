# Arquitetura — ops-manager-demo

## O que essa PoV é (e o que ela não é)

Simulação interativa do **MongoDB Ops Manager Enterprise Advanced**. Serve para
demonstrar, na frente do cliente, o vocabulário e o fluxo operacional do Ops
Manager — Automation, Monitoring, Performance Advisor, Backup/Restore, Alerts
e Security — sem depender de uma instalação real do Ops Manager nem de um
cluster MongoDB de verdade.

Importante para responder ao gestor sem hesitar: **não há banco de dados
real nesta PoV**. Todo o estado (clusters, nós, agents, snapshots, alertas,
usuários, métricas) é uma estrutura Python em memória (`backend/data.py`),
manipulada por endpoints REST em `backend/main.py`. Não existe `pymongo`,
`MongoClient` real nem conexão com Atlas em lugar nenhum do código de
aplicação — a única menção a `MongoClient`/`pymongo` é texto estático dentro
do modal "Connect" (`frontend/src/modals/ConnectModal.jsx`), que mostra ao
usuário snippets de código de exemplo (Node, Python, Java, C#) como o Ops
Manager real faria, mas nada disso é executado.

Por isso não existe `queries.md` com queries reais de aplicação contra um
banco — ver seção "Consultas" abaixo, e o arquivo `docs/briefing/queries.md`
documenta exatamente essa ausência mais o que existe de mais próximo
(pesquisas em arrays em memória, e a UI que simula sugestões de índice do
Performance Advisor).

Também não há agente de IA/LLM nesta PoV. Os "agents" que aparecem em toda a
interface (`Agents`, `agents_active`, `Automation + Monitoring + Backup`) são
a simulação do **MongoDB Automation Agent** — o processo real que o Ops
Manager instala em cada host para aplicar configuração e coletar métricas.
Aqui é só um registro em memória (`STATE["agents"]`), sem nenhuma lógica de
IA, prompt ou modelo de linguagem envolvida. Por isso não existe
`agent-behavior.md` neste briefing.

## Stack

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React + Vite + `@leafygreen-ui` (design system oficial MongoDB) | `frontend/` |
| Gráficos | `@lg-charts/core` | `frontend/src/components/LineChart.jsx` |
| HTTP client | axios | `frontend/src/api/client.js` |
| Backend | Python FastAPI, estado em memória | `backend/main.py` |
| Estado inicial ("seed") | JSON único lido pelos dois modos | `frontend/src/api/seed.json` (carregado por `backend/data.py` e importado por `mock.js`) |
| Modo estático (GitHub Pages) | mesma API reimplementada 100% no cliente | `frontend/src/api/mock.js` |

Duas portas fixas, sempre bind em `127.0.0.1` (nunca `0.0.0.0`):
- Backend FastAPI: `8077`
- Frontend Vite: `5377`

`./start.sh` orquestra os dois processos, valida disponibilidade de porta sem
matar quem já estiver escutando, espera `/health/live` responder antes de
liberar o frontend, e encerra os dois filhos em `EXIT/INT/TERM`.

## Componentes e fluxo de dados

```
Browser (:5377)
  └─ React + LeafyGreen
       │
       │  dev: proxy do Vite  /api/* → http://127.0.0.1:8077
       │  prod estático (GitHub Pages): VITE_USE_MOCK=1 → frontend/src/api/mock.js
       │       (mesma lógica de negócio, sem servidor)
       ▼
FastAPI (:8077)  — backend/main.py
  └─ STATE = data.seed()   (dict Python em memória, protegido por RLock)
       ├─ clusters / nodes
       ├─ agents (Automation Agent simulado)
       ├─ snapshots / restore_jobs
       ├─ alerts_open / alert_configs
       ├─ users / roles / ip_access_list / audit_events
       ├─ perf_index_suggestions / perf_slow_queries
       └─ activity (feed de auditoria da própria demo)
```

Não existe camada de persistência (sem SQLite, sem arquivo, sem MongoDB).
Reiniciar o processo do backend, ou chamar `POST /api/reset`, volta tudo para
o seed de `frontend/src/api/seed.json`. O reset também zera as séries de
métricas (`_WALKS`), as operações vivas (`_RT_OPS`) e o último scan do
Performance Advisor; `test_reset_restores_exact_initial_state_after_many_actions`
prova que estado após 17 ações + reset é igual ao estado inicial.

`frontend/src/api/client.js` decide em runtime se fala com o backend real
(`RealAPI`, via axios) ou com o mock local (`MockAPI`, em
`frontend/src/api/mock.js`) conforme a env var `VITE_USE_MOCK`. As duas
implementações precisam ficar em paridade — mesmos endpoints, mesmas
validações, mesmas mensagens de erro — porque o build público (GitHub Pages)
não tem backend Python disponível.

## Carga do frontend

Só a página `Dashboard` entra no bundle inicial (`frontend/src/pages/index.js`);
as outras 15 telas (`Deployments`, `Automation`, `Agents`, `Metrics`,
`PerfAdvisor`, `Realtime`, `Backup`, `Restore`, `Alerts`, `Users`, `Roles`,
`Auth`, `Audit`, `Activity`, `Settings`) são carregadas sob demanda via
`React.lazy` + `Suspense`. React, LeafyGreen e Emotion saem em chunks
separados, reaproveitados pelo navegador entre deploys.

## Decisões de arquitetura e o porquê

- **Estado em memória, sem banco real** — a PoV existe para demonstrar o
  *produto* Ops Manager, não para provar performance de banco. Colocar um
  MongoDB real atrás dela adicionaria infraestrutura sem adicionar valor de
  demonstração, e complicaria o `start.sh` (dependência externa, seed,
  cleanup). Trade-off aceito: nada sobrevive a um restart, e isso é
  documentado como limite conhecido.
- **FastAPI + mock.js duplicados, não um só backend** — o requisito de rodar
  em GitHub Pages (hosting estático, sem servidor) força uma segunda
  implementação client-side da mesma lógica. Para conter a duplicação, o
  seed é um arquivo só (`seed.json`) e as regras são presas pelos mesmos
  cenários (`backend/tests/scenarios_adversarial.json`), executados contra o
  FastAPI (`pytest`) e contra o mock (`npm run test:parity`).
- **`RLock` global (`STATE_LOCK`) em toda rota de escrita** — sem ele,
  requisições concorrentes (ex.: dois cliques rápidos em "New Deployment"
  com o mesmo nome) corrompiam o estado em memória compartilhado entre
  requisições do Uvicorn. Com o lock, a segunda requisição recebe `409`
  de forma determinística em vez de gerar duplicata.
- **Métricas como random walk com reversão à média, não valores aleatórios
  soltos** (`backend/main.py`, função `_walk`) — o gráfico
  precisa "andar" de forma contínua e plausível a cada segundo, e reagir
  a ações da demo (step down, resync, nó com disco cheio). Um sorteio
  independente por chamada deixaria o gráfico com serrilhado sem sentido
  visual nem narrativo.
- **Sem integração real com Ops Manager, Automation Agent ou Backup
  Daemon** — deliberado. `POST /api/reset` e todo o roteiro são pensados
  para nunca insinuar uma conexão de verdade.
- **Interface dark-only, sem toggle de tema** — segue o padrão visual
  compartilhado entre todas as PoVs do portfólio (`pov-signature.css`
  idêntico byte a byte entre PoVs), para consistência de marca na
  apresentação ao cliente.

## Regras de simulação (o que a demo recusa, como o produto real)

Todas as respostas são simuladas, mas as recusas seguem o comportamento
documentado do Ops Manager / MongoDB, para a demo nunca mostrar algo que o
produto real não faria. Cada linha tem cenário em
`backend/tests/scenarios_adversarial.json`.

| Ação | Regra na demo | Base no produto real |
|---|---|---|
| Upgrade (`POST /api/clusters/{id}/upgrade`, Automation "Apply") | Rolling: um processo por vez, config servers → secundários → primário → mongos; 3 s simulados por processo; recusa mesma versão, downgrade, salto de release series (6.0 → 8.0) e versão fora de 4.4–8.0; recusa novo upgrade durante upgrade | Upgrade de MongoDB é sequencial por release series e rolling no Ops Manager |
| Resync | Só membro `SECONDARY`; recusa standalone, mongos, config server e resync duplicado; bloqueado durante upgrade | Initial sync é de membro de replica set |
| Step down | Nó em `STARTUP2` (resync) não é eleito; bloqueado durante upgrade | Membro em initial sync não é elegível |
| Add Node | Só replica set; bloqueado durante upgrade | Sharded cresce por shard; standalone precisa virar replica set |
| Snapshot | Recusa standalone | Backup contínuo depende do oplog; standalone não tem oplog |
| Restore | Recusa cluster sem snapshot, standalone, ponto fora da janela PIT (do snapshot mais antigo ao mais recente), destino de topologia diferente, restore simultâneo na mesma origem/destino e destino em rolling upgrade; restore a partir de snapshot vira job `Snapshot`, não `PIT` | Restore só existe dentro da janela coberta pelo backup |
| Restore em andamento | Destino (inclusive `same`) recusa terminate, upgrade, add node, step down e resync; origem recusa terminate; o snapshot em uso não pode ser apagado (todos 409). Job que perde origem/destino por outro caminho termina `failed` com `error`, nunca `completed` | Automated restore reescreve o destino via Automation; remover o deployment apaga os snapshots ([fontes no README](../../README.md#what-is-simulated-and-which-rules-are-real)) |
| Automation | Mudança pendente de cluster terminado é recusada (descartar); upgrade pendente vira rolling upgrade real da simulação; config change grava `config` no cluster | — |
| Deletes (roles, IP, alert config, sugestão de índice) | Por chave estável (nome, rede, `id`), não por posição — duas abas não apagam o item errado; duplicatas recusadas com 409 | — |

Durações (`3 s` por processo, `9 s` de restore, `25 s` de resync) são da
simulação, não medidas do produto.

## Limites conhecidos

- Sem Ops Manager real, Automation Agent ou Backup Daemon.
- Sem persistência entre reinícios do processo.
- Sem credenciais, hosts ou identidade de cliente reais em lugar nenhum.
- `/health/live` comprova apenas liveness do processo backend, não validação
  funcional de cada módulo.
- Performance Advisor (`GET /api/perf-advisor`) devolve números sintéticos
  recalculados a cada chamada, marcados explicitamente com `"simulated": true"`
  — a UI mostra um banner avisando que são dados ilustrativos.
