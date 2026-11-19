// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHECKLISTS: THE CLOSED LISTS, THE RULES AN ITEM IS CHECKED AGAINST, AND THE SENTENCES.
 *
 * This follows a decision and a message, on the proposal XEFZwmSBw8xQ.
 * Anyone may make a checklist and use one, people included. One item is one request, with the request's words and the
 * id of the message it came in. "Done" needs evidence: a commit, a report, a manual section or a run. An item marked
 * "must be in the manual" is done only with a manual section among its evidence. The office brings open items back to
 * their owner.
 *
 * THE PERSON'S OWN "DONE" IS THE EXCEPTION. The person's press on an item's box, or one sentence of the person's
 * that names it, marks it done with no evidence asked, and the manual rule gives way too.
 * The office then tells whoever added the item, or the agents the item names to tell.
 *
 * WHY A CHECKLIST IS A KIND OF ITS OWN AND ITS ITEM IS NOT A TASK. A task is one piece of project
 * work that is packaged for somebody to take (the Tasks to take page reads `GET /api/delegation`).
 * A checklist item is one request from a person, kept by whoever owns the list, with the message it
 * came in, evidence for "done" and a reminder. Neither has the other's fields, so they are two things.
 *
 * WHY AN ITEM IS NOT A RECORD. `tests/checklist-item.test.ts` holds the decision that a module's
 * checklist line stays nested. This item stays nested for the same reason: its links are ids in the
 * item, so nothing needs to attach a record to it. One record per checklist keeps the item's id
 * stable, and the change log names each change.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

import type { FlowOnAChecklist } from './flow-run.ts'
import type { ParticipantRef } from './participants.ts'

/** The kind word, in one place. */
export const CHECKLIST_KIND = 'checklist'

// ============================================================================ the closed lists

/**
 * WHERE ONE ITEM STANDS. Point 2 of the proposal, as the decision lists it. They are stored as written,
 * so the word on a screen is the word in the record.
 */
export const CHECKLIST_ITEM_STATES = ['open', 'in progress', 'waiting on the owner', 'done', 'superseded'] as const
export type ChecklistItemState = (typeof CHECKLIST_ITEM_STATES)[number]

/** The states an item has finished in. Every other state is open work. */
export const CLOSED_ITEM_STATES: readonly ChecklistItemState[] = ['done', 'superseded']

/** The state the owner is asked about first (point 5 of the proposal). */
export const WAITING_ON_THE_OWNER: ChecklistItemState = 'waiting on the owner'

/** What evidence for "done" may be (point 2 of the proposal). */
export const EVIDENCE_KINDS = ['commit', 'report', 'manual section', 'run'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/** The record kind each evidence kind names, where it names one. A commit names no record. */
export const EVIDENCE_RECORD_KIND: Readonly<Record<Exclude<EvidenceKind, 'commit'>, string | null>> = {
  report: 'report',
  run: 'session',
  // A MANUAL SECTION IS ONE BLOCK OF ANY RECORD THAT HOLDS BLOCKS. The office has no "manual" kind:
  // the person's manual is whichever record somebody wrote it in. The door checks that the record
  // holds a block with that id.
  'manual section': null,
}

/** A commit is named by its hash: 7 to 40 hexadecimal characters. The office cannot check that it exists. */
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/

// ============================================================================ the two styles of an item

/**
 * WHICH OF THE TWO PRESENTATIONS AN ITEM HAS, chosen by the agent that creates it, which a message
 * asked for. `plain` is a blank box on the left its owner ticks directly; `evidence-or-words`
 * is the special item whose left box opens the evidence picker, where evidence is picked or the owner's own
 * passage is written. The style is stored on the item and is never changed afterwards.
 */
export const CHECKLIST_ITEM_STYLES = ['plain', 'evidence-or-words'] as const
export type ChecklistItemStyle = (typeof CHECKLIST_ITEM_STYLES)[number]

/**
 * THE STYLE TO DRAW AN ITEM WITH. An item stored with no style — every row written before the styles
 * existed, and anything that reaches the store another way — reads as `plain`: their stored rules are
 * untouched, and a blank box is the presentation the owner named first.
 */
export function styleOfChecklistItem(item: Pick<ChecklistRequest, 'style'>): ChecklistItemStyle {
  return item.style ?? 'plain'
}

// ============================================================================ the shapes

export interface ChecklistEvidence {
  kind: EvidenceKind
  /** The commit's hash, for `commit`. */
  commit?: string
  /** The record's id, for `report`, `run` and `manual section`. */
  record?: string
  /** The block's id inside that record, for `manual section`. */
  block?: string
}

export interface ChecklistReminder {
  /** When it fires, on the office's clock: `YYYY-MM-DD HH:MM:SS`. */
  at: string
  /** Who switched it on. Only the checklist's owner may. */
  switchedOnBy: ParticipantRef
  /** When it fired. Absent means it has not fired yet. */
  firedAt?: string
}

/**
 * AN ITEM THE PERSON MARKED DONE, BY THE PERSON'S OWN PRESS OR WORDS. The person's press on the item's box, or one
 * sentence of the person's that names the item, marks it done, and no evidence is asked of the
 * person. An agent's "done" still needs evidence. Written by the item door and never by a body;
 * taken away when the item leaves "done".
 */
export interface ChecklistDoneByThePerson {
  /** When, on the office computer's clock: `YYYY-MM-DD HH:MM:SS`. */
  at: string
  /**
   * Who made the write: the person, for the person's own press; the agent that read the person's words as naming the
   * item; or the agent the person's raise carried.
   */
  by: ParticipantRef
  /** The person's message whose sentence was read as naming this item. Absent when it was a press. */
  onThePersonsWords?: string
  /** True when the person's raise carried the write: an agent holding the grant marked it done with no evidence. */
  underTheRaise?: true
  /**
   * THE PRESS UNDER THE GRANT THAT MARKED IT, by the id of its row in `presses_for_the_person`, beside `underTheRaise`
   * (wave 13s round 2a). The press's reason is kept in that row and nowhere else; the reading gives it in `presses`.
   * Absent on a mark the person made, and on a mark written under the raise before the press was kept on it.
   */
  press?: string
  /** Who the office told, in one message. Empty when nobody was told. */
  told: ParticipantRef[]
  /** The office's message that told them. Absent when nobody was told. */
  notice?: string
}

export interface ChecklistRequest {
  id: string
  words: string
  fromMessage?: string
  state: ChecklistItemState
  /** Which of the two styles this item has. Absent on an item stored before the styles existed: it reads as `plain`. */
  style?: ChecklistItemStyle
  mustBeInManual?: boolean
  evidence?: ChecklistEvidence[]
  supersededBy?: string
  links?: string[]
  reminder?: ChecklistReminder
  /** Who added the item, written by the office from the caller. Absent on an item added before 13 October 2026: nobody recorded who. */
  addedBy?: ParticipantRef
  /** The agents the office tells when the person marks the item done, in place of whoever added it. Absent means whoever added it. */
  tell?: ParticipantRef[]
  /** Present while the item is done because the person said so. */
  doneByThePerson?: ChecklistDoneByThePerson
  /**
   * THE OWNER'S OWN WORDS ON THE ITEM, wave 14a round 1, from a message. This is the passage the
   * owner writes when the press that marks the item done comes with one, kept exactly as written. Written by the item
   * door and never by a body, and only for the checklist's own owner.
   */
  response?: string
  /**
   * A STANDING ITEM: an entry the owner opens every session, such as the owner's
   * experiment manual. It has no done box, is never marked done and is never counted as open work. Stored only as true.
   */
  standing?: true
}

/** One participant the items name, with the name a page draws. */
export interface ChecklistNamed {
  who: ParticipantRef
  name: string
}

/**
 * ONE THING AN ITEM'S "DONE" MAY NAME AS ITS EVIDENCE, as the evidence picker offers it: the evidence itself,
 * ready to send, and the words a person picks it by. Nobody types an id; they pick one of these.
 */
export interface EvidenceChoice {
  evidence: ChecklistEvidence
  /** The record's title, or the landed entry's title for a commit. */
  title: string
  /** One short line under it: when, and for a commit its short hash; for a manual section its record. */
  detail: string
}

/** How many choices the picker is given at a time. */
export const EVIDENCE_CHOICES_PAGE = 25

/**
 * ONE RECORD AN ITEM NAMES, IN ITS LINKS OR ITS EVIDENCE, as the page draws it, which a decision of wave 13j
 * round 57 settled: its title, so a link says what it opens, and each block the item names in
 * it. A link holds only a record's id, so only a manual section names a block. A record that is not there has no title,
 * and neither has a message this reader may not read; the reading says which, in the words the item doors use.
 */
export type ChecklistLinked =
  | { id: string; found: true; kind: string; title: string; blocks: ChecklistLinkedBlock[] }
  | { id: string; found: false; because: 'no record' | 'no message you may read' }

/** One block an item names in a record. */
export interface ChecklistLinkedBlock {
  id: string
  /** What the block is called: its heading, or its first words. Null when the record holds no block with this id now. */
  name: string | null
}

/** One checklist as the doors return it, read by the server's doors and by the page. */
export interface ChecklistReading {
  id: string
  workspaceId: string
  title: string
  owner: ParticipantRef
  ownerName: string
  items: ChecklistRequest[]
  counts: ChecklistCounts
  /**
   * THE FLOWS THE OWNER IS IN THROUGH THIS CHECKLIST: one for each item that stands for a flow somebody entered, read
   * from the flow run the item links, in wave 13j round 52. Empty means no item stands for one.
   */
  flows: FlowOnAChecklist[]
  /** Every record the items name, once each, with its title. Empty means no item names one. */
  linked: ChecklistLinked[]
  /**
   * Every participant the items name, once each, with the name to draw: who added an item, who it tells, who marked it
   * done for the person and who was told. Empty means no item names one.
   */
  named: ChecklistNamed[]
  /**
   * EVERY PRESS UNDER THE GRANT A MARK NAMES (`ChecklistDoneByThePerson.press`), once each, with the reason its row
   * holds (wave 13s round 2a). A press whose row is not found is not here, and its line says no reason was written down.
   * Empty means no mark names one.
   */
  presses: ChecklistPress[]
  version: string
  updatedAt: string
}

/** One press under the grant a checklist mark names, and the reason its row holds, or null where it holds none. */
export interface ChecklistPress {
  id: string
  reason: string | null
}

// ============================================================================ the rules

/** One broken rule, with where it is. The shape is `ValidationError` in ./kinds/describe-value.ts. */
export interface ChecklistRuleBroken {
  path: string
  message: string
}

/** Whether a state is one an item has finished in. */
export function isClosed(state: unknown): boolean {
  return (CLOSED_ITEM_STATES as readonly unknown[]).includes(state)
}

/** The states a standing item may be in: open until a later message supersedes it. */
export const STANDING_ITEM_STATES: readonly ChecklistItemState[] = ['open', 'superseded']

/**
 * WHETHER AN ITEM IS WORK STILL TO DO: not finished, and not a standing item, which is never counted as open work by
 * one of the owner's decisions. Every count of open items reads this, so none can count a
 * standing item.
 */
export function isOpenWork(item: Pick<ChecklistRequest, 'state' | 'standing'>): boolean {
  return !isClosed(item.state) && item.standing !== true
}

/** How many items a checklist has of each sort. A standing item is counted as standing until it is superseded. */
export interface ChecklistCounts {
  open: number
  waitingOnTheOwner: number
  done: number
  superseded: number
  standing: number
}

/** The counts of one checklist's items, worked out here alone. */
export function checklistCounts(items: readonly ChecklistRequest[]): ChecklistCounts {
  return {
    open: items.filter(isOpenWork).length,
    waitingOnTheOwner: items.filter((item) => isOpenWork(item) && item.state === WAITING_ON_THE_OWNER).length,
    done: items.filter((item) => item.state === 'done').length,
    superseded: items.filter((item) => item.state === 'superseded').length,
    standing: items.filter((item) => item.standing === true && !isClosed(item.state)).length,
  }
}

/**
 * THE RULES ONE ITEM IS CHECKED AGAINST, ON EVERY WRITE PATH. `SHAPE_CROSS_CHECKS.ChecklistRequest` in
 * ./kinds/shape-cross-checks.ts calls this, so the doors, the browser and any other writer meet the same refusal.
 */
export function checklistItemRulesBroken(item: Record<string, unknown>, path: string): ChecklistRuleBroken[] {
  const out: ChecklistRuleBroken[] = []
  const evidence = Array.isArray(item['evidence']) ? (item['evidence'] as unknown[]) : []
  const state = item['state']
  // AN ITEM'S STYLE IS CHECKED BY ITS OWN FIELD DECLARATION (SHAPE_SPECS.ChecklistRequest, whose type is the two
  // values), not here: a value outside them is refused before any rule about more than one key is asked. An item
  // stored with no style is an item from before the styles, and reads as plain.
  // THE PERSON'S OWN "DONE" ASKS NO EVIDENCE: the item door writes the mark, and
  // only for the person's press, the person's words or the person's raise. Every other "done" still needs evidence.
  const byThePerson = item['doneByThePerson'] !== undefined
  if (state === 'done' && evidence.length === 0 && !byThePerson) {
    out.push({
      path: `${path}.evidence`,
      message:
        `${path} is "done" with no evidence. An agent's "done" needs evidence that it was done: a commit, a ` +
        'report, a manual section or a run. Add one to its evidence in the same change. Only the person marks an ' +
        "item done without evidence: by the person's own press, or by a message of the person's that names the item, " +
        'sent as onThePersonsWords.',
    })
  }
  if (byThePerson && state !== 'done') {
    out.push({
      path: `${path}.doneByThePerson`,
      message: `${path} says the person marked it done but is "${String(state)}". The mark is kept only while the item is done.`,
    })
  }
  // THE OWNER'S OWN WORDS ARE KEPT ONLY WHILE THE ITEM IS DONE, like the person's mark they arrived with.
  if (item['response'] !== undefined && state !== 'done') {
    out.push({
      path: `${path}.response`,
      message: `${path} holds the written response but is "${String(state)}". The words are kept only while the item is done.`,
    })
  }
  // A STANDING ITEM IS NEVER MARKED DONE, and it is never work in progress or waiting
  // on the owner either, since it is never counted as open work. It is open until a later message supersedes it.
  if (item['standing'] === true && !STANDING_ITEM_STATES.includes(state as ChecklistItemState)) {
    out.push({
      path: `${path}.state`,
      message:
        `${path} is a standing item and cannot be "${String(state)}". A standing item is never marked done and is never ` +
        'counted as open work, so it is "open" until a later message supersedes it. To mark it done, send ' +
        '"standing": false in the same change.',
    })
  }
  if (Array.isArray(item['tell'])) {
    if (item['tell'].length === 0) out.push({ path: `${path}.tell`, message: `${path} names nobody to tell. Leave tell out to tell whoever added the item.` })
    item['tell'].forEach((one, at) => {
      if (one === null || typeof one !== 'object' || (one as Record<string, unknown>)['kind'] !== 'agent') {
        out.push({ path: `${path}.tell[${String(at)}]`, message: `${path}.tell[${String(at)}] is not an agent. An item names agents to tell, and only agents.` })
      }
    })
  }
  if (state === 'done' && item['mustBeInManual'] === true && !byThePerson && !evidence.some((one) => isAManualSection(one))) {
    out.push({
      path: `${path}.evidence`,
      message:
        `${path} must be in the manual, and its evidence has no manual section. It can be done only once a manual ` +
        'section is linked: {"kind":"manual section","record":"<record id>","block":"<block id>"}.',
    })
  }
  if (state === 'superseded' && typeof item['supersededBy'] !== 'string') {
    out.push({
      path: `${path}.supersededBy`,
      message: `${path} is "superseded" and does not say by what. Name the later message in supersededBy.`,
    })
  }
  if (state !== 'superseded' && item['supersededBy'] !== undefined) {
    out.push({
      path: `${path}.supersededBy`,
      message: `${path} names a later message in supersededBy but is "${String(state)}". Only a superseded item names one.`,
    })
  }
  evidence.forEach((one, at) => {
    if (one === null || typeof one !== 'object') return
    out.push(...evidenceRulesBroken(one as Record<string, unknown>, `${path}.evidence[${String(at)}]`))
  })
  return out
}

function isAManualSection(one: unknown): boolean {
  return one !== null && typeof one === 'object' && (one as Record<string, unknown>)['kind'] === 'manual section'
}

/** One piece of evidence names exactly what its kind needs, and nothing it does not. */
function evidenceRulesBroken(one: Record<string, unknown>, path: string): ChecklistRuleBroken[] {
  const kind = one['kind']
  const has = (key: string): boolean => one[key] !== undefined
  if (kind === 'commit') {
    const commit = one['commit']
    if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) {
      return [{ path: `${path}.commit`, message: `${path} is a commit, so it needs commit: its hash, 7 to 40 lowercase hexadecimal characters.` }]
    }
    if (has('record') || has('block')) return [{ path, message: `${path} is a commit and names a record or a block. A commit names only its hash.` }]
    return []
  }
  if (typeof one['record'] !== 'string' || one['record'].trim() === '') {
    return [{ path: `${path}.record`, message: `${path} is a ${String(kind)}, so it needs record: the id of that record.` }]
  }
  if (has('commit')) return [{ path: `${path}.commit`, message: `${path} is a ${String(kind)} and names a commit. Only commit evidence names one.` }]
  if (kind === 'manual section' && (typeof one['block'] !== 'string' || one['block'].trim() === '')) {
    return [{ path: `${path}.block`, message: `${path} is a manual section, so it needs block: the id of that section's block in the record.` }]
  }
  if (kind !== 'manual section' && has('block')) {
    return [{ path: `${path}.block`, message: `${path} is a ${String(kind)} and names a block. Only a manual section names one.` }]
  }
  return []
}

// ============================================================================ the open items, said once

/** The open items of one owner, as the brief and the reminders say them. */
export interface OpenItems {
  /** How many items are open, in every checklist this owner has. */
  open: number
  /** The words of each item waiting on the owner, in the order they were read. */
  waitingOnTheOwner: string[]
}

/** How many of the waiting items are named by their words. The rest are counted. */
export const WAITING_NAMED = 5

/** An item's words, cut to one short line for a sentence that lists several, without its own full stop. */
function shortWords(words: string): string {
  const one = words.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '')
  return one.length <= 80 ? one : `${one.slice(0, 79)}…`
}

/**
 * THE ONE SENTENCE ABOUT AN OWNER'S OPEN ITEMS, or null when there are none. The brief after a
 * compaction, the 07:00 and 18:00 report reminders and the idle reminder all print this sentence,
 * so the three cannot say different things.
 */
export function theOpenItemsSentence(items: OpenItems): string | null {
  if (items.open === 0) return null
  const count = `Your checklists have ${String(items.open)} open item${items.open === 1 ? '' : 's'}.`
  const waiting = items.waitingOnTheOwner
  const named = waiting.slice(0, WAITING_NAMED).map((words) => `"${shortWords(words)}"`)
  const more = waiting.length > WAITING_NAMED ? `, and ${String(waiting.length - WAITING_NAMED)} more` : ''
  const waits =
    waiting.length === 0
      ? ' None is waiting on the owner.'
      : ` ${String(waiting.length)} ${waiting.length === 1 ? 'is' : 'are'} waiting on the owner: ${named.join('; ')}${more}.`
  return `${count}${waits} Read them with GET /api/checklists.`
}

// ============================================================================ the refusals

/** Why a checklist is refused at POST /api/records and every other general write door. */
export const A_CHECKLIST_IS_WRITTEN_BY_ITS_DOORS =
  'A checklist is written only through its own doors, so that its owner is written by the office and only its ' +
  'owner can switch an item\'s reminder on. Nothing was written.'

/** The same refusal with the doors named. */
export const THE_CHECKLIST_DOORS =
  'Make one with POST /api/checklists, read yours with GET /api/checklists and one with GET /api/checklists/<id>, ' +
  'change its title with PATCH /api/checklists/<id>, add an item with POST /api/checklists/<id>/items, change ' +
  'an item with PATCH /api/checklists/<id>/items/<item id>, and switch its reminder with PUT ' +
  '/api/checklists/<id>/items/<item id>/reminder.'
