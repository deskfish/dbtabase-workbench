import { beforeEach, describe, expect, it } from 'vitest'
import { clearProfile, getProfile, saveProfile } from './profile'

describe('profile', () => {
  beforeEach(() => localStorage.clear())

  it('保存并读取昵称', () => {
    saveProfile({nickname: '  小明  '})
    expect(getProfile()).toEqual({nickname: '小明'})
  })

  it('clears stored profile', () => {
    saveProfile({nickname: '小明'})
    clearProfile()
    expect(getProfile()).toBeNull()
  })
})
