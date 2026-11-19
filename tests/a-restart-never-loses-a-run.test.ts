// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RESTART NEVER LOSES A RUN SILENTLY. Criterion M24 of design/messages/ACCEPTANCE.md, section 9.
 *
 * *A run in flight when the API restarts is resumed where its runtime allows, and otherwise ended
 * with a line in the conversation naming the restart; nothing the person wrote is lost either way.*
 *
 * Behind it: a merge landed just after a run went live, and the run was cut off.
 * Problem `Ldq6KsY1S2RW`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ACTUALLY BROKEN, MEASURED BEFORE ANY OF THIS WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * On a scratch stack on 4 September 2026: a message to an agent started a run; the API was restarted
 * through its supervisor and the run died in the gap. The restarted API's own startup sweep closes
 * every process row on its port whose process has gone, so it released the run's ledger row at
 * 14:23:17 — and `runsToPickUp` only listed runs with a LIVE row, so `GET /api/worker/runs` came
 * back empty. Nothing read the run's output, nothing wrote anything, the session record said
 * `running` for ever, and the conversation held the person's message and no answer.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A RESTART IS BUILT HERE, AND WHY THAT IS THE SAME FACT
 * ---------------------------------------------------------------------------------------
 *
 * A restart leaves three marks: the run's process is gone, its ledger row has been released by the
 * next start, and its session record was filed before the server now answering loaded its code.
 * This test makes all three — it stops the run's process group, releases the row through the
 * product's own door, and moves the record's `created_at` behind `thisServerLoadedAt()`. Moving the
 * stamp is the only one that goes round a door, and it is the one thing a test cannot do any other
 * way: this server loaded before any row in this database existed.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
let watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: (body ?? {}) as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function patch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'PATCH', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
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

/**
 * A MESSAGE, AND THE PERSON'S PRESS TO START AN AGENT FOR IT.
 *
 * Criterion M78: a message that would be answered by starting a NEW agent — one with no
 * conversation of its own here to pick up — waits for the person's press, and every agent in this
 * file is fresh. This file is about what a RESTART does to a run that is already going, so the
 * press is setup. It is sent as the person because it is refused to an agent.
 */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  const id = (filed['record'] as { id: string }).id
  await post(`/api/messages/${id}/start-an-agent`, {})
  return id
}

async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

async function conversation(agentId: string): Promise<{ sentBy: unknown; body: string; saidInFull: string | null }[]> {
  const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
    messages?: { sentBy: unknown; body: string; saidInFull: string | null }[]
  }
  return read.messages ?? []
}

async function runData(session: string): Promise<Record<string, unknown>> {
  const read = (await get(`/api/records/${session}`)) as { record?: { data?: Record<string, unknown> } }
  return read.record?.data ?? {}
}

/** Run passes until something is true, or say it never was. */
async function until(what: () => Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (await what()) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 100))
  }
}

/**
 * STOP A RUN'S PROCESS AND WAIT UNTIL IT REALLY HAS GONE.
 *
 * The wait is the point. A signal is a request, and the ledger's release door reads the process
 * table now: while the process is still dying, closing its row is a kill it insists on having
 * confirmed, and the row stays open. What a restart leaves behind is a row whose process has
 * already gone, so the test has to reach that state before it closes anything.
 */
async function theProcessIsGone(run: (typeof watching)[number]): Promise<void> {
  run.adapter.stop(run.handle, 'a restart of the API is being made to cut it off')
  const deadline = Date.now() + 10_000
  while (run.adapter.alive(run.handle)) {
    if (Date.now() >= deadline) throw new Error(`run ${run.session} would not stop`)
    await new Promise((go) => setTimeout(go, 50))
  }
}

/**
 * CLOSE THE RUN'S LEDGER ROW, the way the next start of the API closes one whose process has gone.
 *
 * ASSERTED RATHER THAN ASSUMED. `releaseResource` refuses to close a row whose session record still
 * says running unless the caller forces it, and a release that was quietly refused would leave a
 * LIVE row — so the test would go on believing it had reproduced a restart while the one thing the
 * restart takes away was still there. Measured on 4 September 2026: with this unasserted, mutating
 * `runsToPickUp` back to live-rows-only left every test in this file green.
 */
async function theLedgerRowIsClosed(session: string): Promise<void> {
  const rows = (await get(`/api/resources?sessionRecordId=${session}`)) as {
    resources?: { id: string; type: string; releasedAt: string | null }[]
  }
  const row = one(
    (rows.resources ?? []).filter((r) => r.type === 'process'),
    `the ledger row for run ${session}`,
  )
  const let_go = await post(`/api/resources/${row.id}/release`, {
    note: 'the process ended and the next start found it gone',
    // FORCED, BECAUSE THE SESSION RECORD STILL SAYS RUNNING and that is exactly the state a restart
    // leaves. The API's own startup sweep closes such a row without asking anybody, through
    // `closeRowThatStoppedMatching`; this is the same act through the door a caller has.
    force: true,
  })
  expect(let_go['outcome'], JSON.stringify(let_go)).toBeDefined()
  const after = (await get(`/api/resources?sessionRecordId=${session}&includeReleased=true`)) as {
    resources?: { id: string; releasedAt: string | null }[]
  }
  const closed = (after.resources ?? []).find((r) => r.id === row.id)
  expect(closed?.releasedAt, 'the ledger row was not closed, so this is not a restart').not.toBeNull()
}

/**
 * MAKE THE THREE MARKS A RESTART LEAVES, on a run that is going now.
 *
 * The process is stopped by the group id the adapter wrote down when it started it; the ledger row
 * is released through the product's own door, which is what the next start does to a row whose
 * process has gone; and the record is moved behind this server's own loading, which is the only
 * part that has no door, because this server loaded before any row in this database existed.
 */
async function aRestartCutsItOff(session: string): Promise<void> {
  const mine = one(
    watching.filter((run) => run.session === session),
    `the run ${session} in this worker's list`,
  )
  await theProcessIsGone(mine)
  await theLedgerRowIsClosed(session)
  const before = new Date(Date.now() - 60 * 60_000)
  const stamp = t.api.localStamp(before)
  // IMPORTED HERE AND NOT AT THE TOP OF THE FILE. src/server/lib/worker.ts opens the database when
  // it loads, and a test that imports it before `freshDb` has named one is refused by
  // src/server/db/client.ts — which is the check that stops a test opening the live corpus.
  const { thisServerLoadedAt } = await import('../src/server/lib/worker.ts')
  expect(stamp < thisServerLoadedAt(), 'the aged stamp is not before this server loaded').toBe(true)
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, session)
  // AND THIS WORKER FORGETS IT, exactly as a worker restarted with its server does. Everything after
  // this comes back through `GET /api/worker/runs`, which is the half the restart used to empty.
  watching = watching.filter((run) => run.session !== session)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-restart-runs-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
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

describe('a run a restart cut off, whose conversation nothing can pick up', () => {
  let agentId: string
  let messageId: string
  let session: string

  it('is found again even though the restart closed its ledger row', async () => {
    agentId = await anAgent('cut-off-x')
    messageId = await messageTo(agentId, 'please hang while the API restarts under you.')
    expect(await until(async () => watching.some((run) => run.messageId === messageId))).toBe(true)
    session = one(
      watching.filter((run) => run.messageId === messageId),
      'the run started for this message',
    ).session

    await aRestartCutsItOff(session)

    // THE HALF THAT USED TO BE EMPTY. A released row still says which process it was, and that is
    // all a worker needs to pick the run back up and read what it left.
    const runs = (await get('/api/worker/runs')) as { runs?: Record<string, unknown>[] }
    const found = one(
      (runs.runs ?? []).filter((r) => r['session'] === session),
      'the cut-off run in the list a restarted worker reads',
    )
    expect(found['startedBeforeThisServer']).toBe(true)
    expect(found['body']).toContain('please hang')
  }, 60_000)

  it('is ended with a line in the conversation naming the restart', async () => {
    expect(
      await until(async () => (await conversation(agentId)).some((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)),
    ).toBe(true)
    const said = (await conversation(agentId)).filter((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)
    expect(said).toHaveLength(1)
    // MOLE OFFICE SAYS IT, not the agent, which said nothing at all.
    expect(said[0]?.sentBy).toEqual(moleOffice())
    // THE FEW WORDS ARE THE BODY AND THE SENTENCE IS BESIDE IT, criterion M34. The block says what
    // happened; what it means for the person is the sentence the panel hangs off it.
    expect(said[0]?.body).toBe('Mole Office restarted')
    expect(said[0]?.saidInFull).toContain('Nothing you wrote was lost')
  }, 60_000)

  it('loses nothing that was written, and no record still saying it is running', async () => {
    // THE PERSON'S OWN MESSAGE IS UNTOUCHED, which is the half of the criterion about losing nothing.
    const stands = await delivery(messageId)
    expect(stands.because).toContain('Mole Office restarted')
    expect((await conversation(agentId)).some((m) => m.body.includes('please hang'))).toBe(true)
    // AND THE RUN'S OWN RECORD SAYS IT ENDED, with the two stamps that say why.
    const data = await runData(session)
    expect(data['state']).toBe('crashed')
    expect(String(data['doing'])).toContain('the API restarted while it was answering')
  }, 60_000)

  it('says it once, however many passes run', async () => {
    await onePass(settings, watching)
    await onePass(settings, watching)
    const said = (await conversation(agentId)).filter((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)
    expect(said).toHaveLength(1)
  }, 60_000)
})

describe('a run a restart cut off, whose conversation the runtime can pick up', () => {
  let agentId: string
  let messageId: string
  let session: string

  it('is carried on by a new run resuming the same conversation', async () => {
    agentId = await anAgent('carried-on-x')
    messageId = await messageTo(agentId, 'please hang, and this run knows its own conversation.')
    expect(await until(async () => watching.some((run) => run.messageId === messageId))).toBe(true)
    session = one(
      watching.filter((run) => run.messageId === messageId),
      'the run started for this message',
    ).session

    // A RUN THAT WAS RESUMING ONE CARRIES THE CONVERSATION ID FROM THE MOMENT IT STARTS, which is
    // what makes it resumable after a restart. A run that made its own says it only when it ends,
    // and one cut off before that has none — which is the case the block above covers.
    await patch(`/api/records/${session}`, { dataPatch: { providerSession: 'fake-a-conversation' } })
    await aRestartCutsItOff(session)

    expect(
      await until(async () => {
        const stands = await delivery(messageId)
        return (stands.because ?? '').includes('picked the conversation up')
      }),
    ).toBe(true)

    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    const carriedOnBy = /Run (\S+) picked the conversation up/.exec(stands.because ?? '')?.[1] ?? ''
    expect(carriedOnBy).not.toBe('')
    expect(carriedOnBy).not.toBe(session)
    // THE NEW RUN IS IN THE SAME CONVERSATION, which is what "resumed" means for these tools.
    expect((await runData(carriedOnBy))['providerSession']).toBe('fake-a-conversation')
  }, 60_000)

  it('writes no line, because the answer is still coming', async () => {
    expect((await conversation(agentId)).some((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)).toBe(false)
    expect((await runData(session))['state']).toBe('crashed')
  }, 60_000)
})

describe('a run that died on its own is not called a restart', () => {
  it('says the run ended without answering, and writes no line', async () => {
    const agentId = await anAgent('died-x')
    const messageId = await messageTo(agentId, 'please fail, because this run dies on its own.')
    expect(await until(async () => (await delivery(messageId)).because?.includes('without answering') === true)).toBe(
      true,
    )
    const stands = await delivery(messageId)
    expect(stands.because).toContain('The run ended without answering')
    expect(stands.because).not.toContain('Mole Office restarted')
    expect((await conversation(agentId)).some((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)).toBe(false)
  }, 60_000)

  it('refuses a run this very server started, however dead it is', async () => {
    // EVERY OTHER MARK OF A RESTART, AND NOT THE ONE THAT MATTERS. The process is gone and the
    // ledger row is closed, but the record was filed after this server loaded its code — so this
    // server started it, and a server cannot have restarted under a run it started itself. Without
    // the two stamps this run would be called a restart and the conversation would be told a lie.
    const agentId = await anAgent('after-this-server-x')
    const messageId = await messageTo(agentId, 'please hang, and nothing will age this record.')
    expect(await until(async () => watching.some((run) => run.messageId === messageId))).toBe(true)
    const mine = one(
      watching.filter((run) => run.messageId === messageId),
      'the run started for this message',
    )
    await theProcessIsGone(mine)
    await theLedgerRowIsClosed(mine.session)
    watching = watching.filter((run) => run.session !== mine.session)

    const refused = await post(`/api/worker/runs/${mine.session}/cut-off`, {})
    expect(String(refused['error'])).toContain('was not cut off by a restart')
    expect((await conversation(agentId)).some((m) => m.body === SYSTEM_LINES.aRestartCutARunOff.line)).toBe(false)
  }, 60_000)

  it('refuses the door for it, and says what a cut-off run is', async () => {
    const agentId = await anAgent('not-cut-off-x')
    const messageId = await messageTo(agentId, 'please fail again.')
    expect(await until(async () => (await delivery(messageId)).run !== null)).toBe(true)
    const session = (await delivery(messageId)).run ?? ''
    const refused = await post(`/api/worker/runs/${session}/cut-off`, {})
    expect(String(refused['error'])).toContain('was not cut off by a restart')
  }, 60_000)
})

describe('a run a person stopped is not a run a restart cut off', () => {
  it('ends the run record when it is stopped, so nothing can call it a restart later', async () => {
    const agentId = await anAgent('stopped-x')
    const messageId = await messageTo(agentId, 'please hang until somebody stops this run.')
    expect(await until(async () => watching.some((run) => run.messageId === messageId))).toBe(true)
    const mine = one(
      watching.filter((run) => run.messageId === messageId),
      'the run started for this message',
    )
    const rows = (await get(`/api/resources?sessionRecordId=${mine.session}`)) as {
      resources?: { id: string; type: string }[]
    }
    const row = one((rows.resources ?? []).filter((r) => r.type === 'process'), 'the ledger row for this run')
    const stopped = await post('/api/runtime/stop', { resourceId: row.id, why: 'the owner pressed stop' })
    expect(stopped['stopped'], JSON.stringify(stopped)).toBe(true)

    const data = await runData(mine.session)
    expect(data['state']).toBe('crashed')
    expect(String(data['doing'])).toContain('stopped the run serving this message')
    // AND THE DOOR REFUSES IT, whatever its stamps say, because its record no longer says running.
    const refused = await post(`/api/worker/runs/${mine.session}/cut-off`, {})
    expect(String(refused['error'])).toContain('was not cut off by a restart')
    watching = watching.filter((run) => run.session !== mine.session)
  }, 60_000)
})
