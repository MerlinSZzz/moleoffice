// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A FORK IS SETTLED, AND BY WHICH DECISION: the proposal kind, the links that settle or replace a fork,
 * the reading of what settled one, the shapes a promotion is asked with and answers with, what a decision stands
 * on, and the note a promotion writes. The writers that promote a proposal, choose again and file a decision's
 * work stay in records.ts. These were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, sql } from 'drizzle-orm'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { DECISION_AUTHORITIES, THE_OWNER } from '@shared/kinds.ts'
import { named } from '@shared/named.ts'
import { RESOLVES_PROPOSAL, type ActorType, type LinkType, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { keptStatement } from '../../db/kept-statement.ts'
import { links, records } from '../../db/schema.ts'
import { PanelError } from '../panel-error.ts'
import { readTheReplacements, whatSupersedes, type TheReplacements } from '../replaced-decisions.ts'
import type { Incompleteness } from '../validate.ts'
import type { Actor } from './actor.ts'
import { readCreatedByType } from './link-readers.ts'
import type { CreatedLink } from './link-requests.ts'
import type { SimilarTitle } from './near-duplicate-titles.ts'
import { theCallersCardIsTheSecretarys } from './own-words.ts'
import { getRecord } from './reading.ts'

/** The kind an agent files a fork as. */
export const PROPOSAL_KIND: RecordKind = 'proposal'

/**
 * THE TWO LINKS THAT TAKE A FORK OUT OF THE QUEUE WITHOUT ANSWERING IT, and which end the fork is on.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS LIST EXISTS RATHER THAN TWO QUERIES AND ONE `if`
 * ---------------------------------------------------------------------------------------
 *
 * `readForks` has three exits, not one. `derived_from` from a decision answers the fork;
 * `supersedes` from something that replaced it and `duplicate_of` to the fork that is the one to
 * answer both end with nobody having to answer this one. Two places have to know the same set: the
 * reader that lets a fork go — `leftTheQueueBecause` in lib/forks.ts — and the guard that refuses
 * the write, `assertMayReplaceAFork` in records/fork-settling.ts. Written out in both, a third exit added
 * to one would
 * leave the other silently open, which is this repository's recurring defect standing in front of
 * the owner's queue. So the set is declared once, here, and both read it.
 *
 * `forkEnd` says which end of the link the fork is on, and the two are opposite. `X supersedes THIS`
 * points AT the fork, so the fork is the `to`. `THIS duplicate_of Y` points AWAY from it, so the
 * fork is the `from`. Getting that backwards would guard the wrong record.
 *
 * `why` is the word the reader hands a person, and it is here rather than worked out from the type
 * in lib/forks.ts for the same reason the types are here: a third exit added to this list would
 * otherwise be labelled by whichever branch of a two-way test it happened to fall into.
 *
 * THE TYPES ARE TAKEN FROM `LinkType` rather than written as bare strings, so renaming one stops
 * this file compiling instead of leaving an exit unguarded.
 */
export const LINKS_THAT_REPLACE_A_FORK: readonly {
  type: LinkType
  forkEnd: 'from' | 'to'
  why: 'superseded' | 'duplicate'
}[] = [
  { type: 'supersedes', forkEnd: 'to', why: 'superseded' },
  { type: 'duplicate_of', forkEnd: 'from', why: 'duplicate' },
]

/** One decision that links back to a proposal, with who filed the link and when. */
export interface ResolvingDecision {
  id: string
  title: string
  /** True when that decision has since been deleted, which puts the fork back in the queue. */
  deleted: boolean
  linkId: string
  /**
   * Who made the link. A link carries its own author and an AGENT may file one, so this is the
   * difference between "the owner settled this" and "something pointed an existing decision at it".
   * The decision itself is human-written either way — that is the guard — but who joined the two is
   * a separate fact and is reported rather than assumed. See decision 21 in DECISIONS-PENDING.md.
   */
  linkedBy: string
  /**
   * Whether `linkedBy` is a person, an agent or the office, as the link row stores it. Null when the
   * link was written before `links.created_by_type` existed and so never recorded it.
   */
  linkedByType: ActorType | null
  linkedAt: string
  /**
   * The live decision that replaced this one, or null because none has. A fork settled and then
   * chosen again is settled by both; the one no later decision replaced is the one that stands.
   */
  replacedBy: { id: string; title: string } | null
}

/**
 * Whether a proposal has been settled, READ OFF THE LINKS AND STORED NOWHERE.
 *
 * There is no `resolved` field on a proposal and there must not be one: a stored flag beside a link
 * that says otherwise is two statements of one fact with nothing making them agree, and the stale
 * one would be the flag, because the link is what every other query already reads.
 *
 * A DELETED DECISION DOES NOT RESOLVE ANYTHING. It is still listed — the link is a fact about the
 * archive — but `resolved` goes back to false, because a fork whose answer has been withdrawn is a
 * fork again, and reading it as settled would hide it from the one person who has to look at it.
 *
 * Answers null for a record that is not a proposal, rather than a cheerful "unresolved" about a
 * module: the question does not apply, and an answer that reads as one would be inventing a state.
 */
export function proposalResolution(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title'>,
  /** Which decisions replaced which, read once by a caller that asks about many forks; read here when not given. */
  replacements?: TheReplacements,
): ProposalResolution | null {
  if (record.kind !== PROPOSAL_KIND) return null

  const rows = theSettlingLinksOfAFork().all({ fork: record.id })

  const by = rows
    .filter((row) => row.other.kind === DECISION_KIND)
    .map(
      (row): ResolvingDecision => ({
        id: row.other.id,
        title: row.other.title,
        deleted: row.other.deletedAt !== null,
        linkId: row.link.id,
        linkedBy: row.link.createdBy,
        linkedByType: readCreatedByType(row.link.createdByType),
        linkedAt: row.link.createdAt,
        replacedBy: whatSupersedes(row.other.id, (replacements ??= readTheReplacements())),
      }),
    )
    .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt))

  const live = by.filter((decision) => !decision.deleted)
  const resolved = live.length > 0

  const howItIsSettled =
    `It is settled by POST /api/records/${record.id}/promote, which only the human may send: that files the ` +
    `${DECISION_KIND} and makes the link in one write. A ${DECISION_KIND} that already exists is joined to it ` +
    `with POST /api/links {"fromId":"<the ${DECISION_KIND}>","toId":"${record.id}","type":"${RESOLVES_PROPOSAL}"}.`

  if (resolved) {
    const each = live
      .map((d) => `"${d.title}" (${d.id}), linked by ${d.linkedBy} on ${d.linkedAt}`)
      .join('; ')
    return {
      resolved,
      by,
      note:
        `Settled: ${live.length === 1 ? 'the decision' : `${live.length} decisions`} ${each}. Read as ` +
        `resolved because that link exists and for no other reason — nothing is stored on this proposal ` +
        `about it. The proposal is kept whole: it is the reasoning the decision was made from, including ` +
        `the options nobody took, and it is what a later reader needs to see what was considered.`,
    }
  }

  if (by.length > 0) {
    const each = by.map((d) => `"${d.title}" (${d.id})`).join('; ')
    return {
      resolved,
      by,
      note:
        `Open again: the only ${by.length === 1 ? 'decision that linked here' : 'decisions that linked here'} ` +
        `— ${each} — ${by.length === 1 ? 'has' : 'have'} been deleted, so nothing settles this fork now. The ` +
        `link is kept, because a withdrawn answer is part of the record. ${howItIsSettled}`,
    }
  }

  return {
    resolved,
    by,
    note:
      `Open: no ${DECISION_KIND} links back to this proposal, so nobody has settled it. ${howItIsSettled} ` +
      `Whether it is resolved is read off that link every time it is asked, and there is no field on this ` +
      `record that could disagree with it.`,
  }
}

/**
 * Every settling link to this fork with the record at its other end. Kept, because the waiting list asks it for each
 * fork twice.
 *
 * `+` KEEPS THE PLANNER OFF links_type_idx. The office keeps no statistics, so SQLite chose that index and read every
 * settling link in the office for each fork. One where-you-stand asks this read 600 times (wave 13y round 114).
 * Through links_to_idx it reads the fork's own links: the same rows, in the same order.
 */
const theSettlingLinksOfAFork = keptStatement(() =>
  db
    .select({ link: links, other: records })
    .from(links)
    .innerJoin(records, eq(links.fromId, records.id))
    .where(and(eq(links.toId, sql.placeholder('fork')), sql`+${links.type} = ${RESOLVES_PROPOSAL}`))
    .prepare(),
)

/** Whether a fork has been settled, and by what. Derived on every read; stored nowhere. */
export interface ProposalResolution {
  /** True when a decision that is not deleted links here with `derived_from`. */
  resolved: boolean
  /** Every decision that links here, deleted ones included, oldest link first. */
  by: ResolvingDecision[]
  /** The same answer in one sentence, including how to settle it when it is open. */
  note: string
}

/** What the human sends to settle a fork: the decision, in the human's own words. */
export interface PromoteInput {
  /** The decision's title. Required, like any record's: it is how everything else links to it. */
  title: string
  summary?: string | null
  /** The decision's own fields — `because`, `decided_on`, `revisit_when`, `alternatives_rejected`. */
  data?: Record<string, unknown>
}

/** What a promotion did: the decision it filed, the proposal it kept, and the link between them. */
export interface PromoteResult {
  decision: PanelRecord
  /** What the new decision is still missing, computed from the specs like every other write. */
  incomplete: Incompleteness[]
  /** The proposal, unchanged. Read it back to see that promotion did not touch it. */
  proposal: PanelRecord
  /** The proposal's resolution as it now reads — derived from the link this call made. */
  resolution: ProposalResolution
  link: CreatedLink
  /** Records whose titles are close to the decision's. Advisory; see nearDuplicateTitles. */
  similar?: SimilarTitle[]
  /** Live records already called exactly what the decision is called. Advisory; see CreateResult. */
  sameTitle?: { id: string; kind: RecordKind; title: string }[]
  /** The work this decision creates, filed as a task nobody owes. Criteria P32 to P35. */
  work: TheWorkFiled
  note: string
}

/** The task a settled fork files, and the link saying which decision it came from. */
export interface TheWorkFiled {
  task: PanelRecord
  link: CreatedLink
  /** True when the task's title is the fork's own `resultWillBeUsedTo`; false when nobody wrote one. */
  fromTheFork: boolean
}

/**
 * Settle a proposal: file the decision, and link it back to the fork it answers. ONE TRANSACTION.
 *
 * Refuses, in this order and for these reasons:
 *
 *   404  no record with that id.
 *   403  the caller is not the human. Asked FIRST, before anything about the proposal's state, for
 *        the reason the restore route learnt the hard way: an agent that is told "already settled"
 *        has been told its request was allowed, and it will believe that on the next one.
 *   400  the record is not a proposal, or has been deleted.
 *   409  it is already settled, naming the decision that settled it. A second promotion would file
 *        a second decision derived from one fork with nothing saying which of them stands.
 */
/**
 * WHAT A PROMOTED DECISION STANDS ON, FILLED IN BY THE ROUTE THAT WRITES IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * Promotion used to store only what the caller sent, which is `because` and `option_taken` and
 * nothing else. So a decision the owner had just made carried no `authority` and no `decided_by`,
 * and it was complete by the promote route's rule and incomplete by the record contract's. The
 * moment the owner corrected themselves, the PATCH was refused for the two fields the route had left blank,
 * and the only way on was for an agent to invent them. A decision must remain editable by the person who made it.
 *
 * ONE DEFINITION OF A COMPLETE DECISION, and it is `assertMayDecide`'s. This function writes what
 * that guard asks for rather than restating the rule: what promotion knows about a decision is
 * exactly what the guard wants said out loud.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHY EACH IS TRUE RATHER THAN CONVENIENT
 * ---------------------------------------------------------------------------------------
 *
 * `authority`: "the owner said so". A promotion is the act of settling a fork, and settling one is
 * the owner's. An agent reaches this route only by carrying their words; a person reaches it by pressing the
 * button. Either way the choice is theirs.
 *
 * `authority_reference`: the proposal's id for a person's own press and every other warranted
 * writer. That is the durable record this decision was made from, it is the record their warrant has
 * to name in `for`, and it is the one a reader can open. The person's words themselves are not in a record at
 * all — a warrant is stored on the decision's own first revision, where `actsOnTheirWords` reads it —
 * so the proposal is the reference that answers. A SECRETARY acting under the person's authorization cites
 * the authorization itself instead: the
 * warrant's own place field for the person's quoted words, and the grant's id for an elevation.
 *
 * `decided_by`: "the owner", which is `THE_OWNER`. NOT the warrant's `saidBy`, and that is
 * deliberate: `saidBy` is always the one person this installation knows, and `decided_by` is a role
 * word by the field's own rule — "IT IS A ROLE OR A HANDLE AND NEVER A PERSON'S NAME", because a
 * name in a vocabulary makes one installation's owner part of the schema. The two say the same
 * thing and only one of them is spellable here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It never overwrites a field the caller sent. An agent that promotes on `reversible engineering
 * judgement` — the owner's standing sentence that engineering forks are the agent's to settle — is saying
 * the choice was its own, so `decided_by` becomes that agent's handle and no `authority_reference`
 * is invented, because that authority asks for what makes the choice reversible and not for an id.
 */
export function whatThisDecisionStandsOn(
  sent: Record<string, unknown> | undefined,
  proposal: PanelRecord,
  actor: Actor,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(sent ?? {}) }

  const alreadySaid = data['authority']
  const stands =
    typeof alreadySaid === 'string' && (DECISION_AUTHORITIES as readonly string[]).includes(alreadySaid)
      ? alreadySaid
      : undefined
  if (stands === undefined) data['authority'] = 'the owner said so'
  const authority = stands ?? 'the owner said so'

  // WHO MADE THE CHOICE. The owner's word means they made it, whoever typed it in. Any of the other four is
  // the caller's own judgement, so it carries the caller's own handle — and a person's own press is
  // theirs, which is `THE_OWNER` again rather than a personal name.
  if (typeof data['decided_by'] !== 'string' || (data['decided_by'] as string).trim() === '') {
    data['decided_by'] =
      authority === 'the owner said so' || actor.type === 'human' ? THE_OWNER : actor.id
  }

  // WHERE THE OWNER SAID IT. Only for their word: the other four authorities are asked for other evidence,
  // and pointing them at the fork would be padding a field to get a record through a gate.
  //
  // A SECRETARY'S OWN ACT CITES THE AUTHORIZATION:
  // the warrant's own place field when he carried the person's quoted words, and the
  // grant's own id when he acted on an elevation. Every other writer, the person included, keeps
  // the proposal — the durable record the decision was made from, and the record a warrant has to
  // name in `for`.
  if (
    data['decided_by'] === THE_OWNER &&
    authority === 'the owner said so' &&
    (typeof data['authority_reference'] !== 'string' || (data['authority_reference'] as string).trim() === '')
  ) {
    data['authority_reference'] = whereTheSecretarysAuthorizationIs(actor, proposal)
  }

  return data
}

/**
 * WHERE A SECRETARY'S SETTLING ACT POINTS: the person's quoted words' own place, or the grant he acted on.
 *
 * IT NEVER RETURNS NOTHING. Every other writer — and the person themselves — falls back on the
 * proposal, which is the durable record the decision was made from and the record a warrant has to
 * name in `for`. Only the secretary's card is asked here, so a worker's warranted promotion keeps
 * exactly the reference it wrote before.
 */
function whereTheSecretarysAuthorizationIs(actor: Actor, proposal: PanelRecord): string {
  if (theCallersCardIsTheSecretarys(actor)) {
    if (actor.warrant !== undefined) return actor.warrant.where
    if (actor.elevation !== undefined) return actor.elevation.id
  }
  return proposal.id
}

/**
 * CHOOSE AGAIN ON A DECISION THE PERSON HAS ALREADY MADE — CRITERION M83.
 *
 * ---------------------------------------------------------------------------------------
 * WHY CHOOSING AGAIN IS NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * Pressing an option immediately settled it. The person could not edit the option or add a
 * comment during that press, and could not change the choice afterwards, even before implementation.
 *
 * MEASURED: the press became the decision under criterion M57 (commit
 * 149d0101). The reason box sits beside the options and is saved with the option pressed, so words
 * had to be typed BEFORE the press — and once the press landed, nothing let the person change the option or
 * add words. `promoteProposal` in records/what-a-decision-files.ts refuses a second promotion with a 409, and its own sentence
 * tells a person to file the new decision by hand and link it `supersedes`. This is that sentence
 * made a press.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHAT IT LEAVES ALONE
 * ---------------------------------------------------------------------------------------
 *
 * A NEW DECISION, not an edit of the old one. A decision that could be rewritten in place would take
 * the record of what the person decided last week and leave nothing saying it had ever said otherwise.
 *
 * THE NEW ONE SUPERSEDES THE OLD AND RESOLVES THE SAME FORK. Both links, because they answer two
 * questions: which decision stands now, and what fork this was made from. `proposalResolution` reads
 * a LIST of resolving decisions, so the fork stays settled and reads as settled by two, one of which
 * is superseded — which is exactly what the 409's sentence said was missing.
 *
 * THE OLD ONE IS NOT TOUCHED. It stays as it was written, and the reverse of the link is what marks
 * it: `superseded by`.
 *
 * SUPERSEDING THE SUPERSEDED IS REFUSED, and the refusal names the one that stands. A chain where
 * two decisions each supersede the same old one is two answers with nothing saying which is the person's.
 */
export interface ChooseAgainInput {
  /** The decision's title. Derived by the page from the option, like a promotion's. */
  title: string
  summary?: string | null
  /** The new decision's own fields. */
  data?: Record<string, unknown>
}

/** The proposal this decision resolves, or null because it was written on its own. */
export function theProposalThisDecisionResolves(decisionId: string): PanelRecord | null {
  const row = db
    .select({ other: records })
    .from(links)
    .innerJoin(records, eq(links.toId, records.id))
    .where(and(eq(links.fromId, decisionId), eq(links.type, RESOLVES_PROPOSAL)))
    .all()
    .find((one) => one.other.deletedAt === null && one.other.kind === PROPOSAL_KIND)
  return row === undefined ? null : (getRecord(row.other.id) ?? null)
}

/**
 * THE REFUSAL OF A SECOND ANSWER TO A SETTLED FORK, in one set of words for every door that could give one.
 *
 * The promote door refused a fork that was already settled, and POST /api/links did not. In a browser measurement on
 * 7 November 2026, a second decision for another option was linked to a fork that another decision settled, and the
 * fork read as settled by both, with nothing saying which one stood. Both doors now refuse with this, and so does the
 * restore door. `promotion` is a press that would file a new decision; `link` is a link that would make an existing
 * decision a second answer; `restore` would bring a deleted decision back as a second answer.
 *
 * `settled` is what the fork already stands on: for the promote door every live decision linked to it, and for the
 * links door and the restore door the live ones that are not the decision's own answer (`theOtherAnswersToThisFork`
 * says which). A decision that was replaced is named with the one that replaced it, and the `supersedes` link the
 * refusal offers points at the one that stands, because that is the one a new answer has to replace. Where nothing was
 * replaced, the promote door's words are the ones it gave before this function, to the character.
 */
export function theForkIsAlreadySettled(
  fork: { title: string },
  settled: readonly ResolvingDecision[],
  act: { by: 'promotion' } | { by: 'link' | 'restore'; decision: { id: string; title: string } },
): PanelError {
  const stands = settled[0]?.replacedBy?.id ?? settled[0]?.id ?? ''
  const named = settled
    .map((d) => `"${d.title}" (${d.id})${d.replacedBy === null ? '' : `, which "${d.replacedBy.title}" (${d.replacedBy.id}) replaced`}`)
    .join('; ')
  const what =
    act.by === 'promotion'
      ? `a second promotion would file another ${DECISION_KIND} derived from the same fork with nothing saying which of ` +
        `them stands. If the choice has changed, file the new ${DECISION_KIND} with POST /api/records and say ` +
        `what it does to the old one: POST /api/links {"fromId":"<the new one>","toId":"${stands}",` +
        `"type":"supersedes"}, and link it to this fork too if it was made from it.`
      : act.by === 'link'
        ? `this link would make "${act.decision.title}" another ${DECISION_KIND} derived from the same fork with nothing ` +
          `saying which of them stands. If the choice has changed, say what "${act.decision.title}" does to the old one ` +
          `first: POST /api/links {"fromId":"${act.decision.id}","toId":"${stands}","type":"supersedes"}, then make ` +
          `this link again.`
        : `bringing "${act.decision.title}" back would make it another ${DECISION_KIND} derived from the same fork with ` +
          `nothing saying which of them stands. To bring it back as the answer, say first that it replaces the one ` +
          `that stands: POST /api/links {"fromId":"${act.decision.id}","toId":"${stands}","type":"supersedes"}, then ` +
          `bring it back again.`
  return new PanelError(
    `The proposal "${fork.title}" is already settled, by ${named}, so nothing was written. A proposal is the ` +
      `reasoning ONE decision was made from; ${what}`,
    409,
    undefined,
    undefined,
    // THE SAME REFUSAL IN ONE SHORT SENTENCE, for the box on the screen. Criterion M43, and it is
    // needed here from 6 September 2026 because an option on a settled proposal is a button now:
    // pressing a second one is how a person is told the first one landed, and five sentences are
    // too many to read in that box. The long one is still one press away.
    'This is already settled, so nothing was written.',
  )
}

/**
 * THE DECISIONS A SETTLING LINK FROM `decisionId` WOULD STAND BESIDE: each live decision linked to the fork as settling
 * it, unless the decision that stands in its place is `decisionId` itself. A decision that `decisionId` replaced,
 * directly or down a line of replacements, no longer answers the fork, and that is how choosing again settles the same
 * fork. `whatSupersedes` is the one reading of that line, through `replacedBy`. The restore door asks it with the
 * decision that stands in place of the one brought back.
 */
export function theOtherAnswersToThisFork(fork: { id: string; title: string }, decisionId: string): ResolvingDecision[] {
  const resolution = proposalResolution({ id: fork.id, kind: PROPOSAL_KIND, title: fork.title })
  if (resolution === null) throw new PanelError('unreachable: a proposal has a resolution', 500)
  return resolution.by.filter((one) => !one.deleted && (one.replacedBy?.id ?? one.id) !== decisionId)
}

/**
 * What promotion did, and — the part a caller cannot see — what it deliberately did not do.
 *
 * The second half is the point. A human who has just settled a fork in one request is entitled to
 * assume the reasoning came with it; it did not, and the sentence says so and says where the words
 * still are. It also names what is left on the table without moving it: options the proposal
 * defended that the decision does not record as rejected. That is a report about two records, not a
 * write, and it is the last moment anybody will be looking at both.
 */
export function promotionNote(proposal: PanelRecord, decision: PanelRecord, work: TheWorkFiled): string {
  const options = proposal.data['options']
  const rejected = decision.data['alternatives_rejected']
  const carry =
    Array.isArray(options) && options.length > 0 && !Array.isArray(rejected)
      ? ` The proposal defends ${options.length} option${options.length === 1 ? '' : 's'} and this decision ` +
        `records no \`alternatives_rejected\`; they are on the proposal if you want them here too — ` +
        `PATCH /api/records/${decision.id} {"dataPatch":{"alternatives_rejected":[…]}}.`
      : ''
  const owed =
    ` The work it creates is filed as the ${TASK_KIND} ${work.task.id}, linked \`${THE_WORK_A_DECISION_CREATES}\` ` +
    `this decision. Nobody owes it: ${
      work.fromTheFork
        ? "its words are the fork's own `resultWillBeUsedTo`"
        : 'the fork wrote no `resultWillBeUsedTo`, so it says nobody has written down what this requires'
    }, and whoever takes the work claims it — POST /api/claims naming ${work.task.id}.`
  return (
    `"${decision.title}" is filed as the ${DECISION_KIND}, and it is linked \`${RESOLVES_PROPOSAL}\` the ` +
    `proposal "${proposal.title}" (${proposal.id}) — which is what marks that proposal resolved. There is no ` +
    `stored flag: ask GET /api/records/${proposal.id} and it reads the link. THE PROPOSAL WAS NOT TOUCHED and ` +
    `nothing was copied out of it: its question, options, reasoning and evidence stay where their author wrote ` +
    `them, and this decision says only what you sent. That is what keeps the two readable side by side — the ` +
    `fork as it stood, and the choice you made.${owed}${carry}`
  )
}

/**
 * THE KIND THE WORK A DECISION CREATES IS FILED AS, and the link that says where it came from.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TASK AND NOT AN OBLIGATION
 * ---------------------------------------------------------------------------------------
 *
 * The work created by a decision belongs to the project, whoever is given that part owns it,
 * and the agent that raised the fork owes nothing for having raised it. The `obligation` kind says the
 * rest itself, on its own `owedTo` field: *an obligation with nobody at the other end is a task*. So
 * this files a `task`, which has no `owedTo` and no `due` at all — there is no field on it that could
 * name somebody, which is the enforcement rather than a habit. Criteria P32 to P35.
 *
 * `derived_from` from the task to the decision is the same link the decision uses to point at its
 * fork, in the same direction: the task really was made FROM this decision. Read on the decision's
 * own page it is `source of`. It is taken from `LINK_TYPES` so renaming the type stops this file
 * compiling rather than leaving the work silently unfindable.
 */
export const TASK_KIND: RecordKind = 'task'

/** From the task, to the decision it came out of. */
// derived_from in its general sense: a task made from a decision, not a decision settling a proposal.
export const THE_WORK_A_DECISION_CREATES: LinkType = 'derived_from'
