import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ResultGrid } from './ResultGrid'

it('renders null values distinctly from empty strings', () => {
  render(<ResultGrid columns={[{name:'value'}]} rows={[[null], ['']]} />)
  expect(screen.getByText('NULL')).toBeVisible()
  expect(screen.getByLabelText('空字符串')).toBeVisible()
})
