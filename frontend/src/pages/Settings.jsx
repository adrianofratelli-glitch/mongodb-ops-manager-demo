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
          <Select label="Default MongoDB Version" value="7.0.5" disabled onChange={() => {}} allowDeselect={false}>
            <Option value="7.0.5">7.0.5</Option>
            <Option value="6.0.12">6.0.12</Option>
            <Option value="5.0.24">5.0.24</Option>
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
