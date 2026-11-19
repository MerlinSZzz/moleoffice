// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINK FROM A RUN FILED IN THE PROJECT READS ONLY THAT RUN, AND GIVES WHAT IT GAVE.
 *
 * Round 107 of wave 13y, the third pass over the API's speed. POST /api/sessions/:id/link found the run it links from
 * through the sweep of every session (`getSession` in src/server/lib/sessions.ts): every run of the project and every
 * transcript on the computer. On the made-up office at the 22 October scale, built by tools/build-a-made-up-office.ts,
 * a link took 142 ms and 14,624 statements so, and takes 22 ms and 33 statements reading the one run it is asked about.
 *
 * WHAT IS HELD HERE:
 *   1. `linkSession` gives the run's record, whether it filed one, and where the run stands, as the link before the
 *      change gave them: the sweep's row of the id, the record that row has, and the placement of the row's id. That link
 *      is written out here. The ids: a run with no stamp; a stamped run whose transcript is on disk; a stamped run whose
 *      transcript is not; two runs with one stamp; a run named by its tool and conversation; a conversation on disk that
 *      no record holds, which the link files; and, refused by both, a deleted run, a run of another project and a record
 *      that is not a run.
 *   2. A link from a run filed in the project walks no folder of transcripts and does not read the project's runs: a run
 *      that nothing links to is not read. Where the run stands is read from the project's links and changes, as before.
 *
 * Every run, transcript and record here is made up.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
/**
 * The doing line of a run nothing links to, which only a read of the project's runs gives back. Where a run stands is
 * read from the project's links and changes, which give back the title of each record they name, and no run's data.
 */
const NOBODY_LINKS_IT = 'A made-up doing line of a run that nothing links to'
const ELSEWHERE = 'made-up-elsewhere'
const ACTOR = { type: 'human' as const, id: THE_PERSON }
const headers = (workspace: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })

let t: TestDb
let app: FastifyInstance
let S: typeof import('../src/server/lib/sessions.ts')
const home = mkdtempSync(join(tmpdir(), 'mole-office-link-'))
const projectDir = join(home, '.claude', 'projects', '-made-up-project')

/** How many times the sweep asked where the transcripts are. */
let walks = 0
const env: AdapterEnv = {
  get homeDir() {
    walks += 1
    return home
  },
  now: new Date(),
  scanProcesses: () => ({ ok: true, processes: [] }),
  runningWithinSeconds: 5 * 60,
  orphanAfterSeconds: 6 * 60 * 60,
}

/** The ids asked about, by what each is. */
const ids = new Map<string, string>()
/** A task for each link to point at, so no two links are the same link. */
const targets = new Map<string, string>()

async function post(url: string, body: unknown, workspace = HERE): Promise<string> {
  const reply = await app.inject({ method: 'POST', url, headers: headers(workspace), payload: JSON.stringify(body) })
  expect(reply.statusCode, `POST ${url}: ${reply.body}`).toBeLessThan(300)
  return (reply.json() as { record: { id: string } }).record.id
}

/** A transcript of a made-up conversation, written an hour ago. */
function aTranscript(externalId: string): string {
  const logPath = join(projectDir, `${externalId}.jsonl`)
  writeFileSync(logPath, `${JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'made-up' }, timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), userType: 'external', entrypoint: 'cli', cwd: '/made-up-project', version: '2.1.223' })}\n`)
  return logPath
}

function aStamp(externalId: string): Record<string, unknown> {
  return { extra: { discovered: { tool: 'claude-code', externalId, logPath: join(projectDir, `${externalId}.jsonl`), observedState: 'running', at: '2026-10-29 11:00:00' } } }
}

/** What a link is held to: the run's record, whether the link filed it, and where the run stands; or the refusal. */
type WhatALinkGave = { sessionRecordId: string; createdSessionRecord: boolean; placement: unknown } | { refused: string }

/** THE LINK BEFORE THE CHANGE, written out as it was, read after the link was made, as it read the placement. */
function theLinkBeforeTheChange(id: string): WhatALinkGave {
  const view = S.getSession(id, HERE, env)
  if (view === null) return { refused: S.noSessionToLinkHasThisId(id).message }
  const { record, created } = S.ensureSessionRecord(view, ACTOR, HERE, env)
  return { sessionRecordId: record.id, createdSessionRecord: created, placement: S.sessionPlacement(view.id, record.id, HERE) }
}

function theLinkNow(is: string): WhatALinkGave {
  try {
    const made = S.linkSession(ids.get(is)!, { toId: targets.get(is)!, type: 'relates_to' }, ACTOR, HERE, env)
    return { sessionRecordId: made.sessionRecordId, createdSessionRecord: made.createdSessionRecord, placement: made.placement }
  } catch (error) {
    return { refused: (error as Error).message }
  }
}

/** Each statement `run` prepares and runs, with what it gave back. */
function theStatementsOf(run: () => unknown): { sql: string; gave: string }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const ran: { sql: string; gave: string }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const gave = call.apply(this, args)
        ran.push({ sql: text, gave: JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '' })
        return gave
      }
    }
    return statement
  }
  try {
    run()
  } finally {
    sqlite.prepare = prepare
  }
  return ran
}

const THE_CASES = [
  'a run with no stamp',
  'a stamped run whose transcript is on disk',
  'a stamped run whose transcript is not',
  'the first of two runs with one stamp',
  'the second of two runs with one stamp',
  'a run named by its tool and conversation',
  'a conversation on disk that no record holds',
  'a deleted run',
  'a run of another project',
  'a record that is not a run',
] as const

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  S = await import('../src/server/lib/sessions.ts')
  mkdirSync(projectDir, { recursive: true })
  const run = (data: Record<string, unknown>, workspace = HERE) => post('/api/records', { kind: 'session', title: 'A made-up run', data: { state: 'running', runtime: 'claude-code', doing: 'made-up', ...data } }, workspace)
  aTranscript('dddddddd-0000-4000-8000-000000000001')
  aTranscript('dddddddd-0000-4000-8000-000000000002')
  ids.set('a run with no stamp', await run({}))
  ids.set('a stamped run whose transcript is on disk', await run(aStamp('dddddddd-0000-4000-8000-000000000001')))
  ids.set('a stamped run whose transcript is not', await run(aStamp('dddddddd-0000-4000-8000-000000000003')))
  ids.set('the first of two runs with one stamp', await run(aStamp('dddddddd-0000-4000-8000-000000000004')))
  ids.set('the second of two runs with one stamp', await run(aStamp('dddddddd-0000-4000-8000-000000000004')))
  ids.set('a run named by its tool and conversation', 'claude-code:dddddddd-0000-4000-8000-000000000001')
  ids.set('a conversation on disk that no record holds', 'claude-code:dddddddd-0000-4000-8000-000000000002')
  const gone = await run({})
  t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-10-29 11:00:00' WHERE id = ?").run(gone)
  ids.set('a deleted run', gone)
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'Made-up elsewhere' })
  ids.set('a run of another project', await run({}, ELSEWHERE))
  for (const is of [...THE_CASES, 'a second link']) targets.set(is, await post('/api/records', { kind: 'task', title: `A made-up task for ${is}`, data: { state: 'todo' } }))
  ids.set('a record that is not a run', targets.get('a second link')!)
  await run({ doing: NOBODY_LINKS_IT })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

describe('a link from a run', () => {
  for (const is of THE_CASES) {
    it(`1. gives what the link before the change gave: ${is}`, () => {
      const now = theLinkNow(is)
      const before = theLinkBeforeTheChange(ids.get(is)!)
      if (is === 'a conversation on disk that no record holds') {
        // FILED BY THE LINK, so the link written out after it finds the record the link filed.
        expect(now).toMatchObject({ createdSessionRecord: true })
        expect({ ...now, createdSessionRecord: false }).toEqual(before)
      } else {
        expect(now).toEqual(before)
      }
      expect('refused' in now, JSON.stringify(now)).toBe(['a deleted run', 'a run of another project', 'a record that is not a run'].includes(is))
    })
  }

  it("2. from a run filed in the project walks no folder of transcripts and does not read the project's runs", () => {
    walks = 0
    const ran = theStatementsOf(() => S.linkSession(ids.get('a run with no stamp')!, { toId: targets.get('a second link')!, type: 'relates_to' }, ACTOR, HERE, env))
    expect(walks).toBe(0)
    expect(ran.filter((one) => one.gave.includes(NOBODY_LINKS_IT)).map((one) => one.sql)).toEqual([])
    // CONTROL: the sweep the link went through before walks the folders and reads the run nothing links to.
    const swept = theStatementsOf(() => S.getSession(ids.get('a run with no stamp')!, HERE, env))
    expect(walks).toBeGreaterThan(0)
    expect(swept.filter((one) => one.gave.includes(NOBODY_LINKS_IT))).not.toEqual([])
  })
})
