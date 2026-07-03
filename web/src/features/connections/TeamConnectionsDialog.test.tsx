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

it('deduplicates the same server connection regardless of default database', async () => {
  render(<TeamConnectionsDialog connections={[
    {id:'t1',name:'10.10.80.122_pg',driver:'postgres',host:'10.10.80.122',port:5432,database:'channelHub',user:'db',tlsMode:'prefer',sharedBy:'孙振东',sharedAt:1},
    {id:'t2',name:'10.10.80.122_pg',driver:'postgres',host:'10.10.80.122',port:5432,database:'flybase',user:'db',tlsMode:'prefer',sharedBy:'小明星',sharedAt:2},
  ]} personalConnections={[]} onCopy={()=>{}} onClose={()=>{}} />)

  expect(screen.getAllByText('10.10.80.122_pg')).toHaveLength(1)
  expect(screen.queryByText('channelHub')).not.toBeInTheDocument()
  expect(screen.queryByText('flybase')).not.toBeInTheDocument()
  expect(screen.getByText('小明星、孙振东')).toBeVisible()
})

it('shows MongoDB and Redis in type filter and table rows', async () => {
  const user = userEvent.setup()
  render(<TeamConnectionsDialog connections={[
    {id:'m1',name:'Mongo Hub',driver:'mongodb',host:'192.168.6.100',port:27017,database:'channel-hub',user:'',tlsMode:'prefer',sharedBy:'alice'},
    {id:'r1',name:'Cache Redis',driver:'redis',host:'192.168.6.100',port:6379,database:'0',user:'',tlsMode:'disabled',sharedBy:'bob'},
    {id:'p1',name:'PG One',driver:'postgres',host:'10.0.0.1',port:5432,database:'app',user:'db',tlsMode:'prefer'},
  ]} personalConnections={[]} onCopy={()=>{}} onClose={()=>{}} />)

  expect(screen.getByText('MongoDB')).toBeVisible()
  expect(screen.getByText('Redis')).toBeVisible()

  await user.click(screen.getByRole('combobox', {name: '连接类型'}))
  expect(screen.getByRole('option', {name: 'MongoDB'})).toBeInTheDocument()
  expect(screen.getByRole('option', {name: 'Redis'})).toBeInTheDocument()

  await user.click(screen.getByRole('option', {name: 'MongoDB'}))
  expect(screen.getByText('Mongo Hub')).toBeVisible()
  expect(screen.queryByText('Cache Redis')).not.toBeInTheDocument()
  expect(screen.queryByText('PG One')).not.toBeInTheDocument()
})
