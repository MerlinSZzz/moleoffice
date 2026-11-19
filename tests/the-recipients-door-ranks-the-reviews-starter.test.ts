// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECIPIENTS DOOR RANKS THE AGENT THAT ASKED FOR A REVIEW, AND SAYS WHETHER IT CAN RECEIVE.
 *
 * `GET /api/agent/recipients/agents` ranks the agents that filed or wrote the record pointed at. A review's starter (the
 * agent that asked for it, `startedByAgent`) stands on the rung above them all ('started-this-review',
 * src/shared/recipient-ranking.ts). Until wave 13q's round 24 the review column added that agent on the page, after the
 * server had answered, and nothing asked the message door whether it could receive; so a starter the server had not
 * ranked was never chosen in advance and was drawn as choosable whatever its state. Now the door takes `review=<id>`,
 * reads that review's starter itself, ranks it with the others, and gives it `cannotReceive` from the message door's own
 * rule, as it does every other agent.
 *
 * What is held here, each with its mutation (chapter 5):
 * 1. The starter is ranked, first, on its own rung, and can receive; the filer follows. A review asked about with no
 *    record ranks the starter alone. Mutation: the door leaves the starter's reason out.
 * 2. A starter who cannot receive is still ranked first, and says so in the message door's sentence, which names it,
 *    with the facts the sentence was built from (wave 13n round 32). Mutation: the door answers null for the starter
 *    instead of asking the message door.
 * 3. A review with no starter changes nothing: the ranking, and so the agent chosen in advance, is the one the door
 *    gives without a review. Mutation: a review that is asked about drops the filer and writer reasons.
 * 4. The edges are said, not guessed: a review the door cannot find is refused, and a starter record no registered
 *    agent is mapped to ranks nobody and says so.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theAgentToPreselect, type AgentRecipientOnTheWire } from '../src/shared/recipient-ranking.ts'

let t: TestDb
let app: FastifyInstance
let caseNumber = 0
// THE HANDLES ARE MADE FRESH FOR EACH CASE, because one live agent per handle is the rule across the
// installation and the registry rows of earlier cases stay live.
let FILER = 'pier-filer'
let STARTER = 'tide-starter'

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function inject(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register an agent through the starter door: its agent record and its registry id. */
async function started(handle: string): Promise<{ record: string; id: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle })
  expect(reply.status, reply.text).toBe(201)
  return { record: String(reply.json['record']), id: (reply.json['agent'] as { id: string }).id }
}

/** A report the agent files, so the agent stands on the ranking as its filer. */
async function aReportFiledBy(handle: string): Promise<string> {
  const reply = await inject('POST', '/api/records', asAgent(handle), {
    kind: 'report',
    title: 'Synthetic report: the tide gauge on the north pier',
    data: { for: 'Robin Vale', date: '2026-10-02', blocks: [{ id: 'b-1', type: 'text', heading: 'The gauge', text: 'It reads high.' }] },
  })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['record'] as { id: string }).id
}

/** A review of that report, started by the person, naming the agent record that asked for it, or none. */
async function aReviewOf(recordId: string, startedByAgent: string | null): Promise<string> {
  const reply = await inject('POST', '/api/reviews', AS_THE_PERSON, {
    entry: { target: { kind: 'record', recordId, workspaceId: WS }, place: { at: 'surface' } },
    ...(startedByAgent === null ? {} : { startedByAgent }),
  })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['review'] as { id: string }).id
}

interface Answer {
  agents: AgentRecipientOnTheWire[]
  startedBy: { review: string; agentRecord: string | null; agentId: string | null } | null
}

async function ranking(query: string): Promise<Answer> {
  const reply = await inject('GET', `/api/agent/recipients/agents?${query}`, AS_THE_PERSON)
  expect(reply.status, reply.text).toBe(200)
  return reply.json as unknown as Answer
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  FILER = `pier-filer-${String(caseNumber)}`
  STARTER = `tide-starter-${String(caseNumber)}`
})

describe("the recipients door and a review's starter", () => {
  it('ranks the starter first, on its own rung, asks the message door about it, and puts the filer after it', async () => {
    const filer = await started(FILER)
    const starter = await started(STARTER)
    const report = await aReportFiledBy(FILER)
    const review = await aReviewOf(report, starter.record)

    const answer = await ranking(`record=${report}&review=${review}`)
    expect(answer.agents.map((one) => [one.agentId, one.rung])).toEqual([
      [starter.id, 'started-this-review'],
      [filer.id, 'filed-this-record'],
    ])
    expect(answer.agents[0]?.cannotReceive, 'the message door would take a message to the starter').toBeNull()
    expect(answer.startedBy).toEqual({ review, agentRecord: starter.record, agentId: starter.id })
    expect(theAgentToPreselect(answer.agents)?.agentId, 'the starter is the one chosen in advance').toBe(starter.id)

    // A REVIEW ASKED ABOUT WITH NOTHING POINTED AT, as the review pane asks: the starter alone.
    const alone = await ranking(`review=${review}`)
    expect(alone.agents.map((one) => [one.agentId, one.rung])).toEqual([[starter.id, 'started-this-review']])
  })

  it('ranks a starter who cannot receive, first, with the message door’s own sentence, and chooses nobody in advance', async () => {
    await started(FILER)
    const starter = await started(STARTER)
    const report = await aReportFiledBy(FILER)
    const review = await aReviewOf(report, starter.record)
    const retired = await inject('POST', `/api/participants/agent/${STARTER}/retire`, AS_THE_PERSON, { because: 'its survey is finished' })
    expect(retired.status, retired.text).toBe(200)

    const answer = await ranking(`record=${report}&review=${review}`)
    const first = answer.agents[0]
    expect(first?.agentId).toBe(starter.id)
    expect(first?.rung).toBe('started-this-review')
    // THE MESSAGE DOOR'S OWN SENTENCE (whyThisAgentCannotReceiveAMessage in lib/messages.ts), naming the agent by its
    // handle; the filer, who can receive, carries null.
    expect(first?.cannotReceive ?? '', 'the door says why a message to it would reach nobody').toMatch(
      new RegExp(`^The agent "${STARTER}" cannot get messages now: it is retired\\.`),
    )
    // AND THE FACTS THAT SENTENCE WAS BUILT FROM, so the page can say it in its own language (wave 13n round 32).
    expect(first?.cannotReceiveSaid).toMatchObject({ agent: STARTER, state: 'retired', bySetting: false })
    expect(answer.agents[1]?.cannotReceive, 'the filer can receive').toBeNull()
    expect(answer.agents[1]?.cannotReceiveSaid, 'the filer can receive').toBeNull()
    expect(theAgentToPreselect(answer.agents), 'nobody is chosen in advance when the first cannot receive').toBeNull()
  })

  it('changes nothing for a review with no starter: the ranking and the agent chosen in advance are the same', async () => {
    const filer = await started(FILER)
    const report = await aReportFiledBy(FILER)
    const review = await aReviewOf(report, null)

    const without = await ranking(`record=${report}`)
    const withTheReview = await ranking(`record=${report}&review=${review}`)
    expect(withTheReview.agents).toEqual(without.agents)
    expect(withTheReview.startedBy).toEqual({ review, agentRecord: null, agentId: null })
    expect(without.startedBy, 'no review was asked about').toBeNull()
    expect(theAgentToPreselect(withTheReview.agents)?.agentId).toBe(filer.id)
    expect(theAgentToPreselect(without.agents)?.agentId).toBe(filer.id)
  })

  it('refuses a review it cannot find, and ranks nobody for a starter record no agent is mapped to', async () => {
    await started(FILER)
    const report = await aReportFiledBy(FILER)
    const missing = await inject('GET', `/api/agent/recipients/agents?record=${report}&review=noSuchReview1`, AS_THE_PERSON)
    expect(missing.status, missing.text).toBe(404)

    const review = await aReviewOf(report, 'notAnAgentRec')
    const answer = await ranking(`record=${report}&review=${review}`)
    expect(answer.startedBy).toEqual({ review, agentRecord: 'notAnAgentRec', agentId: null })
    expect(answer.agents.map((one) => one.rung)).toEqual(['filed-this-record'])
  })
})
