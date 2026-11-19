// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LINE'S BACKLOG, OVER HTTP. Wave 13s round 142, item 38 of the line's requirements.
 *
 *   GET /api/backlog?line=<line>   the items of that line in this project, in the line's order
 *
 * THE POINTS OF A DECISION, AND FILING THEM IN ONE ACT (round 234):
 *
 *   GET  /api/backlog/points?decision=<id>   the live backlog items that name that decision
 *   POST /api/backlog/points                  file a decision's points, all or none
 *
 * THE PROJECT'S PROGRESS (round 235):
 *
 *   GET /api/backlog/progress?line=<line>   every point counted by state, and every inside brief, read fresh
 *
 * The read is src/server/lib/backlog.ts and the order is src/shared/backlog.ts; the progress counting is
 * src/server/lib/progress.ts. What is here is the door: the words it reads, and what comes back. Remote, like the
 * records it reads and writes.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { ProjectProgress } from '@shared/progress.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { theItemsOfALine, thePointsOfADecision, fileThePointsOfADecision } from '../lib/backlog.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theProjectProgress } from '../lib/progress.ts'
import { getRecord } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

export const BACKLOG_NOTE =
  'The items of one line\'s backlog in this project: every backlog item whose line is exactly the ' +
  'words given, deleted ones left out. Query line, required and not blank; no other word is read. The order is the ' +
  'line\'s: by order, smallest first, then the items with no order, each group in the order filed. The reply is ' +
  '{line, items, noneFiled}. noneFiled is null when there are items, and a sentence when no item in this project ' +
  'names the line, which is not the same as the line having no work: it says only that none was filed here.'

export const DECISION_POINTS_NOTE =
  'The points of one decision in this project: every live backlog item whose stored fromDecision is exactly the ' +
  'decision given, in the line\'s order. Query decision, required and not blank; no other word is read. The decision ' +
  'is read first, so an id that names no record here, or names a record that is not a decision, is refused. The reply ' +
  'is {decisionId, points, noneFiled}. noneFiled is null when there are points, and the sentence "No point names ' +
  'this decision yet." when there are none.'

export const FILE_POINTS_NOTE =
  'File a decision\'s points in one act. Body decisionId, line and points; every key is read by the library so its ' +
  'own refusal sentence is the one a caller reads. The decision must be a decision in this project. Every point is ' +
  '{number, why, doneWhen?, files?, order?}; number and why are required, no number may repeat in one call, files ' +
  'must be non-empty paths and order a finite number. Every check runs before anything is written, and the points ' +
  'are filed in one transaction, so a refused call writes nothing. A point with no doneWhen is filed as incomplete, ' +
  'and the reply says so. The caller must be the person or a registered agent. The reply is 201 ' +
  '{decision: {id, title}, points, note}.'

export const PROGRESS_NOTE =
  'The project\'s progress, counted fresh from the records on every call: its live backlog points by state, the ' +
  'points that name no brief, the points carried through three or more briefs without moving, and its inside briefs ' +
  'by state, with the briefs whose latest check refused the hand-back. Query line, optional: present, only the ' +
  'points whose stored line is exactly those words are counted, and the words are echoed; absent, every live point ' +
  'of the project is counted. A point whose state is missing or is not one of the four states counts in ' +
  'noState and never in a state count. A brief is a task whose package names a parent, read through the inside delegation; ' +
  'outside packages and other projects are not counted. The reply is ProjectProgress, including one says sentence. ' +
  'Nothing is stored and there is no write door.'

const LINE_ERROR = 'line is the name of the line whose backlog you want, as its items write it, for example "13s".'

const PROGRESS_LINE_ERROR =
  'line is the name of the line whose points you want counted, as its items write it, for example "13s"; leave it ' +
  'out to count every line in the project.'

const DECISION_ERROR = 'decision is the id of the decision whose points you want, as one non-empty string.'

const backlogQuery = z.strictObject({
  line: z.string({ error: LINE_ERROR }).trim().min(1, { error: LINE_ERROR }),
})

const progressQuery = z.strictObject({
  line: z.string({ error: PROGRESS_LINE_ERROR }).trim().min(1, { error: PROGRESS_LINE_ERROR }).optional(),
})

const decisionPointsQuery = z.strictObject({
  decision: z.string({ error: DECISION_ERROR }).trim().min(1, { error: DECISION_ERROR }),
})

const filePointsBody = z.strictObject({
  decisionId: z.unknown().optional(),
  line: z.unknown().optional(),
  points: z.unknown().optional(),
})

/**
 * THE DECISION NAMED, read before its points are read or filed. The id must be one string and must name a decision
 * in this project; an id from another project, a record of another kind, and an id nothing answers to are all refused
 * here, before anything is read or written about a point.
 */
function theDecisionNamed(decisionId: unknown, workspaceId: string): PanelRecord {
  if (typeof decisionId !== 'string' || decisionId.trim() === '') {
    throw new PanelError(
      'decisionId is the id of the decision whose points these are, as one non-empty string. Nothing was written.',
      400,
    )
  }
  const id = decisionId.trim()
  const decision = getRecord(id)
  if (decision === null || decision.workspaceId !== workspaceId) {
    throw new PanelError(`There is no decision with id ${id} in this project, so it has no points.`, 400)
  }
  if (decision.kind !== 'decision') {
    throw new PanelError(
      `"${decision.title}" is a ${kindWord(decision.kind).text}, not a decision, and only a decision has points.`,
      400,
    )
  }
  return decision
}

export async function backlogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/backlog',
    route('backlog.line', 'remote', BACKLOG_NOTE),
    async (req): Promise<{ line: string; items: PanelRecord[]; noneFiled: string | null }> => {
      const workspaceId = workspaceOf(req)
      const { line } = parse(backlogQuery, req.query, 'The query string')
      const items = theItemsOfALine(workspaceId, line)
      return {
        line,
        items,
        noneFiled: items.length > 0 ? null : `No backlog item in this project names the line "${line}".`,
      }
    },
  )

  app.get(
    '/backlog/progress',
    route('backlog.progress', 'remote', PROGRESS_NOTE),
    async (req): Promise<ProjectProgress> => {
      const workspaceId = workspaceOf(req)
      const { line } = parse(progressQuery, req.query, 'The query string')
      return theProjectProgress(workspaceId, line ?? null)
    },
  )

  app.get(
    '/backlog/points',
    route('backlog.decisionPoints', 'remote', DECISION_POINTS_NOTE),
    async (req): Promise<{ decisionId: string; points: PanelRecord[]; noneFiled: string | null }> => {
      const workspaceId = workspaceOf(req)
      const { decision } = parse(decisionPointsQuery, req.query, 'The query string')
      const found = theDecisionNamed(decision, workspaceId)
      const points = thePointsOfADecision(workspaceId, found.id)
      return {
        decisionId: found.id,
        points,
        noneFiled: points.length > 0 ? null : 'No point names this decision yet.',
      }
    },
  )

  app.post(
    '/backlog/points',
    route('backlog.filePoints', 'remote', FILE_POINTS_NOTE),
    async (req, reply): Promise<{ decision: { id: string; title: string }; points: PanelRecord[]; note: string }> => {
      const workspaceId = workspaceOf(req)
      const body = parse(filePointsBody, req.body ?? {}, 'The body')
      const decision = theDecisionNamed(body.decisionId, workspaceId)
      const line = typeof body.line === 'string' ? body.line.trim() : ''
      const points = fileThePointsOfADecision({
        decisionId: decision.id,
        workspaceId,
        line,
        points: body.points as readonly unknown[],
        actor: actorFrom(req),
      })
      reply.code(201)
      return {
        decision: { id: decision.id, title: decision.title },
        points,
        note:
          `Filed ${String(points.length)} point${points.length === 1 ? '' : 's'} of "${line}" for the decision ` +
          `"${decision.title}". Any point without doneWhen is incomplete until somebody writes what finished means.`,
      }
    },
  )
}
