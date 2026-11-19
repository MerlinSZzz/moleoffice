// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKER-RUN DOOR, AND THE MESSAGE WORKER'S HALF OF IT. Wave 13j round loop-3; src/server/lib/worker-runs.ts says
 * what each door checks, and why the message worker, on the host, is the one that starts a supervisor's worker.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import {
  keepTheHandStart,
  theHandStartAskedFor,
  askForAWorkerRun,
  startingTheWorkerRun,
  theRunOfAServedProject,
  theWorkerRunsLauncherEnded,
  theWorkerRunsToStartInEveryServedProject,
} from '../lib/worker-runs.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { sqlite } from '../db/client.ts'

// The reply refuses nothing for a count.
const ASK_NOTE =
  'A SUPERVISOR IN A SANDBOX ASKS THE OFFICE TO START A WORKER OF ITS OWN: {"brief": "<absolute path of a file inside ' +
  "the supervisor's sandbox folder>\", \"runtime\": \"…\", \"model\": \"…\", \"cutFrom\": \"…\", \"clone\": \"…\", \"paths\": [\"…\"], \"images\": [\"…\"], \"package\": \"<a packaged task>\", \"points\": [\"…\"], \"difficulty\": \"hard|simple\", \"why\": \"…\"}. The runtime and the model are named " +
  'together or not at all, and a Casting row of the worker card in force for the project must cast them. With neither named, the worker is ' +
  'given the Casting row for the worker card. Only the worker\'s registered starter may ask, proved by its own key, from a ' +
  'running run of its own named in x-mole-office-session, started in a sandbox the office vouches for. Refused, in ' +
  'words, for a choice no such row casts, a row whose program the launcher cannot start, a held row, a retired worker, a brief outside that sandbox, a run already serving the worker, ' +
  'no Casting row for the worker card when no model is named, and while the office starts no message worker (off); a ' +
  "worker in merges-only mode starts it. THE CUT: the worker's worktree is cut from the branch or commit named as " +
  "cutFrom, or with none from the commit the asking run's own worktree stands at, read at the ask. Either must be a " +
  "commit a branch or tag of the sandbox's repository reaches, and is refused with a code otherwise. The cut is used only " +
  "when the worker's worktree <sandbox>/worktrees/<worker> is made at the start: one that is there is used as it stands, " +
  'and a cutFrom named while it is there is refused, naming tools/remove-a-worktree.mjs. ' +
  "THE CLONE: an ask may name one of the sandbox's clones beside repo/ as clone, by its folder name or its absolute " +
  'path there, and then cutFrom, or the asking run\'s own commit, is looked for in that clone and only there; with none ' +
  "named, the asking run's own commit is looked for in the clone its worktree belongs to, if it belongs to one, and " +
  "otherwise in repo/, as is a named cutFrom. A clone is refused with a code unless <sandbox>/instance.json lists it under clones and its " +
  'folder is directly in the sandbox, links followed. The start gives the launcher --clone <name> before --cut-from. ' +
  "THE PATHS: a sandbox's template may leave paths out of a worker's worktree, and an ask may name paths the worker " +
  'needs as paths, each a plain path under the repository, once. The start gives the launcher --with-path <path> for ' +
  'each, after --cut-from, and the launcher refuses one the template does not leave out. A path that is not plain, or ' +
  'one named twice, is refused in words. ' +
  "THE IMAGES: an ask for a codex worker may name files of the worker's worktree as images, each a plain path under it, " +
  'once. The start gives the launcher --image <path> for each, and the launcher gives codex exec each one as -i once the ' +
  "worktree is made. Each must be a file, not a link or a folder: on disk in the worker's worktree while it is there, and " +
  'in the commit it is to be cut from while it is not. An image under one of the ask\'s paths is looked for in the ' +
  "commit the worktree stands at. An image that is not plain, named twice, or not such a file, and images for a runtime " +
  'other than codex, are refused in words, because codex exec does not refuse an image it cannot read. ' +
  'THE PACKAGE: a start may name the packaged task the worker works on, the points of it the worker is given, the ' +
  "difficulty and one sentence why. All four are named together or none is; a start that names a package names its " +
  "difficulty as hard or simple, or leaves it to a `Difficulty:` line of the brief, and the ask and the brief must " +
  'agree. The package must be a task of the project with a package made for work inside the office, and the points ' +
  "must be the package's own, each once. A start that names no package is taken as before and keeps none. The package " +
  "is kept on the ask and copied onto the worker's own run as `workerPackage`, which only the office writes. " +
  "The ask is kept on the supervisor's run under `workerRuns`, with the choice and " +
  'who chose it, and nothing is started by it: the message worker on the host starts it with node tools/sandbox.mjs ' +
  'worker --parent <that run>, or for dsh with exec --agent <worker> --runtime dsh --worktree <sandbox>/worktrees/<worker> ' +
  "--parent <that run>, so the worker's end wakes the supervisor. A Codex model is given to the launcher as " +
  'openai/<model>. The reply reminds how many runs were started under that run, and refuses nothing for a count.'

const WORKER_RUNS_NOTE =
  "THE WORKER RUNS IN EVERY PROJECT ON THE OFFICE'S LIST THAT WAIT FOR THE MESSAGE WORKER: asked for, and the worker " +
  'has no run going in that project. Each row names the project its run is filed in as workspaceId, whatever project ' +
  'the header names, and the list goes project by project in the order of the office\'s list. The worker reads this on ' +
  'every pass. Writes nothing.'

/** What the two run doors say about whose run they take, before the door's own words. */
const THE_RUN_DOORS_TAKE =
  "Only the message worker, with the office's key, is answered, and that is checked before the run is read. The run is " +
  'read in the project it is filed in, whatever project the header names, and the door works there; a run filed in a ' +
  "project that is not on the office's list is refused in words, and nothing is written. "

const STARTING_NOTE =
  'THE MESSAGE WORKER IS STARTING A WORKER RUN with its launcher run: {"agent": "<the worker\'s id>", "wrapper": "<run>"}. ' +
  THE_RUN_DOORS_TAKE +
  'Everything the ask was checked for is checked again, and the Casting row the ask kept is read as the ask read it: a ' +
  'changed, held or removed row fails the start, and no other row is taken or rolled. The program and the model are ' +
  "the ask's choice, a Codex model as openai/<model>, or the Casting row for the worker card when it chose none. The " +
  "reply's verb is exec for a dsh worker, with its worktree, and worker for the others. Its cutFrom is the commit the ask " +
  "chose, while the worker's worktree is not there, and the commit the worktree stands at while it is, so that the run " +
  "is filed at the commit its worktree stands at. Its clone is the sandbox's clone the ask named, given as --clone with " +
  "cutFrom while the worktree is not there, and null otherwise. Its paths are the paths the ask named, given as --with-path, " +
  'and empty when it named none. Its images are the images the ask named, given as --image, and empty when it named ' +
  'none; each is checked again where the worktree stands, and one that is no longer a file there fails the start. A row with native selection data is given in the reply as ' +
  "selection, which the launcher is given as --selection. A failure is written as `failed`, the supervisor is told, and the request is refused. The reply is what " +
  'the launcher is given.'

const ENDED_NOTE =
  'THE MESSAGE WORKER SAYS HOW A WORKER RUN\'S LAUNCHER ENDED: {"agent": "<the worker\'s id>", "wrapper": "<run>", ' +
  '"ok": true, "says": "…"}. ' +
  THE_RUN_DOORS_TAKE +
  'A launcher that ended before it filed a run leaves the ask failed, and the supervisor is told.'

const asked = z
  .object({
    brief: z.string().trim().min(1),
    runtime: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    cutFrom: z.string().trim().min(1).max(200).optional(),
    clone: z.string().trim().min(1).max(300).optional(),
    // NOT TRIMMED: a path is checked as it was written, and one that is not plain is refused in words.
    paths: z.array(z.string().max(300)).max(50).optional(),
    images: z.array(z.string().max(300)).max(50).optional(),
    // THE PACKAGE IT WORKS ON, with the points, difficulty and why that go with it. All four together, or none of them.
    package: z.string().trim().min(1).max(200).optional(),
    points: z.array(z.string().trim().min(1).max(200)).min(1).max(200).optional(),
    difficulty: z.string().trim().min(1).max(20).optional(),
    why: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
const starting = z.object({ agent: z.string().trim().min(1), wrapper: z.string().trim().min(1) }).strict()
const ended = z
  .object({ agent: z.string().trim().min(1), wrapper: z.string().trim().min(1), ok: z.boolean(), says: z.string().trim().min(1).max(2000) })
  .strict()
const handAsked = z.object({
  askedBy: z.string().trim().min(1).optional(),
  brief: z.string().trim().min(1).optional(),
  cutFrom: z.string().trim().min(1).optional(),
  worktree: z.string().trim().min(1).optional(),
}).strict()

/** Only the message worker, proved by the office's own key, reports a worker run it starts. */
function onlyTheMessageWorker(actor: Actor, what: string): void {
  if (actor.provedBy !== 'the-office-key' || actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) {
    throw new PanelError(`Only the office's message worker, with the office's key, ${what}. Nothing was written.`, 403)
  }
}

export async function workerRunRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { agent: string } }>('/agents/:agent/hand-run', route('agent.hand-run', 'remote'), async (req) => {
    const body = parse(handAsked, req.body ?? {}, 'The hand start asked for')
    return sqlite.transaction(() => {
      const ask = theHandStartAskedFor({ ...body, agent: req.params.agent, workspaceId: workspaceOf(req), actor: actorFrom(req) })
      if (ask === null) return { cut: null }
      keepTheHandStart(ask)
      return { cut: ask.answer }
    })()
  })
  app.post<{ Params: { agent: string } }>('/agents/:agent/worker-run', route('agent.worker-run', 'remote', ASK_NOTE), async (req, reply) => {
    const body = parse(asked, req.body ?? {}, 'The worker run asked for')
    const answer = askForAWorkerRun({
      agent: req.params.agent,
      brief: body.brief,
      ...(body.runtime === undefined ? {} : { runtime: body.runtime }),
      ...(body.model === undefined ? {} : { model: body.model }),
      ...(body.cutFrom === undefined ? {} : { cutFrom: body.cutFrom }),
      ...(body.clone === undefined ? {} : { clone: body.clone }),
      ...(body.paths === undefined ? {} : { paths: body.paths }),
      ...(body.images === undefined ? {} : { images: body.images }),
      ...(body.package === undefined ? {} : { package: body.package }),
      ...(body.points === undefined ? {} : { points: body.points }),
      ...(body.difficulty === undefined ? {} : { difficulty: body.difficulty }),
      ...(body.why === undefined ? {} : { why: body.why }),
      workspaceId: workspaceOf(req),
      actor: actorFrom(req),
    })
    return reply.code(202).send(answer)
  })

  app.get(
    '/worker/worker-runs',
    route('worker.worker-runs', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the worker runs to start here' }, WORKER_RUNS_NOTE),
    async (req) => {
      // THE HEADER IS CHECKED, AS AT EVERY DOOR, AND CHOOSES NOTHING HERE: the list holds every project the worker serves.
      workspaceOf(req)
      return { workerRuns: theWorkerRunsToStartInEveryServedProject() }
    },
  )

  app.post<{ Params: { run: string } }>(
    '/worker/worker-runs/:run/starting',
    route('worker.worker-run-starting', 'local', { because: 'starts-work-on-this-machine', act: 'Starting a worker run' }, STARTING_NOTE),
    async (req) => {
      // THE KEY FIRST, THEN THE RUN, so a caller without the office's key learns nothing of a run in another project.
      workspaceOf(req)
      onlyTheMessageWorker(actorFrom(req), 'starts a worker run')
      const run = theRunOfAServedProject(req.params.run)
      const body = parse(starting, req.body ?? {}, 'The start of a worker run')
      return { workerRun: startingTheWorkerRun({ run: req.params.run, agent: body.agent, wrapper: body.wrapper, workspaceId: run.workspaceId }) }
    },
  )

  app.post<{ Params: { run: string } }>(
    '/worker/worker-runs/:run/ended',
    route('worker.worker-run-ended', 'local', { because: 'starts-work-on-this-machine', act: "Recording the end of a worker run's launcher" }, ENDED_NOTE),
    async (req) => {
      workspaceOf(req)
      onlyTheMessageWorker(actorFrom(req), "says how a worker run's launcher ended")
      const run = theRunOfAServedProject(req.params.run)
      const body = parse(ended, req.body ?? {}, "How a worker run's launcher ended")
      return {
        workerRun: theWorkerRunsLauncherEnded({ run: req.params.run, agent: body.agent, wrapper: body.wrapper, ok: body.ok, says: body.says, workspaceId: run.workspaceId }),
      }
    },
  )
}
