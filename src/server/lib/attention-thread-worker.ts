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
 * A BATCH OVER THIS MANY MILLISECONDS WRITES ITS LINE, and so does a batch in which one ask's wait at the port and its
 * answer came to more than this together (`answerOneBatch`). Over means more than: a batch of exactly this writes none.
 */
export const A_SLOW_ATTENTION_BATCH_MS = 2000

/**
 * THE CLOCK BOTH THREADS READ, in milliseconds since 1970. The request thread stamps each ask with it as it posts the
 * ask, and this thread times each batch by it. Each thread has its own `performance.timeOrigin`, the moment that
 * thread started, so `performance.now()` alone on one thread cannot be compared with the other's. With its origin
 * added, each thread reads the same scale.
 */
export function theClockBothThreadsRead(): number {
  return performance.timeOrigin + performance.now()
}

/**
 * What the request thread asks: one reading, with the input `attentionNow` takes, in one shape; or Home's
 * first page for each of several projects. `sentAt` is when the request thread posted it, by
 * `theClockBothThreadsRead`, so a slow batch's line can say how long it waited at the port.
 */
export type AttentionAsk = { id: number; sentAt: number } & (OneReading | EachProject)

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

/** An answer to one ask. */
type AnAnswer = Exclude<AttentionAnswer, { ready: true }>

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
 * WHAT A BATCH NOTES OF ITS READINGS, by `clock`, for the line a slow batch writes: each reading worked out, in the
 * order worked out, with its project, how long `attentionWithTheseHidden` took and whether it failed; and for each
 * ask, by its id, the readings it used, by their place in that list.
 */
export interface TheReadingsTimed {
  clock: () => number
  readings: { workspaceId: string; took: number; failed: boolean }[]
  used: Map<number, number[]>
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
 *
 * EACH READING IS TIMED in `timed` where it is worked out, so a reading shared by alike asks is timed once, and each
 * ask's readings are noted there (`answerOneBatch` writes them in a slow batch's line).
 */
export function answerTheseAsksTogether(
  asks: readonly AttentionAsk[],
  lastChange: number | null,
  files: TheReadingFiles,
  send: (answer: Exclude<AttentionAnswer, { ready: true }>) => void,
  timed: TheReadingsTimed = { clock: theClockBothThreadsRead, readings: [], used: new Map() },
): void {
  const readings = new Map<string, { reading: AttentionReading; place: number }>()
  const readingFor = (input: OneReading['input'], used: number[]): AttentionReading => {
    const hidden = files.records.theMessagesHiddenFromTheAttentionReader(input)
    const alike = JSON.stringify([input.workspaceId, input.resources, input.now ?? null, hidden])
    const known = readings.get(alike)
    if (known !== undefined) {
      used.push(known.place)
      return known.reading
    }
    // A READING THAT FAILS IS TIMED AND NOTED TOO. It is not kept, so an alike ask after it works it out again, as before.
    const noted = { workspaceId: input.workspaceId, took: 0, failed: true }
    const place = timed.readings.push(noted) - 1
    used.push(place)
    const began = timed.clock()
    try {
      const reading = files.records.attentionWithTheseHidden(input, hidden)
      noted.failed = false
      readings.set(alike, { reading, place })
      return reading
    } finally {
      noted.took = timed.clock() - began
    }
  }
  // EACH READER'S HIDDEN MESSAGES ARE WORKED OUT ONCE for every ask and project here, since nothing here writes.
  files.messages.withEachHiddenListWorkedOutOnce(() => {
    for (const ask of asks) {
      const used: number[] = []
      timed.used.set(ask.id, used)
      let answer: Exclude<AttentionAnswer, { ready: true }>
      try {
        const shaped =
          'each' in ask
            ? (ask.each.map((workspaceId) => ({ workspaceId, reading: files.shapes.homeAttention(readingFor({ ...ask.forEach, workspaceId }, used)) })) satisfies EachProjectsHomeAttention)
            : files.shapes.attentionInTheShape(ask.asked, readingFor(ask.input, used))
        answer = { id: ask.id, shaped, lastChange, readings: readings.size }
      } catch (err) {
        answer = { id: ask.id, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }
      }
      send(answer)
    }
  })
}

/**
 * ANSWER ONE BATCH, THE ASKS THAT WERE WAITING AT THE PORT, AND SAY WHAT IT DID WHEN IT WAS SLOW.
 *
 * `answerTogether` answers the asks inside one read transaction, through `answerTheseAsksTogether`, with what it is
 * handed here. If it fails as a whole, each ask it had not answered is answered with that failure, as before.
 *
 * THE BATCH IS TIMED by `clock`. It begins here and ends when its last answer has been sent. An ask waited from its
 * `sentAt` to the beginning, and was answered once its answer had been sent, counted from the beginning. When the
 * batch took over `A_SLOW_ATTENTION_BATCH_MS`, or one ask's wait and answer together did, one line goes to `log`.
 * It names each ask in the order answered, with its kind, its project or projects, its wait, its answer, the readings
 * it used and whether it failed, and then each reading's project and time. So the time an ask spent outside its
 * readings can be seen: working out the hidden lists, cutting a reading to its shape and copying the answer to the port.
 *
 * NOTHING ELSE OF AN ASK IS IN THE LINE: no reader, resources, clock, hidden message, part's `from` or `machine`, and
 * no words of an error. The line goes to the server's log, and those say who asked and what they may read.
 *
 * Exported for the tests, which hand in a clock they move. The thread hands in none, so it reads `theClockBothThreadsRead`.
 */
export function answerOneBatch(
  asks: readonly AttentionAsk[],
  answerTogether: (send: (answer: AnAnswer) => void, timed: TheReadingsTimed) => void,
  send: (answer: AnAnswer) => void,
  log: (line: string) => void,
  clock: () => number = theClockBothThreadsRead,
): void {
  const began = clock()
  const timed: TheReadingsTimed = { clock, readings: [], used: new Map() }
  const answered = new Map<number, { at: number; failed: boolean }>()
  const sendIt = (answer: AnAnswer): void => {
    send(answer)
    answered.set(answer.id, { at: clock(), failed: 'error' in answer })
  }
  try {
    answerTogether(sendIt, timed)
  } catch (err) {
    const said = err instanceof Error ? (err.stack ?? err.message) : String(err)
    for (const ask of asks) if (!answered.has(ask.id)) sendIt({ id: ask.id, error: said })
  }
  const line = theLineOfASlowBatch(asks, began, answered, timed)
  if (line !== null) log(line)
}

/** The line `answerOneBatch` writes for a batch, or null when the batch and each ask were inside the limit. Times are whole milliseconds. */
function theLineOfASlowBatch(
  asks: readonly AttentionAsk[],
  began: number,
  answered: ReadonlyMap<number, { at: number; failed: boolean }>,
  timed: TheReadingsTimed,
): string | null {
  const asked = new Map(asks.map((ask) => [ask.id, ask]))
  // Every answer sent is to an ask of this batch.
  const inTheOrderAnswered = [...answered].map(([id, { at, failed }]) => ({ id, ask: asked.get(id)!, answeredAt: Math.round(at - began), failed }))
  const waitedFor = (ask: AttentionAsk): number => Math.round(began - ask.sentAt)
  const took = inTheOrderAnswered.at(-1)?.answeredAt ?? 0
  const anAskWasSlow = inTheOrderAnswered.some((one) => waitedFor(one.ask) + one.answeredAt > A_SLOW_ATTENTION_BATCH_MS)
  if (took <= A_SLOW_ATTENTION_BATCH_MS && !anAskWasSlow) return null
  const eachAsk = inTheOrderAnswered.map(({ id, ask, answeredAt, failed }, place) => {
    const used = [...new Set(timed.used.get(id) ?? [])].map((reading) => String(reading + 1))
    const from = used.length === 0 ? 'from no reading' : `from ${used.length === 1 ? 'reading' : 'readings'} ${inAList(used)}`
    return `Ask ${String(place + 1)}, ${whatWasAsked(ask)}: waited ${String(waitedFor(ask))} ms, answered at ${String(answeredAt)} ms, ${from}${failed ? ', failed' : ''}.`
  })
  const eachReading = timed.readings.map(
    (one, place) => `Reading ${String(place + 1)}, project ${one.workspaceId}, ${String(Math.round(one.took))} ms${one.failed ? ', failed' : ''}.`,
  )
  const together = answered.size === 1 ? 'answered 1 ask' : `answered ${String(answered.size)} asks together`
  return [`The attention thread ${together} in ${String(took)} ms.`, ...eachAsk, ...eachReading].join(' ')
}

/** An ask's kind and its project or projects, and nothing else of it. */
function whatWasAsked(ask: AttentionAsk): string {
  if ('each' in ask) return `home of each project (${ask.each.join(', ')})`
  const kind = ask.asked.shape === 'part' ? `part ${ask.asked.part}` : ask.asked.shape
  return `${kind} of project ${ask.input.workspaceId}`
}

/** "1", "1 and 2", "1, 2 and 3". */
function inAList(words: readonly string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`
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
  const toTheLog = (line: string): void => port.postMessage({ log: line } satisfies FromTheAttentionThread)
  const kept = keptAttentionRecords(toTheLog)
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
  const answerTogether = sqlite.transaction((asks: readonly AttentionAsk[], send: (answer: AnAnswer) => void, timed: TheReadingsTimed): void => {
    const lastChange = (lastChangeRow.get() as { last: number | null }).last
    answerTheseAsksTogether(asks, lastChange, { records: readFrom, shapes, messages }, send, timed)
  })
  // THE ASKS WAITING AT THE PORT ARE ANSWERED TOGETHER. The port hands over the messages waiting for it
  // one after another, and the answering starts on the turn after, so it starts with all of them. Home,
  // flow, the whole reading and the other projects, asked at once on the made-up office of the live
  // size, were answered from one reading of the project asked about (round 26 of wave 13w). An ask
  // that arrives a moment later waits for the next turn, and is answered as it was before. Each batch is timed, and
  // one that was slow says what it did in the server's log (`answerOneBatch`).
  const waiting: AttentionAsk[] = []
  const answerTheWaiting = (): void => {
    const asks = waiting.splice(0)
    answerOneBatch(asks, (send, timed) => answerTogether(asks, send, timed), (answer) => port.postMessage(answer), toTheLog)
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
