import { describe, expect, it } from 'vitest'
import { buildRedisKeyTree, folderPathForKey } from './redisKeyHierarchy'
import type { RedisKeySummary } from '../../api/types'

function key(name: string, type = 'string'): RedisKeySummary {
  return {key: name, type, ttl: -1}
}

describe('buildRedisKeyTree', () => {
  it('groups keys by colon prefix into folders', () => {
    const tree = buildRedisKeyTree([
      key('wecom:decrypt:service:a'),
      key('wecom:decrypt:service:b'),
      key('wecom:login:token'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({kind: 'folder', name: 'wecom', count: 3})
    const wecom = tree[0]
    if (wecom.kind !== 'folder') throw new Error('expected folder')
    expect(wecom.children.map((node) => node.kind === 'folder' ? node.name : node.item.key)).toEqual(['decrypt', 'login'])
    const decrypt = wecom.children.find((node) => node.kind === 'folder' && node.name === 'decrypt')
    if (!decrypt || decrypt.kind !== 'folder') throw new Error('expected decrypt folder')
    expect(decrypt.count).toBe(2)
  })

  it('keeps keys without separator at the root', () => {
    const tree = buildRedisKeyTree([key('leaderboard'), key('session:abc')])
    expect(tree.map((node) => node.kind === 'folder' ? node.name : node.item.key)).toEqual(['session', 'leaderboard'])
  })

  it('supports a folder that also contains a direct key leaf', () => {
    const tree = buildRedisKeyTree([key('user:42'), key('user:42:profile')])
    const user = tree.find((node) => node.kind === 'folder' && node.name === 'user')
    if (!user || user.kind !== 'folder') throw new Error('expected user folder')
    expect(user.count).toBe(2)
    expect(user.children.some((node) => node.kind === 'key' && node.item.key === 'user:42')).toBe(true)
    const nested = user.children.find((node) => node.kind === 'folder' && node.name === '42')
    expect(nested && nested.kind === 'folder' ? nested.count : 0).toBe(1)
  })
})

describe('folderPathForKey', () => {
  it('returns every folder prefix for a nested key', () => {
    expect(folderPathForKey('channel:user:last_message_type:26')).toEqual([
      'channel',
      'channel:user',
      'channel:user:last_message_type',
    ])
  })

  it('returns an empty list for flat keys', () => {
    expect(folderPathForKey('leaderboard')).toEqual([])
  })
})
