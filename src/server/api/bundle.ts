// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT LEAVES THE BUILDING, AND THE ONE ACT THAT RECORDS IT.
 *
 * Five routes and one refusal that matters more than the five.
 *
 *   GET  /api/bundles                 the bundles filed in this project, or with ?projects= in the
 *                                     projects asked for, each row naming its project
 *   GET  /api/bundles/preview         the text a spec produces right now. Writes nothing.
 *   GET  /api/bundles/as-text         the same text as a page of plain text. Writes nothing.
 *   GET  /api/bundles/:id/as-text     the same, for a bundle already filed. Writes nothing.
 *   POST /api/bundles/export          the act. Produces the text AND records that it left.
 *
 * ALL FOUR READS RESOLVE THE SAME WAY AS THE EXPORT, through `resolveBundle`. The export differs in
 * one thing: it writes an entry saying what was handed over, with the version each record held at
 * that moment. That is the only evidence Mole Office has of what an outside agent was given.
 *
 * THE TWO PLAIN-TEXT DOORS EXIST BECAUSE A BROWSER MAY HAVE NO CLIPBOARD. Criterion B29. They are
 * reads and they record nothing, and they refuse where the export refuses — see `textOrTheRefusal`.
 *
 * NOTHING HERE READS, STORES, TRANSMITS OR LOGS A CREDENTIAL, and nothing here sends anything
 * anywhere. `remote-access.md` §8 is the standard and this thread meets it by having no transport
 * at all: Mole Office renders text, a person copies it, and Mole Office never claims it was delivered. What
 * an export records is that text was produced, by whom, and of what — never that anybody read it.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  BUNDLE_PRESET_NAMES,
  BUNDLE_SHIFT_LIMIT,
  SCOPE_NAMES,
  whyTheseAdditionalRecordsCannotBeUsed,
  whyTheseSlotsCannotBeUsed,
  type BundlePreset,
  type BundleSpec,
  type ScopeName,
} from '@shared/bundles.ts'
import { theProjectsAQueryAsks, theRowsTheReaderMaySee } from '../lib/across-projects.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { requireWorkspace } from '../lib/require-workspace.ts'
import { resolveBundle, recordAnExport, exportsOf, specOf, budgetFor } from '../lib/bundle.ts'
import type { PanelRecord } from '@shared/types.ts'
import { exportFileName } from '@shared/zip-export/manifest.ts'
import { theZipExportOf } from '../lib/zip-export/related-files.ts'
import { ACROSS_WORKSPACES, getRecord, listRecords } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'

export { exportsOf, specOf }

const askQuery = z
  .object({
    scope: z.string().min(1).optional(),
    preset: z.enum(BUNDLE_PRESET_NAMES as [BundlePreset, ...BundlePreset[]]),
    // NOT `.min(1)`. An empty `slots=` is a caller naming no part, and the sentence that says so
    // is `whyTheseSlotsCannotBeUsed`. Refusing it here would answer with the shape of the query
    // string instead of with what is wrong, which is the same request refused less usefully.
    slots: z.string().optional(),
    reach: z.coerce.number().int().min(1).max(3).optional(),
    // WHICH MODULES AND PIPELINES GO IN, comma-separated. Not `.min(1)`, for the reason `slots` is
    // not: an empty value is a caller naming none, and the sentence that says so is
    // `whyTheseModulesAndPipelinesCannotBeUsed`. Criterion B6.
    modulesAndPipelines: z.string().optional(),
    // THE RECORDS SOMEBODY NAMED BY HAND, comma-separated. Not `.min(1)`, for the reason `slots` is
    // not: an empty value is a caller naming none, and the sentence that says so is
    // `whyTheseAdditionalRecordsCannotBeUsed`. Criterion B8.
    additionalRecords: z.string().optional(),
    // HOW DETAILED EACH ENTRY IS. Not an enum here: `resolveBundle` refuses an unknown position with
    // a sentence naming the five a copy offers, and both doors go through it, so an enum here would
    // be the same refusal written twice and worse in one of them.
    detail: z.string().optional(),
    // HOW FAR THE PERSON MOVED EVERY PART FROM THE LEVEL ITS SHARE CHOSE. Criterion B31. Bounded
    // because the ladder a copy offers is five rungs long: anything past four is the same answer as
    // four, and a number with no bound is a query string that can ask for nonsense and be answered.
    shift: z.coerce.number().int().min(-BUNDLE_SHIFT_LIMIT).max(BUNDLE_SHIFT_LIMIT).optional(),
    budgetBytes: z.coerce.number().int().min(512).max(1024 * 1024).optional(),
  })
  .strict()

const exportBody = z
  .object({
    bundleId: z.string().min(1),
    // TRUE MEANS ONE ZIP HOLDING THE TEXT AND THE RELATED FILES. Absent or false means the text
    // alone, exactly as this door answered before the choice existed.
    withFiles: z.boolean().optional(),
  })
  .strict()

/**
 * THE SAME QUESTION THE PREVIEW TAKES, PLUS THE PROJECT, because a browser tab sends no headers.
 *
 * `x-mole-office-workspace` is how every other read names its project, and a page a person opens in
 * a new tab cannot carry one. Chapter 4's first rule is that a read naming the wrong project is
 * answered about the wrong project and looks normal, so this door takes the project in the address
 * and REFUSES when it is missing rather than falling back to the default. Criterion B29.
 */
const asTextQuery = askQuery.extend({ workspace: z.string().min(1).optional() })

/** A filed bundle, by its id, for the door that serves that bundle's copy as a page of text. */
const asTextParams = z.object({ id: z.string().min(1) }).strict()

export const BUNDLES_NOTE =
  'THE BUNDLES FILED IN THIS PROJECT: what somebody wanted a copy of, and what has actually left. A bundle holds ' +
  'no project content — it is a scope, a preset, and a list of exports. Its text is resolved from the records the ' +
  'scope names every time it is asked for. ?projects=all reads the bundles of every project the reader may read, ' +
  'and ?projects=<project id> reads one project chosen in the address instead of the header; either way every ' +
  'row carries `workspaceId`, the project it is kept in, and the reply names the projects it read in `projects`. ' +
  'No rule keeps a reader out of a whole project today, so every registered project is read.'

export const PREVIEW_NOTE =
  'THE TEXT A BUNDLE PRODUCES RIGHT NOW, without recording anything: GET /api/bundles/preview?scope=<record ' +
  'id>&preset=continue. Leave `scope` out for the whole project. WRITES NOTHING and records no export, so a ' +
  'preview is not evidence that anything left the building. The reply says what was carried, what was left out ' +
  'and of what kind, every validity restriction that reaches anything it carries, and whether the text fitted in ' +
  'its budget. A restriction that could not be read for a record in scope makes this reply say so; the EXPORT is ' +
  'what refuses. `parts` says what each named part of the copy carried and which reader answered it. Naming a ' +
  'part Mole Office has no name for is REFUSED with 400 rather than quietly left out, and a list of parts is only ' +
  'read with the `custom` preset — sent beside any other preset it is refused, because every other preset IS ' +
  `its list. The parts are: ${SCOPE_NAMES.join(', ')}.`

export const AS_TEXT_NOTE =
  'THE COPY AS A PAGE OF PLAIN TEXT, for a browser that cannot copy: GET /api/bundles/as-text?workspace=<project ' +
  'id>&preset=continue, or GET /api/bundles/<bundle id>/as-text for one already filed. It answers text/plain and ' +
  'nothing else, so any browser on any machine draws it as words a person can select. It RECORDS NOTHING, exactly ' +
  'like the preview: this is the same text through a door that needs no clipboard, not a second kind of export. ' +
  'It refuses with 409 for the reason the export refuses, and that is the point of it — a page of text has no ' +
  'room beside it to say a validity restriction could not be read, so text nobody can vouch for does not get a ' +
  'URL. The text is resolved when the page is asked for, so it is a fresh reading of the same recipe rather than ' +
  'a replay of an earlier one, and the text says in its own first lines when it was made. The spec door takes ' +
  'the project in the address because a browser tab sends no headers, and refuses without one rather than ' +
  'answering about the default project.'

export const EXPORT_NOTE =
  'HAND THIS CONTEXT TO AN AGENT MOLE OFFICE DOES NOT RUN: POST /api/bundles/export {"bundleId":"<id>"}. It resolves ' +
  'the bundle, records what left — the record ids with the version each held at that moment, the restrictions ' +
  'that went with them, the size and a hash of the text — and answers with the text. ADD "withFiles": true and ' +
  'it answers one zip instead: text.txt is the same text, files/ holds every file under report-files/ or ' +
  'message-pictures/ that a carried record names, and manifest.json names each file with its size, its sha256 and ' +
  'the records that named it, or says why it was missing or left out. The record of the export keeps the same ' +
  'answer about the files, and the zip is named from the bundle title and the export number. IT REFUSES WITH 409 ' +
  'when a validity restriction could not be read for a record in scope: text that leaves with a temporary value ' +
  'and without its limit is the failure this route exists to prevent, and a partial answer would be that failure ' +
  'with a 200 on it. Mole Office does not send anything anywhere and never claims delivery.'

export async function bundleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/bundles', route('bundle.read', 'remote', BUNDLES_NOTE), async (req) => {
    // THE ONE QUERY WORD THIS LIST TAKES, `?projects=all` or `?projects=<project id>`, read by the one
    // reader of it. The list reads no other query word, as before.
    const reader = theMessageReader(actorFrom(req))
    const projects = theProjectsAQueryAsks(req.query, reader)
    // THE OLD READING, UNCHANGED: no `projects` word, so the project the header names, and rows that
    // do not say their project because they are all in that one.
    if (projects === null) {
      const workspaceId = workspaceOf(req)
      return { bundles: listRecords({ workspaceId, kind: 'context_bundle' }).map(aKeptBundle), note: BUNDLES_NOTE }
    }
    // THE READING ACROSS PROJECTS. The projects asked for among those the reader
    // may read, and the rows of them the reader may see. A bundle is never a message, so the message rule
    // takes nothing out here; it is applied all the same so this door answers the question every
    // across-projects door answers in the same way.
    const rows = theRowsTheReaderMaySee(listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'context_bundle' }), projects, reader)
    return {
      bundles: rows.map((r) => ({ ...aKeptBundle(r), workspaceId: r.workspaceId })),
      projects: projects.map((workspace) => workspace.id),
      note: BUNDLES_NOTE,
    }
  })

  app.get('/bundles/preview', route('bundle.read', 'remote', PREVIEW_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = parse(askQuery, req.query, 'The query string is not usable:')
    const spec = specFromQuery(query)
    // NO MESSAGE THE CALLER MAY NOT READ is in the copy.
    const resolved = await resolveBundle(spec, workspaceId, theMessageReader(actorFrom(req)))
    return {
      spec,
      text: resolved.text,
      carried: resolved.carried,
      restrictions: resolved.restrictions,
      leftOut: resolved.leftOut,
      parts: resolved.parts,
      couldNotCheck: resolved.couldNotCheckInScope,
      standingGaps: resolved.standingGaps,
      characters: resolved.characters,
      bytes: resolved.bytes,
      // THE SAME SIZE IN TOKENS, BESIDE THE BYTES. Criterion T3. Both the number and the sentence
      // saying it is an estimate come from the copy's own resolver, which reads the one declaration
      // in `src/config/token-estimate.mjs`; the field names are the brief's, so the two replies read
      // alike.
      tokensEstimated: resolved.tokensEstimated,
      charsPerTokenAssumed: resolved.charsPerTokenAssumed,
      tokensAreAnEstimate: resolved.tokensAreAnEstimate,
      fits: resolved.fits,
      // WHICH POSITION WAS ASKED FOR AND HOW MANY ENTRIES COULD NOT BE DRAWN THERE. A caller that
      // asked for the children of every record and got titles has to be told, and told how many.
      detail: resolved.detail,
      drawnShorter: resolved.drawnShorter,
      // WHERE THE LADDER STOPS FOR THIS COPY, so the page can say it and stop *more* there rather
      // than offering a level nothing in front of the reader is written at. Criterion B32.
      top: resolved.top,
      // THE READINGS THIS COPY WAS MADE OF, each taken once, with every part that drew on each.
      // Criterion B20 of design/bundle/ACCEPTANCE.md: a copy is assembled from the readings the
      // fast context routes answer out of, and this is the reply saying which ones those were.
      assembledFrom: resolved.assembledFrom,
      note: PREVIEW_NOTE,
    }
  })

  /**
   * THE COPY AS A PAGE OF TEXT, FROM A SPEC. Criterion B29.
   *
   * A page of plain text, or a text box that opens, lets the words be copied by hand. A browser without
   * a secure context has no clipboard, and a page of plain text needs
   * none: the words arrive in a tab and the person selects them with the keyboard, or saves the
   * page, or reads it on a machine that has no Mole Office at all.
   *
   * IT RECORDS NOTHING, and that is why it is `bundle.read` and not `bundle.export`. It produces
   * exactly what the preview produces and writes exactly what the preview writes, which is nothing.
   * Naming it the export operation would put a write in the operations table for a request that
   * makes none, and the table is what answers how often anything actually leaves.
   */
  app.get('/bundles/as-text', route('bundle.read', 'remote', AS_TEXT_NOTE), async (req, reply) => {
    const query = parse(asTextQuery, req.query, 'The query string is not usable:')
    if (query.workspace === undefined) {
      void reply.code(400)
      return asAPageOfText(
        reply,
        'This address named no project, so Mole Office does not know which one to assemble a copy of. A page ' +
          'opened in a browser tab cannot send the header every other read names its project with, so this ' +
          'door takes it in the address instead: add workspace=<the project id>. Nothing was assembled. ' +
          'Answering from the default project would have handed you a copy of the wrong one, and it would ' +
          'have looked exactly like the right one.',
      )
    }
    const workspaceId = requireWorkspace(query.workspace, true).id
    const spec = specFromQuery(query)
    return asAPageOfText(reply, textOrTheRefusal(reply, await resolveBundle(spec, workspaceId, theMessageReader(actorFrom(req)))))
  })

  /**
   * THE SAME PAGE, FOR A BUNDLE ALREADY FILED. Criterion B29.
   *
   * IT TAKES NO PROJECT, and that is not an omission: a bundle is a record, a record knows which
   * project it is in, and reading it off the record is stricter than trusting an address. The spec
   * door above cannot do this because there is no record there to ask.
   */
  app.get('/bundles/:id/as-text', route('bundle.read', 'remote', AS_TEXT_NOTE), async (req, reply) => {
    const { id } = parse(asTextParams, req.params, 'The address is not usable:')
    const record = getRecord(id)
    if (record === null || record.kind !== 'context_bundle') {
      void reply.code(404)
      return asAPageOfText(reply, `There is no context bundle with the id ${id}. Nothing was assembled.`)
    }
    const spec = specOf(record.data)
    return asAPageOfText(reply, textOrTheRefusal(reply, await resolveBundle(spec, record.workspaceId, theMessageReader(actorFrom(req)))))
  })

  app.post('/bundles/export', route('bundle.export', 'remote', EXPORT_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    const body = parse(exportBody, req.body, 'The body is not usable:')
    const record = getRecord(body.bundleId)
    if (record === null || record.kind !== 'context_bundle') {
      throw new PanelError(`No context bundle with id ${body.bundleId}. Nothing was exported.`, 404)
    }
    const spec = specOf(record.data)
    const resolved = await resolveBundle(spec, workspaceId, theMessageReader(actorFrom(req)))

    // ---- RULE 4. THE ONE REFUSAL THIS ROUTE EXISTS FOR.
    //
    // A restriction that could not be read for a record in scope means Mole Office cannot say whether
    // the text it is about to produce carries a temporary value without its limit. Invariant 1: a
    // reply that says a thing was done must mean it was done. So nothing is written and nothing is
    // copied, and the answer names the records it could not check.
    //
    // IT IS NOT A BLANKET REFUSAL, and that took measuring. `restrictionsInScope` ALWAYS returns
    // one `couldNotCheck` entry — the implementation map has no read that rolls the import graph up
    // to records — so a guard keyed on `couldNotCheck.length > 0` would refuse every export for
    // ever while looking like it worked. That standing gap is printed in the text instead.
    if (resolved.couldNotCheckInScope.length > 0) {
      void reply.code(409)
      return {
        refused: true,
        couldNotCheck: resolved.couldNotCheckInScope,
        note:
          'Nothing was exported and nothing was written. Mole Office could not read the validity restrictions for ' +
          `${String(resolved.couldNotCheckInScope.length)} record(s) this bundle would have carried, so it cannot say ` +
          'whether the text carries a temporary value without the limit that belongs to it. Fix or delete the ' +
          'records named above and export again.',
      }
    }

    // WRITTEN BY THE SERVER, THROUGH THE ORDINARY PATCH DOOR, by the one function that writes an
    // export entry. `assertMayWriteAnExportList` refuses every caller that names `exports`, and the
    // function tells that guard this write is the server's own act with a SYMBOL key, because
    // `JSON.parse` cannot produce one and no request body can therefore carry it.
    if (body.withFiles !== true) {
      const entry = recordAnExport({ bundle: record, resolved, text: resolved.text, actor })
      return { export: entry, text: resolved.text, note: EXPORT_NOTE }
    }

    // THE ZIP IS BUILT BEFORE ANYTHING IS WRITTEN, so a file that cannot be read or a set that
    // cannot be written refuses the whole export rather than recording one that never left.
    const carried = resolved.carried
      .map((one) => getRecord(one.recordId))
      .filter((one): one is PanelRecord => one !== null)
    const made = theZipExportOf({
      records: carried,
      text: resolved.text,
      title: record.title,
      n: exportsOf(record.data).length + 1,
    })
    const entry = recordAnExport({ bundle: record, resolved, text: resolved.text, actor, files: made.files })
    void reply.type('application/zip')
    void reply.header('content-disposition', `attachment; filename="${exportFileName(record.title, entry.n)}"`)
    return made.zip
  })
}

/** ONE ROW OF THE KEPT BUNDLES, with what has left the building. */
function aKeptBundle(r: PanelRecord) {
  const exports = exportsOf(r.data).map((e) => ({ n: e.n, at: e.at, bytes: e.bytes, textHash: e.textHash }))
  try {
    return { id: r.id, title: r.title, spec: specOf(r.data), unreadable: null, exports }
  } catch (err) {
    // ONE UNREADABLE ROW IS NOT AN UNREADABLE LIST, AND IT IS NOT A ROW THAT VANISHES EITHER.
    // The row is drawn with the sentence saying what could not be read, so a person can see
    // the bundle exists and why it cannot be copied. Dropping it would be the list telling
    // them a bundle they filed is gone.
    return {
      id: r.id,
      title: r.title,
      spec: null,
      unreadable: err instanceof Error ? err.message : String(err),
      exports,
    }
  }
}

/**
 * SAY IT AS A PAGE OF PLAIN TEXT, whatever it is. Criterion B29.
 *
 * `text/plain` AND NOT `text/html`, ALWAYS. A copy carries whatever people wrote in their records,
 * and a browser told the words are HTML would run some of them. Serving it as text means a browser
 * draws it as words, on any machine, with no clipboard and no Mole Office at the other end.
 *
 * A REFUSAL IS A PAGE OF TEXT TOO. A person who opened a tab and got a paragraph of JSON has been
 * answered in a language they did not ask a question in.
 */
function asAPageOfText(reply: { type: (value: string) => unknown }, text: string): string {
  void reply.type('text/plain; charset=utf-8')
  return text
}

/**
 * THE TEXT, OR THE ONE REFUSAL THE EXPORT MAKES, in words.
 *
 * THE SAME CONFINEMENT AS THE EXPORT, and it is the whole reason this is a separate function rather
 * than a return. A restriction that could not be read means Mole Office cannot say whether the text
 * carries a temporary value without its limit. The bundles page draws that as its own thing above
 * the copy, where a person about to paste it can see it; a page of plain text has nowhere to put it
 * and no way to make it stand out. So this door refuses where the export refuses, and says so.
 */
function textOrTheRefusal(
  reply: { code: (value: number) => unknown },
  resolved: Awaited<ReturnType<typeof resolveBundle>>,
): string {
  if (resolved.couldNotCheckInScope.length === 0) return resolved.text
  void reply.code(409)
  return (
    'Nothing was assembled.\n\n' +
    `Mole Office could not read the validity limits for ${String(resolved.couldNotCheckInScope.length)} record(s) ` +
    'this copy would have carried, so it cannot say whether the text carries a temporary value without the limit ' +
    'that belongs to it. A page of plain text has no room beside it to say so, which is why you are reading this ' +
    'instead of a copy.\n\n' +
    resolved.couldNotCheckInScope.map((one) => `  ${one.what}: ${one.because}`).join('\n') +
    '\n\nFix or delete the records named above and open this again.\n'
  )
}

/**
 * THE SPEC A QUERY STRING ASKS FOR, REFUSED RATHER THAN NARROWED.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS REPLACES, MEASURED 27 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/bundles/preview?preset=continue&slots=plan,schedule,waiting` was answered 200. The
 * three names were filtered out of the array, the array went empty, the key was dropped, and the
 * caller was handed the default reading with nothing anywhere in the reply saying its request had
 * been narrowed. A caller that asked for the Plan was told yes and given something else, which is
 * the silent semantic fallback CLAUDE.md forbids by name.
 *
 * IT IS ONE FUNCTION THAT DECIDES IT, shared with `specOf` above, so a spec that is refused through
 * this door cannot be accepted through the stored-bundle door.
 */
function specFromQuery(query: z.infer<typeof askQuery>): BundleSpec {
  const slots = query.slots?.split(',').map((one) => one.trim()).filter((one) => one !== '')
  const why = whyTheseSlotsCannotBeUsed(query.preset, slots)
  if (why !== null) throw new PanelError(why, 400)
  // AN EMPTY VALUE IS A CALLER NAMING NONE, and it is refused with the sentence that says so rather
  // than read as a list holding one blank. Blanks between commas go the way `slots` sends them: a
  // trailing comma in a query string is a typing accident, not somebody sending a blank id. The
  // JSON door keeps a blank inside a real array, where it IS somebody sending one, and refuses it.
  const chosenStructure = query.modulesAndPipelines
    ?.split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '')
  const added = query.additionalRecords
    ?.split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '')
  const cannotAdd = whyTheseAdditionalRecordsCannotBeUsed(added)
  if (cannotAdd !== null) throw new PanelError(cannotAdd, 400)
  return {
    scope: query.scope === undefined ? { kind: 'project' } : { kind: 'record', recordId: query.scope },
    preset: query.preset,
    ...(slots === undefined ? {} : { slots: slots as ScopeName[] }),
    ...(query.reach === undefined ? {} : { reach: query.reach as 1 | 2 | 3 }),
    ...(chosenStructure === undefined ? {} : { modulesAndPipelines: chosenStructure }),
    ...(added === undefined ? {} : { additionalRecords: added }),
    ...(query.detail === undefined ? {} : { detail: query.detail }),
    ...(query.shift === undefined ? {} : { shift: query.shift }),
    budgetBytes: budgetFor(query.preset, query.budgetBytes),
  }
}
