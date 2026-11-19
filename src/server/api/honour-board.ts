// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HONOUR BOARD'S RECORD-SIDE DOORS. Criteria HB1, HB2, HB4 and HB6 of
 * design/honour-board/ACCEPTANCE.md.
 *
 *   GET  /api/honour-board                 the board: one page of the runs whose stored reading stands at one
 *                                          standing, newest first, and the weekly table (HB3, HB5)
 *   GET  /api/honour-board/runs/:run       one run's five honour signals, read now, from records only
 *   POST /api/honour-board/runs/:run/read  that reading stored on the run's session record under `honour`
 *
 * THE RULES ARE IN src/server/lib/honour.ts, beside the signals that name them. What is here is the
 * door: who may knock, what shape the params are, and what comes back. Never a timer, never a
 * model, never a transcript: the GET is a read, and the POST is a write of one key the session kind
 * already declares.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  HONOUR_BOARD_PAGE,
  readTheHonourOfARun,
  storeTheHonourReading,
  theBriefAndReportOfARun,
  theHonourBoard,
  theHonourThisReaderMaySee,
} from '../lib/honour.ts'

const BOARD_NOTE =
  'THE HONOUR BOARD, criteria HB3 and HB5: one page of the runs whose stored reading stands at `standing` ' +
  '(exemplary, or noted), newest first, each with its signals and their evidence, its conditions, its agent, and its ' +
  'brief and report; and the weekly table of signals per model and temperature band, counted from the stored ' +
  'readings. It reads stored readings only: it opens no transcript, no log and no model, and reads no run again. ' +
  `The reply says what it cost (records read and milliseconds), criterion HB6. At most ${String(HONOUR_BOARD_PAGE)} runs a page.`

const READ_NOTE =
  'WHAT THE OFFICE READS, FROM RECORDS ONLY, ABOUT ONE RUN — the five honour signals of criterion HB2. Every ' +
  'signal is read off records the office already holds — the run\u2019s session record, the reports and problems it ' +
  'filed, the check that released or refused it, the merges that took its commits. No transcript, no log, no model, ' +
  'no timer. The reply carries the reading\u2019s cost: records read and milliseconds spent, which is criterion HB6.'

const STORE_NOTE =
  'THAT READING STORED ON THE RUN\u2019S SESSION RECORD, under the key `honour`, written by the office. The record\u2019s ' +
  'history says who asked. Pressed on demand and again after it, never on a timer; the confirm that closes a run ' +
  'presses it too.'

const whichRun = z.object({ run: z.string().min(1) }).strict()

const whichPage = z
  .object({
    standing: z.enum(['exemplary', 'noted']).default('exemplary'),
    limit: z.coerce.number().int().min(1).max(HONOUR_BOARD_PAGE).default(HONOUR_BOARD_PAGE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

export async function honourBoardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/honour-board', route('honour.list', 'remote', BOARD_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichPage, req.query, 'The page of the honour board')
    const board = theHonourBoard({ workspaceId, ...asked })
    // NO EVIDENCE NAMES A MESSAGE THE CALLER MAY NOT READ, on the board as on one run.
    const rows = theHonourThisReaderMaySee(board.rows, theMessageReader(actorFrom(req)))
    return { ...board, rows, workspaceId }
  })

  app.get('/honour-board/runs/:run', route('honour.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to read the honour of')
    // NO EVIDENCE NAMES A MESSAGE THE CALLER MAY NOT READ: such an id is taken out
    // of a signal's evidence. The signal itself, which says what the run did, is kept.
    const [reading] = theHonourThisReaderMaySee([readTheHonourOfARun({ runId: asked.run, workspaceId })], theMessageReader(actorFrom(req)))
    const { signals, missing, standing, threshold, read_at, cost } = reading!
    // THE BRIEF AND THE REPORT, criterion HB4: the note the runner filed at the run's start and
    // the report the run itself filed, each one record read away from the board.
    const kept = theBriefAndReportOfARun(asked.run)
    return {
      run: asked.run,
      signals,
      missing,
      standing,
      threshold,
      read_at,
      cost,
      brief: kept.brief,
      report: kept.report,
      workspaceId,
    }
  })

  app.post('/honour-board/runs/:run/read', route('honour.record', 'remote', STORE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to record the honour reading of')
    const { nothingWritten, ...stored } = storeTheHonourReading({ runId: asked.run, workspaceId, actor: actorFrom(req) })
    // WHAT WAS STORED IS HANDED BACK AS THE CALLER MAY SEE IT, with no evidence id
    // naming a message it may not read. The stored reading keeps every id.
    const [reading] = theHonourThisReaderMaySee([stored], theMessageReader(actorFrom(req)))
    void reply.code(201)
    return { run: asked.run, honour: reading, says: nothingWritten ?? 'The reading is stored on the run\u2019s session record under `honour`.', ...(nothingWritten === undefined ? {} : { nothingWritten }), workspaceId }
  })
}
