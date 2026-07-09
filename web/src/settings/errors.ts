import {AuthAPIError} from '../auth/client'

const codeMessages: Record<string, string> = {
  last_team_admin: '该团队至少需要保留一名管理员。请先指定其他成员为管理员，再执行此操作。',
  last_system_admin: '系统至少需要保留一名未禁用的管理员。请先提升其他用户或启用其他管理员账号。',
  forbidden: '你没有权限执行此操作。',
  conflict: '操作发生冲突，可能是记录已存在或状态不允许变更。',
  invalid: '提交的数据无效，请检查表单后重试。',
  not_found: '目标记录不存在，可能已被删除。',
}

export function settingsErrorMessage(error: unknown): string {
  if (error instanceof AuthAPIError) {
    return codeMessages[error.code] ?? error.message
  }
  return error instanceof Error ? error.message : '请求失败'
}
