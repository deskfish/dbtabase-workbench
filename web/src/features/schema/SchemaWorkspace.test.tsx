import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect,it,vi} from 'vitest'
import {SchemaWorkspace} from './SchemaWorkspace'

function renderSchema(){
  const api={
    tableDetail:vi.fn().mockResolvedValue({table:{schema:'public',name:'people',columns:[{name:'id',type:'integer',nullable:false,primary:true}],indexes:[],foreignKeys:[]},capabilities:{schemaEdit:true,indexEdit:true,foreignKeyEdit:true,transactionalDDL:true},permissions:[]}),
    previewSchema:vi.fn().mockResolvedValue({statements:[{sql:'ALTER TABLE people RENAME COLUMN id TO person_id'}],risks:[],fingerprint:'f',token:'t',expiresAt:1}),
    executeSchema:vi.fn(),
  }
  return render(<SchemaWorkspace api={api as never} connectionId="c" schema="public" table="people" driver="postgres" onSaved={()=>{}}/>)
}

it('starts read-only and enters edit mode explicitly',async()=>{
  renderSchema()
  expect(await screen.findByText('id')).toBeVisible()
  expect(screen.queryByRole('textbox',{name:'字段名 1'})).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button',{name:'编辑结构'}))
  expect(screen.getByRole('textbox',{name:'字段名 1'})).toBeVisible()
})

it('discards draft changes and returns to read-only mode',async()=>{
  renderSchema()
  await userEvent.click(await screen.findByRole('button',{name:'编辑结构'}))
  const input=screen.getByRole('textbox',{name:'字段名 1'})
  await userEvent.clear(input);await userEvent.type(input,'person_id')
  expect(screen.getByText(/已修改 \d+ 项/)).toBeVisible()
  await userEvent.click(screen.getByRole('button',{name:'放弃'}))
  expect(screen.queryByRole('textbox',{name:'字段名 1'})).not.toBeInTheDocument()
  expect(screen.getByText('id')).toBeVisible()
})
