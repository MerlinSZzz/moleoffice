// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION READING, WORKED OUT ON A THREAD OF ITS OWN (problem CtH8CGBkE5Bz).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `attentionNow` in lib/records.ts reads every record, every link and up to 100,000 change rows with
 * synchronous SQLite calls, runs the rule over them, and builds one reply, all in one step. GET
 * /api/attention ran it on the thread that reads requests, so while it ran the server read no other
 * request. On 5 October 2026 the owner's Terminals list took 9.7 s and 14.3 s waiting behind it. On
 * 6 October health took 6 s once, and a session's start hook timed out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES
 * ---------------------------------------------------------------------------------------
 *
 * The route hands the same input to one worker thread, which runs the same `attentionNow` on a
 * connection of its own to the same database file (attention-thread-worker.ts). The request thread
 * goes on reading other requests meanwhile. The thread is started at the first attention read and
 * kept for the next; while nobody is waiting on it, it does not keep the process alive.
 *
 * THE READING IS NOT CHANGED. Same function, same file, same input. The worker's three reads share
 * one read transaction, so no write made meanwhile lands between them, as none could on the request
 * thread. tests/the-attention-read-does-not-hold-the-office.test.ts compares the two, in every shape.
 *
 * WHAT STAYS ON THE REQUEST THREAD: taking the answer back from the worker and writing it as JSON.
 * The worker cuts the reading to the shape the request asked for first (attention-shapes.ts), so for
 * `home`, `flow` and one page of a list only that shape comes back. Only the whole answer, which can
 * be tens of megabytes, still holds other requests for a moment while it is taken back and written.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT THE OTHER TWO OPTIONS THE PROBLEM NAMES
 * ---------------------------------------------------------------------------------------
 *
 * A reading kept and refreshed on change would still be worked out on the request thread after each
 * change, and agents write to the office every few seconds. It would also be kept once per reader,
 * because what a reader may read changes the reading, and it would go old between changes, because
 * the rule ranks by how long a record has been in its state.
 *
 * WHAT IS KEPT INSTEAD, SINCE WAVE 13Y ROUND 167, is the records the rule reads, on the attention thread, and not
 * the reading. They are the same for every reader and every clock, and each is read again only when the change log
 * says it changed (attention-kept-records.ts). The reading is still worked out from them at every ask.
 *
 * Less work per read helps every reader, but one read still holds all the others for as long as it
 * takes, and what makes the owner's read ten times slower than a seeded office is not measured yet.
 *
 * ---------------------------------------------------------------------------------------
 * NO QUIET FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * If the thread cannot start, or stops, every read waiting on it fails with a sentence saying so, and
 * the next read starts a new thread. Nothing goes back to working the reading out on the request
 * thread, which is the hold this file exists to remove.
 */

import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { REPO_ROOT, THE_ATTENTION_THREAD_ENTRY, THE_INSTALL, THE_THREAD_BUNDLES } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import type { AttentionInTheShape, AttentionRankingReply, AttentionShape } from './attention-shapes.ts'
import {
  THE_ATTENTION_THREAD,
  type AttentionAnswer,
  type AttentionAsk,
  type EachProjectsHomeAttention,
  type FromTheAttentionThread,
  type ReadOnTheThread,
  type ToTheAttentionThread,
} from './attention-thread-worker.ts'
import type { AttentionReading, attentionNow } from './records.ts'

interface Waiting {
  resolve: (read: Answered) => void
  reject: (err: Error) => void
}

interface TheThread {
  worker: Worker
  /** Settled when the thread has loaded and listens, or when it failed first. */
  ready: Promise<void>
  waiting: Map<number, Waiting>
  /** Set when the server closes, so the reads still waiting are told that, and not that the thread failed. */
  endedByTheServer: boolean
}

/** What the thread answers one ask with. */
type Answered = { shaped: unknown; lastChange: number | null; readings: number }

/** The input `attentionNow` takes. */
type AttentionInput = Parameters<typeof attentionNow>[0]
type AskWithoutId = AttentionAsk extends infer A ? (A extends unknown ? Omit<A, 'id'> : never) : never

let theThread: TheThread | null = null
let lastAsk = 0
let earlyFailure: Error | null = null
let earlyStartUnasked = false

/** Where the thread's lines go: the server's log once the routes hand it in, and nowhere before. */
let log: (line: string) => void = () => undefined

/** Hand in the server's log, for the lines the attention thread sends. Called by the routes that ask the thread. */
export function logTheAttentionThreadTo(to: (line: string) => void): void {
  log = to
}

/**
 * MAKE THE NEXT ASK READ EVERY RECORD AGAIN, and not only the records the change log names since the last ask
 * (attention-kept-records.ts). Answers whether the thread was running. A thread that was not reads every record at
 * its first ask anyway.
 */
export function readEverythingAgainAtTheNextAsk(): boolean {
  if (theThread === null) return false
  theThread.worker.postMessage({ readEverythingAgain: true } satisfies ToTheAttentionThread)
  return true
}

/**
 * THE THREAD'S YOUNG GENERATION IS 384 MB, eight times the 48 MB a worker is given by default (wave 13y round 167).
 * A reading makes many objects that live only while it is worked out. On a made-up office of the live shape, Home's
 * read through the server took 1,332 to 1,460 ms with the default and 1,161 to 1,182 ms with this, three takes each,
 * for the same answer. In one process reading the same office, the collector took 189 to 315 ms of each reading
 * with the default and 80 to 173 ms with this. 384 MB is the young generation a 128 MB semi-space gives, the size
 * those readings were measured with. Only the young generation is set: the old generation keeps the default.
 */
const THE_THREADS_LIMITS = { maxYoungGenerationSizeMb: 384 }

/** Start loading the worker during server startup without making startup depend on it. */
export async function startAttentionThreadEarly(): Promise<void> {
  earlyStartUnasked = true
  try {
    const thread = theThread ?? startTheThread()
    thread.worker.unref()
    await thread.ready
  } catch (cause) {
    const failure = cause instanceof Error ? cause : new Error(String(cause))
    if (earlyStartUnasked) earlyFailure = failure
    console.error('The attention thread could not start early:', failure)
  }
}

/**
 * The attention reading for this input, worked out on the attention thread, in the shape asked for.
 *
 * The same input as `attentionNow`. With no shape it answers the whole reading, as `attentionNow`
 * does; with one it answers that shape of the same reading, cut on the attention thread, so only that
 * shape is copied back to this thread (attention-shapes.ts says why). It fails, and says why, if the
 * thread cannot start or stops before it answers.
 */
export async function attentionOnItsOwnThread(input: AttentionInput): Promise<AttentionReading>
export async function attentionOnItsOwnThread<S extends AttentionShape>(input: AttentionInput, asked: S): Promise<AttentionInTheShape<S>>
export async function attentionOnItsOwnThread(input: AttentionInput, asked: AttentionShape = { shape: 'whole' }): Promise<unknown> {
  return (await askTheThread({ input, asked })).shaped
}

/**
 * HOME'S FIRST PAGE FOR EACH OF THESE PROJECTS, IN ONE ASK. The thread reads them one after another in
 * one read transaction, with this input and each project's id, and fails the whole ask if one fails.
 */
export async function homeAttentionOfEachProjectOnItsOwnThread(
  forEach: Omit<AttentionInput, 'workspaceId'>,
  each: readonly string[],
): Promise<EachProjectsHomeAttention> {
  const { shaped } = await askTheThread({ forEach, each })
  return shaped as EachProjectsHomeAttention
}

/** The fields open-work ranking reads, with the place in the change log of the last change it saw. */
export async function attentionAndItsLastChangeOnItsOwnThread(input: AttentionInput): Promise<ReadOnTheThread> {
  const { shaped, lastChange } = await askTheThread({ input, asked: { shape: 'ranking' } })
  return { reading: shaped as AttentionRankingReply, lastChange }
}

/**
 * The reading in the shape asked, and how many readings the thread worked out for the asks it answered
 * together with this one. Exported for the tests, which send asks at once and count the readings.
 */
export async function attentionAndHowManyReadingsOnItsOwnThread(input: AttentionInput, asked: AttentionShape): Promise<{ shaped: unknown; readings: number }> {
  const { shaped, readings } = await askTheThread({ input, asked })
  return { shaped, readings }
}

/** End the attention thread when the server closes. A read still waiting is refused with a sentence that says so. */
export async function endTheAttentionThread(): Promise<void> {
  const thread = theThread
  if (thread === null) return
  theThread = null
  thread.endedByTheServer = true
  await thread.worker.terminate()
}

async function askTheThread(ask: AskWithoutId): Promise<Answered> {
  earlyStartUnasked = false
  if (earlyFailure !== null) {
    const failure = earlyFailure
    earlyFailure = null
    throw failure
  }
  const thread = theThread ?? startTheThread()
  lastAsk += 1
  const id = lastAsk
  // WAITING FROM NOW, while the thread may still be loading, so a thread that fails to start fails
  // this read too, and the process stays alive for it.
  const answered = new Promise<Answered>((resolveIt, rejectIt) => {
    thread.waiting.set(id, { resolve: resolveIt, reject: rejectIt })
  })
  // The failure is said by `await thread.ready` below when the start fails, and by the return otherwise.
  answered.catch(() => undefined)
  thread.worker.ref()
  await thread.ready
  thread.worker.postMessage({ id, ...ask } satisfies AttentionAsk)
  return answered
}

function startTheThread(): TheThread {
  // A DATABASE IN MEMORY HAS NO FILE for a second connection to open, so the thread could only read
  // some other database. Refused, not worked out on the request thread instead.
  if (sqlite.memory) {
    throw new Error(
      'The attention reading is worked out on a thread of its own, with its own connection to the database file, ' +
        'and this server\'s database is in memory, so there is no file for that connection to open.',
    )
  }
  const workerData = { [THE_ATTENTION_THREAD]: resolve(sqlite.name) }
  // FROM A BUNDLE, the thread's own bundled file, which is plain JavaScript and needs no loader. A bundle
  // carries no tsx: resolving it there failed every attention read with a 500 on the installed Mac office
  // of 10 October 2026 (wave 13w round 24).
  // FROM A CHECKOUT, TSX'S LOADER BY ITS FILE, so the thread can load TypeScript whatever started this
  // process: the tsx command, or a test runner that loads TypeScript its own way and passes no loader on.
  const worker =
    THE_INSTALL.from === 'bundle'
      ? new Worker(join(REPO_ROOT, THE_THREAD_BUNDLES[THE_ATTENTION_THREAD_ENTRY]), { execArgv: [], workerData, resourceLimits: THE_THREADS_LIMITS })
      : new Worker(pathToFileURL(join(REPO_ROOT, THE_ATTENTION_THREAD_ENTRY)), {
          execArgv: ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href],
          workerData,
          resourceLimits: THE_THREADS_LIMITS,
        })
  const waiting = new Map<number, Waiting>()
  let ready!: () => void
  let failed!: (err: Error) => void
  const thread: TheThread = {
    worker,
    ready: new Promise<void>((resolveIt, rejectIt) => {
      ready = resolveIt
      failed = rejectIt
    }),
    waiting,
    endedByTheServer: false,
  }
  // A start that fails with nobody awaiting `ready` yet is still said, by the read that awaits it.
  thread.ready.catch(() => undefined)

  const giveUp = (err: Error): void => {
    if (theThread === thread) theThread = null
    failed(err)
    for (const one of waiting.values()) one.reject(err)
    waiting.clear()
  }
  worker.on('message', (said: FromTheAttentionThread) => {
    if ('log' in said) {
      log(said.log)
      return
    }
    const answer: AttentionAnswer = said
    if ('ready' in answer) {
      ready()
      return
    }
    const one = waiting.get(answer.id)
    if (one === undefined) return
    waiting.delete(answer.id)
    if (waiting.size === 0) worker.unref()
    if ('shaped' in answer) one.resolve({ shaped: answer.shaped, lastChange: answer.lastChange, readings: answer.readings })
    else one.reject(new Error(`The attention reading failed on its own thread: ${answer.error}`))
  })
  worker.on('error', (err: unknown) => {
    const said = err instanceof Error ? err.message : String(err)
    giveUp(new Error(`The attention thread stopped with an error, so the reading was not worked out: ${said}`, { cause: err }))
  })
  worker.on('exit', (code) => {
    giveUp(new Error(thread.endedByTheServer
      ? 'The server closed before the attention thread answered, so the reading was not worked out.'
      : `The attention thread ended (exit code ${String(code)}) before it answered, so the reading was not worked out.`))
  })
  theThread = thread
  return thread
}
