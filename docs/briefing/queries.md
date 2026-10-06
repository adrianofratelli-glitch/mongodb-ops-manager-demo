# Queries e índices — ops-manager-demo

## Leia isto primeiro: não há MongoDB real nesta PoV

Grep completo no repo (`backend/`, `frontend/src/`) por `.aggregate(`,
`.find(` (driver real), `create_index`, `createIndex`, `pymongo` e
`MongoClient`:

```
backend/main.py            create_index(sid)  — remove a sugestão da lista em memória
frontend/src/api/seed.json "priv": "createIndex, dropIndex, listIndexes"  (texto de exemplo de role)
frontend/src/modals/ConnectModal.jsx  strings estáticas de exemplo (Node/Python/Java/C#)
frontend/src/api/client.js createIndex: (id) => api.post(...)
frontend/src/api/mock.js   createIndex: (sid) => {...}; .find(...) é Array.prototype.find
```

Nenhuma dessas ocorrências é uma query real contra um banco MongoDB. Não há
`pymongo`, não há `MongoClient` instanciado em código de aplicação, não há
`db.collection.find()`/`.aggregate()` de driver em lugar nenhum. Se o gestor
perguntar "onde está a query X que popula o dashboard", a resposta é: **não
existe query — o dado vem de uma estrutura em memória** carregada de
`frontend/src/api/seed.json` por `backend/data.py`, filtrada/agregada com list comprehension pura em `backend/main.py`.

Abaixo, o que existe de mais próximo de "query" nesta PoV, para você
localizar rápido cada coisa quando perguntarem.

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

## 2. Sugestões de índice do Performance Advisor — dados estáticos, não reais

`GET /api/perf-advisor` devolve duas listas fixas do seed, sem nenhuma
análise real de query shape:

- `STATE["perf_index_suggestions"]` — em `seed.json`, cada item com `id` estável (`ix-1`…).
- `STATE["perf_slow_queries"]` — em `seed.json`.

Exemplo de uma sugestão (sem dados sensíveis, é tudo fictício):

```python
{"id": "ix-1", "impact": "high", "ns": "app_db.orders", "idx": "{ customerId: 1, createdAt: -1 }",
 "queries": 42, "improvement": "~95% faster (12,400 → 8 docs)"}
```

"Criar o índice" na demo (`POST /api/perf-advisor/index/{sid}`) apenas
**remove o item da lista em memória** pelo `id` (duas abas não criam o índice
errado; o segundo clique recebe 404) — não roda `createIndex` contra
nenhum banco. É pensado para o roteiro de demo (item 8 do fluxo recomendado
em `ui-flows.md`): o usuário clica em "Create Index", o item some da lista e
aparece um toast de sucesso — visualmente idêntico ao fluxo real do Ops
Manager, mas sem execução real.

Os números "dinâmicos" do Performance Advisor (`avg_query_ms`, `slow_count`,
`collections_scanned`, `avg_query_delta_pct`) são sorteados a cada chamada
dentro de faixas plausíveis (`backend/main.py`, função
`get_perf_advisor`) e vêm explicitamente marcados `"simulated": true`. Existe
até um cálculo de variação percentual guardando a última leitura
(`_PERF_LAST_AVG_MS`) só para o número "vs. scan anterior" não parecer
desconectado do que está na tela — mas segue sendo dado sintético, nunca um
scan real.

## 3. "Índices" mencionados na UI — texto/dado estático

- Papel/role de exemplo `indexManager` (`seed.json`) — string
  descritiva (`"createIndex, dropIndex, listIndexes"`), não uma permissão
  aplicada de verdade.
- Campo `idx` em `perf_slow_queries` (ex.: `"COLLSCAN"`, `"email_1 ✓"`,
  `seed.json`) — string ilustrativa mostrando se a query
  fictícia usa full scan ou índice, para o roteiro de demo explicar o
  conceito de índice ao cliente.

## 4. Se o cliente perguntar "e se eu quiser ver isso rodando contra um banco de verdade"

Resposta correta para dar ao gestor: esta PoV é intencionalmente
"banco-less" — ela demonstra a interface e o fluxo operacional do Ops
Manager, não o comportamento de queries reais. Para demonstrar otimização de
índice, aggregation pipeline ou performance real, a PoV certa é outra do
portfólio que conecta em um cluster Atlas de verdade (ver
`povs-real-cluster-ok` no vault de memória) — não esta.
