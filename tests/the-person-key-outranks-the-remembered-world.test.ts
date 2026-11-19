// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S KEY OUTRANKS THE REMEMBERED WORLD, AND THE OFFICE KNOWS ITS OWN MOVED HOME.
 *
 * OP1, OP2, OP3 and OP6 of design/messages/ONE-PERSON-EVERY-MACHINE-ACCEPTANCE.md. The defect,
 * measured on 22 September 2026: a restore or a move changes a database's identity, the page keeps
 * the world it first met in localStorage and sends it on x-mole-office-home, and the visit check
 * compared that header with this database's identity and nothing else — so every browser that
 * remembered the old world was refused every write in the owner's own installation.
 *
 * THE SEVEN THINGS THIS FILE PROVES, on two databases of one installation:
 *
 *   1. a paired person writes whatever home the page remembers, even with no trusted machine (OP1);
 *   2. a stale home that is this installation's own old home is at home, moved, and the reply names
 *      the world that is home now (OP2);
 *   3. an agent with that same stale home passes as moved (OP2);
 *   4. the event stream's reply names the world that is home now for that stale home, and names none
 *      for a home of another installation, as every other reply does (OP2, and DF28 of
 *      design/window/the-data-folder-move.criteria.md);
 *   5. a terminal's stream does the same: its reply names the world that is home now for that stale
 *      home, and names none for a home of another installation (OP2, and DF28);
 *   6. a home of another installation is still a visitor, warned on a read and refused a write; and
 *   7. the page adopts the home the reply names and sends it on the next request (OP3).
 *
 * THE TWO DATABASES. `freshDb()` makes a throwaway database. `beforeAll` makes the first one, reads
 * its identity and installation, and closes it: that is the home the office had before the move. The
 * file's one database is the home now, and its installation row is set to the first one's, so the two
 * are one installation and the old home is a real database identity rather than an invented string.
 * One office serves every case; each case makes its own records.
 *
 * ONE LISTENING OFFICE FOR THE STREAM CASES. A stream never ends, so a stream case reads it from the
 * office listening on a port, and not through `app.inject`. The office listens once, for the first
 * stream case, and `afterAll` closes it.
 *
 * THE TERMINAL HOLDER. The terminal stream case starts a holder for this file's database, in a place
 * of its own, and stops it when the case ends.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { HOME_HEADER, HOME_MOVED_HEADER, VISIT_WARNING_HEADER } from '../src/config/visit-headers.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aPlace, openThroughTheHolder, startAHolder, stopEverything } from './terminal-holder-stand.ts'

type VisitsLib = typeof import('../src/server/lib/visits.ts')
type OfficeLib = typeof import('../src/server/lib/office.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let app: FastifyInstance
let visits: VisitsLib
let office: OfficeLib
let world: WorldLib
/** The identity of the database this test's office answers from, which is home now. */
let here: string
/** The identity of the database that was home before the move. */
let oldHome: string
/** The installation both test databases belong to. */
let theInstallation: string

/** The person's key, made up for this file. Never the office's real one and never printed. */
const PERSON_KEY = randomBytes(32).toString('hex')
/** A home that belongs to another installation, so it is never read as this office's own. */
const HOME_OF_ANOTHER_INSTALLATION = 'eeeeeeeeeeeeeeee'
/** A home the worlds table has never heard of. */
const A_HOME_NOBODY_KNOWS = 'dddddddddddddddd'
const OTHER_INSTALLATION = 'another-installation'

const WHO = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-au',
  'x-mole-office-workspace': 'default',
}

beforeAll(async () => {
  /**
   * THE OTHER DATABASE OF THE ONE INSTALLATION. It is made and closed here, before any test, so the
   * identity in `oldHome` was a real database the office answered from. Its installation is the one
   * the per-test database is set to below, which is what makes the two one installation.
   */
  const old = await freshDb()
  const words = await import('../src/server/lib/world.ts')
  words.forgetTheWorld()
  const said = words.theWorldThisDatabaseIs()
  if (said === null) throw new Error('the old test database has no identity')
  oldHome = said
  const belonged = words.theInstallationThisDatabaseBelongsTo()
  if (belonged === null || belonged === '') throw new Error('the old test database belongs to no installation')
  theInstallation = belonged
  old.close()
  t = await freshDb()
  // THE PERSON'S KEY BESIDE THE DATABASE. The office reads the one file it makes there, so a key
  // written before the server starts is the key it compares against. `tests/the-row-says-who-the-key-
  // proved.test.ts` is the same shape.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  visits = await import('../src/server/lib/visits.ts')
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  // BOTH DATABASES ARE ONE INSTALLATION, which the old home row below is checked against.
  t.client.sqlite.prepare('UPDATE installation SET id = ? WHERE only_row = 1').run(theInstallation)
  app = (await apiApp()).app
  const thisHome = world.theWorldThisDatabaseIs()
  if (thisHome === null) throw new Error('this test database has no identity')
  here = thisHome
  // THE OLD HOME, CLOSED, exactly as the worlds table holds it after a move, and the foreign home
  // the two visitor cases read, closed for the same reason.
  deadHome(oldHome, theInstallation, 'the office moved to a new database')
  deadHome(HOME_OF_ANOTHER_INSTALLATION, OTHER_INSTALLATION, 'a home of another installation')
})

afterAll(async () => {
  // THE CONNECTIONS THE STREAM CASES LEFT, closed first, so closing the office does not wait for them.
  app.server.closeAllConnections()
  await app.close()
  t.close()
})

/** The address this file's office listens on, once a stream case has made it listen. */
let listening: string | null = null

/**
 * THIS FILE'S OFFICE, LISTENING ON A PORT THE SYSTEM PICKS. A Fastify server listens once only: one that was
 * closed refuses to listen again. So the first stream case makes it listen, and every later one reads the same
 * address.
 */
async function theOfficeListening(): Promise<string> {
  listening ??= await app.listen({ port: 0, host: '127.0.0.1' })
  return listening
}

/** Register a dead home world, which is how the table says a home has moved on. */
function deadHome(databaseIdentity: string, belongsTo: string, because: string): void {
  const made = office.registerWorldHere({
    name: 'a home before the move',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: null,
    head: null,
    databaseIdentity,
    address: null,
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: belongsTo,
  })
  office.closeWorldHere(made.id, because)
}

function aNote(title: string): Record<string, unknown> {
  return { kind: 'note', title, data: { body: `Written to prove "${title}".` } }
}

describe('OP1: the person key outranks the remembered world', () => {
  it('op1: lets a paired person write whatever home the page remembers, and no trusted machine is needed', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: A_HOME_NOBODY_KNOWS, [KEY_HEADER]: PERSON_KEY },
      payload: aNote('a paired person with a home nobody knows'),
    })
    expect(first.statusCode, first.body).toBe(201)

    // THE TRUSTED-MACHINES TABLE PLAYS NO PART. Every trusted machine is removed and the person
    // still passes, because the proof is the key and not the machine.
    t.client.sqlite.prepare('DELETE FROM trusted_machines').run()
    const second = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: A_HOME_NOBODY_KNOWS, [KEY_HEADER]: PERSON_KEY },
      payload: aNote('the same person after every trusted machine was removed'),
    })
    expect(second.statusCode, second.body).toBe(201)
  })
})

describe('OP2: a stale home of this installation is at home, moved', () => {
  it('op2-person: lets a paired person write and names the world that is home now on the reply', async () => {
    const wrote = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: oldHome, [KEY_HEADER]: PERSON_KEY },
      payload: aNote('a paired person whose remembered home moved'),
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
    expect(wrote.headers[HOME_MOVED_HEADER], 'the reply did not name the world that is home now').toBe(here)
  })

  it('op2-agent: lets an agent write whose remembered home is this installation’s old home', async () => {
    const wrote = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: oldHome },
      payload: aNote('an agent whose remembered home moved'),
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
    expect(wrote.headers[HOME_MOVED_HEADER], 'the reply did not name the world that is home now').toBe(here)
  })

  it('op2-stream: the event stream\'s reply names the world that is home now, as every other reply does', async () => {
    // A STREAM NEEDS A LISTENING SERVER. `app.inject` waits for the whole reply, and a stream never ends. So this case
    // reads each stream's headers from this file's own office, listening, and drops the stream.
    const at = await theOfficeListening()
    const streams: AbortController[] = []
    try {
      const aStreamFrom = async (home: string): Promise<Response> => {
        const stop = new AbortController()
        streams.push(stop)
        const opened = await fetch(`${at}/api/events`, {
          headers: { ...WHO, [HOME_HEADER]: home, accept: 'text/event-stream' },
          signal: stop.signal,
        })
        stop.abort()
        return opened
      }
      const moved = await aStreamFrom(oldHome)
      expect(
        moved.headers.get(HOME_MOVED_HEADER),
        `the stream, which answered ${String(moved.status)}, did not name the world that is home now`,
      ).toBe(here)
      const foreign = await aStreamFrom(HOME_OF_ANOTHER_INSTALLATION)
      expect(
        foreign.headers.get(HOME_MOVED_HEADER),
        `the stream, which answered ${String(foreign.status)}, read a home of another installation as this office’s own`,
      ).toBeNull()
    } finally {
      for (const stop of streams) stop.abort()
    }
  }, 300_000)

  it('op2-terminal-stream: a terminal\'s stream names the world that is home now, as every other reply does', async () => {
    // A TERMINAL'S STREAM NEEDS A HOLDER THAT HOLDS A TERMINAL. The holder is this database's, in a place of this
    // case's own, so its socket is never the live one. The office finds the socket through XDG_CONFIG_HOME, which is
    // the place's own for this case and is put back after it.
    const made = aPlace('op2')
    const config = process.env['XDG_CONFIG_HOME']
    process.env['XDG_CONFIG_HOME'] = made.config
    const streams: AbortController[] = []
    try {
      const place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
      await startAHolder(place)
      const terminal = await openThroughTheHolder(place)
      const at = await theOfficeListening()
      // THE PERSON READS IT, WITH THE PERSON'S KEY, so the office answers with the stream and does not refuse. A refusal
      // is an ordinary reply, and it carries the moved-home header whether the stream copies it or not.
      const aStreamFrom = async (home: string): Promise<Response> => {
        const stop = new AbortController()
        streams.push(stop)
        const opened = await fetch(`${at}/api/terminals/${encodeURIComponent(terminal.id)}/stream`, {
          headers: {
            'x-mole-office-actor-type': 'human',
            'x-mole-office-actor-id': THE_PERSON,
            'x-mole-office-workspace': 'default',
            [KEY_HEADER]: PERSON_KEY,
            [HOME_HEADER]: home,
            accept: 'text/event-stream',
          },
          signal: stop.signal,
        })
        stop.abort()
        return opened
      }
      const moved = await aStreamFrom(oldHome)
      expect(
        moved.headers.get(HOME_MOVED_HEADER),
        `the terminal's stream, which answered ${String(moved.status)}, did not name the world that is home now`,
      ).toBe(here)
      expect(moved.status, 'the terminal\'s stream was refused, so the header came on an ordinary reply').toBe(200)
      const foreign = await aStreamFrom(HOME_OF_ANOTHER_INSTALLATION)
      expect(
        foreign.headers.get(HOME_MOVED_HEADER),
        `the terminal's stream, which answered ${String(foreign.status)}, read a home of another installation as this office’s own`,
      ).toBeNull()
      expect(foreign.status, 'the terminal\'s stream was refused for a home of another installation').toBe(200)
    } finally {
      for (const stop of streams) stop.abort()
      await stopEverything()
      if (config === undefined) delete process.env['XDG_CONFIG_HOME']
      else process.env['XDG_CONFIG_HOME'] = config
    }
  }, 300_000)
})

describe('OP2: a home of another installation is still a visitor', () => {
  it('op2-foreign: warns a read and refuses a write for a caller with no person key', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: HOME_OF_ANOTHER_INSTALLATION },
      payload: aNote('a home of another installation'),
    })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.json()).toMatchObject({ code: 'fromAnotherWorldWithNoVisit', values: {} })
    expect(refused.json().error).toContain('/api/office/visits')
    expect(refused.json().error).toContain('x-mole-office-visit')
    expect(refused.headers[HOME_MOVED_HEADER], 'a foreign home was read as this office’s own').toBeUndefined()

    const read = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...WHO, [HOME_HEADER]: HOME_OF_ANOTHER_INSTALLATION },
    })
    expect(read.statusCode).toBe(200)
    expect(read.headers[VISIT_WARNING_HEADER], 'a foreign home was not warned on a read').toBeDefined()
    expect(read.headers[HOME_MOVED_HEADER], 'a foreign home was read as this office’s own').toBeUndefined()
  })

  it('op2-foreign-page: draws one sentence and one press in the page language', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: HOME_OF_ANOTHER_INSTALLATION },
      payload: aNote('a home of another installation'),
    })
    expect(refused.statusCode, refused.body).toBe(403)
    const [{ createElement }, { renderToStaticMarkup }, { readFault }, ui, language, router] = await Promise.all([
      import('react'),
      import('react-dom/server'),
      import('../src/web/api.ts'),
      import('../src/web/components/ui.tsx'),
      import('../src/shared/i18n.ts'),
      import('../src/web/components/router.tsx'),
    ])
    const fault = readFault(403, '/api/records', refused.json())
    try {
      for (const lang of ['en', 'zh'] as const) {
        language.setWordLanguage(lang)
        const html = renderToStaticMarkup(createElement(ui.ErrorNote, { message: fault.message, fault, retry: () => undefined }))
        const text = html.replace(/<[^>]+>/g, ' ')
        expect(text, lang).toContain(language.t('server.fromAnotherWorldWithNoVisit'))
        expect(text, lang).not.toContain('/api/')
        expect(text, lang).not.toContain('x-mole')
        const presses = [...html.matchAll(/<(a|button)\b[^>]*>(.*?)<\/\1>/g)]
        expect(presses.map((one) => one[2]), lang).toEqual([language.t('notPairedHere.press')])
        expect(html, lang).toContain(`href="#${router.pathFor('pairing')}"`)
      }
    } finally {
      language.setWordLanguage('en')
    }
  })
})

describe('OP3: the page adopts the home the reply names', () => {
  it('op3-adopt: overwrites what it remembered and sends the new home on the next request', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const before = (globalThis as { window?: unknown }).window
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    try {
      const page = await import('../src/web/lib/world.ts')
      page.forgetTheWorldOnThisPage()
      page.rememberTheHomeWorld({
        database: oldHome,
        repository: '/somewhere',
        port: '41600',
        head: '905d1df',
        standing: 'canonical',
      })
      expect(page.theWorldThisPageCallsHome(), 'the page did not remember the old home').toBe(oldHome)

      page.adoptTheHomeWorld({ database: here, head: '91ad217' })
      expect(page.theWorldThisPageCallsHome(), 'the page did not adopt the home the reply named').toBe(here)
      expect(page.theHomeMovedOnThisPage(), 'the one plain line was not raised').toBe(true)

      // AND THE NEXT REQUEST CARRIES IT. `moleOfficeHeaders` is the one place every request gets its
      // headers, so the header read off it is what the next request would send.
      const { moleOfficeHeaders } = await import('../src/web/api.ts')
      expect(moleOfficeHeaders().get(HOME_HEADER), 'the next request still carries the old home').toBe(here)
    } finally {
      ;(globalThis as { window?: unknown }).window = before
    }
  })
})

/**
 * THE PICTURES, WHEN A RUN ASKS FOR THEM. `MOVED_HOME_SHOTS` names a directory and the test draws
 * the one line into it at 1440, 990, 660 and 390 in both themes; with the variable unset it is
 * skipped, which is how every ordinary run and the mutation proofs leave it. Chapter 6 rule 1 says
 * the four widths, because the breakpoints at 40rem and 60rem cut the range into three bands, so
 * the middle two are not optional.
 *
 * IT DRIVES THE REAL PAGE, so a browser that outlived a move is real too: this test's own database
 * already holds the old home closed, and the init script writes that old identity into the browser's
 * storage before the page loads. The first reply names the new home, the page adopts it, and the
 * line is drawn.
 */
describe('the one line, photographed', () => {
  it.skipIf(!process.env['MOVED_HOME_SHOTS'])('draws the adopted-home line at four widths in both themes', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['MOVED_HOME_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({
      name: 'wmh-moved-home',
      viewport: { width: 1440, height: 900 },
      workspace: 'default',
      database: t.file,
    })
    try {
      // THE PAGE REMEMBERS THE OLD HOME, exactly as a browser that outlived a move does.
      await live.page.addInitScript((home) => {
        window.localStorage.setItem('mole-office.world.home', JSON.stringify({ database: home, head: null }))
      }, oldHome)
      await live.page.goto(live.site, { timeout: 60_000 })
      await waitForThePage(live.page, 60_000)
      // THE LINE IS DRAWN ONCE THE FIRST REPLY HAS BEEN READ AND THE NEW HOME ADOPTED.
      await live.page.locator('[data-name="the office has moved home"]').waitFor({ timeout: 30_000 })
      const written: string[] = []
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await live.page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
          await live.page.emulateMedia({ colorScheme: theme })
          const picture = `wmh-moved-home-${String(width)}-${theme}.png`
          await live.page.screenshot({ path: `${shots}/${picture}` })
          written.push(picture)
        }
      }
      // THE COUNT IS WHAT MAKES A MISSING WIDTH FAIL LOUDLY. Four widths in two themes is eight
      // pictures; a loop that quietly drops 990 and 660 writes four and goes red here.
      expect(written, 'one picture per drawn width per theme: four widths and two themes is eight').toHaveLength(8)
      expect(written.sort(), 'the four widths in both themes were not all photographed').toEqual([
        'wmh-moved-home-1440-dark.png',
        'wmh-moved-home-1440-light.png',
        'wmh-moved-home-390-dark.png',
        'wmh-moved-home-390-light.png',
        'wmh-moved-home-660-dark.png',
        'wmh-moved-home-660-light.png',
        'wmh-moved-home-990-dark.png',
        'wmh-moved-home-990-light.png',
      ])
    } finally {
      await live.stop()
    }
  }, 300_000)
})

/**
 * THE FOREIGN HOME REFUSAL, WHEN A RUN ASKS FOR PICTURES. The worlds page's AddOne press makes a
 * real write and draws its caught fault through ErrorNote. liveApp's browser context has no default
 * headers or person-key init script, and moleOfficeHeaders sends no person key, so its remembered
 * foreign home is refused.
 */
describe('the foreign home refusal, photographed', () => {
  it.skipIf(!process.env['FOREIGN_HOME_SHOTS'])('draws the worlds-page refusal at four widths in both themes', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['FOREIGN_HOME_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({
      name: 'r55-foreign-home',
      viewport: { width: 1440, height: 900 },
      workspace: 'default',
      database: t.file,
    })
    try {
      // liveApp gives this browser no person key. The only remembered identity below is the foreign home.
      await live.page.addInitScript((home) => {
        window.localStorage.setItem('mole-office.world.home', JSON.stringify({ database: home, head: null }))
      }, HOME_OF_ANOTHER_INSTALLATION)
      const { pathFor } = await import('../src/web/components/router.tsx')
      const address = new URL(live.site)
      address.searchParams.set('lang', 'en')
      address.hash = pathFor('worlds')
      await live.page.goto(address.toString(), { timeout: 60_000 })
      await waitForThePage(live.page, 60_000)

      // AddOne on Worlds is a real page write. It catches this server fault and passes it to ErrorNote.
      const trustedMachines = live.page.locator('.px-panel').filter({ has: live.page.locator('.tm-says') })
      await trustedMachines.locator('button').first().click()
      await live.page.locator('.tm-add input').fill('127.0.0.2')
      await live.page.locator('.tm-acts button').first().click()
      const note = live.page.locator('.tm-add .px-error')
      await note.waitFor({ state: 'visible', timeout: 30_000 })
      const noteText = (await note.innerText()).trim()
      expect(noteText).toContain('This browser is not paired with this office, so nothing was changed.')
      expect(noteText).not.toContain('/api/')
      expect(noteText).not.toContain('x-mole')
      expect(await note.locator('.px-error-act a').allTextContents()).toEqual(['Open the pairing page'])

      const written: string[] = []
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await live.page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
          await live.page.emulateMedia({ colorScheme: theme })
          await live.page.evaluate(() => window.scrollTo(0, 0))
          const picture = `r55-foreign-home-${String(width)}-${theme}.png`
          await live.page.screenshot({ path: `${shots}/${picture}`, fullPage: true })
          written.push(picture)

          const chrome = await live.page.addStyleTag({
            content: '.shell-bar, .px-chat-circle, .ckw { visibility: hidden !important; }',
          })
          try {
            const crop = `r55-foreign-home-note-${String(width)}-${theme}.png`
            await note.screenshot({ path: `${shots}/${crop}` })
            written.push(crop)
          } finally {
            await chrome.evaluate((element) => element.parentNode?.removeChild(element))
          }
          await live.page.evaluate(() => window.scrollTo(0, 0))
        }
      }
      expect(written, 'four widths, two themes, one full page and one note crop per view is sixteen pictures').toHaveLength(16)
      expect(written.sort(), 'the refusal was not photographed at every width and theme').toEqual([
        'r55-foreign-home-1440-dark.png',
        'r55-foreign-home-1440-light.png',
        'r55-foreign-home-390-dark.png',
        'r55-foreign-home-390-light.png',
        'r55-foreign-home-660-dark.png',
        'r55-foreign-home-660-light.png',
        'r55-foreign-home-990-dark.png',
        'r55-foreign-home-990-light.png',
        'r55-foreign-home-note-1440-dark.png',
        'r55-foreign-home-note-1440-light.png',
        'r55-foreign-home-note-390-dark.png',
        'r55-foreign-home-note-390-light.png',
        'r55-foreign-home-note-660-dark.png',
        'r55-foreign-home-note-660-light.png',
        'r55-foreign-home-note-990-dark.png',
        'r55-foreign-home-note-990-light.png',
      ])
    } finally {
      await live.stop()
    }
  }, 300_000)
})
