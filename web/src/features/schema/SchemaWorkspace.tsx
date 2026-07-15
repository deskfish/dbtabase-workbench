import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {APIClient} from '../../api/client'
import type {SchemaForeignKey,SchemaIndex,SchemaOperation,SchemaPreview,TableDetail} from '../../api/types'
import {Icon} from '../ui/Icon'
import {ComboboxControl} from '../ui/ComboboxControl'
import {SelectControl} from '../ui/SelectControl'
import {buildColumnTypeOptions,defaultColumnType} from './columnTypes'
import {IndexDialog} from './IndexDialog'
import {appendAddIndex,dropIndexOps,replaceIndex,resolveIndexes} from './indexOps'
import {diffColumns,type DraftColumn} from './schemaDraft'

type Section='fields'|'indexes'|'relations'|'permissions'|'ddl'
export function SchemaWorkspace({api,connectionId,schema,table,driver,onSaved,onDirtyChange}:{api:APIClient;connectionId:string;schema:string;table:string;driver:'mysql'|'postgres';onSaved:()=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const [detail,setDetail]=useState<TableDetail|null>(null),[columns,setColumns]=useState<DraftColumn[]>([]),[section,setSection]=useState<Section>('fields'),[extra,setExtra]=useState<SchemaOperation[]>([]),[preview,setPreview]=useState<SchemaPreview|null>(null),[busy,setBusy]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[message,setMessage]=useState('')
 const [editing,setEditing]=useState(false),[previewOpen,setPreviewOpen]=useState(false)
 const previewRequest=useRef(0)
 const typeOptions=useMemo(()=>buildColumnTypeOptions(driver,columns.map(x=>x.type)),[driver,columns])
 const baseIndexes=useMemo(()=>detail?.table.indexes||[],[detail])
 const visibleIndexes=useMemo(()=>resolveIndexes(baseIndexes,extra),[baseIndexes,extra])
 const load=async()=>{setBusy(true);try{const d=await api.tableDetail(connectionId,schema,table);setDetail(d);setColumns(d.table.columns.map(x=>({...x,originalName:x.name})));setExtra([]);setPreview(null);setMessage('')}catch(e){setMessage(e instanceof Error?e.message:'无法加载表结构')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[connectionId,schema,table])
 const operations=useMemo(()=>detail?[...diffColumns(detail.table.columns,columns),...extra]:[],[detail,columns,extra])
 useEffect(()=>onDirtyChange?.(editing&&operations.length>0),[editing,onDirtyChange,operations.length])
 const change=(i:number,patch:Partial<DraftColumn>)=>setColumns(v=>v.map((x,n)=>{if(n===i)return{...x,...patch};if(patch.primary)return{...x,primary:false};return x}))
 const refreshPreview=useCallback(async (nextOperations: SchemaOperation[]) => {
  if (!detail || nextOperations.length === 0) {
    setPreview(null)
    return
  }
  const requestId = previewRequest.current + 1
  previewRequest.current = requestId
  setPreviewBusy(true)
  try {
    const nextPreview = await api.previewSchema(connectionId, schema, table, nextOperations)
    if (previewRequest.current !== requestId) return
    setPreview(nextPreview)
    setMessage('')
  } catch (error) {
    if (previewRequest.current !== requestId) return
    setPreview(null)
    setMessage(error instanceof Error ? error.message : 'SQL 预览失败')
  } finally {
    if (previewRequest.current === requestId) setPreviewBusy(false)
  }
 }, [api, connectionId, detail, schema, table])
 useEffect(() => {
  if (!detail) return
  if (operations.length === 0) {
    setPreview(null)
    setMessage('')
    return
  }
  const timer = window.setTimeout(() => { void refreshPreview(operations) }, 280)
  return () => window.clearTimeout(timer)
 }, [detail, operations, refreshPreview])
 const execute=async()=>{if(!preview||!operations.length)return;const dangerous=preview.risks.some(x=>x.level==='danger');if(dangerous&&!window.confirm(`包含危险操作：${preview.risks.map(x=>x.message).join('；')}。确认继续？`))return;setBusy(true);try{await api.executeSchema(connectionId,schema,table,preview.token,dangerous);setMessage('结构变更已保存');await load();setEditing(false);onSaved()}catch(e){setMessage(e instanceof Error?e.message:'结构变更失败，草稿已保留')}finally{setBusy(false)}}
 const discard=()=>{if(!detail)return;setColumns(detail.table.columns.map(x=>({...x,originalName:x.name})));setExtra([]);setPreview(null);setEditing(false);setPreviewOpen(false);setMessage('已放弃未保存修改')}
 if(!detail)return <div className="schema-loading">{busy?'正在读取表结构…':message}</div>
 return <section className="schema-workspace" aria-label="表结构编辑">
  <nav className="schema-tabs">
    <div className="schema-tab-list">{([['fields','字段'],['indexes','索引'],['relations','关系'],['permissions','权限'],['ddl','DDL']] as [Section,string][]).map(([id,label])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}>{label}</button>)}</div>
    <div className="schema-tab-actions">
      {!editing?<button className="oc-button primary" onClick={()=>setEditing(true)}>编辑结构</button>:<>
       <strong className="dirty-state">已修改 {operations.length} 项</strong>
       <button className="oc-button" onClick={()=>setPreviewOpen(v=>!v)}>预览 SQL</button>
       <button className="oc-button" disabled={!operations.length} onClick={discard}>放弃</button>
       <button className="oc-button primary" disabled={!operations.length||!preview||busy||previewBusy} onClick={()=>void execute()}>保存</button>
      </>}
    </div>
  </nav>
  <div className="schema-body">
   <div className="schema-main">
    {section==='fields'&&<>{editing&&<div className="schema-tools"><button className="oc-button primary button-with-icon" onClick={()=>setColumns(v=>[...v,{name:`new_column_${v.length+1}`,type:defaultColumnType(driver),nullable:true,isNew:true}])}><Icon name="plus"/>新增字段</button></div>}<div className={`fields-grid ${editing?'':'schema-readonly'}`}><div className="field-row field-head"><span>#</span><span>字段名</span><span>数据类型</span><span>非空</span><span>主键</span><span>默认值</span><span>注释</span><span>操作</span></div>{columns.map((c,i)=><div className="field-row" key={`${c.originalName||'new'}-${i}`}><span>{i+1}</span>{editing?<><input aria-label={`字段名 ${i+1}`} value={c.name} onChange={e=>change(i,{name:e.target.value})}/><ComboboxControl className="field-type-combobox" ariaLabel={`数据类型 ${i+1}`} value={c.type} options={typeOptions} onChange={value=>change(i,{type:value})}/><input aria-label={`非空 ${i+1}`} type="checkbox" checked={!c.nullable} onChange={e=>change(i,{nullable:!e.target.checked})}/><input aria-label={`主键 ${i+1}`} type="checkbox" checked={Boolean(c.primary)} onChange={e=>change(i,{primary:e.target.checked})}/><input aria-label={`默认值 ${i+1}`} value={c.default||''} onChange={e=>change(i,{default:e.target.value||undefined})}/><input aria-label={`注释 ${i+1}`} value={c.comment||''} onChange={e=>change(i,{comment:e.target.value})}/><button className="icon-button danger" aria-label={`删除字段 ${c.name}`} onClick={()=>setColumns(v=>v.filter((_,n)=>n!==i))}><Icon name="trash"/></button></>:<><span className="field-cell">{c.name}</span><span className="field-cell">{c.type}</span><span>{c.nullable?'—':'是'}</span><span>{c.primary?'是':'—'}</span><span className="field-cell">{c.default||'—'}</span><span className="field-cell">{c.comment||'—'}</span><span>—</span></>}</div>)}</div></>}
    {section==='indexes'&&<IndexEditor
      indexes={visibleIndexes}
      columnOptions={columns.map((x) => x.name)}
      editing={editing}
      onAdd={(index)=>setExtra((v)=>appendAddIndex(v,index))}
      onEdit={(original,index)=>setExtra((v)=>replaceIndex(v,baseIndexes,original,index))}
      onDrop={(name)=>setExtra((v)=>dropIndexOps(v,baseIndexes,name))}
    />} 
    {section==='relations'&&<RelationEditor editing={editing} relations={detail.table.foreignKeys||[]} columns={columns.map(x=>x.name)} onAdd={foreignKey=>setExtra(v=>[...v,{kind:'add_foreign_key',foreignKey}])} onDrop={name=>setExtra(v=>[...v,{kind:'drop_foreign_key',name}])}/>}
    {section==='permissions'&&<div className="schema-empty"><h3>权限（只读）</h3>{detail.permissions.length?detail.permissions.map(x=><code key={x}>{x}</code>):<p>当前连接未返回显式表权限。</p>}</div>}
    {section==='ddl'&&<pre className="ddl-source">{detail.ddl||'DDL 将在右侧预览结构变更时生成。'}</pre>}
   </div>
   {(editing||previewOpen)&&<aside className="ddl-panel"><h3>SQL 预览</h3>{previewBusy&&operations.length>0?<p className="ddl-preview-hint">正在生成 SQL…</p>:preview?<><pre>{preview.statements.map(x=>x.sql+';').join('\n\n')}</pre>{preview.warnings?.map(x=><p className="ddl-warning" key={x}>{x}</p>)}{preview.risks.map(x=><p className={`ddl-risk ${x.level}`} key={x.kind+x.target}>{x.message}</p>)}</>:<p>{operations.length>0?'等待生成 SQL 预览…':'修改字段、索引或关系后，SQL 会在这里实时显示。'}</p>}</aside>}
  </div><footer className="schema-status">{busy?'正在保存…':previewBusy?'正在更新 SQL 预览…':message||'修改会实时生成 SQL 预览，确认后点击保存'}</footer>
 </section>
}

function IndexEditor({indexes, columnOptions, editing, onAdd, onEdit, onDrop}: {indexes: SchemaIndex[]; columnOptions: string[]; editing:boolean; onAdd: (x: SchemaIndex) => void; onEdit: (originalName: string, x: SchemaIndex) => void; onDrop: (n: string) => void}) {
  const [dialog, setDialog] = useState<{mode: 'create'} | {mode: 'edit'; original: SchemaIndex} | null>(null)
  return <>
    {editing&&<div className="schema-tools">
      <button className="oc-button primary button-with-icon" type="button" onClick={() => setDialog({mode: 'create'})}><Icon name="plus"/>新增索引</button>
    </div>}
    <div className="fields-grid index-grid">
      <div className="field-row field-head index-row">
        <span>索引名称</span>
        <span>字段</span>
        <span>唯一</span>
        <span>操作</span>
      </div>
      {indexes.length === 0 && <div className="schema-grid-empty">暂无索引</div>}
      {indexes.map((x) => <div className="field-row index-row" key={x.name}>
        <span className="field-cell" title={x.name}>{x.name}</span>
        <span className="field-cell field-cell-muted" title={x.columns.join(', ')}>{x.columns.join(', ')}</span>
        <span className="field-cell field-cell-center">{x.unique ? '是' : '—'}</span>
        <div className="index-row-actions">{editing&&<>
          <button className="icon-button" type="button" aria-label={`编辑索引 ${x.name}`} onClick={() => setDialog({mode: 'edit', original: x})}><Icon name="edit"/></button>
          <button className="icon-button danger" type="button" aria-label={`删除索引 ${x.name}`} onClick={() => onDrop(x.name)}><Icon name="trash"/></button>
        </>}</div>
      </div>)}
    </div>
    {dialog && <IndexDialog
      mode={dialog.mode}
      initial={dialog.mode === 'edit' ? dialog.original : undefined}
      columnOptions={columnOptions}
      onClose={() => setDialog(null)}
      onSubmit={(index) => {
        if (dialog.mode === 'edit') onEdit(dialog.original.name, index)
        else onAdd(index)
        setDialog(null)
      }}
    />}
  </>
}

function RelationEditor({relations, columns, editing, onAdd, onDrop}: {relations: SchemaForeignKey[]; columns: string[]; editing:boolean; onAdd: (x: SchemaForeignKey) => void; onDrop: (n: string) => void}) {
  const [name, setName] = useState('')
  const [column, setColumn] = useState(columns[0] || '')
  const [target, setTarget] = useState('public.table.id')
  const canAdd = Boolean(name.trim() && target.split('.').length === 3)
  const submit = () => {
    if (!canAdd) return
    const [s, t, c] = target.split('.')
    onAdd({name: name.trim(), columns: [column], refSchema: s, refTable: t, refColumns: [c], onDelete: 'NO ACTION', onUpdate: 'NO ACTION'})
    setName('')
  }
  return <div className="fields-grid relation-grid">
    <div className="field-row field-head relation-row">
      <span>外键名称</span>
      <span>本地字段</span>
      <span>引用目标</span>
      <span>操作</span>
    </div>
    {relations.length === 0 && <div className="schema-grid-empty">暂无外键关系</div>}
    {relations.map((x) => <div className="field-row relation-row" key={x.name}>
      <span className="field-cell" title={x.name}>{x.name}</span>
      <span className="field-cell field-cell-muted">{x.columns.join(', ')}</span>
      <span className="field-cell field-cell-muted" title={`${x.refSchema}.${x.refTable}(${x.refColumns.join(', ')})`}>{x.refSchema}.{x.refTable}({x.refColumns.join(', ')})</span>
      {editing?<button className="icon-button danger" type="button" aria-label={`删除外键 ${x.name}`} onClick={() => onDrop(x.name)}><Icon name="trash"/></button>:<span>—</span>}
    </div>)}
    {editing&&<div className="field-row relation-row relation-add-row">
      <input aria-label="外键名称" placeholder="外键名称" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}/>
      <SelectControl ariaLabel="本地字段" value={column} options={columns.map((x) => ({value: x, label: x}))} onChange={setColumn}/>
      <input aria-label="引用目标" placeholder="schema.table.column" value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}/>
      <button className="icon-button" type="button" aria-label="添加外键" disabled={!canAdd} onClick={submit}><Icon name="plus"/></button>
    </div>}
  </div>
}
