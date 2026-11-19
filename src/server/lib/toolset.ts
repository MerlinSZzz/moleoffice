// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLSET CATALOGUE, READ AND USED: the checks both write paths make on a tool and a category,
 * the list GET /api/toolset answers, one manual page, a use written as a line on a run, and the
 * person's confirmation of a proposed category.
 *
 * The catalogue is records: `tool_category` and `tool`, declared
 * in src/shared/kinds.ts, with their words in src/shared/toolset.ts. Nothing here stores a second
 * copy of a record: every answer is read from the records when it is asked.
 *
 * A USE IS A ROW, NEVER A RECORD. Decision Vt0GdSlApWce point d: a use of a tool writes one
 * line against the calling run, and the tool writes its own log file. Since wave 13s round 33 (problem
 * mR8vNPOVNQ_p) `writeAUse` writes that line as one row of `tool_uses`, keyed by the run the request's
 * x-mole-office-session header names, with optional file results in test_file_runs. It writes no
 * record, revision or change row. `readTheUsesOfARun` reads them back, newest first, a page at a time.
 * Since wave 13n round R (item 2i) each row also keeps what the door found when it checked the line's proof that
 * tools/use-line.mjs sent it, and the reading marks a line that is not shown to have come through the tool.
 */

import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { REPO_ROOT } from '../../config/settings.mjs'
import { whatAUseLinesProofShows } from '../../config/use-line-proof.mjs'
import {
  BUILT,
  KEPT_HERE,
  MANUAL_ITEMS,
  PART_OF_THE_OFFICE,
  TOOL_USE_MOST_CHARACTERS,
  THE_TEST_FILES_TOOL,
  TEST_FILE_RESULTS,
  TEST_FILES_IN_A_USE_MOST,
  TEST_FILE_PATH_MOST_CHARACTERS,
  TEST_HASH_CHARACTERS,
  NO_UNCOMMITTED_CHANGE,
  TOOL_USES_PAGE,
  TOOL_USES_PAGE_MOST,
  isForThisReader,
  type StoredToolUse,
  type ToolUse,
  type ToolUsesPage,
  type ToolsetReader,
} from '@shared/toolset.ts'
import { recordIncompleteness, THE_OWNER, type Incompleteness } from '@shared/kinds.ts'
import { dayKey } from '@shared/planning.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { sqlite, db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import type { WrittenFrom } from './machines.ts'
import { anOfficeId } from './ids.ts'
import {
  assertMayWriteAUseOn,
  createRecordWithReport,
  getRecord,
  listRecords,
  patchRecord,
  recordInWorkspace,
  type Actor,
} from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { TOOL_KIND } from '@shared/tool-kind.ts'
import { said } from './refuse-a-restore-that-would-share-a-slug.ts'
import { theOtherLiveToolWithSlug } from './refuse-a-restore-that-would-share-a-slug.ts'

export { TOOL_KIND } from '@shared/tool-kind.ts'
export const TOOL_CATEGORY_KIND = 'tool_category'

// ============================================================================ the two write paths

export { said } from './refuse-a-restore-that-would-share-a-slug.ts'

/** One row by id, whatever it is, or null because nothing has that id. */
function rowById(id: string): { id: string; kind: string; title: string; workspaceId: string; deletedAt: string | null } | null {
  return (
    db
      .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId, deletedAt: records.deletedAt })
      .from(records)
      .where(eq(records.id, id))
      .get() ?? null
  )
}

/**
 * A reference that must name a live record of one kind in this project, or a refusal saying what it
 * names instead. `field` and `wanted` are the words the refusal uses.
 */
function refuseUnlessItNames(input: { id: string; kind: string; workspaceId: string; where: string; wanted: string; because: string }): void {
  const row = rowById(input.id)
  const start = `${input.where} is "${input.id}"`
  if (row === null || row.workspaceId !== input.workspaceId) {
    throw new PanelError(`${start}, and no record in this project has that id. ${input.because} Nothing was written.`, 400)
  }
  if (row.kind !== input.kind) {
    throw new PanelError(
      `${start}, which is a ${kindWord(row.kind).text}${quotedUnlessAMessage(row, ' called ', '')} and not ${input.wanted}. ${input.because} Nothing was written.`,
      400,
    )
  }
  if (row.deletedAt !== null) {
    throw new PanelError(
      `${start}, ${input.wanted} called "${row.title}" that was deleted on ${row.deletedAt}. ${input.because} Nothing was written.`,
      400,
    )
  }
}

/**
 * DID THE OWNER MAKE THIS DECISION? Its `decided_by` is THE_OWNER. Asked in ONE place, here, by the
 * write that refuses another decision as a category's `confirmedBy` and by the list that says whether
 * a category is confirmed, so the two cannot come to give different answers.
 */
function theOwnerMadeIt(decisionData: unknown): boolean {
  return said(decisionData, 'decided_by') === THE_OWNER
}

/**
 * A CATEGORY IS CONFIRMED ONLY BY A DECISION THE OWNER MADE. A decision: anyone
 * may propose a category, and the owner confirms it.
 *
 * WHO MADE A DECISION IS ITS `decided_by`, read against THE_OWNER, the one word for the owner that the
 * decision kind declares. No other reader in the office answers "did the owner make this decision", so this
 * one reads the field. A decision an agent wrote down on the owner's words also says "the owner" there, and
 * the decision guard refuses that word from an agent unless the decision stands on "the owner said so" and
 * names the record that holds the owner's words, so such a decision passes. A
 * decision that names nobody in `decided_by` is not the owner's, as the kind's own field says.
 *
 * Asked after `refuseUnlessItNames` has found a live decision with this id.
 */
function refuseUnlessTheOwnerMadeIt(decisionId: string): void {
  const decision = getRecord(decisionId)
  if (decision === null) throw new PanelError(`The decision ${decisionId} could not be read. Nothing was written.`, 500)
  if (theOwnerMadeIt(decision.data)) return
  const decidedBy = said(decision.data, 'decided_by')
  const who =
    typeof decidedBy === 'string' && decidedBy.trim() !== ''
      ? `its decided_by says "${decidedBy}"`
      : 'its decided_by names nobody'
  throw new PanelError(
    `data.confirmedBy is "${decisionId}", the decision "${decision.title}", and ${who}. A category is confirmed ` +
      `only by a decision the owner made, which says decided_by "${THE_OWNER}". The owner confirms a category ` +
      'with POST /api/toolset/categories/<id>/confirm. Leave confirmedBy out while the category is only proposed. ' +
      'Nothing was written.',
    400,
  )
}

/**
 * WHAT A TOOL OR A CATEGORY NAMES, CHECKED AGAINST THE DATABASE, on the create and on the patch.
 *
 * `validateData` runs in the browser too and cannot ask the database, so these three questions are
 * here: does a category's `confirmedBy` name a live decision the owner made, does a tool's `category` name a live
 * category, and does another live tool hold this slug.
 *
 * EACH IS ASKED WHEN THIS WRITE CHANGES THE VALUE, AND ONLY THEN. `before` is what the record holds
 * now, or null on a create and on a kind change into this kind. A tool whose category was deleted
 * later is listed under `withoutACategory`, and it can still be retitled or given another category;
 * re-checking the stored value on every write would freeze it instead.
 *
 * `mine` is the record being written, or null on a create, so a tool is not refused for holding its
 * own slug.
 */
export function checkTheToolsetReferences(input: {
  kind: string
  workspaceId: string
  data: unknown
  before: unknown
  mine: string | null
}): void {
  const changed = (key: string): unknown => {
    const next = said(input.data, key)
    if (next === undefined) return undefined
    return input.before !== null && said(input.before, key) === next ? undefined : next
  }

  if (input.kind === TOOL_CATEGORY_KIND) {
    const decision = changed('confirmedBy')
    if (typeof decision === 'string') {
      refuseUnlessItNames({
        id: decision,
        kind: 'decision',
        workspaceId: input.workspaceId,
        where: 'data.confirmedBy',
        wanted: 'a decision',
        because:
          'A category is confirmed by a decision the owner made, and confirmedBy names that decision. Leave it out ' +
          'while the category is only proposed.',
      })
      refuseUnlessTheOwnerMadeIt(decision)
    }
    return
  }

  if (input.kind !== TOOL_KIND) return

  const category = changed('category')
  if (typeof category === 'string') {
    refuseUnlessItNames({
      id: category,
      kind: TOOL_CATEGORY_KIND,
      workspaceId: input.workspaceId,
      where: 'data.category',
      wanted: 'a tool category',
      because: 'A tool is listed under a tool category of this project. GET /api/toolset lists them.',
    })
  }

  const slug = changed('slug')
  if (typeof slug === 'string') {
    const other = theOtherLiveToolWithSlug(input.workspaceId, slug, input.mine)
    if (other !== null) {
      throw new PanelError(
        `data.slug is "${slug}", and the tool ${other.id} ("${other.title}") already has it. A slug is the address of ` +
          `one manual page, GET /api/toolset/${slug}, so two tools cannot share one. Choose another slug, or change ` +
          `${other.id} instead. Nothing was written.`,
        409,
      )
    }
  }
}

export { theOtherLiveToolWithSlug } from './refuse-a-restore-that-would-share-a-slug.ts'

export { refuseARestoreThatWouldShareASlug } from './refuse-a-restore-that-would-share-a-slug.ts'

// ============================================================================ the list

/** One tool as the list shows it. */
export interface ToolsetRow {
  id: string
  slug: string | null
  name: string
  does: string | null
  forWhom: string | null
  entry: string | null
  state: string | null
  kept: string | null
  location: string | null
  /**
   * For a built tool kept in this repository: whether the path it names exists in the checkout that
   * answers. Null for every other entry, because nothing was looked for: a tool not built yet has no
   * file to find, and a tool kept elsewhere is not in this checkout.
   */
  locationFound: boolean | null
}

/** One category as the list shows it, with its tools. */
export interface ToolsetCategory {
  id: string
  name: string
  says: string | null
  /** True when `decision` names a live decision record in this project. */
  confirmed: boolean
  /** The decision `confirmedBy` names, or null because nobody has confirmed the category. */
  decision: string | null
  tools: ToolsetRow[]
}

export interface ToolsetList {
  workspaceId: string
  who: ToolsetReader | null
  says: string
  categories: ToolsetCategory[]
  /** Tools whose category is missing, deleted, or not a category. Listed, never dropped. */
  withoutACategory: ToolsetRow[]
  /** The how-to pages for the foundation parts, which name no category. */
  partsOfTheOffice: ToolsetRow[]
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** Whether the path a built tool kept here names is in this checkout, or null because nothing was looked for. */
function whetherTheLocationIsFound(data: unknown): boolean | null {
  if (said(data, 'state') !== BUILT || said(data, 'kept') !== KEPT_HERE) return null
  const location = text(said(data, 'location'))
  if (location === null) return false
  return existsSync(join(REPO_ROOT, location.trim()))
}

function rowOf(record: PanelRecord): ToolsetRow {
  const data = record.data
  return {
    id: record.id,
    slug: text(said(data, 'slug')),
    name: record.title,
    does: text(said(data, 'does')),
    forWhom: text(said(data, 'forWhom')),
    entry: text(said(data, 'entry')),
    state: text(said(data, 'state')),
    kept: text(said(data, 'kept')),
    location: text(said(data, 'location')),
    locationFound: whetherTheLocationIsFound(data),
  }
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name)

/**
 * The ids of every live decision in this project that the owner made. A decision the owner did not make
 * confirms no category, on the list as on the write (theOwnerMadeIt).
 */
function liveDecisionIds(workspaceId: string): ReadonlySet<string> {
  return new Set(listRecords({ workspaceId, kind: 'decision' }).filter((one) => theOwnerMadeIt(one.data)).map((one) => one.id))
}

/**
 * WHETHER A CATEGORY IS CONFIRMED, WORKED OUT IN ONE PLACE. The list and the confirm door both ask
 * it, so the page can never offer the press on a category the door would call confirmed.
 *
 * `decision` is what `confirmedBy` holds, or null because nobody has confirmed the category.
 * `confirmed` is true only when that id names a live decision in this project that the owner made:
 * a category whose decision was deleted, or whose decision no longer says the owner made it, reads as
 * proposed again.
 */
function howACategoryStands(data: unknown, liveDecisions: ReadonlySet<string>): { decision: string | null; confirmed: boolean } {
  const decision = text(said(data, 'confirmedBy'))
  return { decision, confirmed: decision !== null && liveDecisions.has(decision) }
}

/**
 * EVERY CATEGORY, WITH ITS TOOLS, FOR ONE READER OR FOR EVERYBODY. The reading behind GET /api/toolset.
 *
 * Every live category is listed, confirmed or not, even with no tool for this reader in it. A tool
 * whose category is missing, deleted or not a category is listed under `withoutACategory`. The
 * "part of the office" pages come in a list of their own.
 */
export function readTheToolset(workspaceId: string, who: ToolsetReader | null): ToolsetList {
  const tools = listRecords({ workspaceId, kind: TOOL_KIND })
  const categories = listRecords({ workspaceId, kind: TOOL_CATEGORY_KIND })
  const liveDecisions = liveDecisionIds(workspaceId)

  const listed: ToolsetCategory[] = categories
    .map((category) => {
      const { decision, confirmed } = howACategoryStands(category.data, liveDecisions)
      return {
        id: category.id,
        name: category.title,
        says: text(said(category.data, 'says')),
        confirmed,
        decision,
        tools: [] as ToolsetRow[],
      }
    })
    .sort(byName)
  const byId = new Map(listed.map((category) => [category.id, category]))

  const withoutACategory: ToolsetRow[] = []
  const partsOfTheOffice: ToolsetRow[] = []
  let kept = 0
  for (const tool of tools) {
    if (!isForThisReader(said(tool.data, 'forWhom'), who)) continue
    kept += 1
    const row = rowOf(tool)
    if (said(tool.data, 'entry') === PART_OF_THE_OFFICE) {
      partsOfTheOffice.push(row)
      continue
    }
    const category = text(said(tool.data, 'category'))
    const home = category === null ? undefined : byId.get(category)
    if (home === undefined) withoutACategory.push(row)
    else home.tools.push(row)
  }
  for (const category of listed) category.tools.sort(byName)
  withoutACategory.sort(byName)
  partsOfTheOffice.sort(byName)

  const counted = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`
  const says =
    tools.length === 0
      ? `No tool has been filed in this project yet. ${categories.length === 0 ? 'No category has been filed either.' : `${counted(categories.length, 'category is', 'categories are')} filed, each with no tool in it.`}`
      : who !== null && kept === 0
        ? `${counted(tools.length, 'tool is', 'tools are')} filed in this project, and none of them is for ${who}.`
        : `${counted(kept, 'entry is', 'entries are')} listed${who === null ? '' : ` for ${who}`}, in ${counted(listed.length, 'category', 'categories')}, with ${String(partsOfTheOffice.length)} ${partsOfTheOffice.length === 1 ? 'page' : 'pages'} on parts of the office and ${String(withoutACategory.length)} without a category.`

  return { workspaceId, who, says, categories: listed, withoutACategory, partsOfTheOffice }
}

// ============================================================================ one manual page

export interface ManualItem {
  n: number
  name: string
  /** Each key of the item and what the record holds for it. Null means it is not filled in. */
  holds: Record<string, unknown>
}

export interface ManualPage {
  tool: ToolsetRow
  items: ManualItem[]
  /** The category item's record, read now: its name and whether it is still a live category. */
  category: { id: string; name: string | null; found: boolean } | null
  incomplete: Incompleteness[]
}

/** The live tool with this slug, or null. */
function theToolWithSlug(workspaceId: string, slug: string): PanelRecord | null {
  return listRecords({ workspaceId, kind: TOOL_KIND }).find((tool) => said(tool.data, 'slug') === slug) ?? null
}

/** A 404 that names the slug. */
function noToolHasSlug(slug: string): PanelError {
  return new PanelError(
    `No live tool in this project has the slug "${slug}". GET /api/toolset lists every tool with its slug.`,
    404,
  )
}

/** One tool's manual page: the ten items in order, each with its number and its name. */
export function readOneManualPage(workspaceId: string, slug: string): ManualPage {
  const tool = theToolWithSlug(workspaceId, slug)
  if (tool === null) throw noToolHasSlug(slug)
  const items = MANUAL_ITEMS.map((item) => ({
    n: item.n,
    name: item.name,
    holds: Object.fromEntries(
      item.keys.map((key) => [key, key === 'title' ? tool.title : (said(tool.data, key) ?? null)]),
    ),
  }))
  const categoryId = text(said(tool.data, 'category'))
  let category: ManualPage['category'] = null
  if (categoryId !== null) {
    const row = rowById(categoryId)
    const found = row !== null && row.workspaceId === workspaceId && row.kind === TOOL_CATEGORY_KIND && row.deletedAt === null
    category = { id: categoryId, name: found ? row.title : null, found }
  }
  return { tool: rowOf(tool), items, category, incomplete: recordIncompleteness(tool.kind, tool.data, tool.summary) }
}

// ============================================================================ one use

/** The body is shared by the HTTP door and its writer, so direct callers get the same checks. */
const testHash = z.string().regex(new RegExp(`^[0-9a-f]{${String(TEST_HASH_CHARACTERS)}}$`), `exactly ${String(TEST_HASH_CHARACTERS)} lowercase hex characters`)
const aTestFile = z.object({
  file: z.string().min(1).max(TEST_FILE_PATH_MOST_CHARACTERS)
    .refine(file => !/[\r\n]/.test(file), 'a file path may hold no line break')
    .refine(file => !file.includes('\\'), 'a file path uses / between folders, never a backslash')
    .refine(file => !file.startsWith('/'), 'a file path is relative to the checkout, never starting with /')
    .refine(file => !file.split('/').some(part => part === '.' || part === '..'), 'a file path may hold no . or .. segment'),
  result: z.enum(TEST_FILE_RESULTS),
  seconds: z.number({ error: 'a finite number of at least zero, or null' }).finite().nonnegative().nullable(),
  testFileHash: testHash.nullable(),
}).strict()
export const aUse = z.object({
  tool: z.string().min(1),
  said: z.string(),
  files: z.array(aTestFile).min(1).max(TEST_FILES_IN_A_USE_MOST).optional(),
  tree: z.object({
    commit: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, '40 or 64 lowercase hex characters').nullable(),
    change: z.union([z.literal(NO_UNCOMMITTED_CHANGE), testHash], { error: `${NO_UNCOMMITTED_CHANGE}, ${String(TEST_HASH_CHARACTERS)} lowercase hex characters, or null` }).nullable(),
  }).strict().optional(),
}).strict().superRefine((body, ctx) => {
  if ((body.files === undefined) !== (body.tree === undefined)) {
    ctx.addIssue({ code: 'custom', path: [body.files === undefined ? 'files' : 'tree'], message: 'files and tree go together: send both or neither' })
  }
  if ((body.files !== undefined || body.tree !== undefined) && body.tool !== THE_TEST_FILES_TOOL) {
    ctx.addIssue({ code: 'custom', path: [body.files === undefined ? 'tree' : 'files'], message: `only a use of ${THE_TEST_FILES_TOOL} takes files and tree` })
  }
  const seen = new Map<string, number>()
  for (const [i, file] of (body.files ?? []).entries()) {
    const first = seen.get(file.file)
    if (first !== undefined) ctx.addIssue({ code: 'custom', path: ['files', i, 'file'], message: `the same file is already at files[${String(first)}].file; each file appears once in a use` })
    seen.set(file.file, i)
  }
})

/** A refusal names array places in the form callers sent, and always says that nothing was written. */
export function readAUse(value: unknown): z.output<typeof aUse> {
  const checked = aUse.safeParse(value)
  if (checked.success) return checked.data
  const problems = checked.error.issues.flatMap(issue => {
    const paths = issue.code === 'unrecognized_keys' ? issue.keys.map(key => [...issue.path, key]) : [issue.path]
    return paths.map(path => {
      const place = path.reduce<string>((name, part) => typeof part === 'number' ? `${name}[${String(part)}]` : `${name}${name === '' ? '' : '.'}${String(part)}`, '') || 'The use'
      let at: unknown = value
      for (const part of path) at = at !== null && typeof at === 'object' ? (at as Record<PropertyKey, unknown>)[part] : undefined
      const shown = Array.isArray(at) ? `[${String(at.length)} items]` : (typeof at === 'number' ? String(at) : JSON.stringify(at)) ?? 'missing'
      const description = shown.length <= 120 ? shown : typeof at === 'string' ? `a string of ${String(at.length)} characters` : 'an object'
      return `${place} is ${description}: ${issue.message}`
    })
  })
  throw new PanelError(`${problems.join('; ')}. Nothing was written.`, 400)
}

export interface AUse {
  line: ToolUse
  run: string
  uses: number
  files: number
  /** What the door found when it checked the line's proof, or null when it was not asked to check. */
  proof: StoredToolUse['proof']
}

/**
 * THE MARK ON A USE LINE THAT IS NOT SHOWN TO HAVE COME THROUGH tools/use-line.mjs, in one sentence, or null when its
 * proof matches. The words never say more than the proof shows: a line with no proof may also come from a copy of the
 * tool older than the check.
 */
export function theMarkOfAUseLine(proof: StoredToolUse['proof']): string | null {
  if (proof === 'matches') return null
  if (proof === 'none') {
    return 'No proof that tools/use-line.mjs sent it: the line came with none, so it may have been written by hand, or sent by a copy of the tool older than the check.'
  }
  if (proof === 'does not match') {
    return 'No proof that tools/use-line.mjs sent it: the proof it came with does not match its words and the key it was sent with.'
  }
  return 'Not known whether tools/use-line.mjs sent it: the office did not check this line, as it did not before migration 0300.'
}

/**
 * ONE USE OF ONE TOOL, WRITTEN AS ONE ROW AGAINST THE CALLER'S RUN. Everything is checked before anything
 * is written: the line, the run the session header names, the caller's right to write on that run, and
 * the tool. The row takes the next place on the run inside one transaction, so two uses at once each
 * keep their row. Optional test file rows are inserted inside that same transaction. The run's record,
 * its revisions and the change log are untouched.
 *
 * `proof` is what came with the request: the proof header's value and the SHA-256 of the key the request carried. The
 * door checks it against the words it is about to store (src/config/use-line-proof.mjs) and keeps the answer on the row.
 * A caller that does not give it stores null, which says nobody checked.
 */
export function writeAUse(input: {
  workspaceId: string
  actor: Actor
  tool: string
  said: string
  files?: unknown
  tree?: unknown
  proof?: { sent: string | undefined; keysHash: string | null }
}): AUse {
  const body = readAUse({ tool: input.tool, said: input.said, ...(input.files === undefined ? {} : { files: input.files }), ...(input.tree === undefined ? {} : { tree: input.tree }) })
  const line = body.said.trim()
  if (line === '') {
    throw new PanelError('The use line is empty. Say in one line what the use did. Nothing was written.', 400)
  }
  if (/[\r\n]/.test(line)) {
    throw new PanelError('The use line holds a line break, and a use is one line. Nothing was written.', 400)
  }
  if (line.length > TOOL_USE_MOST_CHARACTERS) {
    throw new PanelError(
      `The use line is ${String(line.length)} characters, and a use line holds at most ${String(TOOL_USE_MOST_CHARACTERS)}. Nothing was written.`,
      400,
    )
  }

  const asked = input.actor.sessionId
  if (asked === null || asked === undefined || asked.trim() === '') {
    throw new PanelError(
      'This request names no run, so there is no record to write the use on. Send x-mole-office-session with your ' +
        'own session record\'s id. Nothing was written.',
      400,
    )
  }
  const ref = resolveSessionRef(asked, input.workspaceId)
  if (ref.recordId === null) {
    const row = rowById(asked.trim())
    if (row !== null && row.workspaceId === input.workspaceId && row.kind !== 'session') {
      throw new PanelError(
        `x-mole-office-session is "${asked}", which is a ${kindWord(row.kind).text}${quotedUnlessAMessage(row, ' called ', '')} and not a run. A use is ` +
          'written on the session record of the run that made it. Nothing was written.',
        400,
      )
    }
    throw new PanelError(
      `x-mole-office-session is "${asked}", and it names no run in this project: ${ref.why ?? 'nothing answers to it.'} ` +
        'Nothing was written.',
      400,
    )
  }
  if (ref.deleted) {
    throw new PanelError(
      `x-mole-office-session names the run ${ref.recordId}, which was deleted. A use is not written on a deleted run. ` +
        'Nothing was written.',
      409,
    )
  }
  if (theToolWithSlug(input.workspaceId, input.tool) === null) throw noToolHasSlug(input.tool)

  const run = ref.recordId
  assertMayWriteAUseOn(run, input.actor)
  const use: ToolUse = { at: now(), tool: input.tool, said: line }
  const proof = input.proof === undefined
    ? null
    : whatAUseLinesProofShows(input.proof.sent, input.proof.keysHash, { session: asked, tool: body.tool, said: body.said, files: body.files ?? null, tree: body.tree ?? null })
  const uses = sqlite.transaction(() => {
    const stored = rowById(run)
    if (stored === null) throw new PanelError(`The run ${run} could not be read. Nothing was written.`, 500)
    const seq = (sqlite.prepare('SELECT coalesce(max(seq), 0) + 1 AS seq FROM tool_uses WHERE run_id = ?').get(run) as { seq: number }).seq
    const useId = anOfficeId()
    sqlite
      .prepare('INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id, moved_at, proof) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)')
      .run(useId, stored.workspaceId, run, seq, use.at, use.tool, use.said, input.actor.type, input.actor.id, proof)
    if (body.files !== undefined && body.tree !== undefined) {
      const insertFile = sqlite.prepare('INSERT INTO test_file_runs (id, workspace_id, use_id, file, result, seconds, test_file_hash, tree_commit, tree_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const file of body.files) {
        insertFile.run(anOfficeId(), stored.workspaceId, useId, file.file, file.result, file.seconds, file.testFileHash, body.tree.commit, body.tree.change)
      }
    }
    return seq
  })()
  return { line: use, run, uses, files: body.files?.length ?? 0, proof }
}

/** A row's proof as the door stored it. Anything else stored there is a broken assumption, and the read fails loudly. */
function aStoredProof(stored: string | null): StoredToolUse['proof'] {
  if (stored === null || stored === 'matches' || stored === 'none' || stored === 'does not match') return stored
  throw new PanelError(`A use row holds the proof answer ${JSON.stringify(stored)}, which the use door never writes.`, 500)
}

/**
 * ONE PAGE OF A RUN'S USES, NEWEST FIRST. The reading behind GET /api/toolset/runs/:run/uses. `before` is a place on
 * the run: the page holds the uses before it, so the first page is the newest and each `older` reads the
 * next. A run is read whether or not it was deleted, because its uses are its history.
 */
export function readTheUsesOfARun(input: { workspaceId: string; run: string; limit: number | null; before: number | null }): ToolUsesPage {
  // THE RUN IS READ THROUGH `recordInWorkspace`, so an id that names nothing is a 404 and a run of another project is
  // a 404 that says where it is, as on every other door that takes an id in its path.
  const row = recordInWorkspace(input.run, input.workspaceId)
  if (row.kind !== 'session') {
    throw new PanelError(
      `run is "${input.run}", which is a ${kindWord(row.kind).text}${quotedUnlessAMessage(row, ' called ', '')} and not a run. ` +
        'Uses of tools are written against the session record of the run that made them.',
      400,
    )
  }
  const limit = input.limit ?? TOOL_USES_PAGE
  if (!Number.isInteger(limit) || limit < 1 || limit > TOOL_USES_PAGE_MOST) {
    throw new PanelError(`limit is ${String(input.limit)}, and a page holds from 1 to ${String(TOOL_USES_PAGE_MOST)} uses.`, 400)
  }
  if (input.before !== null && (!Number.isInteger(input.before) || input.before < 1)) {
    throw new PanelError(`before is ${String(input.before)}, and it is a place on the run: a whole number from 1.`, 400)
  }
  const total = (sqlite.prepare('SELECT count(*) AS n FROM tool_uses WHERE run_id = ?').get(input.run) as { n: number }).n
  const rows = sqlite
    .prepare(
      'SELECT seq, at, tool, said, actor_type AS actorType, actor_id AS actorId, moved_at AS movedAt, proof FROM tool_uses ' +
        'WHERE run_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?',
    )
    .all(input.run, input.before ?? Number.MAX_SAFE_INTEGER, limit) as {
    seq: number
    at: string
    tool: string
    said: string
    actorType: string | null
    actorId: string | null
    movedAt: string | null
    proof: string | null
  }[]
  const uses: StoredToolUse[] = rows.map((one) => {
    const proof = aStoredProof(one.proof)
    return {
      seq: one.seq,
      at: one.at,
      tool: one.tool,
      said: one.said,
      by: one.actorType === null || one.actorId === null ? null : { type: one.actorType, id: one.actorId },
      movedAt: one.movedAt,
      proof,
      mark: theMarkOfAUseLine(proof),
    }
  })
  const last = uses.at(-1)
  return { run: input.run, total, uses, older: last !== undefined && last.seq > 1 ? last.seq : null }
}

// ============================================================================ confirming a category

export interface AConfirmation {
  category: string
  decision: PanelRecord
}

/**
 * THE PERSON CONFIRMS ONE PROPOSED CATEGORY. The reading behind POST /api/toolset/categories/:id/confirm.
 *
 * A decision: anyone may propose a category, the secretary collects the
 * proposals, and the owner confirms one. With categories as records, the owner's confirmation is a
 * `decision` record, and the category's `confirmedBy` names it.
 *
 * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN: the why, that the id names a live tool category
 * in this project (a record in another project is refused by `recordInWorkspace`, which names that
 * project), and that it is not confirmed already. Then ONE TRANSACTION files the decision
 * and sets `confirmedBy`, so either both are written or neither is.
 *
 * THE DECISION IS FILED THROUGH `createRecordWithReport`, the function POST /api/records uses, so
 * the guard that refuses a decision to an agent (assertMayWrite, chapter 4 rule 4) refuses this door
 * to an agent too. This door writes no `authority_reference`, so no agent's write can pass it.
 */
export function confirmACategory(input: {
  workspaceId: string
  actor: Actor
  categoryId: string
  why: string
  writtenFrom?: WrittenFrom
}): AConfirmation {
  const why = input.why.trim()
  if (why === '') {
    throw new PanelError(
      'The why is empty. A category is confirmed with one sentence saying why, and that sentence is the ' +
        'decision\'s reasoning. Nothing was written.',
      400,
    )
  }
  if (getRecord(input.categoryId) === null) {
    throw new PanelError(
      `No record has the id "${input.categoryId}". GET /api/toolset lists every category with its id. Nothing was written.`,
      404,
    )
  }
  // A RECORD IN ANOTHER PROJECT IS REFUSED BY THE ONE READER THAT SAYS WHICH PROJECT IT IS IN.
  const category = recordInWorkspace(input.categoryId, input.workspaceId)
  const row = { id: category.id, title: category.title }
  if (category.kind !== TOOL_CATEGORY_KIND) {
    throw new PanelError(
      `The record ${row.id} is a ${kindWord(category.kind).text}${quotedUnlessAMessage({ kind: category.kind, title: row.title }, ' called ', '')} and not a tool category, so it ` +
        'cannot be confirmed as one. Nothing was written.',
      400,
    )
  }
  if (category.deletedAt !== null) {
    throw new PanelError(
      `The tool category ${row.id} ("${row.title}") was deleted on ${category.deletedAt}. A deleted category is not confirmed. Nothing was written.`,
      409,
    )
  }
  const stands = howACategoryStands(category.data, liveDecisionIds(input.workspaceId))
  if (stands.confirmed) {
    throw new PanelError(
      `The tool category ${row.id} ("${row.title}") is already confirmed, by the decision ${String(stands.decision)}. ` +
        'A category is confirmed once. Nothing was written.',
      409,
    )
  }

  const decision = sqlite.transaction((): PanelRecord => {
    let created: PanelRecord
    try {
      created = createRecordWithReport({
        workspaceId: input.workspaceId,
        kind: 'decision',
        title: `The tool category "${row.title}" is confirmed`,
        data: {
          decided_on: dayKey(new Date()),
          because: why,
          option_taken: `Confirm "${row.title}" (${row.id}) as a category of the toolset.`,
          // IT REPLACES NO EARLIER DECISION: a category is confirmed once (the refusal above), so no earlier decision
          // confirmed it. Every door a decision is made through says so (problem ZSWftCSVUP2r).
          replaces: [],
          decided_by: THE_OWNER,
          authority: 'the owner said so',
          source: `The confirmation of the tool category ${row.id}, through POST /api/toolset/categories/${row.id}/confirm.`,
        },
        actor: input.actor,
        ...(input.writtenFrom === undefined ? {} : { writtenFrom: input.writtenFrom }),
        links: [{ type: 'about', toId: row.id }],
        mustSayWhatItReplaces: true,
        door: `POST /api/toolset/categories/${row.id}/confirm`,
      }).record
    } catch (err) {
      // THE GUARD'S OWN WORDS, WITH WHAT THIS DOOR WAS DOING PUT FIRST. A refusal of the decision is
      // a refusal of the confirmation, and the reader of this door never wrote a decision by hand.
      if (err instanceof PanelError && err.status === 403) {
        throw new PanelError(
          `Confirming a tool category is the owner's own act, and it files a decision in the owner's name. The office ` +
            `refused that decision, so the category ${row.id} is still proposed. Nothing was written. The refusal: ${err.message}`,
          403,
        )
      }
      throw err
    }
    patchRecord(row.id, { dataPatch: { confirmedBy: created.id } }, input.actor)
    return created
  })()
  return { category: row.id, decision }
}
