import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync('src/app/workbench.css', 'utf8')

describe('disconnected database workspace layout', () => {
  it('lets the onboarding state occupy every row below the tab bar', () => {
    expect(stylesheet).toMatch(/\.workspace\.mode-query\.unified-split\s+\.disconnected-home\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*2\s*\/\s*-1;/s)
  })
})
