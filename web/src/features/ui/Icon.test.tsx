import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Icon } from './Icon'

it('renders a consistently sized decorative svg', () => {
  const {container} = render(<Icon name="filter" />)
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('aria-hidden', 'true')
  expect(svg).toHaveClass('ui-icon')
})
