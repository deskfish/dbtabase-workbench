import { useMemo, useState } from 'react'
import type { DataSection } from './DataWorkspace'
import { PrototypeIcon } from './PrototypeIcon'

type Field={name:string;type:string;length:string;primary:boolean;nullable:boolean;defaultValue:string;comment:string}
const initialFields:Field[]=[
  {name:'id',type:'INT8',length:'—',primary:true,nullable:false,defaultValue:'—',comment:'主键 ID'},
  {name:'request_client_id',type:'VARCHAR',length:'128',primary:false,nullable:false,defaultValue:'—',comment:'客户端请求 ID'},
  {name:'request_message_ids',type:'TEXT',length:'—',primary:false,nullable:false,defaultValue:'—',comment:'请求消息 ID 列表'},
  {name:'union_msg_id',type:'VARCHAR',length:'64',primary:false,nullable:false,defaultValue:'—',comment:'统一消息 ID'},
  {name:'request_texts',type:'TEXT',length:'—',primary:false,nullable:true,defaultValue:'—',comment:'用户请求文本'},
  {name:'response_text',type:'TEXT',length:'—',primary:false,nullable:true,defaultValue:'—',comment:'AI 响应文本'},
  {name:'media_data',type:'TEXT',length:'—',primary:false,nullable:true,defaultValue:'—',comment:'媒体数据 JSON'},
  {name:'message_status',type:'INT2',length:'—',primary:false,nullable:false,defaultValue:'0',comment:'消息状态'},
  {name:'process_status',type:'INT2',length:'—',primary:false,nullable:false,defaultValue:'0',comment:'处理状态'},
  {name:'created_time',type:'TIMESTAMPTZ',length:'—',primary:false,nullable:false,defaultValue:'',comment:'创建时间'},
]
const sections:{id:DataSection;label:string}[]=[{id:'data',label:'数据预览'},{id:'schema',label:'字段结构'},{id:'indexes',label:'索引'},{id:'relations',label:'关系'},{id:'permissions',label:'权限'},{id:'ddl',label:'DDL'}]

export function SchemaWorkspace({table,activeSection,onSectionChange}:{table:string;activeSection:DataSection;onSectionChange:(section:DataSection)=>void}){
  const [fields,setFields]=useState(initialFields)
  const [notice,setNotice]=useState('')
  const dirty=useMemo(()=>fields.filter((field,index)=>JSON.stringify(field)!==JSON.stringify(initialFields[index])).length,[fields])
  const created=fields.find(field=>field.name==='created_time')!
  const ddl=dirty?`ALTER TABLE public.${table}\n  ALTER COLUMN created_time\n  SET DEFAULT ${created.defaultValue||'NULL'};`:`-- 修改字段后在这里预览 SQL`
  function update(index:number,patch:Partial<Field>){setFields(current=>current.map((field,fieldIndex)=>fieldIndex===index?{...field,...patch}:field))}
  return <section className="proto-schema-workspace">
    <header className="proto-table-identity proto-schema-identity">
      <div className="proto-table-title"><PrototypeIcon name="table"/><strong>public.{table}</strong><span>表 / PostgreSQL Table</span></div>
      <div className="proto-table-facts"><b>12,568 行</b><b>18 字段</b><b>主键&nbsp; id</b><b>最近刷新&nbsp; 186 ms</b></div>
      <span className="proto-toolbar-spacer"/>{dirty>0&&<strong className="proto-dirty">有 {dirty} 项未保存修改</strong>}
      <button onClick={()=>setFields(initialFields)}>重置</button><button onClick={()=>setNotice('SQL 预览已更新')}>预览 SQL</button><button className="proto-primary" disabled={!dirty} onClick={()=>setNotice('原型：修改已保存')}>保存修改</button>
    </header>
    <nav className="proto-section-tabs" aria-label="表工作区">{sections.map(section=><button key={section.id} role="tab" aria-selected={activeSection===section.id} className={activeSection===section.id?'active':''} onClick={()=>onSectionChange(section.id)}>{section.label}</button>)}</nav>
    <div className="proto-schema-toolbar"><button className="proto-primary" onClick={()=>setFields(current=>[...current,{name:'new_column',type:'VARCHAR',length:'255',primary:false,nullable:true,defaultValue:'',comment:''}])}><PrototypeIcon name="plus"/>新增字段</button><button><PrototypeIcon name="edit"/>批量编辑</button><button><PrototypeIcon name="download"/>导入字段</button><label className="proto-inline-search"><PrototypeIcon name="search"/><input placeholder="搜索字段" aria-label="搜索字段"/></label><span className="proto-toolbar-spacer"/><button><PrototypeIcon name="settings"/>列设置</button></div>
    <div className="proto-schema-body">
      <div className="proto-fields-pane">
        {activeSection==='schema'?<div className="proto-fields-grid">
          <div className="proto-field-row head"><span>#</span><span>字段名</span><span>数据类型</span><span>长度</span><span>主键</span><span>非空</span><span>默认值</span><span>注释</span><span>操作</span></div>
          {fields.map((field,index)=><div className={`proto-field-row ${JSON.stringify(field)!==JSON.stringify(initialFields[index])?'changed':''}`} key={`${field.name}-${index}`}><span>{index+1}</span><input value={field.name} aria-label={`字段 ${field.name} 名称`} onChange={event=>update(index,{name:event.target.value})}/><select value={field.type} aria-label={`字段 ${field.name} 类型`} onChange={event=>update(index,{type:event.target.value})}><option>INT8</option><option>INT2</option><option>VARCHAR</option><option>TEXT</option><option>TIMESTAMPTZ</option></select><input value={field.length} aria-label={`字段 ${field.name} 长度`} onChange={event=>update(index,{length:event.target.value})}/><input type="checkbox" checked={field.primary} disabled/><input type="checkbox" checked={!field.nullable} onChange={event=>update(index,{nullable:!event.target.checked})}/><input value={field.defaultValue} aria-label={`字段 ${field.name} 默认值`} onChange={event=>update(index,{defaultValue:event.target.value})}/><input value={field.comment} aria-label={`字段 ${field.name} 注释`} onChange={event=>update(index,{comment:event.target.value})}/><button aria-label={`删除字段 ${field.name}`} onClick={()=>setFields(current=>current.filter((_,fieldIndex)=>fieldIndex!==index))}><PrototypeIcon name="trash"/></button></div>)}
        </div>:<div className="proto-schema-object-state"><PrototypeIcon name={activeSection==='indexes'?'sort':activeSection==='relations'?'share':'database'}/><h3>{sections.find(section=>section.id===activeSection)?.label}</h3><p>{activeSection==='indexes'?'主键索引 conversation_record_pkey · id':activeSection==='relations'?'当前表没有外键关系':activeSection==='permissions'?'当前连接具有 SELECT、INSERT、UPDATE 权限':'规范化建表语句已在右侧显示'}</p></div>}
      </div>
      <aside className="proto-ddl-preview"><header><strong>SQL 预览</strong><button className="proto-icon-button" aria-label="刷新 SQL 预览"><PrototypeIcon name="refresh"/></button></header><pre>{ddl}</pre><section><h3>校验结果</h3><p className="success">● 校验通过</p>{dirty>0&&<p className="warning">△ 字段 created_time 默认值将被修改</p>}</section><section><h3>变更摘要 ({dirty})</h3>{dirty>0?<p>修改字段 created_time 默认值为 {created.defaultValue}</p>:<p>还没有结构变更</p>}</section></aside>
    </div>
    <footer className="proto-schema-footer"><span>{dirty?`已修改 ${dirty} 项`:'结构与数据库一致'}</span><span className="proto-toolbar-spacer"/><button onClick={()=>setNotice('SQL 预览已更新')}>预览 SQL</button><button className="proto-primary" disabled={!dirty}>保存修改</button></footer>
    {notice&&<div className="proto-toast" role="status"><PrototypeIcon name="check"/>{notice}</div>}
  </section>
}
