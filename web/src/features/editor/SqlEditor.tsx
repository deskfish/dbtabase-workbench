import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js'

loader.config({monaco})
if (typeof self !== 'undefined') {
  self.MonacoEnvironment = {getWorker: () => new EditorWorker()}
}

export function SqlEditor({value, onChange, onExecute, editorTheme = 'vs-dark'}: {value:string; onChange:(value:string)=>void; onExecute:()=>void; editorTheme?: 'vs-dark' | 'vs-light'}) {
  if (import.meta.env.MODE === 'test') {
    return <textarea aria-label="SQL 编辑器" value={value} onChange={(event) => onChange(event.target.value)} />
  }
  return <Editor
    height="100%"
    language="sql"
    theme={editorTheme}
    value={value}
    onChange={(next) => onChange(next ?? '')}
    options={{fontSize:13, fontFamily:"'SFMono-Regular', Consolas, monospace", minimap:{enabled:false}, padding:{top:14}, automaticLayout:true, scrollBeyondLastLine:false}}
    onMount={(editor, monaco) => editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onExecute)}
  />
}
