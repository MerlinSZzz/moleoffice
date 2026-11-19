// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S SEAL, READ AGAIN FOR THE CHECK DOORS ON A THREAD OF ITS OWN (item 2o of the requirement list).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Three doors read a run's seal again before they answer: the prompt door, the assembly door and the verdict door
 * (src/server/api/inspection.ts). `verifyRunSeal` (sealed-tip.ts) does it with synchronous git processes, and a git seal
 * read in its worktree hashes every file of that worktree, to find files outside the sealed commit. On the server's own
 * repository of 8,720 files that took about 275 ms, on the thread that reads requests, so no other request was read
 * meanwhile. The assembly door read it twice, and the verdict door started 14 git processes, two reads of about 23 ms.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES
 * ---------------------------------------------------------------------------------------
 *
 * The door asks `theSealReadApart` first. It hands the run and the way to read its seal to one worker thread, which
 * runs the same `verifyRunSeal` on a connection of its own to the same database file (the-seal-read-apart-thread.ts),
 * and the request thread goes on reading other requests meanwhile. The thread is started at the first such read in a
 * process, never at the server's start, and kept for the next; while nobody is waiting on it, it does not keep the
 * process alive, and it ends when the server closes.
 *
 * THE READ IS NOT CHANGED. Same function, same arguments, same files, the same guard on every git it starts. The door
 * then hands what came back to `theSealReadApartOrHere` at the very place it called `verifyRunSeal` before, so a seal
 * that is refused is refused there, after the same refusals as before and with the same words, status and code.
 * tests/the-seal-read-apart-is-the-same-read.test.ts compares the two on the same trees.
 *
 * THE SEAL IS NAMED AGAIN WHEN IT IS USED. The thread says which seal the run named when it read it, as one string
 * (`theSealARunNames`). The request thread works that out again where the read is used, and refuses with 409 if it
 * changed, because a read of a seal the run no longer names is not this run's read.
 *
 * ONE READ, USED TWICE. The assembly door and the verdict door each read the seal twice, the same way, in one handler.
 * They now read it once and use it at both places, with the seal named again at each.
 *
 * A SEAL WITH NO GIT IS READ WHERE IT WAS. A seal of records holds no file, and a seal of staged files hashes only the
 * files it lists. Neither starts git, and starting a thread of about 200 MB for either would cost more than the read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A WORKER THREAD AND NOT A CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The read needs the run and its seal from the database, and the server's own code that reads them. A thread loads
 * that code once and keeps it, as the attention thread does (attention-thread.ts), and opens the database file the
 * server has open. A child process would start Node again for each read, or be one more long-lived program the server
 * starts. Only two files may start a process.
 *
 * ---------------------------------------------------------------------------------------
 * NO QUIET FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * If the thread cannot start, or stops, every read waiting on it is refused with 503 and a sentence saying so, and
 * the next read starts a new thread. Nothing goes back to reading the seal on the request thread, which would bring
 * back the hold this file exists to remove without anybody seeing it.
 */

import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { REPO_ROOT, THE_INSTALL, THE_SEAL_READ_THREAD_ENTRY, THE_THREAD_BUNDLES } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import { theSealARunNames } from '@shared/the-seal-a-run-names.ts'
import { readRunSeal, verifyRunSeal, type AVerifiedSeal } from './sealed-tip.ts'
import {
  type ARefusalCarried,
  type ASealReadAnswer,
  type ASealReadAsk,
  type AFinishReadAsk,
  type AFinishReading,
  type HowASealIsVerified,
  type TheReadsOutcome,
} from './the-seal-read-apart-thread.ts'
import { THE_SEAL_READ_THREAD } from '@shared/the-seal-read-thread-key.ts'
import { theRefusalAgain } from './the-refusal-again.ts'

export type { HowASealIsVerified } from './the-seal-read-apart-thread.ts'

/**
 * A SEAL READ BEFORE IT IS USED: which run, which way, the seal the run named when it was read, and where it was read.
 * A seal with no git is not read ahead (`readOn: 'where it is used'`); a git seal was read on the thread, with what
 * `verifyRunSeal` did there.
 */
export type ASealReadApart =
  | { runId: string; how: HowASealIsVerified; names: string; readOn: 'where it is used' }
  | { runId: string; how: HowASealIsVerified; names: string; readOn: 'its own thread'; outcome: TheReadsOutcome }

interface Waiting {
  resolve: (read: { names: string; outcome: TheReadsOutcome; gitReadMs: number }) => void
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

let theThread: TheThread | null = null
let lastAsk = 0

/**
 * The two functions `theSealARunNames` reads with, here. A function and not a constant, because the seal-read thread
 * imports records.ts first, and records.ts reaches this file before its own PanelError is defined.
 */
const theFiles = (): Parameters<typeof theSealARunNames>[1] => ({ sealedTip: { readRunSeal }, records: { PanelError } })

/**
 * READ THIS RUN'S SEAL AGAIN, THIS WAY, ON THE SEAL-READ THREAD, for a door to use with `theSealReadApartOrHere`. A run
 * whose seal has no git part, or that names none, is not read ahead. Refused with 503 if the thread cannot start or
 * stops before it answers.
 */
export async function theSealReadApart(runId: string, how: HowASealIsVerified): Promise<ASealReadApart> {
  const names = theSealARunNames(runId, theFiles())
  const named = JSON.parse(names) as { seal?: { git?: unknown } } | null
  if (!named?.seal?.git) return { runId, how, names, readOn: 'where it is used' }
  let answered: { names: string; outcome: TheReadsOutcome }
  try {
    answered = await askTheThread({ runId, how })
  } catch (err) {
    throw new PanelError(
      `The office reads a run's seal again on a thread of its own, so that it answers other requests meanwhile, and ${err instanceof Error ? err.message : String(err)}. ` +
        `So the seal of run ${runId} was not read, and nothing was written. It is not read on the request thread instead. Ask again: the next read starts a new thread.`,
      503,
    )
  }
  return { runId, how, names: answered.names, readOn: 'its own thread', outcome: answered.outcome }
}

/**
 * WHAT `verifyRunSeal(runId, how)` WOULD ANSWER HERE, from the read `apart` made: the seal it verified, or the same
 * refusal thrown here. With no `apart` it is read here, as every caller but the three check doors reads it. Refused
 * with 409 if the run names another seal than the one read.
 */
export function theSealReadApartOrHere(runId: string, how: HowASealIsVerified, apart: ASealReadApart | undefined): AVerifiedSeal | null {
  if (apart === undefined) return verifyRunSeal(runId, how)
  if (apart.runId !== runId || JSON.stringify(apart.how) !== JSON.stringify(how)) {
    throw new Error(
      `A seal read for run ${apart.runId} with ${JSON.stringify(apart.how)} was handed to a read of run ${runId} with ${JSON.stringify(how)}. ` +
        'A door read one seal and used it for another.',
    )
  }
  if (theSealARunNames(runId, theFiles()) !== apart.names) {
    throw new PanelError(
      `Run ${runId} names another seal than the one the office read for this request, so the seal changed while it was read. ` +
        'Nothing was written. Ask again, and the seal the run names now is read.',
      409,
    )
  }
  if (apart.readOn === 'where it is used') return verifyRunSeal(runId, how)
  const { outcome } = apart
  if ('verified' in outcome) return outcome.verified
  if ('refused' in outcome) throw theRefusalAgain(outcome.refused)
  if ('finished' in outcome) throw new Error("A finish's git reading was returned for a seal verification.")
  // ANY OTHER ERROR is a bug the request thread would have answered with 500 and logged; it still is.
  throw new Error(outcome.failed)
}

export { theRefusalAgain } from './the-refusal-again.ts'

/** End the seal-read thread when the server closes. A read still waiting is refused with a sentence that says so. */
export async function endTheSealReadThread(): Promise<void> {
  const thread = theThread
  if (thread === null) return
  theThread = null
  thread.endedByTheServer = true
  await thread.worker.terminate()
}

/**
 * READ A FINISH'S GIT ON THE SEAL-READ THREAD: every question in `finish`, under one stamp of each worktree, for
 * ./a-finish-reads-git-apart.ts to use where the write asks it. Refused with 503 if the thread cannot start or stops
 * before it answers; nothing is read on the request thread instead.
 */
export async function readTheFinishApart(finish: AFinishReadAsk['finish']): Promise<AFinishReading> {
  let result: Awaited<ReturnType<typeof askTheThread>>
  try {
    result = await askTheThread({ finish })
  } catch (err) {
    throw new PanelError(`The office could not read the Git seal on its own thread: ${err instanceof Error ? err.message : String(err)}. Nothing was written. Ask again.`, 503)
  }
  if ('finished' in result.outcome) return { ...result.outcome.finished, asksAhead: result.asksAhead, gitReadMs: result.gitReadMs, threadWaitMs: result.threadWaitMs }
  throw new Error("A seal verification was returned for a finish's git reading.")
}

async function askTheThread(ask: Omit<ASealReadAsk, 'id'> | Omit<AFinishReadAsk, 'id'>): Promise<{ names: string; outcome: TheReadsOutcome; asksAhead: number; gitReadMs: number; threadWaitMs: number }> {
  const began = performance.now()
  const thread = theThread ?? startTheThread()
  const asksAhead = thread.waiting.size
  lastAsk += 1
  const id = lastAsk
  // WAITING FROM NOW, while the thread may still be loading, so a thread that fails to start fails
  // this read too, and the process stays alive for it.
  const answered = new Promise<{ names: string; outcome: TheReadsOutcome; gitReadMs: number }>((resolveIt, rejectIt) => {
    thread.waiting.set(id, { resolve: resolveIt, reject: rejectIt })
  })
  // The failure is said by `await thread.ready` below when the start fails, and by the return otherwise.
  answered.catch(() => undefined)
  thread.worker.ref()
  await thread.ready
  thread.worker.postMessage({ id, ...ask } satisfies ASealReadAsk | AFinishReadAsk)
  const result = await answered
  return { ...result, asksAhead, threadWaitMs: Math.max(0, performance.now() - began - result.gitReadMs) }
}

function startTheThread(): TheThread {
  // A DATABASE IN MEMORY HAS NO FILE for a second connection to open, so the thread could only read
  // some other database.
  if (sqlite.memory) throw new Error("this server's database is in memory, so there is no file for the thread's own connection to open")
  const workerData = { [THE_SEAL_READ_THREAD]: resolve(sqlite.name) }
  // FROM A BUNDLE the thread's own bundled file, and from a checkout tsx's loader by its file, as the
  // attention thread is started (attention-thread.ts says why).
  const worker =
    THE_INSTALL.from === 'bundle'
      ? new Worker(join(REPO_ROOT, THE_THREAD_BUNDLES[THE_SEAL_READ_THREAD_ENTRY]), { execArgv: [], workerData })
      : new Worker(pathToFileURL(join(REPO_ROOT, THE_SEAL_READ_THREAD_ENTRY)), {
          execArgv: ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href],
          workerData,
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
  worker.on('message', (answer: ASealReadAnswer) => {
    if ('ready' in answer) {
      ready()
      return
    }
    const one = waiting.get(answer.id)
    if (one === undefined) return
    waiting.delete(answer.id)
    if (waiting.size === 0) worker.unref()
    if ('outcome' in answer) one.resolve({ names: answer.names, outcome: answer.outcome, gitReadMs: answer.gitReadMs })
    else one.reject(new Error(`the thread failed before it read the seal: ${answer.error}`))
  })
  worker.on('error', (err: unknown) => {
    giveUp(new Error(`the thread stopped with an error: ${err instanceof Error ? err.message : String(err)}`, { cause: err }))
  })
  worker.on('exit', (code) => {
    giveUp(new Error(thread.endedByTheServer ? 'the server closed before the thread answered' : `the thread ended (exit code ${String(code)}) before it answered`))
  })
  theThread = thread
  return thread
}
