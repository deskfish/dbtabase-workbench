import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {Dropzone} from './Dropzone'

describe('Dropzone', () => {
  it('passes a dropped file to the controlled change handler', () => {
    const onChange = vi.fn()
    render(<Dropzone label="本地日志" file={null} accept=".log,.txt" onChange={onChange} />)
    const file = new File(['line'], 'app.log', {type: 'text/plain'})
    fireEvent.drop(screen.getByRole('button', {name: '本地日志'}), {dataTransfer: {files: [file]}})
    expect(onChange).toHaveBeenCalledWith(file)
  })

  it('shows a file summary and clears the selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const file = new File(['line'], 'app.log', {type: 'text/plain'})
    render(<Dropzone label="本地日志" file={file} onChange={onChange} />)
    expect(screen.getByText('app.log')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: '清除 app.log'}))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
