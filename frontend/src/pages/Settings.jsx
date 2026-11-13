import Card from '@leafygreen-ui/card'
import Button from '@leafygreen-ui/button'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'
import ConfirmationModal from '@leafygreen-ui/confirmation-modal'
import { useState } from 'react'
import { spacing } from '@leafygreen-ui/tokens'
import { Description } from '@leafygreen-ui/typography'
import { PageHeader } from '../components/ui'
import { API, errMsg } from '../api/client'

export default function Settings({ toast, navigate, refreshCounts }) {
  const [confirmReset, setConfirmReset] = useState(false)

  const [resetting, setResetting] = useState(false)
  const doReset = async () => {
    setConfirmReset(false)
    if (resetting) return
    setResetting(true)
    try { await API.reset(); refreshCounts?.(); toast('Demo restaurada', 'Estado inicial recarregado.', 'success'); navigate?.('dashboard') }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
    finally { setResetting(false) }
  }

  return (
    <div>
      <PageHeader title="Project Settings" subtitle="Configurações gerais" />
      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[400] }}>
          <Description>Campos ilustrativos, somente leitura nesta simulação. A única ação real desta página é o Reset Demo.</Description>
          <TextInput label="Project Name" value="Production" disabled onChange={() => {}} />
          <TextInput label="Organization" value="MongoDB Brazil" disabled onChange={() => {}} />
          <Select label="Default MongoDB Version" value="8.0" disabled onChange={() => {}} allowDeselect={false}
            description="Séries que o Ops Manager 9.0 gerencia: 7.0, 8.0 e 9.0 (6.0 Deprecated; 5.0 e 4.4 EOL).">
            <Option value="9.0">9.0</Option>
            <Option value="8.0">8.0</Option>
            <Option value="7.0">7.0</Option>
          </Select>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="dangerOutline" disabled={resetting} onClick={() => setConfirmReset(true)}>{resetting ? 'Restaurando…' : 'Reset Demo'}</Button>
          </div>
        </div>
      </Card>

      <ConfirmationModal open={confirmReset} title="Restaurar estado inicial?" buttonText="Reset" variant="danger"
        onConfirm={doReset} onCancel={() => setConfirmReset(false)}>
        Todos os clusters, snapshots, restores, upgrades em andamento, usuários e alertas voltam ao estado inicial (equivale a reiniciar o backend).
      </ConfirmationModal>
    </div>
  )
}
