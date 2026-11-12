# ADR 0001 — Laboratório real no Performance Advisor

- Data: 2026-11-12
- Status: aceito

## Contexto

A demo simula o Ops Manager inteiro em memória. A avaliação de 2026-11-12
mediu, rodando o backend, que a tela do Performance Advisor era a mais frágil
como argumento: "Create Index" só tirava a sugestão da lista, a slow query
continuava `COLLSCAN` com 12.400 docs examinados, e a sugestão
`{customerId: 1, createdAt: -1}` não batia com a forma de query exibida
(`{customerId, status}`). Nada na PoV mostrava o banco fazendo alguma coisa.

O Performance Advisor é a tela em que a afirmação ("este índice reduz o
trabalho da query") é sobre o MongoDB, não sobre a interface, e é a única
que dá para provar em segundos com `explain`.

## Decisão

1. Módulo `backend/lab.py`, opcional, ligado só quando `MONGODB_URI` está no
   ambiente ou no `.env` da PoV. Sem ele, `GET /api/lab` devolve
   `enabled: false` com o motivo e a demo continua igual (Docker e GitHub
   Pages incluídos).
2. Coleções fictícias e determinísticas (`random.Random(42)`) com os mesmos
   tamanhos que a tabela simulada mostra como "Docs Examined" (12.400, 8.900,
   45.000, 6.200), mais os índices de base que a coluna "Index Used" diz que
   existem (`timestamp_1`, `category_1`).
3. As formas de query ficam num arquivo só, `frontend/src/api/lab_scenarios.json`,
   em Extended JSON, lido pelo backend (executa) e pelo mock (exibe o mesmo
   MQL desligado). O texto do MQL é serializado igual nos dois
   (`JSON.stringify` × `json.dumps(separators=(",", ":"))`) e um cenário
   compartilhado prende isso.
4. Medição por `explain` com `executionStats` antes e depois de `createIndex`,
   devolvendo plano, índice, docs/chaves examinados, docs devolvidos e tempo
   no servidor, mais o MQL exato.
5. Guardas: só escreve em bancos com prefixo `opsmgr_lab`; só remove índices
   com prefixo `opsmgr_lab_`; a URI nunca sai do processo; falha de
   infraestrutura vira estado (`enabled: false`) ou 502 sem detalhe cru.
6. Concorrência: `LAB_LOCK` com aquisição não bloqueante (409 "ocupado") em
   vez de `STATE_LOCK`. O seed leva ~13 s pela rede; segurar `STATE_LOCK`
   esse tempo travaria todas as rotas da simulação. O Activity Feed continua
   sob `STATE_LOCK`.
7. A simulação ficou coerente com a medição: a slow query ganha
   `suggestion_id`, as formas de query seguem a regra ESR das sugestões, e o
   "Create Index" simulado troca o índice usado e os docs examinados pelos
   valores medidos no laboratório.

## Medição (2026-11-12, MongoDB 9.0.7, banco `opsmgr_lab_test`)

| Sugestão | Antes | Depois |
|---|---|---|
| ix-1 `orders` | COLLSCAN → SORT, 12.400 docs | IXSCAN → FETCH → LIMIT, 20 |
| ix-2 `sessions` | COLLSCAN, 8.900 | IXSCAN → FETCH, 2 |
| ix-3 `events` | IXSCAN `timestamp_1`, 561 | IXSCAN composto, 50 |
| ix-4 `products` | IXSCAN `category_1` + SORT em memória, 638 | IXSCAN → FETCH → LIMIT, 20 |

Seed completo: 12,8 s; cada `createIndex`: 0,36–0,44 s.

## Alternativas descartadas

- **Consumir o Performance Advisor de um Ops Manager/Atlas real (Admin API).**
  Exige credencial de API, um cluster com carga e histórico de slow queries;
  não é reproduzível numa demo de minutos e põe credencial de Admin num repo
  público.
- **Ligar todas as telas a um MongoDB.** Infraestrutura sem ganho de
  demonstração: métricas, upgrade e restore do Ops Manager não são
  reproduzíveis num cluster compartilhado.
- **Rodar o laboratório no mock do GitHub Pages.** Não há backend nem
  credencial no build estático; o mock só expõe o mesmo contrato desligado.

## Consequências

- Nova dependência de runtime: `pymongo` (importada só quando o laboratório
  liga).
- Testes: `backend/tests/test_lab.py` (offline) e
  `backend/tests/test_lab_live.py` (só com `OPSMGR_LIVE=1`); `conftest.py`
  garante que a suíte offline nunca enxerga a URI.
- O Portal só mostra o laboratório ligado se o `.env` da PoV tiver
  `MONGODB_URI` (copiado do `.env.shared` pelo `sync_env.py`).
