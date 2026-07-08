import { expect, it } from 'vitest'
import { ConnectionFormError, toSaveInput, type ConnectionFormValue } from './connectionForm'
import type { TeamSummary } from '../settings/client'

const base: ConnectionFormValue = {
  name: 'Analytics',
  kind: 'database',
  driver: 'postgres',
  scope: 'personal',
  teamId: '',
  host: 'db.internal',
  port: '5432',
  database: 'app',
  username: 'ops',
  password: '',
  privateKey: '',
  passphrase: '',
}

const teams: TeamSummary[] = [{id: 'team_one', name: 'Team One', role: 'admin'}]

it('builds a personal postgres record without a blank secret', () => {
  expect(toSaveInput(base, [])).toEqual({
    connection: {
      name: 'Analytics',
      kind: 'database',
      driver: 'postgres',
      scope: 'personal',
      endpoint: {host: 'db.internal', port: 5432},
      config: {database: 'app'},
    },
  })
})

it('includes a database secret only when password is non-empty', () => {
  expect(toSaveInput({...base, password: 'secret'}, [])).toMatchObject({
    secret: {username: 'ops', password: 'secret'},
  })
})

it('builds ssh records with default port 22 and private key secrets', () => {
  expect(toSaveInput({
    ...base,
    name: 'Bastion',
    kind: 'ssh',
    driver: 'ssh',
    host: 'bastion.internal',
    port: '',
    database: '',
    privateKey: 'PRIVATE KEY',
    passphrase: 'unlock',
  }, [])).toEqual({
    connection: {
      name: 'Bastion',
      kind: 'ssh',
      driver: 'ssh',
      scope: 'personal',
      endpoint: {host: 'bastion.internal', port: 22},
      config: {},
    },
    secret: {username: 'ops', privateKey: 'PRIVATE KEY', passphrase: 'unlock'},
  })
})

it('requires a known administered team for team records', () => {
  expect(toSaveInput({...base, scope: 'team', teamId: 'team_one'}, teams).connection).toMatchObject({scope: 'team', teamId: 'team_one'})
  expect(() => toSaveInput({...base, scope: 'team', teamId: ''}, teams)).toThrow(ConnectionFormError)
  expect(() => toSaveInput({...base, scope: 'team', teamId: 'team_two'}, teams)).toThrow(ConnectionFormError)
})

it('rejects invalid ports and kind/driver mismatches', () => {
  expect(() => toSaveInput({...base, port: '70000'}, [])).toThrow(ConnectionFormError)
  expect(() => toSaveInput({...base, kind: 'database', driver: 'ssh'}, [])).toThrow(ConnectionFormError)
})
