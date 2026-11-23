// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST BROWSER IS MADE THE PERSON IN ONE OF TWO WAYS, AND SAYS WHICH: PAIRED BY THE PRESS WHERE THE OFFICE OFFERS
 * PAIRING, AND CARRYING THE PERSON'S KEY WHERE IT OFFERS NONE.
 *
 * WHAT WAS WRONG. tests/a-fresh-clone-names-nobody.test.ts paired its browser with the pairing press. On a Mac checkout
 * outside the installed app the office finds no program that sent a request, so its press refuses every browser. The
 * file then stopped in its beforeAll, before its first case. `makeTheContextThePerson` in tests/a-paired-context.ts
 * first reads whether the office offers pairing. Where it offers none, the press must still refuse with 403, and the
 * context then carries the person's key in a header.
 *
 * WHAT IS CLAIMED.
 *   1. With the office's own probe on Linux, the office finds any program of this server's user. The function pairs the
 *      context by the press: it answers a header half that is not empty, and the context holds the cookie half.
 *   2. With a Mac checkout's probe, the office finds no program. The function answers that the context carries the
 *      person's key. A page of the context then reads GET /api/office/pairing, and the office answers that it is
 *      paired, which it answers only for a request that carries the person's key.
 *
 * HOW. One office, built in this process and listening on 127.0.0.1, so that its listener stamps each request as from
 * this machine. One chromium, with a context of its own for each case. The probe is swapped with `useOsProbe` and put
 * back after each case. The person's key is read from the office's key file with `thePersonsKeyHeader`.
 *
 * NOTHING HERE RAN ON A MAC. The Mac checkout's probe is the office's own DarwinProbe over a stand-in for ps and lsof,
 * made as tests/the-pairing-sentence-is-true-on-each-system.test.ts makes it. Its lsof finds no connection, and its ps
 * is never asked.
 *
 * NO KEY AND NO HALF IS PRINTED. No assertion quotes the header half, the key, a cookie's value or an answer that holds
 * one of them.
 */
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { chromium, type Browser } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { DEVICE_HALF_COOKIE } from '../src/config/key-header.mjs'
import { makeTheContextThePerson } from './a-paired-context.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

type OsProbe = import('../src/server/lib/resources.ts').OsProbe

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
let theKey: Record<string, string>
let browser: Browser
let res: typeof import('../src/server/lib/resources.ts')
let mac: typeof import('../src/server/lib/darwin-probe.ts')
let macReading: typeof import('../src/config/process-reader.mjs')
let sandbox: typeof import('../src/server/lib/from-a-sandbox.ts')
let before: OsProbe

beforeAll(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // The office made its key file when it was built.
  theKey = thePersonsKeyHeader()
  res = await import('../src/server/lib/resources.ts')
  mac = await import('../src/server/lib/darwin-probe.ts')
  macReading = await import('../src/config/process-reader.mjs')
  sandbox = await import('../src/server/lib/from-a-sandbox.ts')
  before = res.osProbe()
  browser = await chromium.launch()
}, 120_000)

afterEach(() => {
  res.useOsProbe(before)
})

afterAll(async () => {
  await browser.close()
  await app.close()
  t.close()
})

/** A Mac checkout, as tests/the-pairing-sentence-is-true-on-each-system.test.ts has it. */
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

describe('a test browser is made the person, and says which way', () => {
  it('1: is paired by the press where the office finds any program of its user', async () => {
    expect(sandbox.whomThisComputerFinds(), "the office's own probe on Linux").toBe("any program of this server's user")
    const context = await browser.newContext()
    try {
      const made = await makeTheContextThePerson(context, thisMachine, theKey)
      expect(made.way, 'the way the context was made the person').toBe('paired by the press')
      if (made.way !== 'paired by the press') throw new Error('the context was not paired by the press')
      expect(made.headerHalf.length > 0, 'the press answered an empty header half').toBe(true)
      const names = (await context.cookies()).map((cookie) => cookie.name)
      expect(names, 'the names of the cookies the context holds').toContain(DEVICE_HALF_COOKIE)
    } finally {
      await context.close()
    }
  })

  it("2: carries the person's key where the office finds no program, and a page of it is the person", async () => {
    res.useOsProbe(aMacsProbe(A_MAC_CHECKOUT))
    expect(sandbox.whomThisComputerFinds(), "a Mac checkout's probe").toBe('no program')
    const context = await browser.newContext()
    try {
      const made = await makeTheContextThePerson(context, thisMachine, theKey)
      expect(made.way, 'the way the context was made the person').toBe("the person's key")
      const page = await context.newPage()
      const opened = await page.goto(`${thisMachine}/api/office/pairing`)
      if (opened === null) throw new Error('the page opened GET /api/office/pairing and was given no answer')
      expect(opened.status(), 'the status of GET /api/office/pairing, read by a page of the context').toBe(200)
      const read = (await opened.json()) as { paired?: unknown }
      expect(read.paired, 'whether the office reads the page as the person').toBe(true)
    } finally {
      await context.close()
    }
  })
})
