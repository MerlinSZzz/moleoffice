// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENCE DOOR READS THE MACHINE ONCE FOR THE WHOLE ROSTER, NOT ONCE PER AGENT.
 *
 * MEASURED FIRST, 11 September 2026, on a copy of the owner's database (problem 9UeL9VeVPn33): `GET
 * /api/presence` took 1.2 to 2.6 seconds, and the profile put most of it in reading /proc — every
 * process's links and file descriptors — once for every agent that had an unreleased process row,
 * because the question "is a process running for this agent" listed the resources afresh each
 * time. The rows and the machine are the same for every agent within one reading, so the door
 * reads them once and hands them down.
 *
 * HOW IT IS PROVED. The statements are counted at the database: listing the resources prepares one
 * distinctive read of `session_resources` ordered by `registered_at DESC, id DESC`. With two agents
 * each holding a live process row, one call to the door prepares it once. CONTROL: red before the
 * change (2). MUTATION: drop the `machine` argument in `everybodysPresence`, and this is red.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/**
 * Transcripts this file writes. Each fixture session is a run serving its agent with a live process
 * row, which the answering reading counts as a run going (since 27 September 2026 the dot is that
 * reading). The transcript was needed when a live process row turned the dot green by itself
 * (M126b), and is kept so the session looks as a working one does. The count this file is about is
 * the resource listing, and the reading does not change it.
 */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-machine-once-'))

function aTranscriptWrittenNow(handle: string): string {
  const path = join(transcripts, `${handle}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return reply.json() as Record<string, unknown>
}

/** The registry id each agent was given, by its handle. A presence row names an agent by that id. */
const idOf: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['presence-one', 'presence-two']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
    idOf[handle] = (made.json() as { agent: { id: string } }).agent.id
    // A SESSION OF ITS OWN AND A LIVE PROCESS ROW REGISTERED BY IT, which is what makes the door ask
    // the machine. The session also carries a transcript, because since M126b a live process with
    // nothing readable behind it is not online (the-presence-door-reads-its-rows-once covers a
    // different count; this file is about the machine read).
    const session = await post(
      '/api/records',
      {
        kind: 'session',
        title: `a run of ${handle}`,
        data: {
          state: 'running',
          servingAgent: handle,
          extra: {
            discovered: {
              tool: 'claude-code',
              externalId: `machine-once-${handle}`,
              logPath: aTranscriptWrittenNow(handle),
              resumeCommand: null,
              startedAt: null,
              entryPoint: null,
            },
          },
        },
      },
      asAgent(handle),
    )
    const sessionId = (session['record'] as { id?: string } | undefined)?.id
    expect(sessionId, JSON.stringify(session).slice(0, 200)).toBeDefined()
    const row = await post('/api/resources', { sessionRecordId: sessionId, type: 'process', key: String(process.pid), detail: `this test process, for ${handle}`, adopting: 'this test process started before the session the test filed for it' }, asAgent(handle))
    expect((row['resource'] as { id?: string } | undefined)?.id, JSON.stringify(row).slice(0, 200)).toBeDefined()
  }
})
afterAll(async () => {
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

/** Every statement prepared while `act` runs, by its SQL. */
async function statementsDuring(act: () => Promise<void>): Promise<string[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  return seen
}

describe('GET /api/presence over two agents each with a live process row', () => {
  it('reads both as reachable, and lists the resources once', async () => {
    let body: { presence?: { who: { kind: string; id: string }; colour: string; from: string | null }[] } = {}
    const statements = await statementsDuring(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/presence', headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      body = reply.json() as typeof body
    })
    // THE TWO OF THIS TEST; the office's own row is in the roster too and is not asked about here.
    const ours = [idOf['presence-one'], idOf['presence-two']]
    const agents = (body.presence ?? []).filter((one) => one.who.kind === 'agent' && ours.includes(one.who.id))
    expect(agents.map((one) => one.who.id).sort()).toEqual([...ours].sort())
    for (const one of agents) {
      expect(one.colour, `${one.who.id} has a live process`).toBe('green')
      expect(one.from).toBe('a run answering as it')
    }
    const resourceListings = statements.filter((sql) => /FROM session_resources/.test(sql) && /ORDER BY registered_at DESC, id DESC/.test(sql)).length
    expect(resourceListings, 'the resources are listed once for the whole roster').toBe(1)
  })
})
