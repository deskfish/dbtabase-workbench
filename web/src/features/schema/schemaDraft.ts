import type {SchemaColumn, SchemaOperation} from '../../api/types'

export type DraftColumn = SchemaColumn & {originalName?: string; isNew?: boolean}

function columnPayload(column: DraftColumn): SchemaColumn {
  const {originalName: _, isNew: __, ...payload} = column
  return payload
}

export function diffColumns(before: SchemaColumn[], after: DraftColumn[]): SchemaOperation[] {
  const out: SchemaOperation[] = []
  const retained = new Set(after.filter((item) => !item.isNew).map((item) => item.originalName || item.name))

  for (const original of before) {
    if (!retained.has(original.name)) out.push({kind: 'drop_column', name: original.name})
  }

  for (const current of after) {
    if (current.isNew) {
      out.push({kind: 'add_column', column: columnPayload(current)})
      continue
    }

    const originalName = current.originalName || current.name
    const original = before.find((item) => item.name === originalName)
    if (!original) continue

    if (originalName !== current.name) {
      out.push({kind: 'rename_column', name: originalName, newName: current.name})
    }

    if (
      original.type.toLowerCase() !== current.type.toLowerCase()
      || original.nullable !== current.nullable
      || original.default !== current.default
    ) {
      out.push({kind: 'alter_column', column: columnPayload(current)})
    }

    if ((original.comment ?? '') !== (current.comment ?? '')) {
      out.push({kind: 'set_column_comment', column: columnPayload(current)})
    }
  }

  const beforePrimary = before.find((item) => item.primary)?.name
  const afterPrimary = after.find((item) => item.primary)?.name
  if (beforePrimary !== afterPrimary) {
    if (afterPrimary) out.push({kind: 'set_primary', name: afterPrimary})
    else if (beforePrimary) out.push({kind: 'drop_primary'})
  }

  return out.filter((op) => !(op.kind === 'drop_column' && after.some((item) => (item.originalName || item.name) === op.name)))
}
