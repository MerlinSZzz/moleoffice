// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT READS THE SAME FROM EVERY PROJECT THE CHAT IS OPENED IN (wave 13y round 111, item 44, as the owner widened it).
 *
 * The chat is the message centre's own, and the message centre belongs to no project. On 30 October 2026 the owner opened
 * a secretary's chat from a project the secretary is not registered in and saw a grey dot and "Unavailable" where its
 * own project showed a green dot and "Answering", and no duty. Each read the chat makes answered for the page's project
 * only: the status view put the secretary in notAgents, and the duties door read that project's duties records.
 *
 * AN AGENT IS READ IN ITS HOME PROJECT, whichever project the page is in: the project of its own record, the project of
 * the session holding its handle, and each project where a run of it has not ended, or carries a message to hand over and
 * is still inside its wait. Only an agent with no home project is read in every project.
 *
 * WHAT IS MEASURED, through the doors the chat reads, each asked from both projects:
 *   1. the status view (GET /api/plugin-read/v1/status), with scope=home, answers the same agents with the same
 *      presence, personal line and runs from either project, and names the project each run is in;
 *   2. the dots of the contact rows (GET /api/presence?of=), with scope=home, answer the same colour, word and sentence
 *      from either project;
 *   3. the duties door (GET /api/secretaries/duties), with scope=office, answers the same secretaries and duties from
 *      either project;
 *   4. without scope each of them still answers for the page's project, as before;
 *   5. an agent with no home project is read in every project: its finished run in the second project is found from
 *      either;
 *   6. an agent held by a session in the second project, with its own record in "default", reads green from either
 *      project, and that session is among its runs;
 *   7. an agent with its own record in "default", whose run is going in the second project and holds no handle, reads
 *      green from either project, as the second project reads it without the scope, and that run is among its runs;
 *   8. an agent with its own record in "default", whose ended run in the second project carries a message and is still
 *      inside its wait, has that run among its runs from either project; another, whose run there is the same but whose
 *      wait is over, has no run from either;
 *   9. the conversation door (GET /api/messages/conversation) carries the agent's status as the status view reads it
 *      with scope=home, from either project. The chat's heading reads the status there since round 115 of wave 13y.
 *
 * MADE-UP RECORDS: the status office of tests/status-office.ts in the project "default", and `seedASecondProject` there:
 * an empty second project, a supervisor the keeper's duties name, and a terminal session holding the keeper's handle.
 * That session's process is this test's own, renamed "claude" for the file. So the keeper reads green from every project,
 * as a secretary held by a live session does. The supervisor has its own conversation in "default", which makes it green
 * in "default" and, read for that project only, in no other. For case 5, one invented colleague's own record is taken
 * away and it is given a finished run in the second project. For case 6, another is held by a terminal session in the
 * second project, which also serves it. For case 7, a third has a run going in the second project, which holds no handle
 * and whose live process is this test's own. For case 8, a fourth and a fifth each have a finished run in the second
 * project carrying a message to hand over: the fourth's wait ends in half an hour, the fifth's ended half an hour ago.
 *
 * RED ON MAIN: the status view refuses scope with a 400, and the dots and the duties door answer for the page's project.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { aTerminalHolding, SECOND_PROJECT, seedASecondProject, seedStatusOffice, STATUS_FIXTURE as F, STATUS_PERSON } from './status-office.ts'

const SECOND = SECOND_PROJECT.id
const SUPERVISOR_AREA = SECOND_PROJECT.supervisorArea
const inProject = (project: string) => ({ ...STATUS_PERSON, 'x-mole-office-workspace': project })
const ORIGINAL_TITLE = process.title
/** An invented colleague with no own record anywhere and no hold, so with no home project. */
const HOMELESS = 'status-extra-1'
/** An invented colleague whose own record is in "default" and whose handle a session in the second project holds. */
const HELD_ELSEWHERE = 'status-extra-2'
/** An invented colleague whose own record is in "default" and whose run going in the second project holds no handle. */
const RUNNING_ELSEWHERE = 'status-extra-3'
/** Two invented colleagues whose own records are in "default", each with a finished run in the second project carrying a message. */
const WAITING_ELSEWHERE = 'status-extra-4'
const HANDED_OVER_ELSEWHERE = 'status-extra-5'

let t: TestDb
let app: FastifyInstance
let supervisor = ''
let heldElsewhere = ''
let runningElsewhere = ''

async function get(url: string, project: string) {
  const reply = await app.inject({ method: 'GET', url, headers: inProject(project) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, text: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await seedStatusOffice(t, app, 8)
  process.title = 'claude'
  supervisor = (await seedASecondProject(t, app)).supervisor
  const sql = t.client.sqlite
  sql.prepare('DELETE FROM records WHERE id IN (SELECT record_id FROM agent_records WHERE agent_id=?)').run(HOMELESS)
  sql.prepare('DELETE FROM agent_records WHERE agent_id=?').run(HOMELESS)
  sql.prepare("INSERT INTO records (id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES ('homeless-run',?,?,'session','A run of an agent with no home',?,'fixture',?,?)")
    .run(SECOND, THE_PERSON, JSON.stringify({ state: 'finished', servingAgentId: HOMELESS, startedAt: F.latestStart }), F.at, F.at)
  heldElsewhere = await aTerminalHolding(t, app, { agent: HELD_ELSEWHERE, project: SECOND, name: 'elsewhere', title: 'A made-up terminal in the second desk', data: { servingAgentId: HELD_ELSEWHERE } })
  runningElsewhere = t.api.createRecord({
    workspaceId: SECOND, kind: 'session', title: 'A made-up run holding no handle',
    data: { state: 'running', runtime: 'claude-code', servingAgentId: RUNNING_ELSEWHERE, ranAs: [{ workspaceId: SECOND, agentId: RUNNING_ELSEWHERE }], lastOutputAt: localStamp(new Date()) },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const itsProcess = await app.inject({ method: 'POST', url: '/api/resources', headers: inProject(SECOND), payload: {
    type: 'process', key: String(process.pid), sessionRecordId: runningElsewhere, detail: 'this test process, as the made-up run',
    adopting: 'this test process started before the session the test filed for it',
  } })
  if (itsProcess.statusCode >= 300) throw new Error(itsProcess.body)
  for (const [run, agent, waitsUntil] of [
    ['waiting-run', WAITING_ELSEWHERE, new Date(Date.now() + 30 * 60_000)],
    ['handed-over-run', HANDED_OVER_ELSEWHERE, new Date(Date.now() - 30 * 60_000)],
  ] as const) {
    sql.prepare("INSERT INTO records (id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,?,?,'session','A finished run carrying a message',?,'fixture',?,?)")
      .run(run, SECOND, THE_PERSON, JSON.stringify({
        state: 'finished', servingAgentId: agent, deliveringMessage: `${agent}-message`, providerSession: `r111-${agent}`,
        runtime: 'claude-code', waitsUntil: localStamp(waitsUntil), startedAt: F.latestStart,
      }), F.at, F.at)
  }
}, 120_000)

afterAll(async () => {
  process.title = ORIGINAL_TITLE
  await app?.close()
  t?.close()
})

describe('with the scope the chat asks', () => {
  it('1: the status view answers the same agents, presence, personal lines and runs from either project', async () => {
    const asked = `/api/plugin-read/v1/status?agents=${[F.all, supervisor, F.presence, F.unrecorded].join(',')}&scope=home`
    const [here, there] = [await get(asked, 'default'), await get(asked, SECOND)]
    expect([here.status, there.status], `${here.text.slice(0, 300)} ${there.text.slice(0, 300)}`).toEqual([200, 200])
    expect(there.body['notAgents'], 'an agent not registered in the second project is still an agent there').toEqual([])
    expect(there.body['agents']).toEqual(here.body['agents'])
    const keeper = (there.body['agents'] as { id: string; presence: { available: boolean; value?: { colour: string } }; flow: { available: boolean; value?: { runs: { run: { id: string }; project?: string }[] } } }[])
      .find(one => one.id === F.all)!
    expect(keeper.presence, 'held by a live session in its own project, the keeper reads green from the other').toMatchObject({ available: true, value: { colour: 'green' } })
    expect(keeper.flow.available).toBe(true)
    expect(keeper.flow.value!.runs.map(one => [one.run.id, one.project]).sort()).toEqual([['status-run-one', 'default'], ['status-run-two', 'default']])
  })

  it('2: the dots of the contact rows answer the same colour, word and sentence from either project', async () => {
    const asked = `/api/presence?of=${[F.all, supervisor, F.presence].map(id => encodeURIComponent(`agent:${id}`)).join(',')}&scope=home`
    const dots = async (project: string) => {
      const read = await get(asked, project)
      expect(read.status, read.text.slice(0, 300)).toBe(200)
      return (read.body['presence'] as { colour: string; word: string; says: string }[]).map(({ colour, word, says }) => ({ colour, word, says }))
    }
    const [here, there] = [await dots('default'), await dots(SECOND)]
    expect(here.map(one => one.colour), 'the keeper by its hold and the supervisor by its own conversation read green in their own project').toEqual(['green', 'green', 'grey'])
    expect(there).toEqual(here)
  })

  it('3: the duties door answers the same secretaries and duties from either project', async () => {
    const [here, there] = [await get('/api/secretaries/duties?scope=office', 'default'), await get('/api/secretaries/duties?scope=office', SECOND)]
    expect([here.status, there.status], `${here.text.slice(0, 300)} ${there.text.slice(0, 300)}`).toEqual([200, 200])
    expect(there.body['secretaries']).toEqual(here.body['secretaries'])
    const keeper = (there.body['secretaries'] as { agent: { id: string }; duties: { area: string; supervisors?: { agent: { id: string }; area: string }[] } | null }[]).find(one => one.agent.id === F.all)
    expect(keeper?.duties?.area, "the keeper's duty, recorded in its own project, read from the other").toBe(F.duty)
    expect(keeper?.duties?.supervisors).toEqual([{ agent: { kind: 'agent', id: supervisor }, area: SUPERVISOR_AREA }])
  })

  it('5: an agent with no home project is read in every project, the same from either', async () => {
    const [here, there] = await Promise.all(['default', SECOND].map(project => statusAndDot(HOMELESS, project)))
    expect(there).toEqual(here)
    expect(here!.notAgents, 'an agent with no home project is still an agent').toEqual([])
    expect(here!.runs, 'its finished run in the second project is found from "default" too').toEqual([['homeless-run', SECOND]])
  })

  it('6: an agent held by a session in another project reads green from either, with that session among its runs', async () => {
    const [here, there] = await Promise.all(['default', SECOND].map(project => statusAndDot(HELD_ELSEWHERE, project)))
    expect(there).toEqual(here)
    expect([here!.presence, here!.dot], 'held by a live session in the second project').toEqual(['green', 'green'])
    expect(here!.runs, 'the session holding its handle is found from "default", where its own record is').toEqual([[heldElsewhere, SECOND]])
  })

  it('7: an agent whose run is going in another project, holding no handle, reads green from either, with that run among its runs', async () => {
    const unscoped = await get(`/api/presence?of=${encodeURIComponent(`agent:${RUNNING_ELSEWHERE}`)}`, SECOND)
    expect((unscoped.body['presence'] as { colour: string }[] | undefined)?.[0]?.colour, 'the second project reads it green without the scope').toBe('green')
    const [here, there] = await Promise.all(['default', SECOND].map(project => statusAndDot(RUNNING_ELSEWHERE, project)))
    expect(there).toEqual(here)
    expect([here!.presence, here!.dot], 'its run is going in the second project').toEqual(['green', 'green'])
    expect(here!.runs, 'the run going is found from "default", where its own record is').toEqual([[runningElsewhere, SECOND]])
  })

  it('8: an ended run in another project still inside its wait is among the agent\'s runs from either; once the wait is over it is not', async () => {
    const [waiting, waitingThere] = await Promise.all(['default', SECOND].map(project => statusAndDot(WAITING_ELSEWHERE, project)))
    expect(waitingThere).toEqual(waiting)
    expect(waiting!.runs, 'its message is still waiting in the second project, so it can be reached there').toEqual([['waiting-run', SECOND]])
    const [handedOver, handedOverThere] = await Promise.all(['default', SECOND].map(project => statusAndDot(HANDED_OVER_ELSEWHERE, project)))
    expect(handedOverThere).toEqual(handedOver)
    expect(handedOver!.runs, 'its wait in the second project is over, so that project is not one of its homes').toEqual([])
  })

  it('9: the conversation door carries the agent’s status as the status view reads it at home, from either project', async () => {
    for (const id of [F.all, HELD_ELSEWHERE, RUNNING_ELSEWHERE]) {
      const asked = `/api/messages/conversation?kind=agent&id=${id}`
      const [here, there] = [await get(asked, 'default'), await get(asked, SECOND)]
      // THE VIEW IS READ AFTER THE CONVERSATION, so a read the conversation door marks is in both.
      const view = await get(`/api/plugin-read/v1/status?agents=${id}&scope=home`, 'default')
      expect([here.status, there.status, view.status], `${here.text.slice(0, 300)} ${there.text.slice(0, 300)}`).toEqual([200, 200, 200])
      expect(here.body['status'], id).toEqual({ available: true, value: (view.body['agents'] as unknown[])[0] })
      expect(there.body['status'], id).toEqual(here.body['status'])
    }
  })
})

/** One agent's status and dot as the chat reads them from one project, kept to what must read the same from every project. */
async function statusAndDot(id: string, project: string) {
  const status = await get(`/api/plugin-read/v1/status?agents=${id}&scope=home`, project)
  const dot = await get(`/api/presence?of=${encodeURIComponent(`agent:${id}`)}&scope=home`, project)
  expect([status.status, dot.status], `${status.text.slice(0, 300)} ${dot.text.slice(0, 300)}`).toEqual([200, 200])
  const agents = status.body['agents'] as { presence: { value?: { colour: string } }; flow: { value?: { runs: { run: { id: string }; project?: string }[] } } }[]
  const [read] = dot.body['presence'] as { colour: string; word: string; says: string }[]
  return {
    agents, notAgents: status.body['notAgents'], presence: agents[0]?.presence.value?.colour ?? null,
    runs: agents[0]?.flow.value?.runs.map(one => [one.run.id, one.project]) ?? null,
    dot: read!.colour, dotSays: [read!.word, read!.says],
  }
}

describe('without scope', () => {
  it('4: each read answers for the page’s project, as before', async () => {
    const status = await get(`/api/plugin-read/v1/status?agents=${F.all}`, SECOND)
    expect(status.status, status.text.slice(0, 300)).toBe(200)
    expect(status.body['notAgents']).toEqual([F.all])
    const duties = await get('/api/secretaries/duties', SECOND)
    expect(duties.status, duties.text.slice(0, 300)).toBe(200)
    expect((duties.body['secretaries'] as { agent: { id: string }; duties: unknown }[]).find(one => one.agent.id === F.all)?.duties).toBeNull()
    const here = await get(`/api/plugin-read/v1/status?agents=${F.all}`, 'default')
    const runs = (here.body['agents'] as { flow: { value: { runs: Record<string, unknown>[] } } }[])[0]!.flow.value.runs
    expect(runs.every(one => !('project' in one)), 'a read of one project names no project on its runs').toBe(true)
  })
})
