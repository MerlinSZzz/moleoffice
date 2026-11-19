// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/needs-you` — what only the human can do, across every project.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND IT IS A PRODUCT FAILURE RATHER THAN A FEATURE REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * Two forks were settled by the owner in writing, and the governance act that records them —
 * promoting a proposal into a decision — is refused to agents by design. So the product was left
 * waiting on the person. The person then tried to do it, and to get there they had to: know two
 * opaque nanoids, search for those nanoids, tell apart the records that MENTION an id from the
 * record whose id it is, open an agent's message, and copy a `curl` line out of it.
 *
 * That is not an acceptable interaction, and it is the direct cause of this route. If Mole Office knows
 * the human is required, Mole Office says so where they are already looking, with the action attached.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SPANS PROJECTS, AND WHAT THAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Every other panel on Home shows the project in the switcher. This one cannot, and the incident
 * above is the proof: the two proposals were in `panelx` and the browser was open on `default`, so a
 * project-scoped queue would have shown the owner an empty list while the thing they were looking
 * for sat two clicks away under a name they had no reason to guess.
 *
 * The reasoning is the one already settled for planning: some things are facts about a PERSON rather
 * than about a project. A workspace answers *which project owns this work*; this route answers
 * *what is waiting on you*. The limit is the same limit, and it is kept in `src/server/lib/forks.ts`
 * — one query, by kind and by resolution, with no caller-supplied filter reaching it. Learning that
 * a fork is open in `greenhouse` is not a way to read `greenhouse`.
 *
 * ---------------------------------------------------------------------------------------
 * THIS ROUTE AND `GET /api/forks` READ THE SAME FORKS
 * ---------------------------------------------------------------------------------------
 *
 * `readForks()` in src/server/lib/forks.ts is the one reading. This route is the SHORT answer — what
 * is waiting on you, with enough of each to act on it and no more — and `GET /api/forks` is the long
 * one, carrying each fork's own fields so that a person can settle it without opening it. If each
 * worked out for itself which forks are open, the two could disagree about what is waiting on a
 * person, which is the defect this repository keeps finding.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO: §18 IS STILL OPEN AND IS NOT TAKEN HERE
 * ---------------------------------------------------------------------------------------
 *
 * `design/DECISIONS-PENDING.md` §18 asks whether an unresolved proposal should reach the ATTENTION
 * RULE — the ranked list of what needs somebody today, whose one sentence has kept it short and
 * legible. This route does not touch that rule, add a clause to it, or give a proposal a
 * consequence. It is a SEPARATE surface with its own question, which is what lets the owner's
 * requirement be met without settling a fork that is theirs. Nothing here ranks a proposal against
 * work, and nothing here calls one urgent.
 */

import type { FastifyInstance } from 'fastify'
import { readForks, type DecidedRecord, type ForkThatLeftTheQueue, type SettledFork } from '../lib/forks.ts'
import { route } from '../lib/route.ts'
import { ACROSS_WORKSPACES, listRecords } from '../lib/records.ts'
import { aWaitingSelfRegistration } from '../lib/selfregistration.ts'
import { whatAPressOnThisAskDoes } from '../lib/newkey.ts'
import { theNameASelfRegistrationIsReadBy } from '@shared/profile.ts'
import { readWaiting, type WaitingReading } from '../lib/waiting.ts'
import { theNameAPersonReads } from '../lib/inspection.ts'

/**
 * The fork reading lives in `src/server/lib/forks.ts` now. These three are re-exported because the
 * apply route, the import reader and the tests already name this file as where they live, and
 * moving a definition is not a reason to make every caller chase it.
 */
export { humanLinked, forkIsSettled } from '../lib/forks.ts'
export type { DecidedRecord, SettledFork } from '../lib/forks.ts'

/** One thing that is waiting on the person, with enough to act on it and no more. */
export interface HumanAction {
  /**
   * What kind of act this is. Four now: settling a fork, giving one agent the card it asked for,
   * admitting a session that registered itself and waits for the person's press — the last two are the same
   * press where both are true (F15 point 2) — and letting an agent that asked for a new key be
   * answered one (problem x8ktQfHS5yGr).
   */
  act: 'promote-proposal' | 'give-card' | 'admit-agent' | 'give-new-key'
  recordId: string
  title: string
  /** The one line the record carries, when it has one. What the fork is about, in the author's words. */
  summary: string | null
  /** Which project the record belongs to. Reported, never used to filter this list. */
  workspaceId: string
  /** The question, when the record states one, so the row can be read without opening it. */
  question: string | null
  /** How many options the author wrote down. One is allowed when the fork is a plan to approve. */
  options: number
  /** Whether somebody wrote a recommendation at all. It says somebody thought about this fork. */
  recommendationWritten: boolean
  /** Whether Mole Office can tell which option that recommendation points at. See lib/forks.ts. */
  namesAnOption: boolean
  /**
   * How much work is waiting on this, counted from `blocks` links out of it.
   *
   * THE ONE NUMBER THAT SAYS WHETHER THIS MATTERS TODAY, and it is counted rather than judged: a
   * fork holding nothing up is quiet, and a fork holding three things up says so. This is the
   * mechanism §18 describes as already built, read here rather than reinvented.
   */
  blocking: number
  createdAt: string
  /** Why this is the person's and not an agent's, in words, because the reason is the point. */
  because: string
  /** For a card ask or an admission: the handle that asked. Absent on a fork. */
  asker?: string
  /** For a card ask or an admission: the card it asked for. Absent on a fork. */
  asking?: string
}

export interface NeedsYouReply {
  actions: HumanAction[]
  /**
   * The forks a human has settled, newest first. NOT capped here: how many are worth showing is a
   * reading decision and belongs on the surface that draws them, which states what it cut.
   */
  settled: SettledFork[]
  /**
   * EVERY DECISION THE PERSON HAS MADE, in every project, newest first.
   *
   * `settled` above is the forks a person answered. This is the larger list: it also holds the
   * decisions nobody ever filed a proposal for, which is most of them in this corpus and which no
   * fork reading can see. It is what the decisions page draws, and it is not capped here for the
   * same reason `settled` is not — how many to show is the surface's call, and the surface says
   * what it cut.
   *
   * IT IS A READ. Nothing here writes a decision, and settling a fork is still POST
   * /api/records/<the fork>/promote — refused to every agent except the secretary carrying the
   * person's authorization — so neither write is here.
   */
  decisions: DecidedRecord[]
  /** How many live decisions `decisions` leaves out because a later decision replaced them (problem ZSWftCSVUP2r). */
  decisionsReplaced: number
  /**
   * The forks that left this queue without being answered, with why and what replaced them.
   *
   * Something supersedes it, or it is the same question as another fork. Nobody decided anything, so
   * these are not in `settled` — and they are here rather than dropped, because a row that vanishes
   * with no account is worse than a row that stays.
   */
  leftTheQueue: ForkThatLeftTheQueue[]
  /**
   * THE THREE COUNTS OF `GET /api/waiting`, which is everything waiting on the person.
   *
   * `actions` above is only forks, card requests and admissions. A record an agent asked the person
   * about, an unread message to the person or a set-aside item is waiting on them too and is not listed
   * here, so a note that read only `actions` said "Nothing is waiting on you" while GET /api/waiting
   * held items (problems fnH7QaRvvkd9 and MNyo3ZasS50W). These are `readWaiting()`'s own counts,
   * taken as they are, so the two doors cannot count the person's list two ways.
   */
  waiting: WaitingReading['counts']
  /** What this list is and what it leaves out, with the three counts of everything waiting on the person. */
  note: string
}

export const NEEDS_YOU_NOTE =
  'What only the human can do: GET /api/needs-you. It lists the acts Mole Office refuses to an agent except the ' +
  "secretary carrying the person's authorization — today that is settling a fork, POST " +
  '/api/records/<proposal>/promote — with enough of each to act on it. LIKE ' +
  'PLANNING, IT TAKES NO WORKSPACE, and for the same reason: what is waiting on a person is a fact about the ' +
  'person, and a project-scoped queue showed an owner an empty list while the fork they were hunting sat in ' +
  'another project. It is not a way to read another project — it answers by kind and by resolution, and ' +
  'offers no filter, no search and no listing over a project. It also does NOT rank anything: a proposal does ' +
  'not enter the attention list, which is a separate open question (DECISIONS-PENDING §18). `blocking` counts ' +
  'the work waiting on each fork through its own `blocks` links, which is what says whether it matters today. ' +
  'TWO FACTS ARE DRAWN ABOUT A RECOMMENDATION AND NEITHER IS THE OTHER: `recommendationWritten` says somebody ' +
  'wrote one, and `namesAnOption` says Mole Office can tell which option it points at. Only the second can offer a ' +
  'one-press settle; the first is what tells you somebody thought about your fork. Measured 27 August 2026: 26 ' +
  'of 27 forks carry a written recommendation and 2 name an option, so one field carrying both made 25 of 27 ' +
  'read as though nobody had a view. ' +
  '`settled` is the other half: the forks that have been settled, each with the decision that answers it, so that ' +
  'settling one does not make it disappear. It is the same reading that takes a fork off `actions` — one ' +
  'definition of "settled", never two — and it stores nothing new: a settled fork is a decision linked back to ' +
  'its proposal, and the link is the whole act. `decisions` is every `decision` record in every project that no later decision replaced, newest ' +
  'first, with the words of what was taken, which of the fork\'s options that was (`optionIndex`, absent when the ' +
  'person wrote their own answer) and the question it answered where there is one — the history behind the queue, ' +
  'including the decisions nobody filed a proposal for, which no fork reading can see. It is a READ: settling a ' +
  "fork is refused to every agent except the secretary carrying the person's authorization, here as everywhere. " +
  'GET /api/forks answers out of the same reading and ' +
  "carries each fork's own fields, for a person settling one rather than an agent finding out it exists. " +
  '`leftTheQueue` is the third way a fork leaves and it is not an answer: something SUPERSEDES it, or it is a ' +
  '`duplicate_of` another fork, so nobody has to answer it and nobody decided it. Each entry names the record ' +
  'that replaced it, who made that link and when, so nothing leaves this queue silently. ' +
  '`waiting` is GET /api/waiting\'s three counts, `settle`, `asked` and `setAside`, which together count ' +
  'everything waiting on the person, while this door lists only the forks, card requests and admissions above.'

export async function needsYouRoutes(app: FastifyInstance): Promise<void> {
  app.get('/needs-you', route('project.needs-you', 'remote', NEEDS_YOU_NOTE), async (): Promise<NeedsYouReply> => {
    const forks = readForks()

    // THE SHORT FORM OF THE SAME FORKS. Every field here is taken from the reading rather than
    // worked out again — `blocking` is how many things the fork is holding up, which the reading
    // already names one by one.
    const actions: HumanAction[] = forks.open.map((fork) => ({
      act: 'promote-proposal',
      recordId: fork.recordId,
      title: fork.title,
      summary: fork.summary,
      workspaceId: fork.workspaceId,
      question: fork.question,
      options: fork.options,
      recommendationWritten: fork.recommendationWritten,
      namesAnOption: fork.namesAnOption,
      blocking: fork.blocks.length,
      createdAt: fork.createdAt,
      because: fork.because,
    }))

    // AND THE CARD ASKS, WHICH USED TO BE A 409. F15 point 2, criterion P65. A role request answered
    // by the person, or a session that registered itself while the one-version window was closed,
    // waits here until the person's press. One press on an admission also gives the card it asked for.
    for (const record of listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'role_request' })) {
      const answersTo = record.data['answersTo'] as { kind?: unknown } | undefined
      if (answersTo?.kind !== 'person') continue
      const answered = record.data['answer']
      if (typeof answered === 'string' && answered !== '') continue
      const asking = typeof record.data['asking'] === 'string' ? record.data['asking'] : ''
      const askerData = record.data['asker'] as { id?: unknown } | undefined
      const asker = typeof askerData?.id === 'string' ? askerData.id : ''
      // THE ASKER IS NAMED BY ITS OFFICE NAME in the sentence, and kept as stored in `asker`. The
      // stored asker is a registry id, and since the mint (criterion I1) a new agent's id is not a name
      // anybody chose. Where no single registry row answers the stored string, the sentence says the
      // unregistered-agent word, as `theNameAPersonReads` says it everywhere else.
      const askerNamed = theNameAPersonReads({ kind: 'agent', id: asker })
      // WHAT THE PERSON'S PRESS DOES, from the one reading every surface asks (src/server/lib/newkey.ts).
      const press = whatAPressOnThisAskDoes(record)
      // AN AGENT ASKING FOR A NEW KEY. Problem x8ktQfHS5yGr.
      if (press !== null && press.press === 'new-key') {
        actions.push({
          act: 'give-new-key',
          recordId: record.id,
          title: record.title,
          summary: null,
          workspaceId: record.workspaceId,
          question: null,
          options: 0,
          recommendationWritten: false,
          namesAnOption: false,
          blocking: 0,
          createdAt: record.createdAt,
          because: press.says,
          asker,
          asking,
        })
        continue
      }
      const waiting = aWaitingSelfRegistration(record)
      if (waiting !== null) {
        actions.push({
          act: 'admit-agent',
          recordId: record.id,
          title: `${theNameASelfRegistrationIsReadBy(waiting)} registered itself and is waiting for your press`,
          summary: waiting.doing,
          workspaceId: record.workspaceId,
          question: null,
          options: 0,
          recommendationWritten: false,
          namesAnOption: false,
          blocking: 0,
          createdAt: record.createdAt,
          // The start folder the person's press would also record is in these words too (problem xHp5rKVKkXRP).
          because: press?.says ?? '',
          asker: waiting.handle,
          asking,
        })
        continue
      }
      actions.push({
        act: 'give-card',
        recordId: record.id,
        title: record.title,
        summary: null,
        workspaceId: record.workspaceId,
        question: null,
        options: 0,
        recommendationWritten: false,
        namesAnOption: false,
        blocking: 0,
        createdAt: record.createdAt,
        because: `"${askerNamed}" was started by you and asks for the ${asking} card. The card is your press.`,
        asker,
        asking,
      })
    }

    // EVERYTHING WAITING ON THE PERSON, COUNTED BY THE ONE READING THAT COUNTS IT. It spans every
    // project and does not depend on who asks, the same as this door.
    const waiting = readWaiting().counts
    const everything =
      `Everything waiting on the person is at GET /api/waiting: ${waiting.settle} to settle, ` +
      `${waiting.asked} asked of the person, ${waiting.setAside} set aside.`

    const note =
      actions.length === 0
        ? 'No fork is open for a person to settle, and no agent is waiting for a card or an admission. ' +
          `This door lists only those acts. ${everything}`
        : `${actions.length} thing${actions.length === 1 ? '' : 's'} only you can do. ` +
          (actions[0] !== undefined && actions[0].blocking > 0
            ? `${actions.filter((a) => a.blocking > 0).length} of them ${
                actions.filter((a) => a.blocking > 0).length === 1 ? 'is' : 'are'
              } holding work up.`
            : 'None of them is holding any work up, so none is urgent — they are waiting rather than late.') +
          ` ${everything}`

    return {
      actions,
      settled: forks.settled,
      decisions: forks.decisions,
      decisionsReplaced: forks.decisionsReplaced,
      leftTheQueue: forks.leftTheQueue,
      waiting,
      note,
    }
  })
}
