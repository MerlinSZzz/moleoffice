// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ANSWER DOOR: THE PERSON KEEPS AN ANSWER TO A QUESTION IN A REPORT, AND SENDS WHAT IS UNSENT. Two
 * decisions are on design CI_hZmfzVGJk.
 *
 * Two acts the person may press, or their grant may carry:
 *   - `keepAnAnswer` keeps the person's answer to one choice or fill-in box as a draft, so they can answer part of a
 *     report and come back later. An empty answer takes the draft away.
 *   - `sendAnswers` sends what a press covers and has not been sent: a box's questions, a button, or the whole report.
 *     Each choice sent is recorded at once as the person's decision, linked to the report, settling the proposal its
 *     `about` names or replacing the decision it names. Each agent that receives answers gets ONE message, through the
 *     message door, with the answers in its words and a lead back to the report, so its waiter wakes. The report's
 *     `answers` then says what was sent, by whom, when, to which agent, in which message and as which decision; its
 *     revisions keep every earlier state.
 *
 * THE PERSON ANSWERS, OR A SECRETARY THEIR GRANT CARRIES HERE DOES IT FOR THEM. Each act asks the person first,
 * then the one check and then its old refusal. The card keeps both doors, so an office that changed nothing behaves
 * as before. A draft names who kept it. A send names who sent it, under which grant, and who chose each answer.
 * A choice sent under the grant is still recorded as the person's decision, citing the grant
 * as its authority and retaining the report link. The chooser's words stay their own.
 *
 * EACH ACT CHECKS EVERYTHING BEFORE IT WRITES ANYTHING, and then makes all its writes in one transaction under
 * `asTheAnswerDoor`, the one writer of `answers` the record door lets through. A refusal leaves the report, the
 * decisions and the messages exactly as they were.
 *
 * WHICH QUESTIONS A PRESS COVERS, WHICH ANSWERS ARE UNSENT AND WHO RECEIVES THEM are read in src/shared/answers.ts, the
 * same reading the page draws its buttons from.
 */

import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { kindWord } from '@shared/words.ts'
import type { ChoiceBlock, PanelRecord, SummaryBlock } from '@shared/types.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { whoPressedItUnderTheGrant } from './the-persons-own-words.ts'
import {
  ANSWERS_FIELD,
  answersOf,
  isEmptyAnswer,
  namedReceiver,
  questionsIn,
  theScopeOf,
  theWordsOfAChoice,
  unsentAnswer,
  whoseOwnWords,
  type AQuestionHere,
  type AnAnswer,
  type AnswersOfABlock,
  type ReportAnswers,
  type ThePress,
} from '@shared/answers.ts'
import { asTheAnswerDoor } from './answer-door.ts'
import type { AgentIdentity } from './agent-references.ts'
import { whyThisAgentCannotReceiveAMessage } from './messages.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from './not-proved-the-person.ts'
import {
  RESOLVES_PROPOSAL,
  aRaiseCarriesIt,
  createRecord,
  createRecordWithReport,
  everyAgentAStoredStampCouldName,
  getRecord,
  patchRecord,
  nothingWrittenSentence,
  proposalResolution,
  recordInWorkspace,
  whoFiled,
  type Actor,
  type LinkRequest,
} from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theSubjectsAForkIsLinkedTo, whatSupersedes } from './replaced-decisions.ts'
import { thePagesARecordIsAbout, whatTheOfficeSendsItGoverns } from './what-a-record-names.ts'

/** The most characters the person's own words may hold, in a fill-in box or beside a choice. */
export const ANSWER_WORDS_MAX = 4000

// ---------------------------------------------------------------------------------------------------------------
// WHO MAY ANSWER
// ---------------------------------------------------------------------------------------------------------------

/**
 * REFUSE UNLESS THE PERSON IS PRESSING, OR THEIR GRANT CARRIES THE ACT. Asked first by both acts, before the report is
 * read.
 *
 * Both acts ask the grant after the person, where `aRaiseMayCarryIt` is true, so this office's list decides.
 * The card keeps both doors. A caller without a grant still hears this door's refusal.
 */
function refuseAnybodyButThePerson(actor: Actor, doing: string, aRaiseMayCarryIt: boolean): void {
  if (thePersonIsProved(actor)) return
  if (aRaiseMayCarryIt && aRaiseCarriesIt(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
      refused: `${doing} is the person's own act`,
      nothingWasDone: 'Nothing was written: no answer was kept or sent, no decision was recorded and no message went.',
      whoMay:
        'Only the person answers the questions in a report, in the browser paired as theirs. An agent cannot press for ' +
        'the person, except a secretary holding their grant keeping or sending answers, where this office\'s list of what ' +
        'the grant carries says the grant presses it. Sending the answers is the person\'s alone unless that list lets their grant carry it.',
    }),
    403,
    undefined,
    undefined,
    'Only the person answers these questions. Nothing was written.',
    { code: 'answerNotThePerson', values: {} },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// READING THE REPORT AND ITS QUESTIONS
// ---------------------------------------------------------------------------------------------------------------

/** The report, read in this project, or a refusal: no record, another kind, or deleted. */
function theReport(reportId: string, workspaceId: string): PanelRecord {
  const report = recordInWorkspace(reportId, workspaceId)
  if (report.kind !== 'report') {
    throw new PanelError(
      `Record ${reportId} is a ${kindWord(report.kind).text} ("${report.title}"), and only a report asks the person questions. Nothing was written.`,
      400,
    )
  }
  if (report.deletedAt !== null) {
    throw new PanelError(
      `The report "${report.title}" was deleted on ${report.deletedAt}, so its questions cannot be answered. Nothing was written.`,
      409,
    )
  }
  return report
}

function blocksOf(report: PanelRecord): SummaryBlock[] {
  const held = report.data['blocks']
  return Array.isArray(held) ? (held as SummaryBlock[]) : []
}

/**
 * IS THIS ANSWER ONE THIS QUESTION CAN TAKE. Asked when an answer is kept, and again when it is sent, because the
 * report's writer may have changed the question in between.
 */
function refuseAnAnswerThisQuestionCannotTake(block: AQuestionHere['block'], answer: AnAnswer): void {
  if (block.type === 'button') {
    throw new PanelError(
      `Block "${block.id}" is a button, and a button keeps no answer: its press is sent at once, on its own. Nothing was written.`,
      400,
    )
  }
  if (answer.pressed !== undefined) {
    throw new PanelError(`Block "${block.id}" is a ${block.type === 'choice' ? 'choice' : 'fill-in box'}, and only a button is pressed. Nothing was written.`, 400)
  }
  const words = answer.words ?? ''
  if (words.length > ANSWER_WORDS_MAX) {
    throw new PanelError(
      `The words for block "${block.id}" are ${String(words.length)} characters long, and at most ${String(ANSWER_WORDS_MAX)} ` +
        'are kept. Nothing was written.',
      400,
    )
  }
  const chosen = answer.chosen ?? []
  if (block.type === 'fillin') {
    if (chosen.length > 0) {
      throw new PanelError(`Block "${block.id}" is a fill-in box, which has no options to choose. Nothing was written.`, 400)
    }
    return
  }
  const own = new Set(block.options.map((option) => option.id))
  const strangers = chosen.filter((id) => !own.has(id))
  if (strangers.length > 0) {
    throw new PanelError(
      `The answer to "${block.question}" chooses ${strangers.map((id) => `"${id}"`).join(', ')}, which is not one of its ` +
        `options. Its options are ${block.options.map((option) => `"${option.id}" (${option.label})`).join(', ')}. Nothing was written.`,
      400,
      undefined,
      undefined,
      'That option is not one of this question\'s own. Nothing was written.',
      { code: 'answerNotAnOption', values: {} },
    )
  }
  if (new Set(chosen).size !== chosen.length) {
    throw new PanelError(`The answer to "${block.question}" chooses one option twice. Nothing was written.`, 400)
  }
  if (block.many !== true && chosen.length > 1) {
    throw new PanelError(
      `"${block.question}" takes one option, and the answer chooses ${String(chosen.length)}. Nothing was written.`,
      400,
    )
  }
}

/** The report's `answers` written back through the record door, as the answer door. Called inside a transaction. */
function writeTheAnswers(report: PanelRecord, answers: ReportAnswers, actor: Actor) {
  const next: Record<string, unknown> = { ...report.data }
  if (Object.keys(answers).length === 0) delete next[ANSWERS_FIELD]
  else next[ANSWERS_FIELD] = answers
  const written = patchRecord(report.id, { data: next }, actor)
  return { answers: answersOf(written.record.data), nothingWritten: written.nothingWritten }
}

// ---------------------------------------------------------------------------------------------------------------
// KEEPING AN ANSWER
// ---------------------------------------------------------------------------------------------------------------

/**
 * THE PERSON KEEPS AN ANSWER TO ONE CHOICE OR FILL-IN BOX, not sent yet, or a secretary their grant carries here keeps
 * it for them; both the draft and the report's revision name who kept it. An empty answer takes the kept one away; what
 * was last sent stays. Answers with the report's answers after the write.
 */
export function keepAnAnswer(reportId: string, blockId: string, answer: AnAnswer, workspaceId: string, actor: Actor): { answers: ReportAnswers; nothingWritten?: string } {
  refuseAnybodyButThePerson(actor, 'Answering a question in a report', true)
  const report = theReport(reportId, workspaceId)
  const question = questionsIn(blocksOf(report)).find((one) => one.block.id === blockId)
  if (question === undefined) {
    throw new PanelError(`The report "${report.title}" has no question with the id "${blockId}". Nothing was written.`, 404)
  }
  refuseAnAnswerThisQuestionCannotTake(question.block, answer)

  const answers = answersOf(report.data)
  const kept: AnswersOfABlock = { ...(answers[blockId] ?? {}) }
  if (isEmptyAnswer(answer)) delete kept.draft
  else {
    const tidy: AnAnswer = {}
    if ((answer.chosen ?? []).length > 0) tidy.chosen = [...answer.chosen!]
    if ((answer.words ?? '').trim() !== '') tidy.words = answer.words!
    kept.draft = { answer: tidy, at: nowStamp(), chosenBy: whoPressedItUnderTheGrant(actor)?.by ?? { kind: 'person', id: actor.id } }
  }
  const next: ReportAnswers = { ...answers }
  if (kept.draft === undefined && kept.sent === undefined) delete next[blockId]
  else next[blockId] = kept

  const result = sqlite.transaction(() => asTheAnswerDoor(() => writeTheAnswers(report, next, actor)))()
  return { answers: result.answers, ...(result.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: isEmptyAnswer(answer) ? 'answer-absent' : 'answer-unchanged' }) }) }
}

// ---------------------------------------------------------------------------------------------------------------
// SENDING WHAT IS UNSENT
// ---------------------------------------------------------------------------------------------------------------

/** What `sendAnswers` answers. */
export interface AnswersSent {
  /** One message for each agent that received answers, and the agent's registry id. */
  messages: { id: string; to: string }[]
  /** The decisions the choices sent were recorded as, in reading order. */
  decisions: string[]
  /** The report's answers after the send. */
  answers: ReportAnswers
}

/** One answer this press sends, with everything worked out before anything is written. */
interface OneToSend {
  chosenBy?: ParticipantRef
  question: AQuestionHere
  answer: AnAnswer
  receiver: AgentIdentity
  /** For a choice: the decisions its new decision replaces, and the proposal it settles. */
  replaces: string[]
  settles: PanelRecord | null
}

/** The agent's name for a sentence: its name and handle. */
function nameOf(agent: AgentIdentity): string {
  return `${agent.name} (${agent.handle})`
}

/**
 * WHO RECEIVES ONE QUESTION'S ANSWER: the agent its box or button names, else the report's writer.
 *
 * BOTH ARE STORED REFERENCES by the time the person presses. The box's or button's `to` was written by the agent earlier
 * (and resolved then, at the record door), and the writer is the stamp on the report's create row. So both are read with
 * the stored-stamp reader: an exact id first, then the one agent bearing the string as a handle, and no agent where more
 * than one answers. Never the arriving resolver.
 */
function theReceiverOf(question: AQuestionHere, report: PanelRecord): AgentIdentity {
  const named = namedReceiver(question)
  const where = question.block.type === 'button' ? `the button "${question.block.label}"` : question.box !== null ? `the box "${question.box.title ?? question.box.id}"` : null
  const nobody = (why: string): PanelError =>
    new PanelError(
      `${why} so the answer to block "${question.block.id}" has nobody to go to. Nothing was sent.`,
      409,
      undefined,
      undefined,
      'These answers have nobody to go to. Nothing was sent.',
      { code: 'answersNobodyToSendTo', values: {} },
    )
  let stamp: string
  if (named !== null) stamp = named
  else {
    const filed = whoFiled(report.workspaceId, report.id)
    if (filed === null) throw nobody(`Nothing recorded who wrote the report "${report.title}", and ${where ?? 'its question'} names no agent,`)
    if (filed.actorType !== 'agent') {
      throw nobody(`The person wrote the report "${report.title}", and ${where ?? 'the question'} names no agent to send the answer to,`)
    }
    stamp = filed.actorId
  }
  const could = everyAgentAStoredStampCouldName(stamp)
  if (could.length === 0) {
    throw nobody(
      named !== null
        ? `${where ?? 'The question'} sends its answers to "${named}", and no agent in this office answers to that name now,`
        : `The report "${report.title}" was written by "${stamp}", and no agent in this office answers to that name now,`,
    )
  }
  if (could.length > 1) {
    throw new PanelError(
      `The name "${stamp}" that the answer to block "${question.block.id}" goes to could mean ${could.map(nameOf).join(' or ')}, ` +
        'and the office does not guess which. Nothing was sent. The report\'s writer can name the agent by its id.',
      409,
    )
  }
  return could[0]!
}

/**
 * The decision that stands now in place of this one, this one when none replaced it, or null when that one is deleted or
 * the line of replacements comes back on itself, so that the last of it is replaced in turn and none stands.
 */
function theDecisionThatStands(decisionId: string): string | null {
  const at = whatSupersedes(decisionId)?.id ?? decisionId
  if (at !== decisionId && whatSupersedes(at) !== null) return null
  const row = getRecord(at)
  return row === null || row.deletedAt !== null ? null : at
}

/**
 * WHAT A CHOICE'S NEW DECISION REPLACES, AND THE PROPOSAL IT SETTLES.
 *
 *   - the decision this block's answer was last recorded as, or the one that stands in its place now: a changed answer
 *     replaces the earlier decision of the same block;
 *   - when `about` names a decision: that decision, or the one that stands in its place now, as choosing again does;
 *   - when `about` names a proposal: every decision that settles it and stands, as choosing again does, and the new
 *     decision settles the proposal too.
 *
 * The `about` record is read again here, because it may have been deleted or moved since the report was written.
 */
function whatAChoiceReplaces(block: ChoiceBlock, kept: AnswersOfABlock | undefined, report: PanelRecord): { replaces: string[]; settles: PanelRecord | null } {
  const replaces = new Set<string>()
  const earlier = kept?.sent?.decision
  if (earlier !== undefined) {
    const stands = theDecisionThatStands(earlier)
    if (stands !== null) replaces.add(stands)
  }
  let settles: PanelRecord | null = null
  if (block.about !== undefined) {
    const about = getRecord(block.about.trim())
    if (about === null || about.deletedAt !== null || about.workspaceId !== report.workspaceId || (about.kind !== 'proposal' && about.kind !== 'decision')) {
      throw new PanelError(
        `"${block.question}" is about "${block.about}", which is no longer a proposal or a decision in this project` +
          `${about === null ? '' : about.deletedAt !== null ? ' (it was deleted)' : ` (it is a ${kindWord(about.kind).text} "${about.title}")`}. ` +
          'Its answer could settle or replace nothing. Nothing was sent. The report\'s writer can correct the question.',
        409,
      )
    }
    if (about.kind === 'decision') {
      const stands = theDecisionThatStands(about.id)
      if (stands !== null) replaces.add(stands)
    } else {
      settles = about
      for (const one of proposalResolution(about)?.by ?? []) {
        if (!one.deleted && one.replacedBy === null) replaces.add(one.id)
      }
    }
  }
  return { replaces: [...replaces], settles }
}

/** The chooser, stated on every answer, independently of who sent it. */
function whoChoseIt(chosenBy: ParticipantRef | undefined): string {
  if (chosenBy === undefined) return 'Nobody recorded who chose this answer.'
  return chosenBy.kind === 'person' ? 'Chosen by the person.' : `Chosen by the secretary ${chosenBy.id}.`
}

/** One answer in the message's words, for the agent that reads it. */
function oneAnswerInWords(one: OneToSend, decision: string | undefined, index: number): string {
  const { block } = one.question
  const lines: string[] = []
  if (block.type === 'button') {
    lines.push(`${String(index)}. Button "${block.label}" (block ${block.id}): pressed.`)
    lines.push(`   ${whoChoseIt(one.chosenBy)}`)
    return lines.join('\n')
  }
  if (block.type === 'choice') {
    lines.push(`${String(index)}. ${block.question} (block ${block.id})`)
    lines.push(`   ${whoChoseIt(one.chosenBy)}`)
    const chosen = (one.answer.chosen ?? []).map((id) => `${block.options.find((option) => option.id === id)?.label ?? id} (option ${id})`)
    lines.push(chosen.length === 0 ? '   Chosen: no option.' : `   Chosen: ${chosen.join('; ')}.`)
    if ((one.answer.words ?? '').trim() !== '') lines.push(`   ${whoseOwnWords(one.chosenBy)}: ${one.answer.words!.trim()}`)
    if (decision !== undefined) lines.push(`   Recorded as the person's decision ${decision}.`)
    return lines.join('\n')
  }
  lines.push(`${String(index)}. ${block.asks} (block ${block.id})`)
  lines.push(`   ${whoChoseIt(one.chosenBy)}`)
  lines.push(`   ${whoseOwnWords(one.chosenBy)}: ${(one.answer.words ?? '').trim()}`)
  return lines.join('\n')
}

/**
 * SEND WHAT A PRESS COVERS AND HAS NOT BEEN SENT. The person presses, or a secretary their grant carries here sends
 * for them. The sender and the grant are recorded separately from who chose each answer. A box's submit, a button,
 * or the whole report's submit. Each choice is still recorded as the person's decision.
 */
export function sendAnswers(reportId: string, press: ThePress, workspaceId: string, actor: Actor): AnswersSent {
  refuseAnybodyButThePerson(actor, 'Sending the answers to a report', true)
  const underTheGrant = whoPressedItUnderTheGrant(actor)
  const sender: ParticipantRef = underTheGrant?.by ?? { kind: 'person', id: actor.id }
  const report = theReport(reportId, workspaceId)
  const blocks = blocksOf(report)
  const scope = theScopeOf(blocks, press)
  if (typeof scope === 'string') throw new PanelError(`${scope} Nothing was sent.`, 404)
  const answers = answersOf(report.data)

  // ---- WHAT GOES, every answer checked against its question as it stands now.
  const going: { question: AQuestionHere; answer: AnAnswer; chosenBy?: ParticipantRef }[] = []
  for (const question of scope) {
    const kept = answers[question.block.id]
    if (question.block.type === 'button') {
      if (kept?.sent !== undefined) {
        throw new PanelError(
          `The button "${question.block.label}" was pressed and sent at ${kept.sent.at}, and a button is pressed once. Nothing was sent.`,
          409,
        )
      }
      going.push({ question, answer: { pressed: true }, chosenBy: sender })
      continue
    }
    const answer = unsentAnswer(kept)
    if (answer === null) continue
    refuseAnAnswerThisQuestionCannotTake(question.block, answer)
    going.push({ question, answer, ...(kept?.draft?.chosenBy === undefined ? {} : { chosenBy: kept.draft.chosenBy }) })
  }
  if (going.length === 0) {
    throw new PanelError(
      press.scope === 'box'
        ? `Every answer in the box "${press.id}" has been sent already, or nothing is answered there yet. Nothing was sent.`
        : 'Every answer in this report has been sent already, or nothing is answered yet. Nothing was sent.',
      409,
      undefined,
      undefined,
      'There is nothing unsent to send. Nothing was sent.',
      { code: 'answersNothingUnsent', values: {} },
    )
  }

  // ---- WHO RECEIVES EACH, AND WHETHER THEY CAN TAKE A MESSAGE. Each receiver is asked once.
  const toSend: OneToSend[] = []
  const asked = new Set<string>()
  for (const one of going) {
    const receiver = theReceiverOf(one.question, report)
    if (!asked.has(receiver.id)) {
      asked.add(receiver.id)
      const why = whyThisAgentCannotReceiveAMessage({ kind: 'agent', id: receiver.id }, report.workspaceId)
      if (why !== null) {
        throw new PanelError(
          `The answers would go to ${nameOf(receiver)}, and it cannot take a message: ${why} Nothing was sent: no decision ` +
            'was recorded and the answers are kept as they were.',
          409,
          undefined,
          undefined,
          'The agent these answers go to cannot take a message now. Nothing was sent.',
          { code: 'answersReceiverCannotTakeAMessage', values: { agent: receiver.name } },
        )
      }
    }
    const choice = one.question.block.type === 'choice' ? whatAChoiceReplaces(one.question.block, answers[one.question.block.id], report) : { replaces: [], settles: null }
    toSend.push({ ...one, receiver, ...choice })
  }

  // ---- THE WRITES, in one transaction, as the answer door.
  const door = `POST /api/records/${report.id}/answers/send`
  const at = nowStamp()
  return sqlite.transaction((): AnswersSent =>
    asTheAnswerDoor((): AnswersSent => {
      // 1. EACH CHOICE IS RECORDED AT ONCE AS THE PERSON'S DECISION, linked to the report and to the proposal it settles.
      const decisions = new Map<string, string>()
      for (const one of toSend) {
        const { block } = one.question
        if (block.type !== 'choice') continue
        // derived_from in its general sense: the decision was made from the report; the next line settles the proposal.
        const links: LinkRequest[] = [{ type: 'derived_from', toId: report.id }]
        if (one.settles !== null) links.push({ type: RESOLVES_PROPOSAL, toId: one.settles.id })
        const created = createRecordWithReport({
          kind: 'decision',
          title: block.question,
          data: {
            option_taken: theWordsOfAChoice(block, one.answer, one.chosenBy),
            decided_on: at.slice(0, 10),
            decided_by: THE_OWNER,
            authority: 'the owner said so',
            authority_reference: underTheGrant?.grant ?? report.id,
            replaces: one.replaces,
            ...(one.replaces.length === 0
              ? {
                  why_it_replaces_none:
                    'No earlier answer to this question stands as a decision, and the question is about no decision that stands.',
                }
              : {}),
            // WHAT IT GOVERNS: what the decisions it replaces named, else the pages the report is about and the pages the
            // proposal it settles is linked to, else a nothingFits entry that says so (lib/what-a-record-names.ts).
            ...whatTheOfficeSendsItGoverns({
              said: undefined,
              workspaceId: report.workspaceId,
              replaced: one.replaces.map((id) => getRecord(id)?.data),
              pages: [...thePagesARecordIsAbout(report.id, report.workspaceId), ...(one.settles === null ? [] : theSubjectsAForkIsLinkedTo(one.settles.id))],
              whyNoPage: 'The person answered a question in a report that is about no page, and the question named no page either.',
            }),
          },
          workspaceId: report.workspaceId,
          actor,
          links,
          mustSayWhatItReplaces: true,
          mustSayWhatItGoverns: true,
          door,
          // NEITHER LIST OF TITLES ALREADY FILED. Only the decision's id is kept, and the send door's answer names neither.
          namesWhatIsAlreadyFiled: false,
        })
        decisions.set(block.id, created.record.id)
      }

      // 2. ONE MESSAGE FOR EACH AGENT, with its answers in reading order and a lead back to the report.
      const byReceiver = new Map<string, OneToSend[]>()
      for (const one of toSend) byReceiver.set(one.receiver.id, [...(byReceiver.get(one.receiver.id) ?? []), one])
      const messages: { id: string; to: string }[] = []
      const messageOf = new Map<string, string>()
      for (const [to, ones] of byReceiver) {
        const body = [
          underTheGrant === null
            ? ones.every((one) => one.chosenBy?.kind === 'person')
              ? `The person answered questions in the report "${report.title}" (record ${report.id}).`
              : `The person sent answers to questions in the report "${report.title}" (record ${report.id}).`
            : `The secretary ${sender.id} sent answers under the person's grant ${underTheGrant.grant} to questions in the report "${report.title}" (record ${report.id}).`,
          '',
          ...ones.map((one, index) => oneAnswerInWords(one, decisions.get(one.question.block.id), index + 1)),
          '',
          `These answers are also in the report's ${ANSWERS_FIELD} field, under each question's block id.`,
        ].join('\n')
        const message = createRecord({
          kind: 'message',
          title: `Answers to "${report.title}"`,
          data: {
            body,
            to: [{ kind: 'agent', id: to }],
            lead: { target: { kind: 'record', recordId: report.id, workspaceId: report.workspaceId } },
          },
          workspaceId: report.workspaceId,
          actor,
        })
        messages.push({ id: message.id, to })
        for (const one of ones) messageOf.set(one.question.block.id, message.id)
      }

      // 3. THE REPORT'S ANSWERS: what was sent replaces the draft, and the revisions keep what was there before.
      const next: ReportAnswers = { ...answers }
      for (const one of toSend) {
        const id = one.question.block.id
        const decision = decisions.get(id)
        next[id] = {
          sent: {
            answer: one.answer,
            by: sender.id,
            ...(underTheGrant === null ? {} : { underTheGrant: underTheGrant.grant }),
            ...(one.chosenBy === undefined ? {} : { chosenBy: one.chosenBy }),
            at,
            to: one.receiver.id,
            message: messageOf.get(id)!,
            ...(decision === undefined ? {} : { decision }),
          },
        }
      }
      const written = writeTheAnswers(report, next, actor)
      return { messages, decisions: [...decisions.values()], answers: written.answers }
    }),
  )()
}
