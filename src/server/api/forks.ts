// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/forks` — the forks waiting on a person, whole, across every project.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ANSWERS THAT `GET /api/needs-you` DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * `needs-you` tells a caller that a fork exists and is theirs. This carries the fork itself: the
 * question, the options as written, the recommendation, what the reasoning rests on, what would
 * reopen it, what the fork is holding up, and which project it belongs to. That is the difference
 * between a queue you read and a desk you work at — a person can settle a fork from this reply
 * without asking for anything else.
 *
 * Both come out of `readForks()` in src/server/lib/forks.ts, so the two cannot disagree about which
 * forks are open.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A ROUTE OF ITS OWN AND NOT A FLAG ON THE RECORD READ
 * ---------------------------------------------------------------------------------------
 *
 * `design/DECISIONS-PENDING.md` §39 settles this, and the settlement is as much about what did not
 * happen as about what did: *support a cross-project human governance desk through a dedicated
 * person-level projection, WITHOUT weakening normal workspace-scoped record access.*
 *
 * `GET /api/records/:id` stays exactly as it was. It answers about one project and refuses a
 * cross-project id with a 404 naming the other project. Nothing here adds a flag, a header or an
 * option to it.
 *
 * ---------------------------------------------------------------------------------------
 * IT TAKES NOTHING, WHICH IS WHAT KEEPS IT FROM BEING A WAY TO READ ANOTHER PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * No path parameter, no query string, no body. There is nothing for a caller to aim at a record it
 * would not otherwise be shown, and no shape of request that returns anything but open forks and
 * the work they are holding up. The reading behind it makes the same promise structurally — see the
 * header of src/server/lib/forks.ts, which is where the limit is kept.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS. SETTLING IS STILL `POST /api/records/<the fork>/promote`
 * ---------------------------------------------------------------------------------------
 *
 * That route is where the human-only guard is asked, and it is the only route that writes a
 * `decision`. An agent is refused there whether it arrives from a record page, from Home or from
 * this reply, which is the whole point of there being one door. This route writes nothing.
 */

import type { FastifyInstance } from 'fastify'
import { readForks, type DecidedRecord, type ForkThatLeftTheQueue, type OpenFork, type SettledFork } from '../lib/forks.ts'
import { route } from '../lib/route.ts'
import { candidateDuplicates, type DuplicatesRead } from '../lib/duplicates.ts'

export interface ForksReply {
  /** Every fork still waiting on a person, in every project. Holding work up first, then oldest. */
  forks: OpenFork[]
  /** The forks a person has already settled, each with the decision that answers it. Newest first. */
  settled: SettledFork[]
  /**
   * EVERY DECISION A PERSON HAS MADE, in every project, newest first.
   *
   * `settled` above is the forks somebody answered. This is the larger list, because most decisions
   * in this corpus answer no proposal at all — they were filed on their own — and no reading of
   * forks can see one. Home draws its "what you decided" cards from this, and so does the decisions
   * page; both surfaces ask this one route once rather than asking two.
   *
   * It comes out of the same `readForks()` call as `forks` above, so a fork cannot be waiting in
   * one field of this reply and answered in another.
   *
   * A DECISION A LATER ONE REPLACED IS NOT HERE (problem ZSWftCSVUP2r): it has left normal content, and its own page
   * keeps it, marked replaced and naming its replacement. `decisionsReplaced` says how many were left out.
   */
  decisions: DecidedRecord[]
  /** How many live decisions `decisions` leaves out because a later decision replaced them. */
  decisionsReplaced: number
  /**
   * The forks that left the queue without anybody answering them, with why and what replaced them.
   *
   * Something supersedes it, or it is the same question as another fork. NOBODY DECIDED ANYTHING in
   * either case, which is why these are not in `settled`. They are reported rather than dropped: a
   * fork the owner has looked at twice that then disappears with no account is the failure this
   * whole reading exists to prevent.
   */
  leftTheQueue: ForkThatLeftTheQueue[]
  /** What this list is, in words — including what could not be read, when something could not. */
  note: string
}

export const FORKS_NOTE =
  'Every fork waiting on a person, whole: GET /api/forks. A fork is a `proposal`, and settling one is the act ' +
  "Mole Office refuses to every agent except the secretary carrying the person's authorization, so it waits until " +
  'a person answers it. Each entry carries the question, the ' +
  'options as written, whether a recommendation names one of them, the work it is holding up by name, the ' +
  "record's own stored fields and which project it belongs to — enough to decide it without a second request. " +
  'LIKE PLANNING AND LIKE /api/needs-you, IT TAKES NO WORKSPACE: a fork waiting on you does not stop waiting ' +
  'because you are reading a different project today. It is NOT a way to read another project — it takes no ' +
  'parameters at all, answers by kind and by resolution, and the only other records it names are the ones a ' +
  'fork itself points at with a `blocks` link. It reads and never writes: settle a fork with POST ' +
  '/api/records/<the fork>/promote, in that fork\'s own project, which is where the human-only guard is asked ' +
  'and the only place a `decision` is written. `settled` is the other half, the same reading that takes a fork ' +
  'off the open list, so that settling one does not make it disappear. `decisions` is every `decision` record in ' +
  'every project, newest first — including the ones nobody filed a proposal for, which is most of them and which ' +
  'no reading of forks can see — except a decision a later decision replaced, which has left normal content: ' +
  '`decisionsReplaced` counts those, and each one\'s own record names what replaced it. `leftTheQueue` is the third way out and it is not an answer: a fork something ' +
  'SUPERSEDES, or a fork that is a `duplicate_of` another, stops waiting on anybody without anybody having ' +
  'decided it. Each entry says which record replaced it, who made that link and when, so a fork never leaves ' +
  'this queue silently. ON A FORK THAT IS THE OWNER\'S, ONLY A LINK THE OWNER MADE OR ONE MADE ON THEIR AUTHORIZATION ' +
  'TAKES IT OFF, because an agent that ' +
  'could take a question away from the owner with a link would be settling it by another door. A link an agent made on ' +
  'one of the owner\'s forks is still stored and is still reported: the fork stays under `forks` and its ' +
  '`replacedButStillHere` says who claimed what, when, why it did not count, and the one request that would make ' +
  'it count. Neither link is ever written by Mole Office from a resemblance — a link is written by an actor that ' +
  'records why.'

/** What the reply says about itself. Counted from the forks in it, never asserted beside them. */
export function forksNote(reply: { forks: readonly OpenFork[]; settled: readonly SettledFork[] }): string {
  const open = reply.forks.length
  const projects = new Set(reply.forks.map((fork) => fork.workspaceId)).size
  // WHAT COULD NOT BE READ COMES FIRST WHEN THERE IS ANY, because a list that is short by one is
  // indistinguishable from a complete one unless it says so.
  const unreadable = reply.forks.reduce((n, fork) => n + fork.unreadable.length, 0)
  const trouble =
    unreadable === 0
      ? ''
      : ` ${unreadable} thing${unreadable === 1 ? '' : 's'} on ${
          reply.forks.filter((fork) => fork.unreadable.length > 0).length === 1 ? 'one of them' : 'some of them'
        } could not be read; each fork says which, under "unreadable".`

  // NO FORK OPEN IS NOT NOTHING WAITING, so the empty case says it counts forks only.
  if (open === 0) {
    return (
      'No fork is open. This counts forks only; everything waiting on the person is at GET /api/waiting.' + trouble
    )
  }
  const holding = reply.forks.filter((fork) => fork.blocks.length > 0).length
  return (
    `${open} fork${open === 1 ? '' : 's'} ${open === 1 ? 'is' : 'are'} waiting on you, in ` +
    `${projects} project${projects === 1 ? '' : 's'}. ` +
    (holding === 0
      ? 'None of them is holding any work up, so none is late — they are waiting.'
      : `${holding} of them ${holding === 1 ? 'is' : 'are'} holding work up.`) +
    trouble
  )
}

export const POSSIBLE_DUPLICATES_NOTE =
  'Forks that might be one question, with the reasons: GET /api/forks/possible-duplicates. IT WRITES NOTHING AND ' +
  'NOTHING HERE CAN. It compares every open fork in every project on four kinds of evidence and hands back groups ' +
  'with the reason for every pair: a stored `supersedes` or `duplicate_of` link between two of them, both forks ' +
  'pointing at the same record with `about` or `blocks`, both being part of the same work item, and the words ' +
  'their question and title share. Every reason names what it saw — the record, the shared words — rather than a ' +
  'score, so you can check it. A group whose only evidence is words is marked `onlyWords`: words are a ' +
  'resemblance and not a fact, and somebody has to read those before anything is recorded. WHY IT NEVER WRITES: ' +
  'the owner\'s rule is "Do not silently merge uncertain items." A suggestion that is wrong costs one glance; a ' +
  'link that is wrong loses a question. When you agree two forks are one, record it yourself with POST /api/links ' +
  '{"fromId":"<the repeat>","toId":"<the one to answer>","type":"duplicate_of"} — the fork you send as fromId is ' +
  'the one that leaves the queue — and say why in a record you link to it. Measured 27 August 2026: three of the ' +
  'owner\'s 27 forks asked one question about which repository 152 module claims belong to, and the owner would have ' +
  'been asked it three times.'

export async function forkRoutes(app: FastifyInstance): Promise<void> {
  // A READ, AND THE ONLY THING IT CAN DO. It is registered beside the fork queue because it is about
  // that queue, and it takes no parameters at all — the same limit `GET /api/forks` keeps.
  app.get(
    '/forks/possible-duplicates',
    route('project.forks.possible-duplicates', 'remote', POSSIBLE_DUPLICATES_NOTE),
    async (): Promise<DuplicatesRead> => candidateDuplicates(),
  )

  app.get('/forks', route('project.forks', 'remote', FORKS_NOTE), async (): Promise<ForksReply> => {
    const read = readForks()
    const reply = {
      forks: read.open,
      settled: read.settled,
      decisions: read.decisions,
      // HOW MANY DECISIONS A LATER ONE REPLACED, left out of `decisions` (problem ZSWftCSVUP2r). Each is on its own page.
      decisionsReplaced: read.decisionsReplaced,
      leftTheQueue: read.leftTheQueue,
    }
    return { ...reply, note: forksNote(reply) }
  })
}
