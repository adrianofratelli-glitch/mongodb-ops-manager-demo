# Queries e índices — mongodb-ops-manager-demo

> Números de linha podem ficar defasados após mudanças: a fonte atualizada é [MAPA_DO_CODIGO.md](../MAPA_DO_CODIGO.md).

## Leia isto primeiro: só o laboratório do Performance Advisor fala com MongoDB

A simulação (dashboard, deployments, backup, alertas, segurança) continua sem
banco: o dado vem de uma estrutura em memória carregada de
`frontend/src/api/seed.json` por `backend/data.py` e é filtrado com list
comprehension em `backend/main.py`.

A exceção, opcional, é o **laboratório real do Performance Advisor**
(`backend/lab.py`, rotas `/api/lab/*`). Com `MONGODB_URI` definido, ele usa
PyMongo para popular coleções fictícias e executar de verdade as consultas
que a tela aponta como lentas. Sem `MONGODB_URI`, `GET /api/lab` devolve
`enabled: false` com o motivo e nada mais muda.

## 0. Laboratório real: as queries que existem

Banco: `OPSMGR_LAB_DB` (padrão `opsmgr_lab_test`). `lab.config()` só aceita
`opsmgr_lab` ou `opsmgr_lab_<sufixo>` (regex com âncora, recusa
`opsmgr_labprod`); seed, criação e remoção de índice num banco que não termine
em `_test` respondem 403 sem `ALLOW_DEMO_DB_WRITE=1`. Os cenários ficam em
`frontend/src/api/lab_scenarios.json` (lido pelo backend e pelo mock).

O texto exibido é o próprio comando executado: `lab.explain_command` monta o
dicionário (filtro Extended JSON convertido por `bson.json_util`, ou seja, data
de verdade), `db.command` o executa e `lab.shell` o serializa em sintaxe do
mongosh (`ISODate(...)`). Exemplo (ix-1):

```
db.runCommand({"explain":{"find":"orders","filter":{"customerId":"C0042"},"sort":{"createdAt":-1},"limit":20},"verbosity":"executionStats"})
db.runCommand({"createIndexes":"orders","indexes":[{"key":{"customerId":1,"createdAt":-1},"name":"opsmgr_lab_ix_1"}]})
```

| Sugestão | `find` dentro do `explain` (coleção · filtro · sort · limit) | Índice criado (`createIndexes`) | Antes → depois (medido em 2026-11-12, MongoDB 9.0.7) |
|---|---|---|---|
| ix-1 | `orders` · `{"customerId":"C0042"}` · `{"createdAt":-1}` · 20 | `{customerId:1, createdAt:-1}` | COLLSCAN → SORT, 12.400 docs examinados → IXSCAN, 20 |
| ix-2 | `sessions` · `{"userId":"U0137","expiresAt":{"$gt":ISODate("2026-11-01T00:00:00Z")}}` · — · — | `{userId:1, expiresAt:1}` | COLLSCAN, 8.900 → IXSCAN, 2 |
| ix-3 | `events` · `{"eventType":"checkout","timestamp":{"$gt":ISODate("2026-10-25T00:00:00Z")}}` · `{"timestamp":-1}` · 50 | `{eventType:1, timestamp:-1}` | IXSCAN em `timestamp_1`, 561 → IXSCAN no composto, 50 |
| ix-4 | `products` · `{"category":"electronics"}` · `{"price":1}` · 20 | `{category:1, price:1}` | IXSCAN em `category_1` + SORT em memória, 638 → IXSCAN, 20 |

Como cada operação roda (`backend/lab.py`):

- **Seed** (`lab.seed`, `POST /api/lab/seed`): `drop_collection` + `insert_many`
  em lotes de 5.000 das quatro coleções (`orders` 12.400, `sessions` 8.900,
  `events` 45.000, `products` 6.200; `random.Random(42)`, determinístico) e os
  índices de base `timestamp_1` e `category_1`. Marca `lab_meta {_id: "seed",
  version}` (apagado no início, antes do drop); sem `?force=true`, um seed
  válido não é refeito. Leva ~13 s pela
  rede até o cluster compartilhado.
- **Explain** (`lab._explain`): comando `{explain: {find, filter, sort, limit},
  verbosity: "executionStats"}`. `lab._walk_plan` percorre `inputStage`,
  `inputStages` e `queryPlan` (plano clássico e SBE) e devolve estágios,
  índice usado, `totalDocsExamined`, `totalKeysExamined`, `nReturned` e
  `executionTimeMillis`.
- **Criar índice** (`lab.create_index`, `POST /api/lab/index/{sid}`): explain,
  `db.command(createIndexes)` com nome `opsmgr_lab_ix_<n>`, explain de novo. Índice já
  existente devolve 409.
- **Desfazer** (`lab.reset_indexes`, `POST /api/lab/reset`): `drop_index` só dos
  nomes com prefixo `opsmgr_lab_`; dados e índices de base ficam.

Concorrência: todas as operações do laboratório, inclusive o explain, usam `LAB_LOCK`
(aquisição não bloqueante; a segunda chamada recebe 409 "ocupado") em vez de
`STATE_LOCK`, para um seed de ~13 s não congelar a simulação. O registro no
Activity Feed continua sob `STATE_LOCK`. As rotas POST exigem o header
`X-Lab-Action: 1` (enviado pelo `client.js`; força preflight CORS, que só a
origem do frontend passa); sem ele, 403. A connection string nunca é
devolvida; falha de rede em `GET /api/lab` vira `enabled: false` com motivo e,
nas rotas de escrita, 502 sem detalhe cru.

## 1. Agregações em memória (equivalentes funcionais de aggregation pipeline)

Essas são comprehensions/loops Python que fazem o papel que um
`$match`/`$group`/`$sum` faria num pipeline real, sobre `STATE["clusters"]`
etc. Úteis para explicar "como o dashboard soma isso" sem confundir com
query de banco.

| O que faz | Onde (arquivo:linha) | Exemplo |
|---|---|---|
| Conta clusters saudáveis / com warning, soma hosts | `backend/main.py` (`get_dashboard`) | `healthy = sum(1 for c in clusters if c["status"] == "healthy")` |
| Acha o alerta mais severo ainda não reconhecido (equivalente a `$match` + `$sort` + `$limit 1`) | `backend/main.py` (`_top_alert`) | `sorted(abertos, key=lambda x: ordem.get(x["sev"], 9))[0]` |
| Soma conexões de todos os nós do cluster | `backend/main.py` (`_point`, `get_realtime`) | `sum(n.get("conn", 0) for n in c["nodes"]) or 40` |
| Fecha alertas de um cluster removido (equivalente a `deleteMany` filtrado) | `backend/main.py` (`_close_alerts_for`) | filtra `STATE["alerts_open"]` por `target.split(" / ")[0] == cluster_name` |
| Protegidos por backup = clusters não-standalone | `backend/main.py` (`get_backup`) | `sum(1 for c in STATE["clusters"] if c["type"] != "standalone")` |
| Janela de PIT por cluster (min/max de `created` dos snapshots) e soma de tamanho | `backend/main.py` (`_pit_windows`, `get_backup`) | equivalente a `$group` por cluster com `$min`/`$max`/`$sum` |

Motivo de existirem assim: o objetivo da PoV é demonstrar a *tela* do Ops
Manager, não performance de agregação. Implementar isso com MongoDB real
exigiria seed, conexão, índices e troubleshooting de infraestrutura sem
ganho nenhum de demonstração — o dado é pequeno (até ~4 clusters, dezenas de
nós) e cabe inteiro em memória.

## 2. Sugestões de índice e slow queries da simulação

`GET /api/perf-advisor` devolve duas listas do seed:

- `STATE["perf_index_suggestions"]` — cada item com `id` estável (`ix-1`…), o
  nome do índice (`name`) e o efeito esperado (`examined_after`, `time_after`).
- `STATE["perf_slow_queries"]` — cada forma de query ligada à sugestão por
  `suggestion_id`. A coluna "Docs Examined" usa os números que o laboratório
  mede no MongoDB real (12.400, 8.900, 561, 638).

"Create Index" da tabela simulada (`POST /api/perf-advisor/index/{sid}`) remove
a sugestão pelo `id` (segundo clique: 404) e troca a slow query ligada para o
índice novo (`idx` = `<name> ✓`, docs examinados e tempo pós-índice). Não roda
`createIndex`: quem roda é o laboratório (seção 0). O mock repete a mesma regra
(`frontend/src/api/mock.js`, `createIndex`).

Os números "dinâmicos" (`avg_query_ms`, `slow_count`, `collections_scanned`,
`avg_query_delta_pct`) continuam sorteados a cada chamada em
`backend/main.py` (`get_perf_advisor`), marcados `"simulated": true`.

## 3. "Índices" mencionados na UI — texto/dado estático

- Papel/role de exemplo `indexManager` (`seed.json`) — string
  descritiva (`"createIndex, dropIndex, listIndexes"`), não uma permissão
  aplicada de verdade.
- Campo `idx` em `perf_slow_queries` (ex.: `"COLLSCAN"`, `"email_1 ✓"`,
  `seed.json`) — string ilustrativa mostrando se a query
  fictícia usa full scan ou índice, para o roteiro de demo explicar o
  conceito de índice ao cliente.

## 4. Se o cliente perguntar "e se eu quiser ver isso rodando contra um banco de verdade"

Abra o painel "Prova no MongoDB real" na aba Performance Advisor (backend com
`MONGODB_URI`): ele executa os comandos acima, mostra o plano vencedor antes e
depois do `createIndex` e o comando exato. Para aggregation pipeline, Search
ou Vector Search reais, use outra PoV do portfólio: esta continua focada na
experiência do operador do Ops Manager.
