// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DECISION NAMES AT THE DOOR, WHAT THE WRITE'S ANSWER SAYS ABOUT IT, AND THE REMINDER WHEN NO PAGE FITS.
 *
 * The fields and the reader are in src/shared/what-a-record-names.ts and src/shared/governs.ts. This file holds:
 *   - `assertTheDecisionNamesWhatItGoverns`, which a decision door asks before anything is written. It refuses a
 *     decision that names no page, no whole project and no nothingFits entry, as `replaces` is refused. It also refuses
 *     an empty governs, a path in governs, the whole project beside other entries, and a nearest page that is not live;
 *   - `whatTheWriteNames`, the part of a write's answer that reminds and never refuses: a decision that names only the
 *     whole project, with files that lie in a module's stated files, is told to name that module; and each new
 *     nothingFits entry is sent to one receiver at once, and the answer says to whom or why nobody.
 * A report is never refused here. Its finish hold is in ./before-the-seal-rules.ts, and its nightly list in ./governs.ts.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { isDeepStrictEqual } from 'node:util'
import { blockIdsOf } from '@shared/blocks.ts'
import { GOVERNS_FIELD, theGovernedPlaces } from '@shared/governs.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { CodedRefusal, DecisionNamesRefusalCode, RefusalValues } from '@shared/refusal-codes.ts'
import {
  GOVERNS_FILES_FIELD,
  MISSING_KIND_NOT_SAID,
  NOTHING_FITS_FIELD,
  PAGE_KINDS,
  WHOLE_PROJECT_KEY,
  isAPageKind,
  theNothingFitsEntries,
  type ANothingFitsEntry,
} from '@shared/what-a-record-names.ts'
import { kindWord } from '@shared/words.ts'
import { db } from '../db/client.ts'
import { links, records } from '../db/schema.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theModuleReminderSecretaries } from './module-reminder-secretaries.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records.ts'
import { moduleFor } from './sourceindex.ts'
import { theOneAgent } from './stale-records.ts'

function refuse<C extends DecisionNamesRefusalCode>(code: C, values: RefusalValues<C>): never {
  throw new PanelError(sayInEnglish(`server.${code}`, values as Record<string, string>), 400, undefined, undefined, undefined, { code, values } as CodedRefusal)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Does this write send one of the three fields a decision names what it governs by? A patch is checked only then. */
export function sendsWhatItNames(sent: Record<string, unknown>): boolean {
  return GOVERNS_FIELD in sent || GOVERNS_FILES_FIELD in sent || NOTHING_FITS_FIELD in sent
}

/**
 * A DECISION NAMES WHAT IT GOVERNS, OR SAYS NO PAGE FITS. `after` is the decision's data as it would be stored; `sent`
 * is what this write sends: the whole data at create, the patch's own keys at a patch. The checks run in this order,
 * and each refusal says what to send instead. Nothing is written when one refuses.
 */
export function assertTheDecisionNamesWhatItGoverns(after: Record<string, unknown>, sent: Record<string, unknown>, workspaceId: string): void {
  const sentGoverns = sent[GOVERNS_FIELD]
  if (Array.isArray(sentGoverns)) {
    for (const one of sentGoverns as unknown[]) {
      if (!isObject(one) || typeof one['record'] === 'string' || one['wholeProject'] === true) continue
      if (typeof one['path'] === 'string' && one['path'].trim() !== '') refuse('decisionGovernsNamesAPath', { path: one['path'].trim() })
    }
    if (sentGoverns.length === 0) refuse('decisionGovernsIsEmpty', {})
  }
  const parts = theGovernedPlaces(after[GOVERNS_FIELD])
  const entries = Array.isArray(after[GOVERNS_FIELD]) ? (after[GOVERNS_FIELD] as unknown[]).length : 0
  if (parts.wholeProject && entries > 1) refuse('decisionGovernsTheWholeProjectBesideOthers', {})
  const fits = theNothingFitsEntries(after[NOTHING_FITS_FIELD])
  if (parts.records.length === 0 && !parts.wholeProject && fits.length === 0) refuse('decisionNamesNothingItGoverns', {})
  for (const one of theNothingFitsEntries(sent[NOTHING_FITS_FIELD])) {
    if (one.nearest !== undefined && theLivePage(one.nearest, workspaceId) === null) refuse('decisionNearestIsNotALivePage', { nearest: one.nearest })
  }
}

/** One live page of this project, or null. */
function theLivePage(id: string, workspaceId: string): { id: string; kind: string; title: string; data: Record<string, unknown> } | null {
  const row = db
    .select({ id: records.id, kind: records.kind, title: records.title, data: records.data, workspaceId: records.workspaceId })
    .from(records)
    .where(and(eq(records.id, id), isNull(records.deletedAt)))
    .get()
  if (row === undefined || row.workspaceId !== workspaceId || !isAPageKind(row.kind)) return null
  return { id: row.id, kind: row.kind, title: row.title, data: isObject(row.data) ? row.data : {} }
}

/** The modules a write's answer tells a whole-project decision to name, or why none is named. */
export type TheModulesToName =
  | { found: { id: string; title: string; files: string[] }[] }
  | { notRead: string }

/** One reminder of a new nothingFits entry, as the write's answer gives it. */
export interface ANothingFitsReminder {
  entry: ANothingFitsEntry
  /** The agent it went to, or null when nobody could be reminded. */
  sentTo: { id: string; handle: string } | null
  /** The message written, or null. */
  message: string | null
  says: string
}

/** What a write's answer says about what the record names. Absent from the answer when there is nothing to say. */
export interface WhatTheWriteNames {
  says: string[]
  modulesToName?: TheModulesToName
  reminders?: ANothingFitsReminder[]
}

/**
 * THE MODULES A WHOLE-PROJECT DECISION SHOULD NAME: when the decision names only the whole project
 * and its governsFiles lie in modules' stated files, the most specific claim of each file names a module. Null when the
 * decision is not whole-project only, or names no file. When the source index was never built, nothing was read, and
 * the answer says that rather than that nothing was found.
 */
export function theModulesItShouldName(data: Record<string, unknown>, workspaceId: string): TheModulesToName | null {
  const parts = theGovernedPlaces(data[GOVERNS_FIELD], data[GOVERNS_FILES_FIELD])
  if (!parts.wholeProject || parts.records.length > 0 || parts.files.length === 0) return null
  const found = new Map<string, { id: string; title: string; files: string[] }>()
  for (const file of parts.files) {
    let claims: ReturnType<typeof moduleFor>
    try {
      claims = moduleFor(file, workspaceId)
    } catch (error) {
      // THE INDEX WAS NEVER BUILT, OR CANNOT BE READ: `moduleFor` refuses, and nothing was read for any file.
      if (error instanceof PanelError) return { notRead: error.message }
      throw error
    }
    const first = claims[0]
    if (first === undefined) continue
    const one = found.get(first.moduleId) ?? { id: first.moduleId, title: first.moduleTitle, files: [] }
    one.files.push(file)
    found.set(first.moduleId, one)
  }
  return { found: [...found.values()] }
}

/** The answer's sentence for the modules to name. Exported so a test reads the words from here. */
export function theModulesToNameSaid(modules: TheModulesToName): string {
  if ('notRead' in modules) {
    return (
      'This decision names only the whole project. The source index could not be read, so no module\'s stated files ' +
      `were read, and nothing was found or ruled out: ${modules.notRead} The decision was written.`
    )
  }
  if (modules.found.length === 0) {
    return 'This decision names only the whole project. No module\'s stated files hold its governsFiles. The decision was written.'
  }
  const named = modules.found.map((one) => `module ${one.id} ("${one.title}"), which holds ${one.files.join(', ')}`).join('; ')
  return (
    `This decision names only the whole project, and its governsFiles lie in the stated files of ${named}. ` +
    `Name ${modules.found.length === 1 ? 'that module' : 'each of those modules'} in governs instead, as a record. ` +
    'This is a reminder: the decision was written.'
  )
}

/** Who receives one reminder, and why; or nobody, and why. */
export type TheReceiver =
  | { agent: { id: string; handle: string }; because: string; owningLines: string[] }
  | { nobody: string; owningLines: string[] }

/** The module's owner, when the owner is one live agent; else the stored name that is not an address, or nothing. */
function theOwnerOf(module: { data: Record<string, unknown> }): { agent: { id: string; handle: string } } | { notAnAddress: string } | null {
  const owner = module.data['owner']
  if (!isObject(owner) || owner['kind'] !== 'agent' || typeof owner['id'] !== 'string' || owner['id'].trim() === '') return null
  const agent = theOneAgent(owner['id'])
  return typeof agent === 'string' ? { notAnAddress: owner['id'] } : { agent: { id: agent.id, handle: agent.handle } }
}

/** The live modules of this project that implement any of these blocks, by title and then by id. */
function theModulesImplementing(blockIds: readonly string[], workspaceId: string): { id: string; title: string; data: Record<string, unknown> }[] {
  if (blockIds.length === 0) return []
  const rows = db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(links)
    .innerJoin(records, eq(links.fromId, records.id))
    .where(
      and(
        eq(links.type, 'implements'),
        inArray(links.toId, [...blockIds]),
        eq(records.kind, 'module'),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
      ),
    )
    .all()
  const once = new Map(rows.map((row) => [row.id, { id: row.id, title: row.title, data: isObject(row.data) ? row.data : {} }]))
  return [...once.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

/**
 * WHO IS REMINDED OF ONE NOTHINGFITS ENTRY: the first of the nearest module's owner; the owner of the first module, by
 * title and then id, that implements the nearest pipeline or block; the project's module reminder secretary; else
 * nobody, with the reason. An owner stored by a name that answers to no one agent is not an address: it is passed over,
 * and the message to whoever receives it names that owning line.
 */
export function theReceiverOf(entry: ANothingFitsEntry, workspaceId: string): TheReceiver {
  const owningLines: string[] = []
  const nearest = entry.nearest === undefined ? null : theLivePage(entry.nearest, workspaceId)
  const modules =
    nearest === null
      ? []
      : nearest.kind === 'module'
        ? [nearest]
        : nearest.kind === 'block'
          ? theModulesImplementing([nearest.id], workspaceId)
          : nearest.kind === 'pipeline'
            ? theModulesImplementing(blockIdsOf({ data: nearest.data }), workspaceId)
            : []
  for (const module of modules) {
    const owner = theOwnerOf(module)
    if (owner === null) continue
    if ('notAnAddress' in owner) {
      if (!owningLines.includes(owner.notAnAddress)) owningLines.push(owner.notAnAddress)
      continue
    }
    const because =
      nearest !== null && nearest.id === module.id
        ? `you own module ${module.id} ("${module.title}"), the nearest page`
        : `you own module ${module.id} ("${module.title}"), which implements ${kindWord(nearest!.kind).text} ${nearest!.id}, the nearest page`
    return { agent: owner.agent, because, owningLines }
  }
  const inForce = theModuleReminderSecretaries().projects.find((one) => one.project === workspaceId)?.inForce
  if (inForce === undefined) return { nobody: `the project ${workspaceId} is not in the reading of who is reminded about modules`, owningLines }
  if (inForce.from === 'nobody named') return { nobody: `no module reminder secretary is named for ${workspaceId}`, owningLines }
  if (inForce.from === 'set here, cannot remind') {
    return { nobody: `the module reminder secretary set for ${workspaceId}, ${inForce.storedName}, is ${inForce.cannotBecause}`, owningLines }
  }
  if (inForce.from === '.env line unreadable') return { nobody: 'the line in .env that names the module reminder secretaries cannot be read', owningLines }
  const agent = inForce.from === 'set here' ? inForce.agent : theOneAgent(inForce.handle)
  if (typeof agent === 'string') return { nobody: agent, owningLines }
  return { agent: { id: agent.id, handle: agent.handle }, because: `you are the module reminder secretary of ${workspaceId}`, owningLines }
}

/** The message to the receiver of one entry. Exported so a test reads the words from here. */
export function theNothingFitsMessage(
  record: { id: string; kind: string; title: string },
  entry: ANothingFitsEntry,
  receiver: Extract<TheReceiver, { agent: unknown }>,
): string {
  const lines = receiver.owningLines
  return [
    `The ${kindWord(record.kind).text} ${record.id}, "${record.title}", says no page fits it. The missing kind is ${entry.missing}. It is about ${entry.what}.`,
    entry.nearest === undefined ? 'It names no nearest page.' : `The nearest page it names is ${entry.nearest}.`,
    `This came to you because ${receiver.because}.`,
    ...(lines.length > 0 ? [`The page is owned by ${lines.join(', ')}, which is not an address, so this came to you in its place.`] : []),
    `If a page should exist, make it, and name it on the ${kindWord(record.kind).text}. Mole Office says this once for each entry, and it blocks nothing.`,
  ].join(' ')
}

/** The answer's sentence for one reminder. Exported so a test reads the words from here. */
export function theReminderSaid(reminder: Pick<ANothingFitsReminder, 'entry' | 'sentTo' | 'message'>, nobody?: string): string {
  const which = `the nothingFits entry for a missing ${reminder.entry.missing}`
  return reminder.sentTo !== null && reminder.message !== null
    ? `A reminder of ${which} went to ${reminder.sentTo.handle}, message ${reminder.message}.`
    : `Nobody was reminded of ${which}: ${nobody ?? 'nobody could be named'}. Nothing else was stored.`
}

/** The entries of `after` that `before` did not hold. A patch that adds one entry sends a line for that entry only. */
export function theNewEntries(before: unknown, after: unknown): ANothingFitsEntry[] {
  const old = theNothingFitsEntries(before)
  return theNothingFitsEntries(after).filter((one) => !old.some((was) => isDeepStrictEqual(was, one)))
}

/**
 * WHAT THE WRITE'S ANSWER SAYS, AND THE REMINDERS IT SENDS. Called once the record is written, with the data before
 * (null at create) and after. It reminds and never refuses. Returns null when there is nothing to say.
 */
export function whatTheWriteNames(
  record: { id: string; kind: string; title: string; workspaceId: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  by: Actor,
): WhatTheWriteNames | null {
  if (record.kind !== 'decision' && record.kind !== 'report') return null
  const says: string[] = []
  const out: WhatTheWriteNames = { says }
  if (record.kind === 'decision') {
    const modules = theModulesItShouldName(after, record.workspaceId)
    if (modules !== null) {
      out.modulesToName = modules
      says.push(theModulesToNameSaid(modules))
    }
  }
  const added = theNewEntries(before?.[NOTHING_FITS_FIELD], after[NOTHING_FITS_FIELD])
  if (added.length > 0) {
    out.reminders = added.map((entry) => {
      const receiver = theReceiverOf(entry, record.workspaceId)
      if ('nobody' in receiver) {
        const reminder = { entry, sentTo: null, message: null }
        return { ...reminder, says: theReminderSaid(reminder, receiver.nobody) }
      }
      const sent = writeASystemLineToOne(
        { kind: 'agent', id: receiver.agent.id },
        record.workspaceId,
        SYSTEM_LINES.nothingFitsAPage(theNothingFitsMessage(record, entry, receiver)),
        by,
        undefined,
        { nothingFits: { record: record.id } },
      )
      const reminder = { entry, sentTo: receiver.agent, message: sent.id }
      return { ...reminder, says: theReminderSaid(reminder) }
    })
    says.push(...out.reminders.map((one) => one.says))
  }
  return says.length === 0 ? null : out
}

/** The ids among these that are live pages of this project, in the order given, each once. */
export function theLivePagesAmong(ids: readonly string[], workspaceId: string): string[] {
  const asked = [...new Set(ids)]
  if (asked.length === 0) return []
  const rows = db
    .select({ id: records.id })
    .from(records)
    .where(and(inArray(records.id, asked), eq(records.workspaceId, workspaceId), inArray(records.kind, [...PAGE_KINDS]), isNull(records.deletedAt)))
    .all()
  const live = new Set(rows.map((row) => row.id))
  return asked.filter((id) => live.has(id))
}

/** The live pages of this project a record is linked `about`, by links a writer made, not inferred ones. */
export function thePagesARecordIsAbout(recordId: string, workspaceId: string): string[] {
  const rows = db
    .select({ to: links.toId })
    .from(links)
    .where(and(eq(links.fromId, recordId), eq(links.type, 'about'), eq(links.inferred, false)))
    .all()
  return theLivePagesAmong(rows.map((row) => row.to), workspaceId)
}

/**
 * WHAT ONE OF THE OFFICE'S OWN DECISION WRITERS SENDS FOR WHAT THE DECISION GOVERNS, so its decision meets the door.
 * When the press said any of the three fields, nothing is added and the door checks what it said. Otherwise the
 * records part is, in order: the live pages the decisions it replaces named; the whole project, when one of those named
 * it; the live pages the writer knows the decision is about. Their files move to governsFiles, and their nothingFits
 * entries are kept, a nearest page that is no longer live left out. When no page and no entry is left, one nothingFits
 * entry says why, and it reminds somebody at once.
 */
export function whatTheOfficeSendsItGoverns(input: {
  said: Record<string, unknown> | undefined
  workspaceId: string
  replaced?: readonly unknown[]
  pages?: readonly string[]
  whyNoPage: string
}): Record<string, unknown> {
  if (input.said !== undefined && sendsWhatItNames(input.said)) return {}
  const named: string[] = []
  const files: string[] = []
  const fits: ANothingFitsEntry[] = []
  let wholeProject = false
  for (const data of input.replaced ?? []) {
    if (!isObject(data)) continue
    const parts = theGovernedPlaces(data[GOVERNS_FIELD], data[GOVERNS_FILES_FIELD])
    named.push(...parts.records)
    files.push(...parts.files)
    if (parts.wholeProject) wholeProject = true
    for (const one of theNothingFitsEntries(data[NOTHING_FITS_FIELD])) {
      const kept: ANothingFitsEntry =
        one.nearest === undefined || theLivePage(one.nearest, input.workspaceId) !== null ? one : { missing: one.missing, what: one.what }
      if (!fits.some((was) => isDeepStrictEqual(was, kept))) fits.push(kept)
    }
  }
  const carried = theLivePagesAmong(named, input.workspaceId)
  const pages = theLivePagesAmong(input.pages ?? [], input.workspaceId)
  const out: Record<string, unknown> = {}
  if (carried.length > 0) out[GOVERNS_FIELD] = carried.map((record) => ({ record }))
  else if (wholeProject) out[GOVERNS_FIELD] = [{ [WHOLE_PROJECT_KEY]: true }]
  else if (pages.length > 0) out[GOVERNS_FIELD] = pages.map((record) => ({ record }))
  if (files.length > 0) out[GOVERNS_FILES_FIELD] = [...new Set(files)]
  if (fits.length > 0) out[NOTHING_FITS_FIELD] = fits
  if (!(GOVERNS_FIELD in out) && !(NOTHING_FITS_FIELD in out)) out[NOTHING_FITS_FIELD] = [{ missing: MISSING_KIND_NOT_SAID, what: input.whyNoPage }]
  return out
}
