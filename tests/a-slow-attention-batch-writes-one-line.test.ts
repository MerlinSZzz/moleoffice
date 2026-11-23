// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SLOW BATCH OF THE ATTENTION THREAD WRITES ONE LINE THAT SAYS WHAT IT DID.
 *
 * On 21 November 2026 the owner's Home read took 24.2 s and 34.2 s. Its own SQLite time was 0.1 ms, and the request
 * thread was held for 1.6 s and 9.8 s of it. The rest was on the attention thread, or waiting for it, and the thread
 * wrote nothing about it. `answerOneBatch` (src/server/lib/attention-thread-worker.ts) now times each batch: the asks
 * waiting at the thread's port, answered together. When the batch took over `A_SLOW_ATTENTION_BATCH_MS`, or one ask's
 * wait at the port and its answer together did, it writes one line: each ask's kind, project, wait and answer, the
 * readings it used and whether it failed, and each reading's project and time.
 *
 * THE CLOCK IS MOVED, NEVER WAITED ON. The answering is handed a clock this file moves. A reading moves it inside a
 * wrapped `attentionWithTheseHidden`, cutting a reading to its shape moves it 5 ms, and sending an answer 1 ms more.
 * The reading files are made up, because the line depends on no record. No test sleeps.
 *
 * ONE ASK ON THE REAL THREAD, at the end, proves the clock both threads read. The ask the request thread posts carries
 * its sent time on the scale of `Date.now()`. Its sent time is moved 5 s back on the way, and the thread, with no clock
 * handed in, finds that wait and writes the line through its port to the server's log.
 *
 * MUTATIONS THIS FILE MUST GO RED FOR, which the supervisor runs:
 *   - the limit compared with `>=`, or a line written for a batch inside the limit;
 *   - no line when only an ask's wait and answer pass the limit;
 *   - a shared reading timed twice, or listed again for each ask that shares it;
 *   - a reading's time left out, or the cut and the send counted in it;
 *   - an ask's answer timed before its answer was sent, or its wait left out;
 *   - a time written with its fraction of a millisecond;
 *   - the reader, a resource, the clock, a hidden message, a part's `from` or `machine`, or an ask's id in the line;
 *   - an error's words in the line, or a failed ask not said to have failed;
 *   - a batch that failed as a whole left without a line, or the asks its failure answered not marked failed;
 *   - `performance.now()` used across threads with no `timeOrigin`, on either thread;
 *   - the line not sent through the port as `{ log }`.
 */
import { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AttentionShape } from '../src/server/lib/attention-shapes.ts'
import * as worker from '../src/server/lib/attention-thread-worker.ts'
import type { AttentionAnswer, AttentionAsk, TheReadingFiles } from '../src/server/lib/attention-thread-worker.ts'
import type { AttentionReading } from '../src/server/lib/records.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Answer = Exclude<AttentionAnswer, { ready: true }>

const LIMIT = worker.A_SLOW_ATTENTION_BATCH_MS
/** How long cutting a reading to its shape takes by this file's clock, and how long sending an answer takes. */
const CUT_MS = 5
const SEND_MS = 1

/** The clock the answering is handed. Only this file moves it. */
let at = 0
const clock = (): number => at
beforeEach(() => {
  at = 1_000_000
})

/** The same resources and clock for every made-up ask, so two asks of one project are alike. */
const PLAIN = { resources: [], now: Date.UTC(2026, 10, 21) }
const of = (workspaceId: string): { workspaceId: string; resources: never[]; now: number } => ({ workspaceId, ...PLAIN })

/** Made-up reading files. A reading of a project moves the clock by `slow[project]`, and a reading of `failing` throws. */
function readingFiles(
  slow: Readonly<Record<string, number>>,
  also: { hidden?: readonly string[]; failing?: { project: string; words: string } } = {},
): { files: TheReadingFiles; workedOut: string[] } {
  const workedOut: string[] = []
  const files: TheReadingFiles = {
    records: {
      theMessagesHiddenFromTheAttentionReader: () => [...(also.hidden ?? [])],
      attentionWithTheseHidden: (input) => {
        workedOut.push(input.workspaceId)
        at += slow[input.workspaceId] ?? 0
        const failing = also.failing
        if (failing !== undefined && input.workspaceId === failing.project) throw new Error(failing.words)
        return { madeUpReadingOf: input.workspaceId } as unknown as AttentionReading
      },
    },
    shapes: {
      attentionInTheShape: ((asked: AttentionShape) => {
        at += CUT_MS
        return { cut: asked.shape }
      }) as unknown as TheReadingFiles['shapes']['attentionInTheShape'],
      homeAttention: (() => {
        at += CUT_MS
        return { cut: 'home' }
      }) as unknown as TheReadingFiles['shapes']['homeAttention'],
    },
    messages: { withEachHiddenListWorkedOutOnce: (work) => work() },
  }
  return { files, workedOut }
}

/** One batch, answered as the thread answers it, by this file's clock. */
function oneBatch(
  asks: readonly AttentionAsk[],
  files: TheReadingFiles,
  together: Parameters<typeof worker.answerOneBatch>[1] = (send, timed) => worker.answerTheseAsksTogether(asks, null, files, send, timed),
): { answers: Answer[]; lines: string[] } {
  const answers: Answer[] = []
  const lines: string[] = []
  worker.answerOneBatch(
    asks,
    together,
    (answer) => {
      at += SEND_MS
      answers.push(answer)
    },
    (line) => lines.push(line),
    clock,
  )
  return { answers, lines }
}

describe('a batch of the attention thread', () => {
  it('writes one line when a reading took over the limit, with each ask and each reading as the clock gave them', () => {
    expect(LIMIT).toBe(2000)
    const { files, workedOut } = readingFiles({ default: 2100, second: 40 })
    const asks: AttentionAsk[] = [
      { id: 1, sentAt: at - 30, input: of('default'), asked: { shape: 'home' } },
      { id: 2, sentAt: at - 30, input: of('default'), asked: { shape: 'part', part: 'homeRemainder', from: 0 } },
      { id: 3, sentAt: at - 12, input: of('second'), asked: { shape: 'flow' } },
    ]
    const { answers, lines } = oneBatch(asks, files)
    expect(answers.map((one) => [one.id, 'shaped' in one])).toEqual([[1, true], [2, true], [3, true]])
    expect(workedOut).toEqual(['default', 'second'])
    // Ask 1: its reading took 2100 ms, its cut 5 and its send 1, so it was answered at 2106. Ask 2 shares the reading.
    expect(lines).toEqual([
      'The attention thread answered 3 asks together in 2158 ms. ' +
        'Ask 1, home of project default: waited 30 ms, answered at 2106 ms, from reading 1. ' +
        'Ask 2, part homeRemainder of project default: waited 30 ms, answered at 2112 ms, from reading 1. ' +
        'Ask 3, flow of project second: waited 12 ms, answered at 2158 ms, from reading 2. ' +
        'Reading 1, project default, 2100 ms. Reading 2, project second, 40 ms.',
    ])
  })

  it('writes no line when the batch and every wait stay inside the limit, and none for a batch of exactly the limit', () => {
    const fast = readingFiles({ default: 100, second: 100 })
    const quick = oneBatch(
      [
        { id: 1, sentAt: at - 10, input: of('default'), asked: { shape: 'home' } },
        { id: 2, sentAt: at - 10, forEach: PLAIN, each: ['default', 'second'] },
      ],
      fast.files,
    )
    expect(quick.answers).toHaveLength(2)
    expect(quick.lines).toEqual([])

    // EXACTLY THE LIMIT: the batch took 2000 ms, and its one ask did not wait.
    const exactly = readingFiles({ default: LIMIT - CUT_MS - SEND_MS })
    const atTheLimit = oneBatch([{ id: 1, sentAt: at, input: of('default'), asked: { shape: 'flow' } }], exactly.files)
    expect(atTheLimit.answers).toHaveLength(1)
    expect(atTheLimit.lines).toEqual([])

    // EXACTLY THE LIMIT, the wait and the answer together: waited 500 ms, answered at 1500 ms.
    const half = readingFiles({ default: 1500 - CUT_MS - SEND_MS })
    expect(oneBatch([{ id: 1, sentAt: at - 500, input: of('default'), asked: { shape: 'whole' } }], half.files).lines).toEqual([])

    // ONE MILLISECOND OVER writes it, so the two above wrote none because they were at the limit.
    const over = readingFiles({ default: LIMIT - CUT_MS - SEND_MS + 1 })
    expect(oneBatch([{ id: 1, sentAt: at, input: of('default'), asked: { shape: 'flow' } }], over.files).lines).toEqual([
      'The attention thread answered 1 ask in 2001 ms. Ask 1, flow of project default: waited 0 ms, answered at 2001 ms, from reading 1. Reading 1, project default, 1995 ms.',
    ])
  })

  it('writes the line when an ask waited so long that its wait and its answer passed the limit, though the batch was fast', () => {
    // FRACTIONS OF A MILLISECOND on the clock, so each time is seen written as a whole number.
    at += 0.4
    const { files } = readingFiles({ default: 100.4 })
    const { lines } = oneBatch([{ id: 1, sentAt: at - 1950.6, input: of('default'), asked: { shape: 'home' } }], files)
    expect(lines).toEqual([
      'The attention thread answered 1 ask in 106 ms. Ask 1, home of project default: waited 1951 ms, answered at 106 ms, from reading 1. Reading 1, project default, 100 ms.',
    ])
  })

  it('times a reading shared by alike asks once, and names it for each ask that used it', () => {
    const { files, workedOut } = readingFiles({ default: 2500, second: 30 })
    const { lines } = oneBatch(
      [
        { id: 1, sentAt: at - 4, input: of('default'), asked: { shape: 'home' } },
        { id: 2, sentAt: at - 4, input: of('default'), asked: { shape: 'flow' } },
        { id: 3, sentAt: at - 2, forEach: PLAIN, each: ['default', 'second'] },
      ],
      files,
    )
    expect(workedOut).toEqual(['default', 'second'])
    expect(lines).toEqual([
      'The attention thread answered 3 asks together in 2553 ms. ' +
        'Ask 1, home of project default: waited 4 ms, answered at 2506 ms, from reading 1. ' +
        'Ask 2, flow of project default: waited 4 ms, answered at 2512 ms, from reading 1. ' +
        'Ask 3, home of each project (default, second): waited 2 ms, answered at 2553 ms, from readings 1 and 2. ' +
        'Reading 1, project default, 2500 ms. Reading 2, project second, 30 ms.',
    ])
  })

  it('names nothing of an ask beyond its kind and project, and says of a failed ask only that it failed', () => {
    const reader = { readsEveryMessage: false, who: { kind: 'agent', id: 'reader-quokka-7731' } } as const
    const resources = [{ type: 'port', key: 'key-wombat-5519', detail: 'detail-numbat-2287', note: 'note-tapir-4406' }]
    const now = 1_777_000_123_457
    const unsaid = { reader, resources, now }
    const { files } = readingFiles(
      { default: 2200 },
      { hidden: ['hidden-dugong-6644'], failing: { project: 'second', words: 'failure-pangolin-3318 in words of its own' } },
    )
    const asks: AttentionAsk[] = [
      { id: 7001, sentAt: at - 3, input: { workspaceId: 'default', ...unsaid }, asked: { shape: 'part', part: 'noState', from: 98765, machine: 'include' } },
      { id: 7002, sentAt: at - 3, input: { workspaceId: 'second', ...unsaid }, asked: { shape: 'whole' } },
      { id: 7003, sentAt: at - 3, input: { workspaceId: 'default', ...unsaid }, asked: { shape: 'full', machine: 'include' } },
      { id: 7004, sentAt: at - 3, forEach: unsaid, each: ['default'] },
    ]
    const { answers, lines } = oneBatch(asks, files)

    // THE ANSWERS ARE AS THEY WERE: the failed ask is still answered with its error, and the rest are answered.
    expect(answers.map((one) => [one.id, 'error' in one ? one.error.split('\n')[0] : 'answered'])).toEqual([
      [7001, 'answered'],
      [7002, 'Error: failure-pangolin-3318 in words of its own'],
      [7003, 'answered'],
      [7004, 'answered'],
    ])
    expect(lines).toHaveLength(1)
    const line = lines[0] ?? ''
    for (const word of ['reader-quokka-7731', 'key-wombat-5519', 'detail-numbat-2287', 'note-tapir-4406', String(now), 'hidden-dugong-6644', 'pangolin', '3318', '98765', 'include', '7001', '7002', '7003', '7004']) {
      expect(line, word).not.toContain(word)
    }
    expect(line).toBe(
      'The attention thread answered 4 asks together in 2219 ms. ' +
        'Ask 1, part noState of project default: waited 3 ms, answered at 2206 ms, from reading 1. ' +
        'Ask 2, whole of project second: waited 3 ms, answered at 2207 ms, from reading 2, failed. ' +
        'Ask 3, full of project default: waited 3 ms, answered at 2213 ms, from reading 1. ' +
        'Ask 4, home of each project (default): waited 3 ms, answered at 2219 ms, from reading 1. ' +
        'Reading 1, project default, 2200 ms. Reading 2, project second, 0 ms, failed.',
    )
  })

  it('writes the line of a batch that failed as a whole, with the asks its failure answered marked failed', () => {
    const threeAsks = (): AttentionAsk[] => [
      { id: 1, sentAt: at - 6, input: of('default'), asked: { shape: 'home' } },
      { id: 2, sentAt: at - 6, input: of('default'), asked: { shape: 'flow' } },
      { id: 3, sentAt: at - 6, input: of('second'), asked: { shape: 'home' } },
    ]
    const { files } = readingFiles({ default: 2300 })

    // THE SECOND ANSWER CANNOT BE SENT, as one the port could not copy would not be, so the batch fails as a whole
    // after its first answer, and the failure answers the second and the third.
    const midway = threeAsks()
    const failedMidway = oneBatch(midway, files, (send, timed) =>
      worker.answerTheseAsksTogether(
        midway,
        null,
        files,
        (answer) => {
          if (answer.id === 2) throw new Error('failure-axolotl-9902 of the whole batch')
          send(answer)
        },
        timed,
      ),
    )
    expect(failedMidway.answers.map((one) => [one.id, 'error' in one ? one.error.split('\n')[0] : 'answered'])).toEqual([
      [1, 'answered'],
      [2, 'Error: failure-axolotl-9902 of the whole batch'],
      [3, 'Error: failure-axolotl-9902 of the whole batch'],
    ])
    expect(failedMidway.lines).toEqual([
      'The attention thread answered 3 asks together in 2313 ms. ' +
        'Ask 1, home of project default: waited 6 ms, answered at 2306 ms, from reading 1. ' +
        'Ask 2, flow of project default: waited 6 ms, answered at 2312 ms, from reading 1, failed. ' +
        'Ask 3, home of project second: waited 6 ms, answered at 2313 ms, from no reading, failed. ' +
        'Reading 1, project default, 2300 ms.',
    ])

    // A FAILURE BEFORE ANY ANSWER, as a read transaction that could not begin, after 2001 ms.
    const failedFirst = oneBatch(threeAsks(), files, () => {
      at += LIMIT + 1
      throw new Error('failure-axolotl-9902 before any answer')
    })
    expect(failedFirst.answers.map((one) => [one.id, 'error' in one])).toEqual([[1, true], [2, true], [3, true]])
    expect(failedFirst.lines).toEqual([
      'The attention thread answered 3 asks together in 2004 ms. ' +
        'Ask 1, home of project default: waited 6 ms, answered at 2002 ms, from no reading, failed. ' +
        'Ask 2, flow of project default: waited 6 ms, answered at 2003 ms, from no reading, failed. ' +
        'Ask 3, home of project second: waited 6 ms, answered at 2004 ms, from no reading, failed.',
    ])
    for (const line of [...failedMidway.lines, ...failedFirst.lines]) expect(line).not.toContain('axolotl')
  })
})

describe('the attention thread itself', () => {
  let office: TestDb
  beforeAll(async () => {
    office = await freshDb()
  }, 120_000)
  afterAll(async () => {
    const thread = await import('../src/server/lib/attention-thread.ts')
    thread.logTheAttentionThreadTo(() => undefined)
    await thread.endTheAttentionThread()
    office.close()
  })

  it('stamps each ask with the clock both threads read, and times its batch by that clock when none is handed in', async () => {
    const thread = await import('../src/server/lib/attention-thread.ts')
    /** How far back each ask's sent time is moved on its way to the thread. */
    const EARLIER_MS = 5000
    const stamped: number[] = []
    const thePost = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker['postMessage']>): void {
      const [said, ...rest] = args as [unknown, ...unknown[]]
      let posted = said
      if (typeof said === 'object' && said !== null && 'sentAt' in said && typeof said.sentAt === 'number') {
        stamped.push(said.sentAt)
        posted = { ...said, sentAt: said.sentAt - EARLIER_MS }
      }
      thePost.call(this, posted, ...(rest as []))
    }
    const theLine = new Promise<string>((resolve) => {
      thread.logTheAttentionThreadTo((line) => {
        if (line.startsWith('The attention thread answered')) resolve(line)
      })
    })
    const before = Date.now()
    try {
      await thread.attentionOnItsOwnThread({ workspaceId: 'default', resources: [], now: Date.UTC(2026, 10, 21) }, { shape: 'home' })
    } finally {
      Worker.prototype.postMessage = thePost
    }
    const after = Date.now()

    // THE REQUEST THREAD'S STAMP is on the scale of Date.now(), which `performance.now()` alone is not.
    expect(stamped).toHaveLength(1)
    expect(stamped[0]).toBeGreaterThanOrEqual(before - 1000)
    expect(stamped[0]).toBeLessThanOrEqual(after + 1000)
    // THE THREAD'S OWN CLOCK is on the same scale: it finds the 5 s the sent time was moved back, and so writes the line.
    const line = await theLine
    const waited = Number(/^The attention thread answered 1 ask in \d+ ms\. Ask 1, home of project default: waited (\d+) ms, /.exec(line)?.[1])
    expect(waited, line).toBeGreaterThanOrEqual(EARLIER_MS - 1)
    expect(waited, line).toBeLessThan(EARLIER_MS + 60_000)
  }, 120_000)
})
