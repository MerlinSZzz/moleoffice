// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S ANSWERS TO THE QUESTIONS IN A REPORT, AND WHICH OF THEM A SUBMIT SENDS. Two decisions, on the design
 * CI_hZmfzVGJk.
 *
 * A report may ask the person three kinds of thing: a choice, a fill-in box and a button. Their
 * answers are kept on the report, in `data.answers`, one entry for each question's block id:
 *   - `draft` is what the person has answered and not sent yet. It is kept, so the person can answer
 *     part of a report and come back later;
 *   - `sent` is the answer last sent: what it was, who sent it, when, to which agent, in which message,
 *     and the decision it was recorded as. An answer changed after it was sent is sent again, and the
 *     answer it replaced stays in the report's history.
 *
 * A SUBMIT IS ONE KIND OF PRESS WHOSE SCOPE IS A SET OF BLOCKS. A box's submit has the box's questions
 * as its scope; the whole report's submit has the whole report; a button's press has the button
 * itself. Each sends only what is unsent, so an agent never receives the same answer twice. A block
 * sits in one box only, and the block rules in src/server/lib/summary.ts refuse a report that breaks
 * that when it is written.
 *
 * ONE READING, FOR THE SERVER AND THE PAGE. The answer door (src/server/lib/answers.ts) and the page
 * that draws the questions (src/web/components/ReportQuestions.tsx) both ask here which blocks a press
 * covers and which answers it would send, so the button the page draws and the door it presses cannot
 * disagree.
 */
import type { ChoiceBlock, SummaryBlock } from './types.ts'
import type { ParticipantRef } from './participants.ts'

/** The field of a report that holds the answers. Written only by the answer door. */
export const ANSWERS_FIELD = 'answers' as const

/** The block types the person answers. */
export const ANSWERED_BLOCK_TYPES = ['choice', 'fillin', 'button'] as const
export type AnsweredBlockType = (typeof ANSWERED_BLOCK_TYPES)[number]
export type AnsweredBlock = Extract<SummaryBlock, { type: AnsweredBlockType }>

/** What the person answered: the options chosen, their own words, or the press of a button. */
export interface AnAnswer {
  chosen?: string[]
  words?: string
  pressed?: boolean
}

/** An answer kept and not sent yet. */
export interface AnswerDraft {
  answer: AnAnswer
  /** Who kept this answer. Absent on older drafts: nobody recorded who chose it. */
  chosenBy?: ParticipantRef
  /** When it was last changed, local time. */
  at: string
}

/** The answer last sent for one question. */
export interface AnswerSent {
  answer: AnAnswer
  /** Who sent it: the person's id, or the secretary's registry id when underTheGrant is present. */
  by: string
  /** The grant under which the secretary sent it. Absent for the person's own send and older answers. */
  underTheGrant?: string
  /** Who chose this answer, copied from the draft; for a button, who sent it. Absent means nobody recorded it. */
  chosenBy?: ParticipantRef
  /** When it was sent, local time. */
  at: string
  /** The agent it was sent to, by registry id. */
  to: string
  /** The message that carried it. */
  message: string
  /** The decision a choice's answer was recorded as. Absent for a fill-in box and a button. */
  decision?: string
}

/** Everything kept for one question. */
export interface AnswersOfABlock {
  draft?: AnswerDraft
  sent?: AnswerSent
}

export type ReportAnswers = Record<string, AnswersOfABlock>

/** A question of the report, with the box it sits in, or null when it sits in no box. */
export interface AQuestionHere {
  block: AnsweredBlock
  box: Extract<SummaryBlock, { type: 'box' }> | null
}

/** Every block a block holds, whatever container it is. */
function heldBy(block: SummaryBlock): SummaryBlock[] {
  switch (block.type) {
    case 'section':
    case 'grid':
    case 'box':
      return block.blocks
    case 'columns':
      return block.columns.flat()
    case 'tabs':
      return block.tabs.flatMap((tab) => tab.blocks)
    case 'beside':
      return block.parts.flatMap((part) => part.blocks)
    default:
      return []
  }
}

/** Whether a block is one the person answers. */
export function isAnswered(block: SummaryBlock): block is AnsweredBlock {
  return (ANSWERED_BLOCK_TYPES as readonly string[]).includes(block.type)
}

/** Every question in a report's blocks, in reading order, each with the box it sits in. */
export function questionsIn(blocks: readonly SummaryBlock[]): AQuestionHere[] {
  const found: AQuestionHere[] = []
  const walk = (held: readonly SummaryBlock[], box: AQuestionHere['box']): void => {
    for (const block of held) {
      if (isAnswered(block)) found.push({ block, box })
      walk(heldBy(block), block.type === 'box' ? block : box)
    }
  }
  walk(blocks, null)
  return found
}

/** What a press sends: a box's submit, a button, or the whole report's submit. */
export type ThePress = { scope: 'box'; id: string } | { scope: 'button'; id: string } | { scope: 'report' }

/**
 * THE QUESTIONS A PRESS COVERS, or a sentence saying why the press names nothing it can cover.
 *
 * A box covers the choices and fill-in boxes inside it. A button covers itself. The whole report
 * covers every choice and fill-in box in it, in a box or not; a button is never in its scope, because
 * a button is sent by its own press.
 */
export function theScopeOf(blocks: readonly SummaryBlock[], press: ThePress): AQuestionHere[] | string {
  const all = questionsIn(blocks)
  if (press.scope === 'report') return all.filter((one) => one.block.type !== 'button')
  if (press.scope === 'button') {
    const button = all.find((one) => one.block.id === press.id && one.block.type === 'button')
    return button === undefined ? `This report has no button with the id "${press.id}".` : [button]
  }
  const inTheBox = all.filter((one) => one.box?.id === press.id)
  if (inTheBox.length === 0) return `This report has no box with the id "${press.id}" holding a question.`
  return inTheBox
}

/** Two answers say the same thing: the same options, the same words, the same press. */
export function sameAnswer(one: AnAnswer, other: AnAnswer): boolean {
  const chosen = (answer: AnAnswer): string => [...(answer.chosen ?? [])].sort().join('\n')
  return chosen(one) === chosen(other) && (one.words ?? '') === (other.words ?? '') && (one.pressed ?? false) === (other.pressed ?? false)
}

/** An answer that says nothing: no option, no words, no press. */
export function isEmptyAnswer(answer: AnAnswer): boolean {
  return (answer.chosen ?? []).length === 0 && (answer.words ?? '').trim() === '' && answer.pressed !== true
}

/**
 * THE ANSWER A PRESS WOULD SEND FOR ONE QUESTION, or null when there is nothing to send: nothing kept,
 * or what is kept is what was last sent.
 */
export function unsentAnswer(kept: AnswersOfABlock | undefined): AnAnswer | null {
  const draft = kept?.draft
  if (draft === undefined || isEmptyAnswer(draft.answer)) return null
  if (kept?.sent !== undefined && sameAnswer(draft.answer, kept.sent.answer)) return null
  return draft.answer
}

/**
 * WHERE ONE QUESTION STANDS, in the three states the person is told about:
 *   - `unanswered`: nothing is kept and nothing was sent;
 *   - `notSent`: an answer is kept that a press would send, whether or not an earlier one was sent;
 *   - `sent`: an answer was sent, and nothing kept since differs from it.
 * It reads `unsentAnswer`, so a question counted as not sent is exactly one a press would send.
 */
export type AnswerState = 'unanswered' | 'notSent' | 'sent'

export function answerStateOf(kept: AnswersOfABlock | undefined): AnswerState {
  if (unsentAnswer(kept) !== null) return 'notSent'
  return kept?.sent === undefined ? 'unanswered' : 'sent'
}

/** The agent a question's answer goes to, as the report writes it: its box's or button's `to`, or null for the report's writer. */
export function namedReceiver(question: AQuestionHere): string | null {
  if (question.block.type === 'button') return question.block.to ?? null
  return question.box?.to ?? null
}

/** Whose words an answer carries. Older drafts have no chooser, so no person is inferred. */
export function whoseOwnWords(chosenBy: ParticipantRef | undefined): string {
  if (chosenBy === undefined) return 'Words with no recorded chooser'
  return chosenBy.kind === 'person' ? 'In their own words' : `In the secretary ${chosenBy.id}'s own words`
}

/** The options chosen and the chooser's own line, as the decision keeps them. */
export function theWordsOfAChoice(block: ChoiceBlock, answer: AnAnswer, chosenBy: ParticipantRef | undefined): string {
  const labels = (answer.chosen ?? []).map((id) => block.options.find((option) => option.id === id)?.label ?? id)
  const words = (answer.words ?? '').trim()
  const whose = whoseOwnWords(chosenBy)
  if (labels.length === 0) return chosenBy?.kind === 'person' ? words : `${whose}: ${words}`
  return words === '' ? labels.join('; ') : `${labels.join('; ')} — ${whose.charAt(0).toLowerCase() + whose.slice(1)}: ${words}`
}

/** Read the answers a report holds. Anything that is not an object is no answers at all. */
export function answersOf(data: unknown): ReportAnswers {
  if (typeof data !== 'object' || data === null) return {}
  const held = (data as Record<string, unknown>)[ANSWERS_FIELD]
  return typeof held === 'object' && held !== null && !Array.isArray(held) ? (held as ReportAnswers) : {}
}
