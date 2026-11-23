// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SECRETARY'S DUTIES: WHO MAY WRITE THEM, WHAT THEY MUST HOLD, AND THE PART OF THE BRIEF THAT SHOWS THEM. Wave 13s
 * round 92, item 2 of the line's requirements, on the shape approved in round 90.
 *
 * -----------------------------------------------------------------------------------------
 * WHO MAY WRITE THEM
 * -----------------------------------------------------------------------------------------
 *
 * The person, by their own press. Or the secretary the record names, using its own key, carrying a warrant that quotes
 * the person's words from a decision the record rests on. Nobody else: not another agent, not another secretary, not
 * the person's grant alone, and not a signed package item. The warrant is bound to `secretary.set-duties:<secretary
 * id>:` plus JSON of the duties as they will stand (`theBindingOf`), or null when they are taken away.
 * Inside a test world, its starter and the secretary write them as the person does (rule 5 of chapter 8).
 *
 * src/server/lib/records.ts calls `checkTheSecretaryDuties` on every create, restore and change into this kind, and
 * every change within it, including its title and summary. A write of only the short forms is not a change within it:
 * nothing in data but `shortForms` changes and the title, summary and kind stay, so it changes no duty and not whose
 * duties they are (wave 13s round 106, item 17). It meets the record's ordinary write rules.
 *
 * A delete or a change out of this kind calls `checkTheDutiesTakenAway`, which asks the same writer and words on the
 * decisions the stored duties rest on. Taking
 * duties away does not require a live secretary or check for a second record. A move to another project
 * (src/server/lib/move.ts) calls `checkTheDutiesTakenAway` for the project the duties leave, before the write, and
 * `checkTheSecretaryDuties` for the project they go to, inside the write, so the decisions they rest on must be there
 * when they land. Both guards keep the warrant when its words opened the change; the person's own press keeps none.
 * The same refusals apply through /api/records and PUT /api/secretaries/<id>/duties.
 *
 * A decision the duties rest on is not deleted, and is not moved to another project without them, while they rest on it.
 * `checkNoDutiesOrDepartmentsRestOn` refuses both, called by `deleteRecord` in records.ts and by move.ts, and asks the
 * same of a department that rests on the decision, merged or not, from step 1b of departments. It refuses the person too,
 * and names the change of the duties that must come first, which only the writers above may make. Without it, duties
 * named a decision that was gone, and their next change was refused, even the person's. Way (a) of wave 13s round 100.
 * Round 101 adds three more acts on the decision. `patchRecord` refuses a change of its kind, or of `decided_by` away
 * from the owner. The revoke of the promotion that filed it is refused in a sentence that also says the order: the
 * duties first, then the revoke. A newer decision that replaces it is filed, because it is the person's decision. The
 * duties then still name the replaced one: their page says so and names the decision that stands, and their next
 * change is refused, naming that decision, until the person or the secretary carrying the person's words rests them on it.
 * Round 102 adds a change of `authority_reference` that would give the decision the mark below, and fits two sentences to
 * the act refused. A secretary taking its duties away from a decision they may no longer rest on is told to rest them
 * first on the decision that stands, and then to take them away (`theWayToTakeThemAway`). The revoke of an act that would
 * put back such a version says the order, the duties first and then the revoke. Which decision stands in place of a
 * replaced one is `whatSupersedes` in lib/replaced-decisions.ts, the one answer every page gives.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT EACH DECISION IT RESTS ON MUST BE
 * -----------------------------------------------------------------------------------------
 *
 * A live decision in the same project, replaced by no live decision, decided by "the owner", and given no mark by
 * `decisionsNotOnThePersonsOwnWords`: answer (a) to round 90's first question. The warrant's words must appear in
 * one of those decisions' words, or in the person's own message that decision cites. A department asks the same of the
 * decisions it rests on: both guards ask it through `theDecisionsRestedOn` in grant/decisions-rested-on.ts.
 */
import { isDeepStrictEqual } from 'node:util'

import { DEPARTMENT_KIND } from '@shared/departments.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { isMoleOffice, MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD, type ParticipantRef } from '@shared/participants.ts'
import { DEPARTMENTS_REST_ON_THE_DECISION, type CodedRefusal } from '@shared/refusal-codes.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated, THE_SUPERVISOR } from '@shared/roles.ts'
import { isADoorTheListNames, whatThisDoorDoes } from '@shared/what-the-grant-carries-words.ts'
import { sqlite } from '../../db/client.ts'
import { type RegisteredAgent } from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theAgentRowAnIdNames } from '../the-agent-row-an-id-names.ts'
import { thePersonPressedItThemselves, type Actor } from '../records.ts'
import { theWordsAllowThis } from '@shared/the-person-proved.ts'
import { PanelError } from '../panel-error.ts'
import { theFiledAliasesReadOnce } from '../registry-aliases/runs.ts'
import { whatSupersedes } from '../replaced-decisions.ts'
import { theRoleCards } from '../roles.ts'
import { decisionsNotOnThePersonsOwnWords, isAWordOf, referenceOf, whoseRecordsAreThese } from '../the-persons-own-words.ts'
import { SECRETARY_DUTIES_KIND, isObject, theSecretaryNamedIn } from '@shared/secretary-duties-record.ts'
import { holdsTheSecretaryCard } from '../holds-the-secretary-card-2.ts'
import { theDutiesIn } from '../../db/the-duties-part-for.ts'
import type { TheDuties, AnotherSecretarysArea, TheDutiesPart } from '../../db/types/secretary-duties.ts'
import { theDecisionsRestedOn, type ADecisionRestedOn } from './decisions-rested-on.ts'

export { SECRETARY_DUTIES_KIND }

/** The longest area line, in characters. Every other secretary sees this line, so it stays one line. */
export const AN_AREA_AT_MOST = 200

/** The longest line in one of the lists, in characters. */
export const A_LISTED_LINE_AT_MOST = 300

/** The act a warrant names, before the secretary's id: `secretary.set-duties:<id>:<JSON of the duties>`. */
export const THE_ACT_OF_SETTING_DUTIES = 'secretary.set-duties'

export { THE_DUTIES_FIELDS } from '../../db/the-duties-part-for.ts'

/** The lists among them. */
const THE_LISTS = ['responsibleFor', 'lines', 'doors', 'reportsToThePerson'] as const

/** How many SQL statements the brief's part reads. tests/secretary-duties.test.ts holds `theDutiesPartFor` to it. */
export const THE_DUTIES_PART_READS_IN_STATEMENTS = 1

export type { TheDuties, AnotherSecretarysArea, TheDutiesPart } from '../../db/types/secretary-duties.ts'

export { theDutiesIn } from '../../db/the-duties-part-for.ts'

/** What a warrant names in `for`: the act, the secretary's registry id, and JSON of the duties, or null for none. */
export function theBindingOf(secretaryId: string, data: Record<string, unknown> | null): string {
  return `${THE_ACT_OF_SETTING_DUTIES}:${secretaryId}:${JSON.stringify(data === null ? null : theDutiesIn(data))}`
}

export { theSecretaryNamedIn }

/**
 * THE REFUSALS AND THEIR FIRST WORDS, which tell a caller which rule refused it. tests/secretary-duties.test.ts reads them
 * here rather than copying them.
 */
export const WHY_DUTIES_ARE_REFUSED = {
  noSecretaryToTakeAway: 'Only the person, by their own press, takes away duties whose data does not name a secretary as {"kind": "agent", "id": <its registry id>}.',
  notTheSecretary: 'Only the person, or the secretary these duties name, writes them,',
  theGrantAlone: "The person's grant alone does not write a secretary's duties.",
  replaced: 'is replaced by a newer decision.',
  notTheirWords: "The warrant's words do not appear in",
  restOnTheDecision: "while a secretary's duties rest on it.",
  changeThemThenRevoke: 'The order is: change the duties or delete them first, then revoke the promotion.',
  changeThemThenRevokeTheAct: 'The order is: change the duties or delete them first, then revoke the act.',
} as const

/** The sentence every refusal of who writes ends with. */
function whoMayWrite(secretaryId: string): string {
  return (
    `The person writes these duties by their own press. The secretary they name, ${secretaryId}, may write them with ` +
    "its own key and a warrant quoting the person's words from a decision they rest on. Ask the person, or that " +
    'secretary, to write them.'
  )
}

/** A refusal of the change as written, which says what to send instead, with its code when it has one. */
function refuse(words: string, status = 400, refusal?: CodedRefusal): PanelError {
  return new PanelError(`${words} Nothing was written.`, status, undefined, undefined, undefined, refusal)
}

/** The words a decision holds, every string of every field that is its words, joined. */
function theWordsOf(kind: string, data: unknown): string {
  if (!isObject(data)) return ''
  const out: string[] = []
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (isObject(value)) Object.values(value).forEach(walk)
  }
  for (const [key, value] of Object.entries(data)) if (isAWordOf(kind, key)) walk(value)
  return out.join('\n')
}

/** `decision A` or `decisions A, B`. */
const theDecisionsInWords = (ids: readonly string[]): string => `decision${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`

/** Runs of spaces and line breaks read as one space, so a quote that crosses a line still matches. */
const asOneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

/** Every list holds short lines, each written once. */
function checkTheLists(data: Record<string, unknown>): void {
  for (const key of THE_LISTS) {
    const list = data[key]
    if (list === undefined) continue
    if (!Array.isArray(list)) throw refuse(`data.${key} is a list of short lines.`)
    for (const line of list) {
      if (typeof line !== 'string' || line.trim() === '' || /[\r\n]/.test(line) || line.length > A_LISTED_LINE_AT_MOST) {
        throw refuse(
          `Each line of data.${key} is one line of words, not empty, of at most ${String(A_LISTED_LINE_AT_MOST)} characters. ` +
            'Split a longer one into two lines.',
        )
      }
    }
    if (new Set(list).size !== list.length) throw refuse(`data.${key} holds one line twice. Write each line once.`)
  }
  for (const door of (data['doors'] as string[] | undefined) ?? []) {
    if (!isADoorTheListNames(door)) {
      throw refuse(
        `data.doors names "${door}", and the list of what the grant carries names no such door. Name each door by its ` +
          'id from GET /api/office/what-the-grant-carries.',
      )
    }
  }
}

/** The area is one line of at most AN_AREA_AT_MOST characters, and the record rests on at least one decision. */
function checkTheAreaAndTheDecisions(data: Record<string, unknown>): string[] {
  const area = data['area']
  if (typeof area !== 'string' || area.trim() === '' || /[\r\n]/.test(area) || area.length > AN_AREA_AT_MOST) {
    throw refuse(
      `data.area is the secretary's area in one line of at most ${String(AN_AREA_AT_MOST)} characters, and every ` +
        'other secretary sees it. Put the rest in data.responsibleFor.',
    )
  }
  return theDecisionsNamedIn(data)
}

/** The decision ids these duties rest on, also asked when taking the duties away. */
function theDecisionsNamedIn(data: Record<string, unknown>): string[] {
  const restsOn = data['restsOn']
  if (!Array.isArray(restsOn) || restsOn.length === 0 || !restsOn.every((id) => typeof id === 'string' && id.trim() !== '')) {
    throw refuse("data.restsOn lists the ids of the person's decisions these duties rest on, at least one.")
  }
  if (new Set(restsOn).size !== restsOn.length) throw refuse('data.restsOn names one decision twice. Name each once.')
  return restsOn as string[]
}

export { holdsTheSecretaryCard } from '../holds-the-secretary-card-2.ts'

/** The secretary named, by its registry id or an old id filed as its alias, is a live registry row holding the secretary card. */
function theSecretaryRow(secretary: ParticipantRef): RegisteredAgent {
  const row = theAgentRowAnIdNames(secretary.id)
  if (row === null) {
    throw refuse(
      `data.secretary names the agent ${secretary.id}, and no agent has that registry id. Name the secretary by its ` +
        'registry id, never its handle: GET /api/secretaries/duties lists the secretaries with their ids.',
    )
  }
  if (row.retired === true) {
    throw refuse(`data.secretary names ${row.handle}, and ${row.handle} is retired. Duties are kept for a live secretary.`)
  }
  if (!holdsTheSecretaryCard(row)) {
    // MOLE OFFICE'S OWN ROW HOLDS NO CARD, and nobody appoints the product, so its sentence says so.
    if (isMoleOffice({ kind: 'agent', id: row.id })) {
      throw refuse(
        `${row.handle} ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}, and duties are kept for an agent holding the ` +
          `${theRoleCards().elevation.onlyThisCardCanHoldIt} card. Write the duties of an agent that holds the card.`,
      )
    }
    throw refuse(
      `${row.handle} holds the ${row.role ?? A_ROW_WITH_NO_ROLE_READS_AS} card, and duties are kept for an agent holding ` +
        `the ${theRoleCards().elevation.onlyThisCardCanHoldIt} card. Ask the person to appoint ${row.handle}, or write ` +
        'the duties of an agent that holds the card.',
    )
  }
  return row
}

/**
 * No other live record in this project holds this secretary's duties, under any id the secretary has had. Read live, so
 * two writes cannot both pass.
 */
function checkThereIsNoOther(workspaceId: string, secretaryId: string, mine: string | null): void {
  const other = sqlite
    .prepare(
      `SELECT id, title FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL
         AND json_extract(data, '$.secretary.id') IN (SELECT value FROM json_each(?)) AND id IS NOT ? LIMIT 1`,
    )
    .get(workspaceId, SECRETARY_DUTIES_KIND, JSON.stringify(theFiledAliasesReadOnce(sqlite).everyIdOf(secretaryId)), mine) as
    | { id: string; title: string }
    | undefined
  if (other === undefined) return
  throw new PanelError(
    `The secretary ${secretaryId} already has duties in this project, ${other.id} ("${other.title}"). Nothing was ` +
      `written. One record holds one secretary's duties. Change that record instead: PUT /api/secretaries/${secretaryId}/duties.`,
    409,
  )
}

/**
 * THE SUPERVISORS THE SECRETARY ANSWERS FOR, each {agent, area}, wave 13y round 91, item 12b. The agent is a live
 * registry row holding the supervisor card, named once here and by no other secretary's duties in this project. The
 * area is one line of at most AN_AREA_AT_MOST characters, which the chat draws under that agent's name. The other
 * duties are read live, in one statement, so two writes cannot both name one supervisor.
 */
function checkTheSupervisors(workspaceId: string, data: Record<string, unknown>, mine: string | null): void {
  const supervisors = data['supervisors']
  if (supervisors === undefined) return
  const theShape =
    'Each entry of data.supervisors holds agent and area, and nothing else: {"agent": {"kind": "agent", "id": <its ' +
    'registry id>}, "area": <one line>}.'
  if (!Array.isArray(supervisors)) throw refuse(`data.supervisors is a list. ${theShape}`)
  const handles = new Map<string, string>()
  for (const one of supervisors) {
    const agent = isObject(one) ? one['agent'] : undefined
    if (
      !isObject(one) ||
      Object.keys(one).some((key) => key !== 'agent' && key !== 'area') ||
      !isObject(agent) ||
      Object.keys(agent).some((key) => key !== 'kind' && key !== 'id') ||
      agent['kind'] !== 'agent' ||
      typeof agent['id'] !== 'string' ||
      agent['id'].trim() === ''
    ) {
      throw refuse(theShape)
    }
    const area = one['area']
    if (typeof area !== 'string' || area.trim() === '' || /[\r\n]/.test(area) || area.length > AN_AREA_AT_MOST) {
      throw refuse(
        `The area of each entry of data.supervisors is one line of at most ${String(AN_AREA_AT_MOST)} characters, ` +
          "not empty. The chat draws it under the supervisor's name.",
      )
    }
    const row = theAgentRowAnIdNames(agent['id'])
    if (row === null) {
      throw refuse(
        `data.supervisors names the agent ${agent['id']}, and no agent has that registry id. Name each supervisor by ` +
          'its registry id, never its handle: GET /api/participants lists the agents with their ids.',
      )
    }
    if (row.retired === true) {
      throw refuse(`data.supervisors names ${row.handle}, and ${row.handle} is retired. Name only a live supervisor.`)
    }
    if (row.role !== THE_SUPERVISOR) {
      // MOLE OFFICE'S OWN ROW HOLDS NO CARD, so its sentence does not name one.
      const holds = isMoleOffice({ kind: 'agent', id: row.id })
        ? `. ${row.handle} ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}`
        : `, which holds the ${row.role ?? A_ROW_WITH_NO_ROLE_READS_AS} card`
      throw refuse(`data.supervisors names ${row.handle}${holds}. Name only an agent holding the ${THE_SUPERVISOR} card.`)
    }
    if (handles.has(row.id)) throw refuse(`data.supervisors names ${row.handle} twice. Name each supervisor once.`)
    handles.set(row.id, row.handle)
  }
  if (handles.size === 0) return
  // ANOTHER SECRETARY'S DUTIES MAY NAME ONE OF THEM BY ANY ID IT HAS HAD: its canonical id or an old one filed as its alias.
  const aliases = theFiledAliasesReadOnce(sqlite)
  const other = sqlite
    .prepare(
      `SELECT records.id, records.title, json_extract(named.value, '$.agent.id') AS agent
         FROM records, json_each(records.data, '$.supervisors') AS named
        WHERE records.workspace_id = ? AND records.kind = ? AND records.deleted_at IS NULL AND records.id IS NOT ?
          AND json_extract(named.value, '$.agent.id') IN (SELECT value FROM json_each(?)) LIMIT 1`,
    )
    .get(workspaceId, SECRETARY_DUTIES_KIND, mine, JSON.stringify([...handles.keys()].flatMap((id) => aliases.everyIdOf(id)))) as
    | { id: string; title: string; agent: string }
    | undefined
  if (other === undefined) return
  throw refuse(
    `data.supervisors names ${handles.get(aliases.canonicalOf(other.agent)) ?? other.agent}, and the duties ${other.id} ("${other.title}") ` +
      'already name it. One secretary answers for each supervisor in a project. Take it out of those duties first, or ' +
      'name another supervisor.',
    409,
  )
}

/**
 * THE THREE WAYS DUTIES ARE TAKEN AWAY, in the words a refusal tells the secretary to do it in: `deleteRecord`, a change
 * out of this kind in `patchRecord`, and a move to another project in src/server/lib/move.ts.
 */
const THE_WAYS_DUTIES_ARE_TAKEN_AWAY = {
  delete: { toDo: 'delete these duties', then: 'delete them' },
  kind: { toDo: 'change these duties into another kind', then: 'change their kind' },
  move: { toDo: 'move these duties to another project', then: 'move them' },
} as const

/** A way duties are taken away. */
export type ATakingAway = keyof typeof THE_WAYS_DUTIES_ARE_TAKEN_AWAY

/** What a write that names a replaced decision is told to do: name the decision that stands in its place. */
export function theWayToRestThemOn(standing: string): string {
  return `Name ${standing} in data.restsOn instead.`
}

/**
 * WHAT A SECRETARY TAKING ITS DUTIES AWAY IS TOLD TO DO when they rest on a decision they may no longer rest on (wave 13s
 * round 102, item 13). Naming another decision in restsOn fits a write, not a delete. So the secretary rests the duties
 * first on `onto`, the decision that stands in the refused one's place, or on another decision of the person's when none
 * stands there, and then takes them away. The person's own press takes them away without asking about the decisions.
 */
export function theWayToTakeThemAway(act: ATakingAway, secretaryId: string, onto: string | null): string {
  const way = THE_WAYS_DUTIES_ARE_TAKEN_AWAY[act]
  const it = onto ?? 'it'
  return (
    `To ${way.toDo}, first rest them on ${onto ?? "another of the person's decisions in this project, made on the person's own words"}. ` +
    `Send PUT /api/secretaries/${secretaryId}/duties with restsOn naming ${it}, and a warrant quoting the person's words ` +
    `from ${it}. Then ${way.then}, with a warrant quoting those words. Or ask the person to ${way.then} by their own press.`
  )
}

/**
 * EACH DECISION IN restsOn IS LIVE, IN THIS PROJECT, REPLACED BY NONE, DECIDED BY THE OWNER AND ON THE PERSON'S OWN
 * WORDS: `theDecisionsRestedOn` in grant/decisions-rested-on.ts, which a department's guard asks too. Returns each with
 * its data, for the check of the warrant's words. `takingAway` names the act and the secretary when the duties are being
 * taken away rather than written, so each refusal ends with what fits that act.
 */
function theDecisionsItRestsOn(
  workspaceId: string,
  ids: readonly string[],
  takingAway: { act: ATakingAway; secretaryId: string } | null = null,
): ADecisionRestedOn[] {
  const orForAWrite = (onto: string | null, write: string): string =>
    takingAway === null ? write : theWayToTakeThemAway(takingAway.act, takingAway.secretaryId, onto)
  const read = theDecisionsRestedOn(workspaceId, ids)
  if (read.fit) return read.decisions
  const { id } = read
  switch (read.fault) {
    case 'notLive':
      throw refuse(
        `data.restsOn names ${id}, which is not a live decision in this project. ` +
          orForAWrite(null, "Name the person's decisions these duties rest on: GET /api/records?kind=decision lists them."),
      )
    case 'replaced':
      throw refuse(
        `Decision ${id} ${WHY_DUTIES_ARE_REFUSED.replaced} The decision that stands in its place is ${read.standing.id} ` +
          `("${read.standing.title}"). ${orForAWrite(read.standing.id, theWayToRestThemOn(read.standing.id))}`,
      )
    case 'notTheOwners':
      throw refuse(
        `Decision ${id} was not decided by "${THE_OWNER}". Duties rest only on the person's own decisions.` +
          (takingAway === null ? '' : ` ${theWayToTakeThemAway(takingAway.act, takingAway.secretaryId, null)}`),
      )
    case 'notOnThePersonsOwnWords':
      throw refuse(
        `Decision ${id} was recorded in the person's name on words that are not the person's own, so duties may not ` +
          `rest on it. ${orForAWrite(null, "Ask the person to decide it themselves, or name a decision made on the person's own words.")}`,
      )
  }
}

/**
 * THE WARRANT'S WORDS APPEAR IN ONE OF THE DECISIONS, or in the person's own message one of them cites. A cited record
 * counts only when `whoseRecordsAreThese` says it is the person's own message. A department's guard
 * (src/server/lib/grant/departments.ts) asks the same of the decisions a department rests on.
 */
export function theWordsAreTheDecisions(said: string, decisions: readonly { id: string; data: unknown }[]): boolean {
  const words = asOneLine(said)
  if (words === '') return false
  if (decisions.some((one) => asOneLine(theWordsOf('decision', one.data)).includes(words))) return true
  const cited = decisions.flatMap((one) => referenceOf(one.data) ?? [])
  if (cited.length === 0) return false
  const whose = whoseRecordsAreThese(cited)
  const messages = cited.filter((id) => {
    const one = whose.get(id)
    return one !== undefined && one.own && one.as === 'message'
  })
  if (messages.length === 0) return false
  const bodies = sqlite
    .prepare(`SELECT kind, data FROM records WHERE id IN (${messages.map(() => '?').join(', ')})`)
    .all(...messages) as { kind: string; data: string | null }[]
  return bodies.some((one) => asOneLine(theWordsOf(one.kind, one.data === null ? null : JSON.parse(one.data))).includes(words))
}

/**
 * WHETHER THIS CALLER MAY WRITE THESE DUTIES, refused in words that say what to do instead. The person's own press
 * passes, and so does a caller that holds the person's authority in a test world. Otherwise the caller must be the
 * secretary the record names, proved by its own key, with no signed item, and carrying a warrant bound to this change.
 * This is `aSecretaryWithItsOwnKey` (src/server/api/runtime-settings.ts) asked of the record's own secretary: the key
 * here, and the card and the registry row in `theSecretaryRow`. It is not imported, because src/server/lib/records.ts
 * imports this file and that file imports the route files.
 *
 * THE SECRETARY IS EVERY ID IT HAS HAD: its canonical id and each old one filed as its alias. So the record may name it
 * by an old id, and the warrant's binding of `data`, or of null when the duties are taken away, may name any of them.
 */
function checkWhoWrites(actor: Actor, secretaryId: string, data: Record<string, unknown> | null): { byThePerson: boolean } {
  if (thePersonPressedItThemselves(actor)) return { byThePerson: true }
  // INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY WRITE AS THE PERSON DOES. Rule 5 of chapter 8: they hold the
  // person's authority there. The field is absent in the office, which is never a test world.
  if (actor.theOwnersAuthority?.holds === true) return { byThePerson: true }
  const who = whoMayWrite(secretaryId)
  if (actor.type !== 'agent') throw refuse(`This write did not come from the person's own press or from an agent. ${who}`, 403)
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(secretaryId)
  const binding = theBindingOf(secretaryId, data)
  const caller = participantForActor(actor)
  if (caller === null || caller.id !== ids[0]) {
    throw refuse(`${WHY_DUTIES_ARE_REFUSED.notTheSecretary} and this caller is not ${secretaryId}. ${who}`, 403)
  }
  if (actor.provedBy !== 'an-agent-key') {
    throw refuse(`The secretary writes its own duties using its own key, and this request was not proved by it. ${who}`, 403)
  }
  if (actor.signedItem !== undefined) {
    throw refuse(`A signed package item does not write a secretary's duties. ${who}`, 403)
  }
  if (actor.warrant === undefined) {
    throw refuse(
      `${WHY_DUTIES_ARE_REFUSED.theGrantAlone} Send a warrant quoting the person's words from a decision in ` +
        `data.restsOn, with "for" naming ${binding}.`,
      403,
    )
  }
  if (!ids.some((id) => actor.warrant?.for.includes(theBindingOf(id, data)))) {
    throw refuse(`The warrant does not name this change. Its "for" must name ${binding}.`, 403)
  }
  return { byThePerson: false }
}

/**
 * THE WRITE GUARD. Called on every create, restore and change into this kind, and every change within it but a write of
 * only the short forms, which `aPatchWritesMoreThanShortForms` in src/server/lib/records.ts tells apart. `before`
 * holds the stored data only when nothing besides data changes; otherwise it is null so the whole check runs. `mine`
 * is the record's id, or null on a create, so a record does not refuse itself as its own second copy.
 */
export function checkTheSecretaryDuties(input: {
  workspaceId: string
  data: unknown
  before: unknown
  mine: string | null
  actor: Actor
}): void {
  const { workspaceId, data, actor } = input
  if (!isObject(data)) throw refuse("A secretary's duties are a JSON object.")
  const secretary = theSecretaryNamedIn(data)
  if (secretary === null || secretary.kind !== 'agent') {
    throw refuse('data.secretary names the secretary as {"kind": "agent", "id": <its registry id>}.')
  }
  const { byThePerson } = checkWhoWrites(actor, secretary.id, data)
  // DATA SENT AS IT ALREADY STANDS WRITES NOTHING, so only who sent it is asked. A caller nobody lets write is refused
  // even then, rather than answered as if its change had been accepted.
  if (input.before !== null && isDeepStrictEqual(input.before, data)) return
  const restsOn = checkTheAreaAndTheDecisions(data)
  checkTheLists(data)
  theSecretaryRow(secretary)
  checkThereIsNoOther(workspaceId, secretary.id, input.mine)
  checkTheSupervisors(workspaceId, data, input.mine)
  const decisions = theDecisionsItRestsOn(workspaceId, restsOn)
  if (byThePerson) return
  if (!theWordsAreTheDecisions(actor.warrant?.words ?? '', decisions)) {
    throw refuse(
      `${WHY_DUTIES_ARE_REFUSED.notTheirWords} ${theDecisionsInWords(restsOn)} or in the person's message it cites. Quote ` +
        "the person's own words from one of the decisions these duties rest on.",
      403,
    )
  }
  // THE WARRANT OPENED THIS WRITE, so the change row and the revision keep it.
  theWordsAllowThis(actor)
}

/**
 * A delete, a change out of this kind or a move to another project takes duties away, on the writer and decisions the
 * stored record names. `act` says which, so a refusal says how to do that act.
 */
export function checkTheDutiesTakenAway(input: { workspaceId: string; data: unknown; actor: Actor; act: ATakingAway }): void {
  const { workspaceId, data, actor } = input
  const secretary = theSecretaryNamedIn(data)
  if (!isObject(data) || secretary === null || secretary.kind !== 'agent') {
    if (thePersonPressedItThemselves(actor) || actor.theOwnersAuthority?.holds === true) return
    throw refuse(WHY_DUTIES_ARE_REFUSED.noSecretaryToTakeAway, 403)
  }
  const { byThePerson } = checkWhoWrites(actor, secretary.id, null)
  if (byThePerson) return
  const restsOn = theDecisionsNamedIn(data)
  const decisions = theDecisionsItRestsOn(workspaceId, restsOn, { act: input.act, secretaryId: secretary.id })
  if (!theWordsAreTheDecisions(actor.warrant?.words ?? '', decisions)) {
    throw refuse(
      `${WHY_DUTIES_ARE_REFUSED.notTheirWords} ${theDecisionsInWords(restsOn)} or in the person's message it cites. Quote ` +
        "the person's own words from one of the decisions these duties rest on.",
      403,
    )
  }
  // THE WARRANT OPENED THIS CHANGE, so the change row and the revision keep it.
  theWordsAllowThis(actor)
}

/**
 * EACH ACT ON A DECISION THAT `checkNoDutiesOrDepartmentsRestOn` REFUSES, in its words: what the decision is not, what
 * the act would leave the duties or departments resting on, and what to do once they are changed.
 */
export const THE_ACTS_ON_A_DECISION = {
  delete: {
    isNot: 'deleted',
    left: 'Deleting it would leave them resting on a decision that is gone',
    then: 'Then delete the decision again.',
  },
  move: {
    isNot: 'moved',
    left: 'Moving it would leave them resting on a decision in another project',
    then: 'Then move the decision again.',
  },
  kind: {
    isNot: 'changed into another kind',
    left: 'Changing its kind would leave them resting on a record that is not a decision',
    then: 'Then change its kind again.',
  },
  decidedBy: {
    isNot: `changed to say that somebody other than "${THE_OWNER}" decided it`,
    left: 'That change would leave them resting on a decision the person did not decide',
    then: 'Then make that change again.',
  },
  authorityReference: {
    isNot: "changed to cite something that is not the person's own words",
    left: "That change would leave them resting on a decision that is not on the person's own words",
    then: 'Then make that change again.',
  },
  revoke: {
    isNot: 'retracted by revoking the promotion that filed it',
    left: 'Retracting it would leave them resting on a decision that is gone',
    then: WHY_DUTIES_ARE_REFUSED.changeThemThenRevoke,
  },
} as const

/** An act on a decision that duties may rest on. */
export type AnActOnADecision = keyof typeof THE_ACTS_ON_A_DECISION

/**
 * THE ACT, IF ANY, BY WHICH A CHANGE OF A RECORD FROM `before` TO `next` WOULD TAKE AWAY WHAT LETS DUTIES REST ON IT: it
 * stops being a decision, it stops saying the owner decided it, or it starts to cite something that is not the person's
 * own words, which gives it the mark of `decisionsNotOnThePersonsOwnWords`. Null when none, and for a record that was
 * not a decision. patchRecord in src/server/lib/records.ts asks it of every change, and the revoke of an act asks it of
 * the version it would put back.
 */
export function theActThatWouldStrandTheDuties(
  id: string,
  before: { kind: string; data: unknown },
  next: { kind: string; data: unknown },
): Exclude<AnActOnADecision, 'delete' | 'move' | 'revoke'> | null {
  if (before.kind !== 'decision') return null
  if (next.kind !== 'decision') return 'kind'
  const decidedByThePerson = (data: unknown): boolean => isObject(data) && data['decided_by'] === THE_OWNER
  if (!decidedByThePerson(before.data)) return null
  if (!decidedByThePerson(next.data)) return 'decidedBy'
  if (referenceOf(before.data) === referenceOf(next.data)) return null
  const marked = (data: unknown): boolean => decisionsNotOnThePersonsOwnWords([{ id, data }]).has(id)
  return !marked(before.data) && marked(next.data) ? 'authorityReference' : null
}

/**
 * A DECISION IS NOT DELETED, MOVED TO ANOTHER PROJECT, CHANGED INTO ANOTHER KIND OR TAKEN OFF THE PERSON WHILE DUTIES OR A
 * DEPARTMENT REST ON IT. Asked of the person too, because the act on the decision does not change what rests on it, and
 * only the person or a secretary carrying the person's words may. A department that is merged and not deleted still
 * rests on its decisions, so it is asked as a standing one is. `goingWithIt` is the records a move carries along with
 * the decision, so duties and departments that move with it are not asked here. `revoking` is the version whose revoke
 * would make the change by putting back the one before it: the refusal then ends with the order, what rests on the
 * decision first and then the revoke, rather than with doing the change again.
 *
 * When only duties rest on it, the refusal is the duties' sentence, word for word, with no code. When a department does,
 * the refusal names every department and duties with its door, and carries DEPARTMENTS_REST_ON_THE_DECISION, so a page
 * can say it in English and in Chinese (wave 13s, step 1b of departments and posts).
 */
export function checkNoDutiesOrDepartmentsRestOn(
  decision: { id: string; title: string; workspaceId: string },
  verb: AnActOnADecision,
  goingWithIt: ReadonlySet<string> = new Set(),
  revoking: number | null = null,
): void {
  const resting = (
    sqlite
      .prepare(
        `SELECT r.id AS id, r.kind AS kind, r.title AS title, json_extract(r.data, '$.secretary.id') AS secretary
           FROM records r, json_each(r.data, '$.restsOn') e
          WHERE r.workspace_id = ? AND r.kind IN (?, ?) AND r.deleted_at IS NULL AND e.value = ?
          ORDER BY r.id`,
      )
      .all(decision.workspaceId, SECRETARY_DUTIES_KIND, DEPARTMENT_KIND, decision.id) as {
      id: string
      kind: string
      title: string
      secretary: string | null
    }[]
  ).filter((one) => !goingWithIt.has(one.id))
  if (resting.length === 0) return
  const duties = resting.filter((one) => one.kind === SECRETARY_DUTIES_KIND)
  const departments = resting.filter((one) => one.kind === DEPARTMENT_KIND)
  const which = [
    ...duties.map((one) => `${one.id} ("${one.title}"), the duties of the secretary ${String(one.secretary)}`),
    ...departments.map((one) => `${one.id} ("${one.title}"), a department`),
  ].join('; ')
  const doors = [
    ...duties.map((one) => `PUT /api/secretaries/${String(one.secretary)}/duties`),
    ...departments.map((one) => `PUT /api/departments/${one.id}`),
  ].join(', ')
  const act = THE_ACTS_ON_A_DECISION[verb]
  const onlyDuties = departments.length === 0
  const words =
    `Decision ${decision.id} ("${decision.title}") is not ${act.isNot} ` +
    (onlyDuties
      ? `${WHY_DUTIES_ARE_REFUSED.restOnTheDecision} These duties`
      : "while a department or a secretary's duties rest on it. These") +
    ` name it in restsOn: ${which}. ${act.left}, and then even ` +
    "the person's next change of them would be refused until it names a live decision of the person's here. Only the " +
    (onlyDuties
      ? "person, by their own press, or the secretary the duties name, with a warrant quoting the person's words, changes them."
      : "person, by their own press, or a secretary with a warrant quoting the person's words, changes them. Duties are " +
        'changed only by the person or the secretary they name.') +
    ` So change them first: ${doors}, with restsOn naming another of the person's decisions in this project. Or ` +
    `take them away with DELETE /api/records/<their id>.` +
    (verb === 'move' ? ` Or move them with the decision: add their ids to "also".` : '') +
    (revoking === null
      ? ` ${act.then}`
      : ` Revoking version ${String(revoking)} would make that change, because it puts back version ` +
        `${String(revoking - 1)}. ${WHY_DUTIES_ARE_REFUSED.changeThemThenRevokeTheAct}`) +
    (!onlyDuties && (verb === 'revoke' || revoking !== null)
      ? ' The same order holds for a department: change it or delete it first.'
      : '')
  if (onlyDuties) throw refuse(words, 409)
  throw refuse(words, 409, {
    code: DEPARTMENTS_REST_ON_THE_DECISION,
    values: { decision: decision.id, resting: [...duties, ...departments].map((one) => one.id).join(', ') },
  })
}

/**
 * EACH DECISION THESE DUTIES REST ON THAT A NEWER DECISION REPLACED, with the decision that stands in its place, for the
 * duties' page to say beside it. Filing the newer decision changes nothing here: only the person, or the secretary
 * carrying the person's decision, rests the duties on it, and their next change is refused, naming it, until then.
 */
export function theReplacedDecisionsTheyRestOn(data: unknown): Record<string, { id: string; title: string }> {
  const restsOn = isObject(data) && Array.isArray(data['restsOn']) ? data['restsOn'].filter((id: unknown): id is string => typeof id === 'string') : []
  const out: Record<string, { id: string; title: string }> = {}
  for (const id of restsOn) {
    const standing = whatSupersedes(id)
    if (standing !== null) out[id] = standing
  }
  return out
}

// ============================================================================ the part of the brief

export { theDutiesPartFor } from '../../db/the-duties-part-for.ts'

/**
 * The part in lines, for the opening of the brief that the session hook prints. Only a reader a duties record names gets
 * them; a reader with no record gets no lines, and reads the part's JSON, which still lists every secretary.
 */
export function theDutiesLines(part: TheDutiesPart): string[] {
  const mine = part.yours
  if (mine === null) return []
  const lines = ["What each secretary does in this project, from GET /api/secretaries/duties:"]
  lines.push(`  Your duties, resting on ${theDecisionsInWords(mine.restsOn)}:`)
  lines.push(`    area: ${mine.area}`)
  const listed = (label: string, list: readonly string[] | undefined): void => {
    if (list !== undefined && list.length > 0) lines.push(`    ${label}: ${list.join('; ')}`)
  }
  listed('responsible for', mine.responsibleFor)
  listed('lines', mine.lines)
  listed('doors', mine.doors?.map((door) => (isADoorTheListNames(door) ? `${door} (${whatThisDoorDoes(door).en})` : door)))
  listed('reports to the person', mine.reportsToThePerson)
  for (const one of part.others) lines.push(`  ${one.handle ?? `${one.secretary} (no agent has this registry id)`}: ${one.area}`)
  return lines
}
