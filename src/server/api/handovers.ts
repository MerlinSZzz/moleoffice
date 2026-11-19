// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HANDOVER DOORS AND THE ONE READ AFTER A COMPACTION. Wave 13k round 46, with problem dkej5WjBNyWe
 * and two of the person's decisions.
 *
 *   PUT /api/agents/:id/handover          write a new handover for this agent (a new row; nothing earlier changes)
 *   GET /api/agents/:id/handover          the current handover and how many earlier ones there are; ?history=1 lists them
 *   GET /api/after-a-compaction           role, rules, handover, run and hold, in one small read, for the session hook
 *
 * `:id` is an agent's registry id or its handle; the one resolver answers either, in reading mode. Who may write and
 * who may read is in src/server/lib/handovers.ts, and what the one read reads is in src/server/lib/after-a-compaction.ts.
 *
 * THE PERSON'S GRANT CARRIES BOTH DOORS WHERE THIS OFFICE SAYS IT DOES (wave 13s round 68). The write asks it in
 * `whoMayWriteTheHandoverOf`, after the person and the agent's own key, and the read asks it here, after the readers
 * the lib names. A handover a secretary writes under the grant names the secretary as its writer.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { aRaiseCarriesIt } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  HANDOVER_HISTORY_LIMIT,
  charactersIn,
  mayReadTheHandoverOf,
  refuseAReaderOfTheHandover,
  theCurrentHandover,
  theHandoverHistory,
  theHandoverPart,
  writeAHandover,
} from '../lib/handovers.ts'
import { whoPressedItUnderTheGrant } from '../lib/the-persons-own-words.ts'
import { whatComesBackAfterACompaction } from '../lib/after-a-compaction.ts'
import { HANDOVER_LONGEST_CHARACTERS, gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'

const agentParams = z.strictObject({ id: z.string().min(1) })
const handoverBody = z.strictObject({ text: z.string() })
const handoverQuery = z.strictObject({ history: z.enum(['1']).optional() })
const afterACompactionQuery = z.strictObject({ run: z.string().min(1).optional() })

/** The agent `:id` names, or a refusal naming the name nothing answers to. */
function theAgent(asked: string): RegisteredAgent {
  const named = theAgentAnArrivingReferenceNames(asked, 'reading')
  const agent = named === null ? null : (readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent | null)
  if (agent === null) {
    throw new PanelError(
      `Mole Office has no agent "${asked}", so there is no handover for it. GET /api/participants lists every agent this installation knows.`,
      404,
    )
  }
  return agent
}

export async function handoverRoutes(app: FastifyInstance): Promise<void> {
  app.put(
    '/agents/:id/handover',
    route(
      'agent.handover-write',
      'remote',
      'WRITE A NEW HANDOVER for this agent: plain text {text} for its next session, or whoever takes over its work. ' +
        'A new row every time; nothing earlier is changed, and the newest is the current one. The agent itself, ' +
        'sending its own agent key, or the person may write it, and a secretary the person\'s grant carries where ' +
        'this office says it does, which is stored as the writer; another agent is refused. Who wrote it, when, and ' +
        `in which run are written by Mole Office. At most ${String(HANDOVER_LONGEST_CHARACTERS)} characters.`,
    ),
    async (req) => {
      const { id: asked } = parse(agentParams, req.params, 'The URL is not usable:')
      const body = parse(handoverBody, req.body, 'That is not a handover:')
      const workspaceId = workspaceOf(req)
      const agent = theAgent(asked)
      const actor = actorFrom(req)
      const stored = writeAHandover({ agent, text: body.text, actor, workspaceId })
      const { earlier } = theCurrentHandover(agent.id, workspaceId)
      const writer =
        whoPressedItUnderTheGrant(actor) === null
          ? `the ${stored.writtenByKind} "${stored.writtenById}"`
          : `the secretary "${stored.writtenById}" under the person's grant`
      return {
        handover: stored,
        earlier,
        says:
          `Stored a handover of ${String(charactersIn(stored.text))} characters for "${agent.handle}" in the project ` +
          `"${workspaceId}", written by ${writer} at ${stored.writtenAt}` +
          `${stored.sessionId === null ? ', in no run the request named' : `, in the run "${stored.sessionId}"`}. ` +
          `It is now the current handover; ${String(earlier)} earlier ${earlier === 1 ? 'one is' : 'ones are'} kept unchanged.`,
      }
    },
  )

  app.get(
    '/agents/:id/handover',
    route(
      'agent.handover',
      'remote',
      'THIS AGENT\'S CURRENT HANDOVER, in this project, and how many earlier ones there are. With ?history=1, the ' +
        `handovers themselves, newest first, at most ${String(HANDOVER_HISTORY_LIMIT)}. Read by the agent itself, ` +
        'the person, and the agent that started it, and by a secretary the person\'s grant carries where this office ' +
        'says it does. An agent with none is answered with current null and a ' +
        'sentence saying nobody has written one.',
    ),
    async (req) => {
      const { id: asked } = parse(agentParams, req.params, 'The URL is not usable:')
      const query = parse(handoverQuery, req.query, 'A handover read takes only history=1:')
      const workspaceId = workspaceOf(req)
      const agent = theAgent(asked)
      const actor = actorFrom(req)
      // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate lets any caller read, so the raise is not asked, refuses
      // nobody and has nothing written down under it. At block the raise is asked as before, and a read it carries is not
      // counted as one the gate would hold.
      const position = gatePosition('who-reads-a-handover')
      if (!mayReadTheHandoverOf(actor, agent) && !(position === 'block' && aRaiseCarriesIt(actor)) && gateMet('who-reads-a-handover', position!) === 'block') refuseAReaderOfTheHandover(agent)
      const { current, earlier, says } = theHandoverPart(agent, workspaceId)
      return {
        agent: { id: agent.id, handle: agent.handle, name: agent.name },
        workspaceId,
        current,
        earlier,
        says,
        longest: HANDOVER_LONGEST_CHARACTERS,
        write: `PUT /api/agents/${agent.handle}/handover`,
        ...(query.history === '1' ? { history: theHandoverHistory(agent.id, workspaceId), historyLimit: HANDOVER_HISTORY_LIMIT } : {}),
      }
    },
  )

  app.get(
    '/after-a-compaction',
    route(
      'session.after-a-compaction',
      'remote',
      'WHAT A SESSION NEEDS BACK FIRST AFTER A COMPACTION, IN ONE SMALL READ: who it answers as and its card, the ' +
        'chapters its card names with their levels and rule names, its newest handover, the run (the `run` query or ' +
        'the session header) with its stamp and its compactions, and whether a waiter holds its handle. It does not ' +
        'work out the brief, the open loops or the waiting list; GET /api/where-you-stand does. Each part that could ' +
        'not be read says so. `answeredAt` is the office\'s clock.',
    ),
    async (req) => {
      const query = parse(afterACompactionQuery, req.query, 'After a compaction takes only run:')
      const workspaceId = workspaceOf(req)
      const actor = actorFrom(req)
      const said = actor.sessionId ?? null
      const runAsked = query.run ?? (said === null || said.trim() === '' ? null : said)
      return whatComesBackAfterACompaction({ actor, workspaceId, runAsked })
    },
  )
}
