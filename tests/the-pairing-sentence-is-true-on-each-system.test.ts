// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE ABOUT PAIRING IS TRUE ON EACH SYSTEM.
 *
 * Wave 13t, round W32, item 3. A keyless request from this computer that the office does not answer is told how the
 * person pairs. Which program on this computer may pair with one press depends on the system the office runs on:
 *
 *   - Where the office asks the system for any program of its own user (Linux), a browser on this computer pairs.
 *   - Inside the installed Mac or Windows app, only the app's own window is found, so only the window pairs. A browser
 *     on this computer is shown the press, because the page cannot tell which program it runs in, and is refused when
 *     it presses.
 *   - Anywhere else, no program on this computer is found, so nothing pairs with one press.
 *
 * Three places say it: the refusal's way on, the pairing press's own refusal, and whether GET /api/office/pairing
 * offers the press. All three are read from one fact the probe declares (`whomThisComputerFinds` in
 * lib/from-a-sandbox.ts), so this file drives each system's probe through a real listener and holds the three
 * places to that fact and to each other.
 *
 * TWO MORE SENTENCES READ THE SAME FACT. Round W33 added these cases:
 *
 *   P1 a keyless claim to be the person that did not count because of who sent it ends with how the person acts on
 *      this system. Only where a browser can pair does it name the person's own browser;
 *   P2 a press at the ask door (POST /api/office/pairing/ask) from the office's own computer is refused, and is
 *      told what can be paired directly on the machine that runs the office. Only where a browser can pair does it
 *      say a browser can.
 *
 * THE MUTATION, run after a control and then restored, is listed in the commit message that added the code and in
 * the round's report.
 *
 * NOTHING HERE RAN ON WINDOWS OR ON A MAC. The Windows probe reads a stand-in for PowerShell, and the Mac's probe a
 * stand-in for lsof, and each finds no connection.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { WhatACommandDid } from '../src/config/process-reader.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type OsProbe = import('../src/server/lib/resources.ts').OsProbe

/** The person's headers and no key, as a page sends them before it is paired. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The installed Windows folder, and the office in it, as tests/the-windows-window-is-the-person.test.ts has them. */
const APP = 'C:\\Users\\someone\\AppData\\Local\\Programs\\Mole Office'
const INSTALLED = { from: 'bundle' as const, root: `${APP}\\resources\\office/` }
const A_CHECKOUT = { from: 'checkout' as const, root: 'C:\\Users\\someone\\mole-office\\' }

/** PowerShell, stood in, both ways: the script about a connection finds no row for it. */
function noRows(script: string): WhatACommandDid {
  if (!script.includes('Get-NetTCPConnection')) {
    throw new Error(`This stand-in for PowerShell does not know the script that begins ${JSON.stringify(script.slice(0, 160))}.`)
  }
  return { command: 'powershell.exe', ran: true, status: 0, stdout: `${JSON.stringify({ Before: [], Holders: [], Server: null, After: [] })}\r\n`, stderr: '' }
}
const commands = { powershell: noRows, startPowerShell: async (script: string) => noRows(script) }

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
let otherMachines: Server
let anotherMachine = ''
let res: typeof import('../src/server/lib/resources.ts')
let windows: typeof import('../src/server/lib/windows-probe.ts')
let reading: typeof import('../src/config/systems/windows-processes.mjs')
let mac: typeof import('../src/server/lib/darwin-probe.ts')
let macReading: typeof import('../src/config/process-reader.mjs')
let sandbox: typeof import('../src/server/lib/from-a-sandbox.ts')
let notProved: typeof import('../src/server/lib/not-proved-the-person.ts')
let before: OsProbe

beforeAll(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE PRODUCT'S OWN SECOND LISTENER, which stamps `another machine`.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
  res = await import('../src/server/lib/resources.ts')
  windows = await import('../src/server/lib/windows-probe.ts')
  reading = await import('../src/config/systems/windows-processes.mjs')
  mac = await import('../src/server/lib/darwin-probe.ts')
  macReading = await import('../src/config/process-reader.mjs')
  sandbox = await import('../src/server/lib/from-a-sandbox.ts')
  notProved = await import('../src/server/lib/not-proved-the-person.ts')
  before = res.osProbe()
}, 120_000)

afterEach(() => {
  res.useOsProbe(before)
})

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
})

/** A Windows probe over the stand-in, for the install given. Its borrowed half is never asked here. */
function aWindowsProbe(install: { from: 'bundle' | 'checkout'; root: string }): OsProbe {
  return new windows.WindowsProbe(res.LINUX_PROBE as never, reading.windowsProcessReader(commands), commands, install)
}

/** The installed Mac app, and the office in it, as tests/a-mac-counts-only-its-own-window-as-the-person.test.ts has them. */
const MAC_APP = '/Applications/Mole Office.app/Contents'
const MAC_INSTALLED = { from: 'bundle' as const, root: `${MAC_APP}/Resources/office` }
const A_MAC_CHECKOUT = { from: 'checkout' as const, root: '/srv/someone/mole-office' }

/** A Mac's probe for the install given, over an lsof that finds no connection. Nothing else of it is asked here. */
function aMacsProbe(install: { from: 'bundle' | 'checkout'; root: string }): OsProbe {
  const reader = macReading.darwinProcessReader({
    ps: (args) => {
      throw new Error(`This stand-in for ps was not meant to be asked, and was asked: ps ${args.join(' ')}`)
    },
    lsof: () => ({ command: 'lsof', ran: true, status: 1, stdout: '', stderr: '' }),
  })
  return new mac.DarwinProbe(res.LINUX_PROBE as never, reader, install)
}

/**
 * THE SYSTEMS, each with a probe whose answer about the sender is "not found", so that each place that speaks
 * of pairing is reached. Linux's probe is the real one with that one answer changed.
 */
function theSystems(): { system: string; probe: OsProbe; finds: string; offered: boolean }[] {
  return [
    {
      system: 'Linux',
      probe: Object.assign(Object.create(res.LINUX_PROBE) as OsProbe, { senderOfAConnection: () => null }),
      finds: "any program of this server's user",
      offered: true,
    },
    { system: 'the installed Windows app', probe: aWindowsProbe(INSTALLED), finds: "only the installed app's own window", offered: true },
    { system: 'Windows from a checkout', probe: aWindowsProbe(A_CHECKOUT), finds: 'no program', offered: false },
    { system: 'the installed Mac app', probe: aMacsProbe(MAC_INSTALLED), finds: "only the installed app's own window", offered: true },
    { system: 'a Mac from a checkout', probe: aMacsProbe(A_MAC_CHECKOUT), finds: 'no program', offered: false },
  ]
}

/** One request from this computer, on a connection of its own, answered with its status and body. */
async function send(method: string, path: string): Promise<{ status: number; body: { error?: string; offered?: boolean } }> {
  const answer = await fetch(`${thisMachine}${path}`, { method, headers: { ...THE_PERSON, connection: 'close' } })
  return { status: answer.status, body: (await answer.json()) as { error?: string; offered?: boolean } }
}

const THE_BROWSER_SENTENCE = "A browser on this computer gets the person's key at #/pairing, with one press."

describe('the sentence about pairing, on each system', () => {
  it('is read from the one fact the probe declares', () => {
    for (const { system, probe, finds } of theSystems()) {
      expect(sandbox.whomThisComputerFinds(probe), system).toBe(finds)
    }
  })

  it('names the browser only where a browser can pair, in the refusal and at the pairing press, and the press is offered only where something can pair', async () => {
    for (const { system, probe, finds, offered } of theSystems()) {
      res.useOsProbe(probe)
      const way = notProved.theWayToPairOnThisComputer()

      // THE REFUSAL'S WAY ON. A read the person's page makes, refused because nothing found the sender.
      const refused = await send('GET', '/api/waiting')
      expect(refused.status, `${system}: a keyless read from a program nobody found was answered`).toBe(403)
      expect(refused.body.error, system).toContain(way.pairHere)
      if (finds === "any program of this server's user") {
        expect(way.pairHere, system).toBe(THE_BROWSER_SENTENCE)
      } else {
        expect(refused.body.error, `${system}: the refusal says a browser on this computer pairs`).not.toContain(THE_BROWSER_SENTENCE)
      }
      if (finds === "only the installed app's own window") expect(way.pairHere, system).toContain('Mole Office window')
      if (finds === 'no program') expect(way.pairHere, `${system}: the refusal sends the reader to a press that cannot work`).not.toContain('#/pairing')

      // THE PRESS'S OWN REFUSAL ENDS WITH WHO PAIRS ON THIS SYSTEM.
      const pressed = await send('POST', '/api/office/pairing')
      expect(pressed.status, `${system}: a program nobody found was paired`).toBe(403)
      expect(pressed.body.error?.endsWith(way.whoPairs), `${system}: ${pressed.body.error ?? ''}`).toBe(true)
      if (finds === "any program of this server's user") {
        expect(way.whoPairs, system).toBe('The person pairs from their own browser on this computer.')
      }

      // AND THE PRESS IS OFFERED ONLY WHERE SOMETHING ON THIS COMPUTER CAN PAIR.
      const offer = await send('GET', '/api/office/pairing')
      expect(offer.status, system).toBe(200)
      expect(offer.body.offered, `${system}: whether the press is offered`).toBe(offered)
    }
  })

  it('P1: a claim that did not count because of who sent it says how the person acts on this system', () => {
    const fromAProgramNobodyFound = {
      type: 'human',
      id: THE_TEST_OFFICES_OWNER.id,
      sessionId: null,
      from: 'this machine',
      sentFrom: 'a program Mole Office could not find',
    } as never
    for (const { system, probe, finds } of theSystems()) {
      res.useOsProbe(probe)
      const way = notProved.theWayToPairOnThisComputer()
      const said = notProved.theRefusalForSomebodyNotProvedThePerson(notProved.whatThisRequestShowed(fromAProgramNobodyFound, null), {
        refused: 'A test of the refusal',
        nothingWasDone: null,
        whoMay: 'Only the person may do it.',
      })
      expect(typeof way.whoActs, system).toBe('string')
      expect(said, system).toContain(way.whoActs)
      if (finds === "any program of this server's user") {
        expect(way.whoActs, system).toBe('The person acts from their own browser, or with their key.')
      } else {
        expect(said, `${system}: the refusal says the person acts from a browser`).not.toMatch(/browser/u)
      }
      if (finds === "only the installed app's own window") expect(way.whoActs, system).toContain('Mole Office window')
      if (finds === 'no program') expect(way.whoActs, system).toContain('only with their key')
    }
  })

  it('P2: a knock from the office’s own computer is refused, and is told what can be paired directly there', async () => {
    for (const { system, probe, finds } of theSystems()) {
      res.useOsProbe(probe)
      const way = notProved.theWayToPairOnThisComputer()
      const answer = await fetch(`${thisMachine}/api/office/pairing/ask`, {
        method: 'POST',
        headers: { ...THE_PERSON, connection: 'close' },
        body: JSON.stringify({ device: 'A browser on the office’s own computer' }),
      })
      const error = String(((await answer.json()) as { error?: string }).error ?? '')
      expect(answer.status, `${system}: a request from this computer knocked from the ask door`).toBe(403)
      expect(typeof way.onTheOfficesMachine, system).toBe('string')
      expect(error.endsWith(way.onTheOfficesMachine), `${system}: ${error}`).toBe(true)
      if (finds === "any program of this server's user") {
        expect(way.onTheOfficesMachine, system).toMatch(/a browser can be paired directly/u)
      } else {
        expect(error, `${system}: the refusal says a browser there can be paired directly`).not.toMatch(/browser can be paired directly/u)
      }
      if (finds === "only the installed app's own window") expect(way.onTheOfficesMachine, system).toContain('Mole Office window')
      if (finds === 'no program') expect(way.onTheOfficesMachine, system).toContain('nothing can be paired directly')
    }
  })
})
