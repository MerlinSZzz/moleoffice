// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S TYPING KEPT AS THEIR OWN WORDS, WITH NO PRESS. Wave 13u, round 4.
 *
 * What the person types in the office's own terminal is recorded as their own words with no press, as chat is,
 * by point 2 of a decision. The secretary settled the details (YLv8grhgilBV):
 *   1. keeping is on in every terminal the person opens, with a switch on each terminal to turn it off;
 *   2. a line the screen did not show is never stored anywhere; the note says only how many lines were left out and
 *      why. Until round 12 a line that looks like a key was left out too; it is now kept, as the owner's decisions
 *      say, and the terminal view warns about it in a line
 * that blocks nothing;
 *   3. lines typed into an agent's terminal are kept too, as the person's words to that agent;
 *   4. kept lines stay like the person's other notes until they delete them, one line or the whole note;
 *   5. round 3's press to keep one line stays, for a terminal whose keeping is off.
 *
 * HOW A LINE GETS HERE. The holder reads what the person types (src/holder/index.mjs, `readTheTyping`). While a
 * terminal's keeping is on, each line ended with Enter waits there until the screen has been asked whether it showed
 * it. The typing door sees from the holder's answer that lines wait, and takes them a moment later, here. A line the
 * screen did not show, one edited with an arrow key, and one typed for somebody else (the holder's typeALine) comes
 * without its text. A line longer than THE_LONGEST_LINE_KEPT is dropped here before anything is written. So none of
 * these is ever stored.
 *
 * WHO WRITES THE NOTE. The person, because the typing came through the person-only door with the person's actor; the
 * note is then the person's own words by the `record` path of whoseRecordsAreThese (src/server/lib/the-persons-own-words.ts),
 * which needs no change for it. One note per terminal, found by `kept_from_terminal`; once the person deletes it, the next line
 * starts a new one.
 */

import { LEFT_OUT, KEPT_FROM_TERMINAL, THE_LONGEST_LINE_KEPT, TYPED_IN_TERMINAL, TYPED_TO_AGENT, theCommandLine, theLeftOutCountsOf, whatLooksLikeASecret } from '@shared/terminals.ts'
import type { TheKeeping, TerminalReading, WhyLeftOut } from '@shared/terminals.ts'
import { sqlite } from '../db/client.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { createRecord, getRecord, patchRecord, type Actor } from './records.ts'
import { askTheHolderFor } from './terminals.ts'
import { named } from './named-timers.ts'

/** How long after an Enter the lines are taken: after the holder has asked the screen (its SHOWN_AFTER_MS, 300). */
export const TAKE_AFTER_MS = 450

/** How many characters of the terminal's name a kept note's title holds. */
const TITLE_LENGTH = 80

/** One line as the holder hands it over: its text, or why it was left out without it. */
type Handed = { text: string; at: string } | { left: keyof typeof THE_COUNT_OF; at: string }

/** Which of the note's counts each of the holder's reasons goes in. */
const THE_COUNT_OF = { 'not-shown': 'notShown', edited: 'edited', 'typed-by-another': 'typedByAnother' } as const satisfies Record<string, WhyLeftOut>

/** Each terminal's takes, one after the other, so two takes never write the same note at once. */
const takes = new Map<string, Promise<void>>()

/**
 * TAKE THE LINES THAT WAIT IN ONE TERMINAL and keep them in the person's note for it. Called by the typing door a moment
 * after it passed on an Enter. Lines still waiting for the screen are taken by one more take.
 */
export function takeTheLinesLater(terminal: string, actor: Actor, warn: (line: string) => void): void {
  setTimeout(named('the take of typed lines', warn, () => {
    const before = takes.get(terminal) ?? Promise.resolve()
    const next = before
      .then(() => takeTheLines(terminal, actor))
      .then((waiting) => {
        if (waiting > 0) takeTheLinesLater(terminal, actor, warn)
      })
      .catch((err: unknown) => {
        // NOBODY WAITS ON THIS, so it goes to the server's log, saying which lines were lost.
        warn(`The lines typed into terminal ${terminal} could not be kept, and are lost: ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => {
        if (takes.get(terminal) === next) takes.delete(terminal)
      })
    takes.set(terminal, next)
  }), TAKE_AFTER_MS)
}

/** Take the waiting lines once; answers how many still wait for the screen. Exported for the tests. */
export async function takeTheLines(terminal: string, actor: Actor): Promise<number> {
  const answer = await askTheHolderFor({ op: 'takeLines', terminal })
  const handed = answer['lines'] as Handed[]
  if (handed.length === 0) return answer['waiting'] as number
  const kept: string[] = []
  const leftOut: Record<WhyLeftOut, number> = { notShown: 0, edited: 0, tooLong: 0, typedByAnother: 0 }
  for (const line of handed) {
    if ('left' in line) {
      const why: WhyLeftOut | undefined = THE_COUNT_OF[line.left]
      if (why === undefined) throw new Error(`the holder left a line out for a reason this server does not know: ${JSON.stringify(line.left)}`)
      leftOut[why] += 1
    }
    else if (line.text.length > THE_LONGEST_LINE_KEPT) leftOut.tooLong += 1
    else kept.push(line.text)
  }
  const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
  const reading = listed.find((one) => one.id === terminal)
  if (reading === undefined) throw new Error(`the holder no longer holds terminal ${terminal}`)
  const note = theNoteOf(terminal)
  if (note === null) {
    const where = `${theCommandLine(reading)} in ${reading.folder}`
    const agent = reading.agent === null ? null : (theAgentAnArrivingReferenceNames(reading.agent.id, 'reading')?.agent.handle ?? reading.agent.id)
    const title = agent !== null ? `Typed to ${agent} in a terminal` : `Typed in ${where}`
    createRecord({
      kind: 'note',
      title: title.length > TITLE_LENGTH ? `${title.slice(0, TITLE_LENGTH - 1)}…` : title,
      workspaceId: reading.project,
      data: {
        ...(kept.length > 0 ? { body: kept.join('\n') } : {}),
        date: handed[0]!.at.slice(0, 10),
        [TYPED_IN_TERMINAL]: where,
        [KEPT_FROM_TERMINAL]: terminal,
        ...(reading.agent !== null ? { [TYPED_TO_AGENT]: reading.agent.id } : {}),
        ...theCounts(leftOut, { notShown: 0, edited: 0, tooLong: 0, typedByAnother: 0 }),
      },
      actor,
    })
  } else {
    const body = typeof note.data['body'] === 'string' && note.data['body'] !== '' ? note.data['body'] : null
    patchRecord(
      note.id,
      {
        dataPatch: {
          ...(kept.length > 0 ? { body: [...(body === null ? [] : [body]), ...kept].join('\n') } : {}),
          ...theCounts(leftOut, theLeftOutCountsOf(note.data)),
        },
      },
      actor,
    )
  }
  return answer['waiting'] as number
}

/** The note that keeps one terminal's lines, or null when none does yet (or the person deleted it). */
function theNoteOf(terminal: string): { id: string; data: Record<string, unknown> } | null {
  const row = sqlite
    .prepare(
      "SELECT id FROM records WHERE kind = 'note' AND deleted_at IS NULL AND json_valid(data) " +
        `AND json_extract(data, '$.${KEPT_FROM_TERMINAL}') = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(terminal) as { id: string } | undefined
  const record = row === undefined ? null : getRecord(row.id)
  return record === null ? null : { id: record.id, data: record.data }
}

/** The left-out counts after this take, as the note's fields; a count still at nought is not written. */
function theCounts(now: Record<WhyLeftOut, number>, before: Record<WhyLeftOut, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const why of Object.keys(LEFT_OUT) as WhyLeftOut[]) {
    const total = before[why] + now[why]
    if (total > 0) out[LEFT_OUT[why]] = total
  }
  return out
}

/** What a terminal's keeping is now, for the terminal view: `keyLike` counts the note's lines that look like a key. */
export function theKeepingOf(reading: TerminalReading): TheKeeping {
  const note = theNoteOf(reading.id)
  if (note === null) return { on: reading.keeping, note: null }
  const record = getRecord(note.id)!
  const body = typeof note.data['body'] === 'string' && note.data['body'] !== '' ? (note.data['body'] as string) : null
  const lines = body === null ? [] : body.split('\n')
  return {
    on: reading.keeping,
    note: {
      id: note.id,
      title: record.title,
      lines: lines.length,
      keyLike: lines.filter((line) => whatLooksLikeASecret(line) !== null).length,
      leftOut: theLeftOutCountsOf(note.data),
    },
  }
}
