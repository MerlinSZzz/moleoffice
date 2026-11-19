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
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
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
  settings = { api, workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), runs: 3, hops: 3, outputRoot: join(scratch, 'runs'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: wrapper } }
}, 60_000)

afterAll(async () => {
  for (const run of watching) {
    try { if (run.handle.pgid !== null) process.kill(-run.handle.pgid, 'SIGKILL') } catch { /* already ended */ }
  }
  await app.close()
  db.close()
  rmSync(scratch, { recursive: true, force: true })
})

it.each([{ positions: [7], hasQuote: true }, { positions: null, hasQuote: true }, { positions: null, hasQuote: false }])('a secondary batched notice keeps its message in the started run, positions $positions, quote $hasQuote', async ({ positions, hasQuote }) => {
  if (existsSync(promptFile)) unlinkSync(promptFile)
  const handle = randomUUID()
  const agent = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(agent.statusCode, agent.body).toBe(201)
  const recipient = { kind: 'agent' as const, id: agent.json().agent.id as string }
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const agentHeaders = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(recipient.id, null) }
  const rules = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: agentHeaders, payload: { mutedKinds: [], batchedKinds: ['theBroadcastIsDue'], because: 'Made-up batch choice', ifVersion: null } })
  expect(rules.statusCode, rules.body).toBe(200)
  db.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered' WHERE recipient_kind='agent' AND recipient_id=?").run(recipient.id)
  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  const notice = writeASystemLineToOne(recipient, 'default', SYSTEM_LINES.theBroadcastIsDue('Made-up notice'), { type: 'system', id: moleOffice().id })
  const context = { target: { kind: 'record' as const, recordId: source, workspaceId: 'default' }, span: { quote: selected, from: 0, to: selected.length, field: 'data.symptom' } }
  const stored = db.client.sqlite.prepare('SELECT data FROM records WHERE id=?').get(notice.id) as { data: string }
  const data = JSON.parse(stored.data) as Record<string, unknown>
  data['body'] = body
  if (hasQuote) data['quotes'] = [context]
  if (positions !== null) data['quotePositions'] = positions
  db.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), notice.id)
  const message = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up work request', data: { body: 'Made-up work', to: [recipient] } } })
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
  if (!hasQuote) {
    const marker = `  Message ${notice.id}\n`
    const start = prompt.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const end = prompt.indexOf('\n\n', start)
    expect(end).toBeGreaterThan(start)
    expect(prompt.slice(start, end)).toBe(`${marker}  ${body}`)
    expect(prompt).not.toContain(heading)
    return
  }
  const words = positions === null ? [heading, `> ${selected}`, sayInEnglish('agent.quote.end'), body] : ['before_', heading, `> ${selected}`, sayInEnglish('agent.quote.end'), 'after_']
  let at = prompt.indexOf(notice.id)
  expect(at).toBeGreaterThanOrEqual(0)
  for (const word of words) {
    const found = prompt.indexOf(word, at)
    expect(found, `missing or out of order: ${word}\n${prompt}`).toBeGreaterThanOrEqual(at)
    at = found + word.length
  }
}, 90_000)
