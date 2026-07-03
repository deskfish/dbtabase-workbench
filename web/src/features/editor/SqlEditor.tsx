import { useEffect, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js'
import { registerSqlCompletionProvider, type SqlCompletionContext } from './sqlCompletion'

loader.config({monaco})
if (typeof self !== 'undefined') {
  self.MonacoEnvironment = {getWorker: () => new EditorWorker()}
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  editorTheme = 'vs-dark',
  completionContext = null,
}: {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  editorTheme?: 'vs-dark' | 'vs-light'
  completionContext?: SqlCompletionContext | null
}) {
  const completionRef = useRef<SqlCompletionContext | null>(completionContext)

  useEffect(() => {
    completionRef.current = completionContext
  }, [completionContext])

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    const provider = registerSqlCompletionProvider(monaco, () => completionRef.current)
    return () => provider.dispose()
  }, [])

  if (import.meta.env.MODE === 'test') {
    return <textarea aria-label="SQL 编辑器" value={value} onChange={(event) => onChange(event.target.value)} />
  }
  return <Editor
    height="100%"
    language="sql"
    theme={editorTheme}
    value={value}
    onChange={(next) => onChange(next ?? '')}
    options={{
      fontSize: 13,
      fontFamily: "'SFMono-Regular', Consolas, monospace",
      minimap: {enabled: false},
      padding: {top: 14},
      automaticLayout: true,
      scrollBeyondLastLine: false,
      suggestOnTriggerCharacters: true,
      quickSuggestions: {other: true, comments: false, strings: false},
    }}
    onMount={(editor, monacoApi) => editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter, onExecute)}
  />
}
