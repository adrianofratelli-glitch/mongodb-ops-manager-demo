import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import { palette } from '@leafygreen-ui/palette'
import MongoLeaf from './MongoLeaf'

// O que é simulado e quais recusas foram conferidas na documentação oficial (README).
const SIM_RULES_URL = 'https://github.com/adrianofratelli-glitch/mongodb-ops-manager-demo#what-is-simulated-and-which-rules-are-real'

export default function TopBar({ org, project, onNewDeployment, onBell }) {
  return (
    <header
      className="ops-topbar"
      style={{
        height: 66,
        background: palette.black,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        flexShrink: 0,
        borderBottom: `1px solid ${palette.gray.dark2}`,
        zIndex: 5,
      }}
    >
      <div className="ops-topbar__brand" style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#fff' }}>
        <MongoLeaf size={26} />
        <span style={{ fontSize: 15, letterSpacing: '-0.01em' }}>
          <b style={{ fontWeight: 800 }}>MongoDB</b> Ops Manager
        </span>
      </div>

      <div
        className="ops-topbar__context"
        style={{
          display: 'flex', alignItems: 'center', gap: 7, marginLeft: 14,
          color: palette.gray.light1, fontSize: 13,
        }}
      >
        <Icon glyph="Building" fill={palette.gray.light1} size={14} />
        <span>{org || '—'}</span><span aria-hidden="true">/</span><span style={{ color: '#fff', fontWeight: 600 }}>{project || '—'}</span>
      </div>

      <div className="ops-topbar__spacer" style={{ flex: 1 }} />

      <a className="ops-sim-chip" href={SIM_RULES_URL} target="_blank" rel="noreferrer"
        title="Nenhuma ação fala com um Ops Manager real: estado fictício em memória, volta ao inicial com Reset Demo. Clique para ver quais regras foram conferidas na documentação oficial.">
        Simulação · dados fictícios
      </a>

      <span className="ops-automation-state" aria-label="Automation ativa">
        <i aria-hidden="true" />
        Automation active
      </span>

      <Button variant="primary" size="small" leftGlyph={<Icon glyph="Plus" />} onClick={onNewDeployment}>
        New Deployment
      </Button>

      <IconButton aria-label="Alertas" darkMode onClick={onBell}>
        <Icon glyph="Bell" fill="#fff" />
      </IconButton>

      <div
        className="ops-avatar"
        style={{
          width: 32, height: 32, borderRadius: '50%', background: palette.green.dark2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13,
        }}
      >
        A
      </div>
    </header>
  )
}
