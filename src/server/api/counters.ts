// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COUNTERS AND TIMED TRIGGERS, OVER HTTP. Criteria CT1 to CT7 of design/counters/ACCEPTANCE.md.
 *
 *   POST  /api/counters                            file a counter
 *   GET   /api/counters                            every counter in this project
 *   GET   /api/counters/:id                        one counter, its rows and the changes made to it
 *   POST  /api/counters/:id/add                    add to it, with a reason
 *   PATCH /api/counters/:id                        change what it does, with a reason
 *   POST  /api/counters/:id/pause                  stop it firing; it goes on counting
 *   POST  /api/counters/:id/resume                 let it fire again; a trigger that holds fires once
 *   POST  /api/counters/:id/firings/:seq/answer    a job runner says what the job it was asked for did
 *
 * THE RULES ARE IN src/server/lib/counters.ts. What is here is the door: who may knock, what shape
 * the body is, and what comes back. Refusals are 400 for a shape or a value nothing can act on, 403
 * for who is asking, 404 for an id this project does not hold, and 409 for the state of the thing —
 * a counter already paused, a firing already answered, a loop.
 *
 * EVERY DOOR THAT NAMES AN ID READS THE COUNTER FIRST, through `theCounter`, which is
 * `recordInWorkspace` first: an id from another project is a 404 before anything else is asked, and
 * before anything is written. tests/by-id-boundary.test.ts holds every by-id route to that.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { theMessageReader } from '../lib/messages.ts'
import { PROJECTS_QUERY } from '@shared/across-projects.ts'
import {
  A_CHANGE,
  A_JOB_ANSWER,
  A_NEW_COUNTER,
  AN_ADDITION,
  A_PAUSE_OR_RESUME,
  HOW_MANY_ROWS,
  addToACounter,
  answerAFiring,
  changeACounter,
  listCounters,
  listCountersIn,
  makeACounter,
  pauseACounter,
  readOneCounter,
  resumeACounter,
  theCounterIn,
} from '../lib/counters.ts'

// ============================================================================ the sentences

const MAKE_NOTE =
  'FILE A COUNTER. Body {"title","counts","amountIs"?,"mayAdd"?,"follows"?,"triggers","action","atMostOnceEvery"?}. ' +
  '`counts` is one plain sentence saying what it counts. `triggers` is what makes it fire, first one to hold: ' +
  '{"kind":"count","n"}, {"kind":"amount","m"}, {"kind":"quiet","condition":"merge-lane-idle","lane","minutes"} or ' +
  '{"kind":"every","hours","from"?}. `action` is what it does then, and it is one of {"kind":"message","to":[{kind,id}]}, ' +
  '{"kind":"message","group"}, {"kind":"task","title"} or {"kind":"job","job"} — a counter never starts an agent. ' +
  '`mayAdd` is {"anyone":false,"who":[{kind,id}]} and defaults to whoever files it. `follows` is the office events ' +
  'it counts. `label` is the counter\'s name at reading level 1, two to five words, written here because the ' +
  'ordinary short-forms door refuses this kind. Who filed it is written by the office from whoever asked and is ' +
  'refused in the body.'

const LIST_NOTE =
  'EVERY COUNTER IN THIS PROJECT, sorted by title, each with its count, its amount, its triggers, when it last ' +
  'fired and when a timer is next due. An empty list says so in words. Writes nothing. ?projects=all reads every ' +
  'project instead, and ?projects=<project id> reads that one project; each counter then carries its workspaceId.'

const READ_NOTE =
  'ONE COUNTER: what it counts, what makes it fire, what it does then, its rows newest first — every addition, ' +
  'firing and held-back firing — and every change somebody has made to it, with who, when and why. Narrow the ' +
  'rows with ?before=<seq>&limit=<n>. Writes nothing. ?projects=all reads the counter in whichever project holds ' +
  'it, rather than only in the header\'s project.'

const ADD_NOTE =
  'ADD TO A COUNTER. Body {"by":1,"amount"?,"because":"<one sentence>"}. Only whoever the counter allows may add, ' +
  'and the refusal names who may. A count or an amount trigger that holds fires here, in this request, and the ' +
  'answer carries the firing row. An addition to a paused counter is counted and fires nothing.'

const CHANGE_NOTE =
  'CHANGE WHAT A COUNTER DOES. Body {"title"?,"counts"?,"amountIs"?,"mayAdd"?,"follows"?,"triggers"?,"action"?,' +
  '"atMostOnceEvery"?,"label"?,"because":"<one sentence>"}. Only whoever filed it, a secretary or the owner. The ' +
  'reason is required and is kept with the change, so every change to a counter is on record with who, when and ' +
  'why. `label` is the name at reading level 1, two to five words, and it is written here because the ordinary ' +
  'short-forms door refuses this kind.'

const PAUSE_NOTE =
  'PAUSE A COUNTER. Body {"because":"<one sentence>"}. It goes on counting what is added to it and fires nothing ' +
  'until it is resumed. Only whoever filed it, a secretary or the owner. A counter already paused is refused.'

const RESUME_NOTE =
  'LET A PAUSED COUNTER FIRE AGAIN. Body {"because":"<one sentence>"}. It kept its count while it was paused, so a ' +
  'trigger that holds fires once, here, and the answer carries that firing. Only whoever filed it, a secretary or ' +
  'the owner. A counter that is not paused is refused.'

const ANSWER_NOTE =
  'A JOB RUNNER SAYS WHAT THE JOB THIS FIRING ASKED FOR DID. Body {"says":"<what happened>","result"?}. A firing ' +
  'whose action is an office job writes a row saying the office wants the job run, because nothing inside this ' +
  'server may start a process; this door is how the answer reaches that row. A firing already answered is refused.'

// ============================================================================ the shapes

const whichCounter = z.object({ id: z.string().min(1) }).strict()
const whichFiring = z.object({ id: z.string().min(1), seq: z.coerce.number().int().positive() }).strict()

/**
 * THE TWO FIELDS THE OFFICE WRITES AND A CALLER MAY NOT. Refused by name, before the body is parsed.
 *
 * Who filed a counter is the office's own stamp from whoever asked, the way a decision's
 * `recorded_by` is, and whether it is paused is a press with a reason rather than a field. Both are
 * refused by the strict shapes below as unknown keys; this says WHY, because "unrecognized key" tells
 * a caller that the key is wrong and not that the fact belongs to somebody else.
 */
function refuseWhatTheOfficeWrites(body: unknown): void {
  if (body === null || typeof body !== 'object') return
  const said = body as Record<string, unknown>
  if ('createdBy' in said) {
    throw new PanelError(
      'Who filed a counter is written by the office from whoever asked, and never from the body: it is half of who ' +
        'may change the counter afterwards, so a caller that could write it could hand that to anybody. Send the ' +
        'request as yourself and the office will write it. Nothing was written.',
      403,
    )
  }
  if ('pause' in said) {
    throw new PanelError(
      'Pausing is a press of its own, so that it keeps who paused it, when and why: POST /api/counters/<id>/pause ' +
        'and POST /api/counters/<id>/resume. Nothing was written.',
      403,
    )
  }
}

// ============================================================================ the routes

export async function counterRoutes(app: FastifyInstance): Promise<void> {
  app.post('/counters', route('counter.make', 'remote', MAKE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    refuseWhatTheOfficeWrites(req.body)
    const said = parse(A_NEW_COUNTER, req.body, 'The counter')
    const counter = makeACounter({ workspaceId, said, actor })
    void reply.code(201)
    return { counter, says: `The counter "${counter.title}" is filed, and it counts from now.`, workspaceId }
  })

  app.get('/counters', route('counter.list', 'remote', LIST_NOTE), async (req) => {
    // ACROSS PROJECTS WHEN `?projects=` IS ASKED. Without it, the header's
    // project, answered exactly as before.
    // A REQUEST WITHOUT THE WORD takes exactly the old path, before anything else is read.
    if ((req.query as Record<string, unknown> | undefined)?.[PROJECTS_QUERY] === undefined) return listCounters(workspaceOf(req))
    const reader = theMessageReader(actorFrom(req))
    return listCountersIn(theProjectsAQueryAsks(req.query, reader) ?? [], reader)
  })

  app.get('/counters/:id', route('counter.read', 'remote', READ_NOTE), async (req) => {
    // `?projects=` IS TAKEN OUT BEFORE THE ROWS ARE READ, so the shape of the rows stays strict. A
    // request without it reads the header's project, in the same order and with the same refusals
    // as before.
    const { [PROJECTS_QUERY]: projectsWord, ...rest } = (req.query ?? {}) as Record<string, unknown>
    const header = projectsWord === undefined ? workspaceOf(req) : null
    const { id } = parse(whichCounter, req.params, 'The counter to read')
    const asked = parse(HOW_MANY_ROWS, rest, 'The rows to read')
    // THE COUNTER'S OWN PROJECT, when it is read across projects: whichever of the projects asked
    // holds it.
    let workspaceId: string
    if (header !== null) workspaceId = header
    else {
      const reader = theMessageReader(actorFrom(req))
      workspaceId = theCounterIn(id, theProjectsAQueryAsks(req.query, reader) ?? [], reader).workspaceId
    }
    return {
      ...readOneCounter({
        workspaceId,
        id,
        ...(asked.before === undefined ? {} : { before: asked.before }),
        ...(asked.limit === undefined ? {} : { limit: asked.limit }),
      }),
      workspaceId,
    }
  })

  app.post('/counters/:id/add', route('counter.add', 'remote', ADD_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichCounter, req.params, 'The counter to add to')
    const said = parse(AN_ADDITION, req.body, 'The addition')
    const actor = actorFrom(req)
    const done = addToACounter({ workspaceId, id, said, actor })
    void reply.code(201)
    return {
      row: done.row,
      counter: done.counter,
      fired: done.fired,
      heldBack: done.heldBack,
      says: saysWhatHappened(done),
      workspaceId,
    }
  })

  app.patch('/counters/:id', route('counter.change', 'remote', CHANGE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichCounter, req.params, 'The counter to change')
    refuseWhatTheOfficeWrites(req.body)
    const said = parse(A_CHANGE, req.body, 'The change')
    const { counter, nothingWritten } = changeACounter({ workspaceId, id, said, actor: actorFrom(req) })
    return { counter, says: nothingWritten ?? `The counter "${counter.title}" was changed, and the reason is on its record.`, workspaceId, ...(nothingWritten === undefined ? {} : { nothingWritten }) }
  })

  app.post('/counters/:id/pause', route('counter.pause', 'remote', PAUSE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichCounter, req.params, 'The counter to pause')
    const { because } = parse(A_PAUSE_OR_RESUME, req.body, 'The pause')
    const counter = pauseACounter({ workspaceId, id, because, actor: actorFrom(req) })
    return {
      counter,
      says: `The counter "${counter.title}" is paused. It keeps counting, and fires nothing until it is resumed.`,
      workspaceId,
    }
  })

  app.post('/counters/:id/resume', route('counter.resume', 'remote', RESUME_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichCounter, req.params, 'The counter to resume')
    const { because } = parse(A_PAUSE_OR_RESUME, req.body, 'The resuming')
    const done = resumeACounter({ workspaceId, id, because, actor: actorFrom(req) })
    return {
      counter: done.counter,
      fired: done.fired,
      heldBack: done.heldBack,
      says:
        `The counter "${done.counter.title}" is running again, with the count it kept.` +
        (done.fired === null ? '' : ' A trigger held, so it fired once.') +
        (done.heldBack === null ? '' : ' A trigger held and the firing was held back by its limit.'),
      workspaceId,
    }
  })

  app.post('/counters/:id/firings/:seq/answer', route('counter.job', 'remote', ANSWER_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id, seq } = parse(whichFiring, req.params, 'The firing to answer')
    const said = parse(A_JOB_ANSWER, req.body, 'The answer')
    const row = answerAFiring({ workspaceId, id, seq, said, actor: actorFrom(req) })
    return { row, says: `Firing ${String(seq)} carries what the job answered.`, workspaceId }
  })
}

/** What an addition did, in one sentence that is true whichever of the three things happened. */
function saysWhatHappened(done: { counter: { title: string; count: number }; fired: unknown; heldBack: unknown }): string {
  const counted = `The counter "${done.counter.title}" stands at ${String(done.counter.count)}.`
  if (done.fired !== null) return `${counted} A trigger held, so it fired and started again from zero.`
  if (done.heldBack !== null) return `${counted} A trigger held and the firing was held back by its limit, so the count is kept.`
  return `${counted} No trigger holds yet.`
}
