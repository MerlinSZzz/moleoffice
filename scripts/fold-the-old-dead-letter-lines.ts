// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOLD THE OLD DEAD-LETTER LINES IN THE SECRETARIAT GROUP INTO ONE LINE. Nothing is deleted.
 *
 *   npx tsx scripts/fold-the-old-dead-letter-lines.ts --check    # say what it would do, and write nothing
 *   npx tsx scripts/fold-the-old-dead-letter-lines.ts            # do it
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Until wave 13n round 32 the dead-letter sweep (src/server/lib/deadletters.ts) wrote one line
 * "Dead letters to claim" into the Secretariat group, and then one line "<handle>: <n> dead letters"
 * for each addressee. Every line was delivered to every member: each secretary and the person. On
 * the live office that left about 230 such lines in the group the person reads, and over a
 * thousand queued deliveries to agents. Problem 0WUuvB0IhRfb in the office has the account.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN THREE STEPS
 * ---------------------------------------------------------------------------------------
 *
 * 1. It finds the lines. A line is an old dead-letter line when ALL of these hold, read from what
 *    was stored, never from a record id:
 *      - it is a message, not deleted, written into the Secretariat group (the group whose `about`
 *        is SECRETARIAT_GROUP_KEY);
 *      - it is not folded already;
 *      - `whatThisOldDeadLetterLineSays` in src/shared/dead-letter-lines.ts reads it as one: Mole
 *        Office sent it, and its body is "Dead letters to claim" or "<handle>: <n> dead letter(s)",
 *        whatever its title or its sentence. The group draws a folded line with the same reader.
 *    Every other line is left exactly as it is: a message a person or an agent wrote, and every
 *    other line of Mole Office's (a restart, the sweep's one line since 2 October 2026, the fold line
 *    itself). The run lists what it leaves, by kind, with the reason.
 * 2. It folds the lines under ONE line of Mole Office's in the group, delivered to nobody. Where the
 *    group already holds a fold line from an earlier run, the lines are folded under that one, and
 *    its sentence is written again to count every line it holds. Otherwise it writes the fold line.
 *    It sets `foldedInto` on each folded line to that line's id, through the office's own record
 *    door, so the change log keeps each change. The group draws the one line, at the time of the
 *    oldest line it holds, and opens the folded ones under it.
 * 3. It archives the deliveries to agents that are still queued for any folded line, folded now or
 *    by an earlier run. A delivery to the person is not touched.
 *
 * With --check it does none of the writing. It prints what it found and what it would write.
 *
 * Running it twice folds nothing the second time and says so. Step 3 runs again each time, so a
 * run that stopped in step 3 is finished by the next run.
 *
 * STEP 2 IS NOT ONE TRANSACTION. A record write opens a transaction of its own, which cannot be
 * nested. If the run stops part way through step 2, the lines already folded stay folded, and the
 * next run folds the rest under the same line.
 */

import { sqlite } from '../src/server/db/client.ts'
import { settings } from '../src/config/settings.mjs'
import { SECRETARIAT_GROUP_KEY, SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_SWEEP_BODY, isTheFoldLine, whatTheFoldHolds, whatThisOldDeadLetterLineSays, type ALineToRead } from '../src/shared/dead-letter-lines.ts'
import { isMoleOffice, type ParticipantRef } from '../src/shared/participants.ts'
import { nowStamp } from '../src/shared/time.ts'
import { THE_OFFICES_OWN_LINE, THE_OFFICE_FOLDS_ITS_LINES, patchRecord } from '../src/server/lib/records.ts'
import { writeASystemLine } from '../src/server/lib/groups.ts'
import { archiveDeliveries } from '../src/server/lib/messages.ts'
import { THE_OFFICE_WRITES_AS } from '../src/server/lib/the-offices-secretary-run.ts'

// ============================================================================ the arguments

const args = process.argv.slice(2)
const unknown = args.filter((one) => one !== '--check')
if (unknown.length > 0) {
  console.error(`This script takes only --check. It was given: ${unknown.join(' ')}. Nothing was written.`)
  process.exit(2)
}
const check = args.includes('--check')
// WHICH DATABASE THIS RUN OPENED, said first, so the reader can tell it is the one they meant.
console.log(`The database: ${String(settings().databasePath)}`)

// ============================================================================ the lines, as this script reads them

/** Who this act is: Mole Office putting its own lines right. The change log says so. */
const ACTOR = { type: THE_OFFICE_WRITES_AS.type, id: THE_OFFICE_WRITES_AS.id }

/** One message in the group, as this script reads it. */
interface Line extends ALineToRead {
  id: string
  sentAt: string
  foldedInto: string | null
}

/** The sender a stored row names, or null because it names none this script can read. */
function senderOf(data: Record<string, unknown>): ParticipantRef | null {
  const said = data['sentBy']
  if (typeof said !== 'object' || said === null) return null
  const kind = (said as { kind?: unknown }).kind
  const id = (said as { id?: unknown }).id
  return (kind === 'agent' || kind === 'person') && typeof id === 'string' ? { kind, id } : null
}

/** WHY THIS LINE IS LEFT AS IT IS, said as its kind, for the list the run prints. */
function whyItIsLeft(line: Line): string {
  if (line.sentBy === null || !isMoleOffice(line.sentBy)) {
    return 'messages a person or an agent wrote: a fold never takes words somebody wrote'
  }
  if (isTheFoldLine(line)) return 'fold lines: the line the folded lines are drawn under'
  if (line.body === THE_SWEEP_BODY) {
    return `the sweep's one line "${THE_SWEEP_BODY}" since 2 October 2026: it says what one sweep did, and is not an old dead-letter line`
  }
  return `other lines of Mole Office's, which are not dead-letter lines: "${line.body.slice(0, 60)}"`
}

// ============================================================================ the archiving of deliveries

/** One delivery row this script would archive. */
interface QueuedDelivery {
  id: string
  messageId: string
  recipientId: string
}

/**
 * ARCHIVE THESE DELIVERIES, through `archiveDeliveries` in src/server/lib/messages.ts, the one writer
 * of the "archived" mark. Each row gets the sentence saying why. Answers how many were archived.
 */
function archiveTheseDeliveries(rows: readonly QueuedDelivery[], foldOf: ReadonlyMap<string, string>): number {
  return archiveDeliveries(
    rows.map((one) => ({
      messageId: one.messageId,
      who: { kind: 'agent' as const, id: one.recipientId },
      because:
        `This old dead-letter line was folded into the line ${foldOf.get(one.messageId) ?? '(not recorded)'} in the ` +
        'Secretariat group. Nobody read it here, and nobody will be woken for it.',
    })),
  ).length
}

// ============================================================================ step 1: find the lines

const group = sqlite.prepare('SELECT id, workspace_id AS workspaceId FROM groups WHERE about = ?').get(SECRETARIAT_GROUP_KEY) as
  | { id: string; workspaceId: string }
  | undefined
if (group === undefined) {
  console.log('This database has no Secretariat group, so there is no dead-letter line to fold. Nothing was written.')
  process.exit(0)
}

const lines = (
  sqlite
    .prepare(
      "SELECT id, created_at AS createdAt, data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.toGroup') = ? ORDER BY created_at, id",
    )
    .all(group.id) as { id: string; createdAt: string; data: string }[]
).map((row): Line => {
  const data = JSON.parse(row.data) as Record<string, unknown>
  const body = data['body']
  const said = data['saidInFull']
  const into = data['foldedInto']
  return {
    id: row.id,
    sentAt: row.createdAt,
    sentBy: senderOf(data),
    body: typeof body === 'string' ? body : '',
    saidInFull: typeof said === 'string' ? said : null,
    foldedInto: typeof into === 'string' && into !== '' ? into : null,
  }
})
const joins = (
  sqlite.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND left_at IS NULL').get(group.id) as { n: number }
).n

const toFold: Line[] = []
const alreadyFolded: Line[] = []
const leftAlone = new Map<string, number>()
let openings = 0
for (const line of lines) {
  if (line.foldedInto !== null) {
    alreadyFolded.push(line)
    continue
  }
  const what = whatThisOldDeadLetterLineSays(line)
  if (what === null) {
    const why = whyItIsLeft(line)
    leftAlone.set(why, (leftAlone.get(why) ?? 0) + 1)
    continue
  }
  toFold.push(line)
  if (what.kind === 'to claim') openings += 1
}

// THE FOLD LINE THE LINES GO UNDER: the one an earlier run wrote, where it holds lines and is not itself
// folded, so the group keeps one fold line. The newest such line, should there be more than one.
const holding = new Set(alreadyFolded.map((one) => one.foldedInto))
const earlierFold = [...lines].reverse().find((one) => one.foldedInto === null && isTheFoldLine(one) && holding.has(one.id)) ?? null

console.log(check ? 'Checking only. Nothing will be written.' : 'Folding. This writes to the database.')
console.log(`Step 1. The Secretariat group ${group.id} holds ${String(lines.length)} messages.`)
console.log(
  `  ${String(toFold.length)} are old dead-letter lines to fold: ${String(openings)} "Dead letters to claim" ` +
    `and ${String(toFold.length - openings)} lines for one addressee each.`,
)
console.log(`  ${String(alreadyFolded.length)} are folded already, by an earlier run.`)
console.log(`  The other ${String(lines.length - toFold.length - alreadyFolded.length)} are left as they are, by kind:`)
for (const [why, count] of leftAlone) console.log(`    ${String(count)} x ${why}`)
console.log(
  `  And the group's ${String(joins)} joins stay too: a join is drawn from the group's list of members, not from a ` +
    'line, so there is nothing to fold.',
)

// ============================================================================ step 2: the one line, and the folds

/** Every line the fold line will hold, in the order written: those an earlier run folded under it, and these. */
function everyLineItWillHold(foldId: string | null): Line[] {
  const before = foldId === null ? [] : alreadyFolded.filter((one) => one.foldedInto === foldId)
  return [...before, ...toFold].sort((one, other) => (one.sentAt === other.sentAt ? 0 : one.sentAt < other.sentAt ? -1 : 1))
}

/** "1 line" or "13 lines": the lines to fold, as the run's sentences name them. */
const theLines = `${String(toFold.length)} ${toFold.length === 1 ? 'line' : 'lines'}`

if (toFold.length === 0) {
  console.log('Step 2. No dead-letter line is waiting to be folded, so no line is written and no line is folded.')
} else if (earlierFold !== null) {
  const fold = whatTheFoldHolds(everyLineItWillHold(earlierFold.id), earlierFold.sentAt)
  const said = fold === null ? null : SYSTEM_LINES.oldDeadLetterLinesFolded(fold)
  if (check) {
    console.log(`Step 2. It would fold ${theLines} under the fold line ${earlierFold.id}, which an earlier run wrote,`)
    console.log(`  and write that line's sentence again: "${said?.said ?? ''}"`)
  } else {
    for (const line of toFold) {
      patchRecord(line.id, { dataPatch: { foldedInto: earlierFold.id }, [THE_OFFICE_FOLDS_ITS_LINES]: true }, ACTOR)
    }
    if (said !== null) patchRecord(earlierFold.id, { dataPatch: { saidInFull: said.said }, [THE_OFFICES_OWN_LINE]: true }, ACTOR)
    console.log(`Step 2. Folded ${theLines} under the fold line ${earlierFold.id}, which an earlier run wrote.`)
    console.log(`  Wrote its sentence again: "${said?.said ?? ''}". No line was deleted.`)
  }
} else {
  const at = nowStamp()
  const fold = whatTheFoldHolds(everyLineItWillHold(null), at)
  if (fold === null) throw new Error('There are lines to fold, and the fold read none of them. Nothing was written.')
  const said = SYSTEM_LINES.oldDeadLetterLinesFolded(fold)
  if (check) {
    console.log('Step 2. It would write this line into the group, delivered to nobody:')
    console.log(`    "${said.line}"`)
    console.log(`    with the whole sentence: "${said.said ?? ''}"`)
    console.log(`  and it would set foldedInto on ${theLines} to that line's id.`)
  } else {
    // DELIVERED TO NOBODY, the same way the dead-letter sweep's own line names who it goes to.
    const written = writeASystemLine(group.id, group.workspaceId, said, ACTOR, undefined, [])
    if (written === null) {
      throw new Error(`The Secretariat group ${group.id} has no member, so the line was not written. No line was folded.`)
    }
    // THE SENTENCE SAYS WHEN THE LINE WAS WRITTEN, which the page reads off the line's own time. Where the
    // write's clock moved on past `at`, the sentence is written again with the line's own time.
    const stored = sqlite.prepare('SELECT created_at AS createdAt FROM records WHERE id = ?').get(written.id) as { createdAt: string }
    if (stored.createdAt !== at) {
      const again = SYSTEM_LINES.oldDeadLetterLinesFolded({ ...fold, writtenAt: stored.createdAt })
      patchRecord(written.id, { dataPatch: { saidInFull: again.said }, [THE_OFFICES_OWN_LINE]: true }, ACTOR)
    }
    console.log(`Step 2. Wrote the line ${written.id} into the group, delivered to nobody: "${said.line}".`)
    for (const line of toFold) {
      patchRecord(line.id, { dataPatch: { foldedInto: written.id }, [THE_OFFICE_FOLDS_ITS_LINES]: true }, ACTOR)
    }
    console.log(`  Set foldedInto to ${written.id} on ${theLines}. No line was deleted.`)
  }
}

// ============================================================================ step 3: the queued deliveries to agents

const folded = [...alreadyFolded.map((one) => one.id), ...toFold.map((one) => one.id)]
const queued: QueuedDelivery[] = []
const ask = sqlite.prepare(
  "SELECT id, message_id AS messageId, recipient_id AS recipientId FROM message_delivery " +
    "WHERE message_id = ? AND mark = 'queued' AND recipient_kind = 'agent' ORDER BY id",
)
for (const id of folded) queued.push(...(ask.all(id) as QueuedDelivery[]))

if (queued.length === 0) {
  console.log('Step 3. No folded line has a delivery to an agent still queued, so nothing is archived.')
} else if (check) {
  console.log(
    `Step 3. It would archive ${String(queued.length)} deliveries to agents that are still queued for folded lines, ` +
      `for ${String(new Set(queued.map((one) => one.recipientId)).size)} agents. Deliveries to the person are not touched.`,
  )
} else {
  console.log(`Step 3. Archiving ${String(queued.length)} deliveries to agents that are still queued for folded lines.`)
  const foldOf = new Map<string, string>()
  for (const id of folded) {
    const row = sqlite.prepare("SELECT json_extract(data, '$.foldedInto') AS folded_into FROM records WHERE id = ?").get(id) as
      | { folded_into: string | null }
      | undefined
    if (typeof row?.folded_into === 'string') foldOf.set(id, row.folded_into)
  }
  console.log(`  Archived ${String(archiveTheseDeliveries(queued, foldOf))} deliveries.`)
}

console.log(check ? 'Done checking. Nothing was written.' : 'Done.')
