// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BRING FORWARD EVERY REVIEW ROUND SEVEN STORED AS A CONVERSATION. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS THERE, AND WHAT IT COULD NOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * Round seven had no place to put a review, so it used the nearest thing it had: a row of
 * `agent_threads` with `mode = 'review'`, and each remark a row of `agent_messages` inside it. That
 * carries the words, and it cannot carry the review. A conversation does not say where somebody was
 * standing when they started collecting, what counts as inside, or what was in it when they
 * finished — the three facts a review is made of.
 *
 * THIS IS NOT HYPOTHETICAL. The owner's own review has been open since 09:40 on 18 August 2026 with
 * one comment in it, and that comment is the whole reason round eight exists. Its id is
 * `mSOSTMcl5mka`, and tests/review-migration.test.ts checks for it BY ID rather than by counting
 * rows, because a count would pass on a database that had brought forward somebody else's.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHAT IT REFUSES TO WRITE
 * ---------------------------------------------------------------------------------------
 *
 * ONE ROW OF `reviews` PER REVIEW-MODE CONVERSATION, AND NOTHING ELSE. Not a message, not a record,
 * not a link, not a change row. `agent_threads` and `agent_messages` are not read for anything
 * except what is written below, and neither is touched.
 *
 * THE WORDS ARE NOT COPIED. They stay in `agent_messages`, and the new row names the conversation in
 * `from_thread_id` so `membersOf` in src/server/lib/reviews.ts reads them from where they are. A
 * copy would be the same sentence in two writable rows, free to disagree — the defect this
 * repository keeps producing. It is also why nothing is deleted: moving the words would mean
 * removing a row of somebody's own writing inside a migration, and no migration here may lose a row.
 *
 * THE NEW REVIEW KEEPS THE CONVERSATION'S ID. It is the same review — round seven stored it in the
 * wrong table — and keeping the id means the thing the owner has been looking at keeps its name.
 *
 * WHERE IT WAS STARTED FROM IS MEASURED, NEVER GUESSED. The entry is taken from the first comment
 * in the conversation that says what it points at, because that is the only evidence in the database
 * of where the person was standing. A CONVERSATION WHOSE COMMENTS ALL POINT AT NOTHING IS LEFT
 * EXACTLY AS IT IS and reported, one note per row: inventing an entry would invent a scope, and a
 * scope decides what a review collects and eventually sends.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A conversation that already has a review naming it is counted as done and not touched. A second
 * run over a migrated database plans nothing and writes nothing.
 */

import type Database from 'better-sqlite3'
import { isTargetKind } from '@shared/targets.ts'
import { REVIEW_COLUMNS_NAMING_A_CONVERSATION } from './schema.ts'

/** One conversation this migration would not guess at, and why. */
export interface ReviewMigrationNote {
  kind: 'no_comments' | 'nothing_pointed_at' | 'unreadable_context'
  threadId: string
  detail: string
}

export interface ReviewMigrationReport {
  /** True when there was no review-mode conversation left to bring forward. */
  alreadyDone: boolean
  /** How many reviews were written. */
  brought: number
  /** How many already had a review of their own and were left alone. */
  alreadyThere: number
  /**
   * How many `mode = 'review'` conversations were made after round seven ended, and are therefore
   * none of this migration's business. Counted rather than left unsaid: it is the number of
   * conversations this file deliberately did not look inside, and a reader of the report is
   * entitled to know it is not zero.
   */
  madeSinceRoundSeven: number
  /** Every conversation this would not guess at. Left exactly as it was. */
  notes: ReviewMigrationNote[]
}

/** One review-mode conversation, as much of it as this file reads. */
interface ThreadRow {
  id: string
  workspace_id: string
  created_at: string
  created_by: string
}

/** One comment of it, as much of it as this file reads. */
interface MessageRow {
  id: string
  context: string | null
  created_at: string
  created_by: string
}

/** One review this migration would write. */
interface Bring {
  id: string
  workspace_id: string
  entry: string
  state: 'collecting'
  started_at: string
  started_by: string
  collected_at: null
  frozen: null
  from_thread_id: string
}

/**
 * THE MOMENT ROUND SEVEN ENDED, AS A LOCAL WALL CLOCK — the whole of what makes this migration's
 * subject something it cannot be wrong about.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS MIGRATION NEEDED ONE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * What it is for is round SEVEN's reviews, which were conversations because there was nowhere else
 * to put them. It used to identify one by shape alone: a `mode = 'review'` conversation that no
 * review names, that has a comment, and whose comment says what it points at. Every one of those
 * three is reachable through the front door of the product as it stands today — `POST
 * /api/agent/threads` mints `mode = 'review'` for any caller and its own description offers the
 * value — so a conversation somebody starts this afternoon looked exactly like one from round
 * seven. The next start then REFUSED TO SERVE, because bringing it forward is a write, and a server
 * start may not write. That is the same defect five times over: one fact — what a round-seven
 * review conversation IS — worked out in two places, free to disagree, nothing failing when they
 * did, and failing at the next restart.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MOMENT, AND WHY THIS ONE
 * ---------------------------------------------------------------------------------------
 *
 * Round seven is over. It is not a shape, it is a period, and the only thing that can say whether a
 * conversation belongs to it is when it was written. `drizzle/0070_review_collection.sql` created
 * the `reviews` table and it landed in commit `5a9a1c2` at 2026-08-19 01:09:42 +0100; from that
 * moment on a review in this product is a row of that table, and a `mode = 'review'` conversation
 * created afterwards was created by round eight or later. Before it, there was nowhere else for one
 * to live. The owner's own review — `mSOSTMcl5mka`, open since 09:40 on 18 August 2026, the one
 * this migration exists for — is on the round-seven side of it by sixteen hours.
 *
 * SO THE MIGRATION CANNOT CLAIM A CONVERSATION THE CURRENT PRODUCT MADE, and not because anybody
 * remembered to check: clocks move forward, and every conversation this product will ever make is
 * stamped after this moment. Nothing on the writing side has to co-operate for that to hold, which
 * is what the other four fixes of this class were missing.
 *
 * IT IS COMPARED AGAINST `agent_threads.created_at`, WHICH IS THE AUTHORED FACT AND NOT THE INSERT.
 * An archive restored next year brings its conversations' own moments with it, so genuine
 * round-seven work imported later is still round-seven work here.
 *
 * A CONVERSATION ON THE OTHER SIDE OF IT IS COUNTED AND SAID, NEVER SILENTLY DROPPED — see
 * `madeSinceRoundSeven` in the report and the line `describeReviewMigration` prints for it.
 *
 * The date is written the way `nowStamp` in @shared/time.ts writes one, because that is what the
 * column holds and the comparison is a string comparison.
 */
export const ROUND_SEVEN_ENDED = '2026-08-19 01:09:42'

/** Whether both tables this migration needs exist. A fresh database may not have them yet. */
function tablesAreThere(sqlite: Database.Database): boolean {
  const has = (name: string): boolean =>
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
  return has('agent_threads') && has('agent_messages') && has('reviews')
}

/**
 * WHAT THIS MIGRATION WOULD DO, WITHOUT DOING ANY OF IT.
 *
 * Exported so the preview a server start runs, and the test, both read the real plan rather than a
 * paraphrase of it.
 */
export function planReviewMigration(sqlite: Database.Database): {
  brings: Bring[]
  notes: ReviewMigrationNote[]
  alreadyThere: number
  madeSinceRoundSeven: number
} {
  const brings: Bring[] = []
  const notes: ReviewMigrationNote[] = []
  let alreadyThere = 0

  if (!tablesAreThere(sqlite)) return { brings, notes, alreadyThere, madeSinceRoundSeven: 0 }

  const threads = sqlite
    .prepare("SELECT id, workspace_id, created_at, created_by FROM agent_threads WHERE mode = 'review'")
    .all() as ThreadRow[]
  // ROUND SEVEN'S CONVERSATIONS, AND NOTHING ELSE. See `ROUND_SEVEN_ENDED` above for why a moment
  // is what decides this and why nothing the current product writes can land on this side of it.
  const madeSinceRoundSeven = threads.filter((thread) => thread.created_at > ROUND_SEVEN_ENDED).length
  const readMessages = sqlite.prepare(
    'SELECT id, context, created_at, created_by FROM agent_messages WHERE thread_id = ? ORDER BY position',
  )
  // IS THIS CONVERSATION ALREADY ACCOUNTED FOR BY A REVIEW? Asked over EVERY column of `reviews`
  // that names a conversation, off the one list in ./schema.ts, plus the review's own id — because
  // a review brought forward keeps the conversation's id, which is how a second run over a migrated
  // database finds its own work.
  //
  // IT USED TO ASK ABOUT `from_thread_id` ALONE, and sending a review writes `sent_thread_id`. So
  // the conversation Send creates matched nothing, was planned for bringing forward every time, and
  // `prepareToServe` refused to serve for ever after. The fix is here rather than in Send:
  // `from_thread_id` means the round-seven conversation whose `agent_messages` ARE this review's
  // comments — `membersOf` in src/server/lib/reviews.ts reads them out of it when it is set — and a
  // review started in round eight has no such conversation. Its comments are annotations, and the
  // conversation Send makes is where they WENT. Writing that id into `from_thread_id` would make
  // the review read its own outgoing messages back as its members, which is a worse defect than the
  // one it would close.
  const already = sqlite.prepare(
    `SELECT id FROM reviews WHERE id = ?${REVIEW_COLUMNS_NAMING_A_CONVERSATION.map(
      (column) => ` OR ${column} = ?`,
    ).join('')}`,
  )
  /** The same conversation id, once for the review's own id and once per column above. */
  const asked = (threadId: string): string[] =>
    [threadId, ...REVIEW_COLUMNS_NAMING_A_CONVERSATION].map(() => threadId)

  for (const thread of threads) {
    if (already.get(...asked(thread.id)) !== undefined) {
      alreadyThere += 1
      continue
    }
    // AND IT IS NOT ONE OF ROUND SEVEN'S. Asked after the question above and not before it, so a
    // review brought forward by an earlier run still reads as done rather than as out of scope.
    if (thread.created_at > ROUND_SEVEN_ENDED) continue

    const messages = readMessages.all(thread.id) as MessageRow[]
    if (messages.length === 0) {
      notes.push({
        kind: 'no_comments',
        threadId: thread.id,
        detail:
          `nobody wrote anything in it, so there is no evidence of where the review was started from and no ` +
          `remark to bring forward. It is left exactly as it is.`,
      })
      continue
    }

    // THE FIRST COMMENT THAT SAYS WHAT IT POINTS AT. Not the newest and not a merge of all of them:
    // where somebody was standing when they started collecting is what the FIRST thing they said
    // was about.
    let entry: string | null = null
    let startedBy = thread.created_by
    let started = thread.created_at
    let unreadable = 0
    for (const message of messages) {
      if (message.context === null) continue
      let stored: unknown
      try {
        stored = JSON.parse(message.context)
      } catch {
        unreadable += 1
        continue
      }
      if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
        unreadable += 1
        continue
      }
      const target = (stored as Record<string, unknown>)['target']
      if (typeof target !== 'object' || target === null || Array.isArray(target)) {
        unreadable += 1
        continue
      }
      const kind = (target as Record<string, unknown>)['kind']
      if (typeof kind !== 'string' || !isTargetKind(kind)) {
        unreadable += 1
        continue
      }
      // THE ENTRY IS THE TARGET AND NOT THE WHOLE CONTEXT. A quote and a revision belong to the
      // remark that was written, not to where the person was standing, and carrying them onto the
      // review would say it was started against particular words nobody chose it for.
      entry = JSON.stringify({ target })
      // MEASURED OFF THE COMMENT, NOT OFF THE CONVERSATION. A review starts when somebody starts
      // collecting, and the earliest evidence of that is the first thing they said.
      startedBy = message.created_by
      started = message.created_at
      break
    }

    if (entry === null) {
      notes.push({
        kind: unreadable > 0 ? 'unreadable_context' : 'nothing_pointed_at',
        threadId: thread.id,
        detail:
          unreadable > 0
            ? `${String(unreadable)} of its ${String(messages.length)} comment${messages.length === 1 ? '' : 's'} ` +
              `store something Mole Office cannot read as a thing anybody can point at, and no other comment says what ` +
              `it was about. So nothing says where this review was started from, and inventing one would invent ` +
              `what it collects. It is left exactly as it is.`
            : `none of its ${String(messages.length)} comment${messages.length === 1 ? '' : 's'} says what it was ` +
              `about, so nothing says where this review was started from. Inventing one would invent what it ` +
              `collects and eventually sends. It is left exactly as it is.`,
      })
      continue
    }

    brings.push({
      id: thread.id,
      workspace_id: thread.workspace_id,
      entry,
      state: 'collecting',
      started_at: started,
      started_by: startedBy,
      collected_at: null,
      frozen: null,
      from_thread_id: thread.id,
    })
  }

  return { brings, notes, alreadyThere, madeSinceRoundSeven }
}

/** Do it. One transaction, one table, and every conversation it will not guess at reported. */
export function migrateReviews(
  sqlite: Database.Database,
  opts: { dryRun?: boolean } = {},
): ReviewMigrationReport {
  const { brings, notes, alreadyThere, madeSinceRoundSeven } = planReviewMigration(sqlite)
  const report: ReviewMigrationReport = {
    alreadyDone: brings.length === 0,
    brought: brings.length,
    alreadyThere,
    madeSinceRoundSeven,
    notes,
  }
  if (brings.length === 0 || opts.dryRun === true) return report

  // ONE TABLE. Nothing is written to `agent_threads` or `agent_messages`: a review being brought
  // forward is not somebody saying something, and every list of conversations is ordered by the
  // thread's `updated_at`.
  const write = sqlite.prepare(
    'INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, collected_at, frozen, from_thread_id) ' +
      'VALUES (@id, @workspace_id, @entry, @state, @started_at, @started_by, @collected_at, @frozen, @from_thread_id)',
  )
  const run = sqlite.transaction(() => {
    for (const bring of brings) write.run(bring)
  })
  run()
  return report
}

/** The line `npm run db:migrate` prints. Every note is printed: each is a review somebody has to look at. */
export function describeReviewMigration(report: ReviewMigrationReport): string {
  const head = report.alreadyDone
    ? `reviews: nothing to bring forward (${report.alreadyThere} conversation${report.alreadyThere === 1 ? '' : 's'} ` +
      `already have one)`
    : `reviews: ${report.brought} conversation${report.brought === 1 ? '' : 's'} brought forward as reviews, ` +
      `${report.alreadyThere} already there`
  // SAID, NOT LEFT OUT. A conversation made after round seven ended is none of this migration's
  // business, and a reader who is told nothing about it cannot tell that from there being none.
  const since =
    report.madeSinceRoundSeven === 0
      ? ''
      : `; ${report.madeSinceRoundSeven} review conversation${report.madeSinceRoundSeven === 1 ? ' was' : 's were'} ` +
        `made after round seven ended on ${ROUND_SEVEN_ENDED} and ${report.madeSinceRoundSeven === 1 ? 'is' : 'are'} ` +
        `not this migration's to bring forward`
  const lines = report.notes.map((note) => `  [${note.kind}] ${note.threadId}: ${note.detail}`)
  return head + since + (lines.length === 0 ? '' : `\n${lines.length} this migration will not guess at:\n${lines.join('\n')}`)
}
