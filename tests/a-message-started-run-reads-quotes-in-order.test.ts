// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nameTarget } from '../src/shared/targets.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

let db: TestDb
let app: FastifyInstance
let scratch: string
let promptFile: string
let settings: WorkerSettings
let source: string
const watching: Parameters<typeof onePass>[1] = []
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const body = 'before_ after_'
const selected = 'selected_'

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'problem', title: 'Made-up source', data: { symptom: selected } } })
  expect(made.statusCode, made.body).toBe(201)
  source = made.json().record.id
  scratch = mkdtempSync(join(tmpdir(), 'quote-handover-'))
  promptFile = join(scratch, 'prompt.txt')
  const wrapper = join(scratch, 'fake.mjs')
  writeFileSync(wrapper, `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(promptFile)}, process.argv[2] ?? '')\nawait new Promise((done) => setTimeout(done, 120_000))\n`)
  settings = { api, workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), runs: 2, hops: 3, outputRoot: join(scratch, 'runs'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: wrapper } }
}, 60_000)

afterAll(async () => {
  for (const run of watching) {
    try { if (run.handle.pgid !== null) process.kill(-run.handle.pgid, 'SIGKILL') } catch { /* already ended */ }
  }
  await app.close()
  db.close()
  rmSync(scratch, { recursive: true, force: true })
})

it.each([{ positions: [7] }, { positions: null }])('a run started for a stored message reads its quote in order, positions $positions', async ({ positions }) => {
  if (existsSync(promptFile)) unlinkSync(promptFile)
  const handle = randomUUID()
  const agent = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(agent.statusCode, agent.body).toBe(201)
  const recipient = agent.json().agent.id
  const context = { target: { kind: 'record' as const, recordId: source, workspaceId: 'default' }, span: { quote: selected, from: 0, to: selected.length, field: 'data.symptom' } }
  const data = { body, to: [{ kind: 'agent', id: recipient }], quotes: [context], ...(positions === null ? {} : { quotePositions: positions }) }
  const message = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up quote message', data } })
  expect([201, 409], message.body).toContain(message.statusCode)
  const id = message.json().record.id
  const pressed = await app.inject({ method: 'POST', url: `/api/messages/${id}/start-an-agent`, headers, payload: {} })
  expect(pressed.statusCode, pressed.body).toBe(200)
  const deadline = Date.now() + 30_000
  while (!existsSync(promptFile)) {
    expect(Date.now(), 'no made-up run started').toBeLessThan(deadline)
    await onePass(settings, watching)
    await new Promise((done) => setTimeout(done, 100))
  }
  const prompt = readFileSync(promptFile, 'utf8')
  const heading = sayInEnglish('agent.quote.fromField', { source: nameTarget(context.target), field: 'data.symptom' })
  const words = positions === null ? [heading, `> ${selected}`, sayInEnglish('agent.quote.end'), body] : ['before_', heading, `> ${selected}`, sayInEnglish('agent.quote.end'), 'after_']
  let at = 0
  for (const word of words) {
    const found = prompt.indexOf(word, at)
    expect(found, `missing or out of order: ${word}\n${prompt}`).toBeGreaterThanOrEqual(at)
    at = found + word.length
  }
}, 90_000)
