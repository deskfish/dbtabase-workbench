import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it, vi} from 'vitest'
import {TeamConnectionsDialog} from './TeamConnectionsDialog'

it('copies a team connection without import language', async () => {
  const onCopy = vi.fn()
  render(<TeamConnectionsDialog connections={[{id:'t1',name:'Shared DB',driver:'postgres',host:'10.0.0.2',port:5432,database:'app',user:'db',tlsMode:'prefer',sharedBy:'alice'}]} personalConnections={[]} onCopy={onCopy} onClose={()=>{}} />)
  expect(screen.queryByText(/导入|迁移/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button',{name:'复制 Shared DB 到个人'}))
  expect(onCopy).toHaveBeenCalledWith('t1')
})
