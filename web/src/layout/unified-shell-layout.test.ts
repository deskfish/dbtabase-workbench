import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync('src/layout/unified-shell.css', 'utf8')
const tokens = readFileSync('src/app/tokens.css', 'utf8')

describe('engineering terminal layout', () => {
  it('defines the approved five-region desktop geometry', () => {
    expect(stylesheet).toMatch(/--terminal-runtime:\s*52px/)
    expect(stylesheet).toMatch(/--terminal-resource:\s*248px/)
    expect(stylesheet).toMatch(/--terminal-context:\s*264px/)
    expect(stylesheet).toContain('"runtime runtime runtime" "resources work context" "status status status"')
  })

  it('provides the mobile drawer breakpoint and dark engineering defaults', () => {
    expect(stylesheet).toMatch(/@media\(max-width:767px\)/)
    expect(stylesheet).toMatch(/min-height:44px/)
    expect(tokens).toMatch(/--bg:\s*#090d11/)
    expect(tokens).toMatch(/--accent:\s*#43d6a2/)
  })
})
