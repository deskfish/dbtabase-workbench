import {readFileSync, readdirSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {describe, it} from 'vitest'

function productionSources(root: string): string {
  return readdirSync(root).sort().flatMap((name) => {
    const path = join(root, name)
    if (statSync(path).isDirectory()) return productionSources(path)
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) return []
    return [`\n/* ${relative(process.cwd(), path)} */\n${readFileSync(path, 'utf8')}`]
  }).join('')
}

describe('connection architecture', () => {
  it('has exactly one authenticated connection stack', () => {
    const production = productionSources(join(process.cwd(), 'src'))
    for (const forbidden of [
      '/api/registry/personal/',
      '/api/registry/team/',
      'X-User-Nickname',
      "openDB('database-workbench'",
      'syncPersonalConnections',
      'ConnectionSidebar',
      'ProfileDialog',
      'TeamConnectionsDialog',
    ]) {
      if (production.includes(forbidden)) throw new Error(`production source still contains ${forbidden}`)
    }
  })
})
