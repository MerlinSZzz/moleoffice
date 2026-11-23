// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS REFUSES THE BROWSER THAT WOULD SHUT ITSELF OUT, AND SAYS WHY. Criterion P83, point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, AND THE TRAP IT IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * For one version the key window is the only thing making a browser the person: it sends the
 * person's headers and holds no key. So if that browser presses the close, it is nobody on its next
 * request and only a terminal can put it back. That is the trap owner decision D was written against
 * and the one thing chapter 10 rule 4 says the owner should never need. Problem OgdgFc68y3xq.
 *
 * The press therefore asks for a proof that outlives the window: a key. A caller the window itself
 * proved is refused, the refusal says the three things a person needs — this browser holds no key,
 * closing would shut it out, pair it first — and, most importantly, the window is STILL OPEN
 * afterwards. A refusal that closed the window anyway is exactly the failure this is about.
 *
 * The same door with the person's key presses it, closes the window, and records the moment and the
 * who on the office's one installation row. A confirmed device's key reads as the person's key, so
 * the phone a person paired may press; that is `person-device` in src/server/lib/keys.ts and it is
 * not this file's case.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL LISTENER AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The window is a fact about a request a listener carried: `theKeyWindowCovers` is stamped by the
 * listener's arrival and a caller cannot set it. An injected request is on no socket, so no listener
 * saw it and this rule does not reach it. So this file listens on a port and drives the door with
 * `fetch`, the shape tests/a-caller-cannot-claim-to-be-a-person.test.ts uses, and it opens the
 * product's own second listener the way tests/local-only-routes.test.ts does.
 *
 * THE SECOND LISTENER IS THE BINDING FOR THE PANEL. The press is kept on this machine, so a caller
 * a listener stamped `another machine` cannot press even with the key. The reading the Settings
 * panel draws from must say so, or the panel would offer a press this door refuses. One case below
 * reads `mayPress` through both listeners and presses the door through both, so the page and the
 * door are one answer (invariant 9).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, AFTER A GREEN CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Control on the unmutated tree: this whole file green, and the whole listed set of eleven files green
 * (86 passed, 1 skipped). Then the key clause in src/server/api/visitors.ts was turned off —
 * `if (!aKeyProvesThisCaller(actor))` became `if (false && !aKeyProvesThisCaller(actor))` — and the
 * first case went red: the keyless browser closed the window, so `keyless.open` read false where the
 * test requires true. The later cases went red with it, because a window the mutation closed cannot
 * be closed again. The file was restored from a copy taken before the edit, checked byte-identical by
 * SHA-256 on both sides:
 *   before and after: a72822f8ae68f0c0a09a01cba21f5586b5b68eba2950486547223ff57184d55b
 * The control was green again after the restore.
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURES
 * ---------------------------------------------------------------------------------------
 *
 * The panel is photographed only when `CLOSE_WINDOW_SHOTS` names a directory, the same shape the
 * other photographing tests use, so an ordinary run takes none. It starts its own stack through
 * `liveApp` — no server of the worker's — opens the real Settings page in the browser that holds no
 * key, proves the refused sentence is drawn and no press is, and writes the four widths in both
 * themes into `.logs/`.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, readFileSync } from 'node:fs'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'
import { createI18n } from '../src/shared/i18n.ts'
import { settingsControlWord } from '../src/shared/settings-declaration.ts'

const { t: say } = createI18n('en')

/** The person's headers and no key: exactly the claim the window is about. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * A REGISTERED AGENT, which is refused by the person-only clause. It is registered so the blanket
 * unregistered-writer refusal does not stand in front of the press guard; without that, the guard's
 * own sentence would never arrive (problem ch5j4TKSlm5l).
 */
const A_REGISTERED_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-registered-worker',
}

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on: `app.listen()`, stamped `this machine` by buildApp. */
let thisMachine: string
let anotherMachine: string
let otherMachines: Server

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // AND THE PRODUCT'S OWN SECOND LISTENER, which stamps `another machine`. The press is kept on this
  // machine, so this is the door that proves the reading and the refusal agree on the remote case.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE REGISTERED WORKER THIS FILE PRESSES AS. Registering it makes the press guard, rather than
  // the blanket unregistered-writer refusal, the clause that answers it (problem ch5j4TKSlm5l).
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    // WITH THE OWNER'S KEY, a proved path: a decision makes the close refuse while a live agent holds no proved
    // key, and this worker is live when the press closes the window.
    headers: thePersonWithTheKey(),
    payload: { handle: A_REGISTERED_WORKER['x-mole-office-actor-id'], name: 'A Registered Worker' },
  })
  if (registered.statusCode !== 201) {
    throw new Error(
      `could not register the worker this file presses as: ${String(registered.statusCode)} ${registered.body}`,
    )
  }
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

/**
 * THE PERSON'S KEY, read from the file the office made at first run beside the database.
 *
 * IT IS NEVER PRINTED OR ASSERTED ON. The test sends it and reads the status, which is the whole of
 * what a test may do with a real key.
 */
function thePersonsKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return held.person
}

/** The person's headers WITH the key: the proof that outlives the window the press closes. */
function thePersonWithTheKey(): Record<string, string> {
  return { ...THE_PERSON, 'x-mole-office-key': thePersonsKey() }
}

/** What the reading the panel draws from says, through whichever door asks. */
interface Reading {
  status: number
  open: boolean
  mayPress: boolean
  error: string
}

async function readTheWindow(door: string, headers: Record<string, string>): Promise<Reading> {
  const res = await fetch(`${door}/api/office/key-window`, { headers })
  const body = (await res.json()) as { open?: boolean; mayPress?: boolean; error?: string }
  return { status: res.status, open: body.open === true, mayPress: body.mayPress === true, error: body.error ?? '' }
}

/** Press the close door. Kept on this machine, so the first listener is the one that may. */
async function pressToClose(door: string, headers: Record<string, string>): Promise<{ status: number; error: string }> {
  const res = await fetch(`${door}/api/office/key-window/close`, { method: 'POST', headers })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, error: body.error ?? '' }
}

/** The office's own one installation row, as the press writes it. */
function theWindowRow(): {
  window_closed_at: string | null
  window_closed_by_kind: string | null
  window_closed_by_id: string | null
} {
  return t.client.sqlite
    .prepare(
      'SELECT window_closed_at, window_closed_by_kind, window_closed_by_id FROM installation WHERE only_row = 1',
    )
    .get() as { window_closed_at: string | null; window_closed_by_kind: string | null; window_closed_by_id: string | null }
}

describe('a caller the window proved holds no key and may not shut itself out', () => {
  it('refuses the press, says the three things, does nothing, and leaves the window open', async () => {
    const answer = await pressToClose(thisMachine, THE_PERSON)

    // THE REFUSAL IS 403 AND SAYS WHY, in three ideas a person can act on.
    expect(answer.status, `the keyless browser closed the window: ${answer.error}`).toBe(403)
    expect(answer.error).toContain('holds no key')
    expect(answer.error).toContain('shut this browser out')
    expect(answer.error).toContain('Pair this browser first')
    // AND IT SAYS NOTHING WAS DONE, because a refusal that wrote would be worse than no guard.
    expect(answer.error).toContain('Nothing was done')

    // THE WINDOW IS STILL OPEN. This is the assertion the whole file exists for: a refusal that
    // closed the window anyway would have sprung the trap it was meant to prevent.
    expect(theWindowRow()).toEqual({
      window_closed_at: null,
      window_closed_by_kind: null,
      window_closed_by_id: null,
    })
    const read = await readTheWindow(thisMachine, THE_PERSON)
    expect(read.open, 'the window closed even though the press was refused').toBe(true)
  })

  it('is refused the press by a registered agent for the person-only reason before the key is reached', async () => {
    const answer = await pressToClose(thisMachine, A_REGISTERED_WORKER)
    expect(answer.status, `an agent closed the window: ${answer.error}`).toBe(403)
    // THE AGENT'S REFUSAL NAMES WHO MAY, and is not the browser's sentence. An agent needs the
    // person's authority, not a pairing page, and telling it to pair would send it to the wrong fix.
    expect(answer.error).toContain('The owner does it')
    expect(answer.error).not.toContain('Pair this browser first')
  })
})

describe('the reading the panel draws from is the answer the door enforces', () => {
  it('tells a browser with no key it may not press, and the person with the key that it may', async () => {
    // ON THIS MACHINE, where the press can be made. The keyless browser is the panel's caller.
    const keyless = await readTheWindow(thisMachine, THE_PERSON)
    expect(keyless.status, keyless.error).toBe(200)
    expect(keyless.mayPress, 'the panel would draw a press the door refuses').toBe(false)
    expect(keyless.open).toBe(true)

    const keyed = await readTheWindow(thisMachine, thePersonWithTheKey())
    expect(keyed.status, keyed.error).toBe(200)
    expect(keyed.mayPress, 'the person with the key is not offered the press').toBe(true)
  })

  it('says no to a caller from another machine, because the press is kept on this one', async () => {
    // THE PRESS IS LOCAL. A key does not move the door: through the second listener the close is
    // refused before any handler, and the reading must not offer a press that cannot be made.
    const said = await readTheWindow(anotherMachine, thePersonWithTheKey())
    expect(said.status, said.error).toBe(200)
    expect(said.mayPress, 'the page on another machine would draw a press the door refuses').toBe(false)

    const pressed = await pressToClose(anotherMachine, thePersonWithTheKey())
    expect(pressed.status, `the press was allowed from another machine: ${pressed.error}`).toBe(403)
  })
})

describe('a caller that holds the person’s key presses it', () => {
  it('closes the window, and the installation row records the moment and the who', async () => {
    const answer = await pressToClose(thisMachine, thePersonWithTheKey())
    expect(answer.status, `the person's key was refused the press: ${answer.error}`).toBe(200)

    const row = theWindowRow()
    expect(row.window_closed_at, 'the press recorded no moment').not.toBeNull()
    expect(row.window_closed_by_kind).toBe('person')
    expect(row.window_closed_by_id).toBe(THE_TEST_OFFICES_OWNER.id)

    const read = await readTheWindow(thisMachine, thePersonWithTheKey())
    expect(read.open, 'the window still says it is open after the press').toBe(false)
  })
})

/**
 * AND THE PANEL A PAIRED BROWSER IS DRAWN: the sentence before the press, and the press. Keys wave
 * piece 6a changed that sentence, because the window now covers an agent's name as well as the owner's; this
 * photographs it at the four widths chapter 6 names, in both themes. The browser pairs itself through
 * the product's own loopback press first, so the page offers it the press.
 */
describe('the panel a paired browser is drawn', () => {
  it.skipIf(!process.env['KEY_WINDOW_OPEN_SHOTS'])(
    'photographs the press at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['KEY_WINDOW_OPEN_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'p83-press-open-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
      })
      try {
        // THE PRODUCT'S OWN PAIRING PRESS, on the pairing page, as the owner would make it.
        await live.page.goto(`${live.site}/#/pairing`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.getByRole('button', { name: 'Pair this browser' }).click()
        await live.page.waitForTimeout(1000)
        await live.page.goto(`${live.site}/?mode=inspect#/settings`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        const panel = live.page.locator('.px-panel[data-target="uiSurface/settings.headeronly"]')
        const press = say(settingsControlWord('settings.headeronly', 'settingsPanel.window.press'))
        await panel.getByRole('button', { name: press, exact: true }).waitFor({ timeout: 30_000 })
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await panel.screenshot({ path: `${shots}/p83-press-open-${String(width)}-${theme}.png` })
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})

describe('the panel a browser that cannot press is drawn', () => {
  it.skipIf(!process.env['CLOSE_WINDOW_SHOTS'])(
    'photographs the refused sentence and no press at 1440, 1024, 768 and 390 in both themes',
    async () => {
      const shots = process.env['CLOSE_WINDOW_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'p83-press-refused-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
      })
      try {
        // THE BROWSER HOLDS NO KEY, which is the whole point of the picture. It reads the Settings
        // page through the product's own page and sends the person's name and nothing else.
        await live.page.goto(`${live.site}/?mode=inspect#/settings`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.waitForSelector('.ctw-refused', { timeout: 30_000 })

        // THE PICTURE IS OF THE REFUSAL AND NOT THE PRESS: the sentence is drawn and no button is.
        const panel = live.page.locator('.px-panel[data-target="uiSurface/settings.headeronly"]')
        const drawn = await panel.innerHTML()
        expect(drawn, 'the refusal is not drawn').toContain(say('settingsPanel.window.noKeyHere'))
        // AND NO BUTTON AT ALL, so nothing that looks live can fail the way the door refuses.
        expect(drawn, 'a button a person can press is drawn').not.toContain('<button')

        for (const width of [1440, 1024, 768, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await panel.screenshot({
              path: `${shots}/p83-press-refused-${String(width)}-${theme}.png`,
            })
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
