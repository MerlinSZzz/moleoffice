// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS READ IS BUILT ONE AT A TIME FOR ONE PROJECT AND ONE READER, AND NOT AGAIN WHILE NOTHING HAS BEEN WRITTEN.
 *
 * From 10:46 to 11:00 on 10 October 2026 the owner's review panel asked GET /api/messages/comments about every 40 s,
 * and each answer took 32 to 48 s on the one thread, the 304s too, because the version tag (lib/version-tags.ts) is
 * taken only after the whole answer is built. Presence, attention and a new agent waited behind it, and the secretary restarted
 * the office at 11:02 (wave 13y round 18). The cause is fixed in the review walk (`whatCanBeReachedFrom` in
 * lib/reviews.ts). This guard keeps any later cause from holding the office the same way.
 *
 * ONE BUILD AT A TIME. A request for a project and reader whose answer is being built gets that build's answer, and
 * starts no other. The build is synchronous, so a request that arrives during it reaches this door only after it has
 * ended. So the build is still taken as in flight until the event loop has gone round once more, which is when the
 * requests that queued behind it are read. They get its answer only if nothing has been written since it ended, so a
 * request that came after a write is never given the answer from before it. This holds for an answer that is not kept
 * as well, so a hundred requests queued behind one build are one build.
 *
 * AN UNCHANGED ANSWER IS NOT BUILT AGAIN. Before building, the door reads two numbers from SQLite: `total_changes()`,
 * every row this connection has changed (triggers included), less the rows the request log writes for every request
 * (`rowsWrittenByTheRequestLog`); and `data_version`, which moves when another connection writes. When both are what
 * they were when the kept answer was built, nothing in the database has changed, so that answer is the one a build
 * would give, and it is given. This bound is coarse on purpose: any write anywhere counts, not only a write the answer
 * reads, so it never needs a second list of what the answer reads. It costs two statements.
 *
 * AN ANSWER THAT READ THE CLOCK IS NOT KEPT. A comment whose own words name its recipient is matched against a reading
 * of the sessions, and that reading judges each session against now (`howManyRecipientReadingsReadTheClock`). Such an
 * answer can change with nothing written, so it is built every time. An answer whose build wrote anything is kept
 * under the writes from before the build, so it is never given again.
 *
 * AT MOST 32 ANSWERS ARE KEPT, the oldest let go first. A reader is a project and the JSON of who reads.
 */
import { sqlite } from '../db/client.ts'
import { howManyRecipientReadingsReadTheClock } from './recipients.ts'
import { rowsWrittenByTheRequestLog } from './usage.ts'

const AT_MOST_KEPT = 32

interface Kept {
  writes: string
  answer: unknown
}

const kept = new Map<string, Kept>()
interface Building {
  answer: Promise<unknown>
  /** The writes when the build ended, or null while it has not. */
  writesAtTheEnd: string | null
}

const building = new Map<string, Building>()
let built = 0

/** Every write to the database so far, as one string: other connections', then this one's, less the request log's. */
export function theWritesSoFar(): string {
  const others = sqlite.pragma('data_version', { simple: true }) as number
  const mine = (sqlite.prepare('SELECT total_changes() AS rows').get() as { rows: number }).rows - rowsWrittenByTheRequestLog()
  return `${String(others)}:${String(mine)}`
}

/** How many comments answers this process has built. For the tests, which prove that a request did not build one. */
export function howManyCommentsAnswersWereBuilt(): number {
  return built
}

/** The answer for this reader: the one being built, else the kept one if nothing was written since, else a new build. */
export function theCommentsAnswer<T>(reader: string, build: () => T): Promise<T> {
  const writes = theWritesSoFar()
  const inFlight = building.get(reader)
  if (inFlight !== undefined && (inFlight.writesAtTheEnd === null || inFlight.writesAtTheEnd === writes)) {
    return inFlight.answer as Promise<T>
  }
  const was = kept.get(reader)
  if (was !== undefined && was.writes === writes) return Promise.resolve(was.answer as T)
  const entry: Building = { answer: Promise.resolve(), writesAtTheEnd: null }
  const answer = Promise.resolve().then(() => {
    built += 1
    const clock = howManyRecipientReadingsReadTheClock()
    let made: T
    try {
      made = build()
    } finally {
      entry.writesAtTheEnd = theWritesSoFar()
    }
    kept.delete(reader)
    if (howManyRecipientReadingsReadTheClock() === clock) {
      kept.set(reader, { writes, answer: made })
      if (kept.size > AT_MOST_KEPT) kept.delete(kept.keys().next().value as string)
    }
    return made
  })
  entry.answer = answer
  building.set(reader, entry)
  // STILL IN FLIGHT UNTIL THE LOOP HAS GONE ROUND ONCE MORE, for the requests that queued behind the build.
  const letGo = (): void => {
    setImmediate(() => {
      setImmediate(() => {
        if (building.get(reader) === entry) building.delete(reader)
      })
    })
  }
  answer.then(letGo, letGo)
  return answer
}
