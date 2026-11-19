// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DECISION FILES: the record of what ran instead of a step, choosing a decision again,
 * promoting a proposal into a decision, and the work one settled fork creates. They were moved out
 * of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands every name here on with `export *`, and every caller still
 * imports these names from records.ts. This file reads `assertMayWrite` from ./may-write.ts and
 * `createLink` from ./links.ts, and imports nothing from records.ts.
 */
import { db, sqlite } from '../../db/client.ts'
import { links, records } from '../../db/schema.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { PanelError } from '../panel-error.ts'
// WHAT A DECISION REPLACES: the one reading, and the refusal of a decision that does not say what it replaces.
import { candidatesOnTheSameSubjects, REPLACES_FIELD, theSubjectsAForkIsLinkedTo, whatSupersedes, whatThisDecisionReplaces } from '../replaced-decisions.ts'
import { toRecord } from '../to-record.ts'
import { type Actor } from './actor.ts'
import { createRecordWithReport } from './creating.ts'
import { type ChooseAgainInput, type PromoteInput, type PromoteResult, promotionNote, PROPOSAL_KIND, proposalResolution, TASK_KIND, THE_WORK_A_DECISION_CREATES, theForkIsAlreadySettled, theProposalThisDecisionResolves, type TheWorkFiled, whatThisDecisionStandsOn } from './fork-settled.ts'
import { createLink } from './links.ts'
import { assertMayWrite } from './may-write.ts'
import { getRecord } from './reading.ts'
import { BLOCK_KIND, BLOCK_TITLE_SEPARATOR } from '@shared/blocks.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { theWorkADecisionCreates } from '@shared/decisionwork.ts'
import { type PanelRecord, RESOLVES_PROPOSAL } from '@shared/types.ts'
// THE READER'S WORDS FOR A STORED ONE, from the one place that decides them. `displayWord` is
// what turns `block` into "step"; `withArticle`
// is what stops this file writing "a obligation" again.
import { displayWord, withArticle } from '@shared/work.ts'
import { and, eq, or } from 'drizzle-orm'

/**
 * FILE WHAT RAN INSTEAD, THROUGH THE STEP IT IS ABOUT. One transaction, three refusals.
 *
 * The three refusals, each a sentence rather than a code:
 *
 *   1. The target is not a live `block`. A canonical method is a step's, and widening this needs a
 *      case where one lives somewhere else. There is none today.
 *   2. The block has no `data.method`. A method that ran instead of NOTHING is meaningless, and
 *      filing one against a block whose canonical method nobody wrote down would create a
 *      restriction against an absence. The refusal names the patch that writes the method.
 *   3. A bare `POST /api/records {"kind":"ran_instead"}` — refused in `createRecord` in records/creating.ts, with
 *      this route in the message.
 */
export function fileRanInstead(
  blockId: string,
  input: {
    ran: string
    because: string
    since: string
    allowed_uses: string[]
    disallowed_claims: string[]
    severity: string
    source?: string
  },
  actor: Actor,
): { record: PanelRecord; block: PanelRecord; linkId: string } {
  const block = db.select().from(records).where(eq(records.id, blockId)).get()
  if (block === undefined || block.deletedAt != null) {
    throw new PanelError(`No live record with id ${blockId}.`, 404)
  }
  if (block.kind !== BLOCK_KIND) {
    throw new PanelError(
      `"${block.title}" is ${withArticle(displayWord(block.kind))}, and a record of what ran instead is ` +
        `about a STEP: the canonical ` +
        `method it stands in for is \`data.method\` on a block. Point this at the pipeline step whose method ` +
        `could not run. If the thing that could not run is not a step, what you have is either a placeholder — ` +
        `a slot deliberately left unresolved — or an ordinary problem.`,
      409,
    )
  }
  const method = ((block.data ?? {}) as Record<string, unknown>)['method']
  if (typeof method !== 'string' || method.trim() === '') {
    throw new PanelError(
      `"${block.title}" has no canonical method written down, so there is nothing for something to have run ` +
        `INSTEAD of, and this record would restrict an absence. Write the method first: ` +
        `PATCH /api/records/${blockId} {"dataPatch":{"method":"<what this step is supposed to do>"}} — then file ` +
        `this again. Nothing was written.`,
      409,
    )
  }
  const title = `${block.title} ${BLOCK_TITLE_SEPARATOR} ran instead: ${input.ran.trim().slice(0, 60)}`
  return sqlite.transaction(() => {
    const made = createRecordWithReport({
      kind: 'ran_instead',
      title,
      summary: `Ran instead of "${method}" on ${block.title}.`,
      data: {
        ran: input.ran,
        because: input.because,
        since: input.since,
        allowed_uses: input.allowed_uses,
        disallowed_claims: input.disallowed_claims,
        severity: input.severity,
        ...(input.source === undefined ? {} : { source: input.source }),
      },
      workspaceId: block.workspaceId,
      actor,
      throughItsBlock: true,
    })
    const link = createLink({ fromId: made.record.id, toId: blockId, type: 'about', actor })
    return { record: made.record, block: toRecord(block), linkId: link.id }
  })()
}

// ================================================ A FORK AN AGENT FILED, SETTLED BY THE HUMAN
//
// ---------------------------------------------------------------------------------------
// WHAT PROMOTION IS, AND THE ONE THING IT DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------------------
//
// An agent may write a `proposal`: the fork, the options it would defend, and — where it has one —
// its recommendation. It may not write the `decision`, because a decision is a governance act and
// an agent asserting one would launder its own choices into the record where nobody could tell them
// from the owner's. That guard is the only access control in the product and it does not move.
//
// PROMOTION IS THE HUMAN DOING THE SETTLING, IN ONE REQUEST. It files the decision and links it
// `derived_from` the proposal, in one transaction, so a decision that exists with nothing joining it
// to the fork it answers cannot happen. The link is what the resolution IS — see `proposalResolution`
// in records/fork-settled.ts — so the act of settling and the record of having settled are one write and not two.
//
// THE PROPOSAL IS KEPT, AND NOTHING IS COPIED OUT OF IT. Two things follow from that and both are
// deliberate:
//
//   1. The proposal is not consumed, rewritten, re-kinded or deleted. It stays exactly as its author
//      filed it, and the decision points back at it. That is what makes the pair readable a year
//      later: the fork AS IT STOOD, with the options nobody took, beside the choice somebody made.
//      A promotion that folded the proposal into the decision would leave one record claiming to be
//      both, and the reasoning would then be the owner's in the reader's eyes whoever wrote it.
//   2. Not one word moves across on its own. `question`, `options`, `because` and `evidence` are
//      the AGENT'S words; copying them into a human-only record would put an agent's reasoning
//      under the human's name, which is the exact false provenance the human-only rule exists to
//      prevent, done by the server rather than by the agent. The decision says what the human sent
//      and nothing else. Where that leaves something worth carrying across — options the decision
//      does not list as `alternatives_rejected` — the reply SAYS SO and writes nothing.

export function chooseAgain(decisionId: string, input: ChooseAgainInput, actor: Actor): PromoteResult {
  const old = getRecord(decisionId)
  if (!old) throw noRecordHasThisId(decisionId)
  // THE SAME GUARD AS WRITING ONE BY HAND. Choosing again IS writing a decision, and a decision is
  // the person's act: `HUMAN_ONLY_KINDS` holds one word and this is it.
  assertMayWrite(DECISION_KIND, 'create', actor, decisionId)

  if (old.kind !== DECISION_KIND) {
    throw new PanelError(
      `Record ${decisionId} is a ${old.kind} ("${old.title}"), and only a ${DECISION_KIND} is chosen again. ` +
        `A fork that has never been settled is settled with POST /api/records/${decisionId}/promote.`,
      400,
    )
  }
  if (old.deletedAt !== null) {
    throw new PanelError(
      `The decision "${old.title}" was deleted on ${old.deletedAt}, so nothing was written. A decision that ` +
        'superseded a withdrawn one would point at reasoning that is off every page. Restore it first, or file ' +
        'the new decision on its own.',
      400,
    )
  }

  const already = whatSupersedes(decisionId)
  if (already !== null) {
    throw new PanelError(
      `"${old.title}" has already been superseded by "${already.title}" (${already.id}), so nothing was written. ` +
        'Choose again on that one: it is the decision that stands.',
      409,
      undefined,
      undefined,
      'That decision has already been changed. Open the one that stands and choose again there.',
    )
  }

  // THE FORK IT WAS MADE FROM, or null because it was written on its own. Both are ordinary: a
  // decision need not come from a proposal, and one that does keeps its fork.
  const fork = theProposalThisDecisionResolves(decisionId)

  // CHOOSING AGAIN REPLACES THE OLD DECISION BY DEFINITION, and says so in the field every decision carries.
  // Any other earlier decision the new one also replaces may be named beside it.
  const saidReplaces = input.data?.[REPLACES_FIELD]
  const replacesHere = [...new Set([old.id, ...(Array.isArray(saidReplaces) ? saidReplaces.filter((one): one is string => typeof one === 'string') : [])])]
  const withReplaces = { ...(input.data ?? {}), [REPLACES_FIELD]: replacesHere }
  return sqlite.transaction((): PromoteResult => {
    const created = createRecordWithReport({
      kind: DECISION_KIND,
      title: input.title,
      summary: input.summary ?? null,
      data: fork === null ? withReplaces : whatThisDecisionStandsOn(withReplaces, fork, actor),
      workspaceId: old.workspaceId,
      actor,
      mustSayWhatItReplaces: true,
      door: `POST /api/records/${decisionId}/choose-again`,
      links: [
        { type: 'supersedes', toId: old.id },
        ...(fork === null ? [] : [{ type: RESOLVES_PROPOSAL, toId: fork.id }]),
      ],
    })
    const link = created.links?.[0]
    if (link === undefined) throw new PanelError('The decision was filed but the link to the old one was not', 500)
    return {
      decision: created.record,
      proposal: fork ?? old,
      link,
      resolution: fork === null ? null : proposalResolution(fork),
      incomplete: created.incomplete,
    } as unknown as PromoteResult
  })()
}

export function promoteProposal(proposalId: string, input: PromoteInput, actor: Actor): PromoteResult {
  const proposal = getRecord(proposalId)
  if (!proposal) throw noRecordHasThisId(proposalId)

  // The same guard, in the same words, as writing the decision by hand. Promotion IS writing one.
  assertMayWrite(DECISION_KIND, 'promote', actor, proposalId)

  if (proposal.kind !== PROPOSAL_KIND) {
    throw new PanelError(
      `Record ${proposalId} is a ${proposal.kind} ("${proposal.title}"), and only a ${PROPOSAL_KIND} is ` +
        `promoted. Promotion settles a FORK — it files the ${DECISION_KIND} and links it back to the reasoning ` +
        `it was made from — and a ${proposal.kind} states no fork. A decision about this record is filed with ` +
        `POST /api/records {"kind":"${DECISION_KIND}",…} and linked as you mean it with POST /api/links.`,
    )
  }
  if (proposal.deletedAt !== null) {
    throw new PanelError(
      `The proposal "${proposal.title}" was deleted on ${proposal.deletedAt}, so nothing was promoted. A ` +
        `${DECISION_KIND} derived from a withdrawn fork would point at reasoning that is off every page, which ` +
        `is worse than a decision with no proposal at all. POST /api/records/${proposalId}/restore brings it ` +
        `back, or file the ${DECISION_KIND} on its own with POST /api/records if the fork no longer matters.`,
    )
  }

  const before = proposalResolution(proposal)
  if (before === null) throw new PanelError('unreachable: a proposal has a resolution', 500)
  if (before.resolved) {
    throw theForkIsAlreadySettled(proposal, before.by.filter((decision) => !decision.deleted), { by: 'promotion' })
  }

  // WHAT THE DECISION REPLACES, asked at this door too. The press may say it. When it does not,
  // the office looks for earlier decisions linked to the same records as the fork: finding none, it records that none
  // was found and says how; finding some, it refuses and names them, so nobody's memory decides which stands.
  const pressSaid = input.data?.[REPLACES_FIELD]
  const subjects = theSubjectsAForkIsLinkedTo(proposal.id)
  const answered: Record<string, unknown> =
    pressSaid !== undefined
      ? {}
      : candidatesOnTheSameSubjects(proposal.workspaceId, subjects).length === 0
          ? {
              [REPLACES_FIELD]: [],
              why_it_replaces_none:
                'Nobody named one, and no earlier decision in this project is linked to the same records as the fork it settles.',
            }
          : {}
  const promotedData = { ...(input.data ?? {}), ...answered }
  // A REFUSAL HERE NAMES THE CANDIDATES ON THE FORK'S OWN SUBJECTS, not only on the one link the create writes.
  whatThisDecisionReplaces({
    data: promotedData,
    workspaceId: proposal.workspaceId,
    subjectIds: subjects,
    mustSay: true,
    door: `POST /api/records/${proposalId}/promote`,
  })

  return sqlite.transaction((): PromoteResult => {
    // The ordinary create, with the ordinary guard, the ordinary validation and the ordinary change
    // row. Promotion adds no second way to write a decision — it is this call plus one link.
    const created = createRecordWithReport({
      kind: DECISION_KIND,
      title: input.title,
      summary: input.summary ?? null,
      data: whatThisDecisionStandsOn(promotedData, proposal, actor),
      workspaceId: proposal.workspaceId,
      actor,
      links: [{ type: RESOLVES_PROPOSAL, toId: proposal.id }],
      mustSayWhatItReplaces: true,
      door: `POST /api/records/${proposalId}/promote`,
    })
    const link = created.links?.[0]
    if (link === undefined) throw new PanelError('The decision was filed but the link to its proposal was not', 500)

    const after = proposalResolution(proposal)
    if (after === null || !after.resolved) {
      throw new PanelError('The decision and the link were written and the proposal still reads as open', 500)
    }

    const work = theWorkThisDecisionCreates(proposal, created.record, actor)

    const result: PromoteResult = {
      decision: created.record,
      incomplete: created.incomplete,
      proposal,
      resolution: after,
      link,
      work,
      note: promotionNote(proposal, created.record, work),
    }
    if (created.similar !== undefined) result.similar = created.similar
    if (created.sameTitle !== undefined) result.sameTitle = created.sameTitle
    return result
  })()
}

// -------------------------------------------------- the work a decision creates belongs to the project

/**
 * File the work one settled fork creates, in the promotion's own transaction.
 *
 * NOTHING HERE NAMES ANYBODY. Not the proposer, not the promoter, not the person: `whose_move` is
 * left unwritten because nobody has said whose move it is, and an unwritten field is the answer
 * *nobody said*, which is true. The one thing that makes this task somebody's is a claim, which
 * already exists and needed nothing new. `actor` is here only because every write is attributed to
 * whoever made it, which is the promoter — that is the change row, not an assignment.
 */
function theWorkThisDecisionCreates(proposal: PanelRecord, decision: PanelRecord, actor: Actor): TheWorkFiled {
  const words = theWorkADecisionCreates({ decisionTitle: decision.title, forkData: proposal.data })
  const filed = createRecordWithReport({
    kind: TASK_KIND,
    title: words.title,
    summary: words.summary,
    data: { state: 'todo' },
    workspaceId: decision.workspaceId,
    actor,
    links: [{ type: THE_WORK_A_DECISION_CREATES, toId: decision.id }],
  })
  const link = filed.links?.[0]
  if (link === undefined) {
    throw new PanelError('The work this decision creates was filed but the link to the decision was not', 500)
  }
  return { task: filed.record, link, fromTheFork: words.fromTheFork }
}