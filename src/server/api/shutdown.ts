// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHUTDOWN DOORS: what is at work, and shutting Mole Office down with the runs paused.
 *
 * Criterion W6, the server side (piece H6 of plan hp7Z-IW9JWSX). src/server/lib/pausing.ts says what
 * a pause is, why a shutdown is not a restart, and the order the door works in. The window's second
 * confirmation that asks for this door is piece H8; the page that resumes a paused run is piece H7.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { CodedRefusal, ShutDownRefusalCode } from '@shared/refusal-codes.ts'
import type { TheLiveRunsReading, TheShutDownAnswer } from '@shared/shutting-down.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  mayPressForThePerson,
  theSecretaryActingForThePerson,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { pauseTheRunsAtWork, theLiveRuns, theWayOutOfThisServer } from '../lib/pausing.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'

const LIVE_RUNS_NOTE =
  'THE RUNS AT WORK ON THIS MACHINE, in every project, as a shutdown would find them. `pausable` ' +
  'is every agent run Mole Office started whose process is still going, or whose reading cannot tell whether it is, ' +
  'with the agent, the message it is answering, when it started and its conversation id. Each run\'s `state` is ' +
  '`running`, or `not known` where the reading could not tell. `notPausable` is every session Mole Office did not start ' +
  'that still has a live process — a terminal a person is working in — which a shutdown cannot pause and which ' +
  'keeps running after it. `mayPress` says whether this caller may press the shutdown, by the same check the press ' +
  'asks, so a page does not offer a press the door would refuse. Writes nothing.'

const SHUT_DOWN_NOTE =
  'SHUT MOLE OFFICE DOWN, PAUSING THE RUNS AT WORK FIRST. The proved owner may press it. A secretary carrying the ' +
  'owner\'s written words for this act may press it too, whatever this office\'s list of what the grant carries says; ' +
  'a secretary holding their grant may press it where that list says the grant presses it. The card keeps it, so an ' +
  'office that changed nothing refuses the secretary in the check\'s words. Body {"why"?: "…", "seen"?: [session ids], ' +
  '"warrant"?: the owner\'s words, whose `for` names office.shut-down}. ' +
  '`seen` is the runs the list the caller confirmed showed: when an agent run is at work that the list did not show, ' +
  'the press is refused with the code shutDownRunsChanged and nothing is stopped. It stops the message ' +
  'worker, then stops each agent run Mole Office started by its process group and waits for it to end, writes it ' +
  '`paused` with who asked, when and why, and says so on the message it was answering. A paused run keeps its ' +
  'conversation id and is never carried on by itself: it waits for a press. Then the server shuts down through ' +
  'its one way out, after this answer is sent. With no run at work it shuts down at once. A run that survives ' +
  'its stop signal is reported as still running and not called paused. A run whose state cannot be told is listed, ' +
  'goes to the same stop, and is called paused only once it is read gone. Sessions Mole Office did not start are ' +
  'listed and left running. This is not `mole-office stop`, which leaves every run going for the next start to ' +
  'pick up.'

const shutDownPress = z
  .object({
    why: z.string().trim().min(1).max(500).optional(),
    seen: z.array(z.string().min(1).max(64)).max(500).optional(),
    // THE OWNER'S WRITTEN WORDS, read by the guard before this shape is asked. The field is here so the strict shape
    // does not refuse a body the words path accepts.
    warrant: warrantBody.optional(),
  })
  .strict()

/** A refusal of the shutdown door, with its code, so the page draws it in its own language. */
function aRefusal(
  code: ShutDownRefusalCode,
  sentence: string,
  status: number,
  values: Record<string, number | string> = {},
): PanelError {
  return new PanelError(sentence, status, undefined, undefined, undefined, { code, values } as CodedRefusal)
}

/** The shutdown door's refusal to everybody it does not let in, word for word, with its code. */
function onlyTheOwnerRefusal(actor: Actor, req: FastifyRequest): PanelError {
  try {
    assertThePersonIsProved(
      actor,
      theActKeptHere(req),
      'Only the owner may shut the office down, or a secretary holding the owner\'s grant where this office\'s list of ' +
        'what the grant carries says so. Any other agent is refused.',
    )
  } catch (err) {
    if (err instanceof PanelError) return aRefusal('shutDownOnlyTheOwner', err.message, err.status)
    throw err
  }
  // `assertThePersonIsProved` always refuses a caller that is not the person, which every caller here is.
  throw new Error('The shutdown door asked for the person’s refusal and the check let the caller through.')
}

/**
 * WHO MAY SHUT THE OFFICE DOWN, in this order, before the rest of the body is read: the proved owner; a secretary with
 * its own key carrying the owner's written words for this act, whatever this office's list says; a secretary holding
 * their grant where the list says the grant presses it; and anybody else in the door's old words. The words are read
 * alone first, so a caller they refuse is told who may before the rest of its body is read.
 *
 * THE ACTOR THAT CARRIES THE WORDS IS WHAT THE PRESS USES AFTER THIS, so the pause, the sentence naming who asked and
 * the change row all keep the words. Under the grant the actor is the caller, unchanged, and the press row stays one row.
 */
function onlyTheOwner(actor: Actor, req: FastifyRequest): Actor {
  if (thePersonIsProved(actor)) return actor
  const words = theWordsInTheBody(req)
  if (words !== undefined) {
    if (!aSecretaryWithItsOwnKey(actor)) throw onlyTheOwnerRefusal(actor, req)
    let acting = actor
    try {
      acting = actorWithTheWordsItActsOn(req, words, 'office.shut-down')
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      throw aRefusal('shutDownBadWarrant', err.message, err.status, { reason: err.message })
    }
    if (!(acting.warrant !== undefined && theSecretaryActingForThePerson(acting))) throw onlyTheOwnerRefusal(actor, req)
    return acting
  }
  if (aRaiseCarriesIt(actor)) return actor
  throw onlyTheOwnerRefusal(actor, req)
}

export async function shutdownRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/live-runs', route('office.live-runs', 'remote', LIVE_RUNS_NOTE), async (req): Promise<TheLiveRunsReading> => {
    const live = theLiveRuns()
    const actor = actorFrom(req)
    // THE SAME QUESTION THE PRESS ASKS, asked without a reason and without marking anything, so reading the list writes
    // no press row. The shutdown is named beside the route's own read: a row this office set for the shutdown is what
    // decides, and the card keeps it until the office says otherwise.
    const mayPress = thePersonIsProved(actor) || mayPressForThePerson(actor, false, { also: ['office.shut-down'] }).may
    const notKnown = live.pausable.filter((run) => run.state === 'not known').length
    return {
      ...live,
      mayPress,
      says:
        live.pausable.length === 0
          ? 'No agent run Mole Office started is at work, so a shutdown would close at once.'
          : `${String(live.pausable.length)} agent ${live.pausable.length === 1 ? 'run is' : 'runs are'} at work, and a shutdown would pause ${live.pausable.length === 1 ? 'it' : 'them'} first.` +
            (notKnown === 0
              ? ''
              : live.pausable.length === 1
                ? ' Whether it still runs cannot be told.'
                : ` Whether ${String(notKnown)} of them still ${notKnown === 1 ? 'runs' : 'run'} cannot be told.`),
    }
  })

  app.post(
    '/office/shut-down',
    route('office.shut-down', 'local', { because: 'acts-on-this-machine', act: 'Shutting Mole Office down' }, SHUT_DOWN_NOTE),
    async (req, reply): Promise<TheShutDownAnswer> => {
      const actor = onlyTheOwner(actorFrom(req), req)
      const body = parse(shutDownPress, req.body ?? {}, 'The shutdown press is not usable:')
      // Refused before anything is touched when this server has no way out (see lib/pausing.ts).
      const way = theWayOutOfThisServer()
      /**
       * THE PRESS CONFIRMED A LIST, AND A RUN THE LIST DID NOT SHOW IS NOT PAUSED BEHIND THE PERSON'S BACK
       * (criterion W6: the shutdown lists the runs and asks once more). Read before the worker is stopped, so a
       * refusal leaves the office exactly as it was. A run that starts in the moment between this reading and
       * the worker's stop is still paused with its data kept, like the others, and the answer names it.
       */
      if (body.seen !== undefined) {
        const seen = new Set(body.seen)
        const unseen = theLiveRuns().pausable.filter((run) => !seen.has(run.session))
        if (unseen.length > 0) {
          const n = unseen.length
          throw aRefusal(
            'shutDownRunsChanged',
            `${String(n)} agent ${n === 1 ? 'run' : 'runs'} at work ${n === 1 ? 'was' : 'were'} not in the list this press confirmed ` +
              `(${unseen.map((run) => run.session).join(', ')}), so nothing was stopped and Mole Office is still running. ` +
              'Read the list again and confirm what it shows.',
            409,
            { count: n },
          )
        }
      }
      const who = actor.type === 'human' ? actor.id : `the agent ${actor.id}`
      const because = body.why === undefined ? `${who} shut Mole Office down.` : `${who} shut Mole Office down: ${body.why}`
      // 1. The worker first, so nothing writes over a pause or starts a run after the list was read.
      const workerStopped = await way.stopTheWorker()
      // 2 and 3. Each run stopped, waited for, written paused, its conversation read.
      const { paused, notPausable } = await pauseTheRunsAtWork(actor, because)
      // THE WORDS PATH WRITES ONE CHANGE ROW, after the runs are paused and before the reply. A press under the grant
      // writes the press row the route layer keeps; the person's own press needs nobody's words and writes neither.
      if (actor.warrant !== undefined) {
        writeDownAnActUnderTheRaise(actor, {
          setting: 'office-shut-down',
          field: 'a shutdown was requested',
          before: null,
          after: { because },
          workspaceId: workspaceOf(req),
        })
      }
      const stillRunning = paused.filter((one) => !one.paused)
      // 4. The way out starts once this answer has gone, so the caller is told what was done.
      reply.raw.once('finish', () => way.shutDown(because))
      return {
        shuttingDown: true,
        workerStopped,
        paused: paused.filter((one) => one.paused),
        notPaused: stillRunning,
        notPausable,
        says:
          paused.length === 0
            ? 'No agent run Mole Office started was at work, so Mole Office is shutting down at once.'
            : `${String(paused.length - stillRunning.length)} of ${String(paused.length)} agent runs were paused, and Mole Office is shutting down.` +
              (stillRunning.length === 0 ? '' : ` ${String(stillRunning.length)} ${stillRunning.length === 1 ? 'was' : 'were'} not paused; each says why.`),
      }
    },
  )
}
