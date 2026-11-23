// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * KEY ITEMS: WHO MAY WRITE ONE, ITS WRITES, AND THE READ HOME ASKS. Wave 13s round 281, point HD-2c of home as a data
 * dashboard. The kind is src/shared/kinds/key-item.ts, the shared words and read shapes src/shared/key-items.ts, and the
 * doors src/server/api/key-items.ts.
 *
 * ONLY THESE WRITES WRITE A KEY ITEM. `assertMayWrite` in ./records/may-write.ts refuses the kind unless
 * `asTheKeyItemDoors` (./key-item-door.ts) is around the write, so POST and PATCH /api/records refuse it, the person
 * included. Each write here checks its writer first: the person, or a secretary writing as itself with its own key.
 * The office writes who set the progress or made the estimate, and when, from the writer and its own clock.
 *
 * THE OPEN KEY ITEMS OF A PROJECT HOLD THE PLACES 1 TO THEIR COUNT, each once. Every write that adds, moves, closes or
 * opens one numbers the open ones of its project again, and writes a place only where it changed.
 *
 * THE READ READS ONLY KEY ITEMS AND THE PACKAGES THEY NAME, each package by its id, so home never loads every package
 * or every record. An estimate's earlier values are read from the key item's own history.
 */
import { z } from 'zod'

import {
  A_KEY_ITEM_TITLE_AT_MOST,
  daysAndHours,
  HOURS_LEFT_AT_MOST,
  KEY_ITEM_KIND,
  PACKAGES_OF_A_KEY_ITEM_AT_MOST,
  percentOf,
  PROGRESS_AT_MOST,
  WHO_MAY_WRITE_A_KEY_ITEM,
  type AKeyItemWritten,
  type AnEarlierEstimate,
  type APackageNotCounted,
  type KeyItemData,
  type KeyItemEstimate,
  type KeyItemPackage,
  type KeyItemProgress,
  type KeyItemRead,
  type KeyItemState,
  type KeyItemWho,
  type OneKeyItem,
  type TheKeyItems,
} from '@shared/key-items.ts'
import { isMoleOffice, MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD, type ParticipantRef } from '@shared/participants.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS } from '@shared/roles.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { sqlite } from '../db/client.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { thePointsDoneOf } from './delegation.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card-2.ts'
import { asTheKeyItemDoors } from './key-item-door.ts'
import { PanelError } from './panel-error.ts'
import { parse } from './parse.ts'
import { participantForActor } from './participant-for-actor.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, thePersonPressedItThemselves, type Actor } from './records.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { getRevision, listRevisions } from './revisions.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'

/** How many of a key item's newest revisions its read looks through for the estimates it has carried. */
export const ESTIMATE_REVISIONS_READ = 100

/** A whole number from 0 to `most`. */
const aWhole = (most: number) => z.number().int().min(0).max(most)

/** What POST /api/key-items takes. Who and when are written by the office, so a body that sends them is refused. */
export const A_NEW_KEY_ITEM = z.strictObject({
  title: z.string(),
  packages: z.array(z.string()).max(PACKAGES_OF_A_KEY_ITEM_AT_MOST).optional(),
  progress: aWhole(PROGRESS_AT_MOST).optional(),
  hoursLeft: aWhole(HOURS_LEFT_AT_MOST).optional(),
  place: z.number().int().min(1).optional(),
})

/** What PATCH /api/key-items/:id takes. A null clears a value, and with it who set it and when. */
export const A_KEY_ITEM_CHANGE = z.strictObject({
  title: z.string().optional(),
  packages: z.array(z.string()).max(PACKAGES_OF_A_KEY_ITEM_AT_MOST).nullable().optional(),
  progress: aWhole(PROGRESS_AT_MOST).nullable().optional(),
  hoursLeft: aWhole(HOURS_LEFT_AT_MOST).nullable().optional(),
})

/** What POST /api/key-items/:id/place takes. */
export const A_PLACE = z.strictObject({ place: z.number().int().min(1) })

/** What close and reopen take: nothing. */
export const NOTHING = z.strictObject({})

/** A refusal of this write, in words that say nothing was written. */
function refuse(words: string, status = 400): PanelError {
  return new PanelError(`${words} Nothing was written.`, status)
}

/**
 * WHETHER THIS CALLER MAY WRITE A KEY ITEM, refused in words that say who may. The person's own press passes, and so
 * does a caller holding the person's authority in a test world. Otherwise the caller is an agent holding the secretary
 * card, not retired, proved by its own key, and with no signed item. It is the department's check
 * (./grant/departments.ts) without the warrant, because a secretary keeps key items as itself.
 */
export function checkWhoWritesAKeyItem(actor: Actor): void {
  if (thePersonPressedItThemselves(actor)) return
  // INSIDE A TEST WORLD, ITS STARTER AND ITS SECRETARIES WRITE AS THE PERSON DOES. Rule 5 of chapter 8. The field is
  // absent in the office, which is never a test world.
  if (actor.theOwnersAuthority?.holds === true) return
  const who = WHO_MAY_WRITE_A_KEY_ITEM
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
    throw refuse(`${holds}, and no agent but a secretary writes a key item. ${who}`, 403)
  }
  if (actor.provedBy !== 'an-agent-key') {
    throw refuse(`A secretary writes a key item using its own key, and this request was not proved by it. ${who}`, 403)
  }
  if (actor.signedItem !== undefined) throw refuse(`A signed package item does not write a key item. ${who}`, 403)
}

/** The participant writing, as the office stores who set a value. A writer it cannot name is refused, not guessed. */
function theWriterOf(actor: Actor): ParticipantRef {
  const writer = participantForActor(actor)
  if (writer === null) {
    throw refuse(`The office could not tell which person or agent is writing, so it cannot write who set the value. ${WHO_MAY_WRITE_A_KEY_ITEM}`, 403)
  }
  return writer
}

/** The key item `id` names in this project, or a 404 or 400 that says why it is not one. */
export function theKeyItemAt(id: string, workspaceId: string): PanelRecord {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== KEY_ITEM_KIND) {
    throw new PanelError(`${record.id} is a ${kindWord(record.kind).text}, not a key item. GET /api/key-items lists the key items of this project.`, 400)
  }
  if (record.deletedAt !== null) {
    throw new PanelError(`"${record.title}" was deleted, so it is not one of this project's key items now.`, 404)
  }
  return record
}

/** A title as it is stored: the words sent, without the spaces around them, on one line and not too long. */
function aTitle(sent: string): string {
  const title = sent.trim()
  if (title === '') throw refuse('A key item needs a title.')
  if (/[\r\n]/.test(title)) throw refuse('A key item title is one line.')
  if (title.length > A_KEY_ITEM_TITLE_AT_MOST) throw refuse(`A key item title is at most ${String(A_KEY_ITEM_TITLE_AT_MOST)} characters.`)
  return title
}

/** Why a package was not counted, in the words a refused write says. */
function whyNotCounted(id: string, because: APackageNotCounted): string {
  switch (because) {
    case 'no-record':
      return `No record has the id ${id}.`
    case 'deleted':
      return `${id} was deleted.`
    case 'no-package':
      return `${id} is not a task holding a package with points.`
    case 'another-project':
      return `${id} is in another project, and a key item names only packages of its own project.`
  }
}

/** The packages a write names, each once, each a task of this project that holds a package with points. */
function thePackages(sent: readonly string[], workspaceId: string): string[] {
  const seen = new Set<string>()
  for (const id of sent) {
    if (seen.has(id)) throw refuse(`${id} is named twice. A key item names each package once.`)
    seen.add(id)
    const counted = countThePackage(id, workspaceId)
    if ('notCounted' in counted) throw refuse(`A key item names packages it can count. ${whyNotCounted(id, counted.notCounted)}`)
  }
  return [...sent]
}

/** The words a write says when it would leave a key item with packages and a set progress together. */
const PACKAGES_OR_A_SET_PROGRESS =
  'A key item that names packages counts its progress from their points, so it carries no progress of its own. ' +
  'Send "progress": null with the packages, or leave the packages out.'

/** One key item row as the read takes it. */
interface AKeyItemRow {
  id: string
  title: string
  workspaceId: string
  data: KeyItemData
  updatedAt: string
}

/** The stored row as the statements below hand it back. */
interface AStoredRow {
  id: string
  title: string
  workspaceId: string
  data: string
  updatedAt: string
}

const toRow = (stored: AStoredRow): AKeyItemRow => ({ ...stored, data: JSON.parse(stored.data) as KeyItemData })

/** The live key items in one state, of one project or, with null, of every project. Only key items are read. */
function theRowsOf(state: KeyItemState, workspaceId: string | null): AKeyItemRow[] {
  const statement =
    'SELECT id, title, workspace_id AS workspaceId, data, updated_at AS updatedAt FROM records ' +
    "WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = ?" +
    (workspaceId === null ? '' : ' AND workspace_id = ?')
  const values = workspaceId === null ? [KEY_ITEM_KIND, state] : [KEY_ITEM_KIND, state, workspaceId]
  return (sqlite.prepare(statement).all(...values) as AStoredRow[]).map(toRow)
}

/** One key item row by its id. */
function theRowOf(id: string): AKeyItemRow {
  const stored = sqlite
    .prepare('SELECT id, title, workspace_id AS workspaceId, data, updated_at AS updatedAt FROM records WHERE id = ? AND kind = ?')
    .get(id, KEY_ITEM_KIND) as AStoredRow | undefined
  if (stored === undefined) throw new PanelError(`No key item has the id ${id}.`, 404)
  return toRow(stored)
}

const byProject = (a: AKeyItemRow, b: AKeyItemRow): number => (a.workspaceId < b.workspaceId ? -1 : a.workspaceId > b.workspaceId ? 1 : 0)
const byId = (a: AKeyItemRow, b: AKeyItemRow): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Open ones by their place, a row with no place last; then by id, so two rows that share a place keep one order. */
function inTheirOrder(a: AKeyItemRow, b: AKeyItemRow): number {
  const placeA = a.data.place ?? Number.MAX_SAFE_INTEGER
  const placeB = b.data.place ?? Number.MAX_SAFE_INTEGER
  return byProject(a, b) || placeA - placeB || byId(a, b)
}

/** Closed ones last changed first. */
function lastClosedFirst(a: AKeyItemRow, b: AKeyItemRow): number {
  return byProject(a, b) || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) || byId(a, b)
}

/** The open key items of one project in their order. */
const theOpenOrderOf = (workspaceId: string): AKeyItemRow[] => theRowsOf('open', workspaceId).sort(inTheirOrder)

/** Give each row the place it stands at, from `first`, writing only the places that change. */
function placeEach(rows: readonly AKeyItemRow[], first: number, actor: Actor): void {
  rows.forEach((row, index) => {
    if (row.data.place !== first + index) patchRecord(row.id, { dataPatch: { place: first + index } }, actor)
  })
}

/** Run one write as the key item doors, in one transaction. */
const asOneWrite = <T>(write: () => T): T => asTheKeyItemDoors(() => sqlite.transaction(write).immediate())

/** What a write answers: the key item as read after it, what the write did, and the record. */
function written(id: string, did: AKeyItemWritten['written'], nothingWritten?: string): AKeyItemWritten {
  const record = getRecord(id)
  if (record === null) throw new PanelError(`The key item ${id} was written and then could not be read.`, 500)
  return { ...oneKeyItem(id), written: did, record, ...(nothingWritten === undefined ? {} : { nothingWritten }) }
}

/** Files a key item in this project, at the end of the order or at the place sent. */
export function fileAKeyItem(body: unknown, workspaceId: string, actor: Actor): AKeyItemWritten {
  checkWhoWritesAKeyItem(actor)
  const sent = parse(A_NEW_KEY_ITEM, body ?? {}, 'A key item:')
  const title = aTitle(sent.title)
  const packages = thePackages(sent.packages ?? [], workspaceId)
  if (packages.length > 0 && sent.progress !== undefined) throw refuse(PACKAGES_OR_A_SET_PROGRESS)
  const writer = theWriterOf(actor)
  return asOneWrite(() => {
    const open = theOpenOrderOf(workspaceId)
    const place = sent.place ?? open.length + 1
    if (place > open.length + 1) {
      throw refuse(`This project has ${String(open.length)} open key items, so a new one takes a place from 1 to ${String(open.length + 1)}.`)
    }
    const at = nowStamp()
    const data: KeyItemData = { state: 'open', place }
    if (packages.length > 0) data.packages = packages
    if (sent.progress !== undefined) Object.assign(data, { progress: sent.progress, progressSetBy: writer, progressSetAt: at })
    if (sent.hoursLeft !== undefined) Object.assign(data, { hoursLeft: sent.hoursLeft, estimatedBy: writer, estimatedAt: at })
    placeEach(open.slice(0, place - 1), 1, actor)
    placeEach(open.slice(place - 1), place + 1, actor)
    const record = createRecord({ kind: KEY_ITEM_KIND, title, data: { ...data }, workspaceId, actor })
    return written(record.id, 'created')
  })
}

/** Changes a key item's title, packages, set progress or estimate. Sending an estimate writes who made it and when. */
export function changeAKeyItem(id: string, body: unknown, workspaceId: string, actor: Actor): AKeyItemWritten {
  const record = theKeyItemAt(id, workspaceId)
  checkWhoWritesAKeyItem(actor)
  const sent = parse(A_KEY_ITEM_CHANGE, body ?? {}, 'A change to a key item:')
  if (Object.keys(sent).length === 0) throw refuse('A change names at least one of title, packages, progress and hoursLeft.')
  const stored = record.data as Partial<KeyItemData>
  const title = sent.title === undefined ? undefined : aTitle(sent.title)
  const packages = sent.packages === undefined ? undefined : thePackages(sent.packages ?? [], workspaceId)
  const packagesAfter = packages ?? stored.packages ?? []
  const progressAfter = sent.progress === undefined ? stored.progress : sent.progress
  if (packagesAfter.length > 0 && progressAfter !== undefined && progressAfter !== null) throw refuse(PACKAGES_OR_A_SET_PROGRESS)
  const writer = theWriterOf(actor)
  return asOneWrite(() => {
    const at = nowStamp()
    const dataPatch: Record<string, unknown> = {}
    if (packages !== undefined) dataPatch.packages = packages.length === 0 ? null : packages
    if (sent.progress === null) Object.assign(dataPatch, { progress: null, progressSetBy: null, progressSetAt: null })
    else if (sent.progress !== undefined) Object.assign(dataPatch, { progress: sent.progress, progressSetBy: writer, progressSetAt: at })
    if (sent.hoursLeft === null) Object.assign(dataPatch, { hoursLeft: null, estimatedBy: null, estimatedAt: null })
    else if (sent.hoursLeft !== undefined) Object.assign(dataPatch, { hoursLeft: sent.hoursLeft, estimatedBy: writer, estimatedAt: at })
    const patch = { ...(title === undefined ? {} : { title }), ...(Object.keys(dataPatch).length === 0 ? {} : { dataPatch }) }
    const { newSeq } = patchRecord(record.id, patch, actor)
    return newSeq === null
      ? written(record.id, 'nothing changed', nothingWrittenSentence({ kind: 'already-stored' }))
      : written(record.id, 'changed')
  })
}

/** Moves an open key item to a place in its project's order; the ones between move by one. */
export function moveAKeyItem(id: string, body: unknown, workspaceId: string, actor: Actor): AKeyItemWritten {
  const record = theKeyItemAt(id, workspaceId)
  checkWhoWritesAKeyItem(actor)
  const { place } = parse(A_PLACE, body ?? {}, 'A place for a key item:')
  return asOneWrite(() => {
    const open = theOpenOrderOf(workspaceId)
    const at = open.findIndex((row) => row.id === record.id)
    if (at === -1) throw refuse(`"${record.title}" is closed, so it has no place in the order. POST /api/key-items/${record.id}/reopen opens it again at the end.`)
    if (place > open.length) throw refuse(`This project has ${String(open.length)} open key items, so a place is from 1 to ${String(open.length)}.`)
    if (place === at + 1 && open[at]!.data.place === place) {
      return written(record.id, 'nothing changed', nothingWrittenSentence({ kind: 'already-stored' }))
    }
    const order = open.filter((row) => row.id !== record.id)
    order.splice(place - 1, 0, open[at]!)
    placeEach(order, 1, actor)
    return written(record.id, 'moved')
  })
}

/** Closes a key item. It leaves the order, and the open ones after it move up by one. */
export function closeAKeyItem(id: string, body: unknown, workspaceId: string, actor: Actor): AKeyItemWritten {
  const record = theKeyItemAt(id, workspaceId)
  checkWhoWritesAKeyItem(actor)
  parse(NOTHING, body ?? {}, 'Closing a key item:')
  return asOneWrite(() => {
    if (theRowOf(record.id).data.state === 'closed') {
      return written(record.id, 'nothing changed', nothingWrittenSentence({ kind: 'already-stored' }))
    }
    patchRecord(record.id, { dataPatch: { state: 'closed', place: null } }, actor)
    placeEach(theOpenOrderOf(workspaceId), 1, actor)
    return written(record.id, 'closed')
  })
}

/** Opens a closed key item again, at the end of its project's order. */
export function reopenAKeyItem(id: string, body: unknown, workspaceId: string, actor: Actor): AKeyItemWritten {
  const record = theKeyItemAt(id, workspaceId)
  checkWhoWritesAKeyItem(actor)
  parse(NOTHING, body ?? {}, 'Opening a key item again:')
  return asOneWrite(() => {
    if (theRowOf(record.id).data.state === 'open') {
      return written(record.id, 'nothing changed', nothingWrittenSentence({ kind: 'already-stored' }))
    }
    const open = theOpenOrderOf(workspaceId)
    placeEach(open, 1, actor)
    patchRecord(record.id, { dataPatch: { state: 'open', place: open.length + 1 } }, actor)
    return written(record.id, 'opened again')
  })
}

/** A stored participant, or null where the stored value is not one. */
function aParticipant(value: unknown): ParticipantRef | null {
  if (typeof value !== 'object' || value === null) return null
  const { kind, id } = value as { kind?: unknown; id?: unknown }
  return (kind === 'person' || kind === 'agent') && typeof id === 'string' ? { kind, id } : null
}

/** Who the office wrote, with the handle where it is an agent. */
function whoOf(ref: ParticipantRef): KeyItemWho {
  return { ...ref, handle: ref.kind === 'agent' ? (theAgentRowAnIdNames(ref.id)?.handle ?? null) : null }
}

/**
 * A VALUE THAT CARRIES NO WHO OR WHEN WAS NOT WRITTEN BY THESE DOORS, which always write both. The read fails loudly
 * on one, naming the key item, rather than show a figure nobody can be named for.
 */
function writtenWithoutWho(row: AKeyItemRow, what: string): PanelError {
  return new PanelError(`The key item ${row.id} carries ${what} with no record of who set it or when, which its doors always write.`, 500)
}

/** One package a key item names, counted by its points, or why it was not counted. Only that package is read. */
function countThePackage(id: string, workspaceId: string): KeyItemPackage {
  const row = sqlite
    .prepare('SELECT id, title, kind, workspace_id AS workspaceId, deleted_at AS deletedAt, data FROM records WHERE id = ?')
    .get(id) as { id: string; title: string; kind: string; workspaceId: string; deletedAt: string | null; data: string } | undefined
  if (row === undefined) return { id, notCounted: 'no-record' }
  if (row.deletedAt !== null) return { id, notCounted: 'deleted' }
  if (row.workspaceId !== workspaceId) return { id, notCounted: 'another-project' }
  const points = row.kind === 'task' ? thePointsDoneOf(JSON.parse(row.data)) : null
  return points === null ? { id, notCounted: 'no-package' } : { id, title: row.title, ...points }
}

function theProgressOf(row: AKeyItemRow): KeyItemProgress {
  const packages = row.data.packages ?? []
  if (packages.length > 0) {
    const counted = packages.map((id) => countThePackage(id, row.workspaceId))
    let done = 0
    let of = 0
    for (const one of counted) {
      if ('notCounted' in one) continue
      done += one.done
      of += one.of
    }
    return { from: 'packages', done, of, percent: percentOf(done, of), packages: counted }
  }
  if (row.data.progress === undefined) return { from: 'not-set' }
  const setBy = aParticipant(row.data.progressSetBy)
  if (setBy === null || typeof row.data.progressSetAt !== 'string') throw writtenWithoutWho(row, 'a progress')
  return { from: 'set', percent: row.data.progress, setBy: whoOf(setBy), setAt: row.data.progressSetAt }
}

function theEstimateOf(row: AKeyItemRow): KeyItemEstimate {
  if (row.data.hoursLeft === undefined) return { state: 'not-estimated' }
  const estimatedBy = aParticipant(row.data.estimatedBy)
  if (estimatedBy === null || typeof row.data.estimatedAt !== 'string') throw writtenWithoutWho(row, 'an estimate')
  const hoursLeft = row.data.hoursLeft
  return { state: 'estimated', hoursLeft, ...daysAndHours(hoursLeft), estimatedBy: whoOf(estimatedBy), estimatedAt: row.data.estimatedAt }
}

/** One key item as the doors and home read it. `projectTitles` keeps each project's title read once. */
function readTheItem(row: AKeyItemRow, projectTitles: Map<string, string | null>): KeyItemRead {
  if (!projectTitles.has(row.workspaceId)) projectTitles.set(row.workspaceId, getWorkspace(row.workspaceId)?.title ?? null)
  return {
    id: row.id,
    title: row.title,
    project: { id: row.workspaceId, title: projectTitles.get(row.workspaceId) ?? null },
    state: row.data.state,
    place: row.data.state === 'open' ? (row.data.place ?? null) : null,
    packages: row.data.packages ?? [],
    progress: theProgressOf(row),
    estimate: theEstimateOf(row),
  }
}

/**
 * THE KEY ITEMS OF THIS PROJECT OR OF EVERY PROJECT, open ones by default, as home reads them. Open ones come in their
 * order and closed ones last closed first; with every project, project by project, by the project's id.
 */
export function theKeyItems(workspaceId: string, asked: { projects: 'this' | 'every'; state: KeyItemState }): TheKeyItems {
  const rows = theRowsOf(asked.state, asked.projects === 'every' ? null : workspaceId)
  rows.sort(asked.state === 'open' ? inTheirOrder : lastClosedFirst)
  const projectTitles = new Map<string, string | null>()
  return { projects: asked.projects, state: asked.state, items: rows.map((row) => readTheItem(row, projectTitles)) }
}

/**
 * EACH ESTIMATE A KEY ITEM HAS CARRIED, newest first, read from its newest `ESTIMATE_REVISIONS_READ` revisions. A
 * revision that carries the same estimate as the one before it, as a move or a change of title does, adds none.
 */
function theEstimatesOf(id: string): { estimates: AnEarlierEstimate[]; revisionsNotRead: number } {
  const listing = listRevisions(id, ESTIMATE_REVISIONS_READ)
  const estimates: AnEarlierEstimate[] = []
  let last: string | null = null
  for (const entry of [...listing.revisions].reverse()) {
    const data = getRevision(id, entry.seq).content.data as Partial<KeyItemData>
    const by = aParticipant(data.estimatedBy)
    if (typeof data.hoursLeft !== 'number' || by === null || typeof data.estimatedAt !== 'string') {
      last = null
      continue
    }
    const same = JSON.stringify([data.hoursLeft, data.estimatedAt, by.kind, by.id])
    if (same === last) continue
    last = same
    estimates.push({ seq: entry.seq, hoursLeft: data.hoursLeft, estimatedBy: whoOf(by), estimatedAt: data.estimatedAt })
  }
  return { estimates: estimates.reverse(), revisionsNotRead: listing.count - listing.revisions.length }
}

/** One key item, and each estimate it has carried. */
export function oneKeyItem(id: string): OneKeyItem {
  const row = theRowOf(id)
  return { item: readTheItem(row, new Map()), ...theEstimatesOf(id) }
}
