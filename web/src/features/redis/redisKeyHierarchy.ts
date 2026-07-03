import type { RedisKeySummary } from '../../api/types'

export type RedisKeyFolderNode = {
  kind: 'folder'
  name: string
  prefix: string
  count: number
  children: RedisKeyTreeNode[]
}

export type RedisKeyLeafNode = {
  kind: 'key'
  item: RedisKeySummary
  displayName: string
}

export type RedisKeyTreeNode = RedisKeyFolderNode | RedisKeyLeafNode

type InternalNode = {
  name: string
  prefix: string
  folders: Map<string, InternalNode>
  keys: RedisKeySummary[]
}

function countKeys(node: InternalNode): number {
  let total = node.keys.length
  for (const child of node.folders.values()) total += countKeys(child)
  return total
}

function insertKey(node: InternalNode, item: RedisKeySummary, parts: string[], prefixParts: string[], separator: string) {
  if (parts.length === 1) {
    node.keys.push(item)
    return
  }
  const [head, ...rest] = parts
  const childPrefix = [...prefixParts, head].join(separator)
  let child = node.folders.get(head)
  if (!child) {
    child = {name: head, prefix: childPrefix, folders: new Map(), keys: []}
    node.folders.set(head, child)
  }
  insertKey(child, item, rest, [...prefixParts, head], separator)
}

function toTreeNodes(node: InternalNode, separator: string): RedisKeyTreeNode[] {
  const result: RedisKeyTreeNode[] = []
  const folders = [...node.folders.values()].sort((left, right) => left.name.localeCompare(right.name))
  for (const folder of folders) {
    result.push({
      kind: 'folder',
      name: folder.name,
      prefix: folder.prefix,
      count: countKeys(folder),
      children: toTreeNodes(folder, separator),
    })
  }
  const keys = [...node.keys].sort((left, right) => left.key.localeCompare(right.key))
  for (const item of keys) {
    const displayName = item.key.includes(separator)
      ? item.key.slice(item.key.lastIndexOf(separator) + 1)
      : item.key
    result.push({kind: 'key', item, displayName})
  }
  return result
}

export function buildRedisKeyTree(keys: RedisKeySummary[], separator = ':'): RedisKeyTreeNode[] {
  const root: InternalNode = {name: '', prefix: '', folders: new Map(), keys: []}
  for (const item of keys) insertKey(root, item, item.key.split(separator), [], separator)
  return toTreeNodes(root, separator)
}

export function folderPathForKey(key: string, separator = ':'): string[] {
  const parts = key.split(separator)
  if (parts.length <= 1) return []
  const prefixes: string[] = []
  for (let index = 0; index < parts.length - 1; index += 1) {
    prefixes.push(parts.slice(0, index + 1).join(separator))
  }
  return prefixes
}
