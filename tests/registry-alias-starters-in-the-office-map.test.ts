// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT STARTED UNDER ITS STARTER'S OLD REGISTRY ID IS COUNTED FOR THAT STARTER IN THE OFFICE MAP, in the three
 * places the map reads who started whom (item 30c, the map's two keys for one agent). An old id is an alias filed for
 * the starter's canonical id. An agent's row written before the alias was filed keeps the old id in started_by_id, and
 * the re-mint keeps those bytes. So each place reads the stored starter through the filed aliases:
 * - whether a supervisor leads other supervisors, which draws it in the leadership zone;
 * - the agents a list of agents started, which a reading of some agents asks of the store by their ids;
 * - the team a worker sits in, which is its starter's canonical id, as the starter's own team is.
 * The map still hands on the stored starter as `startedBy`.
 *
 * Every agent here is made up, in a throwaway office. The old id is put in started_by_id by a direct write, as a row
 * written before the alias was filed holds it.
 *
 * MUTATIONS, after a control run: compare the stored starter with the supervisor's id in place of its canonical id, and
 * both leadership cases go red; ask the store for the agents started by the ids asked alone in place of every id of
 * each, and the case of a list goes red; give a worker's team as its stored starter, and the team case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance
let serial = 0
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
interface Agent { id: string; handle: string }

buildTheFirstOfficeInAHook()
beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterEach(async () => {
  await app?.close()
  t?.close()
})

async function registered(role: 'supervisor' | 'worker'): Promise<Agent> {
  const handle = `made-up-alias-starter-${++serial}`
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: handle, role, runtime: 'codex' } })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json().agent
}
/** The old id of an agent: an alias filed for its canonical id, which is no registry id and holds no handle. */
async function anOldIdFor(who: Agent): Promise<string> {
  const old = `an-old-registry-id-${who.handle.split('-').at(-1)}`
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: old, canonicalId: who.id }])
  return old
}
/** `child` as a row written before the alias was filed holds it: started by an agent stored as `stored`. */
function startedUnder(child: Agent, stored: string): void {
  t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(stored, child.id)
}
/** A supervisor with an old id, which started a supervisor and a worker under that old id. */
async function aLegacySupervisorAndTheAgentsItStarted() {
  const lead = await registered('supervisor')
  const old = await anOldIdFor(lead)
  const second = await registered('supervisor')
  const worker = await registered('worker')
  startedUnder(second, old)
  startedUnder(worker, old)
  return { lead, old, second, worker }
}
/** Who each agent is as the map draws it, from a reading of the whole office or of the agents `asked`. */
async function drawn(asked?: string[]) {
  const { readTheOffice } = await import('../src/server/lib/pixel-office.ts')
  const office = readTheOffice('default', { type: 'human', id: THE_PERSON } as never, 'office', asked)
  return (who: Agent) => office.whoOf(office.agents().find((one) => one.id === who.id)!)
}

describe('an agent started under its starter\'s old registry id', () => {
  it('makes a supervisor that started a supervisor that way a leader of supervisors, in the whole scene', async () => {
    const { lead, second } = await aLegacySupervisorAndTheAgentsItStarted()
    const whoOf = await drawn()
    expect(whoOf(lead).zone).toBe('leadership')
    expect(whoOf(second).zone).toBe('team')
  })

  it('sits in its starter\'s team, while the map hands on its starter as stored', async () => {
    const { lead, old, worker } = await aLegacySupervisorAndTheAgentsItStarted()
    const whoOf = await drawn()
    expect(whoOf(lead).team).toBe(lead.id)
    expect(whoOf(worker)).toMatchObject({ team: lead.id, startedBy: { kind: 'agent', id: old } })
  })

  it('is found among the agents a reading of its starter alone asks for', async () => {
    const { lead } = await aLegacySupervisorAndTheAgentsItStarted()
    const whoOf = await drawn([lead.id])
    expect(whoOf(lead).zone).toBe('leadership')
  })

  it('is not counted for anybody when the id it is stored under is filed for no agent', async () => {
    const lead = await registered('supervisor')
    const second = await registered('supervisor')
    const worker = await registered('worker')
    startedUnder(second, 'an-id-filed-for-nobody')
    startedUnder(worker, 'an-id-filed-for-nobody')
    for (const whoOf of [await drawn(), await drawn([lead.id])]) expect(whoOf(lead).zone).toBe('team')
    expect((await drawn())(worker).team).toBe('an-id-filed-for-nobody')
  })
})
