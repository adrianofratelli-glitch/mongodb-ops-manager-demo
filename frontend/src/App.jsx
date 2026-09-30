import { useEffect, useState, useCallback, Suspense } from 'react'
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider'
import { ToastProvider, useToast } from '@leafygreen-ui/toast'

import TopBar from './components/TopBar'
import { Loading } from './components/ui'
import Sidebar from './components/Sidebar'
import QueryDetails from './components/QueryDetails'
import { API } from './api/client'
import { PAGES } from './pages'

function Shell() {
  const [section, setSection] = useState('dashboard')
  const [meta, setMeta] = useState({ org: 'MongoDB Brazil', project: 'Production' })
  const [counts, setCounts] = useState({})
  const [lastCall, setLastCall] = useState(null)
  const { pushToast } = useToast()

  const toast = useCallback((title, description = '', variant = 'note') => {
    pushToast({ title, description, variant, timeout: 4000 })
  }, [pushToast])

  const refreshCounts = useCallback(async () => {
    try {
      const [d, a, p] = await Promise.all([API.dashboard(), API.alerts(), API.perfAdvisor()])
      setCounts({
        alerts: d.open_alerts || 0,
        'perf-advisor': p.index_suggestions?.length || 0,
        backup: a ? undefined : undefined,
      })
    } catch (e) { /* backend offline — segue */ }
  }, [])

  useEffect(() => {
    API.meta().then(setMeta).catch(() => {})
    refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    const remember = (event) => setLastCall(event.detail)
    window.addEventListener('ops-manager-api-call', remember)
    return () => window.removeEventListener('ops-manager-api-call', remember)
  }, [])

  const Page = PAGES[section] || PAGES.dashboard

  return (
    <LeafyGreenProvider darkMode>
      <div data-pov-shell className="ops-shell">
        <a className="pov-skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
        <TopBar
          org={meta.org}
          project={meta.project}
          onNewDeployment={() => setSection('deployments')}
          onBell={() => setSection('alerts')}
        />
        <div className="ops-shell__body">
          <Sidebar active={section} onNavigate={setSection} counts={counts} />
          <main id="conteudo-principal" className="ops-main" tabIndex="-1">
            <Suspense fallback={<Loading />}>
              <Page toast={toast} navigate={setSection} refreshCounts={refreshCounts} meta={meta} setMeta={setMeta} />
            </Suspense>
            {lastCall && (
              <QueryDetails
                operation={lastCall.operation}
                namespace="Ops Manager demo control plane"
                query={{ arguments: lastCall.args, mode: lastCall.mode }}
                explain={{
                  elapsed_ms: lastCall.elapsed_ms,
                  error: lastCall.error,
                  note: 'Esta PoV simula a API de controle do Ops Manager; não executa MQL contra dados de aplicação.',
                }}
              />
            )}
          </main>
        </div>
      </div>
    </LeafyGreenProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}
