// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH, ANSWERED ON A THREAD OF ITS OWN (wave 13y round 167).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/search reads with synchronous SQLite calls and works its answer out in one step. It ran on the thread that
 * reads requests, so while it ran the server read no other request. On the made-up office of the live shape, a search
 * for a word most records say took over a second, and every other request waited for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES
 * ---------------------------------------------------------------------------------------
 *
 * The route reads the request, the reader and the projects asked for on the request thread, as before, and hands
 * them to one worker thread. The thread works the same answer out with the same function, `theSearchAnswer` in
 * api/search.ts, on a connection of its own to the same database file (search-thread-worker.ts). The request thread
 * goes on reading other requests meanwhile. The thread starts when the search door is set up and is kept for searches; while
 * nobody is waiting on it, it does not keep the process alive, until the server closes while it still loads. It answers
 * one search at a time, in the order they were sent.
 *
 * WHAT STAYS ON THE REQUEST THREAD: reading the query, the refusals of a query that cannot be searched, who is
 * reading, and which projects were asked for. Every refusal of a search is one of these, so it is said as it was
 * said before. After the answer: taking it back from the thread and writing it as JSON.
 *
 * ---------------------------------------------------------------------------------------
 * NO QUIET FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * If the thread cannot start, stops, or fails on a search, that search fails with a sentence saying so, and the next
 * search starts a new thread if the old one ended. Nothing goes back to answering on the request thread, which is
 * the hold this file exists to remove. An error on the thread is answered as any error the search itself met was
 * answered before: as an internal error, with its words in the server's log.
 */

import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { REPO_ROOT, THE_INSTALL, THE_SEARCH_THREAD_ENTRY, THE_THREAD_BUNDLES } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import type { SearchAsk, SearchReply } from '../api/search.ts'
import { THE_SEARCH_THREAD, THE_SERVER_HAS_CLOSED, type FromTheSearchThread, type ToTheSearchThread } from './search-thread-worker.ts'

interface Waiting {
  resolve: (reply: SearchReply) => void
  reject: (err: Error) => void
}

interface TheThread {
  worker: Worker
  /** Settled when the thread has loaded and listens, or when it failed first. */
  ready: Promise<void>
  waiting: Map<number, Waiting>
  /** Set when the server closes, so the searches still waiting are told that, and not that the thread failed. */
  endedByTheServer: boolean
  /** A search has taken this thread, and will itself receive a failure while it starts. */
  asked: boolean
  /**
   * One number this server shares with the thread, set to 1 when the server closes. The thread reads it between its
   * loads, and stops itself when it finds it set (search-thread-worker.ts).
   */
  closed: Int32Array
}

let theThread: TheThread | null = null
/** A failed early start must be said to the next search, even if the thread has already ended. */
let failedBeforeSearch: Error | null = null
let lastAsk = 0
/** How many times the server has closed, so an early start put off until another thread stopped is not made for a server that has closed. */
let closes = 0

/** What a search still waiting is told when the server closes. */
export const THE_SERVER_CLOSED = 'The server closed before the search thread answered, so the search was not answered.'

/**
 * HOW LONG A THREAD STILL LOADING WHEN THE SERVER CLOSED KEEPS THE PROCESS ALIVE, AT MOST: one minute. Its load took
 * 1.1 to 4.4 s in a test process (wave 13r round 1116c), so a thread that has not said it is ready after a minute is
 * not loading any more. It is then left to stop itself if it ever says it is ready, and the process may end without it.
 */
export const A_LOAD_IS_WAITED_FOR_AT_MOST_MS = 60_000

/** What is said when a thread being stopped did not say it was ready within that minute. */
export const THE_THREAD_NEVER_SAID_IT_WAS_READY =
  'The search thread had not said it was ready a minute after the server closed, so it no longer keeps the process alive. ' +
  'It is stopped if it says it is ready later.'

/**
 * THE SEARCH THREADS BEING STOPPED, IN THIS PROCESS: one promise each, settled when the thread has stopped. On the
 * global object, not in this module, because a thread belongs to the process and this file can be loaded again in it,
 * each time with a server of its own: vitest's `vi.resetModules()` does, and `freshDb()` calls it.
 */
const BEING_STOPPED = Symbol.for('mole-office: the search threads being stopped')

function theThreadsBeingStopped(): Set<Promise<void>> {
  const global = globalThis as typeof globalThis & { [BEING_STOPPED]?: Set<Promise<void>> }
  return (global[BEING_STOPPED] ??= new Set())
}

/** Settled once every search thread being stopped now has stopped. The server waits for this before it exits. */
export async function theSearchThreadsHaveStopped(): Promise<void> {
  await Promise.all(theThreadsBeingStopped())
}

/** Start without delaying the server. The first search still waits for the thread to be ready. */
export function prepareTheSearchThread(): void {
  // A search on an in-memory database is refused by startTheThread, as it was before. Do not start a worker for it.
  if (sqlite.memory || theThread !== null || failedBeforeSearch !== null) return
  // ONE THREAD LOADS AT A TIME. A thread still loading when its server closed goes on loading until it stops itself or
  // can be stopped, and a test file that builds a server for each case would otherwise start the next one beside it,
  // case after case.
  // So this start waits for those threads to stop, and is not made if this server closes first or a search started one.
  const stopping = theThreadsBeingStopped()
  if (stopping.size > 0) {
    const asked = closes
    void Promise.all(stopping).then(() => {
      if (closes === asked) prepareTheSearchThread()
    })
    return
  }
  try {
    const thread = startTheThread()
    // While no search is waiting, this worker must not keep the server or a test process alive.
    thread.worker.unref()
    void thread.ready.catch((error: unknown) => {
      if (!thread.asked && !thread.endedByTheServer) {
        failedBeforeSearch = error instanceof Error ? error : new Error(String(error))
      }
    })
  } catch (error: unknown) {
    failedBeforeSearch = new Error('The search thread could not start, so the search was not answered.', { cause: error })
  }
}

/**
 * The answer to this search, worked out on the search thread. It fails, and says why, if the thread cannot start,
 * stops before it answers, or fails on the search.
 */
export async function searchOnItsOwnThread(ask: SearchAsk): Promise<SearchReply> {
  if (failedBeforeSearch !== null) {
    const failure = failedBeforeSearch
    failedBeforeSearch = null
    throw failure
  }
  const thread = theThread ?? startTheThread()
  thread.asked = true
  lastAsk += 1
  const id = lastAsk
  // WAITING FROM NOW, while the thread may still be loading, so a thread that fails to start fails this search too,
  // and the process stays alive for it.
  const answered = new Promise<SearchReply>((resolveIt, rejectIt) => {
    thread.waiting.set(id, { resolve: resolveIt, reject: rejectIt })
  })
  // The failure is said by `await thread.ready` below when the start fails, and by the return otherwise.
  answered.catch(() => undefined)
  thread.worker.ref()
  await thread.ready
  // THE SERVER CLOSED WHILE THIS SEARCH WAITED for the thread to load. The thread is stopped next, so the search is
  // not sent to it. It is refused when the thread ends, with the sentence that says the server closed.
  if (thread.endedByTheServer) return answered
  thread.worker.postMessage({ id, ask } satisfies ToTheSearchThread)
  return answered
}

/**
 * End the search thread when the server closes. A search still waiting is refused with a sentence that says so. The
 * promise is settled once the thread has stopped; the server's close does not wait for it (api/search.ts).
 *
 * NOT WHILE IT LOADS. A thread stopped while it loads better-sqlite3's native module ends the whole process, not only
 * the thread: the module's start reads a global after the stop, gets an empty value back, and node-addon-api aborts
 * on that with "FATAL ERROR: Error::New napi_get_last_error_info". A server closed soon after it was built, on a loaded
 * machine, stopped the thread at that point. So the thread is stopped once it has said it is ready, or once its start
 * has failed, which ends it.
 *
 * A THREAD STILL LOADING STOPS ITSELF. The close sets the number it shares with the thread, and the thread, at its next
 * point between two loads, finds it set and ends without loading the rest or saying it is ready
 * (search-thread-worker.ts). Its end settles `ready` as failed, so the stop below goes on at once. Before this, every
 * closed server's thread loaded the whole search first. In a test file that builds a server for each case, that cost
 * about 700 ms of CPU for each server (wave 13r round 1117a).
 */
export async function endTheSearchThread(): Promise<void> {
  failedBeforeSearch = null
  closes += 1
  const thread = theThread
  if (thread === null) return
  theThread = null
  thread.endedByTheServer = true
  Atomics.store(thread.closed, 0, 1)
  await stopOnceLoaded(thread)
}

/**
 * Stop this thread once it has said it is ready, or once it has ended, as it does when its start fails or when it
 * finds the server closed while it loads.
 *
 * UNTIL THEN IT KEEPS THE PROCESS ALIVE. A process that ends stops its threads as `terminate()` does, so a process
 * that ended by itself while this thread loaded would end at the same point. While it kept nothing alive, a program
 * that built the server and awaited its close ended there instead, with exit code 13, as its await was never settled.
 */
function stopOnceLoaded(thread: TheThread): Promise<void> {
  thread.worker.ref()
  const stop = async (): Promise<void> => {
    await thread.worker.terminate()
  }
  const stopped = (async (): Promise<void> => {
    let bound: ReturnType<typeof setTimeout> | undefined
    const loaded = await Promise.race([
      thread.ready.then(() => true, () => true),
      new Promise<false>((resolveIt) => {
        bound = setTimeout(() => resolveIt(false), A_LOAD_IS_WAITED_FOR_AT_MOST_MS)
      }),
    ])
    clearTimeout(bound)
    if (loaded) return stop()
    thread.worker.unref()
    process.emitWarning(THE_THREAD_NEVER_SAID_IT_WAS_READY)
    void thread.ready.then(stop, stop)
  })()
  const stopping = theThreadsBeingStopped()
  stopping.add(stopped)
  void stopped.finally(() => stopping.delete(stopped))
  return stopped
}

function startTheThread(): TheThread {
  // A DATABASE IN MEMORY HAS NO FILE for a second connection to open, so the thread could only read some other
  // database. Refused, not answered on the request thread instead.
  if (sqlite.memory) {
    throw new Error(
      'A search is answered on a thread of its own, with its own connection to the database file, ' +
        "and this server's database is in memory, so there is no file for that connection to open.",
    )
  }
  const closed = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
  const workerData = { [THE_SEARCH_THREAD]: resolve(sqlite.name), [THE_SERVER_HAS_CLOSED]: closed }
  // FROM A BUNDLE, the thread's own bundled file, which is plain JavaScript and needs no loader. FROM A CHECKOUT, TSX'S
  // LOADER BY ITS FILE, so the thread can load TypeScript whatever started this process. Both as the attention thread
  // starts (attention-thread.ts), which says why.
  // NO RESOURCE LIMITS, so this thread has a worker's default young generation, unlike the attention thread's 384 MB.
  // On a made-up office of the live shape, with 384 MB a search for a word nearly every record says was up to a third
  // quicker, but the server's other requests did not stay within 50 ms while it ran: the longest took 94 and 241 ms, in
  // two runs. With the default they took at most 38 and 46 ms (wave 13y round 167). Keeping them quick is what this
  // thread is for.
  const worker =
    THE_INSTALL.from === 'bundle'
      ? new Worker(join(REPO_ROOT, THE_THREAD_BUNDLES[THE_SEARCH_THREAD_ENTRY]), { execArgv: [], workerData })
      : new Worker(pathToFileURL(join(REPO_ROOT, THE_SEARCH_THREAD_ENTRY)), {
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
    asked: false,
    closed,
  }
  // A start that fails with nobody awaiting `ready` yet is still said, by the search that awaits it.
  thread.ready.catch(() => undefined)

  const giveUp = (err: Error): void => {
    if (theThread === thread) theThread = null
    failed(err)
    for (const one of waiting.values()) one.reject(err)
    waiting.clear()
  }
  worker.on('message', (said: FromTheSearchThread) => {
    if ('ready' in said) {
      ready()
      return
    }
    const one = waiting.get(said.id)
    if (one === undefined) return
    waiting.delete(said.id)
    if (waiting.size === 0) worker.unref()
    if ('reply' in said) one.resolve(said.reply)
    else one.reject(new Error(`The search failed on its own thread: ${said.error}`))
  })
  worker.on('error', (err: unknown) => {
    const said = err instanceof Error ? err.message : String(err)
    giveUp(new Error(`The search thread stopped with an error, so the search was not answered: ${said}`, { cause: err }))
  })
  worker.on('exit', (code) => {
    giveUp(new Error(thread.endedByTheServer
      ? THE_SERVER_CLOSED
      : `The search thread ended (exit code ${String(code)}) before it answered, so the search was not answered.`))
  })
  theThread = thread
  return thread
}
