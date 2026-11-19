// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMIND ME LATER: THE OFFICE BRINGS A MESSAGE BACK ONCE, AT THE TIME THE PERSON CHOSE.
 *
 * The press (`remindMeLater` in lib/messages.ts) writes the time on the person's delivery row. This file is the
 * office's side: one unref'd minute timer, started with the server, that reads every row whose time has come and
 * brings each message back once. The time lives in the database and not in a page, so the message comes back with
 * no page open, and a time that fell due while the office was down is kept on the first tick after the restart.
 *
 * HOW IT COMES BACK. It reached the person the first time as a line in the chat, waiting to be read. So it comes
 * back the same way: Mole Office writes one line to the person, about that message (`aboutMessage`), carrying the
 * same offer to take the person to a page (`lead`). A line not read waits on the person, so the chat's circle
 * counts it, Home's 等你处理 lists it, and the offer card is drawn again, each by its own reading of an unread
 * message, with nothing added here for them.
 *
 * WHO SET THE TIME. The delivery row keeps it (`remind_set_by_kind` and `remind_set_by_id`, migration 0288). Where that is
 * an agent, the secretary set the time for the person under their grant, and the line says so rather than saying the
 * person asked for it. Where it is the person, or nobody recorded it — which is every row written before that migration
 * — the line keeps the words it has always had.
 *
 * ONCE. `reminded_at` is written in the same transaction as the line, so a tick either does both or neither, and a
 * row with `reminded_at` is never brought back again until a new press writes a new time.
 */
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { messageDelivery } from '../db/schema.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { writeASystemLineToOne } from './groups.ts'
import { readMessageWhereverItIs } from './messages.ts'
import type { Actor } from './records.ts'
import { named } from './named-timers.ts'
import { settingValue } from '../../config/settings.mjs'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/**
 * HOW OFTEN THE TIMER LOOKS, in milliseconds: MOLE_OFFICE_REMIND_ME_LATER_EVERY_SECONDS, a minute unless set. A
 * message comes back at most this long after its time. A value that is not a positive whole number of seconds
 * within the timer's limit stops the start with its name, rather than a timer that runs at some other pace.
 */
function every(): number {
  const name = 'MOLE_OFFICE_REMIND_ME_LATER_EVERY_SECONDS'
  const value = settingValue(name)
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) <= 0 || Number(value) * 1000 > 2_147_483_647) {
    throw new Error(`${name} is ${JSON.stringify(value)}; it must be a positive whole number of seconds within the timer's limit.`)
  }
  return Number(value) * 1000
}

/** What one pass did: the messages it brought back, and the ones it could not, each with why. */
export interface BroughtBack {
  back: { messageId: string; to: ParticipantRef; line: string }[]
  failed: { messageId: string; because: string }[]
}

/**
 * ONE PASS: BRING BACK EVERY MESSAGE WHOSE TIME HAS COME AT `now`, ONCE. Exported so a test drives one pass with its
 * own clock instead of waiting for the timer.
 */
export function bringBackTheMessagesThatAreDue(now: Date): BroughtBack {
  const nowStamp = localStamp(now)
  const due = db
    .select()
    .from(messageDelivery)
    .where(and(isNotNull(messageDelivery.remindAt), isNull(messageDelivery.remindedAt), lte(messageDelivery.remindAt, nowStamp)))
    .all()
  const done: BroughtBack = { back: [], failed: [] }
  for (const row of due) {
    // A STORED TIME THAT CANNOT BE READ IS SAID, not guessed at. The stamps compare as text only when both are stamps.
    if (row.remindAt === null || parseStoredStamp(row.remindAt) === null) {
      done.failed.push({ messageId: row.messageId, because: `its time "${String(row.remindAt)}" cannot be read as a time` })
      continue
    }
    const to: ParticipantRef = { kind: row.recipientKind as ParticipantRef['kind'], id: row.recipientId }
    try {
      const { message, inProject } = readMessageWhereverItIs(row.messageId)
      // A SECRETARY'S TIME IS NOT THE PERSON'S OWN PRESS, so the line says the secretary set it under their grant.
      const said = row.remindSetByKind === 'agent' ? SYSTEM_LINES.aMessageBackAsTheSecretarySetIt : SYSTEM_LINES.aMessageBackAsYouAsked
      const line = sqlite.transaction(() => {
        const written = writeASystemLineToOne(
          to,
          inProject,
          said,
          theOffice(),
          { message: row.messageId },
          { backAsYouAsked: { remindAt: row.remindAt, from: message.sentBy } },
          message.lead,
        )
        db.update(messageDelivery)
          .set({ remindedAt: nowStamp })
          .where(and(eq(messageDelivery.id, row.id), isNull(messageDelivery.remindedAt)))
          .run()
        return written.id
      })()
      done.back.push({ messageId: row.messageId, to, line })
    } catch (err) {
      done.failed.push({ messageId: row.messageId, because: err instanceof Error ? err.message : String(err) })
    }
  }
  return done
}

/**
 * THE TIMER, started once with the server. ITS FIRST PASS RUNS AT ONCE, so a time that fell due while the office was
 * down is kept when the office is back rather than a minute later. One unref'd interval, so it never holds the
 * server open, and a pass that fails is a line in the log rather than a server down.
 */
export function startBringingMessagesBack(log: (line: string) => void): void {
  const EVERY = every()
  const tick = (): void => {
    try {
      const done = bringBackTheMessagesThatAreDue(new Date())
      if (done.back.length > 0) {
        log(`The office brought ${String(done.back.length)} message(s) back as the person asked: ${done.back.map((one) => one.messageId).join(', ')}.`)
      }
      for (const one of done.failed) log(`The office could not bring message ${one.messageId} back: ${one.because}.`)
    } catch (err) {
      log(`The Remind me later timer could not finish a pass: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const run = named('remind me later', log, tick)
  run()
  const watch: NodeJS.Timeout = setInterval(run, EVERY)
  watch.unref()
}
