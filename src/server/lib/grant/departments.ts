// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO WRITES A DEPARTMENT, AND WHAT ONE MUST HOLD. Wave 13s round 281, step 1 of departments and posts.
 *
 * -----------------------------------------------------------------------------------------
 * WHO MAY WRITE ONE
 * -----------------------------------------------------------------------------------------
 *
 * The person, by their own press. Or an agent holding the secretary card, not retired, using its own key and carrying a
 * warrant that quotes the person's words from a decision the department rests on (data.restsOn). Nobody else: not a
 * supervisor, not a worker, not the person's grant alone and not a signed package item. Inside a test world its starter
 * and its secretaries write as the person does (rule 5 of chapter 8), as they do a secretary's duties.
 *
 * The warrant is bound to `department.write:` plus the department's id, or `new` on a create, plus JSON of its fields as
 * they will stand (`theBindingOf`), or of null when it is taken away. Every refusal of who writes ends with
 * WHO_MAY_WRITE_A_DEPARTMENT.
 *
 * src/server/lib/records/creating.ts, patching.ts and delete-restore.ts and src/server/lib/move.ts call these guards
 * where they call the guards of a secretary's duties, so POST, PATCH, DELETE and restore on /api/records and a move meet
 * the rules the department doors meet. A write of only the short forms is not a change of the department, as it is not
 * a change of duties: `aPatchWritesMoreThanShortForms` in patching.ts says which writes those are.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT A DEPARTMENT MUST HOLD
 * -----------------------------------------------------------------------------------------
 *
 * A name in English, in Chinese or both; a state; a parent that is a live department of its project, not merged, and
 * not itself or under it; a merged one names where it went, which is not itself, not under it and does not lead back to
 * it, and it has no live sub-department that is not merged. Among the departments of a project that are not merged, a
 * code is held once and an agent supervises one. The supervisor holds the supervisor card and is not retired.
 *
 * Its level word, its team count and its leader are not stored. src/server/lib/departments.ts works them out when it is
 * read.
 */
import { isDeepStrictEqual } from 'node:util'

import {
  A_CODE_AT_MOST,
  A_NAME_AT_MOST,
  DEPARTMENT_FIELDS,
  DEPARTMENT_KIND,
  DEPARTMENT_STATES,
  WHAT_IT_DOES_AT_MOST,
  type DepartmentState,
} from '@shared/departments.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { isMoleOffice, MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD } from '@shared/participants.ts'
import { DEPARTMENT_TAKEN_AWAY_ON_A_DECISION_IT_MAY_NOT_REST_ON } from '@shared/refusal-codes.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, THE_SUPERVISOR } from '@shared/roles.ts'
import { isObject } from '@shared/secretary-duties-record.ts'
import { theWordsAllowThis } from '@shared/the-person-proved.ts'
import { sqlite } from '../../db/client.ts'
import { holdsTheSecretaryCard } from '../holds-the-secretary-card-2.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { thePersonPressedItThemselves, type Actor } from '../records.ts'
import { theFiledAliasesReadOnce } from '../registry-aliases/runs.ts'
import { theAgentRowAnIdNames } from '../the-agent-row-an-id-names.ts'
import { theDecisionsRestedOn, type ADecisionRestedOn } from './decisions-rested-on.ts'
import { theWordsAreTheDecisions } from './secretary-duties.ts'

export { DEPARTMENT_KIND }

/** The act a warrant names, before the department's id: `department.write:<id or new>:<JSON of its fields>`. */
export const THE_ACT_OF_WRITING_A_DEPARTMENT = 'department.write'

/** The sentence every refusal of who writes a department ends with. */
export const WHO_MAY_WRITE_A_DEPARTMENT =
  'The person writes a department by their own press. A secretary may write one with its own key and a warrant ' +
  "quoting the person's words from a decision the department rests on, named in data.restsOn. Ask the person, or a " +
  "secretary carrying the person's words, to write it."

/**
 * THE REFUSALS AND THEIR WORDS, which tell a caller which rule refused it. tests/departments-are-records-of-their-own.test.ts
 * reads them here rather than copying them.
 */
export const WHY_A_DEPARTMENT_IS_REFUSED = {
  aCycle: 'would put the department under itself',
  aMergedParent: 'is merged, and no department is put under a merged one',
  anotherProject: 'is a department of another project',
  theGrantAlone: "The person's grant alone does not write a department.",
  notTheirWords: "The warrant's words do not appear in",
  stillNamed: 'is still named by another live department',
} as const

/**
 * The three ways a department is taken away, in the words a refusal names them by, and in the words it tells a secretary
 * to do it in (`theWayToTakeItAway`).
 */
const THE_WAYS_A_DEPARTMENT_IS_TAKEN_AWAY = {
  delete: { isNot: 'deleted', way: 'Deleting it', toDo: 'delete this department', then: 'delete it' },
  kind: { isNot: 'changed into another kind', way: 'Changing its kind', toDo: 'change this department into another kind', then: 'change its kind' },
  move: { isNot: 'moved to another project', way: 'Moving it', toDo: 'move this department to another project', then: 'move it' },
} as const

/** A way a department is taken away. */
export type ADepartmentTakenAway = keyof typeof THE_WAYS_A_DEPARTMENT_IS_TAKEN_AWAY

/** A department's own fields, in the order DEPARTMENT_FIELDS gives them, and none of the record's other keys. */
export function theDepartmentIn(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of DEPARTMENT_FIELDS) if (data[key] !== undefined) out[key] = data[key]
  return out
}

/** What a warrant names in `for`: the act, the department's id or `new`, and JSON of its fields, or null for none. */
export function theBindingOf(id: string | null, data: Record<string, unknown> | null): string {
  return `${THE_ACT_OF_WRITING_A_DEPARTMENT}:${id ?? 'new'}:${JSON.stringify(data === null ? null : theDepartmentIn(data))}`
}

/** A refusal of the change as written, which says what to send instead. */
function refuse(words: string, status = 400): PanelError {
  return new PanelError(`${words} Nothing was written.`, status)
}

/** `decision A` or `decisions A, B`. */
const theDecisionsInWords = (ids: readonly string[]): string => `decision${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`

/**
 * WHETHER THIS CALLER MAY WRITE A DEPARTMENT, refused in words that say who may. The person's own press passes, and so
 * does a caller holding the person's authority in a test world. Otherwise the caller is an agent holding the secretary
 * card, not retired, proved by its own key, with no signed item, and carrying a warrant bound to this change.
 */
function checkWhoWrites(actor: Actor, binding: string): { byThePerson: boolean } {
  if (thePersonPressedItThemselves(actor)) return { byThePerson: true }
  // INSIDE A TEST WORLD, ITS STARTER AND ITS SECRETARIES WRITE AS THE PERSON DOES. Rule 5 of chapter 8. The field is
  // absent in the office, which is never a test world.
  if (actor.theOwnersAuthority?.holds === true) return { byThePerson: true }
  const who = WHO_MAY_WRITE_A_DEPARTMENT
  if (actor.type !== 'agent') throw refuse(`This write did not come from the person's own press or from an agent. ${who}`, 403)
  const caller = participantForActor(actor)
  const row = caller === null || caller.kind !== 'agent' ? null : theAgentRowAnIdNames(caller.id)
  if (row === null) throw refuse(`This caller is no agent in the registry. ${who}`, 403)
  if (row.retired === true) throw refuse(`${row.handle} is retired. ${who}`, 403)
  if (!holdsTheSecretaryCard(row)) {
    // MOLE OFFICE'S OWN ROW HOLDS NO CARD, so its sentence does not name one.
    const holds = isMoleOffice({ kind: 'agent', id: row.id })
      ? `${row.handle} ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}`
      : `${row.handle} holds the ${row.role ?? A_ROW_WITH_NO_ROLE_READS_AS} card`
    throw refuse(`${holds}, and no agent but a secretary writes a department. ${who}`, 403)
  }
  if (actor.provedBy !== 'an-agent-key') {
    throw refuse(`A secretary writes a department using its own key, and this request was not proved by it. ${who}`, 403)
  }
  if (actor.signedItem !== undefined) throw refuse(`A signed package item does not write a department. ${who}`, 403)
  if (actor.warrant === undefined) {
    throw refuse(
      `${WHY_A_DEPARTMENT_IS_REFUSED.theGrantAlone} Send a warrant quoting the person's words from a decision in ` +
        `data.restsOn, with "for" naming ${binding}. ${who}`,
      403,
    )
  }
  if (!actor.warrant.for.includes(binding)) {
    throw refuse(`The warrant does not name this change. Its "for" must name ${binding}. ${who}`, 403)
  }
  return { byThePerson: false }
}

/** A string of one line, not empty, with no space before or after it, of at most `most` characters. */
const aLine = (value: unknown, most: number): value is string =>
  typeof value === 'string' && value !== '' && value.trim() === value && !/[\r\n]/.test(value) && value.length <= most

/** An id written in data[key], or null when it is left out. */
function anIdIn(data: Record<string, unknown>, key: string): string | null {
  const id = data[key]
  if (id === undefined) return null
  if (typeof id !== 'string' || id.trim() === '' || id.trim() !== id) {
    throw refuse(`data.${key} is the id of a department, or left out.`)
  }
  return id
}

/** What the shape check reads out of a department. */
interface TheShape {
  state: DepartmentState
  codes: string[]
  parent: string | null
  supervisor: string | null
  mergedInto: string | null
  restsOn: string[]
}

/** Each field holds what it says, in the bounds of src/shared/departments.ts. */
function checkTheShape(data: Record<string, unknown>): TheShape {
  const codes = data['codes']
  if (codes !== undefined) {
    if (!Array.isArray(codes)) throw refuse('data.codes is a list of codes, or left out.')
    for (const code of codes) {
      if (!aLine(code, A_CODE_AT_MOST)) {
        throw refuse(
          `Each code in data.codes is one line of at most ${String(A_CODE_AT_MOST)} characters, not empty, with no space ` +
            'before or after it.',
        )
      }
    }
    if (new Set(codes).size !== codes.length) throw refuse('data.codes holds one code twice. Write each code once.')
  }
  for (const key of ['nameEn', 'nameZh'] as const) {
    if (data[key] !== undefined && !aLine(data[key], A_NAME_AT_MOST)) {
      throw refuse(
        `data.${key} is a name in one line of at most ${String(A_NAME_AT_MOST)} characters, not empty, with no space ` +
          'before or after it. Leave it out where there is none.',
      )
    }
  }
  if (data['nameEn'] === undefined && data['nameZh'] === undefined) {
    throw refuse('A department has a name in English, in Chinese or both, in data.nameEn and data.nameZh.')
  }
  for (const key of ['doesEn', 'doesZh'] as const) {
    const does = data[key]
    if (does !== undefined && (typeof does !== 'string' || does.trim() === '' || does.length > WHAT_IT_DOES_AT_MOST)) {
      throw refuse(
        `data.${key} says what the department does, in at most ${String(WHAT_IT_DOES_AT_MOST)} characters, not empty. ` +
          'Leave it out where nobody has said.',
      )
    }
  }
  const state = data['state']
  if (typeof state !== 'string' || !(DEPARTMENT_STATES as readonly string[]).includes(state)) {
    throw refuse(`data.state is one of ${DEPARTMENT_STATES.join(', ')}.`)
  }
  const parent = anIdIn(data, 'parent')
  const mergedInto = anIdIn(data, 'mergedInto')
  if (state === 'merged' && mergedInto === null) {
    throw refuse('A merged department names the department it was merged into, in data.mergedInto.')
  }
  if (state !== 'merged' && mergedInto !== null) {
    throw refuse('data.mergedInto is written only when data.state is merged. Leave mergedInto out.')
  }
  const supervisor = data['supervisor']
  if (
    supervisor !== undefined &&
    (!isObject(supervisor) ||
      Object.keys(supervisor).some((key) => key !== 'kind' && key !== 'id') ||
      supervisor['kind'] !== 'agent' ||
      typeof supervisor['id'] !== 'string' ||
      supervisor['id'].trim() === '')
  ) {
    throw refuse('data.supervisor names one agent as {"kind": "agent", "id": <its registry id>}, or is left out.')
  }
  const restsOn = data['restsOn']
  if (restsOn !== undefined) {
    if (!Array.isArray(restsOn) || !restsOn.every((id) => typeof id === 'string' && id.trim() !== '')) {
      throw refuse("data.restsOn lists the ids of the person's decisions the department rests on, or is left out.")
    }
    if (new Set(restsOn).size !== restsOn.length) throw refuse('data.restsOn names one decision twice. Name each once.')
  }
  return {
    state: state as DepartmentState,
    codes: (codes as string[] | undefined) ?? [],
    parent,
    supervisor: supervisor === undefined ? null : String((supervisor as Record<string, unknown>)['id']),
    mergedInto,
    restsOn: (restsOn as string[] | undefined) ?? [],
  }
}

/** One record as the checks of another department read it. */
interface ARow {
  id: string
  kind: string
  title: string
  workspace_id: string
  data: string | null
  deleted_at: string | null
}

/** The record an id names, or undefined. */
const theRowOf = (id: string): ARow | undefined =>
  sqlite.prepare('SELECT id, kind, title, workspace_id, data, deleted_at FROM records WHERE id = ?').get(id) as ARow | undefined

/** One stored field of a department, as a string, or null. */
function aStoredField(data: string | null, key: 'mergedInto' | 'state'): string | null {
  const parsed: unknown = data === null ? null : JSON.parse(data)
  const value = isObject(parsed) ? parsed[key] : undefined
  return typeof value === 'string' ? value : null
}

/** The live departments of a project, by id, each with its parent and where it merged. Read in one statement. */
function theDepartmentsOf(workspaceId: string): Map<string, { parent: string | null; mergedInto: string | null }> {
  const rows = sqlite
    .prepare(
      `SELECT id, json_extract(data, '$.parent') AS parent, json_extract(data, '$.mergedInto') AS mergedInto
         FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL`,
    )
    .all(workspaceId, DEPARTMENT_KIND) as { id: string; parent: unknown; mergedInto: unknown }[]
  return new Map(
    rows.map((row) => [
      row.id,
      {
        parent: typeof row.parent === 'string' ? row.parent : null,
        mergedInto: typeof row.mergedInto === 'string' ? row.mergedInto : null,
      },
    ]),
  )
}

/** Whether following `by` from `from` reaches `to`. Each department is visited once, so a stored loop ends the walk. */
function itLeadsTo(
  departments: ReadonlyMap<string, { parent: string | null; mergedInto: string | null }>,
  from: string,
  to: string,
  by: 'parent' | 'mergedInto',
): boolean {
  const seen = new Set<string>()
  let at: string | null = from
  while (at !== null && !seen.has(at)) {
    if (at === to) return true
    seen.add(at)
    at = departments.get(at)?.[by] ?? null
  }
  return false
}

/** The department `id` names, in `key`, is a live department of this project. */
function theLiveDepartment(workspaceId: string, key: 'parent' | 'mergedInto', id: string): ARow {
  const row = theRowOf(id)
  if (row === undefined || row.kind !== DEPARTMENT_KIND || row.deleted_at !== null) {
    throw refuse(`data.${key} names ${id}, which is not a live department. GET /api/departments lists them.`)
  }
  if (row.workspace_id !== workspaceId) {
    throw refuse(
      `data.${key} names ${id}, which ${WHY_A_DEPARTMENT_IS_REFUSED.anotherProject}, ${row.workspace_id}. A department ` +
        'names only departments of its own project.',
    )
  }
  return row
}

/** The parent is a live department of this project, not merged, and neither the department itself nor under it. */
function checkTheParent(workspaceId: string, parent: string, mine: string | null, departments: ReturnType<typeof theDepartmentsOf>): void {
  const row = theLiveDepartment(workspaceId, 'parent', parent)
  if (mine !== null && itLeadsTo(departments, parent, mine, 'parent')) {
    throw refuse(
      `data.parent names ${parent}, which ${WHY_A_DEPARTMENT_IS_REFUSED.aCycle}: it is the department itself or one of ` +
        'its sub-departments. Name a department that is not under it, or leave parent out for a top department.',
    )
  }
  if (aStoredField(row.data, 'state') === 'merged') {
    const into = aStoredField(row.data, 'mergedInto')
    throw refuse(
      `data.parent names ${parent}, which ${WHY_A_DEPARTMENT_IS_REFUSED.aMergedParent}.` +
        (into === null ? '' : ` It was merged into ${into}; name that department, or another that is not merged.`),
    )
  }
}

/**
 * A merged department names a live department of this project that is not itself, not one of its sub-departments, and
 * whose own merges do not lead back to it. It has no live sub-department that is not merged: those move or merge first.
 */
function checkWhereItMerges(workspaceId: string, into: string, mine: string | null, departments: ReturnType<typeof theDepartmentsOf>): void {
  theLiveDepartment(workspaceId, 'mergedInto', into)
  if (mine === null) return
  if (itLeadsTo(departments, into, mine, 'parent')) {
    throw refuse(`data.mergedInto names ${into}, which is the department itself or one of its sub-departments. Name another.`)
  }
  if (itLeadsTo(departments, into, mine, 'mergedInto')) {
    throw refuse(`data.mergedInto names ${into}, which was merged, at last, into this department. Name another.`)
  }
  const under = sqlite
    .prepare(
      `SELECT id, title FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL
         AND json_extract(data, '$.parent') = ? AND json_extract(data, '$.state') IS NOT ? ORDER BY id`,
    )
    .all(workspaceId, DEPARTMENT_KIND, mine, 'merged') as { id: string; title: string }[]
  if (under.length === 0) return
  throw refuse(
    `Department ${mine} still has sub-departments that are not merged: ` +
      `${under.map((one) => `${one.id} ("${one.title}")`).join(', ')}. Put them under another department, or merge ` +
      'them, before it is merged.',
    409,
  )
}

/**
 * THE SUPERVISOR IS A LIVE AGENT HOLDING THE SUPERVISOR CARD, and supervises no other department of this project that is
 * not merged, under any id it has had. Read live, so two writes cannot both pass.
 */
function checkTheSupervisor(workspaceId: string, id: string, state: DepartmentState, mine: string | null): void {
  const row = theAgentRowAnIdNames(id)
  if (row === null) {
    throw refuse(
      `data.supervisor names the agent ${id}, and no agent has that registry id. Name it by its registry id, never its ` +
        'handle: GET /api/participants lists the agents with their ids.',
    )
  }
  if (row.retired === true) throw refuse(`data.supervisor names ${row.handle}, and ${row.handle} is retired. Name a live supervisor.`)
  if (row.role !== THE_SUPERVISOR) {
    // MOLE OFFICE'S OWN ROW HOLDS NO CARD, so its sentence does not name one.
    const holds = isMoleOffice({ kind: 'agent', id: row.id })
      ? `. ${row.handle} ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}`
      : `, which holds the ${row.role ?? A_ROW_WITH_NO_ROLE_READS_AS} card`
    throw refuse(`data.supervisor names ${row.handle}${holds}. Name an agent holding the ${THE_SUPERVISOR} card.`)
  }
  if (state === 'merged') return
  const other = sqlite
    .prepare(
      `SELECT id, title FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL AND id IS NOT ?
         AND json_extract(data, '$.state') IS NOT ?
         AND json_extract(data, '$.supervisor.id') IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 1`,
    )
    .get(workspaceId, DEPARTMENT_KIND, mine, 'merged', JSON.stringify(theFiledAliasesReadOnce(sqlite).everyIdOf(row.id))) as
    | { id: string; title: string }
    | undefined
  if (other === undefined) return
  throw refuse(
    `${row.handle} already supervises the department ${other.id} ("${other.title}"). One agent supervises one ` +
      'department in a project that is not merged. Take it off that department first, or name another supervisor.',
    409,
  )
}

/** No code is held by another department of this project that is not merged. Read live, in one statement. */
function checkTheCodes(workspaceId: string, codes: readonly string[], state: DepartmentState, mine: string | null): void {
  if (codes.length === 0 || state === 'merged') return
  const other = sqlite
    .prepare(
      `SELECT records.id AS id, records.title AS title, code.value AS code
         FROM records, json_each(records.data, '$.codes') AS code
        WHERE records.workspace_id = ? AND records.kind = ? AND records.deleted_at IS NULL AND records.id IS NOT ?
          AND json_extract(records.data, '$.state') IS NOT ?
          AND code.value IN (SELECT value FROM json_each(?)) ORDER BY records.id LIMIT 1`,
    )
    .get(workspaceId, DEPARTMENT_KIND, mine, 'merged', JSON.stringify(codes)) as { id: string; title: string; code: string } | undefined
  if (other === undefined) return
  throw refuse(
    `The code "${other.code}" is held by the department ${other.id} ("${other.title}"). A code is held by one ` +
      'department in a project that is not merged. Take it off that department first, or merge that department.',
    409,
  )
}

/**
 * WHAT A SECRETARY TAKING A DEPARTMENT AWAY IS TOLD TO DO when it rests on a decision it may no longer rest on, as duties
 * are told (`theWayToTakeThemAway` in secretary-duties.ts). Naming another decision in restsOn fits a write, not a
 * delete. So the secretary rests the department first on `onto`, the decision that stands in the refused one's place,
 * or on another decision of the person's when none stands there, and then takes it away. The person's own press takes
 * it away without asking about the decisions.
 */
export function theWayToTakeItAway(act: ADepartmentTakenAway, department: string, onto: string | null): string {
  const way = THE_WAYS_A_DEPARTMENT_IS_TAKEN_AWAY[act]
  const it = onto ?? 'it'
  return (
    `To ${way.toDo}, first rest it on ${onto ?? "another of the person's decisions in this project, made on the person's own words"}. ` +
    `Send PUT /api/departments/${department} with restsOn naming ${it}, and a warrant quoting the person's words from ` +
    `${it}. Then ${way.then}, with a warrant quoting those words. Or ask the person to ${way.then} by their own press.`
  )
}

/**
 * EACH DECISION IN restsOn IS LIVE, IN THIS PROJECT, REPLACED BY NONE, DECIDED BY THE OWNER AND ON THE PERSON'S OWN
 * WORDS: `theDecisionsRestedOn` in grant/decisions-rested-on.ts, which a secretary's duties ask too. Returns each with
 * its data, for the check of the warrant's words. A write is told what to name instead. `takingAway` names the act and
 * the department when it is being taken away: that refusal carries a code, so a page can say it in English and in
 * Chinese, and ends with `theWayToTakeItAway` rather than with what to name.
 */
function theDecisionsItRestsOn(
  workspaceId: string,
  ids: readonly string[],
  takingAway: { act: ADepartmentTakenAway; department: string } | null = null,
): ADecisionRestedOn[] {
  const read = theDecisionsRestedOn(workspaceId, ids)
  if (read.fit) return read.decisions
  const { id } = read
  const refused = (words: string, onto: string | null, write: string | null): PanelError => {
    if (takingAway === null) return refuse(write === null ? words : `${words} ${write}`)
    const way = theWayToTakeItAway(takingAway.act, takingAway.department, onto)
    return new PanelError(`${words} ${way} Nothing was written.`, 400, undefined, undefined, undefined, {
      code: DEPARTMENT_TAKEN_AWAY_ON_A_DECISION_IT_MAY_NOT_REST_ON,
      values: { department: takingAway.department, decision: id },
    })
  }
  switch (read.fault) {
    case 'notLive':
      throw refused(
        `data.restsOn names ${id}, which is not a live decision in this project.`,
        null,
        "Name the person's decisions the department rests on: GET /api/records?kind=decision lists them.",
      )
    case 'replaced':
      throw refused(
        `Decision ${id} is replaced by a newer decision, ${read.standing.id} ("${read.standing.title}").`,
        read.standing.id,
        `Name ${read.standing.id} in data.restsOn instead.`,
      )
    case 'notTheOwners':
      throw refused(`Decision ${id} was not decided by "${THE_OWNER}". A department rests only on the person's own decisions.`, null, null)
    case 'notOnThePersonsOwnWords':
      throw refused(
        `Decision ${id} was recorded in the person's name on words that are not the person's own, so a department may not rest on it.`,
        null,
        "Ask the person to decide it themselves, or name a decision made on the person's own words.",
      )
  }
}

/** The warrant's words appear in one of the decisions, or in the person's message one cites; else 403. */
function checkTheWords(actor: Actor, restsOn: readonly string[], decisions: readonly { id: string; data: unknown }[]): void {
  if (theWordsAreTheDecisions(actor.warrant?.words ?? '', decisions)) return
  throw refuse(
    `${WHY_A_DEPARTMENT_IS_REFUSED.notTheirWords} ${theDecisionsInWords(restsOn)} or in the person's message it cites. ` +
      `Quote the person's own words from a decision the department rests on. ${WHO_MAY_WRITE_A_DEPARTMENT}`,
    403,
  )
}

/**
 * THE WRITE GUARD. Called on every create, restore and change into this kind, and every change within it but a write of
 * only the short forms. `before` holds the stored data only when nothing besides data changes; otherwise it is null so
 * the whole check runs. `mine` is the record's id, or null on a create.
 */
export function checkTheDepartment(input: { workspaceId: string; data: unknown; before: unknown; mine: string | null; actor: Actor }): void {
  const { workspaceId, data, mine, actor } = input
  if (!isObject(data)) throw refuse('A department is a JSON object.')
  const { byThePerson } = checkWhoWrites(actor, theBindingOf(mine, data))
  // DATA SENT AS IT ALREADY STANDS WRITES NOTHING, so only who sent it is asked.
  if (input.before !== null && isDeepStrictEqual(input.before, data)) return
  const shape = checkTheShape(data)
  if (!byThePerson && shape.restsOn.length === 0) {
    throw refuse(`A secretary writes a department only on a decision of the person's, named in data.restsOn. ${WHO_MAY_WRITE_A_DEPARTMENT}`, 403)
  }
  const departments = theDepartmentsOf(workspaceId)
  if (shape.parent !== null) checkTheParent(workspaceId, shape.parent, mine, departments)
  if (shape.mergedInto !== null) checkWhereItMerges(workspaceId, shape.mergedInto, mine, departments)
  if (shape.supervisor !== null) checkTheSupervisor(workspaceId, shape.supervisor, shape.state, mine)
  checkTheCodes(workspaceId, shape.codes, shape.state, mine)
  const decisions = shape.restsOn.length === 0 ? [] : theDecisionsItRestsOn(workspaceId, shape.restsOn)
  if (byThePerson) return
  checkTheWords(actor, shape.restsOn, decisions)
  // THE WARRANT OPENED THIS WRITE, so the change row and the revision keep it.
  theWordsAllowThis(actor)
}

/**
 * A DELETE, A CHANGE OUT OF THIS KIND OR A MOVE TO ANOTHER PROJECT TAKES A DEPARTMENT AWAY. The same writers are asked,
 * with the warrant bound to null. No live department of the project may still name it as its parent or as the one it was
 * merged into, unless it goes with it (`goingWithIt`, on a move); this is asked of the person too. A secretary's words
 * are asked on the decisions the stored department rests on. When one of them is a decision a department may no longer
 * rest on, the refusal carries a code and says the way: rest it on a decision that stands first, then take it away.
 */
export function checkTheDepartmentTakenAway(input: {
  workspaceId: string
  id: string
  data: unknown
  actor: Actor
  act: ADepartmentTakenAway
  goingWithIt?: ReadonlySet<string>
}): void {
  const { workspaceId, id, data, actor } = input
  const { byThePerson } = checkWhoWrites(actor, theBindingOf(id, null))
  const way = THE_WAYS_A_DEPARTMENT_IS_TAKEN_AWAY[input.act]
  const naming = (
    sqlite
      .prepare(
        `SELECT id, title FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL AND id IS NOT ?
           AND (json_extract(data, '$.parent') = ? OR json_extract(data, '$.mergedInto') = ?) ORDER BY id`,
      )
      .all(workspaceId, DEPARTMENT_KIND, id, id, id) as { id: string; title: string }[]
  ).filter((one) => input.goingWithIt?.has(one.id) !== true)
  if (naming.length > 0) {
    throw refuse(
      `Department ${id} is not ${way.isNot}: it ${WHY_A_DEPARTMENT_IS_REFUSED.stillNamed}, as the department above it ` +
        `or the one it was merged into: ${naming.map((one) => `${one.id} ("${one.title}")`).join(', ')}. ${way.way} ` +
        'would leave them naming a department that is not here. Change them first.' +
        (input.act === 'move' ? ' Or move them with it: add their ids to "also".' : ''),
      409,
    )
  }
  if (byThePerson) return
  const restsOn = isObject(data) && Array.isArray(data['restsOn']) ? data['restsOn'].filter((one: unknown): one is string => typeof one === 'string') : []
  if (restsOn.length === 0) {
    throw refuse(
      `Department ${id} rests on no decision of the person's, so a secretary has none of the person's words to take it ` +
        `away on. ${WHO_MAY_WRITE_A_DEPARTMENT}`,
      403,
    )
  }
  checkTheWords(actor, restsOn, theDecisionsItRestsOn(workspaceId, restsOn, { act: input.act, department: id }))
  // THE WARRANT OPENED THIS CHANGE, so the change row and the revision keep it.
  theWordsAllowThis(actor)
}
