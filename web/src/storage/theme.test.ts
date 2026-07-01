import { beforeEach, expect, it } from 'vitest'
import { applyTheme, getTheme, saveTheme } from './theme'

beforeEach(() => localStorage.clear())

it('保存并读取界面配色', () => {
  saveTheme('light')
  expect(getTheme()).toBe('light')
})

it('应用配色到 document', () => {
  applyTheme('paper')
  expect(document.documentElement.dataset.theme).toBe('paper')
})
