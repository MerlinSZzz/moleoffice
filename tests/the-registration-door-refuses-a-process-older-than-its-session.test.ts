// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The registration door refuses a process that started before the session registering it, unless the request adopts
 * it in words. Decision AOwsOHMVq6Ce, problem JmaDkej3InKw.
 *
 * A builder once found a pid by a pattern (pgrep, head -1), registered it, and later killed a three-day-old server it
 * had not started. The machine here is a stand-in with two processes: one that started on 27 September, long before
 * any session this file files, and one whose start is set to the second its session was filed.
 *
 * Mutation: aProcessOlderThanItsSession returns null always; the refusal case goes red.
 * Mutation: it ignores `adopting`; the adoption case goes red with the refusal.
 * Mutation: theAdoption returns ''; the adoption case goes red on the detail.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const OLD_PID = 4_100_001
const OLD_START = '2026-09-27 08:00:00'
const NEW_PID = 4_100_002

/** A machine with the old process, and a new one that started at `newStart`. */
function standInProbe(newStart: string): OsProbe {
  const live = new Map<number, OsProcess>([
    [OLD_PID, { pid: OLD_PID, pgid: OLD_PID, ppid: 1, command: 'a server somebody else started', startedAt: OLD_START }],
    [NEW_PID, { pid: NEW_PID, pgid: NEW_PID, ppid: 1, command: 'a server this session started', startedAt: newStart }],
  ])
  return {
    ...res.LINUX_PROBE,
    platform: 'stand-in',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    killProcessGroup: () => {
      throw new Error('this test never signals a process')
    },
  }
}

function aSession(): { id: string; createdAt: string } {
  const record = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session that registers',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  return { id: record.id, createdAt: record.createdAt }
}

function rowsIn(session: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM session_resources WHERE session_record_id = ?').get(session) as { n: number }).n
}

async function register(payload: Record<string, unknown>): Promise<{ status: number; said: any; text: string }> {
  const r = await app.inject({ method: 'POST', url: '/api/resources', headers: AS_THE_PERSON, payload })
  return { status: r.statusCode, said: JSON.parse(r.body) as unknown, text: r.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a process older than the session registering it', () => {
  it('is refused, naming both start times, and nothing is written', async () => {
    const session = aSession()
    res.useOsProbe(standInProbe(session.createdAt))
    const r = await register({ sessionRecordId: session.id, type: 'process', key: String(OLD_PID) })
    expect(r.status, r.text.slice(0, 400)).toBe(400)
    expect(r.said.error).toContain(`Pid ${String(OLD_PID)} started at ${OLD_START}`)
    expect(r.said.error).toContain(`before session ${session.id} was filed at ${session.createdAt}`)
    expect(r.said.error).toContain('"adopting"')
    expect(rowsIn(session.id)).toBe(0)
  })

  it('is written when the request adopts it, and the row says it was adopted and why', async () => {
    const session = aSession()
    res.useOsProbe(standInProbe(session.createdAt))
    const r = await register({
      sessionRecordId: session.id,
      type: 'process',
      key: String(OLD_PID),
      adopting: 'this session takes over the server it was asked to watch',
    })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe(String(OLD_PID))
    expect(r.said.resource.detail).toBe(
      'adopted, not started by this session: this session takes over the server it was asked to watch — ' +
        'a server somebody else started',
    )
    expect(rowsIn(session.id)).toBe(1)
  })

  it('a blank adoption is refused, and nothing is written', async () => {
    const session = aSession()
    res.useOsProbe(standInProbe(session.createdAt))
    const r = await register({ sessionRecordId: session.id, type: 'process', key: String(OLD_PID), adopting: '  ' })
    expect(r.status, r.text.slice(0, 400)).toBe(400)
    expect(r.said.error).toContain('adopting must not be empty')
    expect(rowsIn(session.id)).toBe(0)
  })
})

describe('a process the session started itself', () => {
  it('registers as before, with no adoption and nothing added to its detail', async () => {
    const session = aSession()
    res.useOsProbe(standInProbe(session.createdAt))
    const r = await register({ sessionRecordId: session.id, type: 'process', key: String(NEW_PID) })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.detail).toBe('a server this session started')
  })
})
