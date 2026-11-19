// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTERRUPTED RUNS DOORS: the list, the person's press to resume one, and the worker's half.
 *
 * Criterion W7 (piece H7 of plan hp7Z-IW9JWSX). src/server/lib/interrupted.ts says which runs are
 * interrupted, why the server only writes the ask, and how the worker starts the resume.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theMessageReader } from '../lib/messages.ts'
import { askToResume, resumesThePersonAsked, sayWhatBecameOfAResume, theInterruptedRuns } from '../lib/interrupted.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, writeDownAnActUnderTheRaise } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { gatePosition } from '../../config/settings.mjs'
import { nothingWrittenSentence } from '../lib/records/patching.ts'

const INTERRUPTED_NOTE =
  'THE INTERRUPTED RUNS IN THIS PROJECT, newest first: every agent run Mole Office started for a message that ' +
  'stopped before it answered and that nothing has taken up again, among the runs whose message the caller may read: ' +
  'a run whose message the caller may not read is left out and nothing is said about it. `how` is paused (a shutdown stopped it on ' +
  'purpose) or crashed (it ended without answering). Each says which agent, which message, when it stopped and ' +
  'why, its tool and conversation, whether one press can resume it (`resume.can`, and `resume.because` when it ' +
  'cannot), what was measured about its tool\'s resume after a kill mid-turn, and a press waiting for the worker. ' +
  'Writes nothing.'

const RESUME_NOTE =
  'ASK FOR ONE INTERRUPTED RUN TO BE RESUMED. Only the proved person may press it; the secretary card keeps it for ' +
  'them, so a raise carries it only where this office\'s list of what the grant carries says the grant presses it, ' +
  'and the change log names the secretary and the grant. The ask is written on the run ' +
  'and the message worker starts the tool\'s own resume by the recorded conversation, with the same message, on ' +
  'its next pass. Refused, saying why, when the run is not interrupted or cannot be resumed.'

const RESUMES_NOTE =
  'THE RESUMES ASKED FOR IN THIS PROJECT, by the person or by a secretary under their grant, that the message worker has not started yet, among the runs ' +
  'whose message the caller may read; any other is left out and nothing is said about it. Each comes with the ' +
  'run, its tool, its conversation and the message it was delivering. The worker reads this on every pass. Writes nothing.'

const RESUMED_NOTE =
  'THE WORKER SAYS WHAT BECAME OF AN ASKED RESUME. Body {"startedAs": "<the run that took it up>"} or ' +
  '{"failed": "<why it could not start>"}.'

const resumedPress = z.union([
  z.object({ startedAs: z.string().min(1) }).strict(),
  z.object({ failed: z.string().min(1).max(2000) }).strict(),
])

export async function interruptedRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/interrupted-runs', route('office.interrupted-runs', 'remote', INTERRUPTED_NOTE), async (req) => {
    // ONLY THE RUNS FOR MESSAGES THE CALLER MAY READ, as GET /api/worker/runs.
    return { runs: theInterruptedRuns(workspaceOf(req), theMessageReader(actorFrom(req))) }
  })

  app.post(
    '/office/interrupted-runs/:session/resume',
    route('office.resume-a-run', 'local', { because: 'starts-work-on-this-machine', act: 'Resuming an interrupted run' }, RESUME_NOTE),
    async (req) => {
      const actor = actorFrom(req)
      /**
       * ONLY THE PROVED PERSON RESUMES AN INTERRUPTED RUN, as only the person shuts the office down. The
       * owner's point 5 asks for the person's one press. A secretary holding the person's grant may press it too where this
       * office's list of what the grant carries says so; the card keeps it, so an office that changed nothing
       * refuses the secretary in the check's words. The ask names the secretary, never the person.
       *
       * THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate lets any caller ask, so the raise is not asked,
       * refuses nobody and has nothing written down under it. At block the raise is asked as before, and an ask it
       * carries is not counted as one the gate would hold.
       */
      const position = gatePosition('who-resumes-a-run')
      if (!thePersonIsProved(actor) && !(position === 'block' && aRaiseCarriesIt(actor)) && gateMet('who-resumes-a-run', position!) === 'block') {
        assertThePersonIsProved(
          actor,
          theActKeptHere(req),
          'Only the person may resume an interrupted run. So may a secretary whose grant carries this press.',
        )
      }
      const { session } = req.params as { session: string }
      const workspaceId = workspaceOf(req)
      const { run, wrote } = askToResume(session, actor, workspaceId)
      // THE ASK IS WRITTEN AS THE WORKER'S, so under a raise one change row names the secretary and the grant.
      const ledgerWrote = writeDownAnActUnderTheRaise(actor, { setting: 'interrupted-runs', field: `asked to resume the run ${session}`, before: null, after: 'asked', workspaceId })
      return { run, ...(!wrote && !ledgerWrote ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
    },
  )

  app.get(
    '/worker/resumes',
    route('worker.resumes', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the resumes to start here' }, RESUMES_NOTE),
    // ONLY THE RESUMES FOR MESSAGES THE CALLER MAY READ, as GET /api/worker/runs.
    async (req) => ({ resumes: resumesThePersonAsked(workspaceOf(req), theMessageReader(actorFrom(req))) }),
  )

  app.post(
    '/worker/runs/:session/resumed',
    route('worker.resumed', 'local', { because: 'starts-work-on-this-machine', act: 'Recording the outcome of a resume' }, RESUMED_NOTE),
    async (req) => {
      const { session } = req.params as { session: string }
      const body = parse(resumedPress, req.body, 'The resume outcome is not usable:')
      sayWhatBecameOfAResume(session, body, workspaceOf(req))
      return { session, ...body }
    },
  )
}
