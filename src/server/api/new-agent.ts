// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEW AGENT DIALOG'S CREATE: POST /api/agents/new makes an agent and opens it in a terminal, in one press.
 *
 * WHAT IT TAKES. A name, and the agent tool, model, effort, role, project and terminal the dialog shows. Each one left
 * out is the dialog's default: the role is the worker card, the project is the one the request names, the terminal is
 * the office's own, and the agent tool, model and effort are the marked Casting row in force for that role and project.
 * The tool, model and effort given must be a Casting row in force for the role and project, as the dialog lists them
 * (`theRowsOfTheScopeInForce`, src/shared/casting.ts). The handle is the name in lowercase, with dashes for spaces.
 *
 * MADE FIRST, OPENED SECOND. Every value is checked before anything is written, and a refusal says that nothing was
 * made. A system that cannot open a terminal outside is asked before the agent is made too, and refused 501. Then the
 * agent record is written, as POST /api/agents/started writes one, with the person as its starter and no key of its own.
 * Then its card message is sent and it is opened. When a step after the record fails, the agent stays made, and the
 * answer is still 201: it says the agent was made, that its terminal was not opened, and why. The dialog draws that as
 * its own state.
 *
 * THE OFFICE'S OWN TERMINAL is opened by the open press's own path (`openTheAgentInATerminal`), which files the run
 * and gives it a run key. A TERMINAL OUTSIDE is the system's (src/server/lib/a-terminal-outside.ts). The office files
 * no run for it, because it does not hold that terminal; the agent's own start files its run. On the person's own
 * press the agent is given a key file of its own (lib/an-agents-key-file.ts), and only MOLE_AGENT_KEY_FILE, its path,
 * goes on the opener's command line. A press that cannot make a key opens it with no key, and the answer says so. The
 * model and effort reach the agent tool's command in both, through `withTheChosenModel` in lib/terminal-agents.ts.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { theRowsOfTheScopeInForce, type CastingRow } from '@shared/casting.ts'
import { whyNameIsRefused, whyThatIsNotAHandle } from '@shared/participants.ts'
import { isARole, theRoleWordsSaid, THE_WORKER } from '@shared/roles.ts'
import { THE_FIRST_SIZE, THE_LARGEST_SIDE } from '../../config/the-terminal-holder.mjs'
import { THE_PROGRAM_FOR_RUNTIME } from '../../config/runtimes.mjs'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { whyThisSystemCannotOpenATerminalOutside, openATerminalOutside } from '../lib/a-terminal-outside.ts'
import { anOutsideStartsKeyFile } from '../lib/an-agents-key-file.ts'
import { writeTheCardMessageToOne } from '../lib/cardmessage.ts'
import { actorFrom } from '../lib/http.ts'
import { assertHandleIsFree } from '../lib/inbox.ts'
import { PanelError } from '../lib/panel-error.ts'
import { parse } from '../lib/parse.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { assertThePersonIsProved, createRecordWithReport, throughTheCardDoor } from '../lib/records.ts'
import { theRoleCards } from '../lib/roles.ts'
import { route } from '../lib/route.ts'
import { isOpenedRuntime, openTheAgentInATerminal, theAgentsStartOutside, withTheChosenModel, type TheChosenModel } from '../lib/terminal-agents.ts'
import { rowsOfRole } from '../lib/the-rows-in-force.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const NOTHING_WAS_MADE = 'Nothing was made.'

const aSide = z.number().int().min(1).max(THE_LARGEST_SIDE)

const aNewAgent = z.strictObject({
  name: z.string(),
  harness: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  role: z.string().optional(),
  project: z.string().optional(),
  opensIn: z.enum(['office', 'outside']).optional(),
  cols: aSide.optional(),
  rows: aSide.optional(),
})

/** Where the agent's terminal was opened, or where it was to open and why it did not. */
type TheTerminal =
  | { opened: true; where: 'office'; id: string; session: string }
  | { opened: true; where: 'outside'; how: string }
  | { opened: false; where: 'office' | 'outside'; says: string }

function refused(sentence: string, status = 400): PanelError {
  return new PanelError(`${sentence} ${NOTHING_WAS_MADE}`, status)
}

/** A value the dialog sent for a Casting cell: the empty string is the empty cell, as the dialog lists it. */
function theCell(row: CastingRow, cell: 'program' | 'model' | 'effort'): string | null {
  return row.cells[cell].value
}

/** The values of one cell across the rows, each once, for a refusal to name. */
function theValuesOf(rows: readonly CastingRow[], cell: 'program' | 'model' | 'effort'): string {
  const values = [...new Set(rows.map((row) => theCell(row, cell) ?? 'none'))]
  return values.length === 0 ? 'none' : values.join(', ')
}

/**
 * THE CASTING ROW THE NEW AGENT IS STARTED BY: of the rows in force for the role and project, the ones with each value
 * given, the marked row first. Each value given that no such row has is refused by name.
 */
function theRowChosen(role: string, project: string, given: { harness?: string; model?: string; effort?: string }): CastingRow {
  const inForce = theRowsOfTheScopeInForce(rowsOfRole(role), project)
  if (inForce === null) {
    throw refused(`The Casting table marks no row for the ${role} card in ${project} or in every project, so there is no agent tool, model or effort to start it with.`)
  }
  let rows = inForce.rows
  for (const [cell, word, said] of [
    ['program', 'agent tool', given.harness],
    ['model', 'model', given.model],
    ['effort', 'effort', given.effort],
  ] as const) {
    if (said === undefined) continue
    const value = said === '' ? null : said
    const left = rows.filter((row) => theCell(row, cell) === value)
    if (left.length === 0) {
      throw refused(`No Casting row in force for the ${role} card in ${project} has the ${word} "${said}" with the choices before it. Those rows have ${theValuesOf(rows, cell)}.`)
    }
    rows = left
  }
  return rows.find((row) => row.marked) ?? rows[0] ?? inForce.marked
}

export async function newAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/agents/new',
    route(
      'agent.make-a-new-agent',
      'local',
      { because: 'acts-on-this-machine', act: 'Making a new agent and opening it in a terminal' },
      'The person makes a new agent and opens it in a terminal, from the new agent dialog. Body {"name", "harness"?, ' +
        '"model"?, "effort"?, "role"?, "project"?, "opensIn"?: "office" or "outside", "cols"?, "rows"?}. The handle is the ' +
        'name in lowercase with dashes for spaces. Left out, the role is the worker card, the project is the one the ' +
        "request names, the terminal is the office's own, and the agent tool, model and effort are the marked Casting row " +
        'in force for the role and project. A value no Casting row in force has, a role that is not a card, a project ' +
        'that does not exist and a name that gives no usable handle are refused 400; a handle a live agent has, or one ' +
        'that once had it in the project, is refused 409; a terminal outside on a system that cannot open one is refused ' +
        '501. Nothing is made then. Otherwise the agent record is written, with the person as its starter, and it is ' +
        "opened. The office's own terminal files the run, with a run key. A terminal outside is the system's: gnome-" +
        'terminal on Linux, Terminal on the Mac, a console window on Windows, and the office files no run for it. On the ' +
        "person's own press it gets a key file of its own, and only MOLE_AGENT_KEY_FILE, the file's path, goes on its " +
        'command line; a press that cannot make a key opens it with no key and says so. ' +
        'The answer is 201 {agent, terminal, says}: terminal.opened is false, with terminal.says, when the agent ' +
        'was made and its terminal was not opened.',
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'Only the person makes a new agent, from the new agent dialog.', NOTHING_WAS_MADE)
      const body = parse(aNewAgent, req.body ?? {}, `${NOTHING_WAS_MADE} The new agent's choices could not be read:`)

      // EVERY VALUE IS CHECKED BEFORE ANYTHING IS WRITTEN.
      const name = body.name.trim()
      const nameProblem = whyNameIsRefused(name)
      if (nameProblem !== null) throw refused(`The name "${body.name}" cannot be used. ${nameProblem}`)
      const handle = name.toLowerCase().replace(/\s+/gu, '-')
      const handleProblem = whyThatIsNotAHandle(handle)
      if (handleProblem !== null) throw refused(`The name "${name}" gives the handle "${handle}". ${handleProblem}`)

      const role = body.role ?? THE_WORKER
      const cards = theRoleCards()
      if (!isARole(cards, role)) throw refused(`"${role}" is not a role here. The roles are ${theRoleWordsSaid(cards)}.`)
      const project = body.project ?? workspaceOf(req)
      if (getWorkspace(project) === null) throw refused(`There is no project "${project}".`)

      const row = theRowChosen(role, project, body)
      const runtime = theCell(row, 'program')
      if (runtime === null || !isOpenedRuntime(runtime)) {
        throw refused(`The office opens an agent in a terminal with ${Object.keys(THE_PROGRAM_FOR_RUNTIME).join(', ')}, and the agent tool chosen is ${runtime ?? 'none'}.`)
      }
      const chosen: TheChosenModel = { model: theCell(row, 'model'), effort: theCell(row, 'effort') }
      // THE START IS WORKED OUT ONCE HERE, so a model the agent tool cannot be started with is refused before it is made.
      try {
        withTheChosenModel([THE_PROGRAM_FOR_RUNTIME[runtime]], runtime, chosen)
      } catch (err) {
        throw refused(err instanceof Error ? err.message : String(err))
      }

      if (agentByHandle(handle) !== null) throw refused(`A live agent already has the handle "${handle}". Choose another name.`, 409)
      try {
        assertHandleIsFree(handle, project, null)
      } catch (err) {
        if (err instanceof PanelError) throw refused(`The handle "${handle}" belongs to another agent in ${project}, or did once. Choose another name.`, err.status)
        throw err
      }

      const opensIn = body.opensIn ?? 'office'
      if (opensIn === 'outside') {
        const cannot = whyThisSystemCannotOpenATerminalOutside()
        if (cannot !== null) throw refused(cannot, 501)
      }

      const starter = participantForActor(actor)
      if (starter === null) throw refused('The person who pressed Create is not in the registry, so nobody would be its starter.', 403)

      // MADE FIRST. The same agent record POST /api/agents/started writes, through the card door because the person names the card.
      const made = throughTheCardDoor(() =>
        createRecordWithReport({
          workspaceId: project,
          kind: 'agent',
          title: name,
          data: {
            handle,
            state: 'active',
            runtime,
            startedBy: { kind: starter.kind, id: starter.id },
            role,
            cardChosenBy: { how: 'a-starter', who: { kind: starter.kind, id: starter.id } },
          },
          actor,
        }),
      )

      // OPENED SECOND. Anything that fails from here leaves the agent made, and the answer says both, and which step failed.
      let registry: string | null = null
      let terminal: TheTerminal
      let itsKey = ''
      try {
        const registered = agentForRecord(made.record.id)
        if (registered === null) throw new Error(`No registry row answered for the agent record ${made.record.id}, so its card message was not sent.`)
        registry = registered.id
        writeTheCardMessageToOne({ to: { kind: 'agent', id: registered.id }, workspaceId: project, role, actor })
        if (opensIn === 'office') {
          const opened = await openTheAgentInATerminal({
            reference: registered.id,
            resume: false,
            workspaceId: project,
            actor,
            cols: body.cols ?? THE_FIRST_SIZE.cols,
            rows: body.rows ?? THE_FIRST_SIZE.rows,
            chosen,
          })
          terminal = { opened: true, where: 'office', id: opened.terminal.id, session: opened.session }
        } else {
          const key = anOutsideStartsKeyFile(actor, registered.id)
          itsKey = ` ${key.says}`
          const opened = await openATerminalOutside(
            theAgentsStartOutside({ reference: registered.id, workspaceId: project, actor, chosen, ...(key.file === null ? {} : { keyFile: key.file }) }),
          )
          terminal = opened.opened ? { opened: true, where: 'outside', how: opened.how } : { opened: false, where: 'outside', says: opened.says }
        }
      } catch (err) {
        terminal = { opened: false, where: opensIn, says: err instanceof Error ? err.message : String(err) }
      }

      const where = opensIn === 'office' ? "the office's terminal" : 'a terminal outside'
      const says = terminal.opened
        ? `${handle} was made, and opened in ${terminal.where === 'outside' ? terminal.how : where}.${itsKey}`
        : `${handle} was made, and not opened in ${where}: ${terminal.says}${itsKey}`
      reply.code(201)
      return {
        agent: { id: registry, record: made.record.id, handle, name, runtime, model: chosen.model, effort: chosen.effort, role, project },
        terminal,
        says,
      }
    },
  )
}
