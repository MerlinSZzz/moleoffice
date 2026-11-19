// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING GUARDS: the planned states a record may take, the link kinds a write may join, the
 * guard on removing a fork, whose move a question is, and the guard on options that are the
 * person's move. They were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { BLOCK_KIND } from '@shared/blocks.ts'
import { THE_OWNER, type MOVE_ACTORS } from '@shared/kinds.ts'
import { named } from '@shared/named.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { progressOf, withArticle } from '@shared/work.ts'
import { INTENDED_KINDS } from '@shared/world.ts'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { records } from '../../db/schema.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { PanelError } from '../panel-error.ts'
import type { Actor } from './actor.ts'
import { PROPOSAL_KIND, proposalResolution } from './fork-settled.ts'
import { forkIsSettled, forkIsTheOwnersToSettle, theLinkThatTookThisForkOffTheQueue, whoSettlesThisFork } from './fork-settling.ts'
import { actsForThePerson, theCallersCardIsTheSecretarys } from './own-words.ts'
import { ARRIVAL_IS_NOT_A_CLAIM, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, arrivalDetail, isSomebodyMoleOfficeCannotPlace, strangerDetail } from './served-doors.ts'

/**
 * One act on an intended future that is the person's own. Eleven: ten take something out of a
 * planned future, and the eleventh rewrites the sentence of a goal the person filed or confirmed.
 */
export type FutureAct =
  | 'delete'
  | 'set-aside'
  | 'un-set-aside'
  | 'replace'
  | 'unlink'
  | 'shorten'
  | 'unwire'
  | 'reword'
  | 're-point'
  | 'because'
  | 'goal-what'

/**
 * WHAT EACH ACT WOULD DO, in the words a refusal prints. One table, so a new act cannot arrive
 * without a sentence and a refusal cannot say something the table does not.
 */
export const WHAT_THE_ACT_DOES: Readonly<Record<FutureAct, string>> = {
  delete: 'take an intended future out of the project',
  'set-aside': 'park a direction the person set',
  'un-set-aside': 'un-park a future they put down',
  replace: 'retire one plan by replacing it with another',
  unlink: 'erase a plan came true, this answered it instead, or the plan’s own subject',
  shorten: 'remove part of the future without deleting anything',
  unwire: 'delete or rewire the shape of the plan while every state stays alive',
  reword: 'rewrite an old plan to match what was actually built',
  're-point': 'move the person’s plan onto a different subject',
  // THE TENTH ACT. `data.because` on a trajectory or a planned state, and `data.paused.why`, are
  // AUTHORED TEXT — the person's own words about why this future and not another, and why they put
  // it down. No other act names them, so an agent could overwrite the owner's reasons with one
  // change row and no refusal. Same shape as `unwire`, same enforcement point.
  because: 'overwrite the person’s own words about why',
  // THE ELEVENTH ACT. The rule above covers the sentence of a
  // goal the person confirmed. A goal has no `because`, so without this act any agent could rewrite it.
  'goal-what': 'rewrite the sentence of a goal the person filed or confirmed',
}

/** The two kinds that are intentions, as this guard sees them. One statement, in shared/world.ts. */
export function isPlanned(kind: string): boolean {
  return (INTENDED_KINDS as readonly string[]).includes(kind)
}

/** The `shelved` fact on a direction's own data, or null when the record carries none. */
export function shelvedIn(data: unknown): unknown {
  if (!isJsonObject(data)) return null
  const value = data['shelved']
  return value === undefined ? null : value
}

/**
 * Whether two `shelved` facts are the same, so a write that does not touch the shelf is not refused.
 *
 * A SHELF IS A SMALL OBJECT and comparing its written form is enough: the order of three keys does
 * not change what was shelved, and a caller that sends the same keys in another order is still not
 * asking to change anything. What would be wrong is treating an absent shelf and a present one as
 * the same, which this does not do.
 */
export function sameShelf(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * THE SENTENCE THAT NAMES THE OTHER WAY A SECRETARY MAY SHELVE: the person's own quoted words. Empty for
 * everybody else, so a worker is never sent looking for a warrant it could not spend on this act.
 */
export function theWordsThatWouldShelveThis(actor: Actor): string {
  if (!theCallersCardIsTheSecretarys(actor)) return ''
  return (
    'You may also do it by carrying the person\'s own words as a warrant on this request, naming this direction in `for` — ' +
    'their sentence, copied, with where and when they said it.'

  )
}

export function planIdsIn(data: unknown): string[] {
  const raw = (data as { plannedStateIds?: unknown } | null)?.plannedStateIds
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

/**
 * THE KIND RULE ON THE THREE INTENDED LINK TYPES, AND ON `supersedes` WHEN IT REACHES THEM.
 *
 * Without this, `POST /api/links {"fromId":"pB","toId":"pC","type":"realises"}` is a 201 — one
 * planned state realising another — and the plan page prints "realised by ..." with an intention
 * named as the thing that made another intention real.
 *
 * THE FOURTH CLAUSE NAMES `planned_state` IN ITS TRIGGER, and an earlier draft did not. It read
 * *when either end is a trajectory, both ends must be trajectories*, and the case it was aimed at
 * is `blkX supersedes pC` — a block and a planned state. Neither end is a trajectory, so the clause
 * never fired, and the link was a 201 drawn in the `builds` family as *blkX leads to pC*, invisible
 * to any read that walks `realises` and `instead_of`.
 *
 * IT IS A NARROW RULE FOR A FEW TYPES AND NOT A PERMISSION LAYER.
 *
 * `implements` IS ONE OF THE LINKS WITH CHECKED END KINDS. LINK_TYPES says what it joins:
 * "the module, to the pipeline block it carries out". The block reader takes the from end as a
 * module, and the composition reader takes every `implements` target of a module as a member of it.
 * A new one between any other two kinds is refused here, and the refusal names `about`,
 * `derived_from` and `relates_to` instead. Agents had written it for "this work carries out that
 * decision or idea": the live office held three such links on 30 September 2026 (a task to an idea, a report
 * to a note, a session to a decision) beside 34 from a module to a block. Those stored rows are not
 * changed; `carriesBlock` in shared/blocks.ts reports one that reaches a block rather than counting it.
 */
export function checkLinkKinds(
  from: { id: string; kind: string; title: string },
  to: { id: string; kind: string; title: string },
  type: string,
): void {
  const refuse = (why: string): never => {
    throw new PanelError(why)
  }
  const PLANS_FOR_SUBJECTS = ['pipeline', 'module', 'block']
  // WHAT MAY SERVE A GOAL. Criterion P1 names four records: a trajectory, an obligation, a task and
  // a cluster — and a cluster is a `module` record (design/CURRENT-CAMPAIGN.md). A PLAN is not a
  // record: plans live in `plans` and `plan_lines`, and a link's ends are records, so a plan document
  // cannot be an end of a `serves` link today.
  const SERVES_SUBJECT_KINDS = ['trajectory', 'obligation', 'task', 'module']

  if (type === 'implements') {
    if (from.kind !== 'module' || to.kind !== BLOCK_KIND) {
      refuse(
        `An \`implements\` link runs from a module to the step of a pipeline it carries out, and this one ` +
          `runs from ${withArticle(kindWord(from.kind).text)}, "${from.title}", to ` +
          `${withArticle(kindWord(to.kind).text)}, "${to.title}". No link type says "carries out" between other ` +
          `kinds. If this work is done for that record, the link type is \`about\`; if it came out of it, ` +
          // derived_from in its general sense: what a record came out of, here between any two kinds.
          `\`derived_from\`; if you do not want to say how they are joined, \`relates_to\`. Nothing was written.`,
      )
    }
    return
  }

  if (type === 'serves') {
    const mayServe = 'a trajectory, an obligation, a task or a cluster (a `module` record)'
    if (to.kind !== 'goal') {
      refuse(
        `A \`serves\` link runs from the work to the goal it works toward, and "${to.title}" is a ` +
          `${kindWord(to.kind).text}. A goal is what may be served, and what may serve a goal is ${mayServe}. ` +
          'Nothing was written.',
      )
    }
    if (!SERVES_SUBJECT_KINDS.includes(from.kind)) {
      refuse(
        `A goal is served by ${mayServe}, and "${from.title}" is a ${kindWord(from.kind).text}. Nothing was ` +
          'written.',
      )
    }
    return
  }

  // TWO DECISIONS THAT BOTH STAND, and nothing else. The nightly governs check reads this link
  // between decisions only, so on any other pair it would say a thing nothing reads.
  if (type === 'coexists_with') {
    if (from.kind !== 'decision' || to.kind !== 'decision') {
      refuse(
        `A \`coexists_with\` link says two decisions both stand, and this one runs from ` +
          `${withArticle(kindWord(from.kind).text)}, "${from.title}", to ${withArticle(kindWord(to.kind).text)}, ` +
          `"${to.title}". It joins two decisions and nothing else. If you do not want to say how they are joined, ` +
          'the link type is `relates_to`. Nothing was written.',
      )
    }
    return
  }

  // WHAT MOVES FROM ONE STEP TO ANOTHER, and nothing else. The pipeline page and the big map read it between two
  // blocks only, so on any other pair it would say a thing nothing draws.
  if (type === 'feeds') {
    if (from.kind !== BLOCK_KIND || to.kind !== BLOCK_KIND) {
      refuse(
        `A \`feeds\` link says what moves from one step of a pipeline to another, and this one runs from ` +
          `${withArticle(kindWord(from.kind).text)}, "${from.title}", to ${withArticle(kindWord(to.kind).text)}, ` +
          `"${to.title}". It joins two blocks and nothing else. If one waits for the other, the link type is ` +
          '`blocks`; if you do not want to say how they are joined, `relates_to`. Nothing was written.',
      )
    }
    return
  }

  if (type === 'plans_for') {
    if (from.kind !== 'trajectory') {
      refuse(
        `A \`plans_for\` link runs from a planned future to the thing it is a future for, and "${from.title}" is ` +
          `a ${kindWord(from.kind).text}. Nothing was written.`,
      )
    }
    if (!PLANS_FOR_SUBJECTS.includes(to.kind)) {
      refuse(
        `A planned future plans for a pipeline, a module or a block, and "${to.title}" is a ` +
          `${kindWord(to.kind).text}. Nothing was written.`,
      )
    }
    return
  }

  if (type === 'realises' || type === 'instead_of') {
    if (to.kind !== 'planned_state') {
      refuse(
        `A \`${type}\` link points at a planned state — the intended thing that was answered — and "${to.title}" ` +
          `is a ${kindWord(to.kind).text}. Nothing was written.`,
      )
    }
    if (isPlanned(from.kind)) {
      refuse(
        `A \`${type}\` link runs from something that HAPPENED to the intended state it answered, and ` +
          `"${from.title}" is a ${kindWord(from.kind).text}, which is itself an intention. One intention cannot ` +
          `have realised another. Nothing was written.`,
      )
    }
    return
  }

  if (type === 'supersedes' && (isPlanned(from.kind) || isPlanned(to.kind))) {
    if (from.kind !== 'trajectory' || to.kind !== 'trajectory') {
      refuse(
        `\`supersedes\` between planned things means one whole planned future replacing another, and this runs ` +
          `from a ${kindWord(from.kind).text} to a ${kindWord(to.kind).text}. If what you mean is that ` +
          `"${from.title}" was done instead of the intended state "${to.title}", the link type is ` +
          `\`instead_of\`. Nothing was written.`,
      )
    }
  }
}

/**
 * THE THREE VALIDITY RULES ON A TRAJECTORY'S ORDER. A sibling of `checkBlockIds`, and like it, it
 * TAKES NO ACTOR: none of the three is a question about who asked, so it refuses everybody equally.
 *
 * DROPPING A LIVE PLANNED STATE IS NOT ONE OF THEM AND MUST NOT BECOME ONE. That is a governance
 * act — an agent may not, a person may — so it is asked where the actor is known, in `patchRecord`
 * on the merged record. Pinning it here would either refuse the owner their own edit or enforce
 * nothing at all.
 */
export function checkPlannedStateIds(trajectoryId: string, ids: readonly string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new PanelError(
        `The planned state ${id} is listed twice in this planned future's order. A state is in a future once, in ` +
          `one place. Nothing was written.`,
      )
    }
    seen.add(id)
  }
  if (ids.length === 0) return

  // IN PIECES (src/server/db/in-pieces.ts): `plannedStateIds` comes from a request body, which can hold tens of thousands
  // of ids; the rows go into a map by id, so the order of the pieces does not matter.
  const found = readInPieces(seen, (piece) =>
    db
      .select({ id: records.id, kind: records.kind, title: records.title, deletedAt: records.deletedAt })
      .from(records)
      .where(inArray(records.id, piece))
      .all(),
  )
  const byId = new Map(found.map((row) => [row.id, row]))
  for (const id of ids) {
    const row = byId.get(id)
    if (row === undefined || row.deletedAt !== null) {
      throw new PanelError(
        `The planned future lists ${id} among its states and no live record answers to that id. A planned ` +
          `future's order names planned states that exist. Nothing was written.`,
        row === undefined ? 404 : 400,
      )
    }
    if (row.kind !== 'planned_state') {
      throw new PanelError(
        `"${row.title}" is a ${kindWord(row.kind).text}, and a planned future's order holds planned states. ` +
          `Anything else in \`plannedStateIds\` would be a thing that exists listed among things that do not. ` +
          `Nothing was written.`,
      )
    }
  }

  // AND A PLANNED STATE BELONGS TO EXACTLY ONE PLANNED FUTURE. Two futures listing one state means
  // "realised" on one page and nothing on the other, from one link.
  const others = db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(and(eq(records.kind, 'trajectory'), isNull(records.deletedAt)))
    .all()
  for (const other of others) {
    if (other.id === trajectoryId) continue
    const held = new Set(planIdsIn(other.data))
    for (const id of ids) {
      if (!held.has(id)) continue
      throw new PanelError(
        `The planned state ${id} is already part of the planned future "${other.title}", and a planned state ` +
          `belongs to exactly one. Nothing was written.`,
      )
    }
  }
}

export function assertMayRemoveAFork(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title'>,
  actor: Actor,
  /**
   * THE KIND THE FORK IS BECOMING, when this is a kind change rather than a delete. `undefined` is
   * a delete, which is what this guard was written for.
   *
   * IT CHANGES THE WORDS AND NOT THE RULE. A `PATCH {"kind":"note"}` on an unsettled fork takes it
   * out of `GET /api/needs-you` exactly as a delete does — measured over HTTP on 27 August 2026,
   * 200, the fork gone from the queue — so it is the same act and it is refused here rather than by
   * a second guard that could drift from this one. What it must NOT do is tell the caller nothing
   * was deleted when it did not ask to delete anything: a refusal that describes the wrong act
   * sends the reader to the wrong problem. So the sentences name what was actually asked for.
   */
  becoming?: RecordKind,
): void {
  if (record.kind !== PROPOSAL_KIND) return

  /**
   * WHOSE FORK IT IS, ASKED THE WAY THE QUEUE ASKS IT, and this line is the fix for a hole an
   * adversary walked through on 27 August 2026.
   *
   * IT USED TO READ `if (resolution.resolved) return` AND ASK NOTHING ELSE. `resolved` means one
   * live decision points here through `derived_from`. It does not ask whose fork it is or who made
   * that link, so every clause below was skipped for any fork with a settling link on it. Measured
   * over HTTP, three requests apart:
   *
   *     POST   /api/records/<record>/promote          human         201   queue 29 -> 28
   *     PATCH  /api/records/<record> {"kind":"note"}  agent         403
   *     DELETE /api/records/<record>                  agent         200
   *
   * That fork said `the owner` settles it and the owner had just settled it. An agent deleted the
   * pair, and afterwards `GET /api/forks` placed it nowhere — not open, not settled, not left the
   * queue. The kind change beside it was refused, so two doors onto one act answered differently:
   * this repository's named recurring defect, on the governance surface. The account is
   * `design/round-eleven/wave-b/attack.md`, section 1a.
   *
   * WHAT IS ALLOWED THROUGH, AND IT IS THE ONE CASE THIS GUARD WAS NEVER FOR: a fork the corpus
   * says is somebody else's, that has been answered. Deleting one takes nothing off the owner, because
   * it was never the owner's and it is not waiting on anybody. `forkIsSettled` is the queue's own reader,
   * so the guard and the queue cannot disagree about which forks those are.
   *
   * A FORK THAT IS THE OWNER'S IS REFUSED WHETHER OR NOT IT HAS BEEN SETTLED. The owner's settled fork is still their
   * record, the decision beside it is still the owner's, and deleting the pair is still a governance act.
   */
  const their = forkIsTheOwnersToSettle(record.id)
  const resolution = proposalResolution(record)
  const settled = resolution !== null && forkIsSettled(record.id, resolution)
  if (!their && settled) return

  // WHERE THE FORK ACTUALLY STANDS, for the sentences below and for nothing else.
  //
  // THIS GUARD USED TO SAY THE SAME THING ABOUT EVERY FORK IT REFUSED — "still open, still in
  // GET /api/needs-you, and still the person's to answer" — and on 27 August 2026 it said it about
  // a fork that had already been superseded and was marked "an agent". Both halves were false. A
  // refusal that misdescribes the world sends the reader to the wrong problem, and this is the
  // surface whose whole job is saying who is waiting. So the state is read rather than assumed:
  // `theLinkThatTookThisForkOffTheQueue` and `forkIsSettled` are the queue's own readers.
  const replaced = settled ? null : theLinkThatTookThisForkOffTheQueue(record.id)
  const stillWaiting = !settled && replaced === null
  const settles = whoSettlesThisFork(record.id)

  /** What was asked for, as the opening of every refusal below. */
  // "NOBODY IS WAITING ON IT" AND NOT "IT HAS BEEN ANSWERED", because the two are different and a
  // superseded fork is the second without being the first. Both leave the queue; only one of them
  // answered anything.
  const which = stillWaiting
    ? `an unsettled ${PROPOSAL_KIND}`
    : `a ${PROPOSAL_KIND} nobody is waiting on any more`
  const taking =
    becoming === undefined ? `Deleting ${which}` : `Changing ${which} into a ${kindWord(becoming).text}`
  /** The same act, for the developer half of a refusal. */
  const asked =
    becoming === undefined
      ? `delete ${PROPOSAL_KIND} ${record.id}`
      : `change ${PROPOSAL_KIND} ${record.id} into a ${becoming}`
  /** Why the act is refused, in one clause, and it differs for a fork nobody is waiting on. */
  const because = stillWaiting
    ? 'takes it out of the queue of things only a person may answer'
    : "takes away the person's record of a question that was theirs and of how it ended"

  /** Where the fork stands right now, read rather than assumed. */
  const where = settled
    ? `it is already settled and is out of GET /api/needs-you`
    : replaced !== null
      ? `it is already out of GET /api/needs-you — "${replaced.insteadTitle}" (${replaced.insteadId}) ` +
        `${replaced.why === 'superseded' ? 'replaced it' : 'is the question it repeats'}`
      : 'it is still open and still in GET /api/needs-you'
  /** Whose fork it is, in the same words the other three fork guards use. */
  const whose =
    settles === THE_OWNER
      ? `and it says "${THE_OWNER}" settles it`
      : settles === null
        ? "and nobody has classified it, so Mole Office treats it as the person's"
        : their
          ? `and it says "${settles}" settles it — but an agent wrote that onto a fork that was filed ` +
            `without it, so Mole Office still treats it as the person's`
          : `and it says "${settles}" settles it`
  /** What to do instead, and it depends on whether anybody is still waiting. */
  const instead = stillWaiting
    ? `If it should be withdrawn, say what changed since it was filed — ` +
      `PATCH /api/records/${record.id} {"dataPatch":{"because":"<what changed>"}} — and leave the question ` +
      `where they can see it. ${becoming === undefined ? 'Removing it' : 'Making it something else'} ` +
      `answers it for them.`
    : `A fork and the record that ended it are the pair a person goes back to read. ` +
      `${becoming === undefined ? 'Removing it' : 'Making it something else'} takes that away, and only ` +
      `the person may do it.`

  const tail = `Nothing was written and "${record.title}" is exactly as it was: ${where}, ${whose}. ${instead}`

  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this is one of them — `actKey` on this guard's entry in GOVERNANCE_GUARDS
  // is the act, and the declaration files that act under the power an elevation hands over. The
  // refusal below is unchanged for a request with no warrant and no elevation.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  if (actor.type !== 'human') {
    throw new PanelError(`${taking} ${because}, and this request came from ${actor.type} "${actor.id}". ${tail}`, 403)
  }
  if (actor.stated === false) {
    throw new PanelError(
      `${taking} ${because}, ` +
        `and this request sent no actor headers, so nothing said who is asking. Ordinary writes take that as ` +
        `the person typing by hand; emptying their queue may not. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS, asked with the actor clauses above and before the machine one,
  // because like them it holds from any machine. Without it, emptying the queue took a header and
  // any name at all.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `${taking} ${because}, ` +
        `and this request was made in the name "${actor.id}", which is not somebody Mole Office can place. ${tail} ` +
        `${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(asked, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM, asked last for the same reason as the other two guards: the actor
  // clauses above hold from any machine and this one does not.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `Taking a fork out of the queue is the person's own act, and it is done at the machine Mole Office runs on. ` +
        `This request came from another machine. ${tail} ${ARRIVAL_IS_NOT_A_CLAIM}`,
      403,
      arrivalDetail(asked),
    )
  }
}

/**
 * The field that says whose move it is, and the value that means the owner's.
 *
 * BOTH TAKEN FROM THE DECLARATION RATHER THAN TYPED AS BARE STRINGS. `whose_move` and its three
 * values are declared once, in src/shared/kinds.ts, and served to every caller at GET /api/kinds. A
 * literal here would be a second statement of the same vocabulary, free to survive a rename in
 * silence — and the thing it would silently stop guarding is the owner's queue. The type annotation
 * is what makes a typo a build failure.
 */
export const WHOSE_MOVE = 'whose_move'

export const THE_PERSONS_MOVE: (typeof MOVE_ACTORS)[number] = 'person'

/**
 * The day out of a stored stamp, for a refusal that says when somebody asked.
 *
 * Stamps are stored as local wall clock, `YYYY-MM-DD HH:MM:SS`, so the day is the part before the
 * space and no arithmetic is involved. Printing it as stored rather than turning it into words is
 * deliberate: a date somebody can look up beats a phrase, and re-deriving "20 August" here would put
 * a second calendar in the server.
 */
export function dayOf(stamp: string): string {
  return stamp.split(' ')[0] ?? stamp
}

/**
 * OPTIONS FOR THE PERSON MEAN THE MOVE IS THEIRS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * A problem carried two options for the person and said `whose_move: agent`, filed that way by
 * its builder although the choice was the person's. The person could not find it in the waiting list. Two things
 * hid it, and this is the second: the record
 * itself said the next move was an agent's.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES, RATHER THAN SETTING IT RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * The criterion allows either. Refusing is chosen because setting it right has a trap: an agent that
 * really does own the next step could never keep `agent` — every write would flip it back, and a
 * rule a writer cannot obey is a rule that teaches writers to stop reading refusals. Refusing makes
 * the writer say which of the two it means, and the sentence names both ways forward.
 *
 * WHAT COUNTS AS OPTIONS FOR THE PERSON: a non-empty `options` list on an OPEN record. `options` is
 * declared as ways out considered and not chosen, and an open record carrying them is an unmade
 * choice. Choosing between written options is the person's act everywhere in Mole Office — it is
 * what a `proposal` is for — so an open record holding a list of them and saying the move is an
 * agent's is saying two things that cannot both be true.
 *
 * A CLOSED RECORD IS NOT ASKING ANYTHING, so its options are history and this says nothing about it.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT MAY RECORD ITS CHOICE AMONG A PROBLEM'S OPTIONS INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * Agents may choose among the options a problem carries, with
 * its evidence, and says in its report which it took and why. The choice is an ATTEMPT that takes one of
 * the options, because a problem's seven sections are agreed and a choice is something an agent did. Its
 * `takes_option` is the option word for word, its `tried` repeats those words with why this one, and its
 * `result` is the evidence. A problem holding such an attempt with no `failed_because` is not an unmade
 * choice, and it may say the next move is an agent's. The page draws `tried` and `result` in the attempts
 * panel, which is why `tried` must carry the option's words: that is how the person sees the choice. An
 * attempt whose option is not one of the options, whose `tried` does not name it, or whose `result` is
 * blank is refused on every problem, whoever's move it is, so what is stored can be defended.
 */
export function assertOptionsForThemAreTheirMove(
  what: { id: string | null; kind: string; title: string },
  after: unknown,
  actor: Actor,
): void {
  if (!isJsonObject(after)) return
  const which = what.id === null ? `This ${what.kind}` : `The ${what.kind} "${what.title}"`
  const options = after['options']
  // THE ATTEMPTS THAT TAKE AN OPTION, each held whole. One that is not an object is the shape check's to refuse.
  const taking =
    what.kind === 'problem' && Array.isArray(after['attempts'])
      ? after['attempts'].filter((one): one is Record<string, unknown> => isJsonObject(one) && one['takes_option'] !== undefined)
      : []
  if (taking.length > 0) {
    const listed = Array.isArray(options) ? options.filter((one): one is string => typeof one === 'string') : []
    for (const attempt of taking) {
      const chosen = attempt['takes_option']
      const named = typeof attempt['id'] === 'string' ? `an attempt "${attempt['id']}"` : 'an attempt'
      if (typeof chosen !== 'string' || !listed.includes(chosen)) {
        throw new PanelError(
          `${which} has ${named} that takes ${JSON.stringify(chosen)}, and that is not one of its options. Copy the ` +
            'option word for word from `options`, or add it to `options` in the same write. Nothing was written.',
          409,
        )
      }
      if (typeof attempt['tried'] !== 'string' || !attempt['tried'].includes(chosen)) {
        throw new PanelError(
          `${which} has ${named} that takes the option ${JSON.stringify(chosen)}, and its \`tried\` does not name it. ` +
            'Write the option word for word in `tried`, with why you took it: `tried` is the line the problem\'s page ' +
            'draws, so it is how the person sees the choice. Nothing was written.',
          409,
        )
      }
      if (typeof attempt['result'] !== 'string' || attempt['result'].trim() === '') {
        throw new PanelError(
          `${which} has ${named} that takes the option ${JSON.stringify(chosen)} with no \`result\`. A choice is stored ` +
            'only with its evidence: what was run, measured or read, and what was seen. Nothing was written.',
          409,
        )
      }
    }
  }
  if (!Array.isArray(options) || options.length === 0) return
  if (after[WHOSE_MOVE] !== 'agent') return
  // A RECORD THAT HAS ENDED IS NOT ASKING ANYTHING. `progressOf` is the one reader of whether a
  // record is finished, and asking it here rather than listing states keeps one answer to that.
  if (hasFinished(what.kind, after)) return
  // A PROBLEM THAT RECORDS ITS CHOICE IS NOT AN UNMADE CHOICE, while the attempt that took it has not failed.
  // The checks above hold each such attempt whole.
  if (taking.some((attempt) => attempt['failed_because'] === undefined)) return
  throw new PanelError(
    `${which} carries ${String(options.length)} options and says the next move is an agent's. Those cannot both ` +
      'be true: choosing between written options is the person\'s act everywhere in Mole Office, and an open ' +
      'record holding a list of them is an unmade choice. Nothing was written.\n\n' +
      'WHAT WOULD SATISFY THIS. If the options are THE PERSON\'S to choose between, send `whose_move`: "person" — that is ' +
      'what puts it on their Decisions page. A problem once sat with two options for the person marked as an ' +
      'agent\'s move, and it appeared on no list they read. If they ' +

      'are roads YOU took and rejected, they belong in `attempts` (what was tried, what was seen, why it failed) ' +
      'or in `fix`. If the choice is a fork somebody has to settle, file a `proposal`: that is the kind with ' +
      'options and a settler on it.' +
      (what.kind === 'problem'
        ? ' If YOU have chosen one of the options and have the evidence for it, say so: add an attempt whose ' +
          '`takes_option` is that option word for word, whose `tried` names it with why you took it, and whose ' +
          '`result` is the evidence. The problem\'s page shows the attempt to the person, and your report says ' +
          'which you took and why.'
        : ''),
    409,
  )
}

/** Whether a record holding this data has finished. `progressOf` is the one reader of a state word. */
function hasFinished(_kind: string, data: Record<string, unknown>): boolean {
  return progressOf(data['state']) === 'finished'
}
