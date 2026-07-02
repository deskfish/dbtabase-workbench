import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it, vi} from 'vitest'
import {TeamConnectionsDialog} from './TeamConnectionsDialog'

it('copies a team connection without import language', async () => {
  const onCopy = vi.fn()
  render(<TeamConnectionsDialog connections={[{id:'t1',name:'Shared DB',driver:'postgres',host:'10.0.0.2',port:5432,database:'app',user:'db',tlsMode:'prefer',sharedBy:'alice'}]} personalConnections={[]} onCopy={onCopy} onClose={()=>{}} />)
  expect(screen.queryByText(/导入|迁移/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox',{name:'选择 Shared DB'}))
  await userEvent.click(screen.getByRole('button',{name:'复制选中（1）'}))
  expect(onCopy).toHaveBeenCalledWith('t1')
})

it('filters by database type and copies multiple selected connections', async () => {
  const user = userEvent.setup()
  const onCopy = vi.fn()
  render(<TeamConnectionsDialog connections={[
    {id:'p1',name:'PG One',driver:'postgres',host:'10.0.0.1',port:5432,database:'app',user:'db',tlsMode:'prefer'},
    {id:'p2',name:'PG Two',driver:'postgres',host:'10.0.0.2',port:5432,database:'app',user:'db',tlsMode:'prefer'},
    {id:'m1',name:'MySQL One',driver:'mysql',host:'10.0.0.3',port:3306,database:'app',user:'db',tlsMode:'prefer'},
  ]} personalConnections={[]} onCopy={onCopy} onClose={()=>{}} />)

  await user.click(screen.getByRole('combobox',{name:'连接类型'}))
  await user.click(screen.getByRole('option',{name:'PostgreSQL'}))
  expect(screen.queryByText('MySQL One')).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox',{name:'选择全部可复制连接'}))
  await user.click(screen.getByRole('button',{name:'复制选中（2）'}))
  expect(onCopy).toHaveBeenNthCalledWith(1, 'p1')
  expect(onCopy).toHaveBeenNthCalledWith(2, 'p2')
})
