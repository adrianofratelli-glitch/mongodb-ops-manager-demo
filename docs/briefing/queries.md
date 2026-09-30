# Queries e índices — ops-manager-demo

## Leia isto primeiro: não há MongoDB real nesta PoV

Grep completo no repo (`backend/`, `frontend/src/`) por `.aggregate(`,
`.find(` (driver real), `create_index`, `createIndex`, `pymongo` e
`MongoClient`:

```
backend/main.py:636:      def create_index(idx: int):
backend/data.py:78:       "priv": "createIndex, dropIndex, listIndexes"  (texto de exemplo de role)
frontend/src/modals/ConnectModal.jsx:19-22:  strings estáticas de exemplo (Node/Python/Java/C#)
frontend/src/api/client.js:42:    createIndex: (idx) => api.post(...)
frontend/src/api/mock.js:453:    createIndex: (idx) => {...}
frontend/src/api/mock.js:140,333,334,355,362,368,431,457,477,484,490:
    .find(...)  — Array.prototype.find do JavaScript, não driver MongoDB
```

Nenhuma dessas ocorrências é uma query real contra um banco MongoDB. Não há
`pymongo`, não há `MongoClient` instanciado em código de aplicação, não há
`db.collection.find()`/`.aggregate()` de driver em lugar nenhum. Se o gestor
perguntar "onde está a query X que popula o dashboard", a resposta é: **não
existe query — o dado vem de uma lista Python em memória** (`backend/data.py`,
`_SEED`), filtrada/agregada com list comprehension pura em `backend/main.py`.

Abaixo, o que existe de mais próximo de "query" nesta PoV, para você
localizar rápido cada coisa quando perguntarem.

## 1. Agregações em memória (equivalentes funcionais de aggregation pipeline)

Essas são comprehensions/loops Python que fazem o papel que um
`$match`/`$group`/`$sum` faria num pipeline real, sobre `STATE["clusters"]`
etc. Úteis para explicar "como o dashboard soma isso" sem confundir com
query de banco.

| O que faz | Onde (arquivo:linha) | Exemplo |
|---|---|---|
| Conta clusters saudáveis / com warning, soma hosts | `backend/main.py:128-145` (`get_dashboard`) | `healthy = sum(1 for c in clusters if c["status"] == "healthy")` |
| Acha o alerta mais severo ainda não reconhecido (equivalente a `$match` + `$sort` + `$limit 1`) | `backend/main.py:201-208` (`_top_alert`) | `sorted(abertos, key=lambda x: ordem.get(x["sev"], 9))[0]` |
| Soma conexões de todos os nós do cluster | `backend/main.py:485` e `:583` | `sum(n.get("conn", 0) for n in c["nodes"]) or 40` |
| Fecha alertas de um cluster removido (equivalente a `deleteMany` filtrado) | `backend/main.py:174-184` (`_close_alerts_for`) | filtra `STATE["alerts_open"]` por `target.split(" / ")[0] == cluster_name` |
| Protegidos por backup = clusters não-standalone | `backend/main.py:647-654` (`get_backup`) | `sum(1 for c in STATE["clusters"] if c["type"] != "standalone")` |

Motivo de existirem assim: o objetivo da PoV é demonstrar a *tela* do Ops
Manager, não performance de agregação. Implementar isso com MongoDB real
exigiria seed, conexão, índices e troubleshooting de infraestrutura sem
ganho nenhum de demonstração — o dado é pequeno (até ~4 clusters, dezenas de
nós) e cabe inteiro em memória.

## 2. Sugestões de índice do Performance Advisor — dados estáticos, não reais

`GET /api/perf-advisor` devolve duas listas fixas do seed, sem nenhuma
análise real de query shape:

- `STATE["perf_index_suggestions"]` — definida em `backend/data.py:117-122`.
- `STATE["perf_slow_queries"]` — definida em `backend/data.py:123-129`.

Exemplo de uma sugestão (sem dados sensíveis, é tudo fictício):

```python
{"impact": "high", "ns": "app_db.orders", "idx": "{ customerId: 1, createdAt: -1 }",
 "queries": 42, "improvement": "~95% faster (12,400 → 8 docs)"}
```

"Criar o índice" na demo (`POST /api/perf-advisor/index/{idx}`,
`backend/main.py:635-641`) apenas **remove o item da lista em memória**
(`STATE["perf_index_suggestions"].pop(idx)`) — não roda `createIndex` contra
nenhum banco. É pensado para o roteiro de demo (item 8 do fluxo recomendado
em `ui-flows.md`): o usuário clica em "Create Index", o item some da lista e
aparece um toast de sucesso — visualmente idêntico ao fluxo real do Ops
Manager, mas sem execução real.

Os números "dinâmicos" do Performance Advisor (`avg_query_ms`, `slow_count`,
`collections_scanned`, `avg_query_delta_pct`) são sorteados a cada chamada
dentro de faixas plausíveis (`backend/main.py:613-632`, função
`get_perf_advisor`) e vêm explicitamente marcados `"simulated": true`. Existe
até um cálculo de variação percentual guardando a última leitura
(`_PERF_LAST_AVG_MS`) só para o número "vs. scan anterior" não parecer
desconectado do que está na tela — mas segue sendo dado sintético, nunca um
scan real.

## 3. "Índices" mencionados na UI — texto/dado estático

- Papel/role de exemplo `indexManager` (`backend/data.py:78`) — string
  descritiva (`"createIndex, dropIndex, listIndexes"`), não uma permissão
  aplicada de verdade.
- Campo `idx` em `perf_slow_queries` (ex.: `"COLLSCAN"`, `"email_1 ✓"`,
  `backend/data.py:124-128`) — string ilustrativa mostrando se a query
  fictícia usa full scan ou índice, para o roteiro de demo explicar o
  conceito de índice ao cliente.

## 4. Se o cliente perguntar "e se eu quiser ver isso rodando contra um banco de verdade"

Resposta correta para dar ao gestor: esta PoV é intencionalmente
"banco-less" — ela demonstra a interface e o fluxo operacional do Ops
Manager, não o comportamento de queries reais. Para demonstrar otimização de
índice, aggregation pipeline ou performance real, a PoV certa é outra do
portfólio que conecta em um cluster Atlas de verdade (ver
`povs-real-cluster-ok` no vault de memória) — não esta.
