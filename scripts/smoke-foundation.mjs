#!/usr/bin/env node

const baseURL = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '')
const username = process.env.OC_SMOKE_USER ?? 'admin'
const password = process.env.OC_SMOKE_PASSWORD ?? 'foundation-smoke-password'
const runID = `smoke-${Date.now()}`

let cookie = ''
let csrfToken = ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function captureCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) return
  cookie = setCookie.split(';')[0]
}

async function request(path, {method = 'GET', body, expected = 200, auth = true} = {}) {
  const headers = new Headers({Accept: 'application/json'})
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (auth && cookie) headers.set('Cookie', cookie)
  if (auth && csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await parseBody(response)
  if (response.status !== expected) {
    throw new Error(`${method} ${path} returned ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`)
  }
  return {response, payload}
}

async function requestForm(path, {method = 'POST', form, expected = 200} = {}) {
  const headers = new Headers({Accept: 'application/json'})
  if (cookie) headers.set('Cookie', cookie)
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`${baseURL}${path}`, {method, headers, body: form})
  const payload = await parseBody(response)
  if (response.status !== expected) {
    throw new Error(`${method} ${path} returned ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`)
  }
  return {response, payload}
}

function assertSecretOmitted(payload, forbiddenValues) {
  const serialized = JSON.stringify(payload)
  for (const value of forbiddenValues) {
    assert(!serialized.includes(value), `secret value leaked in response: ${value}`)
  }
  assert(!serialized.toLowerCase().includes('ciphertext'), 'ciphertext leaked in response')
}

try {
  await request('/health/ready')

  const login = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: {username, password},
  })
  captureCookie(login.response)
  csrfToken = login.payload?.csrfToken ?? ''
  assert(cookie.startsWith('ops_session='), 'login did not set ops_session cookie')
  assert(csrfToken, 'login did not return csrfToken')

  const session = await request('/api/auth/session')
  assert(session.payload?.user?.username === username, 'current session user mismatch')

  const team = await request('/api/teams', {
    method: 'POST',
    expected: 201,
    body: {name: `${runID}-team`},
  })
  const teamID = team.payload?.team?.id
  assert(teamID, 'team creation did not return id')

  const members = await request(`/api/teams/${encodeURIComponent(teamID)}/members`)
  assert(Array.isArray(members.payload?.members), 'team member list missing')
  assert(
    members.payload.members.some((member) => member?.user?.username === username && member?.role === 'admin'),
    'created team did not list creator as team admin',
  )

  const managedUser = await request('/api/users', {
    method: 'POST',
    expected: 201,
    body: {username: `${runID}-user`, displayName: `${runID} User`, password: `${runID}-user-password`, role: 'member'},
  })
  const managedUserID = managedUser.payload?.user?.id
  assert(managedUserID, 'managed user creation did not return id')

  const managedTeam = await request('/api/teams', {
    method: 'POST',
    expected: 201,
    body: {name: `${runID}-managed-team`},
  })
  const managedTeamID = managedTeam.payload?.team?.id
  assert(managedTeamID, 'managed team creation did not return id')
  await request(`/api/users/${encodeURIComponent(managedUserID)}/teams`, {
    method: 'PUT',
    expected: 204,
    body: {teams: [{teamId: managedTeamID, role: 'member'}]},
  })
  await request(`/api/teams/${encodeURIComponent(managedTeamID)}/members/${encodeURIComponent(managedUserID)}`, {
    method: 'PATCH',
    expected: 204,
    body: {role: 'admin'},
  })
  const managedMembers = await request(`/api/teams/${encodeURIComponent(managedTeamID)}/members`)
  assert(
    managedMembers.payload?.members?.some((member) => member?.user?.id === managedUserID && member?.role === 'admin'),
    'member role edit did not persist',
  )
  const renamedTeam = await request(`/api/teams/${encodeURIComponent(managedTeamID)}`, {
    method: 'PATCH',
    body: {name: `${runID}-renamed-team`},
  })
  assert(renamedTeam.payload?.team?.name === `${runID}-renamed-team`, 'team rename did not persist')
  await request(`/api/teams/${encodeURIComponent(managedTeamID)}/members/${encodeURIComponent(managedUserID)}`, {
    method: 'DELETE',
    expected: 204,
  })
  await request(`/api/teams/${encodeURIComponent(managedTeamID)}`, {
    method: 'DELETE',
    expected: 204,
  })

  const dbPassword = `${runID}-db-password`
  const personal = await request('/api/registry/v2/connections', {
    method: 'POST',
    expected: 201,
    body: {
      connection: {
        name: `${runID}-postgres`,
        kind: 'database',
        driver: 'postgres',
        scope: 'personal',
        endpoint: {host: 'db.internal', port: 5432},
        config: {database: 'app'},
      },
      secret: {username: 'ops', password: dbPassword},
    },
  })
  assert(personal.payload?.connection?.hasSecret === true, 'personal database connection did not report hasSecret')
  assertSecretOmitted(personal.payload, [dbPassword])

  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${runID}\n-----END OPENSSH PRIVATE KEY-----`
  const teamSSH = await request('/api/registry/v2/connections', {
    method: 'POST',
    expected: 201,
    body: {
      connection: {
        name: `${runID}-ssh`,
        kind: 'ssh',
        driver: 'ssh',
        scope: 'team',
        teamId: teamID,
        endpoint: {host: 'bastion.internal', port: 22},
        config: {},
      },
      secret: {username: 'ops', privateKey, passphrase: `${runID}-passphrase`},
    },
  })
  assert(teamSSH.payload?.connection?.scope === 'team', 'team ssh connection scope mismatch')
  assertSecretOmitted(teamSSH.payload, [privateKey, `${runID}-passphrase`])

  const listed = await request('/api/registry/v2/connections')
  assert(Array.isArray(listed.payload?.connections), 'connection list missing')
  assert(listed.payload.connections.some((item) => item.name === `${runID}-postgres`), 'personal connection missing from list')
  assert(listed.payload.connections.some((item) => item.name === `${runID}-ssh`), 'team connection missing from list')
  assertSecretOmitted(listed.payload, [dbPassword, privateKey, `${runID}-passphrase`])

  const sshForLogs = await request('/api/logs/ssh-connections')
  assert(
    sshForLogs.payload?.connections?.some((item) => item.name === `${runID}-ssh` && item.kind === 'ssh'),
    'log module did not list saved ssh connection',
  )
  assertSecretOmitted(sshForLogs.payload, [privateKey, `${runID}-passphrase`])

  const logSession = await request('/api/logs/sessions', {
    method: 'POST',
    expected: 201,
    body: {name: `${runID}-logs`, scope: 'team', teamId: teamID},
  })
  const logSessionID = logSession.payload?.session?.id
  assert(logSessionID, 'log session creation did not return id')

  const marker = `${runID}-failed-payment`
  const form = new FormData()
  form.set('serviceName', 'api')
  form.set('nodeName', 'a')
  form.set('file', new Blob([`2026-07-08 10:00:00 ERROR ${marker}\n`], {type: 'text/plain'}), `${runID}-api-a.log`)
  const upload = await requestForm(`/api/logs/sessions/${encodeURIComponent(logSessionID)}/upload`, {
    form,
    expected: 201,
  })
  assert(upload.payload?.file?.serviceName === 'api', 'log upload service name mismatch')
  assert(upload.payload?.file?.nodeName === 'a', 'log upload node name mismatch')

  const search = await request(`/api/logs/sessions/${encodeURIComponent(logSessionID)}/search?query=${encodeURIComponent(marker)}`)
  assert(search.payload?.entries?.some((entry) => entry?.message?.includes(marker)), 'uploaded log line missing from search results')
  assert(
    search.payload?.tree?.some((service) => service?.serviceName === 'api' && service?.nodes?.some((node) => node?.nodeName === 'a')),
    'uploaded log scope missing from search tree',
  )

  await request('/api/auth/logout', {method: 'POST', expected: 204})
  const rejected = await fetch(`${baseURL}/api/auth/session`, {headers: {Cookie: cookie, Accept: 'application/json'}})
  assert(rejected.status === 401, `logged-out cookie reuse returned ${rejected.status}, expected 401`)

  console.log(`foundation smoke passed against ${baseURL}`)
} catch (error) {
  console.error(`foundation smoke failed against ${baseURL}`)
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
