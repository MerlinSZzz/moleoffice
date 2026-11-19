// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKER THREAD THAT ANSWERS A SEARCH.
 *
 * `search-thread.ts` starts this file as a worker thread and is the only thing that talks to it. Read that file
 * first: it says why a search is answered here and what stays on the request thread.
 *
 * NOTHING RUNS ON IMPORT unless the thread was started with `THE_SEARCH_THREAD` in its `workerData`. The server
 * imports this file for that one name, so the file is in the server's import graph (src/config/import-graph.mjs) and
 * a change to it restarts the server and counts as the server's code, as a change to any other file it runs does.
 *
 * ONLY TYPE IMPORTS AT THE TOP. The database client opens its file the moment it is imported, so it is imported
 * below, after this thread has been told which file the server has open.
 */

import { parentPort, workerData } from 'node:worker_threads'
import type { SearchAsk, SearchReply } from '../api/search.ts'

/** The `workerData` key that tells this file it is the search thread, and holds the database file. */
export const THE_SEARCH_THREAD = 'theSearchThread'

/** The `workerData` key that holds the number the server sets to 1 when it closes (search-thread.ts). */
export const THE_SERVER_HAS_CLOSED = 'theServerHasClosed'

/** WHAT THE SERVER SENDS THIS THREAD: one search, as the request thread read it. */
export type ToTheSearchThread = { id: number; ask: SearchAsk }

/**
 * WHAT THIS THREAD SAYS: that it is ready to be asked, once, and then for each search its whole reply, or the error
 * that stopped it, as words.
 */
export type FromTheSearchThread = { ready: true } | { id: number; reply: SearchReply } | { id: number; error: string }

async function serveOnThisThread(database: string, closed: Int32Array): Promise<void> {
  // A THREAD WHOSE SERVER HAS CLOSED STOPS ITSELF, between two loads and never inside one, and does not say it is
  // ready. The server never stops this thread while it loads (search-thread.ts says why), so without this a closed
  // server's thread loaded the whole search before it was stopped. Its end tells the server it has stopped. In a
  // worker, `process.exit` ends this thread, not the process.
  // IT LOOKS TWICE: before it loads anything, and after the database client. In a test file that built a server for
  // each case, the first look stopped 13 of 30 threads and the second 16. A third, after the search's own files,
  // stopped none, so there is no third (wave 13r round 1117a).
  const stopIfTheServerHasClosed = (): void => {
    if (Atomics.load(closed, 0) !== 0) process.exit(0)
  }
  stopIfTheServerHasClosed()
  const port = parentPort
  if (port === null) throw new Error('The search thread was started with no port to its server, so it has nobody to answer.')
  // THE SAME FILE THE SERVER HAS OPEN, named here before the client is imported, so this thread never opens a file
  // that .env or a default names instead.
  process.env['MOLE_OFFICE_DB'] = database
  const { sqlite } = await import('../db/client.ts')
  stopIfTheServerHasClosed()
  const { theSearchAnswer } = await import('../api/search.ts')
  // THIS THREAD ONLY READS, as the attention thread does (attention-thread-worker.ts). It is set after the imports,
  // because three of the files records.ts loads put a temporary trigger on their connection when they load
  // (dispatch.ts, lifecycle.ts, wake.ts), and SQLite refuses even that once the connection only reads. That the
  // imports changed no row is checked, not assumed.
  const changedOnLoad = (sqlite.prepare('SELECT total_changes() AS rows').get() as { rows: number }).rows
  if (changedOnLoad !== 0) {
    throw new Error(`Loading the search thread changed ${String(changedOnLoad)} rows of the database, and this thread must only read.`)
  }
  sqlite.pragma('query_only = ON')
  // ONE READ TRANSACTION FOR EACH SEARCH. On the request thread no write could land between the search's reads. Here
  // one could, so they share one snapshot of the database, and each reply is of one moment as it was before.
  const answerInOneRead = sqlite.transaction((ask: SearchAsk): SearchReply => theSearchAnswer(ask))
  // ONE SEARCH AT A TIME, in the order they were sent: the port hands over the next only when this one is answered.
  port.on('message', (said: ToTheSearchThread) => {
    let answer: FromTheSearchThread
    try {
      answer = { id: said.id, reply: answerInOneRead(said.ask) }
    } catch (err) {
      answer = { id: said.id, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }
    }
    port.postMessage(answer)
  })
  // READY ONLY NOW, with the listener in place, so no search is sent to a thread that is still loading.
  port.postMessage({ ready: true } satisfies FromTheSearchThread)
}

const given = workerData as Record<string, unknown> | null
const database = given?.[THE_SEARCH_THREAD]
// NO AWAIT AT THE TOP OF THIS FILE, unlike the attention thread's. What it loads imports it back for its key (api/search.ts
// imports search-thread.ts, which imports this file), and a file that is still awaiting at its top cannot be imported
// until the wait ends, so the thread waited on itself and ended with exit code 13. A start that fails is thrown, so
// the thread ends with that error and the server says so (search-thread.ts).
if (typeof database === 'string') {
  serveOnThisThread(database, given?.[THE_SERVER_HAS_CLOSED] as Int32Array).catch((err: unknown) => {
    process.nextTick(() => {
      throw err
    })
  })
}
