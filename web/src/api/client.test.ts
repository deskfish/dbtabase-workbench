import { expect, it, vi } from 'vitest'
import { APIClient, APIError } from './client'

it('adds the anonymous session header after creating a session', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({sessionId: 'session-1'}), {status: 201, headers: {'Content-Type':'application/json'}}))
    .mockResolvedValueOnce(new Response(JSON.stringify({objects: []}), {status: 200, headers: {'Content-Type':'application/json'}}))
  const client = new APIClient('', fetcher)
  await client.createSession()
  await client.metadata('connection-1')
  const request = fetcher.mock.calls[1][1] as RequestInit
  expect(new Headers(request.headers).get('X-Session-ID')).toBe('session-1')
})

it('maps a structured API error', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'destination_denied', message:'denied'}}), {status:403, headers:{'Content-Type':'application/json'}}))
  const client = new APIClient('', fetcher)
  await expect(client.createSession()).rejects.toEqual(expect.objectContaining<Partial<APIError>>({code:'destination_denied', status:403}))
})

it('downloads CSV with the anonymous session header', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({sessionId:'session-1'}), {status:201, headers:{'Content-Type':'application/json'}}))
    .mockResolvedValueOnce(new Response('value\r\n1\r\n', {status:200, headers:{'Content-Type':'text/csv'}}))
  const client = new APIClient('', fetcher)
  await client.createSession()
  await client.exportCSV('connection', 'query')
  const request = fetcher.mock.calls[1][1] as RequestInit
  expect(new Headers(request.headers).get('X-Session-ID')).toBe('session-1')
})

it('reuses an in-flight session request', async () => {
  let resolveSession: (value: Response) => void = () => {}
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => {
    resolveSession = resolve
  }))
  const client = new APIClient('', fetcher)
  const first = client.createSession()
  const second = client.createSession()
  resolveSession(new Response(JSON.stringify({sessionId:'session-1'}), {status:201, headers:{'Content-Type':'application/json'}}))
  await expect(Promise.all([first, second])).resolves.toEqual(['session-1', 'session-1'])
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('creates a session automatically before connecting', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({sessionId:'session-1'}), {status:201, headers:{'Content-Type':'application/json'}}))
    .mockResolvedValueOnce(new Response(JSON.stringify({connectionId:'connection-1', database:'app'}), {status:201, headers:{'Content-Type':'application/json'}}))
  const client = new APIClient('', fetcher)
  await client.connect({driver:'postgres', host:'db.internal', port:5432, database:'app', user:'postgres', password:'secret', tlsMode:'prefer'})
  expect(fetcher).toHaveBeenCalledTimes(2)
  const request = fetcher.mock.calls[1][1] as RequestInit
  expect(new Headers(request.headers).get('X-Session-ID')).toBe('session-1')
})
