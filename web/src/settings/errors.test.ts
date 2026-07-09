import {render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import {settingsErrorMessage} from './errors'
import {AuthAPIError} from '../auth/client'

it('maps last team admin errors to friendly copy', () => {
  const message = settingsErrorMessage(new AuthAPIError(409, 'last_team_admin', '该团队至少需要保留一名管理员'))
  expect(message).toContain('至少需要保留一名管理员')
})

it('maps invalid API errors to friendly copy', () => {
  expect(settingsErrorMessage(new AuthAPIError(400, 'invalid', '请求无效'))).toContain('提交的数据无效')
})
