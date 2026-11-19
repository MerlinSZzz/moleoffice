// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE DOORS ABOUT WAKING AN AGENT, AND NOT ONE OF THEM WAKES ANYBODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS DELIBERATELY MISSING
 * ---------------------------------------------------------------------------------------
 *
 * Two doors write and read a durable record that somebody wants an agent woken. One door answers
 * which agents would be candidates. **Nothing here starts a process, launches a provider, resumes a
 * session or writes into a terminal, and nothing under `src/` can**.
 *
 * So there is no `POST /api/agents/:id/wake` that wakes anything, and no route that moves a wake
 * from `wanted` to anything else. **The half that would act does not exist, and whether it may ever
 * exist is the owner's question and it is open.** The owner's brief has a narrow rule in force meanwhile:
 * wake only for a message the person themselves sent, and never without a press.
 * `design/round-eleven/design/the-wake-boundary.md` is the whole account.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE REPLY SAYS WHAT IT DID NOT DO, EVERY TIME
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/export` writes the files, declines to run git, and says so on every call. These have
 * the same shape and the same reason: the person or agent reading the reply may believe something
 * is now on its way to the agent. Nothing is, and a reply that left that to be inferred would be
 * this repository's first rule broken — a 200 that reads as *done* when what was done is *written
 * down*.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import {
  A_WAKE_ROW_STARTS_NOTHING,
  WAKE_POLICIES,
  WAKE_POLICY,
  WAKE_STATE,
  recordThatAWakeIsWanted,
  wakesFor,
  type WakePolicy,
} from '../lib/wake.ts'
import { watchdogCandidates } from '../lib/watchdog.ts'
import { workspaceOf } from '../lib/workspaces.ts'

// ============================================================================ what a body may say

const wantBody = z.object({
  because: z.string().min(1, 'Say why this agent should be reachable again, in one plain sentence.'),
  policy: z.enum(WAKE_POLICIES as unknown as [WakePolicy, ...WakePolicy[]]),
  evidence: z.unknown().optional(),
})

// ============================================================================ the sentences

const WANT_NOTE =
  'Writes down that somebody wants this agent woken: which agent, who wants it, why in one plain sentence, and ' +
  'under which of three reasons. IT STARTS NOTHING. No process is launched, no provider session is resumed, no ' +
  'terminal is written to, and nothing is on its way to the agent when this returns 200 — the reply says so in ' +
  'its own field on every call. THERE IS NO ROUTE THAT ACTS ON ONE OF THESE ROWS, and whether Mole Office may ever ' +
  'start a process on this machine is an open question that belongs to the owner. The state written is always ' +
  '"wanted" and a caller cannot choose it: the other four words describe what happens after something acts, and ' +
  'nothing acts. "The owner pressed it" is refused to an agent, because that word means a person asked for this ' +
  'themselves and an agent writing it would record somebody else\'s act under their name. A wake with no reason ' +
  'is refused — the reason is what the agent would be told when it woke. Two wakes wanted for one agent are two ' +
  'facts: the second is not refused, and the reply names the others already waiting.'

const HISTORY_NOTE =
  'Every wake somebody has wanted for this agent, newest first, with who wanted it, why, under which reason, and ' +
  'where it stands. Nothing here has ever moved past "wanted", because nothing in Mole Office acts on one of these ' +
  'rows. The five state words are published beside the list with what each would mean and whether this server ' +
  'writes it, so a reader never has to look one up. An agent with no wakes reads as none wanted, which is ' +
  'nothing there rather than nobody looked.'

const CANDIDATES_NOTE =
  'Which agents in this project would be candidates for a wake, with all seven conditions and what each one read. ' +
  'IT ANSWERS A QUESTION AND DOES NOT ACT: no wake is recorded, no process is started, no message is sent. Only ' +
  'an agent whose work state is Working can ever be a candidate — never Reporting, Standing by, Blocked or ' +
  'Finished, and never because a process is online, a terminal is idle or a timer elapsed. THREE OF THE SEVEN ' +
  'CONDITIONS CANNOT BE EVALUATED BY THIS PRODUCT AT ALL, and they say so rather than defaulting to true or ' +
  'false, so no agent reads as a candidate today and the reply says which conditions stopped it. Each condition ' +
  'carries what would answer it. The quiet threshold is reported with a sentence saying nobody has measured what ' +
  'it should be.'

// ============================================================================ the routes

export async function wakeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/agents/:id/wakes', route('agent.wake-wanted', 'remote', WANT_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const body = parse(wantBody, req.body ?? {}, 'This wake was not written down:')
    const written = recordThatAWakeIsWanted(id, {
      workspaceId,
      actor: actorFrom(req),
      because: body.because,
      policy: body.policy,
      ...(body.evidence === undefined ? {} : { evidence: body.evidence }),
    })
    // The three reasons travel with the reply so a caller never restates them, and so that a word
    // added to the vocabulary reaches every caller without anybody typing the list a second time.
    return { ...written, policies: WAKE_POLICY }
  })

  app.get('/agents/:id/wakes', route('agent.wakes', 'remote', HISTORY_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const wakes = wakesFor(id, workspaceId)
    return {
      agentId: id,
      wakes,
      states: WAKE_STATE,
      note:
        wakes.length === 0
          ? 'Nobody has written down a wake for this agent. That is nothing there, not nobody looked.'
          : `${wakes.length} wake${wakes.length === 1 ? '' : 's'} wanted for this agent. ` +
            A_WAKE_ROW_STARTS_NOTHING,
    }
  })

  app.get('/wake-candidates', route('agent.wake-candidates', 'remote', CANDIDATES_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = req.query as { quietForMinutes?: string }
    // A THRESHOLD THAT IS NOT A NUMBER IS REFUSED RATHER THAN REPLACED BY THE DEFAULT. Silently
    // reading `quietForMinutes=soon` as sixty would answer a question nobody asked and report the
    // answer as if it were the one they did.
    let quietForMinutes: number | undefined
    if (query.quietForMinutes !== undefined && query.quietForMinutes !== '') {
      quietForMinutes = Number(query.quietForMinutes)
      if (!Number.isFinite(quietForMinutes) || quietForMinutes < 0) {
        throw Object.assign(
          new Error(
            `"${query.quietForMinutes}" is not a number of minutes. Leave it out to use the reading's own ` +
              'threshold, which comes back in the reply with a sentence saying nobody has measured it. Nothing ' +
              'was read.',
          ),
          { statusCode: 400 },
        )
      }
    }
    return watchdogCandidates({ workspaceId, ...(quietForMinutes === undefined ? {} : { quietForMinutes }) })
  })
}
