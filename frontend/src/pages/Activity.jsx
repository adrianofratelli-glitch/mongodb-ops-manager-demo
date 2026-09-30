import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { spacing } from '@leafygreen-ui/tokens'
import { PageHeader, DataTable, Loading } from '../components/ui'
import { API } from '../api/client'
import { baixarCsv } from '../lib/csv'

export default function Activity({ toast }) {
  const [loadError, setLoadError] = useState(false)
  const reload = () => API.activity().then(data => { setEvents(data); setLoadError(false) }).catch(() => setLoadError(true))
  const [events, setEvents] = useState(null)
  // O feed é o registro das ações da demo: revalida ao voltar para a aba.
  useEffect(() => {
    const carregar = reload
    carregar()
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [])
  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={reload}>Tentar novamente</Button></div>
  if (!events) return <Loading />

  const cols = [
    { header: 'Time', key: 'time' },
    { header: 'User', key: 'user' },
    { header: 'Action', render: (r) => <Badge variant="blue">{r.action}</Badge> },
    { header: 'Resource', render: (r) => <b>{r.resource}</b> },
    { header: 'Details', key: 'details' },
  ]
  return (
    <div>
      <PageHeader title="Activity Feed" subtitle="All project events"
        actions={[<Button key="e" leftGlyph={<Icon glyph="Export" />} onClick={() => { baixarCsv('ops-manager-activity.csv', events, ['time', 'user', 'action', 'resource', 'details']); toast('Feed exportado', `${events.length} eventos em CSV.`, 'success') }}>Export CSV</Button>]} />
      <Card style={{ padding: 0, overflow: 'hidden' }}><DataTable columns={cols} rows={events} /></Card>
    </div>
  )
}
