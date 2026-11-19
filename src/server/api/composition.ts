// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `/api/composition` — WHAT A PIPELINE OR A MODULE WAS MADE OF, AT A TIME, WITH ITS PROVENANCE.
 *
 * ---------------------------------------------------------------------------------------
 * THIS ROUTE IS A DOOR, NOT A SECOND PROJECTION
 * ---------------------------------------------------------------------------------------
 *
 * Every answer here is `compositionAt`, `compositionEvents`, `compositionBefore` or
 * `compositionDiff` from `src/shared/composition.ts`, which are pure functions of rows. This file
 * reads the rows and hands them over. It works nothing out itself, because a second place that
 * worked out membership would be free to disagree with the first, and the two would disagree
 * exactly where the owner looks.
 *
 *   GET /api/composition/:id                what it was made of at a time, plus the walk
 *   GET /api/composition/:id/change         two times, and the six marks between them
 *   GET /api/composition/:id/against        two pipelines, and what is in one and not the other
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS THE TABLES DIRECTLY
 * ---------------------------------------------------------------------------------------
 *
 * `listRevisions` answers headers and a field diff, and the projection needs the CONTENT of every
 * revision of every candidate member — the `blockIds` array of the subject and the title and data
 * of each child. There is no reader for that shape, and inventing one in `lib/` would put a second
 * membership rule in the tree. So the three source queries are here, they are read-only, and each
 * one is the whole of one source.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES
 * ---------------------------------------------------------------------------------------
 *
 * A subject that is not a pipeline or a module is refused by name rather than answered with an
 * empty composition. Those are the only two kinds whose membership has a stored answer: a pipeline
 * keeps `data.blockIds` and a module keeps `implements` links. Every other kind would answer "made
 * of nothing", which reads as a fact and is not one.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { changes, records as recordsTable, revisions as revisionsTable } from '../db/schema.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader, type AMessageReader } from '../lib/messages.ts'
import { recordInWorkspace } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { historyEvents, historySubjects, linkEventsIn, THE_ORDER_IN_ONE_SECOND, WHAT_A_HISTORY_READS, type HistoryEvent } from '../lib/history.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { nowStamp } from '@shared/time.ts'
import {
  compositionAgainst,
  compositionAt,
  compositionDiff,
  compositionEvents,
  compositionStops,
  everMembers,
  type Composition,
  type CompositionAgainst,
  type CompositionDiff,
  type CompositionEvent,
  type CompositionSources,
  type CompositionStop,
  type LinkEventFact,
  type RecordFact,
  type RevisionFact,
} from '@shared/composition.ts'
import { KINDS_WITH_COMPOSITION } from '@shared/sections.ts'

const params = z.object({ id: z.string().min(1, { error: 'the URL must contain the id of a record' }) })
const atQuery = z.object({ asOf: z.string().min(1).optional() })
const changeQuery = z.object({
  from: z.string().min(1, { error: 'from must be a stored stamp, like 2026-08-20 21:14:44' }),
  to: z.string().min(1, { error: 'to must be a stored stamp, like 2026-08-20 21:14:44' }).optional(),
})
const againstQuery = z.object({
  other: z.string().min(1, { error: 'other must be the id of the pipeline to compare this one with' }),
  asOf: z.string().min(1).optional(),
})

/**
 * The two kinds whose membership has a stored answer, read from the one place that list is written.
 *
 * `KINDS_WITH_COMPOSITION` in src/shared/sections.ts is also what decides whether a record page
 * draws the *What this was made of* panel and whether that record has a `section.madeOf` for a
 * right-click on the panel to land on. One list, three readers: the route that answers, the page
 * that draws, and the region tree a press walks.
 */
const SUBJECT_KINDS = KINDS_WITH_COMPOSITION

function rowsToRevisions(rows: (typeof revisionsTable.$inferSelect)[]): RevisionFact[] {
  return rows.map((row) => ({
    recordId: row.recordId,
    seq: row.seq,
    at: row.at,
    op: row.op,
    actorType: row.actorType,
    actorId: row.actorId,
    title: row.title,
    data: row.data,
    deletedAt: row.deletedAt,
    contentHash: row.contentHash,
  }))
}

/**
 * The three sources for one subject, read once.
 *
 * TWO PASSES OVER THE REVISIONS TABLE AND ONE OVER THE CHANGE LOG. The first pass gets the
 * subject's own revisions, because they are what says which ids were ever members; the second gets
 * exactly those members' revisions. A single pass could not be written, because the candidate list
 * is inside the rows the first pass returns.
 */
function sourcesFor(subjectId: string, kind: 'pipeline' | 'module', workspaceId: string): CompositionSources {
  const subjectRevisions = rowsToRevisions(
    db.select().from(revisionsTable).where(eq(revisionsTable.recordId, subjectId)).all(),
  )
  // The link timeline. Both ends matter: an event about the subject says what it carried, and an
  // event about a member says which OTHER module carried it, which is what a boundary move is.
  //
  // READ BY `linkEventsIn` IN lib/history.ts, WHICH IS NOW THE ONLY PLACE that rebuilds a link's
  // two ends out of `record_id` and `old_value`/`new_value`. This file used to hold the only copy
  // of that walk; the history read needs the same rows, and two files reconstructing an unlink's
  // far end from different columns is the defect this repository keeps producing.
  const linkEvents: LinkEventFact[] = linkEventsIn(workspaceId).map((row) => ({
    at: row.at,
    op: row.op,
    type: row.type,
    fromId: row.fromId,
    toId: row.toId,
    actorType: row.actorType,
    actorId: row.actorId,
  }))

  const half: CompositionSources = {
    subjectId,
    subjectKind: kind,
    subjectRevisions,
    childRevisions: [],
    linkEvents,
    recordsNow: [],
  }
  const candidates = everMembers(half)
  const childRevisions =
    candidates.length === 0
      ? []
      : rowsToRevisions(db.select().from(revisionsTable).where(inArray(revisionsTable.recordId, candidates)).all())
  const recordsNow: RecordFact[] =
    candidates.length === 0
      ? []
      : db
          .select({ id: recordsTable.id, kind: recordsTable.kind, origin: recordsTable.origin })
          .from(recordsTable)
          .where(inArray(recordsTable.id, candidates))
          .all()
  return { ...half, childRevisions, recordsNow }
}

/**
 * The titles of every module named in an answer, so a screen never prints a nanoid where a name
 * belongs. A soft-deleted module still has a title and still gets one; a module nobody can find is
 * reported as missing rather than left to be drawn as its id.
 */
export type CarrierNames = Record<string, { title: string; origin: string | null; deleted: boolean }>

export interface CompositionReading {
  subject: { id: string; kind: string; title: string; origin: string | null; workspaceId: string }
  carrierNames: CarrierNames
  /** What it was made of at the asked-for time. */
  at: Composition
  /** Every recorded change to this composition, earliest first. */
  events: CompositionEvent[]
  /**
   * The step-back walk: one stop per distinct stamp, earliest first, `order` being the index to
   * step to. A stop holding more than one event is one product action, and nothing stored says
   * which of its rows came first, so they move together.
   */
  stops: CompositionStop[]
  /** Where this subject came from, when a `derived_from` link says so. */
  lineage: Lineage | null
  read: { asked: string; sources: string }
}

/**
 * A descendant's one line of history, and the honest half of it.
 *
 * The revision the descendant was taken at IS NOT STORED. `links` has no column for it: step 42
 * designed `to_seq`/`to_content_hash` and deliberately did not build them. So this reports the
 * ancestor revision that was in effect WHEN THE LINK WAS MADE, and `how` says exactly that. A
 * screen that printed it as a stored fact would be inventing provenance.
 */
export interface Lineage {
  ancestorId: string
  ancestorTitle: string
  ancestorOrigin: string | null
  at: string
  actorType: string
  actorId: string
  ancestorRevision: { seq: number; at: string } | null
  how: 'workedOutFromTheTimeTheLinkWasMade'
  storedRevision: null
}

function lineageOf(subjectId: string, workspaceId: string): Lineage | null {
  const row = db
    .select()
    .from(changes)
    // derived_from in its general sense: the record this subject was made from, whatever kinds the two are.
    .where(and(eq(changes.recordId, subjectId), eq(changes.op, 'link'), eq(changes.field, 'derived_from')))
    .all()
    .sort((a, b) => (a.at < b.at ? -1 : 1))[0]
  if (row === undefined || row.newValue === null) return null
  const ancestor = db.select().from(recordsTable).where(eq(recordsTable.id, row.newValue)).get()
  if (ancestor === undefined) return null
  const ancestorRevisions = rowsToRevisions(
    db.select().from(revisionsTable).where(eq(revisionsTable.recordId, ancestor.id)).all(),
  )
  const inEffect = compositionAt(
    {
      subjectId: ancestor.id,
      subjectKind: ancestor.kind === 'module' ? 'module' : 'pipeline',
      subjectRevisions: ancestorRevisions,
      childRevisions: [],
      linkEvents: [],
      recordsNow: [],
    },
    row.at,
  ).subject.revision
  return {
    ancestorId: ancestor.id,
    ancestorTitle: ancestor.title,
    ancestorOrigin: ancestor.origin,
    at: row.at,
    actorType: row.actorType,
    actorId: row.actorId,
    ancestorRevision: inEffect === null ? null : { seq: inEffect.seq, at: inEffect.at },
    how: 'workedOutFromTheTimeTheLinkWasMade',
    storedRevision: null,
  }
}

function subjectOf(id: string, workspaceId: string, reader: AMessageReader): { record: ReturnType<typeof recordInWorkspace>; kind: 'pipeline' | 'module' } {
  const record = recordInWorkspace(id, workspaceId, reader)
  if (record.kind !== 'pipeline' && record.kind !== 'module') {
    throw new PanelError(
      `A composition is what a ${SUBJECT_KINDS.join(' or a ')} was made of, and ${id} is a ${record.kind}. ` +
        'Only those two keep a stored answer: a pipeline keeps its block order, a module keeps its ' +
        '`implements` links. Nothing else has one, and answering "made of nothing" would read as a fact.',
      400,
    )
  }
  return { record, kind: record.kind }
}

/**
 * A pipeline, refused by name when it is anything else.
 *
 * COMPARING TWO PIPELINES IS NARROWER THAN READING ONE COMPOSITION, and this is why. The two sides
 * are paired on each block's own name inside its pipeline, and that name is only recoverable
 * because a block's stored title is `<its pipeline's title> › <its own name>`. A module's members
 * are blocks belonging to other pipelines, so their titles carry those pipelines' names and there
 * is no name to pair on. Answering anyway would be pairing on a string that means something else.
 */
function pipelineOf(id: string, workspaceId: string, which: 'this one' | 'the other one', reader: AMessageReader): ReturnType<typeof recordInWorkspace> {
  const record = recordInWorkspace(id, workspaceId, reader)
  if (record.kind !== 'pipeline') {
    throw new PanelError(
      `Two pipelines can be compared, and ${which} (${id}) is a ${record.kind}. ` +
        'A block\'s name is only readable inside the pipeline whose title its own title begins with, ' +
        'so there is nothing to pair two sides on unless both sides are pipelines.',
      400,
    )
  }
  return record
}

function carrierNamesFor(composition: Composition, extra: Composition | null): CarrierNames {
  const wanted = new Set<string>()
  for (const source of extra === null ? [composition] : [composition, extra]) {
    for (const member of source.members) for (const carrier of member.carriers) wanted.add(carrier.moduleId)
  }
  const names: CarrierNames = {}
  for (const id of wanted) {
    const row = db.select().from(recordsTable).where(eq(recordsTable.id, id)).get()
    if (row === undefined) continue
    names[id] = { title: row.title, origin: row.origin ?? null, deleted: row.deletedAt !== null }
  }
  return names
}

const READ_SOURCES =
  'Three sources: the subject\'s own revisions, its members\' revisions, and the link and unlink rows of the ' +
  'change log. Every element says which of the three accounted for it, and an element none of them can account ' +
  'for comes back marked `unaccounted` rather than left out. Writes nothing.'

export async function compositionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * WHAT HAPPENED TO THIS RECORD, AND TO THE WORK IT CARRIES.
   *
   * THE READ IS USELESS AND UNTESTABLE WITHOUT AN ADDRESS, which is why the function and its route
   * land together. `src/server/lib/history.ts` works everything out; this hands over the rows.
   *
   * IT IS REGISTERED HERE AND NOT IN api/records.ts because it is the same question that file's
   * three composition routes answer, read from the other side: a composition says what a subject
   * was MADE OF at a time, and this says what HAPPENED to it and to what it carries. Both read the
   * revision ledger, the change log and the link rows, and neither works anything out itself.
   */
  app.get(
    '/records/:id/history',
    {
      config: {
        operation: 'record.history',
        reach: 'remote',
        note:
          'What happened to this record and to the work it carries: GET /api/records/<id>/history. ' +
          'Newest first. ' +
          THE_ORDER_IN_ONE_SECOND +
          ' The scope is the subject set: a block is itself, a module is itself and every block it ' +
          'has ever carried, a pipeline is itself — `GET /api/composition/<id>/change` is what answers a ' +
          'pipeline\'s structural diff — and any other kind is itself. An event is ONE STORED ROW: `source` names ' +
          'the table and the row id, and a row appears once however many reasons put it there. `because` says ' +
          'which reason came first — `itself`, `carries` for a block the module carries, `appearedIn` for a ' +
          'pipeline revision where the stored order gained or lost one of these blocks. Nothing is materialised ' +
          'and nothing is stored: this read writes no row of any kind.',
      },
    },
    async (
      req,
    ): Promise<{
      subject: { id: string; kind: string; title: string; workspaceId: string }
      /** Every record whose rows are in this reading, and why each one is in. */
      scope: { id: string; because: 'itself' | 'carries' }[]
      events: HistoryEvent[]
      read: { sources: string }
    }> => {
      const { id } = parse(params, req.params, 'The URL is not usable:')
      const workspaceId = workspaceOf(req)
      // recordInWorkspace FIRST, so a caller reaching across a project boundary is told that and
      // not handed an empty history, which would read as "nothing has happened to it".
      const record = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const scope = historySubjects(record.id, workspaceId)
      if (scope === null) {
        throw new PanelError(`No record in this project has the id ${id}.`, 404)
      }
      return {
        subject: { id: record.id, kind: record.kind, title: record.title, workspaceId },
        scope: [...scope.subjects].map((subjectId) => ({
          id: subjectId,
          because: scope.because.get(subjectId) ?? 'itself',
        })),
        events: historyEvents(scope, workspaceId),
        read: { sources: WHAT_A_HISTORY_READS },
      }
    },
  )

  app.get(
    '/composition/:id',
    {
      config: {
        operation: 'structure.compare',
        reach: 'remote',
        note:
          'What a pipeline or a module was made of at a time: GET /api/composition/<id>?asOf=2026-08-20 21:15:00. ' +
          'Membership is decided by two stored facts and nothing else — a pipeline\'s `data.blockIds` in the ' +
          'revision in effect at that time, and a module\'s `implements` links as the change log replays them. A ' +
          'link of any other type never makes a record a member, so a `direction` or any other record about an ' +
          'intended future is never part of a composition. `events` is every recorded change to this composition ' +
          'in order, and `order` on one of them is the index to step back to. ' + READ_SOURCES,
      },
    },
    async (req): Promise<CompositionReading> => {
      const { id } = parse(params, req.params, 'The URL is not usable:')
      const { asOf } = parse(atQuery, req.query, 'That is not a time this can read:')
      const workspaceId = workspaceOf(req)
      const { record, kind } = subjectOf(id, workspaceId, theMessageReader(actorFrom(req)))
      const sources = sourcesFor(id, kind, workspaceId)
      const when = asOf ?? nowStamp()
      const composition = compositionAt(sources, when)
      const events = compositionEvents(sources)
      return {
        subject: { id: record.id, kind: record.kind, title: record.title, origin: record.origin ?? null, workspaceId },
        at: composition,
        carrierNames: carrierNamesFor(composition, null),
        events,
        stops: compositionStops(events),
        lineage: lineageOf(id, workspaceId),
        read: { asked: when, sources: READ_SOURCES },
      }
    },
  )

  app.get(
    '/composition/:id/change',
    {
      config: {
        operation: 'structure.compare',
        reach: 'remote',
        note:
          'What changed between two times: GET /api/composition/<id>/change?from=<stamp>&to=<stamp>. `to` ' +
          'defaults to now. Six marks, and a member can carry more than one: added, removed, changed (its own ' +
          'revision moved), moved (it changed places with a neighbour that stayed — an insertion in front of it ' +
          'is not a move), regrouped (a different module carried it) and unaccounted. ' + READ_SOURCES,
      },
    },
    async (req): Promise<{
      before: Composition
      after: Composition
      diff: CompositionDiff
      subject: CompositionReading['subject']
      carrierNames: CarrierNames
    }> => {
      const { id } = parse(params, req.params, 'The URL is not usable:')
      const { from, to } = parse(changeQuery, req.query, 'That is not a pair of times this can read:')
      const workspaceId = workspaceOf(req)
      const { record, kind } = subjectOf(id, workspaceId, theMessageReader(actorFrom(req)))
      const sources = sourcesFor(id, kind, workspaceId)
      const before = compositionAt(sources, from)
      const after = compositionAt(sources, to ?? nowStamp())
      return {
        subject: { id: record.id, kind: record.kind, title: record.title, origin: record.origin ?? null, workspaceId },
        before,
        after,
        carrierNames: carrierNamesFor(before, after),
        diff: compositionDiff(before, after),
      }
    },
  )

  app.get(
    '/composition/:id/against',
    {
      config: {
        operation: 'structure.compare',
        reach: 'remote',
        note:
          'What is in one pipeline and not in the other: GET /api/composition/<id>/against?other=<id>. Both must ' +
          'be pipelines and they must be two different ones. The two sides are paired on each block\'s own name ' +
          'inside its pipeline, because a block belongs to exactly one pipeline and the two therefore share no ' +
          'block records at all — `sharedRecordIds` counts that rather than asserting it, and `matchedOn` names ' +
          'the pairing rule. A name one side carries twice is reported in `ambiguous` and paired with nothing. ' +
          READ_SOURCES,
      },
    },
    async (req): Promise<{
      left: CompositionReading['subject']
      right: CompositionReading['subject']
      carrierNames: CarrierNames
      against: CompositionAgainst
      read: { asked: string; sources: string }
    }> => {
      const { id } = parse(params, req.params, 'The URL is not usable:')
      const { other, asOf } = parse(againstQuery, req.query, 'That is not a pipeline to compare with:')
      const workspaceId = workspaceOf(req)
      // THE SUBJECT IS READ FIRST, and the order is deliberate. A caller reaching across a project
      // boundary must be told that before it is told anything about the pair it asked for, or a
      // 400 about the pair would be an answer about a record it is not allowed to see.
      const left = pipelineOf(id, workspaceId, 'this one', theMessageReader(actorFrom(req)))
      if (other === id) {
        throw new PanelError(
          `${id} is the same pipeline on both sides, so nothing could be in one and not the other. ` +
            'To see how one pipeline changed over time, step back through its own composition instead.',
          400,
        )
      }
      const right = pipelineOf(other, workspaceId, 'the other one', theMessageReader(actorFrom(req)))
      const when = asOf ?? nowStamp()
      const leftAt = compositionAt(sourcesFor(left.id, 'pipeline', workspaceId), when)
      const rightAt = compositionAt(sourcesFor(right.id, 'pipeline', workspaceId), when)
      const asSubject = (record: typeof left): CompositionReading['subject'] => ({
        id: record.id,
        kind: record.kind,
        title: record.title,
        origin: record.origin ?? null,
        workspaceId,
      })
      return {
        left: asSubject(left),
        right: asSubject(right),
        carrierNames: carrierNamesFor(leftAt, rightAt),
        against: compositionAgainst(leftAt, rightAt),
        read: { asked: when, sources: READ_SOURCES },
      }
    },
  )
}
