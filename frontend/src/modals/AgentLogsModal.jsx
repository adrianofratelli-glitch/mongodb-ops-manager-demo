import Modal from '@leafygreen-ui/modal'
import Badge from '@leafygreen-ui/badge'
import { H3, Body } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'

const LEVEL = { INFO: 'lightgray', WARN: 'yellow', ERROR: 'red' }

// Últimas linhas do log do agent — mesmo formato do mongodb-mms-automation-agent.log
export default function AgentLogsModal({ open, data, onClose }) {
  return (
    <Modal open={open} setOpen={onClose} size="large">
      <H3 style={{ marginBottom: spacing[200] }}>Agent logs</H3>
      {data && (
        <>
          <Body style={{ color: palette.gray.base, marginBottom: spacing[300] }}>
            {data.host} · cluster {data.cluster} · agent {data.version}
          </Body>
          <div style={{ background: '#001923', borderRadius: 8, padding: spacing[300], maxHeight: 380, overflowY: 'auto' }}>
            {data.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0', fontSize: 12.5 }}>
                <code style={{ color: palette.gray.light1 }}>{l.ts}</code>
                <Badge variant={LEVEL[l.level] || 'lightgray'}>{l.level}</Badge>
                <span style={{ color: palette.gray.light2 }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
