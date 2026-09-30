import { lazy } from 'react'
import Dashboard from './Dashboard'
import Placeholder from './Placeholder'
import { ALL_SECTIONS } from '../lib/sections'

// Dashboard entra no bundle inicial (é a primeira tela); o resto é carregado
// sob demanda para o primeiro paint não pagar por 16 páginas.
const READY = {
  dashboard: Dashboard,
  deployments: lazy(() => import('./Deployments')),
  automation: lazy(() => import('./Automation')),
  agents: lazy(() => import('./Agents')),
  metrics: lazy(() => import('./Metrics')),
  'perf-advisor': lazy(() => import('./PerfAdvisor')),
  realtime: lazy(() => import('./Realtime')),
  backup: lazy(() => import('./Backup')),
  restore: lazy(() => import('./Restore')),
  alerts: lazy(() => import('./Alerts')),
  users: lazy(() => import('./Users')),
  roles: lazy(() => import('./Roles')),
  auth: lazy(() => import('./Auth')),
  audit: lazy(() => import('./Audit')),
  activity: lazy(() => import('./Activity')),
  settings: lazy(() => import('./Settings')),
}

export const PAGES = Object.fromEntries(
  ALL_SECTIONS.map((s) => {
    const Comp = READY[s.id]
    if (Comp) return [s.id, Comp]
    const P = (props) => Placeholder({ ...props, title: s.label })
    return [s.id, P]
  }),
)
