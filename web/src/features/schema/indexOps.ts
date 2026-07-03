import type {SchemaIndex, SchemaOperation} from '../../api/types'

/** 合并库内索引与未保存的索引变更 */
export function resolveIndexes(base: SchemaIndex[], extra: SchemaOperation[]): SchemaIndex[] {
  let list = [...base]
  for (const op of extra) {
    if (op.kind === 'drop_index' && op.name) {
      list = list.filter((item) => item.name !== op.name)
    }
    if (op.kind === 'add_index' && op.index) {
      list = list.filter((item) => item.name !== op.index!.name)
      list.push(op.index)
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

/** 追加新增索引操作 */
export function appendAddIndex(extra: SchemaOperation[], index: SchemaIndex): SchemaOperation[] {
  const next = extra.filter((op) => !(op.kind === 'add_index' && op.index?.name === index.name))
  return [...next, {kind: 'add_index', index}]
}

/** 编辑索引：库内索引先 drop 再 add，草稿索引仅替换 add */
export function replaceIndex(extra: SchemaOperation[], base: SchemaIndex[], originalName: string, index: SchemaIndex): SchemaOperation[] {
  let next = extra.filter((op) => {
    if (op.kind === 'drop_index' && op.name === originalName) return false
    if (op.kind === 'add_index' && op.index?.name === originalName) return false
    if (op.kind === 'add_index' && op.index?.name === index.name) return false
    return true
  })
  if (base.some((item) => item.name === originalName)) {
    next.push({kind: 'drop_index', name: originalName})
  }
  next.push({kind: 'add_index', index})
  return next
}

/** 删除索引：取消未保存的新增，或对库内索引追加 drop */
export function dropIndexOps(extra: SchemaOperation[], base: SchemaIndex[], name: string): SchemaOperation[] {
  let next = extra.filter((op) => {
    if (op.kind === 'add_index' && op.index?.name === name) return false
    if (op.kind === 'drop_index' && op.name === name) return false
    return true
  })
  if (base.some((item) => item.name === name)) {
    next.push({kind: 'drop_index', name})
  }
  return next
}
