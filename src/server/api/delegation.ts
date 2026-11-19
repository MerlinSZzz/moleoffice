// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PACKAGES OVER HTTP: THE COLUMN, THE DOOR THAT MAKES ONE, AND THE DOOR A PERSON TAKES ONE THROUGH.
 *
 *   GET  /api/delegation                        every packaged task in this project, newest first
 *   POST /api/delegation/:recordId/package       make a task into a package
 *   POST /api/delegation/:recordId/take          a person takes a package outside the office
 *
 * THE COLUMN IS A READING OF THE RECORDS. The list route reads the task's own `package` field, the
 * live claims on it, the export list on its bundle, its returns and its completion, and holds no
 * table and no second store of its own. Criterion F16 point 8.
 *
 * THE PACKAGING DOOR IS ONE TRANSACTION OVER THREE WRITES. It files the context bundle, links it to
 * the task with an `about` link and writes the task's package field, all or nothing, so a task
 * cannot be half packaged. Criterion F16 point 1.
 *
 * THE FILES COME FROM THE MODULES THE PACKAGE NAMES, criterion F16 point 1 as corrected by decision
 * 5fIvP6qTPzgM. `POST /api/implementation` refuses a task by design — the map means ownership and
 * only a module, a block or a pipeline can own code — so the packager names the module records the
 * work is in with `moduleIds`, an id that names nothing or not one of those three is refused by
 * name, and the reply carries the files stated for them through `statedFor`. The reply's sentence
 * about the files says they are the files of the modules this work is in, never the task's own; it
 * is written once in src/shared/delegation.ts. When no module is named, or a named module has no
 * stated code, the reply says so rather than filling the gap.
 *
 * THE TAKE DOOR IS A PERSON'S OWN ACT, NEVER A CLAIM. Criterion F16 points 3 and 4. An agent takes
 * a package with the claim it already has, through POST /api/claims — that needs no door here at
 * all, which is the point criterion F16 point 3 asked to have proved rather than built. A person's
 * take is a different fact, refused unless the caller is proved to be the person or is a secretary
 * the person's grant carries there, and it opens a conversation with whoever `responsibleFor` names.
 * The whole rule is in lib/delegation.ts, beside `takePackageOutside`.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { gatePosition } from '../../config/settings.mjs'
import { actorFrom, takesNoBody, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { getRecord, recordInWorkspace } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import type { PanelRecord } from '@shared/types.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { requireWorkspace } from '../lib/require-workspace.ts'
import { recordAnExport, exportsOf } from '../lib/bundle.ts'
import { exportFileName } from '@shared/zip-export/manifest.ts'
import { theZipExportOf } from '../lib/zip-export/related-files.ts'
import { actorTypeWord, packageReturnFormWord } from '@shared/words.ts'
import {
  takeThePackageInside, restateThePackage, answerThePackageAlignment, handBackThePackage, checkThePackage, acceptThePackage, packageOf,
  confirmThePackage,
  delegationColumn,
  makeThePackage,
  recordTheReturn,
  takePackageOutside,
  theSuitsInWords,
} from '../lib/delegation.ts'
import { theRefusedFindings, theTextForOutside, whyTheScreenRefused } from '../lib/outside.ts'

// ============================================================================ the sentences

export const DELEGATION_NOTE =
  'THIS IS WHERE THE PACKAGED TASKS ARE, newest package first, and a new agent picks its first task here. ' +
  'A package is a task whose work has been written up for somebody else: its context bundle, the words for a ' +
  'reader outside the office, which kind of outside work it suits, the acceptance criteria and where they were ' +
  'copied from. Every row is drawn from the records themselves — the task\'s own package field, the live claims ' +
  'on it, the export list on its bundle, its returns and its completion — so there is no second store. A row that ' +
  'is both claimed by an agent and taken outside by a person says both. `couldNotRead` names a packaged task whose ' +
  'package field cannot be read rather than dropping it.'

export const PACKAGE_NOTE =
  'MAKE A TASK INTO A PACKAGE SOMEBODY ELSE CAN PICK UP: POST /api/delegation/<task id>/package with ' +
  '`forTheOutside`, `suits`, `acceptance` and `acceptanceSource`, and optionally `preset`, `detail` and `moduleIds` ' +
  '— the record ids of the modules the work is in. It files a `context_bundle` for the task, links the bundle to ' +
  'the task with an `about` link and writes the task\'s `package` field IN ONE TRANSACTION, so a task cannot be ' +
  'half packaged. `forTheOutside` and `acceptance` say what is theirs to change and what finished means; `suits` ' +
  'is one of the three kinds of outside work; `acceptanceSource` is the file, the criterion and the commit the ' +
  'acceptance prose was copied from. The preset is `continue` and the detail is `gist` unless another is sent. ' +
  'THE FILES COME FROM THE NAMED MODULES, never from this task: `POST /api/implementation` refuses a task by ' +
  'design, so an id in `moduleIds` that names nothing in this project, or a record of a kind that cannot own code ' +
  '(a relationship to code is about a module, a block or a pipeline), is refused by name, and the reply carries ' +
  'the files stated for the named modules and says they are the files of the modules this work is in — never the ' +
  'files this task owns. A package that names no module, or a module with no stated code, says so rather than ' +
  'refusing. PACKAGING A TASK AGAIN REPLACES THE PACKAGE AND FILES A NEW BUNDLE; the old bundle record stays, so ' +
  'what already left the building is still answerable.'

export const TAKE_NOTE =
  'A PERSON TAKES A PACKAGED TASK OUT OF THE OFFICE: POST /api/delegation/<task id>/take with `who`, ' +
  '`comesBack` and `byWhen`, all three required. `who` says who will do the work — an outside chat by name, or ' +
  'a person; `comesBack` says what will come back and in which form; `byWhen` says when it is expected, in ' +
  'local wall clock. A missing field is refused BY NAME, every missing one at once rather than only the first. ' +
  'THIS IS NOT A CLAIM: it appends one entry to the task\'s append-only `takenOutside` list, through the ' +
  'ordinary record write, and an entry once written is never changed or removed. A SECRETARY HOLDING THE ' +
  'PERSON\u2019S GRANT may press it for them where this office\u2019s list of what the grant carries says so, the ' +
  'secretary card keeps it for the person by default, and the entry then names the secretary as the one who took ' +
  'it. ANY OTHER AGENT IS REFUSED HERE OUTRIGHT: an agent takes a package with the claim it already has, through ' +
  'POST /api/claims. OTHERWISE THIS DOOR IS THE PERSON\'S OWN ACT and is refused unless the caller is proved to be ' +
  'the person, by the same proof every one of their other acts already uses. IT OPENS A CONVERSATION with whoever ' +
  '`responsibleFor` names, carrying a lead to the task, and says so in its reply; when nobody can be worked out ' +
  'the take still happens and the reply says nobody was told and why.'

export const RETURN_NOTE =
  'A PERSON PUTS SOMETHING BACK THAT CAME FROM OUTSIDE THE OFFICE: POST /api/delegation/<task id>/return with ' +
  '`fromOutside` naming the outside chat or person the work was done by, and at least one of `words` (what ' +
  'they wrote), `pictures` (the paths POST /api/messages/pictures handed back) or `file` (the path POST ' +
  '/api/returned-files handed back). IT TAKES PATHS AND NEVER BYTES: it writes no file and has no store of its ' +
  'own, and a path no storing door produced is refused rather than stored. It APPENDS ONE ENTRY to the task\'s ' +
  'append-only `returns` list, and an entry once written is never changed or removed. EVERY ENTRY IS SOMEBODY ' +
  'OUTSIDE THE OFFICE\'S OWN WORDS, BY NAME, brought back by the person; it is never this office\'s own ' +
  'observation, a finding, a stopping point or a measurement. A SECRETARY HOLDING THE PERSON\u2019S GRANT may ' +
  'press it for them where this office\u2019s list of what the grant carries says so, the secretary card keeps it ' +
  'for the person by default, and the entry then names the secretary as the one who brought it back. ANY OTHER ' +
  'AGENT IS REFUSED: an agent\'s return is the ordinary acceptance exactly as it stands today. OTHERWISE THIS DOOR ' +
  'IS THE PERSON\'S OWN ACT and is refused unless the caller is proved to be the person, by the same proof every ' +
  'one of their other acts already uses.'

export const CONFIRM_NOTE =
  'THE ONE RESPONSIBLE, OR THE PERSON, SAYS A PACKAGE\'S TASK IS FINISHED: POST /api/delegation/<task ' +
  'id>/confirm writes the task\'s `completed` field — who confirmed it and when — ONCE. It takes no body. It is ' +
  'reserved to whoever `responsibleFor` names and to the person, and every other caller is refused by name with ' +
  'the refusal saying who may. A task whose responsible one cannot be worked out is still confirmable by the ' +
  'person and by nobody else. While the gate who-confirms-a-packaged-task-finished is off, any agent its own key ' +
  'proves may also confirm a task, that one included, and the confirmation names that agent. IT IS THE LAST STEP ' +
  'AND NOT A SHORTCUT: an agent\'s return is the ordinary acceptance exactly as it stands today, and this is the ' +
  'one step added after it. IT RELEASES NOTHING: ' +
  'releasing a claim retires the agents started for the record, so a confirmation that released first would ' +
  'retire the worker before its work was confirmed. Nothing here writes a claim.'

export const EXPORT_OUTSIDE_NOTE =
  'MAKE THE TEXT A PERSON COPIES INTO AN OUTSIDE CHAT: POST /api/delegation/<task id>/export-outside. It takes ' +
  'no body, or one optional key: "withFiles": true. The text is the package\'s bundle text, then the acceptance ' +
  'criteria in full with the file, criterion and commit they were copied from, the office regulations by chapter ' +
  'and rule name only, and the packager\'s words for the outside — what may be changed and what is to be ' +
  'returned. Before anything is recorded the whole text goes through the screen: a `refused` finding means ' +
  'nothing is exported, nothing is recorded, and the refusal names every finding; a `look_before_you_paste` ' +
  'finding stops nothing, and it reaches the person on both answers — the text answer carries it in the reply, ' +
  'and a zip answer records it on the export entry beside the files, where the page draws it before the person ' +
  'pastes or keeps the zip. A successful export ' +
  'records the entry on the bundle through the bundle\'s own export door, with the version each record held, so ' +
  'there is one record of what left the building and not two. WITH "withFiles": true it answers one zip instead: ' +
  'text.txt is the same text, files/ holds every file under report-files/ or message-pictures/ that the task or ' +
  'a carried record names, and manifest.json names each file with its size, its sha256 and the records that named ' +
  'it, or says why it was missing or left out. The entry keeps the same answer about the files, and the zip is ' +
  'named from the task title and the export number. The screen never edits: this door either hands over the whole ' +
  'text or refuses it.'

export const AS_TEXT_NOTE =
  'THE SAME TEXT AS A PAGE OF PLAIN TEXT A BROWSER CAN SELECT: GET /api/delegation/as-text?workspace=<project ' +
  'id>&task=<task id>. It takes the project in the address because a tab opened from a link sends none of this ' +
  'app\'s headers. It answers text/plain and nothing else, and it RECORDS NOTHING — this is the same text through ' +
  'a door that needs no clipboard, not a second kind of export. It refuses where the export refuses: a `refused` ' +
  'finding and a validity restriction that could not be read are both answered as a page of text saying so, and ' +
  'no text is served.'

// ============================================================================ what a caller sends

const packageParams = z.object({ recordId: z.string().min(1) }).strict()

/**
 * WHAT THE PAGE OF TEXT ASKS, TAKEN IN THE ADDRESS RATHER THAN FROM A HEADER.
 *
 * A browser tab opened from a link sends none of this app's headers, so the project has to travel in
 * the address and is REFUSED when it is missing rather than read as the default project. That is the
 * same rule criterion B29 gave `GET /api/bundles/as-text`, and the same reason: a copy of the wrong
 * project looks exactly like a copy of the right one.
 */
const asTextQuery = z
  .object({
    workspace: z.string().min(1).optional(),
    task: z.string().min(1),
  })
  .strict()

const packageBody = z
  .object({
    // EVERY KEY IS OPTIONAL AT THIS LAYER ON PURPOSE. The refusal for a missing or empty one is a
    // sentence naming what is wrong, and that sentence lives in lib/delegation.ts beside the rule.
    // A `z.string().min(1)` here would answer with a shape error instead of the rule.
    forTheOutside: z.string().optional(),
    suits: z.string().optional(),
    moduleIds: z.array(z.string()).optional(),
    parent: z.unknown().optional(), line: z.unknown().optional(), lines: z.unknown().optional(), pointIds: z.unknown().optional(),
    acceptance: z.string().optional(),
    acceptanceSource: z.record(z.string(), z.unknown()).optional(),
    preset: z.string().optional(),
    detail: z.string().optional(),
  })
  .strict()

const takeBody = z
  .object({
    // THE SAME REASON THE PACKAGE BODY ABOVE LEAVES EVERY KEY OPTIONAL: the refusal for a missing
    // or empty field names the field and lives in lib/delegation.ts beside the rule it is part of.
    who: z.string().optional(),
    comesBack: z.string().optional(),
    byWhen: z.string().optional(),
  })
  .strict()

const returnBody = z
  .object({
    // THE SAME REASON THE TWO BODIES ABOVE LEAVE THEIR KEYS OPTIONAL: every refusal below names the
    // field it is about and lives in lib/delegation.ts beside the rule.
    fromOutside: z.string().optional(),
    words: z.string().optional(),
    pictures: z.array(z.string()).optional(),
    file: z.string().optional(),
  })
  .strict()

/**
 * THE ONE CHOICE THE OUTSIDE EXPORT NOW TAKES, AND NOTHING ELSE.
 *
 * A request with no body is still the ordinary press: `nullish` lets the door answer it. `true`
 * asks for one zip holding the text and the related files; absent or false is the text as before.
 */
const exportOutsideBody = z
  .object({
    withFiles: z.boolean().optional(),
  })
  .strict()
  .nullish()

// ============================================================================ the routes

export async function delegationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/delegation', route('delegation.list', 'remote', DELEGATION_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const read = delegationColumn(workspaceId)
    return {
      tasks: read.rows,
      couldNotRead: read.couldNotRead,
      workspaceId,
      note: DELEGATION_NOTE,
    }
  })

  app.get('/delegation/inside', route('delegation.inside', 'remote', 'Read the briefs open to work inside the office.'), async (req) => {
    const workspaceId = workspaceOf(req)
    const reading = delegationColumn(workspaceId, true)
    return { tasks: reading.rows, couldNotRead: reading.couldNotRead, answerRequired: gatePosition('package-alignment-answer') === '1', workspaceId, note: 'These are the briefs for inside work.' }
  })

  app.post('/delegation/:recordId/take-inside', route('delegation.takeInside', 'remote', "Take a task's package inside the office: record who took it and when. A second take is recorded too, the newest taker is the one shown, and the earlier taker is told."), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({  }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    // THE RUN THAT TOOK IT IS READ FROM ITS RUN KEY (`proveOwnRun`), for the line that tells the maker.
    const result = takeThePackageInside({ taskId: recordId, workspaceId, actor: actorFrom(req, { proveOwnRun: true }), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/align', route('delegation.align', 'remote', "Record the taker's restatement of an inside package and its plan, for the maker to answer."), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({ restated: z.unknown().optional(), plan: z.unknown().optional(), goOnWhy: z.unknown().optional() }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    // THE RUN THAT RESTATED IT IS READ FROM ITS RUN KEY (`proveOwnRun`), for the line that tells the maker.
    const result = restateThePackage({ taskId: recordId, workspaceId, actor: actorFrom(req, { proveOwnRun: true }), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/align-answer', route('delegation.alignAnswer', 'remote', "Answer the newest restatement of an inside package as aligned or differs, with the maker's words. A second answer is recorded too, and the newest counts."), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({ answer: z.unknown().optional(), words: z.unknown().optional() }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    const result = answerThePackageAlignment({ taskId: recordId, workspaceId, actor: actorFrom(req), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/hand-back', route('delegation.handBack', 'remote', 'Hand an inside package back, with an outcome and words for every one of its points. A hand-back before the plan was aligned is recorded too, with a reminder.'), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({ points: z.array(z.object({ pointId: z.unknown().optional(), outcome: z.unknown().optional(), words: z.unknown().optional() }).strict()).optional() }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    // THE RUN THAT WROTE THE HAND-BACK IS READ FROM ITS RUN KEY (`proveOwnRun`), never from the session header, so the
    // inspector of that run's check is the one who may judge it.
    const result = handBackThePackage({ taskId: recordId, workspaceId, actor: actorFrom(req, { proveOwnRun: true }), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/check', route('delegation.check', 'remote', "Check the latest hand-back of an inside package: the maker answers holds or refused with its words, and the inspector of the run that handed it back judges each point."), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({ answer: z.unknown().optional(), words: z.unknown().optional(), points: z.unknown().optional() }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    const result = checkThePackage({ taskId: recordId, workspaceId, actor: actorFrom(req), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/accept', route('delegation.accept', 'remote', "Accept or return the points of an inside package's latest hand-back, as its maker or the person: each point named is accepted, or returned to the taker with words."), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(z.object({ points: z.unknown().optional() }).strict(), req.body ?? {}, 'The inside brief cannot accept this body:')
    const result = acceptThePackage({ taskId: recordId, workspaceId, actor: actorFrom(req), ...body })
    reply.code(201)
    return { ...result, note: 'The inside brief records this step.' }
  })

  app.post('/delegation/:recordId/package', route('delegation.package', 'remote', PACKAGE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    // THE RECORD IS READ FIRST, through the one function that answers about an id in one project,
    // so an id from another project is refused by name before the body is looked at. A body cannot
    // turn a cross-project id into an answer, and nothing is written.
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(packageBody, req.body, 'That is not something Mole Office can package:')
    const made = makeThePackage({
      taskId: recordId,
      workspaceId,
      forTheOutside: body.forTheOutside ?? '',
      suits: body.suits ?? '',
      ...(body.moduleIds === undefined ? {} : { moduleIds: body.moduleIds }),
      ...(body.parent === undefined ? {} : { parent: body.parent }),
      ...(body.line === undefined ? {} : { line: body.line }),
      ...(body.lines === undefined ? {} : { lines: body.lines }),
      ...(body.pointIds === undefined ? {} : { pointIds: body.pointIds }),
      acceptance: body.acceptance ?? '',
      acceptanceSource: body.acceptanceSource ?? {},
      ...(body.preset === undefined ? {} : { preset: body.preset }),
      ...(body.detail === undefined ? {} : { detail: body.detail }),
      actor: actorFrom(req),
    })
    reply.code(201)
    // THE SENTENCE ABOUT THE FILES IS DRAWN, NOT REWRITTEN HERE. `filesSays` is the one sentence —
    // these are the files of the modules this work is in, never the files this task owns — and it
    // is written once in src/shared/delegation.ts, which also names the modules that have no
    // stated code when some of the named ones do. The pointer to the door that states code names
    // the module rather than this task, because a task cannot own code.
    const code =
      made.statedCodeFromModules === 0
        ? `${made.filesSays} Stating code is POST /api/implementation on a module.`
        : `${made.filesSays} ${String(made.statedCodeFromModules)} stated code row(s) came back across the ` +
          `${String(made.namedModuleCount)} module(s) named; stating code is POST /api/implementation on a module.`
    const replaced =
      made.replacedBundleId === null
        ? ' This task had no package before.'
        : ` This replaced the package that pointed at bundle ${made.replacedBundleId}; that bundle record was not ` +
          'touched, so what already left the building is still answerable.'
    return {
      task: { id: made.task.id, title: made.task.title },
      package: made.package,
      bundle: { id: made.bundle.id, title: made.bundle.title },
      link: { id: made.linkId, type: 'about' },
      suits: theSuitsInWords(),
      statedCodeCount: made.statedCodeCount,
      modules: made.modules,
      namedModuleCount: made.namedModuleCount,
      statedCodeFromModules: made.statedCodeFromModules,
      modulesWithNoStatedCode: made.modulesWithNoStatedCode,
      filesSays: made.filesSays,
      replacedBundleId: made.replacedBundleId,
      codeNote: code.trim(),
      note:
        `"${made.task.title}" is packaged. The bundle holds its context and the task holds the words for an ` +
        `outside reader; they are one package and the export door is what produces the text.${code}${replaced}`,
    }
  })

  app.post('/delegation/:recordId/take', route('delegation.take', 'remote', TAKE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    // THE RECORD IS READ FIRST, exactly as the packaging door above reads it: an id from another
    // project is refused by name before the body is looked at, and nothing is written.
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(takeBody, req.body, 'That is not a usable take:')
    const took = takePackageOutside({
      taskId: recordId,
      workspaceId,
      who: body.who,
      comesBack: body.comesBack,
      byWhen: body.byWhen,
      actor: actorFrom(req),
    })
    reply.code(201)
    const toldNote =
      took.toldId === null
        ? ` Nobody was told: ${took.responsible.why}`
        : ' The responsible one was sent a message with a lead to this task.'
    return {
      task: { id: took.task.id, title: took.task.title },
      entry: took.entry,
      responsible: took.responsible,
      toldId: took.toldId,
      note:
        `"${took.task.title}" is taken outside the office by ${took.entry.who}, expected back by ` +
        `${took.entry.byWhen}.${toldNote}`,
    }
  })

  app.post('/delegation/:recordId/return', route('delegation.return', 'remote', RETURN_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
    // THE RECORD IS READ FIRST, exactly as the two doors above read it: an id from another project
    // is refused by name before the body is looked at, and nothing is written.
    recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
    const body = parse(returnBody, req.body, 'That is not a usable return:')
    const came = recordTheReturn({
      taskId: recordId,
      workspaceId,
      fromOutside: body.fromOutside,
      words: body.words,
      pictures: body.pictures,
      file: body.file,
      actor: actorFrom(req),
    })
    reply.code(201)
    return {
      task: { id: came.task.id, title: came.task.title },
      entry: came.entry,
      form: came.entry.form,
      note:
        `"${came.task.title}" has something back from ${came.entry.fromOutside} as ` +
        `${packageReturnFormWord(came.entry.form).text}, marked as from outside the office. It is not confirmed ` +
        'yet: the responsible one, or the person, confirms it at POST ' +
        `/api/delegation/${came.task.id}/confirm.`,
    }
  })

  app.post(
    '/delegation/:recordId/confirm',
    route('delegation.confirm', 'remote', CONFIRM_NOTE),
    async (req, reply) => {
      // NO BODY FIRST, for the reason `POST /api/records/:id/restore` checks its empty input first:
      // a key this route does not read is refused before the address is looked at, and it is refused
      // by name. A request that carries no body at all passes this and goes on to the record, which
      // is what lets the project boundary answer a cross-project id with its own 404.
      takesNoInput(req, 'POST /api/delegation/<task id>/confirm', 'A confirmation is a press and carries no arguments.')
      const workspaceId = workspaceOf(req)
      const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
      // THE RECORD IS READ NEXT, exactly as the three doors above read it: an id from another
      // project is refused by name before anything is asked of the caller, and nothing is written.
      recordInWorkspace(recordId, workspaceId, theMessageReader(actorFrom(req)))
      const done = confirmThePackage({ taskId: recordId, workspaceId, actor: actorFrom(req) })
      reply.code(201)
      return {
        task: { id: done.task.id, title: done.task.title },
        completed: done.completed,
        responsible: done.responsible,
        note:
          `"${done.task.title}" is confirmed complete by ` +
          `${actorTypeWord(done.completed.by.actorType).text} ${done.completed.by.actorId} at ` +
          `${done.completed.at}. Confirming releases no claim on it.`,
      }
    },
  )

  /**
   * THE DOOR THAT MAKES THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT. Criterion F16 points 1 and 6.
   *
   * It takes no body: making the text is a press. The text and the screen over it come from
   * `theTextForOutside`; this route decides what to do with the answer. A `refused` finding stops
   * everything — nothing is exported and nothing is recorded. A `look_before_you_paste` finding
   * stops nothing: the text answer carries it in the reply for the person holding the clipboard,
   * and the zip answer records the same answer on the export entry, where the page draws it. Only
   * once the screen has not refused does the bundle's own export run, so the entry it writes is one
   * act and not two: the same `recordAnExport` `POST /api/bundles/export` calls.
   */
  app.post(
    '/delegation/:recordId/export-outside',
    route('delegation.exportOutside', 'remote', EXPORT_OUTSIDE_NOTE),
    async (req, reply) => {
      // THE QUERY STRING IS STILL REFUSED, and the body now takes one key. The refusal for any
      // other key names it, as every door that takes a body does, so a caller cannot believe this
      // door read something it did not.
      parse(
        takesNoBody(
          'POST /api/delegation/<task id>/export-outside',
          'The only argument this press takes is "withFiles", in the body.',
        ),
        req.query,
        'The query string is not usable:',
      )
      const body = parse(
        exportOutsideBody,
        req.body,
        'The only argument this press takes is "withFiles", true or false:',
      ) ?? {}
      const workspaceId = workspaceOf(req)
      const { recordId } = parse(packageParams, req.params, 'The address is not usable:')
      if (packageOf(recordInWorkspace(recordId, workspaceId).data)?.parent) throw new PanelError('This package is for inside work and has no outside export. Nothing was written.', 400)
      const made = await theTextForOutside(recordId, workspaceId, theMessageReader(actorFrom(req)))
      // THE BUNDLE'S OWN EXPORT REFUSES WHEN A RESTRICTION COULD NOT BE READ, and this door goes
      // through that export, so it refuses the same way and before the screen. A partial answer with
      // a temporary value and no limit is the failure the export exists to prevent.
      if (made.resolved.couldNotCheckInScope.length > 0) {
        throw new PanelError(theRestrictionsCouldNotBeRead(made.resolved.couldNotCheckInScope), 409)
      }
      if (theRefusedFindings(made.screening).length > 0) {
        throw new PanelError(whyTheScreenRefused(made.screening), 409)
      }
      if (body.withFiles === true) {
        // THE TASK IS THE PACKAGE, so it comes first among the records whose files may go. The
        // rest are the records the package's text carries, in the order the text carries them.
        const carried = made.resolved.carried
          .map((one) => getRecord(one.recordId))
          .filter((one): one is PanelRecord => one !== null)
        const zipExport = theZipExportOf({
          records: [made.task, ...carried],
          text: made.text,
          title: made.task.title,
          n: exportsOf(made.bundle.data).length + 1,
        })
        const entry = recordAnExport({
          bundle: made.bundle,
          resolved: made.resolved,
          text: made.text,
          actor: actorFrom(req),
          files: zipExport.files,
          // THE SCREEN'S ANSWER TRAVELS WITH THE ZIP THE SAME WAY THE COUNT DOES. A page that
          // chose the zip reads it back from this entry, so the person sees the findings a text
          // press would have drawn. The text press below passes none, and its entry is unchanged.
          screening: made.screening,
        })
        void reply.type('application/zip')
        void reply.header('content-disposition', `attachment; filename="${exportFileName(made.task.title, entry.n)}"`)
        return zipExport.zip
      }
      const entry = recordAnExport({
        bundle: made.bundle,
        resolved: made.resolved,
        text: made.text,
        actor: actorFrom(req),
      })
      return {
        task: { id: made.task.id, title: made.task.title },
        export: entry,
        text: made.text,
        // THE SCREEN IS CARRIED EVEN WHEN IT FOUND NOTHING, including the line saying other people's
        // names were not checked. A clean answer that did not say which checks ran would be read as
        // more than it is.
        screening: made.screening,
        note: EXPORT_OUTSIDE_NOTE,
      }
    },
  )

  /**
   * THE SAME TEXT AS A PAGE OF PLAIN TEXT. Criterion F16 points 1 and 6, criterion B29.
   *
   * It records nothing, and it takes the project in the address because a tab opened from a link
   * sends none of this app's headers. It refuses where the export refuses: a `refused` finding and
   * a validity restriction that could not be read are answered as a page of text saying so, and no
   * text is served.
   */
  app.get('/delegation/as-text', route('delegation.text', 'remote', AS_TEXT_NOTE), async (req, reply) => {
    const query = parse(asTextQuery, req.query, 'The query string is not usable:')
    if (query.workspace === undefined) {
      void reply.code(400)
      return asAPageOfText(
        reply,
        'This address named no project, so Mole Office does not know which project this text is from. A page ' +
          'opened in a browser tab cannot send the header every other read names its project with, so this ' +
          'door takes it in the address instead: add workspace=<the project id>. Nothing was assembled. ' +
          'Answering from the default project would have handed you the text of the wrong one, and it would ' +
          'have looked exactly like the right one.',
      )
    }
    const workspaceId = requireWorkspace(query.workspace, true).id
    if (packageOf(recordInWorkspace(query.task, workspaceId).data)?.parent) throw new PanelError('This package is for inside work and has no outside export. Nothing was written.', 400)
    const made = await theTextForOutside(query.task, workspaceId, theMessageReader(actorFrom(req)))
    if (made.resolved.couldNotCheckInScope.length > 0) {
      void reply.code(409)
      return asAPageOfText(reply, theRestrictionsCouldNotBeRead(made.resolved.couldNotCheckInScope))
    }
    if (theRefusedFindings(made.screening).length > 0) {
      void reply.code(409)
      return asAPageOfText(reply, whyTheScreenRefused(made.screening))
    }
    // THE TEXT AND NOTHING ELSE, exactly as the export hands it over: a person selecting the whole
    // page gets the text the export would have produced, so the page and the press are one text
    // through two doors rather than two texts that agree today.
    return asAPageOfText(reply, made.text)
  })
}

/**
 * SAY IT AS A PAGE OF PLAIN TEXT, whatever it is. Criterion B29.
 *
 * `text/plain` AND NOT `text/html`, for the reason `src/server/api/bundle.ts` gives: the text
 * carries whatever people wrote in their records, and a browser told the words are HTML would run
 * some of them.
 */
function asAPageOfText(reply: { type: (value: string) => unknown }, text: string): string {
  void reply.type('text/plain; charset=utf-8')
  return text
}

/**
 * WHY A VALIDITY RESTRICTION NOBODY COULD READ STOPS THIS TEXT, in the words a page of text can
 * carry. The same confinement `POST /api/bundles/export` makes, said here because this door hands
 * over the same text.
 */
function theRestrictionsCouldNotBeRead(couldNotCheck: readonly { what: string; because: string }[]): string {
  return (
    'Nothing was assembled.\n\n' +
    `Mole Office could not read the validity limits of ${String(couldNotCheck.length)} record(s) this text would ` +
    'carry, so it cannot say that each temporary value keeps its limit.\n\n' +
    couldNotCheck.map((one) => `  ${one.what}: ${one.because}`).join('\n') +
    '\n\nFix or delete the records named above and try again.\n'
  )
}
