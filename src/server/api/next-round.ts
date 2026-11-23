// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT-ROUND DOOR, AND THE MESSAGE WORKER'S HALF OF IT. Wave 13j round loop-2; src/server/lib/next-round.ts says
 * what each door checks and why the worker, on the host, is the one that starts a round.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  askForTheNextRound,
  readTheNextRoundAsk,
  startingTheNextRound,
  theNextRoundsLauncherEnded,
  theRoundsToStartInEveryServedProject,
  theWorkerHeldTheRound,
} from '../lib/next-round.ts'
import { recordInWorkspace, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { itChangesSomething, route } from '../lib/route.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const ASK_NOTE =
  'ASK FOR THE NEXT ROUND OF AN AGENT WHOSE LAST RUN WAS STARTED IN A SANDBOX, in one of two shapes. With a brief: ' +
  '{"brief": "<absolute path of a file inside that sandbox folder>", "sandbox": "<the folder or its name, optional>"}. ' +
  'With inside packages in place of a brief: {"delegations": ["<task record id>", …], "line": "<the line>", "sandbox": ' +
  '"<optional>"}. An ask names a brief or packages, never both, and a line only with its packages. Each package is named ' +
  'once, and each id and the line is a word with no blank around it. Any other body is refused with a 400 saying what ' +
  'was wrong. Each package must be an inside package of this project, for that line, not handed back, and not taken ' +
  'inside by anybody but the asked agent; the door takes none inside. For a packages ask the office writes the brief ' +
  'and its declaration, <brief>.round.json naming the line and the packages, into the briefs folder of that sandbox, ' +
  'and the reply names the other inside packages that wait for the line. An ask that replaces a waiting ask naming ' +
  'packages must name every one of them. The agent with its own key, its registered starter, its recorded leader proved ' +
  'by its own key, a secretary proved by its own key, or the person may ask. Refused, in words, for a retired ' +
  "agent, a run already serving it, a missing brief, a sandbox that is not the agent's, and while the office starts " +
  'no message worker (off), because nothing would start it; a worker in merges-only mode starts it. The ask is kept on the ' +
  'last run as `nextRound`, with the brief as its path and sha256, and with the packages and their line when it named ' +
  'them, and nothing is started by it: the message worker ' +
  'on the host starts the round with node tools/sandbox.mjs round, and the launcher files the new run, derived from ' +
  'the last. The reply names the run, says nothing has started, and reminds of the count limits, which refuse nothing.'

const ROUNDS_NOTE =
  'THE NEXT ROUNDS WAITING FOR THE MESSAGE WORKER across every project it serves, each with its workspaceId. The office ' +
  'writes `nextRound.held` for an ask it leaves out. A process of the run that holds the ask uses `nextRound.waits`; ' +
  'that wait fails the ask after the office’s limit.'

const STARTING_NOTE =
  'THE MESSAGE WORKER IS STARTING A NEXT ROUND with its launcher run: {"wrapper": "<run>"}. Everything the ask was ' +
  'checked for is checked again. The previous run supplies its runtime. Its model is the one the role\'s Casting row in ' +
  'force names on that runtime, or the previous run\'s own model when no row is in force; a row in force on another ' +
  'runtime, or held, fails the ask. The run-models door answers the effort for that model. A failure is ' +
  'written on the run as `failed`, its asker is told, and the request is refused. The reply is what the launcher is given.'

const ENDED_NOTE =
  'THE MESSAGE WORKER SAYS HOW A NEXT ROUND\'S LAUNCHER ENDED: {"wrapper": "<run>", "ok": true, "says": "…"}. A ' +
  'launcher that ended before it filed a run leaves the ask failed, and its asker is told.'

const held = z.object({ because: z.string().trim().min(1).max(2000) }).strict()
const starting = z.object({ wrapper: z.string().trim().min(1) }).strict()
const ended = z.object({ wrapper: z.string().trim().min(1), ok: z.boolean(), says: z.string().trim().min(1).max(2000) }).strict()

/**
 * THE RUN IS READ IN THIS PROJECT BEFORE THE CALLER IS ASKED ABOUT, so a run filed in another project is refused by name,
 * as tests/by-id-boundary.test.ts asks of every door that takes a record id. Reading it writes nothing.
 */
function theRunIsInThisProject(run: string, workspaceId: string): void {
  recordInWorkspace(run, workspaceId)
}

/** Only the message worker, proved by the office's own key, reports a round it starts. */
function onlyTheMessageWorker(actor: Actor, what: string): void {
  if (actor.provedBy !== 'the-office-key' || actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) {
    throw new PanelError(`Only the office's message worker, with the office's key, ${what}. Nothing was written.`, 403)
  }
}

export async function nextRoundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { agent: string } }>('/agents/:agent/next-round', route('agent.next-round', 'remote', ASK_NOTE), async (req, reply) => {
    const body = readTheNextRoundAsk(req.body ?? {})
    const answer = askForTheNextRound({ ...body, agent: req.params.agent, workspaceId: workspaceOf(req), actor: actorFrom(req) })
    return reply.code(202).send(answer)
  })

  app.get(
    '/worker/rounds',
    itChangesSomething(route('worker.rounds', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the next rounds to start here' }, ROUNDS_NOTE)),
    async () => ({ rounds: theRoundsToStartInEveryServedProject() }),
  )

  app.post<{ Params: { run: string } }>(
    '/worker/rounds/:run/held',
    route('worker.round-held', 'local', { because: 'starts-work-on-this-machine', act: 'Recording the reason for holding a next round' }, 'The message worker records why it could not start a next round.'),
    async (req) => {
      onlyTheMessageWorker(actorFrom(req), 'records why a next round is held')
      theRunIsInThisProject(req.params.run, workspaceOf(req))
      const body = parse(held, req.body ?? {}, 'The reason a next round is held')
      return { nextRound: theWorkerHeldTheRound({ run: req.params.run, workspaceId: workspaceOf(req), because: body.because }) }
    },
  )

  app.post<{ Params: { run: string } }>(
    '/worker/rounds/:run/starting',
    route('worker.round-starting', 'local', { because: 'starts-work-on-this-machine', act: 'Starting a next round' }, STARTING_NOTE),
    async (req) => {
      theRunIsInThisProject(req.params.run, workspaceOf(req))
      onlyTheMessageWorker(actorFrom(req), 'starts a next round')
      const body = parse(starting, req.body ?? {}, 'The start of a next round')
      return { round: startingTheNextRound({ run: req.params.run, wrapper: body.wrapper, workspaceId: workspaceOf(req) }) }
    },
  )

  app.post<{ Params: { run: string } }>(
    '/worker/rounds/:run/ended',
    route('worker.round-ended', 'local', { because: 'starts-work-on-this-machine', act: "Recording the end of a next round's launcher" }, ENDED_NOTE),
    async (req) => {
      theRunIsInThisProject(req.params.run, workspaceOf(req))
      onlyTheMessageWorker(actorFrom(req), "says how a next round's launcher ended")
      const body = parse(ended, req.body ?? {}, "How a next round's launcher ended")
      return { nextRound: theNextRoundsLauncherEnded({ run: req.params.run, wrapper: body.wrapper, ok: body.ok, says: body.says, workspaceId: workspaceOf(req) }) }
    },
  )
}
