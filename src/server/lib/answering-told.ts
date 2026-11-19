// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS ANSWERING AS AN AGENT, TOLD TO THE OPEN PAGES WHEN IT CHANGES. Wave 13w round 26, by a
 * decision.
 *
 * The chat's Cannot reach notice and its header draw three parts of the conversation door's answer: how the agent is
 * answered, the session record that answers, and whether the office could not tell (GET /api/messages/conversation).
 * Until this file nothing announced a change to them, so the chat read the open conversation with an agent every
 * thirty seconds. Now `answering.changed` is announced when one of the three moved, and the chat reads on it.
 *
 * WHEN THIS LOOKS. Each write that can move the reading asks for a look at the agents it touched:
 *
 *   - a hold taken or let go, in lib/handles.ts (`holdTheHandle`, `releaseAHold`). A hold that lapsed is let go by the
 *     next reader through `releaseAHold`, so that is a write too;
 *   - a session record created or changed, in lib/records.ts. A run is filed running, ends, and has its wait started
 *     (`startTheWait` writes `waitsUntil` through `patchRecord`), all through those two doors;
 *   - a message taken by a run, and a wait said to be over, in api/worker.ts;
 *   - a turn draft held or sent, in lib/turn-drafts.ts, which moves the fourth part below.
 *
 * Some changes need no write at all: a hold that went quiet, a wait whose time ran out, a transcript that stopped
 * growing. The server's once-a-minute presence look asks for a look at every agent (src/server/api/events.ts), so
 * those reach a page within a minute.
 *
 * WHAT IS COMPARED. The three parts, read by `theAnsweringReading` in lib/worker.ts and `whatAReadingSaysOfReach`,
 * which is how the conversation door reads them, so the two cannot disagree. A fourth part is whom the agent is
 * replying to, read by `whomAnAgentIsReplyingTo` in lib/turn-drafts.ts, which the conversation door reads too. The
 * sentence `says` is left out: it can name a time, and a page reads it again with the conversation.
 *
 * WHERE. Only in the projects a person's page watches, because only a person's page draws the chat, and the
 * conversation door reads the answering in the page's project. The first look in a project only remembers: the page
 * that opened read the conversation itself. A look asked for one agent whose last reading in a watched project is not
 * remembered announces it, because a missed change leaves a page wrong and a needless one costs one read.
 *
 * NOTHING HERE WRITES. The reading is taken with `readOnly`, so a lapsed hold is not let go by this look.
 *
 * A LATER LOOK AT NAMED AGENTS READS ONLY THE RUNS THAT COULD BE THEIRS (`theseAgentsOnly` in lib/presence.ts), and the
 * same code decides from those runs what it decides from every run: each part of the reading is decided run by run or
 * agent by agent, so a run that is none of theirs changed nothing it said about them. A first look and a look at every
 * agent still read every run. Wave 13y round 107: on the made-up office at the 22 October scale, a hold taken while a
 * person's page was open took 121 ms reading every run of the project, and takes 9 ms reading only theirs. A run stored
 * before an alias was filed holds the agent's old id, so the runs that could be theirs are found by the aliases filed
 * for them too, read once for the whole look (wave 13y round 108).
 */
import { listParticipants } from '../db/list-participants.ts'
import { announce, everyPageOpen } from './events.ts'
import { theAgentFactsReadOnce, thePresenceReadingsOf, type PresenceSessionRows } from './presence.ts'
import { theseAgentsOnly } from '../db/these-agents-only.ts'
import { everyAgentsIdentityReadOnce } from './agent-references.ts'
import { sqlite } from '../db/client.ts'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { theAnsweringReading, whatAReadingSaysOfReach } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { whenStored } from '../db/told-when-stored.ts'
import { lookOnOneReadingOfEveryProcess } from './a-look-on-one-reading-of-every-process.ts'
import { whomAnAgentIsReplyingTo } from '../db/whom-an-agent-is-replying-to.ts'

/** What the pages were last told of each agent, by `<project>#<agent id>`, as JSON of the four parts. */
const lastTold = new Map<string, string>()

/** The projects whose first look has been taken. */
const looked = new Set<string>()

/** The projects a person's page watches now. */
function theProjectsWatched(): string[] {
  const out = new Set<string>()
  for (const page of everyPageOpen()) if (page.who !== null && page.who.kind === 'person') out.add(page.workspaceId)
  return [...out]
}

/**
 * ASK FOR A LOOK AT THESE AGENTS, OR AT EVERY AGENT, ONCE WHAT IS BEING WRITTEN NOW IS STORED.
 *
 * Inside a transaction the look waits for the outermost commit, and a write rolled back asks for no look
 * (src/server/db/told-when-stored.ts). Returns nothing: what the look announced is `answeringLookNow`'s answer.
 */
export function answeringMayHaveChanged(agents: readonly string[] | 'every agent'): void {
  whenStored(() => {
    // ON WINDOWS, AFTER ONE READING OF EVERY PROCESS MADE BY THE WAY THAT WAITS (lib/a-look-on-one-reading-of-every-process.ts).
    lookOnOneReadingOfEveryProcess('the look at who answers', (line) => console.warn(line), () => {
      answeringLookNow(agents)
    })
  })
}

/**
 * ASK FOR A LOOK AT THE AGENTS THESE RUNS SERVE, given as the `data` of their session records: for a record changed,
 * as it was and as it is. Which agents those are is worked out once the write is stored, and not at all while no
 * person's page is open.
 */
export function answeringOfTheAgentsTheseRunsServeMayHaveChanged(...runs: unknown[]): void {
  whenStored(() => {
    if (theProjectsWatched().length === 0) return
    const served = new Set<string>()
    for (const data of runs) {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) continue
      const agent = theAgentARunServes(data as Record<string, unknown>)
      if (agent !== null) served.add(agent.id)
    }
    if (served.size === 0) return
    // ON WINDOWS, AFTER ONE READING OF EVERY PROCESS MADE BY THE WAY THAT WAITS (lib/a-look-on-one-reading-of-every-process.ts).
    lookOnOneReadingOfEveryProcess('the look at who answers that the write of a run asks for', (line) => console.warn(line), () => {
      answeringLookNow([...served])
    })
  })
}

/**
 * LOOK NOW AND ANNOUNCE EACH AGENT WHOSE ANSWERING CHANGED, in each project a person's page watches. Returns what was
 * announced, as `<project>#<agent id>`, for the tests.
 */
export function answeringLookNow(agents: readonly string[] | 'every agent', at: number = Date.now(), clockSessions?: PresenceSessionRows): string[] {
  const watched = theProjectsWatched()
  // FORGET WHAT NOBODY WATCHES ANY MORE, so a project watched again later starts from its own first look.
  const stillWatched = new Set(watched)
  for (const key of [...lastTold.keys()]) if (!stillWatched.has(key.slice(0, key.indexOf('#')))) lastTold.delete(key)
  for (const project of [...looked]) if (!stillWatched.has(project)) looked.delete(project)
  if (watched.length === 0) return []
  const announced: string[] = []
  // THE FILED REGISTRY ALIASES, READ AT MOST ONCE FOR THE WHOLE LOOK: for the runs that could be the named agents', the
  // presence readings of each project and each agent's reading.
  const aliases = theFiledAliasesReadOnce(sqlite)
  // THE REGISTRY AND WHOM EACH AGENT IS REPLYING TO, READ AT MOST ONCE FOR THE WHOLE LOOK as well. Neither depends on the
  // project, the look is one synchronous pass, and it writes nothing.
  let registry: ReturnType<typeof listParticipants>['agents'] | null = null
  const registered = () => (registry ??= listParticipants().agents)
  const replyingTo = new Map<string, string[]>()
  const whomItIsReplyingTo = (agentId: string): string[] => {
    const held = replyingTo.get(agentId)
    if (held !== undefined) return held
    const readers = whomAnAgentIsReplyingTo(agentId)
    replyingTo.set(agentId, readers)
    return readers
  }
  for (const workspaceId of watched) {
    const first = !looked.has(workspaceId)
    looked.add(workspaceId)
    const whom = agents === 'every agent' || first ? registered().map((one) => one.id) : agents
    const identityOf = everyAgentsIdentityReadOnce(sqlite)
    const named = agents === 'every agent' || first
      ? undefined
      : theseAgentsOnly(agents, agents.flatMap((id) => identityOf(id)?.handle ?? []), aliases)
    const shared = thePresenceReadingsOf(
      workspaceId, undefined, identityOf, named, true,
      clockSessions === undefined ? undefined : () => clockSessions(workspaceId), undefined, aliases,
    )
    const facts = theAgentFactsReadOnce(new Date(at), true, registered, identityOf, () => shared.waiting().map((one) => one.session))
    for (const agentId of whom) {
      const reading = theAnsweringReading(agentId, workspaceId, shared.sessions(), shared.waiting(), {
        machine: shared.machine,
        readOnly: true,
        at,
        runningRows: shared.runningRows,
        messageRows: shared.messageRows,
        hold: facts.hold(agentId),
        cardOf: facts.cardOf,
        runOrigin: facts.runOrigin,
        identityOf,
        aliases,
      })
      const couldNotTell = whatAReadingSaysOfReach(reading)?.was === 'could not tell'
      // AND WHOM THE AGENT IS REPLYING TO: the readers of the turn drafts it holds, which the chat's Replying is drawn from.
      const now = JSON.stringify([reading.answering.how, reading.answering.session, couldNotTell, whomItIsReplyingTo(agentId)])
      const key = `${workspaceId}#${agentId}`
      const before = lastTold.get(key)
      lastTold.set(key, now)
      if (first || before === now) continue
      // A LOOK AT EVERY AGENT ANNOUNCES ONLY A CHANGE IT SAW, because it read every agent last time too. A look at
      // named agents announces one it has no reading of, as the head of this file says.
      if (before === undefined && agents === 'every agent') continue
      announce({ name: 'answering.changed', who: { kind: 'agent', id: agentId }, workspaceId, how: reading.answering.how, couldNotTell })
      announced.push(key)
    }
  }
  return announced
}

/** Forget every reading remembered. For a test that wants to start from nothing. */
export function forgetWhatPagesWereToldOfAnswering(): void {
  lastTold.clear()
  looked.clear()
}
