import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { Subtitle, Body, Description } from '@leafygreen-ui/typography'
import ConfirmationModal from '@leafygreen-ui/confirmation-modal'
import { palette } from '@leafygreen-ui/palette'
import { spacing } from '@leafygreen-ui/tokens'
import { useDarkMode } from '@leafygreen-ui/leafygreen-provider'
import { PageHeader, DataTable, MetaRow, Loading, EmptyState } from '../components/ui'
import NewDeploymentModal from '../modals/NewDeploymentModal'
import ConnectModal from '../modals/ConnectModal'
import { API, errMsg } from '../api/client'

const TYPE_BADGE = { rs: ['blue', 'Replica Set'], sharded: ['green', 'Sharded Cluster'], standalone: ['yellow', 'Standalone'] }
// Próximo patch da mesma release series (ex.: 7.0.5 → 7.0.6): o caminho seguro
// que o Ops Manager oferece por padrão. Saltos de release series ficam para o backend validar.
const nextPatch = (v) => { const [a, b, c] = String(v).split('-')[0].split('.').map(Number); return `${a}.${b}.${(c || 0) + 1}` }

const STATUS_BADGE = { healthy: ['green', '● Healthy'], warning: ['yellow', '● Warning'], critical: ['red', '● Critical'] }

function DiskBar({ pct }) {
  const { darkMode } = useDarkMode()
  if (!pct) return <span>—</span>
  const color = pct > 85 ? palette.red.base : pct > 70 ? palette.yellow.dark2 : palette.green.dark1
  const track = darkMode ? palette.gray.dark1 : palette.gray.light2
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 80, height: 8, borderRadius: 4, background: track, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
      </span>
      <span style={{ fontSize: 12, color }}>{pct}%</span>
    </span>
  )
}

function ClusterBlock({ c, toast, reload }) {
  const { darkMode } = useDarkMode()
  const headerBg = darkMode ? palette.gray.dark3 : palette.gray.light3
  const [tb, tl] = TYPE_BADGE[c.type] || TYPE_BADGE.rs
  const [sb, sl] = STATUS_BADGE[c.status] || STATUS_BADGE.healthy
  const [confirmTerminate, setConfirmTerminate] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const upgrading = !!c.upgrade
  const target = nextPatch(c.version)

  const doAction = async (fn, msg) => {
    setBusy(true)
    try { await fn(); toast(msg, '', 'success'); reload() }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
    finally { setBusy(false) }
  }

  const columns = [
    { header: 'Status', render: (n) => <Badge variant={n.status === 'green' ? 'green' : n.status === 'yellow' ? 'yellow' : 'red'}>● {n.status === 'green' ? 'Online' : n.status === 'yellow' ? 'Warning' : 'Offline'}</Badge> },
    { header: 'Host', render: (n) => <b>{n.host}</b> },
    { header: 'Role', render: (n) => (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <Badge variant={n.role.includes('PRIMARY') ? 'blue' : 'lightgray'}>{n.role}</Badge>
        {n.state && <Badge variant="yellow">{n.state}</Badge>}
      </span>
    ) },
    { header: 'Version', key: 'version' },
    { header: 'Uptime', key: 'uptime' },
    { header: 'Conn', key: 'conn' },
    { header: 'Disk', render: (n) => <DiskBar pct={n.disk} /> },
    { header: 'Lag', key: 'lag' },
    { header: 'Actions', render: (n, i) => (
      n.role === 'PRIMARY'
        ? <Button size="xsmall" disabled={busy || upgrading} onClick={() => doAction(() => API.stepDown(c.id, i), `Nova eleição em ${c.name}`)}>Step Down</Button>
        : n.role === 'SECONDARY'
          ? <Button size="xsmall" disabled={busy || upgrading || !!n.resync_until}
              onClick={() => doAction(() => API.resyncNode(c.id, i), `Initial sync iniciado em ${n.host}`)}>
              {n.resync_until ? 'Sincronizando…' : 'Resync'}
            </Button>
          : <Description>—</Description>
    ) },
  ]

  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: spacing[400] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${spacing[300]}px ${spacing[400]}px`, background: headerBg, borderBottom: `1px solid ${palette.gray.light2}`, flexWrap: 'wrap' }}>
        <Badge variant={tb}>{tl}</Badge>
        <Subtitle style={{ fontSize: 15 }}>{c.name}</Subtitle>
        <Badge variant={sb}>{sl}</Badge>
        <Description style={{ marginLeft: 8 }}>MongoDB {c.version} · {c.nodes.length} node{c.nodes.length > 1 ? 's' : ''}</Description>
        {upgrading && (
          <Badge variant="blue" aria-live="polite">
            Rolling upgrade → {c.upgrade.target}: {c.upgrade.done}/{c.upgrade.total} processos (simulado)
          </Badge>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="xsmall" variant="primary" leftGlyph={<Icon glyph="Connect" />} onClick={() => setConnectOpen(true)}>Connect</Button>
          {c.type === 'rs' && <Button size="xsmall" leftGlyph={<Icon glyph="Plus" />} onClick={() => doAction(() => API.addNode(c.id, {}), `Nó adicionado a ${c.name}`)} disabled={busy || upgrading}>Add Node</Button>}
          <Button size="xsmall" leftGlyph={<Icon glyph="ArrowUp" />}
            onClick={() => doAction(() => API.upgradeCluster(c.id, { target_version: target }), `Rolling upgrade de ${c.name} para ${target} iniciado`)}
            disabled={busy || upgrading}>
            {upgrading ? 'Upgrade em andamento…' : `Upgrade → ${target}`}
          </Button>
          <Button size="xsmall" variant="dangerOutline" leftGlyph={<Icon glyph="Stop" />} onClick={() => setConfirmTerminate(true)}>Terminate</Button>
        </div>
      </div>
      <div style={{ padding: spacing[200] }}>
        <DataTable columns={columns} rows={c.nodes} />
      </div>
      <div style={{ padding: `${spacing[200]}px ${spacing[400]}px`, borderTop: `1px solid ${palette.gray.light2}` }}>
        <MetaRow items={[
          { label: 'Auth', value: 'SCRAM-SHA-256' }, { label: 'TLS', value: 'Enabled' },
          { label: 'Encryption', value: 'AES-256' },
          { label: 'Backup', value: c.type === 'standalone' ? 'Não suportado (standalone)' : 'Active' },
        ]} />
      </div>

      <ConfirmationModal open={confirmTerminate} title={`Terminate ${c.name}?`} buttonText="Terminate"
        variant="danger" requiredInputText={c.name}
        onConfirm={() => { setConfirmTerminate(false); doAction(() => API.deleteCluster(c.id), `${c.name} terminado`) }}
        onCancel={() => setConfirmTerminate(false)}>
        Todos os dados serão perdidos. Digite <b>{c.name}</b> para confirmar.
      </ConfirmationModal>

      <ConnectModal open={connectOpen} cluster={c} onClose={() => setConnectOpen(false)} toast={toast} />
    </Card>
  )
}

export default function Deployments({ toast, refreshCounts }) {
  const [loadError, setLoadError] = useState(false)
  const [clusters, setClusters] = useState(null)
  const [newOpen, setNewOpen] = useState(false)

  const reload = () => API.clusters().then(setClusters).then(() => refreshCounts?.()).catch(() => setLoadError(true))
  useEffect(() => { reload() }, [])

  // Enquanto algum nó estiver em initial sync ou rolling upgrade, a tabela se atualiza sozinha
  // (só com a aba visível, sem sobrepor requisições).
  const sincronizando = Array.isArray(clusters) && clusters.some((c) => c.upgrade || c.nodes.some((n) => n.resync_until))
  useEffect(() => {
    if (!sincronizando) return
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') reload() }, 3000)
    return () => clearInterval(id)
  }, [sincronizando])

  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={() => { setLoadError(false); reload() }}>Tentar novamente</Button></div>
  if (clusters === null) return <Loading />
  const empty = clusters.length === 0

  return (
    <div>
      <PageHeader title="All Clusters" subtitle={`${clusters.length} deployments · Project: Production`}
        actions={[<Button key="n" variant="primary" leftGlyph={<Icon glyph="Plus" />} onClick={() => setNewOpen(true)}>New Deployment</Button>]} />
      {empty && (
        <EmptyState title="Nenhum deployment neste projeto">
          Todos os clusters foram terminados. Crie um em <b>New Deployment</b> ou use <b>Project Settings → Reset Demo</b> para voltar ao estado inicial.
        </EmptyState>
      )}
      {clusters.map((c) => <ClusterBlock key={c.id} c={c} toast={toast} reload={reload} />)}
      <NewDeploymentModal open={newOpen} onClose={() => setNewOpen(false)} toast={toast} onCreated={reload} />
    </div>
  )
}
