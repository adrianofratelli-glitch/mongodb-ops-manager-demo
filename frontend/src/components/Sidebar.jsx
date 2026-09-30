import { SideNav, SideNavItem, SideNavGroup } from '@leafygreen-ui/side-nav'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import { SECTIONS } from '../lib/sections'

export default function Sidebar({ active, onNavigate, counts = {} }) {
  const selected = SECTIONS.find((group) => group.items.some((item) => item.id === active)) || SECTIONS[0]
  return (
    <aside className="ops-sidebar">
      <label style={{ display: 'block', padding: 12 }}>
        Área operacional
        <select aria-label="Área operacional" value={selected.group}
          style={{ width: '100%', marginTop: 8, padding: 8, color: 'inherit', background: 'var(--bg-card, #112733)' }}
          onChange={(event) => onNavigate(SECTIONS.find((group) => group.group === event.target.value).items[0].id)}>
          {SECTIONS.map((group) => <option key={group.group}>{group.group}</option>)}
        </select>
      </label>
      <SideNav aria-label="Navegação do Ops Manager" widthOverride={232}>
        {[selected].map((group) => (
          <SideNavGroup key={group.group} header={group.group}>
            {group.items.map((item) => {
              const badge = counts[item.id]
              return (
                <SideNavItem
                  key={item.id}
                  active={active === item.id}
                  aria-current={active === item.id ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                  glyph={<Icon glyph={item.glyph} />}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    {item.label}
                    {badge ? (
                      <Badge variant={item.id === 'alerts' ? 'red' : 'yellow'} style={{ marginLeft: 8 }}>
                        {badge}
                      </Badge>
                    ) : null}
                  </span>
                </SideNavItem>
              )
            })}
          </SideNavGroup>
        ))}
      </SideNav>
    </aside>
  )
}
