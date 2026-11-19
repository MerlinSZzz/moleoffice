// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old fixture finished without a submitted checkout. These historical runs are now explicitly inventoried; all identity, check-start and release assertions remain. */
/**
 * A RUN THAT NAMED ITS AGENT BY RECORD ID IS STILL A RUN SOMEBODY CAN CHECK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON THE RUN THAT WROTE THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * Run `o2RjuOUEIwpf` filed itself on 7 September 2026 with
 * `servingAgent: "2rBbYVnVHvq_"` — the id of the `agent` RECORD for the agent it served. It then said its
 * work was finished, and `GET /api/checks/o2RjuOUEIwpf` answered:
 *
 *     workArea: null
 *
 * which the product reads out as *a run nobody can check this way, not a run with nothing to
 * check*. The work area was registered and correct the whole time — six paths, filed by the secretary when
 * it started the agent — and nothing could reach it.
 *
 * WHY IT HAPPENED. `theAgentOfARun` tried two names: the handle, through `agentByHandle`, and the
 * REGISTRY id, through `listParticipants()`. The id of the agent's own record is a third name and
 * it tried neither. The join from a record to its registry row, `agentForRecord`, was already
 * written in src/server/lib/participants.ts and this reading simply did not use it.
 *
 * WHY A WRITER LANDED ON THAT SPELLING. The session kind then described `servingAgent` as the
 * agent's *id in the agent registry*, and `ranAs.agentId` beside it is REFUSED unless it holds the
 * record id. A run filling both fields from what it was handed writes the record id in both, and is
 * then invisible to its own check. So this is not a typo to be avoided by being careful. Wave 4
 * corrected that description on 23 September 2026, so a writer reading it today is told the field
 * holds the name the filer used and that `servingAgentId` holds the registry id.
 *
 * WHY IT MATTERS MORE THAN ONE RUN. Everything the check does hangs off the agent: the work area
 * (C25), the chapters its brief named (C15), who started it and therefore who may release it, and
 * who is told when a refusal opens a group (C26). A run that resolves to no agent quietly loses all
 * of them at once, and reads as a run nobody registered anything for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Take the `agentForRecord` line off the end of `theAgentOfARun` and ALL THREE cases go red.
 *     Measured, and written down here because the first draft of this file predicted two: the third
 *     case compares the record-id answer against the handle answer, so it fails with the other two
 *     rather than standing outside them.
 *
 *     WHAT THE THIRD CASE IS FOR, GIVEN THAT. It is the one that would catch this change breaking
 *     the spelling that always worked. A run naming its agent by handle resolved before and must
 *     resolve to the SAME agent and the SAME work area now — so if a later edit made the record-id
 *     path answer some other agent, this case fails where the first two would not notice.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** The area the worker registered when the secretary started it. */
const THE_AREA = ['src/server/lib', 'tools', 'tests']

let t: TestDb
let app: FastifyInstance
/** The id of the `agent` RECORD for the worker — not its handle, and not its registry id. */
let theAgentRecord = ''

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** File a finished run whose `servingAgent` is whatever the caller spells it. */
async function aFinishedRunNaming(servingAgent: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('the-worker'),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent, doing: 'the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(id)
  return id
}

async function theCheck(run: string): Promise<{ agent: { handle: string } | null; workArea: string[] | null; workAreaSays: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { agent: { handle: string } | null; workArea: string[] | null; workAreaSays: string }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'the-worker', name: 'The Worker', role: 'worker', workArea: THE_AREA })

  // THE RECORD ID, READ THE WAY A STARTER READS IT: off the agent's own record in this project.
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(listed.statusCode, listed.body).toBe(200)
  const found = (listed.json() as { agents: { handle: string; record?: string | null }[] }).agents.find(
    (one) => one.handle === 'the-worker',
  )
  const byTitle = await app.inject({
    method: 'GET',
    url: '/api/records?kind=agent',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
  })
  theAgentRecord =
    found?.record ??
    ((byTitle.statusCode === 200
      ? (byTitle.json() as { records?: { id: string; title: string }[] }).records?.find((r) => r.title === 'The Worker')
          ?.id
      : undefined) ?? '')
  expect(theAgentRecord, 'the agent record id could not be read; the test cannot pose its question').not.toBe('')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a run that named its agent by the id of its agent record', () => {
  it('still resolves to that agent', async () => {
    const run = await aFinishedRunNaming(theAgentRecord, 'A run that named its agent by record id')
    const read = await theCheck(run)
    expect(read.agent, 'the run resolved to no agent at all').not.toBe(null)
    expect(read.agent?.handle).toBe('the-worker')
  })

  it('still carries the work area, so it is not read as a run nobody can check', async () => {
    const run = await aFinishedRunNaming(theAgentRecord, 'A run whose work area has to be reachable')
    const read = await theCheck(run)
    expect(read.workArea).toEqual(THE_AREA)
    expect(read.workAreaSays).not.toContain('Nobody recorded a work area')
  })

  it('is the same answer a run naming the handle gets, which is the control', async () => {
    const byHandle = await theCheck(await aFinishedRunNaming('the-worker', 'A run that named its agent by handle'))
    const byRecord = await theCheck(await aFinishedRunNaming(theAgentRecord, 'A run that named its agent by record id'))
    expect(byHandle.agent?.handle).toBe('the-worker')
    expect(byRecord.agent?.handle).toBe(byHandle.agent?.handle)
    expect(byRecord.workArea).toEqual(byHandle.workArea)
  })
})
