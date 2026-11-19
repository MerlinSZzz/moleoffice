// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C3: BIRTH AND DEATH ARE RECORDED.
 *
 * `design/messages/ACCEPTANCE.md` section 8: *a server registers its world at the office when it
 * starts; the row closes with a reason when the process ends; a test world registers as ephemeral
 * and is hidden by default.* Every appearance and disappearance of a world is recorded.
 *
 * What is proved here:
 *
 *   1. a server registering itself puts its world at the office, with the facts it already knows;
 *   2. a server under a test runner is a test world, which is what "ephemeral" means here;
 *   3. a world already registered keeps the name somebody gave it when the server restarts;
 *   4. the world closes, with the reason, when the last process serving it stops;
 *   5. it does not close while anything else is still serving it, so a restart is not a death;
 *   6. a test world is never reported to the main world, because that office belongs to a person.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { isEphemeral } from '../src/shared/worlds.ts'

type OfficeLib = typeof import('../src/server/lib/office.ts')
type RegisterLib = typeof import('../src/server/lib/register-this-server.ts')
type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let office: OfficeLib
let register: RegisterLib
let resources: ResourcesLib
let world: WorldLib

const ACTOR = { type: 'agent', id: 'builder-au' } as const

beforeEach(async () => {
  t = await freshDb()
  office = await import('../src/server/lib/office.ts')
  register = await import('../src/server/lib/register-this-server.ts')
  resources = await import('../src/server/lib/resources.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
})

afterEach(() => {
  t.close()
})

/** Put a setting back the way this process found it, unset included. */
function putBack(name: string, was: string | undefined): void {
  if (was === undefined) delete process.env[name]
  else process.env[name] = was
}

/** A session record for this test's own run, which every ledger row has to name. */
function aRun(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The run this test is',
    data: { state: 'running', runtime: 'vitest' },
    actor: ACTOR,
  }).id
}

describe('a server registers its world when it starts', () => {
  it('writes the world down with the facts it already knows about itself', () => {
    const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
    const registered = written.atTheOffice
    expect(registered, 'a server that could read its own world must register one').not.toBeNull()
    if (registered === null) return
    expect(registered.databaseIdentity).toBe(world.theWorldThisDatabaseIs())
    expect(registered.checkout).toBe(written.world.repository)
    expect(registered.head).toBe(written.world.head)
    expect(registered.standing).toBe(written.world.standing.kind)
    expect(registered.startedBy).toEqual({ kind: 'agent', id: 'builder-au' })
    expect(registered.diedAt).toBeNull()
    expect(office.worldsHere().map((w) => w.id)).toEqual([registered.id])
  })

  it('registers a world it is serving under a test runner as a test world, which is the ephemeral one', () => {
    // This suite IS a test runner, so a server registering itself here is in exactly the state the
    // criterion is about. `standing.because` names being started by a test runner in its own
    // sentence, and that is the reading — not a second idea of what a test is.
    const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
    expect(written.world.standing.kind).toBe('scratch')
    expect(written.atTheOffice?.kind).toBe('test')
    expect(isEphemeral('test')).toBe(true)
    // And a test world never becomes the office, whatever else it does.
    expect(office.theOfficeIsInThisDatabase()).toBe(false)
  })

  it('keeps the name somebody gave the world when the server starts again', () => {
    const first = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
    const id = first.atTheOffice?.id ?? ''
    office.renameWorldHere(id, 'the world I am building citizens in')
    const second = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
    expect(second.atTheOffice?.id).toBe(id)
    expect(second.atTheOffice?.name).toBe('the world I am building citizens in')
  })

  /**
   * AND WHERE ANOTHER MACHINE REACHES IT, WHEN THIS SERVER OPENS A DOOR FOR ONE.
   *
   * From the owner's other machine, on 4 September 2026: every row on the Worlds page said
   * `http://127.0.0.1:29840`, which on that machine is that machine itself, and Enter answered "Failed to fetch". The
   * world was listening on `192.0.2.10:29840` as well — it had inherited
   * `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` — and nothing had ever told the office. Problem
   * `5mG-KxUAXObJ`.
   *
   * BOTH ADDRESSES CARRY THE SAME PORT because both are derived from the one number this server was
   * given, which is why the port is set here as well as the name.
   */
  it('writes the address another machine reaches this world at, when this server opens a door for one', () => {
    const held = {
      host: process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES,
      port: process.env.MOLE_OFFICE_PORT,
    }
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = '192.0.2.10'
    process.env.MOLE_OFFICE_PORT = '29931'
    try {
      const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
      const registered = written.atTheOffice
      expect(registered, 'a server that could read its own world must register one').not.toBeNull()
      expect(registered?.address, 'the address on this computer is still written').toBe('http://127.0.0.1:29931')
      expect(registered?.addressForOtherMachines).toBe('http://192.0.2.10:29931')
      // AND THE OFFICE HANDS BOTH BACK TO A READER, which is the half the other machine needed.
      expect(office.worldById(registered?.id ?? '')?.addressForOtherMachines).toBe('http://192.0.2.10:29931')
    } finally {
      putBack('MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES', held.host)
      putBack('MOLE_OFFICE_PORT', held.port)
    }
  })

  it('writes no such address when this server opens no door for another machine, rather than guessing one', () => {
    const held = process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES
    // `none` is how a checkout whose `.env` names an address says this stack is not on it.
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = 'none'
    try {
      const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
      expect(written.atTheOffice?.addressForOtherMachines).toBeNull()
    } finally {
      putBack('MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES', held)
    }
  })
})

describe('a world dies when the last process serving it stops', () => {
  it('closes the row with the reason the process row was closed with', () => {
    const run = aRun()
    const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: run, actor: ACTOR })
    const id = written.atTheOffice?.id ?? ''
    const row = written.resources.find((one) => one.type === 'process')
    expect(row, 'registering this server writes a process row').toBeDefined()
    if (row === undefined) return

    resources.closeRowThatStoppedMatching(row.id, 'default', 'the supervisor stopped its server', ACTOR)
    const dead = office.worldById(id)
    expect(dead?.diedAt).not.toBeNull()
    expect(dead?.diedBecause).toBe('the supervisor stopped its server')
  })

  it('leaves the world open while another process is still serving it, so a restart is not a death', () => {
    const run = aRun()
    const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: run, actor: ACTOR })
    const id = written.atTheOffice?.id ?? ''
    const row = written.resources.find((one) => one.type === 'process')
    if (row === undefined) throw new Error('registering this server wrote no process row')

    // A SECOND LIVE PROCESS ON THE SAME WORLD. `process.ppid` is alive by definition — this process
    // is its child — so the ledger accepts it, and it carries the same world.
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: run,
      type: 'process',
      key: String(process.ppid),
      detail: 'a second process serving the same world',
      world: written.world,
      actor: ACTOR,
    })

    resources.closeRowThatStoppedMatching(row.id, 'default', 'this one ended and the other did not', ACTOR)
    expect(office.worldById(id)?.diedAt, 'the world is still being served, so it has not ended').toBeNull()
  })
})

describe('a test world is never reported to the office a person is using', () => {
  it('says so in words rather than posting to whatever is on the declared port', async () => {
    const written = register.registerThisServer({ workspaceId: 'default', sessionRecordId: aRun(), actor: ACTOR })
    const registered = written.atTheOffice
    if (registered === null) throw new Error('this server registered no world')
    const said = await office.reportThisWorldToTheOffice(registered)
    expect(said.told).toBe(false)
    expect(said.why).toContain('test runner')
  })
})
