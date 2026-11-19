// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMOTE ACCESS IS OFF, THE PANEL SAYS SO, AND BOTH ARE TRUE BEFORE EITHER CAN BE FALSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * With neither `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` nor `MOLE_OFFICE_REMOTE_PORT` set,
 * `src/server/index.ts` binds `127.0.0.1` and nothing else. So `GET /api/access` answers `off`, and
 * the Settings panel draws *Off* and *Only this computer*. With an address set, it answers `on`,
 * names that address, and lists the machines that have called — the same facts the Runtime page
 * draws, out of the same two readings.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS TESTED IN BOTH DIRECTIONS, BECAUSE A PANEL THAT SAYS OFF TO EVERYBODY SAYS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Every claim here has a second case that makes the opposite drawing appear: a reading with a
 * remote port draws *On*, and a caller from another machine is refused a list of acts while a
 * caller from this one is refused nothing. A reading that answered `off` whatever it was given
 * would pass a one-directional test and would be worth nothing.
 *
 * MUTATION: make `readAccess` report `listening` with no port, which is the plan's own named
 * mutation — *report available: true with nothing listening*. The first test goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import { readAccess, isLoopback, type AccessReply } from '../src/server/lib/access.ts'
import type { RegisteredAct } from '../src/server/lib/authority.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

/** Two routes, one of each reach, so the acts a remote caller is refused are derived from real rows. */
const ROUTES: ApiRoute[] = [
  {
    method: 'POST',
    path: '/api/export',
    operation: 'bundle.export',
    reach: 'local',
    keptHere: { because: 'acts-on-this-machine', act: "Writing the whole archive to this computer's disk" },
  },
  { method: 'GET', path: '/api/records', operation: 'record.list', reach: 'remote' },
]

/**
 * Two registry entries, one carrying an act key and one not, so the governance half is derived from
 * real rows in both directions. A fixture where every entry carried a key could not show that an
 * entry without one contributes nothing.
 */
const GUARDS: RegisteredAct[] = [
  { actKey: 'fork.remove', act: 'delete a proposal nobody has answered', route: 'DELETE /api/records/:id' },
  { actKey: null, act: 'write down how many things are waiting', route: 'POST /api/records · PATCH /api/records/:id' },
]

/**
 * The sources, together, as every reading below hands them over.
 *
 * `machines` and `refusals` are empty rather than absent, and they are required on `AccessInput` for
 * that reason: an empty list is the claim *nobody has called from anywhere else*, and a caller that
 * forgot to look must not make that claim by leaving the field out. The readings that fill them on
 * the real route are `clientsFromOtherMachines` and `refusalsFromOtherMachines`.
 */
const sources = { routes: ROUTES, guards: GUARDS, machines: [], refusals: [] }

/** What the settings reader answers with when an address for other machines is set. */
const ADDRESS = { host: `${THE_TEST_OFFICES_OWNER.id}-desktop.example`, api: `http://${THE_TEST_OFFICES_OWNER.id}-desktop.example:8787`, web: `http://${THE_TEST_OFFICES_OWNER.id}-desktop.example:5173` }

/** Two machines out of the call log, as `clientsFromOtherMachines` returns them. */
const CALLED = [
  { address: '192.0.2.20', requests: 2413, lastAt: '2026-09-05 21:04:57' },
  { address: null, requests: 1, lastAt: '2026-09-05 20:11:02' },
]

let panel: typeof import('../src/web/components/RemoteAccessPanel.tsx')

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  panel = await import('../src/web/components/RemoteAccessPanel.tsx')
})

const draw = (reply: AccessReply, developer = false): string =>
  renderToStaticMarkup(h(panel.AccessRead, { reply, developer } as never))

/** What a reader sees: the markup with its tags and escapes taken out. */
const readable = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

describe('the reading', () => {
  it('says off when nothing is listening for another machine', () => {
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })
    expect(reply.machine.remoteAccess).toBe('off')
    expect(reply.machine.answersOn).toBe('this machine only')
    expect(reply.machine.machines).toEqual([])
  })

  it('says on when a second listener really has a port, which is what makes the line above mean something', () => {
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788, production: true })
    expect(reply.machine.remoteAccess).toBe('listening')
    expect(reply.machine.answersOn).toBe('one network')
  })

  it('says the third state when the port is set and the app comes from another process', () => {
    // NOT A COLLAPSE OF THE OTHER TWO. The setting is on, Mole Office is listening, and another computer
    // still cannot open it — `npm run dev` serves the browser app from Vite, which is deliberately
    // not exposed. Reading this as `off` would hide a real configuration; reading it as `listening`
    // would promise a product that is not there.
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788, production: false })
    expect(reply.machine.remoteAccess).toBe('development')
    expect(reply.machine.answersOn).toBe('this machine only')
  })

  it('keeps all three apart, so no two of them are one drawing', () => {
    const off = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' }).machine.remoteAccess
    const dev = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788 }).machine.remoteAccess
    const on = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788, production: true }).machine
      .remoteAccess
    expect(new Set([off, dev, on]).size).toBe(3)
  })

  it('tells this machine from another one', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopback('192.0.2.5')).toBe(false)
    expect(isLoopback(null)).toBe(false)
  })

  it('reads which door the caller came through, not which address the socket bound', () => {
    // BOTH LISTENERS ARE ON LOOPBACK. That is the whole arrangement, and it means an address cannot
    // tell them apart. This reading derived the answer from the address until wave 15 asked a
    // running server through the second listener and was told `from: "this machine"` and
    // `refusedHere: []` — a remote browser told it could do everything, by a function that looked
    // correct. Both cases below carry the SAME address and differ only in the door.
    const here = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })
    const there = readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' })
    expect(here.caller.from).toBe('this machine')
    expect(there.caller.from).toBe('another machine')
    expect(here.caller.refusedHere).toEqual([])
    expect(there.caller.refusedHere.length).toBeGreaterThan(0)
  })

  it('reports an in-process caller as being on this machine, which is where it is', () => {
    // A DIFFERENT DECISION FROM THE ONE AUTHORITY MAKES ABOUT THE SAME VALUE, and the difference is
    // written out in lib/access.ts. Authority reads undefined as "the rule does not apply". A report
    // of where the caller is has something true to say: a migration runs on this host by definition.
    expect(readAccess({ ...sources, arrival: undefined, address: null }).caller.from).toBe('this machine')
  })

  it('refuses a caller from elsewhere the acts that work on this machine, and refuses this one nothing', () => {
    const here = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })
    expect(here.caller.from).toBe('this machine')
    expect(here.caller.refusedHere).toEqual([])

    const there = readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' })
    expect(there.caller.from).toBe('another machine')
    // ONE FROM EACH SOURCE, and the order is by reason then act. `bundle.export` comes off the
    // route table, `fork.remove` off the guard registry, so a reading that dropped either source
    // fails here rather than looking plausible.
    expect(there.caller.refusedHere.map((one) => one.act)).toEqual(['bundle.export', 'fork.remove'])
    // Derived from the routes' own `reach`, so a `remote` route never lands in it.
    expect(there.caller.refusedHere.map((one) => one.act)).not.toContain('record.list')
    // And a registry entry with no act key contributes nothing, which is what keeps the published
    // list from claiming a refusal the server does not perform.
    expect(there.caller.refusedHere).toHaveLength(2)
  })

  it('carries the routes each act covers, so a browser knows which control to leave undrawn', () => {
    const there = readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' })
    expect(there.caller.refusedHere.find((one) => one.act === 'bundle.export')?.routes).toEqual(['POST /api/export'])
    expect(there.caller.refusedHere.find((one) => one.act === 'fork.remove')?.routes).toEqual([
      'DELETE /api/records/:id',
    ])
  })

  it('says why each act is refused, as a key the browser makes the words from', () => {
    const there = readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' })
    expect(there.caller.refusedHere.map((one) => one.because)).toEqual([
      'acts-on-this-machine',
      'reserved-to-the-owner',
    ])
  })

  it('says the governance half is joined, and the list it says that over holds a registry act', () => {
    const there = readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' })
    expect(there.caller.governanceHalfJoined).toBe(true)
    // THE FLAG IS NOT THE CLAIM. It says true because a guard registry entry is in the list beside
    // it; asserting the flag alone would be asserting a label somebody typed.
    expect(there.caller.refusedHere.map((one) => one.act)).toContain('fork.remove')
  })

  it('says nothing was refused, which is not the same as nobody having looked', () => {
    // BOTH SHAPES ARE STILL HERE AND THEY STILL MEAN DIFFERENT THINGS. `refused` is `[]` because
    // something now looks at the call log and found none; `machinesKeptDays` is null because
    // nothing removes a machine from that list by age, so there is no number to report. An empty
    // list and a null are the fifth invariant's two answers and this reply carries one of each.
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })
    expect(reply.machine.refused).toEqual([])
    expect(reply.machine.machinesKeptDays).toBeNull()
  })

  it('says on, and names the address, when an address for other machines is bound', () => {
    // PROBLEM XLES-b1vFBla. This reading used to answer `off` here, because it asked only about
    // MOLE_OFFICE_REMOTE_PORT. That is the state the owner's own machine was in on 5 September 2026
    // while another computer was making requests through the address below.
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS })
    expect(reply.machine.remoteAccess).toBe('listening')
    expect(reply.machine.answersOn).toBe('one network')
    expect(reply.machine.addressForOtherMachines).toBe(ADDRESS.web)
  })

  it('says on for a bound address even while the app is being worked on, because Vite serves that address too', () => {
    // NOT THE SAME CASE AS THE SECOND LISTENER ABOVE, and the difference is measured rather than
    // assumed: vite.config.ts opens a door on this host, so the browser app really is served there
    // under `npm run dev`. Calling it `development` would tell somebody their other computer cannot
    // open Mole Office while it is opening it.
    const reply = readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS, production: false })
    expect(reply.machine.remoteAccess).toBe('listening')
  })

  it('lists the machines that called, with their counts, and never drops the one that did not say where it was', () => {
    const reply = readAccess({ ...sources, machines: CALLED, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS })
    expect(reply.machine.machines).toHaveLength(2)
    expect(reply.machine.machines[0]).toEqual({ name: '192.0.2.20', requests: 2413, lastSeen: '2026-09-05 21:04:57' })
    // The row with no address is a row, not a hole in the count: the call arrived and what is
    // missing is where from. Dropping it would make the list quietly smaller than the traffic.
    expect(reply.machine.machines[1]?.requests).toBe(1)
    expect(reply.machine.machines[1]?.name).not.toBe('')
  })

  it('carries the refusals it was given, with their counts', () => {
    const reply = readAccess({
      ...sources,
      refusals: [{ reason: 'not allowed from another computer', count: 4, since: '2026-09-05 19:00:00' }],
      arrival: 'this machine',
      address: '127.0.0.1',
      forOtherMachines: ADDRESS,
    })
    expect(reply.machine.refused).toEqual([{ reason: 'not allowed from another computer', count: 4, since: '2026-09-05 19:00:00' }])
  })
})

describe('what the panel draws', () => {
  it('really drew the panel, so a search of an empty string cannot pass quietly', () => {
    expect(readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })))).toContain('Other computers')
  })

  it('says Off and Only this computer, in words a person can read', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })))
    expect(text).toContain('Off')
    expect(text).toContain('Only this computer')
    expect(text).toContain('none yet')
  })

  it('draws On when the reading says on, so Off is a report and not a constant', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788, production: true })))
    expect(text).toContain('On')
    expect(text).not.toContain('Only this computer')
  })

  it('draws the third state as a whole sentence rather than as a word that contradicts itself', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788 })))
    expect(text).toContain('Off while Mole Office is being worked on')
    expect(text).toContain('Run the built app to let them in')
    // And it still says which machines can reach this one, truthfully.
    expect(text).toContain('Only this computer')
  })

  it('keeps every networking word out of that sentence too', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', remotePort: 8788 }))).toLowerCase()
    for (const word of ['vite', 'port', 'proxy', 'bind', 'localhost', 'tailnet']) {
      expect(text, `the development sentence says the machinery word "${word}"`).not.toContain(word)
    }
  })

  it('keeps every networking word out of Normal mode', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' }))).toLowerCase()
    for (const word of ['127.0.0.1', 'loopback', 'bind', 'listener', 'port', 'proxy', 'tailnet', 'socket']) {
      expect(text, `Normal mode says the machinery word "${word}"`).not.toContain(word)
    }
  })

  it('shows the machinery in Developer mode, which is where a mechanism is allowed to be named', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' }), true))
    expect(text).toContain('127.0.0.1')
    expect(text).toContain('this machine')
  })

  it('says every project, in the words remote-access.md puts on this panel', () => {
    expect(readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })))).toContain('Every project')
  })

  it('names the address and lists the machines that called, with how much and when', () => {
    const text = readable(
      draw(readAccess({ ...sources, machines: CALLED, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS })),
    )
    expect(text).toContain('On')
    expect(text).toContain(ADDRESS.web)
    expect(text).toContain('192.0.2.20')
    expect(text).toContain('2413 requests')
    expect(text).toContain('2026-09-05 21:04:57')
    // And the empty-list sentence is gone, because the list is not empty.
    expect(text).not.toContain('none yet')
  })

  it('says trust is arranged in Tailscale, whether the answer is on or off', () => {
    // No list of trusted machines here until Mole Office has its own tokens, and the panel says where the
    // decision is actually made. A person who has not set this up needs that answer as
    // much as one who has, so it is drawn in both states.
    const off = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1' })))
    const on = readable(draw(readAccess({ ...sources, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS })))
    for (const text of [off, on]) {
      expect(text).toContain('Tailscale')
      expect(text).toContain(panel.TRUST_IS_ARRANGED_IN_TAILSCALE)
    }
  })

  it('offers no control that would be a second list of trusted machines', () => {
    // Read-only end to end, which is the decision rather than an omission: a list of trusted
    // machines inside Mole Office could disagree with the tailnet's, and the tailnet's is the one
    // that decides. If somebody puts a control here, this goes red and they read the note above.
    const html = draw(
      readAccess({ ...sources, machines: CALLED, arrival: 'this machine', address: '127.0.0.1', forOtherMachines: ADDRESS }),
      true,
    )
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<textarea')
  })

  it('draws each refused act in words, with why, and with the routes it covers', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' }), true))
    // The words, from the route's own declaration and the registry's own prose -- never the key.
    expect(text).toContain("Writing the whole archive to this computer's disk")
    expect(text).toContain('delete a proposal nobody has answered')
    // The reason, in the one place those three sentences are written.
    expect(text).toContain('This works on the computer Mole Office is running on')
    expect(text).toContain('This is one of the few things Mole Office keeps for you alone')
    // And the routes, because a browser matching on the key alone would hide controls that work.
    expect(text).toContain('POST /api/export')
    expect(text).toContain('DELETE /api/records/:id')
  })

  it('stops saying the list is short, because the acts a person alone may do are in it', () => {
    const text = readable(draw(readAccess({ ...sources, arrival: 'another machine', address: '127.0.0.1' }), true))
    expect(text).not.toContain('are not counted here yet')
  })
})
