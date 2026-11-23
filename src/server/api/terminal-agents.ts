// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Open an agent and read its pane, way back or steps: the person, a secretary with its own key on
 * this computer, or the grant where carried. Showing a pane still requires the person or the grant.
 * Bringing a run back requires the person, the grant, or the agent's own superior on this computer:
 * an agent above it in its chain of starters. An agent opens only in its recorded, existing start
 * folder, or, with none recorded, in a folder of its own that the office makes in its data folder and
 * records.
 *
 * A secretary's own press, and a superior's press on the way back, is attributed to that agent and
 * may prove a run key as a starter. The key goes only to the terminal environment. A press under the
 * grant opens without a key. Neither a supervisor, a worker nor a sandbox gains the ordinary
 * secretary authority, and no press brings every agent back.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { THE_FIRST_SIZE, THE_LARGEST_SIDE } from '../../config/the-terminal-holder.mjs'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { showThePane, thePaneOfTheAgent } from '../lib/agent-pane.ts'
import { theStepsOfTheAgent } from '../lib/agent-steps.ts'
import { aStarterAboveTheAgentPresses, bringTheRunBack, openTheAgentInATerminal, theWayBackOfTheAgent } from '../lib/terminal-agents.ts'
import type { AnAgentsPane, AnAgentsSteps, AWayBack } from '@shared/terminals.ts'
import { aTerminalRefusal } from '../lib/terminals.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'
import { assertATerminalAgentIsHere, THE_TERMINAL_PERMISSION } from './terminals.ts'

const aSide = z.number().int().min(1).max(THE_LARGEST_SIDE)

const openPress = z
  .object({
    agent: z.string().min(1),
    resume: z.boolean().optional(),
    cols: aSide.optional(),
    rows: aSide.optional(),
  })
  .strict()

/**
 * THE PERSON OR GRANT CHECK, after the ordinary secretary authority at the doors that carry it: the person, then their grant where this office's
 * list says it carries the door, as `onlyThePersonMay` in api/visitors.ts asks it. The check refuses in its own words where
 * the list keeps the door, and an agent with no grant gets the old refusal unchanged.
 * tests/every-person-only-check-is-sorted-for-a-raise.test.ts sorts the file as mixed.
 */
function thePersonOrTheGrant(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor) || aRaiseCarriesIt(actor)) return
  try {
    assertThePersonIsProved(
      actor,
      doing,
      THE_TERMINAL_PERMISSION,
    )
  } catch (err) {
    // THE SAME REFUSAL AS EVERY TERMINAL DOOR'S, WITH ITS CODE, so a page draws it in its own language.
    if (err instanceof PanelError) throw aTerminalRefusal('terminalsOnlyThePerson', err.message, err.status, err.reason)
    throw err
  }
}

/** Open an agent or read its state as a secretary, before considering a press for the person. */
async function theSecretaryOrThePersonOrTheGrant(req: FastifyRequest, actor: Actor): Promise<void> {
  await assertATerminalAgentIsHere(req, actor)
  if (aSecretaryWithItsOwnKey(actor)) return
  thePersonOrTheGrant(actor, theActKeptHere(req))
}

const theAgentNamed = z.object({ agent: z.string().min(1) })

/** The offset the last answer gave as `next`: a whole number of bytes. */
const stepsAsked = z.object({ after: z.string().regex(/^\d{1,15}$/, 'after is a whole number of bytes').optional() })

const wayBackPress = z
  .object({
    /** The run the person saw on the page: the press brings back that run and no other. */
    session: z.string().min(1),
    cols: aSide.optional(),
    rows: aSide.optional(),
  })
  .strict()

export async function terminalAgentRoutes(app: FastifyInstance): Promise<void> {
  /*
   * THE WAY BACK, from wave 13u round 10. The agent's page reads the
   * command that brings the agent's newest run back, and the person's press runs it in a terminal the office holds.
   * A secretary may read the command on its own key. Running it asks the person, the grant, or an agent above the
   * agent in its chain of starters (aStarterAboveTheAgentPresses), who may bring it back on its own key.
   */
  app.get(
    '/terminals/agents/:agent/way-back',
    route(
      'terminals.way-back',
      'local',
      { because: 'acts-on-this-machine', act: "Reading the way back to an agent's run" },
      "The person or a secretary with its own key on this computer reads the command that brings an agent's newest run back: its folder, its conversation and the flags " +
        'it started with, worked out from the run\'s session record. `press` says what the press would do now: ready, ' +
        'running (its program still runs, so the press is refused), sandbox (the command is shown, and the press waits ' +
        'for the sandbox tool) or none (there is no command, and `way.because` says why).',
    ),
    async (req): Promise<AWayBack> => {
      await theSecretaryOrThePersonOrTheGrant(req, actorFrom(req))
      const { agent } = parse(theAgentNamed, req.params, 'Which agent:')
      return theWayBackOfTheAgent(agent, workspaceOf(req))
    },
  )

  app.post(
    '/terminals/agents/:agent/way-back',
    route(
      'terminals.bring-back',
      'local',
      { because: 'acts-on-this-machine', act: "Bringing an agent's run back in a terminal" },
      "The person, or the agent's own superior, brings an agent's run back in a terminal the office holds, with the command GET " +
        '/api/terminals/agents/:agent/way-back shows. Body {"session": <the run\'s session record>}. Refused while the ' +
        'run\'s program still runs, for a run in a sandbox, and when its folder is gone; nothing is filed then. The run it ' +
        'opens is a new session record naming the one it brings back in extra.wayBackOf. The person\'s proved press gives it a run key; a press under the grant gives no key. ' +
        'An agent above the agent in its chain of starters, on this computer and with its own key, may press it too, and the key is made on that agent\'s own proved key. ' +
        'No press brings every agent back.',
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      await assertATerminalAgentIsHere(req, actor)
      const { agent } = parse(theAgentNamed, req.params, 'Which agent:')
      // AN AGENT ABOVE IT IN ITS CHAIN OF STARTERS is asked first, so its press is not read as one under the grant.
      const above = aStarterAboveTheAgentPresses(actor, agent)
      if (!above) thePersonOrTheGrant(actor, theActKeptHere(req))
      const body = parse(wayBackPress, req.body ?? {}, 'The run cannot be brought back:')
      const opened = await bringTheRunBack({
        reference: agent,
        session: body.session,
        workspaceId: workspaceOf(req),
        actor,
        pressedByAStarterAboveIt: above,
        cols: body.cols ?? THE_FIRST_SIZE.cols,
        rows: body.rows ?? THE_FIRST_SIZE.rows,
      })
      reply.code(201)
      return opened
    },
  )

  /*
   * AN AGENT'S TMUX PANE: way B, wave 13u, round 10. The read finds the pane from the agent's
   * newest run's process and that process's terminal; the press shows it in a terminal the office holds, through a
   * view that resizes and switches nothing in the owner's own tmux client (src/config/tmux-pane-view.mjs).
   */
  app.get(
    '/terminals/agents/:agent/pane',
    route(
      'terminals.agent-pane',
      'local',
      { because: 'acts-on-this-machine', act: "Finding an agent's tmux pane" },
      "The person or a secretary with its own key on this computer finds its newest run's office-held terminal first, answered as shown with view naming that terminal and pane null. Otherwise it reads where the agent's tmux pane is: its newest run's process, that process's terminal, and the " +
        'tmux pane on it. `state` is shown, no-run, sandbox, not-running, not-in-a-terminal, not-in-tmux or no-tmux, and ' +
        '`view` is the office\'s terminal showing the pane, when one is open.',
    ),
    async (req): Promise<AnAgentsPane> => {
      await theSecretaryOrThePersonOrTheGrant(req, actorFrom(req))
      const { agent } = parse(theAgentNamed, req.params, 'Which agent:')
      return await thePaneOfTheAgent(agent, workspaceOf(req))
    },
  )

  app.post(
    '/terminals/agents/:agent/pane',
    route(
      'terminals.show-pane',
      'local',
      { because: 'acts-on-this-machine', act: "Showing an agent's tmux pane" },
      "The person shows an agent's screen. An office-held terminal is returned with opened false and pane null. A tmux pane is shown in a terminal the office holds, at the pane's own size. It watches through a " +
        "grouped session of its own, attached in control mode with ignore-size, so the owner's own tmux client is not " +
        'resized or switched; what is typed into it goes to the pane. A view of the same pane that is open already is ' +
        'answered with opened false. Refused, with a code, when the pane cannot be found.',
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      await assertATerminalAgentIsHere(req, actor)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const { agent } = parse(theAgentNamed, req.params, 'Which agent:')
      const shown = await showThePane({ reference: agent, workspaceId: workspaceOf(req), actor })
      reply.code(shown.opened ? 201 : 200)
      return shown
    },
  )

  /*
   * A SANDBOXED RUN'S STEPS, from round 10 of wave 13u, way C. A run in a sandbox has
   * no terminal here, so its page reads what it read, ran, wrote and said from its conversation, as it
   * is written, and never its thinking.
   * The page asks again every few seconds with the `next` it was given. Writing to the run is an ordinary message to
   * its agent, through POST /api/records, and needs no door here.
   */
  app.get(
    '/terminals/agents/:agent/steps',
    route(
      'terminals.agent-steps',
      'local',
      { because: 'acts-on-this-machine', act: "Reading a sandboxed run's steps" },
      "The person or a secretary with its own key on this computer reads the steps of an agent's newest run when it works in a sandbox: what it read, ran, wrote and " +
        'said, read from its conversation file, never its thinking. `?after=<next>` reads only what was written since ' +
        'the last answer. `state` is shown, no-run, not-in-a-sandbox, ended or no-log, and `says` how the file was found.',
    ),
    async (req): Promise<AnAgentsSteps> => {
      await theSecretaryOrThePersonOrTheGrant(req, actorFrom(req))
      const { agent } = parse(theAgentNamed, req.params, 'Which agent:')
      const { after } = parse(stepsAsked, req.query ?? {}, 'Which steps:')
      return theStepsOfTheAgent(agent, workspaceOf(req), after === undefined ? null : Number(after))
    },
  )

  app.post(
    '/terminals/agents',
    route(
      'terminals.open-an-agent',
      'local',
      { because: 'acts-on-this-machine', act: 'Opening an agent in a terminal' },
      'The person or a secretary with its own key on this computer opens a registered agent in a terminal the office holds, in the agent\'s recorded start folder, with ' +
        'its runtime\'s interactive command (claude-code: claude --session-id <a uuid the office chooses>; codex: codex; ' +
        'opencode: opencode; kimi: kimi -S <an id the office chooses>; dsh is not opened). Body {"agent": <handle or ' +
        'registry id>, "resume"?: true to continue its last recorded conversation in that folder}. An agent with no ' +
        'start folder recorded in this project opens in a folder of its own, agents/<handle> in the office\'s data ' +
        'folder, which the office makes for this user alone and records as its start folder. A handle that cannot ' +
        'name a folder on every system, a folder another agent\'s record names, a data folder inside a git working ' +
        'tree, or "resume" with no start folder is refused, and nothing opens. A recorded folder that is gone is ' +
        'refused, never replaced. A press is refused while a run of the agent still runs. Once its process has stopped, ' +
        'POST /api/terminals/agents/<agent>/way-back brings its conversation back in the office terminal. The run is a session record, and the terminal is given ' +
        'MOLE_OFFICE_API, MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION; on a press proved by the ' +
        'person\'s key, or the secretary\'s own proved starter key, it is also given MOLE_AGENT_KEY, a run key revoked when the run ends. A press under the grant gives no key. The answer ' +
        'says whether a key was given, and never holds it.',
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      await theSecretaryOrThePersonOrTheGrant(req, actor)
      const body = parse(openPress, req.body ?? {}, 'The agent cannot be opened in a terminal:')
      const opened = await openTheAgentInATerminal({
        reference: body.agent,
        resume: body.resume ?? false,
        workspaceId: workspaceOf(req),
        actor,
        cols: body.cols ?? THE_FIRST_SIZE.cols,
        rows: body.rows ?? THE_FIRST_SIZE.rows,
      })
      reply.code(201)
      return opened
    },
  )
}
