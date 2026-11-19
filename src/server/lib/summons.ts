// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUMMONS: A SECRETARY CALLS THE PERSON INTO THE OFFICE. One decision says so. It was made on
 * the proposal `JnxaWj4ERcXk` and on three messages. A second
 * decision says that the office only summons.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A SUMMONS IS, AND WHERE THE MAIL WENT
 * ---------------------------------------------------------------------------------------
 *
 * One message to the person in the office, as the secretary who called: who calls them, how urgent it is, and a one-line
 * title; and a push to every device where the person allowed notifications. Mail is a tool's and not the office's, as the owner's
 * decisions say. tools/mail-the-summonses.mjs
 * reads each summons with a key of its own, from the mark this door writes, and mails it from the account logged in on
 * this computer, as a third decision settled.
 * The office holds no mail setting and speaks to no mail server. The summons entries an earlier office
 * wrote into the person's key file stay where they are, read by nothing, since the person's data is never deleted.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A TITLE MAY CARRY
 * ---------------------------------------------------------------------------------------
 *
 * One line of at most THE_LONGEST_TITLE characters, with no link, no mail address and no machine address in it, and
 * anything else is refused before anything is told or written. A summons goes on to a mail, a push and wherever a tool
 * takes it, and none of them may carry the office's words or its address out of this machine; a reply by mail cannot
 * prove it is the person's (answer `bnkOzyR7x3R2`). There is no limit on how often a secretary calls, because
 * a limit could keep a real problem from reaching the person.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY SUMMONS IS A MESSAGE IN THE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * The door writes one message to the person, as the secretary who called, saying which devices were told. So every summons is
 * on record in the office, and one no device could be told of still reaches them the next time they look.
 */
import { THE_PERSON } from '@shared/person.ts'
import {
  SUMMONS_URGENCIES,
  THE_LONGEST_TITLE,
  type ASummonsRead,
  type SummonsDone,
  type SummonsUrgency,
  type TheSummonsesRead,
} from '@shared/summons.ts'
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { URGENCY_WORDS, withoutAddresses } from '../../config/the-summons-mail.mjs'
import { createRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
// AND EVERY DEVICE THE PERSON ALLOWED IS TOLD.
import { tellEveryDevice, type PushSend } from './push.ts'

/**
 * A TITLE THE MAIL MAY CARRY: one line, at most THE_LONGEST_TITLE characters, with no link, no mail address and no
 * machine address, so the office's words and addresses cannot ride out in it. Answers the trimmed title, or throws
 * the refusal.
 */
export function aTitleTheMailMayCarry(title: string): string {
  const one = title.trim()
  if (one === '') throw new PanelError('A summons needs a one-line title saying why the person is called. Nothing was sent.')
  if (/[\r\n]/.test(one)) throw new PanelError('A summons title is one line, because the office\'s words stay in the office. Nothing was sent.')
  if (one.length > THE_LONGEST_TITLE) {
    throw new PanelError(`A summons title is at most ${String(THE_LONGEST_TITLE)} characters, and this one is ${String(one.length)}. Nothing was sent.`)
  }
  if (/[a-z][a-z0-9+.-]*:\/\/|www\./i.test(one) || withoutAddresses(one) !== one) {
    throw new PanelError(
      'A summons title carries no link, no mail address and no machine address: the mail only calls the person in, and says ' +
        'nothing of where. Nothing was sent.',
    )
  }
  return one
}

/**
 * CALL THE PERSON IN. One message to the person is written in the office, as `actor`, and every device where the person allowed
 * notifications is told. `who` is the name the message signs with. The door has already checked the caller; the title
 * is checked here, before anything is told or written. The mail is the mail tool's, which reads this summons from the
 * mark the message carries (theSummonsesSince below).
 */
export async function summonThePerson(input: {
  workspaceId: string
  actor: Actor
  who: string
  title: string
  urgency: SummonsUrgency
  /** How a push reaches a push service; a test hands in its own stand-in. */
  push?: PushSend
}): Promise<SummonsDone> {
  const title = aTitleTheMailMayCarry(input.title)
  // EVERY DEVICE THE PERSON ALLOWED IS TOLD: push needs nothing set up but the person's press on the device, as two decisions
  // say. A push that cannot be made is said in the message, and never stops
  // the message itself, which is the one way the person is always called.
  let told = 0
  let about = ''
  try {
    const pushed = await tellEveryDevice(
      { title: `${input.who} 叫你到 office 来`, body: `${URGENCY_WORDS[input.urgency]}：${title}`, urgency: input.urgency, tag: 'summons' },
      input.push,
    )
    told = pushed.told
    about = pushed.says
  } catch (err) {
    about = `No device was told: ${err instanceof Error ? err.message : String(err)}`
  }
  const message = createRecord({
    workspaceId: input.workspaceId,
    kind: 'message',
    title: `召唤：${title}`,
    data: { body: `${input.who} 叫你到 office 来（${URGENCY_WORDS[input.urgency]}）：${title}\n\n${about}`, to: [{ kind: 'person', id: THE_PERSON }] },
    actor: input.actor,
    // WHAT A TOOL READING THE SUMMONSES IS GIVEN, and all it is given (theSummonsesSince below), as a decision
    // says. Only this door marks a message so; createRecord drops a mark any
    // caller sends.
    summonsMark: { who: input.who, urgency: input.urgency, title },
  }).id
  return { message, told, says: `${input.who} called the person in: ${title}. ${about}` }
}

/** How many summonses one read answers at most; a tool that has more to read asks again after the last. */
export const THE_MOST_SUMMONSES_ONE_READ_ANSWERS = 50

/**
 * THE SUMMONSES SINCE THE ONE A TOOL LAST READ, oldest first. A decision: a tool that takes a
 * summons to the person another way (the mail tool) reads them with a key of its own, under the one power "Reading the
 * summonses", and is given who called, how urgent, the title and when, and nothing else of the office: no address, no
 * password, no other words of the message.
 *
 * READ FROM THE MARK `summonThePerson` WRITES on each message (`data.summons`), in every project, because a summons calls
 * the person wherever it was made. A message written before the mark existed carries none and is not listed. `after` is the id of
 * the last summons the tool read, or null for the first read; an id that is no summons is refused, so a tool that lost its
 * place is told so rather than handed everything again.
 *
 * THE MARK IS READ IN THE WORDS OF ITS INDEX (`STORED_FIELDS.messageSummons`), which holds the summonses and no other
 * message, in the order they were made. So the read takes the summonses from the index, and reads no other message. A
 * message whose data is not JSON carries no mark, as for every stored field.
 */
export function theSummonsesSince(after: string | null): TheSummonsesRead {
  const aSummons = `kind = 'message' AND ${theWordsOfAStoredField(STORED_FIELDS.messageSummons, 'data')} IS NOT NULL`
  // THE PLACE TO READ ON FROM IS WHEN THE LAST ONE WAS MADE, AND ITS ROW. created_at is kept to the second, and summonses
  // made in one second are read in the order they were made, which is the row order, as the merge queue reads its entries;
  // their ids are random and say nothing of order.
  let from: { at: string; row: number } | null = null
  if (after !== null) {
    const known = sqlite
      .prepare(`SELECT created_at AS at, rowid AS row FROM records WHERE id = ? AND ${aSummons}`)
      .get(after) as { at: string; row: number } | undefined
    if (known === undefined) {
      throw new PanelError(
        `"${after}" is no summons this office holds, so there is no place to read on from. Nothing was read. Ask again with ` +
          'no `after` to read from the first summons, or with the id of the last summons read.',
        404,
      )
    }
    from = known
  }
  const rows = sqlite
    .prepare(
      "SELECT id, created_at AS at, json_extract(data, '$.summons.who') AS who, json_extract(data, '$.summons.urgency') AS urgency, " +
        `json_extract(data, '$.summons.title') AS title FROM records INDEXED BY records_message_summons_idx WHERE ${aSummons} ` +
        'AND deleted_at IS NULL AND (? IS NULL OR created_at > ? OR (created_at = ? AND rowid > ?)) ORDER BY created_at, rowid LIMIT ?',
    )
    .all(from?.at ?? null, from?.at ?? null, from?.at ?? null, from?.row ?? null, THE_MOST_SUMMONSES_ONE_READ_ANSWERS) as {
    id: string
    at: string
    who: unknown
    urgency: unknown
    title: unknown
  }[]
  // A SUMMONS THAT CANNOT BE READ IS NEVER GUESSED AT (invariant 5; problem 3E3Ygyzz-zwO): a summons read as urgent 'now'
  // from nobody would be mailed to the person as if it were one. Only the summons door writes the mark and nothing may change it,
  // so this is a fault to find. THE READ STOPS JUST BEFORE IT: the ones before it are answered, so none is lost to a
  // cursor that moved past them, and the next read, which starts at it, is refused and names it and what it lacks.
  const summonses: ASummonsRead[] = []
  let stoppedBeforeOne = false
  for (const row of rows) {
    const missing = whatASummonsLacks(row)
    if (missing.length === 0) {
      summonses.push({ id: row.id, at: row.at, who: row.who as string, urgency: row.urgency as SummonsUrgency, title: row.title as string })
      continue
    }
    if (summonses.length > 0) {
      stoppedBeforeOne = true
      break
    }
    throw new PanelError(
      `The summons ${row.id}, made ${row.at}, cannot be read: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} ` +
        'missing or not what the summons door writes, so Mole Office cannot say what it was. Nothing was read. Read on ' +
        `after it with ?after=${row.id}; the summons is still in the office.`,
      500,
    )
  }
  const says =
    summonses.length === 0
      ? after === null
        ? 'No summons has been made yet.'
        : 'No summons has been made since the last one read.'
      : `${summonses.length} summons${summonses.length === 1 ? '' : 'es'}, oldest first` +
        (stoppedBeforeOne
          ? '; the read stops before a summons that cannot be read, which the next read names.'
          : `${summonses.length === THE_MOST_SUMMONSES_ONE_READ_ANSWERS ? '; there may be more after the last' : ''}.`)
  return { summonses, says }
}

/** What a stored summons mark lacks of what the summons door writes: who called, how urgent, the title. Empty when whole. */
function whatASummonsLacks(row: { who: unknown; urgency: unknown; title: unknown }): string[] {
  const missing: string[] = []
  if (typeof row.who !== 'string' || row.who.trim() === '') missing.push('who called')
  if (!SUMMONS_URGENCIES.includes(row.urgency as SummonsUrgency)) missing.push('how urgent')
  if (typeof row.title !== 'string' || row.title.trim() === '') missing.push('the title')
  return missing
}
