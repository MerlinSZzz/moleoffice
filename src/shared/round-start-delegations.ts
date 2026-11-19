// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { BACKLOG_ITEM_KIND } from './backlog.ts'
import { theAnswerToTheNewest, type InsideDelegation, type PackageMaterial, type PackageParent, type PackageRestatement, type PackageAlignmentAnswer } from './delegation.ts'
import type { ParticipantRef } from './participants.ts'
import type { AskTheOffice } from './round-chapters/backlog.ts'
import { roundDeclaration } from './round-chapters/delivery.ts'
import { DELEGATION_WORDS, oneOfTheWords, type DelegationGiven, type DelegationPoint, type DelegationStanding, type RoundDelegations } from './round-chapters/manifest.ts'
import { THE_PACK_REFUSAL } from './round-start-pack.ts'
import { sayInEnglish } from './i18n.ts'

function fail(why: string): never { throw new Error(THE_PACK_REFUSAL(why)) }
const THE_CHECKS: Record<InsideDelegation['check'], true> = { none: true, holds: true, refused: true }
const aCheck = (value: unknown): value is InsideDelegation['check'] => typeof value === 'string' && Object.hasOwn(THE_CHECKS, value)
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const word = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim()
const said = (body: unknown) => (object(body) && typeof body['error'] === 'string' ? body['error'] : JSON.stringify(body ?? null))

/** What the office's answer says: nothing answered and why, or the status it answered with and its words. */
export function whatTheOfficeAnswered(reply: { status: number | null; body?: unknown; why?: string }): string {
  return reply.status === null ? `nothing answered: ${reply.why ?? 'no reason was given'}` : `the office answered ${reply.status}: ${said(reply.body)}`
}

/** What an office from before the inside delegation door answers for it: a 404 that names the door it does not have. */
export const NO_INSIDE_DOOR = 'No such endpoint: GET /api/delegation/inside'

const theDelegations = (named: string[]) => `the declaration names the ${named.length === 1 ? 'delegation' : 'delegations'} ${named.join(', ')}`

/** Why a start is refused when the office has no inside delegation door. */
export function theInsideDoorIsMissing(named: string[]): string {
  return `${theDelegations(named)}, and this office has no inside delegation door: it answered GET /api/delegation/inside with 404`
}

/** Why a start is refused when nothing answered the inside delegation door. */
export function nothingAnsweredTheInsideDoor(named: string[], why: string): string {
  return `${theDelegations(named)}, and nothing answered GET /api/delegation/inside: ${why}`
}

/** Why a start is refused when the office answered the inside delegation door with another status. */
export function theInsideDoorRefused(named: string[], status: number, words: string): string {
  return `${theDelegations(named)}, and the office refused GET /api/delegation/inside (${status}): ${words}`
}

/** Why a start is refused when the inside delegation door's answer is not in its shape. */
export function theInsideAnswerCannotBeRead(named: string[], why: string): string {
  return `${theDelegations(named)}, and the office's answer to GET /api/delegation/inside cannot be read (${why})`
}

/**
 * Why a start is refused when a named task is not among the office's inside delegations. When the office lists
 * packages it could not read, the sentence says whether the task is one of them, and with the office's reason if so.
 */
export function theDelegationIsNotAmongTheRows(task: string, couldNotRead: { recordId: string; because: string }[]): string {
  const unread = couldNotRead.find(one => one.recordId === task)
  if (unread !== undefined) return `the delegation ${task} is a package the office holds but could not read: ${unread.because.replace(/\.$/, '')}`
  if (couldNotRead.length === 0) return `the delegation ${task} is not among the office's inside delegations`
  return `the delegation ${task} is not among the office's inside delegations, and it is not one of the ${couldNotRead.length} inside packages the office could not read`
}

/** Why a start is refused when the office's row for a named task is not in its shape. */
export function theDelegationsRowCannotBeRead(task: string, why: string): string {
  return `the office's row for the delegation ${task} cannot be read (${why})`
}

/** The hand-back sentence's words when no parent check has happened. */
export const THE_PARENT_HAS_NOT_CHECKED_IT = 'Neither the person nor the agent responsible for the parent has checked it yet'

/** The hand-back sentence's words when the parent's check says the hand-back holds. */
export const THE_PARENTS_CHECK_SAYS_IT_HOLDS = 'The latest check by the person or the agent responsible for the parent says it holds'

/** The hand-back sentence's words when the parent's check refused it, quoting the check's words. */
export function theParentsCheckRefusedIt(checkWords: string | null): string {
  return `The latest check by the person or the agent responsible for the parent refused it, in these words: ${JSON.stringify(checkWords)}`
}

/**
 * Why a start is refused when a named task's package was handed back. The row says when the last hand-back was and
 * where the latest check by the person or the parent's agent stands, but not whether that check came after the
 * hand-back, so the sentence never says it did. The row leaves out an inspector's check, so the sentence names whose
 * check it means and never says that nobody has checked.
 */
export function theDelegationWasHandedBack(task: string, handedBackAt: string, check: InsideDelegation['check'], checkWords: string | null): string {
  const where = check === 'none'
    ? THE_PARENT_HAS_NOT_CHECKED_IT
    : check === 'holds'
      ? THE_PARENTS_CHECK_SAYS_IT_HOLDS
      : theParentsCheckRefusedIt(checkWords)
  return `the delegation ${task} was handed back, last at ${handedBackAt}. ${where}. A round does not take a package that was handed back`
}

/** Why a start is refused when a named task's lines do not name the declaration's line. */
export function theDelegationIsForOtherLines(task: string, line: string, lines: string[]): string {
  return `the delegation ${task} is for ${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')}, not for line ${line}, which the declaration names`
}

/** Why a start is refused when a point's own record cannot give its words. */
export function aPointCannotBeRead(task: string, point: string, why: string): string {
  return `the words of point ${point} of the delegation ${task} cannot be read (${why})`
}

/** Why a start is refused when the task's record cannot give the parent's latest answer, which differs. */
export function theParentsAnswerCannotBeRead(task: string, why: string): string {
  return `the parent's latest answer to the delegation ${task} cannot be read (${why})`
}

/**
 * THE DELEGATIONS A ROUND TAKES. When the brief's declaration names delegations, the round start asks the office for
 * its inside delegations once, before anything is filed or started, and reads each named one: the task, its parent and
 * lines, where it stands inside, its points whole and its materials as stored. Null when the declaration names none,
 * and then nothing is asked.
 *
 * A point's words are read from the point's own record (GET /api/records/<point>), never from the package's material
 * for it, whose `says` is the point's title. The parent's answer words are read from the task's own record, and only
 * when the door says the latest answer differs: the door's row says where an alignment stands but not its words.
 *
 * Every answer that cannot be taken as it is stops the start, by name. No guess and no partial reading.
 */
export async function readTheRoundsDelegations(input: { brief: string; request: AskTheOffice }): Promise<RoundDelegations | null> {
  const { line, delegations: named } = roundDeclaration(input.brief)
  if (named.length === 0) return null
  if (line === null) return fail(`${theDelegations(named)} without a line`)
  const reply = await input.request('/api/delegation/inside')
  if (reply.status === null) fail(nothingAnsweredTheInsideDoor(named, reply.why ?? 'no reason was given'))
  if (reply.status === 404 && said(reply.body).startsWith(NO_INSIDE_DOOR)) fail(theInsideDoorIsMissing(named))
  if (reply.status !== 200) fail(theInsideDoorRefused(named, reply.status, said(reply.body)))
  const body = reply.body
  if (!object(body) || !Array.isArray(body['tasks']) || !Array.isArray(body['couldNotRead'])) fail(theInsideAnswerCannotBeRead(named, 'it is not {tasks, couldNotRead}'))
  if (body['answerRequired'] !== undefined && typeof body['answerRequired'] !== 'boolean') fail(theInsideAnswerCannotBeRead(named, sayInEnglish('roundStart.badAnswerSetting')))
  const rows = body['tasks'] as unknown[]
  const couldNotRead = body['couldNotRead'] as unknown[]
  if (!rows.every(row => object(row) && typeof row['recordId'] === 'string')) fail(theInsideAnswerCannotBeRead(named, 'a row has no record id'))
  if (!couldNotRead.every(one => object(one) && typeof one['recordId'] === 'string' && typeof one['because'] === 'string')) fail(theInsideAnswerCannotBeRead(named, 'a package it could not read is not {recordId, because}'))
  const tasks: DelegationGiven[] = []
  for (const task of named) {
    const row = (rows as Record<string, unknown>[]).find(one => one['recordId'] === task)
    if (row === undefined) fail(theDelegationIsNotAmongTheRows(task, couldNotRead as { recordId: string; because: string }[]))
    const given = readTheRow(task, row)
    if (!given.lines.includes(line)) fail(theDelegationIsForOtherLines(task, line, given.lines))
    const points: DelegationPoint[] = []
    for (const point of given.pointIds) points.push(await readThePoint(task, point, input.request))
    const inside: DelegationStanding = given.inside.alignment === 'differs' ? { ...given.inside, answerWords: await readTheAnswer(task, input.request) } : given.inside
    tasks.push({ task, title: given.title, parent: given.parent, lines: given.lines, inside, points, materials: given.materials })
  }
  return { line, named, tasks, ...(body['answerRequired'] === true ? { answerRequired: true } : {}) }
}

/** The door's row for one named task, read strictly: anything not in its shape is not guessed at. */
function readTheRow(task: string, row: Record<string, unknown>): { title: string; parent: PackageParent; lines: string[]; pointIds: string[]; materials: PackageMaterial[]; inside: DelegationStanding } {
  const unreadable = (why: string): never => fail(theDelegationsRowCannotBeRead(task, why))
  const { title, parent, lines, pointIds, materials, inside } = row
  if (typeof title !== 'string') unreadable('it has no title')
  if (!object(parent) || !oneOfTheWords(DELEGATION_WORDS.parent, parent['kind']) || !word(parent['id'])) unreadable('it has no parent')
  if (!Array.isArray(lines) || !lines.every(word)) unreadable('its lines are not a list of line names')
  if (!Array.isArray(pointIds) || pointIds.length === 0 || !pointIds.every(word)) unreadable('its points are not a list of record ids')
  if (!Array.isArray(materials) || !materials.every(one => object(one) && oneOfTheWords(DELEGATION_WORDS.material, one['kind']) && typeof one['ref'] === 'string' && typeof one['says'] === 'string')) {
    unreadable('its materials are not a list of {kind, ref, says}')
  }
  if (!object(inside)) return unreadable('it has no inside state')
  const { waiting, takenBy, takenAt, alignment, handedBack, handedBackAt, check, checkWords } = inside
  if (typeof waiting !== 'boolean' || !oneOfTheWords(DELEGATION_WORDS.alignment, alignment)) unreadable('its inside state has no taking or alignment')
  if (takenBy !== null && (!object(takenBy) || !oneOfTheWords(DELEGATION_WORDS.taker, takenBy['kind']) || !word(takenBy['id']))) unreadable('who took it is not a person or an agent')
  if (waiting ? takenAt !== null || takenBy !== null || alignment !== 'none' : typeof takenAt !== 'string') unreadable('its taking and its alignment do not agree')
  if (typeof handedBack !== 'boolean') unreadable('its inside state does not say whether it was handed back')
  if (handedBack ? typeof handedBackAt !== 'string' : handedBackAt !== null) unreadable('its hand-back time and its hand-back do not agree')
  if (!aCheck(check)) unreadable('its inside state does not say where its check stands')
  if ((check !== 'none') !== (typeof checkWords === 'string')) unreadable('its check and its check words do not agree')
  if (waiting && (handedBack || check !== 'none')) unreadable('a package waiting to be taken is handed back or checked')
  if (!handedBack && check !== 'none') unreadable('a check is written on a package that was not handed back')
  if (handedBack) fail(theDelegationWasHandedBack(task, handedBackAt as string, check as InsideDelegation['check'], checkWords as string | null))
  const taker = takenBy as ParticipantRef | null
  return {
    title: title as string,
    parent: { kind: (parent as PackageParent).kind, id: (parent as PackageParent).id },
    lines: lines as string[],
    pointIds: pointIds as string[],
    materials: (materials as PackageMaterial[]).map(one => ({ kind: one.kind, ref: one.ref, says: one.says })),
    inside: waiting
      ? { taken: false, alignment: 'none' }
      : { taken: true, ...(taker === null ? {} : { takenBy: { kind: taker.kind, id: taker.id } }), takenAt: takenAt as string, alignment: alignment as DelegationStanding['alignment'] },
  }
}

/** One point's whole words, from its own record. */
async function readThePoint(task: string, point: string, request: AskTheOffice): Promise<DelegationPoint> {
  const unreadable = (why: string): never => fail(aPointCannotBeRead(task, point, why))
  const reply = await request(`/api/records/${encodeURIComponent(point)}`)
  if (reply.status !== 200) unreadable(whatTheOfficeAnswered(reply))
  const record = object(reply.body) ? reply.body['record'] : undefined
  if (!object(record) || record['id'] !== point || record['kind'] !== BACKLOG_ITEM_KIND || !object(record['data'])) return unreadable('the answer is not the record of a backlog item')
  const { number, line, why, doneWhen, files } = record['data'] as Record<string, unknown>
  if (!word(number)) unreadable('it has no number')
  if (!word(line)) unreadable('it has no line')
  if (typeof why !== 'string' || why.trim() === '') unreadable('it holds no words')
  if (doneWhen !== undefined && typeof doneWhen !== 'string') unreadable('its done-when is not words')
  if (files !== undefined && (!Array.isArray(files) || !files.every(one => typeof one === 'string'))) unreadable('its files are not a list of paths')
  return {
    id: point, number: number as string, line: line as string, why: why as string,
    ...(doneWhen === undefined ? {} : { doneWhen: doneWhen as string }),
    ...(files === undefined ? {} : { files: files as string[] }),
  }
}

/** Why the parent's answer cannot be read: the task's record does not hold an inside package. */
export const NOT_A_TASK_WITH_AN_INSIDE_PACKAGE = 'the answer is not the record of a task with an inside package'

/** The parent's latest answer words, from the task's own record, when that answer differs. */
async function readTheAnswer(task: string, request: AskTheOffice): Promise<string> {
  const unreadable = (why: string): never => fail(theParentsAnswerCannotBeRead(task, why))
  const reply = await request(`/api/records/${encodeURIComponent(task)}`)
  if (reply.status !== 200) unreadable(whatTheOfficeAnswered(reply))
  const record = object(reply.body) ? reply.body['record'] : undefined
  const data = object(record) ? record['data'] : undefined
  const held = object(data) ? data['package'] : undefined
  if (!object(record) || record['id'] !== task || !object(held) || !Array.isArray(held['alignments']) || !Array.isArray(held['alignmentAnswers'])) {
    unreadable(NOT_A_TASK_WITH_AN_INSIDE_PACKAGE)
  }
  const { alignments, alignmentAnswers } = held as { alignments: unknown[]; alignmentAnswers: unknown[] }
  if (!alignments.every(object) || !alignmentAnswers.every(object)) unreadable('its restatements and answers are not all records of acts')
  // THE ANSWER TO THE NEWEST RESTATEMENT, by the rule the row's alignment is read by: a second restatement or a second
  // answer is recorded, so the counts of the two lists no longer say which answer is the newest.
  const latest: unknown = theAnswerToTheNewest({ alignments: alignments as PackageRestatement[], alignmentAnswers: alignmentAnswers as PackageAlignmentAnswer[] })
  if (!object(latest) || latest['answer'] !== 'differs') unreadable('the record does not hold a latest answer that differs')
  const words = (latest as Record<string, unknown>)['words']
  if (typeof words !== 'string' || words.trim() === '') unreadable('the latest answer holds no words')
  return words as string
}
