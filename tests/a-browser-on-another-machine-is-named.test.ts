// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION R3, FOR THE CALLER THE HUMAN ACT IS ABOUT: A BROWSER, NOT A `curl`.
 *
 * `design/ground/ACCEPTANCE.md` section 7: *the runtime record and the listeners tool name the
 * clients that reached the API from off the machine (address, when, how many requests) without
 * storing anything a person did not do.* Step 5 of the human act written under R5 tells the owner
 * that when they open Mole Office from their other machine, the runtime page will name that machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * It did not. `npm run dev` proxied every `/api/` call the page made to `http://127.0.0.1:<api
 * port>`, so the API saw them arrive on its loopback door and stamped them *this machine*. On
 * 4 September 2026 the seventh verifier held a real page open on the address for other machines
 * through the whole act and the count did not move. Problem `MqQjiJIdjK4a`. Every test of R3 there
 * was called the API with `curl` or with a listener the test had built itself, so nothing failed.
 *
 * The page now calls the API's own door, at the host it was served from —
 * `src/web/lib/api-address.ts` — and this is the test that a real browser doing a real thing is
 * named. It is a browser rather than a `fetch` on purpose: the point of the problem was that a
 * fetch was already named and a browser was not.
 *
 * ---------------------------------------------------------------------------------------
 * `127.0.0.2` STANDS IN FOR THE OTHER MACHINE, AND WHAT IT CANNOT STAND IN FOR
 * ---------------------------------------------------------------------------------------
 *
 * Every Linux machine has the whole of `127.0.0.0/8`, so the stack can be served on a second address
 * with no network and no second machine. What that cannot reproduce is the caller's own address: a
 * connection to `127.0.0.2` from this machine leaves from `127.0.0.1`, because that is the source
 * address the kernel picks for the loopback route, and a browser has no way to ask for another one.
 * So the address the panel names here is `127.0.0.1` and it is the truth — this machine really is
 * what called. On the owner's other computer it will be that computer's address, and that is the human act's job.
 *
 * This test therefore measures the source address rather than typing it, so what it asserts is *the
 * panel names the address the connection really came from* and not a number that happens to be right
 * on one machine.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from 'node:net'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import type { OtherMachineClient, RuntimeRecord } from '../src/shared/runtime.ts'

/** The second address on this machine that the stack is also served on. */
const OTHER_MACHINE = '127.0.0.2'
const head = { 'x-mole-office-workspace': 'default' }

let live: LiveApp
/** Where the browser app and the API answer for the other machine. */
let remoteSite = ''
let remoteApi = ''
/** The address a connection to that door really leaves from, read off a socket rather than assumed. */
let theAddressACallerHere = ''

beforeAll(async () => {
  live = await liveApp({
    name: 'a-browser-on-another-machine',
    viewport: { width: 1280, height: 900 },
    addressForOtherMachines: OTHER_MACHINE,
  })
  remoteSite = `http://${OTHER_MACHINE}:${String(live.webPort)}`
  remoteApi = `http://${OTHER_MACHINE}:${String(live.apiPort)}`
  theAddressACallerHere = await whereAConnectionToThatDoorComesFrom(live.apiPort)
}, 300_000)

afterAll(async () => {
  await live.stop()
})

/**
 * The source address this machine uses for a connection to the door, read from the socket.
 *
 * Measured rather than typed. On this machine it is `127.0.0.1`, because a loopback route's
 * preferred source is the primary address of `lo`; on another machine reaching this one it is that
 * machine's address. Either way it is what the API's socket sees, so it is what the panel must say.
 */
function whereAConnectionToThatDoorComesFrom(port: number): Promise<string> {
  return new Promise((ok, fail) => {
    const socket = connect({ host: OTHER_MACHINE, port }, () => {
      const from = socket.localAddress ?? ''
      socket.destroy()
      if (from === '') fail(new Error('the socket reported no local address'))
      else ok(from)
    })
    socket.once('error', fail)
  })
}

async function runtime(): Promise<RuntimeRecord> {
  const res = await fetch(`${live.api}/api/runtime`, { headers: head })
  expect(res.ok, `GET /api/runtime answered ${String(res.status)}`).toBe(true)
  return (await res.json()) as RuntimeRecord
}

/** The one row for a caller from off this machine, or a failure saying the list was not what it should be. */
async function theOneMachineNamed(): Promise<OtherMachineClient> {
  const record = await runtime()
  expect(
    record.fromOtherMachines,
    'nobody was named as having reached this API from off the machine',
  ).toHaveLength(1)
  return record.fromOtherMachines[0] as OtherMachineClient
}

describe('a browser opened on the address for other machines is named', () => {
  it('serves the page there, and the page comes up', async () => {
    await live.page.goto(`${remoteSite}/#/`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    // The page really drew, rather than merely answering: a page that could not reach its API would
    // be a page with nothing on it, and would name nobody for a reason that is not the one here.
    expect(await live.page.locator('body').innerText()).not.toBe('')
  }, 120_000)

  it('names it, with its address, when, and how many requests', async () => {
    const named = await theOneMachineNamed()
    expect(named.address, 'the panel named an address that is not the one the connection came from').toBe(
      theAddressACallerHere,
    )
    expect(named.requests, 'the page was drawn without a single API call being counted').toBeGreaterThan(0)
    expect(named.firstAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(named.lastAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(named.lastAt >= named.firstAt).toBe(true)
  })

  it('stores nothing else about it, which is the second half of what R3 asks', async () => {
    const named = await theOneMachineNamed()
    // The four R3 names and no fifth. A row that quietly grew a user agent, a path or a page title
    // would be this product keeping a record of what somebody did, which R3 forbids in as many words.
    expect(Object.keys(named).sort()).toEqual(['address', 'firstAt', 'lastAt', 'requests'])
  })

  it('counts, rather than merely holding a number: another visit moves it', async () => {
    const before = await theOneMachineNamed()
    await live.page.goto(`${remoteSite}/?again=1#/`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    const after = await theOneMachineNamed()
    expect(after.requests, 'the count did not move when the page asked again').toBeGreaterThan(before.requests)
    expect(after.lastAt >= before.lastAt).toBe(true)
    // And still one caller: a second visit from the same place is the same machine.
    expect(after.address).toBe(before.address)
  }, 120_000)

  it('is the same world as the page on loopback, read over the other address', async () => {
    // R1's last clause, and the reason the count above is worth anything: it is one Mole Office being
    // reached two ways, not two.
    const here = await fetch(`${live.api}/api/health`, { headers: head })
    const there = await fetch(`${remoteApi}/api/health`, { headers: head })
    expect(there.ok).toBe(true)
    expect(there.headers.get('x-mole-office-world')).toBe(here.headers.get('x-mole-office-world'))
  })

  it('does not count the page on 127.0.0.1 as having come from anywhere else', async () => {
    await live.page.goto(`${live.site}/#/`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    const record = await runtime()
    // Still one, and it is the remote one. A local page counted here would make the panel useless:
    // its whole job is to say somebody else reached this machine.
    expect(record.fromOtherMachines).toHaveLength(1)
  }, 120_000)
})
