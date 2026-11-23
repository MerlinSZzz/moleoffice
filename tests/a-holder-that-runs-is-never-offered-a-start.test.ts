// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOLDER THAT RUNS IS NEVER OFFERED A START, AND AN AGENT'S PAGE SAYS WHAT IS TRUE OF ITS NEWEST RUN. Wave 13u,
 * round 109 (REQUIREMENTS.md item 37).
 *
 * On 27 October 2026 the owner opened an agent's page to bring the agent back. Twice the page's read of the terminal
 * holder ran out after one second while the holder was running and had answered: the server was busy with other
 * requests, and its timer fired before it read the answer that was waiting. The page then said the holder did not answer,
 * that terminals had ended, and offered only "Start the terminal holder". The press did nothing, because a holder that
 * runs is left as it is, and the page did not even read the list again. At the first visit the page was also in another
 * project than the agent's runs, so its pane, steps and way back each answered 404, and the steps were asked again
 * every two seconds.
 *
 *   1. askTheHolder (src/config/the-terminal-holder.mjs) counts only the time the asking process was free to read: an
 *      answer that waits while the process is held for 1.5 s is read within a wait of one second.
 *   2. A holder that never answers is still refused as silent, after about one second.
 *   3. GET /api/terminals, on a scratch server that is stopped for 1.5 s while it waits for the holder's hello, says the
 *      holder runs.
 *   4. On the agent's page, a holder that runs and does not answer in time: the Terminals panel says it is running and
 *      that nothing has ended, offers Look again and no start, and Look again reads the list again. A program that
 *      answers as another office's holder is offered no start either.
 *   5. No holder runs: the start press is offered. When a holder runs by the time it is pressed, the page reads the list
 *      again and shows the agent's terminals, and says that an agent started in a terminal the person opened is not
 *      listed there.
 *   6. The agent's newest run is filed in another project: its pane and its way back each say so and name that project,
 *      with a press that shows the page there, and the steps are not asked again. After the press, the pane panel
 *      answers about the run.
 *
 * MUTATIONS (each after a control run; the commit message has the runs).
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Locator, Page } from 'playwright'
import { askTheHolder, THE_HOLDER_PROTOCOL } from '../src/config/the-terminal-holder.mjs'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { AS_THE_PERSON, aPlace, ask, startAServer, stopEverything, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'

const t = createI18n('en').t
/** A word this round adds, read by its key before the word list has it. */
const aNewWord = t as unknown as (key: string, values?: Record<string, unknown>) => string

/** Hold this whole process for `ms`, as a server busy with another request is held. Nothing in it runs meanwhile. */
function holdThisProcess(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** What a stand-in holder does with each request. */
type Mode = 'answers' | 'silent' | 'another office' | 'stops the asker' | 'answers and holds this process'

interface StandIn {
  mode: Mode
  stop: () => Promise<void>
}

/**
 * A stand-in holder on a socket. It answers hello as this place's holder and every other request with no terminals. In
 * 'stops the asker' it stops the scratch server for 1.5 s on the next hello and answers 300 ms after it goes on. In
 * 'answers and holds this process' it answers and then holds this process for 1.5 s, so an asker in this process has
 * its answer waiting and cannot read it.
 */
async function aStandIn(socketPath: string, database: string, mode: Mode, asker: () => number | null = () => null): Promise<StandIn> {
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 })
  const held = new Set<Socket>()
  const standIn: StandIn = { mode, stop: async () => undefined }
  const server: Server = createServer((socket) => {
    held.add(socket)
    socket.once('close', () => held.delete(socket))
    // An answer written after the asker gave up meets a closed socket, which is not this test's failure.
    socket.on('error', () => undefined)
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      pending += chunk
      const newline = pending.indexOf('\n')
      if (newline < 0) return
      const request = JSON.parse(pending.slice(0, newline)) as Record<string, unknown>
      pending = ''
      if (standIn.mode === 'silent') return
      const answer =
        request['op'] === 'hello'
          ? { ok: true, id: request['id'], protocol: THE_HOLDER_PROTOCOL, pid: process.pid, startedAt: null, database: standIn.mode === 'another office' ? join(dirname(database), 'another-office.db') : database }
          : { ok: true, id: request['id'], terminals: [] }
      const pid = asker()
      if (standIn.mode === 'stops the asker' && request['op'] === 'hello' && pid !== null) {
        standIn.mode = 'answers'
        process.kill(pid, 'SIGSTOP')
        setTimeout(() => {
          process.kill(pid, 'SIGCONT')
          setTimeout(() => socket.write(`${JSON.stringify(answer)}\n`), 300)
        }, 1_500)
        return
      }
      socket.write(`${JSON.stringify(answer)}\n`)
      if (standIn.mode === 'answers and holds this process') holdThisProcess(1_500)
    })
  })
  await new Promise<void>((done) => server.listen(socketPath, () => done()))
  standIn.stop = async () => {
    const closed = new Promise<void>((done) => server.close(() => done()))
    for (const socket of held) socket.destroy()
    await closed
  }
  return standIn
}

let place: Place
/** The page's stack. It starts before the scratch server, which is told its web port. */
let app: LiveApp | null = null
let server: ScratchServer | null = null
let standIn: StandIn | null = null
let personsKey: Record<string, string> = {}

/** The scratch server's process while a case may stop it, so it is always let go on. */
let mayBeStopped: number | null = null

beforeAll(async () => {
  place = aPlace('runs')
  // THE PAGE FIRST, SO THE SCRATCH SERVER CAN BE TOLD ITS PORT. The page is on the liveApp's web port and its calls
  // go to the scratch server, which refuses a page on a loopback port that is not its own unless it is told that
  // port is its dev page's.
  app = await liveApp({ name: 'holder-runs', viewport: { width: 1440, height: 900 }, database: join(place.dir, 'page.db') })
  server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_WEB_PORT: String(app.webPort) })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
}, 300_000)

afterAll(async () => {
  try {
    if (mayBeStopped !== null) process.kill(mayBeStopped, 'SIGCONT')
    await standIn?.stop()
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 120_000)

function theServer(): ScratchServer {
  if (server === null) throw new Error('No scratch server.')
  return server
}

function theApp(): LiveApp {
  if (app === null) throw new Error("No page's stack.")
  return app
}

/** Put a stand-in on the place's socket in this mode, or none at all. */
async function theHolderIs(mode: Mode | 'not running'): Promise<void> {
  await standIn?.stop()
  standIn = null
  if (mode === 'not running') return
  standIn = await aStandIn(place.socket, place.database, mode, () => mayBeStopped)
}

describe('the read of a holder that runs', () => {
  it('1: askTheHolder reads an answer that waited while the asking process was held', async () => {
    const asker = aPlace('held')
    // THE ANSWER IS WRITTEN, AND THEN THIS PROCESS IS HELD before it can read it, as a busy server is.
    const own = await aStandIn(asker.socket, asker.database, 'answers and holds this process')
    try {
      const answer = await askTheHolder(asker.socket, { op: 'hello' }, 1_000)
      expect(answer.ok).toBe(true)
      expect(answer['pid']).toBe(process.pid)
    } finally {
      await own.stop()
    }
  }, 30_000)

  it('2: a holder that never answers is still refused as silent, after about one second', async () => {
    const asker = aPlace('never')
    const own = await aStandIn(asker.socket, asker.database, 'silent')
    try {
      const started = performance.now()
      const refused = await askTheHolder(asker.socket, { op: 'hello' }, 1_000).then(
        () => null,
        (err: unknown) => err as Error & { code?: string },
      )
      const ms = performance.now() - started
      expect(refused?.code).toBe('silent')
      expect(refused?.message).toContain('did not answer within 1 second.')
      expect(ms, `the refusal came after ${String(Math.round(ms))} ms`).toBeGreaterThanOrEqual(950)
      expect(ms, `the refusal came after ${String(Math.round(ms))} ms`).toBeLessThan(2_500)
    } finally {
      await own.stop()
    }
  }, 30_000)

  it('3: GET /api/terminals says the holder runs when the server was stopped while it waited for the hello', async () => {
    await theHolderIs('answers')
    await ask(theServer().api, '/api/health')
    expect(((await ask(theServer().api, '/api/terminals')).body['holder'] as { state?: string }).state).toBe('running')
    mayBeStopped = theServer().pid
    if (standIn !== null) standIn.mode = 'stops the asker'
    const listed = await ask(theServer().api, '/api/terminals')
    mayBeStopped = null
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body['holder'], JSON.stringify(listed.body)).toMatchObject({ state: 'running' })
    expect(listed.body['terminals']).toEqual([])
  }, 60_000)
})

describe("an agent's page", () => {
  let context: BrowserContext | null = null
  let page: Page | null = null
  /** The path of every request the page sent, in order. */
  const sent: string[] = []
  const ANOTHER_PROJECT = 'another-project'
  const ANOTHER_PROJECTS_NAME = 'Made-up other project'
  /** Each agent's id by its handle: the page asks its parts' doors by the id. */
  const idOf = new Map<string, string>()

  async function register(handle: string): Promise<void> {
    const registered = await ask(theServer().api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    idOf.set(handle, (registered.body as { agent: { id: string } }).agent.id)
  }

  beforeAll(async () => {
    await register('runs-here')
    await register('runs-there')
    const made = await ask(theServer().api, '/api/workspaces', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { id: ANOTHER_PROJECT, title: ANOTHER_PROJECTS_NAME } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const work = join(place.dir, 'w')
    mkdirSync(work, { recursive: true })
    const filed = await ask(theServer().api, '/api/records', {
      method: 'POST',
      headers: { ...AS_THE_PERSON, ...personsKey, 'x-mole-office-workspace': ANOTHER_PROJECT },
      body: {
        kind: 'session',
        title: 'Test run filed in another project',
        data: { state: 'running', servingAgent: 'runs-there', runtime: 'claude-code', providerSession: randomUUID(), workingDirectory: work },
      },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    context = await theApp().browser.newContext({ viewport: { width: 1440, height: 900 } })
    const thePagesApiPort = String(theApp().apiPort)
    const theScratchPort = String(theServer().port)
    await context.route(
      (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
      (route) => {
        const to = new URL(route.request().url())
        to.port = theScratchPort
        return route.continue({ url: to.toString() })
      },
    )
    page = await context.newPage()
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) sent.push(`${request.method()} ${url.pathname}`)
    })
  }, 300_000)

  afterAll(async () => {
    await context?.close()
  }, 120_000)

  function thePage(): Page {
    if (page === null) throw new Error('No page.')
    return page
  }

  async function visit(handle: string): Promise<void> {
    const on = thePage()
    await on.goto('about:blank')
    await on.goto(`${app?.site ?? ''}/?mode=normal#/who/agent/${handle}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForThePage(on, 60_000)
  }

  /** The panel titled so. */
  function thePanel(title: string): Locator {
    return thePage().locator('section.px-panel').filter({ has: thePage().locator('.px-panel-head', { hasText: title }) })
  }

  const theTerminalsPanel = (): Locator => thePanel(t('terminals.profile.heading'))
  const asked = (line: string): number => sent.filter((one) => one === line).length

  it('4: a holder that runs and answers late is offered Look again and no start, and says nothing ended', async () => {
    await theHolderIs('silent')
    await visit('runs-here')
    const panel = theTerminalsPanel()
    const headline = panel.locator('.tm-holder-headline')
    await headline.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await headline.innerText()).toBe(t('terminals.holder.noAnswer', { n: 1 }))
    expect(t('terminals.holder.noAnswer', { n: 1 })).toContain('Nothing has ended.')
    expect(await panel.getByRole('button', { name: t('terminals.holder.start') }).count()).toBe(0)
    const before = asked('GET /api/terminals')
    await theHolderIs('answers')
    await panel.getByRole('button', { name: t('agentLive.terminal.lookAgain') }).click()
    expect(await until(async () => asked('GET /api/terminals'), (n) => n > before, 15_000), 'the list was not read again').toBeGreaterThan(before)
    await panel.locator('.tm-prof-sub').first().waitFor({ state: 'visible', timeout: 15_000 })

    // A PROGRAM THAT ANSWERS AS ANOTHER OFFICE'S HOLDER is not one a start can help either.
    await theHolderIs('another office')
    await visit('runs-here')
    await headline.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await headline.innerText()).toBe(t('terminals.holder.unusable'))
    expect(await panel.getByRole('button', { name: t('terminals.holder.start') }).count()).toBe(0)
  }, 180_000)

  it('5: a start pressed when a holder already runs reads the list again, which says what it does not hold', async () => {
    await theHolderIs('not running')
    await visit('runs-here')
    const panel = theTerminalsPanel()
    await panel.locator('.tm-holder-headline').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await panel.locator('.tm-holder-headline').innerText()).toBe(t('terminals.holder.notRunning'))
    const start = panel.getByRole('button', { name: t('terminals.holder.start') })
    expect(await start.count()).toBe(1)
    // A HOLDER COMES UP BEFORE THE PRESS, so the start door leaves it as it is and answers that it started none.
    await theHolderIs('answers')
    const before = asked('GET /api/terminals')
    await start.click()
    expect(await until(async () => asked('GET /api/terminals'), (n) => n > before, 15_000), 'the list was not read again').toBeGreaterThan(before)
    await panel.locator('.tm-prof-sub').first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await panel.locator('.tm-holder-headline').count()).toBe(0)
    expect(t('terminals.profile.notListed')).toContain('a terminal you opened yourself')
    expect(await panel.innerText()).toContain(t('terminals.profile.notListed'))
  }, 180_000)

  it("6: a newest run filed in another project is said, by the project's name, and its steps are not asked again", async () => {
    await theHolderIs('answers')
    await visit('runs-there')
    const there = aNewWord('agentLive.elsewhere', { project: ANOTHER_PROJECTS_NAME })
    const press = aNewWord('agentLive.elsewhere.press', { project: ANOTHER_PROJECTS_NAME })
    const pane = thePanel(t('agentLive.terminal.title'))
    const back = thePanel(t('agentLive.back.title'))
    await pane.locator('.al-elsewhere').waitFor({ state: 'visible', timeout: 30_000 })
    for (const panel of [pane, back]) {
      expect(await panel.locator('.al-elsewhere').innerText()).toContain(there)
      expect(await panel.getByRole('button', { name: press }).count()).toBe(1)
      expect(await panel.innerText()).not.toContain(t('error.openingThere').trim())
    }
    // THE STEPS ARE NOT ASKED AGAIN after their door answered 404.
    const steps = `GET /api/terminals/agents/${idOf.get('runs-there') ?? 'none'}/steps`
    expect(await until(async () => asked(steps), (n) => n >= 1, 15_000)).toBeGreaterThanOrEqual(1)
    const before = asked(steps)
    await thePage().waitForTimeout(6_000)
    expect(asked(steps) - before, 'the steps were asked again after a 404').toBe(0)
    expect(await thePanel(t('agentLive.steps.title')).count()).toBe(0)

    // THE PRESS SHOWS THE PAGE IN THAT PROJECT, where the pane panel answers about the run.
    await pane.getByRole('button', { name: press }).click()
    await pane.locator('.al-state').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await pane.locator('.al-state').innerText()).toBe(t('agentLive.pane.notRunning'))
    expect(await pane.locator('.al-elsewhere').count()).toBe(0)
  }, 180_000)
})
