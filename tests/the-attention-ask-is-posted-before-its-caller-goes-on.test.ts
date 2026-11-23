// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASK TO AN ATTENTION THREAD THAT IS ALREADY READY IS POSTED BEFORE ITS CALLER GOES ON.
 *
 * GET /api/where-you-stand asks for the attention rule's reading first. It then reads what waits on a person on the
 * request thread, and only after that awaits the reading. The rule is meant to run on its own thread meanwhile.
 * It did not: the ask was posted only after `await thread.ready`, and an `await` lets the caller's code run first,
 * even when the thread said it was ready long before. So the rule began only after the caller's next lines.
 *
 * This file proves two things, on a fresh database file and with the real thread.
 *
 * 1. A THREAD THAT HAS SAID IT IS READY IS ASKED IN THE SAME STEP. The ask is posted before the call returns to its
 *    caller, with no `await` in between, and it is answered with a reading.
 * 2. A THREAD THAT HAS NOT SAID IT IS READY IS STILL WAITED FOR. With no thread running, nothing is posted in the
 *    step of the call. The thread starts, and the first ask is posted once and answered with a reading.
 */
import { Worker } from 'node:worker_threads'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
/** A made-up record the rule ranks, so a reading has a row to show. */
const MADE_UP = 'a-made-up-stopped-problem'

let office: TestDb
const spies: { mockRestore: () => void }[] = []

/** Watch every message this thread posts to a worker thread from now on. The attention thread's asks are among them. */
function watchThePosts() {
  const spy = vi.spyOn(Worker.prototype, 'postMessage')
  spies.push(spy)
  return spy
}

/** The asks among the messages posted so far. An ask has the id and the sent time it is given as it is posted. */
function theAsksIn(posted: ReturnType<typeof watchThePosts>): Record<string, unknown>[] {
  return posted.mock.calls
    .map(([message]) => message as unknown)
    .filter((message): message is Record<string, unknown> => typeof message === 'object' && message !== null && 'id' in message && 'sentAt' in message)
}

/** The ids of the records a reading ranks, in its order. */
function theRankedIds(read: { reading: { visible: { recordId: string | null }[]; remainder: { recordId: string | null }[] } }): (string | null)[] {
  return [...read.reading.visible, ...read.reading.remainder].map((row) => row.recordId)
}

beforeAll(async () => {
  office = await freshDb()
  office.client.sqlite
    .prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES (?, ?, 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
    )
    .run(MADE_UP, PROJECT, 'problem', 'A made-up stopped problem', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'A made-up delay' } }))
}, 120_000)

afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  const { endTheAttentionThread } = await import('../src/server/lib/attention-thread.ts')
  await endTheAttentionThread()
})

afterAll(() => {
  office.close()
})

describe('the ask for the reading open work is ranked by', () => {
  it('is posted to a thread that has said it is ready before the call returns to its caller, and is answered with a reading', async () => {
    const { startAttentionThreadEarly } = await import('../src/server/lib/attention-thread.ts')
    const { theReadingOpenWorkIsRankedBy } = await import('../src/server/lib/openwork.ts')
    await startAttentionThreadEarly()

    const posted = watchThePosts()
    const ranking = theReadingOpenWorkIsRankedBy(PROJECT)
    // NO AWAIT BETWEEN THE CALL AND THIS LINE. A caller goes on to other work here, as GET /api/where-you-stand does.
    const askedInTheSameStep = theAsksIn(posted)
    const read = await ranking

    expect(askedInTheSameStep, 'the asks posted before the call returned to its caller').toHaveLength(1)
    expect(askedInTheSameStep[0]).toMatchObject({ id: expect.any(Number), sentAt: expect.any(Number), asked: { shape: 'ranking' } })
    expect(theAsksIn(posted), 'the asks posted in all').toHaveLength(1)
    expect(theRankedIds(read), 'the reading ranks the made-up stopped problem').toContain(MADE_UP)
  }, 120_000)

  it('still waits for a thread that has not said it is ready, and answers the first ask with a reading', async () => {
    const { endTheAttentionThread } = await import('../src/server/lib/attention-thread.ts')
    const { theReadingOpenWorkIsRankedBy } = await import('../src/server/lib/openwork.ts')
    await endTheAttentionThread()

    const posted = watchThePosts()
    const ranking = theReadingOpenWorkIsRankedBy(PROJECT)
    const askedInTheSameStep = theAsksIn(posted)
    const read = await ranking

    expect(askedInTheSameStep, 'the asks posted before a thread that was not running said it is ready').toEqual([])
    expect(theAsksIn(posted), 'the asks posted once the thread said it is ready').toHaveLength(1)
    expect(theRankedIds(read), 'the reading ranks the made-up stopped problem').toContain(MADE_UP)
  }, 120_000)
})
