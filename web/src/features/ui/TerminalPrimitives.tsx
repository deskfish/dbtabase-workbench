import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from 'react'
import './terminal-primitives.css'

export type TerminalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function TerminalStatus({tone = 'neutral', children}: {tone?: TerminalTone; children: ReactNode}) {
  return <span className="terminal-status" data-tone={tone}><i aria-hidden="true" />{children}</span>
}

export function TerminalInlineAction({tone = 'neutral', className = '', children, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {tone?: TerminalTone}) {
  return <button className={`terminal-inline-action ${className}`.trim()} data-tone={tone} type="button" {...props}>{children}</button>
}

export function TerminalCommandFilter({tokens = [], className = '', ...props}: InputHTMLAttributes<HTMLInputElement> & {tokens?: ReactNode[]}) {
  return (
    <div className={`terminal-command-filter ${className}`.trim()}>
      <span className="terminal-command-prompt" aria-hidden="true">›</span>
      <span className="terminal-command-label" aria-hidden="true">FILTER</span>
      <input type="search" {...props} />
      {tokens.length > 0 && <div className="terminal-command-tokens">{tokens.map((token, index) => <span key={index}>{token}</span>)}</div>}
    </div>
  )
}
