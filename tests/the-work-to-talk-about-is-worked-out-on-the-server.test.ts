// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATIONS PAGE'S LIST OF WORK IS WORKED OUT ON THE SERVER, OVER THE RECORDS THE LIST HOLDS FOR THE SAME READER.
 *
 * Round 10 of wave 13x: the conversations page read every record of the project in the narrow shape, 7.2 MB on an
 * office of the live size, to draw five rows, a count and what it left out. `GET /api/records/work-to-talk-about` now
 * works that out with `workToTalkAbout` (src/shared/talksources.ts), the function a test can call on a list of
 * records, and sends the five rows and the counts.
 *
 * WHAT HOLDS:
 *   - for the person and for an agent, the door's answer is `workToTalkAbout` of the narrow rows `GET /api/records`
 *     lists for that same reader, so a message the agent may not read is not offered to that agent;
 *   - a search is read in the titles, whatever its case and the spaces around it, and counted over every match;
 *   - agent runs and tools are never rows, and are counted by kind whatever the search.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TALK_SOURCES_SHOWN, workToTalkAbout, type WorkToTalkAbout } from '../src/shared/talksources.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let t: TestDb
let app: FastifyInstance

const TASKS = 7

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(id: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id }
}

async function file(body: unknown): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: JSON.stringify(body) })
  expect(reply.statusCode, reply.body).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, body))
}

async function get<T>(url: string, headers: Record<string, string>): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** What the door answers, without what every reply carries. */
async function door(query: string, headers: Record<string, string>): Promise<WorkToTalkAbout<PanelRecord>> {
  const { query: read, rows, matched, leftOut } = await get<WorkToTalkAbout<PanelRecord>>(`/api/records/work-to-talk-about${query}`, headers)
  return { query: read, rows, matched, leftOut }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (let n = 1; n <= TASKS; n += 1) await file({ kind: 'task', title: `Seed tray ${String(n)}`, data: { state: 'todo' } })
  await file({ kind: 'session', title: 'A run that sowed the trays', data: { state: 'finished' } })
  // A message from the person to an agent, which another agent may not read.
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'hazel', data: { handle: 'hazel', state: 'active', runtime: 'claude-code' }, actor: { type: 'human', id: THE_PERSON } })
  await file({ kind: 'message', title: 'Seed tray labels', data: { to: [{ kind: 'agent', id: 'hazel' }], body: 'Tray 3 has lost its label.' } })
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the work to talk about, worked out on the server', () => {
  for (const [who, headers] of [
    ['the person', AS_THE_PERSON],
    ['an agent the message is not for', asAgent('rowan')],
  ] as const) {
    for (const query of ['', '?q=%20SEED%20tray%206%20']) {
      it(`answers, for ${who}${query === '' ? '' : ' and a search'}, the working out over the narrow rows the list holds for them`, async () => {
        const listed = await get<{ records: PanelRecord[] }>('/api/records?shape=narrow', headers)
        const search = decodeURIComponent(query.replace('?q=', ''))
        expect(await door(query, headers)).toEqual(workToTalkAbout(listed.records, search))
      })
    }
  }

  it('does not offer the message to the agent who may not read it', async () => {
    const forThePerson = await door('?q=seed', AS_THE_PERSON)
    const forRowan = await door('?q=seed', asAgent('rowan'))
    expect(forThePerson.matched).toBe(TASKS + 1)
    expect(forRowan.matched).toBe(TASKS)
    expect(forRowan.rows.map((one) => one.title)).not.toContain('Seed tray labels')
  })

  it(`sends the first ${String(TALK_SOURCES_SHOWN)} rows in the narrow shape, and counts every match`, async () => {
    const answer = await door('', AS_THE_PERSON)
    expect(answer.rows).toHaveLength(TALK_SOURCES_SHOWN)
    expect(answer.rows.every((one) => Object.keys(one.data).every((key) => key === 'state'))).toBe(true)
    const searched = await door('?q=%20SEED%20tray%206%20', AS_THE_PERSON)
    expect(searched.query).toBe('seed tray 6')
    expect(searched.rows.map((one) => one.title)).toEqual(['Seed tray 6'])
    expect(searched.matched).toBe(1)
  })

  it('never offers an agent run, and counts the runs whatever the search', async () => {
    for (const query of ['', '?q=run', '?q=nothing%20holds%20this']) {
      const answer = await door(query, AS_THE_PERSON)
      expect(answer.rows.map((one) => one.kind)).not.toContain('session')
      // The office files a flow run beside every run, and it is left out and counted as the run is.
      expect(answer.leftOut).toEqual({ session: 1, flow_run: 1, tool: 0, tool_category: 0 })
    }
  })
})
