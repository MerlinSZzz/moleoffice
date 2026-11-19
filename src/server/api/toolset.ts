// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLSET CATALOGUE, OVER HTTP. Piece P1 of plan KP0udNekYcAo.
 *
 *   GET  /api/toolset?who=users|developers   every category with its tools
 *   GET  /api/toolset/:slug                  one tool's manual page, the ten items in order
 *   POST /api/toolset/uses                   one use written as one row against the calling run
 *   GET  /api/toolset/runs/:run/uses         one run's uses, newest first, a page at a time
 *   GET  /api/toolset/named-tests/files      named test file results and catches over local dates
 *   POST /api/toolset/categories/:id/confirm the person confirms a proposed category
 *
 * The readings are in src/server/lib/toolset.ts. What is here is the door: the shape of the query or
 * the body, and what comes back. A tool and a category are filed and changed through the ordinary
 * record doors. These doors read them, write a use on a run, and confirm a category.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { TOOL_AUDIENCES, TOOL_USE_MOST_CHARACTERS, TOOL_USES_PAGE, TOOL_USES_PAGE_MOST, TOOLSET_READERS, THE_TEST_FILES_TOOL, TEST_FILES_WINDOW_MOST_DAYS, TEST_FILE_RESULTS, TEST_FILES_IN_A_USE_MOST, TEST_FILE_PATH_MOST_CHARACTERS, TEST_HASH_CHARACTERS, NO_UNCOMMITTED_CHANGE, type ToolsetReader } from '@shared/toolset.ts'
import { calendarDaysBetweenDayKeys } from '@shared/time.ts'
import { readTestFileCatches } from '../lib/test-file-catches.ts'
import { USE_LINE_PROOF_HEADER } from '../../config/use-line-proof.mjs'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { writtenFrom } from '../lib/machines.ts'
import { confirmACategory, readOneManualPage, readTheToolset, readTheUsesOfARun, readAUse, theMarkOfAUseLine, writeAUse } from '../lib/toolset.ts'
import { workspaceOf } from '../lib/workspaces.ts'

/**
 * The largest compact JSON body permitted by the shared use limits. Six bytes per UTF-16 code
 * unit covers JSON's control-character escapes; the longest nonnegative JSON number takes 24
 * bytes and the longest supported commit has 64 hex characters. Quotes, keys and punctuation
 * are counted by JSON.stringify rather than estimated.
 *
 * Sum: envelope + 6*saidMax + 64 + changeMax
 *   + filesMax*(fileEnvelope + 6*pathMax + longestResult + 24 + hashMax) + (filesMax - 1).
 * The file envelope omits its one-byte numeric placeholder before the 24-byte number is added.
 */
const useEnvelopeBytes = Buffer.byteLength(JSON.stringify({ tool: THE_TEST_FILES_TOOL, said: '', files: [], tree: { commit: '', change: '' } }))
const fileEnvelopeBytes = Buffer.byteLength(JSON.stringify({ file: '', result: '', seconds: 0, testFileHash: '' })) - 1
const longestResultBytes = Math.max(...TEST_FILE_RESULTS.map(result => Buffer.byteLength(JSON.stringify(result)) - 2))
export const USE_BODY_MOST_BYTES =
  useEnvelopeBytes + 6 * TOOL_USE_MOST_CHARACTERS + 64 + Math.max(TEST_HASH_CHARACTERS, Buffer.byteLength(JSON.stringify(NO_UNCOMMITTED_CHANGE)) - 2) +
  TEST_FILES_IN_A_USE_MOST * (fileEnvelopeBytes + 6 * TEST_FILE_PATH_MOST_CHARACTERS + longestResultBytes + 24 + TEST_HASH_CHARACTERS) +
  TEST_FILES_IN_A_USE_MOST - 1

// ============================================================================ the sentences

const LIST_NOTE =
  'THE TOOLSET CATALOGUE: every tool category in this project, each with its id, its name, what belongs in it, ' +
  'whether it is confirmed and by which decision, and its tools (id, slug, name, what it does, who it is for, the ' +
  'kind of entry, whether it is built, and where its code is kept). For a built tool kept in this repository, ' +
  '`locationFound` says whether the path it names exists in the checkout that answers. The pages on parts of the ' +
  'office come in `partsOfTheOffice`, and a tool whose category is missing or deleted comes in `withoutACategory`. ' +
  '?who=users keeps the tools for users and for both; ?who=developers keeps the tools for developers and for both; ' +
  'with no `who`, every tool is listed. Writes nothing.'

const READ_NOTE =
  "ONE TOOL'S MANUAL PAGE, by its slug: the ten items in order, each with its number and its name, what its " +
  'category is now, and what the record still lacks. A 404 names the slug when no live tool has it. Writes nothing.'

const USE_NOTE =
  'WRITE ONE USE OF A TOOL on the run that made it. Body {"tool":"<slug>","said":"<one line>"}. The use ' +
  '{at, tool, said} is written as one row against the session record your x-mole-office-session header names, at ' +
  `the next place on that run, and \`at\` is the office's own clock. It is refused, before anything is written, ` +
  'when the header is missing, when it names no run in this project, when you may not write on that run, when no ' +
  `tool has the slug, and when the line is empty, holds a line break or is over ${String(TOOL_USE_MOST_CHARACTERS)} ` +
  `characters. Only ${THE_TEST_FILES_TOOL} may also send files and tree, both or neither. files holds 1 to ` +
  `${String(TEST_FILES_IN_A_USE_MOST)} items, each a unique file path relative to the checkout (at most ${String(TEST_FILE_PATH_MOST_CHARACTERS)} ` +
  'characters, no line break, backslash, leading /, or . or .. segment), result (' + TEST_FILE_RESULTS.join(', ') +
  '), seconds (a finite number at least zero or null), and testFileHash (' + String(TEST_HASH_CHARACTERS) +
  ' lowercase hex characters or null). tree holds commit (40 or 64 lowercase hex characters or null) and change (' +
  `${NO_UNCOMMITTED_CHANGE}, ${String(TEST_HASH_CHARACTERS)} lowercase hex characters, or null). Unknown keys are refused. ` +
  'Each bad place is named in a 400 ending Nothing was written. The use and its file rows are written in one ' +
  'transaction. files in the reply counts the file rows stored, zero when none were sent. No record, revision of ' +
  'the run or change row is written. `uses` is its place on ' +
  `the run. tools/use-line.mjs sends ${USE_LINE_PROOF_HEADER} beside each line: a proof made from the key the request ` +
  'carries and the words it sends (src/config/use-line-proof.mjs). The door checks it and keeps on the line `proof`: ' +
  'matches, none, or does not match. A line without a matching proof is still written, and is marked where use lines ' +
  'are read. A matching proof shows only that the sender held the key and made the proof as the tool does; it never ' +
  `shows that the words are true. The request body holds at most ${String(USE_BODY_MOST_BYTES)} bytes, enough for the largest compact ` +
  'JSON use; a larger body is refused with 413 before the shape is read. Read use lines with GET /api/toolset/runs/<run id>/uses.'

const USES_NOTE =
  "ONE RUN'S USES OF TOOLS, newest first. `run` is the session record's id. ?limit takes 1 to " +
  `${String(TOOL_USES_PAGE_MOST)} and is ${String(TOOL_USES_PAGE)} when left out; ?before=<place> reads the uses before ` +
  'that place, and each page\'s `older` is the `before` of the next. `total` counts every use the run has. Each use ' +
  'has its place (`seq`), `at`, `tool`, `said`, who wrote it (`by`), and `movedAt` when migration 0231 moved it out ' +
  'of the run\'s record; a moved use has `by` null, because the list it came from never said. `proof` is what the ' +
  'use door found when it checked that tools/use-line.mjs sent the line: matches, none, does not match, or null on a ' +
  'line written before the door checked. `mark` is null on a line whose proof matches, and one sentence on every other ' +
  'line. Anyone with the run\'s key and the tool\'s files can make a matching proof. Writes nothing.'

const FILES_NOTE =
  'NAMED TEST FILE RESULTS AND CATCHES in the caller\'s project. Each file has its row and red counts, catches, ' +
  'flaky pairs, test changes, mutation proofs, rows not comparable, and the median of known red and green seconds. ' +
  'A green pairs with the last comparable red since the previous comparable green on the same run and file, ' +
  'then closes all open reds. A pair on the same tree is flaky. Otherwise a different test file hash is a test ' +
  'change. Otherwise an earlier comparable green before the red on that run and file, on the new green\'s tree, ' +
  'proves a mutation. Anything else is a catch, kept with its run and both sides\' places, times and trees. ' +
  'Comparable rows are passed or failed with a known test file hash, commit and change. No result counts only ' +
  'as a row; its seconds are omitted. Earlier rows provide context, and a pair counts with its green. ' +
  'The answer also names the window, the first stored file line, and distinct runs, uses and rows in the window. ' +
  '?from and ?to are required real local dates in YYYY-MM-DD form, from included and to excluded at midnight. ' +
  `to must be after from and at most ${String(TEST_FILES_WINDOW_MOST_DAYS)} calendar days later. Unknown keys are refused. Writes nothing.`

const CONFIRM_NOTE =
  'THE PERSON CONFIRMS A PROPOSED TOOL CATEGORY. Body {"why":"<their sentence>"}. In one transaction it files a ' +
  '`decision` record that says it confirms the category and names it, with the why as its reasoning, linked ' +
  '`about` the category, and sets the category\'s `confirmedBy` to that decision. It is refused, before anything ' +
  'is written, when the why is empty, when the id names no live tool category in this project, and when the ' +
  'category is already confirmed. The decision goes through the same function as POST /api/records, so an agent ' +
  'is refused as it is refused a decision there.'

// ============================================================================ the shapes

const theQuery = z.object({ who: z.string().optional() }).strict()
const theSlug = z.object({ slug: z.string().min(1) }).strict()
const theRun = z.object({ run: z.string().min(1) }).strict()
const aWholeNumber = z.string().regex(/^[0-9]+$/, 'a whole number').transform(Number)
const usesQuery = z.object({ limit: aWholeNumber.optional(), before: aWholeNumber.optional() }).strict()
const aLocalDate = z.string().refine(day => calendarDaysBetweenDayKeys(day, day) !== null, 'a real local date in YYYY-MM-DD form')
const filesQuery = z.object({ from: aLocalDate, to: aLocalDate }).strict().superRefine(({ from, to }, ctx) => {
  const days = calendarDaysBetweenDayKeys(from, to)
  if (days === null) return
  if (days <= 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'must be after from' })
  if (days > TEST_FILES_WINDOW_MOST_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: `must be at most ${String(TEST_FILES_WINDOW_MOST_DAYS)} calendar days after from` })
})
const theCategory = z.object({ id: z.string().min(1) }).strict()
const aConfirmation = z.object({ why: z.string() }).strict()

/** The reader a `who` names, or a 400 naming the words. */
function theReader(who: string | undefined): ToolsetReader | null {
  if (who === undefined) return null
  if ((TOOLSET_READERS as readonly string[]).includes(who)) return who as ToolsetReader
  throw new PanelError(
    `?who is "${who}", and it takes ${TOOLSET_READERS.map((word) => `"${word}"`).join(' or ')}. A tool is for ` +
      `${TOOL_AUDIENCES.map((word) => `"${word}"`).join(', ')}: ?who=users keeps the tools for users and for both, ` +
      '?who=developers keeps the tools for developers and for both, and leaving it out lists every tool.',
    400,
  )
}

// ============================================================================ the routes

export async function toolsetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/toolset', route('toolset.list', 'remote', LIST_NOTE), async (req) => {
    const { who } = parse(theQuery, req.query ?? {}, 'The toolset query')
    return readTheToolset(workspaceOf(req), theReader(who))
  })

  app.get('/toolset/:slug', route('toolset.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { slug } = parse(theSlug, req.params, 'The tool to read')
    return { ...readOneManualPage(workspaceId, slug), workspaceId }
  })

  app.post('/toolset/uses', { bodyLimit: USE_BODY_MOST_BYTES, ...route('toolset.use', 'remote', USE_NOTE) }, async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const body = readAUse(req.body)
    const sentProof = req.headers[USE_LINE_PROOF_HEADER]
    const proof = { sent: Array.isArray(sentProof) ? sentProof.join(', ') : sentProof, keysHash: theHashOfTheKeyOnThisRequest(req) }
    const done = writeAUse({ workspaceId, actor: actorFrom(req), ...body, proof })
    const mark = theMarkOfAUseLine(done.proof)
    void reply.code(201)
    return {
      ...done,
      says: `The use of ${done.line.tool} is written against the run ${done.run}. It is use ${String(done.uses)} there${done.files === 0 ? '' : ` with ${String(done.files)} test file results`}. No record was created.` +
        (mark === null ? '' : ` It is marked where use lines are read: ${mark}`),
      workspaceId,
    }
  })

  app.get('/toolset/runs/:run/uses', route('toolset.uses', 'remote', USES_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { run } = parse(theRun, req.params, 'The run whose uses to read')
    const query = parse(usesQuery, req.query ?? {}, 'The uses query')
    return { ...readTheUsesOfARun({ workspaceId, run, limit: query.limit ?? null, before: query.before ?? null }), workspaceId }
  })

  app.get(`/toolset/${THE_TEST_FILES_TOOL}/files`, route('toolset.files', 'remote', FILES_NOTE), async (req) => {
    const { from, to } = parse(filesQuery, req.query ?? {}, 'The named test files query')
    return readTestFileCatches({ workspaceId: workspaceOf(req), from, to })
  })

  app.post('/toolset/categories/:id/confirm', route('toolset.confirm', 'remote', CONFIRM_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(theCategory, req.params, 'The category to confirm')
    const body = parse(aConfirmation, req.body, 'The confirmation')
    const done = confirmACategory({ workspaceId, actor: actorFrom(req), categoryId: id, why: body.why, writtenFrom: writtenFrom(req) })
    void reply.code(201)
    return {
      ...done,
      says: `The tool category ${done.category} is confirmed by the decision ${done.decision.id}.`,
      workspaceId,
    }
  })
}
