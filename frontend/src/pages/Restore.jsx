import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Banner from '@leafygreen-ui/banner'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'
import { Subtitle, Body } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'
import { useDarkMode } from '@leafygreen-ui/leafygreen-provider'
import { PageHeader, Grid, DataTable, Loading } from '../components/ui'
import { API, errMsg } from '../api/client'

const STATUS_BADGE = { queued: ['lightgray', '⏳ Queued'], running: ['yellow', '● Running'], completed: ['green', '✓ Completed'] }

// "2024-01-15 08:00" (UTC) → valor aceito por <input type="datetime-local">
const toInput = (ts) => (ts ? ts.replace(' ', 'T').slice(0, 16) : '')

export default function Restore({ toast }) {
  const { darkMode } = useDarkMode()
  const [loadError, setLoadError] = useState(false)
  const [clusters, setClusters] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [windows, setWindows] = useState(null)
  const [cluster, setCluster] = useState('')
  const [point, setPoint] = useState('')
  const [target, setTarget] = useState('same')
  const [busy, setBusy] = useState(false)

  const reloadJobs = () => API.restoreJobs().then(setJobs).catch(() => setLoadError(true))
  const reload = () => {
    API.clusters().then((cs) => { setClusters(cs); if (cs.length) setCluster((c) => c || cs[0].name) }).catch(() => setLoadError(true))
    API.backup().then((b) => setWindows(b.pit_windows || {})).catch(() => setLoadError(true))
    reloadJobs()
  }
  const win = windows?.[cluster]
  // Ponto padrão = fim da janela de PIT do cluster escolhido (o mais recente recuperável).
  useEffect(() => { setPoint(toInput(win?.to)); setTarget('same') }, [cluster, win?.to])
  useEffect(() => { reload() }, [])

  // Enquanto um job estiver queued/running, a tabela se atualiza sozinha —
  // mesmo padrão do resync de nó em Deployments.jsx.
  const emAndamento = Array.isArray(jobs) && jobs.some((j) => j.status !== 'completed')
  useEffect(() => {
    if (!emAndamento) return
    const id = setInterval(reloadJobs, 2000)
    return () => clearInterval(id)
  }, [emAndamento])

  const start = async () => {
    if (!cluster) { toast('Validação', 'Selecione um cluster de origem.', 'warning'); return }
    if (busy) return
    setBusy(true)
    try {
      await API.startRestore({ cluster, point, target })
      toast('Restore iniciado', `Point-in-time recovery de ${cluster} em andamento (simulado)…`, 'success')
      reloadJobs()
    } catch (e) { toast('Erro', errMsg(e), 'warning') }
    finally { setBusy(false) }
  }

  const cols = [
    { header: 'Job ID', render: (r) => <code>{r.id}</code> },
    { header: 'Cluster', key: 'cluster' },
    { header: 'Type', render: (r) => <Badge variant={r.type === 'PIT' ? 'blue' : 'lightgray'}>{r.type}</Badge> },
    { header: 'Restore Point', key: 'point' },
    { header: 'Target', key: 'target' },
    { header: 'Status', render: (r) => { const [v, l] = STATUS_BADGE[r.status] || STATUS_BADGE.queued; return <Badge variant={v}>{l}</Badge> } },
    { header: 'Started', key: 'started' },
  ]

  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={() => { setLoadError(false); reload() }}>Tentar novamente</Button></div>
  if (!clusters || !jobs || !windows) return <Loading />
  const source = clusters.find((c) => c.name === cluster)
  const noBackup = !win
  const why = !source ? 'Nenhum cluster no projeto.' : source.type === 'standalone'
    ? 'Standalone não tem oplog, então não há backup contínuo nem PIT; converta em replica set de um membro para habilitar.'
    : 'Este cluster ainda não tem snapshot. Faça um em Backup → Take Snapshot.'

  return (
    <div>
      <PageHeader title="Restore" subtitle="Point-in-time & snapshot restore" />
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: spacing[600] }}>
        <div style={{ padding: spacing[400], borderBottom: `1px solid #fdfff5` }}><Subtitle>Restore Jobs</Subtitle></div>
        <DataTable columns={cols} rows={jobs} />
      </Card>
      <Card>
        <Subtitle style={{ marginBottom: spacing[400] }}>🕐 Point-in-Time Recovery</Subtitle>
        <Grid cols={2} gap={spacing[500]}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[300] }}>
            <Select label="Source Cluster" value={cluster} onChange={setCluster} allowDeselect={false}>
              {clusters.map((c) => <Option key={c.id} value={c.name}>{c.name}</Option>)}
            </Select>
            <TextInput label="Restore Point (UTC)" type="datetime-local" value={point} disabled={noBackup}
              min={toInput(win?.from)} max={toInput(win?.to)} onChange={(e) => setPoint(e.target.value)} />
            <Select label="Restore Target" value={target} onChange={setTarget} allowDeselect={false}>
              <Option value="same">Restore to same cluster</Option>
              {clusters.filter((c) => c.name !== cluster && c.type === source?.type).map((c) => <Option key={c.id} value={c.name}>Restore to {c.name}</Option>)}
              <Option value="download">Download as tar.gz</Option>
            </Select>
            {noBackup
              ? <Banner variant="warning">{why}</Banner>
              : <Banner variant="info">Janela de PIT de <b>{cluster}</b>: <b>{win.from} → {win.to} UTC</b> (do snapshot retido mais antigo ao mais recente). Simulação: o job evolui em memória (queued → running → completed) em ~9 s.</Banner>}
            <Button variant="primary" disabled={busy || noBackup} onClick={start}>{busy ? 'Iniciando…' : 'Start Point-in-Time Restore'}</Button>
          </div>
          <div>
            <Body style={{ marginBottom: 10, fontWeight: 600 }}>Oplog Coverage Timeline</Body>
            <div style={{ background: darkMode ? palette.gray.dark3 : palette.gray.light3, borderRadius: 6, padding: 16, height: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.gray.base, marginBottom: 6 }}>
                <span>{win ? win.from : '—'}</span><span>{win ? win.to : '—'}</span>
              </div>
              <div style={{ height: 20, background: win ? `linear-gradient(90deg, ${palette.green.base}, ${palette.green.dark1})` : palette.gray.dark1, borderRadius: 4 }} />
              <Body style={{ fontSize: 12, color: palette.gray.base, marginTop: 14 }}>
                {win ? <><b>{win.snapshots} snapshot(s)</b> de {cluster} · mais recente {win.to} UTC · {win.latest_size} (simulado)</> : 'Sem snapshot: nada a restaurar.'}
              </Body>
            </div>
          </div>
        </Grid>
      </Card>
    </div>
  )
}
