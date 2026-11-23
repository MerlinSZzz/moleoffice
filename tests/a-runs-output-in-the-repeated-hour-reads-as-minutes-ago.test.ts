// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S OUTPUT OR USE IN THE REPEATED HOUR READS AS MINUTES AGO.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * The words beside an agent's grey dot say how long ago a run of the agent last wrote down output or used a tool. Both
 * clocks are local stamps with no offset (`lastOutputAt` on the run, `at` on the use), and presence read them as the
 * first pass of the repeated hour. So output written down at 01:10 winter time read, two minutes later, as 62 minutes
 * ago. The run keeps the moment of its output beside the stamp (`lastOutputTime`), and a use keeps the moment of its
 * stamp (`at_instant`). That moment only says which pass of the hour its stamp means, so presence reads it only when it
 * names the stamp beside it: its first 19 characters are the stamp, with T for the space. A stamp changed without its
 * moment is read from its words, as before.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here.
 * Each run is filed through the record door with the output its worker would write down, one clock reading for the stamp
 * and its moment, and each use goes through the use door, except the rows cases 3 and 4 write, which say why.
 *
 *   1. Output written down at 01:10 winter time on 25 October reads at 01:12 winter time as two minutes ago, and so
 *      does a use of a tool made at 01:10 winter time.
 *   2. On 28 March 2027, output written down at 00:30 winter time reads at 02:30 summer time as 60 minutes ago, and a
 *      use made at 02:30 summer time reads two minutes later as two minutes ago.
 *   3. Control: output written down with no moment beside it, and a use written before a use kept its moment, at the
 *      stamp 01:10, are read from their words as before: at 01:12 winter time, 62 minutes ago.
 *   4. A stamp changed alone is read from its words, as before. Output written down and a use made at noon on
 *      2 November 2026, with their stamps then set to 11:00, read at 12:02 as 62 minutes ago.
 *
 * Without the code, case 1 is red. Cases 2, 3 and 4 are green. A reader that reads the moment whenever it is there,
 * without asking whether it names its stamp, turns case 4 red: it reads both as two minutes ago.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type Presence = typeof import('../src/server/lib/presence.ts')
type Time = typeof import('../src/shared/time.ts')

const MINUTE = 60_000

/** 01:10 winter time, 25 October 2026, in the second pass of the repeated hour. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:30 winter time, 28 March 2027, half an hour before the skipped hour. */
const BEFORE_THE_SKIP = Date.UTC(2027, 2, 28, 0, 30, 0)
/** 02:30 summer time, 28 March 2027, half an hour after the skipped hour, and an hour after the one above. */
const AFTER_THE_SKIP = Date.UTC(2027, 2, 28, 1, 30, 0)
/** Noon, 2 November 2026, in winter time and far from either change of the clocks. */
const NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 0, 0)

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const TOOL = 'made-up-copy'

let t: TestDb
let app: FastifyInstance
let presence: Presence
let time: Time
let theZoneBefore: string | undefined

beforeAll(async () => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  presence = await import('../src/server/lib/presence.ts')
  time = await import('../src/shared/time.ts')
  // A TOOL FOR THE USE DOOR TO WRITE A USE OF.
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Made-up tools', data: { says: 'Made up.' }, actor: t.api.HUMAN }).id
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'tool',
    title: 'Made-up copy',
    data: { entry: 'tool', slug: TOOL, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: t.api.HUMAN,
  })
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** Register an agent through the door, and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** A running run of the agent, filed through the record door with `data` beside what says whose it is. */
function aRunningRunOf(agentId: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `A made-up run of ${agentId}`,
    data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: WORKSPACE, agentId }], ...data },
    actor: t.api.HUMAN,
  }).id
}

/** Output written down now, as the worker writes it: the stamp and its moment from one clock reading. */
function outputWrittenDownNow(): Record<string, unknown> {
  const reading = time.clockStamp()
  return { lastOutputAt: reading.stamp, lastOutputTime: reading }
}

/** One use of the made-up tool on the run, through the use door, on the clock as it is set. */
async function aUseNow(run: string): Promise<void> {
  const used = await app.inject({
    method: 'POST',
    url: '/api/toolset/uses',
    headers: { ...AS_THE_PERSON, 'x-mole-office-session': run },
    payload: { tool: TOOL, said: 'make: a made-up use' },
  })
  expect(used.statusCode, used.body.slice(0, 300)).toBe(201)
}

/** The words beside the agent's dot, read on the clock as it is set. */
function theWordsBeside(agentId: string): string {
  return presence.participantPresence({ kind: 'agent', id: agentId }, WORKSPACE).says
}

describe('a run’s output or use in the repeated hour reads as minutes ago', () => {
  it('1. output and a use at 01:10 winter time read at 01:12 as two minutes ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const writing = await anAgent('output-in-the-second-pass')
    aRunningRunOf(writing, outputWrittenDownNow())
    const using = await anAgent('a-use-in-the-second-pass')
    await aUseNow(aRunningRunOf(using))

    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST + 2 * MINUTE)
    expect(theWordsBeside(writing)).toContain('wrote down output 2 minutes ago')
    expect(theWordsBeside(using)).toContain('used a tool 2 minutes ago')
  })

  it('2. on the night the clocks go forward, output is 60 minutes old across the skipped hour, and a use after it is two', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BEFORE_THE_SKIP })
    const writing = await anAgent('output-before-the-skip')
    aRunningRunOf(writing, outputWrittenDownNow())

    vi.setSystemTime(AFTER_THE_SKIP)
    expect(theWordsBeside(writing)).toContain('60 minutes ago')
    const using = await anAgent('a-use-after-the-skip')
    await aUseNow(aRunningRunOf(using))
    vi.setSystemTime(AFTER_THE_SKIP + 2 * MINUTE)
    expect(theWordsBeside(using)).toContain('used a tool 2 minutes ago')
  })

  it('3. control: output and a use with no moment are read from their words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const writing = await anAgent('output-with-no-moment')
    // Output written down as a run wrote it before a moment was kept beside it: the stamp alone.
    aRunningRunOf(writing, { lastOutputAt: '2026-10-25 01:10:00' })
    const using = await anAgent('a-use-with-no-moment')
    const run = aRunningRunOf(using)
    // WRITTEN BY HAND, AS A USE WRITTEN BEFORE A USE KEPT ITS MOMENT: the columns the use door wrote then. No door
    // writes a use without its moment now.
    t.client.sqlite
      .prepare(
        "INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id) VALUES ('a-made-up-old-use', ?, ?, 1, '2026-10-25 01:10:00', ?, 'make: a made-up use', 'human', ?)",
      )
      .run(WORKSPACE, run, TOOL, THE_PERSON)

    // Their words read as the first pass, 00:10 UTC, so at 01:12 winter time they are 62 minutes old.
    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST + 2 * MINUTE)
    expect(theWordsBeside(writing)).toContain('62 minutes ago')
    expect(theWordsBeside(using)).toContain('62 minutes ago')
  })

  it('4. output and a use with their stamps changed alone are read from their words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOON_IN_NOVEMBER })
    const writing = await anAgent('output-with-its-stamp-changed-alone')
    const writingRun = aRunningRunOf(writing, outputWrittenDownNow())
    const using = await anAgent('a-use-with-its-stamp-changed-alone')
    const usingRun = aRunningRunOf(using)
    await aUseNow(usingRun)
    // WRITTEN BY HAND, AS A TEST OR A WRITER THAT KNOWS ONLY THE STAMP AGES OUTPUT OR A USE: the door's own rows, with
    // each stamp set an hour back and its moment left as the door wrote it. The record door and the use door never
    // change the stamp alone.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.lastOutputAt', '2026-11-02 11:00:00') WHERE id = ?").run(writingRun)
    t.client.sqlite.prepare("UPDATE tool_uses SET at = '2026-11-02 11:00:00' WHERE run_id = ?").run(usingRun)

    // Each moment names noon, not 11:00, so it is passed over, and the stamps say 62 minutes at 12:02.
    vi.setSystemTime(NOON_IN_NOVEMBER + 2 * MINUTE)
    expect(theWordsBeside(writing)).toContain('62 minutes ago')
    expect(theWordsBeside(using)).toContain('62 minutes ago')
  })
})
