// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * AN AGENT A RUN IS ANSWERING FOR READS AS ANSWERING, FROM THE RUN'S START TO ITS END.
 *
 * Criterion M79 of design/messages/ACCEPTANCE.md section 41: an agent went offline the moment it had
 * spoken, which means nothing was holding a heartbeat for it.
 *
 * WHAT THE PRODUCT DID BEFORE. A run served an agent and presence read it off two things that both
 * end with the process: a live row in the resources ledger, and output written down inside the last
 * five minutes. Both are true while the tool is running and neither is a statement by the run about
 * what it is doing, so an agent read as Online while a process happened to exist and Offline the
 * moment it did not — including in the seconds between speaking and the record being patched.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A run the worker starts takes the same hold on the agent's handle that a terminal takes, and
 *    the agent reads as Answering while it is going.
 * 2. The reading says it is a RUN answering and not a session somebody has open, because those two
 *    mean different things to whoever is writing to it (criterion H3).
 * 3. Who is answering says the same, through `whoIsAnsweringAs`, which is the one reader the page
 *    and the worker share.
 * 4. When the run ends the hold is let go, with the reason on it, so the agent stops reading as a
 *    run answering at the moment the run ends rather than two windows later. Since criterion M89 the
 *    reading is then `a waiting run`: the run has answered and waits for the next message (M22).
 *
 * IT DRIVES THE REAL WORKER against a real server, with the fake runtime.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 3 cases, all green. Then, in src/worker/index.ts, `holdsTheHandle: heldHandle.ok`
 * was replaced by
 * `holdsTheHandle: false`, so the run takes the hold and then never beats it and never lets it go —
 * which is what the worker did before this criterion.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × lets the handle go when the run ends, so the agent stops reading as answering at once
 *
 * The change was put back and the control run again: 3 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { ANSWERING_WORD } from '../src/shared/messages.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** The agent's presence, as the chat panel reads it. */
async function reading(agentId: string): Promise<{ colour: string; word: string; from: string | null; says: string }> {
  const read = (await get(`/api/presence/agent/${agentId}`)) as {
    presence?: { colour: string; word: string; from: string | null; says: string }
  }
  if (read.presence === undefined) throw new Error('no presence came back')
  return read.presence
}

/** Who is answering as the agent, as the conversation and the worker both read it. */
async function answering(handle: string): Promise<{ how: string; session: string | null }> {
  const read = (await get(`/api/handles/${handle}`)) as { answering?: { how: string; session: string | null } }
  if (read.answering === undefined) throw new Error('no answer came back')
  return read.answering
}

/** The one hold on a handle, in whatever state it is in. */
async function theHold(handle: string): Promise<{ state: string; session: string; releasedBecause: string | null }> {
  const read = (await get('/api/handles')) as {
    holds?: { handle: string; state: string; session: string; releasedBecause: string | null }[]
  }
  return one((read.holds ?? []).filter((h) => h.handle === handle), `a hold on ${handle}`)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-run-holds-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a run answering for an agent', () => {
  let agentId: string
  let session = ''

  it('reads as offline before anything is answering, which is the control', async () => {
    agentId = await anAgent('answered-by-a-run')
    const before = await reading(agentId)
    expect(before.colour).toBe('grey')
    expect(before.from).toBeNull()
    expect((await answering('answered-by-a-run')).how).toBe('nobody')
  })

  it('holds the handle from the moment it starts, and the agent reads as Answering', async () => {
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something to answer',
      data: { body: 'Please read the loquat logs.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    // THE PERSON'S PRESS, because this agent is fresh and M78 holds a message that would start a
    // new agent. This file is about what happens once the run IS going.
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const started = one(
      (await onePass(settings, watching)).started.filter((run) => run.messageId === messageId),
      'the run started for this message',
    )
    session = started.session

    const hold = await theHold('answered-by-a-run')
    expect(hold.state).toBe('fresh')
    expect(hold.session).toBe(session)

    const now = await reading(agentId)
    expect(now.colour).toBe('green')
    expect(now.word).toBe(ANSWERING_WORD)
    // AND IT SAYS IT IS A RUN, not a session somebody has open. Criterion H3: the two carry
    // different things and a person writing needs to know which one will read the words.
    expect(now.from).toBe('a run answering as it')
    expect(now.says).toContain('A run Mole Office started for this agent')
    expect(now.says).toContain(session)

    const who = await answering('answered-by-a-run')
    expect(who.how).toBe('a run')
    expect(who.session).toBe(session)
  }, 40_000)

  it('lets the handle go when the run ends, so the agent stops reading as answering at once', async () => {
    for (let i = 0; i < 200 && watching.length > 0; i += 1) {
      await onePass(settings, watching)
      if (watching.length === 0) break
      await new Promise((go) => setTimeout(go, 50))
    }
    expect(watching.length, 'the run never ended').toBe(0)

    const hold = await theHold('answered-by-a-run')
    expect(hold.state).toBe('released')
    expect(hold.session).toBe(session)
    expect(String(hold.releasedBecause)).not.toBe('')

    // AND NO RUN IS ANSWERING AS IT ANY MORE. Not through the windows running out two minutes
    // later: through the run saying it is done. Until criterion M89 this read `nobody`. The run has
    // answered and started its wait for the next message (M22), so the reading now names that wait,
    // with the same run's session record.
    const after = await answering('answered-by-a-run')
    expect(after.how).not.toBe('a run')
    expect(after.how).toBe('a waiting run')
    expect(after.session).toBe(session)
  }, 40_000)
})
