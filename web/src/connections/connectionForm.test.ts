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

it('builds ssh records with login password secrets', () => {
  expect(toSaveInput({
    ...base,
    name: 'Password Bastion',
    kind: 'ssh',
    driver: 'ssh',
    host: 'bastion.internal',
    port: '22',
    database: '',
    password: 'login-secret',
  }, [])).toMatchObject({
    secret: {username: 'ops', password: 'login-secret'},
  })
})

it('preserves password and private key when both ssh methods are provided', () => {
  expect(toSaveInput({
    ...base,
    kind: 'ssh',
    driver: 'ssh',
    port: '22',
    database: '',
    password: 'login-secret',
    privateKey: 'PRIVATE KEY',
    passphrase: 'unlock',
  }, [])).toMatchObject({
    secret: {username: 'ops', password: 'login-secret', privateKey: 'PRIVATE KEY', passphrase: 'unlock'},
  })
})

it('requires a password or private key for new ssh connections', () => {
  expect(() => toSaveInput({...base, kind: 'ssh', driver: 'ssh', port: '22', database: ''}, [])).toThrow(ConnectionFormError)
  try {
    toSaveInput({...base, kind: 'ssh', driver: 'ssh', port: '22', database: ''}, [])
  } catch (error) {
    expect((error as ConnectionFormError).fields.credentials).toBe('请输入登录密码或私钥')
  }
})

it('rejects a private key passphrase without a private key', () => {
  try {
    toSaveInput({...base, kind: 'ssh', driver: 'ssh', port: '22', database: '', passphrase: 'unlock'}, [])
    throw new Error('expected validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectionFormError)
    expect((error as ConnectionFormError).fields.passphrase).toBe('私钥口令需要配合私钥使用')
  }
})

it('preserves an existing ssh secret when credential fields are blank', () => {
  const input = toSaveInput({...base, kind: 'ssh', driver: 'ssh', port: '22', database: ''}, [], {existingSecret: true})
  expect(input).not.toHaveProperty('secret')
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
