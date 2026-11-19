// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A SESSION NEEDS BACK FIRST AFTER A COMPACTION, IN ONE SMALL READ. Wave 13k round 46, for problem
 * dkej5WjBNyWe and by one of the person's decisions: "After a compaction an agent's role and rules come
 * back first".
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN READ
 * ---------------------------------------------------------------------------------------
 *
 * After a compaction the session hook used to send a health read, the onboarding read, the run record, a stamp
 * read, five machine and project reads and a handle read. Under a load near 12 the office answered them one at a time
 * and the hook's 10 seconds ran out before the brief came back, so the run got back neither its role card, nor the
 * person's rules, nor what is open. This read answers the part that must come back first, and only that part.
 *
 * WHAT IT READS, AND NOTHING ELSE: the caller's registry row, its role card (held in memory), the chapters its card or
 * its registration names (the office's chapter records) and the agent record that may name them, the run record
 * the request names, the live hold on this agent's handle, and this agent's newest handover. It does NOT work out the
 * brief, the open loops, the waiting list or the attention ranking: GET /api/where-you-stand answers those, after this.
 *
 * Every part that could not be read says so in a sentence. Nothing missing is answered as an empty value.
 */
import { sqlite } from '../db/client.ts'
import { firstSentenceOf } from '@shared/onboarding.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, cardFor } from '@shared/roles.ts'
import { nowStamp } from '@shared/time.ts'
import { kindWord } from '@shared/words.ts'
import { theNameOfAChapter } from '@shared/office-rules.ts'
import type { AReportedCompaction, TheHandoverPart } from '@shared/profile.ts'
import type { WhoIsAnswering } from '@shared/handles.ts'
import type { SelectedOfficeChapter } from './office-regulations.ts'
import { MUST_READ, theChapters, theChaptersLineFor } from './chapters.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { theCardInTheOfficesWords } from './the-card-in-the-offices-words.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { getRecord, type Actor } from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { theLiveHoldOnSession } from './handles.ts'
import { theAnsweringReading } from './worker.ts'
import { handleBeatSeconds, handleLapsesAfterSeconds } from './env.ts'
import { compactionsThisRunReported } from './agent-runs.ts'
import { theHandoverPartFor } from './handovers.ts'

/** Where the whole of the rules is, said once for every reply. */
export const WHERE_THE_WHOLE_RULES_ARE =
  "The whole of every chapter of this office's regulations is at GET /api/office-regulations, and GET /api/brief " +
  'carries the chapters at the levels this card names. The nine invariants are in src/config/rules/USER.md.'

/** The words the session hook stores on a run when Claude Code reports a compaction, declared once in src/config. */
export { A_COMPACTION_REPORTED_BY_CLAUDE_CODE } from '../../config/a-reported-compaction.mjs'

export interface TheRolePart {
  /** How the agent was found: the caller's own name, or the handle the run's live hold names. Null when no agent. */
  how: 'the-caller' | 'the-runs-hold' | null
  handle: string | null
  name: string | null
  /** The agent's lasting registry id. */
  id: string | null
  /** The card, as the registry row names it; null on the row is read as A_ROW_WITH_NO_ROLE_READS_AS, and `cardSet` says so. */
  card: string | null
  cardSet: boolean
  /** The first sentence of the card's duties. GET /api/roles has the whole card. */
  duties: string | null
  says: string
}

export interface AChapterToRead {
  n: number
  /** The chapter's name, as the office's regulations page gives it. */
  name: string
  /** The chapter's one-line title. */
  title: string
  /** The level on the seven-position ladder the card or the registration names. */
  level: string
  /** The names of its rules, in order. */
  rules: string[]
}

export interface TheRulesPart {
  chapters: AChapterToRead[]
  /** Where the list came from: the agent's registration, or its role card. Null when there is no agent. */
  from: string | null
  says: string
  whereTheWholeIs: string
}

export interface TheRunPart {
  id: string | null
  title: string | null
  state: string | null
  doing: string | null
  /** The provider conversation as stored, or null, so the hook can tell this run from another conversation's. */
  providerSession: string | null
  /** Whether the run carries a whole discovery stamp (tool, externalId and logPath). */
  stamped: boolean
  /** The stamp as stored, or null when there is none, so a caller can compare its own process with it. */
  discovered: Record<string, unknown> | null
  compactions: AReportedCompaction[]
  /** The handle of the agent whose live hold names this run, or null because no live hold names it. */
  heldBy: string | null
  says: string
}

export interface TheHoldPart {
  answering: WhoIsAnswering | null
  beatEvery: number
  lapsesAfter: number
  says: string
}

export interface AfterACompaction {
  role: TheRolePart
  rules: TheRulesPart
  handover: TheHandoverPart
  run: TheRunPart
  hold: TheHoldPart
  /** The office's own clock when this was read. The session hook stores a compaction at this time. */
  answeredAt: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function word(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** The agent record that may name this agent's chapters, read the way the inspection reads it (inspection.ts). */
function theChaptersTheRegistrationNames(agentId: string): unknown {
  const row = sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ? LIMIT 1').get(agentId) as { record_id?: string } | undefined
  const record = row?.record_id === undefined ? null : getRecord(row.record_id)
  return record === null || !isObject(record.data) ? null : record.data[MUST_READ]
}

function theRun(runAsked: string | null, workspaceId: string): TheRunPart {
  const none = (says: string): TheRunPart => ({
    id: null, title: null, state: null, doing: null, providerSession: null, stamped: false, discovered: null, compactions: [], heldBy: null, says,
  })
  if (runAsked === null) {
    return none('This request named no run: neither a `run` query nor the session header. So nothing here says which run this is.')
  }
  const resolved = resolveSessionRef(runAsked, workspaceId)
  const id = resolved.recordId ?? runAsked
  const record = getRecord(id)
  if (record === null) return none(`No record "${runAsked}" was found in this project, so the run could not be read.`)
  if (record.kind !== 'session') return none(`The record "${id}" is a ${kindWord(record.kind).text}, not a run, so the run could not be read.`)
  if (record.workspaceId !== workspaceId) {
    return none(`The run "${id}" is filed in the project "${record.workspaceId}", not in "${workspaceId}", so it was not read here.`)
  }
  const data = isObject(record.data) ? record.data : {}
  const extra = isObject(data['extra']) ? data['extra'] : {}
  const discovered = isObject(extra['discovered']) ? extra['discovered'] : null
  const stamped =
    discovered !== null && word(discovered['tool']) !== null && word(discovered['externalId']) !== null && word(discovered['logPath']) !== null
  const hold = theLiveHoldOnSession(record.id, true)
  return {
    id: record.id,
    title: record.title,
    state: word(data['state']),
    doing: word(data['doing']),
    providerSession: typeof data['providerSession'] === 'string' && data['providerSession'] !== '' ? data['providerSession'] : null,
    stamped,
    discovered,
    compactions: compactionsThisRunReported(data),
    heldBy: hold?.handle ?? null,
    says: stamped ? 'The run is stamped with its conversation.' : 'The run carries no whole discovery stamp yet.',
  }
}

/**
 * THE ONE READ. `runAsked` is the `run` query, or the session header when the query was not sent.
 */
export function whatComesBackAfterACompaction(input: { actor: Actor; workspaceId: string; runAsked: string | null }): AfterACompaction {
  const answeredAt = nowStamp()
  const run = theRun(input.runAsked, input.workspaceId)

  // WHO THIS SESSION ANSWERS AS: the caller's own name first, then the handle the run's live hold names.
  const caller = participantForActor(input.actor)
  let agent: RegisteredAgent | null = null
  let how: TheRolePart['how'] = null
  if (caller !== null && caller.kind === 'agent') {
    agent = readParticipant(caller) as RegisteredAgent | null
    how = agent === null ? null : 'the-caller'
  }
  if (agent === null && run.heldBy !== null) {
    const held = participantForActor({ type: 'agent', id: run.heldBy })
    agent = held === null ? null : (readParticipant(held) as RegisteredAgent | null)
    how = agent === null ? null : 'the-runs-hold'
  }

  const role: TheRolePart = (() => {
    if (agent === null) {
      return {
        how: null, handle: null, name: null, id: null, card: null, cardSet: false, duties: null,
        says:
          'This session answers as no registered agent: the request named none the registry holds, and no live hold ' +
          'names its run. So there is no role card to give back.',
      }
    }
    const cardName = agent.role ?? A_ROW_WITH_NO_ROLE_READS_AS
    const card = theRoleCardsAreRead() ? cardFor(theRoleCards(), agent.role ?? null) : null
    // THE DUTIES IN THE OFFICE'S WORDS for the card, where its words record holds them (./card-words.ts).
    const duties = card === null ? null : firstSentenceOf(theCardInTheOfficesWords(card).duties)
    const says =
      card === null
        ? `"${agent.handle}" holds the card "${cardName}", and the office holds no card of that name, so its duties could not be read.`
        : `You are "${agent.handle}" (${agent.name}), holding the card "${cardName}"` +
          `${agent.role === null ? ', because no card is set on the registry row and a row with none is read as that card' : ''}. ` +
          'GET /api/roles has the whole card.'
    return { how, handle: agent.handle, name: agent.name, id: agent.id, card: cardName, cardSet: agent.role !== null, duties, says }
  })()

  const rules: TheRulesPart = (() => {
    if (agent === null) {
      return { chapters: [], from: null, says: 'No agent, so no card names chapters to read. ' + WHERE_THE_WHOLE_RULES_ARE, whereTheWholeIs: WHERE_THE_WHOLE_RULES_ARE }
    }
    const line = theChaptersLineFor({ named: theChaptersTheRegistrationNames(agent.id), role: agent.role ?? null })
    // THE OFFICE'S CHAPTERS, READ ONCE for every chapter on the line: this read's statements are capped.
    const held = theChapters()
    const chapters: AChapterToRead[] = []
    const missing: number[] = []
    for (const one of line.mustRead) {
      const chapter = held.find((here) => here.n === one.chapter)
      if (chapter === undefined) {
        missing.push(one.chapter)
        continue
      }
      chapters.push({ n: chapter.n, name: theNameOfAChapter(chapter).name, title: chapter.title, level: one.level, rules: chapter.outline.map((rule) => rule.name) })
    }
    const from = line.from
    const says =
      (line.mustRead.length === 0 ? 'Neither the registration nor the card names a chapter to read.' : `The chapters to read come from ${from}.`) +
      (missing.length === 0 ? '' : ` This office's regulations hold no chapter ${missing.join(', ')}, so ${missing.length === 1 ? 'it is' : 'they are'} not listed.`)
    return { chapters, from, says: [says, ...held.filter(chapter => chapters.some(one => one.n === chapter.n)).map(chapter => (chapter as SelectedOfficeChapter).selectionNotice)].filter(Boolean).join(' '), whereTheWholeIs: WHERE_THE_WHOLE_RULES_ARE }
  })()

  // THE READ RULE OF THE HANDOVER DOOR, and no other. A run's hold names the agent for the role, but naming a run is
  // not proof of being its agent, so a caller that is not the agent, its starter or the person is not given it.
  const handover: TheHandoverPart =
    agent === null
      ? { read: false, current: null, earlier: 0, says: 'No agent, so there is no handover to give back.' }
      : theHandoverPartFor(input.actor, agent, input.workspaceId)

  const hold: TheHoldPart = (() => {
    const beatEvery = handleBeatSeconds()
    const lapsesAfter = handleLapsesAfterSeconds()
    if (agent === null) return { answering: null, beatEvery, lapsesAfter, says: 'No agent, so no handle to ask about.' }
    const answering = theAnsweringReading(agent.id, input.workspaceId, undefined, undefined, { readOnly: true }).answering
    return { answering, beatEvery, lapsesAfter, says: answering.says }
  })()

  return { role, rules, handover, run, hold, answeredAt }
}
