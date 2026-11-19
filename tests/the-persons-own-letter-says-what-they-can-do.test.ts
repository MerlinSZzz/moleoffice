// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/** A waiting sender sees the current ownership route, and old Chinese routes keep their wording. */

import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { routedOf, theRoutedLine, theRoutedLineInTheChat, type RoutedAddressee, type TheRoutedLineSaid } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { breaksTheSpacing } from '../src/shared/spacing.ts'
import { RoutedLine } from '../src/web/components/RoutedLine.tsx'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
const THE_PERSON_REF = { kind: 'person', id: THE_PERSON }


/** Register an agent and give back its registry id, which is minted and is not the handle. */
function anAgent(handle: string, role: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  t.client.sqlite.prepare('UPDATE agents SET role = ?, started_by_kind = ?, started_by_id = ? WHERE id = ?').run(role, 'person', THE_PERSON, row.id)
  return row.id
}

/** Send one letter and give back the id of the stored message, whatever the reply's code. */
async function send(headers: Record<string, string>, to: string, body: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const row = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.body') = ?")
    .get(body) as { id: string } | undefined
  expect(row, `the letter was not stored: ${reply.statusCode} ${reply.body.slice(0, 400)}`).toBeDefined()
  return row!.id
}

function routedOn(messageId: string): readonly RoutedAddressee[] {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  return routedOf(JSON.parse(row.data) as Record<string, unknown>)
}

/** Run one reading as a Chinese page in a browser would: no Node version, and the page reader in Chinese. */
function inAChineseBrowser<T>(read: () => T): T {
  setWordLanguage('zh')
  vi.stubGlobal('process', { ...process, versions: { ...process.versions, node: undefined } })
  try {
    return read()
  } finally {
    vi.unstubAllGlobals()
    setWordLanguage('en')
  }
}

/** The routed lines the chat draws for the person, as they sent the letter. */
function drawnForThePerson(routed: readonly RoutedAddressee[]): string {
  return renderToStaticMarkup(h(RoutedLine, { routed, viewer: THE_PERSON_REF, sentBy: THE_PERSON_REF }))
}

let secretary = ''
let toTheRetired = ''
let toTheQuiet = ''
let fromAnAgent = ''
let retiredId = ''
let writerId = ''
let child: ChildProcess | null = null

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  secretary = anAgent('sec-takes', 'secretary')
  const retired = anAgent('kiln-old', 'worker')
  retiredId = retired
  const quiet = anAgent('kiln-quiet', 'worker')
  const writer = anAgent('kiln-writer', 'worker')
  writerId = writer
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the piece of work is done' WHERE id = ?").run(retired)
  toTheRetired = await send(AS_THE_PERSON, retired, 'A letter from the person to a retired agent')
  toTheQuiet = await send(AS_THE_PERSON, quiet, 'A letter from the person to a quiet agent')
  fromAnAgent = await send(asAgent(writer), quiet, 'A letter from an agent to a quiet agent')
}, 60_000)

afterAll(async () => {
  if (child?.pid !== undefined) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  await app.close()
  t.close()
})

describe('the sender sees the current ownership route', () => {
  it('shows that a retired addressee without an owner is waiting', async () => {
    const { OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    const routed = routedOn(toTheRetired)
    expect(routed).toHaveLength(1)
    expect(routed[0]!.to).toBeNull()
    expect(routed[0]!.said?.ending.how).toBe(OWNERLESS_ROUTING_ENDING)
    expect(drawnForThePerson(routed)).toContain(theRoutedLineInTheChat(routed[0]!, routed))
    expect(routed[0]!.line).toBe(theRoutedLine(routed[0]!.said!))
  })

  it('shows the same current status when a live addressee cannot receive', async () => {
    const { OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    const routed = routedOn(toTheQuiet)
    expect(routed).toHaveLength(1)
    expect(routed[0]!.said?.ending.how).toBe(OWNERLESS_ROUTING_ENDING)
    expect(drawnForThePerson(routed)).toContain(theRoutedLineInTheChat(routed[0]!, routed))
  })

  it('keeps an agent sender’s waiting explanation private to that sender', () => {
    const routed = routedOn(fromAnAgent)
    expect(routed).toHaveLength(1)
    expect(routed[0]!.to).toBeNull()
    expect(renderToStaticMarkup(h(RoutedLine, { routed, viewer: THE_PERSON_REF, sentBy: { kind: 'agent', id: writerId } }))).toBe('')
    expect(renderToStaticMarkup(h(RoutedLine, { routed, viewer: { kind: 'agent', id: writerId }, sentBy: { kind: 'agent', id: writerId } }))).toContain(theRoutedLineInTheChat(routed[0]!, routed))
  })

  it('keeps the Chinese guidance for older stored routes', () => {
    const said: TheRoutedLineSaid = { addressee: 'kiln-quiet', was: 'nothing answering', passedOver: [], ending: { how: 'the owner is the sender', ending: { how: 'no secretary', owner: 'the person' } } }
    const entry: RoutedAddressee = { for: { kind: 'agent', id: 'quiet-id' }, because: 'nothing answering', to: null, passedOver: [], line: theRoutedLine(said), said }
    const chinese = inAChineseBrowser(() => theRoutedLineInTheChat(entry, [entry]))
    expect(chinese).toContain('它留在 kiln-quiet 的消息里，直到 kiln-quiet 读到它。')
    expect(breaksTheSpacing(chinese), chinese).toEqual([])
  })

  it('replaces the waiting explanation after the original is delivered to an owner', async () => {
    const session = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'Owner run', data: { state: 'running', runtime: 'claude-code', servingAgent: secretary }, actor: t.api.HUMAN }).id
    child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300000)'], { detached: true, stdio: 'ignore' })
    child.unref()
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: WORKSPACE, sessionRecordId: session, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (columns.some((one) => one.name === 'owner_id')) setFixtureOwner(t.client.sqlite, secretary, retiredId, 'id')
    else t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('agent', secretary, retiredId)
    const old = routedOn(toTheRetired)
    const waiting = theRoutedLineInTheChat(old[0]!, old)
    const swept = await app.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: AS_THE_PERSON })
    expect(swept.statusCode, swept.body).toBe(200)
    const routed = routedOn(toTheRetired)
    expect(routed.map((one) => one.to)).toEqual([null, { kind: 'agent', id: secretary }])
    const rows = t.client.sqlite.prepare('SELECT recipient_id FROM message_delivery WHERE message_id = ?').all(toTheRetired) as { recipient_id: string }[]
    expect(rows.filter((row) => row.recipient_id === secretary)).toHaveLength(1)
    const drawn = drawnForThePerson(routed)
    expect(drawn).not.toContain(waiting)
    expect(drawn).toContain(theRoutedLineInTheChat(routed[1]!, routed))
  })
})
