// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES A ROUND'S START GIVES, READ FROM THE OFFICE WHEN THE ROUND STARTS.
 *
 * A chapter changed in the office is what the next round's start gives, with no export commit in between: the start
 * asks GET /api/office-regulations/chapters once and makes CODE.md's text from that answer, with codeOfLawText, as the
 * export does. It asks GET /api/office-regulations once and gives every live regulation of the person whole.
 *
 * Nothing here falls back. When a door gives nothing, another status than 200, or an answer that cannot be read, the
 * start is refused with the door and what the office said, and no older copy is given in place of the rules. An office
 * that holds no chapter in use, or no live regulation, is not a refusal: the text says so in words.
 *
 * src/shared/round-chapters/delivery.ts saves what this reads beside the round's other sources, and
 * src/shared/round-start-pack.ts names where it came from.
 */
import type { AskTheOffice } from './round-chapters/backlog.ts'
import {
  bytes, regulationsText, THE_CHAPTERS_DOOR, THE_REGULATIONS_DOOR,
  type GivenRegulation, type RoundRegulations,
} from './round-chapters/manifest.ts'
import { whatTheOfficeAnswered } from './round-start-delegations.ts'
import { THE_PACK_REFUSAL } from './round-start-pack.ts'
import { nowStamp } from './time.ts'
import { chaptersOfTheAnswer, codeOfLawText, GENERATED_HEADER_FOR_THE_CODE, TheChaptersAnswerCannotBeUsed } from '../worker/rules.ts'

/** What a round's start read of the rules: CODE.md's text, made from the chapters, and the person's live regulations, read at the same time. */
export interface TheRoundsRules { code: string; regulations: RoundRegulations }

/** The first line of the CODE.md text a round's start makes, in place of the line the export writes. */
export const THE_ROUNDS_CODE_HEADER =
  '<!-- Made at this round\'s start from the chapter records in Mole Office. It is not a file in the checkout: ' +
  'a chapter changed in the office reaches the next round\'s start. -->'

/** Where codeOfLawText says the chapters were read from, for a round's start. */
export const THE_ROUNDS_CHAPTERS_FROM = `the chapter records of this office, read with GET ${THE_CHAPTERS_DOOR} at this round's start,`

/** Why a start is refused when a door of the rules could not be read. `words` says what the office answered. */
export function theRulesCannotBeRead(door: string, words: string): string {
  return `GET ${door} could not be read, so this round is given no rules, and no older copy in their place: ${words}`
}

/** What is said of an answer that came with 200 but cannot be used, and why. */
export function itsAnswerCannotBeUsed(why: string): string {
  return `its answer cannot be used (${why.replace(/\.$/, '')})`
}

function fail(door: string, words: string): never { throw new Error(THE_PACK_REFUSAL(theRulesCannotBeRead(door, words))) }

/** CODE.md's text for a round, made from an answer of the chapters door at `at`. It throws TheChaptersAnswerCannotBeUsed as chaptersOfTheAnswer does. */
export function theRoundsCodeText(answer: unknown, at: string, checkout: string): string {
  const read = chaptersOfTheAnswer(answer, THE_CHAPTERS_DOOR, checkout)
  const text = codeOfLawText({ generatedBy: 'src/shared/round-start-rules.ts', from: THE_ROUNDS_CHAPTERS_FROM, at, chapters: read.chapters, selection: read.selection })
  if (!text.startsWith(GENERATED_HEADER_FOR_THE_CODE)) throw new Error('codeOfLawText no longer begins with GENERATED_HEADER_FOR_THE_CODE, so a round\'s start cannot say where its CODE.md came from.')
  return THE_ROUNDS_CODE_HEADER + text.slice(GENERATED_HEADER_FOR_THE_CODE.length)
}

const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const BINDS: Record<GivenRegulation['binds'], true> = { person: true, role: true, unknown: true }
const textOrNull = (value: unknown) => value === null || typeof value === 'string'

/** The live regulations of an answer of GET /api/office-regulations, or why the answer cannot be read. */
function theLiveRegulations(body: unknown): GivenRegulation[] | { why: string } {
  if (!object(body) || !Array.isArray(body['regulations'])) return { why: 'it holds no list of regulations' }
  const live: GivenRegulation[] = []
  for (const [i, one] of (body['regulations'] as unknown[]).entries()) {
    if (!object(one) || typeof one['id'] !== 'string' || one['id'].trim() === '' || typeof one['title'] !== 'string' || typeof one['sentence'] !== 'string' ||
        typeof one['binds'] !== 'string' || !Object.hasOwn(BINDS, one['binds']) || !textOrNull(one['role']) || !textOrNull(one['since']) || !textOrNull(one['revokedAt'])) {
      return { why: `regulation ${i + 1} of the list is not in the shape the door gives` }
    }
    if (one['revokedAt'] !== null) continue
    live.push({
      id: one['id'], title: one['title'], sentence: one['sentence'], binds: one['binds'] as GivenRegulation['binds'],
      ...(typeof one['role'] === 'string' && one['role'].trim() !== '' ? { role: one['role'] } : {}),
      ...(typeof one['since'] === 'string' ? { since: one['since'] } : {}),
    })
  }
  return live
}

/**
 * READ THE ROUND'S RULES FROM THE OFFICE. It asks each door once, the chapters first, and refuses the start on the first
 * door that cannot be read. `checkout` is the round's worktree, which the chapter check measures the rules file in.
 */
export async function readTheRoundsRules(input: { request: AskTheOffice; checkout: string }): Promise<TheRoundsRules> {
  const at = nowStamp()
  const chapters = await input.request(THE_CHAPTERS_DOOR)
  if (chapters.status !== 200) fail(THE_CHAPTERS_DOOR, whatTheOfficeAnswered(chapters))
  let code: string
  try {
    code = theRoundsCodeText(chapters.body, at, input.checkout)
  } catch (error) {
    if (!(error instanceof TheChaptersAnswerCannotBeUsed)) throw error
    fail(THE_CHAPTERS_DOOR, itsAnswerCannotBeUsed(error.message))
  }
  const regulations = await input.request(THE_REGULATIONS_DOOR)
  if (regulations.status !== 200) fail(THE_REGULATIONS_DOOR, whatTheOfficeAnswered(regulations))
  const live = theLiveRegulations(regulations.body)
  if (!Array.isArray(live)) fail(THE_REGULATIONS_DOOR, itsAnswerCannotBeUsed(live.why))
  const text = regulationsText(at, live)
  return { code, regulations: { at, live, text, bytes: bytes(text) } }
}
