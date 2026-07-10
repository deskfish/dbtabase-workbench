import {FormEvent, useState} from 'react'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {TextField} from '../features/ui/TextField'

export function CreateTeamDialog({
  submitting,
  onCancel,
  onSubmit,
}: {
  submitting: boolean
  onCancel: () => void
  onSubmit: (name: string) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入团队名称')
      return
    }
    setError('')
    await onSubmit(trimmed)
  }

  return (
    <FormDialog
      kicker={false}
      title="新建团队"
      description="创建后可维护成员，共享连接与日志会话。"
      submitLabel="创建团队"
      submitting={submitting}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      <TextField
        label="团队名称"
        autoComplete="organization"
        value={name}
        error={error}
        onChange={(event) => { setError(''); setName(event.target.value) }}
      />
    </FormDialog>
  )
}
