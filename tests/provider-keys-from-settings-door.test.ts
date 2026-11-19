// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { replacementRefusal } from '../src/config/provider-setup/private-key.mjs'
import providerRows from '../src/config/provider-setup/providers.json'
import { customKey, keyFileFor } from '../src/server/lib/provider-key-setup.ts'

buildTheFirstOfficeInAHook()
const sample = 'demo_FAKE_ONLY_572841'
let app: FastifyInstance, db: TestDb, home: string, log: string
const human = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'provider-settings-door-'))
  vi.stubEnv('HOME', home)
  db = await freshDb()
  log = ''
  const stream = new Writable({ write(chunk, _encoding, done) { log += String(chunk); done() } })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir: join(home, 'web'), webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: stream })).app
  await app.ready()
})
afterEach(async () => { await app.close(); db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(home, { recursive: true, force: true }) })
const payload = { provider: 'custom', customName: 'local-test', prefix: 'demo_', min: 8, value: sample }

it('allows a person to save, does not echo or record the value, and asks before replacement', async () => {
  const first = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload })
  expect(first.statusCode).toBe(200)
  expect(first.body.includes(sample)).toBe(false)
  expect(readFileSync(keyFileFor(home, customKey(payload.customName)), 'utf8') === sample).toBe(true)
  const second = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload })
  expect(second.statusCode).toBe(409)
  expect(second.body.includes(sample)).toBe(false)
  expect(second.body).toContain(replacementRefusal().message)
  const confirmed = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload: { ...payload, replace: true } })
  expect(confirmed.statusCode).toBe(200)
  expect(readFileSync(db.file).includes(Buffer.from(sample))).toBe(false)
  const trial = await app.inject({ method: 'POST', url: '/api/settings/provider-keys/trial', headers: human, payload: { provider: 'custom' } })
  expect(trial.body.includes(sample)).toBe(false)
  expect(log.includes(sample) || log.includes(sample.slice(sample.indexOf('FAKE_')))).toBe(false)
})

it('refuses an agent and an untrusted origin before saving', async () => {
  const caller = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: agent, payload })
  expect(caller.statusCode).toBe(403)
  const other = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: { ...human, origin: 'https://evil.invalid' }, payload })
  expect(other.statusCode).toBe(403)
  const agentTrial = await app.inject({ method: 'POST', url: '/api/settings/provider-keys/trial', headers: agent, payload: { provider: 'custom' } })
  expect(agentTrial.statusCode).toBe(403)
  expect(caller.body.includes(sample) || other.body.includes(sample) || agentTrial.body.includes(sample)).toBe(false)
})

it('answers the list to anyone on this computer, and the list says nothing of a saved key', async () => {
  const before = await app.inject({ method: 'GET', url: '/api/settings/provider-keys', headers: agent })
  expect(before.statusCode).toBe(200)
  expect(JSON.parse(before.body)).toMatchObject({ savingAvailable: true, providers: providerRows.map((row) => expect.objectContaining({ id: row.id })) })
  expect((await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload })).statusCode).toBe(200)
  const after = await app.inject({ method: 'GET', url: '/api/settings/provider-keys', headers: agent })
  expect(after.body).toBe(before.body)
  expect(after.body.includes(sample)).toBe(false)
})

it('returns the shared Windows refusal in the page language without touching a file', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    const result = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload: { ...payload, lang: 'zh' } })
    expect(result.statusCode).toBe(400)
    expect(/\p{Script=Han}/u.test(result.body)).toBe(true)
    expect(result.body.includes(sample)).toBe(false)
    const list = await app.inject({ method: 'GET', url: '/api/settings/provider-keys', headers: human })
    expect(JSON.parse(list.body).savingAvailable).toBe(false)
  } finally { Object.defineProperty(process, 'platform', platform) }
})

it('refuses a secretary with an active grant for both key actions', async () => {
  const who = THE_TEST_OFFICES_SECRETARY.handle
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human, payload: { handle: who, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(started.statusCode).toBe(201)
  const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${who}`, headers: { ...human, ...thePersonsKeyHeader() }, payload: { reason: 'A test grant', endsWhen: 'when you say' } })
  expect(raised.statusCode).toBe(201)
  const secretary = { ...agent, 'x-mole-office-actor-id': who }
  for (const action of [{ url: '/api/settings/provider-keys', payload }, { url: '/api/settings/provider-keys/trial', payload: { provider: 'openai' } }]) {
    const result = await app.inject({ method: 'POST', headers: secretary, ...action })
    expect(result.statusCode).toBe(403)
    expect(result.body.includes(sample)).toBe(false)
  }
})

it('refuses a foreign origin even with the person key', async () => {
  const result = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: { ...human, ...thePersonsKeyHeader(), origin: 'https://evil.invalid' }, payload })
  expect(result.statusCode).toBe(403)
  expect(result.body.includes(sample)).toBe(false)
})

it('names an answer the provider row does not declare, apart from a refused key, and never reaches the real provider', async () => {
  // A ROW OF THE SHIPPED TABLE WITH DECLARED ANSWERS, and a stand-in fetch: only that row's trial address is answered, and
  // every other address is refused, so nothing leaves this computer.
  const row = providerRows.find((one) => one.trial !== null && (one.trial.answers?.length ?? 0) > 0)!
  const declared = new Set(row.trial!.answers!.map((answer) => answer.status))
  const refusal = row.trial!.answers!.find((answer) => answer.means === 'refused')!
  const value = `${row.prefix}FAKE_ONLY_${'7'.repeat(row.min)}`
  let answer = { status: 0, name: undefined as string | undefined }
  const asked: { url: string; redirect?: string; authorization: boolean }[] = []
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    if (String(url) !== row.trial!.url) throw new Error('Only the stand-in trial address may be asked')
    asked.push({ url: String(url), redirect: init?.redirect, authorization: new Headers(init?.headers).get('authorization') === `Bearer ${value}` })
    return new Response(JSON.stringify({ statusCode: answer.status, name: answer.name ?? 'invented_name' }), { status: answer.status, headers: answer.status === 302 ? { location: '/elsewhere' } : {} })
  })
  const saved = await app.inject({ method: 'POST', url: '/api/settings/provider-keys', headers: human, payload: { provider: row.id, value } })
  expect(saved.statusCode).toBe(200)
  const trial = async () => {
    const result = await app.inject({ method: 'POST', url: '/api/settings/provider-keys/trial', headers: human, payload: { provider: row.id } })
    expect(result.body.includes(value) || result.body.includes(value.slice(value.indexOf('FAKE_')))).toBe(false)
    return result
  }
  answer = { status: refusal.status, name: refusal.name }
  const refused = await trial()
  expect(refused.statusCode).toBe(400)
  // The sentences are compared with the status taken out, so a refused key's sentence with another number does not pass.
  const refusedWords = (JSON.parse(refused.body).error as string).replaceAll(String(refusal.status), '#')
  for (const status of [429, 500, 302].filter((one) => !declared.has(one))) {
    answer = { status, name: undefined }
    const undeclared = await trial()
    expect(undeclared.statusCode).toBe(400)
    const said = JSON.parse(undeclared.body).error as string
    expect(said.includes(String(status)), `${status}: the refusal names the provider's answer`).toBe(true)
    expect(said.replaceAll(String(status), '#'), `${status}: an undeclared answer is not told as a refused key`).not.toBe(refusedWords)
  }
  expect(asked.length).toBeGreaterThan(1)
  expect(asked.every((one) => one.redirect === 'manual' && one.authorization)).toBe(true)
  expect(log.includes(value) || log.includes(value.slice(value.indexOf('FAKE_')))).toBe(false)
})
