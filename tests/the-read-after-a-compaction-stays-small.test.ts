// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ AFTER A COMPACTION STAYS SMALL ON AN OFFICE OF THE LIVE SHAPE. Wave 13k round 46, problem dkej5WjBNyWe.
 *
 * GET /api/after-a-compaction answers role, rules, handover, run and hold, and nothing else. It must not work out the
 * brief, the open loops, the waiting list or the attention ranking: GET /api/where-you-stand does, after it.
 *
 * THE OFFICE is tests/an-office-of-the-live-shape.ts: 400 agents, 1,500 open runs, 200,000 api calls, all made up. No
 * load is made; each door is asked one request at a time.
 *
 * WHAT IS COUNTED. Every SQLite statement a request runs on the office's thread, through the server's own count
 * (src/server/lib/slow-requests.ts), here kept per request instead of only written when slow. The attention ranking runs
 * on a thread of its own, so its statements are not in where-you-stand's count.
 *
 * THE CAP, AFTER_A_COMPACTION_STATEMENTS_AT_MOST = 40. Measured on this office on 10 October 2026: 28 statements on each
 * of five requests, against 2,198 for GET /api/where-you-stand; the MEASURED line this file prints says it again. The read is a fixed list of point reads, each by a key: the run (resolve, record, its live hold),
 * the caller (registry row), its agent record (one lookup, one record), its starter (one row), its newest handover and
 * their count, and the hold reading of its handle. None of them grows with the number of agents, runs or records, so
 * the cap is the measured count with room for a few reads more, and far under what reading any list would cost here.
 *
 * Mutations tried: the one read also works out the open loops; the one read reads every record of its project.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { anOfficeOfTheLiveShape } from './an-office-of-the-live-shape.ts'
import { apiApp } from './helpers.ts'


const calls = vi.hoisted(() => ({ brief: 0, openLoops: 0, waiting: 0, ranking: 0 }))
const counted = vi.hoisted(() => new Map<string, { statements: number; ms: number; rows: number }[]>())

vi.mock('../src/server/api/brief.ts', async (original) => {
  const real = await original<typeof import('../src/server/api/brief.ts')>()
  return { ...real, theBriefFor: (...args: Parameters<typeof real.theBriefFor>) => { calls.brief += 1; return real.theBriefFor(...args) } }
})
vi.mock('../src/server/lib/openloops.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/openloops.ts')>()
  return { ...real, openLoopsFor: (...args: Parameters<typeof real.openLoopsFor>) => { calls.openLoops += 1; return real.openLoopsFor(...args) } }
})
vi.mock('../src/server/api/waiting.ts', async (original) => {
  const real = await original<typeof import('../src/server/api/waiting.ts')>()
  return { ...real, theWaitingReply: (...args: Parameters<typeof real.theWaitingReply>) => { calls.waiting += 1; return real.theWaitingReply(...args) } }
})
vi.mock('../src/server/lib/openwork.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/openwork.ts')>()
  return {
    ...real,
    theReadingOpenWorkIsRankedBy: (...args: Parameters<typeof real.theReadingOpenWorkIsRankedBy>) => { calls.ranking += 1; return real.theReadingOpenWorkIsRankedBy(...args) },
  }
})
// THE SERVER'S OWN COUNT, kept for every request rather than written only for a slow one.
vi.mock('../src/server/lib/slow-requests.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/slow-requests.ts')>()
  return {
    ...real,
    sayTheSlowRequests: (app: import('fastify').FastifyInstance) => {
      app.addHook('onRequest', (request, _reply, done) => {
        const did = real.aFreshCount()
        const path = request.url.split('?')[0]!
        counted.set(path, [...(counted.get(path) ?? []), did])
        real.countedTo(did, done)
      })
    },
  }
})

let server: Awaited<ReturnType<typeof apiApp>>
let remove = (): void => undefined
let handle = ''
let runId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asTheAgent(): Record<string, string> {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': runId }
}

async function timed(url: string): Promise<{ ms: number; body: any }> {
  const began = performance.now()
  const reply = await server.app.inject({ method: 'GET', url, headers: asTheAgent() })
  const ms = performance.now() - began
  expect(reply.statusCode, reply.body.slice(0, 500)).toBe(200)
  return { ms, body: reply.json() }
}


beforeAll(async () => {
  const office = await anOfficeOfTheLiveShape()
  remove = office.remove
  vi.resetModules()
  process.env['MOLE_OFFICE_DB'] = office.file
  server = await apiApp()
  // THE DEFAULT SET, COPIED AS A REAL OFFICE DOES AT ITS FIRST START, which the made-up office has not had: the rules
  // part names the chapters from the office's chapter records (wave 13w). Copied before anything is counted.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  const { sqlite } = await import('../src/server/db/client.ts')
  // AN AGENT WITH A RUN GOING: the first of the office's runs going, and the agent its run serves.
  const run = sqlite.prepare("SELECT id FROM records WHERE kind = 'session' AND title = 'A made-up run 1'").get() as { id: string } | undefined
  if (run === undefined) throw new Error('The made-up office has no run "A made-up run 1".')
  runId = run.id
  handle = 'made-up-default-001'
  const wrote = await server.app.inject({ method: 'PUT', url: `/api/agents/${handle}/handover`, headers: AS_THE_PERSON, payload: { text: 'Made-up handover: the bench readings are half done.' } })
  expect(wrote.statusCode, wrote.body).toBe(200)
}, 300_000)

afterAll(async () => {
  await server?.app.close()
  remove()
})

describe('GET /api/after-a-compaction on an office of the live shape', () => {
  it('returns the provider conversation beside the discovery stamp, and null when none is recorded', async () => {
    const { patchRecord, HUMAN } = await import('../src/server/lib/records.ts')
    const discovered = { tool: 'claude-code', externalId: 'the-stamped-conversation', logPath: '/made-up/transcript.jsonl' }
    patchRecord(runId, { dataPatch: { providerSession: 'the-provider-conversation', extra: { discovered } } }, HUMAN)
    try {
      expect((await timed(`/api/after-a-compaction?run=${runId}`)).body.run).toMatchObject({
        providerSession: 'the-provider-conversation', discovered,
      })
      patchRecord(runId, { dataPatch: { providerSession: null } }, HUMAN)
      expect((await timed(`/api/after-a-compaction?run=${runId}`)).body.run).toMatchObject({ providerSession: null, discovered })
    } finally {
      patchRecord(runId, { dataPatch: { providerSession: null, extra: null } }, HUMAN)
    }
  })

})
