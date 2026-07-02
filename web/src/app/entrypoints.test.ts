import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

describe('application entrypoints', () => {
  it('does not use native selects in production source', () => {
    const sourceRoot = join(process.cwd(), 'src')
    const files: string[] = []
    const visit = (directory: string) => readdirSync(directory, {withFileTypes: true}).forEach((entry) => {
      if (entry.name === 'prototype') return
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name.endsWith('.tsx')) files.push(path)
    })
    visit(sourceRoot)

    const offenders = files.filter((path) => readFileSync(path, 'utf8').includes('<select'))
    expect(offenders.map((path) => path.replace(`${process.cwd()}/`, ''))).toEqual([])
  })

  it('keeps only the production application entrypoint', () => {
    const config = readFileSync(`${process.cwd()}/vite.config.ts`, 'utf8')

    expect(existsSync(`${process.cwd()}/prototype.html`)).toBe(false)
    const prototypeSource = `${process.cwd()}/src/prototype`
    expect(existsSync(prototypeSource) && readdirSync(prototypeSource, {recursive: true, withFileTypes: true}).some((entry) => entry.isFile())).toBe(false)
    expect(config).not.toContain('prototype.html')
  })
})
