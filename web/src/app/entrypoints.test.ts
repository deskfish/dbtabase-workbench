import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

describe('application entrypoints', () => {
  it('serves the production application from the prototype compatibility URL', () => {
    const html = readFileSync(`${process.cwd()}/prototype.html`, 'utf8')

    expect(html).toContain('/src/main.tsx')
    expect(html).not.toContain('/src/prototype/main.tsx')
  })

  it('includes both application URLs in production builds', () => {
    const config = readFileSync(`${process.cwd()}/vite.config.ts`, 'utf8')

    expect(config).toContain("index: resolve(__dirname, 'index.html')")
    expect(config).toContain("prototype: resolve(__dirname, 'prototype.html')")
  })
})
