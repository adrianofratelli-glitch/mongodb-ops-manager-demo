# Telas, fluxos e componentes — ops-manager-demo

Nota sobre screenshots: não existe nenhum arquivo de imagem (`.png`/`.jpg`)
neste repositório — nem em `docs/`, nem em `frontend/`. Se precisar de
screenshots para um material de apresentação, capture na hora rodando
`./start.sh` e navegando `http://127.0.0.1:5377`; não invente referências de
imagem que não existem no projeto.

## Navegação (SideNav)

Definida em `frontend/src/lib/sections.js`, renderizada por
`frontend/src/components/Sidebar.jsx`. Cinco grupos, 16 telas:

| Grupo | Telas | Componente (`frontend/src/pages/`) |
|---|---|---|
| Visão geral | Dashboard, Activity Feed | `Dashboard.jsx`, `Activity.jsx` |
| Implantações | All Clusters, Automation, Agents, Project Settings | `Deployments.jsx`, `Automation.jsx`, `Agents.jsx`, `Settings.jsx` |
| Monitoramento | Metrics, Performance Advisor, Real-Time, Alerts | `Metrics.jsx`, `PerfAdvisor.jsx`, `Realtime.jsx`, `Alerts.jsx` |
| Proteção de dados | Backup, Restore | `Backup.jsx`, `Restore.jsx` |
| Segurança | Database Users, Custom Roles, Authentication, Audit Log | `Users.jsx`, `Roles.jsx`, `Auth.jsx`, `Audit.jsx` |

Roteamento: estado simples em memória no `App.jsx` (função `navigate`), sem
react-router. Só `Dashboard` entra no bundle inicial; o resto é
`React.lazy` (ver `frontend/src/pages/index.js`).

Em telas estreitas (`<768px`), a SideNav vira uma faixa vertical compacta
acima do conteúdo (`Sidebar.jsx`, uso de `Select` do LeafyGreen para trocar
de grupo), sem overflow horizontal.

## Dashboard (`Dashboard.jsx`)

Primeira tela vista. Busca `GET /api/dashboard` no mount.

- Banner de alerta no topo, só aparece se `top_alert` não for nulo (o alerta
  mais severo ainda não reconhecido). Vermelho para `crit`, amarelo para
  `warn`. Clique leva para a tela `Alerts`.
- 4 `StatCard`: Total Clusters (com badges Healthy/Warning), Monitored
  Hosts, Active Alerts, Backup Snapshots.
- Grid de `ClusterCard`, um por cluster: badge de tipo (Replica Set /
  Sharded / Standalone), badge de status, até 3 nós listados (bolinha
  verde/amarela/vermelha + host + role + conexões), "+N more nodes" se
  houver mais.
- Card "Recent Activity" com as 3 últimas entradas do feed.
- Erro de conexão vira `Banner variant="danger"` com botão "Tentar
  novamente" — não fica preso em "Carregando…" (comportamento de
  resiliência do projeto).

## Deployments / All Clusters (`Deployments.jsx`)

Lista completa de clusters com ações: criar (`NewDeploymentModal.jsx`,
`POST /api/clusters`), deletar com confirmação (`ConfirmationModal`,
`DELETE /api/clusters/{id}`), editar config (`PUT /api/clusters/{id}`),
adicionar nó (`POST /api/clusters/{id}/nodes`), step down de PRIMARY
(`POST /api/clusters/{id}/stepdown`), resync de secundário
(`POST /api/clusters/{id}/resync`), upgrade de versão
(`POST /api/clusters/{id}/upgrade`), e o modal "Connect"
(`ConnectModal.jsx`) que mostra strings de conexão de exemplo por
linguagem — sem executar nada de verdade.

## Automation (`Automation.jsx`)

Mostra `pending_changes` (mudanças de config aguardando aplicação) e
`automation_history`. Ação principal: aplicar (`POST
/api/automation/pending/{id}/apply`, move o item para o histórico com
status/duração simulados) ou descartar (`DELETE
/api/automation/pending/{id}`).

## Agents (`Agents.jsx`)

Lista `STATE["agents"]` — um por nó provisionado, criado automaticamente
quando um cluster é criado (`_register_agents` em `backend/main.py`) e
removido quando o cluster é deletado (`_drop_agents`). Botão "Upgrade All"
(`POST /api/agents/upgrade`) leva todos para `AGENT_LATEST` (`12.0.28`).
Modal de logs (`AgentLogsModal.jsx`, `GET /api/agents/{host}/logs`) mostra
linhas de log sintéticas geradas na hora (não há log real persistido).
Exportação CSV real via `frontend/src/lib/csv.js`.

## Metrics (`Metrics.jsx`) — monitoramento ao vivo

Seletor de cluster + janela móvel de 60 amostras (uma por segundo). No mount
busca a janela completa (`GET /api/metrics/{id}`); a cada 1s, se `live` e a
aba estiver visível e não houver requisição em voo, busca a próxima amostra
(`GET /api/metrics/{id}/tick`) e empurra no fim da série, descartando a mais
antiga (função `append`, linha 30). Para sozinho se o cluster some
(`catch` desliga `live`) ou a aba fica oculta
(`document.visibilityState`).

8 gráficos em grid 2 colunas: CPU por nó, Memory (resident/virtual),
Operations/sec (query/insert/update/delete), Connections (current/available),
Disk IOPS (read/write), Network I/O (in/out), Replication Lag (por
secundário), WiredTiger Cache (used/dirty). Todos usam `LineChart.jsx`
(`@lg-charts/core`).

Estado vazio dedicado quando não há clusters — não trava em "Carregando…".

## Performance Advisor (`PerfAdvisor.jsx`)

`GET /api/perf-advisor`: lista de sugestões de índice + slow queries +
números sintéticos (`avg_query_ms`, `slow_count`, `collections_scanned`,
`avg_query_delta_pct`), banner deixando claro que são dados ilustrativos
(`simulated: true`). Botão "Create Index" por sugestão chama `POST
/api/perf-advisor/index/{idx}`, que remove o item da lista e dispara um
toast de sucesso — ver `docs/briefing/queries.md` para detalhe de que isso
não cria índice real nenhum.

## Real-Time (`Realtime.jsx`)

Painel de operações em andamento (`GET /api/realtime/{id}`, polling 1x/s
com as mesmas regras de visibilidade/anti-sobreposição de Metrics).
Operações fictícias avançam, terminam sozinhas e são substituídas por
novas (lógica em `backend/main.py`). Botão "Kill" por operação
chama `POST /api/realtime/{id}/kill/{opid}` — a operação some de verdade da
lista em memória (`_RT_OPS`), não é só efeito visual.

## Backup / Restore (`Backup.jsx`, `Restore.jsx`)

Backup: banner "Simulação" no topo; lista de snapshots; botão "Take Snapshot ·
<cluster>" (`POST /api/backup/snapshot`) que usa o cluster do filtro e trava
durante a chamada (duplo clique não cria dois); standalone é recusado com o
motivo (sem oplog). "Storage Used" é a soma dos snapshots listados e "PIT
window" vem do estado — nada de número fixo. O botão Restore da linha cria um
job do tipo `Snapshot` com `snapshot_id`.

Restore: cria job de point-in-time restore (`POST /api/restore`) que evolui
sozinho `queued → running → completed` em ~9 s simulados
(`RESTORE_RUNNING_SECONDS=3`, `RESTORE_TOTAL_SECONDS=9`). A janela de PIT
mostrada, o ponto padrão e os limites do campo vêm de `pit_windows` do
`GET /api/backup`; cluster sem snapshot (ou standalone) mostra aviso e
desabilita o botão. Restore simultâneo na mesma origem/destino volta 409 com o
job em andamento. Enquanto o job roda, Terminate do destino ou da origem em
Deployments volta 409 com o motivo no toast ("é destino do restore rst-…"); job
`failed` mostra badge vermelho e o motivo na coluna Status. O polling da tabela
só roda com a aba visível e para quando não há job `queued`/`running`.

## Alerts (`Alerts.jsx`)

Lista `alerts_open` + configs de alerta. Acknowledge (`POST
/api/alerts/{id}/acknowledge`) silencia por 60 min (`ACK_MINUTES`) e some
do banner do Dashboard até expirar ou até ser resolvido. Resolve (`POST
/api/alerts/{id}/resolve`) remove definitivamente. CRUD de alert configs
(`POST`/`DELETE /api/alerts/configs`).

## Security: Users / Roles / Auth / Audit

- **Users** (`Users.jsx`): CRUD de usuários de banco fictícios
  (`GET/POST/DELETE /api/users`), com validação de nome único e formato.
- **Roles** (`Roles.jsx`): CRUD de custom roles (`GET/POST/DELETE
  /api/roles`).
- **Auth** (`Auth.jsx`): IP Access List (`GET/POST/DELETE
  /api/security/ip`), com validação de CIDR (`ip_network`).
- **Audit** (`Audit.jsx`): `GET /api/audit`, lista fixa de eventos de
  auditoria do seed. Exporta CSV real do que está em tela — filtro aplicado
  é respeitado na exportação.

## Activity Feed (`Activity.jsx`)

`GET /api/activity` — histórico crescente de toda ação de mutação feita na
demo (`_log_activity`, chamado por praticamente todo endpoint de escrita em
`backend/main.py`). Exporta CSV real.

## Settings (`Settings.jsx`)

Botão único com efeito: "Reset Demo" (`POST /api/reset`), recompõe o seed
inteiro e limpa os stores auxiliares (`_WALKS`, `_RT_OPS`, último scan do
Performance Advisor). Os demais campos estão desabilitados e rotulados como
ilustrativos (antes havia um "Save Changes" que dizia salvar sem salvar nada).

## Roteiro recomendado de demo (ordem sugerida ao apresentar)

1. Dashboard — saúde da frota e alerta mais severo em aberto.
2. Deployments — criar um replica set, ver contadores e agents surgirem.
3. Automation — aplicar o upgrade pendente de `rs-prod-01`: vira rolling upgrade
   (badge "Rolling upgrade → 7.0.6: n/3 processos (simulado)" em All Clusters);
   ao terminar entra no Automation History. Upgrade, resync, step down e add
   node ficam bloqueados enquanto ele roda.
4. Metrics — deixar os gráficos correndo enquanto se fala de baseline.
5. Deployments de novo — Resync em um secundário, voltar para Metrics:
   CPU/lag/IOPS daquele nó sobem e ele volta a `green` sozinho em 25s. É o
   ponto onde Automation e Monitoring se encontram na narrativa.
6. Real-Time — matar uma operação em andamento; ela some de verdade da
   lista.
7. Alerts — reconhecer o alerta crítico, mostrar o banner do Dashboard
   trocando para o próximo alerta.
8. Performance Advisor — materializar uma recomendação de índice.
9. Backup/Restore — snapshot manual; restore point-in-time dentro da janela
   mostrada; tentar restaurar o standalone para mostrar a recusa (sem oplog).
10. Security — autenticação, RBAC e auditabilidade; Audit Log exporta CSV
    real.
11. Settings — resetar a demo para reiniciar o roteiro do zero.

## Verificação visual (checklist antes de apresentar)

Validar em `1440×1000`, `768×1024` e `360×800`: navegação por teclado, skip
link visível no foco, ausência de overflow horizontal, console do browser
limpo, e comportamento correto sem backend disponível (estados de erro com
retry manual, não tela travada).
