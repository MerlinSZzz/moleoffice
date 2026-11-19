// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY WITH ROUNDS RUNNING IS NOT TOLD IT IS IDLE.
 *
 * One notice per fact, said short. A secretary that has queued a round and waits
 * for it is waiting on purpose, and the secretary's waiter copy carried "Idle — your role and duties" while
 * its rounds ran. The idle reminder now passes over an agent that holds the secretary card while a run
 * of an agent it started is running, and reminds it as before once no such run is running. Any other
 * starter is reminded as before.
 *
 * Every agent and run here is made up for the test, in a fresh test database.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - the `startersWaiting.has(agent.id)` condition in `sendTheRemindersThatAreDue` made `false`: case 1 goes red.
 *   - the `holdsTheSecretaryCard` half of it made `true`: case 2 goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let reminders: RemindersLib

const HUMAN = { type: 'human', id: THE_PERSON } as const
const R0 = new Date()
const at = (msFromR0: number): Date => new Date(R0.getTime() + msFromR0)
const WATCHING_SINCE = new Date(R0.getTime() - 60_000)

beforeEach(async () => {
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  const roles = await import('../src/server/lib/roles.ts')
  const records = await import('../src/server/lib/records.ts')
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t.close()
})

/** One agent, by handle and role, and the registry id the office gave it. */
function anAgent(handle: string, role: string): string {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role }, actor: HUMAN })
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A starter and the worker it started, with work sent to the starter now so its idle spell starts. */
function aStarterAndItsWorker(prefix: string, role: string): { starter: string; worker: string } {
  const starter = anAgent(`${prefix}-starter`, role)
  const worker = anAgent(`${prefix}-worker`, 'worker')
  t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(starter, worker)
  t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'some work', data: { body: 'Queue the next round.', to: [{ kind: 'agent', id: starter }] }, actor: HUMAN })
  return { starter, worker }
}

/** One running run of an agent. */
function aRunningRun(agent: string): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'a round', data: { state: 'running', runtime: 'fake', servingAgent: agent }, actor: HUMAN }).id
}

describe('the idle reminder and a secretary with rounds running', () => {
  it('1: passes over a secretary while its worker has a run running, and reminds it once the run is not running', () => {
    const { worker } = aStarterAndItsWorker('rounds', 'secretary')
    const run = aRunningRun(worker)
    const running = reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000), WATCHING_SINCE)
    expect(running.idleReminded).not.toContain('rounds-starter')
    // THE CONTROL: the run stops running, and the same secretary is reminded on the next tick.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'failed') WHERE id = ?").run(run)
    const stopped = reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000 + 60_000), WATCHING_SINCE)
    expect(stopped.idleReminded).toContain('rounds-starter')
  })

  it('2: reminds a starter that does not hold the secretary card, though its worker has a run running', () => {
    const { worker } = aStarterAndItsWorker('plain', 'supervisor')
    aRunningRun(worker)
    const tick = reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000), WATCHING_SINCE)
    expect(tick.idleReminded).toContain('plain-starter')
  })
})
