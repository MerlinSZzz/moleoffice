// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKER THREAD THAT WORKS OUT THE ATTENTION READING (problem CtH8CGBkE5Bz).
 *
 * `attention-thread.ts` starts this file as a worker thread and is the only thing that talks to it.
 * Read that file first: it says why the reading is worked out here and what stays as it was.
 *
 * NOTHING RUNS ON IMPORT unless the thread was started with `THE_ATTENTION_THREAD` in its
 * `workerData`. The server imports this file for that one name, so the file is in the server's import
 * graph (src/config/import-graph.mjs) and a change to it restarts the server and counts as the
 * server's code, as a change to any other file it runs does.
 *
 * ONLY TYPE IMPORTS AT THE TOP. The database client opens its file the moment it is imported, so it is
 * imported below, after this thread has been told which file the server has open.
 */

import { parentPort, workerData } from 'node:worker_threads'
import type { AttentionHomeReply, AttentionRankingReply, AttentionShape } from './attention-shapes.ts'
import type { AttentionReading, attentionNow } from './records.ts'

/** The `workerData` key that tells this file it is the attention thread, and holds the database file. */
export const THE_ATTENTION_THREAD = 'theAttentionThread'

/**
 * What the request thread asks: one reading, with the input `attentionNow` takes, in one shape; or Home's
 * first page for each of several projects.
 */
export type AttentionAsk = { id: number } & (OneReading | EachProject)

interface OneReading {
  input: Parameters<typeof attentionNow>[0]
  /** The shape this thread cuts the reading to before it hands it back (attention-shapes.ts). */
  asked: AttentionShape
}

/**
 * EACH OF THESE PROJECTS, read with the same input and its own `workspaceId`, one after another in the
 * same read transaction, each cut to Home's first page. One ask answers every project a page needs,
 * where one ask per project waited in line here (round 23 of wave 13w).
 */
interface EachProject {
  forEach: Omit<Parameters<typeof attentionNow>[0], 'workspaceId'>
  each: readonly string[]
}

/** What an ask with `each` answers: each project's first page, in the order asked. */
export type EachProjectsHomeAttention = { workspaceId: string; reading: AttentionHomeReply }[]

/**
 * What this thread says: that it is ready to be asked, once, and then for each ask the reading in the
 * shape asked for, or the error that stopped it, as words.
 */
export type AttentionAnswer =
  | { ready: true }
  /** `readings`: how many readings the thread had worked out, for the asks it answers together with this one, when it answered it. */
  | { id: number; shaped: unknown; lastChange: number | null; readings: number }
  | { id: number; error: string }

/**
 * WHAT THE SERVER SENDS THIS THREAD: an ask, or the word that every record is to be read again at the next ask
 * (POST /api/attention/read-everything-again, attention-kept-records.ts).
 */
export type ToTheAttentionThread = AttentionAsk | { readEverythingAgain: true }

/** WHAT THIS THREAD SENDS THE SERVER: an answer, or a line for the server's log. */
export type FromTheAttentionThread = AttentionAnswer | { log: string }

/**
 * The reading, and the place in the change log of the last change it could see: the largest
 * `append_order`, read in the same transaction, or null when the log is empty. A reader that reads more
 * of the office afterwards asks the log what was written past that place, and so knows exactly which
 * of its rows changed after the rule ran (`rankOpenWork` in openwork.ts).
 */
export interface ReadOnTheThread {
  reading: AttentionRankingReply
  lastChange: number | null
}

/** What `answerTheseAsksTogether` reads with: the three files this thread imports once the database is named. */
export interface TheReadingFiles {
  records: Pick<typeof import('./records.ts'), 'theMessagesHiddenFromTheAttentionReader' | 'attentionWithTheseHidden'>
  shapes: Pick<typeof import('./attention-shapes.ts'), 'attentionInTheShape' | 'homeAttention'>
  messages: Pick<typeof import('./messages.ts'), 'withEachHiddenListWorkedOutOnce'>
}

/**
 * ANSWER THESE ASKS, WORKING OUT ONE READING FOR THE ASKS THAT ARE ALIKE: the same project, resources
 * and clock, and a reader hidden the same messages, which is all a reading depends on
 * (`attentionWithTheseHidden`). A page asks for Home's first page, the open work and the other projects
 * at once, and each waited on this thread for the readings asked before it: on the made-up office of
 * the live size, the fourth of them answered after 528 ms where one reading took 149 (round 26 of wave
 * 13w). The thread calls this inside one read transaction, so every ask answered was sent before the
 * reading began, and no answer is older than its ask.
 *
 * EACH ASK IS ANSWERED AS SOON AS ITS READING IS WORKED OUT, in the order asked, so the first does not
 * wait for the readings of the asks after it. An ask that fails is answered with its error, and the rest
 * are still answered. `readings` in each answer counts the readings worked out so far, so a test can see
 * which asks shared one; it is exported for those tests.
 */
export function answerTheseAsksTogether(
  asks: readonly AttentionAsk[],
  lastChange: number | null,
  files: TheReadingFiles,
  send: (answer: Exclude<AttentionAnswer, { ready: true }>) => void,
): void {
  const readings = new Map<string, AttentionReading>()
  const readingFor = (input: OneReading['input']): AttentionReading => {
    const hidden = files.records.theMessagesHiddenFromTheAttentionReader(input)
    const alike = JSON.stringify([input.workspaceId, input.resources, input.now ?? null, hidden])
    const known = readings.get(alike)
    if (known !== undefined) return known
    const reading = files.records.attentionWithTheseHidden(input, hidden)
    readings.set(alike, reading)
    return reading
  }
  // EACH READER'S HIDDEN MESSAGES ARE WORKED OUT ONCE for every ask and project here, since nothing here writes.
  files.messages.withEachHiddenListWorkedOutOnce(() => {
    for (const ask of asks) {
      let answer: Exclude<AttentionAnswer, { ready: true }>
      try {
        const shaped =
          'each' in ask
            ? (ask.each.map((workspaceId) => ({ workspaceId, reading: files.shapes.homeAttention(readingFor({ ...ask.forEach, workspaceId })) })) satisfies EachProjectsHomeAttention)
            : files.shapes.attentionInTheShape(ask.asked, readingFor(ask.input))
        answer = { id: ask.id, shaped, lastChange, readings: readings.size }
      } catch (err) {
        answer = { id: ask.id, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }
      }
      send(answer)
    }
  })
}

async function serveOnThisThread(database: string): Promise<void> {
  const port = parentPort
  if (port === null) throw new Error('The attention thread was started with no port to its server, so it has nobody to answer.')
  // THE SAME FILE THE SERVER HAS OPEN, named here before the client is imported, so this thread never
  // opens a file that .env or a default names instead.
  process.env['MOLE_OFFICE_DB'] = database
  const { sqlite } = await import('../db/client.ts')
  const records = await import('./records.ts')
  const shapes = await import('./attention-shapes.ts')
  const messages = await import('./messages.ts')
  // THE RECORDS ARE KEPT FROM ONE ASK TO THE NEXT, and read again only where the change log says they changed. Read
  // attention-kept-records.ts for how, and for when every record is read again.
  const { keptAttentionRecords } = await import('./attention-kept-records.ts')
  const kept = keptAttentionRecords((line) => port.postMessage({ log: line } satisfies FromTheAttentionThread))
  const readFrom: TheReadingFiles['records'] = {
    theMessagesHiddenFromTheAttentionReader: records.theMessagesHiddenFromTheAttentionReader,
    attentionWithTheseHidden: (input, hidden) => records.attentionWithTheseHidden(input, hidden, kept.read),
  }
  // THIS THREAD ONLY READS. From here a write on this connection is refused by SQLite, so the server's
  // own connection stays the only one that writes. It is set after the imports because three of the
  // files records.ts loads put a temporary trigger on their connection when they load (dispatch.ts,
  // lifecycle.ts, wake.ts), and SQLite refuses even that once the connection only reads. Those
  // triggers live on this connection only. That the imports changed no row is checked, not assumed.
  const changedOnLoad = (sqlite.prepare('SELECT total_changes() AS rows').get() as { rows: number }).rows
  if (changedOnLoad !== 0) {
    throw new Error(`Loading the attention thread changed ${String(changedOnLoad)} rows of the database, and this thread must only read.`)
  }
  sqlite.pragma('query_only = ON')
  // THE FILE IS READ THROUGH A MEMORY MAP. Every ask reads every record of a project, about 441 MB of stored data on a
  // made-up office the size of the owner's, and through the page cache each page was copied out of the system's cache
  // first. With the map, the same statement took 467 ms for 571 (each the median of five warm reads, round 143). SQLite
  // keeps the map within its own build's limit, about 2 GB, and reads the rest of a larger file as before. Only this
  // connection is mapped: it only reads, and the server's own connection is left as it is.
  sqlite.pragma('mmap_size = 2147483648')
  // ONE READ TRANSACTION FOR EVERY ASK ANSWERED TOGETHER. On the request thread no write could land
  // between the reads of the records, the links and the change rows. Here one could, so the reads share
  // one snapshot of the database, and each reading is of one moment as it was before.
  const lastChangeRow = sqlite.prepare('SELECT MAX(append_order) AS last FROM changes')
  const answerTogether = sqlite.transaction((asks: readonly AttentionAsk[], answered: Set<number>): void => {
    const lastChange = (lastChangeRow.get() as { last: number | null }).last
    answerTheseAsksTogether(asks, lastChange, { records: readFrom, shapes, messages }, (answer) => {
      port.postMessage(answer)
      answered.add(answer.id)
    })
  })
  // THE ASKS WAITING AT THE PORT ARE ANSWERED TOGETHER. The port hands over the messages waiting for it
  // one after another, and the answering starts on the turn after, so it starts with all of them. Home,
  // flow, the whole reading and the other projects, asked at once on the made-up office of the live
  // size, were answered from one reading of the project asked about (round 26 of wave 13w). An ask
  // that arrives a moment later waits for the next turn, and is answered as it was before.
  const waiting: AttentionAsk[] = []
  const answerTheWaiting = (): void => {
    const asks = waiting.splice(0)
    const answered = new Set<number>()
    try {
      answerTogether(asks, answered)
    } catch (err) {
      const said = err instanceof Error ? (err.stack ?? err.message) : String(err)
      for (const ask of asks) if (!answered.has(ask.id)) port.postMessage({ id: ask.id, error: said } satisfies AttentionAnswer)
    }
  }
  port.on('message', (said: ToTheAttentionThread) => {
    // AFTER EVERY ASK SENT BEFORE IT, which the port hands over first, and before every ask sent after it.
    if ('readEverythingAgain' in said) {
      kept.readEverythingAgain()
      return
    }
    const ask = said
    waiting.push(ask)
    if (waiting.length === 1) setImmediate(answerTheWaiting)
  })
  // READY ONLY NOW, with the listener in place, so no ask is sent to a thread that is still loading.
  port.postMessage({ ready: true } satisfies AttentionAnswer)
}

const database = (workerData as Record<string, unknown> | null)?.[THE_ATTENTION_THREAD]
if (typeof database === 'string') await serveOnThisThread(database)
