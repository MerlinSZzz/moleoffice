// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PANEL AND THE RUNTIME PAGE ANSWER "CAN ANOTHER COMPUTER REACH THIS ONE" FROM ONE READING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/access` — which the Settings page's "Other computers" panel draws — and `GET /api/runtime`
 * — which the Runtime page draws — name the same address and list the same machines, because both
 * take them from `addressForOtherMachines` and `clientsFromOtherMachines` rather than working them
 * out separately.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST EXISTS: THE TWO PAGES CONTRADICTED EACH OTHER ON THE OWNER'S OWN MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * Problem `XLES-b1vFBla`, found by the settings survey of 6 September 2026. Read live from the owner's
 * server on 5 September 2026 at 21:07, `GET /api/access` answered `remoteAccess: "off"`,
 * `answersOn: "this machine only"` and `machines: []`. `GET /api/runtime` in the same minute
 * answered `forOtherMachines.host` with the private network's host name for the machine, and listed two machines
 * that had made 2,414 requests between them, the most recent three minutes earlier. `readAccess`
 * read `MOLE_OFFICE_REMOTE_PORT` alone and wrote `machines`, `networkName`, `machinesKeptDays` and
 * `refused` as literals in its own body. One fact worked out in two places, which is the defect
 * CLAUDE.md names at the top of the file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT ASKS THE TWO ROUTES RATHER THAN THE TWO FUNCTIONS
 * ---------------------------------------------------------------------------------------
 *
 * A test that called `addressForOtherMachines` twice would prove a function equals itself. The
 * thing that broke was the WIRING: one route reached the reading and the other did not. So this
 * asks both doors and compares the replies, which is what a person comparing the two pages does.
 *
 * MUTATION: in `src/server/api/access.ts`, pass `forOtherMachines: null` instead of the reading. The
 * first test goes red, on the line where the panel's address is null and the Runtime page's is not.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import type { AccessReply } from '../src/server/lib/access.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { BuiltServer } from '../src/server/index.ts'

/** An address for other machines: a host name under the example domain. */
const ADDRESS = `${THE_TEST_OFFICES_OWNER.id}-desktop.example`

describe('the two pages read one truth about other machines', () => {
  let t: TestDb
  let app: BuiltServer
  let before: string | undefined

  beforeAll(async () => {
    t = await freshDb()
    app = await apiApp()
  }, 60_000)

  afterAll(async () => {
    await app.app.close()
    t.close()
  })

  beforeEach(() => {
    before = process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES
  })

  afterEach(() => {
    if (before === undefined) delete process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES
    else process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = before
    // A CALL FROM ANOTHER MACHINE IS THE ONLY ROW THESE CASES WRITE, and the two readings count
    // them across the whole office, so each case takes away the ones it added. Nothing else in the
    // call log is a call from another machine.
    t.client.sqlite.prepare("DELETE FROM api_calls WHERE client_origin = 'remote'").run()
  })

  /**
   * One request from another machine, written into the call log the way the API writes one.
   *
   * `app.inject()` reaches the product without a socket, so no listener stamps it and it is filed as
   * an in-process call — which is the truth about it. A call from another machine is what this test
   * needs to exist, so it is written as a row rather than pretended into being by a header.
   */
  function aCallFromAnotherMachine(address: string, atMs: number): void {
    t.client.sqlite
      .prepare(
        'INSERT INTO api_calls (id, at_ms, method, status, ms, client_addr, client_origin, identity_source) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(nanoid(), atMs, 'GET', 200, 3.5, address, 'remote', 'header')
  }

  async function bothPages(): Promise<{ access: AccessReply; runtime: RuntimeRecord }> {
    const access = await app.app.inject({ method: 'GET', url: '/api/access' })
    const runtime = await app.app.inject({ method: 'GET', url: '/api/runtime' })
    expect(access.statusCode, access.body).toBe(200)
    expect(runtime.statusCode, runtime.body).toBe(200)
    return { access: access.json<AccessReply>(), runtime: runtime.json<RuntimeRecord>() }
  }

  it('name the same address, and the panel says on, when an address for other machines is set', async () => {
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = ADDRESS
    const { access, runtime } = await bothPages()
    // The Runtime page's own field, which is what it draws under "address other machines reach it at".
    expect(runtime.addresses.forOtherMachines?.host).toBe(ADDRESS)
    // And the panel's, which used to be null here while the line above was not.
    expect(access.machine.addressForOtherMachines).toBe(runtime.addresses.forOtherMachines?.web)
    expect(access.machine.remoteAccess).toBe('listening')
    expect(access.machine.answersOn).toBe('one network')
  })

  it('both say off when no address is set and no second listener is up', async () => {
    // "none" rather than deleting the variable: the setting is read through the merged environment,
    // and a deleted variable lets the checkout's own .env supply an address (the live checkout names
    // one, so this case was red there and green in a worktree that has no .env). "none" is the word
    // that says off explicitly, the same word tests/helpers.ts and the isolated stack use.
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = 'none'
    const { access, runtime } = await bothPages()
    expect(runtime.addresses.forOtherMachines).toBeNull()
    expect(access.machine.addressForOtherMachines).toBeNull()
    expect(access.machine.remoteAccess).toBe('off')
    expect(access.machine.answersOn).toBe('this machine only')
  })

  it('list the same machines, with the same counts and the same last time', async () => {
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = ADDRESS
    aCallFromAnotherMachine('192.0.2.20', Date.now() - 60_000)
    aCallFromAnotherMachine('192.0.2.20', Date.now() - 30_000)
    aCallFromAnotherMachine('192.0.2.10', Date.now() - 10_000)
    const { access, runtime } = await bothPages()
    expect(runtime.fromOtherMachines).toHaveLength(2)
    expect(access.machine.machines).toHaveLength(2)
    // Address for address, count for count, time for time — in the order both readings return.
    expect(access.machine.machines.map((one) => [one.name, one.requests, one.lastSeen])).toEqual(
      runtime.fromOtherMachines.map((one) => [one.address, one.requests, one.lastAt]),
    )
  })

  it('says none yet on the panel exactly when the Runtime page has nobody to list', async () => {
    // THE OTHER DIRECTION, because a panel that said "none yet" whatever the log held would pass
    // the test above by accident: that one only proves the two agree when there is something there.
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = ADDRESS
    const { access, runtime } = await bothPages()
    expect(runtime.fromOtherMachines).toEqual([])
    expect(access.machine.machines).toEqual([])
  })

  it('counts what a caller from another machine was refused, and says none rather than nobody looked', async () => {
    process.env.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES = ADDRESS
    const none = await bothPages()
    expect(none.access.machine.refused).toEqual([])
    t.client.sqlite
      .prepare(
        'INSERT INTO api_calls (id, at_ms, method, status, ms, client_addr, client_origin, identity_source) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(nanoid(), Date.now() - 5_000, 'POST', 403, 1.2, '192.0.2.20', 'remote', 'header')
    const some = await bothPages()
    expect(some.access.machine.refused).toHaveLength(1)
    // The reason is a sentence, never the number: 403 tells a person nothing.
    expect(some.access.machine.refused?.[0]?.reason).toBe('not allowed from another computer')
    expect(some.access.machine.refused?.[0]?.count).toBe(1)
  })
})
