import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ObjectTree } from './ObjectTree'

it('groups columns beneath their table with accessible tree roles', () => {
  render(<ObjectTree objects={[
    {kind:'table', schema:'public', name:'people'},
    {kind:'column', schema:'public', parent:'people', name:'id', dataType:'integer'},
  ]} />)
  expect(screen.getByRole('tree')).toBeVisible()
  expect(screen.getByRole('treeitem', {name:/people/})).toBeVisible()
  expect(screen.getByText(/id/)).toBeVisible()
})
