import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { Subtitle } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { PageHeader, StatCard, Grid, DataTable, Loading } from '../components/ui'
import AgentLogsModal from '../modals/AgentLogsModal'
import { API, errMsg } from '../api/client'
import { baixarCsv } from '../lib/csv'

export default function Agents({ toast }) {
  const [loadError, setLoadError] = useState(false)
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState(null)
  const reload = () => API.agents().then(setData).catch(() => setLoadError(true))
  useEffect(() => { reload() }, [])
  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={() => { setLoadError(false); reload() }}>Tentar novamente</Button></div>
  if (!data) return <Loading />

  const upgradeAll = async () => {
    try { await API.upgradeAgents(); toast('Agents atualizados', 'Todos os agents agora rodam v12.0.28.', 'success'); reload() }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
  }

  const verLogs = async (host) => {
    try { setLogs(await API.agentLogs(host)) }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
  }

  const desatualizados = data.agents.filter((a) => a.version !== data.latest).length

  const cols = [
    { header: 'Host', render: (r) => <b>{r.host}</b> },
    { header: 'Status', render: (r) => <Badge variant="green">● {r.status}</Badge> },
    { header: 'Version', key: 'version' },
    { header: 'Type', render: (r) => <span style={{ fontSize: 12, color: '#888' }}>{r.type}</span> },
    { header: 'Last Ping', key: 'ping' },
    { header: 'Cluster', key: 'cluster' },
    { header: 'Actions', render: (r) => <Button size="xsmall" onClick={() => verLogs(r.host)}>Logs</Button> },
  ]

  return (
    <div>
      <PageHeader title="Automation Agents" subtitle={`${data.agents.length} agents registrados`}
        actions={[
          <Button key="d" leftGlyph={<Icon glyph="Download" />}
            onClick={() => { baixarCsv('ops-manager-agents.csv', data.agents); toast('Inventário exportado', 'CSV com os agents registrados.', 'success') }}>
            Exportar inventário
          </Button>,
          <Button key="u" variant="primary" leftGlyph={<Icon glyph="ArrowUp" />} onClick={upgradeAll}>Upgrade All</Button>,
        ]} />
      <Grid cols={4} style={{ marginBottom: spacing[600] }}>
        <StatCard label="Total Agents" value={data.agents.length} />
        <StatCard label="Running" value={data.running ?? data.agents.length} />
        <StatCard label="Agent Version" value={data.version} />
        <StatCard label="Latest Available" value={data.latest}
          sub={desatualizados ? <Badge variant="yellow">{desatualizados} desatualizado(s)</Badge> : <Badge variant="green">Tudo atualizado</Badge>} />
      </Grid>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: spacing[400], borderBottom: `1px solid #fdfff5` }}><Subtitle>Agent List</Subtitle></div>
        <DataTable columns={cols} rows={data.agents} />
      </Card>
      <AgentLogsModal open={!!logs} data={logs} onClose={() => setLogs(null)} />
    </div>
  )
}
