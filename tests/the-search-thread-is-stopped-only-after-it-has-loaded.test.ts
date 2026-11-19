// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEARCH THREAD IS STOPPED ONLY AFTER IT HAS LOADED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The search thread starts when the search door is set up, and the server's close stopped it at once, with
 * `worker.terminate()`, even while it was still loading. A thread stopped while it loads better-sqlite3's native module
 * ends the whole process, not only the thread: the module's start reads a global after the stop, gets an empty value
 * back, and node-addon-api aborts on that with "FATAL ERROR: Error::New napi_get_last_error_info". A test file that
 * builds the server and closes it soon after, on a loaded machine, closed it while the thread was at that point, and
 * the file's process died with its tests unfinished.
 *
 * ---------------------------------------------------------------------------------------
 * The close then waited for the thread to load, which took 1.1 to 4.4 s in a test process. A test that built a server
 * and closed it inside vitest's 5 s timed out, and a program that built the server and awaited its close ended with
 * exit code 13: the thread kept nothing alive, so the program ended while its await was not yet settled.
 *
 * After that, a server that closed while its thread loaded left the thread to load the whole search and say it was
 * ready, and only then stopped it. A test file that builds a server for each case paid for that load once for each
 * server, after the server had gone. Measured on tests/workspace-move.test.ts alone, with the main-thread probe
 * switched off, as the process's CPU time before each case, over cases 2 to 30: 1339 ms of CPU for each case, against
 * 635 ms with no search thread started at all, and 779 ms when the close still stopped the thread at once. So each
 * closed server's thread cost about 700 ms of CPU. A first version of a thread that stops itself once its server has
 * closed brought it down to 831 ms (wave 13r round 1117a).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A thread ended straight after it was started ends without ever saying it is ready: it stops itself before it
 *      loads the search.
 *   2. A search that waits for that thread while the server closes is refused with the sentence that says the server
 *      closed. The thread ends without saying it is ready, so the search is never sent to it.
 *   3. A server closed before its thread has said it is ready finishes its close first. The thread keeps the process
 *      alive from the close until it stops, and it is stopped only after it has said it is ready.
 *   4. A server built while another server's thread is being stopped starts its own thread once that one has stopped,
 *      and not at all if it closed first.
 *   5. A thread that has not said it is ready a minute after its server closed no longer keeps the process alive, and
 *      that is said. It is still stopped only once it says it is ready.
 *
 * Cases 1 and 2 end the thread straight after it was started, before it can have loaded, so the thread learns of the
 * close while it loads. Cases 3 to 5 hold back the thread's "ready" until the case lets it through, and close their
 * server only once that "ready" is held. By then the thread has loaded and has passed every point where it looks for
 * the close, as a thread does whose server closes just after it has loaded. So none of the five depends on the
 * machine's speed. Every worker the code starts while this file runs is watched by its file, what it said and what it
 * was asked, whether it was asked to keep the process alive, and each time it was asked to stop.
 *
 * A thread that has loaded is already sending its "ready" when the case holds it back, so stopping it then does it no
 * harm and changes nothing it says. That is why case 3 looks at the `terminate()` calls themselves: none may come
 * before its held "ready" is let through (wave 13r round 1117a).
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `Atomics.store(thread.closed, 0, 1)` in `endTheSearchThread` → cases 1 and 2 go red, as the thread loads
 *     the search and says it is ready.
 *   race `true` in place of `thread.ready` in `stopOnceLoaded`, so the stop does not wait → cases 3 and 5 go red, as
 *     the thread is stopped before its "ready" is let through, and the process is never let go.
 *   drop the wait for the threads being stopped in `prepareTheSearchThread` → cases 4 and 5 go red. Case 4 as the
 *     server that closed first starts a thread beside the one being stopped. Case 5 only as a result: case 4 stops at
 *     that count before it closes its last server, so that server's thread is still there and case 5 starts none.
 *   drop `thread.worker.ref()` in `stopOnceLoaded` → cases 3 and 5 go red, as nothing keeps the process alive.
 *
 * Dropping either of the thread's two looks for the close (search-thread-worker.ts) turns no case red. Cases 1 and 2
 * set the close before the thread reaches its first look, so the other look stops it. No case reaches the check of
 * `endedByTheServer` in `searchOnItsOwnThread` now either: in case 2 the thread ends before it is ready, so the
 * search's wait for it fails first.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_SEARCH_THREAD_ENTRY } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'

/**
 * Every worker started while this file runs: its file, then each thing it said or was asked, and its end; each time it
 * was asked to keep the process alive or not; and each time it was asked to stop.
 */
const started = vi.hoisted(() => [] as { file: string; heard: unknown[]; kept: ('ref' | 'unref')[]; stops: 'terminate'[] }[])
/** While `on`, a worker's "ready" is held here, not heard, until the case lets it through. */
const theReady = vi.hoisted(() => ({ on: false, held: [] as (() => void)[] }))
vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  class Watched extends actual.Worker {
    readonly heard: unknown[] = []
    readonly kept: ('ref' | 'unref')[] = []
    readonly stops: 'terminate'[] = []
    constructor(file: string | URL, options?: import('node:worker_threads').WorkerOptions) {
      super(file, options)
      started.push({ file: String(file), heard: this.heard, kept: this.kept, stops: this.stops })
      this.on('message', (said: unknown) => this.heard.push({ said }))
      this.on('exit', () => this.heard.push('ended'))
    }
    override emit(event: string | symbol, ...args: unknown[]): boolean {
      const said = args[0]
      if (theReady.on && event === 'message' && typeof said === 'object' && said !== null && 'ready' in said) {
        theReady.held.push(() => super.emit(event, ...args))
        return true
      }
      return super.emit(event, ...args)
    }
    override postMessage(...sent: Parameters<import('node:worker_threads').Worker['postMessage']>): void {
      this.heard.push({ asked: sent[0] })
      super.postMessage(...sent)
    }
    override ref(): void {
      this.kept.push('ref')
      super.ref()
    }
    override unref(): void {
      this.kept.push('unref')
      super.unref()
    }
    override terminate(): Promise<number> {
      this.stops.push('terminate')
      return super.terminate()
    }
  }
  return { ...actual, Worker: Watched }
})

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 120_000)

afterAll(() => {
  t.close()
})

/** The search threads started since `before`. */
function theSearchThreadsSince(before: number): typeof started {
  return started.slice(before).filter((one) => one.file.endsWith(THE_SEARCH_THREAD_ENTRY))
}

/** What the search thread started since `before` heard, from its start to its end. */
function whatTheSearchThreadHeard(before: number): unknown[] {
  const threads = theSearchThreadsSince(before)
  expect(threads.length, 'search threads started').toBe(1)
  return threads[0]!.heard
}

/** A server with only the search door, which starts the search thread as the office's own server does. */
async function aServerWithTheSearchDoor(): Promise<FastifyInstance> {
  const { searchRoutes } = await import('../src/server/api/search.ts')
  const app = Fastify()
  await app.register(searchRoutes)
  await app.ready()
  return app
}

/** True if `closing` settles within ten seconds. A close that waits for the held "ready" never settles. */
async function settles(closing: Promise<unknown>): Promise<boolean> {
  let bound: ReturnType<typeof setTimeout> | undefined
  const settled = await Promise.race([
    closing.then(() => true),
    new Promise<false>((resolveIt) => {
      bound = setTimeout(() => resolveIt(false), 10_000)
    }),
  ])
  clearTimeout(bound)
  return settled
}

/** Wait until a thread's "ready" is held. The thread has then loaded and passed every point where it looks for the close. */
async function theReadyIsHeld(): Promise<void> {
  await vi.waitFor(() => expect(theReady.held.length, 'a held ready').toBeGreaterThan(0), { timeout: 60_000, interval: 20 })
}

/** Wait until the thread's "ready" is held, then let every held one through. */
async function letTheReadyThrough(): Promise<void> {
  await theReadyIsHeld()
  theReady.on = false
  for (const one of theReady.held.splice(0)) one()
}

describe('the search thread', () => {
  it('1. ends without ever saying it is ready, when it is ended straight after it was started', async () => {
    const { prepareTheSearchThread, endTheSearchThread } = await import('../src/server/lib/search-thread.ts')
    const before = started.length
    prepareTheSearchThread()
    await endTheSearchThread()
    expect(whatTheSearchThreadHeard(before)).toEqual(['ended'])
  }, 60_000)

  it('2. is never sent a search that waited for it while the server closed, and that search is refused', async () => {
    const { endTheSearchThread, searchOnItsOwnThread, THE_SERVER_CLOSED } = await import('../src/server/lib/search-thread.ts')
    const { theSearchAsk } = await import('../src/server/api/search.ts')
    const before = started.length
    const waiting = searchOnItsOwnThread(theSearchAsk('default', { q: 'anything' }, () => ({ type: 'human', id: THE_PERSON })))
    await endTheSearchThread()
    await expect(waiting).rejects.toThrow(THE_SERVER_CLOSED)
    expect(whatTheSearchThreadHeard(before)).toEqual(['ended'])
  }, 60_000)

  it('3. lets its server finish closing before it has said it is ready, keeps the process alive, and is stopped once it is ready', async () => {
    const { theSearchThreadsHaveStopped } = await import('../src/server/lib/search-thread.ts')
    const before = started.length
    theReady.on = true
    try {
      const app = await aServerWithTheSearchDoor()
      await theReadyIsHeld()
      expect(await settles(app.close()), 'the close settled while the thread had not said it was ready').toBe(true)
      const [thread] = theSearchThreadsSince(before)
      expect(thread?.heard, 'what the thread had said when the close ended').toEqual([])
      expect(thread?.kept.at(-1), 'the thread keeps the process alive from the close').toBe('ref')
      expect(thread?.stops, 'the thread was stopped while its "ready" was held').toEqual([])
      await letTheReadyThrough()
      await theSearchThreadsHaveStopped()
      expect(whatTheSearchThreadHeard(before)).toEqual([{ said: { ready: true } }, 'ended'])
    } finally {
      theReady.on = false
      for (const one of theReady.held.splice(0)) one()
    }
  }, 60_000)

  it('4. is started for the next server only once the last one has stopped, and not for a server that closed first', async () => {
    const { theSearchThreadsHaveStopped } = await import('../src/server/lib/search-thread.ts')
    const before = started.length
    theReady.on = true
    try {
      const first = await aServerWithTheSearchDoor()
      await theReadyIsHeld()
      await first.close()
      const closedFirst = await aServerWithTheSearchDoor()
      await closedFirst.close()
      const next = await aServerWithTheSearchDoor()
      expect(theSearchThreadsSince(before).length, 'threads started while the first one is being stopped').toBe(1)
      // THE FIRST THREAD'S "READY" GOES THROUGH, and the next thread's is held in its turn, so the next server too
      // closes only once its thread has loaded.
      for (const one of theReady.held.splice(0)) one()
      await theSearchThreadsHaveStopped()
      await vi.waitFor(() => expect(theSearchThreadsSince(before).length, 'threads started').toBe(2), { timeout: 10_000, interval: 20 })
      await theReadyIsHeld()
      await next.close()
      await letTheReadyThrough()
      await theSearchThreadsHaveStopped()
      const [one, two] = theSearchThreadsSince(before)
      expect(one?.heard, 'the first server\'s thread').toEqual([{ said: { ready: true } }, 'ended'])
      expect(two?.heard, 'the next server\'s thread').toEqual([{ said: { ready: true } }, 'ended'])
    } finally {
      theReady.on = false
      for (const one of theReady.held.splice(0)) one()
    }
  }, 60_000)

  it('5. stops keeping the process alive, and says so, if it has not said it is ready a minute after the close', async () => {
    const { prepareTheSearchThread, endTheSearchThread, theSearchThreadsHaveStopped, A_LOAD_IS_WAITED_FOR_AT_MOST_MS, THE_THREAD_NEVER_SAID_IT_WAS_READY } =
      await import('../src/server/lib/search-thread.ts')
    const warned = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    const before = started.length
    theReady.on = true
    try {
      prepareTheSearchThread()
      await theReadyIsHeld()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const ended = endTheSearchThread()
      await vi.advanceTimersByTimeAsync(A_LOAD_IS_WAITED_FOR_AT_MOST_MS)
      vi.useRealTimers()
      expect(await settles(ended), 'the stop settled a minute after the close').toBe(true)
      const [thread] = theSearchThreadsSince(before)
      expect(thread?.kept.slice(-2), 'kept alive from the close, then let go').toEqual(['ref', 'unref'])
      expect(warned).toHaveBeenCalledWith(THE_THREAD_NEVER_SAID_IT_WAS_READY)
      expect(thread?.heard, 'what the thread had said by then').toEqual([])
      await letTheReadyThrough()
      await vi.waitFor(() => expect(whatTheSearchThreadHeard(before)).toEqual([{ said: { ready: true } }, 'ended']), { timeout: 10_000, interval: 20 })
      await theSearchThreadsHaveStopped()
    } finally {
      vi.useRealTimers()
      warned.mockRestore()
      theReady.on = false
      for (const one of theReady.held.splice(0)) one()
    }
  }, 60_000)
})
