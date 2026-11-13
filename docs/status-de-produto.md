# Status de produto — o que a simulação afirma e de onde veio

Conferido em **2026-11-13** na documentação oficial da MongoDB. A demo é uma simulação em memória
e não fala com nenhum Ops Manager nem cluster (ver [ADR 0002](adr/0002-simulacao-fiel-sem-cluster.md)); este
documento lista cada afirmação de produto que aparece nas telas, com a fonte e o que foi corrigido.

Fonte única no código:

- `frontend/src/api/product_status.json`: versão do Ops Manager, agentes, matriz de suporte e data da conferência
  (lido por `backend/data.py::product_status` e pelo mock).
- `frontend/src/lib/product_notes.json`: a nota "Simulado · No Ops Manager 9.0 real · No Atlas" de cada tela.
- `frontend/src/lib/ops_vs_atlas.json`: a página "Ops Manager × Atlas".
- `backend/tests/test_product_status.py` garante que toda seção tem nota com fonte, que o comparativo não fala de
  preço e que as três datas de conferência são iguais.

Legenda: **literal** = a página diz; **inferido** = a demo deduz do mecanismo descrito.

## Versões

| Afirmação na demo | Base | Fonte |
|---|---|---|
| Ops Manager 9.0.1 (05/10/2026) é a versão mais recente; 9.0.0 saiu em 29/09/2026 | literal | [Release notes do Ops Manager](https://www.mongodb.com/docs/ops-manager/current/release-notes/application/) |
| MongoDB Agent 109.0.0.9285-1 (OM 9.0.0) e 109.0.1.9309-1 (OM 9.0.1) | literal | idem |
| 9.0: export opcional de métricas do agente para OpenTelemetry, backup direto ao S3 com URLs pré-assinadas, Object Lock também nos oplog slices, API de reeleição, RHEL 10/Debian 13/SLES 16, fim do BI Connector (EOL 30/09/2026) | literal | idem |
| OM 9.0 suporta MongoDB 9.0, 8.0 e 7.0; 6.0 está **Deprecated**; 5.0 e 4.4 são **EOL** | literal | [Compatibilidade com MongoDB](https://www.mongodb.com/docs/ops-manager/current/reference/mongodb-compatibility/) |
| MongoDB 6.0 teve fim de vida em 31/07/2025; 7.0 em 31/08/2027; 8.0 em 31/10/2029; 9.0 em 31/10/2031. Ops Manager 8.0: 31/10/2027; 9.0: sem data | literal | [Lifecycles](https://www.mongodb.com/legal/support-policy/lifecycles) |
| Para chegar ao 9.0 é preciso estar em 8.0 ou 8.3; de 7.0, passar antes por 8.0 | literal | [Upgrade de replica set para 9.0](https://www.mongodb.com/docs/manual/release-notes/9.0-upgrade-replica-set/) |
| Números de patch (7.0.5, 8.0.12, 9.0.7, 6.0.12) | fictícios | as séries são reais; os patches são ilustrativos |

A demo conhece só séries major. 8.3 (minor) não está no catálogo: a matriz do Ops Manager lista apenas majors e
não diz se gerencia 8.3.

## Fluxos

| Tela | O que o produto real faz | Base | Fonte |
|---|---|---|---|
| Deployments / Automation | Mudança vira nova versão do automation config (`PUT /api/public/v1.0/groups/{PROJECT-ID}/automationConfig`); agentes aplicam um processo por vez | literal (endpoint); inferido (ordem) | [Update Automation Config](https://www.mongodb.com/docs/ops-manager/current/reference/api/automation-config/update-automation-config/) |
| Performance Advisor | Até 200.000 linhas de log / 20.000 slow queries, até 20 formas, impacto High/Medium; Create Index na própria tela, um por vez, build rolling opcional; exige Automation; não funciona com log `ctime` | literal | [Performance Advisor](https://www.mongodb.com/docs/ops-manager/current/tutorial/performance-advisor/) |
| Performance Advisor (API) | Só leitura: `GET …/hosts/{HOST-ID}/performanceAdvisor/suggestedIndexes`, `/slowQueryLogs`, `/namespaces` | literal | [API do PA](https://www.mongodb.com/docs/ops-manager/current/reference/api/performance-advisor/) |
| Real-Time | `db.currentOp()` e `mongotop`; Kill Op / Kill Session para Data Access Admin | literal | [Real-Time Metrics](https://www.mongodb.com/docs/ops-manager/current/view-real-time-metrics/) |
| Alerts | API lista e reconhece (`PATCH …/alerts/{ALERT-ID}` com `acknowledgedUntil`). "Resolve" da demo é atalho; no produto o alerta fecha quando a condição some | literal (API); inferido (fechamento) | [API de alertas](https://www.mongodb.com/docs/ops-manager/current/reference/api/alerts/) |
| Backup | Snapshot stores: file system, blockstore (MongoDB) ou S3-compatível; incrementais e deduplicados | literal | [Snapshot Storage](https://www.mongodb.com/docs/ops-manager/current/admin/backup/snapshot-storage-page/) |
| Restore | `POST …/clusters/{CLUSTER-ID}/restoreJobs`; estados `FINISHED`, `IN_PROGRESS`, `BROKEN`, `KILLED` (a demo usa queued/running/completed/failed) | literal | [Create Restore Job](https://www.mongodb.com/docs/ops-manager/current/reference/api/restorejobs/create-one-restore-job-for-one-cluster/) |
| Authentication | A lista de IPs do Ops Manager é por API key da Administration API ("Require IP Access List for Ops Manager Administration API"); não há lista de rede do banco como no Atlas | literal (lista por chave); inferido (rede é do cliente) | [Configure API Access](https://www.mongodb.com/docs/ops-manager/current/tutorial/configure-public-api-access/) |

## O que foi corrigido em 2026-11-13

1. `POST /api/clusters` aceitava 4.4 e 5.0: agora recusa com 422 citando a matriz; 6.0 cria com `warning`.
   Deployments mostra o selo "Deprecated no OM 9.0" em `rs-staging`.
2. Seed tinha datas de jan/2024 numa tela de Ops Manager 9.0.1: deslocadas para nov/2026, e o histórico de
   "upgrade 6.0.11 → 6.0.12" virou o upgrade dos agentes para 109.0.0.9285-1.
3. Project Settings e New Deployment ofereciam 5.0.24 (EOL no OM 9.0): agora 9.0/8.0/7.0 (6.0 marcado Deprecated).
4. "IP Access List" (conceito do Atlas) virou "API Access List · Ops Manager Administration API".
5. "Client-Side Field Level Encryption" deixou de ser chave de projeto: CSFLE e Queryable Encryption são do driver.
6. Cada tela ganhou a nota de simulado/real/Atlas com fonte; a página "Ops Manager × Atlas" compara 10 temas.

## Search e Vector Search fora do Atlas

O Ops Manager não gerencia o `mongot`. No Enterprise, ele roda em Kubernetes pelo MongoDB Controllers for
Kubernetes; a versão self-managed é GA desde 30/06/2026 (`mongot` 1.70.1; última 1.70.6 em 30/10/2026) e pede
MongoDB Server 8.3.4 ou posterior (8.0 e 8.2 não servem). Monitoração, alertas e FTDC do `mongot` ficam com o
cliente. Fontes: [visão geral](https://www.mongodb.com/docs/search/self-managed/current/),
[requisitos](https://www.mongodb.com/docs/search/self-managed/current/deployment/compatibility-requirements/),
[release notes](https://www.mongodb.com/docs/search/self-managed/current/release-notes/),
[monitoração](https://www.mongodb.com/docs/search/self-managed/current/deployment/monitoring/).

## Como reconferir

Reabrir as páginas acima, atualizar `product_status.json`, `product_notes.json` e `ops_vs_atlas.json` com a
mesma data em `checked_on`, e rodar `backend/.venv/bin/pytest -q backend/tests/test_product_status.py`.
