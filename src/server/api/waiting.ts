// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/waiting` — everything waiting on the person, in every project, read once.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS ONE OF THESE
 * ---------------------------------------------------------------------------------------
 *
 * Home made four claims of the form "waiting on you", with four different numbers, and a fifth on
 * the Schedule. Each was honest about the question its own author had in mind and none of them was
 * the number the owner was looking for. The repair is not a better fifth number: it is one reading
 * that every band, badge and panel takes its number from, so that following the number finds the
 * things it counted.
 *
 * The reading is `readWaiting()` in src/server/lib/waiting.ts, which is where the three sources and
 * the dedup rule live. This file is the door onto it.
 *
 * ---------------------------------------------------------------------------------------
 * IT TAKES NOTHING, WHICH IS WHAT KEEPS A CROSS-PROJECT READING FROM BEING A WAY TO READ A PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * No path parameter, no query string, no body — the same structural promise `GET /api/forks` makes
 * about itself, and for the same reason. There is nothing for a caller to aim at a record it would
 * not otherwise be shown, and a row carries an id, a project, a kind, a title, the act, why it
 * qualified, how much it is holding up and when it started waiting. No body, no summary, no field
 * values. `WAITING_SCOPE` says so on the wire, so a caller does not have to read this comment.
 *
 * `GET /api/records/:id` is untouched and still refuses a cross-project id with a 404 that names
 * the other project. Opening a row from another project switches project first, which is why every
 * row carries its project's name and never only its id.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS. EVERY ACT IT NAMES IS PERFORMED SOMEWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Settling a fork is `POST /api/records/<the fork>/promote`, in the fork's own project, which is
 * where the human-only guard is asked for real. This route writes nothing, and the guards it asks
 * are asked with a probe that is turned away by design.
 */

import type { FastifyInstance } from 'fastify'
import {
  EXCLUDED_SENTENCES,
  WAITING_SCOPE,
  readWaiting,
  type ExcludedReason,
  type WaitingItem,
  type WaitingReading,
  type WithdrawnRequest,
} from '../lib/waiting.ts'
import { route } from '../lib/route.ts'
import { actorFrom } from '../lib/http.ts'
import { theMessageReader, type AMessageReader } from '../lib/messages.ts'

/** One bucket of things that are not rows, with the words for it built from its key. */
export interface ExcludedOnTheWire {
  reason: ExcludedReason
  count: number
  /**
   * The bucket in words, from `EXCLUDED_SENTENCES`.
   *
   * The key is what a reader groups by; the sentence is what a person reads. It is built from the
   * key here rather than stored beside the count, so there is one place the words live and a bucket
   * cannot end up with a sentence about a different bucket.
   */
  sentence: string
  /** On `withdrawn-by-its-asker` only: each request, with who withdrew it and when (decision tFl1YWLH3eCl). */
  withdrawn?: WithdrawnRequest[]
}

export interface WaitingReply {
  /** Every thing waiting on the person, in every project. Holding work up first, then oldest. */
  items: WaitingItem[]
  /** The three parts of the band. They sum to `items.length` because they have one scope. */
  counts: { settle: number; asked: number; setAside: number }
  /** What the owner might have expected here and will not find, by reason, with a count each. */
  excluded: ExcludedOnTheWire[]
  /** What this reading covers and what a row deliberately does not carry. */
  scope: string
  /** What the reply says about itself, counted from the rows in it and never asserted beside them. */
  note: string
}

export const WAITING_NOTE =
  'Everything waiting on the person, in every project: GET /api/waiting. THREE SOURCES, ONE READING. (1) A ' +
  'REFUSED ACT — the act that would settle this is refused to every agent except the secretary carrying the ' +
  "person's authorization, so it waits for a person or for that secretary. " +
  'Membership is worked out by ASKING THE GUARD FUNCTIONS, not from a list of acts kept by hand, so a guard ' +
  'that stopped refusing agents empties this tier on the next read. (2) AN AGENT ASKED — a live record carries ' +
  '`whose_move: person`, its own state word does not say it has ended, and the revision ledger says who wrote ' +
  'that and when. An agent may ADD one of these and may not take one away. (3) SET ASIDE BY THE OWNER — a date ' +
  'or a condition the owner set. Set-aside is not a fourth way of qualifying: an item gets there by having ' +
  'qualified under one of the first two, it is still counted, and `setAsideFrom` keeps the tier and the reason ' +
  'it came from. WHERE AN ITEM QUALIFIES TWICE IT IS ONE ROW: set aside wins over both tiers, and a refused act ' +
  'wins over a request. Every row keeps WHY it qualified, as facts in `because` and as a sentence in `why` ' +
  'built from those same facts. IT TAKES NO PARAMETERS AND NO WORKSPACE: something waiting on you does not stop ' +
  'waiting because you are reading a different project today. It reads and never writes — settle a fork with ' +
  'POST /api/records/<the fork>/promote in that fork\'s own project, which is where the guard is asked for real.'

/**
 * WHAT THE REPLY SAYS ABOUT ITSELF, COUNTED FROM THE ROWS IN IT.
 *
 * WHAT WAS NOT COUNTED COMES FIRST WHEN THERE IS ANY, because a list that is short by one is
 * indistinguishable from a complete one unless it says so. That is rule 10 of the design applied to
 * this reading's own number: a number told to the owner is the length of a list of ids plus a
 * visible count of what could not be listed.
 */
export function waitingNote(reading: WaitingReading): string {
  const total = reading.items.length
  const left = reading.excluded.reduce((n, group) => n + group.count, 0)
  const missing =
    left === 0
      ? ''
      : ` ${left} more ${left === 1 ? 'thing is' : 'things are'} not counted here: ` +
        `${reading.excluded.map((group) => `${group.count} because ${EXCLUDED_SENTENCES[group.reason]}`).join('; ')}.`

  if (total === 0) {
    return (
      'Nothing is waiting on you: no act that only a person may perform is pending on anything, nothing carries ' +
      'a request for a person, and nothing is set aside. That is a real answer rather than an empty list.' +
      missing
    )
  }
  const projects = new Set(reading.items.map((item) => item.workspaceId)).size
  const holding = reading.items.filter((item) => item.blocking > 0).length
  return (
    `${total} ${total === 1 ? 'thing is' : 'things are'} waiting on you, in ${projects} ` +
    `project${projects === 1 ? '' : 's'}: ${reading.counts.settle} to settle, ${reading.counts.asked} asked of ` +
    `you, ${reading.counts.setAside} set aside. ` +
    (holding === 0
      ? 'None of them is holding any other work up, so none is late — they are waiting.'
      : `${holding} of them ${holding === 1 ? 'is' : 'are'} holding other work up.`) +
    ' Every row says why it is here.' +
    missing
  )
}

export async function waitingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/waiting', route('project.waiting', 'remote', WAITING_NOTE), async (req): Promise<WaitingReply> => {
    // A MESSAGE ROW IS SHOWN, AND COUNTED, ONLY TO A READER WHO MAY READ THE MESSAGE.
    return theWaitingReply(theMessageReader(actorFrom(req)))
  })
}

/**
 * WHAT WAITS ON THE PERSON, AS ONE READER MAY SEE IT. `GET /api/waiting` answers it, and
 * `GET /api/where-you-stand` answers the same reply beside the brief (src/server/api/where-you-stand.ts).
 */
export function theWaitingReply(reader: AMessageReader): WaitingReply {
  const reading = readWaiting(undefined, undefined, reader)
  return {
    items: reading.items,
    counts: reading.counts,
    excluded: reading.excluded.map((group) => ({
      reason: group.reason,
      count: group.count,
      sentence: EXCLUDED_SENTENCES[group.reason],
      ...(group.withdrawn === undefined ? {} : { withdrawn: group.withdrawn }),
    })),
    scope: WAITING_SCOPE,
    note: waitingNote(reading),
  }
}
